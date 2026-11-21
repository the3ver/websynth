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
    assert.deepEqual(events, [
      ['on', 60, 1],
      ['off', 60]
    ]);
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
    const { engine } = setupRouted();
    const played = [];
    const noteOn = engine.noteOn.bind(engine);
    engine.noteOn = (note, velocity) => {
      played.push(velocity);
      noteOn(note, velocity);
    };
    midi(engine, 0x90, 60, 64);
    assert.deepEqual(played, [64 / 127]);
  });
});

const { loadScriptsWith } = require('./helpers/load-browser-script');
const { FakeAudioContext, FakeAudioWorkletNode } = require('./helpers/fake-audio-context');
const { ENGINE_SCRIPTS } = require('./helpers/synth-engine');

// MIDIInput stand-in: addEventListener like the spec, onmidimessage like older polyfills
class FakeMidiInput {
  constructor(id) {
    this.id = id;
    this.listeners = [];
    this.onmidimessage = null;
  }
  addEventListener(type, fn) {
    if (type === 'midimessage' && !this.listeners.includes(fn)) this.listeners.push(fn);
  }
  // Delivers one event to both mechanisms, as the Web MIDI shims do
  emit(...data) {
    const event = { data };
    for (const fn of this.listeners) fn(event);
    if (this.onmidimessage) this.onmidimessage(event);
  }
}

/**
 * SUB-1 engine (no AudioContext yet) on a page whose navigator has the given requestMIDIAccess
 */
function setupMidiPage(requestMIDIAccess) {
  const timeouts = [];
  const navigator = requestMIDIAccess === undefined ? {} : { requestMIDIAccess };
  const context = loadScriptsWith(
    {
      AudioContext: FakeAudioContext,
      AudioWorkletNode: FakeAudioWorkletNode,
      navigator,
      setTimeout: (fn, ms) => {
        timeouts.push({ fn, ms });
        return timeouts.length;
      }
    },
    ...ENGINE_SCRIPTS
  );
  const engine = new context.AudioEngine();
  const states = [];
  engine.onMidiStateChange = (s) => states.push({ state: s.state, count: s.count });
  return { engine, states, timeouts };
}

function fakeAccess(...inputs) {
  return { inputs: new Map(inputs.map((input) => [input.id, input])), onstatechange: null };
}

describe('MIDI access at page load', () => {
  test('initMidi asks for MIDI without an AudioContext, starting audio does not ask again', async () => {
    let calls = 0;
    const access = fakeAccess(new FakeMidiInput('keystep'));
    const { engine, states } = setupMidiPage(async () => {
      calls++;
      return access;
    });
    await engine.initMidi();
    assert.equal(engine.ctx, null);
    assert.equal(calls, 1);
    assert.deepEqual(states.at(-1), { state: 'connected', count: 1 });
    engine.initAudio();
    await Promise.resolve();
    assert.equal(calls, 1);
  });

  test('a note before the audio start starts the audio and sounds', async () => {
    const input = new FakeMidiInput('keystep');
    const { engine } = setupMidiPage(async () => fakeAccess(input));
    await engine.initMidi();
    input.emit(0x90, 60, 100);
    assert.notEqual(engine.ctx, null);
    assert.deepEqual(Array.from(engine.activeVoices.keys()), [60]);
  });

  test('a note for the arpeggiator also starts the audio', async () => {
    const input = new FakeMidiInput('keystep');
    const { engine } = setupMidiPage(async () => fakeAccess(input));
    const notes = [];
    engine.midiNotes = { noteOn: (n) => notes.push(n), noteOff() {} };
    await engine.initMidi();
    input.emit(0x90, 60, 100);
    assert.deepEqual(notes, [60]);
    assert.notEqual(engine.ctx, null);
  });

  test('a rejected request shows state error', async () => {
    const { engine, states } = setupMidiPage(async () => {
      throw new Error('SecurityError');
    });
    await engine.initMidi();
    assert.deepEqual(states.at(-1), { state: 'error', count: 0 });
  });

  test('a browser without requestMIDIAccess shows state unsupported', async () => {
    const { engine, states } = setupMidiPage(undefined);
    await engine.initMidi();
    assert.deepEqual(states.at(-1), { state: 'unsupported', count: 0 });
  });
});

describe('MIDI input registration', () => {
  test('an input that only fires midimessage listeners reaches the voices', async () => {
    const input = new FakeMidiInput('keystep');
    input.emit = function (...data) {
      for (const fn of this.listeners) fn({ data });
    };
    const { engine } = setupMidiPage(async () => fakeAccess(input));
    await engine.initMidi();
    input.emit(0x90, 60, 100);
    assert.deepEqual(Array.from(engine.activeVoices.keys()), [60]);
  });

  test('an event delivered to listener and onmidimessage plays once, repeated scans add no listener', async () => {
    const input = new FakeMidiInput('keystep');
    const access = fakeAccess(input);
    const { engine } = setupMidiPage(async () => access);
    await engine.initMidi();
    access.onstatechange();
    access.onstatechange();
    assert.equal(input.listeners.length, 1);
    const notes = [];
    engine.midiNotes = { noteOn: (n) => notes.push(n), noteOff() {} };
    input.emit(0x90, 60, 100);
    assert.deepEqual(notes, [60]);
  });

  test('inputs that appear without statechange are found by the rescans after 500 ms and 2 s', async () => {
    const access = fakeAccess();
    const { engine, states, timeouts } = setupMidiPage(async () => access);
    await engine.initMidi();
    assert.deepEqual(
      timeouts.map((t) => t.ms),
      [500, 2000]
    );
    assert.deepEqual(states.at(-1), { state: 'standby', count: 0 });
    const input = new FakeMidiInput('keystep');
    access.inputs.set(input.id, input);
    timeouts[0].fn();
    assert.deepEqual(states.at(-1), { state: 'connected', count: 1 });
    timeouts[1].fn();
    input.emit(0x90, 60, 100);
    assert.deepEqual(Array.from(engine.activeVoices.keys()), [60]);
  });
});

describe('MIDI message parsing', () => {
  function recordingEngine() {
    const { engine } = createLiveEngine();
    const events = [];
    engine.midiNotes = {
      noteOn: (note) => events.push(['on', note]),
      noteOff: (note) => events.push(['off', note])
    };
    return { engine, events };
  }

  test('data as a plain Array and as Uint8Array', () => {
    const { engine, events } = recordingEngine();
    engine.handleMidiMessage({ data: [0x91, 60, 100] });
    engine.handleMidiMessage({ data: new Uint8Array([0x81, 60, 0]) });
    assert.deepEqual(events, [
      ['on', 60],
      ['off', 60]
    ]);
  });

  test('running status inside one packet and across packets', () => {
    const { engine, events } = recordingEngine();
    engine.handleMidiMessage({ data: [0x9e, 60, 100, 64, 100] });
    engine.handleMidiMessage({ data: [67, 100] });
    engine.handleMidiMessage({ data: [60, 0] });
    assert.deepEqual(events, [
      ['on', 60],
      ['on', 64],
      ['on', 67],
      ['off', 60]
    ]);
  });

  test('realtime bytes (clock) between data bytes are skipped', () => {
    const { engine, events } = recordingEngine();
    engine.handleMidiMessage({ data: [0xf8] });
    engine.handleMidiMessage({ data: [0x90, 0xf8, 62, 90] });
    assert.deepEqual(events, [['on', 62]]);
  });
});
