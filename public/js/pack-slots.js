/**
 * Pack slots and bags (G152): rules only, no DOM.
 *
 * Source (glitch-GameServerJS and glitch-client, CC0):
 *  - The pack is 16 slots: client data/pc/PC.as:48 `pack_slots:int = 16`,
 *    PackDisplayManager.as:114 builds the 'Backpack' row from it; every bag
 *    defaults to items/bag.js:1 `capacity = 16`. A slot holds one stack of at
 *    most the class's stackmax (bag.js:82-88).
 *  - addItemStack (bag.js:89-259): limited bags first (157-188), then top up
 *    stacks of the same class (191-206), then store what fits in candidate
 *    order, the pack before the bags inside it (113-150, 208-232).
 *  - The bags and what they take: BAG_DEFS below, each row cites its file.
 *    No bag takes another bag (bag_generic.js:588-590); the client only lets a
 *    bag sit in the root row (PackDisplayManager.as:675) and never drops a bag
 *    on a bag (:708).
 *  - Full pack copy: takeable.js:48 (verb), 76-79 (pick up), inc_stores.js
 *    168-196 (vendor), inc_rewards.js:66-93 and 96-160 (the magic rock).
 *
 * Remake adaptation: the inventory stays one count per class (js/inventory.js),
 * the record of everything held, because hundreds of call sites and several
 * side tables read it. The layout is computed from those counts and a saved
 * arrangement (prefs): saved positions are honoured first, so stacks stay where
 * the player put them and new arrivals are what doesn't fit (a new bag goes in
 * place of the leftmost slot that is not a bag: arrivalSlot). What doesn't fit
 * is held by the magic rock (the source's familiar overflow) and comes back by
 * itself when room frees.
 *
 * Each saved stack keeps its own count (prefs.n), so a change of count never
 * moves a stack (player report on v0.7.0: a plank stack in a bag filled up and
 * jumped to the pack row). More of a class tops up the stacks held, limited
 * bags first, then the pack, then the other bags (bag.js:157-206), and only
 * the rest opens new stacks in the first free slot, the pack before the bags
 * (bag.js:208-232; the pack is the first candidate, :120-122). Fewer takes from
 * the first stack in slot order, a bag's slots where the bag sits
 * (removeItemStackClass and removeItemStackClassExact, bag.js:316-404), except
 * that what a verb on one stack takes (drop, give, eat) comes off that stack
 * (opts.takeFirst; main.js doVerb 2926-3250 works on the itemstack the client
 * named, its count capped at that stack's: player report 2026-11-01); a stack
 * that empties frees its slot and nothing else moves. A save from before
 * prefs.n splits each class into full stacks first, in saved order, once.
 *
 * Bag names (items/bag_bigger.js verbs.rename 475-520, getLabel 592-598; js/bag-names.js):
 * a bag's name is its own, kept on its row in prefs.bags, so two Bigger Bags can
 * have different names; the bag's label (its tray's head, its slot's tip and
 * aria-label, Put in / Take out) is the name when it has one.
 *
 * Bag sorting (the three pack cards; items/bag_generic_gray.js verbs.sort_* 30-415,
 * magic_sort 417-447, stack_up 449-473; items/bag.js doSpecialize 783-801,
 * removeSpecialize 774-781, stackMatchesBagCategory 803-808, addItemStack 113-150):
 *  - Internal Sortitude (pack_internal_sortitude): a Generic or Bigger Bag can be
 *    specialized (BAG_SORTS). Its row keeps `sort` (the sort's id) and `sortNamed`
 *    when the bag took the sort's name because it had none of the player's
 *    (doSpecialize sets user_name and specialization_name only then; a rename
 *    makes the name the player's: verbs.rename 516). With the card, what arrives
 *    goes first into the bags sorted for it, then the pack, then the bags not
 *    sorted, then the rest (addItemStack 125-150), limited bags still first
 *    (157-188); more of a class tops up its stacks in that order too (191-206).
 *  - Magic Sort (pack_magic_sort): on a sorted bag, or a bag that only takes one
 *    kind (toolbox, spice rack: getCustomBagCategories), moves the stacks it is
 *    for into it from the pack and the other bags, swapping out what it is not
 *    for (magicSort). apiInventoryMagicSort ran in the server's Java, so the moves
 *    follow its card text: "Automatically swaps items around across all your
 *    bags so that the distribution of items most closely matches your bags'
 *    specializations" (inc_data_imagination.js 5703-5723).
 *  - Stack Up (pack_stack_up_bags): partial stacks of a class across the pack and
 *    its bags fill up the first ones in slot order (stackUp; apiInventoryStackUp
 *    was also Java: "Finds all partial stacks in all your bags and cleans them up").
 *  A sort is kept on the bag's row, so it saves with the player; a bag that is
 *  dropped and picked up comes back unsorted (only its player-given name goes with it).
 *
 * prefs = { bags: [{ key, cls, name?, sort?, sortNamed? }], place: { pack: [entry], <bagKey>: [cls] }, n: { pack: [count], <bagKey>: [count] } }
 *   pack entries are a class (one stack) or '@<bagKey>' (a bag in that slot);
 *   n runs beside place, the count of the stack in each slot (0 for a bag, or unknown).
 */

import {
  COMPOUND_CLASSES,
  CUBIMAL_CLASSES,
  ELEMENT_CLASSES,
  NO_BAG_CLASSES,
  NO_SLOT_CLASSES,
  SORT_TAG_CLASSES,
  SPICE_CLASSES,
  STACKMAX,
  TOOL_CLASSES,
} from './pack-slots-data.js?v=800f664c';
import { bagLabel, canRenameBag, cleanBagName, renamedTo } from './bag-names.js?v=22391c55';

/** PC.as:48 pack_slots; items/bag.js:1. */
export const PACK_CAPACITY = 16;
/** PackDisplayManager.as:114: the root container's label. */
export const PACK_LABEL = 'Backpack';

const bag = (capacity, holds, limited, source, extra = {}) => Object.freeze({ capacity, holds, limited, source, ...extra });

/** The bags a pack slot can hold, with their own slots. */
export const BAG_DEFS = Object.freeze({
  bag_generic: bag(10, 'any', false, 'bag_generic.js:588-590, onCreate 600-603'),
  bag_generic_blue: bag(10, 'any', false, 'bag_generic_blue.js (bag_generic canContain/onCreate)'),
  bag_generic_gray: bag(10, 'any', false, 'bag_generic_gray.js (bag_generic canContain/onCreate)'),
  bag_generic_green: bag(10, 'any', false, 'bag_generic_green.js (bag_generic canContain/onCreate)'),
  bag_generic_pink: bag(10, 'any', false, 'bag_generic_pink.js (bag_generic canContain/onCreate)'),
  bag_bigger: bag(16, 'any', false, 'bag_bigger.js:588-590, onCreate 600-603'),
  bag_bigger_blue: bag(16, 'any', false, 'bag_bigger_blue.js (bag_bigger canContain/onCreate)'),
  bag_bigger_gray: bag(16, 'any', false, 'bag_bigger_gray.js (bag_bigger canContain/onCreate)'),
  bag_bigger_green: bag(16, 'any', false, 'bag_bigger_green.js (bag_bigger canContain/onCreate)'),
  bag_bigger_pink: bag(16, 'any', false, 'bag_bigger_pink.js (bag_bigger canContain/onCreate)'),
  bag_toolbox_red: bag(16, 'tool', false, 'bag_toolbox_red.js:588-590 (bag_toolbox_base), onCreate 608-611'),
  bag_toolbox_green: bag(16, 'tool', false, 'bag_toolbox_green.js (bag_toolbox_base), onCreate 608-611'),
  bag_toolbox_chrome: bag(16, 'tool', false, 'bag_toolbox_chrome.js (bag_toolbox_base), onCreate 618-621'),
  bag_spicerack: bag(16, 'spice', true, 'bag_spicerack.js:588-591, onCreate 597-601'),
  bag_alchemistry_kit: bag(16, 'compound', true, 'bag_alchemistry_kit.js:588-591, onCreate 597-601'),
  bag_cubimal_case: bag(16, 'cubimal', true, 'bag_cubimal_case.js:588-591, onCreate 597-605'),
  // canContain 651-659: one stack of each element, up to its stackmax; onCreate 694-699 capacity 4.
  bag_elemental_pouch: bag(4, 'element', true, 'bag_elemental_pouch.js:651-659, onCreate 694-699', { onePerClass: true }),
});

