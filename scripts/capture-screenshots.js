#!/usr/bin/env node
/**
 * Screenshots of the app at the screen sizes of the layout check, via Playwright headless Chromium over HTTP.
 * Default output: scratch/screenshots/ (ignored), so looking at the UI changes no tracked file.
 * --release writes screenshots/ (store screenshots in manifest.webmanifest); --synth fm shoots the FM-4.
 * Usage: npm run capture-screenshots [-- --synth fm] [-- --release]
 */
const fs = require('fs');
const path = require('path');
const { createServer } = require('./serve');

// name, viewport, hash (#drums opens the drum drawer, #synth skips the release notes)
const SHOTS = [
  ['desktop', 1440, 920, '#synth'],
  ['ipad', 1024, 768, '#synth'],
  ['mobile', 750, 1334, '#drums'],
  ['phone-portrait', 360, 780, '#synth'],
  ['phone-full', 360, 1200, '#synth'],
  ['phone-landscape', 844, 390, '#synth']
];

async function main() {
  const args = process.argv.slice(2);
  const release = args.includes('--release');
  const synth = args.includes('--synth') ? args[args.indexOf('--synth') + 1] : 'sub1';
  const outDir = path.join(__dirname, '..', release ? 'screenshots' : path.join('scratch', 'screenshots'));
  fs.mkdirSync(outDir, { recursive: true });

  const { chromium } = require('playwright');
  const server = createServer().listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch();
  const files = [];
  try {
    for (const [name, width, height, hash] of SHOTS) {
      const context = await browser.newContext({ viewport: { width, height }, serviceWorkers: 'block' });
      const page = await context.newPage();
      await page.goto(`${base}/?synth=${synth}${hash}`, { waitUntil: 'load' });
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(500);
      const file = path.join(outDir, `screenshot-${name}${synth === 'sub1' ? '' : `-${synth}`}.png`);
      await page.screenshot({ path: file });
      files.push(path.relative(process.cwd(), file));
      await context.close();
    }
  } finally {
    await browser.close();
    server.close();
  }
  console.log(
    `${files.length} screenshots (${synth}) in ${path.relative(process.cwd(), outDir)}/: ${SHOTS.map((s) => s[0]).join(', ')}`
  );
}

main().catch((err) => {
  console.error(`capture-screenshots: ${err.message}`);
  process.exit(1);
});
