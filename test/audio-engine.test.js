const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { loadEngineContext, createLiveEngine } = require('./helpers/synth-engine');

function createEngine() {
  const { AudioEngine } = loadEngineContext();
  return new AudioEngine();
}

// Plain realm-neutral copy, so deepStrictEqual does not trip over vm prototypes
const plain = (value) => JSON.parse(JSON.stringify(value));

describe('master output stage', () => {
  // Signal path: limiter -> pre-gain 0.5 -> safety clipper -> destination.
  // The shaper reads input in [-1, 1], so the curve covers -2..+2 of the limiter output.
  const masterOut = () => {
    const { engine, ctx } = createLiveEngine();
    const feeds = ctx.nodes.filter((n) => n.connections.includes(ctx.destination));
    return { engine, ctx, feeds };
  };
  const throughClipper = (engine, x) => {
    const curve = engine.master.clipper.curve;
    const u = Math.max(-1, Math.min(1, x * engine.master.clipperPre.gain.value));
    return curve[Math.round(((u + 1) / 2) * (curve.length - 1))];
  };

  test('the destination is fed by the safety clipper behind the limiter', () => {
    const { engine, feeds } = masterOut();
    assert.ok(feeds.includes(engine.master.clipper));
    assert.ok(!feeds.includes(engine.master.limiter), 'limiter must not reach the destination directly');
    assert.ok(engine.master.limiter.connections.includes(engine.master.clipperPre));
    assert.ok(engine.master.clipperPre.connections.includes(engine.master.clipper));
  });

  test('limiter overshoot stays below full scale', () => {
    const { engine } = masterOut();
    for (const x of [1.0, 1.14, 2.1, 5]) {
      const y = throughClipper(engine, x);
      assert.ok(y < 0.99 && y > 0.9, `x=${x} -> ${y}`);
      assert.ok(Math.abs(throughClipper(engine, -x) + y) < 1e-6, 'symmetric');
    }
  });

  test('normal levels pass unchanged', () => {
    const { engine } = masterOut();
    for (const x of [0, 0.1, 0.5, 0.75]) {
      assert.ok(Math.abs(throughClipper(engine, x) - x) < 0.002, `x=${x}`);
    }
  });

  test('master volume ramps the gain between analyser and limiter', () => {
    const { engine, ctx } = masterOut();
    const { master } = engine;
    assert.ok(master.analyser.connections.includes(master.volume));
    assert.ok(master.volume.connections.includes(master.limiter));
    assert.equal(master.volume.gain.value, engine.masterVolume);
    ctx.currentTime = 4;
    engine.setMasterVolume(1.5);
    assert.deepEqual(master.volume.gain.events.at(-1), { type: 'setTargetAtTime', value: 1, time: 4, timeConstant: 0.02 });
  });

  test('the drum machine joins the master bus input', () => {
    const { engine, context } = createLiveEngine('drum-kits.js', 'drum-engine.js');
    const drum = new context.DrumEngine(engine);
    drum.initAudio();
    assert.ok(drum.outputBus.connections.includes(engine.master.input));
  });
});

