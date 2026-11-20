/**
 * RETROVOX SUB-1 • SUBTRACTIVE SYNTH ENGINE
 * Dual-VCO with PWM, sub-oscillator and noise, 24dB multi-mode VCF with drive and key tracking,
 * filter and amp ADSR, two LFOs (multi-wave, S&H, fade-in; pitch, VCF, PWM, amp targets).
 * Shared polyphony, FX rack, master bus, MIDI and presets come from PolySynthEngine.
 */

class AudioEngine extends PolySynthEngine {
  constructor() {
    super({ params: SynthParams, maxVoices: 12 });
    this.noiseBuffer = null;
    this.sharedNoiseSource = null;
    this.sharedNoiseGain = null;
    this.pwmCurve = null;
    this.vco1PwOffset = null;
    this.vco2PwOffset = null;

    // Dual-VCO Parameters
    this.vco1 = {
      wave: 'sawtooth', // 'sawtooth', 'square', 'triangle', 'sine'
      octave: 0,        // -2 (32'), -1 (16'), 0 (8'), 1 (4'), 2 (2')
      pulseWidth: 0.5   // 0.1 to 0.9
    };

    this.vco2 = {
      wave: 'square',
      octave: 0,
      semitone: 0,      // -24 to +24
      detuneCents: 8,   // -50 to +50 cents
      hardSync: false
    };

    // Mixer Parameters (Calibrated headroom for polyphony & dual-VCO summing)
    this.mixer = {
      vco1Level: 0.75,
      vco2Level: 0.55,
      subLevel: 0.35,
      subOctave: -1,    // -1 or -2
      noiseLevel: 0.0
    };

    // 24dB Resonant VCF Filter Parameters
    this.vcf = {
      cutoff: 2800,          // 20 Hz to 20000 Hz
      resonance: 3.5,        // 0.1 to 24.0
      type: 'lowpass24',     // 'lowpass24', 'lowpass12', 'bandpass', 'highpass'
      drive: 0.15,           // 0.0 to 1.0 (analog saturation)
      keyTrack: 0.5,         // 0.0 to 1.0 (keyboard tracking)
      envMod: 0.6            // -1.0 to +1.0 (envelope modulation amount)
    };

    // Filter Envelope (VCF ADSR)
    this.filterEnv = {
      attack: 0.006,  // 0.003 to 4.0s (safe de-clicked attack)
      decay: 0.35,    // 0.001 to 6.0s
      sustain: 0.35,  // 0.0 to 1.0
      release: 0.35   // 0.005 to 8.0s
    };

    // Amp Envelope (VCA ADSR)
    this.ampEnv = {
      attack: 0.005,  // 0.003 to 4.0s (safe de-clicked attack)
      decay: 0.25,    // 0.001 to 6.0s
      sustain: 0.7,   // 0.0 to 1.0
      release: 0.3    // 0.005 to 8.0s
    };

    // Dual-LFO Modulation Parameters (Independent LFO 1 & LFO 2)
    this.lfo1 = {
      wave: 'triangle', // 'sine', 'triangle', 'sawtooth', 'square', 'samplehold'
      rate: 2.5,        // 0.05 Hz to 30.0 Hz
      fadeIn: 0.0,      // 0.0 to 4.0 seconds
      destinations: {
        pitch: 0.0,     // 0.0 to 1.0 (±1200 cents)
        vcf: 0.0,       // 0.0 to 1.0 (±3600 cents)
        pwm: 0.0,       // 0.0 to 1.0 (±0.35 PW)
        amp: 0.0        // 0.0 to 1.0 (Tremolo)
      }
    };

    this.lfo2 = {
      wave: 'sine',
      rate: 5.0,
      fadeIn: 1.0,      // Default 1.0s delay for natural vibrato
      destinations: {
        pitch: 0.0,
        vcf: 0.0,
        pwm: 0.0,
        amp: 0.0
      }
    };

    // SynthBlocks.Lfo per LFO number (index 0 unused), built with the AudioContext
    this.lfos = [null, null, null];
  }

  /**
   * PWM comparator curve, static pulse width offsets and both LFOs (shared by all voices)
   */
  initInstrument() {
    this.pwmCurve = SynthBlocks.pwmComparatorCurve();

    if (this.ctx.createConstantSource) {
      this.vco1PwOffset = this.ctx.createConstantSource();
      this.vco1PwOffset.offset.setValueAtTime((this.vco1.pulseWidth - 0.5) * 0.8, this.ctx.currentTime);
      this.vco1PwOffset.start();

      this.vco2PwOffset = this.ctx.createConstantSource();
      this.vco2PwOffset.offset.setValueAtTime(0.0, this.ctx.currentTime);
      this.vco2PwOffset.start();
    }

    this.initLfoEngines();
  }

