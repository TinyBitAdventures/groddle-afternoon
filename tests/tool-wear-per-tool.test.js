// Ticket 12 (live v0.7.0): "I did some mining, my pick wore out. I bought another. The 'new' one was
// just as worn. Also if I start with 2 or more picks, and mine, they all wear out at the same time
// (they do not get repaired at the same time though)."
// The source keeps wear on each tool stack: tool_base points_remaining is an instance prop
// (pick.js 32, isWorking 405-430), a new stack starts at points_capacity, use() lowers the stack in
// use, which is the first working one in pack order (players/inc_items.js items_find_working_tool
// 729-732, items/include/mining.js 203-204, bag.js findFirst 672-694), and a repair is a verb on one
// stack (pick.js repair 120-240). The remake kept one value per class; now each tool held has its own.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  bindToolInventory,
  canUseTool,
  createToolConditionState,
  getToolCondition,
  leavingToolWear,
  normalizeToolConditionState,
  quoteToolRepair,
  receiveToolCopy,
  repairToolCondition,
  setToolRemaining,
  toolCopies,
  useToolCondition,
} from '../public/js/tools.js?v=5f482998';
import { addItem, createInventory, removeItem } from '../public/js/inventory.js?v=5be47371';
import { createMineRock, mineRock, MINING_COSTS } from '../public/js/mining.js?v=12a6f1bd';
import { VENDOR_PROFILES, vendorBuy } from '../public/js/vendor.js?v=592caaf1';
import { harvestWoodTree } from '../public/js/woodcutting.js?v=5235a01a';
import { createGarden, plantPlot, waterPlot } from '../public/js/garden.js?v=489cda8f';
import { createPlayerSave, normalizePlayerSave } from '../public/js/player-save.js?v=00f88199';
import { createDroppedItemState, dropInventoryStack, pickupDroppedStack } from '../public/js/world-items.js?v=c308d8f4';
import { layoutPack, unitPlaces, unitRankAt } from '../public/js/pack-slots.js?v=6b8393a1';
import { toolBreakEvents } from '../public/js/quest-offers.js?v=9c53455c';
import { performAnimalKinship } from '../public/js/animal-kinship.js?v=f91347e9';
import { createAnimalState } from '../public/js/animals.js?v=d21a2fd4';

const remaining = (tools, cls) => toolCopies(tools, cls).map((c) => c.remaining);

/** A pack and its tools, bound as game.js binds them. */
function kit(items) {
  const inv = createInventory(items);
  const tools = bindToolInventory(createToolConditionState(), inv);
  return { inv, tools };
}

function mine(inv, tools, n) {
  const pc = { energy: 10_000, imagination: 0, xp: 0 };
  const rock = createMineRock('rock_beryl_1', { chunksRemaining: 1000 });
  const out = [];
  for (let i = 0; i < n; i += 1) out.push(mineRock(rock, inv, pc, { learned: ['mining_1'], toolState: tools, rng: () => 0.5, now: i * 60_000 }));
  return out;
}

