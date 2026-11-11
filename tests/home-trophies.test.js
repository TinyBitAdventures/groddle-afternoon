/**
 * Report 99: a trophy can be found and displayed at home through Decorate (js/home-trophies.js,
 * js/home-decor.js). Source: players/inc_furniture.js furniture_migrate_trophies 176-198,
 * items/trophy_*.js verbs.drop 72-100 and canDrop, bag_furniture_sdb.js 631, DecorateModel.as.
 * Source checks skip without the tinyspeck clones beside the game.
 */
import { before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TROPHY_DECOR, TROPHY_FIND_TEXT, TROPHY_WHERE_TEXT, trophyGotText, isTrophyDecor, placedTrophies, trophyOfBadge } from '../public/js/home-trophies.js?v=2020b29b';
import {
  createHomeDecorState,
  displayDeposit,
  displayRefusal,
  flipFurniture,
  furnitureDef,
  isFurniture,
  listPlaceable,
  normalizeHomeDecorState,
  pickUpFurniture,
  placeFurniture,
} from '../public/js/home-decor.js?v=b2831539';
import { cabinetRefusal } from '../public/js/home-storage.js?v=121f1897';
import { canSellClass } from '../public/js/home-street-mp.js?v=727bf13e';
import { filterTiles, furniturePane, trayFilters } from '../public/js/ui/home-builder.js?v=b71acd91';
import { hasUpgrades, upgradeVerb } from '../public/js/furniture-upgrades.js?v=a3788c0d';
import { NO_SLOT_CLASSES } from '../public/js/pack-slots-data.js?v=800f664c';
import { layoutPack, takesNoSlot } from '../public/js/pack-slots.js?v=6cf9f397';
import { WORLD_ART } from '../public/js/world-art-list.js?v=2d47f296';
import { homeTrophyCount, isTrophyClass } from '../public/js/features/item-verbs-feature.js?v=8be95548';
import { homesFeature } from '../public/js/features/homes-feature.js?v=6ea63fe5';
import { planStreetTrophies } from '../public/js/street-jobs.js?v=68562ef0';
import { planEggTrophy } from '../public/js/seasons.js?v=1978c3f3';
import { collectionTrophiesFeature as collection } from '../public/js/features/collection-trophies-feature.js?v=2507feab';
import { loadContentCatalogsFromDir } from '../public/js/content-catalogs.js?v=10b118dd';
import { applyAchievementProgress, createAchievementState } from '../public/js/achievements.js?v=2e4aa9cb';

const here = dirname(fileURLToPath(import.meta.url));
const GS = join(here, '../../glitch-GameServerJS');
const hasGsjs = existsSync(join(GS, 'items/trophy_gem.js'));
const GEM = 'trophy_gem';
/** Round trip as a save does. */
const reload = (decor) => normalizeHomeDecorState(JSON.parse(JSON.stringify(decor)));
const copies = (decor, inv, cls) => (inv[cls] || 0) + (decor.storage[cls] || 0) + decor.placed.filter((r) => r.classTsid === cls).length;

