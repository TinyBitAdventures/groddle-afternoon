import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  cultivationNodes,
  furnitureStoreProfile,
  homesFeature,
  nodeKeyMap,
  rekeyNodes,
  rockClassFor,
  rockItems,
  soilKeyMap,
} from '../public/js/features/homes-feature.js';
import { WALLPAPER_MAPS } from '../public/js/home-wallpaper-art.js';
import { HOME_TEXTURE_CONFIGS } from '../public/js/homes-catalog.js';
import { canPlantBean } from '../public/js/patches.js';

const root = join(import.meta.dirname, '..', 'public');

describe('homes feature helpers', () => {
  it('maps cultivated rocks onto the mining catalog family', () => {
    assert.equal(rockClassFor('rock_beryl_3'), 'rock_beryl_1');
    assert.equal(rockClassFor('rock_metal_1'), 'rock_metal_1');
  });

  it('places pod and mound nodes at the source createAndReturnItem offsets', () => {
    const pod = cultivationNodes({ protoClass: 'proto_barnacle_pod', endClass: 'barnacle_pod' });
    assert.deepEqual(pod.map((n) => [n.classTsid, n.dx, n.dy]), [
      ['mortar_barnacle', 37, -43],
      ['mortar_barnacle', 19, -105],
      ['mortar_barnacle', -26, -63],
    ]);
    const mound = cultivationNodes({ protoClass: 'proto_jellisac_mound', endClass: 'jellisac_mound' });
    assert.deepEqual(mound.map((n) => [n.dx, n.dy]), [[38, -44], [-45, -64]]);
    assert.equal(cultivationNodes({ protoClass: 'proto_peat', endClass: 'peat_3' })[0].classTsid, 'peat_3');
    const hive = cultivationNodes({ protoClass: 'proto_firefly_hive', endClass: 'firefly_hive', placedAt: 0 }, 3 * 60_000);
    assert.equal(hive.length, 4);
  });

  it('keeps node and plot state with its own cultivation when one is removed', () => {
    const items = [
      { id: 1, protoClass: 'proto_peat', endClass: 'peat_1' },
      { id: 2, protoClass: 'proto_barnacle_pod', endClass: 'barnacle_pod' },
      { id: 3, protoClass: 'proto_peat', endClass: 'peat_2' },
    ];
    const before = nodeKeyMap(items);
    assert.deepEqual(before.get(3), ['peat_1:1']);
    const nodes = { 'peat_1:0': { tag: 'a' }, 'peat_1:1': { tag: 'c' }, 'mortar_barnacle:0': { tag: 'b0' } };
    const after = nodeKeyMap(items.filter((row) => row.id !== 1));
    const out = rekeyNodes(nodes, before, after);
    assert.equal(out['peat_1:0'].tag, 'c');
    assert.equal(out['mortar_barnacle:0'].tag, 'b0');
    const soil = soilKeyMap([
      { id: 4, protoClass: 'proto_patch', endClass: 'patch' },
      { id: 5, protoClass: 'proto_patch', endClass: 'patch_dark' },
      { id: 6, protoClass: 'proto_patch', endClass: 'patch' },
    ]);
    assert.deepEqual([...soil.values()].flat(), ['patch:0', 'patch_dark:0', 'patch:1']);
    assert.equal(rockItems([{ protoClass: 'proto_metal_rock' }, { protoClass: 'proto_peat' }]).length, 1);
  });

  it('sells store 23 at its exact prices with the 0.5 buy-back', () => {
    const profile = furnitureStoreProfile();
    const bed = profile.offers.find((o) => o.classTsid === 'furniture_bed');
    assert.equal(profile.label, 'Furniture Store');
    assert.equal(bed.buyPrice, 1700);
    assert.equal(bed.sellPrice, 850);
  });

  it('plants any seasoned bean in a home Patch (patch.js: everything is ok in new POLs)', () => {
    assert.equal(canPlantBean('bean_egg', 'patch', 'home'), true);
    assert.equal(canPlantBean('bean_spice', 'patch_dark', 'home'), true);
    assert.equal(canPlantBean('bean_egg', 'patch', 56), false);
  });

  it('offers Place in house for pack furniture only', () => {
    const verbs = homesFeature.packVerbs('furniture_chair', {});
    assert.equal(verbs[0].id, 'place_furniture');
    assert.equal(verbs[0].enabled, false);
    assert.deepEqual(homesFeature.packVerbs('apple', {}), []);
  });

  it('round-trips its save slice', () => {
    homesFeature.restore({ decor: { wall: 'red_brick', wallSegments: 9 }, cult: { yardLeft: 2 } });
    const slice = JSON.parse(JSON.stringify(homesFeature.save()));
    assert.equal(slice.decor.wall, 'red_brick');
    assert.equal(slice.decor.wallSegments, 9);
    assert.equal(slice.cult.yardLeft, 2);
    homesFeature.restore(undefined);
    assert.equal(homesFeature.save().decor.wall, 'grey_unfinished');
  });

  it('draws every visible source swatch from its recovered pieces', () => {
    for (const kind of ['walls', 'floors', 'ceilings']) {
      assert.deepEqual(Object.keys(WALLPAPER_MAPS[kind]).sort(), Object.keys(HOME_TEXTURE_CONFIGS[kind]).sort(), kind);
    }
  });

  it('is registered and wired into the home scene', () => {
    const index = readFileSync(join(root, 'js/features/index.js'), 'utf8');
    assert.match(index, /homesFeature/);
    const game = readFileSync(join(root, 'game.js'), 'utf8');
    assert.match(game, /features\.query\('homeScene', room, engine\)/);
    assert.match(game, /homeScene\?\.enter\?\.\(\)/);
    assert.match(game, /refreshHomeScene\(opts = \{\}\)/);
    assert.match(game, /'decorate', 'cultivate'\]\.includes\(homeDemo\)/);
  });
});

describe('furniture making and buying', () => {
  const recipes = JSON.parse(readFileSync(join(root, 'assets/content/recipes.json'), 'utf8'));
  const skipped = JSON.parse(readFileSync(join(root, 'assets/content/recipes-skipped.json'), 'utf8'));
  const stores = readFileSync(join(root, 'js/store-catalog.js'), 'utf8');

  it('imports the Construction Tool and Loomer furniture recipes with source costs', () => {
    assert.equal(recipes.furniture_chair.tool, 'construction_tool');
    assert.deepEqual(recipes.furniture_chair.inputs, [
      { classTsid: 'wood_post', qty: 1 },
      { classTsid: 'board', qty: 4 },
      { classTsid: 'snail', qty: 4 },
    ]);
    assert.equal(recipes.furniture_chair.energyCost, 75);
    assert.equal(recipes.furniture_chair.skill, 'furnituremaking_1');
    assert.equal(recipes.wall_segment.id, '261');
    assert.equal(recipes.furniture_rug.tool, 'loomer');
    assert.equal(recipes.furniture_fireplace.id, '321');
    const stillSkipped = skipped.skipped.filter((r) => r.tool === 'construction_tool').map((r) => r.id);
    assert.deepEqual(stillSkipped, ['260', '303']);
  });

  it('stocks the Construction Tool and Bulb where catalog_stores.js sells them', () => {
    assert.match(stores, /"classTsid": "construction_tool",\s+"label": "Construction Tool",\s+"cost": 560/);
    assert.match(stores, /"classTsid": "bulb",\s+"label": "Bulb",\s+"cost": 56/);
  });
});
