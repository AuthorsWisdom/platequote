import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  AI_REVIEW_SAVE_RESERVE_MS,
  anthropicSupportsEffort,
  reviewPrint,
  reviewTimeoutMs,
  type ReviewInput,
} from "@/lib/ai/review";
import { scrubMoney } from "@/lib/ai/schema";
import { AI_NOTES_DISCLAIMER } from "@/lib/ai/labels";

const input: ReviewInput = {
  purpose: "general",
  selectedMaterial: "PLA",
  quantity: 1,
  bed: { x: 256, y: 256, z: 256 },
  mesh: {
    watertight: true,
    volumeCm3: 8,
    surfaceAreaCm2: 24,
    overhangFaceShare: 0.05,
    overhangThresholdDeg: 45,
    thinWall: false,
    characteristicThicknessMm: 6.6,
    fitsBed: true,
    fitsIfRotated: true,
    partCount: 1,
    triangleCount: 12,
    boundingBoxMm: { x: 20, y: 20, z: 20 },
  },
  slicer: {
    filamentGrams: 10,
    filamentCm3: 8,
    printTimeSeconds: 1800,
    supports: false,
    profileName: "generic-0.20mm-15pct-0.4nozzle",
    engine: "prusaslicer",
  },
  shopMaterialNames: ["PLA", "PETG"],
  mockReason: null,
};

const goodJson = JSON.stringify({
  summary: "Prints cleanly.",
  printable: true,
  warnings: [],
  orientationNote: "Print flat on the bed.",
  materialAdvice: [{ material: "PETG", fit: "ok", reason: "Tougher." }],
});

function anthropicResponse(text: string) {
  return new Response(JSON.stringify({ stop_reason: "end_turn", content: [{ type: "text", text }] }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

const ENV_KEYS = ["LLM_PROVIDER", "LLM_API_KEY", "LLM_MODEL", "LLM_TIMEOUT_MS", "NODE_ENV"] as const;
let saved: Record<string, string | undefined>;
const env = process.env as Record<string, string | undefined>;

beforeEach(() => {
  saved = Object.fromEntries(ENV_KEYS.map((key) => [key, env[key]]));
  for (const key of ENV_KEYS) delete env[key];
  env.LLM_PROVIDER = "anthropic";
  env.LLM_API_KEY = "test-key";
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete env[key];
    else env[key] = saved[key];
  }
  vi.unstubAllGlobals();
});

const PUBLIC_REASONS = /^[a-z0-9_]+$/;

describe("money filter", () => {
  it("strips spaced dollar signs and currency codes written before the number", () => {
    expect(scrubMoney("About $  5.00 each")).toBe("About the quoted price each");
    expect(scrubMoney("Estimated price: USD 25.00")).toBe("Estimated price: the quoted price");
    expect(scrubMoney("Roughly US$12 or 40¢ a part")).not.toMatch(/\d|\$|¢/);
    expect(scrubMoney("Call it €9.99 or £7")).not.toMatch(/\d|€|£/);
    expect(scrubMoney("Use 15% infill and 0.20 mm layers")).toBe("Use 15% infill and 0.20 mm layers");
  });
});

describe("fallback reasons are fixed public codes", () => {
  it("never forwards a parser message that quotes the model reply", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => anthropicResponse("Estimated price: $99.00 {not json")));
    const review = await reviewPrint(input);
    expect(review.mocked).toBe(true);
    expect(review.mockReason).toBe("model_bad_reply");
    expect(JSON.stringify(review)).not.toMatch(/99|\$/);
  });

  it("maps a reply that fails the schema to model_bad_reply", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => anthropicResponse('{"summary": "$5 total"}')));
    const review = await reviewPrint(input);
    expect(review.mockReason).toBe("model_bad_reply");
  });

  it("maps a network error to a fixed code, never its message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("socket hang up near $40.00 sk-ant-abcdefghijk");
      }),
    );
    const review = await reviewPrint(input);
    expect(review.mockReason).toBe("anthropic_unreachable");
    expect(review.mockReason).toMatch(PUBLIC_REASONS);
  });
});

