import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  CAN_PLANT_MAPPINGS,
  SOIL_TIMERS,
  canPlantBean,
  createPlot,
  growTree,
  maturityCycleMs,
  maturityGrowChance,
  normalizePlot,
  noteWoodTreeCare,
  performPlotVerb,
  plantChoices,
  plotArtPath,
  plotStatusLabel,
  plotVerbs,
  resolveSoilPackage,
  resolveTendPackage,
  rollSoilDropTable,
  seedlingTimings,
  soilSpawnClasses,
  tickPlot,
  archivedSeedlingTrant,
} from '../public/js/patches.js';
import { createToolConditionState, getToolCondition } from '../public/js/tools.js';

const seq = (...values) => {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)];
};

function ctx(extra = {}) {
  return {
    inv: { hoe: 1, shovel: 1, hatchet: 1, bean_bean: 2, bean_egg: 1, ...(extra.inv || {}) },
    pc: { energy: 100, mood: 50, xp: 0, imagination: 0, currants: 0, ...(extra.pc || {}) },
    skills: extra.skills || [],
    upgrades: extra.upgrades || [],
    buffs: extra.buffs || [],
    toolState: extra.toolState || createToolConditionState(),
    hubId: extra.hubId ?? 56,
    now: extra.now ?? 1_000_000,
    rng: extra.rng || (() => 0),
    owner: extra.owner,
  };
}

describe('planting regions (patch.js can_plant_mappings)', () => {
  it('keeps the exact source hub rows', () => {
    assert.equal(CAN_PLANT_MAPPINGS.trant_bean.length, 26);
    assert.deepEqual(CAN_PLANT_MAPPINGS.trant_spice, [63, 72, 71, 99, 27]);
    assert.equal(CAN_PLANT_MAPPINGS.wood_tree.length, 28);
  });

  it('only Egg Plant beans go in Dark Patches, never in Patches', () => {
    assert.equal(canPlantBean('bean_egg', 'patch_dark', 56), true);
    assert.equal(canPlantBean('bean_bean', 'patch_dark', 56), false);
    assert.equal(canPlantBean('bean_egg', 'patch', 56), false);
  });

  it('respects regions and treats legacy Groddle hubs 28/52 as Groddle Forest', () => {
    assert.equal(canPlantBean('bean_bean', 'patch', 56), true);
    assert.equal(canPlantBean('bean_spice', 'patch', 56), false);
    assert.equal(canPlantBean('bean_spice', 'patch', 27), true);
    assert.equal(canPlantBean('bean_bean', 'patch', 28), true);
    assert.equal(canPlantBean('bean_wood', 'patch', 52), true);
    assert.equal(canPlantBean('bean_plain', 'patch', 56), false);
  });

  it('lists pack beans with a reason for the ones that will not grow here', () => {
    const rows = plantChoices({ bean_bean: 2, bean_spice: 1, bean_plain: 9 }, 'patch', 56);
    assert.deepEqual(rows.map((r) => [r.beanClass, r.ok]), [['bean_bean', true], ['bean_spice', false]]);
    assert.match(rows[1].reason, /will not grow here/);
  });

  it('gives an archived Seedling a tree that is legal in its hub', () => {
    const trant = archivedSeedlingTrant(27, 'x');
    assert.ok(CAN_PLANT_MAPPINGS[trant].includes(27));
  });
});

