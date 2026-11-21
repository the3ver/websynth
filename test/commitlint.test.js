/**
 * commitlint.config.js: Conventional Commits with the types of reviewer rule R1; the check lints main..HEAD.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const lint = require('@commitlint/lint').default;
const load = require('@commitlint/load').default;

// Loaded once: load() resolves the shareable config on every call (~0.1 s)
const configured = load({}, { cwd: require('path').resolve(__dirname, '..') });

const check = async (message) => {
  const config = await configured;
  const result = await lint(message, config.rules, { parserOpts: config.parserPreset?.parserOpts });
  return result.errors.map((e) => e.name);
};

test('the R1 types pass, with and without scope', async () => {
  for (const type of ['feat', 'fix', 'build', 'ci', 'test', 'docs', 'refactor', 'style', 'chore'])
    assert.deepEqual(await check(`${type}(fx): delay time syncs to the clock`), [], type);
  assert.deepEqual(await check('fix: MIDI connects at page load (v1.8.35)'), []);
});

test('other types, a missing type and an empty subject fail', async () => {
  assert.deepEqual(await check('release: v1.8.0'), ['type-enum']);
  assert.deepEqual(await check('perf: faster voices'), ['type-enum']);
  assert.ok((await check('delay time syncs to the clock')).includes('type-empty'));
  assert.ok((await check('feat: ')).includes('subject-empty'));
});

test('subjects keep their own spelling and may run to 120 characters', async () => {
  assert.deepEqual(await check('feat(fm): FM-4 algorithm display, SynthBlocks.Delay and AGENTS.md'), []);
  assert.deepEqual(await check(`feat: ${'x'.repeat(114)}`), []);
  assert.deepEqual(await check(`feat: ${'x'.repeat(115)}`), ['header-max-length']);
});
