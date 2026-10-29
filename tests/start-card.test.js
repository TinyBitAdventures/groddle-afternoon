// STARTCARD (Austin 2026-10-29): nothing the game raises shows over or under the start card
// ("Welcome to a scrap of Ur"). A skill finished while the player was away completes on load;
// its skill-learned panel, queued screens, prompts and scripted dialogs wait for Start exploring,
// Customize look first or the tutorial choice, then go in order, and the card is the top window.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { START_CARD_SELECTOR, SCREEN_SELECTOR, WINDOW_SELECTOR, stackZ } from '../public/js/window-stack.js?v=g428-1';
import { createPromptStack } from '../public/js/prompt-stack.js?v=g428-1';
import {
  _resetFamiliarDialog,
  familiarDialogFeature,
  familiarDialogOpen,
} from '../public/js/features/familiar-dialog-feature.js?v=g428-1';

const here = dirname(fileURLToPath(import.meta.url));
const pub = join(here, '../public');
const read = (rel) => readFileSync(join(pub, rel), 'utf8');
const game = read('game.js');
const tick = () => new Promise((r) => setTimeout(r, 0));
const between = (src, a, b) => src.slice(src.indexOf(a), src.indexOf(b, src.indexOf(a) + a.length));

describe('the start card holds what the game raises at boot', () => {
  it('queued screens wait for the start, then the loading card and the gates, in order', () => {
    const fn = between(game, 'function queueScreen(', 'function noteScreenHold(');
    const start = fn.indexOf('afterStart()');
    const card = fn.indexOf('afterStreetCard()');
    const gates = fn.indexOf('waitForScreenGates(');
    const show = fn.indexOf('.then(show)');
    assert.ok(start > 0 && start < card && card < gates && gates < show, 'afterStart, afterStreetCard, the gates, then the screen');
    // One promise chain (awardQueue): screens raised at boot show in the order they were raised.
    assert.match(fn, /awardQueue = awardQueue\s*\n\s*\/\/ STARTCARD/);
    assert.match(fn, /noteScreenHold\('start card'\)/);
    assert.match(game, /function afterStart\(\) \{\s*if \(state\.started\) return Promise\.resolve\(\);/);
  });

  it('beginGame lets them go once the card is down, before the new day', () => {
    const fn = between(game, 'async function beginGame()', "document.getElementById('start-btn').addEventListener");
    const hide = fn.indexOf("getElementById('overlay').classList.add('hidden')");
    const started = fn.indexOf('state.started = true;');
    const release = fn.indexOf('releaseStartWaiters();');
    const prompts = fn.indexOf('promptStack?.flush();');
    const newDay = fn.indexOf('await maybeNewDay(');
    assert.ok(hide >= 0 && hide < started && started < release && release < newDay, 'released after started, before maybeNewDay queues the new day');
    assert.ok(prompts > release && prompts < newDay);
    // Every way off the card goes through beginGame: Start exploring, Customize look first, and the
    // newxp card's Start with the tutorial / Skip to Ur (they click #start-btn).
    assert.match(game, /getElementById\('start-btn'\)\.addEventListener\('click', beginGame\)/);
    assert.match(game, /getElementById\('start-customize-btn'\)\?\.addEventListener\('click', \(\) => \{\s*openBuilderOnStart = true;\s*beginGame\(\);/);
    const newxp = read('js/features/newxp-feature.js');
    assert.match(newxp, /data-nx-start\]'\)\.addEventListener\('click', \(\) => \{[\s\S]*?startBtn\.click\(\);/);
    assert.match(newxp, /data-nx-skipstart\]'\)\.addEventListener\('click', \(\) => \{[\s\S]*?startBtn\.click\(\);/);
  });

  it('holds scripted dialogs, quest offers and prompts until the start', () => {
    const hold = between(game, 'function holdScriptedDialog(opts)', 'function familiarWaitsForScreen(');
    assert.match(hold, /!\(!state\.started \|\| menuTarget/);
    const release = between(game, 'function releaseHeldScriptedDialog()', 'function closeQuestDialogue(');
    assert.match(release, /if \(!state\.started \|\| !heldScriptedDialogs\.length/);
    assert.match(game, /questOffersHeld: \(\) => !state\.started \|\| features\.query\('holdQuestOffers', engine\) === true/);
    assert.match(game, /afterStart: \(\) => afterStart\(\),/);
    assert.match(between(game, 'function promptStackUi()', 'function isVogOpen()'), /held: \(\) => !state\.started,/);
  });

  it('a skill finished while away completes at boot, before the card is answered', () => {
    // The boot catch-up (a returning save) and the QA route that stands in for it.
    assert.match(game, /handleSkillCompletions\(tickSkillStudy\(skillState, Date\.now\(\)\)\.completed, \{ offline: true \}\);\s*backfillStreetVisits\(\);/);
    assert.match(game, /skillState\.queue\[demoSkill\]\.endsAt = Date\.now\(\) \+ Math\.min\(-1, remaining\) \* 1000;\s*handleSkillCompletions\(tickSkillStudy\(skillState, Date\.now\(\)\)\.completed, \{ offline: true \}\);/);
  });
});

describe("the familiar's skill-learned panel waits for the start", () => {
  it('stays shut while the card is up, then grows for the first finished skill', async () => {
    _resetFamiliarDialog();
    const data = {};
    const sounds = [];
    let started = false;
    let letGo;
    const startGate = new Promise((r) => { letGo = r; });
    const engine = {
      param: () => null,
      get started() { return started; },
      setData: (k, v) => { data[k] = v; },
      skillLearnedInfo: (id) => ({ classTsid: id, name: id, learned: '', next: [] }),
      afterStart: () => startGate,
      afterStreetCard: async () => {},
      playSound: (k) => sounds.push(k),
    };
    familiarDialogFeature.init(engine);
    familiarDialogFeature.onEvent('skill_learned:croppery_2', 1, engine);
    familiarDialogFeature.onEvent('skill_learned:animalkinship_1', 1, engine);
    await tick();
    assert.equal(data.familiarHeld, 'start');
    assert.equal(data.familiarPanel, 'croppery_2', 'first in, first shown');
    assert.equal(data.familiarQueue, '1');
    assert.equal(data.familiarLast, undefined, 'nothing grows over the start card');
    assert.deepEqual(sounds, []);
    started = true;
    letGo();
    await tick();
    await tick();
    assert.equal(data.familiarLast, 'croppery_2');
    assert.deepEqual(sounds, ['SKILL_ACHIEVED']);
    assert.equal(data.familiarHeld, '');
    assert.equal(familiarDialogOpen(), true);
    _resetFamiliarDialog();
  });

  it("the panel's skill grid opens the Skills panel as the newest window", () => {
    const src = read('js/features/familiar-dialog-feature.js');
    assert.match(src, /b\.addEventListener\('click', \(\) => openTree\(engine, skill\.classTsid\)\);/);
    assert.match(src, /function openTree\(engine, classTsid = ''\) \{\s*close\(engine, \{ all: false, quick: true \}\);\s*engine\.openSkillTree\?\.\(classTsid\);/);
    // Opened after the panel, it stacks over it (stackZ: newest one above the one before).
    assert.deepEqual(stackZ([{ base: 505 }, { base: 35 }]), [505, 506]);
  });
});

describe('the window stack keeps the start card on top', () => {
  it('names the card apart from the windows and screens', () => {
    assert.equal(START_CARD_SELECTOR, '#overlay');
    assert.doesNotMatch(WINDOW_SELECTOR, /#overlay/);
    assert.doesNotMatch(SCREEN_SELECTOR, /#overlay/);
    assert.match(read('play/index.html'), /<div id="overlay" class="overlay">\s*<div class="card">\s*<h2>Welcome to a scrap of Ur<\/h2>/);
  });

  it('puts the card over windows and screens opened after it, and keeps its own z alone', () => {
    // The solo card (z 5) under the familiar's panel (505) and an award screen (96): card on top.
    assert.deepEqual(stackZ([{ base: 5, top: true }, { base: 505 }, { base: 96, screen: true }]), [507, 505, 506]);
    // The online card (z 80) and the Skills panel (35) opened from the panel: card on top.
    assert.deepEqual(stackZ([{ base: 80, top: true }, { base: 35 }]), [80, 35]);
    const [skills, card] = stackZ([{ base: 35 }, { base: 80, top: true }]);
    assert.ok(card > skills);
    // Alone it keeps its CSS value; windows and screens keep their own order under it.
    assert.deepEqual(stackZ([{ base: 5, top: true }]), [5]);
    assert.deepEqual(stackZ([{ base: 96, screen: true }, { base: 40 }, { base: 5, top: true }]), [96, 40, 97]);
  });

  it('the online card sits at z 80, over the side panels (the report: Skills opened behind it)', () => {
    assert.match(read('play/online/index.html'), /#overlay:not\(\.hidden\) \{ z-index: 80;/);
    const ws = read('js/window-stack.js');
    assert.match(ws, /querySelectorAll\(`\$\{WINDOW_SELECTOR\}, \$\{SCREEN_SELECTOR\}, \$\{START_CARD_SELECTOR\}`\)/);
    assert.match(ws, /top: el\.matches\(START_CARD_SELECTOR\),/);
  });
});

describe('prompts raised while the card is up', () => {
  /** Just enough DOM for the prompt stack. */
  function fakeDoc() {
    const byId = new Map();
    const make = (tag) => {
      const node = {
        tagName: tag.toUpperCase(), style: {}, dataset: {}, attrs: {}, children: [], parent: null, textContent: '', classes: new Set(),
        get isConnected() { return Boolean(node.parent); },
        set id(v) { node._id = v; byId.set(v, node); },
        get id() { return node._id; },
        set className(v) { node.classes = new Set(String(v).split(/\s+/).filter(Boolean)); },
        get className() { return [...node.classes].join(' '); },
        classList: { add: (c) => node.classes.add(c), remove: (c) => node.classes.delete(c), contains: (c) => node.classes.has(c), toggle: (c, on) => (on ? node.classes.add(c) : node.classes.delete(c)) },
        setAttribute(k, v) { node.attrs[k] = v; },
        appendChild(child) { child.parent = node; node.children.push(child); return child; },
        prepend(child) { child.parent = node; node.children.unshift(child); },
        remove() { if (node.parent) { node.parent.children = node.parent.children.filter((c) => c !== node); node.parent = null; } },
        addEventListener() {},
        querySelectorAll: () => [],
        getBoundingClientRect: () => ({ width: 0, height: 0 }),
      };
      return node;
    };
    const head = make('head');
    const body = make('body');
    body.parent = { children: [body] };
    return { head, body, createElement: make, getElementById: (id) => byId.get(id) || null };
  }

  it('wait in the queue with no timer armed, then show on flush', () => {
    const doc = fakeDoc();
    const data = {};
    let held = true;
    const armed = [];
    const stack = createPromptStack({
      document: doc,
      win: {},
      mount: () => doc.body,
      viewHeight: () => 400,
      measure: () => 0,
      held: () => held,
      setData: (k, v) => { data[k] = v; },
      later: () => () => {},
      every: () => () => {},
      timer: (fn, ms) => { armed.push(ms); return () => {}; },
    });
    const uid = stack.add({ text: 'Lem wants to be your buddy.', choices: [{ label: 'OK', value: 'ok' }], timeout: 30 });
    stack.add({ text: 'A second one.' });
    assert.ok(uid);
    assert.equal(stack.has(uid), true, 'removePrompt still finds it');
    assert.deepEqual(stack.shown(), []);
    assert.equal(stack.queued().length, 2);
    assert.equal(data.promptStack, '0');
    assert.deepEqual(armed, [], 'its timeout does not run while it waits');
    held = false;
    stack.flush();
    assert.deepEqual(stack.queued(), []);
    assert.deepEqual(stack.shown().map((p) => p.text), ['A second one.', 'Lem wants to be your buddy.'], 'newest on top, both shown');
    assert.equal(armed.length, 1, 'the timed one arms now');
  });
});
