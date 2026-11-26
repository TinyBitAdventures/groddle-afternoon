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

import { MOMENT_SHARP } from '../moment-art-list.js?v=e51336e6';
import { statIconUrl } from '../stat-icons.js?v=36d17f30';

/**
 * The award card's quest book (2026-11-12, Austin: "ship it if it matches"): a faithful 6x redraw
 * of Tiny Speck's graphics/quest_book.png (86x58), made solid so the card's rays don't show through
 * its pages; at 86x58 its outline overlaps the original's by 96%. Made art, listed with its
 * provenance in tools/provenance/made-sprites.json (quest_book_award). Classic keeps the original.
 */
const QUEST_BOOK_SOLID = 'assets/ui/quest-book-solid.webp';

/**
 * Art for a moment that brings none: the quest book, and for a level the imagination card's
 * iMG mark (assets/imagination/ui/moment_icon_imagination.svg is cards/icon_imagination.svg
 * with its viewBox cropped to the mark, so it stays sharp at 166 px).
 */
export const MOMENT_ART = Object.freeze({
  quest: QUEST_BOOK_SOLID,
  level: 'assets/imagination/ui/moment_icon_imagination.svg',
});

const GIANTS = ['alph', 'cosma', 'friendly', 'grendaline', 'humbaba', 'lem', 'mab', 'pot', 'spriggan', 'ti', 'zille'];

/** True when the page wears the modern skin (<html data-ui="modern">). */
export function isModernSkin(doc = globalThis.document) {
  return doc?.documentElement?.dataset?.ui === 'modern';
}

/** The art the card shows: the payload's own, else the kind's, else null (the glyph). */
export function momentArt(payload = {}) {
  if (payload.iconUrl) return /(^|\/)quest-book\.webp$/.test(payload.iconUrl) ? QUEST_BOOK_SOLID : momentSharpUrl(payload.iconUrl);
  return MOMENT_ART[payload.kind] || null;
}

const SMALL_ART = /^(.*?)assets\/sprites\/(?:icons|street-jobs)\/([a-z0-9_]+)(?:@3x)?\.webp(?:\?.*)?$/;

/**
 * A small icon's sharp render for the card, when there is one (lane momentart, 2026-11-15: the
 * Feat Completed card drew the 60 px @3x Small Petrified Rock across about 500 device px on an
 * iPhone). js/moment-art-list.js lists the renders (assets/sprites/moment/<id>.webp, 498 px on the
 * long side, from Tiny Speck's vector SWFs); any other URL comes back as it is. Both skins use it.
 */
export function momentSharpUrl(url) {
  const m = SMALL_ART.exec(String(url || ''));
  return m && MOMENT_SHARP.has(m[2]) ? `${m[1]}assets/sprites/moment/${m[2]}.webp` : url;
}

/** Device pixels the card may spend on one pixel of raster art before it reads as blurred. */
export const MOMENT_ART_STRETCH = 3;

/**
 * The density a loaded card image was picked at: 3 when js/icon-hires.js gave it a `3x` srcset and
 * the browser took the @3x file (its natural size is then a third of the file's), else 1.
 */
export function artDensity(currentSrc = '', hasSrcset = false) {
  return hasSrcset && /@3x\.webp(\?|$)/.test(String(currentSrc)) ? 3 : 1;
}

/**
 * The largest CSS size (px, the long side) the card should draw raster art at: at most
 * MOMENT_ART_STRETCH device pixels for each of its own pixels, so small art stays crisp at a
 * smaller size instead of blurring at the card's full 166 px. null for vector art (SVG) or an
 * image with no size yet. `width`/`height` are the image's natural size at `density`.
 */
