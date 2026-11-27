/**
 * G1323 (#725): where a street's Ice Nubbins go when no picture of the street shows them.
 *
 * Glitch set every Ice Nubbin by hand (ice_knob.js obey_physics false) and the 2012 location files
 * only count them (144 on the 17 Nottis streets, no x or y; the item files that held the positions
 * were never archived), so the remake's planner stood them on the path. The 19 nubbins measured on
 * players' 2012-2013 snaps of five Nottis streets (assets/content/ice-nubbin-picture-spots.json)
 * show the habit this rule copies:
 *  - every one sits on an icy wall of the street's own art, a snow skirt (snow_skirt_01a/b/c) of the
 *    layer behind the avatars, never on a floor and never under a ledge;
 *  - the art's bottom 31 to 204 px over the floor in front (median 92): most low enough to scrape
 *    from where you stand, about a third high enough that you jump for them (Enter takes only what
 *    the avatar touches);
 *  - in clusters: two to four within about 150 px of each other (Dokk Rokk's seven between 947 and
 *    1588, Lotha Harte's three between 4435 and 4574), the clusters spread along the street.
 * So for each snow skirt over a floor a Glitch can reach, it takes spots on the skirt's drawn art (its
 * alpha mask), ICE_STAND_LIFTS or ICE_HIGH_LIFTS over that floor, with no line between, no other art
 * drawn over the nubbin (a snow ledge, a bush, a tree, an icicle in front: shadows and light do not
 * count), clear of signposts, doors and ladder feet. Clusters first (their middles spread along the
 * street), then the rest wherever a wall has room. Rock cliffs (cliff_face, snow_cliffface) are the
 * next tier, for a street whose skirts run out. Pure (no Pixi, no DOM): the result depends only on
 * the street, so solo and the realtime server's data agree.
 *
 * Reach (iceNubbinReach): Glitch's scrape (ice_knob.js, main.js doVerb 2939-2967) took a click from
 * 300 px; the Enter key took only what the avatar's hit box touched (66 x 123, its top 113 px over
 * the feet: js/reach.js AVATAR_HIT_BOX), up to the plain jump's apex higher in the air
 * (js/avatar-step.js jumpApex: 142 px). So a nubbin whose bottom is up to 113 px over its floor is
 * touched standing, one up to 113 + 142 - ICE_JUMP_MARGIN with a jump, and anything higher is a bug.
 * The floor itself must be one a Glitch walks or jumps to from the street's signposts and doors
 * (reachableFloors: a plain jump's rise up, any drop down).
 */
import { isStandable, platformsScreen, worldToScreen } from './street-model.js?v=a9a05f9d';
import { AVATAR_HIT_BOX } from './reach.js?v=456da8a8';
import { jumpApex } from './avatar-step.js?v=8415ee96';
import { decoCovers } from './barnacle-walls.js?v=75e568c3';

