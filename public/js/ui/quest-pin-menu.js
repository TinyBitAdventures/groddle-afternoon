/**
 * PINMENU (Austin 2026-11-01): the small menu a pinned quest's row opens in the tracker
 * (js/ui/quest-tracker.js), so a pin comes off on purpose and never by a stray click:
 * right-click (or Ctrl+click on a Mac), the Menu key or Shift+F10 on a focused row, or a long
 * press on touch opens it; only its Unpin row unpins. "Open in Quests" does what a plain click
 * on the row does. A left click on the row is unchanged (it opens Quests on that quest).
 *
 * It is drawn with the verb menu's rows (js/ui/verb-menu.js: key caps 1 and 2, the footer line
 * that says what a row does, Up/Down or W/S, Home/End, 1-2 pick) in the verb menu's card look.
 * Esc, Tab or a press anywhere else closes it. Opened from the keys, focus goes back to the
 * row it came from; opened by the pointer, focus goes back to the world, as after any click
 * on the HUD (js/ui/focus-return.js: Enter stays the world's, Austin 2026-10-30).
 * Every key pressed in it stays out of the game (Space would jump, Enter would run a verb).
 *
 * The original client's QuestTracker (glitch-client com/tinyspeck/engine/view/ui/quest/
 * QuestTracker.as 69-80) had its own "Unpin" button, but only the god/debug chat
 * (ChatGodDebug.as) ever opened it; the remake's tracker is the HUD mock's, so its menu is too.
 * Modern only: Classic has no tracker (the .quest-pins card shows under data-ui="modern" alone).
 *
 * QA: canvas data questPinMenu (the open row's quest id, "" when closed).
 */

import { bindVerbMenu, focusVerbRow, lockVerbMenuSize, makeVerbRow, verbMenuKey } from './verb-menu.js?v=74b6dfa0';

/** How long a finger holds a row before the menu opens, and how far it may drift. */
export const LONG_PRESS_MS = 500;
export const LONG_PRESS_SLOP = 10;

/** PURE: the keys that open a focused row's menu: the Menu key, or Shift+F10 (no other modifier). */
export function isPinMenuKey(e) {
  if (!e || e.ctrlKey || e.metaKey || e.altKey) return false;
  if (e.key === 'ContextMenu' && !e.shiftKey) return true;
  return e.key === 'F10' && e.shiftKey === true;
}

/** The menu's rows, in order (their key caps are 1 and 2). */
export const PIN_MENU_ROWS = Object.freeze([
  Object.freeze({ id: 'unpin', label: 'Unpin', tip: 'Takes it off your screen. The quest stays in Quests.' }),
  Object.freeze({ id: 'open', label: 'Open in Quests', tip: 'Shows this quest in Quests.' }),
]);

/**
 * PURE: where the menu goes, in the host's px. At the pointer when there is one (a right
 * click), else beside the anchor (the tracker card's right edge, level with the row); always
 * inside the host with an 8 px margin.
 * @param {{ at?: {x:number, y:number}|null, anchor?: {right:number, top:number}|null,
 *   size: {w:number, h:number}, room: {w:number, h:number} }} o
 */
export function placePinMenu({ at = null, anchor = null, size, room }) {
  const m = 8;
  let x = at ? at.x : (anchor ? anchor.right + 6 : m);
  let y = at ? at.y : (anchor ? anchor.top : m);
  // No room to the right of the card (a narrow window): under the pointer's corner instead.
  if (x + size.w > room.w - m) x = at ? at.x - size.w : room.w - m - size.w;
  if (y + size.h > room.h - m) y = room.h - m - size.h;
  return { x: Math.round(Math.max(m, x)), y: Math.round(Math.max(m, y)) };
}

/**
 * @param {{ doc: Document, host: HTMLElement|null, onUnpin?: (classTsid: string) => void,
 *   onOpen?: (classTsid: string) => void, rowFor?: (classTsid: string) => HTMLElement|null,
 *   setData?: (k: string, v: string) => void }} opts
 */
