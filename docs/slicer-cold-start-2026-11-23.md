# Slicer cold start, 2026-11-23 about 20:02 CST (02:02 UTC Nov 24)

Read-only pass over the Render dashboard (Events and Logs for platequote-worker srv-dbh6l2flk1mc73fdnpdg and platequote-web srv-dbh6lcvlk1mc73fdojrg), read 20:11 CST from the Studio. All times below are CST as Render's dashboard displays them. Wake code read from `origin/main:src/lib/quote-service.ts` (c1d146a).

## Verdict

The old worker instance never woke. Render's edge answered the web's first POST /slice with HTTP 429 at 20:02:43, no worker process started for the next 79 s, and the only instance that came up was the new one built by the 1bf3926 auto-deploy (build started 20:03:58, uvicorn up 20:04:09, "service is live" 20:04:14). None of the web's /health polls reached the app before the web gave up at 20:04:18. First incoming request to the app serving: 20:02:43 to 20:04:09 (86 s) for uvicorn up, 20:04:14 (91 s) for Render's "live", so about 4 s before the web's poll deadline, and no web poll landed in that gap.

## Timeline (quoted lines)

Worker, old instance `fzzpc` (from the c1d146a deploy, live 7:36 PM). Last log line before the gap:

    07:51:27 PM [fzzpc] 10.238.26.105:57090 - "GET /health HTTP/1.1" 200 OK

Then nothing in the worker's application log from 07:51:27 PM to 08:04:02 PM (window 01:51:00 to 02:04:05 UTC read in full: 8 lines, the six above-pattern health checks ending 07:51:27, then the two deploy lines below). So the instance spun down about 15 minutes after the 19:36 quote, and no "Started server process" line appears for the 20:02:43 request.

Web, instance `vqkfx` (the c1d146a web, live 7:38:10 PM; the 1bf3926 web did not go live until 8:06:29 PM, so the old web instance served the whole window):

    08:02:43 PM [vqkfx] [slicer] POST /slice status 429, unexpected reply: content-type text/plain, 18 chars, not JSON
    08:04:18 PM [vqkfx] [slicer] worker did not wake inside the quote budget (109687 ms)

Worker events:

    Deploy started for 1bf3926 ... New commit via Auto-Deploy   November 23, 2026 at 8:03 PM
    Deploy live for 1bf3926 ...                                  November 23, 2026 at 8:04 PM

Worker deploy page for dep-dc2f12mq1p3s73dbhc10: "DEPLOYED Nov 23, 2026 at 8:03:54 PM CST", "DURATION 19.8s". Build and start lines:

    08:03:58 PM ==> Cloning from https://github.com/AuthorsWisdom/platequote
    08:03:59 PM ==> Checking out commit 1bf3926795970a2ba4fab8cad0d2ee346d23260f in branch main
    08:04:00 PM #12 [6/7] RUN pip install --no-cache-dir -r /app/requirements.txt
    08:04:00 PM #12 CACHED
    08:04:02 PM ==> Deploying...
    08:04:09 PM [v6mvs] INFO:     Started server process [7]
    08:04:09 PM [v6mvs] INFO:     Application startup complete.
    08:04:09 PM [v6mvs] INFO:     Uvicorn running on http://0.0.0.0:10000 (Press CTRL+C to quit)
    08:04:12 PM [v6mvs] INFO:     10.238.25.189:54442 - "GET /health HTTP/1.1" 200 OK
    08:04:13 PM [v6mvs] INFO:     10.238.25.189:54444 - "GET /health HTTP/1.1" 200 OK
    08:04:14 PM [v6mvs] INFO:     10.30.120.209:0 - "GET / HTTP/1.1" 404 Not Found
    08:04:14 PM ==> Your service is live 🎉

Lines from `10.238.x.x` with a real port are Render's own internal health check (they run every 5 s on every instance all evening). Lines with port `:0` come through Render's proxy from outside. Between 08:04:09 and the web's 08:04:18 give-up, the only proxied request the app saw was `GET /` at 08:04:14. No proxied `GET /health` reached the app in that window.

The follow-up (the quote that succeeded):

    08:04:28 PM [v6mvs] INFO:     10.26.226.19:0 - "GET /health HTTP/1.1" 200 OK
    08:04:29 PM [vqkfx] [slicer] POST /slice status 429, unexpected reply: content-type text/html, 6513 chars, not JSON
    08:04:46 PM [v6mvs] INFO:     10.30.120.209:0 - "GET /health HTTP/1.1" 200 OK
    08:04:49 PM [v6mvs] INFO:     10.26.226.19:0 - "POST /slice HTTP/1.1" 200 OK

So even with the new instance live and answering a proxied /health at 08:04:28, Render's edge returned 429 (HTML this time) to the web's POST at 08:04:29, and about 17 s of 2 s polls passed before one /health reached the app at 08:04:46; the retried POST then succeeded.

Reference wake that worked (18:31): the worker logged a fresh instance at once:

    06:31:11 PM [rzlw9] Started server process [7]
    06:31:16 PM [rzlw9] 10.26.226.19:0 - "GET /health HTTP/1.1" 200 OK

## Candidates checked

- Slow free-plan cold start (image pull, container start): ruled out as the cause. No start of the old instance was logged at all; the one container that did start took 11 s from "Deploying..." (08:04:02) to uvicorn up (08:04:09 plus Render's live at 08:04:14), with every build layer CACHED.
- Wake collided with a deploy: partly. The 1bf3926 worker deploy began at 8:03 PM (clone 08:03:58), about 75 s after the first POST, so it did not cause the 429 at 08:02:43. It is what finally produced a running instance, at 08:04:09. [Inference] Whether the deploy pre-empted a pending spin-up of `fzzpc` cannot be read from these logs.
- Web requests not reaching the worker: confirmed. The first POST got 429 from Render, not a redirect; no `redirect refused` line was logged, so `redirect: "manual"` did not fire. The polls also did not reach the app (no proxied /health lines before 08:04:28).
- Worker health check slow: ruled out. Every /health the app logged returned 200, and the internal checks ran on their normal 5 s cadence from 08:04:12.

## What the logs do not show

- What each /health poll received. `waitForWorker` logs nothing per poll (catch and non-200 branches are silent), so the status codes Render returned to the polls between 08:02:43 and 08:04:18 are not recorded anywhere.
- Why Render answered 429. [Inference] It came from Render's edge, not the app: the app logged no POST /slice at 08:02:43 or 08:04:29, and the bodies (18 chars text/plain, then 6513 chars text/html) are not the worker's JSON. [Speculation] 18 chars fits "Too Many Requests" plus a newline; the body text is deliberately not logged, so this is unconfirmed.
- Why the suspended `fzzpc` instance did not start on the 08:02:43 request. Render's Events list shows only deploys; it has no spin-down or spin-up events for this service.
- The 19:36 quote ran on the old web code (web c1d146a went live at 7:38:10 PM), so 20:02:43 was the first time the new wake path met a sleeping worker in production.
