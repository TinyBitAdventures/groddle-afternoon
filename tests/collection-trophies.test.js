/**
 * Collections counted from the pack (G533) and their trophies (G530): the original checks a collection
 * badge whenever an item arrives, against what you hold at that moment (players/inc_items.js 593-597,
 * inc_achievements.js 520-544), and each badge's onComplete makes its one trophy.
 */
import { before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadContentCatalogsFromDir, getAchievementCatalog } from '../public/js/content-catalogs.js?v=10b118dd';
import { applyAchievementProgress, createAchievementState, getAchievementProgress, resetAchievementCounter, unlockAchievement } from '../public/js/achievements.js?v=f8ccfd34';
import { COLLECTION_TROPHIES, COUNTED_ON_ARRIVAL, HELD_AT_ONCE, collectionClasses, heldChanges, planCollectionTrophies } from '../public/js/collection-trophies.js?v=69205984';
import { ITEM_CATALOG } from '../public/js/inventory.js?v=b7609342';
import { vendorSellValue } from '../public/js/vendor.js?v=307aca18';
import { collectionTrophiesFeature as feature } from '../public/js/features/collection-trophies-feature.js?v=bb848f8f';

const here = dirname(fileURLToPath(import.meta.url));
const GS = join(here, '../../glitch-GameServerJS');
const GEMS = ['gem_amber', 'gem_diamond', 'gem_moonstone', 'gem_ruby', 'gem_sapphire'];

/** The engine a feature sees, on the real badge rules. */
function makeEngine(inv = {}, achieve = createAchievementState()) {
  const engine = {
    started: true,
    inv,
    pc: { imaginationUpgrades: [], energy: 100, mood: 100, xp: 0, imagination: 0, currants: 0 },
    achieve,
    announced: [],
    get unlockedAchievements() { return achieve.unlocked; },
    achievement(counter, n = 1) {
      for (const u of applyAchievementProgress(achieve, counter, n, this.pc)) if (u.unlocked) this.announced.push(u.classTsid);
    },
    resetAchievementCounter: (counter) => resetAchievementCounter(achieve, counter),
    grantAchievement(id) {
      const r = unlockAchievement(achieve, id, this.pc);
      if (r.ok) this.announced.push(id);
      return r.ok;
    },
    activity: [],
    pushActivity(line) { this.activity.push(line); },
    saves: 0,
    save() { this.saves += 1; },
  };
  return engine;
}
let clock = 0;
function tick(engine, n = 1) {
  for (let i = 0; i < n; i += 1) {
    clock += 1000;
    feature.onTick(16, clock, engine);
  }
}
const allGems = (n = 1) => Object.fromEntries(GEMS.map((g) => [g, n]));

before(async () => {
  await loadContentCatalogsFromDir(join(here, '../public/assets/content'));
});
beforeEach(() => {
  clock += 10_000;
  feature.restore?.();
});
const owned = (cls, inv) => inv[cls] || 0;
const packFor = (badge, n = 1) => Object.fromEntries(collectionClasses(getAchievementCatalog()[badge]).map((c) => [c, n]));

