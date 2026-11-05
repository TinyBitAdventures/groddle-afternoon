/**
 * "Where to find it" on an item's page (Austin 2026-11-05): the Stores that sell it,
 * linked to their pages with how many streets have one, and for a resource, the
 * trees, rocks, animals and other things that give it, linked, with how many streets
 * have them. Its own part, so the item page template (tools/catalog/build.mjs) only
 * registers it.
 *
 * Who gives what comes from the remake's own rules: js/trants.js TRANT_META (a tree's
 * fruit), js/mining.js ROCK_CATALOG (a rock's chunks), js/resource-nodes.js (what each
 * node's verbs yield, its drop tables included), and the animals the item catalog's
 * harvests name (Piggy, Chicken, Butterfly, Batterfly, Fox). Street counts are the
 * Streets section's (streets.mjs d.streetsHaving).
 */
import { join } from 'node:path';
import { esc, fmt } from './parts.mjs';

const PUB = join(import.meta.dirname, '..', '..', 'public');
const mod = (name) => import(join(PUB, 'js', name));

/** Animal -> what you get from it (tools/catalog/build.mjs readRemake harvests). */
const ANIMAL_GIVES = { npc_piggy: ['meat'], npc_chicken: ['grain'], npc_butterfly: ['milk_butterfly'], npc_batterfly: ['guano'], npc_fox: ['fiber'] };

/** Fills d.sellers (item -> [{ store, price }]) and d.givers (item -> [class]). */
export async function addWhereToFind(d) {
  const [vendor, trants, mining, nodes] = await Promise.all([mod('vendor.js'), mod('trants.js'), mod('mining.js'), mod('resource-nodes.js')]);
  const push = (map, id, row) => { if (!map.has(id)) map.set(id, []); if (!map.get(id).some((x) => JSON.stringify(x) === JSON.stringify(row))) map.get(id).push(row); };
  const sellers = new Map();
  for (const p of Object.values(vendor.VENDOR_PROFILES)) for (const o of p.offers) if (o.classTsid) push(sellers, o.classTsid, { store: p.key, price: o.buyPrice });
  const givers = new Map();
  for (const [cls, t] of Object.entries(trants.TRANT_META)) push(givers, t.fruitClass, cls);
  for (const [cls, r] of Object.entries(mining.ROCK_CATALOG)) push(givers, r.chunkId, cls);
  push(givers, 'plank', 'wood_tree');
  for (const [cls, ids] of Object.entries(ANIMAL_GIVES)) for (const id of ids) push(givers, id, cls);
  const tableIds = (key, seen = new Set()) => {
    const out = new Set();
    if (seen.has(key) || !nodes.RESOURCE_DROP_TABLES[key]) return out;
    seen.add(key);
    for (const [, picks] of nodes.RESOURCE_DROP_TABLES[key]) for (const pick of picks) if (pick.classTsid) out.add(pick.classTsid);
    return out;
  };
  for (const [cls, node] of Object.entries(nodes.RESOURCE_NODE_CATALOG)) {
    for (const verb of node.verbs || []) {
      for (const y of verb.yields || []) {
        if (y.classTsid) push(givers, y.classTsid, cls);
        if (y.dropTable) for (const id of tableIds(y.dropTable)) push(givers, id, cls);
      }
    }
  }
  d.sellers = sellers;
  d.givers = givers;
}

/** The block for item `id`, or '' when nothing sells or gives it. P: the item page's parts. */
export function whereToFind(id, P, ency) {
  const stores = (ency.sellers?.get(id) || []).filter((s) => ency.entries.has(`stores:${s.store}`));
  const givers = (ency.givers?.get(id) || []).map((cls) => ({ cls, key: ency.keyOf(cls), n: ency.streetsHaving(cls) })).filter((g) => g.key && g.key !== `item:${id}` && (g.key.startsWith('item:') ? ency.items.has(g.key.slice(5)) : ency.entries.has(g.key)));
  if (!stores.length && !givers.length) return '';
  const streets = (n) => (n ? `on ${fmt(n)} street${n === 1 ? '' : 's'}` : 'on no street yet');
  const storeTiles = stores.map((s) => P.tile(`stores:${s.store}`, { sub: `${P.currants(s.price)}, ${esc(streets(ency.storeStreets(s.store)))}` }));
  const giverTiles = givers.sort((a, b) => b.n - a.n).map((g) => P.tile(g.key, { sub: esc(streets(g.n)) }));
  return [
    '<h3>Where to find it</h3>',
    storeTiles.length ? `<p class="ency-lead-small">Stores that sell it, with the price and how many streets have one.</p>\n        ${P.tiles(storeTiles)}` : '',
    giverTiles.length ? `<p class="ency-lead-small">What gives it, and how many streets have one.</p>\n        ${P.tiles(giverTiles)}` : '',
  ].filter(Boolean).join('\n        ');
}
