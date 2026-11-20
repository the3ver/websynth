/**
 * Tab labels stay on one line: the tab buttons have a fixed height, a second line would spill out.
 * The narrowest module tabs measured 34px (FX rack at 1180px), which holds about 7 characters.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.resolve(__dirname, '..', 'index.html'), 'utf8');
const css = fs.readFileSync(path.resolve(__dirname, '..', 'css', 'style.css'), 'utf8');
const MAX_MODULE_TAB_CHARS = 7;

const label = (inner) => inner.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();

test('module tab labels are short enough for one line', () => {
  const tabs = Array.from(html.matchAll(/<button class="env-tab-btn[^"]*"[^>]*>([\s\S]*?)<\/button>/g), (m) => label(m[1]));
  assert.equal(tabs.length, 16, "OSC 3, LFO 2, ENV 3 + FM 4, FX 4");
  const long = tabs.filter((t) => t.length > MAX_MODULE_TAB_CHARS);
  assert.deepEqual(long, []);
});

test('tab buttons never wrap their label', () => {
  for (const selector of ['.env-tab-btn', '.mobile-tab-btn']) {
    const start = css.indexOf(`${selector} {`);
    assert.ok(start >= 0, selector);
    assert.match(css.slice(start, css.indexOf('}', start)), /white-space:\s*nowrap/, selector);
  }
});
