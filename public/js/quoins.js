/** Official Glitch quoin types and their persistent daily economy. */

import { energyMax, metabolicGain, moodMax } from './metabolics.js?v=8504134e';
import { grantMoodXp } from './mood-xp.js?v=958e7680';

export const DEFAULT_DAILY_QUOIN_LIMIT = 100;
export const QUOIN_SHEET = Object.freeze({
  url: 'assets/sprites/quoin__x1_1_x1_2_x1_3_x1_4_x1_5_x1_6_x1_7_x1_8_png_1354829599.png',
  frameWidth: 40,
  frameHeight: 45,
  columns: 24,
  rows: 8,
});

export const QUOIN_TYPES = Object.freeze({
  xp: Object.freeze({ id: 'xp', row: 0, label: 'iMG', baseAmount: 5, color: 0xb887df }),
  mood: Object.freeze({ id: 'mood', row: 1, label: 'mood', baseAmount: 10, color: 0x86c83d }),
  energy: Object.freeze({ id: 'energy', row: 2, label: 'energy', baseAmount: 12, color: 0xa6dd49 }),
  currants: Object.freeze({ id: 'currants', row: 3, label: 'currants', baseAmount: 7, color: 0xb88934 }),
  mystery: Object.freeze({ id: 'mystery', row: 4, label: 'mystery', baseAmount: 0, color: 0x8270c3 }),
  favor: Object.freeze({ id: 'favor', row: 5, label: 'favor', baseAmount: 5, color: 0xd26791 }),
  time: Object.freeze({ id: 'time', row: 6, label: 'study acceleration', baseAmount: 15, color: 0xa8dbe8 }),
  qurazy: Object.freeze({ id: 'qurazy', row: 7, label: 'qurazy iMG', baseAmount: 0, color: 0xf0f3f2 }),
});

// Exact level-indexed rewards from GameServerJS config_base.js.
export const QURAZY_REWARDS = Object.freeze([
  10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 65, 75, 85, 95, 105,
  117, 129, 141, 153, 165, 180, 195, 210, 225, 240, 255, 270, 285,
  300, 315, 335, 355, 375, 395, 415, 435, 455, 475, 495, 515, 535,
  555, 575, 595, 615, 635, 655, 675, 695, 715, 735, 755, 775, 795,
  815, 835, 855, 875, 895, 915,
]);

/** config_base.js 165-177: the Giants a favor quoin for 'all' credits. */
export const FAVOR_GIANT_IDS = Object.freeze(['alph', 'cosma', 'friendly', 'grendaline', 'humbaba', 'lem', 'mab', 'pot', 'spriggan', 'ti', 'zille']);

const STREET_SEQUENCE = Object.freeze(['xp', 'energy', 'mood', 'currants', 'mystery', 'favor', 'xp', 'time']);

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function cleanTypeCounts(seed = {}) {
  const out = {};
  for (const id of Object.keys(QUOIN_TYPES)) {
    const amount = Math.max(0, Math.floor(finite(seed?.[id], 0)));
    if (amount) out[id] = amount;
  }
  return out;
}

