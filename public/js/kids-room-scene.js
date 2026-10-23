/**
 * The Kid's Room: Mr. Block's playroom (template LIF149EVS2A22H1, "The Kid's Room" in
 * inc_data_maps_prod.js), shared by Child's Play, Four Letter Words and Word Up
 * (quests/letter_block_1-3.js, all `kids_room`).
 *
 * The template's location file is not in the public locations dump, so its geometry and deco
 * list are lost. Four player Snaps of it (research/wayback/raw/snaps/letter_block_1/, reference
 * only, never shipped) show a giant child's bedroom, and this dresses the room from them with the
 * matching CC0 k04 decos (tinyspeck/glitch-locations kukubee2.swf, rendered by
 * tools/room-art/build.py into assets/sprites/quest-rooms/kids_room/):
 * - monster-print wallpaper with a torn patch above the bed, white baseboard, grey loop carpet;
 * - the tea party (Snap PIF3L2MLDT53HEF): low oval table with the mint teapot and cups, the pink
 *   tall guy on the left and the teddy on the right, two stools, the drawer dresser to its right;
 * - the kidney kids' table with CRAYLON crayons, bricks, the book, a high-top sneaker and a sock
 *   (Snap PIFILOB3DN63656), which shows the bed's corner to its right;
 * - the bed with the blue blanket and the panda on its foot, the window right of it (Snaps
 *   PIF25G8LLR53DPA, PUV5GTUKSJP2I6P), a crayon on the carpet and the ring stacker.
 * Order from the source: the instance is entered at the far left (questInstanceLocation x -1528)
 * and the quest blocks are made 1,400+ px to the right (x -150..300), with Mr. Block to their right
 * (move_avatar x 471 facing right), so the furniture sits left of the puzzle and the bed after it.
 *
 * Every piece is a bottom-centre sprite at its world size (the file's @2x / @1.5x name sets it).
 */

import { KIDS_ROOM_FILES } from './kids-room-art.js';
import { textureFromUrl } from './textures.js';

export const KIDS_ROOM_ID = 'kids_room';
export const KIDS_ROOM_TEMPLATE = 'LIF149EVS2A22H1';
export const KIDS_ROOM_W = 1900;
export const KIDS_ROOM_H = 760;
export const KIDS_ROOM_FLOOR = 620;
export const KIDS_ROOM_ART_DIR = 'assets/sprites/quest-rooms/kids_room/';

/** Piece -> k04 deco (file and world size in js/kids-room-art.js, from tools/room-art). */
export const KIDS_ROOM_ART = Object.freeze({
  wallpaper: 'k04_wallpaper_08_monsters',
  wallcrack: 'k04_wallcrack_02',
  window: 'k04_window_01',
  carpet: 'k04_carpet_01_white',
  molding: 'k04_molding_02_white',
  bed: 'k04_bed_01',
  panda: 'k04_doll_01_panda',
  dresser: 'k04_dresser_03',
  teaTable: 'k04_table_07',
  teapot: 'k04_teapot_01',
  teacup: 'k04_teacup_01',
  teddy: 'k04_teddybear_01',
  tallGuy: 'k04_tallguything_01',
  stool: 'k04_stool_01',
  kidsTable: 'k04_table_08',
  crayonGreen: 'k04_craylon_01',
  crayonPink: 'k04_craylon_02',
  crayonBlue: 'k04_craylon_03',
  brickPink: 'k04_blocko_01',
  brickBlue: 'k04_blocko_02',
  brickGreen: 'k04_blocko_03',
  brickYellow: 'k04_blocko_04',
  sneaker: 'k04_sneaker_01',
  sock: 'k04_sock_01',
  rings: 'k04_babyrings_01',
  book: 'k04_book_01_blue',
});

const WALL_BOTTOM = 590;

/**
 * Furniture, back to front: [piece, x, bottom y, opts]. x is the piece's centre. `id` names the
 * pieces other code points at (the tea party's speakers).
 */
