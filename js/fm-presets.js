/**
 * FM-4 • FACTORY PRESETS
 * Every preset defines the full FM-4 patch (same leaf paths as FM_INIT_PRESET).
 * Algorithms: see SynthBlocks.Operator.ALGORITHMS (js/lib/operator.js).
 */

const fmEnv = (attack, decay, sustain, release) => ({ attack, decay, sustain, release });
const fmOp = (ratio, level, env, detune = 0) => ({ ratio, detune, level, env });
const fmFx = (chorusMode, chorusMix, delayMix, reverbMix) => ({
  chorus: { mode: chorusMode, mix: chorusMix },
  delay: { time: 0.32, feedback: 0.35, mix: delayMix },
  reverb: { decay: 2.6, mix: reverbMix }
});
const fmPerf = { glide: false, octaveShift: 0 };

const FM_INIT_PRESET = {
  id: 'fm-init',
  name: 'INIT // SINE + 1 MOD',
  category: 'INIT',
  description: 'Neutral FM patch: carrier 1 with one gentle 1:1 modulator',
  state: {
    algorithm: 1,
    op1: fmOp(1, 0.8, fmEnv(0.005, 0.8, 0.7, 0.35)),
    op2: fmOp(1, 0.25, fmEnv(0.005, 0.6, 0.4, 0.35)),
    op3: fmOp(1, 0.0, fmEnv(0.005, 0.5, 0.0, 0.3)),
    op4: fmOp(1, 0.0, fmEnv(0.005, 0.5, 0.0, 0.3)),
    vibrato: { rate: 5.0, depth: 0.0 },
    fx: fmFx('off', 0.5, 0.0, 0.0),
    performance: fmPerf
  }
};

const FM_FACTORY_PRESETS = [
  {
    id: 'fm-tine-piano',
    name: 'TINE PIANO',
    category: 'KEYS',
    description: 'Two stacks: 1:1 body plus a 14:1 tine that fades fast',
    state: {
      algorithm: 5,
      op1: fmOp(1, 0.85, fmEnv(0.002, 2.2, 0.0, 0.5)),
      op2: fmOp(14, 0.18, fmEnv(0.001, 0.25, 0.0, 0.2)),
      op3: fmOp(1, 0.55, fmEnv(0.002, 1.6, 0.0, 0.45), 4),
      op4: fmOp(1, 0.22, fmEnv(0.002, 1.2, 0.1, 0.4)),
      vibrato: { rate: 4.5, depth: 0.0 },
      fx: fmFx('I', 0.45, 0.1, 0.2),
      performance: fmPerf
    }
  },
  {
    id: 'fm-glass-bell',
    name: 'GLASS BELL',
    category: 'BELL',
    description: 'Inharmonic 3.5:1 modulator with a long ringing tail',
    state: {
      algorithm: 3,
      op1: fmOp(1, 0.8, fmEnv(0.002, 4.0, 0.0, 2.5)),
      op2: fmOp(3.5, 0.35, fmEnv(0.002, 3.0, 0.0, 2.0)),
      op3: fmOp(7, 0.1, fmEnv(0.002, 1.5, 0.0, 1.0)),
      op4: fmOp(1, 0.0, fmEnv(0.005, 0.5, 0.0, 0.3)),
      vibrato: { rate: 5.0, depth: 0.0 },
      fx: fmFx('off', 0.5, 0.25, 0.45),
      performance: fmPerf
    }
  },
  {
    id: 'fm-slap-bass',
    name: 'SLAP BASS',
    category: 'BASS',
    description: 'Serial stack, short bright attack that drops into a round body',
    state: {
      algorithm: 1,
      op1: fmOp(1, 0.9, fmEnv(0.001, 0.9, 0.4, 0.15)),
      op2: fmOp(1, 0.45, fmEnv(0.001, 0.3, 0.15, 0.1)),
      op3: fmOp(2, 0.2, fmEnv(0.001, 0.15, 0.0, 0.1)),
      op4: fmOp(1, 0.0, fmEnv(0.005, 0.5, 0.0, 0.3)),
      vibrato: { rate: 5.0, depth: 0.0 },
      fx: fmFx('off', 0.5, 0.0, 0.05),
      performance: { glide: false, octaveShift: -1 }
    }
  },
  {
    id: 'fm-brass',
    name: 'FM BRASS',
    category: 'BRASS',
    description: 'Modulator envelope follows a slow attack, so the tone brightens as it swells',
    state: {
      algorithm: 2,
      op1: fmOp(1, 0.8, fmEnv(0.06, 0.4, 0.8, 0.3)),
      op2: fmOp(1, 0.4, fmEnv(0.09, 0.5, 0.6, 0.3)),
      op3: fmOp(1, 0.12, fmEnv(0.12, 0.6, 0.5, 0.3), 7),
      op4: fmOp(2, 0.08, fmEnv(0.1, 0.4, 0.3, 0.3)),
      vibrato: { rate: 5.5, depth: 0.15 },
      fx: fmFx('I', 0.35, 0.1, 0.25),
      performance: fmPerf
    }
  },
  {
    id: 'fm-drawbar-organ',
    name: 'DRAWBAR ORGAN',
    category: 'ORGAN',
    description: 'All four operators as carriers at 0.5, 1, 2 and 3: additive drawbars',
    state: {
      algorithm: 8,
      op1: fmOp(1, 0.8, fmEnv(0.004, 0.1, 1.0, 0.08)),
      op2: fmOp(0.5, 0.6, fmEnv(0.004, 0.1, 1.0, 0.08)),
      op3: fmOp(2, 0.5, fmEnv(0.004, 0.1, 1.0, 0.08)),
      op4: fmOp(3, 0.35, fmEnv(0.004, 0.1, 1.0, 0.08)),
      vibrato: { rate: 6.5, depth: 0.2 },
      fx: fmFx('II', 0.6, 0.0, 0.2),
      performance: fmPerf
    }
  },
  {
    id: 'fm-marimba',
    name: 'MARIMBA',
    category: 'MALLET',
    description: 'Woody knock from a 4:1 modulator with a very short envelope',
    state: {
      algorithm: 4,
      op1: fmOp(1, 0.85, fmEnv(0.001, 0.7, 0.0, 0.3)),
      op2: fmOp(4, 0.3, fmEnv(0.001, 0.06, 0.0, 0.05)),
      op3: fmOp(10, 0.06, fmEnv(0.001, 0.03, 0.0, 0.03)),
      op4: fmOp(1, 0.0, fmEnv(0.005, 0.5, 0.0, 0.3)),
      vibrato: { rate: 5.0, depth: 0.0 },
      fx: fmFx('off', 0.5, 0.15, 0.3),
      performance: fmPerf
    }
  }
];

window.FM_FACTORY_PRESETS = FM_FACTORY_PRESETS;
window.FM_INIT_PRESET = FM_INIT_PRESET;
