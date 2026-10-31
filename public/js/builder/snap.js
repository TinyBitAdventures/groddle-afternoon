/**
 * LEVEL BUILDER (spec 6.5): snapping, toggled with `;`.
 *
 * - On release, platform ends snap within 30 px to other platform ends and to wall ends
 *   (LocoDeco's healer, BR:685-702, LocationPhysicsHealer.as:21-24).
 * - An optional 10 px grid (`G`) while dragging.
 * - Guides dragged from the rulers, in world x or y.
 * - Middleground decos snap their bottom to the floor line under them.
 * - Ctrl/Cmd held while dragging an end drags the ends joined to it (LocoDeco used C).
 *
 * Everything here works in world space (the numbers the inspector shows). Pure.
 */
import { isStandable, platformYAt } from '../street-model.js?v=23b926e5';

export const SNAP_PX = 30;
export const GRID_PX = 10;
/** Ends this close count as joined (a Ctrl/Cmd drag takes them along). */
export const JOIN_EPS = 2;
/** Guides pull a point this many canvas px across. */
export const GUIDE_PX = 8;

/** PURE: a value on the grid. */
export function gridSnap(v, step = GRID_PX) {
  return Math.round(v / step) * step;
}

/**
 * PURE: every end a platform end can join: platform ends (p1, p2) and wall tops and bottoms.
 * `skip` holds "<kind>:<id>" keys left out (the things being dragged).
 */
export function endPoints(street, skip = new Set()) {
  const out = [];
  for (const p of street?.platforms || []) {
    if (skip.has(`platform:${p.id}`)) continue;
    out.push({ kind: 'platform', id: p.id, end: 'p1', x: p.x1, y: p.y1 });
    out.push({ kind: 'platform', id: p.id, end: 'p2', x: p.x2, y: p.y2 });
  }
  for (const w of street?.barriers || []) {
    if (skip.has(`barrier:${w.id}`)) continue;
    out.push({ kind: 'barrier', id: w.id, end: 'top', x: w.x, y: w.y });
    out.push({ kind: 'barrier', id: w.id, end: 'bottom', x: w.x, y: w.y + w.h });
  }
  return out;
}

/** PURE: the nearest end within `radius` of a point, or null. */
export function nearestEnd(point, ends, radius = SNAP_PX) {
  let best = null;
  let bestD = radius + 1e-9;
  for (const e of ends) {
    const d = Math.hypot(e.x - point.x, e.y - point.y);
    // Ties keep the first: a platform end before a wall end.
    if (d < bestD) {
      bestD = d;
      best = e;
    }
  }
  return best;
}

/** PURE: the ends joined to a point (within JOIN_EPS): what a Ctrl/Cmd end drag takes along. */
export function joinedEnds(street, point, skip = new Set(), eps = JOIN_EPS) {
  return endPoints(street, skip).filter((e) => Math.abs(e.x - point.x) <= eps && Math.abs(e.y - point.y) <= eps);
}

/**
 * PURE: snap a platform's ends on release. `ends` names which ends moved ('p1', 'p2' or both):
 * one end snaps alone; a moved line (both) shifts whole by its nearest end's pull. Returns the
 * fields to set (empty when nothing is in reach).
 */
export function snapPlatform(item, others, moved = ['p1', 'p2'], radius = SNAP_PX) {
  const pts = { p1: { x: item.x1, y: item.y1 }, p2: { x: item.x2, y: item.y2 } };
  if (moved.length === 1) {
    const e = nearestEnd(pts[moved[0]], others, radius);
    if (!e) return {};
    return moved[0] === 'p1' ? { x1: e.x, y1: e.y } : { x2: e.x, y2: e.y };
  }
  const best = bestPull([pts.p1, pts.p2], others, radius);
  if (!best) return {};
  return { x1: item.x1 + best.dx, y1: item.y1 + best.dy, x2: item.x2 + best.dx, y2: item.y2 + best.dy };
}

/** PURE: the shortest pull that puts one of `points` on an end within `radius` ({ dx, dy } or null). */
export function bestPull(points, others, radius = SNAP_PX) {
  let best = null;
  for (const p of points) {
    const e = nearestEnd(p, others, radius);
    if (!e) continue;
    const d = Math.hypot(e.x - p.x, e.y - p.y);
    if (!best || d < best.d) best = { d, dx: e.x - p.x, dy: e.y - p.y };
  }
  return best ? { dx: best.dx, dy: best.dy } : null;
}

/**
 * PURE: a freshly drawn line's ends, each snapped on its own (a draw joins both ends up).
 */
export function snapDrawnPlatform(item, others, radius = SNAP_PX) {
  const a = nearestEnd({ x: item.x1, y: item.y1 }, others, radius);
  const b = nearestEnd({ x: item.x2, y: item.y2 }, others, radius);
  return { ...item, ...(a ? { x1: a.x, y1: a.y } : {}), ...(b ? { x2: b.x, y2: b.y } : {}) };
}

/** PURE: a value pulled to the nearest guide within `radius` (guides: [{ axis, at }]). */
export function guideSnap(v, guides, axis, radius) {
  let best = v;
  let bestD = radius;
  for (const g of guides || []) {
    if (g.axis !== axis) continue;
    const d = Math.abs(g.at - v);
    if (d <= bestD) {
      bestD = d;
      best = g.at;
    }
  }
  return best;
}

/** PURE: a point on the grid (when `grid`) and pulled to guides (radius in world px). */
export function snapPoint(p, { grid = false, guides = [], radius = 0 } = {}) {
  let x = grid ? gridSnap(p.x) : p.x;
  let y = grid ? gridSnap(p.y) : p.y;
  if (radius > 0) {
    x = guideSnap(x, guides, 'x', radius);
    y = guideSnap(y, guides, 'y', radius);
  }
  return { x, y };
}

/**
 * PURE: the floor a middleground deco's bottom snaps to: the standable line at its x nearest its
 * y within `radius` (world space). Returns the y, or null when none is in reach.
 */
export function floorSnapY(street, x, y, radius = SNAP_PX) {
  let best = null;
  let bestD = radius;
  for (const p of street?.platforms || []) {
    if (!isStandable(p)) continue;
    const ly = platformYAt(p, x, 0);
    if (ly == null) continue;
    const d = Math.abs(ly - y);
    if (d <= bestD) {
      bestD = d;
      best = Math.round(ly);
    }
  }
  return best;
}

/**
 * PURE: ruler ticks for a span of world values starting at `start` at a zoom: a round step that
 * leaves at least `minPx` canvas px between labels. Returns { step, ticks }.
 */
export function rulerTicks(start, span, zoom, minPx = 64) {
  const steps = [10, 20, 50, 100, 200, 500, 1000, 2000, 5000];
  const step = steps.find((s) => s * zoom >= minPx) || steps[steps.length - 1];
  const ticks = [];
  for (let v = Math.ceil(start / step) * step; v <= start + span; v += step) {
    ticks.push(v);
    if (ticks.length > 400) break;
  }
  return { step, ticks };
}
