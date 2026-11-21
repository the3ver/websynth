# UI reference: layout, responsive modes, input

Reached from AGENTS.md. Audio and synth architecture: [architecture.md](architecture.md).

## 1. Mobile Portrait Carousel Architecture (`@media (max-width: 900px) and (orientation: portrait)`)
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

## 2. Desktop Seamless Grid Inheritance (`display: contents;`)
- On Desktop (`min-width: 900px`), `.module-slide` applies `display: contents;`.
- All 6 module bays seamlessly inherit the parent 6-column desktop grid (`1.55fr 0.95fr 1.3fr 1.15fr 0.95fr 0.95fr`; a column never gets narrower than its content, e.g. the FX tab labels, so keep labels short) with zero layout shift, zero DOM restructuring, and zero CSS wrapper overhead.

## 3. Mobile Landscape Split-Studio Mode (`@media (orientation: landscape) and (max-height: 600px)`)
- Splits the chassis into a 2-column layout (`grid-template-columns: 46% 54%`):
  - **Left 46%**: Top panel, Preset LCD, and horizontal module carousel.
  - **Right 54%**: 16-Step Arpeggiator Sequencer + Full playable 3D keybed.
- Studio speakers and wooden side cheeks are hidden (`display: none !important;`) to maximize touch area.

## 4. Keyboard vs Mouse vs Touch Note Separation & Glissando (`js/virtual-keyboard.js`)
- `keyboardHeldKeys`: Tracks physical computer keyboard notes.
- `pointerHeldKeys`: Tracks on-screen keybed mouse clicks and touchpoints (resolved with `document.elementFromPoint(x, y)`).
- A note sounds once even when both sources hold it; it stops only when neither does.
- `window.addEventListener('mouseup')` **ONLY** releases pointer notes, preventing UI parameter tweaking from muting physical keyboard keys.
- Glissando drag handlers release previous keys instantly on pointer boundary crossings.
- `NoteRouter` (`js/note-router.js`, used by `SynthUI.playNote()` / `stopNote()` and, via `engine.midiNotes`, by MIDI input) routes notes to the arpeggiator when it is on, otherwise to the voices. `ArpEngine` tracks held and latched keys in both cases, so HOLD also works with the arp off: the router sounds held + latched notes and releases what leaves that set; `VirtualKeyboard.setLatched()` lights the latched keys (`.latched`).

## 4b. Drag Controls (`js/controls.js`)
- Knobs, faders and wheels register with `DragController.bind(el, control)`; only the controller owns window-level move/release listeners (5 in total, not 5 per control). A touch drag follows the finger that started it (`touchId`, from `changedTouches`): fingers holding keys neither steer it nor end it on release, mouse events steer only mouse drags, and touching a second control ends the first drag (its `dragEnd` runs). The keybed in turn ignores touches that did not start on it. Buttons need no own handling: `DomUtils.installMultiTouchTaps()` (called once from `app.js`) turns a tap on a `<button>` or `<label>` (GLIDE toggle) that shared the screen with another finger into a `click()`, because browsers fire no click inside a multi-touch gesture; it cancels the browser's click for that touch so toggles flip once. `<select>` fields cannot be opened from script and stay without this.

## 5. Envelope Fader Full-Height Utilization
- `.env-fader-track` and `.fader-track-housing` use dynamic flex-grow (`flex: 1 1 auto; min-height: 120px; max-height: 240px;`) so ADSR sliders match the full height of neighboring LFO / FX racks while respecting max-height constraints on mobile screens.

## 6. Keyboard Filter (`isTextInput`)
- Must only block musical hotkeys when `target.tagName === 'TEXTAREA'` or `target.tagName === 'INPUT'` with text types.
- `<select>`, range sliders, and buttons must never suppress musical keys.
- Dropdown selections and button clicks must call `.blur()` immediately after interaction.

## 7. CRT Visualizer Optimization (`js/visualizer.js`)
- Monitors audio output level via `AnalyserNode`.
- After 15 silent frames ($< 0.001$ RMS), heavy path computations pause to preserve CPU/GPU battery.
