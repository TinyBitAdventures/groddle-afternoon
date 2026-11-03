/**
 * RIGHTCLICK (Austin 2026-11-03, right-click audit R1, R5-R8): the one small menu a right-click,
 * Shift+F10 or the Menu key opens on a HUD surface that has no menu of its own (a pinned quest's
 * row, a Quests card, a signpost's arms). Where a left click already opens a menu (a thing in the
 * world, a pack stack), a right-click opens that menu instead (game.js openVerbMenu,
 * renderPackPopover); this module is for the others. It grew out of the tracker's pin menu
 * (js/ui/quest-pin-menu.js, now its first user).
 *
 * - Drawn with the verb menu's rows (js/ui/verb-menu.js makeVerbRow, bindVerbMenu): key caps 1-9,
 *   the footer line that says what a row does or why it can't be done now, Up/Down or W/S,
 *   Home/End, 1-9 pick. Rows are role=menuitem; a row that can't be done keeps aria-disabled and
 *   its focus, so its reason can be read (R7). Its rows carry the verb menu's classes (.vm-row,
 *   .verb-choice) so both skins draw it: css/classic.css gives it the 2012 card (R8).
 * - Placed at the pointer for a right-click, beside the anchor (its right edge, level with its top)
 *   when the keys or a long press opened it, always inside the host (placeContextMenu).
 * - Esc, Tab, the Menu key again, a press anywhere else or a resize closes it. Every key pressed in
 *   it stays out of the game (Space would jump, Enter would run a verb). Opened from the keys, focus
 *   goes back to the element it came from; opened by the pointer, it goes to the world, as after any
 *   click on the HUD (js/ui/focus-return.js: Enter stays the world's, Austin 2026-10-30) (R6).
 *
 * bindContextTrigger wires a surface (R5): its contextmenu (the right button, Ctrl+click on a Mac,
 * Android's long press, the Menu key and Shift+F10 on Windows), a keydown of Shift+F10 or the Menu
 * key on a focused element (macOS Chrome sends no contextmenu for them), with the echo guard that
 * stops the contextmenu a key sends after its keydown from opening it twice, and a long press on
 * touch where the surface asks for one (iOS Safari sends no contextmenu). A Mac's Ctrl+click and a
 * long press are not clicks: the click they end in is swallowed.
 *
 * Glitch had no right-click (glitch-client BootStrap.as 38-55); its menus opened on the main
 * click, one per thing (control/InteractionMenuController.as, view/ui/InteractionMenu.as
 * 1554-1678). A right-click here opens the same menus where the main click now does something else.
 *
 * QA: canvas data contextMenu ("<surface>:<id>", "" when closed).
 */

import { bindVerbMenu, focusVerbRow, lockVerbMenuSize, makeVerbRow, verbMenuKey, verbRowKeys } from './verb-menu.js?v=74b6dfa0';
import { focusWorld } from './focus-return.js?v=da190597';

/** How long a finger holds before the menu opens, and how far it may drift. */
export const LONG_PRESS_MS = 500;
export const LONG_PRESS_SLOP = 10;
/** The contextmenu a key or a long press sends after it already opened the menu is ignored this long. */
export const ECHO_MS = 1000;
/** The click a Mac's Ctrl+click or a long press ends in is swallowed this long. */
export const SWALLOW_CLICK_MS = 700;
/** The words a trigger's label ends with (R7: aria-keyshortcuts says the same). */
export const MORE_KEYS_LABEL = 'Shift+F10 for more';

/** PURE: the keys that open a focused element's menu: the Menu key, or Shift+F10 (no other modifier). */
export function isContextMenuKey(e) {
  if (!e || e.ctrlKey || e.metaKey || e.altKey) return false;
  if (e.key === 'ContextMenu' && !e.shiftKey) return true;
  return e.key === 'F10' && e.shiftKey === true;
}

