import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  QUOTE_ROUTE_MAX_MS,
  QUOTE_SAVE_RESERVE_MS,
  quoteDeadline,
  slicerTimeoutMs,
} from "@/lib/quote-budget";

describe("quote time budget", () => {
  it("matches the route's declared maxDuration", () => {
    const route = readFileSync(path.join(process.cwd(), "src/app/api/quotes/route.ts"), "utf8");
    const declared = Number(route.match(/export const maxDuration = (\d+);/)?.[1]);
    expect(declared * 1000).toBe(QUOTE_ROUTE_MAX_MS);
    expect(route).toMatch(/deadline,\s*\n\s*\}\);/);
  });

  it("finishes inside the route budget", () => {
    expect(quoteDeadline(0)).toBeLessThan(QUOTE_ROUTE_MAX_MS);
  });

  it("leaves the save reserve after a full-length slice", () => {
    const deadline = quoteDeadline(0);
    const slice = slicerTimeoutMs(deadline, 0) ?? Number.NaN;
    expect(slice + QUOTE_SAVE_RESERVE_MS).toBeLessThanOrEqual(deadline);
    expect(slicerTimeoutMs(deadline, 60_000)).toBe(deadline - 60_000 - QUOTE_SAVE_RESERVE_MS);
  });

  it("quote-service gives the slicer the remaining budget", () => {
    const source = readFileSync(path.join(process.cwd(), "src/lib/quote-service.ts"), "utf8");
    expect(source).not.toMatch(/AbortSignal\.timeout\(120_000\)/);
    expect(source).toMatch(/timeoutMs: slicerTimeoutMs\(deadline\)/);
  });
});
