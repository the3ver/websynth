/**
 * SYNTH BLOCKS • NOTE MODULATION SOURCES
 * Signals a played note offers a modulation matrix, as named ConstantSources (Zero GC):
 *   filterEnv, ampEnv   ADSR shapes of the given envelope settings, normalized to 0..1
 *   velocity            0..1, key  -1..1 (0 at middle C, +-1 five octaves away), random  -1..1 per note
 * The sources are created unstarted: pass Object.keys(nodes) as the matrix's idle list, so only
 * routed sources ever run. trigger() on note on, release() on note off.
 * Classic script: attaches to the window.SynthBlocks namespace.
 */
(function (blocks) {
  const KEY_CENTER = 60;
  const KEY_SPAN = 60;

  class NoteModSources {
    /**
     * @param envelopes { filterEnv, ampEnv } live ADSR settings objects
     */
    constructor(ctx, { filterEnv, ampEnv }) {
      const now = ctx.currentTime;
      const constant = (value) => {
        const source = ctx.createConstantSource();
        source.offset.setValueAtTime(value, now);
        return source;
      };
      this.nodes = {
        filterEnv: constant(0),
        ampEnv: constant(0),
        velocity: constant(1),
        key: constant(0),
        random: constant(0)
      };
      this.filterEnvelope = new blocks.Envelope(filterEnv, { range: [0.0001, 1] });
      this.ampEnvelope = new blocks.Envelope(ampEnv, { range: [0.0001, 1] });
    }

    trigger(midiNote, velocity, now) {
      const { velocity: vel, key, random, filterEnv, ampEnv } = this.nodes;
      vel.offset.setValueAtTime(velocity, now);
      key.offset.setValueAtTime(Math.max(-1, Math.min(1, (midiNote - KEY_CENTER) / KEY_SPAN)), now);
      random.offset.setValueAtTime(Math.random() * 2 - 1, now);
      this.filterEnvelope.trigger([filterEnv.offset], now, { start: 0.0001, peak: 1 });
      this.ampEnvelope.trigger([ampEnv.offset], now, { start: 0.0001, peak: 1 });
    }

    release(now) {
      this.filterEnvelope.release([this.nodes.filterEnv.offset], now, 0);
      this.ampEnvelope.release([this.nodes.ampEnv.offset], now, 0);
    }
  }

  Object.assign(blocks, { NoteModSources });
})(window.SynthBlocks = window.SynthBlocks || {});
