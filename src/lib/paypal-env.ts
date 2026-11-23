/**
 * Which PayPal environment a request talks to: always the sandbox.
 *
 * RULED 2026-11-03 (Christopher): PlateQuote is PayPal sandbox only. This supersedes the
 * 2026-10-29 per-host live setup. There is no live host, no live key set and no switch
 * that selects one; `PAYPAL_ENV` is ignored, and every request uses
 * api-m.sandbox.paypal.com with PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET / PAYPAL_WEBHOOK_ID.
 * scripts/gate.local.sh fails if a non-sandbox PayPal host or a live key name comes back.
 */

export type PaypalEnvironment = "sandbox";

export const PAYPAL_ENVIRONMENTS: readonly PaypalEnvironment[] = ["sandbox"];

export const PAYPAL_HOSTS: Record<PaypalEnvironment, { api: string; sdk: string }> = {
  sandbox: {
    api: "https://api-m.sandbox.paypal.com",
    sdk: "https://www.sandbox.paypal.com/web-sdk/v6/core",
  },
};

export function isPaypalEnvironment(value: unknown): value is PaypalEnvironment {
  return value === "sandbox";
}

export function defaultPaypalEnvironment(): PaypalEnvironment {
  return "sandbox";
}

/** Every host gets the sandbox. Kept so callers need no change. */
export function paypalEnvironmentForHost(_host?: string | null): PaypalEnvironment {
  return "sandbox";
}

/** Every request gets the sandbox, whatever its Host header. */
export function paypalEnvironmentForRequest(_request: Request): PaypalEnvironment {
  return "sandbox";
}

export function paypalCredentials(_environment: PaypalEnvironment = "sandbox"): {
  clientId: string;
  secret: string;
  webhookId: string | null;
} {
  const read = (name: string) => process.env[`PAYPAL_${name}`]?.trim() ?? "";
  return {
    clientId: read("CLIENT_ID"),
    secret: read("CLIENT_SECRET"),
    webhookId: read("WEBHOOK_ID") || null,
  };
}
