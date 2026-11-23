#!/usr/bin/env bash
# gate.local.sh: PlateQuote-specific checks, called by scripts/gate.sh.
# Fails fast: the first failing section stops the run and exits 1.
#
# Sections, in order:
#   1. deps         npm ci --ignore-scripts (only if node_modules is missing),
#                   then prisma generate (only if the client is not generated)
#   2. typecheck    npx tsc --noEmit
#   3. lint         npm run lint
#   4. test         npm test (vitest)
#   5. build        npm run build (next build)
#   6. worker       pytest in worker/, inside a venv built from
#                   worker/requirements.txt and cached in .gate-cache/ (gitignored).
#                   If python3 is missing it prints a WARN and skips, never silently.
#   7. shell        bash -n on every tracked *.sh
#   8. json         JSON.parse on every tracked *.json
#   9. mock-lock    LLM_PROVIDER must still default to "mock" (see check_mock_lock)
#  10. sandbox-lock PayPal is sandbox only (ruled 2026-11-03): no non-sandbox
#                   PayPal API host and no live key name in src/ or render.yaml
#
# Env:  GATE_WORKER_VENV=<dir>   use this venv dir instead of .gate-cache/worker-venv
#       GATE_SKIP_BUILD=1        skip next build (local debugging only)

set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT" || exit 1

say() { printf '%s\n' "$*"; }
has() { command -v "$1" >/dev/null 2>&1; }

section() {   # section "<label>" <command...>; exits 1 on failure (fail fast)
  local label="$1"; shift
  say ""
  say "---- [gate.local] $label"
  if "$@"; then
    say "---- [gate.local] ok: $label"
  else
    say "---- [gate.local] FAILED: $label (stopping here)"
    exit 1
  fi
}

# ---------- 1. deps ----------
deps() {
  has npm || { say "npm is not installed"; return 1; }
  if [ ! -d node_modules ]; then
    say "node_modules missing: running npm ci --ignore-scripts"
    npm ci --ignore-scripts --no-audit --no-fund || return 1
  else
    say "node_modules present: skipping npm ci"
  fi
  # --ignore-scripts skips Prisma's postinstall, so generate the client if absent.
  if [ ! -f node_modules/.prisma/client/index.d.ts ]; then
    say "Prisma client not generated: running prisma generate"
    npx --no-install prisma generate || return 1
  fi
}
section "deps (npm ci if needed, prisma generate if needed)" deps

# ---------- 2-5. typecheck, lint, test, build ----------
section "typecheck (npx tsc --noEmit)" npx --no-install tsc --noEmit
section "lint (npm run lint)" npm run --silent lint
section "test (npm test)" npm test --silent
if [ "${GATE_SKIP_BUILD:-0}" = "1" ]; then
  say ""
  say "---- [gate.local] WARN: build SKIPPED (GATE_SKIP_BUILD=1)"
else
  section "build (npm run build)" npm run --silent build
fi

# ---------- 6. worker pytest ----------
worker_tests() {
  local venv="${GATE_WORKER_VENV:-$ROOT/.gate-cache/worker-venv}"
  local req="$ROOT/worker/requirements.txt"
  local stamp="$venv/.requirements.sha256"
  local want
  want="$(python3 -c 'import hashlib,sys; print(hashlib.sha256(open(sys.argv[1],"rb").read()).hexdigest())' "$req")" || return 1
  if [ ! -x "$venv/bin/pytest" ] || [ "$(cat "$stamp" 2>/dev/null)" != "$want" ]; then
    say "building worker venv at $venv from worker/requirements.txt"
    rm -rf "$venv"
    python3 -m venv "$venv" || return 1
    "$venv/bin/pip" install --quiet --disable-pip-version-check -r "$req" || return 1
    printf '%s\n' "$want" > "$stamp"
  else
    say "using cached worker venv at $venv"
  fi
  (cd "$ROOT/worker" && "$venv/bin/pytest" -q -p no:cacheprovider)
}
if has python3 && python3 -c 'import venv, ensurepip' >/dev/null 2>&1; then
  section "worker pytest (venv from worker/requirements.txt)" worker_tests
else
  say ""
  say "---- [gate.local] WARN: worker pytest SKIPPED: python3 (with venv/ensurepip) is not available."
  say "---- [gate.local] WARN: the slicer worker's tests did NOT run. Install python3 to cover them."
fi

# ---------- 7. shell syntax ----------
shell_syntax() {
  local f bad=0 n=0
  while IFS= read -r f; do
    [ -f "$f" ] || continue
    n=$((n + 1))
    if bash -n "$f"; then say "  $f: ok"; else say "  $f: syntax error"; bad=1; fi
  done <<EOF_SH
$(git ls-files --cached --others --exclude-standard -- '*.sh')
EOF_SH
  say "  checked $n shell script(s)"
  [ "$bad" -eq 0 ]
}
section "shell syntax (bash -n)" shell_syntax

