/**
 * ENVELOPE DISPLAY
 * Small SVG above the ADSR faders that draws the shape of the envelope the faders edit.
 * Time axis per stage like the faders: logarithmic between the stage's min and max, so short and
 * long times both stay readable. Attack, decay and release each get up to STAGE_WIDTH of the
 * width, the sustain plateau a fixed SUSTAIN_WIDTH.
 * EnvelopeDisplay.path() is pure (tested in Node); render() writes it into the SVG path.
 */

const ENV_DISPLAY_WIDTH = 200;
const ENV_DISPLAY_HEIGHT = 40;
const ENV_DISPLAY_PAD = 2;
const ENV_STAGE_WIDTH = 0.27;
const ENV_SUSTAIN_WIDTH = 0.19;
// Shortest drawn stage, so a 1 ms attack still shows as a slope
const ENV_MIN_STAGE_RATIO = 0.04;

class EnvelopeDisplay {
  /**
   * @param ranges { attack: [min, max], decay: [min, max], release: [min, max] } in seconds
   */
  constructor(svg, ranges) {
    this.svg = svg;
    this.ranges = ranges;
    this.shape = svg ? svg.querySelector('.env-shape') : null;
  }

  render(stages) {
    if (!this.shape || !stages) return;
    this.shape.setAttribute('d', EnvelopeDisplay.path(stages, this.ranges));
  }

  static stageWidth(time, [min, max]) {
    const ratio = Math.log(Math.max(min, time) / min) / Math.log(max / min);
    const clamped = Math.max(0, Math.min(1, ratio));
    return ENV_DISPLAY_WIDTH * ENV_STAGE_WIDTH * (ENV_MIN_STAGE_RATIO + (1 - ENV_MIN_STAGE_RATIO) * clamped);
  }

  /**
   * Closed SVG path: attack line up, decay and release as exponential-looking curves
   */
  static path({ attack, decay, sustain, release }, ranges) {
    const top = ENV_DISPLAY_PAD;
    const bottom = ENV_DISPLAY_HEIGHT - ENV_DISPLAY_PAD;
    const level = bottom - (bottom - top) * Math.max(0, Math.min(1, sustain));
    const round = (v) => Math.round(v * 10) / 10;

    const xA = EnvelopeDisplay.stageWidth(attack, ranges.attack);
    const xD = xA + EnvelopeDisplay.stageWidth(decay, ranges.decay);
    const xS = xD + ENV_DISPLAY_WIDTH * ENV_SUSTAIN_WIDTH;
    const xR = xS + EnvelopeDisplay.stageWidth(release, ranges.release);

    return [
      `M0 ${bottom}`,
      `L${round(xA)} ${top}`,
      `Q${round(xA)} ${round(level)} ${round(xD)} ${round(level)}`,
      `L${round(xS)} ${round(level)}`,
      `Q${round(xS)} ${bottom} ${round(xR)} ${bottom}`,
      'Z'
    ].join(' ');
  }
}

window.EnvelopeDisplay = EnvelopeDisplay;
