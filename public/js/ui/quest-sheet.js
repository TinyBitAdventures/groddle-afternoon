/**
 * VERBS (phase 2, Warm paper): the Quests side sheet's view (the HUD mock's Quests panel). game.js
 * still draws every card of the log (updateHud: the active quests with their Enter buttons, the
 * quests put off with "Not right now", the story quests' offers, the finished ones); this module
 * sorts them into the sheet's three tabs and makes each card collapsible:
 *
 * - Active: the quests you are on. Offered: the ones waiting to be started (put off, or a story
 *   quest's offer). Done: the finished ones. The tab labels carry their counts.
 * - A card is one line when closed: its title, the step you are on and its count, and a bar.
 *   Open, it adds the quest's words, every step, its rewards and its buttons.
 *
 * RIGHTCLICK (Austin 2026-11-03, right-click audit item 7): a right-click on a card (Ctrl+click on
 * a Mac), or Shift+F10 or the Menu key with its head focused, opens its menu, matching the pinned
 * tracker's (js/ui/quest-pin-menu.js): Pin to screen or Unpin, Open or Close, then the card's own
 * buttons (Try it, Enter ..., Not right now, a story quest's way in). Every row presses the card's
 * own control, so nothing new is in it (R3). A left click on the head still opens or closes it.
 *
 * The cards' classes and the buttons' hooks are game.js's (.q-card, .q-title, .q-req, .q-bar,
 * .q-put-off, .story-offer, data-quest-try ...). QA: canvas data questTab, questTabCounts,
 * contextMenu ("quest-card:<id>").
 */

import { escapeText } from './verb-menu.js?v=74b6dfa0';
import { bindContextTrigger, MORE_KEYS_LABEL } from './context-menu.js?v=b3d24c15';
import { focusWorld } from './focus-return.js?v=c34f16a0';

export const QUEST_TABS = Object.freeze(['active', 'offered', 'done']);
const TAB_LABELS = { active: 'Active', offered: 'Offered', done: 'Done' };
const EMPTY = {
  active: 'No active quests right now.',
  offered: 'No quests are waiting to be started.',
  done: 'No finished quests yet.',
};

/** Which tab a drawn card belongs in. */
export function questCardTab(card) {
  if (card.classList.contains('done')) return 'done';
  if (card.classList.contains('q-put-off') || card.classList.contains('story-offer')) return 'offered';
  return 'active';
}

/** A quest's rewards as short chips: "+200 iMG", "+50 currants", "+30 energy", "+10 favor". */
export function questRewardChips(rewards = {}) {
  const out = [];
  const n = (v) => Math.round(Number(v) || 0);
  if (n(rewards.xp) > 0) out.push(`+${n(rewards.xp).toLocaleString('en-US')} iMG`);
  if (n(rewards.currants) > 0) out.push(`+${n(rewards.currants).toLocaleString('en-US')} currants`);
  if (n(rewards.energy) > 0) out.push(`+${n(rewards.energy)} energy`);
  if (n(rewards.mood) > 0) out.push(`+${n(rewards.mood)} mood`);
  const favor = Object.values(rewards.favor || {}).reduce((sum, f) => sum + n(f?.points), 0);
  if (favor > 0) out.push(`+${favor} favor`);
  return out;
}

/**
 * Where a quest is: the step you are on (the first one not done, else the last), its count and
 * how far along it is. `requirements`: [{ desc, current, num }].
 */
export function questStep(requirements = []) {
  const reqs = requirements.filter(Boolean);
  if (!reqs.length) return { step: '', count: '', percent: 0 };
  const cur = reqs.find((r) => (Number(r.current) || 0) < (Number(r.num) || 0)) || reqs[reqs.length - 1];
  const num = Math.max(0, Number(cur.num) || 0);
  const got = Math.max(0, Math.min(num, Number(cur.current) || 0));
  return { step: String(cur.desc || ''), count: num ? `${got}/${num}` : '', percent: num ? Math.round((got / num) * 100) : 100 };
}

/**
 * A drawn card's menu rows (RIGHTCLICK), each pressing one of the card's own controls (`el`):
 * Pin to screen or Unpin (its Pin button: disabled with its reason when two are pinned), Open or
 * Close (its head), then its buttons in the order it shows them.
 * @param {HTMLElement} card a .q-card made collapsible by arrange()
 * @returns {{ id: string, label: string, tip: string, disabled?: boolean, reason?: string, focusBack?: boolean, el: HTMLElement }[]}
 */
