/**
 * RETROVOX SUB-1 • HARDWARE CONTROLS
 * Rotary knobs, ADSR faders and pitch/mod wheels. All of them share one DragController,
 * which owns the only window-level mouse/touch move and release listeners.
 */

const DragController = {
  active: null,
  installed: false,

  /**
   * Starts dragging `control` on mousedown/touchstart of `el`. A control implements
   * dragStart(clientY), dragMove(clientY, shiftKey) and optionally dragEnd() and `cursor`.
   */
  bind(el, control) {
    el.addEventListener('mousedown', (e) => {
      e.preventDefault();
      this.begin(control, e.clientY);
    });
    el.addEventListener('touchstart', (e) => {
      e.preventDefault();
      this.begin(control, e.touches[0].clientY);
    }, { passive: false });
  },

  begin(control, clientY) {
    this.install();
    this.active = control;
    control.dragStart(clientY);
    if (control.cursor) document.body.style.cursor = control.cursor;
  },

  install() {
    if (this.installed) return;
    this.installed = true;
    window.addEventListener('mousemove', (e) => this.move(e.clientY, e.shiftKey));
    window.addEventListener('mouseup', () => this.end());
    window.addEventListener('touchmove', (e) => {
      if (this.active) this.move(e.touches[0].clientY, false);
    });
    window.addEventListener('touchend', () => this.end());
  },

  move(clientY, shiftKey) {
    if (this.active) this.active.dragMove(clientY, shiftKey);
  },

  end() {
    const control = this.active;
    if (!control) return;
    this.active = null;
    if (control.dragEnd) control.dragEnd();
    if (control.cursor) document.body.style.cursor = '';
  }
};

/**
 * Rotary knob bound to a .synth-knob-housing (data-param, data-min, data-max, data-step, data-default, data-type)
 */
class Knob {
  constructor(housing, onChange) {
    const data = housing.dataset;
    this.param = data.param;
    this.spec = {
      type: data.type || 'percent',
      min: parseFloat(data.min),
      max: parseFloat(data.max),
      step: parseFloat(data.step) || 0.01
    };
    this.defaultValue = parseFloat(data.default);
    this.value = this.defaultValue;
    this.onChange = onChange;
    this.cursor = 'ns-resize';
    this.dial = housing.querySelector('.synth-knob-dial');
    this.readout = document.getElementById(`${this.param}-readout`);

    this.render();
    DragController.bind(housing, this);
    housing.addEventListener('dblclick', () => this.commit(this.defaultValue));
    housing.addEventListener('wheel', (e) => {
      e.preventDefault();
      const ratio = KnobScale.clampRatio(KnobScale.valueToRatio(this.spec, this.value) + (e.deltaY < 0 ? 0.04 : -0.04));
      this.commit(KnobScale.quantizeWheel(this.spec, KnobScale.ratioToValue(this.spec, ratio)));
    }, { passive: false });
  }

  /**
   * Updates the dial and readout without notifying (used when syncing from the engine)
   */
  setValue(val) {
    this.value = val;
    this.render();
  }

  commit(val) {
    this.setValue(val);
    this.onChange(val);
  }

  render() {
    const ratio = KnobScale.clampRatio(KnobScale.valueToRatio(this.spec, this.value));
    this.dial.style.transform = `rotate(${-135 + (ratio * 270)}deg)`;
    if (this.readout) this.readout.textContent = KnobScale.formatReadout(this.spec.type, this.value);
  }

  dragStart(clientY) {
    this.startY = clientY;
    this.startRatio = KnobScale.valueToRatio(this.spec, this.value);
  }

  dragMove(clientY, shiftKey) {
    const sensitivity = shiftKey ? 450 : 130;
    const ratio = KnobScale.clampRatio(this.startRatio + (this.startY - clientY) / sensitivity);
    const newValue = KnobScale.quantizeDrag(this.spec, KnobScale.ratioToValue(this.spec, ratio));
    if (newValue !== this.value) this.commit(newValue);
  }
}

