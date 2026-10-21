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

// Minimum envelope segment, keeps exponential ramps click-free
const MIN_ENV_TIME = 0.004;
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

    this.buildGraph();
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
    this.osc2 = vco2.osc;
    this.osc2DirectGain = vco2.directGain;
    this.osc2PulseGain = vco2.pulseGain;

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
    this.driveShaper.curve = engine.makeDistortionCurve(engine.vcf.drive);
    this.driveShaper.oversample = '2x';
    mixerBus.connect(this.driveShaper);

    this.vcf1 = ctx.createBiquadFilter();
    this.vcf2 = ctx.createBiquadFilter();
    this.configureFilter(engine.vcf.cutoff);
    this.driveShaper.connect(this.vcf1);
    this.vcf1.connect(this.vcf2);

    this.vca = ctx.createGain();
    this.vca.gain.setValueAtTime(0.0, now);
    this.vcf2.connect(this.vca);

    this.tremoloGain = ctx.createGain();
    this.tremoloGain.gain.setValueAtTime(1.0, now);
    this.vca.connect(this.tremoloGain);
    this.tremoloGain.connect(engine.masterVoiceBus);
  }

  connectLfoDestinations() {
    for (const lfoNum of [1, 2]) {
      const route = this.lfo[lfoNum];
      route.pitch.connect(this.osc1.detune);
      route.pitch.connect(this.osc2.detune);
      route.vcf.connect(this.vcf1.detune);
      route.vcf.connect(this.vcf2.detune);
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
    pwShaper.connect(pulseGain);

    return { osc, directGain, pulseGain };
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
    const { vcf, filterEnv } = this.engine;
    const cutoff = this.voiceCutoff;
    this.configureFilter(cutoff);

    const envPeakCutoff = Math.max(20, Math.min(20000, cutoff * Math.pow(2, vcf.envMod * 3.5)));
    const envSustainCutoff = Math.max(20, Math.min(20000, cutoff + ((envPeakCutoff - cutoff) * filterEnv.sustain)));
    const attack = Math.max(MIN_ENV_TIME, filterEnv.attack);
    const decay = Math.max(MIN_ENV_TIME, filterEnv.decay);

    for (const filter of [this.vcf1, this.vcf2]) {
      filter.frequency.cancelScheduledValues(now);
      filter.frequency.setValueAtTime(Math.max(20, cutoff), now);
      filter.frequency.exponentialRampToValueAtTime(envPeakCutoff, now + attack);
      filter.frequency.exponentialRampToValueAtTime(envSustainCutoff, now + attack + decay);
    }
  }

  startAmpEnvelope(velocity, now) {
    const { ampEnv } = this.engine;
    const peakGain = Math.max(0.0001, VOICE_PEAK_GAIN * velocity);
    const sustainGain = Math.max(0.0001, peakGain * ampEnv.sustain);
    const attack = Math.max(MIN_ENV_TIME, ampEnv.attack);
    const decay = Math.max(MIN_ENV_TIME, ampEnv.decay);

    holdParam(this.vca.gain, now);
    this.vca.gain.setValueAtTime(0.00001, now);
    this.vca.gain.exponentialRampToValueAtTime(peakGain, now + attack);
    this.vca.gain.exponentialRampToValueAtTime(sustainGain, now + attack + decay);
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
    const { ampEnv, filterEnv } = this.engine;
    this.releaseStartTime = now;

    const ampRelTime = Math.max(0.008, ampEnv.release);
    const vcfRelTime = Math.max(0.008, filterEnv.release);

    try {
      holdParam(this.vca.gain, now);
      this.vca.gain.setTargetAtTime(0.0, now, Math.max(0.003, ampRelTime / 3.0));
    } catch (e) {}

    try {
      for (const filter of [this.vcf1, this.vcf2]) {
        holdParam(filter.frequency, now);
        filter.frequency.setTargetAtTime(this.voiceCutoff, now, Math.max(0.003, vcfRelTime / 3.0));
      }
    } catch (e) {}

    // Mark voice as idle after the full release (unless re-triggered meanwhile)
    const cleanupDelayMs = (Math.max(ampRelTime, vcfRelTime) * 1.5 + 0.05) * 1000;
    if (this.cleanupTimer) clearTimeout(this.cleanupTimer);
    this.cleanupTimer = setTimeout(() => {
      if (this.releaseStartTime === now) {
        this.isBusy = false;
        this.midiNote = null;
        this.releaseStartTime = 0;
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
   * Sets filter types and Q staging for the selected VCF mode (24dB = two cascaded 12dB stages)
   */
  configureFilter(cutoff) {
    const { resonance, type } = this.engine.vcf;
    const now = this.engine.ctx.currentTime;
    const safeCutoff = Math.max(20, Math.min(20000, cutoff));
    const clampQ = (lo, hi, factor) => Math.max(lo, Math.min(hi, resonance * factor));
    const modes = {
      lowpass24: ['lowpass', 'lowpass', clampQ(0.5, 7.5, 0.38), clampQ(0.5, 9.0, 0.48)],
      lowpass12: ['lowpass', 'allpass', clampQ(0.5, 14.0, 0.7), 0.1],
      bandpass: ['bandpass', 'bandpass', clampQ(0.6, 8.0, 0.42), clampQ(0.6, 8.0, 0.42)],
      highpass: ['highpass', 'highpass', clampQ(0.5, 7.5, 0.38), clampQ(0.5, 9.0, 0.48)]
    };
    const mode = modes[type];
    if (!mode) return;
    const [type1, type2, q1, q2] = mode;

    this.vcf1.type = type1;
    this.vcf2.type = type2;
    this.vcf1.frequency.setValueAtTime(safeCutoff, now);
    this.vcf2.frequency.setValueAtTime(safeCutoff, now);
    this.vcf1.Q.setValueAtTime(q1, now);
    this.vcf2.Q.setValueAtTime(q2, now);
  }
}

/**
 * Freezes an AudioParam at its current value (falls back to cancelScheduledValues on old Safari)
 */
function holdParam(param, now) {
  if (param.cancelAndHoldAtTime) {
    param.cancelAndHoldAtTime(now);
  } else {
    param.cancelScheduledValues(now);
  }
}

window.Voice = Voice;
