/**
 * Quest offer + progress engine (public/js/quest-offers.js) over the rebuilt
 * GSJS quest catalog (build-quests.mjs).
 */
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  loadContentCatalogsFromDir,
  resetContentCatalogs,
  getQuestCatalog,
  getContentMeta,
} from '../public/js/content-catalogs.js';
import {
  createQuestState,
  assignQuest,
  applyQuestProgress,
  completeQuest,
  applyRewards,
  applyQuestRewards,
  questRewardSummary,
  listQuestLog,
} from '../public/js/quests.js';
import {
  OFFER_INTERVAL_MS,
  COUNTER_ROUTES,
  classifyQuests,
  questOfferIndex,
  normalizeQuestOfferState,
  ensureQuestOfferState,
  questStatus,
  prerequisitesMet,
  pendingQuestOffers,
  nextQuestOffer,
  npcQuestOffers,
  markOffered,
  declineOffer,
  acceptOffer,
  listDeclinedOffers,
  routeQuestEvent,
  syncItemRequirements,
  eventCounters,
  requirementRoute,
  questRoutingReport,
  questEventsForVerb,
  turnInQuest,
  tickQuestTimers,
  restartTimedQuest,
  questTimerStatus,
} from '../public/js/quest-offers.js';
import { XP_FOR_LEVEL } from '../public/js/progression.js';

const CONTENT = join(dirname(fileURLToPath(import.meta.url)), '../public/assets/content');

before(async () => {
  resetContentCatalogs();
  await loadContentCatalogsFromDir(CONTENT);
});

const ids = (rows) => rows.map((row) => row.classTsid);
const freshPc = (extra = {}) => ({ energy: 50, mood: 50, imagination: 0, xp: 0, currants: 0, giantFavor: {}, ...extra });
/** XP for `level` plus a fraction of that level's span. */
function xpAt(level, fraction = 0.5) {
  const base = level <= 1 ? 0 : XP_FOR_LEVEL[level - 2];
  const next = XP_FOR_LEVEL[level - 1];
  return Math.floor(base + (next - base) * fraction);
}

describe('rebuilt quest catalog', () => {
  it('keeps meta counts in step and adds the previously unparsed quests', () => {
    const cat = getQuestCatalog();
    assert.equal(Object.keys(cat).length, getContentMeta().counts.quests.output);
    assert.equal(Object.keys(cat).length, 445);
    for (const id of ['le_miserable', 'orld_ugs_esara', 'build_a_tower', 'get_first_tool']) assert.ok(cat[id], id);
  });

  it('enriches make requirements with recipe ids, outputs and remake keys', () => {
    const req = getQuestCatalog().ezcooking_make_level1_recipes.requirements[0];
    assert.equal(req.name, 'r22');
    assert.equal(req.recipeKey, 'flour');
    assert.equal(req.tool, 'knife_and_board');
  });

  it('records offer flags, triggers, timers and provided items from the source', () => {
    const cat = getQuestCatalog();
    assert.deepEqual(cat.beer_guzzle.offerTriggers, [{ type: 'level', level: 6 }]);
    assert.equal(cat.buy_bag.isEmergency, true);
    assert.equal(cat.find_shiny_intrinsic_object.isRepeatable, true);
    assert.deepEqual(cat.mining_mine_in_time_period.timer, { buff: 'mining_mine_in_time_period', durationSec: 300 });
    assert.equal(cat.herbalism_harvest_shuck_and_plant_herbs.giveItems.length, 7);
    assert.deepEqual(cat.intermediateadmixing_make_powder.chainOffers, ['intermediateadmixing_make_more_powders']);
    assert.ok(cat.brain_freezer.requirements.every((r) => r.type === 'item' && r.remove));
  });
});

describe('classifyQuests', () => {
  it('splits 445 quests into solo, custom story, and excluded with reasons', () => {
    const c = classifyQuests();
    assert.equal(c.solo.length, 129);
    assert.equal(c.custom.length, 17);
    assert.equal(c.excluded.length, 299);
    assert.equal(c.byReason.job.length, 200);
    assert.equal(c.byReason.multiplayer.length, 11);
    assert.equal(c.byReason.instance_unbuilt.length, 32);
    assert.ok(c.byReason.needs_other_players.includes('kindly_randomness'));
    assert.ok(c.byReason.removed_feature.includes('say_cheese'));
    assert.ok(c.custom.some((row) => row.classTsid === 'phantom_glitch'));
    assert.equal(questOfferIndex().length, 129);
  });

  it('marks NPC-only quests whose giver the remake lacks as unreachable', () => {
    const { solo } = classifyQuests();
    const unreachable = solo.filter((row) => !row.reachable).map((row) => row.classTsid);
    assert.deepEqual(unreachable, ['purple_journey_north']);
  });
});

