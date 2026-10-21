/**
 * RETROVOX SUB-1 • VIRTUAL KEYBED & PC KEYBOARD INPUT
 * Renders the responsive keybed (25/37/49/61 keys from C3) and turns mouse glissando, multi-touch
 * and computer-keyboard hotkeys into note on/off callbacks. Pointer notes and PC-keyboard notes are
 * tracked separately, so a global mouseup never releases notes held on the computer keyboard.
 */

const KEYBED_START_MIDI = 48; // C3
const BLACK_KEY_STEPS = [1, 3, 6, 8, 10];
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

// PC keyboard (physical key code) to MIDI note, base C3 = 48
const PC_KEY_MAP = {
  'KeyA': 48, 'KeyW': 49, 'KeyS': 50, 'KeyE': 51, 'KeyD': 52, 'KeyF': 53,
  'KeyT': 54, 'KeyG': 55, 'KeyZ': 56, 'KeyY': 56, 'KeyH': 57, 'KeyU': 58, 'KeyJ': 59,
  'KeyK': 60, 'KeyO': 61, 'KeyL': 62, 'KeyP': 63, 'Semicolon': 64, 'Quote': 65, 'BracketLeft': 66
};

// Labels printed on the keys (German layout)
const KEY_SHORTCUT_LABELS = {
  48: 'A', 49: 'W', 50: 'S', 51: 'E', 52: 'D', 53: 'F',
  54: 'T', 55: 'G', 56: 'Y', 57: 'H', 58: 'U', 59: 'J',
  60: 'K', 61: 'O', 62: 'L', 63: 'P', 64: 'Ö', 65: 'Ä',
  72: 'C5'
};

/**
 * Musical hotkeys are only blocked while typing into text fields; selects, sliders and buttons never block them
 */
function isTextInput(target) {
  if (!target) return false;
  if (target.tagName === 'TEXTAREA') return true;
  if (target.tagName === 'INPUT') {
    const type = (target.type || '').toLowerCase();
    return type === 'text' || type === 'password' || type === 'search' || type === 'email';
  }
  return false;
}

class VirtualKeyboard {
  /**
   * callbacks: { onNoteOn(midi), onNoteOff(midi), onOctaveShift(delta), ensureAudio() }
   */
  constructor(container, callbacks) {
    this.container = container;
    this.callbacks = callbacks;
    this.startMidi = KEYBED_START_MIDI;
    this.numKeys = 25;
    this.keyElements = new Map(); // midi -> key element
    this.pointerHeldKeys = new Set(); // mouse & touch
    this.keyboardHeldKeys = new Set(); // computer keyboard
    this.isMouseDown = false;
    this.currentMouseNote = null;

    if (this.container) {
      this.render();
      this.initResizeHandling();
      this.initMouse();
      this.initTouch();
      this.container.addEventListener('dragstart', (e) => e.preventDefault());
    }
    this.initPcKeyboard();
  }

  // =========================================================================
  // KEYBED RENDERING & RESPONSIVE KEY COUNT
  // =========================================================================

  /**
   * Snaps to classic keybed sizes (25, 37, 49 or 61 keys, all ending on C) that fill the container
   */
  calculateOptimalKeyCount() {
    const containerWidth = this.container.clientWidth;
    if (!containerWidth || containerWidth < 200) return 25;
    const minWhiteKeyWidth = 35; // px
    if (containerWidth >= 36 * minWhiteKeyWidth) return 61;
    if (containerWidth >= 29 * minWhiteKeyWidth) return 49;
    if (containerWidth >= 22 * minWhiteKeyWidth) return 37;
    return 25;
  }

  render() {
    this.numKeys = this.calculateOptimalKeyCount();
    this.container.innerHTML = '';
    this.keyElements.clear();

    for (let i = 0; i < this.numKeys; i++) {
      const midiNote = this.startMidi + i;
      const noteInOctave = midiNote % 12;
      const noteName = `${NOTE_NAMES[noteInOctave]}${Math.floor(midiNote / 12) - 1}`;
      const shortcut = KEY_SHORTCUT_LABELS[midiNote] || '';

      const keyEl = document.createElement('div');
      keyEl.dataset.note = midiNote;
      keyEl.className = BLACK_KEY_STEPS.includes(noteInOctave) ? 'key-black' : 'key-white';
      keyEl.innerHTML = `
          <span class="key-note-label">${noteName}</span>
          ${shortcut ? `<span class="key-shortcut">${shortcut}</span>` : ''}
        `;
      if (this.isHeld(midiNote)) keyEl.classList.add('active');

      this.container.appendChild(keyEl);
      this.keyElements.set(midiNote, keyEl);
    }

    requestAnimationFrame(() => this.repositionBlackKeys());
  }

