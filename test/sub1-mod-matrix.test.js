const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createLiveEngine, loadEngineContext } = require('./helpers/synth-engine');

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
