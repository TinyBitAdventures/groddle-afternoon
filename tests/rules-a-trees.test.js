/**
 * rules-a trees (2026-11-12): harvest energy and refusals, street Wood Tree care
 * growth and death into a Patch, Harvest and Clear, and street trants growing on
 * their own maturity clock. Sources: glitch-GameServerJS items/wood_tree.js,
 * items/trant_fruit.js, items/include/trants.js, players/inc_skill_packages.js.
 */
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { getVerbsFor, runVerb } from '../public/content.js?v=c25afaed';
import { createTrantState, setTrantTables, fruitCapacityAt } from '../public/js/trants.js?v=4d6f5593';
import { quoteTrantCare } from '../public/js/trant-care.js?v=6ee0b0f5';
import { harvestWoodTree, noteWoodCare, quoteWoodTreeHarvest, WOOD_TREE_MATURITY_MAP } from '../public/js/woodcutting.js?v=ee35a30a';
import { growStreetTrant, maturityCycleMs } from '../public/js/patches.js?v=5ba97b77';
import { createToolConditionState } from '../public/js/tools.js?v=48542c24';
import { patchesFeature } from '../public/js/features/patches-feature.js?v=a5c7df16';
import { treeDeathFeature, WOOD_CLEARED_TO_PATCH_MS } from '../public/js/features/tree-death-feature.js?v=432e540e';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
setTrantTables(JSON.parse(fs.readFileSync(path.join(root, 'public/assets/content/trants.json'), 'utf8')));

const fruitTree = (fruitCount = 50) => ({
  classId: 'trant_fruit',
  label: 'Fruit Tree',
  state: Object.assign(createTrantState('trant_fruit', { maturity: 7, health: 8 }), { fruitCount }),
});

describe('living tree harvest (inc_skill_packages.js 177-178, include/trants.js 233-243)', () => {
  it('exactly the energy cost refuses with the source line and takes nothing', () => {
    const target = fruitTree();
    const pc = { energy: 5, mood: 50 };
    const inv = {};
    const r = runVerb(target, 'harvest', { pc, inv, learned: [], rng: () => 0.99 });
    assert.equal(r.ok, false);
    assert.deepEqual(r.msgs, ["You're too tired to do that."]);
    assert.equal(pc.energy, 5);
    assert.equal(target.state.fruitCount, 50);
    assert.equal(target.state.harvestsToday, 0);
  });

  it('Arborology III costs 2: at 2 it refuses, at 3 it harvests', () => {
    const learned = ['gardening_1', 'gardening_2', 'gardening_3'];
    assert.equal(runVerb(fruitTree(), 'harvest', { pc: { energy: 2, mood: 50 }, inv: {}, learned, rng: () => 0.99 }).ok, false);
    const pc = { energy: 3, mood: 50 };
    assert.equal(runVerb(fruitTree(), 'harvest', { pc, inv: {}, learned, rng: () => 0.99 }).ok, true);
    assert.equal(pc.energy, 1);
  });

  it('a bare tree says the cowboy line before the energy check', () => {
    const r = runVerb(fruitTree(0), 'harvest', { pc: { energy: 1, mood: 50 }, inv: {}, learned: [] });
    assert.deepEqual(r.msgs, ["There's nothing to pick, cowboy!"]);
  });

  it('a young tree (maturity 2) has no fruit and says the cowboy line, not "too small"', () => {
    const young = { classId: 'trant_bean', label: 'Bean Tree', state: createTrantState('trant_bean', { maturity: 2, health: 7 }) };
    assert.equal(fruitCapacityAt('trant_bean', 2, 7), 0);
    const r = runVerb(young, 'harvest', { pc: { energy: 50, mood: 50 }, inv: {}, learned: [] });
    assert.deepEqual(r.msgs, ["There's nothing to pick, cowboy!"]);
  });
});

