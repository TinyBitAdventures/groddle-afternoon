/**
 * Enchanted Wood Trees and the rebuilt Enchanted Forest hollows
 * (js/enchanted-forests.js, js/woodcutting.js, tools/build-enchanted-forests.mjs,
 * features/enchanted-forest-feature.js).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertStreetGeometry, platformsScreen } from '../public/js/street-model.js?v=606bae73';
import {
  ENCHANTED_FORESTS,
  ENCHANTED_MUSIC,
  ENCHANTED_TREE_SHEETS,
  ENCHANTED_WOOD_TREE,
  SEEDLING_PET_NO_MORE,
  SEEDLING_PET_NO_MORE_LINES,
  advanceEnchantedTree,
  clipPlatform,
  createEnchantedTree,
  enchantedForestByTsid,
  enchantedPlankYield,
  enchantedTreeFrame,
  enchantedVariantFor,
  flattestWindow,
  hollowWidth,
  normalizeEnchantedTree,
  petEnchantedSeedling,
  seedlingRemainingMs,
} from '../public/js/enchanted-forests.js?v=dd04e11b';
import {
  WOOD_TREE_HARVEST,
  harvestWoodTree,
  plankYieldForMaturity,
  quoteWoodTreeHarvest,
  woodTreeStatusLabel,
} from '../public/js/woodcutting.js?v=4e140315';
import { noteWoodTreeCare } from '../public/js/patches.js?v=3996c344';
import { isTreeTarget } from '../public/js/features/tree-death-feature.js?v=e5c20791';
import { enchantedForestFeature, floorScreenY, hollowTrees, treeSpots } from '../public/js/features/enchanted-forest-feature.js?v=f7e9d8f3';
import { FEATURES } from '../public/js/features/index.js?v=332168b9';

const spike = join(dirname(fileURLToPath(import.meta.url)), '..');
const streets = join(spike, 'public/assets/streets');
const street = (tsid) => JSON.parse(readFileSync(join(streets, `${tsid}.json`), 'utf8'));
const gsjs = join(spike, '../glitch-GameServerJS/items/wood_tree_enchanted.js');

describe('enchanted wood tree rules (wood_tree_enchanted.js)', () => {
  it('yield 10-60 planks by maturity, against the plain tree\'s 25-80', () => {
    assert.deepEqual(ENCHANTED_WOOD_TREE.plankYieldByMaturity, [10, 15, 22, 32, 45, 60]);
    assert.deepEqual(WOOD_TREE_HARVEST.plankYieldByMaturity, [25, 30, 40, 50, 60, 80]);
    assert.deepEqual([1, 2, 3, 4, 5, 6].map((m) => plankYieldForMaturity(m, { enchanted: true })), [10, 15, 22, 32, 45, 60]);
    assert.deepEqual([1, 2, 3, 4, 5, 6].map((m) => plankYieldForMaturity(m)), [25, 30, 40, 50, 60, 80]);
    assert.equal(enchantedPlankYield(6), 60, '2012-04-12: "The max harvest will net you 60 planks instead of 80."');
    assert.deepEqual(ENCHANTED_WOOD_TREE.maturityMap, [2, 3, 4, 5, 6, 0]);
    assert.equal(ENCHANTED_WOOD_TREE.actionDistance, 25);
  });

  it('match the GSJS file', { skip: !existsSync(gsjs) && 'GSJS checkout not beside this worktree' }, () => {
    const src = readFileSync(gsjs, 'utf8');
    const onLoad = src.slice(src.indexOf('function onLoad(){ // defined by wood_tree_enchanted'), src.indexOf('function applyPoison'));
    assert.match(onLoad.replace(/\s+/g, ''), /plankProdMap=\[10,15,22,32,45,60\]/);
    assert.match(src, /seedling\.trant_class = 'wood_tree_enchanted';\s*seedling\.petted = 3;/);
    assert.match(src, /"pc_action_distance"\s*:\s*"25"/);
    assert.match(src, /if \(this\.class_tsid == 'wood_tree_enchanted'\) return \{state:null\};/);
  });

  it('harvest through the shared Wood Tree code with the enchanted yield', () => {
    const tree = createEnchantedTree({ seed: 'x', maturity: 6 });
    const inv = { hatchet: 1 };
    const pc = { energy: 100 };
    const tools = {};
    const quote = quoteWoodTreeHarvest(tree.state, inv, pc, tools);
    assert.equal(quote.ok, true);
    assert.equal(quote.plankYield, 60);
    assert.equal(quote.energyCost, 20);
    const r = harvestWoodTree(tree.state, inv, pc, tools);
    assert.equal(r.ok, true);
    assert.equal(inv.plank, 60);
    assert.equal(pc.energy, 80);
    assert.equal(tree.state.enchanted, true, 'ensureWoodTreeState keeps the flag');
    assert.match(woodTreeStatusLabel(tree.state), /harvested today/);
    const fresh = createEnchantedTree({ maturity: 3 });
    assert.match(woodTreeStatusLabel(fresh.state), /22 planks/);
  });

  it('die into a seedling 2 s after maturity 0 and grow back at maturity 1 after 5 minutes', () => {
    const tree = createEnchantedTree({ maturity: 1 });
    const inv = { hatchet: 1 };
    const pc = { energy: 100 };
    const r = harvestWoodTree(tree.state, inv, pc, {});
    assert.equal(r.plankYield, 10);
    assert.equal(tree.state.maturity, 0);
    const t0 = 1_000_000;
    assert.equal(advanceEnchantedTree(tree, t0), null);
    assert.equal(tree.dieAt, t0 + 2000);
    assert.equal(advanceEnchantedTree(tree, t0 + 1999), null);
    assert.equal(advanceEnchantedTree(tree, t0 + 2000), 'died');
    assert.equal(tree.stage, 'seedling');
    assert.equal(seedlingRemainingMs(tree, t0 + 2000), 5 * 60 * 1000);
    assert.equal(advanceEnchantedTree(tree, t0 + 2000 + 5 * 60 * 1000 - 1), null);
    assert.equal(advanceEnchantedTree(tree, t0 + 2000 + 5 * 60 * 1000), 'grew');
    assert.equal(tree.stage, 'tree');
    assert.equal(tree.state.maturity, 1);
    assert.equal(tree.state.harvestedToday, false, 'a new tree: harvestable again the same day');
    assert.equal(tree.state.enchanted, true);
  });

  it('catch up across a long absence (the seedling never dies at 4 h)', () => {
    const tree = createEnchantedTree({ maturity: 1 });
    tree.state.maturity = 0;
    tree.dieAt = 5;
    assert.equal(advanceEnchantedTree(tree, 10 * 60 * 60 * 1000), 'grew');
    assert.equal(tree.stage, 'tree');
  });

  it('answer a seedling pet with 2 energy and pet_no_more', () => {
    const tree = createEnchantedTree({ maturity: 1 });
    tree.stage = 'seedling';
    tree.growAt = 99;
    const pc = { energy: 10 };
    const r = petEnchantedSeedling(tree, pc, 1);
    assert.equal(pc.energy, 8);
    assert.equal(r.msg, SEEDLING_PET_NO_MORE);
    assert.equal(r.msg, "You don't need to pet this seedling any more. Just wait a few minutes.");
    assert.equal(r.bubble, SEEDLING_PET_NO_MORE_LINES[1]);
    assert.equal(SEEDLING_PET_NO_MORE_LINES.length, 5);
    assert.equal(petEnchantedSeedling(createEnchantedTree(), { energy: 5 }).reason, 'not_seedling');
  });

  it('grow with care like any Wood Tree (maturityMap via noteWoodTreeCare)', () => {
    const tree = normalizeEnchantedTree(createEnchantedTree({ maturity: 1 }));
    tree.classId = 'wood_tree';
    tree.state.petted = true;
    noteWoodTreeCare(tree);
    tree.state.watered = true;
    noteWoodTreeCare(tree);
    assert.equal(tree.state.maturity, 1, 'maturity 1 needs 2 of each');
    tree.state.petted = false;
    tree.state.watered = false;
    noteWoodTreeCare(tree);
    tree.state.petted = true;
    tree.state.watered = true;
    assert.equal(noteWoodTreeCare(tree), 'grew');
    assert.equal(tree.state.maturity, 2);
  });

  it('are skipped by Tree Poison', () => {
    const sprite = {};
    assert.equal(isTreeTarget({ classId: 'wood_tree', state: { maturity: 6 }, sprite }), true);
    assert.equal(isTreeTarget({ classId: 'wood_tree', state: { maturity: 6, enchanted: true }, sprite }), false);
  });

  it('use the four SWF variants, frames by maturity, all on disk', () => {
    assert.equal(ENCHANTED_TREE_SHEETS.length, 4);
    for (const sheet of ENCHANTED_TREE_SHEETS) assert.ok(existsSync(join(spike, 'public', sheet.url)), sheet.url);
    assert.deepEqual(enchantedTreeFrame(2, 6), { sheet: ENCHANTED_TREE_SHEETS[1], index: 5 });
    assert.equal(enchantedTreeFrame(9, 0).index, 0);
    const seen = new Set(Array.from({ length: 40 }, (_, i) => enchantedVariantFor(`s${i}`)));
    assert.deepEqual([...seen].sort(), [1, 2, 3, 4]);
  });
});

describe('enchanted forest hollows', () => {
  it('are written, indexed and current (tools/build-enchanted-forests.mjs --check)', () => {
    const out = execFileSync(process.execPath, [join(spike, 'tools/build-enchanted-forests.mjs'), '--check'], { encoding: 'utf8' });
    assert.match(out, /stale: nothing/);
    const index = JSON.parse(readFileSync(join(streets, 'index.json'), 'utf8')).streets;
    for (const f of ENCHANTED_FORESTS) {
      const row = index[f.tsid];
      assert.equal(row.label, f.label);
      assert.equal(row.hubId, f.hubId);
      assert.equal(row.reconstructed, true);
      const s = street(f.tsid);
      assertStreetGeometry(s);
      assert.match(s.source, /^reconstruction/);
      assert.equal(s.musicFile, ENCHANTED_MUSIC);
      assert.equal(s.bounds.r - s.bounds.l, hollowWidth(f));
    }
  });

  it('keep the wiki tree counts and source TSIDs', () => {
    assert.deepEqual(ENCHANTED_FORESTS.map((f) => [f.label, f.woodTrees]), [['Grimssea Hollow', 17], ['Afar Cleft', 9], ['Magha Pleat', 21]]);
    assert.deepEqual(ENCHANTED_FORESTS.map((f) => f.sourceTsid), ['LDODG1KQLOS2GNO', 'LDOLMQFMNOS24AJ', 'LUVNMB7AOOS28EK']);
    assert.equal(enchantedForestByTsid('LDODG1KQLOS2GNO').id, 'grimssea');
  });

  it('link the parent mini doors in and the way out back', () => {
    for (const f of ENCHANTED_FORESTS) {
      const parent = street(f.parent);
      const door = parent.doors.find((d) => d.id === f.door);
      assert.equal(door.connect.street, f.tsid);
      assert.equal(door.connect.x, f.arrive.x);
      assert.equal(door.connect.y, f.arrive.y);
      const hollow = street(f.tsid);
      const out = hollow.doors[0];
      assert.equal(out.connect.street, f.parent);
      // The way out stands where the door delivers you.
      assert.equal(out.x, door.connect.arrive.x);
      assert.ok(Math.abs(out.y - door.connect.arrive.y) <= 1);
      // ...and comes back out at the mini door.
      assert.equal(out.connect.arrive.x, door.x);
    }
  });

  it('give every tree spot a floor', () => {
    for (const f of ENCHANTED_FORESTS) {
      const s = street(f.tsid);
      const plats = platformsScreen(s);
      const xs = treeSpots(f.woodTrees, s.bounds.r - s.bounds.l);
      assert.equal(xs.length, f.woodTrees);
      for (const x of xs) assert.notEqual(floorScreenY(plats, x), null, `${f.label} x ${x}`);
    }
  });

  it('slice helpers: flattest window and clipping', () => {
    const s = { bounds: { l: 0, r: 1000 }, platforms: [{ x1: 0, y1: -100, x2: 500, y2: 0 }, { x1: 500, y1: -20, x2: 1000, y2: -20 }] };
    const w = flattestWindow(s, 400);
    assert.equal(w.x0, 550);
    assert.equal(w.range, 0);
    const c = clipPlatform({ x1: 0, y1: 0, x2: 100, y2: -100 }, 50, 200);
    assert.deepEqual([c.x1, c.y1, c.x2, c.y2], [50, -50, 100, -100]);
    assert.equal(clipPlatform({ x1: 0, y1: 0, x2: 10, y2: 0 }, 20, 30), null);
  });

  it('feature: registered, empty ecology, saved trees per hollow', () => {
    assert.ok(FEATURES.some((f) => f.id === enchantedForestFeature.id));
    const eco = enchantedForestFeature.ecologyOverride({ tsid: 'GDODG1KQLOS2GNO' });
    assert.deepEqual(eco.counts, {});
    assert.equal(eco.spawners, 0);
    assert.equal(enchantedForestFeature.ecologyOverride({ tsid: 'GCR195Q63RK143M' }), null);
    const slot = {};
    const trees = hollowTrees(slot, ENCHANTED_FORESTS[1]);
    assert.equal(trees.length, 9);
    assert.ok(trees.every((t) => t.state.enchanted && t.state.maturity === 6 && t.classId === 'wood_tree'));
    trees[0].state.maturity = 2;
    assert.equal(hollowTrees(slot, ENCHANTED_FORESTS[1])[0].state.maturity, 2, 'kept across visits');
    assert.equal(hollowTrees(slot, ENCHANTED_FORESTS[1], { reset: true })[0].state.maturity, 6);
    const verbs = enchantedForestFeature.verbsFor({ classId: 'patch_seedling' });
    assert.deepEqual(verbs.map((v) => [v.id, v.energy, v.tooltip]), [['pet', 2, 'Help it grow up']]);
    assert.equal(enchantedForestFeature.verbsFor({ classId: 'wood_tree' }), null);
  });
});
