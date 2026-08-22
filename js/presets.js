/**
 * RETROVOX SUB-1 • FACTORY PRESET LIBRARY
 * 10 Curated Analog Synthesizer Classics (Vangelis Blade Runner, Moog Minimoog Bass,
 * Juno-106 Synthwave Pluck, TB-303 Acid Reso, Oberheim Jump Brass, Sci-Fi S&H, etc.)
 */

const FACTORY_PRESETS = [
  {
    id: 'blade-runner-brass',
    name: '01 // BLADE RUNNER BRASS',
    category: 'BRASS',
    description: 'Vangelis CS-80 style cinematic brass with sweeping filter, Juno chorus & epic space reverb.',
    state: {
      vco1: { wave: 'sawtooth', octave: 0, pulseWidth: 0.5 },
      vco2: { wave: 'sawtooth', octave: 0, semitone: 0, detuneCents: 12, hardSync: false },
      mixer: { vco1Level: 0.85, vco2Level: 0.85, subLevel: 0.2, subOctave: -1, noiseLevel: 0.0 },
      vcf: { cutoff: 1400, resonance: 4.2, type: 'lowpass24', drive: 0.2, keyTrack: 0.6, envMod: 0.65 },
      filterEnv: { attack: 0.18, decay: 0.6, sustain: 0.45, release: 1.2 },
      ampEnv: { attack: 0.08, decay: 0.4, sustain: 0.9, release: 1.5 },
      lfo1: { wave: 'triangle', rate: 1.5, fadeIn: 0.0, destinations: { pitch: 0.0, vcf: 0.0, pwm: 0.0, amp: 0.0 } },
      lfo2: { wave: 'sine', rate: 5.5, fadeIn: 1.2, destinations: { pitch: 0.25, vcf: 0.15, pwm: 0.0, amp: 0.0 } },
      fx: {
        chorus: { mode: 'I', mix: 0.7 },
        delay: { time: 0.38, feedback: 0.5, mix: 0.4 },
        reverb: { decay: 4.8, mix: 0.55 }
      },
      performance: { glide: false, octaveShift: 0 }
    }
  },
  {
    id: 'minimoog-fat-bass',
    name: '02 // MOOG MINIMOOG BASS',
    category: 'BASS',
    description: 'Fat, punchy Moog ladder bass with 24dB saturation, sub-octave, and snappy envelope.',
    state: {
      vco1: { wave: 'sawtooth', octave: -1, pulseWidth: 0.5 },
      vco2: { wave: 'square', octave: -1, semitone: 0, detuneCents: 6, hardSync: false },
      mixer: { vco1Level: 0.9, vco2Level: 0.7, subLevel: 0.6, subOctave: -1, noiseLevel: 0.0 },
      vcf: { cutoff: 450, resonance: 7.5, type: 'lowpass24', drive: 0.45, keyTrack: 0.4, envMod: 0.85 },
      filterEnv: { attack: 0.001, decay: 0.22, sustain: 0.0, release: 0.12 },
      ampEnv: { attack: 0.001, decay: 0.28, sustain: 0.0, release: 0.12 },
      lfo1: { wave: 'triangle', rate: 2.0, fadeIn: 0.0, destinations: { pitch: 0.0, vcf: 0.0, pwm: 0.0, amp: 0.0 } },
      lfo2: { wave: 'sine', rate: 4.0, fadeIn: 0.0, destinations: { pitch: 0.0, vcf: 0.0, pwm: 0.0, amp: 0.0 } },
      fx: {
        chorus: { mode: 'off', mix: 0.0 },
        delay: { time: 0.2, feedback: 0.0, mix: 0.0 },
        reverb: { decay: 1.0, mix: 0.05 }
      },
      performance: { glide: false, octaveShift: -1 }
    }
  },
  {
    id: 'juno-synthwave-pluck',
    name: '03 // JUNO-106 SYNTHWAVE PLUCK',
    category: 'PLUCK',
    description: 'Iconic 80s Roland Juno-106 plucky arpeggiator sound with PWM, BBD Chorus II and tape echo.',
    state: {
      vco1: { wave: 'square', octave: 0, pulseWidth: 0.65 },
      vco2: { wave: 'sawtooth', octave: 0, semitone: 0, detuneCents: 4, hardSync: false },
      mixer: { vco1Level: 0.85, vco2Level: 0.6, subLevel: 0.35, subOctave: -1, noiseLevel: 0.0 },
      vcf: { cutoff: 650, resonance: 4.5, type: 'lowpass24', drive: 0.1, keyTrack: 0.75, envMod: 0.75 },
      filterEnv: { attack: 0.001, decay: 0.24, sustain: 0.0, release: 0.18 },
      ampEnv: { attack: 0.001, decay: 0.26, sustain: 0.0, release: 0.18 },
      lfo1: { wave: 'triangle', rate: 1.2, fadeIn: 0.0, destinations: { pitch: 0.0, vcf: 0.0, pwm: 0.45, amp: 0.0 } },
      lfo2: { wave: 'sine', rate: 5.0, fadeIn: 0.0, destinations: { pitch: 0.0, vcf: 0.0, pwm: 0.0, amp: 0.0 } },
      fx: {
        chorus: { mode: 'II', mix: 0.8 },
        delay: { time: 0.26, feedback: 0.4, mix: 0.35 },
        reverb: { decay: 2.2, mix: 0.3 }
      },
      performance: { glide: false, octaveShift: 0 }
    }
  },
  {
    id: 'tb303-acid-reso',
    name: '04 // TB-303 ACID RESO LEAD',
    category: 'LEAD',
    description: 'High-resonance screaming acid line with 12dB filter overdrive and punchy envelope bite.',
    state: {
      vco1: { wave: 'sawtooth', octave: -1, pulseWidth: 0.5 },
      vco2: { wave: 'square', octave: -1, semitone: 0, detuneCents: 0, hardSync: false },
      mixer: { vco1Level: 0.95, vco2Level: 0.0, subLevel: 0.3, subOctave: -1, noiseLevel: 0.0 },
      vcf: { cutoff: 350, resonance: 16.0, type: 'lowpass24', drive: 0.6, keyTrack: 0.65, envMod: 0.9 },
      filterEnv: { attack: 0.001, decay: 0.28, sustain: 0.05, release: 0.1 },
      ampEnv: { attack: 0.001, decay: 0.35, sustain: 0.2, release: 0.1 },
      lfo1: { wave: 'sawtooth', rate: 0.4, fadeIn: 0.0, destinations: { pitch: 0.0, vcf: 0.3, pwm: 0.0, amp: 0.0 } },
      lfo2: { wave: 'sine', rate: 4.0, fadeIn: 0.0, destinations: { pitch: 0.0, vcf: 0.0, pwm: 0.0, amp: 0.0 } },
      fx: {
        chorus: { mode: 'off', mix: 0.0 },
        delay: { time: 0.28, feedback: 0.45, mix: 0.3 },
        reverb: { decay: 1.8, mix: 0.2 }
      },
      performance: { glide: true, octaveShift: -1 }
    }
  },
  {
    id: 'oberheim-jump-brass',
    name: '05 // OBERHEIM JUMP BRASS',
    category: 'BRASS',
    description: 'Classic 1984 Van Halen style Oberheim OB-Xa polyphonic brass punch.',
    state: {
      vco1: { wave: 'sawtooth', octave: 0, pulseWidth: 0.5 },
      vco2: { wave: 'sawtooth', octave: 0, semitone: 0, detuneCents: 15, hardSync: false },
      mixer: { vco1Level: 0.85, vco2Level: 0.85, subLevel: 0.1, subOctave: -1, noiseLevel: 0.0 },
      vcf: { cutoff: 1100, resonance: 2.8, type: 'lowpass12', drive: 0.2, keyTrack: 0.6, envMod: 0.75 },
      filterEnv: { attack: 0.015, decay: 0.4, sustain: 0.2, release: 0.25 },
      ampEnv: { attack: 0.005, decay: 0.4, sustain: 0.7, release: 0.35 },
      lfo1: { wave: 'triangle', rate: 2.0, fadeIn: 0.0, destinations: { pitch: 0.0, vcf: 0.0, pwm: 0.0, amp: 0.0 } },
      lfo2: { wave: 'sine', rate: 5.5, fadeIn: 0.8, destinations: { pitch: 0.15, vcf: 0.0, pwm: 0.0, amp: 0.0 } },
      fx: {
        chorus: { mode: 'I', mix: 0.6 },
        delay: { time: 0.32, feedback: 0.2, mix: 0.15 },
        reverb: { decay: 2.8, mix: 0.35 }
      },
      performance: { glide: false, octaveShift: 0 }
    }
  },
  {
    id: 'sci-fi-sample-hold',
    name: '06 // SCI-FI SAMPLE & HOLD ARP',
    category: 'FX',
    description: '70s modular laboratory computer with random stepped filter voltages and tape echo.',
    state: {
      vco1: { wave: 'square', octave: 0, pulseWidth: 0.5 },
      vco2: { wave: 'sawtooth', octave: 1, semitone: 7, detuneCents: 8, hardSync: false },
      mixer: { vco1Level: 0.7, vco2Level: 0.5, subLevel: 0.2, subOctave: -1, noiseLevel: 0.25 },
      vcf: { cutoff: 650, resonance: 14.0, type: 'lowpass24', drive: 0.25, keyTrack: 0.5, envMod: 0.4 },
      filterEnv: { attack: 0.001, decay: 0.3, sustain: 0.3, release: 0.3 },
      ampEnv: { attack: 0.005, decay: 0.4, sustain: 0.8, release: 0.5 },
      lfo1: { wave: 'samplehold', rate: 8.0, fadeIn: 0.0, destinations: { pitch: 0.0, vcf: 0.85, pwm: 0.0, amp: 0.0 } },
      lfo2: { wave: 'triangle', rate: 0.2, fadeIn: 0.0, destinations: { pitch: 0.0, vcf: 0.2, pwm: 0.0, amp: 0.0 } },
      fx: {
        chorus: { mode: 'off', mix: 0.0 },
        delay: { time: 0.34, feedback: 0.55, mix: 0.45 },
        reverb: { decay: 3.5, mix: 0.4 }
      },
      performance: { glide: false, octaveShift: 0 }
    }
  },
  {
    id: 'ambient-shimmer-pad',
    name: '07 // AMBIENT SHIMMER PAD',
    category: 'PAD',
    description: 'Lush slowly evolving cosmic pad with double chorus, warm tape delays and infinite reverb.',
    state: {
      vco1: { wave: 'triangle', octave: 0, pulseWidth: 0.5 },
      vco2: { wave: 'sine', octave: 0, semitone: 12, detuneCents: 9, hardSync: false },
      mixer: { vco1Level: 0.8, vco2Level: 0.65, subLevel: 0.4, subOctave: -1, noiseLevel: 0.02 },
      vcf: { cutoff: 1200, resonance: 3.0, type: 'lowpass24', drive: 0.05, keyTrack: 0.7, envMod: 0.45 },
      filterEnv: { attack: 1.8, decay: 1.5, sustain: 0.65, release: 3.0 },
      ampEnv: { attack: 1.4, decay: 1.0, sustain: 0.85, release: 3.5 },
      lfo1: { wave: 'triangle', rate: 0.35, fadeIn: 0.0, destinations: { pitch: 0.05, vcf: 0.35, pwm: 0.0, amp: 0.0 } },
      lfo2: { wave: 'sine', rate: 1.2, fadeIn: 0.0, destinations: { pitch: 0.0, vcf: 0.15, pwm: 0.0, amp: 0.15 } },
      fx: {
        chorus: { mode: 'I+II', mix: 0.75 },
        delay: { time: 0.48, feedback: 0.55, mix: 0.45 },
        reverb: { decay: 6.5, mix: 0.65 }
      },
      performance: { glide: false, octaveShift: 0 }
    }
  },
  {
    id: 'funk-clavinet-lead',
    name: '08 // FUNK CLAVINET / LEAD',
    category: 'LEAD',
    description: 'Snappy Stevie Wonder style Funk Clavinet with narrow pulse wave and bandpass bite.',
    state: {
      vco1: { wave: 'square', octave: 0, pulseWidth: 0.2 },
      vco2: { wave: 'square', octave: 0, semitone: 0, detuneCents: 4, hardSync: false },
      mixer: { vco1Level: 0.9, vco2Level: 0.6, subLevel: 0.0, subOctave: -1, noiseLevel: 0.0 },
      vcf: { cutoff: 800, resonance: 6.5, type: 'bandpass', drive: 0.35, keyTrack: 0.9, envMod: 0.8 },
      filterEnv: { attack: 0.001, decay: 0.18, sustain: 0.05, release: 0.08 },
      ampEnv: { attack: 0.001, decay: 0.25, sustain: 0.15, release: 0.08 },
      lfo1: { wave: 'triangle', rate: 4.0, fadeIn: 0.0, destinations: { pitch: 0.0, vcf: 0.0, pwm: 0.0, amp: 0.0 } },
      lfo2: { wave: 'sine', rate: 6.0, fadeIn: 0.5, destinations: { pitch: 0.2, vcf: 0.0, pwm: 0.0, amp: 0.0 } },
      fx: {
        chorus: { mode: 'I', mix: 0.35 },
        delay: { time: 0.18, feedback: 0.2, mix: 0.15 },
        reverb: { decay: 1.2, mix: 0.15 }
      },
      performance: { glide: false, octaveShift: 0 }
    }
  },
  {
    id: '80s-analog-strings',
    name: '09 // 80s ANALOG STRINGS',
    category: 'PAD',
    description: 'Solina / VP-330 style ensemble string machine with rich PWM and BBD stereo swirl.',
    state: {
      vco1: { wave: 'sawtooth', octave: 0, pulseWidth: 0.5 },
      vco2: { wave: 'sawtooth', octave: 0, semitone: 0, detuneCents: 14, hardSync: false },
      mixer: { vco1Level: 0.8, vco2Level: 0.8, subLevel: 0.25, subOctave: -1, noiseLevel: 0.0 },
      vcf: { cutoff: 2200, resonance: 2.2, type: 'lowpass24', drive: 0.1, keyTrack: 0.65, envMod: 0.4 },
      filterEnv: { attack: 0.45, decay: 0.8, sustain: 0.7, release: 1.2 },
      ampEnv: { attack: 0.35, decay: 0.6, sustain: 0.85, release: 1.5 },
      lfo1: { wave: 'triangle', rate: 0.8, fadeIn: 0.0, destinations: { pitch: 0.0, vcf: 0.0, pwm: 0.65, amp: 0.0 } },
      lfo2: { wave: 'sine', rate: 5.0, fadeIn: 1.5, destinations: { pitch: 0.18, vcf: 0.0, pwm: 0.0, amp: 0.0 } },
      fx: {
        chorus: { mode: 'I', mix: 0.85 },
        delay: { time: 0.36, feedback: 0.3, mix: 0.25 },
        reverb: { decay: 3.8, mix: 0.45 }
      },
      performance: { glide: false, octaveShift: 0 }
    }
  },
  {
    id: 'theremin-sine-solo',
    name: '10 // THEREMIN SINE SOLO',
    category: 'SOLO',
    description: 'Ethereal continuous Portamento Theremin with pure sine tone and lush echo chamber.',
    state: {
      vco1: { wave: 'sine', octave: 1, pulseWidth: 0.5 },
      vco2: { wave: 'triangle', octave: 1, semitone: 0, detuneCents: 0, hardSync: false },
      mixer: { vco1Level: 0.9, vco2Level: 0.3, subLevel: 0.0, subOctave: -1, noiseLevel: 0.0 },
      vcf: { cutoff: 3500, resonance: 8.0, type: 'lowpass24', drive: 0.0, keyTrack: 1.0, envMod: 0.0 },
      filterEnv: { attack: 0.05, decay: 0.2, sustain: 1.0, release: 0.5 },
      ampEnv: { attack: 0.08, decay: 0.2, sustain: 0.95, release: 0.6 },
      lfo1: { wave: 'sine', rate: 5.8, fadeIn: 0.3, destinations: { pitch: 0.22, vcf: 0.0, pwm: 0.0, amp: 0.1 } },
      lfo2: { wave: 'triangle', rate: 2.0, fadeIn: 0.0, destinations: { pitch: 0.0, vcf: 0.0, pwm: 0.0, amp: 0.0 } },
      fx: {
        chorus: { mode: 'I', mix: 0.4 },
        delay: { time: 0.42, feedback: 0.5, mix: 0.4 },
        reverb: { decay: 4.2, mix: 0.5 }
      },
      performance: { glide: true, octaveShift: 1 }
    }
  }
];

