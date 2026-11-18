/**
 * FM-4 • SYNTH VOICE
 * One 'fm4-voice' AudioWorkletNode (js/worklets/fm-voice-processor.js) renders the four operators
 * C, A, B1, B2 in the selected algorithm. This class drives its AudioParams: operator frequencies
 * (ratio, fine detune, glide), one ADSR per operator on the operator gains, vibrato on the shared
 * detune, plus algorithm, feedback and X/Y mix.
 * Built once after the worklet module loaded and re-triggered without allocating nodes (Zero GC).
 * Reads the patch from its engine (algorithm, feedback, mix, op1..op4, vibrato).
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

    const ctx = engine.ctx;
    const now = ctx.currentTime;
    this.node = new AudioWorkletNode(ctx, 'fm4-voice', {
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [1],
      processorOptions: { algorithms: FmAlgorithms.ALGORITHMS }
    });
    const param = (name) => this.node.parameters.get(name);

    // Operator params by number (index 0 unused): { frequency, gain }
    this.ops = [null];
    this.envelopes = [null];
    for (const n of FM_OPERATORS) {
      this.ops.push({ frequency: param(`freq${n}`), gain: param(`gain${n}`) });
      this.envelopes.push(new SynthBlocks.Envelope(engine.getOp(n).env, { range: [0.0001, Infinity], holdOnTrigger: true }));
    }
    this.detune = param('detune');
    this.algorithmParam = param('algorithm');
    this.feedbackParam = param('feedback');
    this.mixParam = param('mix');

    this.mix = ctx.createGain();
    this.mix.gain.setValueAtTime(FM_VOICE_PEAK_GAIN, now);
    this.node.connect(this.mix);

    // Vibrato: LFO (+-1) -> depth in cents -> shared operator detune
    this.vibrato = ctx.createGain();
    this.vibrato.gain.setValueAtTime(engine.vibratoCents(), now);
    if (engine.vibratoLfo) engine.vibratoLfo.output.connect(this.vibrato);
    this.vibrato.connect(this.detune);

    this.applyAlgorithm(now);
    this.applyFeedback(now);
    this.applyMix(now);
  }

  /**
   * Idle voices stay off the master bus; the worklet skips its sines while every envelope rests
   */
  setOutputConnected(on) {
    if (on === this.outputConnected) return;
    if (on) this.mix.connect(this.engine.masterVoiceBus);
    else this.mix.disconnect();
    this.outputConnected = on;
  }

  applyAlgorithm(now) {
    this.algorithmParam.setValueAtTime(this.engine.algorithm, now);
  }

  applyFeedback(now) {
    this.feedbackParam.setValueAtTime(this.engine.feedback, now);
  }

  applyMix(now) {
    this.mixParam.setValueAtTime(this.engine.mix, now);
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
   * Re-tunes a sounding voice after octave, ratio, detune or pitch bend changes
   */
  updateFrequencies(now) {
    if (this.midiNote === null) return;
    this.baseFreq = this.noteFrequency(this.midiNote);
    for (const n of FM_OPERATORS) {
      this.ops[n].frequency.setTargetAtTime(this.baseFreq * this.opRatio(n), now, 0.015);
    }
  }

  setVibratoCents(cents, now) {
    this.vibrato.gain.setTargetAtTime(cents, now, 0.02);
  }
}

window.FmVoice = FmVoice;
