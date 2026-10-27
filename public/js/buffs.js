/**
 * Original-style timed effects over the mined GSJS buff catalog.
 *
 * Sources:
 * - items/catalog_buffs.js (durations, ticks, physics, immediate effects)
 * - items/spinach.js (activate -> high_jumper)
 * - items/*flower.js and herb_base (munch, optional delayed application)
 */

import { getBuffCatalog } from './content-catalogs.js';
import { energyMax, gainMetabolic, loseEnergy, loseMood, moodMax, shiftMetabolic } from './metabolics.js';
import { grantMoodXp } from './mood-xp.js';
import { BUFF_ICONS } from './buff-triggers.js?v=g124-2';

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
  // GSJS items/rubeweed.js names max_luck; the drop checks (drop-tables,
  // patches, master garden, Rube spawns) read rubeweed, Luck of the Rube in
  // catalog_buffs.js, so Munch applies that (Austin, 2026-10-25).
  rubeweed: {
    buffId: 'rubeweed',
    verb: 'Munch',
    message: 'Do you feel lucky? Yes, you do!',
    effectHint: 'Luck of the Rube: better drop chances for 5 minutes',
  },
  silvertongue: {
    buffId: 'silvertongue',
    verb: 'Munch',
    message: 'You feel more accomplished already.',
    effectHint: '+5 mood, -5 energy; 5% bonus on the next quest or badge reward',
    requirements: { energy: 5 },
  },
  // items/yellow_crumb_flower.js verbs.munch + catalog_buffs.js
  // yellow_crumb_flower (Crumb of Knowledge, 60 s): on_apply
  // pc.skills_start_acceleration(60), i.e. double study speed for a minute.
  yellow_crumb_flower: {
    buffId: 'yellow_crumb_flower',
    verb: 'Munch',
    itemName: 'Yellow Crumb Flower',
    message: 'You feel studious.',
    effectHint: 'The Yellow Crumb Flower can help you focus.',
    activeReason: 'The effects of eating too much of this herb could be serious!',
    requiresStudy: true,
    studyAccelerationSeconds: 60,
  },
  // items/essence_of_yellow_crumb.js verbs.imbibe + catalog_buffs.js
  // crumbly_thoughts (600 s): on_apply skills_start_acceleration(60 * 10).
  essence_of_yellow_crumb: {
    buffId: 'crumbly_thoughts',
    verb: 'Imbibe',
    itemName: 'Essence of Yellow Crumb',
    message: 'Your thoughts have focused down into a single point. Direct application of your dangerously sharp mental acuity can pierce any problem, increasing the speed at which you can learn your current skill.',
    effectHint: 'Drink to gain remarkable mental clarity, increasing your learning speed',
    activeReason: 'You are already under the effects of Essence of Yellow Crumb.',
    deadReason: 'You are too dead for that now.',
    requiresStudy: true,
    studyAccelerationSeconds: 600,
  },
  // items/essence_of_hairball.js verbs.imbibe + catalog_buffs.js hairball_dash
  // (60 s, vx_max 1.25, -5 energy every 15 s). The source line's dash is a comma here.
  essence_of_hairball: {
    buffId: 'hairball_dash',
    verb: 'Imbibe',
    itemName: 'Essence of Hairball',
    message: 'You feel exceptionally speedy, and ready to run with alacrity. Also, weird aftertaste.',
    effectHint: 'Drink to run dangerously fast',
    activeReason: 'You are already under the effects of Essence of Hairball.',
    deadReason: 'You are too dead for that now.',
  },
  // items/essence_of_gandlevery.js verbs.imbibe + catalog_buffs.js
  // gandlevery_charge (120 s): on_apply and every 15 s, -10 mood, +30 energy.
  essence_of_gandlevery: {
    buffId: 'gandlevery_charge',
    verb: 'Imbibe',
    itemName: 'Essence of Gandlevery',
    message: "You feel totally pumped and ready for anything, but you've also got a major case of Gandlevery stomach.",
    effectHint: 'Drink to receive a sustained boost of energy, at the cost of some mood',
    activeReason: 'You are already under the effects of Essence of Gandlevery.',
    deadReason: 'You are too dead for that now.',
  },
  // items/essence_of_silvertongue.js verbs.imbibe + catalog_buffs.js
  // gift_of_gab: +20% on the next quest or badge reward; on_apply ends Silvertongue.
  essence_of_silvertongue: {
    buffId: 'gift_of_gab',
    verb: 'Imbibe',
    itemName: 'Essence of Silvertongue',
    message: 'You are suddenly possessed of the grandest grandiloquence, able to charm even the most cantankerous of curmudgeons, leaving friends flummoxed and the victims of your versiform vituperations verily vanquished. Also, you could probably wrangle some extra rewards from your next accomplishment.',
    effectHint: 'Drink to greatly increase the benefits of your next quest or achievement',
    activeReason: 'You are already under the effects of Essence of Silvertongue.',
    deadReason: 'You are too dead for that now.',
  },
});

