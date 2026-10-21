const test = require('node:test');
const assert = require('node:assert/strict');
const { createLiveEngine } = require('./helpers/synth-engine');

test('voice pool has 12 voices with running oscillators connected to master bus', () => {
  const { engine } = createLiveEngine();
  assert.equal(engine.voicePool.length, 12);

  for (const voice of engine.voicePool) {
    // started holds the start time (null = never started)
    assert.equal(voice.osc1.started, 0);
    assert.equal(voice.osc2.started, 0);
    assert.equal(voice.subOsc.started, 0);
    assert.ok(voice.tremoloGain.connections.includes(engine.masterVoiceBus));
  }
});

test('noteOn sets frequency, VCA envelope ramps to peak and sustain, and updates state', () => {
  const { engine, ctx } = createLiveEngine();
  ctx.currentTime = 10;
  engine.ampEnv.attack = 0.02;
  engine.ampEnv.decay = 0.05;
  engine.ampEnv.sustain = 0.5;

  engine.noteOn(69, 1.0);
  const voice = engine.activeVoices.get(69);

  assert.ok(voice);
  assert.equal(voice.isBusy, true);
  assert.equal(voice.midiNote, 69);
  assert.equal(voice.osc1.frequency.value, 440);

  const vcaEvents = voice.vca.gain.events;
  const peakEvent = vcaEvents.find((e) => e.type === 'exponentialRampToValueAtTime' && Math.abs(e.value - 0.4) < 1e-4);
  assert.ok(peakEvent);
  assert.equal(peakEvent.time, 10 + 0.02);

  const sustainEvent = vcaEvents.find((e) => e.type === 'exponentialRampToValueAtTime' && Math.abs(e.value - 0.2) < 1e-4);
  assert.ok(sustainEvent);
  assert.equal(sustainEvent.time, 10 + 0.02 + 0.05);
});

test('velocity scales mixer gain levels', () => {
  const { engine, ctx } = createLiveEngine();
  ctx.currentTime = 5;
  const expectedVco1 = engine.mixer.vco1Level * 0.5;
  const expectedSub = engine.mixer.subLevel * 0.5;

  engine.noteOn(60, 0.5);
  const voice = engine.activeVoices.get(60);

  assert.equal(voice.osc1Gain.gain.value, expectedVco1);
  assert.equal(voice.subGain.gain.value, expectedSub);
});

test('glide ramps oscillator frequency from previous note frequency to target', () => {
  const { engine, ctx } = createLiveEngine();
  engine.setGlide(true);

  ctx.currentTime = 1;
  engine.noteOn(69, 1.0);
  const firstVoice = engine.activeVoices.get(69);
  const f1 = firstVoice.osc1.frequency.value;

  ctx.currentTime = 2;
  engine.noteOn(81, 1.0);
  const secondVoice = engine.activeVoices.get(81);
  const osc1Events = secondVoice.osc1.frequency.events;

  // Skip the 440 Hz init event from graph construction at t=0
  const startEvent = osc1Events.find((e) => e.type === 'setValueAtTime' && e.time === 2);
  assert.ok(startEvent);
  assert.ok(Math.abs(startEvent.value - f1) < 1e-9);

  const rampEvent = osc1Events.find((e) => e.type === 'exponentialRampToValueAtTime');
  assert.ok(rampEvent);
  assert.equal(rampEvent.value, 880);
  assert.equal(rampEvent.time, 2 + engine.glideTime);
});

test('noteOn triggers filter envelope attack and decay exponential ramps', () => {
  const { engine, ctx } = createLiveEngine();
  ctx.currentTime = 1;
  engine.filterEnv.attack = 0.03;
  engine.filterEnv.decay = 0.07;
  engine.filterEnv.sustain = 0.4;

  engine.noteOn(60, 1.0);
  const voice = engine.activeVoices.get(60);
  const ramps = voice.vcf1.frequency.events.filter((e) => e.type === 'exponentialRampToValueAtTime');

  assert.equal(ramps.length >= 2, true);
  assert.equal(ramps[0].time, 1 + 0.03);
  assert.equal(ramps[1].time, 1 + 0.03 + 0.07);
});

test('noteOff starts VCA release and timeout callback frees voice', () => {
  const { engine, context, ctx } = createLiveEngine();
  ctx.currentTime = 3;
  engine.ampEnv.release = 0.09;

  engine.noteOn(60, 1.0);
  const voice = engine.activeVoices.get(60);

  engine.noteOff(60);
  assert.equal(voice.releaseStartTime, 3);

  const releaseEvent = voice.vca.gain.events.find((e) => e.type === 'setTargetAtTime' && e.value === 0);
  assert.ok(releaseEvent);
  assert.equal(releaseEvent.time, 3);
  assert.equal(releaseEvent.timeConstant, 0.09 / 3);
  assert.equal(voice.isBusy, true);

  const timeouts = Array.from(context.__timeouts.values());
  assert.ok(timeouts.length > 0);
  for (const cb of timeouts) cb();

  assert.equal(voice.isBusy, false);
  assert.equal(voice.midiNote, null);
});

