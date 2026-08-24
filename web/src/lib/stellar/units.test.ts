import { describe, expect, it } from "vitest";

import { decimalToUnits, unitsToDecimal } from "./units";

describe("contract decimal units", () => {
  it("converts XLM amounts without floating-point arithmetic", () => {
    expect(decimalToUnits("0.0000001", 7)).toBe(1n);
    expect(decimalToUnits("10000.1234567", 7)).toBe(100001234567n);
    expect(unitsToDecimal(100001234567n, 7)).toBe("10000.1234567");
  });

  it("uses two exact decimals for destination currency values", () => {
    expect(decimalToUnits("5694", 2)).toBe(569400n);
    expect(decimalToUnits("5685.17", 2)).toBe(568517n);
    expect(unitsToDecimal(568517n, 2)).toBe("5685.17");
  });

  it("rejects malformed values and precision loss", () => {
    expect(() => decimalToUnits("1.234", 2)).toThrow(/at most 2/);
    expect(() => decimalToUnits("1e3", 7)).toThrow(/positive decimal/);
  });
});
