/**
 * G268: the rest of the energy and mood gains go through the metabolic gate
 * where the source adds through metabolics_add_energy / metabolics_add_mood
 * (players/inc_metabolics.js 40-53, 79-86): nothing while dead, no energy
 * while Super Pooped, and the refused gain says why. Losses never ask.
 * Drinks add mood before energy (items/include/drink.js 66, then 88).
 * Run: node --test tests/gain-gate-sites.test.js
 */
import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setMetabolicGainGate } from '../public/js/metabolics.js';
import { createInventory, useItem } from '../public/js/inventory.js';
import { createShrineState, donateToShrine } from '../public/js/shrines.js';
import { createToolConditionState, repairToolCondition, setToolRemaining } from '../public/js/tools.js';
import { HERDKEEPING, capturePiggy, normalizeHusbandryPack } from '../public/js/animal-husbandry.js';
import { KITTY_PET, createKitty, petKitty } from '../public/js/heli-kitties.js';
import { createMusicblockState, playMusicblock } from '../public/js/musicblocks.js';
import { runTransform } from '../public/js/item-transforms.js';
import { applyTreePoison, performAntidotePour } from '../public/js/tree-poison.js';
import { createPlot, performPlotVerb } from '../public/js/patches.js';
import { doChore, neighbourById, normalizeNeighbourState } from '../public/js/neighbours.js';
import { runVerb } from '../public/content.js';
import { room as topOfTree } from '../public/js/quest-rooms/top-of-tree.js';
import { room as esquibeth } from '../public/js/quest-rooms/esquibeth.js';

const here = dirname(fileURLToPath(import.meta.url));
const pub = join(here, '../public');
const gsjs = join(here, '../../glitch-GameServerJS');
const src = (p) => readFileSync(join(pub, p), 'utf8');
const gs = (p) => readFileSync(join(gsjs, p), 'utf8');

const asked = [];
/** Refuse the listed stats as the hell feature does while dead or Super Pooped. */
function refuse(...stats) {
  setMetabolicGainGate((stat) => {
    asked.push(stat);
    return stats.includes(stat) ? { ok: false, msg: `no ${stat}` } : { ok: true };
  });
}
afterEach(() => {
  setMetabolicGainGate(null);
  asked.length = 0;
});

