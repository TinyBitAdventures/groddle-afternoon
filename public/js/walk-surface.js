/**
 * Ground following for small walking NPCs (foxes, Heli Kitties) on the
 * imported street platforms, all in screen space.
 */

import { platformYAt } from './street-model.js?v=g442-6';

/**
 * The surface at x closest to the creature's current feet y, accepting only a
 * gentle step up or a short step down. Null over a gap (the creature turns).
 */
export function walkSurfaceY(platforms, x, y, { up = 40, down = 70 } = {}) {
  let best = null;
  for (const p of platforms || []) {
    const py = platformYAt(p, x, 0);
    if (py == null || py < y - up || py > y + down) continue;
    if (best == null || Math.abs(py - y) < Math.abs(best - y)) best = py;
  }
  return best;
}

/** First surface at or below y (where something dropped at y lands), or null. */
export function landingY(platforms, x, y) {
  let best = null;
  for (const p of platforms || []) {
    const py = platformYAt(p, x, 0);
    if (py == null || py < y - 4) continue;
    if (best == null || py < best) best = py;
  }
  return best;
}

/** The surface at x nearest a reference y in either direction (spawning on the right floor). */
export function nearestSurfaceY(platforms, x, refY) {
  let best = null;
  for (const p of platforms || []) {
    const py = platformYAt(p, x, 0);
    if (py == null) continue;
    if (best == null || Math.abs(py - refY) < Math.abs(best - refY)) best = py;
  }
  return best;
}
