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
 *  - query('packFocus', place, engine): the stack an open menu is about (its
 *    slot's container and index), so the menu, its counts and its verbs stay on
 *    that stack however many stacks of the item there are; query('packTakeFrom',
 *    cls, n, engine, { place, wait }): a verb on it (drop, give, eat) takes from that
 *    stack, now or when the server answers (main.js doVerb 2926-3250 acts on the
 *    itemstack the client named, its count capped at that stack's; player report
 *    2026-11-01: the menu jumped to the first stack and a drop took from it).
 *
 * First load of a save from before bags: a solo game is packed into bags (a
 * Red Toolbox when tools spill, then Bigger Bags) so everything it held still
 * fits and the pack keeps its free slots; the solo demo kit arrives the same
 * way. A multiplayer save never gets bags it didn't buy (the ledger would see
 * new value): what doesn't fit is held by the magic rock.
 *
 * Starter bags (Austin 2026-10-27): a multiplayer character made before bags
 * asks the site once (POST groddle/v1/ledger/starter-bags, site
 * src/LedgerStarter.php), which decides from its own records: the solo
 * migration's kit for what the ledger says the pack holds, topped up to at
 * least 2 Bigger Bags as a welcome gift (Austin 2026-10-27: a floor for
 * everyone; pack-slots.js starterKit mirrors it), or nothing for a character
 * newer than bags (they buy theirs in the tutorial). A grant is a settled ledger trade with the fixed id
 * starter-bags-<user>: the page applies it once through the trade slice's
 * applied list (ledgerReceipt), or the site's load already did
 * (Ledger::catchUp); either way the held stacks are then laid into the new
 * bags as the solo migration lays them (arrangeIntoBags) and one notice says
 * what was given and why. The slice remembers the answer (starter), so a
 * character asks only until the site has decided.
 *
 * Departures (see js/pack-slots.js): every overflow is held by the magic rock
 * (the source put things made from a source on the ground); rock-held stacks
 * are out of the pack but recipes and quests still count them; a bag that leaves the pack some other way (given,
 * traded) leaves its contents behind (a vendor buys only an empty bag: packSaleBags, report #79), but a dropped bag takes them with it and
 * brings them back when it is picked up, as the source's did (packTakeBag,
 * packGiveBag; player report 2026-11-01); a
 * bag that arrives (bought, a reward, a gift, mail, picked up, made) goes in
 * place of the leftmost pack slot that is not a bag and takes the stack there
 * in with it, so a full pack still takes one (Austin 2026-10-31; the source
 * put it in the first free slot and refused a full pack, bag.js:89-238,
 * inc_stores.js:170-173). Bags held and what they hold never move.
 *
 * Rename (items/bag_bigger.js verbs.rename 475-520, onInputBoxResponse 605-611;
 * js/bag-names.js): every bag's menu has Rename (sort_on 67), which asks "Name
 * Me!" / "My new name:" for that one bag (the menu's bag, packBagMenu). The
 * name is kept on the bag's row in the arrangement (pack-slots.js renameBag),
 * so it saves with the player (online too: the save route keeps the slice as
 * it is, and the ledger counts classes only), goes with the bag when it is
 * dropped and comes back when it is picked up (a named bag stays the player's
 * own on the ground, even empty: the shared ground carries no names). A bag the
 * player put down can be renamed where it lies (decorateVerbs adds Rename to its
 * ground menu; renameDroppedBag). A bag given, traded, mailed or sold goes as a
 * class and a count (trade goods { c, n, r }), so it arrives with its class name.
 *
 * Sorting (the pack cards; pack-slots.js BAG_SORTS, specializeBag, magicSort,
 * stackUp): a bag's menu lists, in sort_on order before Rename, one Sort row
 * with Internal Sortitude (Generic and Bigger Bags) whose second level holds
 * All and the fourteen sorts, Magic sort with Magic Sort (a sorted bag, or a
 * toolbox, spice rack, kit, pouch or case), and Stack up with Stack Up (every
 * bag). Each is the menu's
 * bag (packBagMenu); the activity lines are the source's. With Internal
 * Sortitude what arrives goes into the bags sorted for it first (opts().sortitude).
 *
 * QA: `?autostart=1&fresh=1&resetgame=1&questoffer=off&bagdemo=1` empties the
 * pack to a Generic Bag and 15 stacks (16/16, the bag empty) and drops 5 Plums
 * beside you; `bagdemo=full` fills the bag's 10 slots too, so the Plums can't
 * be picked up; `&bagname=Lunchbox` names the demo's bag. `bagdemo=hero` is the home page's pack (tools/landing/shots.mjs): no
 * bags or toolbox, a few things gathered loose (HERO_PACK) and the tools on their row
 * (HERO_TOOLS), with nothing dropped.
 * Canvas data packSlots (used/16), packBags, packBagOpen, packBagNames (key:cls:name
 * for each named bag), packRock, packLast, bagDemo;
 * window.groddlePack.{layout,counts,room,move,toggle,rename}, and in solo
 * grant(class, n) to gain something the way a reward does.
 */

import { ITEM_CATALOG, addItem, isToolItem, removeItem } from '../inventory.js?v=5be47371';
import {
  BAG_DEFS,
  PACK_CAPACITY,
  PACK_COPY,
  bagAccepts,
  isBagClass,
  layoutPack,
  arrangeIntoBags,
  BAG_SORTS,
  BAG_SORT_COPY,
  bagKeep,
  bagLeavesLast,
  bagSort,
  canMagicSort,
  canSpecializeBag,
  giveBag,
  magicSort,
  sortName,
  specializeBag,
  stackUp,
  isBagClass as isBag,
  moveStack,
  normalizePrefs,
  packIntoBags,
  renameBag,
  roomFor,
  saleBags,
  takeBag,
  unitOrder,
  unitPlaces,
  unitRankAt,
} from '../pack-slots.js?v=4a36968a';
import { TOOL_CONDITION_CATALOG, moveToolCopy, pickToolCopies, placeToolCopies } from '../tools.js?v=5f482998';
import { createMinnAccount } from '../minn-account.js?v=c15f0ecf';
import { BAG_NAME_MAX, BAG_RENAME_COPY, bagLabel, canRenameBag, cleanBagName, renamedTo } from '../bag-names.js?v=22391c55';
import { openNamePrompt } from '../ui/name-prompt.js?v=142b551a';

