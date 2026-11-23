import type { AiReviewDTO } from "@/lib/types";

const PROVIDER_LABELS: Record<AiReviewDTO["provider"], string> = {
  anthropic: "AI review · Claude",
  openai: "AI review · OpenAI",
  mock: "Built-in review",
};

export function reviewBadgeLabel(review: Pick<AiReviewDTO, "mocked" | "provider">): string {
  if (review.mocked) return "Built-in review";
  return PROVIDER_LABELS[review.provider] ?? "AI review";
}

/** Shown under the AI notes and repeated in the terms. Reviewed wording; keep the two in step. */
export const AI_NOTES_DISCLAIMER =
  "AI-written notes can be wrong. Use the amount shown at checkout. PlateQuote calculates that amount from the slicing estimate and the shop's rates for your selected options.";