/** can_specialize 'true' (bag_generic.js and bag_bigger.js classProps, line 23 in each colour's file). */
export const SPECIALIZABLE_BAGS = Object.freeze(['bag_generic', 'bag_generic_blue', 'bag_generic_gray', 'bag_generic_green', 'bag_generic_pink', 'bag_bigger', 'bag_bigger_blue', 'bag_bigger_gray', 'bag_bigger_green', 'bag_bigger_pink']);
const SPECIALIZABLE = new Set(SPECIALIZABLE_BAGS);

const sortRow = (id, label, tooltip, name, tags, reason, sortOn) => Object.freeze({ id, label, tooltip, name, tags: Object.freeze(tags.split(',')), reason, sortOn });
/** verbs.sort_* (bag_generic_gray.js 53-415): label, tooltip, the name doSpecialize gives, its categories, the disabled reason, sort_on. */
export const BAG_SORTS = Object.freeze([
  sortRow('sort_keys', 'Sort: Keys', 'Specialize this bag for keys', 'Keys', 'key', 'This bag is currently sorted by keys', 51),
  sortRow('sort_cards', 'Sort: Cards', 'Specialize this bag for upgrade cards', 'Cards', 'upgrade_card', 'This bag is currently sorted by cards', 52),
  sortRow('sort_alchemy', 'Sort: Alchemy', 'Specialize this bag for compounds and powders', 'Alchemy', 'compound,powder', 'This bag is currently sorted by alchemy goods', 53),
  sortRow('sort_manufacturing', 'Sort: Manufacturing', 'Specialize this bag for ingredients and products of earth, cloth, fuel, wood and metal', 'Manufacturing', 'earth,firebogproduct,advanced_resource,fiberarts,woodproduct', 'This bag is currently sorted by manufacturing goods', 54),
  sortRow('sort_mining', 'Sort: Mining, etc.', 'Specialize this bag for ore chunks, rock chunks and metal ingots', 'Mining, etc.', 'rock,metal,gem', 'This bag is currently sorted by mining goods', 55),
  sortRow('sort_herbs', 'Sort: Herbs, etc.', 'Specialize this bag for herbs, herb seeds and tinctures', 'Herbs, etc.', 'herb,herb_seed,tincture', 'This bag is currently sorted by herbs', 56),
  sortRow('sort_crops', 'Sort: Crops, etc.', 'Specialize this bag for crops and crop seeds', 'Crops, etc.', 'crop,seed', 'This bag is currently sorted by crops', 57),
  sortRow('sort_musicblocks', 'Sort: Musicblocks', 'Specialize this bag for musicblocks', 'Musicblocks', 'musicblock', 'This bag is currently sorted by musicblocks', 58),
  sortRow('sort_emblems', 'Sort: Emblems', 'Specialize this bag for emblems', 'Emblems', 'emblem', 'This bag is currently sorted by emblems', 59),
  sortRow('sort_drinks', 'Sort: Drinks', 'Specialize this bag for drinks', 'Drinks', 'drink', 'This bag is currently sorted by drinks', 60),
  sortRow('sort_food', 'Sort: Food', 'Specialize this bag for food', 'Food', 'foodbonus', 'This bag is currently sorted by food', 61),
  sortRow('sort_staples_ab', 'Sort: Staples A+B', 'Specialize this bag for Staples A and B', 'Staples A+B', 'animalproduct,trantproduct', 'This bag is currently sorted by both sets of staples', 62),
  // The source names these two "Sort: Staples B" / "Sort: Staples A" (doSpecialize's name argument, 386 and 412).
  sortRow('sort_staples_b', 'Sort: Staples B', 'Specialize this bag for Allspice, Plain Beans, Plain Bubbles, Cherries, Eggs, and General Vapour', 'Sort: Staples B', 'trantproduct', 'This bag is currently sorted by this set of staples', 63),
  sortRow('sort_staples_a', 'Sort: Staples A', 'Specialize this bag for Meat, Grain and Milk', 'Sort: Staples A', 'animalproduct', 'This bag is currently sorted by this set of staples', 64),
]);
const SORT_BY_ID = new Map(BAG_SORTS.map((r) => [r.id, r]));

/** The other bag verbs' words (verbs.sort_all 30-51, magic_sort 417-447, stack_up 449-473). */
export const BAG_SORT_COPY = Object.freeze({
  all: Object.freeze({ id: 'sort_all', label: 'Sort: All', tooltip: 'Remove specialization from this bag', sortOn: 50 }),
  magic: Object.freeze({ id: 'magic_sort', label: 'Magic sort', tooltip: 'Magically sort your items based on bag specialization', sortOn: 65, unsorted: 'This bag needs to be specialized before it can be magically sorted.', done: 'You have sorted your bag quite magically!' }),
  stackUp: Object.freeze({ id: 'stack_up', label: 'Stack up', tooltip: 'Finds all partial stacks in all your bags and cleans them up', sortOn: 66, done: 'Your inventory has been stacked up!' }),
});

export function canSpecializeBag(cls) {
  return SPECIALIZABLE.has(String(cls || ''));
}

/** A sort row by id, or null. */
export function bagSort(id) {
  return SORT_BY_ID.get(String(id || '')) || null;
}

/** stackMatchesBagCategory (bag.js:803-808): the class carries one of the sort's tags (the catalog's tags count too). */
export function sortTakes(sortId, cls, opts = {}) {
  const row = bagSort(sortId);
  if (!row) return false;
  const own = opts.catalog?.[cls]?.tags;
  return row.tags.some((t) => SORT_TAG_CLASSES.get(t)?.has(cls) || (Array.isArray(own) && own.includes(t) && !own.includes(`nobag_${t}`)));
}

/** The words a sorted bag is called when the sort gave its name. */
export function sortName(sortId) {
  return bagSort(sortId)?.name || '';
}

/** The player-facing words, from the source where it has them. */
export const PACK_COPY = Object.freeze({
  /** takeable.js:48, the pick up verb when the stack can't fit. */
  pickupDisabled: 'Your inventory is full!',
  /** takeable.js:76-79, picking up anyway. */
  pickupFull: 'Your bag is full!',
  /** inc_stores.js:170-173. */
  buyNone: "You can't buy that -- there's no more room in your inventory!",
  /** inc_stores.js:179-181. */
  buyPartial: (n) => ` And ${n} didn't fit in your inventory, so you weren't charged for them.`,
  /** inc_rewards.js:80-84 rewards_store. */
  rockHolding: (name, many) => `Your magic rock is holding ${name} for you. Make room in your pack to hold ${many ? 'them' : 'it'}.`,
  /** inc_rewards.js:140-155 rewards_return. */
  rockGiven: (list, many) => `Your ${list} ${many ? 'have' : 'has'} been given to you.`,
  /** PackDisplayManager.as:733 and 761, the drag tips. */
  moveTo: (label) => `Move to ${label}`,
  moveHere: 'Move here',
  /** PackSlot.as:310-313, the opener's tip. */
  options: 'Options',
  // Our own short words where the client only refused the drop without a line.
  bagInBag: "A bag can't go in a bag.",
  wontHold: (label) => `${label} can't hold that.`,
  noRoom: (label) => `There's no room in ${label}.`,
});

export function isBagClass(cls) {
  return Object.prototype.hasOwnProperty.call(BAG_DEFS, cls);
}

/** Stack size for a class: GSJS stackmax, else the remake catalog's, else one slot whatever the count. */
export function stackMaxOf(cls, catalog = null) {
  const known = STACKMAX.get(cls);
  if (known) return known;
  const meta = Number(catalog?.[cls]?.stackMax);
  return Number.isFinite(meta) && meta >= 1 ? Math.floor(meta) : Infinity;
}