describe('Gem Collector (G533)', () => {
  it('the source asks for the five gems held, as the catalog does', { skip: !existsSync(GS) }, () => {
    const src = readFileSync(join(GS, 'achievements/collection_gems.js'), 'utf8');
    for (const g of GEMS) assert.match(src, new RegExp(`group\\t: "in_inventory",\\n\\t\\tlabel\\t: "${g}"`));
    assert.deepEqual(collectionClasses(getAchievementCatalog().collection_gems).sort(), GEMS);
    const items = readFileSync(join(GS, 'players/inc_items.js'), 'utf8');
    assert.match(items, /achievements_get_from_counter\('in_inventory', stack\.class_id\);[\s\S]{0,120}achievements_check_in_inventory\(id\)/);
    const ach = readFileSync(join(GS, 'players/inc_achievements.js'), 'utf8');
    assert.match(ach, /function achievements_check_in_inventory[\s\S]{0,500}this\.countItemClass\(data\.label\) < intval\(data\.value\)/);
    assert.ok(HELD_AT_ONCE.includes('collection_gems'));
  });

  it('a player already holding all five is credited at the first look, with the rewards, once', () => {
    const engine = makeEngine(allGems());
    tick(engine);
    assert.deepEqual(engine.announced, ['collection_gems']);
    assert.equal(engine.pc.xp, 500);
    tick(engine, 3);
    assert.deepEqual(engine.announced, ['collection_gems'], 'once');
    assert.equal(engine.pc.xp, 500);
  });

  it('the fifth gem earning it, however it arrives', () => {
    const inv = allGems();
    delete inv.gem_ruby;
    const engine = makeEngine(inv);
    tick(engine, 2);
    assert.deepEqual(engine.announced, []);
    assert.equal(getAchievementProgress(engine.achieve, 'collection_gems').conditions.filter((c) => c.current > 0).length, 4, 'the Badges panel shows four');
    inv.gem_ruby = 1;
    tick(engine);
    assert.deepEqual(engine.announced, ['collection_gems']);
  });

  it('must be held at once: a gem sold before the last arrives does not count', () => {
    const inv = allGems();
    delete inv.gem_ruby;
    const engine = makeEngine(inv);
    tick(engine);
    inv.gem_amber = 0;
    tick(engine);
    inv.gem_ruby = 1;
    tick(engine);
    assert.deepEqual(engine.announced, []);
    assert.equal(getAchievementProgress(engine.achieve, 'collection_gems').conditions.filter((c) => c.current > 0).length, 4);
    inv.gem_amber = 2;
    tick(engine);
    assert.deepEqual(engine.announced, ['collection_gems']);
  });

  it('a saved count outlives neither the gem nor the reload', () => {
    const achieve = createAchievementState();
    applyAchievementProgress(achieve, 'in_inventory:gem_amber', 1);
    const engine = makeEngine({ gem_diamond: 1 }, achieve);
    tick(engine);
    const got = getAchievementProgress(achieve, 'collection_gems').conditions.filter((c) => c.current > 0).map((c) => c.name);
    assert.deepEqual(got, ['gem_diamond']);
  });

  it('waits for the game to start and nothing happens with an empty pack', () => {
    const engine = makeEngine(allGems());
    engine.started = false;
    tick(engine);
    assert.deepEqual(engine.announced, []);
    const empty = makeEngine({});
    tick(empty);
    assert.deepEqual(empty.announced, []);
  });

  it('heldChanges: the first look counts both ways, later looks only what moved', () => {
    const inv = { a: 1 };
    const first = heldChanges(null, ['a', 'b'], (c) => inv[c]);
    assert.deepEqual([first.gained, first.lost], [['a'], ['b']]);
    inv.b = 2;
    inv.a = 0;
    const next = heldChanges(first.held, ['a', 'b'], (c) => inv[c]);
    assert.deepEqual([next.gained, next.lost], [['b'], ['a']]);
    assert.deepEqual(heldChanges(next.held, ['a', 'b'], (c) => inv[c]).gained, []);
  });
});

