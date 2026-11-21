/**
 * SYNTH BLOCKS • VOICE POOL
 * Polyphonic voice allocation over a fixed set of pre-built voices (Zero GC on note events).
 * Order: same note (retrigger) -> free voice -> oldest releasing voice -> steal the oldest
 * sounding voice with a fast choke.
 * A voice provides: isBusy, midiNote, startTime, releaseStartTime (0 = not releasing), choke(now).
 * Classic script: attaches to the window.SynthBlocks namespace.
 */
(function (blocks) {
  class VoicePool {
    constructor(voices = []) {
      this.voices = voices;
      /** @type {Map<number, any>} midiNote -> voice */
      this.active = new Map();
    }

    add(voice) {
      this.voices.push(voice);
    }

    allocate(midiNote, now) {
      const existing = this.active.get(midiNote);
      if (existing) return existing;

      for (const voice of this.voices) {
        if (!voice.isBusy) return voice;
      }

      let oldestReleased = null;
      let minReleaseTime = Infinity;
      for (const voice of this.voices) {
        if (voice.releaseStartTime > 0 && voice.releaseStartTime < minReleaseTime) {
          minReleaseTime = voice.releaseStartTime;
          oldestReleased = voice;
        }
      }
      if (oldestReleased) {
        this.unmap(oldestReleased);
        return oldestReleased;
      }

      let oldest = this.voices[0];
      for (let i = 1; i < this.voices.length; i++) {
        if (this.voices[i].startTime < oldest.startTime) oldest = this.voices[i];
      }
      try {
        oldest.choke(now);
      } catch (e) {}
      this.unmap(oldest);
      return oldest;
    }

    /**
     * Drops the note -> voice entry only if it still points at this voice. A releasing
     * voice keeps its midiNote while the same note may already sound on a newer voice;
     * deleting by note alone orphaned that newer voice (stuck note).
     */
    unmap(voice) {
      if (voice.midiNote !== null && this.active.get(voice.midiNote) === voice) {
        this.active.delete(voice.midiNote);
      }
    }

    assign(midiNote, voice) {
      this.active.set(midiNote, voice);
    }

    /**
     * Removes the note from the active map and returns its voice (null if not sounding)
     */
    take(midiNote) {
      const voice = this.active.get(midiNote);
      if (!voice) return null;
      this.active.delete(midiNote);
      return voice;
    }
  }

  Object.assign(blocks, { VoicePool });
})(/** @type {any} */ (window.SynthBlocks = window.SynthBlocks || {}));
