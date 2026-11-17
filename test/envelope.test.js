const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { loadScripts } = require('./helpers/load-browser-script');
const { FakeAudioParam } = require('./helpers/fake-audio-context');

const { SynthBlocks } = loadScripts('lib/envelope.js');
const { Envelope } = SynthBlocks;

const types = (param) => param.events.map((e) => e.type);

describe('Envelope.trigger', () => {
  test('ramps every param from start to peak and on to the sustain level', () => {
    const env = new Envelope({ attack: 0.1, decay: 0.2, sustain: 0.25, release: 1 });
    const params = [new FakeAudioParam(), new FakeAudioParam()];
    env.trigger(params, 5, { start: 100, peak: 900 });
    for (const p of params) {
      assert.deepEqual(types(p), ['cancelScheduledValues', 'setValueAtTime', 'exponentialRampToValueAtTime', 'exponentialRampToValueAtTime']);
      assert.equal(p.events[1].value, 100);
      assert.deepEqual([p.events[2].value, p.events[2].time], [900, 5.1]);
      assert.equal(p.events[3].value, 100 + 800 * 0.25);
      assert.ok(Math.abs(p.events[3].time - 5.3) < 1e-9);
    }
  });

  test('sustain level is measured from base and clamped to range', () => {
    const env = new Envelope({ attack: 0.1, decay: 0.1, sustain: 0.5, release: 1 }, { range: [0.3, 0.45] });
    const p = new FakeAudioParam();
    env.trigger([p], 0, { start: 0.001, base: 0, peak: 1 });
    assert.equal(p.events.at(-1).value, 0.45);
    env.stages.sustain = 0.1;
    env.trigger([p], 1, { start: 0.001, base: 0, peak: 1 });
    assert.equal(p.events.at(-1).value, 0.3);
  });

  test('holdOnTrigger freezes the running value instead of dropping events', () => {
    const env = new Envelope({ attack: 0.1, decay: 0.1, sustain: 1, release: 1 }, { holdOnTrigger: true });
    const p = new FakeAudioParam();
    env.trigger([p], 2, { start: 0.001, peak: 1 });
    assert.deepEqual(p.events[0], { type: 'cancelAndHoldAtTime', time: 2 });
  });

  test('attack and decay never go below minStageTime', () => {
    const env = new Envelope({ attack: 0, decay: 0, sustain: 0.5, release: 1 }, { minStageTime: 0.01 });
    const p = new FakeAudioParam();
    env.trigger([p], 0, { start: 1, peak: 2 });
    assert.equal(p.events[2].time, 0.01);
    assert.equal(p.events[3].time, 0.02);
  });

  test('reads the live stages object on every trigger', () => {
    const stages = { attack: 0.1, decay: 0.1, sustain: 1, release: 1 };
    const env = new Envelope(stages);
    stages.attack = 0.5;
    const p = new FakeAudioParam();
    env.trigger([p], 0, { start: 1, peak: 2 });
    assert.equal(p.events[2].time, 0.5);
  });
});

describe('Envelope.release', () => {
  test('holds, then decays towards target with a third of the release time', () => {
    const env = new Envelope({ attack: 0.1, decay: 0.1, sustain: 1, release: 0.9 });
    const p = new FakeAudioParam();
    env.release([p], 4, 0);
    assert.deepEqual(types(p), ['cancelAndHoldAtTime', 'setTargetAtTime']);
    assert.equal(p.events[1].value, 0);
    assert.equal(p.events[1].time, 4);
    assert.ok(Math.abs(p.events[1].timeConstant - 0.3) < 1e-9);
  });

  test('releaseTime never goes below minReleaseTime', () => {
    const env = new Envelope({ attack: 0, decay: 0, sustain: 1, release: 0.001 }, { minReleaseTime: 0.008 });
    assert.equal(env.releaseTime, 0.008);
  });

  test('holdParam falls back to cancelScheduledValues without cancelAndHoldAtTime', () => {
    const p = new FakeAudioParam();
    p.cancelAndHoldAtTime = undefined;
    SynthBlocks.holdParam(p, 3);
    assert.deepEqual(p.events, [{ type: 'cancelScheduledValues', time: 3 }]);
  });
});
