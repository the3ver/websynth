/**
 * SYNTH BLOCKS • GAIN STAGES
 * Mixer (named level channels summed into one bus), Drive (saturating WaveShaper) and
 * Vca (envelope gain followed by a tremolo gain for amp modulation).
 * Classic script: attaches to the window.SynthBlocks namespace. Drive needs curves.js.
 */
(function (blocks) {
  const LEVEL_RAMP = 0.015;

  function gainNode(ctx, value, now) {
    const g = ctx.createGain();
    g.gain.setValueAtTime(value, now);
    return g;
  }

  class Mixer {
    /**
     * @param levels { channelName: level } in channel order, e.g. { vco1Level: 0.8, noiseLevel: 0 }
     */
    constructor(ctx, levels, now = ctx.currentTime) {
      this.channels = {};
      for (const [name, level] of Object.entries(levels)) {
        this.channels[name] = gainNode(ctx, level, now);
      }
      this.output = ctx.createGain();
      for (const channel of Object.values(this.channels)) channel.connect(this.output);
    }

    // Node to connect a source into
    input(name) {
      return this.channels[name];
    }

    /**
     * Ramps one channel to a new level (knob move)
     */
    setLevel(name, level, now) {
      this.channels[name].gain.setTargetAtTime(level, now, LEVEL_RAMP);
    }

    /**
     * Jumps every channel to its level scaled by velocity (note on)
     */
    setLevelsAt(levels, scale, now) {
      for (const [name, channel] of Object.entries(this.channels)) {
        channel.gain.cancelScheduledValues(now);
        channel.gain.setValueAtTime(levels[name] * scale, now);
      }
    }
  }

  class Drive {
    constructor(ctx, amount = 0) {
      this.shaper = ctx.createWaveShaper();
      this.shaper.curve = blocks.driveCurve(amount);
      this.shaper.oversample = '2x';
      this.input = this.shaper;
      this.output = this.shaper;
    }

    /**
     * Sets the drive amount 0..1; pass a precomputed curve to share one array across voices
     */
    setAmount(amount, curve = blocks.driveCurve(amount)) {
      this.shaper.curve = curve;
    }
  }

  class Vca {
    constructor(ctx, now = ctx.currentTime) {
      this.amp = gainNode(ctx, 0.0, now);
      this.tremolo = gainNode(ctx, 1.0, now);
      this.amp.connect(this.tremolo);
      this.input = this.amp;
      this.output = this.tremolo;
      // Envelope target and amp modulation target
      this.gain = this.amp.gain;
      this.tremoloGain = this.tremolo.gain;
    }

    /**
     * Fast fade to silence for voice stealing
     */
    choke(now, timeConstant = 0.002) {
      blocks.holdParam(this.gain, now);
      this.gain.setTargetAtTime(0.0, now, timeConstant);
    }
  }

  Object.assign(blocks, { Mixer, Drive, Vca });
})((window.SynthBlocks = window.SynthBlocks || {}));
