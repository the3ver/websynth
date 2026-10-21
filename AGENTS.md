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
├── package.json            # Versioning (v1.8.2), scripts & metadata
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
├── js/                    # Classic scripts, loaded in this order by index.html
│   ├── dom-utils.js        # blurTarget / onRangeInput helpers
│   ├── presets.js          # Factory preset library (SYNTH_FACTORY_PRESETS, SYNTH_INIT_PRESET)
│   ├── arp-engine.js       # 16-Step Arpeggiator & Master-Sync Slave
│   ├── synth-params.js     # Patch parameter table: preset path, setter, knob id (single source of truth)
│   ├── voice.js            # One persistent synth voice: graph, envelopes, LFO routing (LFO_DEPTH)
│   ├── fx-chain.js         # Chorus -> ping-pong delay -> reverb rack
│   ├── audio-engine.js     # AudioContext, voice pool & allocation, LFOs, setters, MIDI, limiter
│   ├── drum-kits.js        # Drum factory kits (patterns + sound params)
│   ├── drum-engine.js      # DSP drum & 303 bass synthesis, Web Worker master clock
│   ├── drum-ui.js          # Drum rack drawer: transport, step matrix, mutes, kits, sync
│   ├── knob-scale.js       # Pure knob math: value <-> ratio, rounding, readout formatting
│   ├── controls.js         # DragController + Knob, Fader, PerformanceWheel
│   ├── virtual-keyboard.js # Keybed rendering, mouse glissando, multi-touch, PC keyboard
│   ├── visualizer.js       # CRT oscilloscope, VU meters, woofers
│   ├── preset-store.js     # User presets in localStorage (DOM-free)
│   ├── preset-panel.js     # Preset LCD, prev/next, save / overwrite / delete dialog
│   ├── synth-ui.js         # Panel composer: knobs/faders/buttons via SynthParams, arp strip, perf bay
│   ├── pwa-manager.js      # PWA lifecycle, install prompts, wake lock & offline state
│   └── app.js              # Application entry, master power, volume & version manager
└── test/
    ├── helpers/
    │   ├── load-browser-script.js  # vm sandbox loader for js/ files (stubbed timers)
    │   ├── fake-audio-context.js   # Web Audio stand-in: nodes record connections, params record events
    │   └── synth-engine.js         # createLiveEngine(): AudioEngine with the full graph on the fake context
    └── *.test.js           # node:test unit tests (npm test)
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
- **Structure**: `this.voicePool` contains 12 pre-allocated `Voice` instances (`js/voice.js`) initialized on `AudioContext` startup. A voice reads the current patch from its engine; `AudioEngine.forEachVoice()` pushes live parameter changes.
- **Voice Nodes**:
  - `osc1` & `osc2` (Dual-VCO with native Sine/Triangle/Sawtooth direct paths and 4x-oversampled WaveShaper audio-rate PWM)
  - `subOsc` (Sub-octave triangle wave)
  - `noiseGain` (White noise buffer input)
  - `driveShaper` (WaveShaperNode with level-normalized $\tanh$ curve)
  - `vcf1` & `vcf2` (24dB/12dB cascaded Moog ladder filter with Q-staging)
  - `vca` (ADSR amplitude envelope gain stage)
  - `lfo[1]` / `lfo[2]` (`{ pitch, vcf, pwm: [vco1, vco2], amp }` routing gains; depth at amount 1.0 = `LFO_DEPTH` in `voice.js`, shared by continuous LFOs and Sample & Hold)
- **Lifecycle & LRU Voice Stealing**:
  - `noteOn(midiNote, velocity)` searches for an inactive voice in `this.voicePool`.
  - If all 12 voices are active, the voice with the oldest `startTime` is stolen using a 2ms soft crossfade (`setTargetAtTime(0, now, 0.002)`).
  - `noteOff(midiNote)` initiates the asymptotic ADSR release curve and resets the active voice flag when the release completes.

