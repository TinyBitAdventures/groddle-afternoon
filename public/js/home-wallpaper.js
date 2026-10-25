/**
 * House and tower rooms built from Tiny Speck's own wallpaper, floor and ceiling
 * pieces (register rows G7 / G6). Pure: no Pixi, no DOM; homes-feature draws the list.
 *
 * Sources (CC0):
 * - glitch-locations home_wallpaper.swf / home_groddle.swf / home_tower.swf, rendered by
 *   tools/home-wallpaper/build.py into assets/homes/wallpaper/<piece>@2x|@3x.webp, with the
 *   piece map of every visible config in js/home-wallpaper-art.js (inc_data_homes.js).
 * - GameServerJS locations/inc_homes.js homes_rebuild_floor (groddle frame style, one floor of
 *   a "house-right" home), homes_get_wallpaper_segment_type, homes_get_floor_sprite,
 *   homes_get_ceiling_sprite, homes_rebuild_attic / _basement, door_pos; locations/tower.js
 *   tower_build_floor, tower_build_expansion, tower_build_elevator; locations/inc_geo_textures.js
 *   geo_textures_get_room_textures (the tower's wallpaper sequence).
 *
 * Coordinates: the source places decos by left edge and bottom (homes_add_deco adds w/2 later);
 * here each piece is { piece, x (left), y (top), w, h, flip, layer }, in room pixels with the
 * floor platform at `floorY`.
 */

import { WALLPAPER_MAPS, WALLPAPER_PIECES } from './home-wallpaper-art.js?v=home-wallpaper-art-2';

export const PIECE_DIR = 'assets/homes/wallpaper/';
export const SEG = 150;
/** inc_data_homes.js homes_interior_frames.groddle (every production interior uses it). */
export const GRODDLE_FRAME = Object.freeze({
  frameHeight: 17,
  hz: 'crosssection_horizontal_1500px_groddle1',
  hzW: 1500,
  end: 'crosssection_endwall_groddle1',
  endW: 17,
  endH: 492,
  atticLeft: 'attic_end_left',
  atticMid: 'attic_tile',
  atticRight: 'attic_end_right',
  atticH: 208,
  basementLeft: 'crosssection_ground_end_left_groddle1',
  basementMid: 'crosssection_ground_tile_groddle1',
  basementRight: 'crosssection_ground_end_right_groddle1',
  basementH: 58,
  door: 'door_asset_entry_basic',
  doorW: 75,
  doorH: 236,
  // homes_interior_frames.groddle frame_open_*: the post over a "left-open" end (17 x 245, 230 up).
  openEnd: 'crosssection_divider_end_groddle1',
  openEndW: 17,
  openEndH: 245,
  openEndY: 230,
});
/** tower.js tower_get_geo_config. */
export const TOWER_FRAME = Object.freeze({
  frameHeight: 28,
  hz: 'crosssection_tower_horizontal_1200px',
  hzW: 1200,
  baseHz: 'crosssection_tower_base_horizontal_1177px',
  wallSegments: 6,
  leftOffset: 145,
  elevator: 'signpost_asset_elevator_tower',
  elevatorW: 180,
  elevatorH: 514,
  elevatorX: 90,
});
export const LAYERS = Object.freeze(['base', 'wall', 'shadow', 'frame_h', 'frame_v']);
const KIND_KEY = { wall: 'walls', floor: 'floors', ceiling: 'ceilings' };

export function hasPiece(piece) {
  return Boolean(WALLPAPER_PIECES[piece]);
}

/** File for a piece: the 3x render where one ships and the screen wants it, else 2x. */
export function pieceUrl(piece, hires = false) {
  const has3x = WALLPAPER_PIECES[piece]?.[2] === 1;
  return `${PIECE_DIR}${piece}@${hires && has3x ? 3 : 2}x.webp`;
}

/** geo_textures_fetch_hash: the config, or the first one when the key is unknown. */
export function textureHash(kind, key) {
  const all = WALLPAPER_MAPS[KIND_KEY[kind]] || {};
  return all[key] || Object.values(all)[0] || {};
}

export function swatchPiece(kind, key) {
  return String(textureHash(kind, key).swatch || '').split(',')[0];
}

function split(value) {
  const [piece, flag] = String(value || '').split(',');
  return { piece, flip: flag === 'FLIP' };
}

function multiSeg(hash, field, index) {
  let n = 1;
  for (let k = 2; k <= 6 && hash[`${field}_${k}`]; k += 1) n = k;
  const use = (index % n) + 1;
  return use === 1 ? field : `${field}_${use}`;
}

/** homes_get_floor_sprite: the left piece at index 0, then main / main_2.. in turn. */
export function floorSprite(index, hash) {
  if (index === 0 && hash.left) return hash.left;
  return hash[multiSeg(hash, 'main', index)];
}

