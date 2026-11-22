/**
 * Claude Code PostToolUse hook (.claude/hooks/format-on-edit.sh): Prettier on the edited JS file,
 * nothing for other files or files outside the project. Runs in a temp project that reuses the repo's node_modules.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const REPO = path.resolve(__dirname, '..');
const HOOK = path.join(REPO, '.claude', 'hooks', 'format-on-edit.sh');
const UGLY = 'const a = {x:"y"}\n';

function tempProject(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'format-hook-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  // 'junction' needs no admin rights on Windows; other platforms ignore the type
  fs.symlinkSync(path.join(REPO, 'node_modules'), path.join(dir, 'node_modules'), 'junction');
  for (const f of ['.prettierrc.json', '.prettierignore']) fs.copyFileSync(path.join(REPO, f), path.join(dir, f));
  const run = (file) =>
    spawnSync('bash', [HOOK], {
      env: { ...process.env, CLAUDE_PROJECT_DIR: dir },
      input: JSON.stringify({ tool_name: 'Edit', tool_input: { file_path: file } }),
      encoding: 'utf8'
    });
  return { dir, run };
}

test('formats an edited JS file in the project style, silently', (t) => {
  const p = tempProject(t);
  const file = path.join(p.dir, 'a.js');
  fs.writeFileSync(file, UGLY);
  const res = p.run(file);
  assert.equal(res.status, 0);
  assert.equal(res.stdout + res.stderr, '');
  assert.equal(fs.readFileSync(file, 'utf8'), "const a = { x: 'y' };\n");
});

test('leaves other file types and files outside the project alone', (t) => {
  const p = tempProject(t);
  const html = path.join(p.dir, 'page.html');
  fs.writeFileSync(html, '<p>  x  </p>');
  const outside = path.join(os.tmpdir(), `outside-${process.pid}.js`);
  fs.writeFileSync(outside, UGLY);
  t.after(() => fs.rmSync(outside, { force: true }));
  assert.equal(p.run(html).status, 0);
  assert.equal(p.run(outside).status, 0);
  assert.equal(fs.readFileSync(html, 'utf8'), '<p>  x  </p>');
  assert.equal(fs.readFileSync(outside, 'utf8'), UGLY);
});

test('a file that does not parse is left as it is and the agent is not blocked', (t) => {
  const p = tempProject(t);
  const file = path.join(p.dir, 'broken.js');
  fs.writeFileSync(file, 'const = ;\n');
  assert.equal(p.run(file).status, 0);
  assert.equal(fs.readFileSync(file, 'utf8'), 'const = ;\n');
});
