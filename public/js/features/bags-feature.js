/**
 * Bags (G152): the pack's 16 slots, the bags in them and the magic rock.
 *
 * Rules: js/pack-slots.js (source citations there). This feature keeps the
 * saved arrangement, answers game.js's pack questions and says what the
 * source said:
 *  - query('packLayout', engine): the layout game.js draws (pack slots, each
 *    bag's slots, what the magic rock holds), after taking in any change to
 *    the pack. Something that no longer fits is held by the magic rock with
 *    the source's prompt (inc_rewards.js:80-84); it comes back by itself when
 *    room frees, with rewards_return's line (inc_rewards.js:140-155).
 *  - query('packRoom', classTsid, count, engine): how many fit (pick up and
 *    vendor buy refuse with the source's words when none do).
 *  - query('packMove', from, to, engine): a drag between the pack and a bag.
 *  - query('packToggleBag', key, engine) / query('packOpenBag'): one open
 *    bag at a time (PackDisplayManager.as:1101-1103), remembered in the save
 *    as the client remembered it (OPEN_CONTAINER_TSID, :137-139).
 *  - decorateVerbs: pick up is disabled "Your inventory is full!" when the
 *    stack can't fit (takeable.js:48).
 *  - packVerbs: Put in <bag> / Take out of <bag> on a stack's popover, the
 *    same move without a drag (touch and keyboard).
 *
 * First load of a save from before bags: a solo game is packed into bags (a
 * Red Toolbox when tools spill, then Bigger Bags) so everything it held still
 * fits and the pack keeps its free slots; the solo demo kit arrives the same
 * way. A multiplayer save never gets bags it didn't buy (the ledger would see
 * new value): what doesn't fit is held by the magic rock.
 *
 * Departures (see js/pack-slots.js): every overflow is held by the magic rock
 * (the source put things made from a source on the ground); rock-held stacks
 * are out of the pack but recipes and quests still count them; elements may
 * use pack slots; a bag that leaves the pack leaves its contents behind.
 *
 * QA: `?autostart=1&fresh=1&resetgame=1&questoffer=off&bagdemo=1` empties the
 * pack to a Generic Bag and 15 stacks (16/16, the bag empty) and drops 5 Plums
 * beside you; `bagdemo=full` fills the bag's 10 slots too, so the Plums can't
 * be picked up.
 * Canvas data packSlots (used/16), packBags, packBagOpen, packRock,
 * packLast, bagDemo; window.groddlePack.{layout,counts,room,move,toggle}, and in solo
 * grant(class, n) to gain something the way a reward does.
 */

import { ITEM_CATALOG, addItem, isToolItem } from '../inventory.js?v=catalog-unified-7';
import {
  BAG_DEFS,
  PACK_CAPACITY,
  PACK_COPY,
  bagAccepts,
  isBagClass,
  layoutPack,
  moveStack,
  normalizePrefs,
  packIntoBags,
  roomFor,
} from '../pack-slots.js?v=g152-1';

export const BAGS_FEATURE_ID = 'bags';
export const BAG_DEMO_KIT = Object.freeze([
  'apple', 'cherry', 'grain', 'meat', 'orange', 'lemon', 'spinach', 'plain_bubble',
  'general_vapour', 'all_spice', 'seed_spinach', 'seed_onion', 'seed_carrot', 'fuel_cell', 'pinch_of_salt',
]);
/** bagdemo=full also fills the bag, so nothing fits anywhere (isBagFull, bag.js:443-462). */
export const BAG_DEMO_FILL = Object.freeze([
  'flour', 'bun', 'sammich', 'egg_plain', 'bean_plain', 'milk_butterfly', 'seed_tomato', 'seed_corn', 'seed_potato', 'herb_seed_purple_flower',
]);
export const BAG_DEMO_DROP = Object.freeze({ classTsid: 'plum', count: 5, dx: 70 });

