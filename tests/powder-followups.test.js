/**
 * G137 powder follow-ups: Fertilidust bringing dead trants back
 * (fertilidust.js onUse replaceWith, js/patches.js reviveDeadTree), the
 * no-cheating check on Essence of Hairball / Hairball Flower / Spinach in a
 * game location, and why Juju Shoo-Shoo Powder stays unobtainable.
 * Run: node --test tests/powder-followups.test.js
 */
import { before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { REVIVED_TRANT, createPlot, reviveDeadTree, tickPlot } from '../public/js/patches.js?v=g414-1';
import { powdersFeature } from '../public/js/features/powders-feature.js?v=g463-2';
import { itemVerbsFeature, inGameLocation } from '../public/js/features/item-verbs-feature.js?v=g473-1';
import { GAME_CHEAT_BLOCKS, gameCheatBlock } from '../public/js/item-verbs.js?v=item-verbs-4';
import { CROWNS_STREET } from '../public/js/game-of-crowns.js?v=crowns-2';
import { HOG_HAUL_STREET_ID } from '../public/js/hog-haul.js?v=hog-haul-2';
import { raceSceneTsid } from '../public/js/races.js?v=races-4';
import { loadContentCatalogsFromDir } from '../public/js/content-catalogs.js?v=g403-1';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const GSJS = join(root, '../glitch-GameServerJS');

before(async () => {
  await loadContentCatalogsFromDir(join(root, 'public/assets/content'));
});

describe('Fertilidust revives dead trants', () => {
  beforeEach(() => powdersFeature._reset());

  it('fertilidust.js onUse: health 4 then plusHealth, maturity 3 then plusMaturity', () => {
    const src = readFileSync(join(GSJS, 'items/fertilidust.js'), 'utf8');
    assert.ok(src.includes("trant.setInstanceProp('health', 4);\n\t\t\t\ttrant.plusHealth();"));
    assert.ok(src.includes("trant.setInstanceProp('maturity', 3);\n\t\t\t\ttrant.plusMaturity();"));
    assert.deepEqual({ ...REVIVED_TRANT }, { maturity: 4, health: 5 });
  });

  it('a dead plot becomes its living trant on its own soil', () => {
    const plot = createPlot('trant_egg_dead', { now: 1 });
    const tree = reviveDeadTree(plot, 10);
    assert.equal(tree.classId, 'trant_egg');
    assert.equal(plot.stage, 'tree');
    assert.equal(plot.kind, 'patch_dark');
    assert.equal(plot.classTsid, 'patch_dark');
    assert.equal(tree.state.maturity, 4);
    assert.equal(tree.state.health, 5);
    assert.equal(reviveDeadTree(createPlot('patch'), 10), null);
  });

  it('tickPlot revives a plot Fertilidust marked, and only then', () => {
    const plot = createPlot('trant_bean_dead', { now: 1 });
    assert.deepEqual(tickPlot(plot, 5).events, []);
    plot.fertilidustAt = 5;
    const out = tickPlot(plot, 6);
    assert.ok(out.events.includes('revived'));
    assert.equal(plot.stage, 'tree');
    assert.equal(plot.fertilidustAt, undefined);
  });

  it('Disperse with only dead trants: they come back, 25 iMG each, the charge is used', () => {
    const plots = { 'trant_bean_dead:0': createPlot('trant_bean_dead'), 'tree:3': createPlot('trant_fruit_dead') };
    const said = [];
    const engine = {
      inv: { fertilidust: 1 },
      pc: { xp: 0, imagination: 0, energy: 50, mood: 75 }, // the x1 mood band (G148)
      player: { x: 100, y: 400 },
      interactables: [
        { classId: 'trant_bean_dead', featureId: 'patches', patchKey: 'trant_bean_dead:0', sprite: { x: 50, destroyed: false } },
        { classId: 'trant_fruit_dead', featureId: 'patches', patchKey: 'tree:3', sprite: { x: 90, destroyed: false } },
      ],
      streetSlot: (id) => (id === 'patches' ? { plots } : {}),
      hasBuff: () => false,
      achievement: () => {},
      playSound: () => {},
      pushActivity: (t) => said.push(t),
      toast: () => {},
      refreshPack: () => {},
      updateHud: () => {},
      save: () => {},
      setData: () => {},
      floatText: () => {},
    };
    const last = powdersFeature.runPackVerb('fertilidust', 'disperse', engine) && powdersFeature._state().last;
    assert.equal(last, 'fertilidust:trees:0:revived:2');
    assert.equal(engine.pc.xp, 50);
    assert.deepEqual(said, ['Oooh! That powder brought 2 trees back to life!']);
    assert.ok(plots['trant_bean_dead:0'].fertilidustAt > 0);
    assert.ok(plots['tree:3'].fertilidustAt > 0);
    assert.equal(powdersFeature._state().charges.fertilidust, 4);
  });

  it('records why rooked-tree relief and Feat points have nothing to build', () => {
    assert.ok(readFileSync(join(GSJS, 'items/include/trants.js'), 'utf8').includes('this.reduceRookedness(60);'));
    assert.ok(!/function reduceRookedness/.test(readFileSync(join(GSJS, 'items/include/rook.js'), 'utf8')));
    assert.match(readFileSync(join(GSJS, 'players/inc_feats.js'), 'utf8'), /function feats_increment_for_commit\(amount\)\{\n\treturn;/);
  });
});

describe('no cheating in games (location.is_game)', () => {
  it('copies each item\'s refusal line', () => {
    const lines = {
      essence_of_hairball: 'items/essence_of_hairball.js',
      hairball_flower: 'items/hairball_flower.js',
      spinach: 'items/spinach.js',
    };
    for (const [classTsid, file] of Object.entries(lines)) {
      const src = readFileSync(join(GSJS, file), 'utf8');
      assert.ok(src.includes(GAME_CHEAT_BLOCKS[classTsid].replace("'", "\\'")) || src.includes(GAME_CHEAT_BLOCKS[classTsid]), classTsid);
    }
  });

  it('races, Grab \'Em Good, Game of Crowns and the Hog Haul are games; streets are not', () => {
    assert.equal(inGameLocation(raceSceneTsid('space_race')), true);
    assert.equal(inGameLocation(raceSceneTsid('grab_em_good')), true);
    assert.equal(inGameLocation(CROWNS_STREET), true);
    assert.equal(inGameLocation(HOG_HAUL_STREET_ID), true);
    assert.equal(inGameLocation('GLI32G3NUTD100I'), false);
  });

  it('packUseGate refuses the three items only in a game', () => {
    assert.deepEqual(itemVerbsFeature.packUseGate('essence_of_hairball', { streetTsid: CROWNS_STREET }), { ok: false, msg: "You're playing a game. No cheating!" });
    assert.equal(itemVerbsFeature.packUseGate('spinach', { streetTsid: HOG_HAUL_STREET_ID }).msg, 'Nice try, cheater!');
    assert.equal(itemVerbsFeature.packUseGate('hairball_flower', { streetTsid: raceSceneTsid('time_warp') }).msg, 'That would be cheating!');
    assert.equal(itemVerbsFeature.packUseGate('essence_of_hairball', { streetTsid: 'GLI32G3NUTD100I' }), null);
    assert.equal(gameCheatBlock('apple', true), null);
  });
});

describe('Juju Shoo-Shoo Powder', () => {
  it('stays unobtainable: learnt 3 recipe, no Craftybot category, retired target', () => {
    const recipes = readFileSync(join(GSJS, 'items/catalog_recipes.js'), 'utf8');
    const block = recipes.slice(recipes.indexOf('this.recipes["170"]'), recipes.indexOf('this.recipes["171"]'));
    assert.match(block, /juju_shoo_shoo_powder/);
    assert.match(block, /learnt : 3/);
    assert.match(readFileSync(join(GSJS, 'main.js'), 'utf8'), /if \(catalog\.recipes\[rid\]\.learnt == 3\) continue;/);
    const skipped = JSON.parse(readFileSync(join(root, 'public/assets/content/recipes-skipped.json'), 'utf8')).skipped;
    assert.ok(skipped.some((r) => r.id === '170'));
    const overrides = JSON.parse(readFileSync(join(root, 'tools/inventory/overrides.json'), 'utf8'));
    assert.equal(overrides['item:juju_shoo_shoo_powder'].status, 'excluded');
  });
});
