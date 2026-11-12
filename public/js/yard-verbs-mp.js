/**
 * Visitors' verbs on another player's home street in multiplayer (registers
 * G328 and G201): the rules and words both sides share. Pure (no Pixi, no
 * DOM); features/yard-verbs-mp-feature.js puts them in the world.
 *
 * In the original a home street was the public half of a home: anyone on it
 * could use the ordinary verbs of what grew and walked there, and none of
 * those verbs asked for the owner or a house key:
 * - Piggies: pet, nibble (GameServerJS items/npc_piggy.js 912-960, 818-910)
 * - Butterflies: massage, milk (npc_butterfly.js 753-800, 695-750)
 * - Chickens: squeeze (npc_chicken.js 739-790)
 * - Patches: dig with a shovel, tend with a hoe (patch.js 120-214, 315-380),
 *   and plant a Seasoned Bean of your own (patch.js verbs.plant 216-310: no
 *   owner check; the bean leaves your pack, the Seedling is the street's,
 *   plantBean 742-790, with you as its planter, seedling.owner = pc :747,
 *   whose grow cards set how soon it grows, patch_seedling.js 218-226)
 * - Seedlings: pet (patch_seedling.js verbs.pet 77, onPetted 196-250: three
 *   pets in all, from anyone; a fourth is "You don't need to pet this
 *   seedling any more. Just wait a few minutes.")
 * - trees grown in them: pet, water, harvest (trant_base 463-600,
 *   include/trants.js), a Wood Tree's pet, water and harvest (wood_tree.js
 *   474-560, 510-570: harvest needs a Hatchet, is once a game day per player
 *   and tree, canHarvest 586-612, gives the harvester Planks by the tree's
 *   maturity, plankProdMap 880-887, and takes a maturity every second
 *   harvest, 744-764)
 * The owner keeps what only an owner may do: setting an animal free
 * (set_free: container.owner == pc), removing a Patch (patch.js:63), and a
 * tree's remove, trantsform and poison (owner or key-holder, wood_tree.js
 * 117, 152, 303). Each act by a visitor adds a fixed amount to the owner's
 * Magic Rock pool (locations/inc_cultivation.js cultivation_add_img_rewards
 * 168-178): YARD_POOL below, with each handler's line. Planting, petting a
 * Seedling and harvesting a Wood Tree add nothing (no such call in patch.js
 * plant, patch_seedling.js or wood_tree.js doHarvest).
 *
 * Daily limits are the visitor's own (canPet, canNibble, canHarvest ...:
 * per player and thing, checkSkillPackageOverLimit), so a visitor's copy of
 * an animal or tree carries the visitor's uses today, never the owner's.
 */

import { withArticle } from './words.js?v=ee4e72f8';
import { createAnimalState } from './animals.js?v=cc51a34b';
import { petPiggy } from './animal-mood.js?v=a49495fc';
import { trantFruitCycle } from './trant-care.js?v=b4c09d17';
import { fruitCapacityAt, resetTrantDay } from './trants.js?v=4d6f5593';
import { ensureWoodTreeState } from './woodcutting.js?v=2fdc8fc5';
import { GROWN_TREE_LABELS, SEASONED_BEANS, SOIL_TIMERS, growTree, seedlingTimings } from './patches.js?v=5f333fdb';
import { GAME_DAY_MS, GAME_EPOCH_MS } from './game-day.js?v=cf9afac0';
import { isNodeId, isRockId } from './yard-stock-mp.js?v=002a4e4b';
import { STICK_ANIMAL } from './yard-wander.js?v=5e04606b';
import { normalizeYardMachines } from './yard-fixtures-mp.js?v=dd022fe8';
import { capYardAnimals, yardClassCap } from './animal-crowding.js?v=0ffb4ced';
import { HOUSE_LOT_W, YARD_SEGMENT_W } from './home-cultivation.js?v=1e2d2b2d';
import { HOME_LIMITS } from './homes-catalog.js?v=10ac34b6';

export const YARD_VERBS_MP_ID = 'yard-verbs-mp';
/** js/features/homes-feature.js HOME_STREET_TSID: where an owner's save keeps the home street. */
export const YARD_STREET = 'RH_HOME_EXT';
export const YARD_APPLIED_KEEP = 200;

