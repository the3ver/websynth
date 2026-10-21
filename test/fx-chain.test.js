const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createLiveEngine } = require('./helpers/synth-engine');

test('FX chain sits between the voice bus and the analyser', () => {
  const { engine } = createLiveEngine();
  const fx = engine.fxChain;
  assert.ok(engine.masterVoiceBus.connections.includes(fx.chorusDryGain));
  assert.ok(fx.reverbDryGain.connections.includes(engine.analyser));
  assert.ok(fx.reverbWetGain.connections.includes(engine.analyser));
});

test('chorus modes set wet level, LFO rate and counter-phase depth', () => {
  const { engine } = createLiveEngine();
  const fx = engine.fxChain;
  engine.setChorusMix(0.6);
  engine.setChorusMode('II');
  assert.equal(fx.chorusWetGain.gain.value, 0.6);
  assert.equal(fx.chorusLfo.frequency.value, 0.85);
  assert.equal(fx.chorusLfoGainL.gain.value, 0.0045);
  assert.equal(fx.chorusLfoGainR.gain.value, -0.0045);

  engine.setChorusMode('off');
  assert.equal(fx.chorusWetGain.gain.value, 0);
});

test('chorus mix does not open the wet path while chorus is off', () => {
  const { engine } = createLiveEngine();
  engine.setChorusMode('off');
  engine.setChorusMix(0.9);
  assert.equal(engine.fxChain.chorusWetGain.gain.value, 0);
  assert.equal(engine.fx.chorus.mix, 0.9);
});

test('delay keeps the 4:3 stereo ratio and clamps feedback', () => {
  const { engine } = createLiveEngine();
  const fx = engine.fxChain;
  engine.setDelayTime(0.3);
  assert.equal(fx.delayL.delayTime.value, 0.3);
  assert.ok(Math.abs(fx.delayR.delayTime.value - 0.3 * 1.333) < 1e-12);
  engine.setDelayFeedback(5);
  assert.equal(fx.delayFeedbackGainL.gain.value, 0.9);
  assert.equal(fx.delayFeedbackGainR.gain.value, 0.9);
});

test('reverb decay regenerates a stereo impulse of matching length', () => {
  const { engine, ctx } = createLiveEngine();
  engine.setReverbDecay(2);
  const buffer = engine.fxChain.reverbConvolver.buffer;
  assert.equal(buffer.numberOfChannels, 2);
  assert.equal(buffer.length, 2 * ctx.sampleRate);
});
