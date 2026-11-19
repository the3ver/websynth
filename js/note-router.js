/**
 * NOTE ROUTER
 * Sends keybed and PC-keyboard notes to the arpeggiator when it is on, otherwise to the voices.
 * The arp and latch switches of the panel go through here as well. DOM-free.
 */

class NoteRouter {
  constructor(engine, arp) {
    this.engine = engine;
    this.arp = arp;
  }

  playNote(midiNote) {
    if (this.arp.enabled) {
      this.arp.handleKeyDown(midiNote);
    } else {
      this.engine.noteOn(midiNote);
    }
  }

  stopNote(midiNote) {
    if (this.arp.enabled) {
      this.arp.handleKeyUp(midiNote);
    } else {
      this.engine.noteOff(midiNote);
    }
  }

  setArpEnabled(on) {
    this.arp.setEnabled(on);
  }

  setLatch(on) {
    this.arp.setLatch(on);
  }
}

window.NoteRouter = NoteRouter;
