import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ADMIN_COOKIE,
  DEV_ADMIN_PASSWORD,
  DEV_ADMIN_SESSION_SECRET,
  adminAuthorized,
  adminConfig,
  clearSessionCookie,
  createSessionToken,
  passwordMatches,
  requestNeedsAdmin,
  requireAdmin,
  safeNextPath,
  sessionCookie,
  timingSafeEqualString,
  verifySessionToken,
} from "./admin-session";

const PASSWORD = "shop-owner-password";
const SECRET = "session-secret-value";

afterEach(() => {
  vi.unstubAllEnvs();
});

function readyEnv() {
  vi.stubEnv("ADMIN_PASSWORD", PASSWORD);
  vi.stubEnv("ADMIN_SESSION_SECRET", SECRET);
  vi.stubEnv("RENDER", "");
  vi.stubEnv("RENDER_SERVICE_ID", "");
}

describe("adminConfig", () => {
  it("locks admin when either secret is missing", () => {
    vi.stubEnv("ADMIN_PASSWORD", "");
    vi.stubEnv("ADMIN_SESSION_SECRET", "");
    expect(adminConfig().state).toBe("locked");

    vi.stubEnv("ADMIN_PASSWORD", PASSWORD);
    vi.stubEnv("ADMIN_SESSION_SECRET", "");
    expect(adminConfig().state).toBe("locked");

    vi.stubEnv("ADMIN_PASSWORD", "");
    vi.stubEnv("ADMIN_SESSION_SECRET", SECRET);
    expect(adminConfig().state).toBe("locked");
  });

  it("accepts the documented dev password off Render", () => {
    vi.stubEnv("ADMIN_PASSWORD", DEV_ADMIN_PASSWORD);
    vi.stubEnv("ADMIN_SESSION_SECRET", DEV_ADMIN_SESSION_SECRET);
    vi.stubEnv("RENDER", "");
    vi.stubEnv("RENDER_SERVICE_ID", "");
    expect(adminConfig().state).toBe("ready");
  });

  it("refuses the documented dev password on Render", () => {
    vi.stubEnv("ADMIN_PASSWORD", DEV_ADMIN_PASSWORD);
    vi.stubEnv("ADMIN_SESSION_SECRET", SECRET);
    vi.stubEnv("RENDER", "true");
    expect(adminConfig().state).toBe("locked");

    vi.stubEnv("ADMIN_PASSWORD", PASSWORD);
    vi.stubEnv("ADMIN_SESSION_SECRET", DEV_ADMIN_SESSION_SECRET);
    vi.stubEnv("RENDER", "");
    vi.stubEnv("RENDER_SERVICE_ID", "srv-platequote");
    expect(adminConfig().state).toBe("locked");
  });
});

describe("password and session", () => {
  it("compares passwords without trusting length alone", () => {
    expect(passwordMatches(PASSWORD, PASSWORD)).toBe(true);
    expect(passwordMatches("shop-owner-passworD", PASSWORD)).toBe(false);
    expect(passwordMatches("short", PASSWORD)).toBe(false);
    expect(timingSafeEqualString("abc", "abcd")).toBe(false);
  });

  it("round-trips a signed cookie and rejects tampering, expiry, and password changes", async () => {
    const now = 1_700_000_000_000;
    const token = await createSessionToken(PASSWORD, SECRET, now);
    expect(await verifySessionToken(PASSWORD, SECRET, token, now + 1000)).toBe(true);
    expect(await verifySessionToken(PASSWORD, SECRET, `${token}x`, now + 1000)).toBe(false);
    expect(await verifySessionToken("other-password", SECRET, token, now + 1000)).toBe(false);
    expect(await verifySessionToken(PASSWORD, "another-session-secret", token, now + 1000)).toBe(false);
    expect(await verifySessionToken(PASSWORD, SECRET, token, now + 8 * 24 * 60 * 60 * 1000)).toBe(false);

    const [payload, signature] = token.split(".");
    expect(await verifySessionToken(PASSWORD, SECRET, `${payload}.${signature.slice(0, -1)}A`, now + 1000)).toBe(false);
  });

  it("sets an HttpOnly SameSite cookie and adds Secure on Render", async () => {
    readyEnv();
    const token = await createSessionToken(PASSWORD, SECRET);
    const local = sessionCookie(token);
    expect(local).toContain(`${ADMIN_COOKIE}=`);
    expect(local).toContain("HttpOnly");
    expect(local).toContain("SameSite=Lax");
    expect(local).not.toContain("Secure");

    vi.stubEnv("RENDER", "true");
    expect(sessionCookie(token)).toContain("Secure");
    expect(clearSessionCookie()).toContain("Max-Age=0");
    expect(clearSessionCookie()).toContain("Secure");
  });
});

