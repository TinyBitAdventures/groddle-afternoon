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

import { TROPHY_DECOR, isTrophyDecor } from './home-trophies.js?v=649b111e';
import {
  FURNITURE_CATALOG,
  FURNITURE_STARTER_KIT,
  HOME_LIMITS,
  HOME_TEXTURE_CONFIGS,
} from './homes-catalog.js?v=0367f90f';
import { cleanHistory, cleanUpgradeId, upgradeArt, upgradeRow } from './furniture-upgrades.js?v=f563b304';
import { FURNITURE_PLATS } from './furniture-plats-data.js?v=2842bcc0';
import { SDB_COUNT_MAX, SDB_PRICE_MAX, isCabinetClass, normalizeContents, storagePickupLock } from './home-storage.js?v=17bf7f79';
import { stackMaxOf } from './pack-slots.js?v=38e4aea5';

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
  wallMarginBottom: 22,
});
/**
 * The wall placement plat (inc_homes.js homes_rebuild_floor 1514-1522, inc_geo_builder.js
 * geo_builder_room_plats 134-142): 118 + frame_height up, the walk line being 43 + frame_height
 * up (inc_homes.js 930-931), so 75 px over the walk line, with a placement plane 280 px tall.
 * HandOfDecorator.as 1164-1169 lets a wall piece's point go up the plane as long as the art it
 * takes (height_it_takes, from the point to the art's top, 1144-1149) stays under the plane's top:
 * the art's top no higher than 355 px over the walk line (G1292, report #669).
 */
export const WALL_PLAT = Object.freeze({ rise: 75, planeHeight: 280 });

/** The highest a wall piece `h` px tall may stand (its art's bottom, world y): its top on the wall plane's top. */
export function wallTopY(h) {
  return INTERIOR.floorY - WALL_PLAT.rise - WALL_PLAT.planeHeight + h;
}
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
/**
 * G1136 (#612): the placement plats a floor or rug piece stands on, px from the walk line
 * (inc_homes.js homes_rebuild_floor 1497-1563, tower.js 452-458 through inc_geo_builder.js
 * geo_builder_room_plats 122-182): bookshelf at b - (108 + frame_height), chair at 73, rug at 43
 * and front at 23, the walk line itself (the avatars' floor platform) at 43 (inc_homes.js 927-931,
 * tower.js 273). Placed Doors go to the bookshelf line too (inc_homes.js 749-750). The original
 * stood a piece's SWF stage bottom centre on its plat; the remake draws the art's own bottom, so a
 * piece stands art.foot under the line (restY).
 */
export const PLAT_DEPTH = Object.freeze({ bookshelf: -65, chair: -30, rug: 0, front: 20 });
/** The standing sets back to front: the order the source pushes the plats, which wins a tie. */
const STANDING_ORDER = Object.freeze(['bookshelf', 'chair', 'rug', 'front']);
/** HandOfDecorator.as 102 plat_under_allowance: a plat this far over the pointer still counts as under it. */
export const PLAT_UNDER_ALLOWANCE = 10;

/** A standing set's plat line (world y). */
export function platLineY(set) {
  return INTERIOR.floorY + PLAT_DEPTH[set];
}

/**
 * The plats a class may stand on, in its placement_set's order (the first is where a piece goes
 * with no pointer to choose by). Empty for a floor piece with no set (a trophy: an ordinary item
 * on the walk line) and for wall and ceiling pieces.
 */
export function standingSets(classTsid) {
  const def = furnitureDef(classTsid);
  if (!def || (def.slot !== 'floor' && def.slot !== 'rug')) return [];
  return (def.placementSet || []).filter((set) => set in PLAT_DEPTH);
}

/** How far the piece's art reaches under its plat line (art.foot at the piece's scale, 0 unmeasured). */
function footPx(classTsid, upgradeId = '') {
  const foot = Number(pieceArt(classTsid, upgradeId)?.foot);
  return Number.isFinite(foot) ? Math.round(foot * pieceScale(classTsid, upgradeId)) : 0;
}

/** Where a piece on `set` stands: its art's bottom, the plat line less its foot. */
export function restY(classTsid, set, upgradeId = '') {
  if (!(set in PLAT_DEPTH)) return INTERIOR.floorY;
  return platLineY(set) - footPx(classTsid, upgradeId);
}

/**
 * The plat a piece set down at `y` (where its art's bottom would go) stands on, as
 * HandOfDecorator.calculateTargetPlatformLineForFurnitureFromPt chose it (1118-1127): of the
 * class's plats, the nearest under the point (PLAT_UNDER_ALLOWANCE over it counts), else the
 * nearest of all; the back one on a tie. With no y, the first of its placement_set.
 */
