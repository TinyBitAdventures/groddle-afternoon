// Austin (2026-11-04): some items kept their state once per item TYPE (or one value for all), so a
// new copy inherited it. In the source each is an instance prop of the itemstack, so a new one starts
// new, two of a kind keep their own, and a verb acts on the stack it was used on:
// - potions (tool_base points_remaining, potion_*.js 36) and a Draught's Giant (potion_favor.js 585-589)
// - powders (powder_base charges, <powder>.js 33), Juju Shoo-Shoo Powder too
// - Tree Poison and its Antidote, the garden potions (points_remaining 5)
// - the Butterfly Net (butterfly_net.js 32) and the Dusty Stick (dusty_stick.js 32, onRejuvination 336-343)
// - an Emotional Bear's upgrades (emotional_bear.js 620-641), a Cubimal's name (user_name),
//   a Still's hopper and Hooch (still.js 30-31), a lit pumpkin's phrases (pumpkin_lit_*.js 380-391)
// js/tools.js keeps them per copy (charges classes, contents bits, row.tags), as it does a tool's wear.
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  TOOL_CONDITION_CATALOG,
  bindToolInventory,
  chargesLeft,
  copyMeterNote,
  copyTag,
  copyTags,
  createToolConditionState,
  getToolCondition,
  isWearTool,
  migrateClassValue,
  moveToolCopy,
  normalizeToolConditionState,
  pickToolCopies,
  placeToolCopies,
  receiveToolCopy,
  setCopyTag,
  setToolRemaining,
  takeToolCopy,
  toolCopies,
  useCharge,
} from '../public/js/tools.js?v=eff5ef6f';
import { addItem, countItem, createInventory, removeItem } from '../public/js/inventory.js?v=60dfc9ca';
import { copyFromLedger, spendCopyCharge } from '../public/js/copy-charges.js?v=f01dfda2';
import { createDroppedItemState, dropInventoryStack, pickupDroppedStack } from '../public/js/world-items.js?v=da2bb7a1';
import { useBottle, bottleUsesLeft } from '../public/js/tree-poison.js?v=3e868dfd';
import { usePotion as useGardenPotion, potionUsesLeft as gardenUsesLeft } from '../public/js/master-garden.js?v=caa7ac2e';
import { potionsFeature, usePotionNow } from '../public/js/features/potions-feature.js?v=2e5f751c';
import { powdersFeature } from '../public/js/features/powders-feature.js?v=8e412359';
import { treeDeathFeature } from '../public/js/features/tree-death-feature.js?v=901fac3f';
import { masterGardenFeature } from '../public/js/features/master-garden-feature.js?v=cb898d8a';
import { itemVerbsMoreFeature } from '../public/js/features/item-verbs-more-feature.js?v=ee4ab509';
import { supplyFeature } from '../public/js/features/supply-feature.js?v=09fffeb0';
import { cubimalRaceFeature } from '../public/js/features/cubimal-race-feature.js?v=c0eba9a1';
import { seasonsFeature } from '../public/js/features/seasons-feature.js?v=06426bed';

const root = join(import.meta.dirname, '..');

/** A pack with its tool state bound, as game.js has (js/tools.js bindToolInventory). */
function pack(items = {}) {
  const inv = createInventory({});
  const toolState = bindToolInventory(createToolConditionState(), inv);
  for (const [cls, n] of Object.entries(items)) addItem(inv, cls, n);
  return { inv, toolState };
}

