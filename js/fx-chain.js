/**
 * RETROVOX SUB-1 • VINTAGE STEREO FX RACK
 * input -> Juno BBD Chorus -> Stereo Tape Delay (Ping-Pong + High-Cut) -> Studio Reverb -> output
 * Reads its settings from the shared fx parameter object (engine.fx); apply*() pushes changes to the nodes.
 */

class FXChain {
  constructor(ctx, fx, input, output) {
    this.ctx = ctx;
    this.fx = fx;
    const now = ctx.currentTime;

    // -----------------------------------------------------------------------
    // 1. JUNO STEREO BBD CHORUS
    // -----------------------------------------------------------------------
    this.chorusDryGain = this.ctx.createGain();
    this.chorusWetGain = this.ctx.createGain();
    this.chorusDryGain.gain.setValueAtTime(1.0, now);
    this.chorusWetGain.gain.setValueAtTime(this.fx.chorus.mode === 'off' ? 0.0 : this.fx.chorus.mix, now);

    this.chorusDelayL = this.ctx.createDelay(0.1);
    this.chorusDelayR = this.ctx.createDelay(0.1);
    this.chorusDelayL.delayTime.setValueAtTime(0.018, now);
    this.chorusDelayR.delayTime.setValueAtTime(0.018, now);

    // Counter-phase LFO Modulation
    this.chorusLfo = this.ctx.createOscillator();
    this.chorusLfo.type = 'sine';
    this.chorusLfo.frequency.setValueAtTime(0.5, now);

    this.chorusLfoGainL = this.ctx.createGain();
    this.chorusLfoGainR = this.ctx.createGain();
    this.chorusLfoGainL.gain.setValueAtTime(0.0035, now);
    this.chorusLfoGainR.gain.setValueAtTime(-0.0035, now); // 180° inverted phase for extreme stereo width

    this.chorusLfo.connect(this.chorusLfoGainL);
    this.chorusLfo.connect(this.chorusLfoGainR);
    this.chorusLfoGainL.connect(this.chorusDelayL.delayTime);
    this.chorusLfoGainR.connect(this.chorusDelayR.delayTime);
    this.chorusLfo.start();

    const chorusMerger = this.ctx.createChannelMerger(2);
    this.chorusDelayL.connect(chorusMerger, 0, 0);
    this.chorusDelayR.connect(chorusMerger, 0, 1);

    const chorusOutBus = this.ctx.createGain();
    input.connect(this.chorusDryGain);
    input.connect(this.chorusDelayL);
    input.connect(this.chorusDelayR);

    this.chorusDryGain.connect(chorusOutBus);
    chorusMerger.connect(this.chorusWetGain);
    this.chorusWetGain.connect(chorusOutBus);

    // -----------------------------------------------------------------------
    // 2. STEREO TAPE DELAY (Cross-Ping-Pong & High-Cut Feedback Filter)
    // -----------------------------------------------------------------------
    this.delayDryGain = this.ctx.createGain();
    this.delayWetGain = this.ctx.createGain();
    this.delayDryGain.gain.setValueAtTime(1.0, now);
    this.delayWetGain.gain.setValueAtTime(this.fx.delay.mix, now);

    this.delayL = this.ctx.createDelay(2.0);
    this.delayR = this.ctx.createDelay(2.0);
    this.delayL.delayTime.setValueAtTime(this.fx.delay.time, now);
    this.delayR.delayTime.setValueAtTime(this.fx.delay.time * 1.333, now); // Spatial stereo ratio

    this.delayFilterL = this.ctx.createBiquadFilter();
    this.delayFilterR = this.ctx.createBiquadFilter();
    this.delayFilterL.type = 'lowpass';
    this.delayFilterR.type = 'lowpass';
    this.delayFilterL.frequency.setValueAtTime(2800, now);
    this.delayFilterR.frequency.setValueAtTime(2800, now);

    this.delayFeedbackGainL = this.ctx.createGain();
    this.delayFeedbackGainR = this.ctx.createGain();
    this.delayFeedbackGainL.gain.setValueAtTime(this.fx.delay.feedback, now);
    this.delayFeedbackGainR.gain.setValueAtTime(this.fx.delay.feedback, now);

    // Feedback Loops with Tape High-Cut
    this.delayL.connect(this.delayFilterL);
    this.delayFilterL.connect(this.delayFeedbackGainL);
    this.delayFeedbackGainL.connect(this.delayL);

    this.delayR.connect(this.delayFilterR);
    this.delayFilterR.connect(this.delayFeedbackGainR);
    this.delayFeedbackGainR.connect(this.delayR);

    const delayMerger = this.ctx.createChannelMerger(2);
    this.delayL.connect(delayMerger, 0, 0);
    this.delayR.connect(delayMerger, 0, 1);

    const delayOutBus = this.ctx.createGain();
    chorusOutBus.connect(this.delayDryGain);
    chorusOutBus.connect(this.delayL);
    chorusOutBus.connect(this.delayR);

    this.delayDryGain.connect(delayOutBus);
    delayMerger.connect(this.delayWetGain);
    this.delayWetGain.connect(delayOutBus);

    // -----------------------------------------------------------------------
    // 3. WARM STUDIO SPACE REVERB
    // -----------------------------------------------------------------------
    this.reverbDryGain = this.ctx.createGain();
    this.reverbWetGain = this.ctx.createGain();
    this.reverbDryGain.gain.setValueAtTime(1.0, now);
    this.reverbWetGain.gain.setValueAtTime(this.fx.reverb.mix, now);

    this.reverbConvolver = this.ctx.createConvolver();
    this.applyReverbDecay();

    delayOutBus.connect(this.reverbDryGain);
    delayOutBus.connect(this.reverbConvolver);

    this.reverbDryGain.connect(output);
    this.reverbConvolver.connect(this.reverbWetGain);
    this.reverbWetGain.connect(output);
  }