/**
 * PURE: where the menu goes, in the host's px. At the pointer when there is one (a right click),
 * else beside the anchor (its right edge, level with its top); always inside the host with an 8 px
 * margin. With no room to the right: under the pointer's corner, or against the right margin.
 * @param {{ at?: {x:number, y:number}|null, anchor?: {right:number, top:number}|null,
 *   size: {w:number, h:number}, room: {w:number, h:number} }} o
 */
export function placeContextMenu({ at = null, anchor = null, size, room }) {
  const m = 8;
  let x = at ? at.x : (anchor ? anchor.right + 6 : m);
  let y = at ? at.y : (anchor ? anchor.top : m);
  if (x + size.w > room.w - m) x = at ? at.x - size.w : room.w - m - size.w;
  if (y + size.h > room.h - m) y = room.h - m - size.h;
  return { x: Math.round(Math.max(m, x)), y: Math.round(Math.max(m, y)) };
}

/** A rect (or an element's) as { right, top } in client px, or null. */
function anchorRect(anchor) {
  if (!anchor) return null;
  if (typeof anchor.getBoundingClientRect === 'function') {
    const r = anchor.getBoundingClientRect();
    return { right: r.right, top: r.top };
  }
  return Number.isFinite(anchor.right) && Number.isFinite(anchor.top) ? { right: anchor.right, top: anchor.top } : null;
}

/**
 * One menu element in `host` (built on first open). open() fills it with rows each time.
 * @param {{ doc: Document, host: HTMLElement|null, id?: string, className?: string, headClass?: string,
 *   titleClass?: string, rowData?: string, fixed?: boolean, setData?: (k: string, v: string) => void }} opts
 *   rowData: the dataset key each row's id goes in (default ctxRow: data-ctx-row="unpin").
 *   fixed: placed in the window, not in the host (data-fixed: position fixed in both skins), for a
 *   menu opened from something outside the host's box (Classic's chat column stands beside
 *   #game-root, which clips what is absolutely placed in it).
 */