/** Counts per stack: full stacks first, the remainder last. */
export function splitStacks(count, max) {
  const n = Math.max(0, Math.floor(Number(count) || 0));
  if (n <= 0) return [];
  if (!Number.isFinite(max) || max >= n) return [n];
  const out = [];
  let left = n;
  while (left > 0) {
    out.push(Math.min(max, left));
    left -= max;
  }
  return out;
}

function isToolClass(cls, opts) {
  return TOOL_CLASSES.has(cls) || Boolean(opts?.isTool?.(cls));
}

/** A class the pack never slots (furniture and trophies live in hidden bags in the source). */
export function takesNoSlot(cls) {
  return NO_SLOT_CLASSES.has(cls);
}

/** The pack itself: anything with a slot (departure: elements may sit here when no pouch has room). */
export function packAccepts(cls) {
  return !takesNoSlot(cls);
}

/** canContain for a bag kind. */
export function bagAccepts(def, cls, opts = {}) {
  if (!def || takesNoSlot(cls) || isBagClass(cls) || /^bag_/.test(cls)) return false;
  switch (def.holds) {
    case 'tool': return isToolClass(cls, opts);
    case 'spice': return SPICE_CLASSES.has(cls);
    case 'compound': return COMPOUND_CLASSES.has(cls);
    case 'cubimal': return CUBIMAL_CLASSES.has(cls);
    case 'element': return ELEMENT_CLASSES.has(cls);
    default: return !ELEMENT_CLASSES.has(cls) && !NO_BAG_CLASSES.has(cls);
  }
}

const cleanKey = (v) => String(v || '').replace(/[^a-zA-Z0-9_]/g, '').slice(0, 40);

/** A saved stack count: a whole number from 1, else 0 (unknown). */
const cleanCount = (v) => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n > 0 ? Math.min(n, 1e9) : 0;
};

/** Saved arrangement, cleaned. n has one count per place entry (0 where unknown). */
export function normalizePrefs(seed) {
  const out = { bags: [], place: { pack: [] }, n: { pack: [] } };
  if (!seed || typeof seed !== 'object') return out;
  const seen = new Set();
  for (const row of Array.isArray(seed.bags) ? seed.bags : []) {
    const key = cleanKey(row?.key);
    const cls = cleanKey(row?.cls);
    if (!key || !isBagClass(cls) || seen.has(key)) continue;
    seen.add(key);
    const name = canRenameBag(cls) ? cleanBagName(row?.name) : '';
    const sort = canSpecializeBag(cls) && bagSort(row?.sort) ? row.sort : '';
    const kept = { key, cls };
    if (name) kept.name = name;
    if (sort) kept.sort = sort;
    if (sort && !name && row?.sortNamed === true) kept.sortNamed = true;
    out.bags.push(kept);
  }
  const place = seed.place && typeof seed.place === 'object' ? seed.place : {};
  const counts = seed.n && typeof seed.n === 'object' ? seed.n : {};
  for (const [rawKey, list] of Object.entries(place)) {
    const key = rawKey === 'pack' ? 'pack' : cleanKey(rawKey);
    if (!key || (key !== 'pack' && !seen.has(key)) || !Array.isArray(list)) continue;
    const ns = Array.isArray(counts[rawKey]) ? counts[rawKey] : [];
    const entries = [];
    const nums = [];
    list.forEach((raw, i) => {
      const entry = typeof raw === 'string' && raw.startsWith('@') ? `@${cleanKey(raw.slice(1))}` : cleanKey(raw);
      if (!entry || entry === '@' || entries.length >= 64) return;
      entries.push(entry);
      nums.push(entry.startsWith('@') ? 0 : cleanCount(ns[i]));
    });
    out.place[key] = entries;
    out.n[key] = nums;
  }
  return out;
}

function nextBagKey(used) {
  let n = 1;
  while (used.has(`b${n}`)) n += 1;
  return `b${n}`;
}

/** The order classes are auto-placed in: opts.order first, then the rest of the inventory as it reads. */
function classOrder(inv, opts) {
  const out = [];
  const seen = new Set();
  for (const cls of [...(opts.order || []), ...Object.keys(inv || {})]) {
    if (seen.has(cls)) continue;
    seen.add(cls);
    if ((Number(inv?.[cls]) || 0) > 0) out.push(cls);
  }
  return out;
}

/**
 * The pack's slots, each bag's slots and what the magic rock holds.
 * @param {Record<string, number>} inv
 * @param {object} prefs saved arrangement (normalizePrefs)
 * @param {{ capacity?: number, catalog?: object, isTool?: (cls: string) => boolean, order?: string[], labels?: Record<string,string>, takeFirst?: { container: string, index: number }[] }} [opts]
 *   takeFirst: saved places (prefs place keys and indexes) whose stacks a class's
 *   fewer comes off before the first-in-slot-order rule: the stack a verb was
 *   used on (main.js doVerb 3239-3250 acts on the stack the client named).
 */
