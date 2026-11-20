/**
 * RETROVOX SUB-1 • SYNTH VOICE
 * One persistent polyphonic voice: Dual-VCO (direct + 4x-oversampled PWM path), Sub-Osc, Noise,
 * Drive, cascaded VCF, VCA with ADSR and Tremolo, plus per-voice LFO 1 / LFO 2 routing gains.
 * Voices are built once on AudioContext startup and re-triggered without allocating nodes (Zero GC).
 * A voice reads the current patch from its engine (vco1/vco2/mixer/vcf/filterEnv/ampEnv/lfo1/lfo2).
 */

// LFO destination depth at amount 1.0: cents for pitch/vcf, gain units for pwm/amp
const LFO_DESTINATIONS = ['pitch', 'vcf', 'pwm', 'amp'];
const LFO_DEPTH = { pitch: 200, vcf: 3600, pwm: 0.35, amp: 0.45 };

// Modulation matrix: source labels and targets with their depth at amount 1.0 (units as in buildModTargets)
const SUB1_MOD_SOURCES = {
  lfo1: 'LFO 1',
  lfo2: 'LFO 2',
  filterEnv: 'FILTER ENV',
  ampEnv: 'AMP ENV',
  velocity: 'VELOCITY',
  key: 'KEY',
  random: 'RANDOM',
  modWheel: 'MOD WHEEL'
};
const SUB1_MOD_TARGETS = {
  pitch: { label: 'PITCH', depth: 1200 },
  vco2Pitch: { label: 'VCO 2 PITCH', depth: 1200 },
  pwm: { label: 'PULSE WIDTH', depth: 0.45 },
  vcf: { label: 'CUTOFF', depth: 4800 },
  resonance: { label: 'RESONANCE', depth: 8 },
  amp: { label: 'AMP', depth: 0.5 },
  subLevel: { label: 'SUB LEVEL', depth: 0.8 },
  noiseLevel: { label: 'NOISE LEVEL', depth: 0.8 }
};
// KEY source: 0 at middle C, +-1 five octaves away
const MOD_KEY_CENTER = 60;
const MOD_KEY_SPAN = 60;

const VOICE_PEAK_GAIN = 0.40;

class Voice {
  constructor(engine, id) {
    this.engine = engine;
    this.id = id;
    this.isBusy = false;
    this.midiNote = null;
    this.startTime = 0;
    this.releaseStartTime = 0;
    this.baseFreq = 440;
    this.voiceCutoff = engine.vcf.cutoff;
    this.cleanupTimer = null;
    this.outputConnected = false;

    this.buildGraph();
  }

  /**
   * Idle voices stay off the master bus: the audio thread only renders nodes that feed
   * the destination, so 12 always-running voices would otherwise cost CPU while silent.
   */
  setOutputConnected(on) {
    if (on === this.outputConnected) return;
    if (on) this.vca.output.connect(this.engine.masterVoiceBus);
    else this.vca.output.disconnect();
    this.outputConnected = on;
  }

  // =========================================================================
  // GRAPH CONSTRUCTION
  // =========================================================================

  buildGraph() {
    this.buildLfoRouting();

    // VCOs by number (index 0 unused, like the LFO routing)
    this.vco = [null, this.buildVco(1), this.buildVco(2)];

    const mixerBus = this.buildMixer(this.vco[1], this.vco[2]);
    this.buildFilterAndAmp(mixerBus);
    this.modTargets = this.buildModTargets();
    this.connectLfoDestinations();
    this.buildModMatrix();

    // Continuous oscillators
    this.vco[1].start(0);
    this.vco[2].start(0);
    this.subOsc.start(0);
  }

  /**
   * LFO routing gains per LFO number (index 0 unused), fed by the engine's global LFOs.
   * pwm holds one gain per VCO.
   */
  buildLfoRouting() {
    const engine = this.engine;
    const now = engine.ctx.currentTime;
    this.lfo = [null];
    for (const lfoNum of [1, 2]) {
      const dest = engine.getLfo(lfoNum).destinations;
      const source = engine.lfos[lfoNum];
      const makeGain = (amount) => {
        const g = engine.ctx.createGain();
        g.gain.setValueAtTime(amount, now);
        if (source) source.output.connect(g);
        return g;
      };
      this.lfo.push({
        pitch: makeGain(dest.pitch * LFO_DEPTH.pitch),
        vcf: makeGain(dest.vcf * LFO_DEPTH.vcf),
        pwm: [makeGain(dest.pwm * LFO_DEPTH.pwm), makeGain(dest.pwm * LFO_DEPTH.pwm)],
        amp: makeGain(dest.amp * LFO_DEPTH.amp)
      });
    }
  }