  // =========================================================================
  // LIVE PARAMETER UPDATES
  // =========================================================================

  applyChorusMode() {
    const now = this.ctx.currentTime;
    const mode = this.fx.chorus.mode;
    let rate = 0.5;
    let depth = 0.0035;
    let wet = this.fx.chorus.mix;

    switch (mode) {
      case 'off':
        wet = 0.0;
        break;
      case 'I':
        rate = 0.45;
        depth = 0.003;
        break;
      case 'II':
        rate = 0.85;
        depth = 0.0045;
        break;
      case 'I+II':
        rate = 1.35;
        depth = 0.0065;
        break;
    }

    this.chorusWetGain.gain.setTargetAtTime(wet, now, 0.02);
    this.chorusLfo.frequency.setTargetAtTime(rate, now, 0.02);
    this.chorusLfoGainL.gain.setTargetAtTime(depth, now, 0.02);
    this.chorusLfoGainR.gain.setTargetAtTime(-depth, now, 0.02);
  }

  applyChorusMix() {
    if (this.fx.chorus.mode === 'off') return;
    this.chorusWetGain.gain.setTargetAtTime(this.fx.chorus.mix, this.ctx.currentTime, 0.02);
  }

  applyDelayTime() {
    const now = this.ctx.currentTime;
    this.delayL.delayTime.setTargetAtTime(this.fx.delay.time, now, 0.03);
    this.delayR.delayTime.setTargetAtTime(this.fx.delay.time * 1.333, now, 0.03);
  }

  applyDelayFeedback() {
    const now = this.ctx.currentTime;
    this.delayFeedbackGainL.gain.setTargetAtTime(this.fx.delay.feedback, now, 0.02);
    this.delayFeedbackGainR.gain.setTargetAtTime(this.fx.delay.feedback, now, 0.02);
  }

  applyDelayMix() {
    this.delayWetGain.gain.setTargetAtTime(this.fx.delay.mix, this.ctx.currentTime, 0.02);
  }

  /**
   * Regenerates the stereo noise impulse response for the current decay time
   */
  applyReverbDecay() {
    const decayTime = this.fx.reverb.decay;
    const rate = this.ctx.sampleRate;
    const length = Math.max(0.5, Math.min(8.0, decayTime)) * rate;
    const impulse = this.ctx.createBuffer(2, length, rate);
    const left = impulse.getChannelData(0);
    const right = impulse.getChannelData(1);

    const decayConstant = 3.5 / decayTime;

    for (let i = 0; i < length; i++) {
      const t = i / rate;
      const envelope = Math.exp(-t * decayConstant);
      left[i] = (Math.random() * 2 - 1) * envelope;
      right[i] = (Math.random() * 2 - 1) * envelope;
    }

    this.reverbConvolver.buffer = impulse;
  }

  applyReverbMix() {
    this.reverbWetGain.gain.setTargetAtTime(this.fx.reverb.mix, this.ctx.currentTime, 0.02);
  }
}

window.FXChain = FXChain;
