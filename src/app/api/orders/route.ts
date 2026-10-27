import { jsonError } from "@/lib/http";
import { listOrders } from "@/lib/orders";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return Response.json(await listOrders());
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not load orders.";
    return jsonError(503, "orders_unavailable", message);
  }
}
