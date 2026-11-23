import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ANTHROPIC_DEFAULT_MODEL, reviewPrint, type ReviewInput } from "@/lib/ai/review";
import { reviewBadgeLabel } from "@/lib/ai/labels";

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

const modelJson = {
  summary: "Prints cleanly. Expect about $3.50 of plastic.",
  printable: true,
  warnings: [{ severity: "info", title: "Small part", detail: "Costs 2 dollars.", fix: "None needed." }],
  orientationNote: "Print flat on the bed.",
  materialAdvice: [{ material: "PETG", fit: "ok", reason: "Tougher, around $5 more." }],
};

function anthropicResponse(text: string, stopReason = "end_turn") {
  return new Response(
    JSON.stringify({ stop_reason: stopReason, content: [{ type: "thinking", thinking: "" }, { type: "text", text }] }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

const ENV_KEYS = ["LLM_PROVIDER", "LLM_API_KEY", "LLM_MODEL", "LLM_TIMEOUT_MS"] as const;
let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
  for (const key of ENV_KEYS) delete process.env[key];
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
  vi.unstubAllGlobals();
});

describe("reviewPrint provider switching", () => {
  it("uses the built-in reviewer and never calls out when the provider is mock", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    process.env.LLM_PROVIDER = "mock";
    process.env.LLM_API_KEY = "test-key";
    const review = await reviewPrint(input);
    expect(review.mocked).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(reviewBadgeLabel(review)).toBe("Built-in review");
  });

  it("falls back with missing_api_key when anthropic has no key", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    process.env.LLM_PROVIDER = "anthropic";
    const review = await reviewPrint(input);
    expect(review.mocked).toBe(true);
    expect(review.mockReason).toBe("missing_api_key");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("calls the Messages API with the current request shape and labels the badge Claude", async () => {
    const fetchMock = vi.fn(async () => anthropicResponse(JSON.stringify(modelJson)));
    vi.stubGlobal("fetch", fetchMock);
    process.env.LLM_PROVIDER = "anthropic";
    process.env.LLM_API_KEY = "test-key";
    const review = await reviewPrint(input);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.anthropic.com/v1/messages");
    const headers = init.headers as Record<string, string>;
    expect(headers["x-api-key"]).toBe("test-key");
    expect(headers["anthropic-version"]).toBe("2023-06-01");
    expect(init.signal).toBeInstanceOf(AbortSignal);
    const body = JSON.parse(String(init.body));
    expect(body.model).toBe(ANTHROPIC_DEFAULT_MODEL);
    expect(body.model).toBe("claude-haiku-5-5");
    expect(body.max_tokens).toBeGreaterThan(0);
    expect(body).not.toHaveProperty("temperature");
    const sent = JSON.parse(body.messages[0].content);
    expect(Object.keys(sent).sort()).toEqual(
      ["bedMm", "mesh", "purpose", "quantity", "selectedMaterial", "shopMaterials", "slicer"].sort(),
    );

    expect(review.mocked).toBe(false);
    expect(review.provider).toBe("anthropic");
    expect(reviewBadgeLabel(review)).toBe("AI review · Claude");
  });

  it("honors an LLM_MODEL override", async () => {
    const fetchMock = vi.fn(async () => anthropicResponse(JSON.stringify(modelJson)));
    vi.stubGlobal("fetch", fetchMock);
    process.env.LLM_PROVIDER = "anthropic";
    process.env.LLM_API_KEY = "test-key";
    process.env.LLM_MODEL = "claude-sonnet-5-5";
    await reviewPrint(input);
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(String(init.body)).model).toBe("claude-sonnet-5-5");
  });

  it("strips every dollar amount the model wrote", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => anthropicResponse("```json\n" + JSON.stringify(modelJson) + "\n```")));
    process.env.LLM_PROVIDER = "anthropic";
    process.env.LLM_API_KEY = "test-key";
    const review = await reviewPrint(input);
    expect(review.mocked).toBe(false);
    const text = JSON.stringify(review);
    expect(text).not.toMatch(/\$/);
    expect(text.toLowerCase()).not.toMatch(/\bdollars?\b/);
    expect(text).not.toMatch(/quoted price[.,]\d|\d\s+the quoted price/);
    expect(review.summary).toBe("Prints cleanly. Expect about the quoted price of plastic.");
    expect(review.warnings[0].detail).toBe("Costs the quoted price.");
    expect(review.materialAdvice[0].reason).toBe("Tougher, around the quoted price more.");
    expect(review).not.toHaveProperty("priceCents");
  });

  it("falls back to the built-in reviewer when the call times out", async () => {
    const fetchMock = vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => reject(init.signal?.reason));
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    process.env.LLM_PROVIDER = "anthropic";
    process.env.LLM_API_KEY = "test-key";
    process.env.LLM_TIMEOUT_MS = "25";
    const started = Date.now();
    const review = await reviewPrint(input);
    expect(Date.now() - started).toBeLessThan(2000);
    expect(review.mocked).toBe(true);
    expect(review.mockReason).toBe("anthropic_timeout");
    expect(reviewBadgeLabel(review)).toBe("Built-in review");
  });

  it("falls back on an HTTP error, a refusal, and a truncated reply", async () => {
    process.env.LLM_PROVIDER = "anthropic";
    process.env.LLM_API_KEY = "test-key";

    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 529 })));
    expect((await reviewPrint(input)).mockReason).toBe("anthropic_http_529");

    vi.stubGlobal("fetch", vi.fn(async () => anthropicResponse("", "refusal")));
    expect((await reviewPrint(input)).mockReason).toBe("anthropic_refusal");

    vi.stubGlobal("fetch", vi.fn(async () => anthropicResponse('{"summary": "cut', "max_tokens")));
    expect((await reviewPrint(input)).mockReason).toBe("anthropic_truncated");
  });
});
