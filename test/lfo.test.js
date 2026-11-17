const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { loadScripts } = require('./helpers/load-browser-script');
const { FakeAudioContext } = require('./helpers/fake-audio-context');

function setup(options) {
  const context = loadScripts('lib/lfo.js');
  const ctx = new FakeAudioContext();
  const lfo = new context.SynthBlocks.Lfo(ctx, options);
  const tick = () => [...context.__intervals.values()].pop()();
  return { lfo, ctx, context, tick };
}

test('oscillator and S&H source both feed the output and run', () => {
  const { lfo } = setup({ wave: 'sine', rate: 3 });
  assert.equal(lfo.osc.type, 'sine');
  assert.equal(lfo.osc.frequency.value, 3);
  assert.ok(lfo.osc.connections.includes(lfo.oscGate));
  assert.ok(lfo.oscGate.connections.includes(lfo.output));
  assert.ok(lfo.shSource.connections.includes(lfo.output));
  assert.equal(lfo.osc.started, 0);
  assert.equal(lfo.shSource.started, 0);
  assert.equal(lfo.oscGate.gain.value, 1);
  assert.equal(lfo.shSource.offset.value, 0);
});

test('samplehold mutes the oscillator and holds a random step', () => {
  const { lfo, context, tick } = setup({ wave: 'samplehold', rate: 4 });
  assert.equal(lfo.osc.type, 'sawtooth');
  assert.equal(lfo.oscGate.gain.value, 0);
  vm.runInContext('Math.random = () => 0.75;', context);
  tick();
  assert.equal(lfo.shSource.offset.value, 0.5);
});

test('the S&H clock draws no steps on continuous waves', () => {
  const { lfo, context, tick } = setup({ wave: 'triangle', rate: 4 });
  vm.runInContext('Math.random = () => 0.75;', context);
  tick();
  assert.equal(lfo.heldValue, 0);
  assert.equal(lfo.shSource.offset.value, 0);
});

test('setRate ramps the oscillator and restarts the S&H clock', () => {
  const { lfo, ctx, context } = setup({ wave: 'samplehold', rate: 4 });
  const before = [...context.__intervals.keys()];
  ctx.currentTime = 2;
  lfo.setRate(10);
  const ramp = lfo.osc.frequency.events.at(-1);
  assert.deepEqual([ramp.type, ramp.value, ramp.time], ['setTargetAtTime', 10, 2]);
  assert.equal(context.__intervals.size, 1);
  assert.notDeepEqual([...context.__intervals.keys()], before);
});

test('setWave leaving S&H reopens the gate and clears the step', () => {
  const { lfo, context, tick } = setup({ wave: 'samplehold', rate: 4 });
  vm.runInContext('Math.random = () => 0.1;', context);
  tick();
  lfo.setWave('square');
  assert.equal(lfo.osc.type, 'square');
  assert.equal(lfo.oscGate.gain.value, 1);
  assert.equal(lfo.shSource.offset.value, 0);
});
