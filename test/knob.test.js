const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadScriptsWith } = require('./helpers/load-browser-script');

const noop = () => {};
const { Knob } = loadScriptsWith(
  { document: { getElementById: () => null, body: { style: {} } }, addEventListener: noop },
  'knob-scale.js',
  'controls.js'
);

function housing(data) {
  const props = {};
  const dial = { style: {} };
  return {
    dataset: data,
    props,
    dial,
    style: { setProperty: (k, v) => { props[k] = v; } },
    querySelector: () => dial,
    addEventListener: noop
  };
}

test('knob publishes its position 0..1 as --knob-ratio for the stylesheet', () => {
  const h = housing({ param: 'x', min: '0', max: '1', step: '0.01', default: '0.25', type: 'percent' });
  const knob = new Knob(h, noop);
  assert.equal(h.props['--knob-ratio'], '0.2500');
  assert.equal(h.dial.style.transform, 'rotate(-67.5deg)');

  knob.setValue(1);
  assert.equal(h.props['--knob-ratio'], '1.0000');
  knob.setValue(0);
  assert.equal(h.props['--knob-ratio'], '0.0000');
});
