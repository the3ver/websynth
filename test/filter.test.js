const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadScripts } = require('./helpers/load-browser-script');
const { FakeAudioContext } = require('./helpers/fake-audio-context');

const { SynthBlocks } = loadScripts('lib/filter.js');
const { Filter } = SynthBlocks;

test('two cascaded stages: input is stage 1, output is stage 2', () => {
  const filter = new Filter(new FakeAudioContext());
  assert.equal(filter.input, filter.stage1);
  assert.equal(filter.output, filter.stage2);
  assert.ok(filter.stage1.connections.includes(filter.stage2));
  assert.deepEqual(Array.from(filter.frequencyParams), [filter.stage1.frequency, filter.stage2.frequency]);
  assert.deepEqual(Array.from(filter.detuneParams), [filter.stage1.detune, filter.stage2.detune]);
});

test('configure schedules type, cutoff and Q at the given time', () => {
  const filter = new Filter(new FakeAudioContext());
  filter.configure('bandpass', 10, 500, 3);
  assert.deepEqual([filter.stage1.type, filter.stage2.type], ['bandpass', 'bandpass']);
  for (const stage of [filter.stage1, filter.stage2]) {
    assert.deepEqual(stage.frequency.events.at(-1), { type: 'setValueAtTime', value: 500, time: 3, timeConstant: undefined });
    assert.equal(stage.Q.events.at(-1).time, 3);
    assert.ok(Math.abs(stage.Q.value - 4.2) < 1e-9);
  }
});

test('configure defaults to the current context time', () => {
  const ctx = new FakeAudioContext();
  ctx.currentTime = 7;
  const filter = new Filter(ctx);
  filter.configure('lowpass24', 0, 1000);
  assert.equal(filter.stage1.frequency.events.at(-1).time, 7);
});

test('lists the supported modes', () => {
  assert.deepEqual(Array.from(Filter.MODES), ['lowpass24', 'lowpass12', 'bandpass', 'highpass']);
});
