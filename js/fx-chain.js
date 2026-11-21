/**
 * RETROVOX SUB-1 • VINTAGE STEREO FX RACK
 * input -> Bitcrusher -> Juno BBD Chorus -> Stereo Tape Delay (Ping-Pong + High-Cut) -> Studio Reverb -> output
 * Composes the SynthBlocks effects (js/lib/effects.js) on the shared fx parameter object
 * (engine.fx); the engine calls crusher/chorus/delay/reverb.apply*() after changing a setting.
 * The crusher's worklet loads asynchronously; until then it passes the dry signal only.
 * modTargets names the params a modulation matrix may add to (crusherBits / crusherRate appear
 * once the worklet is attached, see ready).
 */

// Bitcrusher worklet module, relative to index.html
const CRUSHER_WORKLET_URL = 'js/worklets/crusher-processor.js';

class FXChain {
  constructor(ctx, fx, input, output) {
    this.crusher = new SynthBlocks.Crusher(ctx, fx.crusher);
    this.chorus = new SynthBlocks.Chorus(ctx, fx.chorus);
    this.delay = new SynthBlocks.Delay(ctx, fx.delay);
    this.reverb = new SynthBlocks.Reverb(ctx, fx.reverb);

    input.connect(this.crusher.input);
    this.crusher.output.connect(this.chorus.input);
    this.chorus.output.connect(this.delay.input);
    this.delay.output.connect(this.reverb.input);
    this.reverb.output.connect(output);

    this.modTargets = {
      delayTime: [this.delay.delayL.delayTime, this.delay.delayR.delayTime],
      delayFeedback: [this.delay.feedbackGainL.gain, this.delay.feedbackGainR.gain],
      delayMix: [this.delay.wetGain.gain],
      reverbMix: [this.reverb.wetGain.gain]
    };

    // Resolves once the crusher's worklet node is attached (or its module failed to load)
    this.ready = ctx.audioWorklet
      ? ctx.audioWorklet
          .addModule(CRUSHER_WORKLET_URL)
          .then(() => {
            const node = new AudioWorkletNode(ctx, 'bitcrusher', {
              numberOfInputs: 1,
              numberOfOutputs: 1,
              outputChannelCount: [2],
              channelCount: 2,
              channelCountMode: 'explicit'
            });
            this.crusher.attach(node);
            this.modTargets.crusherBits = [node.parameters.get('bits')];
            this.modTargets.crusherRate = [node.parameters.get('rate')];
          })
          .catch((err) => console.error('Bitcrusher worklet failed to load:', err))
      : Promise.resolve();
  }

  /**
   * Which effects are audible with these settings (for the LEDs on the FX tabs)
   */
  static activeEffects(fx) {
    return {
      crusher: fx.crusher.mix > 0,
      chorus: fx.chorus.mode !== 'off' && fx.chorus.mix > 0,
      delay: fx.delay.mix > 0,
      reverb: fx.reverb.mix > 0
    };
  }
}

window.FXChain = FXChain;
