const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadScripts, loadScriptsWith } = require('./helpers/load-browser-script');

const { CrusherCore } = loadScripts('worklets/crusher-processor.js');
const SR = 48000;

function sine(n, hz = 440, amp = 0.9) {
  return Float32Array.from({ length: n }, (_, i) => amp * Math.sin((2 * Math.PI * hz * i) / SR));
}

function render(input, bits, rate, core = new CrusherCore(1)) {
  const out = new Float32Array(input.length);
  core.render(input, out, 0, bits, Math.min(1, rate / SR));
  return out;
}

test('full rate and 16 bits pass the signal almost unchanged', () => {
  const input = sine(512);
  const out = render(input, 16, SR);
  for (let i = 0; i < input.length; i++) assert.ok(Math.abs(out[i] - input[i]) <= 1 / 32768 + 1e-7);
});

test('bit depth limits the output to 2^(bits-1) steps per polarity', () => {
  const out = render(sine(4800), 3, SR);
  const values = new Set(Array.from(out, (v) => Math.round(v * 4)));
  for (const v of values) assert.ok(v >= -4 && v <= 4);
  for (const v of out) assert.equal(v * 4, Math.round(v * 4), 'every sample on a 1/4 step');
  assert.ok(values.size <= 9);
});

test('rate reduction holds each captured sample for sampleRate / rate samples', () => {
  const input = Float32Array.from({ length: 48 }, (_, i) => i / 48);
  const out = render(input, 16, SR / 4);
  // First sample is captured immediately, then every 4th sample
  for (let i = 0; i < out.length; i++) {
    const captured = Math.floor(i / 4) * 4;
    assert.ok(Math.abs(out[i] - input[captured]) < 1e-4, `sample ${i}`);
  }
});

test('hold phase and value carry over between render blocks', () => {
  const input = Float32Array.from({ length: 12 }, (_, i) => i / 12);
  const whole = render(input, 16, SR / 3);
  const core = new CrusherCore(1);
  const first = render(input.subarray(0, 5), 16, SR / 3, core);
  const second = render(input.subarray(5), 16, SR / 3, core);
  assert.deepEqual([...first, ...second], [...whole]);
});

test('channels keep separate hold state', () => {
  const core = new CrusherCore(2);
  const left = new Float32Array(4);
  const right = new Float32Array(4);
  core.render(Float32Array.of(0.5, 0.5, 0.5, 0.5), left, 0, 16, 0.5);
  core.render(Float32Array.of(-0.5, -0.5, -0.5, -0.5), right, 1, 16, 0.5);
  assert.deepEqual(Array.from(left), [0.5, 0.5, 0.5, 0.5]);
  assert.deepEqual(Array.from(right), [-0.5, -0.5, -0.5, -0.5]);
});

test('the registered processor crushes every input channel with its params', () => {
  const registered = {};
  loadScriptsWith({
    AudioWorkletProcessor: class {},
    registerProcessor: (name, cls) => { registered[name] = cls; },
    sampleRate: SR
  }, 'worklets/crusher-processor.js');
  const Processor = registered.bitcrusher;
  assert.ok(Processor, 'registered as bitcrusher');
  assert.deepEqual(Array.from(Processor.parameterDescriptors, (d) => d.name), ['bits', 'rate']);

  const proc = new Processor();
  const left = Float32Array.of(0.3, 0.3, 0.9, 0.9);
  const right = Float32Array.of(-0.3, -0.3, -0.9, -0.9);
  const out = [new Float32Array(4), new Float32Array(4)];
  assert.equal(proc.process([[left, right]], [out], { bits: [2], rate: [SR / 2] }), true);
  assert.deepEqual(Array.from(out[0]), [0.5, 0.5, 1, 1]);
  assert.deepEqual(Array.from(out[1]), [-0.5, -0.5, -1, -1]);

  // Bypassed (no input connected): the output stays silent, the processor stays alive
  const silent = [new Float32Array(4), new Float32Array(4)];
  assert.equal(proc.process([[]], [silent], { bits: [2], rate: [SR] }), true);
  assert.deepEqual(Array.from(silent[0]), [0, 0, 0, 0]);
});