describe('skill packages (catalog_skill_packages.js)', () => {
  it('tend uses the highest Soil Appreciation rank', () => {
    assert.equal(resolveSoilPackage('soil_appreciation', []).success_rate, 90);
    assert.equal(resolveSoilPackage('soil_appreciation', ['soil_appreciation_1', 'soil_appreciation_4']).duration, 1000);
    assert.equal(resolveSoilPackage('dig_patch', ['soil_appreciation_5']).drop_chance, 15);
  });

  it('the hoeing upgrade raises iMG and wear', () => {
    const pkg = resolveTendPackage(['soil_appreciation_3'], ['hoeing_more_img_more_wear']);
    assert.equal(pkg.xp_bonus, 6);
    assert.equal(pkg.wearMultiplier, 4);
  });

  it('bean grow upgrades shorten the seedling minimum and raise the start maturity', () => {
    assert.deepEqual(seedlingTimings([]), { minMs: 300000, growLevel: 0 });
    assert.deepEqual(seedlingTimings(['soil_appreciation_bean_grow_2']), { minMs: 60000, growLevel: 4 });
  });

  it('drop tables use the first cumulative threshold at or above the roll', () => {
    assert.deepEqual(rollSoilDropTable('soil_appreciation_small', () => 0.4), [{ classTsid: 'earth', qty: 3 }]);
    assert.deepEqual(rollSoilDropTable('soil_appreciation_small', () => 0), [{ currants: 3 }]);
    assert.deepEqual(rollSoilDropTable('loam_4', () => 0.99), [{ classTsid: 'loam', qty: 4 }]);
  });
});

describe('patch verbs', () => {
  it('a weedy patch must be tended before planting', () => {
    const plot = createPlot('patch', { now: 0 });
    const verbs = plotVerbs(plot, ctx());
    assert.equal(verbs.find((v) => v.id === 'tend').enabled, true);
    assert.equal(verbs.find((v) => v.id === 'plant:bean_bean'), undefined);
    const plant = verbs.find((v) => v.id === 'plant');
    assert.equal(plant.enabled, false);
    assert.match(plant.reason, /tend to the weeds/);
    const c = ctx();
    const tooEarly = performPlotVerb(plot, 'plant:bean_bean', c);
    assert.equal(tooEarly.ok, false);
    assert.match(tooEarly.msg, /tend to the weeds/);
    assert.equal(c.inv.bean_bean, 2);
  });

  it('tend needs a working hoe and energy above the cost', () => {
    const plot = createPlot('patch');
    assert.equal(plotVerbs(plot, ctx({ inv: { hoe: 0 } })).find((v) => v.id === 'tend').reason, 'You need a working hoe.');
    assert.equal(plotVerbs(plot, ctx({ pc: { energy: 5 } })).find((v) => v.id === 'tend').enabled, false);
  });

  it('an unskilled failed tend roll spends nothing', () => {
    const plot = createPlot('patch');
    const c = ctx({ rng: () => 0.95 });
    const result = performPlotVerb(plot, 'tend', c);
    assert.equal(result.ok, false);
    assert.equal(plot.stage, 'dirty');
    assert.equal(c.pc.energy, 100);
    assert.equal(getToolCondition(c.toolState, 'hoe').remaining, 50);
    assert.ok(result.response);
  });

  it('tend cleans the patch with exact costs, wear and the 90 s regrow timer', () => {
    const plot = createPlot('patch');
    const c = ctx({ skills: ['soil_appreciation_1'] });
    const result = performPlotVerb(plot, 'tend', c);
    assert.equal(result.ok, true);
    assert.equal(plot.stage, 'clean');
    assert.equal(c.pc.energy, 95);
    assert.equal(c.pc.mood, 51);
    assert.equal(c.pc.xp, 1);
    assert.equal(getToolCondition(c.toolState, 'hoe').remaining, 48);
    assert.ok(result.counters.some((r) => r.counter === 'patch:tend'));
    assert.ok(result.counters.some((r) => r.counter === 'VERB:tend:patch'));
    assert.ok(result.counters.some((r) => r.counter === 'patches:tended'));
    assert.equal(plot.dueAt, c.now + 90000);
    assert.deepEqual(tickPlot(plot, c.now + 90000).events, ['regrew']);
    assert.equal(plot.stage, 'dirty');
  });

  it('a Soil Appreciation 3 tend can turn up a drop', () => {
    const plot = createPlot('patch');
    const c = ctx({ skills: ['soil_appreciation_3'], rng: seq(0.01, 0.6) });
    const result = performPlotVerb(plot, 'tend', c);
    assert.deepEqual(result.outputs, [{ classTsid: 'musicblock_b_brown_02', qty: 1 }]);
    assert.equal(c.inv.musicblock_b_brown_02, 1);
    assert.ok(result.counters.some((r) => r.counter === 'skill_package_drop:patch'));
  });

  it('dig gives Earth, leaves a hole that fills in 10 minutes', () => {
    const plot = createPlot('patch');
    const c = ctx();
    const result = performPlotVerb(plot, 'dig', c);
    assert.equal(result.ok, true);
    assert.equal(c.inv.earth, 2);
    assert.equal(c.pc.energy, 94);
    assert.equal(plot.stage, 'dug');
    assert.ok(result.counters.some((r) => r.counter === 'dug:dirt'));
    assert.ok(result.counters.some((r) => r.counter === 'soil_dug:earth' && r.amount === 2));
    assert.equal(plotVerbs(plot, c).find((v) => v.id === 'dig').reason, 'There is already a hole there.');
    tickPlot(plot, c.now + SOIL_TIMERS.dugFillMs - 1);
    assert.equal(plot.stage, 'dug');
    tickPlot(plot, c.now + SOIL_TIMERS.dugFillMs);
    assert.equal(plot.stage, 'dirty');
  });

  it('a lucky skilled dig gives Loam instead of Earth', () => {
    const plot = createPlot('patch');
    const c = ctx({ skills: ['soil_appreciation_5'], rng: () => 0.01 });
    const result = performPlotVerb(plot, 'dig', c);
    assert.deepEqual(result.outputs, [{ classTsid: 'loam', qty: 4 }]);
    assert.equal(c.inv.earth, undefined);
    assert.ok(result.counters.some((r) => r.counter === 'soil_dug:loam' && r.amount === 4));
  });
});

