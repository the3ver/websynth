/**
 * BITCRUSHER WORKLET
 * Lo-fi effect of early samplers: sample-and-hold at a lower sample rate, then quantization to
 * fewer bits. Both run per channel on the stereo input.
 *
 * AudioParams (k-rate, from the main thread):
 *   bits (1..16)       quantization depth; fractional values give in-between level counts
 *   rate (Hz)          hold rate; at or above the context rate every sample passes
 *
 * CrusherCore holds the DSP and is unit tested in Node; the processor wrapper only exists inside
 * an AudioWorkletGlobalScope.
 */

class CrusherCore {
  constructor(channels = 2) {
    this.held = new Float64Array(channels);
    // Starts at 1 so the first sample of a channel is captured right away
    this.phase = new Float64Array(channels).fill(1);
  }

  /**
   * Renders one channel block. step = rate / sampleRate, capped at 1 (every sample).
   */
  render(input, output, channel, bits, step) {
    const levels = Math.pow(2, bits - 1);
    let phase = this.phase[channel];
    let held = this.held[channel];
    for (let i = 0; i < output.length; i++) {
      if (phase >= 1) {
        phase -= Math.floor(phase);
        held = Math.round(input[i] * levels) / levels;
      }
      phase += step;
      output[i] = held;
    }
    this.phase[channel] = phase;
    this.held[channel] = held;
  }
}

globalThis.CrusherCore = CrusherCore;

if (typeof AudioWorkletProcessor !== 'undefined' && typeof registerProcessor === 'function') {
  class CrusherProcessor extends AudioWorkletProcessor {
    static get parameterDescriptors() {
      return [
        { name: 'bits', defaultValue: 16, minValue: 1, maxValue: 16, automationRate: 'k-rate' },
        { name: 'rate', defaultValue: 48000, minValue: 100, maxValue: 192000, automationRate: 'k-rate' }
      ];
    }

    constructor() {
      super();
      this.core = new CrusherCore(2);
    }

    process(inputs, outputs, parameters) {
      const input = inputs[0];
      const output = outputs[0];
      const step = Math.min(1, parameters.rate[0] / sampleRate);
      // No input while the effect is bypassed: the outputs stay silent
      for (let c = 0; c < output.length && c < input.length; c++) {
        this.core.render(input[c], output[c], c, parameters.bits[0], step);
      }
      return true;
    }
  }

  registerProcessor('bitcrusher', CrusherProcessor);
}