export function standSetAt(classTsid, y, upgradeId = '') {
  const sets = standingSets(classTsid);
  if (!sets.length) return null;
  if (sets.length === 1 || y == null || !Number.isFinite(Number(y))) return sets[0];
  const reg = Number(y) + footPx(classTsid, upgradeId);
  const ordered = STANDING_ORDER.filter((set) => sets.includes(set));
  const nearest = (list) => list.reduce((best, set) => (Math.abs(platLineY(set) - reg) < Math.abs(platLineY(best) - reg) ? set : best));
  const under = ordered.filter((set) => platLineY(set) > reg - PLAT_UNDER_ALLOWANCE);
  return nearest(under.length ? under : ordered);
}

/**
 * The plat nearest where a piece's art stood at `y` (G1136 follow-up, Austin 2026-11-22): for a
 * save from before plats, when every floor piece stood its art's bottom on the walk line (and a
 * Door on the back wall's base), so a room changes least. Of the class's plats, the one whose rest
 * line is nearest `y`; the back one on a tie, as a piece drew behind the avatars before.
 */
export function nearestStandSet(classTsid, y, upgradeId = '') {
  const sets = standingSets(classTsid);
  if (!sets.length) return null;
  if (sets.length === 1 || y == null || !Number.isFinite(Number(y))) return sets[0];
  const ordered = STANDING_ORDER.filter((set) => sets.includes(set));
  const off = (set) => Math.abs(restY(classTsid, set, upgradeId) - Number(y));
  return ordered.reduce((best, set) => (off(set) < off(best) ? set : best));
}

/** Where a floor-standing class's foot rests with no pointer to choose by: its first plat (a Door, the back wall's base). */
export function floorRestY(classTsid, upgradeId = '') {
  const set = standingSets(classTsid)[0];
  return set ? restY(classTsid, set, upgradeId) : INTERIOR.floorY;
}
/** A plain Door's foot (the bookshelf line, G1136). */
export const DOOR_FOOT_Y = floorRestY('furniture_door');
/** The plat a slot falls back to when a class names no known set. */
const SLOT_PLAT = Object.freeze({ ceiling: 'ceiling', wall: 'wall', rug: 'rug', floor: 'bookshelf' });
/** The pre-G7 geometry, for migrating old saves. */
const OLD_GEO = Object.freeze({ segmentW: 200, endCapW: 56, towerW: 1200 });

export const TEXTURE_KINDS = Object.freeze(['wall', 'floor', 'ceiling']);
const TEXTURE_CONFIG_KEY = { wall: 'walls', floor: 'floors', ceiling: 'ceilings' };
// No cap on the pieces a room holds, as Glitch: config_base.js home_limits (213-236) limits only
// floors, walls and the yard, and inc_homes.js counts no furniture (Austin 2026-11-25, chat 11-24).
const MAX_STORAGE_STACK = 999;

/** A placeable class's row: furniture, or a trophy (js/home-trophies.js). */
export function furnitureDef(classTsid) {
  return FURNITURE_CATALOG[classTsid] || (isTrophyDecor(classTsid) ? TROPHY_DECOR[classTsid] : null);
}

export function isFurniture(classTsid) {
  return Boolean(furnitureDef(classTsid));
}

/** Display scale: only ever shrinks an oversized recovered frame (none since the Fireplace draws one cell of its sheet, SEATSELECT). */
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

/** 1x px a thing rests into a piece's visible top when the catalog gives no plat on the art. */
export const REST_INSET = 2;

/**
 * Height above the foot where tabletop decor rests, or 0 for no surface.
 *
 * An upgrade uses its highest catalog plat over the middle. A catalog plat is
 * measured from the SWF stage's bottom centre (the point the original placed a
 * piece by, LocationItemstackView.as _positionViewDO 853-854); the trimmed art
 * keeps how far its own bottom sits above that point as art.foot
 * (tools/furniture-upgrades/render.py --feet), and the remake draws the art's
 * bottom on the piece's foot, so the plat is `platY - foot` over it:
 * - a piece hung above its point (the wall shelves, foot > 0: the Basic Wooden
 *   Shelf's plat is 52 over a stage bottom 24 px under its 49 px art) rests
 *   things 28 px up, on the plank (HOUSEFIX, Austin 2026-11-01; the foot is
 *   measured from the zoom-3 art, #669: at zoom 1 it read 19 and things stood
 *   at 33, 5 px behind the plat);
 * - a floor piece drawn past its point (foot < 0: legs and front edges in
 *   three-quarter view reach below the line it stands on) rests them that much
 *   higher, on its top: the Dining Table with Striped Runner's plat 52 with a
 *   foot of -23 is 75 up its 90 px art. Before, its plat was taken as it stood,
 *   so things sat on a table's front edge or in front of its legs.
 * Nothing rests above the art's visible top over its middle (art.top, measured
 * by tools/furniture-upgrades/tops.mjs, whose --check sweeps every piece): a
 * plat above it, or a piece with no plat, rests things REST_INSET into that top.
 * With no measurement, the class's surface in proportion to the art's height.
 * A plain piece rests things the same way from its own plat and foot
 * (build-homes.mjs from getFurnitureBaseGeo and the base SWF): the round table
 * at 43 + 25 = 68 up its 85 px art, not the hand-set 80 at the back edge of its
 * top (DECOPOLISH, Austin 2026-11-02).
 */
