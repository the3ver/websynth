/**
 * DomUtils.installMultiTouchTaps (js/dom-utils.js): browsers fire no click for a tap while another finger is
 * down, so a button tapped with a key held would do nothing. Such a tap becomes a click; a lone tap keeps the
 * browser's own click.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadScriptsWith } = require('./helpers/load-browser-script');

function setup() {
  const listeners = {};
  const { DomUtils } = loadScriptsWith(
    { addEventListener: (type, fn) => (listeners[type] = fn), document: {} },
    'dom-utils.js'
  );
  DomUtils.installMultiTouchTaps();
  const clicks = [];
  const button = { click: () => clicks.push('tab') };
  const label = { click: () => clicks.push('glide') };
  // Touch targets inside the button (e.g. its label span) or inside a <label> toggle (GLIDE)
  const matches = (selector, tag) => selector.split(',').some((part) => part.trim() === tag);
  const onButton = { closest: (sel) => (matches(sel, 'button') ? button : null) };
  const onLabel = { closest: (sel) => (matches(sel, 'label') ? label : null) };
  const onKey = { closest: () => null };
  let prevented = 0;
  const fire = (type, touches, changed) =>
    listeners[type]({ touches, changedTouches: changed, preventDefault: () => prevented++ });
  return { fire, clicks, prevented: () => prevented, onButton, onLabel, onKey };
}

const finger = (identifier, target, x = 10, y = 10) => ({ identifier, target, clientX: x, clientY: y });

test('a tab tapped while a key is held clicks once, the browser click is cancelled', () => {
  const { fire, clicks, prevented, onButton, onKey } = setup();
  const key = finger(1, onKey);
  const tab = finger(2, onButton);
  fire('touchstart', [key], [key]);
  fire('touchstart', [key, tab], [tab]);
  fire('touchend', [key], [tab]);
  assert.deepEqual(clicks, ['tab']);
  assert.equal(prevented(), 1);
});

test('the tap still clicks when the key is let go first', () => {
  const { fire, clicks, onButton, onKey } = setup();
  const key = finger(1, onKey);
  const tab = finger(2, onButton);
  fire('touchstart', [tab], [tab]);
  fire('touchstart', [tab, key], [key]);
  fire('touchend', [tab], [key]);
  fire('touchend', [], [tab]);
  assert.deepEqual(clicks, ['tab']);
});

test('a lone tap keeps the browser click, nothing is added', () => {
  const { fire, clicks, prevented, onButton } = setup();
  const tab = finger(2, onButton);
  fire('touchstart', [tab], [tab]);
  fire('touchend', [], [tab]);
  assert.deepEqual(clicks, []);
  assert.equal(prevented(), 0);
});

test('a finger that slides away from the button is no tap', () => {
  const { fire, clicks, onButton, onKey } = setup();
  const key = finger(1, onKey);
  fire('touchstart', [key], [key]);
  const tab = finger(2, onButton);
  fire('touchstart', [key, tab], [tab]);
  fire('touchmove', [key, finger(2, onButton, 40, 10)], [finger(2, onButton, 40, 10)]);
  fire('touchend', [key], [finger(2, onButton, 40, 10)]);
  assert.deepEqual(clicks, []);
});

test('a cancelled tap does not click when a later key finger reuses its identifier', () => {
  const { fire, clicks, onButton, onKey } = setup();
  const key = finger(1, onKey);
  fire('touchstart', [key], [key]);
  fire('touchstart', [key, finger(2, onButton)], [finger(2, onButton)]);
  fire('touchcancel', [key], [finger(2, onButton)]);
  fire('touchstart', [key, finger(2, onKey)], [finger(2, onKey)]);
  fire('touchend', [key], [finger(2, onKey)]);
  assert.deepEqual(clicks, []);
});

test('a tap whose touchend never arrived (button removed from the page) is forgotten', () => {
  const { fire, clicks, onButton, onKey } = setup();
  const key = finger(1, onKey);
  fire('touchstart', [key], [key]);
  fire('touchstart', [key, finger(0, onButton)], [finger(0, onButton)]);
  fire('touchend', [], [key]);
  // New gesture: the browser reuses identifier 0 for a finger on a key
  fire('touchstart', [finger(0, onKey)], [finger(0, onKey)]);
  fire('touchend', [], [finger(0, onKey)]);
  assert.deepEqual(clicks, []);
});

test('a toggle in a <label> (GLIDE) also switches while a key is held', () => {
  const { fire, clicks, onLabel, onKey } = setup();
  const key = finger(1, onKey);
  fire('touchstart', [key], [key]);
  fire('touchstart', [key, finger(2, onLabel)], [finger(2, onLabel)]);
  fire('touchend', [key], [finger(2, onLabel)]);
  assert.deepEqual(clicks, ['glide']);
});

test('Safari pinch gesture events are cancelled globally so two-hand playing does not zoom', () => {
  const { fire, prevented } = setup();
  fire('gesturestart', [], []);
  fire('gesturechange', [], []);
  assert.equal(prevented(), 2);
});

test('the Drum Rack drawer tab is a <button>, so it opens while a key is held (#39)', () => {
  const html = require('fs').readFileSync(require('path').join(__dirname, '..', 'index.html'), 'utf8');
  assert.match(html, /<button[^>]*\bid="drumDrawerTab"/);
});
