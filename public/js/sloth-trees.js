/**
 * G891: where each Sloth hangs, found from its street's own trees (the sloth audit's place.py,
 * research/sloths-2026-11-16/audit-2, ported). Glitch placed every npc_sloth by hand in a tree
 * canopy, with instance props for its side (`dir`) and how far its hit box reached down
 * (`hitbox_extension`: npc_sloth.js 28-57, onCreate 572, onPropsChanged 614-618); the 2012
 * location files keep only how many a street had. The trees survive in the street art:
 *
 * 1. Crowns: the `tree_plane_foliage_*` decos of the street-wide layers in front of the items
 *    (z > 0: `middleplus`, or `middle plus` on Pitonia Lood and Kaha Haha), merged where their
 *    boxes come within CROWN_GAP of each other.
 * 2. Trees: the `tree_plane_trunk_*` and `tree_plane_01a` decos of the street-wide layers behind
 *    (z < 0, not the sky). A trunk has a crown when the crown's x range (CROWN_GAP to spare)
 *    covers it and the crown's lower edge lies between 200 px over the trunk's top and its base;
 *    one crown over several trunks keeps the trunk nearest its centre. That leaves out bare
 *    trees, acacias, shrub rows and crown pieces at a street's ends.
 * 3. The sloth: on the side of the trunk the crown spreads further to (`dir`), at the crown's
 *    lower edge but never less than MIN_LIFT over the floor below it (its origin, the SWF's point:
 *    the HIDE ME box above it sits in the leaves, the hanging sloth under it), BRANCH_OFFSET out
 *    from the trunk box's middle, or nearer where that leaves the thick end of its own branch
 *    (BRANCH_REACH back, BRANCH_DROP down) short of the trunk as drawn: then BRANCH_DEPTH into it.
 *    #746: the trunk art is lopsided (tree_plane_trunk_01a's trunk stands about 40 px right of its
 *    box's middle), so this reads the drawn columns (SLOTH_TRUNK_COLUMNS,
 *    tools/build-sloth-trunk-columns.mjs), not the box.
 * 4. The Knocker: on the trunk, its foot KNOCKER_LIFT over the floor at the trunk and its ring
 *    (KNOCKER_RING over the foot) on the middle of the drawn trunk (#746; the box's middle with no
 *    columns), outside the sloth's box (KNOCKER_CLEAR, KNOCKER_EDGE). Glitch's were hand-placed on
 *    the trunk (the 2012 Haqiq Cedony snaps).
 *
 * On the 37 sloth streets this finds exactly as many trees as the location file has Sloths
 * (84), and puts the 7 sloths seen hanging out in the Eleven players' 2012 snaps within 24 px
 * across and 21 px up of where the snaps show them, each on the right side of its trunk.
 * tools/build-sloth-spots.mjs writes the 37 streets' spots (js/sloth-spots-data.js); a street
 * with no written spots (a builder street) runs this on its own art.
 *
 * Pure: street JSON in (street px, y up negative), screen px out (0, 0 = the street's top left).
 */

import { SLOTH_TRUNK_COLUMNS } from './sloth-trunk-columns-data.js?v=2903cb2a';

export const CROWN_GAP = 40;
export const BRANCH_OFFSET = 110;
export const MIN_LIFT = 170;
export const KNOCKER_LIFT = 75;
/** #746: the Knocker's ring over its foot (sloth_knocker, 34 x 50, its point the bottom centre). */
export const KNOCKER_RING = 25;
/**
 * #746: the thick end of the sloth's own branch from its spot (the hands): SLOTH_GRIP (30, 22) to the
 * SWF's origin, then the sloth_hidden branch end at 59 back, its middle row 36 down (rows 88-118 of
 * the cell at x 2).
 */
export const BRANCH_REACH = 89;
export const BRANCH_DROP = 14;
/** #746: how far at least the branch's thick end goes into the drawn trunk, so it grows out of it. */
export const BRANCH_DEPTH = 2;
/**
 * #746: the least a sloth's spot stands off its Knocker, so the Knocker stays outside the sloth's box
 * (resource-nodes-feature.js SLOTH_GRIP.x 30 + SLOTH_REACH.box.back 61, and 1): each its own thing to
 * point at. Where a trunk leans toward its sloth, the Knocker hangs off the trunk's middle, away from
 * the sloth, but never nearer the trunk's far edge than KNOCKER_EDGE; past that the sloth hangs out.
 */
export const KNOCKER_CLEAR = 92;
export const KNOCKER_EDGE = 10;
/** The sloth's HIDE ME box from its origin (js/sloth-art.js SLOTH_CANOPY), for the "narrow" flag. */
const HIDE_BOX = Object.freeze({ x: -52, w: 164 });

const CROWN_RE = /^tree_plane_foliage/;
const TRUNK_RE = /^tree_plane_trunk|^tree_plane_01a/;

