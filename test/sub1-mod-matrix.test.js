const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createLiveEngine, loadEngineContext, FM_SCRIPTS } = require('./helpers/synth-engine');

const plain = (v) => JSON.parse(JSON.stringify(v));
// Same nodes in the same order (arrays from the vm sandbox fail deepEqual against Node arrays)
const sameNodes = (actual, expected) => {
  assert.equal(actual.length, expected.length);
  actual.forEach((node, i) => assert.equal(node, expected[i]));
};

test('every voice has an unplugged 8-slot matrix over its named targets', () => {
  const { engine } = createLiveEngine();
  for (const voice of engine.voicePool) {
    assert.equal(voice.modMatrix.gains.length, 8);
    assert.deepEqual(plain(voice.modMatrix.routes), Array(8).fill(null));
    assert.equal(voice.modMatrix.targets, voice.modTargets);
  }
});

test('a slot routes its source into every voice at amount * depth', () => {
  const { engine, context } = createLiveEngine();
  engine.setModSlot('slot3', 'source', 'velocity');
  engine.setModSlot('slot3', 'dest', 'vcf');
  engine.setModSlot('slot3', 'amount', 0.5);
  for (const voice of engine.voicePool) {
    const gain = voice.modMatrix.gains[2];
    assert.ok(voice.modSources.velocity.connections.includes(gain));
    sameNodes(gain.connections, voice.filter.detuneParams);
    assert.equal(gain.gain.value, 0.5 * context.SUB1_MOD_TARGETS.vcf.depth);
  }
});

test('LFOs and the mod wheel are shared sources, the wheel signal follows setModWheel', () => {
  const { engine } = createLiveEngine();
  engine.setModSlot('slot1', 'source', 'modWheel');
  engine.setModSlot('slot1', 'dest', 'resonance');
  engine.setModSlot('slot1', 'amount', 1);
  engine.setModSlot('slot2', 'source', 'lfo2');
  engine.setModSlot('slot2', 'dest', 'pwm');
  engine.setModSlot('slot2', 'amount', -1);
  const voice = engine.voicePool[5];
  assert.ok(engine.modWheelSource.connections.includes(voice.modMatrix.gains[0]));
  sameNodes(voice.modMatrix.gains[0].connections, voice.filter.qParams);
  assert.ok(engine.lfos[2].output.connections.includes(voice.modMatrix.gains[1]));
  sameNodes(voice.modMatrix.gains[1].connections, [voice.vco[1].pwInput, voice.vco[2].pwInput]);

  engine.setModWheel(0.4);
  assert.equal(engine.modWheelSource.offset.value, 0.4);
});

test('note on sets velocity, key and random and starts both mod envelopes; note off releases them', () => {
  const { engine, ctx } = createLiveEngine();
  engine.noteOn(72, 0.6);
  const voice = engine.activeVoices.get(72);
  const { velocity, key, random, filterEnv, ampEnv } = voice.modSources;
  assert.equal(velocity.offset.value, 0.6);
  assert.equal(key.offset.value, 12 / 60);
  assert.ok(random.offset.value >= -1 && random.offset.value <= 1);
  for (const env of [filterEnv, ampEnv]) {
    const ramps = env.offset.events.filter((e) => e.type === 'exponentialRampToValueAtTime');
    assert.equal(ramps[0].value, 1, 'attack to 1');
  }
  ctx.currentTime = 0.5;
  engine.noteOff(72);
  for (const env of [filterEnv, ampEnv]) assert.equal(env.offset.lastValue('setTargetAtTime'), 0);
});

test('setModSlot clamps the amount and ignores unknown slots and fields', () => {
  const { engine } = createLiveEngine();
  engine.setModSlot('slot1', 'amount', 3);
  assert.equal(engine.modMatrix.slot1.amount, 1);
  engine.setModSlot('slot1', 'amount', -7);
  assert.equal(engine.modMatrix.slot1.amount, -1);
  engine.setModSlot('slot9', 'amount', 1);
  engine.setModSlot('slot1', 'color', 'red');
  assert.equal(engine.modMatrix.slot9, undefined);
  assert.equal(engine.modMatrix.slot1.color, undefined);
});

test('matrix slots are saved in presets and reloaded', () => {
  const { AudioEngine } = loadEngineContext();
  const a = new AudioEngine();
  a.initAudio();
  a.setModSlot('slot8', 'source', 'key');
  a.setModSlot('slot8', 'dest', 'noiseLevel');
  a.setModSlot('slot8', 'amount', -0.25);
  const state = a.getPresetState();
  assert.deepEqual(plain(state.modMatrix.slot8), { source: 'key', dest: 'noiseLevel', amount: -0.25 });

  const b = new AudioEngine();
  b.initAudio();
  b.loadPresetState(state);
  const gain = b.voicePool[0].modMatrix.gains[7];
  assert.ok(b.voicePool[0].modSources.key.connections.includes(gain));
});

test('the SUB-1 definition lists exactly the sources and targets a voice can route', () => {
  const context = loadEngineContext('presets.js', ...FM_SCRIPTS, 'patch-randomizer.js', 'synth-registry.js');
  const { matrix } = { matrix: context.SynthRegistry.get('sub1').modMatrix };
  const engine = new context.AudioEngine();
  engine.initAudio();
  const voice = engine.voicePool[0];
  assert.deepEqual(Object.keys(matrix.sources).sort(), Object.keys(voice.modMatrix.sources).sort());
  assert.deepEqual(Object.keys(matrix.targets).sort(), Object.keys(voice.modTargets).sort());
  for (const [id, target] of Object.entries(matrix.targets)) {
    assert.equal(typeof target.label, 'string', id);
    assert.ok(target.depth > 0, id);
  }
  for (const source of Object.values(voice.modMatrix.sources)) assert.ok(source, 'every source has a node');
});

test('the panel counts a slot as active only with known source, known target and an amount', () => {
  const context = loadEngineContext('dom-utils.js', 'mod-matrix-panel.js');
  const matrix = { sources: { lfo1: 'LFO 1' }, targets: { vcf: { label: 'CUTOFF' } } };
  const active = (source, dest, amount) => context.ModMatrixPanel.isActive({ source, dest, amount }, matrix);
  assert.equal(active('lfo1', 'vcf', 0.2), true);
  assert.equal(active('lfo1', 'vcf', 0), false);
  assert.equal(active('off', 'vcf', 0.2), false);
  assert.equal(active('lfo1', 'pitch', 0.2), false);
});

test('every matrix slot has its amount knob in the SUB-1 markup', () => {
  const { knobsOf } = require('./helpers/panel-markup');
  const knobs = knobsOf('sub1');
  for (let n = 1; n <= 8; n++) assert.ok(knobs.includes(`mod-slot${n}-amount`), `slot${n}`);
});

test('per-voice constant sources stay stopped until a slot routes them', () => {
  const { engine } = createLiveEngine();
  for (const voice of engine.voicePool) {
    for (const source of Object.values(voice.modSources)) assert.equal(source.started, null);
  }
  engine.setModSlot('slot1', 'source', 'random');
  engine.setModSlot('slot1', 'dest', 'pitch');
  engine.setModSlot('slot1', 'amount', 0.2);
  for (const voice of engine.voicePool) {
    assert.notEqual(voice.modSources.random.started, null);
    assert.equal(voice.modSources.velocity.started, null);
  }
});
