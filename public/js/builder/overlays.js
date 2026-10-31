/**
 * LEVEL BUILDER (spec 6.7, 8.5): the overlays drawn over a street, in the street's own screen px,
 * shared by the editor and the render page (/builder-render/, which agents see through the render
 * endpoint), so both draw the same lines in the same colours. Each draws into a Pixi Graphics; `px`
 * turns canvas px into street px at the current zoom (n / zoom), so lines keep their width.
 *
 *   drawGeometryOverlay(g, street, { px, shown })   lines by permeability, walls, ladders, signposts
 *   drawReachOverlay(g, reach, { px })               the validator's reach map (surfaces, targets, traps, arrivals)
 *
 * No DOM; Pixi only through the Graphics handed in.
 */
import { geoShape, permName, dashes, wallSides, shapeBounds } from './geometry-handles.js?v=54aaffb7';

export const OVERLAY_COLOURS = Object.freeze({
  Floor: 0x3ddc84, Roof: 0xffb020, Soft: 0x7cc4ff, Hard: 0xff5a5a, wall: 0xe879f9, ladder: 0x22d3ee, post: 0xfde047,
  reached: 0x22c55e, unreached: 0xef4444, arrival: 0x60a5fa, trap: 0xf97316, plain: 0xfff176, running: 0xff8ad8, select: 0x1fa6ff,
});

/** A path of segments stroked once. */
export function strokeSegs(g, segs, style) {
  if (!segs.length) return;
  for (const [x1, y1, x2, y2] of segs) g.moveTo(x1, y1).lineTo(x2, y2);
  g.stroke(style);
}

/**
 * The geometry overlay: platforms by permeability (Floor solid, Roof with ticks under it, Soft
 * dashed, Hard thick), walls with ticks on each side they block (an open wall dashed), line ends,
 * ladders with rungs, and signposts (a post with no arm the game shows dashed).
 * `shown(kind, item)` gives an item as drawn (the editor's drag preview), the item by default.
 */
