/**
 * Verb rewards, making, consume — gather→make→use loop + tool-gated GSJS crafts.
 * Run: node --test tests/making-loop.test.js
 */
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  getVerbReward,
  applyVerbReward,
  formatActivityLine,
  createActivityLog,
  appendActivity,
  VERB_REWARDS,
} from '../public/js/verb-rewards.js';
import {
  RECIPE_CATALOG,
  TOOL_CATALOG,
  listRecipes,
  listRecipesForTool,
  listTools,
  craftRecipe,
  craftRecipeBatch,
  formatCraftProgress,
  formatCraftResultLine,
  craftDurationFor,
  createCraftSession,
  advanceCraftSession,
  cancelCraftSession,
  buildCraftBatchResult,
  canCraftAgain,
  canCraft,
  ensureMakingItems,
  hasTool,
  loadRecipeCatalogFromFile,
  starterToolsInventory,
  starterCraftIngredients,
} from '../public/js/making.js?v=g403-1';
import {
  createInventory,
  countItem,
  useItem,
  addItem,
  removeItem,
  listPackItemSlots,
  listPackToolSlots,
  listPackRows,
} from '../public/js/inventory.js?v=catalog-unified-7';
import {
  buildActivitySegments,
  activitySegmentsToHtml,
  formatSignedDelta,
} from '../public/js/verb-rewards.js';
import { runVerb } from '../public/content.js?v=g455-2';

const __dirname = dirname(fileURLToPath(import.meta.url));
const recipesPath = join(__dirname, '../public/assets/content/recipes.json');

describe('verb rewards (GSJS skill packages)', () => {
  it('has pet/squeeze/harvest reward tables', () => {
    assert.ok(getVerbReward('npc_piggy', 'pet'));
    assert.ok(getVerbReward('npc_chicken', 'squeeze'));
    assert.ok(getVerbReward('trant_fruit', 'harvest'));
    assert.ok(Object.keys(VERB_REWARDS).length >= 6);
  });

  it('applyVerbReward spends energy and gains mood/xp + activity line', () => {
    const pc = { energy: 50, mood: 40, imagination: 0, xp: 0 };
    const reward = getVerbReward('npc_piggy', 'pet');
    const beforeE = pc.energy;
    const r = applyVerbReward(pc, reward);
    assert.equal(r.ok, true);
    assert.ok(pc.energy < beforeE);
    assert.ok(pc.mood >= 40);
    assert.ok(pc.imagination >= 1 || pc.xp >= 1);
    const line = formatActivityLine(reward.activity, {
      energy: r.energy,
      mood: r.mood,
      xp: r.xp,
      items: { grain: 1 },
    });
    assert.match(line, /energy/i);
    assert.match(line, /mood|iMG|grain/i);
    // Signed deltas (original feed style)
    assert.match(line, /-\d+\s+energy/);
    assert.match(line, /\+\d+\s+(mood|iMG)/);
    const segs = buildActivitySegments(reward.activity, {
      energy: r.energy,
      mood: r.mood,
      xp: r.xp,
    });
    assert.ok(segs.some((s) => s.kind === 'loss' && s.stat === 'energy'));
    assert.ok(segs.some((s) => s.kind === 'gain'));
    const html = activitySegmentsToHtml(segs);
    assert.match(html, /act-loss/);
    assert.match(html, /act-gain/);
    assert.equal(formatSignedDelta(-4, 'energy'), '-4 energy');
    assert.equal(formatSignedDelta(2, 'mood'), '+2 mood');
    const log = createActivityLog();
    appendActivity(log, line);
    assert.equal(log.lines[0], line);
  });

  it('runVerb pet piggy produces activityLine with energy loss', () => {
    const pc = { energy: 50, mood: 40, imagination: 0 };
    const inv = createInventory();
    const target = { classId: 'npc_piggy', state: {} };
    const res = runVerb(target, 'pet', { pc, inv, rng: () => 0.5 });
    assert.equal(res.ok, true);
    assert.ok(res.effects.energy < 0);
    assert.ok(res.effects.activityLine);
    assert.match(res.effects.activityLine, /energy/i);
  });
});

