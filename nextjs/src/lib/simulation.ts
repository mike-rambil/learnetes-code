// Real-time autoscaling simulation engine.
//
// `computeTopology` (./topology) answers "given this steady traffic, what does
// the cluster settle to?" — instantly, with no notion of time. This module adds
// the *time* dimension: a traffic generator that varies load over a simulated
// clock, and an HPA controller that chases that load the way a real
// HorizontalPodAutoscaler does — fast to scale up, slow and deliberate to scale
// down. Pure functions only; the React loop lives in TrafficSimulator.tsx.

import type { Topology } from "./topology";
import { DEFAULT_PODS_PER_NODE, DEFAULT_RPS_PER_POD } from "./topology";

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

// ---------------------------------------------------------------------------
// Traffic generator
// ---------------------------------------------------------------------------

export type TrafficPattern = "steady" | "ramp" | "spike" | "wave";

export interface TrafficConfig {
  pattern: TrafficPattern;
  /** Peak requests per second the pattern reaches. */
  peakRps: number;
  /** Cycle / ramp length in simulated seconds. */
  periodSec: number;
}

/** Requests per second the workload is emitting at simulated time `tSec`. */
export function trafficAt({ pattern, peakRps, periodSec }: TrafficConfig, tSec: number): number {
  const period = Math.max(1, periodSec);
  switch (pattern) {
    case "steady":
      return Math.round(peakRps);
    case "ramp": {
      // Linear climb from ~5% to peak over one period, then hold at peak.
      const f = Math.min(1, tSec / period);
      return Math.round(peakRps * (0.05 + 0.95 * f));
    }
    case "wave": {
      // Smooth sine between 10% and 100% of peak, repeating every period.
      const phase = (tSec % period) / period;
      const s = (Math.sin(phase * 2 * Math.PI - Math.PI / 2) + 1) / 2; // 0..1, starts low
      return Math.round(peakRps * (0.1 + 0.9 * s));
    }
    case "spike": {
      // Quiet baseline punctuated by a sharp burst in the middle of each cycle.
      const phase = (tSec % period) / period;
      const inSpike = phase >= 0.45 && phase < 0.6;
      return Math.round(inSpike ? peakRps : peakRps * 0.12);
    }
  }
}

// ---------------------------------------------------------------------------
// HPA controller
// ---------------------------------------------------------------------------

export interface ScalerConfig {
  min: number;
  max: number;
  /** Throughput one pod can serve — proxy for the HPA's CPU target metric. */
  rpsPerPod: number;
  /** How often the HPA re-evaluates the metric (K8s default ~15s). */
  syncIntervalSec: number;
  /**
   * Cool-down before any scale-DOWN is allowed, in simulated seconds. Kubernetes
   * defaults to 300s; shortened here so the behaviour is visible in a demo.
   */
  scaleDownStabilizationSec: number;
}

export interface ScalerState {
  replicas: number;
  /** Sim-time of the last evaluation, so we only act on sync boundaries. */
  lastSyncSec: number;
  /** Sim-time the pods first became eligible to scale down, or null. */
  scaleDownSinceSec: number | null;
}

export const DEFAULT_SCALER: Pick<ScalerConfig, "syncIntervalSec" | "scaleDownStabilizationSec"> = {
  syncIntervalSec: 15,
  scaleDownStabilizationSec: 60,
};

/** Replica count the HPA *wants* for the given load (its instantaneous target). */
export function desiredReplicas(rps: number, cfg: ScalerConfig): number {
  const raw = Math.ceil(rps / Math.max(1, cfg.rpsPerPod));
  return clamp(Math.max(1, raw), cfg.min, cfg.max);
}

export function initScaler(replicas: number): ScalerState {
  return { replicas, lastSyncSec: 0, scaleDownSinceSec: null };
}

/**
 * Advance the controller to simulated time `nowSec`. Scale-up is immediate but
 * rate-limited (at most double, min +4 pods per sync — the K8s default up
 * policy). Scale-down only happens once load has stayed low for the whole
 * stabilization window, and then steps down gently.
 */
export function stepScaler(
  state: ScalerState,
  rps: number,
  cfg: ScalerConfig,
  nowSec: number,
): ScalerState {
  if (nowSec - state.lastSyncSec < cfg.syncIntervalSec) return state;

  const want = desiredReplicas(rps, cfg);
  let { replicas, scaleDownSinceSec } = state;

  if (want > replicas) {
    const maxUp = Math.max(4, replicas); // +100% or +4 pods, whichever is larger
    replicas = Math.min(want, replicas + maxUp);
    scaleDownSinceSec = null; // any upward pressure cancels a pending scale-down
  } else if (want < replicas) {
    if (scaleDownSinceSec === null) scaleDownSinceSec = nowSec;
    if (nowSec - scaleDownSinceSec >= cfg.scaleDownStabilizationSec) {
      const maxDown = Math.max(1, Math.ceil(replicas * 0.25)); // ease down ~25%/sync
      replicas = Math.max(want, replicas - maxDown);
      if (replicas <= want) scaleDownSinceSec = null;
    }
  } else {
    scaleDownSinceSec = null;
  }

  return { replicas, lastSyncSec: nowSec, scaleDownSinceSec };
}

// ---------------------------------------------------------------------------
// Live topology — like computeTopology, but with the *actual* running replica
// count from the controller rather than the steady-state ideal.
// ---------------------------------------------------------------------------

export interface LiveTopologyArgs {
  rps: number;
  runningReplicas: number;
  baseReplicas: number;
  hpa?: { min: number; max: number };
  rpsPerPod?: number;
  podsPerNode?: number;
}

export function buildLiveTopology({
  rps,
  runningReplicas,
  baseReplicas,
  hpa,
  rpsPerPod = DEFAULT_RPS_PER_POD,
  podsPerNode = DEFAULT_PODS_PER_NODE,
}: LiveTopologyArgs): Topology {
  const effectiveReplicas = Math.max(1, Math.round(runningReplicas));
  const desired = Math.max(1, Math.ceil(rps / Math.max(1, rpsPerPod)));
  const nodeCount = Math.max(1, Math.ceil(effectiveReplicas / podsPerNode));
  const totalCapacity = effectiveReplicas * rpsPerPod;
  const capacityUtilizationPercent =
    totalCapacity > 0 ? Math.min(100, (rps / totalCapacity) * 100) : 0;

  return {
    effectiveReplicas,
    baseReplicas,
    desiredReplicas: desired,
    nodeCount,
    rpsPerPod,
    podsPerNode,
    hpaActive: !!hpa,
    hpaSaturated: !!hpa && effectiveReplicas >= hpa.max,
    capacityUtilizationPercent,
  };
}
