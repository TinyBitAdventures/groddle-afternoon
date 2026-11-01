// STARTCARD (Austin 2026-10-29): nothing the game raises shows over or under the start card
// ("Welcome to a scrap of Ur"). A skill finished while the player was away completes on load;
// its skill-learned panel, queued screens, prompts and scripted dialogs wait for Start exploring,
// Customize look first or the tutorial choice, then go in order, and the card is the top window.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolveTokens } from './css-tokens.js';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { START_CARD_SELECTOR, SCREEN_SELECTOR, WINDOW_SELECTOR, stackZ } from '../public/js/window-stack.js?v=be3b7274';
import { createPromptStack } from '../public/js/prompt-stack.js?v=c8788aeb';
import {
  _resetFamiliarDialog,
  familiarDialogFeature,
  familiarDialogOpen,
} from '../public/js/features/familiar-dialog-feature.js?v=b043ef2b';

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
    assert.match(fn, /noteScreenHold\(state\.started \? 'look builder' : 'start card'\)/);
    assert.match(game, /function afterStart\(\) \{\s*if \(!startHeld\(\)\) return Promise\.resolve\(\);/);
    assert.match(game, /function startHeld\(\) \{\s*return !state\.started \|\| startLookHold;/);
  });

  it('beginGame lets them go once the card is down, before the new day', () => {
    const fn = between(game, 'async function beginGame()', "document.getElementById('start-btn').addEventListener");
    const hide = fn.indexOf("getElementById('overlay').classList.add('hidden')");
    const started = fn.indexOf('state.started = true;');
    const release = fn.indexOf('releaseStartWaiters();', fn.indexOf('if (!startLookHold) {'));
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
    assert.match(hold, /!\(startHeld\(\) \|\| menuTarget/);
    const release = between(game, 'function releaseHeldScriptedDialog()', 'function closeQuestDialogue(');
    assert.match(release, /if \(startHeld\(\) \|\| !heldScriptedDialogs\.length/);
    assert.match(game, /questOffersHeld: \(\) => startHeld\(\) \|\| features\.query\('holdQuestOffers', engine\) === true/);
    assert.match(game, /afterStart: \(\) => afterStart\(\),/);
    assert.match(between(game, 'function promptStackUi()', 'function isVogOpen()'), /held: \(\) => startHeld\(\),/);
  });

  it('a skill finished while away completes at boot, before the card is answered', () => {
    // The boot catch-up (a returning save) and the QA route that stands in for it.
    assert.match(game, /handleSkillCompletions\(tickSkillStudy\(skillState, Date\.now\(\)\)\.completed, \{ offline: true \}\);\s*backfillStreetVisits\(\);/);
    assert.match(game, /skillState\.queue\[demoSkill\]\.endsAt = Date\.now\(\) \+ Math\.min\(-1, remaining\) \* 1000;\s*handleSkillCompletions\(tickSkillStudy\(skillState, Date\.now\(\)\)\.completed, \{ offline: true \}\);/);
  });
});