describe('pitch calculation', () => {
  test('MIDI 69 is 440 Hz and 57 is 220 Hz', () => {
    const engine = createEngine();
    assert.equal(engine.midiNoteToFrequency(69), 440);
    assert.equal(engine.midiNoteToFrequency(57), 220);
  });

  test('global octave shift moves the base frequency by octaves', () => {
    const engine = createEngine();
    engine.setOctaveShift(1);
    assert.equal(engine.midiNoteToFrequency(69), 880);
    engine.setOctaveShift(-5);
    assert.equal(engine.octaveShift, -2, 'shift is clamped to -2');
    assert.equal(engine.midiNoteToFrequency(69), 110);
  });

  test('VCO2 combines octave, semitone and cents detune', () => {
    const engine = createEngine();
    engine.setVCO2Octave(1);
    engine.setVCO2Semitone(7);
    engine.setVCO2Detune(0);
    const expected = 440 * Math.pow(2, 19 / 12);
    assert.ok(Math.abs(engine.getVCO2Frequency(440) - expected) < 1e-9);

    engine.setVCO2Octave(0);
    engine.setVCO2Semitone(0);
    engine.setVCO2Detune(100);
    assert.ok(Math.abs(engine.getVCO2Frequency(440) - 440 * Math.pow(2, 1 / 12)) < 1e-9);
  });

  test('VCO1 has its own semitone and cents detune', () => {
    const engine = createEngine();
    engine.setVcoSemitone(1, -5);
    engine.setVcoDetune(1, 30);
    assert.ok(Math.abs(engine.getVCO1Frequency(440) - 440 * Math.pow(2, -4.7 / 12)) < 1e-9);
    assert.equal(engine.vco1.semitone, -5);
    assert.equal(engine.vco1.detuneCents, 30);
  });

  test('VCO2 pulse width drives its own comparator offset', () => {
    const { createLiveEngine } = require('./helpers/synth-engine');
    const { engine } = createLiveEngine();
    assert.equal(engine.vco2PwOffset.offset.value, 0, 'square at 50%');
    engine.setVcoPW(2, 0.75);
    assert.equal(engine.vco2.pulseWidth, 0.75);
    assert.ok(Math.abs(engine.vco2PwOffset.offset.value - 0.2) < 1e-9);
    assert.equal(engine.vco1PwOffset.offset.value, 0, 'VCO 1 untouched');
  });

  test('pitch bend scales both VCOs', () => {
    const engine = createEngine();
    engine.setVCO2Detune(0);
    engine.setPitchBend(2);
    assert.equal(engine.getVCO1Frequency(440), 880);
    assert.equal(engine.getVCO2Frequency(440), 880);
  });
});

describe('getVoiceCutoffFrequency', () => {
  test('full key tracking doubles cutoff per octave above middle C', () => {
    const engine = createEngine();
    engine.setVCFCutoff(1000);
    engine.setVCFKeyTrack(1);
    assert.equal(engine.getVoiceCutoffFrequency(60), 1000);
    assert.equal(engine.getVoiceCutoffFrequency(72), 2000);
    assert.equal(engine.getVoiceCutoffFrequency(48), 500);
  });

  test('result stays within 20 Hz .. 20 kHz', () => {
    const engine = createEngine();
    engine.setVCFCutoff(15000);
    engine.setVCFKeyTrack(1);
    engine.setModWheel(1);
    assert.equal(engine.getVoiceCutoffFrequency(127), 20000);

    engine.setVCFCutoff(20);
    engine.setModWheel(0);
    assert.equal(engine.getVoiceCutoffFrequency(0), 20);
  });
});

describe('voice stealing', () => {
  test('a stolen voice is choked with a 2 ms fade', () => {
    const { engine, ctx } = createLiveEngine();
    for (let n = 60; n < 72; n++) engine.noteOn(n, 1.0);
    const oldest = engine.activeVoices.get(60);
    ctx.currentTime = 2;
    engine.noteOn(72, 1.0);
    assert.equal(engine.activeVoices.get(72), oldest);
    assert.equal(engine.activeVoices.has(60), false);
    const choke = oldest.vca.gain.events.find((e) => e.type === 'setTargetAtTime' && e.time === 2);
    assert.equal(choke.timeConstant, 0.002);
  });
});

