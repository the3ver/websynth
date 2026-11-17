/**
 * POLY SYNTH ENGINE (base class)
 * Everything a polyphonic synth on this page shares, independent of its sound architecture:
 * AudioContext start and iOS unlock, voice bus -> stereo FX rack -> master bus, the voice pool,
 * note on/off, octave, pitch bend, mod wheel, glide, power, Web MIDI, FX setters and presets.
 *
 * A subclass provides:
 *   initInstrument()   shared sources built once after the master bus (LFOs, curves, offsets)
 *   createVoice(id)    one pre-built voice: trigger(note, velocity, now) -> frequency, release(now),
 *                      choke(now), updateFrequencies(now), baseFreq, plus the VoicePool fields
 * and may override onOctaveChange() / onModWheelChange() / initVoicePool(count).
 * Arpeggiator, drum machine, UI and PWA manager talk only to this interface.
 */

// ADSR stage limits (attack/decay/release in seconds, sustain as level)
const ENV_STAGE_RANGE = {
  attack: [0.001, Infinity],
  decay: [0.001, Infinity],
  sustain: [0.0, 1.0],
  release: [0.005, Infinity]
};

class PolySynthEngine {
  /**
   * @param params the synth's SynthBlocks.ParamTable (presets, knobs, UI sync)
   */
  constructor({ params, maxVoices = 12 }) {
    this.params = params;
    this.ctx = null;
    this.master = null; // SynthBlocks.MasterBus: analyser -> volume -> limiter -> clipper
    this.masterVoiceBus = null;
    this.maxVoices = maxVoices;
    // Persistent voice pool (Zero GC Churn); voicePool / activeVoices are the pool's own array and map
    this.pool = new SynthBlocks.VoicePool();
    this.voicePool = this.pool.voices;
    this.activeVoices = this.pool.active; // midiNote -> Voice
    this.isPowered = true;
    this.masterVolume = 0.8;
    this.octaveShift = 0; // -2 to +2
    this.pitchBendFactor = 1.0; // 0.5 to 2.0
    this.modWheelValue = 0.0; // 0.0 to 1.0
    this.glideEnabled = false;
    this.glideTime = 0.06; // seconds
    this.lastFrequency = null;

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

  // =========================================================================
  // AUDIO CONTEXT LIFECYCLE
  // =========================================================================

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
   * Initializes AudioContext, master bus, the instrument's shared sources, FX rack, voice pool and MIDI.
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

      this.masterVoiceBus = this.ctx.createGain();

      // Analyser, volume, limiter and safety clipper (shared with the drum machine)
      this.master = new SynthBlocks.MasterBus(this.ctx, { volume: this.masterVolume });

      this.initInstrument();

      // Stereo FX rack between the voice bus and the master bus (see fx-chain.js)
      this.fxChain = new FXChain(this.ctx, this.fx, this.masterVoiceBus, this.master.input);

      // Persistent polyphonic pool (Zero GC on note events)
      this.initVoicePool(this.maxVoices);

      this.initMidi();
    }

    if (this.ctx.state !== 'running') {
      this.resumeAudio();
    }