export function layoutPack(inv, prefs = null, opts = {}) {
  const capacity = Math.max(1, Math.floor(opts.capacity ?? PACK_CAPACITY));
  const saved = normalizePrefs(prefs);
  // Bag instances: the saved ones of each class first (in saved order), then new keys.
  // Every saved key is taken before any new one is made, so a bag that just
  // arrived never takes the key (and so the contents) of a bag held already,
  // whatever order its class comes in (the catalog lists the vendors' bags in
  // store order: a Generic Bag before a Red Toolbox). In the source nothing
  // held moves when a bag arrives (bag.js:89-238 addItemStack only adds it).
  const used = new Set(saved.bags.map((row) => row.key));
  const instances = [];
  const savedByCls = new Map();
  for (const row of saved.bags) {
    if (!savedByCls.has(row.cls)) savedByCls.set(row.cls, []);
    savedByCls.get(row.cls).push(row);
  }
  const order = classOrder(inv, opts);
  for (const cls of order) {
    if (!isBagClass(cls)) continue;
    const n = Math.max(0, Math.floor(Number(inv[cls]) || 0));
    const rows = (savedByCls.get(cls) || []).slice(0, n);
    for (const row of rows) instances.push({ key: row.key, cls, placed: false, name: row.name || '', sort: row.sort || '', sortNamed: Boolean(row.sortNamed) });
    for (let i = rows.length; i < n; i += 1) {
      const key = nextBagKey(used);
      used.add(key);
      instances.push({ key, cls, placed: false, fresh: true, name: '', sort: '', sortNamed: false });
    }
  }
  const byKey = new Map(instances.map((b) => [b.key, b]));
  // Stacks still to place, per class.
  const left = new Map();
  for (const cls of order) {
    if (isBagClass(cls) || takesNoSlot(cls)) continue;
    left.set(cls, splitStacks(inv[cls], stackMaxOf(cls, opts.catalog)));
  }
  const pack = { key: 'pack', label: PACK_LABEL, capacity, slots: [] };
  const boxes = new Map();
  const labelOf = (cls) => opts.labels?.[cls] || opts.catalog?.[cls]?.label || cls;
  const openBox = (inst) => {
    const def = BAG_DEFS[inst.cls];
    // getLabel 592-598: the bag's own name, else its class label (className keeps the latter).
    // A sorted bag with no name of the player's shows the sort's (doSpecialize 796-799).
    const label = inst.name ? bagLabel(inst.name, labelOf(inst.cls)) : inst.sortNamed && inst.sort ? sortName(inst.sort) : labelOf(inst.cls);
    const box = { key: inst.key, cls: inst.cls, label, name: inst.name, className: labelOf(inst.cls), capacity: def.capacity, holds: def.holds, limited: def.limited, onePerClass: Boolean(def.onePerClass), slots: [] };
    if (inst.sort) box.sort = inst.sort;
    if (inst.sortNamed && inst.sort) box.sortNamed = true;
    boxes.set(inst.key, box);
    return box;
  };
  const putBag = (inst) => {
    inst.placed = true;
    pack.slots.push({ kind: 'bag', key: inst.key, cls: inst.cls, count: 1, ...(inst.name ? { name: inst.name } : {}) });
    openBox(inst);
  };
  const boxTakes = (box, cls) => {
    if (box.slots.length >= box.capacity) return false;
    if (!bagAccepts(BAG_DEFS[box.cls], cls, opts)) return false;
    if (box.onePerClass && box.slots.some((s) => s.cls === cls)) return false;
    return true;
  };
  // addItemStack's candidate order (bag.js:113-188): limited bags 0; with Internal Sortitude the bags
  // sorted for the class 1, the pack 2, bags not sorted 3, bags sorted for something else 4; without
  // it the pack 2 and every other bag 3 (stable: bags keep their pack order within a rank).
  const routeRank = (box, cls) => {
    if (box === pack) return 2;
    if (box.limited) return 0;
    if (!opts.sortitude) return 3;
    if (box.sort) return sortTakes(box.sort, cls, opts) ? 1 : 4;
    return 3;
  };
  const putStack = (container, cls) => {
    const queue = left.get(cls);
    container.slots.push({ kind: 'stack', cls, count: queue.shift() });
  };
  const has = (cls) => (left.get(cls)?.length || 0) > 0;

  // A class whose every saved stack has its count keeps those counts (prefs.n);
  // one saved before counts were kept is split as it always was (full stacks
  // first, in saved order), once.
  const counted = new Set();
  const legacy = new Set();
  for (const [key, list] of Object.entries(saved.place)) {
    list.forEach((entry, i) => {
      if (entry.startsWith('@')) return;
      if (saved.n[key]?.[i] > 0) counted.add(entry);
      else legacy.add(entry);
    });
  }
  for (const cls of legacy) counted.delete(cls);
  // The saved stacks kept, per class, in slot order (each { container, slot, saved }).
  const held = new Map();
  const reserved = (cls) => held.get(cls)?.length || 0;
  const keepStack = (container, cls, savedCount, key, at) => {
    if (!left.has(cls)) return;
    if (!counted.has(cls) && reserved(cls) >= left.get(cls).length) return;
    const slot = { kind: 'stack', cls, count: 0 };
    container.slots.push(slot);
    if (!held.has(cls)) held.set(cls, []);
    held.get(cls).push({ container, slot, saved: savedCount, key, at });
  };

  // Phase 1: the saved pack, then each placed bag's saved contents.
  (saved.place.pack || []).forEach((entry, i) => {
    if (pack.slots.length >= capacity) return;
    if (entry.startsWith('@')) {
      const inst = byKey.get(entry.slice(1));
      if (inst && !inst.placed) putBag(inst);
    } else if (packAccepts(entry)) {
      keepStack(pack, entry, saved.n.pack?.[i] || 0, 'pack', i);
    }
  });
  for (const slot of pack.slots) {
    if (slot.kind !== 'bag') continue;
    const box = boxes.get(slot.key);
    (saved.place[slot.key] || []).forEach((cls, i) => {
      if (boxTakes(box, cls)) keepStack(box, cls, saved.n[slot.key]?.[i] || 0, slot.key, i);
    });
  }
  // Each kept stack's count. A saved count stays as it is; more tops up the stacks
  // held (limited bags, then the pack, then the other bags: bag.js:157-206) and
  // the rest waits for new slots (phase 2b); fewer comes off the first stack in
  // slot order, a bag's slots where the bag sits (bag.js:316-404), and a stack
  // that empties gives up its slot. Nothing held moves.
  const emptied = new Set();
  for (const [cls, list] of held) {
    const max = stackMaxOf(cls, opts.catalog);
    const total = left.get(cls).reduce((a, b) => a + b, 0);
    if (!counted.has(cls)) {
      for (const h of list) h.slot.count = left.get(cls).shift();
      continue;
    }
    let sum = 0;
    for (const h of list) {
      h.slot.count = Math.min(h.saved, max);
      sum += h.slot.count;
    }
    if (total >= sum) {
      let more = total - sum;
      const rank = (h) => routeRank(h.container, cls);
      const topUp = [...list].sort((a, b) => rank(a) - rank(b));
      for (const h of topUp) {
        if (more <= 0) break;
        const add = Math.min(more, Math.max(0, max - h.slot.count));
        h.slot.count += add;
        more -= add;
      }
      left.set(cls, splitStacks(more, max));
    } else {
      let less = sum - total;
      const where = new Map(list.map((h) => [h.slot, h]));
      const firstFirst = [];
      for (const s of pack.slots) {
        if (where.has(s)) firstFirst.push(where.get(s));
        else if (s.kind === 'bag') for (const t of boxes.get(s.key).slots) if (where.has(t)) firstFirst.push(where.get(t));
      }
      // The stack a verb was used on gives first (takeFirst), then the rest in slot order.
      const first = [];
      for (const p of Array.isArray(opts.takeFirst) ? opts.takeFirst : []) {
        const h = firstFirst.find((x) => x.key === String(p?.container) && x.at === Math.floor(Number(p?.index)));
        if (h && !first.includes(h)) first.push(h);
      }
      firstFirst.splice(0, firstFirst.length, ...first, ...firstFirst.filter((h) => !first.includes(h)));
      for (const h of firstFirst) {
        if (less <= 0) break;
        const take = Math.min(less, h.slot.count);
        h.slot.count -= take;
        less -= take;
        if (h.slot.count <= 0) emptied.add(h.slot);
      }
      left.set(cls, []);
    }
  }
  if (emptied.size) {
    pack.slots = pack.slots.filter((s) => !emptied.has(s));
    for (const box of boxes.values()) box.slots = box.slots.filter((s) => !emptied.has(s));
  }
  // Phase 2a: a bag with no saved place (one that just arrived, or one the magic rock gives
  // back) goes in place of the leftmost pack slot that is not a bag, and the stack in that
  // slot goes into it, so nothing leaves the pack (Austin 2026-10-31; the source put it in
  // the first free slot instead: bag.js:89-238). See arrivalSlot.
  for (const inst of instances) {
    if (inst.placed) continue;
    const box = { cls: inst.cls, capacity: BAG_DEFS[inst.cls].capacity, onePerClass: Boolean(BAG_DEFS[inst.cls].onePerClass), slots: [] };
    const at = arrivalSlot(pack.slots, capacity, (cls) => boxTakes(box, cls), opts);
    if (at === null) continue;
    const swallowed = at >= 0 ? pack.slots.splice(at, 1)[0] : null;
    putBag(inst);
    // Bags sit together at the front of the row, in arrival order after the bags held.
    const slot = pack.slots.pop();
    const lastBag = pack.slots.reduce((last, s, i) => (s.kind === 'bag' ? i : last), -1);
    pack.slots.splice(lastBag + 1, 0, slot);
    if (swallowed) boxes.get(inst.key).slots.push(swallowed);
  }
  // Phase 2b: every other stack, the source's order: limited bags, then the pack, then the other bags
  // (with Internal Sortitude: the bags sorted for it, the pack, the bags not sorted, the rest).
  const bagSlots = () => pack.slots.filter((s) => s.kind === 'bag').map((s) => boxes.get(s.key));
  for (const cls of order) {
    while (has(cls)) {
      const all = bagSlots();
      const options = [...all.filter((b) => boxTakes(b, cls))];
      if (pack.slots.length < capacity && packAccepts(cls)) options.push(pack);
      options.sort((a, b) => routeRank(a, cls) - routeRank(b, cls));
      const target = options[0];
      if (!target) break;
      putStack(target, cls);
    }
  }
  // What doesn't fit: the magic rock holds it.
  const rock = {};
  let rockStacks = 0;
  for (const [cls, queue] of left) {
    if (!queue.length) continue;
    rock[cls] = queue.reduce((a, b) => a + b, 0);
    rockStacks += queue.length;
  }
  const rockBags = instances.filter((b) => !b.placed).map((b) => ({ key: b.key, cls: b.cls, ...(b.name ? { name: b.name } : {}) }));
  for (const b of rockBags) {
    rock[b.cls] = (rock[b.cls] || 0) + 1;
    rockStacks += 1;
  }
  for (const slot of pack.slots) {
    if (slot.kind === 'bag') {
      const box = boxes.get(slot.key);
      slot.used = box.slots.length;
      slot.capacity = box.capacity;
    }
  }
  const nextPrefs = {
    bags: instances.map((b) => {
      const row = { key: b.key, cls: b.cls };
      if (b.name) row.name = b.name;
      if (b.sort) row.sort = b.sort;
      if (b.sort && b.sortNamed && !b.name) row.sortNamed = true;
      return row;
    }),
    place: { pack: pack.slots.map((s) => (s.kind === 'bag' ? `@${s.key}` : s.cls)) },
    n: { pack: pack.slots.map((s) => (s.kind === 'bag' ? 0 : s.count)) },
  };
  for (const [key, box] of boxes) {
    nextPrefs.place[key] = box.slots.map((s) => s.cls);
    nextPrefs.n[key] = box.slots.map((s) => s.count);
  }
  // Where each class sits, in slot counts (pack + bags), for "given back" and tests.
  const slotted = {};
  for (const s of pack.slots) if (s.kind === 'stack') slotted[s.cls] = (slotted[s.cls] || 0) + s.count;
  for (const s of pack.slots) if (s.kind === 'bag') slotted[s.cls] = (slotted[s.cls] || 0) + 1;
  for (const box of boxes.values()) for (const s of box.slots) slotted[s.cls] = (slotted[s.cls] || 0) + s.count;
  return {
    capacity,
    pack,
    bags: Object.fromEntries(boxes),
    rock,
    rockStacks,
    rockBags,
    slotted,
    used: pack.slots.length,
    free: capacity - pack.slots.length,
    prefs: nextPrefs,
  };
}