export function surfaceHeight(classTsid, upgradeId = '') {
  const def = furnitureDef(classTsid);
  if (!def?.surface) return 0;
  const art = upgradeArt(classTsid, upgradeId);
  if (art) {
    const platY = upgradeRow(classTsid, upgradeId)?.platY;
    // A seat (platOnly, SEATSELECT) holds things only on a plat: a style with none holds nothing.
    if (def.platOnly && platY == null) return 0;
    const rest = restOnArt(art, platY, 1);
    return rest ?? Math.round(def.surface * (art.h / def.art.h));
  }
  // The plain piece the same way (DECOPOLISH): its plat from items/<class>.js getFurnitureBaseGeo
  // and its base SWF's foot (build-homes.mjs); its hand-set `surface` only when it has no plat.
  const s = furnitureScale(classTsid);
  if (def.platOnly && def.platY == null) return 0;
  return (def.platY != null ? restOnArt(def.art, def.platY, s) : null) ?? Math.round(def.surface * s);
}

/** plat - foot on `art`, kept under its visible top (or REST_INSET into the top with no plat), at scale s; null with neither. */
function restOnArt(art, platY, s) {
  const foot = Number.isFinite(Number(art.foot)) ? Number(art.foot) : 0;
  const plat = platY != null && Number.isFinite(Number(platY)) ? Math.round((Number(platY) - foot) * s) : 0;
  const top = Number.isFinite(Number(art.top)) ? Math.round((art.h - Number(art.top)) * s) : null;
  if (plat > 0 && plat <= (top ?? Math.round((art.h + 4) * s))) return plat;
  if (top != null) return Math.max(1, top - REST_INSET);
  return null;
}

/**
 * #772: the house's lines a placed piece adds, for players to stand on. Glitch put a piece's plats in
 * the room when it was placed (inc_geo.js geo_add_plats_from_item 934-953, main.js doFurnitureDrop
 * 7031), back when the house loaded (inc_homes.js 815-821), and swapped them on a move, an upgrade or
 * a flip (include/furniture.js applyUpgrade, flipPlats); a table's, chair's, bed's or shelf's plat is
 * solid from the top for players (platform_pc_perm -1, PlatformLine.as 341). The lines are
 * js/furniture-plats-data.js's (tools/furniture-plats/build.mjs), from the drawn art's bottom centre,
 * mirrored for a piece facing left as getPlatsAndWalls mirrored them. Ours: they hold no items
 * (item_perm 0): a thing set on a piece rests on it through `on` (settleStacks, stackSurfaceAt).
 */
export const FURNITURE_LINE_PREFIX = 'home-furniture-';
/**
 * The avatar's head reach (street-model.js avatarHeadReach at scale 1). In Glitch a rising head
 * stopped under the room's ceiling plat, 413 px over the walk line (inc_homes.js homes_rebuild_floor
 * 934-939, platform_pc_perm 1), so feet never rose past this far under it and a piece's plat nearer
 * the ceiling (a shelf hung at the top of the wall) was out of reach. The remake's house has no
 * ceiling line, so such a line is left out rather than stood on with the head through the ceiling.
 */
export const FURNITURE_HEADROOM = 111;

/** One placed piece's lines, [x1, y1, x2, y2] from its art's bottom centre facing right (data rows). */
export function piecePlatRows(classTsid, upgradeId = '') {
  const rows = FURNITURE_PLATS[classTsid];
  if (!rows) return [];
  const id = cleanUpgradeId(classTsid, upgradeId);
  return (id ? rows.upgrades?.[id] : rows.base) || [];
}