  /**
   * Shared white noise source, then the 12 persistent voices (see voice.js)
   */
  /**
   * FX targets exist once per synth: LFOs and mod wheel route directly, the note sources
   * (envelopes, velocity, key, random) follow the last played note
   */
  initRackModulation() {
    const ctx = this.ctx;
    this.fxNoteModSources = new SynthBlocks.NoteModSources(ctx, this);
    const depths = {};
    for (const [name, target] of Object.entries(SUB1_FX_MOD_TARGETS)) depths[name] = target.depth;
    this.fxModMatrix = new SynthBlocks.ModMatrix(ctx, {
      sources: {
        lfo1: this.lfos[1].output,
        lfo2: this.lfos[2].output,
        ...this.fxNoteModSources.nodes,
        modWheel: this.modWheelSource
      },
      targets: this.fxChain.modTargets,
      depths,
      slots: this.modSlots(),
      idle: Object.keys(this.fxNoteModSources.nodes)
    });
    // CRUSH targets appear with the worklet
    this.fxChain.ready.then(() => this.fxModMatrix.applyAll());
  }

  initVoicePool(count) {
    if (this.voicePool.length > 0) return;
    this.getNoiseBuffer();

    if (!this.sharedNoiseSource) {
      this.sharedNoiseSource = this.ctx.createBufferSource();
      this.sharedNoiseSource.buffer = this.getNoiseBuffer();
      this.sharedNoiseSource.loop = true;
      this.sharedNoiseGain = this.ctx.createGain();
      this.sharedNoiseGain.gain.setValueAtTime(1.0, this.ctx.currentTime);
      this.sharedNoiseSource.connect(this.sharedNoiseGain);
      this.sharedNoiseSource.start(0);
    }

    super.initVoicePool(count);
  }

  createVoice(id) {
    return new Voice(this, id);
  }

  getLfo(lfoNum) {
    return lfoNum === 2 ? this.lfo2 : this.lfo1;
  }

  initLfoEngines() {
    for (const lfoNum of [1, 2]) {
      const { wave, rate } = this.getLfo(lfoNum);
      this.lfos[lfoNum] = new SynthBlocks.Lfo(this.ctx, { wave, rate });
    }
  }

  /**
   * Sets one LFO destination depth on every voice: depth * LFO_DEPTH[dest].
   */
  applyLfoDepth(lfoNum, dest, now, timeConstant) {
    const amount = this.getLfo(lfoNum).destinations[dest] * LFO_DEPTH[dest];
    for (const voice of this.voicePool) {
      voice.setLfoAmount(lfoNum, dest, amount, now, timeConstant);
    }
  }

  /**
   * Generate 2-second looped White Noise buffer.
   */
  getNoiseBuffer() {
    if (!this.noiseBuffer && this.ctx) {
      this.noiseBuffer = SynthBlocks.whiteNoiseBuffer(this.ctx, 2, 0.6);
    }
    return this.noiseBuffer;
  }

  /**
   * Creates a Bandlimited Pulse Wave with custom Duty Cycle (Pulse Width)
   */
  createPulsePeriodicWave(dutyCycle) {
    const numHarmonics = 128;
    const real = new Float32Array(numHarmonics);
    const imag = new Float32Array(numHarmonics);

    real[0] = 0;
    imag[0] = 0;

    for (let n = 1; n < numHarmonics; n++) {
      real[n] = 0;
      imag[n] = (2 / (n * Math.PI)) * Math.sin(n * Math.PI * dutyCycle);
    }

    return this.ctx.createPeriodicWave(real, imag, { disableNormalization: false });
  }

  /**
   * Calculate exact VCO 1 Frequency (including VCO1 Octave)
   */
  getVCO1Frequency(baseFreq) {
    return baseFreq * Math.pow(2, this.vco1.octave) * this.pitchBendFactor;
  }

  /**
   * Calculate exact VCO 2 Frequency (including VCO2 Octave, Semitones, and Cents Detune)
   */
  getVCO2Frequency(baseFreq) {
    const totalSemitones = (this.vco2.octave * 12) + this.vco2.semitone + (this.vco2.detuneCents / 100);
    return baseFreq * Math.pow(2, totalSemitones / 12) * this.pitchBendFactor;
  }

  /**
   * Calculate exact Filter Cutoff Frequency for a given voice (including Key Tracking & Mod Wheel)
   */
  getVoiceCutoffFrequency(midiNote) {
    const keyOffset = (midiNote - 60) * (this.vcf.keyTrack / 12);
    let freq = this.vcf.cutoff * Math.pow(2, keyOffset);
    freq *= Math.pow(2, this.modWheelValue * 2.5);
    return Math.max(20, Math.min(20000, freq));
  }

  // =========================================================================
  // REAL-TIME PARAMETER SETTERS (VCO, MIXER, VCF, ADSR, DUAL LFO, FX)
  // =========================================================================

  setVCO1Wave(wave) {
    this.vco1.wave = wave;
    this.forEachVoice((voice, now) => voice.setWave(1, wave, now));
  }

