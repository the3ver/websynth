const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const css = fs.readFileSync(path.resolve(__dirname, '..', 'css', 'style.css'), 'utf8');
const app = fs.readFileSync(path.resolve(__dirname, '..', 'js', 'app.js'), 'utf8');
const rule = (selector) => {
  const start = css.indexOf(`${selector} {`);
  assert.ok(start >= 0, `missing rule ${selector}`);
  return css.slice(start, css.indexOf('}', start));
};

test('app.js marks the active synth on <html> for the stylesheet', () => {
  assert.match(app, /document\.documentElement\.dataset\.activeSynth = synth\.id/);
});

test('FM-4 knobs draw a level ring from --knob-ratio, the SUB-1 knobs do not', () => {
  const ring = rule('html[data-active-synth="fm"] .synth-knob-housing::before');
  assert.match(ring, /conic-gradient/);
  assert.match(ring, /var\(--knob-ratio, 0\) \* 270deg/);
  assert.ok(!/^\.synth-knob-housing::before/m.test(css), 'unscoped knob ring');
});

test('every FM-4 theme rule is scoped to the FM-4', () => {
  const start = css.indexOf('FM-4 THEME');
  assert.ok(start >= 0);
  const selectors = css.slice(css.indexOf('*/', start) + 2).match(/^[^\s/@}][^{]*\{/gm) || [];
  assert.ok(selectors.length > 20);
  for (const sel of selectors) {
    for (const part of sel.replace('{', '').split(',')) {
      assert.match(part.trim(), /^html\[data-active-synth="fm"\]/, part);
    }
  }
});
