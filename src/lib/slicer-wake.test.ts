import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ prisma: {} }));

import { sliceUpload, WAKE_SLICE_RESERVE_MS, type SliceDeps } from "@/lib/quote-service";

const TOKEN = "tok-secret-do-not-log-1234";
const WAKING = "The slicer was waking up. Try again in a moment.";

const okSlice = {
  ok: true,
  filamentGrams: 10,
  filamentCm3: 8,
  filamentDensityGPerCm3: 1.24,
  printTimeSeconds: 1800,
  supports: false,
  profileName: "generic-0.20mm-15pct-0.4nozzle",
  engine: "prusaslicer",
  engineVersion: "2.8.1",
  boundingBoxMm: { x: 20, y: 20, z: 20 },
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
};

function input(timeoutMs: number | null = 110_000) {
  return {
    bytes: Buffer.from("solid x\nendsolid x\n"),
    extension: ".stl" as const,
    materialSlug: "pla",
    density: 1.24,
    bedXmm: 256,
    bedYmm: 256,
    bedZmm: 256,
    timeoutMs,
  };
}

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function html(status: number, body = "<html><body>Service waking up</body></html>") {
  return new Response(body, { status, headers: { "content-type": "text/html" } });
}

/** Fake clock: sleeping advances it, fetch takes `fetchMs` of it. */
function fakeDeps(fetchMs = 0) {
  let t = 1_000_000;
  const deps: SliceDeps = {
    now: () => t,
    sleep: async (ms) => {
      t += ms;
    },
  };
  return { deps, advance: (ms: number) => (t += ms), fetchMs, get t() { return t; } };
}

type Route = (url: string, init?: RequestInit) => Response | Promise<Response>;

function mockFetch(slice: Route[], health: Route, clock?: { advance: (ms: number) => number; fetchMs: number }) {
  let sliceCalls = 0;
  const fn = vi.fn(async (url: string | URL, init?: RequestInit) => {
    const u = String(url);
    if (clock) clock.advance(clock.fetchMs);
    if (u.endsWith("/slice")) {
      const route = slice[Math.min(sliceCalls, slice.length - 1)];
      sliceCalls += 1;
      return route(u, init);
    }
    if (u.endsWith("/health")) return health(u, init);
    throw new Error(`unexpected url ${u}`);
  });
  vi.stubGlobal("fetch", fn);
  return { fn, sliceCount: () => fn.mock.calls.filter(([u]) => String(u).endsWith("/slice")).length };
}

let warn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.stubEnv("SLICER_WORKER_URL", "https://worker.test");
  vi.stubEnv("SLICER_WORKER_TOKEN", TOKEN);
  vi.stubEnv("RENDER", "");
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  warn.mockRestore();
});

