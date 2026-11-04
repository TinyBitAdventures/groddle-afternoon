// Ticket 12 follow-up (mr granberry, 2026-11-04), after each tool started wearing on its own:
// 1. "I got the firefly flute, I got a jar (it was empty), I played the flute and caught enough
//    fireflies and the jar was filled. But now when I buy any empty jars, they are automatically full."
// 2. "I bought [a Fancy Pick], I used it up, I couldn't repair it, the message was not informative
//    enough (turns out my Energy Tank wasn't big enough to be able to fix it). Anyway, I dropped
//    the broken tool, and bought a new one. That one came pre-broken."
// And Austin (2026-11-04): "I had 2 tinker toolkits and tried to sell one of them; however the item
// I was selecting stayed in my inventory and the other one, in a random bag, was sold."
// In the source every item is its own itemstack: a jar's num_flies (firefly_jar.js 25-27, 239-262)
// and a tool's points_remaining (pick.js 32) are instance props, a new one starts new, and a verb
// acts on the itemstack it was used on (main.js doVerb names the stack; inc_stores.js storeSell).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  TOOL_CONDITION_CATALOG,
  bindToolInventory,
  canUseTool,
  createToolConditionState,
  fireflyJarBaseCost,
  getToolCondition,
  normalizeToolConditionState,
  quoteToolRepair,
  repairToolCondition,
  setToolRemaining,
  takeToolCopy,
  toolCopies,
  toolWornBaseCost,
  useToolCondition,
} from '../public/js/tools.js?v=092ac4f3';
import { ITEM_CATALOG, addItem, createInventory, ensureItem, isToolItem, removeItem } from '../public/js/inventory.js?v=d82f3b00';
import { createPlayerSave, restorePlayerSave } from '../public/js/player-save.js?v=ff8746ee';
import { layoutPack, unitPlaces } from '../public/js/pack-slots.js?v=c91d0ca3';
import { bagsFeature } from '../public/js/features/bags-feature.js?v=c640689a';
import { VENDOR_PROFILES, vendorBuy, vendorSell } from '../public/js/vendor.js?v=464d158d';
import { createResourceNode, harvestResourceNode, ensureResourceItems } from '../public/js/resource-nodes.js?v=384f63f3';
import {
  fireflyJarCounts,
  fireflyJarInUse,
  resourceNodesFeature,
  setFireflyJar,
} from '../public/js/features/resource-nodes-feature.js?v=cf300ffb';
import { toolBreakEvents } from '../public/js/quest-offers.js?v=1389077b';

const root = join(import.meta.dirname, '..');
const read = (rel) => readFileSync(join(root, 'public', rel), 'utf8');
const wear = (tools, cls) => toolCopies(tools, cls).map((c) => c.remaining);

function kit(items) {
  const inv = createInventory(items);
  const tools = bindToolInventory(createToolConditionState(), inv);
  return { inv, tools };
}

function packEngine(inv, tools) {
  const data = {};
  return {
    mode: 'solo', started: true, inv, toolState: tools, data,
    setData: (k, v) => { data[k] = v; }, param: () => null, pushActivity: () => {}, toast: () => {}, updateHud: () => {},
    query: (hook, ...args) => (typeof bagsFeature[hook] === 'function' ? bagsFeature[hook](...args) : null),
  };
}

