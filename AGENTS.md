# RETROVOX SUB-1 / FM-4 & RETROBEAT D-909

Browser synth studio: two polyphonic synths (subtractive SUB-1, 4-operator FM-4, one per page load via `?synth=sub1|fm`), a drum and 303 bass machine, arpeggiator, Web MIDI, installable PWA. Deployed to GitHub Pages from `main`.

## Principles

- **Native web, no build:** classic scripts in `js/` loaded by `index.html` in dependency order, sharing one global scope; hand-written CSS with custom properties; no frameworks, libraries, bundlers or audio samples.
- **Zero GC audio:** audio nodes are built once per voice or page; notes, knobs and timers only schedule AudioParams.
- **Click-free sound:** parameter changes ramp; the master bus limits and soft-clips.
- **Hardware feel:** 1980s analog hardware look; playing the keys and turning knobs never interrupt each other.

## Before you change something, read

- **Audio, voices, building blocks (`js/lib/`), synth engines, mod matrix, FX rack, drums, file map:** [docs/architecture.md](docs/architecture.md)
- **Layout, CSS media modes, mobile carousel, keybed, pointer and keyboard input:** [docs/ui.md](docs/ui.md)

## Workflow

1. **Check** (needs `npm install` once): `npm run check`. Green is one line `CHECK OK: ...` (~36 s); red prints only the failing step. It runs `node --check`, ESLint, Prettier (JS only), html-validate, the unit tests and the layout check (`npm run layout`: both synths at five screen sizes in headless Chromium). In Claude Code the Stop hook runs it at the end of every turn that changed files and the PostToolUse hook formats every edited JS file. CI runs the same plus Firefox layout and gitleaks; Pages deploys only after it passes.
2. **Tests** (`test/*.test.js`, `node:test`, `npm test` for full TAP output): `test/helpers/load-browser-script.js` loads `js/` files into a `vm` sandbox that doubles as `window`; `createLiveEngine()` (`test/helpers/synth-engine.js`) builds the full audio graph on `FakeAudioContext`, so envelopes, LFO routing and FX are asserted on recorded AudioParam events. Features and behaviour changes need a test; a bugfix starts with a red test.
3. **Look at visual changes:** `npm run capture-screenshots` (add `-- --synth fm` for the FM-4) writes PNGs to `scratch/screenshots/`. `-- --release` overwrites the store screenshots in `screenshots/`, only for a release that changes the look. Manual browser checks: `PORT=3917 node scripts/serve.js` (HTTP; headless Chromium on `file://` skips a script).
4. **Release:** a commit with logic, a feature or a bugfix bumps the patch version with `npm run bump` (all places in `VERSION_LOCATIONS`, `scripts/bump.js`). User-visible changes also get a "NEU in vX" section in `README.md` and a card in the "Was gibt's Neues" modal in `index.html` (German).

## Guards that fail the check

`test/synth-params.test.js` and `test/synth-registry.test.js` (parameter table, init preset, knobs and envelope tabs per synth), `test/sub1-mod-matrix.test.js` (matrix definition vs voice), `test/release-consistency.test.js` (version places, script tags vs `PRECACHE_ASSETS`), `test/inline-scripts.test.js` (only the service worker registration inline), `test/header-css.test.js` and `test/tab-labels.test.js` (header and tab rules), `.htmlvalidate.json` (HTML structure, unique ids), `scripts/layout-check.js` (layout per synth and screen size).
