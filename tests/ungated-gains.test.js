/**
 * G259: drinks, item verbs and the skill-package mood bonuses (Animal
 * Kinship, gardens, Master Gardener potions, trant care) add energy and mood
 * through the metabolic gate, as the source's metabolics_add_energy / _mood
 * do (players/inc_metabolics.js 40-53, 79-86): nothing while dead, no energy
 * while Super Pooped. Losses never ask.
 * Run: node --test tests/ungated-gains.test.js
 */
import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setMetabolicGainGate } from '../public/js/metabolics.js';
import { createInventory, useItem } from '../public/js/inventory.js';
import { ITEM_VERBS, crunchIce, runItemVerb } from '../public/js/item-verbs.js';
import { performAnimalKinship } from '../public/js/animal-kinship.js?v=g403-1';
import { createAnimalState } from '../public/js/animals.js?v=g454-1';
import { performTrantCare } from '../public/js/trant-care.js?v=g414-1';
import { createTrantState, setTrantTables } from '../public/js/trants.js';
import { createToolConditionState } from '../public/js/tools.js?v=woodcutting-test-8';
import { createGarden, plantPlot, plotKey } from '../public/js/garden.js?v=g403-1';
import { potionTendGarden } from '../public/js/master-garden.js?v=g403-1';

const here = dirname(fileURLToPath(import.meta.url));
const pub = join(here, '../public');
const gsjs = join(here, '../../glitch-GameServerJS');
setTrantTables(JSON.parse(readFileSync(join(pub, 'assets/content/trants.json'), 'utf8')));

const asked = [];
/** Refuse the listed stats the way the hell feature does while dead or Super Pooped. */
function refuse(...stats) {
  setMetabolicGainGate((stat) => {
    asked.push(stat);
    return stats.includes(stat) ? { ok: false, msg: `no ${stat}` } : { ok: true };
  });
}
afterEach(() => {
  setMetabolicGainGate(null);
  asked.length = 0;
});

