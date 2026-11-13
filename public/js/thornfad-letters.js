/**
 * Thornfad Layers' letters (register G678; Groddle Heights, GCR12NU45AM12BB). Pure rules; the
 * thornfad-letters feature runs them.
 *
 * What survives in source (LCR12NU45AM12BB.xml):
 * - Three events. give_letters rolls a letter from a weight table (English letter frequency, a
 *   heart for the last two slots) and, if the player has none, shows it over the head with
 *   pc.announce_add_indicator('letter'+ran, 'letter_'+ran+'_overlay', false, '1', { width: 42,
 *   height: 60 }). remove_letters and player_exit take it down and forget it.
 * - One Collision-triggered Event Box (IIFMKPJ7GSB320O). items/cteb.js runs its onEnter list on
 *   onPlayerCollision and its onExit list on onPlayerLeavingCollisionArea, so the box gives a
 *   letter when you walk in and takes it when you walk out. Its hit box was never archived.
 * - Nothing touches the locked door (door_1, key 1, to Vicar's Peak): no event opens it, checks
 *   the letters or reads pc.letter. The letters are a toy for spelling words together.
 * - The street's roll is weight[Math.floor(Math.random() * weight.length + 1)]: slot 0 (an A) is
 *   never picked and one roll in 101 reads past the end, leaving ran = '1', whose
 *   letter_1_overlay does not exist: that player gets no letter until they walk out and back in.
 *   (Alphabet Sauce rolls the same table with randInt(0, length): js/potions.js rollSauceLetter.)
 *
 * Where the box stands is OUR reading of the footage (reference only, YouTube PYKFo_S_0vU
 * 0:05-1:15): a letter appears as the player comes out from behind the cave pillar left of the
 * door (middleplus crosssection_heights_pillar_2 decos, screen x 495..596), stays while they
 * stand at the door and under the first Egg Plant to its right (node spot x 1316), still shows
 * while they step back behind the pillar, and is gone once they come out on the signpost's side.
 * Nothing shows where the right edge was; the box stops just past that Egg Plant.
 */

import { LETTER_WEIGHTS, sauceLetterOverlay } from './potions.js?v=4f4c996d';

export const THORNFAD_LAYERS_TSID = 'GCR12NU45AM12BB';

/** Screen space (world x + 2000, y + 1300), bottom-centre: pillar middle 500 to past the Egg Plant at 1360, floor to ceiling. */
export const LETTER_BOX = Object.freeze({
  id: 'IIFMKPJ7GSB320O',
  x: 930,
  y: 1300,
  w: 860,
  h: 440,
  why: 'Footage PYKFo_S_0vU 0:05-1:15: the letter comes and goes behind the pillar left of the door and still shows under the Egg Plant right of it.',
});

/** pc_overlay from announce_build_indicator_annc (players/inc_announcements.js 585-616): delta_y -120, the art's larger side 60 px. */
/**
 * pc_overlay from announce_build_indicator_annc (players/inc_announcements.js 585-616): delta_y -120 from
 * the feet (InLocationAnnouncementOverlay.as placeByPcView), the art's larger side 60 px. The client's
 * avatar stood about 115 px, so the letter sat just over the head (footage PYKFo_S_0vU). The remake's
 * avatar stands taller (about 126 px with its hair at the street zoom of 1.29, measured in the Thornfad shots), and another player's name plate sits at -150 to
 * -170 (realtime-feature PLATE_Y): `headDy` and `remoteDy` keep the letter clear of both, as it was.
 */
export const LETTER_INDICATOR = Object.freeze({ wh: 60, dy: -120, dx: 0, headDy: -135, remoteDy: -176 });

const sameTsid = (a, b) => String(a || '').slice(1) === String(b || '').slice(1);

/** Thornfad Layers (either TSID prefix). */
export const isThornfadLayers = (tsid) => sameTsid(tsid, THORNFAD_LAYERS_TSID);

/** The avatar's feet (screen space) inside the box. */
export function inLetterBox(x, y, box = LETTER_BOX) {
  return x >= box.x - box.w / 2 && x <= box.x + box.w / 2 && y <= box.y && y >= box.y - box.h;
}

/** give_letters' roll, as the street wrote it: 'A'..'Z', 'heart', or '1' (no overlay: nothing shows). */
export function rollStreetLetter(rng = Math.random) {
  const r = Math.max(0, Math.min(0.999999999, Number(rng()) || 0));
  const n = LETTER_WEIGHTS[Math.floor(r * LETTER_WEIGHTS.length + 1)];
  if (!n) return '1';
  if (n === 27) return 'heart';
  return String.fromCharCode(64 + n);
}

/** The overlay a letter shows (letter_<A-Z|heart>_overlay), or null for '1'. */
export function letterOverlayKey(letter) {
  return letter && letter !== '1' ? sauceLetterOverlay(letter) : null;
}

/** A forced letter for QA (&thornfadletter=E or heart), or null. */
export function parseForcedLetter(value) {
  const v = String(value ?? '').trim();
  if (/^heart$/i.test(v)) return 'heart';
  return /^[a-z]$/i.test(v) ? v.toUpperCase() : null;
}