/** The fields the features read, on a bound pack. */
function engineWith(items = {}, over = {}) {
  const { inv, toolState } = pack(items);
  const buffs = new Map();
  const said = [];
  const engine = {
    inv,
    toolState,
    pc: { energy: 500, mood: 50, energyMax: 1000, moodMax: 100, xp: 0, imagination: 0, imaginationUpgrades: [] },
    player: { x: 500, y: 400, scale: { x: 1 }, baseScale: 0.5 },
    interactables: [],
    streetTsid: 'GTEST',
    street: { bounds: { l: 0, t: 0 }, signposts: [] },
    quoinState: { dailyLimit: 100, collectedToday: 0 },
    shrineState: { favor: {}, emblems: {} },
    learnedSkills: [],
    unlockedAchievements: [],
    hasBuff: (id) => buffs.has(id),
    buffRow: (id) => buffs.get(id) || null,
    applyBuff: (id) => (buffs.set(id, { classTsid: id }), { ok: true }),
    removeBuff: (id) => buffs.delete(id),
    achievement: () => {},
    grantAchievement: () => {},
    playSound: () => {},
    pushActivity: (t) => said.push(t),
    toast: (t) => said.push(t),
    refreshPack: () => {},
    updateHud: () => {},
    save: () => {},
    setData: () => {},
    param: () => null,
    floatText: () => {},
    query: () => null,
    metabolicGate: () => ({ ok: true }),
    homeContext: () => ({ inHome: false }),
    transientInstance: () => false,
    inScene: () => false,
    dropWorldStack: () => {},
    unregister: () => {},
    streetSlot: () => ({}),
    streetWorld: () => ({ trees: [] }),
    ...over,
  };
  return { engine, said };
}

const remaining = (state, cls) => toolCopies(state, cls).map((c) => c.remaining);

