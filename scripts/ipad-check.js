#!/usr/bin/env node
/**
 * iPad user E2E and ergonomics check in headless WebKit (Playwright): emulates iPad Safari (WebKit, hasTouch,
 * DPR 2) across landscape and portrait iPad viewports for both SUB-1 and FM-4.
 * Verifies: zero console/page errors, zero viewport overflow, touch-action and -webkit-user-select hardening,
 * multi-touch keybed chord + glissando with defaultPrevented, simultaneous key hold + knob drag + tab tap,
 * AudioContext/AudioWorklet loading, portrait carousel tabs, and Drum Rack interaction.
 * Green: one line "IPAD OK: ...". Red: one line per finding, exit 1.
 * Usage: npm run ipad [-- --only sub1@1180x734] [-- --verbose] [-- --browser chromium]
 */
const { createServer } = require('./serve');

const SYNTHS = ['sub1', 'fm'];
const IPAD_PROFILES = [
  { name: 'ipad-air-landscape', width: 1180, height: 734, portrait: false },
  { name: 'ipad-air-portrait', width: 820, height: 1094, portrait: true },
  { name: 'ipad-pro11-landscape', width: 1194, height: 764, portrait: false },
  { name: 'ipad-mini-portrait', width: 768, height: 954, portrait: true }
];

const IPAD_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';

/** Injected before app scripts to observe AudioContext and AudioWorklet lifecycle in WebKit. */
function installAudioObserver() {
  const obs = { contexts: [], worklets: [], shimmed: false };
  window.__ipadAudioObs = obs;
  let OrigAC = window.AudioContext || window.webkitAudioContext;
  // WinCairo Playwright WebKit builds with ENABLE_WEB_AUDIO=OFF; provide a no-op AudioContext so UI/touch flows run
  if (!OrigAC) {
    obs.shimmed = true;
    const makeParam = () => ({
      value: 0,
      setValueAtTime() {},
      linearRampToValueAtTime() {},
      exponentialRampToValueAtTime() {},
      setTargetAtTime() {},
      setValueCurveAtTime() {},
      cancelScheduledValues() {},
      cancelAndHoldAtTime() {}
    });
    const makeNode = () =>
      new Proxy(
        {
          connect() {
            return this;
          },
          disconnect() {},
          start() {},
          stop() {},
          getFloatTimeDomainData(a) {
            a.fill(0);
          },
          getByteTimeDomainData(a) {
            a.fill(128);
          },
          port: { postMessage() {}, onmessage: null },
          parameters: { get: () => makeParam() },
          fftSize: 2048,
          frequencyBinCount: 1024
        },
        {
          get(t, k) {
            return k in t ? t[k] : (t[k] = makeParam());
          }
        }
      );
    window.AudioWorkletNode = function () {
      return makeNode();
    };
    OrigAC = function ShimAudioContext() {
      this.state = 'running';
      this.sampleRate = 48000;
      this.currentTime = 0;
      this.destination = makeNode();
      this.audioWorklet = { addModule: () => Promise.resolve() };
      this.resume = () => {
        this.state = 'running';
        return Promise.resolve();
      };
      this.suspend = () => Promise.resolve();
      this.close = () => Promise.resolve();
      this.addEventListener = () => {};
      this.createBuffer = (ch, len) => ({
        numberOfChannels: ch,
        length: len,
        getChannelData: () => new Float32Array(len)
      });
      for (const m of [
        'createGain',
        'createOscillator',
        'createBiquadFilter',
        'createWaveShaper',
        'createDelay',
        'createConvolver',
        'createDynamicsCompressor',
        'createAnalyser',
        'createStereoPanner',
        'createBufferSource',
        'createConstantSource',
        'createChannelSplitter',
        'createChannelMerger',
        'createPeriodicWave'
      ]) {
        this[m] = () => makeNode();
      }
    };
  }
  function WrappedAudioContext() {
    const ctx = new OrigAC(...arguments);
    obs.contexts.push(ctx);
    if (ctx.audioWorklet && ctx.audioWorklet.addModule) {
      const origAdd = ctx.audioWorklet.addModule.bind(ctx.audioWorklet);
      ctx.audioWorklet.addModule = function (url) {
        const entry = { url: String(url), status: 'pending', error: null, ms: 0 };
        const t0 = performance.now();
        obs.worklets.push(entry);
        return origAdd(...arguments).then(
          (res) => {
            entry.status = 'ok';
            entry.ms = Math.round(performance.now() - t0);
            return res;
          },
          (err) => {
            entry.status = 'error';
            entry.error = String(err);
            entry.ms = Math.round(performance.now() - t0);
            throw err;
          }
        );
      };
    }
    return ctx;
  }
  WrappedAudioContext.prototype = OrigAC.prototype;
  window.AudioContext = WrappedAudioContext;
  if (window.webkitAudioContext) window.webkitAudioContext = WrappedAudioContext;
}

