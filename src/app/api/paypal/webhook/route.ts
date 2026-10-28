import { prisma } from "@/lib/db";
import { declaredBodyTooLarge, jsonError } from "@/lib/http";
import { interpretPaypalEvent } from "@/lib/paypal-events";
import {
  PaypalNotConfiguredError,
  capturePaypalCheckout,
  markPaidFromWebhook,
  verifyWebhook,
} from "@/lib/paypal";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (declaredBodyTooLarge(request, 1_000_000)) return jsonError(413, "too_large", "Webhook body is too large.");
  let event: unknown;
  try {
    event = await request.json();
  } catch {
    return jsonError(400, "bad_json", "Webhook body was not JSON.");
  }

  try {
    const verified = await verifyWebhook(request.headers, event);
    if (!verified) {
      return jsonError(401, "unverified_webhook", "The webhook signature could not be verified.");
    }
  } catch (error) {
    if (error instanceof PaypalNotConfiguredError) {
      return jsonError(503, "paypal_not_configured", error.message);
    }
    console.error(error);
    return jsonError(502, "webhook_verify_failed", "PayPal could not verify this webhook.");
  }

  const action = interpretPaypalEvent(event);
  if (action.type === "ignore") return Response.json({ ok: true, ignored: action.reason });

  try {
    if (action.type === "capture") {
      if (action.localOrderId) {
        await prisma.order.updateMany({
          where: { id: action.localOrderId, status: "quoted", paypalOrderId: null },
          data: { paypalOrderId: action.paypalOrderId, approvedAt: new Date() },
        });
      }
      await prisma.order.updateMany({
        where: { paypalOrderId: action.paypalOrderId, approvedAt: null },
        data: { approvedAt: new Date() },
      });
      const result = await capturePaypalCheckout(action.paypalOrderId);
      if (!result.ok) return jsonError(result.status, "paypal_capture_failed", result.message);
      return Response.json({ ok: true, status: result.status });
    }

    const result = await markPaidFromWebhook(action);
    if (!result.ok) return jsonError(result.status, "paypal_mark_paid_failed", result.message);
    return Response.json({ ok: true, status: result.status });
  } catch (error) {
    if (error instanceof PaypalNotConfiguredError) {
      return jsonError(503, "paypal_not_configured", error.message);
    }
    console.error(error);
    return jsonError(500, "webhook_failed", "The webhook could not update the order.");
  }
}
