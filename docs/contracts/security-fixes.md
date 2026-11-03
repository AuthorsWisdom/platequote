# Task contract: security fixes (2026-11-02)

**Goal:** Fix four findings from the 2026-11-02 read-only security sweep, as approved by Christopher.

1. `worker/requirements.txt`: lxml to a current release >= 6.1.0 (XXE via `iterparse`, GHSA-vfmq-68hx-4jfw), python-multipart to >= 0.0.31 (DoS advisories).
2. `src/lib/rate-limit.ts`: stop trusting the first `X-Forwarded-For` value; use the right-most hop appended by Render's proxy (trusted hop count configurable, default 1). Add a global admin-login limit across all IPs on top of the per-IP limit.
3. `src/lib/admin-session.ts`: refuse the public dev admin password and dev session secret when `NODE_ENV=production` as well as on Render. Set the cookie `Secure` flag whenever `NODE_ENV=production`.
4. Per-IP `rateLimit` on `POST /api/paypal/orders` and `POST /api/paypal/orders/[paypalOrderId]/capture`.

**Constraints:**
- Branch `agent/security-fixes-2026-11-02` only. Never push to or merge into main. No PR, no deploy.
- Do not touch `src/lib/paypal-env.ts`, `PAYPAL_LIVE_HOSTS`, `render.yaml`, any live PayPal logic, or the `LLM_PROVIDER` mock setting.
- No npm dependency bumps (next, prisma, vitest) and nothing else outside the four items.
- Never print or commit secrets.

**Deliverable:** One branch with the four fixes, unit tests for 2, 3 and 4, and this contract.

**Done when:**
- `npm test`, typecheck, lint and `npm run build` pass; worker pytest passes on the new pins.
- trimesh 4.6.4 still loads a sample `.3mf` with the new lxml, and the earlier XXE repro no longer resolves the external entity.
- A REJECT-first verifier accepts the diff as in scope.

**Needs approval:** Opening a PR, merging, deploying, or syncing the Render blueprint.

**If blocked:** Stop and write `STATE.md` with what failed, what was tried, and the next step.