/** The icy wall art the measured nubbins sit on (sprite stems), tier 1. */
export const ICE_WALL_DECO = /^snow_skirt_/;
/** The rock cliffs of Nottis, tier 2: only for a street whose skirts have no room left. */
export const ICE_CLIFF_DECO = /^(snow_cliffface|cliff_face_(?!bg_topper))/;
/** Art drawn over a wall that does not hide a nubbin (a darker or lighter wash). */
export const ICE_SEE_THROUGH = /shadow|overlay|trans|light|glow|fog|haze|beam|ray|mist|gradient/i;
/** The art's bottom over the floor in front: within the standing avatar's reach (measured 31-100). */
export const ICE_STAND_LIFTS = Object.freeze([80, 60, 95, 45, 70, 90, 55, 35]);
/** The high ones, which need a jump for Enter (measured 117-204). */
export const ICE_HIGH_LIFTS = Object.freeze([150, 135, 170, 185, 125]);
/** The standing avatar's hit box reaches this far over the feet (66 x 123, 10 px under the feet). */
export const STAND_TOUCH = AVATAR_HIT_BOX.h - AVATAR_HIT_BOX.below;
/** A plain jump's rise (js/avatar-step.js, the client's gravity and vy_jump): 142 px. */
export const PLAIN_JUMP = jumpApex(1);
/** Kept under the jump's very top, so a tap of the jump key that falls short still touches it. */
export const ICE_JUMP_MARGIN = 25;
/** The highest a nubbin's bottom may sit over its floor: touched at the top of a plain jump. */
export const ICE_REACH_MAX = Math.floor(STAND_TOUCH + PLAIN_JUMP - ICE_JUMP_MARGIN);
/** About a quarter of a street's nubbins hang high (the snaps: 7 of 19 over 113 px). */
export const ICE_HIGH_SHARE = 0.25;
/** Two nubbins at least this far apart (the snaps: the closest pair 65 px). */
export const ICE_GAP = 56;
/** A cluster's members within this many px across of its first. */
export const ICE_CLUSTER_R = 150;
/** Cluster middles at least this far apart (then half that where the walls are short). */
export const ICE_CLUSTER_GAP = 420;
/** A cluster's members at least this far apart in height where the wall allows. */
export const ICE_LEVEL_STEP = 15;
/** Nubbins to a cluster, on the average (the snaps: two to four). */
export const ICE_CLUSTER_SIZE = 3;
/** The frame cell's height: the art reaches this far over its spot (knob3, 71 px). */
const ART_H = 71;
/** Points of the nubbin art (from the cell's bottom centre) that must sit on the wall and under no other art. */
export const ICE_CORE = Object.freeze({ xs: Object.freeze([-12, -6, 0, 6, 12]), ys: Object.freeze([-52, -42, -32, -22, -12]) });
/** A skirt's foot is a mound of snow on the floor, not wall: only its upper share counts. */
export const ICE_WALL_TOP_SHARE = 0.88;
const SAMPLE_PX = 8;
const MAX_SLOPE = 0.5;
const RESERVED_PAD = 40;
const EDGE_PX = 40;
/** reachableFloors: the gap a walk or a running jump crosses, and how far up a plain jump lands. */
const STEP_GAP = 60;
const JUMP_RISE = Math.floor(PLAIN_JUMP - 12);

function lineYAt(p, x) {
  if (x < p.x1 || x > p.x2) return null;
  if (p.x2 === p.x1) return Math.min(p.y1, p.y2);
  return p.y1 + ((p.y2 - p.y1) * (x - p.x1)) / (p.x2 - p.x1);
}
const slopeOf = (p) => (p.x2 === p.x1 ? Infinity : Math.abs((p.y2 - p.y1) / (p.x2 - p.x1)));
const isFloor = (p) => isStandable(p) && slopeOf(p) <= MAX_SLOPE * 2;

/**
 * PURE: the floors (indexes into platformsScreen) a Glitch reaches from the street's signposts and
 * doors by walking, dropping and plain jumps: from a floor, another whose end lies within STEP_GAP
 * across and at most JUMP_RISE above, or anywhere below; or one over it within JUMP_RISE (the
 * floors are -1 lines: you jump up through them). Ceilings are not modelled.
 */
