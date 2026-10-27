/**
 * Transcendental Radiation between real players (register G330): the pure
 * half. The realtime server (groddle-afternoon-server radiance.go) decides
 * who is in range, when each pulse comes, how long a radiation lasts, the
 * rank and the cards (from the save the site signs, src/Radiance.php), the
 * cooldown and the Sharing the Oneness flag. js/features/meditation-feature.js
 * draws it and applies the mood and energy to this player's own save: the
 * radiator pays each pulse, a receiver gains each pulse once, and the
 * radiator's end bonus is worked out here.
 *
 * Source map (GameServerJS, Dec 2012):
 *  - items/focusing_orb.js: verbs.radiate 464-514 (the conditions),
 *    startTranscendentalMeditation 2023-2183 (the burst lines), onTick
 *    1736-1798, onTRUpdatePlayers 1800-1900 (the pulse: the radiator pays
 *    round(TRCostTank x tank x TRCostSkill x 3) mood and energy, a receiver
 *    gains TankMultiplier x tank x TRSkill x 3 of each, no mood while the
 *    radiator's is 0, no energy with zen), endTranscendentalRadiationNew
 *    1152-1311 (the radiator's bonus and line), endTRForPlayer 1313-1335,
 *    getTRCostSkillMultiplier 1525-1537, getTRCostTankMultiplier 1539-1692,
 *    getTRSkillMultiplier 1694-1706, startTRString 28.
 *  - items/catalog_buffs.js:187-201 Bubble-Enhanced Meditation doubles the
 *    package's bonus_amount (skill-packages.js getSkillPackageOverride).
 *  - players/player.js:1846-1883: meditation is interrupted by any action;
 *    Tune Out The Chatter lets an incoming instant message by, Mantra
 *    Meditation the player's own chat (local, party, group and global
 *    chat, instant messages).
 *
 * Solo never loads these rules into play: every caller checks
 * engine.mode === 'multiplayer' and the realtime client first.
 */

import { TRANSCENDENTAL_RADIATION_PACKAGE, tankMultiplier } from './meditation.js';

export const RADIATE_COOLDOWN_SECONDS = 120; // focusing_orb.js:1305
export const RADIATE_IMAGINATION_CHANCE = 0.05; // 1213 is_chance(.05)

/** getTRCostTankMultiplier piecewise table: [min, max, minMult, maxMult] (1539-1692). */
export const TR_COST_TANK_BANDS = Object.freeze([
  [100, 200, 1.5, 1.2],
  [200, 300, 1.2, 1.04],
  [300, 400, 1.04, 0.96],
  [400, 500, 0.96, 0.88],
  [500, 750, 0.88, 0.8],
  [750, 1000, 0.8, 0.72],
  [1000, 1250, 0.72, 0.66],
  [1250, 1500, 0.66, 0.6],
  [1500, 1750, 0.6, 0.54],
  [1750, 2000, 0.54, 0.48],
  [2000, 2500, 0.48, 0.42],
  [2500, 3000, 0.42, 0.36],
  [3000, 4000, 0.36, 0.32],
  [4000, 5000, 0.32, 0.28],
  [5000, 6000, 0.28, 0.26],
  [6000, 7000, 0.26, 0.24],
  [7000, 8000, 0.24, 0.22],
  [8000, 9000, 0.22, 0.2],
  [9000, 10000, 0.2, 0.18],
]);

export const RADIANCE_TEXT = Object.freeze({
  begin: 'You begin to radiate.', // 2107
  felt: (name) => `You feel calmness radiating from ${name}.`, // startTRString
  transcended: (name, energy, mood) => `You feel transcended by radiation from ${name}. +${energy} energy, +${mood} mood`, // 1322-1327
  somewhat: (name, energy, mood) => `You feel somewhat transcended by radiation from ${name}. +${energy} energy, +${mood} mood`,
  end: ['Darn. Got distracted.', 'Whoops. There it goes.', 'Ah, lost it.'], // 1256
  everyone: ' Everyone around you gains some mood and energy.', // 1270
  highway: (img) => ` Your "Transcendental Highway" upgrade got you an extra ${img} iMG!`, // 1266
  tired: "You don't have enough energy to do that.", // 494
  alone: "There's nobody near enough for you to radiate.",
  offline: 'You can radiate once you are back online.',
});

