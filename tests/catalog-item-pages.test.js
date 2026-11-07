/**
 * Item page quality (lane enc-items, Austin 2026-11-05): "What it is for" on
 * every item in the remake (tools/catalog/uses.mjs, uses.json), each recipe's
 * skills, energy and time (tools/catalog/costs.mjs), what a vendor pays beside
 * the price, the larger picture at the top (tools/catalog/hero.mjs) and the
 * stack size in the header.
 * Run: node --test tests/catalog-item-pages.test.js
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { HERO_BOX, MAX_BYTES, MAX_UPSCALE, imageSize, loadHero } from '../tools/catalog/hero.mjs';
import { NOT_SELLABLE, NOT_SELLABLE_FLAGS, loadCosts, secondsText } from '../tools/catalog/costs.mjs';
import { loadUses, readCurated } from '../tools/catalog/uses.mjs';

const spike = join(import.meta.dirname, '..');
const pub = join(spike, 'public');
const items = join(pub, 'encyclopedia', 'items');
const data = JSON.parse(readFileSync(join(items, 'data.json'), 'utf8'));
const page = (id) => readFileSync(join(items, id, 'index.html'), 'utf8');
const inRemake = data.items.filter((i) => i.status === 'source');
const recipes = JSON.parse(readFileSync(join(pub, 'assets/content/recipes.json'), 'utf8'));
const costs = await loadCosts(spike);
const making = await import('../public/js/making.js?v=704da2eb');
const vendor = await import('../public/js/vendor.js?v=70577b0b');
const pack = await import('../public/js/pack-slots.js?v=a94b816c');
const storage = await import('../public/js/home-storage.js?v=121f1897');
const unescape = (s) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"');
/** The "What it is for" list of a page, as plain lines. */
const forLines = (html) => {
  const at = html.indexOf('<h3 class="cat-for">');
  if (at < 0) return null;
  const end = html.indexOf('</section>', at);
  return [...html.slice(at, end).matchAll(/<li(?: class="cat-none")?>([\s\S]*?)<\/li>/g)].map((m) => unescape(m[1].replace(/<[^>]+>/g, '')));
};

describe('What it is for', () => {
  it('has a section on every item in the remake', () => {
    const empty = inRemake.filter((i) => !page(i.id).includes('<h3 class="cat-for">What it is for</h3>'));
    assert.deepEqual(empty.map((i) => i.id), []);
  });

  it('says plainly when the remake has no use for it, on few pages, never as a guess', () => {
    const none = inRemake.filter((i) => page(i.id).includes('class="cat-none"'));
    const curatedNone = new Set(Object.entries(readCurated()).filter(([, v]) => v.none).map(([k]) => k));
    // Every "no use" line is one a person checked (uses.json none), not the builder's default.
    assert.deepEqual(none.map((i) => i.id).filter((id) => !curatedNone.has(id)), []);
    assert.ok(none.length <= 40, `${none.length} items with no use`);
    assert.match(page('artifact_wooden_apple'), /A keepsake: the finished artifact has no use of its own/);
  });

  it('cites a remake file and line for every hand-written use, and the lines exist', () => {
    const curated = readCurated();
    for (const [id, v] of Object.entries(curated)) {
      assert.ok(v.lines?.length || v.none, `${id}: lines or none`);
      assert.ok(!JSON.stringify(v).includes('—'), `${id}: no em-dash`);
      assert.ok(!/\bGlitch\b/.test([...(v.lines || []), v.none || ''].join(' ')), `${id}: no trademark`);
      if (!v.lines?.length) continue;
      assert.ok(v.evidence?.length, `${id}: evidence`);
      for (const ev of v.evidence) {
        const m = /^(public\/[\w./-]+?\.(?:js|json)):(\d+)/.exec(ev);
        if (!m) continue;
        const file = join(spike, m[1]);
        assert.ok(existsSync(file), `${id}: ${m[1]}`);
        assert.ok(readFileSync(file, 'utf8').split('\n').length >= Number(m[2]), `${id}: ${m[1]}:${m[2]} is past the end`);
      }
      for (const line of v.lines) assert.ok(forLines(page(id)).includes(line), `${id}: "${line}" on its page`);
    }
  });

  it('takes bag and cabinet sizes, keys and Musicblock pay from the game itself', async () => {
    const lines = await loadUses(spike);
    assert.equal(lines('bag_bigger').lines[0], `It holds ${pack.BAG_DEFS.bag_bigger.capacity} stacks of almost anything in one pack slot; not another bag, furniture or Elements.`);
    assert.match(lines('bag_toolbox_red').lines[0], new RegExp(`holds ${pack.BAG_DEFS.bag_toolbox_red.capacity} tools`));
    assert.match(lines('bag_furniture_cabinet').lines.join(' '), new RegExp(`its ${storage.cabinetDef('bag_furniture_cabinet').capacity} slots`));
    // A key opens the doors whose key_id is its number (js/doors.js checkDoorEntry), and a trip uses one up.
    const key1 = lines('door_key_1').lines;
    assert.match(key1[0], /^Opens the locked doors from Doonboggle Trail \(Gentle Island\) to Ethereal Endeavour/);
    assert.equal(key1[1], 'Each trip through a locked door uses up one key.');
    assert.match(page('musicblock_sb_secret_01'), /The first time you hear this tune it pays 1,000 iMG\./);
    assert.match(page('furniture_chair'), /Set it on the floor of your house, or of a Tower floor, in Decorate mode\./);
  });
});

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

describe('the picture and the header', () => {
  it('draws the largest art the build has, no larger than the frame', async () => {
    const heroFor = await loadHero(spike);
    for (const item of data.items) {
      const m = /<div class="cat-hero-frame"><img class="cat-hero-icon cat-from-(icon|icon1x|standing)" src="\.\.\/\.\.\/\.\.\/([^"?]+)\?v=[0-9a-f]{8}" alt="" width="(\d+)" height="(\d+)"/.exec(page(item.id));
      if (!item.icon && !m) continue;
      assert.ok(m, item.id);
      const file = join(pub, m[2]);
      assert.ok(existsSync(file), `${item.id}: ${m[2]}`);
      assert.ok(Math.max(Number(m[3]), Number(m[4])) <= HERO_BOX, item.id);
      if (m[1] === 'standing') {
        assert.ok(readFileSync(file).length <= MAX_BYTES, item.id);
        const size = imageSize(file);
        assert.ok(Number(m[3]) <= Math.ceil(size.w * MAX_UPSCALE), `${item.id}: grown at most ${MAX_UPSCALE} times`);
      }
    }
    assert.equal(heroFor('furniture_chair', { w: 37, h: 48, hi: { w: 111, h: 144 } }).from, 'standing');
    assert.equal(heroFor('apple', { w: 38, h: 44, hi: { w: 114, h: 132 } }).from, 'icon');
    assert.match(page('furniture_bed'), /src="\.\.\/\.\.\/\.\.\/assets\/sprites\/furniture\/furniture_bed@3x\.webp\?v=/);
  });

  it('shows the stack size in the header, and the price', () => {
    assert.match(page('apple'), /<span class="ency-chip cat-stack"><span>stacks to <b>100<\/b>/);
    const header = (id) => page(id).slice(0, page(id).indexOf('</header>'));
    for (const item of data.items.slice(0, 200)) {
      const sm = /<dt>Stacks to<\/dt><dd>([\d,]+)<\/dd>/.exec(page(item.id));
      if (sm && sm[1] !== '1') assert.ok(header(item.id).includes(`stacks to <b>${sm[1]}</b>`), item.id);
    }
  });
});
