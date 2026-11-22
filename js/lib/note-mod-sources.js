/**
 * SYNTH BLOCKS • NOTE MODULATION SOURCES
 * Signals a played note offers a modulation matrix, as named ConstantSources (Zero GC):
 *   <envelope name>     one per given envelope: its ADSR shape, normalized to 0..1
 *   velocity            0..1, key  -1..1 (0 at middle C, +-1 five octaves away), random  -1..1 per note
 * The sources are created unstarted: pass Object.keys(nodes) as the matrix's idle list, so only
 * routed sources ever run. trigger() on note on, release() on note off.
 * An envelope whose settings have loop: true repeats attack and decay while the note is held
 * (LFO-like); cycles are scheduled LOOP_HORIZON ahead and refilled every LOOP_REFILL_MS.
 * Classic script: attaches to the window.SynthBlocks namespace.
 */
(function (blocks) {
  const KEY_CENTER = 60;
  const KEY_SPAN = 60;
  const LOOP_HORIZON = 2;
  const LOOP_REFILL_MS = 500;
  const SHAPE = { start: 0.0001, peak: 1 };
  // Loop jitter: each cycle lasts 2^(jitter * r) times as long, r random in -1..1 (jitter 1: half to double)
  const jitterScale = (stages) => () => (stages.jitter ? Math.pow(2, stages.jitter * (Math.random() * 2 - 1)) : 1);

  class NoteModSources {
    /**
     * @param {object} envelopes name -> live ADSR settings object, e.g. filterEnv, ampEnv
     */
    constructor(ctx, envelopes) {
      const now = ctx.currentTime;
      this.ctx = ctx;
      this.loopTimer = null;
      const constant = (value) => {
        const source = ctx.createConstantSource();
        source.offset.setValueAtTime(value, now);
        return source;
      };
      this.nodes = {};
      // { node, envelope, stages, cycleScale, loopEnd } per envelope name; loopEnd: end of the scheduled loop cycles
      this.envelopes = Object.entries(envelopes).map(([name, stages]) => {
        this.nodes[name] = constant(0);
        return {
          node: this.nodes[name],
          envelope: new blocks.Envelope(stages, { range: [0.0001, 1] }),
          stages,
          cycleScale: jitterScale(stages),
          loopEnd: 0
        };
      });
      Object.assign(this.nodes, { velocity: constant(1), key: constant(0), random: constant(0) });
    }

    trigger(midiNote, velocity, now) {
      const { velocity: vel, key, random } = this.nodes;
      vel.offset.setValueAtTime(velocity, now);
      key.offset.setValueAtTime(Math.max(-1, Math.min(1, (midiNote - KEY_CENTER) / KEY_SPAN)), now);
      random.offset.setValueAtTime(Math.random() * 2 - 1, now);
      this.stopLoop();
      for (const env of this.envelopes) {
        if (env.stages.loop) {
          env.loopEnd = env.envelope.loop([env.node.offset], now, now + LOOP_HORIZON, {
            ...SHAPE,
            first: true,
            cycleScale: env.cycleScale
          });
        } else {
          env.envelope.trigger([env.node.offset], now, SHAPE);
        }
      }
      if (this.envelopes.some((env) => env.stages.loop)) this.scheduleRefill();
    }

    release(now) {
      this.stopLoop();
      for (const { node, envelope } of this.envelopes) envelope.release([node.offset], now, 0);
    }

    // Keeps looping envelopes scheduled LOOP_HORIZON ahead while the note is held
    scheduleRefill() {
      this.loopTimer = setTimeout(() => {
        const until = this.ctx.currentTime + LOOP_HORIZON;
        for (const env of this.envelopes) {
          if (env.stages.loop && env.loopEnd < until) {
            env.loopEnd = env.envelope.loop([env.node.offset], env.loopEnd, until, {
              ...SHAPE,
              cycleScale: env.cycleScale
            });
          }
        }
        this.scheduleRefill();
      }, LOOP_REFILL_MS);
    }

    stopLoop() {
      if (this.loopTimer) clearTimeout(this.loopTimer);
      this.loopTimer = null;
    }
  }

  Object.assign(blocks, { NoteModSources });
})(/** @type {any} */ (window.SynthBlocks = window.SynthBlocks || {}));