// Default Neutral Initial Patch
const INIT_PRESET = {
  id: 'init-patch',
  name: 'INIT // DEFAULT PATCH',
  category: 'INIT',
  description: 'Clean basic starting patch with single Sawtooth oscillator.',
  state: {
    vco1: { wave: 'sawtooth', octave: 0, pulseWidth: 0.5 },
    vco2: { wave: 'square', octave: 0, semitone: 0, detuneCents: 0, hardSync: false },
    mixer: { vco1Level: 0.8, vco2Level: 0.0, subLevel: 0.0, subOctave: -1, noiseLevel: 0.0 },
    vcf: { cutoff: 4000, resonance: 1.5, type: 'lowpass24', drive: 0.0, keyTrack: 0.5, envMod: 0.4 },
    filterEnv: { attack: 0.005, decay: 0.4, sustain: 0.5, release: 0.3 },
    ampEnv: { attack: 0.003, decay: 0.3, sustain: 0.8, release: 0.3 },
    lfo1: { wave: 'triangle', rate: 2.5, fadeIn: 0.0, destinations: { pitch: 0.0, vcf: 0.0, pwm: 0.0, amp: 0.0 } },
    lfo2: { wave: 'sine', rate: 5.0, fadeIn: 0.0, destinations: { pitch: 0.0, vcf: 0.0, pwm: 0.0, amp: 0.0 } },
    fx: {
      chorus: { mode: 'off', mix: 0.65 },
      delay: { time: 0.32, feedback: 0.45, mix: 0.0 },
      reverb: { decay: 3.2, mix: 0.0 }
    },
    performance: { glide: false, octaveShift: 0 }
  }
};

window.SYNTH_FACTORY_PRESETS = FACTORY_PRESETS;
window.SYNTH_INIT_PRESET = INIT_PRESET;
