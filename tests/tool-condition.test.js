import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  TOOL_CONDITION_CATALOG,
  createToolConditionState,
  getToolCondition,
  canUseTool,
  useToolCondition,
  quoteToolRepair,
  repairToolCondition,
  setToolRemaining,
} from '../public/js/tools.js';
import { createInventory } from '../public/js/inventory.js';
import {
  createGarden,
  plantPlot,
  waterPlot,
} from '../public/js/garden.js';
import {
  createMineRock,
  mineRock,
  MINING_COSTS,
} from '../public/js/mining.js';
import { craftRecipe } from '../public/js/making.js';
import { createPlayerSave, normalizePlayerSave } from '../public/js/player-save.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(here, '..', 'public');

describe('official persistent tool condition', () => {
  it('ports the capacities and base costs used by the playable tool loops', () => {
    assert.deepEqual(
      Object.fromEntries(
        ['hoe', 'watering_can', 'pick', 'fancy_pick', 'smelter', 'ore_grinder', 'tinkertool']
          .map((id) => [id, TOOL_CONDITION_CATALOG[id].capacity])
      ),
      {
        hoe: 50,
        watering_can: 100,
        pick: 100,
        fancy_pick: 200,
        smelter: 500,
        ore_grinder: 100,
        tinkertool: 200,
      }
    );
    assert.equal(TOOL_CONDITION_CATALOG.pick.baseCost, 500);
    assert.equal(TOOL_CONDITION_CATALOG.hoe.source, 'hoe.js');
    assert.equal(TOOL_CONDITION_CATALOG.butterfly_lotion.capacity, 5);
    assert.equal(TOOL_CONDITION_CATALOG.butterfly_lotion.repairable, false);
    assert.equal(quoteToolRepair(createToolConditionState(), 'butterfly_lotion', ['tinkering_5']).reason, 'not_repairable');
  });

  it('breaks exactly at zero and refuses later wear without mutation', () => {
    const state = createToolConditionState();
    setToolRemaining(state, 'pick', 2);
    const used = useToolCondition(state, 'pick', 2);
    assert.equal(used.ok, true);
    assert.equal(used.broke, true);
    assert.equal(getToolCondition(state, 'pick').remaining, 0);
    assert.equal(state.totalBreaks, 1);

    const before = structuredClone(state);
    const blocked = useToolCondition(state, 'pick', 1);
    assert.equal(blocked.ok, false);
    assert.equal(blocked.reason, 'broken_tool');
    assert.deepEqual(state, before);
  });

  it('uses Tiny Speck Tinkering I rates and repairs atomically', () => {
    const state = createToolConditionState();
    setToolRemaining(state, 'hoe', 44);
    const quote = quoteToolRepair(state, 'hoe', ['tinkering_1']);
    assert.equal(quote.ok, true);
    assert.equal(quote.missing, 6);
    assert.equal(quote.durationSeconds, 2);
    assert.equal(quote.energy, 2);
    assert.equal(quote.tinkertoolWear, 2);

    const pc = { energy: 20 };
    const repaired = repairToolCondition(state, 'hoe', pc, {
      learned: ['tinkering_1'],
      hasTinkertool: true,
    });
    assert.equal(repaired.ok, true);
    assert.equal(pc.energy, 18);
    assert.equal(getToolCondition(state, 'hoe').remaining, 50);
    assert.equal(getToolCondition(state, 'tinkertool').remaining, 198);
    assert.equal(state.totalRepairs, 1);
  });

  it('does not spend repair energy when the Tinkertool cannot do the work', () => {
    const state = createToolConditionState();
    setToolRemaining(state, 'hoe', 10);
    setToolRemaining(state, 'tinkertool', 1);
    const pc = { energy: 100 };
    const before = structuredClone(state);
    const result = repairToolCondition(state, 'hoe', pc, {
      learned: ['tinkering_1'],
      hasTinkertool: true,
    });
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'tinkertool_broken');
    assert.equal(pc.energy, 100);
    assert.deepEqual(state, before);
  });
});

