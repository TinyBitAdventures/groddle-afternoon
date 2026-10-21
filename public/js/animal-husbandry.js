/**
 * Animal systems beyond daily Animal Kinship care, ported from Tiny Speck's
 * GSJS (CC0). Pure rules plus two small shared runtime registries (the plop
 * queue and the pack-item side tables) that content.js and the
 * animal-husbandry feature both import from this one URL.
 *
 * Sources:
 * - items/npc_batterfly.js feed (food_counter in base-cost units: 15 → 1
 *   Guano, 50 → 2, 100 → 3; batterfly_bonus_guano 50 → 3,
 *   batterfly_bonus_guano_2 80 → 5) and onInterval (one Guano an hour while
 *   the street holds fewer than 10).
 * - items/npc_piggy.js feed (npc_animal): one stack up to stackmax, +2 XP when
 *   base_cost >= 5 and the piggy is hungry, crop counters keyed by the crop's
 *   produced_by_class, a plop queue of {type, num: round(count/3)} (pumpkin:
 *   any count, num = count*2) and doPlop (2-7 seeds a plop, one every 5 s).
 * - items/plop.js examine (the plop becomes its seeds, plops_inspected),
 *   sniff (-2 energy, +2 XP) and taste.
 * - items/npc_chicken.js incubate (Animal Husbandry, one egg, 30 s halfway
 *   bubble, 60 s hatch, the player must still be there), giveIncubatedItem
 *   (piggy_egg → piglet, butterfly_egg → caterpillar, chicken_egg → chick,
 *   twin upgrades 5%/10%).
 * - items/chick.js (10 Grain), piglet.js (3 crops), caterpillar.js (1 bubble)
 *   feed → the grown animal appears where the baby is.
 * - items/include/animal_naming.js canName/onInputBoxResponse (Animal
 *   Kinship V, 32 letters/digits/spaces, an hour before someone else may
 *   rename, owners always may).
 * - items/npc_piggy.js capture (Herdkeeping, Pig Bait, 20 energy, 75%),
 *   hogtied_piggy.js (escape timer, release), catalog_buffs.js hog_tie (1 XP
 *   every 30 s) and piggy_capture_cooldown (600 s).
 * - items/magic_*_stick.js (place in a location you own, distance 250).
 * - items/meat_collector.js, butterfly_milker.js, piggy_feeder.js (back yard
 *   only, 24/22/20-minute collection, 20-minute feeding, capacities 60/80/80).
 * - items/catalog_drop_tables.js ak_chicken_squeeze, ..._seasoned_eggs, bacon
 *   (rolled with the shared js/drop-tables.js runDropTable).
 */

import { ITEM_CATALOG, ensureItem, getItemUseInfo } from './inventory.js?v=catalog-unified-3';
import { DROP_TABLES, applyDropResult, rollDropTable } from './drop-tables.js';
import { moodMax } from './metabolics.js';

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
/** One game day is four real hours (js/game-day.js); half a day is two. */
export const GAME_DAY_MS = 4 * HOUR;

/** randInt(min, max) inclusive, like GSJS utils. */
export function randInt(min, max, rng = Math.random) {
  return Math.floor(rng() * (max - min + 1)) + min;
}

const pick = (list, rng = Math.random) => list[Math.floor(rng() * list.length) % list.length];

// ---------------------------------------------------------------------------
// Items
// ---------------------------------------------------------------------------

/** Pack items this module introduces (labels, costs, stack sizes from each GSJS item file). */
export const HUSBANDRY_ITEMS = Object.freeze({
  guano: { label: 'Guano', namePlural: 'Guano', baseCost: 20, stackMax: 40, desc: 'An unobtrusive pellet from the back end of a Batterfly, Guano can be used as a fertilizer.' },
  plop: { label: 'Piggy Plop', namePlural: 'Piggy Plops', baseCost: 0, stackMax: 1, desc: 'Piggy plop is the delicately scented excrescence of a healthy piggy. Round, brown, and mysterious, it may contain presents.', sellable: false, donatable: false },
  caterpillar: { label: 'Caterpillar', namePlural: 'Caterpillars', baseCost: 500, stackMax: 1, desc: 'A proto-Butterfly.' },
  chick: { label: 'Chick', namePlural: 'Chicks', baseCost: 300, stackMax: 1, desc: 'A wide-eyed chick, fresh from the egg. It needs grain in order to reach full chickenhood.' },
  piglet: { label: 'Piglet', namePlural: 'Piglets', baseCost: 400, stackMax: 1, desc: 'One wiggly little piggly. He wants to turn into a big pig. Feed him nourishing plant-y food to help him grow.' },
  hogtied_piggy: { label: 'Hog-tied Piggy', namePlural: 'Hog-tied Piggies', baseCost: 500, stackMax: 1, desc: 'One wiggly wild piggy, bound and gagged. Better pen him up fast. Drop this piggy in your home before he gets away.', sellable: false },
  magic_pig_stick: { label: 'Pig Stick', namePlural: 'Pig Sticks', baseCost: 400, stackMax: 1, desc: 'Placed in your home or on your land, Piggies within trotting distance feel irresistibly drawn to the Pig Stick and want to stay near it.' },
  magic_chicken_stick: { label: 'Chicken Stick', namePlural: 'Chicken Sticks', baseCost: 400, stackMax: 1, desc: 'A stick for summoning and containing poultry in a happy feathery cabal, when placed in a house or on your land.' },
  magic_butterfly_stick: { label: 'Butterfly Stick', namePlural: 'Butterfly Sticks', baseCost: 400, stackMax: 1, desc: 'One stick imbued with purest butterfly attractant. Placed on your land, nearby Butterflies are irresistibly attracted to it.' },
  meat_collector: { label: 'Meat Collector', namePlural: 'Meat Collectors', baseCost: 500, stackMax: 1, desc: "A farm-grade meat collector. It works around the clock to collect meat from your piggies when you can't." },
  butterfly_milker: { label: 'Butterfly Milker', namePlural: 'Butterfly Milkers', baseCost: 400, stackMax: 1, desc: 'A mechanized butterfly milker. It will gently milk your butterflies in your absence. Good for busy farmers or those with chapped hands.' },
  piggy_feeder: { label: 'Piggy Feeder', namePlural: 'Piggy Feeders', baseCost: 200, stackMax: 1, desc: 'A piggy feeder is a must-have device for lazy farmers. It will feed your pigs while you are away.' },
  bacon: { label: 'Rasher of Bacon', namePlural: 'Rashers of Bacon', baseCost: 20, stackMax: 20, desc: "A delicious, greasy, surprise Piggy treat from the Piggy's newly discovered Orthogonal Meat Generator (OMG).", tags: ['food'] },
  musicblock_d_blue_01: { label: 'Musicblock DB-1', namePlural: 'Musicblock DB-1s', baseCost: 200, stackMax: 1, desc: 'A blue Musicblock.' },
  musicblock_d_red_02: { label: 'Musicblock DR-2', namePlural: 'Musicblock DR-2s', baseCost: 200, stackMax: 1, desc: 'A red Musicblock.' },
  musicblock_b_brown_04: { label: 'Musicblock BB-4', namePlural: 'Musicblock BB-4s', baseCost: 200, stackMax: 1, desc: 'A brown Musicblock.' },
  musicblock_d_green_05: { label: 'Musicblock DG-5', namePlural: 'Musicblock DG-5s', baseCost: 200, stackMax: 1, desc: 'A green Musicblock.' },
  musicblock_x_shiny_03: { label: 'Musicblock XS-3', namePlural: 'Musicblock XS-3s', baseCost: 200, stackMax: 1, desc: 'A shiny Musicblock.' },
});

