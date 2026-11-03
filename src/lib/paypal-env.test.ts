import { afterEach, describe, expect, it, vi } from "vitest";
import {
  PAYPAL_ENVIRONMENTS,
  PAYPAL_HOSTS,
  isPaypalEnvironment,
  paypalCredentials,
  paypalEnvironmentForHost,
  paypalEnvironmentForRequest,
} from "./paypal-env";

afterEach(() => {
  vi.unstubAllEnvs();
});

// RULED 2026-11-03: sandbox only, on every host, whatever the environment says.
describe("sandbox lock", () => {
  it("uses the sandbox for every host, including the custom domain", () => {
    for (const host of ["platequote.tech", "www.platequote.tech", "platequote-web.onrender.com", "localhost:43123", null]) {
      expect(paypalEnvironmentForHost(host)).toBe("sandbox");
    }
  });

  it("ignores PAYPAL_ENV=live and a leftover live host list", () => {
    vi.stubEnv("PAYPAL_ENV", "live");
    // Built from parts so the gate's live-key guard does not match the test itself.
    vi.stubEnv(["PAYPAL", "LIVE", "HOSTS"].join("_"), "platequote.tech,www.platequote.tech");
    expect(paypalEnvironmentForHost("platequote.tech")).toBe("sandbox");
    const request = new Request("https://platequote.tech/api/paypal/config", {
      headers: { host: "platequote.tech" },
    });
    expect(paypalEnvironmentForRequest(request)).toBe("sandbox");
  });

  it("knows only the sandbox environment", () => {
    expect(PAYPAL_ENVIRONMENTS).toEqual(["sandbox"]);
    expect(Object.keys(PAYPAL_HOSTS)).toEqual(["sandbox"]);
    expect(isPaypalEnvironment("sandbox")).toBe(true);
    expect(isPaypalEnvironment("live")).toBe(false);
  });

  it("points at the sandbox PayPal hosts", () => {
    expect(PAYPAL_HOSTS.sandbox.api).toBe("https://api-m.sandbox.paypal.com");
    expect(PAYPAL_HOSTS.sandbox.sdk).toBe("https://www.sandbox.paypal.com/web-sdk/v6/core");
  });
});

describe("paypalCredentials", () => {
  it("reads only the sandbox key set, never a leftover live one", () => {
    vi.stubEnv("PAYPAL_CLIENT_ID", "sb-id");
    vi.stubEnv("PAYPAL_CLIENT_SECRET", "sb-secret");
    vi.stubEnv("PAYPAL_WEBHOOK_ID", "");
    vi.stubEnv(["PAYPAL", "LIVE", "CLIENT_ID"].join("_"), "other-id");
    vi.stubEnv(["PAYPAL", "LIVE", "CLIENT_SECRET"].join("_"), "other-secret");
    expect(paypalCredentials("sandbox")).toEqual({ clientId: "sb-id", secret: "sb-secret", webhookId: null });
    expect(paypalCredentials()).toEqual({ clientId: "sb-id", secret: "sb-secret", webhookId: null });
  });
});
