import { ZodError } from "zod";
import { REVIEW_SYSTEM_PROMPT } from "@/lib/ai/prompt";
import { extractJson, reviewFromModel } from "@/lib/ai/schema";
import { mockReview, type MockReviewInput } from "@/lib/ai/mock";
import { QUOTE_SAVE_RESERVE_MS } from "@/lib/quote-budget";
import type { AiReviewDTO } from "@/lib/types";

export type ReviewInput = MockReviewInput & {
  quantity: number;
  slicer: {
    filamentGrams: number;
    filamentCm3: number;
    printTimeSeconds: number;
    supports: boolean;
    profileName: string;
    engine: string;
  } | null;
};

export type ReviewOptions = {
  /** Epoch milliseconds by which the review must have returned so the quote can still be saved. */
  deadline?: number;
};

/** Time kept back from the deadline for pricing and the database write after the review. */
export const AI_REVIEW_SAVE_RESERVE_MS = QUOTE_SAVE_RESERVE_MS;
/** Below this much remaining time a remote call is not worth starting. */
const MIN_CALL_MS = 1_000;

/**
 * The only strings that can reach the customer as a fallback reason. Raw error messages never do:
 * a parser message can quote the model reply, and a network message can carry anything.
 */
class ReviewFailure extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "ReviewFailure";
  }
}

function providerName(): "mock" | "openai" | "anthropic" {
  const raw = (process.env.LLM_PROVIDER || "mock").trim().toLowerCase();
  if (raw === "openai" || raw === "anthropic" || raw === "mock") return raw;
  return "mock";
}

function builtIn(input: ReviewInput, reason: string | null): AiReviewDTO {
  return mockReview({ ...input, mockReason: reason });
}

export async function reviewPrint(input: ReviewInput, options: ReviewOptions = {}): Promise<AiReviewDTO> {
  const provider = providerName();
  if (provider === "mock") return builtIn(input, input.mockReason ?? null);
  // The terms disclose Claude as the only outside reviewer, so the OpenAI-compatible path is dev only.
  if (provider === "openai" && process.env.NODE_ENV === "production") return builtIn(input, "provider_disabled");
  const apiKey = process.env.LLM_API_KEY?.trim();
  if (!apiKey) return builtIn(input, "missing_api_key");
  // No mesh facts or no slicer estimate: nothing for a model to add, and no reason to spend time.
  if (!input.mesh || !input.slicer) return builtIn(input, "slice_failed");

  const timeoutMs = callBudgetMs(options.deadline);
  if (timeoutMs < MIN_CALL_MS) return builtIn(input, "no_time_left");

  try {
    if (provider === "openai") return await openAiReview(input, apiKey, timeoutMs);
    return await anthropicReview(input, apiKey, timeoutMs);
  } catch (error) {
    return builtIn(input, publicFailureCode(error));
  }
}

function callBudgetMs(deadline: number | undefined): number {
  const configured = reviewTimeoutMs();
  if (deadline === undefined) return configured;
  return Math.min(configured, Math.floor(deadline - Date.now() - AI_REVIEW_SAVE_RESERVE_MS));
}

function publicFailureCode(error: unknown): string {
  if (error instanceof ReviewFailure) return error.code;
  if (error instanceof SyntaxError || error instanceof ZodError) return "model_bad_reply";
  return "llm_failed";
}

function isAbort(error: unknown): boolean {
  return error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
}

/** Runs the whole exchange, headers and body, under one timeout and maps an abort to `<prefix>_timeout`. */
async function timedJson<T>(
  prefix: "anthropic" | "openai",
  timeoutMs: number,
  send: (signal: AbortSignal) => Promise<Response>,
): Promise<T> {
  const signal = AbortSignal.timeout(timeoutMs);
  try {
    const response = await send(signal);
    if (!response.ok) throw new ReviewFailure(`${prefix}_http_${response.status}`);
    try {
      return (await response.json()) as T;
    } catch (error) {
      if (isAbort(error) || signal.aborted) throw new ReviewFailure(`${prefix}_timeout`);
      throw new ReviewFailure(`${prefix}_bad_body`);
    }
  } catch (error) {
    if (error instanceof ReviewFailure) throw error;
    if (isAbort(error) || signal.aborted) throw new ReviewFailure(`${prefix}_timeout`);
    throw new ReviewFailure(`${prefix}_unreachable`);
  }
}

