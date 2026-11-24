# Terms rewritten as demo-only (2026-11-23)

Order: "rewrite terms as demo-only". Ruling on file: docs/contracts/paypal-sandbox-lock.md line 5,
"PlateQuote is PayPal sandbox only." Branch `fix/terms-demo-only` from origin/main 881320c, built in a
separate worktree (`~/projects/platequote-terms-demo`); the main checkout and its untracked
scripts/keep-warm.sh were not touched. Not merged; the merge is Christopher's.

## What the page says now

PlateQuote is a demonstration of quoting software; Northline Print is a sample shop and nothing is for
sale. Quotes are estimates, checkout runs in PayPal's sandbox (test accounts only, no real money), nothing
is printed or shipped, so there are no real orders, charges, refunds, shipping, or sales tax.

Kept: operator identity and contact, the upload storage description, the Anthropic payload list, the
no-training sentence verbatim ("By default, Anthropic does not use inputs or outputs from its API to
train its models."), "AI-written notes can be wrong", acceptable use, IP in uploads, no warranty, Texas law.
Effective date stays November 23, 2026.

## Files changed

- `src/app/terms/page.tsx`: rewritten (sections: who, demonstration, what it does, quotes are estimates,
  no orders/payments/refunds (`#refunds` anchor kept for the /refunds redirect), acceptable use, privacy
  (`#privacy` anchor kept for /privacy), no warranty, contact).
- `src/components/quote-result.tsx`: three checkout lines that promised refunds/reprints and "By paying
  you agree" now say demonstration / sandbox.
- `src/app/layout.tsx`: site description "pay with PayPal" -> "try a PayPal sandbox checkout".
- `src/lib/paypal.ts`: PayPal order description no longer carries the uploaded file name
  (`<shop>: 3D print x <qty>`) for checkouts created from this change on; a sandbox checkout created
  before it keeps its old description, which the page now says.
- `src/app/terms/terms.test.ts`: updated pinned sentences; added demo, banned-phrase (24 live-sale /
  refund / shipping / tax patterns), metadata, PayPal-disclosure (runs createPaypalCheckout and checks the outgoing body; see Codex rounds) and test-order
  definition tests.
- `src/app/privacy/page.tsx` is only a redirect to `/terms#privacy`; no text there to change.

Facts checked in code before writing: upload-store.ts (48 h prune, skips paid/printing/shipped),
quote-service.ts (disk copy, Order row created at price time), schema.prisma (only payerEmail from PayPal,
no name/address), review.ts userPayload (payload list; OpenAI path off in production), paypal-env.ts
(sandbox only), rate-limit.ts (in-memory IP buckets, 10 to 15 min windows), paypal-checkout.tsx (SDK loads on mount).

## The 13 earlier findings (docs/terms-sandbox-fix-2026-11-23.md)

| # | Finding | Status |
|---|---|---|
| 1 | "sells to customers in the United States only" | Fixed: removed; banned by test |
| 2 | "By paying for an order you agree" | Fixed: "By using this site you agree"; banned by test |
| 3 | Refund promises | Fixed: section now says sandbox charges nothing, nothing to refund; banned by test |
| 4 | PayPal purchase protection | Fixed: page says buyer protection and disputes do not apply to sandbox |
| 5 | Final price / shipping included / payment captured | Fixed: removed; amounts described as estimates; banned by test |
| 6 | Pre-print review, 30-day shipping, risk of loss | Fixed: removed; dashboard states described as demonstration; banned by test |
| 7 | Privacy: fulfil orders, tax records, shipping address, carrier | Fixed: removed; PayPal section says test account email only, address not stored |
| 8 | "nothing paid here" | Fixed: removed; banned by test |
| 9 | Metadata/nav "charges, refunds"; Payment/Refunds sections | Fixed: page metadata, nav, and site-wide layout.tsx description (test on page metadata) |
| 10 | Liability "amount you paid", "when you paid" | Fixed: no-warranty / no-liability-to-extent-law-allows for a free demo; banned by test |
| 11 | "18 or older to order" | Fixed: removed; under-13 line kept |
| 12 | Operator as "Christopher Espinoza, doing business as PlateQuote, a sole proprietor" (assumed-name filing parked) | Left: entity naming is Christopher's call; reviewer rates LOW while nothing is sold, HIGH if live sales return |
| 13 | Anthropic "30 days" retention stated as fact | Fixed: no number stated ("for a limited time under its API data retention policy"); test bans "retention period is N days" |

## Legal-reviewer (legal-reviewer agent; issue-spotting, not advice)

Pass 1 verdict: FIX-FIRST. No CRITICAL. HIGH: H1 PayPal receives shop name, file name, qty, price, order id
undisclosed (fixed: code drops file name, page discloses the rest); H2 "test order" definition contradicted
the code (fixed). MEDIUM M1 to M5 (PayPal script load timing, no retention end, disk copy lifetime,
layout.tsx metadata, tolerance definition): all fixed. LOW L2 (app's own IP use): fixed.

Pass 2 verdict: PUBLISH. No CRITICAL or HIGH; no MEDIUM. Remaining LOW, left by choice:
L1 operator naming (his call); L3 checkout labels ("Pay with PayPal" button, dead "Paid with PayPal."
branch, "Order {id}"); L4 browsewrap agreement (proportionate for a free demo); L5 unnamed email provider
and "We answer within 30 days"; L6 "eligible for deletion" wording. A comment-drift note in paypal.ts was fixed.
Open for a licensed attorney: whether a public PayPal sandbox checkout fits PayPal's Developer Agreement
("anonymous, non-live data" for sandbox); LLC vs sole proprietor naming.

## What ran (Studio, worktree ~/projects/platequote-terms-demo)

- `npm ci`: completed (install scripts held by npm); `npx prisma generate` run after.
- Must-FAIL control, new tests against origin/main's page.tsx: `Tests  6 failed | 2 passed (8)`
  (failed: storage sentence, AI-notes sentence, retention, demonstration, no live-sale claims, metadata).
- New page, src/app/terms: `Tests  10 passed (10)`.
- `npm test`: `Test Files  20 passed (20)`, `Tests  113 passed (113)`.
- `npm run build`: `✓ Compiled successfully in 2.2s`, `/terms` built, exit 0.
- `bash scripts/gate.sh`: vitest `113 passed`, worker pytest `16 passed, 8 warnings`, `All 2 check(s) passed.`,
  `GATE: PASS`, exit 0.

## PR

https://github.com/AuthorsWisdom/platequote/pull/14 (OPEN, not merged)

## Codex rounds (read-only `codex exec -s read-only`, Studio)

Round 0 (pre-fix review): `VERDICT: FIX-FIRST`. No CRITICAL/HIGH; three MEDIUM:
records/retention overclaim (takedown or request named as the end of retention; record fields
incomplete), PayPal paragraph overclaim (pre-change PayPal orders keep the file-name description;
payer email not always present), weak tests (file-name check matched only the old template;
metadata check passed with both fields absent). Three LOW (SDK load, rate-limit memory, sandbox disputes).

Fixes, commit da53ef9:
- Records list now names rush choice, print purpose, mesh measurements, slicer results,
  printability and AI review notes, and the PayPal sandbox order and capture IDs. "Until the
  demonstration is taken down" is gone: "The site does not delete these records, or files kept for
  test orders, on its own. We delete them when you ask us to."
- PayPal paragraph: "A sandbox checkout started before these terms took effect may still carry a
  PayPal description that includes the file name." Payer email stored "when a sandbox checkout
  completes and PayPal provides one".
- LOW wording: sandbox disputes are "a simulation" (and "or cancel" dropped); PayPal code loads on a
  priced quote "that is still open for a sandbox checkout"; IP held "in server memory, not in the
  database".
- Tests: the PayPal test runs the real `createPaypalCheckout` with prisma and fetch mocked and an
  upload named `zz-secret-bracket-QX7731.stl`, and asserts the outgoing create-order body lacks it;
  the metadata test requires string title/description. New retention/payer-email test.
- Must-FAIL controls (each run, then restored): file name in a separate `invoice_id` field -> 1 failed;
  old `${originalFilename}` description template -> 1 failed; `metadata = {}` -> 1 failed; HEAD page
  text -> retention test 1 failed. Restored tree: 11 passed.
- `npm test` 114 passed (20 files); `npm run build` compiled, exit 0; `scripts/gate.sh` `GATE: PASS`, exit 0.

Round 1 (re-review of origin/main..da53ef9): all three MEDIUMs resolved; two LOW.
Verdict line quoted: `VERDICT: SHIP`

After round 1, both LOWs fixed in wording: quote links show the file "while it is kept"; this note's
PayPal and test lines updated. Not merged; main is PR-only and the merge is Christopher's.
