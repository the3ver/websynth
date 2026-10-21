const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadScriptsWith } = require('./helpers/load-browser-script');

const { Visualizer } = loadScriptsWith({
  requestAnimationFrame: () => 0,
  performance: { now: () => 0 }
}, 'visualizer.js');

function fakeElement() {
  const classes = new Set();
  return {
    style: {},
    classList: {
      add: (c) => classes.add(c),
      remove: (c) => classes.delete(c),
      contains: (c) => classes.has(c)
    }
  };
}

function setup() {
  const calls = [];
  const ctx2d = new Proxy({}, {
    get: (target, prop) => (prop in target ? target[prop] : (...args) => calls.push(prop)),
    set: (target, prop, value) => { target[prop] = value; return true; }
  });
  const leds = Array.from({ length: 8 }, fakeElement);
  const vuMeter = (list) => ({ querySelectorAll: () => list });
  const engine = {
    isPowered: true,
    activeVoices: { size: 1 },
    signal: 60,
    analyser: { getByteTimeDomainData(a) { for (let i = 0; i < a.length; i++) a[i] = 128 + Math.round(engine.signal * Math.sin(i / 8)); } }
  };
  const elements = {
    canvas: { width: 360, height: 120, getContext: () => ctx2d },
    lfoRateLed: fakeElement(),
    wooferLeft: fakeElement(),
    wooferRight: fakeElement(),
    vuMeterL: vuMeter(leds),
    vuMeterR: vuMeter(Array.from({ length: 8 }, fakeElement))
  };
  const vis = new Visualizer(engine, elements, () => 2);
  return { vis, engine, elements, leds, calls };
}

test('a sounding frame draws the waveform, lights the VU meter and moves the woofers', () => {
  const { vis, elements, leds, calls } = setup();
  vis.start();
  assert.ok(vis.readRms() > 40);
  assert.ok(calls.filter((c) => c === 'lineTo').length >= 255, 'waveform path');
  assert.equal(leds.filter((l) => l.classList.contains('lit')).length, 8);
  assert.equal(elements.wooferLeft.style.transform, 'scale(1.08)');
});

test('after 15 silent frames the visualizer goes idle once and resets meters', () => {
  const { vis, engine, elements, leds, calls } = setup();
  vis.start();
  engine.activeVoices.size = 0;
  engine.signal = 0;

  for (let i = 0; i < 15; i++) vis.tick();
  assert.equal(vis.isIdle, false);

  vis.tick();
  assert.equal(vis.isIdle, true);
  assert.equal(elements.wooferLeft.style.transform, 'scale(1)');
  assert.equal(leds.filter((l) => l.classList.contains('lit')).length, 0);

  const drawCalls = calls.length;
  vis.tick();
  vis.tick();
  assert.equal(calls.length, drawCalls, 'no drawing while idle');
});

test('sound after idle resumes drawing', () => {
  const { vis, engine, calls } = setup();
  vis.start();
  engine.activeVoices.size = 0;
  engine.signal = 0;
  for (let i = 0; i < 16; i++) vis.tick();
  const drawCalls = calls.length;

  engine.signal = 60;
  vis.tick();
  assert.equal(vis.isIdle, false);
  assert.ok(calls.length > drawCalls);
});
