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
  repairEnergyRefusal,
  repairTip,
  repairToolCondition,
  setToolRemaining,
  takeToolCopy,
  tinkertoolRefusal,
  toolCopies,
  toolWornBaseCost,
  useToolCondition,
} from '../public/js/tools.js?v=ca00d182';
import { ITEM_CATALOG, addItem, createInventory, ensureItem, isToolItem, removeItem } from '../public/js/inventory.js?v=d82f3b00';
import { createPlayerSave, restorePlayerSave } from '../public/js/player-save.js?v=a681e2fd';
import { layoutPack, unitPlaces } from '../public/js/pack-slots.js?v=c91d0ca3';
import { bagsFeature } from '../public/js/features/bags-feature.js?v=5cbc3c97';
import { VENDOR_PROFILES, vendorBuy, vendorSell } from '../public/js/vendor.js?v=87fb770c';
import { createResourceNode, harvestResourceNode, ensureResourceItems } from '../public/js/resource-nodes.js?v=58813e6e';
import {
  fireflyJarCounts,
  fireflyJarInUse,
  resourceNodesFeature,
  setFireflyJar,
} from '../public/js/features/resource-nodes-feature.js?v=14a61e37';
import { toolBreakEvents } from '../public/js/quest-offers.js?v=ef0912c2';

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

