/**
 * Original-style timed effects over the mined GSJS buff catalog.
 *
 * Sources:
 * - items/catalog_buffs.js (durations, ticks, physics, immediate effects)
 * - items/spinach.js (activate -> high_jumper)
 * - items/*flower.js and herb_base (munch, optional delayed application)
 */

import { getBuffCatalog } from './content-catalogs.js';
import { moodMax } from './metabolics.js';

const SECOND = 1000;

/** Energy tank size: 100 plus Energy Tank upgrade cards (pc.energyMax). */
const energyCap = (pc) => Math.max(100, Number(pc?.energyMax) || 100);

/** Pack items which legitimately create buffs in the original game. */
export const BUFF_ITEM_CATALOG = Object.freeze({
  spinach: {
    buffId: 'high_jumper',
    verb: 'Activate',
    message: 'You can jump so hiiiiiiiiiigh ...',
    effectHint: 'Higher jumps and faster movement for 7 seconds',
  },
  hairball_flower: {
    buffId: 'hairball_flower',
    verb: 'Munch',
    message: 'You feel light on your feet and fancy free.',
    effectHint: '10% faster movement for 5 minutes; costs 5 energy each minute',
  },
  rookswort: {
    buffId: 'rookswort',
    verb: 'Munch',
    message: 'The whole world seems that much brighter.',
    effectHint: '+3 energy, -2 mood; steadier mood for 5 minutes',
    requirements: { mood: 2 },
  },
  purple_flower: {
    buffId: 'purple_flower',
    verb: 'Munch',
    message: "Tastes kind of weird, but you don't really feel anything.",
    effectHint: 'Kicks in after 15 seconds, then grants 1 iMG every 7 seconds',
    delaySeconds: 15,
  },
  rubeweed: {
    buffId: 'max_luck',
    verb: 'Munch',
    message: 'Do you feel lucky? Yes, you do!',
    effectHint: 'Random rolls favor their best outcome until the effect is ended',
  },
  silvertongue: {
    buffId: 'silvertongue',
    verb: 'Munch',
    message: 'You feel more accomplished already.',
    effectHint: '+5 mood, -5 energy; 5% bonus on the next quest or badge reward',
    requirements: { energy: 5 },
  },
});

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Number(value) || 0));
}

function activeRows(state) {
  if (!state || typeof state !== 'object') return {};
  if (!state.active || typeof state.active !== 'object') state.active = {};
  return state.active;
}

export function createBuffState(seed = {}) {
  return {
    active: { ...(seed?.active || {}) },
    totalActivated: Math.max(0, Math.floor(Number(seed?.totalActivated) || 0)),
    ticksApplied: Math.max(0, Math.floor(Number(seed?.ticksApplied) || 0)),
  };
}

export function listBuffCatalog() {
  return Object.values(getBuffCatalog()).sort((a, b) =>
    String(a.name).localeCompare(String(b.name))
  );
}

export function getBuffItemInfo(classTsid) {
  const item = BUFF_ITEM_CATALOG[classTsid];
  if (!item) return null;
  const def = getBuffCatalog()[item.buffId] || null;
  return {
    classTsid,
    ...item,
    def,
    durationSeconds: Math.max(0, Number(def?.duration) || 0),
    tickSeconds: Math.max(0, Number(def?.tickDuration) || 0),
  };
}

export function listBuffItemsInPack(inv = {}) {
  return Object.keys(BUFF_ITEM_CATALOG)
    .map((classTsid) => ({ ...getBuffItemInfo(classTsid), count: Math.max(0, Math.floor(inv[classTsid] || 0)) }))
    .filter((row) => row.count > 0 && row.def);
}

/** Remove expired rows. Tick processing should run first when exact end ticks matter. */
export function expireBuffs(state, now = Date.now()) {
  const expired = [];
  for (const [id, row] of Object.entries(activeRows(state))) {
    if (row.expiresAt != null && row.expiresAt <= now) {
      expired.push({ classTsid: id, row });
      delete state.active[id];
    }
  }
  return expired;
}

