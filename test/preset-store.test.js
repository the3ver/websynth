const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadScripts } = require('./helpers/load-browser-script');

const { PresetStore } = loadScripts('preset-store.js');

function createFakeStorage(initialData = {}) {
  const map = new Map(Object.entries(initialData));
  return {
    map,
    getItem(key) {
      return map.has(key) ? map.get(key) : null;
    },
    setItem(key, value) {
      map.set(key, String(value));
    }
  };
}

const throwingStorage = {
  getItem() {
    throw new Error('Storage read error');
  },
  setItem() {
    throw new Error('Storage write error');
  }
};

function toPlain(value) {
  return JSON.parse(JSON.stringify(value));
}

test('list() returns empty array when storage is empty', () => {
  const storage = createFakeStorage();
  const store = new PresetStore({ storage });
  assert.deepStrictEqual(toPlain(store.list()), []);
});

test('list() returns empty array when stored JSON is malformed', () => {
  const storage = createFakeStorage({
    retrovox_user_presets: '{malformed:json'
  });
  const store = new PresetStore({ storage });
  assert.deepStrictEqual(toPlain(store.list()), []);
});

test('create() persists preset with id, formatted name, and description', () => {
  const storage = createFakeStorage();
  const store = new PresetStore({
    storage,
    now: () => 1234567890
  });

  const created = store.create('Acid Bass', 'Bass', { cutoff: 0.5 });
  const expected = {
    id: 'user-1234567890',
    name: 'USER // ACID BASS',
    category: 'Bass',
    description: 'Custom User Synthesizer Patch',
    state: { cutoff: 0.5 }
  };

  assert.deepStrictEqual(toPlain(created), expected);
  assert.deepStrictEqual(toPlain(store.list()), [expected]);
  assert.strictEqual(
    storage.getItem('retrovox_user_presets'),
    JSON.stringify([expected])
  );
});

test('update() updates existing preset and returns it, or returns null if not found', () => {
  const storage = createFakeStorage();
  const store = new PresetStore({
    storage,
    now: () => 1000
  });

  const preset = store.create('Lead', 'Synth', { osc: 1 });
  const updated = store.update(preset.id, 'Pluck', 'Lead', { osc: 2 });

  const expected = {
    id: 'user-1000',
    name: 'USER // PLUCK',
    category: 'Lead',
    description: 'Custom User Synthesizer Patch',
    state: { osc: 2 }
  };

  assert.deepStrictEqual(toPlain(updated), expected);
  assert.deepStrictEqual(toPlain(store.find(preset.id)), expected);

  const missing = store.update('non-existent-id', 'Test', 'Bass', {});
  assert.strictEqual(missing, null);
  assert.deepStrictEqual(toPlain(store.list()), [expected]);
});

test('remove() removes an existing preset and returns true, or false if not found', () => {
  const storage = createFakeStorage();
  const store = new PresetStore({
    storage,
    now: () => 2000
  });

  const preset = store.create('Pad', 'Pad', { env: 1 });
  assert.strictEqual(store.remove('non-existent-id'), false);
  assert.strictEqual(store.list().length, 1);

  assert.strictEqual(store.remove(preset.id), true);
  assert.deepStrictEqual(toPlain(store.list()), []);
  assert.strictEqual(store.remove(preset.id), false);
});

test('find() returns matching preset or undefined', () => {
  const storage = createFakeStorage();
  const store = new PresetStore({
    storage,
    now: () => 3000
  });

  const preset = store.create('Arp', 'Arp', { tempo: 120 });
  assert.deepStrictEqual(toPlain(store.find(preset.id)), toPlain(preset));
  assert.strictEqual(store.find('unknown-id'), undefined);
});

test('static isUserPreset() identifies user preset IDs', () => {
  assert.strictEqual(PresetStore.isUserPreset({ id: 'user-123' }), true);
  assert.strictEqual(PresetStore.isUserPreset({ id: 'factory-1' }), false);
  assert.strictEqual(PresetStore.isUserPreset({ id: null }), false);
  assert.strictEqual(PresetStore.isUserPreset({}), false);
  assert.strictEqual(PresetStore.isUserPreset(null), false);
  assert.strictEqual(PresetStore.isUserPreset(undefined), false);
});

test('static displayName() strips USER // prefix and handles missing name', () => {
  assert.strictEqual(PresetStore.displayName({ name: 'USER // ACID BASS' }), 'ACID BASS');
  assert.strictEqual(PresetStore.displayName({ name: 'USER//lead' }), 'lead');
  assert.strictEqual(PresetStore.displayName({ name: 'USER   //   Pad' }), 'Pad');
  assert.strictEqual(PresetStore.displayName({ name: 'Factory Preset' }), 'Factory Preset');
  assert.strictEqual(PresetStore.displayName({ name: '' }), '');
  assert.strictEqual(PresetStore.displayName({}), '');
  assert.strictEqual(PresetStore.displayName(null), '');
  assert.strictEqual(PresetStore.displayName(undefined), '');
});

test('handles throwing storage gracefully during list() and create()', () => {
  const store = new PresetStore({
    storage: throwingStorage,
    now: () => 9999
  });

  assert.deepStrictEqual(toPlain(store.list()), []);

  const created = store.create('Fallback', 'Misc', { val: 1 });
  assert.deepStrictEqual(toPlain(created), {
    id: 'user-9999',
    name: 'USER // FALLBACK',
    category: 'Misc',
    description: 'Custom User Synthesizer Patch',
    state: { val: 1 }
  });
});
