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
 * the player put them and new arrivals are what doesn't fit. What doesn't fit
 * is held by the magic rock (the source's familiar overflow) and comes back by
 * itself when room frees. A class's count is split into full stacks first and
 * one remainder stack last.
 *
 * prefs = { bags: [{ key, cls }], place: { pack: [entry], <bagKey>: [cls] } }
 *   pack entries are a class (one stack) or '@<bagKey>' (a bag in that slot).
 */

import {
  COMPOUND_CLASSES,
  CUBIMAL_CLASSES,
  ELEMENT_CLASSES,
  NO_BAG_CLASSES,
  NO_SLOT_CLASSES,
  SPICE_CLASSES,
  STACKMAX,
  TOOL_CLASSES,
} from './pack-slots-data.js?v=g152-1';

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

/** Saved arrangement, cleaned. */
export function normalizePrefs(seed) {
  const out = { bags: [], place: { pack: [] } };
  if (!seed || typeof seed !== 'object') return out;
  const seen = new Set();
  for (const row of Array.isArray(seed.bags) ? seed.bags : []) {
    const key = cleanKey(row?.key);
    const cls = cleanKey(row?.cls);
    if (!key || !isBagClass(cls) || seen.has(key)) continue;
    seen.add(key);
    out.bags.push({ key, cls });
  }
  const place = seed.place && typeof seed.place === 'object' ? seed.place : {};
  for (const [rawKey, list] of Object.entries(place)) {
    const key = rawKey === 'pack' ? 'pack' : cleanKey(rawKey);
    if (!key || (key !== 'pack' && !seen.has(key)) || !Array.isArray(list)) continue;
    out.place[key] = list
      .map((entry) => (typeof entry === 'string' && entry.startsWith('@') ? `@${cleanKey(entry.slice(1))}` : cleanKey(entry)))
      .filter((entry) => entry && entry !== '@')
      .slice(0, 64);
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
 * @param {{ capacity?: number, catalog?: object, isTool?: (cls: string) => boolean, order?: string[], labels?: Record<string,string> }} [opts]
 */
export function layoutPack(inv, prefs = null, opts = {}) {
  const capacity = Math.max(1, Math.floor(opts.capacity ?? PACK_CAPACITY));
  const saved = normalizePrefs(prefs);
  // Bag instances: the saved ones of each class first (in saved order), then new keys.
  const used = new Set();
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
    for (const row of rows) {
      used.add(row.key);
      instances.push({ key: row.key, cls, placed: false });
    }
    for (let i = rows.length; i < n; i += 1) {
      const key = nextBagKey(used);
      used.add(key);
      instances.push({ key, cls, placed: false, fresh: true });
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
    const box = { key: inst.key, cls: inst.cls, label: labelOf(inst.cls), capacity: def.capacity, holds: def.holds, limited: def.limited, onePerClass: Boolean(def.onePerClass), slots: [] };
    boxes.set(inst.key, box);
    return box;
  };
  const putBag = (inst) => {
    inst.placed = true;
    pack.slots.push({ kind: 'bag', key: inst.key, cls: inst.cls, count: 1 });
    openBox(inst);
  };
  const boxTakes = (box, cls) => {
    if (box.slots.length >= box.capacity) return false;
    if (!bagAccepts(BAG_DEFS[box.cls], cls, opts)) return false;
    if (box.onePerClass && box.slots.some((s) => s.cls === cls)) return false;
    return true;
  };
  const putStack = (container, cls) => {
    const queue = left.get(cls);
    container.slots.push({ kind: 'stack', cls, count: queue.shift() });
  };
  const has = (cls) => (left.get(cls)?.length || 0) > 0;

  // Phase 1: the saved pack, then each placed bag's saved contents.
  for (const entry of saved.place.pack || []) {
    if (pack.slots.length >= capacity) break;
    if (entry.startsWith('@')) {
      const inst = byKey.get(entry.slice(1));
      if (inst && !inst.placed) putBag(inst);
    } else if (has(entry) && packAccepts(entry)) {
      putStack(pack, entry);
    }
  }
  for (const slot of pack.slots) {
    if (slot.kind !== 'bag') continue;
    const box = boxes.get(slot.key);
    for (const cls of saved.place[slot.key] || []) {
      if (has(cls) && boxTakes(box, cls)) putStack(box, cls);
    }
  }
  // Phase 2a: bags that have no saved place take free pack slots first.
  for (const inst of instances) {
    if (!inst.placed && pack.slots.length < capacity) putBag(inst);
  }
  // Phase 2b: every other stack, the source's order: limited bags, then the pack, then the other bags.
  const bagSlots = () => pack.slots.filter((s) => s.kind === 'bag').map((s) => boxes.get(s.key));
  for (const cls of order) {
    while (has(cls)) {
      const all = bagSlots();
      const target =
        all.find((b) => b.limited && boxTakes(b, cls)) ||
        (pack.slots.length < capacity && packAccepts(cls) ? pack : null) ||
        all.find((b) => !b.limited && boxTakes(b, cls));
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
  const rockBags = instances.filter((b) => !b.placed).map((b) => ({ key: b.key, cls: b.cls }));
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
    bags: instances.map((b) => ({ key: b.key, cls: b.cls })),
    place: { pack: pack.slots.map((s) => (s.kind === 'bag' ? `@${s.key}` : s.cls)) },
  };
  for (const [key, box] of boxes) nextPrefs.place[key] = box.slots.map((s) => s.cls);
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
  const entry = slot.kind === 'bag' ? `@${slot.key}` : slot.cls;
  const list = next.place[srcKey];
  const at = Math.floor(Number(from.index));
  if (list[at] === entry) list.splice(at, 1);
  else list.splice(list.indexOf(entry), 1);
  if (srcKey === destKey) {
    const idx = Number.isFinite(Number(to?.index)) ? Math.max(0, Math.min(list.length, Math.floor(Number(to.index)))) : list.length;
    list.splice(idx, 0, entry);
    return { ok: true, prefs: next };
  }
  const destList = (next.place[destKey] ||= []);
  if (dest.slots.length >= dest.capacity) {
    // A full container still takes a stack that merges into one of its own (bag.js:191-206).
    const merges = slot.kind === 'stack' && dest.slots.some((s) => s.cls === slot.cls && s.count + slot.count <= stackMaxOf(slot.cls, opts.catalog));
    if (!merges) return { ok: false, reason: PACK_COPY.noRoom(dest.label || PACK_LABEL), prefs: layout.prefs };
  }
  const idx = Number.isFinite(Number(to?.index)) ? Math.max(0, Math.min(destList.length, Math.floor(Number(to.index)))) : destList.length;
  destList.splice(idx, 0, entry);
  // A stack moving out of the pack keeps the pack's later stacks of the same class where they are.
  const after = layoutPack(inv, next, opts);
  const landed = destKey === 'pack'
    ? after.pack.slots.some((s) => (slot.kind === 'bag' ? s.key === slot.key : s.cls === slot.cls))
    : (after.bags[destKey]?.slots || []).some((s) => s.cls === slot.cls);
  if (!landed || overflowOf(after) > overflowOf(layout)) {
    return { ok: false, reason: PACK_COPY.noRoom(dest.label || PACK_LABEL), prefs: layout.prefs };
  }
  return { ok: true, prefs: after.prefs };
}

/** Each stack's class, split as the pack would (full stacks first): tools and the rest, in auto-place order. */
function stacksByKind(inv, opts) {
  const toolStacks = [];
  const otherStacks = [];
  for (const cls of classOrder(inv, opts)) {
    if (isBagClass(cls) || takesNoSlot(cls)) continue;
    const stacks = splitStacks(inv[cls], stackMaxOf(cls, opts.catalog));
    for (let i = 0; i < stacks.length; i += 1) (isToolClass(cls, opts) ? toolStacks : otherStacks).push(cls);
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
 * then each other bag with the stacks left, in auto-place order. Bags the
 * pack held before and anything left over are placed by layoutPack as usual
 * (free pack slots, then the magic rock). Returns prefs (normalizePrefs shape).
 */
export function arrangeIntoBags(inv, mint, opts = {}) {
  const { toolStacks, otherStacks } = stacksByKind(inv, opts);
  const list = (Array.isArray(mint) ? mint : []).filter((cls) => isBagClass(cls));
  const prefs = { bags: [], place: { pack: [] } };
  const keyOf = list.map((cls, i) => ({ cls, key: `b${i + 1}` }));
  for (const { cls, key } of keyOf) {
    prefs.bags.push({ key, cls });
    prefs.place.pack.push(`@${key}`);
    prefs.place[key] = [];
  }
  // Toolboxes first take the tool stacks (as packIntoBags always did), then the bags that take anything.
  for (const { cls, key } of keyOf) {
    if (BAG_DEFS[cls].holds !== 'tool') continue;
    prefs.place[key] = toolStacks.splice(0, BAG_DEFS[cls].capacity);
  }
  const rest = [...toolStacks, ...otherStacks];
  for (const { cls, key } of keyOf) {
    if (BAG_DEFS[cls].holds !== 'any') continue;
    prefs.place[key] = rest.splice(0, BAG_DEFS[cls].capacity);
  }
  return prefs;
}