describe("requireAdmin", () => {
  it("rejects anonymous and invalid cookies, and accepts a real session", async () => {
    readyEnv();
    const anonymous = await requireAdmin(new Request("http://localhost/api/orders"));
    expect(anonymous?.status).toBe(401);

    const forged = new Request("http://localhost/api/orders", { headers: { cookie: `${ADMIN_COOKIE}=forged` } });
    expect((await requireAdmin(forged))?.status).toBe(401);

    const token = await createSessionToken(PASSWORD, SECRET);
    const authed = new Request("http://localhost/api/orders", { headers: { cookie: `${ADMIN_COOKIE}=${token}` } });
    expect(await requireAdmin(authed)).toBeNull();
    expect(await adminAuthorized(token)).toBe(true);
  });

  it("fails closed when the session secret is unset", async () => {
    vi.stubEnv("ADMIN_PASSWORD", PASSWORD);
    vi.stubEnv("ADMIN_SESSION_SECRET", "");
    const response = await requireAdmin(new Request("http://localhost/dashboard"));
    expect(response?.status).toBe(503);
    const body = (await response?.json()) as { error?: string };
    expect(body.error).toBe("admin_locked");
  });
});

describe("requestNeedsAdmin", () => {
  it("protects shop admin and leaves quote and checkout public", () => {
    expect(requestNeedsAdmin("/dashboard", "GET")).toBe(true);
    expect(requestNeedsAdmin("/dashboard/settings", "GET")).toBe(true);
    expect(requestNeedsAdmin("/dashboard/ops", "GET")).toBe(true);
    expect(requestNeedsAdmin("/api/orders", "GET")).toBe(true);
    expect(requestNeedsAdmin("/api/orders/abc", "PATCH")).toBe(true);
    expect(requestNeedsAdmin("/api/shop", "PUT")).toBe(true);
    expect(requestNeedsAdmin("/api/shop", "GET")).toBe(false);
    expect(requestNeedsAdmin("/api/shop", "HEAD")).toBe(false);
    expect(requestNeedsAdmin("/", "GET")).toBe(false);
    expect(requestNeedsAdmin("/q/cuid", "GET")).toBe(false);
    expect(requestNeedsAdmin("/api/quotes", "POST")).toBe(false);
    expect(requestNeedsAdmin("/api/quotes/abc", "GET")).toBe(false);
    expect(requestNeedsAdmin("/api/paypal/webhook", "POST")).toBe(false);
    expect(requestNeedsAdmin("/api/paypal/orders", "POST")).toBe(false);
    expect(requestNeedsAdmin("/api/health", "GET")).toBe(false);
    expect(requestNeedsAdmin("/login", "GET")).toBe(false);
  });
});

describe("safeNextPath", () => {
  it("only returns dashboard paths", () => {
    expect(safeNextPath("/dashboard/settings")).toBe("/dashboard/settings");
    expect(safeNextPath("https://evil.example/dashboard")).toBe("/dashboard");
    expect(safeNextPath("//evil.example")).toBe("/dashboard");
    expect(safeNextPath("/dashboard/../login")).toBe("/dashboard");
    expect(safeNextPath("/login")).toBe("/dashboard");
  });
});
