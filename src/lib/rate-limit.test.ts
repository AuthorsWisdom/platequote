import { afterEach, describe, expect, it } from "vitest";
import {
  LOGIN_LIMIT,
  LOGIN_WINDOW_MS,
  QUOTE_GLOBAL_LIMIT,
  QUOTE_IP_LIMIT,
  loginRateLimit,
  quoteRateLimit,
  rateLimit,
  resetRateLimits,
} from "./rate-limit";

afterEach(() => {
  resetRateLimits();
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