/**
 * PURE: every placed piece's lines in `state` (a room's decor) in world px, the room starting at
 * world x `x0`: { id, x1, y1, x2, y2, pc_perm: -1, item_perm: 0, furnitureId }, x1 <= x2.
 */
export function furniturePlatforms(state, x0 = 0) {
  const out = [];
  const minY = INTERIOR.ceilingY + FURNITURE_HEADROOM;
  for (const item of Array.isArray(state?.placed) ? state.placed : []) {
    const rows = piecePlatRows(item.classTsid, item.upgradeId);
    if (!rows.length) continue;
    const s = pieceScale(item.classTsid, item.upgradeId);
    const dir = item.facingRight === false ? -1 : 1;
    const x = x0 + finite(item.x);
    const y = finite(item.y, INTERIOR.floorY);
    rows.forEach(([ax1, ay1, ax2, ay2], i) => {
      let a = { x: Math.round(x + dir * ax1 * s), y: Math.round(y + ay1 * s) };
      let b = { x: Math.round(x + dir * ax2 * s), y: Math.round(y + ay2 * s) };
      if (a.x > b.x) [a, b] = [b, a];
      if (a.x === b.x || Math.min(a.y, b.y) < minY) return;
      out.push({ id: `${FURNITURE_LINE_PREFIX}${item.id}-${i}`, x1: a.x, y1: a.y, x2: b.x, y2: b.y, pc_perm: -1, item_perm: 0, furnitureId: item.id });
    });
  }
  return out;
}

