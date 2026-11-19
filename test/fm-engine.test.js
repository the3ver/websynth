const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { createLiveFmEngine, loadEngineContext, FM_SCRIPTS } = require('./helpers/synth-engine');

const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-6, `${msg}: ${a} vs ${b}`);

describe('FM-4 voice graph', () => {
  test('the voice pool waits for the worklet module, then holds 12 worklet voices off the master bus', async () => {
    const context = loadEngineContext(...FM_SCRIPTS);
    const engine = new context.FmEngine();
    engine.initAudio();
    assert.equal(engine.voicePool.length, 0, 'no voices before the module loaded');
    engine.noteOn(60, 1.0);
    assert.equal(engine.activeVoices.size, 0, 'notes before that stay silent');
    await engine.ready;
    assert.ok(engine.ctx.workletModules.includes('js/worklets/fm-voice-processor.js'));
    assert.equal(engine.voicePool.length, 12);
    for (const voice of engine.voicePool) {
      assert.equal(voice.node.name, 'fm4-voice');
      assert.deepEqual(voice.node.connections, [voice.mix]);
      assert.ok(!voice.mix.connections.includes(engine.masterVoiceBus));
    }
  });

  test('the worklet gets the one routing table from FmAlgorithms', async () => {
    const { engine, context } = await createLiveFmEngine();
    assert.equal(engine.voicePool[0].node.options.processorOptions.algorithms, context.FmAlgorithms.ALGORITHMS);
  });

  test('algorithm, feedback and mix reach every voice; unknown algorithms are ignored', async () => {
    const { engine } = await createLiveFmEngine();
    engine.setAlgorithm(6);
    engine.setFeedback(0.7);
    engine.setMix(1.4);
    engine.setAlgorithm(42);
    for (const voice of engine.voicePool) {
      assert.equal(voice.algorithmParam.value, 6);
      near(voice.feedbackParam.value, 0.7, 'feedback');
      assert.equal(voice.mixParam.value, 1, 'mix clamps to 1');
    }
    assert.equal(engine.algorithm, 6);
  });

  test('the vibrato LFO reaches the shared operator detune', async () => {
    const { engine } = await createLiveFmEngine();
    const voice = engine.voicePool[0];
    assert.ok(engine.vibratoLfo.output.connections.includes(voice.vibrato));
    assert.ok(voice.vibrato.connections.includes(voice.detune));
  });
});

describe('FM-4 ratios', () => {
  test('the B knob turns like a watch: B2 runs through all steps, then B1 moves on', async () => {
    const { engine, context } = await createLiveFmEngine();
    const { B_RATIOS, B_STEPS } = context.FmAlgorithms;
    engine.setBRatioStep(0);
    assert.deepEqual([engine.op3.ratio, engine.op4.ratio], [0.25, 0.25]);
    engine.setBRatioStep(B_RATIOS.length - 1);
    assert.deepEqual([engine.op3.ratio, engine.op4.ratio], [0.25, 16]);
    engine.setBRatioStep(B_RATIOS.length);
    assert.deepEqual([engine.op3.ratio, engine.op4.ratio], [0.5, 0.25]);
    engine.setBRatioStep(B_STEPS + 50);
    assert.deepEqual([engine.op3.ratio, engine.op4.ratio], [16, 16]);
    assert.equal(engine.bRatioStep, B_STEPS - 1);
  });

  test('the B readout shows both ratios', async () => {
    const { context } = await createLiveFmEngine();
    const { formatB, bStep } = context.FmAlgorithms;
    assert.equal(formatB(bStep(0.5, 3)), '.5 / 3');
    assert.equal(formatB(bStep(1, 1)), '1 / 1');
  });

  test('every factory preset uses ratios from its operator group', async () => {
    const context = loadEngineContext(...FM_SCRIPTS);
    const { C_RATIOS, A_RATIOS, B_RATIOS, ALGORITHMS } = context.FmAlgorithms;
    for (const preset of [context.FM_INIT_PRESET, ...context.FM_FACTORY_PRESETS]) {
      const s = preset.state;
      assert.ok(C_RATIOS.includes(s.op1.ratio), `${preset.id} C`);
      assert.ok(A_RATIOS.includes(s.op2.ratio), `${preset.id} A`);
      assert.ok(B_RATIOS.includes(s.op3.ratio) && B_RATIOS.includes(s.op4.ratio), `${preset.id} B`);
      assert.ok(ALGORITHMS[s.algorithm], `${preset.id} algorithm`);
    }
  });
});

