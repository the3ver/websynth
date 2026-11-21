/**
 * DragController (js/controls.js): one knob, fader or wheel follows the finger that touched it,
 * while other fingers hold keys on the keybed.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadScriptsWith } = require('./helpers/load-browser-script');

function setup() {
  const windowListeners = {};
  const { DragController } = loadScriptsWith(
    {
      document: { getElementById: () => null, body: { style: {} } },
      addEventListener: (type, fn) => (windowListeners[type] = fn)
    },
    'knob-scale.js',
    'controls.js'
  );
  const calls = [];
  // A control on an element; touches whose target is that element count as "on" it
  const control = (name) => {
    const listeners = {};
    const el = { addEventListener: (type, fn) => (listeners[type] = fn), contains: (t) => t === el };
    DragController.bind(el, {
      dragStart: (y) => calls.push(`${name} start ${y}`),
      dragMove: (y) => calls.push(`${name} move ${y}`),
      dragEnd: () => calls.push(`${name} end`)
    });
    return { el, listeners };
  };
  const knob = control('knob');
  const event = (touches, changed) => ({ touches, changedTouches: changed, preventDefault() {}, clientY: 0 });
  return { elListeners: knob.listeners, knobEl: knob.el, control, windowListeners, calls, event };
}

// A finger on a key and a finger on the knob
const key = { identifier: 1, clientY: 500, target: 'key' };
let knobTarget = null;
const knobAt = (clientY) => ({ identifier: 2, clientY, target: knobTarget });

test('a knob touched while a key is held follows its own finger, not the key finger', () => {
  const { elListeners, knobEl, windowListeners, calls, event } = setup();
  knobTarget = knobEl;
  elListeners.touchstart(event([key, knobAt(100)], [knobAt(100)]));
  windowListeners.touchmove(event([key, knobAt(80)], [knobAt(80)]));
  assert.deepEqual(calls, ['knob start 100', 'knob move 80']);
});

test('releasing the key finger keeps the knob drag, releasing the knob finger ends it', () => {
  const { elListeners, knobEl, windowListeners, calls, event } = setup();
  knobTarget = knobEl;
  elListeners.touchstart(event([knobAt(100)], [knobAt(100)]));
  windowListeners.touchend(event([knobAt(100)], [key]));
  windowListeners.touchmove(event([knobAt(90)], [knobAt(90)]));
  windowListeners.touchend(event([], [knobAt(90)]));
  windowListeners.touchmove(event([key], [key]));
  assert.deepEqual(calls, ['knob start 100', 'knob move 90', 'knob end']);
});

test('a system gesture (touchcancel) ends the drag of its finger', () => {
  const { elListeners, knobEl, windowListeners, calls, event } = setup();
  knobTarget = knobEl;
  elListeners.touchstart(event([knobAt(100)], [knobAt(100)]));
  windowListeners.touchcancel(event([], [knobAt(100)]));
  assert.deepEqual(calls, ['knob start 100', 'knob end']);
});

test('the knob takes the finger that landed on it when two fingers land at once', () => {
  const { elListeners, knobEl, windowListeners, calls, event } = setup();
  knobTarget = knobEl;
  elListeners.touchstart(event([key, knobAt(100)], [key, knobAt(100)]));
  windowListeners.touchmove(event([key, knobAt(70)], [key, knobAt(70)]));
  assert.deepEqual(calls, ['knob start 100', 'knob move 70']);
});

test('touching a second control ends the first drag, so a pitch wheel springs back', () => {
  const { elListeners, knobEl, control, windowListeners, calls, event } = setup();
  const wheel = control('wheel');
  const wheelFinger = { identifier: 3, clientY: 300, target: wheel.el };
  wheel.listeners.touchstart(event([wheelFinger], [wheelFinger]));
  knobTarget = knobEl;
  elListeners.touchstart(event([wheelFinger, knobAt(100)], [knobAt(100)]));
  windowListeners.touchend(event([knobAt(100)], [wheelFinger]));
  assert.deepEqual(calls, ['wheel start 300', 'wheel end', 'knob start 100']);
});

test('mouse events do not steer or end a touch drag (compatibility events after a key tap)', () => {
  const { elListeners, knobEl, windowListeners, calls, event } = setup();
  knobTarget = knobEl;
  elListeners.touchstart(event([knobAt(100)], [knobAt(100)]));
  windowListeners.mousemove({ clientY: 500, shiftKey: false });
  windowListeners.mouseup({});
  windowListeners.touchmove(event([knobAt(90)], [knobAt(90)]));
  assert.deepEqual(calls, ['knob start 100', 'knob move 90']);
});

test('a mouse drag after a touch drag follows the mouse', () => {
  const { elListeners, knobEl, windowListeners, calls, event } = setup();
  knobTarget = knobEl;
  elListeners.touchstart(event([knobAt(100)], [knobAt(100)]));
  windowListeners.touchend(event([], [knobAt(100)]));
  elListeners.mousedown({ clientY: 40, preventDefault() {} });
  windowListeners.mousemove({ clientY: 30, shiftKey: false });
  windowListeners.mouseup({});
  assert.deepEqual(calls, ['knob start 100', 'knob end', 'knob start 40', 'knob move 30', 'knob end']);
});
