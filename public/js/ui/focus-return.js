/**
 * Focus goes back to the world after a click (Austin 2026-10-30: "the Enter/Return key is
 * the primary way I play ... if I pin a quest the next time I try to use enter it opens the
 * quest area instead of interacting with items on screen").
 *
 * A mouse click on a button leaves the browser's focus on it, and Enter presses a focused
 * button, so the next Enter repeated the click instead of reaching the nearest thing. The
 * 2012 client gave the keys back to the stage after every click on its chrome. So after a
 * pointer click on a HUD control, once whatever it opened has had a frame to take focus,
 * a control still holding focus gives it to the world (the canvas, role=application; its
 * ring is hidden, tests/canvas-focus-ring.test.js).
 *
 * Kept: keyboard use (a key press, or Tab, never moves focus; a click from the keyboard has
 * detail 0), text fields, selects and sliders, anything inside a modal window or dialog,
 * which keeps every key on purpose, and the menus a click opens to be steered by keys (the
 * verb menu, a stack's menu, the How many chooser). A control the click redrew and focused
 * again (the Quests card's Pin) lets go too. A focusable thing that is not a control (the
 * clock that opens the hi sign board) opts in with data-click-releases.
 *
 * Closing (Austin 2026-11-03: clicked the street name, Esc closed the Map, and focus went back to
 * the street name with a ring round it, so Space opened the Map again instead of jumping): a
 * window that gives focus back to what opened it on close does it with focusBack(opener). The
 * opener gets it only when the keyboard opened and closed it (Tab and Enter, then Esc: where a
 * keyboard player was); after a mouse or touch open, or a close by the pointer (its close button),
 * the world gets the keys, so Space jumps and the arrows walk. installFocusReturn tracks how each
 * control was last pressed (pointerdown or a key on it) and the last input of all.
 */

const CONTROL = 'button, [role="button"], [role="tab"], [role="menuitem"], a[href], summary, label, [data-click-releases]';
const KEEPS_FOCUS = 'input, textarea, select, [contenteditable="true"], [contenteditable=""]';
const MODAL = 'dialog[open], [role="dialog"], [aria-modal="true"], .glitch-modal:not([hidden]), #verb-menu, #pack-popover, .count-pop';
/** The world: the game's canvas (game.js main: role=application, tabIndex 0). */
export const WORLD_SELECTOR = '#game-root > canvas[role="application"]';
/** Keys that say nothing about how the player is playing (a screenshot chord, Caps Lock). */
const MODIFIERS = new Set(['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'Fn', 'OS', 'AltGraph']);

/** PURE: should a pointer click on `target` hand focus back to the world afterwards? */
export function releasesFocus(target, { detail = 1 } = {}) {
  if (!target?.closest || detail === 0) return false;
  const control = target.closest(CONTROL);
  if (!control || target.closest(KEEPS_FOCUS)) return false;
  return !control.closest(MODAL);
}

/** The pressed-by record installFocusReturn keeps on a document, or null when not installed. */
function intentOf(doc) {
  return doc?.__inputIntent || null;
}

/** The element a press counts for: the control round the target, or the target itself. */
function pressedEl(target) {
  return target?.closest?.(CONTROL) || target || null;
}

/** How `el` was last pressed: 'pointer', 'keyboard', or '' (never, or tracking not installed). */
export function pressedBy(el, doc = el?.ownerDocument || globalThis.document) {
  const intent = intentOf(doc);
  if (!intent || !el) return '';
  return intent.pressed.get(el) || '';
}

/** The player's last input: 'pointer', 'keyboard', or '' (nothing yet, or not installed). */
export function lastInput(doc = globalThis.document) {
  return intentOf(doc)?.last || '';
}

/**
 * PURE: where focus goes when a window closes: 'opener' (a keyboard open and close) or 'world'
 * (the opener was pressed with the pointer, the close was a pointer's, or there is no opener).
 * @param {{ opener?: boolean, openerPressed?: string, last?: string }} how
 */
export function focusBackTarget({ opener = true, openerPressed = '', last = '' } = {}) {
  if (!opener) return 'world';
  if (openerPressed === 'pointer' || last === 'pointer') return 'world';
  return 'opener';
}

/** Gives the keys to the world (focus on the canvas; without one, whatever has focus lets go). */
export function focusWorld(doc = globalThis.document) {
  const world = doc?.querySelector?.(WORLD_SELECTOR);
  if (world && world.isConnected !== false && typeof world.focus === 'function') {
    world.focus({ preventScroll: true });
    return world;
  }
  const active = doc?.activeElement;
  if (active && active !== doc.body) active.blur?.();
  return null;
}

/**
 * A window closing gives focus back: to `opener` after a keyboard open and close, otherwise to the
 * world. `byOpener: false` leaves out how the opener was last pressed (for a place focus goes that
 * did not open anything: the street map's show button). Returns 'opener', 'world' or ''.
 */
export function focusBack(opener, { doc = opener?.ownerDocument || globalThis.document, byOpener = true } = {}) {
  const live = Boolean(opener && opener.isConnected !== false && typeof opener.focus === 'function');
  const to = focusBackTarget({ opener: live, openerPressed: byOpener && live ? pressedBy(opener, doc) : '', last: lastInput(doc) });
  if (to === 'opener') {
    opener.focus({ preventScroll: true });
    return 'opener';
  }
  // No opener and nothing pressed yet (tracking off): leave focus as it is, as before.
  if (!live && !intentOf(doc)) return '';
  focusWorld(doc);
  return 'world';
}

/**
 * Install on a document: after a mouse click on a HUD control, focus returns to the world; and the
 * document remembers how each control was last pressed, for focusBack.
 */
export function installFocusReturn(doc = globalThis.document, { raf = globalThis.requestAnimationFrame } = {}) {
  if (!doc?.addEventListener || doc.__focusReturn) return () => {};
  doc.__focusReturn = true;
  const intent = { last: '', pressed: new WeakMap() };
  doc.__inputIntent = intent;
  const note = (kind, target) => {
    intent.last = kind;
    const el = pressedEl(target);
    if (el && typeof el === 'object') intent.pressed.set(el, kind);
  };
  const onPointer = (e) => note('pointer', e.target);
  const onKey = (e) => {
    if (MODIFIERS.has(e.key)) return;
    note('keyboard', e.target);
  };
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
      focusWorld(doc);
    });
  };
  // On the window, capturing: ahead of the panels that stop a key or a press on its way down.
  const win = doc.defaultView?.addEventListener ? doc.defaultView : doc;
  win.addEventListener('pointerdown', onPointer, true);
  win.addEventListener('keydown', onKey, true);
  doc.addEventListener('click', onClick, true);
  return () => {
    win.removeEventListener('pointerdown', onPointer, true);
    win.removeEventListener('keydown', onKey, true);
    doc.removeEventListener('click', onClick, true);
    delete doc.__focusReturn;
    delete doc.__inputIntent;
  };
}
