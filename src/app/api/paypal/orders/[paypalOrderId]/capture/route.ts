import { jsonError } from "@/lib/http";
import { PaypalNotConfiguredError, capturePaypalCheckout } from "@/lib/paypal";

export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  context: { params: Promise<{ paypalOrderId: string }> },
) {
  const { paypalOrderId } = await context.params;
  try {
    const result = await capturePaypalCheckout(paypalOrderId);
    if (!result.ok) return jsonError(result.status, "paypal_capture_failed", result.message);
    return Response.json({ ok: true, status: result.status, already: result.already });
  } catch (error) {
    if (error instanceof PaypalNotConfiguredError) {
      return jsonError(503, "paypal_not_configured", error.message);
    }
    console.error(error);
    return jsonError(502, "paypal_capture_failed", "PayPal sandbox did not capture the order.");
  }
}
