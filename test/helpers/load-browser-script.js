/**
 * Loads the browser scripts from js/ into an isolated vm context.
 * The scripts attach their classes to `window`, so the sandbox doubles as `window`.
 * Timers are stubbed so engines (e.g. the S&H LFO loop) never keep Node alive.
 * Interval callbacks are kept in `__intervals` (id -> fn) so tests can fire them by hand.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const JS_DIR = path.resolve(__dirname, '..', '..', 'js');

function createSandbox() {
  let nextTimerId = 1;
  const intervals = new Map();
  const sandbox = {
    console,
    __intervals: intervals,
    setInterval: (fn) => {
      const id = nextTimerId++;
      intervals.set(id, fn);
      return id;
    },
    clearInterval: (id) => intervals.delete(id),
    setTimeout: () => nextTimerId++,
    clearTimeout: () => {}
  };
  sandbox.window = sandbox;
  return vm.createContext(sandbox);
}

function loadScripts(...files) {
  const context = createSandbox();
  for (const file of files) {
    const fullPath = path.join(JS_DIR, file);
    vm.runInContext(fs.readFileSync(fullPath, 'utf8'), context, { filename: fullPath });
  }
  return context;
}

module.exports = { loadScripts };
