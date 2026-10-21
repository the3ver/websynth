const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { loadScripts } = require('./helpers/load-browser-script');

// No Worker/Blob in the sandbox: ArpEngine falls back to the main-thread timer.
function createArp() {
  const { ArpEngine } = loadScripts('arp-engine.js');
  const audio = { allNotesOff() {} };
  return new ArpEngine(audio);
}

const plain = (value) => JSON.parse(JSON.stringify(value));

function sequenceFor(mode, keys, octaves = 1) {
  const arp = createArp();
  arp.setMode(mode);
  arp.setOctaves(octaves);
  for (const key of keys) arp.handleKeyDown(key);
  return plain(arp.currentSequence);
}

describe('rebuildSequence', () => {
  test('up sorts held notes ascending', () => {
    assert.deepEqual(sequenceFor('up', [67, 60, 64]), [60, 64, 67]);
  });

  test('down sorts held notes descending', () => {
    assert.deepEqual(sequenceFor('down', [67, 60, 64]), [67, 64, 60]);
  });

  test('updown does not repeat the top and bottom note', () => {
    assert.deepEqual(sequenceFor('updown', [60, 64, 67]), [60, 64, 67, 64]);
  });

  test('asplayed keeps press order', () => {
    assert.deepEqual(sequenceFor('asplayed', [67, 60, 64]), [67, 60, 64]);
  });

  test('octave range repeats the chord one octave higher per step', () => {
    assert.deepEqual(sequenceFor('up', [60, 64], 2), [60, 64, 72, 76]);
  });

  test('octave range is clamped to 1..4', () => {
    const arp = createArp();
    arp.setOctaves(9);
    assert.equal(arp.octaves, 4);
    arp.setOctaves(0);
    assert.equal(arp.octaves, 1);
  });

  test('releasing all keys without latch clears the sequence source', () => {
    const arp = createArp();
    arp.handleKeyDown(60);
    arp.handleKeyUp(60);
    assert.deepEqual(plain(arp.heldKeys), []);
  });

  test('latch keeps the last chord after release and replaces it on a new chord', () => {
    const arp = createArp();
    arp.setLatch(true);
    arp.handleKeyDown(60);
    arp.handleKeyDown(64);
    arp.handleKeyUp(60);
    arp.handleKeyUp(64);
    arp.rebuildSequence();
    assert.deepEqual(plain(arp.currentSequence), [60, 64]);

    arp.handleKeyDown(62);
    assert.deepEqual(plain(arp.currentSequence), [62]);
  });

  test('enabling latch while keys are held latches those notes', () => {
    const arp = createArp();
    arp.handleKeyDown(60);
    arp.handleKeyDown(64);
    arp.setLatch(true);
    assert.deepEqual(plain(arp.latchedKeys), [60, 64]);

    arp.handleKeyUp(60);
    arp.handleKeyUp(64);
    arp.rebuildSequence();
    assert.deepEqual(plain(arp.currentSequence), [60, 64]);
  });
});

describe('getStepInterval', () => {
  test('divisions at 120 BPM', () => {
    const arp = createArp();
    arp.setBpm(120);
    const cases = { '1/4': 0.5, '1/8': 0.25, '1/16': 0.125, '1/32': 0.0625, '1/8t': 0.25 * 2 / 3, '1/16t': 0.125 * 2 / 3 };
    for (const [division, expected] of Object.entries(cases)) {
      arp.setDivision(division);
      assert.ok(Math.abs(arp.getStepInterval(0) - expected) < 1e-12, division);
    }
  });

  test('swing lengthens even steps and shortens odd steps by the same amount', () => {
    const arp = createArp();
    arp.setBpm(120);
    arp.setDivision('1/16');
    arp.setSwing(0.5);
    const even = arp.getStepInterval(0);
    const odd = arp.getStepInterval(1);
    assert.ok(even > 0.125 && odd < 0.125);
    assert.ok(Math.abs(even + odd - 0.25) < 1e-12, 'a step pair keeps its total length');
  });

  test('BPM, gate and swing are clamped', () => {
    const arp = createArp();
    arp.setBpm(1000);
    arp.setGate(0);
    arp.setSwing(5);
    assert.equal(arp.bpm, 280);
    assert.equal(arp.gate, 0.1);
    assert.equal(arp.swing, 0.7);
  });
});

describe('sync mode', () => {
  test('toggleSyncMode notifies every listener with the new mode', () => {
    const arp = createArp();
    const seen = [];
    arp.onSyncModeChange((mode) => seen.push(`a:${mode}`));
    arp.onSyncModeChange((mode) => seen.push(`b:${mode}`));
    assert.equal(arp.toggleSyncMode(), 'external');
    assert.equal(arp.toggleSyncMode(), 'internal');
    assert.deepEqual(seen, ['a:external', 'b:external', 'a:internal', 'b:internal']);
  });
});

describe('step matrix', () => {
  test('toggleStep flips a step and ignores out-of-range indices', () => {
    const arp = createArp();
    assert.equal(arp.toggleStep(3), false);
    assert.equal(arp.steps[3], false);
    assert.equal(arp.toggleStep(16), false);
    assert.equal(arp.steps.length, 16);
  });
});
