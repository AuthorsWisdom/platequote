import { jsonError } from "@/lib/http";
import { QuoteInputError, createQuote } from "@/lib/quote-service";
import { purposeSchema } from "@/lib/validators";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(request: Request) {
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
  try {
    const quote = await createQuote({
      bytes,
      filename: file.name,
      materialId: String(form.get("materialId") || ""),
      printerId: form.get("printerId") ? String(form.get("printerId")) : null,
      color: String(form.get("color") || ""),
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
