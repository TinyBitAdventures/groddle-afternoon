/**
 * Imagination cards wired 2026-10-22 (coverage register G14): every number is
 * the GameServerJS value, cited at each assertion.
 * Run: node --test tests/imagination-later-cards.test.js
 */
import { before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { IMAGINATION_UPGRADES } from '../public/js/imagination-data.js';
import { isOfferedInRemake, remakeStatus } from '../public/js/imagination-remake.js';
import {
  BONUS_TOOL_CANDIDATES,
  adjustedTaskLimit,
  blockmakerFuel,
  bonusToolCandidates,
  distillingBonus,
  foxBrushingCard,
  levitationCards,
  megaRockChance,
  rollBonusTool,
  rollSlothBonusSnails,
  taskLimitMultiplier,
} from '../public/js/imagination-effects.js';
import { createInventory, countItem } from '../public/js/inventory.js?v=catalog-unified-3';
import { createToolConditionState, getToolCondition, setToolRemaining } from '../public/js/tools.js';
import {
  DEFAULT_TASK_LIMIT,
  RECIPE_CATALOG,
  buildCraftBatchResult,
  craftRecipe,
  loadRecipeCatalogFromFile,
  makingSkillAdjustments,
  recipeTaskLimit,
} from '../public/js/making.js';
import {
  assemblyCheck,
  assemblyEnergy,
  assemblyMs,
  createStillState,
  disassemblyCheck,
  distillInStill,
  finishMachineWork,
  startAssembly,
  startDisassembly,
} from '../public/js/machines.js';
import {
  finishMeditation,
  levitationMinEnergy,
  listOrbVerbs,
  sessionPackage,
  startLevitation,
  startMeditation,
} from '../public/js/meditation.js';
import { skillPackageDetails } from '../public/js/skill-packages.js';
import { strikeDamageFor } from '../public/js/rook-attack.js';
import { createMineRock, mineRock, tickMineRock } from '../public/js/mining.js';
import { runTransform, shuckDetails } from '../public/js/item-transforms.js';
import { brushFox, createFox, foxFiberRange } from '../public/js/foxes.js';
import { soundForMakingTool } from '../public/js/sound-moments.js';
import { supplyFeature } from '../public/js/features/supply-feature.js';

const SPIKE = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
const seq = (...values) => {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)];
};

const BUILT = [
  'blockmaking_save_fuel_1', 'blockmaking_save_fuel_2',
  'distilling_corn', 'distilling_grain', 'distilling_potato',
  'engineering_assemble_machine', 'engineering_disassemble_machine', 'engineering_reduce_time',
  'fiber_arts_bonus_1', 'fiber_arts_bonus_2',
  'focused_meditation_imagination', 'meditative_arts_focus_1', 'meditative_arts_focus_2',
  'meditative_arts_imagination', 'meditative_arts_max_relax',
  'levitation_physics', 'levitation_time',
  'fox_brushing_bonus', 'herbalism_shucking_1', 'herbalism_shucking_2',
  'metalmaking_music', 'mining_high_capacity_rock',
  'piety_shrine_prime_bonus_1', 'piety_shrine_prime_bonus_2',
  'recipe_task_limit_drink_1', 'recipe_task_limit_drink_2', 'recipe_task_limit_food_1', 'recipe_task_limit_food_2',
  'recipe_task_limit_loomer_1', 'recipe_task_limit_machines_1', 'recipe_task_limit_machines_2',
  'recipe_task_limit_tincturing_1', 'recipe_task_limit_transmog_1', 'recipe_task_limit_transmog_2',
  'sloth_bonus_snails', 'ticket_to_paradise_beam_me_down', 'toolcrafting_bonus_tool',
];

