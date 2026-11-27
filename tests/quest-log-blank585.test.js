/**
 * #585: "I cant see any quest objectives when loading up the quest tab". The Quests sheet read
 * "Active 8 · Offered 4 · Done 8" over a blank list: the report said "quest:active 0/20 cards, tabs
 * 8/4/8", every card in the list and none shown, and no "No active quests" line either. The list
 * is swapped for a fresh draw only when the markup changed or rows were lost (G255, #155), so a list
 * holding every card but showing none stayed blank, through closing and opening the sheet. Now:
 * - the redraw also swaps when the shown list shows fewer rows than the draw (questLogNeedsSwap,
 *   visibleRowCount);
 * - a card whose words, progress or pin throw is still counted, sorted and shown (arrange), and a
 *   quest whose steps are not a list, or a saved quest without its progress, still draws.
 */
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadContentCatalogsFromDir } from '../public/js/content-catalogs.js?v=c9b84764';
import { createQuestState, getQuestProgress, listQuestLogNewestFirst, listQuests } from '../public/js/quests.js?v=f68437db';
import { createQuestSheet, questLogNeedsSwap, questProgress, questStep, visibleRowCount, styledOutRowCount, QUEST_STYLED_OUT_TEXT } from '../public/js/ui/quest-sheet.js?v=7409d5d8';
import { questLogDetail } from '../public/js/features/bug-report-feature.js?v=29cf9d35';
import { FakeEl, matches } from './social-fake-dom.js';

const pub = join(import.meta.dirname, '../public');
const game = readFileSync(join(pub, 'game.js'), 'utf8');
const css = readFileSync(join(pub, 'style.css'), 'utf8');

before(async () => {
  await loadContentCatalogsFromDir(join(pub, 'assets/content'));
});

