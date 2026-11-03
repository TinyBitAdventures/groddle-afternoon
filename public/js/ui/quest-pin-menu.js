/**
 * PINMENU (Austin 2026-11-01): the small menu a pinned quest's row opens in the tracker
 * (js/ui/quest-tracker.js), so a pin comes off on purpose and never by a stray click:
 * right-click (or Ctrl+click on a Mac), the Menu key or Shift+F10 on a focused row, or a long
 * press on touch opens it; only its Unpin row unpins. "Open in Quests" does what a plain click
 * on the row does. A left click on the row is unchanged (it opens Quests on that quest).
 *
 * RIGHTCLICK (Austin 2026-11-03, audit R1): it is the first user of the shared context menu
 * (js/ui/context-menu.js), which grew out of it: the verb menu's rows (key caps 1 and 2, the
 * footer line that says what a row does, Up/Down or W/S, Home/End, 1-2 pick) in the verb menu's
 * card look. Esc, Tab or a press anywhere else closes it. Opened from the keys, focus goes back to
 * the row it came from; opened by the pointer, focus goes back to the world, as after any click
 * on the HUD (js/ui/focus-return.js: Enter stays the world's, Austin 2026-10-30).
 * Every key pressed in it stays out of the game (Space would jump, Enter would run a verb).
 *
 * The original client's QuestTracker (glitch-client com/tinyspeck/engine/view/ui/quest/
 * QuestTracker.as 69-80) had its own "Unpin" button, but only the god/debug chat
 * (ChatGodDebug.as) ever opened it; the remake's tracker is the HUD mock's, so its menu is too.
 * Modern only: Classic has no tracker (the .quest-pins card shows under data-ui="modern" alone).
 *
 * QA: canvas data questPinMenu (the open row's quest id, "" when closed); contextMenu
 * ("quest-pin:<id>").
 */

import { createContextMenu, isContextMenuKey, LONG_PRESS_MS, LONG_PRESS_SLOP, placeContextMenu } from './context-menu.js?v=e2993b1c';

/** How long a finger holds a row before the menu opens, and how far it may drift. */
export { LONG_PRESS_MS, LONG_PRESS_SLOP };

/** PURE: the keys that open a focused row's menu: the Menu key, or Shift+F10 (no other modifier). */
export const isPinMenuKey = isContextMenuKey;

/** The menu's rows, in order (their key caps are 1 and 2). */
export const PIN_MENU_ROWS = Object.freeze([
  Object.freeze({ id: 'unpin', label: 'Unpin', tip: 'Takes it off your screen. The quest stays in Quests.' }),
  Object.freeze({ id: 'open', label: 'Open in Quests', tip: 'Shows this quest in Quests.' }),
]);

/**
 * PURE: where the menu goes, in the host's px. At the pointer when there is one (a right
 * click), else beside the anchor (the tracker card's right edge, level with the row); always
 * inside the host with an 8 px margin (js/ui/context-menu.js placeContextMenu).
 */
export const placePinMenu = placeContextMenu;

const OWNER = 'quest-pin:';

/**
 * @param {{ doc: Document, host: HTMLElement|null, onUnpin?: (classTsid: string) => void,
 *   onOpen?: (classTsid: string) => void, rowFor?: (classTsid: string) => HTMLElement|null,
 *   setData?: (k: string, v: string) => void }} opts
 */
export function createQuestPinMenu({ doc, host, onUnpin = () => {}, onOpen = () => {}, rowFor = () => null, setData = () => {} } = {}) {
  const menu = createContextMenu({ doc, host, id: 'quest-pin-menu', className: 'quest-pin-menu', headClass: 'qpm-head', titleClass: 'qpm-title', rowData: 'qpm', setData });

  /**
   * Open for a row. `at` is the pointer in client px (a right click); without it the menu sits
   * beside the tracker card, level with the row (keys, a long press).
   * @param {HTMLElement} target the row (.tq[data-pin])
   * @param {{ title?: string, at?: {x:number, y:number}|null, card?: HTMLElement|null, keys?: boolean }} [o]
   */
  function open(target, { title = '', at = null, card = null, keys = false } = {}) {
    const pin = target?.dataset?.pin;
    if (!pin) return false;
    const rowRect = target.getBoundingClientRect();
    const cardRect = (card || target).getBoundingClientRect();
    return menu.open({
      title,
      // Unpin gives focus back (from the keys, to the row or the pin that is left); Open in Quests
      // leaves it to the sheet it opens.
      rows: PIN_MENU_ROWS.map((r) => ({ ...r, focusBack: r.id === 'unpin' })),
      at,
      anchor: { right: cardRect.right, top: rowRect.top },
      keys,
      opener: target,
      // Its quest's row as drawn now: a count that ticked redrew the rows while it was open.
      findOpener: () => rowFor(pin),
      owner: `${OWNER}${pin}`,
      data: { questPinMenu: pin },
      focusIndex: 0,
      onPick: (id, { keys: fromKeys }) => {
        if (id === 'unpin') onUnpin(pin, { keys: fromKeys });
        else if (id === 'open') onOpen(pin);
      },
    });
  }

  return {
    open,
    close: (o) => menu.close(o),
    isOpen: () => menu.isOpen(),
    pin: () => (menu.isOpen() && menu.owner().startsWith(OWNER) ? menu.owner().slice(OWNER.length) : ''),
    element: () => menu.element(),
  };
}
