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
      document: { createElement: () => ({ dataset: {}, classList: { add() {} } }) }
    },
    'virtual-keyboard.js'
  );
  const events = [];
  const keyboard = new VirtualKeyboard(null, {
    onNoteOn: (note) => events.push(`on ${note}`),
    onNoteOff: (note) => events.push(`off ${note}`),
    onOctaveShift: (delta) => events.push(`octave ${delta}`)
  });
  const key = (code) => {
    listeners.keydown({ code, repeat: false, target: null });
    listeners.keyup({ code, target: null });
  };
  return { key, events, keyboard };
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
