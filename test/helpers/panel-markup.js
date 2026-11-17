/**
 * Reads index.html and reports which synth each knob and envelope tab belongs to.
 * Elements inside (or carrying) data-synth="<id>" belong to that synth; everything else is shared.
 */
const fs = require('fs');
const path = require('path');

const VOID_TAGS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
const attr = (attrs, name) => {
  const m = attrs.match(new RegExp(`\\s${name}="([^"]*)"`));
  return m ? m[1] : null;
};

function readPanelMarkup() {
  const html = fs.readFileSync(path.resolve(__dirname, '..', '..', 'index.html'), 'utf8');
  const body = html.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<!--[\s\S]*?-->/g, '');
  const stack = [{ tag: 'root', synth: null }];
  const knobs = [];
  const envTabs = [];

  for (const [, closing, tag, attrs] of body.matchAll(/<(\/?)([a-zA-Z][\w-]*)([^>]*)>/g)) {
    const name = tag.toLowerCase();
    if (closing) {
      const idx = stack.map((e) => e.tag).lastIndexOf(name);
      if (idx > 0) stack.length = idx;
      continue;
    }
    const synth = attr(attrs, 'data-synth') || stack[stack.length - 1].synth;
    const cls = attr(attrs, 'class') || '';
    if (cls.split(/\s+/).includes('synth-knob-housing')) knobs.push({ param: attr(attrs, 'data-param'), synth });
    if (cls.split(/\s+/).includes('env-tab-btn') && stack.some((e) => e.id === 'envTabGroup')) {
      envTabs.push({ target: attr(attrs, 'data-target'), synth });
    }
    if (!VOID_TAGS.has(name) && !attrs.trim().endsWith('/')) stack.push({ tag: name, synth, id: attr(attrs, 'id') });
  }
  return { knobs, envTabs };
}

// Knobs a synth shows: its own plus the shared ones
function knobsOf(synthId) {
  return readPanelMarkup().knobs.filter((k) => k.synth === null || k.synth === synthId).map((k) => k.param);
}

module.exports = { readPanelMarkup, knobsOf };
