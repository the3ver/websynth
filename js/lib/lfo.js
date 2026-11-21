/**
 * SYNTH BLOCKS • LFO
 * Low-frequency oscillator with Sample & Hold. Two sources sum into the output: the oscillator
 * (via its gate) for continuous waves and a constant source whose offset carries the held
 * S&H step. One LFO feeds any number of voices through their own depth gains.
 * Classic script: attaches to the window.SynthBlocks namespace.
 */
(function (blocks) {
  // Ramp time on source switches and S&H steps, keeps the edges free of clicks
  const SOURCE_RAMP = 0.005;
  const RATE_RAMP = 0.02;

  class Lfo {
    /**
     * @param {object} [options]
     * @param options.wave 'sine' | 'triangle' | 'sawtooth' | 'square' | 'samplehold'
     * @param options.rate Hz
     */
    constructor(ctx, { wave = 'triangle', rate = 1 } = {}) {
      const now = ctx.currentTime;
      this.ctx = ctx;
      this.wave = wave;
      this.rate = rate;
      this.heldValue = 0;
      this.shTimer = null;

      this.osc = ctx.createOscillator();
      this.output = ctx.createGain();
      this.osc.type = Lfo.oscType(wave);
      this.osc.frequency.setValueAtTime(rate, now);
      this.output.gain.setValueAtTime(1.0, now);

      this.oscGate = ctx.createGain();
      this.oscGate.gain.setValueAtTime(1.0, now);
      this.osc.connect(this.oscGate);
      this.oscGate.connect(this.output);
      this.osc.start();

      this.shSource = ctx.createConstantSource();
      this.shSource.offset.setValueAtTime(0, now);
      this.shSource.connect(this.output);
      this.shSource.start();

      this.applySource();
      this.startSampleAndHold();
    }

    // S&H runs the oscillator as a sawtooth, muted behind its gate
    static oscType(wave) {
      return wave === 'samplehold' ? 'sawtooth' : wave;
    }

    setWave(wave) {
      this.wave = wave;
      this.osc.type = Lfo.oscType(wave);
      this.applySource();
    }

    setRate(rate) {
      this.rate = rate;
      this.osc.frequency.setTargetAtTime(rate, this.ctx.currentTime, RATE_RAMP);
      this.startSampleAndHold();
    }

    /**
     * (Re)starts the S&H clock at the current rate (20 ms .. 2 s per step). Steps are drawn
     * only while the wave is samplehold.
     */
    startSampleAndHold() {
      if (this.shTimer) clearInterval(this.shTimer);
      const intervalMs = Math.max(20, Math.min(2000, 1000 / this.rate));
      this.shTimer = setInterval(() => {
        if (this.wave !== 'samplehold') return;
        this.heldValue = Math.random() * 2 - 1;
        this.applySource();
      }, intervalMs);
    }

    /**
     * Opens the oscillator gate for continuous waves, or holds the S&H step on the constant source
     */
    applySource() {
      const now = this.ctx.currentTime;
      const sh = this.wave === 'samplehold';
      this.oscGate.gain.setTargetAtTime(sh ? 0 : 1, now, SOURCE_RAMP);
      this.shSource.offset.setTargetAtTime(sh ? this.heldValue : 0, now, SOURCE_RAMP);
    }
  }

  Object.assign(blocks, { Lfo });
})((window.SynthBlocks = window.SynthBlocks || {}));
