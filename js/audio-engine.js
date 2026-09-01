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
    this.lfo1ShTimer = null;
    this.lfo1ShValue = 0;

    this.lfo2Osc = null;
    this.lfo2Gain = null;
    this.lfo2ShTimer = null;
    this.lfo2ShValue = 0;

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

    // FX Nodes references
    this.chorusDryGain = null;
    this.chorusWetGain = null;
    this.chorusDelayL = null;
    this.chorusDelayR = null;
    this.chorusLfo = null;
    this.chorusLfoGainL = null;
    this.chorusLfoGainR = null;

    this.delayDryGain = null;
    this.delayWetGain = null;
    this.delayL = null;
    this.delayR = null;
    this.delayFilterL = null;
    this.delayFilterR = null;
    this.delayFeedbackGainL = null;
    this.delayFeedbackGainR = null;

    this.reverbDryGain = null;
    this.reverbWetGain = null;
    this.reverbConvolver = null;

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
   * Initializes the persistent Voice Pool (12 polyphonic voices pre-wired)
   */
  initVoicePool(count = 12) {
    if (this.voicePool.length > 0) return;
    const now = this.ctx.currentTime;

    // Shared White Noise Generator
    if (!this.sharedNoiseSource) {
      this.sharedNoiseSource = this.ctx.createBufferSource();
      this.sharedNoiseSource.buffer = this.getNoiseBuffer();
      this.sharedNoiseSource.loop = true;
      this.sharedNoiseGain = this.ctx.createGain();
      this.sharedNoiseGain.gain.setValueAtTime(1.0, now);
      this.sharedNoiseSource.connect(this.sharedNoiseGain);
      this.sharedNoiseSource.start(0);
    }

    for (let i = 0; i < count; i++) {
      // 1. Oscillators
      const osc1 = this.ctx.createOscillator();
      osc1.type = this.vco1.wave === 'square' ? 'sawtooth' : this.vco1.wave;
      osc1.frequency.setValueAtTime(440, now);

      const osc2 = this.ctx.createOscillator();
      osc2.type = this.vco2.wave === 'square' ? 'sawtooth' : this.vco2.wave;
      osc2.frequency.setValueAtTime(440, now);

      const subOsc = this.ctx.createOscillator();
      subOsc.type = 'triangle';
      subOsc.frequency.setValueAtTime(220, now);

      // VCO1 Dual-Path Routing (Direct for Saw/Tri/Sine, WaveShaper for Square/PWM)
      const osc1DirectGain = this.ctx.createGain();
      osc1DirectGain.gain.setValueAtTime(this.vco1.wave === 'square' ? 0.0 : 1.0, now);
      osc1.connect(osc1DirectGain);

      const osc1PwScale = this.ctx.createGain();
      osc1PwScale.gain.setValueAtTime(0.4, now);
      osc1.connect(osc1PwScale);

      const pwInput1 = this.ctx.createGain();
      pwInput1.gain.setValueAtTime(1.0, now);
      osc1PwScale.connect(pwInput1);

      if (this.vco1PwOffset) {
        this.vco1PwOffset.connect(pwInput1);
      }

      const lfo1PwmGain1 = this.ctx.createGain();
      lfo1PwmGain1.gain.setValueAtTime(this.lfo1.destinations.pwm * 0.35, now);
      if (this.lfo1Gain) {
        this.lfo1Gain.connect(lfo1PwmGain1);
      }
      lfo1PwmGain1.connect(pwInput1);

      const lfo2PwmGain1 = this.ctx.createGain();
      lfo2PwmGain1.gain.setValueAtTime(this.lfo2.destinations.pwm * 0.35, now);
      if (this.lfo2Gain) {
        this.lfo2Gain.connect(lfo2PwmGain1);
      }
      lfo2PwmGain1.connect(pwInput1);

      const pwShaper1 = this.ctx.createWaveShaper();
      pwShaper1.curve = this.pwmCurve;
      pwShaper1.oversample = '4x';
      pwInput1.connect(pwShaper1);

      const osc1PulseGain = this.ctx.createGain();
      osc1PulseGain.gain.setValueAtTime(this.vco1.wave === 'square' ? 1.0 : 0.0, now);
      pwShaper1.connect(osc1PulseGain);

      // VCO2 Dual-Path Routing (Direct for Saw/Tri/Sine, WaveShaper for Square/PWM)
      const osc2DirectGain = this.ctx.createGain();
      osc2DirectGain.gain.setValueAtTime(this.vco2.wave === 'square' ? 0.0 : 1.0, now);
      osc2.connect(osc2DirectGain);

      const osc2PwScale = this.ctx.createGain();
      osc2PwScale.gain.setValueAtTime(0.4, now);
      osc2.connect(osc2PwScale);

      const pwInput2 = this.ctx.createGain();
      pwInput2.gain.setValueAtTime(1.0, now);
      osc2PwScale.connect(pwInput2);

      if (this.vco2PwOffset) {
        this.vco2PwOffset.connect(pwInput2);
      }

      const lfo1PwmGain2 = this.ctx.createGain();
      lfo1PwmGain2.gain.setValueAtTime(this.lfo1.destinations.pwm * 0.35, now);
      if (this.lfo1Gain) {
        this.lfo1Gain.connect(lfo1PwmGain2);
      }
      lfo1PwmGain2.connect(pwInput2);

      const lfo2PwmGain2 = this.ctx.createGain();
      lfo2PwmGain2.gain.setValueAtTime(this.lfo2.destinations.pwm * 0.35, now);
      if (this.lfo2Gain) {
        this.lfo2Gain.connect(lfo2PwmGain2);
      }
      lfo2PwmGain2.connect(pwInput2);

      const pwShaper2 = this.ctx.createWaveShaper();
      pwShaper2.curve = this.pwmCurve;
      pwShaper2.oversample = '4x';
      pwInput2.connect(pwShaper2);

      const osc2PulseGain = this.ctx.createGain();
      osc2PulseGain.gain.setValueAtTime(this.vco2.wave === 'square' ? 1.0 : 0.0, now);
      pwShaper2.connect(osc2PulseGain);

      // 2. Mixer Gains
      const osc1Gain = this.ctx.createGain();
      osc1Gain.gain.setValueAtTime(this.mixer.vco1Level, now);
      osc1DirectGain.connect(osc1Gain);
      osc1PulseGain.connect(osc1Gain);

      const osc2Gain = this.ctx.createGain();
      osc2Gain.gain.setValueAtTime(this.mixer.vco2Level, now);
      osc2DirectGain.connect(osc2Gain);
      osc2PulseGain.connect(osc2Gain);

      const subGain = this.ctx.createGain();
      subGain.gain.setValueAtTime(this.mixer.subLevel, now);

      const noiseGain = this.ctx.createGain();
      noiseGain.gain.setValueAtTime(this.mixer.noiseLevel, now);

      const voiceMixerBus = this.ctx.createGain();
      subOsc.connect(subGain);
      if (this.sharedNoiseGain) {
        this.sharedNoiseGain.connect(noiseGain);
      }

      osc1Gain.connect(voiceMixerBus);
      osc2Gain.connect(voiceMixerBus);
      subGain.connect(voiceMixerBus);
      noiseGain.connect(voiceMixerBus);

      // 3. Filter Drive & 24dB VCF
      const driveShaper = this.ctx.createWaveShaper();
      driveShaper.curve = this.makeDistortionCurve(this.vcf.drive);
      driveShaper.oversample = '2x';
      voiceMixerBus.connect(driveShaper);

      const vcf1 = this.ctx.createBiquadFilter();
      const vcf2 = this.ctx.createBiquadFilter();
      this.configureFilterNodes(vcf1, vcf2, this.vcf.cutoff, this.vcf.resonance, this.vcf.type);
      driveShaper.connect(vcf1);
      vcf1.connect(vcf2);

      // 4. VCA (Volume Amp Envelope) & Post-VCA Tremolo Modulation Stage
      const vca = this.ctx.createGain();
      vca.gain.setValueAtTime(0.0, now);
      vcf2.connect(vca);

      const tremoloGain = this.ctx.createGain();
      tremoloGain.gain.setValueAtTime(1.0, now);
      vca.connect(tremoloGain);
      tremoloGain.connect(this.masterVoiceBus);

      // 5. Dual-LFO Modulation Destinations
      const lfo1PitchGain = this.ctx.createGain();
      const lfo1VcfGain = this.ctx.createGain();
      const lfo1AmpGain = this.ctx.createGain();
      lfo1PitchGain.gain.setValueAtTime(this.lfo1.destinations.pitch * 200, now);
      lfo1VcfGain.gain.setValueAtTime(this.lfo1.destinations.vcf * 3600, now);
      lfo1AmpGain.gain.setValueAtTime(this.lfo1.destinations.amp * 0.45, now);

      if (this.lfo1Gain) {
        this.lfo1Gain.connect(lfo1PitchGain);
        this.lfo1Gain.connect(lfo1VcfGain);
        this.lfo1Gain.connect(lfo1AmpGain);
      }
      lfo1PitchGain.connect(osc1.detune);
      lfo1PitchGain.connect(osc2.detune);
      lfo1VcfGain.connect(vcf1.detune);
      lfo1VcfGain.connect(vcf2.detune);
      lfo1AmpGain.connect(tremoloGain.gain);

      const lfo2PitchGain = this.ctx.createGain();
      const lfo2VcfGain = this.ctx.createGain();
      const lfo2AmpGain = this.ctx.createGain();
      lfo2PitchGain.gain.setValueAtTime(this.lfo2.destinations.pitch * 200, now);
      lfo2VcfGain.gain.setValueAtTime(this.lfo2.destinations.vcf * 3600, now);
      lfo2AmpGain.gain.setValueAtTime(this.lfo2.destinations.amp * 0.45, now);

      if (this.lfo2Gain) {
        this.lfo2Gain.connect(lfo2PitchGain);
        this.lfo2Gain.connect(lfo2VcfGain);
        this.lfo2Gain.connect(lfo2AmpGain);
      }
      lfo2PitchGain.connect(osc1.detune);
      lfo2PitchGain.connect(osc2.detune);
      lfo2VcfGain.connect(vcf1.detune);
      lfo2VcfGain.connect(vcf2.detune);
      lfo2AmpGain.connect(tremoloGain.gain);

      // Start continuous oscillators
      osc1.start(0);
      osc2.start(0);
      subOsc.start(0);

      this.voicePool.push({
        id: i,
        isBusy: false,
        midiNote: null,
        startTime: 0,
        releaseStartTime: 0,
        baseFreq: 440,
        voiceCutoff: this.vcf.cutoff,
        osc1, osc2, subOsc,
        osc1DirectGain, osc1PulseGain, pwShaper1,
        osc2DirectGain, osc2PulseGain, pwShaper2,
        osc1Gain, osc2Gain, subGain, noiseGain,
        voiceMixerBus, driveShaper, vcf1, vcf2, vca, tremoloGain,
        lfo1PitchGain, lfo1VcfGain, lfo1PwmGain1, lfo1PwmGain2, lfo1AmpGain,
        lfo2PitchGain, lfo2VcfGain, lfo2PwmGain1, lfo2PwmGain2, lfo2AmpGain,
        cleanupTimer: null
      });
    }
  }

  /**
   * Builds the Global LFO 1 & LFO 2 Modulation Engines
   */
  initLfoEngines() {
    const now = this.ctx.currentTime;

    // --- LFO 1 ---
    this.lfo1Osc = this.ctx.createOscillator();
    this.lfo1Gain = this.ctx.createGain();
    this.lfo1Osc.type = this.lfo1.wave === 'samplehold' ? 'sawtooth' : this.lfo1.wave;
    this.lfo1Osc.frequency.setValueAtTime(this.lfo1.rate, now);
    this.lfo1Gain.gain.setValueAtTime(1.0, now);
    this.lfo1Osc.connect(this.lfo1Gain);
    this.lfo1Osc.start();

    // --- LFO 2 ---
    this.lfo2Osc = this.ctx.createOscillator();
    this.lfo2Gain = this.ctx.createGain();
    this.lfo2Osc.type = this.lfo2.wave === 'samplehold' ? 'sawtooth' : this.lfo2.wave;
    this.lfo2Osc.frequency.setValueAtTime(this.lfo2.rate, now);
    this.lfo2Gain.gain.setValueAtTime(1.0, now);
    this.lfo2Osc.connect(this.lfo2Gain);
    this.lfo2Osc.start();

    // Sample & Hold timer loops
    this.startSampleAndHoldLoop(1);
    this.startSampleAndHoldLoop(2);
  }

  startSampleAndHoldLoop(lfoNum) {
    if (lfoNum === 1) {
      if (this.lfo1ShTimer) clearInterval(this.lfo1ShTimer);
      const intervalMs = Math.max(20, Math.min(2000, 1000 / this.lfo1.rate));
      this.lfo1ShTimer = setInterval(() => {
        if (this.lfo1.wave === 'samplehold') {
          this.lfo1ShValue = (Math.random() * 2 - 1);
          if (this.ctx && this.voicePool) {
            const now = this.ctx.currentTime;
            for (const voice of this.voicePool) {
              if (voice.lfo1PitchGain) {
                voice.lfo1PitchGain.gain.setTargetAtTime(this.lfo1ShValue * this.lfo1.destinations.pitch * 1200, now, 0.005);
              }
              if (voice.lfo1VcfGain) {
                voice.lfo1VcfGain.gain.setTargetAtTime(this.lfo1ShValue * this.lfo1.destinations.vcf * 3600, now, 0.005);
              }
              if (voice.lfo1PwmGain1) {
                voice.lfo1PwmGain1.gain.setTargetAtTime(this.lfo1ShValue * this.lfo1.destinations.pwm * 0.35, now, 0.005);
              }
              if (voice.lfo1PwmGain2) {
                voice.lfo1PwmGain2.gain.setTargetAtTime(this.lfo1ShValue * this.lfo1.destinations.pwm * 0.35, now, 0.005);
              }
            }
          }
        }
      }, intervalMs);
    } else {
      if (this.lfo2ShTimer) clearInterval(this.lfo2ShTimer);
      const intervalMs = Math.max(20, Math.min(2000, 1000 / this.lfo2.rate));
      this.lfo2ShTimer = setInterval(() => {
        if (this.lfo2.wave === 'samplehold') {
          this.lfo2ShValue = (Math.random() * 2 - 1);
          if (this.ctx && this.voicePool) {
            const now = this.ctx.currentTime;
            for (const voice of this.voicePool) {
              if (voice.lfo2PitchGain) {
                voice.lfo2PitchGain.gain.setTargetAtTime(this.lfo2ShValue * this.lfo2.destinations.pitch * 1200, now, 0.005);
              }
              if (voice.lfo2VcfGain) {
                voice.lfo2VcfGain.gain.setTargetAtTime(this.lfo2ShValue * this.lfo2.destinations.vcf * 3600, now, 0.005);
              }
              if (voice.lfo2PwmGain1) {
                voice.lfo2PwmGain1.gain.setTargetAtTime(this.lfo2ShValue * this.lfo2.destinations.pwm * 0.35, now, 0.005);
              }
              if (voice.lfo2PwmGain2) {
                voice.lfo2PwmGain2.gain.setTargetAtTime(this.lfo2ShValue * this.lfo2.destinations.pwm * 0.35, now, 0.005);
              }
            }
          }
        }
      }, intervalMs);
    }
  }

  /**
   * Builds the complete Stereo FX Signal Flow:
   * VoiceBus -> Juno Chorus -> Tape Delay (Stereo Ping-Pong + LP) -> Studio Reverb -> Analyser
   */
  initStereoFXChain() {
    const now = this.ctx.currentTime;

    // -----------------------------------------------------------------------
    // 1. JUNO STEREO BBD CHORUS
    // -----------------------------------------------------------------------
    this.chorusDryGain = this.ctx.createGain();
    this.chorusWetGain = this.ctx.createGain();
    this.chorusDryGain.gain.setValueAtTime(1.0, now);
    this.chorusWetGain.gain.setValueAtTime(this.fx.chorus.mode === 'off' ? 0.0 : this.fx.chorus.mix, now);

    this.chorusDelayL = this.ctx.createDelay(0.1);
    this.chorusDelayR = this.ctx.createDelay(0.1);
    this.chorusDelayL.delayTime.setValueAtTime(0.018, now);
    this.chorusDelayR.delayTime.setValueAtTime(0.018, now);

    // Counter-phase LFO Modulation
    this.chorusLfo = this.ctx.createOscillator();
    this.chorusLfo.type = 'sine';
    this.chorusLfo.frequency.setValueAtTime(0.5, now);

    this.chorusLfoGainL = this.ctx.createGain();
    this.chorusLfoGainR = this.ctx.createGain();
    this.chorusLfoGainL.gain.setValueAtTime(0.0035, now);
    this.chorusLfoGainR.gain.setValueAtTime(-0.0035, now); // 180° inverted phase for extreme stereo width

    this.chorusLfo.connect(this.chorusLfoGainL);
    this.chorusLfo.connect(this.chorusLfoGainR);
    this.chorusLfoGainL.connect(this.chorusDelayL.delayTime);
    this.chorusLfoGainR.connect(this.chorusDelayR.delayTime);
    this.chorusLfo.start();

    const chorusMerger = this.ctx.createChannelMerger(2);
    this.chorusDelayL.connect(chorusMerger, 0, 0);
    this.chorusDelayR.connect(chorusMerger, 0, 1);

    const chorusOutBus = this.ctx.createGain();
    this.masterVoiceBus.connect(this.chorusDryGain);
    this.masterVoiceBus.connect(this.chorusDelayL);
    this.masterVoiceBus.connect(this.chorusDelayR);

    this.chorusDryGain.connect(chorusOutBus);
    chorusMerger.connect(this.chorusWetGain);
    this.chorusWetGain.connect(chorusOutBus);

    // -----------------------------------------------------------------------
    // 2. STEREO TAPE DELAY (Cross-Ping-Pong & High-Cut Feedback Filter)
    // -----------------------------------------------------------------------
    this.delayDryGain = this.ctx.createGain();
    this.delayWetGain = this.ctx.createGain();
    this.delayDryGain.gain.setValueAtTime(1.0, now);
    this.delayWetGain.gain.setValueAtTime(this.fx.delay.mix, now);

    this.delayL = this.ctx.createDelay(2.0);
    this.delayR = this.ctx.createDelay(2.0);
    this.delayL.delayTime.setValueAtTime(this.fx.delay.time, now);
    this.delayR.delayTime.setValueAtTime(this.fx.delay.time * 1.333, now); // Spatial stereo ratio

    this.delayFilterL = this.ctx.createBiquadFilter();
    this.delayFilterR = this.ctx.createBiquadFilter();
    this.delayFilterL.type = 'lowpass';
    this.delayFilterR.type = 'lowpass';
    this.delayFilterL.frequency.setValueAtTime(2800, now);
    this.delayFilterR.frequency.setValueAtTime(2800, now);

    this.delayFeedbackGainL = this.ctx.createGain();
    this.delayFeedbackGainR = this.ctx.createGain();
    this.delayFeedbackGainL.gain.setValueAtTime(this.fx.delay.feedback, now);
    this.delayFeedbackGainR.gain.setValueAtTime(this.fx.delay.feedback, now);

    // Feedback Loops with Tape High-Cut
    this.delayL.connect(this.delayFilterL);
    this.delayFilterL.connect(this.delayFeedbackGainL);
    this.delayFeedbackGainL.connect(this.delayL);

    this.delayR.connect(this.delayFilterR);
    this.delayFilterR.connect(this.delayFeedbackGainR);
    this.delayFeedbackGainR.connect(this.delayR);

    const delayMerger = this.ctx.createChannelMerger(2);
    this.delayL.connect(delayMerger, 0, 0);
    this.delayR.connect(delayMerger, 0, 1);

    const delayOutBus = this.ctx.createGain();
    chorusOutBus.connect(this.delayDryGain);
    chorusOutBus.connect(this.delayL);
    chorusOutBus.connect(this.delayR);

    this.delayDryGain.connect(delayOutBus);
    delayMerger.connect(this.delayWetGain);
    this.delayWetGain.connect(delayOutBus);

    // -----------------------------------------------------------------------
    // 3. WARM STUDIO SPACE REVERB
    // -----------------------------------------------------------------------
    this.reverbDryGain = this.ctx.createGain();
    this.reverbWetGain = this.ctx.createGain();
    this.reverbDryGain.gain.setValueAtTime(1.0, now);
    this.reverbWetGain.gain.setValueAtTime(this.fx.reverb.mix, now);

    this.reverbConvolver = this.ctx.createConvolver();
    this.updateReverbImpulse(this.fx.reverb.decay);

    delayOutBus.connect(this.reverbDryGain);
    delayOutBus.connect(this.reverbConvolver);

    this.reverbDryGain.connect(this.analyser);
    this.reverbConvolver.connect(this.reverbWetGain);
    this.reverbWetGain.connect(this.analyser);
  }

  /**
   * Generates a warm synthetic stereo reverb impulse response with decaying diffusion.
   */
  updateReverbImpulse(decayTime = 3.0) {
    if (!this.ctx || !this.reverbConvolver) return;
    const rate = this.ctx.sampleRate;
    const length = Math.max(0.5, Math.min(8.0, decayTime)) * rate;
    const impulse = this.ctx.createBuffer(2, length, rate);
    const left = impulse.getChannelData(0);
    const right = impulse.getChannelData(1);

    const decayConstant = 3.5 / decayTime;

    for (let i = 0; i < length; i++) {
      const t = i / rate;
      const envelope = Math.exp(-t * decayConstant);
      left[i] = (Math.random() * 2 - 1) * envelope;
      right[i] = (Math.random() * 2 - 1) * envelope;
    }

    this.reverbConvolver.buffer = impulse;
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

    if (voice.cleanupTimer) {
      clearTimeout(voice.cleanupTimer);
      voice.cleanupTimer = null;
    }

    voice.isBusy = true;
    voice.midiNote = midiNote;
    voice.startTime = now;
    voice.releaseStartTime = 0;

    const baseFreq = this.midiNoteToFrequency(midiNote);
    const vco1Freq = this.getVCO1Frequency(baseFreq);
    const vco2Freq = this.getVCO2Frequency(baseFreq);
    const voiceCutoff = this.getVoiceCutoffFrequency(midiNote);

    voice.baseFreq = baseFreq;
    voice.voiceCutoff = voiceCutoff;

    // --- 1. VCO 1 Frequency & Glide ---
    voice.osc1.frequency.cancelScheduledValues(now);
    if (this.glideEnabled && this.lastFrequency) {
      voice.osc1.frequency.setValueAtTime(this.lastFrequency, now);
      voice.osc1.frequency.exponentialRampToValueAtTime(vco1Freq, now + this.glideTime);
    } else {
      voice.osc1.frequency.setValueAtTime(vco1Freq, now);
    }

    // --- 2. VCO 2 Frequency & Glide ---
    voice.osc2.frequency.cancelScheduledValues(now);
    if (this.glideEnabled && this.lastFrequency) {
      voice.osc2.frequency.setValueAtTime(this.lastFrequency * (vco2Freq / vco1Freq), now);
      voice.osc2.frequency.exponentialRampToValueAtTime(vco2Freq, now + this.glideTime);
    } else {
      voice.osc2.frequency.setValueAtTime(vco2Freq, now);
    }

    // --- 3. Sub-Oscillator ---
    voice.subOsc.frequency.cancelScheduledValues(now);
    const subFreq = baseFreq * Math.pow(2, this.mixer.subOctave) * this.pitchBendFactor;
    voice.subOsc.frequency.setValueAtTime(subFreq, now);

    // --- 4. Mixer Levels (Velocity-Scaled) ---
    voice.osc1Gain.gain.cancelScheduledValues(now);
    voice.osc1Gain.gain.setValueAtTime(this.mixer.vco1Level * velocity, now);

    voice.osc2Gain.gain.cancelScheduledValues(now);
    voice.osc2Gain.gain.setValueAtTime(this.mixer.vco2Level * velocity, now);

    voice.subGain.gain.cancelScheduledValues(now);
    voice.subGain.gain.setValueAtTime(this.mixer.subLevel * velocity, now);

    voice.noiseGain.gain.cancelScheduledValues(now);
    voice.noiseGain.gain.setValueAtTime(this.mixer.noiseLevel * velocity, now);

    // --- 5. Filter Envelope (VCF ADSR) ---
    this.configureFilterNodes(voice.vcf1, voice.vcf2, voiceCutoff, this.vcf.resonance, this.vcf.type);

    const envOctaves = this.vcf.envMod * 3.5;
    const envPeakCutoff = Math.max(20, Math.min(20000, voiceCutoff * Math.pow(2, envOctaves)));
    const envSustainCutoff = Math.max(20, Math.min(20000, voiceCutoff + ((envPeakCutoff - voiceCutoff) * this.filterEnv.sustain)));
    
    const faTime = Math.max(0.004, this.filterEnv.attack);
    const fdTime = Math.max(0.004, this.filterEnv.decay);

    voice.vcf1.frequency.cancelScheduledValues(now);
    voice.vcf2.frequency.cancelScheduledValues(now);
    voice.vcf1.frequency.setValueAtTime(Math.max(20, voiceCutoff), now);
    voice.vcf2.frequency.setValueAtTime(Math.max(20, voiceCutoff), now);

    voice.vcf1.frequency.exponentialRampToValueAtTime(envPeakCutoff, now + faTime);
    voice.vcf2.frequency.exponentialRampToValueAtTime(envPeakCutoff, now + faTime);
    voice.vcf1.frequency.exponentialRampToValueAtTime(envSustainCutoff, now + faTime + fdTime);
    voice.vcf2.frequency.exponentialRampToValueAtTime(envSustainCutoff, now + faTime + fdTime);

    // --- 6. VCA (Amp Envelope ADSR with De-Clicking) ---
    const peakGain = Math.max(0.0001, 0.40 * velocity);
    const sustainGain = Math.max(0.0001, peakGain * this.ampEnv.sustain);
    const aaTime = Math.max(0.004, this.ampEnv.attack);
    const adTime = Math.max(0.004, this.ampEnv.decay);

    if (voice.vca.gain.cancelAndHoldAtTime) {
      voice.vca.gain.cancelAndHoldAtTime(now);
    } else {
      voice.vca.gain.cancelScheduledValues(now);
    }
    voice.vca.gain.setValueAtTime(0.00001, now);
    voice.vca.gain.exponentialRampToValueAtTime(peakGain, now + aaTime);
    voice.vca.gain.exponentialRampToValueAtTime(sustainGain, now + aaTime + adTime);

    // --- 7. LFO Fade-In Modulation ---
    const lfo1Fade = this.lfo1.fadeIn || 0;
    const pAmt1 = this.lfo1.destinations.pitch * 200;
    const vAmt1 = this.lfo1.destinations.vcf * 3600;
    const pwmAmt1 = this.lfo1.destinations.pwm * 0.35;
    const aAmt1 = this.lfo1.destinations.amp * 0.45;

    if (lfo1Fade > 0.01) {
      voice.lfo1PitchGain.gain.setValueAtTime(0, now);
      voice.lfo1PitchGain.gain.linearRampToValueAtTime(pAmt1, now + lfo1Fade);
      voice.lfo1VcfGain.gain.setValueAtTime(0, now);
      voice.lfo1VcfGain.gain.linearRampToValueAtTime(vAmt1, now + lfo1Fade);
      if (voice.lfo1PwmGain1) {
        voice.lfo1PwmGain1.gain.setValueAtTime(0, now);
        voice.lfo1PwmGain1.gain.linearRampToValueAtTime(pwmAmt1, now + lfo1Fade);
      }
      if (voice.lfo1PwmGain2) {
        voice.lfo1PwmGain2.gain.setValueAtTime(0, now);
        voice.lfo1PwmGain2.gain.linearRampToValueAtTime(pwmAmt1, now + lfo1Fade);
      }
      voice.lfo1AmpGain.gain.setValueAtTime(0, now);
      voice.lfo1AmpGain.gain.linearRampToValueAtTime(aAmt1, now + lfo1Fade);
    } else {
      voice.lfo1PitchGain.gain.setValueAtTime(pAmt1, now);
      voice.lfo1VcfGain.gain.setValueAtTime(vAmt1, now);
      if (voice.lfo1PwmGain1) voice.lfo1PwmGain1.gain.setValueAtTime(pwmAmt1, now);
      if (voice.lfo1PwmGain2) voice.lfo1PwmGain2.gain.setValueAtTime(pwmAmt1, now);
      voice.lfo1AmpGain.gain.setValueAtTime(aAmt1, now);
    }

    const lfo2Fade = this.lfo2.fadeIn || 0;
    const pAmt2 = this.lfo2.destinations.pitch * 200;
    const vAmt2 = this.lfo2.destinations.vcf * 3600;
    const pwmAmt2 = this.lfo2.destinations.pwm * 0.35;
    const aAmt2 = this.lfo2.destinations.amp * 0.45;

    if (lfo2Fade > 0.01) {
      voice.lfo2PitchGain.gain.setValueAtTime(0, now);
      voice.lfo2PitchGain.gain.linearRampToValueAtTime(pAmt2, now + lfo2Fade);
      voice.lfo2VcfGain.gain.setValueAtTime(0, now);
      voice.lfo2VcfGain.gain.linearRampToValueAtTime(vAmt2, now + lfo2Fade);
      if (voice.lfo2PwmGain1) {
        voice.lfo2PwmGain1.gain.setValueAtTime(0, now);
        voice.lfo2PwmGain1.gain.linearRampToValueAtTime(pwmAmt2, now + lfo2Fade);
      }
      if (voice.lfo2PwmGain2) {
        voice.lfo2PwmGain2.gain.setValueAtTime(0, now);
        voice.lfo2PwmGain2.gain.linearRampToValueAtTime(pwmAmt2, now + lfo2Fade);
      }
      voice.lfo2AmpGain.gain.setValueAtTime(0, now);
      voice.lfo2AmpGain.gain.linearRampToValueAtTime(aAmt2, now + lfo2Fade);
    } else {
      voice.lfo2PitchGain.gain.setValueAtTime(pAmt2, now);
      voice.lfo2VcfGain.gain.setValueAtTime(vAmt2, now);
      if (voice.lfo2PwmGain1) voice.lfo2PwmGain1.gain.setValueAtTime(pwmAmt2, now);
      if (voice.lfo2PwmGain2) voice.lfo2PwmGain2.gain.setValueAtTime(pwmAmt2, now);
      voice.lfo2AmpGain.gain.setValueAtTime(aAmt2, now);
    }

    this.lastFrequency = vco1Freq;
    this.activeVoices.set(midiNote, voice);

    if (this.onVoiceChange) {
      this.onVoiceChange(this.activeVoices.size, vco1Freq);
    }
  }

  /**
   * Configures BiquadFilter types and resonance Q factors based on selected Filter Mode.
   * Includes safe Q-scaling and resonance gain balancing to prevent self-oscillation blowouts.
   */
  configureFilterNodes(vcf1, vcf2, cutoff, resonance, mode) {
    const now = this.ctx ? this.ctx.currentTime : 0;
    const safeCutoff = Math.max(20, Math.min(20000, cutoff));
    
    switch (mode) {
      case 'lowpass24':
        vcf1.type = 'lowpass';
        vcf2.type = 'lowpass';
        vcf1.frequency.setValueAtTime(safeCutoff, now);
        vcf2.frequency.setValueAtTime(safeCutoff, now);
        vcf1.Q.setValueAtTime(Math.max(0.5, Math.min(7.5, resonance * 0.38)), now);
        vcf2.Q.setValueAtTime(Math.max(0.5, Math.min(9.0, resonance * 0.48)), now);
        break;

      case 'lowpass12':
        vcf1.type = 'lowpass';
        vcf2.type = 'allpass';
        vcf1.frequency.setValueAtTime(safeCutoff, now);
        vcf2.frequency.setValueAtTime(safeCutoff, now);
        vcf1.Q.setValueAtTime(Math.max(0.5, Math.min(14.0, resonance * 0.7)), now);
        vcf2.Q.setValueAtTime(0.1, now);
        break;

      case 'bandpass':
        vcf1.type = 'bandpass';
        vcf2.type = 'bandpass';
        vcf1.frequency.setValueAtTime(safeCutoff, now);
        vcf2.frequency.setValueAtTime(safeCutoff, now);
        vcf1.Q.setValueAtTime(Math.max(0.6, Math.min(8.0, resonance * 0.42)), now);
        vcf2.Q.setValueAtTime(Math.max(0.6, Math.min(8.0, resonance * 0.42)), now);
        break;

      case 'highpass':
        vcf1.type = 'highpass';
        vcf2.type = 'highpass';
        vcf1.frequency.setValueAtTime(safeCutoff, now);
        vcf2.frequency.setValueAtTime(safeCutoff, now);
        vcf1.Q.setValueAtTime(Math.max(0.5, Math.min(7.5, resonance * 0.38)), now);
        vcf2.Q.setValueAtTime(Math.max(0.5, Math.min(9.0, resonance * 0.48)), now);
        break;
    }
  }

  /**
   * Triggers Note Off (Release phase for both VCA and VCF Envelopes without deleting nodes)
   */
  noteOff(midiNote) {
    if (!this.ctx) return;
    const voice = this.activeVoices.get(midiNote);
    if (!voice) return;

    this.activeVoices.delete(midiNote);

    const now = this.ctx.currentTime;
    voice.releaseStartTime = now;

    const ampRelTime = Math.max(0.008, this.ampEnv.release);
    const vcfRelTime = Math.max(0.008, this.filterEnv.release);
    const maxRelTime = Math.max(ampRelTime, vcfRelTime);

    // 1. VCA Volume Release (Smooth asymptotic exponential decay)
    try {
      if (voice.vca && voice.vca.gain) {
        if (voice.vca.gain.cancelAndHoldAtTime) {
          voice.vca.gain.cancelAndHoldAtTime(now);
        } else {
          voice.vca.gain.cancelScheduledValues(now);
        }
        voice.vca.gain.setTargetAtTime(0.0, now, Math.max(0.003, ampRelTime / 3.0));
      }
    } catch (e) {}

    // 2. VCF Filter Cutoff Release
    try {
      if (voice.vcf1 && voice.vcf2) {
        if (voice.vcf1.frequency.cancelAndHoldAtTime) {
          voice.vcf1.frequency.cancelAndHoldAtTime(now);
          voice.vcf2.frequency.cancelAndHoldAtTime(now);
        } else {
          voice.vcf1.frequency.cancelScheduledValues(now);
          voice.vcf2.frequency.cancelScheduledValues(now);
        }
        voice.vcf1.frequency.setTargetAtTime(voice.voiceCutoff, now, Math.max(0.003, vcfRelTime / 3.0));
        voice.vcf2.frequency.setTargetAtTime(voice.voiceCutoff, now, Math.max(0.003, vcfRelTime / 3.0));
      }
    } catch (e) {}

    // Mark voice as idle after full release finishes (Zero GC Churn)
    const cleanupDelayMs = (maxRelTime * 1.5 + 0.05) * 1000;
    if (voice.cleanupTimer) clearTimeout(voice.cleanupTimer);
    voice.cleanupTimer = setTimeout(() => {
      if (voice.releaseStartTime === now) {
        voice.isBusy = false;
        voice.midiNote = null;
        voice.releaseStartTime = 0;
      }
    }, cleanupDelayMs);

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
    if (this.ctx && this.voicePool) {
      const now = this.ctx.currentTime;
      for (const voice of this.voicePool) {
        if (wave === 'square') {
          voice.osc1.type = 'sawtooth';
          if (voice.osc1DirectGain) voice.osc1DirectGain.gain.setTargetAtTime(0.0, now, 0.005);
          if (voice.osc1PulseGain) voice.osc1PulseGain.gain.setTargetAtTime(1.0, now, 0.005);
        } else {
          voice.osc1.type = wave;
          if (voice.osc1DirectGain) voice.osc1DirectGain.gain.setTargetAtTime(1.0, now, 0.005);
          if (voice.osc1PulseGain) voice.osc1PulseGain.gain.setTargetAtTime(0.0, now, 0.005);
        }
      }
    }
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
    if (this.ctx && this.voicePool) {
      const now = this.ctx.currentTime;
      for (const voice of this.voicePool) {
        if (wave === 'square') {
          voice.osc2.type = 'sawtooth';
          if (voice.osc2DirectGain) voice.osc2DirectGain.gain.setTargetAtTime(0.0, now, 0.005);
          if (voice.osc2PulseGain) voice.osc2PulseGain.gain.setTargetAtTime(1.0, now, 0.005);
        } else {
          voice.osc2.type = wave;
          if (voice.osc2DirectGain) voice.osc2DirectGain.gain.setTargetAtTime(1.0, now, 0.005);
          if (voice.osc2PulseGain) voice.osc2PulseGain.gain.setTargetAtTime(0.0, now, 0.005);
        }
      }
    }
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
    if (this.ctx && this.voicePool) {
      const now = this.ctx.currentTime;
      for (const voice of this.voicePool) {
        voice.osc1Gain.gain.setTargetAtTime(this.mixer.vco1Level, now, 0.015);
      }
    }
  }

  setMixerVCO2(level) {
    this.mixer.vco2Level = parseFloat(level);
    if (this.ctx && this.voicePool) {
      const now = this.ctx.currentTime;
      for (const voice of this.voicePool) {
        voice.osc2Gain.gain.setTargetAtTime(this.mixer.vco2Level, now, 0.015);
      }
    }
  }

  setMixerSub(level) {
    this.mixer.subLevel = parseFloat(level);
    if (this.ctx && this.voicePool) {
      const now = this.ctx.currentTime;
      for (const voice of this.voicePool) {
        voice.subGain.gain.setTargetAtTime(this.mixer.subLevel, now, 0.015);
      }
    }
  }

  setMixerSubOctave(oct) {
    this.mixer.subOctave = parseInt(oct, 10);
    this.updateAllVoiceFrequencies();
  }

  setMixerNoise(level) {
    this.mixer.noiseLevel = parseFloat(level);
    if (this.ctx && this.voicePool) {
      const now = this.ctx.currentTime;
      for (const voice of this.voicePool) {
        voice.noiseGain.gain.setTargetAtTime(this.mixer.noiseLevel, now, 0.015);
      }
    }
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
    if (this.ctx && this.voicePool) {
      const curve = this.makeDistortionCurve(this.vcf.drive);
      for (const voice of this.voicePool) {
        voice.driveShaper.curve = curve;
      }
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

  setFilterEnvAttack(val) {
    this.filterEnv.attack = Math.max(0.001, parseFloat(val));
  }

  setFilterEnvDecay(val) {
    this.filterEnv.decay = Math.max(0.001, parseFloat(val));
  }

  setFilterEnvSustain(val) {
    this.filterEnv.sustain = Math.max(0.0, Math.min(1.0, parseFloat(val)));
  }

  setFilterEnvRelease(val) {
    this.filterEnv.release = Math.max(0.005, parseFloat(val));
  }

  setAmpEnvAttack(val) {
    this.ampEnv.attack = Math.max(0.001, parseFloat(val));
  }

  setAmpEnvDecay(val) {
    this.ampEnv.decay = Math.max(0.001, parseFloat(val));
  }

  setAmpEnvSustain(val) {
    this.ampEnv.sustain = Math.max(0.0, Math.min(1.0, parseFloat(val)));
  }

  setAmpEnvRelease(val) {
    this.ampEnv.release = Math.max(0.005, parseFloat(val));
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
        lfo.destinations.pitch = Math.max(0, Math.min(1, parseFloat(val)));
        if (this.ctx && this.voicePool) {
          const now = this.ctx.currentTime;
          for (const voice of this.voicePool) {
            const node = lfoNum === 2 ? voice.lfo2PitchGain : voice.lfo1PitchGain;
            if (node) {
              node.gain.setTargetAtTime(lfo.destinations.pitch * 200, now, 0.02);
            }
          }
        }
        break;

      case 'vcf':
        lfo.destinations.vcf = Math.max(0, Math.min(1, parseFloat(val)));
        if (this.ctx && this.voicePool) {
          const now = this.ctx.currentTime;
          for (const voice of this.voicePool) {
            const node = lfoNum === 2 ? voice.lfo2VcfGain : voice.lfo1VcfGain;
            if (node) {
              node.gain.setTargetAtTime(lfo.destinations.vcf * 3600, now, 0.02);
            }
          }
        }
        break;

      case 'pwm':
        lfo.destinations.pwm = Math.max(0, Math.min(1, parseFloat(val)));
        if (this.ctx && this.voicePool) {
          const now = this.ctx.currentTime;
          const amt = lfo.destinations.pwm * 0.35;
          for (const voice of this.voicePool) {
            const node1 = lfoNum === 2 ? voice.lfo2PwmGain1 : voice.lfo1PwmGain1;
            const node2 = lfoNum === 2 ? voice.lfo2PwmGain2 : voice.lfo1PwmGain2;
            if (node1) {
              node1.gain.setTargetAtTime(amt, now, 0.02);
            }
            if (node2) {
              node2.gain.setTargetAtTime(amt, now, 0.02);
            }
          }
        }
        break;

      case 'amp':
        lfo.destinations.amp = Math.max(0, Math.min(1, parseFloat(val)));
        if (this.ctx && this.voicePool) {
          const now = this.ctx.currentTime;
          for (const voice of this.voicePool) {
            const node = lfoNum === 2 ? voice.lfo2AmpGain : voice.lfo1AmpGain;
            if (node) {
              node.gain.setTargetAtTime(lfo.destinations.amp * 0.45, now, 0.02);
            }
          }
        }
        break;
    }
  }

  // --- STEREO FX SETTERS ---

  setChorusMode(mode) {
    this.fx.chorus.mode = mode;
    if (this.ctx && this.chorusWetGain && this.chorusLfo && this.chorusLfoGainL) {
      const now = this.ctx.currentTime;
      let rate = 0.5;
      let depth = 0.0035;
      let wet = this.fx.chorus.mix;

      switch (mode) {
        case 'off':
          wet = 0.0;
          break;
        case 'I':
          rate = 0.45;
          depth = 0.003;
          break;
        case 'II':
          rate = 0.85;
          depth = 0.0045;
          break;
        case 'I+II':
          rate = 1.35;
          depth = 0.0065;
          break;
      }

      this.chorusWetGain.gain.setTargetAtTime(wet, now, 0.02);
      this.chorusLfo.frequency.setTargetAtTime(rate, now, 0.02);
      this.chorusLfoGainL.gain.setTargetAtTime(depth, now, 0.02);
      this.chorusLfoGainR.gain.setTargetAtTime(-depth, now, 0.02);
    }
  }

  setChorusMix(val) {
    this.fx.chorus.mix = Math.max(0, Math.min(1, parseFloat(val)));
    if (this.ctx && this.chorusWetGain && this.fx.chorus.mode !== 'off') {
      this.chorusWetGain.gain.setTargetAtTime(this.fx.chorus.mix, this.ctx.currentTime, 0.02);
    }
  }

  setDelayTime(val) {
    this.fx.delay.time = Math.max(0.02, Math.min(1.0, parseFloat(val)));
    if (this.ctx && this.delayL && this.delayR) {
      const now = this.ctx.currentTime;
      this.delayL.delayTime.setTargetAtTime(this.fx.delay.time, now, 0.03);
      this.delayR.delayTime.setTargetAtTime(this.fx.delay.time * 1.333, now, 0.03);
    }
  }

  setDelayFeedback(val) {
    this.fx.delay.feedback = Math.max(0.0, Math.min(0.9, parseFloat(val)));
    if (this.ctx && this.delayFeedbackGainL && this.delayFeedbackGainR) {
      const now = this.ctx.currentTime;
      this.delayFeedbackGainL.gain.setTargetAtTime(this.fx.delay.feedback, now, 0.02);
      this.delayFeedbackGainR.gain.setTargetAtTime(this.fx.delay.feedback, now, 0.02);
    }
  }

  setDelayMix(val) {
    this.fx.delay.mix = Math.max(0, Math.min(1, parseFloat(val)));
    if (this.ctx && this.delayWetGain) {
      this.delayWetGain.gain.setTargetAtTime(this.fx.delay.mix, this.ctx.currentTime, 0.02);
    }
  }

  setReverbDecay(val) {
    this.fx.reverb.decay = Math.max(0.5, Math.min(10.0, parseFloat(val)));
    if (this.ctx && this.reverbConvolver) {
      this.updateReverbImpulse(this.fx.reverb.decay);
    }
  }

  setReverbMix(val) {
    this.fx.reverb.mix = Math.max(0, Math.min(1, parseFloat(val)));
    if (this.ctx && this.reverbWetGain) {
      this.reverbWetGain.gain.setTargetAtTime(this.fx.reverb.mix, this.ctx.currentTime, 0.02);
    }
  }

  updateAllVoiceFilters() {
    if (!this.ctx || !this.voicePool) return;
    for (const voice of this.voicePool) {
      const cutoff = voice.midiNote !== null ? this.getVoiceCutoffFrequency(voice.midiNote) : this.vcf.cutoff;
      voice.voiceCutoff = cutoff;
      this.configureFilterNodes(voice.vcf1, voice.vcf2, cutoff, this.vcf.resonance, this.vcf.type);
    }
  }

  updateAllVoiceFrequencies() {
    if (!this.ctx || !this.voicePool) return;
    const now = this.ctx.currentTime;
    for (const voice of this.voicePool) {
      if (voice.midiNote !== null) {
        const baseFreq = this.midiNoteToFrequency(voice.midiNote);
        const vco1Freq = this.getVCO1Frequency(baseFreq);
        const vco2Freq = this.getVCO2Frequency(baseFreq);
        const subFreq = baseFreq * Math.pow(2, this.mixer.subOctave) * this.pitchBendFactor;

        voice.osc1.frequency.setTargetAtTime(vco1Freq, now, 0.015);
        voice.osc2.frequency.setTargetAtTime(vco2Freq, now, 0.015);
        voice.subOsc.frequency.setTargetAtTime(subFreq, now, 0.015);
      }
    }
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
    return {
      vco1: { wave: this.vco1.wave, octave: this.vco1.octave, pulseWidth: this.vco1.pulseWidth },
      vco2: { wave: this.vco2.wave, octave: this.vco2.octave, semitone: this.vco2.semitone, detuneCents: this.vco2.detuneCents, hardSync: this.vco2.hardSync },
      mixer: { vco1Level: this.mixer.vco1Level, vco2Level: this.mixer.vco2Level, subLevel: this.mixer.subLevel, subOctave: this.mixer.subOctave, noiseLevel: this.mixer.noiseLevel },
      vcf: { cutoff: this.vcf.cutoff, resonance: this.vcf.resonance, type: this.vcf.type, drive: this.vcf.drive, keyTrack: this.vcf.keyTrack, envMod: this.vcf.envMod },
      filterEnv: { attack: this.filterEnv.attack, decay: this.filterEnv.decay, sustain: this.filterEnv.sustain, release: this.filterEnv.release },
      ampEnv: { attack: this.ampEnv.attack, decay: this.ampEnv.decay, sustain: this.ampEnv.sustain, release: this.ampEnv.release },
      lfo1: { wave: this.lfo1.wave, rate: this.lfo1.rate, fadeIn: this.lfo1.fadeIn, destinations: { ...this.lfo1.destinations } },
      lfo2: { wave: this.lfo2.wave, rate: this.lfo2.rate, fadeIn: this.lfo2.fadeIn, destinations: { ...this.lfo2.destinations } },
      fx: {
        chorus: { mode: this.fx.chorus.mode, mix: this.fx.chorus.mix },
        delay: { time: this.fx.delay.time, feedback: this.fx.delay.feedback, mix: this.fx.delay.mix },
        reverb: { decay: this.fx.reverb.decay, mix: this.fx.reverb.mix }
      },
      performance: { glide: this.glideEnabled, octaveShift: this.octaveShift }
    };
  }

  loadPresetState(state) {
    if (!state) return;
    if (state.vco1) {
      if (state.vco1.wave) this.setVCO1Wave(state.vco1.wave);
      if (state.vco1.octave !== undefined) this.setVCO1Octave(state.vco1.octave);
      if (state.vco1.pulseWidth !== undefined) this.setVCO1PW(state.vco1.pulseWidth);
    }
    if (state.vco2) {
      if (state.vco2.wave) this.setVCO2Wave(state.vco2.wave);
      if (state.vco2.octave !== undefined) this.setVCO2Octave(state.vco2.octave);
      if (state.vco2.semitone !== undefined) this.setVCO2Semitone(state.vco2.semitone);
      if (state.vco2.detuneCents !== undefined) this.setVCO2Detune(state.vco2.detuneCents);
      if (state.vco2.hardSync !== undefined) this.setVCO2Sync(state.vco2.hardSync);
    }
    if (state.mixer) {
      if (state.mixer.vco1Level !== undefined) this.setMixerVCO1(state.mixer.vco1Level);
      if (state.mixer.vco2Level !== undefined) this.setMixerVCO2(state.mixer.vco2Level);
      if (state.mixer.subLevel !== undefined) this.setMixerSub(state.mixer.subLevel);
      if (state.mixer.subOctave !== undefined) this.setMixerSubOctave(state.mixer.subOctave);
      if (state.mixer.noiseLevel !== undefined) this.setMixerNoise(state.mixer.noiseLevel);
    }
    if (state.vcf) {
      if (state.vcf.cutoff !== undefined) this.setVCFCutoff(state.vcf.cutoff);
      if (state.vcf.resonance !== undefined) this.setVCFResonance(state.vcf.resonance);
      if (state.vcf.type) this.setVCFType(state.vcf.type);
      if (state.vcf.drive !== undefined) this.setVCFDrive(state.vcf.drive);
      if (state.vcf.keyTrack !== undefined) this.setVCFKeyTrack(state.vcf.keyTrack);
      if (state.vcf.envMod !== undefined) this.setVCFEnvMod(state.vcf.envMod);
    }
    if (state.filterEnv) {
      if (state.filterEnv.attack !== undefined) this.setFilterEnvAttack(state.filterEnv.attack);
      if (state.filterEnv.decay !== undefined) this.setFilterEnvDecay(state.filterEnv.decay);
      if (state.filterEnv.sustain !== undefined) this.setFilterEnvSustain(state.filterEnv.sustain);
      if (state.filterEnv.release !== undefined) this.setFilterEnvRelease(state.filterEnv.release);
    }
    if (state.ampEnv) {
      if (state.ampEnv.attack !== undefined) this.setAmpEnvAttack(state.ampEnv.attack);
      if (state.ampEnv.decay !== undefined) this.setAmpEnvDecay(state.ampEnv.decay);
      if (state.ampEnv.sustain !== undefined) this.setAmpEnvSustain(state.ampEnv.sustain);
      if (state.ampEnv.release !== undefined) this.setAmpEnvRelease(state.ampEnv.release);
    }
    if (state.lfo1) {
      if (state.lfo1.wave) this.setLFOParam(1, 'wave', state.lfo1.wave);
      if (state.lfo1.rate !== undefined) this.setLFOParam(1, 'rate', state.lfo1.rate);
      if (state.lfo1.fadeIn !== undefined) this.setLFOParam(1, 'fadeIn', state.lfo1.fadeIn);
      if (state.lfo1.destinations) {
        if (state.lfo1.destinations.pitch !== undefined) this.setLFOParam(1, 'pitch', state.lfo1.destinations.pitch);
        if (state.lfo1.destinations.vcf !== undefined) this.setLFOParam(1, 'vcf', state.lfo1.destinations.vcf);
        if (state.lfo1.destinations.pwm !== undefined) this.setLFOParam(1, 'pwm', state.lfo1.destinations.pwm);
        if (state.lfo1.destinations.amp !== undefined) this.setLFOParam(1, 'amp', state.lfo1.destinations.amp);
      }
    }
    if (state.lfo2) {
      if (state.lfo2.wave) this.setLFOParam(2, 'wave', state.lfo2.wave);
      if (state.lfo2.rate !== undefined) this.setLFOParam(2, 'rate', state.lfo2.rate);
      if (state.lfo2.fadeIn !== undefined) this.setLFOParam(2, 'fadeIn', state.lfo2.fadeIn);
      if (state.lfo2.destinations) {
        if (state.lfo2.destinations.pitch !== undefined) this.setLFOParam(2, 'pitch', state.lfo2.destinations.pitch);
        if (state.lfo2.destinations.vcf !== undefined) this.setLFOParam(2, 'vcf', state.lfo2.destinations.vcf);
        if (state.lfo2.destinations.pwm !== undefined) this.setLFOParam(2, 'pwm', state.lfo2.destinations.pwm);
        if (state.lfo2.destinations.amp !== undefined) this.setLFOParam(2, 'amp', state.lfo2.destinations.amp);
      }
    }
    if (state.fx) {
      if (state.fx.chorus) {
        if (state.fx.chorus.mode) this.setChorusMode(state.fx.chorus.mode);
        if (state.fx.chorus.mix !== undefined) this.setChorusMix(state.fx.chorus.mix);
      }
      if (state.fx.delay) {
        if (state.fx.delay.time !== undefined) this.setDelayTime(state.fx.delay.time);
        if (state.fx.delay.feedback !== undefined) this.setDelayFeedback(state.fx.delay.feedback);
        if (state.fx.delay.mix !== undefined) this.setDelayMix(state.fx.delay.mix);
      }
      if (state.fx.reverb) {
        if (state.fx.reverb.decay !== undefined) this.setReverbDecay(state.fx.reverb.decay);
        if (state.fx.reverb.mix !== undefined) this.setReverbMix(state.fx.reverb.mix);
      }
    }
    if (state.performance) {
      if (state.performance.glide !== undefined) this.setGlide(state.performance.glide);
      if (state.performance.octaveShift !== undefined) this.setOctaveShift(state.performance.octaveShift);
    }
  }
}

window.AudioEngine = AudioEngine;