export const BAGS_FEATURE_ID = 'bags';
export const BAG_DEMO_KIT = Object.freeze([
  'apple', 'cherry', 'grain', 'meat', 'orange', 'lemon', 'spinach', 'plain_bubble',
  'general_vapour', 'all_spice', 'seed_spinach', 'seed_onion', 'seed_carrot', 'fuel_cell', 'pinch_of_salt',
]);
/** bagdemo=hero: what a player out on Hechey Track might be carrying (class, count). */
export const HERO_PACK = Object.freeze([
  ['cherry', 12], ['apple', 3], ['plain_bubble', 8], ['grain', 6], ['meat', 2], ['all_spice', 4],
  ['egg_plain', 3], ['bean_plain', 5], ['general_vapour', 4], ['pinch_of_salt', 5],
]);
/** bagdemo=hero's tool row. */
export const HERO_TOOLS = Object.freeze(['pick', 'hoe', 'watering_can', 'hatchet', 'shovel', 'knife_and_board']);
/** bagdemo=full also fills the bag, so nothing fits anywhere (isBagFull, bag.js:443-462). */
export const BAG_DEMO_FILL = Object.freeze([
  'flour', 'bun', 'sammich', 'egg_plain', 'bean_plain', 'milk_butterfly', 'seed_tomato', 'seed_corn', 'seed_potato', 'herb_seed_purple_flower',
]);
export const BAG_DEMO_DROP = Object.freeze({ classTsid: 'plum', count: 5, dx: 70 });

const fresh = () => ({ v: 1, prefs: normalizePrefs(null), rock: {}, open: '', migrated: false, starter: '' });
let slice = fresh();
let lastLayout = null;
/** The stack the open menu is about ({ cls, container, index }: its place in the arrangement), or null. */
let focus = null;
/**
 * Takes a verb on one stack asked for that have not come out of the inventory yet
 * ({ cls, container, index, n, until }): the next fewer of that class comes off that
 * stack first (pack-slots.js layoutPack takeFirst). Online the take lands when the
 * server answers, so each waits a while.
 */
let takes = [];
const TAKE_WAIT_MS = 60000;
/** A take done here and now (eat, a solo drop) lands at once; one that didn't soon lapses. */
const TAKE_SOON_MS = 1500;
let demoDone = false;
/** The bag whose menu is open (game.js renderPackPopover: packBagMenu), its prefs key, or ''. */
let menuBag = '';
/** The engine init saw: opts() reads the player's cards from it (Internal Sortitude routes arrivals). */
let engineRef = null;

/** The three pack cards (inc_data_imagination.js 5674-5746). */
const SORT_CARDS = Object.freeze({ sortitude: 'pack_internal_sortitude', magic: 'pack_magic_sort', stackUp: 'pack_stack_up_bags' });

function hasCard(engine, id) {
  const owned = engine?.pc?.imaginationUpgrades;
  return Array.isArray(owned) && owned.includes(id);
}
/** The site's answers that settle the starter question: granted, none, or refused (new, nosave). */
const STARTER_DONE = new Set(['granted', 'none', 'new', 'nosave']);
const STARTER_TRADE = /^starter-bags-[1-9][0-9]{0,18}$/;
/** One ask per page load (a failed one is asked again on the next load). */
let starterAsked = false;

function opts() {
  const labels = {};
  for (const [cls, meta] of Object.entries(ITEM_CATALOG)) labels[cls] = meta.label;
  return { capacity: PACK_CAPACITY, catalog: ITEM_CATALOG, isTool: isToolItem, lastFirst: hasCopies, order: Object.keys(ITEM_CATALOG), labels, sortitude: hasCard(engineRef, SORT_CARDS.sortitude) };
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
  engine.setData('packBagNames', Object.values(layout.bags).filter((b) => b.name).map((b) => `${b.key}:${b.cls}:${b.name}`).join(','));
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
  const hero = engine.param('bagdemo') === 'hero';
  if (hero) {
    for (const [cls, n] of HERO_PACK) addItem(inv, cls, n);
    for (const cls of HERO_TOOLS) addItem(inv, cls, 1);
  } else {
    addItem(inv, 'bag_generic', 1);
    for (const cls of BAG_DEMO_KIT) addItem(inv, cls, cls === 'apple' ? 3 : 2);
    if (engine.param('bagdemo') === 'full') for (const cls of BAG_DEMO_FILL) addItem(inv, cls, 1);
  }
  slice.prefs = normalizePrefs(null);
  slice.rock = {};
  slice.open = '';
  slice.migrated = true;
  if (!hero && engine.param('bagname')) {
    const named = renameBag(layoutPack(inv, slice.prefs, opts()).prefs, 'b1', engine.param('bagname'));
    if (named.ok) slice.prefs = named.prefs;
  }
  const p = engine.player;
  if (!hero && p && engine.dropWorldStack) engine.dropWorldStack(BAG_DEMO_DROP.classTsid, BAG_DEMO_DROP.count, p.x + BAG_DEMO_DROP.dx, p.y);
  engine.setData?.('bagDemo', hero ? 'hero' : 'ready');
  engine.updateHud?.();
}

/** A multiplayer character the site has not answered for yet: starter bags may be on their way. */
const starterOpen = (engine) => engine?.mode === 'multiplayer' && !STARTER_DONE.has(slice.starter);

/** The starter bags in the order they are laid out: toolboxes first, then the rest. */
export function starterMint(got) {
  const out = [];
  for (const row of Array.isArray(got?.items) ? got.items : []) {
    const c = String(row?.c || '');
    const n = Math.max(0, Math.min(16, Math.floor(Number(row?.n) || 0)));
    if (!isBag(c)) continue;
    for (let i = 0; i < n; i += 1) out.push(c);
  }
  return out.sort((a, b) => (BAG_DEFS[b].holds === 'tool') - (BAG_DEFS[a].holds === 'tool'));
}

/** items/bag_toolbox_red.js and items/bag_bigger.js name_single / name_plural (the catalog may not have them yet). */
const STARTER_NAMES = Object.freeze({ bag_toolbox_red: ['Red Toolbox', 'Red Toolboxes'], bag_bigger: ['Bigger Bag', 'Bigger Bags'] });

