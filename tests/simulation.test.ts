import { describe, it, expect } from "vitest";
import {
  buildLiveTopology,
  desiredReplicas,
  initScaler,
  stepScaler,
  trafficAt,
  type ScalerConfig,
  type TrafficConfig,
} from "../simulation";

const CFG: ScalerConfig = {
  min: 2,
  max: 20,
  rpsPerPod: 100,
  syncIntervalSec: 15,
  scaleDownStabilizationSec: 60,
};

describe("trafficAt", () => {
  it("holds steady at peak", () => {
    const cfg: TrafficConfig = { pattern: "steady", peakRps: 250, periodSec: 60 };
    expect(trafficAt(cfg, 0)).toBe(250);
    expect(trafficAt(cfg, 999)).toBe(250);
  });

  it("ramps from low up to peak over one period then holds", () => {
    const cfg: TrafficConfig = { pattern: "ramp", peakRps: 1000, periodSec: 100 };
    expect(trafficAt(cfg, 0)).toBeLessThan(trafficAt(cfg, 50));
    expect(trafficAt(cfg, 50)).toBeLessThan(trafficAt(cfg, 100));
    expect(trafficAt(cfg, 100)).toBe(1000);
    expect(trafficAt(cfg, 500)).toBe(1000); // holds after the ramp
  });

  it("wave stays within [10%, 100%] of peak and oscillates", () => {
    const cfg: TrafficConfig = { pattern: "wave", peakRps: 1000, periodSec: 60 };
    const samples = Array.from({ length: 60 }, (_, t) => trafficAt(cfg, t));
    expect(Math.min(...samples)).toBeGreaterThanOrEqual(100);
    expect(Math.max(...samples)).toBeLessThanOrEqual(1000);
    expect(Math.max(...samples)).toBeGreaterThan(Math.min(...samples) + 100);
  });

  it("spike is quiet then bursts to peak mid-cycle", () => {
    const cfg: TrafficConfig = { pattern: "spike", peakRps: 1000, periodSec: 100 };
    expect(trafficAt(cfg, 0)).toBeLessThan(200); // baseline
    expect(trafficAt(cfg, 50)).toBe(1000); // burst window
  });
});

describe("desiredReplicas", () => {
  it("derives pods from load and clamps to HPA bounds", () => {
    expect(desiredReplicas(500, CFG)).toBe(5);
    expect(desiredReplicas(10, CFG)).toBe(CFG.min); // floor at min
    expect(desiredReplicas(999999, CFG)).toBe(CFG.max); // ceiling at max
  });
});

describe("stepScaler", () => {
  it("does nothing between sync intervals", () => {
    const s = initScaler(2);
    const next = stepScaler(s, 5000, CFG, 5); // before first sync boundary
    expect(next.replicas).toBe(2);
  });

  it("scales up immediately at a sync boundary", () => {
    const s = initScaler(2);
    const next = stepScaler(s, 1000, CFG, 15);
    expect(next.replicas).toBeGreaterThan(2);
  });

  it("rate-limits scale-up to at most double (min +4)", () => {
    const s = initScaler(2);
    const next = stepScaler(s, 100000, CFG, 15); // wants max=20
    expect(next.replicas).toBe(6); // 2 + max(4, 2) = 6, not straight to 20
  });

  it("waits out the stabilization window before scaling down", () => {
    let s = initScaler(10);
    s = stepScaler(s, 0, CFG, 15); // load drops to ~min; window opens
    expect(s.replicas).toBe(10); // still held
    s = stepScaler(s, 0, CFG, 30); // 15s elapsed < 60s window
    expect(s.replicas).toBe(10);
    s = stepScaler(s, 0, CFG, 90); // > 60s since eligible → steps down
    expect(s.replicas).toBeLessThan(10);
  });

  it("cancels a pending scale-down when load rises again", () => {
    let s = initScaler(10);
    s = stepScaler(s, 0, CFG, 15); // window opens
    expect(s.scaleDownSinceSec).not.toBeNull();
    s = stepScaler(s, 5000, CFG, 30); // load spikes back up
    expect(s.scaleDownSinceSec).toBeNull();
    expect(s.replicas).toBeGreaterThanOrEqual(10);
  });
});

describe("buildLiveTopology", () => {
  it("reflects the actual running replicas, not the steady-state ideal", () => {
    const t = buildLiveTopology({
      rps: 2000, // would ideally want 20 pods
      runningReplicas: 6, // but only 6 are live (mid scale-up)
      baseReplicas: 3,
      hpa: { min: 2, max: 20 },
    });
    expect(t.effectiveReplicas).toBe(6);
    expect(t.desiredReplicas).toBe(20);
    expect(t.nodeCount).toBe(2); // ceil(6 / 4)
    expect(t.capacityUtilizationPercent).toBe(100); // 6 pods can't cover 2000 rps
    expect(t.hpaActive).toBe(true);
  });

  it("flags saturation at the HPA ceiling", () => {
    const t = buildLiveTopology({
      rps: 5000,
      runningReplicas: 20,
      baseReplicas: 3,
      hpa: { min: 2, max: 20 },
    });
    expect(t.hpaSaturated).toBe(true);
  });
});
