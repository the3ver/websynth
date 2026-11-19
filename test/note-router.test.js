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
