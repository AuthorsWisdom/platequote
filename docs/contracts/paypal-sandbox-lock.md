# Contract: paypal-sandbox-lock

Branch `agent/paypal-sandbox-lock`, based on `agent/security-fixes-2026-11-02` (bc56b98).

Ruling: Christopher, 2026-11-03. PlateQuote is PayPal sandbox only. This supersedes the
2026-10-29 per-host live setup (custom domain on live PayPal).

## Must hold
- `src/lib/paypal-env.ts` knows one environment, `sandbox`. Every host and every request
  resolves to it. `PAYPAL_ENV` and any leftover live host list in the env are ignored.
- The server only calls `https://api-m.sandbox.paypal.com`; the SDK URL is
  `https://www.sandbox.paypal.com/web-sdk/v6/core`.
- Credentials come only from `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_WEBHOOK_ID`.
- No live key names and no live host list in `render.yaml`; its comment marks the 10/29
  setup as superseded.
- Orders already recorded with `paypalEnv = "live"` are refused by the existing
  environment-mismatch checks in `createPaypalCheckout` / `capturePaypalCheckout`.
- README and UI copy say sandbox only. (`.env.example` already had no live entries.)
- `scripts/gate.local.sh` section 10 FAILs if the live REST host or a live key name appears
  in tracked files under `src/` or in `render.yaml`, or if paypal-env.ts stops naming the
  sandbox API host.

## Out of scope
- CSP in `src/lib/security-headers.ts` still allows `www.paypal.com` / `paypalobjects.com`
  frame/script origins that the sandbox SDK may load; unchanged.
- `src/app/terms/page.tsx` legal copy still mentions receipts "for live orders"; legal text
  is Christopher's call, not edited.
- Render dashboard env vars: Christopher deletes any leftover live PayPal vars by hand.