export function reachableFloors(street, plats = platformsScreen(street)) {
  const floors = plats.map((p, i) => ({ p, i })).filter(({ p }) => isFloor(p));
  const starts = [];
  for (const s of [...(street?.signposts || []), ...(street?.doors || [])]) {
    if (!Number.isFinite(s?.x) || !Number.isFinite(s?.y)) continue;
    const at = worldToScreen(street, s.x, s.y);
    let best = null;
    for (const f of floors) {
      const y = lineYAt(f.p, Math.min(Math.max(at.x, f.p.x1), f.p.x2));
      if (y == null || Math.abs(at.x - Math.min(Math.max(at.x, f.p.x1), f.p.x2)) > STEP_GAP) continue;
      const d = Math.abs(y - at.y) + Math.abs(at.x - Math.min(Math.max(at.x, f.p.x1), f.p.x2));
      if (y >= at.y - 40 && (!best || d < best.d)) best = { f, d };
    }
    if (best) starts.push(best.f.i);
  }
  const seen = new Set(starts);
  const queue = [...starts];
  const byIndex = new Map(floors.map((f) => [f.i, f.p]));
  while (queue.length) {
    const a = byIndex.get(queue.shift());
    for (const { p: b, i } of floors) {
      if (seen.has(i)) continue;
      if (canReach(a, b)) {
        seen.add(i);
        queue.push(i);
      }
    }
  }
  return seen;
}

/** From floor a, floor b: across a short gap (up at most a jump, down any drop) or up through it from under. */
function canReach(a, b) {
  const lo = Math.max(a.x1, b.x1);
  const hi = Math.min(a.x2, b.x2);
  if (lo <= hi) {
    // Overlapping: b over a within a jump, or b under one of a's ends (walk off and drop).
    for (const x of [lo, (lo + hi) / 2, hi]) {
      const ya = lineYAt(a, x);
      const yb = lineYAt(b, x);
      if (ya != null && yb != null && yb < ya && ya - yb <= JUMP_RISE) return true;
    }
    for (const x of [a.x1, a.x2]) {
      const yb = lineYAt(b, Math.min(Math.max(x, b.x1), b.x2));
      const ya = lineYAt(a, x);
      if (yb != null && ya != null && Math.abs(x - Math.min(Math.max(x, b.x1), b.x2)) <= STEP_GAP && yb >= ya - 2) return true;
    }
    return false;
  }
  // Apart: from a's near end to b's near end.
  const [ax, bx] = a.x2 < b.x1 ? [a.x2, b.x1] : [a.x1, b.x2];
  if (Math.abs(bx - ax) > STEP_GAP) return false;
  const ya = lineYAt(a, ax);
  const yb = lineYAt(b, bx);
  return ya != null && yb != null && ya - yb <= JUMP_RISE;
}

/** Every line crossing x, with its y there. */
function linesAt(plats, x) {
  const out = [];
  plats.forEach((p, i) => {
    const y = lineYAt(p, x);
    if (y != null) out.push({ p, i, y });
  });
  return out;
}

/** Floors at x a Glitch stands on (standable, not steep), with room over them (no floor within 60 px above). */
function floorsAt(lines) {
  const floors = lines.filter(({ p }) => isStandable(p) && slopeOf(p) <= MAX_SLOPE);
  return floors.filter((f) => !floors.some((g) => g !== f && g.y < f.y && f.y - g.y < 60));
}

/**
 * PURE: the reach of a nubbin whose art's bottom centre is (x, y) (street px): the nearest floor
 * under it with no line between ({ floorY, floor: index }), `lift` (its bottom over that floor),
 * `jump` (Enter needs a jump: over the standing hit box), `reachable` (the floor is reachableFloors'
 * and the lift is ICE_REACH_MAX at most). null when no floor is under it.
 */
export function iceNubbinReach(street, x, y, { plats = platformsScreen(street), floors = null } = {}) {
  const lines = linesAt(plats, x);
  const under = lines.filter(({ p, y: ly }) => isStandable(p) && ly > y - 2).sort((a, b) => a.y - b.y)[0];
  if (!under) return null;
  const between = lines.some(({ y: ly }) => ly > y - ART_H && ly < under.y - 2);
  const lift = Math.round(under.y - y);
  const reach = floors || reachableFloors(street, plats);
  return {
    floorY: under.y,
    floor: under.i,
    lift,
    jump: lift > STAND_TOUCH,
    between,
    reachable: reach.has(under.i) && !between && lift >= 0 && lift <= ICE_REACH_MAX,
  };
}

