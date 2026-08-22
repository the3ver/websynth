/**
 * RETROVOX SUB-1 • SYNTHESIZER UI, PRESET MANAGER, 16-STEP ARPEGGIATOR & VISUALIZATION
 * Manages 3D Keyboard, Preset Management (10 Factory Classics + User Presets Storage),
 * 16-Step Arpeggiator & Step Sequencer Bar with running chase LEDs,
 * Analog Rotary Knobs (VCO, Mixer, 24dB VCF Filter, Dual-LFOs, Vintage Stereo FX),
 * Interactive Vertical Slider Faders (Dual ADSR Envelopes), Filter Mode Selectors,
 * Dual-LFO Tab Switcher & Waveform Selectors, Chorus Mode Selectors, Pitch/Mod Wheels,
 * Pulsing LFO LED, CRT Oscilloscope HUD, and Reactive Speaker Woofers.
 */

class SynthUI {
  constructor(audioEngine, arpEngine) {
    this.engine = audioEngine;
    this.arp = arpEngine || new window.ArpEngine(audioEngine);
    
    // UI Elements
    this.keyboardContainer = document.getElementById('keyboardContainer');
    this.scopeCanvas = document.getElementById('scopeCanvas');
    this.scopeCtx = this.scopeCanvas ? this.scopeCanvas.getContext('2d') : null;
    this.lfoRateLed = document.getElementById('lfoRateLed');
    
    this.pitchWheel = document.getElementById('pitchWheel');
    this.modWheel = document.getElementById('modWheel');
    this.wooferLeft = document.getElementById('wooferLeft');
    this.wooferRight = document.getElementById('wooferRight');
    
    this.vuMeterL = document.getElementById('vuMeterL');
    this.vuMeterR = document.getElementById('vuMeterR');
    this.ledsL = this.vuMeterL ? Array.from(this.vuMeterL.querySelectorAll('.led')) : [];
    this.ledsR = this.vuMeterR ? Array.from(this.vuMeterR.querySelectorAll('.led')) : [];
    this.lastActiveVuCount = -1;
    this.lastWooferScale = 1.0;
    this.activeVoiceInfo = document.getElementById('activeVoiceInfo');
    this.activeFreqInfo = document.getElementById('activeFreqInfo');
    
    this.octaveValueDisplay = document.getElementById('octaveValueDisplay');
    this.octaveDownBtn = document.getElementById('octaveDownBtn');
    this.octaveUpBtn = document.getElementById('octaveUpBtn');
    this.glideToggle = document.getElementById('glideToggle');

    // Preset Elements
    this.presetSelectDropdown = document.getElementById('presetSelectDropdown');
    this.presetCatTag = document.getElementById('presetCatTag');
    this.prevPresetBtn = document.getElementById('prevPresetBtn');
    this.nextPresetBtn = document.getElementById('nextPresetBtn');
    this.savePresetBtn = document.getElementById('savePresetBtn');
    this.initPatchBtn = document.getElementById('initPatchBtn');

    this.savePresetModal = document.getElementById('savePresetModal');
    this.closeSaveModalBtn = document.getElementById('closeSaveModalBtn');
    this.cancelSavePresetBtn = document.getElementById('cancelSavePresetBtn');
    this.confirmSavePresetBtn = document.getElementById('confirmSavePresetBtn');
    this.userPresetNameInput = document.getElementById('userPresetNameInput');
    this.userPresetCategorySelect = document.getElementById('userPresetCategorySelect');

    // Arpeggiator & Sequencer Elements
    this.arpPowerBtn = document.getElementById('arpPowerBtn');
    this.arpLatchBtn = document.getElementById('arpLatchBtn');
    this.arpModeSelect = document.getElementById('arpModeSelect');
    this.arpOctaveSelect = document.getElementById('arpOctaveSelect');
    this.arpDivisionSelect = document.getElementById('arpDivisionSelect');
    this.arpStepGrid = document.getElementById('arpStepGrid');
    this.arpStepButtons = [];

    // Envelope Target State ('amp' or 'filter')
    this.currentEnvTarget = 'amp';
    this.faderUpdaters = new Map();

    // LFO Target State (1 or 2)
    this.currentLfoTarget = 1;
    this.lfoKnobUpdaters = new Map();
    this.allKnobUpdaters = new Map();

    // Preset State
    this.presetsList = [];
    this.currentPresetIndex = 0;

    // State
    this.isMouseDown = false;
    this.mouseHeldKeys = new Set();
    this.keyboardHeldKeys = new Set();
    this.activeKeyElements = new Map();
    
    // PC Keyboard to MIDI note map (Base: C3 = 48)
    this.keyMap = {
      'KeyA': 48, 'KeyW': 49, 'KeyS': 50, 'KeyE': 51, 'KeyD': 52, 'KeyF': 53,
      'KeyT': 54, 'KeyG': 55, 'KeyZ': 56, 'KeyY': 56, 'KeyH': 57, 'KeyU': 58, 'KeyJ': 59,
      'KeyK': 60, 'KeyO': 61, 'KeyL': 62, 'KeyP': 63, 'Semicolon': 64, 'Quote': 65, 'BracketLeft': 66
    };

    this.initKeyboard();
    this.initKnobs();
    this.initFaders();
    this.initModuleControls();
    this.initPerformanceControls();
    this.initKeyboardHotkeys();
    this.initPresets();
    this.initArpeggiatorControls();
    this.startVisualizer();
  }

