/**
 * Metabolic maximums (players/inc_metabolics.js metabolics_recalc_limits):
 * energy and mood share one maximum, the imagination-era tank
 * (metabolics_calc_max returns metabolics_get_tank()). The remake keeps the
 * tank in pc.energyMax (100 plus Energy Tank cards), so mood tops out there too.
 */
export function moodMax(pc) {
  return Math.max(100, Number(pc?.energyMax) || 100);
}

export function energyMax(pc) {
  return Math.max(100, Number(pc?.energyMax) || 100);
}

/**
 * G213: the one door every energy or mood gain goes through, as in the
 * source: players/inc_metabolics.js metabolics_add_energy 40-53 refuses a
 * gain while dead ("You would have gained energy, but you're dead!") or
 * Super Pooped ("... but you're super pooped!"), and metabolics_add_mood
 * 79-86 while dead, sending that line unless quiet. (metabolics_try_inc 373,
 * which the register cited, has no callers.) game.js installs the feature
 * host's metabolicGate here (features/hell-feature.js); quoins, quoin shards
 * and quest and badge rewards ask before they add.
 */
let gainGate = null;

/** fn(stat, { quiet }) -> { ok: false, msg } blocks; anything else allows. */
export function setMetabolicGainGate(fn) {
  gainGate = typeof fn === 'function' ? fn : null;
}

/** May an `energy` or `mood` gain land now? Returns `{ ok, msg }`. */
export function metabolicGain(stat, { quiet = false } = {}) {
  if (!gainGate || (stat !== 'energy' && stat !== 'mood')) return { ok: true, msg: null };
  const gate = gainGate(stat, { quiet });
  return gate && gate.ok === false ? { ok: false, msg: gate.msg || null } : { ok: true, msg: null };
}
