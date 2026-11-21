#!/usr/bin/env node
/**
 * Layout check in a real browser (Playwright headless, Chromium by default, CI also Firefox): every synth at every screen size of the
 * screenshot suite. Fails on page errors, header controls outside the viewport, hidden must-have controls,
 * labels that wrap onto a second line or overflow their box (all tab pages clicked through), FX pages wider than the rack.
 * Green: one line "LAYOUT OK: ...". Red: one line per finding, exit 1.
 * Usage: npm run layout [-- --browser firefox] [-- --only sub1@360x780]
 * Proven on the states before 9750125, 01f33c8, c5358da and ded2747: each of those layout bugs fails it.
 */
const { createServer } = require('./serve');

const SYNTHS = ['sub1', 'fm'];
const VIEWPORTS = [
  [1440, 920],
  [1024, 768],
  [750, 1334],
  [360, 780],
  [844, 390]
];
const MUST_SHOW = ['#synthSelect', '#mainPowerBtn', '#hardRefreshBtn'];
// Text that must stay on one line: buttons, tabs, module and section titles, control labels
const ONE_LINE = [
  '.synth-chassis button',
  '.modular-control-surface button',
  '.module-title > span',
  '.knob-label-text',
  '.fader-label-text',
  '.vco-section-header > span',
  '.fx-subpanel-title > span',
  '.mini-switch-label',
  '.preset-action-group button',
  '.mobile-tab-btn',
  '.env-tab-btn'
];
const TAB_GROUPS = ['oscTabGroup', 'lfoTabGroup', 'envTabGroup', 'fxTabGroup'];

/** Runs inside the page; returns findings as strings. Must not use anything from this module's scope. */
function probe({ mustShow, oneLine, tabGroups }) {
  const findings = [];
  const vw = window.innerWidth;
  const shown = (el) => el && el.offsetParent !== null && el.getBoundingClientRect().width > 0;
  const label = (el) => el.id || el.textContent.replace(/\s+/g, ' ').trim().slice(0, 40) || el.className;
  // One entry per finding; the tab state in [...] only says where it was seen first
  const seen = new Set();
  const add = (f, state = '') => seen.has(f) || (seen.add(f), findings.push(f + state));

  for (const sel of mustShow) if (!shown(document.querySelector(sel))) add(`${sel} not visible`);

  const header = document.querySelector('.studio-header');
  for (const el of header ? header.querySelectorAll('button, select') : []) {
    if (!shown(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.left < -1 || r.right > vw + 1)
      add(`header ${label(el)} outside viewport (${Math.round(r.left)}..${Math.round(r.right)} of ${vw})`);
  }

  // Text lines of an element: client rects of its text nodes, tops closer than 4px are one line
  const lines = (el) => {
    const tops = [];
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let t = walker.nextNode(); t; t = walker.nextNode()) {
      if (!t.textContent.trim()) continue;
      const range = document.createRange();
      range.selectNodeContents(t);
      for (const r of range.getClientRects())
        if (r.width > 0 && !tops.some((top) => Math.abs(top - r.top) < 4)) tops.push(r.top);
    }
    return tops.length;
  };
  const checkLabels = (state) => {
    for (const el of document.querySelectorAll(oneLine.join(', '))) {
      if (!shown(el)) continue;
      const n = lines(el);
      // Height gets 2px slack: Firefox rounds line-height: normal up (INT CLK 18/20); wraps are caught by the line count
      const over = el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 2;
      if (n > 1) add(`"${label(el)}" wraps onto ${n} lines`, state);
      else if (over)
        add(
          `"${label(el)}" overflows its box (${el.clientWidth}/${el.scrollWidth} x ${el.clientHeight}/${el.scrollHeight})`,
          state
        );
    }
  };
  // FM-4 algorithm module in the 6-column desktop grid: hardly wider than its fixed-size display
  const algDisplay = document.querySelector('.fm-alg-display');
  const surface = document.querySelector('.modular-control-surface');
  const grid = surface && getComputedStyle(surface).display === 'grid';
  const columns = grid ? getComputedStyle(surface).gridTemplateColumns.split(' ').length : 0;
  if (shown(algDisplay) && columns === 6) {
    const bay = algDisplay.closest('.module-bay');
    const dw = algDisplay.getBoundingClientRect().width;
    const bw = bay.getBoundingClientRect().width;
    if (bw > dw + 20) add(`FM algorithm module ${Math.round(bw)}px wide for a ${Math.round(dw)}px display (max +20)`);
    for (const row of bay.querySelectorAll('.filter-mode-row')) {
      const rw = row.getBoundingClientRect().width;
      if (rw > dw + 1) add(`FM algorithm buttons ${Math.round(rw)}px wide, wider than the ${Math.round(dw)}px display`);
    }
  }

  checkLabels('');
  for (const group of tabGroups) {
    for (const tab of document.querySelectorAll(`#${group} .env-tab-btn`)) {
      if (!shown(tab)) continue;
      tab.click();
      checkLabels(` [tab ${tab.textContent.trim()}]`);
      const page = group === 'fxTabGroup' && document.querySelector('.fx-page.active');
      if (page && page.scrollWidth > page.clientWidth + 1)
        add(`FX page ${tab.textContent.trim()} wider than the rack (${page.clientWidth}/${page.scrollWidth})`);
    }
  }
  return findings;
}

async function checkPage(browser, base, synth, [width, height]) {
  const context = await browser.newContext({ viewport: { width, height }, serviceWorkers: 'block' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (err) => errors.push(`page error: ${err.message}`));
  page.on('console', (msg) => msg.type() === 'error' && errors.push(`console error: ${msg.text()}`));
  try {
    await page.goto(`${base}/?synth=${synth}`, { waitUntil: 'load', timeout: 30000 });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(300);
    const findings = await page.evaluate(probe, { mustShow: MUST_SHOW, oneLine: ONE_LINE, tabGroups: TAB_GROUPS });
    return [...errors, ...findings];
  } finally {
    await context.close();
  }
}

async function main() {
  const args = process.argv.slice(2);
  const opt = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : null);
  const engine = opt('--browser') || 'chromium';
  const only = opt('--only');
  const start = Date.now();
  const { [engine]: browserType } = require('playwright');
  const server = createServer().listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await browserType.launch();
  const failures = [];
  let pages = 0;
  try {
    for (const synth of SYNTHS) {
      for (const vp of VIEWPORTS) {
        const where = `${synth}@${vp[0]}x${vp[1]}`;
        if (only && only !== where) continue;
        pages++;
        for (const f of await checkPage(browser, base, synth, vp)) failures.push(`${where}: ${f}`);
      }
    }
  } finally {
    await browser.close();
    server.close();
  }
  const secs = Math.round((Date.now() - start) / 1000);
  if (failures.length) {
    console.log(`LAYOUT FAILED: ${failures.length} findings on ${pages} pages (${engine}, ${secs}s)`);
    for (const f of failures) console.log(`  ${f}`);
    process.exit(1);
  }
  console.log(`LAYOUT OK: ${SYNTHS.length} synths x ${VIEWPORTS.length} sizes (${pages} pages, ${engine}, ${secs}s)`);
}

if (require.main === module) {
  main().catch((err) => {
    const missing = /Executable doesn't exist/.test(err.message);
    console.log(
      `LAYOUT FAILED: ${missing ? 'browser not installed, run: npx playwright install chromium firefox' : err.message}`
    );
    process.exit(1);
  });
}

module.exports = { SYNTHS, VIEWPORTS, probe };
