const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createLiveEngine } = require('./helpers/synth-engine');

test('FX chain runs voice bus -> chorus -> delay -> reverb -> master bus', () => {
  const { engine } = createLiveEngine();
  const { chorus, delay, reverb } = engine.fxChain;
  assert.ok(engine.masterVoiceBus.connections.includes(chorus.input));
  assert.ok(chorus.input.connections.includes(chorus.dryGain));
  assert.ok(chorus.output.connections.includes(delay.input));
  assert.ok(delay.output.connections.includes(reverb.input));
  assert.ok(reverb.dryGain.connections.includes(reverb.output));
  assert.ok(reverb.wetGain.connections.includes(reverb.output));
  assert.ok(reverb.output.connections.includes(engine.master.input));
});

test('every effect splits its input into a dry and a wet path', () => {
  const { engine } = createLiveEngine();
  const { chorus, delay, reverb } = engine.fxChain;
  for (const fx of [chorus, delay]) {
    assert.ok(fx.input.connections.includes(fx.dryGain));
    assert.ok(fx.input.connections.includes(fx.delayL));
    assert.ok(fx.input.connections.includes(fx.delayR));
    assert.ok(fx.dryGain.connections.includes(fx.output));
    assert.ok(fx.wetGain.connections.includes(fx.output));
  }
  assert.ok(reverb.input.connections.includes(reverb.convolver));
  assert.ok(reverb.convolver.connections.includes(reverb.wetGain));
});

test('chorus modes set wet level, LFO rate and counter-phase depth', () => {
  const { engine } = createLiveEngine();
  const { chorus } = engine.fxChain;
  engine.setChorusMix(0.6);
  engine.setChorusMode('II');
  assert.equal(chorus.wetGain.gain.value, 0.6);
  assert.equal(chorus.lfo.frequency.value, 0.85);
  assert.equal(chorus.lfoGainL.gain.value, 0.0045);
  assert.equal(chorus.lfoGainR.gain.value, -0.0045);

  engine.setChorusMode('off');
  assert.equal(chorus.wetGain.gain.value, 0);
  assert.equal(chorus.lfo.frequency.value, 0.5);
  assert.equal(chorus.lfoGainL.gain.value, 0.0035);
});

test('chorus mix does not open the wet path while chorus is off', () => {
  const { engine } = createLiveEngine();
  engine.setChorusMode('off');
  engine.setChorusMix(0.9);
  assert.equal(engine.fxChain.chorus.wetGain.gain.value, 0);
  assert.equal(engine.fx.chorus.mix, 0.9);
});

test('delay keeps the 4:3 stereo ratio and clamps feedback', () => {
  const { engine } = createLiveEngine();
  const { delay } = engine.fxChain;
  engine.setDelayTime(0.3);
  assert.equal(delay.delayL.delayTime.value, 0.3);
  assert.ok(Math.abs(delay.delayR.delayTime.value - 0.3 * 1.333) < 1e-12);
  engine.setDelayFeedback(5);
  assert.equal(delay.feedbackGainL.gain.value, 0.9);
  assert.equal(delay.feedbackGainR.gain.value, 0.9);
});

test('reverb decay regenerates a stereo impulse of matching length', () => {
  const { engine, ctx } = createLiveEngine();
  engine.setReverbDecay(2);
  const buffer = engine.fxChain.reverb.convolver.buffer;
  assert.equal(buffer.numberOfChannels, 2);
  assert.equal(buffer.length, 2 * ctx.sampleRate);
});

test('activeEffects: an effect counts as on only when it is audible', () => {
  const { context } = createLiveEngine();
  const fx = (mode, cMix, dMix, rMix) => ({ chorus: { mode, mix: cMix }, delay: { mix: dMix }, reverb: { mix: rMix } });
  const plain = (v) => JSON.parse(JSON.stringify(v));
  assert.deepEqual(plain(context.FXChain.activeEffects(fx('off', 0.6, 0, 0))), { chorus: false, delay: false, reverb: false });
  assert.deepEqual(plain(context.FXChain.activeEffects(fx('I', 0.6, 0.2, 0))), { chorus: true, delay: true, reverb: false });
  assert.deepEqual(plain(context.FXChain.activeEffects(fx('II', 0, 0, 0.1))), { chorus: false, delay: false, reverb: true });
});
