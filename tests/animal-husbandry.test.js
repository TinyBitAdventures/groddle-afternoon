import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  AK_DROP_TABLE_IDS,
  akDropItems,
  BATTERFLY,
  HERDKEEPING,
  INCUBATION,
  REMOTE_MACHINES,
  STICK_DISTANCE,
  advanceYard,
  applyKinshipDrop,
  batterflyCountForStreet,
  canNameAnimal,
  capturePiggy,
  captureVerbState,
  collectMachine,
  createMachine,
  depositFeeder,
  drainPlops,
  examinePlop,
  feedBaby,
  feedBatterfly,
  feedPiggyStack,
  guanoForFoodCounter,
  hatchIncubation,
  hogtieEscapeDelayMs,
  husbandryPack,
  incubationPhase,
  isBatterflyHabitat,
  machineIntervalMs,
  nameAnimal,
  namedAnimalLabel,
  namingVerbs,
  normalizeHusbandryPack,
  passiveGuano,
  queuePlops,
  releaseHogtied,
  sanitizeAnimalName,
  startIncubation,
  stepHogtie,
  stickPlaceState,
  takePlop,
} from '../public/js/animal-husbandry.js?v=g414-1';
import { pickerMaxCount, pickerOptionsFor, pickerTakesCount, listAnimalFeedOptions, createAnimalState } from '../public/js/animals.js?v=g414-1';
import { getVerbsFor, runVerb } from '../public/content.js?v=g414-1';
import { batterflyPlacementGroups, normalizeHusbandrySlot } from '../public/js/features/animal-husbandry-feature.js?v=g430-1';

const here = dirname(fileURLToPath(import.meta.url));
const publicDir = join(here, '../public');
const seq = (...values) => {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)];
};

describe('Batterflies and Guano (npc_batterfly.js)', () => {
  it('releases guano at the source base-cost thresholds and upgrades', () => {
    assert.deepEqual(guanoForFoodCounter(14), { guano: 0, response: 'feed_no_guano' });
    assert.equal(guanoForFoodCounter(15).guano, 1);
    assert.equal(guanoForFoodCounter(50).guano, 2);
    assert.equal(guanoForFoodCounter(99).guano, 2);
    assert.equal(guanoForFoodCounter(100).guano, 3);
    assert.equal(guanoForFoodCounter(50, ['batterfly_bonus_guano']).guano, 3);
    assert.equal(guanoForFoodCounter(80, ['batterfly_bonus_guano_2']).guano, 5);
  });

  it('accumulates food value across feeds and resets when it poops', () => {
    const state = {};
    const inv = { cherry: 20, meat: 10 };
    let res = feedBatterfly(state, inv, 'cherry', 14, { rng: () => 0 });
    assert.equal(res.ok, true);
    assert.equal(res.guano, 0);
    assert.equal(state.foodCounter, 14);
    res = feedBatterfly(state, inv, 'cherry', 1, { rng: () => 0 });
    assert.equal(res.guano, 1);
    assert.equal(state.foodCounter, 0);
    assert.equal(inv.cherry, 5);
    res = feedBatterfly(state, inv, 'meat', 10, { rng: () => 0 });
    assert.equal(res.guano, 3);
    assert.match(res.msg, /You fed the Batterfly 10 Meat.*"released" 3 guano/);
    assert.equal(feedBatterfly(state, inv, 'meat', 1).ok, false);
  });

  it('drops one guano an hour while the street holds fewer than 10', () => {
    const state = {};
    const t0 = 1_000_000;
    assert.equal(passiveGuano(state, t0, 0), 0);
    assert.equal(passiveGuano(state, t0 + BATTERFLY.passiveIntervalMs - 1, 0), 0);
    assert.equal(passiveGuano(state, t0 + 3 * BATTERFLY.passiveIntervalMs, 0), 3);
    assert.equal(passiveGuano(state, t0 + 20 * BATTERFLY.passiveIntervalMs, 8), 2);
  });

  it('lives on cave and cavern streets only, one or two per street', () => {
    assert.equal(isBatterflyHabitat({ label: 'Lapulapu Caverns', hubName: 'Old Groddle Forest' }), true);
    assert.equal(isBatterflyHabitat({ label: 'Dokk Rokk', internalLabel: 'nottis_cavern_07', hubName: 'Nottis' }), true);
    assert.equal(isBatterflyHabitat({ label: 'Churni Sanctum', hubName: 'Ilmenskie Deeps' }), true);
    assert.equal(isBatterflyHabitat({ label: 'Hechey Track', hubName: 'Groddle Forest' }), false);
    const index = JSON.parse(readFileSync(join(publicDir, 'assets/streets/index.json'), 'utf8')).streets;
    const counts = Object.entries(index).map(([tsid, row]) => batterflyCountForStreet({ tsid, ...row }));
    const habitat = counts.filter(Boolean);
    // 52 since G184 put Oktyabrya in Uralia, its own location hub (was Groddle Forest).
    assert.equal(habitat.length, 52);
    assert.ok(habitat.every((n) => n === 1 || n === 2));
    assert.deepEqual(batterflyPlacementGroups({ tsid: 'GA9114MS8B32FB2', label: 'Churni Sanctum', hubName: 'Ilmenskie Deeps' })[0].key, 'batterfly');
  });
});

