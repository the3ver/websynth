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
    if (el) el.addEventListener('input', (e) => handler(parseFloat(/** @type {HTMLInputElement} */ (e.target).value)));
    return el;
  },

  /**
   * Browsers fire no click for a tap while another finger is down (a multi-touch gesture): with a key held on
   * the keybed, tabs and buttons would not react. A tap on a <button> or a <label> (toggles such as GLIDE; its
   * click() switches the input) that shared the screen with another finger
   * at any moment becomes a click here, and the browser's own click is cancelled (preventDefault on touchend) so
   * toggles do not flip twice. A lone tap keeps the browser's click. Moving more than TAP_SLOP px is no tap.
   */
  installMultiTouchTaps() {
    const TAP_SLOP = 10;
    const taps = new Map(); // touch identifier -> { button, x, y, shared }
    const buttonOf = (target) => (target && target.closest ? target.closest('button, label') : null);

    window.addEventListener(
      'touchstart',
      (e) => {
        // All fingers new: a new gesture, so entries whose touchend never reached window (button removed) are stale
        if (e.touches.length === e.changedTouches.length) taps.clear();
        const shared = e.touches.length > 1;
        if (shared) for (const tap of taps.values()) tap.shared = true;
        for (const touch of Array.from(e.changedTouches)) {
          taps.delete(touch.identifier); // identifiers are reused
          const button = buttonOf(touch.target);
          if (button) taps.set(touch.identifier, { button, x: touch.clientX, y: touch.clientY, shared });
        }
      },
      { passive: true }
    );
    window.addEventListener(
      'touchmove',
      (e) => {
        for (const touch of Array.from(e.changedTouches)) {
          const tap = taps.get(touch.identifier);
          if (tap && Math.hypot(touch.clientX - tap.x, touch.clientY - tap.y) > TAP_SLOP) taps.delete(touch.identifier);
        }
      },
      { passive: true }
    );
    window.addEventListener(
      'touchend',
      (e) => {
        for (const touch of Array.from(e.changedTouches)) {
          const tap = taps.get(touch.identifier);
          taps.delete(touch.identifier);
          if (!tap || !tap.shared) continue;
          e.preventDefault();
          tap.button.click();
        }
      },
      { passive: false }
    );
    window.addEventListener('touchcancel', (e) => {
      for (const touch of Array.from(e.changedTouches)) taps.delete(touch.identifier);
    });
  }
};

window.DomUtils = DomUtils;
