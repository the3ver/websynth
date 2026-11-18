const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadScripts } = require('./helpers/load-browser-script');

const { FmAlgorithmDisplay, FmAlgorithms } = loadScripts('fm-algorithms.js', 'fm-algorithm-display.js');
const { layout, caption, svg } = FmAlgorithmDisplay;
const plain = (v) => JSON.parse(JSON.stringify(v));
const node = (l, op) => l.nodes.find((n) => n.op === op);
const { C, A, B1, B2 } = FmAlgorithms;

test('algorithm 4 is a vertical stack B2 over B1 over A over C', () => {
  const l = layout(4);
  assert.equal(l.rows, 4);
  assert.deepEqual([C, A, B1, B2].map((op) => node(l, op).row), [0, 1, 2, 3]);
  assert.ok(l.nodes.every((n) => n.x === 0));
  assert.equal(node(l, C).out, 'x');
  assert.equal(node(l, A).out, 'y');
  assert.ok(node(l, B2).feedback);
});

test('algorithm 3: A sits centred above C, B2 and B1; C and B2 share output X', () => {
  const l = layout(3);
  assert.equal(node(l, A).row, 1);
  assert.equal(node(l, A).x, node(l, B2).x);
  assert.deepEqual(plain(l.x), [C, B2]);
  assert.deepEqual(plain(l.y), [B1]);
});

test('algorithm 5: B1 and B2 both modulate A and do not overlap', () => {
  const l = layout(5);
  assert.equal(node(l, B1).row, node(l, B2).row);
  assert.notEqual(node(l, B1).x, node(l, B2).x);
});

test('every algorithm: modulators sit above their targets, no two boxes share a spot, one feedback operator', () => {
  for (const n of Object.keys(FmAlgorithms.ALGORITHMS).map(Number)) {
    const l = layout(n);
    assert.equal(l.nodes.length, 4, `alg ${n}`);
    for (const [from, to] of l.edges) assert.ok(node(l, from).row > node(l, to).row, `alg ${n}: ${from}->${to}`);
    const spots = l.nodes.map((nd) => `${nd.row}:${nd.x}`);
    assert.equal(new Set(spots).size, 4, `alg ${n}: ${spots}`);
    assert.equal(l.nodes.filter((nd) => nd.feedback).length, 1, `alg ${n} feedback`);
    assert.ok(l.x.length > 0 && l.y.length > 0, `alg ${n} outputs`);
  }
});

test('caption names modulations, feedback and both outputs', () => {
  assert.equal(caption(2), 'A→C B2→B1 · FB B2 · X C · Y B1');
  assert.equal(caption(7), 'A→C B2→B1 · FB A · X C+A · Y B1+B2');
});

test('svg draws 4 named boxes, one line per modulation, a feedback loop and both buses', () => {
  const s = svg(1);
  assert.equal((s.match(/<rect /g) || []).length, 4);
  assert.equal((s.match(/class="fm-alg-edge"/g) || []).length, 3);
  assert.equal((s.match(/class="fm-alg-fb"/g) || []).length, 1);
  assert.ok(s.includes('>B1<') && s.includes('>C<'));
  assert.ok(s.includes('>X<') && s.includes('>Y<'));
  assert.ok(!/NaN|undefined|Infinity/.test(s));
});

test('every algorithm draws on the same canvas size, so the display never changes height', () => {
  const sizes = Object.keys(FmAlgorithms.ALGORITHMS).map((n) => svg(Number(n)).match(/viewBox="([^"]+)"/)[1]);
  assert.equal(new Set(sizes).size, 1, sizes.join(' | '));
});

test('unknown algorithms draw nothing', () => {
  assert.equal(layout(42), null);
  assert.equal(svg(42), '');
  assert.equal(caption(42), '');
});
