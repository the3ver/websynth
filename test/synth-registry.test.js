const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadEngineContext } = require('./helpers/synth-engine');

const context = loadEngineContext('presets.js', 'synth-registry.js');
const { SynthRegistry } = context;
const definitions = Object.values(SynthRegistry.definitions);

test('unknown ids fall back to the SUB-1', () => {
  assert.equal(SynthRegistry.get('nope').id, 'sub1');
});

for (const synth of definitions) {
  test(`${synth.id}: definition matches its engine and parameter table`, () => {
    const engine = synth.createEngine();
    assert.equal(engine.params, synth.params);
    const ui = { currentLfoTarget: 1 };

    for (const group of synth.buttonGroups) {
      const path = typeof group.path === 'function' ? group.path(ui) : group.path;
      assert.ok(synth.params.byPath(path), `button group ${path}`);
    }
    for (const toggle of synth.toggles) {
      assert.equal(typeof synth.params.getPath(engine, toggle.path), 'boolean', `toggle ${toggle.path}`);
    }
    for (const [target, envPath] of Object.entries(synth.envTargets)) {
      for (const stage of ['attack', 'decay', 'sustain', 'release']) {
        assert.ok(synth.params.byPath(`${envPath}.${stage}`), `${target} ${stage}`);
      }
    }
    assert.ok(synth.presets.factory.length > 0);
    assert.ok(synth.presets.init.state);
    assert.equal(typeof synth.presetStorageKey, 'string');
    assert.ok(synth.lfoRate(engine, ui) > 0);
  });

  test(`${synth.id}: every factory preset loads and reads back unchanged`, () => {
    const plain = (v) => JSON.parse(JSON.stringify(v));
    for (const preset of [synth.presets.init, ...synth.presets.factory]) {
      const engine = synth.createEngine();
      engine.loadPresetState(preset.state);
      assert.deepEqual(plain(engine.getPresetState()), plain(preset.state), preset.id);
    }
  });
}

test('preset storage keys are distinct per synth', () => {
  const keys = definitions.map((s) => s.presetStorageKey);
  assert.equal(new Set(keys).size, keys.length);
});