describe('beans to trees', () => {
  function plantedPlot(extra = {}) {
    const plot = createPlot('patch');
    plot.stage = 'clean';
    const c = ctx(extra);
    const result = performPlotVerb(plot, 'plant:bean_bean', c);
    return { plot, c, result };
  }

  it('planting consumes one bean and emits the plant and hub events', () => {
    const { plot, c, result } = plantedPlot({ hubId: 56 });
    assert.equal(result.ok, true);
    assert.equal(c.inv.bean_bean, 1);
    assert.equal(plot.stage, 'seedling');
    assert.equal(plot.seedling.trantClass, 'trant_bean');
    const names = result.counters.map((r) => r.counter);
    for (const name of ['patch:plant', 'VERB:plant:patch', 'patches:planted', 'beans_planted:bean_bean', 'hub_bean_planted:56']) {
      assert.ok(names.includes(name), name);
    }
    assert.equal(result.activity, 'You planted that bean real good. Congrats!');
  });

  it('three pettings plus the five-minute minimum grow a Bean Tree', () => {
    const { plot, c } = plantedPlot();
    const t0 = c.now;
    const first = performPlotVerb(plot, 'pet', { ...c, now: t0 + 1000 });
    assert.ok(first.counters.some((r) => r.counter === 'patch_seedling:pet'));
    const second = performPlotVerb(plot, 'pet', { ...c, now: t0 + 2000 });
    assert.ok(!second.counters.some((r) => r.counter === 'patch_seedling:pet'));
    const third = performPlotVerb(plot, 'pet', { ...c, now: t0 + 3000 });
    assert.ok(third.counters.some((r) => r.counter === 'patch_seedling:grown'));
    assert.equal(third.grew, false);
    assert.equal(c.pc.energy, 94);
    assert.equal(plotVerbs(plot, c)[0].reason, "That's enough, thnx.");
    assert.equal(tickPlot(plot, t0 + SOIL_TIMERS.seedlingMinMs - 1).changed, false);
    assert.deepEqual(tickPlot(plot, t0 + SOIL_TIMERS.seedlingMinMs).events, ['grew']);
    assert.equal(plot.stage, 'tree');
    assert.equal(plot.tree.classId, 'trant_bean');
    assert.equal(plot.tree.state.maturity, 1);
    assert.equal(plot.tree.state.health, 7);
    assert.equal(plotVerbs(plot, c).length, 0);
  });

  it('the third petting after the minimum grows the tree at once', () => {
    const { plot, c } = plantedPlot();
    const later = c.now + SOIL_TIMERS.seedlingMinMs + 5;
    performPlotVerb(plot, 'pet', { ...c, now: later });
    performPlotVerb(plot, 'pet', { ...c, now: later });
    const third = performPlotVerb(plot, 'pet', { ...c, now: later });
    assert.equal(third.grew, true);
    assert.equal(plot.stage, 'tree');
  });

  it('an unpetted seedling withers back to a weedy patch after four hours', () => {
    const { plot, c } = plantedPlot();
    assert.deepEqual(tickPlot(plot, c.now + SOIL_TIMERS.seedlingMaxMs).events, ['withered']);
    assert.equal(plot.stage, 'dirty');
    assert.equal(plot.classTsid, 'patch');
  });

  it('the planter grow upgrade starts the tree at maturity 4', () => {
    const { plot, c } = plantedPlot({ upgrades: ['soil_appreciation_bean_grow_2'] });
    for (let i = 0; i < 3; i += 1) performPlotVerb(plot, 'pet', { ...c, now: c.now + 60000 });
    assert.equal(plot.tree.state.maturity, 4);
  });

  it('living trees grow on the source 10/20-minute maturity cycles', () => {
    assert.equal(maturityCycleMs(1), 600000);
    assert.equal(maturityCycleMs(4), 1200000);
    assert.equal(maturityGrowChance(1, 7), 0.8);
    assert.equal(maturityGrowChance(4, 10), 0.4);
    assert.equal(maturityGrowChance(9, 8), 0.04);
    assert.equal(maturityGrowChance(5, 4), 0);
    const plot = createPlot('patch');
    plot.stage = 'seedling';
    plot.seedling = { trantClass: 'trant_fruit', petted: 3, minAt: 0, maxAt: 1e12, thirdPetAt: 0, growLevel: 0 };
    growTree(plot, 0);
    tickPlot(plot, 600000, { rng: () => 0 });
    assert.equal(plot.tree.state.maturity, 2);
    tickPlot(plot, 600000 + 1200000 * 3, { rng: () => 0 });
    assert.equal(plot.tree.state.maturity, 5);
  });

  it('a grown Wood Tree matures through care counts and returns to a patch at maturity 0', () => {
    const plot = createPlot('patch');
    plot.stage = 'seedling';
    plot.seedling = { trantClass: 'wood_tree', petted: 3, minAt: 0, maxAt: 1e12, thirdPetAt: 0, growLevel: 0 };
    const tree = growTree(plot, 0);
    assert.equal(tree.state.maturity, 1);
    for (let day = 0; day < 2; day += 1) {
      tree.state.petted = true;
      tree.state.watered = true;
      noteWoodTreeCare(tree);
      tree.state.petted = false;
      tree.state.watered = false;
      noteWoodTreeCare(tree);
    }
    assert.equal(tree.state.maturity, 2);
    tree.state.maturity = 0;
    tickPlot(plot, 10);
    assert.equal(plot.stage, 'tree');
    assert.deepEqual(tickPlot(plot, 10 + SOIL_TIMERS.woodToPatchMs).events, ['woodCleared']);
    assert.equal(plot.stage, 'dirty');
  });
});

