import { afterEach, describe, expect, it, vi } from "vitest";
import {
  PAYPAL_HOSTS,
  normalizeHost,
  paypalCredentials,
  paypalEnvironmentForHost,
  paypalEnvironmentForRequest,
} from "./paypal-env";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("paypalEnvironmentForHost", () => {
  it("defaults to the sandbox when nothing is set", () => {
    vi.stubEnv("PAYPAL_ENV", "");
    vi.stubEnv("PAYPAL_LIVE_HOSTS", "");
    expect(paypalEnvironmentForHost("platequote.tech")).toBe("sandbox");
    expect(paypalEnvironmentForHost(null)).toBe("sandbox");
  });

  it("sends only the listed hosts to live and keeps the rest on the sandbox", () => {
    vi.stubEnv("PAYPAL_ENV", "sandbox");
    vi.stubEnv("PAYPAL_LIVE_HOSTS", "platequote.tech, www.platequote.tech");
    expect(paypalEnvironmentForHost("platequote.tech")).toBe("live");
    expect(paypalEnvironmentForHost("WWW.PlateQuote.tech:443")).toBe("live");
    expect(paypalEnvironmentForHost("platequote-web.onrender.com")).toBe("sandbox");
    expect(paypalEnvironmentForHost("localhost:43123")).toBe("sandbox");
  });

  it("does not match a host that merely contains a live host", () => {
    vi.stubEnv("PAYPAL_LIVE_HOSTS", "platequote.tech");
    expect(paypalEnvironmentForHost("platequote.tech.evil.example")).toBe("sandbox");
    expect(paypalEnvironmentForHost("notplatequote.tech")).toBe("sandbox");
  });

  it("treats PAYPAL_ENV=live as the default for every host", () => {
    vi.stubEnv("PAYPAL_ENV", "live");
    vi.stubEnv("PAYPAL_LIVE_HOSTS", "");
    expect(paypalEnvironmentForHost("platequote-web.onrender.com")).toBe("live");
  });

  it("rejects any other PAYPAL_ENV value by falling back to the sandbox", () => {
    vi.stubEnv("PAYPAL_ENV", "production");
    expect(paypalEnvironmentForHost("platequote.tech")).toBe("sandbox");
  });

  it("reads the Host header of a request", () => {
    vi.stubEnv("PAYPAL_LIVE_HOSTS", "platequote.tech");
    const live = new Request("https://ignored.example/api/paypal/config", {
      headers: { host: "platequote.tech" },
    });
    const sandbox = new Request("https://ignored.example/api/paypal/config", {
      headers: { host: "platequote-web.onrender.com" },
    });
    expect(paypalEnvironmentForRequest(live)).toBe("live");
    expect(paypalEnvironmentForRequest(sandbox)).toBe("sandbox");
  });
});

describe("normalizeHost", () => {
  it("lowercases and strips the port", () => {
    expect(normalizeHost("PlateQuote.tech:443")).toBe("platequote.tech");
    expect(normalizeHost("[::1]:3000")).toBe("[::1]");
    expect(normalizeHost("")).toBeNull();
    expect(normalizeHost("bad host")).toBeNull();
  });
});

describe("paypalCredentials", () => {
  it("keeps the sandbox and live key sets apart", () => {
    vi.stubEnv("PAYPAL_CLIENT_ID", "sb-id");
    vi.stubEnv("PAYPAL_CLIENT_SECRET", "sb-secret");
    vi.stubEnv("PAYPAL_WEBHOOK_ID", "");
    vi.stubEnv("PAYPAL_LIVE_CLIENT_ID", "live-id");
    vi.stubEnv("PAYPAL_LIVE_CLIENT_SECRET", "live-secret");
    vi.stubEnv("PAYPAL_LIVE_WEBHOOK_ID", "live-hook");
    expect(paypalCredentials("sandbox")).toEqual({ clientId: "sb-id", secret: "sb-secret", webhookId: null });
    expect(paypalCredentials("live")).toEqual({
      clientId: "live-id",
      secret: "live-secret",
      webhookId: "live-hook",
    });
  });
});

describe("PAYPAL_HOSTS", () => {
  it("points each environment at its own PayPal hosts", () => {
    expect(PAYPAL_HOSTS.sandbox.api).toBe("https://api-m.sandbox.paypal.com");
    expect(PAYPAL_HOSTS.sandbox.sdk).toContain("www.sandbox.paypal.com");
    expect(PAYPAL_HOSTS.live.api).toBe("https://api-m.paypal.com");
    expect(PAYPAL_HOSTS.live.sdk).toBe("https://www.paypal.com/web-sdk/v6/core");
  });
});
