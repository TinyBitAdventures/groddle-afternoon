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
 * SEARCH and SORT (ticket 77, Austin 2026-11-04): once the log holds QUEST_SEARCH_MIN quests, a row
 * under the tabs has a search box and a sort picker. The search keeps the cards whose name or steps
 * have every word typed (any case or accent), in all three tabs, as you type; Esc in it clears it,
 * and the tabs say "Active 3 of 40" while it is on. The picker (the card menu's rows, a check on the
 * one in use, as a bag's Sort level has) orders each tab: Newest first (the order game.js draws,
 * newest first as the client's QuestManager.as sortQuests 404-410 listed them), Oldest first, Name,
 * Most progress. The sort is kept in localStorage (QUEST_SORT_KEY); the search ends when the sheet
 * closes. Glitch's quest log had neither (QuestsDialog.as, QuestListUI.as): both are the remake's.
 * They are a layer over the cards game.js draws, so how the log is built stays game.js's.
 *
 * The cards' classes and the buttons' hooks are game.js's (.q-card, .q-title, .q-req, .q-bar,
 * .q-put-off, .story-offer, data-quest-try ...). QA: canvas data questTab, questTabCounts (every
 * card), questTabShown (the cards the search keeps), questSearch, questSort, contextMenu
 * ("quest-card:<id>", "quest-sort"); #quest-tools, #quest-search, #quest-sort.
 */

import { escapeText, CHEVRON_ICON } from './verb-menu.js?v=94936f9c';
import { bindContextTrigger, MORE_KEYS_LABEL } from './context-menu.js?v=55c84488';
import { focusWorld } from './focus-return.js?v=da190597';

export const QUEST_TABS = Object.freeze(['active', 'offered', 'done']);
const TAB_LABELS = { active: 'Active', offered: 'Offered', done: 'Done' };
const EMPTY = {
  active: 'No active quests right now.',
  offered: 'No quests are waiting to be started.',
  done: 'No finished quests yet.',
};

/** Ticket 77: the search and sort row shows once the log holds this many quests (every tab). */
export const QUEST_SEARCH_MIN = 8;
/** Ticket 77: where the sort choice is kept. */
export const QUEST_SORT_KEY = 'groddle.questSort';
/** Ticket 77: the sort picker's rows, the first the default. */
export const QUEST_SORTS = Object.freeze([
  Object.freeze({ id: 'newest', label: 'Newest first', tip: 'The quests you took or finished last come first.' }),
  Object.freeze({ id: 'oldest', label: 'Oldest first', tip: 'The quests you took or finished first come first.' }),
  Object.freeze({ id: 'name', label: 'Name', tip: 'From A to Z by name.' }),
  Object.freeze({ id: 'progress', label: 'Most progress', tip: 'The quests nearest done come first.' }),
]);
const NO_MATCH = {
  active: 'No active quests match that.',
  offered: 'No offered quests match that.',
  done: 'No finished quests match that.',
};

/** A sort id as one of QUEST_SORTS, else the default (Newest first). */
export function questSortId(id) {
  return QUEST_SORTS.some((s) => s.id === id) ? id : QUEST_SORTS[0].id;
}

/** The kept sort choice (no storage, or a bad value: the default). */
export function readQuestSort(storage) {
  try {
    return questSortId(storage?.getItem?.(QUEST_SORT_KEY));
  } catch {
    return QUEST_SORTS[0].id;
  }
}

/** This device's localStorage, or null (none, or refused). */
function deviceStorage() {
  try {
    return globalThis.localStorage || null;
  } catch {
    return null;
  }
}

/** Keep the sort choice (storage that refuses it: nothing kept). */
export function writeQuestSort(storage, id) {
  try {
    storage?.setItem?.(QUEST_SORT_KEY, questSortId(id));
  } catch {
    /* private mode */
  }
}