describe('making (GSJS recipes + tools)', () => {
  before(async () => {
    await loadRecipeCatalogFromFile(recipesPath);
    ensureMakingItems();
  });

  it('loads GSJS-derived catalog with required tools', () => {
    const list = listRecipes();
    assert.ok(list.length >= 10, `expected ≥10 recipes, got ${list.length}`);
    assert.ok(RECIPE_CATALOG.flour);
    assert.ok(RECIPE_CATALOG.sammich);
    assert.ok(RECIPE_CATALOG.orange_juice || list.some((r) => r.tool === 'blender'));
    assert.ok(list.some((r) => r.tool === 'gassifier') || list.some((r) => r.tool === 'bubble_tuner'));

    const tools = listTools().map((t) => t.classTsid);
    for (const id of ['knife_and_board', 'frying_pan', 'blender']) {
      assert.ok(tools.includes(id), `missing tool ${id}`);
      assert.ok(TOOL_CATALOG[id], id);
    }
    assert.ok(tools.includes('gassifier') || tools.includes('bubble_tuner'));

    // Source provenance
    assert.match(RECIPE_CATALOG.flour.source, /catalog_recipes/);
    const file = JSON.parse(readFileSync(recipesPath, 'utf8'));
    assert.ok(file.flour || file.sammich);
    assert.equal(RECIPE_CATALOG.flour.inputs[0].classTsid, 'grain');
    assert.equal(RECIPE_CATALOG.flour.inputs[0].qty, 5);
  });

  it('requires knife_and_board tool for flour; no inventory mutation on fail', () => {
    const inv = createInventory({ grain: 10 }); // no tools
    const pc = { energy: 50, imagination: 0, xp: 0 };
    assert.equal(hasTool(inv, 'knife_and_board'), false);
    const snap = { ...inv };
    const r = craftRecipe(inv, pc, 'flour', { requireTool: true });
    assert.equal(r.ok, false);
    assert.equal(r.reason, 'tool');
    assert.equal(countItem(inv, 'grain'), snap.grain);
    assert.equal(countItem(inv, 'flour'), 0);
    assert.equal(pc.energy, 50);
  });

  it('craft fails without ingredients and does not mutate pack', () => {
    const inv = createInventory({
      grain: 2,
      pinch_of_salt: 0,
      knife_and_board: 1,
    });
    const pc = { energy: 50, imagination: 0, xp: 0 };
    const snap = { ...inv };
    const r = craftRecipe(inv, pc, 'flour');
    assert.equal(r.ok, false);
    assert.equal(countItem(inv, 'grain'), snap.grain);
    assert.equal(countItem(inv, 'flour'), 0);
  });

  it('craft flour then bun then sammich succeeds (with tools)', () => {
    const inv = createInventory({
      grain: 10,
      pinch_of_salt: 2,
      meat: 1,
      flour: 0,
      bun: 0,
      sammich: 0,
      knife_and_board: 1,
      frying_pan: 1,
    });
    const pc = { energy: 50, imagination: 0, xp: 0 };
    const f = craftRecipe(inv, pc, 'flour');
    assert.equal(f.ok, true, f.msgs?.join(' '));
    assert.equal(countItem(inv, 'flour'), 1);
    assert.equal(countItem(inv, 'grain'), 5);
    const b = craftRecipe(inv, pc, 'bun');
    assert.equal(b.ok, true, b.msgs?.join(' '));
    assert.equal(countItem(inv, 'bun'), 1);
    const s = craftRecipe(inv, pc, 'sammich');
    assert.equal(s.ok, true, s.msgs?.join(' '));
    assert.equal(countItem(inv, 'sammich'), 1);
    assert.equal(countItem(inv, 'meat'), 0);
    assert.ok(pc.imagination >= 6); // 2+2+2 xp
  });

  it('blender orange juice: tool + ingredients + energy', () => {
    assert.ok(RECIPE_CATALOG.orange_juice, 'orange_juice recipe from GSJS');
    const inv = createInventory({ orange: 5, blender: 1 });
    const pc = { energy: 40, imagination: 0, xp: 0 };
    // missing skill when enforced
    const blocked = craftRecipe(inv, pc, 'orange_juice', {
      learned: [],
      requireSkill: true,
    });
    assert.equal(blocked.ok, false);
    assert.equal(blocked.reason, 'skill');
    assert.equal(countItem(inv, 'orange'), 5);

    const r = craftRecipe(inv, pc, 'orange_juice', {
      learned: ['blending_1'],
      requireSkill: true,
    });
    assert.equal(r.ok, true, r.msgs?.join(' '));
    assert.equal(countItem(inv, 'orange'), 0);
    assert.equal(countItem(inv, 'orange_juice'), 1);
    assert.equal(pc.energy, 40 - RECIPE_CATALOG.orange_juice.energyCost);
    assert.ok(pc.imagination >= RECIPE_CATALOG.orange_juice.xpReward);
  });

  it('gassifier laughing gas from general_vapour', () => {
    assert.ok(RECIPE_CATALOG.laughing_gas, 'laughing_gas from GSJS');
    const inv = createInventory({ general_vapour: 10, gassifier: 1 });
    const pc = { energy: 50, imagination: 0, xp: 0 };
    const r = craftRecipe(inv, pc, 'laughing_gas');
    assert.equal(r.ok, true, r.msgs?.join(' '));
    assert.equal(countItem(inv, 'laughing_gas'), 1);
    assert.equal(countItem(inv, 'general_vapour'), 10 - 3);
  });

  it('bubble_tuner blue bubble from plain_bubble', () => {
    assert.ok(RECIPE_CATALOG.blue_bubble);
    const inv = createInventory({ plain_bubble: 2, bubble_tuner: 1 });
    const pc = { energy: 30, imagination: 0, xp: 0 };
    const r = craftRecipe(inv, pc, 'blue_bubble');
    assert.equal(r.ok, true, r.msgs?.join(' '));
    assert.equal(countItem(inv, 'blue_bubble'), 1);
    assert.equal(countItem(inv, 'plain_bubble'), 1);
  });

  it('listRecipesForTool filters blender vs knife', () => {
    const blend = listRecipesForTool('blender');
    assert.ok(blend.length >= 1);
    assert.ok(blend.every((r) => r.tool === 'blender'));
    const knife = listRecipesForTool('knife_and_board');
    assert.ok(knife.some((r) => r.key === 'flour' || r.id === '138'));
  });

  it('starter kits include all making tools', () => {
    const tools = starterToolsInventory();
    for (const id of ['knife_and_board', 'frying_pan', 'blender', 'gassifier', 'bubble_tuner']) {
      assert.equal(tools[id], 1, id);
    }
    const ing = starterCraftIngredients();
    assert.ok(ing.grain >= 5);
    assert.ok(ing.plain_bubble >= 1);
    assert.ok(ing.general_vapour >= 1);
  });

  it('craftRecipeBatch qty≥2 yields progress i-of-N and result with energy/xp + make-more', () => {
    const inv = createInventory({
      grain: 20,
      knife_and_board: 1,
      flour: 0,
    });
    const pc = { energy: 50, imagination: 0, xp: 0 };
    const beforeE = pc.energy;
    const batch = craftRecipeBatch(inv, pc, 'flour', 3, { requireTool: true });
    assert.equal(batch.ok, true, batch.msgs?.join(' '));
    assert.equal(batch.made, 3);
    assert.equal(batch.qtyRequested, 3);
    assert.equal(batch.progress.length, 3);
    assert.match(batch.progress[0].label, /Making 1 of 3/i);
    assert.match(batch.progress[2].label, /Making 3 of 3/i);
    assert.equal(formatCraftProgress(2, 5, 'Flour'), 'Making 2 of 5: Flour');
    assert.ok(batch.result);
    assert.equal(batch.result.made, 3);
    assert.equal(batch.result.energy, -3 * (RECIPE_CATALOG.flour.energyCost || 0));
    assert.equal(batch.result.xp, 3 * (RECIPE_CATALOG.flour.xpReward || 0));
    assert.ok(batch.result.energy < 0);
    assert.ok(batch.result.xp > 0);
    assert.equal(pc.energy, beforeE + batch.result.energy);
    assert.equal(countItem(inv, 'flour'), 3);
    assert.equal(countItem(inv, 'grain'), 20 - 15);
    assert.match(batch.result.activityLine, /Flour/i);
    assert.match(batch.result.activityLine, /energy/i);
    assert.match(
      formatCraftResultLine(batch.result),
      /You made Flour \(x3\)/i
    );
    assert.equal(typeof batch.result.canMakeMore, 'boolean');
    assert.equal(batch.result.canMakeMore, canCraftAgain(inv, pc, 'flour'));
    // make-more path expressible without reimplementation
    if (batch.result.canMakeMore) {
      const again = craftRecipeBatch(inv, pc, 'flour', 1);
      assert.equal(again.ok, true);
      assert.equal(again.made, 1);
    }
  });

  it('timed making advances without mutating inventory until a unit is ready', () => {
    const inv = createInventory({ grain: 10, knife_and_board: 1 });
    const before = { ...inv };
    const recipe = RECIPE_CATALOG.flour;
    const duration = craftDurationFor(recipe);
    let timer = createCraftSession({
      recipeKey: 'flour',
      recipeName: recipe.name,
      tool: recipe.tool,
      qty: 2,
      durationMs: duration,
    });
    const half = advanceCraftSession(timer, duration / 2);
    timer = half.session;
    assert.equal(half.unitsReady, 0);
    assert.equal(timer.completed, 0);
    assert.equal(timer.unitProgress, 0.5);
    assert.deepEqual(inv, before, 'timer helpers must never mutate inventory');

    const ready = advanceCraftSession(timer, duration / 2);
    assert.equal(ready.unitsReady, 1);
    assert.equal(ready.session.completed, 1);
    assert.equal(ready.session.status, 'running');
    assert.equal(ready.session.totalProgress, 0.5);
    assert.deepEqual(inv, before);
  });

  it('timed making supports large ticks, completion, and partial cancellation', () => {
    let timer = createCraftSession({ recipeKey: 'flour', qty: 3, durationMs: 1000 });
    const step = advanceCraftSession(timer, 2400);
    timer = step.session;
    assert.equal(step.unitsReady, 2);
    assert.equal(timer.completed, 2);
    assert.equal(timer.unitProgress, 0.4);
    assert.ok(Math.abs(timer.totalProgress - 0.8) < 1e-9);

    const cancelled = cancelCraftSession(timer);
    assert.equal(cancelled.status, 'cancelled');
    assert.equal(cancelled.completed, 2, 'completed units survive cancellation');
    const after = advanceCraftSession(cancelled, 5000);
    assert.equal(after.unitsReady, 0);
    assert.equal(after.session.completed, 2);

    const complete = advanceCraftSession(
      createCraftSession({ recipeKey: 'flour', qty: 3, durationMs: 1000 }),
      3000
    );
    assert.equal(complete.unitsReady, 3);
    assert.equal(complete.session.status, 'complete');
    assert.equal(complete.session.totalProgress, 1);
  });

  it('buildCraftBatchResult summarizes only units already committed', () => {
    const inv = createInventory({ grain: 15, knife_and_board: 1 });
    const pc = { energy: 50, imagination: 0, xp: 0 };
    assert.equal(craftRecipe(inv, pc, 'flour').ok, true);
    assert.equal(craftRecipe(inv, pc, 'flour').ok, true);
    const result = buildCraftBatchResult(inv, pc, 'flour', 2, 3);
    assert.ok(result);
    assert.equal(result.made, 2);
    assert.equal(result.qtyRequested, 3);
    assert.equal(result.used[0].qty, 10);
    assert.equal(result.used[0].remain, 5);
    assert.equal(result.outputs[0].qty, 2);
    assert.match(result.activityLine, /Flour \(x2\)/);
  });

  it('dual-row pack splits starter tools from goods', () => {
    const inv = createInventory({
      ...starterToolsInventory(),
      ...starterCraftIngredients(),
      apple: 2,
    });
    const items = listPackItemSlots(inv);
    const tools = listPackToolSlots(inv);
    const rows = listPackRows(inv);
    assert.ok(items.some((s) => s.classTsid === 'apple' || s.classTsid === 'grain'));
    assert.ok(!items.some((s) => s.classTsid === 'knife_and_board'));
    assert.ok(tools.some((s) => s.classTsid === 'knife_and_board'));
    assert.ok(tools.every((s) => s.isTool));
    assert.ok(items.every((s) => !s.isTool));
    assert.equal(rows.tools.length, tools.length);
    assert.equal(rows.items.length, items.length);
    assert.ok(rows.totalStacks >= 2);
  });
});

