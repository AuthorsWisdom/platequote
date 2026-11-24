# Judge rehearsal, 2026-11-23

Run 17:15 to 17:20 CST from the Studio, against https://platequote.tech (warm; first GET `/` returned 200 in 0.30 s, so the ~50 s Render cold start was not exercised). Browser: Claude in Chrome, own tab. Mobile: headless Chrome with CDP mobile emulation at 390x844. Read-only except quote creation and PayPal sandbox order creation (no PayPal login, no payment, no admin login).

**Verdict: the judge path works end to end up to the PayPal sandbox sign-in page. The AI review is live Claude on every quote tested. What hurts is the written story: the Devpost text and the terms page say things the live site contradicts.**

## Intended judge path (from README.md and the Devpost page)

Landing, then a sample part or an upload, then a quote with slicer grams and time, a price breakdown, and a review. Switch material with one click, then pay with PayPal sandbox. No Devpost or judge notes live in the repo. The Devpost text was read from https://devpost.com/software/platequote, which was open in the session's tab group.

## Steps

| # | Step | Result | Observed evidence |
|---|------|--------|-------------------|
| 1 | Landing `/` | PASS | 200, 0.30 s. Heading "A price from the slicer, not a guess." Sample buttons: Calibration cube, Angle bracket, Overhang hook. Material cards PLA/PETG/ASA/TPU with $/g and $/machine-hour. Before a file is chosen, the preview panel reads "Loading preview..." |
| 2 | Upload `samples/overhang-hook.stl` (PLA, Black, qty 1) | PASS | Preview rendered (the part is a flat black silhouette because the colour is Black). Clicking "Slice and price" took **10.3 s** to reach `/q/cmwtvwvvu0015j542tufdkatx` |
| 3 | Quote page for the hook | PASS | $8.00. Filament 8.75 g × $0.025/g = $0.22. Machine 42m 35s × $6.00/h = $4.26. "Shop minimum replaces the sum above" $8.00. Box 40 × 24 × 28 mm. Supports Yes. Watertight, overhang 9.4%. Tolerance ±15% |
| 4 | AI review panel for the hook | PASS | Badge "AI review · Claude". API: provider `anthropic`, mocked `false`, mockReason `null`. Notes are sensible: supports needed at 9.4% overhang over 45°, walls about 4 mm, "Overall it looks printable." Material fit: PLA good, PETG ok, ASA ok, TPU poor. 0 em or en dashes on the page. No `$` amounts in the AI text; the only prices are the engine's comparison prices |
| 5 | Second sample, Angle bracket via sample button, PETG | PASS | **8.0 s** to `/q/cmwtvz2qo0019j5422kx1h63m`. $8.00 (filament 8.32 g, $0.25; machine 47m 1s, $5.49; minimum applied). Supports No, overhang 0.0%. "AI review · Claude", provider anthropic, mocked false. No `$` in the AI text, 0 dashes |
| 6 | Bad file, tiny (46-byte .txt renamed .stl), UI | PASS | Preview: "This STL could not be previewed. The server can still try to slice it." After clicking Slice: inline message "The file is too small to be a mesh." No navigation |
| 7 | Bad file, 2.3 KB .txt renamed .stl, API | PASS | `POST /api/quotes` returned 400 in 0.40 s with `{"error":"bad_quote","message":"That file does not look like an STL mesh."}` |
| 8 | One-click material switch ("Price it in ASA") on the cube quote | PASS | "PLA · Black · qty 1" became "ASA · Black · qty 1" in 0.5 s. The note reads "Filament mass was scaled from the sliced volume using this material's density. Print time is unchanged." Estimate stayed $8.00 (minimum). Badge still "AI review · Claude" |
| 9 | PayPal button and handoff | PASS | SDK loaded from `www.sandbox.paypal.com/web-sdk/v6.72.6` (304). `POST /api/paypal/orders` returned 200 with `{"paypalOrderId":"8YJ85693YS8425238"}`. The page shows PayPal's "Click to Continue" overlay while the popup is open. Loading the sandbox `checkoutnow` URL for that token redirected to `sandbox.paypal.com/pay`, titled "Pay with PayPal", which shows the email field plus "Pay with Debit or Credit Card". Stopped there: no login, no payment |
| 10 | Checkout copy | PASS | "Sandbox checkout, no real money moves. The amount is the quoted total stored on the server." and "Sandbox checkout only. Nothing paid here is printed or shipped." |
| 11 | Terms `/terms` | **FAIL (content)** | 200. Effective November 23, 2026. The AI disclosure is accurate (names Claude and lists what is sent). But see break 1: the page says platequote.tech takes live orders |
| 12 | `/privacy`, `/refunds` | PASS | 307 to `/terms#privacy` and `/terms#refunds` |
| 13 | Admin gate (not logged in) | PASS | `/dashboard` 307 to `/login?next=%2Fdashboard`. `/login` 200. No login attempted |
| 14 | Mobile, 390 px | PASS | CDP emulation at 390x844, mobile: `/`, the quote page, and `/terms` all have scrollWidth 390 = clientWidth 390, with 0 overflowing elements. `resize_window` reported success but the Chrome window stayed 1600 wide, so this check ran headless instead. A plain `--window-size=390` headless screenshot looked clipped on the right; the CDP measurement shows that was a capture artifact, not overflow |
| 15 | API cross-check | PASS | `GET /api/shop` 200 (Northline Print, 4 materials, min $8, rush $5). `GET /api/quotes/{id}` 200 for both browser quotes, matching the page. `POST /api/quotes` for the calibration cube: 200 in **6.8 s**, id `cmwtw21ry001dj542pcjj7ylo`, 3.55 g, 1024 s, no supports, $8.00, provider anthropic, mocked false |
| 16 | Console | PASS | No console errors captured on the quote page (tracking began mid-session) |