/** cultivation_add_img_rewards amounts, by the handler that passes them. */
export const YARD_POOL = Object.freeze({
  'npc_piggy:pet': 4, // npc_piggy.js 1764 onPetComplete
  'npc_piggy:nibble': 4, // npc_piggy.js 1664 onNibbleComplete
  'npc_butterfly:massage': 4, // npc_butterfly.js 1187 onMassageComplete
  'npc_butterfly:milk': 4, // npc_butterfly.js 1356 onMilkComplete
  'npc_chicken:squeeze': 4, // npc_chicken.js 1560
  'patch:dig': 8, // patch.js 615 onDigComplete
  'patch:tend': 3, // patch.js 714 onTendComplete
  'trant:pet': 3, // include/trants.js 90 onPettingComplete
  'trant:water': 3, // include/trants.js 196 onWateringComplete
  'trant:harvest': 8, // include/trants.js 420 onHarvestingComplete
  'wood_tree:pet': 3, // wood_tree.js 1018 onTendComplete
  'wood_tree:water': 3, // wood_tree.js 1018 onTendComplete
  // HOMES2: the rest of the source's payments. A full Firefly Jar on a home street (firefly_jar.js:383
  // onAttract, pc.location: the whistler's street). Heli Kitties, Batterflies and Icons pay too, but none
  // can be at a home in the remake yet (animal-husbandry-feature ANIMAL_CLASSES, giant-icons.js), so no act
  // reaches these: they wait for Austin's word on letting them live at home.
  'firefly_jar:full': 25, // firefly_jar.js:383
  'npc_kitty_chicken:squeeze': 4, // npc_kitty_chicken.js:1720 (the Heli Kitty)
  'npc_batterfly:massage': 4, // npc_batterfly.js:1340 onMassageComplete
  'npc_batterfly:milk': 4, // npc_batterfly.js:1509 onMilkComplete
  'icon:ruminate': 10, // include/icon.js:112
  'icon:revere': 10, // include/icon.js:177
  'icon:reflect': 10, // include/icon.js:244
  'icon:tithe': 10, // include/icon.js:327
});

/** What an Animal Kinship use gives (js/animal-kinship.js performAnimalKinship). */
export const YARD_AK_ITEMS = Object.freeze({
  'npc_piggy:nibble': 'meat',
  'npc_chicken:squeeze': 'grain',
  'npc_butterfly:milk': 'milk_butterfly',
});

export const ANIMAL_VERBS = Object.freeze({
  npc_piggy: Object.freeze(['pet', 'nibble']),
  npc_butterfly: Object.freeze(['massage', 'milk']),
  npc_chicken: Object.freeze(['squeeze']),
});
export const PLOT_VERBS = Object.freeze(['tend', 'dig', 'pet', 'plant']);
export const TREE_VERBS = Object.freeze(['pet', 'water', 'harvest']);
export const WOOD_VERBS = Object.freeze(['pet', 'water', 'harvest']);
/** A planting act's `what`: the bean, and the planter's grow card if any ("bean_fruit" or "bean_fruit:soil_appreciation_bean_grow_1"). */
export const PLANT_WHAT_RE = /^(bean_[a-z]{2,12})(?::(soil_appreciation_bean_grow_[12]))?$/;
/** Verbs a visitor may use that change nothing of the owner's. */
export const LOOK_VERBS = Object.freeze(['talk_to']);

/** Animal Kinship daily counters on an animal's state (js/animal-kinship.js ACTION_STATE). */
const DAILY = Object.freeze({
  'npc_piggy:pet': 'petUsesToday',
  'npc_piggy:nibble': 'nibbleUsesToday',
  'npc_butterfly:massage': 'massageUsesToday',
  'npc_butterfly:milk': 'milkUsesToday',
  'npc_chicken:squeeze': 'squeezeUsesToday',
});

const ANIMAL_LABEL = Object.freeze({ npc_piggy: 'Piggy', npc_butterfly: 'Butterfly', npc_chicken: 'Chicken' });
const DONE_WORD = Object.freeze({ pet: 'petted', nibble: 'nibbled', massage: 'massaged', milk: 'milked', squeeze: 'squeezed', dig: 'dug', tend: 'tended', water: 'watered', harvest: 'harvested' });

export const YARD_TEXT = Object.freeze({
  notYours: (name) => `That belongs to ${name}.`,
  failed: 'That did not work. Try again?',
  offline: 'You are offline.',
  /** What the owner reads of a visitor's act. Our words. */
  acted: (who, verb, what) => `${who} ${DONE_WORD[verb] || verb} your ${what}.`,
  planted: (who, tree) => `${who} planted ${withArticle(tree)} in your Patch.`,
  pool: (n) => `+${n} iMG for their Magic Rock`,
});