/**
 * The notice for starter bags: what was given and why, in plain words.
 * overflowed: the pack held more than fit before the bags (then they say
 * everything is packed into them); a pack that already fit gets the gift alone.
 */
export function starterText(mint, rockStacks = 0, overflowed = true) {
  const counts = mint.reduce((acc, c) => ((acc[c] = (acc[c] || 0) + 1), acc), {});
  const name = (c, n) => (STARTER_NAMES[c] ? (n === 1 ? `a ${STARTER_NAMES[c][0]}` : `${n} ${STARTER_NAMES[c][1]}`) : nameOf(c, n));
  const given = listText(Object.entries(counts).map(([c, n]) => name(c, n)));
  const tail = rockStacks > 0 ? ' Your magic rock holds what still does not fit.' : overflowed ? ' Everything you carry is packed into them.' : '';
  return `Your pack has ${PACK_CAPACITY} slots now. As a character from before bags, you get starter bags: ${given}.${tail}`;
}

/**
 * The site granted starter bags (answer.status granted): apply the receipt
 * once, lay the held stacks into the new bags, say so once. Returns true when
 * the question is settled.
 */
export function applyStarter(engine, answer) {
  const trade = String(answer?.trade || '');
  const mint = starterMint(answer?.got);
  if (!STARTER_TRADE.test(trade) || !mint.length) return false;
  const receipt = engine.query?.('ledgerReceipt', trade, engine);
  if (receipt !== true && receipt !== false) return false;
  const inv = engine.inv;
  // Did the pack overflow before these bags? (A load may already have added them: take them out to look.)
  const without = { ...inv };
  if (receipt === false) for (const c of mint) without[c] = Math.max(0, (Number(without[c]) || 0) - 1);
  const before = layoutPack(without, slice.prefs, opts());
  const overflowed = before.rockStacks > 0;
  if (receipt === true) for (const c of mint) addItem(inv, c, 1);
  // The solo migration's arrangement for the new bags; bags held before keep what is in them,
  // the rest is placed as usual.
  slice.prefs = normalizePrefs(arrangeIntoBags(inv, mint, opts(), before.prefs));
  slice.open = '';
  const layout = layoutPack(inv, slice.prefs, opts());
  slice.prefs = layout.prefs;
  slice.rock = { ...layout.rock };
  lastLayout = layout;
  slice.starter = 'granted';
  engine.setData?.('packStarter', `granted:${mint.join(',')}:${receipt ? 'applied' : 'loaded'}`);
  say(engine, starterText(mint, layout.rockStacks, overflowed));
  publish(engine, layout);
  engine.updateHud?.();
  engine.refreshPack?.();
  engine.save?.();
  return true;
}

/** Multiplayer, once the game is running: ask the site whether this character has starter bags coming. */
function askStarter(engine) {
  if (starterAsked || !engine?.started || !starterOpen(engine)) return;
  if (typeof document === 'undefined' || typeof globalThis.fetch !== 'function') return;
  starterAsked = true;
  const boot = globalThis.GRODDLE_MP_BOOT || {};
  const account = createMinnAccount({ baseUri: document.baseURI, nonce: boot.nonce || '' });
  engine.setData?.('packStarter', 'asking');
  Promise.resolve()
    .then(() => account.starterBags())
    .then((answer) => {
      const status = String(answer?.status || '');
      if (status === 'granted') {
        if (!applyStarter(engine, answer)) engine.setData?.('packStarter', 'unapplied');
        return;
      }
      const done = status === 'refused' ? String(answer?.why || '') : status;
      if (STARTER_DONE.has(done) && done !== 'granted') {
        slice.starter = done;
        engine.setData?.('packStarter', done);
        engine.save?.();
      }
    })
    .catch((err) => {
      engine.setData?.('packStarter', 'error');
      console.warn('[bags]', err?.message || err);
    });
}

/** The layout, taking in whatever changed in the pack since the last look. */
/** The stack at a place in a layout ({ container, index }), or null. */
function slotAt(layout, place) {
  const box = place?.container === 'pack' ? layout?.pack : layout?.bags?.[place?.container];
  const s = box?.slots?.[Math.floor(Number(place?.index))];
  return s?.kind === 'stack' ? s : null;
}

/** How many of a class the saved arrangement holds in its slots. */
function savedCount(prefs, cls) {
  let n = 0;
  for (const [key, list] of Object.entries(prefs?.place || {})) list.forEach((e, i) => { if (e === cls) n += prefs.n?.[key]?.[i] || 0; });
  return n;
}

/** A class whose units each keep their own state in js/tools.js (a tool's wear, a jar's Fireflies). */
function hasCopies(cls) {
  return Boolean(TOOL_CONDITION_CATALOG[cls]);
}

/**
 * Tools (and jars) that just arrived take their own places among the class's copies (2026-11-04).
 * js/tools.js adds a new copy last, but the pack may put the new stack ahead of one already held
 * (a Red Toolbox fills before the pack, pack-slots.js routeRank), and then the new tool showed the
 * old one's wear and the old one the new one's ("the new one came pre-broken"). With the layout
 * before and after, the units at places that were not there before are the new ones: the newest
 * copies move to those places in pack order (js/tools.js placeToolCopies, values kept).
 */
function placeArrivals(engine, before, after) {
  const state = engine?.toolState;
  if (!state || !before || !after) return;
  for (const cls of Object.keys(state.condition || {})) {
    if (!hasCopies(cls) || (after.rock?.[cls] || 0) > 0 || (before.rock?.[cls] || 0) > 0) continue;
    const was = unitPlaces(before, cls);
    const now = unitPlaces(after, cls);
    const k = now.length - was.length;
    if (k <= 0 || now.length !== (Number(engine.inv?.[cls]) || 0)) continue;
    const old = new Map();
    for (const p of was) old.set(`${p.container}:${p.index}`, (old.get(`${p.container}:${p.index}`) || 0) + 1);
    const ranks = [];
    now.forEach((p, r) => {
      const key = `${p.container}:${p.index}`;
      if (old.get(key) > 0) old.set(key, old.get(key) - 1);
      else ranks.push(r);
    });
    if (ranks.length !== k || ranks.every((r, i) => r === now.length - k + i)) continue;
    placeToolCopies(state, cls, ranks);
  }
}

