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
 *
 * G919 (Austin 2026-11-17): on a phone the card is the popover of one round button in the top bar
 * (js/ui/quest-pin-button.js), drawn open; `button` is that button's controller.
 */

import { escapeText } from './verb-menu.js?v=1ad4f969';
import { questTextPlain, questTextSegments } from '../quest-text.js?v=92213536';
import { createQuestPinMenu } from './quest-pin-menu.js?v=34069e3c';
import { bindContextTrigger, MORE_KEYS_LABEL } from './context-menu.js?v=0266831a';
import { createQuestPinButton } from './quest-pin-button.js?v=9b768a79';

/**
 * @param {{ el: HTMLElement|null, onOpen?: (classTsid: string) => void, onCollapse?: (on: boolean) => void,
 *   onUnpin?: (classTsid: string) => void, setData?: (k: string, v: string) => void,
 *   reducedMotion?: () => boolean, now?: () => number }} opts
 */
/**
 * A step's quest markup as the row shows it (#147): <b> and <i> as the Quests sheet draws them
 * (js/quest-text.js renderQuestText), links as their words, a break as a space; everything escaped.
 */
export function questStepHtml(raw) {
  return questTextSegments(raw).map((seg) => {
    if (seg.br) return ' ';
    let html = escapeText(seg.text);
    if (seg.italic) html = `<i>${html}</i>`;
    if (seg.bold) html = `<b>${html}</b>`;
    return html;
  }).join('');
}

/** How many unfinished steps a pinned row lists before "+N more" (#397). */
export const PIN_STEPS_SHOWN = 3;

/**
 * #397: a pinned quest of several steps (quest-sheet questStep `steps`) lists each step not done
 * yet, its words, its count and a thin bar, up to PIN_STEPS_SHOWN, then "+N more"; the steps done
 * fold into one "N done" line. Glitch's tracker listed every requirement with got/need
 * (QuestTracker.as 178-216). One step (no `steps`): nothing, the row's step line stands.
 * @param {{ desc: string, count: string, percent: number, done: boolean }[]|undefined} steps
 */
export function pinStepsHtml(steps) {
  if (!Array.isArray(steps) || steps.length < 2) return '';
  const open = steps.filter((s) => !s.done);
  const done = steps.length - open.length;
  const rows = open.slice(0, PIN_STEPS_SHOWN).map((s) => '<span class="tq-req">'
    + `<span class="tq-req-row"><span class="tq-req-text">${questStepHtml(s.desc)}</span>${s.count ? `<span class="tq-req-n">${escapeText(s.count)}</span>` : ''}</span>`
    + `<span class="tq-req-bar" aria-hidden="true"><i style="width:${Math.max(0, Math.min(100, Math.round(Number(s.percent) || 0)))}%"></i></span>`
    + '</span>');
  const more = open.length - PIN_STEPS_SHOWN;
  const foot = [more > 0 ? `<span class="tq-more">+${more} more</span>` : '', done > 0 ? `<span class="tq-done">${done} done</span>` : ''].filter(Boolean);
  return `<span class="tq-steps">${rows.join('')}${foot.length ? `<span class="tq-foot">${foot.join('')}</span>` : ''}</span>`;
}

/** A pinned row's words for a screen reader: its title, its count, then the steps left (#397). */
function pinRowLabel(r) {
  if (r.failed || !Array.isArray(r.steps) || r.steps.length < 2) return `${r.title}, ${questTextPlain(r.step)} ${r.count}`;
  const left = r.steps.filter((s) => !s.done).map((s) => `${questTextPlain(s.desc)}${s.count ? ` ${s.count}` : ''}`);
  return `${r.title}, ${r.steps.length - left.length} of ${r.steps.length} steps done${left.length ? `: ${left.join('; ')}` : ''}`;
}

