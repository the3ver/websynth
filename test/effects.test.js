const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadScripts } = require('./helpers/load-browser-script');
const { FakeAudioContext } = require('./helpers/fake-audio-context');

const { SynthBlocks } = loadScripts('lib/effects.js');

test('effects work standalone: input and output nodes, settings read live', () => {
  const ctx = new FakeAudioContext();
  const settings = { mode: 'I', mix: 0.5 };
  const chorus = new SynthBlocks.Chorus(ctx, settings);
  assert.equal(chorus.wetGain.gain.value, 0.5);
  settings.mode = 'II';
  chorus.applyMode();
  assert.equal(chorus.lfo.frequency.value, 0.85);
  assert.equal(chorus.lfo.started, 0);
});

test('chorus starts muted when its mode is off', () => {
  const chorus = new SynthBlocks.Chorus(new FakeAudioContext(), { mode: 'off', mix: 0.7 });
  assert.equal(chorus.wetGain.gain.value, 0);
});

test('delay lines feed back through a 2.8 kHz high-cut', () => {
  const delay = new SynthBlocks.Delay(new FakeAudioContext(), { time: 0.5, feedback: 0.3, mix: 0.2 });
  for (const side of ['L', 'R']) {
    assert.ok(delay[`delay${side}`].connections.includes(delay[`filter${side}`]));
    assert.ok(delay[`filter${side}`].connections.includes(delay[`feedbackGain${side}`]));
    assert.ok(delay[`feedbackGain${side}`].connections.includes(delay[`delay${side}`]));
    assert.equal(delay[`filter${side}`].frequency.value, 2800);
  }
  assert.ok(Math.abs(delay.delayR.delayTime.value - 0.5 * 1.333) < 1e-12);
});

test('reverb impulse length is clamped to 0.5..8 s and decays', () => {
  const ctx = new FakeAudioContext();
  const settings = { decay: 0.2, mix: 0.3 };
  const reverb = new SynthBlocks.Reverb(ctx, settings);
  assert.equal(reverb.convolver.buffer.length, 0.5 * ctx.sampleRate);
  settings.decay = 10;
  reverb.applyDecay();
  const data = reverb.convolver.buffer.getChannelData(0);
  assert.equal(data.length, 8 * ctx.sampleRate);
  const peak = (from, to) => data.slice(from, to).reduce((m, v) => Math.max(m, Math.abs(v)), 0);
  assert.ok(peak(data.length - 1000, data.length) < peak(0, 1000));
});

test('crusher crossfades dry and wet and waits for its worklet node', () => {
  const ctx = new FakeAudioContext();
  const settings = { bits: 6, rate: 8000, mix: 0.4 };
  const crusher = new SynthBlocks.Crusher(ctx, settings);
  assert.equal(crusher.dryGain.gain.value, 0.6);
  assert.equal(crusher.wetGain.gain.value, 0.4);
  assert.ok(crusher.input.connections.includes(crusher.dryGain));
  crusher.applyBits(); // no node yet: nothing to do, no throw

  const param = () => ({
    value: null,
    setTargetAtTime(v) {
      this.value = v;
    }
  });
  const node = {
    parameters: new Map([
      ['bits', param()],
      ['rate', param()]
    ]),
    connections: [],
    connect(t) {
      this.connections.push(t);
    }
  };
  crusher.attach(node);
  assert.ok(node.connections.includes(crusher.wetGain));
  assert.ok(crusher.input.connections.includes(node), 'mix > 0 feeds the node right away');
  assert.equal(node.parameters.get('bits').value, 6);
  assert.equal(node.parameters.get('rate').value, 8000);
});
