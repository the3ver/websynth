/**
 * NOTE ROUTER
 * Sends keybed, PC-keyboard and MIDI notes to the arpeggiator when it is on, otherwise to the voices.
 * The arpeggiator always tracks the held and latched keys, so HOLD works with the arp off too:
 * the voices then sound the held keys plus the latched chord, and the router releases every note
 * that drops out of that set. Arp on takes the latched chord over, arp off hands it back.
 * onLatchedChange(notes) reports the latched chord for the keybed lights. DOM-free.
 */

class NoteRouter {
  constructor(engine, arp) {
    this.engine = engine;
    this.arp = arp;
    this.onLatchedChange = null;
  }

  latchedNotes() {
    return this.arp.latch ? [...this.arp.latchedKeys] : [];
  }

  // Notes the voices sound while the arp is off
  directNotes() {
    return new Set(this.arp.latch ? [...this.arp.latchedKeys, ...this.arp.heldKeys] : this.arp.heldKeys);
  }

  // Applies a key-state change; with the arp off, releases the voices of notes that leave the direct set
  changeKeys(change) {
    if (this.arp.enabled) {
      change();
    } else {
      const before = this.directNotes();
      change();
      const after = this.directNotes();
      for (const note of before) {
        if (!after.has(note)) this.engine.noteOff(note);
      }
    }
    this.reportLatched();
  }

  reportLatched() {
    if (this.onLatchedChange) this.onLatchedChange(this.latchedNotes());
  }

  playNote(midiNote, velocity = 1.0) {
    this.changeKeys(() => this.arp.handleKeyDown(midiNote));
    if (!this.arp.enabled) this.engine.noteOn(midiNote, velocity);
  }

  stopNote(midiNote) {
    this.changeKeys(() => this.arp.handleKeyUp(midiNote));
  }

  setLatch(on) {
    this.changeKeys(() => this.arp.setLatch(on));
  }

  setArpEnabled(on) {
    if (on) {
      this.engine.allNotesOff();
      this.arp.setEnabled(true);
    } else {
      this.arp.setEnabled(false);
      // Without latch arp off stays silent, as before
      if (this.arp.latch) {
        for (const note of this.directNotes()) this.engine.noteOn(note);
      }
    }
    this.reportLatched();
  }

  /**
   * Power off and preset changes silence the voices: drop the latched chord with them (arp off only)
   */
  releaseLatch() {
    if (this.arp.enabled) return;
    this.changeKeys(() => {
      this.arp.latchedKeys = [];
    });
  }
}

window.NoteRouter = NoteRouter;
