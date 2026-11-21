/**
 * FM-4 • VOICE WORKLET
 * One AudioWorklet node per voice renders all four sine operators sample by sample as phase
 * modulation, so the feedback operator can modulate itself without the 128-sample delay a
 * Web Audio graph cycle needs.
 *
 * AudioParams (all from the main thread):
 *   freq1..freq4 (a-rate, Hz)   operator frequencies incl. ratio, fine detune, pitch bend, glide
 *   gain1..gain4 (a-rate, 0..1) operator envelopes (level * ADSR)
 *   detune (a-rate, cents)      vibrato on every operator
 *   algorithm (k-rate, 1..8), feedback (k-rate, 0..1), mix (k-rate, 0 = X .. 1 = Y)
 * processorOptions.algorithms: FmAlgorithms.ALGORITHMS (js/fm-algorithms.js), the only routing table.
 *
 * FmVoiceCore holds the DSP and is unit tested in Node; the processor wrapper only exists inside
 * an AudioWorkletGlobalScope.
 */

// Phase deviation in radians of a modulator at gain 1.0 (modulation index 8)
const FM_MOD_INDEX = 8;
// Self-modulation in radians at feedback 1.0 (bright, sawtooth-like)
const FM_FEEDBACK_MAX = 1.6;
const TWO_PI = 2 * Math.PI;

class FmVoiceCore {
  constructor(algorithms, sampleRate) {
    this.sampleRate = sampleRate;
    this.phase = new Float64Array(5);
    this.out = new Float64Array(5);
    this.fb1 = 0;
    this.fb2 = 0;
    this.silent = true;

    // Per algorithm: modulators of each operator, render order (modulators first), outputs
    this.routes = {};
    for (const [key, alg] of Object.entries(algorithms)) {
      const into = [[], [], [], [], []];
      for (const [from, to] of alg.mods) into[to].push(from);
      const depth = {};
      const depthOf = (op) => {
        if (depth[op] === undefined) {
          const targets = alg.mods.filter(([from]) => from === op).map(([, to]) => to);
          depth[op] = targets.length ? 1 + Math.max(...targets.map(depthOf)) : 0;
        }
        return depth[op];
      };
      const order = [1, 2, 3, 4].sort((a, b) => depthOf(b) - depthOf(a));
      this.routes[key] = { into, order, feedback: alg.feedback, x: alg.x, y: alg.y };
    }
  }

  /**
   * Renders one block into output (Float32Array).
   * p: { freq: [_, f1..f4], gain: [_, g1..g4], detune, algorithm, feedback, mix }, each an array of
   * length 1 (constant over the block) or output.length, as AudioWorklet passes AudioParams.
   */
  render(output, p) {
    const route = this.routes[Math.round(p.algorithm[0])] || this.routes[1];
    const { into, order, feedback: fbOp, x, y } = route;
    const n = output.length;
    const g = p.gain;

    // Silent voice (all envelopes at rest): skip the sines
    if (
      g[1].length === 1 &&
      g[2].length === 1 &&
      g[3].length === 1 &&
      g[4].length === 1 &&
      g[1][0] < 1e-6 &&
      g[2][0] < 1e-6 &&
      g[3][0] < 1e-6 &&
      g[4][0] < 1e-6
    ) {
      output.fill(0);
      if (!this.silent) {
        this.out.fill(0);
        this.fb1 = 0;
        this.fb2 = 0;
        this.silent = true;
      }
      return;
    }
    this.silent = false;

    const fbAmount = Math.max(0, Math.min(1, p.feedback[0])) * FM_FEEDBACK_MAX;
    const mix = Math.max(0, Math.min(1, p.mix[0]));
    const xGain = (1 - mix) / x.length;
    const yGain = mix / y.length;
    const invSr = 1 / this.sampleRate;
    const detune = p.detune;
    const phase = this.phase;
    const out = this.out;

    for (let i = 0; i < n; i++) {
      const vib = Math.pow(2, (detune.length > 1 ? detune[i] : detune[0]) / 1200);
      for (let k = 0; k < 4; k++) {
        const op = order[k];
        const f = p.freq[op];
        const a = g[op];
        let pm = 0;
        const mods = into[op];
        for (let m = 0; m < mods.length; m++) pm += out[mods[m]];
        pm *= FM_MOD_INDEX;
        if (op === fbOp) pm += fbAmount * 0.5 * (this.fb1 + this.fb2);

        let ph = phase[op] + (f.length > 1 ? f[i] : f[0]) * vib * invSr;
        ph -= Math.floor(ph);
        phase[op] = ph;
        const s = Math.sin(TWO_PI * ph + pm);
        if (op === fbOp) {
          this.fb2 = this.fb1;
          this.fb1 = s;
        }
        out[op] = s * (a.length > 1 ? a[i] : a[0]);
      }

      let sx = 0;
      for (let j = 0; j < x.length; j++) sx += out[x[j]];
      let sy = 0;
      for (let j = 0; j < y.length; j++) sy += out[y[j]];
      output[i] = sx * xGain + sy * yGain;
    }
  }
}

globalThis.FmVoiceCore = FmVoiceCore;

if (typeof AudioWorkletProcessor !== 'undefined' && typeof registerProcessor === 'function') {
  const opParams = [];
  for (let n = 1; n <= 4; n++) {
    opParams.push({ name: `freq${n}`, defaultValue: 440, minValue: 0, maxValue: 24000, automationRate: 'a-rate' });
    opParams.push({ name: `gain${n}`, defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'a-rate' });
  }

  class FmVoiceProcessor extends AudioWorkletProcessor {
    static get parameterDescriptors() {
      return [
        ...opParams,
        { name: 'detune', defaultValue: 0, automationRate: 'a-rate' },
        { name: 'algorithm', defaultValue: 1, minValue: 1, maxValue: 8, automationRate: 'k-rate' },
        { name: 'feedback', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
        { name: 'mix', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'k-rate' }
      ];
    }

    constructor(options) {
      super();
      this.core = new FmVoiceCore(options.processorOptions.algorithms, sampleRate);
      this.p = { freq: [null], gain: [null] };
    }

    process(inputs, outputs, parameters) {
      const p = this.p;
      for (let n = 1; n <= 4; n++) {
        p.freq[n] = parameters[`freq${n}`];
        p.gain[n] = parameters[`gain${n}`];
      }
      p.detune = parameters.detune;
      p.algorithm = parameters.algorithm;
      p.feedback = parameters.feedback;
      p.mix = parameters.mix;
      this.core.render(outputs[0][0], p);
      return true;
    }
  }

  registerProcessor('fm4-voice', FmVoiceProcessor);
}