describe('FM-4 notes', () => {
  test('noteOn tunes operators by ratio and detune', async () => {
    const { engine, ctx } = await createLiveFmEngine();
    engine.setOpParam(2, 'ratio', 3);
    engine.setOpParam(3, 'detune', 1200);
    ctx.currentTime = 1;
    engine.noteOn(69, 1.0);
    const voice = engine.activeVoices.get(69);
    assert.ok(voice.mix.connections.includes(engine.masterVoiceBus));
    near(voice.ops[1].frequency.value, 440, 'carrier');
    near(voice.ops[2].frequency.value, 1320, 'ratio 3');
    near(voice.ops[3].frequency.value, 440 * 2 * Math.pow(2, 50 / 1200), 'detune clamps to 50 cents');
  });

  test('every operator envelope peaks at level times velocity', async () => {
    const { engine, ctx } = await createLiveFmEngine();
    engine.setOpParam(1, 'level', 0.6);
    engine.setEnvStage('op1.env', 'attack', 0.1);
    ctx.currentTime = 2;
    engine.noteOn(60, 0.5);
    const events = engine.activeVoices.get(60).ops[1].gain.events;
    const peak = events.find((e) => e.type === 'exponentialRampToValueAtTime' && e.time === 2.1);
    near(peak.value, 0.3, 'peak');
  });

  test('a zero level keeps the exponential ramps above zero', async () => {
    const { engine } = await createLiveFmEngine();
    engine.setOpParam(4, 'level', 0);
    engine.noteOn(60, 1.0);
    const ramps = engine.activeVoices.get(60).ops[4].gain.events.filter((e) => e.type === 'exponentialRampToValueAtTime');
    assert.ok(ramps.length >= 2 && ramps.every((e) => e.value > 0));
  });

  test('pitch bend, octave and the B knob retune sounding voices', async () => {
    const { engine, context } = await createLiveFmEngine();
    engine.noteOn(69, 1.0);
    const voice = engine.activeVoices.get(69);
    engine.setOctaveShift(1);
    near(voice.ops[1].frequency.value, 880, 'octave up');
    engine.setPitchBend(Math.pow(2, 2 / 12));
    near(voice.ops[2].frequency.value, 880 * Math.pow(2, 2 / 12), 'bend');
    engine.setBRatioStep(context.FmAlgorithms.bStep(2, 3));
    near(voice.ops[3].frequency.value, 2 * 880 * Math.pow(2, 2 / 12), 'B1');
    near(voice.ops[4].frequency.value, 3 * 880 * Math.pow(2, 2 / 12), 'B2');
  });

  test('glide ramps every operator from the previous note', async () => {
    const { engine, ctx } = await createLiveFmEngine();
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

  test('release frees the voice after the longest operator tail', async () => {
    const { engine, context, ctx } = await createLiveFmEngine();
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

  test('a stolen voice chokes all operators', async () => {
    const { engine, ctx } = await createLiveFmEngine();
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
  test('depth and mod wheel set the vibrato in cents, the larger one wins', async () => {
    const { engine } = await createLiveFmEngine();
    const voice = engine.voicePool[0];
    engine.setVibratoDepth(0.2);
    near(voice.vibrato.gain.value, 10, 'patch depth');
    engine.setModWheel(0.8);
    near(voice.vibrato.gain.value, 40, 'mod wheel');
  });

  test('rate goes to the LFO', async () => {
    const { engine } = await createLiveFmEngine();
    engine.setVibratoRate(7);
    assert.equal(engine.vibratoLfo.osc.frequency.value, 7);
  });
});
