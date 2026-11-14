/**
 * rules-a animals (2026-11-12): the incubating squeeze, Super Animal Harvest Bacon,
 * Rubeweed drops, handler refusals that stay clickable, missed-roll lines and the
 * hog-tie keeping today's pets. Sources: glitch-GameServerJS items/npc_chicken.js,
 * items/npc_piggy.js, items/npc_butterfly.js, items/hogtied_piggy.js,
 * players/inc_skill_packages.js, items/catalog_skill_packages.js.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  ANIMAL_KINSHIP_CLICK_REFUSALS,
  performAnimalKinship,
  quoteAnimalKinship,
  resolveAnimalKinshipPackage,
} from '../public/js/animal-kinship.js?v=e2a94c13';
import { createAnimalState } from '../public/js/animals.js?v=5af77017';
import { getVerbsFor, runVerb } from '../public/content.js?v=de8f27e6';
import { applyKinshipDrop, capturePiggy, HERDKEEPING, husbandryPack, normalizeHusbandryPack, releaseHogtied } from '../public/js/animal-husbandry.js?v=c1577210';

const pc = (seed = {}) => ({ energy: 100, mood: 40, imagination: 0, xp: 0, ...seed });
const AK = (n) => Array.from({ length: n }, (_, i) => `animalkinship_${i + 1}`);

describe('Chicken squeeze while incubating (npc_chicken.js 755-757)', () => {
  it('is refused first, before the daily limit', () => {
    const state = createAnimalState('npc_chicken');
    state.incubatingEgg = 'egg_plain';
    state.squeezeUsesToday = 99;
    const q = quoteAnimalKinship(state, 'npc_chicken', 'squeeze', { pc: pc(), learned: [] });
    assert.deepEqual([q.reason, q.msg], ['incubating', 'What kind of weirdo squeezes an incubating chicken?']);
    const target = { classId: 'npc_chicken', label: 'Chicken', state };
    const row = getVerbsFor(target, { pc: pc(), inv: {}, skills: { learned: [] } }).find((v) => v.id === 'squeeze');
    assert.equal(row.enabled, false);
    assert.equal(runVerb(target, 'squeeze', { pc: pc(), inv: {}, skills: { learned: [] }, rng: () => 0 }).ok, false);
  });
});

describe('Super Animal Harvest makes every nibble a 25% Bacon chance (catalog_skill_packages.js 425-446)', () => {
  it('at Animal Kinship IV, which has no Bacon of its own', () => {
    assert.equal(resolveAnimalKinshipPackage('npc_piggy', 'nibble', AK(4), []).dropClassId, '');
    const p = resolveAnimalKinshipPackage('npc_piggy', 'nibble', AK(4), ['animal_kinship_super_harvest_1']);
    assert.deepEqual([p.dropClassId, p.dropChance], ['bacon', 25]);
    const v = resolveAnimalKinshipPackage('npc_piggy', 'nibble', AK(5), ['animal_kinship_super_harvest_2']);
    assert.equal(v.dropChance, 25);
  });

  it('Luck of the Rube lifts it by 1.25 (inc_skill_packages.js 540)', () => {
    const profile = { dropClassId: 'bacon', dropChance: 25 };
    assert.equal(applyKinshipDrop(profile, { pc: pc(), inv: {}, rng: () => 0.3 }), null);
    assert.ok(applyKinshipDrop(profile, { pc: pc(), inv: {}, rng: () => 0.3, rubeweed: true }));
  });
});

describe('handler refusals stay clickable and say the source line', () => {
  it('too tired: "You\'re too tired to do that." (inc_skill_packages.js 176-179)', () => {
    const state = createAnimalState('npc_piggy');
    const q = quoteAnimalKinship(state, 'npc_piggy', 'pet', { pc: pc({ energy: 2 }), learned: [] });
    assert.deepEqual([q.reason, q.msg], ['energy', "You're too tired to do that."]);
    const row = getVerbsFor({ classId: 'npc_piggy', label: 'Piggy', state }, { pc: pc({ energy: 2 }), inv: {}, skills: { learned: [] } }).find((v) => v.id === 'pet');
    assert.deepEqual([row.enabled, row.durationMs], [true, 0]);
    assert.ok(ANIMAL_KINSHIP_CLICK_REFUSALS.includes('energy'));
  });

  it('a Butterfly milked with no massage: the full line, clickable (npc_butterfly.js 743)', () => {
    const state = createAnimalState('npc_butterfly');
    const target = { classId: 'npc_butterfly', label: 'Butterfly', state };
    const row = getVerbsFor(target, { pc: pc(), inv: {}, skills: { learned: [] } }).find((v) => v.id === 'milk');
    assert.equal(row.enabled, true);
    const r = runVerb(target, 'milk', { pc: pc(), inv: {}, skills: { learned: [] } });
    assert.equal(r.ok, false);
    // npc_butterfly.js 743-746: the line is in the verb message (buildVerbMessage, sendActivity), after the verb.
    assert.ok(r.msgs[0].startsWith('You try to milk a Butterfly. What? No warmup? No preamble?'));
  });

  it('a nibble before a pet is clickable (npc_piggy.js 892-900)', () => {
    const state = createAnimalState('npc_piggy');
    const row = getVerbsFor({ classId: 'npc_piggy', label: 'Piggy', state }, { pc: pc(), inv: {}, skills: { learned: ['animalkinship_2'] } }).find((v) => v.id === 'nibble');
    assert.deepEqual([row.enabled, row.durationMs], [true, 0]);
  });

  it('a petted Piggy not in the mood refuses before the energy check (875-880)', () => {
    const state = createAnimalState('npc_piggy');
    state.petUsesToday = 1;
    state.mood = 0;
    const r = performAnimalKinship(state, 'npc_piggy', 'nibble', { pc: pc({ energy: 1 }), learned: ['animalkinship_1'] });
    assert.equal(r.reason, 'not_in_mood');
  });
});

describe('a missed success roll (npc_piggy.js 1779, 1672; npc_chicken.js 1565-1572)', () => {
  it('pet and nibble add the source hint; a squeeze says nothing', () => {
    const piggy = { classId: 'npc_piggy', label: 'Piggy', state: createAnimalState('npc_piggy') };
    const pet = runVerb(piggy, 'pet', { pc: pc(), inv: {}, skills: { learned: [] }, rng: () => 0.99 });
    assert.equal(pet.ok, false);
    assert.match(pet.effects.activityLine, /Maybe you would have more luck if you felt some kinship with the Piggy\./);
    const chicken = { classId: 'npc_chicken', label: 'Chicken', state: createAnimalState('npc_chicken') };
    const sq = runVerb(chicken, 'squeeze', { pc: pc(), inv: {}, skills: { learned: [] }, rng: () => 0.99 });
    assert.equal(sq.ok, false);
    assert.equal(sq.speech, null);
    assert.ok(!sq.msgs.some((m) => /greased/.test(m)));
  });
});

describe('a hog-tied Piggy keeps today\'s pets and nibbles (npc_piggy.js 478-494, hogtied_piggy.js 197-213)', () => {
  it('the same game day: carried back; a later day: fresh; and through a reload', () => {
    normalizeHusbandryPack({});
    const learned = [HERDKEEPING.skill];
    const inv = { pig_bait: 2 };
    const now = Date.now();
    const res = capturePiggy({ petUsesToday: 1, nibbleUsesToday: 1, petted: true, nibbled: true }, { pc: pc({ energy: 60 }), inv, learned, streetTsid: 'S1', now, rng: () => 0.5 });
    assert.equal(res.ok, true);
    // A reload in between keeps it (the pack side table is saved).
    normalizeHusbandryPack(JSON.parse(JSON.stringify(husbandryPack())));
    const back = releaseHogtied(inv, () => 0, now + 1000);
    assert.deepEqual(back.kinship, { petUsesToday: 1, nibbleUsesToday: 1, petted: true, nibbled: true });

    inv.pig_bait = 1;
    capturePiggy({ petUsesToday: 1 }, { pc: pc({ energy: 60 }), inv, learned, streetTsid: 'S2', now: now + 10 * 86_400_000, rng: () => 0.5 });
    normalizeHusbandryPack(JSON.parse(JSON.stringify({ hogtie: { escapeAt: now + 9e9, nextXpAt: 0, name: '', kinship: { day: 'old-day', petUsesToday: 1 } } })));
    assert.deepEqual(releaseHogtied({ hogtied_piggy: 1 }, () => 0, now).kinship, {});
  });
});
