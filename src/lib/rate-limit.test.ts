import { afterEach, describe, expect, it, vi } from "vitest";
import {
  LOGIN_GLOBAL_LIMIT,
  LOGIN_LIMIT,
  LOGIN_WINDOW_MS,
  PAYPAL_IP_LIMIT,
  PAYPAL_IP_WINDOW_MS,
  QUOTE_GLOBAL_LIMIT,
  QUOTE_IP_LIMIT,
  clientIp,
  loginRateLimit,
  paypalRateLimit,
  quoteRateLimit,
  rateLimit,
  resetRateLimits,
} from "./rate-limit";

afterEach(() => {
  resetRateLimits();
  vi.unstubAllEnvs();
});

function requestFrom(ip: string) {
  return new Request("http://localhost/api/quotes", { headers: { "x-forwarded-for": ip } });
}

describe("rateLimit", () => {
  it("allows a burst and then blocks until the window moves", () => {
    const start = 1_000_000;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      expect(rateLimit("k", 3, 10_000, start + attempt).ok).toBe(true);
    }
    const blocked = rateLimit("k", 3, 10_000, start + 4);
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
    expect(rateLimit("k", 3, 10_000, start + 10_001).ok).toBe(true);
  });

  it("keeps keys separate", () => {
    expect(rateLimit("a", 1, 1000, 0).ok).toBe(true);
    expect(rateLimit("b", 1, 1000, 0).ok).toBe(true);
    expect(rateLimit("a", 1, 1000, 1).ok).toBe(false);
  });
});

describe("login and quote limits", () => {
  it("limits login attempts per IP", () => {
    const now = 5_000_000;
    for (let attempt = 0; attempt < LOGIN_LIMIT; attempt += 1) {
      expect(loginRateLimit(requestFrom("203.0.113.5"), now + attempt)).toBeNull();
    }
    const blocked = loginRateLimit(requestFrom("203.0.113.5"), now + LOGIN_LIMIT);
    expect(blocked?.status).toBe(429);
    expect(blocked?.headers.get("retry-after")).toBeTruthy();
    expect(loginRateLimit(requestFrom("203.0.113.6"), now + LOGIN_LIMIT)).toBeNull();
    expect(loginRateLimit(requestFrom("203.0.113.5"), now + LOGIN_WINDOW_MS + LOGIN_LIMIT)).toBeNull();
  });

  it("limits quote creation per IP and globally", () => {
    const now = 9_000_000;
    for (let attempt = 0; attempt < QUOTE_IP_LIMIT; attempt += 1) {
      expect(quoteRateLimit(requestFrom("198.51.100.4"), now)).toBeNull();
    }
    expect(quoteRateLimit(requestFrom("198.51.100.4"), now)?.status).toBe(429);
    expect(quoteRateLimit(requestFrom("198.51.100.9"), now)).toBeNull();

    resetRateLimits();
    for (let attempt = 0; attempt < QUOTE_GLOBAL_LIMIT; attempt += 1) {
      expect(quoteRateLimit(requestFrom(`198.51.100.${attempt}`), now)).toBeNull();
    }
    expect(quoteRateLimit(requestFrom("203.0.113.50"), now)?.status).toBe(429);
  });
});

describe("clientIp", () => {
  it("uses the right-most X-Forwarded-For hop, which the proxy appends", () => {
    expect(clientIp(requestFrom("203.0.113.7"))).toBe("203.0.113.7");
    expect(clientIp(requestFrom("1.2.3.4, 203.0.113.7"))).toBe("203.0.113.7");
    expect(clientIp(requestFrom("spoofed, 9.9.9.9 ,  203.0.113.7 "))).toBe("203.0.113.7");
  });

  it("honours TRUSTED_PROXY_HOPS and falls back to 1 for bad values", () => {
    vi.stubEnv("TRUSTED_PROXY_HOPS", "2");
    expect(clientIp(requestFrom("1.2.3.4, 203.0.113.7, 10.0.0.1"))).toBe("203.0.113.7");
    expect(clientIp(requestFrom("203.0.113.7"))).toBe("203.0.113.7");
    vi.stubEnv("TRUSTED_PROXY_HOPS", "nope");
    expect(clientIp(requestFrom("1.2.3.4, 203.0.113.7"))).toBe("203.0.113.7");
    vi.stubEnv("TRUSTED_PROXY_HOPS", "0");
    expect(clientIp(requestFrom("1.2.3.4, 203.0.113.7"))).toBe("203.0.113.7");
  });

  it("falls back to X-Real-IP, then local", () => {
    expect(clientIp(new Request("http://localhost/", { headers: { "x-real-ip": "198.51.100.1" } }))).toBe("198.51.100.1");
    expect(clientIp(new Request("http://localhost/"))).toBe("local");
  });

  it("does not let a rotating client-set prefix dodge the login limit", () => {
    const now = 6_000_000;
    for (let attempt = 0; attempt < LOGIN_LIMIT; attempt += 1) {
      expect(loginRateLimit(requestFrom(`10.9.${attempt}.1, 203.0.113.5`), now + attempt)).toBeNull();
    }
    expect(loginRateLimit(requestFrom("10.99.99.99, 203.0.113.5"), now + LOGIN_LIMIT)?.status).toBe(429);
  });
});

describe("global login limit", () => {
  it("caps login attempts across all IPs", () => {
    const now = 7_000_000;
    for (let attempt = 0; attempt < LOGIN_GLOBAL_LIMIT; attempt += 1) {
      expect(loginRateLimit(requestFrom(`198.51.${Math.floor(attempt / 200)}.${attempt % 200}`), now)).toBeNull();
    }
    expect(loginRateLimit(requestFrom("203.0.113.250"), now)?.status).toBe(429);
    expect(loginRateLimit(requestFrom("203.0.113.250"), now + LOGIN_WINDOW_MS + 1)).toBeNull();
  });
});

describe("paypalRateLimit", () => {
  it("limits PayPal checkout calls per IP", () => {
    const now = 8_000_000;
    for (let attempt = 0; attempt < PAYPAL_IP_LIMIT; attempt += 1) {
      expect(paypalRateLimit(requestFrom("198.51.100.77"), now)).toBeNull();
    }
    const blocked = paypalRateLimit(requestFrom("198.51.100.77"), now);
    expect(blocked?.status).toBe(429);
    expect(blocked?.headers.get("retry-after")).toBeTruthy();
    expect(paypalRateLimit(requestFrom("198.51.100.78"), now)).toBeNull();
    expect(paypalRateLimit(requestFrom("198.51.100.77"), now + PAYPAL_IP_WINDOW_MS)).toBeNull();
  });
});
