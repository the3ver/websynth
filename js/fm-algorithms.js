/**
 * FM-4 • ALGORITHMS & RATIOS
 * Four sine operators in the groups C, A, B1, B2 (numbers 1..4 in params and presets).
 * Each algorithm lists its modulations [from, to], the operator with self feedback and the
 * operators that feed output X and output Y; the MIX knob crossfades X and Y.
 * Ratio steps: C mostly integers (it carries the note), A adds inharmonic values, and B1/B2
 * share one knob that turns like the hands of a watch (B2 runs through all steps, then B1 moves on).
 * Shared by the voice worklet (via processorOptions), the engine, the panel and the routing display.
 */
const FmAlgorithms = (() => {
  const C = 1;
  const A = 2;
  const B1 = 3;
  const B2 = 4;
  const NAMES = { 1: 'C', 2: 'A', 3: 'B1', 4: 'B2' };

  const ALGORITHMS = {
    1: { mods: [[A, C], [B1, C], [B2, B1]], feedback: A, x: [C], y: [B1] },
    2: { mods: [[A, C], [B2, B1]], feedback: B2, x: [C], y: [B1] },
    3: { mods: [[A, C], [A, B2], [A, B1]], feedback: A, x: [C, B2], y: [B1] },
    4: { mods: [[A, C], [B1, A], [B2, B1]], feedback: B2, x: [C], y: [A] },
    5: { mods: [[A, C], [B1, A], [B2, A]], feedback: B1, x: [C], y: [A] },
    6: { mods: [[A, C], [A, B1], [B2, C], [B2, B1]], feedback: A, x: [C], y: [B1] },
    7: { mods: [[A, C], [B2, B1]], feedback: A, x: [C, A], y: [B1, B2] },
    8: { mods: [[A, C]], feedback: B1, x: [C, B2], y: [B1] }
  };

  const C_RATIOS = [0.25, 0.5, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16];
  const A_RATIOS = [
    0.25, 0.5, 0.75, 1, 1.41, 1.5, 1.73, 2, 2.5, 2.82, 3, 3.14, 3.5, 4, 4.24, 5, 5.5, 6, 6.28,
    7, 8, 9, 10, 11, 12, 13, 14, 15, 16
  ];
  const B_RATIOS = [0.25, 0.5, 0.75, 1, 1.5, 2, 2.5, 3, 3.5, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16];
  const B_STEPS = B_RATIOS.length * B_RATIOS.length;

  // Index of the list entry closest to value
  function nearestIndex(list, value) {
    let best = 0;
    for (let i = 1; i < list.length; i++) {
      if (Math.abs(list[i] - value) < Math.abs(list[best] - value)) best = i;
    }
    return best;
  }

  // Watch-hand B knob: step -> { b1, b2 } and back
  function bPair(step) {
    const s = Math.max(0, Math.min(B_STEPS - 1, Math.round(step)));
    return { b1: B_RATIOS[Math.floor(s / B_RATIOS.length)], b2: B_RATIOS[s % B_RATIOS.length] };
  }

  function bStep(b1, b2) {
    return nearestIndex(B_RATIOS, b1) * B_RATIOS.length + nearestIndex(B_RATIOS, b2);
  }

  const formatRatio = (r) => (Number.isInteger(r) ? `${r}` : `${r}`.replace(/^0\./, '.'));
  const formatB = (step) => {
    const { b1, b2 } = bPair(step);
    return `${formatRatio(b1)} / ${formatRatio(b2)}`;
  };

  return { C, A, B1, B2, NAMES, ALGORITHMS, C_RATIOS, A_RATIOS, B_RATIOS, B_STEPS, nearestIndex, bPair, bStep, formatB };
})();

window.FmAlgorithms = FmAlgorithms;
