import { requireAdmin } from "@/lib/admin-session";
import { errorResponse } from "@/lib/http";
import { listOrders } from "@/lib/orders";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  try {
    return Response.json(await listOrders(), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error, 503, "orders_unavailable", "Could not load orders.");
  }
}
