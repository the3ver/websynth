#!/usr/bin/env bash
# Claude Code PostToolUse hook (Edit|Write): formats the edited file with Prettier, silently.
# Only files inside the project that Prettier handles (.prettierignore keeps HTML/CSS/MD out); never blocks the agent.
input=$(cat)
root=${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null)}
[ -n "$root" ] || exit 0
file=$(printf '%s' "$input" | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{try{process.stdout.write(JSON.parse(d).tool_input.file_path||"")}catch{}})')
case "$file" in
  "$root"/*.js) ;;
  *) exit 0 ;;
esac
[ -f "$file" ] && [ -x "$root/node_modules/.bin/prettier" ] || exit 0
cd "$root" && node_modules/.bin/prettier --write --log-level silent "$file" > /dev/null 2>&1
exit 0