  /**
   * Sub-oscillator, shared noise and the four mixer level gains summed into one bus
   */
  buildMixer(vco1, vco2) {
    const engine = this.engine;
    const ctx = engine.ctx;
    const now = ctx.currentTime;

    this.subOsc = ctx.createOscillator();
    this.subOsc.type = 'triangle';
    this.subOsc.frequency.setValueAtTime(220, now);

    const { vco1Level, vco2Level, subLevel, noiseLevel } = engine.mixer;
    this.mixer = new SynthBlocks.Mixer(ctx, { vco1Level, vco2Level, subLevel, noiseLevel });

    vco1.connect(this.mixer.input('vco1Level'));
    vco2.connect(this.mixer.input('vco2Level'));
    this.subOsc.connect(this.mixer.input('subLevel'));
    if (engine.sharedNoiseGain) engine.sharedNoiseGain.connect(this.mixer.input('noiseLevel'));
    return this.mixer.output;
  }

  /**
   * Drive -> cascaded VCF -> VCA -> Tremolo -> engine voice bus
   */
  buildFilterAndAmp(mixerBus) {
    const engine = this.engine;
    const ctx = engine.ctx;

    this.drive = new SynthBlocks.Drive(ctx, engine.vcf.drive);
    mixerBus.connect(this.drive.input);

    this.filter = new SynthBlocks.Filter(ctx);
    this.configureFilter(engine.vcf.cutoff);
    this.drive.output.connect(this.filter.input);

    this.vca = new SynthBlocks.Vca(ctx);
    this.filter.output.connect(this.vca.input);

    // VCA holds its running level on retrigger (no click), the filter jumps back to cutoff
    this.ampEnvelope = new SynthBlocks.Envelope(engine.ampEnv, { range: [0.0001, Infinity], holdOnTrigger: true });
    this.filterEnvelope = new SynthBlocks.Envelope(engine.filterEnv, { range: [SynthBlocks.Filter.MIN_CUTOFF, SynthBlocks.Filter.MAX_CUTOFF] });
    this.ampParams = [this.vca.gain];
    this.filterParams = this.filter.frequencyParams;
  }

  /**
   * Modulation inputs by name: AudioParams or nodes a modulation signal connects to.
   * pitch and vcf in cents, pwm in pulse width units, resonance in Q, amp and levels in gain.
   */
  buildModTargets() {
    return {
      pitch: [this.vco[1].detune, this.vco[2].detune],
      vco2Pitch: [this.vco[2].detune],
      pwm: [this.vco[1].pwInput, this.vco[2].pwInput],
      vcf: this.filter.detuneParams,
      resonance: this.filter.qParams,
      amp: [this.vca.tremoloGain],
      subLevel: [this.mixer.input('subLevel').gain],
      noiseLevel: [this.mixer.input('noiseLevel').gain]
    };
  }

  /**
   * Per-voice matrix sources (envelopes, velocity, key, random as constant signals) plus the
   * engine's LFOs and mod wheel, routed by engine.modMatrix. The constant sources start on their
   * first route, so a voice whose matrix stays empty runs none of them.
   */
  buildModMatrix() {
    const engine = this.engine;
    const ctx = engine.ctx;
    const now = ctx.currentTime;
    const constant = (value) => {
      const source = ctx.createConstantSource();
      source.offset.setValueAtTime(value, now);
      return source;
    };
    this.modSources = {
      filterEnv: constant(0),
      ampEnv: constant(0),
      velocity: constant(1),
      key: constant(0),
      random: constant(0)
    };
    // Same stages as the filter and amp envelopes, normalized to 0..1
    this.filterModEnvelope = new SynthBlocks.Envelope(engine.filterEnv, { range: [0.0001, 1] });
    this.ampModEnvelope = new SynthBlocks.Envelope(engine.ampEnv, { range: [0.0001, 1] });

    const depths = {};
    for (const [name, target] of Object.entries(SUB1_MOD_TARGETS)) depths[name] = target.depth;
    const lfoOutput = (n) => (engine.lfos[n] ? engine.lfos[n].output : null);
    this.modMatrix = new SynthBlocks.ModMatrix(ctx, {
      sources: {
        lfo1: lfoOutput(1),
        lfo2: lfoOutput(2),
        ...this.modSources,
        modWheel: engine.modWheelSource
      },
      targets: this.modTargets,
      depths,
      slots: engine.modSlots(),
      idle: Object.keys(this.modSources)
    });
  }