export function isAnimalId(id) {
  return typeof id === 'string' && /^a\d{1,6}$/.test(id);
}

export function isPlotKey(key) {
  return typeof key === 'string' && /^patch(_dark)?:\d{1,2}$/.test(key);
}

/** The pool key of an act (YARD_POOL). */
export function poolKey(kind, classId, verb) {
  if (kind === 'animal') return `${classId}:${verb}`;
  if (kind === 'plot') return `patch:${verb}`;
  return `${classId === 'wood_tree' ? 'wood_tree' : 'trant'}:${verb}`;
}

/** The verbs a visitor may use on a thing (kind animal|plot|tree, its class). */
export function allowedVerbs(kind, classId) {
  if (kind === 'animal') return [...(ANIMAL_VERBS[classId] || []), ...LOOK_VERBS];
  if (kind === 'plot') return [...PLOT_VERBS];
  if (kind === 'tree') return [...(classId === 'wood_tree' ? WOOD_VERBS : TREE_VERBS), ...LOOK_VERBS];
  return [];
}

/** The start of the game day a time falls on (js/game-day.js; the site's HomePool::dayOf). */
export function gameDayStart(ms = Date.now()) {
  return GAME_EPOCH_MS + Math.floor((ms - GAME_EPOCH_MS) / GAME_DAY_MS) * GAME_DAY_MS;
}

