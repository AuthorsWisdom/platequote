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

const MONEY = /\$\s?\d|\b(?:usd|dollars?|cents?)\b/gi;

export function scrubMoney(text: string): string {
  return text.replace(MONEY, "the quoted price").replace(/\s{2,}/g, " ").trim();
}

function scrubAdvice(advice: MaterialAdvice[]): MaterialAdvice[] {
  return advice.map((item) => ({
    material: item.material.replace(MONEY, "").trim(),
    fit: item.fit,
    reason: scrubMoney(item.reason),
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
    summary: scrubMoney(parsed.summary),
    printable: parsed.printable,
    warnings: parsed.warnings.map((warning) => ({
      ...warning,
      title: scrubMoney(warning.title),
      detail: scrubMoney(warning.detail),
      fix: scrubMoney(warning.fix),
    })),
    orientationNote: scrubMoney(parsed.orientationNote),
    materialAdvice: scrubAdvice(parsed.materialAdvice),
  };
}

export function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced ? fenced[1] : text;
  return JSON.parse(raw.trim());
}