  /**
   * Black keys sit on the boundary between two white keys of the current responsive width
   */
  repositionBlackKeys() {
    const whiteKeyEl = this.container.querySelector('.key-white');
    const blackKeyEl = this.container.querySelector('.key-black');
    if (!whiteKeyEl || !blackKeyEl) return;
    const whiteKeyWidth = whiteKeyEl.getBoundingClientRect().width;
    const blackKeyWidth = blackKeyEl.getBoundingClientRect().width || 26;
    if (whiteKeyWidth <= 0) return;

    let whiteKeyIndex = 0;
    for (let i = 0; i < this.numKeys; i++) {
      const midiNote = this.startMidi + i;
      if (!BLACK_KEY_STEPS.includes(midiNote % 12)) {
        whiteKeyIndex++;
      } else {
        const keyEl = this.keyElements.get(midiNote);
        if (keyEl) keyEl.style.left = `${(whiteKeyIndex * whiteKeyWidth) - (blackKeyWidth / 2)}px`;
      }
    }
  }

  refreshLayout() {
    if (this.calculateOptimalKeyCount() !== this.numKeys) {
      this.render();
    } else {
      this.repositionBlackKeys();
    }
  }

  initResizeHandling() {
    window.addEventListener('resize', () => this.refreshLayout());
    window.addEventListener('orientationchange', () => {
      setTimeout(() => this.render(), 120);
    });

    if (window.ResizeObserver) {
      let resizeTimer = null;
      const observer = new ResizeObserver(() => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => this.refreshLayout(), 60);
      });
      observer.observe(this.container.parentElement || this.container);
    }
  }

  // =========================================================================
  // KEY STATE
  // =========================================================================

  isHeld(midiNote) {
    return this.keyboardHeldKeys.has(midiNote) || this.pointerHeldKeys.has(midiNote);
  }

  setKeyLit(midiNote, lit) {
    const keyEl = this.keyElements.get(midiNote);
    if (keyEl) keyEl.classList.toggle('active', lit);
  }

  /**
   * Short highlight for notes played by the arpeggiator
   */
  flashKey(midiNote) {
    if (!this.keyElements.has(midiNote)) return;
    this.setKeyLit(midiNote, true);
    setTimeout(() => {
      if (!this.isHeld(midiNote)) this.setKeyLit(midiNote, false);
    }, 120);
  }

  /**
   * Adds a note to one held set; sounds it only if the other input source is not already holding it
   */
  press(heldSet, otherSet, midiNote) {
    if (heldSet.has(midiNote)) return;
    heldSet.add(midiNote);
    this.setKeyLit(midiNote, true);
    if (!otherSet.has(midiNote)) this.callbacks.onNoteOn(midiNote);
  }

  release(heldSet, otherSet, midiNote) {
    if (!heldSet.has(midiNote)) return;
    heldSet.delete(midiNote);
    if (otherSet.has(midiNote)) return;
    this.setKeyLit(midiNote, false);
    this.callbacks.onNoteOff(midiNote);
  }

  pressPointerNote(midiNote) {
    if (midiNote === null || midiNote === undefined) return;
    this.callbacks.ensureAudio();
    this.press(this.pointerHeldKeys, this.keyboardHeldKeys, midiNote);
  }

  releasePointerNote(midiNote) {
    if (midiNote === null || midiNote === undefined) return;
    this.release(this.pointerHeldKeys, this.keyboardHeldKeys, midiNote);
  }

  releaseAllPointerNotes() {
    this.currentMouseNote = null;
    for (const note of Array.from(this.pointerHeldKeys)) this.releasePointerNote(note);
  }

  // =========================================================================
  // MOUSE GLISSANDO & MULTI-TOUCH
  // =========================================================================

  noteAtPoint(clientX, clientY) {
    const element = document.elementFromPoint(clientX, clientY);
    const keyEl = element ? element.closest('.key-white, .key-black') : null;
    return keyEl && keyEl.dataset.note ? parseInt(keyEl.dataset.note, 10) : null;
  }

  initMouse() {
    this.container.addEventListener('mousedown', (e) => {
      e.preventDefault();
      this.isMouseDown = true;
      const note = this.noteAtPoint(e.clientX, e.clientY);
      if (note !== null) {
        this.currentMouseNote = note;
        this.pressPointerNote(note);
      }
    });

    // Dragging across keys releases the previous key at each boundary crossing
    window.addEventListener('mousemove', (e) => {
      if (!this.isMouseDown) return;
      if (e.buttons === 0) {
        this.isMouseDown = false;
        this.releaseAllPointerNotes();
        return;
      }
      const note = this.noteAtPoint(e.clientX, e.clientY);
      if (note !== this.currentMouseNote) {
        if (this.currentMouseNote !== null) this.releasePointerNote(this.currentMouseNote);
        this.currentMouseNote = note;
        if (note !== null) this.pressPointerNote(note);
      }
    });

    // Only releases pointer notes, never notes held on the computer keyboard
    window.addEventListener('mouseup', () => {
      if (this.isMouseDown || this.currentMouseNote !== null) {
        this.isMouseDown = false;
        this.releaseAllPointerNotes();
      }
    });
  }

  initTouch() {
    const activeTouchNotes = new Map(); // touch identifier -> midi

    const handleTouches = (e) => {
      this.callbacks.ensureAudio();
      const currentTouches = new Set();
      for (const touch of Array.from(e.touches)) {
        currentTouches.add(touch.identifier);
        const note = this.noteAtPoint(touch.clientX, touch.clientY);
        const previousNote = activeTouchNotes.get(touch.identifier);
        const hadNote = previousNote !== undefined && previousNote !== null;

        if (note !== null) {
          if (previousNote !== note) {
            if (hadNote) this.releasePointerNote(previousNote);
            activeTouchNotes.set(touch.identifier, note);
            this.pressPointerNote(note);
          }
        } else if (hadNote) {
          this.releasePointerNote(previousNote);
          activeTouchNotes.delete(touch.identifier);
        }
      }

      for (const [touchId, note] of Array.from(activeTouchNotes.entries())) {
        if (!currentTouches.has(touchId)) {
          this.releasePointerNote(note);
          activeTouchNotes.delete(touchId);
        }
      }
    };

    for (const type of ['touchstart', 'touchmove', 'touchend', 'touchcancel']) {
      this.container.addEventListener(type, handleTouches, { passive: false });
    }
  }

  // =========================================================================
  // COMPUTER KEYBOARD
  // =========================================================================

  initPcKeyboard() {
    window.addEventListener('keydown', (e) => {
      if (e.repeat || isTextInput(e.target)) return;

      if (e.code === 'KeyZ' && !PC_KEY_MAP[e.code]) {
        this.callbacks.onOctaveShift(-1);
        return;
      }
      if (e.code === 'KeyX') {
        this.callbacks.onOctaveShift(1);
        return;
      }

      const midiNote = PC_KEY_MAP[e.code];
      if (midiNote !== undefined) this.press(this.keyboardHeldKeys, this.pointerHeldKeys, midiNote);
    });

    window.addEventListener('keyup', (e) => {
      if (isTextInput(e.target)) return;
      const midiNote = PC_KEY_MAP[e.code];
      if (midiNote !== undefined) this.release(this.keyboardHeldKeys, this.pointerHeldKeys, midiNote);
    });

    // Release held keyboard notes when the window loses focus (tab switch, alt-tab)
    window.addEventListener('blur', () => {
      for (const note of Array.from(this.keyboardHeldKeys)) {
        this.keyboardHeldKeys.delete(note);
        if (!this.pointerHeldKeys.has(note)) this.setKeyLit(note, false);
        this.callbacks.onNoteOff(note);
      }
    });
  }
}

window.VirtualKeyboard = VirtualKeyboard;