export function createQuestTracker({ el, onOpen: openQuest = () => {}, onCollapse = () => {}, onUnpin = () => {}, setData = () => {}, reducedMotion = () => false, now = () => Date.now(), setTimer, clearTimer } = {}) {
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
  // G919: the phone's quest button; opening a quest from its popover closes the popover first.
  const button = createQuestPinButton({ card: el, menu, setData, ...(setTimer ? { setTimer } : {}), ...(clearTimer ? { clearTimer } : {}) });
  function onOpen(id) {
    button.close();
    openQuest(id);
  }
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
   * @param {{ classTsid: string, title: string, step: string, count: string, percent: number, failed?: boolean, short?: string, steps?: object[] }[]} rows
   *   `failed` (report 127, quest-sheet failedQuestPin): its try ended; the step says so, with no count or bar.
   *   `steps` (#397, quest-sheet questStep): a quest of several steps; `count` is then steps done/total.
   * @param {boolean} collapsed
   */
  function render(rows, folded) {
    if (!el) return;
    const shown = rows.slice(0, 2);
    button.sync(shown);
    // A phone's popover always shows the rows (G919); the fold stays saved for a computer. G1230 (#595):
    // the phone layout's card is always its first row, so a tap opens the quest in Quests as the old
    // pin did; folded it was only the head ("Title 0/3"), which opens nothing.
    const phoneCard = Boolean(el.ownerDocument?.documentElement?.classList?.contains?.('phone-layout'));
    const collapsed = folded && !button.active() && !phoneCard;
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
      ? `${shown[0].failed ? `${shown[0].title}: ${shown[0].short}` : `${shown[0].title} ${shown[0].count}`}${shown.length > 1 ? ' +1' : ''}`
      : 'Pinned quests';
    if (title && title.textContent !== head) title.textContent = head;
    const markup = shown.map((r) => {
      // #397: several steps list each step left (pinStepsHtml) in place of the one step line and bar.
      const steps = r.failed ? '' : pinStepsHtml(r.steps);
      return `<button type="button" class="tq${r.failed ? ' is-failed' : ''}${steps ? ' has-steps' : ''}" aria-haspopup="menu" data-pin="${escapeText(r.classTsid)}" aria-keyshortcuts="Shift+F10" aria-label="${escapeText(`${pinRowLabel(r)}. Open in Quests. ${MORE_KEYS_LABEL}`)}">`
        + `<span class="tq-row"><span class="tq-title">${escapeText(r.title)}</span><span class="tq-n">${escapeText(r.count)}</span></span>`
        + (steps || `<span class="tq-step">${questStepHtml(r.step)}</span>`
          + (r.failed ? '' : `<span class="tq-bar" aria-hidden="true"><i style="width:${Math.max(0, Math.min(100, Math.round(r.percent)))}%"></i></span>`))
        + '</button>';
    }).join('');
    if (markup !== drawn && list) {
      const hadFocus = list.contains(el.ownerDocument?.activeElement) ? el.ownerDocument.activeElement.dataset.pin : '';
      list.innerHTML = markup;
      drawn = markup;
      if (hadFocus) list.querySelector(`[data-pin="${CSS.escape(hadFocus)}"]`)?.focus({ preventScroll: true });
    }
    // A count that moved ticks (a short bump), unless motion is reduced.
    for (const r of shown) {
      const was = counts.get(r.classTsid);
      // Several steps: any step's count moving ticks, not only a step finishing (#397).
      const now = Array.isArray(r.steps) ? `${r.count}|${r.steps.map((s) => s.count || (s.done ? 1 : 0)).join(',')}` : r.count;
      counts.set(r.classTsid, now);
      if (was === undefined || was === now || reducedMotion()) continue;
      const row = list?.querySelector(`[data-pin="${CSS.escape(r.classTsid)}"]`);
      row?.animate?.([{ transform: 'scale(1)' }, { transform: 'scale(1.04)' }, { transform: 'scale(1)' }], { duration: 360, easing: 'ease-out' });
      setData('questPinsTick', `${r.classTsid}:${r.count}`);
    }
  }

  return { render, menu, button };
}
