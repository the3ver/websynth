#!/usr/bin/env bash
# Quiet check: syntax of every script, HTML structure, unit tests.
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

# 2. HTML structure (.htmlvalidate.json)
validator=node_modules/.bin/html-validate
[ -x "$validator" ] || { echo "CHECK FAILED: $validator missing, run npm install"; exit 1; }
"$validator" --formatter text index.html privacy.html > "$tmp/out" 2>&1 || fail "html-validate"

# 3. Unit tests: dot reporter on screen (failures only), TAP to a file for the count
node --test --test-reporter=dot --test-reporter-destination="$tmp/dots" \
  --test-reporter=tap --test-reporter-destination="$tmp/tap" "test/**/*.test.js" > /dev/null 2>&1
status=$?
if [ $status -ne 0 ]; then
  grep -v -e '^[.X]*$' -e '(node:internal/' -e '(node:async_hooks' "$tmp/dots" > "$tmp/out"
  fail "tests ($(grep -m1 '^# fail' "$tmp/tap" | cut -d' ' -f3) failing)"
fi

tests=$(grep -m1 '^# pass' "$tmp/tap" | cut -d' ' -f3)
echo "CHECK OK: ${#files[@]} files syntax, 2 pages html, $tests tests, $((SECONDS - start))s"