  /**
   * Generates the 25-Key Keybed (C3 = 48 to C5 = 72)
   */
  initKeyboard() {
    this.keyboardContainer.innerHTML = '';
    const startMidi = 48; // C3
    const numKeys = 25;   // 2 Octaves + 1 Key
    
    const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const keyShortcuts = {
      48: 'A', 49: 'W', 50: 'S', 51: 'E', 52: 'D', 53: 'F',
      54: 'T', 55: 'G', 56: 'Y', 57: 'H', 58: 'U', 59: 'J',
      60: 'K', 61: 'O', 62: 'L', 63: 'P', 64: 'Ö', 65: 'Ä',
      72: 'C5'
    };

    let whiteKeyIndex = 0;

    for (let i = 0; i < numKeys; i++) {
      const midiNote = startMidi + i;
      const noteInOctave = midiNote % 12;
      const octaveNum = Math.floor(midiNote / 12) - 1;
      const isBlack = [1, 3, 6, 8, 10].includes(noteInOctave);
      const noteName = `${noteNames[noteInOctave]}${octaveNum}`;
      const shortcut = keyShortcuts[midiNote] || '';

      const keyEl = document.createElement('div');
      keyEl.dataset.note = midiNote;

      if (!isBlack) {
        keyEl.className = 'key-white';
        keyEl.innerHTML = `
          <span class="key-note-label">${noteName}</span>
          ${shortcut ? `<span class="key-shortcut">${shortcut}</span>` : ''}
        `;
        this.keyboardContainer.appendChild(keyEl);
        this.activeKeyElements.set(midiNote, keyEl);
        whiteKeyIndex++;
      } else {
        keyEl.className = 'key-black';
        keyEl.innerHTML = `
          <span class="key-note-label">${noteName}</span>
          ${shortcut ? `<span class="key-shortcut">${shortcut}</span>` : ''}
        `;

        const whiteKeyWidth = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--white-key-width')) || 42;
        const blackKeyWidth = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--black-key-width')) || 26;
        const leftOffset = (whiteKeyIndex * whiteKeyWidth) - (blackKeyWidth / 2);
        keyEl.style.left = `${leftOffset}px`;
        
        this.keyboardContainer.appendChild(keyEl);
        this.activeKeyElements.set(midiNote, keyEl);
      }

      this.attachKeyEvents(keyEl, midiNote);
    }

    // Global mouseup only releases keys triggered via on-screen mouse interaction
    window.addEventListener('mouseup', () => {
      this.isMouseDown = false;
      this.releaseAllMouseNotes();
    });

    this.keyboardContainer.addEventListener('dragstart', (e) => e.preventDefault());
  }

  attachKeyEvents(keyEl, midiNote) {
    const triggerNote = () => {
      if (!this.mouseHeldKeys.has(midiNote)) {
        this.mouseHeldKeys.add(midiNote);
        keyEl.classList.add('active');
        if (!this.keyboardHeldKeys.has(midiNote)) {
          if (this.arp && this.arp.enabled) {
            this.arp.handleKeyDown(midiNote);
          } else {
            this.engine.noteOn(midiNote);
          }
        }
      }
    };

    const releaseNote = () => {
      if (this.mouseHeldKeys.has(midiNote)) {
        this.mouseHeldKeys.delete(midiNote);
        if (!this.keyboardHeldKeys.has(midiNote)) {
          keyEl.classList.remove('active');
          if (this.arp && this.arp.enabled) {
            this.arp.handleKeyUp(midiNote);
          } else {
            this.engine.noteOff(midiNote);
          }
        }
      }
    };

    keyEl.addEventListener('mousedown', (e) => {
      e.preventDefault();
      this.isMouseDown = true;
      triggerNote();
    });

    keyEl.addEventListener('mouseenter', () => {
      if (this.isMouseDown) triggerNote();
    });

    keyEl.addEventListener('mouseleave', () => {
      if (this.isMouseDown) releaseNote();
    });

    keyEl.addEventListener('mouseup', (e) => {
      e.preventDefault();
      releaseNote();
    });

    keyEl.addEventListener('touchstart', (e) => {
      e.preventDefault();
      triggerNote();
    }, { passive: false });

    keyEl.addEventListener('touchend', (e) => {
      e.preventDefault();
      releaseNote();
    });
  }

  releaseAllMouseNotes() {
    for (const note of Array.from(this.mouseHeldKeys)) {
      this.mouseHeldKeys.delete(note);
      if (!this.keyboardHeldKeys.has(note)) {
        const keyEl = this.activeKeyElements.get(note);
        if (keyEl) keyEl.classList.remove('active');
        if (this.arp && this.arp.enabled) {
          this.arp.handleKeyUp(note);
        } else {
          this.engine.noteOff(note);
        }
      }
    }
  }

  // =========================================================================
  // ANALOG ROTARY KNOB CONTROLLER (With Logarithmic Scaling for Filter & FX)
  // =========================================================================

