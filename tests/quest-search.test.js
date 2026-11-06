/**
 * Ticket 77 (Austin 2026-11-04): the Quests sheet's search box and sort picker (js/ui/quest-sheet.js),
 * in both interfaces. Once the log holds QUEST_SEARCH_MIN quests a row under the tabs has a search
 * box (a card's name and steps, every word, any case or accent, as you type; Esc clears it; the tabs
 * say "Active 3 of 40") and a sort picker (Newest first, the order game.js draws, as the client's
 * QuestManager.as sortQuests 404-410 listed it; Oldest first; Name; Most progress), kept in
 * localStorage. Glitch's quest log had neither: both are the remake's, a layer over the drawn cards.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { FakeEl, matches, memoryStore } from './social-fake-dom.js';
import {
  createQuestSheet,
  orderQuestCards,
  questMatches,
  questProgress,
  questSortId,
  questTabLabel,
  readQuestSort,
  writeQuestSort,
  QUEST_SEARCH_MIN,
  QUEST_SORT_KEY,
  QUEST_SORTS,
} from '../public/js/ui/quest-sheet.js?v=8dd5267c';
import { makeVerbRow } from '../public/js/ui/verb-menu.js?v=7716e570';

const pub = join(import.meta.dirname, '../public');
const read = (p) => readFileSync(join(pub, p), 'utf8');

/** FakeEl with what the sheet's cards use: :scope > selectors, childNodes, appendChild, insertBefore. */
class El extends FakeEl {
  get className() { return this.attrs.class || ''; }
  set className(v) { this.attrs.class = String(v); }
  get nodeType() { return 1; }
  get childNodes() { return this.children; }
  get parentNode() { return this.parentElement; }
  get nextSibling() {
    const kids = this.parentElement?.children || [];
    return kids[kids.indexOf(this) + 1] || null;
  }
  set innerHTML(v) { this._html = String(v); this.children = []; this._text = String(v).replace(/<[^>]+>/g, ''); }
  get innerHTML() { return this._html || ''; }
  appendChild(n) { this.append(n); return n; }
  insertBefore(n, ref) {
    if (!ref) return this.appendChild(n);
    this.adopt([n]);
    this.children.splice(this.children.indexOf(ref), 0, n);
    return n;
  }
  remove() {
    if (this.parentElement) this.parentElement.children = this.parentElement.children.filter((c) => c !== this);
    this.parentElement = null;
  }
  closest(sel) {
    for (let n = this; n; n = n.parentElement) if (n instanceof FakeEl && matches(n, sel)) return n;
    return null;
  }
  #pick(sel) {
    const parts = sel.split(',').map((p) => p.trim());
    return this.all().filter((n) => parts.some((p) => (p.startsWith(':scope >')
      ? n.parentElement === this && matches(n, p.slice(8).trim())
      : matches(n, p))));
  }
  querySelector(sel) { return this.#pick(sel)[0] || null; }
  querySelectorAll(sel) { return this.#pick(sel); }
}

const doc = { createElement: (t) => new El(t), activeElement: null };

/** A card as game.js draws it: an active one names its quest; put off and done ones do not. */
function drawn({ title, quest = '', kind = 'active', steps = [] }) {
  const c = new El('div');
  c.className = `q-card${kind === 'done' ? ' done' : ''}${kind === 'offered' ? ' q-put-off' : ''}`;
  if (quest && kind === 'active') c.dataset.quest = quest;
  if (kind === 'offered') c.dataset.questPutOff = quest;
  const t = new El('div');
  t.className = 'q-title';
  t.textContent = title + (kind === 'done' ? ' ✓' : '');
  c.append(t);
  for (const s of steps) {
    const r = new El('div');
    r.className = 'q-req';
    r.textContent = s;
    c.append(r);
  }
  return c;
}

// Newest first, as game.js draws them: the active quests, two put off, then the finished ones.
const QUESTS = [
  { title: 'Piggy Petter', quest: 'pet_piggies', steps: ['Pet Piggies (2/6)'], reqs: [{ desc: 'Pet Piggies', current: 2, num: 6 }] },
  { title: 'Bean There', quest: 'beans', steps: ['Harvest beans (9/10)'], reqs: [{ desc: 'Harvest beans', current: 9, num: 10 }] },
  { title: 'Égalité Fries', quest: 'fries', steps: ['Cook fries'], reqs: [{ desc: 'Cook fries', current: 0, num: 1 }] },
  { title: 'A Nibble or Two', quest: 'nibble', steps: ['Nibble a Piggy (1/2)'], reqs: [{ desc: 'Nibble a Piggy', current: 1, num: 2 }] },
  { title: 'Zilloween', quest: 'zillo', steps: ['Visit a shrine (3/4)', 'Donate (0/4)'], reqs: [{ desc: 'Visit a shrine', current: 3, num: 4 }, { desc: 'Donate', current: 0, num: 4 }] },
  { title: 'Mining 101', quest: 'mining', steps: ['Mine rocks (5/5)', 'Smelt (1/1)', 'Sell (0/2)'], reqs: [{ desc: 'Mine rocks', current: 5, num: 5 }, { desc: 'Smelt', current: 1, num: 1 }, { desc: 'Sell', current: 0, num: 2 }] },
];

function setup({ storage = memoryStore(), quests = QUESTS, offered = 2, done = 2, closedAt = -1 } = {}) {
  const info = Object.fromEntries(quests.map((q) => [q.quest, { requirements: q.reqs }]));
  const data = {};
  const opened = [];
  let changes = 0;
  const menu = {
    open: (o) => { opened.push(o); return true; },
    isOpenFor: () => false,
    owner: () => '',
    close() {},
    closedByPressAt: () => closedAt,
  };
  const card = new El('div');
  const tabs = new El('div');
  tabs.id = 'quest-tabs';
  for (const t of ['active', 'offered', 'done']) {
    const b = new El('button');
    b.setAttribute('role', 'tab');
    b.dataset.tab = t;
    tabs.append(b);
  }
  card.append(tabs);
  const sheet = createQuestSheet({
    document: doc,
    questInfo: (id) => info[id] || null,
    setData: (k, v) => { data[k] = v; },
    contextMenu: menu,
    storage,
    onChange: () => { changes += 1; },
  });
  const tools = sheet.mountTools(tabs);
  const draw = () => {
    const box = new El('div');
    for (const q of quests) box.append(drawn(q));
    for (let i = 0; i < offered; i += 1) box.append(drawn({ title: `Put Off ${i + 1}`, quest: `off_${i}`, kind: 'offered', steps: ['Not started yet.', 'Find a pig'] }));
    for (let i = 0; i < done; i += 1) box.append(drawn({ title: `Finished ${i + 1}`, kind: 'done', steps: ['Pet a pig'] }));
    const counts = sheet.arrange(box);
    sheet.renderTabs(tabs, counts);
    return { box, counts };
  };
  const shown = (box, tab = 'active') => box.children.filter((n) => n.dataset?.questTab === tab && !n.hidden).map((n) => n.querySelector('.qc-title').textContent);
  return { sheet, tools, tabs, data, opened, storage, draw, shown, changes: () => changes };
}

describe('the pure parts', () => {
  it('a search keeps a quest with every word in its name or steps, any case or accent', () => {
    assert.equal(questMatches('Piggy Petter Pet Piggies (2/6)', 'pet'), true);
    assert.equal(questMatches('Piggy Petter Pet Piggies (2/6)', 'PIGGIES petter'), true);
    assert.equal(questMatches('Piggy Petter Pet Piggies (2/6)', 'piggies bean'), false);
    assert.equal(questMatches('Égalité Fries', 'egalite'), true);
    assert.equal(questMatches('Anything', '   '), true);
  });

  it('progress counts every step', () => {
    assert.equal(questProgress([{ current: 9, num: 10 }]), 0.9);
    assert.equal(questProgress([{ current: 5, num: 5 }, { current: 1, num: 1 }, { current: 0, num: 2 }]), 0.75);
    assert.equal(questProgress([{ current: 12, num: 4 }]), 1, 'never past the end');
    assert.equal(questProgress([]), 0);
  });

  it('each sort orders a tab; ties keep the drawn (newest first) order', () => {
    const rows = [
      { n: 0, title: 'beta', progress: 0.5 },
      { n: 1, title: 'Alpha', progress: 0.5 },
      { n: 2, title: 'gamma 10', progress: 0.9 },
      { n: 3, title: 'gamma 9', progress: 0 },
    ];
    const ids = (s) => orderQuestCards(rows, s).map((r) => r.n);
    assert.deepEqual(ids('newest'), [0, 1, 2, 3]);
    assert.deepEqual(ids('oldest'), [3, 2, 1, 0]);
    assert.deepEqual(ids('name'), [1, 0, 3, 2], 'A to Z, any case, numbers as numbers');
    assert.deepEqual(ids('progress'), [2, 0, 1, 3]);
    assert.deepEqual(ids('nonsense'), [0, 1, 2, 3], 'a bad id is the default');
  });

  it('the picker lists four sorts, Newest first the default', () => {
    assert.deepEqual(QUEST_SORTS.map((s) => [s.id, s.label]), [['newest', 'Newest first'], ['oldest', 'Oldest first'], ['name', 'Name'], ['progress', 'Most progress']]);
    assert.equal(questSortId(undefined), 'newest');
    assert.equal(questSortId('name'), 'name');
  });

  it('the sort is kept in localStorage; a bad or missing value, or no storage, is the default', () => {
    const store = memoryStore();
    assert.equal(readQuestSort(store), 'newest');
    writeQuestSort(store, 'progress');
    assert.equal(store.m.get(QUEST_SORT_KEY), 'progress');
    assert.equal(QUEST_SORT_KEY, 'groddle.questSort');
    assert.equal(readQuestSort(store), 'progress');
    assert.equal(readQuestSort(memoryStore({ [QUEST_SORT_KEY]: 'weird' })), 'newest');
    assert.equal(readQuestSort(null), 'newest');
    assert.equal(readQuestSort({ getItem() { throw new Error('denied'); } }), 'newest');
    assert.doesNotThrow(() => writeQuestSort({ setItem() { throw new Error('full'); } }, 'name'));
  });

  it('a tab says how many the search keeps of how many', () => {
    assert.equal(questTabLabel('active', 40), 'Active 40');
    assert.equal(questTabLabel('active', 40, 3, true), 'Active 3 of 40');
    assert.equal(questTabLabel('done', 27, 0, true), 'Done 0 of 27');
  });
});

describe('the sheet', () => {
  it('a long log shows the search and sort row after the tabs; a short one does not', () => {
    const s = setup();
    assert.equal(s.tools.id, 'quest-tools');
    assert.equal(s.tabs.nextSibling, s.tools);
    assert.ok(s.tools.querySelector('#quest-search'));
    assert.equal(s.tools.querySelector('#quest-sort').getAttribute('aria-haspopup'), 'menu');
    s.draw();
    assert.equal(s.tools.hidden, false, `${QUESTS.length + 4} quests`);
    const few = setup({ quests: QUESTS.slice(0, 3), offered: 1, done: 1 });
    few.draw();
    assert.equal(QUEST_SEARCH_MIN, 8);
    assert.equal(few.tools.hidden, true, '5 quests');
  });

  it('Newest first keeps the drawn order; the first card shown starts open', () => {
    const s = setup();
    const { box } = s.draw();
    assert.deepEqual(s.shown(box), QUESTS.map((q) => q.title));
    assert.equal(s.data.questSort, 'newest');
    assert.equal(s.tools.querySelector('.qc-sort-label').textContent, 'Newest first');
    const first = box.children.find((n) => !n.hidden);
    assert.equal(first.classList.contains('is-open'), true);
  });

  it('Oldest first, Name and Most progress reorder every tab, and the choice is kept', () => {
    const store = memoryStore();
    const s = setup({ storage: store });
    s.sheet.setSort('oldest');
    let { box } = s.draw();
    assert.deepEqual(s.shown(box), QUESTS.map((q) => q.title).reverse());
    assert.equal(store.m.get(QUEST_SORT_KEY), 'oldest');
    s.sheet.setSort('name');
    ({ box } = s.draw());
    assert.deepEqual(s.shown(box), ['A Nibble or Two', 'Bean There', 'Égalité Fries', 'Mining 101', 'Piggy Petter', 'Zilloween']);
    s.sheet.setSort('progress');
    ({ box } = s.draw());
    assert.deepEqual(s.shown(box), ['Bean There', 'Mining 101', 'A Nibble or Two', 'Zilloween', 'Piggy Petter', 'Égalité Fries']);
    assert.equal(s.tools.querySelector('#quest-sort').getAttribute('aria-label'), 'Sort quests: Most progress');
    s.sheet.setTab('done');
    s.sheet.setSort('oldest');
    ({ box } = s.draw());
    assert.deepEqual(s.shown(box, 'done'), ['Finished 2', 'Finished 1']);
    // A new sheet (the next visit) starts on the kept sort.
    const again = setup({ storage: store });
    assert.equal(again.sheet.sort(), 'oldest');
  });

  it('the search filters Active, Offered and Done by name and step; the tabs count the matches', () => {
    const s = setup();
    s.sheet.setQuery('pig');
    const { box, counts } = s.draw();
    assert.deepEqual(counts, { active: 6, offered: 2, done: 2 }, 'the counts stay every card');
    assert.deepEqual(s.shown(box), ['Piggy Petter', 'A Nibble or Two'], 'by name, and by a step (Nibble a Piggy)');
    assert.equal(s.data.questTabShown, 'active:2,offered:2,done:2');
    assert.equal(s.data.questSearch, 'pig');
    assert.deepEqual(s.tabs.children.map((t) => t.textContent), ['Active 2 of 6', 'Offered 2 of 2', 'Done 2 of 2']);
    s.sheet.setQuery('bean');
    const b = s.draw();
    assert.deepEqual(s.shown(b.box), ['Bean There']);
    assert.deepEqual(s.tabs.children.map((t) => t.textContent), ['Active 1 of 6', 'Offered 0 of 2', 'Done 0 of 2']);
    s.sheet.setTab('offered');
    const o = s.draw();
    assert.equal(o.box.querySelector('.qc-empty').textContent, 'No offered quests match that.');
    s.sheet.clearSearch();
    const c = s.draw();
    assert.deepEqual(s.tabs.children.map((t) => t.textContent), ['Active 6', 'Offered 2', 'Done 2']);
    assert.equal(c.box.querySelector('.qc-empty'), null);
    assert.equal(s.data.questSearch, '');
  });

  it('typing searches as you go; Esc clears the box first and stays out of the game', () => {
    const s = setup();
    const input = s.tools.querySelector('#quest-search');
    input.value = 'mining';
    input.dispatch('input');
    assert.equal(s.sheet.query(), 'mining');
    assert.equal(s.changes(), 1, 'drawn again');
    const esc = input.dispatch('keydown', { key: 'Escape' });
    assert.equal(esc.stopped, true);
    assert.equal(esc.defaultPrevented, true);
    assert.equal(input.value, '');
    assert.equal(s.sheet.query(), '');
    assert.equal(s.changes(), 2);
    // Empty, Esc goes on to game.js, which leaves the field (the next Esc closes the sheet).
    const again = input.dispatch('keydown', { key: 'Escape' });
    assert.equal(again.stopped, false);
  });

  it('showing a pinned quest\'s card ends the search, so the card is there', () => {
    const s = setup();
    s.sheet.setQuery('bean');
    s.sheet.reveal('pet_piggies', 'active');
    assert.equal(s.sheet.query(), '');
    assert.equal(s.tools.querySelector('#quest-search').value, '');
    const { box } = s.draw();
    assert.ok(s.shown(box).includes('Piggy Petter'));
  });

  it('the sort picker opens the card menu\'s rows under its button, a check on the one in use', () => {
    const store = memoryStore();
    const s = setup({ storage: store });
    const btn = s.tools.querySelector('#quest-sort');
    btn.dispatch('pointerdown', { timeStamp: 5 });
    btn.dispatch('click', { detail: 1 });
    assert.equal(s.opened.length, 1);
    const o = s.opened[0];
    assert.equal(o.owner, 'quest-sort');
    assert.equal(o.title, 'Sort quests');
    assert.equal(o.anchor, btn);
    assert.equal(o.keys, false);
    assert.deepEqual(o.rows.map((r) => [r.id, r.label, r.current]), [['newest', 'Newest first', true], ['oldest', 'Oldest first', false], ['name', 'Name', false], ['progress', 'Most progress', false]]);
    assert.equal(btn.getAttribute('aria-expanded'), 'true');
    o.onPick('name', { keys: false });
    assert.equal(s.sheet.sort(), 'name');
    assert.equal(store.m.get(QUEST_SORT_KEY), 'name');
    assert.equal(btn.querySelector('.qc-sort-label').textContent, 'Name');
    assert.equal(s.changes(), 1);
    o.onClose();
    assert.equal(btn.getAttribute('aria-expanded'), 'false');
    // From the keys (Enter or Space on the button: a click with no detail) focus comes back to it.
    btn.dispatch('click', { detail: 0 });
    assert.equal(s.opened[1].keys, true);
    assert.equal(s.opened[1].focusIndex, 2, 'the sort in use is focused');
  });

  it('a press that closed the open picker does not open it again', () => {
    const s = setup({ closedAt: 42 });
    const btn = s.tools.querySelector('#quest-sort');
    // The menu's own pointerdown (capture, js/ui/context-menu.js) closed it at this press.
    btn.dispatch('pointerdown', { timeStamp: 42 });
    btn.dispatch('click', { detail: 1 });
    assert.equal(s.opened.length, 0);
    btn.dispatch('pointerdown', { timeStamp: 50 });
    btn.dispatch('click', { detail: 1 });
    assert.equal(s.opened.length, 1, 'the next press opens it');
  });
});

describe('a menu row of a choice is a radio (js/ui/verb-menu.js makeVerbRow)', () => {
  it('current true or false: menuitemradio and aria-checked, with the check', () => {
    const on = makeVerbRow(doc, { label: 'Name', current: true });
    assert.equal(on.getAttribute('role'), 'menuitemradio');
    assert.equal(on.getAttribute('aria-checked'), 'true');
    assert.match(on.innerHTML, /vm-check/);
    const off = makeVerbRow(doc, { label: 'Oldest first', current: false });
    assert.equal(off.getAttribute('aria-checked'), 'false');
    assert.equal(makeVerbRow(doc, { label: 'Pin to screen' }).getAttribute('role'), 'menuitem');
  });

  it('the context menu passes a row\'s current on', () => {
    assert.match(read('js/ui/context-menu.js'), /typeof r\.current === 'boolean' \? \{ current: r\.current \} : \{\}/);
  });
});

describe('the wiring (both interfaces)', () => {
  it('game.js mounts the row after the tabs and draws again on a change; the sheet keeps the sort on this device', () => {
    const game = read('game.js');
    assert.match(game, /\n  onChange: \(\) => updateHud\(\),\n\}\);\nquestSheet\.bindMenu/);
    assert.match(read('js/ui/quest-sheet.js'), /storage = deviceStorage\(\)/);
    assert.match(game, /questSheet\.mountTools\(document\.getElementById\('quest-tabs'\)\);/);
    assert.match(game, /function closeQuestPanel\(\) \{[\s\S]{0,220}questSheet\.clearSearch\(\);/);
  });

  it('a focused field keeps its keys from the game\'s shortcuts (game.js window keydown)', () => {
    assert.match(read('game.js'), /window\.addEventListener\('keydown', \(e\) => \{\n    if \(e\.target\?\.matches\?\.\('input, textarea, select, \[contenteditable="true"\]'\)\) \{/);
  });

  it('Modern and Classic both style the row; Classic gives the box the 2012 field', () => {
    const modern = read('style.css');
    for (const sel of ['#quest-panel .qc-tools {', '#quest-panel .qc-tools[hidden]', '#quest-panel .qc-search {', '#quest-panel .qc-sort {']) {
      assert.ok(modern.includes(`[data-ui="modern"] #game-root ${sel}`), sel);
    }
    const classic = read('css/classic.css');
    for (const sel of ['#quest-panel .qc-tools {', '#quest-panel .qc-tools[hidden]', '#quest-panel .qc-search {', '#quest-panel .qc-sort {']) {
      assert.ok(classic.includes(`:root[data-ui="classic"] #game-root ${sel}`), sel);
    }
    assert.match(classic, /#quest-panel \.qc-search \{[^}]*border: 1px solid var\(--c-classic-input-border\);[^}]*background: var\(--c-classic-input\);/);
  });
});
