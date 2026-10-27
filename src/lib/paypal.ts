import { prisma } from "@/lib/db";
import { centsFromPaypalValue } from "@/lib/paypal-events";

const SANDBOX_API = "https://api-m.sandbox.paypal.com";

export class PaypalNotConfiguredError extends Error {
  constructor(message = "PayPal sandbox keys are not configured.") {
    super(message);
    this.name = "PaypalNotConfiguredError";
  }
}

type TokenCache = { token: string; expiresAt: number };
let tokenCache: TokenCache | null = null;

export function paypalPublicConfig() {
  const clientId = process.env.PAYPAL_CLIENT_ID?.trim() ?? "";
  const secret = process.env.PAYPAL_CLIENT_SECRET?.trim() ?? "";
  const environment = (process.env.PAYPAL_ENV || "sandbox").trim().toLowerCase();
  if (environment !== "sandbox") {
    return {
      enabled: false,
      clientId: null as string | null,
      environment: "sandbox" as const,
      message: "This build only talks to the PayPal sandbox. Set PAYPAL_ENV=sandbox.",
    };
  }
  if (!clientId || !secret) {
    return {
      enabled: false,
      clientId: null,
      environment: "sandbox" as const,
      message:
        "PayPal sandbox keys are not set. Add PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET to enable checkout. Quotes still work without them.",
    };
  }
  return {
    enabled: true,
    clientId,
    environment: "sandbox" as const,
    message: null as string | null,
  };
}

function assertSandboxConfigured() {
  const config = paypalPublicConfig();
  if (!config.enabled || !config.clientId) {
    throw new PaypalNotConfiguredError(config.message ?? "PayPal sandbox is not configured.");
  }
  const secret = process.env.PAYPAL_CLIENT_SECRET?.trim();
  if (!secret) throw new PaypalNotConfiguredError();
  return { clientId: config.clientId, secret };
}

async function accessToken(): Promise<string> {
  const { clientId, secret } = assertSandboxConfigured();
  if (tokenCache && tokenCache.expiresAt > Date.now() + 30_000) return tokenCache.token;
  const response = await fetch(`${SANDBOX_API}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${secret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  const body = (await response.json()) as { access_token?: string; expires_in?: number };
  if (!response.ok || !body.access_token) {
    throw new Error("PayPal sandbox refused the client credentials.");
  }
  tokenCache = {
    token: body.access_token,
    expiresAt: Date.now() + (body.expires_in ?? 300) * 1000,
  };
  return body.access_token;
}

async function paypalFetch(path: string, init?: RequestInit) {
  const token = await accessToken();
  const response = await fetch(`${SANDBOX_API}${path}`, {
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

export async function createPaypalCheckout(localOrderId: string) {
  assertSandboxConfigured();
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
    return { ok: true as const, paypalOrderId: order.paypalOrderId };
  }

  const value = (order.amountCents / 100).toFixed(2);
  const description = `${order.shop.name}: ${order.quote.originalFilename} x ${order.quote.quantity}`.slice(0, 127);
  const created = await paypalFetch("/v2/checkout/orders", {
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
    const message =
      typeof created.body?.message === "string"
        ? created.body.message
        : "PayPal could not create the sandbox order.";
    return { ok: false as const, status: 502, message };
  }
  await prisma.order.update({
    where: { id: order.id },
    data: { paypalOrderId },
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

export async function capturePaypalCheckout(paypalOrderId: string) {
  assertSandboxConfigured();
  const order = await prisma.order.findUnique({ where: { paypalOrderId } });
  if (!order) {
    return { ok: false as const, status: 404, message: "No PlateQuote order matches that PayPal order." };
  }
  if (order.status !== "quoted") {
    return { ok: true as const, already: true, status: order.status };
  }

  let result = await paypalFetch(`/v2/checkout/orders/${encodeURIComponent(paypalOrderId)}/capture`, {
    method: "POST",
    body: "{}",
  });
  let capture = extractCapture(result.body);
  const issue = Array.isArray(result.body?.details)
    ? (result.body.details[0] as { issue?: string } | undefined)?.issue
    : undefined;
  if (!result.ok && issue === "ORDER_ALREADY_CAPTURED") {
    result = await paypalFetch(`/v2/checkout/orders/${encodeURIComponent(paypalOrderId)}`, {
      method: "GET",
    });
    capture = extractCapture(result.body);
  }
  if (!capture || capture.status !== "COMPLETED") {
    const message =
      typeof result.body?.message === "string"
        ? result.body.message
        : "PayPal did not complete the capture.";
    return { ok: false as const, status: 502, message };
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

export async function verifyWebhook(headers: Headers, event: unknown): Promise<boolean> {
  const webhookId = process.env.PAYPAL_WEBHOOK_ID?.trim();
  if (!webhookId) {
    return process.env.PAYPAL_ALLOW_UNVERIFIED_WEBHOOKS === "true";
  }
  assertSandboxConfigured();
  const token = await accessToken();
  const response = await fetch(`${SANDBOX_API}/v1/notifications/verify-webhook-signature`, {
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
