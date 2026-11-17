const test = require('node:test');
const assert = require('node:assert/strict');
const { createLiveEngine } = require('./helpers/synth-engine');

test('voice pool has 12 voices with running oscillators, idle voices off the master bus', () => {
  const { engine } = createLiveEngine();
  assert.equal(engine.voicePool.length, 12);

  for (const voice of engine.voicePool) {
    // started holds the start time (null = never started)
    assert.equal(voice.vco[1].osc.started, 0);
    assert.equal(voice.vco[2].osc.started, 0);
    assert.equal(voice.subOsc.started, 0);
    // Idle voices stay unconnected so the audio thread does not render them (CPU on tablets)
    assert.ok(!voice.tremoloGain.connections.includes(engine.masterVoiceBus));
  }
});

test('noteOn connects the voice, release cleanup disconnects it again', () => {
  const { engine, context } = createLiveEngine();
  engine.noteOn(60, 1.0);
  const voice = engine.activeVoices.get(60);
  const toBus = () => voice.tremoloGain.connections.filter((n) => n === engine.masterVoiceBus).length;
  assert.equal(toBus(), 1);

  engine.noteOn(60, 1.0); // retrigger must not add a second connection
  assert.equal(toBus(), 1);

  engine.noteOff(60);
  assert.equal(toBus(), 1, 'release tail still audible');
  for (const cb of Array.from(context.__timeouts.values())) cb();
  assert.equal(toBus(), 0);
});

test('release cleanup waits until the tail is below -70 dB', () => {
  const { engine, context, ctx } = createLiveEngine();
  const delays = [];
  context.setTimeout = (fn, ms) => { delays.push(ms); return 1; };
  engine.ampEnv.release = 0.3;
  engine.filterEnv.release = 0.3;
  engine.noteOn(60, 1.0);
  engine.noteOff(60);
  const tau = 0.3 / 3;
  const residualDb = 20 * Math.log10(Math.exp(-(delays.pop() / 1000) / tau));
  assert.ok(residualDb < -70, `${residualDb.toFixed(1)} dB`);
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
  assert.equal(voice.vco[1].osc.frequency.value, 440);

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
  const f1 = firstVoice.vco[1].osc.frequency.value;

  ctx.currentTime = 2;
  engine.noteOn(81, 1.0);
  const secondVoice = engine.activeVoices.get(81);
  const osc1Events = secondVoice.vco[1].osc.frequency.events;

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
  const ramps = voice.filter.stage1.frequency.events.filter((e) => e.type === 'exponentialRampToValueAtTime');

  assert.equal(ramps.length >= 2, true);
  assert.equal(ramps[0].time, 1 + 0.03);
  assert.equal(ramps[1].time, 1 + 0.03 + 0.07);
});

test('amp and filter envelopes schedule exactly this event sequence over note on and off', () => {
  const { engine, ctx } = createLiveEngine();
  Object.assign(engine.ampEnv, { attack: 0.02, decay: 0.05, sustain: 0.5, release: 0.3 });
  Object.assign(engine.filterEnv, { attack: 0.03, decay: 0.07, sustain: 0.4, release: 0.6 });
  Object.assign(engine.vcf, { cutoff: 1000, envMod: 0.5, keyTrack: 0 });
  const voice = engine.voicePool[0];
  const params = [voice.vca.gain, voice.filter.stage1.frequency, voice.filter.stage2.frequency];
  const marks = params.map((p) => p.events.length);

  ctx.currentTime = 10;
  engine.noteOn(69, 0.5);
  ctx.currentTime = 11;
  engine.noteOff(69);

  const strip = (e) => Object.fromEntries(Object.entries(e).filter(([, x]) => x !== undefined));
  const [amp, vcf1, vcf2] = params.map((p, i) => p.events.slice(marks[i]).map(strip));
  const near = (actual, expected) => {
    assert.equal(actual.length, expected.length);
    actual.forEach((e, i) => {
      assert.equal(e.type, expected[i].type, `event ${i}`);
      for (const key of ['value', 'time', 'timeConstant']) {
        if (expected[i][key] === undefined) assert.equal(e[key], undefined);
        else assert.ok(Math.abs(e[key] - expected[i][key]) < 1e-9, `event ${i} ${key}: ${e[key]}`);
      }
    });
  };

  near(amp, [
    { type: 'cancelAndHoldAtTime', time: 10 },
    { type: 'setValueAtTime', value: 0.00001, time: 10 },
    { type: 'exponentialRampToValueAtTime', value: 0.2, time: 10.02 },
    { type: 'exponentialRampToValueAtTime', value: 0.1, time: 10.07 },
    { type: 'cancelAndHoldAtTime', time: 11 },
    { type: 'setTargetAtTime', value: 0, time: 11, timeConstant: 0.1 }
  ]);
  const peak = 1000 * Math.pow(2, 0.5 * 3.5);
  const filterEvents = [
    { type: 'setValueAtTime', value: 1000, time: 10 },
    { type: 'cancelScheduledValues', time: 10 },
    { type: 'setValueAtTime', value: 1000, time: 10 },
    { type: 'exponentialRampToValueAtTime', value: peak, time: 10.03 },
    { type: 'exponentialRampToValueAtTime', value: 1000 + (peak - 1000) * 0.4, time: 10.1 },
    { type: 'cancelAndHoldAtTime', time: 11 },
    { type: 'setTargetAtTime', value: 1000, time: 11, timeConstant: 0.2 }
  ];
  near(vcf1, filterEvents);
  near(vcf2, filterEvents);
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
  assert.ok(voice.tremoloGain.connections.includes(engine.masterVoiceBus));
});