/** homes_get_ceiling_sprite. */
export function ceilingSprite(index, hash) {
  return hash[multiSeg(hash, 'main', index)];
}

/**
 * homes_get_wallpaper_segment_type for one floor: segment `i` of
 * ['left', 'wall' x (n - 2), 'right'] with per-segment wallpaper `walls`.
 */
export function houseWallField(walls, i) {
  const n = walls.length;
  const type = (j) => (j === 0 ? 'left' : j === n - 1 ? 'right' : j > 0 && j < n ? 'wall' : null);
  if (type(i) !== 'wall') return type(i);
  const hash = textureHash('wall', walls[i]);
  const left = type(i - 1) === 'wall' && walls[i - 1] === walls[i];
  const right = type(i + 1) === 'wall' && walls[i + 1] === walls[i];
  let seg = 'wall';
  if (left && !right) seg = 'wall_right';
  if (!left && right) seg = 'wall_left';
  if (!left && !right) seg = 'wall_single';
  if (hash[seg] === hash.wall) seg = 'wall';
  if (seg === 'wall') seg = multiSeg(hash, 'wall', i);
  return seg;
}

/** geo_textures_get_room_textures (tower walls; the last slot is the right end). */
export function towerWallField(walls, i) {
  const n = walls.length;
  if (i === n - 1) return 'right';
  const hash = textureHash('wall', walls[i]);
  const left = i > 0 && walls[i - 1] === walls[i];
  const right = i < n - 2 && walls[i + 1] === walls[i];
  let seg = 'wall';
  if (left && !right) seg = 'wall_right';
  if (!left && right) seg = 'wall_left';
  if (!left && !right) seg = 'wall_single';
  if (hash[seg] === hash.wall) seg = 'wall';
  if (seg === 'wall') seg = multiSeg(hash, 'wall', i);
  return seg;
}

function add(out, layer, piece, x, bottom, w, h, extra = {}) {
  if (!piece) return;
  out.push({ layer, piece, x, y: bottom - h, w, h, flip: false, ...extra });
}

/**
 * Every piece of one room, back to front.
 * @param {{ layout?: 'house'|'tower', wallSegments?: number, walls: string[], floor: string, ceiling: string }} state
 * @param {{ floorY?: number, construction?: boolean, leftOpen?: boolean }} [opts]
 *   leftOpen: the ground floor of a "house-right" home (inc_homes.js homes_get_floor_config 446),
 *   whose left end opens onto the back yard.
 * @returns {{ width: number, pieces: object[], walls: object[], floor: object, ceiling: object,
 *             door: object|null, elevator: object|null, top: number, bottom: number }}
 */
export function roomPieces(state, { floorY = 620, construction = false, leftOpen = false } = {}) {
  return state?.layout === 'tower'
    ? towerPieces(state, floorY, construction)
    : housePieces(state, floorY, leftOpen);
}