function reconcile(engine) {
  const inv = engine?.inv || {};
  if (engine?.started) migrate(engine);
  const now = Date.now();
  takes = takes.filter((t) => t.until > now);
  const prefsBefore = takes.length ? slice.prefs : null;
  const layout = layoutPack(inv, slice.prefs, takes.length ? { ...opts(), takeFirst: takes } : opts());
  if (engine?.started) {
    const before = lastLayout;
    const changes = rockChanges(slice.rock, layout.rock, before?.slotted || layout.slotted, layout.slotted);
    // Starter bags a load already applied wait for the site's answer, which lays them out (no rock line for them).
    if (starterOpen(engine)) changes.holding = changes.holding.filter((r) => !isBag(r.cls));
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
    placeArrivals(engine, before, layout);
    lastLayout = layout;
    // What came off counts against the takes asked for; one fully taken, or whose stack is gone, ends.
    if (prefsBefore) {
      const fewer = new Map();
      for (const t of takes) if (!fewer.has(t.cls)) fewer.set(t.cls, Math.max(0, savedCount(prefsBefore, t.cls) - savedCount(layout.prefs, t.cls)));
      takes = takes.filter((t) => {
        const off = Math.min(t.n, fewer.get(t.cls) || 0);
        fewer.set(t.cls, (fewer.get(t.cls) || 0) - off);
        t.n -= off;
        return t.n > 0 && slotAt(layout, t)?.cls === t.cls;
      });
    }
    if (focus && slotAt(layout, focus)?.cls !== focus.cls) focus = null;
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

/** The menu's own stack when it is about one of this class (Put in / Take out move that one), else every stack of it. */
function focusedPlaces(layout, cls) {
  if (focus?.cls === cls && slotAt(layout, focus)?.cls === cls) return [{ container: focus.container, index: focus.index }];
  return stackPlaces(layout, cls);
}

/**
 * A tool's wear goes with it when it is dragged (js/tools.js keeps one value per tool in pack
 * order, js/pack-slots.js unitPlaces): the moved tool's place in that order before and after.
 */
function movedToolRanks(engine, before, from, to, prefs) {
  const src = from?.container === 'pack' ? before.pack : before.bags[from?.container];
  const slot = src?.slots?.[Math.floor(Number(from?.index))];
  if (slot?.kind !== 'stack' || !TOOL_CONDITION_CATALOG[slot.cls] || (Number(engine.inv?.[slot.cls]) || 0) < 2) return null;
  const was = unitRankAt(before, slot.cls, from.container, Math.floor(Number(from.index)));
  const after = layoutPack(engine.inv, prefs, opts());
  const destKey = to?.bag ? to.bag : to?.container || 'pack';
  const dest = destKey === 'pack' ? after.pack : after.bags[destKey];
  if (!dest) return null;
  // moveStack puts it at to.index in its container's list (after taking it out), else last.
  const last = dest.slots.length - 1;
  let at = Number.isFinite(Number(to?.index)) ? Math.max(0, Math.min(last, Math.floor(Number(to.index)))) : last;
  if (dest.slots[at]?.cls !== slot.cls) at = dest.slots.findLastIndex((x) => x.cls === slot.cls);
  const now = at >= 0 ? unitRankAt(after, slot.cls, destKey, at) : -1;
  return was >= 0 && now >= 0 ? { cls: slot.cls, was, now } : null;
}

function doMove(engine, from, to) {
  const before = layoutPack(engine.inv, slice.prefs, opts());
  const result = moveStack(engine.inv, slice.prefs, from, to, opts());
  if (result.ok) {
    const ranks = engine.toolState ? movedToolRanks(engine, before, from, to, result.prefs) : null;
    if (ranks && ranks.was !== ranks.now) moveToolCopy(engine.toolState, ranks.cls, ranks.was, ranks.now);
    slice.prefs = normalizePrefs(result.prefs);
    // The stacks have new places: a menu or a take on one no longer knows where it is.
    focus = null;
    takes = [];
    engine.setData?.('packLast', 'moved');
  } else if (result.reason) {
    engine.setData?.('packLast', result.reason);
  }
  return result;
}

/** The bag a Rename is about: the menu's bag when it is of this class, else the first of the class. */
function bagKeyFor(layout, cls, key = menuBag) {
  if (key && layout.bags[key]?.cls === cls) return key;
  return Object.values(layout.bags).find((b) => b.cls === cls)?.key || '';
}

/** onInputBoxResponse 605-611 for one bag in the pack. Returns the result of renameBag. */
function applyBagName(engine, key, value) {
  const layout = layoutPack(engine.inv, slice.prefs, opts());
  const res = renameBag(layout.prefs, key, value);
  if (!res.ok) return res;
  slice.prefs = normalizePrefs(res.prefs);
  engine.setData?.('packLast', res.changed ? `renamed:${key}:${res.name}` : `rename_kept:${key}`);
  if (res.changed) {
    engine.playSound?.('CLICK_SUCCESS', { volume: 0.45 });
    engine.save?.();
  }
  publish(engine, reconcile(engine));
  engine.updateHud?.();
  engine.refreshPack?.();
  return res;
}

/**
 * verbs.rename handler 501-519: the input box for one bag, its name filled in
 * as it shows (through the word filter, js/bag-names.js bagLabel); OK on that
 * shown name unchanged keeps the name as it was.
 */
function askBagName(current, onName) {
  const shown = bagLabel(current, '');
  openNamePrompt({
    title: BAG_RENAME_COPY.title,
    label: BAG_RENAME_COPY.input,
    value: shown,
    maxChars: BAG_NAME_MAX,
    // input_restrict 'A-Z a-z 0-9'.
    restrict: /[^a-z0-9 ]/gi,
    onSubmit: (typed) => onName(shown && typed === shown ? current : typed),
  });
}

/** A dropped bag of the player's own (js/world-items.js record) on this street, or null. */
function droppedRecord(target, engine) {
  if (target?.classId !== 'dropped_item' || !canRenameBag(target?.state?.classTsid)) return null;
  const id = target.state.id || target.worldItemId;
  const rows = engine?.droppedItems?.streets?.[engine.dropTsid];
  return Array.isArray(rows) ? rows.find((r) => r.id === id && r.classTsid === target.state.classTsid) || null : null;
}

/** Rename a bag lying on the ground (ok_states in_location): the record keeps the name. */
function renameDroppedBag(target, engine, value) {
  const record = droppedRecord(target, engine);
  if (!record) return false;
  const name = renamedTo(record.name, value);
  if (name && name !== record.name) {
    record.name = name;
    engine.droppedItemsChanged?.();
    engine.setData?.('packLast', `renamed:ground:${name}`);
  }
  return true;
}

/** takeable.js:48: the pick up verb is disabled when nothing of the stack fits (a new list, or null). */
function pickupRoom(target, verbs, engine) {
  if (!verbs.some((v) => v?.id === 'pickup' && v.enabled !== false)) return null;
  const cls = target?.classId === 'dropped_item' ? target?.state?.classTsid : target?.classId;
  if (!cls) return null;
  // A dropped bag with things in it needs room for itself with them inside (pack-slots.js giveBag).
  const contents = target?.classId === 'dropped_item' ? target?.state?.contents : null;
  const fits = contents?.length
    ? bagsFeature.packBagRoom(cls, contents, engine)
    : roomFor(engine?.inv || {}, slice.prefs, cls, 1, opts()) > 0;
  if (fits) return null;
  return verbs.map((v) => (v?.id === 'pickup' ? { ...v, enabled: false, reason: PACK_COPY.pickupDisabled } : v));
}

/** A sort's plain name on the Sort level: "Mining, etc." for the source's "Sort: Mining, etc.". */
const plainSortLabel = (label) => String(label).replace(/^Sort: /, '');

/**
 * A bag's sorting verbs, in sort_on order (bag_generic_gray.js 30-473). With
 * Internal Sortitude and a bag that can_specialize, one Sort row (id bags_sort,
 * `sub` its second level): All (verbs.sort_all) and the fourteen sorts by their
 * plain names, each still its own verb (bags_sort:<id>). The one the bag is
 * sorted by is the current choice (`current`), disabled with the source's
 * reason; an unsorted bag's current choice is All. Magic sort needs Magic Sort
 * and a sorted bag (or one with custom categories), Stack up needs Stack Up.
 * The bag is the menu's (packBagMenu), else the first of its class.
 *
 * Remake choice (Austin 2026-11-03, "too many sort options on the options
 * menu"): the original listed every Sort: verb flat on the bag's menu, one
 * button per verb in sort_on order (glitch-client InteractionMenu.as
 * buildVerbCUIs 768-822; bag_generic_gray.js verbs.sort_all 30 to
 * sort_staples_a 391, sort_on 50-64). Here they sit on a second level, the
 * way the menu's Eat more and Drop open theirs.
 */
function sortVerbs(engine, cls) {
  const out = [];
  const layout = layoutPack(engine.inv, slice.prefs, opts());
  const key = bagKeyFor(layout, cls);
  const box = key ? layout.bags[key] : null;
  if (!box) return out;
  if (canSpecializeBag(cls) && hasCard(engine, SORT_CARDS.sortitude)) {
    const unsorted = !box.sort;
    const sub = [{
      id: 'bags_sort:sort_all',
      label: plainSortLabel(BAG_SORT_COPY.all.label),
      enabled: !unsorted,
      current: unsorted,
      reason: unsorted ? BAG_SORT_COPY.all.unsorted : '',
      tooltip: BAG_SORT_COPY.all.tooltip,
    }];
    for (const row of BAG_SORTS) {
      const current = box.sort === row.id;
      sub.push({ id: `bags_sort:${row.id}`, label: plainSortLabel(row.label), enabled: !current, current, reason: current ? row.reason : '', tooltip: row.tooltip });
    }
    const now = sub.find((v) => v.current);
    out.push({
      id: 'bags_sort',
      label: BAG_SORT_COPY.menu.label,
      enabled: true,
      reason: '',
      tooltip: unsorted ? BAG_SORT_COPY.menu.tooltip : BAG_SORT_COPY.menu.sortedBy(now.label),
      backTip: BAG_SORT_COPY.menu.back,
      sub,
    });
  }
  if (hasCard(engine, SORT_CARDS.magic) && (canSpecializeBag(cls) || box.holds !== 'any')) {
    const ok = canMagicSort(box);
    out.push({ id: 'bags_magic_sort', label: BAG_SORT_COPY.magic.label, enabled: ok, reason: ok ? '' : BAG_SORT_COPY.magic.unsorted, tooltip: BAG_SORT_COPY.magic.tooltip });
  }
  if (hasCard(engine, SORT_CARDS.stackUp)) {
    out.push({ id: 'bags_stack_up', label: BAG_SORT_COPY.stackUp.label, enabled: true, reason: '', tooltip: BAG_SORT_COPY.stackUp.tooltip });
  }
  return out;
}

/** Re-order each tool class's wear after a magic sort moved its units (order[newRank] = oldRank). */
function keepToolWear(engine, before, after, trace) {
  for (const cls of Object.keys(TOOL_CONDITION_CATALOG)) {
    if ((Number(engine.inv?.[cls]) || 0) < 2) continue;
    const order = unitOrder(before, after, trace, cls);
    if (!order || order.every((r, i) => r === i)) continue;
    // Selection by moves: bring the unit that belongs at each place there in turn.
    const at = [...Array(order.length).keys()]; // at[k]: the old rank of the copy now in place k
    for (let t = 0; t < order.length; t += 1) {
      const from = at.indexOf(order[t]);
      if (from === t) continue;
      moveToolCopy(engine.toolState, cls, from, t);
      const [v] = at.splice(from, 1);
      at.splice(t, 0, v);
    }
  }
}

/** Run a sorting verb on the menu's bag. True when handled. */
function runSortVerb(engine, cls, verbId) {
  if (!isBagClass(cls) || !engine?.inv) return false;
  const o = opts();
  const layout = layoutPack(engine.inv, slice.prefs, o);
  const key = bagKeyFor(layout, cls);
  if (!key) return false;
  let res;
  let line = '';
  let last = '';
  if (verbId.startsWith('bags_sort:')) {
    const id = verbId.slice('bags_sort:'.length);
    if (!hasCard(engine, SORT_CARDS.sortitude) || !canSpecializeBag(cls)) return false;
    res = specializeBag(layout.prefs, key, id);
    last = `sorted:${key}:${id}`;
  } else if (verbId === 'bags_magic_sort') {
    if (!hasCard(engine, SORT_CARDS.magic)) return false;
    res = magicSort(engine.inv, layout.prefs, key, o);
    line = BAG_SORT_COPY.magic.done;
    last = `magic_sorted:${key}:${res.moved || 0}`;
  } else {
    if (!hasCard(engine, SORT_CARDS.stackUp)) return false;
    res = stackUp(engine.inv, layout.prefs, o);
    line = BAG_SORT_COPY.stackUp.done;
    last = `stacked_up:${res.merged || 0}`;
  }
  if (!res?.ok) {
    if (res?.reason) engine.toast?.(res.reason, 3000);
    engine.playSound?.('CLICK_FAILURE', { volume: 0.45 });
    return true;
  }
  slice.prefs = normalizePrefs(res.prefs);
  // A tool's wear rides with its unit (a drag keeps the same rule): stack up never moves a tool
  // (a tool stacks one to a slot), magic sort may, so its trace re-orders the wear.
  if (engine.toolState && res.trace) keepToolWear(engine, layout, layoutPack(engine.inv, slice.prefs, o), res.trace);
  focus = null;
  takes = [];
  engine.setData?.('packLast', last);
  if (line) {
    engine.pushActivity?.(line);
    engine.toast?.(line, 2600);
  }
  engine.playSound?.('CLICK_SUCCESS', { volume: 0.45 });
  engine.save?.();
  publish(engine, reconcile(engine));
  engine.updateHud?.();
  engine.refreshPack?.();
  return true;
}

export const bagsFeature = {
  id: BAGS_FEATURE_ID,

  init(engine) {
    engineRef = engine || null;
    if (typeof globalThis === 'undefined') return;
    globalThis.groddlePack = {
      layout: () => layoutPack(engine.inv, slice.prefs, opts()),
      /** Everything held per class, slotted or rock-held (the inventory counts). */
      counts: () => Object.fromEntries(Object.entries(engine.inv).filter(([, n]) => n > 0)),
      room: (cls, n = 1) => roomFor(engine.inv, slice.prefs, cls, n, opts()),
      move: (from, to) => doMove(engine, from, to),
      toggle: (key) => bagsFeature.packToggleBag(key, engine),
      /** Rename the bag with this key as the Name Me! box's OK does (an empty value keeps the name). */
      rename: (key, value) => applyBagName(engine, String(key || ''), value),
      // Solo QA only: gain something as any reward would (a full pack's magic rock takes it).
      ...(engine?.mode === 'multiplayer' ? {} : { grant: (cls, n = 1) => { addItem(engine.inv, String(cls), Math.max(1, Math.floor(n))); engine.updateHud?.(); } }),
      get slice() { return JSON.parse(JSON.stringify(slice)); },
    };
  },

  onTick(_dt, _now, engine) {
    runDemo(engine);
    askStarter(engine);
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

  /**
   * game.js renderPackPopover: the stack the menu is about, from its slot's place
   * ({ cls, container, index }); null forgets it. Returns { cls, container, index, count }
   * when that slot holds the class, else null (then the menu stays on the class as a whole).
   */
  packFocus(place, engine) {
    if (!place) {
      focus = null;
      return null;
    }
    const cls = String(place.cls || '');
    const container = String(place.container ?? '');
    const index = Math.floor(Number(place.index));
    if (!cls || !container || !Number.isFinite(index) || !engine?.inv) return null;
    const s = slotAt(reconcile(engine), { container, index });
    if (s?.cls !== cls) {
      if (focus?.cls === cls) focus = null;
      return null;
    }
    focus = { cls, container, index };
    return { ...focus, count: s.count };
  },

  /**
   * A verb on the focused stack (or the given place) is about to take n of its class: those n
   * come off that stack when they leave the inventory, now or when the server answers.
   */
  packTakeFrom(cls, n, engine, { place = null, wait = TAKE_SOON_MS } = {}) {
    const at = place || focus;
    const k = Math.floor(Number(n));
    if (!at || at.cls !== String(cls || '') || !(k > 0)) return false;
    const ms = Math.max(0, Math.min(TAKE_WAIT_MS, Number(wait) || TAKE_SOON_MS));
    takes.push({ cls: at.cls, container: String(at.container), index: Math.floor(Number(at.index)), n: k, until: Date.now() + ms });
    return true;
  },

  /**
   * A verb on one chosen tool (or jar) is about to take it: its stack, found by the tool's place
   * among the class's units in pack order (js/tools.js copies, pack-slots.js unitPlaces), gives
   * the n that leave, so the slot that empties is the chosen one and not the first in slot order
   * (Austin 2026-11-04: of two Tinkertools, the one in a bag was sold instead of the one picked).
   * Glitch's verbs named the itemstack they were used on (main.js doVerb, inc_stores.js storeSell).
   */
  packTakeUnit(cls, rank, n, engine, { wait = TAKE_SOON_MS } = {}) {
    const c = String(cls || '');
    const r = Math.floor(Number(rank));
    if (!c || !(r >= 0) || !engine?.inv) return false;
    const p = unitPlaces(reconcile(engine), c)[r];
    if (!p) return false;
    return bagsFeature.packTakeFrom(c, n, engine, { place: { cls: c, container: p.container, index: p.index }, wait });
  },

  /** The stack the last menu of this class was about, with its count now ({ cls, container, index, count }), or null. */
  packFocused(cls, engine) {
    if (!focus || focus.cls !== String(cls || '') || !engine?.inv) return null;
    const s = slotAt(layoutPack(engine.inv, slice.prefs, opts()), focus);
    return s?.cls === focus.cls ? { ...focus, count: s.count } : null;
  },

  /**
   * A drop of a bag with things in it (game.js dropPackBag): the bag the player chose
   * leaves the pack with all it holds, as in the source (pack-slots.js takeBag).
   * Returns { ok, cls, contents: [{ cls, count, points?, tags? }], name?, sort?, sortNamed? }; the
   * inventory and the arrangement have changed (tools' wear goes with them in `points`, the bag's
   * name in `name`, its specialization in `sort`). An empty bag goes this way too when it has a
   * name or a sort, so they go down with it.
   */
  packTakeBag(key, engine) {
    if (!engine?.inv) return { ok: false, reason: 'missing' };
    const o = opts();
    const layout = layoutPack(engine.inv, slice.prefs, o);
    const res = takeBag(engine.inv, slice.prefs, key, o);
    if (!res.ok) return res;
    const contents = res.contents.map((c) => ({ ...c }));
    if (engine.toolState) {
      for (const cls of new Set(contents.map((c) => c.cls))) {
        if (!TOOL_CONDITION_CATALOG[cls]) continue;
        const places = unitPlaces(layout, cls);
        const ranks = [];
        const per = [];
        contents.forEach((c, j) => {
          if (c.cls !== cls) return;
          const mine = [];
          places.forEach((pl, r) => { if (pl.container === String(key) && pl.index === j) mine.push(r); });
          ranks.push(...mine);
          per.push([c, mine.length]);
        });
        const points = pickToolCopies(engine.toolState, cls, ranks);
        let at = 0;
        for (const [c, n] of per) {
          c.points = points.slice(at, at + n);
          // A copy's own words go with it (a script's destination, a Cubimal's name).
          const words = points.tags?.slice(at, at + n);
          if (words?.some((t) => t != null)) c.tags = words;
          at += n;
        }
      }
    }
    removeItem(engine.inv, res.cls, 1);
    for (const c of contents) removeItem(engine.inv, c.cls, c.count);
    slice.prefs = normalizePrefs(res.prefs);
    focus = null;
    takes = [];
    if (slice.open === String(key)) slice.open = '';
    engine.setData?.('packLast', `bag_out:${res.cls}:${contents.length}`);
    return { ok: true, cls: res.cls, contents, ...(res.name ? { name: res.name } : {}), ...bagKeep(res.cls, res) };
  },

  /** An empty bag's drop (shared or not) takes the bag the player chose (pack-slots.js bagLeavesLast). */
  packBagLeaves(key) {
    slice.prefs = bagLeavesLast(slice.prefs, key);
    return true;
  },

  /**
   * A vendor sale of a bag class (game.js vendorSellOpts; report #79, Austin 2026-11-11: "Refuse:
   * empty it first"): how many of its bags can go, only empty ones (0 when `chosen`, the bag dragged
   * or whose menu sold it, holds something), with the empty ones (the chosen one last) arranged to
   * be the ones that leave (pack-slots.js saleBags). null for a class that is not a bag.
   */
  packSaleBags(cls, engine, chosen = '') {
    if (!engine?.inv) return null;
    reconcile(engine);
    const res = saleBags(engine.inv, slice.prefs, String(cls || ''), opts(), chosen);
    if (!res) return null;
    slice.prefs = normalizePrefs(res.prefs);
    return res.empty;
  },

  /** Whether a dropped bag with these contents fits back in the pack now (pick up). */
  packBagRoom(cls, contents, engine) {
    return giveBag(engine?.inv || {}, slice.prefs, String(cls || ''), (contents || []).map((c) => ({ cls: c.classTsid || c.cls, count: c.count })), opts()).ok;
  },

  /**
   * A pick up of a bag with things in it (or with a name): the bag comes back with them inside
   * (pack-slots.js giveBag), its tools keep their wear and it keeps its name and sort (`keep`:
   * { sort, sortNamed } as packTakeBag gave them). Returns { ok, key } or
   * { ok: false, reason: 'full' }; on ok the inventory holds the bag and its contents.
   */
  packGiveBag(cls, contents, engine, name = '', keep = {}) {
    if (!engine?.inv) return { ok: false, reason: 'missing' };
    const o = opts();
    const list = (contents || []).map((c) => ({ cls: c.classTsid || c.cls, count: c.count, points: c.points, tags: c.tags }));
    const res = giveBag(engine.inv, slice.prefs, String(cls || ''), list, o, cleanBagName(name), keep || {});
    if (!res.ok) return res;
    addItem(engine.inv, String(cls), 1);
    for (const c of list) addItem(engine.inv, c.cls, c.count);
    slice.prefs = normalizePrefs(res.prefs);
    focus = null;
    takes = [];
    if (engine.toolState) {
      const layout = layoutPack(engine.inv, slice.prefs, o);
      const box = layout.bags[res.key];
      for (const tcls of new Set(list.map((c) => c.cls))) {
        if (!TOOL_CONDITION_CATALOG[tcls] || !box) continue;
        const places = unitPlaces(layout, tcls);
        const ranks = [];
        const points = [];
        const words = [];
        // The contents went in in order, so the bag's j-th slot is the j-th content (a swallowed stack comes last).
        list.forEach((c, j) => {
          if (c.cls !== tcls) return;
          let k = 0;
          places.forEach((pl, r) => {
            if (pl.container !== res.key || pl.index !== j) return;
            ranks.push(r);
            points.push(Array.isArray(c.points) ? (c.points[k] ?? null) : null);
            words.push(Array.isArray(c.tags) ? (c.tags[k] ?? null) : null);
            k += 1;
          });
        });
        if (ranks.length) placeToolCopies(engine.toolState, tcls, ranks, points, words);
      }
      // Its tools are already in their places: the next look must not place them again (placeArrivals).
      if (lastLayout) lastLayout = layout;
    }
    engine.setData?.('packLast', `bag_in:${cls}:${list.length}`);
    return { ok: true, key: res.key };
  },

  packOpenBag() {
    return slice.open || '';
  },

  /** game.js renderPackPopover: the bag the menu is about (its key), or null when the menu is not a bag's. */
  packBagMenu(key) {
    menuBag = key ? String(key) : '';
    return menuBag;
  },

  /** The bag whose menu is open (its key), or '': home-storage-feature's Put in <cabinet> moves that one (#108). */
  packMenuBagKey() {
    return menuBag;
  },

  /** A bag's shown name and its class's ({ key, cls, label, name, className }) for a menu title, or null. */
  packBagInfo(key, engine) {
    const box = engine?.inv ? layoutPack(engine.inv, slice.prefs, opts()).bags[String(key || '')] : null;
    return box ? { key: box.key, cls: box.cls, label: box.label, name: box.name || '', className: box.className } : null;
  },

  /** The first bag of a class in the pack ({ key, cls, label, name, className }), or null. */
  packFirstBag(cls, engine) {
    if (!engine?.inv) return null;
    const key = bagKeyFor(layoutPack(engine.inv, slice.prefs, opts()), String(cls || ''), '');
    return key ? bagsFeature.packBagInfo(key, engine) : null;
  },

  /**
   * What one bag of a class holds ({ key, counts: { cls: n } }): the bag whose menu is open, else
   * the first of its class; null with none. A verb on a bag that reads its own contents (doShake's
   * this.countItemClass, bag_elemental_pouch.js 669-690) asks here.
   */
  packBagCounts(cls, engine) {
    if (!engine?.inv) return null;
    const layout = layoutPack(engine.inv, slice.prefs, opts());
    const key = bagKeyFor(layout, String(cls || ''));
    if (!key) return null;
    const counts = {};
    for (const s of layout.bags[key].slots) if (s.kind === 'stack') counts[s.cls] = (counts[s.cls] || 0) + s.count;
    return { key, counts };
  },

  /** Rename the first bag of a class (the Elemental Pouch's one-name saves, its QA). renameBag's result, or null with none. */
  packRenameFirst(cls, value, engine) {
    const first = bagsFeature.packFirstBag(cls, engine);
    return first ? applyBagName(engine, first.key, value) : null;
  },

  /** A dropped bag's Rename (game.js runs the ground verb here). True when handled. */
  bagRenameGround(target, engine) {
    const record = droppedRecord(target, engine);
    if (!record) return null;
    askBagName(record.name, (value) => renameDroppedBag(target, engine, value));
    return true;
  },

  packToggleBag(key, engine) {
    const k = String(key || '');
    slice.open = slice.open === k ? '' : k;
    engine?.setData?.('packBagOpen', slice.open);
    return slice.open;
  },

  /** takeable.js:48: the pick up verb is disabled when nothing of the stack fits; a dropped bag of one's own has Rename. */
  decorateVerbs(target, verbs, engine) {
    if (!Array.isArray(verbs)) return null;
    let out = null;
    // verbs.rename ok_states in_location: a bag the player put down can be renamed where it lies.
    if (droppedRecord(target, engine) && !verbs.some((v) => v?.id === 'rename')) {
      out = [...verbs, { id: 'rename', label: BAG_RENAME_COPY.label.toLowerCase(), sort: BAG_RENAME_COPY.sortOn, tooltip: BAG_RENAME_COPY.tooltip, enabled: true, reason: '', energy: 0 }];
    }
    return pickupRoom(target, out || verbs, engine) || out;
  },

  packVerbs(classTsid, engine) {
    const cls = String(classTsid || '');
    if (cls && isBagClass(cls) && engine?.inv) {
      const out = sortVerbs(engine, cls);
      // verbs.rename (sort_on 67): always enabled for a bag in the pack.
      if (canRenameBag(cls)) out.push({ id: 'bags_rename', label: BAG_RENAME_COPY.label, enabled: true, reason: '', tooltip: BAG_RENAME_COPY.tooltip });
      return out.length ? out : null;
    }
    if (!cls || isBagClass(cls) || !engine?.inv) return null;
    const layout = layoutPack(engine.inv, slice.prefs, opts());
    const places = focusedPlaces(layout, cls);
    if (!places.length) return null;
    const out = [];
    const inPack = places.some((p) => p.container === 'pack');
    if (inPack) {
      // Each bag's button names its fill, so two Bigger Bags read apart, and bags with room come first.
      const boxes = Object.values(layout.bags).filter((box) => bagAccepts(BAG_DEFS[box.cls], cls, opts()));
      boxes.sort((a, b) => Number(a.slots.length >= a.capacity) - Number(b.slots.length >= b.capacity));
      for (const box of boxes) {
        const full = box.slots.length >= box.capacity;
        const fill = `${box.slots.length}/${box.capacity}`;
        out.push({ id: `bags_put:${box.key}`, label: `Put in ${box.label} (${fill})`, enabled: !full, reason: full ? PACK_COPY.noRoom(box.label) : '', tooltip: PACK_COPY.moveTo(box.label) });
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
    if (verbId === 'bags_rename') {
      const cls = String(classTsid || '');
      if (!isBagClass(cls) || !engine?.inv) return false;
      const layout = layoutPack(engine.inv, slice.prefs, opts());
      const key = bagKeyFor(layout, cls);
      if (!key) return false;
      // verbs.rename 515: the box shows user_name, a sort's name included.
      const box = layout.bags[key];
      askBagName(box.name || (box.sortNamed ? sortName(box.sort) : ''), (value) => applyBagName(engine, key, value));
      return true;
    }
    if (/^bags_(sort:[a-z_]+|magic_sort|stack_up)$/.test(String(verbId || ''))) return runSortVerb(engine, String(classTsid || ''), String(verbId));
    const m = /^bags_(put|take):([a-zA-Z0-9_]+)$/.exec(String(verbId || ''));
    if (!m) return false;
    const layout = layoutPack(engine.inv, slice.prefs, opts());
    const places = focusedPlaces(layout, String(classTsid || ''));
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
    return { v: 1, prefs: slice.prefs, rock: slice.rock, open: slice.open, migrated: slice.migrated, ...(slice.starter ? { starter: slice.starter } : {}) };
  },

  restore(saved) {
    slice = fresh();
    lastLayout = null;
    focus = null;
    takes = [];
    menuBag = '';
    starterAsked = false;
    if (!saved || typeof saved !== 'object') return;
    slice.prefs = normalizePrefs(saved.prefs);
    slice.rock = cleanRock(saved.rock);
    slice.open = typeof saved.open === 'string' ? saved.open.replace(/[^a-zA-Z0-9_]/g, '').slice(0, 40) : '';
    slice.migrated = saved.migrated === true;
    slice.starter = STARTER_DONE.has(saved.starter) ? saved.starter : '';
  },
};
