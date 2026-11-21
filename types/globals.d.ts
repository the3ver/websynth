/**
 * Globals of the classic scripts in js/ for the type check (tsconfig.json, npm run check).
 * Each js/ file exports with window.X = X; tsc knows the top-level names but not these window properties.
 * A new window.X without a line here fails the check (TS2339), so add one per new export.
 */

/** Building blocks in js/lib/ attach to this object; untyped until each block gets a declaration. */
declare var SynthBlocks: any;

interface Window {
  SynthBlocks: any;
  /** Safari before 14.1 */
  webkitAudioContext?: typeof AudioContext;
  ArpEngine: typeof ArpEngine;
  AudioEngine: typeof AudioEngine;
  DRUM_FACTORY_KITS: typeof DRUM_FACTORY_KITS;
  DomUtils: typeof DomUtils;
  DragController: typeof DragController;
  DrumEngine: typeof DrumEngine;
  DrumUI: typeof DrumUI;
  EnvelopeDisplay: typeof EnvelopeDisplay;
  FM_FACTORY_PRESETS: typeof FM_FACTORY_PRESETS;
  FM_INIT_PRESET: typeof FM_INIT_PRESET;
  FXChain: typeof FXChain;
  Fader: typeof Fader;
  FmAlgorithmDisplay: typeof FmAlgorithmDisplay;
  FmAlgorithms: typeof FmAlgorithms;
  FmEngine: typeof FmEngine;
  FmParams: typeof FmParams;
  FmVoice: typeof FmVoice;
  Knob: typeof Knob;
  KnobScale: typeof KnobScale;
  ModMatrixPanel: typeof ModMatrixPanel;
  NoteRouter: typeof NoteRouter;
  PWAManager: typeof PWAManager;
  PatchRandomizer: typeof PatchRandomizer;
  PerformanceWheel: typeof PerformanceWheel;
  PolySynthEngine: typeof PolySynthEngine;
  PresetPanel: typeof PresetPanel;
  PresetStore: typeof PresetStore;
  SUB1_FX_MOD_TARGETS: typeof SUB1_FX_MOD_TARGETS;
  SUB1_MOD_SOURCES: typeof SUB1_MOD_SOURCES;
  SUB1_MOD_TARGETS: typeof SUB1_MOD_TARGETS;
  SYNTH_FACTORY_PRESETS: typeof FACTORY_PRESETS;
  SYNTH_INIT_PRESET: typeof INIT_PRESET;
  SynthParams: typeof SynthParams;
  SynthRegistry: typeof SynthRegistry;
  SynthUI: typeof SynthUI;
  VirtualKeyboard: typeof VirtualKeyboard;
  Visualizer: typeof Visualizer;
  Voice: typeof Voice;
}