describe('statuses (imagination-remake.js)', () => {
  it('deals the 37 newly wired cards and keeps an honest note on the rest', () => {
    for (const id of BUILT) {
      assert.ok(IMAGINATION_UPGRADES[id], id);
      assert.equal(remakeStatus(id).status, 'live', id);
      assert.equal(isOfferedInRemake(id), true, id);
    }
    assert.equal(remakeStatus('jump_wall').status, 'none');
    assert.equal(remakeStatus('meditative_arts_less_distraction').status, 'multiplayer');
    assert.equal(remakeStatus('meditative_arts_less_distraction_2').status, 'multiplayer');
    const later = Object.keys(IMAGINATION_UPGRADES).filter((id) => remakeStatus(id).status === 'later').sort();
    assert.deepEqual(later, [
      'ancestral_lands_time_1', 'ancestral_lands_time_2',
      'element_handling_bonus_1', 'element_handling_bonus_2',
      'furnituremaking_bonus_upgrade_1', 'furnituremaking_bonus_upgrade_2', 'furnituremaking_bonus_upgrade_3',
      'herdkeeping_animal_sadness_1', 'herdkeeping_animal_sadness_2',
      'periodic_mood_loss_reduced_1', 'periodic_mood_loss_reduced_2', 'periodic_mood_loss_reduced_3',
    ]);
  });
});

