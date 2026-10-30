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
 * The cards' classes and the buttons' hooks are game.js's (.q-card, .q-title, .q-req, .q-bar,
 * .q-put-off, .story-offer, data-quest-try ...). QA: canvas data questTab, questTabCounts.
 */

import { escapeText } from './verb-menu.js?v=g469-1';

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
 * @param {{ document?: Document, questInfo?: (classTsid: string) => ({ requirements?: object[], desc?: string, rewards?: object } | null),
 *   renderText?: (el: HTMLElement, markup: string) => void, setData?: (k: string, v: string) => void,
 *   onToggle?: () => void, extraActions?: (classTsid: string, card: HTMLElement) => HTMLElement[] }} opts
 */
export function createQuestSheet({ document: doc = globalThis.document, questInfo = () => null, renderText = (el, s) => { el.textContent = s; }, setData = () => {}, onToggle = () => {}, extraActions = () => [] } = {}) {
  let tab = 'active';
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

  return {
    arrange,
    renderTabs,
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
