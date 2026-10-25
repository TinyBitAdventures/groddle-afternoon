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

/**
 * G289: the loss side. players/inc_metabolics.js metabolics_lose_energy
 * 108-122 and metabolics_lose_mood 180-194 return 0 (nothing lost) in the
 * newxp_intro / newxp_training1 instances (unless forced; no remake caller
 * forces), and while dead,
 * sending "You would have lost energy, but you're dead!" ("... lost some
 * mood ...") unless quiet. Pooped and Super Pooped never refuse a loss.
 * game.js installs the feature host's metabolicGate(stat, 'loss') here
 * (hell-feature for the dead, newxp-feature for the two intro scenes), and
 * every verb energy cost spends through loseEnergy().
 */
let lossGate = null;

/** fn(stat, { quiet }) -> { ok: false, msg } refuses a loss; anything else allows. */
export function setMetabolicLossGate(fn) {
  lossGate = typeof fn === 'function' ? fn : null;
}

/** May an `energy` or `mood` loss land now? Returns `{ ok, msg }`. */
export function metabolicLoss(stat, { quiet = false } = {}) {
  if (!lossGate || (stat !== 'energy' && stat !== 'mood')) return { ok: true, msg: null };
  const gate = lossGate(stat, { quiet });
  return gate && gate.ok === false ? { ok: false, msg: gate.msg || null } : { ok: true, msg: null };
}

function spend(pc, stat, amount, opts) {
  const x = Math.max(0, Number(amount) || 0);
  if (!pc || !x) return 0;
  if (!metabolicLoss(stat, opts).ok) return 0;
  const before = Math.max(0, Number(pc[stat]) || 0);
  // Property.apiDec stops at the bottom (eleven-server src/model/Property.js).
  pc[stat] = Math.max(0, before - x);
  return before - pc[stat];
}

/** metabolics_lose_energy(x): spends through the loss gate; returns what was lost. */
export function loseEnergy(pc, amount, opts = {}) {
  return spend(pc, 'energy', amount, opts);
}

/** metabolics_lose_mood(x): spends through the loss gate; returns what was lost. */
export function loseMood(pc, amount, opts = {}) {
  return spend(pc, 'mood', amount, opts);
}

/**
 * metabolics_add_energy(x) / metabolics_add_mood(x): a gain through the gain
 * gate, capped at the tank (metabolics_calc_max is the tank, never a flat
 * 100). Returns what landed.
 */
export function gainMetabolic(pc, stat, amount, opts = {}) {
  const x = Math.max(0, Number(amount) || 0);
  if (!pc || !x || (stat !== 'energy' && stat !== 'mood')) return 0;
  if (!metabolicGain(stat, opts).ok) return 0;
  const top = stat === 'energy' ? energyMax(pc) : moodMax(pc);
  const before = Math.max(0, Number(pc[stat]) || 0);
  pc[stat] = Math.max(before, Math.min(top, before + x));
  return pc[stat] - before;
}