export function questCardMenuRows(card) {
  const rows = [];
  const pin = card?.querySelector?.('.qc-pin');
  if (pin) {
    const pinned = pin.getAttribute('aria-pressed') === 'true';
    const full = pin.getAttribute('aria-disabled') === 'true';
    rows.push({
      id: 'pin',
      label: pinned ? 'Unpin' : 'Pin to screen',
      tip: pinned ? 'Takes it off your screen. The quest stays in Quests.' : 'Shows it on your screen with its count.',
      disabled: full,
      reason: full ? pin.title || '' : '',
      el: pin,
    });
  }
  const head = card?.querySelector?.('.qc-head');
  if (head) {
    const open = card.classList.contains('is-open');
    rows.push({ id: 'toggle', label: open ? 'Close' : 'Open', tip: open ? 'Folds the card to one line.' : 'Shows its words, every step and its rewards.', el: head });
  }
  let n = 0;
  for (const btn of card?.querySelectorAll?.('.content-action-btn') || []) {
    const label = String(btn.textContent || '').trim();
    if (!label) continue;
    n += 1;
    // What it opens (a dialog, a quest instance) takes the focus.
    rows.push({ id: `act${n}`, label, tip: btn.title || label, disabled: btn.disabled === true || btn.getAttribute('aria-disabled') === 'true', reason: btn.title || '', focusBack: false, el: btn });
  }
  return rows;
}

/**
 * @param {{ document?: Document, questInfo?: (classTsid: string) => ({ requirements?: object[], desc?: string, rewards?: object } | null),
 *   renderText?: (el: HTMLElement, markup: string) => void, setData?: (k: string, v: string) => void,
 *   onToggle?: () => void, extraActions?: (classTsid: string, card: HTMLElement) => HTMLElement[] }} opts
 */
