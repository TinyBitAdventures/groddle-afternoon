/**
 * G1074 (report #564, Austin 2026-11-20): each store has an icon, one item it sells, in one shared
 * map (js/store-icons.js) that the vendor finder (the panel from the currants) and the
 * Encyclopedia's Sold by filter both read. The vendor finder's rows show it as the favor panel's
 * Giants show their shrine symbols (#563); the Sold by filter shows it for every store a Street
 * Spirit keeps, where it showed the same Street Spirit beside each one.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { STORE_ICON_ITEMS, storeIconItem, storeIconUrl } from '../public/js/store-icons.js?v=94487095';
import { STORE_CATALOG } from '../public/js/store-catalog.js?v=c6ebb2bd';
import { VENDOR_PROFILES } from '../public/js/vendor.js?v=474a80fd';
import { vendorFinderRows, vendorKinds } from '../public/js/vendor-finder.js?v=7fbfc51d';
import { vendorIcon } from '../tools/catalog/build.mjs';

const PUB = new URL('../public/', import.meta.url);
const read = (rel) => readFileSync(new URL(rel, PUB), 'utf8');

describe('G1074: every store has an icon item it sells (js/store-icons.js)', () => {
  it('every store in the catalog has one, and the store sells it', () => {
    for (const store of STORE_CATALOG) {
      const cls = storeIconItem(store.key);
      assert.ok(cls, `${store.label} (${store.key}) has an icon item`);
      assert.ok(store.offers.some((o) => o.classTsid === cls), `${store.label} sells ${cls}`);
      assert.ok(VENDOR_PROFILES[store.key].offers.some((o) => o.classTsid === cls), `the game's ${store.label} offers ${cls}`);
    }
  });

  it('names no store the catalog does not have', () => {
    const keys = new Set(STORE_CATALOG.map((s) => s.key));
    for (const key of Object.keys(STORE_ICON_ITEMS)) assert.ok(keys.has(key), key);
  });

  it('each is the pack icon the game already shows, with its 3x render', () => {
    for (const store of STORE_CATALOG) {
      const url = storeIconUrl(store.key);
      assert.equal(url, `assets/sprites/icons/${storeIconItem(store.key)}.webp`);
      assert.ok(existsSync(new URL(url, PUB)), url);
      assert.ok(existsSync(new URL(url.replace(/\.webp$/, '@3x.webp'), PUB)), `${url} @3x`);
    }
    assert.equal(storeIconUrl('nowhere'), '');
  });

  it('the starter stores show the starter items the ruling named', () => {
    assert.equal(STORE_ICON_ITEMS.groceries, 'bun');
    assert.equal(STORE_ICON_ITEMS.kitchen, 'knife_and_board');
    assert.equal(STORE_ICON_ITEMS.gardening, 'watering_can');
  });
});

describe('G1074: the vendor finder shows each store\'s icon', () => {
  const ecology = JSON.parse(read('assets/content/street-ecology.json'));
  const index = JSON.parse(read('assets/streets/index.json'));

  it('every kind and every row carries its store\'s icon', () => {
    const kinds = vendorKinds(ecology, index);
    assert.ok(kinds.length >= 14);
    for (const k of kinds) assert.equal(k.icon, storeIconUrl(k.key), k.key);
    const rows = vendorFinderRows(kinds, { here: 'GLI2V0UN7RD1T2J', find: () => null });
    for (const r of rows) assert.equal(r.icon, storeIconUrl(r.key), r.key);
    assert.equal(rows[0].icon, 'assets/sprites/icons/bun.webp', 'the starter street\'s Groceries Vendor');
  });

  it('the panel draws it before the name, in the favor rows\' 20 px box, Modern and Classic', () => {
    const topbar = read('js/ui/topbar.js');
    assert.match(topbar, /\(r\.icon \? `<img src="\$\{esc\(r\.icon\)\}" alt="" width="20" height="20" \/>` : '<span class="vf-noic" aria-hidden="true"><\/span>'\)\n\s+\+ `<span class="vf-name">/);
    const style = read('style.css');
    assert.match(style, /\.vf-row \{\n\s+display: grid; grid-template-columns: 20px max-content minmax\(0, 1fr\);/);
    assert.match(style, /\[data-ui="modern"\] \.vf-row img \{ width: 20px; height: 20px; object-fit: contain; justify-self: center; \}/);
    assert.match(style, /\[data-ui="modern"\] \.favor-row img \{ width: 20px; height: 20px; object-fit: contain; justify-self: center; \}/, 'the same box as the Giants\' rows');
    assert.match(read('css/classic.css'), /#vendor-finder-pop :is\(\.vf-row img, \.vf-noic\) \{ flex: none; width: calc\(20 \* var\(--cu\)\); height: calc\(20 \* var\(--cu\)\);/);
  });
});

describe('G1074: the Encyclopedia\'s Sold by filter shows the same icons', () => {
  it('a store a Street Spirit keeps shows its icon item; a vendor with its own face keeps its picture', () => {
    const ency = {
      stores: new Map([['groceries', 'people:vendor-groceries'], ['liquor', 'people:npc_jabba2'], ['fox_ranger', 'people:npc_fox_ranger']]),
      entries: new Map([
        ['people:vendor-groceries', { icon: { src: 'assets/sprites/icons/street_spirit.webp' } }],
        ['people:npc_jabba2', { icon: { src: 'assets/sprites/encyclopedia/npc_jabba2.webp' } }],
        ['people:npc_fox_ranger', { icon: { src: 'assets/sprites/encyclopedia/npc_fox_ranger.webp' } }],
      ]),
    };
    assert.equal(vendorIcon('groceries', ency, storeIconUrl), 'assets/sprites/icons/bun.webp');
    assert.equal(vendorIcon('liquor', ency, storeIconUrl), 'assets/sprites/encyclopedia/npc_jabba2.webp');
    assert.equal(vendorIcon('fox_ranger', ency, storeIconUrl), 'assets/sprites/encyclopedia/npc_fox_ranger.webp');
  });

  it('the built page: no store shows the generic Street Spirit, and each Street Spirit store shows its icon item', () => {
    const page = read('encyclopedia/items/index.html');
    const select = /<select id="sold">([\s\S]*?)<\/select>/.exec(page)?.[1] || '';
    assert.doesNotMatch(select, /icons\/street_spirit\.webp/);
    for (const key of ['produce', 'hardware', 'gardening', 'kitchen', 'groceries', 'alchemical', 'animal', 'mining', 'toys', 'bags']) {
      assert.match(select, new RegExp(`<option value="${key}" data-icon="\\.\\./\\.\\./${storeIconUrl(key).replace(/\./g, '\\.')}"`), key);
    }
    // The vendor NPCs keep their own art.
    assert.match(select, /<option value="sno_cone" data-icon="\.\.\/\.\.\/assets\/sprites\/encyclopedia\/npc_sno_cone_vending_machine\.webp"/);
    assert.match(select, /<option value="gardening_tools" data-icon="\.\.\/\.\.\/assets\/sprites\/encyclopedia\/npc_gardening_vendor\.webp"/);
  });
});