describe("deadline", () => {
  it("skips the remote call when the remaining budget is too small", async () => {
    const fetchMock = vi.fn(async () => anthropicResponse(goodJson));
    vi.stubGlobal("fetch", fetchMock);
    const review = await reviewPrint(input, { deadline: Date.now() + AI_REVIEW_SAVE_RESERVE_MS + 200 });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(review.mocked).toBe(true);
    expect(review.mockReason).toBe("no_time_left");
  });

  it("cuts the call at the deadline minus the save reserve, not at LLM_TIMEOUT_MS", async () => {
    env.LLM_TIMEOUT_MS = "30000";
    const fetchMock = vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => reject(init.signal?.reason));
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const started = Date.now();
    const review = await reviewPrint(input, { deadline: started + AI_REVIEW_SAVE_RESERVE_MS + 1100 });
    const elapsed = Date.now() - started;
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(elapsed).toBeLessThan(3000);
    expect(review.mockReason).toBe("anthropic_timeout");
  });

  it("skips the remote call when the mesh could not be read", async () => {
    const fetchMock = vi.fn(async () => anthropicResponse(goodJson));
    vi.stubGlobal("fetch", fetchMock);
    const review = await reviewPrint({ ...input, mesh: null, slicer: null });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(review.mockReason).toBe("slice_failed");
  });

  it("skips the remote call when slicing failed but the mesh was read", async () => {
    const fetchMock = vi.fn(async () => anthropicResponse(goodJson));
    vi.stubGlobal("fetch", fetchMock);
    const review = await reviewPrint({ ...input, slicer: null });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(review.mockReason).toBe("slice_failed");
  });

  it("quote-service passes a deadline into the review", () => {
    const source = readFileSync(path.join(process.cwd(), "src/lib/quote-service.ts"), "utf8");
    expect(source).toMatch(/reviewPrint\([\s\S]*?\{\s*deadline\s*\}\s*\)/);
  });
});

describe("timeout bound", () => {
  it("clamps LLM_TIMEOUT_MS to an integer between 1000 and 30000", () => {
    env.LLM_TIMEOUT_MS = "999999999";
    expect(reviewTimeoutMs()).toBe(30_000);
    env.LLM_TIMEOUT_MS = "5";
    expect(reviewTimeoutMs()).toBe(1_000);
    env.LLM_TIMEOUT_MS = "2500.7";
    expect(reviewTimeoutMs()).toBe(2500);
    expect(Number.isInteger(reviewTimeoutMs())).toBe(true);
    env.LLM_TIMEOUT_MS = "abc";
    expect(reviewTimeoutMs()).toBe(15_000);
  });
});

describe("effort only on models that accept it", () => {
  it("knows the current models", () => {
    for (const model of ["claude-haiku-5-5", "claude-sonnet-5-5", "claude-opus-5-5", "claude-fable-5-2"]) {
      expect(anthropicSupportsEffort(model)).toBe(true);
    }
    for (const model of ["claude-sonnet-4-5", "claude-haiku-4-5", "claude-3-5-haiku-latest"]) {
      expect(anthropicSupportsEffort(model)).toBe(false);
    }
  });

  it("omits output_config for an override that does not support effort", async () => {
    const fetchMock = vi.fn(async () => anthropicResponse(goodJson));
    vi.stubGlobal("fetch", fetchMock);
    env.LLM_MODEL = "claude-sonnet-4-5";
    await reviewPrint(input);
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(String(init.body))).not.toHaveProperty("output_config");
  });

  it("sends low effort to the default model", async () => {
    const fetchMock = vi.fn(async () => anthropicResponse(goodJson));
    vi.stubGlobal("fetch", fetchMock);
    await reviewPrint(input);
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(String(init.body)).output_config).toEqual({ effort: "low" });
  });
});

describe("OpenAI-compatible provider", () => {
  it("falls back to the built-in reviewer in production and never calls out", async () => {
    const fetchMock = vi.fn(async () => anthropicResponse(goodJson));
    vi.stubGlobal("fetch", fetchMock);
    env.LLM_PROVIDER = "openai";
    env.NODE_ENV = "production";
    const review = await reviewPrint(input);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(review.mocked).toBe(true);
    expect(review.mockReason).toBe("provider_disabled");
  });
});

describe("body stall", () => {
  it("reports anthropic_timeout when the body stalls after headers", async () => {
    env.LLM_TIMEOUT_MS = "1000";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        const body = new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('{"stop_reason":'));
            init.signal?.addEventListener("abort", () => controller.error(init.signal?.reason));
          },
        });
        return new Response(body, { status: 200, headers: { "content-type": "application/json" } });
      }),
    );
    const started = Date.now();
    const review = await reviewPrint(input);
    expect(Date.now() - started).toBeLessThan(3000);
    expect(review.mockReason).toBe("anthropic_timeout");
  });
});

describe("customer-facing disclaimer", () => {
  const WORDING =
    "AI-written notes can be wrong. Use the amount shown at checkout. PlateQuote calculates that amount from the slicing estimate and the shop's rates for your selected options.";

  it("uses the reviewed wording and the quote page shows it", () => {
    expect(AI_NOTES_DISCLAIMER).toBe(WORDING);
    const ui = readFileSync(path.join(process.cwd(), "src/components/quote-result.tsx"), "utf8");
    expect(ui).toContain("AI_NOTES_DISCLAIMER");
    expect(ui).not.toMatch(/Every dollar figure/);
  });
});
