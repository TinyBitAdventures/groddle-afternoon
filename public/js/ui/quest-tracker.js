/**
 * VERBS (phase 2, Warm paper; the HUD mock's pinned quest tracker): up to two quests pinned from
 * the Quests sheet, top left under the left pill. Each shows its title, the step you are on, its
 * count and a bar, and ticks as the count moves. The head folds it to one chip ("Porcine Pleaser
 * 4/6 +1"). While a side sheet is open (the root's data-sheet, css) it sits beside the sheet, so it
 * stays in view and ticks while you make or trade (MAKESHEET, Austin 2026-11-02); it hides when
 * nothing is pinned. A quest's line opens the Quests sheet on it.
 *
 * PINMENU (Austin 2026-11-01): a row's menu (js/ui/quest-pin-menu.js) unpins it, only from its
 * Unpin row: right-click, the Menu key or Shift+F10 on a focused row, or a long press on touch.
 * A left click still opens Quests, exactly as before; a long press or right-click never does.
 *
 * The pins themselves live in features/quest-pins-feature.js (the player save). QA: canvas data
 * questPins ("id:count,id:count", "" when none), questPinsCollapsed.
 */

import { escapeText } from './verb-menu.js?v=7716e570';
import { createQuestPinMenu } from './quest-pin-menu.js?v=361dad0c';
import { bindContextTrigger, MORE_KEYS_LABEL } from './context-menu.js?v=79326483';

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
  /**
   * RIGHTCLICK (js/ui/context-menu.js bindContextTrigger): right-click, Ctrl+click on a Mac, the
   * Menu key or Shift+F10 on a focused row, or a long press on touch (iOS Safari sends no
   * contextmenu) open the row's menu; the contextmenu a key or a long press sends after it is not
   * a second open, and the click a long press or a Ctrl+click ends in opens nothing.
   */
  bindContextTrigger(list, {
    rowOf,
    now,
    longPress: true,
    isOpenFor: (row) => menu.isOpen() && menu.pin() === row.dataset.pin,
    open: (row, { at, keys }) => menu.open(row, { title: titles.get(row.dataset.pin) || '', at, card: el, keys }),
  });

  toggle?.addEventListener('click', () => {
    const on = !el.classList.contains('collapsed');
    onCollapse(on);
  });
  list?.addEventListener('click', (e) => {
    const row = rowOf(e.target);
    if (!row) return;
    onOpen(row.dataset.pin);
  });

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
    const markup = shown.map((r) => `<button type="button" class="tq" aria-haspopup="menu" data-pin="${escapeText(r.classTsid)}" aria-keyshortcuts="Shift+F10" aria-label="${escapeText(`${r.title}, ${r.step} ${r.count}. Open in Quests. ${MORE_KEYS_LABEL}`)}">`
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