  initKnobs() {
    const knobHousings = document.querySelectorAll('.synth-knob-housing');

    knobHousings.forEach((housing) => {
      const param = housing.dataset.param;
      const min = parseFloat(housing.dataset.min);
      const max = parseFloat(housing.dataset.max);
      const step = parseFloat(housing.dataset.step) || 0.01;
      const defaultVal = parseFloat(housing.dataset.default);
      const type = housing.dataset.type || 'percent';

      const dial = housing.querySelector('.synth-knob-dial');
      const readout = document.getElementById(`${param}-readout`);

      let currentValue = defaultVal;

      const formatReadout = (val) => {
        if (type === 'octave') {
          const octMap = { '-2': "32'", '-1': "16'", '0': "8'", '1': "4'", '2': "2'" };
          return octMap[String(Math.round(val))] || `${val}`;
        } else if (type === 'percent') {
          return `${Math.round(val * 100)}%`;
        } else if (type === 'bipolar-percent') {
          return `${val > 0 ? '+' : ''}${Math.round(val * 100)}%`;
        } else if (type === 'cents') {
          return `${val > 0 ? '+' : ''}${Math.round(val)} CT`;
        } else if (type === 'semitone') {
          return `${val > 0 ? '+' : ''}${Math.round(val)} ST`;
        } else if (type === 'hz') {
          return val >= 1000 ? `${(val / 1000).toFixed(1)} kHz` : (val < 10 ? `${val.toFixed(1)} Hz` : `${Math.round(val)} Hz`);
        } else if (type === 'res') {
          return `${val.toFixed(1)} Q`;
        } else if (type === 'time') {
          return val < 1.0 ? `${Math.round(val * 1000)} ms` : `${val.toFixed(2)} s`;
        } else if (type === 'bpm') {
          return `${Math.round(val)}`;
        }
        return `${val}`;
      };

      const valToRatio = (val) => {
        if (type === 'hz' && min > 1) {
          return Math.log(val / min) / Math.log(max / min);
        }
        return (val - min) / (max - min);
      };

      const ratioToVal = (ratio) => {
        if (type === 'hz' && min > 1) {
          return min * Math.pow(max / min, ratio);
        }
        return min + (ratio * (max - min));
      };

      const updateKnobVisual = (val) => {
        const ratio = Math.max(0, Math.min(1, valToRatio(val)));
        const deg = -135 + (ratio * 270);
        dial.style.transform = `rotate(${deg}deg)`;
        if (readout) {
          readout.textContent = formatReadout(val);
        }
      };

      const dispatchValue = (val) => {
        switch (param) {
          case 'vco1-octave': this.engine.setVCO1Octave(val); break;
          case 'vco1-pw': this.engine.setVCO1PW(val); break;
          case 'vco2-octave': this.engine.setVCO2Octave(val); break;
          case 'vco2-semitone': this.engine.setVCO2Semitone(val); break;
          case 'vco2-detune': this.engine.setVCO2Detune(val); break;
          
          case 'mixer-vco1': this.engine.setMixerVCO1(val); break;
          case 'mixer-vco2': this.engine.setMixerVCO2(val); break;
          case 'mixer-sub': this.engine.setMixerSub(val); break;
          case 'mixer-noise': this.engine.setMixerNoise(val); break;

          case 'vcf-cutoff': this.engine.setVCFCutoff(val); break;
          case 'vcf-resonance': this.engine.setVCFResonance(val); break;
          case 'vcf-drive': this.engine.setVCFDrive(val); break;
          case 'vcf-keytrack': this.engine.setVCFKeyTrack(val); break;
          case 'vcf-envmod': this.engine.setVCFEnvMod(val); break;

          case 'lfo-rate': this.engine.setLFOParam(this.currentLfoTarget, 'rate', val); break;
          case 'lfo-fade': this.engine.setLFOParam(this.currentLfoTarget, 'fadeIn', val); break;
          case 'lfo-pitch': this.engine.setLFOParam(this.currentLfoTarget, 'pitch', val); break;
          case 'lfo-vcf': this.engine.setLFOParam(this.currentLfoTarget, 'vcf', val); break;
          case 'lfo-pwm': this.engine.setLFOParam(this.currentLfoTarget, 'pwm', val); break;
          case 'lfo-amp': this.engine.setLFOParam(this.currentLfoTarget, 'amp', val); break;

          case 'fx-chorus-mix': this.engine.setChorusMix(val); break;
          case 'fx-delay-time': this.engine.setDelayTime(val); break;
          case 'fx-delay-feedback': this.engine.setDelayFeedback(val); break;
          case 'fx-delay-mix': this.engine.setDelayMix(val); break;
          case 'fx-reverb-decay': this.engine.setReverbDecay(val); break;
          case 'fx-reverb-mix': this.engine.setReverbMix(val); break;

          // Arpeggiator Knobs
          case 'arp-bpm': this.arp.setBpm(val); break;
          case 'arp-gate': this.arp.setGate(val); break;
          case 'arp-swing': this.arp.setSwing(val); break;
        }
      };

      this.allKnobUpdaters.set(param, (val) => {
        currentValue = val;
        updateKnobVisual(currentValue);
      });

      if (param.startsWith('lfo-')) {
        const lfoKey = param.replace('lfo-', '');
        this.lfoKnobUpdaters.set(param, () => {
          const lfoObj = this.currentLfoTarget === 2 ? this.engine.lfo2 : this.engine.lfo1;
          let val = 0;
          if (lfoKey === 'rate') val = lfoObj.rate;
          else if (lfoKey === 'fade') val = lfoObj.fadeIn;
          else if (lfoObj.destinations[lfoKey] !== undefined) val = lfoObj.destinations[lfoKey];

          currentValue = val;
          updateKnobVisual(currentValue);
        });
      }

      updateKnobVisual(currentValue);

      // Drag Interaction
      let isDragging = false;
      let startY = 0;
      let startRatio = valToRatio(currentValue);

      const handlePointerDown = (clientY) => {
        isDragging = true;
        startY = clientY;
        startRatio = valToRatio(currentValue);
        document.body.style.cursor = 'ns-resize';
      };

      const handlePointerMove = (clientY, shiftKey) => {
        if (!isDragging) return;
        const deltaY = startY - clientY;
        const sensitivity = shiftKey ? 450 : 130;
        const deltaRatio = deltaY / sensitivity;

        let newRatio = Math.max(0, Math.min(1, startRatio + deltaRatio));
        let newValue = ratioToVal(newRatio);

        if (type === 'hz' && min > 1) {
          newValue = newValue < 1000 ? Math.round(newValue) : Math.round(newValue / 10) * 10;
        } else if (type === 'hz' && min < 1) {
          newValue = Math.round(newValue * 20) / 20;
        } else if (type === 'bpm' || step >= 1) {
          newValue = Math.round(newValue / step) * step;
        } else if (type === 'res') {
          newValue = Math.round(newValue * 10) / 10;
        } else {
          newValue = Math.round(newValue * 100) / 100;
        }

        if (newValue !== currentValue) {
          currentValue = newValue;
          updateKnobVisual(currentValue);
          dispatchValue(currentValue);
        }
      };

      const handlePointerUp = () => {
        if (!isDragging) return;
        isDragging = false;
        document.body.style.cursor = '';
      };

      housing.addEventListener('mousedown', (e) => {
        e.preventDefault();
        handlePointerDown(e.clientY);
      });

      window.addEventListener('mousemove', (e) => handlePointerMove(e.clientY, e.shiftKey));
      window.addEventListener('mouseup', handlePointerUp);

      housing.addEventListener('touchstart', (e) => {
        e.preventDefault();
        handlePointerDown(e.touches[0].clientY);
      }, { passive: false });

      window.addEventListener('touchmove', (e) => {
        if (isDragging) handlePointerMove(e.touches[0].clientY, false);
      });
      window.addEventListener('touchend', handlePointerUp);

      housing.addEventListener('dblclick', () => {
        currentValue = defaultVal;
        updateKnobVisual(currentValue);
        dispatchValue(currentValue);
      });

      housing.addEventListener('wheel', (e) => {
        e.preventDefault();
        const dir = e.deltaY < 0 ? 1 : -1;
        let r = valToRatio(currentValue) + (0.04 * dir);
        r = Math.max(0, Math.min(1, r));
        currentValue = ratioToVal(r);
        if (type === 'hz' && min > 1) {
          currentValue = currentValue < 1000 ? Math.round(currentValue) : Math.round(currentValue / 10) * 10;
        } else if (step >= 1) {
          currentValue = Math.round(currentValue);
        }
        updateKnobVisual(currentValue);
        dispatchValue(currentValue);
      }, { passive: false });
    });
  }

  // =========================================================================
  // INTERACTIVE VERTICAL SLIDER FADERS (ADSR ENVELOPES)
  // =========================================================================

