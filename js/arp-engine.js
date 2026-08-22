/**
 * RETROVOX SUB-1 • 16-STEP ARPEGGIATOR & SEQUENCER ENGINE
 * Rock-solid Web Audio API Lookahead Clock Scheduler with Zero Jitter.
 * Supports Patterns (Up, Down, Up/Down, Random, As-Played, 16-Step Seq),
 * Octave Range (1-4), Clock Divisions, Swing, Gate Length, Latch/Hold Mode,
 * and 16 Interactive Programmable Step Gates.
 */

class ArpEngine {
  constructor(audioEngine) {
    this.audio = audioEngine;
    
    // Parameters
    this.enabled = false;
    this.latch = false;
    this.mode = 'up'; // 'up', 'down', 'updown', 'random', 'asplayed', 'seq'
    this.octaves = 1; // 1 to 4
    this.bpm = 120;
    this.division = '1/16'; // '1/4', '1/8', '1/8t', '1/16', '1/16t', '1/32'
    this.gate = 0.75; // 0.1 to 1.0 (note duration ratio)
    this.swing = 0.0; // 0.0 to 0.7 (even step delay)

    // 16 Programmable Steps (true = active gate, false = rest/pause)
    this.steps = new Array(16).fill(true);

    // Note Tracking
    this.heldKeys = []; // Array of { midiNote, time } in order of pressing
    this.latchedKeys = [];
    this.currentSequence = []; // Array of calculated MIDI notes
    this.sequenceIndex = 0;
    this.currentStep = 0; // 0 to 15 (sequencer tracker)

    // Web Audio Lookahead Clock Timer (Web Worker + Main Thread Fallback)
    this.worker = null;
    this.isRunning = false;
    this.timerId = null;
    this.nextNoteTime = 0.0;
    this.lookahead = 20.0; // ms
    this.scheduleAheadTime = 0.1; // seconds

    // UI Callbacks
    this.onStep = null; // (stepIndex, midiNote) => void
    this.onNoteTrigger = null; // (midiNote) => void

    this.updownDirection = 1; // 1 = up, -1 = down

    this.initClockWorker();
  }

  /**
   * Initializes background Web Worker for rock-solid zero-jitter timing
   */
  initClockWorker() {
    try {
      const workerBlobCode = `
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
          } else if (e.data && e.data.interval) {
            interval = e.data.interval;
            if (timerId) {
              clearInterval(timerId);
              timerId = setInterval(function() {
                self.postMessage('tick');
              }, interval);
            }
          }
        };
      `;
      const blob = new Blob([workerBlobCode], { type: 'application/javascript' });
      this.worker = new Worker(URL.createObjectURL(blob));
      this.worker.onmessage = (e) => {
        if (e.data === 'tick' && this.enabled && this.isRunning) {
          this.scheduler();
        }
      };
    } catch (err) {
      console.warn('Web Worker Clock fallback to main thread timer:', err);
      this.worker = null;
    }
  }

  /**
   * Toggles the Arpeggiator On / Off
   */
  setEnabled(on) {
    this.enabled = !!on;
    if (this.enabled) {
      if (this.heldKeys.length > 0 || (this.latch && this.latchedKeys.length > 0)) {
        this.rebuildSequence();
        this.startClock();
      }
    } else {
      this.stopClock();
      this.audio.allNotesOff();
      if (this.onStep) this.onStep(-1);
    }
  }

  /**
   * Toggles Latch / Hold Mode
   */
  setLatch(on) {
    this.latch = !!on;
    if (!this.latch) {
      this.latchedKeys = [];
      if (this.heldKeys.length === 0) {
        this.stopClock();
        this.audio.allNotesOff();
        if (this.onStep) this.onStep(-1);
      }
    }
  }

  setMode(mode) {
    this.mode = mode;
    this.rebuildSequence();
  }

  setOctaves(oct) {
    this.octaves = Math.max(1, Math.min(4, parseInt(oct, 10)));
    this.rebuildSequence();
  }

  setBpm(bpm) {
    this.bpm = Math.max(40, Math.min(280, parseFloat(bpm)));
  }

  setDivision(div) {
    this.division = div;
  }

  setGate(gate) {
    this.gate = Math.max(0.1, Math.min(1.0, parseFloat(gate)));
  }

  setSwing(swing) {
    this.swing = Math.max(0.0, Math.min(0.7, parseFloat(swing)));
  }

  setStep(index, active) {
    if (index >= 0 && index < 16) {
      this.steps[index] = !!active;
    }
  }

  toggleStep(index) {
    if (index >= 0 && index < 16) {
      this.steps[index] = !this.steps[index];
      return this.steps[index];
    }
    return false;
  }

  /**
   * Handle Key Down from Keyboard / MIDI
   */
  handleKeyDown(midiNote) {
    if (!this.heldKeys.includes(midiNote)) {
      if (this.latch && this.heldKeys.length === 0) {
        // If latch is active and starting a new chord, replace latched keys
        this.latchedKeys = [];
      }
      this.heldKeys.push(midiNote);
      if (this.latch) {
        this.latchedKeys = [...this.heldKeys];
      }
      this.rebuildSequence();
      if (this.enabled) {
        this.startClock();
      }
    }
  }

  /**
   * Handle Key Up from Keyboard / MIDI
   */
  handleKeyUp(midiNote) {
    this.heldKeys = this.heldKeys.filter(n => n !== midiNote);
    if (!this.latch) {
      if (this.heldKeys.length === 0) {
        this.stopClock();
        this.audio.allNotesOff();
        if (this.onStep) this.onStep(-1);
      } else {
        this.rebuildSequence();
      }
    }
  }

