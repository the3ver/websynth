/**
 * SYNTH BLOCKS • MULTI-MODE FILTER
 * Two cascaded BiquadFilters with per-mode Q staging: 24 dB modes run both stages,
 * lowpass12 turns the second stage into a flat allpass.
 * Classic script: attaches to the window.SynthBlocks namespace.
 */
(function (blocks) {
  // Per mode: [stage 1 type, stage 2 type, stage 1 Q, stage 2 Q]; a Q is a fixed value or
  // [lo, hi, factor] = clamp(resonance * factor, lo, hi)
  const FILTER_MODES = {
    lowpass24: ['lowpass', 'lowpass', [0.5, 7.5, 0.38], [0.5, 9.0, 0.48]],
    lowpass12: ['lowpass', 'allpass', [0.5, 14.0, 0.7], 0.1],
    bandpass: ['bandpass', 'bandpass', [0.6, 8.0, 0.42], [0.6, 8.0, 0.42]],
    highpass: ['highpass', 'highpass', [0.5, 7.5, 0.38], [0.5, 9.0, 0.48]]
  };

  const MIN_CUTOFF = 20;
  const MAX_CUTOFF = 20000;

  function stageQ(spec, resonance) {
    if (!Array.isArray(spec)) return spec;
    const [lo, hi, factor] = spec;
    return Math.max(lo, Math.min(hi, resonance * factor));
  }

  class Filter {
    constructor(ctx) {
      this.ctx = ctx;
      this.stage1 = ctx.createBiquadFilter();
      this.stage2 = ctx.createBiquadFilter();
      this.stage1.connect(this.stage2);
      this.input = this.stage1;
      this.output = this.stage2;
      // Envelope and modulation targets: both stages move together
      this.frequencyParams = [this.stage1.frequency, this.stage2.frequency];
      this.detuneParams = [this.stage1.detune, this.stage2.detune];
    }

    /**
     * Sets stage types, Q staging and cutoff (clamped to 20..20000 Hz). Unknown modes are ignored.
     */
    configure(mode, resonance, cutoff, now = this.ctx.currentTime) {
      const spec = FILTER_MODES[mode];
      if (!spec) return;
      const [type1, type2, q1, q2] = spec;
      const safeCutoff = Math.max(MIN_CUTOFF, Math.min(MAX_CUTOFF, cutoff));

      this.stage1.type = type1;
      this.stage2.type = type2;
      this.stage1.frequency.setValueAtTime(safeCutoff, now);
      this.stage2.frequency.setValueAtTime(safeCutoff, now);
      this.stage1.Q.setValueAtTime(stageQ(q1, resonance), now);
      this.stage2.Q.setValueAtTime(stageQ(q2, resonance), now);
    }
  }

  Filter.MODES = Object.keys(FILTER_MODES);
  Filter.MIN_CUTOFF = MIN_CUTOFF;
  Filter.MAX_CUTOFF = MAX_CUTOFF;

  Object.assign(blocks, { Filter });
})(window.SynthBlocks = window.SynthBlocks || {});
