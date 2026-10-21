/**
 * RETROVOX SUB-1 • SYNTHESIZER PANEL
 * Wires the panel to the engines: rotary knobs and ADSR faders (controls.js), button rows and tabs,
 * the 16-step arpeggiator strip, performance bay (wheels, octave, glide), mobile module tabs,
 * keybed (virtual-keyboard.js), preset LCD (preset-panel.js) and CRT visualizer (visualizer.js).
 * Every patch control reads and writes the engine through the SynthParams table, and
 * syncControls() redraws all of them from the engine state (after preset loads and tab switches).
 */

// Radio-style button rows: patch path, buttons, and the data-* key that holds each button's value
const BUTTON_GROUPS = [
  { path: 'vco1.wave', selector: '.wave-btn-row[data-vco="1"] .wave-btn', key: 'wave' },
  { path: 'vco2.wave', selector: '.wave-btn-row[data-vco="2"] .wave-btn', key: 'wave' },
  { path: 'mixer.subOctave', selector: '#subOctSelector .sub-oct-btn', key: 'suboct', parse: (v) => parseInt(v, 10) },
  { path: 'vcf.type', selector: '#filterModeRow .filter-mode-btn', key: 'filter' },
  { path: 'fx.chorus.mode', selector: '#chorusModeRow .chorus-mode-btn', key: 'mode' },
  { path: (ui) => `lfo${ui.currentLfoTarget}.wave`, selector: '#lfoWaveRow .lfo-wave-btn', key: 'wave' }
];

class SynthUI {
  constructor(audioEngine, arpEngine) {
    this.engine = audioEngine;
    this.arp = arpEngine || new window.ArpEngine(audioEngine);

    // Which envelope the ADSR faders edit ('amp' | 'filter') and which LFO the LFO knobs edit (1 | 2)
    this.currentEnvTarget = 'amp';
    this.currentLfoTarget = 1;

    // Knobs that are not patch parameters
    this.arpKnobActions = {
      'arp-bpm': (v) => this.arp.setBpm(v),
      'arp-gate': (v) => this.arp.setGate(v),
      'arp-swing': (v) => this.arp.setSwing(v)
    };

    this.keyboard = new VirtualKeyboard(document.getElementById('keyboardContainer'), {
      onNoteOn: (midi) => this.playNote(midi),
      onNoteOff: (midi) => this.stopNote(midi),
      onOctaveShift: (delta) => this.shiftOctave(delta),
      ensureAudio: () => this.engine.ensureAudioRunning()
    });

    this.initKnobs();
    this.initFaders();
    this.initModuleControls();
    this.initMobileTabs();
    this.initPerformanceControls();
    this.initArpeggiatorControls();
    this.presetPanel = new PresetPanel(this.engine, new PresetStore(), () => this.syncControls());

    this.visualizer = new Visualizer(this.engine, {
      canvas: document.getElementById('scopeCanvas'),
      lfoRateLed: document.getElementById('lfoRateLed'),
      wooferLeft: document.getElementById('wooferLeft'),
      wooferRight: document.getElementById('wooferRight'),
      vuMeterL: document.getElementById('vuMeterL'),
      vuMeterR: document.getElementById('vuMeterR')
    }, () => this.engine.getLfo(this.currentLfoTarget).rate);
    this.visualizer.start();
  }

  // =========================================================================
  // NOTE ROUTING (Keybed / PC keyboard -> Arpeggiator or Voices)
  // =========================================================================

  playNote(midiNote) {
    if (this.arp && this.arp.enabled) {
      this.arp.handleKeyDown(midiNote);
    } else {
      this.engine.noteOn(midiNote);
    }
  }

  stopNote(midiNote) {
    if (this.arp && this.arp.enabled) {
      this.arp.handleKeyUp(midiNote);
    } else {
      this.engine.noteOff(midiNote);
    }
  }

  // =========================================================================
  // KNOBS, FADERS & BUTTON ROWS
  // =========================================================================

  initKnobs() {
    this.knobs = Array.from(document.querySelectorAll('.synth-knob-housing'))
      .map((housing) => new Knob(housing, (val) => this.dispatchKnob(housing.dataset.param, val)));
  }

  dispatchKnob(knobId, val) {
    const param = SynthParams.byKnob(knobId, this.currentLfoTarget);
    if (param) {
      param.set(this.engine, val);
    } else if (this.arpKnobActions[knobId]) {
      this.arpKnobActions[knobId](val);
    }
  }

  envPath(stage) {
    return `${this.currentEnvTarget === 'amp' ? 'ampEnv' : 'filterEnv'}.${stage}`;
  }