/**
 * Where each unit of a class sits, in the order the source looks for one:
 * bag.js findFirst 672-694 walks the pack's slots in order and a bag's
 * contents where the bag sits (players/inc_items.js items_find_working_tool
 * 729-732). One entry per unit ({ container, index }); what the magic rock
 * holds comes after. js/tools.js keeps a tool's wear per unit in this order.
 */
export function unitPlaces(layout, cls) {
  const out = [];
  const add = (container, slot, index) => {
    if (slot?.kind !== 'stack' || slot.cls !== cls) return;
    for (let k = 0; k < Math.max(1, Math.floor(Number(slot.count) || 1)); k += 1) out.push({ container, index });
  };
  (layout?.pack?.slots || []).forEach((slot, i) => {
    if (slot.kind === 'bag') (layout.bags?.[slot.key]?.slots || []).forEach((inner, j) => add(slot.key, inner, j));
    else add('pack', slot, i);
  });
  return out;
}

/** The first unit's place in unitPlaces order of the stack at (container, index), or -1. */
export function unitRankAt(layout, cls, container, index) {
  return unitPlaces(layout, cls).findIndex((p) => p.container === container && p.index === index);
}

/**
 * Where a bag that arrives goes (Austin 2026-10-31): in place of the leftmost
 * pack slot that is not a bag, as the pack row shows it (bags, then items,
 * then tools, then the empty slots; game.js renderPack). Returns the index in
 * slots of the stack it takes in (that stack moves into the bag), -1 for an
 * empty slot, or null when there is none (the magic rock holds the bag, and a
 * vendor refuses the sale: inc_stores.js:170-173).
 * A bag that can't hold the leftmost stack (a Spice Rack and an apple) takes
 * the leftmost one it can hold, else the first empty slot; a stack is never
 * put in a bag that would refuse it.
 */
export function arrivalSlot(slots, capacity, takes, opts = {}) {
  const rowTool = (cls) => Boolean(opts.isTool?.(cls));
  const order = [];
  slots.forEach((s, i) => { if (s.kind === 'stack' && !rowTool(s.cls)) order.push(i); });
  slots.forEach((s, i) => { if (s.kind === 'stack' && rowTool(s.cls)) order.push(i); });
  for (const i of order) if (takes(slots[i].cls)) return i;
  return slots.length < capacity ? -1 : null;
}

/** Units of overflow (stacks the rock holds), the measure room is judged by. */
function overflowOf(layout) {
  return layout.rockStacks;
}

/**
 * How many of `want` units of a class the pack can take now without anything
 * more going to the magic rock (isBagFull / canFitHowMany, bag.js:443-462, 516-546).
 */
export function roomFor(inv, prefs, cls, want = 1, opts = {}) {
  const n = Math.max(0, Math.floor(Number(want) || 0));
  if (!cls || n <= 0) return 0;
  if (takesNoSlot(cls)) return n;
  const base = layoutPack(inv, prefs, opts);
  const before = overflowOf(base);
  const baseRock = base.rock[cls] || 0;
  const fits = (k) => {
    const trial = { ...inv, [cls]: (Number(inv?.[cls]) || 0) + k };
    const out = layoutPack(trial, base.prefs, opts);
    return overflowOf(out) === before && (out.rock[cls] || 0) === baseRock;
  };
  if (fits(n)) return n;
  let lo = 0;
  let hi = n;
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    if (fits(mid)) lo = mid;
    else hi = mid;
  }
  return lo;
}

/**
 * Move one stack (or a bag) to another container, as a drag does
 * (PackDisplayManager.as _findItemDragTargetSlot 660-760, the inventory move 1000+).
 * from = { container: 'pack'|bagKey, index }; to = { container: 'pack'|bagKey, index? } or { bag: bagKey }.
 * Returns { ok, prefs, reason }.
 */
