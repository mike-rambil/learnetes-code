import type { RegionOption } from "./types";

// USD→INR spot rate, 2026-06-08 (source: Morningstar via Google Finance).
export const USD_TO_INR = 95.69;

// ALB hourly + LCU rates are per-region (AWS Price List API, snapshot 2026-06-09).
export const AWS_REGIONS: RegionOption[] = [
  { id: "us-east-1", label: "N. Virginia (us-east-1)", country: "USA", egressUSDPerGB: 0.09, gridIntensity: 379, computeMultiplier: 1.0, albUSDPerHour: 0.0225, albLCUUSDPerHour: 0.008 },
  { id: "us-west-2", label: "Oregon (us-west-2)", country: "USA", egressUSDPerGB: 0.09, gridIntensity: 124, computeMultiplier: 1.0, albUSDPerHour: 0.0225, albLCUUSDPerHour: 0.008 },
  { id: "eu-west-1", label: "Ireland (eu-west-1)", country: "Ireland", egressUSDPerGB: 0.09, gridIntensity: 316, computeMultiplier: 1.04, albUSDPerHour: 0.0252, albLCUUSDPerHour: 0.008 },
  { id: "eu-north-1", label: "Stockholm (eu-north-1)", country: "Sweden", egressUSDPerGB: 0.09, gridIntensity: 41, computeMultiplier: 1.0, albUSDPerHour: 0.02394, albLCUUSDPerHour: 0.0076 },
  { id: "ap-south-1", label: "Mumbai (ap-south-1)", country: "India", egressUSDPerGB: 0.1093, gridIntensity: 708, computeMultiplier: 1.05, albUSDPerHour: 0.0239, albLCUUSDPerHour: 0.008 },
  { id: "ap-southeast-1", label: "Singapore (ap-southeast-1)", country: "Singapore", egressUSDPerGB: 0.12, gridIntensity: 408, computeMultiplier: 1.08, albUSDPerHour: 0.0252, albLCUUSDPerHour: 0.008 },
  { id: "ap-northeast-1", label: "Tokyo (ap-northeast-1)", country: "Japan", egressUSDPerGB: 0.114, gridIntensity: 506, computeMultiplier: 1.12, albUSDPerHour: 0.0243, albLCUUSDPerHour: 0.008 },
  { id: "sa-east-1", label: "São Paulo (sa-east-1)", country: "Brazil", egressUSDPerGB: 0.15, gridIntensity: 99, computeMultiplier: 1.30, albUSDPerHour: 0.0340, albLCUUSDPerHour: 0.011 },
];

export const CPU_USD_PER_HOUR_BASE = 0.0204;
export const RAM_USD_PER_GB_HOUR_BASE = 0.00471;

export const EKS_CONTROL_PLANE_USD_PER_HOUR = 0.10;

export function getRegion(id: string): RegionOption {
  const r = AWS_REGIONS.find((x) => x.id === id);
  if (!r) throw new Error(`Unknown region: ${id}`);
  return r;
}