describe('tool wear across gameplay loops', () => {
  it('wears the Watering Can only after a successful garden action', () => {
    const inv = createInventory({ seed_spinach: 2, watering_can: 1 });
    const pc = { energy: 50 };
    const tools = createToolConditionState();
    setToolRemaining(tools, 'watering_can', 1);
    const garden = createGarden({ cols: 2, rows: 1, now: 0 });
    assert.equal(plantPlot(garden, '1-1', inv, pc, 'seed_spinach', { now: 0 }).ok, true);
    assert.equal(plantPlot(garden, '2-1', inv, pc, 'seed_spinach', { now: 0 }).ok, true);

    const first = waterPlot(garden, '1-1', pc, { inv, toolState: tools, now: 1 });
    assert.equal(first.ok, true);
    assert.equal(first.toolUse.broke, true);
    const beforeEnergy = pc.energy;
    const second = waterPlot(garden, '2-1', pc, { inv, toolState: tools, now: 2 });
    assert.equal(second.ok, false);
    assert.equal(second.reason, 'broken_tool');
    assert.equal(pc.energy, beforeEnergy);
    assert.equal(garden.plots['2-1'].wet, false);
  });

  it('spends official pick wear and blocks the next swing before mutating the rock', () => {
    const inv = createInventory({ pick: 1 });
    const pc = { energy: 60, imagination: 0, xp: 0 };
    const tools = createToolConditionState();
    setToolRemaining(tools, 'pick', MINING_COSTS.toolWear);
    const rock = createMineRock('rock_metal_1', { chunksRemaining: 20 });
    const opts = { learned: ['mining_1'], toolState: tools, rng: () => 0, now: 0 };
    const first = mineRock(rock, inv, pc, opts);
    assert.equal(first.ok, true);
    assert.equal(first.toolUse.broke, true);
    const snapshot = { rock: structuredClone(rock), inv: structuredClone(inv), energy: pc.energy };
    const second = mineRock(rock, inv, pc, opts);
    assert.equal(second.ok, false);
    assert.equal(second.reason, 'broken_tool');
    assert.deepEqual(rock, snapshot.rock);
    assert.deepEqual(inv, snapshot.inv);
    assert.equal(pc.energy, snapshot.energy);
  });

  it('wears a cooking tool once per completed recipe and then blocks cleanly', () => {
    const inv = createInventory({ grain: 10, knife_and_board: 1 });
    const pc = { energy: 20, imagination: 0, xp: 0 };
    const tools = createToolConditionState();
    setToolRemaining(tools, 'knife_and_board', 1);
    const opts = { requireSkill: false, toolState: tools };
    const first = craftRecipe(inv, pc, 'flour', opts);
    assert.equal(first.ok, true);
    assert.equal(first.toolUse.broke, true);
    const snapshot = { inv: structuredClone(inv), pc: structuredClone(pc) };
    const second = craftRecipe(inv, pc, 'flour', opts);
    assert.equal(second.ok, false);
    assert.equal(second.reason, 'broken_tool');
    assert.deepEqual(inv, snapshot.inv);
    assert.deepEqual(pc, snapshot.pc);
  });
});

describe('tool save and client wiring', () => {
  it('round-trips condition, break, use, and repair counters through player saves', () => {
    const tools = createToolConditionState();
    setToolRemaining(tools, 'pick', 37);
    tools.condition.pick.uses = 63;
    tools.totalUses = 63;
    tools.totalBreaks = 2;
    tools.totalRepairs = 4;
    const save = createPlayerSave({ inventory: { pick: 1 }, systems: { tools } });
    const normalized = normalizePlayerSave(save);
    assert.deepEqual(normalized.systems.tools, tools);
  });

  test('ships the authentic icon/animation and visible pack repair wiring', () => {
    for (const rel of [
      'assets/sprites/icons/tinkertool.png',
      'assets/sprites/icons/tinkertool_broken.png',
      'assets/sprites/tools/tinkertool-repair.png',
    ]) {
      assert.equal(fs.existsSync(path.join(publicDir, rel)), true, rel);
    }
    const game = fs.readFileSync(path.join(publicDir, 'game.js'), 'utf8');
    const css = fs.readFileSync(path.join(publicDir, 'style.css'), 'utf8');
    const html = fs.readFileSync(path.join(publicDir, 'play/index.html'), 'utf8');
    assert.match(game, /beginToolRepair/);
    assert.match(game, /toolremaining/);
    assert.match(game, /pack-slot-wear/);
    assert.match(css, /tinkertool-repair\.png/);
    assert.match(html, /game\.js\?v=official-ecology-1/);
  });
});
