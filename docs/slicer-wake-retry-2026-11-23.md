# Slicer wake and retry (2026-11-23)

Branch `fix/slicer-wake-retry` (cut from origin/main ed7b3f8), PR https://github.com/AuthorsWisdom/platequote/pull/15 (open, not merged). Built and checked on the Studio.

## Problem

Quotes sent while the free-plan worker slept failed in 66 to 261 ms with "The slicing worker returned something that was not JSON." Render answered the web's POST /slice for the sleeping worker fast with a non-JSON body, and `sliceUpload` treated that as final. Diagnosis: `docs/slicer-outage-2026-11-23.md` on the platequote checkout.

## Change (src/lib/quote-service.ts, sliceUpload only)

- Asleep means: a non-JSON body, a 502 or 504, a 503 without JSON, or a connection error. On asleep the web polls GET /health every 2 s (each probe capped at 10 s) until it answers 200 with `{"ok": true}`, then retries POST /slice exactly once.
- Not asleep, never retried: an abort or timeout (including undici UND_ERR_CONNECT_TIMEOUT, UND_ERR_HEADERS_TIMEOUT, UND_ERR_BODY_TIMEOUT, ETIMEDOUT causes), a 401, the worker's own JSON 503 (token not configured), any real JSON slicer reply.
- 401 and JSON 503 keep the token message. If the worker is not up in time: `worker_waking`, "The slicer was waking up. Try again in a moment."
- Logging: console.warn with status, a media type from a fixed list (else "other"), body length, JSON or not; connection errors log the error name and cause code from fixed lists. No upstream text is logged (Codex round 2: an encoded token echo could survive any masking), so the brief's "first ~200 chars of the body" was replaced by these fixed fields.
- UI: unchanged. The failed-quote panel already shows "No price, because the slice did not finish as a printable job." over the message, which reads sensibly with the waking text.

## Time budget

- Route `maxDuration` 120 s (src/app/api/quotes/route.ts). `quoteDeadline` = start + 115 s (5 s response margin). `slicerTimeoutMs` = deadline - now - 5 s save reserve, capped at 120 s: about 110 s at the slice.
- Both POSTs and all health polling end by one absolute instant, `sliceBy` = slice start + slicerTimeoutMs. Each POST computes its timeout from `sliceBy` after building the form.
- Health polling stops 15 s before `sliceBy` (WAKE_SLICE_RESERVE_MS), leaving the retry at least 15 s. So a wake of up to about 95 s still fits; Render's observed wake is about 30 to 60 s, and the outage-day recovered slice took 8.9 s end to end.
- Render's web request limit is far above 120 s, so the route's own maxDuration is the binding limit.
- The AI review after slicing keeps its own `deadline` handling (unchanged).

## Tests (src/lib/slicer-wake.test.ts, vitest, fetch mocked, fake clock)

16 cases: awake path is one POST and no probe; asleep then awake succeeds with one retry; connection error, JSON 502, JSON 504, HTML 503 count as asleep; never more than one retry; real JSON slicer error not retried; 401 not retried; worker JSON 503 not retried; budget exhausted returns the waking message inside the budget; health must be 200 `{ok: true}`; POST timeout and undici timeout codes not retried; a body stalled until the real POST abort signal fires is not retried; every POST and probe timeout ends by the slice budget; token (plain, HTML-entity, \u-escaped, short, URL-encoded, in body, header, error name, cause code) never logged; no body text logged.

### Must-fail controls (each mutant applied to quote-service.ts, suite run, file restored)

```
MUTANT [no retry after wake] exit=1 RED (caught) :: ['Tests  8 failed | 8 passed (16)']
MUTANT [second retry allowed] exit=1 RED (caught) :: ['Tests  1 failed | 15 passed (16)']
MUTANT [retry real errors] exit=1 RED (caught) :: ['Tests  6 failed | 10 passed (16)']
MUTANT [503 always token (old mapping)] exit=1 RED (caught) :: ['Tests  9 failed | 7 passed (16)']
MUTANT [504 JSON not treated as asleep] exit=1 RED (caught) :: ['Tests  1 failed | 15 passed (16)']
MUTANT [timeout treated as asleep] exit=1 RED (caught) :: ['Tests  1 failed | 15 passed (16)']
MUTANT [stalled body treated as asleep] exit=1 RED (caught) :: ['Tests  1 failed | 15 passed (16)']
MUTANT [wake ignores budget] exit=1 RED (caught) :: ['Tests  1 failed | 15 passed (16)']
MUTANT [retry gets the full budget again] exit=1 RED (caught) :: ['Tests  1 failed | 15 passed (16)']
MUTANT [any 200 JSON counts as awake] exit=1 RED (caught) :: ['Tests  1 failed | 15 passed (16)']
MUTANT [body text logged] exit=1 RED (caught) :: ['Tests  3 failed | 13 passed (16)']
MUTANT [error message logged] exit=1 RED (caught) :: ['Tests  2 failed | 14 passed (16)']
MUTANT [media type passed through raw] exit=1 RED (caught) :: ['Tests  1 failed | 15 passed (16)']
MUTANT [cause code passed through raw] exit=1 RED (caught) :: ['Tests  1 failed | 15 passed (16)']
MUTANT [undici timeout treated as asleep] exit=1 RED (caught) :: ['Tests  1 failed | 15 passed (16)']
```

15 of 15 mutants turned the suite red. Script: wake-mutants.py in the session scratchpad.

Gate control: before the source-check rename, the same `scripts/gate.sh` entry point ended `GATE: FAIL` (tsc error in the new test, and review-round2.test.ts regex on `return timedOut;`), so the gate refuses a broken tree.

## Commands run (final tree)

```
npm ci                -> exit 0
npx prisma generate   -> ok
npm test              -> Tests 130 passed (130)
npm run build         -> ✓ Compiled successfully in 1517ms
worker pytest         -> 16 passed, 8 warnings in 0.30s
scripts/gate.sh       -> ---- [gate.local] all sections passed; GATE: PASS
```

## Codex read-only review (`codex exec -s read-only`, no -m)

- Round 1: VERDICT: FIX-FIRST. HIGH: body snippet could leak an encoded token. MEDIUM: any 200 JSON counted as awake; POST timeout started after building the body; 504 fixture was HTML; tests did not cover timeouts, stalled bodies, retry budget. LOW: conditional assertions, weak 200-char check. All fixed in 3b9917f.
- Round 2: VERDICT: FIX-FIRST. HIGH: a short URL-encoded token survives masking; drop upstream text from logs. MEDIUM: stalled-body fixture did not wait on the abort signal. Fixed in 08abb08.
- Round 3: VERDICT: FIX-FIRST. MEDIUM: content-type prefix, error name, cause code passed through raw (use fixed vocabularies); undici transport timeout codes were treated as asleep. Fixed in the final commit on this branch. Round 3 was the cap, so these last fixes have no Codex pass yet.

Codex's sandbox could not run vitest (temp dir denied) in any round; it read the code. The suite ran outside the sandbox (results above).

## Open

- No SHIP verdict yet: a fourth Codex round on the final commit is the remaining check before merge.
- Not exercised against the live Render worker; the asleep reply's exact body is still unknown (now logged as status, media type, length).
- Merge is his: `gh pr merge 15 --repo AuthorsWisdom/platequote`.

Reworded 2026-11-23 after the worker moved to the paid Starter plan: the `worker_waking` message now reads "The slicer was not ready. Try again in a moment.", since a paid worker can be restarting or deploying, not sleeping.
