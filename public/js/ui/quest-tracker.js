/**
 * VERBS (phase 2, Warm paper; the HUD mock's pinned quest tracker): up to two quests pinned from
 * the Quests sheet, top left under the left pill. Each shows its title, the step you are on, its
 * count and a bar, and ticks as the count moves. The head folds it to one chip ("Porcine Pleaser
 * 4/6 +1"). It hides while a side sheet is open (the root's data-sheet, css) and when nothing is
 * pinned. A quest's line opens the Quests sheet on it.
 *
 * The pins themselves live in features/quest-pins-feature.js (the player save). QA: canvas data
 * questPins ("id:count,id:count", "" when none), questPinsCollapsed.
 */

import { escapeText } from './verb-menu.js?v=g477-1';

/**
 * @param {{ el: HTMLElement|null, onOpen?: (classTsid: string) => void, onCollapse?: (on: boolean) => void,
 *   setData?: (k: string, v: string) => void, reducedMotion?: () => boolean }} opts
 */
export function createQuestTracker({ el, onOpen = () => {}, onCollapse = () => {}, setData = () => {}, reducedMotion = () => false } = {}) {
  const list = el?.querySelector('[data-pins-list]');
  const title = el?.querySelector('[data-pins-title]');
  const toggle = el?.querySelector('[data-pins-toggle]');
  let drawn = '';
  const counts = new Map();

  toggle?.addEventListener('click', () => {
    const on = !el.classList.contains('collapsed');
    onCollapse(on);
  });
  list?.addEventListener('click', (e) => {
    const row = e.target?.closest?.('[data-pin]');
    if (row) onOpen(row.dataset.pin);
  });

  /**
   * @param {{ classTsid: string, title: string, step: string, count: string, percent: number }[]} rows
   * @param {boolean} collapsed
   */
  function render(rows, collapsed) {
    if (!el) return;
    const shown = rows.slice(0, 2);
    el.hidden = shown.length === 0;
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
    const markup = shown.map((r) => `<button type="button" class="tq" data-pin="${escapeText(r.classTsid)}" aria-label="${escapeText(`${r.title}, ${r.step} ${r.count}. Open in Quests`)}">`
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

  return { render };
}