describe('the source adds each of these through metabolics_add_*', () => {
  it('cites a gated call for every site this row gates', () => {
    const rows = [
      ['items/include/shrines.js', /mood = pc\.metabolics_add_mood\(mood\)/],
      ['items/tinkertool.js', /pc\.metabolics_add_mood\(this\['!tinkering'\]\.details\.tool_wear\)/],
      ['items/npc_piggy.js', /var val = pc\.metabolics_add_mood\(30\)/],
      ['items/npc_kitty_chicken.js', /var mood = pc\.metabolics_add_mood\(10\)/],
      ['items/musicblock_b_brown_01.js', /var mood = pc\.metabolics_add_mood\(2\)/],
      ['items/grain_bushel.js', /pc\.metabolics_add_mood\(10 \* msg\.count\)/],
      ['items/tree_poison_antidote.js', /var mood = pc\.metabolics_add_mood\(10\)/],
      ['players/inc_skill_packages.js', /this\.metabolics_add_mood\(details\.mood_bonus\)/],
      ['items/focusing_orb.js', /if \(energy\) energy = pc\.metabolics_add_energy\(energy\);\s*if \(mood\) mood = pc\.metabolics_add_mood\(mood\);/],
      ['items/catalog_buffs.js', /pc\.metabolics_add_mood\(pc\.metabolics_get_max_mood\(\) \* 0\.10\)/],
      ['items/sparkle_powder.js', /var val = pc\.metabolics_add_mood\(10\)/],
      ['players/inc_emotes.js', /this\.metabolics_add_mood\(pc_mood\)/],
      ['quests/puzzle_level_color_blockage.js', /energy = pc\.metabolics_add_energy\(round_to_5\(100 \* multiplier\)\)/],
      ['items/conch.js', /var mood = pc\.metabolics_add_mood\(2\)/],
      ['players/inc_announcements.js', /pc\.metabolics_add_energy\(50\)/],
      ['items/npc_chicken.js', /var mood = pc\.metabolics_add_mood\(10\)/],
      ['items/paradise_ticket_aerial_boost.js', /pc\.metabolics_add_energy\(1\*this\.count\)/],
    ];
    for (const [file, re] of rows) assert.match(gs(file), re, file);
    // Only a quiet call skips the line; none of these pass quiet.
    const metabolics = gs('players/inc_metabolics.js');
    assert.match(metabolics, /You would have gained some mood, but you're dead!/);
    assert.match(metabolics, /You would have gained energy, but you're super pooped!/);
  });

  it('drink_drink adds mood, then energy; food_eat leads with energy', () => {
    const drink = gs('items/include/drink.js');
    assert.ok(drink.indexOf('metabolics_add_mood(count') < drink.indexOf('metabolics_add_energy(count'));
  });
});

describe('drink order (inventory.js useItem)', () => {
  it('a drink asks for mood first, then energy', () => {
    refuse('energy', 'mood');
    useItem(createInventory({ orange_juice: 1 }), { energy: 40, mood: 40, energyMax: 100 }, 'orange_juice');
    assert.deepEqual(asked, ['mood', 'energy']);
  });

  it('food still asks for energy first', () => {
    refuse('energy', 'mood');
    const pc = { energy: 40, mood: 40, energyMax: 100 };
    const r = useItem(createInventory({ sammich: 1 }), pc, 'sammich');
    assert.equal(r.ok, true);
    assert.deepEqual(asked, ['energy', 'mood']);
    assert.deepEqual([pc.energy, pc.mood], [40, 40]);
  });
});

describe('module gain sites', () => {
  it('a shrine donation while dead gives iMG and favor, no mood (shrines.js 482-492)', () => {
    refuse('energy', 'mood');
    const pc = { mood: 40, xp: 5000, imagination: 5000 };
    const r = donateToShrine(createShrineState(), 'spriggan', { sammich: 2 }, pc, 'sammich', 2, { rng: () => 0.5 });
    assert.equal(r.ok, true);
    assert.equal(pc.mood, 40);
    assert.ok(pc.xp > 5000);
    assert.deepEqual(asked, ['mood']);
  });

  it('a Tink Happy Thoughts repair while dead fixes the tool for no mood', () => {
    refuse('mood');
    const state = createToolConditionState();
    setToolRemaining(state, 'hoe', 44);
    const pc = { energy: 20, mood: 30 };
    const r = repairToolCondition(state, 'hoe', pc, { learned: ['tinkering_1'], hasTinkertool: true, upgrades: ['tinkering_repairing_gives_mood'] });
    assert.equal(r.ok, true);
    assert.equal(pc.energy, 18);
    assert.equal(pc.mood, 30);
    assert.equal(r.moodGained, 0);
  });

  it('capturing a piggy while dead takes the energy, gives no mood', () => {
    refuse('mood');
    normalizeHusbandryPack({});
    const pc = { energy: 60, mood: 10, xp: 0, imagination: 0 };
    const r = capturePiggy({}, { pc, inv: { pig_bait: 1 }, learned: [HERDKEEPING.skill], streetTsid: 'S1', now: 1000, rng: () => 0.5 });
    assert.equal(r.ok, true);
    assert.equal(pc.energy, 40);
    assert.equal(pc.mood, 10);
    assert.equal(r.effects.mood, 0);
  });

  it('petting a heli kitty while dead takes the energy, gives no mood', () => {
    refuse('mood');
    const pc = { energy: 50, mood: 20, xp: 0, imagination: 0 };
    const r = petKitty(createKitty(), pc);
    assert.equal(r.ok, true);
    assert.equal(pc.energy, 50 - KITTY_PET.energy);
    assert.equal(pc.mood, 20);
    assert.equal(r.mood, 0);
  });

  it('a musicblock while dead costs 2 energy and gives no mood', () => {
    refuse('mood');
    const pc = { energy: 20, mood: 50, xp: 0, imagination: 0 };
    const r = playMusicblock(createMusicblockState(), pc, 'musicblock_d_green_02', 1000);
    assert.equal(r.ok, true);
    assert.equal(pc.energy, 18);
    assert.equal(pc.mood, 50);
    assert.equal(r.effects.mood, 0);
  });

  it('unbundling grain while dead gives the grain, not the 10 mood', () => {
    refuse('mood');
    const inv = createInventory({ grain_bushel: 1 });
    const pc = { energy: 50, mood: 20 };
    const r = runTransform('grain_bushel', 'unbundle', 1, inv, pc);
    assert.equal(r.ok, true);
    assert.equal(r.got, 250);
    assert.equal(pc.mood, 20);
    assert.equal(r.moodGain, 0);
    assert.doesNotMatch(r.msg, /mood/);
  });

  it('the unbundle mood fills the whole tank with the gate open', () => {
    const pc = { energy: 50, mood: 95, energyMax: 120 };
    runTransform('grain_bushel', 'unbundle', 1, createInventory({ grain_bushel: 1 }), pc);
    assert.equal(pc.mood, 105);
  });

  it('the antidote cures while dead, for no mood', () => {
    refuse('mood');
    const state = applyTreePoison({}, 1000);
    const pc = { mood: 50 };
    const r = performAntidotePour(state, { pc, maxMood: 100 });
    assert.equal(r.ok, true);
    assert.equal(state.poisonEndsAt, undefined);
    assert.equal(pc.mood, 50);
    assert.equal(r.moodGained, 0);
  });

  it('a pour with nothing poisoned never asks the gate', () => {
    refuse('mood');
    assert.equal(performAntidotePour({}, { pc: { mood: 50 } }).ok, false);
    assert.deepEqual(asked, []);
  });

  it('tending a patch while dead cleans it, gives no mood (inc_skill_packages.js 524)', () => {
    refuse('mood');
    const plot = createPlot('patch');
    const pc = { energy: 100, mood: 50, xp: 0, imagination: 0, currants: 0 };
    const r = performPlotVerb(plot, 'tend', {
      inv: { hoe: 1 }, pc, skills: ['soil_appreciation_1'], upgrades: [], buffs: [],
      toolState: createToolConditionState(), hubId: 56, now: 1_000_000, rng: () => 0,
    });
    assert.equal(r.ok, true);
    assert.equal(plot.stage, 'clean');
    assert.equal(pc.energy, 95);
    assert.equal(pc.mood, 50);
  });

  it("a neighbour's chore while dead gives the iMG, not the mood", () => {
    refuse('mood');
    const pc = { energy: 50, mood: 20, xp: 0, imagination: 0 };
    const r = doChore(normalizeNeighbourState({}), neighbourById('dorrit'), pc, { dayKey: 'd1', now: 1, energy: 50 });
    assert.equal(r.ok, true);
    assert.deepEqual(r.effects, { energy: -3, mood: 0, xp: 8 });
  });

  it('buttering up a chicken or singing to a butterfly while dead gives no mood', () => {
    refuse('energy', 'mood');
    const pc = { energy: 50, mood: 20, xp: 0, imagination: 0 };
    const butter = runVerb({ classId: 'npc_chicken', state: {} }, 'butter_up', { pc, inv: {} });
    assert.equal(butter.ok, true);
    assert.equal(butter.effects.mood, 0);
    const sing = runVerb({ classId: 'npc_butterfly', state: {} }, 'sing_to', { pc, inv: {} });
    assert.equal(sing.ok, true);
    assert.equal(sing.effects.mood, 0);
    assert.equal(sing.effects.energy, -1);
    assert.equal(pc.mood, 20);
    assert.equal(pc.energy, 49);
  });

  it('feeding a chicken while dead spends the grain for no mood', () => {
    refuse('mood');
    const pc = { energy: 50, mood: 20, xp: 0, imagination: 0 };
    const inv = { grain: 2 };
    const r = runVerb({ classId: 'npc_chicken', state: {} }, 'feed:grain', { pc, inv });
    assert.equal(r.ok, true);
    assert.equal(inv.grain, 1);
    assert.equal(r.effects.mood, 0);
    assert.equal(pc.mood, 20);
  });

  it('the High Jumper boost is refused while Super Pooped (inc_announcements.js 380)', () => {
    refuse('energy');
    const pc = { energy: 3, energyMax: 100 };
    topOfTree.start({ engine: { pc }, data: {} });
    assert.equal(pc.energy, 3);
    setMetabolicGainGate(null);
    topOfTree.start({ engine: { pc }, data: {} });
    assert.equal(pc.energy, 53);
  });

  it('playing the Conch while dead costs 2 energy, gives no mood and does not claim +2 mood', () => {
    refuse('mood');
    const lines = [];
    const pc = { xp: 0, imagination: 0, mood: 10, energy: 50, giantFavor: { grendaline: 0 } };
    const engine = { pc, player: { x: 0, y: 0 }, questState: { completed: [] }, pushActivity: (t) => lines.push(t), updateHud() {}, floatText() {} };
    const mem = {};
    assert.equal(esquibeth.runItemVerb({ engine, questMemory: () => mem, save() {} }, 'conch', 'conch_play'), true);
    assert.equal(pc.mood, 10);
    assert.equal(pc.energy, 48);
    assert.doesNotMatch(lines.join('\n'), /mood/);
  });
});

describe('feature gain sites ask the shared gate (source text)', () => {
  it('meditation, Hi signs, potions, powders, puzzles and the antidote verb use metabolicGain', () => {
    const med = src('js/features/meditation-feature.js');
    assert.match(med, /if \(energy > 0 && !metabolicGain\('energy'\)\.ok\) energy = 0;\n\s*if \(mood > 0 && !metabolicGain\('mood'\)\.ok\) mood = 0;/);
    assert.doesNotMatch(med, /engine\.metabolicGate\('(energy|mood)', 'gain'\)/);
    assert.match(src('js/features/hi-signs-feature.js'), /if \(!metabolicGain\('mood'\)\.ok\) return 0;/);
    assert.match(src('js/features/potions-feature.js'), /if \(metabolicGain\('mood'\)\.ok\) pc\.mood = Math\.min\(moodMax\(pc\), before \+ loveMood/);
    assert.match(src('js/features/powders-feature.js'), /if \(metabolicGain\('mood'\)\.ok\) pc\.mood = Math\.min\(moodMax\(pc\), \(Number\(pc\.mood\) \|\| 0\) \+ 10\);/);
    const puzzles = src('js/features/puzzles-feature.js');
    assert.match(puzzles, /const energy = r\.energy > 0 && metabolicGain\('energy'\)\.ok \? r\.energy : 0;/);
    assert.match(puzzles, /const bits = rewardBits\(reward \? payout\(engine, reward\) : null\);/);
    assert.match(src('js/features/puzzle-scenes-feature.js'), /const mood = r\.mood > 0 && metabolicGain\('mood'\)\.ok \? r\.mood : 0;/);
    // The antidote verb leaves the gate to the pour, so the dead hear why.
    assert.doesNotMatch(src('js/features/tree-death-feature.js'), /moodGain = engine\.metabolicGate/);
  });

  it('content.js gates the chicken, butterfly and Arborology mood', () => {
    const content = src('content.js');
    assert.equal((content.match(/metabolicGain\('mood'\)\.ok/g) || []).length, 4);
  });

  it('the Paradise ticket in game.js already asks before its 1 energy', () => {
    const game = src('game.js');
    assert.match(game, /const energyGate = features\.metabolicGate\('energy', 'gain', engine\);\n\s*const eaten = eatParadiseTicket\(\{ count: 1, energyAllowed: energyGate\.ok !== false \}\);/);
  });
});