describe('the source adds through the gate', () => {
  it('drink_drink, food_eat, ice and the skill packages call metabolics_add_*', () => {
    const drink = readFileSync(join(gsjs, 'items/include/drink.js'), 'utf8');
    assert.match(drink, /pc\.metabolics_add_mood\(count \* this\.classProps\.drink_mood\)/);
    assert.match(drink, /pc\.metabolics_add_energy\(count \* this\.classProps\.drink_energy\)/);
    assert.match(readFileSync(join(gsjs, 'items/ice.js'), 'utf8'), /pc\.metabolics_add_mood\(6 \* msg\.count\)/);
    assert.match(readFileSync(join(gsjs, 'players/inc_skill_packages.js'), 'utf8'), /metabolics_add_mood\(details\.mood_bonus\)/);
    const metabolics = readFileSync(join(gsjs, 'players/inc_metabolics.js'), 'utf8');
    assert.match(metabolics, /You would have gained energy, but you're super pooped!/);
  });
});

describe('drinks (inventory.js useItem)', () => {
  it('a drink is drunk while dead but gives nothing', () => {
    refuse('energy', 'mood');
    const inv = createInventory({ orange_juice: 2 });
    const pc = { energy: 40, mood: 40, energyMax: 100 };
    const r = useItem(inv, pc, 'orange_juice');
    assert.equal(r.ok, true);
    assert.equal(pc.energy, 40);
    assert.equal(pc.mood, 40);
    assert.equal(r.effects.energy, undefined);
    assert.equal(r.effects.mood, undefined);
    assert.equal(inv.orange_juice, 1, 'one juice spent');
    assert.deepEqual(asked.sort(), ['energy', 'mood']);
  });

  it('Super Pooped keeps the energy out, the mood still lands', () => {
    refuse('energy');
    const pc = { energy: 2, mood: 40, energyMax: 100 };
    const r = useItem(createInventory({ orange_juice: 1 }), pc, 'orange_juice');
    assert.equal(pc.energy, 2);
    assert.equal(r.effects.mood, 8);
  });

  it('with the gate open the juice gives its 15 energy and 8 mood', () => {
    const pc = { energy: 40, mood: 40, energyMax: 100 };
    const r = useItem(createInventory({ orange_juice: 1 }), pc, 'orange_juice');
    assert.deepEqual([r.effects.energy, r.effects.mood], [15, 8]);
  });
});

describe('item verbs (item-verbs.js)', () => {
  it('Mustard plaster: the mood cost lands, the energy rise is refused', () => {
    refuse('energy', 'mood');
    const mustard = ITEM_VERBS.find((v) => v.classTsid === 'mustard');
    const pc = { energy: 50, mood: 50 };
    const r = runItemVerb(mustard, pc);
    assert.equal(r.ok, true);
    assert.equal(pc.mood, 46);
    assert.equal(pc.energy, 50);
    assert.deepEqual(asked, ['energy'], 'a loss never asks');
  });

  it('Saffron love: the energy cost lands, the mood rise is refused', () => {
    refuse('mood');
    const saffron = ITEM_VERBS.find((v) => v.classTsid === 'saffron');
    const pc = { energy: 50, mood: 50 };
    runItemVerb(saffron, pc);
    assert.equal(pc.energy, 48);
    assert.equal(pc.mood, 50);
  });

  it('crunching ice gives no mood while dead, the energy cost still lands', () => {
    refuse('energy', 'mood');
    const pc = { energy: 50, mood: 50, imagination: 0, xp: 0 };
    const r = crunchIce(pc, 1, { rng: () => 0.5 });
    assert.equal(r.ok, true);
    assert.equal(pc.mood, 50);
    assert.equal(pc.energy, 47);
  });
});

describe('skill-package mood bonuses (inc_skill_packages.js 524)', () => {
  it('petting a piggy while dead spends energy and gives no mood', () => {
    const open = { energy: 100, mood: 40, imagination: 0, xp: 0 };
    performAnimalKinship(createAnimalState('npc_piggy'), 'npc_piggy', 'pet', { pc: open, inv: {}, learned: ['animalkinship_4'], rng: () => 0.5 });
    assert.ok(open.mood > 40, 'the pet gives mood with the gate open');
    refuse('energy', 'mood');
    const dead = { energy: 100, mood: 40, imagination: 0, xp: 0 };
    const r = performAnimalKinship(createAnimalState('npc_piggy'), 'npc_piggy', 'pet', { pc: dead, inv: {}, learned: ['animalkinship_4'], rng: () => 0.5 });
    assert.equal(r.ok, true);
    assert.equal(dead.mood, 40);
    assert.equal(dead.energy, open.energy);
  });

  it('watering a trant while dead gives no mood', () => {
    refuse('energy', 'mood');
    const pc = { energy: 100, mood: 50, imagination: 0, xp: 0 };
    const r = performTrantCare(createTrantState('trant_fruit', { health: 7 }), 'trant_fruit', 'water', {
      inv: { watering_can: 1 },
      pc,
      tools: createToolConditionState(),
      skills: { learned: ['light_green_thumb_2'] },
      learned: ['light_green_thumb_2'],
      rng: () => 0.99,
    });
    assert.equal(r.ok, true);
    assert.equal(pc.energy, 98);
    assert.equal(pc.mood, 50);
    assert.equal(r.effects.mood, 0);
  });

  it('planting while dead gives no mood', () => {
    const run = () => {
      const pc = { energy: 50, mood: 40, imagination: 0, xp: 0 };
      const r = plantPlot(createGarden({ cols: 2, rows: 2, now: 0 }), plotKey(1, 1), createInventory({ seed_spinach: 1 }), pc, 'seed_spinach', { now: 0, learned: ['croppery_1'] });
      return { pc, r };
    };
    const open = run();
    assert.equal(open.r.ok, true);
    assert.ok(open.pc.mood > 40, 'planting gives mood with the gate open');
    refuse('energy', 'mood');
    const dead = run();
    assert.equal(dead.r.ok, true);
    assert.equal(dead.pc.mood, 40);
    assert.equal(dead.pc.energy, open.pc.energy);
  });

  it('a Master Gardener potion while dead cleans every plot for no mood, and says so', () => {
    refuse('energy', 'mood');
    const g = createGarden({ cols: 4, rows: 2, now: 0 });
    for (const p of Object.values(g.plots)) p.state = 'dirty';
    const pc = { energy: 100, mood: 10, xp: 0, imagination: 0 };
    const r = potionTendGarden(g, 'hoe', {}, pc, { learned: ['croppery_1', 'mastergardener_1'], rng: () => 0.99, now: 1000 });
    assert.equal(r.count, 8);
    assert.equal(pc.mood, 10);
    assert.equal(pc.energy, 76);
    assert.match(r.msg, /\(-24 energy, \+\d+ iMG\)|\(-24 energy\)/);
    assert.doesNotMatch(r.msg, /mood/);
  });
});
