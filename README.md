# PlateQuote

PlateQuote is a quote-and-checkout page for a one-person 3D-print shop. A customer uploads an STL or 3MF. A separate slicer process returns filament weight, print time, and whether supports were generated. The price is that output times the shop's own rates. A written review explains printability and materials. It does not set the price. Checkout, when configured, uses PayPal: the sandbox by default, live on the hosts listed in `PAYPAL_LIVE_HOSTS`.

This repository is the hackathon build for the PayPal AI Hackathon (Devpost deadline November 12, 2026, 12:00pm PT). The hosted demo runs on Render at `https://platequote.tech` (custom domain verified with a Render-issued certificate on 2026-10-29; `www` redirects to the root). The service also stays reachable at `https://platequote-web.onrender.com`, which is the host the PayPal sandbox webhook was registered against. Web service on the free plan, deployed 2026-10-28.

## What works

- Shop setup for the name, printer bed, materials (`$/g`, `$/machine-hour`), minimum order, and rush fee. A demo shop, Northline Print, is seeded.
- Public quote page: upload (25 MB cap), sample parts, three.js preview, material, color, quantity, and purpose.
- Slicing worker: PrusaSlicer 2.8.1 runs as its own process inside Docker. The response is JSON (grams, time, supports, bounding box) plus mesh facts from trimesh (bed fit, watertightness, overhang share, thin-wall flag).
- Deterministic pricing. Quantity multiplies material and machine time. A shop minimum replaces a smaller sum. Rush is a flat fee added after that. Switching material after a slice rescales filament mass from the sliced volume and keeps the print time, and the page says so.
- Printability review and material advice. With `LLM_PROVIDER=mock` or no API key, a built-in reviewer writes the notes from the mesh facts and slicer JSON. OpenAI-compatible and Anthropic providers are wired behind env vars. Dollar amounts the model tries to write are stripped. Comparison prices are attached afterward by the pricing engine.
- PayPal checkout with JavaScript SDK v6 and Orders v2, sandbox or live per host. The server creates the order and captures it. Webhooks for `CHECKOUT.ORDER.APPROVED` (server captures) and `PAYMENT.CAPTURE.COMPLETED` (marks paid) are implemented. Without keys, checkout shows a clear message and quotes still work.
- Shop orders table: quoted, paid, printing, shipped. Printing and shipped are local status marks.

## What is stubbed

- Shop ops chat (PayPal Agent Toolkit: invoice, shipment tracking, refund, insights). The page at `/dashboard/ops` lists the intended commands and does not call PayPal.
- MCP server in `mcp/`. It lists `get_quote` and `create_checkout` and refuses to run them. `create_checkout` is planned to return a PayPal approval link so a person approves the payment.
- Email receipts, live PayPal, multi-shop accounts, and printer status. This app does not control a printer.

## Run locally

Docker is the supported path.

```bash
cp .env.example .env   # optional; empty PayPal keys are fine
docker compose up --build
```