describe('js/tools.js: uses, charges, bits and words per copy', () => {
  it('a new potion or powder is full, an emptied one leaves, and the others keep theirs', () => {
    const { inv, toolState } = pack({ potion_xp: 2 });
    assert.deepEqual(remaining(toolState, 'potion_xp'), [5, 5]);
    for (let i = 0; i < 4; i += 1) useCharge(toolState, 'potion_xp', 1);
    assert.deepEqual(remaining(toolState, 'potion_xp'), [5, 1]);
    const last = useCharge(toolState, 'potion_xp', 1);
    assert.deepEqual(last, { ok: true, copy: 1, left: 0, emptied: true });
    removeItem(inv, 'potion_xp', 1);
    assert.deepEqual(remaining(toolState, 'potion_xp'), [5], 'the full one stays');
    addItem(inv, 'potion_xp', 1);
    assert.deepEqual(remaining(toolState, 'potion_xp'), [5, 5], 'one bought after is new');
    // A bottle held always has a use: none arrives empty.
    receiveToolCopy(toolState, 'potion_xp', 0, 1);
    assert.equal(chargesLeft(toolState, 'potion_xp', 1), 1);
    assert.equal(getToolCondition(toolState, 'potion_xp').broken, false);
    assert.equal(copyMeterNote('potion_xp', getToolCondition(toolState, 'potion_xp')), 'Uses 5/5');
    assert.equal(copyMeterNote('fertilidust', getToolCondition(pack({ fertilidust: 1 }).toolState, 'fertilidust')), 'Charges 5/5');
  });

  it('every class it keeps comes from its own GSJS file, and only wearing tools count as tools', () => {
    const src = (cls) => readFileSync(join(root, '../glitch-GameServerJS/items', `${cls}.js`), 'utf8');
    for (const [cls, def] of Object.entries(TOOL_CONDITION_CATALOG)) {
      if (!def.charges) continue;
      let text;
      try { text = src(cls); } catch { continue; }
      const cap = text.match(/"(?:points_capacity|maxCharges)"\s*:\s*"(\d+)"/);
      if (cls.startsWith('potion_garden_') || cls === 'potion_trantsformation_fluid') continue; // the remake's uses, see tools.js
      assert.equal(def.capacity, Number(cap[1]), cls);
    }
    assert.equal(isWearTool('pick'), true);
    assert.equal(isWearTool('butterfly_net'), true);
    for (const cls of ['fertilidust', 'potion_favor', 'emotional_bear', 'npc_cubimal_chick', 'still', 'firefly_jar']) assert.equal(isWearTool(cls), false, cls);
    assert.equal(TOOL_CONDITION_CATALOG.butterfly_net.capacity, 100);
    assert.equal(TOOL_CONDITION_CATALOG.butterfly_net.baseCost, 150);
    assert.equal(TOOL_CONDITION_CATALOG.dusty_stick.capacity, 20);
  });

  it("a copy's words move with it in the pack, its bags and a save, and one that arrives has none", () => {
    const { inv, toolState } = pack({ npc_cubimal_chick: 3 });
    setCopyTag(toolState, 'npc_cubimal_chick', 0, 'Ada');
    setCopyTag(toolState, 'npc_cubimal_chick', 2, 'Cy');
    moveToolCopy(toolState, 'npc_cubimal_chick', 2, 0);
    assert.deepEqual(copyTags(toolState, 'npc_cubimal_chick'), ['Cy', 'Ada', null]);
    // Into a bag that leaves the pack, and back.
    const out = pickToolCopies(toolState, 'npc_cubimal_chick', [0]);
    assert.deepEqual(out.tags, ['Cy']);
    removeItem(inv, 'npc_cubimal_chick', 1);
    assert.deepEqual(copyTags(toolState, 'npc_cubimal_chick'), ['Ada', null]);
    addItem(inv, 'npc_cubimal_chick', 1);
    placeToolCopies(toolState, 'npc_cubimal_chick', [1], [null], out.tags);
    assert.deepEqual(copyTags(toolState, 'npc_cubimal_chick'), ['Ada', 'Cy', null]);
    // The one leaving is the one picked (takeToolCopy), its words with it.
    takeToolCopy(toolState, 'npc_cubimal_chick', { copy: 0 });
    removeItem(inv, 'npc_cubimal_chick', 1);
    assert.deepEqual(copyTags(toolState, 'npc_cubimal_chick'), ['Cy', null]);
    const back = bindToolInventory(normalizeToolConditionState(JSON.parse(JSON.stringify(toolState))), inv);
    assert.deepEqual(copyTags(back, 'npc_cubimal_chick'), ['Cy', null]);
    addItem(inv, 'npc_cubimal_chick', 1);
    receiveToolCopy(back, 'npc_cubimal_chick', 0, 1);
    assert.deepEqual(copyTags(back, 'npc_cubimal_chick'), ['Cy', null, null]);
  });

  it('a stack on the ground keeps its points and words, and they come back up with it', () => {
    const { inv, toolState } = pack({ npc_cubimal_fox: 1 });
    setCopyTag(toolState, 'npc_cubimal_fox', 0, 'Rusty');
    const ground = createDroppedItemState();
    const down = dropInventoryStack(ground, inv, 'GTEST', 'npc_cubimal_fox', 1, { x: 1, y: 2 }, { merge: false, tags: [copyTag(toolState, 'npc_cubimal_fox', 0)] });
    assert.deepEqual(down.stack.tags, ['Rusty']);
    const up = pickupDroppedStack(ground, inv, 'GTEST', down.stack.id);
    assert.deepEqual(up.tags, ['Rusty']);
    const src = readFileSync(join(root, 'public/game.js'), 'utf8');
    assert.match(src, /arrivingToolPoints\(result\.classTsid, result\.count, result\.points, result\.tags\)/);
    assert.match(src, /tags: leavingToolTags\(classTsid, count\)/);
  });

  it('the picked copy is the one a pack verb acts on (feature-host opts.copy)', () => {
    const host = readFileSync(join(root, 'public/js/feature-host.js'), 'utf8');
    assert.match(host, /feature\.runPackVerb\(classTsid, verbId, engine, opts\)/);
    const game = readFileSync(join(root, 'public/game.js'), 'utf8');
    assert.match(game, /features\.runPackVerb\(classTsid, button\.dataset\.featurePackVerb, engine, button\.dataset\.featureId, picked\)/);
    assert.match(game, /features\.packVerbs\(classTsid, engine, \{ \.\.\.verbCopy, stackCount \}\)/);
  });
});

