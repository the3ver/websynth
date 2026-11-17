/**
 * FM-4 • FM SYNTH ENGINE
 * Four sine operators per voice in one of 8 algorithms (SynthBlocks.Operator.ALGORITHMS),
 * per-operator ratio, fine detune, level and ADSR, plus a sine vibrato LFO that the mod wheel
 * deepens. Polyphony, FX rack, master bus, MIDI and presets come from PolySynthEngine.
 */

// Vibrato depth in cents at depth (or mod wheel) 1.0
const FM_VIBRATO_CENTS = 50;

class FmEngine extends PolySynthEngine {
  constructor() {
    super({ params: FmParams, maxVoices: 12 });
    this.algorithm = 1; // 1..8

    const op = (ratio, level, env) => ({ ratio, detune: 0, level, env });
    this.op1 = op(1, 0.8, { attack: 0.005, decay: 0.8, sustain: 0.6, release: 0.4 });
    this.op2 = op(1, 0.35, { attack: 0.005, decay: 0.6, sustain: 0.3, release: 0.4 });
    this.op3 = op(2, 0.0, { attack: 0.005, decay: 0.5, sustain: 0.2, release: 0.4 });
    this.op4 = op(3, 0.0, { attack: 0.005, decay: 0.4, sustain: 0.1, release: 0.4 });

    this.vibrato = {
      rate: 5.0,  // 0.1 to 12 Hz
      depth: 0.0  // 0.0 to 1.0
    };
    this.vibratoLfo = null;
  }

  getOp(n) {
    return this[`op${n}`];
  }

  initInstrument() {
    this.vibratoLfo = new SynthBlocks.Lfo(this.ctx, { wave: 'sine', rate: this.vibrato.rate });
  }

  createVoice(id) {
    return new FmVoice(this, id);
  }

  // Mod wheel adds vibrato on top of the patch depth
  vibratoCents() {
    return Math.max(this.vibrato.depth, this.modWheelValue) * FM_VIBRATO_CENTS;
  }

  // =========================================================================
  // PATCH SETTERS
  // =========================================================================

  setAlgorithm(algorithm) {
    const n = parseInt(algorithm, 10);
    if (!SynthBlocks.Operator.ALGORITHMS[n]) return;
    this.algorithm = n;
    this.forEachVoice((voice, now) => voice.applyAlgorithm(now));
  }

  /**
   * ratio 0.5..16, detune -50..+50 cents, level 0..1 (the level applies from the next note)
   */
  setOpParam(n, param, val) {
    const op = this.getOp(n);
    if (!op) return;
    const v = parseFloat(val);
    switch (param) {
      case 'ratio':
        op.ratio = Math.max(0.5, Math.min(16, v));
        this.updateAllVoiceFrequencies();
        break;
      case 'detune':
        op.detune = Math.max(-50, Math.min(50, v));
        this.updateAllVoiceFrequencies();
        break;
      case 'level':
        op.level = Math.max(0, Math.min(1, v));
        break;
    }
  }

  setVibratoRate(val) {
    this.vibrato.rate = Math.max(0.1, Math.min(12, parseFloat(val)));
    if (this.vibratoLfo) this.vibratoLfo.setRate(this.vibrato.rate);
  }

  setVibratoDepth(val) {
    this.vibrato.depth = Math.max(0, Math.min(1, parseFloat(val)));
    this.applyVibrato();
  }

  onModWheelChange() {
    this.applyVibrato();
  }

  applyVibrato() {
    const cents = this.vibratoCents();
    this.forEachVoice((voice, now) => voice.setVibratoCents(cents, now));
  }
}

window.FmEngine = FmEngine;
