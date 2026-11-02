/**
 * VERBS (phase 2, Warm paper; the HUD mock's pinned quest tracker): up to two quests pinned from
 * the Quests sheet, top left under the left pill. Each shows its title, the step you are on, its
 * count and a bar, and ticks as the count moves. The head folds it to one chip ("Porcine Pleaser
 * 4/6 +1"). It hides while a side sheet is open (the root's data-sheet, css) and when nothing is
 * pinned. A quest's line opens the Quests sheet on it.
 *
 * PINMENU (Austin 2026-11-01): a row's menu (js/ui/quest-pin-menu.js) unpins it, only from its
 * Unpin row: right-click, the Menu key or Shift+F10 on a focused row, or a long press on touch.
 * A left click still opens Quests, exactly as before; a long press or right-click never does.
 *
 * The pins themselves live in features/quest-pins-feature.js (the player save). QA: canvas data
 * questPins ("id:count,id:count", "" when none), questPinsCollapsed.
 */

import { escapeText } from './verb-menu.js?v=e9d100c3';
import { createQuestPinMenu, isPinMenuKey, LONG_PRESS_MS, LONG_PRESS_SLOP } from './quest-pin-menu.js?v=b5fcd8ff';

/**
 * @param {{ el: HTMLElement|null, onOpen?: (classTsid: string) => void, onCollapse?: (on: boolean) => void,
 *   onUnpin?: (classTsid: string) => void, setData?: (k: string, v: string) => void,
 *   reducedMotion?: () => boolean, now?: () => number }} opts
 */
