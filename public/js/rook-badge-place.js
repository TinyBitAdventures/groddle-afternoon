/**
 * PURE: where the Rook attack's HUD badge sits (ROOKHUD, Austin 2026-10-30: the
 * badge sat half under the top bar's right pill and ran under the Social drawer's
 * rail). No DOM: rook-attack-feature.js measures the page and hands the rects in.
 *
 * The badge is drawn on the stage in view px, so the page's rects (#game-root
 * CSS px) go through the live stage scale (canvas CSS width / camera w) and the
 * canvas's offset in the root.
 *
 * Two spots:
 * - 'dock' (Modern): the free play area's top right, below the top bar's row
 *   (and the street nameplate or the route GPS when they hang under the bar)
 *   plus a gap, left of --inset-r (the Social drawer open, its rail, or 0) plus
 *   a gap, right of --inset-l (a left sheet), above the pack.
 * - 'header' (Classic): the 2012 client's spot, the header centre
 *   (RookIncidentHeaderView.as 640-651: x = YouDisplayManager.getHeaderCenterPt,
 *   gutter + loc_vp_w / 2, the viewport's centre; its message centred under the
 *   head, msg_holder.x = -MSG_WIDTH / 2). Its y 45 puts the 70 px head across the
 *   header's foot, which Classic's grid keeps off the canvas (the 40u header band
 *   is the page, not the stage), so the badge's top sits on the view's top plus
 *   the gap, as close to the header as the canvas reaches.
 *
 * Either way the whole badge stays inside the view.
 */

/**
 * The badge's parts around its centre, in view px (rook-attack-feature buildHud):
 * the disc (r 38) and its seven stars (r 50 + 7), the phase line above (to -62),
 * the clock under (to 63), the STUN! stamp and Rook Armor growing left from -50,
 * and the event feed's 300 px box from y 62, centred on `feedX`.
 */
export const BADGE_PARTS = Object.freeze({
  core: Object.freeze({ left: -66, right: 66, top: -64, bottom: 66 }),
  stampLeft: -180,
  feedW: 300,
  feedTop: 62,
  /** Room kept for a three-line feed when checking the floor. */
  feedRoom: 58,
});

/** The feed's centre from the badge's: left of a docked badge (it grows inward), centred under the Classic one. */
export const FEED_X = Object.freeze({ dock: -90, header: 0 });

/** The badge's whole box around its centre for a mode (view px). */
export function badgeExtent(mode = 'dock') {
  const feedX = mode === 'header' ? FEED_X.header : FEED_X.dock;
  const { core, stampLeft, feedW } = BADGE_PARTS;
  return {
    left: Math.min(core.left, stampLeft, feedX - feedW / 2),
    right: Math.max(core.right, feedX + feedW / 2),
    top: core.top,
    bottom: core.bottom,
    feedX,
  };
}

const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);

/**
 * @param {{
 *   mode?: 'dock'|'header',
 *   view: { w: number, h: number },        // the stage view (camera w and its height), view px
 *   scale: number,                         // CSS px per view px (canvas CSS width / camera w)
 *   origin?: { x: number, y: number },     // the canvas's top-left in #game-root CSS px
 *   root: { w: number, h: number },        // #game-root, CSS px
 *   insetL?: number, insetR?: number,      // --inset-l / --inset-r, CSS px (they hold their own gaps)
 *   gap?: number,                          // CSS px kept clear of every edge and blocker
 *   blockers?: Array<{ left: number, top: number, right: number, bottom: number }>, // top bar pills etc., root CSS px
 *   floor?: number,                        // the pack's top, root CSS px
 * }} o
 * @returns {{ mode: string, x: number, y: number, feedX: number,
 *   box: { left: number, top: number, right: number, bottom: number } }}
 *   x, y: the badge centre in view px; box: the badge's core (disc, stars, phase, clock) in root CSS px.
 */