describe('Piggy feeding and Piggy Plop (npc_animal feed, plop.js)', () => {
  it('feeds a whole stack, gives 2 XP only for hungry 5+ base-cost food, and queues plops per 3 crops', () => {
    const state = { hunger: 1 };
    let res = feedPiggyStack(state, 'potato', 9);
    assert.equal(res.count, 9);
    assert.equal(res.xp, 2);
    assert.equal(state.hunger, 0);
    assert.deepEqual(res.plops, [{ type: 'seed_potato', num: 3 }]);
    assert.equal(state.crops.seed_potato, 0);
    res = feedPiggyStack(state, 'potato', 1);
    assert.equal(res.xp, 0, 'not hungry any more');
    assert.deepEqual(res.plops, []);
    res = feedPiggyStack(state, 'potato', 2);
    assert.deepEqual(res.plops, [{ type: 'seed_potato', num: 1 }], 'the counter reached 3 across feeds; num is this feed / 3');
    assert.deepEqual(feedPiggyStack({}, 'pumpkin', 1).plops, [{ type: 'seed_pumpkin', num: 2 }]);
    assert.deepEqual(feedPiggyStack({}, 'cherry', 5).plops, [], 'cherries are not crops');
    assert.equal(feedPiggyStack({}, 'pumpkin', 50).count, 11, 'one stack (pumpkin stackmax 11)');
  });

  it('plops 2-7 seeds at a time, five seconds apart', () => {
    const queue = [{ type: 'seed_corn', num: 10 }];
    assert.deepEqual(takePlop(queue, () => 0), { seedClass: 'seed_corn', seedCount: 2, more: true });
    assert.equal(queue[0].num, 8);
    assert.equal(takePlop(queue, () => 0.999).seedCount, 7);
    assert.deepEqual(takePlop(queue, () => 0.999), { seedClass: 'seed_corn', seedCount: 1, more: false });
    const target = {};
    queuePlops(target, [{ type: 'seed_carrot', num: 9 }], 1000);
    const first = drainPlops(1000, () => 0);
    assert.equal(first.length, 1);
    assert.equal(drainPlops(5999, () => 0).length, 0);
    assert.equal(drainPlops(6000, () => 0).length, 1);
  });

  it('examines a plop into its seeds (default one Corn Seed)', () => {
    assert.deepEqual(examinePlop({ seedClass: 'seed_potato', seedCount: 4 }).seedCount, 4);
    const fallback = examinePlop({ seedCount: 0 });
    assert.equal(fallback.seedClass, 'seed_corn');
    assert.equal(fallback.seedCount, 1);
  });

  it('Feed asks how many for a Piggy and the content verb feeds the stack', () => {
    assert.equal(pickerTakesCount('npc_piggy', 'feed'), true);
    assert.equal(pickerTakesCount('npc_chicken', 'feed'), false);
    assert.equal(pickerTakesCount('npc_batterfly', 'feed'), true);
    assert.equal(pickerTakesCount('piggy_feeder', 'deposit'), true);
    assert.equal(pickerMaxCount('npc_piggy', 'pumpkin', { pumpkin: 40 }), 11);
    const target = { classId: 'npc_piggy', state: createAnimalState('npc_piggy') };
    const inv = { potato: 12 };
    const pc = { energy: 80, mood: 50, imagination: 0, xp: 0 };
    const result = runVerb(target, 'feed:potato:9', { pc, inv });
    assert.equal(result.ok, true);
    assert.equal(inv.potato, 3);
    assert.equal(result.fedCount, 9);
    assert.deepEqual(result.plops, [{ type: 'seed_potato', num: 3 }]);
    assert.match(result.msgs[0], /You fed the Piggy 9 potato/i);
    assert.ok(listAnimalFeedOptions('npc_batterfly', { meat: 1, plank: 2 }).some((o) => o.classTsid === 'meat'));
    assert.ok(!listAnimalFeedOptions('npc_batterfly', { meat: 1, plank: 2 }).some((o) => o.classTsid === 'plank'));
  });
});