const fresh = () => ({ v: 1, prefs: normalizePrefs(null), rock: {}, open: '', migrated: false });
let slice = fresh();
let lastLayout = null;
let demoDone = false;

function opts() {
  const labels = {};
  for (const [cls, meta] of Object.entries(ITEM_CATALOG)) labels[cls] = meta.label;
  return { capacity: PACK_CAPACITY, catalog: ITEM_CATALOG, isTool: isToolItem, order: Object.keys(ITEM_CATALOG), labels };
}

function nameOf(cls, n) {
  const meta = ITEM_CATALOG[cls];
  const single = meta?.label || String(cls).replace(/_/g, ' ');
  const plural = meta?.namePlural || `${single}s`;
  return n === 1 ? `${/^[aeiou]/i.test(single) ? 'an' : 'a'} ${single}` : `${n} ${plural}`;
}

function listText(parts) {
  if (parts.length > 4) parts = [...parts.slice(0, 3), `${parts.length - 3} more things`];
  if (parts.length <= 1) return parts[0] || '';
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

function cleanRock(value) {
  const out = {};
  if (!value || typeof value !== 'object') return out;
  for (const [cls, n] of Object.entries(value)) {
    const k = Math.floor(Number(n));
    if (/^[a-z0-9_]{1,64}$/.test(cls) && k > 0) out[cls] = k;
  }
  return out;
}

/** Compare what the rock held with what it holds now: new holdings and what came back into slots. */
export function rockChanges(before, after, slottedBefore = {}, slottedAfter = {}) {
  const holding = [];
  const given = [];
  for (const [cls, n] of Object.entries(after)) {
    const more = n - (before[cls] || 0);
    if (more > 0) holding.push({ cls, n: more });
  }
  for (const [cls, n] of Object.entries(before)) {
    const less = n - (after[cls] || 0);
    const slottedMore = (slottedAfter[cls] || 0) - (slottedBefore[cls] || 0);
    const back = Math.min(less, slottedMore);
    if (back > 0) given.push({ cls, n: back });
  }
  return { holding, given };
}

function publish(engine, layout) {
  if (!engine?.setData || !layout) return;
  engine.setData('packSlots', `${layout.used}/${layout.capacity}`);
  engine.setData('packBags', Object.values(layout.bags).map((b) => `${b.cls}:${b.slots.length}/${b.capacity}`).join(','));
  engine.setData('packBagOpen', slice.open && layout.bags[slice.open] ? `${slice.open}:${layout.bags[slice.open].cls}` : '');
  engine.setData('packRock', Object.entries(layout.rock).map(([c, n]) => `${c}:${n}`).join(','));
}

function say(engine, text) {
  if (!text) return;
  engine?.setData?.('packLast', text);
  engine?.pushActivity?.(text);
  engine?.toast?.(text, 5000);
}

/** Solo saves from before bags: pack them into bags once. */
function migrate(engine) {
  if (slice.migrated) return;
  slice.migrated = true;
  if (engine?.mode === 'multiplayer') return;
  const inv = engine.inv;
  const plan = packIntoBags(inv, opts());
  if (!plan.mint.length) return;
  for (const cls of plan.mint) addItem(inv, cls, 1);
  slice.prefs = normalizePrefs(plan.prefs);
  const names = plan.mint.reduce((acc, cls) => ((acc[cls] = (acc[cls] || 0) + 1), acc), {});
  const text = `Your pack has ${PACK_CAPACITY} slots now. Everything you carried is packed into ${listText(Object.entries(names).map(([c, n]) => nameOf(c, n)))}.`;
  engine?.setData?.('packMigrated', plan.mint.join(','));
  say(engine, text);
}

function runDemo(engine) {
  if (demoDone || !engine?.started || !engine.param?.('bagdemo')) return;
  demoDone = true;
  const inv = engine.inv;
  for (const k of Object.keys(inv)) inv[k] = 0;
  addItem(inv, 'bag_generic', 1);
  for (const cls of BAG_DEMO_KIT) addItem(inv, cls, cls === 'apple' ? 3 : 2);
  if (engine.param('bagdemo') === 'full') for (const cls of BAG_DEMO_FILL) addItem(inv, cls, 1);
  slice.prefs = normalizePrefs(null);
  slice.rock = {};
  slice.open = '';
  slice.migrated = true;
  const p = engine.player;
  if (p && engine.dropWorldStack) engine.dropWorldStack(BAG_DEMO_DROP.classTsid, BAG_DEMO_DROP.count, p.x + BAG_DEMO_DROP.dx, p.y);
  engine.setData?.('bagDemo', 'ready');
  engine.updateHud?.();
}

/** The layout, taking in whatever changed in the pack since the last look. */
function reconcile(engine) {
  const inv = engine?.inv || {};
  if (engine?.started) migrate(engine);
  const layout = layoutPack(inv, slice.prefs, opts());
  if (engine?.started) {
    const before = lastLayout;
    const changes = rockChanges(slice.rock, layout.rock, before?.slotted || layout.slotted, layout.slotted);
    if (changes.holding.length) {
      const total = changes.holding.reduce((a, r) => a + r.n, 0);
      say(engine, PACK_COPY.rockHolding(listText(changes.holding.map((r) => nameOf(r.cls, r.n))), total > 1));
    }
    if (changes.given.length && before) {
      const total = changes.given.reduce((a, r) => a + r.n, 0);
      say(engine, PACK_COPY.rockGiven(listText(changes.given.map((r) => nameOf(r.cls, r.n).replace(/^an? /, ''))), total > 1));
    }
    slice.prefs = layout.prefs;
    slice.rock = { ...layout.rock };
    if (slice.open && !layout.bags[slice.open]) slice.open = '';
    lastLayout = layout;
  }
  publish(engine, layout);
  return layout;
}

function stackPlaces(layout, cls) {
  const out = [];
  layout.pack.slots.forEach((s, i) => { if (s.kind === 'stack' && s.cls === cls) out.push({ container: 'pack', index: i }); });
  for (const [key, box] of Object.entries(layout.bags)) {
    box.slots.forEach((s, i) => { if (s.cls === cls) out.push({ container: key, index: i }); });
  }
  return out;
}

function doMove(engine, from, to) {
  const result = moveStack(engine.inv, slice.prefs, from, to, opts());
  if (result.ok) {
    slice.prefs = normalizePrefs(result.prefs);
    engine.setData?.('packLast', 'moved');
  } else if (result.reason) {
    engine.setData?.('packLast', result.reason);
  }
  return result;
}

export const bagsFeature = {
  id: BAGS_FEATURE_ID,

  init(engine) {
    if (typeof globalThis === 'undefined') return;
    globalThis.groddlePack = {
      layout: () => layoutPack(engine.inv, slice.prefs, opts()),
      /** Everything held per class, slotted or rock-held (the inventory counts). */
      counts: () => Object.fromEntries(Object.entries(engine.inv).filter(([, n]) => n > 0)),
      room: (cls, n = 1) => roomFor(engine.inv, slice.prefs, cls, n, opts()),
      move: (from, to) => doMove(engine, from, to),
      toggle: (key) => bagsFeature.packToggleBag(key, engine),
      // Solo QA only: gain something as any reward would (a full pack's magic rock takes it).
      ...(engine?.mode === 'multiplayer' ? {} : { grant: (cls, n = 1) => { addItem(engine.inv, String(cls), Math.max(1, Math.floor(n))); engine.updateHud?.(); } }),
      get slice() { return JSON.parse(JSON.stringify(slice)); },
    };
  },

  onTick(_dt, _now, engine) {
    runDemo(engine);
  },

  packLayout(engine) {
    return reconcile(engine);
  },

  packRoom(classTsid, count, engine) {
    return roomFor(engine?.inv || {}, slice.prefs, String(classTsid || ''), count, opts());
  },

  packMove(from, to, engine) {
    return doMove(engine, from, to);
  },

  packOpenBag() {
    return slice.open || '';
  },

  packToggleBag(key, engine) {
    const k = String(key || '');
    slice.open = slice.open === k ? '' : k;
    engine?.setData?.('packBagOpen', slice.open);
    return slice.open;
  },

  /** takeable.js:48: the pick up verb is disabled when nothing of the stack fits. */
  decorateVerbs(target, verbs, engine) {
    if (!Array.isArray(verbs) || !verbs.some((v) => v?.id === 'pickup' && v.enabled !== false)) return null;
    const cls = target?.classId === 'dropped_item' ? target?.state?.classTsid : target?.classId;
    if (!cls) return null;
    const room = roomFor(engine?.inv || {}, slice.prefs, cls, 1, opts());
    if (room > 0) return null;
    return verbs.map((v) => (v?.id === 'pickup' ? { ...v, enabled: false, reason: PACK_COPY.pickupDisabled } : v));
  },

  packVerbs(classTsid, engine) {
    const cls = String(classTsid || '');
    if (!cls || isBagClass(cls) || !engine?.inv) return null;
    const layout = layoutPack(engine.inv, slice.prefs, opts());
    const places = stackPlaces(layout, cls);
    if (!places.length) return null;
    const out = [];
    const inPack = places.some((p) => p.container === 'pack');
    if (inPack) {
      for (const box of Object.values(layout.bags)) {
        if (!bagAccepts(BAG_DEFS[box.cls], cls, opts())) continue;
        const full = box.slots.length >= box.capacity;
        out.push({ id: `bags_put:${box.key}`, label: `Put in ${box.label}`, enabled: !full, reason: full ? PACK_COPY.noRoom(box.label) : '', tooltip: PACK_COPY.moveTo(box.label) });
        if (out.length >= 3) break;
      }
    }
    for (const p of places) {
      if (p.container === 'pack' || out.some((v) => v.id === `bags_take:${p.container}`)) continue;
      const box = layout.bags[p.container];
      const full = layout.free <= 0;
      out.push({ id: `bags_take:${p.container}`, label: `Take out of ${box.label}`, enabled: !full, reason: full ? PACK_COPY.noRoom('your pack') : '', tooltip: PACK_COPY.moveHere });
    }
    return out.length ? out : null;
  },

  runPackVerb(classTsid, verbId, engine) {
    const m = /^bags_(put|take):([a-zA-Z0-9_]+)$/.exec(String(verbId || ''));
    if (!m) return false;
    const layout = layoutPack(engine.inv, slice.prefs, opts());
    const places = stackPlaces(layout, String(classTsid || ''));
    const from = m[1] === 'put'
      ? [...places].reverse().find((p) => p.container === 'pack')
      : [...places].reverse().find((p) => p.container === m[2]);
    if (!from) return true;
    const result = doMove(engine, from, m[1] === 'put' ? { bag: m[2] } : { container: 'pack' });
    if (!result.ok && result.reason) engine.toast?.(result.reason, 3000);
    engine.playSound?.(result.ok ? 'CLICK_SUCCESS' : 'CLICK_FAILURE', { volume: 0.45 });
    engine.updateHud?.();
    return true;
  },

  save() {
    return { v: 1, prefs: slice.prefs, rock: slice.rock, open: slice.open, migrated: slice.migrated };
  },

  restore(saved) {
    slice = fresh();
    lastLayout = null;
    if (!saved || typeof saved !== 'object') return;
    slice.prefs = normalizePrefs(saved.prefs);
    slice.rock = cleanRock(saved.rock);
    slice.open = typeof saved.open === 'string' ? saved.open.replace(/[^a-zA-Z0-9_]/g, '').slice(0, 40) : '';
    slice.migrated = saved.migrated === true;
  },
};
