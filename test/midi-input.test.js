const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { createLiveEngine } = require('./helpers/synth-engine');

const midi = (engine, ...data) => engine.handleMidiMessage({ data });

describe('MIDI input', () => {
  test('note on and off play the voices by default, on every channel', () => {
    const { engine } = createLiveEngine();
    midi(engine, 0x90, 60, 127); // channel 1
    midi(engine, 0x9f, 64, 64); // channel 16
    assert.deepEqual(Array.from(engine.activeVoices.keys()), [60, 64]);
    midi(engine, 0x80, 60, 0);
    midi(engine, 0x9f, 64, 0); // note on with velocity 0 = note off
    assert.deepEqual(Array.from(engine.activeVoices.keys()), []);
  });

  test('note events go to the midiNotes sink with velocity scaled to 0..1', () => {
    const { engine } = createLiveEngine();
    const events = [];
    engine.midiNotes = {
      noteOn: (note, velocity) => events.push(['on', note, velocity]),
      noteOff: (note) => events.push(['off', note])
    };
    midi(engine, 0x90, 60, 127);
    midi(engine, 0x80, 60, 0);
    assert.deepEqual(events, [['on', 60, 1], ['off', 60]]);
    assert.equal(engine.activeVoices.size, 0);
  });
});

describe('MIDI input through the NoteRouter', () => {
  function setupRouted() {
    const { engine, context } = createLiveEngine('arp-engine.js', 'note-router.js');
    const arp = new context.ArpEngine(engine);
    arp.startClock = () => {};
    const router = new context.NoteRouter(engine, arp);
    engine.midiNotes = {
      noteOn: (note, velocity) => router.playNote(note, velocity),
      noteOff: (note) => router.stopNote(note)
    };
    return { engine, arp, router };
  }

  test('HOLD keeps MIDI notes sounding after note off', () => {
    const { engine, router } = setupRouted();
    router.setLatch(true);
    midi(engine, 0x90, 60, 100);
    midi(engine, 0x80, 60, 0);
    assert.deepEqual(Array.from(engine.activeVoices.keys()), [60]);
  });

  test('with the arp on MIDI notes feed the arpeggiator', () => {
    const { engine, arp, router } = setupRouted();
    router.setArpEnabled(true);
    midi(engine, 0x90, 60, 100);
    midi(engine, 0x90, 67, 100);
    assert.deepEqual(Array.from(arp.heldKeys), [60, 67]);
    assert.equal(engine.activeVoices.size, 0);
  });

  test('velocity reaches the voice when the arp is off', () => {
    const { engine, router } = setupRouted();
    const played = [];
    const noteOn = engine.noteOn.bind(engine);
    engine.noteOn = (note, velocity) => { played.push(velocity); noteOn(note, velocity); };
    midi(engine, 0x90, 60, 64);
    assert.deepEqual(played, [64 / 127]);
  });
});
