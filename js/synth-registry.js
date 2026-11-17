/**
 * SYNTH REGISTRY
 * One definition per playable synth. app.js builds the engine and SynthUI from the active one.
 *   createEngine()     a PolySynthEngine subclass
 *   params             its SynthBlocks.ParamTable
 *   buttonGroups       radio button rows: { path (string | ui => string), selector, key, parse? }
 *   toggles            on/off buttons for boolean params: { id, path }
 *   envTargets         ADSR fader tab (data-target) -> envelope settings path on the engine
 *   presets            { factory: [...], init }
 *   presetStorageKey   localStorage key of the user presets
 *   lfoRate(engine, ui) rate in Hz for the LFO LED
 */

const SYNTH_DEFINITIONS = {
  sub1: {
    id: 'sub1',
    name: 'RETROVOX SUB-1',
    createEngine: () => new AudioEngine(),
    params: SynthParams,
    buttonGroups: [
      { path: 'vco1.wave', selector: '.wave-btn-row[data-vco="1"] .wave-btn', key: 'wave' },
      { path: 'vco2.wave', selector: '.wave-btn-row[data-vco="2"] .wave-btn', key: 'wave' },
      { path: 'mixer.subOctave', selector: '#subOctSelector .sub-oct-btn', key: 'suboct', parse: (v) => parseInt(v, 10) },
      { path: 'vcf.type', selector: '#filterModeRow .filter-mode-btn', key: 'filter' },
      { path: 'fx.chorus.mode', selector: '#chorusModeRow .chorus-mode-btn', key: 'mode' },
      { path: (ui) => `lfo${ui.currentLfoTarget}.wave`, selector: '#lfoWaveRow .lfo-wave-btn', key: 'wave' }
    ],
    toggles: [{ id: 'vco2SyncBtn', path: 'vco2.hardSync' }],
    envTargets: { amp: 'ampEnv', filter: 'filterEnv' },
    presets: { factory: window.SYNTH_FACTORY_PRESETS, init: window.SYNTH_INIT_PRESET },
    presetStorageKey: 'retrovox_user_presets',
    lfoRate: (engine, ui) => engine.getLfo(ui.currentLfoTarget).rate
  },

  fm: {
    id: 'fm',
    name: 'RETROVOX FM-4',
    createEngine: () => new FmEngine(),
    params: FmParams,
    buttonGroups: [
      { path: 'algorithm', selector: '#fmAlgorithmRow .fm-alg-btn', key: 'alg', parse: (v) => parseInt(v, 10) },
      { path: 'fx.chorus.mode', selector: '#chorusModeRow .chorus-mode-btn', key: 'mode' }
    ],
    toggles: [],
    envTargets: { op1: 'op1.env', op2: 'op2.env', op3: 'op3.env', op4: 'op4.env' },
    presets: { factory: window.FM_FACTORY_PRESETS, init: window.FM_INIT_PRESET },
    presetStorageKey: 'retrovox_fm_user_presets',
    lfoRate: (engine) => engine.vibrato.rate
  }
};

const SynthRegistry = {
  definitions: SYNTH_DEFINITIONS,

  get(id) {
    return SYNTH_DEFINITIONS[id] || SYNTH_DEFINITIONS.sub1;
  }
};

window.SynthRegistry = SynthRegistry;