describe('Incubation and baby animals (npc_chicken.js, chick/piglet/caterpillar.js)', () => {
  it('needs Animal Husbandry, takes one egg, and hatches after 60 s', () => {
    const chicken = { classId: 'npc_chicken', state: createAnimalState('npc_chicken') };
    const pc = { energy: 80, mood: 50 };
    assert.equal(getVerbsFor(chicken, { pc, inv: {} }).some((v) => v.id === 'incubate'), false);
    const verb = getVerbsFor(chicken, { pc, inv: { chicken_egg: 1 }, learned: [INCUBATION.skill] }).find((v) => v.id === 'incubate');
    assert.equal(verb.picker, 'incubate');
    assert.deepEqual(pickerOptionsFor('npc_chicken', 'incubate', { chicken_egg: 1, egg_plain: 3 }).map((o) => o.classTsid), ['chicken_egg']);
    const inv = { butterfly_egg: 1 };
    const res = runVerb(chicken, 'incubate:butterfly_egg', { pc, inv, learned: [INCUBATION.skill], rng: () => 0 });
    assert.equal(res.ok, true);
    assert.equal(inv.butterfly_egg, 0);
    const busy = getVerbsFor(chicken, { pc, inv, learned: [INCUBATION.skill] }).find((v) => v.id === 'incubate');
    assert.equal(busy.enabled, false);
    const t = chicken.state.incubationStartedAt;
    assert.equal(incubationPhase(chicken.state, t + 29_999), 'sitting');
    assert.equal(incubationPhase(chicken.state, t + 30_000), 'halfway');
    assert.equal(incubationPhase(chicken.state, t + 60_000), 'complete');
    const hatched = hatchIncubation(chicken.state, inv, { rng: () => 0.5 });
    assert.equal(hatched.itemClass, 'caterpillar');
    assert.equal(hatched.count, 1);
    assert.equal(hatched.counter, 'eggs_incubated:butterfly_egg');
    assert.equal(inv.caterpillar, 1);
    assert.equal(chicken.state.incubatingEgg, undefined);
    assert.equal(startIncubation({}, { chicken_egg: 1 }, 'chicken_egg', 0).ok, true);
    const twins = {};
    startIncubation(twins, { piggy_egg: 1 }, 'piggy_egg', 0);
    const twinInv = {};
    assert.equal(hatchIncubation(twins, twinInv, { upgrades: ['animal_husbandry_twin_animals_2'], rng: () => 0.05 }).count, 2);
    assert.equal(twinInv.piglet, 2);
  });

  it('grows babies on the source feed counts', () => {
    normalizeHusbandryPack({});
    const inv = { chick: 1, grain: 12, caterpillar: 1, tiny_bubble: 1, piglet: 1, potato: 3, apple: 2 };
    for (let i = 0; i < 9; i += 1) assert.equal(feedBaby('chick', inv, 'grain').grew, null);
    const grown = feedBaby('chick', inv, 'grain');
    assert.equal(grown.grew, 'npc_chicken');
    assert.equal(grown.counter, 'animals_grown:chick');
    assert.equal(inv.chick, 0);
    assert.equal(feedBaby('caterpillar', inv, 'tiny_bubble').grew, 'npc_butterfly');
    assert.equal(feedBaby('piglet', inv, 'apple').ok, false, 'piglets eat crops');
    feedBaby('piglet', inv, 'potato');
    feedBaby('piglet', inv, 'potato');
    assert.equal(feedBaby('piglet', inv, 'potato').grew, 'npc_piggy');
  });
});

