import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseSlicerResult } from "./slicer-result";

const cube = JSON.parse(
  readFileSync(path.join(__dirname, "fixtures/slicer-cube.json"), "utf8"),
);

describe("parseSlicerResult", () => {
  it("reads a successful slicer payload", () => {
    const parsed = parseSlicerResult(cube);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.filamentGrams).toBe(3.55);
    expect(parsed.printTimeSeconds).toBe(1024);
    expect(parsed.supports).toBe(false);
    expect(parsed.boundingBoxMm).toEqual({ x: 20, y: 20, z: 20 });
    expect(parsed.mesh.watertight).toBe(true);
  });

  it("rejects a success payload that omits grams", () => {
    const broken = { ...cube, filamentGrams: undefined };
    expect(() => parseSlicerResult(broken)).toThrow();
  });

  it("rejects negative grams and a non-boolean support flag", () => {
    expect(() => parseSlicerResult({ ...cube, filamentGrams: -1 })).toThrow();
    expect(() => parseSlicerResult({ ...cube, supports: "yes" })).toThrow();
  });

  it("accepts a failure payload with mesh facts and without a price", () => {
    const parsed = parseSlicerResult({
      ok: false,
      error: "does_not_fit_bed",
      message: "The part is larger than the bed.",
      mesh: cube.mesh,
    });
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.error).toBe("does_not_fit_bed");
    expect(parsed.mesh?.fitsBed).toBe(true);
    expect(parsed).not.toHaveProperty("filamentGrams");
  });

  it("rejects a failure with no message", () => {
    expect(() =>
      parseSlicerResult({ ok: false, error: "slice_failed", message: "", mesh: null }),
    ).toThrow();
  });
});
