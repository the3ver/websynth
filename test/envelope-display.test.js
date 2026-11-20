const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadScripts } = require('./helpers/load-browser-script');

const { EnvelopeDisplay } = loadScripts('envelope-display.js');
const RANGES = { attack: [0.001, 4], decay: [0.001, 6], release: [0.005, 8] };
const points = (d) => d.match(/-?\d+(\.\d+)?/g).map(Number);

test('the shape starts at the bottom, peaks after the attack and holds the sustain level', () => {
  const p = points(EnvelopeDisplay.path({ attack: 0.01, decay: 0.3, sustain: 0.5, release: 0.5 }, RANGES));
  // M2 38  L xA 2  Q xA lvl xD lvl  L xS lvl  Q xS 38 xR 38
  assert.deepEqual(p.slice(0, 2), [2, 38]);
  assert.equal(p[3], 2, 'peak at the top');
  assert.equal(p[7], 20, 'sustain 50% halfway between top and bottom');
  assert.equal(p[9], 20);
  assert.equal(p[p.length - 1], 38, 'release ends at the bottom');
});

test('a longer stage takes a larger share of the width', () => {
  const others = { decay: 0.3, sustain: 0.5, release: 0.5 };
  const short = points(EnvelopeDisplay.path({ attack: 0.001, ...others }, RANGES));
  const long = points(EnvelopeDisplay.path({ attack: 4, ...others }, RANGES));
  assert.ok(short[2] > 2, 'a 1 ms attack still slopes');
  assert.ok(long[2] - 2 > (short[2] - 2) * 5, `attack end ${short[2]} -> ${long[2]}`);
  const zero = points(EnvelopeDisplay.path({ attack: 4, decay: 6, sustain: 0, release: 8 }, RANGES));
  assert.equal(zero[7], 38, 'sustain 0 at the bottom');
});

test('stage widths follow the fader scale (logarithmic) and clamp outside the range', () => {
  const w = (t) => EnvelopeDisplay.stageWidth(t, [0.001, 4]);
  assert.ok(Math.abs((w(0.063) - w(0.001)) - (w(4) - w(0.063))) < 1, 'geometric middle in the middle');
  assert.equal(w(100), w(4));
  assert.equal(w(0), w(0.001));
});

test('a looping envelope draws two peaks and stays inside the display', () => {
  const stages = { attack: 4, decay: 6, sustain: 0.5, release: 8, loop: true };
  const p = points(EnvelopeDisplay.path(stages, RANGES));
  const peaks = p.filter((v, i) => i % 2 === 1 && v === 2);
  assert.equal(peaks.length, 2);
  assert.ok(Math.max(...p.filter((v, i) => i % 2 === 0)) <= 200);
});

test('every shape spans the full display width, short or long, looping or not', () => {
  for (const stages of [
    { attack: 0.001, decay: 0.001, sustain: 1, release: 0.005 },
    { attack: 4, decay: 6, sustain: 0, release: 8 },
    { attack: 0.02, decay: 0.3, sustain: 0.4, release: 0.5, loop: true }
  ]) {
    const p = points(EnvelopeDisplay.path(stages, RANGES));
    const xs = p.filter((v, i) => i % 2 === 0);
    assert.equal(Math.min(...xs), 2, 'starts at the left edge');
    assert.equal(p[p.length - 2], 198, 'release ends at the right edge');
  }
});