### 2. Patch Parameter Table (`js/synth-params.js`)
- `SYNTH_PARAMS` lists every patch parameter once: preset `path`, `set(engine, value)`, optional engine `field` and the knob id (`data-param`).
- `getPresetState()` / `loadPresetState()`, knob dispatch and `SynthUI.syncControls()` all run off this table. A new parameter needs one table row, a default in `SYNTH_INIT_PRESET` and (for a knob) the HTML; `test/synth-params.test.js` fails if table, init preset and knobs drift apart.

### 3. Normalized Saturation Curve ($\tanh$)
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

### 4. Master FX Rack & Limiter (`js/fx-chain.js`)
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

### 4. Keyboard vs Mouse vs Touch Note Separation & Glissando (`js/virtual-keyboard.js`)
- `keyboardHeldKeys`: Tracks physical computer keyboard notes.
- `pointerHeldKeys`: Tracks on-screen keybed mouse clicks and touchpoints (resolved with `document.elementFromPoint(x, y)`).
- A note sounds once even when both sources hold it; it stops only when neither does.
- `window.addEventListener('mouseup')` **ONLY** releases pointer notes, preventing UI parameter tweaking from muting physical keyboard keys.
- Glissando drag handlers release previous keys instantly on pointer boundary crossings.
- `SynthUI.playNote()` / `stopNote()` route notes to the arpeggiator when it is on, otherwise to the voices.

### 4b. Drag Controls (`js/controls.js`)
- Knobs, faders and wheels register with `DragController.bind(el, control)`; only the controller owns window-level move/release listeners (4 in total, not 4 per control).

### 5. Envelope Fader Full-Height Utilization
- `.env-fader-track` and `.fader-track-housing` use dynamic flex-grow (`flex: 1 1 auto; min-height: 120px; max-height: 240px;`) so ADSR sliders match the full height of neighboring LFO / FX racks while respecting max-height constraints on mobile screens.

### 6. Keyboard Filter (`isTextInput`)
- Must only block musical hotkeys when `target.tagName === 'TEXTAREA'` or `target.tagName === 'INPUT'` with text types.
- `<select>`, range sliders, and buttons must never suppress musical keys.
- Dropdown selections and button clicks must call `.blur()` immediately after interaction.

### 7. CRT Visualizer Optimization (`js/visualizer.js`)
- Monitors audio output level via `AnalyserNode`.
- After 15 silent frames ($< 0.001$ RMS), heavy path computations pause to preserve CPU/GPU battery.

---

## 🚀 Quality & Verification Checklist for Agents

Before committing any modifications:
1. Run syntax verification (`node -c` checks only one file per call):
   ```bash
   for f in js/*.js sw.js; do node --check "$f" || echo "FAIL $f"; done
   ```
2. Run the unit tests (Node built-in test runner, no dependencies). All must pass before every push:
   ```bash
   npm test
   ```
   Tests live in `test/*.test.js`. `test/helpers/load-browser-script.js` loads the `js/` files into a `vm` sandbox that doubles as `window`, so classes like `AudioEngine` and `ArpEngine` are testable without a browser. `createLiveEngine()` (`test/helpers/synth-engine.js`) builds the full audio graph on `FakeAudioContext`, so voice envelopes, LFO routing and FX can be asserted on recorded AudioParam events. DOM-heavy UI (keybed, knobs, panel wiring) is not unit tested: check it in the browser. New features and bug fixes need a test here.
3. Run automated headless visual screenshot suite:
   ```bash
   node scripts/capture-screenshots.js
   ```
   Inspect generated screenshots in `screenshots/`:
   - `screenshot-desktop.png` (1440x920)
   - `screenshot-ipad.png` (1024x768)
   - `screenshot-mobile.png` (750x1334)
   - `screenshot-phone-portrait.png` (360x780)
   - `screenshot-phone-landscape.png` (844x390)
4. Check for zero console warnings / uncaught exceptions.
5. Ensure no memory leaks or unmanaged event listeners on `window`.
6. Ensure new parameters have a row in `synth-params.js` and proper defaults in `presets.js` (`SYNTH_INIT_PRESET`).
7. A new script in `js/` needs a `<script>` tag in `index.html` (dependency order) and an entry in `PRECACHE_ASSETS` in `sw.js`.