describe('ticket 12: each tool wears on its own', () => {
  it('mining with two picks wears only the first working one, then the next', () => {
    const { inv, tools } = kit({ pick: 2 });
    const swings = Math.ceil(100 / MINING_COSTS.toolWear);
    const done = mine(inv, tools, swings);
    assert.ok(done.every((r) => r.ok), 'every swing lands');
    assert.deepEqual(remaining(tools, 'pick'), [0, 100], 'the first pick is worn out, the second untouched');
    assert.equal(done.at(-1).toolUse.broke, true);
    // The next swing takes the second pick (findFirst isWorking), so mining goes on.
    const next = mine(inv, tools, 1)[0];
    assert.equal(next.ok, true);
    assert.deepEqual(remaining(tools, 'pick'), [0, 100 - MINING_COSTS.toolWear]);
  });

  it('a pick bought after one wore out is new', () => {
    const { inv, tools } = kit({ pick: 1 });
    mine(inv, tools, Math.ceil(100 / MINING_COSTS.toolWear));
    assert.equal(getToolCondition(tools, 'pick').broken, true);
    const pc = { currants: 10_000 };
    const bought = vendorBuy(pc, inv, VENDOR_PROFILES.hardware.offers, 'pick', 1);
    assert.equal(bought.ok, true, bought.msgs?.join(' '));
    assert.deepEqual(remaining(tools, 'pick'), [0, 100], 'the new pick is full, the old one stays broken');
    assert.equal(getToolCondition(tools, 'pick').remaining, 100, 'the working one is the one in use');
    assert.equal(mine(inv, tools, 1)[0].ok, true);
  });

  it('a repair mends one tool, and the one chosen', () => {
    const { inv, tools } = kit({ pick: 2, tinkertool: 1 });
    setToolRemaining(tools, 'pick', 20, { copy: 0 });
    setToolRemaining(tools, 'pick', 50, { copy: 1 });
    const pc = { energy: 1000 };
    const quote = quoteToolRepair(tools, 'pick', ['tinkering_1'], { copy: 1 });
    assert.equal(quote.condition.copy, 1);
    assert.equal(quote.missing, 50);
    const done = repairToolCondition(tools, 'pick', pc, { copy: 1, learned: ['tinkering_1'], hasTinkertool: true });
    assert.equal(done.ok, true, done.msg);
    assert.deepEqual(remaining(tools, 'pick'), [20, 100]);
    // With no choice it takes the first that needs one.
    assert.equal(repairToolCondition(tools, 'pick', pc, { learned: ['tinkering_1'], hasTinkertool: true }).ok, true);
    assert.deepEqual(remaining(tools, 'pick'), [100, 100]);
    assert.equal(inv.pick, 2);
  });

  it('a Tinkertool repairing a Tinkertool wears the spare, not the one mended', () => {
    const { tools } = kit({ tinkertool: 2 });
    setToolRemaining(tools, 'tinkertool', 10, { copy: 0 });
    const pc = { energy: 1000 };
    const done = repairToolCondition(tools, 'tinkertool', pc, { copy: 0, learned: ['tinkering_3'], hasTinkertool: true, hasSpareTinkertool: true });
    assert.equal(done.ok, true, done.msg);
    const [mended, spare] = remaining(tools, 'tinkertool');
    assert.equal(mended, 200);
    assert.equal(spare, 200 - done.quote.tinkertoolWear);
  });

  it('every wearing tool: a Hatchet, a Watering Can and a Butterfly Lotion tube each wear alone', () => {
    const { inv, tools } = kit({ hatchet: 2, watering_can: 2, seed_spinach: 2, butterfly_lotion: 2 });
    const chop = harvestWoodTree({ maturity: 6 }, inv, { energy: 500 }, tools);
    assert.equal(chop.ok, true, chop.msg);
    assert.deepEqual(remaining(tools, 'hatchet'), [100 - chop.toolUse.wear, 100]);

    const pc = { energy: 500 };
    const garden = createGarden({ cols: 2, rows: 1, now: 0 });
    assert.equal(plantPlot(garden, '1-1', inv, pc, 'seed_spinach', { now: 0 }).ok, true);
    const water = waterPlot(garden, '1-1', pc, { inv, toolState: tools, now: 1 });
    assert.equal(water.ok, true);
    assert.deepEqual(remaining(tools, 'watering_can'), [100 - water.toolUse.wear, 100]);

    // Butterfly Lotion (capacity 5, not repairable): a used-up tube leaves the pack, the other keeps its five.
    setToolRemaining(tools, 'butterfly_lotion', 1, { copy: 0 });
    const out = performAnimalKinship(createAnimalState('npc_butterfly'), 'npc_butterfly', 'massage', {
      pc: { energy: 100, mood: 40, xp: 0 }, inv, tools, learned: ['animalkinship_4'], rng: () => 0.5,
    });
    assert.equal(out.ok, true);
    assert.equal(out.toolUse.broke, true);
    assert.equal(inv.butterfly_lotion, 1, 'the empty tube is gone');
    assert.deepEqual(remaining(tools, 'butterfly_lotion'), [5], 'the other tube keeps its five');
  });

  it('a broken tool is skipped for the next working one, and refuses when none is left', () => {
    const { tools } = kit({ pick: 2 });
    setToolRemaining(tools, 'pick', 0, { copy: 0 });
    assert.equal(canUseTool(tools, 'pick', 1).ok, true);
    const used = useToolCondition(tools, 'pick', 1);
    assert.equal(used.copy, 1);
    setToolRemaining(tools, 'pick', 0, { copy: 1 });
    const none = canUseTool(tools, 'pick', 1);
    assert.equal(none.ok, false);
    assert.equal(none.reason, 'broken_tool');
  });

  it('breaks count once per tool that broke (tool_base onBreak)', () => {
    const { tools } = kit({ pick: 2 });
    const first = toolBreakEvents(null, tools);
    setToolRemaining(tools, 'pick', 0, { copy: 0 });
    const one = toolBreakEvents(first.broken, tools);
    assert.deepEqual(one.events, ['tool_broke:pick']);
    setToolRemaining(tools, 'pick', 0, { copy: 1 });
    assert.deepEqual(toolBreakEvents(one.broken, tools).events, ['tool_broke:pick']);
  });
});

