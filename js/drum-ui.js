/**
 * RETROBEAT D-909 • ANALOG DRUM & BASS UI CONTROLLER
 * Manages the slide-in hardware rack unit, 16-step matrix, track dials,
 * mute/solo buttons, kits, patterns, and master sync controls.
 */

class DrumUI {
  constructor(drumEngine, arpEngine, audioEngine) {
    this.drum = drumEngine;
    this.arp = arpEngine;
    this.audio = audioEngine;

    // Tap Tempo Tracker
    this.tapTimes = [];

    // DOM Element References
    this.drawer = document.getElementById('drumDrawer');
    this.drawerTab = document.getElementById('drumDrawerTab');
    this.openDrawerBtn = document.getElementById('openDrumDrawerBtn');
    this.closeDrawerBtn = document.getElementById('closeDrumDrawerBtn');

    this.playBtn = document.getElementById('drumPlayBtn');
    this.bpmInput = document.getElementById('drumBpmInput');
    this.bpmUpBtn = document.getElementById('drumBpmUpBtn');
    this.bpmDownBtn = document.getElementById('drumBpmDownBtn');
    this.tapBtn = document.getElementById('drumTapBtn');
    this.swingKnob = document.getElementById('drumSwingKnob');
    this.volumeSlider = document.getElementById('drumVolumeSlider');
    this.kitSelect = document.getElementById('drumKitSelect');
    this.clearBtn = document.getElementById('drumClearBtn');
    this.syncToggleBtn = document.getElementById('drumSyncToggleBtn');

    // Step Matrix Grid Containers
    this.gridContainer = document.getElementById('drumStepMatrix');
    this.bassNotesContainer = document.getElementById('bassNoteRow');
    this.stepLedContainer = document.getElementById('drumStepLeds');

    this.stepButtons = []; // [trackIdx][stepIdx]
    this.stepLeds = [];
    this.bassNoteButtons = [];

    this.isOpen = false;

    this.initDrawer();
    this.initTransport();
    this.initMatrix();
    this.initTrackControls();
    this.initBassControls();
    this.initKits();
    this.initSync();
  }

  // =========================================================================
  // 1. DRAWER SLIDE-IN / OUT MECHANISM
  // =========================================================================

