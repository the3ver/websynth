/**
 * SYNTH BLOCKS • FM OPERATOR & ALGORITHMS
 * Operator: sine oscillator -> amp gain (envelope target, 0..1) -> scale gain -> output.
 * A carrier keeps scale 1 and feeds the voice mix; a modulator feeds another operator's
 * frequency param, so its scale turns the 0..1 level into a frequency deviation in Hz
 * (modulationScale: index * modulator frequency keeps the timbre constant across the keyboard).
 * Classic script: attaches to the window.SynthBlocks namespace.
 */
(function (blocks) {
  // Modulation index at operator level 1.0
  const FM_MAX_INDEX = 8;

  // Operators 1..4; mods lists [from, to] connections, carriers feed the voice output
  const FM_ALGORITHMS = {
    1: { mods: [[4, 3], [3, 2], [2, 1]], carriers: [1] },
    2: { mods: [[4, 2], [3, 2], [2, 1]], carriers: [1] },
    3: { mods: [[4, 1], [3, 2], [2, 1]], carriers: [1] },
    4: { mods: [[4, 3], [3, 1], [2, 1]], carriers: [1] },
    5: { mods: [[4, 3], [2, 1]], carriers: [1, 3] },
    6: { mods: [[4, 1], [4, 2], [4, 3]], carriers: [1, 2, 3] },
    7: { mods: [[4, 3]], carriers: [1, 2, 3] },
    8: { mods: [], carriers: [1, 2, 3, 4] }
  };

  class Operator {
    constructor(ctx, now = ctx.currentTime) {
      this.osc = ctx.createOscillator();
      this.osc.type = 'sine';
      this.osc.frequency.setValueAtTime(440, now);
      this.frequency = this.osc.frequency;
      this.detune = this.osc.detune;

      this.amp = ctx.createGain();
      this.amp.gain.setValueAtTime(0.0, now);
      this.scale = ctx.createGain();
      this.scale.gain.setValueAtTime(1.0, now);
      this.osc.connect(this.amp);
      this.amp.connect(this.scale);

      this.output = this.scale;
      // Envelope target and modulation depth / carrier gain
      this.gain = this.amp.gain;
      this.scaleParam = this.scale.gain;
    }

    start(when = 0) {
      this.osc.start(when);
    }

    // destination: an AudioNode (carrier) or another operator's frequency param (modulator)
    connect(destination) {
      this.output.connect(destination);
    }

    disconnect() {
      this.output.disconnect();
    }

    /**
     * Frequency deviation in Hz at level 1.0 for a modulator running at frequency
     */
    static modulationScale(frequency) {
      return FM_MAX_INDEX * frequency;
    }
  }

  Operator.MAX_INDEX = FM_MAX_INDEX;
  Operator.ALGORITHMS = FM_ALGORITHMS;

  Object.assign(blocks, { Operator });
})(window.SynthBlocks = window.SynthBlocks || {});
