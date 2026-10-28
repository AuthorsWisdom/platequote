import { requireAdmin } from "@/lib/admin-session";
import { jsonError } from "@/lib/http";
import { advanceOrder } from "@/lib/orders";
import { orderStatusSchema, recordIdSchema } from "@/lib/validators";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  const { id } = await context.params;
  if (!recordIdSchema.safeParse(id).success) return jsonError(404, "not_found", "Order not found.");
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return jsonError(400, "bad_json", "The status update was not valid JSON.");
  }
  const parsed = orderStatusSchema.safeParse(json);
  if (!parsed.success) {
    return jsonError(400, "bad_status", "Choose printing or shipped. Payment sets the paid state.");
  }
  const result = await advanceOrder(id, parsed.data.status);
  if (!result.ok) return jsonError(result.status, "status_rejected", result.message);
  return Response.json({ ok: true });
}
