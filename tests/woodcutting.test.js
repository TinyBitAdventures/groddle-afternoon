import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  WOOD_TREE_HARVEST,
  ensureWoodTreeState,
  harvestWoodTree,
  plankYieldForMaturity,
  quoteWoodTreeHarvest,
  resetWoodTreeDay,
  woodTreeStatusLabel,
} from '../public/js/woodcutting.js?v=woodcutting-test-4';
import {
  TOOL_CONDITION_CATALOG,
  createToolConditionState,
  getToolCondition,
  setToolRemaining,
} from '../public/js/tools.js?v=woodcutting-test-3';
import { getVerbsFor, runVerb } from '../public/content.js?v=woodcutting-test-11';
import { actionDurationFor } from '../public/js/action-timing.js?v=woodcutting-test-1';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function freshContext(overrides = {}) {
  return {
    inv: { hatchet: 1, plank: 0 },
    pc: { energy: 100, mood: 50, imagination: 0, xp: 0 },
    tools: createToolConditionState(),
    skills: { learned: [] },
    ...overrides,
  };
}

test.describe('official Wood Tree harvesting', () => {
  test('ports the original package timing, energy, Hatchet wear, and production curve', () => {
    assert.equal(WOOD_TREE_HARVEST.durationMs, 4000);
    assert.equal(WOOD_TREE_HARVEST.energyCost, 20);
    assert.equal(WOOD_TREE_HARVEST.hatchetWear, 5);
    assert.deepEqual(WOOD_TREE_HARVEST.plankYieldByMaturity, [25, 30, 40, 50, 60, 80]);
    assert.deepEqual([1, 2, 3, 4, 5, 6].map(plankYieldForMaturity), [25, 30, 40, 50, 60, 80]);
    assert.equal(actionDurationFor('wood_tree', 'harvest'), 4000);
  });

  test('tracks Hatchet condition with the official 100-point capacity', () => {
    assert.deepEqual(TOOL_CONDITION_CATALOG.hatchet, {
      label: 'Hatchet',
      capacity: 100,
      baseCost: 100,
      source: 'hatchet.js',
    });
  });

  test('atomically harvests 80 planks and wears five Hatchet points', () => {
    const state = ensureWoodTreeState({ maturity: 6 });
    const ctx = freshContext();
    const result = harvestWoodTree(state, ctx.inv, ctx.pc, ctx.tools);
    assert.equal(result.ok, true);
    assert.equal(result.plankYield, 80);
    assert.equal(ctx.inv.plank, 80);
    assert.equal(ctx.pc.energy, 80);
    assert.equal(getToolCondition(ctx.tools, 'hatchet').remaining, 95);
    assert.equal(state.harvestedToday, true);
    assert.equal(state.maturity, 6);
    assert.equal(state.harvestCount, 1);
    assert.match(result.line, /wood|plank|Timber/i);
  });

  test('reduces mature trees every second harvest and wee trees immediately', () => {
    const state = ensureWoodTreeState({ maturity: 6 });
    const ctx = freshContext();
    harvestWoodTree(state, ctx.inv, ctx.pc, ctx.tools);
    resetWoodTreeDay(state);
    ctx.pc.energy = 100;
    const second = harvestWoodTree(state, ctx.inv, ctx.pc, ctx.tools);
    assert.equal(second.maturityAfter, 5);
    assert.equal(state.harvestCount, 0);

    const wee = ensureWoodTreeState({ maturity: 2 });
    const weeCtx = freshContext();
    assert.equal(harvestWoodTree(wee, weeCtx.inv, weeCtx.pc, weeCtx.tools).maturityAfter, 1);
  });

  test('blocks missing, broken, tired, and repeat harvests without mutation', () => {
    const missingCtx = freshContext({ inv: { hatchet: 0, plank: 0 } });
    const missingState = ensureWoodTreeState({ maturity: 6 });
    assert.equal(quoteWoodTreeHarvest(missingState, missingCtx.inv, missingCtx.pc, missingCtx.tools).reason, 'hatchet');

    const brokenCtx = freshContext();
    setToolRemaining(brokenCtx.tools, 'hatchet', 0);
    assert.equal(quoteWoodTreeHarvest({}, brokenCtx.inv, brokenCtx.pc, brokenCtx.tools).reason, 'broken_hatchet');

    const tiredCtx = freshContext({ pc: { energy: 19 } });
    assert.equal(quoteWoodTreeHarvest({}, tiredCtx.inv, tiredCtx.pc, tiredCtx.tools).reason, 'energy');

    const repeatState = ensureWoodTreeState({ maturity: 6, harvestedToday: true });
    const repeatCtx = freshContext();
    const before = JSON.stringify({ repeatState, inv: repeatCtx.inv, pc: repeatCtx.pc, tools: repeatCtx.tools });
    assert.equal(harvestWoodTree(repeatState, repeatCtx.inv, repeatCtx.pc, repeatCtx.tools).reason, 'daily_limit');
    assert.equal(JSON.stringify({ repeatState, inv: repeatCtx.inv, pc: repeatCtx.pc, tools: repeatCtx.tools }), before);
  });

  test('repairs legacy state fields and formats an honest subtitle', () => {
    const state = ensureWoodTreeState({ maturity: 99, harvest_count: 1, harvested: true });
    assert.equal(state.maturity, 6);
    assert.equal(state.harvestCount, 1);
    assert.equal(state.harvestedToday, true);
    assert.equal('harvested' in state, false);
    assert.match(woodTreeStatusLabel(state), /harvested today/);
  });
});