/** The FakeEl the Quests sheet needs (as tests/quest-list-count.test.js). */
class El extends FakeEl {
  get className() { return this.attrs.class || ''; }
  set className(v) { this.attrs.class = String(v); }
  get nodeType() { return 1; }
  get childNodes() { return this.children; }
  set innerHTML(v) { this._html = String(v); this.children = []; }
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
  #pick(sel) {
    const parts = sel.split(',').map((p) => p.trim());
    return this.all().filter((n) => parts.some((p) => (p.startsWith(':scope >')
      ? n.parentElement === this && matches(n, p.slice(8).trim())
      : matches(n, p))));
  }
  querySelector(sel) { return this.#pick(sel)[0] || null; }
  querySelectorAll(sel) { return this.#pick(sel); }
}
const doc = { createElement: (t) => new El(t) };

function card(title, { quest = '', cls = '' } = {}) {
  const c = new El('div');
  c.className = `q-card${cls ? ` ${cls}` : ''}`;
  if (quest) c.dataset.quest = quest;
  const t = new El('div');
  t.className = 'q-title';
  t.textContent = title;
  c.append(t);
  return c;
}

describe('#585 a list holding every card but showing none is drawn again', () => {
  it('swaps when the shown list shows fewer rows than the draw, the markup and the count the same', () => {
    const same = { drawn: '<a>', lastDrawn: '<a>', shownCount: 20, drawnCount: 20 };
    assert.equal(questLogNeedsSwap({ ...same, shownVisible: 0, drawnVisible: 8 }), true, 'Active 8 over a blank list');
    assert.equal(questLogNeedsSwap({ ...same, shownVisible: 8, drawnVisible: 8 }), false, 'no swap under the pointer (G255)');
    assert.equal(questLogNeedsSwap(same), false, 'without the counts, as before');
  });

  it('counts the rows a box shows', () => {
    const box = new El('div');
    const a = card('A');
    const b = card('B');
    const c = card('C');
    b.hidden = true;
    box.append(a, b, c);
    assert.equal(visibleRowCount(box), 2);
    assert.equal(visibleRowCount(null), 0);
  });

  it('game.js asks it with the rows the live list and the fresh draw show', () => {
    const block = game.slice(game.indexOf("const qShown = document.getElementById('quest');"), game.indexOf('renderQuestTracker();'));
    assert.match(block, /questLogNeedsSwap\(\{ drawn, lastDrawn: questLogDrawn, shownCount: qShown\.childElementCount, drawnCount: qBox\.childElementCount, shownVisible: visibleRowCount\(qShown\), drawnVisible: visibleRowCount\(qBox\) \}\)/);
    assert.ok(block.indexOf('visibleRowCount(qBox)') < block.indexOf('qShown.replaceChildren'), 'read before the swap moves the nodes');
  });
});

describe('#585 one bad quest never blanks the list', () => {
  it('a card whose steps are not a list, or whose pin throws, is counted and shown with the rest', () => {
    const data = {};
    const warn = console.warn;
    console.warn = () => {};
    try {
      const sheet = createQuestSheet({
        document: doc,
        questInfo: (id) => (id === 'odd' ? { requirements: { r1: { desc: 'Odd', num: 1 } } } : { requirements: [{ desc: 'Pet a Piggy', current: 1, num: 2 }] }),
        isPinned: (id) => { if (id === 'pinbroke') throw new Error('pins gone'); return false; },
        setData: (k, v) => { data[k] = v; },
        storage: { getItem: () => 'oldest', setItem() {} },
      });
      const box = new El('div');
      box.append(card('Odd Steps', { quest: 'odd' }), card('Pin Broke', { quest: 'pinbroke' }), card('Piggy Petter', { quest: 'pet' }),
        card('Old One', { cls: 'done' }), card('Put Off', { cls: 'q-put-off' }));
      const counts = sheet.arrange(box);
      assert.deepEqual(counts, { active: 3, offered: 1, done: 1 });
      const active = box.children.filter((n) => n.dataset.questTab === 'active');
      assert.equal(active.length, 3);
      assert.ok(active.every((n) => !n.hidden), 'every active card shows');
      assert.equal(visibleRowCount(box), 3);
      assert.equal(data.questTabShown, 'active:3,offered:1,done:1');
    } finally {
      console.warn = warn;
    }
  });

  it('steps that are not a list read as no steps', () => {
    assert.equal(questProgress({ a: 1 }), 0);
    assert.deepEqual(questStep({ a: 1 }), { step: '', count: '', percent: 0 });
  });

  it('a saved quest without its progress is still listed', () => {
    const [a, b] = listQuests().filter((q) => (q.requirements || []).length).map((q) => q.classTsid);
    const state = createQuestState();
    state.active[a] = { classTsid: a, startedAt: 2 };
    state.active[b] = { classTsid: b, progress: {}, startedAt: 1 };
    assert.equal(getQuestProgress(state, a).requirements[0].current, 0);
    assert.deepEqual(listQuestLogNewestFirst(state).map((r) => r.def.classTsid), [a, b]);
  });
});

/**
 * The cause, found in Firefox (Playwright's build): the reporter's picture and context ("0/20 cards",
 * no "No active quests" line, the tabs still counting) are what an outside stylesheet hiding the
 * cards gives (an ad blocker's element-hiding rule; #155's list came back with AdGuard off). The
 * cards keep no `hidden`, so no redraw brings them back. A box the page draws (`drawn`) has rects.
 */
function drawnBox(drawn = true) {
  const el = new El('div');
  el.getClientRects = () => (drawn ? [{}] : []);
  return el;
}
function styled(c, drawn) {
  c.getClientRects = () => (drawn && !c.hidden ? [{}] : []);
  return c;
}

describe('#585 cards a style from outside the game hides are named', () => {
  it('counts rows kept on show that the page draws no box for, never a closed sheet', () => {
    const body = drawnBox();
    const box = drawnBox();
    body.append(box);
    const off = styled(card('Off tab'), false);
    off.hidden = true;
    box.append(styled(card('A'), false), styled(card('B'), false), off);
    assert.equal(styledOutRowCount(box), 2, 'two cards on show, no box');
    assert.equal(visibleRowCount(box), 2, 'what the v0.54.1 redraw counts: it sees nothing wrong');
    const closed = drawnBox(false);
    closed.append(box);
    assert.equal(styledOutRowCount(box), 0, 'a closed sheet draws nothing: not counted');
    const fine = drawnBox();
    const box2 = drawnBox();
    fine.append(box2);
    box2.append(styled(card('C'), true));
    assert.equal(styledOutRowCount(box2), 0);
    assert.equal(styledOutRowCount(null), 0);
  });

  it('the sheet says so above the list, and takes the line away once the cards show', () => {
    const data = {};
    const sheet = createQuestSheet({ document: doc, setData: (k, v) => { data[k] = v; }, storage: null });
    const body = drawnBox();
    const box = drawnBox();
    body.append(box);
    const cards = [card('A', { quest: 'a' }), card('B', { quest: 'b' })].map((c) => styled(c, false));
    box.append(...cards);
    assert.equal(sheet.markStyledOut(box), 2);
    const note = body.children[0];
    assert.equal(note.id, 'quest-styled-out');
    assert.equal(note.hidden, false);
    assert.equal(note.textContent, QUEST_STYLED_OUT_TEXT);
    assert.ok(!/\u2014/.test(QUEST_STYLED_OUT_TEXT), 'no em dash');
    assert.equal(data.questStyledOut, '2');
    cards.forEach((c) => styled(c, true));
    assert.equal(sheet.markStyledOut(box), 0);
    assert.equal(note.hidden, true);
    assert.equal(body.children.filter((n) => n.id === 'quest-styled-out').length, 1, 'one line, made once');
  });

  it('game.js asks after every draw, and the line has its look', () => {
    const block = game.slice(game.indexOf("const qShown = document.getElementById('quest');"), game.indexOf('renderQuestTracker();'));
    assert.ok(block.indexOf('questSheet.markStyledOut(qShown)') > block.indexOf('qShown.replaceChildren'), 'after the swap');
    assert.match(css, /#quest-panel \.qc-styled-out \{/);
  });

  it('a report names them: "0/20 cards (8 styled out)"', () => {
    const panel = new El('div');
    const body = drawnBox();
    const list = drawnBox();
    list.id = 'quest';
    panel.append(body);
    body.append(list);
    for (const [t, sel] of [['active', 'true'], ['offered', 'false'], ['done', 'false']]) {
      const b = new El('button');
      b.setAttribute('role', 'tab');
      b.dataset.tab = t;
      b.setAttribute('aria-selected', sel);
      b.textContent = `${t} 1`;
      panel.append(b);
    }
    const a = styled(card('A', { quest: 'a' }), false);
    const o = styled(card('O', { cls: 'q-put-off' }), false);
    o.hidden = true;
    list.append(a, o);
    assert.equal(questLogDetail(panel), 'active 0/2 cards (1 styled out), tabs 1/1/1');
    a.getClientRects = () => [{}];
    assert.equal(questLogDetail(panel), 'active 1/2 cards, tabs 1/1/1');
  });
});
