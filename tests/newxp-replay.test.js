/**
 * Back to Gentle Island (ours, Austin 2026-11-28): a player who skipped the tutorial is offered a
 * quest that sends them back to Gentle Island to play it, once. Finishing gives only what they never
 * got; Leave puts them back where they were and the quest back in the log with Try it.
 * Glitch had no such quest: skipping was a testing flag (players/player.js onCreate 1193-1218), and a
 * player back on the island after finishing only heard newxpReturnToGentleIsland (inc_newxp.js 83-86).
 * Run: node --test tests/newxp-replay.test.js
 */
import { describe, it, before, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';

import { ISLAND_ARRIVAL, normalizeNewxpSave } from '../public/js/newxp.js?v=eedf8fe3';
import { __newxpTest, newxpFeature } from '../public/js/features/newxp-feature.js?v=baebe4da';
import { createFeatureHost } from '../public/js/feature-host.js?v=100f3193';
import { FEATURES } from '../public/js/features/index.js?v=af3c821e';
import { getQuestCatalog, loadContentCatalogsFromDir } from '../public/js/content-catalogs.js?v=b0f96eae';
import { QUEST_MOVES_NOTE, acceptOffer, ensureQuestOfferState, listDeclinedOffers, pendingQuestOffers, questOfferCard, routeQuestEvent, turnInQuest } from '../public/js/quest-offers.js?v=dfecc1b4';
import { addItem, countItem, removeItem } from '../public/js/inventory.js?v=3be7988a';
import { createQuestState } from '../public/js/quests.js?v=4c8f3a10';
import {
  REPLAY_DONE_COUNTER,
  REPLAY_GATE,
  REPLAY_QUEST,
  REPLAY_QUEST_ID,
  REPLAY_TEXT,
  replayEligible,
  replayGrants,
  replayOwnedCards,
  replayStage,
} from '../public/js/newxp-replay.js?v=9acaab3e';

const root = join(import.meta.dirname, '..');
const HECHEY = 'GLI2V0UN7RD1T2J';
const host = createFeatureHost(FEATURES);

/** A solo save that skipped at the start card: the demo kit (bags, cards, starter skills). */
function stubEngine(extra = {}) {
  const questState = createQuestState();
  ensureQuestOfferState(questState);
  const engine = {
    started: true,
    mode: 'solo',
    data: {},
    activity: [],
    toasts: [],
    awards: [],
    entered: [],
    counters: [],
    inv: { bag_bigger: 2, bag_toolbox_red: 1 },
    pc: { level: 5, xp: 5000, currants: 200, energy: 80, mood: 70, imaginationUpgrades: ['walk_speed_1', 'walk_speed_2', 'jump_1', 'jump_2', 'mappery', 'camera_mode', 'zoomability', 'encyclopeddling', 'skill_learning', 'triple_jump'] },
    learnedSkills: ['animalkinship_1', 'ezcooking_1', 'cheffery_1'],
    questState,
    streetTsid: HECHEY,
    street: { label: 'Hechey Track' },
    player: { x: 1234.4, y: 567.6 },
    param: () => null,
    setData(k, v) { this.data[k] = v; },
    inScene: () => false,
    transientInstance: () => false,
    heldInstance: () => null,
    homeContext: () => ({ inHome: false }),
    homeOwned: () => true,
    streetExists: () => true,
    busy: () => false,
    save() {},
    refreshPack() {},
    updateHud() {},
    playSound() {},
    stopFollowing() {},
    closeMap() {},
    toast(line) { this.toasts.push(line); },
    pushActivity(line) { this.activity.push(line); },
    async award(payload) { this.awards.push(payload); },
    achievement(counter, n) { this.counters.push([counter, n]); },
    // The island arrival never resolves here, so the stage stops at its first step (no timers left).
    enter(tsid, opts) {
      this.entered.push({ tsid, ...opts });
      return tsid === ISLAND_ARRIVAL.tsid ? new Promise(() => {}) : Promise.resolve(true);
    },
    query: () => null,
    ...extra,
  };
  newxpFeature.init(engine);
  return engine;
}

/** The offer engine's ctx, its custom_code gate answered as quest-instances-feature asks the features. */
const offerCtx = (engine) => ({
  level: engine.pc.level,
  xp: engine.pc.xp,
  skills: engine.learnedSkills,
  inv: engine.inv,
  countItem,
  addItem,
  removeItem,
  customPrereq: (id, p) => host.query('questCustomGate', p?.value, id, engine) === true,
});
const offered = (engine) => pendingQuestOffers(engine.questState, engine.pc, offerCtx(engine)).some((r) => r.classTsid === REPLAY_QUEST_ID);

/** Accept the quest as quest-offers-feature acceptCard does: questStartGate, then acceptOffer on go. */
function take(engine) {
  const out = { refused: '' };
  newxpFeature.questStartGate(REPLAY_QUEST_ID, {
    go: () => acceptOffer(engine.questState, REPLAY_QUEST_ID, offerCtx(engine)),
    refuse: (msg) => { out.refused = msg; },
  }, engine);
  return out;
}

describe('Back to Gentle Island (a skipped tutorial played later, once)', () => {
  before(async () => {
    await loadContentCatalogsFromDir(join(root, 'public/assets/content'));
  });
  beforeEach(() => {
    __newxpTest.save = normalizeNewxpSave({ status: 'skipped', stage: 'clouds' });
    __newxpTest.resetLeave();
  });
  afterEach(() => {
    // Ends any stage left running (the token moves on).
    __newxpTest.save = normalizeNewxpSave({ status: 'off' });
  });

  it('is our own quest in the catalog: startable, not repeatable, no reward of its own, plain words', () => {
    const def = getQuestCatalog()[REPLAY_QUEST_ID];
    assert.ok(def, 'in the catalog beside Tiny Speck\'s');
    assert.equal(def.ours, true);
    assert.equal(def.solo, true);
    assert.equal(def.needsStart, true, 'Not right now and Try it (G229)');
    assert.equal(def.isRepeatable, false);
    assert.equal(def.custom, undefined, 'the familiar offers it (custom quests are left out)');
    assert.deepEqual(def.rewards, {});
    assert.deepEqual(def.prerequisites, [{ condition: 'custom_code', value: REPLAY_GATE }]);
    assert.equal(questOfferCard(REPLAY_QUEST_ID).moveNote, QUEST_MOVES_NOTE, 'the card says accepting moves you');
    assert.equal(questOfferCard(REPLAY_QUEST_ID).startable, true);
    for (const text of [REPLAY_QUEST.title, REPLAY_QUEST.desc, REPLAY_QUEST.offer, REPLAY_QUEST.completion, ...Object.values(REPLAY_TEXT)]) {
      assert.doesNotMatch(text, /—/, text);
    }
  });

  it('a skipper is offered it; a finisher, a player in the tutorial and a save that never started are not', () => {
    const engine = stubEngine();
    assert.equal(offered(engine), true, 'skipped');
    for (const status of ['done', 'active', 'off']) {
      __newxpTest.save = normalizeNewxpSave({ status, stage: status === 'done' ? 'done' : 'island' });
      assert.equal(offered(engine), false, status);
      assert.equal(host.query('questCustomGate', REPLAY_GATE, REPLAY_QUEST_ID, engine), false, status);
    }
    assert.equal(host.query('questCustomGate', 'something_else', REPLAY_QUEST_ID, engine), null, 'other gates are not ours');
  });

  it('taking it sends a skipper to Gentle Island\'s first step, with the tutorial\'s holds in force', () => {
    const engine = stubEngine();
    const res = take(engine);
    assert.equal(res.refused, '');
    assert.ok(engine.questState.active[REPLAY_QUEST_ID], 'in the log, started');
    const save = __newxpTest.save;
    assert.equal(save.status, 'active');
    assert.equal(save.stage, 'island');
    assert.equal(save.island, 'arrive');
    assert.deepEqual(save.replay.from, { tsid: HECHEY, x: 1234, y: 568 }, 'where Leave puts them back');
    assert.equal(save.replay.was, 'skipped');
    assert.deepEqual(engine.entered.at(-1), { tsid: ISLAND_ARRIVAL.tsid, spawnX: ISLAND_ARRIVAL.x, spawnY: ISLAND_ARRIVAL.y, quiet: true, bypassFeatureGates: true });
    // The island deals only cards the player lacks: this save owns them all.
    assert.deepEqual(new Set(save.upgrades), new Set(replayOwnedCards(engine.pc.imaginationUpgrades)));
    assert.ok(!save.upgrades.includes('triple_jump'), 'only tutorial cards');
    // Today's holds: no quest offers, no trip home before the island's go-home step.
    assert.equal(newxpFeature.holdQuestOffers(engine), true);
    assert.equal(newxpFeature.homeTripGate().ok, false);
    assert.equal(offered(engine), false, 'never offered while it runs');
  });

  it('a skipper who knows no first skill starts at the Magic Rock\'s pick; nothing is taken from home or a private place', () => {
    assert.equal(replayStage(['animalkinship_1']), 'island');
    assert.equal(replayStage(['light_green_thumb_1']), 'island');
    assert.equal(replayStage([]), 'house');
    const home = stubEngine({ homeContext: () => ({ inHome: true }) });
    const res = take(home);
    assert.equal(res.refused, REPLAY_TEXT.notHere);
    assert.equal(home.questState.active[REPLAY_QUEST_ID], undefined);
    assert.equal(__newxpTest.save.status, 'skipped');
    const room = stubEngine({ transientInstance: () => true });
    assert.equal(take(room).refused, REPLAY_TEXT.notHere);
  });

  it('Leave puts them back where they were, the quest back in the log with Try it, and it can be taken again', async () => {
    const engine = stubEngine();
    take(engine);
    acceptOffer(engine.questState, 'leave_gentle_island', offerCtx(engine));
    assert.equal(await __newxpTest.leaveReplay(engine), true);
    const save = __newxpTest.save;
    assert.equal(save.status, 'skipped');
    assert.equal(save.replay, null);
    assert.equal(engine.questState.active[REPLAY_QUEST_ID], undefined);
    assert.ok(listDeclinedOffers(engine.questState).some((r) => r.classTsid === REPLAY_QUEST_ID), 'put off: Try it in the log');
    assert.equal(engine.questState.active.leave_gentle_island, undefined, 'On to the Big Time waits for the rock again');
    assert.deepEqual(engine.entered.at(-1), { tsid: HECHEY, spawnX: 1234, spawnY: 568, quiet: true, bypassFeatureGates: true });
    assert.ok(engine.toasts.includes(REPLAY_TEXT.left));
    assert.equal(host.query('questCustomGate', REPLAY_GATE, REPLAY_QUEST_ID, engine), true, 'still to do');
    // Try it again: the try starts over from the island's first step.
    take(engine);
    assert.ok(engine.questState.active[REPLAY_QUEST_ID]);
    assert.equal(__newxpTest.save.status, 'active');
  });

  it('gives only what was never got: no doubled bags, twig, home or rewards', () => {
    // A demo-kit skipper: bags held, a home, no twig, the bag quest and On to the Big Time never done.
    assert.deepEqual(replayGrants({ bags: 2, homeOwned: true }), { bagQuest: 'given_finished', islandCurrants: false, home: false, leaveRewards: true, twig: true });
    // A skipper who started from zero: no bags, no home; the rock's 978 currants once only.
    assert.deepEqual(replayGrants({ bags: 0 }), { bagQuest: 'run', islandCurrants: true, home: true, leaveRewards: true, twig: true });
    assert.equal(replayGrants({ bags: 1, currantsPaid: true }).islandCurrants, false);
    // A twig already held; On to the Big Time already done (left after accepting it, then skipped).
    assert.equal(replayGrants({ bags: 3, twigs: 1 }).twig, false);
    assert.deepEqual(replayGrants({ bags: 3, bagQuestDone: true, leaveDone: true }), { bagQuest: 'done', islandCurrants: false, home: true, leaveRewards: false, twig: false });

    const engine = stubEngine();
    take(engine);
    addItem(engine.inv, 'greeter_twig', 1);
    assert.deepEqual(__newxpTest.replayPlan(engine), { bagQuest: 'given_finished', islandCurrants: false, home: false, leaveRewards: true, twig: false });
  });

  it('finishing pays On to the Big Time once, no second twig, and completes the quest once', async () => {
    const engine = stubEngine();
    take(engine);
    addItem(engine.inv, 'greeter_twig', 1);
    const before = engine.pc.currants;
    await __newxpTest.finishLeaveQuest(engine);
    assert.equal(engine.pc.currants, before + 500, 'On to the Big Time (never done before) pays its 500');
    assert.equal(countItem(engine.inv, 'greeter_twig'), 1, 'no second twig');
    const save = __newxpTest.save;
    assert.equal(save.status, 'done');
    assert.equal(save.replay, null);
    assert.deepEqual(engine.counters.at(-1), [REPLAY_DONE_COUNTER, 1]);
    // The flag turns the quest in (quest-offers-feature onEvent -> routeQuestEvent -> finish).
    const routed = routeQuestEvent(engine.questState, REPLAY_DONE_COUNTER, 1, offerCtx(engine));
    assert.ok(routed.completable.some((r) => r.classTsid === REPLAY_QUEST_ID));
    assert.equal(turnInQuest(engine.questState, REPLAY_QUEST_ID, engine.pc, offerCtx(engine)).ok, true);
    // Once: never offered again, can't be taken again, a second finish pays nothing.
    assert.equal(replayEligible(save, engine.questState), false);
    assert.equal(offered(engine), false);
    assert.equal(acceptOffer(engine.questState, REPLAY_QUEST_ID, offerCtx(engine)).reason, 'already_completed');
    assert.equal(take(engine).refused, REPLAY_TEXT.notHere);
    // Even a save edited back to skipped: the completed quest stops the offer.
    __newxpTest.save = normalizeNewxpSave({ status: 'skipped' });
    assert.equal(offered(engine), false);
  });

  it('a quest left in the log with no try under way goes back to Try it on load', () => {
    const engine = stubEngine();
    acceptOffer(engine.questState, REPLAY_QUEST_ID, offerCtx(engine));
    assert.equal(__newxpTest.reconcileReplay(engine), true);
    assert.equal(engine.questState.active[REPLAY_QUEST_ID], undefined);
    assert.ok(listDeclinedOffers(engine.questState).some((r) => r.classTsid === REPLAY_QUEST_ID));
  });

  it('the save keeps a try under way across a reload, and drops junk', () => {
    const kept = normalizeNewxpSave({ status: 'active', stage: 'island', replay: { was: 'skipped', from: { tsid: HECHEY, x: 10, y: 20 }, at: 5 } });
    assert.deepEqual(kept.replay, { was: 'skipped', from: { tsid: HECHEY, x: 10, y: 20 }, at: 5 });
    assert.equal(normalizeNewxpSave({}).replay, null);
    assert.deepEqual(normalizeNewxpSave({ replay: { was: 'done', from: { tsid: 5 } } }).replay, { was: 'skipped', from: null, at: 0 });
  });
});

it('Back to Gentle Island is offered before the other waiting offers (review rtutq: 16 offers ahead)', async () => {
  const { pendingQuestOffers } = await import('../public/js/quest-offers.js?v=dfecc1b4');
  const { REPLAY_QUEST } = await import('../public/js/newxp-replay.js?v=9acaab3e');
  assert.equal(REPLAY_QUEST.offerFirst, true);
  const src = (await import('node:fs')).readFileSync(new URL('../public/js/quest-offers.js', import.meta.url), 'utf8');
  assert.match(src, /Number\(b\.emergency\) - Number\(a\.emergency\) \|\|\n\s*Number\(!!b\.def\.offerFirst\) - Number\(!!a\.def\.offerFirst\)/);
  assert.equal(typeof pendingQuestOffers, 'function');
});
