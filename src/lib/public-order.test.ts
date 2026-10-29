import { describe, expect, it } from "vitest";
import { toPublicOrder } from "./public-order";

describe("toPublicOrder", () => {
  it("drops the buyer email from the public quote payload", () => {
    const order = toPublicOrder({
      id: "order_1",
      status: "paid",
      amountCents: 1200,
      paypalOrderId: "PAYPAL123",
      paypalCaptureId: "CAP123",
      paypalEnv: "sandbox",
      payerEmail: "buyer@example.com",
      paidAt: "2026-10-28T00:00:00.000Z",
    });
    expect(order).not.toHaveProperty("payerEmail");
    expect(JSON.stringify(order)).not.toContain("buyer@example.com");
    expect(order.paypalCaptureId).toBe("CAP123");
  });
});
