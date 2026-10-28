import { isRenderHost } from "@/lib/deploy-env";
import { jsonError } from "@/lib/http";

export const ADMIN_COOKIE = "pq_admin";
export const ADMIN_SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Documented in .env.example. Refused when the app is running on Render. */
export const DEV_ADMIN_PASSWORD = "platequote-dev";
export const DEV_ADMIN_SESSION_SECRET = "platequote-dev-session-secret";

const textEncoder = new TextEncoder();

export type AdminConfig =
  | { state: "ready"; password: string; secret: string }
  | { state: "locked"; message: string };

export function timingSafeEqualString(left: string, right: string): boolean {
  const a = textEncoder.encode(left);
  const b = textEncoder.encode(right);
  const length = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let index = 0; index < length; index += 1) {
    diff |= (a[index] ?? 0) ^ (b[index] ?? 0);
  }
  return diff === 0;
}

export function passwordMatches(provided: string, expected: string): boolean {
  return timingSafeEqualString(provided, expected);
}

/**
 * Missing secrets lock admin in every environment, including local.
 * Docker compose and `.env.example` supply dev values so local sign-in still works.
 * Those dev values are refused on Render.
 */
export function adminConfig(): AdminConfig {
  const password = process.env.ADMIN_PASSWORD?.trim() ?? "";
  const secret = process.env.ADMIN_SESSION_SECRET?.trim() ?? "";
  if (!password || !secret) {
    return {
      state: "locked",
      message: "Shop admin is locked until ADMIN_PASSWORD and ADMIN_SESSION_SECRET are set.",
    };
  }
  if (password.length < 8) {
    return { state: "locked", message: "Shop admin is locked. ADMIN_PASSWORD must be at least 8 characters." };
  }
  if (secret.length < 16) {
    return {
      state: "locked",
      message: "Shop admin is locked. ADMIN_SESSION_SECRET must be at least 16 characters.",
    };
  }
  if (isRenderHost() && (password === DEV_ADMIN_PASSWORD || secret === DEV_ADMIN_SESSION_SECRET)) {
    return {
      state: "locked",
      message:
        "Shop admin is locked on the public host. Set a unique ADMIN_PASSWORD in the Render dashboard. The local development password is refused here.",
    };
  }
  return { state: "ready", password, secret };
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function fromBase64Url(value: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return null;
  const pad = value.length % 4 === 0 ? "" : "=".repeat(4 - (value.length % 4));
  try {
    const binary = atob(value.replaceAll("-", "+").replaceAll("_", "/") + pad);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return bytes;
  } catch {
    return null;
  }
}

async function sign(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", textEncoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
  ]);
  const signature = await crypto.subtle.sign("HMAC", key, textEncoder.encode(message));
  return toBase64Url(new Uint8Array(signature));
}

async function passwordTag(secret: string, password: string): Promise<string> {
  return (await sign(secret, `password:${password}`)).slice(0, 22);
}

export async function createSessionToken(password: string, secret: string, now = Date.now()): Promise<string> {
  const body = {
    exp: now + ADMIN_SESSION_TTL_MS,
    tag: await passwordTag(secret, password),
  };
  const payload = toBase64Url(textEncoder.encode(JSON.stringify(body)));
  const signature = await sign(secret, payload);
  return `${payload}.${signature}`;
}

export async function verifySessionToken(
  password: string,
  secret: string,
  token: string,
  now = Date.now(),
): Promise<boolean> {
  const parts = token.split(".");
  if (parts.length !== 2) return false;
  const [payload, signature] = parts;
  if (!payload || !signature) return false;
  const expected = await sign(secret, payload);
  if (!timingSafeEqualString(expected, signature)) return false;
  const bytes = fromBase64Url(payload);
  if (!bytes) return false;
  let body: { exp?: unknown; tag?: unknown };
  try {
    body = JSON.parse(new TextDecoder().decode(bytes)) as { exp?: unknown; tag?: unknown };
  } catch {
    return false;
  }
  if (typeof body.exp !== "number" || typeof body.tag !== "string") return false;
  if (body.exp <= now) return false;
  const tag = await passwordTag(secret, password);
  return timingSafeEqualString(body.tag, tag);
}

export function sessionCookieSecure(): boolean {
  return isRenderHost();
}

export function sessionCookie(token: string): string {
  const secure = sessionCookieSecure() ? "; Secure" : "";
  const maxAge = Math.floor(ADMIN_SESSION_TTL_MS / 1000);
  return `${ADMIN_COOKIE}=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

export function clearSessionCookie(): string {
  const secure = sessionCookieSecure() ? "; Secure" : "";
  return `${ADMIN_COOKIE}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0${secure}`;
}

export function cookieValue(request: Request, name: string): string | undefined {
  const header = request.headers.get("cookie");
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim();
  }
  return undefined;
}

export async function adminAuthorized(token: string | undefined, now = Date.now()): Promise<boolean> {
  const config = adminConfig();
  if (config.state !== "ready" || !token) return false;
  return verifySessionToken(config.password, config.secret, token, now);
}

export async function requireAdmin(request: Request): Promise<Response | null> {
  const config = adminConfig();
  if (config.state !== "ready") return jsonError(503, "admin_locked", config.message);
  const ok = await adminAuthorized(cookieValue(request, ADMIN_COOKIE));
  if (!ok) return jsonError(401, "unauthorized", "Sign in to the shop admin.");
  return null;
}

export function safeNextPath(value: string | null | undefined): string {
  if (!value) return "/dashboard";
  if (!value.startsWith("/dashboard")) return "/dashboard";
  if (
    value.startsWith("//") ||
    value.includes("\\") ||
    value.includes("\n") ||
    value.includes("\r") ||
    value.includes("?") ||
    value.includes("#") ||
    value.includes("..")
  ) {
    return "/dashboard";
  }
  if (value !== "/dashboard" && !value.startsWith("/dashboard/")) return "/dashboard";
  return value;
}

/** Server-side gate for admin pages and admin APIs. Customer quote and checkout stay public. */
export function requestNeedsAdmin(pathname: string, method: string): boolean {
  if (pathname === "/dashboard" || pathname.startsWith("/dashboard/")) return true;
  if (pathname === "/api/orders" || pathname.startsWith("/api/orders/")) return true;
  if (pathname === "/api/shop" || pathname.startsWith("/api/shop/")) {
    return method !== "GET" && method !== "HEAD";
  }
  return false;
}
