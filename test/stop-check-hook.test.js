/**
 * Claude Code Stop hook (.claude/hooks/stop-check.sh): runs the check once per working-tree state,
 * exit 2 with the findings when red, lets the agent stop when a red state comes back unchanged.
 * Runs the hook in a temp git repo with a stand-in check that counts its runs.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync, execFileSync } = require('child_process');

const HOOK = path.resolve(__dirname, '..', '.claude', 'hooks', 'stop-check.sh');

function tempRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stop-hook-'));
  const git = (...args) => execFileSync('git', args, { cwd: dir, stdio: 'ignore' });
  git('init', '-q');
  fs.writeFileSync(path.join(dir, 'app.js'), 'one\n');
  git('add', '.');
  git('-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '-m', 'init');
  // Stand-in check outside the repo: counts runs, fails while the file "red" exists next to it
  const tools = fs.mkdtempSync(path.join(os.tmpdir(), 'stop-hook-tools-'));
  const check = path.join(tools, 'check.sh');
  fs.writeFileSync(check, `echo run >> "${tools}/runs"; [ -e "${tools}/red" ] && { echo "CHECK FAILED: tests"; exit 1; }; echo "CHECK OK"\n`);
  return {
    dir,
    setRed: (red) => (red ? fs.writeFileSync(path.join(tools, 'red'), '') : fs.rmSync(path.join(tools, 'red'), { force: true })),
    runs: () => (fs.existsSync(path.join(tools, 'runs')) ? fs.readFileSync(path.join(tools, 'runs'), 'utf8').split('\n').filter(Boolean).length : 0),
    hook: (input = { stop_hook_active: false }) => {
      const env = { ...process.env, CHECK_CMD: `bash ${check}` };
      delete env.CLAUDE_PROJECT_DIR;
      return spawnSync('bash', [HOOK], { cwd: dir, env, input: JSON.stringify(input), encoding: 'utf8' });
    },
    cleanup: () => {
      fs.rmSync(dir, { recursive: true, force: true });
      fs.rmSync(tools, { recursive: true, force: true });
    }
  };
}

test('green: exit 0, silent, and the same state is not checked again', (t) => {
  const r = tempRepo();
  t.after(r.cleanup);
  const first = r.hook();
  assert.equal(first.status, 0);
  assert.equal(first.stdout + first.stderr, '');
  assert.equal(r.hook().status, 0);
  assert.equal(r.runs(), 1);
});

test('an edited or new file is checked again', (t) => {
  const r = tempRepo();
  t.after(r.cleanup);
  r.hook();
  fs.writeFileSync(path.join(r.dir, 'app.js'), 'two\n');
  r.hook();
  fs.writeFileSync(path.join(r.dir, 'new.js'), 'three\n');
  r.hook();
  assert.equal(r.runs(), 3);
});

test('red: exit 2 with the findings on stderr', (t) => {
  const r = tempRepo();
  t.after(r.cleanup);
  r.setRed(true);
  const res = r.hook();
  assert.equal(res.status, 2);
  assert.match(res.stderr, /CHECK FAILED: tests/);
});

test('red and unchanged after the agent was sent back: lets it stop without rerunning', (t) => {
  const r = tempRepo();
  t.after(r.cleanup);
  r.setRed(true);
  r.hook();
  const again = r.hook({ stop_hook_active: true });
  assert.equal(again.status, 0);
  assert.equal(r.runs(), 1);
});

test('red, then fixed: the new state is checked and passes', (t) => {
  const r = tempRepo();
  t.after(r.cleanup);
  r.setRed(true);
  r.hook();
  r.setRed(false);
  fs.writeFileSync(path.join(r.dir, 'app.js'), 'fixed\n');
  assert.equal(r.hook({ stop_hook_active: true }).status, 0);
  assert.equal(r.runs(), 2);
});
