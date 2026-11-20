/**
 * RETROVOX SUB-1 • PATCH PARAMETER TABLE
 * Every SUB-1 patch parameter once (see SynthBlocks.ParamTable in js/lib/param-table.js).
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

const envParams = SynthBlocks.ParamTable.envParams;

// Order matches the original preset loader: oscillators, mixer, filter, envelopes, LFOs, FX, performance
const SYNTH_PARAMS = [
  { path: 'vco1.wave', set: (e, v) => e.setVCO1Wave(v) },
  { path: 'vco1.octave', knob: 'vco1-octave', set: (e, v) => e.setVCO1Octave(v) },
  { path: 'vco1.semitone', knob: 'vco1-semitone', set: (e, v) => e.setVcoSemitone(1, v) },
  { path: 'vco1.detuneCents', knob: 'vco1-detune', set: (e, v) => e.setVcoDetune(1, v) },
  { path: 'vco1.pulseWidth', knob: 'vco1-pw', set: (e, v) => e.setVCO1PW(v) },

  { path: 'vco2.wave', set: (e, v) => e.setVCO2Wave(v) },
  { path: 'vco2.octave', knob: 'vco2-octave', set: (e, v) => e.setVCO2Octave(v) },
  { path: 'vco2.semitone', knob: 'vco2-semitone', set: (e, v) => e.setVCO2Semitone(v) },
  { path: 'vco2.detuneCents', knob: 'vco2-detune', set: (e, v) => e.setVCO2Detune(v) },
  { path: 'vco2.pulseWidth', knob: 'vco2-pw', set: (e, v) => e.setVcoPW(2, v) },
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

  ...SynthBlocks.ParamTable.matrixParams(SynthBlocks.ModMatrix.SLOTS),
  ...SynthBlocks.ParamTable.fxParams(),

  { path: 'performance.glide', field: 'glideEnabled', set: (e, v) => e.setGlide(v) },
  { path: 'performance.octaveShift', field: 'octaveShift', set: (e, v) => e.setOctaveShift(v) }
];

const SynthParams = new SynthBlocks.ParamTable(SYNTH_PARAMS);

window.SynthParams = SynthParams;
