// Pricing & projection for a *specific simulation run*.
//
// simulate() (./calculate) prices a steady hypothetical month. But a real run
// isn't steady — replicas rise and fall with traffic, so the honest cost is the
// integral of what actually ran. `priceRun` does that. `projectMonthly` then
// extrapolates to a month, but only behind user-tunable variables, because a
// month is genuinely unpredictable: Day 1, Day 2, Day 3 each have different runs.

import type { Scenario } from "./types";
import { estimateLCU } from "./calculate";
import {
  USD_TO_INR,
  CPU_USD_PER_HOUR_BASE,
  RAM_USD_PER_GB_HOUR_BASE,
  EKS_CONTROL_PLANE_USD_PER_HOUR,
  getRegion,
} from "./pricing";
import {
  computeEnergyKWh,
  networkEnergyKWh,
  kWhToKgCO2,
  carKmEquivalent,
} from "./carbon";
import type { TrafficPattern } from "./simulation";

const SECONDS_PER_HOUR = 3600;
const HOURS_PER_MONTH = 730;

/** A snapshot of one simulation run, captured when the user pauses. */
export interface SimRun {
  region: string;
  pattern: TrafficPattern;
  durationSec: number; // simulated seconds elapsed
  totalRequests: number; // ∫ rps dt
  podSeconds: number; // ∫ replicas dt — the real compute footprint
  avgRps: number;
  peakRps: number;
  avgReplicas: number;
  peakReplicas: number;
  peakNodes: number;
  scaleEvents: number;
  pod: { cpu: number; ramGB: number };
  avgRequestKB: number;
  avgResponseKB: number;
  hpa?: { min: number; max: number };
}

export interface RunCost {
  durationHours: number;
  requests: number;
  vcpuHours: number;
  ramGBHours: number;
  egressGB: number;
  computeUSD: number;
  egressUSD: number;
  lbUSD: number;
  controlPlaneUSD: number;
  totalUSD: number;
  totalINR: number;
  perThousandRequestsINR: number;
  carbon: { totalKWh: number; kgCO2: number; carKm: number; gridIntensity: number };
}

function gbFromRequests(requests: number, payloadKB: number): number {
  return (requests * payloadKB * 1024) / (1024 * 1024 * 1024);
}

/** Cost of exactly what ran, over the run's own (simulated) duration. */
export function priceRun(run: SimRun): RunCost {
  const region = getRegion(run.region);
  const durationHours = run.durationSec / SECONDS_PER_HOUR;

  const vcpuHours = (run.pod.cpu * run.podSeconds) / SECONDS_PER_HOUR;
  const ramGBHours = (run.pod.ramGB * run.podSeconds) / SECONDS_PER_HOUR;
  const computeUSD =
    (vcpuHours * CPU_USD_PER_HOUR_BASE + ramGBHours * RAM_USD_PER_GB_HOUR_BASE) *
    region.computeMultiplier;

  const egressGB = gbFromRequests(run.totalRequests, run.avgResponseKB);
  const egressUSD = egressGB * region.egressUSDPerGB;

  const lcu = estimateLCU(run.avgRps, run.avgRequestKB, run.avgResponseKB);
  const lbUSD = (region.albUSDPerHour + lcu * region.albLCUUSDPerHour) * durationHours;
  const controlPlaneUSD = EKS_CONTROL_PLANE_USD_PER_HOUR * durationHours;

  const totalUSD = computeUSD + egressUSD + lbUSD + controlPlaneUSD;
  const totalINR = totalUSD * USD_TO_INR;
  const perThousandRequestsINR =
    run.totalRequests > 0 ? (totalINR / run.totalRequests) * 1000 : 0;

  const computeKWh = computeEnergyKWh(vcpuHours, ramGBHours);
  const networkKWh = networkEnergyKWh(egressGB);
  const totalKWh = computeKWh + networkKWh;
  const kgCO2 = kWhToKgCO2(totalKWh, region.gridIntensity);

  return {
    durationHours,
    requests: run.totalRequests,
    vcpuHours,
    ramGBHours,
    egressGB,
    computeUSD,
    egressUSD,
    lbUSD,
    controlPlaneUSD,
    totalUSD,
    totalINR,
    perThousandRequestsINR,
    carbon: {
      totalKWh,
      kgCO2,
      carKm: carKmEquivalent(kgCO2),
      gridIntensity: region.gridIntensity,
    },
  };
}