  initFaders() {
    const faderHousings = document.querySelectorAll('.synth-fader-track-housing');
    const adsrModuleBay = document.getElementById('adsrModuleBay');

    faderHousings.forEach((housing) => {
      const faderParam = housing.dataset.fader;
      const min = parseFloat(housing.dataset.min);
      const max = parseFloat(housing.dataset.max);
      const type = housing.dataset.type;

      const thumb = document.getElementById(`fader-thumb-${faderParam}`);
      const readout = document.getElementById(`fader-readout-${faderParam}`);

      const formatReadout = (val) => {
        if (type === 'time') {
          return val < 1.0 ? `${Math.round(val * 1000)} ms` : `${val.toFixed(2)} s`;
        } else if (type === 'percent') {
          return `${Math.round(val * 100)}%`;
        }
        return `${val}`;
      };

      const valToRatio = (val) => {
        if (type === 'time') {
          return Math.log(val / min) / Math.log(max / min);
        }
        return (val - min) / (max - min);
      };

      const ratioToVal = (ratio) => {
        if (type === 'time') {
          return min * Math.pow(max / min, ratio);
        }
        return min + (ratio * (max - min));
      };

      const updateFaderVisual = (val) => {
        const ratio = Math.max(0, Math.min(1, valToRatio(val)));
        const bottomPercent = ratio * 84;
        thumb.style.bottom = `${bottomPercent}%`;
        if (readout) {
          readout.textContent = formatReadout(val);
        }
      };

      const dispatchValue = (val) => {
        if (this.currentEnvTarget === 'amp') {
          switch (faderParam) {
            case 'attack': this.engine.setAmpEnvAttack(val); break;
            case 'decay': this.engine.setAmpEnvDecay(val); break;
            case 'sustain': this.engine.setAmpEnvSustain(val); break;
            case 'release': this.engine.setAmpEnvRelease(val); break;
          }
        } else if (this.currentEnvTarget === 'filter') {
          switch (faderParam) {
            case 'attack': this.engine.setFilterEnvAttack(val); break;
            case 'decay': this.engine.setFilterEnvDecay(val); break;
            case 'sustain': this.engine.setFilterEnvSustain(val); break;
            case 'release': this.engine.setFilterEnvRelease(val); break;
          }
        }
      };

      this.faderUpdaters.set(faderParam, () => {
        const env = this.currentEnvTarget === 'amp' ? this.engine.ampEnv : this.engine.filterEnv;
        const currentVal = env[faderParam];
        updateFaderVisual(currentVal);
      });

      const initialVal = (this.currentEnvTarget === 'amp' ? this.engine.ampEnv : this.engine.filterEnv)[faderParam];
      updateFaderVisual(initialVal);

      let isDragging = false;
      let startY = 0;
      let startRatio = valToRatio(initialVal);

      const handlePointerDown = (clientY) => {
        isDragging = true;
        startY = clientY;
        const currentVal = (this.currentEnvTarget === 'amp' ? this.engine.ampEnv : this.engine.filterEnv)[faderParam];
        startRatio = valToRatio(currentVal);
        document.body.style.cursor = 'ns-resize';
      };

      const handlePointerMove = (clientY, shiftKey) => {
        if (!isDragging) return;
        const deltaY = startY - clientY;
        const sensitivity = shiftKey ? 300 : 70;
        const deltaRatio = deltaY / sensitivity;

        let newRatio = Math.max(0, Math.min(1, startRatio + deltaRatio));
        let newValue = ratioToVal(newRatio);

        if (type === 'time') {
          newValue = newValue < 1.0 ? Math.round(newValue * 1000) / 1000 : Math.round(newValue * 100) / 100;
        } else {
          newValue = Math.round(newValue * 100) / 100;
        }

        updateFaderVisual(newValue);
        dispatchValue(newValue);
      };

      const handlePointerUp = () => {
        if (!isDragging) return;
        isDragging = false;
        document.body.style.cursor = '';
      };

      housing.addEventListener('mousedown', (e) => {
        e.preventDefault();
        handlePointerDown(e.clientY);
      });

      window.addEventListener('mousemove', (e) => handlePointerMove(e.clientY, e.shiftKey));
      window.addEventListener('mouseup', handlePointerUp);

      housing.addEventListener('touchstart', (e) => {
        e.preventDefault();
        handlePointerDown(e.touches[0].clientY);
      }, { passive: false });

      window.addEventListener('touchmove', (e) => {
        if (isDragging) handlePointerMove(e.touches[0].clientY, false);
      });
      window.addEventListener('touchend', handlePointerUp);
    });

    const envTabGroup = document.getElementById('envTabGroup');
    if (envTabGroup) {
      const tabButtons = envTabGroup.querySelectorAll('.env-tab-btn');
      tabButtons.forEach((btn) => {
        btn.addEventListener('click', () => {
          tabButtons.forEach((b) => b.classList.remove('active'));
          btn.classList.add('active');
          this.currentEnvTarget = btn.dataset.target;

          if (this.currentEnvTarget === 'filter') {
            adsrModuleBay.classList.add('env-vcf-mode');
          } else {
            adsrModuleBay.classList.remove('env-vcf-mode');
          }

          this.faderUpdaters.forEach((updateFn) => updateFn());
        });
      });
    }
  }

  // =========================================================================
  // MODULE BUTTONS & SWITCHES (VCO, MIXER, VCF, DUAL-LFO, CHORUS)
  // =========================================================================

  initModuleControls() {
    const waveBtnRows = document.querySelectorAll('.wave-btn-row');
    waveBtnRows.forEach((row) => {
      const vcoNum = row.dataset.vco;
      const buttons = row.querySelectorAll('.wave-btn');

      buttons.forEach((btn) => {
        btn.addEventListener('click', () => {
          buttons.forEach((b) => b.classList.remove('active'));
          btn.classList.add('active');
          const wave = btn.dataset.wave;
          if (vcoNum === '1') {
            this.engine.setVCO1Wave(wave);
          } else if (vcoNum === '2') {
            this.engine.setVCO2Wave(wave);
          }
        });
      });
    });

    const vco2SyncBtn = document.getElementById('vco2SyncBtn');
    if (vco2SyncBtn) {
      let isSynced = false;
      vco2SyncBtn.addEventListener('click', () => {
        isSynced = !isSynced;
        vco2SyncBtn.classList.toggle('active', isSynced);
        this.engine.setVCO2Sync(isSynced);
      });
    }

    const subOctSelector = document.getElementById('subOctSelector');
    if (subOctSelector) {
      const subButtons = subOctSelector.querySelectorAll('.sub-oct-btn');
      subButtons.forEach((btn) => {
        btn.addEventListener('click', () => {
          subButtons.forEach((b) => b.classList.remove('active'));
          btn.classList.add('active');
          const oct = parseInt(btn.dataset.suboct, 10);
          this.engine.setMixerSubOctave(oct);
        });
      });
    }

    const filterModeRow = document.getElementById('filterModeRow');
    if (filterModeRow) {
      const modeButtons = filterModeRow.querySelectorAll('.filter-mode-btn');
      modeButtons.forEach((btn) => {
        btn.addEventListener('click', () => {
          modeButtons.forEach((b) => b.classList.remove('active'));
          btn.classList.add('active');
          const mode = btn.dataset.filter;
          this.engine.setVCFType(mode);
        });
      });
    }

    const lfoTabGroup = document.getElementById('lfoTabGroup');
    const lfoWaveRow = document.getElementById('lfoWaveRow');

    const updateLfoWaveButtons = () => {
      if (!lfoWaveRow) return;
      const currentWave = (this.currentLfoTarget === 2 ? this.engine.lfo2.wave : this.engine.lfo1.wave);
      const lfoButtons = lfoWaveRow.querySelectorAll('.lfo-wave-btn');
      lfoButtons.forEach((btn) => {
        btn.classList.toggle('active', btn.dataset.wave === currentWave);
      });
    };

    if (lfoTabGroup) {
      const tabButtons = lfoTabGroup.querySelectorAll('.env-tab-btn');
      tabButtons.forEach((btn) => {
        btn.addEventListener('click', () => {
          tabButtons.forEach((b) => b.classList.remove('active'));
          btn.classList.add('active');
          this.currentLfoTarget = parseInt(btn.dataset.target, 10);

          updateLfoWaveButtons();
          this.lfoKnobUpdaters.forEach((updateFn) => updateFn());
        });
      });
    }

    if (lfoWaveRow) {
      const lfoButtons = lfoWaveRow.querySelectorAll('.lfo-wave-btn');
      lfoButtons.forEach((btn) => {
        btn.addEventListener('click', () => {
          lfoButtons.forEach((b) => b.classList.remove('active'));
          btn.classList.add('active');
          const wave = btn.dataset.wave;
          this.engine.setLFOParam(this.currentLfoTarget, 'wave', wave);
        });
      });
    }

    const chorusModeRow = document.getElementById('chorusModeRow');
    if (chorusModeRow) {
      const chorusButtons = chorusModeRow.querySelectorAll('.chorus-mode-btn');
      chorusButtons.forEach((btn) => {
        btn.addEventListener('click', () => {
          chorusButtons.forEach((b) => b.classList.remove('active'));
          btn.classList.add('active');
          const mode = btn.dataset.mode;
          this.engine.setChorusMode(mode);
        });
      });
    }
  }

