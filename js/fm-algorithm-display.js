/**
 * FM-4 • ALGORITHM ROUTING DISPLAY
 * Draws the routing of FmAlgorithms.ALGORITHMS as a small LCD-style SVG: operators C, A, B1, B2,
 * modulation lines, a feedback loop on the feedback operator and the two outputs X and Y.
 * Operators that modulate nothing sit on the bottom row; a modulator sits one row above the
 * deepest operator it modulates, centred over its targets.
 * layout() and svg() are DOM-free (unit tested); render() writes into the panel.
 */
const FmAlgorithmDisplay = (() => {
  const BOX = 22; // operator box size
  const COL = 36; // horizontal distance between columns
  const ROW = 34; // vertical distance between rows
  const PAD = 10;
  const BUS_GAP = 12; // bottom box edge to bus X; bus Y sits BUS_STEP below
  const BUS_STEP = 9;

  /**
   * Grid positions for one algorithm.
   * Returns { nodes: [{ op, name, row, x, out: 'x' | 'y' | null, feedback }], edges, x, y, rows }
   * row 0 = bottom; x in column units, centred on 0.
   */
  function layout(algorithm) {
    const alg = FmAlgorithms.ALGORITHMS[algorithm];
    if (!alg) return null;
    const targets = (op) => alg.mods.filter(([from]) => from === op).map(([, to]) => to);

    const rowOf = {};
    const depth = (op) => {
      if (rowOf[op] === undefined) {
        const t = targets(op);
        rowOf[op] = t.length ? 1 + Math.max(...t.map(depth)) : 0;
      }
      return rowOf[op];
    };
    const ops = [1, 2, 3, 4];
    ops.forEach(depth);

    // Bottom row left to right: output X operators, unrouted ones, output Y operators
    const side = (op) =>
      alg.x.includes(op) ? alg.x.indexOf(op) : alg.y.includes(op) ? 20 + alg.y.indexOf(op) : 10 + op;
    const x = {};
    const bottom = ops.filter((op) => rowOf[op] === 0).sort((a, b) => side(a) - side(b));
    bottom.forEach((op, i) => {
      x[op] = i - (bottom.length - 1) / 2;
    });

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
        group.forEach((op, i) => {
          x[op] += i - (group.length - 1) / 2;
        });
      }
    }

    const outOf = (op) => (alg.x.includes(op) ? 'x' : alg.y.includes(op) ? 'y' : null);
    return {
      nodes: ops.map((op) => ({
        op,
        name: FmAlgorithms.NAMES[op],
        row: rowOf[op],
        x: x[op],
        out: outOf(op),
        feedback: alg.feedback === op
      })),
      edges: alg.mods.map(([from, to]) => [from, to]),
      x: alg.x,
      y: alg.y,
      rows
    };
  }

  // One-line routing summary, e.g. "A>C B2>B1 · FB B2 · X C · Y B1"
  function caption(algorithm) {
    const alg = FmAlgorithms.ALGORITHMS[algorithm];
    if (!alg) return '';
    const name = (op) => FmAlgorithms.NAMES[op];
    const mods = alg.mods.map(([from, to]) => `${name(from)}→${name(to)}`).join(' ');
    return `${mods} · FB ${name(alg.feedback)} · X ${alg.x.map(name).join('+')} · Y ${alg.y.map(name).join('+')}`;
  }

  function svg(algorithm) {
    const l = layout(algorithm);
    if (!l) return '';
    // Fixed canvas for 4 columns and 4 rows, so the display keeps its size for every algorithm;
    // the routing sits centred horizontally and on the bottom (next to the buses)
    const xs = l.nodes.map((n) => n.x);
    const minX = Math.min(...xs);
    const contentWidth = (Math.max(...xs) - minX) * COL + BOX;
    const width = 3 * COL + BOX + PAD * 2 + 16;
    const busX = PAD + 3 * ROW + BOX + BUS_GAP;
    const busY = busX + BUS_STEP;
    const height = busY + 10;
    const left0 = (width - contentWidth) / 2;
    const pos = {};
    for (const n of l.nodes) {
      pos[n.op] = {
        cx: left0 + BOX / 2 + (n.x - minX) * COL,
        top: PAD + (3 - n.row) * ROW,
        row: n.row
      };
    }
    const parts = [];

    for (const [from, to] of l.edges) {
      const a = pos[from];
      const b = pos[to];
      parts.push(`<line class="fm-alg-edge" x1="${a.cx}" y1="${a.top + BOX}" x2="${b.cx}" y2="${b.top}"/>`);
    }

    // Outputs: bottom-row operators drop straight down, higher ones leave on their right side
    const busLines = { x: [], y: [] };
    for (const n of l.nodes) {
      if (!n.out) continue;
      const { cx, top, row } = pos[n.op];
      const busYPos = n.out === 'x' ? busX : busY;
      const cls = `fm-alg-out out-${n.out}`;
      if (row === 0) {
        parts.push(`<line class="${cls}" x1="${cx}" y1="${top + BOX}" x2="${cx}" y2="${busYPos}"/>`);
        busLines[n.out].push(cx);
      } else {
        const sx = cx + BOX / 2 + 4;
        parts.push(
          `<polyline class="${cls}" points="${cx + BOX / 2},${top + BOX / 2} ${sx},${top + BOX / 2} ${sx},${busYPos}"/>`
        );
        busLines[n.out].push(sx);
      }
    }
    for (const [bus, yPos] of [
      ['x', busX],
      ['y', busY]
    ]) {
      const pts = busLines[bus];
      const left = Math.min(...pts);
      const right = Math.max(...pts);
      if (bus === 'x') {
        parts.push(`<line class="fm-alg-out out-x" x1="${left - 6}" y1="${yPos}" x2="${right}" y2="${yPos}"/>`);
        parts.push(`<text class="fm-alg-bus" x="${left - 9}" y="${yPos}">X</text>`);
      } else {
        parts.push(`<line class="fm-alg-out out-y" x1="${left}" y1="${yPos}" x2="${right + 6}" y2="${yPos}"/>`);
        parts.push(`<text class="fm-alg-bus" x="${right + 9}" y="${yPos}">Y</text>`);
      }
    }

    for (const n of l.nodes) {
      const { cx, top } = pos[n.op];
      const left = cx - BOX / 2;
      if (n.feedback) {
        parts.push(
          `<polyline class="fm-alg-fb" points="${left},${top + 7} ${left - 5},${top + 7} ${left - 5},${top - 5} ${cx},${top - 5} ${cx},${top}"/>`
        );
      }
      const cls = n.out ? 'fm-alg-op carrier' : 'fm-alg-op';
      parts.push(
        `<g class="${cls}"><rect x="${left}" y="${top}" width="${BOX}" height="${BOX}" rx="3"/>` +
          `<text x="${cx}" y="${top + BOX / 2}">${n.name}</text></g>`
      );
    }

    return (
      `<svg class="fm-alg-svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" ` +
      `aria-label="Algorithmus ${algorithm}: ${caption(algorithm)}">${parts.join('')}</svg>`
    );
  }

  // Writes diagram and caption into the display element (ids from index.html)
  function render(algorithm, doc = document) {
    const screen = doc.getElementById('fmAlgorithmDiagram');
    const label = doc.getElementById('fmAlgorithmCaption');
    if (screen) screen.innerHTML = svg(algorithm);
    if (label) label.textContent = caption(algorithm);
  }

  return { layout, caption, svg, render };
})();

window.FmAlgorithmDisplay = FmAlgorithmDisplay;
