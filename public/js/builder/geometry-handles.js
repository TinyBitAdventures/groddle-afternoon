/**
 * LEVEL BUILDER (spec 2.1, 3.2, 6.5): geometry for picking, handles, drags and the draw tools.
 * Pointer work happens in screen space (the street's top-left origin, before the camera: what
 * P1's canvas world uses); the data stays in world space (spec 2.1):
 *
 *   platform  x1,y1 - x2,y2 (line ends)              handles: the two ends (p1, p2); Shift levels
 *   barrier   x, top y, h down (a wall)              handles: top and bottom, vertical only
 *   ladder    bottom-centre x,y, w, h up             handles: bottom (moves it) and a height grip
 *   signpost  bottom-centre x,y, w, h                handles: the eight a deco has, no rotation
 *
 * LocoDeco's set (BR:2048-2069). Picking: geometry wins over decos, platforms over the rest.
 * Pure: no DOM, no Pixi.
 */
import { isStandable, platformsScreen } from '../street-model.js?v=23b926e5';
import { decoBox, handlePoints, resizeBy } from './handles.js?v=e215d17d';
import { floorUnder } from './zone.js?v=9608addf';
import { arrivalInTarget, streetAliases } from '../location-navigation.js?v=4be109b9';

export const GEO_KINDS = Object.freeze(['platform', 'barrier', 'ladder', 'signpost']);
export const GEO_LIST = Object.freeze({ platform: 'platforms', barrier: 'barriers', ladder: 'ladders', signpost: 'signposts' });
/** Words for each kind (inspector, outliner, notes). */
export const GEO_WORDS = Object.freeze({ platform: 'Platform', barrier: 'Wall', ladder: 'Ladder', signpost: 'Signpost' });
/** Sizes a new ladder and signpost take (Hechey Track's, the commonest in the files). */
export const LADDER_W = 50;
export const POST_W = 150;
export const POST_H = 200;
/** Shortest line, wall and ladder the draw tools make, in px. */
export const MIN_DRAW = 8;
const MIN_H = 8;
const MG = Object.freeze({ id: 'middleground' });

const r0 = (v) => Math.round(v);

/** PURE: a selection key, "<kind>:<id>". */
export const geoKey = (kind, id) => `${kind}:${id}`;
export function parseGeoKey(key) {
  const i = String(key).indexOf(':');
  const kind = String(key).slice(0, i);
  return i > 0 && GEO_KINDS.includes(kind) ? { kind, id: String(key).slice(i + 1) } : null;
}

/** PURE: [{ kind, id, item }] for every geometry thing on a street. */
export function geoItems(street, kinds = GEO_KINDS) {
  const out = [];
  for (const kind of kinds) for (const item of street?.[GEO_LIST[kind]] || []) out.push({ kind, id: item.id, item });
  return out;
}

/** PURE: the item of a kind by id, or null. */
export function geoItem(street, kind, id) {
  return (street?.[GEO_LIST[kind]] || []).find((g) => g.id === id) || null;
}

/** PURE: which kind an id belongs to on a street (null when none). */
export function geoKindOf(street, id) {
  for (const kind of GEO_KINDS) if (geoItem(street, kind, id)) return kind;
  return null;
}

/** PURE: a signpost's box (handles.js decoBox: bottom-centre anchor, never rotated). */
export function postBox(street, post) {
  return decoBox(street, MG, { x: post.x, y: post.y, w: post.w > 0 ? post.w : POST_W, h: post.h > 0 ? post.h : POST_H, r: 0 });
}

/** PURE: an item's shape in screen space. */
export function geoShape(street, kind, item) {
  const { l, t } = street.bounds;
  if (kind === 'platform') return { kind, x1: item.x1 - l, y1: item.y1 - t, x2: item.x2 - l, y2: item.y2 - t };
  if (kind === 'barrier') {
    const a = item.y - t;
    const b = item.y + (Number(item.h) || 0) - t;
    return { kind, x: item.x - l, y1: Math.min(a, b), y2: Math.max(a, b) };
  }
  if (kind === 'ladder') {
    const bot = item.y - t;
    return { kind, x: item.x - l, y1: bot - (Number(item.h) || 0), y2: bot, w: item.w > 0 ? item.w : LADDER_W };
  }
  const box = postBox(street, item);
  return { kind, x: box.ax, y1: box.ay - box.h, y2: box.ay, w: box.w, box };
}

