#!/usr/bin/env node
/**
 * Audio render check in headless Chromium: every factory preset of both synths (and their INIT patch) plays a
 * chord into an OfflineAudioContext, through the real engine, FX rack and master bus (limiter + safety clipper).
 * Fails on a peak at or above LIMITS.peak, NaN samples, a silent output, or a click (see measure()).
 * Reproducible: Math.random is a seeded PRNG (noise buffer, reverb IR, S&H, matrix random), and setTimeout /
 * setInterval run on a virtual clock that also stands in for ctx.currentTime (see renderPreset). Runs agree to
 * about 1e-6 (Chromium's threaded float work); a 4-decimal value in --verbose may flip in its last digit.
 * Green: one line "RENDER OK: ...". Red: one line per finding (preset + measured value), exit 1.
 * Usage: npm run render [-- --only sub1|fm] [-- --verbose] (prints the measurements of every preset)
 */
const fs = require('fs');
const path = require('path');
const { createServer } = require('./serve');

const RENDER = {
  sampleRate: 48000,
  seconds: 1.3, // render length
  noteOn: 0.1, // chord struck here, oscillators already run (free-running phase, as in play)
  noteOff: 0.7, // and released here
  chord: [48, 55, 60, 64], // C3 G3 C4 E4, velocity 1
  step: 1024, // frames between suspends
  lookahead: 2048 // frames the virtual clock may run ahead of the render (43 ms, below the 50 ms FM-4 cleanup margin)
};

// Calibrated on the factory presets (npm run render -- --verbose; 2026-11-21). Proven by temporary mutations of
// Envelope: a hard gate at note on (jump to peak) fails all 18 presets (smallest step 0.029); a hard cut at note
// off fails 9 of 18 as a scheduled setValueAtTime (ratio up to 15) and 10 of 18 as an unscheduled
// param.value = 0 (ratio up to 26); the others fade inside the master bus or carry no high harmonics. Without the safety clipper 10 presets peak above 1.0 (up to 1.21).
const LIMITS = {
  peak: 0.98, // ceiling of the master bus safety clipper; clean max 0.978 (SUB-1 INIT)
  silent: 0.001, // -60 dBFS; quietest 0.0045 (SUB-1 07 pad, slow attack)
  onJump: 0.01, // largest sample step around the start of a note; clean max 0.0006
  offRatio: 1.5, // largest step after note off / before it; clean max 1.32 (SUB-1 INIT, saw steps vary by window)
  offFloor: 0.0005, // added to the off limit, for near-silent held sounds (SUB-1 07 pad holds 0.0002)
  latency: [128, 2048] // plausible master bus delay in frames; outside it the bus changed and the windows are wrong
};

/**
 * Measurements of one stereo render. A click is a step between neighbouring samples that an envelope does not
 * explain. The master bus delays the output by `latency` frames (limiter look-ahead, oversampling; measured once,
 * see busLatency), so the windows follow the note events by that much. Every window opens 3 ms early: the
 * oversampling filters ring ahead of a step, and the harness applies unscheduled changes 128 frames early.
 * onJump: largest step from 3 ms before to 2.5 ms after the note sounds (an exponential attack starts near zero, a
 * hard gate steps to full level). heldJump / offJump: largest step in the 30 ms before / the 33 ms from 3 ms
 * before note off (a release only fades, so it never steps harder than the held sound). onset: frames from note on
 * to the first sample above 1e-6, a diagnostic for --verbose. Pure; also runs in the page (main() serializes it).
 * @param {ArrayLike<number>[]} channels
 * @param {number} onAt frame of note on
 * @param {number} offAt frame of note off
 * @param {number} latency master bus delay in frames
 * @param {number} sampleRate
 */
