/**
 * Item page quality (lane enc-items, Austin 2026-11-05): each recipe's skills, energy and time (tools/catalog/costs.mjs), what a vendor pays beside
 * the price and the stack size in the header.
 * Run: node --test tests/catalog-item-pages.test.js
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { NOT_SELLABLE, NOT_SELLABLE_FLAGS, loadCosts, secondsText } from '../tools/catalog/costs.mjs';

const spike = join(import.meta.dirname, '..');
const pub = join(spike, 'public');
const items = join(pub, 'encyclopedia', 'items');
const data = JSON.parse(readFileSync(join(items, 'data.json'), 'utf8'));
const page = (id) => readFileSync(join(items, id, 'index.html'), 'utf8');
const inRemake = data.items.filter((i) => i.status === 'source');
const recipes = JSON.parse(readFileSync(join(pub, 'assets/content/recipes.json'), 'utf8'));
const costs = await loadCosts(spike);
const making = await import('../public/js/making.js?v=621cd991');
const vendor = await import('../public/js/vendor.js?v=c74e9e04');

describe('recipes: skills, energy and time', () => {
  it('puts every skill, the energy and the time on each recipe row', () => {
    let rows = 0;
    for (const item of inRemake) {
      const html = page(item.id);
      for (const m of html.matchAll(/<div class="ency-recipe" id="recipe-([^"]+)">[\s\S]*?<p class="ency-chips">([\s\S]*?)<\/p>/g)) {
        const r = recipes[m[1]];
        const c = costs.recipeCosts(r);
        rows += 1;
        assert.ok(m[2].includes(c.energy ? `${c.energy.toLocaleString('en-US')} energy each` : 'no energy'), `${item.id} ${m[1]}: energy`);
        assert.ok(m[2].includes(c.time), `${item.id} ${m[1]}: ${c.time}`);
        assert.equal((m[2].match(/<span>needs /g) || []).length, c.skills.length, `${item.id} ${m[1]}: skills`);
      }
    }
    assert.ok(rows > 300, `${rows} recipe rows`);
  });

  it('works the figures out as the Make panel does', () => {
    const slaw = Object.values(recipes).find((r) => r.name === 'Simple Slaw');
    const c = costs.recipeCosts(slaw);
    assert.deepEqual(c.skills, ['ezcooking_2'], 'EZ Cooking I is part of II');
    // EZ Cooking II halves the energy and the wait (makingSkillAdjustments).
    assert.equal(c.energy, making.makingSkillAdjustments(slaw, ['ezcooking_1', 'ezcooking_2']).energyCost);
    assert.equal(c.time, `${secondsText(making.craftDurationFor(slaw, ['ezcooking_1', 'ezcooking_2']))} each`);
    const salt = Object.values(recipes).find((r) => r.tool === 'spice_mill');
    assert.equal(costs.recipeCosts(salt).better, 'spicemilling_1', 'a transmogrifier works unskilled, slower');
    assert.match(costs.recipeCosts(salt).time, /^2 seconds each, quicker after 5$/);
    const block = Object.values(recipes).find((r) => r.tool === 'blockmaker');
    assert.equal(costs.recipeCosts(block).time, `${secondsText(block.waitMs)} each, plus 2.2 seconds a batch`);
    assert.equal(secondsText(700), '0.7 seconds');
    assert.equal(secondsText(90000), '1 minute 30 seconds');
  });

  it('gives the tiles under What it is for the same line', () => {
    assert.match(page('apple'), /ency-tile-sub">with Knife &amp; Board, EZ Cooking II, 2 energy, 1 s each</);
  });
});

describe('selling', () => {
  it('shows what a vendor pays beside the price, as js/vendor.js works it out', () => {
    assert.match(page('apple'), /<span>sells for <b>3<\/b>/);
    assert.equal(vendor.vendorSellValue('apple', 1, { buyMultiplier: 0.66 }).unit, 3);
    assert.match(page('pick'), /<dt>Sells for<\/dt><dd>[\d,]+ currants \([\d,]+ at the Tool Vendor\)<\/dd>/);
    let cards = 0;
    for (const item of inRemake) {
      const html = page(item.id);
      const sold = /<span>sells for <b>([\d,]+)<\/b>/.exec(html);
      if (sold) assert.equal(Number(sold[1].replace(/,/g, '')), costs.sellPrice(item.id)?.usual, item.id);
      // Each store card adds what that store pays for one (the Sno Cone Vendor and the Fox Ranger buy nothing back).
      for (const v of item.sold) {
        const pays = sold ? costs.sellAt(item.id, v) : 0;
        if (pays) { cards += 1; assert.ok(html.includes(`<span class="ency-sell">sell for ${pays.toLocaleString('en-US')}</span>`), `${item.id} at ${v}`); }
      }
    }
    assert.ok(cards > 100, `${cards} store cards with a sell price`);
    assert.equal(costs.sellAt('fox_brush', 'fox_ranger'), 0);
  });

  it('never prices what the remake won’t buy', () => {
    for (const id of ['emblem_alph', 'artifact_wooden_apple', 'hogtied_piggy', 'contraband', 'icon_alph']) {
      assert.equal(costs.sellPrice(id), null, id);
      if (existsSync(join(items, id))) assert.ok(!page(id).includes('sells for'), id);
    }
  });

  it('names every `sellable: false` the remake sets', () => {
    const files = [];
    const walk = (dir) => {
      for (const d of readdirSync(dir, { withFileTypes: true })) {
        if (d.isDirectory()) walk(join(dir, d.name));
        else if (d.name.endsWith('.js')) files.push(join(dir, d.name));
      }
    };
    walk(join(pub, 'js'));
    files.push(join(pub, 'game.js'));
    const counts = {};
    for (const f of files) {
      const n = (readFileSync(f, 'utf8').match(/sellable: false/g) || []).length;
      if (n) counts[f.slice(pub.length + 1)] = n;
    }
    const want = Object.fromEntries(Object.keys(NOT_SELLABLE).map((f) => [f, NOT_SELLABLE_FLAGS[f] || 1]));
    assert.deepEqual(counts, want);
  });
});

describe('the header', () => {
  it('shows the stack size in the header, and the price', () => {
    assert.match(page('apple'), /<span class="ency-chip cat-stack"><span>stacks to <b>100<\/b>/);
    const header = (id) => page(id).slice(0, page(id).indexOf('</header>'));
    for (const item of data.items.slice(0, 200)) {
      const sm = /<dt>Stacks to<\/dt><dd>([\d,]+)<\/dd>/.exec(page(item.id));
      if (sm && sm[1] !== '1') assert.ok(header(item.id).includes(`stacks to <b>${sm[1]}</b>`), item.id);
    }
  });
});
