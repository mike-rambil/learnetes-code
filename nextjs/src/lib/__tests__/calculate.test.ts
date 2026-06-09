import { describe, it, expect } from "vitest";
import { simulate } from "../calculate";
import { USD_TO_INR, AWS_REGIONS } from "../pricing";
import type { Scenario } from "../types";

const BASE_SCENARIO: Scenario = {
  provider: "aws",
  region: "us-east-1",
  requestsPerSecond: 100,
  avgRequestKB: 2,
  avgResponseKB: 50,
  pod: { cpu: 1, ramGB: 2 },
  replicas: 3,
  hoursPerMonth: 730,
};

describe("simulate", () => {
  it("produces non-negative totals for default scenario", () => {
    const r = simulate(BASE_SCENARIO);
    expect(r.cost.totalUSD).toBeGreaterThan(0);
    expect(r.cost.totalINR).toBeGreaterThan(0);
    expect(r.carbon.kgCO2).toBeGreaterThan(0);
  });

  it("INR equals USD × USD_TO_INR rate", () => {
    const r = simulate(BASE_SCENARIO);
    expect(r.cost.totalINR).toBeCloseTo(r.cost.totalUSD * USD_TO_INR, 4);
  });

  it("monthly requests = RPS × seconds/hr × hours", () => {
    const r = simulate(BASE_SCENARIO);
    const expected = 100 * 3600 * 730;
    expect(r.requestsPerMonth).toBe(expected);
  });

  it("doubling replicas roughly doubles compute cost", () => {
    const a = simulate(BASE_SCENARIO);
    const b = simulate({ ...BASE_SCENARIO, replicas: BASE_SCENARIO.replicas * 2 });
    expect(b.cost.computeUSD).toBeCloseTo(a.cost.computeUSD * 2, 4);
  });

  it("doubling response size doubles egress cost", () => {
    const a = simulate(BASE_SCENARIO);
    const b = simulate({ ...BASE_SCENARIO, avgResponseKB: BASE_SCENARIO.avgResponseKB * 2 });
    expect(b.cost.egressUSD).toBeCloseTo(a.cost.egressUSD * 2, 4);
  });

  it("greener grid region produces less CO2 for same workload", () => {
    const dirty = simulate({ ...BASE_SCENARIO, region: "ap-south-1" });
    const clean = simulate({ ...BASE_SCENARIO, region: "eu-north-1" });
    expect(clean.carbon.kgCO2).toBeLessThan(dirty.carbon.kgCO2);
  });

  it("per-1k-req cost stays stable when replicas double but traffic also doubles", () => {
    const a = simulate({ ...BASE_SCENARIO, replicas: 3, requestsPerSecond: 100 });
    const b = simulate({ ...BASE_SCENARIO, replicas: 6, requestsPerSecond: 200 });
    expect(b.cost.perThousandRequestsINR).toBeLessThan(a.cost.perThousandRequestsINR * 1.5);
  });

  it("zero traffic gives zero egress cost and zero per-1k metric", () => {
    const r = simulate({ ...BASE_SCENARIO, requestsPerSecond: 0 });
    expect(r.cost.egressUSD).toBe(0);
    expect(r.cost.perThousandRequestsINR).toBe(0);
    expect(r.carbon.gCO2PerThousandRequests).toBe(0);
  });

  it("egress GB matches manual calculation", () => {
    const r = simulate(BASE_SCENARIO);
    const expectedBytes = r.requestsPerMonth * BASE_SCENARIO.avgResponseKB * 1024;
    const expectedGB = expectedBytes / (1024 ** 3);
    expect(r.egressGB).toBeCloseTo(expectedGB, 4);
  });

  it("cost rises monotonically across regions when only region changes (multiplier effect)", () => {
    const results = AWS_REGIONS.map((r) => ({
      id: r.id,
      cost: simulate({ ...BASE_SCENARIO, region: r.id }).cost.totalUSD,
    }));
    for (const r of results) {
      expect(r.cost).toBeGreaterThan(0);
    }
  });
});
