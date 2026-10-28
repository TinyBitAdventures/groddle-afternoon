/**
 * Shared drop tables: the catalog port, rolls, skill-package drop chances,
 * payouts, and the drops feature's event wiring.
 * Run: node --test tests/drop-tables.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  DROP_ITEMS,
  DROP_TABLES,
  applyDropResult,
  packageDropChance,
  rollDropTable,
  rollPackageDrop,
  tableItemOdds,
} from '../public/js/drop-tables.js';
import { remakeStatus } from '../public/js/imagination-remake.js?v=g403-1';

const seq = (...vals) => {
  let i = 0;
  return () => vals[Math.min(i++, vals.length - 1)];
};
const roll = (n) => n / 101 + 1e-9; // rng value that makes randInt(0, 100) return n

describe('drop table catalog', () => {
  it('ports all 93 tables with ascending thresholds', () => {
    assert.equal(Object.keys(DROP_TABLES).length, 93);
    for (const [id, t] of Object.entries(DROP_TABLES)) {
      const th = t.rows.map((r) => r[0]);
      assert.deepEqual(th, [...th].sort((a, b) => a - b), id);
    }
    assert.deepEqual(DROP_TABLES.croppery.rows[0], [48, [{ table: 'currants_small' }]]);
    assert.equal(DROP_ITEMS.plank.plural, 'Planks');
    assert.ok(Object.values(DROP_ITEMS).filter((i) => i.art).length >= 240);
  });
});

describe('rolling', () => {
  it('first row at or above randInt(0, 100) pays; nested tables roll again', () => {
    const plank = rollDropTable('croppery', seq(roll(55)));
    assert.deepEqual(plank.items, [{ classTsid: 'plank', qty: 3, table: 'croppery' }]);
    const currants = rollDropTable('croppery', seq(roll(10), roll(14)));
    assert.equal(currants.currants, 3);
    assert.deepEqual(currants.rolls.map((r) => r.table), ['croppery', 'currants_small']);
    const favor = rollDropTable('crystalography_favor', seq(roll(90)));
    assert.deepEqual(favor.favor, [{ giant: 'all', points: 5 }]);
  });

  it('odds sum to one across a table', () => {
    const t = DROP_TABLES.gem_small;
    const items = [...new Set(t.rows.flatMap((r) => r[1].map((e) => e.item)))];
    const total = items.reduce((n, id) => n + tableItemOdds('gem_small', id), 0);
    assert.ok(Math.abs(total - 1) < 1e-9, `${total}`);
  });
});

describe('skill package drops', () => {
  it('row drop chances and imagination overlays', () => {
    assert.equal(packageDropChance('croppery_plant', ['croppery_1']), null);
    assert.deepEqual(
      (({ tableId, chance }) => ({ tableId, chance }))(packageDropChance('croppery_plant', ['croppery_1', 'croppery_2'])),
      { tableId: 'croppery', chance: 4 }
    );
    assert.equal(packageDropChance('croppery_plant', ['croppery_1', 'croppery_2'], ['croppery_growing_drop_2']).tableId, 'croppery_large');
    assert.equal(packageDropChance('croppery_plant', ['croppery_1', 'croppery_2'], ['croppery_growing_drop_2']).chance, 7);
    assert.equal(packageDropChance('light_green_thumb_pet', ['light_green_thumb_1']), null);
    assert.equal(packageDropChance('light_green_thumb_pet', [], ['lightgreenthumb_pet_drop_1']).chance, 6);
    assert.equal(packageDropChance('light_green_thumb_water', [], ['lightgreenthumb_water_drop_2']).tableId, 'tree_watering_large');
    assert.equal(packageDropChance('refining', ['refining_1'], ['refining_drop_2']).chance, 8);
    assert.equal(packageDropChance('smelting', ['smelting_1'], ['smelting_drop']).tableId, 'smelting');
    assert.equal(packageDropChance('scraping', [], ['barnacle_scraping_drop_1']).chance, 6);
    assert.equal(packageDropChance('jellisac_scooping', [], ['jellisac_hands_drop_1']).chance, 8);
    assert.equal(packageDropChance('peat_harvest', ['bogspecialization_1'], ['bogspecialization_dig_peat_drop']).chance, 10);
    assert.equal(packageDropChance('herbalism_water', ['herbalism_1', 'herbalism_2'], [], { rubeweed: true }).chance, 5);
  });

  it('rolls is_chance(drop_chance / 100); Max Luck always hits', () => {
    const ctx = { learned: [], upgrades: ['lightgreenthumb_pet_drop_1'] };
    assert.equal(rollPackageDrop('light_green_thumb_pet', { ...ctx, rng: () => 0.059 }).hit, true);
    assert.equal(rollPackageDrop('light_green_thumb_pet', { ...ctx, rng: () => 0.061 }).hit, false);
    assert.equal(rollPackageDrop('light_green_thumb_pet', { ...ctx, rng: () => 0.99, maxLuck: true }).hit, true);
    assert.equal(rollPackageDrop('light_green_thumb_pet', { rng: () => 0 }).hit, false, 'no card, no drop');
  });
});

describe('paying drops', () => {
  it('items, currants, capped favor and stats with the source lines', () => {
    const inv = {};
    const pc = { currants: 10, mood: 95, energy: 50, xp: 0, imagination: 0 };
    const favor = { alph: 995 };
    const result = { table: 't', items: [{ classTsid: 'plank', qty: 3 }, { classTsid: 'gem_amber', qty: 1 }], currants: 11, favor: [{ giant: 'all', points: 5 }], mood: 20, energy: 0, xp: 7 };
    const { lines, landed } = applyDropResult(result, { inv, pc, favor, favorCap: () => 1000 });
    assert.deepEqual(lines, ['You got 3 Planks!', 'You got 1 Pleasing Amber!', 'You got 11 currants!', 'You got 5 favor with all the Giants!', 'You got 5 mood!', 'You got 8 iMG!']);
    assert.deepEqual(inv, { plank: 3, gem_amber: 1 });
    assert.equal(pc.currants, 21);
    assert.equal(favor.alph, 1000);
    assert.equal(favor.zille, 5);
    assert.equal(landed.mood, 5);
    // 7 iMG at a full mood tank: the mood bonus is x1.2 (G148), and the line names what landed.
    assert.equal(pc.imagination, 8);
  });
});

describe('drops feature wiring', () => {
  it('maps world events and making batches to packages', async () => {
    const { packageForEvent, rollResourceNodeDrop, RESOURCE_NODE_DROP_PACKAGES, dropsFeature } = await import('../public/js/features/drops-feature.js');
    const engine = { interactables: [], player: { x: 0, y: 0 } };
    assert.equal(packageForEvent('trant_bean:pet', engine), 'light_green_thumb_pet');
    assert.equal(packageForEvent('trant_egg:pet', engine), 'lgt_egg_plant_pet');
    assert.equal(packageForEvent('trant_fruit:water', engine), 'light_green_thumb_water');
    assert.equal(packageForEvent('wood_tree:harvest', engine), 'wood_tree_harvest');
    assert.equal(packageForEvent('garden_plot:water', engine), 'croppery_water');
    const herb = { interactables: [{ classId: 'garden_plot', sprite: { x: 5, y: 0 }, state: { garden: { gardenType: 'herb' } } }], player: { x: 0, y: 0 } };
    assert.equal(packageForEvent('garden_plot:clear', herb), 'herbalism_clear');
    assert.equal(packageForEvent('npc_piggy:pet', engine), null, 'animal kinship rolls its own');
    assert.equal(RESOURCE_NODE_DROP_PACKAGES['mortar_barnacle:scrape'], 'scraping');
    assert.equal(rollResourceNodeDrop(engine, { ok: false }), null);

    dropsFeature._reset();
    const rolledFor = [];
    const fake = { learnedSkills: ['refining_1'], pc: { imaginationUpgrades: [] }, setData: (k, v) => k === 'dropPackage' && rolledFor.push(v) };
    for (let i = 0; i < 4; i += 1) dropsFeature.onEvent('making_known_tool:ore_grinder', 1, fake);
    assert.equal(rolledFor.length, 0, 'under 5 ore: no drop roll');
    dropsFeature.onEvent('making_known_tool:ore_grinder', 1, fake);
    dropsFeature.onEvent('making_known_tool:ore_grinder', 1, fake);
    assert.equal(rolledFor.length, 1, 'one roll per batch');
  });

  it('the seven drop-card families are live', () => {
    for (const id of ['refining_drop_1', 'refining_drop_2', 'smelting_drop', 'lightgreenthumb_pet_drop_1', 'lightgreenthumb_water_drop_2', 'croppery_growing_drop_1', 'bogspecialization_dig_peat_drop', 'barnacle_scraping_drop_1', 'jellisac_hands_drop_1']) {
      assert.equal(remakeStatus(id).status, 'live', id);
    }
  });
});
