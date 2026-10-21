/**
 * RETROVOX SUB-1 • KNOB SCALING & READOUT FORMATTING
 * Pure functions shared by all rotary knobs. spec = { type, min, max, step } from the knob's data-* attributes.
 */

const knobSign = (val) => (val > 0 ? '+' : '');
const OCTAVE_FOOTAGE = { '-2': "32'", '-1': "16'", '0': "8'", '1': "4'", '2': "2'" };

const READOUT_FORMATTERS = {
  octave: (val) => OCTAVE_FOOTAGE[String(Math.round(val))] || `${val}`,
  percent: (val) => `${Math.round(val * 100)}%`,
  'bipolar-percent': (val) => `${knobSign(val)}${Math.round(val * 100)}%`,
  cents: (val) => `${knobSign(val)}${Math.round(val)} CT`,
  semitone: (val) => `${knobSign(val)}${Math.round(val)} ST`,
  hz: (val) => {
    if (val >= 1000) return `${(val / 1000).toFixed(1)} kHz`;
    return val < 10 ? `${val.toFixed(1)} Hz` : `${Math.round(val)} Hz`;
  },
  res: (val) => `${val.toFixed(1)} Q`,
  time: (val) => (val < 1.0 ? `${Math.round(val * 1000)} ms` : `${val.toFixed(2)} s`),
  bpm: (val) => `${Math.round(val)}`
};

// Audio-range frequency knobs use a logarithmic travel
const isLogHzKnob = (spec) => spec.type === 'hz' && spec.min > 1;
const roundKnobHz = (val) => (val < 1000 ? Math.round(val) : Math.round(val / 10) * 10);

const KnobScale = {
  clampRatio(r) {
    return Math.max(0, Math.min(1, r));
  },

  formatReadout(type, val) {
    const format = READOUT_FORMATTERS[type];
    return format ? format(val) : `${val}`;
  },

  valueToRatio(spec, val) {
    if (isLogHzKnob(spec)) return Math.log(val / spec.min) / Math.log(spec.max / spec.min);
    return (val - spec.min) / (spec.max - spec.min);
  },

  ratioToValue(spec, ratio) {
    if (isLogHzKnob(spec)) return spec.min * Math.pow(spec.max / spec.min, ratio);
    return spec.min + (ratio * (spec.max - spec.min));
  },

  /**
   * Rounding applied while dragging
   */
  quantizeDrag(spec, val) {
    if (isLogHzKnob(spec)) return roundKnobHz(val);
    if (spec.type === 'hz') return Math.round(val * 20) / 20;
    if (spec.type === 'bpm' || spec.step >= 1) return Math.round(val / spec.step) * spec.step;
    if (spec.type === 'res') return Math.round(val * 10) / 10;
    return Math.round(val * 100) / 100;
  },

  /**
   * Rounding applied on mouse-wheel steps
   */
  quantizeWheel(spec, val) {
    if (isLogHzKnob(spec)) return roundKnobHz(val);
    if (spec.step >= 1) return Math.round(val);
    return val;
  }
};

window.KnobScale = KnobScale;