describe("sliceUpload wake and retry", () => {
  it("awake worker: one POST, no health probe", async () => {
    const clock = fakeDeps();
    const m = mockFetch([() => json(200, okSlice)], () => json(200, { ok: true }));
    const result = await sliceUpload(input(), clock.deps);
    expect(result.ok).toBe(true);
    expect(m.fn).toHaveBeenCalledTimes(1);
  });

  it("asleep (non-JSON) then awake: polls /health and succeeds with one retry", async () => {
    const clock = fakeDeps();
    let probes = 0;
    const m = mockFetch([() => html(503), () => json(200, okSlice)], () => {
      probes += 1;
      return probes < 3 ? html(503) : json(200, { ok: true });
    });
    const result = await sliceUpload(input(), clock.deps);
    expect(result.ok).toBe(true);
    expect(m.sliceCount()).toBe(2);
    expect(probes).toBe(3);
  });

  it("connection error and 502/504 count as asleep", async () => {
    for (const first of [
      () => {
        throw new TypeError("fetch failed");
      },
      () => json(502, { error: "bad gateway" }),
      () => json(504, { error: "gateway timeout" }),
      () => html(503),
    ] as Route[]) {
      const clock = fakeDeps();
      const m = mockFetch([first, () => json(200, okSlice)], () => json(200, { ok: true }));
      const result = await sliceUpload(input(), clock.deps);
      expect(result.ok).toBe(true);
      expect(m.sliceCount()).toBe(2);
    }
  });

  it("never retries more than once", async () => {
    const clock = fakeDeps();
    const m = mockFetch([() => html(503)], () => json(200, { ok: true }));
    const result = await sliceUpload(input(), clock.deps);
    expect(result.ok).toBe(false);
    expect(m.sliceCount()).toBe(2);
  });

  it("a real JSON slicer error is not retried", async () => {
    const clock = fakeDeps();
    const m = mockFetch(
      [() => json(422, { ok: false, error: "slice_failed", message: "The slicer could not slice this mesh.", mesh: null })],
      () => json(200, { ok: true }),
    );
    const result = await sliceUpload(input(), clock.deps);
    expect(result).toMatchObject({ ok: false, error: "slice_failed" });
    expect(m.fn).toHaveBeenCalledTimes(1);
  });

  it("a 401 is not retried and keeps the token message", async () => {
    const clock = fakeDeps();
    const m = mockFetch([() => json(401, { detail: "worker token missing or wrong" })], () => json(200, { ok: true }));
    const result = await sliceUpload(input(), clock.deps);
    expect(m.fn).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ ok: false, error: "worker_unauthorized" });
  });

  it("a worker JSON 503 (token not configured) is not retried", async () => {
    const clock = fakeDeps();
    const m = mockFetch([() => json(503, { detail: "worker token is not configured" })], () => json(200, { ok: true }));
    const result = await sliceUpload(input(), clock.deps);
    expect(m.fn).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ ok: false, error: "worker_unauthorized" });
  });

  it("budget exhausted while waking returns the waking message inside the budget", async () => {
    const clock = fakeDeps(500);
    const start = clock.t;
    const budget = 30_000;
    const m = mockFetch([() => html(503), () => json(200, okSlice)], () => html(503));
    const result = await sliceUpload(input(budget), clock.deps);
    expect(result).toMatchObject({ ok: false, error: "worker_waking", message: WAKING });
    expect(m.sliceCount()).toBe(1);
    expect(clock.t - start).toBeLessThanOrEqual(budget - WAKE_SLICE_RESERVE_MS + 500);
  });

  it("the token never appears in logs, even when the body echoes it (plain or encoded)", async () => {
    const entities = [...TOKEN].map((ch) => `&#${ch.charCodeAt(0)};`).join("");
    const escaped = [...TOKEN].map((ch) => `\\u${ch.charCodeAt(0).toString(16).padStart(4, "0")}`).join("");
    const clock = fakeDeps();
    mockFetch(
      [() => html(503, `<html>X-Worker-Token: ${TOKEN} ${entities} ${escaped}</html>`), () => { throw new TypeError(`fetch failed ${TOKEN}`); }],
      () => json(200, { ok: true }),
    );
    await sliceUpload(input(), clock.deps);
    const logged = warn.mock.calls.map((c: unknown[]) => c.join(" ")).join("\n");
    expect(logged).toContain("status 503");
    expect(logged).toContain("could not connect");
    for (const secret of [TOKEN, entities, escaped, entities.slice(0, 40), escaped.slice(0, 40)]) {
      expect(logged).not.toContain(secret);
    }
  });

  it("a short token echoed in the body or error is never logged", async () => {
    vi.stubEnv("SLICER_WORKER_TOKEN", "pq9short");
    const clock = fakeDeps();
    mockFetch(
      [
        () => new Response("<p>token pq9short %70%71%39 here</p>", { status: 503, headers: { "content-type": "pq9short" } }),
        () => { throw new TypeError("fetch failed pq9short", { cause: { code: "pq9short" } }); },
      ],
      () => json(200, { ok: true }),
    );
    await sliceUpload(input(), clock.deps);
    const logged = warn.mock.calls.map((c: unknown[]) => c.join(" ")).join("\n");
    expect(logged).toContain("status 503");
    expect(logged).not.toContain("pq9short");
    expect(logged).not.toContain("%70");
  });

  it("logs status, media type, length and connect code, never body text", async () => {
    const clock = fakeDeps();
    mockFetch(
      [
        () => html(503, "<title>Service waking</title>" + "word ".repeat(1000)),
        () => { throw new TypeError("fetch failed", { cause: { code: "ECONNREFUSED" } }); },
      ],
      () => json(200, { ok: true }),
    );
    await sliceUpload(input(), clock.deps);
    const logged = warn.mock.calls.map((c: unknown[]) => c.join(" ")).join("\n");
    expect(logged).toContain("status 503");
    expect(logged).toContain("content-type text/html");
    expect(logged).toContain("not JSON");
    expect(logged).toContain("ECONNREFUSED");
    expect(logged).not.toContain("word");
    expect(logged).not.toContain("waking</title>");
  });

  it("health must be the worker's 200 {ok: true}, not any JSON", async () => {
    const clock = fakeDeps();
    let probes = 0;
    const m = mockFetch([() => html(503), () => json(200, okSlice)], () => {
      probes += 1;
      if (probes === 1) return json(200, { ok: false });
      if (probes === 2) return json(200, { status: "proxy" });
      if (probes === 3) return json(202, { ok: true });
      return json(200, { ok: true });
    });
    const result = await sliceUpload(input(), clock.deps);
    expect(result.ok).toBe(true);
    expect(probes).toBe(4);
    expect(m.sliceCount()).toBe(2);
  });

  it("a POST timeout is not retried", async () => {
    const clock = fakeDeps();
    const m = mockFetch(
      [() => { throw new DOMException("timed out", "TimeoutError"); }],
      () => json(200, { ok: true }),
    );
    const result = await sliceUpload(input(), clock.deps);
    expect(result).toMatchObject({ ok: false, error: "worker_timeout" });
    expect(m.fn).toHaveBeenCalledTimes(1);
  });

  it("a body that stalls until the POST signal aborts is not retried", async () => {
    const clock = fakeDeps();
    let started = 0;
    const m = mockFetch(
      [
        (_u, init) => {
          started = Date.now();
          const signal = init?.signal as AbortSignal;
          return {
            status: 200,
            headers: new Headers(),
            text: () =>
              new Promise<string>((_resolve, reject) => {
                signal.addEventListener("abort", () => reject(signal.reason));
              }),
          } as unknown as Response;
        },
      ],
      () => json(200, { ok: true }),
    );
    const result = await sliceUpload(input(1_200), clock.deps);
    expect(result).toMatchObject({ ok: false, error: "worker_timeout" });
    expect(m.fn).toHaveBeenCalledTimes(1);
    expect(Date.now() - started).toBeGreaterThanOrEqual(1_000);
  });

  it("each POST timeout ends by the slice budget, including the retry", async () => {
    const clock = fakeDeps(700);
    const start = clock.t;
    const budget = 40_000;
    const timeouts: Array<{ at: number; ms: number }> = [];
    const real = AbortSignal.timeout.bind(AbortSignal);
    const spy = vi.spyOn(AbortSignal, "timeout").mockImplementation((ms: number) => {
      timeouts.push({ at: clock.t, ms });
      return real(ms);
    });
    let probes = 0;
    const m = mockFetch([() => html(503), () => json(200, okSlice)], () => {
      probes += 1;
      return probes < 8 ? html(503) : json(200, { ok: true });
    });
    const result = await sliceUpload(input(budget), clock.deps);
    spy.mockRestore();
    expect(result.ok).toBe(true);
    expect(m.sliceCount()).toBe(2);
    const posts = m.fn.mock.calls
      .map(([u], i) => ({ u: String(u), i }))
      .filter(({ u }) => u.endsWith("/slice"));
    expect(posts).toHaveLength(2);
    for (const t of timeouts) expect(t.at + t.ms).toBeLessThanOrEqual(start + budget);
  });
});
