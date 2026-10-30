/**
 * Which item holder a class draws in, and the entity-layer zIndex that puts it there.
 *
 * The client stacks a street's middleground back to front (MiddleGroundRenderer.setupEndShapes
 * 111-171): decos, background items, normal items, foreground items, other players, your avatar,
 * foremost items. A class's holder comes from its itemDef flags (LocationRenderer.placeItemstackInMG
 * 1508-1517: in_background, else in_foreground, else in_foremostground, else normal); the lists are
 * generated from GameServerJS by tools/build-item-bands.mjs. Within a holder the client draws stacks
 * in stack-z order; the remake keeps each site's own small offset inside the band, then feet y
 * (game.js sorts the entity layer by zIndex, then y).
 *
 * Bands in the entity layer: background 10-19, normal 20-34, foreground 35-48, other players 49.x,
 * your avatar 50, foremost 60 (only the Crusher). Decos and door/signpost dressing stay under 10.
 */
import { BACKGROUND_CLASSES, FOREGROUND_CLASSES, FOREMOST_CLASSES, NORMAL_CLASSES } from './item-bands-data.js?v=0ac4551c';

export const BAND_Z = Object.freeze({ background: 10, normal: 20, foreground: 35, foremost: 60 });
/** Exclusive top of each band: an offset never reaches the next band. */
const BAND_TOP = Object.freeze({ background: 20, normal: 35, foreground: 49, foremost: 100 });

/**
 * Remake ids that are not GameServerJS classes, mapped to the class they stand in for.
 * The project board is drawn from Tiny Speck's sign_stake art (items/sign_stake.js: neither flag).
 */
export const BAND_ALIASES = Object.freeze({
  street_job_board: 'sign_stake',
  garden_plot: 'garden_new',
  neighbour_mailbox: 'npc_mailbox',
});

const BAND_OF = new Map();
for (const [band, list] of [['normal', NORMAL_CLASSES], ['background', BACKGROUND_CLASSES], ['foreground', FOREGROUND_CLASSES], ['foremost', FOREMOST_CLASSES]]) {
  for (const cls of list) BAND_OF.set(cls, band);
}

/** The GameServerJS class a remake id draws as (aliases; vendor street spirits are street_spirit). */
export function bandClass(classTsid) {
  const cls = String(classTsid || '');
  if (BAND_OF.has(cls)) return cls;
  if (BAND_ALIASES[cls]) return BAND_ALIASES[cls];
  if (/^street_spirit_/.test(cls)) return 'street_spirit';
  return cls;
}

/** 'background' | 'normal' | 'foreground' | 'foremost'; a class GameServerJS does not know is normal. */
export function itemBand(classTsid) {
  return BAND_OF.get(bandClass(classTsid)) || 'normal';
}

/**
 * The zIndex for a class in the entity layer: its band's floor plus `offset` (a site's order among
 * its own band, clamped so it never reaches the next band). A site that draws classes of several
 * bands passes an offset per band ({ background: 9, normal: 1 }).
 */
export function itemZ(classTsid, offset = 0) {
  const band = itemBand(classTsid);
  const lo = BAND_Z[band];
  const raw = offset && typeof offset === 'object' ? offset[band] : offset;
  const off = Math.max(0, Number(raw) || 0);
  return Math.min(lo + off, BAND_TOP[band] - 0.01);
}

/** True when GameServerJS has this class (after aliases); tests use it to keep each site's class real. */
export function knownItemClass(classTsid) {
  return BAND_OF.has(bandClass(classTsid));
}