function measure(channels, onAt, offAt, latency, sampleRate) {
  const ms = (x) => Math.round(sampleRate * x * 0.001);
  const on = onAt + latency;
  const off = offAt + latency;
  const m = { peak: 0, nan: 0, onset: -1, onJump: 0, heldJump: 0, offJump: 0 };
  for (const data of channels) {
    for (let i = 0; i < data.length; i++) {
      const x = data[i];
      if (Number.isNaN(x)) {
        m.nan++;
        continue;
      }
      m.peak = Math.max(m.peak, Math.abs(x));
      if (i >= onAt && Math.abs(x) > 1e-6 && (m.onset < 0 || i - onAt < m.onset)) m.onset = i - onAt;
      const jump = Math.abs(x - (i > 0 && !Number.isNaN(data[i - 1]) ? data[i - 1] : 0));
      if (i >= on - ms(3) && i < on + ms(2.5)) m.onJump = Math.max(m.onJump, jump);
      if (i >= off - ms(33) && i < off - ms(3)) m.heldJump = Math.max(m.heldJump, jump);
      if (i >= off - ms(3) && i < off + ms(30)) m.offJump = Math.max(m.offJump, jump);
    }
  }
  return m;
}

/** Findings for one preset's measurements, empty when clean. */
function findings(label, m, limits = LIMITS) {
  const f = [];
  const v = (x) => x.toFixed(4);
  if (m.nan) f.push(`${label}: ${m.nan} NaN samples`);
  if (m.peak >= limits.peak) f.push(`${label}: peak ${v(m.peak)} >= ${limits.peak}`);
  if (m.peak < limits.silent) f.push(`${label}: silent, peak ${m.peak.toExponential(2)} < ${limits.silent}`);
  if (m.onJump > limits.onJump) f.push(`${label}: click at note on, step ${v(m.onJump)} > ${limits.onJump}`);
  const offMax = m.heldJump * limits.offRatio + limits.offFloor;
  if (m.offJump > offMax)
    f.push(`${label}: click at note off, step ${v(m.offJump)} > ${v(offMax)} (held ${v(m.heldJump)})`);
  return f;
}

// Engine scripts from index.html, in page order, up to the synth registry (no UI, no app.js)
function engineScripts() {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const all = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map((m) => m[1]);
  const ui = new Set(['js/drum-ui.js', 'js/app.js', 'js/pwa-manager.js']);
  return all.slice(0, all.indexOf('js/synth-registry.js') + 1).filter((src) => !ui.has(src));
}