export function createQuestSheet({ document: doc = globalThis.document, questInfo = () => null, renderText = (el, s) => { el.textContent = s; }, setData = () => {}, onToggle = () => {}, extraActions = () => [], contextMenu = null } = {}) {
  let tab = 'active';
  /** The box the cards are drawn into (bindMenu), so a pick finds the card as drawn now. */
  let shownBox = null;
  /** Cards the player opened or closed (by quest id); the first card of a tab starts open. */
  const toggled = new Map();

  function cardId(card) {
    return card.dataset.quest || card.dataset.questPutOff || card.querySelector('.q-title')?.textContent?.trim() || '';
  }

  function makeCollapsible(card, firstInTab) {
    const id = cardId(card);
    const which = questCardTab(card);
    const info = card.dataset.quest ? questInfo(card.dataset.quest) : null;
    const title = card.querySelector(':scope > .q-title');
    const rest = [...card.childNodes].filter((n) => n !== title);
    const open = toggled.has(id) ? toggled.get(id) : firstInTab && which !== 'done';
    const bodyId = `qc-body-${String(id).replace(/[^a-zA-Z0-9_-]/g, '_')}`;

    const head = doc.createElement('button');
    head.type = 'button';
    head.className = 'qc-head';
    head.setAttribute('aria-expanded', open ? 'true' : 'false');
    head.setAttribute('aria-controls', bodyId);
    const titleEl = doc.createElement('span');
    titleEl.className = 'q-title qc-title';
    titleEl.textContent = title ? title.textContent.replace(/\s*✓$/, '') : id;
    head.appendChild(titleEl);
    const step = info ? questStep(info.requirements) : null;
    if (step?.count) {
      const count = doc.createElement('span');
      count.className = 'qc-count';
      count.textContent = step.count;
      head.appendChild(count);
    } else if (which === 'done') {
      const count = doc.createElement('span');
      count.className = 'qc-count qc-done';
      count.textContent = 'Done';
      head.appendChild(count);
    }
    if (step?.step) {
      const s = doc.createElement('span');
      s.className = 'qc-step';
      renderText(s, step.step);
      head.appendChild(s);
    }

    const body = doc.createElement('div');
    body.className = 'qc-body';
    body.id = bodyId;
    if (info?.desc) {
      const desc = doc.createElement('p');
      desc.className = 'q-req qc-desc';
      renderText(desc, info.desc);
      body.appendChild(desc);
    }
    // One step: its row is the head's; several: every step with its own bar stays in the body.
    const reqRows = rest.filter((n) => n.nodeType === 1 && (n.classList.contains('q-req') || n.classList.contains('q-bar')));
    const single = info && (info.requirements || []).length <= 1;
    for (const n of rest) {
      if (single && reqRows.includes(n)) continue;
      body.appendChild(n);
    }
    const chips = info ? questRewardChips(info.rewards) : [];
    if (chips.length) {
      const box = doc.createElement('div');
      box.className = 'qc-chips';
      box.setAttribute('aria-label', 'Rewards');
      box.innerHTML = chips.map((c) => `<span class="qc-chip">${escapeText(c)}</span>`).join('');
      // The buttons go last, under the rewards.
      const firstButton = body.querySelector(':scope > button, :scope > .qc-actions');
      body.insertBefore(box, firstButton || null);
    }
    for (const extra of extraActions(card.dataset.quest || '', card)) body.appendChild(extra);

    card.replaceChildren(head);
    if (step) {
      const bar = doc.createElement('div');
      bar.className = 'q-bar qc-bar';
      bar.setAttribute('aria-hidden', 'true');
      const fill = doc.createElement('i');
      fill.style.width = `${step.percent}%`;
      bar.appendChild(fill);
      card.appendChild(bar);
    }
    card.appendChild(body);
    card.classList.add('qc');
    card.classList.toggle('is-open', open);
    // RIGHTCLICK: the card has a menu of ours (js/ui/context-guard.js stops the browser's over it).
    card.dataset.ctx = 'quest-card';
    head.setAttribute('aria-keyshortcuts', 'Shift+F10');
    head.setAttribute('aria-label', `${[titleEl.textContent, step?.count || (which === 'done' ? 'Done' : ''), head.querySelector('.qc-step')?.textContent || ''].filter(Boolean).join(', ')}. ${MORE_KEYS_LABEL}`);
    head.addEventListener('click', () => {
      const now = !card.classList.contains('is-open');
      card.classList.toggle('is-open', now);
      head.setAttribute('aria-expanded', now ? 'true' : 'false');
      toggled.set(id, now);
      onToggle();
    });
  }

  /**
   * Sort a freshly drawn log box into the tabs: every card is tagged and made collapsible, the
   * other tabs' cards are hidden, and an empty tab says so. Returns the counts per tab.
   */
  function arrange(box) {
    const counts = { active: 0, offered: 0, done: 0 };
    const seen = { active: 0, offered: 0, done: 0 };
    for (const n of [...box.children]) {
      if (!n.classList.contains('q-card')) {
        // The log's own "no active quests" line: the sheet says that per tab instead.
        n.remove();
        continue;
      }
      const which = questCardTab(n);
      counts[which] += 1;
      n.dataset.questTab = which;
      makeCollapsible(n, seen[which] === 0 && which === tab);
      seen[which] += which === tab ? 1 : 0;
      n.hidden = which !== tab;
    }
    if (!counts[tab]) {
      const empty = doc.createElement('p');
      empty.className = 'qc-empty';
      empty.textContent = EMPTY[tab];
      box.appendChild(empty);
    }
    setData('questTab', tab);
    setData('questTabCounts', QUEST_TABS.map((t) => `${t}:${counts[t]}`).join(','));
    return counts;
  }

  /** The tab buttons' labels: "Active 2". */
  function renderTabs(tablist, counts) {
    if (!tablist) return;
    for (const t of tablist.querySelectorAll('[role="tab"]')) {
      const id = t.dataset.tab;
      const label = `${TAB_LABELS[id] || id} ${counts?.[id] ?? 0}`;
      if (t.textContent !== label) t.textContent = label;
      const on = id === tab;
      if (t.getAttribute('aria-selected') !== String(on)) t.setAttribute('aria-selected', on ? 'true' : 'false');
      t.tabIndex = on ? 0 : -1;
    }
  }

  /** The card for a quest as drawn now in the shown box. */
  function liveCard(id) {
    if (!shownBox || !id) return null;
    return [...shownBox.querySelectorAll('.q-card')].find((c) => cardId(c) === id) || null;
  }

  /** RIGHTCLICK: a card's menu at the pointer, or beside its head from the keys. */
  function openCardMenu(card, { at = null, keys = false } = {}) {
    if (!contextMenu || !card) return false;
    const id = cardId(card);
    const rows = questCardMenuRows(card);
    const head = card.querySelector('.qc-head');
    return contextMenu.open({
      title: card.querySelector('.qc-title')?.textContent || id,
      rows,
      at,
      anchor: head || card,
      keys,
      opener: head,
      findOpener: () => liveCard(id)?.querySelector('.qc-head') || null,
      owner: `quest-card:${id}`,
      onPick: (rowId, { keys: fromKeys }) => {
        // The card's own control, as drawn now (the log redraws while the menu is open).
        const now = questCardMenuRows(liveCard(id) || card).find((r) => r.id === rowId);
        if (!now || now.disabled) return;
        now.el.click();
        // Opened by the pointer, the keys go back to the world (the Pin button focuses itself again).
        if (!fromKeys && rowId !== 'toggle' && now.focusBack !== false) focusWorld(doc);
      },
    });
  }

  return {
    arrange,
    renderTabs,
    /**
     * RIGHTCLICK: wire the cards' menu on the box they are shown in (once): right-click, Ctrl+click
     * on a Mac, Shift+F10 or the Menu key on a focused head or button in a card.
     */
    bindMenu(box) {
      if (!box || shownBox === box) return;
      shownBox = box;
      bindContextTrigger(box, {
        rowOf: (t) => {
          const card = t?.closest?.('.q-card.qc');
          return card && box.contains(card) ? card : null;
        },
        isOpenFor: (card) => Boolean(contextMenu?.isOpenFor(`quest-card:${cardId(card)}`)),
        open: (card, { at, keys }) => openCardMenu(card, { at, keys }),
      });
    },
    /** Close the cards' menu (the sheet closed). */
    closeMenu() {
      if (contextMenu?.owner()?.startsWith('quest-card:')) contextMenu.close({ focus: false });
    },
    tab: () => tab,
    setTab(id) {
      if (QUEST_TABS.includes(id)) tab = id;
    },
    /** Open a quest's card (and its tab), e.g. from the pinned tracker. */
    reveal(classTsid, which = 'active') {
      if (QUEST_TABS.includes(which)) tab = which;
      toggled.set(classTsid, true);
    },
  };
}
