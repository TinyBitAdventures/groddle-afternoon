/**
 * Item supply: machine assembly + fuel tanks, the Still, pack transforms,
 * barnacle grinding and spinning, and the obtainability report.
 * Run: node --test tests/supply.test.js
 */
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInventory, countItem } from '../public/js/inventory.js?v=d82f3b00';
import { createToolConditionState, getToolCondition } from '../public/js/tools.js?v=6684b484';
import {
  MACHINE_ASSEMBLIES,
  MACHINE_PART_ITEMS,
  FRESH_FUEL,
  STILL,
  assembleMachine,
  assemblyCheck,
  refuelMachine,
  createStillState,
  distillInStill,
  advanceStill,
  collectHooch,
} from '../public/js/machines.js?v=acfeb40f';
import { runTransform, listTransformVerbs, transformCountMax, transformEdges, transformVerbCount } from '../public/js/item-transforms.js?v=f4f49729';
import { RECIPE_CATALOG, craftRecipe, loadRecipeCatalogFromFile } from '../public/js/making.js?v=76cc5708';
import { VENDOR_PROFILES } from '../public/js/vendor.js?v=29f6c214';
import { SEED_CATALOG } from '../public/js/garden.js?v=86e003ff';
import { obtainableItems } from '../tools/job-obtainable.mjs';
import { supplyReport } from '../tools/supply-report.mjs';
import { supplyFeature } from '../public/js/features/supply-feature.js?v=9a7e5dc5';

const SPIKE = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
const ENGINEER = ['engineering_1'];

function woodworkerKit(extra = {}) {
  return createInventory({ machine_stand: 1, woodworker_fuser: 1, woodworker_chassis: 1, blockmaker_engine: 1, ...extra });
}

describe('machine assembly (machine_stand.js)', () => {
  it('needs the stand, all three parts, Engineering I and 60 energy', () => {
    const pc = { energy: 100 };
    assert.equal(assemblyCheck(createInventory({}), pc, 'woodworker', ENGINEER).reason, 'stand');
    assert.deepEqual(assemblyCheck(createInventory({ machine_stand: 1 }), pc, 'woodworker', ENGINEER).missing, ['woodworker_fuser', 'woodworker_chassis', 'blockmaker_engine']);
    assert.equal(assemblyCheck(woodworkerKit(), pc, 'woodworker', []).reason, 'skill');
    assert.equal(assemblyCheck(woodworkerKit(), { energy: 60 }, 'woodworker', ENGINEER).reason, 'energy');
  });

  it('consumes the parts and starts the tank at a quarter (max_fuel / 4)', () => {
    const inv = woodworkerKit();
    const pc = { energy: 100 };
    const tools = createToolConditionState();
    const res = assembleMachine(inv, pc, tools, 'woodworker', ENGINEER);
    assert.equal(res.ok, true, res.msg);
    assert.equal(pc.energy, 40);
    assert.equal(countItem(inv, 'woodworker'), 1);
    for (const id of ['machine_stand', 'woodworker_fuser', 'woodworker_chassis', 'blockmaker_engine']) assert.equal(countItem(inv, id), 0, id);
    assert.equal(getToolCondition(tools, 'woodworker').remaining, FRESH_FUEL);
    assert.equal(FRESH_FUEL, 50);
  });

  it('every machine uses the shared Machine Engine and has vendor parts with icons', () => {
    for (const [machine, def] of Object.entries(MACHINE_ASSEMBLIES)) {
      assert.ok(def.parts.includes('blockmaker_engine'), machine);
      for (const part of ['machine_stand', ...def.parts]) {
        assert.ok(MACHINE_PART_ITEMS[part], part);
        assert.ok(existsSync(join(SPIKE, 'assets/sprites/icons', `${part}.png`)), `${part} icon`);
      }
      assert.ok(existsSync(join(SPIKE, 'assets/sprites/icons', `${machine}.png`)), `${machine} icon`);
    }
    const sold = new Set(Object.values(VENDOR_PROFILES).flatMap((p) => p.offers.map((o) => o.classTsid)));
    for (const id of ['machine_stand', 'blockmaker_engine', 'woodworker_fuser', 'fuelmaker_core', 'blockmaker_plates', 'metalmaker_tooler', 'still', 'spindle']) {
      assert.ok(sold.has(id), `${id} is stocked`);
    }
    // catalog_stores.js store 4 sells the stand for 560 currants.
    assert.equal(VENDOR_PROFILES.hardware.offers.find((o) => o.classTsid === 'machine_stand').buyPrice, 560);
  });

  it('refuels 50 per Fuel Cell and refuses with less than 50 room', () => {
    const inv = createInventory({ fuel_cell: 5 });
    const tools = createToolConditionState({ condition: { woodworker: { remaining: 50 } } });
    assert.equal(refuelMachine(inv, tools, 'woodworker').fuel, 100);
    const all = refuelMachine(inv, tools, 'woodworker', { all: true });
    assert.equal(all.cells, 2);
    assert.equal(all.fuel, 200);
    assert.equal(countItem(inv, 'fuel_cell'), 2);
    assert.equal(refuelMachine(inv, tools, 'woodworker').reason, 'full');
  });
});