export function placeRookBadge({
  mode = 'dock',
  view,
  scale,
  origin = { x: 0, y: 0 },
  root,
  insetL = 0,
  insetR = 0,
  gap = 8,
  blockers = [],
  floor = Infinity,
} = {}) {
  const m = mode === 'header' ? 'header' : 'dock';
  const ext = badgeExtent(m);
  const vw = Math.max(0, num(view?.w, 960));
  const vh = Math.max(0, num(view?.h, 408));
  const s = num(scale, 1) > 0 ? num(scale, 1) : 1;
  const ox = num(origin?.x);
  const oy = num(origin?.y);
  const rw = num(root?.w, vw * s);
  const g = Math.max(0, num(gap, 8));
  // CSS px in the root -> view px on the stage.
  const toX = (cx) => (cx - ox) / s;
  const toY = (cy) => (cy - oy) / s;
  const freeL = Math.max(0, toX(Math.max(0, num(insetL)) + g));
  const freeR = Math.min(vw, toX(rw - Math.max(0, num(insetR)) - g));
  const floorV = Math.min(vh, toY(num(floor, Infinity) - g));
  // x: the spot, kept in the free width, then in the view whatever happens.
  const lo = freeL - ext.left;
  const hi = freeR - ext.right;
  let x = m === 'header' ? vw / 2 : hi;
  x = hi >= lo ? Math.min(hi, Math.max(lo, x)) : hi;
  x = Math.min(vw - ext.right, Math.max(-ext.left, x));
  // y: under every blocker that shares the badge's columns (pills, the nameplate, the GPS), at least `gap` down.
  const spanL = ox + (x + ext.left) * s;
  const spanR = ox + (x + ext.right) * s;
  let topCss = oy + g;
  const rows = (Array.isArray(blockers) ? blockers : []).filter((b) => b && num(b.right) > spanL && num(b.left) < spanR && num(b.bottom) > num(b.top));
  for (let pass = 0; pass < rows.length + 1; pass += 1) {
    let moved = false;
    for (const b of rows) {
      const bottom = num(b.bottom) + g;
      if (num(b.top) < topCss + (ext.bottom - ext.top) * s && bottom > topCss) {
        topCss = bottom;
        moved = true;
      }
    }
    if (!moved) break;
  }
  let y = toY(topCss) - ext.top;
  // Above the pack where it can be; never back up under the bar, never out of the view.
  // (When the free width is narrower than the badge, the drawer's side wins: the feed may reach a left sheet.)
  const under = floorV - ext.bottom - BADGE_PARTS.feedRoom;
  if (y > under) y = Math.max(toY(topCss) - ext.top, under);
  y = Math.min(vh - ext.bottom, Math.max(-ext.top, y));
  // Whole view px, rounded away from the bar and the drawer.
  x = Math.floor(x);
  y = Math.ceil(y);
  const { core } = BADGE_PARTS;
  const box = {
    left: Math.round(ox + (x + core.left) * s),
    top: Math.round(oy + (y + core.top) * s),
    right: Math.round(ox + (x + core.right) * s),
    bottom: Math.round(oy + (y + core.bottom) * s),
  };
  return { mode: m, x, y, feedX: ext.feedX, box };
}

/** The event feed's box (root CSS px) under a placed badge, for the notices' zone while it shows. */
export function feedZone(place, scale, origin = { x: 0, y: 0 }, feedH = 22) {
  const s = num(scale, 1) > 0 ? num(scale, 1) : 1;
  const { feedW, feedTop } = BADGE_PARTS;
  const cx = place.x + place.feedX;
  return {
    left: Math.round(num(origin.x) + (cx - feedW / 2) * s),
    top: Math.round(num(origin.y) + (place.y + feedTop) * s),
    right: Math.round(num(origin.x) + (cx + feedW / 2) * s),
    bottom: Math.round(num(origin.y) + (place.y + feedTop + Math.max(22, num(feedH, 22)) + 2) * s),
  };
}

/** One box around two (either may be null). */
export function unionBox(a, b) {
  if (!a) return b || null;
  if (!b) return a;
  return { left: Math.min(a.left, b.left), top: Math.min(a.top, b.top), right: Math.max(a.right, b.right), bottom: Math.max(a.bottom, b.bottom) };
}