test('setVCO1Wave switches between direct wave and shaped pulse paths', () => {
  const { engine } = createLiveEngine();
  const voice = engine.voicePool[0];

  engine.setVCO1Wave('square');
  assert.equal(voice.vco[1].osc.type, 'sawtooth');
  assert.equal(voice.vco[1].directGain.gain.value, 0);
  assert.equal(voice.vco[1].pulseGain.gain.value, 1);

  engine.setVCO1Wave('triangle');
  assert.equal(voice.vco[1].osc.type, 'triangle');
  assert.equal(voice.vco[1].directGain.gain.value, 1);
  assert.equal(voice.vco[1].pulseGain.gain.value, 0);
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
  assert.equal(voice.filter.stage1.type, 'lowpass');
  assert.equal(voice.filter.stage2.type, 'allpass');
  assert.equal(voice.filter.stage2.Q.value, 0.1);

  engine.setVCFType('lowpass24');
  assert.equal(voice.filter.stage1.type, 'lowpass');
  assert.equal(voice.filter.stage2.type, 'lowpass');
  assert.equal(voice.filter.stage1.Q.value, 3.8);
  assert.equal(voice.filter.stage2.Q.value, 4.8);
});

test('filter modes: stage types and clamped Q for every mode and resonance', () => {
  const { engine } = createLiveEngine();
  const voice = engine.voicePool[0];
  const stages = () => [voice.filter.stage1.type, voice.filter.stage2.type, voice.filter.stage1.Q.value, voice.filter.stage2.Q.value];
  const expected = {
    lowpass24: { 0: ['lowpass', 'lowpass', 0.5, 0.5], 10: ['lowpass', 'lowpass', 3.8, 4.8], 30: ['lowpass', 'lowpass', 7.5, 9.0] },
    lowpass12: { 0: ['lowpass', 'allpass', 0.5, 0.1], 10: ['lowpass', 'allpass', 7.0, 0.1], 30: ['lowpass', 'allpass', 14.0, 0.1] },
    bandpass: { 0: ['bandpass', 'bandpass', 0.6, 0.6], 10: ['bandpass', 'bandpass', 4.2, 4.2], 30: ['bandpass', 'bandpass', 8.0, 8.0] },
    highpass: { 0: ['highpass', 'highpass', 0.5, 0.5], 10: ['highpass', 'highpass', 3.8, 4.8], 30: ['highpass', 'highpass', 7.5, 9.0] }
  };
  for (const [type, byRes] of Object.entries(expected)) {
    for (const [res, want] of Object.entries(byRes)) {
      engine.vcf.type = type;
      engine.vcf.resonance = Number(res);
      voice.configureFilter(800);
      const got = stages();
      assert.deepEqual(got.slice(0, 2), want.slice(0, 2), `${type} res ${res}`);
      assert.ok(Math.abs(got[2] - want[2]) < 1e-9 && Math.abs(got[3] - want[3]) < 1e-9, `${type} res ${res}: ${got}`);
      assert.equal(voice.filter.stage1.frequency.value, 800);
      assert.equal(voice.filter.stage2.frequency.value, 800);
    }
  }
});

test('filter cutoff is clamped to 20..20000 Hz, unknown types leave the stages alone', () => {
  const { engine } = createLiveEngine();
  const voice = engine.voicePool[0];
  voice.configureFilter(5);
  assert.equal(voice.filter.stage1.frequency.value, 20);
  voice.configureFilter(30000);
  assert.equal(voice.filter.stage2.frequency.value, 20000);

  const before = voice.filter.stage1.frequency.events.length;
  engine.vcf.type = 'notch';
  voice.configureFilter(800);
  assert.equal(voice.filter.stage1.frequency.events.length, before);
  assert.equal(voice.filter.stage1.type, 'lowpass');
});

test('setPitchBend retunes sounding voice frequencies with setTargetAtTime', () => {
  const { engine, ctx } = createLiveEngine();
  ctx.currentTime = 5;
  engine.noteOn(69, 1.0);
  const voice = engine.activeVoices.get(69);

  ctx.currentTime = 6;
  engine.setPitchBend(2);
  const osc1Events = voice.vco[1].osc.frequency.events;
  const bendEvent = osc1Events.find((e) => e.type === 'setTargetAtTime' && e.time === 6);

  assert.ok(bendEvent);
  assert.equal(bendEvent.value, 880);
});

test('PWM shaper only feeds the mix while its VCO plays square', () => {
  const { engine, context } = createLiveEngine();
  const voice = engine.voicePool[0];
  const plugged = (n) => voice.vco[n].pwShaper.connections.includes(voice.vco[n].pulseGain);
  assert.equal(engine.vco1.wave === 'square', plugged(1));

  engine.setVCO1Wave('square');
  assert.equal(plugged(1), true);

  engine.setVCO1Wave('sawtooth');
  assert.equal(plugged(1), true, 'stays plugged while the pulse gain fades out');
  for (const cb of Array.from(context.__timeouts.values())) cb();
  assert.equal(plugged(1), false);

  // a pending unplug must not cut a VCO that went back to square
  engine.setVCO2Wave('square');
  engine.setVCO2Wave('sawtooth');
  engine.setVCO2Wave('square');
  for (const cb of Array.from(context.__timeouts.values())) cb();
  assert.equal(plugged(2), true);
});
