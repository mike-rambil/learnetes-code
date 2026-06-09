export type CloudProvider = "aws";

export interface PodConfig {
  cpu: number;
  ramGB: number;
}

export interface Scenario {
  provider: CloudProvider;
  region: string;
  requestsPerSecond: number;
  avgRequestKB: number;
  avgResponseKB: number;
  pod: PodConfig;
  replicas: number;
  hoursPerMonth: number;
}

export interface CostBreakdown {
  computeUSD: number;
  egressUSD: number;
  loadBalancerUSD: number;
  controlPlaneUSD: number;
  totalUSD: number;
  totalINR: number;
  perThousandRequestsINR: number;
}

export interface CarbonBreakdown {
  computeKWh: number;
  networkKWh: number;
  totalKWh: number;
  gridIntensity: number;
  kgCO2: number;
  gCO2PerThousandRequests: number;
  carKmEquivalent: number;
}

export interface SimulationResult {
  cost: CostBreakdown;
  carbon: CarbonBreakdown;
  requestsPerMonth: number;
  egressGB: number;
}

export interface RegionOption {
  id: string;
  label: string;
  country: string;
  egressUSDPerGB: number;
  gridIntensity: number;
  computeMultiplier: number;
  albUSDPerHour: number;
  albLCUUSDPerHour: number;
}
