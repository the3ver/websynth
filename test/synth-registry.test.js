const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { loadEngineContext, FM_SCRIPTS } = require('./helpers/synth-engine');
const context = loadEngineContext('presets.js', ...FM_SCRIPTS, 'synth-registry.js');
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

describe('panel markup per synth', () => {
  const { readPanelMarkup, knobsOf } = require('./helpers/panel-markup');
  const arpKnobs = ['arp-bpm', 'arp-gate', 'arp-swing'];

  for (const synth of definitions) {
    test(`${synth.id}: every knob it shows is one of its parameters or an arpeggiator knob`, () => {
      const knobs = knobsOf(synth.id);
      assert.ok(knobs.length > 10, 'found the knobs');
      for (const id of knobs) {
        assert.ok(synth.params.byKnob(id, 1) || arpKnobs.includes(id), `no ${synth.id} parameter for knob ${id}`);
      }
    });

    test(`${synth.id}: envelope tabs match its envelope targets`, () => {
      const tabs = readPanelMarkup().envTabs.filter((t) => t.synth === synth.id).map((t) => t.target);
      assert.deepEqual(tabs, Object.keys(synth.envTargets));
    });
  }

  test('every element outside data-synth regions is shared, so no envelope tab is unassigned', () => {
    assert.equal(readPanelMarkup().envTabs.filter((t) => t.synth === null).length, 0);
  });
});

describe('resolveId', () => {
  test('the URL wins over the stored choice', () => {
    assert.equal(SynthRegistry.resolveId('?synth=fm', 'sub1'), 'fm');
    assert.equal(SynthRegistry.resolveId('?foo=1&synth=sub1', 'fm'), 'sub1');
  });

  test('falls back to the stored choice, then to the SUB-1', () => {
    assert.equal(SynthRegistry.resolveId('', 'fm'), 'fm');
    assert.equal(SynthRegistry.resolveId('?synth=nope', 'also-nope'), 'sub1');
    assert.equal(SynthRegistry.resolveId('', null), 'sub1');
    assert.equal(SynthRegistry.resolveId('?synth=toString', null), 'sub1');
  });
});

test('preset storage keys are distinct per synth', () => {
  const keys = definitions.map((s) => s.presetStorageKey);
  assert.equal(new Set(keys).size, keys.length);
});
