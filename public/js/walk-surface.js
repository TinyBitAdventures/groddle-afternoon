/**
 * Ground following for things that are items in the original (animals, NPCs,
 * dropped and placed things) on the imported street platforms, all in screen
 * space. They go by the item rule (street-model.js isItemSolid, the client's
 * item_solid_from_top): a shelf the avatar walks through holds them, an underside
 * or a line soft to items does not. A caller placing the avatar passes
 * `isStandable` instead.
 */

import { isItemSolid, platformYAt } from './street-model.js?v=23b926e5';

/**
 * The surface at x closest to the creature's current feet y, accepting only a
 * gentle step up or a short step down. Null over a gap (the creature turns).
 */
export function walkSurfaceY(platforms, x, y, { up = 40, down = 70 } = {}, solid = isItemSolid) {
  let best = null;
  for (const p of platforms || []) {
    if (!solid(p)) continue;
    const py = platformYAt(p, x, 0);
    if (py == null || py < y - up || py > y + down) continue;
    if (best == null || Math.abs(py - y) < Math.abs(best - y)) best = py;
  }
  return best;
}

/** First surface at or below y (where something dropped at y lands), or null. */
export function landingY(platforms, x, y, solid = isItemSolid) {
  let best = null;
  for (const p of platforms || []) {
    if (!solid(p)) continue;
    const py = platformYAt(p, x, 0);
    if (py == null || py < y - 4) continue;
    if (best == null || py < best) best = py;
  }
  return best;
}

/** The surface at x nearest a reference y in either direction (spawning on the right floor). */
export function nearestSurfaceY(platforms, x, refY, solid = isItemSolid) {
  let best = null;
  for (const p of platforms || []) {
    if (!solid(p)) continue;
    const py = platformYAt(p, x, 0);
    if (py == null) continue;
    if (best == null || Math.abs(py - refY) < Math.abs(best - refY)) best = py;
  }
  return best;
}