/** PURE: a shape's axis-aligned bounds in screen space. */
export function shapeBounds(s) {
  if (s.kind === 'platform') return { x1: Math.min(s.x1, s.x2), y1: Math.min(s.y1, s.y2), x2: Math.max(s.x1, s.x2), y2: Math.max(s.y1, s.y2) };
  const hw = s.kind === 'barrier' ? 0 : s.w / 2;
  return { x1: s.x - hw, y1: s.y1, x2: s.x + hw, y2: s.y2 };
}

/** PURE: distance from p to the segment a-b. */
export function distToSegment(p, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = dx * dx + dy * dy;
  const t = len ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len)) : 0;
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** PURE: how far a screen point is from a shape (0 inside a ladder or signpost). */
export function shapeDistance(s, p) {
  if (s.kind === 'platform') return distToSegment(p, { x: s.x1, y: s.y1 }, { x: s.x2, y: s.y2 });
  if (s.kind === 'barrier') return distToSegment(p, { x: s.x, y: s.y1 }, { x: s.x, y: s.y2 });
  const b = shapeBounds(s);
  const dx = Math.max(b.x1 - p.x, 0, p.x - b.x2);
  const dy = Math.max(b.y1 - p.y, 0, p.y - b.y2);
  return Math.hypot(dx, dy);
}

const RANK = Object.freeze({ platform: 0, barrier: 1, ladder: 2, signpost: 3 });

/**
 * PURE: the geometry under a screen point within `tol` px, best first: platforms win over the
 * rest (LocoDeco), then the nearest. Returns [{ kind, id, d }].
 */
export function geoHits(street, p, tol, kinds = GEO_KINDS) {
  const out = [];
  for (const { kind, id, item } of geoItems(street, kinds)) {
    const d = shapeDistance(geoShape(street, kind, item), p);
    if (d <= tol) out.push({ kind, id, d });
  }
  out.sort((a, b) => RANK[a.kind] - RANK[b.kind] || a.d - b.d);
  return out;
}

/** PURE: the keys of the geometry a screen rectangle (a marquee) meets. */
export function geoInRect(street, rect, kinds = GEO_KINDS) {
  const x1 = Math.min(rect.x1, rect.x2);
  const x2 = Math.max(rect.x1, rect.x2);
  const y1 = Math.min(rect.y1, rect.y2);
  const y2 = Math.max(rect.y1, rect.y2);
  return geoItems(street, kinds).filter(({ kind, item }) => {
    const b = shapeBounds(geoShape(street, kind, item));
    return b.x2 >= x1 && b.x1 <= x2 && b.y2 >= y1 && b.y1 <= y2;
  }).map(({ kind, id }) => geoKey(kind, id));
}

/** PURE: an item's handles in screen space ([{ id, x, y }]; a signpost's carry sx, sy). */
export function geoHandles(street, kind, item, zoom = 1) {
  const s = geoShape(street, kind, item);
  if (kind === 'platform') return [{ id: 'p1', x: s.x1, y: s.y1 }, { id: 'p2', x: s.x2, y: s.y2 }];
  if (kind === 'barrier') return [{ id: 'top', x: s.x, y: s.y1 }, { id: 'bottom', x: s.x, y: s.y2 }];
  if (kind === 'ladder') return [{ id: 'bottom', x: s.x, y: s.y2 }, { id: 'height', x: s.x, y: s.y1 }];
  return handlePoints(s.box, zoom).filter((h) => h.id !== 'rotate');
}

/** PURE: the world point a handle stands for (a line end, a wall end), for joining and snapping. */
export function handleWorld(kind, item, handle) {
  if (kind === 'platform') return handle === 'p1' ? { x: item.x1, y: item.y1 } : { x: item.x2, y: item.y2 };
  if (kind === 'barrier') return handle === 'top' ? { x: item.x, y: item.y } : { x: item.x, y: item.y + item.h };
  if (kind === 'ladder') return handle === 'bottom' ? { x: item.x, y: item.y } : { x: item.x, y: item.y - item.h };
  return { x: item.x, y: item.y };
}

