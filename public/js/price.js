/**
 * PRICES (#743, Austin's ruling 2026-11-26): one way to show a price in currants, Glitch's: the number
 * with its thousands commas, then the currants sign ₡ (StoreDialog.as 390 cost_str then ₡,
 * StoreBuyUI.as 520 "Price 1,234₡" and 578-582 "Buy: 2 for 900₡", CurrencyInput.as CURRANCY_SYMBOL).
 * The shops and vendors, the Furniture Store, the storage windows' stores, mail postage and the
 * auctions all use it; the top bar keeps its own currant coin.
 */

/** Glitch's currants sign. */
export const CURRANT_SIGN = '₡';

/**
 * "1,250₡": a whole number of currants (never below 0) with its commas, then the sign. A figure already
 * written as a string (an auction's price each, "36.2" or "<0.1", js/auctions.js unitPrice) keeps its words.
 */
export function priceText(n) {
  if (typeof n === 'string' && n && !/^\d+$/.test(n)) return `${n}${CURRANT_SIGN}`;
  return `${currantCount(n)}${CURRANT_SIGN}`;
}

/** "1,250": a count of currants written as the prices write it (the vendor's purse, "You have 1,250 currants"). */
export function currantCount(n) {
  return Math.max(0, Math.floor(Number(n) || 0)).toLocaleString('en-US');
}