describe('machine recipes burn the tank (inc_making.js)', () => {
  before(async () => {
    await loadRecipeCatalogFromFile(join(SPIKE, 'assets/content/recipes.json'));
  });

  it('moves every machine fuel_cell input into fuel/toolWear', () => {
    for (const [key, r] of Object.entries(RECIPE_CATALOG)) {
      if (!['woodworker', 'fuelmaker', 'metalmaker', 'blockmaker'].includes(r.tool)) continue;
      assert.ok(!r.inputs.some((i) => i.classTsid === 'fuel_cell'), key);
      assert.ok(r.fuel >= 1 && r.toolWear === r.fuel, key);
    }
    assert.equal(RECIPE_CATALOG.board.fuel, 1);
    assert.equal(RECIPE_CATALOG.grade_aa_earth_block.fuel, 5);
    assert.equal(RECIPE_CATALOG.grade_aa_earth_block.tool, 'blockmaker');
  });

  it('a Fuelmaker makes a Fuel Cell from its tank and a Woodworker runs dry', () => {
    const tools = createToolConditionState({ condition: { fuelmaker: { remaining: 1 }, woodworker: { remaining: 1 } } });
    const learned = ['fuelmaking_1', 'woodworking_1'];
    const inv = createInventory({ fuelmaker: 1, woodworker: 1, jellisac_clump: 12, peat: 8, white_gas: 2, plank: 8 });
    const pc = { energy: 500, imagination: 0, xp: 0 };
    const made = craftRecipe(inv, pc, 'fuel_cell', { learned, toolState: tools });
    assert.equal(made.ok, true, made.msgs?.[0]);
    assert.equal(countItem(inv, 'fuel_cell'), 1);
    assert.equal(getToolCondition(tools, 'fuelmaker').remaining, 0);
    assert.equal(craftRecipe(inv, pc, 'board', { learned, toolState: tools }).ok, true);
    const dry = craftRecipe(inv, pc, 'board', { learned, toolState: tools });
    assert.equal(dry.ok, false);
    assert.match(dry.msgs[0], /fuel/);
  });

  it('the Grinder crushes barnacles without Refining and the Spindle spins 7 Fiber', () => {
    const inv = createInventory({ ore_grinder: 1, barnacle: 2, spindle: 1, fiber: 14 });
    const pc = { energy: 100, imagination: 0, xp: 0 };
    assert.equal(craftRecipe(inv, pc, 'crush_barnacle', { learned: [] }).ok, true);
    assert.equal(countItem(inv, 'barnacle_talc'), 1);
    assert.equal(craftRecipe(inv, pc, 'spin_thread', { learned: [] }).reason, 'skill');
    assert.equal(craftRecipe(inv, pc, 'spin_thread', { learned: ['fiber_arts_1'] }).ok, true);
    assert.equal(countItem(inv, 'thread'), 1);
    assert.equal(countItem(inv, 'fiber'), 7);
  });
});

describe('the Still (still.js)', () => {
  it('distills into the hopper and makes one Hooch per 140 s for 14 units', () => {
    const t0 = 1_000_000;
    const state = createStillState();
    const inv = createInventory({ grain: 40, corn: 100 });
    assert.equal(distillInStill(state, inv, 'grain', [], t0).reason, 'skill');
    const res = distillInStill(state, inv, 'grain', ['distilling_1'], t0);
    assert.equal(res.taken, 40);
    assert.equal(state.hopper, 40);
    const corn = distillInStill(state, inv, 'corn', ['distilling_1'], t0);
    assert.equal(corn.taken, Math.floor(460 / 6));
    assert.equal(STILL.workMs, 140000);
    advanceStill(state, t0 + 3 * STILL.workMs + 10);
    assert.equal(state.hooch, 3);
    const got = collectHooch(state, inv, ['distilling_1'], t0 + 3 * STILL.workMs + 10);
    assert.equal(got.got, 3);
    assert.equal(countItem(inv, 'hooch'), 3);
  });

  it('stops when the hopper runs low', () => {
    const state = createStillState();
    const inv = createInventory({ grain: 20 });
    distillInStill(state, inv, 'grain', ['distilling_1'], 5000);
    advanceStill(state, 5000 + 10 * STILL.workMs);
    assert.equal(state.hooch, 1);
    assert.equal(state.hopper, 6);
    assert.equal(state.workingSince, 0);
  });
});