// LOOKHOLD (Austin 2026-10-29): with "Customize look first" the skill-learned panel opened over
// the look builder; it and the other held screens now wait until the builder closes.
describe('Customize look first holds them until the look builder closes', () => {
  it('beginGame keeps the hold when the builder opens from the card', () => {
    const fn = between(game, 'async function beginGame()', "document.getElementById('start-btn').addEventListener");
    const started = fn.indexOf('state.started = true;');
    const hold = fn.indexOf('if (openBuilderOnStart) startLookHold = true;');
    const restack = fn.indexOf('windowStack?.restack();');
    const gated = fn.indexOf('if (!startLookHold) {');
    const release = fn.indexOf('releaseStartWaiters();', gated);
    const prompts = fn.indexOf('promptStack?.flush();', gated);
    assert.ok(started < hold && hold < restack && restack < gated && gated < release && release < prompts, 'the card lets its top place go; the waiters wait');
    // The builder opens, and a missing builder never strands the hold.
    assert.match(fn, /openAvatarPanel\(\);\s*if \(app\?\.canvas && startLookHold\) app\.canvas\.dataset\.startLookHold = 'held';[\s\S]*?if \(!isAvatarOpen\(\)\) releaseStartLookHold\(\);/);
  });

  it('closing the builder lets them go, in order; queued screens name the builder as their hold', () => {
    const close = between(game, 'function closeAvatarPanel()', 'const VECTOR_BUILDER_TABS');
    assert.match(close, /const wasOpen = Boolean\(panel && !panel\.hidden\);/);
    assert.match(close, /if \(wasOpen\) releaseStartLookHold\(\);/);
    const release = between(game, 'function releaseStartLookHold()', '/** A visible element by id');
    assert.match(release, /if \(!startLookHold\) return;\s*startLookHold = false;/);
    assert.ok(release.indexOf('releaseStartWaiters();') < release.indexOf('promptStack?.flush();'), 'screens and the panel first, then prompts');
    assert.match(between(game, 'function queueScreen(', 'function noteScreenHold('), /if \(startHeld\(\)\) noteScreenHold\(state\.started \? 'look builder' : 'start card'\);/);
  });

  it('the familiar panel waits through the builder too (afterStart)', async () => {
    _resetFamiliarDialog();
    const data = {};
    // A stand-in for game.js's gate: started, but the builder from the card is open.
    let started = true;
    let lookHold = true;
    const waiters = [];
    const held = () => !started || lookHold;
    const afterStart = () => (held() ? new Promise((r) => waiters.push(r)) : Promise.resolve());
    const engine = {
      param: () => null,
      get started() { return started; },
      setData: (k, v) => { data[k] = v; },
      skillLearnedInfo: (id) => ({ classTsid: id, name: id, learned: '', next: [] }),
      afterStart,
      afterStreetCard: async () => {},
      playSound: () => {},
    };
    familiarDialogFeature.init(engine);
    familiarDialogFeature.onEvent('skill_learned:croppery_2', 1, engine);
    await tick();
    assert.equal(data.familiarLast, undefined, 'nothing over the look builder');
    lookHold = false; // closeAvatarPanel -> releaseStartLookHold
    for (const r of waiters.splice(0)) r();
    await tick();
    await tick();
    assert.equal(data.familiarLast, 'croppery_2');
    _resetFamiliarDialog();
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
    assert.match(read('play/index.html'), /<div id="overlay" class="overlay" role="dialog" aria-labelledby="start-card-title">\s*<div class="card start-card">\s*<div class="start-main">\s*<h2 id="start-card-title">Welcome to a scrap of Ur<\/h2>/);
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
    assert.match(resolveTokens(read('play/online/index.html')), /#overlay:not\(\.hidden\) \{ z-index: 80;/);
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

describe('the start card fine print', () => {
  it('colours its links moss, visited or not, instead of the browser blue and purple', () => {
    const css = readFileSync(new URL('../public/style.css', import.meta.url), 'utf8');
    assert.match(css, /\.fine a,\n\.fine a:visited \{ color: var\(--text-moss\);/);
    assert.match(css, /\.fine a:hover,\n\.fine a:focus-visible \{ color: var\(--c-green-34\);/);
  });
});

// STARTCARD (Austin 2026-10-31: "the start exploring dialog could use a UI revamp. The shortcut keys feel lost
// in the mix of content"): the title, one line, the actions, the goals, the keys in three headed groups and
// the fine print; the first action has focus; the card scrolls inside itself; online keeps the same markup.
describe('the start card layout', () => {
  const html = read('play/index.html');
  const card = html.slice(html.indexOf('<div id="overlay"'), html.indexOf('<!-- The Great Hog Haul'));
  const at = (needle) => {
    const i = card.indexOf(needle);
    assert.ok(i >= 0, `the card has ${needle}`);
    return i;
  };
  const text = (src) => src.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();

  it('reads title, one line, the actions, the goals, the keys, then the fine print', () => {
    const order = [
      '<h2 id="start-card-title">Welcome to a scrap of Ur</h2>',
      '<p class="start-lede">',
      '<div class="start-actions">',
      '<button id="start-btn" type="button">Start exploring</button>',
      '<button id="start-customize-btn" type="button" class="btn-secondary">Customize look first</button>',
      '<section class="start-goal" aria-labelledby="start-goal-title">',
      '<h3 id="start-goal-title">Today’s goals</h3>',
      '<section class="start-keys" aria-labelledby="start-keys-title">',
      '<h3 id="start-keys-title">Keys</h3>',
      '<p class="start-keys-foot">Hold <kbd>?</kbd> for every key</p>',
      '<p class="fine">',
    ].map(at);
    assert.deepEqual(order, [...order].sort((a, b) => a - b));
    assert.equal(card.match(/<p class="start-lede">/g).length, 1, 'one welcome line');
    assert.match(card, /<p class="start-lede">[^<]{20,80}<\/p>/, 'a short one');
    // The goals keep Hechey Track, the gathering, the cooking and the Triple Jump.
    const goal = text(card.slice(at('<section class="start-goal"'), at('<section class="start-keys"')));
    assert.match(goal, /grain or meat.*flour and sammiches.*Triple Jump.*Hechey Track/);
  });

  it('groups every key in Move, Do and Open: lists of a keycap and a label', () => {
    const groups = [...card.matchAll(/<div class="start-key-group start-key-(\w+)">\s*<h4>(\w+)<\/h4>\s*<ul>([\s\S]*?)<\/ul>/g)];
    assert.deepEqual(groups.map((g) => g[2]), ['Move', 'Do', 'Open']);
    const rows = Object.fromEntries(groups.map((g) => [g[2], [...g[3].matchAll(/<li><span class="start-caps">([\s\S]*?)<\/span><span>([^<]+)<\/span><\/li>/g)]
      .map((m) => `${[...m[1].matchAll(/<kbd[^>]*>([^<]+)<\/kbd>|<i>(or|\+)<\/i>/g)].map((k) => k[1] || (k[2] === '+' ? '+' : ' or ')).join('')}: ${m[2]}`)]));
    for (const g of groups) assert.equal(rows[g[2]].length, (g[3].match(/<li>/g) || []).length, `${g[2]}: every row is caps + label`);
    assert.deepEqual(rows, {
      Move: ['AD: Walk', 'W or Space: Tap to jump', '↑: Climb ladders', 'C: Camera'],
      Do: ['Enter: Verbs', 'Z: Player menu', 'V: Vendor', 'Shift+T: Teleport points'],
      Open: ['M or G: Map', 'Q: Quests', 'B: Badges', 'H: Feat', 'K or Shift+S: Skills', 'U: Upgrades', 'Y: Buffs'],
    });
    // Every key the old one-line list named is still on the card.
    const caps = [...card.matchAll(/<kbd[^>]*>([^<]+)<\/kbd>/g)].map((m) => m[1]);
    for (const key of ['A', 'D', 'W', 'Space', '↑', 'Enter', 'M', 'G', 'Z', 'Q', 'B', 'H', 'K', 'Shift', 'S', 'U', 'Y', 'C', 'T', 'V', '?']) {
      assert.ok(caps.includes(key), `${key} is on the card`);
    }
    assert.match(card, /<kbd title="Up arrow">↑<\/kbd>/);
  });

  it('keeps the fine print, plain copy and no other Glitch', () => {
    assert.match(card, /<p class="fine">A <a href="https:\/\/tinybitadventures\.com">fan remake<\/a> of Tiny Speck’s Glitch · <a href="credits\/">Credits<\/a> · <a href="privacy-policy\/">Privacy<\/a><\/p>\s*<\/div>\s*<\/div>/, 'last in the card');
    const copy = text(card.replace(/<!--[\s\S]*?-->/g, ''));
    assert.doesNotMatch(copy, /—/);
    assert.equal(copy.match(/Glitch/g).length, 1, 'only the fine print names it');
    const newxp = read('js/features/newxp-feature.js');
    const choice = between(newxp, 'const tutorialChoice = () => {', "engine.setData('newxpStartCard', 'shown');");
    assert.doesNotMatch(choice.replace(/\/\/[^\n]*/g, ''), /Glitch|—/);
  });

  it('puts the tutorial choice first among the actions, its note after its buttons', () => {
    const newxp = read('js/features/newxp-feature.js');
    const show = between(newxp, 'function showStartCard(engine) {', 'function resumeOnReload(');
    assert.match(show, /startBtn\.parentNode\.insertBefore\(box, startBtn\);/, 'in .start-actions, before Start exploring');
    for (const button of ['<button type="button" data-nx-start>Start</button>', '<button type="button" data-nx-start>Start with the tutorial</button>']) {
      const i = show.indexOf(button);
      assert.ok(i > 0 && i < show.indexOf('<p><strong>', i), `${button} comes before its note`);
    }
    const css = read('style.css');
    assert.match(css, /\.start-actions :is\(\.nx-start, \.nx-start-row\) \{ display: contents; \}/);
    assert.match(css, /\.start-actions \[data-nx-start\] \{ grid-column: 1 \/ -1; grid-row: 1; \}/);
    assert.match(css, /#start-btn,\n\.start-actions \[data-nx-start\] \{/, 'the tutorial start wears the primary button');
    assert.match(css, /#start-customize-btn,\n\.start-actions \[data-nx-skipstart\] \{/, 'Skip to Ur wears the secondary one');
  });

  it('focuses the first action as the card appears; Enter and Space press it', () => {
    const show = between(game, 'revealStartCard({', 'clear: () => {');
    assert.match(show, /startOverlay\.classList\.remove\('is-waiting'\);\s*focusStartCard\(\);/);
    assert.match(game, /function focusStartCard\(\) \{\s*document\.querySelector\('#overlay:not\(\.hidden\) :is\(\[data-nx-start\], #start-btn:not\(\[hidden\]\)\)'\)\?\.focus\(\{ preventScroll: true \}\);/);
    // The card is a dialog, so a focused button there takes Enter and Space (no jump queued), and the
    // notice and conversation gates that skip #overlay keep skipping it.
    assert.match(html, /<div id="overlay" class="overlay" role="dialog" aria-labelledby="start-card-title">/);
    assert.match(between(game, 'function focusedDialogButton()', '/** The newest-on-top window stack'), /closest\('dialog, \[role="dialog"\]/);
    assert.match(game, /const GATED_DIALOG_IDS = new Set\(\[[^\]]*'overlay'\]\);/);
    assert.doesNotMatch(html, /id="overlay"[^>]*aria-modal/, 'not a window: the stack keeps it apart');
    // A tutorial box that comes in after the card has focus takes it over from Start exploring.
    const newxp = read('js/features/newxp-feature.js');
    assert.match(newxp, /const hadFocus = document\.activeElement === startBtn;\s*startBtn\.hidden = true;/);
    assert.match(newxp, /if \(hadFocus\) box\.querySelector\('\[data-nx-start\]'\)\?\.focus\(\{ preventScroll: true \}\);/);
  });

  it('fits the frame: two columns on desktop, one on a phone, scrolling inside itself', () => {
    const raw = read('style.css');
    assert.match(raw, /\.start-card \{\n  display: grid;\n  grid-template-columns: minmax\(0, 0\.92fr\) minmax\(0, 1\.2fr\);[\s\S]*?max-height: 100%;\n  overflow-y: auto;/);
    assert.match(raw, /\[data-ui="modern"\] #overlay \{\n  padding: calc\(var\(--hud-h\) \+ var\(--sp-8\)\) calc\(var\(--sp-8\) \+ var\(--inset-r, 0px\)\) 72px/);
    assert.match(raw, /\[data-ui="classic"\] #overlay \{ padding-bottom: calc\(var\(--cband-h, calc\(132 \* var\(--cu\)\)\) \+ var\(--sp-6\)\); \}/);
    assert.match(raw, /\.start-key-open \{ grid-column: 2; grid-row: 1 \/ span 2; \}/);
    // The Social drawer's inset is measured again once the loading card lifts (it read 0 under it), so the
    // card centres clear of a drawer open at 1440 px.
    const drawer = read('js/ui/social-drawer.js');
    assert.match(drawer, /if \(body\.classList\.contains\('is-booting'\)\) return;\s*uncovered\.disconnect\(\);\s*syncInset\(\);/);
    const phone = raw.slice(raw.indexOf('@media (max-width: 720px) {\n  #overlay'));
    assert.match(phone, /\.start-card \{ grid-template-columns: minmax\(0, 1fr\);/);
    assert.match(phone, /\.start-key-groups \{ grid-template-columns: minmax\(0, 1fr\); \}/);
  });

  it('online shows the same card', () => {
    const online = read('play/online/index.html');
    const oc = online.slice(online.indexOf('<div id="overlay"'), online.indexOf('<!-- The Great Hog Haul'));
    assert.equal(oc, card);
  });
});