describe('making cards (inc_making.js, main.js, spindle.js, loomer.js)', () => {
  before(async () => {
    await loadRecipeCatalogFromFile(join(SPIKE, 'assets/content/recipes.json'));
  });

  it('scales each recipe task_limit with get_task_limit_multiplier', () => {
    assert.equal(taskLimitMultiplier('frying_pan', ['recipe_task_limit_food_1']), 1.5);
    assert.equal(taskLimitMultiplier('frying_pan', ['recipe_task_limit_food_1', 'recipe_task_limit_food_2']), 2);
    assert.equal(taskLimitMultiplier('blender', ['recipe_task_limit_food_2']), 1, 'food cards skip drinks');
    assert.equal(taskLimitMultiplier('loomer', ['recipe_task_limit_loomer_1']), 2.5);
    assert.equal(taskLimitMultiplier('crystallizer', ['recipe_task_limit_machines_2']), 1, 'no crystalmalization card');
    assert.equal(adjustedTaskLimit(10, 'loomer', ['recipe_task_limit_loomer_1']), 25);
    assert.equal(adjustedTaskLimit(5, 'spice_mill', ['recipe_task_limit_transmog_1']), 8, 'Math.round(7.5)');
    const crepes = RECIPE_CATALOG.divine_crepes;
    assert.equal(crepes.tool, 'frying_pan');
    assert.equal(recipeTaskLimit(crepes, []), 40);
    assert.equal(recipeTaskLimit(crepes, ['recipe_task_limit_food_1']), 60);
    assert.equal(recipeTaskLimit(crepes, ['recipe_task_limit_food_2']), 80);
    assert.equal(recipeTaskLimit(RECIPE_CATALOG.general_fabric, ['recipe_task_limit_loomer_1']), 25);
    assert.equal(recipeTaskLimit(RECIPE_CATALOG.grade_aa_earth_block, ['recipe_task_limit_machines_1']), 15);
    assert.equal(recipeTaskLimit(RECIPE_CATALOG.essence_of_gandlevery, ['recipe_task_limit_tincturing_1']), 20);
    assert.equal(recipeTaskLimit(RECIPE_CATALOG.spin_thread, ['recipe_task_limit_loomer_1']), DEFAULT_TASK_LIMIT, 'no source limit');
  });

  it('burns 20 / 40% less Blockmaker fuel (inc_making.js:368-375)', () => {
    assert.equal(blockmakerFuel(5, []), 5);
    assert.equal(blockmakerFuel(5, ['blockmaking_save_fuel_1']), 4);
    assert.equal(blockmakerFuel(5, ['blockmaking_save_fuel_2']), 3);
    assert.equal(blockmakerFuel(50, ['blockmaking_save_fuel_1']), 40, 'a 10-block batch, as the source rounds it');
    const block = RECIPE_CATALOG.grade_aa_earth_block;
    assert.equal(makingSkillAdjustments(block, ['blockmaking_1'], []).toolWear, null);
    assert.equal(makingSkillAdjustments(block, ['blockmaking_1'], ['blockmaking_save_fuel_1']).toolWear, 4);
    assert.equal(makingSkillAdjustments(block, ['blockmaking_1'], ['blockmaking_save_fuel_2']).toolWear, 3);
    const inv = createInventory({ blockmaker: 1, earth: 5, loam: 2, heavy_gas: 1 });
    const tools = createToolConditionState();
    setToolRemaining(tools, 'blockmaker', 50);
    const pc = { energy: 100, imaginationUpgrades: ['blockmaking_save_fuel_2'] };
    const res = craftRecipe(inv, pc, 'grade_aa_earth_block', { learned: ['blockmaking_1'], toolState: tools });
    assert.equal(res.ok, true, res.msgs?.join(' '));
    assert.equal(getToolCondition(tools, 'blockmaker').remaining, 47);
  });

  it('Spellbound Spindle spins the whole batch into String 4% of the time', () => {
    const inv = createInventory({ spindle: 1, fiber: 14 });
    const pc = { energy: 100, imaginationUpgrades: ['fiber_arts_bonus_1'] };
    const opts = { learned: ['fiber_arts_1'], batchQty: 2 };
    assert.equal(craftRecipe(inv, pc, 'spin_thread', { ...opts, unitIndex: 1, rng: () => 0.039 }).ok, true);
    assert.equal(craftRecipe(inv, pc, 'spin_thread', { ...opts, unitIndex: 2, rng: () => 0.9 }).ok, true);
    assert.equal(countItem(inv, 'string'), 2);
    assert.equal(countItem(inv, 'thread'), 0);
    const result = buildCraftBatchResult(inv, pc, 'spin_thread', 2, 2, opts);
    assert.equal(result.outputs[0].classTsid, 'string');
    assert.match(result.activityLine, /instead of spinning thread you spun String/);
    // No card, or a miss: Thread as usual.
    const plain = createInventory({ spindle: 1, fiber: 7 });
    craftRecipe(plain, { energy: 100, imaginationUpgrades: ['fiber_arts_bonus_1'] }, 'spin_thread', { learned: ['fiber_arts_1'], rng: () => 0.04 });
    assert.equal(countItem(plain, 'thread'), 1);
  });

  it('Wondrous Weave adds 2 General Fabric to 4% of fabric batches (or Max Luck)', () => {
    const pc = { energy: 500, imaginationUpgrades: ['fiber_arts_bonus_2'] };
    const inv = createInventory({ loomer: 1, thread: 42 });
    const opts = { learned: ['fiber_arts_2'], batchQty: 2 };
    craftRecipe(inv, pc, 'general_fabric', { ...opts, unitIndex: 1, rng: () => 0.01 });
    assert.equal(countItem(inv, 'general_fabric'), 1, 'pays when the batch completes');
    craftRecipe(inv, pc, 'general_fabric', { ...opts, unitIndex: 2, rng: () => 0.01 });
    assert.equal(countItem(inv, 'general_fabric'), 4);
    const result = buildCraftBatchResult(inv, pc, 'general_fabric', 2, 2, opts);
    assert.ok(result.outputs.some((o) => o.classTsid === 'general_fabric' && o.qty === 2 && o.bonus));
    const lucky = createInventory({ loomer: 1, thread: 21 });
    craftRecipe(lucky, pc, 'general_fabric', { learned: ['fiber_arts_2'], rng: () => 0.9, maxLuck: true });
    assert.equal(countItem(lucky, 'general_fabric'), 3);
    const miss = createInventory({ loomer: 1, thread: 21 });
    craftRecipe(miss, pc, 'general_fabric', { learned: ['fiber_arts_2'], rng: () => 0.04 });
    assert.equal(countItem(miss, 'general_fabric'), 1);
  });

  it('Bonus Tool From Spare Parts: 5%, a tool worth 0.5x to 2x the output', () => {
    assert.equal(Object.keys(BONUS_TOOL_CANDIDATES).length, 43);
    assert.equal(BONUS_TOOL_CANDIDATES.cauldron, 3500);
    // A Hoe (base_cost 60): tools worth 30 to 120.
    assert.deepEqual(bonusToolCandidates(60).sort(), ['hatchet', 'hoe', 'knife_and_board', 'test_tube', 'watering_can']);
    assert.equal(rollBonusTool([], 60, () => 0), null);
    assert.equal(rollBonusTool(['toolcrafting_bonus_tool'], 60, () => 0.05), null);
    assert.equal(rollBonusTool(['toolcrafting_bonus_tool'], 60, seq(0.049, 0)), 'hatchet');
    assert.equal(rollBonusTool(['toolcrafting_bonus_tool'], 60, seq(0.9, 0.99), true), 'watering_can');
    const inv = createInventory({ tinkertool: 1, plank: 1, plain_metal: 1 });
    const pc = { energy: 100, imaginationUpgrades: ['toolcrafting_bonus_tool'] };
    const res = craftRecipe(inv, pc, 'hoe', { rng: seq(0.01, 0.99) });
    assert.equal(res.ok, true, res.msgs?.join(' '));
    assert.equal(countItem(inv, 'hoe'), 1);
    assert.equal(countItem(inv, 'watering_can'), 1);
    assert.match(buildCraftBatchResult(inv, pc, 'hoe', 1, 1).activityLine, /extra parts and made a Watering Can/);
  });
});

