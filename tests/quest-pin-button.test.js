/**
 * G919 (Austin 2026-11-17, his iPhone): on a phone the pinned quests are one round button in the top
 * bar's right pill (js/ui/quest-pin-button.js): the book, a ring for the first quest's progress and a
 * count badge with two pinned; a tap opens the tracker's own card as a popover under it; a step that
 * moves pops one short line for about 3 s, never while the popover is open. Computers, tablets and
 * Classic keep the card where it was.
 *
 * Run: node --test tests/quest-pin-button.test.js
 */
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FakeEl } from './social-fake-dom.js';
import { createQuestPinButton, phonePins, pinButtonFace, pinStepKey, pinStepLine, PIN_LINE_MS } from '../public/js/ui/quest-pin-button.js?v=2931d81d';
import { createQuestTracker } from '../public/js/ui/quest-tracker.js?v=2990cd8e';
import { failedQuestPin } from '../public/js/ui/quest-sheet.js?v=e2f83677';

const PUBLIC = join(dirname(fileURLToPath(import.meta.url)), '../public');
const read = (p) => readFileSync(join(PUBLIC, p), 'utf8');
const css = read('style.css');

const PIGS = { classTsid: 'animalkinship_pet_piggies', title: 'Porcine Pleaser', step: 'Pet Piggies', count: '2/6', percent: 33 };
const METAL = {
  classTsid: 'alchemy_make_metal_ingots',
  title: 'Rub Eleven Out',
  step: 'Make 11 x Tin',
  count: '0/3',
  percent: 6,
  steps: [
    { desc: 'Make 11 x Tin', count: '2/11', percent: 18, done: false },
    { desc: 'Make 11 x Copper', count: '0/11', percent: 0, done: false },
    { desc: 'Make 11 x Molybdenum', count: '0/11', percent: 0, done: false },
  ],
};

describe('the button face (pinButtonFace)', () => {
  it('hides with nothing pinned', () => {
    assert.deepEqual(pinButtonFace([]), { hidden: true, share: 0, badge: '', label: '' });
  });
  it('rings the first quest and badges only with two', () => {
    const one = pinButtonFace([PIGS]);
    assert.equal(one.hidden, false);
    assert.equal(one.badge, '');
    assert.equal(one.share, 0.33);
    assert.equal(one.label, 'Pinned quests: Porcine Pleaser 2/6');
    const two = pinButtonFace([PIGS, METAL]);
    assert.equal(two.badge, '2');
    assert.equal(two.share, 0.33, 'the first pinned quest drives the ring');
    assert.match(two.label, /and 1 more$/);
  });
  it('a failed try rings empty and says so', () => {
    const f = pinButtonFace([{ ...PIGS, ...failedQuestPin({ timer: { durationSec: 60 } }) }]);
    assert.equal(f.share, 0);
    assert.equal(f.label, 'Pinned quests: Porcine Pleaser: time ran out');
  });
});

describe('the step line (pinStepLine)', () => {
  it('says nothing the first time a quest is seen or when nothing moved', () => {
    assert.equal(pinStepLine(undefined, PIGS), '');
    assert.equal(pinStepLine(PIGS, { ...PIGS }), '');
  });
  it('one step: the step and its count', () => {
    assert.equal(pinStepLine(PIGS, { ...PIGS, count: '3/6', percent: 50 }), 'Pet Piggies 3/6');
  });
  it('several steps: the step that moved, with its count', () => {
    const next = { ...METAL, steps: METAL.steps.map((s, i) => (i === 1 ? { ...s, count: '1/11', percent: 9 } : s)) };
    assert.equal(pinStepLine(METAL, next), 'Make 11 x Copper 1/11');
    const doneOne = { ...METAL, steps: [{ desc: 'Plant a <b>bean</b>', count: '', percent: 100, done: true }, METAL.steps[1]] };
    const was = { ...METAL, steps: [{ desc: 'Plant a <b>bean</b>', count: '', percent: 0, done: false }, METAL.steps[1]] };
    assert.equal(pinStepLine(was, doneOne), 'Plant a bean: done', 'markup goes, a step of one says done');
  });
  it('a failed try: the quest and what happened, once', () => {
    const failed = { ...PIGS, ...failedQuestPin({}) };
    assert.equal(pinStepLine(PIGS, failed), 'Porcine Pleaser: try again');
    assert.equal(pinStepLine(failed, { ...failed }), '');
  });
  it('the key moves with any step count', () => {
    assert.notEqual(pinStepKey(METAL), pinStepKey({ ...METAL, steps: [{ ...METAL.steps[0], count: '3/11' }, ...METAL.steps.slice(1)] }));
  });
});

/** FakeEl with what the button reads: its document. */
class El extends FakeEl {
  get className() { return this.attrs.class || ''; }
  set className(v) { this.attrs.class = String(v); }
  get ownerDocument() { return globalThis.document; }
  hasAttribute(k) { return k in this.attrs; }
}