Time per quote: 6.8 to 10.3 s warm (3 samples). Cold start not measured.

POSTs used: 3 browser slices (hook, bracket, tiny bad file) and 2 curl quotes (cube, bad file), within the 10 per 10 min per-IP limit. Three sandbox PayPal orders were created by three button clicks. All were abandoned and none were captured.

## What breaks or confuses a judge (ranked)

1. **Terms say platequote.tech is the live store and the onrender copy is the sandbox for judging.** Quoted from /terms: "PayPal receipts for live orders name PlateQuote as the seller", then "A second copy of this site runs at platequote-web.onrender.com for software judging. Checkout there uses the PayPal sandbox". The site Devpost links to (platequote.tech) is sandbox only (the LOCKED ruling and the on-page checkout copy). A judge who reads the terms sees the two disagree.
2. **The Devpost text is out of date on the AI.** It says "The hosted demo currently runs that built-in reviewer", while the live site shows "AI review · Claude" on every quote. It also says the Anthropic path "defaults to claude-sonnet-4-5", while the README says `claude-haiku-5-5`. It says "uploads live in /tmp", while the README says Postgres (`QuoteFile`). The strongest current feature is understated, and a judge comparing text to site sees drift.
3. **Every sample prices at exactly $8.00, for every material.** All three samples land under the $8 minimum (before-minimum totals $4.48 for the hook, $5.74 for the bracket). Every "Price it in X" comparison shows $8.00 too. The deterministic pricing engine, the core claim, never visibly moves on the demo path. A judge has to read the "Shop minimum replaces the sum above" line to see why.
4. **A judge cannot finish checkout without their own PayPal sandbox account.** The README says "No sandbox buyer login is included here." The handoff page offers "Pay with Debit or Credit Card" (sandbox guest checkout, not tested). The Devpost claim "verified with a real sandbox payment" cannot be reproduced by a judge without sandbox credentials.
5. **Cold start was not exercised.** The site was warm. On the free plan the first visit after 15 idle minutes waits about 50 s with no message, as briefed and not measured here. A judge may read that as broken.
6. **Each PayPal click creates a new sandbox order** (three clicks gave three orders, one id captured: 8YJ85693YS8425238). Harmless in sandbox. Noted only.
7. Minor: the preview is a flat black silhouette when the colour is Black, with no visible shading, so the shape reads poorly. The README's Devpost deadline line ("November 12, 2026") still stands while judging runs to December 15. Harmless, but it reads as stale.
