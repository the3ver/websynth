const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadScripts } = require('./helpers/load-browser-script');
const { FakeAudioContext } = require('./helpers/fake-audio-context');

function setup(wave) {
  const context = loadScripts('lib/curves.js', 'lib/vco.js');
  const vco = new context.SynthBlocks.Vco(new FakeAudioContext(), { wave });
  return { vco, context };
}

const plugged = (vco) => vco.pwShaper.connections.includes(vco.pulseGain);

test('non-square waves play on the direct path with the comparator unplugged', () => {
  const { vco } = setup('triangle');
  assert.equal(vco.osc.type, 'triangle');
  assert.equal(vco.directGain.gain.value, 1);
  assert.equal(vco.pulseGain.gain.value, 0);
  assert.equal(plugged(vco), false);
  assert.equal(vco.pwPlugged, false);
});

test('square runs a sawtooth into the plugged comparator', () => {
  const { vco } = setup('square');
  assert.equal(vco.osc.type, 'sawtooth');
  assert.equal(vco.directGain.gain.value, 0);
  assert.equal(vco.pulseGain.gain.value, 1);
  assert.equal(plugged(vco), true);
  assert.ok(vco.pwInput.connections.includes(vco.pwShaper));
});

test('frequency and detune are the oscillator params', () => {
  const { vco } = setup('sawtooth');
  assert.equal(vco.frequency, vco.osc.frequency);
  assert.equal(vco.detune, vco.osc.detune);
  assert.equal(vco.frequency.value, 440);
});

test('connect feeds both paths into the destination, start starts the oscillator', () => {
  const { vco } = setup('sawtooth');
  const dest = new FakeAudioContext().createGain();
  vco.connect(dest);
  assert.ok(vco.directGain.connections.includes(dest));
  assert.ok(vco.pulseGain.connections.includes(dest));
  vco.start(0);
  assert.equal(vco.osc.started, 0);
});

test('setWave away from square unplugs the comparator after the fade', () => {
  const { vco, context } = setup('square');
  vco.setWave('sine', 1);
  assert.equal(vco.osc.type, 'sine');
  assert.equal(plugged(vco), true, 'still plugged while the pulse gain fades');
  for (const cb of Array.from(context.__timeouts.values())) cb();
  assert.equal(plugged(vco), false);
});

test('switching back to square cancels a pending unplug', () => {
  const { vco, context } = setup('square');
  vco.setWave('sawtooth', 1);
  const pending = Array.from(context.__timeouts.values());
  vco.setWave('square', 1.01);
  assert.equal(context.__timeouts.size, 0);
  assert.equal(plugged(vco), true);
  assert.equal(pending.length, 1);
});