export const KIDS_ROOM_PIECES = Object.freeze([
  // Tea party, by the entrance.
  ['dresser', 650, 604],
  ['tallGuy', 178, 592, { id: 'thing' }],
  ['teddy', 424, 598, { id: 'bear' }],
  ['teaTable', 300, 616],
  ['teapot', 292, 551],
  ['teacup', 206, 553],
  ['teacup', 244, 556],
  ['teacup', 392, 554],
  ['stool', 104, 648],
  ['stool', 512, 648],
  // The kids' table and its toys.
  ['brickBlue', 772, 603],
  ['brickGreen', 790, 603],
  ['brickPink', 781, 591],
  ['brickYellow', 812, 606],
  ['kidsTable', 870, 618],
  ['crayonBlue', 830, 571, { rotation: -0.06 }],
  ['crayonPink', 858, 566, { rotation: -0.1 }],
  ['book', 952, 622, { rotation: -0.12 }],
  ['sneaker', 1000, 606],
  ['stool', 958, 652],
  ['sock', 1030, 640],
  // The bed, the panda on its foot, the torn wallpaper and the window.
  ['wallcrack', 1604, 530],
  ['window', 1772, 548],
  ['bed', 1642, 612],
  ['panda', 1762, 548],
  ['rings', 1506, 626],
  // Strays on the carpet in front of the blocks and the bed.
  ['crayonGreen', 1235, 690, { rotation: 0.08 }],
  ['brickYellow', 1128, 684],
  ['brickPink', 1366, 700],
  ['crayonBlue', 1600, 694, { rotation: -0.04 }],
]);

/** [file, world w, world h] of a piece. */
export function kidsRoomArt(piece) {
  return KIDS_ROOM_FILES[KIDS_ROOM_ART[piece]];
}

function sprite(PIXI, piece, x, bottom, opts = {}) {
  const [file] = kidsRoomArt(piece);
  const spr = new PIXI.Sprite(textureFromUrl(`${KIDS_ROOM_ART_DIR}${file}`));
  spr.anchor.set(opts.ax ?? 0.5, opts.ay ?? 1);
  spr.x = x;
  spr.y = bottom;
  if (opts.rotation) spr.rotation = opts.rotation;
  if (opts.flip) spr.scale.x = -1;
  spr.label = opts.id || piece;
  return spr;
}

/** Repeat a tiling piece across [x0, x0 + width), its top at y. */
function strip(PIXI, root, piece, x0, y, width) {
  const [, tileW] = kidsRoomArt(piece);
  for (let x = x0; x < x0 + width; x += tileW) root.addChild(sprite(PIXI, piece, x, y, { ax: 0, ay: 0 }));
}

/**
 * The room as a Pixi container, sized width x KIDS_ROOM_H. `root.pieces` maps each piece's id to its
 * sprite; `root.platformsScreen` is the floor.
 */
export function buildKidsRoomScene(PIXI, { width = KIDS_ROOM_W, label = 'kids-room' } = {}) {
  const root = new PIXI.Container();
  root.label = label;
  root.worldW = width;
  root.worldH = KIDS_ROOM_H;
  root.platformsScreen = [{ id: 'kids-room-floor', x1: 0, y1: KIDS_ROOM_FLOOR, x2: width, y2: KIDS_ROOM_FLOOR, pc_perm: 1 }];
  root.pieces = {};

  // Behind everything, in case a texture is still loading: the wallpaper and carpet colours.
  const base = new PIXI.Graphics();
  base.rect(0, 0, width, WALL_BOTTOM).fill(0xebe7e1);
  base.rect(0, WALL_BOTTOM, width, KIDS_ROOM_H - WALL_BOTTOM).fill(0xcdc4b6);
  root.addChild(base);

  const [, , wallH] = kidsRoomArt('wallpaper');
  for (let y = WALL_BOTTOM - wallH; y > -wallH; y -= wallH) strip(PIXI, root, 'wallpaper', 0, y, width);
  const [, , carpetH] = kidsRoomArt('carpet');
  for (let y = WALL_BOTTOM - 4; y < KIDS_ROOM_H; y += carpetH) strip(PIXI, root, 'carpet', 0, y, width);
  strip(PIXI, root, 'molding', 0, WALL_BOTTOM - 26, width);

  for (const [piece, x, bottom, opts] of KIDS_ROOM_PIECES) {
    if (x - kidsRoomArt(piece)[1] / 2 > width) continue;
    const spr = sprite(PIXI, piece, x, bottom, opts);
    root.addChild(spr);
    if (opts?.id) root.pieces[opts.id] = spr;
  }
  return root;
}
