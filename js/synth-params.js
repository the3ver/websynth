/**
 * RETROVOX SUB-1 • PATCH PARAMETER TABLE
 * Single source of truth for every patch parameter: preset path, engine setter, optional engine field
 * (when it differs from the path) and the rotary knob that controls it (data-param in index.html).
 * Preset save/load, knob dispatch and UI sync are all driven from this table.
 */

const lfoParams = (lfoNum) => [
  { path: `lfo${lfoNum}.wave`, set: (e, v) => e.setLFOParam(lfoNum, 'wave', v) },
  { path: `lfo${lfoNum}.rate`, knob: 'lfo-rate', lfo: lfoNum, set: (e, v) => e.setLFOParam(lfoNum, 'rate', v) },
  { path: `lfo${lfoNum}.fadeIn`, knob: 'lfo-fade', lfo: lfoNum, set: (e, v) => e.setLFOParam(lfoNum, 'fadeIn', v) },
  ...['pitch', 'vcf', 'pwm', 'amp'].map((dest) => ({
    path: `lfo${lfoNum}.destinations.${dest}`,
    knob: `lfo-${dest}`,
    lfo: lfoNum,
    set: (e, v) => e.setLFOParam(lfoNum, dest, v)
  }))
];

const envParams = (envName) => ['attack', 'decay', 'sustain', 'release'].map((stage) => ({
  path: `${envName}.${stage}`,
  set: (e, v) => e.setEnvStage(envName, stage, v)
}));

// Order matches the original preset loader: oscillators, mixer, filter, envelopes, LFOs, FX, performance
const SYNTH_PARAMS = [
  { path: 'vco1.wave', set: (e, v) => e.setVCO1Wave(v) },
  { path: 'vco1.octave', knob: 'vco1-octave', set: (e, v) => e.setVCO1Octave(v) },
  { path: 'vco1.pulseWidth', knob: 'vco1-pw', set: (e, v) => e.setVCO1PW(v) },

  { path: 'vco2.wave', set: (e, v) => e.setVCO2Wave(v) },
  { path: 'vco2.octave', knob: 'vco2-octave', set: (e, v) => e.setVCO2Octave(v) },
  { path: 'vco2.semitone', knob: 'vco2-semitone', set: (e, v) => e.setVCO2Semitone(v) },
  { path: 'vco2.detuneCents', knob: 'vco2-detune', set: (e, v) => e.setVCO2Detune(v) },
  { path: 'vco2.hardSync', set: (e, v) => e.setVCO2Sync(v) },

  { path: 'mixer.vco1Level', knob: 'mixer-vco1', set: (e, v) => e.setMixerVCO1(v) },
  { path: 'mixer.vco2Level', knob: 'mixer-vco2', set: (e, v) => e.setMixerVCO2(v) },
  { path: 'mixer.subLevel', knob: 'mixer-sub', set: (e, v) => e.setMixerSub(v) },
  { path: 'mixer.subOctave', set: (e, v) => e.setMixerSubOctave(v) },
  { path: 'mixer.noiseLevel', knob: 'mixer-noise', set: (e, v) => e.setMixerNoise(v) },

  { path: 'vcf.cutoff', knob: 'vcf-cutoff', set: (e, v) => e.setVCFCutoff(v) },
  { path: 'vcf.resonance', knob: 'vcf-resonance', set: (e, v) => e.setVCFResonance(v) },
  { path: 'vcf.type', set: (e, v) => e.setVCFType(v) },
  { path: 'vcf.drive', knob: 'vcf-drive', set: (e, v) => e.setVCFDrive(v) },
  { path: 'vcf.keyTrack', knob: 'vcf-keytrack', set: (e, v) => e.setVCFKeyTrack(v) },
  { path: 'vcf.envMod', knob: 'vcf-envmod', set: (e, v) => e.setVCFEnvMod(v) },

  ...envParams('filterEnv'),
  ...envParams('ampEnv'),
  ...lfoParams(1),
  ...lfoParams(2),

  { path: 'fx.chorus.mode', set: (e, v) => e.setChorusMode(v) },
  { path: 'fx.chorus.mix', knob: 'fx-chorus-mix', set: (e, v) => e.setChorusMix(v) },
  { path: 'fx.delay.time', knob: 'fx-delay-time', set: (e, v) => e.setDelayTime(v) },
  { path: 'fx.delay.feedback', knob: 'fx-delay-feedback', set: (e, v) => e.setDelayFeedback(v) },
  { path: 'fx.delay.mix', knob: 'fx-delay-mix', set: (e, v) => e.setDelayMix(v) },
  { path: 'fx.reverb.decay', knob: 'fx-reverb-decay', set: (e, v) => e.setReverbDecay(v) },
  { path: 'fx.reverb.mix', knob: 'fx-reverb-mix', set: (e, v) => e.setReverbMix(v) },

  { path: 'performance.glide', field: 'glideEnabled', set: (e, v) => e.setGlide(v) },
  { path: 'performance.octaveShift', field: 'octaveShift', set: (e, v) => e.setOctaveShift(v) }
];

const PARAMS_BY_PATH = new Map(SYNTH_PARAMS.map((p) => [p.path, p]));

const SynthParams = {
  list: SYNTH_PARAMS,

  getPath(obj, path) {
    return path.split('.').reduce((node, key) => (node == null ? undefined : node[key]), obj);
  },

  setPath(obj, path, value) {
    const keys = path.split('.');
    const last = keys.pop();
    const parent = keys.reduce((node, key) => (node[key] = node[key] || {}), obj);
    parent[last] = value;
  },

  byPath(path) {
    return PARAMS_BY_PATH.get(path);
  },

  /**
   * Knob ids are unique except the shared LFO knobs, which address the LFO selected in the UI
   */
  byKnob(knobId, lfoNum) {
    return SYNTH_PARAMS.find((p) => p.knob === knobId && (p.lfo === undefined || p.lfo === lfoNum));
  },

  read(engine, param) {
    return param.field ? engine[param.field] : this.getPath(engine, param.path);
  },

  set(engine, path, value) {
    const param = this.byPath(path);
    if (param) param.set(engine, value);
  },

  /**
   * Current patch as a plain nested preset state
   */
  readState(engine) {
    const state = {};
    for (const param of SYNTH_PARAMS) this.setPath(state, param.path, this.read(engine, param));
    return state;
  },

  /**
   * Applies every parameter present in a (possibly partial) preset state
   */
  applyState(engine, state) {
    for (const param of SYNTH_PARAMS) {
      const value = this.getPath(state, param.path);
      if (value !== undefined) param.set(engine, value);
    }
  }
};

window.SynthParams = SynthParams;