/**
 * PURE: the fields a handle drag sets (world space, whole px). `from` and `to` are the pointer's
 * screen points at the start and now; `level` (Shift) puts a platform end at the other end's
 * height, or keeps a signpost's proportions.
 */
export function dragHandle(street, kind, item, handle, from, to, { level = false } = {}) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (kind === 'platform') {
    const [x, y, oy] = handle === 'p1' ? ['x1', 'y1', 'y2'] : ['x2', 'y2', 'y1'];
    return { [x]: r0(item[x] + dx), [y]: level ? item[oy] : r0(item[y] + dy) };
  }
  if (kind === 'barrier') {
    const bottom = item.y + item.h;
    if (handle === 'top') {
      const top = Math.min(r0(item.y + dy), bottom - MIN_H);
      return { y: top, h: bottom - top };
    }
    return { h: Math.max(MIN_H, r0(item.h + dy)) };
  }
  if (kind === 'ladder') {
    if (handle === 'height') return { h: Math.max(MIN_H, r0(item.h - dy)) };
    return { x: r0(item.x + dx), y: r0(item.y + dy) };
  }
  const box = postBox(street, item);
  const h = handlePoints(box).find((p) => p.id === handle);
  if (!h) return {};
  const next = resizeBy(street, MG, { x: item.x, y: item.y, w: box.w, h: box.h, r: 0 }, box, h, from, to, { keepAspect: level });
  return next;
}

/** PURE: the fields a move by (dx, dy) sets. */
export function moveBy(kind, item, dx, dy) {
  if (kind === 'platform') return { x1: r0(item.x1 + dx), y1: r0(item.y1 + dy), x2: r0(item.x2 + dx), y2: r0(item.y2 + dy) };
  return { x: r0(item.x + dx), y: r0(item.y + dy) };
}

/** PURE: only the fields of `set` that differ from `item`. */
export function changedFields(item, set) {
  const out = {};
  for (const [k, v] of Object.entries(set || {})) if (item[k] !== v) out[k] = v;
  return out;
}

/**
 * PURE: a new item from a draw-tool drag between screen points a and b (world space, no id: the
 * op gives it the next free one). Null when the drag is too short. New platforms are floors
 * (pc_perm and item_perm -1, as LocoDeco drew them), new walls hard both ways.
 */
export function drawnItem(street, kind, a, b, { level = false } = {}) {
  const { l, t } = street.bounds;
  if (kind === 'platform') {
    const end = { x: b.x, y: level ? a.y : b.y };
    if (Math.hypot(end.x - a.x, end.y - a.y) < MIN_DRAW) return null;
    // Left to right, as LocoDeco's healer saved lines.
    const [p, q] = a.x <= end.x ? [a, end] : [end, a];
    return { x1: r0(p.x + l), y1: r0(p.y + t), x2: r0(q.x + l), y2: r0(q.y + t), pc_perm: -1, item_perm: -1 };
  }
  const top = Math.min(a.y, b.y);
  const bottom = Math.max(a.y, b.y);
  if (kind === 'barrier') return bottom - top < MIN_DRAW ? null : { x: r0(a.x + l), y: r0(top + t), h: r0(bottom - top), pc_perm: null };
  if (kind === 'ladder') return bottom - top < MIN_DRAW ? null : { x: r0(a.x + l), y: r0(bottom + t), w: LADDER_W, h: r0(bottom - top) };
  if (Math.abs(b.x - a.x) < MIN_DRAW && bottom - top < MIN_DRAW) return null;
  return { x: r0((a.x + b.x) / 2 + l), y: r0(bottom + t), w: Math.max(40, r0(Math.abs(b.x - a.x))), h: Math.max(60, r0(bottom - top)), connects: [] };
}

/** PURE: a signpost placed by a click: on the floor under the point (Hechey Track's size). */
export function postOnFloor(street, p) {
  const spot = floorUnder(platformsScreen(street), p.x, p.y, isStandable) || { x: Math.round(p.x), y: Math.round(p.y) };
  return { x: r0(spot.x + street.bounds.l), y: r0(spot.y + street.bounds.t), w: POST_W, h: POST_H, connects: [] };
}

