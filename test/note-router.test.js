const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { loadScripts } = require('./helpers/load-browser-script');

// Engine stand-in: records note events and which notes sound
function createEngine() {
  return {
    events: [],
    sounding: new Set(),
    noteOn(midi) {
      this.events.push(`on ${midi}`);
      this.sounding.add(midi);
    },
    noteOff(midi) {
      this.events.push(`off ${midi}`);
      this.sounding.delete(midi);
    },
    allNotesOff() {
      this.events.push('all off');
      this.sounding.clear();
    }
  };
}

function setup() {
  const { ArpEngine, NoteRouter } = loadScripts('arp-engine.js', 'note-router.js');
  const engine = createEngine();
  const arp = new ArpEngine(engine);
  // No audio context in the sandbox: the arp clock stays off
  arp.startClock = () => {};
  const router = new NoteRouter(engine, arp);
  return { engine, arp, router };
}

const sounding = (engine) => Array.from(engine.sounding).sort((a, b) => a - b);

describe('NoteRouter without arpeggiator', () => {
  test('keys play and release voices directly', () => {
    const { engine, router } = setup();
    router.playNote(60);
    router.playNote(64);
    router.stopNote(60);
    assert.deepEqual(engine.events, ['on 60', 'on 64', 'off 60']);
  });
});

describe('NoteRouter with arpeggiator', () => {
  test('keys go to the arpeggiator, not to the voices', () => {
    const { engine, arp, router } = setup();
    router.setArpEnabled(true);
    router.playNote(60);
    router.playNote(64);
    assert.deepEqual(Array.from(arp.heldKeys), [60, 64]);
    assert.deepEqual(sounding(engine), []);
  });

  test('switching the arp off silences it', () => {
    const { engine, router } = setup();
    router.setArpEnabled(true);
    router.playNote(60);
    router.setArpEnabled(false);
    assert.equal(engine.events.at(-1), 'all off');
  });
});

describe('NoteRouter latch without arpeggiator', () => {
  test('latched notes keep sounding after release', () => {
    const { engine, router } = setup();
    router.setLatch(true);
    router.playNote(60);
    router.playNote(64);
    router.stopNote(60);
    router.stopNote(64);
    assert.deepEqual(sounding(engine), [60, 64]);
  });

  test('a new chord after release replaces the latched one', () => {
    const { engine, router } = setup();
    router.setLatch(true);
    router.playNote(60);
    router.playNote(64);
    router.stopNote(60);
    router.stopNote(64);
    router.playNote(62);
    assert.deepEqual(sounding(engine), [62]);
  });

  test('re-pressing a latched note alone keeps only that note', () => {
    const { engine, router } = setup();
    router.setLatch(true);
    router.playNote(60);
    router.playNote(64);
    router.stopNote(60);
    router.stopNote(64);
    router.playNote(60);
    assert.deepEqual(sounding(engine), [60]);
  });

  test('switching latch off releases the latched notes', () => {
    const { engine, router } = setup();
    router.setLatch(true);
    router.playNote(60);
    router.stopNote(60);
    router.setLatch(false);
    assert.deepEqual(sounding(engine), []);
  });

  test('switching latch off keeps notes that are still held', () => {
    const { engine, router } = setup();
    router.playNote(60);
    router.setLatch(true);
    router.setLatch(false);
    assert.deepEqual(sounding(engine), [60]);
  });

  test('enabling latch while keys are held latches them', () => {
    const { engine, router } = setup();
    router.playNote(60);
    router.playNote(67);
    router.setLatch(true);
    router.stopNote(60);
    router.stopNote(67);
    assert.deepEqual(sounding(engine), [60, 67]);
  });

  test('releasing the last key without latch only stops that key', () => {
    const { engine, router } = setup();
    engine.noteOn(40); // e.g. a note from a MIDI controller
    router.playNote(60);
    router.stopNote(60);
    assert.deepEqual(sounding(engine), [40]);
  });

  test('releaseLatch drops the latched chord but keeps latch on', () => {
    const { engine, arp, router } = setup();
    router.setLatch(true);
    router.playNote(60);
    router.stopNote(60);
    router.releaseLatch();
    assert.deepEqual(sounding(engine), []);
    assert.equal(arp.latch, true);
  });

  test('reports the latched notes for the keybed lights', () => {
    const { router } = setup();
    const reports = [];
    router.onLatchedChange = (notes) => reports.push(Array.from(notes));
    router.setLatch(true);
    router.playNote(60);
    router.stopNote(60);
    router.setLatch(false);
    assert.deepEqual(reports.at(-2), [60]);
    assert.deepEqual(reports.at(-1), []);
  });
});

describe('NoteRouter latch across arp switching', () => {
  test('arp on takes over the latched chord and silences the direct voices', () => {
    const { engine, arp, router } = setup();
    router.setLatch(true);
    router.playNote(60);
    router.playNote(64);
    router.stopNote(60);
    router.stopNote(64);
    router.setArpEnabled(true);
    assert.deepEqual(sounding(engine), []);
    assert.deepEqual(Array.from(arp.currentSequence), [60, 64]);
  });

  test('arp off with latch plays the latched chord directly', () => {
    const { engine, router } = setup();
    router.setArpEnabled(true);
    router.setLatch(true);
    router.playNote(60);
    router.playNote(64);
    router.stopNote(60);
    router.stopNote(64);
    router.setArpEnabled(false);
    assert.deepEqual(sounding(engine), [60, 64]);
  });

  test('arp off without latch leaves silence', () => {
    const { engine, router } = setup();
    router.setArpEnabled(true);
    router.playNote(60);
    router.stopNote(60);
    router.setArpEnabled(false);
    assert.deepEqual(sounding(engine), []);
  });
});