  // =========================================================================
  // ARPEGGIATOR & 16-STEP SEQUENCER CONTROLS
  // =========================================================================

  initArpeggiatorControls() {
    // 1. Build 16 Interactive Step Buttons
    if (this.arpStepGrid) {
      this.arpStepGrid.innerHTML = '';
      this.arpStepButtons = [];

      for (let i = 0; i < 16; i++) {
        const stepBtn = document.createElement('div');
        stepBtn.className = 'arp-step-btn active';
        stepBtn.dataset.step = i;
        stepBtn.title = `Step ${i + 1} (Klick zum Umschalten)`;
        stepBtn.innerHTML = `
          <div class="arp-step-led"></div>
          <span class="arp-step-num">${String(i + 1).padStart(2, '0')}</span>
        `;

        stepBtn.addEventListener('click', () => {
          const isActive = this.arp.toggleStep(i);
          stepBtn.classList.toggle('active', isActive);
        });

        this.arpStepGrid.appendChild(stepBtn);
        this.arpStepButtons.push(stepBtn);
      }
    }

    // 2. Power Toggle Button
    if (this.arpPowerBtn) {
      this.arpPowerBtn.addEventListener('click', () => {
        const newState = !this.arp.enabled;
        this.arp.setEnabled(newState);
        this.arpPowerBtn.classList.toggle('active', newState);
        this.arpPowerBtn.textContent = newState ? 'ARP ON' : 'ARP OFF';
      });
    }

    // 3. Latch Toggle Button
    if (this.arpLatchBtn) {
      this.arpLatchBtn.addEventListener('click', () => {
        const newState = !this.arp.latch;
        this.arp.setLatch(newState);
        this.arpLatchBtn.classList.toggle('active', newState);
        this.arpLatchBtn.textContent = newState ? 'LATCH' : 'HOLD';
      });
    }

    // 4. Pattern Mode Selector
    if (this.arpModeSelect) {
      this.arpModeSelect.addEventListener('change', (e) => {
        this.arp.setMode(e.target.value);
        if (e.target && e.target.blur) e.target.blur();
      });
    }

    // 5. Octave Selector
    if (this.arpOctaveSelect) {
      this.arpOctaveSelect.addEventListener('change', (e) => {
        this.arp.setOctaves(parseInt(e.target.value, 10));
        if (e.target && e.target.blur) e.target.blur();
      });
    }

    // 6. Division Selector
    if (this.arpDivisionSelect) {
      this.arpDivisionSelect.addEventListener('change', (e) => {
        this.arp.setDivision(e.target.value);
        if (e.target && e.target.blur) e.target.blur();
      });
    }

    // 7. Running LED Lights Tracker Callback
    this.arp.onStep = (stepIndex, note) => {
      this.arpStepButtons.forEach((btn, idx) => {
        if (idx === stepIndex) {
          btn.classList.add('current-step');
        } else {
          btn.classList.remove('current-step');
        }
      });
    };

    // Visual Key Flash
    this.arp.onNoteTrigger = (midiNote) => {
      const keyEl = this.activeKeyElements.get(midiNote);
      if (keyEl) {
        keyEl.classList.add('active');
        setTimeout(() => {
          if (!this.keyboardHeldKeys.has(midiNote) && !this.mouseHeldKeys.has(midiNote)) {
            keyEl.classList.remove('active');
          }
        }, 120);
      }
    };
  }

  // =========================================================================
  // PRESET MANAGEMENT & UI SYNCHRONIZATION
  // =========================================================================

  initPresets() {
    this.refreshPresetsDropdown();

    if (this.presetsList.length > 0) {
      this.applyPreset(this.presetsList[0]);
    }

    if (this.presetSelectDropdown) {
      this.presetSelectDropdown.addEventListener('change', (e) => {
        const selectedId = e.target.value;
        const preset = this.presetsList.find(p => p.id === selectedId);
        if (preset) {
          this.applyPreset(preset);
        }
        if (e.target && e.target.blur) e.target.blur();
      });
    }

    if (this.prevPresetBtn) {
      this.prevPresetBtn.addEventListener('click', (e) => {
        if (this.presetsList.length === 0) return;
        this.currentPresetIndex = (this.currentPresetIndex - 1 + this.presetsList.length) % this.presetsList.length;
        this.applyPreset(this.presetsList[this.currentPresetIndex]);
        if (e.target && e.target.blur) e.target.blur();
      });
    }

    if (this.nextPresetBtn) {
      this.nextPresetBtn.addEventListener('click', (e) => {
        if (this.presetsList.length === 0) return;
        this.currentPresetIndex = (this.currentPresetIndex + 1) % this.presetsList.length;
        this.applyPreset(this.presetsList[this.currentPresetIndex]);
        if (e.target && e.target.blur) e.target.blur();
      });
    }

    if (this.initPatchBtn) {
      this.initPatchBtn.addEventListener('click', (e) => {
        if (window.SYNTH_INIT_PRESET) {
          this.applyPreset(window.SYNTH_INIT_PRESET);
        }
        if (e.target && e.target.blur) e.target.blur();
      });
    }

    if (this.savePresetBtn && this.savePresetModal) {
      this.savePresetBtn.addEventListener('click', () => {
        this.userPresetNameInput.value = '';
        this.savePresetModal.classList.add('active');
        setTimeout(() => this.userPresetNameInput.focus(), 50);
      });
    }

    if (this.closeSaveModalBtn && this.savePresetModal) {
      this.closeSaveModalBtn.addEventListener('click', () => {
        this.savePresetModal.classList.remove('active');
      });
    }

    if (this.cancelSavePresetBtn && this.savePresetModal) {
      this.cancelSavePresetBtn.addEventListener('click', () => {
        this.savePresetModal.classList.remove('active');
      });
    }

    if (this.confirmSavePresetBtn) {
      this.confirmSavePresetBtn.addEventListener('click', () => {
        const name = this.userPresetNameInput.value.trim() || 'My Custom Synth';
        const category = this.userPresetCategorySelect.value || 'USER';
        this.saveCurrentUserPreset(name, category);
        this.savePresetModal.classList.remove('active');
      });
    }
  }

