/**
 * G255: the quest log's Try button, failed timed quests, no_starting_quests,
 * and one-button offers for quests with no start step.
 *
 * - QuestElementUI.as setTryButton 224-264: every startable, unfinished quest
 *   has a Try button; disabled while started ("You're already doing this
 *   quest!"), "Try again" once failed, disabled under no_starting_quests
 *   ("Starting new quests is not allowed right now!").
 * - Timed quests fail when their timer buff runs out (items/catalog_buffs.js
 *   1397-1402 failQuest; inc_quests.js 420-471 keeps a startable quest in the
 *   log; quest.js onFail 145-157). Try again is quest_begin (main.js 6019-6031,
 *   quest.js onRestart 79-100), refused for the dead ("You are dead!").
 * - location.js 2666-2676: races, games and party spaces set no_starting_quests;
 *   ConversationManager.as 582-585 disables accept_and_start there.
 * - quest.js get_status 1119-1124: a quest with no onStarted gets one button.
 */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadContentCatalogsFromDir, resetContentCatalogs } from '../public/js/content-catalogs.js';
import { createQuestState } from '../public/js/quests.js';
import { acceptOffer, markOffered, questStatus, tickQuestTimers } from '../public/js/quest-offers.js';
import {
  ALREADY_DOING_TIP,
  NO_STARTING_QUESTS_TIP,
  questOffersFeature,
  retryTimedQuest,
  showWaitingOffer,
  startBlockedReason,
} from '../public/js/features/quest-offers-feature.js?v=offers-9';

const PUBLIC = join(dirname(fileURLToPath(import.meta.url)), '../public');
const read = (p) => readFileSync(join(PUBLIC, p), 'utf8');
const TIMED = 'mining_mine_in_time_period';

before(async () => {
  resetContentCatalogs();
  await loadContentCatalogsFromDir(join(PUBLIC, 'assets/content'));
});

function fakeEngine({ answers = {} } = {}) {
  const data = {};
  const dialogs = [];
  const activity = [];
  const toasts = [];
  let hud = 0;
  return {
    started: true,
    data,
    dialogs,
    activity,
    toasts,
    get hudUpdates() {
      return hud;
    },
    answers,
    dialogOpen: false,
    pc: { level: 10, xp: 0, energy: 50, mood: 50, imagination: 0, currants: 0, giantFavor: {} },
    inv: {},
    learnedSkills: ['mining_2'],
    unlockedAchievements: [],
    shrineState: {},
    questState: createQuestState(),
    street: { tsid: 'GLI2V0UN7RD1T2J', hubId: '56', label: 'Hechey Track' },
    streetTsid: 'GLI2V0UN7RD1T2J',
    param: () => null,
    query(hook) {
      return hook in this.answers ? this.answers[hook] : null;
    },
    activeBuffIds: () => [],
    streetCardUp: () => false,
    screenFxScreenUp: () => false,
    busy: () => false,
    questOffersHeld: () => false,
    questDialogueOpen() {
      return this.dialogOpen;
    },
    offerQuestDialogue(opts) {
      this.dialogOpen = true;
      dialogs.push(opts);
    },
    playSound() {},
    setData: (k, v) => {
      data[k] = v;
    },
    updateHud() {
      hud += 1;
    },
    refreshPack() {},
    save() {},
    toast: (t) => toasts.push(t),
    pushActivity: (line) => activity.push(line),
    award() {},
  };
}

/** Run a timed quest out: accepted, then its timer passes. */
function failTimed(engine) {
  const qs = engine.questState;
  assert.equal(acceptOffer(qs, TIMED, { now: 1000 }).ok, true);
  const failed = tickQuestTimers(qs, 1000 + 301 * 1000);
  assert.deepEqual(failed, [TIMED]);
  return qs;
}

