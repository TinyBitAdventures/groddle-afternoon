/**
 * Lane questlist (2026-11-08): a player on live wrote "I can see that I have active quests, but
 * cannot see any of them". The Quests sheet's footer counted the log's rows while its tabs counted
 * the cards drawn, and a quest that was both active and in `completed` was drawn as a finished card:
 * the footer said "2 active" over an empty Active tab (and the Done tab listed it twice). Now:
 * - js/quests.js listQuestLog lists such a quest once, as active (a saved id the build no longer has
 *   is still left out, as before);
 * - game.js draws each card through drawQuestLogCard inside a try, falling back to a plain card, so
 *   one quest that fails to draw can never blank the log, and the footer counts the tabs' cards;
 * - js/ui/quest-sheet.js reads a quest's details through a guard: a quest whose details throw keeps its
 *   card (title, no step), counted and shown, and a card it cannot dress stays as drawn.
 */
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadContentCatalogsFromDir } from '../public/js/content-catalogs.js?v=10b118dd';
import { createQuestState, listQuestLog, listQuestLogNewestFirst, listQuests } from '../public/js/quests.js?v=40c71a37';
import { createQuestSheet } from '../public/js/ui/quest-sheet.js?v=c5465bbe';
import { FakeEl, matches } from './social-fake-dom.js';

const pub = join(import.meta.dirname, '../public');

before(async () => {
  await loadContentCatalogsFromDir(join(pub, 'assets/content'));
});

describe('the quest log lists what you are on (lane questlist)', () => {
  it('a quest both active and in completed is one active row, not a finished one', () => {
    const [a, b, c] = listQuests().map((q) => q.classTsid);
    const state = createQuestState();
    state.active[a] = { classTsid: a, progress: {}, startedAt: 2000 };
    state.active[b] = { classTsid: b, progress: {}, startedAt: 1000 };
    state.completed.push(a, c, b, c);
    const log = listQuestLogNewestFirst(state);
    assert.deepEqual(log.map((r) => [r.def.classTsid, r.status]), [[a, 'active'], [b, 'active'], [c, 'completed']]);
    for (const row of log.filter((r) => r.status === 'active')) {
      assert.equal(row.active, true);
      assert.equal(row.completed, false, 'an active row is never drawn as done');
    }
    assert.equal(listQuestLog(state).length, 3, 'each quest once, a doubled finish too');
  });

  it('a saved id the build no longer has is left out, the rest still listed', () => {
    const [a] = listQuests().map((q) => q.classTsid);
    const state = createQuestState();
    state.active.zz_retired_quest = { classTsid: 'zz_retired_quest', progress: { x: 1 }, startedAt: 5 };
    state.active[a] = { classTsid: a, progress: {}, startedAt: 6 };
    state.completed.push('zz_gone_too');
    assert.deepEqual(listQuestLogNewestFirst(state).map((r) => r.def.classTsid), [a]);
  });
});

describe('game.js draws every card, and the footer counts the tabs (lane questlist)', () => {
  const game = readFileSync(join(pub, 'game.js'), 'utf8');
  const at = game.indexOf('const log = listQuestLogNewestFirst(questState);');
  const draw = game.slice(at, game.indexOf('renderQuestTracker();', at));

  it('each card is drawn inside a try, with a plain card when it fails', () => {
    assert.ok(at > 0);
    assert.match(draw, /for \(const p of log\) \{[\s\S]*?try \{\s*card = drawQuestLogCard\(p\);\s*\} catch \(err\) \{[\s\S]*?card = plainQuestLogCard\(p\);/);
    assert.match(draw, /try \{\s*putOff = features\.collect\('questLogCards', engine\);/, 'a feature\'s put-off cards cannot blank the log');
    assert.match(draw, /try \{\s*appendStoryQuestOffers\(qBox\);/, 'nor the story offers');
  });

  it('the footer counts the cards the tabs hold', () => {
    const arranged = draw.indexOf('const tabCounts = questSheet.arrange(qBox);');
    const footer = draw.indexOf('questLogSummary({', arranged);
    assert.ok(arranged > 0 && footer > arranged, 'counted after the tabs are arranged');
    const args = draw.slice(footer, draw.indexOf('});', footer));
    for (const k of ['active', 'offered', 'done']) assert.match(args, new RegExp(`${k}: tabCounts\\.${k},`));
    assert.doesNotMatch(args, /log\.filter/, 'not the log\'s rows');
  });

  it('a card is done only when the quest is not active', () => {
    const fn = game.slice(game.indexOf('function drawQuestLogCard(p) {'), game.indexOf('function plainQuestLogCard(p) {'));
    assert.match(fn, /const done = !p\.active && p\.completed;/);
    assert.match(fn, /card\.className = 'q-card' \+ \(done \? ' done' : ''\);/);
    assert.doesNotMatch(fn, /p\.completed \? ' done'/);
    const plain = game.slice(game.indexOf('function plainQuestLogCard(p) {'), game.indexOf('/** VERBS (js/ui/quest-tracker.js)'));
    assert.match(plain, /if \(p\?\.active && p\.def\?\.classTsid\) card\.dataset\.quest = p\.def\.classTsid;/, 'the plain card keeps its quest id for the pin and the sheet');
  });
});

/** The FakeEl the Quests sheet needs (as tests/quest-search.test.js). */
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

function activeCard(title, quest) {
  const c = new El('div');
  c.className = 'q-card';
  c.dataset.quest = quest;
  const t = new El('div');
  t.className = 'q-title';
  t.textContent = title;
  c.append(t);
  return c;
}

describe('the Quests sheet keeps a quest whose details fail (lane questlist)', () => {
  it('a quest whose details throw is still counted and shown, and the others are dressed', () => {
    const data = {};
    const warn = console.warn;
    console.warn = () => {};
    try {
      const sheet = createQuestSheet({
        document: doc,
        questInfo: (id) => {
          if (id === 'broken') throw new Error('no such quest');
          return { requirements: [{ desc: 'Pet a Piggy', current: 0, num: 2 }] };
        },
        setData: (k, v) => { data[k] = v; },
        storage: null,
      });
      const box = new El('div');
      box.append(activeCard('Bad Data', 'broken'), activeCard('Piggy Petter', 'pet'), activeCard('Bean There', 'beans'));
      const counts = sheet.arrange(box);
      assert.deepEqual(counts, { active: 3, offered: 0, done: 0 });
      const cards = box.children.filter((n) => n.className.includes('q-card'));
      assert.equal(cards.length, 3);
      assert.ok(cards.every((n) => !n.hidden), 'all three show on the Active tab');
      assert.equal(box.children.some((n) => n.className === 'qc-empty'), false, 'no "No active quests" line');
      const broken = cards.find((n) => n.dataset.quest === 'broken');
      assert.equal(broken.querySelector('.qc-title')?.textContent, 'Bad Data', 'its card keeps its title, with no step');
      assert.equal(broken.querySelector('.qc-count'), null);
      assert.ok(cards.every((n) => n.querySelector('.qc-head')), 'every card is a collapsible card');
      assert.equal(cards.find((n) => n.dataset.quest === 'pet').querySelector('.qc-count')?.textContent, '0/2', 'the others keep their steps');
      assert.equal(data.questTabShown, 'active:3,offered:0,done:0');
    } finally {
      console.warn = warn;
    }
  });
});
