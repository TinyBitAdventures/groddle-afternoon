/**
 * G260: the per-player Qurazy quoin roll on a street's Qurazy marker.
 *
 * Source: GameServerJS locations/location.js onPlayerEnter 200-265 and
 * spawnQurazy 731-760 (the design doc it links is not archived):
 *
 * - Entering drops any Qurazy of yours still here (205-211; onPlayerExit
 *   1008-1014 does the same on leaving), so one you walk away from is gone.
 * - One roll per street per game day: a roll that finds nothing sets the
 *   daily `qurazy_notfound` label for the street and stops further rolls
 *   there today (213, 263).
 * - First visit ever (visits_count == 1): chance 1 (216-218).
 * - Otherwise the chance follows how long ago you were last here: streets
 *   sorted by last visit (players/inc_stats.js stats_add_street_history 1048,
 *   called after the roll at location.js 307), newest first; this street's
 *   place over the count is a percentile (220-246): >= 0.9 gives 0.7, >= 0.7
 *   0.5, >= 0.5 0.3, >= 0.3 0.2, >= 0.1 0.1, under 0.1 stays 0.2.
 * - A Qurazy found here today, yesterday or the day before (game days,
 *   common.js game_days_to_ms 152) makes it 0 (248-253), and so do 5 found
 *   today across all streets (255). "Found" is spawned: spawnQurazy counts
 *   `qurazy_found` and flags the day when it places the quoin (744-745).
 * - is_chance(chance) (common.js 351-360) or the max_luck buff spawns it
 *   (259), on one marker chosen at random (choose_one, 734-736).
 *
 * The first-visit chance skips the day and daily checks, as written.
 * The state here is per player, saved by features/qurazy-feature.js.
 */

import { GAME_DAY_MS, GAME_EPOCH_MS } from './game-day.js?v=dametime-1';

/** location.js 255: no more than this many found a game day (first visits aside). */
export const QURAZY_DAILY_MAX = 5;
/** location.js 248-251: today, yesterday and the day before. */
export const QURAZY_RECENT_DAYS = 3;
/** location.js 215: the chance before the history table, and under the 10th percentile. */
export const QURAZY_BASE_CHANCE = 0.2;
/** location.js 232-246, highest percentile first. */
export const QURAZY_HISTORY_CHANCES = Object.freeze([
  Object.freeze({ percentile: 0.9, chance: 0.7 }),
  Object.freeze({ percentile: 0.7, chance: 0.5 }),
  Object.freeze({ percentile: 0.5, chance: 0.3 }),
  Object.freeze({ percentile: 0.3, chance: 0.2 }),
  Object.freeze({ percentile: 0.1, chance: 0.1 }),
]);
/** location.js 747: sendActivity when it spawns (not on newbie_island). */
export const QURAZY_SPAWN_LINE = "OMG! There's a Qurazy Quoin on this street for you!";

/** Whole game days since the Glitch epoch (four real hours each; game-day.js). */
export function qurazyDayIndex(now = Date.now()) {
  return Math.floor((Number(now) - GAME_EPOCH_MS) / GAME_DAY_MS);
}

function cleanTsids(list) {
  return Array.isArray(list) ? [...new Set(list.filter((t) => typeof t === 'string' && t))] : [];
}

function cleanCounts(map) {
  const out = {};
  if (!map || typeof map !== 'object') return out;
  for (const [key, value] of Object.entries(map)) {
    const n = Math.floor(Number(value));
    if (key && Number.isFinite(n) && n > 0) out[key] = n;
  }
  return out;
}

function cleanLive(live) {
  if (!live || typeof live !== 'object' || typeof live.tsid !== 'string' || !live.tsid) return null;
  const x = Number(live.x);
  const y = Number(live.y);
  const day = Math.floor(Number(live.day));
  if (![x, y, day].every(Number.isFinite)) return null;
  return { tsid: live.tsid, day, x, y };
}

/**
 * The saved slice: `day` the counters belong to, `notFound` streets rolled
 * empty today, `foundToday` Qurazies placed per street today, `lastFound`
 * the last game day one was placed per street, `live` the one waiting for
 * you (kept through a reload, like a reconnect; dropped when you leave).
 */
export function createQurazyState(seed = {}) {
  const day = Math.floor(Number(seed?.day));
  return {
    day: Number.isFinite(day) ? day : null,
    notFound: cleanTsids(seed?.notFound),
    foundToday: cleanCounts(seed?.foundToday),
    lastFound: cleanCounts(seed?.lastFound),
    live: cleanLive(seed?.live),
    totalSpawned: Math.max(0, Math.floor(Number(seed?.totalSpawned) || 0)),
  };
}