  /**
   * Note-dependent matrix sources: velocity, key position, a new random value, both mod envelopes
   */
  startModSources(midiNote, velocity, now) {
    const { velocity: vel, key, random } = this.modSources;
    vel.offset.setValueAtTime(velocity, now);
    key.offset.setValueAtTime(Math.max(-1, Math.min(1, (midiNote - MOD_KEY_CENTER) / MOD_KEY_SPAN)), now);
    random.offset.setValueAtTime(Math.random() * 2 - 1, now);
    this.filterModEnvelope.trigger([this.modSources.filterEnv.offset], now, { start: 0.0001, peak: 1 });
    this.ampModEnvelope.trigger([this.modSources.ampEnv.offset], now, { start: 0.0001, peak: 1 });
  }

  connectLfoDestinations() {
    for (const lfoNum of [1, 2]) {
      const route = this.lfo[lfoNum];
      for (const dest of ['pitch', 'vcf', 'amp']) {
        for (const target of this.modTargets[dest]) route[dest].connect(target);
      }
    }
  }

  /**
   * One VCO with the engine's static pulse width offset and both LFO PWM routes on its PW input
   */
  buildVco(vcoNum) {
    const engine = this.engine;
    const vco = new SynthBlocks.Vco(engine.ctx, { wave: engine[`vco${vcoNum}`].wave, pwmCurve: engine.pwmCurve });

    const pwOffset = engine[`vco${vcoNum}PwOffset`];
    if (pwOffset) pwOffset.connect(vco.pwInput);
    for (const lfoNum of [1, 2]) {
      this.lfo[lfoNum].pwm[vcoNum - 1].connect(vco.pwInput);
    }
    return vco;
  }

  // =========================================================================
  // NOTE LIFECYCLE
  // =========================================================================

  /**
   * Starts a note: pitch with glide, velocity-scaled mixer, filter and amp envelopes, LFO fade-in.
   * Returns the VCO 1 frequency (the engine keeps it as glide source).
   */
  trigger(midiNote, velocity, now) {
    const engine = this.engine;

    if (this.cleanupTimer) {
      clearTimeout(this.cleanupTimer);
      this.cleanupTimer = null;
    }

    this.isBusy = true;
    this.setOutputConnected(true);
    this.midiNote = midiNote;
    this.startTime = now;
    this.releaseStartTime = 0;

    const baseFreq = engine.midiNoteToFrequency(midiNote);
    const vco1Freq = engine.getVCO1Frequency(baseFreq);
    const vco2Freq = engine.getVCO2Frequency(baseFreq);
    this.baseFreq = baseFreq;
    this.voiceCutoff = engine.getVoiceCutoffFrequency(midiNote);

    // VCO 1 & 2 with Glide (VCO 2 keeps its interval to VCO 1 while gliding)
    const glideFrom = engine.glideEnabled && engine.lastFrequency ? engine.lastFrequency : null;
    this.startPitch(this.vco[1], vco1Freq, glideFrom, now);
    this.startPitch(this.vco[2], vco2Freq, glideFrom && glideFrom * (vco2Freq / vco1Freq), now);

    this.subOsc.frequency.cancelScheduledValues(now);
    this.subOsc.frequency.setValueAtTime(this.getSubFrequency(baseFreq), now);

    this.mixer.setLevelsAt(engine.mixer, velocity, now);

    this.startFilterEnvelope(now);
    this.startAmpEnvelope(velocity, now);

    for (const lfoNum of [1, 2]) this.startLfoFadeIn(lfoNum, now);
    this.startModSources(midiNote, velocity, now);

    return vco1Freq;
  }

  startPitch(vco, targetFreq, glideFromFreq, now) {
    vco.frequency.cancelScheduledValues(now);
    if (glideFromFreq) {
      vco.frequency.setValueAtTime(glideFromFreq, now);
      vco.frequency.exponentialRampToValueAtTime(targetFreq, now + this.engine.glideTime);
    } else {
      vco.frequency.setValueAtTime(targetFreq, now);
    }
  }

  startFilterEnvelope(now) {
    const cutoff = this.voiceCutoff;
    this.configureFilter(cutoff);

    const peak = Math.max(20, Math.min(20000, cutoff * Math.pow(2, this.engine.vcf.envMod * 3.5)));
    this.filterEnvelope.trigger(this.filterParams, now, { start: Math.max(20, cutoff), base: cutoff, peak });
  }