describe('pendingQuestOffers triggers', () => {
  it('offers a level-map quest 5% into the mapped level (quests_give_level_do)', () => {
    const state = createQuestState();
    const at = (xp) => ids(pendingQuestOffers(state, freshPc({ xp }), {})).includes('beer_guzzle');
    assert.equal(at(xpAt(5, 0.99)), false);
    assert.equal(at(xpAt(6, 0.01)), false);
    assert.equal(at(xpAt(6, 0.06)), true);
    assert.equal(at(xpAt(7, 0)), true);
  });

  it('offers skill-map quests on learning the skill and gates prereq chains', () => {
    const state = createQuestState();
    const pc = freshPc();
    let pending = ids(pendingQuestOffers(state, pc, { skills: ['ezcooking_1', 'ezcooking_2'], level: 3 }));
    // ezcooking_1 is a newxp tutorial; its prereq is satisfied by the skill (prereqProxy).
    assert.ok(pending.includes('ezcooking_make_level1_recipes'));
    assert.ok(!pending.includes('ezcooking_make_level2_recipes'));
    assert.equal(
      prerequisitesMet(getQuestCatalog().ezcooking_make_level2_recipes, state, pc, { skills: ['ezcooking_2'] }).missing.value,
      'ezcooking_make_level1_recipes'
    );
    assignQuest(state, 'ezcooking_make_level1_recipes', { ignorePrereq: true });
    completeQuest(state, 'ezcooking_make_level1_recipes', null);
    pending = ids(pendingQuestOffers(state, pc, { skills: ['ezcooking_1', 'ezcooking_2'], level: 3 }));
    assert.ok(pending.includes('ezcooking_make_level2_recipes'));
    assert.ok(!pending.includes('ezcooking_make_level1_recipes'));
  });

  it('checks the original prerequisites gate list (level, achievement, skills)', () => {
    const state = createQuestState();
    const pc = freshPc();
    const ok = (ctx) => ids(pendingQuestOffers(state, pc, ctx)).includes('batterfly_bounty');
    assert.equal(ok({ level: 17 }), false);
    assert.equal(ok({ level: 16, achievements: ['4star_cuisinartist'] }), false);
    assert.equal(ok({ level: 17, achievements: ['4star_cuisinartist'] }), true);
  });

  it('chains follow-ups queued by completion code ahead of other offers', () => {
    const state = createQuestState();
    const pc = freshPc();
    assignQuest(state, 'intermediateadmixing_make_powder', { ignorePrereq: true });
    routeQuestEvent(state, 'making_recipe:fertilidust_lite', 1);
    const done = turnInQuest(state, 'intermediateadmixing_make_powder', pc, {});
    assert.deepEqual(done.chained, ['intermediateadmixing_make_more_powders']);
    const pending = pendingQuestOffers(state, pc, { level: 10, skills: ['blending_1'] });
    assert.equal(pending.find((row) => !row.emergency).classTsid, 'intermediateadmixing_make_more_powders');
  });

  it('never offers custom story quests unless asked', () => {
    const state = createQuestState();
    const pending = ids(pendingQuestOffers(state, freshPc(), { level: 20, skills: ['teleportation_4'] }));
    assert.ok(!pending.includes('teleportation_rescue_pig'));
    const withCustom = ids(pendingQuestOffers(state, freshPc(), { level: 20, skills: ['teleportation_4'], includeCustom: true }));
    assert.ok(withCustom.includes('teleportation_rescue_pig'));
  });

  it('puts emergency quests first', () => {
    const state = createQuestState();
    const pending = pendingQuestOffers(state, freshPc(), { level: 6, skills: ['blending_1'] });
    assert.deepEqual(ids(pending.slice(0, 3)).sort(), ['buy_bag', 'send_mail', 'ultimate_smoothie_1']);
    assert.ok(pending.slice(0, 3).every((row) => row.emergency));
    assert.ok(pending.slice(3).length > 0 && pending.slice(3).every((row) => !row.emergency));
  });
});

