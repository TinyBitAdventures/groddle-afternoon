// #605 (an Android phone, the Skills panel):
// 1. "I was learning Soil V, switched to Engineering (fine), then Tinkering V (fine). Then I tried to
//    resume Soil V. It switched to Engineering. Tried again: the button was unresponsive." The panel
//    patches its redraw into the live cards (patchChildren keeps a node that looks the same), and the
//    study cards named no skill, so when a switch moved the cards round, a paused card's "Switch to
//    resume" button (same words on every paused card) was kept with its old card's skill.
// 2. "Soil V showed 5-6 hours left (paused). I clicked to start learning it. The time to finish
//    jumped to 9-10 hours." A paused card showed the time at the learning rate of its pause; a resume
//    takes the rate now (inc_skills.js skills_points_to_seconds with the current modifier), and every
//    skill learned or queued since changes it. The card now shows the time at the rate now.
import { before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { getSkillCatalog, loadContentCatalogsFromDir, resetContentCatalogs } from '../public/js/content-catalogs.js?v=b0f96eae';
import { createSkillState, getStudyStatus, listStudyQueue, pauseSkillStudy, startSkillStudy } from '../public/js/skills.js?v=665637b6';
import { skillTitle } from '../public/js/skill-tree.js?v=ad139fa0';
import { patchChildren, studyQueueCards } from '../public/js/skills-panel.js?v=fe84f8ee';

const root = join(import.meta.dirname, '..', 'public');

/** Just enough DOM for the study cards and patchChildren (listeners are not part of isEqualNode). */
class El {
  constructor(tag) {
    this.nodeType = tag === '#text' ? 3 : 1;
    this.tagName = tag.toUpperCase();
    this.attrs = new Map();
    this.childNodes = [];
    this.text = '';
    this.listeners = [];
    const self = this;
    this.dataset = new Proxy({}, {
      get: (_, k) => self.attrs.get(`data-${String(k).replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`),
      set: (_, k, v) => { self.attrs.set(`data-${String(k).replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`, String(v)); return true; },
    });
    this.style = new Proxy({}, { set: (_, k, v) => { self.attrs.set('style', `${k}: ${v}`); return true; } });
  }
  set className(v) { this.attrs.set('class', v); }
  set type(v) { this.attrs.set('type', v); }
  set title(v) { this.attrs.set('title', v); }
  set textContent(v) {
    this.childNodes = [];
    const t = new El('#text');
    t.text = String(v);
    this.appendChild(t);
  }
  get textContent() { return this.nodeType === 3 ? this.text : this.childNodes.map((c) => c.textContent).join(''); }
  get attributes() { return [...this.attrs].map(([name, value]) => ({ name, value })); }
  get lastChild() { return this.childNodes[this.childNodes.length - 1] || null; }
  hasAttribute(n) { return this.attrs.has(n); }
  getAttribute(n) { return this.attrs.has(n) ? this.attrs.get(n) : null; }
  setAttribute(n, v) { this.attrs.set(n, String(v)); }
  removeAttribute(n) { this.attrs.delete(n); }
  addEventListener(type, fn) { if (type === 'click') this.listeners.push(fn); }
  click() { for (const fn of this.listeners) fn({ currentTarget: this }); }
  appendChild(n) { n.parent?.childNodes.splice(n.parent.childNodes.indexOf(n), 1); n.parent = this; this.childNodes.push(n); return n; }
  replaceChild(n, old) { n.parent?.childNodes.splice(n.parent.childNodes.indexOf(n), 1); n.parent = this; this.childNodes[this.childNodes.indexOf(old)] = n; old.parent = null; return old; }
  remove() { this.parent?.childNodes.splice(this.parent.childNodes.indexOf(this), 1); this.parent = null; }
  isEqualNode(o) {
    return Boolean(o) && o.nodeType === this.nodeType && o.tagName === this.tagName && o.text === this.text
      && JSON.stringify([...o.attrs].sort()) === JSON.stringify([...this.attrs].sort())
      && o.childNodes.length === this.childNodes.length && this.childNodes.every((c, i) => c.isEqualNode(o.childNodes[i]));
  }
}

const A = 'animalkinship_1';
const B = 'ezcooking_1';
const C = 'light_green_thumb_1';

before(async () => {
  resetContentCatalogs();
  await loadContentCatalogsFromDir(join(root, 'assets/content'));
  globalThis.document = { createElement: (tag) => new El(tag) };
});

describe('#605: the Skills panel\'s Switch buttons stay with their own skill', () => {
  it('after switches move the cards round, each card\'s button resumes the skill on that card', () => {
    const state = createSkillState();
    const ctx = { level: 99 };
    let t = 1_000;
    const calls = [];
    const actions = {
      resume: (id) => { calls.push(id); startSkillStudy(state, id, ctx, (t += 1000)); },
      pause: (id) => pauseSkillStudy(state, id, (t += 1000)),
    };
    const live = new El('div');
    const draw = () => {
      const next = new El('div');
      studyQueueCards(next, { state, ctx, actions, now: t });
      patchChildren(live, next);
    };
    // Cards are told apart by what they show (their title), as a player does.
    const titleOf = (card) => card.childNodes[0].childNodes[0].textContent;
    const idOf = (card) => [A, B, C].find((id) => skillTitle(getSkillCatalog()[id]) === titleOf(card));
    const cardOf = (id) => live.childNodes.find((c) => idOf(c) === id);
    const buttonOf = (card) => card.childNodes.find((c) => c.tagName === 'BUTTON');

    // Learning A, then switched to B, then to C (each switch pauses the one before).
    startSkillStudy(state, A, ctx, t);
    draw();
    actions.resume(B);
    draw();
    actions.resume(C);
    draw();
    assert.deepEqual(live.childNodes.map(idOf), [C, A, B]);
    // Resume A from its own card.
    buttonOf(cardOf(A)).click();
    assert.deepEqual(calls.slice(-1), [A]);
    draw();
    assert.deepEqual(live.childNodes.map(idOf), [A, B, C]);
    // Every paused card's button resumes the skill its card names, whatever the order before.
    for (const card of live.childNodes.slice(1)) {
      const id = idOf(card);
      buttonOf(card).click();
      assert.equal(calls.at(-1), id, `${titleOf(card)}'s button resumes it`);
      assert.equal(listStudyQueue(state, t).find((r) => !r.isPaused).classTsid, id);
      draw();
    }
  });
});

describe('#605: a paused skill shows the time it would take now', () => {
  it('a paused card takes the learning rate now, the same time its resume will take', () => {
    const state = createSkillState();
    let factor = 1;
    const ctx = { level: 99, timeFactor: () => factor };
    startSkillStudy(state, A, ctx, 1_000);
    startSkillStudy(state, B, ctx, 31_000);
    const pausedThen = getStudyStatus(state, A, 31_000).remainingSeconds;
    // Skills learned since the pause make learning slower (1.05 per skill over brain capacity).
    factor = 1.05 ** 11;
    const shown = getStudyStatus(state, A, 31_000, ctx).remainingSeconds;
    assert.ok(Math.abs(shown - pausedThen * factor) <= 1, `${shown} vs ${pausedThen * factor}`);
    // The panel's card shows that time, and a resume takes the same.
    const box = new El('div');
    studyQueueCards(box, { state, ctx, actions: {}, now: 31_000 });
    const card = box.childNodes.find((c) => c.dataset.skill === A);
    const resumed = startSkillStudy(state, A, ctx, 31_000);
    assert.ok(Math.abs(resumed.durationSeconds - shown) <= 1, 'the same time, to the second');
    assert.match(card.childNodes[1].textContent, /remaining/);
    // Without a rate (callers that do not know it), the rate stored at the pause.
    startSkillStudy(state, B, ctx, 32_000);
    factor = 2;
    const stored = getStudyStatus(state, A, 32_000).remainingSeconds;
    assert.ok(Math.abs(getStudyStatus(state, A, 32_000, ctx).remainingSeconds - stored * 2 / (1.05 ** 11)) <= 2);
  });

  it('the panel and the tree give the paused rows the rate (ctx)', async () => {
    const { readFileSync } = await import('node:fs');
    const panel = readFileSync(join(root, 'js/skills-panel.js'), 'utf8');
    const tree = readFileSync(join(root, 'js/skill-tree.js'), 'utf8');
    assert.match(panel, /listStudyQueue\(state, now, ctx\)/);
    assert.match(tree, /getStudyStatus\(state, classTsid, now, ctx\)/);
  });
});
