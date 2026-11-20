/**
 * MOD MATRIX PANEL
 * Overlay opened from the MOD MATRIX button in the LFO module title: one row per matrix slot with source and
 * target selects and the amount knob. SynthUI binds the knob like every other knob
 * (data-param mod-slotN-amount); this panel fills the selects from the synth definition
 * (modMatrix: { sources: { id: label }, targets: { id: { label } } }) and lights a slot LED
 * while the slot is audible. The keybed below stays playable while the panel is open.
 */

class ModMatrixPanel {
  constructor(engine, matrix, root = document) {
    this.engine = engine;
    this.matrix = matrix;
    this.panel = root.getElementById('modMatrixPanel');
    this.button = root.getElementById('openModMatrixBtn');
    this.rows = [];
    if (!this.panel || !matrix) return;

    this.rows = Array.from(this.panel.querySelectorAll('.mod-slot-row')).map((row) => ({
      slot: row.dataset.slot,
      row,
      source: row.querySelector('[data-mod-field="source"]'),
      dest: row.querySelector('[data-mod-field="dest"]')
    }));

    const sourceOptions = Object.entries(matrix.sources).map(([id, label]) => [id, label]);
    const targetOptions = Object.entries(matrix.targets).map(([id, target]) => [id, target.label]);
    for (const row of this.rows) {
      this.fillSelect(row.source, sourceOptions);
      this.fillSelect(row.dest, targetOptions);
      for (const field of ['source', 'dest']) {
        row[field].addEventListener('change', (e) => {
          this.engine.setModSlot(row.slot, field, e.target.value);
          DomUtils.blurTarget(e);
          this.render();
        });
      }
    }

    if (this.button) {
      this.button.addEventListener('click', (e) => {
        this.setOpen(!this.isOpen());
        DomUtils.blurTarget(e);
      });
    }
    const close = this.panel.querySelector('.mod-matrix-close');
    if (close) close.addEventListener('click', () => this.setOpen(false));

    this.render();
  }

  fillSelect(select, options) {
    for (const [value, label] of [['off', '---'], ...options]) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = label;
      select.appendChild(option);
    }
  }

  isOpen() {
    return this.panel.classList.contains('open');
  }

  setOpen(open) {
    this.panel.classList.toggle('open', open);
    if (this.button) this.button.classList.toggle('active', open);
  }

  /**
   * Selects and slot LEDs from the engine (after preset loads and select changes)
   */
  render() {
    let active = 0;
    for (const row of this.rows) {
      const slot = this.engine.modMatrix[row.slot];
      row.source.value = slot.source in this.matrix.sources ? slot.source : 'off';
      row.dest.value = slot.dest in this.matrix.targets ? slot.dest : 'off';
      const on = ModMatrixPanel.isActive(slot, this.matrix);
      row.row.classList.toggle('active', on);
      if (on) active++;
    }
    if (this.button) this.button.classList.toggle('has-routes', active > 0);
  }

  /**
   * A slot is audible with a known source, a known target and an amount other than 0
   */
  static isActive(slot, matrix) {
    return Boolean(slot && slot.amount && slot.source in matrix.sources && slot.dest in matrix.targets);
  }
}

window.ModMatrixPanel = ModMatrixPanel;
