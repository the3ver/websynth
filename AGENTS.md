# 🤖 AGENTS.MD • RETROVOX SUB-1 & RETROBEAT D-909 Developer Guide

Welcome to the **RETROVOX SUB-1** and **RETROBEAT D-909** codebase. This document serves as the primary technical specification, architecture reference, and maintenance guide for AI agents and human contributors working on this project.

---

## 🏛️ Project Principles

1. **Pure Native Web Standards**:
   - Zero external frontend frameworks (No React, Vue, Angular).
   - Zero external styling libraries (No Tailwind, Bootstrap). Everything is hand-crafted Vanilla CSS with CSS custom properties.
   - Zero bundlers/build steps (No Vite, Webpack, Babel). Pure ES6+ JavaScript running directly in any modern browser.
2. **Deterministic High-Performance Web Audio DSP**:
   - **Zero GC Churn in Audio Loop**: Audio nodes are never allocated or garbage-collected during active synthesizer voice playback.
   - **Worker-Isolated Precision Master Clock**: Scheduling timers for Drum Machine and Arpeggiator operate on background Web Workers.
   - **Click & Clip Elimination**: All parameter updates use exponential or linear ramping with zero-crossing protection. Peak limiter protects the master output bus.
3. **Hardware Analog Aesthetic & Ergonomics**:
   - Visual styling mimics legendary 1980s analog synthesizers (Roland Juno-106, Moog Minimoog, Sequential Prophet-5, Roland TR-909, TB-303).
   - Non-blocking mouse/touch and keyboard event separation to allow seamless live playing while tweaking rotary dials and sliders.

---

## 📂 Codebase Architecture & File Mapping

```
websynth/
├── index.html              # HTML5 Studio Desk Layout, Modals & Control Housings
├── manifest.webmanifest    # W3C Web App Manifest (PWA Standalone Configuration)
├── sw.js                   # Service Worker (App Shell & Google WebFonts Offline Cache)
├── package.json            # Versioning (v1.8.0), scripts & metadata
├── README.md               # User & feature documentation
├── AGENTS.md               # Developer & agent architectural guide
├── icons/                  # Retina & Maskable App Icons (SVG + PNG)
│   ├── icon.svg
│   ├── icon-192.png
│   ├── icon-512.png
│   ├── icon-maskable-192.png
│   ├── icon-maskable-512.png
│   └── apple-touch-icon.png
├── css/
│   └── style.css           # Analog-hardware styling, CRT shaders, monitors, PWA & drum rack
└── js/
    ├── app.js              # Application entry, master power, volume & version manager
    ├── pwa-manager.js      # PWA lifecycle, install prompts, wake lock & offline state
    ├── arp-engine.js       # 16-Step Arpeggiator & Master-Sync Slave
    ├── audio-engine.js     # Web Audio API Engine, 12-Voice Pool, VCF, LFO, FX Rack
    ├── drum-engine.js      # DSP Drum & 303 Bass Synthesis, Web Worker Master Clock
    ├── drum-ui.js          # Drum Machine Drawer UI, Step Matrix, Kits & Mutes
    ├── presets.js          # Factory Presets library & Patch state serialisation
    └── synth-ui.js         # Rotary knobs, ADSR faders, CRT oscilloscope & MIDI handlers
```

---

## 🥁 Drum & Bass Machine Architecture (`js/drum-engine.js`)

### 1. Pure DSP Synthesized Voices (Zero External Samples)
- **Kick (BD)**: Sub-sine drop ($160\,\text{Hz} \to 38\,\text{Hz}$) + transient pop click + level-normalized $\tanh$ overdrive.
- **Snare (SD)**: Dual body resonators ($185\,\text{Hz}$ and $330\,\text{Hz}$) + high-pass filtered white noise burst.
- **Hi-Hats (CH / OH)**: 6 inharmonic square waves through high-pass filter. Closed Hat chokes active Open Hat voice instantly.
- **Clap (CP)**: 3 successive noise impulse bursts ($11\,\text{ms}$ spacing) + decaying reverb tail.
- **303 Acid Bassline**: Monophonic VCO (Sawtooth/Square) through 24dB resonant lowpass filter with exponential decay, accent boost, and slide portamento (`setTargetAtTime`).

### 2. Master Clock & Slave Synchronization
- Drum Engine hosts the master Web Worker clock ticking every 20ms.
- Registered slave engines (like `ArpEngine`) receive `handleExternalClockTick(stepIndex, time, beatSec)` and `handleExternalTransport(isPlaying)` for 100% phase-locked tempo sync with zero drift.

---

## 🎧 Synthesizer Audio Engine Architecture (`js/audio-engine.js`)

### 1. 12-Voice Persistent Polyphonic Pool
- **Structure**: `this.voicePool` contains 12 pre-allocated `Voice` instances initialized on `AudioContext` startup.
- **Voice Nodes**:
  - `osc1` & `osc2` (Dual-VCO with native Sine/Triangle/Sawtooth direct paths and 4x-oversampled WaveShaper audio-rate PWM)
  - `subOsc` (Sub-octave triangle wave)
  - `noiseGain` (White noise buffer input)
  - `driveShaper` (WaveShaperNode with level-normalized $\tanh$ curve)
  - `vcf1` & `vcf2` (24dB/12dB cascaded Moog ladder filter with Q-staging)
  - `vca` (ADSR amplitude envelope gain stage)
  - `lfoGains` (LFO1/LFO2 modulation routing nodes for Pitch, VCF, PWM, and Amp)
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
  $$\text{VoiceBus} \longrightarrow \text{Juno BBD Chorus} \longrightarrow \text{Tape Delay (Ping-Pong)} \longrightarrow \text{Studio Reverb} \longrightarrow \text{Master Analyser} \longrightarrow \text{Peak Limiter} \longrightarrow \text{Master Gain} \longrightarrow \text{Destination}$$
