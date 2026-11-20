const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createLiveEngine } = require('./helpers/synth-engine');

test('FX chain runs voice bus -> crusher -> chorus -> delay -> reverb -> master bus', () => {
  const { engine } = createLiveEngine();
  const { crusher, chorus, delay, reverb } = engine.fxChain;
  assert.ok(engine.masterVoiceBus.connections.includes(crusher.input));
  assert.ok(crusher.output.connections.includes(chorus.input));
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
  const fx = (mode, cMix, dMix, rMix, xMix = 0) => ({ crusher: { mix: xMix }, chorus: { mode, mix: cMix }, delay: { mix: dMix }, reverb: { mix: rMix } });
  const plain = (v) => JSON.parse(JSON.stringify(v));
  assert.deepEqual(plain(context.FXChain.activeEffects(fx('off', 0.6, 0, 0))), { crusher: false, chorus: false, delay: false, reverb: false });
  assert.deepEqual(plain(context.FXChain.activeEffects(fx('I', 0.6, 0.2, 0))), { crusher: false, chorus: true, delay: true, reverb: false });
  assert.deepEqual(plain(context.FXChain.activeEffects(fx('II', 0, 0, 0.1))), { crusher: false, chorus: false, delay: false, reverb: true });
  assert.deepEqual(plain(context.FXChain.activeEffects(fx('off', 0, 0, 0, 0.5))), { crusher: true, chorus: false, delay: false, reverb: false });
});

test('crusher loads its worklet, then feeds it only while mix > 0', async () => {
  const { engine, ctx } = createLiveEngine();
  const { crusher } = engine.fxChain;
  assert.equal(crusher.node, null, 'no node before the module loaded');
  await engine.fxChain.ready;
  assert.ok(ctx.workletModules.includes('js/worklets/crusher-processor.js'));
  assert.equal(crusher.node.name, 'bitcrusher');
  assert.equal(crusher.node.options.outputChannelCount[0], 2);
  assert.ok(crusher.node.connections.includes(crusher.wetGain));
  assert.ok(!crusher.input.connections.includes(crusher.node), 'bypassed at mix 0');

  engine.setCrusherMix(0.75);
  assert.ok(crusher.input.connections.includes(crusher.node));
  assert.ok(crusher.input.connections.includes(crusher.dryGain), 'dry path stays');
  assert.equal(crusher.wetGain.gain.value, 0.75);
  assert.equal(crusher.dryGain.gain.value, 0.25);

  engine.setCrusherMix(0);
  assert.ok(!crusher.input.connections.includes(crusher.node));
  assert.ok(crusher.input.connections.includes(crusher.dryGain));
});

test('crusher bits and rate reach the worklet params and are clamped', async () => {
  const { engine } = createLiveEngine();
  await engine.fxChain.ready;
  const params = engine.fxChain.crusher.node.parameters;
  assert.equal(params.get('bits').value, 8, 'engine default on attach');
  assert.equal(params.get('rate').value, 11000);
  engine.setCrusherBits(4);
  engine.setCrusherRate(3000);
  assert.equal(params.get('bits').value, 4);
  assert.equal(params.get('rate').value, 3000);
  engine.setCrusherBits(40);
  engine.setCrusherRate(10);
  assert.equal(engine.fx.crusher.bits, 16);
  assert.equal(engine.fx.crusher.rate, 500);
});

test('the rack names its modulation targets, crusher params once the worklet is attached', async () => {
  const { engine } = createLiveEngine();
  const { delay, reverb, modTargets } = engine.fxChain;
  assert.equal(modTargets.crusherRate, undefined);
  assert.equal(modTargets.delayTime[0], delay.delayL.delayTime);
  assert.equal(modTargets.delayTime[1], delay.delayR.delayTime);
  assert.equal(modTargets.delayFeedback[1], delay.feedbackGainR.gain);
  assert.equal(modTargets.delayMix[0], delay.wetGain.gain);
  assert.equal(modTargets.reverbMix[0], reverb.wetGain.gain);
  await engine.fxChain.ready;
  const node = engine.fxChain.crusher.node;
  assert.equal(modTargets.crusherBits[0], node.parameters.get('bits'));
  assert.equal(modTargets.crusherRate[0], node.parameters.get('rate'));
});
