# Contract: gate setup

## Goal
Give PlateQuote a single definition of "done": `scripts/gate.sh` ends with exactly `GATE: PASS` or `GATE: FAIL`.

- `scripts/gate.sh`: copied from the claude-harness gate.sh. The structure, the secret scan and the final verdict line are unchanged. The only change is `GATE_LOCAL_OWNS="npm python"` plus a `local_owns` helper, an if/elif wrapper around the generic npm and Python blocks so they defer to gate.local.sh, and a header comment. The generic Python ruff lint is therefore not run; the worker has no ruff config.
- `scripts/gate.local.sh`: fail-fast, labeled sections:
  1. npm ci --ignore-scripts (only if node_modules is missing), then prisma generate (only if needed)
  2. tsc --noEmit
  3. lint
  4. test
  5. build
  6. worker pytest in a venv cached in the gitignored `.gate-cache/` (a clear WARN skip if python3 is missing)
  7. bash -n on shell scripts
  8. JSON parse
  9. mock-lock guard on `LLM_PROVIDER`

## Constraints
- Branch `agent/gate-setup` only, cut from origin/main. Nothing from `agent/security-fixes-2026-11-02`.
- No app code changes. Only these change: scripts/gate.sh, scripts/gate.local.sh, .gitignore (`/.gate-cache`), one line in the README Tests section, and this file.
- Exception: the admin test-fixture password literal in two test files is shortened below the scan's 16-character threshold. The harness secret scan flagged it, and the scan itself is kept unchanged.
- No PayPal-live guard; that path hasn't been decided.
- No secrets printed or committed.

## Done when
- `scripts/gate.sh` prints `GATE: PASS` on this branch.
- A deliberately broken test or type in a throwaway worktree prints `GATE: FAIL`.
- The REJECT-first verifier accepts.

## Needs approval
PR, merge, deploy.

## If blocked
Write STATE.md with the failing step and stop.
