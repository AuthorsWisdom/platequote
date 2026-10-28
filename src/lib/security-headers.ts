/**
 * three.js is bundled by Next and loaded from this origin (`script-src 'self'`),
 * including blob workers used by the preview. PayPal's sandbox JS SDK v6 is loaded
 * from www.sandbox.paypal.com and talks to paypal.com.
 */
export function contentSecurityPolicy(): string {
  return [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' blob: https://www.sandbox.paypal.com https://sandbox.paypal.com https://www.paypal.com https://www.paypalobjects.com",
    "style-src 'self' 'unsafe-inline' https://www.sandbox.paypal.com https://www.paypal.com",
    "img-src 'self' data: blob: https://www.paypalobjects.com https://www.sandbox.paypal.com https://www.paypal.com",
    "font-src 'self' data:",
    "connect-src 'self' blob: https://www.sandbox.paypal.com https://sandbox.paypal.com https://www.paypal.com https://www.paypalobjects.com https://api-m.sandbox.paypal.com",
    "frame-src https://www.sandbox.paypal.com https://sandbox.paypal.com https://www.paypal.com https://www.paypalobjects.com",
    "worker-src 'self' blob:",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self' https://www.sandbox.paypal.com https://www.paypal.com",
    "object-src 'none'",
  ].join("; ");
}

export function securityHeaders(): Array<{ key: string; value: string }> {
  return [
    { key: "Content-Security-Policy", value: contentSecurityPolicy() },
    { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  ];
}
