/**
 * SYNTH REGISTRY
 * One definition per playable synth. app.js picks the active one at page load (resolveId), removes
 * the markup of the others ([data-synth] in index.html) and builds the engine and SynthUI from it.
 * Switching synths reloads the page with ?synth=<id>.
 *   label              entry in the header synth selector
 *   createEngine()     a PolySynthEngine subclass
 *   params             its SynthBlocks.ParamTable
 *   buttonGroups       radio button rows: { path (string | ui => string), selector, key, parse? }
 *   toggles            on/off buttons for boolean params: { id, path }
 *   envTargets         ADSR fader tab (data-target) -> envelope settings path on the engine
 *   presets            { factory: [...], init, random() -> patch state (RANDOM button) }
 *   presetStorageKey   localStorage key of the user presets
 *   lfoRate(engine, ui) rate in Hz for the LFO LED
 *   modMatrix          optional { sources: { id: label }, targets: { id: { label, depth } } } for the MOD MATRIX panel
 */

const SYNTH_DEFINITIONS = {
  sub1: {
    id: 'sub1',
    name: 'RETROVOX SUB-1',
    label: 'SUB-1 • ANALOG LAB',
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
    toggles: [{ id: 'vco2SyncBtn', path: 'vco2.hardSync' }, { id: 'modEnvLoopBtn', path: 'modEnv.loop' }],
    envTargets: { amp: 'ampEnv', filter: 'filterEnv', mod: 'modEnv' },
    presets: { factory: window.SYNTH_FACTORY_PRESETS, init: window.SYNTH_INIT_PRESET, random: (rng) => PatchRandomizer.sub1(rng) },
    presetStorageKey: 'retrovox_user_presets',
    lfoRate: (engine, ui) => engine.getLfo(ui.currentLfoTarget).rate,
    modMatrix: { sources: window.SUB1_MOD_SOURCES, targets: { ...window.SUB1_MOD_TARGETS, ...window.SUB1_FX_MOD_TARGETS } }
  },

  fm: {
    id: 'fm',
    name: 'RETROVOX FM-4',
    label: 'FM-4 • DIGITAL LAB',
    createEngine: () => new FmEngine(),
    params: FmParams,
    buttonGroups: [
      {
        path: 'algorithm',
        selector: '#fmAlgorithmRow .fm-alg-btn',
        key: 'alg',
        parse: (v) => parseInt(v, 10),
        onRender: (alg) => window.FmAlgorithmDisplay.render(alg)
      },
      { path: 'fx.chorus.mode', selector: '#chorusModeRow .chorus-mode-btn', key: 'mode' }
    ],
    toggles: [],
    envTargets: { op1: 'op1.env', op2: 'op2.env', op3: 'op3.env', op4: 'op4.env' },
    presets: { factory: window.FM_FACTORY_PRESETS, init: window.FM_INIT_PRESET, random: (rng) => PatchRandomizer.fm(rng) },
    presetStorageKey: 'retrovox_fm_user_presets',
    lfoRate: (engine) => engine.vibrato.rate
  }
};

const SynthRegistry = {
  definitions: SYNTH_DEFINITIONS,

  get(id) {
    return SYNTH_DEFINITIONS[id] || SYNTH_DEFINITIONS.sub1;
  },

  /**
   * Active synth id: ?synth=<id> in the URL, else the stored choice, else the SUB-1
   */
  resolveId(search, storedId) {
    const fromUrl = new URLSearchParams(search || '').get('synth');
    for (const id of [fromUrl, storedId]) {
      if (id && Object.prototype.hasOwnProperty.call(SYNTH_DEFINITIONS, id)) return id;
    }
    return 'sub1';
  }
};

window.SynthRegistry = SynthRegistry;
