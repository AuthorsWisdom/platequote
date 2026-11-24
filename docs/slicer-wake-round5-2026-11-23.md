# Slicer wake round 5 (2026-11-23)

Branch `fix/slicer-wake-retry`, PR https://github.com/AuthorsWisdom/platequote/pull/15 (open, not merged). Built and checked on the Studio in the worktree `~/projects/platequote-wake`. Design and rounds 1 to 3: `docs/slicer-wake-retry-2026-11-23.md`.

## Round 4 (Codex read-only on c720226): VERDICT: FIX-FIRST

- HIGH, route.ts:20 and quote-service.ts:499: multipart parsing and the final quote update, order creation and reload have no deadline, so the route can exceed 115 s. Codex: "This predates the wake change." Pre-existing and out of scope for this PR; not fixed here (live during hackathon judging, smallest safe edits only). Recorded as an open item below.
- MEDIUM, quote-service.ts:235: fetch follows redirects by default, so a 307/308 can replay the POST with X-Worker-Token at the redirect target.
- MEDIUM, quote-service.ts:256: the body-read catch skipped the undici timeout-code check, so a body read rejecting with cause.code UND_ERR_BODY_TIMEOUT was treated as asleep and could resubmit.

## Round 5 fixes (src/lib/quote-service.ts)

- Worker POST and the /health poll both pass `redirect: "manual"`. A redirect reply to the POST (status 3xx or type opaqueredirect) is final: no retry, `worker_bad_response` with "The slicing worker answered with a redirect, which this host refuses. Check SLICER_WORKER_URL.", and a fixed-label log line (`redirect refused, not retried`, status only; the Location header is never logged). A redirecting /health is simply not awake.
- One `isTimeout` check (abort, TimeoutError, or an undici timeout cause code) now classifies both the connect phase and the body-read phase. A failed body read after a 2xx reply is final (the worker took the job), never resubmitted.

## Tests (src/lib/slicer-wake.test.ts, now 19 cases)

New: 307 and 308 are final with one POST, and every POST and /health call carries `redirect: "manual"`; a body read failing with UND_ERR_BODY_TIMEOUT is not retried (both a 200 and a 503 reply); a 2xx whose body read fails with a non-timeout error is final.

### Must-fail controls (each mutant applied, suite run, source restored)

```
MUTANT [no retry after wake] exit=1 RED (caught) :: ['Tests  8 failed | 11 passed (19)']
MUTANT [second retry allowed] exit=1 RED (caught) :: ['Tests  1 failed | 18 passed (19)']
MUTANT [retry real errors] exit=1 RED (caught) :: ['Tests  9 failed | 10 passed (19)']
MUTANT [503 always token (old mapping)] exit=1 RED (caught) :: ['Tests  11 failed | 8 passed (19)']
MUTANT [504 JSON not treated as asleep] exit=1 RED (caught) :: ['Tests  1 failed | 18 passed (19)']
MUTANT [timeout treated as asleep] exit=1 RED (caught) :: ['Tests  1 failed | 18 passed (19)']
MUTANT [stalled body treated as asleep] exit=1 RED (caught) :: ['Tests  2 failed | 17 passed (19)']
MUTANT [wake ignores budget] exit=1 RED (caught) :: ['Tests  1 failed | 18 passed (19)']
MUTANT [retry gets the full budget again] exit=1 RED (caught) :: ['Tests  1 failed | 18 passed (19)']
MUTANT [any 200 JSON counts as awake] exit=1 RED (caught) :: ['Tests  1 failed | 18 passed (19)']
MUTANT [body text logged] exit=1 RED (caught) :: ['Tests  3 failed | 16 passed (19)']
MUTANT [error message logged] exit=1 RED (caught) :: ['Tests  2 failed | 17 passed (19)']
MUTANT [media type passed through raw] exit=1 RED (caught) :: ['Tests  1 failed | 18 passed (19)']
MUTANT [cause code passed through raw] exit=1 RED (caught) :: ['Tests  1 failed | 18 passed (19)']
MUTANT [undici timeout treated as asleep] exit=1 RED (caught) :: ['Tests  2 failed | 17 passed (19)']
MUTANT [R5 POST follows redirects] exit=1 RED (caught) :: ['Tests  1 failed | 18 passed (19)']
MUTANT [R5 health follows redirects] exit=1 RED (caught) :: ['Tests  1 failed | 18 passed (19)']
MUTANT [R5 redirect treated as asleep] exit=1 RED (caught) :: ['Tests  1 failed | 18 passed (19)']
MUTANT [R5 body phase skips undici timeout codes] exit=1 RED (caught) :: ['Tests  1 failed | 18 passed (19)']
MUTANT [R5 failed 2xx body read resubmits] exit=1 RED (caught) :: ['Tests  1 failed | 18 passed (19)']
```

20 of 20 mutants turned the suite red (the 15 earlier mutants, three re-pointed at the refactored lines, plus 5 for round 5). Script: wake-mutants-r5.py in the session scratchpad.

## Commands run (round 5 tree)

```
npm test         -> Test Files 21 passed (21); Tests 133 passed (133)
npm run build    -> exit 0; Compiled successfully in 1889ms
scripts/gate.sh  -> worker pytest 16 passed; [gate.local] all sections passed; GATE: PASS
```

## Codex rounds 5 and 6

Pending at commit time; results are added in the next commit on this branch.

## Open

- Pre-existing HIGH (round 4): route-level deadline does not bound multipart parsing or the final DB writes. Out of scope for this PR; a separate change.
- Merge is his: `gh pr merge 15 --repo AuthorsWisdom/platequote`.
