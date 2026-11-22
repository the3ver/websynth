# Architecture reference: audio, synths, drums

Reached from AGENTS.md. UI, layout and input handling: [ui.md](ui.md).

## File map

```
websynth/
├── index.html              # HTML5 Studio Desk Layout, Modals & Control Housings
├── manifest.webmanifest    # W3C Web App Manifest (PWA Standalone Configuration)
├── sw.js                   # Service Worker (App Shell & Google WebFonts Offline Cache)
├── package.json            # Version source, npm scripts (check, layout, bump, capture-screenshots)
├── README.md               # User & feature documentation
├── AGENTS.md               # Agent entry: principles, workflow, pointers into docs/
├── docs/                   # architecture.md (audio, synths, drums), ui.md (layout, input)
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
│   ├── lib/                # Synth building blocks, namespace window.SynthBlocks, no engine references
│   │   ├── curves.js       # Pure curves & buffers: driveCurve, tanhCurve, pwmComparatorCurve, safetyClipCurve, whiteNoiseBuffer
│   │   ├── effects.js      # Crusher (dry/wet around the bitcrusher worklet), Chorus (BBD), Delay (ping-pong, high-cut feedback, free time or note value at a clock tempo, `Delay.noteSeconds`, `DIVISIONS`, `MAX_TIME` 4 s), Reverb (noise IR): input/output, apply*()
│   │   ├── envelope.js     # Envelope: ADSR scheduled on any AudioParams (owns no nodes), holdParam
│   │   ├── filter.js       # Filter: two cascaded biquads, modes lowpass24/lowpass12/bandpass/highpass
│   │   ├── gain-stages.js  # Mixer (named level channels), Drive (tanh shaper), Vca (envelope gain + tremolo, choke)
│   │   ├── lfo.js          # Lfo: oscillator + Sample & Hold constant source, own S&H clock
│   │   ├── master-bus.js   # MasterBus: analyser -> volume -> limiter -> safety clipper -> destination
│   │   ├── mod-matrix.js   # ModMatrix: named sources -> named targets, one gain per slot, empty slots unplugged; SLOTS
│   │   ├── note-mod-sources.js # NoteModSources: filterEnv/ampEnv/velocity/key/random of a note as unstarted ConstantSources
│   │   ├── param-table.js  # ParamTable: per-synth patch parameter table (preset path, setter, knob), envParams, fxParams (shared FX rack rows)
│   │   ├── vco.js          # Vco: direct path + PWM comparator path, unplugs the shaper while unused
│   │   └── voice-pool.js   # VoicePool: retrigger -> free -> oldest releasing -> steal oldest (choke)
│   ├── dom-utils.js        # blurTarget / onRangeInput helpers
│   ├── presets.js          # Factory preset library (SYNTH_FACTORY_PRESETS, SYNTH_INIT_PRESET)
│   ├── arp-engine.js       # 16-Step Arpeggiator & Master-Sync Slave
│   ├── note-router.js      # NoteRouter: keybed and MIDI notes -> arpeggiator or voices, arp/latch switches (DOM-free)
│   ├── synth-params.js     # SUB-1 parameter table (SynthParams = SynthBlocks.ParamTable): preset path, setter, knob id
│   ├── voice.js            # One persistent synth voice: graph, envelopes, LFO routing (LFO_DEPTH), mod matrix (SUB1_MOD_SOURCES/TARGETS)
│   ├── fx-chain.js         # Rack: SynthBlocks Crusher -> Chorus -> Delay -> Reverb in series, loads the crusher worklet
│   ├── poly-synth-engine.js # PolySynthEngine base: AudioContext, master bus, FX rack, voice pool, notes, MIDI (initMidi() at page load from app.js, byte-stream parser), presets
│   ├── audio-engine.js     # SUB-1 engine (extends PolySynthEngine): VCO/mixer/VCF/LFO patch, setters, noise, PW offsets
│   ├── fm-algorithms.js    # FM-4 operators C/A/B1/B2, 8 algorithms (mods, feedback op, outputs X/Y), ratio steps, watch-hand B knob
│   ├── fm-params.js        # FM-4 parameter table (FmParams)
│   ├── fm-presets.js       # FM-4 factory presets (FM_FACTORY_PRESETS, FM_INIT_PRESET)
│   ├── fm-voice.js         # FM-4 voice: drives one 'fm4-voice' worklet node (operator freqs, ADSR gains, vibrato, alg/feedback/mix)
│   ├── fm-engine.js        # FM-4 engine (extends PolySynthEngine): loads the worklet, algorithm, feedback, X/Y mix, ratios, vibrato
│   ├── worklets/
│   │   ├── fm-voice-processor.js # AudioWorklet: 4-op phase modulation per sample with feedback (FmVoiceCore, tested in Node)
│   │   └── crusher-processor.js  # AudioWorklet: bitcrusher, sample-and-hold rate + bit quantization (CrusherCore, tested in Node)
│   ├── fm-algorithm-display.js # FM-4 routing display: layout + SVG from FmAlgorithms (DOM-free, fixed canvas)
│   ├── patch-randomizer.js # RANDOM button: playable random patch per synth (DOM-free, seeded rng in tests)
│   ├── drum-kits.js        # Drum factory kits (patterns + sound params)
│   ├── drum-engine.js      # DSP drum & 303 bass synthesis, Web Worker master clock
│   ├── drum-ui.js          # Drum rack drawer: transport, step matrix, mutes, kits, sync
│   ├── knob-scale.js       # Pure knob math: value <-> ratio, rounding, readout formatting
│   ├── controls.js         # DragController + Knob, Fader, PerformanceWheel
│   ├── envelope-display.js # EnvelopeDisplay: SVG shape of the envelope the ADSR faders edit (path() pure, log time axis like the faders)
│   ├── virtual-keyboard.js # Keybed rendering, mouse glissando, multi-touch, PC keyboard
│   ├── visualizer.js       # CRT oscilloscope, VU meters, woofers
│   ├── preset-store.js     # User presets in localStorage (DOM-free)
│   ├── preset-panel.js     # Preset LCD, prev/next, save / overwrite / delete dialog
│   ├── mod-matrix-panel.js # MOD MATRIX overlay: source/target selects per slot (amount knobs bound by SynthUI), slot LEDs
│   ├── synth-ui.js         # Panel composer: knobs/faders/buttons via the synth definition, arp strip, perf bay
│   ├── synth-registry.js   # Synth definitions (engine, param table, button rows, env tabs, presets) + selection
│   ├── pwa-manager.js      # PWA lifecycle, install prompts, wake lock & offline state
│   └── app.js              # Application entry, master power, volume & version manager
└── test/
    ├── helpers/
    │   ├── load-browser-script.js  # vm sandbox loader for js/ files (stubbed timers)
    │   ├── fake-audio-context.js   # Web Audio stand-in: nodes record connections, params record events
    │   └── synth-engine.js         # createLiveEngine(): AudioEngine with the full graph on the fake context
    └── *.test.js           # node:test unit tests (npm test)
```

