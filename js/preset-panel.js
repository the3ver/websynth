/**
 * PRESET LCD & SAVE DIALOG
 * Factory + user preset browser (dropdown, prev/next, init patch, random patch) and the save / overwrite /
 * delete modal.
 * Persistence lives in PresetStore; after a preset is loaded into the engine, onApplied(preset) lets the
 * synth panel re-sync its controls.
 */

class PresetPanel {
  /**
   * @param {object} presets factory (array), init and optional random of the active synth
   */
  constructor(engine, store, presets, onApplied) {
    this.engine = engine;
    this.store = store;
    this.factoryPresets = presets.factory;
    this.initPreset = presets.init;
    this.randomState = presets.random || null;
    this.onApplied = onApplied;
    this.presetsList = [];
    this.currentPresetIndex = 0;
    this.savePresetMode = 'create';
    this.editingPresetId = null;

    const $ = (id) => document.getElementById(id);
    this.dropdown = /** @type {HTMLSelectElement} */ ($('presetSelectDropdown'));
    this.catTag = $('presetCatTag');
    this.modal = $('savePresetModal');
    this.modalTitle = $('savePresetModalTitle');
    this.modalDesc = $('savePresetModalDesc');
    this.nameInput = /** @type {HTMLInputElement} */ ($('userPresetNameInput'));
    this.categorySelect = /** @type {HTMLSelectElement} */ ($('userPresetCategorySelect'));
    this.confirmBtn = $('confirmSavePresetBtn');
    this.saveAsNewBtn = $('saveAsNewPresetBtn');
    this.deleteBtn = $('deleteCurrentPresetBtn');

    this.refreshDropdown();
    if (this.presetsList.length > 0) this.apply(this.presetsList[0]);

    this.initBrowser();
    this.initSaveDialog();
  }

  initBrowser() {
    if (this.dropdown) {
      this.dropdown.addEventListener('change', (e) => {
        const preset = this.presetsList.find((p) => p.id === /** @type {HTMLInputElement} */ (e.target).value);
        if (preset) this.apply(preset);
        DomUtils.blurTarget(e);
      });
    }

    const onClick = (id, handler) => {
      const btn = document.getElementById(id);
      if (btn)
        btn.addEventListener('click', (e) => {
          handler();
          DomUtils.blurTarget(e);
        });
    };
    onClick('prevPresetBtn', () => this.step(-1));
    onClick('nextPresetBtn', () => this.step(1));
    onClick('initPatchBtn', () => {
      if (this.initPreset) this.apply(this.initPreset);
    });
    onClick('randomPatchBtn', () => {
      if (this.randomState) this.apply(PatchRandomizer.preset(this.randomState()));
    });
  }

  step(delta) {
    const count = this.presetsList.length;
    if (count === 0) return;
    this.currentPresetIndex = (this.currentPresetIndex + delta + count) % count;
    this.apply(this.presetsList[this.currentPresetIndex]);
  }

  // =========================================================================
  // SAVE / OVERWRITE / DELETE DIALOG
  // =========================================================================

