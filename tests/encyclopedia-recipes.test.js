/**
 * The encyclopedia's Recipes section (tools/encyclopedia/recipes.mjs, Austin
 * 2026-11-05): one page per tool or machine, with every recipe of
 * assets/content/recipes.json on its tool's page exactly once (an anchor per
 * recipe), its ingredients and results linked to their item pages, the skills
 * it needs, energy, time and iMG.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const pub = join(import.meta.dirname, '..', 'public');
const dir = join(pub, 'encyclopedia', 'recipes');
const read = (rel) => readFileSync(join(pub, rel), 'utf8');
const page = (tool) => read(`encyclopedia/recipes/${tool}/index.html`);
const recipes = JSON.parse(read('assets/content/recipes.json'));
const tools = [...new Set(Object.values(recipes).map((r) => r.tool))].sort();
const block = (html, id) => new RegExp(`<div class="ency-recipe" id="r${id}">([\\s\\S]*?)</div>\\s*</div>`).exec(html)?.[1] || '';

describe('encyclopedia: Recipes by tool', () => {
  it('has one page per tool, listed on the section page and in the search', () => {
    const have = readdirSync(dir, { withFileTypes: true }).filter((x) => x.isDirectory()).map((x) => x.name).sort();
    assert.deepEqual(have, tools);
    const index = read('encyclopedia/recipes/index.html');
    const search = JSON.parse(read('encyclopedia/search.json'));
    const rows = new Set(search.entries.filter((x) => x.s === 'recipes').map((x) => x.id));
    for (const t of tools) {
      assert.ok(index.includes(`href="../../encyclopedia/recipes/${t}/"`), t);
      assert.ok(rows.has(t), t);
    }
    for (const g of ['Cooking tools', 'Transmogrifiers', 'Machines', 'Alchemy and potions']) assert.ok(index.includes(`data-group="${g}"`), g);
  });

  it('puts every recipe on its tool page once, with an anchor', () => {
    const pages = Object.fromEntries(tools.map((t) => [t, page(t)]));
    for (const r of Object.values(recipes)) {
      const html = pages[r.tool];
      assert.equal(html.split(`id="r${r.id}"`).length - 1, 1, `${r.tool} #r${r.id}`);
      for (const other of tools) if (other !== r.tool) assert.ok(!pages[other].includes(`id="r${r.id}"`), `${r.id} also on ${other}`);
    }
  });

  it('shows what goes in and comes out, the skill, energy, time and iMG (Simple Slaw)', () => {
    const slaw = block(page('knife_and_board'), 1);
    assert.match(slaw, /<p class="ency-recipe-name">Simple Slaw<\/p>/);
    for (const id of ['cabbage', 'corn', 'bean_plain', 'simple_slaw']) assert.ok(slaw.includes(`href="../../../encyclopedia/items/${id}/"`), id);
    assert.match(slaw, /<span class="ency-n">×5<\/span>/);
    assert.match(slaw, /href="\.\.\/\.\.\/\.\.\/encyclopedia\/skills\/ezcooking_2\/"[\s\S]*?needs EZ Cooking II/);
    assert.match(slaw, /<span>3 energy</);
    assert.match(slaw, /<span>2 s</);
    assert.match(slaw, /<span>2 iMG</);
  });

  it('says who can use the tool', () => {
    assert.match(page('fruit_changing_machine'), /Anyone can use it\. Without <a href="\.\.\/\.\.\/\.\.\/encyclopedia\/skills\/fruitchanging_1\/">Fruit Changing<\/a> each make takes twice as long/);
    assert.match(page('frying_pan'), /You need <a href="\.\.\/\.\.\/\.\.\/encyclopedia\/skills\/cheffery_1\/">[^<]+<\/a> to use it at all/);
    assert.match(page('frying_pan'), /href="\.\.\/\.\.\/\.\.\/encyclopedia\/items\/frying_pan\/"[\s\S]*?the tool/);
  });

  it('names the quest that teaches a recipe and the machines\' fuel', () => {
    const taught = Object.values(recipes).find((r) => r.taughtBy);
    assert.match(block(page(taught.tool), taught.id), /taught by /);
    const fuelled = Object.values(recipes).find((r) => r.fuel);
    assert.match(block(page(fuelled.tool), fuelled.id), new RegExp(`<span>${fuelled.fuel} fuel<`));
  });
});