describe('G255 timed quests: Try again', () => {
  it('a timed quest that runs out stays in the log, failed, and the line names it and the button', () => {
    const engine = fakeEngine();
    questOffersFeature.init(engine);
    const qs = engine.questState;
    acceptOffer(qs, TIMED, { now: Date.now() - 400_000 });
    qs.offers.timers[TIMED].endsAt = Date.now() - 1;
    questOffersFeature.onTick(16, Date.now(), engine);
    assert.equal(questStatus(qs, TIMED), 'failed');
    const line = engine.activity.find((l) => /ran out of time/.test(l));
    assert.match(line, /“Giv'r 'til you Shiver” ran out of time\. Choose Try again in your quest log to start it over\./);
    assert.doesNotMatch(line, /—/);
    assert.ok(engine.hudUpdates > 0, 'the log redraws to show Try again');
  });

  it('Try again restarts it with a fresh timer (onRestart: is_failed false, init_reqs)', () => {
    const engine = fakeEngine();
    const qs = failTimed(engine);
    const now = 5_000_000;
    const result = retryTimedQuest(engine, TIMED, now);
    assert.equal(result.ok, true);
    assert.equal(questStatus(qs, TIMED), 'active');
    assert.deepEqual(qs.offers.timers[TIMED], { startedAt: now, endsAt: now + 300 * 1000 });
    assert.equal(engine.data.questOfferResult, 'restarted');
    assert.match(engine.activity.at(-1), /Started again: Giv'r 'til you Shiver/);
    assert.equal(retryTimedQuest(engine, TIMED, now).reason, 'not_failed', 'only a failed quest');
  });

  it('dead, Try again fails with the source error and the quest stays failed', () => {
    const engine = fakeEngine({ answers: { isDead: true } });
    const qs = failTimed(engine);
    assert.equal(retryTimedQuest(engine, TIMED).reason, 'dead');
    assert.equal(engine.toasts.at(-1), 'Error starting quest: You are dead!');
    assert.equal(questStatus(qs, TIMED), 'failed');
  });

  it('under no_starting_quests, Try again is refused', () => {
    const engine = fakeEngine({ answers: { noStartingQuests: true } });
    const qs = failTimed(engine);
    assert.equal(startBlockedReason(engine), NO_STARTING_QUESTS_TIP);
    assert.equal(retryTimedQuest(engine, TIMED).reason, 'no_starting_quests');
    assert.equal(questStatus(qs, TIMED), 'failed');
  });
});

describe('G255 the log card Try button (QuestElementUI.as setTryButton)', () => {
  let saved;
  before(() => {
    saved = globalThis.document;
    globalThis.document = fakeDocument();
  });
  after(() => {
    if (saved === undefined) delete globalThis.document;
    else globalThis.document = saved;
  });

  it('started: Try it, disabled, "You\'re already doing this quest!"; failed: Try again', () => {
    const engine = fakeEngine();
    const qs = engine.questState;
    acceptOffer(qs, TIMED, { now: 1000 });
    let [bt] = questOffersFeature.questLogActions(TIMED, engine);
    assert.equal(bt.textContent, 'Try it');
    assert.equal(bt.disabled, true);
    assert.equal(bt.title, ALREADY_DOING_TIP);
    tickQuestTimers(qs, 1000 + 301 * 1000);
    [bt] = questOffersFeature.questLogActions(TIMED, engine);
    assert.equal(bt.textContent, 'Try again');
    assert.equal(bt.disabled, false);
    bt.click();
    assert.equal(questStatus(qs, TIMED), 'active');
  });

  it('a plain quest, a story quest outside quest-offers, or one not in the log gets no Try button', () => {
    const engine = fakeEngine();
    const qs = engine.questState;
    acceptOffer(qs, 'blending_make_level1_recipes', { now: 1 });
    assert.deepEqual(questOffersFeature.questLogActions('blending_make_level1_recipes', engine), []);
    assert.deepEqual(questOffersFeature.questLogActions(TIMED, engine), []);
    acceptOffer(qs, TIMED, { now: 1 });
    delete qs.offers.managed[TIMED];
    assert.deepEqual(questOffersFeature.questLogActions(TIMED, engine), []);
  });

  it('under no_starting_quests the failed quest\'s Try again and a put-off quest\'s Try it are disabled with the tip', () => {
    const engine = fakeEngine({ answers: { noStartingQuests: true } });
    const qs = failTimed(engine);
    const [bt] = questOffersFeature.questLogActions(TIMED, engine);
    assert.equal(bt.textContent, 'Try again');
    assert.equal(bt.disabled, true);
    assert.equal(bt.title, NO_STARTING_QUESTS_TIP);
    markOffered(qs, 'ezcooking_1', 5);
    qs.offers.declined.ezcooking_1 = 6;
    delete qs.offers.offered.ezcooking_1;
    const [card] = questOffersFeature.questLogCards(engine);
    const go = card.children.find((el) => el.tag === 'button');
    assert.equal(go.textContent, 'Try it');
    assert.equal(go.disabled, true);
    assert.equal(go.title, NO_STARTING_QUESTS_TIP);
  });
});

