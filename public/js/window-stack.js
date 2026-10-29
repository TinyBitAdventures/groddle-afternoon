/**
 * The newest window on top (LAYERS3). The remake's panels, dialogs and offers each have a fixed
 * CSS z-index (the Map 40, side panels 35, the quest card 510, a feature's shade 74-82), so a
 * window opened later could open under one already up: the Magic Rock's offer (510) stayed over a
 * Map opened after it and covered its Shortcuts and destination controls.
 *
 * What the client does (tinyspeck/glitch-client, CC0):
 * - Dialog.start 326-344 adds every dialog through TSMainView.addView 394-442, which ends in
 *   addChild(DO): the newest dialog is the top child, over every dialog already up.
 * - Dialog.mouseDownInHeaderHandler 439-446 calls addView again: pressing on a dialog brings it
 *   back to the top. QuestsDialog.onEmergencyTick 336-347 shows the quest offer
 *   (QuestConversationUI) through the same addView.
 * - A full-screen view (BaseScreenView, the level-up, new-day and Giant screens) is added and
 *   changeDialogsZ 445-459 puts every dialog under it; a dialog added while one is open goes in
 *   under it too (addView 435-437).
 *
 * Remake: each window keeps its CSS z-index as a floor, and the open windows are restacked in the
 * order they opened (screens last): each one at least one above the one opened before it. A
 * window that is the only one open is back at its CSS value, so the rest of the page (the HUD,
 * the pack, toasts, screens) keeps its usual order. Pure ordering is `stackZ`; the DOM side
 * watches `hidden` and added nodes, and a press on a window raises it.
 */

/** The windows: game panels, modal cards and every feature dialog. */
export const WINDOW_SELECTOR = [
  '.map-panel',
  '.side-panel',
  '.glitch-modal',
  '.quest-dialogue',
  '.familiar-dialog',
  '.mail-panel',
  '.home-panel',
  '.rook-museum-exhibit',
  '[role="dialog"][aria-modal="true"]',
].join(', ');
/** Full-screen views (BaseScreenView): over every dialog, as changeDialogsZ puts them. */
export const SCREEN_SELECTOR = '.award-screen, .new-day-screen, .giant-screen';
/**
 * STARTCARD: the start card ("Welcome to a scrap of Ur", #overlay) is over everything while it is
 * up: over the windows and the screens, whatever opened after it. The remake's own card (the client
 * had none); game.js holds the screens, the familiar's panel and prompts until the player starts.
 */
export const START_CARD_SELECTOR = '#overlay';
/** Not windows: the docked prompt stack, the player menu, the pack's item card, the hotkey sheet. */
export const NOT_WINDOW_SELECTOR = '.prompt-stack, #player-menu, #pack-popover, .hotkeys-shade, .boot-loader';

/**
 * The z-index for each open window, in the order given (oldest first): each at least its own
 * CSS value and one above the window before it. `rows`: [{ base, screen, top }]; screens go after
 * every other window and the start card (`top`) after the screens (each group's order kept).
 * Returns the z values in the input's order.
 */
export function stackZ(rows) {
  const rank = (row) => (row.top ? 2 : row.screen ? 1 : 0);
  const order = rows
    .map((row, i) => ({ row, i }))
    .sort((a, b) => rank(a.row) - rank(b.row) || a.i - b.i);
  const out = new Array(rows.length);
  let prev = -Infinity;
  for (const { row, i } of order) {
    const base = Number.isFinite(Number(row.base)) ? Number(row.base) : 0;
    const z = Math.max(base, prev + 1);
    out[i] = z;
    prev = z;
  }
  return out;
}

/**
 * The window stack over `doc`. `install()` starts watching; `raise(el)` puts a window on top;
 * `top()` is the topmost open window; `topmost(list)` picks the topmost of some elements.
 */
