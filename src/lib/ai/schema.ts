import { z } from "zod";
import type { AiReviewDTO, MaterialAdvice } from "@/lib/types";

export const modelReviewSchema = z.object({
  summary: z.string().min(1),
  printable: z.boolean(),
  warnings: z.array(
    z.object({
      severity: z.enum(["info", "warning", "blocker"]),
      title: z.string().min(1),
      detail: z.string().min(1),
      fix: z.string().min(1),
    }),
  ),
  orientationNote: z.string().min(1),
  materialAdvice: z.array(
    z.object({
      material: z.string().min(1),
      fit: z.enum(["good", "ok", "poor"]),
      reason: z.string().min(1),
    }),
  ),
});

// Money in any spelling a model is likely to use: "$3.50", "$  5.00", "$.99", "US$12", "USD 25.00",
// "3.50 USD", "2 dollars", "40¢", "20-cent", "€9.99", "12,50 €", "50 EUR", "50 euros",
// "£7", "10 GBP", and the bare unit words and symbols. "pounds" is left alone: it is also a weight.
const AMOUNT = String.raw`(?:\d[\d,.]*\d|\d|\.\d+)`;
const WORD_UNIT = String.raw`(?:usd|eur|gbp|us\s+dollars?|dollars?|euros?|cents?|bucks)`;
const MONEY = new RegExp(
  [
    String.raw`(?:\bUS)?\$\s*${AMOUNT}`,
    String.raw`[€£]\s*${AMOUNT}`,
    String.raw`\b(?:usd|eur|gbp|us\s+dollars?|dollars?|euros?|bucks)\s*${AMOUNT}`,
    String.raw`${AMOUNT}[\s-]*${WORD_UNIT}\b`,
    String.raw`${AMOUNT}\s*[¢€£]`,
    String.raw`\b${WORD_UNIT}\b`,
    String.raw`[$¢€£]`,
  ].join("|"),
  "gi",
);

export function scrubMoney(text: string): string {
  return text.replace(MONEY, "the quoted price").replace(/\s{2,}/g, " ").trim();
}

/** Money out, and em or en dashes turned into commas so model prose matches the site's style. */
function cleanModelText(text: string): string {
  return scrubMoney(text.replace(/\s*[–—]\s*/g, ", "));
}

function scrubAdvice(advice: MaterialAdvice[]): MaterialAdvice[] {
  return advice.map((item) => ({
    material: item.material.replace(MONEY, "").trim(),
    fit: item.fit,
    reason: cleanModelText(item.reason),
  }));
}

export function reviewFromModel(
  input: unknown,
  provider: "openai" | "anthropic",
): AiReviewDTO {
  const parsed = modelReviewSchema.parse(input);
  return {
    provider,
    mocked: false,
    mockReason: null,
    summary: cleanModelText(parsed.summary),
    printable: parsed.printable,
    warnings: parsed.warnings.map((warning) => ({
      ...warning,
      title: cleanModelText(warning.title),
      detail: cleanModelText(warning.detail),
      fix: cleanModelText(warning.fix),
    })),
    orientationNote: cleanModelText(parsed.orientationNote),
    materialAdvice: scrubAdvice(parsed.materialAdvice),
  };
}

export function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced ? fenced[1] : text;
  return JSON.parse(raw.trim());
}