describe('collection trophies (G530)', () => {
  const MUSIC = ['collection_musicblocks_bb', 'collection_musicblocks_db', 'collection_musicblocks_dg', 'collection_musicblocks_dr', 'collection_musicblocks_xs'];

  it('every badge names its trophy and collection_type 1 keeps the items, as the source', { skip: !existsSync(GS) }, () => {
    assert.equal(Object.keys(COLLECTION_TROPHIES).length, 13);
    for (const [badge, row] of Object.entries(COLLECTION_TROPHIES)) {
      const src = readFileSync(join(GS, `achievements/${badge}.js`), 'utf8');
      assert.match(src, /^var collection_type\t= 1;/m, badge);
      assert.ok(src.includes(`pc.createItemFromFamiliar("${row.trophy}", 1);`), `${badge} ${row.trophy}`);
      assert.deepEqual(getAchievementCatalog()[badge].rewards.items[0].class_id, row.trophy);
      const item = readFileSync(join(GS, `items/${row.trophy}.js`), 'utf8');
      // trophy_emblems.js 22 leaves collection_id blank: its badge's onComplete still names it.
      if (badge !== 'collection_all_emblems') assert.ok(item.includes(`"collection_id"\t: "${badge}"`), `${row.trophy} points back at ${badge}`);
      const words = (name) => JSON.parse(item.match(new RegExp(`^var ${name} = (".*");$`, 'm'))[1]);
      assert.equal(row.label, words('name_single'));
      assert.equal(row.desc, words('description'));
      assert.equal(ITEM_CATALOG[row.trophy].label, row.label);
      assert.equal(vendorSellValue(row.trophy, 1).total, 0, `${row.trophy}: base_cost 0, no vendor buys it`);
    }
    const ach = readFileSync(join(GS, 'players/inc_achievements.js'), 'utf8');
    assert.match(ach, /if \(achievement\.collection_type == 2\) this\.items_destroy/);
  });

  it('every badge is counted one way or the other, and only these', () => {
    const counted = [...HELD_AT_ONCE, ...COUNTED_ON_ARRIVAL, ...MUSIC].sort();
    assert.deepEqual(counted, Object.keys(COLLECTION_TROPHIES).sort());
    for (const id of Object.keys(COLLECTION_TROPHIES)) assert.ok(collectionClasses(getAchievementCatalog()[id]).length >= 4, id);
    assert.equal(COLLECTION_TROPHIES.collection_egg_hunter, undefined, 'js/seasons.js gives that one');
    assert.equal(COLLECTION_TROPHIES.collection_street_creator_rock, undefined, 'js/street-jobs.js gives those');
  });

  for (const badge of HELD_AT_ONCE) {
    it(`${badge}: holding it all earns the badge and one trophy, keeping the items`, () => {
      const inv = packFor(badge);
      const before = { ...inv };
      const engine = makeEngine(inv);
      tick(engine, 3);
      assert.deepEqual(engine.announced, [badge]);
      assert.equal(owned(COLLECTION_TROPHIES[badge].trophy, inv), 1);
      for (const [cls, n] of Object.entries(before)) assert.equal(inv[cls], n, `${cls} stays`);
      assert.deepEqual(engine.activity, [`You got the ${COLLECTION_TROPHIES[badge].label}!`]);
    });
  }

  it('a badge earned before trophies existed gets its trophy on load, without its rewards again', () => {
    for (const badge of [...MUSIC, 'collection_cubimals']) {
      const achieve = createAchievementState();
      unlockAchievement(achieve, badge, null);
      feature.restore?.();
      const inv = {};
      const engine = makeEngine(inv, achieve);
      tick(engine, 2);
      assert.equal(owned(COLLECTION_TROPHIES[badge].trophy, inv), 1, badge);
      assert.deepEqual(engine.announced, [], 'no second badge');
      assert.equal(engine.pc.xp, 0, 'no second reward');
      assert.equal(engine.saves, 1);
    }
  });

  it('never a second: not with one in the pack, not once it has left, not after a reload', () => {
    const achieve = createAchievementState();
    unlockAchievement(achieve, 'collection_gems', null);
    const inv = { trophy_gem: 1 };
    const engine = makeEngine(inv, achieve);
    tick(engine, 2);
    assert.equal(inv.trophy_gem, 1, 'one held stays one');
    assert.deepEqual(engine.activity, []);
    inv.trophy_gem = 0;
    tick(engine, 2);
    assert.equal(inv.trophy_gem, 0, 'dropped or stored, none comes back');
    const slice = JSON.parse(JSON.stringify(feature.save()));
    assert.deepEqual(slice.given, ['collection_gems']);
    feature.restore(slice);
    tick(engine, 2);
    assert.equal(inv.trophy_gem, 0);
  });

  it('one trophy per badge when two collections finish together', () => {
    const inv = { ...packFor('collection_gems'), ...packFor('collection_bubbles'), trophy_gas: 0 };
    const engine = makeEngine(inv);
    tick(engine, 2);
    assert.deepEqual(engine.announced.sort(), ['collection_bubbles', 'collection_gems']);
    assert.equal(inv.trophy_gem, 1);
    assert.equal(inv.trophy_bubble, 1);
    assert.equal(inv.trophy_gas, 0);
  });

  it('a Cubimal that came by trade counts, and a figure set free stays counted, as before', () => {
    const inv = packFor('collection_cubimals');
    const last = Object.keys(inv).pop();
    delete inv[last];
    const engine = makeEngine(inv);
    tick(engine);
    assert.deepEqual(engine.announced, []);
    const first = Object.keys(inv)[0];
    inv[first] = 0;
    tick(engine);
    inv[last] = 1;
    tick(engine);
    assert.deepEqual(engine.announced, ['collection_cubimals']);
    assert.equal(inv.trophy_cubimal, 1);
  });

  it('a Musicblock series earned through its own counters gets the trophy', () => {
    const inv = packFor('collection_musicblocks_dg');
    const engine = makeEngine(inv);
    for (const cls of Object.keys(inv)) engine.achievement(`in_inventory:${cls}`, 1);
    assert.deepEqual(engine.announced, ['collection_musicblocks_dg']);
    tick(engine, 2);
    assert.equal(inv.trophy_music_d_green, 1);
  });

  it('planCollectionTrophies is pure and quiet with nothing owed', () => {
    assert.deepEqual(planCollectionTrophies([], [], () => 0), []);
    assert.deepEqual(planCollectionTrophies(['collection_gems'], ['collection_gems'], () => 0), []);
    assert.deepEqual(planCollectionTrophies([], ['collection_gems'], () => 0), [{ badge: 'collection_gems', trophy: 'trophy_gem', give: true }]);
    assert.deepEqual(planCollectionTrophies([], ['collection_gems'], () => 1), [{ badge: 'collection_gems', trophy: 'trophy_gem', give: false }]);
  });
});
