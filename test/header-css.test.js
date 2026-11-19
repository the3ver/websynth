/**
 * The synth selector in the header must stay visible at every viewport width:
 * no rule in css/style.css (media queries included) may hide it or its header ancestors.
 */
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const css = fs
  .readFileSync(path.resolve(__dirname, '..', 'css', 'style.css'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '');

// Innermost rules only: the braces of @media blocks are skipped by the pattern
const rules = Array.from(css.matchAll(/([^{}]+)\{([^{}]*)\}/g), ([, selectors, body]) => ({
  selectors: selectors.split(',').map((s) => s.trim()),
  body,
}));

// Header chain from index.html: header-left > brand-badge > brand-text > select#synthSelect
const CHAIN = [
  { tag: 'div', id: null, classes: ['header-left'] },
  { tag: 'div', id: null, classes: ['brand-badge'] },
  { tag: 'div', id: null, classes: ['brand-text'] },
  { tag: 'select', id: 'synthSelect', classes: ['brand-model', 'synth-select'] },
];

// Does the last compound of the selector match the element? Pseudo-classes count as no match.
function lastCompoundMatches(selector, el) {
  const compound = selector.split(/[\s>+~]+/).pop();
  if (!compound || compound.includes(':') || compound.includes('[')) return false;
  const tag = compound.match(/^[a-zA-Z][\w-]*/);
  if (tag && tag[0].toLowerCase() !== el.tag) return false;
  const ids = Array.from(compound.matchAll(/#([\w-]+)/g), (m) => m[1]);
  if (ids.some((id) => id !== el.id)) return false;
  const classes = Array.from(compound.matchAll(/\.([\w-]+)/g), (m) => m[1]);
  if (!tag && !ids.length && !classes.length) return false;
  return classes.every((c) => el.classes.includes(c));
}

test('no CSS rule hides the synth selector or its header ancestors', () => {
  const hiding = [];
  for (const { selectors, body } of rules) {
    if (!/display\s*:\s*none/.test(body) && !/visibility\s*:\s*hidden/.test(body)) continue;
    for (const selector of selectors) {
      for (const el of CHAIN) {
        if (lastCompoundMatches(selector, el)) hiding.push(`${selector} hides ${el.id || el.classes.join('.')}`);
      }
    }
  }
  assert.deepStrictEqual(hiding, []);
});
