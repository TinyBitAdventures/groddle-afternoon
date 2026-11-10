/**
 * Report #178 (the remake's own, Austin 2026-11-10): what the buddies list adds to js/buddies.js,
 * kept apart from it so the phone companion (which loads buddies.js) stays small. Pure: a buddy's
 * face from the site's picture, and Set as Destination for a buddy who is online on a public
 * street, through the Map's own directions. Drawn by js/ui/social-drawer.js and
 * js/features/buddies-feature.js.
 */

const n0 = (v) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Math.floor(Number(v)) : 0);

/** The verb a buddy's menu carries for it (js/ui/player-menu.js FROM_LIST_VERBS). */
export const BUDDY_DESTINATION_VERB = 'buddy_destination';

/** The Map's own words (game.js openMapStreetMenu: Set as Destination, its tip, "Destination set"). */
export const BUDDY_DESTINATION_TEXT = Object.freeze({
  verb: 'Set as Destination',
  tip: (street) => `Get a guided path to ${street}`,
  set: (street) => `Destination set: ${street}.`,
  gone: (name) => `${name} is no longer on that street.`,
  none: 'No path to there.',
});

/**
 * The street an online buddy can be set as the Map's destination, or '' for none.
 * Only a public street the list already names: never a private place (the server sends street ''
 * for a hidden one; a home, a party space, a race or any instance has "_" in its id), never a
 * street the game's street index does not hold (`isStreet`), and not the street you are on.
 * It shows nothing the list does not already show.
 * @param {{ street: string } | undefined} presence the server's last word, undefined when offline
 * @param {{ here?: string, isStreet?: (tsid: string) => boolean }} [opts]
 */
export function buddyDestination(presence, { here = '', isStreet = () => false } = {}) {
  const street = String(presence?.street || '');
  if (!/^[GL][A-Z0-9]{8,20}$/.test(street)) return '';
  if (here && street.slice(1) === String(here).slice(1)) return '';
  return isStreet(street) ? street : '';
}

/**
 * Where the site serves a character's small standing picture (site PlayerPages::image,
 * kind tile: the look's 100x144 PNG the game uploads, profiles-feature drawAvatar). It answers 404
 * for a character with no picture yet or under the Players page's level, so the list keeps its
 * lettered circle then.
 */
export function buddyFaceUrl(id) {
  const n = n0(id);
  return n ? `/players/${n}/tile` : '';
}

/** How long a face that did not load is left alone before the list asks for it again. */
export const FACE_RETRY_MS = 10 * 60 * 1000;

/**
 * Which faces loaded and which did not, so a redraw of the list neither flashes the circle nor
 * asks again for a picture that is not there: state(id, now) is 'ok', 'bad' or '' (not known,
 * or a miss older than FACE_RETRY_MS).
 */
export function createFaceMemory(retryMs = FACE_RETRY_MS) {
  const seen = new Map();
  return {
    ok(id) { seen.set(n0(id), { ok: true, at: 0 }); },
    bad(id, now = Date.now()) { seen.set(n0(id), { ok: false, at: now }); },
    state(id, now = Date.now()) {
      const e = seen.get(n0(id));
      if (!e) return '';
      if (e.ok) return 'ok';
      return now - e.at < retryMs ? 'bad' : '';
    },
  };
}
