import { afterEach, describe, expect, it, vi } from "vitest";
import { workerHeaders, workerMisconfigured } from "./worker-auth";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("worker auth", () => {
  it("sends the shared token when one is configured", () => {
    vi.stubEnv("SLICER_WORKER_TOKEN", "platequote-dev-worker");
    expect(workerHeaders()).toEqual({ "X-Worker-Token": "platequote-dev-worker" });
  });

  it("sends nothing when the local token is unset", () => {
    vi.stubEnv("SLICER_WORKER_TOKEN", "");
    vi.stubEnv("RENDER", "");
    expect(workerHeaders()).toEqual({});
    expect(workerMisconfigured()).toBe(false);
  });

  it("fails closed on Render when the token is missing", () => {
    vi.stubEnv("SLICER_WORKER_TOKEN", "  ");
    vi.stubEnv("RENDER", "true");
    expect(workerMisconfigured()).toBe(true);
  });
});