export function moveStack(inv, prefs, from, to, opts = {}) {
  const layout = layoutPack(inv, prefs, opts);
  const src = from?.container === 'pack' ? layout.pack : layout.bags[from?.container];
  const slot = src?.slots?.[Math.floor(Number(from?.index))];
  if (!slot) return { ok: false, reason: 'missing', prefs: layout.prefs };
  const destKey = to?.bag ? to.bag : to?.container || 'pack';
  const dest = destKey === 'pack' ? layout.pack : layout.bags[destKey];
  if (!dest) return { ok: false, reason: 'missing', prefs: layout.prefs };
  if (slot.kind === 'bag') {
    // PackDisplayManager.as:675 and :708: a bag only ever sits in the root row.
    if (destKey !== 'pack') return { ok: false, reason: PACK_COPY.bagInBag, prefs: layout.prefs };
  } else if (destKey !== 'pack') {
    if (!bagAccepts(BAG_DEFS[dest.cls], slot.cls, opts)) return { ok: false, reason: PACK_COPY.wontHold(dest.label), prefs: layout.prefs };
  }
  const next = JSON.parse(JSON.stringify(layout.prefs));
  const srcKey = src === layout.pack ? 'pack' : from.container;
  // Player report 37: a stack dropped on a stack of its own class that has room joins it, up to
  // the class's stack max, and what does not fit stays where it was. The client offers such a
  // stack as a drop target (PackDisplayManager.as _findItemDragTargetSlot 700-711: same class,
  // not full; the partly-fitting drag allowed, 711) and sends inventory_move to its slot
  // (_packDragCompleteHandler 979-1006); the server adds into that slot and puts the rest back
  // (GSJS main.js doInventoryMove, bag.js addItemStack 241-258). Inside one container too.
  // Only places change: the counts per class, the save's inventory and the ledger stay as they are.
  const toAt = Number.isFinite(Number(to?.index)) && !to?.bag ? Math.floor(Number(to.index)) : -1;
  const onto = toAt >= 0 ? dest.slots[toAt] : null;
  if (slot.kind === 'stack' && onto?.kind === 'stack' && onto !== slot && onto.cls === slot.cls) {
    const max = stackMaxOf(slot.cls, opts.catalog);
    if (onto.count < max) {
      let at = Math.floor(Number(from.index));
      if (next.place[srcKey][at] !== slot.cls) at = next.place[srcKey].indexOf(slot.cls);
      const have = next.n[srcKey][at] || slot.count;
      const moved = Math.min(have, max - onto.count);
      next.n[destKey][toAt] = onto.count + moved;
      if (have - moved > 0) next.n[srcKey][at] = have - moved;
      else {
        next.place[srcKey].splice(at, 1);
        next.n[srcKey].splice(at, 1);
      }
      return { ok: true, prefs: next, merged: moved };
    }
  }
  const entry = slot.kind === 'bag' ? `@${slot.key}` : slot.cls;
  const list = next.place[srcKey];
  const nums = (next.n[srcKey] ||= list.map(() => 0));
  let at = Math.floor(Number(from.index));
  if (list[at] !== entry) at = list.indexOf(entry);
  // Each stack carries its own count (prefs.n), so the one dragged is the one that moves.
  const count = slot.kind === 'bag' ? 0 : nums[at] || slot.count;
  list.splice(at, 1);
  nums.splice(at, 1);
  if (srcKey === destKey) {
    const idx = Number.isFinite(Number(to?.index)) ? Math.max(0, Math.min(list.length, Math.floor(Number(to.index)))) : list.length;
    list.splice(idx, 0, entry);
    nums.splice(idx, 0, count);
    return { ok: true, prefs: next };
  }
  const destList = (next.place[destKey] ||= []);
  const destNums = (next.n[destKey] ||= destList.map(() => 0));
  // Into another container, a stack first tops up that container's stacks of its
  // class (bag.js:191-206 addItemStack, existing stacks before a free slot); only
  // what is left takes a slot. A full container takes what merges; the rest stays put.
  let rest = count;
  if (slot.kind === 'stack') {
    const max = stackMaxOf(slot.cls, opts.catalog);
    destList.forEach((cls, i) => {
      if (rest <= 0 || cls !== slot.cls) return;
      const add = Math.min(rest, Math.max(0, max - (destNums[i] || 0)));
      destNums[i] += add;
      rest -= add;
    });
  }
  if (rest > 0 && dest.slots.length >= dest.capacity) {
    if (rest === count) return { ok: false, reason: PACK_COPY.noRoom(dest.label || PACK_LABEL), prefs: layout.prefs };
    list.splice(at, 0, entry);
    nums.splice(at, 0, rest);
    rest = 0;
  }
  if (rest > 0) {
    const idx = Number.isFinite(Number(to?.index)) ? Math.max(0, Math.min(destList.length, Math.floor(Number(to.index)))) : destList.length;
    destList.splice(idx, 0, entry);
    destNums.splice(idx, 0, rest);
  }
  const after = layoutPack(inv, next, opts);
  const landed = destKey === 'pack'
    ? after.pack.slots.some((s) => (slot.kind === 'bag' ? s.key === slot.key : s.cls === slot.cls))
    : (after.bags[destKey]?.slots || []).some((s) => s.cls === slot.cls);
  if (!landed || overflowOf(after) > overflowOf(layout)) {
    return { ok: false, reason: PACK_COPY.noRoom(dest.label || PACK_LABEL), prefs: layout.prefs };
  }
  return { ok: true, prefs: after.prefs };
}

/** Each stack ({ cls, count }), split as the pack would (full stacks first): tools and the rest, in auto-place order. */
function stacksByKind(inv, opts) {
  const toolStacks = [];
  const otherStacks = [];
  for (const cls of classOrder(inv, opts)) {
    if (isBagClass(cls) || takesNoSlot(cls)) continue;
    for (const count of splitStacks(inv[cls], stackMaxOf(cls, opts.catalog))) (isToolClass(cls, opts) ? toolStacks : otherStacks).push({ cls, count });
  }
  return { toolStacks, otherStacks };
}

/**
 * First load of a save made before bags (solo only): pack what overflows into
 * bags, a Red Toolbox for tools and Bigger Bags for the rest, so everything
 * fits and the pack keeps its free slots. Returns { mint: [cls...], prefs }.
 */
export function packIntoBags(inv, opts = {}) {
  const capacity = Math.max(1, Math.floor(opts.capacity ?? PACK_CAPACITY));
  const first = layoutPack(inv, null, opts);
  if (!first.rockStacks) return { mint: [], prefs: first.prefs };
  const { toolStacks, otherStacks } = stacksByKind(inv, opts);
  const mint = [];
  const room = BAG_DEFS.bag_bigger.capacity;
  let tools = toolStacks.length;
  if (tools >= 4) {
    mint.push('bag_toolbox_red');
    tools = Math.max(0, tools - BAG_DEFS.bag_toolbox_red.capacity);
  }
  let rest = tools + otherStacks.length;
  while (rest > 0 && mint.length < capacity - 1) {
    mint.push('bag_bigger');
    rest -= room;
  }
  return { mint, prefs: arrangeIntoBags(inv, mint, opts) };
}

/** Austin 2026-10-27: every multiplayer character made before bags gets at least this many Bigger Bags. */
export const STARTER_FLOOR = 2;

/**
 * A multiplayer character's starter bags (decided by the site,
 * groddle-afternoon-site src/LedgerStarter.php starterKit, which this
 * mirrors for the tests): the solo migration's kit, then Bigger Bags until
 * there are at least STARTER_FLOOR of them, at most capacity - 1 bags in all.
 * Returns { mint, solo } (solo: how many of mint the solo rule gives).
 */
export function starterKit(inv, opts = {}) {
  const capacity = Math.max(1, Math.floor(opts.capacity ?? PACK_CAPACITY));
  const mint = [...packIntoBags(inv, opts).mint];
  const solo = mint.length;
  let bigger = mint.filter((c) => c === 'bag_bigger').length;
  for (; bigger < STARTER_FLOOR && mint.length < capacity - 1; bigger += 1) mint.push('bag_bigger');
  return { mint, solo };
}

/**
 * The arrangement packIntoBags makes, for bags that just arrived (the solo
 * migration's, or a multiplayer character's starter bags from the site's
 * ledger): the new bags first in the pack, a toolbox filled with tool stacks,
 * then each other bag with the stacks left, in auto-place order. Anything left
 * over is placed by layoutPack as usual (free pack slots, then the magic rock).
 * keep: the arrangement of the bags held before these arrived (prefs shape):
 * they keep their keys, their pack places (ahead of the new bags) and
 * everything in them; only the stacks outside them are laid into the new bags
 * (the source never moves a held stack when a bag arrives, bag.js:89-238).
 * Returns prefs (normalizePrefs shape).
 */
export function arrangeIntoBags(inv, mint, opts = {}, keep = null) {
  const { toolStacks, otherStacks } = stacksByKind(inv, opts);
  const list = (Array.isArray(mint) ? mint : []).filter((cls) => isBagClass(cls));
  const prefs = { bags: [], place: { pack: [] }, n: { pack: [] } };
  const kept = normalizePrefs(keep);
  const used = new Set();
  for (const entry of kept.place.pack || []) {
    const key = entry.startsWith('@') ? entry.slice(1) : '';
    const row = key && kept.bags.find((b) => b.key === key);
    if (!row || used.has(key)) continue;
    used.add(key);
    prefs.bags.push(row);
    prefs.place.pack.push(entry);
    prefs.n.pack.push(0);
    prefs.place[key] = [...(kept.place[key] || [])];
    prefs.n[key] = [...(kept.n[key] || [])];
    // What this bag holds stays in it, with its counts: those stacks are not laid out again.
    prefs.place[key].forEach((cls, i) => {
      for (const stacks of [toolStacks, otherStacks]) {
        const same = (s) => s.cls === cls;
        let at = stacks.findIndex((s) => same(s) && s.count === prefs.n[key][i]);
        if (at < 0) at = stacks.findLastIndex(same);
        if (at >= 0) { stacks.splice(at, 1); break; }
      }
    });
  }
  const keyOf = list.map((cls) => {
    const key = nextBagKey(used);
    used.add(key);
    return { cls, key };
  });
  for (const { cls, key } of keyOf) {
    prefs.bags.push({ key, cls });
    prefs.place.pack.push(`@${key}`);
    prefs.n.pack.push(0);
    prefs.place[key] = [];
    prefs.n[key] = [];
  }
  const fill = (key, stacks) => {
    prefs.place[key] = stacks.map((s) => s.cls);
    prefs.n[key] = stacks.map((s) => s.count);
  };
  // Toolboxes first take the tool stacks (as packIntoBags always did), then the bags that take anything.
  for (const { cls, key } of keyOf) {
    if (BAG_DEFS[cls].holds !== 'tool') continue;
    fill(key, toolStacks.splice(0, BAG_DEFS[cls].capacity));
  }
  const rest = [...toolStacks, ...otherStacks];
  for (const { cls, key } of keyOf) {
    if (BAG_DEFS[cls].holds !== 'any') continue;
    fill(key, rest.splice(0, BAG_DEFS[cls].capacity));
  }
  return prefs;
}

