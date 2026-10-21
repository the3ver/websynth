/**
 * RETROVOX SUB-1 • WEB AUDIO API ENGINE
 * Core Audio Engine handling Polyphonic Subtractive Voice Allocation,
 * Dual-VCO, Pulse Width Modulation, Sub-Oscillator, Noise Generator,
 * 24dB Multi-Mode Resonant VCF (Ladder Lowpass, Bandpass, Highpass, Drive & KeyTrack),
 * Dual ADSR Envelopes (VCF Filter ADSR & VCA Amp ADSR),
 * Dual Independent LFOs (LFO 1 & LFO 2 with Multi-Wave, S&H, Fade-In Delay, Pitch, VCF, PWM, Amp targets),
 * Vintage Stereo FX Rack (Juno BBD Chorus, Stereo Tape Delay with Lowpass Dampening, Studio Space Reverb),
 * Oscilloscope Analyser, Master Gain, and MIDI Integration.
 */

// ADSR stage limits (attack/decay/release in seconds, sustain as level)
const ENV_STAGE_RANGE = {
  attack: [0.001, Infinity],
  decay: [0.001, Infinity],
  sustain: [0.0, 1.0],
  release: [0.005, Infinity]
};

class AudioEngine {
  constructor() {
    this.ctx = null;
    this.limiter = null;
    this.masterGain = null;
    this.analyser = null;
    this.masterVoiceBus = null;
    this.maxVoices = 12;
    this.voicePool = []; // Persistent 12-Voice Polyphonic Pool (Zero GC Churn)
    this.activeVoices = new Map(); // noteNumber -> Voice
    this.isPowered = true;
    this.masterVolume = 0.8;
    this.octaveShift = 0; // -2 to +2
    this.pitchBendFactor = 1.0; // 0.5 to 2.0
    this.modWheelValue = 0.0; // 0.0 to 1.0
    this.glideEnabled = false;
    this.glideTime = 0.06; // seconds
    this.lastFrequency = null;
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

    this.lfo1Osc = null;
    this.lfo1Gain = null;
    this.lfo2Osc = null;
    this.lfo2Gain = null;

    // Sample & Hold state per LFO number (index 0 unused)
    this.lfoShTimers = [null, null, null];
    this.lfoShValues = [0, 0, 0];

    // Vintage Stereo FX Rack Parameters
    this.fx = {
      chorus: {
        mode: 'off',    // 'off', 'I', 'II', 'I+II'
        mix: 0.65       // 0.0 to 1.0
      },
      delay: {
        time: 0.32,     // 0.02 to 1.0s
        feedback: 0.45, // 0.0 to 0.9
        mix: 0.0        // 0.0 to 1.0
      },
      reverb: {
        decay: 3.2,     // 0.5 to 10.0s
        mix: 0.0        // 0.0 to 1.0
      }
    };

    this.fxChain = null;

    // Callbacks for UI updates
    this.onVoiceChange = null;
    this.onMidiStateChange = null;
    this.onAudioStateChange = null;
  }

  /**
   * Resumes and unlocks the Web Audio API context with iOS / iPadOS Safari CoreAudio kickstart.
   */
  async resumeAudio() {
    if (!this.ctx) {
      this.initAudio();
    }
    if (this.ctx && this.ctx.state !== 'running') {
      try {
        await this.ctx.resume();
      } catch (e) {}

      // Kickstart iOS / iPadOS Safari CoreAudio hardware output bus with a 1-sample silent buffer
      try {
        const buffer = this.ctx.createBuffer(1, 1, 22050);
        const source = this.ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(this.ctx.destination);
        source.start(0);
      } catch (e) {}
    }

    if (this.onAudioStateChange && this.ctx) {
      this.onAudioStateChange(this.ctx.state);
    }
    return this.ctx ? this.ctx.state : 'uninitialized';
  }

  ensureAudioRunning() {
    if (!this.ctx || this.ctx.state !== 'running') {
      this.resumeAudio();
    }
  }

  /**
   * Initializes AudioContext, LFOs, Voice Pool, and Master FX Signal Chain.
   */
  initAudio() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioCtx({ latencyHint: 'interactive' });

      // Listen for hardware audio state transitions
      this.ctx.onstatechange = () => {
        if (this.onAudioStateChange) {
          this.onAudioStateChange(this.ctx.state);
        }
      };

