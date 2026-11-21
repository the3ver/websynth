/**
 * SYNTH BLOCKS • CURVES & BUFFERS
 * Pure WaveShaper transfer curves and noise buffers, shared by every instrument.
 * Classic script: attaches to the window.SynthBlocks namespace.
 */
(function (blocks) {
  // Shaper input position of sample i in [-1, 1]
  function shaperX(i, n) {
    return (i * 2) / (n - 1) - 1;
  }

  function linearCurve(n = 512) {
    const curve = new Float32Array(n);
    for (let i = 0; i < n; ++i) curve[i] = shaperX(i, n);
    return curve;
  }

  /**
   * Soft saturation tanh(gain * x), normalized so the edges stay at +-1
   */
  function tanhCurve(gain, n = 512) {
    const curve = new Float32Array(n);
    const norm = Math.tanh(gain);
    for (let i = 0; i < n; ++i) curve[i] = Math.tanh(gain * shaperX(i, n)) / norm;
    return curve;
  }

  /**
   * Drive knob 0..1: identity at 0, then tanh with gain 1..5
   */
  function driveCurve(amount, n = 512) {
    return amount <= 0.001 ? linearCurve(n) : tanhCurve(1.0 + amount * 4.0, n);
  }

  /**
   * Steep analog comparator sigmoid: turns a sawtooth plus offset into a pulse (PWM)
   */
  function pwmComparatorCurve(n = 2048, steepness = 40) {
    const curve = new Float32Array(n);
    for (let i = 0; i < n; i++) curve[i] = Math.tanh(steepness * shaperX(i, n));
    return curve;
  }

  /**
   * Safety clipper curve over the input range -2..+2: unity up to 0.8, then a tanh knee
   * that approaches 0.98 so the output never reaches full scale.
   */
  function safetyClipCurve() {
    const n = 4096,
      knee = 0.8,
      ceiling = 0.98;
    const curve = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * 4 - 2;
      const a = Math.abs(x);
      const y = a <= knee ? a : knee + (ceiling - knee) * Math.tanh((a - knee) / (ceiling - knee));
      curve[i] = Math.sign(x) * y;
    }
    return curve;
  }

  /**
   * Mono white noise buffer, uniformly distributed in [-peak, peak]
   */
  function whiteNoiseBuffer(ctx, seconds = 2, peak = 1) {
    const length = ctx.sampleRate * seconds;
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * peak;
    return buffer;
  }

  Object.assign(blocks, {
    linearCurve,
    tanhCurve,
    driveCurve,
    pwmComparatorCurve,
    safetyClipCurve,
    whiteNoiseBuffer
  });
})(/** @type {any} */ (window.SynthBlocks = window.SynthBlocks || {}));
