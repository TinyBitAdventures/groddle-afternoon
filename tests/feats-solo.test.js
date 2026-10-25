/**
 * G143: solo Feats as personal goals (js/solo-feats.js +
 * features/solo-feats-feature.js). Source: glitch-GameServerJS
 * inc_data_feats_prod.js, players/inc_feats.js, main.js doBreakIt, and the
 * feats_increment call sites the event rules cite.
 * Run: node --test tests/feats-solo.test.js
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';
import {
  EVENT_RULES,
  FEAT_BY_ID,
  LOST_COMMIT_TEXT,
  QUICK_MS,
  REWARD_ITEM,
  SOLO_FEATS,
  UNWIRED_FEATS,
  WIRED_FEATS,
  addPending,
  completionText,
  createSoloFeatState,
  eventIncrements,
  featSummary,
  incrementFeat,
  isFeatComplete,
  normalizeSoloFeatState,
  resetPending,
  streakCheck,
  takePending,
  vogTextFor,
} from '../public/js/solo-feats.js?v=g143-1';
import { soloFeatsFeature } from '../public/js/features/solo-feats-feature.js?v=g143-1';
import { FEATURES } from '../public/js/features/index.js';
import { createPlayerSave, parsePlayerSave, serializePlayerSave } from '../public/js/player-save.js?v=player-save-7';

const ROOT = join(import.meta.dirname, '..');
const GSJS = join(ROOT, '..', 'glitch-GameServerJS');
const hasGsjs = existsSync(join(GSJS, 'inc_data_feats_prod.js'));

function gsjsFeats() {
  const ctx = {};
  vm.runInNewContext(`${readFileSync(join(GSJS, 'inc_data_feats_prod.js'), 'utf8')}\nthis.out = feats;`, ctx);
  return ctx.out;
}

function fakeEngine(extra = {}) {
  const calls = { achievement: [], grant: [], award: [], activity: [], toast: [], data: {} };
  const engine = {
    started: true,
    inv: {},
    player: { x: 100, y: 500 },
    streetTsid: 'GLI32G3NUTD100I',
    questState: { completed: [] },
    quoinState: { qurazyFound: 0 },
    buffs: new Set(),
    hasBuff(id) { return this.buffs.has(id); },
    inScene: () => false,
    param: () => null,
    achievement: (counter, amount) => calls.achievement.push([counter, amount]),
    grantAchievement: (id) => { calls.grant.push(id); return true; },
    award: (payload) => calls.award.push(payload),
    pushActivity: (line) => calls.activity.push(line),
    toast: (line) => calls.toast.push(line),
    refreshPack() {},
    playSound() {},
    save() {},
    setData: (k, v) => { calls.data[k] = String(v); },
    calls,
    ...extra,
  };
  return engine;
}

describe('Solo Feat data against GSJS', { skip: !hasGsjs && 'glitch-GameServerJS not checked out' }, () => {
  it('lists the fifteen production Feats in file order with their exact source fields', () => {
    const src = gsjsFeats();
    assert.deepEqual(SOLO_FEATS.map((f) => f.id), Object.keys(src));
    for (const f of SOLO_FEATS) {
      const s = src[f.id];
      assert.equal(f.title, s.title, f.id);
      assert.equal(f.vog_text, s.vog_text.trim(), f.id);
      assert.equal(f.url, s.url, f.id);
      assert.equal(f.epic_id, s.epic_id, f.id);
      assert.equal(f.game_day, s.game_day, f.id);
    }
  });

  it('cites feats_increment call sites that exist, with the same amounts', () => {
    const items = join(GSJS, 'items');
    const has = (file, needle) => readFileSync(join(items, file), 'utf8').includes(needle);
    assert.ok(has('npc_piggy.js', "pc.feats_increment('animal_love', 1)"));
    assert.ok(has('npc_butterfly.js', "pc.feats_increment('animal_love', 3)"));
    assert.ok(has('npc_crab.js', "pc.feats_increment('animal_love', 5)"));
    assert.ok(has('npc_fox.js', "pc.feats_increment('animal_love', 1)"));
    assert.ok(has('npc_sloth.js', "pc.feats_increment('animal_love', 1)"));
    assert.ok(has('npc_kitty_chicken.js', "pc.feats_increment('animal_love', 1)"));
    assert.ok(has('emotional_bear.js', "pc.feats_increment('tottlys_toys', 1)"));
    assert.ok(has('npc_cubimal_crab.js', "pc.feats_increment('tottlys_toys', 5)"));
    assert.ok(has('npc_cubimal_crab.js', "this.racing_owner.feats_increment('tottlys_toys', 2)"));
    const location = readFileSync(join(GSJS, 'locations', 'location.js'), 'utf8');
    assert.match(location, /distance >= 1000 && pc\.has_blown_conch/);
    assert.match(location, /pc\.feats_increment\('makeup_feat_redux', 3\)/);
    const feats = readFileSync(join(GSJS, 'players', 'inc_feats.js'), 'utf8');
    assert.ok(feats.includes(`"The ancient Feat \\""+rewards.title+"\\" has been successfully recreated by modern Glitches. Your participation has earned you the following rewards:"`));
    assert.ok(feats.includes(LOST_COMMIT_TEXT.replace(/"/g, '\\"')));
    const main = readFileSync(join(GSJS, 'main.js'), 'utf8');
    assert.match(main, /class_tsid:"petrified_rock_small",\s*count:"1",\s*label:"Small Petrified Rock"/);
  });
});

describe('Solo Feat catalog', () => {
  it('wires ten Feats and leaves five out with a reason', () => {
    assert.equal(WIRED_FEATS.length, 10);
    assert.deepEqual(UNWIRED_FEATS.map((f) => f.id), [
      'mihceal_conch', 'graves_celebrating_mourning', 'inviting_friends', 'makeup_feat_1', 'visiting_stones',
    ]);
    for (const f of WIRED_FEATS) {
      assert.ok(Number.isInteger(f.goal) && f.goal > 0, f.id);
      assert.ok(f.what && !/—/.test(f.what), f.id);
    }
    for (const f of UNWIRED_FEATS) assert.ok(f.reason, f.id);
    // Every rule points at a wired Feat.
    for (const r of EVENT_RULES) assert.ok(FEAT_BY_ID[r.featId]?.wired, r.featId);
    assert.equal(FEAT_BY_ID.meditation_of_groddlocritus.goal, 11);
  });

  it('builds the source completion and vog copy', () => {
    assert.equal(
      completionText("Heebo's Happy Accident"),
      'The ancient Feat "Heebo\'s Happy Accident" has been successfully recreated by modern Glitches. Your participation has earned you the following rewards:'
    );
    assert.equal(
      vogTextFor('streaking', 4),
      'That street you just streaked? It counted towards the feat The Lucky Streak. Just 4 streets left to streak to meet the next goal!'
    );
    assert.equal(REWARD_ITEM, 'petrified_rock_small');
  });
});

describe('Increments from game events', () => {
  const by = (counter, amount) => eventIncrements(counter, amount).map((r) => `${r.featId}:${r.mode}:${r.amount}`).sort();
  it('maps animal care to Heebo and the commit pile', () => {
    assert.deepEqual(by('npc_piggy:pet'), ['animal_love:direct:1', 'pet_only:commit:1']);
    assert.deepEqual(by('npc_butterfly:sing_to'), ['animal_love:direct:3', 'pet_only:commit:3']);
    assert.deepEqual(by('npc_butterfly:milk'), ['animal_love:direct:1', 'pet_only:reset:0']);
    assert.deepEqual(by('npc_piggy:feed:apple'), ['animal_love:direct:1', 'pet_only:commit:1']);
    assert.deepEqual(by('eggs_incubated:chicken_egg'), ['animal_love:direct:1']);
    assert.deepEqual(by('animals_grown:piglet'), ['animal_love:direct:1', 'pet_only:commit:1']);
    assert.deepEqual(by('trants_petted:trant_fruit'), ['pet_only:commit:1']);
    assert.deepEqual(by('trants_harvested:trant_fruit'), ['pet_only:reset:0']);
  });
  it('takes meditation minutes from the event and toys at source weights', () => {
    assert.deepEqual(by('focusing_orb:meditation_time', 4), ['meditation_of_groddlocritus:direct:4']);
    assert.deepEqual(by('focusing_orb:meditation_time', 0), []);
    assert.deepEqual(by('cubimals_freed:npc_cubimal_piggy'), ['tottlys_toys:direct:5']);
    assert.deepEqual(by('players_hugged'), ['tottlys_toys:direct:1']);
    assert.deepEqual(by('feats:contributed'), []);
    assert.deepEqual(by('npc_piggy:petx'), []);
  });
});

describe('Personal goal rules', () => {
  it('counts the first contribution, announces the vog text and completes once with a rock', () => {
    const state = normalizeSoloFeatState({ openedAt: 1000 });
    const first = incrementFeat(state, 'qurazy_quoin_collecting', 1, {}, 2000);
    assert.equal(first.counted, true);
    assert.equal(first.firstContribution, true);
    assert.deepEqual(first.counters, [
      { counter: 'feats:contributed', amount: 1 },
      { counter: 'epics_contributed:2', amount: 1 },
    ]);
    assert.deepEqual(first.grants, ['quick_on_your_feat', 'down_to_the_wire']);
    assert.match(first.vogText, /There are 2 qurazy quoins left/);
    const second = incrementFeat(state, 'qurazy_quoin_collecting', 1, {}, 1000 + QUICK_MS + 1);
    assert.equal(second.vogText, '');
    assert.deepEqual(second.grants, ['down_to_the_wire']);
    const third = incrementFeat(state, 'qurazy_quoin_collecting', 5, {}, 9000);
    assert.equal(third.completed, true);
    assert.equal(third.value, 3);
    assert.ok(third.counters.some((c) => c.counter === 'feats:contributed_to'));
    assert.equal(state.rocks, 1);
    assert.equal(isFeatComplete(state, 'qurazy_quoin_collecting'), true);
    assert.equal(incrementFeat(state, 'qurazy_quoin_collecting', 1).reason, 'complete');
    assert.equal(state.rocks, 1);
  });

  it('leaves the Last Feat contribution counter to the chain and refuses unwired Feats', () => {
    const state = createSoloFeatState();
    const res = incrementFeat(state, 'makeup_feat_redux', 1);
    assert.equal(res.counters.length, 0);
    assert.equal(incrementFeat(state, 'mihceal_conch', 1).reason, 'not_wired');
  });

  it('honours per-key caps (once per crab, three per kitty)', () => {
    const state = createSoloFeatState();
    const cap = { key: 'crab:GX:hug', max: 1 };
    assert.equal(incrementFeat(state, 'animal_love', 1, { cap }).counted, true);
    assert.equal(incrementFeat(state, 'animal_love', 1, { cap }).reason, 'capped');
    const kitty = { key: 'kitty:GX:kitty:0', max: 3 };
    const counted = [1, 2, 3, 4].map(() => incrementFeat(state, 'animal_love', 1, { cap: kitty }).counted);
    assert.deepEqual(counted, [true, true, true, false]);
  });

  it('piles up kindnesses, loses them on a harvest and hands them over on leaving', () => {
    const state = createSoloFeatState();
    addPending(state, 3);
    assert.equal(resetPending(state), 3);
    addPending(state, 2);
    addPending(state, 1);
    assert.equal(takePending(state), 3);
    assert.equal(state.pending, 0);
  });

  it('streaks one street per game day, nekkid, 1,000 px from the way in', () => {
    const state = createSoloFeatState();
    const base = { tsid: 'GLI32G3NUTD100I', dayKey: 'd1', entry: { x: 0, y: 0 }, exit: { x: 1000, y: 0 }, nekkid: true, realStreet: true };
    assert.equal(streakCheck(state, { ...base, exit: { x: 999, y: 0 } }).reason, 'too_short');
    assert.equal(streakCheck(state, { ...base, nekkid: false }).reason, 'not_streaking');
    assert.equal(streakCheck(state, { ...base, realStreet: false }).reason, 'not_streaking');
    assert.equal(streakCheck(state, base).ok, true);
    assert.equal(streakCheck(state, base).reason, 'already');
    assert.equal(streakCheck(state, { ...base, dayKey: 'd2' }).ok, true);
  });
});

describe('Solo Feats feature', () => {
  it('is registered once in the feature list', () => {
    assert.equal(FEATURES.filter((f) => f.id === 'solo-feats').length, 1);
  });

  it('completes Heebo from real piggy pets and drops a Small Petrified Rock in the pack', () => {
    const engine = fakeEngine();
    soloFeatsFeature.restore(undefined, engine);
    for (let i = 0; i < 49; i += 1) soloFeatsFeature.onEvent('npc_piggy:pet', 1, engine);
    assert.equal(engine.inv.petrified_rock_small, undefined);
    soloFeatsFeature.onEvent('npc_piggy:pet', 1, engine);
    assert.equal(engine.inv.petrified_rock_small, 1);
    assert.equal(engine.calls.award.length, 1);
    assert.equal(engine.calls.award[0].title, 'Feat Completed!');
    assert.match(engine.calls.award[0].body, /The ancient Feat "Heebo's Happy Accident" has been successfully recreated/);
    assert.ok(engine.calls.achievement.some(([c]) => c === 'feats:contributed'));
    soloFeatsFeature.onEvent('npc_piggy:pet', 1, engine);
    assert.equal(engine.inv.petrified_rock_small, 1);
    // Fifty pets also piled up kindnesses for "… And Ask Nothing in Return".
    assert.equal(soloFeatsFeature.save().pending, 30);
  });

  it('commits the pile on leaving a street and loses it on a harvest', () => {
    const engine = fakeEngine();
    soloFeatsFeature.restore(undefined, engine);
    soloFeatsFeature.onEvent('trants_petted:trant_fruit', 1, engine);
    soloFeatsFeature.onEvent('trants_harvested:trant_fruit', 1, engine);
    assert.ok(engine.calls.activity.includes(LOST_COMMIT_TEXT));
    soloFeatsFeature.onEvent('trants_watered:trant_fruit', 1, engine);
    soloFeatsFeature.onEvent('wood_tree:pet', 1, engine);
    soloFeatsFeature.onStreetClear(engine);
    assert.equal(soloFeatsFeature.save().progress.pet_only.value, 2);
    assert.equal(soloFeatsFeature.save().pending, 0);
  });

  it('counts completed quests and qurazy quoins as they grow, not the ones before', () => {
    const engine = fakeEngine({ questState: { completed: ['a', 'b'] }, quoinState: { qurazyFound: 4 } });
    soloFeatsFeature.restore(undefined, engine);
    soloFeatsFeature.onTick(16, 1_000_000, engine);
    engine.questState.completed.push('c');
    engine.quoinState.qurazyFound = 6;
    soloFeatsFeature.onTick(16, 2_000_000, engine);
    const saved = soloFeatsFeature.save();
    assert.equal(saved.progress.reminscequests.value, 1);
    assert.equal(saved.progress.qurazy_quoin_collecting.value, 2);
  });

  it('streaks when you leave a street nekkid far from where you came in', () => {
    const engine = fakeEngine();
    soloFeatsFeature.restore(undefined, engine);
    engine.buffs.add('nekkid');
    soloFeatsFeature.onStreetEnter({ tsid: 'GLI32G3NUTD100I' }, engine);
    engine.player.x = 1200;
    soloFeatsFeature.onStreetClear(engine);
    assert.equal(soloFeatsFeature.save().progress.streaking.value, 1);
  });

  it('sets up a near-complete Feat from the QA route', () => {
    const params = { featdemo: 'tottlys_toys' };
    const engine = fakeEngine({ param: (k) => params[k] ?? null });
    soloFeatsFeature.restore(undefined, engine);
    soloFeatsFeature.onStreetEnter({ tsid: 'GLI32G3NUTD100I' }, engine);
    assert.match(engine.calls.data.soloFeats, /tottlys_toys:9\/10/);
    assert.equal(soloFeatsFeature.featsIncrement('tottlys_toys', 2, {}, engine), 1);
    assert.equal(engine.inv.petrified_rock_small, 1);
    assert.equal(engine.calls.data.soloFeatRocks, '1');
  });

  it('survives a player save round trip', () => {
    const engine = fakeEngine();
    soloFeatsFeature.restore(undefined, engine);
    soloFeatsFeature.featsIncrement('hi_signs_1', 2, {}, engine);
    soloFeatsFeature.featsIncrement('animal_love', 1, { cap: { key: 'crab:G:hug', max: 1 } }, engine);
    soloFeatsFeature.onEvent('npc_piggy:pet', 1, engine);
    const slice = soloFeatsFeature.save();
    const raw = serializePlayerSave(createPlayerSave({ inventory: { apple: 1 }, systems: { features: { 'solo-feats': slice } } }));
    const back = parsePlayerSave(raw).systems.features['solo-feats'];
    soloFeatsFeature.restore(back, engine);
    const again = soloFeatsFeature.save();
    assert.equal(again.progress.hi_signs_1.value, 2);
    assert.equal(again.progress.animal_love.value, 2);
    assert.equal(again.caps['crab:G:hug'], 1);
    assert.equal(again.pending, 1);
    assert.equal(featSummary(again), featSummary(normalizeSoloFeatState(slice)));
    assert.equal(normalizeSoloFeatState({ progress: { animal_love: { value: 999 } } }).progress.animal_love.value, 50);
  });
});
