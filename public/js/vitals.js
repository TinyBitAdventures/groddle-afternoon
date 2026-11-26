/**
 * Low energy and mood you can see (g458, Austin's UI audit 2): the top bar's
 * Energy and Mood turn amber under 20% and red, with a slow pulse, under 10%,
 * and a click on either offers something from the pack to eat or drink.
 *
 * The original showed low mood on the avatar's face (PlayerFaceUI.as 237-266:
 * expressions at 90/80/70/20%) and kept energy on an arc; the remake's bars
 * looked the same at 6/100 as at 80/100 apart from their length.
 *
 * Pure helpers: game.js (updateHud, installVitalsMenu) draws and wires them.
 */

/** Under this share of the maximum: amber. */
export const VITAL_LOW = 0.2;
/** Under this share: red, with a slow pulse (none under prefers-reduced-motion). */
export const VITAL_CRITICAL = 0.1;

/** 'ok', 'low' or 'critical' for a stat at `now` of `max`. */
export function vitalLevel(now, max) {
  const n = Number(now);
  const m = Number(max);
  if (!Number.isFinite(n) || !(m > 0)) return 'ok';
  const share = n / m;
  if (share < VITAL_CRITICAL) return 'critical';
  if (share < VITAL_LOW) return 'low';
  return 'ok';
}

const share = (now, max) => {
  const n = Number(now);
  const m = Number(max);
  return Number.isFinite(n) && m > 0 ? n / m : null;
};

/**
 * Glitch's energy gauge colour (EnergyGauge.as 122-127, EnergyBar.as 140-142): pixel
 * floor(share * 200) of energy_mood_gradient.png, the share held in [0, 1) so a full
 * gauge is the last pixel. Over the maximum reads full (Glitch raised the maximum).
 * null when there is no maximum.
 */
export function energyGaugePixel(now, max) {
  const s = share(now, max);
  if (s === null) return null;
  return Math.floor(Math.min(0.9999999999, Math.max(0, s)) * 200);
}

/**
 * The energy ring's step 0..10 (#699): of the ramp's 200 pixels the ring uses every 20th and the
 * last (0, 20, ... 180, 199; style.css --energy-gauge-0..10, Classic's --c-classic-ramp-0..10),
 * the one nearest Glitch's pixel. null when there is no maximum.
 */
export function energyGaugeStep(now, max) {
  const px = energyGaugePixel(now, max);
  return px === null ? null : Math.min(10, Math.round(px / 20));
}

/** The mood face's states, fullest first (PlayerFaceUI.as 37-45). */
export const MOOD_GAUGES = Object.freeze(['sun', 'glow', 'fair', 'meh', 'low']);

/** The mood ring's step (#699): Glitch's face at 90, 80, 70 and 20% (PlayerFaceUI.as 232-252). null with no maximum. */
export function moodGauge(now, max) {
  const s = share(now, max);
  if (s === null) return null;
  if (s >= 0.9) return 'sun';
  if (s >= 0.8) return 'glow';
  if (s >= 0.7) return 'fair';
  if (s >= 0.2) return 'meh';
  return 'low';
}

/** The meter's tooltip and accessible name: the numbers, the state in words, the click. */
export function vitalTitle(stat, text, level) {
  const name = stat === 'mood' ? 'Mood' : 'Energy';
  const state = level === 'critical' ? ' (very low)' : level === 'low' ? ' (low)' : '';
  const offer = stat === 'mood' ? 'Click for something to lift it.' : 'Click for something to eat.';
  return `${name} ${text}${state}. ${offer}`;
}

/** The menu's heading for a stat. */
export function vitalMenuHeading(stat) {
  return stat === 'mood' ? 'Something to lift your mood' : 'Something to eat';
}

/** What the menu says when nothing in the pack helps. */
export function vitalMenuEmpty(stat) {
  return stat === 'mood'
    ? 'Nothing in your pack lifts your mood. Drinks from a vendor do.'
    : 'Nothing to eat in your pack. Vendors sell food, and trees and animals give some.';
}

/**
 * What a making in progress still takes from the pack, by class: each input
 * times the units not made yet. `session` is game.js activeCraftSession
 * ({ recipe: { inputs: [{ classTsid, qty }] }, qty, made }), or null.
 *
 * The original let you eat while a making ran: food_eat_conditions
 * (items/include/food.js 3-28) has no making check, making_is_making only
 * refuses another making tool (players/inc_making.js 41-48, 80-88, 1736),
 * and the MakingDialog was not modal (glitch-client MakingDialog.as). The
 * menu leaves these units in the pack, so a snack never stops the batch.
 */
export function makingNeeds(session) {
  const out = {};
  const left = Math.max(0, Math.floor(Number(session?.qty) || 0) - Math.floor(Number(session?.made) || 0));
  if (!left) return out;
  for (const inp of session?.recipe?.inputs || []) {
    const per = Math.floor(Number(inp?.qty) || 0);
    if (!inp?.classTsid || per < 1) continue;
    out[inp.classTsid] = (out[inp.classTsid] || 0) + per * left;
  }
  return out;
}

/**
 * Pack items that raise `stat` ('energy' or 'mood') through the ordinary
 * Eat or Drink, most first: [{ classTsid, count, gain, verb }].
 * useInfoFor(classTsid) is game.js getPackUseInfo (a feature's own verb,
 * buff herbs and one-off actions such as tickets are left out).
 * `held` ({ classTsid: n }, makingNeeds) is kept back from each count.
 */
export function vitalSnacks({ inv, stat, useInfoFor, limit = 5, held = {} } = {}) {
  const out = [];
  if (!inv || typeof useInfoFor !== 'function') return out;
  for (const [classTsid, n] of Object.entries(inv)) {
    const count = Math.floor(Number(n) || 0) - Math.max(0, Math.floor(Number(held?.[classTsid]) || 0));
    if (count < 1) continue;
    const info = useInfoFor(classTsid);
    if (!info?.usable || info.buff || info.singleAction || info.paradise) continue;
    if (!/^(eat|drink)$/i.test(String(info.verb || ''))) continue;
    const gain = Number(info.effects?.[stat]) || 0;
    if (gain <= 0) continue;
    out.push({ classTsid, count, gain, verb: info.verb });
  }
  out.sort((a, b) => b.gain - a.gain || a.classTsid.localeCompare(b.classTsid));
  return out.slice(0, Math.max(0, limit));
}