describe('the eighteen trophies', () => {
  it('are the original\'s classes, names and words', { skip: !hasGsjs }, () => {
    const classes = readdirSync(join(GS, 'items')).filter((f) => /^trophy_.*\.js$/.test(f) && !/_piece\d|^trophy_base/.test(f)).map((f) => f.replace('.js', ''));
    assert.deepEqual(Object.keys(TROPHY_DECOR).sort(), classes.sort());
    for (const cls of classes) {
      const src = readFileSync(join(GS, 'items', `${cls}.js`), 'utf8');
      assert.equal(TROPHY_DECOR[cls].label, /var name_single = "([^"]*)"/.exec(src)[1], cls);
      assert.equal(TROPHY_DECOR[cls].desc, /var description = "((?:[^"\\]|\\.)*)"/.exec(src)[1].replace(/\\"/g, '"'), cls);
    }
  });

  it('each has its own CC0 world frame and tray icon, at the frame\'s size', () => {
    assert.equal(Object.keys(TROPHY_DECOR).length, 18);
    for (const [cls, def] of Object.entries(TROPHY_DECOR)) {
      assert.deepEqual([def.art.w, def.art.h], WORLD_ART[cls]['1'], cls);
      assert.ok(existsSync(join(here, '../public', def.art.path)), def.art.path);
      assert.ok(existsSync(join(here, '../public/assets/sprites/icons', `${cls}.webp`)), cls);
      assert.equal(isTrophyClass(cls), true);
    }
    assert.equal(isTrophyDecor('trophy_street_creator_wood_piece1'), false);
    assert.equal(furnitureDef('trophy_street_creator_wood_piece1'), null);
    assert.equal(isFurniture('furniture_chair'), true);
  });

  it('every badge that gives one names it; the Badges line has no em-dash', () => {
    assert.equal(trophyOfBadge('collection_gems'), GEM);
    assert.equal(trophyOfBadge('collection_egg_hunter'), 'trophy_egghunt');
    assert.equal(trophyOfBadge('collection_street_creator_wood'), 'trophy_street_creator_wood');
    assert.equal(trophyOfBadge('fine_friend'), null);
    assert.doesNotMatch(TROPHY_FIND_TEXT, /—/);
    // The line giving a trophy says where it went: it never shows in the pack (report 2026-11-08).
    assert.equal(trophyGotText('You got the Gem Trophy!'), `You got the Gem Trophy! ${TROPHY_WHERE_TEXT}`);
    assert.match(TROPHY_WHERE_TEXT, /Decorate/);
    assert.doesNotMatch(TROPHY_WHERE_TEXT, /—|Glitch/);
  });

  it('still takes no pack slot: the Decorate tray is where it shows', () => {
    for (const cls of Object.keys(TROPHY_DECOR)) assert.ok(NO_SLOT_CLASSES.has(cls) && takesNoSlot(cls), cls);
    const layout = layoutPack({ [GEM]: 1 }, null, {});
    assert.equal(JSON.stringify(layout).includes(GEM), false);
    assert.equal(furniturePane(GEM), 'trophies');
    const rows = listPlaceable(createHomeDecorState(), { [GEM]: 1, trophy_street_creator_rock: 1 });
    assert.deepEqual(rows.map((r) => r.classTsid).sort(), [GEM, 'trophy_street_creator_rock']);
    assert.deepEqual(trayFilters(rows).map((f) => f.label), ['2 furniture items', '2 trophies']);
    assert.equal(filterTiles(rows, 'trophies').length, 2);
  });
});

describe('placing one and picking it back up', () => {
  it('a save holding a trophy in its pack count places it with no migration, and never has two', () => {
    const decor = createHomeDecorState();
    const inv = { [GEM]: 1 };
    assert.deepEqual(listPlaceable(decor, inv).map((r) => [r.classTsid, r.total]), [[GEM, 1]]);
    const placed = placeFurniture(decor, inv, GEM, { x: 500 });
    assert.equal(placed.ok, true);
    assert.equal(inv[GEM], 0);
    assert.equal(copies(decor, inv, GEM), 1);
    assert.deepEqual(listPlaceable(decor, inv), [], 'none left to place');
    assert.equal(placeFurniture(decor, inv, GEM, { x: 600 }).ok, false);
    // Saved and loaded where it stands.
    const loaded = reload(decor);
    assert.equal(loaded.placed.length, 1);
    assert.equal(loaded.placed[0].classTsid, GEM);
    assert.equal(loaded.placed[0].x, placed.item.x);
    // Picked up: into furniture storage, as a piece of furniture does, and saved there too.
    const up = pickUpFurniture(loaded, loaded.placed[0].id);
    assert.equal(up.ok, true);
    assert.equal(copies(loaded, inv, GEM), 1);
    const again = reload(loaded);
    assert.equal(again.storage[GEM], 1);
    assert.deepEqual(listPlaceable(again, inv).map((r) => [r.classTsid, r.stored, r.packed]), [[GEM, 1, 0]]);
    assert.equal(placeFurniture(again, inv, GEM, { x: 700 }).ok, true);
    assert.equal(copies(again, inv, GEM), 1);
  });

  it('stands on a table under it, and comes back with the table', () => {
    const decor = createHomeDecorState();
    const inv = { furniture_table: 1, [GEM]: 1 };
    const table = placeFurniture(decor, inv, 'furniture_table', { x: 600 });
    const gem = placeFurniture(decor, inv, GEM, { x: 600 });
    assert.equal(gem.item.on, table.item.id);
    assert.ok(gem.item.y < table.item.y);
    const up = pickUpFurniture(decor, table.item.id);
    assert.deepEqual(up.lifted.sort(), ['furniture_table', GEM].sort());
    assert.equal(copies(decor, inv, GEM), 1);
  });

  it('it is no furniture: no price, no style, no flip, nothing rests on it', () => {
    const decor = createHomeDecorState();
    const inv = { [GEM]: 1, furniture_tabledeco: 1 };
    const gem = placeFurniture(decor, inv, GEM, { x: 500 });
    assert.equal(canSellClass(GEM), false);
    assert.equal(hasUpgrades(GEM), false);
    assert.equal(upgradeVerb(gem.item), null);
    assert.equal(flipFurniture(decor, gem.item.id).ok, false);
    const deco = placeFurniture(decor, inv, 'furniture_tabledeco', { x: 500 });
    assert.equal(deco.item.on, null);
  });

  it('a cabinet and a Storage Display Box refuse it (bag_furniture_cabinet.js 440, bag_furniture_sdb.js 631)', () => {
    assert.equal(cabinetRefusal(GEM, { noSlot: NO_SLOT_CLASSES.has(GEM) || isFurniture(GEM) })?.reason, 'cant');
    const box = { id: 1, classTsid: 'bag_furniture_sdb' };
    assert.equal(displayRefusal(box, GEM)?.reason, 'bad_item');
    const decor = createHomeDecorState();
    const inv = { bag_furniture_sdb: 1, [GEM]: 1 };
    const sdb = placeFurniture(decor, inv, 'bag_furniture_sdb', { x: 500 });
    assert.equal(displayDeposit(decor, inv, sdb.item.id, GEM, 1).ok, false);
    assert.equal(inv[GEM], 1);
  });
});

