import { jsonError } from "@/lib/http";

const buckets = new Map<string, number[]>();

export const LOGIN_LIMIT = 8;
export const LOGIN_WINDOW_MS = 15 * 60 * 1000;
export const QUOTE_IP_LIMIT = 10;
export const QUOTE_IP_WINDOW_MS = 10 * 60 * 1000;
export const QUOTE_GLOBAL_LIMIT = 30;
export const QUOTE_GLOBAL_WINDOW_MS = 10 * 60 * 1000;

export function resetRateLimits() {
  buckets.clear();
}

export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first.slice(0, 80);
  }
  const real = request.headers.get("x-real-ip")?.trim();
  if (real) return real.slice(0, 80);
  return "local";
}

export function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
  now = Date.now(),
): { ok: true } | { ok: false; retryAfterSeconds: number } {
  const fresh = (buckets.get(key) ?? []).filter((stamp) => now - stamp < windowMs);
  if (fresh.length >= limit) {
    const retryAfterSeconds = Math.max(1, Math.ceil((windowMs - (now - fresh[0])) / 1000));
    buckets.set(key, fresh);
    return { ok: false, retryAfterSeconds };
  }
  fresh.push(now);
  buckets.set(key, fresh);
  if (buckets.size > 500) {
    const oldest = buckets.keys().next().value;
    if (oldest) buckets.delete(oldest);
  }
  return { ok: true };
}

export function rateLimitResponse(retryAfterSeconds: number) {
  return jsonError(429, "rate_limited", `Too many requests. Try again in ${retryAfterSeconds} seconds.`, {
    "Retry-After": String(retryAfterSeconds),
  });
}

export function loginRateLimit(request: Request, now = Date.now()): Response | null {
  const result = rateLimit(`login:${clientIp(request)}`, LOGIN_LIMIT, LOGIN_WINDOW_MS, now);
  if (!result.ok) return rateLimitResponse(result.retryAfterSeconds);
  return null;
}

export function quoteRateLimit(request: Request, now = Date.now()): Response | null {
  const ip = clientIp(request);
  const perIp = rateLimit(`quote:${ip}`, QUOTE_IP_LIMIT, QUOTE_IP_WINDOW_MS, now);
  if (!perIp.ok) return rateLimitResponse(perIp.retryAfterSeconds);
  const globalHit = rateLimit("quote:global", QUOTE_GLOBAL_LIMIT, QUOTE_GLOBAL_WINDOW_MS, now);
  if (!globalHit.ok) return rateLimitResponse(globalHit.retryAfterSeconds);
  return null;
}
