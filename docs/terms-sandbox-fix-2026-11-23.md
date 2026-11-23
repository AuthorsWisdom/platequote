# Terms page: sandbox-only fix (2026-11-23)

Branch `fix/terms-sandbox-only` from origin/main d8881a6. Built in a separate worktree so the
main checkout (branch fix/vitest4-config, untracked scripts/keep-warm.sh) was not touched.

## Ruling on file

Latest ruling, `docs/contracts/paypal-sandbox-lock.md` line 5 (landed on main as c21bb63,
"PayPal: sandbox only (Nov 3 ruling)", PR #9):

> Ruling: Christopher, 2026-11-03. PlateQuote is PayPal sandbox only. This supersedes the
> 2026-10-29 per-host live setup (custom domain on live PayPal).

Re-affirmed in `~/projects/nexus-protocol/decisions.md` line 8001 (2026-11-23 16:0x):
"the PayPal sandbox-only ruling of 11-03 stands."

Superseded: decisions.md line 7538 (2026-10-29 16:07 LOCKED freeze): "PayPal LIVE on
platequote.tech, SANDBOX on the onrender.com host (per-host switch, PR #4)".

Note: that 11-03 contract (line 26) left the terms copy out of scope: "legal text is
Christopher's call, not edited." This PR edits it on the caller's order and is NOT merged;
the merge stays his.

## Sentences changed (src/app/terms/page.tsx)

Old:
> On platequote.tech, every order is sold, made, and refunded by Christopher Espinoza d/b/a
> PlateQuote. PayPal receipts for live orders name PlateQuote as the seller.

New:
> On platequote.tech, checkout runs in PayPal's sandbox: no real money moves, and nothing paid
> here is printed or shipped.

Old:
> A second copy of this site runs at platequote-web.onrender.com for software judging. Checkout
> there uses the PayPal sandbox: no money moves, and nothing paid there is printed or shipped.

New:
> A second copy of this site runs at platequote-web.onrender.com. Checkout there also uses the
> PayPal sandbox: no money moves, and nothing paid there is printed or shipped.

No em or en dashes (the existing dash test still passes). Effective date already November 23, 2026.

## Test added (src/app/terms/terms.test.ts)

"says checkout on platequote.tech is PayPal sandbox only, with no live orders claim": asserts the
new sentence is present and that `/live orders?/i` and `/for software judging/i` are absent.
No existing test pinned the old sentences.

## What ran (Studio, Node v26.8.2, npm 12.0.2)

- `npm ci`: completed (install scripts held by npm; `npx prisma generate` run after, as gate.local.sh does).
- Must-FAIL control, new test against the old page.tsx:
  `× says checkout on platequote.tech is PayPal sandbox only, with no live orders claim`
  `Tests  1 failed | 5 passed (6)`
- New page: `Tests  6 passed (6)` for src/app/terms.
- `npm test`: `Test Files  20 passed (20)`, `Tests  109 passed (109)`, exit 0.
- `npm run build`: `✓ Compiled successfully in 6.0s`, `/terms` route built, exit 0.
- `bash scripts/gate.sh`: vitest 109 passed, worker pytest `16 passed, 8 warnings`, secret scan ok,
  `All 2 check(s) passed.` / `GATE: PASS`, exit 0.

## Legal issue-spotting (legal-reviewer agent, issue-spotting only, not advice)

Verdict returned: DO-NOT-PUBLISH as written. The two edited sentences are accurate; the rest of
the page still reads as a live-commerce contract. Not edited here (outside the minimal scope;
his call). Findings, quoted from the page:

CRITICAL
1. "PlateQuote sells to customers in the United States only. Orders from elsewhere may be declined
   and refunded in full." sits between the two sandbox sentences and claims real sales and refunds.
2. "By paying for an order you agree to these terms." ties agreement to a payment that never occurs.
3. Refunds section promises real remedies: "cancel for a full refund", "We reprint at no charge or
   refund in full", "We issue an agreed refund within 10 business days", "full refund, no questions."

HIGH
4. "PayPal's own purchase protection and dispute process apply" does not cover sandbox transactions.
5. Pricing/payment read as real: "The price you pay at checkout is the final price", "Shipping within
   the United States is included", "Your payment is captured when you approve it at PayPal".
6. Fulfilment that never happens: "We look at every paid file before printing", the 30-day shipping
   and risk-of-loss bullet.
7. Privacy section over-claims processing: "slice and fulfill orders", "keep tax records", name and
   shipping address "to ship the order", "go to the shipping carrier on the label".

MEDIUM
8. The new wording still says "nothing paid here", calling a sandbox approval "paid"; real PayPal
   logins will not work there, only sandbox test accounts.
9. Metadata/nav: "How PlateQuote quotes, charges, refunds..." and the "Payment" / "Refunds" sections
   present the site as charging money.
10. Liability cap "the amount you paid for it" is always $0 under sandbox only; same for "the terms
    in force when you paid".
11. "You must be 18 or older to order" is worded for a purchase that does not exist.

LOW
12. Operator named as "Christopher Espinoza, doing business as PlateQuote, a sole proprietor", not the
    LLC; the assumed-name filing was PARKED 2026-10-29 17:08 (decisions.md line 7543).
13. Anthropic "30 days" retention stated as fact; not web-checked this session.

Open attorney question raised: whether a public, consumer-facing checkout on the PayPal sandbox fits
PayPal's developer and sandbox terms (not checked).

## PR

PR_URL_PLACEHOLDER