describe('a verb on the item you chose acts on that one (two Tinkertools, one in a bag)', () => {
  function twoTinkertools() {
    const { inv, tools } = kit({ bag_bigger: 1, tinkertool: 2 });
    const engine = packEngine(inv, tools);
    bagsFeature.restore({ v: 1, migrated: true, prefs: { bags: [{ key: 'b1', cls: 'bag_bigger' }], place: { pack: ['@b1', 'tinkertool'], b1: ['tinkertool'] }, n: { pack: [0, 1], b1: [1] } } }, engine);
    const layout = bagsFeature.packLayout(engine);
    // Pack order (bag.js findFirst): the bag's Tinkertool first, the pack slot's second.
    assert.deepEqual(unitPlaces(layout, 'tinkertool'), [{ container: 'b1', index: 0 }, { container: 'pack', index: 1 }]);
    setToolRemaining(tools, 'tinkertool', 40, { copy: 0 }); // the bag's: worn
    setToolRemaining(tools, 'tinkertool', 190, { copy: 1 }); // the pack's: nearly new
    return { inv, tools, engine };
  }
  const worth = (tools) => (cls) => toolWornBaseCost(tools, cls, {});

  it('selling the one picked in the pack sells it; the one in the bag stays, with its own wear', () => {
    const { inv, tools, engine } = twoTinkertools();
    const copy = 1; // the pack slot's
    const price = toolWornBaseCost(tools, 'tinkertool', { copy });
    const r = vendorSell({ currants: 0 }, inv, [], 'tinkertool', 1, {
      toolBaseCost: () => price,
      beforeRemove: () => {
        engine.query('packTakeUnit', 'tinkertool', copy, 1, engine);
        takeToolCopy(tools, 'tinkertool', { copy });
      },
    });
    assert.equal(r.ok, true, r.msgs?.join(' '));
    const layout = bagsFeature.packLayout(engine);
    assert.deepEqual(unitPlaces(layout, 'tinkertool'), [{ container: 'b1', index: 0 }], 'the bag keeps its Tinkertool');
    assert.ok(!layout.pack.slots.some((s) => s.cls === 'tinkertool'), 'the pack slot picked is the one that emptied');
    assert.deepEqual(wear(tools, 'tinkertool'), [40], 'and the one left is the worn one from the bag');
  });

  it('with no stack chosen, the slot that empties is the tool whose wear left (the last one)', () => {
    const { inv, tools, engine } = twoTinkertools();
    removeItem(inv, 'tinkertool', 1);
    const layout = bagsFeature.packLayout(engine);
    assert.deepEqual(unitPlaces(layout, 'tinkertool'), [{ container: 'b1', index: 0 }]);
    assert.deepEqual(wear(tools, 'tinkertool'), [40]);
  });

  it('pack-slots gives a copies class\'s last unit first, any other class its first', () => {
    const inv = { bag_bigger: 1, tinkertool: 2, apple: 2 };
    const prefs = { bags: [{ key: 'b1', cls: 'bag_bigger' }], place: { pack: ['@b1', 'tinkertool', 'apple'], b1: ['tinkertool', 'apple'] }, n: { pack: [0, 1, 1], b1: [1, 1] } };
    const opts = { catalog: ITEM_CATALOG, isTool: isToolItem, lastFirst: (c) => Boolean(TOOL_CONDITION_CATALOG[c]) };
    const after = layoutPack({ ...inv, tinkertool: 1, apple: 1 }, prefs, opts);
    assert.equal(after.bags.b1.slots.some((s) => s.cls === 'tinkertool'), true, 'the bag\'s Tinkertool (first) stays');
    assert.equal(after.pack.slots.some((s) => s.cls === 'apple'), true, 'an apple still comes off the first stack (the bag\'s)');
  });

  it('game.js sells, donates and drops the chosen one (pack menu, drag, vendor list, shrine)', () => {
    const game = read('game.js');
    assert.match(game, /function takeChosenStack\(classTsid, n, \{ copy = null, place = null, wait \} = \{\}\)/);
    assert.match(game, /beforeRemove: \(\) => \{\n\s*takeChosenStack\(classTsid, 1, \{ copy \}\);\n\s*takeToolCopy\(toolState, classTsid, \{ copy \}\);/);
    assert.match(game, /takeChosenStack\(shrineSelected, 1, \{ copy: toolCopy \}\);/);
    assert.match(game, /stageVendorSell\(classTsid, copy, place\);/);
    assert.match(game, /vendorDragPlace = inLayout \? \{ cls: s\.classTsid, container: s\.container, index: s\.index \} : null;/);
    assert.match(game, /if \(dropCopy != null\) takeToolCopy\(toolState, classTsid, \{ copy: dropCopy \}\);/);
    // Online drops and gives carry the chosen tool's own wear and take that one when the server answers.
    const drops = read('js/features/drops-mp-feature.js');
    assert.match(drops, /takeToolCopy\(engine\.toolState, c, \{ copy: chosen, take: false \}\)/);
    const gifts = read('js/features/gifts-feature.js');
    assert.match(gifts, /unitRankAt\(layout, p\.c, give\.from\.container, give\.from\.index\)/);
    const storage = read('js/features/home-storage-feature.js');
    assert.match(storage, /engine\.query\?\.\('packTakeUnit', cls, copy, 1, engine\)/);
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

describe('a repair refused for energy says why, with the numbers', () => {
  const fancy = () => {
    const { inv, tools } = kit({ fancy_pick: 1, tinkertool: 1 });
    setToolRemaining(tools, 'fancy_pick', 0);
    return { inv, tools, quote: quoteToolRepair(tools, 'fancy_pick', ['tinkering_1']) };
  };

  it('too little energy now: the source\'s words, then what it needs and what you have', () => {
    const { quote } = fancy();
    assert.equal(quote.ok, true);
    // fancy_pick.js base_cost 1000 / points_capacity 200, Tinkering I 50% x 3 a tick: 8 every two ticks.
    assert.equal(quote.energyPerTwoTicks, 8);
    assert.equal(repairEnergyRefusal(quote, { energy: 5, energyMax: 100 }),
      "You don't have enough energy to repair this. A repair needs more than 9 energy, and you have 5.");
  });

  it('an energy tank too small for any repair says so', () => {
    const { quote } = fancy();
    assert.equal(repairEnergyRefusal({ ...quote, energyPerTwoTicks: 150 }, { energy: 120, energyMax: 120 }),
      "You don't have enough energy to repair this. A repair needs more than 151 energy, and your energy tank holds only 120.");
  });

  it('a full repair bigger than the tank: the Repair row says it takes more than one', () => {
    const { quote } = fancy();
    assert.equal(quote.energy, 272);
    const tip = repairTip(quote, { ok: true, full: false, points: 30 }, { energy: 100, energyMax: 100 });
    assert.equal(tip, 'Your energy repairs it to 15% (the full repair takes 272 energy and 67 seconds, more than your energy tank holds (100), so it takes more than one repair)');
    assert.doesNotMatch(tip, /—/);
  });

  it('repairToolCondition and the pack use the same words; a worn Tinkertool says how worn', () => {
    const { tools } = fancy();
    const r = repairToolCondition(tools, 'fancy_pick', { energy: 5, energyMax: 100 }, { learned: ['tinkering_1'], hasTinkertool: true });
    assert.equal(r.ok, false);
    assert.match(r.msg, /needs more than 9 energy, and you have 5\.$/);
    setToolRemaining(tools, 'tinkertool', 3);
    assert.equal(tinkertoolRefusal(canUseTool(tools, 'tinkertool', 10), 10), 'Your Tinkertool is too worn for this repair: it has 3 left and this repair takes 10.');
    setToolRemaining(tools, 'tinkertool', 0);
    assert.equal(tinkertoolRefusal(canUseTool(tools, 'tinkertool', 10), 10), 'This Tinkertool has become broken, and must be repaired.');
    const game = read('game.js');
    assert.match(game, /\? repairEnergyRefusal\(repairQuote, pc\)/);
    assert.match(game, /toast\(repairEnergyRefusal\(quote, pc\), 4200\);/);
  });
});
