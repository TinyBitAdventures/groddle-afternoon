import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { HOME_TEXTURE_CONFIGS } from '../public/js/homes-catalog.js';
import { WALLPAPER_MAPS, WALLPAPER_PIECES } from '../public/js/home-wallpaper-art.js';
import {
  GRODDLE_FRAME,
  PIECE_DIR,
  SEG,
  ceilingSprite,
  floorSprite,
  houseWallField,
  pieceUrl,
  roomPieces,
  surfaceAt,
  swatchPiece,
  towerWallField,
  wallTargetAt,
} from '../public/js/home-wallpaper.js';
import {
  INTERIOR,
  TOWER_ROOM,
  createHomeDecorState,
  expandInterior,
  interiorBounds,
  interiorWidth,
  normalizeHomeDecorState,
  setHomeTexture,
  wallSlots,
} from '../public/js/home-decor.js?v=g418-1';
import { TOWER_GEO } from '../public/js/home-tower.js';

const root = join(import.meta.dirname, '..');
const pub = join(root, 'public');
const sha16 = (file) => createHash('sha256').update(readFileSync(file)).digest('hex').slice(0, 16);

describe('recovered house wallpaper art (G7)', () => {
  it('ships a 2x file for every piece, and a 3x file exactly where the map says', () => {
    for (const [piece, [, , has3x]] of Object.entries(WALLPAPER_PIECES)) {
      assert.ok(existsSync(join(pub, `${PIECE_DIR}${piece}@2x.webp`)), piece);
      assert.equal(existsSync(join(pub, `${PIECE_DIR}${piece}@3x.webp`)), has3x === 1, `${piece} 3x`);
    }
    assert.ok(Object.keys(WALLPAPER_PIECES).length >= 480);
  });

  it('matches the build plan hashes (tools/home-wallpaper/build.py)', () => {
    const plan = JSON.parse(readFileSync(join(root, 'tools/home-wallpaper/plan.json'), 'utf8'));
    for (const [piece, row] of Object.entries(plan.pieces)) {
      assert.equal(sha16(join(pub, `${PIECE_DIR}${piece}@2x.webp`)), row.sha_2x, piece);
      if (row.sha_3x) assert.equal(sha16(join(pub, `${PIECE_DIR}${piece}@3x.webp`)), row.sha_3x, `${piece} 3x`);
    }
  });

  it('maps every visible GSJS swatch to its own pieces and swatch art', () => {
    for (const [kind, configs] of [['wall', 'walls'], ['floor', 'floors'], ['ceiling', 'ceilings']]) {
      for (const key of Object.keys(HOME_TEXTURE_CONFIGS[configs])) {
        const map = WALLPAPER_MAPS[configs][key];
        assert.ok(map, `${kind} ${key}`);
        for (const value of Object.values(map)) assert.ok(WALLPAPER_PIECES[value.split(',')[0]], `${key}: ${value}`);
        assert.ok(swatchPiece(kind, key), `${kind} ${key} swatch`);
      }
    }
    // inc_data_homes.js: right end caps are mirrored left caps unless the paper has its own.
    assert.equal(WALLPAPER_MAPS.walls['8bit'].right, 'eightbit_left,FLIP');
    assert.equal(WALLPAPER_MAPS.walls.color_brick.right, 'color_brick_right');
    assert.equal(WALLPAPER_MAPS.walls.brown_molding.wall_left, 'brownbaseboard_molding_wall_left');
    assert.equal(WALLPAPER_MAPS.floors.starter_crappy.left, 'starter_crappy_floor_left');
    // placed sizes from inc_homes.js: walls 150 x 300, end caps 150 x 458, floors 150 x 108, ceilings 150 x 63
    assert.deepEqual(WALLPAPER_PIECES.eightbit_wall.slice(0, 2), [150, 300]);
    assert.deepEqual(WALLPAPER_PIECES.eightbit_left.slice(0, 2), [150, 458]);
    assert.deepEqual(WALLPAPER_PIECES.starter_crappy_floor.slice(0, 2), [150, 108]);
    assert.deepEqual(WALLPAPER_PIECES.starter_crappy_ceiling.slice(0, 2), [150, 63]);
    assert.equal(pieceUrl('eightbit_wall'), 'assets/homes/wallpaper/eightbit_wall@2x.webp');
  });
});

