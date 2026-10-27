import { describe, expect, it } from "vitest";
import { dollarsToCents, gramsForMaterial, priceQuote } from "./pricing";

const base = {
  filamentGrams: 10,
  printTimeSeconds: 3600,
  quantity: 1,
  pricePerGram: 0.03,
  pricePerMachineHour: 6,
  minimumOrder: 8,
  rush: false,
  rushFee: 5,
};

describe("priceQuote", () => {
  it("prices grams and machine time, then multiplies by quantity", () => {
    const priced = priceQuote({ ...base, quantity: 2, filamentGrams: 10, printTimeSeconds: 3600 });
    expect(priced.materialCents).toBe(60);
    expect(priced.machineCents).toBe(1200);
    expect(priced.minimumApplied).toBe(false);
    expect(priced.rushFeeCents).toBe(0);
    expect(priced.totalCents).toBe(1260);
  });

  it("replaces a small job with the shop minimum", () => {
    const priced = priceQuote({
      ...base,
      filamentGrams: 1,
      printTimeSeconds: 360,
      pricePerGram: 0.02,
      pricePerMachineHour: 6,
    });
    expect(priced.materialCents).toBe(2);
    expect(priced.machineCents).toBe(60);
    expect(priced.beforeMinimumCents).toBe(62);
    expect(priced.minimumApplied).toBe(true);
    expect(priced.totalCents).toBe(800);
  });

  it("adds the rush fee after the minimum, once", () => {
    const under = priceQuote({
      ...base,
      filamentGrams: 1,
      printTimeSeconds: 360,
      pricePerGram: 0.02,
      rush: true,
    });
    expect(under.totalCents).toBe(1300);
    expect(under.rushFeeCents).toBe(500);

    const over = priceQuote({ ...base, rush: true, quantity: 2 });
    expect(over.minimumApplied).toBe(false);
    expect(over.totalCents).toBe(1260 + 500);
  });

  it("rounds half-up to cents on each component", () => {
    expect(dollarsToCents(0.025)).toBe(3);
    const priced = priceQuote({
      ...base,
      filamentGrams: 1,
      printTimeSeconds: 0,
      pricePerGram: 0.025,
      minimumOrder: 0,
    });
    expect(priced.materialCents).toBe(3);
    expect(priced.machineCents).toBe(0);
    expect(priced.totalCents).toBe(3);
  });

  it("allows a zero-time job and a zero minimum", () => {
    const priced = priceQuote({
      ...base,
      printTimeSeconds: 0,
      minimumOrder: 0,
      filamentGrams: 4,
      pricePerGram: 0.05,
    });
    expect(priced.totalCents).toBe(20);
  });

  it("rejects bad quantity and negative grams", () => {
    expect(() => priceQuote({ ...base, quantity: 0 })).toThrow(/quantity/);
    expect(() => priceQuote({ ...base, quantity: 1.5 })).toThrow(/quantity/);
    expect(() => priceQuote({ ...base, filamentGrams: -0.1 })).toThrow(/filamentGrams/);
  });
});

describe("gramsForMaterial", () => {
  it("keeps the slicer grams when the density matches", () => {
    expect(
      gramsForMaterial({
        filamentCm3: 2.86,
        filamentGrams: 3.55,
        slicedDensity: 1.24,
        targetDensity: 1.24,
      }),
    ).toEqual({ grams: 3.55, source: "slicer" });
  });

  it("scales sliced volume by the new density", () => {
    const result = gramsForMaterial({
      filamentCm3: 2.86,
      filamentGrams: 3.55,
      slicedDensity: 1.24,
      targetDensity: 1.27,
    });
    expect(result.source).toBe("density_adjusted");
    expect(result.grams).toBeCloseTo(2.86 * 1.27, 6);
  });
});
