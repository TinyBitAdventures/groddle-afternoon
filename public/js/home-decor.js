/**
 * House interior decorating rules (pure: no Pixi, no DOM).
 *
 * Sources (tinyspeck/glitch-GameServerJS, CC0):
 * - players/inc_furniture.js   private furniture storage, furniture_populate starter
 *                              kit, furniture_pickup (storage bags must be empty),
 *                              wall / floor / ceiling swatch ownership
 * - items/furniture_*.js       placement_set (chair / bookshelf / wall / ceiling /
 *                              rug / front), can_flip, facing_right instance prop
 * - items/bag_furniture_sdb.js Storage Display Box: one item class, shown off
 * - locations/inc_homes.js     homes_get_expand_costs: one Wall Segment per floor
 *                              for each extra wall segment, up to MAX_WALL_SEGMENTS
 * - config_base.js             home_limits START/MIN/MAX_WALL_SEGMENTS, start textures
 *
 * - locations/inc_homes.js     homes_rebuild_floor geometry (150 px segments,
 *                              floor / wall / ceiling bands, end walls at 76 px),
 *                              per-segment wallpaper (homes_set_wp), homes_extend
 * - locations/tower.js         tower_build_floor: 145 px elevator offset, six
 *                              wall segments and a right end, 28 px frames
 * - locations/inc_geo_builder.js geo_builder_room_plats (122-182): the placement
 *                              plats per userdeco set (ceiling, wall, bookshelf,
 *                              chair, rug, front), from the room's start_x / end_x
 *                              (tower.js 455-458; inc_homes.js 1497-1563 for houses)
 * - glitch-client HandOfDecorator.as 1144-1149: a piece snaps onto its plat with
 *                              its half width kept inside the plat's ends
 *
 * Remake decisions:
 * - The house interior is one floor. Wall segments are the source 150 px; the
 *   room starts at the source START_WALL_SEGMENTS (7, including end caps) and
 *   grows by one segment per Wall Segment up to MAX_WALL_SEGMENTS (20).
 * - Wallpaper is kept per wall segment like the source (`walls`, end caps
 *   included); `wall` is the paper last applied to the whole room. Floor and
 *   ceiling are one swatch per floor.
 * - Wallpaper, floor and ceiling swatches cost credits (real money) in the
 *   source. The remake has no credits, so every visible swatch is free to apply.
 * - Saves from before the 150 px geometry (no `geo`) have their furniture
 *   spread onto the narrower room in proportion.
 * - Furniture upgrades (G358, js/furniture-upgrades.js): a piece keeps its
 *   `upgradeId` and `upgradeHistory` (the source's upgrade_id and
 *   upgrade_history instance props) when placed, moved, picked up and placed
 *   again. Stored upgraded pieces are listed in `styles[class]`, a part of
 *   `storage[class]` (the count stays per class, so the ledger sees the class).
 *   Sizes and tabletop surfaces follow the upgrade's art.
 * - Glitch furniture never rotated; it faces left or right (`facing_right`).
 */

import {
  FURNITURE_CATALOG,
  FURNITURE_STARTER_KIT,
  HOME_LIMITS,
  HOME_TEXTURE_CONFIGS,
} from './homes-catalog.js?v=29713fa8';
import { cleanHistory, cleanUpgradeId, upgradeArt, upgradeRow } from './furniture-upgrades.js?v=c4ee77ed';

export const SEGMENT_W = 150;
/** Room geometry version stored with the house (2 = source 150 px segments). */
export const DECOR_GEO = 2;
/**
 * Interior geometry in world pixels (inc_homes.js homes_rebuild_floor, relative to
 * the floor platform at floorY): floor band 65 px behind and 43 px in front of the
 * walk line, a 300 px wall above it, the 63 px ceiling band, the ceiling platform
 * 413 px up, and the side walls 76 px inside each end segment.
 */
export const INTERIOR = Object.freeze({
  floorY: 620,
  wallTop: 620 - 365,
  ceilingY: 620 - 413,
  ceilingTop: 620 - 428,
  floorFront: 620 + 43,
  endCapW: 76,
  wallMarginTop: 14,
  wallMarginBottom: 22,
});
/** tower.js tower_get_geo_config / tower_get_bounds: one tower floor. */
export const TOWER_ROOM = Object.freeze({
  wallSegments: 6,
  leftOffset: 145,
  frameHeight: 28,
  width: 145 + (6 + 1) * 150 - 17,
  /** floor_start (the elevator side) and floor_end platforms. */
  innerLeft: 130,
  innerRight: 145 + (6 + 1) * 150 - 17 - 76,
});
/**
 * geo_builder_room_plats: each placement plat runs from start_x + inset to
 * end_x - inset (ceiling / wall pulled in 10 px, bookshelf on the room, chair,
 * front and rug pushed out 10 / 20 / 42 px).
 */
