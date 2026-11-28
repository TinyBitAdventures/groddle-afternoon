/**
 * G1248 (#669): nothing gave a Bookcase. Glitch's recipe 263 (items/catalog_recipes.js 5490-5510) was
 * retired (learnt 3, parked on the Alchemical Tongs with no skills), no store sold one and only the
 * demo room placed one, yet players had Bookcases in their houses. The remake turns recipe 263 back
 * on (build-recipes.mjs TURNED_BACK_ON) with the row's inputs, energy, xp and time, and the tool and
 * skills the Bookcase's own item file still names (items/furniture_bookcase.js 215-216: a
 * Construction Tool, Furnituremaking II and Engineering), as the Cabinet (262) and Wall Cabinet (264).
 * Run: node --test tests/bookcase-recipe-669.test.js
 */
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { RECIPE_CATALOG, canCraft, craftRecipe, listRecipesForTool, loadRecipeCatalogFromFile } from '../public/js/making.js?v=4d75f062';
import { createInventory, countItem } from '../public/js/inventory.js?v=3be7988a';
import { FURNITURE_CATALOG } from '../public/js/homes-catalog.js?v=0367f90f';
import { TURNED_BACK_ON, loadRecipes } from '../build-recipes.mjs';
import { sitePath, skipWithoutSite } from '../tools/repos.mjs';
import { GSJS } from '../tools/catalog/build.mjs';

const root = join(import.meta.dirname, '..');
const content = join(root, 'public/assets/content');
const json = (p) => JSON.parse(readFileSync(p, 'utf8'));
const recipes = json(join(content, 'recipes.json'));
const skipGsjs = existsSync(join(GSJS, 'items/catalog_recipes.js')) ? false : `needs glitch-GameServerJS at ${GSJS}`;
const SKILLS = ['engineering_1', 'furnituremaking_2'];
/** The Construction Tool's own required skill (making_can_use), on top of the recipe's. */
const LEARNED = ['furnituremaking_1', ...SKILLS];

describe('G1248: the Bookcase is made again (recipe 263)', () => {
  before(async () => {
    await loadRecipeCatalogFromFile(join(content, 'recipes.json'));
  });

  it('recipe 263 is in the making data, no longer skipped', () => {
    const r = recipes.furniture_bookcase;
    assert.ok(r, 'recipes.json furniture_bookcase');
    assert.equal(r.id, '263');
    assert.equal(r.tool, 'construction_tool');
    assert.equal(r.skill, 'engineering_1');
    assert.deepEqual(r.skills, SKILLS);
    assert.deepEqual(r.outputs, [{ classTsid: 'furniture_bookcase', qty: 1 }]);
    assert.ok(TURNED_BACK_ON[263]);
    const skipped = json(join(content, 'recipes-skipped.json')).skipped.map((s) => s.id);
    assert.ok(!skipped.includes('263'));
  });

  it('matches GSJS: the row\'s inputs, energy, xp and time; the item file\'s tool and skills', { skip: skipGsjs }, () => {
    const row = loadRecipes(GSJS)['263'];
    const r = recipes.furniture_bookcase;
    assert.equal(row.name, 'Bookcase');
    assert.deepEqual(r.inputs, JSON.parse(JSON.stringify(row.inputs)).map(([classTsid, qty]) => ({ classTsid, qty: Number(qty) })));
    assert.deepEqual(r.inputs, [{ classTsid: 'board', qty: 20 }, { classTsid: 'plank', qty: 20 }, { classTsid: 'snail', qty: 40 }]);
    assert.equal(r.energyCost, row.energy_cost);
    assert.equal(r.xpReward, row.xp_reward);
    assert.equal(r.waitMs, row.wait_ms);
    const item = readFileSync(join(GSJS, 'items/furniture_bookcase.js'), 'utf8');
    assert.match(item, /You can make this using a <a [^>]*glitch=\\"item\|construction_tool\\"/);
    assert.match(item, /skill\|furnituremaking_2[\s\S]*skill\|engineering_1/);
  });

  it('the Construction Tool\'s making window lists it, and it makes a Bookcase', () => {
    assert.ok(listRecipesForTool('construction_tool').some((r) => r.id === '263'));
    const key = Object.keys(RECIPE_CATALOG).find((k) => RECIPE_CATALOG[k].id === '263');
    const inv = createInventory({ construction_tool: 1, board: 20, plank: 20, snail: 40 });
    assert.equal(canCraft(inv, RECIPE_CATALOG[key], { learned: ['furnituremaking_1', 'engineering_1'] }).reason, 'skill');
    const pc = { energy: 500, mood: 50, imagination: 0, xp: 0 };
    const made = craftRecipe(inv, pc, key, { learned: LEARNED });
    assert.equal(made.ok, true, JSON.stringify(made));
    assert.equal(countItem(inv, 'furniture_bookcase'), 1);
    assert.equal(countItem(inv, 'board'), 0);
  });

  it('the house catalog, the Encyclopedia and the Item Catalog say how to get it', () => {
    assert.deepEqual(FURNITURE_CATALOG.furniture_bookcase.recipe, { id: '263', tool: 'construction_tool', name: 'Bookcase' });
    const page = readFileSync(join(root, 'public/encyclopedia/items/furniture_bookcase/index.html'), 'utf8');
    assert.match(page, /How to get it/);
    assert.match(page, /Construction Tool/);
    const row = json(join(root, 'public/encyclopedia/items/data.json')).items.find((i) => i.id === 'furniture_bookcase');
    assert.equal(row.status, 'source');
    assert.deepEqual(row.get, ['made']);
    assert.match(readFileSync(join(root, 'public/encyclopedia/recipes/construction_tool/index.html'), 'utf8'), /Bookcase/);
  });

  it('the console no longer calls it admin only', { skip: skipWithoutSite }, () => {
    const row = json(sitePath('data/item-sources.json')).items.furniture_bookcase;
    assert.deepEqual(row, { cat: 'Furniture and home', src: ['made'], ok: 1, price: 1500 });
  });
});