test('retrigger before release timeout expires cancels cleanup and keeps voice busy', () => {
  const { engine, context, ctx } = createLiveEngine();
  ctx.currentTime = 4;
  engine.noteOn(60, 1.0);
  const voice = engine.activeVoices.get(60);

  engine.noteOff(60);
  const pendingCallbacks = Array.from(context.__timeouts.values());

  // The engine would pick a free voice for a new note; re-trigger the releasing voice itself
  ctx.currentTime = 4.05;
  voice.trigger(60, 1.0, ctx.currentTime);

  for (const cb of pendingCallbacks) cb();

  assert.equal(voice.isBusy, true);
  assert.equal(voice.midiNote, 60);
});

test('setVCO1Wave switches between direct wave and shaped pulse paths', () => {
  const { engine } = createLiveEngine();
  const voice = engine.voicePool[0];

  engine.setVCO1Wave('square');
  assert.equal(voice.osc1.type, 'sawtooth');
  assert.equal(voice.osc1DirectGain.gain.value, 0);
  assert.equal(voice.osc1PulseGain.gain.value, 1);

  engine.setVCO1Wave('triangle');
  assert.equal(voice.osc1.type, 'triangle');
  assert.equal(voice.osc1DirectGain.gain.value, 1);
  assert.equal(voice.osc1PulseGain.gain.value, 0);
});

test('setLFOParam updates pitch depth and both PWM gains on voices', () => {
  const { engine } = createLiveEngine();
  const voice = engine.voicePool[0];

  engine.setLFOParam(1, 'pitch', 0.5);
  assert.equal(voice.lfo[1].pitch.gain.value, 100);

  engine.setLFOParam(1, 'pwm', 0.5);
  assert.equal(voice.lfo[1].pwm[0].gain.value, 0.175);
  assert.equal(voice.lfo[1].pwm[1].gain.value, 0.175);
});

test('LFO fade-in ramps destination gain linearly when fadeIn > 0 and sets immediately when 0', () => {
  const { engine, ctx } = createLiveEngine();
  ctx.currentTime = 10;
  engine.lfo1.fadeIn = 0;
  engine.lfo2.fadeIn = 1;
  engine.setLFOParam(1, 'pitch', 0.5);
  engine.setLFOParam(2, 'pitch', 0.5);

  engine.noteOn(60, 1.0);
  const voice = engine.activeVoices.get(60);

  const lfo1Direct = voice.lfo[1].pitch.gain.events.find((e) => e.type === 'setValueAtTime' && e.value === 100 && e.time === 10);
  assert.ok(lfo1Direct);

  const lfo2Zero = voice.lfo[2].pitch.gain.events.find((e) => e.type === 'setValueAtTime' && e.value === 0 && e.time === 10);
  assert.ok(lfo2Zero);

  const lfo2Ramp = voice.lfo[2].pitch.gain.events.find((e) => e.type === 'linearRampToValueAtTime' && e.value === 100 && e.time === 11);
  assert.ok(lfo2Ramp);
});

test('configureFilter stages filter types and Q factor for lowpass12 and lowpass24', () => {
  const { engine } = createLiveEngine();
  const voice = engine.voicePool[0];

  engine.setVCFResonance(10);
  engine.setVCFType('lowpass12');
  assert.equal(voice.vcf1.type, 'lowpass');
  assert.equal(voice.vcf2.type, 'allpass');
  assert.equal(voice.vcf2.Q.value, 0.1);

  engine.setVCFType('lowpass24');
  assert.equal(voice.vcf1.type, 'lowpass');
  assert.equal(voice.vcf2.type, 'lowpass');
  assert.equal(voice.vcf1.Q.value, 3.8);
  assert.equal(voice.vcf2.Q.value, 4.8);
});

test('setPitchBend retunes sounding voice frequencies with setTargetAtTime', () => {
  const { engine, ctx } = createLiveEngine();
  ctx.currentTime = 5;
  engine.noteOn(69, 1.0);
  const voice = engine.activeVoices.get(69);

  ctx.currentTime = 6;
  engine.setPitchBend(2);
  const osc1Events = voice.osc1.frequency.events;
  const bendEvent = osc1Events.find((e) => e.type === 'setTargetAtTime' && e.time === 6);

  assert.ok(bendEvent);
  assert.equal(bendEvent.value, 880);
});
