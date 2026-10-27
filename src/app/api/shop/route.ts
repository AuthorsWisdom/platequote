import { jsonError } from "@/lib/http";
import { getShop, updateShop } from "@/lib/shop";
import { shopUpdateSchema } from "@/lib/validators";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return Response.json(await getShop());
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not load the shop.";
    return jsonError(503, "shop_unavailable", message);
  }
}

export async function PUT(request: Request) {
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
    return Response.json(await updateShop(parsed.data));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not save the shop.";
    return jsonError(409, "shop_update_failed", message);
  }
}