describe('wood tree harvest', () => {
  it('a surviving harvest zeroes the care counts (wood_tree.js endHarvest)', () => {
    const plot = createPlot('patch');
    plot.stage = 'seedling';
    plot.seedling = { trantClass: 'wood_tree', petted: 3, minAt: 0, maxAt: 1e12, thirdPetAt: 0, growLevel: 0 };
    const tree = growTree(plot, 0);
    tree.state.maturity = 3;
    tree.state.petted = true;
    noteWoodTreeCare(tree);
    assert.equal(tree.woodPetted, 1);
    tree.state.totalHarvests = (tree.state.totalHarvests || 0) + 1;
    noteWoodTreeCare(tree);
    assert.equal(tree.woodPetted, 0);
  });
});

describe('dead trees', () => {
  it('clearing a Dead Egg Plant gives 25 Planks and leaves a Dark Patch', () => {
    const plot = createPlot('trant_egg_dead');
    assert.equal(plot.stage, 'dead');
    const c = ctx();
    const result = performPlotVerb(plot, 'clear', c);
    assert.equal(result.ok, true);
    assert.equal(c.inv.plank, 25);
    assert.equal(c.pc.energy, 80);
    assert.equal(getToolCondition(c.toolState, 'hatchet').remaining, 95);
    assert.equal(plot.stage, 'dirty');
    assert.equal(plot.kind, 'patch_dark');
    assert.ok(result.counters.some((r) => r.counter === 'dead_trants_cleared:trant_egg_dead'));
    assert.ok(result.response);
  });

  it('needs a hatchet', () => {
    const plot = createPlot('trant_bean_dead');
    assert.equal(plotVerbs(plot, ctx({ inv: { hatchet: 0 } }))[0].reason, "You'll need a working Hatchet.");
  });
});