/** Runs inside the iPad WebKit page; executes real touch user flows and returns findings + metrics. */
async function runIpadFlows({ synth, portrait }) {
  const findings = [];
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const shown = (el) => {
    if (!el) return false;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const center = (el) => {
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  };
  const makeTouch = (id, target, x, y) => ({
    identifier: id,
    target,
    clientX: x,
    clientY: y,
    pageX: x,
    pageY: y,
    radiusX: 12,
    radiusY: 12
  });
  const dispatchTouch = (target, type, touches, changedTouches) => {
    const ev = new Event(type, { bubbles: true, cancelable: true });
    Object.defineProperties(ev, {
      touches: { value: touches },
      targetTouches: { value: touches.filter((t) => target.contains && target.contains(t.target)) },
      changedTouches: { value: changedTouches }
    });
    target.dispatchEvent(ev);
    return ev;
  };
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  // Dismiss "What's New" modal if open on first load
  const dismissBtn = document.getElementById('startWithNewVersionBtn');
  if (shown(dismissBtn)) dismissBtn.click();
  await wait(80);

  // 1. Viewport overflow & header controls
  const docEl = document.documentElement;
  if (docEl.scrollWidth > docEl.clientWidth + 1) {
    findings.push(`horizontal overflow (${docEl.scrollWidth} > ${docEl.clientWidth})`);
  }
  if (portrait && docEl.scrollHeight > docEl.clientHeight + 1) {
    findings.push(`portrait vertical overflow (${docEl.scrollHeight} > ${docEl.clientHeight})`);
  }
  for (const sel of ['#synthSelect', '#mainPowerBtn', '#hardRefreshBtn', '#openDrumDrawerBtn']) {
    const el = document.querySelector(sel);
    if (!shown(el)) {
      findings.push(`${sel} not visible`);
      continue;
    }
    const r = el.getBoundingClientRect();
    if (r.left < -1 || r.right > vw + 1) {
      findings.push(`${sel} outside viewport (${Math.round(r.left)}..${Math.round(r.right)} of ${vw})`);
    }
  }

  // 2. Touch-hardening CSS (Safari pinch-zoom / magnifier prevention)
  const keybed = document.getElementById('keyboardContainer');
  if (!shown(keybed)) {
    findings.push('keybed #keyboardContainer not visible');
  } else {
    const kbStyle = getComputedStyle(keybed);
    if (kbStyle.touchAction !== 'none') findings.push(`#keyboardContainer touch-action is "${kbStyle.touchAction}"`);
    const firstKey = keybed.querySelector('.key-white');
    if (firstKey && getComputedStyle(firstKey).webkitUserSelect !== 'none') {
      findings.push('.key-white missing -webkit-user-select: none');
    }
  }
  for (const sel of ['.synth-knob-housing', '.synth-fader-track-housing', '.wheel-housing']) {
    const el = Array.from(document.querySelectorAll(sel)).find(shown);
    if (el && getComputedStyle(el).touchAction !== 'none') {
      findings.push(`${sel} touch-action is "${getComputedStyle(el).touchAction}"`);
    }
  }

  // 3. Multi-touch keybed: 3-finger chord + glissando + release + preventDefault
  const whiteKeys = Array.from(document.querySelectorAll('#keyboardContainer .key-white')).filter(shown);
  if (whiteKeys.length < 8) {
    findings.push(`too few white keys visible (${whiteKeys.length})`);
  } else {
    const k1 = whiteKeys[1];
    const k2 = whiteKeys[3];
    const k3 = whiteKeys[5];
    const k4 = whiteKeys[6];
    const p1 = center(k1);
    const p2 = center(k2);
    const p3 = center(k3);
    const p4 = center(k4);

    const t1 = makeTouch(1, k1, p1.x, p1.y);
    const t2 = makeTouch(2, k2, p2.x, p2.y);
    const t3 = makeTouch(3, k3, p3.x, p3.y);

    const evStart = dispatchTouch(k1, 'touchstart', [t1, t2, t3], [t1, t2, t3]);
    if (!evStart.defaultPrevented) findings.push('keybed touchstart not defaultPrevented (Safari zoom/callout risk)');
    if (!k1.classList.contains('active') || !k2.classList.contains('active') || !k3.classList.contains('active')) {
      findings.push('3-finger chord did not activate all 3 keys');
    }

    // Glissando finger 3 onto k4
    const t3Moved = makeTouch(3, k3, p4.x, p4.y);
    const evMove = dispatchTouch(k3, 'touchmove', [t1, t2, t3Moved], [t3Moved]);
    if (!evMove.defaultPrevented) findings.push('keybed touchmove not defaultPrevented');
    if (k3.classList.contains('active') || !k4.classList.contains('active')) {
      findings.push('keybed glissando failed to move active key');
    }

    const evEnd = dispatchTouch(k1, 'touchend', [], [t1, t2, t3Moved]);
    if (!evEnd.defaultPrevented) findings.push('keybed touchend not defaultPrevented');
    if (document.querySelectorAll('#keyboardContainer .active').length > 0) {
      findings.push('stuck key remained .active after touchend');
    }
    if (window.scrollX !== 0 || window.scrollY !== 0) {
      findings.push(`keybed multi-touch caused window scroll (${window.scrollX}, ${window.scrollY})`);
    }
    const selText = window.getSelection ? window.getSelection().toString().trim() : '';
    if (selText) findings.push(`keybed touch caused text selection "${selText}"`);
  }

  // 4. Simultaneous key hold + knob drag (two-hand playing)
  const visibleKnob = Array.from(document.querySelectorAll('.synth-knob-housing')).find((el) => {
    if (!shown(el)) return false;
    const r = el.getBoundingClientRect();
    return r.left >= 0 && r.right <= vw && r.top >= 0 && r.bottom <= vh;
  });
  if (visibleKnob && whiteKeys.length >= 2) {
    const kHold = whiteKeys[2];
    const pk = center(kHold);
    const pKnob = center(visibleKnob);
    const beforeRatio = visibleKnob.style.getPropertyValue('--knob-ratio');

    const tKey = makeTouch(10, kHold, pk.x, pk.y);
    dispatchTouch(kHold, 'touchstart', [tKey], [tKey]);

    const tKnobStart = makeTouch(11, visibleKnob, pKnob.x, pKnob.y);
    const knobStartEv = dispatchTouch(visibleKnob, 'touchstart', [tKey, tKnobStart], [tKnobStart]);
    if (!knobStartEv.defaultPrevented) findings.push('knob touchstart not defaultPrevented');

    const tKnobMove = makeTouch(11, visibleKnob, pKnob.x, pKnob.y - 60);
    const knobMoveEv = dispatchTouch(window, 'touchmove', [tKey, tKnobMove], [tKnobMove]);
    if (!knobMoveEv.defaultPrevented) findings.push('knob touchmove not defaultPrevented');
    const afterRatioUp = visibleKnob.style.getPropertyValue('--knob-ratio');

    const tKnobMoveDown = makeTouch(11, visibleKnob, pKnob.x, pKnob.y + 60);
    dispatchTouch(window, 'touchmove', [tKey, tKnobMoveDown], [tKnobMoveDown]);
    const afterRatioDown = visibleKnob.style.getPropertyValue('--knob-ratio');

    if (beforeRatio === afterRatioUp && beforeRatio === afterRatioDown) {
      findings.push(`knob ${visibleKnob.dataset.param} did not respond to touch drag while key held`);
    }
    if (!kHold.classList.contains('active')) {
      findings.push('held key released while dragging knob with second finger');
    }

    dispatchTouch(window, 'touchend', [tKey], [tKnobMoveDown]);
    dispatchTouch(kHold, 'touchend', [], [tKey]);
  }

  // 5. Simultaneous key hold + tab tap (DomUtils.installMultiTouchTaps)
  const inactiveTab = Array.from(document.querySelectorAll('.env-tab-btn:not(.active)')).find((el) => {
    if (!shown(el)) return false;
    const r = el.getBoundingClientRect();
    return r.left >= 0 && r.right <= vw && r.top >= 0 && r.bottom <= vh;
  });
  if (inactiveTab && whiteKeys.length >= 2) {
    const kHold = whiteKeys[1];
    const pk = center(kHold);
    const pt = center(inactiveTab);
    const tKey = makeTouch(20, kHold, pk.x, pk.y);
    const tTab = makeTouch(21, inactiveTab, pt.x, pt.y);
    dispatchTouch(kHold, 'touchstart', [tKey], [tKey]);
    dispatchTouch(inactiveTab, 'touchstart', [tKey, tTab], [tTab]);
    dispatchTouch(inactiveTab, 'touchend', [tKey], [tTab]);
    if (!inactiveTab.classList.contains('active')) {
      findings.push(`tab "${inactiveTab.textContent.trim()}" did not switch when tapped while holding a key`);
    }
    if (!kHold.classList.contains('active')) {
      findings.push('held key dropped when tapping tab with second finger');
    }
    dispatchTouch(kHold, 'touchend', [], [tKey]);
  }

  // 6. Portrait carousel navigation
  if (portrait) {
    const mobileTabs = Array.from(document.querySelectorAll('.mobile-tab-btn')).filter(shown);
    const surface = document.querySelector('.modular-control-surface');
    if (mobileTabs.length < 3) {
      findings.push(`expected 3 portrait mobile tabs, found ${mobileTabs.length}`);
    } else if (surface) {
      mobileTabs[1].click();
      for (let i = 0; i < 16 && surface.scrollLeft < 50; i++) await wait(50);
      if (surface.scrollLeft < 50) {
        findings.push(`portrait carousel did not scroll to slide 2 (scrollLeft=${Math.round(surface.scrollLeft)})`);
      }
      mobileTabs[0].click();
      for (let i = 0; i < 16 && surface.scrollLeft > 20; i++) await wait(50);
    }
  }

  // 7. Drum Rack E2E
  const openDrumBtn = document.getElementById('openDrumDrawerBtn');
  const drumDrawer = document.getElementById('drumDrawer');
  const closeDrumBtn = document.getElementById('closeDrumDrawerBtn');
  if (openDrumBtn && drumDrawer) {
    openDrumBtn.click();
    await wait(150);
    if (!drumDrawer.classList.contains('open')) {
      findings.push('Drum Rack drawer did not open');
    } else {
      const step = drumDrawer.querySelector('.step-btn');
      if (step) {
        const before = step.className;
        step.click();
        if (step.className === before) findings.push('Drum Rack step button did not toggle');
        step.click();
      }
      const playBtn = document.getElementById('drumPlayBtn');
      if (playBtn) {
        playBtn.click();
        await wait(80);
        playBtn.click();
      }
      if (closeDrumBtn) closeDrumBtn.click();
      await wait(120);
      if (drumDrawer.classList.contains('open')) findings.push('Drum Rack drawer did not close');
    }
  }

  // 8. AudioContext & AudioWorklet status
  await wait(250);
  const obs = window.__ipadAudioObs || { contexts: [], worklets: [] };
  if (!obs.contexts.length) {
    findings.push('AudioContext was not created after touch interaction');
  }
  for (const w of obs.worklets) {
    if (w.status === 'error') findings.push(`AudioWorklet failed (${w.url}): ${w.error}`);
  }
  const expectedWorklets =
    synth === 'fm' ? ['crusher-processor.js', 'fm-voice-processor.js'] : ['crusher-processor.js'];
  for (const exp of expectedWorklets) {
    if (!obs.worklets.some((w) => w.url.includes(exp) && w.status === 'ok')) {
      findings.push(`expected AudioWorklet "${exp}" not loaded ok`);
    }
  }

  // 9. Informational touch-target metrics (<44px) for --verbose
  const interactive = Array.from(
    document.querySelectorAll(
      'button, select, input, .synth-knob-housing, .synth-fader-track-housing, .key-white, .key-black'
    )
  ).filter((el) => shown(el) && !el.closest('#drumDrawer:not(.open)') && !el.closest('.modal:not(.open)'));
  let smallCount = 0;
  let smallest = null;
  for (const el of interactive) {
    const r = el.getBoundingClientRect();
    if (r.width < 44 || r.height < 44) {
      smallCount++;
      const area = r.width * r.height;
      if (!smallest || area < smallest.area) {
        smallest = {
          area,
          el: el.id ? `#${el.id}` : el.className.split(/\s+/)[0] || el.tagName.toLowerCase(),
          size: `${Math.round(r.width)}x${Math.round(r.height)}`
        };
      }
    }
  }

  return {
    findings,
    metrics: {
      keys: whiteKeys.length,
      acState: obs.shimmed ? 'shimmed(win-webkit)' : obs.contexts[0] ? obs.contexts[0].state : 'none',
      worklets: obs.worklets.map((w) => `${w.url.split('/').pop()}:${w.status}(${w.ms}ms)`),
      smallTargets: smallCount,
      smallest: smallest ? `${smallest.el}=${smallest.size}` : 'none'
    }
  };
}

async function checkProfile(browser, base, synth, profile) {
  const context = await browser.newContext({
    viewport: { width: profile.width, height: profile.height },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    userAgent: IPAD_UA,
    serviceWorkers: 'block'
  });
  await context.addInitScript(installAudioObserver);
  const page = await context.newPage();
  await page.route(/^https?:\/\/(?!127\.0\.0\.1|localhost)/, (route) => route.abort());
  const errors = [];
  page.on('pageerror', (err) => errors.push(`page error: ${err.message}`));
  page.on('console', (msg) => msg.type() === 'error' && errors.push(`console error: ${msg.text()}`));
  try {
    await page.goto(`${base}/?synth=${synth}`, { waitUntil: 'load', timeout: 30000 });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(250);
    const { findings, metrics } = await page.evaluate(runIpadFlows, { synth, portrait: profile.portrait });
    return { findings: [...errors, ...findings], metrics };
  } finally {
    await context.close();
  }
}

async function main() {
  const args = process.argv.slice(2);
  const opt = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : null);
  const engine = opt('--browser') || 'webkit';
  const only = opt('--only');
  const verbose = args.includes('--verbose');
  const start = Date.now();
  const { [engine]: browserType } = require('playwright');
  const server = createServer().listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await browserType.launch({
    env: {
      ...process.env,
      HTTP_PROXY: '',
      HTTPS_PROXY: '',
      http_proxy: '',
      https_proxy: '',
      NO_PROXY: '127.0.0.1,localhost'
    }
  });
  const failures = [];
  let pages = 0;
  try {
    for (const synth of SYNTHS) {
      for (const profile of IPAD_PROFILES) {
        const where = `${synth}@${profile.width}x${profile.height}`;
        if (only && only !== where && only !== profile.name && only !== synth) continue;
        pages++;
        const { findings, metrics } = await checkProfile(browser, base, synth, profile);
        if (verbose) {
          console.log(
            `  ${where} (${profile.name}): ac=${metrics.acState} keys=${metrics.keys} worklets=[${metrics.worklets.join(', ')}] small<44px=${metrics.smallTargets} (min ${metrics.smallest})`
          );
        }
        for (const f of findings) failures.push(`${where}: ${f}`);
      }
    }
  } finally {
    await browser.close();
    server.close();
  }
  const secs = Math.round((Date.now() - start) / 1000);
  if (failures.length) {
    console.log(`IPAD FAILED: ${failures.length} findings on ${pages} pages (${engine}, ${secs}s)`);
    for (const f of failures) console.log(`  ${f}`);
    process.exit(1);
  }
  console.log(
    `IPAD OK: ${SYNTHS.length} synths x ${IPAD_PROFILES.length} iPad views (${pages} pages, ${engine}, ${secs}s)`
  );
}

if (require.main === module) {
  main().catch((err) => {
    const missing = /Executable doesn't exist/.test(err.message);
    console.log(`IPAD FAILED: ${missing ? 'webkit not installed, run: npx playwright install webkit' : err.message}`);
    process.exit(1);
  });
}

module.exports = { SYNTHS, IPAD_PROFILES, runIpadFlows };
