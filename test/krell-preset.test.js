/**
 * Factory preset 11 // KRELL PATCH (SUB-1): while a key is held it plays itself, pulse after pulse
 * at random pitches. Checked on the live engine graph (FakeAudioContext).
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createLiveEngine } = require('./helpers/synth-engine');

function krell() {
  const { engine, context, ctx } = createLiveEngine('presets.js');
  const preset = context.SYNTH_FACTORY_PRESETS.find((p) => p.id === 'krell-patch');
  assert.ok(preset, 'preset krell-patch');
  engine.loadPresetState(preset.state, context.SYNTH_INIT_PRESET.state);
  engine.noteOn(60, 1);
  return { engine, ctx, voice: engine.activeVoices.get(60) };
}

// Matrix gains that connect a source node to a target param, with their summed gain
function routed(source, param) {
  const gains = source.connections.filter((g) => g.connections && g.connections.includes(param));
  return gains.reduce((sum, g) => sum + g.gain.value, 0);
}

test('a held key plucks: FILTER ENV holds the level at silence, each MOD ENV cycle lifts it to full', () => {
  const { voice } = krell();
  const { filterEnv, modEnv } = voice.modSources;
  const peaks = modEnv.offset.events.filter((e) => e.type === 'exponentialRampToValueAtTime' && e.value === 1);
  assert.ok(peaks.filter((e) => e.time <= 2).length >= 2, `plucks in 2 s: ${peaks.length}`);
  // Level = 1 + sum(amount * depth * source): AMP ENV at 1 cancels the base, MOD ENV at its peak restores it
  assert.ok(Math.abs(routed(filterEnv, voice.vca.tremoloGain) + 1) < 1e-9, 'FILTER ENV pulls to silence');
  assert.ok(Math.abs(routed(modEnv, voice.vca.tremoloGain) - 1) < 1e-9, 'MOD ENV lifts to full');
});

test('pitch and cutoff wander on sample-and-hold LFOs', () => {
  const { engine, voice } = krell();
  assert.ok(routed(engine.lfos[1].output, voice.vco[1].osc.detune) >= 600, 'pitch steps of half an octave and more');
  assert.ok(routed(engine.lfos[2].output, voice.filter.stage1.detune) > 0, 'cutoff steps');
});

test('letting go between plucks plays no ghost note: the canceller releases far slower than the VCA', () => {
  const { engine } = krell();
  // Between plucks the level is vca(t) * (1 - cancel(t)); equal release times swell it to 0.25 * peak (-12 dB)
  assert.ok(engine.filterEnv.release >= 4 * engine.ampEnv.release, 'ghost note at most about -20 dB');
});
