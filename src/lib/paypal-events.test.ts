import { describe, expect, it } from "vitest";
import { centsFromPaypalValue, interpretPaypalEvent } from "./paypal-events";

describe("interpretPaypalEvent", () => {
  it("captures after the buyer approves", () => {
    const action = interpretPaypalEvent({
      event_type: "CHECKOUT.ORDER.APPROVED",
      resource: {
        id: "PAYPAL123",
        status: "APPROVED",
        purchase_units: [{ custom_id: "order_local" }],
      },
    });
    expect(action).toEqual({
      type: "capture",
      paypalOrderId: "PAYPAL123",
      localOrderId: "order_local",
    });
  });

  it("marks paid when capture completes", () => {
    const action = interpretPaypalEvent({
      event_type: "PAYMENT.CAPTURE.COMPLETED",
      resource: {
        id: "CAP123",
        custom_id: "order_local",
        amount: { currency_code: "USD", value: "12.50" },
        supplementary_data: { related_ids: { order_id: "PAYPAL123" } },
      },
    });
    expect(action).toMatchObject({
      type: "mark_paid",
      paypalOrderId: "PAYPAL123",
      localOrderId: "order_local",
      captureId: "CAP123",
      amountValue: "12.50",
    });
  });

  it("ignores unrelated events", () => {
    expect(interpretPaypalEvent({ event_type: "BILLING.SUBSCRIPTION.CREATED", resource: {} })).toEqual({
      type: "ignore",
      reason: "BILLING.SUBSCRIPTION.CREATED",
    });
  });
});

describe("centsFromPaypalValue", () => {
  it("converts PayPal amount strings", () => {
    expect(centsFromPaypalValue("12.50")).toBe(1250);
    expect(centsFromPaypalValue("8")).toBe(800);
    expect(centsFromPaypalValue("8.5")).toBe(850);
    expect(centsFromPaypalValue("12.345")).toBeNull();
    expect(centsFromPaypalValue("abc")).toBeNull();
  });
});
