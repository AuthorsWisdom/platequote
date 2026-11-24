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

## Codex round 5 (read-only on 6709c17): VERDICT: FIX-FIRST

Codex: "Both round 4 fixes work on the paths they target." Remaining findings, verbatim in substance:

- MEDIUM, quote-service.ts:264/285/296: "A connection reset after the upload, a gateway 504, or a 2xx with a readable but invalid JSON body can trigger a second slice. The first job may already have run." It asks to retry only on a response known to indicate a cold start.
- LOW, quote-service.ts:275/332: the redirect return and the non-200 health path leave response bodies unread; cancel them.
- Pre-existing (not verdict-setting): HIGH, route.ts:20 and quote-service.ts:527, route deadline does not bound multipart parsing and final DB writes.

### Disposition

- MEDIUM, not changed (design scope). The worker's POST /slice is stateless: `worker/server.py` and `worker/slice_job.py` write only into a `tempfile.TemporaryDirectory` and return computed numbers, with no database or outbound call. A duplicate slice therefore costs worker CPU inside the same budget, never a duplicate record, and the retry stays capped at one. The sleeping reply has no known signature (the outage doc never captured its status or body; that is why the log now records status, media type and length), so "retry only on a known cold-start response" cannot be written yet without dropping the fix this PR exists for. Asked Codex in round 6 to judge with that fact on the table.
- LOW, fixed. `discardBody` cancels the body of a reply that will not be read: the redirect return, the 401 return, and every non-200 /health probe. New test "replies that are not read (redirect, 401, non-200 health) have their bodies released" (checks `bodyUsed` on each); 4 new mutants below.

## Round 6 tree: must-fail controls

```
MUTANT [no retry after wake] exit=1 RED (caught) :: ['Tests  8 failed | 12 passed (20)']
MUTANT [second retry allowed] exit=1 RED (caught) :: ['Tests  1 failed | 19 passed (20)']
MUTANT [retry real errors] exit=1 RED (caught) :: ['Tests  10 failed | 10 passed (20)']
MUTANT [503 always token (old mapping)] exit=1 RED (caught) :: ['Tests  12 failed | 8 passed (20)']
MUTANT [504 JSON not treated as asleep] exit=1 RED (caught) :: ['Tests  1 failed | 19 passed (20)']
MUTANT [timeout treated as asleep] exit=1 RED (caught) :: ['Tests  1 failed | 19 passed (20)']
MUTANT [stalled body treated as asleep] exit=1 RED (caught) :: ['Tests  2 failed | 18 passed (20)']
MUTANT [wake ignores budget] exit=1 RED (caught) :: ['Tests  1 failed | 19 passed (20)']
MUTANT [retry gets the full budget again] exit=1 RED (caught) :: ['Tests  1 failed | 19 passed (20)']
MUTANT [any 200 JSON counts as awake] exit=1 RED (caught) :: ['Tests  1 failed | 19 passed (20)']
MUTANT [body text logged] exit=1 RED (caught) :: ['Tests  3 failed | 17 passed (20)']
MUTANT [error message logged] exit=1 RED (caught) :: ['Tests  2 failed | 18 passed (20)']
MUTANT [media type passed through raw] exit=1 RED (caught) :: ['Tests  1 failed | 19 passed (20)']
MUTANT [cause code passed through raw] exit=1 RED (caught) :: ['Tests  1 failed | 19 passed (20)']
MUTANT [undici timeout treated as asleep] exit=1 RED (caught) :: ['Tests  2 failed | 18 passed (20)']
MUTANT [R5 POST follows redirects] exit=1 RED (caught) :: ['Tests  1 failed | 19 passed (20)']
MUTANT [R5 health follows redirects] exit=1 RED (caught) :: ['Tests  1 failed | 19 passed (20)']
MUTANT [R5 redirect treated as asleep] exit=1 RED (caught) :: ['Tests  2 failed | 18 passed (20)']
MUTANT [R5 body phase skips undici timeout codes] exit=1 RED (caught) :: ['Tests  1 failed | 19 passed (20)']
MUTANT [R6 redirect body not released] exit=1 RED (caught) :: ['Tests  1 failed | 19 passed (20)']
MUTANT [R6 401 body not released] exit=1 RED (caught) :: ['Tests  1 failed | 19 passed (20)']
MUTANT [R6 health body not released] exit=1 RED (caught) :: ['Tests  1 failed | 19 passed (20)']
MUTANT [R6 discard is a no-op] exit=1 RED (caught) :: ['Tests  1 failed | 19 passed (20)']
MUTANT [R5 failed 2xx body read resubmits] exit=1 RED (caught) :: ['Tests  1 failed | 19 passed (20)']
```

24 of 24 mutants turned the suite red (20 cases). Script: wake-mutants-r6.py in the session scratchpad.

## Commands run (round 6 tree)

```
npm test         -> Tests 134 passed (134)
npm run build    -> exit 0; Compiled successfully in 1559ms
scripts/gate.sh  -> ok: worker pytest; [gate.local] all sections passed; GATE: PASS
```

## Codex round 6 (read-only on edc879d): VERDICT: SHIP

- Round 5 LOW closed: "The redirect and 401 returns and each non-200 health probe cancel their response bodies. The new test covers all three paths."
- Round 5 MEDIUM accepted: "I verified that the worker uses temporary files and a local subprocess, with no database writes or outbound service calls in the slice path. A replay can spend extra worker CPU but cannot create a second quote or order." and "I judge the bounded replay acceptable." It notes the worker subprocess has its own timeout and can outlive the web request.
- LOW (left as is so the reviewed head stays the shipped head): the `SliceAttempt` comment at quote-service.ts:189 says `asleep` proves the request never reached the worker; it only marks the failure as eligible for a wake check and one retry.
- Pre-existing (not verdict-setting): the route-deadline HIGH, route.ts:20 and quote-service.ts:542.
- Codex ran `git diff --check` (passed); its sandbox could not run vitest, so the test and mutant results above are from the Studio runs.

Code head reviewed: edc879d. This commit changes only this document.

## Open

- Pre-existing HIGH (rounds 4 and 5): route-level deadline does not bound multipart parsing or the final DB writes. Out of scope for this PR; a separate change.
- Merge is his: `gh pr merge 15 --repo AuthorsWisdom/platequote`.
