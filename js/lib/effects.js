/**
 * SYNTH BLOCKS • STEREO EFFECTS
 * Bitcrusher, chorus (Juno-style BBD), ping-pong tape delay and convolution reverb. Each effect has
 * an input and an output node and mixes dry and wet internally. Settings are live objects
 * ({ bits, rate, mix }, { mode, mix }, { time, feedback, mix }, { decay, mix }); apply*() pushes
 * changes to the nodes.
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
   * STEREO TAPE DELAY: L/R delay lines at a 4:3 time ratio, each with a high-cut feedback loop
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

      this.delayL = ctx.createDelay(2.0);
      this.delayR = ctx.createDelay(2.0);
      this.delayL.delayTime.setValueAtTime(settings.time, now);
      this.delayR.delayTime.setValueAtTime(settings.time * Delay.STEREO_RATIO, now);

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

    applyTime() {
      const now = this.ctx.currentTime;
      this.delayL.delayTime.setTargetAtTime(this.settings.time, now, 0.03);
      this.delayR.delayTime.setTargetAtTime(this.settings.time * Delay.STEREO_RATIO, now, 0.03);
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

  Object.assign(blocks, { Crusher, Chorus, Delay, Reverb });
})((window.SynthBlocks = window.SynthBlocks || {}));