/** Python's round (half to even), so the spots match place.py to the pixel. */
function pyRound(v) {
  const r = Math.round(v);
  return Math.abs(v % 1) === 0.5 && r % 2 !== 0 ? r - 1 : r;
}

function streetBoxes(street, keepLayer, re) {
  const b = street.bounds;
  const W = b.r - b.l;
  const H = b.b - b.t;
  const out = [];
  for (const layer of street.layers || []) {
    if (!keepLayer(layer, W)) continue;
    for (const d of layer.decos || []) {
      if (!re.test(String(d.sprite || ''))) continue;
      const x = d.x + b.l;
      const y = d.y + b.t + (H - layer.h);
      out.push({ x, x0: x - d.w / 2, x1: x + d.w / 2, y0: y - d.h, y1: y, sprite: String(d.sprite), w: d.w, h: d.h, flip: Boolean(d.flip), r: Number(d.r) || 0 });
    }
  }
  return out;
}

/**
 * PURE (#746): the trunk's drawn [left, right] at street row y (SLOTH_TRUNK_COLUMNS: the art as
 * street-render.js draws it, anchored bottom centre, sized w x h, mirrored), or null where nothing is
 * drawn, the trunk is turned or its art was never measured.
 */
export function drawnTrunkAt(trunk, y, columns = SLOTH_TRUNK_COLUMNS) {
  const c = Object.prototype.hasOwnProperty.call(columns, trunk.sprite) ? columns[trunk.sprite] : null;
  if (!c || trunk.r || !(trunk.w > 0 && trunk.h > 0)) return null;
  const v = (y - trunk.y0) / trunk.h;
  if (!(v >= 0 && v < 1)) return null;
  const row = Math.floor(v * c.h);
  const [l, r] = [c.rows[row * 2], c.rows[row * 2 + 1]];
  if (!(l >= 0 && r > l)) return null;
  const at = (px) => (trunk.flip ? trunk.x + trunk.w / 2 - (px * trunk.w) / c.w : trunk.x - trunk.w / 2 + (px * trunk.w) / c.w);
  return [Math.min(at(l), at(r)), Math.max(at(l), at(r))];
}

const near = (a, c) => a.x0 <= c.x1 + CROWN_GAP && a.x1 >= c.x0 - CROWN_GAP && a.y0 <= c.y1 + CROWN_GAP && a.y1 >= c.y0 - CROWN_GAP;

function mergeCrowns(boxes) {
  const crowns = [];
  for (const box of boxes) {
    const merged = { x0: box.x0, x1: box.x1, y0: box.y0, y1: box.y1 };
    for (const c of crowns.filter((c) => near(box, c))) {
      crowns.splice(crowns.indexOf(c), 1);
      Object.assign(merged, { x0: Math.min(merged.x0, c.x0), x1: Math.max(merged.x1, c.x1), y0: Math.min(merged.y0, c.y0), y1: Math.max(merged.y1, c.y1) });
    }
    crowns.push(merged);
  }
  for (let again = true; again;) {
    again = false;
    outer: for (let i = 0; i < crowns.length; i += 1) {
      for (let j = i + 1; j < crowns.length; j += 1) {
        const a = crowns[i];
        const c = crowns[j];
        if (!near(a, c)) continue;
        Object.assign(a, { x0: Math.min(a.x0, c.x0), x1: Math.max(a.x1, c.x1), y0: Math.min(a.y0, c.y0), y1: Math.max(a.y1, c.y1) });
        crowns.splice(j, 1);
        again = true;
        break outer;
      }
    }
  }
  return crowns.sort((a, b) => a.x0 - b.x0);
}

/** The nearest platform line under (x, y) (street px), or null. */
export function floorBelow(platforms, x, y) {
  let best = null;
  for (const p of platforms || []) {
    const lo = Math.min(p.x1, p.x2);
    const hi = Math.max(p.x1, p.x2);
    if (x < lo || x > hi) continue;
    const t = p.x2 !== p.x1 ? (x - p.x1) / (p.x2 - p.x1) : 0;
    const py = p.y1 + t * (p.y2 - p.y1);
    if (py > y && (best == null || py < best)) best = py;
  }
  return best;
}

/**
 * The street's sloth trees, left to right: [{ x, y, dir, floor, knocker: { x, y }, trunk, crown,
 * flags }] in screen px. `dir` 1 hangs right of the trunk, -1 left; `floor` is the floor under
 * the sloth (its hit box reaches down to it); flags: 'no floor', 'lift' (outside 150-260 px),
 * 'narrow' (the HIDE ME box sticks out past the crown).
 */
