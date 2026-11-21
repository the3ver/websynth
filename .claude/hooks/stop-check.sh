#!/usr/bin/env bash
# Claude Code Stop hook: runs the quiet check at the end of a turn, exit 2 sends the agent back with the findings.
# Skips states already checked: fingerprint = HEAD + diff against HEAD + untracked files, kept in .git/claude-check-state.
# A red state is checked once; if the agent stops again without changing anything, the hook lets it stop (no loop).
# CHECK_CMD overrides the check (tests use a stand-in).
set -uo pipefail
input=$(cat)
root=${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel)}
cd "$root" || exit 0
check=${CHECK_CMD:-bash scripts/check.sh}
state="$(git rev-parse --absolute-git-dir)/claude-check-state"

fingerprint() {
  {
    git rev-parse HEAD 2>/dev/null
    git diff HEAD --binary 2>/dev/null
    git ls-files --others --exclude-standard -z | xargs -0 -r sha1sum
  } | sha1sum | cut -d' ' -f1
}

fp=$(fingerprint)
last=$(cat "$state" 2>/dev/null || true)
[ "$last" = "green $fp" ] && exit 0
if [ "$last" = "red $fp" ] && printf '%s' "$input" | grep -q '"stop_hook_active": *true'; then
  exit 0
fi

out=$($check 2>&1)
if [ $? -eq 0 ]; then
  echo "green $fp" > "$state"
  exit 0
fi
echo "red $fp" > "$state"
printf '%s\n' "$out" >&2
exit 2