/** Register the items above (keeps any richer existing catalog entry). */
export function ensureHusbandryItems() {
  for (const [id, meta] of Object.entries(HUSBANDRY_ITEMS)) {
    const existing = ITEM_CATALOG[id];
    ensureItem(id, {
      ...meta,
      label: existing?.label && existing.label !== id ? existing.label : meta.label,
      icon: existing?.icon || `assets/sprites/icons/${id}.png`,
    });
  }
}

export function itemLabel(id, count = 1) {
  const meta = ITEM_CATALOG[id] || HUSBANDRY_ITEMS[id];
  if (!meta) return String(id || '').replace(/_/g, ' ');
  return count === 1 ? meta.label : meta.namePlural || `${meta.label}s`;
}

/** GSJS base_cost of common feeds, for when the making catalog has not loaded yet. */
const FOOD_BASE_COSTS = Object.freeze({
  apple: 5, cherry: 1, grain: 1, orange: 5, lemon: 5, plum: 3, spinach: 3, carrot: 6, corn: 6,
  potato: 7, bun: 9, sammich: 29, meat: 10, pumpkin: 41, broccoli: 5, cabbage: 7, cucumber: 4,
  onion: 4, parsnip: 6, rice: 4, tomato: 5, zucchini: 5, gandlevery: 40, hairball_flower: 66,
  purple_flower: 12, rookswort: 75, rubeweed: 55, silvertongue: 50, yellow_crumb_flower: 66,
  plain_bubble: 2, tiny_bubble: 10, blue_bubble: 5, hard_bubble: 15,
});

export function itemBaseCost(id) {
  const n = Number(ITEM_CATALOG[id]?.baseCost ?? HUSBANDRY_ITEMS[id]?.baseCost ?? FOOD_BASE_COSTS[id]);
  return Number.isFinite(n) ? n : 0;
}

/** Crop stackmax when the catalog has not loaded (crop .js files: 80, pumpkin 11, herbs 50). */
const CROP_STACKMAX = Object.freeze({ pumpkin: 11 });

export function itemStackMax(id) {
  const n = Number(ITEM_CATALOG[id]?.stackMax ?? HUSBANDRY_ITEMS[id]?.stackMax);
  if (Number.isFinite(n) && n > 0) return n;
  if (CROP_STACKMAX[id]) return CROP_STACKMAX[id];
  if (String(PIGGY_CROP_SEEDS[id] || '').startsWith('herb_seed_')) return 50;
  return PIGGY_CROP_SEEDS[id] ? 80 : 1;
}

/** crop_base produced_by_class: every crop and herb and the seed it grows from. */
export const PIGGY_CROP_SEEDS = Object.freeze({
  broccoli: 'seed_broccoli',
  cabbage: 'seed_cabbage',
  carrot: 'seed_carrot',
  corn: 'seed_corn',
  cucumber: 'seed_cucumber',
  onion: 'seed_onion',
  parsnip: 'seed_parsnip',
  potato: 'seed_potato',
  pumpkin: 'seed_pumpkin',
  rice: 'seed_rice',
  spinach: 'seed_spinach',
  tomato: 'seed_tomato',
  zucchini: 'seed_zucchini',
  gandlevery: 'herb_seed_gandlevery',
  hairball_flower: 'herb_seed_hairball_flower',
  purple_flower: 'herb_seed_purple_flower',
  rookswort: 'herb_seed_rookswort',
  rubeweed: 'herb_seed_rubeweed',
  silvertongue: 'herb_seed_silvertongue',
  yellow_crumb_flower: 'herb_seed_yellow_crumb_flower',
});

export const isCrop = (id) => Object.prototype.hasOwnProperty.call(PIGGY_CROP_SEEDS, id);

/** Bubbles (the `bubble` tag) for Caterpillars. */
const BUBBLES = new Set(['plain_bubble', 'tiny_bubble', 'blue_bubble', 'hard_bubble']);
export function isBubble(id) {
  return BUBBLES.has(id) || (ITEM_CATALOG[id]?.tags || []).includes('bubble');
}

/** include/food.js `is_food`: anything the remake can eat (not drinks), plus crops. */
export function isFoodItem(id) {
  if (!id) return false;
  if (isCrop(id) || isBubble(id) || FOOD_BASE_COSTS[id]) return true;
  const tags = ITEM_CATALOG[id]?.tags || HUSBANDRY_ITEMS[id]?.tags || [];
  if (tags.includes('food') || tags.includes('crop')) return true;
  const use = getItemUseInfo(id);
  return Boolean(use?.usable && use.kind === 'food');
}

// ---------------------------------------------------------------------------
// Batterflies and Guano
// ---------------------------------------------------------------------------

export const BATTERFLY_ID = 'npc_batterfly';

export const BATTERFLY = Object.freeze({
  label: 'Batterfly',
  plural: 'Batterflies',
  subtitle: 'Fed at one end, useful at the other',
  description: 'Found in caverns (where the perpetual darkness may account for their pissy mood) it has been shown that Batterflies, when fed at one end, produce useful agricultural materials from the other.',
  /** npc_batterfly onCreate apiSetInterval('onInterval', 1*60): minutes. */
  passiveIntervalMs: 60 * MINUTE,
  passiveCap: 10,
  /** flyAround: the bottom 400 px of the street. */
  flyHeight: 400,
  feedTooltip: 'Or, drag food to the Batterfly',
  noFoodMsg: "You don't have anything the Batterfly wants to eat!",
});

export const BATTERFLY_RESPONSES = Object.freeze({
  feed_drops_1: ['poop', '*heaving sigh*', 'this is all you deserve', 'small comfort for you', 'a little gift from the darkness'],
  feed_drops_2: ['poop poop', '*deep sigh*', "this is all you're getting", 'a measure of comfort for your trouble, yes?', 'a glitch sized guanoparcel from the deep'],
  feed_drops_3: ['happy poopday. poop poop poop.', '*sigh*', 'this is all i have', 'make yourself comfortable with this', 'giant guanogifts for your dungeonic overkindness'],
  feed_no_guano: ['Nope. No poop.', '*Unnngh* Nope.', 'for that? nothing.', 'My stomach is not even full.', "I don't really need to go yet."],
});

