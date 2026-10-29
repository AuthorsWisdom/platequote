import { prisma } from "@/lib/db";
import { centsFromPaypalValue } from "@/lib/paypal-events";
import { unverifiedWebhooksPermitted } from "@/lib/paypal-policy";
import {
  PAYPAL_ENVIRONMENTS,
  PAYPAL_HOSTS,
  defaultPaypalEnvironment,
  paypalCredentials,
  type PaypalEnvironment,
} from "@/lib/paypal-env";

export class PaypalNotConfiguredError extends Error {
  constructor(message = "PayPal keys are not configured.") {
    super(message);
    this.name = "PaypalNotConfiguredError";
  }
}

type TokenCache = { token: string; expiresAt: number };
const tokenCache = new Map<PaypalEnvironment, TokenCache>();

export type PaypalPublicConfig = {
  enabled: boolean;
  clientId: string | null;
  environment: PaypalEnvironment;
  sdkUrl: string;
  message: string | null;
};

/** What the browser may know: the client id and which PayPal it talks to. Never the secret. */
export function paypalPublicConfig(environment: PaypalEnvironment): PaypalPublicConfig {
  const { clientId, secret } = paypalCredentials(environment);
  const sdkUrl = PAYPAL_HOSTS[environment].sdk;
  if (!clientId || !secret) {
    const names =
      environment === "live"
        ? "PAYPAL_LIVE_CLIENT_ID and PAYPAL_LIVE_CLIENT_SECRET"
        : "PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET";
    return {
      enabled: false,
      clientId: null,
      environment,
      sdkUrl,
      message: `PayPal ${environment} keys are not set. Add ${names} to enable checkout. Quotes still work without them.`,
    };
  }
  return { enabled: true, clientId, environment, sdkUrl, message: null };
}

function assertConfigured(environment: PaypalEnvironment) {
  const config = paypalPublicConfig(environment);
  const { secret } = paypalCredentials(environment);
  if (!config.enabled || !config.clientId || !secret) {
    throw new PaypalNotConfiguredError(config.message ?? `PayPal ${environment} is not configured.`);
  }
  return { clientId: config.clientId, secret };
}

