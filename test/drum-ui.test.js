const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadScripts } = require('./helpers/load-browser-script');

const { DrumUI } = loadScripts('drum-ui.js');

test('tap tempo averages the intervals between taps', () => {
  assert.equal(DrumUI.bpmFromTaps([0, 500]), 120);
  assert.equal(DrumUI.bpmFromTaps([0, 500, 1000, 1500]), 120);
  assert.equal(DrumUI.bpmFromTaps([0, 450, 1000, 1500]), 120);
  assert.equal(DrumUI.bpmFromTaps([1000, 1469]), 128);
});

test('tap tempo needs two taps and stays within 40..300 BPM', () => {
  assert.equal(DrumUI.bpmFromTaps([]), null);
  assert.equal(DrumUI.bpmFromTaps([1000]), null);
  assert.equal(DrumUI.bpmFromTaps([0, 100]), null); // 600 BPM
  assert.equal(DrumUI.bpmFromTaps([0, 2000]), null); // 30 BPM
  assert.equal(DrumUI.bpmFromTaps([0, 1500]), 40);
});
