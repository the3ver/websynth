/**
 * Loads the browser scripts from js/ into an isolated vm context.
 * The scripts attach their classes to `window`, so the sandbox doubles as `window`.
 * Timers are stubbed so engines (e.g. the S&H LFO loop) never keep Node alive.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const JS_DIR = path.resolve(__dirname, '..', '..', 'js');

function createSandbox() {
  let nextTimerId = 1;
  const sandbox = {
    console,
    setInterval: () => nextTimerId++,
    clearInterval: () => {},
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