/** A line furniturePlatforms made. */
export function isFurnitureLine(line) {
  return String(line?.id || '').startsWith(FURNITURE_LINE_PREFIX);
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

/**
 * A swatch's category heading. Some configs have none (the Rook Forest floor and ceiling, G400):
 * SwatchBagUI sorted them under CATEGORY_OTHER, "swatches have a null category need to be shown too!".
 */
export function textureCategory(row) {
  return String(row?.category || '').trim() || 'Other';
}

export function listTextures(kind) {
  const all = Object.values(HOME_TEXTURE_CONFIGS[TEXTURE_CONFIG_KEY[kind]] || {});
  return all.sort((a, b) => textureCategory(a).localeCompare(textureCategory(b)) || a.name.localeCompare(b.name));
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
  // G1136: the plat a floor piece stands on (fitPlacements puts it there, or on the nearest plat).
  if (out.slot === 'floor' && !out.on && standingSets(classTsid).includes(row?.plat)) out.plat = row.plat;
  copyStyle(row, out);
  if (classTsid === 'bag_furniture_sdb' && row?.display?.classTsid) {
    const count = Math.max(0, Math.min(SDB_COUNT_MAX, Math.floor(finite(row.display.count, 0))));
    if (count > 0) out.display = { classTsid: cleanKey(row.display.classTsid), count };
  }
  // Ticket 51 (G404, js/home-storage.js): a box's selling price, and a cabinet's slots. A save from
  // before either has none, and the box is not selling, the cabinet empty.
  if (classTsid === 'bag_furniture_sdb') {
    const price = Math.floor(finite(row?.price, 0));
    if (price > 0 && price <= SDB_PRICE_MAX) out.price = price;
    if (row?.selling === true && out.display && out.price) out.selling = true;
  }
  if (isCabinetClass(classTsid) && Array.isArray(row?.contents) && row.contents.some(Boolean)) {
    out.contents = normalizeContents(classTsid, row.contents, (c) => stackMaxOf(c));
    if (!out.contents.some(Boolean)) delete out.contents;
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
  const paid = normalizePaid(seed?.paid, wallSegments);
  if (Object.keys(paid).length) out.paid = paid;
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
    // G1136: a floor or rug piece stands on its plat; a save from before plats (every piece's art on
    // the walk line) puts it on the plat nearest where it stood.
    const sets = standingSets(row.classTsid);
    const set = sets.length ? (sets.includes(row.plat) ? row.plat : nearestStandSet(row.classTsid, row.y, row.upgradeId)) : null;
    if (row.slot === 'floor' && row.on && !byId.has(row.on)) row.on = null;
    if (row.slot === 'floor' && set) row.plat = set;
    else delete row.plat;
    row.x = horizontalClamp(state, row.classTsid, mapX(row.x), row.upgradeId, set);
    if (row.slot === 'ceiling') row.y = INTERIOR.ceilingY;
    else if (set) row.y = restY(row.classTsid, set, row.upgradeId);
    else if (row.slot === 'wall') {
      const h = furnitureSize(row.classTsid, row.upgradeId).h;
      const top = wallTopY(h);
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
  for (const def of [...Object.values(FURNITURE_CATALOG), ...Object.values(TROPHY_DECOR)]) {
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
 * Where a piece may stand: on `set`, that plat's ends (HandOfDecorator clamps to the plat it
 * chose); else the widest of the plats its placement_set names.
 */
export function placementSpan(state, classTsid, set = null) {
  const room = placementRoom(state);
  const def = furnitureDef(classTsid);
  const sets = set in PLACEMENT_INSET ? [set] : (def?.placementSet || []).filter((name) => name in PLACEMENT_INSET);
  if (!sets.length) sets.push(SLOT_PLAT[def?.slot] || 'bookshelf');
  return {
    left: Math.min(...sets.map((set) => room.start + PLACEMENT_INSET[set])),
    right: Math.max(...sets.map((set) => room.end - PLACEMENT_INSET[set])),
  };
}

function horizontalClamp(state, classTsid, x, upgradeId = '', set = null) {
  const { left, right } = placementSpan(state, classTsid, set);
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
 * Where an ordinary item set down in the room comes to rest (HandOfDecorator
 * calculateTargetPlatformLineForRegStackFromPt: the closest item platform under
 * the point). Any placed piece with a surface (a shelf, table, desk, counter,
 * bookcase, cabinet or mantel) whose top is under the point (`give` px above it
 * still counts) and whose width covers x, the nearest first; else the floor.
 * x stays inside the room's placement span. Positions are room x and world y.
 * @returns {{ x: number, y: number, on: number|null }}
 */
export function stackSurfaceAt(state, x, y, { give = 24, exclude = null } = {}) {
  const room = placementRoom(state);
  const px = Math.round(Math.max(room.start + 12, Math.min(room.end - 12, finite(x, room.start))));
  const py = finite(y, INTERIOR.floorY);
  // A piece being moved never lands on itself or on what rests on it.
  const skip = exclude != null ? new Set([Number(exclude), ...riders(state, exclude).map((row) => row.id)]) : null;
  let best = null;
  for (const row of state.placed) {
    if (row.slot === 'ceiling' || row.slot === 'rug' || skip?.has(row.id)) continue;
    const h = surfaceHeight(row.classTsid, row.upgradeId);
    if (!h) continue;
    const half = furnitureSize(row.classTsid, row.upgradeId).w / 2 - 6;
    if (Math.abs(px - row.x) > half) continue;
    const top = Math.round(row.y - h);
    if (top < py - give) continue;
    if (!best || top < best.y || (top === best.y && row.z > best.z)) best = { x: px, y: top, on: row.id, z: row.z };
  }
  if (best) return { x: best.x, y: best.y, on: best.on };
  return { x: px, y: INTERIOR.floorY, on: null };
}

/** How far over a piece's surface a stack set down before a surface fix may sit and still be on that piece. */
export const STALE_REST_GIVE = 40;

/** The piece's resting line: { top, left, right } in room px, or null when it holds nothing. */
function restLine(row) {
  if (!row || row.slot === 'ceiling' || row.slot === 'rug') return null;
  const h = surfaceHeight(row.classTsid, row.upgradeId);
  if (!h) return null;
  const half = Math.max(0, furnitureSize(row.classTsid, row.upgradeId).w / 2 - 6);
  return { top: Math.round(row.y - h), left: row.x - half, right: row.x + half };
}

/**
 * Stacks set down in a room rest on what holds them, as the original kept them
 * (HandOfDecorator.as dropFromLocationOnTargetPlatform 1500-1575: a moved piece
 * takes the stacks on its plats with it, also_tsids; a stack lands on the plat
 * line under it). `rows` are the room's dropped-stack records (world x, `on`
 * the piece id), `x0` the room's world x. Each comes to rest:
 * - on its piece (`on`), at that piece's surface now: after a move, a new style
 *   or a surface fix (the Basic Wooden Shelf's things were set down at 52 px
 *   before HOUSEFIX made it 33, and floated 19 px over the plank), and inside its
 *   ends;
 * - a stack with no piece yet (set down before stacks kept one) takes the piece
 *   it sits on: its x over the piece, no more than STALE_REST_GIVE over its
 *   surface and above its foot; one on the floor stays on the floor;
 * - a stack whose piece is gone (picked up, sold) falls to the first surface
 *   under it, or the floor.
 * Mutates the rows; returns how many moved. Only x, y and `on` change, so the
 * pack and the ledger never see it.
 */
export function settleStacks(state, rows, x0 = 0) {
  if (!state || !Array.isArray(rows)) return 0;
  let moved = 0;
  const lines = new Map();
  for (const row of state.placed || []) {
    const line = restLine(row);
    if (line) lines.set(row.id, line);
  }
  for (const stack of rows) {
    if (!stack || stack.contents) continue;
    const rx = Number(stack.x) - x0;
    const y = Number(stack.y);
    if (!Number.isFinite(rx) || !Number.isFinite(y)) continue;
    let on = Number.isInteger(stack.on) && lines.has(stack.on) ? stack.on : null;
    if (on == null && stack.on == null) {
      // A stack from before `on`: the piece under it, nearest its surface.
      let best = null;
      for (const row of state.placed || []) {
        const line = lines.get(row.id);
        if (!line || rx < line.left || rx > line.right) continue;
        if (y < line.top - STALE_REST_GIVE || y > row.y - 2) continue;
        const d = Math.abs(y - line.top);
        if (!best || d < best.d) best = { id: row.id, d };
      }
      on = best?.id ?? null;
    }
    let next;
    if (on != null) {
      const line = lines.get(on);
      next = { x: Math.round(Math.max(line.left, Math.min(line.right, rx))), y: line.top, on };
    } else if (stack.on != null) {
      // Its piece is gone: it falls to whatever is under it.
      const hit = stackSurfaceAt(state, rx, y, { give: 0 });
      next = { x: hit.x, y: hit.y, on: hit.on };
    } else continue;
    const nx = next.x + x0;
    if (nx !== stack.x || next.y !== stack.y || (next.on ?? null) !== (stack.on ?? null)) {
      stack.x = nx;
      stack.y = next.y;
      if (next.on != null) stack.on = next.on;
      else delete stack.on;
      moved += 1;
    }
  }
  return moved;
}

/**
 * Snap a requested point to the slot rules. Positions are the foot point
 * (bottom-center) for floor, rug, tabletop and wall pieces, and the hanging
 * point (top-center) for ceiling pieces. A floor or rug piece stands on one of
 * its plats (G1136): `at.plat` when it names one of them, else the one
 * standSetAt picks for `at.y`; the result carries it as `plat`.
 */
export function snapPlacement(state, classTsid, at = {}, excludeId = null, upgradeId = '') {
  const def = furnitureDef(classTsid);
  if (!def) return null;
  const sets = standingSets(classTsid);
  const set = sets.includes(at.plat) ? at.plat : standSetAt(classTsid, at.y, upgradeId);
  const x = horizontalClamp(state, classTsid, at.x, upgradeId, set);
  const { h } = furnitureSize(classTsid, upgradeId);
  if (def.slot === 'wall') {
    const top = wallTopY(h);
    const bottom = INTERIOR.floorY - INTERIOR.wallMarginBottom;
    const y = Math.round(Math.max(top, Math.min(bottom, finite(at.y, (top + bottom) / 2))));
    return { x, y, slot: 'wall', on: null };
  }
  if (def.slot === 'ceiling') return { x, y: INTERIOR.ceilingY, slot: 'ceiling', on: null };
  if (def.slot === 'rug') return { x, y: restY(classTsid, set || 'rug', upgradeId), slot: 'rug', on: null };
  if (def.tabletop) {
    // Report #203: a trophy is an ordinary item (items/trophy_gem.js 179 is_trophy, 186-189 tags
    // trophy/no_trade, no no_shelf), set down by HandOfDecorator.as 2222-2223
    // calculateTargetPlatformLineForRegStackFromPt on getPlatsSolidFromTopForItems (960-965), which
    // keeps a wall shelf's item plat (items/furniture_shelf.js 387 platform_item_perm -1). So it takes
    // the stack rule: the nearest surface under the pointer, wall shelves too, else the floor.
    // With no pointer y (a scripted place) it keeps the floor-standing host under x below.
    if (isTrophyDecor(classTsid) && Number.isFinite(Number(at.y))) {
      const rest = stackSurfaceAt(state, x, Number(at.y), { exclude: excludeId });
      return { x, y: rest.y, slot: 'floor', on: rest.on };
    }
    const host = surfaceUnder(state, x, excludeId);
    if (host && host.id !== excludeId) {
      return { x, y: host.y - surfaceHeight(host.classTsid, host.upgradeId), slot: 'floor', on: host.id };
    }
  }
  if (!set) return { x, y: INTERIOR.floorY, slot: 'floor', on: null };
  return { x, y: restY(classTsid, set, upgradeId), slot: 'floor', on: null, plat: set };
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
  if (snapped.plat) item.plat = snapped.plat;
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
  if (snapped.plat) item.plat = snapped.plat;
  else delete item.plat;
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
  // canPickup (bag_furniture_cabinet.js 446-450, bag_furniture_sdb.js 878-883): storage must be empty first.
  const full = lifted.map((row) => storagePickupLock(row)).find(Boolean);
  if (full) {
    return { ok: false, reason: 'not_empty', msg: full };
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
 * locations/inc_homes.js homes_get_expand_costs `unexpand` (2012-03-30): wall
 * segments past MIN_WALL_SEGMENTS can come off again. Glitch refunded a fixed
 * set of parts for each, num_floors times (2 Wood Posts, 6 Boards, 7 or 8
 * Barnacle Talc, a Beam on even segments, a Girder every fourth), from below
 * the starting width too, worth about 820 more than the Wall Segment it took.
 *
 * G1334, ours (Austin 2026-11-27: "refund only what the player spent"): an
 * un-expand gives back what that expansion took. The house's ground floor keeps
 * it (`paid`, by the width the expansion made: expandHouseFloors records it).
 * A segment past the starting seven with no record (expanded before this) gives
 * one Wall Segment, the least an expansion ever cost; a segment the house came
 * with gives nothing. The site banks the same (groddle-afternoon-site
 * LedgerMath built), so the refund stands in the ledger.
 */
const PAID_CLASSES = Object.freeze(['wall_segment', 'grade_aa_earth_block', 'girder']);

function normalizePaid(raw, wallSegments) {
  const out = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [key, items] of Object.entries(raw)) {
    const w = Math.floor(Number(key));
    if (!Number.isFinite(w) || w <= HOME_LIMITS.MIN_WALL_SEGMENTS || w > wallSegments || !items || typeof items !== 'object') continue;
    const row = {};
    for (const cls of PAID_CLASSES) {
      const n = Math.floor(finite(items[cls], 0));
      if (n > 0) row[cls] = Math.min(n, 99);
    }
    if (Object.keys(row).length) out[w] = row;
  }
  return out;
}

/** What un-expanding the house as it stands gives back (see above). */
export function unexpandRefund(state) {
  const w = Math.floor(finite(state?.wallSegments, HOME_LIMITS.START_WALL_SEGMENTS));
  const row = state?.paid?.[w];
  if (row && typeof row === 'object') return { ...row };
  return w > HOME_LIMITS.START_WALL_SEGMENTS ? { wall_segment: 1 } : {};
}

/** expandHouseFloors: what this expansion took, kept for its un-expand. */
export function recordExpansionPaid(state, items) {
  const row = {};
  for (const cls of PAID_CLASSES) if (Number(items?.[cls]) > 0) row[cls] = Math.floor(Number(items[cls]));
  state.paid = { ...(state.paid || {}), [state.wallSegments]: row };
}

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
  /** G1334, ours: a segment the house came with. */
  noRefund: 'This wall segment came with the house, so nothing is refunded.',
});

export function quoteInteriorUnexpand(state) {
  const inner = Math.max(0, Math.floor(finite(state?.wallSegments, HOME_LIMITS.START_WALL_SEGMENTS)) - 2);
  const count = state?.layout === 'tower' ? 0 : Math.max(0, inner - (HOME_LIMITS.MIN_WALL_SEGMENTS - 2));
  if (!count) return { ok: false, reason: 'min', count: 0, items: {}, msg: UNEXPAND_TEXT.min };
  return { ok: true, count, items: unexpandRefund(state) };
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
  if (state.paid) {
    delete state.paid[state.wallSegments];
    if (!Object.keys(state.paid).length) delete state.paid;
  }
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

export const DISPLAY_TEXT = Object.freeze({
  /** bag_furniture_sdb.js verbs.deposit drop_tip. */
  dropTip: 'Deposit',
  badItem: 'That cannot go in a display box.',
  otherClass: 'A Storage Display Box shows off one kind of thing at a time.',
});

/**
 * Whether a Storage Display Box takes a class (bag_furniture_sdb.js verbs.deposit drop_ok_code
 * 624-636 and valid_items 668-708): not furniture, a bag (`bag`) or something that may not leave
 * the pack (`blocked`: a quest item, no_drop), and its own kind or an empty box. `tool`: the
 * remake keeps tools out (their wear is per copy in the pack, js/tools.js), as Display always has.
 * Returns null, or { reason, msg }.
 */
export function displayRefusal(box, classTsid, { tool = false, bag = false, blocked = false } = {}) {
  if (!box || box.classTsid !== 'bag_furniture_sdb') return { reason: 'not_box', msg: '' };
  const cls = cleanKey(classTsid);
  if (!cls || isFurniture(cls) || tool || bag || blocked) return { reason: 'bad_item', msg: DISPLAY_TEXT.badItem };
  if (box.display && box.display.classTsid !== cls) return { reason: 'other_class', msg: DISPLAY_TEXT.otherClass };
  return null;
}

/** Storage Display Box: deposit pack items of one class (bag_furniture_sdb). */
export function displayDeposit(state, inv, id, classTsid, qty = 1) {
  const box = itemById(state, id);
  if (!box || box.classTsid !== 'bag_furniture_sdb') return { ok: false, reason: 'not_box' };
  const cls = cleanKey(classTsid);
  const n = Math.max(1, Math.floor(finite(qty, 1)));
  const refused = displayRefusal(box, cls);
  if (refused) return { ok: false, ...refused };
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

/**
 * The holders the client drew room furniture in, back to front (glitch-client
 * MiddleGroundRenderer.setupEndShapes 111-171; LocationRenderer.as 1440-1470 picks one by the
 * plat a piece stands on): CHASSIS (a placed Door), WALL_FURN, RUG_FURN, BOOKSHELF_FURN and
 * CHAIR_FURN under the avatars, then FG_FURN over them (front and ceiling pieces). A piece with no
 * plat (a trophy on the walk line) goes with the chair pieces.
 */
export const FURNITURE_HOLDERS = Object.freeze(['chassis', 'wall', 'rug', 'bookshelf', 'chair', 'front']);

/** The holder a placed piece (not a rider) draws in. */
export function furnitureHolderOf(item) {
  if (!item) return 'chair';
  if (item.slot === 'ceiling') return 'front';
  if (item.slot === 'wall') return 'wall';
  if (item.slot === 'rug') return 'rug';
  if (item.classTsid === 'furniture_door') return 'chassis';
  return item.plat in PLAT_DEPTH ? item.plat : 'chair';
}

/**
 * Back-to-front render order: by holder (FURNITURE_HOLDERS), then by z in each, as the client
 * sorted a location's furniture (LocationRenderer.as 2254 sortOn z). Tabletop decor draws just
 * above the piece it rests on (addItemJustAboveOtherItem), in that piece's holder.
 */
export function renderOrder(state) {
  const rows = [...state.placed];
  const ids = new Set(rows.map((row) => row.id));
  const byZ = (a, b) => a.z - b.z || a.id - b.id;
  const rank = (row) => FURNITURE_HOLDERS.indexOf(furnitureHolderOf(row));
  const hosts = rows.filter((row) => !row.on || !ids.has(row.on)).sort((a, b) => rank(a) - rank(b) || byZ(a, b));
  const out = [];
  const seen = new Set();
  const add = (row) => {
    if (seen.has(row.id)) return;
    seen.add(row.id);
    out.push(row);
    for (const rider of rows.filter((r) => r.on === row.id).sort(byZ)) add(rider);
  };
  hosts.forEach(add);
  // A loop of riders (no host on the floor) still draws.
  rows.filter((row) => !seen.has(row.id)).sort(byZ).forEach(add);
  return out;
}

/**
 * The slots whose pieces draw over the avatars. glitch-client LocationRenderer.as 1465-1468 hands a
 * stack on a `front` or `ceiling` placement plat to addForegroundFurnitureItem, the FG_FURN holder
 * that MiddleGroundRenderer.setupEndShapes (111-171) adds after OTHER_AV, YOUR_AVATAR and
 * FOREMOST_ITEMS; every other set (wall, rug, bookshelf, chair) goes in under the item holders.
 * A floor piece stands on the front plat when it is set down in front of the walk line (G1136).
 */
export const FRONT_FURNITURE_SLOTS = Object.freeze(['ceiling', 'front']);

/** True when a placed piece draws over the avatars (FG_FURN): a ceiling piece, or one on the front plat. */
export function furnitureDrawsInFront(item) {
  if (FRONT_FURNITURE_SLOTS.includes(item?.slot)) return true;
  return item?.slot === 'floor' && !item.on && item.plat === 'front';
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
    placeFurniture(state, {}, classTsid, y == null ? { x } : { x, y }, extra || {});
  }
  return state;
}

/** Seed a furnished, lived-in room (QA demo and the decorate tutorial). */
export function furnishDemoRoom(state) {
  const add = (classTsid, x, y = null, extra = {}) => {
    state.storage[classTsid] = (state.storage[classTsid] || 0) + 1;
    const placed = placeFurniture(state, {}, classTsid, y == null ? { x } : { x, y }, extra);
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