describe('room composition (inc_homes.js homes_rebuild_floor)', () => {
  const room = (walls, extra = {}) => roomPieces({ walls, floor: 'woodpanel', ceiling: 'wood', ...extra });

  it('papers end caps, room ends and runs like homes_get_wallpaper_segment_type', () => {
    const molding = Array(7).fill('brown_molding');
    assert.deepEqual(molding.map((_, i) => houseWallField(molding, i)), ['left', 'wall_left', 'wall', 'wall', 'wall', 'wall_right', 'right']);
    const mixed = [...molding];
    mixed[3] = 'red_brick';
    assert.deepEqual(mixed.map((_, i) => houseWallField(mixed, i)), ['left', 'wall_left', 'wall_right', 'wall', 'wall_left', 'wall_right', 'right']);
    // Papers whose end pieces are the plain wall reduce to 'wall'; multi-wall papers cycle wall_2..6.
    const bits = Array(9).fill('8bit');
    assert.deepEqual(bits.map((_, i) => houseWallField(bits, i)).slice(1, 8), ['wall_2', 'wall_3', 'wall_4', 'wall_5', 'wall_6', 'wall', 'wall_2']);
  });

  it('lays floor, ceiling, walls, shadows and the groddle frame in source order and size', () => {
    const r = room(Array(7).fill('brown_molding'));
    assert.equal(r.width, 7 * SEG);
    const layers = r.pieces.map((p) => p.layer);
    assert.deepEqual([...new Set(layers)], ['base', 'wall', 'shadow', 'frame_h', 'frame_v']);
    const floors = r.pieces.filter((p) => p.target === 'floor');
    assert.equal(floors.length, 7);
    assert.equal(floors[0].piece, WALLPAPER_MAPS.floors.woodpanel.left);
    assert.equal(floors[0].y + floors[0].h, INTERIOR.floorY + 43);
    const ceil = r.pieces.find((p) => p.target === 'ceiling');
    assert.equal(ceil.y + ceil.h, INTERIOR.wallTop);
    const left = r.pieces.find((p) => p.segment === 0);
    assert.deepEqual([left.piece, left.y, left.h, left.flip], ['brownbaseboard_molding_left', INTERIOR.floorY + 43 - 458, 458, false]);
    const right = r.pieces.find((p) => p.segment === 6);
    assert.deepEqual([right.piece, right.flip], ['brownbaseboard_molding_left', true]);
    const wall = r.pieces.find((p) => p.segment === 3);
    assert.deepEqual([wall.y, wall.h], [INTERIOR.wallTop, 300]);
    assert.equal(r.pieces.filter((p) => p.piece === GRODDLE_FRAME.hz).length, 2);
    assert.equal(r.pieces.filter((p) => p.piece === GRODDLE_FRAME.end).length, 2);
    assert.equal(r.pieces.filter((p) => p.piece === 'attic_tile').length, 5);
    assert.ok(r.pieces.every((p) => WALLPAPER_PIECES[p.piece]), 'every piece ships');
    // door_pos: 84 px in from the right end, frame_height + 25 above the floor's bound
    assert.deepEqual([r.door.x, r.door.y], [7 * SEG - 84, INTERIOR.floorY + 60 - 42]);
    assert.deepEqual([r.innerLeft, r.innerRight], [76, 7 * SEG - 76]);
  });

  it('picks floor left pieces and multi-piece ceilings', () => {
    const uralia = WALLPAPER_MAPS.floors.uralia_floor;
    assert.equal(floorSprite(0, uralia), uralia.left);
    assert.equal(floorSprite(1, uralia), uralia.main_2 ? uralia.main_2 : uralia.main);
    const ceil = WALLPAPER_MAPS.ceilings.uralia_ceiling;
    assert.equal(ceilingSprite(0, ceil), ceil.main);
  });

  it('builds a tower floor like tower_build_floor, and the bare base while it is built', () => {
    const walls = Array(7).fill('creamy_stripes');
    const t = roomPieces({ layout: 'tower', walls, floor: 'woodpanel', ceiling: 'wood' });
    assert.equal(t.width, TOWER_GEO.width);
    assert.equal(t.pieces.filter((p) => p.target === 'floor').length, 8);
    assert.equal(t.walls.length, 7);
    assert.equal(t.walls[0].x, 145);
    assert.equal(towerWallField(walls, 6), 'right');
    assert.deepEqual([t.elevator.piece, t.elevator.x, t.elevator.w, t.elevator.h], ['signpost_asset_elevator_tower', 90, 180, 514]);
    const c = roomPieces({ layout: 'tower', walls, floor: 'woodpanel', ceiling: 'wood' }, { construction: true });
    assert.ok(c.pieces.some((p) => p.piece === 'towerbase_floor'));
    assert.ok(c.pieces.some((p) => p.piece === 'towerbase_wallpaper_right'));
    assert.equal(c.walls.length, 0);
    // tower.js 1050-1056: only the base frame over the open top (where the regular top frame sat); the regular frame stays under it
    const frames = (r) => r.pieces.filter((p) => p.layer === 'frame_h').map((p) => `${p.piece}@${p.y}`);
    const fl = frames(t);
    const fc = frames(c);
    assert.equal(fl.length, 2);
    assert.deepEqual(fc, [`crosssection_tower_base_horizontal_1177px@${fl[1].split("@")[1]}`, fl[0]]);
  });

  it('hits a segment centre (45 px inset) for one segment, its edge for the whole room', () => {
    const r = room(Array(7).fill('grey_unfinished'));
    const mid = wallTargetAt(r, 3 * SEG + 75, INTERIOR.wallTop + 150);
    assert.deepEqual([mid.segment, mid.center], [3, true]);
    const edge = wallTargetAt(r, 3 * SEG + 10, INTERIOR.wallTop + 150);
    assert.deepEqual([edge.segment, edge.center], [3, false]);
    assert.equal(surfaceAt(r, 500, INTERIOR.floorY), 'floor');
    assert.equal(surfaceAt(r, 500, INTERIOR.wallTop - 20), 'ceiling');
    assert.equal(surfaceAt(r, 500, INTERIOR.wallTop + 100), 'wall');
  });
});

