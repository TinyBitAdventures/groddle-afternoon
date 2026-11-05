/**
 * "Where to find it" on an item's page (Austin 2026-11-05): one block naming every
 * source of the item once. The Stores that sell it (price, how many streets have one),
 * the people who sell it from a store of their own, the trees, rocks, animals and other
 * things that give it (how you get it and how many streets have them), and the creatures
 * and people Tiny Speck's game had give it. It replaced the older "Creatures and people
 * that give it" list, which named the same animals again (Piggy on Meat, Chicken on
 * Grain). Its own part, so the item page template (tools/catalog/build.mjs) only
 * registers it.
 *
 * Who gives what comes from the remake's own rules: js/trants.js TRANT_META (a tree's
 * fruit), js/mining.js ROCK_CATALOG (a rock's chunks), js/resource-nodes.js (what each
 * node's verbs yield, its drop tables included), and the animals the item catalog's
 * harvests name (Piggy, Chicken, Butterfly, Batterfly, Fox). The creatures and people
 * come from Tiny Speck's own creature files (data.mjs readCreature `makes`, the
 * "gives" back links). Street counts are the Streets section's (streets.mjs
 * d.streetsHaving, stores.mjs d.storeStreets).
 */
import { join } from 'node:path';
import { esc, fmt } from './parts.mjs';

const PUB = join(import.meta.dirname, '..', '..', 'public');
const mod = (name) => import(join(PUB, 'js', name));

/** Animal -> [item, how you get it] (tools/catalog/build.mjs readRemake harvests). */
const ANIMAL_GIVES = {
  npc_piggy: [['meat', 'nibble it']],
  npc_chicken: [['grain', 'squeeze it']],
  npc_butterfly: [['milk_butterfly', 'milk it']],
  npc_batterfly: [['guano', 'feed it']],
  npc_fox: [['fiber', 'brush it']],
};

/**
 * Creatures and people Tiny Speck's creature files have give an item, `<class>><item>`
 * -> how, in our words from the verb or conversation that makes it. null: the file names
 * the item but it is not a way to get one, so it is left out:
 *  - npc_batterfly milk_butterfly: inherited from npc_butterfly; the Batterfly's own
 *    Milk verb (npc_batterfly.js verbs.milk) only says it was milked and gives nothing.
 *  - hell_bartender drink_ticket: grantWine only hands your own ticket back when your
 *    pack is too full for the wine.
 */
const GSJS_HOW = {
  'npc_crab>crabato_juice': 'hug it',
  'npc_crab>crabphones': 'play it a musicblock',
  'hell_bartender>wine_of_the_dead': 'trade a Drink Ticket',
  'hell_bartender>drink_ticket': null,
  'npc_smuggler>gem_diamond': 'talk to them',
  'npc_kitty_chicken>grain': 'squeeze it',
  'npc_batterfly>milk_butterfly': null,
  'npc_piggy>hogtied_piggy': 'capture it with Pig Bait',
  'npc_piggy_explorer>hogtied_piggy_explorer': 'pick him up',
  'npc_juju_grandma>juju_trowel': 'help on her quest',
  'npc_salmon>salmon': 'pocket it',
  'npc_salmon>boot': 'pocket it',
  'npc_sloth>snail': 'feed it',
};
export const GSJS_GIVER_HOW = GSJS_HOW;

/** Fills d.sellers (item -> [{ store, price }]) and d.givers (item -> [{ cls, how }]). */
export async function addWhereToFind(d) {
  const [vendor, trants, mining, nodes] = await Promise.all([mod('vendor.js'), mod('trants.js'), mod('mining.js'), mod('resource-nodes.js')]);
  const push = (map, id, row) => { if (!map.has(id)) map.set(id, []); if (!map.get(id).some((x) => JSON.stringify(x) === JSON.stringify(row))) map.get(id).push(row); };
  const sellers = new Map();
  for (const p of Object.values(vendor.VENDOR_PROFILES)) for (const o of p.offers) if (o.classTsid) push(sellers, o.classTsid, { store: p.key, price: o.buyPrice });
  const givers = new Map();
  for (const [cls, t] of Object.entries(trants.TRANT_META)) push(givers, t.fruitClass, { cls, how: 'harvest it' });
  for (const [cls, r] of Object.entries(mining.ROCK_CATALOG)) push(givers, r.chunkId, { cls, how: 'mine it' });
  push(givers, 'plank', { cls: 'wood_tree', how: 'chop it' });
  for (const [cls, rows] of Object.entries(ANIMAL_GIVES)) for (const [id, how] of rows) push(givers, id, { cls, how });
  const tableIds = (key, seen = new Set()) => {
    const out = new Set();
    if (seen.has(key) || !nodes.RESOURCE_DROP_TABLES[key]) return out;
    seen.add(key);
    for (const [, picks] of nodes.RESOURCE_DROP_TABLES[key]) for (const pick of picks) if (pick.classTsid) out.add(pick.classTsid);
    return out;
  };
  for (const [cls, node] of Object.entries(nodes.RESOURCE_NODE_CATALOG)) {
    for (const verb of node.verbs || []) {
      // A verb that runs when you touch it (the Dust Trap's Trigger) is walking into it.
      const act = verb.auto ? 'walk into it' : `${String(verb.label || verb.id).toLowerCase()} it`;
      // item -> how likely one verb gives it: a drop table, or less than even odds, is "sometimes".
      const odds = new Map();
      for (const y of verb.yields || []) {
        if (y.classTsid) odds.set(y.classTsid, (odds.get(y.classTsid) ?? 0) + (y.chance ?? 1));
        if (y.dropTable) for (const id of tableIds(y.dropTable)) odds.set(id, Math.max(odds.get(id) ?? 0, 0));
      }
      for (const [id, p] of odds) push(givers, id, { cls, how: p < 0.5 ? `sometimes when you ${act}` : act });
    }
  }
  d.sellers = sellers;
  d.givers = givers;
}