describe('G255 offers', () => {
  it('a startable offer under no_starting_quests: accept blocked, "Not right now" still works', () => {
    const engine = fakeEngine({ answers: { noStartingQuests: true } });
    engine.learnedSkills = ['ezcooking_1'];
    questOffersFeature.init(engine);
    markOffered(engine.questState, 'ezcooking_1', Date.now());
    assert.equal(showWaitingOffer(engine), true);
    const card = engine.dialogs.at(-1);
    assert.equal(card.acceptBlocked, NO_STARTING_QUESTS_TIP);
    assert.equal(card.declinable, true);
    card.onDecline();
    assert.equal(questStatus(engine.questState, 'ezcooking_1'), 'declined');
  });

  it('a plain offer is never blocked (it only accepts)', () => {
    const engine = fakeEngine({ answers: { noStartingQuests: true } });
    engine.learnedSkills = ['blending_1'];
    questOffersFeature.init(engine);
    markOffered(engine.questState, 'blending_make_level1_recipes', Date.now());
    showWaitingOffer(engine);
    assert.equal(engine.dialogs.at(-1).acceptBlocked, '');
  });

  it('accepting a startable offer while dead leaves it accepted, not started, with the error', () => {
    const engine = fakeEngine({ answers: { isDead: true } });
    engine.learnedSkills = ['ezcooking_1'];
    questOffersFeature.init(engine);
    markOffered(engine.questState, 'ezcooking_1', Date.now());
    showWaitingOffer(engine);
    engine.dialogs.at(-1).onAccept();
    assert.equal(questStatus(engine.questState, 'ezcooking_1'), 'declined');
    assert.equal(engine.toasts.at(-1), 'Error starting quest: You are dead!');
  });

  it('offers for quests with no start step have one button (quest.js get_status 1119-1124)', () => {
    const one = (path, marker) => {
      const src = read(path);
      const at = src.indexOf(marker);
      assert.ok(at >= 0, `${path}: ${marker}`);
      const call = src.slice(at, src.indexOf('});', at));
      assert.match(call, /declinable: false/, path);
      assert.doesNotMatch(call, /declineLabel|onDecline/, path);
    };
    one('js/features/hell-tickets-feature.js', 'engine.offerQuestDialogue({');
    one('js/features/seasons-feature.js', 'engine.offerQuestDialogue?.({\n    title: q.title');
    one('js/features/newxp-feature.js', "const def = getQuestCatalog().leave_gentle_island;");
    one('js/features/street-furniture-feature.js', 'beats: [{ text: STONE_TEXT.optOut');
  });

  it('party spaces answer noStartingQuests (location.js 2673-2676)', () => {
    assert.match(read('js/features/party-spaces-feature.js'), /noStartingQuests\(engine\) \{\n\s+return onPartyStreet\(engine\) \? true : null;/);
  });
});

describe('G255 game.js wiring', () => {
  const game = read('game.js');
  it('the quest log draws only while open, and only when its markup changed', () => {
    assert.match(game, /if \(qShown && isQuestOpen\(\)\) \{\n\s+const qBox = document\.createElement\('div'\);/);
    assert.match(game, /if \(drawn !== questLogDrawn\) \{\n\s+qShown\.replaceChildren\(\.\.\.qBox\.childNodes\);/);
    assert.doesNotMatch(game, /qBox\.innerHTML = ''/);
    // openQuestPanel shows the panel before updateHud draws it.
    assert.match(game, /panel\.hidden = false;\n\s+updateHud\(\);\n\s+\}\n\}/);
  });
  it('active cards take the Try button, and a blocked accept does nothing', () => {
    assert.match(game, /features\.collect\('questLogActions', p\.def\.classTsid, engine\)/);
    assert.match(game, /primaryBlocked: acceptBlocked \|\| ''/);
    assert.match(game, /if \(!questDialogueState \|\| questAcceptBlocked\(\)\) return;/);
    assert.match(game, /return Boolean\(st\?\.primaryBlocked && st\.index >= \(st\.beats\?\.length \|\| 0\) - 1\);/);
    assert.match(game, /next\.disabled = Boolean\(blocked\);/);
  });
});

/** Just enough DOM for the log card builders. */
function fakeDocument() {
  const make = (tag) => {
    const listeners = {};
    const el = {
      tag,
      type: '',
      className: '',
      textContent: '',
      title: '',
      disabled: false,
      hidden: false,
      dataset: {},
      children: [],
      appendChild(child) {
        el.children.push(child);
        return child;
      },
      append(...kids) {
        el.children.push(...kids);
      },
      addEventListener(type, fn) {
        listeners[type] = fn;
      },
      click() {
        listeners.click?.();
      },
    };
    return el;
  };
  return { createElement: make, getElementById: () => null };
}