describe('ticket 12: the pack and the hand-overs keep each tool\'s own wear', () => {
  it('each tool slot is its own tool, in the source\'s findFirst order (bags where they sit)', () => {
    const inv = createInventory({ pick: 2, bag_toolbox_red: 1 });
    const prefs = { bags: [{ key: 'b1', cls: 'bag_toolbox_red' }], place: { pack: ['@b1', 'pick'], b1: ['pick'] } };
    const layout = layoutPack(inv, prefs, { isTool: () => true });
    assert.deepEqual(unitPlaces(layout, 'pick'), [{ container: 'b1', index: 0 }, { container: 'pack', index: 1 }]);
    assert.equal(unitRankAt(layout, 'pick', 'pack', 1), 1);
    assert.equal(unitRankAt(layout, 'pick', 'b1', 0), 0);
  });

  it('the pack row draws each tool slot with its own wear', () => {
    const game = readFileSync(new URL('../public/game.js', import.meta.url), 'utf8');
    assert.match(game, /const trackedCondition = getToolCondition\(toolState, s\.classTsid, s\.copy != null \? \{ copy: s\.copy \} : \{\}\);/);
    assert.match(game, /const rank = unitRankAt\(layout, slot\.cls, container, index\);\n\s+if \(rank >= 0\) entry\.copy = rank;/);
    assert.match(game, /bindToolInventory\(toolState, inv\);/);
    assert.match(game, /beginToolRepair\(classTsid, getToolCondition\(toolState, classTsid, packSelectedCopy != null/);
  });

  it('a tool set down and picked up again is the same worn tool (solo ground stacks)', () => {
    const { inv, tools } = kit({ pick: 2 });
    setToolRemaining(tools, 'pick', 30, { copy: 1 });
    const ground = createDroppedItemState();
    const points = remaining(tools, 'pick').slice(-1);
    const dropped = dropInventoryStack(ground, inv, 'LTEST', 'pick', 1, { x: 10, y: 0 }, { points });
    assert.equal(dropped.ok, true);
    assert.deepEqual(remaining(tools, 'pick'), [100]);
    const back = pickupDroppedStack(ground, inv, 'LTEST', dropped.stack.id);
    assert.deepEqual(back.points, [30]);
    setToolRemaining(tools, 'pick', back.points[0], { copy: toolCopies(tools, 'pick').length - 1 });
    assert.deepEqual(remaining(tools, 'pick'), [100, 30]);
  });

  it('a given, traded or auctioned tool carries its own wear and the ones you hold keep theirs', () => {
    const giver = kit({ hatchet: 2 });
    setToolRemaining(giver.tools, 'hatchet', 40, { copy: 1 });
    const r = leavingToolWear(giver.tools, 'hatchet', 1);
    assert.equal(r, 40, 'the one that leaves is the last');
    removeItem(giver.inv, 'hatchet', 1);
    assert.deepEqual(remaining(giver.tools, 'hatchet'), [100]);
    const taker = kit({ hatchet: 1 });
    setToolRemaining(taker.tools, 'hatchet', 90);
    addItem(taker.inv, 'hatchet', 1);
    receiveToolCopy(taker.tools, 'hatchet', r, 1);
    assert.deepEqual(remaining(taker.tools, 'hatchet'), [90, 40]);
  });

  it('trade-feature returns held tools with their wear, gifts and drops apply the sender\'s to the new ones only', () => {
    const read = (p) => readFileSync(new URL(`../public/js/features/${p}`, import.meta.url), 'utf8');
    const trade = read('trade-feature.js');
    assert.match(trade, /const out = toolPointsOut\(c, more\);/);
    assert.match(trade, /toolPointsIn\(c, \(hold\.points\?\.\[c\] \|\| \[\]\)\.slice\(0, n\)\);/);
    for (const f of ['gifts-feature.js', 'drops-mp-feature.js', 'auctions-feature.js', 'trade-feature.js']) {
      const src = read(f);
      assert.doesNotMatch(src, /Math\.min\(mine/, `${f}: no "keep the more worn" over the whole class`);
      assert.match(src, /receiveToolCopy\(engine\.toolState/, f);
    }
  });
});

describe('ticket 12: saves from before', () => {
  it('the old shared value stays with the first tool, the one in use; any other held starts full', () => {
    const inv = createInventory({ pick: 3, hoe: 1 });
    const loaded = normalizeToolConditionState({ condition: { pick: { remaining: 30, broken: false, uses: 70, repairs: 1 }, hoe: { remaining: 0, broken: true } } });
    const tools = bindToolInventory(loaded, inv);
    assert.deepEqual(remaining(tools, 'pick'), [30, 100, 100]);
    assert.deepEqual(remaining(tools, 'hoe'), [0]);
    assert.equal(tools.condition.pick.uses, 70);
    // And it saves as copies from then on, which load back the same.
    const again = bindToolInventory(normalizeToolConditionState(JSON.parse(JSON.stringify(tools))), inv);
    assert.deepEqual(remaining(again, 'pick'), [30, 100, 100]);
    assert.equal(Object.keys(JSON.parse(JSON.stringify(tools))).includes('inv'), false, 'the pack is not saved twice');
  });

  it('round-trips each tool\'s wear through the player save', () => {
    const { inv, tools } = kit({ pick: 2 });
    setToolRemaining(tools, 'pick', 12, { copy: 1 });
    const saved = createPlayerSave({ inventory: inv, player: { energy: 1 }, systems: { tools } });
    const back = normalizePlayerSave(saved);
    const reloaded = bindToolInventory(back.systems.tools, back.inventory);
    assert.deepEqual(remaining(reloaded, 'pick'), [100, 12]);
  });
});