  setVCO1Octave(octave) {
    this.vco1.octave = parseInt(octave, 10);
    this.updateAllVoiceFrequencies();
  }

  setVCO1PW(pw) {
    this.vco1.pulseWidth = parseFloat(pw);
    if (this.vco1PwOffset && this.ctx) {
      const offsetVal = (this.vco1.pulseWidth - 0.5) * 0.8;
      this.vco1PwOffset.offset.setTargetAtTime(offsetVal, this.ctx.currentTime, 0.015);
    }
  }

  setVCO2Wave(wave) {
    this.vco2.wave = wave;
    this.forEachVoice((voice, now) => voice.setWave(2, wave, now));
  }

  setVCO2Octave(octave) {
    this.vco2.octave = parseInt(octave, 10);
    this.updateAllVoiceFrequencies();
  }

  setVCO2Semitone(semitone) {
    this.vco2.semitone = parseInt(semitone, 10);
    this.updateAllVoiceFrequencies();
  }

  setVCO2Detune(cents) {
    this.vco2.detuneCents = parseFloat(cents);
    this.updateAllVoiceFrequencies();
  }

  setVCO2Sync(sync) {
    this.vco2.hardSync = !!sync;
  }

  setMixerVCO1(level) {
    this.mixer.vco1Level = parseFloat(level);
    this.forEachVoice((voice, now) => voice.setMixLevel('vco1Level', this.mixer.vco1Level, now));
  }

  setMixerVCO2(level) {
    this.mixer.vco2Level = parseFloat(level);
    this.forEachVoice((voice, now) => voice.setMixLevel('vco2Level', this.mixer.vco2Level, now));
  }

  setMixerSub(level) {
    this.mixer.subLevel = parseFloat(level);
    this.forEachVoice((voice, now) => voice.setMixLevel('subLevel', this.mixer.subLevel, now));
  }

  setMixerSubOctave(oct) {
    this.mixer.subOctave = parseInt(oct, 10);
    this.updateAllVoiceFrequencies();
  }

  setMixerNoise(level) {
    this.mixer.noiseLevel = parseFloat(level);
    this.forEachVoice((voice, now) => voice.setMixLevel('noiseLevel', this.mixer.noiseLevel, now));
  }

  // --- VCF SETTERS ---

  setVCFCutoff(cutoffHz) {
    this.vcf.cutoff = Math.max(20, Math.min(20000, parseFloat(cutoffHz)));
    this.updateAllVoiceFilters();
  }

  setVCFResonance(res) {
    this.vcf.resonance = Math.max(0.1, Math.min(25.0, parseFloat(res)));
    this.updateAllVoiceFilters();
  }

  setVCFType(type) {
    this.vcf.type = type;
    this.updateAllVoiceFilters();
  }

  setVCFDrive(drive) {
    this.vcf.drive = Math.max(0, Math.min(1, parseFloat(drive)));
    if (!this.ctx) return;
    const curve = SynthBlocks.driveCurve(this.vcf.drive);
    for (const voice of this.voicePool) {
      voice.drive.setAmount(this.vcf.drive, curve);
    }
  }

  setVCFKeyTrack(track) {
    this.vcf.keyTrack = Math.max(0, Math.min(1, parseFloat(track)));
    this.updateAllVoiceFilters();
  }

  setVCFEnvMod(envMod) {
    this.vcf.envMod = Math.max(-1, Math.min(1, parseFloat(envMod)));
  }

  // --- DUAL LFO 1 & LFO 2 SETTERS ---

  setLFOParam(lfoNum, param, val) {
    const lfo = this.getLfo(lfoNum);
    const lfoEngine = this.lfos[lfoNum];

    switch (param) {
      case 'wave':
        lfo.wave = val;
        if (lfoEngine) lfoEngine.setWave(val);
        break;

      case 'rate':
        lfo.rate = Math.max(0.05, Math.min(30.0, parseFloat(val)));
        if (lfoEngine) lfoEngine.setRate(lfo.rate);
        break;

      case 'fadeIn':
        lfo.fadeIn = Math.max(0, Math.min(4.0, parseFloat(val)));
        break;

      case 'pitch':
      case 'vcf':
      case 'pwm':
      case 'amp':
        lfo.destinations[param] = Math.max(0, Math.min(1, parseFloat(val)));
        if (this.ctx) {
          this.applyLfoDepth(lfoNum, param, this.ctx.currentTime, 0.02);
        }
        break;
    }
  }

  updateAllVoiceFilters() {
    this.forEachVoice((voice) => voice.updateFilter());
  }

  // Octave and mod wheel move the key-tracked, mod-wheel-opened cutoff
  onOctaveChange() {
    this.updateAllVoiceFilters();
  }

  onModWheelChange() {
    this.updateAllVoiceFilters();
  }
}

window.AudioEngine = AudioEngine;
