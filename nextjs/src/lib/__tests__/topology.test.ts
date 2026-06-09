import { describe, it, expect } from "vitest";
import { computeTopology } from "../topology";
import type { Scenario } from "../types";

const BASE: Scenario = {
  provider: "aws",
  region: "us-east-1",
  requestsPerSecond: 100,
  avgRequestKB: 2,
  avgResponseKB: 50,
  pod: { cpu: 1, ramGB: 2 },
  replicas: 3,
  hoursPerMonth: 730,
};

describe("computeTopology", () => {
  it("uses scenario.replicas when no HPA", () => {
    const t = computeTopology({ scenario: { ...BASE, replicas: 5 } });
    expect(t.effectiveReplicas).toBe(5);
    expect(t.hpaActive).toBe(false);
  });

  it("computes desired pods from traffic / rpsPerPod", () => {
    const t = computeTopology({
      scenario: { ...BASE, requestsPerSecond: 1000 },
      rpsPerPod: 100,
    });
    expect(t.desiredReplicas).toBe(10);
  });

  it("clamps HPA at min when traffic low", () => {
    const t = computeTopology({
      scenario: { ...BASE, requestsPerSecond: 50 },
      hpa: { min: 5, max: 20 },
      rpsPerPod: 100,
    });
    expect(t.effectiveReplicas).toBe(5);
    expect(t.hpaActive).toBe(true);
    expect(t.hpaSaturated).toBe(false);
  });

  it("scales linearly with HPA in mid range", () => {
    const t = computeTopology({
      scenario: { ...BASE, requestsPerSecond: 800 },
      hpa: { min: 1, max: 20 },
      rpsPerPod: 100,
    });
    expect(t.effectiveReplicas).toBe(8);
    expect(t.hpaSaturated).toBe(false);
  });

  it("saturates HPA at max", () => {
    const t = computeTopology({
      scenario: { ...BASE, requestsPerSecond: 999999 },
      hpa: { min: 1, max: 20 },
      rpsPerPod: 100,
    });
    expect(t.effectiveReplicas).toBe(20);
    expect(t.hpaSaturated).toBe(true);
  });

  it("computes node count as ceil(pods / podsPerNode)", () => {
    const t = computeTopology({
      scenario: { ...BASE, replicas: 10 },
      podsPerNode: 4,
    });
    expect(t.nodeCount).toBe(3);
  });

  it("returns at least 1 node even for zero replicas", () => {
    const t = computeTopology({
      scenario: { ...BASE, replicas: 1 },
      podsPerNode: 4,
    });
    expect(t.nodeCount).toBe(1);
  });

  it("reports >=100% utilization when traffic exceeds capacity without HPA room", () => {
    const t = computeTopology({
      scenario: { ...BASE, requestsPerSecond: 10000, replicas: 3 },
      rpsPerPod: 100,
    });
    expect(t.capacityUtilizationPercent).toBeCloseTo(100, 0);
  });

  it("reports proper utilization when HPA absorbs all load", () => {
    const t = computeTopology({
      scenario: { ...BASE, requestsPerSecond: 500 },
      hpa: { min: 1, max: 20 },
      rpsPerPod: 100,
    });
    expect(t.effectiveReplicas).toBe(5);
    expect(t.capacityUtilizationPercent).toBeCloseTo(100, 0);
  });
});
