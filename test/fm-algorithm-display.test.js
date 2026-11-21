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
  assert.deepEqual(
    [C, A, B1, B2].map((op) => node(l, op).row),
    [0, 1, 2, 3]
  );
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

// --- Graphic only, tight fixed canvas ---
const fs = require('fs');
const path = require('path');
const viewBox = (n) =>
  svg(n)
    .match(/viewBox="([^"]+)"/)[1]
    .split(' ')
    .map(Number);
const algorithms = () => Object.keys(FmAlgorithms.ALGORITHMS).map(Number);

test('every drawing lies inside the canvas, centred, and the widest and tallest ones fill it up to the margin', () => {
  const { MARGIN } = FmAlgorithmDisplay;
  const [, , width, height] = viewBox(1);
  let widest = 0;
  let tallest = 0;
  for (const n of algorithms()) {
    const b = FmAlgorithmDisplay.bounds(n);
    assert.ok(b.minX >= MARGIN - 0.01 && b.minY >= MARGIN - 0.01, `algorithm ${n} left/top`);
    assert.ok(b.maxX <= width - MARGIN + 0.01 && b.maxY <= height - MARGIN + 0.01, `algorithm ${n} right/bottom`);
    assert.ok(Math.abs(b.minX - (width - b.maxX)) < 0.01, `algorithm ${n} centred horizontally`);
    assert.ok(Math.abs(b.minY - (height - b.maxY)) < 0.01, `algorithm ${n} centred vertically`);
    widest = Math.max(widest, b.maxX - b.minX);
    tallest = Math.max(tallest, b.maxY - b.minY);
  }
  assert.ok(Math.abs(width - 2 * MARGIN - widest) < 0.01, `canvas width ${width} vs widest drawing ${widest}`);
  assert.ok(Math.abs(height - 2 * MARGIN - tallest) < 0.01, `canvas height ${height} vs tallest drawing ${tallest}`);
});

test('the display shows only the graphic: no routing caption in the page or written by render()', () => {
  const html = fs.readFileSync(path.resolve(__dirname, '..', 'index.html'), 'utf8');
  assert.ok(!html.includes('fmAlgorithmCaption'));
  const written = {};
  const doc = { getElementById: (id) => (written[id] = { innerHTML: '', textContent: '' }) };
  FmAlgorithmDisplay.render(2, doc);
  assert.deepEqual(Object.keys(written), ['fmAlgorithmDiagram']);
  assert.match(written.fmAlgorithmDiagram.innerHTML, /^<svg /);
});

test('the display has one fixed size on every screen, in the aspect ratio of the canvas', () => {
  const raw = fs.readFileSync(path.resolve(__dirname, '..', 'css', 'style.css'), 'utf8');
  // The width lives in one custom property (--fm-alg-width) shared with the button rows and the grid column
  const algWidth = (raw.match(/--fm-alg-width:\s*(\d+px)/) || [])[1];
  assert.ok(algWidth, '--fm-alg-width defined in px');
  const css = raw.replace(/var\(--fm-alg-width\)/g, algWidth);
  const rules = Array.from(css.matchAll(/([^{}]*\.fm-alg-(?:display|screen|svg)\b[^{}]*)\{([^}]*)\}/g));
  const display = rules.filter(([, sel]) => /\.fm-alg-display\s*$/.test(sel.trim()));
  assert.equal(display.length, 1, 'exactly one .fm-alg-display rule, none inside media queries');
  const px = (prop) => Number((display[0][2].match(new RegExp(`(?:^|[;\\s])${prop}:\\s*(\\d+)px`)) || [])[1]);
  const [w, h] = [px('width'), px('height')];
  assert.ok(w > 0 && h > 0, 'width and height in px');
  const [, , cw, ch] = viewBox(1);
  // Inner box (minus padding and border) matches the canvas aspect within 3 %
  const pad = Number((display[0][2].match(/padding:\s*(\d+)px/) || [])[1] || 0) + 1;
  assert.ok(Math.abs((w - 2 * pad) / (h - 2 * pad) - cw / ch) < 0.03 * (cw / ch), `${w}x${h} vs canvas ${cw}x${ch}`);
  const overrides = rules.filter(
    ([sel, body]) =>
      !display.includes(rules.find((r) => r[1] === sel && r[2] === body)) &&
      /(^|[;\s])(max-|min-)?(width|height):/.test(body) &&
      !/:\s*100%/.test(body)
  );
  assert.deepEqual(
    overrides.map(([sel]) => sel.trim()),
    [],
    'no other rule sizes the display or the graphic'
  );
});
