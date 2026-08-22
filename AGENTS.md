# 🤖 AGENTS.MD • RETROVOX SUB-1 Developer & Architecture Guide

Welcome to the **RETROVOX SUB-1** codebase. This document serves as the primary technical specification, architecture reference, and maintenance guide for AI agents and human contributors working on this project.

---

## 🏛️ Project Principles

1. **Pure Native Web Standards**:
   - Zero external frontend frameworks (No React, Vue, Angular).
   - Zero external styling libraries (No Tailwind, Bootstrap). Everything is hand-crafted Vanilla CSS with CSS custom properties.
   - Zero bundlers/build steps (No Vite, Webpack, Babel). Pure ES6+ JavaScript running directly in any modern browser.
2. **Deterministic High-Performance Web Audio DSP**:
   - **Zero GC Churn in Audio Loop**: Audio nodes are never allocated or garbage-collected during active playback.
   - **Worker-Isolated Precision Clock**: Scheduling timers for arpeggiator/sequencer operate on background Web Workers.
   - **Click & Clip Elimination**: All parameter updates use exponential or linear ramping with zero-crossing protection. Peak limiter protects the master output bus.
3. **Hardware Analog Aesthetic & Ergonomics**:
   - Visual styling mimics legendary 1980s analog synthesizers (Roland Juno-106, Moog Minimoog, Sequential Prophet-5).
   - Non-blocking mouse/touch and keyboard event separation to allow seamless live playing while tweaking rotary dials and sliders.

---

## 📂 Codebase Architecture & File Mapping

```
websynth/
├── index.html              # HTML5 Studio Desk Layout, Modals & Control Housings
├── package.json            # Versioning (v1.2.0), scripts & metadata
├── README.md               # User & feature documentation
├── AGENTS.md               # Developer & agent architectural guide
├── css/
│   └── style.css           # Analog-hardware styling, CRT shaders & animated monitors
└── js/
    ├── app.js              # Application entry, master power, volume & version manager
    ├── arp-engine.js       # 16-Step Arpeggiator & Web Worker precision clock
    ├── audio-engine.js     # Web Audio API Engine, 12-Voice Pool, VCF, LFO, FX Rack
    ├── presets.js          # Factory Presets library & Patch state serialisation
    └── synth-ui.js         # Rotary knobs, ADSR faders, CRT oscilloscope & MIDI handlers
```

---

## 🎧 Audio Engine Architecture (`js/audio-engine.js`)

### 1. 12-Voice Persistent Polyphonic Pool
- **Structure**: `this.voicePool` contains 12 pre-allocated `Voice` instances initialized on `AudioContext` startup.
- **Voice Nodes**:
  - `osc1` (Dual-VCO with bandlimited periodic wave PWM)
  - `osc2` (Detune, Semitone offset, Hard-Sync)
  - `subOsc` (Sub-octave triangle wave)
  - `noiseGain` (White noise buffer input)
  - `driveShaper` (WaveShaperNode with level-normalized $\tanh$ curve)
  - `vcf1` & `vcf2` (24dB/12dB cascaded Moog ladder filter with Q-staging)
  - `vca` (ADSR amplitude envelope gain stage)
  - `lfoGains` (LFO1/LFO2 modulation routing nodes)
- **Lifecycle & LRU Voice Stealing**:
  - `noteOn(midiNote, velocity)` searches for an inactive voice in `this.voicePool`.
  - If all 12 voices are active, the voice with the oldest `timestamp` is stolen using a 2ms soft crossfade (`setTargetAtTime(0, now, 0.002)`).
  - `noteOff(midiNote)` initiates the asymptotic ADSR release curve and resets the active voice flag when the release completes.

### 2. Normalized Saturation Curve ($\tanh$)
```javascript
makeDistortionCurve(amount) {
  const n_samples = 512;
  const curve = new Float32Array(n_samples);
  if (amount <= 0.001) {
    for (let i = 0; i < n_samples; ++i) curve[i] = (i * 2) / (n_samples - 1) - 1;
    return curve;
  }
  const gain = 1.0 + amount * 4.0;
  const norm = Math.tanh(gain);
  for (let i = 0; i < n_samples; ++i) {
    const x = (i * 2) / (n_samples - 1) - 1;
    curve[i] = Math.tanh(gain * x) / norm;
  }
  return curve;
}
```

### 3. Master FX Rack & Limiter
- **Signal Flow**:
  $$\text{VoiceBus} \longrightarrow \text{Juno BBD Chorus} \longrightarrow \text{Tape Delay (Ping-Pong)} \longrightarrow \text{Studio Reverb} \longrightarrow \text{Peak Limiter} \longrightarrow \text{Master Gain} \longrightarrow \text{Destination}$$
- **Brickwall Peak Limiter**: `DynamicsCompressorNode` configured with threshold `-0.5 dB`, ratio `20:1`, attack `0.002s`, release `0.05s`.

---

## ⏱️ Arpeggiator & Sequencer Engine (`js/arp-engine.js`)

- **Web Worker Precision Clock**:
  - Ticking is offloaded to an inline Web Worker generated via `Blob([workerCode], { type: 'application/javascript' })`.
  - Sends a `tick` message every 20ms to trigger the Lookahead Scheduler on the main thread.
  - Guarantees zero tempo drift during canvas rendering, background tab throttling, or heavy DOM updates.
- **Modes**: `UP`, `DOWN`, `UP_DOWN`, `RANDOM`, `AS_PLAYED`, `PATTERN`.
- **Note Memory**: Manages held notes array, latching mechanism, and gate timing.

---

## 🎨 UI & Event Interaction Rules (`js/synth-ui.js`)

1. **Keyboard vs Mouse Note Separation**:
   - `this.keyboardHeldKeys`: Tracks physical computer keyboard notes.
   - `this.mouseHeldKeys`: Tracks on-screen keybed clicks/touches.
   - `window.addEventListener('mouseup')` **ONLY** releases notes in `this.mouseHeldKeys`, preventing UI tweaking from muting physical keyboard keys.
2. **Keyboard Filter (`isTextInput`)**:
   - Must only block musical hotkeys when `target.tagName === 'TEXTAREA'` or `target.tagName === 'INPUT'` with text types.
   - `<select>`, range sliders, and buttons must never suppress musical keys.
   - Dropdown selections and button clicks must call `.blur()` immediately after interaction.
3. **CRT Visualizer Optimization**:
   - Monitors audio output level via `AnalyserNode`.
   - After 15 silent frames ($< 0.001$ RMS), heavy path computations pause to preserve CPU/GPU battery.

---

## 🚀 Quality & Verification Checklist for Agents

Before committing any modifications:
1. Run syntax verification:
   ```bash
   node -c js/app.js js/audio-engine.js js/arp-engine.js js/presets.js js/synth-ui.js
   ```
2. Check for zero console warnings / uncaught exceptions.
3. Ensure no memory leaks or unmanaged event listeners on `window`.
4. Ensure new parameters have proper defaults in `presets.js` (`SYNTH_INIT_PRESET`).
