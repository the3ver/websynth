const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadScripts } = require('./helpers/load-browser-script');

const { SYNTH_FACTORY_PRESETS, SYNTH_INIT_PRESET } = loadScripts('presets.js');

// Collects every leaf path, e.g. "vcf.cutoff" or "lfo1.destinations.pitch"
function leafPaths(obj, prefix = '') {
  return Object.entries(obj).flatMap(([key, value]) =>
    value !== null && typeof value === 'object'
      ? leafPaths(value, `${prefix}${key}.`)
      : [`${prefix}${key}`]
  ).sort();
}

test('preset ids are unique', () => {
  const ids = [SYNTH_INIT_PRESET, ...SYNTH_FACTORY_PRESETS].map((p) => p.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('every factory preset defines exactly the parameters of the INIT patch', () => {
  const expected = leafPaths(SYNTH_INIT_PRESET.state);
  for (const preset of SYNTH_FACTORY_PRESETS) {
    assert.deepEqual(leafPaths(preset.state), expected, preset.id);
  }
});

test('every preset has name, category and description', () => {
  for (const preset of [SYNTH_INIT_PRESET, ...SYNTH_FACTORY_PRESETS]) {
    for (const field of ['name', 'category', 'description']) {
      assert.equal(typeof preset[field], 'string', `${preset.id}.${field}`);
      assert.ok(preset[field].length > 0, `${preset.id}.${field}`);
    }
  }
});
