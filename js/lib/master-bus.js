/**
 * SYNTH BLOCKS • MASTER BUS
 * input (analyser) -> volume -> brickwall limiter -> safety clipper -> destination.
 * One per page: instruments connect into input, visualizers read the analyser.
 * Classic script: attaches to the window.SynthBlocks namespace. Needs curves.js.
 */
(function (blocks) {
  class MasterBus {
    constructor(ctx, { volume = 0.8, destination = ctx.destination } = {}) {
      const now = ctx.currentTime;
      this.ctx = ctx;

      // Analyser first so meters show the mix before the volume knob (fftSize 512 for CPU relief)
      this.analyser = ctx.createAnalyser();
      this.analyser.fftSize = 512;
      this.analyser.smoothingTimeConstant = 0.8;
      this.input = this.analyser;

      this.volume = ctx.createGain();
      this.volume.gain.setValueAtTime(volume, now);

      // Brickwall peak limiter against digital clipping (0 dBFS ceiling)
      this.limiter = ctx.createDynamicsCompressor();
      this.limiter.threshold.setValueAtTime(-0.5, now);
      this.limiter.knee.setValueAtTime(0.0, now);
      this.limiter.ratio.setValueAtTime(20.0, now);
      this.limiter.attack.setValueAtTime(0.001, now);
      this.limiter.release.setValueAtTime(0.05, now);

      // Safety clipper: the compressor lets fast peaks overshoot 0 dBFS (up to ~1.15 on
      // resonant patches), which the output then hard-clips into audible crackle.
      // Pre-gain 0.5 maps -2..+2 onto the shaper's -1..1 input range.
      this.clipperPre = ctx.createGain();
      this.clipperPre.gain.setValueAtTime(0.5, now);
      this.clipper = ctx.createWaveShaper();
      this.clipper.curve = blocks.safetyClipCurve();
      this.clipper.oversample = '4x';

      this.analyser.connect(this.volume);
      this.volume.connect(this.limiter);
      this.limiter.connect(this.clipperPre);
      this.clipperPre.connect(this.clipper);
      this.clipper.connect(destination);
    }

    setVolume(volume) {
      this.volume.gain.setTargetAtTime(volume, this.ctx.currentTime, 0.02);
    }
  }

  Object.assign(blocks, { MasterBus });
})(window.SynthBlocks = window.SynthBlocks || {});
