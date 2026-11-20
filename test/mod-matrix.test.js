const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadScripts } = require('./helpers/load-browser-script');
const { FakeAudioContext } = require('./helpers/fake-audio-context');

const { SynthBlocks } = loadScripts('lib/mod-matrix.js');

function setup(slots) {
  const ctx = new FakeAudioContext();
  const lfo = ctx.createGain();
  const env = ctx.createGain();
  const detuneA = ctx.createGain().gain;
  const detuneB = ctx.createGain().gain;
  const q = ctx.createGain().gain;
  const matrix = new SynthBlocks.ModMatrix(ctx, {
    sources: { lfo, env },
    targets: { pitch: [detuneA, detuneB], resonance: [q] },
    depths: { pitch: 200, resonance: 10 },
    slots
  });
  return { matrix, lfo, env, detuneA, detuneB, q };
}

test('an empty slot stays unplugged with gain 0', () => {
  const slots = [{ source: 'off', dest: 'off', amount: 0 }];
  const { matrix, lfo, env } = setup(slots);
  assert.equal(matrix.gains.length, 1);
  assert.deepEqual(matrix.gains[0].connections, []);
  assert.ok(!lfo.connections.includes(matrix.gains[0]));
  assert.ok(!env.connections.includes(matrix.gains[0]));
  assert.equal(matrix.gains[0].gain.value, 0);
});

test('a routed slot feeds every param of its target at amount * depth', () => {
  const slots = [{ source: 'lfo', dest: 'pitch', amount: -0.5 }];
  const { matrix, lfo, detuneA, detuneB } = setup(slots);
  const gain = matrix.gains[0];
  assert.ok(lfo.connections.includes(gain));
  assert.deepEqual(gain.connections, [detuneA, detuneB]);
  assert.equal(gain.gain.value, -100);
});

test('changing source or target rewires the slot, amount changes only ramp the gain', () => {
  const slots = [{ source: 'lfo', dest: 'pitch', amount: 1 }];
  const { matrix, lfo, env, q } = setup(slots);
  const gain = matrix.gains[0];

  slots[0].amount = 0.25;
  matrix.applySlot(0);
  assert.equal(gain.gain.value, 50);
  assert.ok(lfo.connections.includes(gain));

  slots[0].source = 'env';
  slots[0].dest = 'resonance';
  matrix.applySlot(0);
  assert.ok(!lfo.connections.includes(gain));
  assert.ok(env.connections.includes(gain));
  assert.deepEqual(gain.connections, [q]);
  assert.equal(gain.gain.value, 2.5);
});

test('amount 0 or an unknown name unplugs the slot again', () => {
  const slots = [{ source: 'lfo', dest: 'pitch', amount: 1 }];
  const { matrix, lfo } = setup(slots);
  const gain = matrix.gains[0];

  slots[0].amount = 0;
  matrix.applySlot(0);
  assert.ok(!lfo.connections.includes(gain));
  assert.deepEqual(gain.connections, []);
  assert.equal(gain.gain.value, 0);

  slots[0].amount = 1;
  slots[0].dest = 'nowhere';
  matrix.applySlot(0);
  assert.ok(!lfo.connections.includes(gain));
  assert.equal(matrix.routes[0], null);
});

test('two slots on the same source keep their own connections', () => {
  const slots = [
    { source: 'lfo', dest: 'pitch', amount: 1 },
    { source: 'lfo', dest: 'resonance', amount: 1 }
  ];
  const { matrix, lfo } = setup(slots);
  slots[0].amount = 0;
  matrix.applySlot(0);
  assert.ok(!lfo.connections.includes(matrix.gains[0]));
  assert.ok(lfo.connections.includes(matrix.gains[1]));
});
