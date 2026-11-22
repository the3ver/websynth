/**
 * SYNTH BLOCKS • ADSR ENVELOPE
 * Schedules an ADSR shape on any AudioParams (VCA gain, filter frequency, ...).
 * Owns no audio nodes: one Envelope drives the params of a voice without allocating anything.
 * Classic script: attaches to the window.SynthBlocks namespace.
 */
(function (blocks) {
  /**
   * Freezes an AudioParam at its current value (falls back to cancelScheduledValues on old Safari)
   */
  function holdParam(param, now) {
    if (param.cancelAndHoldAtTime) {
      param.cancelAndHoldAtTime(now);
    } else {
      param.cancelScheduledValues(now);
    }
  }

  class Envelope {
    /**
     * @param stages live { attack, decay, release } in seconds and sustain 0..1, read on every
     *   trigger and release, so knob changes apply to the next note
     * @param {object} [options]
     * @param [options.range] [lo, hi] clamp for the sustain level
     * @param [options.holdOnTrigger] true: freeze the running value before jumping to the start
     *   level (VCA), false: drop pending events (filter)
     * @param [options.minStageTime] shortest attack/decay, keeps exponential ramps click-free
     * @param [options.minReleaseTime] shortest release
     */
    constructor(
      stages,
      { range = [-Infinity, Infinity], holdOnTrigger = false, minStageTime = 0.004, minReleaseTime = 0.008 } = {}
    ) {
      this.stages = stages;
      this.range = range;
      this.holdOnTrigger = holdOnTrigger;
      this.minStageTime = minStageTime;
      this.minReleaseTime = minReleaseTime;
    }

    get releaseTime() {
      return Math.max(this.minReleaseTime, this.stages.release);
    }

    /**
     * Attack and decay: jump to start, exponential ramp to peak, then to the sustain level
     * base + (peak - base) * sustain. base defaults to start.
     */
    trigger(params, now, { start, peak, base = start }) {
      const { attack, decay, sustain } = this.stages;
      const attackTime = Math.max(this.minStageTime, attack);
      const decayTime = Math.max(this.minStageTime, decay);
      const [lo, hi] = this.range;
      const sustainLevel = Math.max(lo, Math.min(hi, base + (peak - base) * sustain));

      for (const param of params) {
        if (this.holdOnTrigger) holdParam(param, now);
        else param.cancelScheduledValues(now);
        param.setValueAtTime(start, now);
        param.exponentialRampToValueAtTime(peak, now + attackTime);
        param.exponentialRampToValueAtTime(sustainLevel, now + attackTime + decayTime);
      }
    }

    /**
     * Looping attack/decay (LFO-like): peak, down to the sustain level, back to peak ... from
     * `from` until at least `until`. first: jump to start before the first attack (note on);
     * later calls continue from the level the last cycle ended on. Returns the end of the last
     * scheduled cycle, where the next call continues. cycleScale() is called once per cycle and
     * stretches that cycle's attack and decay (default 1: every cycle alike).
     */
    loop(params, from, until, { start, peak, base = start, first = false, cycleScale = () => 1 }) {
      const { attack, decay, sustain } = this.stages;
      const attackTime = Math.max(this.minStageTime, attack);
      const decayTime = Math.max(this.minStageTime, decay);
      const [lo, hi] = this.range;
      const sustainLevel = Math.max(lo, Math.min(hi, base + (peak - base) * sustain));

      for (const param of params) {
        if (first) {
          param.cancelScheduledValues(from);
          param.setValueAtTime(start, from);
        }
      }
      let t = from;
      do {
        const scale = cycleScale();
        const cycleAttack = attackTime * scale;
        const cycleDecay = decayTime * scale;
        for (const param of params) {
          param.exponentialRampToValueAtTime(peak, t + cycleAttack);
          param.exponentialRampToValueAtTime(sustainLevel, t + cycleAttack + cycleDecay);
        }
        t += cycleAttack + cycleDecay;
      } while (t < until);
      return t;
    }

    /**
     * Asymptotic release towards target: three time constants per release time
     */
    release(params, now, target) {
      const timeConstant = Math.max(0.003, this.releaseTime / 3.0);
      for (const param of params) {
        holdParam(param, now);
        param.setTargetAtTime(target, now, timeConstant);
      }
    }
  }

  Object.assign(blocks, { holdParam, Envelope });
})(/** @type {any} */ (window.SynthBlocks = window.SynthBlocks || {}));
