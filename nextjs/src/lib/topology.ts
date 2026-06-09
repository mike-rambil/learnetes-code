import type { Scenario } from "./types";

export interface HPAParams {
  min: number;
  max: number;
}

export interface TopologyParams {
  scenario: Scenario;
  hpa?: HPAParams;
  rpsPerPod?: number;
  podsPerNode?: number;
}

export interface Topology {
  effectiveReplicas: number;
  baseReplicas: number;
  desiredReplicas: number;
  nodeCount: number;
  rpsPerPod: number;
  podsPerNode: number;
  hpaActive: boolean;
  hpaSaturated: boolean;
  capacityUtilizationPercent: number;
}

export const DEFAULT_RPS_PER_POD = 100;
export const DEFAULT_PODS_PER_NODE = 4;

export function computeTopology({
  scenario,
  hpa,
  rpsPerPod = DEFAULT_RPS_PER_POD,
  podsPerNode = DEFAULT_PODS_PER_NODE,
}: TopologyParams): Topology {
  const desiredFromTraffic = Math.max(1, Math.ceil(scenario.requestsPerSecond / rpsPerPod));

  let effectiveReplicas: number;
  let hpaActive = false;
  let hpaSaturated = false;

  if (hpa) {
    hpaActive = true;
    if (desiredFromTraffic >= hpa.max) {
      effectiveReplicas = hpa.max;
      hpaSaturated = true;
    } else if (desiredFromTraffic <= hpa.min) {
      effectiveReplicas = hpa.min;
    } else {
      effectiveReplicas = desiredFromTraffic;
    }
  } else {
    effectiveReplicas = scenario.replicas;
  }

  const nodeCount = Math.max(1, Math.ceil(effectiveReplicas / podsPerNode));
  const totalCapacity = effectiveReplicas * rpsPerPod;
  const capacityUtilizationPercent =
    totalCapacity > 0 ? Math.min(100, (scenario.requestsPerSecond / totalCapacity) * 100) : 0;

  return {
    effectiveReplicas,
    baseReplicas: scenario.replicas,
    desiredReplicas: desiredFromTraffic,
    nodeCount,
    rpsPerPod,
    podsPerNode,
    hpaActive,
    hpaSaturated,
    capacityUtilizationPercent,
  };
}
