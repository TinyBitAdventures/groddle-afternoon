/**
 * Ticket 21 (player report 2026-11-01): the Magic Rock's "new quest" card for Beelzebooze became a
 * loop in Hell: answering it brought the card straight back, it had no close and ignored Escape,
 * and the bug report could not be opened over it.
 *
 * - An emergency offer is shown again every second while it waits (QuestsDialog.as onEmergencyTick
 *   335-360, G277). An offer whose accept fails (the quest already done, under way or gone) stayed
 *   waiting, so it came back forever. It is now dropped, and a done quest's stale offer never waits.
 * - The original emergency card has no close and ignores Escape (QuestConversationUI.as 154-155,
 *   escKeyHandler 410-414). Here Escape and an X dismiss it unanswered: it waits for another street
 *   (or a minute) before the Magic Rock shows it again, so no card can trap the player.
 * - The bug report button and panel sit above the card.
 *
 * The clock is faked, and so is Math.random: a fresh croak rolls a grave visit (1 in 3, 20-50 s
 * later; hell-tickets.js GRAVE_VISIT), and a visitor offers Beelzebooze again on purpose
 * (player.js recognizeDeath 1444-1445). Left to chance, that visit landed inside the snooze window
 * in about one run in seven and looked like the card coming straight back. The rolls here say no
 * visit, so each test sees only the snooze it checks.
 */
