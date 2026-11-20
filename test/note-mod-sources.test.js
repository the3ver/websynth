const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadScripts } = require('./helpers/load-browser-script');
const { FakeAudioContext } = require('./helpers/fake-audio-context');

const context = loadScripts('lib/envelope.js', 'lib/note-mod-sources.js');
const { SynthBlocks } = context;

function setup(loop) {
  const ctx = new FakeAudioContext();
  const modEnv = { attack: 0.1, decay: 0.15, sustain: 0.2, release: 0.3, loop };
  const sources = new SynthBlocks.NoteModSources(ctx, { modEnv });
  return { ctx, modEnv, sources, offset: sources.nodes.modEnv.offset };
}
const ramps = (param) => param.events.filter((e) => e.type === 'exponentialRampToValueAtTime');

test('without loop the envelope holds its sustain level', () => {
  const { sources, offset } = setup(false);
  sources.trigger(60, 1, 0);
  assert.equal(ramps(offset).length, 2);
  assert.equal(context.__timeouts.size, 0, 'no refill timer');
});

test('a looping envelope cycles peak and sustain level 2 s ahead, then refills while held', () => {
  const { ctx, sources, offset } = setup(true);
  sources.trigger(60, 1, 0);
  const first = ramps(offset);
  // 0.25 s per cycle: 8 cycles cover the 2 s horizon
  assert.equal(first.length, 16);
  const near = (a, b) => Math.abs(a - b) < 0.001;
  first.slice(0, 4).forEach((e, i) => assert.ok(near(e.value, i % 2 ? 0.2 : 1), `ramp ${i}: ${e.value}`));
  assert.ok(Math.abs(first[3].time - 0.5) < 1e-9);
  assert.ok(first[first.length - 1].time >= 2);

  ctx.currentTime = 1.2;
  const [id, refill] = Array.from(context.__timeouts).pop();
  context.__timeouts.delete(id);
  refill();
  const after = ramps(offset);
  assert.ok(after.length > first.length, 'more cycles');
  assert.ok(after[after.length - 1].time >= 3.2);
  assert.ok(after[first.length].time > first[first.length - 1].time, 'continues where the last cycle ended');
});

test('release stops the loop and falls to 0', () => {
  const { ctx, sources, offset } = setup(true);
  context.__timeouts.clear();
  sources.trigger(60, 1, 0);
  assert.equal(context.__timeouts.size, 1);
  ctx.currentTime = 0.7;
  sources.release(0.7);
  assert.equal(context.__timeouts.size, 0, 'refill timer cleared');
  assert.equal(offset.lastValue('setTargetAtTime'), 0);
});
