/**
 * Computer keyboard on the keybed (js/virtual-keyboard.js): physical key codes (e.code) to notes and octave keys.
 * Key names in the test titles are the labels of a German QWERTZ layout.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadScriptsWith } = require('./helpers/load-browser-script');

function setup() {
  const listeners = {};
  const { VirtualKeyboard } = loadScriptsWith(
    {
      addEventListener: (type, fn) => (listeners[type] = fn),
      requestAnimationFrame: () => 0,
      document: {
        createElement: () => ({ dataset: {}, classList: { add() {} } }),
        // The key under a point plays the MIDI note of its x coordinate
        elementFromPoint: (x) => ({ closest: () => ({ dataset: { note: String(x) } }) })
      }
    },
    'virtual-keyboard.js'
  );
  const events = [];
  const audio = { resumes: 0 };
  const keyboard = new VirtualKeyboard(null, {
    onNoteOn: (note) => events.push(`on ${note}`),
    onNoteOff: (note) => events.push(`off ${note}`),
    onOctaveShift: (delta) => events.push(`octave ${delta}`),
    ensureAudio: () => audio.resumes++
  });
  const key = (code) => {
    listeners.keydown({ code, repeat: false, target: null });
    listeners.keyup({ code, target: null });
  };
  return { key, events, keyboard, audio };
}

test('X shifts the octave up, Y (left of X) shifts it down', () => {
  const { key, events } = setup();
  key('KeyX');
  key('KeyZ');
  assert.deepEqual(events, ['octave 1', 'octave -1']);
});

test('Z (between T and U) plays G#3 and its on-screen key shows Z', () => {
  const { key, events, keyboard } = setup();
  key('KeyY');
  assert.deepEqual(events, ['on 56', 'off 56']);
  keyboard.container = { clientWidth: 0, innerHTML: '', appendChild() {} };
  keyboard.render();
  assert.match(keyboard.keyElements.get(56).innerHTML, /<span class="key-shortcut">Z<\/span>/);
});

test('a finger that started on a knob plays no note when it slides over the keybed', () => {
  const { events, keyboard } = setup();
  const listeners = {};
  const keyEl = {};
  keyboard.container = { addEventListener: (type, fn) => (listeners[type] = fn), contains: (t) => t === keyEl };
  keyboard.initTouch();
  const keyFinger = { identifier: 1, clientX: 60, clientY: 10, target: keyEl };
  const knobFinger = { identifier: 2, clientX: 64, clientY: 10, target: {} };
  listeners.touchstart({ touches: [keyFinger], changedTouches: [keyFinger] });
  listeners.touchmove({ touches: [keyFinger, knobFinger], changedTouches: [keyFinger] });
  listeners.touchend({ touches: [knobFinger], changedTouches: [keyFinger] });
  assert.deepEqual(events, ['on 60', 'off 60']);
});

test('touch events on the keybed prevent Safari pinch-zoom, panning and long-press callout', () => {
  const { keyboard, audio } = setup();
  const listeners = {};
  const opts = {};
  const keyEl = {};
  keyboard.container = {
    addEventListener: (type, fn, o) => {
      listeners[type] = fn;
      opts[type] = o;
    },
    contains: (t) => t === keyEl
  };
  keyboard.initTouch();

  const finger = { identifier: 1, clientX: 60, clientY: 10, target: keyEl };
  let prevented = 0;
  const resumesBefore = {};
  for (const type of ['touchstart', 'touchmove', 'touchend']) {
    assert.equal(opts[type].passive, false);
    resumesBefore[type] = audio.resumes;
    listeners[type]({
      type,
      cancelable: true,
      preventDefault: () => prevented++,
      touches: type === 'touchend' ? [] : [finger],
      changedTouches: [finger]
    });
  }
  assert.equal(prevented, 3);
  // A finger moving on the same key does not resume the audio context on every frame (#40)
  assert.equal(resumesBefore.touchend, resumesBefore.touchmove);
  assert.ok(resumesBefore.touchmove > 0);
});
