/**
 * Blank stubs (Austin 2026-11-03: "leave the blank pages out of the
 * encyclopedia"): an entry that was never in the remake, has no art, no
 * description and nothing else on its page is left out of every section
 * (tools/encyclopedia/data.mjs isBlankStub). No page for it, no search row, no
 * count, and nothing built links to where its page was.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { INVENTORY_DB } from '../tools/catalog/build.mjs';
import { BUILT_SECTIONS, SECTIONS, hasWords, isBlankStub, loadEncyclopedia } from '../tools/encyclopedia/data.mjs';
import { STATUS, inRemake, pathOf } from '../tools/encyclopedia/parts.mjs';

const spike = join(import.meta.dirname, '..');
const pub = join(spike, 'public');
const read = (rel) => readFileSync(join(pub, rel), 'utf8');
const skipWithoutInventory = existsSync(INVENTORY_DB) ? false : `needs the coverage inventory at ${INVENTORY_DB}`;
const d = skipWithoutInventory ? null : await loadEncyclopedia();
const search = JSON.parse(read('encyclopedia/search.json'));
const catalog = JSON.parse(read('encyclopedia/items/data.json'));

/** Kitty as the rule sees it: never finished, nothing of its own. */
const KITTY = { id: 'npc_kitty', name: 'Kitty', status: 'unbuilt_original', art: false, desc: '', content: false, linked: false, used: false, placed: false };

