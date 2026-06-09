import { describe, it, expect } from "vitest";
import {
  computeEnergyKWh,
  networkEnergyKWh,
  kWhToKgCO2,
  carKmEquivalent,
  WATTS_PER_VCPU,
  WATTS_PER_GB_RAM,
  AWS_PUE,
  KWH_PER_GB_NETWORK,
  KG_CO2_PER_KM_DRIVEN,
} from "../carbon";

describe("carbon model", () => {
  describe("computeEnergyKWh", () => {
    it("returns 0 for zero inputs", () => {
      expect(computeEnergyKWh(0, 0)).toBe(0);
    });

    it("applies CPU power × hours / 1000 × PUE", () => {
      const vcpuHours = 1000;
      const expected = ((vcpuHours * WATTS_PER_VCPU) / 1000) * AWS_PUE;
      expect(computeEnergyKWh(vcpuHours, 0)).toBeCloseTo(expected, 6);
    });

    it("applies RAM power × hours / 1000 × PUE", () => {
      const ramGBHours = 1000;
      const expected = ((ramGBHours * WATTS_PER_GB_RAM) / 1000) * AWS_PUE;
      expect(computeEnergyKWh(0, ramGBHours)).toBeCloseTo(expected, 6);
    });

    it("sums CPU and RAM contributions linearly", () => {
      const a = computeEnergyKWh(100, 0);
      const b = computeEnergyKWh(0, 200);
      const c = computeEnergyKWh(100, 200);
      expect(c).toBeCloseTo(a + b, 6);
    });
  });

  describe("networkEnergyKWh", () => {
    it("returns 0 for zero GB", () => {
      expect(networkEnergyKWh(0)).toBe(0);
    });

    it("scales linearly with egress", () => {
      expect(networkEnergyKWh(100)).toBeCloseTo(100 * KWH_PER_GB_NETWORK, 6);
    });
  });

  describe("kWhToKgCO2", () => {
    it("divides g result by 1000 for kg", () => {
      expect(kWhToKgCO2(100, 500)).toBeCloseTo(50, 6);
    });

    it("returns 0 for clean grid (0 gCO2/kWh)", () => {
      expect(kWhToKgCO2(1000, 0)).toBe(0);
    });
  });

  describe("carKmEquivalent", () => {
    it("divides by KG_CO2_PER_KM_DRIVEN", () => {
      expect(carKmEquivalent(KG_CO2_PER_KM_DRIVEN)).toBeCloseTo(1, 6);
      expect(carKmEquivalent(KG_CO2_PER_KM_DRIVEN * 100)).toBeCloseTo(100, 6);
    });
  });
});
