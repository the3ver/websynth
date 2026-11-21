const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { loadScripts } = require('./helpers/load-browser-script');
const { FakeAudioContext } = require('./helpers/fake-audio-context');

const { SynthBlocks } = loadScripts('lib/curves.js');

const peakOf = (data) => data.reduce((m, v) => Math.max(m, Math.abs(v)), 0);

describe('driveCurve', () => {
  test('returns a linear identity curve for amount 0', () => {
    const curve = SynthBlocks.driveCurve(0);
    assert.equal(curve.length, 512);
    assert.equal(curve[0], -1);
    assert.equal(curve[511], 1);
    assert.ok(Math.abs(curve[255] - ((255 * 2) / 511 - 1)) < 1e-6);
  });

  test('is normalized to +-1 at the edges for any drive amount', () => {
    for (const amount of [0.1, 0.5, 1]) {
      const curve = SynthBlocks.driveCurve(amount);
      assert.ok(Math.abs(curve[0] + 1) < 1e-6, `amount ${amount} low edge`);
      assert.ok(Math.abs(curve[511] - 1) < 1e-6, `amount ${amount} high edge`);
    }
  });

  test('is monotonic and odd-symmetric', () => {
    const curve = SynthBlocks.driveCurve(0.7);
    for (let i = 1; i < curve.length; i++) {
      assert.ok(curve[i] > curve[i - 1], `not increasing at ${i}`);
    }
    for (let i = 0; i < curve.length; i++) {
      assert.ok(Math.abs(curve[i] + curve[curve.length - 1 - i]) < 1e-6, `not symmetric at ${i}`);
    }
  });

  test('amount maps onto a tanh gain of 1 + 4 * amount', () => {
    assert.deepEqual(Array.from(SynthBlocks.driveCurve(0.5)), Array.from(SynthBlocks.tanhCurve(3)));
  });
});

describe('tanhCurve', () => {
  test('n samples, normalized to +-1, odd-symmetric', () => {
    for (const gain of [1.5, 3]) {
      const curve = SynthBlocks.tanhCurve(gain, 256);
      assert.equal(curve.length, 256);
      assert.ok(Math.abs(curve[0] + 1) < 1e-6);
      assert.ok(Math.abs(curve[255] - 1) < 1e-6);
      const x = (100 * 2) / 255 - 1;
      assert.ok(Math.abs(curve[100] - Math.tanh(gain * x) / Math.tanh(gain)) < 1e-6);
      assert.ok(Math.abs(curve[100] + curve[155]) < 1e-6);
    }
  });
});

describe('pwmComparatorCurve', () => {
  test('is a steep tanh(40x) over 2048 samples', () => {
    const curve = SynthBlocks.pwmComparatorCurve();
    assert.equal(curve.length, 2048);
    for (const i of [0, 700, 1023, 1024, 1500, 2047]) {
      const x = (i * 2) / 2047 - 1;
      assert.ok(Math.abs(curve[i] - Math.tanh(40 * x)) < 1e-6, `sample ${i}`);
    }
  });
});

describe('safetyClipCurve', () => {
  test('covers -2..+2: unity below 0.8, symmetric knee below 0.98', () => {
    const curve = SynthBlocks.safetyClipCurve();
    assert.equal(curve.length, 4096);
    const at = (x) => curve[Math.round(((x + 2) / 4) * 4095)];
    for (const x of [0, 0.3, 0.75]) assert.ok(Math.abs(at(x) - x) < 0.002, `x=${x}`);
    for (const x of [1, 1.5, 2]) {
      assert.ok(at(x) < 0.98 && at(x) > 0.9, `x=${x}`);
      assert.ok(Math.abs(at(-x) + at(x)) < 1e-6, `symmetric at ${x}`);
    }
  });
});

describe('whiteNoiseBuffer', () => {
  test('mono buffer of the given length, bounded by peak', () => {
    const ctx = new FakeAudioContext();
    const buffer = SynthBlocks.whiteNoiseBuffer(ctx, 1, 0.25);
    assert.equal(buffer.numberOfChannels, 1);
    assert.equal(buffer.length, ctx.sampleRate);
    const peak = peakOf(buffer.getChannelData(0));
    assert.ok(peak <= 0.25 && peak > 0.2, `peak ${peak}`);
  });
});