  initSaveDialog() {
    const saveBtn = document.getElementById('savePresetBtn');
    if (!this.modal) return;

    if (saveBtn) saveBtn.addEventListener('click', () => this.openSaveDialog());

    const close = () => this.modal.classList.remove('active');
    for (const id of ['closeSaveModalBtn', 'cancelSavePresetBtn']) {
      const btn = document.getElementById(id);
      if (btn) btn.addEventListener('click', close);
    }
    this.modal.addEventListener('click', (e) => {
      if (e.target === this.modal) close();
    });

    if (this.nameInput) {
      this.nameInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          if (this.confirmBtn) this.confirmBtn.click();
        }
      });
    }

    if (this.confirmBtn) {
      this.confirmBtn.addEventListener('click', () => {
        const { name, category } = this.readForm();
        if (this.savePresetMode === 'update' && this.editingPresetId) {
          this.updateUserPreset(this.editingPresetId, name, category);
        } else {
          this.saveUserPreset(name, category);
        }
        close();
      });
    }

    if (this.saveAsNewBtn) {
      this.saveAsNewBtn.addEventListener('click', () => {
        const { name, category } = this.readForm();
        this.saveUserPreset(name, category);
        close();
      });
    }

    if (this.deleteBtn) {
      this.deleteBtn.addEventListener('click', () => {
        if (this.editingPresetId && this.deleteUserPreset(this.editingPresetId)) close();
      });
    }
  }

  readForm() {
    return {
      name: this.nameInput.value.trim() || 'My Custom Synth',
      category: this.categorySelect.value || 'USER'
    };
  }

  /**
   * User presets open in overwrite mode (with save-as-new and delete); everything else saves a new copy
   */
  openSaveDialog() {
    const current = this.presetsList[this.currentPresetIndex];
    const isUser = PresetStore.isUserPreset(current);
    const show = (el, visible) => {
      if (el) el.style.display = visible ? 'inline-flex' : 'none';
    };

    if (isUser) {
      this.setDialogText(
        'USER-PRESET BEARBEITEN / SPEICHERN',
        'Möchtest du das bestehende User-Preset mit deinen Sound-Änderungen überschreiben oder als neues Preset ablegen?'
      );
      this.nameInput.value = PresetStore.displayName(current);
      this.categorySelect.value = current.category || 'USER';
      if (this.confirmBtn) this.confirmBtn.textContent = '💾 Überschreiben';
      this.savePresetMode = 'update';
      this.editingPresetId = current.id;
    } else {
      this.setDialogText(
        'SOUND ALS PRESET SPEICHERN',
        'Gib deinem Custom-Preset einen Namen. Der Sound wird dauerhaft in deinem Browser gespeichert.'
      );
      const isNamedPreset = current && current.name && !current.id.includes('init');
      this.nameInput.value = isNamedPreset ? current.name.replace(/^\d+\s*\/\/\s*/, '') + ' (Custom)' : '';
      this.categorySelect.value =
        current && current.category && current.category !== 'INIT' ? current.category : 'USER';
      if (this.confirmBtn) this.confirmBtn.textContent = '💾 Speichern';
      this.savePresetMode = 'create';
      this.editingPresetId = null;
    }
    show(this.deleteBtn, isUser);
    show(this.saveAsNewBtn, isUser);

    this.modal.classList.add('active');
    setTimeout(() => {
      this.nameInput.focus();
      this.nameInput.select();
    }, 50);
  }

  setDialogText(title, description) {
    if (this.modalTitle) this.modalTitle.textContent = title;
    if (this.modalDesc) this.modalDesc.textContent = description;
  }

  saveUserPreset(name, category) {
    const preset = this.store.create(name, category, this.engine.getPresetState());
    this.refreshDropdown();
    this.apply(preset);
  }

  updateUserPreset(id, name, category) {
    const preset = this.store.update(id, name, category, this.engine.getPresetState());
    if (!preset) {
      this.saveUserPreset(name, category);
      return;
    }
    this.refreshDropdown();
    this.apply(preset);
  }

  deleteUserPreset(id) {
    const target = this.store.find(id);
    const targetName = target ? PresetStore.displayName(target) : 'dieses Preset';
    if (!confirm(`Möchtest du das Preset "${targetName}" wirklich löschen?`)) return false;

    this.store.remove(id);
    this.refreshDropdown();
    this.apply(this.presetsList[0] || this.initPreset);
    return true;
  }

  // =========================================================================
  // DROPDOWN & LOADING
  // =========================================================================

  refreshDropdown() {
    if (!this.dropdown) return;
    const factory = this.factoryPresets || [];
    const user = this.store.list();
    this.presetsList = [...factory, ...user];

    this.dropdown.innerHTML = '';
    this.appendGroup('— FACTORY CLASSICS —', factory);
    if (user.length > 0) this.appendGroup('— USER PRESETS —', user);
  }

  appendGroup(label, presets) {
    const group = document.createElement('optgroup');
    group.label = label;
    for (const preset of presets) {
      const opt = document.createElement('option');
      opt.value = preset.id;
      opt.textContent = preset.name;
      group.appendChild(opt);
    }
    this.dropdown.appendChild(group);
  }

  /**
   * A patch outside the lists (RANDOM) gets its own dropdown entry until the next refresh
   */
  showTransient(preset) {
    if (!this.dropdown) return;
    /** @type {HTMLOptionElement} */
    let opt = this.dropdown.querySelector(`option[value="${preset.id}"]`);
    if (!opt) {
      opt = document.createElement('option');
      opt.value = preset.id;
      this.dropdown.insertBefore(opt, this.dropdown.firstChild);
    }
    opt.textContent = preset.name;
  }

  apply(preset) {
    if (!preset || !preset.state) return;
    this.engine.allNotesOff();
    this.engine.loadPresetState(preset.state, this.initPreset && this.initPreset.state);
    this.onApplied(preset);

    if (this.catTag) this.catTag.textContent = preset.category || 'PRESET';
    if (preset.transient) this.showTransient(preset);
    if (this.dropdown) this.dropdown.value = preset.id;
    this.currentPresetIndex = this.presetsList.findIndex((p) => p.id === preset.id);
  }
}

window.PresetPanel = PresetPanel;
