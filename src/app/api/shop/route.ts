import { requireAdmin } from "@/lib/admin-session";
import { errorResponse, jsonError } from "@/lib/http";
import { getShop, updateShop } from "@/lib/shop";
import { shopUpdateSchema } from "@/lib/validators";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return Response.json(await getShop());
  } catch (error) {
    return errorResponse(error, 503, "shop_unavailable", "Could not load the shop.");
  }
}

export async function PUT(request: Request) {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return jsonError(400, "bad_json", "The shop settings were not valid JSON.");
  }
  const parsed = shopUpdateSchema.safeParse(json);
  if (!parsed.success) {
    return jsonError(400, "invalid_shop", "Check the shop name, rates, bed size, and colors.");
  }
  try {
    return Response.json(await updateShop(parsed.data), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error, 409, "shop_update_failed", "Could not save the shop.");
  }
}
