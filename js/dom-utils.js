/**
 * RETROVOX SUB-1 • SHARED DOM HELPERS
 */

const DomUtils = {
  /**
   * Drops focus after a click or select, so musical hotkeys keep reaching the keyboard handler.
   */
  blurTarget(e) {
    if (e && e.target && e.target.blur) e.target.blur();
  },

  /**
   * Adds an 'input' listener that passes the parsed float value; skips missing elements.
   */
  onRangeInput(id, handler) {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', (e) => handler(parseFloat(e.target.value)));
    return el;
  }
};

window.DomUtils = DomUtils;
