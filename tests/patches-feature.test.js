import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  demoPlotClass,
  patchDemoKit,
  pendingPlotRows,
  prepareStreetPlots,
  soilCountsForStreet,
  soilPlacementGroups,
  soilSpawnPlan,
  trantFrameStage,
  treeFrameUrl,
  patchesFeature,
} from '../public/js/features/patches-feature.js?v=22fe1430';
import { FEATURES } from '../public/js/features/index.js?v=a57a5976';
import { soilSpritePaths } from '../public/js/patches.js?v=3996c344';

const ecology = JSON.parse(await readFile(new URL('../public/assets/content/street-ecology.json', import.meta.url), 'utf8'));

describe('soil populations from the archived streets', () => {
  it('the ecology catalog carries every recovered Patch on indexed streets', () => {
    const totals = {};
    for (const counts of Object.values(ecology.soil)) {
      for (const [cls, n] of Object.entries(counts)) totals[cls] = (totals[cls] || 0) + n;
    }
    assert.equal(totals.patch, 185);
    assert.equal(totals.patch_dark, 8);
    assert.equal(totals.trant_bean_dead, 2);
  });

  it('reads soil counts through G/L aliases', () => {
    assert.deepEqual(soilCountsForStreet('GLI1018LOKA18M6', ecology), { patch: 10 });
    assert.deepEqual(soilCountsForStreet('LLI1018LOKA18M6', ecology), { patch: 10 });
    assert.deepEqual(soilCountsForStreet('nope', ecology), {});
  });

  it('asks the planner for capped groups and pairs the points with plot keys', () => {
    const groups = soilPlacementGroups({ patch: 12, patch_dark: 2, trant_bean_dead: 1 });
    assert.deepEqual(groups.map((g) => [g.key, g.count]), [['soil:patch', 8], ['soil:patch_dark', 2], ['soil:trant_bean_dead', 1]]);
    const plan = soilSpawnPlan({ patch: 2, trant_gas_dead: 1 }, (key) => (key === 'soil:patch' ? [{ x: 10, y: 5 }, { x: 300, y: 5 }] : [{ x: 600, y: 9 }]));
    assert.deepEqual(plan.map((p) => p.key), ['patch:0', 'patch:1', 'trant_gas_dead:0']);
  });

  it('keeps saved plots across visits and creates new ones otherwise', () => {
    const slot = {};
    const plan = [{ key: 'patch:0', classTsid: 'patch', x: 1, y: 2 }];
    const [first] = prepareStreetPlots(slot, plan, { now: 5 });
    first.plot.stage = 'clean';
    first.plot.dueAt = 99;
    const saved = JSON.parse(JSON.stringify(slot));
    const [again] = prepareStreetPlots(saved, plan, { now: 6 });
    assert.equal(again.plot.stage, 'clean');
    assert.equal(again.plot.dueAt, 99);
  });
});

describe('G270: plots still loading count on the loading card', () => {
  it('lists planned plots without a target by the class their target will carry', () => {
    const planned = [
      { key: 'patch:0', plot: { stage: 'dirty', kind: 'patch' } },
      { key: 'patch_dark:0', plot: { stage: 'clean', kind: 'patch_dark' } },
      { key: 'patch:1', plot: { stage: 'tree', kind: 'patch', tree: { classId: 'trant_bean' } } },
      { key: 'patch:2', plot: { stage: 'seedling', kind: 'patch' } },
    ];
    assert.deepEqual(pendingPlotRows(planned, []).map((r) => r.classId), ['patch', 'patch_dark', 'trant_bean', 'patch_seedling']);
    // Once a plot's view has registered its target it counts through the interactables instead.
    const live = [{ ...planned[0], target: {} }, { key: 'adopted:0', plot: { stage: 'dead', kind: 'patch', deadClass: 'trant_fruit_dead' }, target: null }];
    assert.deepEqual(pendingPlotRows(planned, live).map((r) => r.classId), ['patch_dark', 'trant_bean', 'patch_seedling', 'trant_fruit_dead']);
    assert.deepEqual(pendingPlotRows([], []), []);
  });

  it('game.js adds them to both loading cards, and the feature answers the hook', async () => {
    const game = await readFile(new URL('../public/game.js', import.meta.url), 'utf8');
    assert.equal((game.match(/targets: \[\.\.\.interactables, \.\.\.features\.collect\('pendingTargets', engine\)\]/g) || []).length, 2);
    assert.equal(typeof patchesFeature.pendingTargets, 'function');
    patchesFeature.onStreetClear();
    assert.deepEqual(patchesFeature.pendingTargets(), []);
  });
});

describe('patches feature wiring', () => {
  it('is registered once in the feature list', () => {
    assert.equal(FEATURES.filter((f) => f.id === 'patches').length, 1);
    assert.equal(typeof patchesFeature.placementGroups, 'function');
  });

  it('picks the nearest shipped trant frame stage', () => {
    assert.equal(trantFrameStage(1), 1);
    assert.equal(trantFrameStage(2), 1);
    assert.equal(trantFrameStage(4), 3);
    assert.equal(trantFrameStage(9), 10);
    assert.equal(treeFrameUrl('trant_bean', 6), 'assets/sprites/trants/frames/trant_bean_m5.png?v=all-species-cell-2');
  });

  it('the demo kit carries tools and beans, including one that will not grow in Groddle', () => {
    const kit = patchDemoKit('1');
    assert.equal(kit.hoe, 1);
    assert.equal(kit.shovel, 1);
    assert.equal(kit.bean_bean, 3);
    assert.equal(kit.bean_spice, 1);
    assert.equal(patchDemoKit('dead').hatchet, 1);
    assert.equal(demoPlotClass('dark'), 'patch_dark');
  });

  it('every soil sprite the feature loads ships in the repo', async () => {
    const { access } = await import('node:fs/promises');
    for (const path of [...soilSpritePaths(), 'assets/sprites/soil/hoe-tool.png', 'assets/sprites/soil/shovel-tool.png']) {
      await access(new URL(`../public/${path}`, import.meta.url));
    }
  });
});