describe('persistence and presentation', () => {
  it('normalizes saved plots and keeps tree state identity', () => {
    const plot = createPlot('patch');
    plot.stage = 'seedling';
    plot.seedling = { trantClass: 'trant_bean', petted: 3, minAt: 0, maxAt: 1e12, thirdPetAt: 0, growLevel: 0 };
    growTree(plot, 0);
    const saved = JSON.parse(JSON.stringify(plot));
    const restored = normalizePlot(saved);
    assert.equal(restored.stage, 'tree');
    assert.equal(restored.tree.state, saved.tree.state);
    assert.equal(normalizePlot({ classTsid: 'nope' }), null);
    assert.equal(normalizePlot({ classTsid: 'patch', stage: 'seedling', seedling: {} }).stage, 'dirty');
  });

  it('caps spawn counts and names the art per stage', () => {
    assert.equal(soilSpawnClasses({ patch: 12, patch_dark: 1, trant_bean_dead: 1 }).length, 10);
    assert.equal(plotArtPath(createPlot('patch_dark')), 'assets/sprites/soil/patch-dark-dirty.png');
    assert.equal(plotArtPath(createPlot('trant_gas_dead')), 'assets/sprites/soil/trant-gas-dead.png');
    assert.match(plotStatusLabel(createPlot('patch')), /Weedy/);
  });
});

describe('soil badge counters reach their group_sum badges', async () => {
  const { readFile } = await import('node:fs/promises');
  const { setContentCatalogs } = await import('../public/js/content-catalogs.js');
  const { applyAchievementProgress, createAchievementState } = await import('../public/js/achievements.js');
  const achievements = JSON.parse(await readFile(new URL('../public/assets/content/achievements.json', import.meta.url), 'utf8'));

  it('VERB:tend:patch counts toward Mulcher and VERB:plant:patch toward Whiz-Bang Plantifier', () => {
    setContentCatalogs({ achievements });
    const state = createAchievementState();
    const pc = { xp: 0, imagination: 0, favor: {} };
    for (let i = 0; i < 7; i += 1) applyAchievementProgress(state, 'VERB:tend:patch', 1, pc);
    assert.ok(state.unlocked.includes('mulcher'));
    applyAchievementProgress(state, 'VERB:plant:patch', 1, pc);
    assert.equal(state.progress.whizbang_plantifier.progress['181'], 1);
    for (let i = 0; i < 5; i += 1) applyAchievementProgress(state, 'beans_planted:bean_bean', 1, pc);
    assert.ok(state.unlocked.includes('basic_beangrower'));
  });
});
