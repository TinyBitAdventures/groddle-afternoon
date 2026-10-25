/**
 * Prompt timeouts and the card-paused clock (register row G198):
 * js/prompt-timeout.js, screen-fx cardPausedTimeout, the prompts that pass a
 * source timeout, toasts and activity lines under the loading card, and the
 * one-shot hell demos (helldemo=croak, helldemo=pooped).
 */
import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PROMPT_ROLL_OUT_MS, armPromptTimeout, promptTimeoutMs, timeoutChoice } from '../public/js/prompt-timeout.js?v=g198-1';
import { STREET_CARD_GONE, STREET_CARD_UP, cardPausedTimeout, streetCardUp } from '../public/js/screen-fx.js?v=g198-1';
import { hellFeature } from '../public/js/features/hell-feature.js?v=hell-6';
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

  it('engine.prompt passes timeout, timeoutMs, timeoutValue and onTimeout to the prompt card', () => {
    assert.match(game, /prompt\(\{ title = '', kicker = '', text = '', timeout = 0, timeoutMs = 0, timeoutValue = null, onTimeout = null \} = \{\}\) \{\s*openScriptedQuestDialogue\(\{[\s\S]{0,200}timeout,\s*timeoutMs,\s*timeoutValue,\s*onTimeout,/);
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
    assert.match(game, /you must exit and re-enter the Hall\.',\s*response: 'OK',\s*\}\],\s*\/\/ items\/npc_bureaucrat\.js 909-917[^\n]*\n\s*timeout: 10,/);
    assert.match(read(join(PUBLIC, 'js/quest-rooms/top-of-tree.js')), /text: JUMP_OFF_LINE, choices: \[\{ label: 'Ok', value: 'ok' \}\], timeout: 10 \}/);
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
    assert.deepEqual(engine.log.prompts[0], { kicker: 'Energy', title: 'Pooped', text: HELL_TEXT.pooped, timeoutMs: 10000 });
    assert.equal(hellFeature._state().pooped?.kind, 'pooped');
    engine.pc.energy = 5;
    hellFeature.onStreetEnter(engine.street, engine);
    assert.equal(engine.pc.energy, 5, 'once');
    hellFeature.restore({});
  });
});
