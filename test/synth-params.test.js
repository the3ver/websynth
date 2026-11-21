const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadEngineContext } = require('./helpers/synth-engine');
const { knobsOf } = require('./helpers/panel-markup');

const context = loadEngineContext('presets.js');
const { SynthParams, SYNTH_INIT_PRESET, AudioEngine } = context;

// Collects every leaf path, e.g. "vcf.cutoff" or "lfo1.destinations.pitch"
function leafPaths(obj, prefix = '') {
  return Object.entries(obj)
    .flatMap(([key, value]) =>
      value !== null && typeof value === 'object' ? leafPaths(value, `${prefix}${key}.`) : [`${prefix}${key}`]
    )
    .sort();
}

test('the table covers exactly the parameters of a preset state', () => {
  const tablePaths = JSON.parse(JSON.stringify(SynthParams.list.map((p) => p.path))).sort();
  assert.deepEqual(tablePaths, leafPaths(SYNTH_INIT_PRESET.state));
});

test('every SUB-1 knob in index.html is a patch parameter or an arpeggiator knob', () => {
  const knobIds = knobsOf('sub1');
  assert.ok(knobIds.length > 20, 'found the knobs');
  const arpKnobs = ['arp-bpm', 'arp-gate', 'arp-swing'];
  for (const id of knobIds) {
    assert.ok(SynthParams.byKnob(id, 1) || arpKnobs.includes(id), `no parameter for knob ${id}`);
  }
});

test('shared LFO knobs resolve to the LFO selected in the panel', () => {
  assert.equal(SynthParams.byKnob('lfo-rate', 1).path, 'lfo1.rate');
  assert.equal(SynthParams.byKnob('lfo-pitch', 2).path, 'lfo2.destinations.pitch');
  assert.equal(SynthParams.byKnob('vcf-cutoff', 2).path, 'vcf.cutoff');
});

test('performance values are read from their engine fields', () => {
  const engine = new AudioEngine();
  engine.setGlide(true);
  engine.setOctaveShift(-1);
  const state = SynthParams.readState(engine);
  assert.equal(state.performance.glide, true);
  assert.equal(state.performance.octaveShift, -1);
});

test('applyState ignores missing parameters', () => {
  const engine = new AudioEngine();
  const before = JSON.stringify(SynthParams.readState(engine));
  SynthParams.applyState(engine, { vcf: { cutoff: 900 } });
  const after = SynthParams.readState(engine);
  assert.equal(after.vcf.cutoff, 900);
  after.vcf.cutoff = JSON.parse(before).vcf.cutoff;
  assert.equal(JSON.stringify(after), before);
});

test('envelope stages are clamped per stage', () => {
  const engine = new AudioEngine();
  SynthParams.set(engine, 'ampEnv.sustain', 3);
  SynthParams.set(engine, 'filterEnv.attack', 0);
  SynthParams.set(engine, 'ampEnv.release', 0);
  assert.equal(engine.ampEnv.sustain, 1);
  assert.equal(engine.filterEnv.attack, 0.001);
  assert.equal(engine.ampEnv.release, 0.005);
});