async function accessToken(environment: PaypalEnvironment): Promise<string> {
  const { clientId, secret } = assertConfigured(environment);
  const cached = tokenCache.get(environment);
  if (cached && cached.expiresAt > Date.now() + 30_000) return cached.token;
  const response = await fetch(`${PAYPAL_HOSTS[environment].api}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${secret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  const body = (await response.json()) as { access_token?: string; expires_in?: number };
  if (!response.ok || !body.access_token) {
    throw new Error(`PayPal ${environment} refused the client credentials.`);
  }
  tokenCache.set(environment, {
    token: body.access_token,
    expiresAt: Date.now() + (body.expires_in ?? 300) * 1000,
  });
  return body.access_token;
}

async function paypalFetch(environment: PaypalEnvironment, path: string, init?: RequestInit) {
  const token = await accessToken(environment);
  const response = await fetch(`${PAYPAL_HOSTS[environment].api}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const text = await response.text();
  let body: Record<string, unknown> | null = null;
  if (text) {
    try {
      body = JSON.parse(text) as Record<string, unknown>;
    } catch {
      body = { message: text.slice(0, 500) };
    }
  }
  return { ok: response.ok, status: response.status, body };
}

type CaptureDetails = {
  id: string;
  amountValue: string;
  status: string;
  payerEmail?: string;
};

function extractCapture(body: Record<string, unknown> | null): CaptureDetails | null {
  if (!body) return null;
  const payer = body.payer as { email_address?: string } | undefined;
  const units = Array.isArray(body.purchase_units) ? body.purchase_units : [];
  for (const unit of units) {
    const payments = (unit as { payments?: { captures?: unknown[] } }).payments;
    const captures = payments?.captures ?? [];
    for (const capture of captures) {
      const row = capture as {
        id?: string;
        status?: string;
        amount?: { value?: string };
      };
      if (row.id && row.amount?.value && row.status) {
        return {
          id: row.id,
          amountValue: row.amount.value,
          status: row.status,
          payerEmail: payer?.email_address,
        };
      }
    }
  }
  return null;
}

export async function createPaypalCheckout(localOrderId: string, environment: PaypalEnvironment) {
  assertConfigured(environment);
  const order = await prisma.order.findUnique({
    where: { id: localOrderId },
    include: { quote: true, shop: true },
  });
  if (!order) {
    return { ok: false as const, status: 404, message: "Order not found." };
  }
  if (order.status !== "quoted") {
    return { ok: false as const, status: 409, message: "This order is no longer waiting for payment." };
  }
  if (order.paypalOrderId) {
    if (order.paypalEnv && order.paypalEnv !== environment) {
      return {
        ok: false as const,
        status: 409,
        message: `This order already has a PayPal ${order.paypalEnv} checkout. Open it on the address where it was started.`,
      };
    }
    return { ok: true as const, paypalOrderId: order.paypalOrderId };
  }

  const value = (order.amountCents / 100).toFixed(2);
  // Live receipts name the seller of record, not the seeded demo shop name.
  const seller = environment === "live" ? "PlateQuote (C. Espinoza)" : order.shop.name;
  const description = `${seller}: ${order.quote.originalFilename} x ${order.quote.quantity}`.slice(0, 127);
  const created = await paypalFetch(environment, "/v2/checkout/orders", {
    method: "POST",
    body: JSON.stringify({
      intent: "CAPTURE",
      purchase_units: [
        {
          custom_id: order.id,
          description,
          amount: { currency_code: "USD", value },
        },
      ],
    }),
  });
  const paypalOrderId = typeof created.body?.id === "string" ? created.body.id : null;
  if (!created.ok || !paypalOrderId) {
    return {
      ok: false as const,
      status: 502,
      message: externalMessage(created.body?.message, "PayPal could not create the order."),
    };
  }
  await prisma.order.update({
    where: { id: order.id },
    data: { paypalOrderId, paypalEnv: environment },
  });
  return { ok: true as const, paypalOrderId };
}

async function markQuotedOrderPaid(input: {
  orderId: string;
  paypalOrderId?: string;
  captureId?: string;
  payerEmail?: string;
}) {
  const existing = await prisma.order.findUnique({ where: { id: input.orderId } });
  if (!existing) return null;
  if (existing.status !== "quoted") return existing;
  return prisma.order.update({
    where: { id: existing.id },
    data: {
      status: "paid",
      paidAt: new Date(),
      approvedAt: existing.approvedAt ?? new Date(),
      paypalOrderId: input.paypalOrderId ?? existing.paypalOrderId,
      paypalCaptureId: input.captureId ?? existing.paypalCaptureId,
      payerEmail: input.payerEmail ?? existing.payerEmail,
    },
  });
}

export async function capturePaypalCheckout(paypalOrderId: string, environment: PaypalEnvironment) {
  assertConfigured(environment);
  const order = await prisma.order.findUnique({ where: { paypalOrderId } });
  if (!order) {
    return { ok: false as const, status: 404, message: "No PlateQuote order matches that PayPal order." };
  }
  if (order.paypalEnv && order.paypalEnv !== environment) {
    return {
      ok: false as const,
      status: 409,
      message: `This PayPal order was started in the ${order.paypalEnv} environment and cannot be captured here.`,
    };
  }
  if (order.status !== "quoted") {
    return { ok: true as const, already: true, status: order.status };
  }

  let result = await paypalFetch(environment, `/v2/checkout/orders/${encodeURIComponent(paypalOrderId)}/capture`, {
    method: "POST",
    body: "{}",
  });
  let capture = extractCapture(result.body);
  const issue = Array.isArray(result.body?.details)
    ? (result.body.details[0] as { issue?: string } | undefined)?.issue
    : undefined;
  if (!result.ok && issue === "ORDER_ALREADY_CAPTURED") {
    result = await paypalFetch(environment, `/v2/checkout/orders/${encodeURIComponent(paypalOrderId)}`, {
      method: "GET",
    });
    capture = extractCapture(result.body);
  }
  if (!capture || capture.status !== "COMPLETED") {
    return {
      ok: false as const,
      status: 502,
      message: externalMessage(result.body?.message, "PayPal did not complete the capture."),
    };
  }
  const amountCents = centsFromPaypalValue(capture.amountValue);
  if (amountCents == null || amountCents !== order.amountCents) {
    return {
      ok: false as const,
      status: 409,
      message: "The captured amount does not match the quoted price, so the order was not marked paid.",
    };
  }
  await markQuotedOrderPaid({
    orderId: order.id,
    paypalOrderId,
    captureId: capture.id,
    payerEmail: capture.payerEmail,
  });
  return { ok: true as const, already: false, status: "paid" as const };
}

export async function markPaidFromWebhook(input: {
  paypalOrderId?: string;
  localOrderId?: string;
  captureId?: string;
  amountValue?: string;
  payerEmail?: string;
}) {
  const order = input.paypalOrderId
    ? await prisma.order.findUnique({ where: { paypalOrderId: input.paypalOrderId } })
    : input.localOrderId
      ? await prisma.order.findUnique({ where: { id: input.localOrderId } })
      : null;
  if (!order) {
    return { ok: false as const, status: 404, message: "Order not found for this capture." };
  }
  if (input.amountValue) {
    const amountCents = centsFromPaypalValue(input.amountValue);
    if (amountCents == null || amountCents !== order.amountCents) {
      return {
        ok: false as const,
        status: 409,
        message: "Webhook amount does not match the quoted price.",
      };
    }
  }
  if (order.status !== "quoted") {
    return { ok: true as const, status: order.status };
  }
  await markQuotedOrderPaid({
    orderId: order.id,
    paypalOrderId: input.paypalOrderId,
    captureId: input.captureId,
    payerEmail: input.payerEmail,
  });
  return { ok: true as const, status: "paid" as const };
}

function externalMessage(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const cleaned = value.replace(/\s+/g, " ").trim();
  if (!cleaned || cleaned.length > 240) return fallback;
  if (/postgres|prisma|secret|stack|database_url|bearer /i.test(cleaned)) return fallback;
  return cleaned;
}

/**
 * Verifies a webhook signature against every environment that has a webhook id and
 * returns the environment that vouched for it, or null. With no webhook id configured
 * anywhere, the local unsigned-fixture switch decides (never in production).
 */
export async function verifyWebhook(headers: Headers, event: unknown): Promise<PaypalEnvironment | null> {
  const candidates = PAYPAL_ENVIRONMENTS.filter((environment) => paypalCredentials(environment).webhookId);
  if (candidates.length === 0) {
    return unverifiedWebhooksPermitted() ? defaultPaypalEnvironment() : null;
  }
  for (const environment of candidates) {
    if (await verifyWebhookIn(environment, headers, event)) return environment;
  }
  return null;
}

async function verifyWebhookIn(environment: PaypalEnvironment, headers: Headers, event: unknown): Promise<boolean> {
  const { webhookId } = paypalCredentials(environment);
  assertConfigured(environment);
  const token = await accessToken(environment);
  const response = await fetch(`${PAYPAL_HOSTS[environment].api}/v1/notifications/verify-webhook-signature`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      auth_algo: headers.get("paypal-auth-algo"),
      cert_url: headers.get("paypal-cert-url"),
      transmission_id: headers.get("paypal-transmission-id"),
      transmission_sig: headers.get("paypal-transmission-sig"),
      transmission_time: headers.get("paypal-transmission-time"),
      webhook_id: webhookId,
      webhook_event: event,
    }),
  });
  const body = (await response.json()) as { verification_status?: string };
  return response.ok && body.verification_status === "SUCCESS";
}
