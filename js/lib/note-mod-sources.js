/**
 * SYNTH BLOCKS • NOTE MODULATION SOURCES
 * Signals a played note offers a modulation matrix, as named ConstantSources (Zero GC):
 *   <envelope name>     one per given envelope: its ADSR shape, normalized to 0..1
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
     * @param envelopes { name: live ADSR settings object }, e.g. { filterEnv, ampEnv }
     */
    constructor(ctx, envelopes) {
      const now = ctx.currentTime;
      const constant = (value) => {
        const source = ctx.createConstantSource();
        source.offset.setValueAtTime(value, now);
        return source;
      };
      this.nodes = {};
      // { node, envelope, stages } per envelope name
      this.envelopes = Object.entries(envelopes).map(([name, stages]) => {
        this.nodes[name] = constant(0);
        return { node: this.nodes[name], envelope: new blocks.Envelope(stages, { range: [0.0001, 1] }), stages };
      });
      Object.assign(this.nodes, { velocity: constant(1), key: constant(0), random: constant(0) });
    }

    trigger(midiNote, velocity, now) {
      const { velocity: vel, key, random } = this.nodes;
      vel.offset.setValueAtTime(velocity, now);
      key.offset.setValueAtTime(Math.max(-1, Math.min(1, (midiNote - KEY_CENTER) / KEY_SPAN)), now);
      random.offset.setValueAtTime(Math.random() * 2 - 1, now);
      for (const { node, envelope } of this.envelopes) envelope.trigger([node.offset], now, { start: 0.0001, peak: 1 });
    }

    release(now) {
      for (const { node, envelope } of this.envelopes) envelope.release([node.offset], now, 0);
    }
  }

  Object.assign(blocks, { NoteModSources });
})(window.SynthBlocks = window.SynthBlocks || {});
