/**
 * Never released in Glitch: things Tiny Speck built that players could never
 * reach, which the remake keeps anyway (Austin 2026-11-03). Each entry's page
 * carries a plain note and a "Never released" tag, and its card in the section
 * index (the item catalog grid, or an encyclopedia section's list)
 * carries the tag. Add an entry here, with a reason, to mark another one.
 *
 * Keys are the encyclopedia's own (parts.mjs pathOf): item:<id> for an item,
 * <section>:<id> for any other entry. Words are ours and players read them
 * (tests/player-copy-dev-refs.test.js): plain, no file names, no em-dashes.
 *
 * Reasons:
 * - paradise-course: three of the fourteen Ticket to Paradise courses.
 *   GSJS config_prod.js:1310-1325 paradise_locations lists 14 courses and
 *   items/paradise_ticket_<id>.js defines a ticket for each, but nothing in
 *   the source hands out Aerial Boost, Drafty Uplift or Updraft: the 11
 *   ticket_to_paradise_* cards in inc_data_imagination.js (7171-7484) skip
 *   them, no store, drop table or quest reward names them (only catalog.js,
 *   catalog_tags.js and the generic craftytasking specs list them), and they
 *   are the only three tickets with has_infopage = false (items/
 *   paradise_ticket_updraft.js:11; the other eleven are true). The generic
 *   paradise_ticket.js would pick a random course only for an undefined
 *   location_id, but its own is "" and nothing hands it out either.
 *   Player records agree: the forum's location-count thread (general/9830)
 *   logs 11 Paradise courses going live in Updates 25, 27 and 28, and the
 *   upgrade-card thread general/25444 (round 9 coverage hunt, 2026-11-03)
 *   lists the same 11 with each one's favor Giant. Aerial Boost survives
 *   only in a Tiny Speck level designer's own upload (research/video
 *   README section 3b). The remake builds all three (js/paradise-courses.js).
 */
import { esc } from './parts.mjs';

export const NEVER_RELEASED_TAG = 'Never released';

export const NEVER_RELEASED_REASONS = Object.freeze({
  'paradise-course': Object.freeze({
    // Shown near the top of the page, about the original.
    note: 'Never released in Glitch: this course was in Tiny Speck’s code but wasn’t among the Paradise courses players could visit.',
    // Shown under "In the remake", in place of the status's usual words.
    remake: 'The remake keeps the course. Nothing in the game hands out this ticket yet, just as nothing did in the original.',
  }),
});

export const NEVER_RELEASED = Object.freeze({
  'item:paradise_ticket_aerial_boost': 'paradise-course',
  'item:paradise_ticket_drafty_uplift': 'paradise-course',
  'item:paradise_ticket_updraft': 'paradise-course',
});

/** The note for an entry key (item:<id> or <section>:<id>): { reason, tag, note, remake }, or null. */
export function neverReleased(key) {
  const reason = NEVER_RELEASED[key];
  if (!reason) return null;
  const words = NEVER_RELEASED_REASONS[reason];
  if (!words) throw new Error(`never-released ${key}: no reason "${reason}" in NEVER_RELEASED_REASONS`);
  return { reason, tag: NEVER_RELEASED_TAG, ...words };
}

/** The small tag drawn on a card or beside a status pill. */
export const neverReleasedTag = (cls = '') => `<span class="ency-unreleased${cls ? ` ${cls}` : ''}">${NEVER_RELEASED_TAG}</span>`;

/** The page's note, a plain paragraph. */
export const neverReleasedNote = (nr) => `<p class="ency-unreleased-note">${esc(nr.note)}</p>`;
