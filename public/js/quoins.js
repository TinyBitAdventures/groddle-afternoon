/** Official Glitch quoin types and their persistent daily economy. */

import { energyMax, moodMax } from './metabolics.js';

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

/** Stable street plan with a rare Qurazy replacement (roughly one street in 29). */
export function planStreetQuoins(streetTsid, count = 8) {
  const total = clamp(Math.floor(finite(count, 8)), 1, 32);
  const hash = stableHash(streetTsid);
  const offset = hash % STREET_SEQUENCE.length;
  const plan = Array.from({ length: total }, (_, index) =>
    STREET_SEQUENCE[(offset + index) % STREET_SEQUENCE.length]
  );
  if (hash % 29 === 0) plan[plan.length - 1] = 'qurazy';
  return plan;
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
 * Apply one quoin. Qurazy quoins bypass the daily limit, matching GSJS.
 * Time quoins accelerate an active skill study through opts.accelerateStudy,
 * matching GameServerJS `skills_start_acceleration`.
 */
export function collectQuoin(state, typeId, pc, opts = {}) {
  const normalized = normalizeQuoinState(state);
  Object.assign(state, normalized);
  const originalType = QUOIN_TYPES[typeId] ? typeId : 'xp';
  if (originalType !== 'qurazy' && state.collectedToday >= state.dailyLimit) {
    return { ok: false, reason: 'daily_limit', dailyCount: state.collectedToday, dailyLimit: state.dailyLimit };
  }

  // items/quoin.js has no mystery branch: a mystery quoin only counts toward the daily limit.
  const resolvedType = originalType;
  const def = QUOIN_TYPES[resolvedType];
  const multiplier = originalType === 'qurazy' ? 1 : state.multiplier;
  const baseAmount = originalType === 'qurazy'
    ? qrazyRewardForLevel(pc?.level)
    : Math.max(0, Math.floor(finite(opts.amount, def.baseAmount)));
  const amount = Math.max(0, Math.round(baseAmount * multiplier));
  let actual = amount;
  let acceleration = null;

  if (resolvedType === 'xp' || resolvedType === 'qurazy') {
    pc.imagination = Math.max(0, Math.floor(finite(pc.imagination, 0))) + amount;
    pc.xp = Math.max(0, Math.floor(finite(pc.xp, 0))) + amount;
  } else if (resolvedType === 'energy' || resolvedType === 'mood') {
    // metabolics_add_energy / _mood cap at the tank, never lowering a tank above 100.
    const top = resolvedType === 'mood' ? moodMax(pc) : energyMax(pc);
    const before = clamp(finite(pc[resolvedType], 0), 0, top);
    pc[resolvedType] = clamp(before + amount, 0, top);
    actual = pc[resolvedType] - before;
  } else if (resolvedType === 'currants') {
    pc.currants = Math.max(0, Math.floor(finite(pc.currants, 0))) + amount;
  } else if (resolvedType === 'favor') {
    const giantId = String(opts.giantId || 'all').toLowerCase();
    const favor = opts.favor && typeof opts.favor === 'object' ? opts.favor : {};
    // stats_add_favor_points caps each Giant at its emblem target (stats_get_max_favor).
    const cap = typeof opts.favorCap === 'function' ? Number(opts.favorCap(giantId)) : Infinity;
    const before = Math.max(0, Math.floor(finite(favor[giantId], 0)));
    favor[giantId] = Math.min(Number.isFinite(cap) ? Math.max(before, cap) : Infinity, before + amount);
    actual = favor[giantId] - before;
  } else if (resolvedType === 'time') {
    acceleration = typeof opts.accelerateStudy === 'function'
      ? opts.accelerateStudy(amount)
      : { ok: false, reason: 'not_studying', applied: 0 };
    actual = Math.max(0, Math.floor(finite(acceleration?.applied, 0)));
  }

  state.totalCollected += 1;
  state.byType[originalType] = (state.byType[originalType] || 0) + 1;
  if (originalType === 'qurazy') {
    state.qurazyFound += 1;
  } else {
    state.collectedToday += 1;
    state.dailyByType[originalType] = (state.dailyByType[originalType] || 0) + 1;
  }

  return {
    ok: true,
    reason: 'collected',
    typeId: originalType,
    resolvedTypeId: resolvedType,
    amount,
    actual,
    multiplier,
    dailyCount: state.collectedToday,
    dailyLimit: state.dailyLimit,
    hitLimit: originalType !== 'qurazy' && state.collectedToday >= state.dailyLimit,
    giantId: resolvedType === 'favor' ? String(opts.giantId || 'all').toLowerCase() : null,
    acceleration: resolvedType === 'time' ? acceleration : null,
  };
}
