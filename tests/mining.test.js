/**
 * Mining + metalworking (GSJS-inspired).
 * Run: node --test tests/mining.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ROCK_CATALOG,
  MINING_COSTS,
  SMELT_COSTS,
  CRUSH_YIELDS,
  createMineRock,
  mineRock,
  tickMineRock,
  smeltMetalRocks,
  crushOre,
  findWorkingPick,
  rockSceneIndex,
  rockFrameIndex,
  rockStatusLabel,
  ensureMiningItems,
  starterMiningTools,
  miningVendorOffers,
  STARTER_MINING_SKILLS,
} from '../public/js/mining.js';
import {
  createInventory,
  countItem,
  listPackToolSlots,
  isToolItem,
} from '../public/js/inventory.js?v=catalog-unified-7';
import {
  loadRecipeCatalogFromFile,
  listRecipesForTool,
  canCraft,
  craftRecipe,
  ensureMakingItems,
  TOOL_CATALOG,
} from '../public/js/making.js';
import { DEFAULT_VENDOR, vendorBuy } from '../public/js/vendor.js';
import { createToolConditionState, getToolCondition } from '../public/js/tools.js?v=woodcutting-test-3';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SPIKE = join(__dirname, '../public');

describe('mining catalog (GSJS rocks)', () => {
  it('has metal, dullite, beryl, sparkly nodes', () => {
    ensureMiningItems();
    for (const id of ['rock_metal_1', 'rock_dullite_1', 'rock_beryl_1', 'rock_sparkly_1']) {
      const r = ROCK_CATALOG[id];
      assert.ok(r, id);
      assert.ok(r.chunkId);
      assert.equal(r.chunksMax, 50);
      assert.ok(r.minChunks >= 3);
      assert.ok(r.maxChunks >= r.minChunks);
      const bytes = readFileSync(join(SPIKE, r.worldSheet));
      assert.equal(bytes.readUInt32BE(16), r.frameWidth * r.sheetFrames, `${id} strip width`);
      assert.equal(bytes.readUInt32BE(20), r.frameHeight, `${id} strip height`);
      assert.match(r.textureKey, /^mineRock/);
    }
  });

  it('starter tools include pick + smelter + grinder', () => {
    const inv = createInventory(starterMiningTools());
    assert.ok(findWorkingPick(inv));
    assert.equal(countItem(inv, 'smelter'), 1);
    assert.equal(countItem(inv, 'ore_grinder'), 1);
    assert.equal(countItem(inv, 'metalmaker'), 1);
    const tools = listPackToolSlots(inv);
    assert.ok(tools.some((t) => t.classTsid === 'pick'));
  });

  it('icons exist for core mining items', () => {
    for (const id of [
      'pick',
      'smelter',
      'metal_rock',
      'plain_metal',
      'dullite',
      'beryl',
      'sparkly',
      'tin',
      'copper',
      'element_red',
    ]) {
      const p = join(SPIKE, `assets/sprites/icons/${id}.png`);
      assert.ok(existsSync(p), p);
    }
    for (const id of ['rock_metal', 'rock_dullite', 'rock_beryl', 'rock_sparkly']) {
      const p = join(SPIKE, `assets/sprites/mining/${id}.png`);
      assert.ok(existsSync(p), p);
    }
  });
});

describe('mine rock loop', () => {
  it('requires pick and mining skill', () => {
    const rock = createMineRock('rock_metal_1');
    const inv = createInventory({});
    const pc = { energy: 80 };
    const r = mineRock(rock, inv, pc, { learned: [], requireSkill: true });
    assert.equal(r.ok, false);
    assert.equal(r.reason, 'no_pick');

    const inv2 = createInventory({ pick: 1 });
    const r2 = mineRock(rock, inv2, pc, { learned: [], requireSkill: true });
    assert.equal(r2.ok, false);
    assert.equal(r2.reason, 'skill');
  });

  it('mines chunks, spends energy, depletes and respawns', () => {
    // minChunks for metal is 3 — start with 3 so one swing depletes
    const rock = createMineRock('rock_metal_1', { chunksRemaining: 3 });
    const inv = createInventory({ pick: 1 });
    const pc = { energy: 100, imagination: 0, xp: 0 };
    const r = mineRock(rock, inv, pc, {
      learned: ['mining_1'],
      requireSkill: true,
      rng: () => 0, // min chunks (3)
      now: 1000,
    });
    assert.equal(r.ok, true);
    assert.ok(r.got >= 3);
    assert.ok(countItem(inv, 'metal_rock') >= 3);
    assert.equal(pc.energy, 100 - MINING_COSTS.energy);
    assert.ok(rock.depleted);
    assert.ok(rock.respawnAt > 1000);

    assert.equal(tickMineRock(rock, rock.respawnAt - 1), false);
    assert.equal(tickMineRock(rock, rock.respawnAt + 1), true);
    assert.equal(rock.chunksRemaining, 50);
    assert.equal(rock.depleted, false);
  });

  it('gives the whole roll even past the chunks remaining (include/mining.js)', () => {
    const rock = createMineRock('rock_metal_1', { chunksRemaining: 2 });
    const inv = createInventory({ pick: 1 });
    const pc = { energy: 100, imagination: 0, xp: 0 };
    const r = mineRock(rock, inv, pc, { learned: ['mining_1'], rng: () => 0 });
    assert.equal(r.got, 3);
    assert.equal(countItem(inv, 'metal_rock'), 3);
    assert.ok(rock.depleted);
  });

  it('refuses a swing when energy only equals the cost', () => {
    const rock = createMineRock('rock_metal_1');
    const inv = createInventory({ pick: 1 });
    const pc = { energy: MINING_COSTS.energy };
    assert.equal(mineRock(rock, inv, pc, { learned: ['mining_1'] }).reason, 'energy');
  });

  it('each gem scales that pick\'s drop chance by 0.8', () => {
    const rock = createMineRock('rock_metal_1');
    const inv = createInventory({ pick: 1 });
    const pc = { energy: 100, imagination: 0, xp: 0, imaginationUpgrades: ['mining_drop_1'] };
    const r = mineRock(rock, inv, pc, { learned: ['mining_1'], rng: () => 0 });
    assert.ok(r.gem);
    assert.equal(pc.miningDropScale.pick, 0.8);
    // 4% * 0.8 = 3.2%: a 3.5% roll now misses.
    const again = mineRock(rock, inv, pc, { learned: ['mining_1'], rng: () => 0.035 });
    assert.equal(again.gem, null);
  });

  it('scene index scales with chunks remaining', () => {
    const rock = createMineRock('rock_metal_1', { chunksRemaining: 50 });
    assert.equal(rockSceneIndex(rock), 5);
    rock.chunksRemaining = 15;
    assert.equal(rockSceneIndex(rock), 2);
    rock.chunksRemaining = 0;
    rock.depleted = true;
    assert.equal(rockSceneIndex(rock), 0);
    assert.equal(rockFrameIndex(rock), 4);
  });
});

describe('smelt + crush', () => {
  it('smelts 5 metal_rock → 1 plain_metal', () => {
    const inv = createInventory({ metal_rock: 12, smelter: 1 });
    const pc = { energy: 50, imagination: 0 };
    const r = smeltMetalRocks(inv, pc, {
      learned: ['smelting_1'],
      requireSkill: true,
    });
    assert.equal(r.ok, true);
    assert.equal(r.ingots, 2);
    assert.equal(countItem(inv, 'metal_rock'), 2);
    assert.equal(countItem(inv, 'plain_metal'), 2);
    assert.equal(pc.energy, 50 - SMELT_COSTS.energyPerIngot * 2);
  });

  it('crushes dullite/beryl/sparkly to elements', () => {
    const inv = createInventory({
      dullite: 1,
      beryl: 1,
      sparkly: 1,
      ore_grinder: 1,
    });
    const pc = { energy: 40, imagination: 0 };
    const d = crushOre(inv, pc, 'dullite', { learned: ['refining_1'] });
    assert.equal(d.ok, true);
    assert.equal(countItem(inv, 'element_red'), 5);
    assert.equal(countItem(inv, 'element_green'), 8);

    const b = crushOre(inv, pc, 'beryl', { learned: ['refining_1'] });
    assert.equal(b.ok, true);
    assert.equal(countItem(inv, 'element_red'), 5 + 20);

    const s = crushOre(inv, pc, 'sparkly', { learned: ['refining_1'] });
    assert.equal(s.ok, true);
    assert.equal(countItem(inv, 'element_shiny'), 6);
    assert.ok(CRUSH_YIELDS.sparkly.length === 4);
  });

  it('grinder wear is round(count / 3) uses, at least one (ore_grinder.js)', () => {
    const wearFor = (qty) => {
      const inv = createInventory({ dullite: qty, ore_grinder: 1 });
      const tools = createToolConditionState();
      const before = getToolCondition(tools, 'ore_grinder').remaining;
      const r = crushOre(inv, { energy: 1000 }, 'dullite', { qty, learned: ['refining_1'], toolState: tools });
      assert.equal(r.ok, true);
      return before - getToolCondition(tools, 'ore_grinder').remaining;
    };
    assert.equal(wearFor(1), 2);
    assert.equal(wearFor(9), 6);
    assert.equal(wearFor(10), 6);
  });
});

describe('metal recipes in catalog', () => {
  it('loads smelter / tongs / metalmaker / grinder recipes', async () => {
    await loadRecipeCatalogFromFile(join(SPIKE, 'assets/content/recipes.json'));
    ensureMakingItems();
    assert.ok(TOOL_CATALOG.smelter);
    assert.ok(TOOL_CATALOG.alchemical_tongs);
    assert.ok(TOOL_CATALOG.metalmaker);
    assert.ok(TOOL_CATALOG.ore_grinder);

    const smelt = listRecipesForTool('smelter');
    assert.ok(smelt.some((r) => r.key === 'plain_metal' || r.outputs?.[0]?.classTsid === 'plain_metal'));

    const tongs = listRecipesForTool('alchemical_tongs');
    assert.ok(tongs.some((r) => r.key === 'tin'));
    assert.ok(tongs.some((r) => r.key === 'copper'));

    const mm = listRecipesForTool('metalmaker');
    assert.ok(mm.some((r) => r.key === 'metal_rod'));
    assert.ok(mm.some((r) => r.key === 'metal_post'));

    const inv = createInventory({
      metal_rock: 5,
      smelter: 1,
    });
    const recipe = smelt.find((r) => r.outputs?.[0]?.classTsid === 'plain_metal');
    assert.ok(recipe);
    const gate = canCraft(inv, recipe, {
      learned: ['smelting_1'],
      requireSkill: true,
    });
    assert.equal(gate.ok, true);
    const pc = { energy: 20, imagination: 0 };
    // craftRecipe(inv, pc, recipeKey, opts)
    const made = craftRecipe(inv, pc, recipe.key, {
      learned: ['smelting_1'],
      requireSkill: true,
    });
    assert.equal(made.ok, true, made.reason || made.msgs?.[0]);
    assert.equal(countItem(inv, 'plain_metal'), 1);
  });

  it('vendor sells picks and smelters', () => {
    const offers = miningVendorOffers();
    assert.ok(offers.some((o) => o.classTsid === 'pick'));
    const inv = createInventory({});
    const pc = { currants: 2000 };
    const r = vendorBuy(pc, inv, DEFAULT_VENDOR.offers, 'pick', 1);
    assert.equal(r.ok, true);
    assert.equal(countItem(inv, 'pick'), 1);
  });

  it('starter mining skills list is complete enough for the chain', () => {
    for (const s of ['mining_1', 'smelting_1', 'refining_1', 'alchemy_2', 'metalwork_1']) {
      assert.ok(STARTER_MINING_SKILLS.includes(s), s);
    }
  });
});

describe('game wiring', () => {
  it('game.js imports mining and spawns rocks', () => {
    const src = readFileSync(join(SPIKE, 'game.js'), 'utf8');
    assert.match(src, /spawnMineRocks/);
    assert.match(src, /starterMiningTools/);
    assert.match(src, /STARTER_MINING_SKILLS/);
    assert.match(src, /from '\.\/js\/mining\.js\?v=g330-1'/);
    const preloadedSheets = {
      mineRockMetal: [137, 100],
      mineRockDullite: [131, 114],
      mineRockBeryl: [134, 120],
      mineRockSparkly: [131, 127],
    };
    for (const [key, [width, height]] of Object.entries(preloadedSheets)) {
      assert.match(
        src,
        new RegExp(`${key}:\\s*\\{[\\s\\S]*?fw:\\s*${width},\\s*fh:\\s*${height},\\s*cols:\\s*5,\\s*rows:\\s*1`),
        `${key} must preload its exact five-cell strip`
      );
    }
    assert.match(src, /const loadedFrames = textures\[def\.textureKey\]\?\.frames/);
    assert.match(src, /dataset\.rockPopulation/);
    assert.match(src, /URLSearchParams\(location\.search\)\.get\('rockdemo'\)/);
  });

  it('content.js exposes mine verb for rocks', () => {
    const src = readFileSync(join(SPIKE, 'content.js'), 'utf8');
    assert.match(src, /mineRock/);
    assert.match(src, /ROCK_CATALOG/);
    assert.match(src, /'mine'/);
  });
});

describe('pick swing', () => {
  const pub = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
  // WebP VP8L header: 14-bit width-1 and height-1 after the 0x2f signature.
  const webpSize = (rel) => {
    const b = readFileSync(join(pub, rel));
    const bits = b.readUInt32LE(21);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  };

  it('ships the source tool_animation scene for both picks at 3x (11 x 3 cells of 115 x 63)', () => {
    for (const file of ['pick-tool@3x.webp', 'fancy-pick-tool@3x.webp']) {
      assert.deepEqual(webpSize(`assets/sprites/tools/${file}`), { width: 115 * 11 * 3, height: 63 * 3 * 3 });
    }
  });

  it('swings the working pick while the mine verb runs', () => {
    const game = readFileSync(join(pub, 'game.js'), 'utf8');
    assert.match(game, /ROCK_CATALOG\[target\.classId\] && baseVerb === 'mine'\) playPickAnimation/);
    assert.match(game, /findWorkingPick\(inv, toolState\)/);
    assert.match(game, /pick-tool@3x\.webp/);
    assert.match(game, /fancy-pick-tool@3x\.webp/);
  });
});
