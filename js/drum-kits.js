/**
 * RETROBEAT D-909 • FACTORY KITS
 * Pattern and sound presets for the drum engine. Drum rows: 0 BD, 1 SD, 2 CH, 3 OH, 4 CP.
 * Step values: 0 = off, 1 = normal, 2 = accent.
 */

const DRUM_FACTORY_KITS = [
  {
    id: 'techno-909',
    name: '909 TECHNO CLUB',
    bpm: 132,
    swing: 0.0,
    params: {
      bd: { tune: 46, decay: 0.38, click: 0.7, drive: 0.4 },
      sd: { tune: 195, snappy: 0.75, tone: 0.5, decay: 0.2 },
      hh: { pitch: 8000, decay: 0.05, openDecay: 0.35 },
      cp: { tone: 1100, decay: 0.22 },
      bass: { wave: 'sawtooth', cutoff: 1600, resonance: 14.0, envMod: 0.75, decay: 0.25, drive: 0.4 }
    },
    drums: [
      [2, 0, 0, 0, 2, 0, 0, 0, 2, 0, 0, 0, 2, 0, 0, 0], // BD
      [0, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 2, 0, 0, 0], // SD
      [1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1], // CH
      [0, 0, 2, 0, 0, 0, 2, 0, 0, 0, 2, 0, 0, 0, 2, 0], // OH
      [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1]  // CP
    ],
    bass: [
      { note: 36, gate: true,  accent: true,  slide: false },
      { note: 36, gate: false, accent: false, slide: false },
      { note: 36, gate: true,  accent: false, slide: true  },
      { note: 39, gate: true,  accent: false, slide: false },
      { note: 36, gate: true,  accent: false, slide: false },
      { note: 36, gate: false, accent: false, slide: false },
      { note: 41, gate: true,  accent: true,  slide: true  },
      { note: 42, gate: true,  accent: false, slide: false },
      { note: 36, gate: true,  accent: true,  slide: false },
      { note: 36, gate: false, accent: false, slide: false },
      { note: 48, gate: true,  accent: true,  slide: false },
      { note: 46, gate: true,  accent: false, slide: true  },
      { note: 36, gate: true,  accent: false, slide: false },
      { note: 39, gate: true,  accent: false, slide: false },
      { note: 41, gate: true,  accent: true,  slide: true  },
      { note: 36, gate: true,  accent: false, slide: false }
    ]
  },
  {
    id: 'acid-303',
    name: '303 ACID WAREHOUSE',
    bpm: 138,
    swing: 0.08,
    params: {
      bd: { tune: 52, decay: 0.32, click: 0.8, drive: 0.5 },
      sd: { tune: 210, snappy: 0.85, tone: 0.4, decay: 0.18 },
      hh: { pitch: 8500, decay: 0.04, openDecay: 0.3 },
      cp: { tone: 1300, decay: 0.2 },
      bass: { wave: 'sawtooth', cutoff: 2200, resonance: 18.0, envMod: 0.85, decay: 0.22, drive: 0.6 }
    },
    drums: [
      [2, 0, 0, 0, 1, 0, 0, 1, 2, 0, 0, 0, 1, 0, 1, 0],
      [0, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 2, 0, 0, 0],
      [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
      [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0],
      [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0]
    ],
    bass: [
      { note: 38, gate: true,  accent: true,  slide: false }, // D2
      { note: 38, gate: true,  accent: false, slide: true  },
      { note: 50, gate: true,  accent: true,  slide: false }, // D3
      { note: 38, gate: true,  accent: false, slide: false },
      { note: 41, gate: true,  accent: true,  slide: true  }, // F2
      { note: 43, gate: true,  accent: false, slide: false }, // G2
      { note: 41, gate: true,  accent: false, slide: true  },
      { note: 38, gate: true,  accent: true,  slide: false },
      { note: 38, gate: true,  accent: false, slide: false },
      { note: 50, gate: true,  accent: true,  slide: true  },
      { note: 48, gate: true,  accent: false, slide: false }, // C3
      { note: 45, gate: true,  accent: true,  slide: true  }, // A2
      { note: 38, gate: true,  accent: false, slide: false },
      { note: 41, gate: true,  accent: false, slide: false },
      { note: 43, gate: true,  accent: true,  slide: true  },
      { note: 38, gate: true,  accent: true,  slide: false }
    ]
  },
  {
    id: 'synthwave-80s',
    name: '80s SYNTHWAVE DISCO',
    bpm: 118,
    swing: 0.15,
    params: {
      bd: { tune: 55, decay: 0.4, click: 0.5, drive: 0.2 },
      sd: { tune: 175, snappy: 0.6, tone: 0.7, decay: 0.28 },
      hh: { pitch: 7500, decay: 0.06, openDecay: 0.4 },
      cp: { tone: 950, decay: 0.3 },
      bass: { wave: 'square', cutoff: 1200, resonance: 8.0, envMod: 0.6, decay: 0.32, drive: 0.25 }
    },
    drums: [
      [2, 0, 0, 0, 2, 0, 0, 0, 2, 0, 0, 0, 2, 0, 0, 0],
      [0, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 2, 0, 0, 0],
      [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
      [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 0],
      [0, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 2, 0, 0, 0]
    ],
    bass: [
      { note: 33, gate: true,  accent: true,  slide: false }, // A1
      { note: 33, gate: true,  accent: false, slide: false },
      { note: 33, gate: true,  accent: false, slide: false },
      { note: 33, gate: true,  accent: false, slide: false },
      { note: 40, gate: true,  accent: true,  slide: false }, // E2
      { note: 40, gate: true,  accent: false, slide: false },
      { note: 33, gate: true,  accent: false, slide: false },
      { note: 33, gate: true,  accent: false, slide: false },
      { note: 38, gate: true,  accent: true,  slide: false }, // D2
      { note: 38, gate: true,  accent: false, slide: false },
      { note: 38, gate: true,  accent: false, slide: false },
      { note: 38, gate: true,  accent: false, slide: false },
      { note: 45, gate: true,  accent: true,  slide: true  }, // A2
      { note: 40, gate: true,  accent: false, slide: false }, // E2
      { note: 38, gate: true,  accent: false, slide: false }, // D2
      { note: 35, gate: true,  accent: true,  slide: false }  // B1
    ]
  },
  {
    id: 'dnb-roller',
    name: 'DRUM & BASS ROLLER',
    bpm: 174,
    swing: 0.05,
    params: {
      bd: { tune: 42, decay: 0.3, click: 0.75, drive: 0.45 },
      sd: { tune: 220, snappy: 0.9, tone: 0.45, decay: 0.16 },
      hh: { pitch: 9000, decay: 0.035, openDecay: 0.22 },
      cp: { tone: 1400, decay: 0.18 },
      bass: { wave: 'sawtooth', cutoff: 800, resonance: 10.0, envMod: 0.8, decay: 0.35, drive: 0.55 }
    },
    drums: [
      [2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 0, 0, 0, 0, 0], // D&B 2-Step Kick
      [0, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 2, 0, 0, 0], // Snare on 2 & 4
      [1, 0, 1, 1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 1, 1, 0], // Roller Hats
      [0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0],
      [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1]
    ],
    bass: [
      { note: 36, gate: true,  accent: true,  slide: true  }, // C2 Sub
      { note: 36, gate: true,  accent: false, slide: false },
      { note: 36, gate: false, accent: false, slide: false },
      { note: 36, gate: true,  accent: false, slide: true  },
      { note: 43, gate: true,  accent: true,  slide: false }, // G2
      { note: 43, gate: false, accent: false, slide: false },
      { note: 41, gate: true,  accent: false, slide: true  }, // F2
      { note: 36, gate: true,  accent: false, slide: false },
      { note: 36, gate: true,  accent: true,  slide: false },
      { note: 36, gate: false, accent: false, slide: false },
      { note: 48, gate: true,  accent: true,  slide: true  }, // C3
      { note: 46, gate: true,  accent: false, slide: false }, // Bb2
      { note: 36, gate: true,  accent: false, slide: false },
      { note: 39, gate: true,  accent: false, slide: true  }, // Eb2
      { note: 41, gate: true,  accent: true,  slide: false }, // F2
      { note: 36, gate: true,  accent: false, slide: false }
    ]
  }
];

window.DRUM_FACTORY_KITS = DRUM_FACTORY_KITS;
