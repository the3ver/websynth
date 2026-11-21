/**
 * Release consistency: one version everywhere, every script the page loads is precached by the service worker.
 * Version places come from scripts/bump.js (VERSION_LOCATIONS), the bump itself runs on a temp copy.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const { VERSION_LOCATIONS, readVersions, nextVersion, bump } = require('../scripts/bump');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

function precacheAssets() {
  const noop = () => {};
  const sandbox = { self: { addEventListener: noop }, addEventListener: noop };
  vm.runInNewContext(read('sw.js'), sandbox);
  // Array.from: arrays from the vm context fail deepEqual against Node arrays
  return Array.from(vm.runInNewContext('PRECACHE_ASSETS', sandbox), (a) => a.replace(/^\.\//, ''));
}

const scriptTags = () =>
  Array.from(read('index.html').matchAll(/<script src="([^"?]+)/g), (m) => m[1].replace(/^\.\//, ''));

const jsFiles = (dir) =>
  fs
    .readdirSync(path.join(ROOT, dir))
    .filter((f) => f.endsWith('.js'))
    .map((f) => `${dir}/${f}`);

test('every version location matches package.json', () => {
  const found = readVersions();
  const expected = JSON.parse(read('package.json')).version;
  assert.deepEqual(
    found.filter((f) => f.version !== expected),
    []
  );
});

test('every script tag in index.html is precached', () => {
  const precache = precacheAssets();
  assert.deepEqual(
    scriptTags().filter((s) => !precache.includes(s)),
    []
  );
});

test('every precached script is loaded by index.html or is a worklet', () => {
  const tags = scriptTags();
  const orphans = precacheAssets().filter(
    (a) => a.endsWith('.js') && a !== 'sw.js' && !tags.includes(a) && !a.startsWith('js/worklets/')
  );
  assert.deepEqual(orphans, []);
});

test('every file in js/, js/lib/ and js/worklets/ is precached, every precached file exists', () => {
  const precache = precacheAssets();
  const files = [...jsFiles('js'), ...jsFiles('js/lib'), ...jsFiles('js/worklets')];
  assert.deepEqual(
    files.filter((f) => !precache.includes(f)),
    []
  );
  const local = precache.filter((a) => !/^https?:/.test(a) && a !== '' && !a.endsWith('/'));
  assert.deepEqual(
    local.filter((a) => !fs.existsSync(path.join(ROOT, a))),
    []
  );
});

test('nextVersion steps patch, minor, major and takes an explicit version', () => {
  assert.equal(nextVersion('1.8.35', 'patch'), '1.8.36');
  assert.equal(nextVersion('1.8.35', 'minor'), '1.9.0');
  assert.equal(nextVersion('1.8.35', 'major'), '2.0.0');
  assert.equal(nextVersion('1.8.35', '1.10.0'), '1.10.0');
  assert.throws(() => nextVersion('1.8.35', 'huge'), /unknown step/);
});

function tempCopy() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bump-'));
  for (const file of new Set(VERSION_LOCATIONS.map((l) => l.file))) {
    fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    fs.copyFileSync(path.join(ROOT, file), path.join(dir, file));
  }
  return dir;
}

test('bump writes the next patch version to every location', () => {
  const dir = tempCopy();
  try {
    const { from, to } = bump('patch', dir);
    assert.equal(to, nextVersion(from, 'patch'));
    assert.deepEqual(
      readVersions(dir).filter((f) => f.version !== to),
      []
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('bump refuses and writes nothing when a location is out of step', () => {
  const dir = tempCopy();
  try {
    const app = path.join(dir, 'js/app.js');
    fs.writeFileSync(
      app,
      fs.readFileSync(app, 'utf8').replace(/CURRENT_APP_VERSION = '[^']+'/, "CURRENT_APP_VERSION = '0.0.1'")
    );
    const before = fs.readFileSync(path.join(dir, 'package.json'), 'utf8');
    assert.throws(() => bump('patch', dir), /js\/app\.js=0\.0\.1/);
    assert.equal(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'), before);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