  loadUserPresets() {
    try {
      const stored = localStorage.getItem('retrovox_user_presets');
      return stored ? JSON.parse(stored) : [];
    } catch(e) {
      return [];
    }
  }

  saveCurrentUserPreset(name, category) {
    const userPresets = this.loadUserPresets();
    const newPreset = {
      id: `user-${Date.now()}`,
      name: `USER // ${name.toUpperCase()}`,
      category: category,
      description: 'Custom User Synthesizer Patch',
      state: this.engine.getPresetState()
    };
    userPresets.push(newPreset);
    try {
      localStorage.setItem('retrovox_user_presets', JSON.stringify(userPresets));
    } catch(e) {}

    this.refreshPresetsDropdown();
    this.applyPreset(newPreset);
  }

  refreshPresetsDropdown() {
    if (!this.presetSelectDropdown) return;
    const factory = window.SYNTH_FACTORY_PRESETS || [];
    const user = this.loadUserPresets();
    this.presetsList = [...factory, ...user];

    this.presetSelectDropdown.innerHTML = '';

    const factoryGroup = document.createElement('optgroup');
    factoryGroup.label = '— FACTORY CLASSICS —';
    factory.forEach((p) => {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = p.name;
      factoryGroup.appendChild(opt);
    });
    this.presetSelectDropdown.appendChild(factoryGroup);

    if (user.length > 0) {
      const userGroup = document.createElement('optgroup');
      userGroup.label = '— USER PRESETS —';
      user.forEach((p) => {
        const opt = document.createElement('option');
        opt.value = p.id;
        opt.textContent = p.name;
        userGroup.appendChild(opt);
      });
      this.presetSelectDropdown.appendChild(userGroup);
    }
  }

  applyPreset(preset) {
    if (!preset || !preset.state) return;
    this.engine.loadPresetState(preset.state);
    this.applyPresetUI(preset.state);

    if (this.presetCatTag) {
      this.presetCatTag.textContent = preset.category || 'PRESET';
    }
    if (this.presetSelectDropdown) {
      this.presetSelectDropdown.value = preset.id;
    }
    this.currentPresetIndex = this.presetsList.findIndex(p => p.id === preset.id);
  }

  applyPresetUI(state) {
    if (!state) return;

    if (state.vco1) {
      if (state.vco1.octave !== undefined) this.updateKnobUI('vco1-octave', state.vco1.octave);
      if (state.vco1.pulseWidth !== undefined) this.updateKnobUI('vco1-pw', state.vco1.pulseWidth);
      if (state.vco1.wave) {
        const row1 = document.querySelector('.wave-btn-row[data-vco="1"]');
        if (row1) {
          row1.querySelectorAll('.wave-btn').forEach(b => b.classList.toggle('active', b.dataset.wave === state.vco1.wave));
        }
      }
    }

    if (state.vco2) {
      if (state.vco2.octave !== undefined) this.updateKnobUI('vco2-octave', state.vco2.octave);
      if (state.vco2.semitone !== undefined) this.updateKnobUI('vco2-semitone', state.vco2.semitone);
      if (state.vco2.detuneCents !== undefined) this.updateKnobUI('vco2-detune', state.vco2.detuneCents);
      if (state.vco2.wave) {
        const row2 = document.querySelector('.wave-btn-row[data-vco="2"]');
        if (row2) {
          row2.querySelectorAll('.wave-btn').forEach(b => b.classList.toggle('active', b.dataset.wave === state.vco2.wave));
        }
      }
      if (state.vco2.hardSync !== undefined) {
        const vco2SyncBtn = document.getElementById('vco2SyncBtn');
        if (vco2SyncBtn) vco2SyncBtn.classList.toggle('active', !!state.vco2.hardSync);
      }
    }

    if (state.mixer) {
      if (state.mixer.vco1Level !== undefined) this.updateKnobUI('mixer-vco1', state.mixer.vco1Level);
      if (state.mixer.vco2Level !== undefined) this.updateKnobUI('mixer-vco2', state.mixer.vco2Level);
      if (state.mixer.subLevel !== undefined) this.updateKnobUI('mixer-sub', state.mixer.subLevel);
      if (state.mixer.noiseLevel !== undefined) this.updateKnobUI('mixer-noise', state.mixer.noiseLevel);
      if (state.mixer.subOctave !== undefined) {
        const subOctSelector = document.getElementById('subOctSelector');
        if (subOctSelector) {
          subOctSelector.querySelectorAll('.sub-oct-btn').forEach(b => b.classList.toggle('active', parseInt(b.dataset.suboct, 10) === state.mixer.subOctave));
        }
      }
    }

    if (state.vcf) {
      if (state.vcf.cutoff !== undefined) this.updateKnobUI('vcf-cutoff', state.vcf.cutoff);
      if (state.vcf.resonance !== undefined) this.updateKnobUI('vcf-resonance', state.vcf.resonance);
      if (state.vcf.drive !== undefined) this.updateKnobUI('vcf-drive', state.vcf.drive);
      if (state.vcf.keyTrack !== undefined) this.updateKnobUI('vcf-keytrack', state.vcf.keyTrack);
      if (state.vcf.envMod !== undefined) this.updateKnobUI('vcf-envmod', state.vcf.envMod);
      if (state.vcf.type) {
        const filterModeRow = document.getElementById('filterModeRow');
        if (filterModeRow) {
          filterModeRow.querySelectorAll('.filter-mode-btn').forEach(b => b.classList.toggle('active', b.dataset.filter === state.vcf.type));
        }
      }
    }

    this.faderUpdaters.forEach((updateFn) => updateFn());

    this.lfoKnobUpdaters.forEach((updateFn) => updateFn());
    const lfoWaveRow = document.getElementById('lfoWaveRow');
    if (lfoWaveRow) {
      const activeWave = (this.currentLfoTarget === 2 ? this.engine.lfo2.wave : this.engine.lfo1.wave);
      lfoWaveRow.querySelectorAll('.lfo-wave-btn').forEach(b => b.classList.toggle('active', b.dataset.wave === activeWave));
    }

    if (state.fx) {
      if (state.fx.chorus) {
        if (state.fx.chorus.mix !== undefined) this.updateKnobUI('fx-chorus-mix', state.fx.chorus.mix);
        if (state.fx.chorus.mode) {
          const chorusModeRow = document.getElementById('chorusModeRow');
          if (chorusModeRow) {
            chorusModeRow.querySelectorAll('.chorus-mode-btn').forEach(b => b.classList.toggle('active', b.dataset.mode === state.fx.chorus.mode));
          }
        }
      }
      if (state.fx.delay) {
        if (state.fx.delay.time !== undefined) this.updateKnobUI('fx-delay-time', state.fx.delay.time);
        if (state.fx.delay.feedback !== undefined) this.updateKnobUI('fx-delay-feedback', state.fx.delay.feedback);
        if (state.fx.delay.mix !== undefined) this.updateKnobUI('fx-delay-mix', state.fx.delay.mix);
      }
      if (state.fx.reverb) {
        if (state.fx.reverb.decay !== undefined) this.updateKnobUI('fx-reverb-decay', state.fx.reverb.decay);
        if (state.fx.reverb.mix !== undefined) this.updateKnobUI('fx-reverb-mix', state.fx.reverb.mix);
      }
    }

    if (state.performance) {
      if (state.performance.glide !== undefined && this.glideToggle) {
        this.glideToggle.checked = !!state.performance.glide;
      }
      if (state.performance.octaveShift !== undefined && this.octaveValueDisplay) {
        const s = state.performance.octaveShift;
        this.octaveValueDisplay.textContent = s > 0 ? `+${s}` : `${s}`;
      }
    }
  }