function housePieces(state, W, leftOpen = false) {
  const F = GRODDLE_FRAME;
  const walls = state.walls?.length ? state.walls : Array(state.wallSegments || 7).fill(state.wall);
  const n = walls.length;
  const width = n * SEG;
  const B = W + 43 + F.frameHeight; // the floor's bottom bound (frame bottom)
  const floorBottom = W + 43;
  const wallBottom = W - 65;
  const ceilBottom = W - 365;
  const out = [];
  const floorHash = textureHash('floor', state.floor);
  const ceilHash = textureHash('ceiling', state.ceiling);
  // base: floor and ceiling pieces, then their shadows
  for (let i = 0; i < n; i += 1) {
    add(out, 'base', split(floorSprite(i, floorHash)).piece, SEG * i, floorBottom, SEG, 108, { target: 'floor' });
    add(out, 'base', split(ceilingSprite(i, ceilHash)).piece, SEG * i, ceilBottom, SEG, 63, { target: 'ceiling' });
  }
  add(out, 'base', 'ceiling_shadow_left', 0, ceilBottom, 300, 50);
  add(out, 'base', 'ceiling_shadow_left', width - 300, ceilBottom, 300, 50, { flip: true });
  add(out, 'base', 'floor_shadow_left_open', 0, floorBottom, 300, 108);
  add(out, 'base', 'floor_shadow_right', width - 300, floorBottom, 300, 108);
  // wall: wallpaper and end caps; shadow: their shadows; frame_v: the end frames
  const wallTargets = [];
  for (let i = 0; i < n; i += 1) {
    const x = SEG * i;
    const field = houseWallField(walls, i);
    const hash = textureHash('wall', walls[i]);
    if (leftOpen && field === 'left' && hash.left_open) {
      // homes_rebuild_floor 'left-open' (1369-1431): the wallpaper's left_open piece and the
      // divider shadow 82 px over the frame bottom, and the frame_open post over the way out.
      const open = split(hash.left_open);
      const bottom = B - 82;
      add(out, 'wall', open.piece, x, bottom, SEG, 393, { flip: open.flip, segment: i });
      wallTargets.push({ segment: i, x, y: bottom - 393, w: SEG, h: 393 });
      add(out, 'shadow', 'wallpaper_divider_shadow', x + 18, bottom, 133, 393);
      add(out, 'frame_v', F.openEnd, x + 1, B - (F.frameHeight + F.openEndY), F.openEndW, F.openEndH);
      continue;
    }
    const { piece, flip } = split(hash[field]);
    if (field === 'left' || field === 'right') {
      add(out, 'wall', piece, x, floorBottom, SEG, 458, { flip, segment: i });
      wallTargets.push({ segment: i, x, y: floorBottom - 458, w: SEG, h: 458 });
      if (field === 'left') {
        add(out, 'shadow', 'wallpaper_end_shadow', x + 17, floorBottom, 133, 458, { flip: true });
        add(out, 'frame_v', F.end, x, B, F.endW, F.endH, { flip: true });
      } else {
        add(out, 'shadow', 'wallpaper_end_shadow', x + 1, floorBottom, 133, 458);
        add(out, 'frame_v', F.end, x + 151 - F.endW, B, F.endW, F.endH);
      }
      continue;
    }
    add(out, 'wall', piece, x, wallBottom, SEG, 300, { flip, segment: i });
    wallTargets.push({ segment: i, x, y: wallBottom - 300, w: SEG, h: 300 });
    add(out, 'shadow', 'wallpaper_back_shadow_tile', x, wallBottom, SEG, 300);
    if (i === 1) add(out, 'shadow', 'wallpaper_back_shadow_left', x, wallBottom, SEG, 300);
    if (i === n - 2) add(out, 'shadow', 'wallpaper_back_shadow_right', x, wallBottom, SEG, 300);
  }
  // frame_h: the cross-section under the floor and over the ceiling (one floor = the top floor)
  add(out, 'frame_h', F.hz, 0, B, width, F.frameHeight, { tile: F.hzW });
  add(out, 'frame_h', F.hz, 0, B - 458 - F.frameHeight, width, F.frameHeight, { tile: F.hzW });
  // attic over the top frame, basement under the floor (homes_rebuild_attic / _basement)
  const atticBottom = B - 458 - 2 * F.frameHeight;
  for (let i = 0; i < n; i += 1) {
    const atticPiece = i === 0 ? F.atticLeft : i === n - 1 ? F.atticRight : F.atticMid;
    const basePiece = i === 0 ? F.basementLeft : i === n - 1 ? F.basementRight : F.basementMid;
    add(out, 'wall', atticPiece, SEG * i, atticBottom, SEG, F.atticH, { outside: true });
    add(out, 'wall', basePiece, SEG * i, B + F.basementH, SEG, F.basementH, { outside: true });
  }
  const order = new Map(LAYERS.map((name, i) => [name, i]));
  const pieces = out.map((row, i) => ({ row, i })).sort((a, b) => order.get(a.row.layer) - order.get(b.row.layer) || a.i - b.i).map(({ row }) => row);
  return {
    width,
    pieces,
    walls: wallTargets,
    floor: { x: 0, y: floorBottom - 108, w: width, h: 108 },
    ceiling: { x: 0, y: ceilBottom - 63, w: width, h: 63 },
    // door_pos: [r - 84, b - (frame_height + 25)], drawn bottom-centre.
    door: { piece: F.door, x: width - 84, y: B - (F.frameHeight + 25), w: F.doorW, h: F.doorH },
    elevator: null,
    top: atticBottom - F.atticH,
    bottom: B + F.basementH,
    innerLeft: SEG - 74,
    innerRight: width - 76,
    // homes_rebuild_floor left-open: the floor starts at 56 and a ramp runs down to the yard
    // (x -20 at the frame bottom); the post's foot, which the way out passes under.
    ...(leftOpen ? { leftOpen: true, floorStart: 56, rampX: -20, groundY: B, openTop: B - (F.frameHeight + F.openEndY) } : {}),
  };
}