/** The variables that make a monthly estimate honest — every one is a guess. */
export interface MonthlyVars {
  /** Hours per day the cluster sees load like this run. */
  activeHoursPerDay: number;
  /** Days in the month this pattern repeats. */
  daysPerMonth: number;
  /** Replicas kept warm during the quiet hours (often the HPA minimum). */
  idleReplicas: number;
}

export interface MonthlyEstimate {
  activeHours: number;
  idleHours: number;
  computeUSD: number;
  egressUSD: number;
  lbUSD: number;
  controlPlaneUSD: number;
  totalUSD: number;
  totalINR: number;
}

export function defaultMonthlyVars(run: SimRun): MonthlyVars {
  return {
    activeHoursPerDay: 8,
    daysPerMonth: 30,
    idleReplicas: run.hpa ? run.hpa.min : Math.max(1, Math.round(run.avgReplicas)),
  };
}

/**
 * Extrapolate a run to a month. Active hours run at this run's *average*
 * footprint; the remaining hours fall back to a warm idle baseline. The control
 * plane bills 24/7. Deliberately a sketch, not a promise.
 */
export function projectMonthly(run: SimRun, vars: MonthlyVars): MonthlyEstimate {
  const region = getRegion(run.region);
  const activeHoursPerDay = clamp(vars.activeHoursPerDay, 0, 24);
  const days = Math.max(0, vars.daysPerMonth);
  const idleReplicas = Math.max(0, vars.idleReplicas);

  const activeHours = activeHoursPerDay * days;
  const idleHours = (24 - activeHoursPerDay) * days;

  const hourlyCompute = (replicas: number) =>
    (run.pod.cpu * replicas * CPU_USD_PER_HOUR_BASE +
      run.pod.ramGB * replicas * RAM_USD_PER_GB_HOUR_BASE) *
    region.computeMultiplier;

  const computeUSD =
    activeHours * hourlyCompute(run.avgReplicas) + idleHours * hourlyCompute(idleReplicas);

  // Egress only meaningfully accrues during active hours, at the run's avg rate.
  const egressPerActiveHour = gbFromRequests(run.avgRps * SECONDS_PER_HOUR, run.avgResponseKB);
  const egressUSD = activeHours * egressPerActiveHour * region.egressUSDPerGB;

  const activeLcu = estimateLCU(run.avgRps, run.avgRequestKB, run.avgResponseKB);
  const lbActiveHourly = region.albUSDPerHour + activeLcu * region.albLCUUSDPerHour;
  const lbUSD = activeHours * lbActiveHourly + idleHours * region.albUSDPerHour;

  const controlPlaneUSD = EKS_CONTROL_PLANE_USD_PER_HOUR * Math.min(HOURS_PER_MONTH, activeHours + idleHours);

  const totalUSD = computeUSD + egressUSD + lbUSD + controlPlaneUSD;

  return {
    activeHours,
    idleHours,
    computeUSD,
    egressUSD,
    lbUSD,
    controlPlaneUSD,
    totalUSD,
    totalINR: totalUSD * USD_TO_INR,
  };
}

/** A steady Scenario standing in for the run's average — for region context views. */
export function deriveScenario(run: SimRun): Scenario {
  return {
    provider: "aws",
    region: run.region,
    requestsPerSecond: Math.max(1, Math.round(run.avgRps)),
    avgRequestKB: run.avgRequestKB,
    avgResponseKB: run.avgResponseKB,
    pod: run.pod,
    replicas: Math.max(1, Math.round(run.avgReplicas)),
    hoursPerMonth: HOURS_PER_MONTH,
  };
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
