/**
 * RETROVOX SUB-1 • KNOB SCALING & READOUT FORMATTING
 * Pure functions shared by all rotary knobs. spec = { type, min, max, step, values? } from the knob's
 * data-* attributes. A knob with data-values="0.25,0.5,1,..." steps through that list only.
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
  bpm: (val) => `${Math.round(val)}`,
  bits: (val) => `${Math.round(val)} BIT`,
  ratio: (val) => `${Number.isInteger(val) ? val : val.toFixed(2).replace(/0$/, '')}:1`,
  // FM-4 watch-hand B1/B2 ratio step (js/fm-algorithms.js)
  bratio: (val) => (window.FmAlgorithms ? window.FmAlgorithms.formatB(val) : `${val}`)
};

const nearestListIndex = (list, val) => {
  let best = 0;
  for (let i = 1; i < list.length; i++) {
    if (Math.abs(list[i] - val) < Math.abs(list[best] - val)) best = i;
  }
  return best;
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
    if (spec.values) return nearestListIndex(spec.values, val) / (spec.values.length - 1);
    if (isLogHzKnob(spec)) return Math.log(val / spec.min) / Math.log(spec.max / spec.min);
    return (val - spec.min) / (spec.max - spec.min);
  },

  ratioToValue(spec, ratio) {
    if (spec.values) return spec.values[Math.round(this.clampRatio(ratio) * (spec.values.length - 1))];
    if (isLogHzKnob(spec)) return spec.min * Math.pow(spec.max / spec.min, ratio);
    return spec.min + (ratio * (spec.max - spec.min));
  },

  /**
   * Rounding applied while dragging
   */
  quantizeDrag(spec, val) {
    if (spec.values) return val;
    if (isLogHzKnob(spec)) return roundKnobHz(val);
    if (spec.type === 'ratio') return Math.round(val / spec.step) * spec.step;
    if (spec.type === 'hz') return Math.round(val * 20) / 20;
    if (spec.type === 'bpm' || spec.step >= 1) return Math.round(val / spec.step) * spec.step;
    if (spec.type === 'res') return Math.round(val * 10) / 10;
    return Math.round(val * 100) / 100;
  },

  /**
   * Value one wheel notch up (dir = 1) or down (dir = -1): one entry on list knobs, one step on
   * the FM-4 B ratio knob (hundreds of steps), else 4 % of the travel
   */
  wheelStep(spec, val, dir) {
    if (spec.values) {
      const i = nearestListIndex(spec.values, val) + dir;
      return spec.values[Math.max(0, Math.min(spec.values.length - 1, i))];
    }
    if (spec.type === 'bratio') {
      return Math.max(spec.min, Math.min(spec.max, Math.round(val) + dir * spec.step));
    }
    const ratio = this.clampRatio(this.valueToRatio(spec, val) + dir * 0.04);
    return this.quantizeWheel(spec, this.ratioToValue(spec, ratio));
  },

  /**
   * Pixels of vertical drag for the full travel: the B ratio knob gets 3 px (fine: 8 px) per step
   */
  dragSpan(spec, fine) {
    const base = fine ? 450 : 130;
    if (spec.type !== 'bratio') return base;
    const steps = (spec.max - spec.min) / spec.step;
    return Math.max(base, steps * (fine ? 8 : 3));
  },

  /**
   * Rounding applied on mouse-wheel steps
   */
  quantizeWheel(spec, val) {
    if (spec.values) return val;
    if (isLogHzKnob(spec)) return roundKnobHz(val);
    if (spec.type === 'ratio') return Math.round(val / spec.step) * spec.step;
    if (spec.step >= 1) return Math.round(val);
    return val;
  }
};

window.KnobScale = KnobScale;
