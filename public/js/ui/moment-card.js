/**
 * The modern skin's big moment card (phase 2, Warm paper; the HUD mock's "big moment"):
 * the award, badge, trophy, level-up and quest-complete screens (#award-screen, drawn by
 * js/screen-fx.js showAwardScreen) as one cream card with the moment's art in a ray burst,
 * an eyebrow, a big title, the words, reward chips and the button, over a strong scrim.
 *
 * screen-fx.js keeps the rules (the fades, "stays until input", the buttons' labels and
 * entrances); this file only answers what the modern card shows: the art when the payload
 * has none, the reward chips and their icons, and the "N more" line for screens queued
 * behind it. style.css draws it under <html data-ui="modern">; Classic keeps its own look.
 * Pure helpers, tested without a DOM (tests/moment-card.test.js).
 */

/**
 * Art for a moment that brings none: the quest book, and for a level the imagination card's
 * iMG mark (assets/imagination/ui/moment_icon_imagination.svg is cards/icon_imagination.svg
 * with its viewBox cropped to the mark, so it stays sharp at 166 px).
 */
export const MOMENT_ART = Object.freeze({
  quest: 'assets/ui/quest-book.png',
  level: 'assets/imagination/ui/moment_icon_imagination.svg',
});

const GIANTS = ['alph', 'cosma', 'friendly', 'grendaline', 'humbaba', 'lem', 'mab', 'pot', 'spriggan', 'ti', 'zille'];

/** True when the page wears the modern skin (<html data-ui="modern">). */
export function isModernSkin(doc = globalThis.document) {
  return doc?.documentElement?.dataset?.ui === 'modern';
}

/** The art the card shows: the payload's own, else the kind's, else null (the glyph). */
export function momentArt(payload = {}) {
  if (payload.iconUrl) return payload.iconUrl;
  return MOMENT_ART[payload.kind] || null;
}

/** Which art it is, for its size: the quest book is wide (86x58), the rest square. */
export function momentArtShape(url = '') {
  return /quest-book\.png/.test(String(url)) ? 'book' : 'square';
}

/** A reward's icon: iMG, currants and a Giant's favor have one; the rest show words only. */
export function rewardIcon(text = '', kind = '') {
  if (kind === 'img') return 'assets/imagination/ui/imagination_button.png';
  if (kind === 'currants') return 'assets/sprites/icons/pile_of_currants@3x.png';
  if (kind === 'favor') {
    const m = String(text).toLowerCase().match(new RegExp(`\\b(${GIANTS.join('|')})\\b`));
    return m ? `assets/sprites/icons/emblem_${m[1]}@3x.png` : null;
  }
  return null;
}

/** A line of the reward summary reads as a reward ("+300 iMG", "570 currants"), not a cheer. */
export function isRewardText(text = '') {
  return /^[+\-−]?\d[\d,.]*\s+\S/.test(String(text).trim());
}

/**
 * The chips for a reward summary ("+300 iMG · +40 Grendaline favor"), or [] when any part
 * is not a reward ("Onwards and upwards!", "2 levels gained" stay words). `tokens` are
 * screen-fx.js awardRewardTokens(subtitle).
 */
export function rewardChips(tokens = []) {
  if (!tokens.length || !tokens.every((t) => isRewardText(t.text))) return [];
  return tokens.map((t) => ({ ...t, icon: rewardIcon(t.text, t.kind) }));
}

/** The queued line: screens waiting behind this one ("1 more"), or ''. */
export function momentMoreText(waiting) {
  const n = Math.max(0, Math.floor(Number(waiting) || 0));
  return n ? `${n} more` : '';
}
