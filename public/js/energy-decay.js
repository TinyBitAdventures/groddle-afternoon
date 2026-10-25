/**
 * Periodic energy loss (G258): players/player.js onPeriodicEnergyLoss
 * 2358-2380, a timer the game server set on login (player.js 189-190) and
 * re-armed every 90 s while the player stayed online. It is the only way
 * energy drifts in the original: there is no regeneration, no walking or
 * jumping cost, and nothing tops the tank up but food, drink, quoins,
 * meditation, rewards and the new day. Pure rules only;
 * features/energy-decay-feature.js ticks it on real play time and reads the
 * world state the skips need.
 *
 * Source (onPeriodicEnergyLoss):
 *   if (!isOnline()) return                  (the remake: game running, tab visible)
 *   skipped in house deco mode (!in_house_deco_mode), Paradise locations
 *     (location.isParadiseLocation) and transcendental meditation
 *     (!meditating == 'transcendental')
 *   has_done_intro:  to_lose = round(metabolics_get_max_energy() * 0.008)
 *   before the intro: the same, but only above 50% energy and never in the
 *     newxp_intro / newxp_training1 / newxp_training2 instances
 *   metabolics_lose_energy(to_lose, 1): quiet (no energy_stat announcement)
 * metabolics_lose_energy (inc_metabolics.js 108-170) then refuses the loss
 * while dead or in newxp_intro / training1 (engine.metabolicGate 'loss'),
 * counts it as energy_consumed, croaks at 0 (once a day), applies Pooped /
 * Super Pooped at or under 5% after a croak, and warns at 10%; the remake's
 * hell feature does all of that when it sees energy drop. Losses are never
 * refused for Pooped or Super Pooped: only gains are (inc_metabolics.js 40-53).
 * Property.dec stops at the bottom (eleven-server src/model/Property.js).
 */

import { createMoodDecayClock } from './mood-decay.js?v=mood-decay-1';

export const ENERGY_LOSS_TICK_MS = 90 * 1000;
export const ENERGY_LOSS_RATE = 0.008;
/** Before has_done_intro there is no loss at or under this percentage. */
export const ENERGY_LOSS_INTRO_FLOOR_PERCENT = 50;

/**
 * Why this tick is skipped, or null. Checked in source order: deco mode,
 * Paradise, then transcendental meditation.
 */
export function energyLossSkip({ decoMode = false, paradise = false, transcendental = false } = {}) {
  if (decoMode) return 'deco';
  if (paradise) return 'paradise';
  if (transcendental) return 'meditation';
  return null;
}

/**
 * One onPeriodicEnergyLoss tick.
 * @param {object} opts
 * @param {number} opts.energy          current energy
 * @param {number} opts.energyMax       metabolics_get_max_energy()
 * @param {boolean} [opts.introDone]    has_done_intro (false only mid-tutorial)
 * @param {boolean} [opts.newxpInstance] in newxp_intro / training1 / training2
 * @returns {{ loss: number, raw: number, percent: number }}
 *   raw is to_lose; loss is what the energy actually drops (never below 0).
 */
export function periodicEnergyLoss({ energy = 0, energyMax = 100, introDone = true, newxpInstance = false } = {}) {
  const top = Math.max(1, Number(energyMax) || 0);
  const value = Math.max(0, Number(energy) || 0);
  const percent = (value / top) * 100;
  let raw = 0;
  if (introDone) raw = Math.round(top * ENERGY_LOSS_RATE);
  else if (!newxpInstance && percent > ENERGY_LOSS_INTRO_FLOOR_PERCENT) raw = Math.round(top * ENERGY_LOSS_RATE);
  return { loss: Math.min(value, raw), raw, percent };
}

/** Real-play-time 90 s counter (the mood decay clock with a 90 s period). */
export function createEnergyLossClock(tickMs = ENERGY_LOSS_TICK_MS) {
  return createMoodDecayClock(Math.max(1, Number(tickMs) || ENERGY_LOSS_TICK_MS));
}