/**
 * The art in the avatars' plane: every street-sized layer (and the middleground) with its z, the
 * deco's place in street px and its draw order.
 */
function planeDecos(street) {
  const b = street?.bounds || { l: 0, t: 0, r: 0, b: 0 };
  const W = b.r - b.l;
  const H = b.b - b.t;
  const out = [];
  (street?.layers || []).forEach((layer, li) => {
    const isMg = layer.id === 'middleground' || layer.name === 'middleground';
    if (!isMg && !(Math.abs(layer.w - W) <= 2 && Math.abs(layer.h - H) <= 2)) return;
    const lz = isMg ? 0 : (layer.z ?? li);
    const seeThrough = ICE_SEE_THROUGH.test(String(layer.name || layer.id || ''));
    (layer.decos || []).forEach((d, order) => {
      if (d.hidden) return;
      out.push({ d, x: isMg ? d.x - b.l : d.x, y: isMg ? d.y - b.t : d.y, lz, order, seeThrough });
    });
  });
  return out;
}

/** PURE: the deco sprites whose masks the rule reads on a street (its walls and whatever may be drawn over them). */
export function iceMaskSprites(street) {
  const out = new Set();
  for (const { d, seeThrough } of planeDecos(street)) {
    const name = String(d.sprite || '');
    if (!seeThrough && !ICE_SEE_THROUGH.test(name)) out.add(name);
  }
  return [...out].sort();
}

const maskOf = (masks, sprite) => (Object.prototype.hasOwnProperty.call(masks || {}, sprite) ? masks[sprite] : undefined);

/** Drawn over the wall: a nearer layer's art, or later in its own layer, that is not a wall of the same kind. */
function coversOf(wall, plane, test) {
  return plane.filter((c) => c !== wall && !c.seeThrough && !ICE_SEE_THROUGH.test(String(c.d.sprite || ''))
    // Another wall of the kind behind the avatars is wall too; one in front of them (z > 0) hides it.
    && !(c.lz <= 0 && test(String(c.d.sprite || '')))
    && (c.lz > wall.lz || (c.lz === wall.lz && ((c.d.z || 0) > (wall.d.z || 0) || ((c.d.z || 0) === (wall.d.z || 0) && c.order > wall.order)))));
}

/** The nubbin at (x, y) sits on the wall's drawn art (its upper share) with nothing else drawn over it. */
function seatsOn(wall, covers, masks, x, y) {
  const mask = maskOf(masks, wall.d.sprite);
  for (const oy of ICE_CORE.ys) {
    for (const ox of ICE_CORE.xs) {
      const px = x + ox;
      const py = y + oy;
      if (!decoCovers(wall.d, wall.x, wall.y, mask, px, py, ICE_WALL_TOP_SHARE)) return false;
      for (const c of covers) if (decoCovers(c.d, c.x, c.y, maskOf(masks, c.d.sprite), px, py)) return false;
    }
  }
  return true;
}

function reservedBoxes(reserved = []) {
  return reserved.map((s) => s.block || { l: s.x - (s.clearance || 40), r: s.x + (s.clearance || 40), t: s.y - 120, b: s.y });
}
const blocked = (boxes, x, y) => boxes.some((b) => x > b.l - RESERVED_PAD && x < b.r + RESERVED_PAD && y > b.t - ART_H && y < b.b + ART_H);

