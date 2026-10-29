/**
 * The Item Catalog (tools/catalog/build.mjs -> public/items/): one page per
 * non-excluded GSJS item, statuses straight from the coverage inventory, every
 * link resolving, the shared site header, and the built files current.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { GSJS, INVENTORY_DB, readInventory } from '../tools/catalog/build.mjs';
import { siteNav } from '../tools/changelog/build.mjs';
import { committedMap, keyAssetUrls } from '../tools/data-versions/build.mjs';
import { servedByMinn } from './minn-served.js';

const spike = join(import.meta.dirname, '..');
const pub = join(spike, 'public');
const items = join(pub, 'items');
const data = JSON.parse(readFileSync(join(items, 'data.json'), 'utf8'));
// The coverage inventory is a research file beside the repo (research/coverage/inventory.sqlite), not in it.
const skipWithoutInventory = existsSync(INVENTORY_DB) ? false : `needs the coverage inventory at ${INVENTORY_DB}`;
const inventory = skipWithoutInventory ? new Map() : readInventory();
const gsjsIds = readdirSync(join(GSJS, 'items')).filter((f) => f.endsWith('.js')).map((f) => f.slice(0, -3));
const listed = gsjsIds.filter((id) => inventory.has(id) && inventory.get(id).status !== 'excluded');
const excluded = gsjsIds.filter((id) => inventory.get(id)?.status === 'excluded');
const pages = data.items.map((i) => ({ id: i.id, file: `items/${i.id}/index.html`, html: readFileSync(join(items, i.id, 'index.html'), 'utf8') }));
const index = { id: '', file: 'items/index.html', html: readFileSync(join(items, 'index.html'), 'utf8') };
const musicCards = new Set(JSON.parse(readFileSync(join(pub, 'musicblocks', 'data.json'), 'utf8')).sets.flatMap((s) => s.blocks.map((b) => b.id)));
/** Built sections of the site that Minn serves without a file (tests/minn-served.js, plus the Musicblocks page). */
const minnServed = (ref) => servedByMinn(ref) || /(^|\/)musicblocks\/$/.test(ref.replace(/#.*$/, ''));

describe('item catalog', () => {
  it('has a page for every GSJS item the inventory does not exclude, and none for excluded ones', { skip: skipWithoutInventory }, () => {
    assert.ok(listed.length > 900, `only ${listed.length} items listed`);
    assert.deepEqual(data.items.map((i) => i.id).sort(), [...listed].sort());
    for (const id of listed) assert.ok(existsSync(join(items, id, 'index.html')), id);
    for (const id of excluded) assert.ok(!existsSync(join(items, id)), `excluded ${id} has a page`);
    assert.equal(data.counts.excluded, excluded.length);
    assert.equal(data.counts.listed, listed.length);
    // GSJS non-items (NPCs, include/, catalogs) are not in the inventory's item list at all.
    assert.ok(!data.items.some((i) => /^npc_/.test(i.id) && !inventory.has(i.id)));
  });

  it('has a status for every item the inventory marks, multiplayer included', () => {
    const keys = new Set(data.statuses.map((s) => s.key));
    assert.ok(keys.has('multiplayer'));
    for (const item of data.items) assert.ok(keys.has(item.status), `${item.id}: ${item.status}`);
  });

  it('shows the inventory status of each item, on the list and on its page', { skip: skipWithoutInventory }, () => {
    const labels = Object.fromEntries(data.statuses.map((s) => [s.key, s.label]));
    for (const item of data.items) {
      const inv = inventory.get(item.id);
      assert.equal(item.status, inv.status, item.id);
      const html = pages.find((p) => p.id === item.id).html;
      assert.match(html, new RegExp(`<span class="pill st-${item.status}">${labels[item.status]}</span>`), item.id);
      if (inv.register) assert.ok(html.includes(`Register row ${inv.register}`), `${item.id} register ${inv.register}`);
    }
    for (const key of Object.keys(data.counts.byStatus)) {
      assert.equal(data.counts.byStatus[key], data.items.filter((i) => i.status === key).length, key);
    }
    assert.match(index.html, new RegExp(`<strong>${data.counts.byStatus.source.toLocaleString('en-US')}</strong> of ${data.counts.listed.toLocaleString('en-US')} items are in the remake`));
  });

  it('gives every item in the remake a way to get it, and none to the rest', () => {
    for (const item of data.items) {
      if (item.status === 'source') assert.ok(item.get.length, `${item.id} has no way to get it`);
      else assert.deepEqual(item.get, [], item.id);
    }
  });

  it('resolves every link: items, recipes, vendors, Musicblocks and the rest of the site', () => {
    const vendors = new Set(data.vendors.map((v) => v.key));
    const recipeIds = new Map();
    const idsOf = (html) => new Set([...html.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]));
    let recipeLinks = 0;
    let vendorLinks = 0;
    for (const page of [index, ...pages]) {
      for (const [, href] of page.html.matchAll(/ (?:href|src)="([^"]+)"/g)) {
        if (/^https?:/.test(href)) continue;
        const sold = /^\.\.\/\?sold=([a-z0-9_]+)$/.exec(href);
        if (sold) { vendorLinks += 1; assert.ok(vendors.has(sold[1]), `${page.file}: vendor ${sold[1]}`); continue; }
        const music = /musicblocks\/#([a-z0-9_]+)$/.exec(href);
        if (music) { assert.ok(musicCards.has(music[1]), `${page.file}: ${href}`); continue; }
        if (minnServed(href)) continue;
        const [path, hash] = href.replace(/\?[^#]*/, '').split('#');
        const target = resolve(pub, page.file, '..', path);
        const file = path.endsWith('/') || path === '' ? join(target, 'index.html') : target;
        assert.ok(existsSync(file), `${page.file}: ${href}`);
        if (hash) {
          if (!recipeIds.has(file)) recipeIds.set(file, idsOf(readFileSync(file, 'utf8')));
          assert.ok(recipeIds.get(file).has(hash), `${page.file}: ${href} (no #${hash})`);
          if (hash.startsWith('recipe-')) recipeLinks += 1;
        }
      }
    }
    assert.ok(recipeLinks > 300, `only ${recipeLinks} recipe links`);
    assert.ok(vendorLinks > 100, `only ${vendorLinks} vendor links`);
  });

  it('links each Musicblock to the Musicblocks page', () => {
    for (const item of data.items.filter((i) => i.category === 'Musicblocks')) {
      assert.match(pages.find((p) => p.id === item.id).html, /href="\.\.\/\.\.\/musicblocks\/(#[a-z0-9_]+)?"/, item.id);
    }
  });

  it('uses only shipped icons and a placeholder for items without art', () => {
    for (const item of data.items) {
      const html = pages.find((p) => p.id === item.id).html;
      if (item.icon) {
        assert.ok(existsSync(join(pub, 'assets/sprites/icons', `${item.id}.png`)), item.id);
        assert.match(html, new RegExp(`src="\\.\\./\\.\\./assets/sprites/icons/${item.id}${item.icon === 3 ? '@3x' : ''}\\.png\\?v=[0-9a-f]{8}"`), item.id);
      } else {
        assert.match(html, /<span class="cat-hero-icon cat-ph" aria-hidden="true"><\/span>/, item.id);
      }
    }
  });

  it('carries the shared site header on every page', () => {
    for (const page of [index, ...pages]) {
      const p = page === index ? '../' : '../../';
      // The header's mark carries its content key, as every image on the page does (keyAssetUrls).
      assert.ok(page.html.includes(keyAssetUrls(siteNav(p, 'items'), page.file, committedMap())), page.file);
      assert.ok(page.html.includes(`<link rel="stylesheet" href="${p}site/site-nav.css" />`), page.file);
      assert.ok(page.html.indexOf('<nav class="site-nav"') < page.html.indexOf('<header'), page.file);
    }
  });

  it('writes no em-dashes in its own words', () => {
    const own = readFileSync(join(spike, 'tools/catalog/build.mjs'), 'utf8') + readFileSync(join(items, 'catalog.js'), 'utf8');
    assert.ok(!own.includes('—'), 'em-dash in tools/catalog/build.mjs or public/items/catalog.js');
    assert.ok(!index.html.includes('—'), 'em-dash on the catalog page');
  });

  it('is current (node tools/catalog/build.mjs --check)', { skip: skipWithoutInventory }, () => {
    const run = spawnSync(process.execPath, [join(spike, 'tools/catalog/build.mjs'), '--check'], { encoding: 'utf8' });
    assert.equal(run.status, 0, run.stderr || run.stdout);
  });
});