describe('potions: each bottle its own uses, each Draught its own Giant', () => {
  beforeEach(() => potionsFeature._reset());

  it('a quaff uses the bottle picked; a new bottle is full; an emptied one leaves alone', () => {
    const { engine } = engineWith({ potion_amorous_philtre: 2 });
    usePotionNow(engine, 'potion_amorous_philtre', { copy: 1 });
    potionsFeature._complete(engine);
    assert.deepEqual(remaining(engine.toolState, 'potion_amorous_philtre'), [5, 4]);
    // The menu says the picked bottle's uses.
    const label = (copy) => potionsFeature.packVerbs('potion_amorous_philtre', engine, { copy })[0].label;
    assert.equal(label(1), 'Quaff (4/5)');
    assert.equal(label(0), 'Quaff (5/5)');
    // Down to its last use, then empty: that one goes, the full one stays.
    setToolRemaining(engine.toolState, 'potion_amorous_philtre', 1, { copy: 1 });
    engine.removeBuff('feeling_called_love');
    usePotionNow(engine, 'potion_amorous_philtre', { copy: 1 });
    potionsFeature._complete(engine);
    assert.equal(countItem(engine.inv, 'potion_amorous_philtre'), 1);
    assert.deepEqual(remaining(engine.toolState, 'potion_amorous_philtre'), [5]);
    addItem(engine.inv, 'potion_amorous_philtre', 1);
    assert.deepEqual(remaining(engine.toolState, 'potion_amorous_philtre'), [5, 5]);
  });

  it('each Draught rolls its own Giant; Shake changes only the bottle shaken', () => {
    const { engine } = engineWith({ potion_favor: 2 });
    potionsFeature.packVerbs('potion_favor', engine, { copy: 0 });
    potionsFeature.packVerbs('potion_favor', engine, { copy: 1 });
    const [g0, g1] = copyTags(engine.toolState, 'potion_favor');
    assert.ok(g0 && g1);
    potionsFeature.runPackVerb('potion_favor', 'shake', engine, { copy: 1 });
    const after = copyTags(engine.toolState, 'potion_favor');
    assert.equal(after[0], g0);
    assert.notEqual(after[1], g1);
    // A new bottle has none until it is looked at, then its own.
    addItem(engine.inv, 'potion_favor', 1);
    assert.equal(copyTags(engine.toolState, 'potion_favor')[2], null);
  });

  it('an older save: the one count and Giant go to the first bottle, the others are new', () => {
    const { engine } = engineWith({ potion_favor: 2, potion_xp: 2 });
    potionsFeature.restore({ version: 1, uses: { potion_favor: 3, potion_xp: 2 }, favorGiant: 'cosma' }, engine);
    assert.deepEqual(remaining(engine.toolState, 'potion_favor'), [3, 11]);
    assert.deepEqual(remaining(engine.toolState, 'potion_xp'), [2, 5]);
    assert.deepEqual(copyTags(engine.toolState, 'potion_favor'), ['cosma', null]);
    const saved = potionsFeature.save();
    assert.equal(saved.version, 2);
    assert.equal(saved.uses, undefined, 'the uses now live with the pack');
  });
});

describe('powders: each jar its own charges', () => {
  beforeEach(() => powdersFeature._reset());

  it('a jar picked runs on its own charges; the ledger word lands on that jar', () => {
    const { engine } = engineWith({ sparkle_powder: 2 });
    powdersFeature.runPackVerb('sparkle_powder', 'sprinkle', engine, { copy: 1 });
    assert.deepEqual(remaining(engine.toolState, 'sparkle_powder'), [5, 4]);
    assert.equal(powdersFeature.packVerbs('sparkle_powder', engine, { copy: 1 })[0].label, 'Sprinkle (4/5)');
    // The site's ledger said jar 0 had 2 left after its use: the local use lands on its number.
    copyFromLedger(engine, 'sparkle_powder', 0, { left: 2, spent: false });
    spendCopyCharge(engine, 'sparkle_powder', 0);
    assert.deepEqual(remaining(engine.toolState, 'sparkle_powder'), [2, 4]);
    // Emptied by the ledger (spent): that jar goes, the other stays.
    copyFromLedger(engine, 'sparkle_powder', 1, { left: 0, spent: true });
    spendCopyCharge(engine, 'sparkle_powder', 1);
    assert.equal(countItem(engine.inv, 'sparkle_powder'), 1);
    assert.deepEqual(remaining(engine.toolState, 'sparkle_powder'), [2]);
  });

  it('an older save: the one count goes to the first jar', () => {
    const { engine } = engineWith({ fertilidust: 2 });
    powdersFeature.restore({ version: 1, charges: { fertilidust: 3 } }, engine);
    assert.deepEqual(remaining(engine.toolState, 'fertilidust'), [3, 5]);
    assert.deepEqual(powdersFeature.save().charges, {});
  });

  it('the jar used goes to the server with the dust and the spread (k)', () => {
    const src = readFileSync(join(root, 'public/js/features/street-objects-feature.js'), 'utf8');
    assert.match(src, /if \(Number\.isInteger\(copy\) && copy >= 0\) msg\.k = copy;/);
    const pw = readFileSync(join(root, 'public/js/features/powders-feature.js'), 'utf8');
    assert.match(pw, /mpc\.send\('powder_spread', \{ cls: classTsid, \.\.\.\(askingCopy != null && askingCopy >= 0 \? \{ k: askingCopy \} : \{\}\) \}\)/);
  });
});

