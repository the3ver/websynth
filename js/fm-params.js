/**
 * FM-4 • PATCH PARAMETER TABLE
 * Every FM-4 patch parameter once (see SynthBlocks.ParamTable in js/lib/param-table.js).
 * Operators 1..4 are C, A, B1, B2 (FmAlgorithms). C and A have a ratio knob each; B1 and B2
 * share the watch-hand knob fm-b-ratio (bRatioStep, a knob-only view of op3/op4.ratio).
 * The ADSR faders edit the operator selected in the envelope tabs.
 */

const fmOpParams = (n) => [
  { path: `op${n}.ratio`, knob: n <= 2 ? `fm-op${n}-ratio` : undefined, set: (e, v) => e.setOpParam(n, 'ratio', v) },
  { path: `op${n}.detune`, knob: `fm-op${n}-detune`, set: (e, v) => e.setOpParam(n, 'detune', v) },
  { path: `op${n}.level`, knob: `fm-op${n}-level`, set: (e, v) => e.setOpParam(n, 'level', v) },
  ...SynthBlocks.ParamTable.envParams(`op${n}.env`)
];

const FM_PARAMS = [
  { path: 'algorithm', set: (e, v) => e.setAlgorithm(v) },
  { path: 'feedback', knob: 'fm-feedback', set: (e, v) => e.setFeedback(v) },
  { path: 'mix', knob: 'fm-mix', set: (e, v) => e.setMix(v) },
  ...fmOpParams(1),
  ...fmOpParams(2),
  ...fmOpParams(3),
  ...fmOpParams(4),
  { path: 'bRatioStep', knob: 'fm-b-ratio', preset: false, set: (e, v) => e.setBRatioStep(v) },

  { path: 'vibrato.rate', knob: 'fm-vib-rate', set: (e, v) => e.setVibratoRate(v) },
  { path: 'vibrato.depth', knob: 'fm-vib-depth', set: (e, v) => e.setVibratoDepth(v) },

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

const FmParams = new SynthBlocks.ParamTable(FM_PARAMS);

window.FmParams = FmParams;