/** The highest Transcendental Radiation rank learned (0 when none). */
export function radiationRank(learned = []) {
  const has = (id) => Array.isArray(learned) && learned.includes(id);
  if (has('transcendental_radiation_3')) return 3;
  if (has('transcendental_radiation_2')) return 2;
  if (has('transcendental_radiation_1')) return 1;
  return 0;
}

/** inc_imagination.js:906-933 imagination_get_radiation_distance; -1 is the whole street. */
export function radiationDistance(rank, upgrades = []) {
  let dist = { 1: 400, 2: 800, 3: 1500 }[rank] || 0;
  const has = (id) => Array.isArray(upgrades) && upgrades.includes(id);
  if (has('transcendental_radius_3')) return -1;
  if (has('transcendental_radius_2')) dist *= 2;
  else if (has('transcendental_radius_1')) dist *= 1.5;
  return dist;
}

/** Players (realtime roster rows with x) within the distance of x: the menu's hint; the server decides. */
export function playersInRange(players = [], x = 0, dist = 0) {
  if (!dist) return 0;
  return players.filter((p) => dist < 0 || Math.abs((Number(p?.x) || 0) - x) <= dist).length;
}

export function trCostTankMultiplier(tank = 100) {
  if (tank > 10000) return 0.18 / 100;
  let band = null;
  for (const row of TR_COST_TANK_BANDS) {
    const [lo, hi] = row;
    if (lo === 100 ? tank >= lo && tank <= hi : tank > lo && tank <= hi) {
      band = row;
      break;
    }
  }
  const [lo, hi, minM, maxM] = band || [100, 10000, 1.0, 0.0];
  const percent = (tank - lo) / (hi - lo);
  return (minM - percent * (minM - maxM)) / 100;
}

export function trCostSkillMultiplier(rank) {
  return rank >= 3 ? 1.35 : rank === 2 ? 1.2 : 1.0;
}

export function trSkillMultiplier(rank) {
  return rank >= 3 ? 1.5 : rank === 2 ? 1.25 : 1.0;
}

/** What one pulse costs the radiator, in mood and in energy (onTRUpdatePlayers 1807). */
export function pulseCost(tank, rank) {
  return Math.round(trCostTankMultiplier(tank) * tank * trCostSkillMultiplier(rank) * 3);
}

/** What one pulse gives a receiver of each (1849), rounded as the stat takes it. */
export function pulseGain(tank, radiatorRank) {
  return Math.round(tankMultiplier(tank) * tank * trSkillMultiplier(radiatorRank) * 3);
}

/** verbs.radiate 490-496: the whole session's cost must be under the energy you have. */
export function radiateEnergyNeeded(tank, rank) {
  const pkg = TRANSCENDENTAL_RADIATION_PACKAGE[`transcendental_radiation_${rank}`];
  if (!pkg) return Infinity;
  return trCostTankMultiplier(tank) * tank * trCostSkillMultiplier(rank) * (pkg.durationMax / 1000) + 2;
}

function pick(list, rng = Math.random) {
  return list[Math.min(list.length - 1, Math.floor(rng() * list.length))];
}

/** The lines the radiator reads, one per pulse (2141-2172). */
export function burstLines(cost, durationMs, rng = Math.random) {
  const out = [
    `Each pulse takes ${cost} Mood and ${cost} Energy.`,
    'Click (almost) anywhere or move to stop radiating.',
    `You emit a burst. -${cost} Mood -${cost} Energy`,
  ];
  const temp = [
    `You emit a burst of love. -${cost} Mood -${cost} Energy`,
    `You emit a burst of joy. -${cost} Mood -${cost} Energy`,
    `Your power goes to benefit all. -${cost} Mood -${cost} Energy`,
    `You radiate your inwardness outwards. -${cost} Mood -${cost} Energy`,
    `You're givin' it, soul2soul. Yeah. -${cost} Mood -${cost} Energy`,
    `Your kindness envelops others. -${cost} Mood -${cost} Energy`,
  ];
  const target = Math.round(durationMs / 1000 / 3) + 3;
  let guard = 0;
  while (out.length < target && guard++ < 1000) {
    const line = pick(temp, rng);
    if (out[out.length - 1] !== line) out.push(line);
  }
  return out;
}

