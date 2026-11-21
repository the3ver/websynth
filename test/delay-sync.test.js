const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadScripts } = require('./helpers/load-browser-script');
const { FakeAudioContext } = require('./helpers/fake-audio-context');
const { createLiveEngine, createLiveFmEngine } = require('./helpers/synth-engine');

const { SynthBlocks } = loadScripts('lib/effects.js');
const { Delay } = SynthBlocks;

function assertClose(actual, expected, message = '') {
  assert.ok(Math.abs(actual - expected) <= 1e-9, `${message} expected ${actual} to be close to ${expected}`);
}

// Last target the delay lines ramp to (applyTime) or start at
function lineTargets(delay) {
  return [delay.delayL.delayTime.value, delay.delayR.delayTime.value];
}

test('note values convert to seconds at the clock tempo', () => {
  assertClose(Delay.noteSeconds('1/4', 120), 0.5);
  assertClose(Delay.noteSeconds('1/8', 120), 0.25);
  assertClose(Delay.noteSeconds('1/16', 120), 0.125);
  assertClose(Delay.noteSeconds('1/2', 120), 1.0);
  assertClose(Delay.noteSeconds('1/1', 120), 2.0);
  assertClose(Delay.noteSeconds('1/8d', 120), 0.375);
  assertClose(Delay.noteSeconds('1/8t', 120), 0.25 * (2 / 3));
  assertClose(Delay.noteSeconds('1/4', 90), 60 / 90);
  assertClose(Delay.noteSeconds('1/16t', 150), (0.25 * (2 / 3) * 60) / 150);
  assertClose(Delay.noteSeconds('1/2d', 60), 3.0);
  assertClose(Delay.noteSeconds('bogus', 120), 0.25, 'unknown value falls back to an eighth');
});

test('every note value of the NOTE knob is a valid division', () => {
  for (const division of Delay.DIVISIONS) assert.ok(Delay.noteSeconds(division, 120) > 0, division);
  assert.equal(Delay.DIVISIONS.length, 13);
});

test('synced delay lines follow the note value and stop at the longest delay time', () => {
  const settings = { time: 0.3, sync: true, division: '1/4', bpm: 120, feedback: 0.3, mix: 0.2 };
  const delay = new Delay(new FakeAudioContext(), settings);
  assert.deepEqual(lineTargets(delay), [0.5, 0.5 * Delay.STEREO_RATIO]);

  settings.division = '1/1';
  settings.bpm = 40;
  delay.applyTime();
  const [left, right] = lineTargets(delay);
  assertClose(left, Delay.MAX_TIME / Delay.STEREO_RATIO, 'left line');
  assertClose(right, Delay.MAX_TIME, 'right line keeps the 4:3 spread');

  settings.sync = false;
  delay.applyTime();
  assertClose(lineTargets(delay)[0], 0.3);
});

test('sync switch and tempo changes ramp the delay lines and build no nodes', () => {
  const { engine, ctx } = createLiveEngine();
  const { delay } = engine.fxChain;
  const nodeCount = ctx.nodes.length;

  engine.setDelayDivision('1/8');
  engine.setDelaySync(true);
  engine.setClockTempo(100);
  assertClose(lineTargets(delay)[0], 0.3);
  const last = delay.delayL.delayTime.events.at(-1);
  assert.equal(last.type, 'setTargetAtTime', 'tempo changes glide, no jump');
  assert.ok(last.timeConstant > 0);

  engine.setDelaySync(false);
  assertClose(lineTargets(delay)[0], engine.fx.delay.time);
  const events = delay.delayL.delayTime.events.length;
  engine.setClockTempo(80);
  assert.equal(delay.delayL.delayTime.events.length, events, 'free delay ignores the tempo');
  assert.equal(ctx.nodes.length, nodeCount);
});

test('setters validate sync and note value', () => {
  const { engine } = createLiveEngine();
  engine.setDelaySync('true');
  assert.equal(engine.fx.delay.sync, true);
  engine.setDelaySync(0);
  assert.equal(engine.fx.delay.sync, false);
  engine.setDelayDivision('1/4d');
  assert.equal(engine.fx.delay.division, '1/4d');
  engine.setDelayDivision('3/7');
  assert.equal(engine.fx.delay.division, '1/8');
});