describe('Tree Poison, its Antidote and the garden potions: each bottle its own pours', () => {
  it('a pour uses the bottle given, and an emptied one leaves alone', () => {
    const { inv, toolState } = pack({ potion_tree_poison: 2 });
    useBottle({ uses: {}, tools: toolState, copy: 1 }, 'potion_tree_poison', inv);
    assert.deepEqual(remaining(toolState, 'potion_tree_poison'), [5, 4]);
    assert.equal(bottleUsesLeft({ uses: {}, tools: toolState, copy: 1 }, 'potion_tree_poison', inv), 4);
    setToolRemaining(toolState, 'potion_tree_poison', 1, { copy: 0 });
    const out = useBottle({ uses: {}, tools: toolState, copy: 0 }, 'potion_tree_poison', inv);
    assert.equal(out.emptied, true);
    assert.equal(countItem(inv, 'potion_tree_poison'), 1);
    assert.deepEqual(remaining(toolState, 'potion_tree_poison'), [4]);
    const g = pack({ potion_garden_water: 2 });
    useGardenPotion({ uses: {}, tools: g.toolState, copy: 1 }, 'potion_garden_water', g.inv);
    assert.equal(gardenUsesLeft({ uses: {}, tools: g.toolState, copy: 1 }, 'potion_garden_water', g.inv), 4);
    assert.equal(gardenUsesLeft({ uses: {}, tools: g.toolState, copy: 0 }, 'potion_garden_water', g.inv), 5);
  });

  it('an older save: the one count goes to the first bottle', () => {
    const { engine } = engineWith({ potion_tree_poison: 2, potion_garden_plant: 2 });
    treeDeathFeature.restore({ version: 1, uses: { potion_tree_poison: 2 } }, engine);
    masterGardenFeature.restore({ version: 1, uses: { potion_garden_plant: 3 } }, engine);
    assert.deepEqual(remaining(engine.toolState, 'potion_tree_poison'), [2, 5]);
    assert.deepEqual(remaining(engine.toolState, 'potion_garden_plant'), [3, 5]);
    assert.deepEqual(treeDeathFeature.save().uses, {});
    assert.deepEqual(masterGardenFeature.save().uses, {});
  });
});

describe('Juju Shoo-Shoo Powder, the Butterfly Net and the Dusty Stick: each their own', () => {
  beforeEach(() => itemVerbsMoreFeature._reset());

  it('the net picked wears; a stick picked empties alone and every stick comes back a point each 12 minutes', () => {
    const butterfly = { classId: 'npc_butterfly', sprite: { x: 520, y: 380, destroyed: false, visible: true, scale: { x: 1, y: 1 } } };
    const { engine } = engineWith({ butterfly_net: 2, dusty_stick: 2 }, { interactables: [butterfly], started: true });
    itemVerbsMoreFeature.runPackVerb('butterfly_net', 'attract', engine, { copy: 1 });
    assert.deepEqual(remaining(engine.toolState, 'butterfly_net'), [100, 99]);
    const t0 = Date.now();
    itemVerbsMoreFeature.runPackVerb('dusty_stick', 'unleash', engine, { copy: 1 });
    assert.deepEqual(remaining(engine.toolState, 'dusty_stick'), [20, 0]);
    assert.equal(itemVerbsMoreFeature.packVerbs('dusty_stick', engine, { copy: 0 })[0].enabled, true, 'the other stick is full');
    itemVerbsMoreFeature.onTick(16, t0 + 25 * 60 * 1000, engine);
    assert.deepEqual(remaining(engine.toolState, 'dusty_stick'), [20, 2]);
    // A new stick is full.
    addItem(engine.inv, 'dusty_stick', 1);
    assert.deepEqual(remaining(engine.toolState, 'dusty_stick'), [20, 2, 20]);
  });

  it('the Juju jar picked loses the charge, and an older save goes to the first of each', () => {
    const boss = { classId: 'npc_juju_boss', sprite: { x: 600, y: 400, destroyed: false } };
    const { engine } = engineWith({ juju_shoo_shoo_powder: 2 }, { interactables: [boss] });
    itemVerbsMoreFeature.runPackVerb('juju_shoo_shoo_powder', 'blow_on', engine, { copy: 1 });
    assert.deepEqual(remaining(engine.toolState, 'juju_shoo_shoo_powder'), [5, 4]);
    const old = engineWith({ juju_shoo_shoo_powder: 2, butterfly_net: 2, dusty_stick: 1 }).engine;
    const emptied = Date.now() - 36 * 60 * 1000 - 1000;
    itemVerbsMoreFeature.restore({ version: 1, jujuCharges: 2, netPoints: 40, stickEmptiedAt: emptied }, old);
    assert.deepEqual(remaining(old.toolState, 'juju_shoo_shoo_powder'), [2, 5]);
    assert.deepEqual(remaining(old.toolState, 'butterfly_net'), [40, 100]);
    assert.deepEqual(remaining(old.toolState, 'dusty_stick'), [3], 'three points back since it was emptied');
  });
});