export function drawGeometryOverlay(g, s, { px = (n) => n, shown = (kind, item) => item } = {}) {
  const C = OVERLAY_COLOURS;
  const shape = (kind, item) => geoShape(s, kind, shown(kind, item));
  const groups = { Floor: [], Roof: [], Soft: [], Hard: [] };
  const outline = [];
  const ticks = { Roof: [], wall: [] };
  for (const p of s.platforms || []) {
    const sh = shape('platform', p);
    const name = permName(shown('platform', p).pc_perm);
    const seg = [sh.x1, sh.y1, sh.x2, sh.y2];
    outline.push(seg);
    if (name === 'Soft') groups.Soft.push(...dashes(...seg, px(8), px(6)));
    else groups[name].push(seg);
    if (name === 'Roof') {
      const len = Math.hypot(sh.x2 - sh.x1, sh.y2 - sh.y1);
      for (let d = px(6); d < len; d += px(14)) {
        const t = d / len;
        const x = sh.x1 + t * (sh.x2 - sh.x1);
        const y = sh.y1 + t * (sh.y2 - sh.y1);
        ticks.Roof.push([x, y, x, y + px(5)]);
      }
    }
  }
  const walls = [];
  for (const b of s.barriers || []) {
    const item = shown('barrier', b);
    const sh = geoShape(s, 'barrier', item);
    const sides = wallSides(item.pc_perm);
    outline.push([sh.x, sh.y1, sh.x, sh.y2]);
    if (!sides.left && !sides.right) walls.push(...dashes(sh.x, sh.y1, sh.x, sh.y2, px(8), px(6)));
    else walls.push([sh.x, sh.y1, sh.x, sh.y2]);
    for (let y = sh.y1 + px(6); y < sh.y2; y += px(14)) {
      if (sides.left) ticks.wall.push([sh.x - px(5), y, sh.x, y]);
      if (sides.right) ticks.wall.push([sh.x, y, sh.x + px(5), y]);
    }
  }
  strokeSegs(g, outline, { width: px(5), color: 0x000000, alpha: 0.45 });
  strokeSegs(g, groups.Floor, { width: px(2), color: C.Floor });
  strokeSegs(g, groups.Roof, { width: px(2), color: C.Roof });
  strokeSegs(g, ticks.Roof, { width: px(1.5), color: C.Roof });
  strokeSegs(g, groups.Soft, { width: px(2), color: C.Soft });
  strokeSegs(g, groups.Hard, { width: px(3.5), color: C.Hard });
  strokeSegs(g, walls, { width: px(2.5), color: C.wall });
  strokeSegs(g, ticks.wall, { width: px(1.5), color: C.wall });
  for (const seg of outline.slice(0, (s.platforms || []).length)) {
    g.circle(seg[0], seg[1], px(2.5)).circle(seg[2], seg[3], px(2.5));
  }
  if ((s.platforms || []).length) g.fill({ color: 0xffffff, alpha: 0.85 });
  const rungs = [];
  for (const l of s.ladders || []) {
    const sh = shape('ladder', l);
    g.rect(sh.x - sh.w / 2, sh.y1, sh.w, sh.y2 - sh.y1);
    for (let y = sh.y2 - 20; y > sh.y1; y -= 20) rungs.push([sh.x - sh.w / 2, y, sh.x + sh.w / 2, y]);
  }
  if ((s.ladders || []).length) g.stroke({ width: px(2), color: C.ladder });
  strokeSegs(g, rungs, { width: px(1), color: C.ladder, alpha: 0.7 });
  const dashed = [];
  let boxes = 0;
  for (const p of s.signposts || []) {
    const sh = shape('signpost', p);
    const b = shapeBounds(sh);
    if ((p.connects || []).some((c) => !c.hidden)) {
      g.rect(b.x1, b.y1, b.x2 - b.x1, b.y2 - b.y1);
      boxes += 1;
    } else for (const [x1, y1, x2, y2] of [[b.x1, b.y1, b.x2, b.y1], [b.x2, b.y1, b.x2, b.y2], [b.x2, b.y2, b.x1, b.y2], [b.x1, b.y2, b.x1, b.y1]]) dashed.push(...dashes(x1, y1, x2, y2, px(8), px(6)));
  }
  if (boxes) g.stroke({ width: px(2), color: C.post });
  strokeSegs(g, dashed, { width: px(2), color: C.post });
}

/** The reach map: reached surfaces green, the rest red; targets boxed; traps and arrivals marked. */
export function drawReachOverlay(g, r, { px = (n) => n, arrivals = true } = {}) {
  if (!r) return;
  const C = OVERLAY_COLOURS;
  const good = [];
  const bad = [];
  for (const u of r.surfaces || []) (u.reached ? good : bad).push([u.x1, u.y1, u.x2 === u.x1 ? u.x2 + 4 : u.x2, u.y2]);
  strokeSegs(g, good, { width: px(8), color: C.reached, alpha: 0.5 });
  strokeSegs(g, bad, { width: px(8), color: C.unreached, alpha: 0.5 });
  for (const t of r.targets || []) {
    g.rect(t.x - (t.w || 100) / 2, t.y - (t.h || 200), t.w || 100, t.h || 200);
    g.stroke({ width: px(t.reached ? 2 : 4), color: t.reached ? C.reached : C.unreached });
  }
  for (const t of r.traps || []) g.poly([t.x, t.y - px(14), t.x - px(8), t.y, t.x + px(8), t.y]).fill({ color: C.trap });
  if (arrivals) drawArrivals(g, r.arrivals, { px });
}

/** Arrival points: filled where the avatar stands, a ring where it does not. */
export function drawArrivals(g, list, { px = (n) => n } = {}) {
  for (const a of list || []) {
    g.circle(a.x, a.y, px(8));
    if (a.stands) g.fill({ color: OVERLAY_COLOURS.arrival });
    else g.stroke({ width: px(3), color: OVERLAY_COLOURS.arrival });
  }
}
