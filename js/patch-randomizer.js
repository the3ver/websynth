/**
 * PATCH RANDOMIZER
 * Builds a random but playable patch for each synth (RANDOM button next to INIT).
 * Values stay inside the knob ranges and lean towards musical settings: log-scaled cutoff and
 * times, short attacks more often than long ones, quiet modulators, FM ratios from the operator
 * group lists. Performance settings (octave, glide) are left out, so the player's octave stays.
 * DOM-free; rng() returns [0, 1) and defaults to Math.random (tests pass a seeded one).
 */
const PatchRandomizer = (() => {
  const round = (v, digits = 2) => Number(v.toFixed(digits));

  function tools(rng) {
    const range = (min, max, digits = 2) => round(min + rng() * (max - min), digits);
    // Log scale: as many values between 10 and 100 as between 100 and 1000
    const logRange = (min, max, digits = 3) => round(min * Math.pow(max / min, rng()), digits);
    // Skewed towards min: power > 1 makes small values more likely
    const low = (min, max, power = 2, digits = 2) => round(min + Math.pow(rng(), power) * (max - min), digits);
    const pick = (list) => list[Math.floor(rng() * list.length)];
    const chance = (p) => rng() < p;
    return { range, logRange, low, pick, chance };
  }

  function fx(t) {
    return {
      // Crusher rarely: a random patch should stay playable, not turn every sound lo-fi
      crusher: { bits: t.range(3, 10, 0), rate: t.logRange(2000, 16000, 0), mix: t.chance(0.15) ? t.range(0.3, 1) : 0 },
      chorus: { mode: t.pick(['off', 'off', 'I', 'II', 'I+II']), mix: t.range(0.3, 0.8) },
      delay: { time: t.range(0.12, 0.6), feedback: t.range(0.2, 0.6), mix: t.chance(0.4) ? t.low(0.05, 0.35) : 0 },
      reverb: { decay: t.range(1.2, 5), mix: t.chance(0.6) ? t.low(0.05, 0.4) : 0 }
    };
  }

  // Musical matrix routes [source, dest, max amount]; a random patch uses at most two of them
  const SUB1_MOD_ROUTES = [
    ['velocity', 'vcf', 0.5], ['modWheel', 'vcf', 0.6], ['key', 'vcf', 0.4], ['ampEnv', 'vcf', 0.4],
    ['filterEnv', 'pitch', 0.1], ['modEnv', 'vcf', 0.5], ['modEnv', 'pwm', 0.5], ['random', 'pitch', 0.03], ['random', 'vcf', 0.3], ['lfo2', 'pwm', 0.6],
    ['velocity', 'amp', 0.3], ['modWheel', 'resonance', 0.5]
  ];

  function modMatrix(t) {
    const matrix = {};
    const count = t.pick([0, 0, 0, 1, 1, 2]);
    for (let n = 1; n <= 8; n++) {
      if (n <= count) {
        const [source, dest, max] = t.pick(SUB1_MOD_ROUTES);
        matrix[`slot${n}`] = { source, dest, amount: t.range(max / 4, max) };
      } else {
        matrix[`slot${n}`] = { source: 'off', dest: 'off', amount: 0 };
      }
    }
    return matrix;
  }

  function sub1(rng = Math.random) {
    const t = tools(rng);
    const waves = ['sawtooth', 'square', 'triangle', 'sine'];
    const lfo = () => {
      const destinations = { pitch: 0, vcf: 0, pwm: 0, amp: 0 };
      if (t.chance(0.5)) destinations[t.pick(['pitch', 'vcf', 'vcf', 'pwm', 'amp'])] = t.low(0.05, 0.5);
      return {
        wave: t.pick(['sine', 'triangle', 'sawtooth', 'square', 'samplehold']),
        rate: t.logRange(0.2, 9, 2),
        fadeIn: t.chance(0.3) ? t.range(0.1, 1.5) : 0,
        destinations
      };
    };
    return {
      vco1: {
        wave: t.pick(waves),
        octave: t.pick([-1, 0, 0, 0, 1]),
        semitone: 0,
        detuneCents: t.chance(0.3) ? Math.round(t.range(-8, 8)) : 0,
        pulseWidth: t.range(0.2, 0.8)
      },
      vco2: {
        wave: t.pick(waves),
        octave: t.pick([-1, 0, 0, 1]),
        semitone: t.pick([0, 0, 0, 0, 7, 12, -12, 5, -5]),
        detuneCents: t.chance(0.6) ? Math.round(t.range(-15, 15)) : 0,
        pulseWidth: t.range(0.2, 0.8),
        hardSync: t.chance(0.15)
      },
      mixer: {
        vco1Level: t.range(0.55, 0.9),
        vco2Level: t.chance(0.7) ? t.range(0.2, 0.8) : 0,
        subLevel: t.chance(0.4) ? t.range(0.1, 0.5) : 0,
        subOctave: t.pick([-1, -2]),
        noiseLevel: t.chance(0.2) ? t.low(0.02, 0.2) : 0
      },
      vcf: {
        cutoff: Math.round(t.logRange(250, 9000, 0)),
        resonance: t.low(0.5, 14, 2, 1),
        type: t.pick(['lowpass24', 'lowpass24', 'lowpass24', 'lowpass12', 'lowpass12', 'bandpass', 'highpass']),
        drive: t.chance(0.4) ? t.low(0.05, 0.6) : 0,
        keyTrack: t.range(0, 1),
        envMod: t.range(-0.3, 0.9)
      },
      filterEnv: { attack: t.logRange(0.002, 1.2), decay: t.logRange(0.05, 2), sustain: t.range(0, 1), release: t.logRange(0.05, 2) },
      ampEnv: { attack: t.chance(0.7) ? t.logRange(0.002, 0.05) : t.logRange(0.05, 1.2), decay: t.logRange(0.1, 2), sustain: t.range(0.3, 1), release: t.logRange(0.05, 2.5) },
      modEnv: { attack: t.logRange(0.002, 1.5), decay: t.logRange(0.05, 3), sustain: t.range(0, 1), release: t.logRange(0.05, 3) },
      lfo1: lfo(),
      lfo2: lfo(),
      modMatrix: modMatrix(t),
      fx: fx(t)
    };
  }

  function fm(rng = Math.random) {
    const t = tools(rng);
    const { ALGORITHMS, A_RATIOS, B_RATIOS } = FmAlgorithms;
    const algorithm = 1 + Math.floor(rng() * Object.keys(ALGORITHMS).length);
    const alg = ALGORITHMS[algorithm];
    const outputs = new Set([...alg.x, ...alg.y]);
    const harmonic = (list) => list.filter((r) => Number.isInteger(r * 2));
    // Harmonic ratios most of the time, any step of the group otherwise
    const ratio = (list, bias) => (t.chance(bias) ? t.pick(harmonic(list).filter((r) => r <= 8)) : t.pick(list));

    const op = (n, ratioValue) => {
      const carrier = outputs.has(n);
      return {
        ratio: ratioValue,
        detune: t.chance(0.25) ? Math.round(t.range(-8, 8)) : 0,
        // Carriers carry the note; modulators stay mostly gentle (index 8 at level 1 is harsh)
        level: carrier ? t.range(0.55, 0.9) : t.low(0.05, 0.6),
        env: {
          attack: carrier && t.chance(0.3) ? t.logRange(0.02, 0.8) : t.logRange(0.001, 0.03),
          decay: t.logRange(carrier ? 0.2 : 0.05, carrier ? 3 : 1.5),
          sustain: t.range(0, carrier ? 1 : 0.7),
          release: t.logRange(0.05, carrier ? 2 : 1)
        }
      };
    };

    return {
      algorithm,
      feedback: t.chance(0.5) ? t.low(0.05, 0.7) : 0,
      mix: t.pick([0, 0, 0.5, t.range(0, 1)]),
      op1: op(1, t.chance(0.7) ? 1 : t.pick([0.5, 2, 3, 4])),
      op2: op(2, ratio(A_RATIOS, 0.6)),
      op3: op(3, ratio(B_RATIOS, 0.7)),
      op4: op(4, ratio(B_RATIOS, 0.7)),
      vibrato: { rate: t.range(4, 7), depth: t.chance(0.3) ? t.low(0.05, 0.3) : 0 },
      fx: fx(t)
    };
  }

  // Preset object for PresetPanel.apply (not stored, shown as RANDOM)
  function preset(state) {
    return { id: 'random-patch', name: 'RANDOM // DICE ROLL', category: 'RANDOM', transient: true, state };
  }

  return { sub1, fm, preset };
})();

window.PatchRandomizer = PatchRandomizer;
