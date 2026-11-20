const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadScripts } = require('./helpers/load-browser-script');

const { EnvelopeDisplay } = loadScripts('envelope-display.js');
const RANGES = { attack: [0.001, 4], decay: [0.001, 6], release: [0.005, 8] };
const points = (d) => d.match(/-?\d+(\.\d+)?/g).map(Number);

test('the shape starts at the bottom, peaks after the attack and holds the sustain level', () => {
  const p = points(EnvelopeDisplay.path({ attack: 0.01, decay: 0.3, sustain: 0.5, release: 0.5 }, RANGES));
  // M0 38  L xA 2  Q xA lvl xD lvl  L xS lvl  Q xS 38 xR 38
  assert.deepEqual(p.slice(0, 2), [0, 38]);
  assert.equal(p[3], 2, 'peak at the top');
  assert.equal(p[7], 20, 'sustain 50% halfway between top and bottom');
  assert.equal(p[9], 20);
  assert.equal(p[p.length - 1], 38, 'release ends at the bottom');
});

test('longer stages draw wider, within the display', () => {
  const short = points(EnvelopeDisplay.path({ attack: 0.001, decay: 0.001, sustain: 1, release: 0.005 }, RANGES));
  const long = points(EnvelopeDisplay.path({ attack: 4, decay: 6, sustain: 0, release: 8 }, RANGES));
  assert.ok(short[2] > 0, 'a 1 ms attack still slopes');
  assert.ok(long[2] > short[2] * 10);
  assert.ok(long[long.length - 2] <= 200, 'release end inside the 200 wide view box');
  assert.equal(long[7], 38, 'sustain 0 at the bottom');
});

test('stage widths follow the fader scale (logarithmic) and clamp outside the range', () => {
  const w = (t) => EnvelopeDisplay.stageWidth(t, [0.001, 4]);
  assert.ok(Math.abs((w(0.063) - w(0.001)) - (w(4) - w(0.063))) < 1, 'geometric middle in the middle');
  assert.equal(w(100), w(4));
  assert.equal(w(0), w(0.001));
});
