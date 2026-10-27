export type PaypalEventAction =
  | { type: "capture"; paypalOrderId: string; localOrderId?: string }
  | {
      type: "mark_paid";
      paypalOrderId?: string;
      localOrderId?: string;
      captureId?: string;
      amountValue?: string;
      payerEmail?: string;
    }
  | { type: "ignore"; reason: string };

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord | null {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as UnknownRecord;
  return null;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/**
 * Decide what a PayPal webhook is asking us to do.
 * APPROVED means the buyer agreed, so the server captures.
 * CAPTURE.COMPLETED is the event that records the order as paid.
 */
export function interpretPaypalEvent(event: unknown): PaypalEventAction {
  const root = asRecord(event);
  const eventType = asString(root?.event_type);
  const resource = asRecord(root?.resource);
  if (!eventType || !resource) return { type: "ignore", reason: "unrecognized_event" };

  if (eventType === "CHECKOUT.ORDER.APPROVED") {
    const paypalOrderId = asString(resource.id);
    if (!paypalOrderId) return { type: "ignore", reason: "missing_order_id" };
    const units = Array.isArray(resource.purchase_units) ? resource.purchase_units : [];
    const customId = asString(asRecord(units[0])?.custom_id);
    return { type: "capture", paypalOrderId, localOrderId: customId };
  }

  if (eventType === "PAYMENT.CAPTURE.COMPLETED") {
    const related = asRecord(asRecord(resource.supplementary_data)?.related_ids);
    const amount = asRecord(resource.amount);
    return {
      type: "mark_paid",
      paypalOrderId: asString(related?.order_id),
      localOrderId: asString(resource.custom_id),
      captureId: asString(resource.id),
      amountValue: asString(amount?.value),
    };
  }

  return { type: "ignore", reason: eventType };
}

export function centsFromPaypalValue(value: string): number | null {
  if (!/^\d+(\.\d{1,2})?$/.test(value)) return null;
  const [dollars, fraction = ""] = value.split(".");
  const cents = Number(dollars) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isFinite(cents) ? cents : null;
}
