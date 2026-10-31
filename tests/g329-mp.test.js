/**
 * Register G329: the quests that need other players, offered and completed
 * between real players in multiplayer (js/quests-mp.js,
 * features/quests-mp-feature.js, the multiplayer path in js/quest-offers.js
 * and features/quest-offers-feature.js), the ledger's credits for them
 * (tools/build-economy.mjs), and that solo is untouched.
 */
import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';
import { join } from 'node:path';

import { loadContentCatalogsFromDir, getQuestCatalog } from '../public/js/content-catalogs.js?v=10b118dd';
import { createQuestState } from '../public/js/quests.js?v=282e1621';
import {
  acceptOffer,
  classifyQuests,
  ensureQuestOfferState,
  pendingQuestOffers,
  routeQuestEvent,
} from '../public/js/quest-offers.js?v=dbfa83c4';
import {
  MP_FACTS,
  MP_RACE_QUESTS,
  MULTIPLAYER_QUESTS,
  MULTIPLAYER_QUESTS_LEFT_OUT,
  creditedMultiplayerQuests,
  giveCounters,
  isRaceStreet,
  normalizeQuestsMpSlice,
  offerableMultiplayerQuest,
  tradeHoochCount,
} from '../public/js/quests-mp.js?v=2beb658a';
import { questOffersFeature } from '../public/js/features/quest-offers-feature.js?v=863bf36d';
import { questsMpFeature } from '../public/js/features/quests-mp-feature.js?v=f648839e';
import { economyCredits } from '../tools/build-economy.mjs';
import { tradeTable } from '../tools/build-realtime-trade.mjs';

const PUBLIC = join(import.meta.dirname, '../public');

before(async () => {
  await loadContentCatalogsFromDir(join(PUBLIC, 'assets/content'));
});

const MP = (over = {}) => ({ multiplayer: true, mpFacts: {}, mpReady: {}, level: 20, skills: [], ...over });
const offered = (qs, ctx) => pendingQuestOffers(qs, null, ctx).map((r) => r.classTsid);

function fakeClient(me = 1) {
  const listeners = new Map();
  return {
    me: { id: me, name: 'Ada' },
    on(type, fn) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(fn); return () => listeners.get(type).delete(fn); },
    msg(m) { for (const fn of listeners.get(`msg:${m.t}`) || []) fn(m); },
    send() { return true; },
  };
}

/**
 * game.js's engine as far as the two quest features go: engine.achievement
 * reaches every feature's onEvent (feature-host event), engine.query asks the
 * features, as feature-host does.
 */
function fakeEngine({ mode = 'multiplayer', client = fakeClient(), visiting = null, giveReady = false } = {}) {
  const calls = { activity: [], awards: [], achievements: [] };
  const data = {};
  const engine = {
    mode,
    started: true,
    inv: {},
    pc: { xp: 0, level: 20, currants: 0, mood: 10, energy: 10, giantFavor: {} },
    questState: createQuestState(),
    learnedSkills: [],
    unlockedAchievements: [],
    streetTsid: 'LA5101HF7F429V',
    street: { label: 'Somewhere', hubId: '' },
    inScene: () => false,
    activeBuffIds: () => [],
    query(name, ...args) {
      if (name === 'realtimeClient') return mode === 'multiplayer' ? client : null;
      if (name === 'neighboursVisiting') return visiting;
      if (name === 'playerGiveReady') return giveReady ? true : null;
      if (name === 'questsMpContext') return questsMpFeature.questsMpContext(...args);
      return null;
    },
    achievement(counter, amount = 1, detail) {
      calls.achievements.push([counter, amount]);
      questOffersFeature.onEvent(counter, amount, engine);
      questsMpFeature.onEvent(counter, amount, engine, detail);
    },
    award: (a) => calls.awards.push(a),
    pushActivity: (t) => calls.activity.push(t),
    playSound() {}, refreshPack() {}, updateHud() {}, save() {}, toast() {},
    setData: (k, v) => { data[k] = v; },
    param: () => null,
    busy: () => true,
  };
  return { engine, calls, data, client };
}

/** A fresh session per test (the feature keeps one per page, like neighbours-mp). */
let n = 0;
async function freshFeature() {
  n += 1;
  const mod = await import(`../public/js/features/quests-mp-feature.js?v=g329-test-${n}`);
  return mod.questsMpFeature;
}

