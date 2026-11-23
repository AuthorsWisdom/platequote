import { jsonError } from "@/lib/http";

const buckets = new Map<string, number[]>();

export const LOGIN_LIMIT = 8;
export const LOGIN_WINDOW_MS = 15 * 60 * 1000;
export const QUOTE_IP_LIMIT = 10;
export const QUOTE_IP_WINDOW_MS = 10 * 60 * 1000;
export const QUOTE_GLOBAL_LIMIT = 30;
export const QUOTE_GLOBAL_WINDOW_MS = 10 * 60 * 1000;
export const LOGIN_GLOBAL_LIMIT = 40;
export const LOGIN_GLOBAL_WINDOW_MS = 15 * 60 * 1000;
export const PAYPAL_IP_LIMIT = 20;
export const PAYPAL_IP_WINDOW_MS = 10 * 60 * 1000;

export function resetRateLimits() {
  buckets.clear();
}

/**
 * How many proxies in front of the app append to X-Forwarded-For. Render's proxy
 * appends the address it saw, so the right-most entry is the only one a client
 * cannot forge. Override with TRUSTED_PROXY_HOPS (1 to 5) if more proxies are added.
 */
export function trustedProxyHops(): number {
  const raw = Number.parseInt(process.env.TRUSTED_PROXY_HOPS?.trim() ?? "", 10);
  if (!Number.isFinite(raw) || raw < 1) return 1;
  return Math.min(raw, 5);
}

export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const hops = forwarded
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);
    if (hops.length > 0) {
      // Count back from the right: entries left of the trusted hops are client-supplied.
      const index = Math.max(0, hops.length - trustedProxyHops());
      return hops[index].slice(0, 80);
    }
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
  // A cap across every address, so rotating IPs cannot brute-force the admin password.
  const globalHit = rateLimit("login:global", LOGIN_GLOBAL_LIMIT, LOGIN_GLOBAL_WINDOW_MS, now);
  if (!globalHit.ok) return rateLimitResponse(globalHit.retryAfterSeconds);
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

export function paypalRateLimit(request: Request, now = Date.now()): Response | null {
  const result = rateLimit(`paypal:${clientIp(request)}`, PAYPAL_IP_LIMIT, PAYPAL_IP_WINDOW_MS, now);
  if (!result.ok) return rateLimitResponse(result.retryAfterSeconds);
  return null;
}