/**
 * Daily counters (achievements_increment_daily) belong to one game day: a new
 * day clears them. lastFound keeps only the days the three-day rule reads.
 */
export function rollQurazyDay(state, day) {
  if (state.day === day) return false;
  state.day = day;
  state.notFound = [];
  state.foundToday = {};
  for (const [tsid, at] of Object.entries(state.lastFound)) {
    if (at <= day - QURAZY_RECENT_DAYS) delete state.lastFound[tsid];
  }
  return true;
}

/** Sum of today's qurazy_found counters (achievements_get_daily_group_sum). */
export function qurazyFoundToday(state) {
  return Object.values(state.foundToday || {}).reduce((sum, n) => sum + n, 0);
}

/**
 * location.js 220-246: the chance from where this street sits in your street
 * history (`lastVisits` = { tsid: last visit ms }), newest first. A street
 * missing from the history ends the loop at the last place (percentile 1);
 * an empty history leaves 0.2.
 */
export function qurazyHistoryChance(tsid, lastVisits = {}) {
  const rows = Object.entries(lastVisits || {})
    .filter(([, at]) => Number(at))
    .map(([key, at]) => ({ key, at: Number(at) }));
  if (!rows.length) return { chance: QURAZY_BASE_CHANCE, position: 0, count: 0, percentile: null };
  // utils.sortObj with history[a] < history[b]: the most recent visit first.
  rows.sort((a, b) => b.at - a.at);
  let position = 0;
  for (const row of rows) {
    position += 1;
    if (row.key === tsid) break;
  }
  const percentile = position / rows.length;
  const step = QURAZY_HISTORY_CHANCES.find((s) => percentile >= s.percentile);
  return { chance: step ? step.chance : QURAZY_BASE_CHANCE, position, count: rows.length, percentile };
}

/** The roll's chance and why (no state change). */
export function qurazyChance(state, { tsid, visitsBefore = 0, lastVisits = {}, day = qurazyDayIndex() } = {}) {
  if (!(Number(visitsBefore) > 0)) return { chance: 1, reason: 'first_visit' };
  const history = qurazyHistoryChance(tsid, lastVisits);
  const last = state.lastFound?.[tsid];
  if (Number.isFinite(last) && last > day - QURAZY_RECENT_DAYS) {
    return { ...history, chance: 0, reason: 'found_recently' };
  }
  if (qurazyFoundToday(state) >= QURAZY_DAILY_MAX) return { ...history, chance: 0, reason: 'daily_max' };
  return { ...history, reason: 'history' };
}

/** common.js is_chance 351-360: 0 never, 1 always, else rng() <= p. */
export function qurazyIsChance(chance, rng = Math.random) {
  if (!(chance > 0)) return false;
  if (chance >= 1) return true;
  return rng() <= chance;
}

/**
 * Roll on entering a street with `markers` Qurazy markers. Returns
 * { rolled, spawn, chance, reason, markerIndex }; on a spawn the day's
 * counters record it, on a miss the street is done for today.
 */
export function rollQurazy(state, {
  tsid,
  markers = 0,
  visitsBefore = 0,
  lastVisits = {},
  maxLuck = false,
  rng = Math.random,
  now = Date.now(),
} = {}) {
  const day = qurazyDayIndex(now);
  rollQurazyDay(state, day);
  const count = Math.max(0, Math.floor(Number(markers) || 0));
  // No marker: spawnQurazy finds nothing to place on (734).
  if (!tsid || !count) return { rolled: false, spawn: false, chance: 0, reason: 'no_marker', markerIndex: -1 };
  if (state.notFound.includes(tsid)) {
    return { rolled: false, spawn: false, chance: 0, reason: 'rolled_today', markerIndex: -1 };
  }
  const odds = qurazyChance(state, { tsid, visitsBefore, lastVisits, day });
  const hit = qurazyIsChance(odds.chance, rng);
  const spawn = hit || Boolean(maxLuck);
  if (!spawn) {
    state.notFound.push(tsid);
    return { rolled: true, spawn: false, chance: odds.chance, reason: odds.reason, markerIndex: -1 };
  }
  const markerIndex = Math.min(count - 1, Math.floor(Math.max(0, Math.min(0.999999, Number(rng()) || 0)) * count));
  state.foundToday[tsid] = (state.foundToday[tsid] || 0) + 1;
  state.lastFound[tsid] = day;
  state.totalSpawned += 1;
  return {
    rolled: true,
    spawn: true,
    chance: odds.chance,
    reason: hit ? odds.reason : 'max_luck',
    markerIndex,
  };
}
