import { jsonError } from "@/lib/http";
import { QuoteInputError, getQuote, repriceQuote } from "@/lib/quote-service";
import { repriceSchema } from "@/lib/validators";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const quote = await getQuote(id);
  if (!quote) return jsonError(404, "not_found", "That quote does not exist.");
  return Response.json(quote);
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return jsonError(400, "bad_json", "The reprice request was not valid JSON.");
  }
  const parsed = repriceSchema.safeParse(json);
  if (!parsed.success) return jsonError(400, "bad_options", "Check the material, color, and quantity.");
  try {
    return Response.json(await repriceQuote(id, parsed.data));
  } catch (error) {
    if (error instanceof QuoteInputError) {
      const status = /not found/i.test(error.message) ? 404 : 409;
      return jsonError(status, "reprice_failed", error.message);
    }
    console.error(error);
    return jsonError(500, "reprice_failed", "The quote could not be repriced.");
  }
}