function setup({ phone = true, ui = 'modern' } = {}) {
  const root = new El('html');
  root.dataset.ui = ui;
  if (phone) root.classList.add('touch-phone');
  root.clientWidth = 402;
  const body = new El('body');
  const doc = {
    activeElement: null,
    listeners: {},
    documentElement: root,
    body,
    createElement: (t) => new El(t),
    createElementNS: (ns, t) => new El(t),
    addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); },
    getElementById: (id) => body.all().find((n) => n.id === id) || null,
    querySelector: (sel) => body.querySelector(sel),
    fire(type, e) { for (const fn of this.listeners[type] || []) fn(e); },
  };
  globalThis.document = doc;
  globalThis.CSS = { escape: (s) => s };
  const bar = new El('header');
  bar.className = 'top-bar';
  bar.rect = { left: 8, top: 4, right: 394, bottom: 52, width: 386, height: 48 };
  const actions = new El('div');
  actions.className = 'top-actions hud-pill hud-actions';
  const quest = new El('button');
  quest.id = 'quest-btn';
  const bug = new El('button');
  bug.id = 'bug-btn';
  const more = new El('button');
  more.id = 'more-btn';
  actions.append(quest, bug, more);
  bar.append(actions);
  const game = new El('div');
  game.id = 'game-root';
  const card = new El('section');
  card.id = 'quest-pins';
  const head = new El('div');
  const title = new El('span');
  title.setAttribute('data-pins-title', '');
  const toggle = new El('button');
  toggle.setAttribute('data-pins-toggle', '');
  head.append(title, toggle);
  const list = new El('div');
  list.setAttribute('data-pins-list', '');
  card.append(head, list);
  const strip = new El('div');
  strip.id = 'buff-strip';
  game.append(card, strip);
  body.append(bar, game);
  const data = {};
  const timers = [];
  const opened = [];
  const tracker = createQuestTracker({
    el: card,
    setData: (k, v) => { data[k] = v; },
    onOpen: (id) => opened.push(id),
    setTimer: (fn, ms) => { timers.push({ fn, ms }); return timers.length; },
    clearTimer: () => {},
  });
  return { doc, root, bar, actions, card, game, strip, tracker, data, timers, opened, btn: () => doc.getElementById('quest-pins-btn'), pop: () => doc.getElementById('quest-pins-pop') };
}

let s;
afterEach(() => { delete globalThis.document; });

describe('on a phone (createQuestPinButton through the tracker)', () => {
  beforeEach(() => { s = setup(); });
  it('sits beside Quests in the right pill and hides with nothing pinned', () => {
    const btn = s.btn();
    assert.ok(btn, 'the button is made');
    assert.equal(s.actions.children.indexOf(btn), 1, 'right after Quests, before Report a problem');
    assert.match(btn.className, /\bhud-ibtn\b/, 'the same look as the bar buttons');
    s.tracker.render([], false);
    assert.equal(btn.hidden, true);
    assert.equal(s.data.questPinBtn, '');
  });
  it('one pin: the ring, no badge; two pins: the badge', () => {
    s.tracker.render([PIGS], false);
    assert.equal(s.btn().hidden, false);
    assert.equal(s.btn().querySelector('.qpb-fill').getAttribute('stroke-dasharray'), '33 100');
    assert.equal(s.btn().querySelector('.qpb-badge').hidden, true);
    assert.equal(s.data.questPinBtn, '1:33');
    s.tracker.render([PIGS, METAL], false);
    const badge = s.btn().querySelector('.qpb-badge');
    assert.equal(badge.hidden, false);
    assert.equal(badge.textContent, '2');
  });
  it('the card moves into the popover, drawn open even when it was folded', () => {
    s.tracker.render([PIGS], true);
    assert.equal(s.card.parentElement, s.pop(), 'the tracker card lives in the popover');
    assert.equal(s.card.classList.contains('collapsed'), false, 'a popover never folds');
    assert.equal(s.tracker.button.state().inPopover, true);
  });
  it('a tap opens the popover; Escape, a tap elsewhere or the button closes it', () => {
    s.tracker.render([PIGS], false);
    s.btn().click();
    assert.equal(s.pop().hidden, false);
    assert.equal(s.btn().getAttribute('aria-expanded'), 'true');
    assert.equal(s.data.questPinPop, '1');
    s.doc.fire('keydown', { key: 'Escape', stopPropagation() {} });
    assert.equal(s.pop().hidden, true);
    s.btn().click();
    s.doc.fire('pointerdown', { target: s.card });
    assert.equal(s.pop().hidden, false, 'a tap inside keeps it');
    s.doc.fire('pointerdown', { target: s.game });
    assert.equal(s.pop().hidden, true, 'a tap outside closes it');
    s.btn().click();
    s.btn().click();
    assert.equal(s.pop().hidden, true, 'the button again closes it');
  });
  it('a row opens Quests and closes the popover', () => {
    s.tracker.render([PIGS], false);
    s.btn().click();
    const list = s.card.querySelector('[data-pins-list]');
    const row = new El('button');
    row.dataset.pin = PIGS.classTsid;
    list.children = [];
    list.append(row);
    row.click();
    assert.deepEqual(s.opened, [PIGS.classTsid]);
    assert.equal(s.pop().hidden, true);
  });
  it('a step that moves pops one line for PIN_LINE_MS, never while open', () => {
    s.tracker.render([PIGS, METAL], false);
    assert.equal(s.data.questPinLine ?? '', '', 'nothing on first sight');
    s.tracker.render([{ ...PIGS, count: '3/6', percent: 50 }, METAL], false);
    assert.equal(s.data.questPinLine, 'Pet Piggies 3/6');
    assert.equal(s.btn().dataset.line, 'on');
    assert.equal(s.timers.at(-1).ms, PIN_LINE_MS);
    // A second change replaces the line: one at a time.
    s.tracker.render([{ ...PIGS, count: '4/6', percent: 66 }, METAL], false);
    assert.equal(s.data.questPinLine, 'Pet Piggies 4/6');
    s.timers.at(-1).fn();
    assert.equal(s.data.questPinLine, '');
    assert.equal(s.btn().dataset.line, undefined);
    s.btn().click();
    s.tracker.render([{ ...PIGS, count: '5/6', percent: 83 }, METAL], false);
    assert.equal(s.data.questPinLine, '', 'no line while the popover is open');
  });
  it('unpinning the last quest hides the button and closes the popover', () => {
    s.tracker.render([PIGS], false);
    s.btn().click();
    s.tracker.render([], false);
    assert.equal(s.btn().hidden, true);
    assert.equal(s.pop().hidden, true);
  });
});

