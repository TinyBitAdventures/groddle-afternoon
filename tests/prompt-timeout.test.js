/**
 * Prompt timeouts and the card-paused clock (register row G198):
 * js/prompt-timeout.js, screen-fx cardPausedTimeout, the prompts that pass a
 * source timeout, toasts and activity lines under the loading card, and the
 * one-shot hell demos (helldemo=croak, helldemo=pooped).
 * G200: the Magic Rock check held by the card, keys kept from a prompt the
 * card hides (screen-fx cardHidesKey), and Super Pooped from the energy lost
 * today (helldemo=superpooped).
 */
import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PROMPT_ROLL_OUT_MS, armPromptTimeout, promptTimeoutMs, timeoutChoice } from '../public/js/prompt-timeout.js?v=card-2';
import { STREET_CARD_GONE, STREET_CARD_UP, cardHidesKey, cardPausedTimeout, installStreetCardKeyGuard, streetCardUp } from '../public/js/screen-fx.js?v=card-2';
import { hellFeature } from '../public/js/features/hell-feature.js?v=hell-16';
import { questOffersFeature } from '../public/js/features/quest-offers-feature.js?v=offers-12';
import { HELL_ENTRY_PROMPT_TIMEOUT_MS, HELL_TEXT } from '../public/js/hell.js';
import { createQuestState } from '../public/js/quests.js';

const spike = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = join(spike, 'public');
const gsjs = join(spike, '../glitch-GameServerJS');
const client = join(spike, '../glitch-client/com/tinyspeck/engine');
const read = (p) => readFileSync(p, 'utf8');
const HECHEY = 'GLI2V0UN7RD1T2J';

/** A fake timer(fn, ms) -> cancel, driven by hand. */
function fakeTimers() {
  let now = 0;
  const live = new Set();
  const timer = (fn, ms) => {
    const row = { fn, at: now + ms };
    live.add(row);
    return () => live.delete(row);
  };
  const advance = (ms) => {
    const end = now + ms;
    for (;;) {
      const due = [...live].filter((r) => r.at <= end).sort((a, b) => a.at - b.at)[0];
      if (!due) break;
      now = due.at;
      live.delete(due);
      due.fn();
    }
    now = end;
  };
  return { timer, advance, pending: () => live.size };
}

/** An EventTarget card for the hover hold. */
const hoverCard = () => new EventTarget();
const pointer = (el, type) => el.dispatchEvent(new Event(type));