export function slothTrees(street, columns = SLOTH_TRUNK_COLUMNS) {
  if (!street?.bounds || !Array.isArray(street.layers)) return [];
  const b = street.bounds;
  const crowns = mergeCrowns(streetBoxes(street, (l, W) => l.z > 0 && l.w === W, CROWN_RE));
  const trunks = streetBoxes(street, (l, W) => l.z < 0 && l.w === W && l.name !== 'sky', TRUNK_RE);
  const centre = (c) => (c.x0 + c.x1) / 2;
  const byCrown = new Map();
  for (const t of trunks) {
    const cands = crowns.filter((c) => c.x0 - CROWN_GAP <= t.x && t.x <= c.x1 + CROWN_GAP && t.y0 - 200 <= c.y1 && c.y1 <= t.y1);
    if (!cands.length) continue;
    const crown = cands.reduce((a, c) => (Math.abs(centre(c) - t.x) < Math.abs(centre(a) - t.x) ? c : a));
    const had = byCrown.get(crown);
    if (!had || Math.abs(centre(crown) - t.x) < Math.abs(centre(crown) - had.x)) byCrown.set(crown, t);
  }
  const out = [];
  for (const [crown, t] of byCrown) {
    const dir = centre(crown) >= t.x ? 1 : -1;
    const edge = crown.y1;
    const trunkFloor = floorBelow(street.platforms, t.x, t.y0);
    // The sloth's spot, the floor under it (its lift) and the Knocker for a given x.
    const hang = (x) => {
      const floor = floorBelow(street.platforms, x, edge - 60);
      const y = pyRound(floor == null ? edge + 10 : Math.min(edge, floor - MIN_LIFT));
      const fy = floor == null ? y + MIN_LIFT : pyRound(floor);
      const ky = trunkFloor == null ? fy - KNOCKER_LIFT : pyRound(trunkFloor - KNOCKER_LIFT);
      const ring = drawnTrunkAt(t, ky - KNOCKER_RING, columns);
      if (!ring) return { x, y, floor, fy, kx: pyRound(t.x), ky };
      // The ring on the middle of the trunk, or off it away from the sloth enough to stay clear of
      // its box, never nearer the far edge than KNOCKER_EDGE.
      const mid = (ring[0] + ring[1]) / 2;
      const kx = dir > 0
        ? Math.max(ring[0] + KNOCKER_EDGE, Math.min(mid, x - KNOCKER_CLEAR))
        : Math.min(ring[1] - KNOCKER_EDGE, Math.max(mid, x + KNOCKER_CLEAR));
      return { x, y, floor, fy, kx: pyRound(kx), ky };
    };
    let at = hang(pyRound(t.x + dir * BRANCH_OFFSET));
    // #746: in to the drawn trunk at the branch's row when its branch falls short; out only when its
    // box would still take in the Knocker (the row moves with the lift, so again until it settles).
    for (let i = 0; i < 3; i += 1) {
      const col = drawnTrunkAt(t, at.y + BRANCH_DROP, columns);
      const reach = col ? pyRound((dir > 0 ? col[1] : col[0]) + dir * (BRANCH_REACH - BRANCH_DEPTH)) : at.x;
      let next = dir * (at.x - reach) > 0 ? hang(reach) : at;
      if (dir * (next.x - next.kx) < KNOCKER_CLEAR) next = hang(next.kx + dir * KNOCKER_CLEAR);
      if (next.x === at.x) break;
      at = next;
    }
    const { x, y, floor, fy, kx, ky } = at;
    const flags = [];
    if (floor == null) {
      flags.push('no floor');
    } else {
      const lift = pyRound(floor) - y;
      if (lift < 150 || lift > 260) flags.push('lift');
      const bx0 = x + (dir > 0 ? HIDE_BOX.x : -HIDE_BOX.x - HIDE_BOX.w);
      if (bx0 < crown.x0 || bx0 + HIDE_BOX.w > crown.x1) flags.push('narrow');
    }
    out.push({
      x: x - b.l,
      y: y - b.t,
      dir,
      floor: fy - b.t,
      knocker: { x: kx - b.l, y: ky - b.t },
      trunk: pyRound(t.x) - b.l,
      crown: { x0: pyRound(crown.x0) - b.l, x1: pyRound(crown.x1) - b.l, edge: pyRound(edge) - b.t },
      flags,
    });
  }
  return out.sort((a, b2) => a.x - b2.x);
}

/** One spot row as js/sloth-spots-data.js keeps it: [x, y, dir, floor, knockerX, knockerY]. */
export function slothSpotRow(tree) {
  return [tree.x, tree.y, tree.dir, tree.floor, tree.knocker.x, tree.knocker.y];
}

/** A spot row back as { x, y, dir, floor, knocker } (screen px). */
export function slothSpotFromRow(row) {
  if (!Array.isArray(row) || !row.slice(0, 6).every(Number.isFinite)) return null;
  const [x, y, dir, floor, kx, ky] = row;
  return { x, y, dir: dir < 0 ? -1 : 1, floor, knocker: { x: kx, y: ky } };
}
