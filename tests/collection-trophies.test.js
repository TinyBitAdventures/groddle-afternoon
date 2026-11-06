/**
 * Collections counted from the pack (G533): the original checks a collection badge whenever an item
 * arrives, against what you hold at that moment (players/inc_items.js 593-597,
 * inc_achievements.js 520-544).
 */
import { before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadContentCatalogsFromDir, getAchievementCatalog } from '../public/js/content-catalogs.js?v=10b118dd';
import { applyAchievementProgress, createAchievementState, getAchievementProgress, resetAchievementCounter, unlockAchievement } from '../public/js/achievements.js?v=f8ccfd34';
import { HELD_AT_ONCE, collectionClasses, heldChanges } from '../public/js/collection-trophies.js?v=069a6848';
import { collectionTrophiesFeature as feature } from '../public/js/features/collection-trophies-feature.js?v=355c2b70';

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