describe('familiar delivery, decline and accept', () => {
  it('spaces offers five minutes apart; emergencies skip the wait', () => {
    const state = createQuestState();
    const pc = freshPc();
    // Level 2 + Alchemy: buy_bag is the only emergency (send_mail needs level 3).
    const ctx = { level: 2, skills: ['alchemy_1'], now: 1_000_000 };
    const first = nextQuestOffer(state, pc, ctx);
    assert.equal(first.classTsid, 'buy_bag');
    assert.ok(first.beats.length > 0);
    markOffered(state, first.classTsid, ctx.now);
    assert.equal(nextQuestOffer(state, pc, ctx), null, 'one offer at a time');
    acceptOffer(state, 'buy_bag', { now: ctx.now });
    const waiting = nextQuestOffer(state, pc, { ...ctx, now: ctx.now + 1000 });
    assert.ok(waiting.waiting > 0 && waiting.waiting <= OFFER_INTERVAL_MS);
    const later = nextQuestOffer(state, pc, { ...ctx, now: ctx.now + OFFER_INTERVAL_MS });
    assert.ok(later.classTsid && !later.waiting);
    assert.equal(nextQuestOffer(state, pc, { ...ctx, now: ctx.now + OFFER_INTERVAL_MS, buffs: ['turn_off_quests'] }), null);
  });

  it('declined familiar offers stay acceptable from the log and are never re-offered', () => {
    const state = createQuestState();
    const pc = freshPc();
    const ctx = { skills: ['blending_1'], level: 3, now: 5 };
    markOffered(state, 'blending_make_level1_recipes', 5);
    declineOffer(state, 'blending_make_level1_recipes', 6);
    assert.equal(questStatus(state, 'blending_make_level1_recipes'), 'declined');
    assert.ok(!ids(pendingQuestOffers(state, pc, ctx)).includes('blending_make_level1_recipes'));
    assert.deepEqual(ids(listDeclinedOffers(state)), ['blending_make_level1_recipes']);
    assert.ok(!state.active.blending_make_level1_recipes, 'declined is not active progress');
    const accepted = acceptOffer(state, 'blending_make_level1_recipes', { now: 7 });
    assert.equal(accepted.ok, true);
    assert.equal(questStatus(state, 'blending_make_level1_recipes'), 'active');
    assert.equal(listDeclinedOffers(state).length, 0);
  });

  it('declined NPC offers are asked again next talk (npc_conversation.js)', () => {
    const state = createQuestState();
    const talk = () => ids(npcQuestOffers(state, 'street_spirit_gardening', freshPc(), {}).offered);
    assert.ok(talk().includes('vendor_ping_pong_part1'));
    declineOffer(state, 'vendor_ping_pong_part1', 1, { source: 'npc' });
    assert.ok(talk().includes('vendor_ping_pong_part1'));
    assert.ok(!ids(npcQuestOffers(state, 'street_spirit_groceries', freshPc(), {}).offered).includes('vendor_ping_pong_part1'));
  });

  it('accept gives provided items, pre-fills held items and starts quest timers', () => {
    const state = createQuestState();
    const inv = { sno_cone_blue: 1, sno_cone_red: 2 };
    acceptOffer(state, 'brain_freezer', { inv });
    assert.equal(state.active.brain_freezer.progress.r90, 1);
    assert.equal(state.active.brain_freezer.progress.r93, 1);
    const herbInv = {};
    const herbs = acceptOffer(state, 'herbalism_harvest_shuck_and_plant_herbs', { inv: herbInv });
    assert.equal(herbs.given.length, 7);
    assert.equal(herbInv.silvertongue, 1);
    const flagged = acceptOffer(state, 'purple_journey_north', { inv: { purple_flower: 1 } });
    assert.equal(flagged.quest.progress.acquired_purple_flower, 1);
    acceptOffer(state, 'mining_mine_in_time_period', { now: 1000 });
    assert.deepEqual(questTimerStatus(state, 'mining_mine_in_time_period', 2000), {
      failed: false, remainingMs: 299_000, endsAt: 301_000,
    });
  });

  it('a quest with nothing left to do is completable right after accept', () => {
    const state = createQuestState();
    const r = acceptOffer(state, 'vendor_ping_pong_part1', {});
    assert.deepEqual(ids(r.completable), ['vendor_ping_pong_part1']);
    assert.equal(r.completable[0].turnIn, 'npc');
    const talk = npcQuestOffers(state, 'street_spirit_gardening', freshPc(), {});
    assert.deepEqual(ids(talk.completable), ['vendor_ping_pong_part1']);
  });

  it('repeatable quests are offered again after completion', () => {
    const state = createQuestState();
    state.completed.push('de_embiggenify_part2');
    const pc = freshPc();
    assert.ok(ids(pendingQuestOffers(state, pc, {})).includes('find_shiny_intrinsic_object'));
    const inv = { small_worthless: 3 };
    acceptOffer(state, 'find_shiny_intrinsic_object', { inv });
    routeQuestEvent(state, 'very_stinky_cheese:poke', 3, { inv });
    assert.equal(turnInQuest(state, 'find_shiny_intrinsic_object', pc, { inv }).ok, true);
    assert.equal(inv.small_worthless, 0);
    assert.ok(ids(pendingQuestOffers(state, pc, {})).includes('find_shiny_intrinsic_object'));
    assert.equal(acceptOffer(state, 'find_shiny_intrinsic_object', {}).reason, 'repeat');
    assert.equal(ensureQuestOfferState(state).repeats.find_shiny_intrinsic_object, 1);
  });
});