/**
 * Munch/imbibe conditions shared by the two Yellow Crumb items: a skill must
 * be studying and not already at maximum acceleration
 * (skills_is_learning / skills_at_max_acceleration).
 * @param {{ learning?: boolean, atMaxAcceleration?: boolean }} study
 */
export function studyBuffBlockReason(info, study = {}) {
  if (!info?.requiresStudy) return '';
  const verb = String(info.verb || 'use').toLowerCase();
  if (!study.learning) return `You must be learning a skill to ${verb} ${info.itemName}.`;
  if (study.atMaxAcceleration) return 'You are already learning at the maximum speed.';
  return '';
}

/**
 * G227 / G300: catalog_buffs.js changes energy and mood only through
 * metabolics_add_* and metabolics_lose_* (js/metabolics.js shiftMetabolic):
 * a rise gives nothing while dead or (energy) Super Pooped (inc_metabolics.js
 * 40-53, 79-86), a loss nothing while dead or in the two intro scenes
 * (108-122, 180-194).
 */
const shift = (pc, stat, delta) => shiftMetabolic(pc, stat, delta);

/**
 * No-No Powder's metabolics_set_energy / _set_mood to the top
 * (catalog_buffs.js 1466-1467, 1483-1484) is an add (inc_metabolics.js 230-263).
 */
function toTop(pc) {
  gainMetabolic(pc, 'energy', energyMax(pc));
  gainMetabolic(pc, 'mood', moodMax(pc));
}

/** What changed on pc since `before`, into `effects` (an unset tank reads as 0). */
function settle(effects, pc, beforeEnergy, beforeMood) {
  const energy = Number(pc.energy) || 0;
  const mood = Number(pc.mood) || 0;
  if (energy !== beforeEnergy) effects.energy = energy - beforeEnergy;
  if (mood !== beforeMood) effects.mood = mood - beforeMood;
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
    // catalog_buffs.js 2144-2145: metabolics_lose_mood(2), metabolics_add_energy(3).
    loseMood(pc, 2);
    shift(pc, 'energy', 3);
  } else if (classTsid === 'silvertongue') {
    // catalog_buffs.js 2297-2298: metabolics_add_mood(5), metabolics_lose_energy(5).
    shift(pc, 'mood', 5);
    loseEnergy(pc, 5);
  } else if (classTsid === 'no_no_powder') {
    // catalog_buffs.js 1466-1467 no_no_powder on_apply: both tanks to the top.
    toTop(pc);
  } else if (START_EFFECTS[classTsid]) {
    // catalog_buffs.js on_apply metabolics (Gandlevery 832, Gandlevery Charge 851-852): mood first.
    const start = START_EFFECTS[classTsid];
    shift(pc, 'mood', start.mood);
    shift(pc, 'energy', start.energy);
  }
  settle(effects, pc, beforeEnergy, beforeMood);
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
    // G277: a buff whose item_class iconic is lost (npc_butterfly, npc_piggy, ...) gets its
    // stand-in icon at once (buff-triggers BUFF_ICONS), not a tick later after a 404 in the tray.
    sourceItem: opts.sourceItem || BUFF_ICONS[classTsid] || def.itemClass || null,
    args: opts.args && typeof opts.args === 'object' ? { ...opts.args } : {},
    def,
  };
  // gift_of_gab on_apply: buffs_remove('silvertongue').
  if (classTsid === 'gift_of_gab') delete state.active.silvertongue;
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
  const effects = buff.activated !== false ? applyRemoveEffects(classTsid, pc) : {};
  syncPcBuffFlags(state, pc, now);
  return { ok: true, reason: 'removed', buff, effects };
}

