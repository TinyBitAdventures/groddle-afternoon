/**
 * RIGHTCLICK (Austin 2026-11-03, right-click audit R4): one contextmenu listener for the whole page
 * decides whether the browser's own menu (Back, Reload, Save image as, Inspect) may open.
 *
 * - The game's canvas: never. A right-click on the world is the game's (game.js opens the thing's
 *   verb menu there); the browser menu over it also swallowed the next keyup, and the avatar kept
 *   walking (player report 23; js/held-keys.js still lets every held key go on a contextmenu, as a
 *   safety net). Glitch did the same on its whole stage: glitch-client BootStrap.as 38-55 hid
 *   Flash's menu and left one item, "A game by Tiny Speck".
 * - An element marked [data-ctx] has its own menu (js/ui/context-menu.js and the surfaces that use
 *   it): the browser's never opens over it.
 * - A plain HUD control (a button, a tab, a switch) has no menu of ours: a right-click on it shows
 *   nothing, rather than the browser's menu over the game.
 * - Text fields, links and selected text keep the browser's menu (Paste and spelling, Open link in
 *   new tab, Copy), and so does everything else (the words in a panel, a picture in a page).
 *
 * The surfaces themselves open their menus from their own contextmenu listeners; this one only
 * stops the browser's. QA: canvas data browserMenu (the last decision: ours | none | browser).
 */

/** The world: the game's canvas in #game-root (js/ui/focus-return.js WORLD_SELECTOR). */
export const WORLD_CANVAS = '#game-root > canvas';
/** Things that keep the browser's menu wherever they are: text to type in, and links. */
export const KEEPS_BROWSER_MENU = 'input:not([type="button"]):not([type="submit"]):not([type="reset"]):not([type="checkbox"]):not([type="radio"]):not([type="range"]), textarea, select, [contenteditable=""], [contenteditable="true"], a[href]';
/** An element with a menu of ours (a right-click, Shift+F10 or the Menu key opens it). */
export const HAS_OUR_MENU = '[data-ctx]';
/** A plain control: a right-click on it shows nothing. */
export const PLAIN_CONTROL = 'button, [role="button"], [role="tab"], [role="menuitem"], [role="switch"], [role="option"], summary, label, input, canvas';

/** True when the user has selected some text and the selection takes in `target`. */
export function selectionCovers(selection, target) {
  if (!selection || selection.isCollapsed !== false) return false;
  if (!String(selection.toString?.() ?? '').trim()) return false;
  try {
    return Boolean(selection.containsNode?.(target, true));
  } catch {
    return false;
  }
}

/**
 * PURE: what a contextmenu on `target` does: 'ours' (a menu of the game's opens: the browser's is
 * stopped), 'none' (a plain control: nothing opens) or 'browser' (the browser's own menu).
 * @param {Element|null} target
 * @param {{ selection?: Selection|null }} [o]
 */
export function browserMenuPolicy(target, { selection = null } = {}) {
  if (!target || typeof target.closest !== 'function') return 'browser';
  if (target.matches?.(WORLD_CANVAS)) return 'ours';
  if (target.closest(KEEPS_BROWSER_MENU)) return 'browser';
  if (selectionCovers(selection, target)) return 'browser';
  if (target.closest(HAS_OUR_MENU)) return 'ours';
  if (target.closest(PLAIN_CONTROL)) return 'none';
  return 'browser';
}

/**
 * Install the listener on a document (once). It runs in the capture phase, ahead of any surface's
 * own listener, and only calls preventDefault: the surface still gets the event and opens its menu.
 * @param {Document} doc
 * @param {{ setData?: (k: string, v: string) => void }} [o]
 */
export function installContextGuard(doc = globalThis.document, { setData = () => {} } = {}) {
  if (!doc?.addEventListener || doc.__contextGuard) return () => {};
  doc.__contextGuard = true;
  const onMenu = (e) => {
    const policy = browserMenuPolicy(e.target, { selection: doc.getSelection?.() || null });
    if (policy !== 'browser') e.preventDefault();
    setData('browserMenu', policy);
  };
  doc.addEventListener('contextmenu', onMenu, true);
  return () => {
    doc.removeEventListener?.('contextmenu', onMenu, true);
    delete doc.__contextGuard;
  };
}