describe('consume craft outputs', () => {
  it('useItem sammich reduces count and restores energy', () => {
    const inv = createInventory({ sammich: 2 });
    const pc = { energy: 20, mood: 20 };
    const r = useItem(inv, pc, 'sammich');
    assert.equal(r.ok, true);
    assert.equal(countItem(inv, 'sammich'), 1);
    assert.ok(pc.energy > 20);
  });
});

describe('UI wiring', () => {
  it('index/game wire making panel, tool chips, and the notices (js/notify-view.js)', () => {
    const html = readFileSync(join(__dirname, '../public/play/index.html'), 'utf8');
    assert.ok(html.includes('id="make-panel"'));
    assert.ok(html.includes('id="make-btn"'));
    assert.ok(html.includes('id="make-tools"'));
    assert.ok(html.includes('id="make-detail"') || html.includes('make-grid'));
    assert.ok(html.includes('id="make-progress"'));
    assert.ok(html.includes('id="make-result"'));
    assert.ok(html.includes('js/notify-view.js') || readFileSync(join(__dirname, '../public/game.js'), 'utf8').includes("from './js/notify-view.js?v="));
    assert.ok(html.includes('id="pack-items"'));
    assert.ok(html.includes('id="pack-tools"'));
    assert.ok(html.includes('id="stat-currants"'));
    assert.ok(html.includes('vendor-shelf') || html.includes('id="vendor-list"'));
    const css = readFileSync(join(__dirname, '../public/style.css'), 'utf8');
    assert.ok(css.includes('act-loss'));
    assert.ok(css.includes('act-gain'));
    assert.ok(css.includes('pack-tools') || css.includes('pack-rows'));
    assert.ok(css.includes('make-tool-work'));
    assert.ok(css.includes('.mp-stage'));
    assert.ok(css.includes('.make-progress[hidden]'));
    const game = readFileSync(join(__dirname, '../public/game.js'), 'utf8');
    assert.ok(game.includes('openMakePanel'));
    assert.ok(game.includes('craftRecipe'));
    assert.ok(game.includes('craftRecipeBatch'));
    assert.ok(game.includes('runMakeCraft') || game.includes('showMakeResult'));
    assert.ok(game.includes('updateMakeCraft'));
    assert.ok(game.includes('cancelMakeCraft'));
    assert.ok(game.includes('advanceCraftSession'));
    assert.ok(game.includes('listPackRows') || game.includes('listPackItemSlots'));
    assert.ok(game.includes('makeToolFilter') || game.includes('make-tools'));
    assert.ok(game.includes('loadRecipeCatalog'));
    assert.ok(game.includes('pushActivity'));
    assert.ok(game.includes('createSpriteOutline'));
    // executeVerb must push the activity feed once (prefer activityLine), not once in msgs.forEach and again on ok
    const execStart = game.indexOf('function executeVerb(');
    assert.ok(execStart >= 0);
    let depth = 0;
    let execEnd = -1;
    const braceAt = game.indexOf('{', execStart);
    for (let j = braceAt; j < game.length; j++) {
      if (game[j] === '{') depth += 1;
      else if (game[j] === '}') {
        depth -= 1;
        if (depth === 0) {
          execEnd = j + 1;
          break;
        }
      }
    }
    const execBody = game.slice(execStart, execEnd);
    const pushes = execBody.split('pushActivity(').length - 1;
    assert.equal(pushes, 1, `executeVerb should call pushActivity once, got ${pushes}`);
    assert.ok(execBody.includes('feedLine') || execBody.includes('activityLine'));
    // Outline must not be a child of the sprite (would paint solid over art)
    assert.match(game, /entityLayer\.addChildAt\(outline/);
  });
});

describe('quest-taught recipes (learnt 3)', () => {
  it('Batterfly Bounty teaches the Batterfly Bounty Booster Bar', async () => {
    const { RECIPE_CATALOG, canCraft, searchRecipes, recipeKnown, loadRecipeCatalog } = await import('../public/js/making.js?v=g403-1');
    if (typeof loadRecipeCatalog === 'function') await loadRecipeCatalog?.();
    const bar = Object.values(RECIPE_CATALOG).find((r) => r.id === '305');
    assert.ok(bar, 'recipe 305 imported');
    assert.equal(bar.taughtBy, 'batterfly_bounty');
    assert.equal(recipeKnown(bar, []), false);
    assert.equal(recipeKnown(bar, ['batterfly_bounty']), true);
    const inv = { awesome_pot: 1, grain: 20, oats: 5, hot_pepper: 7, cumin: 5, plum: 5, hot_n_fizzy_sauce: 1, olive_oil: 1 };
    assert.equal(canCraft(inv, bar, { completedQuests: [] }).reason, 'quest');
    assert.notEqual(canCraft(inv, bar, { completedQuests: ['batterfly_bounty'] }).reason, 'quest');
    assert.ok(!searchRecipes('batterfly', { tool: 'all', completedQuests: [] }).some((r) => r.id === '305'));
    assert.ok(searchRecipes('batterfly', { tool: 'all', completedQuests: ['batterfly_bounty'] }).some((r) => r.id === '305'));
  });
});
