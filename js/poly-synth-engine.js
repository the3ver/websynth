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
 * A voice with a modulation matrix exposes it as voice.modMatrix (SynthBlocks.ModMatrix over
 * engine.modSlots()); setModSlot() pushes slot changes to every voice and to fxModMatrix, the
 * synth's single matrix over the FX rack. Each matrix routes only the targets it knows.
 * Arpeggiator, drum machine, UI and PWA manager talk only to this interface.
 */

// Modulation matrix slots (preset paths modMatrix.slot1 .. modMatrix.slot8)
const MOD_MATRIX_SLOTS = SynthBlocks.ModMatrix.SLOTS;

// Rescans of the MIDI input list after access (ms), for inputs that appear without statechange
const MIDI_RESCAN_DELAYS = [500, 2000];

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
      crusher: {
        bits: 8,        // 1 to 16
        rate: 11000,    // hold rate, 500 to 48000 Hz
        mix: 0.0        // 0.0 to 1.0
      },
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

    // Modulation matrix: { slotN: { source, dest, amount } }, names per synth (voice.js), 'off' = unused
    this.modMatrix = {};
    for (const slot of MOD_MATRIX_SLOTS) this.modMatrix[slot] = { source: 'off', dest: 'off', amount: 0 };
    // Mod wheel as a signal (0..1) for matrix slots, built with the AudioContext
    this.modWheelSource = null;
    // Matrix over the shared FX rack (initRackModulation) and its last-note sources
    this.fxModMatrix = null;
    this.fxNoteModSources = null;

    // Callbacks for UI updates
    this.onVoiceChange = null;
    this.onMidiStateChange = null;
    // MIDI byte stream parser (running status survives packet borders)
    this.midiRunningStatus = 0;
    this.midiData = [0, 0];
    this.midiDataCount = 0;
    this.midiInputHandler = null;
    this.lastMidiEvent = null;
    this.onAudioStateChange = null;
    // Where MIDI note on/off go; the panel can point it elsewhere (e.g. the NoteRouter)
    this.midiNotes = {
      noteOn: (midiNote, velocity) => this.noteOn(midiNote, velocity),
      noteOff: (midiNote) => this.noteOff(midiNote)
    };
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
   * Initializes AudioContext, master bus, the instrument's shared sources, FX rack and voice pool.
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

      this.modWheelSource = this.ctx.createConstantSource();
      this.modWheelSource.offset.setValueAtTime(this.modWheelValue, this.ctx.currentTime);
      this.modWheelSource.start();

      this.initInstrument();

      // Stereo FX rack between the voice bus and the master bus (see fx-chain.js)
      this.fxChain = new FXChain(this.ctx, this.fx, this.masterVoiceBus, this.master.input);
      this.initRackModulation();

      // Persistent polyphonic pool (Zero GC on note events)
      this.initVoicePool(this.maxVoices);
    }

    if (this.ctx.state !== 'running') {
      this.resumeAudio();
    }

    return this.ctx.state;
  }

  initInstrument() {}

  /**
   * Optional: build fxModMatrix (SynthBlocks.ModMatrix over fxChain.modTargets) and
   * fxNoteModSources (SynthBlocks.NoteModSources, follow the last played note)
   */
  initRackModulation() {}

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
    // A synth whose voices load asynchronously (FM-4 worklet) has none yet
    if (this.voicePool.length === 0) return;

    const now = this.ctx ? this.ctx.currentTime : 0;
    const voice = this.pool.allocate(midiNote, now);
    if (!voice) return;

    this.lastFrequency = voice.trigger(midiNote, velocity, now);
    this.pool.assign(midiNote, voice);
    if (this.fxNoteModSources) this.fxNoteModSources.trigger(midiNote, velocity, now);

    if (this.onVoiceChange) {
      this.onVoiceChange(this.activeVoices.size, this.lastFrequency);
    }
  }

  noteOff(midiNote) {
    if (!this.ctx) return;
    const voice = this.pool.take(midiNote);
    if (!voice) return;

    voice.release(this.ctx.currentTime);
    if (this.fxNoteModSources && this.activeVoices.size === 0) this.fxNoteModSources.release(this.ctx.currentTime);

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
  /**
   * Loop switch of an envelope settings object (envelopes with a loop field, e.g. modEnv)
   */
  setEnvLoop(envName, on) {
    const env = this.params.getPath(this, envName);
    if (env && 'loop' in env) env.loop = !!on;
  }

  setEnvStage(envName, stage, val) {
    const env = this.params.getPath(this, envName);
    if (!env || !(stage in env)) return;
    const [min, max] = ENV_STAGE_RANGE[stage];
    env[stage] = Math.max(min, Math.min(max, parseFloat(val)));
  }

  setCrusherBits(val) {
    this.fx.crusher.bits = Math.max(1, Math.min(16, parseFloat(val)));
    if (this.fxChain) this.fxChain.crusher.applyBits();
  }

  setCrusherRate(val) {
    this.fx.crusher.rate = Math.max(500, Math.min(48000, parseFloat(val)));
    if (this.fxChain) this.fxChain.crusher.applyRate();
  }

  setCrusherMix(val) {
    this.fx.crusher.mix = Math.max(0, Math.min(1, parseFloat(val)));
    if (this.fxChain) this.fxChain.crusher.applyMix();
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
    if (this.modWheelSource) this.modWheelSource.offset.setTargetAtTime(this.modWheelValue, this.ctx.currentTime, 0.01);
    this.onModWheelChange();
  }

  // =========================================================================
  // MODULATION MATRIX
  // =========================================================================

  /**
   * Live slot objects in slot order (what a voice's ModMatrix reads)
   */
  modSlots() {
    return MOD_MATRIX_SLOTS.map((slot) => this.modMatrix[slot]);
  }

  /**
   * @param field 'source' | 'dest' (names, 'off' unplugs) or 'amount' (-1..1)
   */
  setModSlot(slot, field, value) {
    const index = MOD_MATRIX_SLOTS.indexOf(slot);
    if (index < 0 || !['source', 'dest', 'amount'].includes(field)) return;
    this.modMatrix[slot][field] = field === 'amount'
      ? Math.max(-1, Math.min(1, parseFloat(value) || 0))
      : String(value);
    this.forEachVoice((voice) => {
      if (voice.modMatrix) voice.modMatrix.applySlot(index);
    });
    if (this.fxModMatrix) this.fxModMatrix.applySlot(index);
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

  /**
   * Reports the MIDI state to the UI: { state: 'connected' | 'standby' | 'error' | 'unsupported', count }
   */
  reportMidiState(state, count = 0) {
    if (this.onMidiStateChange) this.onMidiStateChange({ state, count });
  }

  /**
   * Requests Web MIDI at page load, independent of the AudioContext. Some browsers (iOS Web MIDI
   * apps) add inputs late without a statechange, so the input list is scanned again after 500 ms and 2 s.
   */
  async initMidi() {
    if (!navigator.requestMIDIAccess) {
      this.reportMidiState('unsupported');
      return;
    }
    let midiAccess;
    try {
      midiAccess = await navigator.requestMIDIAccess({ sysex: false });
    } catch (err) {
      console.log('Web MIDI not available or permission denied:', err);
      this.reportMidiState('error');
      return;
    }
    midiAccess.onstatechange = () => this.connectMidiInputs(midiAccess);
    this.connectMidiInputs(midiAccess);
    for (const ms of MIDI_RESCAN_DELAYS) setTimeout(() => this.connectMidiInputs(midiAccess), ms);
  }

  /**
   * Listens to every input of midiAccess (once per input, listener and onmidimessage for shims)
   * and reports how many there are
   */
  connectMidiInputs(midiAccess) {
    if (!this.midiInputHandler) {
      this.midiInputHandler = (event) => {
        // A shim may deliver the same event to the listener and to onmidimessage
        if (event === this.lastMidiEvent) return;
        this.lastMidiEvent = event;
        this.handleMidiMessage(event);
      };
    }
    let count = 0;
    for (const input of midiAccess.inputs.values()) {
      count++;
      if (typeof input.addEventListener === 'function') input.addEventListener('midimessage', this.midiInputHandler);
      input.onmidimessage = this.midiInputHandler;
    }
    this.reportMidiState(count > 0 ? 'connected' : 'standby', count);
  }

  /**
   * Parses event.data (Uint8Array or plain Array) as a byte stream: several messages per packet,
   * running status across packets, realtime and system bytes skipped, all 16 channels
   */
  handleMidiMessage(event) {
    if (!this.isPowered) return;
    for (const byte of event.data) {
      if (byte >= 0xf8) continue; // realtime (clock, start, stop) may sit between data bytes
      if (byte >= 0xf0) {
        this.midiRunningStatus = 0; // sysex / system common: ignore its data bytes
      } else if (byte >= 0x80) {
        this.midiRunningStatus = byte;
        this.midiDataCount = 0;
      } else if (this.midiRunningStatus) {
        this.midiData[this.midiDataCount++] = byte;
        const command = this.midiRunningStatus >> 4;
        const length = (command === 0xc || command === 0xd) ? 1 : 2;
        if (this.midiDataCount === length) {
          this.midiDataCount = 0;
          this.dispatchMidi(this.midiRunningStatus, this.midiData[0], this.midiData[1]);
        }
      }
    }
  }

  /**
   * Acts on one channel message (status byte with any of the 16 channels)
   */
  dispatchMidi(status, note, velocity) {
    const command = status >> 4;

    if (command === 9 && velocity > 0) {
      // Starts audio as far as the browser allows; the arp path never calls noteOn itself
      this.ensureAudioRunning();
      this.midiNotes.noteOn(note, velocity / 127);
    } else if (command === 8 || (command === 9 && velocity === 0)) {
      this.midiNotes.noteOff(note);
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

  /**
   * @param defaults full patch state (INIT) for parameters the preset lacks
   */
  loadPresetState(state, defaults) {
    if (state) this.params.applyState(this, state, defaults);
  }
}

window.PolySynthEngine = PolySynthEngine;
