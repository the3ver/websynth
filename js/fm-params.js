/**
 * FM-4 • PATCH PARAMETER TABLE
 * Every FM-4 patch parameter once (see SynthBlocks.ParamTable in js/lib/param-table.js).
 * Operator knobs are unique per operator (fm-op1-ratio ...); the ADSR faders edit the operator
 * selected in the envelope tabs.
 */

const fmOpParams = (n) => [
  { path: `op${n}.ratio`, knob: `fm-op${n}-ratio`, set: (e, v) => e.setOpParam(n, 'ratio', v) },
  { path: `op${n}.detune`, knob: `fm-op${n}-detune`, set: (e, v) => e.setOpParam(n, 'detune', v) },
  { path: `op${n}.level`, knob: `fm-op${n}-level`, set: (e, v) => e.setOpParam(n, 'level', v) },
  ...SynthBlocks.ParamTable.envParams(`op${n}.env`)
];

const FM_PARAMS = [
  { path: 'algorithm', set: (e, v) => e.setAlgorithm(v) },
  ...fmOpParams(1),
  ...fmOpParams(2),
  ...fmOpParams(3),
  ...fmOpParams(4),

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
