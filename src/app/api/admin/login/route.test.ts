import { afterEach, describe, expect, it, vi } from "vitest";
import { ADMIN_COOKIE, verifySessionToken } from "@/lib/admin-session";
import { LOGIN_LIMIT, resetRateLimits } from "@/lib/rate-limit";
import { POST } from "./route";

const PASSWORD = "shop-owner-password";
const SECRET = "session-secret-value";

afterEach(() => {
  vi.unstubAllEnvs();
  resetRateLimits();
});

function post(password: string, ip = "198.51.100.20") {
  return POST(
    new Request("http://localhost/api/admin/login", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": ip },
      body: JSON.stringify({ password }),
    }),
  );
}

describe("POST /api/admin/login", () => {
  it("locks sign-in when the password is unset", async () => {
    vi.stubEnv("ADMIN_PASSWORD", "");
    vi.stubEnv("ADMIN_SESSION_SECRET", SECRET);
    const response = await post(PASSWORD);
    expect(response.status).toBe(503);
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("sets an httpOnly session cookie for the right password", async () => {
    vi.stubEnv("ADMIN_PASSWORD", PASSWORD);
    vi.stubEnv("ADMIN_SESSION_SECRET", SECRET);
    vi.stubEnv("RENDER", "");
    const wrong = await post("not-the-password");
    expect(wrong.status).toBe(401);

    const response = await post(PASSWORD, "198.51.100.21");
    expect(response.status).toBe(200);
    const cookie = response.headers.get("set-cookie") ?? "";
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
    const token = cookie.slice(cookie.indexOf("=") + 1, cookie.indexOf(";"));
    expect(token.startsWith(`${ADMIN_COOKIE}=`)).toBe(false);
    expect(await verifySessionToken(PASSWORD, SECRET, token)).toBe(true);
  });

  it("rate limits repeated attempts", async () => {
    vi.stubEnv("ADMIN_PASSWORD", PASSWORD);
    vi.stubEnv("ADMIN_SESSION_SECRET", SECRET);
    vi.stubEnv("RENDER", "");
    for (let attempt = 0; attempt < LOGIN_LIMIT; attempt += 1) {
      expect((await post("nope", "198.51.100.30")).status).toBe(401);
    }
    expect((await post(PASSWORD, "198.51.100.30")).status).toBe(429);
  });
});
