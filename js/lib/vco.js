/**
 * SYNTH BLOCKS • VCO
 * One oscillator with two output paths:
 *   direct: native sine/triangle/sawtooth
 *   pulse:  sawtooth -> pwInput (+ PW offset / PWM sources) -> 4x-oversampled comparator -> square/PWM
 * Only one path is open at a time. The comparator is unplugged while unused: an unplugged
 * shaper is not rendered, and 4x oversampling is costly.
 * Classic script: attaches to the window.SynthBlocks namespace. Needs curves.js.
 */
(function (blocks) {
  // Pulse path gain fade on wave change; unplug after 10 time constants
  const WAVE_FADE = 0.005;
  const UNPLUG_DELAY_MS = 50;

  class Vco {
    /**
     * @param {object} [options]
     * @param options.wave 'sine' | 'triangle' | 'sawtooth' | 'square'
     * @param options.pwmCurve shared comparator curve (pass one instance for all voices)
     */
    constructor(ctx, { wave = 'sawtooth', pwmCurve = blocks.pwmComparatorCurve(), now = ctx.currentTime } = {}) {
      const isSquare = wave === 'square';

      this.osc = ctx.createOscillator();
      this.osc.type = isSquare ? 'sawtooth' : wave;
      this.osc.frequency.setValueAtTime(440, now);
      this.frequency = this.osc.frequency;
      this.detune = this.osc.detune;

      this.directGain = ctx.createGain();
      this.directGain.gain.setValueAtTime(isSquare ? 0.0 : 1.0, now);
      this.osc.connect(this.directGain);

      const pwScale = ctx.createGain();
      pwScale.gain.setValueAtTime(0.4, now);
      this.osc.connect(pwScale);

      // Pulse width sources (static offset, LFO PWM) connect here
      this.pwInput = ctx.createGain();
      this.pwInput.gain.setValueAtTime(1.0, now);
      pwScale.connect(this.pwInput);

      this.pwShaper = ctx.createWaveShaper();
      this.pwShaper.curve = pwmCurve;
      this.pwShaper.oversample = '4x';
      this.pwInput.connect(this.pwShaper);

      this.pulseGain = ctx.createGain();
      this.pulseGain.gain.setValueAtTime(isSquare ? 1.0 : 0.0, now);
      this.pwPlugged = false;
      this.pwUnplugTimer = null;
      this.setPwPlugged(isSquare);
    }

    connect(destination) {
      this.directGain.connect(destination);
      this.pulseGain.connect(destination);
    }

    start(when = 0) {
      this.osc.start(when);
    }

    /**
     * Crossfades between the direct path and the pulse path
     */
    setWave(wave, now) {
      const isSquare = wave === 'square';
      this.osc.type = isSquare ? 'sawtooth' : wave;
      this.directGain.gain.setTargetAtTime(isSquare ? 0.0 : 1.0, now, WAVE_FADE);
      this.pulseGain.gain.setTargetAtTime(isSquare ? 1.0 : 0.0, now, WAVE_FADE);

      clearTimeout(this.pwUnplugTimer);
      this.pwUnplugTimer = null;
      if (isSquare) {
        this.setPwPlugged(true);
      } else if (this.pwPlugged) {
        // unplug once the pulse gain has faded out
        this.pwUnplugTimer = setTimeout(() => this.setPwPlugged(false), UNPLUG_DELAY_MS);
      }
    }

    setPwPlugged(on) {
      if (on === this.pwPlugged) return;
      if (on) this.pwShaper.connect(this.pulseGain);
      else this.pwShaper.disconnect();
      this.pwPlugged = on;
    }
  }

  Object.assign(blocks, { Vco });
})((window.SynthBlocks = window.SynthBlocks || {}));
