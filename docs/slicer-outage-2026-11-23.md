# Slicer outage 2026-11-23 (18:30 to 18:31 local)

Investigated 18:3x CST on the Studio (Render dashboard in Chrome, curl from the Studio).
No restart, no env, settings, code, deploy, commit, or push.

## Root cause

The worker (`platequote-worker`, srv-dbh6l2flk1mc73fdnpdg, free plan) was spun down when
the failing quotes arrived. Render answered the web service's `POST /slice` without the
request ever reaching uvicorn, with a body that was not JSON, so `sliceUpload` in
`src/lib/quote-service.ts` fell into the `response.json()` catch ("The slicing worker
returned something that was not JSON.").

Evidence (Render logs, times local):

- Worker deploy of ed7b3f8 (PR #14 auto-deploy, same worker code) went live 18:10 PM on a new
  instance `gj7sv`. Its last log line is a platform health check:
  `06:25:26 PM [gj7sv] INFO: 10.238.25.189:33178 - "GET /health HTTP/1.1" 200 OK`
  then nothing until a new instance boots:
  `06:31:40 PM [rzlw9] INFO: 10.238.24.37:60970 - "GET /health HTTP/1.1" 200 OK`
  (15 idle minutes after the 18:10 deploy, then spin-down.)
- Web request log, the six failing quotes, all fast and all before `rzlw9` was up:
  `06:30:38 PM [POST] platequote.tech/api/quotes ... responseTimeMS=261 responseBytes=2381`
  (also 06:30:38 x2, 06:30:39, 06:31:27 x2, 06:31:37, 66 to 261 ms).
- Worker log, filtered to `slice`, last 4 hours: web slices returned 200 from 16:52 to
  `05:20:09 PM [wt9rd] INFO: 10.27.94.190:0 - "POST /slice HTTP/1.1" 200 OK`, then
  zero `/slice` lines from the web until the 18:31:43 manual 401 probes. The failing quotes
  never reached the FastAPI app (a worker 500 would have logged a line).
- No web change in the slicer path: `git diff d8881a6 origin/main --stat` touches only
  docs, layout.tsx, terms page + test, quote-result.tsx, paypal.ts.

[Inference] The exact non-JSON body is not logged on either side (the web code does not log
status or body). Render's handling of a POST to a sleeping free service (fast non-JSON
reply instead of holding it for the cold start) is the only path consistent with the logs.
The keep-warm traffic in the web request log hits `platequote.tech/terms` every 30 s, which
keeps the web service warm but not the worker.

## Recovery

The 18:31 manual `/health` probe woke the worker. Live quote after it was up:

- 18:33:46 POST /api/quotes (samples/overhang-hook.stl, PLA, Black): id
  `cmwtyorqj000dhj43a68qnhfw`, status `quoted`, review `provider = anthropic`,
  `mocked = False`, `mockReason = None`; worker log
  `06:33:50 PM [rzlw9] INFO: 10.26.226.19:0 - "POST /slice HTTP/1.1" 200 OK`;
  web `responseTimeMS=8924`.

## Recurrence and the fix

It recurs 15 minutes after the last worker request (next window: about 18:49 if idle).

Fix step (no code change): have the keep-warm pinger also `GET
https://platequote-worker.onrender.com/health` at least every 10 minutes during judging.

Durable code fix (not applied): in `sliceUpload`, when `response.json()` fails or the status
is 502/504, `await fetch(workerBaseUrl() + "/health", { signal: AbortSignal.timeout(60000) })`
and retry the `/slice` POST once inside the remaining `timeoutMs`; also log
`response.status` and the first 200 bytes of the body so the next outage names itself.