    return this.ctx.state;
  }

  initInstrument() {}

  initVoicePool(count) {
    if (this.voicePool.length > 0) return;
    for (let i = 0; i < count; i++) {
      this.pool.add(this.createVoice(i));
    }
  }

  // =========================================================================
  // NOTES
  // =========================================================================

  /**
   * Calculate base note frequency with Global Octave Shift
   */
  midiNoteToFrequency(midiNote) {
    const shiftedNote = midiNote + (this.octaveShift * 12);
    return 440 * Math.pow(2, (shiftedNote - 69) / 12);
  }

  /**
   * Triggers Note On with Persistent Voice Pool (Zero Node Allocations / Zero GC)
   */
  noteOn(midiNote, velocity = 1.0) {
    if (!this.isPowered) return;
    this.ensureAudioRunning();

    const now = this.ctx ? this.ctx.currentTime : 0;
    const voice = this.pool.allocate(midiNote, now);
    if (!voice) return;

    this.lastFrequency = voice.trigger(midiNote, velocity, now);
    this.pool.assign(midiNote, voice);

    if (this.onVoiceChange) {
      this.onVoiceChange(this.activeVoices.size, this.lastFrequency);
    }
  }

  noteOff(midiNote) {
    if (!this.ctx) return;
    const voice = this.pool.take(midiNote);
    if (!voice) return;

    voice.release(this.ctx.currentTime);

    if (this.onVoiceChange) {
      this.onVoiceChange(this.activeVoices.size, this.activeVoices.size > 0 ? Array.from(this.activeVoices.values())[0].baseFreq : null);
    }
  }

  allNotesOff() {
    for (const midiNote of Array.from(this.activeVoices.keys())) {
      this.noteOff(midiNote);
    }
    // Safety net: also release busy voices that are not in the note map
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    for (const voice of this.voicePool) {
      if (voice.isBusy && voice.releaseStartTime === 0) voice.release(now);
    }
  }

  /**
   * Runs fn(voice, now) for every voice once the audio graph exists
   */
  forEachVoice(fn) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    for (const voice of this.voicePool) fn(voice, now);
  }

  updateAllVoiceFrequencies() {
    this.forEachVoice((voice, now) => voice.updateFrequencies(now));
  }

  // =========================================================================
  // ENVELOPES & FX
  // =========================================================================

  /**
   * Sets one ADSR stage of an envelope settings object on the engine, e.g. setEnvStage('ampEnv', 'attack', 0.2)
   */
  setEnvStage(envName, stage, val) {
    const env = this.params.getPath(this, envName);
    if (!env || !(stage in env)) return;
    const [min, max] = ENV_STAGE_RANGE[stage];
    env[stage] = Math.max(min, Math.min(max, parseFloat(val)));
  }

  setChorusMode(mode) {
    this.fx.chorus.mode = mode;
    if (this.fxChain) this.fxChain.chorus.applyMode();
  }

  setChorusMix(val) {
    this.fx.chorus.mix = Math.max(0, Math.min(1, parseFloat(val)));
    if (this.fxChain) this.fxChain.chorus.applyMix();
  }

  setDelayTime(val) {
    this.fx.delay.time = Math.max(0.02, Math.min(1.0, parseFloat(val)));
    if (this.fxChain) this.fxChain.delay.applyTime();
  }

  setDelayFeedback(val) {
    this.fx.delay.feedback = Math.max(0.0, Math.min(0.9, parseFloat(val)));
    if (this.fxChain) this.fxChain.delay.applyFeedback();
  }

  setDelayMix(val) {
    this.fx.delay.mix = Math.max(0, Math.min(1, parseFloat(val)));
    if (this.fxChain) this.fxChain.delay.applyMix();
  }

  setReverbDecay(val) {
    this.fx.reverb.decay = Math.max(0.5, Math.min(10.0, parseFloat(val)));
    if (this.fxChain) this.fxChain.reverb.applyDecay();
  }

  setReverbMix(val) {
    this.fx.reverb.mix = Math.max(0, Math.min(1, parseFloat(val)));
    if (this.fxChain) this.fxChain.reverb.applyMix();
  }

  // =========================================================================
  // PERFORMANCE & POWER
  // =========================================================================

  setMasterVolume(value) {
    this.masterVolume = Math.max(0, Math.min(1, value));
    if (this.master) this.master.setVolume(this.masterVolume);
  }

  setOctaveShift(shift) {
    this.octaveShift = Math.max(-2, Math.min(2, shift));
    this.updateAllVoiceFrequencies();
    this.onOctaveChange();
  }

  onOctaveChange() {}

  setPitchBend(factor) {
    this.pitchBendFactor = factor;
    this.updateAllVoiceFrequencies();
  }

  setModWheel(value) {
    this.modWheelValue = Math.max(0, Math.min(1, value));
    this.onModWheelChange();
  }

  onModWheelChange() {}

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
    return this.params.readState(this);
  }

  loadPresetState(state) {
    if (state) this.params.applyState(this, state);
  }
}

window.PolySynthEngine = PolySynthEngine;
