/**
 * Energy and mood can carry fractions here (saves from before G258, when
 * walking, jumping and climbing cost bits of energy, and a few fractional
 * rewards), while GSJS keeps every stat a whole number. Messages built from a
 * before/after difference can therefore read "+2.299999999999983 energy";
 * this rounds any signed stat amount in a message to a whole number.
 */

const STAT_AMOUNT = /([+−-])(\d+\.\d+)(\s*(?:energy|mood|iMG|xp)\b)/gi;

/** "+2.2999 energy" → "+2 energy"; text without fractions is unchanged. */
export function wholeStatAmounts(text) {
  if (typeof text !== 'string') return text;
  return text.replace(STAT_AMOUNT, (_, sign, num, unit) => `${sign}${Math.round(Number(num))}${unit}`);
}

/** Round the numeric fields of an effects object ({ energy: 2.3 } → { energy: 2 }). */
export function wholeEffects(effects) {
  if (!effects || typeof effects !== 'object') return effects;
  const out = { ...effects };
  for (const [key, value] of Object.entries(out)) {
    if (typeof value === 'number' && Number.isFinite(value) && !Number.isInteger(value)) out[key] = Math.round(value);
  }
  return out;
}