export function createQuestPinMenu({ doc, host, onUnpin = () => {}, onOpen = () => {}, rowFor = () => null, setData = () => {} } = {}) {
  let el = null;
  let pin = '';
  let row = null;
  /** Opened from the keys (Shift+F10, the Menu key): focus goes back to the row on close. */
  let keyed = false;

  function build() {
    if (el || !doc || !host) return el;
    el = doc.createElement('div');
    el.id = 'quest-pin-menu';
    el.className = 'quest-pin-menu';
    el.setAttribute('role', 'menu');
    el.hidden = true;
    el.dataset.vmDefault = '';
    const head = doc.createElement('div');
    head.className = 'qpm-head';
    const title = doc.createElement('p');
    title.className = 'qpm-title';
    title.id = 'quest-pin-menu-title';
    head.append(title);
    el.append(head);
    el.setAttribute('aria-labelledby', 'quest-pin-menu-title');
    PIN_MENU_ROWS.forEach((r, i) => {
      const btn = makeVerbRow(doc, { key: String(i + 1), label: r.label, tip: r.tip });
      btn.dataset.qpm = r.id;
      el.append(btn);
    });
    const detail = doc.createElement('p');
    detail.className = 'vm-detail';
    detail.setAttribute('aria-live', 'polite');
    detail.hidden = true;
    el.append(detail);
    host.append(el);
    bindVerbMenu(el);
    el.addEventListener('click', (e) => {
      const btn = e.target?.closest?.('[data-qpm]');
      if (!btn || !pin) return;
      const id = pin;
      const keys = keyed;
      if (btn.dataset.qpm === 'unpin') {
        close({ focus: true });
        onUnpin(id, { keys });
      } else if (btn.dataset.qpm === 'open') {
        close({ focus: false });
        onOpen(id);
      }
    });
    el.addEventListener('keydown', (e) => {
      // Nothing pressed here reaches the game's keys (window, bubbling).
      e.stopPropagation();
      if (e.key === 'Escape' || e.key === 'Tab' || isPinMenuKey(e)) {
        e.preventDefault();
        close({ focus: true });
        return;
      }
      if (verbMenuKey(el, e)) e.preventDefault();
    });
    // The Menu key's own contextmenu event lands on a row in here: never the browser's menu over it.
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    // A press anywhere else closes it (the row's own right-click then opens it again there).
    doc.addEventListener('pointerdown', (e) => {
      if (!pin || el.contains(e.target)) return;
      close({ focus: true });
    }, true);
    doc.defaultView?.addEventListener?.('resize', () => close({ focus: false }));
    return el;
  }

  /**
   * Open for a row. `at` is the pointer in client px (a right click); without it the menu sits
   * beside the tracker card, level with the row (keys, a long press).
   * @param {HTMLElement} target the row (.tq[data-pin])
   * @param {{ title?: string, at?: {x:number, y:number}|null, card?: HTMLElement|null, keys?: boolean }} [o]
   */
  function open(target, { title = '', at = null, card = null, keys = false } = {}) {
    if (!target?.dataset?.pin || !build()) return false;
    pin = target.dataset.pin;
    row = target;
    keyed = Boolean(keys);
    const t = el.querySelector('.qpm-title');
    if (t) t.textContent = title;
    el.hidden = false;
    el.style.left = '0px';
    el.style.top = '0px';
    lockVerbMenuSize(el);
    const hostRect = host.getBoundingClientRect();
    const box = el.getBoundingClientRect();
    const rowRect = target.getBoundingClientRect();
    const cardRect = (card || target).getBoundingClientRect();
    const p = placePinMenu({
      at: at ? { x: at.x - hostRect.left, y: at.y - hostRect.top } : null,
      anchor: { right: cardRect.right - hostRect.left, top: rowRect.top - hostRect.top },
      size: { w: box.width, h: box.height },
      room: { w: hostRect.width, h: hostRect.height },
    });
    el.style.left = `${p.x}px`;
    el.style.top = `${p.y}px`;
    setData('questPinMenu', pin);
    focusVerbRow(el, 0);
    return true;
  }

  /**
   * Close it. With focus: a menu opened from the keys puts focus back on its row (its quest's
   * row as drawn now: a count that ticked redrew the rows while it was open); one opened by
   * the pointer lets focus go, back to the world.
   */
  function close({ focus = false } = {}) {
    if (!el || !pin) return false;
    const id = pin;
    const from = row;
    const wasKeyed = keyed;
    pin = '';
    row = null;
    keyed = false;
    const active = doc?.activeElement;
    const inMenu = Boolean(active && el.contains(active));
    el.hidden = true;
    setData('questPinMenu', '');
    if (focus && wasKeyed) {
      const back = rowFor(id) || (from?.isConnected ? from : null);
      if (back) {
        back.focus?.({ preventScroll: true });
        return true;
      }
    }
    if (inMenu) active.blur?.();
    return true;
  }

  return {
    open,
    close,
    isOpen: () => Boolean(pin),
    pin: () => pin,
    element: () => el,
  };
}
