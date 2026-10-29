import { declaredBodyTooLarge, jsonError } from "@/lib/http";
import { PaypalNotConfiguredError, createPaypalCheckout } from "@/lib/paypal";
import { paypalEnvironmentForRequest } from "@/lib/paypal-env";
import { recordIdSchema } from "@/lib/validators";
import { z } from "zod";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ orderId: recordIdSchema });

export async function POST(request: Request) {
  if (declaredBodyTooLarge(request, 16_384)) return jsonError(413, "too_large", "The request is too large.");
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return jsonError(400, "bad_json", "The checkout request was not valid JSON.");
  }
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) return jsonError(400, "bad_order", "A PlateQuote order id is required.");
  try {
    const result = await createPaypalCheckout(parsed.data.orderId, paypalEnvironmentForRequest(request));
    if (!result.ok) return jsonError(result.status, "paypal_create_failed", result.message);
    return Response.json({ paypalOrderId: result.paypalOrderId });
  } catch (error) {
    if (error instanceof PaypalNotConfiguredError) {
      return jsonError(503, "paypal_not_configured", error.message);
    }
    console.error(error);
    return jsonError(502, "paypal_create_failed", "PayPal did not create an order.");
  }
}
