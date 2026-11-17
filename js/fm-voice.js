/**
 * FM-4 • SYNTH VOICE
 * Four SynthBlocks.Operators wired by the selected algorithm, one ADSR per operator, a vibrato
 * depth gain from the engine's LFO onto every operator's detune, and the carrier mix.
 * Built once on AudioContext startup and re-triggered without allocating nodes (Zero GC).
 * Reads the patch from its engine (algorithm, op1..op4, vibrato).
 */

const FM_OPERATORS = [1, 2, 3, 4];
const FM_VOICE_PEAK_GAIN = 0.4;

class FmVoice {
  constructor(engine, id) {
    this.engine = engine;
    this.id = id;
    this.isBusy = false;
    this.midiNote = null;
    this.startTime = 0;
    this.releaseStartTime = 0;
    this.baseFreq = 440;
    this.cleanupTimer = null;
    this.outputConnected = false;
    this.carriers = new Set();

    const ctx = engine.ctx;
    const now = ctx.currentTime;
    // Operators and their envelopes by number (index 0 unused)
    this.ops = [null];
    this.envelopes = [null];
    for (const n of FM_OPERATORS) {
      const op = new SynthBlocks.Operator(ctx, now);
      this.ops.push(op);
      this.envelopes.push(new SynthBlocks.Envelope(engine.getOp(n).env, { range: [0.0001, Infinity], holdOnTrigger: true }));
    }

    this.mix = ctx.createGain();
    this.mix.gain.setValueAtTime(FM_VOICE_PEAK_GAIN, now);

    // Vibrato: LFO (+-1) -> depth in cents -> every operator's detune
    this.vibrato = ctx.createGain();
    this.vibrato.gain.setValueAtTime(engine.vibratoCents(), now);
    if (engine.vibratoLfo) engine.vibratoLfo.output.connect(this.vibrato);
    for (const n of FM_OPERATORS) this.vibrato.connect(this.ops[n].detune);

    this.applyAlgorithm(now);
    for (const n of FM_OPERATORS) this.ops[n].start(0);
  }

  /**
   * Idle voices stay off the master bus, so silent voices cost no rendering
   */
  setOutputConnected(on) {
    if (on === this.outputConnected) return;
    if (on) this.mix.connect(this.engine.masterVoiceBus);
    else this.mix.disconnect();
    this.outputConnected = on;
  }

  /**
   * Rewires operator outputs for the engine's algorithm: modulators into frequency params,
   * carriers into the mix (scaled so more carriers do not get louder)
   */
  applyAlgorithm(now) {
    const { mods, carriers } = SynthBlocks.Operator.ALGORITHMS[this.engine.algorithm];
    for (const n of FM_OPERATORS) this.ops[n].disconnect();
    for (const [from, to] of mods) this.ops[from].connect(this.ops[to].frequency);
    for (const n of carriers) this.ops[n].connect(this.mix);
    this.carriers = new Set(carriers);
    this.mix.gain.setValueAtTime(FM_VOICE_PEAK_GAIN / carriers.length, now);
    this.updateScales(now);
  }

  // =========================================================================
  // NOTE LIFECYCLE
  // =========================================================================

  /**
   * Starts a note: operator pitches (with glide) and every operator envelope.
   * Returns the note frequency (the engine keeps it as glide source).
   */
  trigger(midiNote, velocity, now) {
    const engine = this.engine;
    if (this.cleanupTimer) {
      clearTimeout(this.cleanupTimer);
      this.cleanupTimer = null;
    }

    this.isBusy = true;
    this.setOutputConnected(true);
    this.midiNote = midiNote;
    this.startTime = now;
    this.releaseStartTime = 0;

    const baseFreq = this.noteFrequency(midiNote);
    this.baseFreq = baseFreq;
    const glideFrom = engine.glideEnabled && engine.lastFrequency ? engine.lastFrequency : null;

    for (const n of FM_OPERATORS) {
      const op = this.ops[n];
      const ratio = this.opRatio(n);
      const freq = baseFreq * ratio;
      op.frequency.cancelScheduledValues(now);
      if (glideFrom) {
        op.frequency.setValueAtTime(glideFrom * ratio, now);
        op.frequency.exponentialRampToValueAtTime(freq, now + engine.glideTime);
      } else {
        op.frequency.setValueAtTime(freq, now);
      }
      const peak = Math.max(0.0001, engine.getOp(n).level * velocity);
      this.envelopes[n].trigger([op.gain], now, { start: 0.00001, base: 0, peak });
    }
    this.updateScales(now);
    return baseFreq;
  }

  /**
   * Releases every operator; the voice frees itself once the longest tail has decayed
   */
  release(now) {
    this.releaseStartTime = now;
    let releaseTime = 0;
    for (const n of FM_OPERATORS) {
      try {
        this.envelopes[n].release([this.ops[n].gain], now, 0.0);
      } catch (e) {}
      releaseTime = Math.max(releaseTime, this.envelopes[n].releaseTime);
    }

    // 3x release = 9 time constants, about -78 dB
    const cleanupDelayMs = (releaseTime * 3 + 0.05) * 1000;
    if (this.cleanupTimer) clearTimeout(this.cleanupTimer);
    this.cleanupTimer = setTimeout(() => {
      if (this.releaseStartTime === now) {
        this.isBusy = false;
        this.midiNote = null;
        this.releaseStartTime = 0;
        this.setOutputConnected(false);
      }
    }, cleanupDelayMs);
  }

  /**
   * Fast fade to silence when the voice pool steals this voice
   */
  choke(now) {
    for (const n of FM_OPERATORS) {
      const gain = this.ops[n].gain;
      SynthBlocks.holdParam(gain, now);
      gain.setTargetAtTime(0.0, now, 0.002);
    }
  }

  // =========================================================================
  // LIVE PARAMETER UPDATES
  // =========================================================================

  noteFrequency(midiNote) {
    return this.engine.midiNoteToFrequency(midiNote) * this.engine.pitchBendFactor;
  }

  // Frequency ratio including the operator's fine detune in cents
  opRatio(n) {
    const { ratio, detune } = this.engine.getOp(n);
    return ratio * Math.pow(2, detune / 1200);
  }

  /**
   * Modulator depth follows the modulator frequency; carriers pass at unity
   */
  updateScales(now) {
    for (const n of FM_OPERATORS) {
      const scale = this.carriers.has(n) ? 1.0 : SynthBlocks.Operator.modulationScale(this.baseFreq * this.opRatio(n));
      this.ops[n].scaleParam.setValueAtTime(scale, now);
    }
  }

  /**
   * Re-tunes a sounding voice after octave, ratio, detune or pitch bend changes
   */
  updateFrequencies(now) {
    if (this.midiNote === null) return;
    this.baseFreq = this.noteFrequency(this.midiNote);
    for (const n of FM_OPERATORS) {
      this.ops[n].frequency.setTargetAtTime(this.baseFreq * this.opRatio(n), now, 0.015);
    }
    this.updateScales(now);
  }

  setVibratoCents(cents, now) {
    this.vibrato.gain.setTargetAtTime(cents, now, 0.02);
  }
}

window.FmVoice = FmVoice;
