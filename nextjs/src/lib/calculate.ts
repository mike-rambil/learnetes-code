import type { Scenario, SimulationResult } from "./types";
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

const SECONDS_PER_HOUR = 3600;

export function simulate(s: Scenario): SimulationResult {
  const region = getRegion(s.region);
  const requestsPerMonth = s.requestsPerSecond * SECONDS_PER_HOUR * s.hoursPerMonth;
  const egressBytes = requestsPerMonth * s.avgResponseKB * 1024;
  const egressGB = egressBytes / (1024 * 1024 * 1024);

  const vcpuHours = s.pod.cpu * s.replicas * s.hoursPerMonth;
  const ramGBHours = s.pod.ramGB * s.replicas * s.hoursPerMonth;

  const computeUSD =
    (vcpuHours * CPU_USD_PER_HOUR_BASE + ramGBHours * RAM_USD_PER_GB_HOUR_BASE) *
    region.computeMultiplier;

  const egressUSD = egressGB * region.egressUSDPerGB;

  const lcuPerHour = estimateLCU(s.requestsPerSecond, s.avgRequestKB, s.avgResponseKB);
  const loadBalancerUSD =
    (region.albUSDPerHour + lcuPerHour * region.albLCUUSDPerHour) * s.hoursPerMonth;

  const controlPlaneUSD = EKS_CONTROL_PLANE_USD_PER_HOUR * s.hoursPerMonth;

  const totalUSD = computeUSD + egressUSD + loadBalancerUSD + controlPlaneUSD;
  const totalINR = totalUSD * USD_TO_INR;
  const perThousandRequestsINR =
    requestsPerMonth > 0 ? (totalINR / requestsPerMonth) * 1000 : 0;

  const computeKWh = computeEnergyKWh(vcpuHours, ramGBHours);
  const networkKWh = networkEnergyKWh(egressGB);
  const totalKWh = computeKWh + networkKWh;
  const kgCO2 = kWhToKgCO2(totalKWh, region.gridIntensity);
  const gCO2PerThousandRequests =
    requestsPerMonth > 0 ? (kgCO2 * 1000 * 1000) / requestsPerMonth : 0;

  return {
    cost: {
      computeUSD,
      egressUSD,
      loadBalancerUSD,
      controlPlaneUSD,
      totalUSD,
      totalINR,
      perThousandRequestsINR,
    },
    carbon: {
      computeKWh,
      networkKWh,
      totalKWh,
      gridIntensity: region.gridIntensity,
      kgCO2,
      gCO2PerThousandRequests,
      carKmEquivalent: carKmEquivalent(kgCO2),
    },
    requestsPerMonth,
    egressGB,
  };
}

export function estimateLCU(rps: number, reqKB: number, resKB: number): number {
  const newConnPerSec = rps;
  const newConnLCU = newConnPerSec / 25;
  const activeConnLCU = rps / 3000;
  const processedBytesGBPerHour =
    ((rps * (reqKB + resKB) * 1024) * SECONDS_PER_HOUR) / (1024 * 1024 * 1024);
  const processedBytesLCU = processedBytesGBPerHour / 1;
  const ruleEvalLCU = 0;
  return Math.max(newConnLCU, activeConnLCU, processedBytesLCU, ruleEvalLCU);
}
