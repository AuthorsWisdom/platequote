import { REVIEW_SYSTEM_PROMPT } from "@/lib/ai/prompt";
import { extractJson, reviewFromModel } from "@/lib/ai/schema";
import { mockReview, type MockReviewInput } from "@/lib/ai/mock";
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

function providerName(): "mock" | "openai" | "anthropic" {
  const raw = (process.env.LLM_PROVIDER || "mock").trim().toLowerCase();
  if (raw === "openai" || raw === "anthropic" || raw === "mock") return raw;
  return "mock";
}

export async function reviewPrint(input: ReviewInput): Promise<AiReviewDTO> {
  const provider = providerName();
  const apiKey = process.env.LLM_API_KEY?.trim();
  if (provider === "mock" || !apiKey) {
    const reason =
      provider !== "mock" && !apiKey ? "missing_api_key" : input.mockReason ?? "no_provider";
    return mockReview({ ...input, mockReason: reason === "no_provider" ? null : reason });
  }

  try {
    if (provider === "openai") return await openAiReview(input, apiKey);
    return await anthropicReview(input, apiKey);
  } catch (error) {
    const message = error instanceof Error ? error.message : "llm_failed";
    return mockReview({ ...input, mockReason: message.slice(0, 180) });
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

async function openAiReview(input: ReviewInput, apiKey: string): Promise<AiReviewDTO> {
  const base = (process.env.LLM_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
  const model = process.env.LLM_MODEL || "gpt-4o-mini";
  const response = await fetch(`${base}/chat/completions`, {
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
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    throw new Error(`openai_http_${response.status}`);
  }
  const body = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = body.choices?.[0]?.message?.content;
  if (!content) throw new Error("openai_empty");
  return reviewFromModel(extractJson(content), "openai");
}

async function anthropicReview(input: ReviewInput, apiKey: string): Promise<AiReviewDTO> {
  const model = process.env.LLM_MODEL || "claude-sonnet-4-5";
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: 1200,
      temperature: 0.2,
      system: REVIEW_SYSTEM_PROMPT,
      messages: [{ role: "user", content: JSON.stringify(userPayload(input)) }],
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    throw new Error(`anthropic_http_${response.status}`);
  }
  const body = (await response.json()) as {
    content?: Array<{ type: string; text?: string }>;
  };
  const text = body.content?.find((block) => block.type === "text")?.text;
  if (!text) throw new Error("anthropic_empty");
  return reviewFromModel(extractJson(text), "anthropic");
}