export function createContextMenu({ doc, host, id = '', className = '', headClass = '', titleClass = '', rowData = 'ctxRow', fixed = false, setData = () => {} } = {}) {
  let el = null;
  let head = null;
  let titleEl = null;
  let detail = null;
  /** What is open now: { owner, rows, keys, opener, findOpener, onPick, onClose, data }, or null. */
  let cur = null;
  /** The time of the press that last closed it (a surface lets that press do nothing else, R6). */
  let closedAt = -1;

  function build() {
    if (el || !doc || !host) return el;
    el = doc.createElement('div');
    if (id) el.id = id;
    el.className = ['ctx-menu', className].filter(Boolean).join(' ');
    el.setAttribute('role', 'menu');
    if (fixed) el.dataset.fixed = '';
    el.hidden = true;
    el.dataset.vmDefault = '';
    head = doc.createElement('div');
    head.className = ['ctx-head', headClass].filter(Boolean).join(' ');
    titleEl = doc.createElement('p');
    titleEl.className = ['ctx-title', titleClass].filter(Boolean).join(' ');
    const titleId = `${id || 'ctx-menu'}-title`;
    titleEl.id = titleId;
    head.append(titleEl);
    el.setAttribute('aria-labelledby', titleId);
    detail = doc.createElement('p');
    detail.className = 'vm-detail';
    detail.setAttribute('aria-live', 'polite');
    detail.hidden = true;
    el.append(head, detail);
    host.append(el);
    bindVerbMenu(el);
    el.addEventListener('click', (e) => {
      const btn = e.target?.closest?.('.vm-row');
      if (!btn || !cur || !el.contains(btn)) return;
      const row = cur.rows.find((r) => r.btn === btn);
      if (!row || row.disabled) return;
      const { keys, onPick } = cur;
      close({ focus: row.focusBack !== false });
      onPick?.(row.id, { keys, row });
    });
    el.addEventListener('keydown', (e) => {
      // Nothing pressed here reaches the game's keys (window, bubbling).
      e.stopPropagation();
      if (e.key === 'Escape' || e.key === 'Tab' || isContextMenuKey(e)) {
        e.preventDefault();
        close({ focus: true });
        return;
      }
      if (verbMenuKey(el, e)) e.preventDefault();
    });
    // The Menu key's own contextmenu event lands on a row in here: never the browser's menu over it.
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    // A press anywhere else closes it (the surface's own right-click then opens it again there).
    doc.addEventListener('pointerdown', (e) => {
      if (!cur || el.contains(e.target)) return;
      closedAt = e.timeStamp ?? -1;
      close({ focus: true });
    }, true);
    doc.defaultView?.addEventListener?.('resize', () => close({ focus: false }));
    return el;
  }

  /**
   * Open it. `rows`: [{ id, label, tip?, disabled?, reason?, focusBack? }] (focusBack false: picking
   * it leaves focus where the pick sends it, e.g. a sheet it opens). `at`: the pointer in client px
   * (a right-click); without it the menu sits beside `anchor` (an element or { right, top }).
   * `keys`: the keys opened it (focus goes back to `opener`, or what `findOpener()` gives, on close).
   * `owner`: what it is about, for the QA data ("quest:happy_endings"); `data`: more canvas data
   * keys set to their values while it is open and to "" on close. `focusIndex`: the row to focus
   * (default: the first one that can be done). `layer`: 'screen' lifts it over a full-screen panel
   * it was opened from (the Manage buddies panel): data-layer on the menu, both skins' CSS.
   */
  function open({ title = '', rows = [], at = null, anchor = null, keys = false, opener = null, findOpener = null, owner = '', data = null, onPick = null, onClose = null, focusIndex = null, layer = '' } = {}) {
    if (!rows.length || !build()) return false;
    if (cur) close({ focus: false });
    const capKeys = verbRowKeys(rows);
    const built = rows.map((r, i) => {
      const btn = makeVerbRow(doc, { key: capKeys[i], label: r.label, tip: r.tip || '', disabled: Boolean(r.disabled), reason: r.reason || '' });
      btn.classList.add('verb-choice');
      btn.dataset[rowData] = String(r.id);
      return { ...r, btn };
    });
    cur = { owner: String(owner || ''), rows: built, keys: Boolean(keys), opener, findOpener, onPick, onClose, data };
    titleEl.textContent = title;
    if (layer) el.dataset.layer = String(layer);
    else delete el.dataset.layer;
    el.replaceChildren(head, ...built.map((r) => r.btn), detail);
    el.hidden = false;
    el.style.left = '0px';
    el.style.top = '0px';
    lockVerbMenuSize(el);
    const win = doc.defaultView;
    const hostRect = fixed
      ? { left: 0, top: 0, width: win?.innerWidth || doc.documentElement?.clientWidth || 0, height: win?.innerHeight || doc.documentElement?.clientHeight || 0 }
      : host.getBoundingClientRect();
    const box = el.getBoundingClientRect();
    const a = anchorRect(anchor);
    const p = placeContextMenu({
      at: at ? { x: at.x - hostRect.left, y: at.y - hostRect.top } : null,
      anchor: a ? { right: a.right - hostRect.left, top: a.top - hostRect.top } : null,
      size: { w: box.width, h: box.height },
      room: { w: hostRect.width, h: hostRect.height },
    });
    el.style.left = `${p.x}px`;
    el.style.top = `${p.y}px`;
    setData('contextMenu', cur.owner);
    for (const [k, v] of Object.entries(data || {})) setData(k, String(v));
    focusVerbRow(el, focusIndex);
    return true;
  }

  /**
   * Close it. With focus: a menu opened from the keys puts focus back on its opener (as it is drawn
   * now: findOpener, else the opener if it is still on the page); one opened by the pointer gives
   * the keys to the world when focus was in the menu.
   */
  function close({ focus = false } = {}) {
    if (!el || !cur) return false;
    const was = cur;
    cur = null;
    const active = doc?.activeElement;
    const inMenu = Boolean(active && el.contains(active));
    el.hidden = true;
    setData('contextMenu', '');
    for (const k of Object.keys(was.data || {})) setData(k, '');
    was.onClose?.();
    if (focus && was.keys) {
      const back = was.findOpener?.() || (was.opener?.isConnected ? was.opener : null);
      if (back) {
        back.focus?.({ preventScroll: true });
        return true;
      }
    }
    if (inMenu) focusWorld(doc);
    return true;
  }

  return {
    open,
    close,
    isOpen: () => Boolean(cur),
    owner: () => cur?.owner || '',
    isOpenFor: (owner) => Boolean(cur && cur.owner === String(owner)),
    closedByPressAt: () => closedAt,
    element: () => el,
  };
}

