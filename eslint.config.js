/**
 * ESLint for classic browser scripts (js/), the service worker, worklets, Node scripts and tests.
 * Classic scripts share one global scope: the globals each js/ file defines at top level
 * (class/const/function or window.X = ...) are collected here, so no-undef catches typos
 * and names that no script defines, without a hand-kept list.
 */
const fs = require('fs');
const path = require('path');
const js = require('@eslint/js');
const globals = require('globals');

function projectGlobals() {
  const found = {};
  const dirs = ['js', 'js/lib'];
  for (const dir of dirs) {
    for (const file of fs.readdirSync(path.join(__dirname, dir)).filter((f) => f.endsWith('.js'))) {
      const src = fs.readFileSync(path.join(__dirname, dir, file), 'utf8');
      for (const m of src.matchAll(/^(?:class|const|let|var|function)\s+([A-Za-z_$][\w$]*)/gm)) found[m[1]] = 'readonly';
      for (const m of src.matchAll(/\bwindow\.([A-Za-z_$][\w$]*)\s*=(?!=)/g)) found[m[1]] = 'readonly';
    }
  }
  return found;
}

const rules = {
  ...js.configs.recommended.rules,
  'no-unused-vars': ['error', { args: 'none', caughtErrors: 'none' }],
  'no-empty': ['error', { allowEmptyCatch: true }],
  // virtual-keyboard.js defines class VirtualKeyboard, which shadows the browser's VirtualKeyboard API on purpose
  'no-redeclare': ['error', { builtinGlobals: false }]
};

module.exports = [
  { ignores: ['node_modules/**', 'scratch/**', 'screenshots/**'] },
  {
    files: ['js/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: { ...globals.browser, ...projectGlobals() }
    },
    rules: {
      ...rules,
      // top-level declarations are the scripts' exports to the shared global scope
      'no-unused-vars': ['error', { vars: 'local', args: 'none', caughtErrors: 'none' }]
    }
  },
  {
    files: ['js/worklets/*.js'],
    languageOptions: {
      globals: { ...globals.audioWorklet, module: 'readonly' }
    }
  },
  {
    files: ['sw.js'],
    languageOptions: { ecmaVersion: 2022, sourceType: 'script', globals: globals.serviceworker },
    rules
  },
  {
    files: ['scripts/**/*.js', 'test/**/*.js', 'eslint.config.js'],
    languageOptions: { ecmaVersion: 2022, sourceType: 'commonjs', globals: globals.node },
    rules
  }
];