describe('stuck notes', () => {
  // Assertions compare voice ids only: a failing assert on Voice objects makes node
  // diff the whole engine graph and can hang the machine.
  const idOf = (voice) => (voice ? voice.id : null);

  // Note re-pressed while its old voice still releases, then the pool runs full and
  // the next note takes that releasing voice.
  const orphanScenario = () => {
    const { engine, ctx } = createLiveEngine();
    ctx.currentTime = 1;
    engine.noteOn(60, 1.0);
    const oldId = idOf(engine.activeVoices.get(60));
    engine.noteOff(60);
    ctx.currentTime = 1.1;
    engine.noteOn(60, 1.0);
    const held = engine.activeVoices.get(60);
    assert.notEqual(idOf(held), oldId);
    for (let n = 61; n <= 70; n++) engine.noteOn(n, 1.0);
    engine.noteOn(71, 1.0);
    assert.equal(idOf(engine.activeVoices.get(71)), oldId, 'scenario: 71 took the releasing voice');
    return { engine, ctx, held };
  };

  test('taking a releasing voice keeps the held voice of the same note mapped', () => {
    const { engine, held } = orphanScenario();
    assert.equal(idOf(engine.activeVoices.get(60)), held.id);
  });

  test('note-off still reaches the re-pressed voice', () => {
    const { engine, ctx, held } = orphanScenario();
    ctx.currentTime = 2;
    engine.noteOff(60);
    assert.equal(held.releaseStartTime, 2);
  });

  test('allNotesOff releases every sounding voice, mapped or not', () => {
    const { engine, ctx } = createLiveEngine();
    engine.noteOn(60, 1.0);
    const voice = engine.activeVoices.get(60);
    engine.activeVoices.clear(); // voice lost its map entry
    ctx.currentTime = 2;
    engine.allNotesOff();
    assert.equal(voice.releaseStartTime, 2);
  });

  test('power off silences a lost voice', () => {
    const { engine, ctx } = createLiveEngine();
    engine.noteOn(60, 1.0);
    const voice = engine.activeVoices.get(60);
    engine.activeVoices.clear();
    ctx.currentTime = 3;
    engine.setPower(false);
    assert.equal(voice.releaseStartTime, 3);
  });
});

describe('sample & hold LFO', () => {
  for (const lfoNum of [1, 2]) {
    test(`LFO${lfoNum} S&H uses the same modulation depths as the continuous LFO`, () => {
      const { engine, context } = createLiveEngine();
      vm.runInContext('Math.random = () => 1;', context); // S&H value = 1 * 2 - 1 = +1
      engine.setLFOParam(lfoNum, 'wave', 'samplehold');
      for (const dest of ['pitch', 'vcf', 'pwm', 'amp']) engine.setLFOParam(lfoNum, dest, 1);
      engine.lfos[lfoNum].startSampleAndHold();
      [...context.__intervals.values()].pop()();

      const route = engine.voicePool[0].lfo[lfoNum];
      assert.equal(route.pitch.gain.value, 200);
      assert.equal(route.vcf.gain.value, 3600);
      assert.equal(route.pwm[0].gain.value, 0.35);
      assert.equal(route.pwm[1].gain.value, 0.35);
      assert.equal(route.amp.gain.value, 0.45);
    });

    test(`LFO${lfoNum} S&H holds a flat step instead of a scaled sawtooth`, () => {
      const { engine, context } = createLiveEngine();
      vm.runInContext('Math.random = () => 0.1;', context); // S&H value = 0.1 * 2 - 1 = -0.8
      engine.setLFOParam(lfoNum, 'wave', 'samplehold');
      engine.lfos[lfoNum].startSampleAndHold();
      [...context.__intervals.values()].pop()();

      assert.equal(engine.lfos[lfoNum].oscGate.gain.value, 0, 'sawtooth muted');
      assert.ok(Math.abs(engine.lfos[lfoNum].shSource.offset.value + 0.8) < 1e-9, 'step held on the constant source');
    });

    test(`LFO${lfoNum} S&H step survives a new note`, () => {
      const { engine, context } = createLiveEngine();
      vm.runInContext('Math.random = () => 0.1;', context);
      engine.setLFOParam(lfoNum, 'wave', 'samplehold');
      engine.setLFOParam(lfoNum, 'vcf', 0.5);
      engine.lfos[lfoNum].startSampleAndHold();
      [...context.__intervals.values()].pop()();
      const route = engine.voicePool[0].lfo[lfoNum];
      const before = route.vcf.gain.value;

      engine.voicePool[0].startLfoFadeIn(lfoNum, engine.ctx.currentTime);

      assert.equal(route.vcf.gain.value, before, 'note-on must not jump the depth');
    });

    test(`LFO${lfoNum} leaving S&H unmutes the oscillator and clears the step`, () => {
      const { engine, context } = createLiveEngine();
      vm.runInContext('Math.random = () => 0.1;', context);
      engine.setLFOParam(lfoNum, 'wave', 'samplehold');
      engine.lfos[lfoNum].startSampleAndHold();
      [...context.__intervals.values()].pop()();
      engine.setLFOParam(lfoNum, 'wave', 'triangle');

      assert.equal(engine.lfos[lfoNum].oscGate.gain.value, 1);
      assert.equal(engine.lfos[lfoNum].shSource.offset.value, 0);
    });
  }
});

