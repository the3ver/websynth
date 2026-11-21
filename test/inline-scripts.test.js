/**
 * Inline scripts in the HTML pages: node --check, ESLint and the unit tests only see files in js/.
 * The one exception is the service worker registration in index.html, which PWABuilder detects only inline.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const inlineScripts = (file) =>
  Array.from(fs.readFileSync(path.join(ROOT, file), 'utf8').matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g), (m) => m[1]);

test('index.html runs only the service worker registration inline', () => {
  const scripts = inlineScripts('index.html');
  assert.equal(scripts.length, 1, 'move other inline code into js/');
  assert.match(scripts[0], /navigator\.serviceWorker\.register\('sw\.js'/);
});

test('privacy.html has no inline scripts', () => {
  assert.deepEqual(inlineScripts('privacy.html'), []);
});

test('every inline script parses', () => {
  for (const file of ['index.html', 'privacy.html']) {
    for (const code of inlineScripts(file)) assert.doesNotThrow(() => new vm.Script(code), file);
  }
});