describe('what the source does', () => {
  it('the client times a prompt out from when it shows, holds it under the pointer and sends timeout_value', { skip: !existsSync(client) && 'no client checkout' }, () => {
    const view = read(join(client, 'view/gameoverlay/PromptView.as'));
    assert.match(view, /var ms:int = prompt\.timeout\*1000;\s*if \(ms\) \{\s*StageBeacon\.setTimeout\(removePromptIfNotOver, ms, sp\);/);
    assert.match(view, /private function removePromptIfNotOver\(sp:Sprite\):void \{\s*if \(over\) \{\s*if \(removeables\.indexOf\(sp\) == -1\) removeables\.push\(sp\);\s*\} else \{\s*removePromptAndSendChoice\(sp\);/);
    assert.match(view, /if \(value_to_send === null\) \{\s*value_to_send = prompt\.timeout_value;\s*\}[\s\S]{0,120}if \(value_to_send\) \{/);
    assert.match(view, /private function onRollOut[\s\S]{0,260}\}, 2000\);/);
    assert.match(read(join(client, 'data/prompt/Prompt.as')), /public var timeout:int; \/\/ ignored if modal/);
    assert.equal(PROMPT_ROLL_OUT_MS, 2000);
  });

  it('the client pauses growls while you move and resumes them after', { skip: !existsSync(client) && 'no client checkout' }, () => {
    const q = read(join(client, 'view/ui/GrowlQueue.as'));
    assert.match(q, /public function moveMoveStarted\(\):void \{\s*TSTweener\.pauseTweens\(this, 'alpha'\);\s*visible = false;\s*is_moving = true;/);
    assert.match(q, /public function moveMoveEnded\(\):void \{[\s\S]{0,120}StageBeacon\.setTimeout\(resume, 800\);/);
    assert.match(q, /if\(is_moving && update_queue\.length > 0\)\{/);
  });

  it('the remake prompts with a source timeout', { skip: !existsSync(gsjs) && 'no GSJS checkout' }, () => {
    const loc = read(join(gsjs, 'locations/location.js'));
    assert.match(loc, /Uh oh\. You croaked![\s\S]{0,200}timeout_value\t: '',\s*timeout\t\t: 10,/, 'Hell One');
    assert.match(loc, /Just jump off the tree to go back to where you were…',\s*icon_buttons\t: false,\s*timeout_value\t: '',\s*timeout\t\t: 10,/, 'Top of the tree');
    const buffs = read(join(gsjs, 'items/catalog_buffs.js'));
    assert.match(buffs, /You are seriously pooped![\s\S]{0,120}timeout\s*: 10/);
    assert.match(buffs, /You are completely pooped\.[\s\S]{0,160}timeout\s*: 10/);
    assert.match(read(join(gsjs, 'items/teleportation_script.js')), /You've created a Teleportation Script! You can give it to anybody you like\.",\s*icon_buttons\t: false,\s*timeout\t\t: 15,/);
    assert.match(read(join(gsjs, 'items/npc_bureaucrat.js')), /Thank you for your business\.[^\n]*\n\t\ticon_buttons\t: false,\n\t\ttimeout\t\t: 10,/);
    assert.match(read(join(gsjs, 'players/inc_prompts.js')), /if \(details\.timeout && !details\.timeout_value\)\{\s*details\.expires = time\(\) \+ details\.timeout;/);
  });
});

describe('js/prompt-timeout.js', () => {
  it('seconds or ms; the choice is timeout_value or none', () => {
    assert.equal(promptTimeoutMs({ timeout: 10 }), 10000);
    assert.equal(promptTimeoutMs({ timeoutMs: 2500 }), 2500);
    assert.equal(promptTimeoutMs({ timeout: 10, timeoutMs: 400 }), 400);
    assert.equal(promptTimeoutMs({}), 0);
    assert.equal(promptTimeoutMs({ timeout: 'x' }), 0);
    assert.equal(timeoutChoice(''), null);
    assert.equal(timeoutChoice(undefined), null);
    assert.equal(timeoutChoice('timeout'), 'timeout');
  });

  it('expires once after its time, with the timeout value', () => {
    const t = fakeTimers();
    const got = [];
    armPromptTimeout({ ms: 10000, onExpire: (c) => got.push(c), timer: t.timer });
    t.advance(9999);
    assert.deepEqual(got, []);
    t.advance(1);
    assert.deepEqual(got, [null], 'no timeout_value: it just goes');
    t.advance(60000);
    assert.deepEqual(got, [null]);
    const sent = [];
    armPromptTimeout({ ms: 3000, timeoutValue: 'timeout', onExpire: (c) => sent.push(c), timer: t.timer });
    t.advance(3000);
    assert.deepEqual(sent, ['timeout']);
  });

  it('the pointer over the card holds it; it goes 2 s after the pointer leaves', () => {
    const t = fakeTimers();
    const card = hoverCard();
    const got = [];
    const h = armPromptTimeout({ ms: 10000, hoverEl: card, onExpire: (c) => got.push(c), timer: t.timer });
    pointer(card, 'pointerenter');
    t.advance(15000);
    assert.equal(h.expired(), true);
    assert.deepEqual(got, [], 'held while you read it');
    pointer(card, 'pointerleave');
    t.advance(1500);
    pointer(card, 'pointerenter');
    t.advance(5000);
    assert.deepEqual(got, [], 'back over it: the 2 s start again on the next leave');
    pointer(card, 'pointerleave');
    t.advance(1999);
    assert.deepEqual(got, []);
    t.advance(1);
    assert.deepEqual(got, [null]);
    assert.equal(t.pending(), 0);
  });

  it('a pointer that leaves before the time is up changes nothing; cancel stops it', () => {
    const t = fakeTimers();
    const card = hoverCard();
    const got = [];
    armPromptTimeout({ ms: 10000, hoverEl: card, onExpire: (c) => got.push(c), timer: t.timer });
    pointer(card, 'pointerenter');
    pointer(card, 'pointerleave');
    t.advance(10000);
    assert.deepEqual(got, [null]);
    const h = armPromptTimeout({ ms: 10000, hoverEl: card, onExpire: (c) => got.push(c), timer: t.timer });
    h.cancel();
    t.advance(20000);
    assert.deepEqual(got, [null]);
    assert.equal(armPromptTimeout({ ms: 0, onExpire: () => got.push('x'), timer: t.timer }).expired(), false);
  });
});

describe('screen-fx cardPausedTimeout', () => {
  let saved = null;
  function withRoot() {
    const root = new EventTarget();
    root.dataset = {};
    saved = { document: globalThis.document };
    globalThis.document = { documentElement: root };
    const up = () => {
      root.dataset.streetCards = '1';
      root.dispatchEvent(new Event(STREET_CARD_UP));
    };
    const gone = () => {
      delete root.dataset.streetCards;
      root.dispatchEvent(new Event(STREET_CARD_GONE));
    };
    return { up, gone };
  }
  afterEach(() => {
    if (!saved) return;
    if (saved.document === undefined) delete globalThis.document;
    else globalThis.document = saved.document;
    saved = null;
  });

  it('its clock stops while a card is up and runs on after', (t) => {
    t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
    const { up, gone } = withRoot();
    let fired = 0;
    cardPausedTimeout(() => fired++, 4000);
    t.mock.timers.tick(1000);
    up();
    assert.equal(streetCardUp(), true);
    t.mock.timers.tick(10000);
    assert.equal(fired, 0, 'not spent under the card');
    gone();
    t.mock.timers.tick(2999);
    assert.equal(fired, 0);
    t.mock.timers.tick(1);
    assert.equal(fired, 1, '3 s left after the card');
  });

  it('armed under a card, it starts once the card has gone; cancel stops it', (t) => {
    t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
    const { up, gone } = withRoot();
    up();
    let fired = 0;
    cardPausedTimeout(() => fired++, 1000);
    const cancel = cardPausedTimeout(() => fired++, 1000);
    t.mock.timers.tick(5000);
    assert.equal(fired, 0);
    gone();
    cancel();
    t.mock.timers.tick(1000);
    assert.equal(fired, 1);
  });

  it('no document (node): an ordinary timeout', (t) => {
    t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
    let fired = 0;
    cardPausedTimeout(() => fired++, 50);
    t.mock.timers.tick(50);
    assert.equal(fired, 1);
  });
});

describe('the game wires them', () => {
  const game = read(join(PUBLIC, 'game.js'));
  const css = read(join(PUBLIC, 'style.css'));

  it('engine.prompt passes timeout, timeoutMs, timeoutValue and onTimeout to the prompt stack, or the card when modal', () => {
    // G294: a normal prompt joins the bottom-right stack (js/prompt-stack.js); only modal: true takes the card.
    assert.match(game, /prompt\(\{ title = '', kicker = '', text = '', choices = null, timeout = 0, timeoutMs = 0, timeoutValue = null, onTimeout = null, onChoice = null, modal = false, iconButtons = false, sound = '' \} = \{\}\) \{/);
    assert.match(game, /if \(modal !== true\) return promptStackUi\(\)\.add\(\{ text, choices, timeout, timeoutMs, timeoutValue, onTimeout, onChoice, iconButtons, sound \}\);/);
    // G213: `choices` sets the buttons (one choice: no Close), between the signature and the call.
    assert.match(game, /modal = false, iconButtons = false, sound = '' \} = \{\}\) \{[\s\S]{0,800}?openScriptedQuestDialogue\(\{[\s\S]{0,600}timeout,\s*timeoutMs,\s*timeoutValue,\s*onTimeout,/);
    assert.match(game, /renderQuestDialogueBeat\(\);\n  armQuestDialogueTimeout\(\{ timeout, timeoutMs, timeoutValue, onTimeout \}\);/);
    assert.match(game, /hoverEl: document\.querySelector\('#quest-dialogue \.quest-dialogue-card'\)/);
    assert.match(game, /if \(questDialogueState !== mine\) return;\s*closeQuestDialogue\(\{ force: true \}\);/, 'only the prompt that armed it');
  });

  it('every remake prompt with a source timeout passes it', () => {
    const hell = read(join(PUBLIC, 'js/hell.js'));
    assert.equal(HELL_ENTRY_PROMPT_TIMEOUT_MS, 10000);
    assert.match(hell, /timeoutMs: HELL_ENTRY_PROMPT_TIMEOUT_MS/);
    assert.equal((hell.match(/text: HELL_TEXT\.(super)?[pP]ooped, timeoutMs: 10000/g) || []).length, 2, 'Pooped and Super Pooped');
    assert.match(read(join(PUBLIC, 'js/features/hell-feature.js')), /const timed = effect\.timeoutMs > 0 \? \{ timeoutMs: effect\.timeoutMs \} : \{\};/);
    assert.match(read(join(PUBLIC, 'js/features/teleportation-feature.js')), /title: out\.script\.title, text: out\.message, timeout: 15 \}/);
    // items/npc_bureaucrat.js showEndPrompt 909-917 (G294: the stack, no heading).
    assert.match(game, /engine\.prompt\(\{\s*text: 'Thank you for your business\. To conduct another transaction, you must exit and re-enter the Hall\.',\s*choices: \[\{ label: 'OK', value: 'ok' \}\],\s*timeout: 10,\s*\}\);/);
    assert.match(read(join(PUBLIC, 'js/quest-rooms/top-of-tree.js')), /ctx\.prompt\(\{ text: JUMP_OFF_LINE, choices: \[\{ label: 'Ok', value: '' \}\], timeout: 10, timeoutValue: '' \}\)/);
    assert.match(read(join(PUBLIC, 'js/features/quest-instances-feature.js')), /const ms = promptTimeoutMs\(\{ timeout \}\);/);
    // The subway's stop prompt already ran its own (inc_transit.js 378-382, timeout_value 'timeout').
    assert.match(read(join(PUBLIC, 'js/features/subway-feature.js')), /timeoutMs: ride\.timing\.prompt,/);
  });

  it('toasts and activity lines hide under the card and their clocks stop (GrowlQueue)', () => {
    assert.match(css, /html\[data-street-cards\] \.toast,\nhtml\[data-street-cards\] \.activity-feed \{ visibility: hidden; \}/);
    assert.match(game, /if \(streetCardUp\(\)\) state\.toastHeldAt \|\|= t;/);
    assert.match(game, /state\.toastHeldAt = streetCardUp\(\) \? state\.toastTimer - ms : 0;/);
    assert.match(game, /cardPausedTimeout\(\(\) => \{\n\s*el\.classList\.add\('is-leaving'\);/);
  });

  it('a toast raised before a panel opens goes when the panel opens (shrine reopened after a donation)', () => {
    assert.match(game, /state\.toastOverModal = Boolean\(openGlitchModal\(\)\);/);
    assert.match(game, /const staleUnderPanel = state\.toastTimer > 0 && !state\.toastOverModal && openGlitchModal\(\);/);
    assert.match(game, /if \(staleUnderPanel \|\| \(!state\.toastHeldAt && state\.toastTimer > 0 && performance\.now\(\) >= state\.toastTimer\)\)/);
    assert.match(game, /closeShrinePanel\(\);\n\s*playShrineDonation\(target\);\n\s*refreshShrineTarget\(target\);\n\s*toast\(line, 4200\);/, 'the donation toast is raised after the panel closes');
  });
});

describe('the hell demos run once (helldemo=croak, helldemo=pooped)', () => {
  function hellEngine(demo) {
    const log = { prompts: [], entered: [] };
    const engine = {
      started: true,
      log,
      pc: { level: 5, energy: 50, energyMax: 100, mood: 50, moodMax: 100 },
      inv: {},
      questState: createQuestState(),
      streetTsid: HECHEY,
      street: { tsid: HECHEY, hubId: '56', label: 'Hechey Track' },
      player: { x: 100, y: 200 },
      param: (k) => (k === 'helldemo' ? demo : null),
      setData() {},
      playSound() {},
      pushActivity() {},
      updateHud() {},
      stopFollowing() {},
      refreshPack() {},
      save() {},
      toast() {},
      register: (t) => t,
      hasBuff: () => false,
      removeBuff() {},
      addBuff() {},
      questFlag() {},
      homeContext: () => ({ inHome: false }),
      transientInstance: () => false,
      streetExists: () => true,
      prompt: (p) => log.prompts.push(p),
      achievement() {},
      enter(tsid) {
        log.entered.push(tsid);
        return new Promise(() => {});
      },
      afterStreetCard: () => Promise.resolve(),
    };
    return engine;
  }

  it('croak zeroes your energy on the first street only, not after you resurrect', () => {
    hellFeature.restore({});
    const engine = hellEngine('croak');
    hellFeature.init(engine);
    hellFeature.onStreetEnter(engine.street, engine);
    assert.equal(engine.pc.energy, 0);
    engine.pc.energy = 40;
    hellFeature.onStreetEnter(engine.street, engine);
    assert.equal(engine.pc.energy, 40, 'a later street (the resurrect street) leaves it alone');
    hellFeature.restore({});
  });

  it('pooped: a croak counted today and 5% energy, so the next loss brings the Pooped prompt with its 10 s', (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    hellFeature.restore({});
    const engine = hellEngine('pooped');
    hellFeature.init(engine);
    hellFeature.onStreetEnter(engine.street, engine);
    assert.equal(hellFeature.isDead(), false, 'no trip to Naraka');
    assert.equal(engine.pc.energy, 5);
    assert.equal(engine.log.entered.length, 0);
    hellFeature.onTick(16, Date.now(), engine);
    t.mock.timers.tick(0);
    assert.equal(engine.log.prompts.length, 1);
    // G230: text only, no invented kicker or title (catalog_buffs.js 1706-1712, PromptView.as 210-237).
    assert.deepEqual(engine.log.prompts[0], { text: HELL_TEXT.pooped, timeoutMs: 10000 });
    assert.equal(hellFeature._state().pooped?.kind, 'pooped');
    engine.pc.energy = 5;
    hellFeature.onStreetEnter(engine.street, engine);
    assert.equal(engine.pc.energy, 5, 'once');
    hellFeature.restore({});
  });

  it('G200 superpooped: 20x the tank used today, so the next loss brings Super Pooped and its 10 s', (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    hellFeature.restore({});
    const engine = hellEngine('superpooped');
    hellFeature.init(engine);
    hellFeature.onStreetEnter(engine.street, engine);
    assert.equal(engine.pc.energy, 5);
    assert.equal(hellFeature._state().energyConsumedToday, 1999);
    hellFeature.onTick(16, Date.now(), engine);
    t.mock.timers.tick(0);
    assert.equal(hellFeature._state().energyConsumedToday, 2000, 'the 1 lost counted (inc_metabolics.js 134)');
    assert.equal(hellFeature._state().pooped?.kind, 'super_pooped');
    assert.deepEqual(engine.log.prompts, [{ text: HELL_TEXT.superPooped, timeoutMs: 10000 }]);
    assert.equal(hellFeature.metabolicGate('energy', 'gain')?.msg, HELL_TEXT.superPoopedEnergyGain);
    hellFeature.restore({});
  });

  it('G200: every loss the feature sees adds to today\'s count (20 x 99 = 1,980), gains do not', () => {
    hellFeature.restore({});
    const engine = hellEngine(null);
    hellFeature.init(engine);
    hellFeature.onStreetEnter(engine.street, engine);
    const now = Date.now();
    engine.pc.energy = 100;
    hellFeature.onTick(16, now, engine);
    // A long day of work: eat to full, spend down to 1, twenty times.
    for (let i = 0; i < 20; i += 1) {
      engine.pc.energy = 100;
      hellFeature.onTick(16, now + i * 10 + 1, engine);
      engine.pc.energy = 1; // not zero: no croak in this loop
      hellFeature.onTick(16, now + i * 10 + 2, engine);
    }
    assert.equal(Math.round(hellFeature._state().energyConsumedToday), 1980);
    assert.equal(hellFeature._state().pooped, null, 'no croak today: never Pooped (deaths_today)');
    hellFeature.restore({});
  });
});

describe('G200 the Magic Rock waits out the loading card, not 30 s', () => {
  function offerEngine() {
    const log = { busy: 0 };
    const engine = {
      started: true,
      log,
      cardUp: false,
      pc: { level: 5, xp: 0, energy: 50, energyMax: 100 },
      inv: {},
      learnedSkills: [],
      unlockedAchievements: [],
      shrineState: {},
      questState: createQuestState(),
      street: { tsid: HECHEY, hubId: '56', label: 'Hechey Track' },
      streetTsid: HECHEY,
      param: () => null,
      activeBuffIds: () => [],
      streetCardUp() {
        return this.cardUp;
      },
      // presentOffer's first gate: count the checks that reach it.
      busy() {
        log.busy += 1;
        return true;
      },
      questOffersHeld: () => false,
      questDialogueOpen: () => false,
      setData() {},
      updateHud() {},
      save() {},
      pushActivity() {},
    };
    return engine;
  }

  it('a check that falls under the card runs as soon as the card has gone, then every 30 s', () => {
    const engine = offerEngine();
    questOffersFeature.init(engine);
    const t0 = Date.now();
    questOffersFeature.onStreetEnter(engine.street, engine); // due 4 s after arrival
    engine.cardUp = true;
    questOffersFeature.onTick(16, t0 + 5000, engine);
    assert.equal(engine.log.busy, 0, 'held, not spent under the card');
    questOffersFeature.onTick(16, t0 + 9000, engine);
    assert.equal(engine.log.busy, 0);
    engine.cardUp = false;
    questOffersFeature.onTick(16, t0 + 9100, engine);
    assert.equal(engine.log.busy, 1, 'runs the frame the card goes');
    questOffersFeature.onTick(16, t0 + 9200, engine);
    questOffersFeature.onTick(16, t0 + 39000, engine);
    assert.equal(engine.log.busy, 1, 'busy then: the source cadence again');
    questOffersFeature.onTick(16, t0 + 39100, engine);
    assert.equal(engine.log.busy, 2);
  });

  it('a card that comes and goes between checks changes nothing', () => {
    const engine = offerEngine();
    questOffersFeature.init(engine);
    const t0 = Date.now();
    questOffersFeature.onTick(16, t0 + 12500, engine);
    assert.equal(engine.log.busy, 1);
    engine.cardUp = true;
    questOffersFeature.onTick(16, t0 + 14000, engine);
    engine.cardUp = false;
    questOffersFeature.onTick(16, t0 + 20000, engine);
    assert.equal(engine.log.busy, 1, 'no check fell under it');
    questOffersFeature.onTick(16, t0 + 42600, engine);
    assert.equal(engine.log.busy, 2);
  });

  it('the feature reads the card through the engine', () => {
    const feature = read(join(PUBLIC, 'js/features/quest-offers-feature.js'));
    assert.match(feature, /const cardUp = engine\.streetCardUp\?\.\(\) === true;/);
    assert.match(read(join(PUBLIC, 'game.js')), /streetCardUp: \(\) => streetCardUp\(\),/);
  });
});

describe('G200 a prompt the card hides takes no keys', () => {
  let saved = null;
  function page({ card = true, dialogOpen = true } = {}) {
    const root = new EventTarget();
    root.dataset = card ? { streetCards: '1' } : {};
    saved = { document: globalThis.document };
    globalThis.document = {
      documentElement: root,
      querySelector: (sel) => (sel === '.quest-dialogue:not([hidden])' && dialogOpen ? {} : null),
    };
    return root;
  }
  afterEach(() => {
    if (!saved) return;
    if (saved.document === undefined) delete globalThis.document;
    else globalThis.document = saved.document;
    saved = null;
  });
  const inside = { closest: (sel) => (sel === '.quest-dialogue' ? {} : null) };
  const outside = { closest: () => null };

  it('Enter, Space and Escape stop at a hidden dialog; other keys and other times pass', () => {
    page();
    assert.equal(cardHidesKey({ key: 'Escape', target: outside }), true, 'Escape would close it unseen');
    assert.equal(cardHidesKey({ key: 'Enter', target: outside }), true);
    assert.equal(cardHidesKey({ key: ' ', target: outside }), true);
    assert.equal(cardHidesKey({ key: 'a', target: inside }), true, 'any key from inside it');
    assert.equal(cardHidesKey({ key: 'a', target: outside }), false);
    page({ dialogOpen: false });
    assert.equal(cardHidesKey({ key: 'Escape', target: outside }), false, 'no dialog: Escape is the game\'s');
    page({ card: false });
    assert.equal(cardHidesKey({ key: 'Enter', target: inside }), false, 'no card: the dialog answers');
  });

  it('the guard stops the key before later handlers and prevents the button press', () => {
    page();
    const win = new EventTarget();
    assert.equal(installStreetCardKeyGuard(win), true);
    assert.equal(installStreetCardKeyGuard(win), false, 'once per page');
    let reached = 0;
    win.addEventListener('keydown', () => reached++);
    win.addEventListener('keyup', () => reached++);
    const key = (type, k) => {
      const e = new Event(type, { cancelable: true });
      Object.defineProperty(e, 'key', { value: k });
      win.dispatchEvent(e);
      return e;
    };
    assert.equal(key('keydown', 'Escape').defaultPrevented, true);
    assert.equal(key('keyup', ' ').defaultPrevented, true);
    assert.equal(reached, 0);
    assert.equal(key('keydown', 'd').defaultPrevented, false);
    assert.equal(reached, 1, 'walking keys pass');
    delete globalThis.document.documentElement.dataset.streetCards;
    assert.equal(key('keydown', 'Escape').defaultPrevented, false);
    assert.equal(reached, 2, 'after the card the dialog keys work again');
  });

  it('the game hides the same dialogs the guard covers', () => {
    assert.match(read(join(PUBLIC, 'style.css')), /html\[data-street-cards\] \.quest-dialogue \{ visibility: hidden; \}/);
    assert.match(read(join(PUBLIC, 'js/screen-fx.js')), /\n\/\/ game\.js imports this module before any feature registers a key handler\.\ninstallStreetCardKeyGuard\(\);/);
  });
});
