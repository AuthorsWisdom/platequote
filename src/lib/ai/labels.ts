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
