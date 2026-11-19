/**
 * SYNTHESIZER PANEL
 * Wires the panel to the engines: rotary knobs and ADSR faders (controls.js), button rows and tabs,
 * the 16-step arpeggiator strip, performance bay (wheels, octave, glide), mobile module tabs,
 * keybed (virtual-keyboard.js), preset LCD (preset-panel.js) and CRT visualizer (visualizer.js).
 * Everything synth-specific comes from the synth definition (synth-registry.js): the parameter
 * table, radio button rows, toggle buttons, envelope tabs, presets and the LFO rate for the LED.
 * syncControls() redraws every control from the engine state (after preset loads and tab switches).
 */

class SynthUI {
  constructor(audioEngine, arpEngine, synth) {
    this.engine = audioEngine;
    this.arp = arpEngine || new window.ArpEngine(audioEngine);
    this.notes = new NoteRouter(audioEngine, this.arp);
    this.synth = synth;
    this.params = synth.params;

    // Which envelope the ADSR faders edit (key of synth.envTargets) and which LFO the shared LFO knobs edit
    this.currentEnvTarget = Object.keys(synth.envTargets)[0];
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
    this.notes.onLatchedChange = (notes) => this.keyboard.setLatched(notes);

    this.initKnobs();
    this.initFaders();
    this.initModuleControls();
    this.initMobileTabs();
    this.initPerformanceControls();
    this.initArpeggiatorControls();
    this.presetPanel = new PresetPanel(this.engine, new PresetStore({ key: synth.presetStorageKey }), synth.presets, () => {
      this.notes.releaseLatch();
      this.syncControls();
    });

    this.visualizer = new Visualizer(this.engine, {
      canvas: document.getElementById('scopeCanvas'),
      lfoRateLed: document.getElementById('lfoRateLed'),
      wooferLeft: document.getElementById('wooferLeft'),
      wooferRight: document.getElementById('wooferRight'),
      vuMeterL: document.getElementById('vuMeterL'),
      vuMeterR: document.getElementById('vuMeterR')
    }, () => synth.lfoRate(this.engine, this));
    this.visualizer.start();
  }

  // =========================================================================
  // NOTE ROUTING (Keybed / PC keyboard -> Arpeggiator or Voices)
  // =========================================================================

  playNote(midiNote) {
    this.notes.playNote(midiNote);
  }

  stopNote(midiNote) {
    this.notes.stopNote(midiNote);
  }

  // =========================================================================
  // KNOBS, FADERS & BUTTON ROWS
  // =========================================================================

  initKnobs() {
    this.knobs = Array.from(document.querySelectorAll('.synth-knob-housing'))
      .map((housing) => new Knob(housing, (val) => this.dispatchKnob(housing.dataset.param, val)));
  }

  dispatchKnob(knobId, val) {
    const param = this.params.byKnob(knobId, this.currentLfoTarget);
    if (param) {
      param.set(this.engine, val);
      if (knobId.startsWith('fx-')) this.renderFxLeds();
    } else if (this.arpKnobActions[knobId]) {
      this.arpKnobActions[knobId](val);
    }
  }

  envPath(stage) {
    return `${this.synth.envTargets[this.currentEnvTarget]}.${stage}`;
  }

  initFaders() {
    this.faders = Array.from(document.querySelectorAll('.synth-fader-track-housing')).map((housing) => {
      const stage = housing.dataset.fader;
      return new Fader(housing, {
        read: () => this.params.getPath(this.engine, this.envPath(stage)),
        onChange: (val) => this.params.set(this.engine, this.envPath(stage), val)
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
    const value = this.params.getPath(this.engine, this.groupPath(group));
    const parse = group.parse || ((v) => v);
    document.querySelectorAll(group.selector).forEach((btn) => {
      btn.classList.toggle('active', parse(btn.dataset[group.key]) === value);
    });
    if (group.onRender) group.onRender(value);
  }

  initModuleControls() {
    for (const group of this.synth.buttonGroups) {
      const parse = group.parse || ((v) => v);
      document.querySelectorAll(group.selector).forEach((btn) => {
        btn.addEventListener('click', () => {
          this.params.set(this.engine, this.groupPath(group), parse(btn.dataset[group.key]));
          this.renderButtonGroup(group);
          this.renderFxLeds();
        });
      });
    }

    // On/off buttons for boolean patch parameters
    this.toggles = this.synth.toggles
      .map((toggle) => ({ ...toggle, btn: document.getElementById(toggle.id) }))
      .filter((toggle) => toggle.btn);
    for (const toggle of this.toggles) {
      toggle.btn.addEventListener('click', () => {
        this.params.set(this.engine, toggle.path, !this.params.getPath(this.engine, toggle.path));
        this.renderToggle(toggle);
      });
    }

    this.initTabGroup('lfoTabGroup', (target) => {
      this.currentLfoTarget = parseInt(target, 10);
      this.syncControls();
    });

    // FX rack: one effect page at a time, LEDs on the tabs mark the audible effects
    this.fxPages = document.querySelectorAll('.fx-page');
    this.fxLeds = document.querySelectorAll('[data-fx-led]');
    this.initTabGroup('fxTabGroup', (target) => {
      this.fxPages.forEach((page) => page.classList.toggle('active', page.dataset.fxPage === target));
    });
  }

  renderFxLeds() {
    if (!this.fxLeds) return;
    const active = FXChain.activeEffects(this.engine.fx);
    this.fxLeds.forEach((led) => led.classList.toggle('on', !!active[led.dataset.fxLed]));
  }

  renderToggle(toggle) {
    toggle.btn.classList.toggle('active', !!this.params.getPath(this.engine, toggle.path));
  }

  /**
   * Redraws every patch control from the engine (knobs, faders, button rows, toggles, performance bay)
   */
  syncControls() {
    for (const knob of this.knobs) {
      const param = this.params.byKnob(knob.param, this.currentLfoTarget);
      if (param) knob.setValue(this.params.read(this.engine, param));
    }
    this.faders.forEach((fader) => fader.sync());
    this.synth.buttonGroups.forEach((group) => this.renderButtonGroup(group));
    this.toggles.forEach((toggle) => this.renderToggle(toggle));
    this.renderFxLeds();
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
    toggleButton('arpPowerBtn', () => this.arp.enabled, (on) => this.notes.setArpEnabled(on), ['ARP ON', 'ARP OFF']);
    toggleButton('arpLatchBtn', () => this.arp.latch, (on) => this.notes.setLatch(on), ['LATCH', 'HOLD']);

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