describe('Naming (animal_naming.js)', () => {
  it('needs Animal Kinship V, cleans names, and waits an hour before others rename', () => {
    const ctx = { learned: ['animalkinship_5'], playerId: 'player', nowS: 1000 };
    assert.equal(canNameAnimal({}, { ...ctx, learned: [] }), false);
    assert.equal(sanitizeAnimalName('Wil-bur! The 3rd ' + 'x'.repeat(40)).length <= 32, true);
    assert.equal(sanitizeAnimalName('Wil-bur!'), 'Wilbur');
    const state = {};
    const res = nameAnimal('npc_piggy', state, 'Wilbur', ctx);
    assert.equal(res.ok, true);
    assert.equal(res.counter, 'animals_named:npc_piggy');
    assert.equal(res.bubble, 'And they shall call me "Wilbur"');
    assert.equal(namedAnimalLabel('npc_piggy', state), 'A Piggy Named Wilbur');
    assert.equal(canNameAnimal(state, { ...ctx, playerId: 'someone', nowS: 2000 }), false);
    assert.equal(canNameAnimal(state, { ...ctx, playerId: 'someone', nowS: 4601 }), true);
    assert.deepEqual(namingVerbs('npc_piggy', state, ctx).map((v) => v.id), ['rename']);
    const piggy = { classId: 'npc_piggy', state: createAnimalState('npc_piggy') };
    const verbs = getVerbsFor(piggy, { pc: { energy: 80, mood: 50 }, inv: {}, learned: ['animalkinship_5'] });
    assert.ok(verbs.some((v) => v.id === 'name'));
  });
});

describe('Herdkeeping (npc_piggy capture, hogtied_piggy.js)', () => {
  it('gates capture in source order and rewards success', () => {
    normalizeHusbandryPack({});
    const learned = [HERDKEEPING.skill];
    assert.equal(captureVerbState({ inv: { hogtied_piggy: 1 }, learned, energy: 50 }).reason, HERDKEEPING.handsFull);
    assert.equal(captureVerbState({ inv: {}, learned: [], energy: 50 }).reason, HERDKEEPING.noSkill);
    assert.equal(captureVerbState({ inv: {}, learned, energy: 20 }).reason, HERDKEEPING.noEnergy);
    const pc = { energy: 60, mood: 10, xp: 0, imagination: 0 };
    const inv = { pig_bait: 2 };
    const res = capturePiggy({ userName: 'Wilbur' }, { pc, inv, learned, streetTsid: 'S1', now: 1000, rng: () => 0.5 });
    assert.equal(res.ok, true);
    assert.equal(inv.pig_bait, 1);
    assert.equal(inv.hogtied_piggy, 1);
    assert.equal(pc.energy, 40);
    assert.equal(pc.mood, 40);
    // 50 iMG at 40% mood: stats_xp_apply_bonus x0.75 (G148, js/mood-xp.js).
    assert.equal(pc.xp, 38);
    assert.equal(res.questCounter, 'pigs_hogtied');
    assert.equal(captureVerbState({ inv: {}, learned, energy: 50, streetTsid: 'S1', now: 2000 }).reason, HERDKEEPING.locationLimit);
    assert.equal(captureVerbState({ inv: {}, learned, energy: 50, streetTsid: 'S2', now: 2000 }).reason, HERDKEEPING.exhausted);
    assert.equal(captureVerbState({ inv: {}, learned, energy: 50, streetTsid: 'S2', now: 1000 + HERDKEEPING.cooldownMs }).enabled, true);
    const step = stepHogtie(inv, 1000 + 61_000);
    assert.equal(step.xp, 2);
    const released = releaseHogtied(inv, () => 0);
    assert.equal(released.ok, true);
    assert.equal(released.name, 'Wilbur');
    assert.equal(inv.hogtied_piggy, 0);
  });

  it('fails 25% of the time for 30 mood, and escapes on a geometric five-minute timer', () => {
    normalizeHusbandryPack({});
    const pc = { energy: 60, mood: 50 };
    const inv = { pig_bait: 1 };
    const res = capturePiggy({}, { pc, inv, learned: [HERDKEEPING.skill], streetTsid: 'S9', now: 0, rng: seq(0.9, 0) });
    assert.equal(res.ok, false);
    assert.equal(pc.mood, 20);
    assert.equal(inv.pig_bait, 0);
    assert.equal(hogtieEscapeDelayMs(1 / 6, () => 0.9), 5 * 60 * 1000);
    assert.ok(hogtieEscapeDelayMs(1 / 6, () => 0.01) > 60 * 60 * 1000);
  });

  it('places Magic Sticks only on land you own', () => {
    assert.equal(stickPlaceState('magic_pig_stick', { learned: [HERDKEEPING.skill], ownYard: false }).enabled, false);
    assert.equal(stickPlaceState('magic_pig_stick', { learned: [], ownYard: true }).enabled, false);
    assert.equal(stickPlaceState('magic_pig_stick', { learned: [HERDKEEPING.skill], ownYard: true }).enabled, true);
    assert.equal(stickPlaceState('magic_pig_stick', { learned: [HERDKEEPING.skill], ownYard: true, placed: [{ classTsid: 'magic_pig_stick' }] }).enabled, false);
    assert.equal(STICK_DISTANCE, 250);
  });
});

