/**
 * FM-4 • ALGORITHM ROUTING DISPLAY
 * Draws the operator routing of SynthBlocks.Operator.ALGORITHMS as a small LCD-style SVG.
 * Carriers sit on the bottom row and feed the OUT bus; each modulator sits one row above the
 * deepest operator it modulates, centred over its targets.
 * layout() and svg() are DOM-free (unit tested); render() writes into an element.
 */
const FmAlgorithmDisplay = (() => {
  const BOX = 22;      // operator box size
  const COL = 36;      // horizontal distance between columns
  const ROW = 34;      // vertical distance between rows
  const PAD = 6;
  const OUT_GAP = 14;  // carrier box bottom to OUT bus

  /**
   * Grid positions for one algorithm.
   * Returns { nodes: [{ op, row, x, carrier }], edges: [[from, to]], carriers, rows }
   * row 0 = carriers; x in column units, centred on 0.
   */
  function layout(algorithm) {
    const alg = SynthBlocks.Operator.ALGORITHMS[algorithm];
    if (!alg) return null;
    const targets = (op) => alg.mods.filter(([from]) => from === op).map(([, to]) => to);

    const rowOf = {};
    const depth = (op) => {
      if (rowOf[op] !== undefined) return rowOf[op];
      const t = targets(op);
      rowOf[op] = t.length ? 1 + Math.max(...t.map(depth)) : 0;
      return rowOf[op];
    };
    const ops = [1, 2, 3, 4];
    ops.forEach(depth);

    const x = {};
    const carriers = ops.filter((op) => rowOf[op] === 0);
    carriers.forEach((op, i) => { x[op] = i - (carriers.length - 1) / 2; });

    const rows = Math.max(...ops.map((op) => rowOf[op])) + 1;
    for (let row = 1; row < rows; row++) {
      const inRow = ops.filter((op) => rowOf[op] === row);
      for (const op of inRow) {
        const t = targets(op);
        x[op] = t.reduce((sum, to) => sum + x[to], 0) / t.length;
      }
      // Operators that land on the same spot share it side by side
      const byX = {};
      for (const op of inRow) (byX[x[op]] = byX[x[op]] || []).push(op);
      for (const group of Object.values(byX)) {
        group.forEach((op, i) => { x[op] += (i - (group.length - 1) / 2); });
      }
    }

    return {
      nodes: ops.map((op) => ({ op, row: rowOf[op], x: x[op], carrier: rowOf[op] === 0 })),
      edges: alg.mods.map(([from, to]) => [from, to]),
      carriers,
      rows
    };
  }

  // One-line routing summary, e.g. "4→3 2→1 · OUT 1+3"
  function caption(algorithm) {
    const alg = SynthBlocks.Operator.ALGORITHMS[algorithm];
    if (!alg) return '';
    const mods = alg.mods.map(([from, to]) => `${from}→${to}`).join(' ');
    return `${mods ? mods + ' · ' : ''}OUT ${alg.carriers.join('+')}`;
  }

  function svg(algorithm) {
    const l = layout(algorithm);
    if (!l) return '';
    const xs = l.nodes.map((n) => n.x);
    const minX = Math.min(...xs);
    const width = (Math.max(...xs) - minX) * COL + BOX + PAD * 2;
    const height = (l.rows - 1) * ROW + BOX + OUT_GAP + PAD * 2;
    const pos = {};
    for (const n of l.nodes) {
      pos[n.op] = {
        cx: PAD + BOX / 2 + (n.x - minX) * COL,
        top: PAD + (l.rows - 1 - n.row) * ROW
      };
    }
    const busY = PAD + (l.rows - 1) * ROW + BOX + OUT_GAP - 4;
    const parts = [];

    for (const [from, to] of l.edges) {
      const a = pos[from];
      const b = pos[to];
      parts.push(`<line class="fm-alg-edge" x1="${a.cx}" y1="${a.top + BOX}" x2="${b.cx}" y2="${b.top}"/>`);
    }
    const carrierX = l.carriers.map((op) => pos[op].cx);
    for (const op of l.carriers) {
      parts.push(`<line class="fm-alg-out" x1="${pos[op].cx}" y1="${pos[op].top + BOX}" x2="${pos[op].cx}" y2="${busY}"/>`);
    }
    parts.push(`<line class="fm-alg-out" x1="${Math.min(...carrierX) - 6}" y1="${busY}" x2="${Math.max(...carrierX) + 6}" y2="${busY}"/>`);
    for (const n of l.nodes) {
      const { cx, top } = pos[n.op];
      const cls = n.carrier ? 'fm-alg-op carrier' : 'fm-alg-op';
      parts.push(
        `<g class="${cls}"><rect x="${cx - BOX / 2}" y="${top}" width="${BOX}" height="${BOX}" rx="3"/>` +
        `<text x="${cx}" y="${top + BOX / 2}">${n.op}</text></g>`
      );
    }

    return `<svg class="fm-alg-svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" ` +
      `aria-label="Algorithmus ${algorithm}: ${caption(algorithm)}">${parts.join('')}</svg>`;
  }

  // Writes diagram and caption into the display element (ids from index.html)
  function render(algorithm, doc = document) {
    const screen = doc.getElementById('fmAlgorithmDiagram');
    const label = doc.getElementById('fmAlgorithmCaption');
    const number = doc.getElementById('fmAlgorithmNumber');
    if (screen) screen.innerHTML = svg(algorithm);
    if (label) label.textContent = caption(algorithm);
    if (number) number.textContent = `ALG ${algorithm}`;
  }

  return { layout, caption, svg, render };
})();

window.FmAlgorithmDisplay = FmAlgorithmDisplay;
