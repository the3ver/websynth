const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadScripts } = require('./helpers/load-browser-script');

const { FmAlgorithmDisplay, SynthBlocks } = loadScripts('lib/operator.js', 'fm-algorithm-display.js');
const { layout, caption, svg } = FmAlgorithmDisplay;
const plain = (v) => JSON.parse(JSON.stringify(v));
const node = (l, op) => l.nodes.find((n) => n.op === op);

test('algorithm 1 is a vertical stack 4 over 3 over 2 over carrier 1', () => {
  const l = layout(1);
  assert.deepEqual(plain(l.carriers), [1]);
  assert.equal(l.rows, 4);
  for (const op of [1, 2, 3, 4]) {
    assert.equal(node(l, op).row, op - 1);
    assert.equal(node(l, op).x, 0);
  }
});

test('algorithm 8 puts all four carriers side by side on one row', () => {
  const l = layout(8);
  assert.equal(l.rows, 1);
  assert.deepEqual(plain(l.nodes.map((n) => n.x)), [-1.5, -0.5, 0.5, 1.5]);
  assert.ok(l.nodes.every((n) => n.carrier && n.row === 0));
});

test('algorithm 6: operator 4 sits centred above its three carriers', () => {
  const l = layout(6);
  assert.equal(node(l, 4).row, 1);
  assert.equal(node(l, 4).x, node(l, 2).x);
  assert.deepEqual(plain(l.edges), [[4, 1], [4, 2], [4, 3]]);
});

test('algorithm 2: two modulators of the same target do not overlap', () => {
  const l = layout(2);
  assert.equal(node(l, 3).row, node(l, 4).row);
  assert.notEqual(node(l, 3).x, node(l, 4).x);
});

test('every algorithm: each modulator sits above every operator it modulates, no two boxes share a spot', () => {
  for (const n of Object.keys(SynthBlocks.Operator.ALGORITHMS).map(Number)) {
    const l = layout(n);
    assert.equal(l.nodes.length, 4, `alg ${n}`);
    for (const [from, to] of l.edges) assert.ok(node(l, from).row > node(l, to).row, `alg ${n}: ${from}->${to}`);
    const spots = l.nodes.map((nd) => `${nd.row}:${nd.x}`);
    assert.equal(new Set(spots).size, 4, `alg ${n}: ${spots}`);
    assert.deepEqual(plain(l.nodes.filter((nd) => nd.carrier).map((nd) => nd.op)), plain(SynthBlocks.Operator.ALGORITHMS[n].carriers));
  }
});

test('caption lists modulations and carriers', () => {
  assert.equal(caption(5), '4→3 2→1 · OUT 1+3');
  assert.equal(caption(8), 'OUT 1+2+3+4');
});

test('svg draws 4 boxes, one line per modulation and the out bus', () => {
  const s = svg(5);
  assert.equal((s.match(/<rect /g) || []).length, 4);
  assert.equal((s.match(/class="fm-alg-edge"/g) || []).length, 2);
  assert.equal((s.match(/class="fm-alg-op carrier"/g) || []).length, 2);
  assert.ok(!/NaN|undefined/.test(s));
});

test('unknown algorithms draw nothing', () => {
  assert.equal(layout(42), null);
  assert.equal(svg(42), '');
  assert.equal(caption(42), '');
});