      // Master Voice Bus
      this.masterVoiceBus = this.ctx.createGain();

      // Setup Master Analyser & Master Gain (optimized fftSize 512 for CPU relief)
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 512;
      this.analyser.smoothingTimeConstant = 0.8;

      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(this.masterVolume, this.ctx.currentTime);

      // Brickwall Peak Limiter / DynamicsCompressor to prevent digital clipping (0 dBFS ceiling)
      this.limiter = this.ctx.createDynamicsCompressor();
      this.limiter.threshold.setValueAtTime(-0.5, this.ctx.currentTime);
      this.limiter.knee.setValueAtTime(0.0, this.ctx.currentTime);
      this.limiter.ratio.setValueAtTime(20.0, this.ctx.currentTime);
      this.limiter.attack.setValueAtTime(0.001, this.ctx.currentTime);
      this.limiter.release.setValueAtTime(0.05, this.ctx.currentTime);

      this.analyser.connect(this.masterGain);
      this.masterGain.connect(this.limiter);
      this.limiter.connect(this.ctx.destination);

      // Pre-calculate PWM WaveShaper transfer curve
      this.pwmCurve = this.createPWMShaperCurve();

      // Static Pulse Width Offset Constant Sources
      if (this.ctx.createConstantSource) {
        this.vco1PwOffset = this.ctx.createConstantSource();
        this.vco1PwOffset.offset.setValueAtTime((this.vco1.pulseWidth - 0.5) * 0.8, this.ctx.currentTime);
        this.vco1PwOffset.start();

        this.vco2PwOffset = this.ctx.createConstantSource();
        this.vco2PwOffset.offset.setValueAtTime(0.0, this.ctx.currentTime);
        this.vco2PwOffset.start();
      }

      // Build Dual LFO Engines
      this.initLfoEngines();

      // Build Stereo FX Chain
      this.initStereoFXChain();

      // Pre-generate noise buffer
      this.getNoiseBuffer();

      // Initialize Persistent 12-Voice Polyphonic Pool (Zero GC on note events)
      this.initVoicePool(this.maxVoices);