function engineWith(feature, opts) {
  const made = fakeEngine(opts);
  const { engine } = made;
  engine.query = ((base) => (name, ...args) => (name === 'questsMpContext' ? feature.questsMpContext(...args) : base(name, ...args)))(engine.query);
  engine.achievement = (counter, amount = 1, detail) => {
    made.calls.achievements.push([counter, amount]);
    questOffersFeature.onEvent(counter, amount, engine);
    feature.onEvent(counter, amount, engine, detail);
  };
  feature.restore(undefined, engine);
  feature.onTick(16, Date.now(), engine);
  return made;
}

describe('G329: solo is untouched', () => {
  it('offers none of these quests without a multiplayer ctx, and classifies as before', () => {
    const qs = createQuestState();
    const ctx = { level: 20, skills: ['distilling_1', 'teleportation_5', 'herbalism_3'] };
    for (const id of offered(qs, ctx)) assert.equal(MULTIPLAYER_QUESTS[id], undefined, id);
    const c = classifyQuests();
    assert.ok(c.byReason.needs_other_players.includes('kindly_randomness'));
    assert.ok(c.byReason.needs_other_players.includes('distilling_make_and_distribute_hooch'));
    assert.equal(offerableMultiplayerQuest('distilling_make_and_distribute_hooch', { level: 20 }), null);
  });

  it('answers nothing in solo, and quest-offers asks nothing', async () => {
    const feature = await freshFeature();
    const { engine, data } = fakeEngine({ mode: 'solo' });
    let asked = 0;
    const query = engine.query;
    engine.query = (name, ...args) => { if (name === 'questsMpContext') asked += 1; return query(name, ...args); };
    feature.restore({ facts: { tend_neighbour: 5 } }, engine);
    assert.equal(feature.questsMpContext(engine), null);
    assert.equal(feature.save(), undefined, 'a solo save keeps no slice');
    feature.onTick(16, Date.now(), engine);
    feature.onEvent('vendor_sold:hooch', 3, engine);
    questOffersFeature.init(engine);
    questOffersFeature.onEvent('vendor_sold:hooch', 3, engine);
    assert.equal(asked, 0);
    assert.deepEqual(data, {});
  });
});

