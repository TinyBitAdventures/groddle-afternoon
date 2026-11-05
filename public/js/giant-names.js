/**
 * Each Giant's name as players read it, by giant id: the names of shrines.js GIANTS
 * (tests/shrines.test.js keeps the two in step), here in a module with no imports so the
 * small text modules (the loading card, drop tables, dice, rewards) can name a Giant without
 * loading the shrine code.
 *
 * The source names the giant of alchemy `ti` in its classes and favor keys and Tii in its words
 * (main.js 1800-1807 and 6136 swap the two). Several of its messages print capitalize(giant)
 * instead, so they read "Ti" (location.js 3556 "A shrine dedicated to <b>Ti</b>.", the dice,
 * favor rewards). Remake rule: every message says Tii (player report #102).
 */
export const GIANT_NAMES = Object.freeze({
  alph: 'Alph',
  cosma: 'Cosma',
  friendly: 'Friendly',
  grendaline: 'Grendaline',
  humbaba: 'Humbaba',
  lem: 'Lem',
  mab: 'Mab',
  pot: 'Pot',
  spriggan: 'Spriggan',
  ti: 'Tii',
  tii: 'Tii',
  zille: 'Zille',
});

/** A Giant's name for a giant id ('ti' and 'tii' are Tii); anything else is capitalized (common.js capitalize). */
export function giantDisplayName(id) {
  const key = String(id ?? '');
  const known = GIANT_NAMES[key.toLowerCase()];
  if (known) return known;
  return key.replace(/\w+/g, (a) => a.charAt(0).toUpperCase() + a.slice(1).toLowerCase());
}
