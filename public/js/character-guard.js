/**
 * Alternate characters (Austin's rulings of 2026-11-12): a login may have up to three
 * characters, each its own user, but this browser is signed in as one of them at a time. A
 * second tab that switches character (POST groddle/v1/characters/{id}/play) changes the session
 * under the first tab, so every write that could move value names the character this page is
 * playing in the X-Groddle-Character header (the save, the realtime ticket, mail, auctions, the
 * Butler and the rest of the account's calls). The site answers 409 {"code": "character_changed"}
 * when it is not the signed-in one, and the page stops writing: a write can never land on
 * another character. Absent header: the site takes it (older clients).
 *
 * Pure: no DOM; the page's scope comes in as an argument (tests pass their own).
 */

export const CHARACTER_HEADER = 'X-Groddle-Character';

/** The site's refusal code when the header names a character the session is no longer playing. */
export const CHARACTER_CHANGED = 'character_changed';

/** The event the page hears when the site said so (js/save-store.js stops writing on it). */
export const CHARACTER_CHANGED_EVENT = 'groddle:character-changed';

/** A user id as a positive whole number, or 0. */
export function characterId(id) {
  const n = Number(id);
  return Number.isInteger(n) && n > 0 ? n : 0;
}

/** The character this page plays: the multiplayer boot data's player (js/online-boot.js), or 0 (solo, the phone). */
export function characterOf(scope = globalThis) {
  return characterId(scope?.GRODDLE_MP_BOOT?.player?.id);
}

/** The header for a character, or none for 0. */
export function characterHeaders(id) {
  const n = characterId(id);
  return n ? { [CHARACTER_HEADER]: String(n) } : {};
}

/** Whether an answer is the site's "another character is signed in now". */
export function isCharacterChanged(status, data) {
  return Number(status) === 409 && data?.code === CHARACTER_CHANGED;
}

/** Tells the page (once per answer; listeners are idempotent). */
export function announceCharacterChanged(scope = globalThis, detail = {}) {
  try {
    if (typeof scope?.dispatchEvent === 'function' && typeof scope.CustomEvent === 'function') {
      scope.dispatchEvent(new scope.CustomEvent(CHARACTER_CHANGED_EVENT, { detail }));
    }
  } catch { /* no page */ }
}
