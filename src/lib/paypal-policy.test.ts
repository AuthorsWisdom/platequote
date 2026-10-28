import { afterEach, describe, expect, it, vi } from "vitest";
import { unverifiedWebhooksPermitted } from "./paypal-policy";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("unverifiedWebhooksPermitted", () => {
  it("allows the flag only outside production", () => {
    vi.stubEnv("PAYPAL_ALLOW_UNVERIFIED_WEBHOOKS", "true");
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("RENDER", "");
    vi.stubEnv("RENDER_SERVICE_ID", "");
    expect(unverifiedWebhooksPermitted()).toBe(true);
  });

  it("ignores the flag in production and on Render", () => {
    vi.stubEnv("PAYPAL_ALLOW_UNVERIFIED_WEBHOOKS", "true");
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("RENDER", "");
    vi.stubEnv("RENDER_SERVICE_ID", "");
    expect(unverifiedWebhooksPermitted()).toBe(false);

    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("RENDER", "true");
    expect(unverifiedWebhooksPermitted()).toBe(false);
  });

  it("stays off when the flag is unset", () => {
    vi.stubEnv("PAYPAL_ALLOW_UNVERIFIED_WEBHOOKS", "");
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("RENDER", "");
    expect(unverifiedWebhooksPermitted()).toBe(false);
  });
});
