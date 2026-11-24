# Devpost fixes for PlateQuote, 2026-11-23

Project page: https://devpost.com/software/platequote (read 17:19 CST via Chrome, Studio).

## Status: NOT FILLED. Devpost is signed out in the Chrome session.

`https://devpost.com/software/platequote/edit` redirected to the Devpost sign-up page
(`secure.devpost.com/users/register?return_to=...`). Per the brief, editing stopped there.
Nothing was typed, uploaded, or saved on Devpost. Chrome tab 1850078562 is left on the Devpost
login page with `return_to` set to the project's edit page.

## Are edits allowed during judging?

Official rules (https://paypalaihackathon.devpost.com/rules, read 17:21 CST), section on submissions:

> "Once the Submission Period has ended, you may not make any changes or alterations to your
> Submission, but you may continue to update the Project in your Devpost portfolio."

Submission Period ended Nov 12, 2026 12:00 pm PT. Judging Period: Nov 23 2:00 pm PT to Dec 15 8:00 am PT.
"Modifications After the Submission Period" allows changes only for infringing, PII, or otherwise
inappropriate material, and only with Sponsor and Devpost permission.

[Inference] On Devpost the portfolio project page and the gallery entry are the same page, so a
portfolio edit is likely visible to judges; the rules text treats the "Submission" as frozen. Whether
Devpost's edit form itself still accepts changes could not be checked (signed out).

## Changes ready to paste (old -> new)

All in the "How we built it" section, the "AI:" line. Everything else keeps his wording.

1. `the Anthropic Messages API path defaults to claude-sonnet-4-5`
   -> `the Anthropic Messages API path defaults to claude-haiku-5-5`
   (repo `src/lib/ai/review.ts:154` sets `ANTHROPIC_DEFAULT_MODEL = "claude-haiku-5-5"`; `render.yaml` sets `LLM_PROVIDER: anthropic`.)

2. `The hosted demo currently runs that built-in reviewer.`
   -> `On the hosted demo, Claude Haiku 5.5 reviews each quote live through the Anthropic API; the quote page labels it "AI review · Claude".`

Full corrected "AI:" line:

> AI: a provider switch (LLM_PROVIDER). The OpenAI-compatible path defaults to gpt-4o-mini and the Anthropic Messages API path defaults to claude-haiku-5-5; LLM_MODEL overrides either. Output is schema-validated. With no key, or if the provider fails, a built-in rule-based reviewer writes the notes from the same facts, so quotes never break. On the hosted demo, Claude Haiku 5.5 reviews each quote live through the Anthropic API; the quote page labels it "AI review · Claude".

No other line says the AI is mocked. "It runs with zero keys: quotes, slicing and the review all work" stays true (fallback) and is left as is.

3. Built with: current tags `cursor docker fastapi nextjs paypal postgresql prisma prusaslicer python react render tailwindcss three.js typescript`
   -> add `claude`, `anthropic`, `claude-haiku`.

4. Gallery: 0 images -> the three below. Thumbnail: placeholder -> `02-quote-estimate-ai-review.png`.

## Gallery images (1500x1000 PNG, 3:2, captured 17:20 CST from live https://platequote.tech with headless Chrome)

| File | Shows | sha256 |
|---|---|---|
| /Users/sevenswords/projects/platequote/docs/devpost-media/01-landing.png | Landing: "A price from the slicer, not a guess.", job options | 8dc29a6839e94fc43fe3ca056c0c54892681abf3e27c08ccb2ab72e0366871f1 |
| /Users/sevenswords/projects/platequote/docs/devpost-media/02-quote-estimate-ai-review.png | Quote for overhang-hook.stl: 3D preview, $8.00 estimate with filament/machine/minimum breakdown, print stats, "AI review · Claude" badge (THUMBNAIL) | 1564415bfdfc7ec8df8b32d2f73dbcd9459764de6fa9b0a3a3bbb847d508182c |
| /Users/sevenswords/projects/platequote/docs/devpost-media/03-ai-review-claude-and-paypal-checkout.png | Print notes "AI review · Claude", material advice per material, Checkout with PayPal button and sandbox notice | 2bafd2ed72f40f364bb26206f948bfc710b283ece24f4fa195401b36a6d37d1c |

Quote used: https://platequote.tech/q/cmwtvwvvu0015j542tufdkatx (existing live quote). The PayPal sandbox
popup itself was not captured (it opens a separate window); image 03 stops at the checkout button.
Each PNG was viewed before listing. A fourth crop (checkout alone, mostly empty) was dropped.

## Fill pass (2026-11-23, Studio, Chrome tab 1850078562)

Signed in; https://devpost.com/software/platequote/edit loaded as one page with a single "Save" button at the bottom (no multi-step flow). Nothing saved; every change below is typed/uploaded into the open form and waits for the owner's Save click.

| Field | Status | What the page showed after the fill |
|---|---|---|
| About > How we built it > AI line, model | FILLED | "Messages API path defaults to `claude-haiku-5-5`; `LLM_MODEL` overrides either." |
| About > AI line, hosted-demo sentence | FILLED | "On the hosted demo, Claude Haiku 5.5 reviews each quote live through the Anthropic API; the quote page labels it "AI review · Claude"." |
| About > Challenges > Free-tier hosting (/tmp line) | FILLED | Was "so uploads live in `/tmp` and the slicer runs as its own service." Now "so uploaded meshes are stored in Postgres (`QuoteFile`), `/tmp` is only a cache, and the slicer runs as its own service." (wording from README.md line 134). No other `/tmp` mention seen in the text. |
| Built with | FILLED | 14 original tags kept, plus `claude`, `anthropic`, `claude-haiku` (each picked from Devpost's autocomplete) |
| Image gallery | FILLED | three rows: 01-landing, 02-quote-estimate-ai-review, 03-ai-review-claude-and-paypal-checkout; captions empty |
| Thumbnail (separate field) | FILLED | preview now shows 02-quote-estimate-ai-review (3D part + $8.00 estimate) above "PlateQuote" |
| Video link, "Try it out" links, name, pitch | NOT TOUCHED | Try it out still shows https://platequote.tech and the GitHub repo link |

Edits were made by clicking and typing in the field (word selection + keystrokes); no JavaScript value sets. Screenshots were permission-denied on devpost.com for the first call, then worked; each part was checked with a zoomed capture.
Owner's one click: the blue "Save" button at the bottom of the edit form in that tab.