      // Setup Web MIDI API
      this.initMidi();
    }

    if (this.ctx.state !== 'running') {
      this.resumeAudio();
    }

    return this.ctx.state;
  }

  /**
   * Initializes the persistent Voice Pool (12 polyphonic voices pre-wired, see voice.js)
   */
  initVoicePool(count = 12) {
    if (this.voicePool.length > 0) return;

    // Shared White Noise Generator
    if (!this.sharedNoiseSource) {
      this.sharedNoiseSource = this.ctx.createBufferSource();
      this.sharedNoiseSource.buffer = this.getNoiseBuffer();
      this.sharedNoiseSource.loop = true;
      this.sharedNoiseGain = this.ctx.createGain();
      this.sharedNoiseGain.gain.setValueAtTime(1.0, this.ctx.currentTime);
      this.sharedNoiseSource.connect(this.sharedNoiseGain);
      this.sharedNoiseSource.start(0);
    }

    for (let i = 0; i < count; i++) {
      this.voicePool.push(new Voice(this, i));
    }
  }

  getLfo(lfoNum) {
    return lfoNum === 2 ? this.lfo2 : this.lfo1;
  }

  initLfoEngines() {
    const now = this.ctx.currentTime;
    for (const lfoNum of [1, 2]) {
      const lfo = this.getLfo(lfoNum);
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = lfo.wave === 'samplehold' ? 'sawtooth' : lfo.wave;
      osc.frequency.setValueAtTime(lfo.rate, now);
      gain.gain.setValueAtTime(1.0, now);
      osc.connect(gain);
      osc.start();
      this[`lfo${lfoNum}Osc`] = osc;
      this[`lfo${lfoNum}Gain`] = gain;

      // Sample & Hold timer loop
      this.startSampleAndHoldLoop(lfoNum);
    }
  }

  /**
   * Sets one LFO destination depth on every voice: depth * LFO_DEPTH[dest] * scale.
   * scale is 1 for continuous waves and the current random value for Sample & Hold.
   */
  applyLfoDepth(lfoNum, dest, scale, now, timeConstant) {
    const amount = this.getLfo(lfoNum).destinations[dest] * LFO_DEPTH[dest] * scale;
    for (const voice of this.voicePool) {
      voice.setLfoAmount(lfoNum, dest, amount, now, timeConstant);
    }
  }

  startSampleAndHoldLoop(lfoNum) {
    const lfo = this.getLfo(lfoNum);
    if (this.lfoShTimers[lfoNum]) clearInterval(this.lfoShTimers[lfoNum]);
    const intervalMs = Math.max(20, Math.min(2000, 1000 / lfo.rate));
    this.lfoShTimers[lfoNum] = setInterval(() => {
      if (lfo.wave !== 'samplehold') return;
      this.lfoShValues[lfoNum] = Math.random() * 2 - 1;
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      for (const dest of LFO_DESTINATIONS) {
        this.applyLfoDepth(lfoNum, dest, this.lfoShValues[lfoNum], now, 0.005);
      }
    }, intervalMs);
  }

  /**
   * Builds the Stereo FX rack between the voice bus and the analyser (see fx-chain.js)
   */
  initStereoFXChain() {
    this.fxChain = new FXChain(this.ctx, this.fx, this.masterVoiceBus, this.analyser);
  }

  /**
   * Generate 2-second looped White Noise buffer.
   */
  getNoiseBuffer() {
    if (!this.noiseBuffer && this.ctx) {
      const bufferSize = this.ctx.sampleRate * 2;
      this.noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const output = this.noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        output[i] = (Math.random() * 2 - 1) * 0.6;
      }
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
   * Generates a steep analog comparator sigmoid curve for 4x-oversampled Pulse Width Modulation
   */
  createPWMShaperCurve() {
    const n_samples = 2048;
    const curve = new Float32Array(n_samples);
    const k = 40;
    for (let i = 0; i < n_samples; i++) {
      const x = (i * 2) / (n_samples - 1) - 1;
      curve[i] = Math.tanh(k * x);
    }
    return curve;
  }

  /**
   * Generate soft-clipping saturation curve for Filter Drive (normalized with smooth unity ceiling)
   */
  makeDistortionCurve(amount) {
    const n_samples = 512;
    const curve = new Float32Array(n_samples);
    if (amount <= 0.001) {
      for (let i = 0; i < n_samples; ++i) {
        curve[i] = (i * 2) / (n_samples - 1) - 1;
      }
      return curve;
    }
    const gain = 1.0 + amount * 4.0;
    const norm = Math.tanh(gain);
    for (let i = 0; i < n_samples; ++i) {
      const x = (i * 2) / (n_samples - 1) - 1;
      curve[i] = Math.tanh(gain * x) / norm;
    }
    return curve;
  }

  /**
   * Calculate base note frequency with Global Octave Shift
   */
  midiNoteToFrequency(midiNote) {
    const shiftedNote = midiNote + (this.octaveShift * 12);
    return 440 * Math.pow(2, (shiftedNote - 69) / 12);
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

  /**
   * Allocates a persistent voice from the voice pool (LRU Voice Stealing)
   */
  allocateVoice(midiNote) {
    const now = this.ctx ? this.ctx.currentTime : 0;

    // 1. If voice is already allocated to this note, reuse it (smooth retrigger)
    const existing = this.activeVoices.get(midiNote);
    if (existing) {
      return existing;
    }

    // 2. Find first completely free voice
    for (const voice of this.voicePool) {
      if (!voice.isBusy) {
        return voice;
      }
    }

    // 3. Find a voice that is currently in release phase (oldest releaseStartTime)
    let oldestReleasedVoice = null;
    let minReleaseTime = Infinity;
    for (const voice of this.voicePool) {
      if (voice.releaseStartTime > 0 && voice.releaseStartTime < minReleaseTime) {
        minReleaseTime = voice.releaseStartTime;
        oldestReleasedVoice = voice;
      }
    }
    if (oldestReleasedVoice) {
      if (oldestReleasedVoice.midiNote !== null) {
        this.activeVoices.delete(oldestReleasedVoice.midiNote);
      }
      return oldestReleasedVoice;
    }

    // 4. All voices busy: Steal oldest active voice (LRU)
    let oldestActiveVoice = this.voicePool[0];
    let minStartTime = this.voicePool[0].startTime;
    for (let i = 1; i < this.voicePool.length; i++) {
      if (this.voicePool[i].startTime < minStartTime) {
        minStartTime = this.voicePool[i].startTime;
        oldestActiveVoice = this.voicePool[i];
      }
    }

    // Fast 2ms crossfade down on stolen voice to avoid click
    try {
      if (oldestActiveVoice.vca.gain.cancelAndHoldAtTime) {
        oldestActiveVoice.vca.gain.cancelAndHoldAtTime(now);
      } else {
        oldestActiveVoice.vca.gain.cancelScheduledValues(now);
      }
      oldestActiveVoice.vca.gain.setTargetAtTime(0.0, now, 0.002);
    } catch (e) {}

    if (oldestActiveVoice.midiNote !== null) {
      this.activeVoices.delete(oldestActiveVoice.midiNote);
    }
    return oldestActiveVoice;
  }

  /**
   * Triggers Note On with Persistent Voice Pool (Zero Node Allocations / Zero GC)
   */
  noteOn(midiNote, velocity = 1.0) {
    if (!this.isPowered) return;
    this.ensureAudioRunning();

    const now = this.ctx ? this.ctx.currentTime : 0;
    const voice = this.allocateVoice(midiNote);
    if (!voice) return;

    this.lastFrequency = voice.trigger(midiNote, velocity, now);
    this.activeVoices.set(midiNote, voice);

    if (this.onVoiceChange) {
      this.onVoiceChange(this.activeVoices.size, this.lastFrequency);
    }
  }

  noteOff(midiNote) {
    if (!this.ctx) return;
    const voice = this.activeVoices.get(midiNote);
    if (!voice) return;

    this.activeVoices.delete(midiNote);
    voice.release(this.ctx.currentTime);

    if (this.onVoiceChange) {
      this.onVoiceChange(this.activeVoices.size, this.activeVoices.size > 0 ? Array.from(this.activeVoices.values())[0].baseFreq : null);
    }
  }

  allNotesOff() {
    for (const midiNote of Array.from(this.activeVoices.keys())) {
      this.noteOff(midiNote);
    }
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
    const curve = this.makeDistortionCurve(this.vcf.drive);
    for (const voice of this.voicePool) {
      voice.driveShaper.curve = curve;
    }
  }

  setVCFKeyTrack(track) {
    this.vcf.keyTrack = Math.max(0, Math.min(1, parseFloat(track)));
    this.updateAllVoiceFilters();
  }

  setVCFEnvMod(envMod) {
    this.vcf.envMod = Math.max(-1, Math.min(1, parseFloat(envMod)));
  }

  // --- ADSR ENVELOPE SETTERS ---

  /**
   * Sets one ADSR stage: setEnvStage('ampEnv' | 'filterEnv', 'attack' | 'decay' | 'sustain' | 'release', value)
   */
  setEnvStage(envName, stage, val) {
    const env = this[envName];
    if (!env || !(stage in env)) return;
    const [min, max] = ENV_STAGE_RANGE[stage];
    env[stage] = Math.max(min, Math.min(max, parseFloat(val)));
  }

  // --- DUAL LFO 1 & LFO 2 SETTERS ---

  setLFOParam(lfoNum, param, val) {
    const lfo = lfoNum === 2 ? this.lfo2 : this.lfo1;
    const lfoOsc = lfoNum === 2 ? this.lfo2Osc : this.lfo1Osc;

    switch (param) {
      case 'wave':
        lfo.wave = val;
        if (this.ctx && lfoOsc) {
          lfoOsc.type = val === 'samplehold' ? 'sawtooth' : val;
        }
        break;

      case 'rate':
        lfo.rate = Math.max(0.05, Math.min(30.0, parseFloat(val)));
        if (this.ctx && lfoOsc) {
          lfoOsc.frequency.setTargetAtTime(lfo.rate, this.ctx.currentTime, 0.02);
        }
        this.startSampleAndHoldLoop(lfoNum);
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
          const shScale = lfo.wave === 'samplehold' ? this.lfoShValues[lfoNum] : 1;
          this.applyLfoDepth(lfoNum, param, shScale, this.ctx.currentTime, 0.02);
        }
        break;
    }
  }

  // --- STEREO FX SETTERS ---

  setChorusMode(mode) {
    this.fx.chorus.mode = mode;
    if (this.fxChain) this.fxChain.applyChorusMode();
  }

  setChorusMix(val) {
    this.fx.chorus.mix = Math.max(0, Math.min(1, parseFloat(val)));
    if (this.fxChain) this.fxChain.applyChorusMix();
  }

  setDelayTime(val) {
    this.fx.delay.time = Math.max(0.02, Math.min(1.0, parseFloat(val)));
    if (this.fxChain) this.fxChain.applyDelayTime();
  }

  setDelayFeedback(val) {
    this.fx.delay.feedback = Math.max(0.0, Math.min(0.9, parseFloat(val)));
    if (this.fxChain) this.fxChain.applyDelayFeedback();
  }

  setDelayMix(val) {
    this.fx.delay.mix = Math.max(0, Math.min(1, parseFloat(val)));
    if (this.fxChain) this.fxChain.applyDelayMix();
  }

  setReverbDecay(val) {
    this.fx.reverb.decay = Math.max(0.5, Math.min(10.0, parseFloat(val)));
    if (this.fxChain) this.fxChain.applyReverbDecay();
  }

  setReverbMix(val) {
    this.fx.reverb.mix = Math.max(0, Math.min(1, parseFloat(val)));
    if (this.fxChain) this.fxChain.applyReverbMix();
  }

  /**
   * Runs fn(voice, now) for every voice once the audio graph exists
   */
  forEachVoice(fn) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    for (const voice of this.voicePool) fn(voice, now);
  }

  updateAllVoiceFilters() {
    this.forEachVoice((voice) => voice.updateFilter());
  }

  updateAllVoiceFrequencies() {
    this.forEachVoice((voice, now) => voice.updateFrequencies(now));
  }

  setMasterVolume(value) {
    this.masterVolume = Math.max(0, Math.min(1, value));
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(this.masterVolume, this.ctx.currentTime, 0.02);
    }
  }

  setOctaveShift(shift) {
    this.octaveShift = Math.max(-2, Math.min(2, shift));
    this.updateAllVoiceFrequencies();
    this.updateAllVoiceFilters();
  }

  setPitchBend(factor) {
    this.pitchBendFactor = factor;
    this.updateAllVoiceFrequencies();
  }

  setModWheel(value) {
    this.modWheelValue = Math.max(0, Math.min(1, value));
    this.updateAllVoiceFilters();
  }

  setGlide(enabled) {
    this.glideEnabled = enabled;
  }

  setPower(on) {
    this.isPowered = on;
    if (!on) {
      this.allNotesOff();
    } else {
      this.ensureAudioRunning();
    }
  }

  // =========================================================================
  // WEB MIDI API SUPPORT
  // =========================================================================

  async initMidi() {
    if (navigator.requestMIDIAccess) {
      try {
        const midiAccess = await navigator.requestMIDIAccess({ sysex: false });
        let deviceCount = 0;

        const updateInputs = () => {
          deviceCount = 0;
          for (const input of midiAccess.inputs.values()) {
            deviceCount++;
            input.onmidimessage = (msg) => this.handleMidiMessage(msg);
          }
          if (this.onMidiStateChange) {
            this.onMidiStateChange(deviceCount > 0, deviceCount);
          }
        };

        midiAccess.onstatechange = () => updateInputs();
        updateInputs();
      } catch (err) {
        console.log('Web MIDI not available or permission denied:', err);
      }
    }
  }

  handleMidiMessage(event) {
    if (!this.isPowered) return;
    const [status, note, velocity] = event.data;
    const command = status >> 4;

    if (command === 9 && velocity > 0) {
      this.noteOn(note, velocity / 127);
    } else if (command === 8 || (command === 9 && velocity === 0)) {
      this.noteOff(note);
    } else if (command === 14) {
      const bendValue = ((velocity << 7) + note) - 8192;
      const bendSemitones = (bendValue / 8192) * 2;
      this.setPitchBend(Math.pow(2, bendSemitones / 12));
    } else if (command === 11 && note === 1) {
      this.setModWheel(velocity / 127);
    }
  }

  // =========================================================================
  // PRESET SNAPSHOT & RESTORATION
  // =========================================================================

  getPresetState() {
    return SynthParams.readState(this);
  }

  loadPresetState(state) {
    if (state) SynthParams.applyState(this, state);
  }
}

window.AudioEngine = AudioEngine;