test.describe('Wood Tree client integration', () => {
  test('verb menu previews exact yield, commits the official result, and returns tree speech', () => {
    const ctx = freshContext();
    const target = { classId: 'wood_tree', label: 'Wood Tree', state: { maturity: 6 } };
    const verb = getVerbsFor(target, ctx).find((row) => row.id === 'harvest');
    const water = getVerbsFor(target, ctx).find((row) => row.id === 'water');
    assert.equal(water.energy, 3);
    assert.equal(verb.enabled, true);
    assert.match(verb.tooltip, /80 planks/);
    assert.match(verb.tooltip, /5 condition/);
    const result = runVerb(target, 'harvest', ctx);
    assert.equal(result.ok, true);
    assert.equal(result.woodTreeChanged, true);
    assert.equal(result.speech.speaker, 'Wood Tree');
    assert.equal(result.effects.items.plank, 80);
    assert.equal(result.effects.energy, -20);
  });

  test('ships the authentic icon, broken icon, 8×5 animation, and six maturity frames', () => {
    const png = (relative) => {
      const bytes = fs.readFileSync(path.join(root, 'public', relative));
      return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
    };
    assert.deepEqual(png('assets/sprites/icons/hatchet.png'), { width: 46, height: 42 });
    assert.deepEqual(png('assets/sprites/icons/hatchet_broken.png'), { width: 44, height: 39 });
    assert.deepEqual(png('assets/sprites/tools/hatchet-tool.png'), { width: 880, height: 320 });
    assert.deepEqual(
      png('assets/sprites/wood_tree_maturity_6_variant_2_x6_1_png_1354833445.png'),
      { width: 528, height: 138 }
    );
  });

  test('wires maturity visuals, animation, deterministic QA, saves, and mute-by-default', () => {
    const game = fs.readFileSync(path.join(root, 'public/game.js'), 'utf8');
    const html = fs.readFileSync(path.join(root, 'public/play/index.html'), 'utf8');
    assert.match(game, /function textureForWoodTree\(maturity\)/);
    assert.match(game, /function refreshWoodTreeVisual\(target\)/);
    assert.match(game, /function playHatchetAnimation\(target\)/);
    assert.match(game, /hatchet-tool\.png/);
    assert.match(game, /wooddemo/);
    assert.match(game, /woodreset/);
    assert.match(game, /hatchetremaining/);
    assert.match(game, /bootParams\.has\('hatchetremaining'\)/);
    assert.match(game, /resetWoodTreeDay\(tree\.state\)/);
    assert.match(game, /woodTreeChanged/);
    assert.match(game, /if \(inv\.hatchet === undefined\) inv\.hatchet = 1/);
    assert.match(html, /game\.js\?v=official-ecology-1/);
    assert.match(game, /muted: loadMutedPreference\(\)/);
  });
});
