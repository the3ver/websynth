const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadScripts } = require('./helpers/load-browser-script');

const { SynthBlocks } = loadScripts('lib/voice-pool.js');

function poolOf(voices) {
  const pool = new SynthBlocks.VoicePool();
  for (const v of voices) {
    const voice = { isBusy: false, midiNote: null, startTime: 0, releaseStartTime: 0, choked: null, ...v };
    voice.choke = (now) => {
      voice.choked = now;
    };
    pool.add(voice);
    if (voice.midiNote !== null) pool.assign(voice.midiNote, voice);
  }
  return pool;
}

test('reuses the voice already playing the same note', () => {
  const pool = poolOf([{ isBusy: true, midiNote: 60, startTime: 1 }, {}]);
  assert.equal(pool.allocate(60, 0), pool.voices[0]);
});

test('prefers a free voice', () => {
  const pool = poolOf([{ isBusy: true, midiNote: 60, startTime: 1 }, {}]);
  assert.equal(pool.allocate(62, 0), pool.voices[1]);
});

test('takes the oldest releasing voice before stealing a held one', () => {
  const pool = poolOf([
    { isBusy: true, midiNote: 60, startTime: 1 },
    { isBusy: true, midiNote: 62, startTime: 2, releaseStartTime: 5 },
    { isBusy: true, midiNote: 64, startTime: 3, releaseStartTime: 4 }
  ]);
  assert.equal(pool.allocate(65, 0), pool.voices[2]);
  assert.equal(pool.active.has(64), false);
  assert.equal(pool.voices[2].choked, null, 'releasing voices are not choked');
});

test('steals and chokes the oldest held voice when all are busy (LRU)', () => {
  const pool = poolOf([
    { isBusy: true, midiNote: 60, startTime: 3 },
    { isBusy: true, midiNote: 62, startTime: 1 },
    { isBusy: true, midiNote: 64, startTime: 2 }
  ]);
  assert.equal(pool.allocate(65, 7), pool.voices[1]);
  assert.equal(pool.active.has(62), false);
  assert.equal(pool.voices[1].choked, 7);
});

test('unmap keeps a newer voice that plays the same note', () => {
  const pool = poolOf([
    { isBusy: true, midiNote: 60, startTime: 1, releaseStartTime: 2 },
    { isBusy: true, midiNote: 60, startTime: 3 }
  ]);
  assert.equal(pool.active.get(60), pool.voices[1]);
  pool.unmap(pool.voices[0]);
  assert.equal(pool.active.get(60), pool.voices[1]);
});

test('take removes the note and returns its voice', () => {
  const pool = poolOf([{ isBusy: true, midiNote: 60, startTime: 1 }]);
  assert.equal(pool.take(60), pool.voices[0]);
  assert.equal(pool.active.size, 0);
  assert.equal(pool.take(60), null);
});