/** Every spot on a wall of `test`'s kind: { x, y, lift, high, tier, floor }. */
function wallCandidates(street, plats, plane, test, tier, res, masks, reach) {
  const W = (street?.bounds?.r ?? 0) - (street?.bounds?.l ?? 0);
  const out = [];
  const seen = new Set();
  for (const wall of plane) {
    const name = String(wall.d.sprite || '');
    if (!test(name) || wall.seeThrough || wall.lz > 0) continue;
    const w = Number(wall.d.w) || 0;
    const h = Number(wall.d.h) || 0;
    if (!(w >= 60 && h >= 80)) continue;
    const covers = coversOf(wall, plane, test);
    const reachW = Math.max(w, h);
    const lo = Math.max(wall.x - reachW / 2, EDGE_PX);
    const hi = Math.min(wall.x + reachW / 2, W - EDGE_PX);
    for (let x = Math.ceil(lo / SAMPLE_PX) * SAMPLE_PX; x <= hi; x += SAMPLE_PX) {
      const lines = linesAt(plats, x);
      for (const f of floorsAt(lines)) {
        if (!reach.has(f.i)) continue;
        for (const [lifts, high] of [[ICE_STAND_LIFTS, false], [ICE_HIGH_LIFTS, true]]) {
          for (const lift of lifts) {
            const y = Math.round(f.y - lift);
            const key = `${x},${y}`;
            if (seen.has(key)) continue;
            if (lines.some(({ y: ly }) => ly > y - ART_H - 4 && ly < f.y - 2)) continue;
            if (blocked(res, x, y)) continue;
            if (!seatsOn(wall, covers, masks, x, y)) continue;
            seen.add(key);
            out.push({ x, y, lift, high, tier, floor: f.i });
          }
        }
      }
    }
  }
  return out.sort((a, b) => a.x - b.x || a.y - b.y);
}

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const clearOf = (c, taken, gap) => taken.every((t) => dist(c, t) >= gap);

/** Farthest-point picks from `pool`, at least `gap` from `taken` and each other; ties go to the leftmost. */
function spread(pool, n, taken, gap) {
  const picks = [];
  while (picks.length < n) {
    let best = null;
    let bestD = -1;
    for (const c of pool) {
      let d = Infinity;
      for (const t of [...taken, ...picks]) d = Math.min(d, dist(c, t));
      if (d >= gap && d > bestD + 1e-9) {
        best = c;
        bestD = d;
      }
    }
    if (!best) break;
    picks.push(best);
  }
  return picks;
}

/**
 * The candidate nearest `centre`, of the kind asked, clear of every pick; one at another height than
 * the cluster's others first (the snaps' clusters climb the wall: Dokk Rokk's at 57 to 204 px), else any.
 */
function nearestMember(pool, centre, taken, high, members = []) {
  let best = null;
  let bestD = Infinity;
  for (const c of pool) {
    if (c.high !== high || Math.abs(c.x - centre.x) > ICE_CLUSTER_R || !clearOf(c, taken, ICE_GAP)) continue;
    const level = members.some((m) => Math.abs(m.lift - c.lift) < ICE_LEVEL_STEP) ? 1000 : 0;
    const d = level + dist(c, centre);
    if (d < bestD - 1e-9) {
      best = c;
      bestD = d;
    }
  }
  return best;
}

/** How many of `count` hang high. */
export function iceHighCount(count) {
  return count >= 3 ? Math.max(1, Math.round(count * ICE_HIGH_SHARE)) : 0;
}

/**
 * PURE: `count` Ice Nubbin spots for a street, { x, y, lift, high, tier } in street px (0, 0 = the
 * street's top left; x, y the frame cell's bottom centre, as resource-nodes-feature draws a measured
 * node), left to right. tier 1 a snow skirt, 2 a rock cliff. `keep` are spots already placed (measured
 * on a picture): they count as clusters of their own, and the rule keeps ICE_GAP from them.
 * @param {object} street   the street JSON (bounds, platforms, layers, signposts, doors)
 * @param {number} count
 * @param {{ reserved?: object[], keep?: {x:number,y:number}[], masks?: object }} [opts]  masks: tools/ice-nubbin-wall-masks.json
 */
