/** Official Fruit Changing Machine recipes, art, crafting, and UI wiring. */

import { before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  RECIPE_CATALOG,
  TOOL_CATALOG,
  craftDurationFor,
  craftRecipe,
  craftRecipeBatch,
  ensureMakingItems,
  listRecipesForTool,
  loadRecipeCatalogFromFile,
  starterCraftIngredients,
  starterToolsInventory,
} from '../public/js/making.js';
import {
  ITEM_CATALOG,
  countItem,
  createInventory,
  listPackToolSlots,
} from '../public/js/inventory.js?v=catalog-unified-4';

const here = dirname(fileURLToPath(import.meta.url));
const publicRoot = join(here, '../public');
const recipesPath = join(publicRoot, 'assets/content/recipes.json');

const EXPECTED = {
  change_plum: ['108', 1, 3, 1, 'plum'],
  change_grapes: ['109', 2, 3, 1, 'bunch_of_grapes'],
  change_orange: ['111', 3, 3, 1, 'orange'],
  change_apple: ['112', 3, 3, 1, 'apple'],
  change_lemon: ['113', 4, 2, 1, 'lemon'],
  change_pineapple: ['114', 5, 4, 1, 'pineapple'],
  change_banana: ['115', 6, 5, 2, 'banana'],
  change_whortleberry: ['142', 2, 4, 1, 'whortleberry'],
  change_cloudberry: ['144', 1, 2, 1, 'cloudberry'],
  change_strawberry: ['172', 3, 2, 1, 'strawberry'],
  change_mangosteen: ['173', 7, 4, 2, 'mangosteen'],
};

describe('official Fruit Changing Machine catalog', () => {
  before(async () => {
    await loadRecipeCatalogFromFile(recipesPath);
    ensureMakingItems();
  });

  it('ports all 11 convert recipes with exact GSJS costs and rewards', () => {
    const recipes = listRecipesForTool('fruit_changing_machine');
    assert.equal(recipes.length, 11);
    for (const [key, [id, cherries, energy, xp, output]] of Object.entries(EXPECTED)) {
      const recipe = RECIPE_CATALOG[key];
      assert.ok(recipe, key);
      assert.equal(recipe.id, id, key);
      assert.equal(recipe.waitMs, 2000, key);
      assert.equal(recipe.energyCost, energy, key);
      assert.equal(recipe.xpReward, xp, key);
      assert.deepEqual(recipe.inputs, [{ classTsid: 'cherry', qty: cherries }], key);
      assert.deepEqual(recipe.outputs, [{ classTsid: output, qty: 1 }], key);
      assert.match(recipe.source, new RegExp(`recipes\\[\\"${id}\\"\\]`));
    }
  });

  it('registers the original machine as a pack tool with a convert action', () => {
    const tool = TOOL_CATALOG.fruit_changing_machine;
    assert.equal(tool.label, 'Fruit Changing Machine');
    assert.equal(tool.action, 'convert');
    assert.match(tool.desc, /transmogrifies cherries/i);
    const inv = createInventory(starterToolsInventory());
    const tools = listPackToolSlots(inv);
    assert.ok(tools.some((slot) => slot.classTsid === 'fruit_changing_machine'));
    assert.equal(ITEM_CATALOG.fruit_changing_machine.isTool, true);
    assert.equal(starterCraftIngredients().cherry, 20);
  });

  it('ships every iconic fruit plus the original 18×5 animation sheet', () => {
    const ids = ['fruit_changing_machine', ...Object.values(EXPECTED).map((row) => row[4])];
    for (const id of new Set(ids)) {
      const icon = join(publicRoot, `assets/sprites/icons/${id}.png`);
      assert.ok(existsSync(icon), `missing ${id} iconic art`);
    }
    // 17 working frames rendered at 3x from the vector SWF: 17 x 132 by 198 (44 x 66 at 1x).
    const animation = join(publicRoot, 'assets/sprites/making/fruit_changing_machine-work@3x.webp');
    const webp = readFileSync(animation);
    assert.equal(webp.toString('ascii', 0, 4), 'RIFF');
    assert.equal(webp.toString('ascii', 12, 16), 'VP8L');
    const bits = webp.readUInt32LE(21);
    assert.equal((bits & 0x3fff) + 1, 17 * 132);
    assert.equal(((bits >> 14) & 0x3fff) + 1, 198);
  });
});