  initDrawer() {
    const toggleDrawer = () => {
      this.isOpen = !this.isOpen;
      if (this.drawer) {
        this.drawer.classList.toggle('open', this.isOpen);
      }
      if (this.drawerTab) {
        this.drawerTab.classList.toggle('active', this.isOpen);
      }
      if (this.openDrawerBtn) {
        this.openDrawerBtn.classList.toggle('active', this.isOpen);
      }
    };

    if (this.drawerTab) this.drawerTab.addEventListener('click', toggleDrawer);
    if (this.openDrawerBtn) this.openDrawerBtn.addEventListener('click', toggleDrawer);
    if (this.closeDrawerBtn) this.closeDrawerBtn.addEventListener('click', () => {
      this.isOpen = false;
      if (this.drawer) this.drawer.classList.remove('open');
      if (this.drawerTab) this.drawerTab.classList.remove('active');
      if (this.openDrawerBtn) this.openDrawerBtn.classList.remove('active');
    });

    // Keyboard shortcut: Shift + D toggles Drum Machine
    window.addEventListener('keydown', (e) => {
      if (e.shiftKey && (e.code === 'KeyD' || e.key === 'D')) {
        if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
          e.preventDefault();
          toggleDrawer();
        }
      }
    });
  }

  // =========================================================================
  // 2. MASTER TRANSPORT & CLOCK
  // =========================================================================

  initTransport() {
    // Play / Stop Button
    if (this.playBtn) {
      this.playBtn.addEventListener('click', (e) => {
        this.drum.togglePlay();
        DomUtils.blurTarget(e);
      });
    }

    this.drum.onPlayStateChange = (isPlaying) => {
      if (this.playBtn) {
        this.playBtn.classList.toggle('active', isPlaying);
        const icon = this.playBtn.querySelector('.btn-icon');
        const text = this.playBtn.querySelector('.btn-text');
        if (icon) icon.textContent = isPlaying ? '⏹' : '▶';
        if (text) text.textContent = isPlaying ? 'STOP' : 'START';
      }
      if (this.drawerTab) {
        const tabLed = this.drawerTab.querySelector('.tab-pulse-led');
        if (tabLed) tabLed.classList.toggle('running', isPlaying);
      }
    };

    // Live Step Tracker (LED Running Lights)
    this.drum.onStep = (stepIndex) => {
      this.stepLeds.forEach((led, idx) => {
        if (idx === stepIndex) {
          led.classList.add('active');
        } else {
          led.classList.remove('active');
        }
      });
      // Flash tab pulse LED on beat 1 (step 0, 4, 8, 12)
      if (this.drawerTab && (stepIndex % 4 === 0)) {
        const tabLed = this.drawerTab.querySelector('.tab-pulse-led');
        if (tabLed) {
          tabLed.classList.add('flash');
          setTimeout(() => tabLed.classList.remove('flash'), 80);
        }
      }
    };

    // BPM Display & Adjustment
    if (this.bpmInput) {
      this.bpmInput.value = this.drum.bpm;
      this.bpmInput.addEventListener('change', (e) => {
        this.drum.setBpm(e.target.value);
        this.bpmInput.value = this.drum.bpm;
        if (this.arp && this.arp.syncMode === 'external') {
          this.arp.setBpm(this.drum.bpm);
        }
        e.target.blur();
      });
    }

    if (this.bpmUpBtn) {
      this.bpmUpBtn.addEventListener('click', (e) => {
        this.drum.setBpm(this.drum.bpm + 1);
        if (this.bpmInput) this.bpmInput.value = this.drum.bpm;
        DomUtils.blurTarget(e);
      });
    }

    if (this.bpmDownBtn) {
      this.bpmDownBtn.addEventListener('click', (e) => {
        this.drum.setBpm(this.drum.bpm - 1);
        if (this.bpmInput) this.bpmInput.value = this.drum.bpm;
        DomUtils.blurTarget(e);
      });
    }

    // Tap Tempo
    if (this.tapBtn) {
      this.tapBtn.addEventListener('click', (e) => {
        const now = Date.now();
        this.tapTimes.push(now);
        if (this.tapTimes.length > 4) this.tapTimes.shift();

        if (this.tapTimes.length >= 2) {
          const diffs = [];
          for (let i = 1; i < this.tapTimes.length; i++) {
            diffs.push(this.tapTimes[i] - this.tapTimes[i - 1]);
          }
          const avgDiff = diffs.reduce((a, b) => a + b, 0) / diffs.length;
          const calculatedBpm = Math.round(60000 / avgDiff);
          if (calculatedBpm >= 40 && calculatedBpm <= 300) {
            this.drum.setBpm(calculatedBpm);
            if (this.bpmInput) this.bpmInput.value = this.drum.bpm;
          }
        }
        DomUtils.blurTarget(e);
      });
    }

    // Swing Knob / Slider
    if (this.swingKnob) {
      this.swingKnob.addEventListener('input', (e) => {
        this.drum.setSwing(parseFloat(e.target.value));
        const readout = document.getElementById('drumSwingReadout');
        if (readout) readout.textContent = `${Math.round(this.drum.swing * 100)}%`;
      });
      this.swingKnob.addEventListener('change', (e) => e.target.blur());
    }

    // Master Volume
    if (this.volumeSlider) {
      this.volumeSlider.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        this.drum.setVolume(val);
        const readout = document.getElementById('drumVolReadout');
        if (readout) readout.textContent = `${Math.round(val * 100)}%`;
      });
      this.volumeSlider.addEventListener('change', (e) => e.target.blur());
    }
  }

  // =========================================================================
  // 3. STEP MATRIX & 16-STEP SEQUENCER RENDERING
  // =========================================================================

  initMatrix() {
    if (!this.gridContainer) return;

    // Track names & color groups
    const trackNames = ['BD', 'SD', 'CH', 'OH', 'CP', '303 BASS'];
    const trackColors = ['#ff3366', '#ff9900', '#ffea00', '#ffea00', '#00e5ff', '#39ff14'];
    const stepColorGroups = ['red', 'red', 'red', 'red', 'orange', 'orange', 'orange', 'orange', 'yellow', 'yellow', 'yellow', 'yellow', 'white', 'white', 'white', 'white'];

    // 1. Build Top LED Step Indicators
    if (this.stepLedContainer) {
      this.stepLedContainer.innerHTML = '';
      for (let s = 0; s < 16; s++) {
        const led = document.createElement('div');
        led.className = `drum-step-led group-${stepColorGroups[s]}`;
        led.dataset.step = s;
        led.innerHTML = `<span>${s + 1}</span>`;
        this.stepLedContainer.appendChild(led);
        this.stepLeds.push(led);
      }
    }

    // 2. Build 6-Track Step Matrix
    this.gridContainer.innerHTML = '';
    this.stepButtons = [];

    for (let t = 0; t < 6; t++) {
      const trackRow = document.createElement('div');
      trackRow.className = 'drum-track-row';
      trackRow.dataset.track = t;

      // Track Header (Mute, Solo, Name, Vol)
      const header = document.createElement('div');
      header.className = 'track-row-header';
      header.innerHTML = `
        <div class="track-tag" style="border-left: 3px solid ${trackColors[t]};">${trackNames[t]}</div>
        <div class="track-toggles">
          <button class="track-btn mute-btn" data-track="${t}" title="Mute Track">M</button>
          <button class="track-btn solo-btn" data-track="${t}" title="Solo Track">S</button>
        </div>
      `;
      trackRow.appendChild(header);

      // 16 Step Buttons
      const stepGrid = document.createElement('div');
      stepGrid.className = 'track-step-grid';
      const rowButtons = [];

      for (let s = 0; s < 16; s++) {
        const btn = document.createElement('button');
        btn.className = `step-btn group-${stepColorGroups[s]}`;
        btn.dataset.track = t;
        btn.dataset.step = s;

        this.renderStepButton(btn, this.drum.getStepState(t, s));

        btn.addEventListener('click', (e) => {
          this.renderStepButton(btn, this.drum.toggleStep(t, s));
          DomUtils.blurTarget(e);
        });

        stepGrid.appendChild(btn);
        rowButtons.push(btn);
      }

      this.stepButtons.push(rowButtons);
      trackRow.appendChild(stepGrid);
      this.gridContainer.appendChild(trackRow);
    }
  }

  // =========================================================================
  // 4. TRACK MUTES, SOLOS & ROTARY PARAMETERS
  // =========================================================================

  initTrackControls() {
    document.querySelectorAll('.mute-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        btn.classList.toggle('active', this.drum.toggleTrackMute(parseInt(btn.dataset.track, 10)));
        DomUtils.blurTarget(e);
      });
    });

    document.querySelectorAll('.solo-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        btn.classList.toggle('active', this.drum.toggleTrackSolo(parseInt(btn.dataset.track, 10)));
        DomUtils.blurTarget(e);
      });
    });

    this.bindParamInputs([
      ['drumBdDecay', 'bd', 'decay'],
      ['drumBdDrive', 'bd', 'drive'],
      ['drumSdSnappy', 'sd', 'snappy'],
      ['drumSdTune', 'sd', 'tune'],
      ['drumHhDecay', 'hh', 'openDecay']
    ]);
  }

  /**
   * Binds range inputs to drum engine sound parameters: [elementId, voice, key]
   */
  bindParamInputs(bindings) {
    for (const [id, voice, key] of bindings) {
      DomUtils.onRangeInput(id, (val) => this.drum.setParam(voice, key, val));
    }
  }

  // =========================================================================
  // 5. 303 ACID BASSLINE CONTROLS
  // =========================================================================

  initBassControls() {
    this.bindParamInputs([
      ['drumBassCutoff', 'bass', 'cutoff'],
      ['drumBassReso', 'bass', 'resonance'],
      ['drumBassEnvMod', 'bass', 'envMod']
    ]);

    const bassWaveBtn = document.getElementById('drumBassWaveBtn');
    if (bassWaveBtn) {
      bassWaveBtn.addEventListener('click', (e) => {
        const nextWave = this.drum.toggleBassWave();
        bassWaveBtn.textContent = nextWave === 'sawtooth' ? 'SAW' : 'SQR';
        bassWaveBtn.classList.toggle('active', nextWave === 'square');
        DomUtils.blurTarget(e);
      });
    }
  }

  // =========================================================================
  // 6. FACTORY KITS & PATTERNS
  // =========================================================================

  initKits() {
    if (this.kitSelect) {
      this.kitSelect.innerHTML = '';
      this.drum.factoryKits.forEach((kit) => {
        const opt = document.createElement('option');
        opt.value = kit.id;
        opt.textContent = `${kit.name} (${kit.bpm} BPM)`;
        this.kitSelect.appendChild(opt);
      });

      this.kitSelect.addEventListener('change', (e) => {
        this.drum.loadKit(e.target.value);
        if (this.bpmInput) this.bpmInput.value = this.drum.bpm;
        if (this.swingKnob) this.swingKnob.value = this.drum.swing;
        const swingReadout = document.getElementById('drumSwingReadout');
        if (swingReadout) swingReadout.textContent = `${Math.round(this.drum.swing * 100)}%`;

        this.refreshMatrixUI();
        DomUtils.blurTarget(e);
      });
    }

    if (this.clearBtn) {
      this.clearBtn.addEventListener('click', (e) => {
        this.drum.clearPattern();
        this.refreshMatrixUI();
        DomUtils.blurTarget(e);
      });
    }
  }

  renderStepButton(btn, state) {
    btn.classList.toggle('active', state === 1);
    btn.classList.toggle('accent', state === 2);
  }

  refreshMatrixUI() {
    this.stepButtons.forEach((row, t) => {
      row.forEach((btn, s) => this.renderStepButton(btn, this.drum.getStepState(t, s)));
    });
  }

  // =========================================================================
  // 7. MASTER CLOCK SYNCHRONIZATION WITH RETROVOX SYNTHESIZER
  // =========================================================================

  initSync() {
    if (this.arp && this.drum) {
      // Register Synth Arp as sync slave on the Drum Engine
      this.drum.registerSyncSlave(this.arp);
    }

    // Drum Machine Sync Master Status Button
    if (this.syncToggleBtn && this.arp) {
      const renderSyncBtn = (mode) => {
        this.syncToggleBtn.classList.toggle('active', mode === 'external');
        this.syncToggleBtn.textContent = mode === 'external' ? 'SYNC: MASTER' : 'SYNC: OFF';
      };
      renderSyncBtn(this.arp.syncMode);
      this.arp.onSyncModeChange(renderSyncBtn);

      this.syncToggleBtn.addEventListener('click', (e) => {
        this.arp.toggleSyncMode();
        DomUtils.blurTarget(e);
      });
    }
  }
}

// Global Export
window.DrumUI = DrumUI;
