const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { createLiveFmEngine } = require('./helpers/synth-engine');

const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-6, `${msg}: ${a} vs ${b}`);

describe('FM-4 voice graph', () => {
  test('12 voices with 4 running operators each, idle voices off the master bus', () => {
    const { engine } = createLiveFmEngine();
    assert.equal(engine.voicePool.length, 12);
    for (const voice of engine.voicePool) {
      for (const n of [1, 2, 3, 4]) assert.equal(voice.ops[n].osc.started, 0);
      assert.ok(!voice.mix.connections.includes(engine.masterVoiceBus));
    }
  });

  test('algorithm 1 is a serial stack 4 -> 3 -> 2 -> 1 -> mix', () => {
    const { engine } = createLiveFmEngine();
    const { ops, mix } = engine.voicePool[0];
    assert.ok(ops[4].output.connections.includes(ops[3].frequency));
    assert.ok(ops[3].output.connections.includes(ops[2].frequency));
    assert.ok(ops[2].output.connections.includes(ops[1].frequency));
    assert.deepEqual(ops[1].output.connections, [mix]);
  });

  test('switching to algorithm 8 makes all four operators carriers at a quarter of the peak gain', () => {
    const { engine } = createLiveFmEngine();
    engine.setAlgorithm(8);
    const { ops, mix } = engine.voicePool[5];
    for (const n of [1, 2, 3, 4]) {
      assert.deepEqual(ops[n].output.connections, [mix]);
      assert.equal(ops[n].scaleParam.value, 1);
    }
    near(mix.gain.value, 0.4 / 4, 'mix gain');
  });

  test('unknown algorithms are ignored', () => {
    const { engine } = createLiveFmEngine();
    engine.setAlgorithm(42);
    assert.equal(engine.algorithm, 1);
  });

  test('the vibrato LFO reaches every operator detune', () => {
    const { engine } = createLiveFmEngine();
    const voice = engine.voicePool[0];
    assert.ok(engine.vibratoLfo.output.connections.includes(voice.vibrato));
    for (const n of [1, 2, 3, 4]) assert.ok(voice.vibrato.connections.includes(voice.ops[n].detune));
  });
});

describe('FM-4 notes', () => {
  test('noteOn tunes operators by ratio and detune and scales modulators by their frequency', () => {
    const { engine, ctx } = createLiveFmEngine();
    engine.setOpParam(2, 'ratio', 3);
    engine.setOpParam(3, 'detune', 1200);
    ctx.currentTime = 1;
    engine.noteOn(69, 1.0);
    const voice = engine.activeVoices.get(69);
    assert.ok(voice.mix.connections.includes(engine.masterVoiceBus));
    near(voice.ops[1].frequency.value, 440, 'carrier');
    near(voice.ops[2].frequency.value, 1320, 'ratio 3');
    near(voice.ops[3].frequency.value, 440 * 2 * Math.pow(2, 50 / 1200), 'detune clamps to 50 cents');
    near(voice.ops[2].scaleParam.value, 8 * 1320, 'modulator depth');
    assert.equal(voice.ops[1].scaleParam.value, 1);
  });

  test('every operator envelope peaks at level times velocity', () => {
    const { engine, ctx } = createLiveFmEngine();
    engine.setOpParam(1, 'level', 0.6);
    engine.setEnvStage('op1.env', 'attack', 0.1);
    ctx.currentTime = 2;
    engine.noteOn(60, 0.5);
    const events = engine.activeVoices.get(60).ops[1].gain.events;
    const peak = events.find((e) => e.type === 'exponentialRampToValueAtTime' && e.time === 2.1);
    near(peak.value, 0.3, 'peak');
  });

  test('a zero level keeps the exponential ramps above zero', () => {
    const { engine } = createLiveFmEngine();
    engine.setOpParam(4, 'level', 0);
    engine.noteOn(60, 1.0);
    const ramps = engine.activeVoices.get(60).ops[4].gain.events.filter((e) => e.type === 'exponentialRampToValueAtTime');
    assert.ok(ramps.length >= 2 && ramps.every((e) => e.value > 0));
  });

  test('pitch bend and octave retune sounding voices and their modulation depth', () => {
    const { engine } = createLiveFmEngine();
    engine.noteOn(69, 1.0);
    const voice = engine.activeVoices.get(69);
    engine.setOctaveShift(1);
    near(voice.ops[1].frequency.value, 880, 'octave up');
    engine.setPitchBend(Math.pow(2, 2 / 12));
    near(voice.ops[2].frequency.value, 880 * Math.pow(2, 2 / 12), 'bend');
    near(voice.ops[2].scaleParam.value, 8 * 880 * Math.pow(2, 2 / 12), 'depth follows');
  });

  test('glide ramps every operator from the previous note', () => {
    const { engine, ctx } = createLiveFmEngine();
    engine.setGlide(true);
    engine.setOpParam(2, 'ratio', 2);
    ctx.currentTime = 1;
    engine.noteOn(57, 1.0);
    ctx.currentTime = 2;
    engine.noteOn(69, 1.0);
    const events = engine.activeVoices.get(69).ops[2].frequency.events.filter((e) => e.time >= 2);
    near(events.find((e) => e.type === 'setValueAtTime').value, 440, 'starts at 220 * 2');
    const ramp = events.find((e) => e.type === 'exponentialRampToValueAtTime');
    near(ramp.value, 880, 'ends at 440 * 2');
    near(ramp.time, 2 + engine.glideTime, 'glide time');
  });

  test('release frees the voice after the longest operator tail', () => {
    const { engine, context, ctx } = createLiveFmEngine();
    const delays = [];
    context.setTimeout = (fn, ms) => { delays.push({ fn, ms }); return delays.length; };
    engine.setEnvStage('op3.env', 'release', 2);
    ctx.currentTime = 1;
    engine.noteOn(60, 1.0);
    const voice = engine.activeVoices.get(60);
    engine.noteOff(60);
    assert.equal(voice.releaseStartTime, 1);
    const { fn, ms } = delays.pop();
    near(ms, (2 * 3 + 0.05) * 1000, 'cleanup delay');
    fn();
    assert.equal(voice.isBusy, false);
    assert.ok(!voice.mix.connections.includes(engine.masterVoiceBus));
  });

  test('a stolen voice chokes all operators', () => {
    const { engine, ctx } = createLiveFmEngine();
    for (let n = 60; n < 72; n++) engine.noteOn(n, 1.0);
    const oldest = engine.activeVoices.get(60);
    ctx.currentTime = 3;
    engine.noteOn(72, 1.0);
    assert.equal(engine.activeVoices.get(72), oldest);
    for (const n of [1, 2, 3, 4]) {
      assert.ok(oldest.ops[n].gain.events.some((e) => e.type === 'setTargetAtTime' && e.time === 3 && e.timeConstant === 0.002));
    }
  });
});

describe('FM-4 vibrato', () => {
  test('depth and mod wheel set the vibrato in cents, the larger one wins', () => {
    const { engine } = createLiveFmEngine();
    const voice = engine.voicePool[0];
    engine.setVibratoDepth(0.2);
    near(voice.vibrato.gain.value, 10, 'patch depth');
    engine.setModWheel(0.8);
    near(voice.vibrato.gain.value, 40, 'mod wheel');
  });

  test('rate goes to the LFO', () => {
    const { engine } = createLiveFmEngine();
    engine.setVibratoRate(7);
    assert.equal(engine.vibratoLfo.osc.frequency.value, 7);
  });
});