/** PURE: a default item of a kind standing at a screen point (the inspector's Add buttons). */
export function defaultItem(street, kind, p) {
  const spot = floorUnder(platformsScreen(street), p.x, p.y, isStandable) || { x: p.x, y: p.y };
  if (kind === 'platform') return drawnItem(street, kind, { x: spot.x - 100, y: spot.y - 120 }, { x: spot.x + 100, y: spot.y - 120 });
  if (kind === 'barrier') return drawnItem(street, kind, { x: spot.x, y: spot.y - 200 }, { x: spot.x, y: spot.y });
  if (kind === 'ladder') return drawnItem(street, kind, { x: spot.x, y: spot.y - 300 }, { x: spot.x, y: spot.y });
  return postOnFloor(street, p);
}

// —— Permeability (spec 3.3 PropertiesPanel; street-model.js isStandable, barriersScreen) ——

/** The four perms with LocoDeco's names. A platform's meaning, then a wall's. */
export const PERMS = Object.freeze([
  Object.freeze({ value: -1, key: '-1', label: 'Floor', line: 'stand on it, jump up through it', wall: 'blocks from the left only' }),
  Object.freeze({ value: 1, key: '1', label: 'Roof', line: 'solid from below only', wall: 'blocks from the right only' }),
  Object.freeze({ value: 0, key: '0', label: 'Soft', line: 'no collider: walk and fall through', wall: 'open: does not block' }),
  Object.freeze({ value: null, key: 'null', label: 'Hard', line: 'solid both ways', wall: 'blocks both ways' }),
]);

/** PURE: a perm's select key ('-1', '1', '0', 'null'; '' when the field is not there). */
export function permKey(v) {
  if (v === undefined) return '';
  if (v === null) return 'null';
  return String(v);
}

/** PURE: a select key back to a perm (undefined for ''). */
export function permValue(key) {
  if (key === 'null') return null;
  if (key === '-1' || key === '1' || key === '0') return Number(key);
  return undefined;
}

/** PURE: the name a line or wall is drawn and listed by. */
export function permName(v) {
  return PERMS.find((p) => p.value === (v === undefined ? -1 : v))?.label || 'Floor';
}

/** PURE: which sides a wall blocks (barriersScreen): { left, right } (left: walking right into it). */
export function wallSides(perm) {
  if (perm === 0) return { left: false, right: false };
  return { left: perm !== 1, right: perm !== -1 };
}

/** PURE: a dashed line as segments [[x1, y1, x2, y2], ...] (Pixi has no dash). */
export function dashes(x1, y1, x2, y2, on = 8, off = 6) {
  const len = Math.hypot(x2 - x1, y2 - y1);
  if (!(len > 0) || !(on > 0)) return [];
  const ux = (x2 - x1) / len;
  const uy = (y2 - y1) / len;
  const out = [];
  for (let d = 0; d < len; d += on + off) {
    const e = Math.min(len, d + on);
    out.push([x1 + ux * d, y1 + uy * d, x1 + ux * e, y1 + uy * e]);
    if (out.length > 4000) break;
  }
  return out;
}

// —— Signpost arms (spec 2.1; build-street-navigation.mjs, location-navigation.js) ——

/**
 * PURE: where an arm to `target` sets the player down, as build-street-navigation.mjs works it
 * out: in the target's screen space, on the nearest platform within 80 px of the target's
 * signpost that links back to `fromTsid`. Null when no post links back or no floor is near it
 * (then the arm carries no `arrive`).
 */
export function arriveFor(target, fromTsid) {
  const back = new Set(streetAliases(fromTsid));
  for (const post of target?.signposts || []) {
    if (!(post.connects || []).some((c) => back.has(c.tsid))) continue;
    const r = arrivalInTarget(target, post.x, post.y);
    if (r?.snapped) return { x: r.x, y: r.y };
  }
  return null;
}

/** PURE: a new arm: the target's label (48 characters at most), its hub, and the arrival if known. */
export function newConnect({ tsid, label, hubId = '', arrive = null }) {
  const c = { tsid, label: String(label || tsid).slice(0, 48) };
  if (/^[0-9]{1,4}$/.test(String(hubId || ''))) c.hub_id = String(hubId);
  if (arrive && Number.isFinite(arrive.x) && Number.isFinite(arrive.y)) c.arrive = { x: Math.round(arrive.x), y: Math.round(arrive.y) };
  return c;
}