/**
 * A bag leaves the pack whole, with everything in it (a drop): in the source a
 * bag is a container whose contents are its own (items/bag.js), takeable_drop
 * moves the bag itemstack and all it holds (items/include/takeable.js 157-213,
 * apiPutItemIntoPosition), and takeable_drop_conditions lets a bag go down with
 * things in it unless one of them is soulbound (104-135, 122-130).
 * key: the bag the player chose (prefs bag key). Returns { ok, cls, contents:
 * [{ cls, count }], prefs, name? } (prefs: the arrangement once the bag and its
 * contents are out; the caller takes cls and each content's count from the
 * inventory; name: the bag's own, which goes with it), or { ok: false, reason }.
 */
export function takeBag(inv, prefs, key, opts = {}) {
  const layout = layoutPack(inv, prefs, opts);
  const box = layout.bags[String(key || '')];
  if (!box) return { ok: false, reason: 'missing' };
  const contents = box.slots.map((s) => ({ cls: s.cls, count: s.count }));
  const next = JSON.parse(JSON.stringify(layout.prefs));
  next.bags = next.bags.filter((b) => b.key !== box.key);
  const at = next.place.pack.indexOf(`@${box.key}`);
  if (at >= 0) {
    next.place.pack.splice(at, 1);
    next.n.pack.splice(at, 1);
  }
  delete next.place[box.key];
  delete next.n[box.key];
  return { ok: true, cls: box.cls, contents, prefs: next, ...(box.name ? { name: box.name } : {}) };
}

/**
 * Which bag of a class leaves the pack when one goes (a drop of an empty bag,
 * shared or not): the arrangement with `key` last among its class's bags, since
 * layoutPack keeps a class's first saved bags (the newest went before: player
 * report 2026-11-01). Returns prefs.
 */
export function bagLeavesLast(prefs, key) {
  const next = normalizePrefs(prefs);
  const row = next.bags.find((b) => b.key === String(key || ''));
  if (!row) return next;
  next.bags = [...next.bags.filter((b) => b !== row), row];
  return next;
}

/**
 * A bag comes back into the pack with what it held (a pick up): in the source a
 * bag only ever sits in the pack's own row (bag_generic.js canContain 588-590;
 * PackDisplayManager.as:675), so it takes a free pack slot, next to the other
 * bags; with none free it goes in place of the leftmost stack it can hold, which
 * goes in with it (the arrival rule, arrivalSlot). contents: [{ cls, count }] as
 * takeBag gave them. inv is the inventory before the bag and its contents are
 * added. name: the bag's own (takeBag gave it), which it keeps. Returns { ok, key,
 * prefs } (the caller adds the counts), or { ok: false, reason: 'full' } when it
 * can't fit without anything going to the magic rock.
 */
export function giveBag(inv, prefs, cls, contents = [], opts = {}, name = '') {
  if (!isBagClass(cls)) return { ok: false, reason: 'not_bag' };
  const def = BAG_DEFS[cls];
  const capacity = Math.max(1, Math.floor(opts.capacity ?? PACK_CAPACITY));
  const layout = layoutPack(inv, prefs, opts);
  const next = JSON.parse(JSON.stringify(layout.prefs));
  const key = nextBagKey(new Set(next.bags.map((b) => b.key)));
  const list = (Array.isArray(contents) ? contents : [])
    .map((c) => ({ cls: String(c?.cls || ''), count: Math.max(0, Math.floor(Number(c?.count) || 0)) }))
    .filter((c) => c.cls && c.count > 0);
  const own = canRenameBag(cls) ? cleanBagName(name) : '';
  next.bags.push(own ? { key, cls, name: own } : { key, cls });
  next.place[key] = list.map((c) => c.cls);
  next.n[key] = list.map((c) => c.count);
  const lastBag = next.place.pack.reduce((last, e, i) => (e.startsWith('@') ? i : last), -1);
  if (layout.pack.slots.length < capacity) {
    next.place.pack.splice(lastBag + 1, 0, `@${key}`);
    next.n.pack.splice(lastBag + 1, 0, 0);
  } else {
    const holds = list.length;
    const takes = (c) => holds < def.capacity && bagAccepts(def, c, opts) && !(def.onePerClass && list.some((x) => x.cls === c));
    const at = arrivalSlot(layout.pack.slots, capacity, takes, opts);
    if (at == null || at < 0) return { ok: false, reason: 'full' };
    const swallowed = layout.pack.slots[at];
    next.place.pack.splice(at, 1);
    next.n.pack.splice(at, 1);
    next.place[key].push(swallowed.cls);
    next.n[key].push(swallowed.count);
    next.place.pack.splice(lastBag + 1, 0, `@${key}`);
    next.n.pack.splice(lastBag + 1, 0, 0);
  }
  const after = { ...inv };
  after[cls] = (Number(after[cls]) || 0) + 1;
  for (const c of list) after[c.cls] = (Number(after[c.cls]) || 0) + c.count;
  const check = layoutPack(after, next, opts);
  const box = check.bags[key];
  if (!box || overflowOf(check) > overflowOf(layout)) return { ok: false, reason: 'full' };
  return { ok: true, key, prefs: check.prefs };
}

/**
 * Rename one bag (verbs.rename, onInputBoxResponse 605-611): a non-empty answer,
 * cleaned, is its new name; an empty one keeps the old. key: the bag's prefs key.
 * Returns { ok, prefs, name, changed } or { ok: false, reason }.
 */
export function renameBag(prefs, key, value) {
  const next = normalizePrefs(prefs);
  const row = next.bags.find((b) => b.key === String(key || ''));
  if (!row) return { ok: false, reason: 'missing', prefs: next };
  if (!canRenameBag(row.cls)) return { ok: false, reason: 'not_renamable', prefs: next };
  // verbs.rename 516: the name is the player's from now on, a sort's name included
  // (OK on the sort's name, as the box shows it, keeps it as the player's).
  const name = renamedTo(row.name || (row.sortNamed ? sortName(row.sort) : ''), value);
  const changed = name !== (row.name || '') || Boolean(row.sortNamed);
  if (name) row.name = name;
  delete row.sortNamed;
  return { ok: true, prefs: next, name, changed };
}

/**
 * Specialize one bag (verbs.sort_* handlers, bag.js doSpecialize 783-801), or
 * take its sort off with 'sort_all' (removeSpecialize 774-781). A bag with no
 * name of the player's takes the sort's name (and loses it with the sort); one
 * the player named keeps the name. key: the bag's prefs key.
 * Returns { ok, prefs, changed } or { ok: false, reason }.
 */
export function specializeBag(prefs, key, sortId) {
  const next = normalizePrefs(prefs);
  const row = next.bags.find((b) => b.key === String(key || ''));
  if (!row) return { ok: false, reason: 'missing', prefs: next };
  if (!canSpecializeBag(row.cls)) return { ok: false, reason: 'not_sortable', prefs: next };
  if (sortId === BAG_SORT_COPY.all.id) {
    const changed = Boolean(row.sort);
    delete row.sort;
    delete row.sortNamed;
    return { ok: true, prefs: next, changed };
  }
  const sort = bagSort(sortId);
  if (!sort) return { ok: false, reason: 'unknown_sort', prefs: next };
  if (row.sort === sort.id) return { ok: false, reason: sort.reason, prefs: next };
  row.sort = sort.id;
  if (!row.name) row.sortNamed = true;
  return { ok: true, prefs: next, changed: true };
}

