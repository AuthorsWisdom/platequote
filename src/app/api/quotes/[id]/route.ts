import { declaredBodyTooLarge, jsonError } from "@/lib/http";
import { QuoteInputError, getQuote, repriceQuote } from "@/lib/quote-service";
import { recordIdSchema, repriceSchema } from "@/lib/validators";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!recordIdSchema.safeParse(id).success) return jsonError(404, "not_found", "That quote does not exist.");
  const quote = await getQuote(id);
  if (!quote) return jsonError(404, "not_found", "That quote does not exist.");
  return Response.json(quote);
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!recordIdSchema.safeParse(id).success) return jsonError(404, "not_found", "That quote does not exist.");
  if (declaredBodyTooLarge(request, 16_384)) return jsonError(413, "too_large", "The request is too large.");
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