describe('per-segment wallpaper in the saved house', () => {
  it('papers one segment or the whole room, and grows like homes_extend', () => {
    const state = createHomeDecorState();
    assert.equal(wallSlots(state), 7);
    assert.equal(setHomeTexture(state, 'wall', 'red_brick', { segment: 3 }).segment, 3);
    assert.equal(state.walls[3], 'red_brick');
    assert.equal(state.wall, 'grey_unfinished');
    assert.equal(setHomeTexture(state, 'wall', 'red_brick', { segment: 3 }).reason, 'same');
    assert.equal(setHomeTexture(state, 'wall', 'red_brick', { segment: 7 }).reason, 'bad_segment');
    state.walls[5] = 'pink_stucco';
    expandInterior(state, { wall_segment: 1 });
    assert.deepEqual(state.walls, ['grey_unfinished', 'grey_unfinished', 'grey_unfinished', 'red_brick', 'grey_unfinished', 'pink_stucco', 'pink_stucco', 'grey_unfinished']);
    setHomeTexture(state, 'wall', 'navy_stucco');
    assert.deepEqual(new Set(state.walls), new Set(['navy_stucco']));
    const copy = normalizeHomeDecorState(JSON.parse(JSON.stringify(state)));
    assert.deepEqual(copy.walls, state.walls);
  });

  it('repairs a walls list that does not fit the room', () => {
    const short = normalizeHomeDecorState({ wallSegments: 9, wall: 'red_brick', walls: ['red_brick', 'pink_stucco', 'nope', 'red_brick'] });
    assert.equal(short.walls.length, 9);
    assert.equal(short.walls[2], 'red_brick');
    assert.equal(short.walls.at(-1), 'red_brick');
    const long = normalizeHomeDecorState({ wallSegments: 7, walls: Array(12).fill('pink_stucco') });
    assert.equal(long.walls.length, 7);
    const tower = normalizeHomeDecorState({ layout: 'tower', wallSegments: 6 });
    assert.equal(tower.walls.length, 7);
    assert.equal(interiorWidth(tower), TOWER_ROOM.width);
    assert.deepEqual(interiorBounds(tower), { left: 130, right: TOWER_ROOM.width - 76, width: TOWER_ROOM.width });
  });

  it('moves furniture from saves made before the 150 px room into the new one', () => {
    const old = {
      wallSegments: 7,
      placed: [
        { id: 1, classTsid: 'furniture_chair', x: 1300, y: 620 },
        { id: 2, classTsid: 'furniture_ceilinglamp', x: 700, y: 352 },
        { id: 3, classTsid: 'furniture_table', x: 700, y: 620 },
        { id: 4, classTsid: 'furniture_tablelamp', x: 720, y: 540, on: 3 },
      ],
    };
    const state = normalizeHomeDecorState(old);
    const { left, right } = interiorBounds(state);
    for (const row of state.placed) assert.ok(row.x >= left && row.x <= right, `${row.classTsid} ${row.x}`);
    assert.equal(state.placed[1].y, INTERIOR.ceilingY);
    assert.equal(state.placed[3].x - state.placed[2].x, 20);
    assert.equal(state.geo, 2);
    // Already migrated saves stay put.
    const again = normalizeHomeDecorState(JSON.parse(JSON.stringify(state)));
    assert.deepEqual(again.placed, state.placed);
  });
});