function stableHash(value) {
  let hash = 2166136261;
  for (const char of String(value || '')) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function quoinDailyLimitFor(upgrades = []) {
  const owned = new Set(Array.isArray(upgrades) ? upgrades : []);
  for (let tier = 5; tier >= 1; tier -= 1) {
    if (owned.has(`daily_quoin_limit_${tier}`)) return 100 + tier * 10;
  }
  return DEFAULT_DAILY_QUOIN_LIMIT;
}

export function normalizeQuoinState(seed = {}) {
  const dailyLimit = clamp(Math.floor(finite(seed?.dailyLimit, DEFAULT_DAILY_QUOIN_LIMIT)), 1, 1000);
  return {
    collectedToday: clamp(Math.floor(finite(seed?.collectedToday, 0)), 0, dailyLimit),
    dailyLimit,
    totalCollected: Math.max(0, Math.floor(finite(seed?.totalCollected, 0))),
    multiplier: clamp(finite(seed?.multiplier, 1), 1, 100),
    studyCredit: Math.max(0, Math.floor(finite(seed?.studyCredit, 0))),
    qurazyFound: Math.max(0, Math.floor(finite(seed?.qurazyFound, 0))),
    limitStreak: Math.max(0, Math.floor(finite(seed?.limitStreak, 0))),
    bestLimitStreak: Math.max(0, Math.floor(finite(seed?.bestLimitStreak, 0))),
    byType: cleanTypeCounts(seed?.byType),
    dailyByType: cleanTypeCounts(seed?.dailyByType),
  };
}

export function createQuoinState(seed = {}) {
  return normalizeQuoinState(seed);
}

export function qrazyRewardForLevel(level = 1) {
  const index = clamp(Math.floor(finite(level, 1)) - 1, 0, QURAZY_REWARDS.length - 1);
  return QURAZY_REWARDS[index];
}

/**
 * Stable street plan of natural quoins. G260: no natural spot is a Qurazy;
 * the Qurazy is a per-player roll on the street's marker
 * (js/qurazy.js, features/qurazy-feature.js; location.js 200-265).
 */
export function planStreetQuoins(streetTsid, count = 8) {
  const total = clamp(Math.floor(finite(count, 8)), 1, 32);
  const hash = stableHash(streetTsid);
  const offset = hash % STREET_SEQUENCE.length;
  return Array.from({ length: total }, (_, index) =>
    STREET_SEQUENCE[(offset + index) % STREET_SEQUENCE.length]
  );
}

export function resetQuoinDay(state, upgrades = []) {
  const normalized = normalizeQuoinState(state);
  const hitLimit = normalized.collectedToday >= normalized.dailyLimit;
  normalized.limitStreak = hitLimit ? normalized.limitStreak + 1 : 0;
  normalized.bestLimitStreak = Math.max(normalized.bestLimitStreak, normalized.limitStreak);
  normalized.collectedToday = 0;
  normalized.dailyLimit = quoinDailyLimitFor(upgrades);
  normalized.dailyByType = {};
  Object.assign(state, normalized);
  return { hitLimit, limitStreak: state.limitStreak, dailyLimit: state.dailyLimit };
}

/**
 * Mystery quoins, reimagined (Austin 2026-10-29). The source never defined
 * their reward: items/quoin.js onPlayerCollision (156-260) works out an
 * amount and announces it, but adds a stat only for xp, mood, energy,
 * currants, favor, time and qurazy, and the client has no mystery handling.
 * Here a mystery quoin rolls one of the four basic kinds, each as likely,
 * pays that kind's normal amount and says what it turned into. Favor and
 * time never come up. It keeps the mystery art until it is grabbed, still
 * counts toward the daily limit, and shards as a mystery quoin: not at all
 * (distributeQuoinShards, quoin.js 84, goes by the quoin's own type).
 */
export const MYSTERY_QUOIN_KINDS = Object.freeze(['xp', 'mood', 'energy', 'currants']);

/** One of MYSTERY_QUOIN_KINDS, uniformly, from rng() in [0, 1). */
export function rollMysteryKind(rng = Math.random) {
  const r = clamp(finite(typeof rng === 'function' ? rng() : Math.random(), 0), 0, 0.999999999);
  return MYSTERY_QUOIN_KINDS[Math.floor(r * MYSTERY_QUOIN_KINDS.length)];
}

/**
 * The class a mystery spot pays by once it rolled `kind`: the class itself
 * when it is of that kind; else the same tier of that kind's street pair
 * (STREET_QUOIN_CLASSES: a mystery spot carries the iMG pair, so 'small
 * random xp' pays as 'small random mood', 'slow medium-large xp' as 'slow
 * medium-large mood'); '' when the class is in no pair (the kind's
 * baseAmount then applies, as for any quoin with no class).
 */
export function mysteryClassFor(className, kind) {
  const row = className ? QUOIN_CLASSES[className] : null;
  if (!row || !MYSTERY_QUOIN_KINDS.includes(kind)) return '';
  if (row.type === kind) return className;
  for (const id of MYSTERY_QUOIN_KINDS) {
    const tier = STREET_QUOIN_CLASSES[id].indexOf(className);
    if (tier >= 0) return STREET_QUOIN_CLASSES[kind][tier];
  }
  return '';
}

/**
 * Credit an iMG, mood, energy or currants amount to the player and return
 * what landed: the shared reward path for a grabbed quoin and a quoin shard
 * (items/quoin.js 162-174 and 184-187 call the same stats_add_xp,
 * metabolics_add_mood / _energy and stats_add_currants).
 */
export function creditQuoinStat(pc, typeId, rawAmount, { gated = false } = {}) {
  const amount = Math.max(0, Math.round(finite(rawAmount, 0)));
  // G213: quoin.js 128-131 and 185-186 add through metabolics_add_mood / _energy,
  // which give nothing while dead or (energy) Super Pooped (js/metabolics.js).
  if (!gated && (typeId === 'energy' || typeId === 'mood') && amount > 0 && !metabolicGain(typeId).ok) return 0;
  if (typeId === 'xp' || typeId === 'qurazy') {
    pc.imagination = Math.max(0, Math.floor(finite(pc.imagination, 0)));
    pc.xp = Math.max(0, Math.floor(finite(pc.xp, 0)));
    // items/quoin.js 164, 184, 209: stats_add_xp(amount[, false]) takes the mood bonus.
    const actual = grantMoodXp(pc, amount);
    return actual;
  }
  if (typeId === 'energy' || typeId === 'mood') {
    // metabolics_add_energy / _mood cap at the tank, never lowering a tank above 100.
    const top = typeId === 'mood' ? moodMax(pc) : energyMax(pc);
    const before = clamp(finite(pc[typeId], 0), 0, top);
    pc[typeId] = clamp(before + amount, 0, top);
    // GSJS stats are whole numbers; ours drift by fractions, so report the
    // change in the whole numbers the HUD shows.
    return Math.floor(pc[typeId]) - Math.floor(before);
  }
  if (typeId === 'currants') {
    pc.currants = Math.max(0, Math.floor(finite(pc.currants, 0))) + amount;
    return amount;
  }
  return 0;
}

/**
 * Apply one quoin. Qurazy quoins bypass the daily limit, matching GSJS.
 * Time quoins accelerate an active skill study through opts.accelerateStudy,
 * matching GameServerJS `skills_start_acceleration`.
 * G227: `opts.className` (a QUOIN_CLASSES name of this type) sets the
 * benefit, rolled per grab with `opts.rng`, and a class's own Giant; an
 * explicit `opts.amount` still wins, and with neither the type's baseAmount
 * applies. The multiplier scales whichever it is (quoin.js 171-174).
 * A mystery quoin resolves first (rollMysteryKind with `opts.rng`, or a
 * multiplayer `opts.resolvedType`): the result's typeId stays 'mystery' and
 * resolvedTypeId is the kind it paid.
 */
export function collectQuoin(state, typeId, pc, opts = {}) {
  const normalized = normalizeQuoinState(state);
  Object.assign(state, normalized);
  const originalType = QUOIN_TYPES[typeId] ? typeId : 'xp';
  if (originalType !== 'qurazy' && state.collectedToday >= state.dailyLimit) {
    return { ok: false, reason: 'daily_limit', dailyCount: state.collectedToday, dailyLimit: state.dailyLimit };
  }

  // Reimagined (Austin 2026-10-29): items/quoin.js has no mystery branch, so a
  // mystery quoin turns into one of the four basic kinds (the realtime
  // server's roll when it sent one) and pays what that kind pays here.
  const resolvedType = originalType === 'mystery'
    ? (MYSTERY_QUOIN_KINDS.includes(opts.resolvedType) ? opts.resolvedType : rollMysteryKind(opts.rng))
    : originalType;
  const def = QUOIN_TYPES[resolvedType];
  const multiplier = originalType === 'qurazy' ? 1 : state.multiplier;
  const className = originalType === 'mystery' ? mysteryClassFor(opts.className, resolvedType) : opts.className;
  const classAmount = originalType === 'qurazy' ? null : quoinClassAmount(className, resolvedType, opts.rng);
  const baseAmount = originalType === 'qurazy'
    ? qrazyRewardForLevel(pc?.level)
    : Math.max(0, Math.floor(finite(opts.amount, classAmount ?? def.baseAmount)));
  const giantId = resolvedType === 'favor'
    ? String((classAmount !== null && quoinClassGiant(opts.className)) || opts.giantId || 'all').toLowerCase()
    : null;
  const amount = Math.max(0, Math.round(baseAmount * multiplier));
  let actual = amount;
  let acceleration = null;
  let blocked = null;

  if ((resolvedType === 'energy' || resolvedType === 'mood') && amount > 0) {
    // G213: the gain is refused (dead, Super Pooped); the quoin still counts.
    const gate = metabolicGain(resolvedType);
    if (!gate.ok) {
      actual = 0;
      blocked = gate.msg || 'blocked';
    } else {
      actual = creditQuoinStat(pc, resolvedType, amount, { gated: true });
    }
  } else if (resolvedType === 'xp' || resolvedType === 'qurazy' || resolvedType === 'energy'
    || resolvedType === 'mood' || resolvedType === 'currants') {
    actual = creditQuoinStat(pc, resolvedType, amount);
  } else if (resolvedType === 'favor') {
    const favor = opts.favor && typeof opts.favor === 'object' ? opts.favor : {};
    // stats_add_favor_points caps each Giant at its emblem target (stats_get_max_favor).
    const add = (id) => {
      const cap = typeof opts.favorCap === 'function' ? Number(opts.favorCap(id)) : Infinity;
      const before = Math.max(0, Math.floor(finite(favor[id], 0)));
      favor[id] = Math.min(Number.isFinite(cap) ? Math.max(before, cap) : Infinity, before + amount);
      return favor[id] - before;
    };
    if (giantId === 'all') {
      // inc_stats.js 956-961: 'all' adds to every Giant and returns the value
      // asked for, so the line reads "+N favor with all giants!" (quoin.js 191-192).
      for (const id of FAVOR_GIANT_IDS) add(id);
      actual = amount;
    } else {
      actual = add(giantId);
    }
  } else if (resolvedType === 'time') {
    acceleration = typeof opts.accelerateStudy === 'function'
      ? opts.accelerateStudy(amount)
      : { ok: false, reason: 'not_studying', applied: 0 };
    actual = Math.max(0, Math.floor(finite(acceleration?.applied, 0)));
  }

  state.totalCollected += 1;
  // A mystery quoin is counted as the kind it paid (the source keeps no per-type count).
  state.byType[resolvedType] = (state.byType[resolvedType] || 0) + 1;
  if (originalType === 'qurazy') {
    state.qurazyFound += 1;
  } else {
    state.collectedToday += 1;
    state.dailyByType[resolvedType] = (state.dailyByType[resolvedType] || 0) + 1;
  }

  return {
    ok: true,
    reason: 'collected',
    typeId: originalType,
    resolvedTypeId: resolvedType,
    // The benefit before the multiplier: what items/quoin.js 169 hands distributeQuoinShards.
    baseAmount,
    amount,
    actual,
    blocked,
    multiplier,
    dailyCount: state.collectedToday,
    dailyLimit: state.dailyLimit,
    hitLimit: originalType !== 'qurazy' && state.collectedToday >= state.dailyLimit,
    giantId,
    quoinClass: classAmount !== null ? className : null,
    acceleration: resolvedType === 'time' ? acceleration : null,
  };
}

/* ------------------------------------------------------------------ */
/* G216: respawn by quoin class                                         */
/* ------------------------------------------------------------------ */

/**
 * Every class_name in items/quoin.js onPropsChanged (318-662): its type and
 * respawn_time in seconds. After a grab the quoin goes unspawned and
 * onRespawn (664) brings it back respawn_time later (305), except in races,
 * games, cloudhopolis and top_of_tree; a qurazy quoin is deleted instead
 * (264).
 *
 * G227: the class also sets what the quoin gives (Austin, desk QUOINCLASS):
 * a fixed `benefit`, or `floor`..`ceil` when is_random, rolled on every grab
 * with randInt (common.js 691, inclusive; quoin.js 161-166), and `giant`
 * where the class names one ('all': every Giant, inc_stats.js 956-961).
 * QUOIN_TYPES.baseAmount stays for quoins with no class (quests, rooms).
 */
export const QUOIN_CLASSES = Object.freeze({
  'fast tiny mood': Object.freeze({ type: 'mood', respawnSec: 4 * 60, benefit: 1, line: 325 }),
  'fast tiny energy': Object.freeze({ type: 'energy', respawnSec: 3 * 60, benefit: 1, line: 331 }),
  'fast tiny xp': Object.freeze({ type: 'xp', respawnSec: 60, benefit: 1, line: 337 }),
  'fast tiny currants': Object.freeze({ type: 'currants', respawnSec: 40, benefit: 1, line: 343 }),
  'fast tiny time': Object.freeze({ type: 'time', respawnSec: 60, benefit: 1, line: 349 }),
  'small random mood': Object.freeze({ type: 'mood', respawnSec: 7 * 60, floor: 2, ceil: 6, line: 359 }),
  'small random energy': Object.freeze({ type: 'energy', respawnSec: 7 * 60, floor: 2, ceil: 6, line: 366 }),
  'small random xp': Object.freeze({ type: 'xp', respawnSec: 5 * 60, floor: 2, ceil: 6, line: 373 }),
  'small random currants': Object.freeze({ type: 'currants', respawnSec: 3 * 60, floor: 2, ceil: 6, line: 380 }),
  'slow medium-large mood': Object.freeze({ type: 'mood', respawnSec: 30 * 60, benefit: 25, line: 388 }),
  'slow medium-large energy': Object.freeze({ type: 'energy', respawnSec: 30 * 60, benefit: 25, line: 394 }),
  'slow medium-large xp': Object.freeze({ type: 'xp', respawnSec: 30 * 60, benefit: 25, line: 400 }),
  'slow medium-large currants': Object.freeze({ type: 'currants', respawnSec: 30 * 60, benefit: 25, line: 406 }),
  'long random large mood': Object.freeze({ type: 'mood', respawnSec: 60 * 60, floor: 2, ceil: 100, line: 413 }),
  'long random large energy': Object.freeze({ type: 'energy', respawnSec: 60 * 60, floor: 2, ceil: 100, line: 420 }),
  'long random large xp': Object.freeze({ type: 'xp', respawnSec: 60 * 60, floor: 2, ceil: 100, line: 427 }),
  'long random large currants': Object.freeze({ type: 'currants', respawnSec: 60 * 60, floor: 2, ceil: 100, line: 434 }),
  'placement tester': Object.freeze({ type: '', respawnSec: 1, benefit: 0, line: 442 }),
  'rainbow run': Object.freeze({ type: 'mood', respawnSec: 15, benefit: 1, line: 448 }),
  'small random favor': Object.freeze({ type: 'favor', respawnSec: 5 * 60, floor: 1, ceil: 3, giant: 'all', line: 460 }),
  'slow medium random favor': Object.freeze({ type: 'favor', respawnSec: 20 * 60, floor: 2, ceil: 9, line: 469 }),
  'long large random favor': Object.freeze({ type: 'favor', respawnSec: 60 * 60, benefit: 10, line: 477 }),
  'small time': Object.freeze({ type: 'time', respawnSec: 10 * 60, benefit: 5, line: 488 }),
  'slow medium random time': Object.freeze({ type: 'time', respawnSec: 30 * 60, floor: 5, ceil: 25, line: 495 }),
  'long large random time': Object.freeze({ type: 'time', respawnSec: 60 * 60, benefit: 30, line: 503 }),
  'random baqala mood': Object.freeze({ type: 'mood', respawnSec: 10 * 60, floor: 6, ceil: 17, line: 513 }),
  'random baqala energy': Object.freeze({ type: 'energy', respawnSec: 10 * 60, floor: 6, ceil: 17, line: 520 }),
  'random baqala xp': Object.freeze({ type: 'xp', respawnSec: 10 * 60, floor: 6, ceil: 17, line: 527 }),
  'random baqala currants': Object.freeze({ type: 'currants', respawnSec: 10 * 60, floor: 6, ceil: 17, line: 534 }),
  'random baqala favor': Object.freeze({ type: 'favor', respawnSec: 10 * 60, floor: 1, ceil: 4, giant: 'all', line: 541 }),
  'random baqala time': Object.freeze({ type: 'time', respawnSec: 10 * 60, floor: 6, ceil: 17, line: 549 }),
  'quoin hub fast currants': Object.freeze({ type: 'currants', respawnSec: 40, floor: 1, ceil: 3, line: 560 }),
  'quoin hub fast iMG': Object.freeze({ type: 'xp', respawnSec: 60, floor: 1, ceil: 3, line: 567 }),
  'paradise currants': Object.freeze({ type: 'currants', respawnSec: 400000, benefit: 1, line: 578 }),
  'paradise iMG': Object.freeze({ type: 'xp', respawnSec: 400000, benefit: 1, line: 584 }),
  'slow tiny mood': Object.freeze({ type: 'mood', respawnSec: 300, benefit: 1, line: 593 }),
  'slow tiny energy': Object.freeze({ type: 'energy', respawnSec: 300, benefit: 1, line: 599 }),
  'slow tiny xp': Object.freeze({ type: 'xp', respawnSec: 300, benefit: 1, line: 605 }),
  'slow tiny currants': Object.freeze({ type: 'currants', respawnSec: 300, benefit: 1, line: 611 }),
  'slow tiny time': Object.freeze({ type: 'time', respawnSec: 300, benefit: 1, line: 617 }),
  'party mood': Object.freeze({ type: 'mood', respawnSec: 2 * 60, benefit: 1, line: 627 }),
  'party energy': Object.freeze({ type: 'energy', respawnSec: 2 * 60, benefit: 1, line: 633 }),
  'party iMG': Object.freeze({ type: 'xp', respawnSec: 90, benefit: 1, line: 639 }),
  'party currants': Object.freeze({ type: 'currants', respawnSec: 60, benefit: 1, line: 645 }),
});

/**
 * The classes an ordinary street quoin of each type can be: [small, big].
 * The placed quoins' own class_name values are not in the recovered street
 * data. The source's one written placement rule is the Purple Emperor's
 * (purple_emperor.js 58-75): 95% a small random class, 5% slow medium-large;
 * Austin chose it for street spots (G257, desk QUOINTIER). Favor and time use
 * their small and slow medium classes the same way; mystery quoins have no
 * class in the source, so they use the iMG pair (for its respawn timer, and
 * its tier for the kind they roll: mysteryClassFor).
 */
export const STREET_QUOIN_CLASSES = Object.freeze({
  xp: Object.freeze(['small random xp', 'slow medium-large xp']),
  mood: Object.freeze(['small random mood', 'slow medium-large mood']),
  energy: Object.freeze(['small random energy', 'slow medium-large energy']),
  currants: Object.freeze(['small random currants', 'slow medium-large currants']),
  favor: Object.freeze(['small random favor', 'slow medium random favor']),
  time: Object.freeze(['small time', 'slow medium random time']),
});

/** purple_emperor.js 71: is_chance(0.05) picks the big class. */
export const STREET_BIG_QUOIN_CHANCE = 0.05;

/** The class a street's natural quoin `index` of `typeId` is ('' for qurazy: it never respawns); stable per spot. */
export function streetQuoinClass(streetTsid, index, typeId) {
  if (typeId === 'qurazy') return '';
  const [small, big] = STREET_QUOIN_CLASSES[typeId] || STREET_QUOIN_CLASSES.xp;
  return (stableHash(`${streetTsid}#${index}`) % 10000) / 10000 < STREET_BIG_QUOIN_CHANCE ? big : small;
}

/** respawn_time of a class in ms; Infinity for none (qurazy, unknown). */
export function quoinRespawnMs(className) {
  const row = QUOIN_CLASSES[className];
  return row ? row.respawnSec * 1000 : Infinity;
}

/** The source's randInt(lo, hi) (common.js 691-694): lo to hi, both included. */
function randInt(lo, hi, rng = Math.random) {
  const r = clamp(finite(rng(), 0), 0, 0.999999999);
  return lo + Math.floor(r * (1 + hi - lo));
}

/**
 * G227: what one grab of a `className` quoin gives before the multiplier
 * (items/quoin.js 161-166): its benefit, or randInt(benefit_floor,
 * benefit_ceil) when the class is random. null for an unknown class or one
 * of another type (a mystery quoin asks with mysteryClassFor's class and
 * the kind it rolled; qurazy quoins keep their own rules).
 */
export function quoinClassAmount(className, typeId, rng = Math.random) {
  const row = className ? QUOIN_CLASSES[className] : null;
  if (!row || (row.type && row.type !== typeId)) return null;
  if (Number.isFinite(row.benefit)) return row.benefit;
  return randInt(row.floor, row.ceil, typeof rng === 'function' ? rng : Math.random);
}

/** The Giant a favor class names, if any ('all' for small random and Baqala favor; quoin.js 466, 547). */
export function quoinClassGiant(className) {
  return (className && QUOIN_CLASSES[className]?.giant) || null;
}

/** The type a class sets (quoin.js 321-650), '' for none or unknown. */
export function quoinClassType(className) {
  return (className && QUOIN_CLASSES[className]?.type) || '';
}

/**
 * G227: the source has no game-day reset for street quoins (a grabbed one
 * comes back only on its onRespawn timer, quoin.js 305, 664). A new day
 * leaves spots still waiting on a timer collected and frees the rest (a
 * Qurazy spot, or a grab saved before G216 with no timer).
 */
export function resetStreetQuoinsForNewDay(street) {
  if (!street) return 0;
  const before = Array.isArray(street.collectedQuoins) ? street.collectedQuoins : [];
  const timers = street.quoinRespawn && typeof street.quoinRespawn === 'object' ? street.quoinRespawn : {};
  street.collectedQuoins = before.filter((i) => Number.isFinite(Number(timers[i])));
  street.quoinRespawn = Object.fromEntries(street.collectedQuoins.map((i) => [i, Number(timers[i])]));
  return before.length - street.collectedQuoins.length;
}

/**
 * Note a grabbed natural quoin's respawn on its street slot
 * (`{ collectedQuoins, quoinRespawn }`). A quoin with no respawn stays
 * collected until the game day turns, as before.
 */
export function noteQuoinRespawn(street, index, respawnMs, now = Date.now()) {
  if (!street || !Number.isInteger(index) || index < 0) return null;
  street.quoinRespawn ||= {};
  if (!Number.isFinite(respawnMs)) {
    delete street.quoinRespawn[index];
    return null;
  }
  const at = now + Math.max(0, respawnMs);
  street.quoinRespawn[index] = at;
  return at;
}

/**
 * onRespawn: the street's natural quoins whose time has come are no longer
 * collected. Returns the indexes released, smallest first.
 */
export function releaseQuoinRespawns(street, now = Date.now()) {
  const due = [];
  const map = street?.quoinRespawn;
  if (!map) return due;
  for (const [key, at] of Object.entries(map)) {
    const index = Number(key);
    if (!Number.isInteger(index) || !(Number(at) <= now)) continue;
    due.push(index);
    delete map[key];
  }
  if (due.length && Array.isArray(street.collectedQuoins)) {
    const gone = new Set(due);
    street.collectedQuoins = street.collectedQuoins.filter((i) => !gone.has(i));
  }
  return due.sort((a, b) => a - b);
}