function userPayload(input: ReviewInput) {
  return {
    purpose: input.purpose,
    selectedMaterial: input.selectedMaterial,
    quantity: input.quantity,
    bedMm: input.bed,
    shopMaterials: input.shopMaterialNames,
    mesh: input.mesh,
    slicer: input.slicer,
  };
}

async function openAiReview(input: ReviewInput, apiKey: string, timeoutMs: number): Promise<AiReviewDTO> {
  const base = (process.env.LLM_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
  const model = process.env.LLM_MODEL || "gpt-4o-mini";
  const body = await timedJson<{ choices?: Array<{ message?: { content?: string } }> }>(
    "openai",
    timeoutMs,
    (signal) =>
      fetch(`${base}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          temperature: 0.2,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: REVIEW_SYSTEM_PROMPT },
            { role: "user", content: JSON.stringify(userPayload(input)) },
          ],
        }),
        signal,
      }),
  );
  const content = body.choices?.[0]?.message?.content;
  if (!content) throw new ReviewFailure("openai_empty");
  return reviewFromModel(extractJson(content), "openai");
}

export const ANTHROPIC_DEFAULT_MODEL = "claude-haiku-5-5";
const DEFAULT_TIMEOUT_MS = 15_000;
const MIN_TIMEOUT_MS = 1_000;
const MAX_TIMEOUT_MS = 30_000;

/** LLM_TIMEOUT_MS as an integer clamped to 1000..30000; anything unreadable gives the 15000 default. */
export function reviewTimeoutMs(): number {
  const raw = Number(process.env.LLM_TIMEOUT_MS);
  if (!process.env.LLM_TIMEOUT_MS?.trim() || !Number.isFinite(raw) || raw <= 0) return DEFAULT_TIMEOUT_MS;
  return Math.min(MAX_TIMEOUT_MS, Math.max(MIN_TIMEOUT_MS, Math.trunc(raw)));
}

// Models that accept output_config.effort (claude-api skill, models cached 2026-11-03). Sonnet 4.5,
// Haiku 4.5, and older reject it, so an override to one of those is sent without it.
const EFFORT_MODELS = new Set([
  "claude-haiku-5-5",
  "claude-sonnet-5-5",
  "claude-sonnet-5",
  "claude-sonnet-4-6",
  "claude-opus-5-5",
  "claude-opus-5",
  "claude-opus-4-8",
  "claude-opus-4-7",
  "claude-opus-4-6",
  "claude-fable-5-2",
  "claude-fable-5-1",
  "claude-fable-5",
]);

export function anthropicSupportsEffort(model: string): boolean {
  return EFFORT_MODELS.has(model.trim().toLowerCase());
}

// Current Claude models reject non-default temperature, so none is sent. Thinking is on by
// default on Haiku 5.5 and Sonnet 5.5 and counts toward max_tokens; low effort keeps a short
// printability note fast and leaves room for the JSON.
async function anthropicReview(input: ReviewInput, apiKey: string, timeoutMs: number): Promise<AiReviewDTO> {
  const model = process.env.LLM_MODEL?.trim() || ANTHROPIC_DEFAULT_MODEL;
  const request: Record<string, unknown> = {
    model,
    max_tokens: 4000,
    system: REVIEW_SYSTEM_PROMPT,
    messages: [{ role: "user", content: JSON.stringify(userPayload(input)) }],
  };
  if (anthropicSupportsEffort(model)) request.output_config = { effort: "low" };
  const body = await timedJson<{ stop_reason?: string; content?: Array<{ type: string; text?: string }> }>(
    "anthropic",
    timeoutMs,
    (signal) =>
      fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify(request),
        signal,
      }),
  );
  if (body.stop_reason === "refusal") throw new ReviewFailure("anthropic_refusal");
  if (body.stop_reason === "max_tokens") throw new ReviewFailure("anthropic_truncated");
  const text = body.content?.find((block) => block.type === "text")?.text;
  if (!text) throw new ReviewFailure("anthropic_empty");
  return reviewFromModel(extractJson(text), "anthropic");
}