export function createWindowStack({ doc = globalThis.document, onChange = null } = {}) {
  let seq = 0;
  const opened = new WeakMap();
  const isOpen = (el) => el.isConnected && !el.hidden && el.getClientRects().length > 0;
  const view = () => doc.defaultView || globalThis;

  /** The element that stacks: the outermost positioned, z-indexed ancestor (a shade round a card). */
  function stackingRoot(el) {
    let root = null;
    for (let e = el; e && e !== doc.body && e !== doc.documentElement; e = e.parentElement) {
      if (e.id === 'game-root') break;
      const cs = view().getComputedStyle(e);
      if (cs.position !== 'static' && cs.zIndex !== 'auto') root = e;
    }
    return root || el;
  }

  function windows() {
    const roots = new Set();
    for (const el of doc.querySelectorAll(`${WINDOW_SELECTOR}, ${SCREEN_SELECTOR}, ${START_CARD_SELECTOR}`)) {
      if (el.closest(NOT_WINDOW_SELECTOR)) continue;
      const root = stackingRoot(el);
      if (!root.closest(NOT_WINDOW_SELECTOR)) roots.add(root);
    }
    return [...roots];
  }

  /** The window's own z-index, without what the stack set on it. */
  function baseZ(el) {
    if (el.dataset.windowZ != null && el.style.zIndex === el.dataset.windowZ) el.style.zIndex = '';
    delete el.dataset.windowZ;
    const z = parseInt(view().getComputedStyle(el).zIndex, 10);
    return Number.isFinite(z) ? z : 0;
  }

  function restack() {
    const all = windows();
    const open = [];
    for (const el of all) {
      if (isOpen(el)) open.push(el);
      else if (el.dataset.windowZ != null) baseZ(el);
    }
    open.sort((a, b) => (opened.get(a) || 0) - (opened.get(b) || 0));
    const rows = open.map((el) => ({
      base: baseZ(el),
      screen: el.matches(SCREEN_SELECTOR) || Boolean(el.querySelector(SCREEN_SELECTOR)),
      top: el.matches(START_CARD_SELECTOR),
    }));
    const zs = stackZ(rows);
    open.forEach((el, i) => {
      if (zs[i] === rows[i].base) return;
      el.style.zIndex = String(zs[i]);
      el.dataset.windowZ = String(zs[i]);
    });
    onChange?.(open, zs);
    return open;
  }

  function raise(el) {
    if (!el) return;
    const root = stackingRoot(el);
    opened.set(root, ++seq);
    restack();
  }

  /** The topmost open window (the last restacked). */
  function top() {
    const open = restack();
    const zs = open.map((el) => parseInt(view().getComputedStyle(el).zIndex, 10) || 0);
    let best = null;
    let bestZ = -Infinity;
    open.forEach((el, i) => {
      if (zs[i] >= bestZ) {
        best = el;
        bestZ = zs[i];
      }
    });
    return best;
  }

  /** The topmost of `els` by their windows' stacking (document order breaks ties). */
  function topmost(els) {
    let best = null;
    let bestZ = -Infinity;
    for (const el of els) {
      const z = parseInt(view().getComputedStyle(stackingRoot(el)).zIndex, 10) || 0;
      if (z >= bestZ) {
        best = el;
        bestZ = z;
      }
    }
    return best;
  }

  let pending = false;
  const fresh = new Set();
  function schedule() {
    if (pending) return;
    pending = true;
    queueMicrotask(() => {
      pending = false;
      for (const el of fresh) {
        const root = stackingRoot(el);
        if (isOpen(root)) opened.set(root, ++seq);
      }
      fresh.clear();
      restack();
    });
  }

  function install() {
    const MO = view().MutationObserver;
    if (!MO || !doc.body) return null;
    const ANY = `${WINDOW_SELECTOR}, ${SCREEN_SELECTOR}`;
    const isWindow = (node) => node?.nodeType === 1 && node.matches(ANY) && !node.closest(NOT_WINDOW_SELECTOR);
    const windowsIn = (node) => (node?.nodeType !== 1 ? [] : isWindow(node) ? [node] : [...node.querySelectorAll(ANY)].filter(isWindow));
    const observer = new MO((records) => {
      let touched = false;
      for (const r of records) {
        if (r.type === 'attributes') {
          if (!isWindow(r.target)) continue;
          // Shown now (it was hidden): it opened, so it goes on top.
          if (!r.target.hidden && r.oldValue !== null) fresh.add(r.target);
          touched = true;
          continue;
        }
        for (const node of r.addedNodes) {
          const found = windowsIn(node);
          for (const el of found) fresh.add(el);
          if (found.length) touched = true;
        }
        // A window taken away lets the ones above it settle back.
        for (const node of r.removedNodes) if (!touched && windowsIn(node).length) touched = true;
      }
      if (touched) schedule();
    });
    observer.observe(doc.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['hidden'], attributeOldValue: true });
    // Dialog.mouseDownInHeaderHandler: a press on a window brings it to the top.
    doc.addEventListener('pointerdown', (e) => {
      const el = e.target?.closest?.(`${WINDOW_SELECTOR}, ${SCREEN_SELECTOR}`);
      if (!el || el.closest(NOT_WINDOW_SELECTOR)) return;
      const root = stackingRoot(el);
      if (top() !== root) raise(root);
    }, { capture: true });
    return observer;
  }

  return { install, raise, restack, top, topmost, stackingRoot };
}