describe('a Still, a Cubimal, a lit pumpkin and an Emotional Bear: each their own', () => {
  it('a Still picked distills into its own hopper; an older save is the first Still', () => {
    supplyFeature._reset();
    const { engine } = engineWith({ still: 2, grain: 30 }, { learnedSkills: ['distilling_1'] });
    supplyFeature.runPackVerb('still', 'distill:grain', engine, { copy: 1 });
    const tags = copyTags(engine.toolState, 'still');
    assert.equal(tags[0], null);
    assert.ok(tags[1]?.hopper > 0);
    const old = engineWith({ still: 2 }).engine;
    supplyFeature.restore({ version: 1, still: { hopper: 0, hooch: 4 } }, old);
    assert.equal(copyTags(old.toolState, 'still')[0].hooch, 4);
    assert.equal(copyTags(old.toolState, 'still')[1], null);
  });

  it('a Cubimal picked is the one named; an older save names the first figure', () => {
    const { engine } = engineWith({ npc_cubimal_chick: 2 });
    cubimalRaceFeature.restore({ names: { npc_cubimal_chick: 'Sprocket' } }, engine);
    assert.deepEqual(copyTags(engine.toolState, 'npc_cubimal_chick'), ['Sprocket', null]);
    assert.equal(cubimalRaceFeature.packVerbs('npc_cubimal_chick', engine, { copy: 1 })[0].label, 'Name');
    assert.equal(cubimalRaceFeature.packVerbs('npc_cubimal_chick', engine, { copy: 0 })[0].label, 'Rename');
    assert.deepEqual(cubimalRaceFeature.itemDisplayName('npc_cubimal_chick', 1, engine), null);
  });

  it("a lit pumpkin's phrases: an older save's list is the first pumpkin's", () => {
    const { engine } = engineWith({ pumpkin_lit_2: 2 });
    seasonsFeature.restore({ pumpkinPhrases: { pumpkin_lit_2: ['boo', 'hi'] } }, engine);
    assert.deepEqual(copyTags(engine.toolState, 'pumpkin_lit_2'), [['boo', 'hi'], null]);
    assert.deepEqual(seasonsFeature.save().pumpkinPhrases, {});
  });

  it("an Emotional Bear's upgrades are bits on its copy; game.js reads the bear in hand", () => {
    const { inv, toolState } = pack({ emotional_bear: 2 });
    assert.deepEqual(remaining(toolState, 'emotional_bear'), [0, 0], 'a new bear is plain');
    migrateClassValue(toolState, 'emotional_bear', 3);
    assert.deepEqual(remaining(toolState, 'emotional_bear'), [3, 0]);
    addItem(inv, 'emotional_bear', 1);
    assert.deepEqual(remaining(toolState, 'emotional_bear'), [3, 0, 0]);
    const game = readFileSync(join(root, 'public/game.js'), 'utf8');
    assert.match(game, /const result = upgradeEmotionalBear\(bearView\(copy\), inv, upgrade\);/);
    assert.match(game, /performEmotionalBearAction\(\n\s+bearView\(\),/);
    assert.match(game, /features\.restore\(savedFeatureSlices, engine\);\n\s+migrateBearUpgrades\(\);/);
  });
});
