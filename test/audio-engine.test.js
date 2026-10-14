const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { loadScripts } = require('./helpers/load-browser-script');

function createEngine() {
  const { AudioEngine } = loadScripts('audio-engine.js');
  return new AudioEngine();
}

// Plain realm-neutral copy, so deepStrictEqual does not trip over vm prototypes
const plain = (value) => JSON.parse(JSON.stringify(value));

describe('makeDistortionCurve', () => {
  test('returns a linear identity curve for amount 0', () => {
    const curve = createEngine().makeDistortionCurve(0);
    assert.equal(curve.length, 512);
    assert.equal(curve[0], -1);
    assert.equal(curve[511], 1);
    assert.ok(Math.abs(curve[255] - (255 * 2 / 511 - 1)) < 1e-6);
  });

  test('is normalized to +-1 at the edges for any drive amount', () => {
    const engine = createEngine();
    for (const amount of [0.1, 0.5, 1]) {
      const curve = engine.makeDistortionCurve(amount);
      assert.ok(Math.abs(curve[0] + 1) < 1e-6, `amount ${amount} low edge`);
      assert.ok(Math.abs(curve[511] - 1) < 1e-6, `amount ${amount} high edge`);
    }
  });

  test('is monotonic and odd-symmetric', () => {
    const curve = createEngine().makeDistortionCurve(0.7);
    for (let i = 1; i < curve.length; i++) {
      assert.ok(curve[i] > curve[i - 1], `not increasing at ${i}`);
    }
    for (let i = 0; i < curve.length; i++) {
      assert.ok(Math.abs(curve[i] + curve[curve.length - 1 - i]) < 1e-6, `not symmetric at ${i}`);
    }
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

describe('allocateVoice', () => {
  function engineWithPool(voices) {
    const engine = createEngine();
    const silentParam = { cancelScheduledValues() {}, setTargetAtTime() {} };
    engine.voicePool = voices.map((v) => ({
      isBusy: false, midiNote: null, startTime: 0, releaseStartTime: 0,
      vca: { gain: silentParam },
      ...v
    }));
    for (const voice of engine.voicePool) {
      if (voice.midiNote !== null) engine.activeVoices.set(voice.midiNote, voice);
    }
    return engine;
  }

  test('reuses the voice already playing the same note', () => {
    const engine = engineWithPool([{ isBusy: true, midiNote: 60, startTime: 1 }, {}]);
    assert.equal(engine.allocateVoice(60), engine.voicePool[0]);
  });

  test('prefers a free voice', () => {
    const engine = engineWithPool([{ isBusy: true, midiNote: 60, startTime: 1 }, {}]);
    assert.equal(engine.allocateVoice(62), engine.voicePool[1]);
  });

  test('takes the oldest releasing voice before stealing a held one', () => {
    const engine = engineWithPool([
      { isBusy: true, midiNote: 60, startTime: 1 },
      { isBusy: true, midiNote: 62, startTime: 2, releaseStartTime: 5 },
      { isBusy: true, midiNote: 64, startTime: 3, releaseStartTime: 4 }
    ]);
    assert.equal(engine.allocateVoice(65), engine.voicePool[2]);
    assert.equal(engine.activeVoices.has(64), false);
  });

  test('steals the oldest held voice when all are busy (LRU)', () => {
    const engine = engineWithPool([
      { isBusy: true, midiNote: 60, startTime: 3 },
      { isBusy: true, midiNote: 62, startTime: 1 },
      { isBusy: true, midiNote: 64, startTime: 2 }
    ]);
    assert.equal(engine.allocateVoice(65), engine.voicePool[1]);
    assert.equal(engine.activeVoices.has(62), false);
  });
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
    const { AudioEngine, SYNTH_FACTORY_PRESETS, SYNTH_INIT_PRESET } = loadScripts('audio-engine.js', 'presets.js');
    for (const preset of [SYNTH_INIT_PRESET, ...SYNTH_FACTORY_PRESETS]) {
      const engine = new AudioEngine();
      engine.loadPresetState(preset.state);
      assert.deepEqual(plain(engine.getPresetState()), plain(preset.state), preset.id);
    }
  });

  test('getPresetState returns a copy, not live references', () => {
    const engine = createEngine();
    const state = engine.getPresetState();
    state.lfo1.destinations.pitch = 0.99;
    assert.notEqual(engine.lfo1.destinations.pitch, 0.99);
  });
});