export const PLACEMENT_INSET = Object.freeze({ ceiling: 10, wall: 10, bookshelf: 0, chair: -10, rug: -42, front: -20 });
/** The plat a slot falls back to when a class names no known set. */
const SLOT_PLAT = Object.freeze({ ceiling: 'ceiling', wall: 'wall', rug: 'rug', floor: 'bookshelf' });
/** The pre-G7 geometry, for migrating old saves. */
const OLD_GEO = Object.freeze({ segmentW: 200, endCapW: 56, towerW: 1200 });

export const TEXTURE_KINDS = Object.freeze(['wall', 'floor', 'ceiling']);
const TEXTURE_CONFIG_KEY = { wall: 'walls', floor: 'floors', ceiling: 'ceilings' };
const MAX_PLACED = 160;
const MAX_STORAGE_STACK = 999;

export function furnitureDef(classTsid) {
  return FURNITURE_CATALOG[classTsid] || null;
}

export function isFurniture(classTsid) {
  return Boolean(FURNITURE_CATALOG[classTsid]);
}

/** Display scale: only ever shrinks oversized recovered frames (Fireplace). */
export function furnitureScale(classTsid) {
  return Math.min(1, Number(furnitureDef(classTsid)?.scale) || 1);
}

/** Drawn size; an upgraded piece (G358) is its upgrade's frame at 1:1. */
export function furnitureSize(classTsid, upgradeId = '') {
  const def = furnitureDef(classTsid);
  if (!def) return { w: 0, h: 0 };
  const art = upgradeArt(classTsid, upgradeId);
  if (art) return { w: art.w, h: art.h };
  const s = furnitureScale(classTsid);
  return { w: Math.round(def.art.w * s), h: Math.round(def.art.h * s) };
}

/** Display scale of a piece: upgrade frames are drawn 1:1. */
export function pieceScale(classTsid, upgradeId = '') {
  return upgradeArt(classTsid, upgradeId) ? 1 : furnitureScale(classTsid);
}

/** The art a piece draws: { path, w, h } of its upgrade, else the class frame. */
export function pieceArt(classTsid, upgradeId = '') {
  return upgradeArt(classTsid, upgradeId) || furnitureDef(classTsid)?.art || null;
}

/**
 * Height above the foot where tabletop decor rests, or 0 for no surface. An
 * upgrade uses its highest catalog plat over the middle when that sits on the
 * art, else the class's surface in proportion to the art's height.
 */
export function surfaceHeight(classTsid, upgradeId = '') {
  const def = furnitureDef(classTsid);
  if (!def?.surface) return 0;
  const art = upgradeArt(classTsid, upgradeId);
  if (art) {
    const plat = upgradeRow(classTsid, upgradeId)?.platY;
    // Tops drawn in three-quarter view put the source plat mid-surface (about half the height).
    if (plat && plat <= art.h + 4 && plat >= art.h * 0.2) return plat;
    return Math.round(def.surface * (art.h / def.art.h));
  }
  return Math.round(def.surface * furnitureScale(classTsid));
}