describe('G329: what multiplayer offers, and by what', () => {
  it('offers the source-triggered quests by their own trigger', () => {
    const qs = createQuestState();
    assert.ok(offered(qs, MP({ skills: ['distilling_1'] })).includes('distilling_make_and_distribute_hooch'));
    assert.ok(!offered(qs, MP()).includes('distilling_make_and_distribute_hooch'), 'Distilling I first');
    assert.ok(offered(qs, MP({ skills: ['herbalism_3'] })).includes('herbalism_plant_seeds_in_someones_garden'));
    // The level 10 quest (quests_level_map) and Teleportation V's need a Give to a player.
    assert.ok(!offered(qs, MP({ level: 12 })).includes('kindly_randomness'));
    assert.ok(offered(qs, MP({ level: 12, mpReady: { give: true } })).includes('kindly_randomness'));
    assert.ok(!offered(qs, MP({ level: 9, mpReady: { give: true } })).includes('kindly_randomness'));
    assert.ok(!offered(qs, MP({ skills: ['teleportation_5'] })).includes('teleportation_make_and_hand_out_tp_scripts'));
    assert.ok(offered(qs, MP({ skills: ['teleportation_5'], mpReady: { give: true } })).includes('teleportation_make_and_hand_out_tp_scripts'));
  });

  it('offers the meditation quests by their own conditions (G330 counts them)', () => {
    const qs = createQuestState();
    assert.ok(offered(qs, MP({ skills: ['transcendental_radiation_1'] })).includes('transcendentalradiation_radiate_to_five_people'));
    assert.ok(!offered(qs, MP({ skills: ['meditativearts_1'] })).includes('meditative_arts_with_friends'), 'its two prereq quests first');
    qs.completed.push('meditativearts_meditate_for_time_period', 'focusedmeditation_get_mood_or_energy');
    assert.ok(offered(qs, MP({ skills: ['meditativearts_1'] })).includes('meditative_arts_with_friends'));
    assert.ok(!offered(qs, { level: 20, skills: ['meditativearts_1', 'transcendental_radiation_1'] }).includes('meditative_arts_with_friends'), 'never solo');
  });

  it('offers the neighbour quests by the facts the feature keeps', () => {
    const qs = createQuestState();
    const none = offered(qs, MP());
    for (const id of ['good_neighbor', 'water_neighbor_garden', 'neighbor_gifts']) assert.ok(!none.includes(id), id);
    const visited = offered(qs, MP({ mpFacts: { [MP_FACTS.visitNeighbour]: 1 } }));
    assert.ok(visited.includes('neighbor_gifts'));
    assert.ok(!visited.includes('good_neighbor'));
    const keyed = offered(qs, MP({ mpFacts: { [MP_FACTS.tendNeighbour]: 1 } }));
    assert.ok(keyed.includes('good_neighbor') && keyed.includes('water_neighbor_garden'));
  });

  it('never offers the race quests or the quests left out through the familiar', () => {
    const qs = createQuestState();
    const all = offered(qs, MP({ level: 60, skills: Object.keys(getQuestCatalog()), mpReady: { give: true }, mpFacts: { tend_neighbour: 1, visit_neighbour: 1 } }));
    for (const id of MP_RACE_QUESTS) assert.ok(!all.includes(id), id);
    for (const id of Object.keys(MULTIPLAYER_QUESTS_LEFT_OUT)) assert.ok(!all.includes(id), id);
    assert.ok(!all.includes('hogtie_piggy') || getQuestCatalog().hogtie_piggy.solo, 'the Hog Haul stays solo');
  });

  it('judged every lost quest that needs other players', () => {
    for (const [id, def] of Object.entries(getQuestCatalog())) {
      if (def.solo !== false || !['needs_other_players', 'multiplayer'].includes(def.soloReason)) continue;
      assert.ok(MULTIPLAYER_QUESTS[id] || MULTIPLAYER_QUESTS_LEFT_OUT[id], `${id} is judged`);
    }
    for (const id of Object.keys(MULTIPLAYER_QUESTS)) assert.ok(getQuestCatalog()[id], id);
  });
});

