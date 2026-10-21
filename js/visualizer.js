/**
 * RETROVOX SUB-1 • CRT OSCILLOSCOPE, VU METERS & SPEAKER WOOFERS
 * requestAnimationFrame loop fed by the master AnalyserNode. After 15 silent frames the heavy
 * drawing pauses until sound returns, to save CPU/GPU battery.
 */

class Visualizer {
  /**
   * elements: { canvas, lfoRateLed, wooferLeft, wooferRight, vuMeterL, vuMeterR }
   * getLfoRate(): rate in Hz of the LFO shown in the panel (drives the pulsing LED)
   */
  constructor(engine, elements, getLfoRate) {
    this.engine = engine;
    this.canvas = elements.canvas;
    this.lfoRateLed = elements.lfoRateLed;
    this.wooferLeft = elements.wooferLeft;
    this.wooferRight = elements.wooferRight;
    this.ledsL = elements.vuMeterL ? Array.from(elements.vuMeterL.querySelectorAll('.led')) : [];
    this.ledsR = elements.vuMeterR ? Array.from(elements.vuMeterR.querySelectorAll('.led')) : [];
    this.getLfoRate = getLfoRate;
    this.lastActiveVuCount = -1;
    this.lastWooferScale = 1.0;
  }

  start() {
    if (!this.canvas) return;
    this.ctx2d = this.canvas.getContext('2d');
    this.width = this.canvas.width;
    this.height = this.canvas.height;
    this.bufferLength = 256;
    this.timeData = new Uint8Array(this.bufferLength);
    this.idleFrames = 0;
    this.isIdle = false;

    this.tick = this.tick.bind(this);
    this.tick();
  }

  tick() {
    requestAnimationFrame(this.tick);

    this.updateLfoLed();

    const rms = this.readRms();
    const hasActiveVoices = Boolean(this.engine.activeVoices && this.engine.activeVoices.size > 0);
    const isSounding = rms > 1.2 || hasActiveVoices;

    if (!isSounding) {
      this.idleFrames++;
      if (this.idleFrames > 15) {
        if (!this.isIdle) {
          this.enterIdle();
        }
        return;
      }
    } else {
      this.idleFrames = 0;
      this.isIdle = false;
    }

    this.drawFrame(rms);
  }

  updateLfoLed() {
    if (!this.lfoRateLed) return;
    const timeSec = performance.now() * 0.001;
    const activeLfoRate = this.getLfoRate();
    const phase = (timeSec * activeLfoRate * Math.PI * 2) % (Math.PI * 2);
    const intensity = Math.sin(phase) > 0 ? 1 : 0.15;
    this.lfoRateLed.style.opacity = intensity;
    if (intensity > 0.5) {
      this.lfoRateLed.classList.add('pulsing');
    } else {
      this.lfoRateLed.classList.remove('pulsing');
    }
  }

  readRms() {
    if (!this.engine.analyser || !this.engine.isPowered) return 0;
    this.engine.analyser.getByteTimeDomainData(this.timeData);

    let sum = 0;
    for (let i = 0; i < this.bufferLength; i++) {
      const diff = Math.abs(this.timeData[i] - 128);
      sum += diff * diff;
    }
    return Math.sqrt(sum / this.bufferLength);
  }

  enterIdle() {
    this.isIdle = true;
    this.drawGrid();
    this.drawFlatLine();

    if (this.lastWooferScale !== 1.0) {
      this.wooferLeft.style.transform = 'scale(1)';
      this.wooferRight.style.transform = 'scale(1)';
      this.lastWooferScale = 1.0;
    }
    this.updateVuMeter(0);
  }

  drawFrame(rms) {
    this.drawGrid();

    if (this.engine.analyser && this.engine.isPowered) {
      this.drawWaveform();
    } else {
      this.drawFlatLine();
    }

    const targetScale = rms > 2 ? 1 + Math.min(0.08, rms * 0.002) : 1.0;
    this.updateWoofers(targetScale);
    this.updateVuMeter(rms);
  }

  drawGrid() {
    const { ctx2d: ctx, width, height } = this;
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
  }

  drawWaveform() {
    const { ctx2d: ctx, width, height, bufferLength, timeData } = this;
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
  }

  drawFlatLine() {
    const { ctx2d: ctx, width, height } = this;
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = '#00ff8844';
    ctx.beginPath();
    ctx.moveTo(0, height / 2);
    ctx.lineTo(width, height / 2);
    ctx.stroke();
  }

  updateWoofers(scale) {
    if (Math.abs(scale - this.lastWooferScale) > 0.003) {
      this.wooferLeft.style.transform = `scale(${scale})`;
      this.wooferRight.style.transform = `scale(${scale})`;
      this.lastWooferScale = scale;
    }
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

window.Visualizer = Visualizer;
