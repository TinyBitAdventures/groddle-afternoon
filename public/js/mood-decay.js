/**
 * Idle mood loss: players/player.js onTimePlaying, which the game server ran
 * once for every minute a player was logged in. Mood drifts down on its own,
 * fastest from a high, so drinks and good deeds matter between sessions of
 * play. Pure rules only; features/mood-decay-feature.js ticks it on real play
 * time and reads the world state the skips need.
 *
 * Source (onTimePlaying, player.js ~793-830):
 *   skipped in house deco mode, Paradise locations (location.isParadiseLocation),
 *   transcendental meditation, and new-player locations (location.is_newxp)
 *   max_mood = min(metabolics_get_max_mood(), 2000)
 *   mood % > 80:  max(max_mood * 0.015, 4)
 *     Steady On, Mood Loser III / II / I: 0.0075 / 0.010 / 0.0125 (best one wins)
 *   mood % 50-80: max(max_mood * 0.005, 2)
 *   mood % < 50:  max(max_mood * 0.0025, 1)
 *   Rookswort halves every rate (the minimums stay)
 *   before the intro is done (has_done_intro) there is no loss at or below 50%
 *   metabolics_lose_mood(loss, 1): quiet, no mood_stat announcement
 * The mood property takes whole numbers: Property.dec floors the delta and
 * stops at the bottom (eleven-server src/model/Property.js), so 1.5 loses 1.
 */

export const MOOD_DECAY_TICK_MS = 60 * 1000;
export const MOOD_DECAY_MAX_CAP = 2000;

/** Rate of the >80% band by Steady On, Mood Loser card (inc_data_imagination.js ~5751-5830). */
export const MOOD_DECAY_HIGH_RATES = Object.freeze({
  base: 0.015,
  periodic_mood_loss_reduced_1: 0.0125, // "1/6th slower"
  periodic_mood_loss_reduced_2: 0.01, // "1/3rd slower"
  periodic_mood_loss_reduced_3: 0.0075, // "half as fast"
});

export const MOOD_DECAY_BANDS = Object.freeze({
  high: Object.freeze({ rate: 0.015, min: 4 }),
  mid: Object.freeze({ rate: 0.005, min: 2 }),
  low: Object.freeze({ rate: 0.0025, min: 1 }),
});

/** Activity lines metabolics_lose_mood sends at low mood (inc_metabolics.js ~205-213). */
export const MOOD_DECAY_TEXT = Object.freeze({
  low: "Your mood is getting low. Drink something, else you'll earn less iMG for your actions.",
  veryLow: 'Your mood is getting very low! Try drinking something tasty.',
});

const asSet = (list) => (list instanceof Set ? list : new Set(Array.isArray(list) ? list : []));

/** The >80% band rate for the player's cards; the best card wins. */
export function highBandRate(owned) {
  const set = asSet(owned);
  for (const id of ['periodic_mood_loss_reduced_3', 'periodic_mood_loss_reduced_2', 'periodic_mood_loss_reduced_1']) {
    if (set.has(id)) return MOOD_DECAY_HIGH_RATES[id];
  }
  return MOOD_DECAY_HIGH_RATES.base;
}

/** 'high' above 80%, 'mid' from 50 to 80%, 'low' below 50%. */
export function moodDecayBand(percent) {
  const pct = Number(percent) || 0;
  if (pct > 80) return 'high';
  if (pct >= 50) return 'mid';
  return 'low';
}

/**
 * Why this minute is skipped, or null. Checked in source order:
 * deco mode, Paradise, transcendental meditation, then new-player locations.
 */
export function moodDecaySkip({ decoMode = false, paradise = false, transcendental = false, newxpLocation = false } = {}) {
  if (decoMode) return 'deco';
  if (paradise) return 'paradise';
  if (transcendental) return 'meditation';
  if (newxpLocation) return 'newxp';
  return null;
}

/**
 * One minute of idle mood loss.
 * @param {object} opts
 * @param {number} opts.mood       current mood
 * @param {number} opts.moodMax    the mood maximum (metabolics.mood.top)
 * @param {Iterable<string>} [opts.owned] imagination upgrade ids
 * @param {boolean} [opts.rookswort] Rookswort buff running
 * @param {boolean} [opts.introDone] has_done_intro (false only mid-tutorial)
 * @returns {{ loss: number, raw: number, band: string, percent: number, rate: number, min: number }}
 *   loss is the whole amount the mood actually drops (never below 0).
 */
export function periodicMoodLoss({ mood = 0, moodMax = 100, owned = [], rookswort = false, introDone = true } = {}) {
  const top = Math.max(1, Number(moodMax) || 0);
  const value = Math.max(0, Number(mood) || 0);
  const percent = (value / top) * 100;
  const band = moodDecayBand(percent);
  const capped = Math.min(top, MOOD_DECAY_MAX_CAP);
  const multiplier = rookswort ? 0.5 : 1;
  const row = MOOD_DECAY_BANDS[band];
  const rate = band === 'high' ? highBandRate(owned) : row.rate;
  let raw = Math.max(capped * rate * multiplier, row.min);
  if (!introDone && percent <= 50) raw = 0;
  const loss = Math.min(value, Math.floor(raw));
  return { loss, raw, band, percent, rate: rate * multiplier, min: row.min };
}

/**
 * The activity line for this loss, sent only when the drop crosses into a
 * lower warning band (<=50%, <=20%). The original sent it on every loss at or
 * under 50%, once a minute while idle; the remake says it once per crossing.
 */
export function moodWarningFor(beforePercent, afterPercent) {
  const before = Number(beforePercent) || 0;
  const after = Number(afterPercent) || 0;
  if (after <= 20 && before > 20) return MOOD_DECAY_TEXT.veryLow;
  if (after <= 50 && before > 50) return MOOD_DECAY_TEXT.low;
  return null;
}

/**
 * Real-play-time minute counter. Feed it frame deltas while the game runs
 * and the tab is visible; it returns how many minutes elapsed.
 */
export function createMoodDecayClock(tickMs = MOOD_DECAY_TICK_MS) {
  const period = Math.max(1, Number(tickMs) || MOOD_DECAY_TICK_MS);
  let elapsed = 0;
  return {
    get elapsed() {
      return elapsed;
    },
    get period() {
      return period;
    },
    advance(dtMs) {
      const dt = Number(dtMs);
      if (!(dt > 0)) return 0;
      elapsed += dt;
      let minutes = 0;
      while (elapsed >= period) {
        elapsed -= period;
        minutes += 1;
      }
      return minutes;
    },
    reset() {
      elapsed = 0;
    },
  };
}