describe('Fruit Changing conversion loop', () => {
  it('atomically converts cherries to an orange with official metabolics', () => {
    const inv = createInventory({ cherry: 3, fruit_changing_machine: 1 });
    const pc = { energy: 20, imagination: 0, xp: 0 };
    const result = craftRecipe(inv, pc, 'change_orange');
    assert.equal(result.ok, true, result.msgs?.join(' '));
    assert.equal(countItem(inv, 'cherry'), 0);
    assert.equal(countItem(inv, 'orange'), 1);
    assert.equal(pc.energy, 17);
    assert.equal(pc.imagination, 1);
    assert.equal(pc.xp, 1);
    assert.equal(craftDurationFor(result.recipe), 2000);
  });

  it('supports a timed-style batch while preserving completed output', () => {
    const inv = createInventory({ cherry: 3, fruit_changing_machine: 1 });
    const pc = { energy: 20, imagination: 0, xp: 0 };
    const result = craftRecipeBatch(inv, pc, 'change_cloudberry', 3);
    assert.equal(result.ok, true);
    assert.equal(result.made, 3);
    assert.equal(countItem(inv, 'cherry'), 0);
    assert.equal(countItem(inv, 'cloudberry'), 3);
    assert.equal(result.progress.at(-1).label, 'Making 3 of 3: Cloudberry');
    assert.equal(result.result.energy, -6);
    assert.equal(result.result.xp, 3);
  });

  it('does not mutate inventory or energy when cherries are short', () => {
    const inv = createInventory({ cherry: 6, fruit_changing_machine: 1 });
    const pc = { energy: 20, imagination: 0, xp: 0 };
    const before = { ...inv };
    const result = craftRecipe(inv, pc, 'change_mangosteen');
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'ingredients');
    assert.deepEqual(inv, before);
    assert.equal(pc.energy, 20);
  });
});

describe('Fruit Changing interface wiring', () => {
  it('opens from the pack, labels conversion clearly, and animates the real sheet', () => {
    const game = readFileSync(join(publicRoot, 'game.js'), 'utf8');
    const css = readFileSync(join(publicRoot, 'style.css'), 'utf8');
    const html = readFileSync(join(publicRoot, 'play/index.html'), 'utf8');
    assert.match(game, /classTsid === 'fruit_changing_machine'/);
    assert.match(game, /Convert fruit/);
    assert.match(game, /Transmogrify/);
    assert.match(game, /11 fruits|recipes\.length.*fruits/s);
    // G188: played through the Make panel's one tool-sheet path (js/make-tool-sheets.js).
    const sheets = readFileSync(join(publicRoot, 'js/make-tool-sheets.js'), 'utf8');
    assert.match(game, /makeToolSheetVisual\(recipe\.tool\)/);
    assert.match(sheets, /fruit_changing_machine: Object\.freeze\(\{ url: 'assets\/sprites\/making\/fruit_changing_machine-work@3x\.webp', fw: 44, fh: 66, frames: 17, durationMs: 1350, scale: 1\.42, density: 3 \}\)/);
    assert.match(css, /\.mp-tool-sheet \{[\s\S]*?steps\(var\(--mp-steps\), end\)/);
    assert.match(css, /@keyframes make-tool-sheet/);
    const making = readFileSync(join(publicRoot, 'js/making.js'), 'utf8');
    assert.match(making, /recipes\.json\?v=fruit-machine-2/);
    assert.match(html, /game\.js\?v=(?:official-ecology-1|trant-harvest-[12]|badge-events-1|butterfly-care-1|feed-picker-1|animal-kinship-[12]|trant-care-[1-3]|woodcutting-[1-4]|dialogue-[1-3]|movement-1|food-memory-1|dametime-1|fruit-machine-2|vendor-profiles-1|world-items-[12]|world-persistence-1|shrines-[1-4]|quoins-[12]|item-buffs-[12]|tool-condition-1)/);
    assert.match(html, /style\.css\?v=(?:feed-picker-1|trant-care-[1-3]|woodcutting-[1-4]|dialogue-[1-3]|movement-1|food-memory-1|dametime-1|fruit-machine-2|shrines-1|quoins-1|item-buffs-1|tool-condition-1)/);
  });
});