export function listActiveBuffs(state, now = Date.now()) {
  expireBuffs(state, now);
  return Object.values(activeRows(state))
    .filter((row) => (row.appliedAt || 0) <= now && row.activated !== false)
    .sort((a, b) => (a.expiresAt ?? Infinity) - (b.expiresAt ?? Infinity));
}

export function listPendingBuffs(state, now = Date.now()) {
  expireBuffs(state, now);
  return Object.values(activeRows(state))
    .filter((row) => (row.appliedAt || 0) > now || row.activated === false)
    .sort((a, b) => (a.appliedAt || 0) - (b.appliedAt || 0));
}

export function hasBuff(state, classTsid, now = Date.now()) {
  expireBuffs(state, now);
  return !!activeRows(state)[classTsid];
}

function syncPcBuffFlags(state, pc, now = Date.now()) {
  if (!pc) return;
  const active = listActiveBuffs(state, now);
  pc.activeBuffs = active.map((row) => row.classTsid);
  pc.rewardMultiplier = state.active.gift_of_gab && state.active.gift_of_gab.activated !== false
    ? 1.2
    : state.active.silvertongue && state.active.silvertongue.activated !== false
      ? 1.05
      : 1;
}

function applyStartEffects(classTsid, pc) {
  const effects = {};
  if (!pc) return effects;
  const beforeEnergy = Number(pc.energy) || 0;
  const beforeMood = Number(pc.mood) || 0;
  if (classTsid === 'rookswort') {
    pc.energy = clamp(beforeEnergy + 3, 0, energyCap(pc));
    pc.mood = clamp(beforeMood - 2, 0, moodMax(pc));
  } else if (classTsid === 'silvertongue') {
    pc.energy = clamp(beforeEnergy - 5, 0, energyCap(pc));
    pc.mood = clamp(beforeMood + 5, 0, moodMax(pc));
  }
  if (pc.energy !== beforeEnergy) effects.energy = pc.energy - beforeEnergy;
  if (pc.mood !== beforeMood) effects.mood = pc.mood - beforeMood;
  return effects;
}

/**
 * Apply a catalog buff. Delay keeps the consumed item's original herb delay.
 * @param {ReturnType<typeof createBuffState>} state
 */
export function applyBuff(state, classTsid, pc = null, now = Date.now(), opts = {}) {
  const def = getBuffCatalog()[classTsid];
  if (!def) return { ok: false, reason: 'unknown' };
  if (hasBuff(state, classTsid, now)) return { ok: false, reason: 'already_active', buff: state.active[classTsid] };
  const delayMs = Math.max(0, Number(opts.delayMs) || 0);
  const appliedAt = now + delayMs;
  const durationMs = (Number(def.duration) || 0) > 0 ? Number(def.duration) * SECOND : null;
  const tickMs = (Number(def.tickDuration) || 0) > 0 ? Number(def.tickDuration) * SECOND : null;
  const row = {
    classTsid,
    appliedAt,
    expiresAt: durationMs != null ? appliedAt + durationMs : null,
    nextTickAt: tickMs != null ? appliedAt + tickMs : null,
    activated: delayMs === 0,
    sourceItem: opts.sourceItem || def.itemClass || null,
    args: opts.args && typeof opts.args === 'object' ? { ...opts.args } : {},
    def,
  };
  state.active[classTsid] = row;
  state.totalActivated = Math.max(0, Number(state.totalActivated) || 0) + 1;
  const effects = row.activated ? applyStartEffects(classTsid, pc) : {};
  syncPcBuffFlags(state, pc, now);
  return { ok: true, reason: delayMs ? 'pending' : 'applied', buff: row, effects, pending: delayMs > 0 };
}

export function removeBuff(state, classTsid, pc = null, now = Date.now()) {
  if (!activeRows(state)[classTsid]) return { ok: false, reason: 'not_active' };
  const buff = state.active[classTsid];
  delete state.active[classTsid];
  syncPcBuffFlags(state, pc, now);
  return { ok: true, reason: 'removed', buff };
}

