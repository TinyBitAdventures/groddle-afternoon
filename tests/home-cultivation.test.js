import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { CULTIVATION_CLASSES, HOME_LIMITS } from '../public/js/homes-catalog.js?v=29713fa8';
import {
  FIREFLY_HIVE,
  HOUSE_LOT_W,
  YARD_SEGMENT_W,
  addWear,
  createCultivationState,
  cultivate,
  cultivateDemoYard,
  cultivationChoices,
  cultivationCost,
  expandYard,
  hiveFireflyCount,
  homeStreetLayout,
  lifespanLeft,
  normalizeCultivationState,
  nudgeCultivation,
  placementCheck,
  quoteYardExpansion,
  removeCultivation,
} from '../public/js/home-cultivation.js?v=15295514';

const root = join(import.meta.dirname, '..', 'public');
const rich = () => ({ level: 60, imagination: 1_000_000 });

describe('cultivation catalog', () => {
  it('keeps inc_cultivation.js level gates and proto base costs', () => {
    const rows = Object.fromEntries(Object.values(CULTIVATION_CLASSES).map((d) => [d.protoClass, [d.minLevel, d.baseCost]]));
    assert.deepEqual(rows.proto_patch, [0, 400]);
    assert.deepEqual(rows.proto_crop_garden_small, [5, 500]);
    assert.deepEqual(rows.proto_crop_garden_large, [10, 2000]);
    assert.deepEqual(rows.proto_metal_rock, [10, 1200]);
    assert.deepEqual(rows.proto_peat, [7, 400]);
    assert.deepEqual(rows.proto_firefly_hive, [10, 700]);
    assert.equal(rows.proto_furniture_tower_chassis, undefined);
    assert.deepEqual(CULTIVATION_CLASSES.proto_metal_rock.endItems, ['rock_metal_1', 'rock_metal_2', 'rock_metal_3']);
    assert.equal(CULTIVATION_CLASSES.proto_crop_garden_large.cols, 5);
    assert.equal(CULTIVATION_CLASSES.proto_crop_garden_large.rows, 3);
    assert.equal(CULTIVATION_CLASSES.proto_crop_garden_large.maxWear, 300);
    assert.equal(CULTIVATION_CLASSES.proto_metal_rock.maxWear, 40);
    assert.equal(CULTIVATION_CLASSES.proto_peat.maxWear, 100);
    for (const cls of ['barnacle_pod', 'firefly_hive', 'jellisac_mound']) {
      assert.ok(existsSync(join(root, 'assets/sprites/cultivation', `${cls}.png`)), cls);
    }
  });
});

