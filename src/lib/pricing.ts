export type PricingInput = {
  filamentGrams: number;
  printTimeSeconds: number;
  quantity: number;
  pricePerGram: number;
  pricePerMachineHour: number;
  minimumOrder: number;
  rush: boolean;
  rushFee: number;
};

export type PriceBreakdown = {
  filamentGrams: number;
  printTimeSeconds: number;
  quantity: number;
  pricePerGram: number;
  pricePerMachineHour: number;
  materialCents: number;
  machineCents: number;
  beforeMinimumCents: number;
  minimumOrderCents: number;
  minimumApplied: boolean;
  rushFeeCents: number;
  rush: boolean;
  totalCents: number;
  currency: "USD";
  gramsSource: "slicer" | "density_adjusted";
};

export function dollarsToCents(dollars: number): number {
  if (!Number.isFinite(dollars)) {
    throw new Error("Amount must be a finite number");
  }
  return Math.round(dollars * 100);
}

/**
 * Price a job from slicer grams and seconds times the shop's own rates.
 * Material and machine time are each rounded to cents, then added.
 * If that sum is under the shop minimum, the minimum replaces it.
 * A rush fee is a flat amount added after the minimum.
 */
export function priceQuote(input: PricingInput): PriceBreakdown {
  if (!Number.isFinite(input.filamentGrams) || input.filamentGrams < 0) {
    throw new Error("filamentGrams must be a non-negative number");
  }
  if (!Number.isFinite(input.printTimeSeconds) || input.printTimeSeconds < 0) {
    throw new Error("printTimeSeconds must be a non-negative number");
  }
  if (!Number.isInteger(input.quantity) || input.quantity < 1 || input.quantity > 100) {
    throw new Error("quantity must be an integer from 1 to 100");
  }
  for (const [name, value] of [
    ["pricePerGram", input.pricePerGram],
    ["pricePerMachineHour", input.pricePerMachineHour],
    ["minimumOrder", input.minimumOrder],
    ["rushFee", input.rushFee],
  ] as const) {
    if (!Number.isFinite(value) || value < 0) {
      throw new Error(`${name} must be a non-negative number`);
    }
  }

  const materialCents = dollarsToCents(
    input.filamentGrams * input.pricePerGram * input.quantity,
  );
  const machineCents = dollarsToCents(
    (input.printTimeSeconds / 3600) * input.pricePerMachineHour * input.quantity,
  );
  const beforeMinimumCents = materialCents + machineCents;
  const minimumOrderCents = dollarsToCents(input.minimumOrder);
  const minimumApplied = beforeMinimumCents < minimumOrderCents;
  const afterMinimum = minimumApplied ? minimumOrderCents : beforeMinimumCents;
  const rushFeeCents = input.rush ? dollarsToCents(input.rushFee) : 0;

  return {
    filamentGrams: input.filamentGrams,
    printTimeSeconds: input.printTimeSeconds,
    quantity: input.quantity,
    pricePerGram: input.pricePerGram,
    pricePerMachineHour: input.pricePerMachineHour,
    materialCents,
    machineCents,
    beforeMinimumCents,
    minimumOrderCents,
    minimumApplied,
    rushFeeCents,
    rush: input.rush,
    totalCents: afterMinimum + rushFeeCents,
    currency: "USD",
    gramsSource: "slicer",
  };
}

export function gramsForMaterial(input: {
  filamentCm3: number | null;
  filamentGrams: number;
  slicedDensity: number;
  targetDensity: number;
}): { grams: number; source: "slicer" | "density_adjusted" } {
  if (!(input.targetDensity > 0) || !(input.slicedDensity > 0)) {
    throw new Error("Densities must be positive");
  }
  if (Math.abs(input.slicedDensity - input.targetDensity) < 1e-6) {
    return { grams: input.filamentGrams, source: "slicer" };
  }
  if (input.filamentCm3 != null && input.filamentCm3 > 0) {
    return { grams: input.filamentCm3 * input.targetDensity, source: "density_adjusted" };
  }
  return {
    grams: input.filamentGrams * (input.targetDensity / input.slicedDensity),
    source: "density_adjusted",
  };
}