describe('G329: the counters', () => {
  it('counts a Give per the source: hooch by count, scripts once per receiver, kindly only levels 3-5', () => {
    assert.deepEqual(giveCounters({ classTsid: 'hooch', count: 4, to: 9, toLevel: 20 }), [{ counter: 'bootleg_hooch', amount: 4 }]);
    assert.deepEqual(giveCounters({ classTsid: 'teleportation_script', to: 9 }), [{ counter: 'give_teleportation_script', amount: 1, label: '9' }]);
    assert.deepEqual(giveCounters({ classTsid: 'cherry', to: 9, toLevel: 4 }), [{ counter: 'give_player_level1', amount: 1, label: '9' }]);
    assert.deepEqual(giveCounters({ classTsid: 'cherry', to: 9, toLevel: 6 }), []);
    assert.deepEqual(giveCounters({ classTsid: 'cherry', to: 9 }), [], 'no vouched level, no count');
    assert.deepEqual(giveCounters({ classTsid: 'hooch', count: 2 }), [], 'no receiver, nothing');
    assert.equal(tradeHoochCount({ items: [{ c: 'hooch', n: 3 }, { c: 'cherry', n: 2 }, { c: 'hooch', n: 1 }] }), 4);
    assert.equal(isRaceStreet('RACE_0123456789ABCDEF'), true);
    assert.equal(isRaceStreet('LA5101HF7F429V'), false);
  });

  it('bootlegs hooch sold to a vendor, traded (once per trade) and given; collected hooch is made', async () => {
    const feature = await freshFeature();
    const { engine, client } = engineWith(feature);
    const id = 'distilling_make_and_distribute_hooch';
    assert.equal(acceptOffer(engine.questState, id, {}).ok, true);
    const p = () => engine.questState.active[id].progress;
    engine.achievement('make_hooch', 5);
    assert.equal(p().make_hooch, 5);
    engine.achievement('vendor_sold:hooch', 3);
    assert.equal(p().bootleg_hooch, 3);
    const done = { t: 'trade_done', trade: 'trade-1', with: { id: 2, name: 'Bo' }, gave: { items: [{ c: 'hooch', n: 4 }] }, got: { items: [] } };
    client.msg(done);
    client.msg(done);
    assert.equal(p().bootleg_hooch, 7, 'a re-sent trade_done counts once');
    client.msg({ ...done, trade: 'trade-2', gave: { items: [{ c: 'cherry', n: 4 }] } });
    assert.equal(p().bootleg_hooch, 7);
    engine.achievement('items_given:hooch', 1, { to: 2, count: 2 });
    assert.equal(p().bootleg_hooch, 9);
    assert.deepEqual(feature.save().trades, ['trade-1']);
  });

  it('counts each script receiver once, for good, and kindly receivers once a run', async () => {
    const feature = await freshFeature();
    const { engine } = engineWith(feature);
    engine.achievement('items_given:teleportation_script', 1, { to: 7 });
    const tp = 'teleportation_make_and_hand_out_tp_scripts';
    acceptOffer(engine.questState, tp, {});
    engine.achievement('items_given:teleportation_script', 1, { to: 7 });
    assert.equal(engine.questState.active[tp].progress.give_teleportation_script, 0, 'given before the quest: never again (onGive 285-289)');
    engine.achievement('items_given:teleportation_script', 1, { to: 8 });
    engine.achievement('items_given:teleportation_script_imbued', 1, { to: 8 });
    engine.achievement('items_given:teleportation_script', 1, { to: 9 });
    assert.equal(engine.questState.active[tp].progress.give_teleportation_script, 2);
    acceptOffer(engine.questState, 'kindly_randomness', {});
    for (const [to, lvl] of [[3, 3], [3, 3], [4, 5], [5, 6], [6, undefined]]) engine.achievement('items_given:cherry', 1, { to, toLevel: lvl });
    assert.equal(engine.questState.active.kindly_randomness.progress.give_player_level1, 2);
    assert.deepEqual(normalizeQuestsMpSlice(JSON.parse(JSON.stringify(feature.save()))).scriptsGiven, ['7', '8', '9']);
  });

  it('counts a meditation with 10 others at once, and the radiation flag', async () => {
    const feature = await freshFeature();
    const { engine } = engineWith(feature);
    const qs = engine.questState;
    acceptOffer(qs, 'meditative_arts_with_friends', {});
    acceptOffer(qs, 'transcendentalradiation_radiate_to_five_people', {});
    engine.achievement('meditated_together', 9);
    assert.equal(qs.active.meditative_arts_with_friends.progress.meditate_10players, 0);
    engine.achievement('meditated_together', 10);
    assert.ok(qs.completed.includes('meditative_arts_with_friends'));
    engine.achievement('transcendence_5players', 1);
    assert.ok(qs.completed.includes('transcendentalradiation_radiate_to_five_people'));
  });

  it('keeps the neighbour facts from what the player stands on', async () => {
    const feature = await freshFeature();
    const visiting = { owner: 5, key: false };
    const { engine, data } = engineWith(feature, { visiting });
    feature.onTick(16, Date.now() + 5000, engine);
    assert.ok(feature.questsMpContext(engine).facts.visit_neighbour > 0);
    assert.equal(feature.questsMpContext(engine).facts.tend_neighbour, undefined);
    visiting.key = true;
    feature.onTick(16, Date.now() + 10_000, engine);
    assert.ok(feature.questsMpContext(engine).facts.tend_neighbour > 0);
    assert.equal(data.questsMpFacts, 'tend_neighbour,visit_neighbour');
    assert.deepEqual(Object.keys(normalizeQuestsMpSlice(feature.save()).facts).sort(), ['tend_neighbour', 'visit_neighbour']);
  });

  it('routes the neighbours slice counters to the quests it offers', () => {
    const qs = createQuestState();
    acceptOffer(qs, 'water_neighbor_garden', {});
    acceptOffer(qs, 'good_neighbor', {});
    for (let i = 0; i < 5; i += 1) routeQuestEvent(qs, 'water_garden_for_others', 1, { managedOnly: true });
    const r = routeQuestEvent(qs, 'neighbors_resources_tended', 11, { managedOnly: true });
    assert.equal(qs.active.water_neighbor_garden.progress.water_garden_for_others, 5);
    assert.deepEqual(r.completable.map((x) => x.classTsid), ['good_neighbor']);
  });
});