describe('machines and the Still (machine_stand.js, machine_base, still.js)', () => {
  const kit = () => createInventory({ machine_stand: 1, woodworker_fuser: 1, woodworker_chassis: 1, blockmaker_engine: 1 });

  it('assembles with 20 energy a part, none with Master Assembler, 2000 or 1000 ms a part', () => {
    assert.equal(assemblyEnergy('woodworker', []), 60);
    assert.equal(assemblyEnergy('woodworker', ['engineering_assemble_machine']), 0);
    assert.equal(assemblyMs('woodworker', []), 6000);
    assert.equal(assemblyMs('woodworker', ['engineering_reduce_time']), 3000);
    assert.equal(assemblyCheck(kit(), { energy: 10 }, 'woodworker', ['engineering_1'], ['engineering_assemble_machine']).ok, true);
    const inv = kit();
    const pc = { energy: 10 };
    const tools = createToolConditionState();
    const started = startAssembly(inv, pc, 'woodworker', ['engineering_1'], ['engineering_assemble_machine', 'engineering_reduce_time'], 1000);
    assert.equal(started.ok, true);
    assert.equal(pc.energy, 10);
    assert.equal(started.pending.readyAt, 4000);
    assert.equal(countItem(inv, 'woodworker'), 0);
    assert.equal(finishMachineWork(inv, tools, started.pending).ok, true);
    assert.equal(countItem(inv, 'woodworker'), 1);
  });

  it('disassembles part by part (15 energy each) or fully with Master Exploder (15, 6600 ms)', () => {
    const inv = createInventory({ woodworker: 1 });
    const pc = { energy: 100 };
    assert.equal(disassemblyCheck(inv, pc, 'woodworker', [], []).reason, 'skill');
    assert.equal(disassemblyCheck(inv, pc, 'woodworker', ['engineering_1'], [], { full: true }).reason, 'card');
    assert.equal(disassemblyCheck(inv, pc, 'woodworker', ['engineering_1'], [], { busy: true }).reason, 'busy');
    const step = disassemblyCheck(inv, pc, 'woodworker', ['engineering_1'], ['engineering_reduce_time']);
    assert.equal(step.energy, 45);
    assert.equal(step.durationMs, 3000);
    const full = startDisassembly(inv, pc, 'woodworker', ['engineering_1'], ['engineering_disassemble_machine'], { full: true }, 0);
    assert.equal(full.ok, true);
    assert.equal(full.energy, 15);
    assert.equal(full.pending.readyAt, 6600);
    assert.equal(pc.energy, 85);
    assert.equal(countItem(inv, 'woodworker'), 0);
    finishMachineWork(inv, createToolConditionState(), full.pending);
    for (const id of ['machine_stand', 'woodworker_fuser', 'woodworker_chassis', 'blockmaker_engine']) assert.equal(countItem(inv, id), 1, id);
  });

  it('the supply feature offers Fully disassemble and the music toggle only with the cards', () => {
    supplyFeature._reset();
    const inv = createInventory({ woodworker: 1, metalmaker: 1 });
    const engine = { inv, pc: { energy: 100, imaginationUpgrades: [] }, toolState: createToolConditionState(), learnedSkills: ['engineering_1'], param: () => null };
    const ids = (cls) => supplyFeature.packVerbs(cls, engine).map((v) => v.id);
    assert.ok(ids('woodworker').includes('disassemble'));
    assert.ok(!ids('woodworker').includes('disassemble:full'));
    assert.ok(!ids('metalmaker').includes('music:off'));
    engine.pc.imaginationUpgrades = ['engineering_disassemble_machine', 'metalmaking_music'];
    assert.ok(ids('woodworker').includes('disassemble:full'));
    assert.ok(ids('metalmaker').includes('music:off'));
    supplyFeature.runPackVerb('metalmaker', 'music:off', engine);
    assert.ok(ids('metalmaker').includes('music:on'));
    assert.equal(supplyFeature.save().metalMusic, false);
    supplyFeature._reset();
  });

  it('Making Metal: machines hum ACTIVE, the Metalmaker plays METALMAKER with the card', () => {
    assert.equal(soundForMakingTool('woodworker', { metalMusic: true }), 'ACTIVE');
    assert.equal(soundForMakingTool('metalmaker', { metalMusic: false }), 'ACTIVE');
    assert.equal(soundForMakingTool('metalmaker', { metalMusic: true }), 'METALMAKER');
    assert.equal(soundForMakingTool('frying_pan'), 'FRYING_PAN');
  });

  it('Corn / Grain / Potato Hoocher add 20% more to the hopper', () => {
    assert.deepEqual(distillingBonus('corn', ['distilling_corn']), { multiplier: 1.2, name: 'Corn Hoocher' });
    assert.equal(distillingBonus('corn', ['distilling_grain']).multiplier, 1);
    const state = createStillState();
    const inv = createInventory({ corn: 10 });
    const res = distillInStill(state, inv, 'corn', ['distilling_1'], 0, ['distilling_corn']);
    assert.equal(res.taken, 10);
    assert.equal(state.hopper, 72, '10 corn x 6 x 1.2');
    assert.equal(res.extra, 12);
    assert.match(res.msg, /"Corn Hoocher" upgrade got you an extra 12 units/);
    // The room check counts base units only, so the hopper can pass 500.
    const full = createStillState({ hopper: 494 });
    distillInStill(full, createInventory({ corn: 5 }), 'corn', ['distilling_1'], 0, ['distilling_corn']);
    assert.equal(full.hopper, 501);
    assert.equal(createStillState({ hopper: 501 }).hopper, 501);
  });
});

