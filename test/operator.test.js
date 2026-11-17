const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadScripts } = require('./helpers/load-browser-script');
const { FakeAudioContext } = require('./helpers/fake-audio-context');

const { SynthBlocks } = loadScripts('lib/operator.js');
const { Operator } = SynthBlocks;

test('sine -> silent amp -> unity scale -> output', () => {
  const op = new Operator(new FakeAudioContext());
  assert.equal(op.osc.type, 'sine');
  assert.ok(op.osc.connections.includes(op.amp));
  assert.ok(op.amp.connections.includes(op.scale));
  assert.equal(op.output, op.scale);
  assert.equal(op.gain.value, 0);
  assert.equal(op.scaleParam.value, 1);
  assert.equal(op.frequency, op.osc.frequency);
});

test('a modulator connects into another operator frequency param', () => {
  const ctx = new FakeAudioContext();
  const mod = new Operator(ctx);
  const carrier = new Operator(ctx);
  mod.connect(carrier.frequency);
  assert.ok(mod.output.connections.includes(carrier.frequency));
  mod.disconnect();
  assert.equal(mod.output.connections.length, 0);
});

test('modulation scale is the max index times the modulator frequency', () => {
  assert.equal(Operator.modulationScale(220), Operator.MAX_INDEX * 220);
});

test('every algorithm wires operators 1..4 with operator 1 as a carrier and no self-loops', () => {
  const algorithms = Object.entries(Operator.ALGORITHMS);
  assert.equal(algorithms.length, 8);
  for (const [id, { mods, carriers }] of algorithms) {
    assert.ok(carriers.includes(1), `algorithm ${id}`);
    for (const [from, to] of mods) {
      assert.ok(from > to, `algorithm ${id}: ${from} -> ${to} must feed a lower operator`);
      assert.ok(!carriers.includes(from), `algorithm ${id}: carrier ${from} also modulates`);
    }
  }
});
