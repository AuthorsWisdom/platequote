import { jsonError } from "@/lib/http";
import { quoteModelFile } from "@/lib/quote-service";
import { recordIdSchema } from "@/lib/validators";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!recordIdSchema.safeParse(id).success) return jsonError(404, "not_found", "That model file is not on this server.");
  const model = await quoteModelFile(id);
  if (!model) return jsonError(404, "missing_file", "The upload is no longer on this server.");
  const extension = model.stored.toLowerCase().endsWith(".3mf") ? "3mf" : "stl";
  const type = extension === "3mf" ? "model/3mf" : "model/stl";
  const filename = model.filename.replace(/["\r\n]/g, "");
  const download = new URL(request.url).searchParams.get("download") === "1";
  return new Response(new Uint8Array(model.bytes), {
    headers: {
      "Content-Type": type,
      "Content-Length": String(model.bytes.length),
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${filename}"`,
      "Cache-Control": "private, max-age=3600",
      "X-Model-Source": model.source,
    },
  });
}