  initFaders() {
    this.faders = Array.from(document.querySelectorAll('.synth-fader-track-housing')).map((housing) => {
      const stage = housing.dataset.fader;
      return new Fader(housing, {
        read: () => SynthParams.getPath(this.engine, this.envPath(stage)),
        onChange: (val) => SynthParams.set(this.engine, this.envPath(stage), val)
      });
    });

    const adsrModuleBay = document.getElementById('adsrModuleBay');
    this.initTabGroup('envTabGroup', (target) => {
      this.currentEnvTarget = target;
      if (adsrModuleBay) adsrModuleBay.classList.toggle('env-vcf-mode', target === 'filter');
      this.faders.forEach((fader) => fader.sync());
    });
  }

  /**
   * Tab buttons (.env-tab-btn with data-target) inside a group; onSelect receives the data-target value
   */
  initTabGroup(groupId, onSelect) {
    const group = document.getElementById(groupId);
    if (!group) return;
    const tabButtons = group.querySelectorAll('.env-tab-btn');
    tabButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        tabButtons.forEach((b) => b.classList.toggle('active', b === btn));
        onSelect(btn.dataset.target);
      });
    });
  }

  groupPath(group) {
    return typeof group.path === 'function' ? group.path(this) : group.path;
  }

  renderButtonGroup(group) {
    const value = SynthParams.getPath(this.engine, this.groupPath(group));
    const parse = group.parse || ((v) => v);
    document.querySelectorAll(group.selector).forEach((btn) => {
      btn.classList.toggle('active', parse(btn.dataset[group.key]) === value);
    });
  }

  initModuleControls() {
    for (const group of BUTTON_GROUPS) {
      const parse = group.parse || ((v) => v);
      document.querySelectorAll(group.selector).forEach((btn) => {
        btn.addEventListener('click', () => {
          SynthParams.set(this.engine, this.groupPath(group), parse(btn.dataset[group.key]));
          this.renderButtonGroup(group);
        });
      });
    }

    this.vco2SyncBtn = document.getElementById('vco2SyncBtn');
    if (this.vco2SyncBtn) {
      this.vco2SyncBtn.addEventListener('click', () => {
        this.engine.setVCO2Sync(!this.engine.vco2.hardSync);
        this.vco2SyncBtn.classList.toggle('active', this.engine.vco2.hardSync);
      });
    }

    this.initTabGroup('lfoTabGroup', (target) => {
      this.currentLfoTarget = parseInt(target, 10);
      this.syncControls();
    });
  }

  /**
   * Redraws every patch control from the engine (knobs, faders, button rows, toggles, performance bay)
   */
  syncControls() {
    for (const knob of this.knobs) {
      const param = SynthParams.byKnob(knob.param, this.currentLfoTarget);
      if (param) knob.setValue(SynthParams.read(this.engine, param));
    }
    this.faders.forEach((fader) => fader.sync());
    BUTTON_GROUPS.forEach((group) => this.renderButtonGroup(group));
    if (this.vco2SyncBtn) this.vco2SyncBtn.classList.toggle('active', !!this.engine.vco2.hardSync);
    if (this.glideToggle) this.glideToggle.checked = !!this.engine.glideEnabled;
    this.renderOctave();
  }

  // =========================================================================
  // MOBILE MODULE TABS (< 900px)
  // =========================================================================

  initMobileTabs() {
    const tabsBar = document.getElementById('mobileSynthTabsBar');
    const modularSurface = document.getElementById('modularControlSurface');
    if (!tabsBar || !modularSurface) return;

    const tabButtons = tabsBar.querySelectorAll('.mobile-tab-btn');
    const moduleSlides = modularSurface.querySelectorAll('.module-slide');

    // Click on tab smoothly scrolls the carousel
    tabButtons.forEach((btn, index) => {
      btn.addEventListener('click', () => {
        const slideIndex = parseInt(btn.dataset.slideIndex ?? index, 10);
        const targetSlide = moduleSlides[slideIndex];
        if (targetSlide) {
          modularSurface.scrollTo({
            left: targetSlide.offsetLeft,
            behavior: 'smooth',
          });
        }
        tabButtons.forEach((b) => b.classList.toggle('active', b === btn));
        if (btn.blur) btn.blur();
      });
    });

    // Horizontal swipe listener updates active tab highlight
    let isScrolling = null;
    modularSurface.addEventListener('scroll', () => {
      if (isScrolling) cancelAnimationFrame(isScrolling);
      isScrolling = requestAnimationFrame(() => {
        const scrollLeft = modularSurface.scrollLeft;
        const slideWidth = modularSurface.clientWidth || 1;
        const activeIndex = Math.min(
          tabButtons.length - 1,
          Math.max(0, Math.round(scrollLeft / slideWidth))
        );
        tabButtons.forEach((btn, idx) => {
          btn.classList.toggle('active', idx === activeIndex);
        });
      });
    }, { passive: true });
  }

  // =========================================================================
  // PERFORMANCE BAY (Wheels, Octave, Glide, Voice Info)
  // =========================================================================

  initPerformanceControls() {
    this.octaveValueDisplay = document.getElementById('octaveValueDisplay');
    this.glideToggle = document.getElementById('glideToggle');

    document.getElementById('octaveDownBtn').addEventListener('click', () => this.shiftOctave(-1));
    document.getElementById('octaveUpBtn').addEventListener('click', () => this.shiftOctave(1));
    this.glideToggle.addEventListener('change', (e) => this.engine.setGlide(e.target.checked));

    this.pitchWheel = new PerformanceWheel(document.getElementById('pitchWheel'), true, (val) => {
      this.engine.setPitchBend(Math.pow(2, (val * 2) / 12)); // +-2 semitones
    });
    this.modWheel = new PerformanceWheel(document.getElementById('modWheel'), false, (val) => {
      this.engine.setModWheel(val);
    });

    const activeVoiceInfo = document.getElementById('activeVoiceInfo');
    const activeFreqInfo = document.getElementById('activeFreqInfo');
    this.engine.onVoiceChange = (activeCount, freq) => {
      if (activeVoiceInfo) activeVoiceInfo.textContent = `POLY: ${activeCount}`;
      if (activeFreqInfo) activeFreqInfo.textContent = freq ? `${Math.round(freq)} HZ` : 'READY';
    };
  }

  shiftOctave(delta) {
    this.engine.setOctaveShift(this.engine.octaveShift + delta);
    this.renderOctave();
  }

  renderOctave() {
    if (!this.octaveValueDisplay) return;
    const shift = this.engine.octaveShift;
    this.octaveValueDisplay.textContent = shift > 0 ? `+${shift}` : `${shift}`;
  }

  // =========================================================================
  // ARPEGGIATOR & 16-STEP SEQUENCER STRIP
  // =========================================================================

  initArpeggiatorControls() {
    this.arpStepButtons = this.buildArpStepGrid(document.getElementById('arpStepGrid'));

    const toggleButton = (id, isOn, apply, labels) => {
      const btn = document.getElementById(id);
      if (!btn) return;
      btn.addEventListener('click', () => {
        const next = !isOn();
        apply(next);
        btn.classList.toggle('active', next);
        btn.textContent = next ? labels[0] : labels[1];
      });
    };
    toggleButton('arpPowerBtn', () => this.arp.enabled, (on) => this.arp.setEnabled(on), ['ARP ON', 'ARP OFF']);
    toggleButton('arpLatchBtn', () => this.arp.latch, (on) => this.arp.setLatch(on), ['LATCH', 'HOLD']);

    // Master clock sync switch (INT / DRUM SYNC), mirrored by the drum rack's sync button
    const arpSyncIndicator = document.getElementById('arpSyncIndicator');
    if (arpSyncIndicator) {
      this.arp.onSyncModeChange((mode) => {
        arpSyncIndicator.classList.toggle('active', mode === 'external');
        arpSyncIndicator.textContent = mode === 'external' ? 'DRUM SYNC' : 'INT CLK';
      });
      arpSyncIndicator.addEventListener('click', (e) => {
        this.arp.toggleSyncMode();
        DomUtils.blurTarget(e);
      });
    }

    const onSelect = (id, apply) => {
      const select = document.getElementById(id);
      if (select) select.addEventListener('change', (e) => {
        apply(e.target.value);
        DomUtils.blurTarget(e);
      });
    };
    onSelect('arpModeSelect', (v) => this.arp.setMode(v));
    onSelect('arpOctaveSelect', (v) => this.arp.setOctaves(parseInt(v, 10)));
    onSelect('arpDivisionSelect', (v) => this.arp.setDivision(v));

    // Running chase LED and key flash for every arpeggiated note
    this.arp.onStep = (stepIndex) => {
      this.arpStepButtons.forEach((btn, idx) => btn.classList.toggle('current-step', idx === stepIndex));
    };
    this.arp.onNoteTrigger = (midiNote) => this.keyboard.flashKey(midiNote);
  }

  buildArpStepGrid(grid) {
    if (!grid) return [];
    grid.innerHTML = '';
    const buttons = [];
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
        stepBtn.classList.toggle('active', this.arp.toggleStep(i));
      });
      grid.appendChild(stepBtn);
      buttons.push(stepBtn);
    }
    return buttons;
  }
}

window.SynthUI = SynthUI;