/**
 * The radiator's end (endTranscendentalRadiationNew 1152-1311).
 * @param {object} done   radiate_done from the server
 * @param {{ rank: number, tank: number, mood: number, upgrades?: string[], spentEnergy?: number,
 *   bonusAmount?: number, rng?: () => number, maxLuck?: boolean }} ctx
 *   spentEnergy: the energy the pulses took (tr_radiator.energy, negative or 0);
 *   bonusAmount: the package's bonus_amount (doubled by Bubble-Enhanced Meditation).
 * @returns {{ energyBonus: number, img: number, imgBonus: number, line: string, effect: number }}
 *   energyBonus and img are before the gates and the mood scale; the caller applies them and
 *   rebuilds the line with radiatorLine once it knows what was really gained.
 */
export function radiatorEnd(done, ctx = {}) {
  const rng = ctx.rng || Math.random;
  const rank = Number(ctx.rank) || 1;
  const tank = Number(ctx.tank) || 100;
  const pkg = TRANSCENDENTAL_RADIATION_PACKAGE[`transcendental_radiation_${rank}`] || TRANSCENDENTAL_RADIATION_PACKAGE.transcendental_radiation_1;
  const bonusAmount = Number.isFinite(ctx.bonusAmount) ? ctx.bonusAmount : pkg.bonusAmount;
  const effectSeconds = Math.max(0, Number(done?.effectSeconds) || 0);
  const effect = tankMultiplier(tank) * tank * trSkillMultiplier(rank) * effectSeconds;
  let imgBonus = 0;
  if ((ctx.upgrades || []).includes('transcendental_imagination') && (ctx.maxLuck || rng() < RADIATE_IMAGINATION_CHANCE)) {
    imgBonus = effect;
    if ((Number(ctx.mood) || 0) <= 0) imgBonus *= 0.5;
    imgBonus = Math.round(imgBonus);
  }
  let energyBonus = 0;
  let img = 0;
  if (done?.full) {
    const bonus = Math.round((bonusAmount / 100) * effect);
    // `if (energy) energy += metabolics_add_energy(bonus)`: only when the pulses took some.
    if (Number(ctx.spentEnergy)) energyBonus = bonus;
    img = bonus;
  }
  return { energyBonus, img, imgBonus, effect };
}

/** The radiator's activity line from what it really got (1256-1271). */
export function radiatorLine({ energy = 0, img = 0, imgBonus = 0, reached = false }, rng = Math.random) {
  let msg = pick(RADIANCE_TEXT.end, rng);
  if (energy > 0 && img > 0) msg += ` That was relaxing. +${energy} energy, +${img} iMG`;
  else if (energy > 0) msg += ` That was relaxing. +${energy} energy`;
  else if (img > 0) msg += ` That was relaxing. +${img} iMG`;
  else msg += ' That was relaxing.';
  if (imgBonus > 0) msg += RADIANCE_TEXT.highway(imgBonus);
  if (reached) msg += RADIANCE_TEXT.everyone;
  return msg;
}

/**
 * players/player.js:1846-1883 in multiplayer: does the player's own chat line
 * (local, party or group chat) break a meditation? Mantra Meditation
 * (meditative_arts_less_distraction_2) lets it by. Nothing incoming breaks one
 * here: the source's only incoming distraction is an instant message
 * (im_recv), which Tune Out The Chatter lets by, and players have no instant
 * messages in the remake.
 */
export function chatInterrupts(upgrades = []) {
  return !(Array.isArray(upgrades) && upgrades.includes('meditative_arts_less_distraction_2'));
}

/** A radiation id from the server ("7-3"). */
export function radId(v) {
  const s = String(v ?? '');
  return /^\d{1,12}-\d{1,12}$/.test(s) ? s : '';
}

/** A pulse key: each pulse is applied once. */
export function pulseKey(rad, n) {
  const id = radId(rad);
  const k = Math.floor(Number(n));
  return id && k > 0 ? `${id}:${k}` : '';
}

export function cleanName(s) {
  return String(s ?? '').replace(/[\u0000-\u001f\u007f<>]/g, '').slice(0, 40) || 'A Glitch';
}