import { describe, it, before, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { loadContentCatalogsFromDir } from '../public/js/content-catalogs.js?v=10b118dd';
import { createQuestState } from '../public/js/quests.js?v=40c71a37';
import { markOffered, waitingOffers } from '../public/js/quest-offers.js?v=49eecffe';
import { questOffersFeature, EMERGENCY_SNOOZE_MS } from '../public/js/features/quest-offers-feature.js?v=63d89cd2';
import { hellTicketsFeature } from '../public/js/features/hell-tickets-feature.js?v=b052c8ec';
import { hellFeature } from '../public/js/features/hell-feature.js?v=7477c8c7';
import { HELL_LOCATION, createHellState, croak } from '../public/js/hell.js?v=23354bc4';

const root = join(import.meta.dirname, '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');
const HELL_ONE = HELL_LOCATION.tsid;
const UR = 'GLI2V0UN7RD1T2J';

/** A fake engine with one dialog at a time, like game.js (busy while it is up). */
function fakeEngine({ streetTsid = UR, hubId = '27' } = {}) {
  const log = { offers: [], prompts: [] };
  // Only Beelzebooze counts here (other emergencies a level may bring are not this test's).
  const beel = () => log.offers.filter((o) => o.title === 'Beelzebooze');
  let open = null;
  let dismissedAt = 0;
  const engine = {
    started: true,
    mode: 'multiplayer',
    pc: { level: 1, xp: 0, currants: 100, energy: 50, energyMax: 100, mood: 50, moodMax: 100 },
    inv: {},
    questState: createQuestState(),
    learnedSkills: [],
    unlockedAchievements: [],
    shrineState: { emblems: {} },
    streetTsid,
    street: { tsid: streetTsid, hubId, label: 'Somewhere', bounds: { l: 0, t: 0 } },
    player: { x: 300, y: 500 },
    interactables: [],
    log,
    beel,
    data: {},
    param: () => null,
    setData(k, v) { this.data[k] = v; },
    activeBuffIds: () => [],
    busy: () => Boolean(open),
    questDialogueOpen: () => Boolean(open),
    questDialogueDismissedAt: () => dismissedAt,
    questOffersHeld: () => hellFeature.isDead(),
    questCustomPrereq: () => false,
    streetCardUp: () => false,
    screenFxScreenUp: () => false,
    query: (k) => (k === 'isDead' ? hellFeature.isDead() : null),
    playSound() {}, save() {}, updateHud() {}, refreshPack() {}, snapCamera() {}, say() {},
    homeContext: () => ({ inHome: false }),
    transientInstance: () => false,
    inScene: () => false,
    toast() {}, pushActivity() {}, award() {},
    prompt: (p) => log.prompts.push(p),
    achievement: (c, n = 1) => questOffersFeature.onEvent(c, n, engine),
    offerQuestDialogue: (o) => { open = o; log.offers.push(o); },
    acceptOpenOffer() {},
    get open() { return open; },
    accept() { const o = open; open = null; o.onAccept(); },
    dismiss() { open = null; dismissedAt = Date.now(); },
  };
  return engine;
}

function run(engine, fromMs, toMs, step = 250) {
  for (let t = fromMs; t <= toMs; t += step) {
    questOffersFeature.onTick(step, t, engine);
    hellTicketsFeature.onTick(step, t, engine);
  }
}

describe('No quest card can trap the player (ticket 21)', () => {
  let realNow;
  let realRandom;
  let clock;
  before(async () => {
    await loadContentCatalogsFromDir(join(root, 'public/assets/content'));
  });
  beforeEach(() => {
    realNow = Date.now;
    clock = realNow();
    Date.now = () => clock;
    realRandom = Math.random;
    Math.random = () => 0.99; // no grave visit rolled (GRAVE_VISIT.chance is 1/3)
    hellTicketsFeature._reset();
    hellTicketsFeature.restore({});
    hellFeature.restore({});
  });
  afterEach(() => {
    Date.now = realNow;
    Math.random = realRandom;
  });
  const tick = (engine, ms) => {
    const from = clock;
    for (let t = from + 250; t <= from + ms; t += 250) {
      clock = t;
      questOffersFeature.onTick(250, t, engine);
      hellTicketsFeature.onTick(250, t, engine);
    }
  };

  it('a done quest\'s stale offer never waits, so it cannot come back', () => {
    const qs = createQuestState();
    markOffered(qs, 'hell_quest', 1);
    assert.deepEqual(waitingOffers(qs).map((r) => r.classTsid), ['hell_quest']);
    qs.completed.push('hell_quest');
    assert.deepEqual(waitingOffers(qs), [], 'not repeatable and done');
  });

  it('Beelzebooze answered once is answered: a failed accept drops the offer instead of showing it every second', () => {
    try {
      const engine = fakeEngine();
      questOffersFeature.init(engine);
      hellTicketsFeature.init(engine);
      // The state the loop needs: the offer waiting while the quest can no longer be accepted.
      markOffered(engine.questState, 'hell_quest', clock);
      questOffersFeature.onStreetEnter(engine.street, engine);
      tick(engine, 6000);
      assert.equal(engine.beel().length, 1, 'the waiting emergency shows');
      assert.equal(engine.log.offers[0].title, 'Beelzebooze');
      engine.questState.active.hell_quest = { classTsid: 'hell_quest', progress: {} }; // under way elsewhere meanwhile
      engine.accept();
      delete engine.questState.active.hell_quest;
      engine.questState.completed.push('hell_quest');
      tick(engine, 60_000);
      assert.equal(engine.beel().length, 1, 'never again');
      assert.equal(engine.questState.offers.offered.hell_quest, undefined);
    } finally {
      Date.now = realNow;
    }
  });

  it('Escape or the X dismisses an emergency: it waits for another street (or a minute), then comes back', () => {
    try {
      const engine = fakeEngine();
      questOffersFeature.init(engine);
      hellTicketsFeature.init(engine);
      markOffered(engine.questState, 'hell_quest', clock);
      questOffersFeature.onStreetEnter(engine.street, engine);
      tick(engine, 6000);
      assert.equal(engine.beel().length, 1);
      engine.dismiss();
      tick(engine, 30_000);
      assert.equal(engine.beel().length, 1, 'not on this street for a while');
      assert.equal(engine.data.questOfferResult, 'dismissed');
      engine.streetTsid = 'GLI32G3NUTD100I';
      engine.street = { ...engine.street, tsid: engine.streetTsid };
      questOffersFeature.onStreetEnter(engine.street, engine);
      tick(engine, 6000);
      assert.equal(engine.beel().length, 2, 'back on the next street');
      engine.accept();
      assert.ok(engine.questState.active.hell_quest);
      tick(engine, 10_000);
      assert.equal(engine.beel().length, 2);
    } finally {
      Date.now = realNow;
    }
  });

  it('the dead in Naraka: the Magic Rock\'s own Beelzebooze card snoozes too when dismissed', () => {
    try {
      const engine = fakeEngine({ streetTsid: HELL_ONE, hubId: '40' });
      hellTicketsFeature.init(engine);
      questOffersFeature.init(engine);
      engine.questState.completed.push('hell_hole');
      hellFeature.restore(croak(createHellState(), { streetTsid: UR, x: 100, y: 200, now: clock }).state);
      hellTicketsFeature.onStreetEnter(engine.street, engine);
      tick(engine, 3000);
      assert.equal(engine.log.offers.at(-1)?.title, 'Beelzebooze');
      assert.equal(engine.log.offers.at(-1).urgent, true);
      engine.dismiss();
      tick(engine, 30_000);
      assert.equal(engine.beel().length, 1, 'not straight back');
      tick(engine, 40_000);
      assert.equal(engine.beel().length, 2, 'after a minute');
      engine.accept();
      assert.ok(engine.questState.active.hell_quest);
      tick(engine, 60_000);
      assert.equal(engine.beel().length, 2);
    } finally {
      Date.now = realNow;
    }
  });

  it('game.js: Escape and the X dismiss an emergency card, and the bug report sits above it', () => {
    const game = read('public/game.js');
    assert.match(game, /if \(isQuestDialogueOpen\(\)\) \{\s*closeQuestDialogue\(\{ dismiss: true \}\);/);
    assert.match(game, /closeX\.hidden = !\['familiar', 'conversation'\]\.includes\(look\) \|\| \(!urgent &&/);
    assert.match(game, /questDialogueDismissedAt: \(\) => urgentDismissedAt/);
    const bug = read('public/js/features/bug-report-feature.js');
    assert.match(bug, /#bug-report-panel \{ position: absolute; inset: 0; z-index: calc\(var\(--z-modal\) \+ \d+\)/);
  });
});
