/**
 * Builds a synth AudioEngine inside the vm sandbox, optionally with a running FakeAudioContext.
 */
const { loadScriptsWith } = require('./load-browser-script');
const { FakeAudioContext } = require('./fake-audio-context');

const ENGINE_SCRIPTS = ['voice.js', 'fx-chain.js', 'audio-engine.js'];

function loadEngineContext(...extraScripts) {
  return loadScriptsWith({ AudioContext: FakeAudioContext, navigator: {} }, ...ENGINE_SCRIPTS, ...extraScripts);
}

/**
 * Engine with the full audio graph built (voice pool, LFOs, FX chain) on a FakeAudioContext
 */
function createLiveEngine(...extraScripts) {
  const context = loadEngineContext(...extraScripts);
  const engine = new context.AudioEngine();
  engine.initAudio();
  return { engine, context, ctx: engine.ctx };
}

module.exports = { ENGINE_SCRIPTS, loadEngineContext, createLiveEngine };