export function momentArtCap({ width = 0, height = 0, density = 1, dpr = 1, url = '' } = {}) {
  if (/\.svg(\?|#|$)|^data:image\/svg/i.test(String(url))) return null;
  const long = Math.max(Number(width) || 0, Number(height) || 0) * (Number(density) || 1);
  if (!long) return null;
  return Math.floor((long * MOMENT_ART_STRETCH) / Math.max(1, Number(dpr) || 1));
}

/** Which art it is, for its size: the quest book is wide (86x58), the rest square. */
export function momentArtShape(url = '') {
  return /quest-book(-solid)?\.webp/.test(String(url)) ? 'book' : 'square';
}

/**
 * A reward's icon: iMG, energy, mood, currants and a Giant's favor have one, and an item given as a
 * reward row (`classTsid`) its own (glitch-client Slug.as getIcon 228-233, ItemIconView), an unlock
 * its `icon`; the rest show words only. #562: the stats' icons are the top bar's and the speech bubble's (js/stat-icons.js).
 */
export function rewardIcon(text = '', kind = '', row = {}) {
  if (kind === 'img') return statIconUrl('imagination');
  if (kind === 'currants' || kind === 'energy' || kind === 'mood') return statIconUrl(kind);
  if (kind === 'favor') {
    const giant = String(row?.giant || '').toLowerCase();
    if (GIANTS.includes(giant)) return `assets/sprites/icons/emblem_${giant}@3x.webp`;
    const m = String(text).toLowerCase().match(new RegExp(`\\b(${GIANTS.join('|')})\\b`));
    return m ? `assets/sprites/icons/emblem_${m[1]}@3x.webp` : null;
  }
  if (kind === 'item' && /^[a-z0-9_]+$/.test(String(row?.classTsid || ''))) return `assets/sprites/icons/${row.classTsid}.webp`;
  // #705: an unlock (quests.js questUnlockRows) brings its own art, a path under assets/.
  if (kind === 'unlock' && /^assets\/[a-z0-9_/.-]+\.(webp|png|svg)$/i.test(String(row?.icon || ''))) return row.icon;
  return null;
}

/** A line of the reward summary reads as a reward ("+300 iMG", "570 currants"), not a cheer. */
export function isRewardText(text = '') {
  return /^[+\-−]?\d[\d,.]*\s+\S/.test(String(text).trim());
}

/**
 * The chips for a reward summary: one chip per line, each with its own icon where it has one.
 * `tokens` are the payload's reward rows (awardTokens: quests.js questRewardSummary rows, marked
 * `row`) or screen-fx.js awardRewardTokens(subtitle). [] only when no line is a reward
 * ("Onwards and upwards!" stays words). #492: a recipe or "1× Pan" line made the whole card fall
 * back to words, so iMG, currants and favor lost their icons.
 */
export function rewardChips(tokens = []) {
  if (!tokens.some((t) => t.row || isRewardText(t.text))) return [];
  return tokens.map((t) => ({ ...t, icon: rewardIcon(t.text, t.kind, t) }));
}

/** The queued line: screens waiting behind this one ("1 more"), or ''. */
export function momentMoreText(waiting) {
  const n = Math.max(0, Math.floor(Number(waiting) || 0));
  return n ? `${n} more` : '';
}

/**
 * The card's words when they need more room than the card has (Austin's iPhone, 2026-11-15: the
 * body shrank to part of a line and was cut through the letters). `room` is the height the card
 * leaves the body, `full` the words' own height, `lineHeight` one line (all CSS px). Returns
 * { height: 0 } when the words fit, { height } in whole lines when the body scrolls, and
 * { scrollCard: true } when not even one whole line fits (a short screen sideways): then the whole
 * card scrolls in the screen instead, at its full height.
 */
export function bodyFit(room, full, lineHeight) {
  if (!(lineHeight > 0) || !(full > room + 1)) return { height: 0 };
  const lines = Math.floor((room + 0.5) / lineHeight);
  return lines >= 1 ? { height: lines * lineHeight } : { scrollCard: true };
}

/**
 * Which edge of a body that scrolls fades to say there is more: 'end' (more below), 'start'
 * (more above), 'both', or '' (all of it shows).
 */
export function bodyFade({ top = 0, height = 0, full = 0 } = {}) {
  if (!(full > height + 1)) return '';
  const above = top > 1;
  const below = top + height < full - 1;
  return above && below ? 'both' : above ? 'start' : below ? 'end' : '';
}
