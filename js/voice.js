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
    if (on) this.tremoloGain.connect(this.engine.masterVoiceBus);
    else this.tremoloGain.disconnect();
    this.outputConnected = on;
  }

  // =========================================================================
  // GRAPH CONSTRUCTION
  // =========================================================================

  buildGraph() {
    this.buildLfoRouting();

    const vco1 = this.buildVcoPath(1);
    const vco2 = this.buildVcoPath(2);
    this.osc1 = vco1.osc;
    this.osc1DirectGain = vco1.directGain;
    this.osc1PulseGain = vco1.pulseGain;
    this.osc1PwShaper = vco1.pwShaper;
    this.osc2 = vco2.osc;
    this.osc2DirectGain = vco2.directGain;
    this.osc2PulseGain = vco2.pulseGain;
    this.osc2PwShaper = vco2.pwShaper;
    this.pwPlugged = [null, vco1.pwPlugged, vco2.pwPlugged];
    this.pwUnplugTimers = [null, null, null];

    const mixerBus = this.buildMixer(vco1, vco2);
    this.buildFilterAndAmp(mixerBus);
    this.connectLfoDestinations();

    // Continuous oscillators
    this.osc1.start(0);
    this.osc2.start(0);
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
      const makeGain = (amount) => {
        const g = engine.ctx.createGain();
        g.gain.setValueAtTime(amount, now);
        if (engine[`lfo${lfoNum}Gain`]) engine[`lfo${lfoNum}Gain`].connect(g);
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

    const makeLevel = (level) => {
      const g = ctx.createGain();
      g.gain.setValueAtTime(level, now);
      return g;
    };
    this.osc1Gain = makeLevel(engine.mixer.vco1Level);
    this.osc2Gain = makeLevel(engine.mixer.vco2Level);
    this.subGain = makeLevel(engine.mixer.subLevel);
    this.noiseGain = makeLevel(engine.mixer.noiseLevel);
    this.mixGains = { vco1Level: this.osc1Gain, vco2Level: this.osc2Gain, subLevel: this.subGain, noiseLevel: this.noiseGain };

    vco1.directGain.connect(this.osc1Gain);
    vco1.pulseGain.connect(this.osc1Gain);
    vco2.directGain.connect(this.osc2Gain);
    vco2.pulseGain.connect(this.osc2Gain);
    this.subOsc.connect(this.subGain);
    if (engine.sharedNoiseGain) engine.sharedNoiseGain.connect(this.noiseGain);

    const mixerBus = ctx.createGain();
    for (const g of Object.values(this.mixGains)) g.connect(mixerBus);
    return mixerBus;
  }

  /**
   * Drive -> cascaded VCF -> VCA -> Tremolo -> engine voice bus
   */
  buildFilterAndAmp(mixerBus) {
    const engine = this.engine;
    const ctx = engine.ctx;
    const now = ctx.currentTime;

    this.driveShaper = ctx.createWaveShaper();
    this.driveShaper.curve = SynthBlocks.driveCurve(engine.vcf.drive);
    this.driveShaper.oversample = '2x';
    mixerBus.connect(this.driveShaper);

    this.filter = new SynthBlocks.Filter(ctx);
    this.configureFilter(engine.vcf.cutoff);
    this.driveShaper.connect(this.filter.input);

    this.vca = ctx.createGain();
    this.vca.gain.setValueAtTime(0.0, now);
    this.filter.output.connect(this.vca);

    this.tremoloGain = ctx.createGain();
    this.tremoloGain.gain.setValueAtTime(1.0, now);
    this.vca.connect(this.tremoloGain);

    // VCA holds its running level on retrigger (no click), the filter jumps back to cutoff
    this.ampEnvelope = new SynthBlocks.Envelope(engine.ampEnv, { range: [0.0001, Infinity], holdOnTrigger: true });
    this.filterEnvelope = new SynthBlocks.Envelope(engine.filterEnv, { range: [SynthBlocks.Filter.MIN_CUTOFF, SynthBlocks.Filter.MAX_CUTOFF] });
    this.ampParams = [this.vca.gain];
    this.filterParams = this.filter.frequencyParams;
  }

  connectLfoDestinations() {
    for (const lfoNum of [1, 2]) {
      const route = this.lfo[lfoNum];
      route.pitch.connect(this.osc1.detune);
      route.pitch.connect(this.osc2.detune);
      for (const detune of this.filter.detuneParams) route.vcf.connect(detune);
      route.amp.connect(this.tremoloGain.gain);
    }
  }

  /**
   * VCO dual path: direct for Saw/Tri/Sine, WaveShaper comparator for Square/PWM
   */
  buildVcoPath(vcoNum) {
    const engine = this.engine;
    const ctx = engine.ctx;
    const now = ctx.currentTime;
    const wave = engine[`vco${vcoNum}`].wave;
    const isSquare = wave === 'square';

    const osc = ctx.createOscillator();
    osc.type = isSquare ? 'sawtooth' : wave;
    osc.frequency.setValueAtTime(440, now);

    const directGain = ctx.createGain();
    directGain.gain.setValueAtTime(isSquare ? 0.0 : 1.0, now);
    osc.connect(directGain);

    const pwScale = ctx.createGain();
    pwScale.gain.setValueAtTime(0.4, now);
    osc.connect(pwScale);

    const pwInput = ctx.createGain();
    pwInput.gain.setValueAtTime(1.0, now);
    pwScale.connect(pwInput);

    const pwOffset = engine[`vco${vcoNum}PwOffset`];
    if (pwOffset) pwOffset.connect(pwInput);
    for (const lfoNum of [1, 2]) {
      this.lfo[lfoNum].pwm[vcoNum - 1].connect(pwInput);
    }

    const pwShaper = ctx.createWaveShaper();
    pwShaper.curve = engine.pwmCurve;
    pwShaper.oversample = '4x';
    pwInput.connect(pwShaper);

    const pulseGain = ctx.createGain();
    pulseGain.gain.setValueAtTime(isSquare ? 1.0 : 0.0, now);
    // Plugged in only for square: an unplugged shaper is not rendered (4x oversampling is costly)
    if (isSquare) pwShaper.connect(pulseGain);

    return { osc, directGain, pulseGain, pwShaper, pwPlugged: isSquare };
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
    this.startPitch(this.osc1, vco1Freq, glideFrom, now);
    this.startPitch(this.osc2, vco2Freq, glideFrom && glideFrom * (vco2Freq / vco1Freq), now);

    this.subOsc.frequency.cancelScheduledValues(now);
    this.subOsc.frequency.setValueAtTime(this.getSubFrequency(baseFreq), now);

    // Mixer levels (velocity-scaled)
    for (const [key, node] of Object.entries(this.mixGains)) {
      node.gain.cancelScheduledValues(now);
      node.gain.setValueAtTime(engine.mixer[key] * velocity, now);
    }

    this.startFilterEnvelope(now);
    this.startAmpEnvelope(velocity, now);

    for (const lfoNum of [1, 2]) this.startLfoFadeIn(lfoNum, now);

    return vco1Freq;
  }

  startPitch(osc, targetFreq, glideFromFreq, now) {
    osc.frequency.cancelScheduledValues(now);
    if (glideFromFreq) {
      osc.frequency.setValueAtTime(glideFromFreq, now);
      osc.frequency.exponentialRampToValueAtTime(targetFreq, now + this.engine.glideTime);
    } else {
      osc.frequency.setValueAtTime(targetFreq, now);
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
    this.osc1.frequency.setTargetAtTime(engine.getVCO1Frequency(baseFreq), now, 0.015);
    this.osc2.frequency.setTargetAtTime(engine.getVCO2Frequency(baseFreq), now, 0.015);
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
    const isSquare = wave === 'square';
    this[`osc${vcoNum}`].type = isSquare ? 'sawtooth' : wave;
    this[`osc${vcoNum}DirectGain`].gain.setTargetAtTime(isSquare ? 0.0 : 1.0, now, 0.005);
    this[`osc${vcoNum}PulseGain`].gain.setTargetAtTime(isSquare ? 1.0 : 0.0, now, 0.005);

    clearTimeout(this.pwUnplugTimers[vcoNum]);
    this.pwUnplugTimers[vcoNum] = null;
    if (isSquare) {
      this.setPwPlugged(vcoNum, true);
    } else if (this.pwPlugged[vcoNum]) {
      // unplug once the pulse gain has faded out (10 time constants)
      this.pwUnplugTimers[vcoNum] = setTimeout(() => this.setPwPlugged(vcoNum, false), 50);
    }
  }

  setPwPlugged(vcoNum, on) {
    if (on === this.pwPlugged[vcoNum]) return;
    const shaper = this[`osc${vcoNum}PwShaper`];
    if (on) shaper.connect(this[`osc${vcoNum}PulseGain`]);
    else shaper.disconnect();
    this.pwPlugged[vcoNum] = on;
  }

  setMixLevel(key, level, now) {
    this.mixGains[key].gain.setTargetAtTime(level, now, 0.015);
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
