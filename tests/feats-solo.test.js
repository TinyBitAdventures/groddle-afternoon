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
  FEED_CAP,
  capKeyFor,
  eventIncrements,
  featEventIncrements,
  featSummary,
  incrementFeat,
  isFeatComplete,
  normalizeSoloFeatState,
  resetPending,
  streakCheck,
  takePending,
  vogTextFor,
  CAP_OWNERS,
  GAME_WEEK_DAYS,
  GAME_WEEK_MS,
  featRows,
  reopenDueFeats,
  reopenText,
  reopensAt,
} from '../public/js/solo-feats.js?v=g171-1';
import { DAY_NAMES, GAME_DAY_MS } from '../public/js/game-day.js?v=dametime-1';
import { soloFeatsFeature } from '../public/js/features/solo-feats-feature.js?v=g268-1';
import { FEATURES } from '../public/js/features/index.js';
import { createPlayerSave, parsePlayerSave, serializePlayerSave } from '../public/js/player-save.js?v=player-save-14';
import { createResourceNode, harvestResourceNode } from '../public/js/resource-nodes.js';

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
    // Done until a game week has passed (G171).
    assert.equal(incrementFeat(state, 'qurazy_quoin_collecting', 1, {}, 9001).reason, 'complete');
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

describe('G173: the missing increments', () => {
  const by = (counter, amount) => eventIncrements(counter, amount).map((r) => `${r.featId}:${r.mode}:${r.amount}`).sort();
  const read = (...parts) => readFileSync(join(GSJS, ...parts), 'utf8');

  it('reads the source call sites it wires', { skip: !hasGsjs && 'glitch-GameServerJS not checked out' }, () => {
    // npc_salmon.js:195-207: the boot fails the verb; only a landed Pocket Salmon counts.
    assert.match(read('items', 'npc_salmon.js'), /if \(remainder > 0\) \{\s*failed = true;\s*\}\s*else \{\s*pc\.feats_increment\('animal_love', 1\);/);
    // salmon.js:92 release, +1 (resource-nodes SALMON_RELEASE, G178).
    assert.match(read('items', 'salmon.js'), /pc\.announce_sound\('SALMON_RELEASE'\); \/\/play sound\s*pc\.feats_increment\('animal_love', 1\);/);
    // inc_skill_packages.js:53-54: the Spinning Wheel's Cubimal boxes give the Lucky Streak 5.
    assert.match(read('players', 'inc_skill_packages.js'),
      /class_id == 'spinning_wheel' && \(it\.class_id == 'cubimal_package' \|\| it\.class_id == 'cubimal_package_2'\)\)\{\s*this\.feats_increment\('streaking', 5\);/);
    assert.ok(read('players', 'inc_skill_packages.js').includes("this.quests_inc_counter('drop_table_'+class_id+'_'+it.class_id, it.count);"));
    assert.ok(read('items', 'fertilidust.js').includes('pc.feats_increment_for_commit(3);'));
    assert.ok(read('items', 'fertilidust_lite.js').includes('pc.feats_increment_for_commit(1);'));
    assert.ok(read('items', 'powder_of_mild_fecundity.js').includes('pc.feats_reset_commit();'));
    assert.ok(read('items', 'powder_of_startling_fecundity.js').includes('pc.feats_reset_commit();'));
  });

  it('finds that a Batterfly only counts its feed: milk, massage and sing to are hidden no-ops', { skip: !hasGsjs && 'glitch-GameServerJS not checked out' }, () => {
    const src = read('items', 'npc_batterfly.js');
    for (const verb of ['milk', 'massage', 'sing_to']) {
      const start = src.indexOf(`verbs.${verb} = { // defined by npc_batterfly`);
      assert.ok(start > 0, verb);
      const body = src.slice(start, src.indexOf('\n};', start));
      // conditions return {state:null}: the verb is not offered; the handler never reaches parent_verb_npc_butterfly_*.
      assert.match(body, /"conditions"\s*: function\(pc, drop_stack\)\{\s*return \{state:null\};/, verb);
      assert.doesNotMatch(body, /parent_verb_|feats_increment|runSkillPackage/, verb);
    }
    // The feed is the batterfly's own, three per animal per player.
    assert.match(src, /verbs\.feed = \{ \/\/ defined by npc_batterfly/);
    assert.match(src, /if \(this\.times_fed_for_feat\[pc\.tsid\] < 3\) \{\s*pc\.feats_increment\('animal_love', 1\);/);
  });

  it('maps the new events at the source amounts', () => {
    assert.deepEqual(by('npc_salmon:pocket'), ['animal_love:direct:1']);
    assert.deepEqual(by('drop_table_spinning_wheel_cubimal_package'), ['streaking:direct:5']);
    assert.deepEqual(by('drop_table_spinning_wheel_cubimal_package_2'), ['streaking:direct:5']);
    assert.deepEqual(by('drop_table_spinning_wheel_musicblock_x_shiny_01'), []);
    assert.deepEqual(by('drop_table_spinning_wheel_currants', 500), []);
    assert.deepEqual(by('drop_table_sno_cones_sno_cone_blue'), []);
    // G178: the verb's own counter is not a Feat event; trees_grown is (living trees only).
    assert.deepEqual(by('fertilidust:disperse'), []);
    assert.deepEqual(by('fertilidust:trees_grown'), ['pet_only:commit:3']);
    assert.deepEqual(by('fertilidust_lite:sprinkle'), ['pet_only:commit:1']);
    assert.deepEqual(by('powder_of_mild_fecundity:disperse'), ['pet_only:reset:0']);
    assert.deepEqual(by('powder_of_startling_fecundity:disperse'), ['pet_only:reset:0']);
    // The Batterfly's milk / massage / sing to are not counted (see above).
    assert.deepEqual(by('npc_batterfly:milk'), []);
    assert.deepEqual(by('npc_batterfly:massage'), []);
    assert.deepEqual(by('npc_batterfly:sing_to'), []);
    assert.deepEqual(by('npc_batterfly:feed'), ['animal_love:direct:1']);
  });

  it('counts npc_salmon:pocket from a real pocket, never from the boot', () => {
    const counters = (roll) => harvestResourceNode(createResourceNode('npc_salmon'), {}, { energy: 50 },
      { now: 1_000, dayKey: 'd1', rng: () => roll }).achievementCounters.map((c) => c.counter);
    assert.deepEqual(counters(0.5), ['npc_salmon:pocket']);
    assert.deepEqual(counters(0.05), []);
  });

  it('emits the Spinning Wheel drop-table counter from game.js', () => {
    const game = readFileSync(join(ROOT, 'public', 'game.js'), 'utf8');
    const at = game.indexOf('function updateSpinningWheel()');
    const body = game.slice(at, game.indexOf('\nfunction ', at + 10));
    assert.match(body, /emitGameEvent\(`drop_table_\$\{result\.reward\.table \|\| 'spinning_wheel'\}_/);
  });

  it('finishes the Lucky Streak from one Cubimal box and Heebo from one Salmon', () => {
    const params = { featdemo: 'streaking', featprogress: '0' };
    const engine = fakeEngine({ param: (k) => params[k] ?? null });
    soloFeatsFeature.restore(undefined, engine);
    soloFeatsFeature.onStreetEnter({ tsid: 'GLI32G3NUTD100I' }, engine);
    soloFeatsFeature.onEvent('drop_table_spinning_wheel_cubimal_package', 1, engine);
    assert.equal(soloFeatsFeature.save().progress.streaking.value, 5);
    assert.equal(engine.inv.petrified_rock_small, 1);
    assert.match(engine.calls.data.soloFeatLast, /^streaking:\+5:5\/5:complete$/);

    const salmon = fakeEngine({ param: (k) => ({ featdemo: 'animal_love' })[k] ?? null });
    soloFeatsFeature.restore(undefined, salmon);
    soloFeatsFeature.onStreetEnter({ tsid: 'GLI32G3NUTD100I' }, salmon);
    soloFeatsFeature.onEvent('npc_salmon:pocket', 1, salmon);
    assert.equal(soloFeatsFeature.save().progress.animal_love.value, 50);
    assert.equal(salmon.inv.petrified_rock_small, 1);
  });

  it('piles up Fertilidust kindness and loses it to a fecundity powder', () => {
    const engine = fakeEngine();
    soloFeatsFeature.restore(undefined, engine);
    soloFeatsFeature.onEvent('fertilidust:trees_grown', 1, engine);
    soloFeatsFeature.onEvent('fertilidust_lite:sprinkle', 1, engine);
    assert.equal(soloFeatsFeature.save().pending, 4);
    soloFeatsFeature.onEvent('powder_of_mild_fecundity:disperse', 1, engine);
    assert.equal(soloFeatsFeature.save().pending, 0);
    assert.ok(engine.calls.activity.includes(LOST_COMMIT_TEXT));
  });

  // QA oddity: a fresh game's first quest gave Feat First, Quick on Your Feat
  // and Down To The Wire at once. inc_feats.js 53-72 + 104-106 do the same for
  // a first contribution in the Feat's first 30 minutes (here: of the save).
  it('gives a first quest the three badges the source gives a first contribution', () => {
    const engine = fakeEngine();
    soloFeatsFeature.restore(undefined, engine);
    // onTick polls every 500 ms of its own clock (module state shared with the tests above).
    soloFeatsFeature.onTick(16, 50_000_000, engine);
    engine.questState.completed.push('first');
    soloFeatsFeature.onTick(16, 60_000_000, engine);
    assert.deepEqual(engine.calls.achievement, [['feats:contributed', 1], ['epics_contributed:2', 1]]);
    assert.deepEqual(engine.calls.grant, ['quick_on_your_feat', 'down_to_the_wire']);
    // After the first 30 minutes a first contribution to another Feat gets no Quick on Your Feat.
    const late = normalizeSoloFeatState({ openedAt: 1_000 });
    assert.deepEqual(incrementFeat(late, 'hi_signs_1', 1, {}, 1_000 + QUICK_MS + 1).grants, ['down_to_the_wire']);
    assert.deepEqual(incrementFeat(late, 'tottlys_toys', 1, {}, 1_000 + QUICK_MS).grants, ['quick_on_your_feat', 'down_to_the_wire']);
  });
});

// G178: the Pocket Salmon's Release, three feeds per animal, Fertilidust on dead trees.
describe('G178 Feat follow-ups', () => {
  const GSJS = join(ROOT, '..', 'glitch-GameServerJS');
  const hasGsjs = existsSync(join(GSJS, 'items', 'npc_piggy.js'));
  const read = (...parts) => readFileSync(join(GSJS, ...parts), 'utf8');
  const by = (counter, amount) => eventIncrements(counter, amount).map((r) => `${r.featId}:${r.mode}:${r.amount}`).sort();
  const piggy = (i) => ({ animal: `GLI32G3NUTD100I:npc_piggy:${i}` });

  it('reads the 3-feed caps and the live-tree Fertilidust rule from the source', { skip: !hasGsjs && 'glitch-GameServerJS not checked out' }, () => {
    // npc_piggy.js 734-739: the cap gates the animal_love call and the commented commit together.
    assert.match(read('items', 'npc_piggy.js'),
      /if \(this\.times_fed_for_feat\[pc\.tsid\] < 3\)\{\s*\/\/ pc\.feats_increment_for_commit\(1\);\s*pc\.feats_increment\('animal_love', 1\);\s*this\.times_fed_for_feat\[pc\.tsid\]\+\+;/);
    // npc_batterfly.js 830-840: the first feed sets 0, later ones add 1; 0, 1, 2 count.
    assert.match(read('items', 'npc_batterfly.js'),
      /if \(!this\.times_fed_for_feat\[pc\.tsid\]\) \{\s*this\.times_fed_for_feat\[pc\.tsid\] = 0;\s*\}\s*else \{\s*this\.times_fed_for_feat\[pc\.tsid\]\+\+;\s*\}\s*if \(this\.times_fed_for_feat\[pc\.tsid\] < 3\) \{/);
    assert.equal(FEED_CAP.max, 3);
    // fertilidust.js 344-352: the +3 sits inside `if (trants)`; reviving dead trants alone skips it.
    const dust = read('items', 'fertilidust.js');
    const live = dust.slice(dust.indexOf('\tif (trants){'), dust.indexOf('\telse if (!dead_trants){'));
    assert.ok(live.includes('pc.feats_increment_for_commit(3);'));
    assert.equal(dust.split('feats_increment_for_commit').length - 1, 1);
  });

  it('counts the Release toward Heebo at +1', () => {
    assert.deepEqual(by('salmon:release'), ['animal_love:direct:1']);
    assert.deepEqual(by('salmon:eat'), []);
  });

  it('caps feeds at 3 per animal, for Heebo and the commit pile together', () => {
    const state = normalizeSoloFeatState({});
    const rows = (counter, detail) => featEventIncrements(state, counter, 1, detail).map((r) => `${r.featId}:${r.mode}:${r.amount}`).sort();
    for (let i = 0; i < 3; i += 1) assert.deepEqual(rows('npc_piggy:feed:cherry', piggy(0)), ['animal_love:direct:1', 'pet_only:commit:1']);
    assert.deepEqual(rows('npc_piggy:feed:cherry:2', piggy(0)), []);
    // Another Piggy has its own three.
    assert.deepEqual(rows('npc_piggy:feed:apple', piggy(1)), ['animal_love:direct:1', 'pet_only:commit:1']);
    // Petting is not capped.
    assert.deepEqual(rows('npc_piggy:pet', piggy(0)), ['animal_love:direct:1', 'pet_only:commit:1']);
    assert.equal(state.caps[capKeyFor(FEED_CAP, 'npc_piggy:feed', piggy(0))], 3);
    // Batterflies: three each, keyed by street and slot.
    const bat = { animal: 'GLI32G3NUTD100I:batterfly:0' };
    for (let i = 0; i < 3; i += 1) assert.deepEqual(rows('npc_batterfly:feed', bat), ['animal_love:direct:1']);
    assert.deepEqual(rows('npc_batterfly:feed', bat), []);
    // A feed with no animal named shares one cap per class: never more than one animal's worth.
    const unnamed = normalizeSoloFeatState({});
    const counted = Array.from({ length: 5 }, () => featEventIncrements(unnamed, 'npc_piggy:feed:cherry').length).filter(Boolean).length;
    assert.equal(counted, 3);
  });

  it('keeps the caps through a save', () => {
    const state = normalizeSoloFeatState({});
    for (let i = 0; i < 3; i += 1) featEventIncrements(state, 'npc_batterfly:feed', 1, { animal: 'T:batterfly:0' });
    const back = normalizeSoloFeatState(JSON.parse(JSON.stringify(state)));
    assert.deepEqual(featEventIncrements(back, 'npc_batterfly:feed', 1, { animal: 'T:batterfly:0' }), []);
  });

  it('counts a fourth feed of the same Piggy for nothing in the feature', () => {
    const engine = fakeEngine({ param: (k) => ({ featdemo: 'animal_love', featprogress: '0', featreset: '1' })[k] ?? null });
    soloFeatsFeature.restore(undefined, engine);
    soloFeatsFeature.onStreetEnter({ tsid: 'GLI32G3NUTD100I' }, engine);
    for (let i = 0; i < 4; i += 1) soloFeatsFeature.onEvent('npc_piggy:feed:cherry', 1, engine, piggy(2));
    assert.equal(soloFeatsFeature.save().progress.animal_love.value, 3);
    assert.equal(soloFeatsFeature.save().pending, 3);
    soloFeatsFeature.onEvent('npc_piggy:feed:cherry', 1, engine, piggy(3));
    assert.equal(soloFeatsFeature.save().progress.animal_love.value, 4);
  });

  it('passes the animal from the verb sites into the event', () => {
    const game = readFileSync(join(ROOT, 'public', 'game.js'), 'utf8');
    assert.match(game, /animalKey: `\$\{currentStreetTsid\}:npc_piggy:\$\{i\}`/);
    assert.match(game, /const verbDetail = target\.animalKey \? \{ animal: target\.animalKey \} : undefined;/);
    assert.match(game, /emitGameEvent\(verbEvent, 1, verbDetail\)/);
    assert.match(game, /function emitGameEvent\(counter, amount = 1, detail = undefined\) \{\s*features\.event\(counter, amount, engine, detail\);/);
    assert.match(game, /achievement\(counter, amount = 1, detail = undefined\) \{\s*announceAchievementUpdates\(applyAchievementProgress\(achieveState, counter, amount, pc, detail\)\);/);
    const host = readFileSync(join(ROOT, 'public', 'js', 'feature-host.js'), 'utf8');
    assert.match(host, /event\(counter, amount, engine, detail\) \{\s*each\('onEvent', counter, amount, engine, detail\);/);
    const husbandry = readFileSync(join(ROOT, 'public', 'js', 'features', 'animal-husbandry-feature.js'), 'utf8');
    assert.match(husbandry, /emit\(engine, 'npc_batterfly:feed', 1, \{ animal: `\$\{engine\.streetTsid \|\| ''\}:\$\{entity\.key\}` \}\)/);
  });

  it('hands the detail to every onEvent through the feature host', async () => {
    const { createFeatureHost } = await import('../public/js/feature-host.js');
    const seen = [];
    const host = createFeatureHost([{ id: 't', onEvent: (...args) => seen.push(args) }]);
    host.event('npc_batterfly:feed', 1, 'E', { animal: 'x' });
    assert.deepEqual(seen, [['npc_batterfly:feed', 1, 'E', { animal: 'x' }]]);
  });

  it('sends fertilidust:trees_grown only when living trees took the dust', () => {
    const src = readFileSync(join(ROOT, 'public', 'js', 'features', 'powders-feature.js'), 'utf8');
    const at = src.indexOf('  fertilidust(engine, classTsid) {');
    const body = src.slice(at, src.indexOf('\n  fertilidust_lite(', at));
    assert.match(body, /if \(trees\.length\) engine\.achievement\('fertilidust:trees_grown', 1\);/);
  });
});

describe('G171: Feats open again each game week', () => {
  const WEEK = GAME_WEEK_MS;
  const finish = (state, id, at) => incrementFeat(state, id, FEAT_BY_ID[id].goal, {}, at);

  it('uses the remake calendar week: eight game days of four hours', () => {
    assert.equal(DAY_NAMES.length, 8);
    assert.equal(GAME_WEEK_DAYS, 8);
    assert.equal(GAME_WEEK_MS, 8 * GAME_DAY_MS);
    assert.equal(GAME_WEEK_MS, 32 * 60 * 60 * 1000);
  });

  it('shows Done with when it opens again, then reopens at 0 a week after the finish', () => {
    const state = normalizeSoloFeatState({ openedAt: 1000 });
    const t0 = 5_000_000;
    const done = finish(state, 'tottlys_toys', t0);
    assert.equal(done.completed, true);
    assert.equal(done.run, 1);
    assert.equal(done.reopensAt, t0 + WEEK);
    const row = featRows(state).find((r) => r.id === 'tottlys_toys');
    assert.equal(row.complete, true);
    assert.equal(row.reopensAt, t0 + WEEK);
    assert.equal(reopenText(row.reopensAt, t0), 'Opens again in 8 game days (about 32 hours).');
    assert.equal(reopenText(row.reopensAt, t0 + 2 * GAME_DAY_MS + 5000), 'Opens again in 6 game days (about 24 hours).');
    assert.equal(reopenText(row.reopensAt, t0 + WEEK - 30 * 60_000), 'Opens again in about 30 minutes.');
    assert.equal(incrementFeat(state, 'tottlys_toys', 1, {}, t0 + WEEK - 1).reason, 'complete');
    assert.deepEqual(reopenDueFeats(state, t0 + WEEK - 1), []);
    assert.deepEqual(reopenDueFeats(state, t0 + WEEK), ['tottlys_toys']);
    assert.equal(state.progress.tottlys_toys.value, 0);
    assert.equal(isFeatComplete(state, 'tottlys_toys'), false);
    assert.equal(reopensAt(state, 'tottlys_toys'), 0);
    assert.equal(state.progress.tottlys_toys.runs, 1);
  });

  it('gives another rock for the next finish, without the first-contribution badges', () => {
    const state = normalizeSoloFeatState({ openedAt: 1000 });
    const first = incrementFeat(state, 'qurazy_quoin_collecting', 1, {}, 2000);
    assert.ok(first.counters.some((c) => c.counter === 'feats:contributed'));
    assert.ok(first.grants.includes('quick_on_your_feat'));
    finish(state, 'qurazy_quoin_collecting', 3000);
    assert.equal(state.rocks, 1);
    // A week on, the next increment reopens it first. Quick on Your Feat and feats:contributed sit behind the first contribution ever (inc_feats.js:52).
    const again = incrementFeat(state, 'qurazy_quoin_collecting', 1, {}, 3000 + WEEK);
    assert.equal(again.reopened, true);
    assert.equal(again.counted, true);
    assert.equal(again.value, 1);
    assert.equal(again.firstContribution, false);
    assert.equal(again.vogText, '');
    assert.deepEqual(again.counters, []);
    assert.deepEqual(again.grants, ['down_to_the_wire']);
    const second = incrementFeat(state, 'qurazy_quoin_collecting', 2, {}, 4000 + WEEK);
    assert.equal(second.completed, true);
    assert.equal(second.run, 2);
    assert.equal(state.rocks, 2);
    // feats_gather_rewards counts each run; feats:contributed and the epic counters do not come back.
    assert.deepEqual(second.counters, [{ counter: 'feats:contributed_to', amount: 1 }]);
    assert.equal(state.progress.qurazy_quoin_collecting.runs, 2);
  });

  it('never counts an epic again on a repeat run', () => {
    const state = normalizeSoloFeatState({ openedAt: 1 });
    // Every epic keeps an unwired Feat, so epics_completed cannot fire solo; a repeat must not add any epic counter either.
    for (const epic of [2, 4]) assert.ok(WIRED_FEATS.filter((f) => f.epic_id === epic).length < SOLO_FEATS.filter((f) => f.epic_id === epic).length);
    const t = 10_000;
    const a = finish(state, 'hi_signs_1', t);
    assert.ok(!a.counters.some((c) => c.counter.startsWith('epics_completed')));
    const b = finish(state, 'hi_signs_1', t + WEEK + 1);
    assert.equal(b.run, 2);
    assert.ok(!b.counters.some((c) => c.counter.startsWith('epics_completed') || c.counter.startsWith('epics_contributed')));
  });

  it('frees the per-animal caps of the reopened Feat only', () => {
    const state = normalizeSoloFeatState({ openedAt: 1 });
    state.caps['crab:GX:hug'] = 1;
    state.caps['kitty:GX:k0'] = 3;
    state.caps['times_fed_for_feat:GX:npc_piggy:0'] = 3;
    state.caps['other:thing'] = 1;
    finish(state, 'tottlys_toys', 100);
    reopenDueFeats(state, 100 + WEEK);
    assert.equal(Object.keys(state.caps).length, 4, 'a toy Feat owns no caps');
    finish(state, 'animal_love', 200);
    assert.equal(incrementFeat(state, 'animal_love', 1, { cap: { key: 'crab:GX:hug', max: 1 } }, 300).reason, 'complete');
    reopenDueFeats(state, 200 + WEEK);
    assert.deepEqual(Object.keys(state.caps), ['other:thing']);
    assert.equal(incrementFeat(state, 'animal_love', 1, { cap: { key: 'crab:GX:hug', max: 1 } }, 201 + WEEK).counted, true);
    for (const owner of CAP_OWNERS) assert.ok(owner.feats.every((id) => FEAT_BY_ID[id]?.wired), owner.prefix);
  });

  it('names every cap prefix the call sites use', () => {
    const src = (f) => readFileSync(join(ROOT, 'public/js/features', f), 'utf8');
    assert.match(src('crabs-feature.js'), /key: `crab:/);
    assert.match(src('heli-kitties-feature.js'), /key: `kitty:/);
    assert.equal(FEED_CAP.name, 'times_fed_for_feat');
    const prefixes = CAP_OWNERS.map((o) => o.prefix);
    for (const p of ['crab:', 'kitty:', 'times_fed_for_feat:']) assert.ok(prefixes.includes(p), p);
  });

  it('keeps old saves finished, and opens them a week after the stored finish', () => {
    // A G143 save: value at goal, completedAt set, no runs.
    const old = normalizeSoloFeatState({ progress: { streaking: { value: 5, contributedAt: 10, completedAt: 1_000_000 } } });
    assert.equal(isFeatComplete(old, 'streaking'), true);
    assert.equal(old.progress.streaking.runs, 1);
    assert.equal(reopensAt(old, 'streaking'), 1_000_000 + WEEK);
    assert.deepEqual(reopenDueFeats(old, 1_000_000 + WEEK - 1), []);
    assert.deepEqual(reopenDueFeats(old, 1_000_000 + WEEK), ['streaking']);
    // No completedAt at all: it reads as finished at time 1, so it is open again at once.
    const bare = normalizeSoloFeatState({ progress: { streaking: { value: 5 } } });
    assert.equal(bare.progress.streaking.completedAt, 1);
    assert.deepEqual(reopenDueFeats(bare, Date.now()), ['streaking']);
    // A reopened run keeps its finish and run count through a save.
    const again = normalizeSoloFeatState(JSON.parse(JSON.stringify(old)));
    assert.deepEqual(again.progress.streaking, { value: 0, contributedAt: 10, completedAt: 1_000_000, runs: 1 });
  });

  it('opens a stored Feat again in the feature and gives a second rock', () => {
    const engine = fakeEngine();
    const at = Date.now() - WEEK - 60_000;
    soloFeatsFeature.restore({ openedAt: at - 10, rocks: 1, progress: { tottlys_toys: { value: 10, contributedAt: at - 5, completedAt: at } } }, engine);
    soloFeatsFeature.onTick(16, 1_000_000, engine);
    assert.match(engine.calls.activity.join('\n'), /The Feat "Tottly's Toys" is open again, for another Small Petrified Rock\./);
    assert.match(engine.calls.data.soloFeats, /tottlys_toys:0\/10/);
    assert.equal(soloFeatsFeature.featsIncrement('tottlys_toys', 10, {}, engine), 10);
    assert.equal(engine.inv.petrified_rock_small, 1);
    assert.equal(soloFeatsFeature.save().rocks, 2);
    assert.equal(engine.calls.data.soloFeatRuns.includes('tottlys_toys:2'), true);
    assert.ok(!engine.calls.grant.includes('quick_on_your_feat'));
    assert.ok(!engine.calls.achievement.some(([c]) => c === 'feats:contributed'));
    assert.ok(engine.calls.achievement.some(([c]) => c === 'feats:contributed_to'));
    assert.match(engine.calls.activity.join('\n'), /opens again in a game week/);
    const reopen = Number(engine.calls.data.soloFeatReopens.split(':')[1]);
    assert.ok(reopen > WEEK - 5000 && reopen <= WEEK, String(reopen));
  });

  it('QA route: featweekago reopens the Feat, featdoneago leaves it Done', () => {
    const run = (params) => {
      const engine = fakeEngine({ param: (k) => params[k] ?? null });
      soloFeatsFeature.restore(undefined, engine);
      soloFeatsFeature.onStreetEnter({ tsid: 'GLI32G3NUTD100I' }, engine);
      return engine;
    };
    const week = run({ featdemo: 'animal_love', featweekago: '1' });
    assert.match(week.calls.data.soloFeats, /animal_love:0\/50/);
    assert.match(week.calls.activity.join('\n'), /is open again/);
    const nearly = run({ featdemo: 'animal_love', featweekago: '1', featprogress: '49' });
    assert.match(nearly.calls.data.soloFeats, /animal_love:49\/50/);
    assert.equal(soloFeatsFeature.featsIncrement('animal_love', 1, {}, nearly), 1);
    assert.equal(nearly.inv.petrified_rock_small, 1);
    assert.match(nearly.calls.data.soloFeatRuns, /animal_love:2/);
    assert.ok(!nearly.calls.grant.includes('quick_on_your_feat'));
    const done = run({ featdemo: 'animal_love', featdoneago: '2' });
    assert.match(done.calls.data.soloFeats, /animal_love:50\/50/);
    const left = Number(done.calls.data.soloFeatReopens.split(':')[1]);
    assert.ok(Math.abs(left - 6 * GAME_DAY_MS) < 5000, String(left));
  });
});
