/**
 * Which PayPal environment a request talks to.
 *
 * `PAYPAL_ENV` (sandbox or live, default sandbox) is the default for every host.
 * `PAYPAL_LIVE_HOSTS` is a comma-separated list of hostnames that use live PayPal
 * regardless of the default, so one deployment can keep its onrender.com address on
 * the sandbox while the custom domain takes real payments.
 *
 * Sandbox credentials stay in PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET / PAYPAL_WEBHOOK_ID.
 * Live credentials live in PAYPAL_LIVE_CLIENT_ID / PAYPAL_LIVE_CLIENT_SECRET /
 * PAYPAL_LIVE_WEBHOOK_ID. The two sets never mix.
 */

export type PaypalEnvironment = "sandbox" | "live";

export const PAYPAL_ENVIRONMENTS: readonly PaypalEnvironment[] = ["sandbox", "live"];

export const PAYPAL_HOSTS: Record<PaypalEnvironment, { api: string; sdk: string }> = {
  sandbox: {
    api: "https://api-m.sandbox.paypal.com",
    sdk: "https://www.sandbox.paypal.com/web-sdk/v6/core",
  },
  live: {
    api: "https://api-m.paypal.com",
    sdk: "https://www.paypal.com/web-sdk/v6/core",
  },
};

export function isPaypalEnvironment(value: unknown): value is PaypalEnvironment {
  return value === "sandbox" || value === "live";
}

export function defaultPaypalEnvironment(): PaypalEnvironment {
  const raw = (process.env.PAYPAL_ENV || "sandbox").trim().toLowerCase();
  return raw === "live" ? "live" : "sandbox";
}

/** Lowercase hostname without a port. Null for an empty or malformed value. */
export function normalizeHost(host: string | null | undefined): string | null {
  if (!host) return null;
  const trimmed = host.trim().toLowerCase();
  if (!trimmed) return null;
  // "host:port" for a plain hostname; "[::1]:port" for a literal IPv6 address.
  const withoutPort = trimmed.startsWith("[")
    ? trimmed.replace(/\]:\d+$/, "]")
    : trimmed.replace(/:\d+$/, "");
  if (!/^[a-z0-9.\-[\]:]+$/.test(withoutPort)) return null;
  return withoutPort;
}

export function liveHosts(): Set<string> {
  const raw = process.env.PAYPAL_LIVE_HOSTS ?? "";
  const hosts = new Set<string>();
  for (const part of raw.split(",")) {
    const host = normalizeHost(part);
    if (host) hosts.add(host);
  }
  return hosts;
}

export function paypalEnvironmentForHost(host: string | null | undefined): PaypalEnvironment {
  const name = normalizeHost(host);
  if (name && liveHosts().has(name)) return "live";
  return defaultPaypalEnvironment();
}

/**
 * The environment for an incoming request, read from the Host header. Render passes the
 * original Host through, so the custom domain and the onrender.com address are told apart.
 */
export function paypalEnvironmentForRequest(request: Request): PaypalEnvironment {
  return paypalEnvironmentForHost(request.headers.get("host"));
}

export function paypalCredentials(environment: PaypalEnvironment): {
  clientId: string;
  secret: string;
  webhookId: string | null;
} {
  const prefix = environment === "live" ? "PAYPAL_LIVE_" : "PAYPAL_";
  const read = (name: string) => process.env[`${prefix}${name}`]?.trim() ?? "";
  return {
    clientId: read("CLIENT_ID"),
    secret: read("CLIENT_SECRET"),
    webhookId: read("WEBHOOK_ID") || null,
  };
}