/** What a bag box is for: its sort's categories, or the one kind a toolbox or spice rack takes (getCustomBagCategories). */
function boxIsFor(box, cls, opts) {
  if (!box) return false;
  if (!bagAccepts(BAG_DEFS[box.cls], cls, opts)) return false;
  if (box.sort) return sortTakes(box.sort, cls, opts);
  return box.holds !== 'any';
}

/** magic_sort conditions (bag_generic_gray.js 428-436): a sorted bag, or one with custom categories. */
export function canMagicSort(box) {
  return Boolean(box && (box.sort || box.holds !== 'any'));
}

/**
 * Magic Sort on one bag (verbs.magic_sort 438-445, apiInventoryMagicSort): the
 * stacks the bag is for come into it from the pack and the other bags (not out
 * of a bag that is itself sorted for them, nor a limited one); when it is full,
 * one it is not for swaps places with the one coming in; then what it is not
 * for goes to another bag that is for it when one has room. Counts never change.
 * Returns { ok, prefs, moved } or { ok: false, reason }.
 */
export function magicSort(inv, prefs, key, opts = {}) {
  const layout = layoutPack(inv, prefs, opts);
  const box = layout.bags[String(key || '')];
  if (!box) return { ok: false, reason: 'missing', prefs: layout.prefs };
  if (!canMagicSort(box)) return { ok: false, reason: BAG_SORT_COPY.magic.unsorted, prefs: layout.prefs };
  const next = JSON.parse(JSON.stringify(layout.prefs));
  const keyOf = (container) => (container === layout.pack ? 'pack' : container.key);
  const boxes = Object.values(layout.bags);
  const accepts = (container, cls) => {
    if (container === layout.pack) return packAccepts(cls);
    const def = BAG_DEFS[container.cls];
    if (!bagAccepts(def, cls, opts)) return false;
    if (def.onePerClass && (next.place[container.key] || []).includes(cls)) return false;
    return true;
  };
  const here = () => next.place[box.key];
  const hereN = () => next.n[box.key];
  // Where each stack started ("key#index"), moved with it: a tool's wear rides with its unit (unitOrder).
  const ids = Object.fromEntries(Object.entries(next.place).map(([k, list]) => [k, list.map((_, i) => `${k}#${i}`)]));
  const hereId = () => ids[box.key];
  let moved = 0;
  // Sources in slot order: the pack's stacks, then each other bag's where it sits.
  const sources = [];
  layout.pack.slots.forEach((s, i) => {
    if (s.kind === 'bag') {
      const other = layout.bags[s.key];
      if (!other || other.key === box.key || other.limited) return;
      other.slots.forEach((t) => { if (!boxIsFor(other, t.cls, opts)) sources.push({ container: other, cls: t.cls }); });
    } else {
      sources.push({ container: layout.pack, cls: s.cls });
    }
  });
  for (const src of sources) {
    if (!boxIsFor(box, src.cls, opts)) continue;
    const srcKey = keyOf(src.container);
    const list = next.place[srcKey];
    const nums = next.n[srcKey];
    const at = list.indexOf(src.cls);
    if (at < 0) continue;
    let count = nums[at];
    // Top up the bag's own stacks of the class first (bag.js:191-206).
    const max = stackMaxOf(src.cls, opts.catalog);
    here().forEach((c, i) => {
      if (count <= 0 || c !== src.cls) return;
      const add = Math.min(count, Math.max(0, max - hereN()[i]));
      hereN()[i] += add;
      count -= add;
    });
    if (count <= 0) {
      list.splice(at, 1);
      nums.splice(at, 1);
      ids[srcKey].splice(at, 1);
      moved += 1;
      continue;
    }
    if (box.onePerClass && here().includes(src.cls)) {
      nums[at] = count;
      continue;
    }
    if (here().length < box.capacity) {
      list.splice(at, 1);
      nums.splice(at, 1);
      const [id] = ids[srcKey].splice(at, 1);
      here().push(src.cls);
      hereN().push(count);
      hereId().push(id);
      moved += 1;
      continue;
    }
    // Full: swap out the first stack it is not for, when the source's place can hold it.
    const out = here().findIndex((c) => !boxIsFor(box, c, opts) && (src.container === layout.pack ? packAccepts(c) : bagAccepts(BAG_DEFS[src.container.cls], c, opts)));
    if (out < 0) {
      nums[at] = count;
      continue;
    }
    const [outCls] = here().splice(out, 1, src.cls);
    const [outN] = hereN().splice(out, 1, count);
    const [outId] = hereId().splice(out, 1, ids[srcKey][at]);
    list.splice(at, 1, outCls);
    nums.splice(at, 1, outN);
    ids[srcKey].splice(at, 1, outId);
    moved += 1;
  }
  // What the bag is not for: to another bag that is for it, with room.
  for (let i = here().length - 1; i >= 0; i -= 1) {
    const cls = here()[i];
    if (boxIsFor(box, cls, opts)) continue;
    const dest = boxes.find((b) => b.key !== box.key && boxIsFor(b, cls, opts) && (next.place[b.key] || []).length < b.capacity && accepts(b, cls));
    if (!dest) continue;
    const [c] = here().splice(i, 1);
    const [n] = hereN().splice(i, 1);
    const [id] = hereId().splice(i, 1);
    (next.place[dest.key] ||= []).push(c);
    (next.n[dest.key] ||= []).push(n);
    (ids[dest.key] ||= []).push(id);
    moved += 1;
  }
  const after = layoutPack(inv, next, opts);
  if (overflowOf(after) > overflowOf(layout)) return { ok: true, prefs: layout.prefs, moved: 0, trace: null };
  return { ok: true, prefs: after.prefs, moved, trace: ids };
}

/**
 * The units of a class after a magicSort, in unitPlaces order, as their ranks
 * before it: order[newRank] = oldRank (null when it can't be told). trace: what
 * magicSort returned (each final place's "key#index" before the sort).
 */
export function unitOrder(before, after, trace, cls) {
  if (!trace) return null;
  const was = new Map();
  unitPlaces(before, cls).forEach((p, r) => { if (!was.has(`${p.container}#${p.index}`)) was.set(`${p.container}#${p.index}`, r); });
  const out = [];
  for (const p of unitPlaces(after, cls)) {
    const id = trace[p.container]?.[p.index];
    const r = id ? was.get(id) : undefined;
    if (r === undefined) return null;
    out.push(r);
  }
  return out;
}

/**
 * Stack Up (verbs.stack_up 466-471, apiInventoryStackUp): for each class, its
 * partial stacks across the pack and its bags fill the first ones in slot order
 * (a bag's slots where the bag sits), and the stacks left empty free their slots.
 * Nothing changes container. Returns { ok, prefs, merged } (merged: stacks freed).
 */
export function stackUp(inv, prefs, opts = {}) {
  const layout = layoutPack(inv, prefs, opts);
  const next = JSON.parse(JSON.stringify(layout.prefs));
  const refs = new Map(); // cls -> [{ key, index }] in slot order
  const add = (key, cls, index) => {
    if (!refs.has(cls)) refs.set(cls, []);
    refs.get(cls).push({ key, index });
  };
  next.place.pack.forEach((e, i) => {
    if (e.startsWith('@')) (next.place[e.slice(1)] || []).forEach((cls, j) => add(e.slice(1), cls, j));
    else add('pack', e, i);
  });
  const drop = new Map(); // key -> Set of indexes
  let merged = 0;
  for (const [cls, list] of refs) {
    if (list.length < 2) continue;
    const max = stackMaxOf(cls, opts.catalog);
    let total = list.reduce((a, r) => a + (next.n[r.key][r.index] || 0), 0);
    for (const r of list) {
      const take = Math.min(max, total);
      total -= take;
      if (take > 0) next.n[r.key][r.index] = take;
      else {
        if (!drop.has(r.key)) drop.set(r.key, new Set());
        drop.get(r.key).add(r.index);
        merged += 1;
      }
    }
  }
  for (const [key, idx] of drop) {
    next.place[key] = next.place[key].filter((_, i) => !idx.has(i));
    next.n[key] = next.n[key].filter((_, i) => !idx.has(i));
  }
  const after = layoutPack(inv, next, opts);
  return { ok: true, prefs: after.prefs, merged };
}