  updateKnobUI(param, val) {
    const updater = this.allKnobUpdaters.get(param);
    if (updater) {
      updater(val);
    }
  }

  // =========================================================================
  // PERFORMANCE CONTROLS & PC KEYBOARD
  // =========================================================================

  initPerformanceControls() {
    this.octaveDownBtn.addEventListener('click', () => this.shiftOctave(-1));
    this.octaveUpBtn.addEventListener('click', () => this.shiftOctave(1));

    this.glideToggle.addEventListener('change', (e) => {
      this.engine.setGlide(e.target.checked);
    });

    this.initWheel(this.pitchWheel, true, (val) => {
      const semitones = val * 2;
      this.engine.setPitchBend(Math.pow(2, semitones / 12));
    });

    this.initWheel(this.modWheel, false, (val) => {
      this.engine.setModWheel(val);
    });

    this.engine.onVoiceChange = (activeCount, freq) => {
      if (this.activeVoiceInfo) {
        this.activeVoiceInfo.textContent = `POLY: ${activeCount}`;
      }
      if (this.activeFreqInfo) {
        this.activeFreqInfo.textContent = freq ? `${Math.round(freq)} HZ` : 'READY';
      }
    };
  }

  shiftOctave(delta) {
    let current = parseInt(this.octaveValueDisplay.textContent, 10);
    current = Math.max(-2, Math.min(2, current + delta));
    this.octaveValueDisplay.textContent = (current > 0 ? `+${current}` : `${current}`);
    this.engine.setOctaveShift(current);
  }

  initWheel(wheelEl, springBack, onChange) {
    let isDragging = false;
    let startY = 0;
    let currentValue = springBack ? 0 : 0;

    const handleStart = (clientY) => {
      isDragging = true;
      startY = clientY;
    };

    const handleMove = (clientY) => {
      if (!isDragging) return;
      const deltaY = startY - clientY;
      let normalized = deltaY / 40;

      if (springBack) {
        normalized = Math.max(-1, Math.min(1, normalized));
        wheelEl.style.transform = `translateY(${-normalized * 16}px)`;
        onChange(normalized);
      } else {
        currentValue = Math.max(0, Math.min(1, currentValue + (deltaY / 100)));
        startY = clientY;
        wheelEl.style.transform = `translateY(${-(currentValue * 30 - 15)}px)`;
        onChange(currentValue);
      }
    };

    const handleEnd = () => {
      if (!isDragging) return;
      isDragging = false;
      if (springBack) {
        wheelEl.style.transition = 'transform 0.15s ease-out';
        wheelEl.style.transform = 'translateY(0px)';
        onChange(0);
        setTimeout(() => { wheelEl.style.transition = ''; }, 150);
      }
    };

    wheelEl.addEventListener('mousedown', (e) => {
      e.preventDefault();
      handleStart(e.clientY);
    });

    window.addEventListener('mousemove', (e) => handleMove(e.clientY));
    window.addEventListener('mouseup', handleEnd);

    wheelEl.addEventListener('touchstart', (e) => {
      e.preventDefault();
      handleStart(e.touches[0].clientY);
    }, { passive: false });

    window.addEventListener('touchmove', (e) => {
      if (isDragging) handleMove(e.touches[0].clientY);
    });
    window.addEventListener('touchend', handleEnd);
  }

