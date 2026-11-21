#!/usr/bin/env node
/**
 * Release version in one step: node scripts/bump.js [patch|minor|major|X.Y.Z] (default patch).
 * package.json is the source; VERSION_LOCATIONS lists every other place that repeats it.
 * test/release-consistency.test.js reads the same table, so a new place needs one row here.
 * Changelog texts (README "NEU in vX", "Was gibt's Neues" modal) stay hand-written.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

// Each pattern captures the version as group 2 between the fixed text in groups 1 and 3
const VERSION_LOCATIONS = [
  { file: 'package.json', pattern: /("version": ")(\d+\.\d+\.\d+)(")/ },
  { file: 'js/app.js', pattern: /(CURRENT_APP_VERSION = ')(\d+\.\d+\.\d+)(')/ },
  { file: 'sw.js', pattern: /( \* Version: )(\d+\.\d+\.\d+)(\n)/ },
  { file: 'sw.js', pattern: /(CACHE_VERSION = 'v)(\d+\.\d+\.\d+)(')/ },
  { file: 'index.html', pattern: /(<span class="version-tag">v)(\d+\.\d+\.\d+)(<)/ },
  { file: 'index.html', pattern: /(<span class="release-version-number">v)(\d+\.\d+\.\d+)(<)/ },
  { file: 'README.md', pattern: /(Version-)(\d+\.\d+\.\d+)(-)/ }
];

/** Version found at every location, in table order; null where the pattern does not match. */
function readVersions(root = ROOT) {
  return VERSION_LOCATIONS.map(({ file, pattern }) => {
    const match = fs.readFileSync(path.join(root, file), 'utf8').match(pattern);
    return { file, version: match ? match[2] : null };
  });
}

function nextVersion(current, step) {
  if (/^\d+\.\d+\.\d+$/.test(step)) return step;
  const [major, minor, patch] = current.split('.').map(Number);
  if (step === 'patch') return `${major}.${minor}.${patch + 1}`;
  if (step === 'minor') return `${major}.${minor + 1}.0`;
  if (step === 'major') return `${major + 1}.0.0`;
  throw new Error(`unknown step "${step}": use patch, minor, major or X.Y.Z`);
}

/** Writes the new version to every location; throws before writing if one is missing or out of step. */
function bump(step = 'patch', root = ROOT) {
  const found = readVersions(root);
  const current = found[0].version;
  const bad = found.filter((f) => f.version !== current);
  if (!current || bad.length) {
    throw new Error(
      `versions out of step with package.json ${current}: ${bad.map((f) => `${f.file}=${f.version}`).join(', ')}`
    );
  }
  const next = nextVersion(current, step);
  const contents = new Map();
  for (const { file, pattern } of VERSION_LOCATIONS) {
    const text = contents.get(file) ?? fs.readFileSync(path.join(root, file), 'utf8');
    contents.set(file, text.replace(pattern, `$1${next}$3`));
  }
  for (const [file, text] of contents) fs.writeFileSync(path.join(root, file), text);
  return { from: current, to: next };
}

if (require.main === module) {
  try {
    const { from, to } = bump(process.argv[2]);
    console.log(`${from} -> ${to} in ${new Set(VERSION_LOCATIONS.map((l) => l.file)).size} files`);
  } catch (err) {
    console.error(`bump: ${err.message}`);
    process.exit(1);
  }
}

module.exports = { VERSION_LOCATIONS, readVersions, nextVersion, bump };
