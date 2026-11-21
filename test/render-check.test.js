/**
 * scripts/render-check.js: click, peak, NaN and silence detection on synthetic renders (the browser part runs
 * with npm run render).
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { measure, findings, LIMITS, engineScripts } = require('../scripts/render-check');

const RATE = 48000;
const ON = 4800; // note on at 0.1 s
const OFF = 24000; // note off at 0.5 s
const LATENCY = 480;

/** One channel: 220 Hz sine from ON + LATENCY with the given gain curve gain(i) (i = frames since the note sounds). */
function render(gain, length = 36000) {
  const data = new Float32Array(length);
  for (let i = ON + LATENCY; i < length; i++) {
    const n = i - ON - LATENCY;
    data[i] = 0.8 * gain(n) * Math.sin((2 * Math.PI * 220 * n) / RATE + 1);
  }
  return data;
}

const attack = (frames) => (n) => Math.min(1, 1e-5 * Math.pow(1e5, n / frames));
const releaseAt = OFF - ON;
const smooth = (n) => (n < releaseAt ? attack(240)(n) : Math.exp(-(n - releaseAt) / 2400));
const hardGate = (n) => (n < releaseAt ? 1 : Math.exp(-(n - releaseAt) / 2400));
const hardCut = (n) => (n < releaseAt ? attack(240)(n) : 0);

test('a smooth attack and release passes; onset reports when the note sounds', () => {
  const m = measure([render(smooth), render(smooth)], ON, OFF, LATENCY, RATE);
  assert.equal(m.onset, LATENCY);
  assert.equal(m.nan, 0);
  assert.deepEqual(findings('t', m), []);
});

test('a hard gate at note on is a click', () => {
  const f = findings('t', measure([render(hardGate)], ON, OFF, LATENCY, RATE));
  assert.equal(f.length, 1);
  assert.match(f[0], /^t: click at note on, step 0\.\d{4} > 0\.01$/);
});

test('a hard cut at note off is a click', () => {
  const f = findings('t', measure([render(hardCut)], ON, OFF, LATENCY, RATE));
  assert.equal(f.length, 1);
  assert.match(f[0], /^t: click at note off, step 0\.\d{4} > 0\.\d{4} \(held 0\.\d{4}\)$/);
});

test('peak at the limit, NaN samples and silence are findings', () => {
  const loud = render(smooth);
  loud[10000] = 0.98;
  assert.match(findings('t', measure([loud], ON, OFF, LATENCY, RATE)).join(), /peak 0\.9800 >= 0\.98/);

  const broken = render(smooth);
  broken[9000] = NaN;
  broken[9001] = NaN;
  assert.match(findings('t', measure([broken], ON, OFF, LATENCY, RATE)).join(), /2 NaN samples/);

  const quiet = render((n) => smooth(n) * 1e-4);
  assert.match(findings('t', measure([quiet], ON, OFF, LATENCY, RATE)).join(), /silent, peak 8\.\d+e-5 < 0\.001/);
});

test('a slow onset does not move the windows: a hard cut after a slow attack is still a click', () => {
  const slowCut = (n) => (n < releaseAt ? Math.min(1, (n / 18000) ** 6) : 0); // silent for ~2000 frames
  const m = measure([render(slowCut)], ON, OFF, LATENCY, RATE);
  assert.ok(m.onset > LATENCY + 1500, `onset ${m.onset} well after the attack began`);
  assert.match(findings('t', m).join(), /click at note off/);
});

test('an unscheduled change up to 128 frames early still falls into the windows', () => {
  const early = (n) => (n < releaseAt - 128 ? 1 : 0);
  assert.match(findings('t', measure([render(early)], ON, OFF, LATENCY, RATE)).join(), /click at note off/);
});

test('limits stay strict enough to catch the clicks they were calibrated on', () => {
  assert.equal(LIMITS.peak, 0.98, 'safety clipper ceiling');
  assert.ok(LIMITS.onJump <= 0.029, 'weakest hard gate step of the factory presets');
  assert.ok(LIMITS.offRatio <= 1.5, 'weakest caught hard cut ratio of the factory presets is 1.57');
});

test('the render page loads the engine scripts of index.html, without UI and app', () => {
  const scripts = engineScripts();
  assert.equal(scripts[0], 'js/lib/curves.js');
  assert.equal(scripts.at(-1), 'js/synth-registry.js');
  for (const s of ['js/audio-engine.js', 'js/fm-engine.js', 'js/presets.js', 'js/fm-presets.js'])
    assert.ok(scripts.includes(s), s);
  for (const s of ['js/app.js', 'js/drum-ui.js', 'js/pwa-manager.js']) assert.ok(!scripts.includes(s), s);
});