test('arpeggiator tempo, internal and external, drives the synced delay', () => {
  const { engine, context } = createLiveEngine('arp-engine.js');
  const arp = new context.ArpEngine(engine);
  const { delay } = engine.fxChain;
  engine.setDelaySync(true);
  engine.setDelayDivision('1/4');

  arp.setBpm(90);
  assertClose(lineTargets(delay)[0], 60 / 90);

  arp.setExternalTempo(132);
  assertClose(lineTargets(delay)[0], 60 / 90, 'drum tempo counts only in external mode');
  arp.setSyncMode('external');
  assertClose(lineTargets(delay)[0], 60 / 132);

  // Drum clock ticks carry the running tempo, even with the arpeggiator off
  arp.handleExternalClockTick(0, 0, 60 / 150);
  assertClose(lineTargets(delay)[0], 60 / 150);
  const events = delay.delayL.delayTime.events.length;
  arp.handleExternalClockTick(1, 0.1, 60 / 150);
  assert.equal(delay.delayL.delayTime.events.length, events, 'same tempo schedules nothing');

  arp.setSyncMode('internal');
  assertClose(lineTargets(delay)[0], 60 / 90);
});

test('the drum rack reports its tempo to the arpeggiator', () => {
  const { DrumUI } = loadScripts('drum-ui.js');
  const reported = [];
  const ui = Object.create(DrumUI.prototype);
  ui.drum = {
    bpm: 120,
    setBpm(v) {
      this.bpm = v;
    }
  };
  ui.arp = { syncMode: 'internal', setExternalTempo: (v) => reported.push(v), setBpm() {} };
  ui.setTempo(128);
  assert.deepEqual(reported, [128]);
});

test('presets saved before delay sync load free time and sound as before', async () => {
  const sub1 = createLiveEngine('presets.js');
  const fm = await createLiveFmEngine();
  const cases = [
    [sub1.engine, sub1.context.SYNTH_INIT_PRESET],
    [fm.engine, fm.context.FM_INIT_PRESET]
  ];
  for (const [engine, init] of cases) {
    engine.setDelaySync(true);
    engine.setDelayDivision('1/2');
    engine.loadPresetState({ fx: { delay: { time: 0.4, feedback: 0.3, mix: 0.5 } } }, init.state);
    assert.equal(engine.fx.delay.sync, false);
    assert.equal(engine.fx.delay.division, '1/8');
    assertClose(lineTargets(engine.fxChain.delay)[0], 0.4);
    assert.deepEqual(
      JSON.parse(JSON.stringify(engine.getPresetState().fx.delay)),
      { time: 0.4, sync: false, division: '1/8', feedback: 0.3, mix: 0.5 },
      'the clock tempo is not saved'
    );
  }
});

test('the mod matrix keeps modulating the synced delay time across tempo changes', () => {
  const { engine } = createLiveEngine();
  engine.setModSlot('slot1', 'source', 'lfo1');
  engine.setModSlot('slot1', 'dest', 'delayTime');
  engine.setModSlot('slot1', 'amount', 0.4);
  engine.setDelaySync(true);
  engine.setClockTempo(140);
  const gain = engine.fxModMatrix.gains[0];
  const { delay } = engine.fxChain;
  assert.ok(gain.connections.includes(delay.delayL.delayTime));
  assert.ok(gain.connections.includes(delay.delayR.delayTime));
  assertClose(lineTargets(delay)[0], 60 / 140 / 2);
});

test('the NOTE knob offers exactly the delay divisions and reads them as note values', () => {
  const html = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'index.html'), 'utf8');
  const values = /data-param="fx-delay-division" data-values="([^"]+)"/.exec(html);
  assert.ok(values);
  assert.deepEqual(values[1].split(','), Array.from(Delay.DIVISIONS));
  const { KnobScale } = loadScripts('knob-scale.js');
  assert.equal(KnobScale.formatReadout('note', '1/8'), '1/8');
  assert.equal(KnobScale.formatReadout('note', '1/8d'), '1/8.');
  assert.equal(KnobScale.formatReadout('note', '1/16t'), '1/16T');
});