describe('Humble Bragger (locations/home.js 46-50, trophy_base verbs.drop 94-98)', () => {
  it('counts placed trophies with dropped ones', () => {
    assert.equal(homeTrophyCount({}, 11), 11);
    assert.equal(placedTrophies([{ placed: [{ classTsid: GEM }, { classTsid: 'furniture_chair' }] }, { placed: [{ classTsid: 'trophy_gas' }] }, null]), 2);
  });

  it('the house counts on every floor, the Tower does not, and storage is held but not on show', () => {
    const decor = createHomeDecorState();
    const inv = { [GEM]: 1, trophy_gas: 1, trophy_fruit: 1 };
    placeFurniture(decor, inv, GEM, { x: 500 });
    const upper = createHomeDecorState();
    placeFurniture(upper, inv, 'trophy_gas', { x: 500 });
    const tower = createHomeDecorState();
    placeFurniture(tower, inv, 'trophy_fruit', { x: 500 });
    decor.storage.trophy_spice = 1;
    homesFeature.restore({ decor, floors: { upper: [upper], pending: null }, towerDecor: [tower] }, { param: () => null, setData() {}, inv: {} });
    assert.equal(homesFeature.homeTrophiesPlaced(), 2);
    assert.equal(homesFeature.homeFurnitureHeld(GEM), 1);
    assert.equal(homesFeature.homeFurnitureHeld('trophy_gas'), 1);
    assert.equal(homesFeature.homeFurnitureHeld('trophy_fruit'), 1);
    assert.equal(homesFeature.homeFurnitureHeld('trophy_spice'), 1);
    assert.equal(homesFeature.homeFurnitureHeld('trophy_bubble'), 0);
    homesFeature.restore({}, { param: () => null, setData() {}, inv: {} });
  });
});

describe('a trophy that has left the pack is not given again', () => {
  before(async () => {
    await loadContentCatalogsFromDir(join(here, '../public/assets/content'));
  });
  const engineFor = (held) => {
    const achieve = createAchievementState();
    return {
      started: true,
      inv: {},
      pc: { imaginationUpgrades: [] },
      unlockedAchievements: ['collection_gems'],
      achievement: (c, n = 1) => applyAchievementProgress(achieve, c, n, {}),
      resetAchievementCounter() {},
      pushActivity() {},
      save() {},
      refreshPack() {},
      setData() {},
      param: () => null,
      query: (hook, cls) => (hook === 'homeFurnitureHeld' ? held(cls) : null),
    };
  };

  it('a collection badge: settled once with the trophy in the pack, then placed, then reloaded', () => {
    collection.restore({ given: [] });
    let onShow = 0;
    const engine = engineFor(() => onShow);
    engine.inv[GEM] = 1;
    collection.onTick(16, 1e9, engine);
    assert.deepEqual(collection.save().given, ['collection_gems']);
    assert.equal(engine.inv[GEM], 1);
    engine.inv[GEM] = 0;
    onShow = 1;
    collection.onTick(16, 2e9, engine);
    assert.equal(engine.inv[GEM], 0);
    collection.restore(JSON.parse(JSON.stringify(collection.save())));
    collection.onTick(16, 3e9, engine);
    assert.equal(engine.inv[GEM], 0);
  });

  it('a collection badge with no record yet: one standing in the house settles it without a second', () => {
    collection.restore({ given: [] });
    const engine = engineFor((cls) => (cls === GEM ? 1 : 0));
    collection.onTick(16, 4e9, engine);
    assert.deepEqual(collection.save().given, ['collection_gems']);
    assert.equal(engine.inv[GEM] || 0, 0);
    collection.restore({ given: [] });
  });

  it('Street Creator and Egg Hunter keep their own record, whatever the pack holds', () => {
    assert.deepEqual(planStreetTrophies({ trophiesGranted: ['rock'] }, ['collection_street_creator_rock'], () => 0), []);
    assert.equal(planEggTrophy({ trophyGiven: true }, ['collection_egg_hunter'], () => 0), null);
  });
});
