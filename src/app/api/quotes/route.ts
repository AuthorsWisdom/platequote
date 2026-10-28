import { MAX_UPLOAD_BYTES } from "@/lib/constants";
import { declaredBodyTooLarge, jsonError } from "@/lib/http";
import { QuoteInputError, createQuote } from "@/lib/quote-service";
import { quoteRateLimit } from "@/lib/rate-limit";
import { purposeSchema } from "@/lib/validators";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(request: Request) {
  const limited = quoteRateLimit(request);
  if (limited) return limited;
  if (declaredBodyTooLarge(request, MAX_UPLOAD_BYTES + 1024 * 1024)) {
    return jsonError(413, "too_large", "That upload is over the 25 MB cap.");
  }
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return jsonError(400, "bad_form", "Upload the mesh as multipart form data.");
  }
  const file = form.get("file");
  if (!(file instanceof File)) return jsonError(400, "missing_file", "Choose an STL or 3MF file.");
  const purpose = purposeSchema.safeParse(String(form.get("purpose") || "general"));
  const quantity = Number(form.get("quantity") || "1");
  if (!purpose.success || !Number.isInteger(quantity) || quantity < 1 || quantity > 100) {
    return jsonError(400, "bad_options", "Check the quantity and what the part is for.");
  }
  const bytes = Buffer.from(await file.arrayBuffer());
  const materialId = String(form.get("materialId") || "").slice(0, 40);
  const printerRaw = form.get("printerId");
  const printerId = printerRaw ? String(printerRaw).slice(0, 40) : null;
  const color = String(form.get("color") || "").slice(0, 40);
  try {
    const quote = await createQuote({
      bytes,
      filename: file.name.slice(0, 240),
      materialId,
      printerId,
      color,
      quantity,
      rush: String(form.get("rush") || "") === "true",
      purpose: purpose.data,
    });
    return Response.json(quote);
  } catch (error) {
    if (error instanceof QuoteInputError) return jsonError(400, "bad_quote", error.message);
    console.error(error);
    return jsonError(500, "quote_failed", "The quote could not be saved.");
  }
}