describe('routeQuestEvent', () => {
  it('advances counters from achievement-style events and legacy aliases', () => {
    const state = createQuestState();
    acceptOffer(state, 'animalkinship_pet_piggies', {});
    routeQuestEvent(state, 'npc_piggy:pet', 1);
    routeQuestEvent(state, 'pet_piggy', 1);
    assert.equal(state.active.animalkinship_pet_piggies.progress.piggies_petted, 2);
    const r = routeQuestEvent(state, 'npc_piggy:pet', 4);
    assert.deepEqual(ids(r.completable), ['animalkinship_pet_piggies']);
    assert.equal(r.completable[0].turnIn, 'familiar');
    assert.equal(routeQuestEvent(state, 'npc_piggy:pet', 1).completable.length, 0, 'only newly completable');
  });

  it('sets VERB flags and counts make requirements by recipe key or id', () => {
    const state = createQuestState();
    acceptOffer(state, 'cocktailcrafting_make_level2_recipes', {});
    routeQuestEvent(state, 'making_recipe:cloudberry_daiquiri', 1);
    routeQuestEvent(state, 'cloudberry_daiquiri:drink', 1);
    routeQuestEvent(state, 'make:68', 1); // recipe id of the Cosma-politan
    const r = routeQuestEvent(state, 'cosmapolitan:drink', 1);
    assert.deepEqual(ids(r.completable), ['cocktailcrafting_make_level2_recipes']);
  });

  it('counts distinct labels once and honours one-shot thresholds', () => {
    const state = createQuestState();
    acceptOffer(state, 'betterlearning_donate_to_shrines', {});
    for (const giant of ['spriggan', 'spriggan', 'ti', 'lem']) routeQuestEvent(state, `shrines_donated:${giant}`, 1);
    assert.equal(state.active.betterlearning_donate_to_shrines.progress.donate_giants, 3);
    acceptOffer(state, 'smelting_smelt_metal_rock_to_plain_metal', {});
    routeQuestEvent(state, 'metal_smelted', 60);
    assert.equal(state.active.smelting_smelt_metal_rock_to_plain_metal.progress['100_metal_smelted'], 0);
    routeQuestEvent(state, 'metal_smelted', 100);
    assert.equal(state.active.smelting_smelt_metal_rock_to_plain_metal.progress['100_metal_smelted'], 1);
  });

  it('routes work events to job requirements by tool', () => {
    const state = createQuestState();
    assignQuest(state, 'job_cult_barnacle_pod', { ignorePrereq: true });
    routeQuestEvent(state, 'work:hatchet', 5);
    assert.equal(state.active.job_cult_barnacle_pod.progress.r1532, 5);
  });

  it('does not advance declined or failed quests', () => {
    const state = createQuestState();
    markOffered(state, 'beer_guzzle', 1);
    declineOffer(state, 'beer_guzzle', 2);
    assert.equal(routeQuestEvent(state, 'beer:drink', 1).advanced.length, 0);
    acceptOffer(state, 'mining_mine_in_time_period', { now: 0 });
    tickQuestTimers(state, 301_000);
    assert.equal(routeQuestEvent(state, 'rock_beryl_1:mine', 1).advanced.length, 0);
  });

  it('autoTurnIn completes and rewards in one call', () => {
    const state = createQuestState();
    const pc = freshPc();
    acceptOffer(state, 'beer_guzzle', {});
    const r = routeQuestEvent(state, 'beer:drink', 12, { autoTurnIn: true, pc });
    assert.equal(r.completed[0].ok, true);
    assert.ok(state.completed.includes('beer_guzzle'));
    assert.equal(pc.currants, 600);
  });
});

