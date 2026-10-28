/**
 * Master Gardener garden potions: pour checks, whole-garden actions, the
 * garden drop chance, bottles, and the cards.
 * Run: node --test tests/master-garden.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createGarden, SEED_CATALOG } from '../public/js/garden.js?v=g403-1';
import {
  GARDEN_POTIONS,
  POTION_USES,
  canPour,
  createPotionState,
  growl,
  mgDropChance,
  mgDropTable,
  pickedMessage,
  potionTendGarden,
  usePotion,
} from '../public/js/master-garden.js?v=g403-1';
import { remakeStatus } from '../public/js/imagination-remake.js?v=g403-1';

const MG = ['croppery_1', 'mastergardener_1'];

function dirtyGarden(type = 'default') {
  const g = createGarden({ cols: 4, rows: 2, gardenType: type, now: 0 });
  for (const p of Object.values(g.plots)) p.state = 'dirty';
  return g;
}

describe('pouring', () => {
  it('needs Master Gardener, a garden with work, and energy for every plot', () => {
    const g = dirtyGarden();
    assert.equal(canPour('potion_garden_clear', g, { learned: [], energy: 100 }).msg, 'You need to know Master Gardener to use this.');
    assert.equal(canPour('potion_garden_water', g, { learned: MG, energy: 100 }).msg, 'There are no dry gardens nearby.');
    assert.equal(canPour('potion_garden_harvest', g, { learned: MG, energy: 100 }).msg, 'There is nothing to harvest here.');
    assert.equal(canPour('potion_garden_clear', g, { learned: MG, energy: 24 }).msg, "You don't have enough energy to do that!");
    assert.equal(canPour('potion_garden_clear', g, { learned: MG, energy: 25 }).ok, true);
    assert.equal(canPour('potion_garden_plant', createGarden({ now: 0 }), { learned: MG, energy: 100, seedId: 'herb_seed_rookswort', inv: { herb_seed_rookswort: 3 } }).ok, false, 'herb seed in a crop bed');
  });
});

describe('whole-garden actions', () => {
  it('hoe -> plant -> water -> fertilize -> pick with mg_croppery packages', () => {
    const g = dirtyGarden();
    const inv = { seed_spinach: 5 };
    const pc = { energy: 100, mood: 10, xp: 0, imagination: 0 };
    const hoe = potionTendGarden(g, 'hoe', inv, pc, { learned: MG, rng: () => 0.99, now: 1000 });
    assert.equal(hoe.count, 8);
    // Eight plots, each +3 mood then +3 iMG scaled by the mood so far: 13-34%
    // mood pays x0.5 or x0.75, 2 iMG a plot (G148).
    assert.equal(hoe.msg, 'You cleaned a garden. (-24 energy, +24 mood, +16 iMG)');
    assert.equal(hoe.drop.table, 'croppery_mastergardener');
    assert.equal(hoe.drop.chance, 0.36);
    const plant = potionTendGarden(g, 'plant', inv, pc, { learned: MG, seedId: 'seed_spinach', rng: () => 0.99, now: 2000 });
    assert.equal(plant.count, 5, 'stops when the seeds run out');
    assert.equal(inv.seed_spinach, undefined);
    const water = potionTendGarden(g, 'water', inv, pc, { learned: MG, rng: () => 0.99, now: 3000 });
    assert.equal(water.count, 8, 'charges for every plot');
    assert.equal(water.drop.table, 'croppery_master_gardener__water');
    const fert = potionTendGarden(g, 'fertilize', inv, pc, { learned: MG, now: 4000 });
    assert.equal(fert.count, 5);
    const states = Object.values(g.plots).map((p) => p.state);
    assert.equal(states.filter((s) => s === 'shoots').length, 5, 'seeds jump to shoots');
    for (const p of Object.values(g.plots)) if (p.state === 'shoots') p.state = 'crop';
    const pick = potionTendGarden(g, 'pick', inv, pc, { learned: MG, rng: () => 0.99, now: 5000 });
    assert.equal(pick.count, 5);
    assert.equal(inv.spinach, 5 * SEED_CATALOG.seed_spinach.produces, 'no half harvest for Master Gardener');
    assert.equal(pick.drop, null);
    assert.match(pick.msg, /^You picked 60 Spinachs\./);
  });

  it('fertilized shoots finish in a tenth of their remaining time', () => {
    const g = createGarden({ cols: 1, rows: 1, now: 0 });
    const plot = Object.values(g.plots)[0];
    Object.assign(plot, { state: 'shoots', seed: 'seed_tomato', wet: true, stageStartedAt: 0, growModifier: 1 });
    const need = SEED_CATALOG.seed_tomato.grow2Ms;
    potionTendGarden(g, 'fertilize', {}, { energy: 50 }, { learned: MG, now: need / 2 });
    const remaining = need - (need / 2 - plot.stageStartedAt);
    assert.ok(Math.abs(remaining - need / 20) < 2, `${remaining}`);
    assert.equal(plot.fertilized, true);
  });

  it('herb beds use mg_herbalism with its 30% x3 super harvest', () => {
    const g = createGarden({ cols: 3, rows: 2, gardenType: 'herb', now: 0 });
    for (const p of Object.values(g.plots)) Object.assign(p, { state: 'crop', seed: 'herb_seed_rookswort' });
    const inv = {};
    const res = potionTendGarden(g, 'pick', inv, { energy: 100 }, { learned: ['herbalism_1', 'mastergardener_1'], rng: () => 0.1 });
    const n = SEED_CATALOG.herb_seed_rookswort.produces;
    assert.equal(inv[SEED_CATALOG.herb_seed_rookswort.cropId], 6 * n * 3);
    assert.equal(res.superHarvest, true);
  });

  it('garden drop chance by plot count, tables by type and action', () => {
    assert.deepEqual([4, 6, 8, 15, 20].map((n) => mgDropChance(n)), [0.18, 0, 0.36, 0.67, 0.67]);
    assert.ok(Math.abs(mgDropChance(8, { rubeweed: true }) - 0.45) < 1e-9);
    assert.equal(mgDropChance(6, { maxLuck: true }), 1);
    assert.equal(mgDropTable('herb', 'water'), 'herbalism_master_gardener__water');
    assert.equal(mgDropTable('herb', 'plant'), 'herbalism_mastergardener');
    assert.equal(growl('You watered a garden.', {}), 'You watered a garden.');
    assert.equal(pickedMessage({ a: { seed: SEED_CATALOG.seed_onion, num: 1 } }), 'You picked a Onion.');
  });
});

describe('bottles', () => {
  it('five pours a bottle, then the next one', () => {
    const state = createPotionState();
    const inv = { potion_garden_water: 2 };
    for (let i = 0; i < POTION_USES - 1; i += 1) assert.equal(usePotion(state, 'potion_garden_water', inv).emptied, false);
    assert.equal(usePotion(state, 'potion_garden_water', inv).emptied, true);
    assert.equal(inv.potion_garden_water, 1);
    assert.equal(Object.keys(GARDEN_POTIONS).length, 5);
  });

  it('Watering Whiz and Tendy Gonzales are live', () => {
    assert.equal(remakeStatus('croppery_herbalism_watering_time').status, 'live');
    assert.equal(remakeStatus('croppery_herbalism_clearing_time').status, 'live');
  });
});