  /**
   * Builds the note array based on held notes, mode, and octave range
   */
  rebuildSequence() {
    const sourceNotes = (this.latch && this.heldKeys.length === 0) ? this.latchedKeys : this.heldKeys;
    if (!sourceNotes || sourceNotes.length === 0) {
      this.currentSequence = [];
      return;
    }

    let baseNotes = [...sourceNotes];
    
    // Sort for pitch-based modes
    if (['up', 'down', 'updown'].includes(this.mode)) {
      baseNotes.sort((a, b) => a - b);
    }

    const multiOctaveNotes = [];
    for (let oct = 0; oct < this.octaves; oct++) {
      for (const note of baseNotes) {
        multiOctaveNotes.push(note + (oct * 12));
      }
    }

    switch (this.mode) {
      case 'up':
        this.currentSequence = multiOctaveNotes;
        break;

      case 'down':
        this.currentSequence = multiOctaveNotes.reverse();
        break;

      case 'updown': {
        const up = [...multiOctaveNotes];
        const down = [...multiOctaveNotes].reverse().slice(1, -1);
        this.currentSequence = up.concat(down);
        break;
      }

      case 'random':
      case 'asplayed':
      case 'seq':
      default:
        this.currentSequence = multiOctaveNotes;
        break;
    }

    if (this.sequenceIndex >= this.currentSequence.length) {
      this.sequenceIndex = 0;
    }
  }

  /**
   * Calculates the interval time for current division & BPM (in seconds)
   */
  getStepInterval(stepNum) {
    const beatSec = 60.0 / this.bpm;
    let baseSec = beatSec * 0.25; // 1/16th note default

    switch (this.division) {
      case '1/4': baseSec = beatSec; break;
      case '1/8': baseSec = beatSec * 0.5; break;
      case '1/8t': baseSec = (beatSec * 0.5) * (2 / 3); break;
      case '1/16': baseSec = beatSec * 0.25; break;
      case '1/16t': baseSec = (beatSec * 0.25) * (2 / 3); break;
      case '1/32': baseSec = beatSec * 0.125; break;
    }

    // Apply Swing on odd steps (1, 3, 5...)
    if (this.swing > 0.01) {
      if (stepNum % 2 === 1) {
        return baseSec * (1.0 - (this.swing * 0.45));
      } else {
        return baseSec * (1.0 + (this.swing * 0.45));
      }
    }

    return baseSec;
  }

  /**
   * Starts the High-Precision Lookahead Clock Scheduler
   */
  startClock() {
    if (this.isRunning) return;
    if (!this.audio.ctx) {
      this.audio.initAudio();
    }

    this.isRunning = true;
    this.nextNoteTime = this.audio.ctx.currentTime + 0.01;
    this.currentStep = 0;
    this.sequenceIndex = 0;

    if (this.worker) {
      this.worker.postMessage('start');
    } else {
      const tick = () => {
        if (!this.enabled || !this.isRunning) return;
        this.scheduler();
        this.timerId = setTimeout(tick, this.lookahead);
      };
      this.timerId = setTimeout(tick, 0);
    }
  }

  stopClock() {
    this.isRunning = false;
    if (this.worker) {
      this.worker.postMessage('stop');
    }
    if (this.timerId) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }
    this.currentStep = 0;
    this.sequenceIndex = 0;
  }

  /**
   * Schedules note events within lookahead window
   */
  scheduler() {
    if (!this.audio.ctx) return;

    while (this.nextNoteTime < this.audio.ctx.currentTime + this.scheduleAheadTime) {
      this.scheduleNote(this.nextNoteTime, this.currentStep);
      const stepDuration = this.getStepInterval(this.currentStep);
      this.nextNoteTime += stepDuration;
      this.currentStep = (this.currentStep + 1) % 16;
    }
  }

  scheduleNote(time, stepIndex) {
    if (this.currentSequence.length === 0) return;

    // Pick note based on mode
    let midiNote;
    if (this.mode === 'random') {
      const randIdx = Math.floor(Math.random() * this.currentSequence.length);
      midiNote = this.currentSequence[randIdx];
    } else {
      midiNote = this.currentSequence[this.sequenceIndex % this.currentSequence.length];
      this.sequenceIndex++;
    }

    const isStepActive = this.steps[stepIndex];
    const duration = this.getStepInterval(stepIndex) * this.gate;

    if (isStepActive && midiNote !== undefined) {
      // Schedule Audio Trigger
      const delayMs = Math.max(0, (time - this.audio.ctx.currentTime) * 1000);

      setTimeout(() => {
        if (this.enabled && (this.heldKeys.length > 0 || (this.latch && this.latchedKeys.length > 0))) {
          this.audio.noteOn(midiNote, 0.9);
          if (this.onNoteTrigger) this.onNoteTrigger(midiNote);
        }
      }, delayMs);

      setTimeout(() => {
        if (this.enabled) {
          this.audio.noteOff(midiNote);
        }
      }, delayMs + (duration * 1000));
    }

    // Schedule UI LED Visualizer callback
    const visualDelayMs = Math.max(0, (time - this.audio.ctx.currentTime) * 1000);
    setTimeout(() => {
      if (this.enabled && this.onStep) {
        this.onStep(stepIndex, isStepActive ? midiNote : null);
      }
    }, visualDelayMs);
  }
}

window.ArpEngine = ArpEngine;