export function iceNubbinWallSpots(street, count, { reserved = [], keep = [], masks = {} } = {}) {
  const want = Math.max(0, Math.floor(Number(count) || 0));
  if (!want || !street?.platforms?.length) return [];
  const plats = platformsScreen(street);
  const reach = reachableFloors(street, plats);
  const res = reservedBoxes(reserved);
  const plane = planeDecos(street);
  const taken = keep.map((k) => ({ x: k.x, y: k.y }));
  const picks = [];
  const keptHigh = keep.filter((k) => {
    const r = iceNubbinReach(street, k.x, k.y, { plats, floors: reach });
    return r?.jump;
  }).length;
  let highLeft = Math.max(0, iceHighCount(want + keep.length) - keptHigh);
  for (const [test, tier] of [[(s) => ICE_WALL_DECO.test(s), 1], [(s) => ICE_CLIFF_DECO.test(s), 2]]) {
    const left = want - picks.length;
    if (left <= 0) break;
    const pool = wallCandidates(street, plats, plane, test, tier, res, masks, reach);
    if (!pool.length) continue;
    // Cluster middles: standing spots spread along the street, away from the kept ones.
    const k = Math.max(1, Math.round(left / ICE_CLUSTER_SIZE));
    const stand = pool.filter((c) => !c.high);
    let centres = spread(stand, k, [...taken, ...picks], ICE_CLUSTER_GAP);
    if (centres.length < k) centres = [...centres, ...spread(stand, k - centres.length, [...taken, ...picks, ...centres], ICE_CLUSTER_GAP / 2)];
    if (!centres.length) continue;
    // Each cluster's size: as even as it goes, the first-picked (most spread) get the remainder.
    const sizes = centres.map((_, i) => Math.floor(left / centres.length) + (i < left % centres.length ? 1 : 0));
    const placed = [];
    const all = () => [...taken, ...picks, ...placed];
    const clusters = centres.map((c) => ({ c, members: [] }));
    for (const cl of clusters) {
      if (clearOf(cl.c, all(), ICE_GAP)) {
        cl.members.push(cl.c);
        placed.push(cl.c);
      }
    }
    // Then round by round, one more in each cluster: a high one while any are owed, else a standing one.
    for (let round = 1; round < Math.max(...sizes); round += 1) {
      clusters.forEach((cl, i) => {
        if (round >= sizes[i] || !cl.members.length) return;
        let m = highLeft > 0 ? nearestMember(pool, cl.c, all(), true, cl.members) : null;
        if (m) highLeft -= 1;
        else m = nearestMember(pool, cl.c, all(), false, cl.members);
        if (m) {
          cl.members.push(m);
          placed.push(m);
        }
      });
    }
    picks.push(...placed);
    // The rest wherever the walls have room, high ones first while owed.
    if (picks.length < want && highLeft > 0) {
      const more = spread(pool.filter((c) => c.high), Math.min(highLeft, want - picks.length), [...taken, ...picks], ICE_GAP);
      highLeft -= more.length;
      picks.push(...more);
    }
    if (picks.length < want) picks.push(...spread(pool, want - picks.length, [...taken, ...picks], ICE_GAP));
  }
  return picks.slice(0, want).map(({ x, y, lift, high, tier }) => ({ x, y, lift, high, tier })).sort((a, b) => a.x - b.x || a.y - b.y);
}

/**
 * PURE: the icy wall a nubbin at (x, y) sits on: { sprite, tier } when its art sits on a snow skirt's
 * (or a rock cliff's) drawn art with nothing else drawn over it (as iceNubbinWallSpots asks), else null.
 */
export function iceWallUnder(street, x, y, masks = {}) {
  const plane = planeDecos(street);
  for (const [test, tier] of [[(s) => ICE_WALL_DECO.test(s), 1], [(s) => ICE_CLIFF_DECO.test(s), 2]]) {
    for (const wall of plane) {
      const name = String(wall.d.sprite || '');
      if (!test(name) || wall.seeThrough || wall.lz > 0) continue;
      if (seatsOn(wall, coversOf(wall, plane, test), masks, x, y)) return { sprite: name, tier };
    }
  }
  return null;
}
