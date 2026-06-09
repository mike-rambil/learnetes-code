import { describe, it, expect } from "vitest";
import {
  priceRun,
  projectMonthly,
  deriveScenario,
  defaultMonthlyVars,
  type SimRun,
} from "../runPricing";

const RUN: SimRun = {
  region: "us-east-1",
  pattern: "ramp",
  durationSec: 3600, // one simulated hour
  totalRequests: 1_000_000,
  podSeconds: 36000, // avg 10 replicas across the hour (10 * 3600)
  avgRps: 278,
  peakRps: 500,
  avgReplicas: 10,
  peakReplicas: 15,
  peakNodes: 4,
  scaleEvents: 6,
  pod: { cpu: 1, ramGB: 2 },
  avgRequestKB: 2,
  avgResponseKB: 50,
  hpa: { min: 3, max: 20 },
};

describe("priceRun", () => {
  it("prices compute from the integral of replicas, not a steady assumption", () => {
    const c = priceRun(RUN);
    // 10 vcpu-hours and 20 ram-GB-hours for the hour.
    expect(c.vcpuHours).toBeCloseTo(10, 5);
    expect(c.ramGBHours).toBeCloseTo(20, 5);
    expect(c.computeUSD).toBeGreaterThan(0);
    expect(c.totalUSD).toBeGreaterThan(c.computeUSD); // egress + lb + control plane add on
    expect(c.carbon.kgCO2).toBeGreaterThan(0);
  });

  it("scales compute with the run's actual pod-seconds", () => {
    const lighter = priceRun({ ...RUN, podSeconds: 18000 }); // half the pods
    const heavier = priceRun(RUN);
    expect(lighter.computeUSD).toBeLessThan(heavier.computeUSD);
  });
});

describe("projectMonthly", () => {
  it("rises with more active hours per day", () => {
    const base = defaultMonthlyVars(RUN);
    const quiet = projectMonthly(RUN, { ...base, activeHoursPerDay: 2 });
    const busy = projectMonthly(RUN, { ...base, activeHoursPerDay: 20 });
    expect(busy.totalUSD).toBeGreaterThan(quiet.totalUSD);
  });

  it("always bills the control plane for the in-month hours", () => {
    const m = projectMonthly(RUN, { activeHoursPerDay: 8, daysPerMonth: 30, idleReplicas: 3 });
    expect(m.controlPlaneUSD).toBeGreaterThan(0);
    expect(m.activeHours).toBe(240);
    expect(m.idleHours).toBe(480);
  });

  it("idle replicas raise the floor cost", () => {
    const lean = projectMonthly(RUN, { activeHoursPerDay: 8, daysPerMonth: 30, idleReplicas: 0 });
    const warm = projectMonthly(RUN, { activeHoursPerDay: 8, daysPerMonth: 30, idleReplicas: 10 });
    expect(warm.totalUSD).toBeGreaterThan(lean.totalUSD);
  });
});

describe("deriveScenario", () => {
  it("represents the run's average as a steady scenario", () => {
    const s = deriveScenario(RUN);
    expect(s.requestsPerSecond).toBe(278);
    expect(s.replicas).toBe(10);
    expect(s.region).toBe("us-east-1");
    expect(s.hoursPerMonth).toBe(730);
  });
});
