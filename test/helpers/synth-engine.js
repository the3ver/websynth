/**
 * Builds synth engines inside the vm sandbox, optionally with a running FakeAudioContext.
 */
const { loadScriptsWith } = require('./load-browser-script');
const { FakeAudioContext } = require('./fake-audio-context');

const ENGINE_SCRIPTS = ['lib/curves.js', 'lib/envelope.js', 'lib/filter.js', 'lib/vco.js', 'lib/lfo.js', 'lib/effects.js', 'lib/gain-stages.js', 'lib/master-bus.js', 'lib/operator.js', 'lib/param-table.js', 'lib/voice-pool.js', 'synth-params.js', 'voice.js', 'fx-chain.js', 'poly-synth-engine.js', 'audio-engine.js'];
const FM_SCRIPTS = ['fm-params.js', 'fm-presets.js', 'fm-voice.js', 'fm-engine.js'];

function loadEngineContext(...extraScripts) {
  return loadScriptsWith({ AudioContext: FakeAudioContext, navigator: {} }, ...ENGINE_SCRIPTS, ...extraScripts);
}

/**
 * SUB-1 engine with the full audio graph built (voice pool, LFOs, FX chain) on a FakeAudioContext
 */
function createLiveEngine(...extraScripts) {
  const context = loadEngineContext(...extraScripts);
  const engine = new context.AudioEngine();
  engine.initAudio();
  return { engine, context, ctx: engine.ctx };
}

/**
 * FM-4 engine with the full audio graph built on a FakeAudioContext
 */
function createLiveFmEngine(...extraScripts) {
  const context = loadEngineContext(...FM_SCRIPTS, ...extraScripts);
  const engine = new context.FmEngine();
  engine.initAudio();
  return { engine, context, ctx: engine.ctx };
}

module.exports = { ENGINE_SCRIPTS, FM_SCRIPTS, loadEngineContext, createLiveEngine, createLiveFmEngine };
