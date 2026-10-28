import { z } from "zod";
import {
  adminConfig,
  createSessionToken,
  passwordMatches,
  sessionCookie,
} from "@/lib/admin-session";
import { declaredBodyTooLarge, jsonError } from "@/lib/http";
import { loginRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const loginSchema = z.object({
  password: z.string().min(1).max(200),
});

export async function POST(request: Request) {
  const limited = loginRateLimit(request);
  if (limited) return limited;
  if (declaredBodyTooLarge(request, 4096)) return jsonError(413, "too_large", "The request is too large.");

  const config = adminConfig();
  if (config.state !== "ready") return jsonError(503, "admin_locked", config.message);

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return jsonError(400, "bad_json", "The sign-in request was not valid JSON.");
  }
  const parsed = loginSchema.safeParse(json);
  const provided = parsed.success ? parsed.data.password : "";
  if (!parsed.success || !passwordMatches(provided, config.password)) {
    return jsonError(401, "invalid_password", "That password is not right.");
  }

  const token = await createSessionToken(config.password, config.secret);
  return Response.json(
    { ok: true },
    { headers: { "Set-Cookie": sessionCookie(token), "Cache-Control": "no-store" } },
  );
}
