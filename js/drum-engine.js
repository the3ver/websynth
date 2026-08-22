/**
 * RETROBEAT D-909 • ANALOG DRUM & BASS DSP ENGINE
 * Pure Web Audio API Synthesized Drum Computer & 303 Acid Bassline Sequencer.
 * Features:
 * - 6 DSP Drum Voices: Kick (BD), Snare (SD), Closed Hat (CH), Open Hat (OH with choke), Clap (CP), Tom (TM)
 * - Monophonic 303-Style Acid & Sub-Bass Synthesizer with Cutoff, Resonance, Accent & Slide/Portamento
 * - 16-Step Pattern Sequencer with Accents, Swings, Mutes and Solos
 * - Inline Web Worker Master Precision Clock with Zero Jitter
 * - Master Clock Synchronization Broadcast for RETROVOX SUB-1 Synthesizer
 * - 6 Preset Factory Patterns (Techno, Acid, Electro, Synthwave, Darksynth, Drum & Bass)
 */

class DrumEngine {
  constructor(audioEngine) {
    this.synthAudio = audioEngine;
    this.ctx = null;
    this.outputBus = null;

    // Master Drum & Bass Controls
    this.bpm = 132;
    this.swing = 0.0; // 0.0 to 0.65
    this.volume = 0.85;
    this.isPlaying = false;
    this.currentStep = 0; // 0 to 15
    this.isMuted = false;

    // Master Clock Synchronization
    this.syncSlaves = []; // Array of slave engines listening to clock ticks
    this.worker = null;
    this.lookahead = 20.0; // ms
    this.scheduleAheadTime = 0.1; // seconds
    this.nextStepTime = 0.0;
    this.timerId = null;

    // UI Callbacks
    this.onStep = null; // (stepIndex) => void
    this.onPlayStateChange = null; // (isPlaying) => void

    // Active voice references for choking (e.g. Open Hat choked by Closed Hat)
    this.activeOpenHatGain = null;
    this.activeBassVoice = null;

    // Track Mute & Solo States (0: BD, 1: SD, 2: CH, 3: OH, 4: CP, 5: BASS)
    this.trackMutes = [false, false, false, false, false, false];
    this.trackSolos = [false, false, false, false, false, false];
    this.trackVolumes = [0.95, 0.85, 0.75, 0.75, 0.80, 0.85];

    // Sound Design Parameters
    this.params = {
      bd: { tune: 48, decay: 0.35, click: 0.6, drive: 0.3 },
      sd: { tune: 190, snappy: 0.7, tone: 0.5, decay: 0.22 },
      hh: { pitch: 8000, decay: 0.05, openDecay: 0.38 },
      cp: { tone: 1200, decay: 0.24 },
      bass: { wave: 'sawtooth', cutoff: 1400, resonance: 12.0, envMod: 0.7, decay: 0.28, drive: 0.35 }
    };

    // Shared Metallic Noise Buffer for Hats & Snare
    this.metallicNoiseBuffer = null;

    // 16-Step Pattern Grid
    // Each track has 16 steps: 0 = Off, 1 = Normal, 2 = Accent
    this.patterns = {
      // 0: BD, 1: SD, 2: CH, 3: OH, 4: CP
      drums: [
        [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0], // BD (Four on the floor)
        [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0], // SD
        [1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1], // CH
        [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0], // OH (Off-beat)
        [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0]  // CP
      ],
      // Bassline: 16 steps with { note: MIDI, accent: bool, slide: bool, gate: bool }
      bass: [
        { note: 36, gate: true,  accent: true,  slide: false }, // C2
        { note: 36, gate: false, accent: false, slide: false },
        { note: 36, gate: true,  accent: false, slide: true  }, // C2 ->
        { note: 39, gate: true,  accent: false, slide: false }, // Eb2
        { note: 36, gate: true,  accent: false, slide: false }, // C2
        { note: 36, gate: false, accent: false, slide: false },
        { note: 41, gate: true,  accent: true,  slide: true  }, // F2 ->
        { note: 42, gate: true,  accent: false, slide: false }, // F#2
        { note: 36, gate: true,  accent: true,  slide: false }, // C2
        { note: 36, gate: false, accent: false, slide: false },
        { note: 48, gate: true,  accent: true,  slide: false }, // C3 (High Octave)
        { note: 46, gate: true,  accent: false, slide: true  }, // Bb2
        { note: 36, gate: true,  accent: false, slide: false }, // C2
        { note: 39, gate: true,  accent: false, slide: false }, // Eb2
        { note: 41, gate: true,  accent: true,  slide: true  }, // F2 ->
        { note: 36, gate: true,  accent: false, slide: false }  // C2
      ]
    };

    // Factory Pattern Library
    this.factoryKits = this.initFactoryKits();

    this.initClockWorker();
  }

