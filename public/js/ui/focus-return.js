/**
 * Focus goes back to the world after a click (Austin 2026-10-30: "the Enter/Return key is
 * the primary way I play ... if I pin a quest the next time I try to use enter it opens the
 * quest area instead of interacting with items on screen").
 *
 * A mouse click on a button leaves the browser's focus on it, and Enter presses a focused
 * button, so the next Enter repeated the click instead of reaching the nearest thing. The
 * 2012 client gave the keys back to the stage after every click on its chrome. So after a
 * pointer click on a HUD control, once whatever it opened has had a frame to take focus,
 * a control still holding focus lets it go.
 *
 * Kept: keyboard use (a key press, or Tab, never blurs; a click from the keyboard has
 * detail 0), text fields, selects and sliders, anything inside a modal window or dialog,
 * which keeps every key on purpose, and the menus a click opens to be steered by keys (the
 * verb menu, a stack's menu, the How many chooser). A control the click redrew and focused
 * again (the Quests card's Pin) lets go too.
 */

const CONTROL = 'button, [role="button"], [role="tab"], [role="menuitem"], a[href], summary, label';
const KEEPS_FOCUS = 'input, textarea, select, [contenteditable="true"], [contenteditable=""]';
const MODAL = 'dialog[open], [role="dialog"], [aria-modal="true"], .glitch-modal:not([hidden]), #verb-menu, #pack-popover, .count-pop';

/** PURE: should a pointer click on `target` hand focus back to the world afterwards? */
export function releasesFocus(target, { detail = 1 } = {}) {
  if (!target?.closest || detail === 0) return false;
  const control = target.closest(CONTROL);
  if (!control || target.closest(KEEPS_FOCUS)) return false;
  return !control.closest(MODAL);
}

/** Install on a document: after a mouse click on a HUD control, focus returns to the page. */
export function installFocusReturn(doc = globalThis.document, { raf = globalThis.requestAnimationFrame } = {}) {
  if (!doc?.addEventListener || doc.__focusReturn) return () => {};
  doc.__focusReturn = true;
  const onClick = (e) => {
    if (!releasesFocus(e.target, { detail: e.detail })) return;
    const later = typeof raf === 'function' ? raf : (fn) => setTimeout(fn, 16);
    // A frame later: whatever the click opened (a verb menu, a chooser, a dialog) may have
    // taken focus on purpose and keeps it; a plain control still holding focus lets go,
    // the clicked one or a copy of it the click drew again.
    later(() => {
      const active = doc.activeElement;
      if (!active || active === doc.body || !active.closest?.(CONTROL)) return;
      if (active.closest(KEEPS_FOCUS) || active.closest(MODAL)) return;
      active.blur();
    });
  };
  doc.addEventListener('click', onClick, true);
  return () => {
    doc.removeEventListener('click', onClick, true);
    delete doc.__focusReturn;
  };
}
