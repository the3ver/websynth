/**
 * Claude Code PreToolUse hook (.claude/hooks/git-guardrails.js): blocks destructive git commands with exit 2,
 * lets the release workflow (push of branches and main, deleting merged branches) through.
 * Runs the hook as Claude Code does: tool input as JSON on stdin.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const HOOK = path.resolve(__dirname, '..', '.claude', 'hooks', 'git-guardrails.js');

const run = (command) =>
  spawnSync('node', [HOOK], { input: JSON.stringify({ tool_input: { command } }), encoding: 'utf8' });

const BLOCKED = [
  'git push --force',
  'git push -f origin feature/x',
  'git push origin feature/x --force-with-lease',
  'git push --force-with-lease=main:abc origin main',
  'git push origin +main',
  'git push origin +HEAD:refs/heads/feature/x',
  'git push -uf origin x',
  'git push --mirror backup',
  'git push origin --delete main',
  'git push origin -d main',
  'git push origin :main',
  'git push origin :refs/heads/main',
  'git reset --hard',
  'git reset --hard origin/main',
  'git clean -f',
  'git clean -fdx',
  'git clean --force -d',
  'git branch -D feature/x',
  'git branch --delete --force feature/x',
  'git branch -d main',
  'git branch -D main',
  'git checkout -- .',
  'git checkout .',
  'git restore .',
  'git restore --worktree --staged :/',
  // inside chains, with global options and quoting
  'npm test && git push -f',
  'cd /tmp; git -C ~/repos/websynth reset --hard HEAD~1',
  'git -c core.editor=true push --force origin x',
  "git 'reset' '--hard'",
  'git status\ngit clean -fd',
  '/usr/bin/git push --force',
  // line continuations, nested shells, backticks, redirections
  'git \\\n  reset --hard',
  'git -C /home/dev/repos/websynth \\\n  push --force-with-lease origin x',
  'git reset \\\n--hard',
  'bash -c "git reset --hard"',
  "sh -c 'git push -f'",
  'timeout 60 bash -lc "cd x && git clean -fd"',
  'eval "git clean -fd"',
  'echo `git reset --hard`',
  'echo $(git reset --hard)',
  'git reset --hard>/dev/null',
  'git clean -f 2>&1 | tail -1',
  // prefixes of long options, as git accepts them
  'git reset --har',
  'git push --forc origin x',
  'git clean --forc',
  // other ways to discard work or move main
  'git checkout -f feature/x',
  'git checkout --force main',
  'git switch --discard-changes main',
  'git switch -f main',
  'git stash clear',
  'git stash drop',
  'git worktree remove --force ../wt',
  'git branch -M feature/x main',
  'git branch -f main HEAD~3',
  // a heredoc ends and the next line is a command again
  "cat <<'EOF' > notes.txt\ngit reset --hard\nEOF\ngit reset --hard"
];

const ALLOWED = [
  'git push',
  'git push origin main',
  'git push -u origin test/render-check',
  'git push origin HEAD:main',
  'git push origin --delete dependabot/npm_and_yarn/html-validate-11.21.1',
  'git push origin :feature/old',
  'git branch -d feature/merged',
  'git branch --merged main',
  'git reset --soft HEAD~1',
  'git reset HEAD file.js',
  'git clean -n',
  'git checkout main',
  'git checkout -b feature/new',
  'git checkout -- js/app.js',
  'git restore js/app.js',
  'git restore --staged .',
  'git status && git log --oneline -5',
  'git commit -m "docs: never run git push --force or git reset --hard"',
  'echo "git clean -f" > notes.txt',
  'grep -rn "reset --hard" docs',
  'npm run check',
  'git push origin main:main',
  'git push -o ci.skip origin main',
  'git fetch -q && git merge --ff-only -q build/x && git push -q origin main 2>&1 | tail -1',
  'git push --dry-run origin main',
  'git push --follow-tags origin main',
  'git branch -f feature/x main',
  'git branch -m old-name new-name',
  'git checkout -b feature/new main',
  'git switch -c feature/new',
  'git stash list',
  'git stash pop',
  'git worktree remove ../wt',
  'git -C /home/dev/repos/websynth \\\n  log --oneline -3',
  "git commit -q -F - <<'EOF'\nfix: never run git push --force or git reset --hard\n\nBody.\nEOF\ngit log -1",
  'git commit -m "$(cat <<\'EOF\'\nfix: no git reset --hard here\nEOF\n)"',
  'bash -c "git status"'
];

for (const command of BLOCKED) {
  test(`blocks: ${command.replace(/\n/g, '\\n')}`, () => {
    const res = run(command);
    assert.equal(res.status, 2, res.stderr);
    assert.match(res.stderr, /^BLOCKED by \.claude\/hooks\/git-guardrails\.js: /);
  });
}

for (const command of ALLOWED) {
  test(`allows: ${command}`, () => {
    const res = run(command);
    assert.equal(res.status, 0, res.stderr);
    assert.equal(res.stderr, '');
  });
}

test('input without a command (other tools, broken JSON) passes', () => {
  assert.equal(spawnSync('node', [HOOK], { input: '{}', encoding: 'utf8' }).status, 0);
  assert.equal(spawnSync('node', [HOOK], { input: 'not json', encoding: 'utf8' }).status, 0);
});

test('.claude/settings.json runs the hook before every Bash call', () => {
  const settings = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', '.claude', 'settings.json'), 'utf8'));
  const bash = settings.hooks.PreToolUse.find((h) => h.matcher === 'Bash');
  assert.ok(bash, 'PreToolUse entry with matcher Bash');
  assert.ok(bash.hooks.some((h) => h.command.includes('.claude/hooks/git-guardrails.js')));
});