/**
 * Wire a surface's triggers (R5). `rowOf(target)` finds the thing a press or a key is on (or null:
 * not ours); `open(thing, { at, keys, swallowClick, event })` opens its menu; `isOpenFor(thing)`
 * says its menu is open (the echo guard). `longPress`: also open on a 500 ms touch press that stays
 * within 10 px (only where a tap does something else and a long press is not a drag).
 * Returns { swallowNextClick(), isSwallowing() }.
 * @param {HTMLElement} container
 * @param {{ rowOf: (t: EventTarget|null) => HTMLElement|null, open: Function, isOpenFor?: (row: HTMLElement) => boolean,
 *   now?: () => number, longPress?: boolean }} o
 */
export function bindContextTrigger(container, { rowOf, open, isOpenFor = () => false, now = () => Date.now(), longPress = false } = {}) {
  let echoUntil = 0;
  let swallowClickUntil = 0;
  const fire = (row, at, { keys = false, swallowClick = false, event = null } = {}) => {
    echoUntil = now() + ECHO_MS;
    if (swallowClick) swallowClickUntil = now() + SWALLOW_CLICK_MS;
    open(row, { at, keys, swallowClick, event });
  };
  if (!container?.addEventListener) return { swallowNextClick() {}, isSwallowing: () => false };
  // A click that ends a long press (or a Mac's Ctrl+click) is not a click: it opens nothing.
  container.addEventListener('click', (e) => {
    if (now() >= swallowClickUntil || !rowOf(e.target)) return;
    swallowClickUntil = 0;
    e.preventDefault?.();
    e.stopPropagation?.();
  }, true);
  // Right-click (Ctrl+click on a Mac, a long press on Android): its menu, not the browser's.
  container.addEventListener('contextmenu', (e) => {
    const row = rowOf(e.target);
    if (!row) return;
    e.preventDefault();
    if (isOpenFor(row) && now() < echoUntil) return;
    const at = (e.clientX || e.clientY) ? { x: e.clientX, y: e.clientY } : null;
    fire(row, at, { swallowClick: e.ctrlKey === true && e.button === 0, event: e });
  });
  container.addEventListener('keydown', (e) => {
    if (!isContextMenuKey(e)) return;
    const row = rowOf(e.target);
    if (!row) return;
    e.preventDefault();
    e.stopPropagation();
    fire(row, null, { keys: true, event: e });
  });
  if (longPress) {
    let press = null;
    const endPress = () => {
      if (press) globalThis.clearTimeout(press.timer);
      press = null;
    };
    container.addEventListener('pointerdown', (e) => {
      endPress();
      if (e.pointerType !== 'touch' && e.pointerType !== 'pen') return;
      const row = rowOf(e.target);
      if (!row) return;
      const at = { x: e.clientX, y: e.clientY };
      press = { at, timer: globalThis.setTimeout(() => { press = null; fire(row, null, { swallowClick: true }); }, LONG_PRESS_MS) };
    });
    container.addEventListener('pointermove', (e) => {
      if (press && Math.hypot(e.clientX - press.at.x, e.clientY - press.at.y) > LONG_PRESS_SLOP) endPress();
    });
    for (const type of ['pointerup', 'pointercancel', 'pointerleave']) container.addEventListener(type, endPress);
  }
  return {
    swallowNextClick: () => { swallowClickUntil = now() + SWALLOW_CLICK_MS; },
    isSwallowing: () => now() < swallowClickUntil,
  };
}
