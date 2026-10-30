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
 * Pack items that raise `stat` ('energy' or 'mood') through the ordinary
 * Eat or Drink, most first: [{ classTsid, count, gain, verb }].
 * useInfoFor(classTsid) is game.js getPackUseInfo (a feature's own verb,
 * buff herbs and one-off actions such as tickets are left out).
 */
export function vitalSnacks({ inv, stat, useInfoFor, limit = 5 } = {}) {
  const out = [];
  if (!inv || typeof useInfoFor !== 'function') return out;
  for (const [classTsid, n] of Object.entries(inv)) {
    const count = Math.floor(Number(n) || 0);
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
