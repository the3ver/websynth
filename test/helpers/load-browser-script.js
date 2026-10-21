/**
 * Loads the browser scripts from js/ into an isolated vm context.
 * The scripts attach their classes to `window`, so the sandbox doubles as `window`.
 * Timers are stubbed so engines (e.g. the S&H LFO loop) never keep Node alive.
 * Interval and timeout callbacks are kept in `__intervals` / `__timeouts` (id -> fn) so tests can fire them by hand.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const JS_DIR = path.resolve(__dirname, '..', '..', 'js');

function createSandbox(globals = {}) {
  let nextTimerId = 1;
  const intervals = new Map();
  const timeouts = new Map();
  const sandbox = {
    // No Worker/Blob in Node: engines warn about the timer fallback on every construction
    console: { ...console, warn() {} },
    __intervals: intervals,
    setInterval: (fn) => {
      const id = nextTimerId++;
      intervals.set(id, fn);
      return id;
    },
    clearInterval: (id) => intervals.delete(id),
    __timeouts: timeouts,
    setTimeout: (fn) => {
      const id = nextTimerId++;
      timeouts.set(id, fn);
      return id;
    },
    clearTimeout: (id) => timeouts.delete(id)
  };
  Object.assign(sandbox, globals);
  sandbox.window = sandbox;
  return vm.createContext(sandbox);
}

function loadScripts(...files) {
  return loadScriptsWith({}, ...files);
}

/**
 * Like loadScripts, with extra sandbox globals such as { AudioContext: FakeAudioContext }
 */
function loadScriptsWith(globals, ...files) {
  const context = createSandbox(globals);
  for (const file of files) {
    const fullPath = path.join(JS_DIR, file);
    vm.runInContext(fs.readFileSync(fullPath, 'utf8'), context, { filename: fullPath });
  }
  return context;
}

module.exports = { loadScripts, loadScriptsWith };
