import { describe, expect, it } from "vitest";

import { prescriptionAllowsActualWeight } from "./planning.load.js";

describe("actual weight eligibility", () => {
  it("accepts an absolute load with amount and unit", () => {
    expect(
      prescriptionAllowsActualWeight({ prescribedWeight: { amount: 60, unit: "kg" } }),
    ).toBe(true);
  });

  it("accepts a legacy prescribed weight in kilograms", () => {
    expect(prescriptionAllowsActualWeight({ prescribedWeightKg: 83 })).toBe(true);
  });

  it("accepts percentage-based work", () => {
    expect(prescriptionAllowsActualWeight({ oneRepMaxPercentage: 75 })).toBe(true);
  });

  it("rejects prescriptions without a structured load", () => {
    expect(prescriptionAllowsActualWeight({ sets: 4, repetitions: 4 })).toBe(false);
    expect(prescriptionAllowsActualWeight({})).toBe(false);
    expect(prescriptionAllowsActualWeight(null)).toBe(false);
    expect(prescriptionAllowsActualWeight(undefined)).toBe(false);
  });

  it("rejects malformed load values", () => {
    expect(prescriptionAllowsActualWeight({ prescribedWeight: { amount: "60" } })).toBe(false);
    expect(prescriptionAllowsActualWeight({ prescribedWeight: { amount: -1, unit: "kg" } })).toBe(
      false,
    );
    expect(prescriptionAllowsActualWeight({ prescribedWeightKg: null })).toBe(false);
    expect(prescriptionAllowsActualWeight({ oneRepMaxPercentage: "75" })).toBe(false);
  });
});
