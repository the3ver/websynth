/**
 * Builds synth engines inside the vm sandbox, optionally with a running FakeAudioContext.
 */
const { loadScriptsWith } = require('./load-browser-script');
const { FakeAudioContext, FakeAudioWorkletNode } = require('./fake-audio-context');

// Params of the FM-4 voice worklet (js/worklets/fm-voice-processor.js)
const FM_WORKLET_PARAMS = { detune: 0, algorithm: 1, feedback: 0, mix: 0 };
for (let n = 1; n <= 4; n++) Object.assign(FM_WORKLET_PARAMS, { [`freq${n}`]: 440, [`gain${n}`]: 0 });
FakeAudioWorkletNode.define('fm4-voice', FM_WORKLET_PARAMS);

const ENGINE_SCRIPTS = ['lib/curves.js', 'lib/envelope.js', 'lib/filter.js', 'lib/vco.js', 'lib/lfo.js', 'lib/effects.js', 'lib/gain-stages.js', 'lib/master-bus.js', 'lib/param-table.js', 'lib/voice-pool.js', 'synth-params.js', 'voice.js', 'fx-chain.js', 'poly-synth-engine.js', 'audio-engine.js'];
const FM_SCRIPTS = ['fm-algorithms.js', 'fm-params.js', 'fm-presets.js', 'fm-voice.js', 'fm-engine.js'];

function loadEngineContext(...extraScripts) {
  return loadScriptsWith({ AudioContext: FakeAudioContext, AudioWorkletNode: FakeAudioWorkletNode, navigator: {} }, ...ENGINE_SCRIPTS, ...extraScripts);
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
 * FM-4 engine with the full audio graph built on a FakeAudioContext (async: the voice pool
 * waits for the worklet module)
 */
async function createLiveFmEngine(...extraScripts) {
  const context = loadEngineContext(...FM_SCRIPTS, ...extraScripts);
  const engine = new context.FmEngine();
  engine.initAudio();
  await engine.ready;
  return { engine, context, ctx: engine.ctx };
}

module.exports = { ENGINE_SCRIPTS, FM_SCRIPTS, loadEngineContext, createLiveEngine, createLiveFmEngine };
