import { gramsForMaterial, priceQuote, type PriceBreakdown } from "@/lib/pricing";
import type { MaterialAdvice, MaterialQuoteDTO } from "@/lib/types";

export type AdviceRate = {
  id?: string;
  name: string;
  colors?: string[];
  pricePerGram: number;
  pricePerMachineHour: number;
  densityGPerCm3: number;
};

/**
 * Attach prices from the pricing engine. Advice text is never a source of money.
 */
export function attachEnginePrices(input: {
  advice: MaterialAdvice[];
  rates: AdviceRate[];
  filamentGrams: number;
  filamentCm3: number | null;
  slicedDensity: number;
  printTimeSeconds: number;
  quantity: number;
  minimumOrder: number;
  rush: boolean;
  rushFee: number;
}): MaterialQuoteDTO[] {
  return input.advice.map((item) => {
    const rate = input.rates.find(
      (candidate) => candidate.name.toLowerCase() === item.material.toLowerCase(),
    );
    if (!rate) {
      return {
        ...item,
        materialId: null,
        defaultColor: null,
        priceCents: null,
        priceSource: null,
        unavailable: true,
      };
    }
    const grams = gramsForMaterial({
      filamentCm3: input.filamentCm3,
      filamentGrams: input.filamentGrams,
      slicedDensity: input.slicedDensity,
      targetDensity: rate.densityGPerCm3,
    });
    const priced: PriceBreakdown = priceQuote({
      filamentGrams: grams.grams,
      printTimeSeconds: input.printTimeSeconds,
      quantity: input.quantity,
      pricePerGram: rate.pricePerGram,
      pricePerMachineHour: rate.pricePerMachineHour,
      minimumOrder: input.minimumOrder,
      rush: input.rush,
      rushFee: input.rushFee,
    });
    return {
      ...item,
      materialId: rate.id ?? null,
      defaultColor: rate.colors?.[0] ?? null,
      priceCents: priced.totalCents,
      priceSource: "pricing_engine",
      unavailable: false,
    };
  });
}
