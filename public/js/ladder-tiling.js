/**
 * Tiled ladders: the art a street ladder's `tiling` draws (glitch-client LadderView, which is a
 * vertical SurfaceView; SurfaceView.tile()). Imported by build-street-navigation.mjs
 * (js/location-navigation.js readTiling); the tile decos come from tools/build-ladder-tiles.py.
 *
 * The client's vertical rule, in the ladder's own coordinates (x centre, y = 0 at its foot, the
 * top at -h):
 * - cap_0 at the top (y -h), cap_1 at the foot (y -cap_1.h), each its own w x h with x -round(w/2);
 * - floor((h - 2 * cap_1.h) / cap_1.h) centers below cap_0, one every cap_1.h, at
 *   x -round(cap_1.w / 2) (the client measures them by cap_1); center_pattern picks each one's
 *   index, and an index past the pattern or with no art falls back as below;
 * - nothing at all unless both caps and at least one center have art (_draw sets can_tile false).
 * Draw order is cap_0, the centers, cap_1 (tiling's children). The LadderView sits in the
 * middleground renderer's GEO slot, above every middleground deco and below items and avatars
 * (MiddleGroundRenderer.addLadderView → addGeo), and takes the middleground's filters.
 * The client picked an unpatterned center at random; here it cycles through the centers with art,
 * so a street looks the same every visit.
 */

/** zIndex of ladder tiles inside the middleground container: above every middleground deco. */
export const LADDER_TILE_Z = 1e6;

/**
 * @param {{h:number, tiling?:{cap_0?:Piece, cap_1?:Piece, centers?:Piece[], pattern?:number[]}}} ladder
 * @param {(sprite:string) => boolean} [hasArt] whether a tile class has art
 * @returns {{part:'cap_0'|'center'|'cap_1', index?:number, sprite:string, x:number, y:number, w:number, h:number}[]}
 * @typedef {{sprite:string, w:number, h:number}} Piece
 */
export function ladderTilePieces(ladder, hasArt = () => true) {
  const t = ladder?.tiling;
  const h = Number(ladder?.h);
  if (!t || typeof t !== 'object' || !(h > 0)) return [];
  const ok = (p) => !!(p && p.sprite && p.w > 0 && p.h > 0 && hasArt(p.sprite));
  const cap0 = t.cap_0;
  const cap1 = t.cap_1;
  const centers = Array.isArray(t.centers) ? t.centers : [];
  const good = centers.map((c, i) => (ok(c) ? i : -1)).filter((i) => i >= 0);
  if (!ok(cap0) || !ok(cap1) || !good.length) return [];
  const out = [{ part: 'cap_0', sprite: cap0.sprite, x: -Math.round(cap0.w / 2), y: -h, w: cap0.w, h: cap0.h }];
  const step = cap1.h;
  const count = Math.max(0, Math.floor((h - 2 * step) / step));
  const pattern = Array.isArray(t.pattern) ? t.pattern : [];
  for (let i = 0; i < count; i++) {
    let index = i < pattern.length ? Number(pattern[i]) : good[i % good.length];
    if (!good.includes(index)) index = good[0];
    const c = centers[index];
    out.push({ part: 'center', index, sprite: c.sprite, x: -Math.round(cap1.w / 2), y: -h + cap0.h + i * step, w: c.w, h: c.h });
  }
  out.push({ part: 'cap_1', sprite: cap1.sprite, x: -Math.round(cap1.w / 2), y: -cap1.h, w: cap1.w, h: cap1.h });
  return out;
}