describe('blank stubs', () => {
  it('leaves out an entry only when every part of the rule holds', () => {
    assert.equal(isBlankStub(KITTY), true);
    for (const status of ['missing', 'lost']) assert.equal(isBlankStub({ ...KITTY, status }), true, status);
    // Any one thing to show keeps the page.
    for (const status of ['source', 'multiplayer', 'partial', 'rebuilt', 'reimagined', 'solo']) assert.equal(isBlankStub({ ...KITTY, status }), false, status);
    for (const key of ['art', 'content', 'linked', 'used', 'placed']) assert.equal(isBlankStub({ ...KITTY, [key]: true }), false, key);
    assert.equal(isBlankStub({ ...KITTY, desc: 'A small furry cat that never made it out of the lab.' }), false, 'a description');
  });

  it('counts a description only when it says more than the name', () => {
    assert.equal(hasWords('', 'Kitty'), false);
    assert.equal(hasWords('<b>Kitty</b>.', 'Kitty'), false);
    assert.equal(hasWords('quest map', 'quest_map', 'quest_map'), false);
    assert.equal(hasWords('A <i>boldly</i> red apple.', 'Apple'), true);
  });

  it('leaves out Kitty, and keeps the Heli Kitty everyone meets', { skip: skipWithoutInventory }, () => {
    assert.ok(d.stubs.has('animals:npc_kitty'));
    assert.ok(!d.entries.has('animals:npc_kitty'));
    assert.ok(d.entries.has('animals:npc_kitty_chicken'));
    assert.ok(existsSync(join(pub, 'encyclopedia/animals/npc_kitty_chicken/index.html')));
    // The quest that names it keeps the name, as plain text.
    const quest = read('encyclopedia/quests/greedy_street_spirit/index.html');
    assert.match(quest, /<li>Offered by Kitty\.<\/li>/);
  });

  it('keeps every entry that is in the remake or has art', { skip: skipWithoutInventory }, () => {
    for (const s of d.stubs.values()) {
      assert.ok(!inRemake(s.status), `${s.key} is in the remake`);
      if (s.section === 'items') assert.ok(!existsSync(join(pub, 'assets/sprites/icons', `${s.id}.png`)), `${s.key} has an icon`);
    }
    assert.ok(d.stubs.size < 40, `${d.stubs.size} stubs: the rule is leaving out too much`);
  });

  it('builds no page, search row or catalog row for a stub', { skip: skipWithoutInventory }, () => {
    assert.ok(d.stubs.size > 0);
    const rows = new Set(search.entries.map((x) => `${x.s}:${x.id}`));
    const catalogIds = new Set(catalog.items.map((i) => i.id));
    for (const s of d.stubs.values()) {
      assert.ok(!existsSync(join(pub, pathOf(s.key))), `${s.key} still has a page`);
      assert.ok(!rows.has(`${s.section}:${s.id}`), `${s.key} is in search.json`);
      if (s.section === 'items') assert.ok(!catalogIds.has(s.id), `${s.id} is in the catalog data`);
    }
  });

  it('links no built page to where a stub page was', { skip: skipWithoutInventory }, () => {
    const gone = [...d.stubs.values()].map((s) => pathOf(s.key));
    const files = [];
    const walk = (rel) => {
      for (const x of readdirSync(join(pub, rel), { withFileTypes: true })) {
        if (x.isDirectory()) { if (x.name !== 'assets') walk(rel ? `${rel}/${x.name}` : x.name); } else if (/\.(html|json)$/.test(x.name)) files.push(rel ? `${rel}/${x.name}` : x.name);
      }
    };
    walk('');
    assert.ok(files.length > 2000, `${files.length} files`);
    for (const f of files) {
      const text = read(f);
      for (const g of gone) assert.ok(!text.includes(g), `${f} links ${g}`);
    }
  });

  it('keeps every count in step with the pages', { skip: skipWithoutInventory }, () => {
    const home = read('encyclopedia/index.html');
    const card = (label) => Number(new RegExp(`ency-card-name">${label} <span class="count">([\\d,]+)</span>`).exec(home)?.[1].replace(/,/g, ''));
    const SECTION_LABEL = Object.fromEntries(SECTIONS.map((s) => [s.key, s.label]));
    for (const sec of BUILT_SECTIONS) {
      // Music and sounds keeps its Still missing list beside the entries (tests/encyclopedia-sounds.test.js counts it).
      const pages = readdirSync(join(pub, 'encyclopedia', sec), { withFileTypes: true }).filter((x) => x.isDirectory() && !(sec === 'sounds' && x.name === 'still-missing')).length;
      const rows = search.entries.filter((x) => x.s === sec);
      assert.equal(card(SECTION_LABEL[sec]), pages, `${sec}: home card`);
      assert.equal(rows.length, pages, `${sec}: search rows`);
      if (sec === 'sounds') continue;
      const index = read(`encyclopedia/${sec}/index.html`);
      const inCount = rows.filter((x) => inRemake(x.st)).length;
      assert.match(index, new RegExp(`<strong>${inCount.toLocaleString('en-US')}</strong> of ${pages.toLocaleString('en-US')} are in the remake`), sec);
    }
    // Items: the home card, the catalog page, its data and the search all count the same items.
    const itemPages = readdirSync(join(pub, 'encyclopedia/items'), { withFileTypes: true }).filter((x) => x.isDirectory()).length;
    const itemRows = search.entries.filter((x) => x.s === 'items');
    assert.equal(catalog.counts.listed, itemPages);
    assert.equal(itemRows.length, itemPages);
    assert.equal(card('Items'), itemPages);
    const itemsIn = itemRows.filter((x) => inRemake(x.st)).length;
    assert.equal(catalog.counts.inRemake, itemsIn);
    assert.match(home, new RegExp(`Every item, how to get it and what it is for\\. ${itemsIn.toLocaleString('en-US')} are in the remake\\.`));
    assert.match(read('encyclopedia/items/index.html'), new RegExp(`<strong>${itemsIn.toLocaleString('en-US')}</strong> of ${itemPages.toLocaleString('en-US')} items are in the remake`));
    assert.match(read('encyclopedia/items/index.html'), new RegExp(`So are ${catalog.counts.stubs} items that were never finished`));
    // The list's own "N of them in the remake" counts the same statuses (public/encyclopedia/items/catalog.js).
    const set = /const IN_REMAKE = new Set\((\[[^\]]*\])\)/.exec(read('encyclopedia/items/catalog.js'))?.[1];
    assert.ok(set, 'catalog.js IN_REMAKE');
    // The sounds' own statuses (snd_*) never reach the item list.
    assert.deepEqual(JSON.parse(set.replace(/'/g, '"')).sort(), Object.keys(STATUS).filter((k) => inRemake(k) && !k.startsWith('snd_')).sort());
  });
});