/** The guano a fed Batterfly releases for its running food counter (base-cost units). */
export function guanoForFoodCounter(counter, upgrades = []) {
  const owned = new Set(upgrades || []);
  if (owned.has('batterfly_bonus_guano_2') && counter >= 80) return { guano: 5, response: 'feed_drops_3' };
  if (counter >= 100 || (owned.has('batterfly_bonus_guano') && counter >= 50)) return { guano: 3, response: 'feed_drops_3' };
  if (counter >= 50) return { guano: 2, response: 'feed_drops_2' };
  if (counter >= 15) return { guano: 1, response: 'feed_drops_1' };
  return { guano: 0, response: 'feed_no_guano' };
}

/**
 * Feed `count` of one food to a Batterfly. Mutates the Batterfly state and the
 * pack. Returns the guano released (to drop on the ground) and the reply.
 */
export function feedBatterfly(state, inv, classTsid, count = 1, { upgrades = [], rng = Math.random } = {}) {
  const n = Math.max(1, Math.floor(Number(count) || 1));
  if (!isFoodItem(classTsid)) return { ok: false, msg: "That isn't something a Batterfly eats." };
  if ((inv?.[classTsid] || 0) < n) return { ok: false, msg: `You don't have ${n} ${itemLabel(classTsid, n)}.` };
  inv[classTsid] -= n;
  const s = state || {};
  s.foodCounter = (Number(s.foodCounter) || 0) + n * itemBaseCost(classTsid);
  const { guano, response } = guanoForFoodCounter(s.foodCounter, upgrades);
  if (guano) s.foodCounter = 0;
  s.fedCount = (Number(s.fedCount) || 0) + 1;
  return {
    ok: true,
    guano,
    response,
    reply: pick(BATTERFLY_RESPONSES[response], rng),
    msg: `You fed the Batterfly ${n} ${itemLabel(classTsid, n)}.${guano ? ` It "released" ${guano} guano.` : ''}`,
  };
}

/**
 * Passive Guano: each Batterfly adds one every hour while the street holds
 * fewer than 10. Advances `state.passiveAt` and returns how many to drop.
 */
export function passiveGuano(state, now, guanoOnStreet = 0) {
  const s = state || {};
  if (!Number.isFinite(s.passiveAt)) {
    s.passiveAt = now;
    return 0;
  }
  const due = Math.floor((now - s.passiveAt) / BATTERFLY.passiveIntervalMs);
  if (due <= 0) return 0;
  s.passiveAt += due * BATTERFLY.passiveIntervalMs;
  return Math.max(0, Math.min(due, BATTERFLY.passiveCap - guanoOnStreet));
}

/**
 * Where Batterflies live. No archived street places one and nothing in GSJS
 * spawns one, but the item says "Found in caverns" and the Batterfly Bounty
 * quest sends you to "a batterfly roaming the caves". The remake puts one or
 * two (stable per street) on cave and cavern streets: the Ilmenskie Caverns,
 * Ilmenskie Deeps and Uralia hubs, plus any street whose public or template
 * name says cave, cavern, grotto, tunnel or hollow.
 */
export const BATTERFLY_CAVE_HUBS = Object.freeze(['Ilmenskie Caverns', 'Ilmenskie Deeps', 'Uralia']);
const CAVE_WORDS = /(cave|cavern|grotto|tunnel|hollow)/i;

export function isBatterflyHabitat(street = {}) {
  if (!street) return false;
  if (BATTERFLY_CAVE_HUBS.includes(String(street.hubName || ''))) return true;
  return CAVE_WORDS.test(String(street.label || '')) || CAVE_WORDS.test(String(street.internalLabel || ''));
}

