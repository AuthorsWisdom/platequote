#!/usr/bin/env bash
# gate.sh: the only definition of "done".
# Auto-detects the project type and runs its real checks. The LAST line of
# output is always exactly "GATE: PASS" or "GATE: FAIL" (exit 0 / exit 1).
#
# Detects:  npm (typecheck / tsc, lint / eslint, test)
#           Python (ruff, pytest)
#           Swift (Package.swift: swift build + swift test;
#                  Xcode: set GATE_XCODE_SCHEME to build a scheme)
#           Static HTML (structure sanity + inline <script> syntax via node)
# Always:   secret scan of the repo's files.
# Extend:   put project-specific checks in scripts/gate.local.sh (exit 0 = ok).
#
# PlateQuote: copied from the claude-harness gate.sh. The one change is
# GATE_LOCAL_OWNS below. scripts/gate.local.sh installs node_modules, runs
# tsc / lint / test / build in order, and runs the worker's pytest inside a
# cached venv built from worker/requirements.txt, so the generic npm and
# Python blocks here are skipped instead of running the same checks twice
# (and before dependencies exist). The secret scan and verdict are unchanged.
#
# Env:      GATE_ALLOW_MISSING=1  treat a missing tool as a skip, not a failure
#           GATE_SKIP_SECRETS=1   skip the secret scan (don't, unless debugging)
#
# Works with macOS's stock bash 3.2.

set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT" || { echo "GATE: FAIL"; exit 1; }

RAN=0
FAILED=0
FAILED_NAMES=""

say() { printf '%s\n' "$*"; }

run_check() {   # run_check "<name>" <command...>
  local name="$1"; shift
  RAN=$((RAN + 1))
  say ""
  say "== $name: $*"
  if "$@"; then
    say "-- ok: $name"
  else
    say "-- FAILED: $name"
    FAILED=$((FAILED + 1))
    FAILED_NAMES="$FAILED_NAMES
  - $name"
  fi
}

missing_tool() {   # missing_tool "<name>" "<tool>"
  if [ "${GATE_ALLOW_MISSING:-0}" = "1" ]; then
    say ""
    say "== $1: SKIPPED ($2 not installed, GATE_ALLOW_MISSING=1)"
  else
    RAN=$((RAN + 1))
    FAILED=$((FAILED + 1))
    FAILED_NAMES="$FAILED_NAMES
  - $1 ($2 not installed; install it or set GATE_ALLOW_MISSING=1)"
    say ""
    say "== $1: FAILED ($2 not installed)"
  fi
}

has() { command -v "$1" >/dev/null 2>&1; }

# Generic blocks that scripts/gate.local.sh runs itself (space separated).
GATE_LOCAL_OWNS="npm python"
local_owns() {   # local_owns <block>; true when gate.local.sh owns that block
  [ -f scripts/gate.local.sh ] || return 1
  case " $GATE_LOCAL_OWNS " in *" $1 "*) return 0 ;; esac
  return 1
}

# Files to inspect: git-tracked + untracked-not-ignored if in a repo, else a find.
list_files() {
  if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    git ls-files --cached --others --exclude-standard
  else
    find . -type f \
      -not -path './.git/*' -not -path '*/node_modules/*' -not -path './.venv/*' \
      -not -path '*/venv/*' -not -path './.build/*' -not -path '*/DerivedData/*' \
      -not -path './dist/*' -not -path './build/*' | sed 's|^\./||'
  fi
}

npm_has_script() {   # npm_has_script <name>; ignores npm's placeholder test script
  has node || return 1
  node -e '
    const s = (require("./package.json").scripts || {})[process.argv[1]];
    if (!s || /no test specified/.test(s)) process.exit(1);
  ' "$1" 2>/dev/null
}

say "gate.sh in $ROOT"

# ---------- JavaScript / TypeScript ----------
if [ -f package.json ] && local_owns npm; then
  say ""
  say "== npm checks: run by scripts/gate.local.sh (see below)"
elif [ -f package.json ]; then
  if ! has npm; then
    missing_tool "npm project" "npm"
  else
    if [ ! -d node_modules ]; then
      say ""
      say "note: node_modules missing. Run npm ci (or npm install) first."
    fi
    if npm_has_script typecheck; then
      run_check "typecheck" npm run --silent typecheck
    elif [ -f tsconfig.json ]; then
      run_check "typecheck (tsc)" npx --no-install tsc --noEmit
    fi
    if npm_has_script lint; then
      run_check "lint" npm run --silent lint
    elif ls eslint.config.* .eslintrc* >/dev/null 2>&1; then
      run_check "lint (eslint)" npx --no-install eslint .
    fi
    if npm_has_script test; then
      run_check "test" npm test --silent
    fi
  fi
fi

# ---------- Python ----------
PY_FILES="$(list_files | grep -E '\.py$' | grep -vE '(^|/)(\.venv|venv|node_modules)/' | head -n 1)"
if local_owns python; then
  say ""
  say "== python checks: run by scripts/gate.local.sh (see below)"
