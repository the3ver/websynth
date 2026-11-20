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