function hashString(text) {
  let h = 2166136261;
  for (const ch of String(text || '')) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function batterflyCountForStreet(street = {}) {
  if (!isBatterflyHabitat(street)) return 0;
  return 1 + (hashString(street.tsid || street.label) % 2);
}

// ---------------------------------------------------------------------------
// Piggy feeding and Piggy Plop
// ---------------------------------------------------------------------------

export const PIGGY_FEED = Object.freeze({
  xp: 2,
  minBaseCost: 5,
  cropsPerPlop: 3,
  plopEveryMs: 5000,
  seedsPerPlop: [2, 7],
});

/**
 * npc_animal feed for a Piggy: feed up to one stack at once. Mutates the
 * piggy state and returns the XP, plop entries to queue, and the source line.
 */
export function feedPiggyStack(state, classTsid, requested = 1) {
  const s = state || {};
  const count = Math.max(1, Math.min(Math.floor(Number(requested) || 1), itemStackMax(classTsid)));
  let xp = 0;
  const hungry = Number(s.hunger) !== 0;
  if (itemBaseCost(classTsid) >= PIGGY_FEED.minBaseCost && hungry) {
    s.hunger = 0;
    xp = PIGGY_FEED.xp;
  }
  const plops = [];
  const seed = PIGGY_CROP_SEEDS[classTsid];
  if (seed) {
    const crops = s.crops && typeof s.crops === 'object' ? s.crops : (s.crops = {});
    crops[seed] = (Number(crops[seed]) || 0) + count;
    if (seed === 'seed_pumpkin' || crops[seed] >= PIGGY_FEED.cropsPerPlop) {
      crops[seed] = 0;
      plops.push({ type: seed, num: seed === 'seed_pumpkin' ? Math.round(count * 2) : Math.round(count / 3) });
    }
  }
  return {
    count,
    xp,
    plops,
    msg: `You fed the Piggy ${count} ${itemLabel(classTsid, count)}.`,
  };
}

/** doPlop: take one plop (2-7 seeds, capped by what is left) off a queue. */
export function takePlop(queue, rng = Math.random) {
  if (!Array.isArray(queue) || !queue.length) return null;
  const head = queue[0];
  const seedCount = Math.min(randInt(PIGGY_FEED.seedsPerPlop[0], PIGGY_FEED.seedsPerPlop[1], rng), head.num);
  if (head.num > seedCount) head.num -= seedCount;
  else queue.shift();
  return { seedClass: head.type, seedCount, more: queue.length > 0 };
}

/** Pending plops per piggy target (shared by content.js and the feature). */
const plopQueues = new Map();

export function queuePlops(target, entries, now = Date.now()) {
  if (!target || !entries?.length) return;
  const row = plopQueues.get(target) || { queue: [], nextAt: now };
  row.queue.push(...entries.map((e) => ({ type: e.type, num: e.num })));
  if (!plopQueues.has(target)) row.nextAt = now;
  plopQueues.set(target, row);
}

/** Plops due now: [{ target, seedClass, seedCount }]. */
export function drainPlops(now = Date.now(), rng = Math.random) {
  const out = [];
  for (const [target, row] of plopQueues) {
    if (now < row.nextAt) continue;
    const plop = takePlop(row.queue, rng);
    if (plop) out.push({ target, seedClass: plop.seedClass, seedCount: plop.seedCount });
    if (!row.queue.length) plopQueues.delete(target);
    else row.nextAt = now + PIGGY_FEED.plopEveryMs;
  }
  return out;
}

export function clearPlopQueues() {
  plopQueues.clear();
}

export function pendingPlopCount() {
  let n = 0;
  for (const row of plopQueues.values()) n += row.queue.length;
  return n;
}

export const PLOP = Object.freeze({
  examineTooltip: 'Take a closer look at this plop',
  sniffTooltip: "It can't hurt to have a little smell",
  tasteTooltip: 'Um ...',
  sniffMsg: "Not bad, actually. You've smelled worse. Indeed you have.",
  tasteMsg: "To be frank, we didn't think anyone would ever choose to taste a Piggy Plop. We're kind of at a loss here. Let's all just go about our business and pretend this never happened.",
  sniffEnergy: 2,
  sniffXp: 2,
});

/** plop.js examine: what the plop turns into. */
export function examinePlop(plop = {}) {
  const seedClass = plop.seedClass || 'seed_corn';
  const seedCount = Number(plop.seedCount) > 0 ? Math.floor(Number(plop.seedCount)) : 1;
  return {
    seedClass,
    seedCount,
    msg: `You found ${seedCount} ${itemLabel(seedClass, seedCount)} in that plop!`,
  };
}

// ---------------------------------------------------------------------------
// Pack side tables: plop contents, baby feed progress, hog-tie timers
// ---------------------------------------------------------------------------

/** Runtime state the feature saves (see normalizeHusbandryPack). */
const packState = { plops: [], babies: {}, hogtie: null, captures: {}, captureCooldownUntil: 0 };

export function husbandryPack() {
  return packState;
}

export function normalizeHusbandryPack(seed = {}) {
  const s = seed && typeof seed === 'object' ? seed : {};
  packState.plops = (Array.isArray(s.plops) ? s.plops : [])
    .filter((p) => p && typeof p.seedClass === 'string')
    .slice(0, 200)
    .map((p) => ({ seedClass: p.seedClass, seedCount: Math.max(0, Math.floor(Number(p.seedCount) || 0)) }));
  packState.babies = {};
  for (const id of Object.keys(BABY_ANIMALS)) {
    const list = Array.isArray(s.babies?.[id]) ? s.babies[id] : [];
    packState.babies[id] = list.slice(0, 50).map((n) => Math.max(0, Math.floor(Number(n) || 0)));
  }
  packState.hogtie = s.hogtie && Number.isFinite(Number(s.hogtie.escapeAt))
    ? { escapeAt: Number(s.hogtie.escapeAt), nextXpAt: Number(s.hogtie.nextXpAt) || 0, name: typeof s.hogtie.name === 'string' ? s.hogtie.name : '' }
    : null;
  packState.captures = {};
  for (const [tsid, at] of Object.entries(s.captures || {})) {
    if (Number.isFinite(Number(at))) packState.captures[tsid] = Number(at);
  }
  packState.captureCooldownUntil = Number(s.captureCooldownUntil) || 0;
  return packState;
}

/** Keep a FIFO side table the same length as the pack count. */
function reconcile(list, count, fill) {
  while (list.length > count) list.shift();
  while (list.length < count) list.push(fill());
  return list;
}

export function reconcilePackPlops(inv) {
  return reconcile(packState.plops, Math.max(0, inv?.plop || 0), () => ({ seedClass: 'seed_corn', seedCount: 1 }));
}

// ---------------------------------------------------------------------------
// Incubation and baby animals
// ---------------------------------------------------------------------------

export const INCUBATION = Object.freeze({
  skill: 'animalhusbandry_1',
  halfwayMs: 30 * 1000,
  completeMs: 60 * 1000,
  giveRadius: 100,
  hatches: Object.freeze({ piggy_egg: 'piglet', butterfly_egg: 'caterpillar', chicken_egg: 'chick' }),
  tooltip: 'Ask this Chicken to incubate a seasoned egg',
  halfwayLine: "I'm almost done with this thing.",
  busyLine: "Sorry, I've already got a bun in the oven. Come back when I have free space for more eggs.",
  noEggLine: "Chickens incubate eggs. You don't have any!",
  twinLine: 'You got a bonus baby animal!',
});

export const INCUBATION_RESPONSES = Object.freeze({
  incubation_start: [
    "Now the chicken is superior, eh? Wait here ONE MINUTE and I'll give it back.",
    "No squeezing while I sit? Ok deal. But, you can't leave for a whole minute. Stay, if you want your animal.",
    "Well, comfortable it isn't... but ok. Deal is that you have to wait a full minute.",
    "I'm egg-static to be of service. That was sarcasm. But whatever ... if you stick around for a minute I'll get 'er done.",
    'At least you appreciate my warm underfeatheredside.  Love it! Also, stick around for sixty seconds or lose it!',
  ],
  incubation_complete: [
    'Ping!',
    'Done! What were you expecting, 3 1/2 minutes?',
    'Buk! It bit my butt! You owe me a beer.',
    'Here. Another new life. A miracle. Thank me later.',
    'Ta DA!',
  ],
});

export function incubationEggOptions(inv = {}) {
  return Object.keys(INCUBATION.hatches)
    .filter((id) => (inv[id] || 0) > 0)
    .map((id) => ({ classTsid: id, label: itemLabel(id), have: inv[id] }));
}

/** Verb availability for a Chicken (null = hidden, like {state:null}). */
export function incubateVerbState(state = {}, learned = []) {
  if (!(learned || []).includes(INCUBATION.skill)) return null;
  if (state.incubatingEgg) return { enabled: false, reason: INCUBATION.busyLine };
  return { enabled: true, reason: '' };
}

export function startIncubation(state, inv, eggClass, now = Date.now(), rng = Math.random) {
  const s = state || {};
  if (s.incubatingEgg) return { ok: false, msg: INCUBATION.busyLine, bubble: INCUBATION.busyLine };
  if (!INCUBATION.hatches[eggClass]) return { ok: false, msg: "Chickens incubate eggs. That isn't one." };
  if ((inv?.[eggClass] || 0) < 1) return { ok: false, msg: INCUBATION.noEggLine, bubble: INCUBATION.noEggLine };
  inv[eggClass] -= 1;
  s.incubatingEgg = eggClass;
  s.incubationStartedAt = now;
  s.incubationHalfwaySaid = false;
  const bubble = pick(INCUBATION_RESPONSES.incubation_start, rng);
  return { ok: true, egg: eggClass, bubble, msg: `You gave the Chicken a ${itemLabel(eggClass)} to incubate.` };
}

/** idle | sitting | halfway | complete */
export function incubationPhase(state = {}, now = Date.now(), timing = INCUBATION) {
  if (!state.incubatingEgg) return 'idle';
  const t = now - (Number(state.incubationStartedAt) || now);
  if (t >= timing.completeMs) return 'complete';
  if (t >= timing.halfwayMs) return 'halfway';
  return 'sitting';
}

export function resetIncubation(state = {}) {
  delete state.incubatingEgg;
  delete state.incubationStartedAt;
  delete state.incubationHalfwaySaid;
}

/** giveIncubatedItem: the hatchling (and a twin with the upgrades) into the pack. */
export function hatchIncubation(state, inv, { upgrades = [], rng = Math.random, maxLuck = false } = {}) {
  const egg = state?.incubatingEgg;
  const itemClass = INCUBATION.hatches[egg];
  if (!itemClass) {
    resetIncubation(state || {});
    return { ok: false };
  }
  const owned = new Set(upgrades || []);
  let count = 1;
  if (owned.has('animal_husbandry_twin_animals_2')) {
    if (rng() < 0.1 || maxLuck) count = 2;
  } else if (owned.has('animal_husbandry_twin_animals_1')) {
    if (rng() < 0.05 || maxLuck) count = 2;
  }
  inv[itemClass] = (inv[itemClass] || 0) + count;
  const babies = packState.babies[itemClass] || (packState.babies[itemClass] = []);
  for (let i = 0; i < count; i += 1) babies.push(0);
  resetIncubation(state);
  return {
    ok: true,
    egg,
    itemClass,
    count,
    bubble: pick(INCUBATION_RESPONSES.incubation_complete, rng),
    counter: `eggs_incubated:${egg}`,
  };
}

export const BABY_ANIMALS = Object.freeze({
  chick: Object.freeze({
    growsInto: 'npc_chicken',
    feedsToGrow: 10,
    eats: (id) => id === 'grain',
    tooltip: 'Chicks like grain',
    emptyMsg: 'With what? Chicks need to eat grain to grow!',
    grewMsg: 'It grew into a Chicken!',
    extraVerb: Object.freeze({
      id: 'smile_at',
      label: 'smile at',
      tooltip: 'Caution: potential disappointment',
      msg: 'The chick stares back at you with its unblinking little eyes. For such a small creature, this is surprisingly unnerving.',
      energy: 0,
      mood: -3,
    }),
  }),
  piglet: Object.freeze({
    growsInto: 'npc_piggy',
    feedsToGrow: 3,
    eats: (id) => isCrop(id),
    tooltip: 'Piglet likes crops',
    emptyMsg: 'With what? Piggies will eat just about anything that grows in the ground!',
    grewMsg: 'It grew into a Piggy!',
    extraVerb: Object.freeze({
      id: 'hum_to',
      label: 'hum to',
      tooltip: 'A mood brightener. Costs 2 energy',
      msg: 'You hum an off-key hum. Fortunately, piggies are tone deaf. The piglet squirms delightedly. You squirm a little bit, too.',
      energy: -2,
      mood: 2,
    }),
  }),
  caterpillar: Object.freeze({
    growsInto: 'npc_butterfly',
    feedsToGrow: 1,
    eats: (id) => isBubble(id),
    tooltip: 'Caterpillar likes bubbles',
    emptyMsg: 'With what? Caterpillars like leaves and things that pop.',
    grewMsg: 'It grew into a Butterfly!',
    extraVerb: null,
  }),
});

export function babyFoodOptions(babyClass, inv = {}) {
  const baby = BABY_ANIMALS[babyClass];
  if (!baby) return [];
  return Object.keys(inv)
    .filter((id) => (inv[id] || 0) > 0 && baby.eats(id))
    .sort()
    .map((id) => ({ classTsid: id, label: itemLabel(id), have: inv[id] }));
}

/**
 * Feed the first baby of a class in the pack one food. Returns { grew } when
 * it reaches full size: the caller places the grown animal on the street and
 * removes the baby from the pack (this function already did).
 */
export function feedBaby(babyClass, inv, foodClass) {
  const baby = BABY_ANIMALS[babyClass];
  if (!baby) return { ok: false, msg: "That isn't a baby animal." };
  if ((inv?.[babyClass] || 0) < 1) return { ok: false, msg: `You have no ${itemLabel(babyClass)}.` };
  if (!baby.eats(foodClass) || (inv[foodClass] || 0) < 1) return { ok: false, msg: baby.emptyMsg };
  const list = reconcile(packState.babies[babyClass] || (packState.babies[babyClass] = []), inv[babyClass], () => 0);
  inv[foodClass] -= 1;
  list[0] = (list[0] || 0) + 1;
  const xp = 2;
  if (list[0] >= baby.feedsToGrow) {
    list.shift();
    inv[babyClass] -= 1;
    return { ok: true, xp, grew: baby.growsInto, msg: baby.grewMsg, counter: `animals_grown:${babyClass}`, fed: baby.feedsToGrow, need: baby.feedsToGrow };
  }
  return { ok: true, xp, grew: null, msg: `You fed the ${itemLabel(babyClass)} one ${itemLabel(foodClass)}.`, fed: list[0], need: baby.feedsToGrow };
}

export function babyProgress(babyClass, inv = {}) {
  const baby = BABY_ANIMALS[babyClass];
  if (!baby) return null;
  const list = reconcile(packState.babies[babyClass] || (packState.babies[babyClass] = []), inv[babyClass] || 0, () => 0);
  return { fed: list[0] || 0, need: baby.feedsToGrow };
}

// ---------------------------------------------------------------------------
// Naming (Animal Kinship V)
// ---------------------------------------------------------------------------

export const NAMING = Object.freeze({
  skill: 'animalkinship_5',
  maxLength: 32,
  renameAfterS: 3600,
  questCounters: Object.freeze({ npc_piggy: 'piggies_named', npc_butterfly: 'butterflies_named', npc_chicken: 'chickens_named' }),
  nameTooltip: (label) => `Give this ${label} a name`,
  renameTooltip: (label) => `Change this ${label}'s name`,
});

export const NAMEABLE_ANIMALS = Object.freeze({
  npc_piggy: 'Piggy',
  npc_chicken: 'Chicken',
  npc_butterfly: 'Butterfly',
  npc_batterfly: 'Batterfly',
});

export function sanitizeAnimalName(value) {
  return String(value ?? '').substr(0, NAMING.maxLength).replace(/[^a-z0-9 ]/gi, '');
}

/** animal_naming.js canName for the solo remake (the player id is constant). */
export function canNameAnimal(state = {}, { learned = [], playerId = 'player', nowS = Math.floor(Date.now() / 1000), ownYard = false } = {}) {
  if (!(learned || []).includes(NAMING.skill)) return false;
  if (ownYard) return true;
  if (!state.userName) return true;
  if (state.namer === playerId) return true;
  if (!state.namedOn || nowS - Number(state.namedOn) > NAMING.renameAfterS) return true;
  return false;
}

/** Name / Rename verb rows ({state:null} → omitted). */
export function namingVerbs(classId, state = {}, ctx = {}) {
  const label = NAMEABLE_ANIMALS[classId];
  if (!label || !canNameAnimal(state, ctx)) return [];
  if (!state.userName) {
    return [{ id: 'name', label: 'name', sort: 57, tooltip: NAMING.nameTooltip(label), enabled: true }];
  }
  return [{ id: 'rename', label: 'rename', sort: 58, tooltip: NAMING.renameTooltip(label), enabled: true }];
}

export function nameAnimal(classId, state, value, ctx = {}) {
  if (!canNameAnimal(state, ctx)) return { ok: false, reason: "You can't name this animal right now." };
  const name = sanitizeAnimalName(value);
  if (!name) return { ok: false, reason: 'Names need at least one letter or number.' };
  if (name === state.userName) return { ok: false, reason: 'unchanged' };
  const previous = state.userName || '';
  state.userName = name;
  state.namer = ctx.playerId || 'player';
  state.namedOn = Number.isFinite(ctx.nowS) ? ctx.nowS : Math.floor(Date.now() / 1000);
  return {
    ok: true,
    name,
    previous,
    bubble: `And they shall call me "${name}"`,
    counter: `animals_named:${classId}`,
    questCounter: NAMING.questCounters[classId] || null,
  };
}

/** getLabel: "A Piggy Named Wilbur". */
export function namedAnimalLabel(classId, state = {}, fallback = '') {
  const label = NAMEABLE_ANIMALS[classId] || fallback || classId;
  return state?.userName ? `A ${label} Named ${state.userName}` : fallback || label;
}

// ---------------------------------------------------------------------------
// Herdkeeping: capture, hog-tied piggies, Magic Sticks
// ---------------------------------------------------------------------------

export const HERDKEEPING = Object.freeze({
  skill: 'herdkeeping_1',
  bait: 'pig_bait',
  energy: 20,
  chance: 0.75,
  successMood: 30,
  successXp: 50,
  failMood: 30,
  /** piggy_capture_cooldown duration (s). */
  cooldownMs: 600 * 1000,
  /** achievements_place_time_ago_enough('piggies_captured', tsid, 60*24*24*7) (s). */
  locationCooldownMs: 60 * 24 * 24 * 7 * 1000,
  tooltip: 'Hogtie this Piggy. Uses 1 Bait',
  handsFull: 'Your hands are full. You already have a Piggy to deal with!',
  locationLimit: 'You can only capture one piggy per location per 42 game-days...',
  exhausted: 'You are too exhausted to capture another Piggy right now.',
  noSkill: 'You need to know Herdkeeping to attempt capture.',
  packFull: "There's no room in your pack!",
  noEnergy: "You don't have enough energy to do that",
  noBait: "The piggy ran away! You'll need something in your inventory with which to lure it.",
  hogtieTickMs: 30 * 1000,
  hogtieTickLine: 'Be careful, you can lose the Piggy any minute!',
  escapeLine: 'Your pig has escaped! Oh, cruel fortune!',
  escapeChance: 0.1666667,
  escapeStepMs: 5 * MINUTE,
  releaseTooltip: 'Release the Piggy here',
});

export const PIGGY_CAPTURE_RESPONSES = Object.freeze({
  capture_failed: [
    "No way, dude! I'm not a one-Glitch piggy.",
    "Man, I'm totally not ready to settle down.",
    'I like to think of myself as a free spirit.',
    "Not today, friend. I'm happy chewing on this gnarly patch.",
    "No, dude. I'm dandy just hangin' out here. Mañana.",
  ],
  capture_released: [
    'FREEEEEEEDOM!!!',
    'Pigs like us: totally born to run, dude!',
    'YES! I feel the wind blowing up my snout once more!',
    'Another victory for the pig liberation front!',
    'I am not a captive meat repository! I am a free pig!',
    'Free! Free to be the pig I long to be!',
    'Free to waddle! Waddle like the wind!',
    'I was born to roam, friend.',
  ],
});

/** Capture verb state (conditions in source order). */
export function captureVerbState({ inv = {}, learned = [], energy = 0, streetTsid = '', now = Date.now(), ownYard = false, packFull = false } = {}) {
  if ((inv.hogtied_piggy || 0) > 0) return { enabled: false, reason: HERDKEEPING.handsFull };
  const last = packState.captures[streetTsid];
  if (!ownYard && Number.isFinite(last) && now - last < HERDKEEPING.locationCooldownMs) {
    return { enabled: false, reason: HERDKEEPING.locationLimit };
  }
  if (now < packState.captureCooldownUntil) return { enabled: false, reason: HERDKEEPING.exhausted };
  if (!(learned || []).includes(HERDKEEPING.skill)) return { enabled: false, reason: HERDKEEPING.noSkill };
  if (packFull) return { enabled: false, reason: HERDKEEPING.packFull };
  if (energy <= HERDKEEPING.energy) return { enabled: false, reason: HERDKEEPING.noEnergy };
  return { enabled: true, reason: '' };
}

/** Geometric escape timer: attempts × 5 minutes at 1-in-6 per attempt. */
export function hogtieEscapeDelayMs(chance = HERDKEEPING.escapeChance, rng = Math.random) {
  let u = rng();
  if (u < 0.0000001) u = 0.0000001;
  const attempts = Math.floor(Math.log(u) / Math.log(1 - chance)) + 1;
  return attempts * HERDKEEPING.escapeStepMs;
}

/**
 * Capture a Piggy. Mutates pc/inv/pack state. On success the caller removes
 * the piggy from the street (`removePiggy`).
 */
export function capturePiggy(state, { pc, inv, learned = [], streetTsid = '', now = Date.now(), ownYard = false, rng = Math.random } = {}) {
  const gate = captureVerbState({ inv, learned, energy: pc?.energy || 0, streetTsid, now, ownYard });
  if (!gate.enabled) return { ok: false, msg: gate.reason };
  const effects = { energy: 0, mood: 0, xp: 0, items: {} };
  if ((inv.pig_bait || 0) < 1) return { ok: false, msg: HERDKEEPING.noBait, effects };
  inv.pig_bait -= 1;
  effects.items.pig_bait = -1;
  const lost = Math.min(pc.energy || 0, HERDKEEPING.energy);
  pc.energy = (pc.energy || 0) - lost;
  effects.energy = -lost;
  if (rng() < HERDKEEPING.chance) {
    inv.hogtied_piggy = (inv.hogtied_piggy || 0) + 1;
    effects.items.hogtied_piggy = 1;
    const before = pc.mood || 0;
    pc.mood = Math.min(moodMax(pc), before + HERDKEEPING.successMood);
    effects.mood = pc.mood - before;
    if (!ownYard) {
      pc.xp = (pc.xp || 0) + HERDKEEPING.successXp;
      pc.imagination = (pc.imagination || 0) + HERDKEEPING.successXp;
      effects.xp = HERDKEEPING.successXp;
    }
    packState.captures[streetTsid] = now;
    if (!ownYard) packState.captureCooldownUntil = now + HERDKEEPING.cooldownMs;
    packState.hogtie = {
      escapeAt: now + hogtieEscapeDelayMs(HERDKEEPING.escapeChance, rng),
      nextXpAt: now + HERDKEEPING.hogtieTickMs,
      name: state?.userName || '',
    };
    return {
      ok: true,
      captured: true,
      effects,
      questCounter: ownYard ? null : 'pigs_hogtied',
      counter: 'piggies_captured:npc_piggy',
      msg: 'You captured a Piggy!',
    };
  }
  const before = pc.mood || 0;
  pc.mood = Math.max(0, before - HERDKEEPING.failMood);
  effects.mood = pc.mood - before;
  return { ok: false, attempted: true, effects, bubble: pick(PIGGY_CAPTURE_RESPONSES.capture_failed, rng), msg: 'You failed to capture the Piggy.' };
}

/** released(): the hog-tied piggy becomes a normal piggy (mood 0) here. */
export function releaseHogtied(inv, rng = Math.random) {
  if ((inv?.hogtied_piggy || 0) < 1) return { ok: false, msg: 'You have no Hog-tied Piggy.' };
  inv.hogtied_piggy -= 1;
  const name = packState.hogtie?.name || '';
  packState.hogtie = inv.hogtied_piggy > 0
    ? { escapeAt: Date.now() + hogtieEscapeDelayMs(HERDKEEPING.escapeChance, rng), nextXpAt: Date.now() + HERDKEEPING.hogtieTickMs, name: '' }
    : null;
  return { ok: true, name, bubble: pick(PIGGY_CAPTURE_RESPONSES.capture_released, rng) };
}

/** hog_tie buff tick + escape timer. Returns { xp, escaped }. */
export function stepHogtie(inv, now = Date.now()) {
  const h = packState.hogtie;
  if (!h || (inv?.hogtied_piggy || 0) < 1) {
    if (h && (inv?.hogtied_piggy || 0) < 1) packState.hogtie = null;
    return { xp: 0, escaped: false };
  }
  let xp = 0;
  while (h.nextXpAt && now >= h.nextXpAt && xp < 20) {
    xp += 1;
    h.nextXpAt += HERDKEEPING.hogtieTickMs;
  }
  return { xp, escaped: now >= h.escapeAt };
}

export const MAGIC_STICKS = Object.freeze({
  magic_pig_stick: Object.freeze({ animal: 'npc_piggy', label: 'Pig Stick', upgrade: 'herdkeeping_pig_stick', radiusTooltip: 'Set how close Piggies stick to the Pig Stick!' }),
  magic_chicken_stick: Object.freeze({ animal: 'npc_chicken', label: 'Chicken Stick', upgrade: 'herdkeeping_chicken_stick', radiusTooltip: 'Set how close Chickens stick to the Chicken Stick!' }),
  magic_butterfly_stick: Object.freeze({ animal: 'npc_butterfly', label: 'Butterfly Stick', upgrade: 'herdkeeping_butterfly_stick', radiusTooltip: 'Set how close Butterflies stick to the Butterfly Stick!' }),
});

export const STICK_DISTANCE = 250;
export const STICK_RADIUS_CHOICES = Object.freeze([
  { label: 'Very wide', value: 300 },
  { label: 'Kinda wide', value: 200 },
  { label: 'Medium', value: 150 },
  { label: 'Tight', value: 100 },
  { label: 'Very Tight', value: 50 },
]);

export function stickPlaceState(classTsid, { learned = [], ownYard = false, placed = [] } = {}) {
  const def = MAGIC_STICKS[classTsid];
  if (!def) return { enabled: false, reason: '' };
  if (!ownYard) return { enabled: false, reason: 'You can only place this in a location you own.' };
  if (!(learned || []).includes(HERDKEEPING.skill)) return { enabled: false, reason: 'You need to know Herdkeeping to use this.' };
  if ((placed || []).some((p) => p.classTsid === classTsid)) return { enabled: false, reason: `You already have a ${def.label} here.` };
  return { enabled: true, reason: '' };
}

// ---------------------------------------------------------------------------
// Remote Herdkeeping: Meat Collector, Butterfly Milker, Piggy Feeder
// ---------------------------------------------------------------------------

export const REMOTE_SKILL = 'remoteherdkeeping_1';

export const REMOTE_MACHINES = Object.freeze({
  meat_collector: Object.freeze({
    label: 'Meat Collector',
    animal: 'npc_piggy',
    output: 'meat',
    capacity: 60,
    intervalMin: 24,
    questCounter: 'meat_collected',
    fullFlag: 'meat_collector_full',
    fullPrompt: 'Your Meat Collector is full! Come back to your house to collect from it.',
    collectTooltip: 'Retrieve any meat inside',
    placeTooltip: 'Place this Meat Collector here',
    inoperable: 'This Meat Collector is inoperable. You can use only a Meat Collector in a back yard.',
  }),
  butterfly_milker: Object.freeze({
    label: 'Butterfly Milker',
    animal: 'npc_butterfly',
    output: 'milk_butterfly',
    capacity: 80,
    intervalMin: 24,
    questCounter: 'milk_collected',
    fullFlag: 'butterfly_milker_full',
    fullPrompt: 'Your Butterfly Milker is full! Come back to your house to collect from it.',
    collectTooltip: 'Retrieve any milk inside',
    placeTooltip: 'Place this Butterfly Milker here',
    inoperable: 'This Butterfly Milker is inoperable. You can use only a Butterfly Milker in a back yard.',
  }),
  piggy_feeder: Object.freeze({
    label: 'Piggy Feeder',
    animal: 'npc_piggy',
    output: null,
    capacity: 80,
    intervalMin: 20,
    depositTooltip: 'Stock with food for the piggies',
    placeTooltip: 'Place this Piggy Feeder here',
    inoperable: 'A Piggy Feeder only feeds piggies in your back yard.',
  }),
});

export const BUTTERFLY_LIFE_POINTS = 400;
export const HALF_DAY_MS = GAME_DAY_MS / 2;

/** onChangeInterval: production upgrades shorten collection to 22 / 20 minutes. */
export function machineIntervalMs(classTsid, upgrades = []) {
  const def = REMOTE_MACHINES[classTsid];
  if (!def) return 0;
  if (classTsid === 'piggy_feeder') return def.intervalMin * MINUTE;
  const owned = new Set(upgrades || []);
  if (owned.has('remoteherdkeeping_production_2')) return 20 * MINUTE;
  if (owned.has('remoteherdkeeping_production_1')) return 22 * MINUTE;
  return def.intervalMin * MINUTE;
}

export function createMachine(classTsid, x, now = Date.now()) {
  return { classTsid, x: Math.round(Number(x) || 0), inside: 0, nextAt: now + machineIntervalMs(classTsid), fullNotified: false };
}

export function machineLabel(machine) {
  const def = REMOTE_MACHINES[machine?.classTsid];
  if (!def) return '';
  return `${def.label} (${machine.inside || 0}/${def.capacity})`;
}

/** isLeftMost: the left-most collector of its class that is not full does the work. */
function isLeftMost(machine, machines) {
  const def = REMOTE_MACHINES[machine.classTsid];
  if ((machine.inside || 0) >= def.capacity) return false;
  return !machines.some((m) => m !== machine && m.classTsid === machine.classTsid && m.x <= machine.x && (m.inside || 0) < def.capacity);
}

/** npc_animal onTwiceDaily hunger: +1 each half day below 2, then only on the daily tick. */
function hungerTick(state) {
  state.isDaily = state.isDaily ? 0 : 1;
  const hunger = Number(state.hunger) || 0;
  if (hunger < 2) state.hunger = hunger + 1;
  else if (hunger < 10 && state.isDaily) state.hunger = hunger + 1;
}

/**
 * Advance a back yard (animals + machines) to `now`, replaying every hunger
 * tick, feeder pass and collector pass in time order so a long absence works
 * like the server's intervals did. Returns events: { type: 'full', classTsid }
 * and { type: 'ascend', animal, drops }.
 */
export function advanceYard(yard, now = Date.now(), { upgrades = [], rng = Math.random } = {}) {
  const events = [];
  if (!yard) return events;
  const animals = (yard.animals ||= []);
  const machines = (yard.machines ||= []);
  for (const a of animals) {
    a.state ||= {};
    if (a.classId === 'npc_piggy' && !Number.isFinite(a.state.hungerAt)) a.state.hungerAt = now + HALF_DAY_MS;
    if (a.classId === 'npc_butterfly' && !Number.isFinite(a.state.lifePoints)) a.state.lifePoints = BUTTERFLY_LIFE_POINTS;
  }
  for (const m of machines) if (!Number.isFinite(m.nextAt)) m.nextAt = now + machineIntervalMs(m.classTsid, upgrades);

  for (let guard = 0; guard < 20000; guard += 1) {
    // Next event across hunger ticks and machine passes.
    let at = Infinity;
    let kind = null;
    let subject = null;
    for (const a of animals) {
      if (a.classId === 'npc_piggy' && a.state.hungerAt < at) {
        at = a.state.hungerAt;
        kind = 'hunger';
        subject = a;
      }
    }
    for (const m of machines) {
      if (m.nextAt < at) {
        at = m.nextAt;
        kind = 'machine';
        subject = m;
      }
    }
    if (!kind || at > now) break;
    if (kind === 'hunger') {
      hungerTick(subject.state);
      subject.state.hungerAt += HALF_DAY_MS;
      continue;
    }
    const m = subject;
    m.nextAt += machineIntervalMs(m.classTsid, upgrades);
    const def = REMOTE_MACHINES[m.classTsid];
    if (m.classTsid === 'piggy_feeder') {
      if (!(m.inside > 0)) continue;
      for (const a of animals) {
        if (a.classId !== 'npc_piggy' || Number(a.state.hunger) === 0) continue;
        m.inside -= 1;
        a.state.hunger = 0;
        if (m.inside <= 0) break;
      }
      continue;
    }
    if (!isLeftMost(m, machines)) continue;
    const count = machines.filter((x) => x.classTsid === m.classTsid).length;
    if (count >= 23 || (count > 3 && rng() < (count - 3) * 0.05)) continue;
    for (const a of [...animals]) {
      if (a.classId !== def.animal) continue;
      if (m.classTsid === 'meat_collector' && Number(a.state.hunger) !== 0) continue;
      m.inside = (m.inside || 0) + 1;
      if (m.classTsid === 'butterfly_milker') {
        a.state.lifePoints = (Number(a.state.lifePoints) || BUTTERFLY_LIFE_POINTS) - 1;
        if (a.state.lifePoints <= 0) {
          const roll = rng();
          const drops = roll < 0.1 ? { butterfly_egg: 1 } : roll < 0.5 ? { milk_butterfly: 2 } : roll < 0.8 ? { milk_butterfly: 3 } : { milk_butterfly: 4 };
          animals.splice(animals.indexOf(a), 1);
          events.push({ type: 'ascend', animal: a, drops, xp: 50 });
        }
      }
      if (m.inside >= def.capacity) {
        m.inside = def.capacity;
        if (!m.fullNotified) {
          m.fullNotified = true;
          events.push({ type: 'full', classTsid: m.classTsid });
        }
        break;
      }
    }
  }
  return events;
}

export function collectMachine(machine, inv, learned = []) {
  const def = REMOTE_MACHINES[machine?.classTsid];
  if (!def?.output) return { ok: false, msg: '' };
  if (!(learned || []).includes(REMOTE_SKILL)) return { ok: false, msg: "You don't know how to use this contraption." };
  const n = machine.inside || 0;
  if (!n) return { ok: false, msg: "It's empty!" };
  inv[def.output] = (inv[def.output] || 0) + n;
  machine.inside = 0;
  machine.fullNotified = false;
  return {
    ok: true,
    count: n,
    item: def.output,
    questCounter: def.questCounter,
    msg: def.output === 'meat' ? `You collected ${n} meat.` : `You collected ${n} ${itemLabel(def.output, n)}.`,
  };
}

/** Piggy Feeder deposit: any food, up to its 80 capacity. */
export function depositFeeder(machine, inv, classTsid, count, learned = []) {
  if (!(learned || []).includes(REMOTE_SKILL)) return { ok: false, msg: 'You need to know Remote Herdkeeping to use this' };
  const cap = REMOTE_MACHINES.piggy_feeder.capacity;
  if ((machine.inside || 0) >= cap) return { ok: false, msg: "It's full!" };
  if (!isFoodItem(classTsid)) return { ok: false, msg: "You don't have any food to deposit!" };
  const want = Math.max(1, Math.floor(Number(count) || 1));
  const have = inv?.[classTsid] || 0;
  const amt = Math.min(want, have, cap - (machine.inside || 0));
  if (amt <= 0) return { ok: false, msg: "You don't have any food to deposit!" };
  inv[classTsid] -= amt;
  machine.inside = (machine.inside || 0) + amt;
  return { ok: true, count: amt, msg: amt > 1 ? `You deposited ${amt} ${itemLabel(classTsid, amt)} in a Piggy Feeder.` : `You deposited 1 ${itemLabel(classTsid)} in a Piggy Feeder.` };
}

// ---------------------------------------------------------------------------
// Animal Kinship drop tables (AK V-VII): Chicken squeeze, Piggy nibble bacon
// ---------------------------------------------------------------------------

/** The package drop tables Animal Kinship uses (rows live in js/drop-tables-data.js). */
export const AK_DROP_TABLE_IDS = Object.freeze(['ak_chicken_squeeze', 'ak_chicken_squeeze_seasoned_eggs', 'bacon']);

/** Item classes those tables can hand out (for the supply report). */
export function akDropItems() {
  const out = new Set();
  const walk = (id, depth = 0) => {
    for (const [, entries] of DROP_TABLES[id]?.rows || []) {
      for (const e of entries) {
        if (e.item) out.add(e.item);
        else if (e.table && depth < 4) walk(e.table, depth + 1);
      }
    }
  };
  for (const id of AK_DROP_TABLE_IDS) walk(id);
  return out;
}

/**
 * trySkillPackage drop: drop_chance% (×1.25 under Rubeweed) to run the
 * package's drop table (shared runDropTable). Mutates pc/inv; returns
 * { table, items, currants, musicblock, lines } or null.
 */
export function applyKinshipDrop(profile, { pc, inv, rng = Math.random, rubeweed = false } = {}) {
  if (!profile?.dropClassId || !(profile.dropChance > 0)) return null;
  const chance = Math.min(100, profile.dropChance * (rubeweed ? 1.25 : 1));
  if (!(rng() < chance / 100)) return null;
  const result = rollDropTable(profile.dropClassId, rng);
  const { lines, landed } = applyDropResult(result, { inv, pc });
  const items = {};
  for (const it of landed.items) items[it.classTsid] = (items[it.classTsid] || 0) + it.qty;
  return {
    table: profile.dropClassId,
    items,
    currants: landed.currants,
    lines,
    musicblock: Object.keys(items).some((id) => id.startsWith('musicblock_')),
  };
}
