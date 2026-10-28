import { describe, expect, it } from "vitest";
import { contentSecurityPolicy, securityHeaders } from "./security-headers";

describe("securityHeaders", () => {
  it("allows the PayPal sandbox SDK and blocks framing", () => {
    const csp = contentSecurityPolicy();
    expect(csp).toContain("https://www.sandbox.paypal.com");
    expect(csp).toContain("https://www.paypal.com");
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain("worker-src 'self' blob:");
    expect(csp).toContain("frame-ancestors 'none'");

    const headers = Object.fromEntries(securityHeaders().map((header) => [header.key, header.value]));
    expect(headers["Strict-Transport-Security"]).toContain("max-age=31536000");
    expect(headers["X-Frame-Options"]).toBe("DENY");
    expect(headers["X-Content-Type-Options"]).toBe("nosniff");
    expect(headers["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
    expect(headers["Content-Security-Policy"]).toBe(csp);
  });
});