elif [ -f pyproject.toml ] || [ -f setup.py ] || [ -f requirements.txt ] || [ -n "$PY_FILES" ]; then
  if has ruff; then
    run_check "lint (ruff)" ruff check .
  elif [ -x .venv/bin/ruff ]; then
    run_check "lint (ruff)" .venv/bin/ruff check .
  else
    missing_tool "lint (ruff)" "ruff"
  fi
  if [ -d tests ] || list_files | grep -qE '(^|/)(test_[^/]*|[^/]*_test)\.py$'; then
    if has pytest; then
      run_check "test (pytest)" pytest -q
    elif [ -x .venv/bin/pytest ]; then
      run_check "test (pytest)" .venv/bin/pytest -q
    elif has python3 && python3 -c 'import pytest' >/dev/null 2>&1; then
      run_check "test (pytest)" python3 -m pytest -q
    else
      missing_tool "test (pytest)" "pytest"
    fi
  fi
fi

# ---------- Swift / iOS ----------
if [ -f Package.swift ]; then
  if has swift; then
    run_check "swift build" swift build
    if [ -d Tests ]; then
      run_check "swift test" swift test
    fi
  else
    missing_tool "swift build" "swift"
  fi
fi
if ls -d ./*.xcodeproj ./*.xcworkspace >/dev/null 2>&1; then
  if [ -n "${GATE_XCODE_SCHEME:-}" ]; then
    if has xcodebuild; then
      run_check "xcodebuild ($GATE_XCODE_SCHEME)" xcodebuild -quiet \
        -scheme "$GATE_XCODE_SCHEME" \
        -destination "${GATE_XCODE_DESTINATION:-generic/platform=iOS Simulator}" build
    else
      missing_tool "xcodebuild" "xcodebuild"
    fi
  else
    say ""
    say "note: Xcode project found but GATE_XCODE_SCHEME is not set; Xcode build not checked."
  fi
fi

# ---------- Static HTML (no package.json) ----------
if [ ! -f package.json ]; then
  HTML_LIST="$(list_files | grep -iE '\.html?$' | grep -vE '(^|/)(node_modules|dist|build)/')"
  if [ -n "$HTML_LIST" ]; then
    if has python3; then
      run_check "html sanity" python3 - "$HTML_LIST" <<'PY'
import sys, re, os, subprocess, tempfile, shutil
from html.parser import HTMLParser

VOID = {"area","base","br","col","embed","hr","img","input","link","meta",
        "param","source","track","wbr"}
# Elements whose end tag the HTML spec lets you omit.
OPTIONAL_END = {"p","li","dt","dd","option","optgroup","tr","td","th","thead",
                "tbody","tfoot","colgroup","rt","rp","html","head","body"}

class Checker(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.stack, self.errors, self.scripts, self.seen = [], [], [], set()
        self._in_script, self._buf = False, []
    def handle_starttag(self, tag, attrs):
        self.seen.add(tag)
        if tag in VOID: return
        self.stack.append((tag, self.getpos()[0]))
        if tag == "script":
            a = dict(attrs)
            t = (a.get("type") or "").lower()
            self._in_script = "src" not in a and t in ("", "text/javascript", "module", "application/javascript")
            self._buf = []
    def handle_startendtag(self, tag, attrs):
        self.seen.add(tag)
    def handle_data(self, data):
        if self._in_script: self._buf.append(data)
    def handle_endtag(self, tag):
        if tag in VOID: return
        if tag == "script" and self._in_script:
            self.scripts.append(("".join(self._buf), self.getpos()[0]))
            self._in_script = False
        # pop until match, allowing optional-end elements to close implicitly
        for i in range(len(self.stack) - 1, -1, -1):
            if self.stack[i][0] == tag:
                for t, line in self.stack[i+1:]:
                    if t not in OPTIONAL_END:
                        self.errors.append(f"<{t}> opened on line {line} is never closed (closed by </{tag}> on line {self.getpos()[0]})")
                del self.stack[i:]
                return
        self.errors.append(f"stray </{tag}> on line {self.getpos()[0]}")

files = [f for f in sys.argv[1].splitlines() if f.strip()]
bad = 0
node = shutil.which("node")
for f in files:
    try:
        src = open(f, encoding="utf-8", errors="replace").read()
    except OSError as e:
        print(f"{f}: cannot read ({e})"); bad += 1; continue
    c = Checker()
    try:
        c.feed(src); c.close()
    except Exception as e:
        print(f"{f}: parser error: {e}"); bad += 1; continue
    errs = list(c.errors)
    for t, line in c.stack:
        if t not in OPTIONAL_END:
            errs.append(f"<{t}> opened on line {line} is never closed")
    full_page = "<html" in src[:5000].lower() or os.path.basename(f).lower() == "index.html"
    if full_page:
        if not re.match(r"\s*<!doctype html>", src[:200], re.I):
            errs.append("missing <!DOCTYPE html> at the top")
        for t in ("html", "head", "body", "title"):
            if t not in c.seen:
                errs.append(f"missing <{t}>")
    if node:
        for i, (js, line) in enumerate(c.scripts):
            if not js.strip(): continue
            # Write as .mjs so top-level import/export/await in modules parse.
            ext = ".mjs" if re.search(r"^\s*(import|export)\s", js, re.M) else ".js"
            with tempfile.NamedTemporaryFile("w", suffix=ext, delete=False, encoding="utf-8") as tf:
                tf.write(js); p = tf.name
            r = subprocess.run([node, "--check", p], capture_output=True, text=True)
            os.unlink(p)
            if r.returncode != 0:
                msg = (r.stderr.strip().splitlines() or ["syntax error"])
                detail = next((m for m in msg if "Error" in m), msg[-1])
                errs.append(f"inline <script> starting line {line}: {detail}")
    if errs:
        bad += 1
        print(f"{f}: {len(errs)} problem(s)")
        for e in errs[:20]: print(f"  - {e}")
    else:
        extra = f", {len(c.scripts)} inline script(s) syntax-checked" if node else " (node not found: inline JS not checked)"
        print(f"{f}: ok{extra}")
sys.exit(1 if bad else 0)
PY
    else
      missing_tool "html sanity" "python3"
    fi
  fi
fi

# ---------- Project-specific checks ----------
if [ -f scripts/gate.local.sh ]; then
  run_check "project checks (scripts/gate.local.sh)" bash scripts/gate.local.sh
fi

# ---------- Secret scan (always) ----------
secret_scan() {
  # Patterns are assembled from pieces so this file doesn't match itself.
  local p_ant='sk-''ant-[A-Za-z0-9_-]{20,}'
  local p_oai='sk-(proj-)?[A-Za-z0-9]{32,}'
  local p_aws='AKIA''[0-9A-Z]{16}'
  local p_gh='gh[pousr]_''[A-Za-z0-9]{36,}'
  local p_slack='xox[abpr]-''[A-Za-z0-9-]{10,}'
  local p_pem='-----BEGIN ([A-Z]+ )?PRIVATE ''KEY-----'
  local p_assign='(client_secret|api_key|apikey|secret_key|access_token|password)["'"'"']?[[:space:]]*[:=][[:space:]]*["'"'"'][A-Za-z0-9_./+=-]{16,}["'"'"']'
  local hits=0 f
  while IFS= read -r f; do
    [ -f "$f" ] || continue
    case "$f" in
      scripts/gate.sh|*.png|*.jpg|*.jpeg|*.gif|*.webp|*.ico|*.zip|*.mp3|*.ogg|*.wav|*.woff*|*.ttf|*.pdf) continue ;;
      .env.example|*.env.example) continue ;;
    esac
    case "$f" in
      .env|*/.env|.env.*|*/.env.*)
        say "  $f: a .env file is in the repo's working set (should be gitignored)"
        hits=$((hits + 1)); continue ;;
    esac
    if grep -IEq -e "$p_ant" -e "$p_oai" -e "$p_aws" -e "$p_gh" -e "$p_slack" -e "$p_pem" "$f" 2>/dev/null \
       || grep -IEiq -e "$p_assign" "$f" 2>/dev/null; then
      # Print file and line numbers only, never the matched text.
      local lines
      lines="$( { grep -IEn -e "$p_ant" -e "$p_oai" -e "$p_aws" -e "$p_gh" -e "$p_slack" -e "$p_pem" "$f"; grep -IEin -e "$p_assign" "$f"; } 2>/dev/null | cut -d: -f1 | sort -un | tr '\n' ' ')"
      say "  $f: possible secret on line(s) $lines"
      hits=$((hits + 1))
    fi
  done <<EOF_FILES
$(list_files)
EOF_FILES
  [ "$hits" -eq 0 ] && say "  no secrets found"
  [ "$hits" -eq 0 ]
}
if [ "${GATE_SKIP_SECRETS:-0}" != "1" ]; then
  run_check "secret scan" secret_scan
fi

# ---------- Verdict ----------
say ""
if [ "$RAN" -le 1 ] && [ ! -f scripts/gate.local.sh ]; then
  # Only the secret scan ran: nothing proved the code works.
  say "No build, lint, test or HTML check was detected for this repo."
  say "Add one (npm scripts, ruff/pytest, Package.swift, GATE_XCODE_SCHEME) or scripts/gate.local.sh."
  say "GATE: FAIL"
  exit 1
fi
if [ "$FAILED" -gt 0 ]; then
  say "Failed checks:$FAILED_NAMES"
  say "GATE: FAIL"
  exit 1
fi
say "All $RAN check(s) passed."
say "GATE: PASS"
exit 0