/** Runs in the page before any script: seeded Math.random, timers on a virtual clock driven by renderPreset. */
function installDeterminism() {
  let seed = 1;
  window.reseed = (s) => (seed = s >>> 0);
  // mulberry32
  Math.random = () => {
    seed = (seed + 0x6d2b79f5) >>> 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const timers = new Map();
  let nextId = 1;
  let nowMs = 0;
  const add = (fn, ms, every) => {
    const id = nextId++;
    timers.set(id, { fn, due: nowMs + Math.max(0, Number(ms) || 0), every });
    return id;
  };
  window.setTimeout = /** @type {any} */ ((fn, ms) => add(fn, ms, 0));
  window.setInterval = /** @type {any} */ ((fn, ms) => add(fn, ms, Math.max(1, Number(ms) || 0)));
  window.clearTimeout = window.clearInterval = (id) => timers.delete(id);
  window.virtualClock = {
    reset() {
      timers.clear();
      nowMs = 0;
    },
    now: () => nowMs,
    // Fires every timer due by ms in due order, intervals as often as they fall due
    advance(ms) {
      for (;;) {
        let next = null;
        for (const [id, t] of timers) if (t.due <= ms && (!next || t.due < next[1].due)) next = [id, t];
        if (!next) break;
        const [id, t] = next;
        nowMs = t.due;
        if (t.every) t.due += t.every;
        else timers.delete(id);
        t.fn();
      }
      nowMs = ms;
    }
  };
}

/** Runs in the page: delay of SynthBlocks.MasterBus in frames, the position of an impulse's largest output sample. */
async function busLatency({ sampleRate }) {
  const ctx = new OfflineAudioContext({ numberOfChannels: 1, length: 4096, sampleRate });
  const bus = new SynthBlocks.MasterBus(ctx);
  const impulse = ctx.createBuffer(1, 1, sampleRate);
  impulse.getChannelData(0)[0] = 0.5;
  const source = ctx.createBufferSource();
  source.buffer = impulse;
  source.connect(bus.input);
  source.start(0);
  const out = (await ctx.startRendering()).getChannelData(0);
  let at = 0;
  for (let i = 1; i < out.length; i++) if (Math.abs(out[i]) > Math.abs(out[at])) at = i;
  return at;
}

/** Runs in the page: renders one preset (index -1 = INIT), returns its measurements. */
async function renderPreset({ synth, index, render, latency }) {
  const { sampleRate, seconds, noteOn, noteOff, chord, step, lookahead } = render;
  const def = SynthRegistry.get(synth);
  const preset = index < 0 ? { name: 'INIT', state: def.presets.init } : def.presets.factory[index];
  const clock = window.virtualClock;
  window.reseed(1234);
  clock.reset();
  const length = Math.round(sampleRate * seconds);
  // Channels 0/1: the output; 2/3: the master bus input (before volume, limiter and clipper), see busPeak
  const ctx = new OfflineAudioContext({ numberOfChannels: 4, length, sampleRate });
  ctx.destination.channelInterpretation = 'discrete';
  // The engine schedules at ctx.currentTime, which reads the virtual clock. Between note events the clock runs up
  // to LOOKAHEAD frames ahead of the render, so timers schedule their AudioParam events at their exact time while
  // the render suspends only every STEP frames. It never passes the next note event: note on and off run at a
  // suspend one render quantum before their frame with the clock at that frame (Chromium applies events entered at
  // the suspend time itself one quantum late), so unscheduled changes (param.value, connect) land 128 frames early,
  // inside the measured windows (they open 3 ms early). Graph changes from later timers (a voice unplugged after its release) apply up to LOOKAHEAD
  // early; the release windows measured here end before any of them.
  Object.defineProperty(ctx, 'currentTime', { get: () => clock.now() / 1000 });
  // The engine resumes a context that is not running (noteOn -> ensureAudioRunning); a resume from inside a
  // suspend would restart the render while the engine still schedules. Only this harness resumes.
  Object.defineProperty(ctx, 'state', { get: () => 'running' });
  // The engine builds its context with new AudioContext(); a constructor returning an object yields that object
  window.AudioContext = /** @type {any} */ (
    function () {
      return ctx;
    }
  );
  const engine = def.createEngine();
  engine.initAudio();
  await Promise.all([engine.ready, engine.fxChain.ready]);
  engine.loadPresetState(preset.state, def.presets.init);
  const tap = ctx.createChannelSplitter(2);
  const tapOut = ctx.createChannelMerger(4);
  engine.master.input.connect(tap);
  tap.connect(tapOut, 0, 2);
  tap.connect(tapOut, 1, 3);
  tapOut.connect(ctx.destination);

  const frameOf = (t) => Math.round((t * sampleRate) / 128) * 128; // on a render quantum
  const onAt = frameOf(noteOn);
  const offAt = frameOf(noteOff);
  const ms = (frame) => (frame / sampleRate) * 1000;
  const notes = new Map([
    [onAt, () => chord.forEach((note) => engine.noteOn(note, 1))],
    [offAt, () => chord.forEach((note) => engine.noteOff(note))]
  ]);
  // Clock target at render frame f: LOOKAHEAD ahead, but not past the next note event
  const horizon = (f) => Math.min(f + lookahead, ...[...notes.keys()].filter((n) => n > f + 128), length);
  const frames = new Set([...notes.keys()].map((n) => n - 128));
  for (let f = step; f < length; f += step) frames.add(f);
  clock.advance(ms(horizon(0)));
  for (const frame of [...frames].sort((a, b) => a - b)) {
    ctx.suspend(frame / sampleRate).then(() => {
      if (notes.has(frame + 128)) {
        clock.advance(ms(frame + 128));
        notes.get(frame + 128)();
      }
      clock.advance(ms(horizon(frame)));
      ctx.resume();
    });
  }
  const buffer = await ctx.startRendering();
  const channels = [buffer.getChannelData(0), buffer.getChannelData(1)];
  let busPeak = 0;
  for (const data of [buffer.getChannelData(2), buffer.getChannelData(3)])
    for (let i = 0; i < data.length; i++) busPeak = Math.max(busPeak, Math.abs(data[i]));
  return { name: preset.name, busPeak, ...window.measure(channels, onAt, offAt, latency, sampleRate) };
}

async function main() {
  const args = process.argv.slice(2);
  const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : null;
  if (only && !['sub1', 'fm'].includes(only)) {
    console.log(`RENDER FAILED: --only ${only}: use sub1 or fm`);
    process.exit(1);
  }
  const verbose = args.includes('--verbose');
  const start = Date.now();
  const { chromium } = require('playwright');
  const server = createServer().listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch();
  const all = [];
  const counts = {};
  try {
    const page = await browser.newPage();
    page.on('pageerror', (err) => all.push(`page error: ${err.message}`));
    page.on('console', (msg) => msg.type() === 'error' && all.push(`console error: ${msg.text()}`));
    // A page at the site root, so the engines' relative worklet URLs resolve as in index.html
    const scripts = engineScripts()
      .map((src) => `<script src="${src}"></script>`)
      .join('');
    await page.route(`${base}/render-check.html`, (route) =>
      route.fulfill({ contentType: 'text/html', body: `<!doctype html><meta charset="utf-8">${scripts}` })
    );
    await page.addInitScript(installDeterminism);
    await page.addInitScript(`window.measure = ${measure.toString()}`);
    await page.goto(`${base}/render-check.html`, { waitUntil: 'load', timeout: 30000 });
    const latency = await page.evaluate(busLatency, { sampleRate: RENDER.sampleRate });
    if (verbose) console.log(`master bus latency ${latency} frames`);
    const [minLatency, maxLatency] = LIMITS.latency;
    if (!(latency >= minLatency && latency <= maxLatency))
      throw new Error(`master bus latency ${latency} frames outside ${minLatency}..${maxLatency}, see busLatency()`);
    for (const synth of ['sub1', 'fm']) {
      if (only && only !== synth) continue;
      const n = await page.evaluate((s) => SynthRegistry.get(s).presets.factory.length, synth);
      counts[synth] = n + 1;
      for (let index = -1; index < n; index++) {
        const m = await page.evaluate(renderPreset, { synth, index, render: RENDER, latency });
        if (verbose) {
          const v = (x) => x.toFixed(4);
          console.log(
            `${synth.padEnd(4)} ${m.name.padEnd(34)} bus ${v(m.busPeak)} peak ${v(m.peak)} onset ${m.onset} on ${v(m.onJump)} held ${v(m.heldJump)} off ${v(m.offJump)}`
          );
        }
        all.push(...findings(`${synth} "${m.name}"`, m));
      }
    }
  } finally {
    await browser.close();
    server.close();
  }
  if (all.length) {
    for (const f of all) console.log(`RENDER FAILED: ${f}`);
    process.exit(1);
  }
  const summary = Object.entries(counts)
    .map(([s, n]) => `${s} ${n}`)
    .join(', ');
  console.log(`RENDER OK: ${summary} presets, ${((Date.now() - start) / 1000).toFixed(1)}s`);
}

if (require.main === module) {
  main().catch((err) => {
    const missing = /Executable doesn't exist/.test(err.message);
    console.log(
      `RENDER FAILED: ${missing ? 'browser not installed, run: npx playwright install chromium' : err.message}`
    );
    process.exit(1);
  });
}

module.exports = { measure, findings, LIMITS, engineScripts };
