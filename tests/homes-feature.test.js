import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  STREET_GROUND_Y,
  STREET_WORLD_H,
  cultivationNodes,
  furnitureStoreProfile,
  homesFeature,
  interiorLook,
  liftOldStreetRows,
  nodeKeyMap,
  rekeyNodes,
  rockClassFor,
  rockItems,
  soilKeyMap,
} from '../public/js/features/homes-feature.js?v=82e0a046';
import { WALLPAPER_MAPS } from '../public/js/home-wallpaper-art.js?v=9f8473e6';
import { HOME_TEXTURE_CONFIGS } from '../public/js/homes-catalog.js?v=29713fa8';
import { canPlantBean } from '../public/js/patches.js?v=3996c344';
import { TOWER_PART_CHOICES, TOWER_STYLES, composeTower, towerBounds } from '../public/js/home-tower.js?v=6ccb3a4f';
import { MIN_GROUND_CLEARANCE, cameraTargetY, cameraWorldHeightForGround, yCamOffsetAnchor } from '../public/js/movement.js?v=a314f8a1';
import { INTERIOR } from '../public/js/home-decor.js?v=95ba0a91';

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

describe('a home street tall enough for a nine-floor Tower', () => {
  const VIEW = 408; // LOCATION_VIEW_H: the 540 px view less the 132 px pack
  const worldH = cameraWorldHeightForGround(STREET_WORLD_H, STREET_GROUND_Y, VIEW);

  it('sits the ground about 870 px under the street top, like the *_high templates', () => {
    // Archived street renders (720 px wide): the 1,650 px start yard renders 720x436 and the
    // 6,000 px full yard 720x120, both a 1,000 px street; a Tower's foot sits 104/120 down.
    assert.equal(Math.round(1650 * 436 / 720), 999);
    assert.equal(Math.round(6000 * 120 / 720), 1000);
    assert.ok(Math.abs(STREET_GROUND_Y - 1000 * 104 / 120) < 10, 'within a render pixel (8 px) of the measured foot');
    assert.ok(STREET_WORLD_H <= 1000);
  });

  it('shows the ninth floor of every style once the camera looks up, and frames the feet as before', () => {
    // spawnStreet stands the chassis 6 px under the walk line.
    for (const style of Object.keys(TOWER_STYLES)) {
      const top = STREET_GROUND_Y + 6 + towerBounds(composeTower(style, 7)).t;
      assert.ok(top >= 40, `${style}: ${top} px of sky over the top`);
      const camY = cameraTargetY(STREET_GROUND_Y - 600, worldH, VIEW);
      assert.equal(camY, 0);
      assert.ok(top - camY < VIEW / 2, `${style} top in the upper half of the view`);
      // Every top choice: only the Tree Tower's two big canopies (floor_top_7, _8) rise past the
      // ~1,000 px street the renders measure, as they would have in the original; at most 30 px.
      for (let n = 1; n <= TOWER_PART_CHOICES[style].floor_top; n += 1) {
        const t = STREET_GROUND_Y + 6 + towerBounds(composeTower(style, 7, { floor_top: n })).t;
        if (style === 'tree' && n >= 7) assert.ok(t >= -30, `tree top ${n}: ${t}`);
        else assert.ok(t >= 40, `${style} top ${n}: ${t} px of sky`);
      }
    }
    const camY = cameraTargetY(STREET_GROUND_Y, worldH, VIEW);
    assert.ok(VIEW - (STREET_GROUND_Y - camY) >= MIN_GROUND_CLEARANCE);
    assert.equal(VIEW - (STREET_GROUND_Y - camY), 102);
  });

  it('moves stacks saved on the old 620 walk line down to the new one, once', () => {
    const rows = [{ y: 620 }, { y: 618 }, { y: STREET_GROUND_Y }, { y: 300 }, { y: 'x' }];
    assert.equal(liftOldStreetRows(rows, 620, STREET_GROUND_Y), 2);
    assert.deepEqual(rows.map((r) => r.y), [STREET_GROUND_Y, STREET_GROUND_Y - 2, STREET_GROUND_Y, 300, 'x']);
    assert.equal(liftOldStreetRows(rows, STREET_GROUND_Y, STREET_GROUND_Y), 0);
    assert.equal(liftOldStreetRows(null), 0);
  });

  it('remembers which walk line a save was made on', () => {
    homesFeature.restore({ decor: {}, cult: {} });
    assert.equal(homesFeature.save().streetGround, 620, 'an old save still needs its lift');
    homesFeature.restore({ decor: {}, cult: {}, streetGround: STREET_GROUND_Y });
    assert.equal(homesFeature.save().streetGround, STREET_GROUND_Y);
    homesFeature.restore(undefined);
    assert.equal(homesFeature.save().streetGround, STREET_GROUND_Y);
  });

  it('hands the walk line to game.js renderHomeScene', () => {
    const game = readFileSync(join(root, 'game.js'), 'utf8');
    assert.match(game, /GROUND_Y = Number\(homeScene\?\.groundY\) \|\| 620;/);
    const feature = readFileSync(join(root, 'js/features/homes-feature.js'), 'utf8');
    assert.match(feature, /groundY: STREET_GROUND_Y,/);
  });
});