describe('tree pet and water refusals (trant_fruit.js 552/611, wood_tree.js 525/564)', () => {
  const tools = () => createToolConditionState({ watering_can: 1 });
  it('a living tree already tended says it does not want it', () => {
    const state = createTrantState('trant_fruit', { maturity: 7, health: 8 });
    state.petted = true;
    state.watered = true;
    assert.equal(quoteTrantCare(state, 'trant_fruit', 'pet', { pc: { energy: 50 } }).msg, "I don't want to be petted!");
    assert.equal(quoteTrantCare(state, 'trant_fruit', 'water', { pc: { energy: 50 }, inv: { watering_can: 1 }, tools: tools() }).msg, "I don't want to be watered!");
  });

  it('a Wood Tree adds "right now", and the can is asked for first', () => {
    // This player petted and watered it a minute ago: its 5-minute clocks (canPet / canWater 614-640).
    const now = 1_800_000_060_000;
    const state = { maturity: 6, petAt: now - 60000, waterAt: now - 60000 };
    assert.equal(quoteTrantCare(state, 'wood_tree', 'pet', { pc: { energy: 50 }, now }).msg, "I don't want to be petted right now!");
    assert.equal(quoteTrantCare(state, 'wood_tree', 'water', { pc: { energy: 50 }, inv: { watering_can: 1 }, tools: tools(), now }).msg, "I don't want to be watered right now!");
    assert.equal(quoteTrantCare(state, 'wood_tree', 'water', { pc: { energy: 50 }, inv: {}, now }).reason, 'tool_missing');
  });

  it('too tired is the source line', () => {
    const q = quoteTrantCare({ maturity: 6 }, 'wood_tree', 'pet', { pc: { energy: 2 } });
    assert.deepEqual([q.reason, q.msg], ['energy', "You're too tired to do that."]);
  });
});

describe('Wood Tree harvest (wood_tree.js)', () => {
  it('no Hatchet: the source line (678)', () => {
    const q = quoteWoodTreeHarvest({ maturity: 6 }, {}, { energy: 100 }, {});
    assert.equal(q.msg, "You can't just pluck planks from a tree! You need something to gently extract them with. A hatchet, maybe?");
  });

  it('a wee tree offers Harvest and Clear with the warning (442-466)', () => {
    const wee = { classId: 'wood_tree', label: 'Wood Tree', state: { maturity: 1 } };
    const row = getVerbsFor(wee, { pc: { energy: 100 }, inv: { hatchet: 1 }, tools: createToolConditionState({ hatchet: 1 }) }).find((v) => v.id === 'harvest');
    assert.equal(row.label, 'Harvest and Clear');
    assert.equal(row.tooltip, 'Harvesting this wee tree will also kill it!');
    const big = { classId: 'wood_tree', label: 'Wood Tree', state: { maturity: 4 } };
    assert.equal(getVerbsFor(big, { pc: { energy: 100 }, inv: { hatchet: 1 }, tools: createToolConditionState({ hatchet: 1 }) }).find((v) => v.id === 'harvest').label, 'harvest');
  });
});

describe('street Wood Tree care growth (wood_tree.js onTendComplete 1006-1015)', () => {
  it('both counts reaching maturityMap[m-1] grow one maturity and start the counts over', () => {
    assert.deepEqual([...WOOD_TREE_MATURITY_MAP], [2, 3, 4, 5, 6, 0]);
    const s = { maturity: 1 };
    assert.equal(noteWoodCare(s, 'pet', 1000), true);
    assert.equal(noteWoodCare(s, 'water', 2000), true);
    assert.equal(s.maturity, 1);
    // Five minutes on: a second pet and water, and maturityMap[0] = 2 is met.
    assert.equal(noteWoodCare(s, 'pet', 301000), true);
    assert.equal(noteWoodCare(s, 'water', 302000), 'grew');
    assert.deepEqual([s.maturity, s.carePets, s.careWaters], [2, 0, 0]);
  });

  it('counts only check once the tree has been both petted and watered', () => {
    const s = { maturity: 1, carePets: 5, careWaters: 1, petted: true, watered: false };
    assert.equal(noteWoodCare(s, 'pet', 1000), true);
    assert.equal(s.maturity, 1);
  });

  it('a mighty tree (6) never grows past 6; a cleared one (0) counts nothing', () => {
    const top = { maturity: 6, carePets: 10, careWaters: 10, petted: true, watered: true, needsResetAt: 5000 };
    assert.equal(noteWoodCare(top, 'pet', 1000), true);
    assert.equal(top.maturity, 6);
    assert.equal(noteWoodCare({ maturity: 0 }, 'pet', 1000), false);
  });

  it('a harvest the tree survives zeroes the counts (endHarvest 783-786)', () => {
    const s = { maturity: 5, carePets: 3, careWaters: 4 };
    const tools = createToolConditionState({ hatchet: 1 });
    const r = harvestWoodTree(s, { hatchet: 1 }, { energy: 100 }, tools);
    assert.equal(r.ok, true);
    assert.deepEqual([s.maturity, s.carePets, s.careWaters], [5, 0, 0]);
  });
});

