import { describe, expect, it } from "vitest";
import { attachEnginePrices } from "@/lib/ai/price-advice";
import { mockReview } from "@/lib/ai/mock";
import { priceQuote } from "@/lib/pricing";
import { reviewFromModel, scrubMoney } from "@/lib/ai/schema";
import type { MeshFactsDTO } from "@/lib/types";

const mesh: MeshFactsDTO = {
  watertight: true,
  volumeCm3: 8,
  surfaceAreaCm2: 24,
  overhangFaceShare: 0.12,
  overhangThresholdDeg: 45,
  thinWall: false,
  characteristicThicknessMm: 6.6,
  fitsBed: true,
  fitsIfRotated: true,
  partCount: 1,
  triangleCount: 12,
  boundingBoxMm: { x: 20, y: 20, z: 20 },
};

const rates = [
  { name: "PLA", pricePerGram: 0.025, pricePerMachineHour: 6, densityGPerCm3: 1.24 },
  { name: "PETG", pricePerGram: 0.03, pricePerMachineHour: 7, densityGPerCm3: 1.27 },
];

describe("mock review", () => {
  it("explains overhangs without stating a price", () => {
    const review = mockReview({
      purpose: "outdoor",
      selectedMaterial: "PLA",
      bed: { x: 256, y: 256, z: 256 },
      mesh,
      slicer: { supports: true, profileName: "generic-0.20mm-15pct-0.4nozzle" },
      shopMaterialNames: ["PLA", "PETG", "ASA", "TPU"],
      mockReason: null,
    });
    const text = JSON.stringify(review);
    expect(text).not.toMatch(/\$/);
    expect(review.warnings.some((warning) => /support/i.test(warning.title))).toBe(true);
    expect(review.materialAdvice.find((item) => item.material === "ASA")?.fit).toBe("good");
    expect(review.materialAdvice.find((item) => item.material === "PLA")?.fit).toBe("poor");
    expect(review.mocked).toBe(true);
  });
});

describe("attachEnginePrices", () => {
  it("uses the pricing engine for every stocked material", () => {
    const advice = [
      { material: "PLA", fit: "good" as const, reason: "Fine indoors." },
      { material: "PETG", fit: "ok" as const, reason: "Tougher. Costs $4." },
      { material: "Nylon", fit: "ok" as const, reason: "Not stocked." },
    ];
    const quotes = attachEnginePrices({
      advice,
      rates,
      filamentGrams: 10,
      filamentCm3: 8,
      slicedDensity: 1.24,
      printTimeSeconds: 1800,
      quantity: 2,
      minimumOrder: 8,
      rush: false,
      rushFee: 5,
    });
    const pla = quotes[0];
    const expected = priceQuote({
      filamentGrams: 10,
      printTimeSeconds: 1800,
      quantity: 2,
      pricePerGram: 0.025,
      pricePerMachineHour: 6,
      minimumOrder: 8,
      rush: false,
      rushFee: 5,
    });
    expect(pla.priceCents).toBe(expected.totalCents);
    expect(pla.priceSource).toBe("pricing_engine");
    expect(quotes[1].priceSource).toBe("pricing_engine");
    expect(quotes[1].priceCents).not.toBe(400);
    expect(quotes[2].unavailable).toBe(true);
    expect(quotes[2].priceCents).toBeNull();
  });
});

describe("reviewFromModel", () => {
  it("drops currency the model tried to write", () => {
    const review = reviewFromModel(
      {
        summary: "This will cost $12.50 to print.",
        printable: true,
        warnings: [],
        orientationNote: "Leave it as uploaded.",
        materialAdvice: [{ material: "PLA", fit: "good", reason: "About 3 dollars of plastic." }],
      },
      "openai",
    );
    expect(review.summary).not.toMatch(/\$|12\.50/);
    expect(review.materialAdvice[0].reason.toLowerCase()).not.toMatch(/dollar/);
    expect(scrubMoney("$9")).toBe("the quoted price");
  });
});