describe('cultivating the home street', () => {
  it('prices with the exact 1.15^all + 0.5 × same-class formula', () => {
    const state = createCultivationState();
    assert.equal(cultivationCost(state, 'proto_patch'), 400);
    const pc = rich();
    cultivate(state, pc, 'proto_patch', 500, { now: 1 });
    // one item: (1.15 + 0.5) × 400
    assert.equal(cultivationCost(state, 'proto_patch'), 660);
    // other class: 1.15 × 300
    assert.equal(cultivationCost(state, 'proto_dirt_pile'), 345);
    cultivate(state, pc, 'proto_dirt_pile', 900, { now: 1 });
    // two items: (1.3225 + 0.5) × 400 = 729
    assert.equal(cultivationCost(state, 'proto_patch'), 729);
  });

  it('gates on level and imagination and spends iMG', () => {
    const state = createCultivationState();
    const low = { level: 4, imagination: 99_999 };
    assert.equal(cultivate(state, low, 'proto_crop_garden_small', 600).reason, 'level');
    const poor = { level: 10, imagination: 10 };
    assert.equal(cultivate(state, poor, 'proto_patch', 600).reason, 'img');
    const pc = { level: 10, imagination: 1000 };
    const result = cultivate(state, pc, 'proto_patch', 600, { rng: () => 0.99 });
    assert.equal(result.ok, true);
    assert.equal(pc.imagination, 600);
    assert.equal(result.item.endClass, 'patch');
    const choices = cultivationChoices(state, { level: 5, imagination: 0 });
    assert.equal(choices.find((c) => c.protoClass === 'proto_metal_rock').reason, 'Requires level 10.');
  });

  it('chooses one source end item', () => {
    const state = createCultivationState();
    const a = cultivate(state, rich(), 'proto_beryl_rock', 600, { rng: () => 0.7 });
    assert.equal(a.item.endClass, 'rock_beryl_3');
  });

  it('keeps cultivations apart and the doorway clear', () => {
    const state = createCultivationState();
    assert.equal(placementCheck(state, 'proto_patch', 0).reason, 'door');
    cultivate(state, rich(), 'proto_patch', 500);
    assert.equal(placementCheck(state, 'proto_patch', 560).reason, 'overlap');
    assert.equal(placementCheck(state, 'proto_patch', 50_000).reason, 'edge');
  });

  it('lays out the source 3 + 8 yard segments of 150 px around the house lot', () => {
    const state = createCultivationState();
    const layout = homeStreetLayout(state);
    assert.equal(layout.width, (3 + 8) * YARD_SEGMENT_W + HOUSE_LOT_W);
    assert.equal(layout.houseX, 3 * YARD_SEGMENT_W + HOUSE_LOT_W / 2);
  });

  it('expands the yard at FRONTYARD_EXPAND_COSTS and keeps items beside the house', () => {
    const state = createCultivationState();
    const pc = { level: 1, imagination: 225 };
    // Right of the house: the left side of the starting street is the signpost's post and the dispatcher (GARDENART).
    const item = cultivate(state, { level: 60, imagination: 400 }, 'proto_patch', 500).item;
    const before = homeStreetLayout(state).houseX + item.rx;
    assert.equal(quoteYardExpansion(state, pc, 'left').cost, 100);
    const left = expandYard(state, pc, 'left');
    assert.equal(left.cost, 100);
    assert.equal(homeStreetLayout(state).houseX + item.rx, before + YARD_SEGMENT_W);
    assert.equal(expandYard(state, pc, 'right').cost, 125);
    assert.equal(pc.imagination, 0);
    assert.equal(quoteYardExpansion(state, pc, 'right').reason, 'img');
    const maxed = createCultivationState({ yardRight: HOME_LIMITS.MAX_FRONTYARD_RIGHT_SEGMENTS - 8 });
    assert.equal(quoteYardExpansion(maxed, rich(), 'right').reason, 'already_max_size');
  });

  it('wears out at the source max wear', () => {
    const state = createCultivationState();
    const rock = cultivate(state, rich(), 'proto_metal_rock', 700).item;
    assert.equal(addWear(state, rock.id, 39).depleted, false);
    assert.ok(Math.abs(lifespanLeft(rock) - 1 / 40) < 1e-9);
    assert.equal(addWear(state, rock.id, 1).depleted, true);
    assert.equal(removeCultivation(state, rock.id).ok, true);
    assert.equal(state.items.length, 0);
  });

  it('nudges only with Nudgery', () => {
    const state = createCultivationState();
    const item = cultivate(state, rich(), 'proto_patch', 600).item;
    assert.equal(nudgeCultivation(state, item.id, 800, []).reason, 'skill');
    assert.equal(nudgeCultivation(state, item.id, 800, ['nudgery_1']).item.rx, 800);
  });

  it('spawns one Firefly a minute up to ten', () => {
    const item = { placedAt: 0 };
    assert.equal(hiveFireflyCount(item, 0), 1);
    assert.equal(hiveFireflyCount(item, FIREFLY_HIVE.intervalMs * 3), 4);
    assert.equal(hiveFireflyCount(item, FIREFLY_HIVE.intervalMs * 99), 10);
  });

  it('seeds a demo yard that survives normalization', () => {
    const state = cultivateDemoYard(createCultivationState(), 1000);
    assert.ok(state.items.length >= 5);
    const copy = normalizeCultivationState(JSON.parse(JSON.stringify(state)));
    assert.deepEqual(copy.items, state.items);
  });
});