Open [http://127.0.0.1:43123](http://127.0.0.1:43123). Shop admin is at [http://127.0.0.1:43123/login](http://127.0.0.1:43123/login). The local password is `platequote-dev` (see `.env.example`).

- Web app: port 43123
- Slicer worker: port 8091
- Postgres: port 54329 (user, password, and database are all `platequote`)

The first web start runs Prisma migrations and seeds Northline Print if that shop is missing. Later starts leave edited shop settings alone.

A faster UI loop, after the database and worker are up:

```bash
npm ci
npx prisma generate
npm run dev
```

Point `DATABASE_URL` and `SLICER_WORKER_URL` at the compose ports (see `.env.example`).

## Try a quote

On the quote page, use one of the sample buttons or upload a file from `samples/` (the same files are served from `public/samples/`):

- `calibration-cube.stl` — 20 mm cube, no supports
- `angle-bracket.stl` — L-bracket
- `overhang-hook.stl` — lip that needs support

You should see grams, time, a price breakdown, and a review. The overhang hook should report supports. The price is an estimate from a generic 0.20 mm / 15% infill / 0.4 mm nozzle profile, shown with the shop's tolerance (seeded at ±15%). It is not a tuned printer profile.

## PayPal

Sandbox, the default everywhere:

1. In the PayPal Developer Dashboard, create a sandbox app and a sandbox buyer.
2. Put `PAYPAL_CLIENT_ID` and `PAYPAL_CLIENT_SECRET` in `.env`. Keep `PAYPAL_ENV=sandbox`.
3. Recreate the web container so it picks up the env: `docker compose up -d --build web`.
4. Price a part, then use the PayPal button and the sandbox buyer. The button loads `https://www.sandbox.paypal.com/web-sdk/v6/core`. The server calls `https://api-m.sandbox.paypal.com`.
5. After capture, the order is paid and shows on `/dashboard` once you are signed in as the shop admin.

Live, per host: `PAYPAL_LIVE_HOSTS` is a comma-separated list of hostnames (read from the request's `Host` header) that use live PayPal with `PAYPAL_LIVE_CLIENT_ID`, `PAYPAL_LIVE_CLIENT_SECRET` and `PAYPAL_LIVE_WEBHOOK_ID`. Every other host keeps the sandbox keys. The hosted demo lists `platequote.tech` and `www.platequote.tech`, so the custom domain takes real payments while `platequote-web.onrender.com` stays on the sandbox. `PAYPAL_ENV=live` makes live the default for every host instead. The two key sets never mix: an order records which environment created its PayPal order (`paypalEnv`), a capture from the other environment is refused with 409, and the admin order list marks sandbox payments as "no real money".

Webhooks are the backup path if the browser closes after approval. Register the listener URL in the sandbox app and set `PAYPAL_WEBHOOK_ID`; for live, register it in the live app and set `PAYPAL_LIVE_WEBHOOK_ID`. Each signature is verified against every environment that has a webhook id, and the one that verifies decides which PayPal the capture call goes to. For a hand-posted local fixture only, set `PAYPAL_ALLOW_UNVERIFIED_WEBHOOKS=true` while running `npm run dev`. That flag is ignored when `NODE_ENV=production`, which covers Docker, `next start`, and Render. `CHECKOUT.ORDER.APPROVED` triggers a server capture. `PAYMENT.CAPTURE.COMPLETED` marks the order paid when the amount matches the quote. A mismatch does not mark it paid.

No sandbox buyer login is included here. Use the buyer from your own sandbox app.

## Environment

Dev values below are not production secrets. Copy `.env.example` for local `npm run dev`. Docker Compose uses the same defaults when the variables are unset.

| Variable | Required on Render | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | Yes, from the database | Postgres connection string |
| `SLICER_WORKER_URL` | Yes, set in the blueprint | Worker base URL, or `host:port` |
| `SLICER_WORKER_TOKEN` | Yes, generated and shared | Shared secret sent as `X-Worker-Token`. Both services must have the same value. On Render it lives in the `platequote-worker-auth` env group |
| `ADMIN_PASSWORD` | Yes, you set it (`sync: false`) | Shop admin password. Unset locks admin. The dev value is refused on Render |
| `ADMIN_SESSION_SECRET` | Yes, generated | HMAC key for the admin session cookie. Unset locks admin |
| `UPLOAD_DIR` | Set in the blueprint | Local cache for uploaded meshes; the copy of record is the `QuoteFile` table in Postgres |
| `PAYPAL_ENV` | Yes, `sandbox` | Default environment for hosts not in `PAYPAL_LIVE_HOSTS`: `sandbox` or `live` |
| `PAYPAL_LIVE_HOSTS` | Set in the blueprint | Hostnames that use live PayPal (`platequote.tech,www.platequote.tech`) |
| `PAYPAL_CLIENT_ID` | For sandbox checkout | Sandbox client id (public) |
| `PAYPAL_CLIENT_SECRET` | For sandbox checkout | Sandbox secret. Server only |
| `PAYPAL_WEBHOOK_ID` | For sandbox webhooks | Sandbox webhook id for signature checks |
| `PAYPAL_LIVE_CLIENT_ID` | For live checkout | Live client id (public), from the live REST app |
| `PAYPAL_LIVE_CLIENT_SECRET` | For live checkout | Live secret. Server only, never in a file |
| `PAYPAL_LIVE_WEBHOOK_ID` | For live webhooks | Live webhook id for signature checks |
| `PAYPAL_ALLOW_UNVERIFIED_WEBHOOKS` | Do not set | `true` only for unsigned posts to `npm run dev`. Ignored in production |
| `LLM_PROVIDER` | Optional (`mock` in the blueprint) | `mock`, `openai`, or `anthropic` |
| `LLM_API_KEY` | Optional | Blank falls back to the mock reviewer |
| `LLM_MODEL` | Optional | Overrides the provider default |
| `LLM_BASE_URL` | Optional | OpenAI-compatible base URL |

Local dev password and session secret, also used by Compose: `platequote-dev` and `platequote-dev-session-secret`. Local worker token: `platequote-dev-worker`.

## Security

The public site is the quote flow and PayPal checkout. Shop admin is a password gate. Quote links use unguessable ids. Anyone with a link can see that quote, reprice it before payment, and pay it. Changing shop rates or order status requires the admin session.

- `ADMIN_PASSWORD` and `ADMIN_SESSION_SECRET` both have to be set or admin stays locked, including locally. On Render the documented dev password and dev session secret are refused, so a copied `.env.example` cannot open the public admin. The session cookie is `HttpOnly` and `SameSite=Lax`, and `Secure` on Render. It is HMAC-signed, expires after 7 days, and stops working if the password changes. Log out from the header.
- Protected on the server (middleware and the route handlers): `/dashboard`, `/dashboard/settings`, `/dashboard/ops`, `PUT /api/shop`, `GET /api/orders`, and `PATCH /api/orders/[id]`. `GET /api/shop`, quote upload, `/q/[id]`, and PayPal checkout stay public.
- The worker's `POST /slice` requires header `X-Worker-Token` when `SLICER_WORKER_TOKEN` is set. On Render the route stays closed if that secret is missing. `GET /health` stays open. The blueprint generates one value in an env group and links it to both services.
- The buyer's PayPal email is stored for the admin orders list. The public quote page and `GET /api/quotes/[id]` do not include it.
- Quote creation is limited to 10 requests per 10 minutes per IP and 30 per 10 minutes for the whole instance. Admin login is limited to 8 attempts per 15 minutes per IP. The limiter is in memory, which fits a single free instance.
- Uploads are capped at 25 MB, must look like STL or 3MF, and are stored under a generated filename. Download paths cannot leave the upload directory.
- Responses send a Content-Security-Policy that allows the PayPal JS SDK v6 (`sandbox.paypal.com` and `paypal.com`) and the bundled three.js preview, plus HSTS, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, and `Referrer-Policy: strict-origin-when-cross-origin`.
- Unexpected errors are logged on the server and returned as a short message. PayPal webhooks are checked with PayPal's signature API when `PAYPAL_WEBHOOK_ID` is set. `PAYPAL_ALLOW_UNVERIFIED_WEBHOOKS` cannot turn that off in production.

## Tests

```bash
npm test
```

Covers the pricing engine, slicer JSON parsing, the mock review (no prices), PayPal webhook interpretation, the admin session gate, and rate limits.

```bash
python3 -m venv .venv
.venv/bin/pip install -r worker/requirements.txt
.venv/bin/pytest worker/tests
```

Covers PrusaSlicer G-code summary parsing (grams, time, support extrusion) and the worker token check, including the closed-by-default behavior on Render.

## Render

`render.yaml` describes two free web services (the Next.js app and the Docker slicer worker) and a free Postgres. The hosted demo is already on Render. Syncing the blueprint is how new variables reach those services. Editing this file does not deploy by itself. Free instances have an ephemeral filesystem, so uploaded meshes are stored in Postgres (`QuoteFile`) and `/tmp` is only a cache; unpaid uploads are pruned from the database after 48 hours and paid orders keep theirs. A free service sleeps after 15 idle minutes (the first request after that is slow). The worker is reachable on its public `onrender.com` URL; set `SLICER_WORKER_URL` in the dashboard if Render suffixes the name.

Set `ADMIN_PASSWORD` and the PayPal and LLM secrets in the Render dashboard when the blueprint prompts for them. Do not put secret values in the blueprint. `ADMIN_SESSION_SECRET` and `SLICER_WORKER_TOKEN` are generated. The worker token is one value in the `platequote-worker-auth` env group, linked to both services. If a service-level `SLICER_WORKER_TOKEN` is still present from an older sync, remove it so both services use the group value. Hackathon credits, if any, are claimed by the owner.

`SLICER_WORKER_URL` is set in the blueprint to the worker's public `onrender.com` URL. The app adds `http://` when the value has no scheme. After the first sync, sign in at `/login` with the password you set. Quotes work before that. Admin does not.

## Slicer license

PrusaSlicer is AGPL-3.0. This repo does not vendor or link its source. The worker image downloads the 2.8.1 Linux AppImage at build time and runs `prusa-slicer` as a separate process. Anyone who distributes that image needs to comply with the slicer's license, including source availability. 2.8.1 is used because later official Linux builds are Flatpak-only.

## License

MIT, confirmed by the owner on 2026-10-28. See `LICENSE`.
