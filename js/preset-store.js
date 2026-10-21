/**
 * RETROVOX SUB-1 • USER PRESET STORE
 * DOM-free persistence of user presets in localStorage. Storage errors (private mode, quota) are swallowed.
 */

class PresetStore {
  constructor({ storage, key = 'retrovox_user_presets', now = () => Date.now() } = {}) {
    this.key = key;
    this.now = now;
    if (storage !== undefined) {
      this.storage = storage;
    } else {
      try {
        this.storage = window.localStorage;
      } catch (e) {
        this.storage = null;
      }
    }
  }

  list() {
    try {
      const stored = this.storage ? this.storage.getItem(this.key) : null;
      const parsed = stored ? JSON.parse(stored) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      return [];
    }
  }

  write(presets) {
    try {
      if (this.storage) this.storage.setItem(this.key, JSON.stringify(presets));
    } catch (e) {}
  }

  find(id) {
    return this.list().find((p) => p && p.id === id);
  }

  create(name, category, state) {
    const presets = this.list();
    const preset = {
      id: `user-${this.now()}`,
      name: `USER // ${name.toUpperCase()}`,
      category,
      description: 'Custom User Synthesizer Patch',
      state
    };
    presets.push(preset);
    this.write(presets);
    return preset;
  }

  /**
   * Returns the updated preset, or null when the id is unknown
   */
  update(id, name, category, state) {
    const presets = this.list();
    const preset = presets.find((p) => p && p.id === id);
    if (!preset) return null;
    preset.name = `USER // ${name.toUpperCase()}`;
    preset.category = category;
    preset.state = state;
    this.write(presets);
    return preset;
  }

  remove(id) {
    const presets = this.list();
    const remaining = presets.filter((p) => p && p.id !== id);
    if (remaining.length === presets.length) return false;
    this.write(remaining);
    return true;
  }

  static isUserPreset(preset) {
    return typeof preset?.id === 'string' && preset.id.startsWith('user-');
  }

  static displayName(preset) {
    if (!preset || typeof preset.name !== 'string') return '';
    return preset.name.replace(/^USER\s*\/\/\s*/i, '');
  }
}

window.PresetStore = PresetStore;
