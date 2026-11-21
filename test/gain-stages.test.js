const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { loadScripts } = require('./helpers/load-browser-script');
const { FakeAudioContext } = require('./helpers/fake-audio-context');

const { SynthBlocks } = loadScripts('lib/curves.js', 'lib/envelope.js', 'lib/gain-stages.js');

describe('Mixer', () => {
  test('one gain per channel at its level, all summed into the output', () => {
    const mixer = new SynthBlocks.Mixer(new FakeAudioContext(), { a: 0.5, b: 0.25 });
    assert.deepEqual(Object.keys(mixer.channels), ['a', 'b']);
    assert.equal(mixer.input('a').gain.value, 0.5);
    for (const channel of Object.values(mixer.channels)) assert.ok(channel.connections.includes(mixer.output));
  });

  test('setLevel ramps, setLevelsAt jumps to scaled levels', () => {
    const mixer = new SynthBlocks.Mixer(new FakeAudioContext(), { a: 0.5, b: 0.25 });
    mixer.setLevel('a', 0.9, 2);
    assert.deepEqual(mixer.channels.a.gain.events.at(-1), {
      type: 'setTargetAtTime',
      value: 0.9,
      time: 2,
      timeConstant: 0.015
    });
    mixer.setLevelsAt({ a: 0.8, b: 0.4 }, 0.5, 3);
    assert.equal(mixer.channels.a.gain.value, 0.4);
    assert.equal(mixer.channels.b.gain.value, 0.2);
    assert.equal(mixer.channels.b.gain.events.at(-2).type, 'cancelScheduledValues');
  });
});

describe('Drive', () => {
  test('2x-oversampled shaper with the drive curve', () => {
    const drive = new SynthBlocks.Drive(new FakeAudioContext(), 0.4);
    assert.equal(drive.input, drive.output);
    assert.equal(drive.shaper.oversample, '2x');
    assert.deepEqual(Array.from(drive.shaper.curve), Array.from(SynthBlocks.driveCurve(0.4)));
  });

  test('setAmount computes the curve or takes a shared one', () => {
    const drive = new SynthBlocks.Drive(new FakeAudioContext());
    drive.setAmount(0.9);
    assert.deepEqual(Array.from(drive.shaper.curve), Array.from(SynthBlocks.driveCurve(0.9)));
    const shared = SynthBlocks.driveCurve(0.2);
    drive.setAmount(0.2, shared);
    assert.equal(drive.shaper.curve, shared);
  });
});

describe('Vca', () => {
  test('silent amp gain into a unity tremolo gain', () => {
    const vca = new SynthBlocks.Vca(new FakeAudioContext());
    assert.equal(vca.gain.value, 0);
    assert.equal(vca.tremoloGain.value, 1);
    assert.ok(vca.input.connections.includes(vca.output));
  });

  test('choke holds and fades the amp gain in 2 ms', () => {
    const vca = new SynthBlocks.Vca(new FakeAudioContext());
    vca.choke(5);
    assert.deepEqual(
      vca.gain.events.slice(-2).map((e) => [e.type, e.value, e.time, e.timeConstant]),
      [
        ['cancelAndHoldAtTime', undefined, 5, undefined],
        ['setTargetAtTime', 0, 5, 0.002]
      ]
    );
  });
});