  initKeyboardHotkeys() {
    const isTextInput = (target) => {
      if (!target) return false;
      const tag = target.tagName;
      if (tag === 'TEXTAREA') return true;
      if (tag === 'INPUT') {
        const type = (target.type || '').toLowerCase();
        return type === 'text' || type === 'password' || type === 'search' || type === 'email';
      }
      return false;
    };

    window.addEventListener('keydown', (e) => {
      if (e.repeat || isTextInput(e.target)) return;

      if (e.code === 'KeyZ' && !this.keyMap[e.code]) {
        this.shiftOctave(-1);
        return;
      }
      if (e.code === 'KeyX') {
        this.shiftOctave(1);
        return;
      }

      const midiNote = this.keyMap[e.code];
      if (midiNote !== undefined) {
        if (!this.keyboardHeldKeys.has(midiNote)) {
          this.keyboardHeldKeys.add(midiNote);
          const keyEl = this.activeKeyElements.get(midiNote);
          if (keyEl) keyEl.classList.add('active');
          if (!this.mouseHeldKeys.has(midiNote)) {
            if (this.arp && this.arp.enabled) {
              this.arp.handleKeyDown(midiNote);
            } else {
              this.engine.noteOn(midiNote);
            }
          }
        }
      }
    });

    window.addEventListener('keyup', (e) => {
      if (isTextInput(e.target)) return;

      const midiNote = this.keyMap[e.code];
      if (midiNote !== undefined) {
        if (this.keyboardHeldKeys.has(midiNote)) {
          this.keyboardHeldKeys.delete(midiNote);
          if (!this.mouseHeldKeys.has(midiNote)) {
            const keyEl = this.activeKeyElements.get(midiNote);
            if (keyEl) keyEl.classList.remove('active');
            if (this.arp && this.arp.enabled) {
              this.arp.handleKeyUp(midiNote);
            } else {
              this.engine.noteOff(midiNote);
            }
          }
        }
      }
    });

    // Window / tab blur safety: release held keyboard notes when user switches tabs/windows
    window.addEventListener('blur', () => {
      for (const note of Array.from(this.keyboardHeldKeys)) {
        this.keyboardHeldKeys.delete(note);
        const keyEl = this.activeKeyElements.get(note);
        if (keyEl && !this.mouseHeldKeys.has(note)) keyEl.classList.remove('active');
        if (this.arp && this.arp.enabled) {
          this.arp.handleKeyUp(note);
        } else {
          this.engine.noteOff(note);
        }
      }
    });
  }

  /**
   * CRT Oscilloscope Canvas & Reactive Speaker Animation Loop (Optimized Performance)
   */
  startVisualizer() {
    if (!this.scopeCanvas) return;
    const canvas = this.scopeCanvas;
    const ctx = this.scopeCtx;
    const width = canvas.width;
    const height = canvas.height;

    const bufferLength = 256;
    const timeData = new Uint8Array(bufferLength);

    let idleFrames = 0;
    let isIdle = false;

    const drawGrid = () => {
      ctx.fillStyle = 'rgba(4, 8, 6, 0.35)';
      ctx.fillRect(0, 0, width, height);

      // CRT Grid Lines
      ctx.strokeStyle = 'rgba(0, 255, 136, 0.08)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, height / 2);
      ctx.lineTo(width, height / 2);
      for (let x = 0; x < width; x += 36) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
      }
      ctx.stroke();
    };

    const updateVisuals = () => {
      requestAnimationFrame(updateVisuals);

      // 1. Pulse active LFO LED
      if (this.lfoRateLed && this.engine.lfo1 && this.engine.lfo2) {
        const timeSec = performance.now() * 0.001;
        const activeLfoRate = this.currentLfoTarget === 2 ? this.engine.lfo2.rate : this.engine.lfo1.rate;
        const phase = (timeSec * activeLfoRate * Math.PI * 2) % (Math.PI * 2);
        const intensity = Math.sin(phase) > 0 ? 1 : 0.15;
        this.lfoRateLed.style.opacity = intensity;
        if (intensity > 0.5) {
          this.lfoRateLed.classList.add('pulsing');
        } else {
          this.lfoRateLed.classList.remove('pulsing');
        }
      }

      // Check if synth has active voices
      const hasActiveVoices = this.engine.activeVoices && this.engine.activeVoices.size > 0;

      let rms = 0;

      if (this.engine.analyser && this.engine.isPowered) {
        this.engine.analyser.getByteTimeDomainData(timeData);

        for (let i = 0; i < bufferLength; i++) {
          const diff = Math.abs(timeData[i] - 128);
          rms += diff * diff;
        }
        rms = Math.sqrt(rms / bufferLength);
      }

      const isSounding = rms > 1.2 || hasActiveVoices;

      // 2. Idle Pausing / Silence Throttling to save CPU cycles
      if (!isSounding) {
        idleFrames++;
        if (idleFrames > 15) {
          if (!isIdle) {
            isIdle = true;
            drawGrid();
            ctx.lineWidth = 1.2;
            ctx.strokeStyle = '#00ff8844';
            ctx.beginPath();
            ctx.moveTo(0, height / 2);
            ctx.lineTo(width, height / 2);
            ctx.stroke();

            if (this.lastWooferScale !== 1.0) {
              this.wooferLeft.style.transform = 'scale(1)';
              this.wooferRight.style.transform = 'scale(1)';
              this.lastWooferScale = 1.0;
            }
            this.updateVuMeter(0);
          }
          return;
        }
      } else {
        idleFrames = 0;
        isIdle = false;
      }

      // 3. Active Waveform Draw Loop
      drawGrid();

      if (this.engine.analyser && this.engine.isPowered) {
        ctx.lineWidth = 1.6;
        ctx.strokeStyle = '#00ff88';
        ctx.shadowBlur = 4;
        ctx.shadowColor = 'rgba(0, 255, 136, 0.8)';
        ctx.beginPath();

        const sliceWidth = width / bufferLength;
        let x = 0;

        for (let i = 0; i < bufferLength; i++) {
          const v = timeData[i] / 128.0;
          const y = (v * height) / 2;

          if (i === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }

          x += sliceWidth;
        }

        ctx.stroke();
        ctx.shadowBlur = 0;
      } else {
        ctx.lineWidth = 1.2;
        ctx.strokeStyle = '#00ff8844';
        ctx.beginPath();
        ctx.moveTo(0, height / 2);
        ctx.lineTo(width, height / 2);
        ctx.stroke();
      }

      // 4. Speaker Woofer Vibration (Dirty-checked to avoid DOM layout thrashing)
      const targetScale = isSounding && rms > 2 ? 1 + Math.min(0.08, rms * 0.002) : 1.0;
      if (Math.abs(targetScale - this.lastWooferScale) > 0.003) {
        this.wooferLeft.style.transform = `scale(${targetScale})`;
        this.wooferRight.style.transform = `scale(${targetScale})`;
        this.lastWooferScale = targetScale;
      }

      this.updateVuMeter(rms);
    };

    updateVisuals();
  }

  updateVuMeter(rms) {
    if (!this.ledsL || !this.ledsR) return;
    const numLeds = this.ledsL.length;
    const activeCount = Math.min(numLeds, Math.floor((rms / 28) * numLeds));

    if (activeCount === this.lastActiveVuCount) return; // Prevent DOM layout thrashing
    this.lastActiveVuCount = activeCount;

    for (let i = 0; i < numLeds; i++) {
      if (i < activeCount && this.engine.isPowered) {
        this.ledsL[i].classList.add('lit');
        this.ledsR[i].classList.add('lit');
      } else {
        this.ledsL[i].classList.remove('lit');
        this.ledsR[i].classList.remove('lit');
      }
    }
  }
}

window.SynthUI = SynthUI;