/**
 * Every source of item `id` once, in order: sellers (Stores, then people with a store of
 * their own), then what gives it, most streets first. [{ key, kind, price?, how?, n }].
 * `n`: how many streets have it (null when the Streets section does not place it).
 */
export function sourcesOf(id, ency) {
  const own = `item:${id}`;
  const linked = (key) => key && key !== own && (key.startsWith('item:') ? ency.items.has(key.slice(5)) : ency.entries.has(key));
  const out = new Map();
  for (const s of ency.sellers?.get(id) || []) {
    const key = `stores:${s.store}`;
    if (linked(key) && !out.has(key)) out.set(key, { key, kind: 'store', price: s.price, n: ency.storeStreets(s.store) });
  }
  const backs = ency.back?.get(own) || [];
  // A person who sells it from a store with no Stores page of its own (the Fox Ranger, the Bureaucrat).
  for (const b of backs) {
    const e = ency.entries.get(b.from);
    if (b.rel !== 'sells' || !b.from.startsWith('people:') || !e?.store || ency.entries.has(`stores:${e.store.key}`) || out.has(b.from)) continue;
    out.set(b.from, { key: b.from, kind: 'seller', price: b.price, n: ency.streetsHaving(e.id) || null });
  }
  const givers = [];
  // One tile per giver: a node with two verbs that give it names both; Tiny Speck's file
  // only adds a giver the remake's rules do not already name (theirs say how more exactly).
  const addGiver = (key, how, n, { more = true } = {}) => {
    if (!linked(key) || out.has(key)) return;
    const g = givers.find((x) => x.key === key);
    if (g) { if (more && how && !g.hows.includes(how)) g.hows.push(how); return; }
    givers.push({ key, kind: 'giver', hows: how ? [how] : [], n });
  };
  for (const g of ency.givers?.get(id) || []) addGiver(ency.keyOf(g.cls), g.how, ency.streetsHaving(g.cls));
  for (const b of backs) {
    if (b.rel !== 'gives' || !(b.from.startsWith('animals:') || b.from.startsWith('people:'))) continue;
    const cls = ency.entries.get(b.from)?.id;
    const how = GSJS_HOW[`${cls}>${id}`];
    if (how === null) continue;
    addGiver(b.from, how || '', ency.streetsHaving(cls) || null, { more: false });
  }
  givers.sort((a, b) => (b.n || 0) - (a.n || 0));
  for (const g of givers) out.set(g.key, { ...g, how: g.hows.join(' or ') });
  return [...out.values()];
}

/** The block for item `id`, or '' when nothing sells or gives it. P: the item page's parts. */
export function whereToFind(id, P, ency) {
  const sources = sourcesOf(id, ency);
  if (!sources.length) return '';
  const streets = (n) => (n == null ? '' : n ? `on ${fmt(n)} street${n === 1 ? '' : 's'}` : 'on no street yet');
  const sub = (...parts) => parts.filter(Boolean).join(', ');
  const sellTiles = sources.filter((s) => s.kind !== 'giver').map((s) => P.tile(s.key, { sub: sub(P.currants(s.price), esc(streets(s.n))) }));
  const giveTiles = sources.filter((s) => s.kind === 'giver').map((s) => P.tile(s.key, { sub: sub(esc(s.how || 'gives it'), esc(streets(s.n))) }));
  return [
    '<h3>Where to find it</h3>',
    sellTiles.length ? `<p class="ency-lead-small">Who sells it, with the price and how many streets have one.</p>\n        ${P.tiles(sellTiles)}` : '',
    giveTiles.length ? `<p class="ency-lead-small">What gives it, how you get it, and how many streets have one.</p>\n        ${P.tiles(giveTiles)}` : '',
  ].filter(Boolean).join('\n        ');
}
