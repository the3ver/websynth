const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadScripts } = require('./helpers/load-browser-script');

const ctx = loadScripts('fm-algorithms.js', 'worklets/fm-voice-processor.js');
const { FmVoiceCore, FmAlgorithms } = ctx;
const SR = 48000;
const N = 4800; // 100 ms

// Renders N samples with constant params; gains/freqs are { opNumber: value }
function render({ algorithm = 1, gains = {}, freqs = {}, feedback = 0, mix = 0, detune = 0 }, core = new FmVoiceCore(FmAlgorithms.ALGORITHMS, SR)) {
  const p = { freq: [null], gain: [null], detune: [detune], algorithm: [algorithm], feedback: [feedback], mix: [mix] };
  for (let n = 1; n <= 4; n++) {
    p.freq[n] = [freqs[n] ?? 440];
    p.gain[n] = [gains[n] ?? 0];
  }
  const out = new Float32Array(N);
  core.render(out, p);
  return out;
}

const peak = (buf) => buf.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
// Magnitude of one frequency (single DFT bin) relative to a full-scale sine
function level(buf, hz) {
  let re = 0;
  let im = 0;
  for (let i = 0; i < buf.length; i++) {
    const w = (2 * Math.PI * hz * i) / SR;
    re += buf[i] * Math.cos(w);
    im += buf[i] * Math.sin(w);
  }
  return (2 * Math.hypot(re, im)) / buf.length;
}

test('a lone carrier C on output X is a plain sine at its gain', () => {
  const out = render({ gains: { 1: 0.5 }, freqs: { 1: 1000 } });
  assert.ok(Math.abs(peak(out) - 0.5) < 1e-3);
  assert.ok(Math.abs(level(out, 1000) - 0.5) < 0.01);
});

test('modulator A adds sidebands around C', () => {
  const plain = render({ gains: { 1: 1 }, freqs: { 1: 1000, 2: 1000 } });
  const fm = render({ gains: { 1: 1, 2: 0.2 }, freqs: { 1: 1000, 2: 1000 } });
  assert.ok(level(plain, 2000) < 0.01);
  assert.ok(level(fm, 2000) > 0.1, `2nd harmonic ${level(fm, 2000)}`);
});

test('mix crossfades output X (C) and output Y (B1 in algorithm 2)', () => {
  const opts = { algorithm: 2, gains: { 1: 1, 3: 1 }, freqs: { 1: 1000, 3: 3000 } };
  const x = render({ ...opts, mix: 0 });
  const y = render({ ...opts, mix: 1 });
  const half = render({ ...opts, mix: 0.5 });
  assert.ok(level(x, 1000) > 0.95 && level(x, 3000) < 0.01);
  assert.ok(level(y, 3000) > 0.95 && level(y, 1000) < 0.01);
  assert.ok(Math.abs(level(half, 1000) - 0.5) < 0.02 && Math.abs(level(half, 3000) - 0.5) < 0.02);
});

test('two carriers on one output share it, so the sum stays at full scale', () => {
  // Algorithm 7: X = C + A, A also modulates C, so silence the modulation path with C alone first
  const out = render({ algorithm: 8, gains: { 1: 1, 4: 1 }, freqs: { 1: 1000, 4: 2000 } });
  assert.ok(Math.abs(level(out, 1000) - 0.5) < 0.02);
  assert.ok(Math.abs(level(out, 2000) - 0.5) < 0.02);
  assert.ok(peak(out) <= 1.0001);
});

test('feedback brightens only the feedback operator and stays bounded', () => {
  // Algorithm 8: B1 has feedback and is the only operator on Y
  const opts = { algorithm: 8, gains: { 3: 1 }, freqs: { 3: 500 }, mix: 1 };
  const clean = render(opts);
  const fb = render({ ...opts, feedback: 1 });
  assert.ok(level(clean, 1000) < 0.01);
  assert.ok(level(fb, 1000) > 0.1, `2nd harmonic ${level(fb, 1000)}`);
  assert.ok(peak(fb) <= 1.0001);
  assert.ok(!fb.some(Number.isNaN));
  // Feedback on B1 does not touch C on X
  const c = render({ algorithm: 8, gains: { 1: 1 }, freqs: { 1: 500 }, feedback: 1 });
  assert.ok(level(c, 1000) < 0.01);
});

test('vibrato detune shifts every operator', () => {
  const out = render({ gains: { 1: 1 }, freqs: { 1: 1000 }, detune: 1200 });
  assert.ok(level(out, 2000) > 0.95);
});

test('every algorithm renders bounded audio from all four operators at full level', () => {
  for (const alg of Object.keys(FmAlgorithms.ALGORITHMS).map(Number)) {
    for (const mix of [0, 0.5, 1]) {
      const out = render({ algorithm: alg, gains: { 1: 1, 2: 1, 3: 1, 4: 1 }, freqs: { 1: 220, 2: 440, 3: 660, 4: 880 }, feedback: 1, mix });
      assert.ok(peak(out) > 0.05 && peak(out) <= 1.0001, `alg ${alg} mix ${mix}: ${peak(out)}`);
      assert.ok(!out.some(Number.isNaN), `alg ${alg} NaN`);
    }
  }
});

test('a voice at rest renders silence without running the sines', () => {
  const core = new FmVoiceCore(FmAlgorithms.ALGORITHMS, SR);
  render({ gains: { 1: 1 }, freqs: { 1: 1000 } }, core);
  const out = render({}, core);
  assert.equal(peak(out), 0);
  assert.equal(core.silent, true);
});