function towerPieces(state, W, construction) {
  const T = TOWER_FRAME;
  const fh = T.frameHeight;
  const width = T.leftOffset + (T.wallSegments + 1) * SEG - 17;
  const B = W + 43 + fh;
  const floorBottom = W + 43;
  const wallBottom = W - 65;
  const ceilBottom = W - 365;
  const out = [];
  const wallTargets = [];
  if (construction) {
    // tower_build_expansion: the bare tower base, open to the sky.
    add(out, 'base', 'towerbase_floor', 0, floorBottom, 1177, 108);
    add(out, 'base', 'towerbase_ceiling', 0, ceilBottom, 1177, 50);
    for (let i = 0; i <= T.wallSegments; i += 1) {
      const x = T.leftOffset + i * SEG;
      if (i === T.wallSegments) add(out, 'wall', 'towerbase_wallpaper_right', x, floorBottom, SEG, 458);
      else add(out, 'wall', i % 2 ? 'towerbase_wallpaper_wall_2' : 'towerbase_wallpaper_wall', x, wallBottom, SEG, 300);
    }
    add(out, 'frame_h', T.baseHz, 0, W + 43 - 458, 1177, fh);
  } else {
    const walls = state.walls?.length ? state.walls : Array(T.wallSegments + 1).fill(state.wall);
    const floorHash = textureHash('floor', state.floor);
    const ceilHash = textureHash('ceiling', state.ceiling);
    for (let i = 0; i < T.wallSegments + 2; i += 1) {
      add(out, 'base', split(floorSprite(i, floorHash)).piece, SEG * i, floorBottom, SEG, 108, { target: 'floor' });
      add(out, 'base', split(ceilingSprite(i, ceilHash)).piece, SEG * i, ceilBottom, SEG, 63, { target: 'ceiling' });
    }
    add(out, 'base', 'ceiling_shadow_left', width + 17 - 300, ceilBottom, 300, 50, { flip: true });
    add(out, 'base', 'floor_shadow_right', width + 17 - 300, floorBottom, 300, 108);
    for (let i = 0; i <= T.wallSegments; i += 1) {
      const x = T.leftOffset + i * SEG;
      const field = towerWallField(walls, i);
      const { piece, flip } = split(textureHash('wall', walls[i])[field]);
      if (i === T.wallSegments) {
        add(out, 'wall', piece, x, floorBottom, SEG, 458, { flip, segment: i });
        add(out, 'shadow', 'wallpaper_end_shadow', x + 1, floorBottom, 133, 458);
        wallTargets.push({ segment: i, x, y: floorBottom - 458, w: SEG, h: 458 });
      } else {
        add(out, 'wall', piece, x, wallBottom, SEG, 300, { flip, segment: i });
        add(out, 'shadow', 'wallpaper_back_shadow_tile', x, wallBottom, SEG, 300);
        if (i === 0) add(out, 'shadow', 'wallpaper_back_shadow_left', x, wallBottom, SEG, 300);
        if (i === T.wallSegments - 1) add(out, 'shadow', 'wallpaper_back_shadow_right', x, wallBottom, SEG, 300);
        wallTargets.push({ segment: i, x, y: wallBottom - 300, w: SEG, h: 300 });
      }
    }
  }
  // The floor's own frame below, and the next floor's (or the roof's) above.
  // tower_build_expansion (tower.js 1050-1056) gives the construction floor
  // only the base frame over its open top; the frame under it is the top
  // frame of the finished floor below (tower_build_floor is_top).
  add(out, 'frame_h', T.hz, 0, B, width, fh, { tile: T.hzW });
  if (!construction) add(out, 'frame_h', T.hz, 0, B - 458 - fh, width, fh, { tile: T.hzW });
  const order = new Map(LAYERS.map((name, i) => [name, i]));
  const pieces = out.map((row, i) => ({ row, i })).sort((a, b) => order.get(a.row.layer) - order.get(b.row.layer) || a.i - b.i).map(({ row }) => row);
  return {
    width,
    pieces,
    walls: wallTargets,
    floor: { x: 0, y: floorBottom - 108, w: width, h: 108 },
    ceiling: { x: 0, y: ceilBottom - 63, w: width, h: 63 },
    door: null,
    // tower_build_elevator: the signpost deco at x 90 (centre), standing on the floor's bound.
    elevator: { piece: T.elevator, x: T.elevatorX, y: B, w: T.elevatorW, h: T.elevatorH },
    top: B - 458 - 2 * fh,
    bottom: B,
    innerLeft: 130,
    innerRight: width - 76,
  };
}

/**
 * HandOfDecorator stamping: which wall a point hits, and whether it is inside the
 * segment's centre (SwatchTarget inset 45 px on every side) - centre papers one
 * segment, anywhere else on the wall papers the whole room.
 */
export function wallTargetAt(room, x, y, inset = 45) {
  for (const t of room.walls) {
    if (x < t.x || x >= t.x + t.w || y < t.y || y >= t.y + t.h) continue;
    const center = x >= t.x + inset && x < t.x + t.w - inset && y >= t.y + inset && y < t.y + t.h - inset;
    return { segment: t.segment, center, target: t };
  }
  return null;
}

/** Floor / ceiling / wall under a point, for the stamping cursor. */
export function surfaceAt(room, x, y) {
  const inRect = (r) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;
  if (inRect(room.floor)) return 'floor';
  if (inRect(room.ceiling)) return 'ceiling';
  return wallTargetAt(room, x, y) ? 'wall' : null;
}
