const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadScripts } = require('./helpers/load-browser-script');

const { KnobScale } = loadScripts('knob-scale.js');

function assertClose(actual, expected, tol = 1e-9) {
  assert.ok(
    Math.abs(actual - expected) <= tol,
    `Expected ${actual} to be within ${tol} of ${expected}`
  );
}

test('clampRatio clamps values strictly between 0 and 1', () => {
  assert.equal(KnobScale.clampRatio(-0.5), 0);
  assert.equal(KnobScale.clampRatio(0), 0);
  assert.equal(KnobScale.clampRatio(0.42), 0.42);
  assert.equal(KnobScale.clampRatio(1), 1);
  assert.equal(KnobScale.clampRatio(1.5), 1);
});

test('formatReadout handles all types correctly', () => {
  assert.equal(KnobScale.formatReadout('octave', -2), '32\'');
  assert.equal(KnobScale.formatReadout('octave', -1), '16\'');
  assert.equal(KnobScale.formatReadout('octave', 0), '8\'');
  assert.equal(KnobScale.formatReadout('octave', 1), '4\'');
  assert.equal(KnobScale.formatReadout('octave', 2), '2\'');
  assert.equal(KnobScale.formatReadout('octave', 3), '3');

  assert.equal(KnobScale.formatReadout('percent', 0.5), '50%');
  assert.equal(KnobScale.formatReadout('percent', 0), '0%');
  assert.equal(KnobScale.formatReadout('percent', 1), '100%');

  assert.equal(KnobScale.formatReadout('bipolar-percent', 0.5), '+50%');
  assert.equal(KnobScale.formatReadout('bipolar-percent', 0), '0%');
  assert.equal(KnobScale.formatReadout('bipolar-percent', -0.5), '-50%');

  assert.equal(KnobScale.formatReadout('cents', 25), '+25 CT');
  assert.equal(KnobScale.formatReadout('cents', 0), '0 CT');
  assert.equal(KnobScale.formatReadout('cents', -25), '-25 CT');

  assert.equal(KnobScale.formatReadout('semitone', 7), '+7 ST');
  assert.equal(KnobScale.formatReadout('semitone', 0), '0 ST');
  assert.equal(KnobScale.formatReadout('semitone', -7), '-7 ST');

  assert.equal(KnobScale.formatReadout('hz', 5.24), '5.2 Hz');
  assert.equal(KnobScale.formatReadout('hz', 9.94), '9.9 Hz');
  assert.equal(KnobScale.formatReadout('hz', 10), '10 Hz');
  assert.equal(KnobScale.formatReadout('hz', 440), '440 Hz');
  assert.equal(KnobScale.formatReadout('hz', 999.4), '999 Hz');
  assert.equal(KnobScale.formatReadout('hz', 1000), '1.0 kHz');
  assert.equal(KnobScale.formatReadout('hz', 2500), '2.5 kHz');

  assert.equal(KnobScale.formatReadout('res', 0.5), '0.5 Q');
  assert.equal(KnobScale.formatReadout('res', 10), '10.0 Q');

  assert.equal(KnobScale.formatReadout('time', 0.05), '50 ms');
  assert.equal(KnobScale.formatReadout('time', 0.999), '999 ms');
  assert.equal(KnobScale.formatReadout('time', 1.0), '1.00 s');
  assert.equal(KnobScale.formatReadout('time', 2.5), '2.50 s');

  assert.equal(KnobScale.formatReadout('bpm', 120.4), '120');
  assert.equal(KnobScale.formatReadout('bpm', 120.6), '121');

  assert.equal(KnobScale.formatReadout('custom', 42), '42');
  assert.equal(KnobScale.formatReadout(undefined, 'test'), 'test');
});

