const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { loadScripts } = require('./helpers/load-browser-script');

const plain = (value) => JSON.parse(JSON.stringify(value));

function createDrum() {
  const context = loadScripts('drum-kits.js', 'drum-engine.js');
  return { drum: new context.DrumEngine(null), kits: context.DRUM_FACTORY_KITS };
}

// Replaces the DSP trigger methods with recorders: [{ name, args }]
function recordTriggers(drum) {
  const calls = [];
  for (const name of ['triggerKick', 'triggerSnare', 'triggerClosedHat', 'triggerOpenHat', 'triggerClap', 'triggerBass']) {
    drum[name] = (...args) => calls.push({ name, args });
  }
  return calls;
}

function emptyPattern(drum) {
  drum.clearPattern();
}

describe('factory kits', () => {
  test('every kit has 5 drum rows and a bassline of 16 steps', () => {
    const { kits } = createDrum();
    assert.ok(kits.length > 0);
    for (const kit of kits) {
      assert.equal(kit.drums.length, 5, kit.id);
      for (const row of kit.drums) assert.equal(row.length, 16, kit.id);
      assert.equal(kit.bass.length, 16, kit.id);
    }
  });

  test('loadKit copies pattern and params, so edits do not change the kit', () => {
    const { drum, kits } = createDrum();
    const kit = kits[1];
    drum.loadKit(kit.id);
    assert.equal(drum.bpm, kit.bpm);
    assert.deepEqual(plain(drum.patterns.drums), plain(kit.drums));

    drum.toggleStep(0, 0);
    drum.setParam('bd', 'decay', 0.99);
    assert.notDeepEqual(plain(drum.patterns.drums), plain(kit.drums));
    assert.notEqual(kit.params.bd.decay, 0.99);
  });

  test('unknown kit id falls back to the first kit', () => {
    const { drum, kits } = createDrum();
    drum.loadKit('does-not-exist');
    assert.equal(drum.bpm, kits[0].bpm);
  });
});

describe('pattern editing', () => {
  test('drum steps cycle off -> on -> accent -> off', () => {
    const { drum } = createDrum();
    emptyPattern(drum);
    assert.deepEqual([1, 2, 3].map(() => drum.toggleStep(2, 5)), [1, 2, 0]);
    assert.equal(drum.getStepState(2, 5), 0);
  });

  test('bass steps cycle gate -> accent -> off and report the same state', () => {
    const { drum } = createDrum();
    emptyPattern(drum);
    assert.equal(drum.toggleStep(5, 3), 1);
    assert.equal(drum.getStepState(5, 3), 1);
    assert.equal(drum.toggleStep(5, 3), 2);
    assert.equal(drum.getStepState(5, 3), 2);
    assert.equal(drum.toggleStep(5, 3), 0);
    assert.equal(drum.patterns.bass[3].gate, false);
  });

  test('clearPattern silences every track', () => {
    const { drum } = createDrum();
    drum.clearPattern();
    for (let t = 0; t <= 5; t++) {
      for (let s = 0; s < 16; s++) assert.equal(drum.getStepState(t, s), 0);
    }
  });
});

describe('sound parameters', () => {
  test('setParam parses numbers and ignores unknown keys', () => {
    const { drum } = createDrum();
    drum.setParam('sd', 'tune', '210');
    assert.equal(drum.params.sd.tune, 210);
    drum.setParam('sd', 'nope', 1);
    drum.setParam('xx', 'tune', 1);
    assert.equal('nope' in drum.params.sd, false);
  });

  test('toggleBassWave alternates saw and square', () => {
    const { drum } = createDrum();
    drum.setParam('bass', 'wave', 'sawtooth');
    assert.equal(drum.toggleBassWave(), 'square');
    assert.equal(drum.toggleBassWave(), 'sawtooth');
  });
});

describe('scheduleStep', () => {
  function setup() {
    const { drum } = createDrum();
    emptyPattern(drum);
    const calls = recordTriggers(drum);
    drum.patterns.drums[0][0] = 2; // BD accent
    drum.patterns.drums[2][0] = 1; // CH
    drum.patterns.bass[0] = { note: 36, gate: true, accent: true, slide: false };
    return { drum, calls };
  }

  test('triggers every active track with accent flag and track volume', () => {
    const { drum, calls } = setup();
    drum.scheduleStep(0, 1.5);
    assert.deepEqual(plain(calls), [
      { name: 'triggerKick', args: [1.5, true, drum.trackVolumes[0]] },
      { name: 'triggerClosedHat', args: [1.5, false, drum.trackVolumes[2]] },
      { name: 'triggerBass', args: [1.5, 36, true, false, drum.trackVolumes[5]] }
    ]);
  });

  test('muted tracks stay silent', () => {
    const { drum, calls } = setup();
    assert.equal(drum.toggleTrackMute(0), true);
    drum.scheduleStep(0, 0);
    assert.deepEqual(calls.map((c) => c.name), ['triggerClosedHat', 'triggerBass']);
  });

  test('a solo silences every other track', () => {
    const { drum, calls } = setup();
    assert.equal(drum.toggleTrackSolo(5), true);
    drum.scheduleStep(0, 0);
    assert.deepEqual(calls.map((c) => c.name), ['triggerBass']);
  });

  test('sync slaves receive the clock tick with the beat length', () => {
    const { drum } = setup();
    drum.setBpm(120);
    const ticks = [];
    drum.registerSyncSlave({ handleExternalClockTick: (...args) => ticks.push(args) });
    drum.scheduleStep(7, 2);
    assert.deepEqual(ticks, [[7, 2, 0.5]]);
  });
});