# ---------- 8. JSON parse ----------
json_parse() {
  git ls-files --cached --others --exclude-standard -z -- '*.json' | node -e '
    const fs = require("fs");
    const files = fs.readFileSync(0, "utf8").split("\0").filter(Boolean);
    let bad = 0;
    for (const f of files) {
      try { JSON.parse(fs.readFileSync(f, "utf8")); console.log("  " + f + ": ok"); }
      catch (e) { bad++; console.log("  " + f + ": " + e.message); }
    }
    console.log("  checked " + files.length + " JSON file(s)");
    process.exit(bad ? 1 : 0);
  '
}
section "json parse" json_parse

# ---------- 9. mock lock ----------
# The default comes from providerName() in src/lib/ai/review.ts:
#   const raw = (process.env.LLM_PROVIDER || "mock").trim().toLowerCase();
#   if (raw === "openai" || raw === "anthropic" || raw === "mock") return raw;
#   return "mock";
# i.e. unset/empty -> "mock", unknown value -> "mock". The deploy configs also
# pin it: render.yaml (value: mock), docker-compose.yml (${LLM_PROVIDER:-mock})
# and .env.example (LLM_PROVIDER=mock). Any of these changing fails the gate.
check_mock_lock() {
  node -e '
    const fs = require("fs");
    const read = (f) => { try { return fs.readFileSync(f, "utf8"); } catch { return null; } };
    const fails = [];
    const src = read("src/lib/ai/review.ts");
    if (src === null) {
      fails.push("src/lib/ai/review.ts is missing (providerName moved? update this guard)");
    } else {
      const m = src.match(/function providerName\([^)]*\)[^{]*\{([\s\S]*?)\n\}/);
      if (!m) {
        fails.push("providerName() not found in src/lib/ai/review.ts");
      } else {
        const body = m[1];
        if (!/process\.env\.LLM_PROVIDER\s*(\|\||\?\?)\s*["\x27]mock["\x27]/.test(body))
          fails.push("providerName(): unset LLM_PROVIDER no longer defaults to \"mock\"");
        const returns = [...body.matchAll(/return\s+([^;]+);/g)].map((r) => r[1].trim());
        if (returns.length === 0 || !/^["\x27]mock["\x27]$/.test(returns[returns.length - 1]))
          fails.push("providerName(): unknown values no longer fall back to \"mock\"");
      }
    }
    const pins = [
      ["render.yaml", /-\s*key:\s*LLM_PROVIDER\s*\n\s*value:\s*["\x27]?mock["\x27]?\s*(\n|$)/],
      ["docker-compose.yml", /LLM_PROVIDER:\s*\$\{LLM_PROVIDER:-mock\}/],
      [".env.example", /^LLM_PROVIDER=mock\s*$/m],
    ];
    for (const [f, re] of pins) {
      const t = read(f);
      if (t === null) fails.push(f + " is missing");
      else if (!re.test(t)) fails.push(f + ": LLM_PROVIDER default is no longer mock");
    }
    if (fails.length) { for (const f of fails) console.log("  " + f); process.exit(1); }
    console.log("  LLM_PROVIDER defaults to mock in review.ts, render.yaml, docker-compose.yml, .env.example");
  '
}
section "mock lock (LLM_PROVIDER default is mock)" check_mock_lock

# ---------- 10. PayPal sandbox lock ----------
# RULED 2026-11-03 (Christopher): PayPal sandbox only. Fails if the live REST
# host (api-m DOT paypal DOT com, i.e. not api-m.sandbox) or any live key name
# (PAYPAL_ + LIVE...) appears in tracked files under src/ or in render.yaml,
# or if paypal-env.ts no longer names the sandbox API host.
check_sandbox_lock() {
  local hits pat
  pat='api-m''\.paypal\.com|PAYPAL''_LIVE'
  hits="$(git ls-files -z -- src render.yaml | xargs -0 grep -nE "$pat" 2>/dev/null || true)"
  if [ -n "$hits" ]; then
    say "  live PayPal reference(s) found (sandbox only, ruled 2026-11-03):"
    printf '%s\n' "$hits" | cut -c1-200 | sed 's/^/    /'
    return 1
  fi
  grep -q 'https://api-m.sandbox.paypal.com' src/lib/paypal-env.ts \
    || { say "  src/lib/paypal-env.ts no longer names https://api-m.sandbox.paypal.com"; return 1; }
  say "  sandbox only: no live PayPal host or key in src/ or render.yaml"
}
section "PayPal sandbox lock (no live host or keys)" check_sandbox_lock

say ""
say "---- [gate.local] all sections passed"
exit 0