describe('meditation and levitation (focusing_orb.js, catalog_buffs.js)', () => {
  const learned = ['meditativearts_1', 'focused_meditation_1', 'levitation_1'];

  it('Clear Mind / Clearer Mind stretch duration and duration_max by 20 / 50%', () => {
    assert.deepEqual(
      [sessionPackage('standing', learned, []).duration, sessionPackage('standing', learned, []).durationMax],
      [4000, 16000],
    );
    const one = sessionPackage('standing', learned, ['meditative_arts_focus_1']);
    assert.deepEqual([one.duration, one.durationMax], [4800, 19200]);
    const two = sessionPackage('focused', learned, ['meditative_arts_focus_2']);
    assert.deepEqual([two.duration, two.durationMax], [3000, 16500]);
    // getSkillPackageDetails scales duration_max too.
    assert.equal(skillPackageDetails('meditative_arts', learned, ['meditative_arts_focus_2']).duration_max, 24000);
    const out = startMeditation({}, 'meditate', { learned, upgrades: ['meditative_arts_focus_2'], energy: 50, maxLuck: true });
    assert.equal(out.session.durationMs, 24000);
  });

  it('Double Max Relax doubles a Max Relax, Enlightenment pays energy + mood at 8%', () => {
    const start = startMeditation({}, 'meditate', { learned, energy: 10, maxLuck: true, now: 0 });
    const ctx = { learned, now: 16000, energy: 0, mood: 0, moodMax: 1000, tank: 100, rng: () => 0.5 };
    const plain = finishMeditation({}, start.session, ctx);
    const doubled = finishMeditation({}, start.session, { ...ctx, upgrades: ['meditative_arts_max_relax'] });
    assert.equal(plain.maxRelax, true);
    // Doubled before rounding, as the source adds unrounded values.
    assert.ok(Math.abs(doubled.energy - plain.energy * 2) <= 1, `${doubled.energy} vs ${plain.energy}`);
    assert.ok(Math.abs(doubled.mood - plain.mood * 2) <= 1);
    assert.ok(Math.abs(doubled.img - plain.img * 2) <= 1);
    assert.equal(plain.imgBonus, 0);
    const miss = finishMeditation({}, start.session, { ...ctx, upgrades: ['meditative_arts_imagination'], rng: () => 0.08 });
    assert.equal(miss.imgBonus, 0);
    const hit = finishMeditation({}, start.session, { ...ctx, upgrades: ['meditative_arts_imagination'], rng: () => 0.079 });
    assert.ok(Math.abs(hit.imgBonus - (plain.energy + plain.mood)) <= 1, 'stats_add_xp(energy + mood), unrounded');
    assert.equal(hit.imgBonusCard, 'meditative_arts_imagination');
    assert.match(hit.message, new RegExp(`\\+${hit.img + hit.imgBonus} iMG`));
  });

  it('Focused Imagination pays the energy (or mood) gained at 8%', () => {
    const start = startMeditation({}, 'focus_energy', { learned, energy: 10, now: 0, rng: () => 0 });
    const out = finishMeditation({}, start.session, { learned, now: start.session.durationMs, energy: 0, mood: 0, tank: 100, upgrades: ['focused_meditation_imagination'], rng: () => 0 });
    assert.ok(out.energy > 0);
    assert.equal(out.imgBonus, out.energy);
    const mood = startMeditation({}, 'focus_mood', { learned, energy: 10, now: 0, rng: () => 0 });
    const outMood = finishMeditation({}, mood.session, { learned, now: mood.session.durationMs, energy: 0, mood: 0, moodMax: 100, tank: 100, upgrades: ['focused_meditation_imagination'], maxLuck: true, rng: () => 0.9 });
    assert.equal(outMood.imgBonus, outMood.mood);
    assert.doesNotMatch(outMood.message, new RegExp(`\\+${outMood.img + outMood.imgBonus} iMG`), 'the source mood line leaves the bonus out');
  });

  it('Levitate Longer: 12 + 0.8% of the tank to start, 12 energy, 8 s; Levitate with Style physics', () => {
    assert.equal(levitationMinEnergy(100, []), 21);
    assert.equal(levitationMinEnergy(100, ['levitation_time']), 13);
    const verb = (energy, upgrades) => listOrbVerbs({}, { learned, energy, upgrades, now: 0 }).find((v) => v.id === 'levitate');
    assert.equal(verb(20, []).enabled, false);
    assert.equal(verb(20, ['levitation_time']).enabled, true);
    assert.match(verb(20, ['levitation_time']).tooltip, /Costs 12 energy/);
    const lev = startLevitation({}, { learned, energy: 50, upgrades: ['levitation_time'], now: 1000 });
    assert.equal(lev.energyCost, 12);
    assert.equal(lev.until, 9000);
    assert.equal(startLevitation({}, { learned, energy: 50, now: 1000 }).until, 6000);
    assert.deepEqual(levitationCards(['levitation_physics']).physics, { jetpack: 1, gravity: 0.798, vy_jump: 1.176, friction_air: 1.59 });
    assert.deepEqual(levitationCards([]).physics, { jetpack: 1, gravity: 0.85 });
  });
});