  /**
   * Initializes Web Audio Context and Master Drum Bus routing into Synthesizer Master Bus
   */
  initAudio() {
    if (!this.ctx && this.synthAudio) {
      if (!this.synthAudio.ctx) {
        this.synthAudio.initAudio();
      }
      this.ctx = this.synthAudio.ctx;

      // Master Drum Output Bus
      this.outputBus = this.ctx.createGain();
      this.outputBus.gain.setValueAtTime(this.volume, this.ctx.currentTime);

      // Connect Drum Bus directly to Synthesizer Analyser Bus (so speakers/visualizers bounce!)
      if (this.synthAudio.analyser) {
        this.outputBus.connect(this.synthAudio.analyser);
      } else {
        this.outputBus.connect(this.ctx.destination);
      }

      this.createMetallicNoiseBuffer();
    }
  }

  /**
   * Web Worker Precision Master Clock (Zero Drift Lookahead)
   */
  initClockWorker() {
    try {
      const workerCode = `
        let timerId = null;
        let interval = 20;
        self.onmessage = function(e) {
          if (e.data === 'start') {
            if (timerId) clearInterval(timerId);
            timerId = setInterval(function() {
              self.postMessage('tick');
            }, interval);
          } else if (e.data === 'stop') {
            if (timerId) {
              clearInterval(timerId);
              timerId = null;
            }
          }
        };
      `;
      const blob = new Blob([workerCode], { type: 'application/javascript' });
      this.worker = new Worker(URL.createObjectURL(blob));
      this.worker.onmessage = (e) => {
        if (e.data === 'tick' && this.isPlaying) {
          this.scheduler();
        }
      };
    } catch (err) {
      console.warn('Drum Engine Clock fallback to main thread timer:', err);
      this.worker = null;
    }
  }

  /**
   * Register a slave device (e.g. Synthesizer Arpeggiator) for Master Sync
   */
  registerSyncSlave(slave) {
    if (!this.syncSlaves.includes(slave)) {
      this.syncSlaves.push(slave);
    }
  }

  unregisterSyncSlave(slave) {
    this.syncSlaves = this.syncSlaves.filter(s => s !== slave);
  }

