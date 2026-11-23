import { afterEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { toPublicReason } from "@/lib/ai/reasons";
import { reviewTimeoutMs } from "@/lib/ai/review";
import { reviewFromModel, scrubMoney } from "@/lib/ai/schema";
import { quoteDeadline, slicerTimeoutMs } from "@/lib/quote-budget";

const env = process.env as Record<string, string | undefined>;
const savedTimeout = env.LLM_TIMEOUT_MS;
afterEach(() => {
  if (savedTimeout === undefined) delete env.LLM_TIMEOUT_MS;
  else env.LLM_TIMEOUT_MS = savedTimeout;
});

describe("stored fallback reasons", () => {
  it("keeps public codes and replaces anything else", () => {
    expect(toPublicReason(null)).toBeNull();
    expect(toPublicReason("anthropic_timeout")).toBe("anthropic_timeout");
    expect(toPublicReason("anthropic_http_529")).toBe("anthropic_http_529");
    expect(toPublicReason("Unexpected token E in JSON: Estimated price $99")).toBe("llm_failed");
    expect(toPublicReason(42)).toBe("llm_failed");
  });

  it("quote-service sanitizes reasons read back from the database", () => {
    const source = readFileSync(path.join(process.cwd(), "src/lib/quote-service.ts"), "utf8");
    const readReview = source.slice(source.indexOf("function readReview"), source.indexOf("export function toQuoteDTO"));
    expect(readReview).toMatch(/toPublicReason\(stored\.review\.mockReason\)/);
  });
});

describe("slicer budget", () => {
  it("skips the worker when less than a second is left", () => {
    const deadline = quoteDeadline(0);
    expect(slicerTimeoutMs(deadline, deadline - 5_500)).toBeNull();
    expect(slicerTimeoutMs(deadline, deadline + 10_000)).toBeNull();
    expect(slicerTimeoutMs(deadline, deadline - 7_000)).toBe(2_000);
  });

  it("quote-service returns the timeout result without calling the worker", () => {
    const source = readFileSync(path.join(process.cwd(), "src/lib/quote-service.ts"), "utf8");
    expect(source).toMatch(/if \(input\.timeoutMs === null\) return timedOut;/);
  });
});

describe("money filter, other spellings", () => {
  it("strips euro and pound codes, words, trailing symbols, and leading-dot amounts", () => {
    for (const text of ["About 50 EUR", "About 10 GBP", "About 50 euros", "About 12,50 €", "Only $.99", "A 20-cent part"]) {
      expect(scrubMoney(text)).not.toMatch(/\d|\$|€|£|\b(?:eur|gbp|euros?|cents?)\b/i);
    }
    expect(scrubMoney("Weighs 2 pounds, 0.20 mm layers, 15% infill")).toBe("Weighs 2 pounds, 0.20 mm layers, 15% infill");
  });
});

describe("timeout clamp", () => {
  it("clamps zero and negatives to the 1000 ms floor", () => {
    env.LLM_TIMEOUT_MS = "0";
    expect(reviewTimeoutMs()).toBe(1_000);
    env.LLM_TIMEOUT_MS = "-1";
    expect(reviewTimeoutMs()).toBe(1_000);
  });
});

describe("model prose", () => {
  it("turns em and en dashes into commas", () => {
    const review = reviewFromModel(
      {
        summary: "Prints well — no supports.",
        printable: true,
        warnings: [{ severity: "info", title: "Wall – thin", detail: "a — b", fix: "c – d" }],
        orientationNote: "Flat — on the bed.",
        materialAdvice: [{ material: "PETG", fit: "ok", reason: "Tough — heat safe." }],
      },
      "anthropic",
    );
    expect(JSON.stringify(review)).not.toMatch(/[–—]/);
    expect(review.summary).toBe("Prints well, no supports.");
  });
});

describe("terms and UI", () => {
  it("states training as Anthropic's default, and the UI has no em-dash placeholders", () => {
    const terms = readFileSync(path.join(process.cwd(), "src/app/terms/page.tsx"), "utf8");
    expect(terms).toContain("By default, Anthropic does not use inputs or outputs from its API to train its models.");
    for (const file of ["quote-result.tsx", "quote-studio.tsx", "order-board.tsx"]) {
      expect(readFileSync(path.join(process.cwd(), "src/components", file), "utf8")).not.toMatch(/[–—]/);
    }
  });
});
