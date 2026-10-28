# PlateQuote

PlateQuote is a quote-and-checkout page for a one-person 3D-print shop. A customer uploads an STL or 3MF. A separate slicer process returns filament weight, print time, and whether supports were generated. The price is that output times the shop's own rates. A written review explains printability and materials. It does not set the price. Checkout, when configured, uses the PayPal sandbox.

This repository is the hackathon build for the PayPal AI Hackathon (Devpost deadline November 12, 2026, 12:00pm PT). Nothing here has been deployed, and no accounts or domains have been registered by this project.

## What works

- Shop setup for the name, printer bed, materials (`$/g`, `$/machine-hour`), minimum order, and rush fee. A demo shop, Northline Print, is seeded.
- Public quote page: upload (25 MB cap), sample parts, three.js preview, material, color, quantity, and purpose.
- Slicing worker: PrusaSlicer 2.8.1 runs as its own process inside Docker. The response is JSON (grams, time, supports, bounding box) plus mesh facts from trimesh (bed fit, watertightness, overhang share, thin-wall flag).
- Deterministic pricing. Quantity multiplies material and machine time. A shop minimum replaces a smaller sum. Rush is a flat fee added after that. Switching material after a slice rescales filament mass from the sliced volume and keeps the print time, and the page says so.
- Printability review and material advice. With `LLM_PROVIDER=mock` or no API key, a built-in reviewer writes the notes from the mesh facts and slicer JSON. OpenAI-compatible and Anthropic providers are wired behind env vars. Dollar amounts the model tries to write are stripped. Comparison prices are attached afterward by the pricing engine.
- PayPal sandbox checkout with JavaScript SDK v6 and Orders v2. The server creates the order and captures it. Webhooks for `CHECKOUT.ORDER.APPROVED` (server captures) and `PAYMENT.CAPTURE.COMPLETED` (marks paid) are implemented. Without keys, checkout shows a clear message and quotes still work.
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

Open [http://127.0.0.1:43123](http://127.0.0.1:43123).

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

## PayPal sandbox

1. In the PayPal Developer Dashboard, create a sandbox app and a sandbox buyer.
2. Put `PAYPAL_CLIENT_ID` and `PAYPAL_CLIENT_SECRET` in `.env`. Keep `PAYPAL_ENV=sandbox`.
3. Recreate the web container so it picks up the env: `docker compose up -d --build web`.
4. Price a part, then use the PayPal button and the sandbox buyer. The button loads `https://www.sandbox.paypal.com/web-sdk/v6/core`. The server calls `https://api-m.sandbox.paypal.com` only.
5. After capture, the order is paid and shows on `/dashboard`.

This build rejects any PayPal environment other than sandbox.

Webhooks are the backup path if the browser closes after approval. Register the listener URL in the sandbox app and set `PAYPAL_WEBHOOK_ID`. Signatures are verified against PayPal. For a hand-posted local fixture only, set `PAYPAL_ALLOW_UNVERIFIED_WEBHOOKS=true`. Leave that unset otherwise. `CHECKOUT.ORDER.APPROVED` triggers a server capture. `PAYMENT.CAPTURE.COMPLETED` marks the order paid when the amount matches the quote. A mismatch does not mark it paid.

No sandbox buyer login is included here. Use the buyer from your own sandbox app.

## Environment

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Postgres connection string |
| `SLICER_WORKER_URL` | Worker base URL, or `host:port` |
| `UPLOAD_DIR` | Where uploaded meshes are stored |
| `PAYPAL_ENV` | Must be `sandbox` |
| `PAYPAL_CLIENT_ID` | Sandbox client id (public) |
| `PAYPAL_CLIENT_SECRET` | Sandbox secret. Server only |
| `PAYPAL_WEBHOOK_ID` | Sandbox webhook id for signature checks |
| `PAYPAL_ALLOW_UNVERIFIED_WEBHOOKS` | `true` only for local unsigned webhook posts |
| `LLM_PROVIDER` | `mock`, `openai`, or `anthropic` |
| `LLM_API_KEY` | Blank falls back to the mock reviewer |
| `LLM_MODEL` | Overrides the provider default |
| `LLM_BASE_URL` | OpenAI-compatible base URL |

## Tests

```bash
npm test
```

Covers the pricing engine, slicer JSON parsing, the mock review (no prices), and PayPal webhook interpretation.

```bash
python3 -m venv .venv
.venv/bin/pip install -r worker/requirements.txt
.venv/bin/pytest worker/tests
```

Covers PrusaSlicer G-code summary parsing (grams, time, support extrusion).

## Render

`render.yaml` describes two free web services (the Next.js app and the Docker slicer worker) and a free Postgres. Applying it is the owner's step. Free instances have an ephemeral filesystem, so uploads live in `/tmp` and do not survive a restart, and a free service sleeps after 15 idle minutes (the first request after that is slow). The worker is reachable on its public `onrender.com` URL; set `SLICER_WORKER_URL` in the dashboard if Render suffixes the name. Set the PayPal and LLM secrets in the Render dashboard. Do not put them in the blueprint. Hackathon credits, if any, are claimed by the owner.

`SLICER_WORKER_URL` is wired from the private service host and port. The app adds `http://` when the value has no scheme.

## Slicer license

PrusaSlicer is AGPL-3.0. This repo does not vendor or link its source. The worker image downloads the 2.8.1 Linux AppImage at build time and runs `prusa-slicer` as a separate process. Anyone who distributes that image needs to comply with the slicer's license, including source availability. 2.8.1 is used because later official Linux builds are Flatpak-only.

## License

`LICENSE` is MIT as a placeholder. The license choice is pending the owner's confirmation. Do not treat that file as a final decision.