describe('interior camera (walk and Decorate)', () => {
  const VIEW = 408;
  // Home interiors and Tower floors: 620 px ground, 660 px camera world (cameraWorldHeight)
  const frame = (look, anchor, view = VIEW) => {
    const camY = cameraTargetY(INTERIOR.floorY + look, 660, view, anchor);
    return { clearance: view - (INTERIOR.floorY - camY), camY };
  };
  // The location view grows with the window from 408 to 600 px (js/location-view.js).
  for (const view of [408, 500, 600]) {
    for (const [room, offset] of [['house', 150], ['Tower floor', 220]]) {
      it(`keeps the ${room}'s feet 40 px over the pack while walking and on entering Decorate (${view} px view)`, () => {
        // y_cam_offset 150 (default) / 220 (tower.js 487) as CameraMan anchors: 0.75 / 0.867
        const anchor = yCamOffsetAnchor(offset, view);
        const look = interiorLook({ anchor, view });
        const walk = frame(look.walk, anchor, view);
        assert.ok(walk.clearance >= MIN_GROUND_CLEARANCE, `${room} walk clearance ${walk.clearance}`);
        assert.ok(walk.clearance < MIN_GROUND_CLEARANCE + 1, 'and looks up as far as that allows');
        assert.ok(walk.camY <= INTERIOR.wallTop, 'the whole wall shows');
        // the ceiling look (a ceiling piece in hand; the avatar is hidden, HandOfDecorator.start hidePCs)
        const ceil = frame(look.ceiling, anchor, view);
        assert.ok(ceil.camY <= INTERIOR.ceilingTop, `${room}: ceiling band top ${INTERIOR.ceilingTop} in view from ${ceil.camY}`);
        assert.ok(ceil.camY + view >= INTERIOR.floorY - 40, 'and the wall down to just over the floor');
      });
    }
  }
  it('was the fixed looks: -105 px in Decorate put feet behind the pack (-3 house, -51 Tower)', () => {
    assert.equal(Math.round(frame(-105, 0.75).clearance), -3);
    assert.equal(Math.round(frame(-105, yCamOffsetAnchor(220)).clearance), -51);
    assert.ok(frame(-62, yCamOffsetAnchor(220)).clearance < 0, 'the old walk look in the Tower too');
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
    assert.deepEqual(stillSkipped, ['303']);
    // G153: the Door (recipe 260) builds now that a house can have more floors.
    assert.equal(recipes.furniture_door.id, '260');
    assert.deepEqual(recipes.furniture_door.inputs, [
      { classTsid: 'wood_post', qty: 8 },
      { classTsid: 'board', qty: 16 },
      { classTsid: 'snail', qty: 20 },
    ]);
  });

  it('stocks the Construction Tool and Bulb where catalog_stores.js sells them', () => {
    assert.match(stores, /"classTsid": "construction_tool",\s+"label": "Construction Tool",\s+"cost": 560/);
    assert.match(stores, /"classTsid": "bulb",\s+"label": "Bulb",\s+"cost": 56/);
  });
});