describe('Remote Herdkeeping (meat_collector.js, butterfly_milker.js, piggy_feeder.js)', () => {
  it('fills on the 24-minute round from fed piggies and butterflies, and reports full once', () => {
    const t0 = 0;
    const yard = {
      animals: [
        { classId: 'npc_piggy', state: { hunger: 0, hungerAt: t0 + 10 * 60 * 60 * 1000 } },
        { classId: 'npc_piggy', state: { hunger: 3, hungerAt: t0 + 10 * 60 * 60 * 1000 } },
        { classId: 'npc_butterfly', state: {} },
      ],
      machines: [createMachine('meat_collector', 100, t0), createMachine('butterfly_milker', 200, t0), createMachine('piggy_feeder', 300, t0)],
    };
    assert.equal(machineIntervalMs('meat_collector'), 24 * 60 * 1000);
    assert.equal(machineIntervalMs('meat_collector', ['remoteherdkeeping_production_2']), 20 * 60 * 1000);
    advanceYard(yard, t0 + 24 * 60 * 1000 * 5, { rng: () => 0.99 });
    assert.equal(yard.machines[0].inside, 5, 'only the fed piggy gives meat');
    assert.equal(yard.machines[1].inside, 5);
    assert.equal(yard.animals[2].state.lifePoints, 395);
    // Hunger returns every half game day; a stocked Piggy Feeder keeps both piggies fed.
    yard.machines[2].inside = 80;
    const events = advanceYard(yard, t0 + 24 * 60 * 1000 * 200, { rng: () => 0.99 });
    assert.deepEqual(events.filter((e) => e.type === 'full').map((e) => e.classTsid).sort(), ['butterfly_milker', 'meat_collector']);
    assert.equal(yard.machines[0].inside, REMOTE_MACHINES.meat_collector.capacity);
    assert.equal(yard.machines[1].inside, REMOTE_MACHINES.butterfly_milker.capacity);
    assert.equal(advanceYard(yard, t0 + 24 * 60 * 1000 * 300).filter((e) => e.type === 'full').length, 0);
    const inv = {};
    assert.equal(collectMachine(yard.machines[0], inv, []).ok, false);
    const got = collectMachine(yard.machines[0], inv, ['remoteherdkeeping_1']);
    assert.equal(got.count, 60);
    assert.equal(inv.meat, 60);
    assert.equal(got.questCounter, 'meat_collected');
  });

  it('feeds hungry piggies from the Piggy Feeder every 20 minutes', () => {
    const feeder = createMachine('piggy_feeder', 0, 0);
    const inv = { potato: 100 };
    assert.equal(depositFeeder(feeder, inv, 'potato', 100, []).ok, false);
    const dep = depositFeeder(feeder, inv, 'potato', 100, ['remoteherdkeeping_1']);
    assert.equal(dep.count, 80);
    assert.equal(inv.potato, 20);
    const yard = {
      animals: [{ classId: 'npc_piggy', state: { hunger: 2, hungerAt: 1e12 } }],
      machines: [feeder, createMachine('meat_collector', -50, 0)],
    };
    advanceYard(yard, 25 * 60 * 1000, { rng: () => 0.99 });
    assert.equal(feeder.inside, 79);
    assert.equal(yard.animals[0].state.hunger, 0);
    assert.equal(yard.machines[1].inside, 1, 'fed at 20 min, collected at 24 min');
  });
});