describe('syncItemRequirements', () => {
  it('tracks pack counts both ways and consumes remove:true items on turn-in', () => {
    const state = createQuestState();
    const pc = freshPc();
    const inv = {};
    acceptOffer(state, 'brain_freezer', { inv });
    inv.sno_cone_blue = 1;
    inv.sno_cone_green = 1;
    assert.equal(syncItemRequirements(state, inv).advanced.length, 2);
    inv.sno_cone_green = 0;
    syncItemRequirements(state, inv);
    assert.equal(state.active.brain_freezer.progress.r91, 0);
    Object.assign(inv, { sno_cone_green: 1, sno_cone_orange: 1, sno_cone_red: 1, sno_cone_purple: 2 });
    assert.deepEqual(ids(syncItemRequirements(state, inv).completable), ['brain_freezer']);
    assert.equal(turnInQuest(state, 'brain_freezer', pc, { inv: { sno_cone_blue: 0 } }).reason, 'incomplete');
    const done = turnInQuest(state, 'brain_freezer', pc, { inv });
    assert.equal(done.ok, true);
    assert.equal(inv.sno_cone_purple, 1);
    assert.equal(inv.sno_cone_blue, 0);
    assert.equal(done.removed.length, 5);
  });

  it('keeps items for requirements without remove', () => {
    const state = createQuestState();
    const inv = { bag_elemental_pouch: 1 };
    const accepted = acceptOffer(state, 'elementhandling_buy_elemental_pouch', { inv });
    assert.equal(accepted.completable.length, 1);
    turnInQuest(state, 'elementhandling_buy_elemental_pouch', freshPc(), { inv });
    assert.equal(inv.bag_elemental_pouch, 1);
    assert.equal(inv.element_red, 100);
  });
});

describe('quest rewards', () => {
  it('grants per-Giant favor, items and recipes and builds award copy', () => {
    const state = createQuestState();
    const pc = freshPc();
    const inv = {};
    const learned = [];
    acceptOffer(state, 'elementhandling_buy_elemental_pouch', {});
    inv.bag_elemental_pouch = 1;
    const done = turnInQuest(state, 'elementhandling_buy_elemental_pouch', pc, {
      inv,
      addItem: (bag, id, n) => { bag[id] = (bag[id] || 0) + n; },
    });
    assert.equal(pc.giantFavor.ti, 10);
    assert.equal(pc.imagination, 125);
    assert.equal(inv.element_blue, 100);
    assert.equal(done.rewards.subtitle, '+125 iMG · +75 currants · +25 mood · +10 Ti favor · 100× Red Element · 100× Green Element · 100× Blue Element');
    assert.equal(done.award.kind, 'quest');
    assert.ok(done.award.steps.length >= 1);
    assert.equal(done.award.steps.at(-1).response, '');

    const summary = applyQuestRewards(freshPc(), getQuestCatalog().ezcooking_make_level1_recipes.rewards, {
      learnRecipe: (id) => learned.push(id),
    });
    assert.deepEqual(learned, ['berry_bowl', 'lotsa_lox']);
    assert.ok(summary.lines.includes('Recipe: Berry Bowl'));
  });

  it('keeps applyRewards behaviour and scales previews by the reward multiplier', () => {
    const pc = freshPc({ rewardMultiplier: 1.2 });
    applyRewards(pc, getQuestCatalog().alchemy_make_compounds.rewards);
    assert.equal(pc.imagination, 240);
    assert.equal(pc.giantFavor.ti, 24);
    assert.equal(pc.rewardBuffConsumed, true);
    assert.equal(questRewardSummary({ xp: 100, favor: { giant: 'lem', points: 10 } }, { multiplier: 1.2 }).subtitle, '+120 iMG · +12 Lem favor');
  });
});

describe('timed quests', () => {
  it('fail on timer expiry, reset progress and restart with a fresh timer', () => {
    const state = createQuestState();
    acceptOffer(state, 'mining_mine_in_time_period', { now: 0 });
    routeQuestEvent(state, 'rock_dullite_1:mine', 4);
    assert.equal(state.active.mining_mine_in_time_period.progress.mining, 4);
    assert.deepEqual(tickQuestTimers(state, 299_000), []);
    assert.deepEqual(tickQuestTimers(state, 300_000), ['mining_mine_in_time_period']);
    assert.equal(questStatus(state, 'mining_mine_in_time_period'), 'failed');
    assert.equal(state.active.mining_mine_in_time_period.progress.mining, 0);
    restartTimedQuest(state, 'mining_mine_in_time_period', 400_000);
    assert.equal(questStatus(state, 'mining_mine_in_time_period'), 'active');
    routeQuestEvent(state, 'rock_dullite_1:mine', 15);
    assert.deepEqual(tickQuestTimers(state, 800_000), [], 'complete quests do not fail');
  });
});

