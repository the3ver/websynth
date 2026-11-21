/**
 * SYNTH BLOCKS • STEREO EFFECTS
 * Bitcrusher, chorus (Juno-style BBD), ping-pong tape delay and convolution reverb. Each effect has
 * an input and an output node and mixes dry and wet internally. Settings are live objects
 * ({ bits, rate, mix }, { mode, mix }, { time, sync, division, bpm, feedback, mix }, { decay, mix });
 * apply*() pushes changes to the nodes.
 * The delay runs on free time (seconds) or, with sync, on a note value (Delay.DIVISIONS) at the
 * clock tempo bpm; Delay.noteSeconds() converts.
 * Classic script: attaches to the window.SynthBlocks namespace.
 */
(function (blocks) {
  const PARAM_RAMP = 0.02;

  function unityGain(ctx, now) {
    const g = ctx.createGain();
    g.gain.setValueAtTime(1.0, now);
    return g;
  }

  /**
   * BITCRUSHER: crossfades the dry signal with the 'bitcrusher' worklet node
   * (js/worklets/crusher-processor.js). The node arrives via attach() once its module loaded;
   * the input feeds it only while mix > 0, so a bypassed crusher costs no DSP time.
   */
  class Crusher {
    constructor(ctx, settings) {
      const now = ctx.currentTime;
      this.ctx = ctx;
      this.settings = settings;
      this.node = null;
      this.feeding = false;
      this.input = unityGain(ctx, now);
      this.output = unityGain(ctx, now);

      this.dryGain = ctx.createGain();
      this.wetGain = ctx.createGain();
      this.dryGain.gain.setValueAtTime(1 - settings.mix, now);
      this.wetGain.gain.setValueAtTime(settings.mix, now);

      this.input.connect(this.dryGain);
      this.dryGain.connect(this.output);
      this.wetGain.connect(this.output);
    }

    attach(node) {
      this.node = node;
      node.connect(this.wetGain);
      this.applyBits();
      this.applyRate();
      this.updateFeed();
    }

    applyBits() {
      if (!this.node) return;
      this.node.parameters.get('bits').setTargetAtTime(this.settings.bits, this.ctx.currentTime, PARAM_RAMP);
    }

    applyRate() {
      if (!this.node) return;
      this.node.parameters.get('rate').setTargetAtTime(this.settings.rate, this.ctx.currentTime, PARAM_RAMP);
    }

    applyMix() {
      const now = this.ctx.currentTime;
      this.dryGain.gain.setTargetAtTime(1 - this.settings.mix, now, PARAM_RAMP);
      this.wetGain.gain.setTargetAtTime(this.settings.mix, now, PARAM_RAMP);
      this.updateFeed();
    }

    updateFeed() {
      const wanted = this.node !== null && this.settings.mix > 0;
      if (wanted === this.feeding) return;
      if (wanted) this.input.connect(this.node);
      else this.input.disconnect(this.node);
      this.feeding = wanted;
    }
  }

  /**
   * JUNO STEREO BBD CHORUS: two short delays modulated by one LFO in counter-phase
   */
  class Chorus {
    constructor(ctx, settings) {
      const now = ctx.currentTime;
      this.ctx = ctx;
      this.settings = settings;
      this.input = unityGain(ctx, now);

      this.dryGain = ctx.createGain();
      this.wetGain = ctx.createGain();
      this.dryGain.gain.setValueAtTime(1.0, now);
      this.wetGain.gain.setValueAtTime(settings.mode === 'off' ? 0.0 : settings.mix, now);

      this.delayL = ctx.createDelay(0.1);
      this.delayR = ctx.createDelay(0.1);
      this.delayL.delayTime.setValueAtTime(0.018, now);
      this.delayR.delayTime.setValueAtTime(0.018, now);

      // Counter-phase LFO modulation
      this.lfo = ctx.createOscillator();
      this.lfo.type = 'sine';
      this.lfo.frequency.setValueAtTime(0.5, now);

      this.lfoGainL = ctx.createGain();
      this.lfoGainR = ctx.createGain();
      this.lfoGainL.gain.setValueAtTime(0.0035, now);
      this.lfoGainR.gain.setValueAtTime(-0.0035, now); // 180° inverted phase for stereo width

      this.lfo.connect(this.lfoGainL);
      this.lfo.connect(this.lfoGainR);
      this.lfoGainL.connect(this.delayL.delayTime);
      this.lfoGainR.connect(this.delayR.delayTime);
      this.lfo.start();

      const merger = ctx.createChannelMerger(2);
      this.delayL.connect(merger, 0, 0);
      this.delayR.connect(merger, 0, 1);

      this.output = ctx.createGain();
      this.input.connect(this.dryGain);
      this.input.connect(this.delayL);
      this.input.connect(this.delayR);

      this.dryGain.connect(this.output);
      merger.connect(this.wetGain);
      this.wetGain.connect(this.output);
    }

    applyMode() {
      const now = this.ctx.currentTime;
      const { mode, mix } = this.settings;
      const [rate, depth] = Chorus.MODES[mode] || [0.5, 0.0035];
      const wet = mode === 'off' ? 0.0 : mix;

      this.wetGain.gain.setTargetAtTime(wet, now, PARAM_RAMP);
      this.lfo.frequency.setTargetAtTime(rate, now, PARAM_RAMP);
      this.lfoGainL.gain.setTargetAtTime(depth, now, PARAM_RAMP);
      this.lfoGainR.gain.setTargetAtTime(-depth, now, PARAM_RAMP);
    }

    applyMix() {
      if (this.settings.mode === 'off') return;
      this.wetGain.gain.setTargetAtTime(this.settings.mix, this.ctx.currentTime, PARAM_RAMP);
    }
  }

  /**
   * STEREO TAPE DELAY: L/R delay lines at a 4:3 time ratio, each with a high-cut feedback loop.
   * Free mode uses settings.time, sync mode settings.division at settings.bpm; longer times clamp
   * so the right line stops at MAX_TIME and the 4:3 spread stays.
   */
  class Delay {
    constructor(ctx, settings) {
      const now = ctx.currentTime;
      this.ctx = ctx;
      this.settings = settings;
      this.input = unityGain(ctx, now);

      this.dryGain = ctx.createGain();
      this.wetGain = ctx.createGain();
      this.dryGain.gain.setValueAtTime(1.0, now);
      this.wetGain.gain.setValueAtTime(settings.mix, now);

      this.delayL = ctx.createDelay(Delay.MAX_TIME);
      this.delayR = ctx.createDelay(Delay.MAX_TIME);
      const [timeL, timeR] = this.lineTimes();
      this.delayL.delayTime.setValueAtTime(timeL, now);
      this.delayR.delayTime.setValueAtTime(timeR, now);

      this.filterL = ctx.createBiquadFilter();
      this.filterR = ctx.createBiquadFilter();
      this.filterL.type = 'lowpass';
      this.filterR.type = 'lowpass';
      this.filterL.frequency.setValueAtTime(2800, now);
      this.filterR.frequency.setValueAtTime(2800, now);

      this.feedbackGainL = ctx.createGain();
      this.feedbackGainR = ctx.createGain();
      this.feedbackGainL.gain.setValueAtTime(settings.feedback, now);
      this.feedbackGainR.gain.setValueAtTime(settings.feedback, now);

      // Feedback loops with tape high-cut
      this.delayL.connect(this.filterL);
      this.filterL.connect(this.feedbackGainL);
      this.feedbackGainL.connect(this.delayL);

      this.delayR.connect(this.filterR);
      this.filterR.connect(this.feedbackGainR);
      this.feedbackGainR.connect(this.delayR);

      const merger = ctx.createChannelMerger(2);
      this.delayL.connect(merger, 0, 0);
      this.delayR.connect(merger, 0, 1);

      this.output = ctx.createGain();
      this.input.connect(this.dryGain);
      this.input.connect(this.delayL);
      this.input.connect(this.delayR);

      this.dryGain.connect(this.output);
      merger.connect(this.wetGain);
      this.wetGain.connect(this.output);
    }

    /**
     * [left, right] delay line times in seconds for the current settings
     */
    lineTimes() {
      const { time, sync, division, bpm } = this.settings;
      const base = Math.min(sync ? Delay.noteSeconds(division, bpm) : time, Delay.MAX_TIME / Delay.STEREO_RATIO);
      return [base, base * Delay.STEREO_RATIO];
    }

    /**
     * Seconds of a note value ('1/8', dotted '1/8d', triplet '1/8t') at bpm quarter notes per minute
     */
    static noteSeconds(division, bpm) {
      const [, denominator, kind] = /^1\/(\d+)([dt]?)$/.exec(division) || [null, '8', ''];
      const factor = kind === 'd' ? 1.5 : kind === 't' ? 2 / 3 : 1;
      return ((4 / Number(denominator)) * factor * 60) / bpm;
    }

    applyTime() {
      const now = this.ctx.currentTime;
      const [timeL, timeR] = this.lineTimes();
      this.delayL.delayTime.setTargetAtTime(timeL, now, 0.03);
      this.delayR.delayTime.setTargetAtTime(timeR, now, 0.03);
    }

    applyFeedback() {
      const now = this.ctx.currentTime;
      this.feedbackGainL.gain.setTargetAtTime(this.settings.feedback, now, PARAM_RAMP);
      this.feedbackGainR.gain.setTargetAtTime(this.settings.feedback, now, PARAM_RAMP);
    }

    applyMix() {
      this.wetGain.gain.setTargetAtTime(this.settings.mix, this.ctx.currentTime, PARAM_RAMP);
    }
  }

  /**
   * STUDIO REVERB: convolution with a generated stereo noise impulse
   */
  class Reverb {
    constructor(ctx, settings) {
      const now = ctx.currentTime;
      this.ctx = ctx;
      this.settings = settings;
      this.input = unityGain(ctx, now);
      this.output = unityGain(ctx, now);

      this.dryGain = ctx.createGain();
      this.wetGain = ctx.createGain();
      this.dryGain.gain.setValueAtTime(1.0, now);
      this.wetGain.gain.setValueAtTime(settings.mix, now);

      this.convolver = ctx.createConvolver();
      this.applyDecay();

      this.input.connect(this.dryGain);
      this.input.connect(this.convolver);

      this.dryGain.connect(this.output);
      this.convolver.connect(this.wetGain);
      this.wetGain.connect(this.output);
    }

    /**
     * Regenerates the stereo noise impulse response (0.5..8 s) for the current decay time
     */
    applyDecay() {
      const decayTime = this.settings.decay;
      const rate = this.ctx.sampleRate;
      const length = Math.max(0.5, Math.min(8.0, decayTime)) * rate;
      const impulse = this.ctx.createBuffer(2, length, rate);
      const left = impulse.getChannelData(0);
      const right = impulse.getChannelData(1);
      const decayConstant = 3.5 / decayTime;

      for (let i = 0; i < length; i++) {
        const envelope = Math.exp(-(i / rate) * decayConstant);
        left[i] = (Math.random() * 2 - 1) * envelope;
        right[i] = (Math.random() * 2 - 1) * envelope;
      }

      this.convolver.buffer = impulse;
    }

    applyMix() {
      this.wetGain.gain.setTargetAtTime(this.settings.mix, this.ctx.currentTime, PARAM_RAMP);
    }
  }

  // [LFO rate Hz, delay modulation depth s] per chorus mode; 'off' and unknown modes use the default
  Chorus.MODES = { I: [0.45, 0.003], II: [0.85, 0.0045], 'I+II': [1.35, 0.0065] };
  Delay.STEREO_RATIO = 1.333;
  // Longest time a delay line holds (seconds); the left line stops at MAX_TIME / STEREO_RATIO (3 s)
  Delay.MAX_TIME = 4.0;
  // Note values of the synced delay, shortest first (the order of the NOTE knob)
  Delay.DIVISIONS = [
    '1/16t',
    '1/16',
    '1/16d',
    '1/8t',
    '1/8',
    '1/8d',
    '1/4t',
    '1/4',
    '1/4d',
    '1/2t',
    '1/2',
    '1/2d',
    '1/1'
  ];

  Object.assign(blocks, { Crusher, Chorus, Delay, Reverb });
})(/** @type {any} */ (window.SynthBlocks = window.SynthBlocks || {}));