/** Consume one real pack item and create its official buff. */
export function activateBuffItem(state, inv, pc, classTsid, now = Date.now()) {
  const info = getBuffItemInfo(classTsid);
  if (!info?.def) return { ok: false, reason: 'not_buff_item', msgs: ['That item has no activatable effect.'] };
  if ((inv?.[classTsid] || 0) < 1) return { ok: false, reason: 'missing', msgs: [`No ${classTsid} in pack.`] };
  if (hasBuff(state, info.buffId, now)) {
    return { ok: false, reason: 'already_active', msgs: [`${info.def.name} is already active or waiting to begin.`] };
  }
  const needsEnergy = Number(info.requirements?.energy) || 0;
  const needsMood = Number(info.requirements?.mood) || 0;
  if ((pc?.energy || 0) < needsEnergy) return { ok: false, reason: 'energy', msgs: [`You need ${needsEnergy} energy to ${info.verb.toLowerCase()} that.`] };
  if ((pc?.mood || 0) < needsMood) return { ok: false, reason: 'mood', msgs: [`You need ${needsMood} mood to ${info.verb.toLowerCase()} that.`] };
  const applied = applyBuff(state, info.buffId, pc, now, {
    delayMs: (info.delaySeconds || 0) * SECOND,
    sourceItem: classTsid,
  });
  if (!applied.ok) return { ...applied, msgs: [`Could not activate ${info.def.name}.`] };
  inv[classTsid] -= 1;
  return {
    ...applied,
    classTsid,
    info,
    msgs: [info.message],
    effectLabel: info.def.name,
  };
}

function applyTickEffect(row, pc) {
  const effects = {};
  if (!pc) return effects;
  if (row.classTsid === 'hairball_flower') {
    const before = Number(pc.energy) || 0;
    pc.energy = clamp(before - 5, 0, energyCap(pc));
    if (pc.energy !== before) effects.energy = pc.energy - before;
  } else if (row.classTsid === 'purple_flower') {
    pc.imagination = (Number(pc.imagination) || 0) + 1;
    pc.xp = (Number(pc.xp) || 0) + 1;
    effects.img = 1;
    effects.xp = 1;
  } else if (row.classTsid === 'well_fed_energy') {
    const before = Number(pc.energy) || 0;
    pc.energy = clamp(before + (Number(row.args?.energy) || 5), 0, energyCap(pc));
    if (pc.energy !== before) effects.energy = pc.energy - before;
  } else if (HOLIDAY_TICKS[row.classTsid]) {
    // catalog_buffs.js on_tick for the seasonal treats (js/seasons.js).
    const tick = HOLIDAY_TICKS[row.classTsid];
    const beforeEnergy = Number(pc.energy) || 0;
    const beforeMood = Number(pc.mood) || 0;
    if (tick.energy) pc.energy = clamp(beforeEnergy + tick.energy, 0, energyCap(pc));
    if (tick.mood) pc.mood = clamp(beforeMood + tick.mood, 0, moodMax(pc));
    if (tick.xp) {
      pc.imagination = (Number(pc.imagination) || 0) + tick.xp;
      pc.xp = (Number(pc.xp) || 0) + tick.xp;
      effects.xp = tick.xp;
    }
    if (pc.energy !== beforeEnergy) effects.energy = pc.energy - beforeEnergy;
    if (pc.mood !== beforeMood) effects.mood = pc.mood - beforeMood;
  }
  return effects;
}

/**
 * Seasonal buffs' on_tick (catalog_buffs.js): Sugar Rush +7 mood, Smug
 * Healthy Glow +11 energy, Chocolate High +30 mood/+20 energy/+5 iMG, Full of
 * Pie +20/+20, Sugar Crash -20 mood/-10 energy.
 */
const HOLIDAY_TICKS = Object.freeze({
  sugar_rush: { mood: 7 },
  smug_healthy_glow: { energy: 11 },
  chocolate_high: { mood: 30, energy: 20, xp: 5 },
  full_of_pie: { mood: 20, energy: 20 },
  sugar_crash: { mood: -20, energy: -10 },
});

/** Chocolate High's on_remove applies Sugar Crash. */
const ON_EXPIRE = Object.freeze({ chocolate_high: 'sugar_crash' });