describe('a tool that left is gone before a new one comes (the Fancy Pick that came pre-broken)', () => {
  it('drop a broken Fancy Pick, buy one: the new one is new, with nothing looking at it in between', () => {
    const { inv, tools } = kit({ fancy_pick: 1 });
    setToolRemaining(tools, 'fancy_pick', 0);
    assert.equal(getToolCondition(tools, 'fancy_pick').broken, true);
    removeItem(inv, 'fancy_pick', 1); // dropped (or sold, given, stored)
    addItem(inv, 'fancy_pick', 1); // bought
    assert.deepEqual(wear(tools, 'fancy_pick'), [200]);
    assert.equal(canUseTool(tools, 'fancy_pick', 1).ok, true);
  });

  it('a vendor purchase after the drop is new too', () => {
    const { inv, tools } = kit({ pick: 1 });
    setToolRemaining(tools, 'pick', 0);
    removeItem(inv, 'pick', 1);
    assert.equal(vendorBuy({ currants: 10_000 }, inv, VENDOR_PROFILES.hardware.offers, 'pick', 1).ok, true);
    assert.deepEqual(wear(tools, 'pick'), [100]);
  });

  it('a save taken after the drop: the gone tool is not saved, and an older save that kept it is repaired on load', () => {
    const { inv, tools } = kit({ fancy_pick: 1 });
    setToolRemaining(tools, 'fancy_pick', 0);
    removeItem(inv, 'fancy_pick', 1);
    // An older save (written before this fix): a copy kept for a pick no longer held.
    const old = createPlayerSave({ inventory: inv, player: { energy: 50 }, systems: { tools } });
    assert.deepEqual(old.systems.tools.condition.fancy_pick.copies, [0], 'the old save kept it');
    const inv2 = createInventory({});
    const tools2 = bindToolInventory(createToolConditionState(), inv2);
    restorePlayerSave(JSON.parse(JSON.stringify(old)), inv2, {}, { tools: tools2 });
    assert.deepEqual(tools2.condition.fancy_pick.copies, [], 'load lets the gone pick go');
    addItem(inv2, 'fancy_pick', 1);
    assert.deepEqual(wear(tools2, 'fancy_pick'), [200]);
  });

  it('game.js keeps the copies in step every frame and before a save', () => {
    const game = read('game.js');
    assert.match(game, /syncToolCopies\(toolState\);\n\s*updateCurrentAction/);
    assert.match(game, /syncAnimalWorldState\(\);\n\s*syncToolCopies\(toolState\);/);
  });

  it('a new tool that the pack puts ahead of an old one (a bag before the pack slot) is the new one', () => {
    // Pack full: the old broken Pick sits in a pack slot, the only room is in the Bigger Bag at slot 0,
    // so the new Pick goes in the bag, ahead of the old one in pack order.
    const items = { bag_bigger: 1, pick: 1 };
    const fillers = ['apple', 'cherry', 'grain', 'plank', 'meat', 'flour', 'bun', 'sammich', 'egg_plain', 'bean_plain', 'plain_bubble', 'all_spice', 'general_vapour', 'milk_butterfly'];
    for (const f of fillers) items[f] = 1;
    const { inv, tools } = kit(items);
    const engine = packEngine(inv, tools);
    bagsFeature.restore({ v: 1, migrated: true, prefs: { bags: [{ key: 'b1', cls: 'bag_bigger' }], place: { pack: ['@b1', ...fillers, 'pick'], b1: [] }, n: { pack: [0, ...fillers.map(() => 1), 1], b1: [] } } }, engine);
    let layout = bagsFeature.packLayout(engine);
    assert.equal(layout.pack.slots.length, 16, 'the pack is full');
    setToolRemaining(tools, 'pick', 0);
    addItem(inv, 'pick', 1);
    layout = bagsFeature.packLayout(engine);
    const places = unitPlaces(layout, 'pick');
    assert.equal(places.length, 2);
    assert.equal(places[0].container, layout.pack.slots.find((s) => s.kind === 'bag').key, 'the new one is in the bag, first in pack order');
    assert.deepEqual(wear(tools, 'pick'), [100, 0], 'the new Pick (in the bag) is new, the old one (in the pack) stays broken');
  });
});

