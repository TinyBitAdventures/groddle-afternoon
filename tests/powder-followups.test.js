/**
 * G137 powder follow-ups: Fertilidust bringing dead trants back
 * (fertilidust.js onUse replaceWith, js/patches.js reviveDeadTree), the
 * no-cheating check on Essence of Hairball / Hairball Flower / Spinach in a
 * game location, and why Juju Shoo-Shoo Powder stays unobtainable.
 * Run: node --test tests/powder-followups.test.js
 */
import { before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { REVIVED_TRANT, createPlot, reviveDeadTree, tickPlot } from '../public/js/patches.js?v=1ba4f75f';
import { powdersFeature } from '../public/js/features/powders-feature.js?v=7abf1cc4';
import { HEADSPACE_SCENE, itemVerbsFeature, inGameLocation } from '../public/js/features/item-verbs-feature.js?v=297a2b0e';
import { ROOK_WOODS_STREET_ID } from '../public/js/rook-woods.js?v=1b765560';
import { INSTANCES as GWENDOLYN_INSTANCES, ROOM_ID as GWENDOLYN_ROOM } from '../public/js/quest-rooms/gwendolyn.js?v=3c1b3c3d';
import { questSceneTsid } from '../public/js/quest-instance.js?v=f0df88c3';
import { GAME_CHEAT_BLOCKS, SPINACH_TEXT, gameCheatBlock } from '../public/js/item-verbs.js?v=994d3d4f';
import { CROWNS_STREET } from '../public/js/game-of-crowns.js?v=e32f35f5';
import { HOG_HAUL_STREET_ID } from '../public/js/hog-haul.js?v=50d2e072';
import { raceSceneTsid } from '../public/js/races.js?v=ab22a079';
import { loadContentCatalogsFromDir } from '../public/js/content-catalogs.js?v=10b118dd';

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

describe('ticket 90: Spinach refuses the challenge rooms, as spinach.js activate did', () => {
  const gate = (streetTsid, extra = {}) => itemVerbsFeature.packUseGate('spinach', { streetTsid, hasBuff: () => false, transientInstance: () => true, ...extra });
  const unfair = "I'd say, doing that would give you an unfair advantage.";

  it('Mental Block (all its scenes), Light Perspective, Radiant Glare, Color Unblocking and Picto Pattern refuse it', () => {
    for (const tsid of ['QI_MENTAL_BLOCK_MB1', 'QI_MENTAL_BLOCK_MB2', 'QI_LIGHT_PERSPECTIVE_A', 'QI_RADIANT_GLARE_X', 'QI_COLOR_UNBLOCKING_1', 'QI_PICTO_PATTERN_1']) {
      assert.deepEqual(gate(tsid), { ok: false, msg: unfair }, tsid);
    }
    // The Winter Walk's streets only while the walk holds them.
    assert.deepEqual(gate('GIFH2AKJ5I735SV'), { ok: false, msg: unfair });
    assert.equal(gate('GIFH2AKJ5I735SV', { transientInstance: () => false }), null);
    // Elsewhere it works, a room not in the list too (Join the Club).
    assert.equal(gate('GLI3272LOTD1B1F'), null);
    assert.equal(gate('QI_CLUBHOUSE_CLUBHOUSE'), null);
    assert.deepEqual(gate('GLI3272LOTD1B1F', { hasBuff: (id) => id === 'super_pooped' }), { ok: false, msg: "You're too Pooped to even activate some Spinach." });
    // Games keep their own line.
    assert.deepEqual(gate(CROWNS_STREET), { ok: false, msg: GAME_CHEAT_BLOCKS.spinach });
  });

  it('the source lines', { skip: !existsSyncSafe(join(root, '..', 'glitch-GameServerJS', 'items/spinach.js')) && 'no GSJS' }, () => {
    const src = readFileSync(join(root, '..', 'glitch-GameServerJS', 'items/spinach.js'), 'utf8');
    for (const id of ['mental_block', 'mental_block_rem', 'mental_block_2', 'puzzle_level_light_perspective', 'radiant_glare', 'color_unblocking', 'picto_pattern', 'level_quest_winter_walk']) {
      assert.ok(src.includes(`pc.location.isInstance('${id}')) return {state:'disabled', reason: "${unfair}"}`), id);
    }
  });
});

describe("Spinach refuses the Rook's trial and Gwendolyn's Outer Mind, as spinach.js activate did", () => {
  const gate = (streetTsid, extra = {}) => itemVerbsFeature.packUseGate('spinach', { streetTsid, hasBuff: () => false, transientInstance: () => true, ...extra });
  const rook = 'The effects of the Rook hamper the power of the Spinach.';
  const headspace = "It's already crazy enough in here, don't you think?";

  it("in Rooks' Woods (the humbaba instance) and the Outer Mind (tower_quest_headspace), with their own lines", () => {
    assert.deepEqual(gate(ROOK_WOODS_STREET_ID), { ok: false, msg: rook });
    assert.deepEqual(gate(HEADSPACE_SCENE), { ok: false, msg: headspace });
    assert.equal(SPINACH_TEXT.rook, rook);
    assert.equal(SPINACH_TEXT.headspace, headspace);
    // The Outer Mind is the gwendolyn room's outer_mind stage; the chain's other rooms let Spinach be.
    assert.equal(GWENDOLYN_INSTANCES.outer_mind.instanceId, 'tower_quest_headspace');
    assert.equal(HEADSPACE_SCENE, questSceneTsid(GWENDOLYN_ROOM, 'outer_mind'));
    for (const stage of ['desert', 'inner_mind', 'chamber']) assert.equal(gate(questSceneTsid(GWENDOLYN_ROOM, stage)), null, stage);
  });

  it("in the source's order: the Rook, the Outer Mind, Pooped, then a game and the challenge rooms", () => {
    const pooped = { hasBuff: (id) => id === 'pooped' };
    assert.deepEqual(gate(ROOK_WOODS_STREET_ID, pooped), { ok: false, msg: rook });
    assert.deepEqual(gate(HEADSPACE_SCENE, pooped), { ok: false, msg: headspace });
    // Pooped comes before is_game (219 before 221).
    assert.deepEqual(gate(CROWNS_STREET, pooped), { ok: false, msg: SPINACH_TEXT.pooped });
    assert.deepEqual(gate(CROWNS_STREET), { ok: false, msg: GAME_CHEAT_BLOCKS.spinach });
  });

  it('only Spinach: the other game-refused items keep their game line alone', () => {
    for (const cls of ['essence_of_hairball', 'hairball_flower']) {
      assert.equal(itemVerbsFeature.packUseGate(cls, { streetTsid: ROOK_WOODS_STREET_ID, hasBuff: () => true, transientInstance: () => true }), null, cls);
      assert.equal(itemVerbsFeature.packUseGate(cls, { streetTsid: HEADSPACE_SCENE, transientInstance: () => true }), null, cls);
      assert.deepEqual(itemVerbsFeature.packUseGate(cls, { streetTsid: CROWNS_STREET }), { ok: false, msg: GAME_CHEAT_BLOCKS[cls] });
    }
  });

  const gsjs = join(root, '..', 'glitch-GameServerJS');
  it('the source lines and order, and no other item has them', { skip: !existsSyncSafe(join(gsjs, 'items/spinach.js')) && 'no GSJS' }, () => {
    const src = readFileSync(join(gsjs, 'items/spinach.js'), 'utf8');
    const conds = src.slice(src.indexOf('verbs.activate'));
    const at = (needle) => {
      const i = conds.indexOf(needle);
      assert.ok(i >= 0, needle);
      return i;
    };
    const a = at(`if (pc.location.isInstance('humbaba')) return {state:'disabled', reason: "${rook}"};`);
    const b = at(`if (pc.location.isInstance('tower_quest_headspace')) return {state:'disabled', reason: "${headspace}"};`);
    const c = at(`reason: "${SPINACH_TEXT.pooped}"`);
    const d = at('if (pc.location.is_game)');
    assert.ok(a < b && b < c && c < d);
    // The humbaba instance is the Rook egg quest's (the remake's Rooks' Woods).
    assert.match(readFileSync(join(gsjs, 'quests/rook_egg_smash.js'), 'utf8'), /instance_id: 'humbaba'/);
    const others = readdirSync(join(gsjs, 'items')).filter((f) => f.endsWith('.js') && f !== 'spinach.js')
      .filter((f) => /isInstance\('(humbaba|tower_quest_headspace)'\)\) return \{state:\s*'disabled'/.test(readFileSync(join(gsjs, 'items', f), 'utf8')));
    assert.deepEqual(others, []);
  });
});

function existsSyncSafe(p) {
  try {
    readFileSync(p);
    return true;
  } catch {
    return false;
  }
}