- **Brickwall Peak Limiter**: `DynamicsCompressorNode` configured with threshold `-0.5 dB`, ratio `20:1`, attack `0.002s`, release `0.05s`.

---

## 🎨 UI, Mobile Ergonomics & Responsive Architecture (`js/synth-ui.js` & `css/style.css`)

### 1. Mobile Portrait Carousel Architecture (`@media (max-width: 900px) and (orientation: portrait)`)
- **100% Viewport-Locked (`100dvh`, `overflow: hidden`)**: Prevents vertical pull-to-refresh, page reload bounces, and window-level scroll displacement during performance.
- **Fixed Top Panel**: Master-Toolbar (Power, Volume, Drum Rack toggle, Hard-Reload), Hardware Preset LCD Manager (`◀ / ▶`), and 3 Module Selector Tabs (`[ 🎛️ OSC & MIX ]`, `[ 🔊 VCF & LFO ]`, `[ ⚡ ENV & FX ]`).
- **Middle Horizontal Carousel (`.modular-control-surface`)**:
  - Contains 3 `.module-slide` containers:
    - **Slide 1**: `01 // DUAL-VCO OSCILLATORS` + `02 // MIXER & NOISE`
    - **Slide 2**: `03 // 24dB LADDER FILTER (VCF)` + `04 // DUAL LFO & MOD`
    - **Slide 3**: `05 // DUAL ADSR ENVELOPES` + `06 // VINTAGE STEREO FX`
  - Utilizes native `scroll-snap-type: x mandatory` and `scroll-behavior: smooth` with 60/120fps GPU hardware acceleration.
- **Fixed Bottom Panel**: 16-Step Arpeggiator & Sequencer Strip + Performance Bay (Pitch/Mod Wheels, Octave `[-1, 0, +1]`, Glide Switch) + Playable 3D Piano Keyboard.
- **Bi-directional Tab & Carousel Sync**:
  - Tab button click calls `modularSurface.scrollTo({ left: targetSlide.offsetLeft, behavior: 'smooth' })`.
  - Carousel swipe listener evaluates `Math.round(modularSurface.scrollLeft / slideWidth)` in a `requestAnimationFrame` loop and toggles `.mobile-tab-btn.active`.

### 2. Desktop Seamless Grid Inheritance (`display: contents;`)
- On Desktop (`min-width: 900px`), `.module-slide` applies `display: contents;`.
- All 6 module bays seamlessly inherit the parent 6-column desktop grid (`1.55fr 0.95fr 1.15fr 1.15fr 0.95fr 1.1fr`) with zero layout shift, zero DOM restructuring, and zero CSS wrapper overhead.

### 3. Mobile Landscape Split-Studio Mode (`@media (orientation: landscape) and (max-height: 600px)`)
- Splits the chassis into a 2-column layout (`grid-template-columns: 46% 54%`):
  - **Left 46%**: Top panel, Preset LCD, and horizontal module carousel.
  - **Right 54%**: 16-Step Arpeggiator Sequencer + Full playable 3D keybed.
- Studio speakers and wooden side cheeks are hidden (`display: none !important;`) to maximize touch area.

### 4. Keyboard vs Mouse vs Touch Note Separation & Glissando
- `this.keyboardHeldKeys`: Tracks physical computer keyboard notes.
- `this.mouseHeldKeys`: Tracks on-screen keybed mouse clicks.
- `this.touchHeldKeys`: Tracks multi-touch touchpoints using `document.elementFromPoint(x, y)`.
- `window.addEventListener('mouseup')` **ONLY** releases notes in `this.mouseHeldKeys`, preventing UI parameter tweaking from muting physical keyboard keys.
- Glissando drag handlers release previous keys instantly on pointer boundary crossings.

### 5. Envelope Fader Full-Height Utilization
- `.env-fader-track` and `.fader-track-housing` use dynamic flex-grow (`flex: 1 1 auto; min-height: 120px; max-height: 240px;`) so ADSR sliders match the full height of neighboring LFO / FX racks while respecting max-height constraints on mobile screens.

### 6. Keyboard Filter (`isTextInput`)
- Must only block musical hotkeys when `target.tagName === 'TEXTAREA'` or `target.tagName === 'INPUT'` with text types.
- `<select>`, range sliders, and buttons must never suppress musical keys.
- Dropdown selections and button clicks must call `.blur()` immediately after interaction.

### 7. CRT Visualizer Optimization
- Monitors audio output level via `AnalyserNode`.
- After 15 silent frames ($< 0.001$ RMS), heavy path computations pause to preserve CPU/GPU battery.

---

## 🚀 Quality & Verification Checklist for Agents

Before committing any modifications:
1. Run syntax verification:
   ```bash
   node -c js/app.js js/pwa-manager.js js/audio-engine.js js/arp-engine.js js/presets.js js/synth-ui.js js/drum-engine.js js/drum-ui.js sw.js
   ```
2. Run automated headless visual screenshot suite:
   ```bash
   node scripts/capture-screenshots.js
   ```
   Inspect generated screenshots in `screenshots/`:
   - `screenshot-desktop.png` (1440x920)
   - `screenshot-ipad.png` (1024x768)
   - `screenshot-mobile.png` (750x1334)
   - `screenshot-phone-portrait.png` (360x780)
   - `screenshot-phone-landscape.png` (844x390)
3. Check for zero console warnings / uncaught exceptions.
4. Ensure no memory leaks or unmanaged event listeners on `window`.
5. Ensure new parameters have proper defaults in `presets.js` (`SYNTH_INIT_PRESET`).
