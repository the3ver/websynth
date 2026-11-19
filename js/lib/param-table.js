/**
 * SYNTH BLOCKS • PARAMETER TABLE
 * One table per synth lists every patch parameter once: preset path, engine setter, optional engine
 * field (when it differs from the path), the knob that controls it (data-param in index.html) and,
 * for knobs shared between LFOs or operators, the selector value it belongs to (`lfo`).
 * `preset: false` marks a knob-only view of other parameters (it is neither saved nor loaded).
 * Preset save/load, knob dispatch and UI sync all run off the table.
 * Classic script: attaches to the window.SynthBlocks namespace.
 */
(function (blocks) {
  function getPath(obj, path) {
    return path.split('.').reduce((node, key) => (node == null ? undefined : node[key]), obj);
  }

  function setPath(obj, path, value) {
    const keys = path.split('.');
    const last = keys.pop();
    const parent = keys.reduce((node, key) => (node[key] = node[key] || {}), obj);
    parent[last] = value;
  }

  class ParamTable {
    constructor(list) {
      this.list = list;
      this.byPathMap = new Map(list.map((p) => [p.path, p]));
    }

    getPath(obj, path) {
      return getPath(obj, path);
    }

    setPath(obj, path, value) {
      setPath(obj, path, value);
    }

    byPath(path) {
      return this.byPathMap.get(path);
    }

    /**
     * Knob ids are unique except shared knobs, which address the selector value chosen in the UI
     */
    byKnob(knobId, selected) {
      return this.list.find((p) => p.knob === knobId && (p.lfo === undefined || p.lfo === selected));
    }

    read(engine, param) {
      return param.field ? engine[param.field] : getPath(engine, param.path);
    }

    set(engine, path, value) {
      const param = this.byPath(path);
      if (param) param.set(engine, value);
    }

    /**
     * Current patch as a plain nested preset state
     */
    readState(engine) {
      const state = {};
      for (const param of this.list) {
        if (param.preset !== false) setPath(state, param.path, this.read(engine, param));
      }
      return state;
    }

    /**
     * Applies every parameter present in a (possibly partial) preset state
     */
    applyState(engine, state) {
      for (const param of this.list) {
        if (param.preset === false) continue;
        const value = getPath(state, param.path);
        if (value !== undefined) param.set(engine, value);
      }
    }

    /**
     * ADSR rows for an envelope settings object on the engine, set through engine.setEnvStage
     */
    static envParams(envName) {
      return ['attack', 'decay', 'sustain', 'release'].map((stage) => ({
        path: `${envName}.${stage}`,
        set: (e, v) => e.setEnvStage(envName, stage, v)
      }));
    }

    /**
     * Rows for the shared FX rack (engine.fx, setters on PolySynthEngine, fx-* knobs)
     */
    static fxParams() {
      return [
        { path: 'fx.chorus.mode', set: (e, v) => e.setChorusMode(v) },
        { path: 'fx.chorus.mix', knob: 'fx-chorus-mix', set: (e, v) => e.setChorusMix(v) },
        { path: 'fx.delay.time', knob: 'fx-delay-time', set: (e, v) => e.setDelayTime(v) },
        { path: 'fx.delay.feedback', knob: 'fx-delay-feedback', set: (e, v) => e.setDelayFeedback(v) },
        { path: 'fx.delay.mix', knob: 'fx-delay-mix', set: (e, v) => e.setDelayMix(v) },
        { path: 'fx.reverb.decay', knob: 'fx-reverb-decay', set: (e, v) => e.setReverbDecay(v) },
        { path: 'fx.reverb.mix', knob: 'fx-reverb-mix', set: (e, v) => e.setReverbMix(v) }
      ];
    }
  }

  Object.assign(blocks, { ParamTable });
})(window.SynthBlocks = window.SynthBlocks || {});