/** catalog_buffs.js on_remove metabolics and iMG (Hungover, Garlic Breath). */
function applyRemoveEffects(classTsid, pc) {
  const effects = {};
  const end = REMOVE_EFFECTS[classTsid];
  if (!pc || !end) return effects;
  const beforeEnergy = Number(pc.energy) || 0;
  const beforeMood = Number(pc.mood) || 0;
  // catalog_buffs.js 265-266: Hungover adds mood, then energy.
  shift(pc, 'mood', end.mood);
  shift(pc, 'energy', end.energy);
  if (end.xp) {
    // catalog_buffs.js 244, 270: stats_add_xp(n, false) takes the mood bonus.
    const got = grantMoodXp(pc, end.xp);
    if (got) effects.xp = got;
  }
  settle(effects, pc, beforeEnergy, beforeMood);
  return effects;
}

/**
 * Consume one real pack item and create its official buff.
 * `ctx.study` ({ learning, atMaxAcceleration }) and `ctx.dead` feed the
 * Yellow Crumb conditions; the caller applies `info.studyAccelerationSeconds`.
 */
export function activateBuffItem(state, inv, pc, classTsid, now = Date.now(), ctx = {}) {
  const info = getBuffItemInfo(classTsid);
  if (!info?.def) return { ok: false, reason: 'not_buff_item', msgs: ['That item has no activatable effect.'] };
  if ((inv?.[classTsid] || 0) < 1) return { ok: false, reason: 'missing', msgs: [`No ${classTsid} in pack.`] };
  if (info.deadReason && ctx.dead) return { ok: false, reason: 'dead', msgs: [info.deadReason] };
  if (hasBuff(state, info.buffId, now)) {
    return { ok: false, reason: 'already_active', msgs: [info.activeReason || `${info.def.name} is already active or waiting to begin.`] };
  }
  const studyBlock = studyBuffBlockReason(info, ctx.study);
  if (studyBlock) return { ok: false, reason: 'study', msgs: [studyBlock] };
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
  const beforeEnergy = Number(pc.energy) || 0;
  const beforeMood = Number(pc.mood) || 0;
  if (row.classTsid === 'hairball_flower') {
    // catalog_buffs.js 1013: metabolics_lose_energy(5).
    loseEnergy(pc, 5);
  } else if (row.classTsid === 'purple_flower') {
    // catalog_buffs.js 1960: stats_add_xp(1, false).
    const got = grantMoodXp(pc, 1);
    if (got) {
      effects.img = got;
      effects.xp = got;
    }
  } else if (row.classTsid === 'well_fed_energy') {
    // catalog_buffs.js 2832: metabolics_add_energy(args.energy || 5).
    shift(pc, 'energy', Number(row.args?.energy) || 5);
  } else if (row.classTsid === 'no_no_powder') {
    // on_tick (every second, 1483-1484): energy and mood held at the top.
    toTop(pc);
  } else if (row.classTsid === 'no_no_powder_crash') {
    // on_tick every second, acting every 60th: 3% of max energy off both tanks
    // (catalog_buffs.js 1518-1522, metabolics_lose_energy then _lose_mood).
    row.args ||= {};
    row.args.ticks = (Number(row.args.ticks) || 0) + 1;
    if (row.args.ticks % 60 === 0) {
      const loss = Math.round(energyCap(pc) * 0.03);
      loseEnergy(pc, loss);
      loseMood(pc, loss);
    }
  } else if (row.classTsid === 'buff_buzzed') {
    // on_tick (every minute, catalog_buffs.js 224-225): metabolics_add_mood(3), metabolics_lose_energy(7).
    shift(pc, 'mood', 3);
    loseEnergy(pc, 7);
  } else if (row.classTsid === 'hairball_dash') {
    // on_tick (every 15 s, catalog_buffs.js 993): metabolics_lose_energy(5).
    loseEnergy(pc, 5);
  } else if (row.classTsid === 'savoring_experience') {
    // on_tick (every 10 s, catalog_buffs.js 2284): metabolics_add_mood(0.05 * mood).
    shift(pc, 'mood', Math.round(0.05 * beforeMood));
  } else if (DRINK_TICKS[row.classTsid] || HOLIDAY_TICKS[row.classTsid]) {
    // catalog_buffs.js on_tick for the drink, food and herb buffs (DRINK_TICKS)
    // and the seasonal treats (HOLIDAY_TICKS, js/seasons.js): mood first, then
    // energy, as every one of them is written except Full of Pie (818-819).
    const tick = DRINK_TICKS[row.classTsid] || HOLIDAY_TICKS[row.classTsid];
    if (row.classTsid === 'full_of_pie') {
      shift(pc, 'energy', tick.energy);
      shift(pc, 'mood', tick.mood);
    } else {
      shift(pc, 'mood', tick.mood);
      shift(pc, 'energy', tick.energy);
    }
    if (tick.xp) {
      // catalog_buffs.js 449, 780: stats_add_xp(n, false).
      const got = grantMoodXp(pc, tick.xp);
      if (got) effects.xp = got;
    }
  }
  settle(effects, pc, beforeEnergy, beforeMood);
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

/**
 * catalog_buffs.js on_tick metabolics (stats_add_xp is iMG + XP here):
 * Caffeine Buzz +2 mood / 10 s; Carrot Zing +7 mood +7 energy / 4 s;
 * Emberried Hiccups +5 +5 / 10 s; Floating on a Cloud +3 mood +1 iMG / 5 s;
 * Sky Cruisin' and Slow Gin +5 mood / 10 s; Sophisticated Feeling +20 mood
 * a minute; Smashed +3 mood -3 energy a minute; Hungover -2 mood +3 iMG a
 * minute; Garlic Breath +3 mood a minute; Gandlevery +3 energy / 15 s;
 * Gandlevery Charge -10 mood +30 energy / 15 s; A Cold Place -1 energy a
 * second (the buff feature removes it off the three winter streets); Party
 * Time! +5 mood / 10 s.
 */
export const DRINK_TICKS = Object.freeze({
  caffeine_buzz: { mood: 2 },
  carrot_zing: { mood: 7, energy: 7 },
  emberried_hiccups: { mood: 5, energy: 5 },
  floating_on_a_cloud: { mood: 3, xp: 1 },
  sky_cruisin: { mood: 5 },
  slow_gin: { mood: 5 },
  sophisticated_feeling: { mood: 20 },
  buff_smashed: { mood: 3, energy: -3 },
  buff_hungover: { mood: -2, xp: 3 },
  buff_garlic_breath: { mood: 3 },
  gandlevery: { energy: 3 },
  gandlevery_charge: { mood: -10, energy: 30 },
  kukubee_winter_negative: { energy: -1 },
  // catalog_buffs.js 1564-1580 Party Time!: 60 s, metabolics_add_mood(5) every 10 s
  // (given by the loneliness party, items/include/loneliness.js 246).
  party_time: { mood: 5 },
});

/** catalog_buffs.js on_apply metabolics: Gandlevery -5 mood; Gandlevery Charge -10 mood, +30 energy. */
const START_EFFECTS = Object.freeze({
  gandlevery: { mood: -5 },
  gandlevery_charge: { mood: -10, energy: 30 },
});

/** catalog_buffs.js on_remove: Hungover +10 mood +10 energy; Garlic Breath +5 iMG. */
const REMOVE_EFFECTS = Object.freeze({
  buff_hungover: { mood: 10, energy: 10 },
  buff_garlic_breath: { xp: 5 },
});

/** on_remove follow-ups: Chocolate High -> Sugar Crash; Smashed -> Hungover. */
const ON_EXPIRE = Object.freeze({ chocolate_high: 'sugar_crash', buff_smashed: 'buff_hungover' });

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
      events.push({ type: 'expired', classTsid, buff: row, effects: row.activated !== false ? applyRemoveEffects(classTsid, pc) : {} });
      const follow = ON_EXPIRE[classTsid];
      if (follow) {
        // buffs_apply restarts a running buff (no on_remove).
        delete state.active[follow];
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
  // Hairball Dash: addBuffPhysics({ vx_max: 1.25 }).
  if (hasBuff(state, 'hairball_dash', now)) result.speed *= 1.25;
  // Sugar Rush vx_max 1.05; Full of Pie vx_max 0.6, vy_jump 0.7.
  if (hasBuff(state, 'sugar_rush', now)) result.speed *= 1.05;
  if (hasBuff(state, 'full_of_pie', now)) {
    result.speed *= 0.6;
    result.jump *= 0.7;
  }
  // Moonwalk: addBuffPhysics({ vx_max: 0.7, gravity: 0.5 }).
  if (hasBuff(state, 'moonwalk', now)) {
    result.speed *= 0.7;
    result.gravity *= 0.5;
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
