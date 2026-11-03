import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/paypal", () => {
  class PaypalNotConfiguredError extends Error {}
  return {
    PaypalNotConfiguredError,
    createPaypalCheckout: vi.fn(async () => ({ ok: true, paypalOrderId: "PAYPAL-ORDER-1" })),
    capturePaypalCheckout: vi.fn(async () => ({ ok: true, status: "COMPLETED", already: false })),
  };
});

import { PAYPAL_IP_LIMIT, resetRateLimits } from "@/lib/rate-limit";
import { POST as createOrder } from "./route";
import { POST as captureOrder } from "./[paypalOrderId]/capture/route";

afterEach(() => {
  resetRateLimits();
});

const ORDER_ID = "cabcdefghijklmnopqrstu";

function createRequest(ip: string) {
  return new Request("http://localhost/api/paypal/orders", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify({ orderId: ORDER_ID }),
  });
}

function capture(ip: string) {
  return captureOrder(
    new Request("http://localhost/api/paypal/orders/PAYPALORDER1/capture", {
      method: "POST",
      headers: { "x-forwarded-for": ip },
    }),
    { params: Promise.resolve({ paypalOrderId: "PAYPALORDER1" }) },
  );
}

describe("PayPal route rate limits", () => {
  it("returns 429 from POST /api/paypal/orders once an IP passes the limit", async () => {
    for (let attempt = 0; attempt < PAYPAL_IP_LIMIT; attempt += 1) {
      expect((await createOrder(createRequest("198.51.100.30"))).status).toBe(200);
    }
    const blocked = await createOrder(createRequest("198.51.100.30"));
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("retry-after")).toBeTruthy();
    expect((await createOrder(createRequest("198.51.100.31"))).status).toBe(200);
  });

  it("returns 429 from the capture route once an IP passes the limit", async () => {
    for (let attempt = 0; attempt < PAYPAL_IP_LIMIT; attempt += 1) {
      expect((await capture("198.51.100.40")).status).toBe(200);
    }
    expect((await capture("198.51.100.40")).status).toBe(429);
    expect((await capture("198.51.100.41")).status).toBe(200);
  });
});