export function createQuestTracker({ el, onOpen = () => {}, onCollapse = () => {}, onUnpin = () => {}, setData = () => {}, reducedMotion = () => false, now = () => Date.now() } = {}) {
  const list = el?.querySelector('[data-pins-list]');
  const title = el?.querySelector('[data-pins-title]');
  const toggle = el?.querySelector('[data-pins-toggle]');
  let drawn = '';
  const counts = new Map();
  /** Each shown quest's title (the menu's head). */
  const titles = new Map();
  const rowOf = (t) => {
    const row = t?.closest?.('[data-pin]');
    return row && list?.contains(row) ? row : null;
  };
  const menu = createQuestPinMenu({
    doc: el?.ownerDocument,
    host: el?.parentElement || null,
    setData,
    rowFor: (id) => list?.querySelector(`[data-pin="${CSS.escape(id)}"]`) || null,
    onOpen: (id) => onOpen(id),
    onUnpin: (id, { keys = false } = {}) => {
      onUnpin(id);
      // From the keys, the row is gone: focus the pin that is left, if any (render ran inside onUnpin).
      const doc = el?.ownerDocument;
      if (!keys || !list || (doc?.activeElement && list.contains(doc.activeElement))) return;
      list.querySelector('[data-pin]')?.focus?.({ preventScroll: true });
    },
  });
  /** A click that ends a long press (or a Mac's Ctrl+click) is not a left click: it opens nothing. */
  let swallowClickUntil = 0;
  /** The contextmenu event a key or a long press sends after it already opened the menu. */
  let echoUntil = 0;
  function openMenu(row, at, { swallowClick = false, keys = false } = {}) {
    if (!row) return;
    menu.open(row, { title: titles.get(row.dataset.pin) || '', at, card: el, keys });
    echoUntil = now() + 1000;
    if (swallowClick) swallowClickUntil = now() + 700;
  }

  toggle?.addEventListener('click', () => {
    const on = !el.classList.contains('collapsed');
    onCollapse(on);
  });
  list?.addEventListener('click', (e) => {
    const row = rowOf(e.target);
    if (!row) return;
    if (now() < swallowClickUntil) {
      swallowClickUntil = 0;
      e.preventDefault?.();
      return;
    }
    onOpen(row.dataset.pin);
  });
  // Right-click (Ctrl+click on a Mac, a long press on Android): the row's menu, not the browser's.
  list?.addEventListener('contextmenu', (e) => {
    const row = rowOf(e.target);
    if (!row) return;
    e.preventDefault();
    if (menu.isOpen() && menu.pin() === row.dataset.pin && now() < echoUntil) return;
    const at = (e.clientX || e.clientY) ? { x: e.clientX, y: e.clientY } : null;
    openMenu(row, at, { swallowClick: e.ctrlKey === true && e.button === 0 });
  });
  list?.addEventListener('keydown', (e) => {
    if (!isPinMenuKey(e)) return;
    const row = rowOf(e.target);
    if (!row) return;
    e.preventDefault();
    e.stopPropagation();
    openMenu(row, null, { keys: true });
  });
  // A long press on touch (iOS Safari sends no contextmenu).
  let press = null;
  const endPress = () => {
    if (press) globalThis.clearTimeout(press.timer);
    press = null;
  };
  list?.addEventListener('pointerdown', (e) => {
    endPress();
    if (e.pointerType !== 'touch' && e.pointerType !== 'pen') return;
    const row = rowOf(e.target);
    if (!row) return;
    const at = { x: e.clientX, y: e.clientY };
    press = { at, timer: globalThis.setTimeout(() => { press = null; openMenu(row, null, { swallowClick: true }); }, LONG_PRESS_MS) };
  });
  list?.addEventListener('pointermove', (e) => {
    if (press && Math.hypot(e.clientX - press.at.x, e.clientY - press.at.y) > LONG_PRESS_SLOP) endPress();
  });
  for (const type of ['pointerup', 'pointercancel', 'pointerleave']) list?.addEventListener(type, endPress);

  /**
   * @param {{ classTsid: string, title: string, step: string, count: string, percent: number }[]} rows
   * @param {boolean} collapsed
   */
  function render(rows, collapsed) {
    if (!el) return;
    const shown = rows.slice(0, 2);
    el.hidden = shown.length === 0;
    titles.clear();
    for (const r of shown) titles.set(r.classTsid, r.title);
    // A menu whose quest left the tracker (unpinned, finished) or a folded tracker closes it.
    if (menu.isOpen() && (collapsed || !shown.some((r) => r.classTsid === menu.pin()))) menu.close({ focus: false });
    setData('questPins', shown.map((r) => `${r.classTsid}:${r.count}`).join(','));
    setData('questPinsCollapsed', collapsed ? '1' : '0');
    el.classList.toggle('collapsed', collapsed);
    if (toggle) {
      toggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
      toggle.setAttribute('aria-label', collapsed ? 'Expand pinned quests' : 'Collapse pinned quests');
    }
    if (!shown.length) return;
    const head = collapsed
      ? `${shown[0].title} ${shown[0].count}${shown.length > 1 ? ' +1' : ''}`
      : 'Pinned quests';
    if (title && title.textContent !== head) title.textContent = head;
    const markup = shown.map((r) => `<button type="button" class="tq" data-pin="${escapeText(r.classTsid)}" aria-keyshortcuts="Shift+F10" aria-label="${escapeText(`${r.title}, ${r.step} ${r.count}. Open in Quests. Shift+F10 for more`)}">`
      + `<span class="tq-row"><span class="tq-title">${escapeText(r.title)}</span><span class="tq-n">${escapeText(r.count)}</span></span>`
      + `<span class="tq-step">${escapeText(r.step)}</span>`
      + `<span class="tq-bar" aria-hidden="true"><i style="width:${Math.max(0, Math.min(100, Math.round(r.percent)))}%"></i></span></button>`).join('');
    if (markup !== drawn && list) {
      const hadFocus = list.contains(el.ownerDocument?.activeElement) ? el.ownerDocument.activeElement.dataset.pin : '';
      list.innerHTML = markup;
      drawn = markup;
      if (hadFocus) list.querySelector(`[data-pin="${CSS.escape(hadFocus)}"]`)?.focus({ preventScroll: true });
    }
    // A count that moved ticks (a short bump), unless motion is reduced.
    for (const r of shown) {
      const was = counts.get(r.classTsid);
      counts.set(r.classTsid, r.count);
      if (was === undefined || was === r.count || reducedMotion()) continue;
      const row = list?.querySelector(`[data-pin="${CSS.escape(r.classTsid)}"]`);
      row?.animate?.([{ transform: 'scale(1)' }, { transform: 'scale(1.04)' }, { transform: 'scale(1)' }], { duration: 360, easing: 'ease-out' });
      setData('questPinsTick', `${r.classTsid}:${r.count}`);
    }
  }

  return { render, menu };
}