describe('offer state persistence', () => {
  it('normalizes hostile snapshots and survives a JSON round trip', () => {
    const clean = normalizeQuestOfferState({
      offered: { beer_guzzle: '12', 'bad id!': 3 },
      declined: { blending_make_level1_recipes: -5 },
      queue: ['a', 'a', '', null, 'b'],
      lastOfferAt: 'nope',
      timers: { mining_mine_in_time_period: { startedAt: 10, endsAt: 5 }, x: 'junk' },
      distinct: { q: { donate_giants: ['ti', 'ti', 4, 'lem'] }, z: 'junk' },
      repeats: { find_shiny_intrinsic_object: 2.7 },
    });
    assert.deepEqual(clean.offered, { beer_guzzle: 12, badid: 3 });
    assert.deepEqual(clean.declined, { blending_make_level1_recipes: 0 });
    assert.deepEqual(clean.queue, ['a', 'b']);
    assert.equal(clean.lastOfferAt, 0);
    assert.deepEqual(clean.timers, { mining_mine_in_time_period: { startedAt: 10, endsAt: 10 } });
    assert.deepEqual(clean.distinct, { q: { donate_giants: ['ti', '4', 'lem'] } });
    assert.equal(clean.repeats.find_shiny_intrinsic_object, 2);
    assert.deepEqual(normalizeQuestOfferState(JSON.parse(JSON.stringify(clean))), clean);
    assert.deepEqual(normalizeQuestOfferState(null).queue, []);
  });

  it('adds offers lazily without disturbing the legacy quest state shape', () => {
    const state = createQuestState();
    assignQuest(state, 'animalkinship_pet_piggies', { ignorePrereq: true });
    applyQuestProgress(state, 'pet_piggy', 1);
    ensureQuestOfferState(state);
    assert.deepEqual(Object.keys(state).sort(), ['active', 'completed', 'offers', 'story']);
    assert.equal(listQuestLog(state).length, 1);
  });
});

describe('routing table', () => {
  it('every fixed route round-trips event → counter', () => {
    for (const route of COUNTER_ROUTES) {
      if (/[{<]/.test(route.event) || /[{<]/.test(route.counter)) continue;
      assert.ok(eventCounters(route.event).some((row) => row.counter === route.counter), route.counter);
    }
  });

  it('routes every requirement of every solo quest', () => {
    const cat = getQuestCatalog();
    for (const row of classifyQuests().solo) {
      for (const req of cat[row.classTsid].requirements) {
        assert.notEqual(requirementRoute(req).system, 'unrouted', `${row.classTsid} ${req.name}`);
      }
    }
  });

  it('reports which systems still need to emit events', () => {
    const report = questRoutingReport();
    assert.ok(report.unemitted.making.some((row) => row.event === 'making_recipe:flour'));
    assert.ok(report.unemitted.garden.length > 0);
    assert.ok(!report.unemitted.animals, 'animal verbs are emitted today');
    const shrine = Object.values(report.bySystem.shrines).find((row) => row.requirement === 'counter:shrine_donated_ti');
    assert.equal(shrine.emitted, true);
  });

  it('turns a world verb into deduplicated quest events', () => {
    assert.deepEqual(
      questEventsForVerb('npc_piggy', 'pet', [{ counter: 'npc_piggy:pet', amount: 1 }]),
      [{ event: 'npc_piggy:pet', amount: 1 }]
    );
    assert.deepEqual(
      questEventsForVerb('trant_bean', 'harvest', [
        { counter: 'trants_harvested:trant_bean', amount: 1 },
        { counter: 'trants_fruit_harvested:bean_plain', amount: 6 },
      ]).map((row) => row.event),
      ['trants_harvested:trant_bean', 'trant_bean:harvest']
    );
    assert.deepEqual(questEventsForVerb('wood_tree', 'water').map((row) => row.event), ['wood_tree:water', 'trants_watered:wood_tree']);
  });
});

describe('ships quest-offers as a browser module', () => {
  it('has no Node-only imports', () => {
    const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../public/js/quest-offers.js'), 'utf8');
    assert.doesNotMatch(src, /from 'node:/);
  });
});