describe('Animal Kinship drop tables (catalog_drop_tables.js)', () => {
  it('rolls the shared squeeze and bacon tables at the package drop chance', () => {
    assert.deepEqual([...AK_DROP_TABLE_IDS], ['ak_chicken_squeeze', 'ak_chicken_squeeze_seasoned_eggs', 'bacon']);
    const drops = akDropItems();
    for (const id of ['eggy_scramble', 'musicblock_d_blue_01', 'gameshow_ticket', 'piggy_egg', 'butterfly_egg', 'chicken_egg', 'bacon']) assert.ok(drops.has(id), id);
    const inv = {};
    const pc = { currants: 0 };
    assert.equal(applyKinshipDrop({ dropClassId: 'bacon', dropChance: 15 }, { pc, inv, rng: () => 0.5 }), null);
    const drop = applyKinshipDrop({ dropClassId: 'bacon', dropChance: 15 }, { pc, inv, rng: () => 0.1 });
    assert.deepEqual(drop.items, { bacon: 1 });
    assert.equal(inv.bacon, 1);
    // drop chance roll, then randInt(0, 100) = 60 lands on the 63 row (DB-1).
    const music = applyKinshipDrop({ dropClassId: 'ak_chicken_squeeze', dropChance: 6 }, { pc, inv, rng: seq(0.01, 60 / 101) });
    assert.equal(music.musicblock, true);
    assert.deepEqual(music.items, { musicblock_d_blue_01: 1 });
    const eggs = applyKinshipDrop({ dropClassId: 'ak_chicken_squeeze', dropChance: 6 }, { pc, inv, rng: seq(0.01, 0.999, 0.7) });
    assert.deepEqual(eggs.items, { piggy_egg: 1 });
  });
});

describe('Animal husbandry wiring', () => {
  it('saves pack side tables and normalizes street slots', () => {
    const pack = normalizeHusbandryPack({ plops: [{ seedClass: 'seed_corn', seedCount: 3 }], babies: { chick: [4] }, hogtie: { escapeAt: 5 } });
    assert.equal(husbandryPack(), pack);
    assert.equal(pack.plops.length, 1);
    assert.deepEqual(pack.babies.chick, [4]);
    const slot = normalizeHusbandrySlot({ animals: [{ classId: 'npc_piggy' }, { classId: 'npc_kitty' }], machines: [{ classTsid: 'meat_collector' }, { classTsid: 'x' }] });
    assert.equal(slot.animals.length, 1);
    assert.equal(slot.machines.length, 1);
    assert.deepEqual(slot.guano, []);
  });

  it('registers the feature, the picker count step, the event emits, and the unskipped machine recipes', () => {
    const index = readFileSync(join(publicDir, 'js/features/index.js'), 'utf8');
    assert.match(index, /animalHusbandryFeature/);
    const html = readFileSync(join(publicDir, 'play/index.html'), 'utf8');
    assert.match(html, /id="feed-picker-qty"/);
    const game = readFileSync(join(publicDir, 'game.js'), 'utf8');
    assert.match(game, /animal_max_reward:\$\{target\.classId\}/);
    assert.match(game, /skill_package_drop:\$\{target\.classId\}/);
    assert.match(game, /openPicker: \(target, verb\) => openFeedPicker\(target, verb\)/);
    const recipes = JSON.parse(readFileSync(join(publicDir, 'assets/content/recipes.json'), 'utf8'));
    const outputs = Object.values(recipes.recipes || recipes).flatMap((r) => (r.outputs || []).map((o) => o.classTsid));
    for (const id of ['meat_collector', 'butterfly_milker', 'piggy_feeder']) assert.ok(outputs.includes(id), id);
  });

  it('makes Guano, Piggy Plop, Caterpillars and Hog-tied Piggies obtainable for street projects', async () => {
    const { obtainableItems } = await import('../tools/job-obtainable.mjs');
    const { items } = await obtainableItems();
    for (const id of ['guano', 'plop', 'caterpillar', 'chick', 'piglet', 'hogtied_piggy', 'meat_collector']) {
      assert.ok(items.has(id), id);
    }
  });
});

describe('Batterfly flight after feeding', () => {
  it('pauses the flight path while chewing, so it resumes in place instead of jumping ahead', () => {
    const src = readFileSync(new URL('../public/js/features/animal-husbandry-feature.js', import.meta.url), 'utf8');
    const step = src.slice(src.indexOf('function stepBatterfly'), src.indexOf('function chewBatterfly'));
    assert.ok(step.indexOf('if (entity.chewUntil) return;') < step.indexOf('entity.phase += dtMs / 1000;'));
  });
});