describe('each Firefly Jar holds its own Fireflies', () => {
  ensureResourceItems();
  const engineWith = (items) => {
    const { inv, tools } = kit(items);
    return { inv, toolState: tools, pc: { energy: 500 }, learnedSkills: [], unlockedAchievements: ['firefly_whistling'] };
  };

  it('a jar is a contents class: a new jar is empty, it never wears or breaks', () => {
    const def = TOOL_CONDITION_CATALOG.firefly_jar;
    assert.equal(def.capacity, 7);
    assert.equal(def.contents, true);
    const { inv, tools } = kit({ firefly_jar: 1 });
    assert.deepEqual(wear(tools, 'firefly_jar'), [0]);
    assert.equal(getToolCondition(tools, 'firefly_jar').broken, false);
    assert.equal(canUseTool(tools, 'firefly_jar', 1).ok, true);
    assert.equal(useToolCondition(tools, 'firefly_jar', 3).wear, 0);
    assert.deepEqual(wear(tools, 'firefly_jar'), [0]);
    assert.equal(quoteToolRepair(tools, 'firefly_jar', ['tinkering_5']).ok, false);
    assert.deepEqual(toolBreakEvents({ firefly_jar: 0 }, tools).events, [], 'an empty jar is not a break');
    addItem(inv, 'firefly_jar', 1);
    assert.deepEqual(wear(tools, 'firefly_jar'), [0, 0]);
  });

  it('whistling fills one jar; a jar bought afterwards is empty', () => {
    const engine = engineWith({ firefly_jar: 1 });
    const fly = createResourceNode('npc_firefly', { now: 0 });
    const nearby = Array.from({ length: 8 }, () => createResourceNode('npc_firefly', { now: 0 }));
    const jar = fireflyJarInUse(engine);
    const result = harvestResourceNode(fly, engine.inv, engine.pc, { verbId: 'open', jar: { flies: jar.flies, copy: jar.copy }, nearby, achievements: ['firefly_whistling'], now: 1000, rng: () => 0.5 });
    assert.equal(result.ok, true, result.message);
    setFireflyJar(engine, result.jar.copy, result.jar.flies);
    assert.deepEqual(fireflyJarCounts(engine), [7], 'the jar is full');
    addItem(engine.inv, 'firefly_jar', 1);
    assert.deepEqual(fireflyJarCounts(engine), [7, 0], 'the new jar is empty');
    assert.deepEqual(fireflyJarInUse(engine), { copy: 1, flies: 0 }, 'the next whistle fills the empty one');
    // The full one left at home (stored, dropped, given): the next one bought is still empty.
    takeToolCopy(engine.toolState, 'firefly_jar', { copy: 0 });
    removeItem(engine.inv, 'firefly_jar', 1);
    addItem(engine.inv, 'firefly_jar', 1);
    assert.deepEqual(fireflyJarCounts(engine), [0, 0]);
  });

  it('a jar takes its Fireflies with it and brings them back (the hand-over value is the jar\'s own)', () => {
    const { tools } = kit({ firefly_jar: 2 });
    setToolRemaining(tools, 'firefly_jar', 5, { copy: 1 });
    assert.equal(takeToolCopy(tools, 'firefly_jar', { copy: 1, take: false }), 5);
  });

  it('sells for what it holds (firefly_jar.js getBaseCost 306-335)', () => {
    assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 7].map(fireflyJarBaseCost), [100, 110, 120, 130, 150, 175, 225, 300]);
    const { tools } = kit({ firefly_jar: 2 });
    setToolRemaining(tools, 'firefly_jar', 7, { copy: 0 });
    assert.equal(toolWornBaseCost(tools, 'firefly_jar', { copy: 0 }), 300);
    assert.equal(toolWornBaseCost(tools, 'firefly_jar', { copy: 1 }), 100);
  });

  it('an older save\'s one count for every jar becomes the first jar\'s; the other jars are empty', () => {
    const engine = engineWith({ firefly_jar: 2 });
    resourceNodesFeature.restore({ jar: { flies: 7 }, starterKit: true }, engine);
    assert.deepEqual(fireflyJarCounts(engine), [7, 0]);
    assert.deepEqual(resourceNodesFeature.save(), { jarCopies: true, starterKit: true });
    // A new save is not migrated again.
    setFireflyJar(engine, 0, 2);
    resourceNodesFeature.restore(resourceNodesFeature.save(), engine);
    assert.deepEqual(fireflyJarCounts(engine), [2, 0]);
  });

  it('the jar rides the tools\' save and the old per-class save shape keeps working', () => {
    const { inv, tools } = kit({ firefly_jar: 2 });
    setToolRemaining(tools, 'firefly_jar', 4, { copy: 1 });
    const back = bindToolInventory(normalizeToolConditionState(JSON.parse(JSON.stringify(tools))), inv);
    assert.deepEqual(wear(back, 'firefly_jar'), [0, 4]);
  });

  it('a pumpkin lights from a jar of seven and empties that jar only (pumpkin_carved_1.js 174-201)', () => {
    const seasons = read('js/features/seasons-feature.js');
    assert.match(seasons, /return Math\.max\(0, \.\.\.fireflyJarCounts\(engine\)\);/);
    assert.match(seasons, /const at = fireflyJarCounts\(engine\)\.findIndex\(\(n\) => n >= 7\);\n\s*if \(at >= 0\) setFireflyJar\(engine, at, 0\);/);
  });
});