const fold = (x) => String(x ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

/** Whether a quest's words (its name and steps) have every word of the search, any case or accent. */
export function questMatches(words, query) {
  const want = fold(query).split(/\s+/).filter(Boolean);
  if (!want.length) return true;
  const hay = fold(words).replace(/\s+/g, ' ');
  return want.every((w) => hay.includes(w));
}

/** How far along a quest is over all its steps, 0 to 1 (no steps: 0). */
export function questProgress(requirements = []) {
  let got = 0;
  let need = 0;
  for (const r of requirements || []) {
    if (!r) continue;
    const num = Math.max(0, Number(r.num) || 0);
    need += num;
    got += Math.max(0, Math.min(num, Number(r.current) || 0));
  }
  return need ? got / need : 0;
}

/**
 * One tab's cards in a sort's order. `rows`: [{ n, title, progress, pinned? }] in the order game.js
 * drew them (newest first). Ties keep that order. Pinned quests come first whatever the sort (#142),
 * each group in the sort's order.
 */
export function orderQuestCards(rows, sort) {
  const list = [...rows].sort((a, b) => a.n - b.n);
  let sorted;
  switch (questSortId(sort)) {
    case 'oldest':
      sorted = list.reverse();
      break;
    case 'name':
      sorted = list.sort((a, b) => String(a.title).localeCompare(String(b.title), 'en', { sensitivity: 'base', numeric: true }) || a.n - b.n);
      break;
    case 'progress':
      sorted = list.sort((a, b) => (Number(b.progress) || 0) - (Number(a.progress) || 0) || a.n - b.n);
      break;
    default:
      sorted = list;
  }
  return [...sorted.filter((r) => r.pinned), ...sorted.filter((r) => !r.pinned)];
}

/**
 * G255 + #155: whether game.js swaps a fresh draw into the shown list. It swaps when the markup
 * changed (so a HUD update never replaces the buttons under the pointer), and also when the shown
 * list holds fewer elements than the draw: a list emptied or detached since the last swap kept
 * its old markup string, so it was never drawn again (a report had the tabs counting 26 active
 * over no rows).
 */
export function questLogNeedsSwap({ drawn = '', lastDrawn = '', shownCount = 0, drawnCount = 0 } = {}) {
  return drawn !== lastDrawn || (Number(shownCount) || 0) < (Number(drawnCount) || 0);
}

/** A tab's label: "Active 40", or "Active 3 of 40" while a search is on. */
export function questTabLabel(id, total, shown = total, searching = false) {
  const name = TAB_LABELS[id] || id;
  return searching ? `${name} ${shown} of ${total}` : `${name} ${total}`;
}

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
 * A pinned quest whose try has ended (report 127, offers.failed): what its row says in place of a
 * step and a count. The quest stays pinned and "Try again" is on its card in the log, which the row
 * opens. Timed quests ran out of time; a room quest can also fail by leaving the room.
 * @param {{ timer?: { durationSec?: number } }|null} def the quest
 */
export function failedQuestPin(def) {
  const timed = Boolean(def?.timer?.durationSec);
  return {
    step: timed ? 'Time ran out: try again' : 'This try ended: try again',
    short: timed ? 'time ran out' : 'try again',
    count: '',
    percent: 0,
    failed: true,
  };
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
  // ENCYC: the card's "In the Encyclopedia" link (game.js, js/encyclopedia-links.js), last.
  const ency = card?.querySelector?.('.ency-link');
  if (ency) rows.push({ id: 'encyclopedia', label: String(ency.textContent || '').trim(), tip: ency.title || '', focusBack: false, el: ency });
  return rows;
}

/**
 * @param {{ document?: Document, questInfo?: (classTsid: string) => ({ requirements?: object[], desc?: string, rewards?: object } | null),
 *   renderText?: (el: HTMLElement, markup: string) => void, setData?: (k: string, v: string) => void,
 *   onToggle?: () => void, extraActions?: (classTsid: string, card: HTMLElement) => HTMLElement[],
 *   storage?: Storage|null, onChange?: () => void }} opts
 *   storage: where the sort choice is kept (default: this device's localStorage, a device preference
 *   like the street map's); onChange: the search or sort changed (draw again).
 */
export function createQuestSheet({ document: doc = globalThis.document, questInfo = () => null, renderText = (el, s) => { el.textContent = s; }, setData = () => {}, onToggle = () => {}, extraActions = () => [], isPinned = () => false, contextMenu = null, storage = deviceStorage(), onChange = () => {} } = {}) {
  let tab = 'active';
  /** Ticket 77: the search box's words, the sort in use, and the row that holds them (mountTools). */
  let query = '';
  let sort = readQuestSort(storage);
  let tools = null;
  /** What the last arrange() counted: the cards the search keeps per tab, and whether it is on. */
  let lastShown = null;
  let searching = false;
  /** The box the cards are drawn into (bindMenu), so a pick finds the card as drawn now. */
  let shownBox = null;
  /** Cards the player opened or closed (by quest id); the first card of a tab starts open. */
  const toggled = new Map();
  /** A quest's details, or null when they cannot be had: one quest never stops the rest (lane questlist). */
  const infoOf = (id) => {
    try {
      return id ? questInfo(id) || null : null;
    } catch {
      return null;
    }
  };

  function cardId(card) {
    return card.dataset.quest || card.dataset.questPutOff || card.querySelector('.q-title')?.textContent?.trim() || '';
  }

  function makeCollapsible(card, firstInTab) {
    const id = cardId(card);
    const which = questCardTab(card);
    const info = infoOf(card.dataset.quest);
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
    if (card.dataset.questHold) {
      // On hold (game.js, js/quest-reach.js): the closed head says so; the open card says why.
      const h = doc.createElement('span');
      h.className = 'qc-step qc-hold';
      h.textContent = `On hold: waiting for the road to ${card.dataset.questHold}`;
      head.appendChild(h);
    } else if (step?.step) {
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
    // ENCYC: the Encyclopedia link (game.js draws it last on the card) goes under the buttons and the pin.
    const ency = body.querySelector(':scope > .ency-link');
    if (ency) body.appendChild(ency);

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

  /** A drawn card's words for the search: its name and its steps (ticket 77). */
  function cardWords(card) {
    const title = card.querySelector(':scope > .q-title')?.textContent || '';
    const steps = [...card.querySelectorAll(':scope > .q-req')].map((n) => n.textContent || '');
    return [title, ...steps].join(' ');
  }

  /** How far along a drawn card's quest is (done: all the way; offered: not started). */
  function cardProgress(card, which) {
    if (which === 'done') return 1;
    const info = infoOf(card.dataset.quest);
    return info ? questProgress(info.requirements) : 0;
  }

  /**
   * Sort a freshly drawn log box into the tabs: every card is tagged and made collapsible, put in
   * the sort's order, the other tabs' cards and the ones the search leaves out are hidden, and an
   * empty tab says so. Returns the counts per tab (every card, search or not).
   */
  function arrange(box) {
    const counts = { active: 0, offered: 0, done: 0 };
    const shown = { active: 0, offered: 0, done: 0 };
    const rows = { active: [], offered: [], done: [] };
    for (const n of [...box.children]) {
      if (!n.classList.contains('q-card')) {
        // The log's own "no active quests" line: the sheet says that per tab instead.
        n.remove();
        continue;
      }
      const which = questCardTab(n);
      counts[which] += 1;
      rows[which].push({
        el: n,
        n: rows[which].length,
        title: (n.querySelector(':scope > .q-title')?.textContent || '').replace(/\s*✓$/, ''),
        words: cardWords(n),
        progress: cardProgress(n, which),
        pinned: Boolean(n.dataset.quest && isPinned(n.dataset.quest)),
      });
    }
    const total = counts.active + counts.offered + counts.done;
    // Ticket 77: the search and sort row shows for a long log (or while it still holds a search).
    if (tools) tools.hidden = total < QUEST_SEARCH_MIN && !query;
    searching = Boolean(query.trim());
    for (const which of QUEST_TABS) {
      for (const row of orderQuestCards(rows[which], sort)) {
        const n = row.el;
        const match = !searching || questMatches(row.words, query);
        n.dataset.questTab = which;
        try {
          makeCollapsible(n, match && shown[which] === 0 && which === tab);
        } catch (err) {
          // A card that cannot be made collapsible stays as drawn: counted and shown, never a blank tab.
          globalThis.console?.warn?.('[quests] card left as drawn', cardId(n), err);
        }
        if (match) shown[which] += 1;
        n.hidden = which !== tab || !match;
        box.appendChild(n);
      }
    }
    if (!counts[tab] || !shown[tab]) {
      const empty = doc.createElement('p');
      empty.className = 'qc-empty';
      empty.textContent = counts[tab] ? NO_MATCH[tab] : EMPTY[tab];
      box.appendChild(empty);
    }
    lastShown = shown;
    setData('questTab', tab);
    setData('questTabCounts', QUEST_TABS.map((t) => `${t}:${counts[t]}`).join(','));
    setData('questTabShown', QUEST_TABS.map((t) => `${t}:${shown[t]}`).join(','));
    setData('questSearch', searching ? query.trim() : '');
    setData('questSort', sort);
    return counts;
  }

  /** The tab buttons' labels: "Active 2", or "Active 1 of 2" while a search is on. */
  function renderTabs(tablist, counts) {
    if (!tablist) return;
    for (const t of tablist.querySelectorAll('[role="tab"]')) {
      const id = t.dataset.tab;
      const label = questTabLabel(id, counts?.[id] ?? 0, lastShown?.[id] ?? counts?.[id] ?? 0, searching);
      if (t.textContent !== label) t.textContent = label;
      const on = id === tab;
      if (t.getAttribute('aria-selected') !== String(on)) t.setAttribute('aria-selected', on ? 'true' : 'false');
      t.tabIndex = on ? 0 : -1;
    }
  }

  /** The sort picker's words: the sort in use. */
  function sortLabel() {
    return QUEST_SORTS.find((s) => s.id === sort)?.label || QUEST_SORTS[0].label;
  }

  function drawSortButton() {
    const btn = tools?.querySelector('#quest-sort');
    if (!btn) return;
    const label = btn.querySelector('.qc-sort-label');
    if (label) label.textContent = sortLabel();
    btn.setAttribute('aria-label', `Sort quests: ${sortLabel()}`);
  }

  /** Ticket 77: the sort picker's menu under its button (the card menu's rows, a check on the one in use). */
  function openSortMenu(btn, keys) {
    if (!contextMenu || !btn) return false;
    const opened = contextMenu.open({
      title: 'Sort quests',
      rows: QUEST_SORTS.map((s) => ({ id: s.id, label: s.label, tip: s.tip, current: s.id === sort })),
      anchor: btn,
      keys,
      opener: btn,
      owner: 'quest-sort',
      focusIndex: Math.max(0, QUEST_SORTS.findIndex((s) => s.id === sort)),
      onPick: (id) => {
        const next = questSortId(id);
        if (next === sort) return;
        sort = next;
        writeQuestSort(storage, sort);
        drawSortButton();
        onChange();
      },
      onClose: () => btn.setAttribute('aria-expanded', 'false'),
    });
    if (opened) btn.setAttribute('aria-expanded', 'true');
    return opened;
  }

  /**
   * Ticket 77: the search box and the sort picker, in a row after `after` (the tabs). Typing in the
   * box never reaches the game's keys (game.js leaves a focused field alone); Esc in it clears it
   * first, then leaves the field as anywhere else.
   */
  function mountTools(after) {
    if (tools || !after?.parentNode) return tools;
    tools = doc.createElement('div');
    tools.id = 'quest-tools';
    tools.className = 'qc-tools';
    tools.hidden = true;
    const input = doc.createElement('input');
    input.type = 'search';
    input.id = 'quest-search';
    input.className = 'qc-search';
    input.placeholder = 'Search quests';
    input.setAttribute('aria-label', 'Search quests by name or step');
    input.setAttribute('aria-controls', 'quest');
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.addEventListener('input', () => {
      query = input.value;
      onChange();
    });
    input.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape' || !input.value) return;
      // The search goes first; the next Esc leaves the field (game.js), the one after closes the sheet.
      e.preventDefault();
      e.stopPropagation();
      input.value = '';
      query = '';
      onChange();
    });
    const btn = doc.createElement('button');
    btn.type = 'button';
    btn.id = 'quest-sort';
    btn.className = 'qc-sort';
    btn.setAttribute('aria-haspopup', 'menu');
    btn.setAttribute('aria-expanded', 'false');
    const label = doc.createElement('span');
    label.className = 'qc-sort-label';
    const chev = doc.createElement('span');
    chev.className = 'qc-sort-chev';
    chev.setAttribute('aria-hidden', 'true');
    chev.innerHTML = CHEVRON_ICON;
    btn.append(label, chev);
    btn.title = 'Sort quests';
    // A press that closed the menu (its own pointerdown, js/ui/context-menu.js) does not open it again.
    let pressClosed = false;
    btn.addEventListener('pointerdown', (e) => {
      pressClosed = contextMenu?.closedByPressAt?.() === e.timeStamp;
    });
    btn.addEventListener('click', (e) => {
      if (pressClosed) {
        pressClosed = false;
        return;
      }
      if (contextMenu?.isOpenFor('quest-sort')) {
        contextMenu.close({ focus: true });
        return;
      }
      openSortMenu(btn, e.detail === 0);
    });
    tools.append(input, btn);
    after.parentNode.insertBefore(tools, after.nextSibling);
    drawSortButton();
    return tools;
  }

  /** End the search (the sheet closed, or a pinned quest's card is being shown). */
  function clearSearch() {
    query = '';
    const input = tools?.querySelector('#quest-search');
    if (input) input.value = '';
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
    /** Close the cards' menu or the sort picker (the sheet closed). */
    closeMenu() {
      const owner = contextMenu?.owner() || '';
      if (owner.startsWith('quest-card:') || owner === 'quest-sort') contextMenu.close({ focus: false });
    },
    mountTools,
    clearSearch,
    query: () => query,
    sort: () => sort,
    /** Ticket 77: use a sort (QA, the picker's rows) and keep it. */
    setSort(id) {
      sort = questSortId(id);
      writeQuestSort(storage, sort);
      drawSortButton();
    },
    /** Ticket 77: search (QA; the box shows the words). */
    setQuery(words) {
      query = String(words ?? '');
      const input = tools?.querySelector('#quest-search');
      if (input && input.value !== query) input.value = query;
    },
    tab: () => tab,
    setTab(id) {
      if (QUEST_TABS.includes(id)) tab = id;
    },
    /** Open a quest's card (and its tab), e.g. from the pinned tracker. */
    reveal(classTsid, which = 'active') {
      if (QUEST_TABS.includes(which)) tab = which;
      toggled.set(classTsid, true);
      // A search could leave it out: the card asked for is shown.
      clearSearch();
    },
  };
}
