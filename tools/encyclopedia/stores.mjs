/**
 * The encyclopedia's Stores section (Austin 2026-11-05): one page per kind of store,
 * at /encyclopedia/stores/<store key>/, with what it sells at what price and every
 * street that has one, linked to the Streets pages. loadEncyclopedia (data.mjs) calls
 * addStores after addStreets; build.mjs draws each page with storePage (the section's
 * list is the shared section index).
 *
 * Sources: js/store-catalog.js (Tiny Speck's catalog_stores.js: the stock and its
 * prices) through js/vendor.js VENDOR_PROFILES (the remake's buy and sell-back prices and
 * its one-line shop blurbs), and js/vendor-npcs.js (the stores a vendor of its own keeps:
 * Tiny Speck's description of the vendor and its buy tooltip). A street has a store when
 * the remake puts one there: its Street Spirit's (streets.mjs, as game.js picks it) or a
 * vendor standing on it (street-ecology.json `vendors`).
 */
import { join } from 'node:path';
import { esc, fmt } from './parts.mjs';

const PUB = join(import.meta.dirname, '..', '..', 'public');
const mod = (name) => import(join(PUB, 'js', name));

export const storesSection = { key: 'stores', label: 'Stores', one: 'store', css: 'encyclopedia/streets.css', blurb: 'Every kind of store: what it sells, at what price, and the streets that have one.' };

/** An entry `stores:<key>` per store in js/vendor.js VENDOR_PROFILES. */
export async function addStores(d, { itemIcon, portrait }) {
  const [vendor, npcs, stores] = await Promise.all([mod('vendor.js'), mod('vendor-npcs.js'), mod('store-catalog.js')]);
  const keyOfId = new Map(stores.STORE_CATALOG.map((s) => [s.storeId, s.key]));
  const keeperOf = new Map(Object.entries(npcs.VENDOR_NPCS).map(([cls, v]) => [keyOfId.get(v.storeId), cls]));
  const streetsOf = new Map();
  for (const e of d.entries.values()) {
    if (e.section !== 'streets') continue;
    for (const key of new Set([e.street.store, ...e.street.npcStores.map((v) => v.store)].filter(Boolean))) (streetsOf.get(key) || streetsOf.set(key, []).get(key)).push(e.key);
  }
  for (const p of Object.values(vendor.VENDOR_PROFILES)) {
    const keeper = keeperOf.get(p.key) || null;
    const npc = keeper ? npcs.VENDOR_NPCS[keeper] : null;
    const streets = streetsOf.get(p.key) || [];
    d.entries.set(`stores:${p.key}`, {
      key: `stores:${p.key}`, section: 'stores', id: p.key, name: p.label, status: 'source', register: '', refs: [],
      group: keeper ? 'Kept by a vendor of their own' : 'Kept by Street Spirits',
      icon: (keeper && portrait(keeper)) || itemIcon('street_spirit'),
      desc: p.desc,
      shop: {
        key: p.key, offers: p.offers.filter((o) => o.classTsid), keeper, keeperDesc: npc?.desc || '', buyTooltip: npc?.buyTooltip || '',
        streets, person: d.stores.get(p.key) || null,
      },
    });
  }
  d.storeStreets = (key) => streetsOf.get(key)?.length || 0;
}

/** One store's page body (build.mjs wraps it in the page frame and the pager). */
export function storePage(e, P, { info, kit }) {
  const s = e.shop;
  const { band, sub } = kit;
  const sells = s.offers.map((o) => P.tile(`item:${o.classTsid}`, { name: info(`item:${o.classTsid}`) ? '' : o.label, sub: P.currants(o.buyPrice) }));
  const byPlace = new Map();
  for (const k of s.streets) { const st = info(k); (byPlace.get(st.street.place) || byPlace.set(st.street.place, []).get(st.street.place)).push(st); }
  const places = [...byPlace.keys()].sort((a, b) => info(a).name.localeCompare(info(b).name, 'en', { sensitivity: 'base' }));
  const where = places.map((pk) => `<div class="st-region"><h3><a href="${P.href(pk)}">${esc(info(pk).name)}</a> <span class="count">${fmt(byPlace.get(pk).length)}</span></h3>${P.chips(byPlace.get(pk).sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' })).map((st) => P.chip(esc(st.name), { link: P.href(st.key), cls: 'ency-place' })))}</div>`).join('\n        ');
  const person = s.person && info(s.person) ? P.tiles([P.tile(s.person, { sub: s.keeper ? 'keeps it' : 'a Street Spirit keeps it' })]) : '';
  const original = s.keeper
    ? `<div class="cat-desc"><p>${esc(s.keeperDesc)}</p></div>${s.buyTooltip ? `<p class="ency-talk">${esc(s.buyTooltip)}</p>` : ''}<p class="cat-source">In Tiny Speck’s words, from their game code. The line below is the remake’s.</p>`
    : '<p class="cat-desc">A Street Spirit keeps this store: the stock is Tiny Speck’s, from their store catalog. The line below is the remake’s.</p>';
  return `${kit.entryHead(e, P, { subline: esc(s.keeper ? 'Store, kept by its vendor' : 'Store, kept by a Street Spirit') })}
  <main>
${band('about-h', 'About this store', `${original}<p>${esc(e.desc)}</p>${person ? sub('Who keeps it', person) : ''}`)}
${band('sells-h', 'What it sells', P.tiles(sells, 'ency-shop'), { alt: true, lead: 'Prices in currants, as the remake sells them before Imagination upgrades. It buys back what you sell it too.' })}
${band('where-h', 'Where to find one', s.streets.length ? `<p class="ency-lead-small">On ${fmt(s.streets.length)} street${s.streets.length === 1 ? '' : 's'} in ${fmt(places.length)} region${places.length === 1 ? '' : 's'}.</p>\n        ${where}` : '<p class="cat-muted">No street in the remake has one.</p>')}
  </main>`;
}
