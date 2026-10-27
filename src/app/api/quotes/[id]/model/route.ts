import { readFile } from "node:fs/promises";
import { jsonError } from "@/lib/http";
import { quoteModelFile } from "@/lib/quote-service";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const model = await quoteModelFile(id);
  if (!model) return jsonError(404, "not_found", "That model file is not on this server.");
  try {
    const bytes = await readFile(model.full);
    const extension = model.stored.toLowerCase().endsWith(".3mf") ? "3mf" : "stl";
    const type = extension === "3mf" ? "model/3mf" : "model/stl";
    const filename = model.filename.replace(/["\r\n]/g, "");
    return new Response(bytes, {
      headers: {
        "Content-Type": type,
        "Content-Disposition": `inline; filename="${filename}"`,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    return jsonError(404, "missing_file", "The upload is no longer on disk.");
  }
}