describe('rooks, mining, herbs, foxes and sloths', () => {
  it('Shrine On I / II: +round(25% / 50%) of the source damage (shrines.js:1040-1046)', () => {
    assert.equal(strikeDamageFor({ baseCost: 1000, solo: false }), 100);
    assert.equal(strikeDamageFor({ baseCost: 1000, solo: false, primeBonus: 0.25 }), 125);
    assert.equal(strikeDamageFor({ baseCost: 1000, solo: false, primeBonus: 0.5 }), 150);
    assert.equal(strikeDamageFor({ emblem: true, count: 2, solo: false, primeBonus: 0.5 }), 750);
    assert.equal(strikeDamageFor({ baseCost: 1000, primeBonus: 0.5 }), 1500, 'solo crowd x10 after the card');
  });

  it('Rock Whisperer: mega rocks at 0 / 7.5 / 15 / 30% (onRespawn x1.5)', () => {
    assert.equal(megaRockChance('metal_rock', ['mining_high_capacity_rock']), 0);
    assert.equal(megaRockChance('dullite', []), 0.05);
    assert.ok(Math.abs(megaRockChance('dullite', ['mining_high_capacity_rock']) - 0.075) < 1e-12);
    assert.ok(Math.abs(megaRockChance('sparkly', ['mining_high_capacity_rock']) - 0.3) < 1e-12);
    const rock = createMineRock('rock_sparkly_1', { chunksRemaining: 1 });
    const inv = createInventory({ pick: 1 });
    const pc = { energy: 100, imaginationUpgrades: ['mining_high_capacity_rock'] };
    const res = mineRock(rock, inv, pc, { learned: ['mining_1'], now: 1, rng: () => 0.29 });
    assert.equal(res.cleared, true);
    assert.equal(rock.respawnChunks, 150);
    assert.equal(tickMineRock(rock, 60000), true);
    assert.equal(rock.chunksRemaining, 150);
    assert.equal(rock.mega, true);
    const plain = createMineRock('rock_sparkly_1', { chunksRemaining: 1 });
    mineRock(plain, createInventory({ pick: 1 }), { energy: 100 }, { learned: ['mining_1'], now: 1, rng: () => 0.29 });
    tickMineRock(plain, 60000);
    assert.equal(plain.chunksRemaining, 50, '0.29 misses the plain 20%');
  });

  it('Seedy Powers / Super Seedy Powers double seeds 75% / 100% of shucks', () => {
    assert.equal(shuckDetails(['herbalism_1'], []).bonusChance, 0.2);
    assert.equal(shuckDetails(['herbalism_1'], ['herbalism_shucking_1']).bonusChance, 0.75);
    assert.equal(shuckDetails(['herbalism_1'], ['herbalism_shucking_1', 'herbalism_shucking_2']).bonusChance, 1);
    assert.equal(shuckDetails([], ['herbalism_shucking_2']).bonusMultiplier, 2);
    const inv = createInventory({ rookswort: 1 });
    const res = runTransform('rookswort', 'shuck', 1, inv, { energy: 100, imaginationUpgrades: ['herbalism_shucking_2'] }, ['herbalism_1'], () => 0.99);
    assert.equal(res.got, 4);
  });

  it('Bristling Bonus: +8 to +12 Fiber and 1.5x brush wear (npc_fox.js:222, 343)', () => {
    assert.deepEqual(foxFiberRange([], ['fox_brushing_bonus']), [24, 36]);
    assert.deepEqual(foxFiberRange(['foxbrushing_1'], ['fox_brushing_bonus']), [34, 48]);
    assert.equal(foxBrushingCard(['fox_brushing_bonus']).toolWearMultiplier, 1.5);
    const tools = createToolConditionState();
    const inv = createInventory({ fox_brush: 1 });
    const pc = { energy: 100, imaginationUpgrades: ['fox_brushing_bonus'] };
    const before = getToolCondition(tools, 'fox_brush').remaining;
    const fox = createFox({ x: 0 });
    const res = brushFox({ pc, inv, toolState: tools, learned: [], licensed: true, nowMs: 0, fox, rng: () => 0 });
    assert.equal(res.ok, true, res.msg);
    assert.equal(res.fibers, 24);
    assert.equal(before - getToolCondition(tools, 'fox_brush').remaining, 3, 'no-skill wear 2 x 1.5');
  });

  it('Friend of Metal: 7%, five minutes apart, 1-3 Snails (npc_sloth.js:590-601, 825-834)', () => {
    const card = ['sloth_bonus_snails'];
    assert.equal(rollSlothBonusSnails([], 0, 0, () => 0), 0);
    assert.equal(rollSlothBonusSnails(card, 0, 1000, () => 0.07), 0);
    assert.equal(rollSlothBonusSnails(card, 0, 1000, seq(0.069, 0.99)), 3);
    assert.equal(rollSlothBonusSnails(card, 1000, 1000 + 5 * 60 * 1000, () => 0), 0, 'not past 5 minutes');
    assert.equal(rollSlothBonusSnails(card, 1000, 1001 + 5 * 60 * 1000, seq(0, 0)), 1);
    assert.equal(rollSlothBonusSnails(card, 1000, 2000, () => 0.5, true), 2, 'Max Luck ignores the cooldown');
  });
});