function finite(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function cleanKey(value) {
  return String(value || '').replace(/[^a-z0-9_]/gi, '').slice(0, 64);
}

function textureOk(kind, key) {
  return Boolean(HOME_TEXTURE_CONFIGS[TEXTURE_CONFIG_KEY[kind]]?.[key]);
}

export function textureConfig(kind, key) {
  return HOME_TEXTURE_CONFIGS[TEXTURE_CONFIG_KEY[kind]]?.[key] || null;
}

export function listTextures(kind) {
  const all = Object.values(HOME_TEXTURE_CONFIGS[TEXTURE_CONFIG_KEY[kind]] || {});
  return all.sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
}

export function defaultTexture(kind) {
  return {
    wall: HOME_LIMITS.START_TEXTURE_WALL,
    floor: HOME_LIMITS.START_TEXTURE_FLOOR,
    ceiling: HOME_LIMITS.START_TEXTURE_CEILING,
  }[kind];
}

function normalizePlaced(row) {
  const classTsid = cleanKey(row?.classTsid);
  const def = furnitureDef(classTsid);
  if (!def) return null;
  const out = {
    id: Math.max(1, Math.floor(finite(row?.id, 0))),
    classTsid,
    slot: def.slot,
    x: Math.round(finite(row?.x, 400)),
    y: Math.round(finite(row?.y, INTERIOR.floorY)),
    facingRight: row?.facingRight !== false,
    z: Math.round(finite(row?.z, 0)),
    on: Number.isFinite(Number(row?.on)) && Number(row.on) > 0 ? Math.floor(Number(row.on)) : null,
  };
  copyStyle(row, out);
  if (classTsid === 'bag_furniture_sdb' && row?.display?.classTsid) {
    const count = Math.max(0, Math.min(1_000_000, Math.floor(finite(row.display.count, 0))));
    if (count > 0) out.display = { classTsid: cleanKey(row.display.classTsid), count };
  }
  return out;
}

/** G358: copy a piece's upgrade (upgrade_id, upgrade_history) onto `to`, cleaned. */
function copyStyle(from, to) {
  const id = cleanUpgradeId(to.classTsid, from?.upgradeId);
  const history = cleanHistory(from?.upgradeHistory);
  if (id) to.upgradeId = id;
  else delete to.upgradeId;
  if (history.length) to.upgradeHistory = history;
  else delete to.upgradeHistory;
  return to;
}

/** A stored piece that carries an upgrade or its history. */
function isStyled(row) {
  return Boolean(row?.upgradeId || row?.upgradeHistory?.length);
}

/**
 * Upgraded pieces in storage for one class (G358), never more than the class's
 * stored count: whatever took pieces out of `storage` without this module
 * takes them from the end of the list.
 */
export function storedStyles(state, classTsid) {
  if (!state.styles || typeof state.styles !== 'object') state.styles = {};
  const list = Array.isArray(state.styles[classTsid]) ? state.styles[classTsid] : [];
  const n = Math.max(0, Math.floor(finite(state.storage?.[classTsid], 0)));
  if (list.length > n) list.length = n;
  if (list.length) state.styles[classTsid] = list;
  else delete state.styles[classTsid];
  return list;
}

function normalizeStyles(seed, storage) {
  const out = {};
  for (const [cls, rows] of Object.entries(seed && typeof seed === 'object' ? seed : {})) {
    const key = cleanKey(cls);
    if (!isFurniture(key) || !Array.isArray(rows)) continue;
    const list = rows.slice(0, storage[key] || 0)
      .map((row) => copyStyle(row, { classTsid: key }))
      .filter(isStyled)
      .map(({ classTsid, ...rest }) => rest);
    if (list.length) out[key] = list;
  }
  return out;
}

export function normalizeHomeDecorState(seed = {}) {
  const storage = {};
  for (const [cls, n] of Object.entries(seed?.storage || {})) {
    const key = cleanKey(cls);
    const count = Math.max(0, Math.min(MAX_STORAGE_STACK, Math.floor(finite(n, 0))));
    if (isFurniture(key) && count > 0) storage[key] = count;
  }
  const placed = [];
  const seen = new Set();
  for (const row of Array.isArray(seed?.placed) ? seed.placed : []) {
    const item = normalizePlaced(row);
    if (!item || seen.has(item.id)) continue;
    seen.add(item.id);
    placed.push(item);
    if (placed.length >= MAX_PLACED) break;
  }
  for (const item of placed) if (item.on && !seen.has(item.on)) item.on = null;
  const maxId = placed.reduce((m, p) => Math.max(m, p.id), 0);
  const wallSegments = Math.max(
    HOME_LIMITS.MIN_WALL_SEGMENTS,
    Math.min(HOME_LIMITS.MAX_WALL_SEGMENTS, Math.floor(finite(seed?.wallSegments, HOME_LIMITS.START_WALL_SEGMENTS)))
  );
  const out = {
    geo: DECOR_GEO,
    layout: seed?.layout === 'tower' ? 'tower' : 'house',
    starterKit: seed?.starterKit === true,
    storage,
    placed,
    nextId: Math.max(maxId + 1, Math.floor(finite(seed?.nextId, 1))),
    wallSegments,
  };
  const styles = normalizeStyles(seed?.styles, storage);
  if (Object.keys(styles).length) out.styles = styles;
  for (const kind of TEXTURE_KINDS) {
    const key = cleanKey(seed?.[kind]);
    out[kind] = textureOk(kind, key) ? key : defaultTexture(kind);
  }
  const slots = wallSlots(out);
  let walls = (Array.isArray(seed?.walls) ? seed.walls : []).slice(0, 64).map((key) => (textureOk('wall', cleanKey(key)) ? cleanKey(key) : out.wall));
  if (!walls.length) walls = Array(slots).fill(out.wall);
  // Like homes_extend / homes_unexpand: segments come and go before the right end cap.
  while (walls.length < slots) walls.splice(walls.length - 1, 0, walls[Math.max(0, walls.length - 2)]);
  if (walls.length > slots) walls = [...walls.slice(0, slots - 1), walls[walls.length - 1]];
  out.walls = walls;
  fitPlacements(out, Number(seed?.geo) === DECOR_GEO ? null : seed);
  return out;
}

/** Wallpaper slots: every segment including both end caps (house), or six walls and the right end (tower). */
export function wallSlots(state) {
  return state?.layout === 'tower' ? TOWER_ROOM.wallSegments + 1 : state?.wallSegments || HOME_LIMITS.START_WALL_SEGMENTS;
}

/**
 * Keep placed furniture on its placement plats. Saves from the old 200 px
 * geometry are spread onto the new floor in proportion; ceiling pieces hang
 * from the ceiling platform and wall pieces stay on the wall.
 */
function fitPlacements(state, legacy) {
  const { left, right, width } = interiorBounds(state);
  let mapX = (x) => x;
  if (legacy && state.placed.length) {
    const oldW = state.layout === 'tower' ? OLD_GEO.towerW : state.wallSegments * OLD_GEO.segmentW;
    const oldL = OLD_GEO.endCapW;
    const oldR = oldW - OLD_GEO.endCapW;
    mapX = (x) => left + ((x - oldL) / (oldR - oldL)) * (right - left);
  }
  const byId = new Map(state.placed.map((row) => [row.id, row]));
  const hosts = state.placed.filter((row) => !row.on || !byId.has(row.on));
  const moved = new Map();
  for (const row of hosts) {
    const before = { x: row.x, y: row.y };
    row.x = horizontalClamp(state, row.classTsid, mapX(row.x), row.upgradeId);
    if (row.slot === 'ceiling') row.y = INTERIOR.ceilingY;
    else if (row.slot === 'wall') {
      const h = furnitureSize(row.classTsid, row.upgradeId).h;
      const top = INTERIOR.wallTop + INTERIOR.wallMarginTop + h;
      const bottom = INTERIOR.floorY - INTERIOR.wallMarginBottom;
      row.y = Math.round(Math.max(top, Math.min(bottom, row.y)));
    }
    moved.set(row.id, { dx: row.x - before.x, dy: row.y - before.y });
  }
  // Tabletop decor follows its host.
  for (let pass = 0; pass < 4; pass += 1) {
    for (const row of state.placed) {
      if (!row.on || moved.has(row.id) || !moved.has(row.on)) continue;
      const d = moved.get(row.on);
      row.x += d.dx;
      row.y += d.dy;
      moved.set(row.id, d);
    }
  }
  return width;
}

export function createHomeDecorState(seed = {}) {
  return normalizeHomeDecorState(seed);
}

export function interiorWidth(state) {
  if (state?.layout === 'tower') return TOWER_ROOM.width;
  return Math.max(HOME_LIMITS.MIN_WALL_SEGMENTS, state?.wallSegments || HOME_LIMITS.START_WALL_SEGMENTS) * SEGMENT_W;
}

/** Inner floor span (between the side walls; the tower's left side is the elevator). */
export function interiorBounds(state) {
  const width = interiorWidth(state);
  if (state?.layout === 'tower') return { left: TOWER_ROOM.innerLeft, right: TOWER_ROOM.innerRight, width };
  return { left: INTERIOR.endCapW, right: width - INTERIOR.endCapW, width };
}

/**
 * players/inc_furniture.js furniture_populate: a new owner receives the starter
 * set once, into private furniture storage.
 */
export function grantStarterKit(state) {
  if (state.starterKit) return {};
  const granted = {};
  for (const [cls, qty] of Object.entries(FURNITURE_STARTER_KIT)) {
    if (!isFurniture(cls)) continue;
    state.storage[cls] = (state.storage[cls] || 0) + qty;
    granted[cls] = qty;
  }
  state.starterKit = true;
  return granted;
}

/**
 * Furniture the player can place: private storage plus furniture in the pack.
 * Upgraded pieces in storage (G358) get a row each, with `style` (their index
 * in `styles[class]`), `upgradeId` and the upgrade's name.
 */
export function listPlaceable(state, inv = {}) {
  const out = [];
  for (const def of Object.values(FURNITURE_CATALOG)) {
    const styles = storedStyles(state, def.classTsid);
    const stored = Math.max(0, (state.storage[def.classTsid] || 0) - styles.length);
    const packed = Math.max(0, Math.floor(finite(inv?.[def.classTsid], 0)));
    styles.forEach((row, style) => {
      const upgradeId = cleanUpgradeId(def.classTsid, row.upgradeId);
      const label = upgradeRow(def.classTsid, upgradeId)?.name || def.label;
      out.push({ classTsid: def.classTsid, label, slot: def.slot, stored: 1, packed: 0, total: 1, style, upgradeId });
    });
    if (stored + packed < 1) continue;
    out.push({ classTsid: def.classTsid, label: def.label, slot: def.slot, stored, packed, total: stored + packed });
  }
  return out.sort((a, b) => a.slot.localeCompare(b.slot) || a.label.localeCompare(b.label) || (a.style ?? -1) - (b.style ?? -1));
}

function itemById(state, id) {
  return state.placed.find((row) => row.id === Number(id)) || null;
}

export function placedItem(state, id) {
  return itemById(state, id);
}

/**
 * The room's placement-plat start_x / end_x. Tower: tower.js 455-456
 * (left_offset + 32, left_offset + 6 x 150: 177 and 1045, clear of the
 * elevator column). House: inc_homes.js 1497-1498, the wall segments between
 * the two 150 px end caps (150 and width - 150).
 */
export function placementRoom(state) {
  if (state?.layout === 'tower') {
    return { start: TOWER_ROOM.leftOffset + 32, end: TOWER_ROOM.leftOffset + TOWER_ROOM.wallSegments * SEGMENT_W };
  }
  return { start: SEGMENT_W, end: interiorWidth(state) - SEGMENT_W };
}

/**
 * Where a piece may stand: the widest of the plats its placement_set names
 * (the client looks for the closest plat that can hold the class).
 */
export function placementSpan(state, classTsid) {
  const room = placementRoom(state);
  const def = furnitureDef(classTsid);
  const sets = (def?.placementSet || []).filter((set) => set in PLACEMENT_INSET);
  if (!sets.length) sets.push(SLOT_PLAT[def?.slot] || 'bookshelf');
  return {
    left: Math.min(...sets.map((set) => room.start + PLACEMENT_INSET[set])),
    right: Math.max(...sets.map((set) => room.end - PLACEMENT_INSET[set])),
  };
}

function horizontalClamp(state, classTsid, x, upgradeId = '') {
  const { left, right } = placementSpan(state, classTsid);
  // HandOfDecorator: half_width_it_takes = Math.ceil(width / 2).
  const half = Math.ceil(furnitureSize(classTsid, upgradeId).w / 2);
  return Math.round(Math.max(left + half, Math.min(right - half, finite(x, left + half))));
}

/** The surface-bearing piece under x (for tabletop decor), topmost first. */
export function surfaceUnder(state, x, excludeId = null) {
  let best = null;
  for (const row of state.placed) {
    if (row.id === excludeId || row.slot === 'wall' || row.slot === 'ceiling' || row.slot === 'rug') continue;
    const h = surfaceHeight(row.classTsid, row.upgradeId);
    if (!h) continue;
    const half = furnitureSize(row.classTsid, row.upgradeId).w / 2 - 6;
    if (Math.abs(x - row.x) > half) continue;
    if (!best || row.z > best.z) best = row;
  }
  return best;
}

/**
 * Snap a requested point to the slot rules. Positions are the foot point
 * (bottom-center) for floor, rug, tabletop and wall pieces, and the hanging
 * point (top-center) for ceiling pieces.
 */
export function snapPlacement(state, classTsid, at = {}, excludeId = null, upgradeId = '') {
  const def = furnitureDef(classTsid);
  if (!def) return null;
  const x = horizontalClamp(state, classTsid, at.x, upgradeId);
  const { h } = furnitureSize(classTsid, upgradeId);
  if (def.slot === 'wall') {
    const top = INTERIOR.wallTop + INTERIOR.wallMarginTop + h;
    const bottom = INTERIOR.floorY - INTERIOR.wallMarginBottom;
    const y = Math.round(Math.max(top, Math.min(bottom, finite(at.y, (top + bottom) / 2))));
    return { x, y, slot: 'wall', on: null };
  }
  if (def.slot === 'ceiling') return { x, y: INTERIOR.ceilingY, slot: 'ceiling', on: null };
  if (def.slot === 'rug') return { x, y: INTERIOR.floorY + 18, slot: 'rug', on: null };
  if (def.tabletop) {
    const host = surfaceUnder(state, x, excludeId);
    if (host && host.id !== excludeId) {
      return { x, y: host.y - surfaceHeight(host.classTsid, host.upgradeId), slot: 'floor', on: host.id };
    }
  }
  return { x, y: INTERIOR.floorY, slot: 'floor', on: null };
}

function topZ(state) {
  return state.placed.reduce((m, row) => Math.max(m, row.z), 0);
}

/**
 * Place one piece from storage (preferred) or the pack.
 * @returns {{ ok: boolean, reason?: string, msg?: string, item?: object, from?: string }}
 */
export function placeFurniture(state, inv, classTsid, at = {}, opts = {}) {
  const def = furnitureDef(classTsid);
  if (!def) return { ok: false, reason: 'not_furniture', msg: "That isn't furniture." };
  if (state.placed.length >= MAX_PLACED) return { ok: false, reason: 'full', msg: 'Your house is full of furniture already.' };
  const stored = state.storage[classTsid] || 0;
  const packed = Math.max(0, Math.floor(finite(inv?.[classTsid], 0)));
  // G358: `opts.style` picks an upgraded piece from storage; otherwise a plain one goes first.
  const styles = storedStyles(state, classTsid);
  const styleAt = Number.isInteger(opts.style) && opts.style >= 0 && opts.style < styles.length ? opts.style : null;
  const plain = stored - styles.length;
  const from = styleAt != null ? 'storage'
    : opts.from === 'pack' ? (packed ? 'pack' : null) : plain > 0 || (stored && !packed) ? 'storage' : packed ? 'pack' : null;
  if (!from) return { ok: false, reason: 'none', msg: `You don't have a ${def.label} to place.` };
  const style = from === 'storage' ? (styleAt != null ? styles[styleAt] : plain > 0 ? null : styles[0]) : null;
  const snapped = snapPlacement(state, classTsid, at, null, cleanUpgradeId(classTsid, style?.upgradeId));
  if (from === 'storage') {
    if (style) styles.splice(styles.indexOf(style), 1);
    state.storage[classTsid] = stored - 1;
    if (state.storage[classTsid] <= 0) delete state.storage[classTsid];
    storedStyles(state, classTsid);
  } else {
    inv[classTsid] = packed - 1;
  }
  const item = {
    id: state.nextId++,
    classTsid,
    slot: snapped.slot,
    x: snapped.x,
    y: snapped.y,
    facingRight: opts.facingRight !== false,
    z: topZ(state) + 1,
    on: snapped.on,
  };
  if (style) copyStyle(style, item);
  state.placed.push(item);
  return { ok: true, item, from };
}

/** Pieces resting on `id` (tabletop decor), recursively. */
export function riders(state, id) {
  const out = [];
  const walk = (parent) => {
    for (const row of state.placed) {
      if (row.on === parent) {
        out.push(row);
        walk(row.id);
      }
    }
  };
  walk(Number(id));
  return out;
}

export function moveFurniture(state, id, at = {}) {
  const item = itemById(state, id);
  if (!item) return { ok: false, reason: 'missing' };
  const snapped = snapPlacement(state, item.classTsid, at, item.id, item.upgradeId);
  const dx = snapped.x - item.x;
  const dy = snapped.y - item.y;
  item.x = snapped.x;
  item.y = snapped.y;
  item.on = snapped.on;
  for (const rider of riders(state, item.id)) {
    rider.x += dx;
    rider.y += dy;
  }
  return { ok: true, item };
}

export function flipFurniture(state, id) {
  const item = itemById(state, id);
  if (!item) return { ok: false, reason: 'missing' };
  if (!furnitureDef(item.classTsid).canFlip) {
    return { ok: false, reason: 'cannot_flip', msg: `A ${furnitureDef(item.classTsid).label} only faces one way.` };
  }
  item.facingRight = !item.facingRight;
  return { ok: true, item };
}

/** Bring a piece in front of everything else (or behind, with `back`). */
export function restackFurniture(state, id, back = false) {
  const item = itemById(state, id);
  if (!item) return { ok: false, reason: 'missing' };
  const zs = state.placed.map((row) => row.z);
  item.z = back ? Math.min(...zs) - 1 : Math.max(...zs) + 1;
  return { ok: true, item };
}

/**
 * furniture_pickup: the piece (and anything resting on it) returns to private
 * furniture storage. A storage bag that still holds things cannot be picked up.
 */
export function pickUpFurniture(state, id) {
  const item = itemById(state, id);
  if (!item) return { ok: false, reason: 'missing' };
  const lifted = [item, ...riders(state, item.id)];
  const full = lifted.find((row) => row.display?.count > 0);
  if (full) {
    return { ok: false, reason: 'not_empty', msg: "You can't pick that up. Empty the Storage Display Box first." };
  }
  const ids = new Set(lifted.map((row) => row.id));
  state.placed = state.placed.filter((row) => !ids.has(row.id));
  for (const row of lifted) {
    // G358: an upgraded piece keeps its upgrade in storage (furniture_pickup moves the stack, props and all).
    const styles = storedStyles(state, row.classTsid);
    state.storage[row.classTsid] = (state.storage[row.classTsid] || 0) + 1;
    if (isStyled(row)) {
      const { classTsid, ...style } = copyStyle(row, { classTsid: row.classTsid });
      styles.push(style);
      state.styles[row.classTsid] = styles;
    }
  }
  return { ok: true, lifted: lifted.map((row) => row.classTsid), pieces: lifted.map((row) => ({ classTsid: row.classTsid, upgradeId: row.upgradeId || '' })) };
}

/**
 * Apply a swatch. Floors and ceilings take one per floor (homes_set_floor /
 * homes_set_ceiling). Wallpaper goes on the whole room, or with `segment` on one
 * wall segment (the client's HandOfDecorator: dropping a swatch in the middle of
 * a segment papers that segment, anywhere else on the wall papers the room).
 */
export function setHomeTexture(state, kind, key, { segment = null } = {}) {
  if (!TEXTURE_KINDS.includes(kind)) return { ok: false, reason: 'bad_kind' };
  if (!textureOk(kind, key)) return { ok: false, reason: 'unknown', msg: 'That swatch is not available.' };
  const name = textureConfig(kind, key).name;
  if (kind === 'wall') {
    const slots = wallSlots(state);
    if (!Array.isArray(state.walls) || state.walls.length !== slots) state.walls = Array(slots).fill(state.wall);
    if (segment != null) {
      const i = Math.floor(Number(segment));
      if (!Number.isFinite(i) || i < 0 || i >= slots) return { ok: false, reason: 'bad_segment' };
      if (state.walls[i] === key) return { ok: false, reason: 'same' };
      state.walls[i] = key;
      if (state.walls.every((row) => row === key)) state.wall = key;
      return { ok: true, key, name, segment: i };
    }
    if (state.wall === key && state.walls.every((row) => row === key)) return { ok: false, reason: 'same' };
    state.wall = key;
    state.walls = Array(slots).fill(key);
    return { ok: true, key, name };
  }
  if (state[kind] === key) return { ok: false, reason: 'same' };
  state[kind] = key;
  return { ok: true, key, name };
}

/**
 * locations/inc_homes.js homes_get_expand_costs (one floor): each new wall
 * segment takes `num_floors` Wall Segments, and the room stops at
 * MAX_WALL_SEGMENTS.
 */
export function quoteInteriorExpansion(state, inv = {}) {
  const remaining = HOME_LIMITS.MAX_WALL_SEGMENTS - state.wallSegments;
  const items = { wall_segment: 1 };
  if (remaining <= 0) return { ok: false, reason: 'max', remaining: 0, items, msg: 'Your house is as wide as a house can be.' };
  const have = Math.max(0, Math.floor(finite(inv?.wall_segment, 0)));
  if (have < items.wall_segment) {
    return { ok: false, reason: 'need_items', remaining, items, msg: 'Expanding a wall takes one Wall Segment.' };
  }
  return { ok: true, remaining, items };
}

export function expandInterior(state, inv = {}) {
  const quote = quoteInteriorExpansion(state, inv);
  if (!quote.ok) return quote;
  inv.wall_segment -= quote.items.wall_segment;
  state.wallSegments += 1;
  // homes_extend: the new segment repeats the last wall before the right end cap.
  if (Array.isArray(state.walls) && state.walls.length >= 2) {
    state.walls.splice(state.walls.length - 1, 0, state.walls[state.walls.length - 2]);
  }
  return { ok: true, wallSegments: state.wallSegments, width: interiorWidth(state) };
}

/**
 * locations/inc_homes.js homes_get_expand_costs `unexpand` (2012-03-30, one
 * floor): wall segments past MIN_WALL_SEGMENTS can come off again, and each
 * refunds the parts it was built from. The refund steps with the segment so a
 * full set of four gives the beams and the girder back:
 *   segs = count - (START - MIN), raised by 4 until >= 0
 *   2 Wood Posts and 6 Boards per floor, 8 Barnacle Talc on even segs (else 7),
 *   a Beam on even segs, a Girder every fourth.
 */
export const UNEXPAND_TEXT = Object.freeze({
  button: 'Un-expand',
  title: 'Un-expand your house',
  body: 'Un-expanding will remove one expansion from the right side of your house, making your house narrower by one wall segment.',
  refund: 'You’ll be refunded the following materials:',
  confirmTitle: 'Un-expand your house?',
  confirm: "Are you sure you want to un-expand? Your stuff will automatically move over, don't worry.",
  yes: 'Yes. Un-expand it!',
  no: 'Nevermind',
  min: 'Your house is already sooo small!',
});

export function quoteInteriorUnexpand(state) {
  const inner = Math.max(0, Math.floor(finite(state?.wallSegments, HOME_LIMITS.START_WALL_SEGMENTS)) - 2);
  const count = state?.layout === 'tower' ? 0 : Math.max(0, inner - (HOME_LIMITS.MIN_WALL_SEGMENTS - 2));
  if (!count) return { ok: false, reason: 'min', count: 0, items: {}, msg: UNEXPAND_TEXT.min };
  let segs = count - (HOME_LIMITS.START_WALL_SEGMENTS - HOME_LIMITS.MIN_WALL_SEGMENTS);
  while (segs < 0) segs += 4;
  const floors = 1;
  const items = {
    wood_post: floors * 2,
    board: floors * 6,
    barnacle_talc: floors * (segs % 2 === 0 ? 8 : 7),
  };
  if (segs % 2 === 0) items.beam = floors;
  if (segs % 4 === 0) items.girder = floors;
  return { ok: true, count, items };
}

/**
 * homes_unexpand: the last wall segment before the right end cap goes (its
 * wallpaper with it: the second-to-last swatch is dropped), and everything
 * standing in the last 300 px moves 150 px left. Returns the refund.
 */
export function unexpandInterior(state, inv = {}) {
  const quote = quoteInteriorUnexpand(state);
  if (!quote.ok) return quote;
  const edge = interiorWidth(state) - 300;
  state.wallSegments -= 1;
  if (Array.isArray(state.walls) && state.walls.length >= 2) {
    const last = state.walls.pop();
    state.walls[state.walls.length - 1] = last;
  }
  const moved = [];
  for (const row of state.placed) {
    if (row.x >= edge) {
      row.x -= SEGMENT_W;
      moved.push(row.id);
    }
  }
  fitPlacements(state, null);
  for (const [cls, n] of Object.entries(quote.items)) inv[cls] = (Number(inv[cls]) || 0) + n;
  return { ok: true, wallSegments: state.wallSegments, width: interiorWidth(state), items: { ...quote.items }, moved, edge };
}

/** Storage Display Box: deposit pack items of one class (bag_furniture_sdb). */
export function displayDeposit(state, inv, id, classTsid, qty = 1) {
  const box = itemById(state, id);
  if (!box || box.classTsid !== 'bag_furniture_sdb') return { ok: false, reason: 'not_box' };
  const cls = cleanKey(classTsid);
  const n = Math.max(1, Math.floor(finite(qty, 1)));
  if (!cls || isFurniture(cls)) return { ok: false, reason: 'bad_item', msg: 'That cannot go in a display box.' };
  if (box.display && box.display.classTsid !== cls) {
    return { ok: false, reason: 'other_class', msg: 'A Storage Display Box shows off one kind of thing at a time.' };
  }
  if ((inv?.[cls] || 0) < n) return { ok: false, reason: 'none', msg: "You don't have that many." };
  inv[cls] -= n;
  box.display = { classTsid: cls, count: (box.display?.count || 0) + n };
  return { ok: true, display: { ...box.display } };
}

export function displayWithdraw(state, inv, id, qty = Infinity) {
  const box = itemById(state, id);
  if (!box?.display) return { ok: false, reason: 'empty' };
  const n = Math.min(box.display.count, Math.max(1, Math.floor(finite(qty, box.display.count))));
  inv[box.display.classTsid] = (inv[box.display.classTsid] || 0) + n;
  box.display.count -= n;
  const classTsid = box.display.classTsid;
  if (box.display.count <= 0) delete box.display;
  return { ok: true, classTsid, qty: n };
}

/** Back-to-front render order: rugs, then ceiling and wall, then floor by z. */
export function renderOrder(state) {
  const rank = { rug: 0, ceiling: 1, wall: 2, floor: 3 };
  return [...state.placed].sort((a, b) => {
    const r = rank[a.slot] - rank[b.slot];
    if (r) return r;
    // Tabletop decor always draws above the piece it rests on.
    if (a.on === b.id) return 1;
    if (b.on === a.id) return -1;
    return a.z - b.z || a.id - b.id;
  });
}

/**
 * The slots whose pieces draw over the avatars. glitch-client LocationRenderer.as 1465-1468 hands a
 * stack on a `front` or `ceiling` placement plat to addForegroundFurnitureItem, the FG_FURN holder
 * that MiddleGroundRenderer.setupEndShapes (111-171) adds after OTHER_AV, YOUR_AVATAR and
 * FOREMOST_ITEMS; every other set (wall, rug, bookshelf, chair) goes in under the item holders.
 * The three ceiling classes (furniture_ceilinglamp, furniture_lamp, furniture_ceilingdeco:
 * placement_set "ceiling") are the remake's: floor pieces always snap onto the floor plat
 * (snapPlacement), so nothing stands on the front plat yet.
 */
export const FRONT_FURNITURE_SLOTS = Object.freeze(['ceiling', 'front']);

/** True when a placed piece draws over the avatars (FG_FURN). */
export function furnitureDrawsInFront(item) {
  return FRONT_FURNITURE_SLOTS.includes(item?.slot);
}

/**
 * First visit: lay the furniture_populate starter kit out as a cosy room, so a
 * new house is lived in from the start. Everything stays movable. The blank
 * Room / Tabletop / Wall Decoration frames (their art came from credit
 * upgrades) wait in storage for the player to place.
 */
export function arrangeStarterRoom(state) {
  const plan = [
    ['bag_furniture_smallcabinet', 160],
    ['furniture_floorlamp', 262],
    ['furniture_table', 480],
    ['furniture_chair', 362, null, { facingRight: true }],
    ['furniture_ceilinglamp', 480],
    ['furniture_shelf', 160, 430],
    ['furniture_shelf', 690, 410],
    ['bag_furniture_sdb', 810, 560],
    ['bag_furniture_sdb', 890, 560],
  ];
  for (const [classTsid, x, y, extra] of plan) {
    if (!state.storage[classTsid]) continue;
    placeFurniture(state, {}, classTsid, { x, y: y ?? INTERIOR.floorY }, extra || {});
  }
  return state;
}

/** Seed a furnished, lived-in room (QA demo and the decorate tutorial). */
export function furnishDemoRoom(state) {
  const add = (classTsid, x, y = null, extra = {}) => {
    state.storage[classTsid] = (state.storage[classTsid] || 0) + 1;
    const placed = placeFurniture(state, {}, classTsid, { x, y: y ?? INTERIOR.floorY }, extra);
    return placed.item;
  };
  add('furniture_rug', 420);
  add('furniture_bookcase', 150);
  add('furniture_table', 420);
  add('furniture_chair', 300, null, { facingRight: true });
  add('furniture_chair', 540, null, { facingRight: false });
  add('furniture_tablelamp', 380);
  add('furniture_floorlamp', 640);
  add('furniture_sofa', 790);
  add('furniture_shelf', 790, 420);
  add('furniture_painting', 290, 440);
  add('furniture_largewindow', 560, 440);
  add('bag_furniture_sdb', 920, 500);
  add('furniture_ceilinglamp', 420);
  add('furniture_walllamp', 680, 420);
  return state;
}