describe('a street Wood Tree chopped to 0 becomes a Patch (wood_tree.js 779-781, 858-868)', () => {
  const realAdopt = patchesFeature.adoptPlot;
  let adopted;
  let drops;
  let engine;
  let wood;
  beforeEach(() => {
    treeDeathFeature._reset();
    adopted = [];
    drops = [];
    patchesFeature.adoptPlot = (_e, row) => (adopted.push(row), row);
    wood = { classId: 'wood_tree', label: 'Wood Tree', treeIndex: 0, state: { maturity: 0 }, sprite: { x: 400, y: 902 } };
    const world = { trees: [{ classId: 'wood_tree', state: wood.state }] };
    const slots = {};
    engine = {
      mode: 'solo',
      interactables: [wood],
      streetWorld: () => world,
      streetSlot: (id) => (slots[id] ||= {}),
      unregister: (t) => { engine.interactables = engine.interactables.filter((x) => x !== t); },
      dropWorldStack: (...a) => drops.push(a),
      setData: () => {},
      save: () => {},
      param: () => null,
      query: () => null,
    };
  });

  it('two seconds after it is cleared, with no Planks', () => {
    const t0 = 5_000_000;
    treeDeathFeature.onTick(16, t0, engine);
    assert.equal(adopted.length, 0);
    treeDeathFeature.onTick(16, t0 + WOOD_CLEARED_TO_PATCH_MS + 250, engine);
    assert.deepEqual(adopted.map((r) => [r.key, r.soilClass]), [['tree:0', 'patch']]);
    assert.deepEqual(drops, []);
    assert.ok(!engine.interactables.includes(wood));
    patchesFeature.adoptPlot = realAdopt;
  });

  it('a save already holding a cleared street Wood Tree gets its Patch on entering the street', () => {
    treeDeathFeature.onStreetEnter({}, engine);
    assert.deepEqual(adopted.map((r) => r.soilClass), ['patch']);
    patchesFeature.adoptPlot = realAdopt;
  });

  it('a living Wood Tree is left alone', () => {
    wood.state.maturity = 1;
    treeDeathFeature.onStreetEnter({}, engine);
    treeDeathFeature.onTick(16, 9_000_000, engine);
    assert.equal(adopted.length, 0);
    patchesFeature.adoptPlot = realAdopt;
  });
});

describe('street trants grow on their own clock (include/trants.js 627-631, 823-883)', () => {
  it('starts its clock on first sight, then rolls each cycle', () => {
    const s = createTrantState('trant_fruit', { maturity: 7, health: 9 });
    const t0 = 1_000_000;
    assert.equal(growStreetTrant(s, 'trant_fruit', t0, () => 0), 0);
    assert.equal(s.cycleAt, t0);
    const capBefore = s.fruitCapacity;
    assert.equal(growStreetTrant(s, 'trant_fruit', t0 + maturityCycleMs(7) - 1, () => 0), 0);
    assert.equal(growStreetTrant(s, 'trant_fruit', t0 + maturityCycleMs(7), () => 0), 1);
    assert.equal(s.maturity, 8);
    assert.ok(s.fruitCapacity >= capBefore);
  });

  it('a failed roll keeps the maturity; maturity 10 never grows', () => {
    const s = createTrantState('trant_fruit', { maturity: 7, health: 9 });
    growStreetTrant(s, 'trant_fruit', 0 + 1, () => 0.99);
    assert.equal(growStreetTrant(s, 'trant_fruit', 1 + maturityCycleMs(7) * 3, () => 0.99), 0);
    const top = createTrantState('trant_fruit', { maturity: 10, health: 10 });
    growStreetTrant(top, 'trant_fruit', 1, () => 0);
    assert.equal(growStreetTrant(top, 'trant_fruit', 1 + maturityCycleMs(10) * 5, () => 0), 0);
  });
});