describe('preset state', () => {
  test('setters clamp out-of-range values', () => {
    const engine = createEngine();
    engine.setVCFCutoff(99999);
    engine.setVCFResonance(-1);
    engine.setDelayFeedback(2);
    engine.setReverbDecay(0);
    engine.setLFOParam(1, 'rate', 100);
    assert.equal(engine.vcf.cutoff, 20000);
    assert.equal(engine.vcf.resonance, 0.1);
    assert.equal(engine.fx.delay.feedback, 0.9);
    assert.equal(engine.fx.reverb.decay, 0.5);
    assert.equal(engine.lfo1.rate, 30);
  });

  test('loadPresetState followed by getPresetState round-trips every factory preset', () => {
    const { AudioEngine, SYNTH_FACTORY_PRESETS, SYNTH_INIT_PRESET } = loadEngineContext('presets.js');
    for (const preset of [SYNTH_INIT_PRESET, ...SYNTH_FACTORY_PRESETS]) {
      const engine = new AudioEngine();
      engine.loadPresetState(preset.state);
      assert.deepEqual(plain(engine.getPresetState()), plain(preset.state), preset.id);
    }
  });

  test('a preset saved before a parameter existed loads that parameter from the INIT patch', () => {
    const { AudioEngine, SYNTH_INIT_PRESET } = loadEngineContext('presets.js');
    const engine = new AudioEngine();
    engine.setCrusherMix(0.7);
    const oldPreset = JSON.parse(JSON.stringify(SYNTH_INIT_PRESET.state));
    delete oldPreset.fx.crusher;
    oldPreset.vcf.cutoff = 1234;
    engine.loadPresetState(oldPreset, SYNTH_INIT_PRESET.state);
    assert.equal(engine.fx.crusher.mix, 0, 'missing in the preset: INIT value');
    assert.equal(engine.vcf.cutoff, 1234, 'present in the preset: preset value');
  });

  test('getPresetState returns a copy, not live references', () => {
    const engine = createEngine();
    const state = engine.getPresetState();
    state.lfo1.destinations.pitch = 0.99;
    assert.notEqual(engine.lfo1.destinations.pitch, 0.99);
  });
});

describe('shared curves and noise buffer', () => {
  test('VCO shapers use the comparator curve, drive shapers the drive curve', () => {
    const { engine, context } = createLiveEngine();
    const pwm = context.SynthBlocks.pwmComparatorCurve();
    const drive = context.SynthBlocks.driveCurve(engine.vcf.drive);
    for (const voice of engine.voicePool) {
      assert.deepEqual(Array.from(voice.vco[1].pwShaper.curve), Array.from(pwm));
      assert.deepEqual(Array.from(voice.drive.shaper.curve), Array.from(drive));
    }
    engine.setVCFDrive(0.8);
    const driven = Array.from(context.SynthBlocks.driveCurve(0.8));
    assert.deepEqual(Array.from(engine.voicePool[3].drive.shaper.curve), driven);
  });

  test('synth noise buffer is 2 s mono white noise at 0.6 peak, built once', () => {
    const { engine, ctx } = createLiveEngine();
    const buffer = engine.getNoiseBuffer();
    assert.equal(buffer.numberOfChannels, 1);
    assert.equal(buffer.length, ctx.sampleRate * 2);
    const peak = buffer.getChannelData(0).reduce((m, v) => Math.max(m, Math.abs(v)), 0);
    assert.ok(peak <= 0.6 && peak > 0.5, `peak ${peak}`);
    assert.equal(engine.getNoiseBuffer(), buffer);
    assert.equal(engine.sharedNoiseSource.buffer, buffer);
  });
});