/**
 * Vertical ADSR fader bound to a .synth-fader-track-housing (data-fader = stage, data-min, data-max, data-type).
 * read() returns the stage value of the envelope currently shown.
 */
class Fader {
  constructor(housing, { read, onChange }) {
    const data = housing.dataset;
    this.housing = housing;
    this.stage = data.fader;
    this.min = parseFloat(data.min);
    this.max = parseFloat(data.max);
    this.type = data.type;
    this.read = read;
    this.onChange = onChange;
    this.cursor = 'ns-resize';
    this.thumb = document.getElementById(`fader-thumb-${this.stage}`);
    this.readout = document.getElementById(`fader-readout-${this.stage}`);

    this.sync();
    DragController.bind(housing, this);
  }

  // Time faders travel logarithmically, levels linearly
  valueToRatio(val) {
    if (this.type === 'time') return Math.log(val / this.min) / Math.log(this.max / this.min);
    return (val - this.min) / (this.max - this.min);
  }

  ratioToValue(ratio) {
    if (this.type === 'time') return this.min * Math.pow(this.max / this.min, ratio);
    return this.min + (ratio * (this.max - this.min));
  }

  quantize(val) {
    if (this.type === 'time') return val < 1.0 ? Math.round(val * 1000) / 1000 : Math.round(val * 100) / 100;
    return Math.round(val * 100) / 100;
  }

  render(val) {
    this.thumb.style.bottom = `${KnobScale.clampRatio(this.valueToRatio(val)) * 84}%`;
    if (this.readout) this.readout.textContent = KnobScale.formatReadout(this.type, val);
  }

  sync() {
    this.render(this.read());
  }

  commit(val) {
    this.render(val);
    this.onChange(val);
  }

  /**
   * A click jumps the fader to the clicked position, then dragging continues from there
   */
  dragStart(clientY) {
    this.startY = clientY;
    const rect = this.housing.getBoundingClientRect();
    if (rect.height > 0) {
      this.startRatio = KnobScale.clampRatio((rect.bottom - clientY) / rect.height);
      this.commit(this.quantize(this.ratioToValue(this.startRatio)));
    } else {
      this.startRatio = this.valueToRatio(this.read());
    }
  }

  dragMove(clientY, shiftKey) {
    const trackHeight = this.housing.clientHeight || 70;
    const sensitivity = shiftKey ? 300 : Math.max(70, trackHeight * 1.05);
    const ratio = KnobScale.clampRatio(this.startRatio + (this.startY - clientY) / sensitivity);
    this.commit(this.quantize(this.ratioToValue(ratio)));
  }
}

/**
 * Pitch wheel (springs back to 0, range -1..1) or mod wheel (holds its position, range 0..1)
 */
class PerformanceWheel {
  constructor(el, springBack, onChange) {
    this.el = el;
    this.springBack = springBack;
    this.onChange = onChange;
    this.value = 0;
    DragController.bind(el, this);
  }

  dragStart(clientY) {
    this.startY = clientY;
  }

  dragMove(clientY) {
    const deltaY = this.startY - clientY;
    if (this.springBack) {
      const bend = Math.max(-1, Math.min(1, deltaY / 40));
      this.el.style.transform = `translateY(${-bend * 16}px)`;
      this.onChange(bend);
    } else {
      this.value = Math.max(0, Math.min(1, this.value + (deltaY / 100)));
      this.startY = clientY;
      this.el.style.transform = `translateY(${-(this.value * 30 - 15)}px)`;
      this.onChange(this.value);
    }
  }

  dragEnd() {
    if (!this.springBack) return;
    this.el.style.transition = 'transform 0.15s ease-out';
    this.el.style.transform = 'translateY(0px)';
    this.onChange(0);
    setTimeout(() => { this.el.style.transition = ''; }, 150);
  }
}

window.DragController = DragController;
window.Knob = Knob;
window.Fader = Fader;
window.PerformanceWheel = PerformanceWheel;
