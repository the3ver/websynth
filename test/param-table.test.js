const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadScripts } = require('./helpers/load-browser-script');

const { SynthBlocks } = loadScripts('lib/param-table.js');
const { ParamTable } = SynthBlocks;

const plain = (value) => JSON.parse(JSON.stringify(value));

function demo() {
  const engine = { op: { level: 0.5 }, glide: false, setLevel(v) { this.op.level = v; }, setGlide(v) { this.glide = v; } };
  const table = new ParamTable([
    { path: 'op.level', knob: 'op-level', lfo: 1, set: (e, v) => e.setLevel(v) },
    { path: 'performance.glide', field: 'glide', set: (e, v) => e.setGlide(v) }
  ]);
  return { engine, table };
}

test('readState builds a nested state, reading field-backed params from the engine field', () => {
  const { engine, table } = demo();
  engine.glide = true;
  assert.deepEqual(plain(table.readState(engine)), { op: { level: 0.5 }, performance: { glide: true } });
});

test('applyState sets only the params present in the state', () => {
  const { engine, table } = demo();
  table.applyState(engine, { op: { level: 0.9 } });
  assert.equal(engine.op.level, 0.9);
  assert.equal(engine.glide, false);
});

test('byKnob resolves shared knobs by the selected value', () => {
  const { table } = demo();
  assert.equal(table.byKnob('op-level', 1).path, 'op.level');
  assert.equal(table.byKnob('op-level', 2), undefined);
});

test('envParams yields one setEnvStage row per ADSR stage', () => {
  const calls = [];
  const rows = ParamTable.envParams('modEnv');
  assert.deepEqual(Array.from(rows, (r) => r.path), ['modEnv.attack', 'modEnv.decay', 'modEnv.sustain', 'modEnv.release']);
  rows[2].set({ setEnvStage: (...args) => calls.push(args) }, 0.4);
  assert.deepEqual(calls.map((c) => Array.from(c)), [['modEnv', 'sustain', 0.4]]);
});
