/**
 * RETROVOX SUB-1 • VINTAGE STEREO FX RACK
 * input -> Juno BBD Chorus -> Stereo Tape Delay (Ping-Pong + High-Cut) -> Studio Reverb -> output
 * Composes the SynthBlocks effects (js/lib/effects.js) on the shared fx parameter object
 * (engine.fx); the engine calls chorus/delay/reverb.apply*() after changing a setting.
 */

class FXChain {
  constructor(ctx, fx, input, output) {
    this.chorus = new SynthBlocks.Chorus(ctx, fx.chorus);
    this.delay = new SynthBlocks.Delay(ctx, fx.delay);
    this.reverb = new SynthBlocks.Reverb(ctx, fx.reverb);

    input.connect(this.chorus.input);
    this.chorus.output.connect(this.delay.input);
    this.delay.output.connect(this.reverb.input);
    this.reverb.output.connect(output);
  }
}

window.FXChain = FXChain;