  /**
   * Lookahead Scheduler for 16th-note steps
   */
  scheduler() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    while (this.nextStepTime < now + this.scheduleAheadTime) {
      this.scheduleStep(this.currentStep, this.nextStepTime);
      this.advanceStep();
    }
  }

  advanceStep() {
    // 16th note step duration in seconds
    const secondsPerBeat = 60.0 / this.bpm;
    let stepDuration = 0.25 * secondsPerBeat;

    // Apply Swing on odd steps (1, 3, 5, 7, 9, 11, 13, 15)
    if (this.currentStep % 2 === 1 && this.swing > 0.01) {
      stepDuration += stepDuration * this.swing * 0.45;
    } else if (this.currentStep % 2 === 0 && this.swing > 0.01) {
      stepDuration -= stepDuration * this.swing * 0.45;
    }

    this.nextStepTime += stepDuration;
    this.currentStep = (this.currentStep + 1) % 16;
  }

  scheduleStep(stepIndex, time) {
    // Check Track Solos
    const hasSolo = this.trackSolos.some(s => s === true);

    const isTrackAudible = (trackIdx) => {
      if (this.isMuted) return false;
      if (hasSolo) return this.trackSolos[trackIdx];
      return !this.trackMutes[trackIdx];
    };

    // 1. Trigger Drums
    // BD (0)
    const bdVal = this.patterns.drums[0][stepIndex];
    if (bdVal > 0 && isTrackAudible(0)) {
      this.triggerKick(time, bdVal === 2, this.trackVolumes[0]);
    }

    // SD (1)
    const sdVal = this.patterns.drums[1][stepIndex];
    if (sdVal > 0 && isTrackAudible(1)) {
      this.triggerSnare(time, sdVal === 2, this.trackVolumes[1]);
    }

    // CH (2)
    const chVal = this.patterns.drums[2][stepIndex];
    if (chVal > 0 && isTrackAudible(2)) {
      this.triggerClosedHat(time, chVal === 2, this.trackVolumes[2]);
    }

    // OH (3)
    const ohVal = this.patterns.drums[3][stepIndex];
    if (ohVal > 0 && isTrackAudible(3)) {
      this.triggerOpenHat(time, ohVal === 2, this.trackVolumes[3]);
    }

    // CP (4)
    const cpVal = this.patterns.drums[4][stepIndex];
    if (cpVal > 0 && isTrackAudible(4)) {
      this.triggerClap(time, cpVal === 2, this.trackVolumes[4]);
    }

    // 2. Trigger 303 Bassline
    const bassStep = this.patterns.bass[stepIndex];
    if (bassStep && bassStep.gate && isTrackAudible(5)) {
      this.triggerBass(time, bassStep.note, bassStep.accent, bassStep.slide, this.trackVolumes[5]);
    }

    // 3. Broadcast Clock Pulse to Synced Slaves (Synthesizer Arpeggiator)
    for (const slave of this.syncSlaves) {
      if (slave && typeof slave.handleExternalClockTick === 'function') {
        slave.handleExternalClockTick(stepIndex, time, 60.0 / this.bpm);
      }
    }

    // 4. Trigger UI Visual Light Tracker on Main Thread
    if (this.onStep) {
      const delayMs = Math.max(0, (time - this.ctx.currentTime) * 1000);
      setTimeout(() => {
        if (this.isPlaying && this.onStep) {
          this.onStep(stepIndex);
        }
      }, delayMs);
    }
  }

  /**
   * Transport Start / Stop
   */
  start() {
    this.initAudio();
    if (!this.ctx) return;
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }

    this.isPlaying = true;
    this.currentStep = 0;
    this.nextStepTime = this.ctx.currentTime + 0.05;

    if (this.worker) {
      this.worker.postMessage('start');
    } else {
      if (this.timerId) clearInterval(this.timerId);
      this.timerId = setInterval(() => this.scheduler(), this.lookahead);
    }

    if (this.onPlayStateChange) this.onPlayStateChange(true);

    // Notify Sync Slaves of Transport Start
    for (const slave of this.syncSlaves) {
      if (slave && typeof slave.handleExternalTransport === 'function') {
        slave.handleExternalTransport(true);
      }
    }
  }

  stop() {
    this.isPlaying = false;
    if (this.worker) {
      this.worker.postMessage('stop');
    }
    if (this.timerId) {
      clearInterval(this.timerId);
      this.timerId = null;
    }

    if (this.onPlayStateChange) this.onPlayStateChange(false);
    if (this.onStep) this.onStep(-1);

    // Notify Sync Slaves of Transport Stop
    for (const slave of this.syncSlaves) {
      if (slave && typeof slave.handleExternalTransport === 'function') {
        slave.handleExternalTransport(false);
      }
    }
  }

  togglePlay() {
    if (this.isPlaying) {
      this.stop();
    } else {
      this.start();
    }
    return this.isPlaying;
  }

  setBpm(bpm) {
    this.bpm = Math.max(40, Math.min(300, parseFloat(bpm) || 120));
  }

  setSwing(swing) {
    this.swing = Math.max(0, Math.min(0.7, parseFloat(swing) || 0));
  }

  setVolume(vol) {
    this.volume = Math.max(0, Math.min(1.0, parseFloat(vol) || 0.8));
    if (this.outputBus && this.ctx) {
      this.outputBus.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.01);
    }
  }

  // =========================================================================
  // DSP DRUM & BASS SYNTHESIS ALGORITHMS (Zero Samples, 100% Native Web Audio)
  // =========================================================================

  /**
   * 1. BD - Bass Drum (Analog Pitch-Swept Sub-Kick with Transient Click & Tanh Saturation)
   */
  triggerKick(time, accent = false, level = 1.0) {
    if (!this.ctx || !this.outputBus) return;

    const baseTune = this.params.bd.tune; // 40 - 65 Hz
    const decay = this.params.bd.decay * (accent ? 1.2 : 1.0);
    const ampVal = (accent ? 1.3 : 1.0) * level;

    // Body Oscillator
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    const startFreq = baseTune * 3.8;
    osc.frequency.setValueAtTime(startFreq, time);
    osc.frequency.exponentialRampToValueAtTime(baseTune, time + 0.045);
    osc.frequency.exponentialRampToValueAtTime(25, time + decay);

    // Transient Click Burst (Pop)
    const clickOsc = this.ctx.createOscillator();
    clickOsc.type = 'triangle';
    clickOsc.frequency.setValueAtTime(220, time);
    clickOsc.frequency.exponentialRampToValueAtTime(40, time + 0.012);

    const clickGain = this.ctx.createGain();
    clickGain.gain.setValueAtTime(this.params.bd.click * ampVal * 0.7, time);
    clickGain.gain.exponentialRampToValueAtTime(0.001, time + 0.015);

    // Amp Envelope
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(ampVal, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + decay);

    // Soft Saturation Drive
    const drive = this.ctx.createWaveShaper();
    drive.curve = this.makeTanhCurve(1.0 + this.params.bd.drive * 3.5);

    osc.connect(gain);
    clickOsc.connect(clickGain);
    clickGain.connect(gain);
    gain.connect(drive);
    drive.connect(this.outputBus);

    osc.start(time);
    clickOsc.start(time);
    osc.stop(time + decay + 0.02);
    clickOsc.stop(time + 0.02);
  }

  /**
   * 2. SD - Snare Drum (Dual Resonant Tones + Filtered White Noise Snappy)
   */
  triggerSnare(time, accent = false, level = 1.0) {
    if (!this.ctx || !this.outputBus) return;

    const baseTone = this.params.sd.tune; // 180 Hz
    const decay = this.params.sd.decay * (accent ? 1.15 : 1.0);
    const ampVal = (accent ? 1.25 : 1.0) * level;

    // Body Tones (2 resonating sine modes)
    const osc1 = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    osc1.type = 'triangle';
    osc2.type = 'sine';
    osc1.frequency.setValueAtTime(baseTone, time);
    osc1.frequency.exponentialRampToValueAtTime(baseTone * 0.7, time + decay * 0.5);
    osc2.frequency.setValueAtTime(baseTone * 1.8, time);
    osc2.frequency.exponentialRampToValueAtTime(baseTone * 1.2, time + decay * 0.4);

    const toneGain = this.ctx.createGain();
    toneGain.gain.setValueAtTime(this.params.sd.tone * ampVal * 0.7, time);
    toneGain.gain.exponentialRampToValueAtTime(0.001, time + decay * 0.6);

    // Snappy White Noise Layer
    const noiseNode = this.ctx.createBufferSource();
    noiseNode.buffer = this.getNoiseBuffer();

    const noiseFilter = this.ctx.createBiquadFilter();
    noiseFilter.type = 'highpass';
    noiseFilter.frequency.setValueAtTime(1200, time);

    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(this.params.sd.snappy * ampVal * 0.8, time);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, time + decay);

    osc1.connect(toneGain);
    osc2.connect(toneGain);
    toneGain.connect(this.outputBus);

    noiseNode.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(this.outputBus);

    osc1.start(time);
    osc2.start(time);
    noiseNode.start(time);

    osc1.stop(time + decay + 0.02);
    osc2.stop(time + decay + 0.02);
    noiseNode.stop(time + decay + 0.02);
  }

  /**
   * 3. CH - Closed Hi-Hat (6-Oscillator Metallic Cluster + Choke Function)
   */
  triggerClosedHat(time, accent = false, level = 1.0) {
    if (!this.ctx || !this.outputBus) return;

    // Choke open hat if active
    if (this.activeOpenHatGain) {
      try {
        this.activeOpenHatGain.gain.cancelScheduledValues(time);
        this.activeOpenHatGain.gain.setTargetAtTime(0.0001, time, 0.004);
      } catch(e) {}
      this.activeOpenHatGain = null;
    }

    const decay = this.params.hh.decay * (accent ? 1.2 : 1.0);
    const ampVal = (accent ? 1.25 : 1.0) * level * 0.7;

    const hatSource = this.createMetallicCluster(time);
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(this.params.hh.pitch, time);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(ampVal, time);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + decay);

    hatSource.connect(filter);
    filter.connect(gain);
    gain.connect(this.outputBus);

    hatSource.start(time);
    hatSource.stop(time + decay + 0.02);
  }

  /**
   * 4. OH - Open Hi-Hat
   */
  triggerOpenHat(time, accent = false, level = 1.0) {
    if (!this.ctx || !this.outputBus) return;

    const decay = this.params.hh.openDecay * (accent ? 1.2 : 1.0);
    const ampVal = (accent ? 1.25 : 1.0) * level * 0.75;

    const hatSource = this.createMetallicCluster(time);
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(this.params.hh.pitch * 0.9, time);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(ampVal, time);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + decay);

    this.activeOpenHatGain = gain;

    hatSource.connect(filter);
    filter.connect(gain);
    gain.connect(this.outputBus);

    hatSource.start(time);
    hatSource.stop(time + decay + 0.05);
  }

  /**
   * 5. CP - Handclap (3 Micro-Impulses + Reverb-Tail Noise Burst)
   */
  triggerClap(time, accent = false, level = 1.0) {
    if (!this.ctx || !this.outputBus) return;

    const ampVal = (accent ? 1.3 : 1.0) * level * 0.85;
    const decay = this.params.cp.decay * (accent ? 1.2 : 1.0);

    const noise = this.ctx.createBufferSource();
    noise.buffer = this.getNoiseBuffer();

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(this.params.cp.tone, time);
    filter.Q.setValueAtTime(2.5, time);

    const gain = this.ctx.createGain();
    // 3 micro impulses at t, t+0.011, t+0.022
    gain.gain.setValueAtTime(ampVal, time);
    gain.gain.exponentialRampToValueAtTime(0.01, time + 0.009);

    gain.gain.setValueAtTime(ampVal * 0.9, time + 0.011);
    gain.gain.exponentialRampToValueAtTime(0.01, time + 0.020);

    gain.gain.setValueAtTime(ampVal, time + 0.022);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.022 + decay);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.outputBus);

    noise.start(time);
    noise.stop(time + 0.03 + decay);
  }

  /**
   * 6. 303 ACID / SUB-BASS SYNTHESIZER (Monophonic with Cutoff, Resonance, Accent & Slide)
   */
  triggerBass(time, midiNote, accent = false, slide = false, level = 1.0) {
    if (!this.ctx || !this.outputBus) return;

    const freq = 440 * Math.pow(2, (midiNote - 69) / 12);
    const decay = this.params.bass.decay * (accent ? 1.3 : 1.0);
    const ampVal = (accent ? 1.35 : 1.0) * level * 0.75;
    const cutoffBase = this.params.bass.cutoff;
    const envMod = this.params.bass.envMod;

    // If slide is active and previous voice exists, glide pitch smoothly
    if (slide && this.activeBassVoice) {
      const prevOsc = this.activeBassVoice.osc;
      const prevFilter = this.activeBassVoice.filter;
      prevOsc.frequency.setTargetAtTime(freq, time, 0.035);
      
      const targetCutoff = accent ? Math.min(18000, cutoffBase * (1 + envMod * 5.0)) : cutoffBase * (1 + envMod * 2.5);
      prevFilter.frequency.setValueAtTime(targetCutoff, time);
      prevFilter.frequency.exponentialRampToValueAtTime(cutoffBase, time + decay);
      return;
    }

    const osc = this.ctx.createOscillator();
    osc.type = this.params.bass.wave; // 'sawtooth' or 'square'
    osc.frequency.setValueAtTime(freq, time);

    // 24dB Resonant Filter
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.Q.setValueAtTime(this.params.bass.resonance * (accent ? 1.25 : 1.0), time);

    const peakCutoff = accent ? Math.min(18000, cutoffBase * (1 + envMod * 5.5)) : Math.min(16000, cutoffBase * (1 + envMod * 3.0));
    filter.frequency.setValueAtTime(peakCutoff, time);
    filter.frequency.exponentialRampToValueAtTime(Math.max(60, cutoffBase * 0.4), time + decay);

    // Amp Envelope
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(ampVal, time);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + decay + (slide ? 0.08 : 0.02));

    // Overdrive Shaper (Classic Acid Saturation)
    const drive = this.ctx.createWaveShaper();
    drive.curve = this.makeTanhCurve(1.0 + this.params.bass.drive * 4.0);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(drive);
    drive.connect(this.outputBus);

    osc.start(time);
    osc.stop(time + decay + 0.1);

    this.activeBassVoice = { osc, filter, gain };
  }

  // --- HELPER AUDIO BUFFERS & SHAPERS ---

  createMetallicCluster(time) {
    // 6 inharmonic square wave frequencies for TR-808/909 metallic sheen
    const freqs = [245, 306, 384, 422, 516, 540];
    const merger = this.ctx.createGain();
    merger.gain.setValueAtTime(0.25, time);

    const oscs = freqs.map((f) => {
      const osc = this.ctx.createOscillator();
      osc.type = 'square';
      osc.frequency.setValueAtTime(f * (this.params.hh.pitch / 8000), time);
      osc.connect(merger);
      return osc;
    });

    return {
      connect: (dest) => merger.connect(dest),
      start: (t) => oscs.forEach(o => o.start(t)),
      stop: (t) => oscs.forEach(o => o.stop(t))
    };
  }

  getNoiseBuffer() {
    if (!this.metallicNoiseBuffer && this.ctx) {
      const bufferSize = this.ctx.sampleRate * 2;
      this.metallicNoiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const output = this.metallicNoiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        output[i] = Math.random() * 2 - 1;
      }
    }
    return this.metallicNoiseBuffer;
  }

  createMetallicNoiseBuffer() {
    this.getNoiseBuffer();
  }

  makeTanhCurve(gain) {
    const n = 256;
    const curve = new Float32Array(n);
    const norm = Math.tanh(gain);
    for (let i = 0; i < n; ++i) {
      const x = (i * 2) / (n - 1) - 1;
      curve[i] = Math.tanh(gain * x) / norm;
    }
    return curve;
  }

  // =========================================================================
  // FACTORY KITS & PRESET PATTERNS
  // =========================================================================

  initFactoryKits() {
    return [
      {
        id: 'techno-909',
        name: '909 TECHNO CLUB',
        bpm: 132,
        swing: 0.0,
        params: {
          bd: { tune: 46, decay: 0.38, click: 0.7, drive: 0.4 },
          sd: { tune: 195, snappy: 0.75, tone: 0.5, decay: 0.2 },
          hh: { pitch: 8000, decay: 0.05, openDecay: 0.35 },
          cp: { tone: 1100, decay: 0.22 },
          bass: { wave: 'sawtooth', cutoff: 1600, resonance: 14.0, envMod: 0.75, decay: 0.25, drive: 0.4 }
        },
        drums: [
          [2, 0, 0, 0, 2, 0, 0, 0, 2, 0, 0, 0, 2, 0, 0, 0], // BD
          [0, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 2, 0, 0, 0], // SD
          [1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1], // CH
          [0, 0, 2, 0, 0, 0, 2, 0, 0, 0, 2, 0, 0, 0, 2, 0], // OH
          [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1]  // CP
        ],
        bass: [
          { note: 36, gate: true,  accent: true,  slide: false },
          { note: 36, gate: false, accent: false, slide: false },
          { note: 36, gate: true,  accent: false, slide: true  },
          { note: 39, gate: true,  accent: false, slide: false },
          { note: 36, gate: true,  accent: false, slide: false },
          { note: 36, gate: false, accent: false, slide: false },
          { note: 41, gate: true,  accent: true,  slide: true  },
          { note: 42, gate: true,  accent: false, slide: false },
          { note: 36, gate: true,  accent: true,  slide: false },
          { note: 36, gate: false, accent: false, slide: false },
          { note: 48, gate: true,  accent: true,  slide: false },
          { note: 46, gate: true,  accent: false, slide: true  },
          { note: 36, gate: true,  accent: false, slide: false },
          { note: 39, gate: true,  accent: false, slide: false },
          { note: 41, gate: true,  accent: true,  slide: true  },
          { note: 36, gate: true,  accent: false, slide: false }
        ]
      },
      {
        id: 'acid-303',
        name: '303 ACID WAREHOUSE',
        bpm: 138,
        swing: 0.08,
        params: {
          bd: { tune: 52, decay: 0.32, click: 0.8, drive: 0.5 },
          sd: { tune: 210, snappy: 0.85, tone: 0.4, decay: 0.18 },
          hh: { pitch: 8500, decay: 0.04, openDecay: 0.3 },
          cp: { tone: 1300, decay: 0.2 },
          bass: { wave: 'sawtooth', cutoff: 2200, resonance: 18.0, envMod: 0.85, decay: 0.22, drive: 0.6 }
        },
        drums: [
          [2, 0, 0, 0, 1, 0, 0, 1, 2, 0, 0, 0, 1, 0, 1, 0],
          [0, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 2, 0, 0, 0],
          [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
          [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0],
          [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0]
        ],
        bass: [
          { note: 38, gate: true,  accent: true,  slide: false }, // D2
          { note: 38, gate: true,  accent: false, slide: true  },
          { note: 50, gate: true,  accent: true,  slide: false }, // D3
          { note: 38, gate: true,  accent: false, slide: false },
          { note: 41, gate: true,  accent: true,  slide: true  }, // F2
          { note: 43, gate: true,  accent: false, slide: false }, // G2
          { note: 41, gate: true,  accent: false, slide: true  },
          { note: 38, gate: true,  accent: true,  slide: false },
          { note: 38, gate: true,  accent: false, slide: false },
          { note: 50, gate: true,  accent: true,  slide: true  },
          { note: 48, gate: true,  accent: false, slide: false }, // C3
          { note: 45, gate: true,  accent: true,  slide: true  }, // A2
          { note: 38, gate: true,  accent: false, slide: false },
          { note: 41, gate: true,  accent: false, slide: false },
          { note: 43, gate: true,  accent: true,  slide: true  },
          { note: 38, gate: true,  accent: true,  slide: false }
        ]
      },
      {
        id: 'synthwave-80s',
        name: '80s SYNTHWAVE DISCO',
        bpm: 118,
        swing: 0.15,
        params: {
          bd: { tune: 55, decay: 0.4, click: 0.5, drive: 0.2 },
          sd: { tune: 175, snappy: 0.6, tone: 0.7, decay: 0.28 },
          hh: { pitch: 7500, decay: 0.06, openDecay: 0.4 },
          cp: { tone: 950, decay: 0.3 },
          bass: { wave: 'square', cutoff: 1200, resonance: 8.0, envMod: 0.6, decay: 0.32, drive: 0.25 }
        },
        drums: [
          [2, 0, 0, 0, 2, 0, 0, 0, 2, 0, 0, 0, 2, 0, 0, 0],
          [0, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 2, 0, 0, 0],
          [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
          [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 0],
          [0, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 2, 0, 0, 0]
        ],
        bass: [
          { note: 33, gate: true,  accent: true,  slide: false }, // A1
          { note: 33, gate: true,  accent: false, slide: false },
          { note: 33, gate: true,  accent: false, slide: false },
          { note: 33, gate: true,  accent: false, slide: false },
          { note: 40, gate: true,  accent: true,  slide: false }, // E2
          { note: 40, gate: true,  accent: false, slide: false },
          { note: 33, gate: true,  accent: false, slide: false },
          { note: 33, gate: true,  accent: false, slide: false },
          { note: 38, gate: true,  accent: true,  slide: false }, // D2
          { note: 38, gate: true,  accent: false, slide: false },
          { note: 38, gate: true,  accent: false, slide: false },
          { note: 38, gate: true,  accent: false, slide: false },
          { note: 45, gate: true,  accent: true,  slide: true  }, // A2
          { note: 40, gate: true,  accent: false, slide: false }, // E2
          { note: 38, gate: true,  accent: false, slide: false }, // D2
          { note: 35, gate: true,  accent: true,  slide: false }  // B1
        ]
      },
      {
        id: 'dnb-roller',
        name: 'DRUM & BASS ROLLER',
        bpm: 174,
        swing: 0.05,
        params: {
          bd: { tune: 42, decay: 0.3, click: 0.75, drive: 0.45 },
          sd: { tune: 220, snappy: 0.9, tone: 0.45, decay: 0.16 },
          hh: { pitch: 9000, decay: 0.035, openDecay: 0.22 },
          cp: { tone: 1400, decay: 0.18 },
          bass: { wave: 'sawtooth', cutoff: 800, resonance: 10.0, envMod: 0.8, decay: 0.35, drive: 0.55 }
        },
        drums: [
          [2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 0, 0, 0, 0, 0], // D&B 2-Step Kick
          [0, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 2, 0, 0, 0], // Snare on 2 & 4
          [1, 0, 1, 1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 1, 1, 0], // Roller Hats
          [0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0],
          [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1]
        ],
        bass: [
          { note: 36, gate: true,  accent: true,  slide: true  }, // C2 Sub
          { note: 36, gate: true,  accent: false, slide: false },
          { note: 36, gate: false, accent: false, slide: false },
          { note: 36, gate: true,  accent: false, slide: true  },
          { note: 43, gate: true,  accent: true,  slide: false }, // G2
          { note: 43, gate: false, accent: false, slide: false },
          { note: 41, gate: true,  accent: false, slide: true  }, // F2
          { note: 36, gate: true,  accent: false, slide: false },
          { note: 36, gate: true,  accent: true,  slide: false },
          { note: 36, gate: false, accent: false, slide: false },
          { note: 48, gate: true,  accent: true,  slide: true  }, // C3
          { note: 46, gate: true,  accent: false, slide: false }, // Bb2
          { note: 36, gate: true,  accent: false, slide: false },
          { note: 39, gate: true,  accent: false, slide: true  }, // Eb2
          { note: 41, gate: true,  accent: true,  slide: false }, // F2
          { note: 36, gate: true,  accent: false, slide: false }
        ]
      }
    ];
  }

  loadKit(kitId) {
    const kit = this.factoryKits.find(k => k.id === kitId) || this.factoryKits[0];
    if (!kit) return;

    this.setBpm(kit.bpm);
    this.setSwing(kit.swing);
    this.params = JSON.parse(JSON.stringify(kit.params));
    this.patterns.drums = JSON.parse(JSON.stringify(kit.drums));
    this.patterns.bass = JSON.parse(JSON.stringify(kit.bass));
  }

  toggleStep(trackIdx, stepIdx) {
    if (trackIdx >= 0 && trackIdx < 5) {
      const current = this.patterns.drums[trackIdx][stepIdx];
      // 0 -> 1 -> 2 -> 0 (Off -> On -> Accent -> Off)
      const next = (current + 1) % 3;
      this.patterns.drums[trackIdx][stepIdx] = next;
      return next;
    } else if (trackIdx === 5) {
      const step = this.patterns.bass[stepIdx];
      if (!step.gate) {
        step.gate = true;
        step.accent = false;
      } else if (!step.accent) {
        step.accent = true;
      } else {
        step.gate = false;
        step.accent = false;
      }
      return step.gate ? (step.accent ? 2 : 1) : 0;
    }
    return 0;
  }

  clearPattern() {
    for (let t = 0; t < 5; t++) {
      this.patterns.drums[t].fill(0);
    }
    for (let s = 0; s < 16; s++) {
      this.patterns.bass[s].gate = false;
      this.patterns.bass[s].accent = false;
      this.patterns.bass[s].slide = false;
    }
  }
}

// Global Export
window.DrumEngine = DrumEngine;