## Drum & Bass Machine Architecture (`js/drum-engine.js`)

### 1. Pure DSP Synthesized Voices (Zero External Samples)
- **Kick (BD)**: Sub-sine drop ($160\,\text{Hz} \to 38\,\text{Hz}$) + transient pop click + level-normalized $\tanh$ overdrive.
- **Snare (SD)**: Dual body resonators ($185\,\text{Hz}$ and $330\,\text{Hz}$) + high-pass filtered white noise burst.
- **Hi-Hats (CH / OH)**: 6 inharmonic square waves through high-pass filter. Closed Hat chokes active Open Hat voice instantly.
- **Clap (CP)**: 3 successive noise impulse bursts ($11\,\text{ms}$ spacing) + decaying reverb tail.
- **303 Acid Bassline**: Monophonic VCO (Sawtooth/Square) through 24dB resonant lowpass filter with exponential decay, accent boost, and slide portamento (`setTargetAtTime`).

### 2. Master Clock & Slave Synchronization
- Drum Engine hosts the master Web Worker clock ticking every 20ms.
- Registered slave engines (like `ArpEngine`) receive `handleExternalClockTick(stepIndex, time, beatSec)` and `handleExternalTransport(isPlaying)` for 100% phase-locked tempo sync with zero drift.
- **Clock tempo for the synced delay**: `ArpEngine.clockBpm()` is the arp BPM, or in external mode the drum tempo (`setExternalTempo()` from `DrumUI.setTempo()`, and every clock tick's `beatSec`). On change `reportTempo()` calls `engine.setClockTempo(bpm)`, which sets `fx.delay.bpm` (not a patch parameter) and ramps the delay lines when `fx.delay.sync` is on.

## Synth Building Blocks (`js/lib/`)

Instrument-neutral parts every synth on the page composes: a synth engine wires blocks into a voice and a patch, the blocks themselves know no engine. Contract for every block:

- **Shape**: classic script, attaches to `window.SynthBlocks`; constructor takes the `AudioContext` first, then values or a live settings object (`Envelope` reads `engine.ampEnv`, effects read `engine.fx.*`). Engines mutate settings objects in place, so a block holding one sees knob changes.
- **Wiring**: `input` / `output` nodes; modulation targets as AudioParam fields (`vco.detune`, `vca.tremoloGain`) or arrays (`filter.frequencyParams`). `Vco` has two output paths and offers `connect(dest)` instead of `output`.
- **Zero GC**: blocks are built once per voice or page; trigger, `set*` and `apply*` methods only schedule AudioParams or swap curves.
- **Tests**: `test/<file>.test.js` per block, loading only the lib files it needs (`loadScripts('lib/curves.js', 'lib/vco.js')`). Arrays created inside the vm sandbox fail `deepEqual` against Node arrays: compare `Array.from(...)`.

## Synth Selection (`js/synth-registry.js`)

One synth plays per page load; switching reloads with `?synth=<id>` (stored in `localStorage` as `retrovox_synth`).

- **Engine**: a `PolySynthEngine` subclass (`js/poly-synth-engine.js` lists the hooks: `initInstrument`, `createVoice`, `onOctaveChange`, `onModWheelChange`). Arpeggiator, drums, UI and PWA manager use only the base interface.
- **Definition**: one entry in `SYNTH_DEFINITIONS` (engine factory, `ParamTable`, button rows, toggles, envelope tabs, presets, preset storage key, LFO LED rate).
- **Markup**: synth-specific slides, tabs and labels carry `data-synth="<id>"` in `index.html`; `app.js` removes the other synths' elements before `SynthUI` binds controls. Elements without `data-synth` (ADSR faders, FX rack, keyboard, arp) are shared, so shared knob ids (`fx-*`) need a row in every table. `test/synth-registry.test.js` checks knobs and envelope tabs per synth.

## Modulation Matrix (`js/lib/mod-matrix.js`)

- **Data**: `engine.modMatrix.slot1..slot8 = { source, dest, amount }` (base class), set via `engine.setModSlot(slot, field, value)`, preset rows from `ParamTable.matrixParams(ModMatrix.SLOTS)`. `'off'` or unknown names leave a slot unplugged.
- **Voice side**: a voice builds `SynthBlocks.ModMatrix` over its sources and `voice.modTargets` and exposes it as `voice.modMatrix`. SUB-1 names and depths: `SUB1_MOD_SOURCES` / `SUB1_MOD_TARGETS` in `voice.js`; the synth definition passes them as `modMatrix` to the panel. Per-voice ConstantSources are created unstarted and passed as `idle`: the matrix starts each on its first route (never twice), so an empty matrix runs no extra nodes.
- **New source or target**: add the node/param in `Voice.buildModMatrix()` / `buildModTargets()` and the entry in `SUB1_MOD_*`; `test/sub1-mod-matrix.test.js` fails if definition and voice drift apart.
- **Envelopes as sources**: `engine.modEnvelopes()` lists the envelopes a matrix offers (`filterEnv`, `ampEnv`, `modEnv`); `modEnv` (tab MOD ENV) has no fixed routing, it only exists as matrix source. `modEnv.loop` (button `#modEnvLoopBtn`) makes `NoteModSources` call `Envelope.loop()`: attack/decay cycles scheduled 2 s ahead, refilled by a 500 ms timeout per held note, stopped on release. `modEnv.jitter` (knob `mod-env-jitter` below the envelope display next to LOOP, beside it in compact landscape, 0..1) stretches each cycle by 2^(jitter · r), r random in -1..1, through the `cycleScale` option of `Envelope.loop()`.
- **FX targets**: the rack exists once, so `AudioEngine.initRackModulation()` builds one more matrix, `engine.fxModMatrix`, over `fxChain.modTargets` (crusherBits/crusherRate appear after `fxChain.ready`) with names and depths from `SUB1_FX_MOD_TARGETS`. Its note sources (`engine.fxNoteModSources`, `SynthBlocks.NoteModSources`) follow the last note and release when the last key is up. Every slot goes to all matrices; each one routes only the targets it knows. The definition's `modMatrix.targets` merges both lists.
- **UI**: `#openModMatrixBtn` sits in the preset bar next to RANDOM; it and `#modMatrixPanel` carry `data-synth="sub1"`. The FM-4 has no matrix yet.

## Synthesizer Audio Engine Architecture (`js/audio-engine.js`)

### 1. 12-Voice Persistent Polyphonic Pool
- **Structure**: `this.pool` (`SynthBlocks.VoicePool`) holds 12 pre-allocated `Voice` instances (`js/voice.js`) initialized on `AudioContext` startup; `voicePool` and `activeVoices` are the pool's array and note map. A voice reads the current patch from its engine; `AudioEngine.forEachVoice()` pushes live parameter changes.
- **Voice Nodes**:
  - `vco[1]` & `vco[2]` (`SynthBlocks.Vco`: native Sine/Triangle/Sawtooth direct path and 4x-oversampled WaveShaper audio-rate PWM)
  - `subOsc` (Sub-octave triangle wave)
  - `mixer` (`SynthBlocks.Mixer`: vco1Level, vco2Level, subLevel, noiseLevel channels; noise comes from the engine's shared white noise source)
  - `drive` (`SynthBlocks.Drive`: 2x-oversampled WaveShaper with level-normalized $\tanh$ curve)
  - `filter` (`SynthBlocks.Filter`: stage1 & stage2, 24dB/12dB cascaded ladder filter with Q-staging)
  - `vca` (`SynthBlocks.Vca`: ADSR amplitude gain `vca.gain` -> tremolo gain `vca.tremoloGain` for LFO amp)
  - `lfo[1]` / `lfo[2]` (`{ pitch, vcf, pwm: [vco1, vco2], amp }` routing gains fed by `engine.lfos[n].output` (`SynthBlocks.Lfo`, oscillator + S&H source); depth at amount 1.0 = `LFO_DEPTH` in `voice.js`, shared by continuous LFOs and Sample & Hold)
- **Lifecycle & LRU Voice Stealing**:
  - `noteOn(midiNote, velocity)` asks `pool.allocate()`: same note (retrigger), then a free voice, then the oldest releasing voice.
  - If all 12 voices are active, the voice with the oldest `startTime` is stolen via `voice.choke()` (2ms fade, `Vca.choke`).
  - `noteOff(midiNote)` initiates the asymptotic ADSR release curve and resets the active voice flag when the release completes.

### 2. Patch Parameter Table (`js/synth-params.js`)
- `SYNTH_PARAMS` lists every patch parameter once: preset `path`, `set(engine, value)`, optional engine `field` and the knob id (`data-param`).
- `getPresetState()` / `loadPresetState()`, knob dispatch and `SynthUI.syncControls()` all run off this table. A new parameter needs one table row, a default in `SYNTH_INIT_PRESET` and (for a knob) the HTML; `test/synth-params.test.js` fails if table, init preset and knobs drift apart.

### 3. Normalized Saturation Curve ($\tanh$, `js/lib/curves.js`)
- `SynthBlocks.driveCurve(amount)`: identity at amount 0, otherwise `tanhCurve(1 + 4 * amount, 512)`.
- `SynthBlocks.tanhCurve(gain, n)`: $\tanh(g x) / \tanh(g)$, edges stay at $\pm 1$. The drum kick and 303 bass use it with 256 samples.

### 4. FX Rack (`js/fx-chain.js`) & Master Bus (`js/lib/master-bus.js`)
- **Signal Flow**:
  $$\text{VoiceBus} \longrightarrow \text{Bitcrusher} \longrightarrow \text{Juno BBD Chorus} \longrightarrow \text{Tape Delay (Ping-Pong)} \longrightarrow \text{Studio Reverb} \longrightarrow \text{MasterBus: Analyser} \longrightarrow \text{Volume} \longrightarrow \text{Peak Limiter} \longrightarrow \text{Safety Clipper} \longrightarrow \text{Destination}$$
- **Brickwall Peak Limiter**: `DynamicsCompressorNode` configured with threshold `-0.5 dB`, ratio `20:1`, attack `0.001s`, release `0.05s`; the 4x-oversampled safety clipper catches its overshoot below 0.98. Voices are gain-staged so a 4-note velocity-1 chord stays <= 1.6 at the bus input (SUB-1 `VOICE_PEAK_GAIN` 0.2, FM-4 `FM_VOICE_PEAK_GAIN` 0.4), about 2 dB of limiting at volume 0.8; the render check enforces it.
- **Render check** (`scripts/render-check.js`, `npm run render`): the engines run unchanged on an OfflineAudioContext. It renders 4 channels: 0/1 the output, 2/3 a tap on `engine.master.input` for the bus input peak. `ctx.currentTime` reads a virtual clock that also drives `setTimeout`/`setInterval`; between note events it runs up to 2048 frames ahead of the render, so timer automation lands at its exact time. Note on/off run at a suspend one render quantum before their frame (Chromium applies events entered at the suspend time itself one quantum late). `ctx.state` reports `running`: an engine resume during a suspend restarts the render while the engine still schedules, and results then vary. The master bus delays the output by 480 frames at 48 kHz (limiter look-ahead, oversampling), measured with an impulse per run.
- `engine.master` (`SynthBlocks.MasterBus`) is the shared output: the drum bus connects to `master.input`, the visualizer reads `master.analyser`.