/** Lengthen an active buff (buffs_extend_time), e.g. Sugar Rush per extra candy. */
export function extendBuff(state, classTsid, ms, now = Date.now()) {
  const row = activeRows(state)[classTsid];
  if (!row || row.expiresAt == null) return { ok: false, reason: 'not_active' };
  row.expiresAt = Math.max(row.expiresAt, now) + Math.max(0, Number(ms) || 0);
  return { ok: true, buff: row };
}

/** Advance delayed starts, exact catalog ticks, and expiration. */
export function tickBuffs(state, pc, now = Date.now()) {
  const events = [];
  for (const [classTsid, row] of Object.entries(activeRows(state))) {
    const def = row.def || getBuffCatalog()[classTsid];
    if (!def) {
      delete state.active[classTsid];
      continue;
    }
    row.def = def;
    if (row.activated === false && (row.appliedAt || 0) <= now) {
      row.activated = true;
      const effects = applyStartEffects(classTsid, pc);
      events.push({ type: 'activated', classTsid, buff: row, effects });
    }
    const tickMs = (Number(def.tickDuration) || 0) * SECOND;
    let safety = 0;
    while (
      row.activated !== false &&
      tickMs > 0 &&
      row.nextTickAt != null &&
      row.nextTickAt <= now &&
      (row.expiresAt == null || row.nextTickAt <= row.expiresAt) &&
      safety < 24
    ) {
      const effects = applyTickEffect(row, pc);
      state.ticksApplied = Math.max(0, Number(state.ticksApplied) || 0) + 1;
      events.push({ type: 'tick', classTsid, buff: row, effects, at: row.nextTickAt });
      row.nextTickAt += tickMs;
      safety += 1;
    }
    if (row.expiresAt != null && row.expiresAt <= now) {
      delete state.active[classTsid];
      events.push({ type: 'expired', classTsid, buff: row, effects: {} });
      const follow = ON_EXPIRE[classTsid];
      if (follow) {
        const applied = applyBuff(state, follow, pc, now);
        if (applied.ok) events.push({ type: 'activated', classTsid: follow, buff: applied.buff, effects: applied.effects || {} });
      }
    }
  }
  syncPcBuffFlags(state, pc, now);
  return events;
}

/** Physics multipliers are read by the movement loop each frame. */
export function buffPhysics(state, now = Date.now()) {
  const result = { speed: 1, jump: 1, gravity: 1 };
  if (hasBuff(state, 'hairball_flower', now)) result.speed *= 1.1;
  // Sugar Rush vx_max 1.05; Full of Pie vx_max 0.6, vy_jump 0.7.
  if (hasBuff(state, 'sugar_rush', now)) result.speed *= 1.05;
  if (hasBuff(state, 'full_of_pie', now)) {
    result.speed *= 0.6;
    result.jump *= 0.7;
  }
  if (hasBuff(state, 'high_jumper', now)) {
    result.speed *= 1.7;
    result.jump *= 1.5;
    result.gravity *= 0.35 / 0.42;
  }
  return result;
}

/** Max Luck makes low-roll-is-good RNG checks resolve favorably. */
export function buffedRandom(state, rng = Math.random, now = Date.now()) {
  return hasBuff(state, 'max_luck', now) ? 0 : rng();
}

export function formatBuffRemaining(row, now = Date.now()) {
  if (!row) return '';
  if ((row.appliedAt || 0) > now || row.activated === false) {
    return `in ${Math.max(1, Math.ceil(((row.appliedAt || now) - now) / SECOND))}s`;
  }
  if (row.expiresAt == null) return 'until used or ended';
  const seconds = Math.max(0, Math.ceil((row.expiresAt - now) / SECOND));
  if (seconds >= 60) return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  return `${seconds}s`;
}

/** One-shot reward buffs are consumed after quests/achievements apply their multiplier. */
export function consumeRewardBuff(state, pc, now = Date.now()) {
  if (!pc?.rewardBuffConsumed) return null;
  delete pc.rewardBuffConsumed;
  const classTsid = state.active.gift_of_gab ? 'gift_of_gab' : state.active.silvertongue ? 'silvertongue' : null;
  if (!classTsid) {
    syncPcBuffFlags(state, pc, now);
    return null;
  }
  const removed = removeBuff(state, classTsid, pc, now);
  return removed.ok ? removed.buff : null;
}