test('valueToRatio and ratioToValue logarithmic mapping for hz with min > 1', () => {
  const spec = { type: 'hz', min: 20, max: 20000 };

  assertClose(KnobScale.valueToRatio(spec, 20), 0);
  assertClose(KnobScale.valueToRatio(spec, 20000), 1);
  assertClose(KnobScale.ratioToValue(spec, 0), 20);
  assertClose(KnobScale.ratioToValue(spec, 1), 20000);

  const testValues = [25, 100, 440, 1000, 5000, 15000];
  for (const val of testValues) {
    const ratio = KnobScale.valueToRatio(spec, val);
    const roundtrip = KnobScale.ratioToValue(spec, ratio);
    assertClose(roundtrip, val);
  }
});

test('valueToRatio and ratioToValue linear mapping', () => {
  const spec = { type: 'percent', min: 0, max: 100 };

  assertClose(KnobScale.valueToRatio(spec, 0), 0);
  assertClose(KnobScale.valueToRatio(spec, 50), 0.5);
  assertClose(KnobScale.valueToRatio(spec, 100), 1);

  assertClose(KnobScale.ratioToValue(spec, 0), 0);
  assertClose(KnobScale.ratioToValue(spec, 0.5), 50);
  assertClose(KnobScale.ratioToValue(spec, 1), 100);

  const linearRoundtrip = KnobScale.ratioToValue(spec, KnobScale.valueToRatio(spec, 33.3));
  assertClose(linearRoundtrip, 33.3);
});

test('quantizeDrag rules', () => {
  const hzSpecHigh = { type: 'hz', min: 20, max: 20000, step: 1 };
  assert.equal(KnobScale.quantizeDrag(hzSpecHigh, 440.4), 440);
  assert.equal(KnobScale.quantizeDrag(hzSpecHigh, 440.6), 441);
  assert.equal(KnobScale.quantizeDrag(hzSpecHigh, 1234), 1230);
  assert.equal(KnobScale.quantizeDrag(hzSpecHigh, 1236), 1240);

  const hzSpecLow = { type: 'hz', min: 0.1, max: 20, step: 0.01 };
  assertClose(KnobScale.quantizeDrag(hzSpecLow, 2.02), 2.0);
  assertClose(KnobScale.quantizeDrag(hzSpecLow, 2.03), 2.05);

  const bpmSpec = { type: 'bpm', min: 40, max: 240, step: 1 };
  assert.equal(KnobScale.quantizeDrag(bpmSpec, 120.4), 120);
  assert.equal(KnobScale.quantizeDrag(bpmSpec, 120.6), 121);

  const stepSpec = { type: 'semitone', min: -12, max: 12, step: 1 };
  assert.equal(KnobScale.quantizeDrag(stepSpec, 4.4), 4);
  assert.equal(KnobScale.quantizeDrag(stepSpec, 4.6), 5);

  const resSpec = { type: 'res', min: 0.1, max: 10, step: 0.1 };
  assertClose(KnobScale.quantizeDrag(resSpec, 2.44), 2.4);
  assertClose(KnobScale.quantizeDrag(resSpec, 2.46), 2.5);

  const defaultSpec = { type: 'percent', min: 0, max: 1, step: 0.01 };
  assertClose(KnobScale.quantizeDrag(defaultSpec, 0.1234), 0.12);
  assertClose(KnobScale.quantizeDrag(defaultSpec, 0.1267), 0.13);
});

test('quantizeWheel rules', () => {
  const hzSpecHigh = { type: 'hz', min: 20, max: 20000, step: 1 };
  assert.equal(KnobScale.quantizeWheel(hzSpecHigh, 440.4), 440);
  assert.equal(KnobScale.quantizeWheel(hzSpecHigh, 440.6), 441);
  assert.equal(KnobScale.quantizeWheel(hzSpecHigh, 1234), 1230);
  assert.equal(KnobScale.quantizeWheel(hzSpecHigh, 1236), 1240);

  const stepSpec = { step: 1 };
  assert.equal(KnobScale.quantizeWheel(stepSpec, 5.4), 5);
  assert.equal(KnobScale.quantizeWheel(stepSpec, 5.6), 6);

  const defaultSpec = { type: 'percent', step: 0.01 };
  assert.equal(KnobScale.quantizeWheel(defaultSpec, 0.12345), 0.12345);
});
