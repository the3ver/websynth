/**
 * SYNTH BLOCKS • MODULATION MATRIX
 * Routes named modulation sources to named targets, one fixed gain per slot (Zero GC).
 *   sources  { name: AudioNode }               signals in -1..1 or 0..1 (LFO, envelope, velocity ...)
 *   targets  { name: [AudioParam | AudioNode] } where a routed signal is added
 *   depths   { targetName: number }             target units at amount 1.0 (cents, Q, gain)
 *   slots    live [{ source, dest, amount }]    amount -1..1; 'off' or unknown names leave a slot unplugged
 *   idle     [sourceName]                       scheduled sources not started yet: each starts on its first
 *                                               route, so sources no slot uses never run
 * applySlot(i) / applyAll() push slot changes. A slot is only connected while it has a known source,
 * a known target and an amount other than 0, so empty slots cost no DSP time.
 * Classic script: attaches to the window.SynthBlocks namespace.
 */
(function (blocks) {
  const AMOUNT_RAMP = 0.015;

  class ModMatrix {
    constructor(ctx, { sources, targets, depths, slots, idle = [] }) {
      this.ctx = ctx;
      this.sources = sources;
      this.targets = targets;
      this.depths = depths;
      this.slots = slots;
      this.idle = new Set(idle);
      const now = ctx.currentTime;
      this.gains = slots.map(() => {
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, now);
        return g;
      });
      // Connected route per slot: { source, dest } or null
      this.routes = slots.map(() => null);
      this.applyAll();
    }

    isRoutable({ source, dest, amount }) {
      return Boolean(this.sources[source] && this.targets[dest] && amount);
    }

    applySlot(index) {
      const slot = this.slots[index];
      const gain = this.gains[index];
      const route = this.routes[index];
      const wanted = this.isRoutable(slot) ? slot : null;

      if (route && (!wanted || route.source !== wanted.source || route.dest !== wanted.dest)) {
        this.sources[route.source].disconnect(gain);
        gain.disconnect();
        this.routes[index] = null;
      }
      if (wanted && !this.routes[index]) {
        const source = this.sources[wanted.source];
        if (this.idle.delete(wanted.source)) source.start(this.ctx.currentTime);
        source.connect(gain);
        for (const target of this.targets[wanted.dest]) gain.connect(target);
        this.routes[index] = { source: wanted.source, dest: wanted.dest };
      }

      const amount = wanted ? wanted.amount * (this.depths[wanted.dest] || 0) : 0;
      gain.gain.setTargetAtTime(amount, this.ctx.currentTime, AMOUNT_RAMP);
    }

    applyAll() {
      for (let i = 0; i < this.slots.length; i++) this.applySlot(i);
    }
  }

  // Slot names a synth's matrix uses (preset paths modMatrix.slotN)
  ModMatrix.SLOTS = ['slot1', 'slot2', 'slot3', 'slot4', 'slot5', 'slot6', 'slot7', 'slot8'];

  Object.assign(blocks, { ModMatrix });
})((window.SynthBlocks = window.SynthBlocks || {}));