  startAmpEnvelope(velocity, now) {
    const peak = Math.max(0.0001, VOICE_PEAK_GAIN * velocity);
    this.ampEnvelope.trigger(this.ampParams, now, { start: 0.00001, base: 0, peak });
  }

  /**
   * Sets every LFO depth for a new note, ramping in from 0 when the LFO has a fade-in time
   */
  startLfoFadeIn(lfoNum, now) {
    const lfo = this.engine.getLfo(lfoNum);
    const fade = lfo.fadeIn || 0;
    for (const dest of LFO_DESTINATIONS) {
      const amount = lfo.destinations[dest] * LFO_DEPTH[dest];
      for (const node of this.lfoNodes(lfoNum, dest)) {
        if (fade > 0.01) {
          node.gain.setValueAtTime(0, now);
          node.gain.linearRampToValueAtTime(amount, now + fade);
        } else {
          node.gain.setValueAtTime(amount, now);
        }
      }
    }
  }

  /**
   * Starts the asymptotic VCA and VCF release; the voice frees itself once the tail has decayed
   */
  release(now) {
    this.releaseStartTime = now;

    try {
      this.ampEnvelope.release(this.ampParams, now, 0.0);
    } catch (e) {}

    try {
      this.filterEnvelope.release(this.filterParams, now, this.voiceCutoff);
    } catch (e) {}

    this.filterModEnvelope.release([this.modSources.filterEnv.offset], now, 0);
    this.ampModEnvelope.release([this.modSources.ampEnv.offset], now, 0);

    // Mark voice as idle and unplug it once the tail is inaudible (3x release = 9 time
    // constants, about -78 dB), unless re-triggered meanwhile
    const releaseTime = Math.max(this.ampEnvelope.releaseTime, this.filterEnvelope.releaseTime);
    const cleanupDelayMs = (releaseTime * 3 + 0.05) * 1000;
    if (this.cleanupTimer) clearTimeout(this.cleanupTimer);
    this.cleanupTimer = setTimeout(() => {
      if (this.releaseStartTime === now) {
        this.isBusy = false;
        this.midiNote = null;
        this.releaseStartTime = 0;
        this.setOutputConnected(false);
      }
    }, cleanupDelayMs);
  }

  /**
   * Fast fade to silence when the voice pool steals this voice
   */
  choke(now) {
    this.vca.choke(now);
  }

  // =========================================================================
  // LIVE PARAMETER UPDATES
  // =========================================================================

  getSubFrequency(baseFreq) {
    const engine = this.engine;
    return baseFreq * Math.pow(2, engine.mixer.subOctave) * engine.pitchBendFactor;
  }

  /**
   * Re-tunes a sounding voice after octave, detune, pitch bend or sub-octave changes
   */
  updateFrequencies(now) {
    if (this.midiNote === null) return;
    const engine = this.engine;
    const baseFreq = engine.midiNoteToFrequency(this.midiNote);
    this.vco[1].frequency.setTargetAtTime(engine.getVCO1Frequency(baseFreq), now, 0.015);
    this.vco[2].frequency.setTargetAtTime(engine.getVCO2Frequency(baseFreq), now, 0.015);
    this.subOsc.frequency.setTargetAtTime(this.getSubFrequency(baseFreq), now, 0.015);
  }

  updateFilter() {
    const engine = this.engine;
    this.voiceCutoff = this.midiNote !== null ? engine.getVoiceCutoffFrequency(this.midiNote) : engine.vcf.cutoff;
    this.configureFilter(this.voiceCutoff);
  }

  /**
   * Switches a VCO between the direct path and the PWM pulse path
   */
  setWave(vcoNum, wave, now) {
    this.vco[vcoNum].setWave(wave, now);
  }

  setMixLevel(key, level, now) {
    this.mixer.setLevel(key, level, now);
  }

  lfoNodes(lfoNum, dest) {
    const node = this.lfo[lfoNum][dest];
    return Array.isArray(node) ? node : [node];
  }

  setLfoAmount(lfoNum, dest, amount, now, timeConstant) {
    for (const node of this.lfoNodes(lfoNum, dest)) {
      node.gain.setTargetAtTime(amount, now, timeConstant);
    }
  }

  /**
   * Applies the patch's VCF mode and resonance at the given cutoff
   */
  configureFilter(cutoff) {
    const { type, resonance } = this.engine.vcf;
    this.filter.configure(type, resonance, cutoff);
  }
}

window.Voice = Voice;
window.SUB1_MOD_SOURCES = SUB1_MOD_SOURCES;
window.SUB1_MOD_TARGETS = SUB1_MOD_TARGETS;
