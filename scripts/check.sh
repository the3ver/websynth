#!/usr/bin/env bash
# Quiet check: syntax of every script, ESLint, types (tsc), Prettier, HTML structure, unit tests, layout in a browser.
# Green: one line "CHECK OK: ...". Red: only the failing step's findings, exit 1.
# Used by `npm run check`, the Claude Code Stop hook (.claude/hooks/stop-check.sh) and later CI.
set -uo pipefail
cd "$(dirname "$0")/.."
start=$SECONDS
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

fail() { echo "CHECK FAILED: $1"; cat "$tmp/out"; exit 1; }

# 1. Syntax (node --check takes one file per call)
: > "$tmp/out"
files=(js/*.js js/lib/*.js js/worklets/*.js sw.js scripts/*.js test/*.js test/helpers/*.js)
for f in "${files[@]}"; do
  node --check "$f" 2>> "$tmp/out" || echo "  in $f" >> "$tmp/out"
done
[ -s "$tmp/out" ] && fail "syntax"

for tool in html-validate eslint prettier tsc; do
  [ -x node_modules/.bin/$tool ] || { echo "CHECK FAILED: node_modules/.bin/$tool missing, run npm install"; exit 1; }
done

# 2. Lint (eslint.config.js), errors only
node_modules/.bin/eslint --max-warnings 0 . > "$tmp/out" 2>&1 || fail "eslint"

# 2a. Types: tsconfig.json (js/, js/lib/, globals in types/globals.d.ts), tsconfig.sw.json (sw.js, webworker lib)
{ node_modules/.bin/tsc -p . && node_modules/.bin/tsc -p tsconfig.sw.json; } > "$tmp/out" 2>&1 || fail "types (tsc)"

# 2b. Formatting (.prettierrc.json; the PostToolUse hook formats on edit, npx prettier --write . fixes the rest)
node_modules/.bin/prettier --list-different . > "$tmp/out" 2>&1 || { sed -i '1i not formatted (npx prettier --write <file>):' "$tmp/out"; fail "prettier"; }

# 3. HTML structure (.htmlvalidate.json)
validator=node_modules/.bin/html-validate
"$validator" --formatter text index.html privacy.html > "$tmp/out" 2>&1 || fail "html-validate"

# 4. Unit tests: dot reporter on screen (failures only), TAP to a file for the count
node --test --test-reporter=dot --test-reporter-destination="$tmp/dots" \
  --test-reporter=tap --test-reporter-destination="$tmp/tap" "test/**/*.test.js" > /dev/null 2>&1
status=$?
if [ $status -ne 0 ]; then
  grep -v -e '^[.X]*$' -e '(node:internal/' -e '(node:async_hooks' "$tmp/dots" > "$tmp/out"
  fail "tests ($(grep -m1 '^# fail' "$tmp/tap" | cut -d' ' -f3) failing)"
fi

tests=$(grep -m1 '^# pass' "$tmp/tap" | cut -d' ' -f3)

# 5. Layout in headless Chromium (scripts/layout-check.js): 2 synths x 5 screen sizes
node scripts/layout-check.js > "$tmp/out" 2>&1 || fail "layout"
layout=$(grep -o '[0-9]* pages' "$tmp/out")
echo "CHECK OK: ${#files[@]} files syntax+lint+types+format, 2 pages html, $tests tests, layout $layout, $((SECONDS - start))s"
