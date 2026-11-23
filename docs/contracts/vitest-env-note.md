# Contract: vitest-env-note

Branch `agent/vitest-env-note`, based on `agent/paypal-sandbox-lock` (fd7904d).

## Must hold
- vitest goes from ^3.2.7 to ^4.1.12 (dev-only). That drops tinypool from the tree and
  clears both critical `npm audit` advisories (vitest <=4.1.10, tinypool <=2.1.1).
  `next` (15.5.28) and `prisma` / `@prisma/client` (^6.19.3) majors are unchanged.
  The highs that remain (prisma, @prisma/config, deepmerge-ts, postcss via next) need
  those majors and are out of scope.
- npm audit, before: 27 total (2 critical, 4 high, 19 moderate, 2 low).
  After: 24 total (0 critical, 4 high, 18 moderate, 2 low).
- All existing vitest tests pass unchanged under vitest 4; vitest.config.ts is unchanged.
- `.env.example`, README and the admin-session.ts comment say the truth: the dev admin
  password and session secret are refused whenever NODE_ENV=production (which includes
  `next start` and docker compose, whose web image sets NODE_ENV=production) and on Render.
  They give the way to set real local values (8+ char password, 16+ char secret in `.env`).
- No runtime code change.
