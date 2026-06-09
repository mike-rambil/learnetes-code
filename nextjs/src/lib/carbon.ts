export const WATTS_PER_VCPU = 12;
export const WATTS_PER_GB_RAM = 0.38;
export const KWH_PER_GB_NETWORK = 0.001;
export const AWS_PUE = 1.135;
export const KG_CO2_PER_KM_DRIVEN = 0.192;

export function computeEnergyKWh(vcpuHours: number, ramGBHours: number): number {
  const cpuKWh = (vcpuHours * WATTS_PER_VCPU) / 1000;
  const ramKWh = (ramGBHours * WATTS_PER_GB_RAM) / 1000;
  return (cpuKWh + ramKWh) * AWS_PUE;
}

export function networkEnergyKWh(egressGB: number): number {
  return egressGB * KWH_PER_GB_NETWORK;
}

export function kWhToKgCO2(kWh: number, gridIntensityGPerKWh: number): number {
  return (kWh * gridIntensityGPerKWh) / 1000;
}

export function carKmEquivalent(kgCO2: number): number {
  return kgCO2 / KG_CO2_PER_KM_DRIVEN;
}