describe('G329: the race quests are logged by the challenge', () => {
  it('logs the challenger\'s course quest, completes it on a win and leaving, fails it otherwise', async () => {
    const feature = await freshFeature();
    const { engine, client, calls, data } = engineWith(feature);
    const qs = engine.questState;
    // The solo Hog Haul shares both flags: it must not move.
    acceptOffer(qs, 'hogtie_piggy', {});
    client.msg({ t: 'race_waiting', from: 2, course: 'amazing_race' });
    assert.equal(qs.active.amazing_race, undefined, 'only the challenger holds it');
    client.msg({ t: 'race_waiting', from: 1, course: 'amazing_race' });
    assert.ok(qs.active.amazing_race);
    assert.ok(ensureQuestOfferState(qs).managed.amazing_race);
    assert.ok(calls.activity.includes('New quest: The Amazing Race'));
    client.msg({ t: 'race_failed', course: 'amazing_race', refund: true });
    assert.equal(qs.active.amazing_race, undefined, 'nobody came: failed, out of the log');
    client.msg({ t: 'race_waiting', from: 1, course: 'amazing_race' });
    client.msg({ t: 'race_match', match: '0123456789abcdef', course: 'amazing_race' });
    feature.onStreetEnter({}, engine);
    assert.equal(qs.active.amazing_race.progress.race_leave, 0, 'race_leave only after the win');
    client.msg({ t: 'race_end', match: '0123456789abcdef', winner: { id: 1, name: 'Ada' }, why: 'won' });
    assert.equal(qs.active.amazing_race.progress.multiplayer_quest_win, 1);
    assert.equal(data.questsMpRace, 'amazing_race:won');
    engine.streetTsid = 'RACE_0123456789ABCDEF';
    feature.onStreetEnter({}, engine);
    assert.ok(qs.active.amazing_race, 'still in the race');
    engine.streetTsid = 'LA5101HF7F429V';
    feature.onStreetEnter({}, engine);
    assert.equal(qs.active.amazing_race, undefined);
    assert.ok(qs.completed.includes('amazing_race'));
    assert.ok(calls.awards.some((a) => a.classTsid === 'amazing_race'));
    assert.deepEqual(qs.active.hogtie_piggy.progress, { multiplayer_quest_win: 0, race_leave: 0 });
    // Repeatable: the next challenge logs it again; losing fails it (inc_race.js 183-189).
    client.msg({ t: 'race_waiting', from: 1, course: 'amazing_race' });
    assert.ok(qs.active.amazing_race);
    client.msg({ t: 'race_match', match: 'fedcba9876543210', course: 'amazing_race' });
    client.msg({ t: 'race_end', match: 'fedcba9876543210', winner: { id: 2, name: 'Bo' }, why: 'won' });
    assert.equal(qs.active.amazing_race, undefined);
  });

  it('every race course is a quest race in the catalog', () => {
    for (const id of MP_RACE_QUESTS) {
      const def = getQuestCatalog()[id];
      assert.equal(def.isRepeatable, true, id);
      assert.deepEqual(def.requirements.map((r) => r.name), ['multiplayer_quest_win', 'race_leave'], id);
    }
  });
});

describe('G329: the ledger credits what is completable online', () => {
  it('lists the multiplayer quests with rewards in the credits', () => {
    const credits = economyCredits(new Set(Object.keys(tradeTable().items)));
    assert.deepEqual(credits.quests.distilling_make_and_distribute_hooch, { c: 350 });
    assert.deepEqual(credits.quests.water_neighbor_garden, { c: 400 });
    assert.equal(credits.quests.good_neighbor, undefined, 'xp and mood only');
    assert.equal(credits.quests.amazing_race, undefined, 'no rewards');
    assert.equal(credits.quests.grub_giver, undefined, 'left out');
    assert.deepEqual(credits.quests.transcendentalradiation_radiate_to_five_people, { c: 350 });
    for (const id of creditedMultiplayerQuests()) assert.ok(MULTIPLAYER_QUESTS[id], id);
  });
});