function plain(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

/**
 * The owner's home street's width from its cultivation state (js/home-cultivation.js
 * homeStreetLayout of the front street: the left yard, the house lot, the right yard),
 * each side's expansions held to what normalizeCultivationState allows (0 up to
 * MAX - START segments) and anything that is not a number read as none. The
 * site's HomeYard::herdWidth is the same sum.
 */
export function yardStreetWidth(cult) {
  // PHP's is_numeric: a number or a numeric string.
  const n = (v, most) => {
    const ok = typeof v === 'number' || (typeof v === 'string' && /^\s*[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?\s*$/.test(v));
    const f = ok ? Number(v) : 0;
    return Number.isFinite(f) ? Math.floor(Math.max(0, Math.min(most, f))) : 0;
  };
  const L = HOME_LIMITS;
  const left = L.START_FRONTYARD_LEFT_SEGMENTS + n(cult?.yardLeft, L.MAX_FRONTYARD_LEFT_SEGMENTS - L.START_FRONTYARD_LEFT_SEGMENTS);
  const right = L.START_FRONTYARD_RIGHT_SEGMENTS + n(cult?.yardRight, L.MAX_FRONTYARD_RIGHT_SEGMENTS - L.START_FRONTYARD_RIGHT_SEGMENTS);
  return left * YARD_SEGMENT_W + HOUSE_LOT_W + right * YARD_SEGMENT_W;
}

/**
 * HERDCAP: the most of each class a visitor draws of an owner's animals
 * (js/animal-crowding.js yardClassCap). A visitor cannot see the owner's cards,
 * so this second line allows the Super Happy Animals ceiling; the site caps
 * first with the owner's own.
 */
export function visitorHerdCap(cult) {
  const width = yardStreetWidth(cult);
  return (classId) => yardClassCap(classId, { width, ceiling: true });
}

/** The site's GET homes/<id>/yard answer, checked: null unless it names an owner. */
export function normalizeYardView(answer) {
  const owner = Number(answer?.owner);
  if (!Number.isInteger(owner) || owner <= 0) return null;
  const patches = (Array.isArray(answer.patches) ? answer.patches : [])
    .filter((p) => isPlotKey(p?.key) && plain(p.plot) && Number.isFinite(Number(p.rx)))
    .map((p) => ({ key: p.key, rx: Number(p.rx), plot: p.plot }));
  // HERDCAP: no more of a class than the owner's street holds, the oldest first (a save edited by hand could hold thousands).
  const animals = capYardAnimals(answer.animals, visitorHerdCap(plain(answer.cult)))
    .filter((a) => isAnimalId(a?.id) && ANIMAL_VERBS[a.classId] && Number.isFinite(Number(a.x)))
    .map((a) => ({ id: a.id, classId: a.classId, x: Number(a.x), homeX: Number.isFinite(Number(a.homeX)) && a.homeX !== null ? Number(a.homeX) : Number(a.x), state: plain(a.state) || {} }));
  // Ticket 99: the owner's placed Magic Sticks, so a visitor draws the animals' walks where the owner does.
  const sticks = (Array.isArray(answer.sticks) ? answer.sticks : [])
    .filter((k) => STICK_ANIMAL[k?.classTsid] && Number.isFinite(Number(k.x)))
    .map((k) => ({ classTsid: k.classTsid, x: Number(k.x), distance: Number(k.distance) > 0 ? Number(k.distance) : 250 }));
  const mine = {};
  for (const [k, n] of Object.entries(plain(answer.mine) || {})) {
    if (/^[a-z]{2,8}:[A-Za-z0-9_:]{1,24}$/.test(k) && Number.isInteger(n) && n > 0) mine[k] = n;
  }
  const name = typeof answer.name === 'string' && answer.name ? answer.name.slice(0, 40) : '';
  // The owner's Meat Collectors, Butterfly Milkers and Piggy Feeders, to look at (js/yard-fixtures-mp.js).
  const machines = normalizeYardMachines(answer.machines);
  return { owner, name, cult: plain(answer.cult) || {}, patches, animals, sticks, machines, mine };
}

/**
 * A visitor's copy of an owner's animal: the owner's animal as it is (mood,
 * hunger, name), with the Animal Kinship daily counters set to the visitor's
 * own uses today (`mine`, "<verb>:<id>" => n).
 */
export function visitorAnimalState(row, mine = {}) {
  const seed = JSON.parse(JSON.stringify(row?.state || {}));
  for (const [key, field] of Object.entries(DAILY)) {
    const [classId, verb] = key.split(':');
    if (classId !== row.classId) continue;
    seed[field] = Number(mine[`${verb}:${row.id}`]) || 0;
  }
  for (const flag of ['petted', 'nibbled', 'massaged', 'milked']) delete seed[flag];
  delete seed.squeezedToday;
  return createAnimalState(row.classId, seed);
}

/** The visitor's use counts on an animal copy (what a verb changed). */
export function animalUses(classId, state = {}) {
  const out = {};
  for (const [key, field] of Object.entries(DAILY)) {
    const [c, verb] = key.split(':');
    if (c === classId) out[verb] = Number(state?.[field]) || 0;
  }
  return out;
}

/** A visitor's copy of an owner's grown tree: tended today as the owner's is, harvested only by the visitor. */
export function visitorTreeState(plot, key, mine = {}, now = Date.now()) {
  const tree = plot?.tree;
  if (!tree || !plain(tree.state)) return null;
  const state = JSON.parse(JSON.stringify(tree.state));
  // A tree the site grew from a Seedling (HomeYard plotNow) carries the few fields it knows: the rest as growTree makes them.
  if (tree.classId === 'wood_tree') ensureWoodTreeState(state);
  else {
    if (typeof state.classTsid !== 'string') state.classTsid = tree.classId;
    if (!Number.isFinite(state.fruitCapacity)) state.fruitCapacity = fruitCapacityAt(tree.classId, Number(state.maturity) || 1, Number(state.health) || 7);
  }
  if ((Number(tree.resetAt) || 0) < gameDayStart(now)) {
    if (tree.classId === 'wood_tree') {
      state.petted = false;
      state.watered = false;
    } else resetTrantDay(state);
  }
  if (tree.classId !== 'wood_tree') state.harvestsToday = Number(mine[`harvest:${key}`]) || 0;
  // canHarvest (wood_tree.js 586-612): once a game day per player and tree, so the visitor's own.
  else state.harvestedToday = (Number(mine[`harvest:${key}`]) || 0) >= 1;
  return state;
}

/** What a visitor's verb changed on a tree copy: [verb, ...]. */
export function treeSnapshot(state = {}) {
  // A trant counts harvestsToday, a Wood Tree its totalHarvests (js/woodcutting.js harvestWoodTree).
  return { petted: state?.petted === true, watered: state?.watered === true, harvests: (Number(state?.harvestsToday) || 0) + (Number(state?.totalHarvests) || 0) };
}

export function treeActs(before, after) {
  const out = [];
  if (!before.petted && after.petted) out.push('pet');
  if (!before.watered && after.watered) out.push('water');
  for (let i = before.harvests; i < after.harvests; i += 1) out.push('harvest');
  return out;
}

export function animalActs(before, after) {
  const out = [];
  for (const verb of Object.keys(after)) {
    for (let i = before[verb] || 0; i < after[verb]; i += 1) out.push(verb);
  }
  return out;
}

/** The waiting acts the site sends the owner (GET homes/yard), checked. */
export function normalizeYardActs(list) {
  const out = [];
  for (const a of Array.isArray(list) ? list : []) {
    if (!/^yd-[0-9a-f]{16}$/.test(String(a?.id || ''))) continue;
    if (!['animal', 'plot', 'tree', 'rock', 'node'].includes(a.kind)) continue;
    const okTarget = { animal: isAnimalId, rock: isRockId, node: isNodeId }[a.kind] || isPlotKey;
    if (!okTarget(a.target)) continue;
    if (!/^[a-z]{2,8}$/.test(String(a.verb || ''))) continue;
    if (a.verb === 'plant' && !PLANT_WHAT_RE.test(String(a.what || ''))) continue;
    const from = { id: Number(a.from?.id) || 0, name: String(a.from?.name || 'Someone').slice(0, 40) };
    const row = { id: a.id, from, kind: a.kind, target: a.target, verb: a.verb, took: Math.max(0, Math.floor(Number(a.took) || 0)), at: Number(a.at) || Date.now() };
    // MPVISIT: a rock's chunks or a node's uses left once the act landed (the site's word, for the copies).
    if (Number.isInteger(a.left) && a.left >= 0) row.left = a.left;
    if (a.verb === 'plant') row.what = String(a.what);
    out.push(row);
  }
  return out;
}

/**
 * Report #200: a Seedling petted three times is a tree once its least time is
 * up (patch_seedling.js onMinTimePassed / onPetted growUp; js/patches.js
 * tickPlot grows it at max(minAt, thirdPetAt)). The site's HomeYard plotNow
 * grows it the same way, so a visitor's copy, the site and the owner's game
 * all hold the tree from that moment. Mutates `plot`; true when it grew.
 */
export function growIfReady(plot, now = Date.now()) {
  const s = plot?.stage === 'seedling' ? plot.seedling : null;
  if (!s || (Number(s.petted) || 0) < SOIL_TIMERS.seedlingPets) return false;
  const min = Number(s.minAt) || 0;
  if (min <= 0) return false;
  const ready = Math.max(min, Number(s.thirdPetAt) || 0);
  const max = Number(s.maxAt) > 0 ? Number(s.maxAt) : Infinity;
  if (ready > now || ready > max) return false;
  return Boolean(growTree(plot, ready));
}

/** tickPlot's Patch timers: a tended or dug Patch goes back to weeds when its time is up (patch.js onRegrowTimer / onFillTimer). */
function regrow(plot, at) {
  if ((plot.stage === 'clean' || plot.stage === 'dug') && plot.dueAt && at >= plot.dueAt) {
    plot.since = plot.dueAt;
    plot.stage = 'dirty';
    plot.dueAt = 0;
  }
}

/**
 * Applies one visitor act to an owner's home: `plots` the patches slot's
 * plots, `animals` the husbandry slot's rows (both mutated in place, so a
 * view drawn from them follows). The owner pays nothing and gets nothing but
 * the change to their things: a Piggy petted is happier (npc_piggy.js
 * onPetComplete incMood), a Patch tended or dug, a tree tended (its health
 * once both pet and water landed, include/trants.js performTending 670-684)
 * or harvested (the fruit the site said it took). Returns what changed:
 * { kind, what, plot?, row? } or null.
 */
export function applyYardAct({ plots = {}, animals = [] } = {}, act) {
  if (!act) return null;
  if (act.kind === 'animal') {
    const row = animals.find((r) => r?.id === act.target);
    if (!row) return null;
    if (row.classId === 'npc_piggy' && act.verb === 'pet') petPiggy(row.state || (row.state = {}));
    return { kind: 'animal', what: ANIMAL_LABEL[row.classId] || 'animal', row };
  }
  const plot = plots?.[act.target];
  if (!plot || typeof plot !== 'object') return null;
  if (act.kind === 'plot') {
    regrow(plot, act.at);
    if (act.verb === 'pet') {
      // onPetted: one pet more of three; the third sets the grow level of the planter's card (tickPlot grows it).
      const s = plot.stage === 'seedling' ? plot.seedling : null;
      if (!s || s.petted >= SOIL_TIMERS.seedlingPets) return null;
      s.petted += 1;
      if (s.petted === SOIL_TIMERS.seedlingPets) {
        s.thirdPetAt = act.at;
        s.growLevel = s.upgradeGrowLevel || 0;
      }
      return { kind: 'plot', what: 'Seedling', plot };
    }
    if (act.verb === 'plant') {
      // plantBean (patch.js 742-790): the Patch becomes the visitor's Seedling; its timers from the planter's card.
      const m = PLANT_WHAT_RE.exec(String(act.what || ''));
      const bean = m ? SEASONED_BEANS[m[1]] : null;
      if (!bean || plot.stage !== 'clean') return null;
      const timing = seedlingTimings(m[2] ? [m[2]] : []);
      plot.stage = 'seedling';
      plot.since = act.at;
      plot.dueAt = 0;
      plot.seedling = {
        trantClass: bean.trantClass,
        beanClass: m[1],
        plantedAt: act.at,
        minAt: act.at + timing.minMs,
        maxAt: act.at + SOIL_TIMERS.seedlingMaxMs,
        upgradeGrowLevel: timing.growLevel,
        petted: 0,
        petters: 0,
        growLevel: 0,
        thirdPetAt: 0,
      };
      return { kind: 'plot', what: 'Patch', planted: GROWN_TREE_LABELS[bean.trantClass] || 'tree', plot };
    }
    if (act.verb === 'tend' && plot.stage === 'dirty') {
      plot.stage = 'clean';
      plot.since = act.at;
      plot.dueAt = act.at + SOIL_TIMERS.cleanRegrowMs;
    } else if (act.verb === 'dig' && (plot.stage === 'dirty' || plot.stage === 'clean')) {
      plot.stage = 'dug';
      plot.since = act.at;
      plot.dueAt = act.at + SOIL_TIMERS.dugFillMs;
    } else return null;
    return { kind: 'plot', what: plot.kind === 'patch_dark' ? 'Dark Patch' : 'Patch', plot };
  }
  // A tree the site grew from a petted Seedling before my game ticked it: grown here first, so the act lands.
  const grew = growIfReady(plot, act.at);
  const tree = plot.stage === 'tree' ? plot.tree : null;
  if (!tree?.state) return null;
  const s = tree.state;
  const what = GROWN_TREE_LABELS[tree.classId] || 'tree';
  const changed = applyTreeAct(tree, s, what, plot, act);
  if (changed && grew) changed.grew = true;
  return changed;
}

/** applyYardAct's tree half: a tending, a harvest. */
function applyTreeAct(tree, s, what, plot, act) {
  if (act.verb === 'harvest' && tree.classId === 'wood_tree') {
    // wood_tree.js 744-764: a maturity off every second harvest, at once at 2 or less; 0 clears it (tickPlot).
    const m = Number(s.maturity) || 0;
    if (m <= 0) return null;
    if (m <= 2 || (Number(s.harvestCount) || 0) !== 0) {
      s.maturity = m - 1;
      s.harvestCount = 0;
    } else s.harvestCount = 1;
    return { kind: 'tree', what, plot };
  }
  if (act.verb === 'harvest') {
    s.fruitCount = Math.max(0, (Number(s.fruitCount) || 0) - act.took);
    return { kind: 'tree', what, plot };
  }
  if (act.verb !== 'pet' && act.verb !== 'water') return null;
  // A tending from an earlier day than the tree's last day turn is that day's, already gone.
  if ((Number(tree.resetAt) || 0) > act.at) return { kind: 'tree', what, plot };
  const flag = act.verb === 'pet' ? 'petted' : 'watered';
  if (s[flag]) return { kind: 'tree', what, plot };
  s[flag] = true;
  if (tree.classId !== 'wood_tree' && s.petted && s.watered) {
    s.health = Math.max(1, Math.min(10, (Number(s.health) || 5) + 1));
    trantFruitCycle(s, tree.classId);
  }
  return { kind: 'tree', what, plot };
}

/** The ids of applied acts the save keeps, newest last, at most YARD_APPLIED_KEEP. */
export function keepApplied(list, ids) {
  const out = [...(Array.isArray(list) ? list : []).filter((id) => /^yd-[0-9a-f]{16}$/.test(id)), ...ids];
  return [...new Set(out)].slice(-YARD_APPLIED_KEEP);
}