describe('G1230 (#595): the phone layout\'s card', () => {
  it('is never folded to its head, so a tap on it opens the quest in Quests, as the old pin did', () => {
    s = setup();
    s.root.classList.add('phone-layout');
    s.tracker.render([PIGS], true);
    assert.equal(s.card.classList.contains('collapsed'), false, 'a saved fold does not fold the card');
    const list = s.card.querySelector('[data-pins-list]');
    const row = new El('button');
    row.dataset.pin = PIGS.classTsid;
    list.children = [];
    list.append(row);
    row.click();
    assert.deepEqual(s.opened, [PIGS.classTsid]);
  });
  it('sits over the touch controls\' layer, so the float stick\'s corner does not take its taps', () => {
    assert.match(css, /:root\.phone-layout\[data-ui="modern"\] #game-root #quest-pins:not\(\[hidden\]\) \{ z-index: calc\(var\(--z-hud\) \+ 1\); \}/);
  });
});

describe('off a phone', () => {
  it('a computer or tablet keeps the card in place and never shows the button', () => {
    s = setup({ phone: false });
    s.tracker.render([PIGS, METAL], true);
    assert.equal(s.card.parentElement, s.game);
    assert.equal(s.btn().hidden, true);
    assert.equal(s.card.classList.contains('collapsed'), true, 'its fold is kept');
  });
  it('Classic on a phone: no button (Classic shows no tracker)', () => {
    s = setup({ ui: 'classic' });
    s.tracker.render([PIGS], false);
    assert.equal(s.btn().hidden, true);
    assert.equal(s.card.parentElement, s.game);
    assert.equal(phonePins(s.doc), false);
  });
  it('the card goes home before the buff strip when the phone class goes', () => {
    s = setup();
    s.tracker.render([PIGS], false);
    s.root.classList.remove('touch-phone');
    s.tracker.render([PIGS], false);
    assert.equal(s.card.parentElement, s.game);
    assert.equal(s.game.children.indexOf(s.card), s.game.children.indexOf(s.strip) - 1);
  });
});

describe('the styles', () => {
  it('the button shows only on a phone in Modern, the size of its neighbours', () => {
    assert.ok(css.includes('#quest-pins-btn { display: none; }'), 'hidden by default');
    const rule = css.match(/:root\.touch-phone\[data-ui="modern"\] \.top-bar \.hud-actions #quest-pins-btn:not\(\[hidden\]\) \{[^}]*\}/)?.[0] || '';
    assert.match(rule, /height: var\(--slot\)/, 'a 44 px target like Quests and Report a problem');
  });
  it('the bar lifts over the sheets while the popover is open (G644) and notices drop under it', () => {
    assert.ok(css.includes('#wrap > header.top-bar:has(#quest-pins-pop:not([hidden])) { z-index: var(--z-hud-pop); }'), 'the bar lifts');
    assert.ok(css.includes('#wrap:has(> header.top-bar #quest-pins-pop:not([hidden])) > #game-root .notify-notices { z-index: var(--z-hud-pop-under); }'), 'notices drop under it');
  });
  it('the tracker builds the button (no second copy of its rows)', () => {
    const src = read('js/ui/quest-tracker.js');
    assert.match(src, /createQuestPinButton\(/);
  });
});