describe('pack transforms', () => {
  it('shakes milk, compresses butter, ages cheese and pokes very stinky cheese', () => {
    const inv = createInventory({ milk_butterfly: 3 });
    const pc = { energy: 100, mood: 30 };
    assert.equal(runTransform('milk_butterfly', 'shake', 'all', inv, pc).ok, true);
    assert.equal(countItem(inv, 'butterfly_butter'), 3);
    assert.equal(pc.energy, 94);
    runTransform('butterfly_butter', 'compress', 2, inv, pc);
    assert.equal(countItem(inv, 'cheese'), 2);
    assert.equal(pc.energy, 84);
    runTransform('cheese', 'age', 1, inv, pc);
    assert.equal(pc.mood, 25);
    runTransform('cheese_stinky', 'age', 1, inv, pc);
    assert.equal(countItem(inv, 'cheese_very_stinky'), 1);
    const poke = runTransform('cheese_very_stinky', 'poke', 1, inv, pc);
    assert.equal(poke.ok, true);
    assert.equal(countItem(inv, 'small_worthless'), 1);
    assert.equal(countItem(inv, 'cheese_stinky'), 1);
    assert.equal(runTransform('cheese', 'age', 1, inv, { energy: 100, mood: 2 }).reason, 'mood');
  });

  it('ticket 88: Poke is one cheese at a time (is_single), lines read as buildVerbMessage, and pokes count for Seeker of the Shiny', async () => {
    const inv = createInventory({ cheese_very_stinky: 3, milk_butterfly: 3 });
    const pc = { energy: 200, mood: 30 };
    const ids = listTransformVerbs('cheese_very_stinky', inv, pc).map((v) => v.id);
    assert.ok(ids.includes('poke:1') && !ids.includes('poke:all'), ids.join());
    assert.ok(ids.includes('age:count'), 'age still asks how many of the stack');
    const poke = runTransform('cheese_very_stinky', 'poke', 1, inv, pc);
    assert.equal(poke.msg, "You poked a Very Stinky Cheese. After sticking an investigatory pinkie in the soft, gooey cheese, you encounter a hard object. You pull it out. It's a small shiny object with no intrinsic value! -10 Energy");
    const shake = runTransform('milk_butterfly', 'shake', 'all', inv, pc);
    assert.equal(shake.msg, 'You shook 3 Butterfly Milks. You shake the butterfly milk vigorously. Butterfly butter! -6 Energy +3 Butterfly Butter');
    // The pack verb reports the verb (notifyVerb) and the quest's counter is the class the source counts.
    const events = [];
    const engine = { inv: createInventory({ cheese_very_stinky: 1 }), pc: { energy: 50 }, learnedSkills: [], achievement: (c, n) => events.push([c, n]), updateHud() {}, say() {}, toast() {}, pushActivity() {} };
    supplyFeature.runPackVerb('cheese_very_stinky', 'poke:1', engine);
    assert.deepEqual(events, [['cheese_very_stinky:poke', 1], ['VERB:poke:cheese_very_stinky', 1]]);
    const quests = JSON.parse(readFileSync(join(SPIKE, 'assets/content/quests.json'), 'utf8'));
    const def = (quests.quests || quests).find ? (quests.quests || quests).find((q) => q.classTsid === 'find_shiny_intrinsic_object') : (quests.quests || quests).find_shiny_intrinsic_object;
    const { eventCounters } = await import('../public/js/quest-offers.js?v=f98056af');
    const req = def.requirements.find((r) => r.id === 'r375');
    assert.ok(eventCounters('cheese_very_stinky:poke').some((c) => c.counter === req.name), req.name);
  });

  it('shucks herbs into two seeds each (herbalism_extract_seeds)', () => {
    const inv = createInventory({ rookswort: 2 });
    const pc = { energy: 50 };
    const fail = runTransform('rookswort', 'shuck', 1, inv, pc, [], () => 0.9);
    assert.equal(fail.ok, false);
    assert.equal(countItem(inv, 'rookswort'), 2);
    const ok = runTransform('rookswort', 'shuck', 'all', inv, pc, ['herbalism_1'], () => 0.5);
    assert.equal(ok.got, 4);
    assert.equal(countItem(inv, 'herb_seed_rookswort'), 4);
    assert.equal(countItem(inv, 'rookswort'), 0);
    assert.ok(listTransformVerbs('milk_butterfly', createInventory({ milk_butterfly: 2 }), { energy: 50 }).some((v) => v.id === 'shake:count'));
  });

  it('report #101: Shake more asks how many of the stack (not every milk in the pack), and runs the count typed', () => {
    // Three stacks of Butterfly Milk: 80 + 80 + 12. The menu opened on one full stack offers up to 80.
    const inv = createInventory({ milk_butterfly: 172 });
    const pc = { energy: 1000, mood: 100 };
    const verbs = listTransformVerbs('milk_butterfly', inv, pc, [], { stackCount: 80 });
    assert.deepEqual(verbs.map((v) => v.id), ['shake:1', 'shake:count']);
    assert.ok(!verbs.some((v) => /all/i.test(v.label)), 'no "all" that reaches past the stack');
    const more = verbs.find((v) => v.id === 'shake:count');
    assert.equal(more.label, 'Shake more');
    assert.deepEqual([more.count.max, more.count.verb, more.count.plural, more.count.idPrefix], [80, 'Shake', 'Butterfly Milks', 'shake']);
    assert.deepEqual(more.count.quote(25), { ok: true, reason: '', tip: 'Make butter. Costs 50 energy.' });
    // milk_butterfly.js shake 130: refused when energy <= 2 * count.
    const tired = listTransformVerbs('milk_butterfly', inv, { energy: 41 }, [], { stackCount: 80 }).find((v) => v.id === 'shake:count');
    assert.equal(tired.count.quote(20).ok, true);
    assert.deepEqual(tired.count.quote(21), { ok: false, reason: "You don't have enough energy to do that.", tip: 'Make butter. Costs 42 energy.' });
    // The small stack's menu stops at 12; a menu about the item as a whole (no stack) at the pack.
    assert.equal(listTransformVerbs('milk_butterfly', inv, pc, [], { stackCount: 12 }).find((v) => v.count).count.max, 12);
    assert.equal(listTransformVerbs('milk_butterfly', inv, pc).find((v) => v.count).count.max, 172);
    // One in the stack: just the one verb, no chooser.
    assert.deepEqual(listTransformVerbs('milk_butterfly', inv, pc, [], { stackCount: 1 }).map((v) => v.id), ['shake:1']);
    assert.deepEqual([transformCountMax(172, 80), transformCountMax(5, 80), transformCountMax(5), transformCountMax(5, 0)], [80, 5, 5, 5]);
    assert.deepEqual(['shake:1', 'shake:37', 'shake:all', 'shake:count', 'shake:x'].map(transformVerbCount), [1, 37, 'all', 1, 1]);
    // OK on 37 shakes 37: the pack verb takes the typed count.
    const events = [];
    const engine = { inv, pc, learnedSkills: [], achievement: (c, n) => events.push([c, n]), updateHud() {}, say() {}, toast() {}, pushActivity() {} };
    assert.equal(supplyFeature.runPackVerb('milk_butterfly', 'shake:37', engine), true);
    assert.deepEqual([countItem(inv, 'milk_butterfly'), countItem(inv, 'butterfly_butter'), pc.energy], [135, 37, 926]);
    assert.deepEqual(events, [['milk_butterfly:shake', 37], ['VERB:shake:milk_butterfly', 37]]);
    // The feature passes the menu's stack through (game.js renderPackPopover opts.stackCount).
    const offered = supplyFeature.packVerbs('milk_butterfly', engine, { stackCount: 80 });
    assert.equal(offered.find((v) => v.count).count.max, 80);
    // Shuck, Compress and Age share the chooser; Poke and Bundle stay one at a time.
    assert.ok(listTransformVerbs('rookswort', createInventory({ rookswort: 9 }), pc, [], { stackCount: 9 }).some((v) => v.id === 'shuck:count' && v.count.max === 9));
    assert.ok(!listTransformVerbs('cheese_very_stinky', createInventory({ cheese_very_stinky: 9 }), pc).some((v) => v.id === 'poke:count'));
  });

  it('report #101: the pack menu draws the How many for a verb with count, in both interfaces', () => {
    const game = readFileSync(join(SPIKE, 'game.js'), 'utf8');
    assert.match(game, /features\.packVerbs\(classTsid, engine, \{ \.\.\.verbCopy, stackCount \}\)/);
    assert.match(game, /data-feature-pack-count=/);
    assert.match(game, /countStepMarkup\(\{ value: packCountQty, max: countMax, verb: verbWord, attrs: \{ dec: 'data-pack-count-dec', inc: 'data-pack-count-inc', num: 'data-pack-count-num', max: 'data-pack-count-max' \} \}\)/);
    assert.match(game, /bindCountField\(pop\.querySelector\('\[data-pack-count-num\]'\)/);
    assert.match(game, /const runId = `\$\{countVerb\.count\.idPrefix \|\| countVerb\.id\}:\$\{count\}`;/);
    const classic = readFileSync(join(SPIKE, 'css/classic.css'), 'utf8');
    assert.match(classic, /:root\[data-ui="classic"\] \[data-pack-count-panel\]/);
    assert.match(classic, /\[data-pack-count-confirm\]/);
  });

  it('every transform output and shucked herb has a seed in the garden', () => {
    const seeds = new Set(Object.keys(SEED_CATALOG));
    for (const edge of transformEdges().filter((e) => e.verb === 'shuck')) assert.ok(seeds.has(edge.to), edge.to);
  });
});

describe('supply feature pack verbs', () => {
  it('assembles from the Machine Stand popover and keeps the Still in its save slice', () => {
    supplyFeature._reset();
    const inv = woodworkerKit({ still: 1, grain: 14 });
    const engine = {
      inv,
      pc: { energy: 100 },
      toolState: createToolConditionState(),
      learnedSkills: ['engineering_1', 'distilling_1'],
      param: () => null,
    };
    const verbs = supplyFeature.packVerbs('machine_stand', engine);
    assert.equal(verbs.length, 4);
    assert.equal(verbs.find((v) => v.id === 'assemble:woodworker').enabled, true);
    assert.equal(verbs.find((v) => v.id === 'assemble:blockmaker').enabled, false);
    assert.equal(supplyFeature.runPackVerb('machine_stand', 'assemble:woodworker', engine), true);
    // Three installing overlays of 2000 ms (machine_base onApplyPart) before it appears.
    assert.equal(countItem(inv, 'woodworker'), 0);
    assert.equal(supplyFeature._state().work.kind, 'assemble');
    assert.equal(supplyFeature.packVerbs('machine_stand', engine).every((v) => !v.enabled), true);
    supplyFeature.onTick(16, Date.now() + 5000, engine);
    assert.equal(countItem(inv, 'woodworker'), 0);
    supplyFeature.onTick(16, Date.now() + 6100, engine);
    assert.equal(countItem(inv, 'woodworker'), 1);
    assert.ok(supplyFeature.packVerbs('woodworker', engine).some((v) => v.id === 'refuel:1'));
    assert.ok(supplyFeature.packVerbs('still', engine).some((v) => v.id === 'distill:grain'));
    supplyFeature.runPackVerb('still', 'distill:grain', engine);
    assert.equal(supplyFeature.save().still.hopper, 14);
    supplyFeature.restore({ still: { hopper: 28, hooch: 2 } });
    assert.equal(supplyFeature._state().still.hooch, 2);
  });
});

describe('obtainability (tools/job-obtainable.mjs)', () => {
  it('reaches the old top blockers through the new supply paths', async () => {
    const { items, tools, sources } = await obtainableItems();
    for (const id of ['fuel_cell', 'barnacle_talc', 'plain_crystal', 'butterfly_butter', 'cheese', 'cheese_plate', 'hooch', 'cosmapolitan', 'grade_aa_earth_block', 'thread', 'board', 'roux', 'potion_rook_balm', 'gandlevery', 'note']) {
      assert.ok(items.has(id), `${id} obtainable`);
    }
    for (const id of ['woodworker', 'fuelmaker', 'blockmaker', 'metalmaker', 'still', 'spindle']) assert.ok(tools.has(id), `${id} held`);
    assert.equal(sources.woodworker, 'assembly');
    // Retired in the source: still missing, on purpose.
    for (const id of ['brick', 'grade_a_earth_block', 'grade_aaa_earth_block']) assert.ok(!items.has(id), id);
    // Animal husbandry (2026-10-20): Batterfly Guano, Piggy Plop, incubated Caterpillars.
    for (const id of ['guano', 'plop', 'caterpillar', 'hogtied_piggy']) assert.ok(items.has(id), id);
  });

  it('the report counts recipes and quests', async () => {
    const report = await supplyReport();
    assert.ok(report.counts.playableRecipes >= 300, String(report.counts.playableRecipes));
    assert.ok(report.counts.completableQuests >= 140, String(report.counts.completableQuests));
    const recipes = JSON.parse(readFileSync(join(SPIKE, 'assets/content/recipes.json'), 'utf8'));
    assert.equal(report.counts.recipes, Object.keys(recipes).length);
  });
});
