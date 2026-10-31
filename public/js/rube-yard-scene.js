/**
 * The Rube's yard (G66): the backdrop of The Wrizzards and The Rube (quests/rube_spy.js, instance
 * `the_wrizzards_and_the_rube` from template LIFJM2QDA093KA6).
 *
 * The template's location file is not in the public locations dump, so its geometry and deco list
 * are lost. Two player Snaps of it (research/wayback/raw/snaps/rube_spy/, PCR10H57OAV1816 and
 * PHFEBGS0MAD2KGT; reference only, never shipped) show a dusky junk garden, and almost every piece
 * in them is a CC0 Tiny Speck deco: Groddle "bling" (the pair of pink flamingos, the peppermint
 * lollipop, the candy cane, the bird bath, the birdhouse on its post, the tree hollow with glowing
 * eyes, the shelf fungus on the trunk, king boletes, purple wild mushrooms, the stone monuments)
 * and Firebog pieces (the round yellow tables, the jars, the lanterns, the hanging fruit charms, the
 * red toadstool mushrooms, the log, the basket, the boat planter, the "Open House" sign and the rook
 * skull on its box), plus the Bureaucratic Hall's "Please wait here for the next available agent"
 * sign by the cave. Most are already rasterised in assets/decos/groddle/; the three that were not
 * come from tools/room-art/build.py (set rube_yard, js/rube-yard-art.js).
 *
 * Drawn as clean vectors (no matching deco): the terraced dirt banks with their grass ledges, the
 * picket fences, the big tree's trunk and limbs, the dark canopy, and the stone cave mouth.
 *
 * Layout from the Snaps, which frame the same width as the remake's view (one Snap px is ~1.5
 * world px): two terraces behind the lawn (the upper one fenced; the flamingos, the Open House sign
 * and a table of jars on the lower one), the lollipop and toadstool on the left, the campfire in red
 * flowers by the big tree with the glowing eyes, the hanging bulb, the bird bath, the stone and the
 * waiting sign before the cave mouth on the right, and a pond, tables and the candy cane in front.
 */

import { RUBE_YARD_FILES } from './rube-yard-art.js?v=0a67d3e6';
import { textureFromUrl } from './textures.js?v=db2ce452';

export const YARD_W = 1900;
export const YARD_H = 760;
export const YARD_FLOOR = 620;
export const YARD_ART_DIR = 'assets/sprites/quest-rooms/rube_yard/';
/** Ledge tops of the two terraces and the top of the lawn. */
export const TIER1 = YARD_FLOOR - 250;
export const TIER2 = YARD_FLOOR - 165;
export const LAWN_TOP = YARD_FLOOR - 92;

const F = YARD_FLOOR;

/**
 * A yard piece: a room-art render (js/rube-yard-art.js, drawn at its world size times `scale`) or a
 * deco from assets/decos/groddle/ (through the room kit).
 */
export function yardDeco(PIXI, kit, name, x, y, opts = {}) {
  const art = RUBE_YARD_FILES[name];
  if (!art) return kit.deco(PIXI, name, x, y, opts);
  const spr = new PIXI.Sprite(textureFromUrl(`${YARD_ART_DIR}${art[0]}`));
  spr.anchor.set(opts.ax ?? 0.5, opts.ay ?? 1);
  const s = opts.scale ?? 1;
  spr.scale.set(opts.flip ? -s : s, s);
  spr.x = x;
  spr.y = y;
  if (opts.alpha != null) spr.alpha = opts.alpha;
  return spr;
}

/**
 * Background pieces, back to front: [deco, x, bottom y, opts]. `ay: 0` hangs a piece from its top.
 * Hiding-spot covers live in js/quest-rooms/rube-yard.js (they sit in front of the Wrizzards).
 */
export const YARD_PIECES = Object.freeze([
  // The lower terrace: the Open House sign, the flamingos, a table of jars.
  ['open_house_sign', 640, TIER2 + 4, { scale: 0.9 }],
  ['bling_flamingo_1', 790, TIER2 + 4, { scale: 0.26 }],
  ['table', 930, TIER2 + 4, { scale: 0.3 }],
  ['jar1', 910, TIER2 - 38, { scale: 0.42 }],
  ['jar3', 950, TIER2 - 38, { scale: 0.42 }],
  ['flower_bush_1', 1210, TIER2 + 6, { scale: 0.3 }],
  // Hanging fruit charms and lanterns under the canopy.
  ['hanging_eggs_decor', 150, F - 345, { scale: 0.3, ay: 0 }],
  ['hanging_eggs_decor', 1330, F - 350, { scale: 0.28, ay: 0, flip: true }],
  ['hanging_lightbulb', 1062, F - 330, { scale: 0.55, ay: 0 }],
  ['lantern_stacked', 1592, F - 305, { scale: 0.55, ay: 0 }],
  ['lantern', 1648, F - 262, { scale: 0.6, ay: 0 }],
  // The lawn, left to right.
  ['decor_plants_basket', 140, F - 30, { scale: 0.26 }],
  ['tree_dead_2', 250, F - 44, { scale: 0.36 }],
  ['bling_birdhouse_1', 352, F + 2, { scale: 0.42 }],
  ['rock_dull_mid1', 450, F - 2, { scale: 0.4 }],
  ['bling_lollipop_1', 640, F - 10, { scale: 0.4 }],
  ['bling_branchflowerbrush_red_1', 800, F - 26, { scale: 0.34 }],
  ['fire', 838, F - 34, { scale: 0.55 }],
  ['bling_branchflowerbrush_red_2', 872, F - 22, { scale: 0.34, flip: true }],
  ['bling_treehole_1', 940, F - 70, { scale: 0.42 }],
  ['bling_mushroom_oyster_1', 1003, F - 104, { scale: 0.36 }],
  ['bling_mushroom_oyster_1', 918, F - 178, { scale: 0.26, flip: true }],
  ['boat', 1200, F - 46, { scale: 0.42 }],
  ['bling_mushroom_king_bolete_1', 1075, F - 4, { scale: 0.5 }],
  ['mushrooms', 1228, F - 6, { scale: 0.42 }],
  ['bureaucratic_hall_sign_wait_1', 1448, F - 26, { scale: 1 }],
  ['table', 1392, F + 2, { scale: 0.4 }],
  ['jar1', 1380, F - 54, { scale: 0.5 }],
  ['lantern', 1722, F - 190, { scale: 0.5, ay: 0, alpha: 0.9 }],
  ['bling_treeface_1', 1814, F + 4, { scale: 0.55 }],
  // In front of the walking line: the pond, mushrooms and stones on the front lawn.
  ['k03_pond_01', 790, F + 52, { scale: 0.15, tint: 0x6fb89a, alpha: 0.75 }],
  ['bling_wildmushrooms_2', 300, F + 42, { scale: 0.6 }],
  ['rock_dull_fore1', 70, F + 60, { scale: 0.5 }],
  ['rock_dull_fore3', 150, F + 72, { scale: 0.36 }],
  ['bling_wildmushrooms_1', 1560, F + 66, { scale: 0.6 }],
  ['bling_wildmushrooms_3', 1150, F + 80, { scale: 0.6 }],
]);

/** Pieces drawn in front of the avatar (entity z 60): the candy cane on the front lawn. */
export const YARD_FRONT = Object.freeze([
  ['bling_candycane_1', 1080, F + 66, { scale: 0.42 }],
]);

/** The big tree: trunk centre x, and where the hollow with the glowing eyes sits. */
export const YARD_TREE = Object.freeze({ x: 940, hollowY: F - 70 });
/** The cave mouth on the right (the Rube's stash sits in front of it). */
export const YARD_CAVE = Object.freeze({ x: 1690, w: 170, h: 185 });

function hash(i) {
  const s = Math.sin(i * 127.1) * 43758.5453;
  return s - Math.floor(s);
}

/** A dirt bank from yTop to yBot with darker strata and grey pebbles. */
function bank(g, yTop, yBot, fill, strata, seed) {
  g.rect(-200, yTop, YARD_W + 400, yBot - yTop).fill(fill);
  for (let i = 0; i < 3; i++) {
    const y = yTop + ((i + 1) * (yBot - yTop)) / 4;
    g.rect(-200, y, YARD_W + 400, 3).fill({ color: strata, alpha: 0.7 });
  }
  for (let i = 0; i < 46; i++) {
    const x = hash(seed + i) * YARD_W;
    const y = yTop + 8 + hash(seed + i + 99) * (yBot - yTop - 14);
    g.ellipse(x, y, 4 + hash(seed - i) * 4, 3 + hash(seed + 2 * i) * 2);
  }
  g.fill({ color: 0x8a8576, alpha: 0.75 });
}

/** A grass ledge strip with a lighter lip. */
function ledge(g, y, fill, lip) {
  g.rect(-200, y - 8, YARD_W + 400, 16).fill(fill);
  g.rect(-200, y - 8, YARD_W + 400, 4).fill(lip);
}

/** A picket fence standing on y from x0 to x1. */
function fence(g, x0, x1, y, h) {
  for (let x = x0; x < x1; x += 15) {
    g.roundRect(x, y - h, 9, h + 4, 3);
  }
  g.fill(0xb9a874);
  g.rect(x0 - 4, y - h * 0.78, x1 - x0 + 4, 5).fill(0x9d8c5c);
  g.rect(x0 - 4, y - h * 0.32, x1 - x0 + 4, 5).fill(0x9d8c5c);
}

/** The big tree's trunk and limbs (vector), its base hidden by the root flare cover. */
function drawTree(g) {
  const { x } = YARD_TREE;
  g.poly([x - 84, F - 4, x - 60, F - 120, x - 50, F - 250, x - 64, F - 330, x + 50, F - 330,
    x + 48, F - 240, x + 60, F - 110, x + 90, F - 4]).fill(0x4b2d17);
  g.poly([x + 12, F - 4, x + 18, F - 140, x + 14, F - 320, x + 40, F - 320, x + 34, F - 230,
    x + 46, F - 110, x + 66, F - 4]).fill({ color: 0x5f3a1f, alpha: 0.9 });
  g.poly([x - 66, F - 6, x - 48, F - 118, x - 40, F - 250, x - 52, F - 320, x - 34, F - 320,
    x - 28, F - 240, x - 36, F - 120, x - 46, F - 6]).fill({ color: 0x3a2211, alpha: 0.8 });
  // Limbs: one up-left into the canopy, one right that holds the hanging bulb.
  g.poly([x - 40, F - 250, x - 170, F - 330, x - 150, F - 344, x - 34, F - 280]).fill(0x4b2d17);
  g.poly([x + 36, F - 268, x + 150, F - 330, x + 162, F - 316, x + 40, F - 238]).fill(0x4b2d17);
}

/** The stone cave mouth at the right end. */
function drawCave(g) {
  const { x, w, h } = YARD_CAVE;
  g.poly([1540, F + 2, 1556, F - 150, 1600, F - 260, 1660, F - 330, 1800, F - 345, 1920, F - 330,
    1920, F + 2]).fill(0x9c8768);
  g.poly([1600, F - 260, 1660, F - 330, 1800, F - 345, 1880, F - 320, 1760, F - 300, 1650, F - 240])
    .fill({ color: 0xb8a37f, alpha: 0.85 });
  for (const [cx, cy, rx, ry] of [[1590, F - 120, 18, 7], [1625, F - 205, 26, 8], [1795, F - 250, 30, 9],
    [1860, F - 150, 22, 7], [1580, F - 40, 14, 5]]) g.ellipse(cx, cy, rx, ry);
  g.fill({ color: 0x7d6a50, alpha: 0.8 });
  // The opening: a dark arch with a warmer floor.
  g.moveTo(x - w / 2, F + 2);
  g.lineTo(x - w / 2, F - h * 0.55);
  g.quadraticCurveTo(x - w / 2, F - h, x, F - h);
  g.quadraticCurveTo(x + w / 2, F - h, x + w / 2, F - h * 0.55);
  g.lineTo(x + w / 2, F + 2);
  g.closePath();
  g.fill(0x1f1a12);
  g.ellipse(x, F - 4, w * 0.42, 10).fill({ color: 0x3b2f1f, alpha: 0.9 });
}

/** Dark canopy clumps across the top of the view. */
function drawCanopy(g) {
  for (let i = 0; i < 30; i++) {
    const x = -60 + i * 70 + hash(i + 7) * 40;
    const y = F - 372 + hash(i + 31) * 40;
    g.ellipse(x, y, 60 + hash(i + 3) * 40, 34 + hash(i + 5) * 18);
  }
  g.fill(0x18240f);
  for (let i = 0; i < 24; i++) {
    const x = -20 + i * 85 + hash(i + 70) * 40;
    const y = F - 340 + hash(i + 51) * 22;
    g.ellipse(x, y, 34 + hash(i + 13) * 22, 16 + hash(i + 17) * 10);
  }
  g.fill(0x22331a);
}

/**
 * The yard behind the entity layer as a kit.sceneRoot (layers: sky, far canopy, the yard).
 */
export function buildRubeYardBackground(PIXI, kit) {
  const root = kit.sceneRoot(PIXI, YARD_W, YARD_H);
  root.label = 'rube-yard';
  const sky = root.layer(0, 0);
  sky.addChild(kit.gradient(PIXI, [[0, '#17220f'], [0.5, '#283819'], [1, '#3f4d24']], 960, 620));
  const far = root.layer(0.6, 1);
  for (let i = 0; i < 7; i++) {
    far.addChild(kit.deco(PIXI, 'tree_canopy_1', 80 + i * 330, TIER1 + 30, { scale: 0.34, tint: 0x24331a, flip: i % 2 === 1 }));
  }
  const yard = root.layer(1, 3);
  const g = new PIXI.Graphics();
  fence(g, -20, YARD_W + 20, TIER1, 46);
  bank(g, TIER1, TIER2, 0x5e3920, 0x4a2c18, 11);
  ledge(g, TIER1, 0x66752a, 0x86973a);
  fence(g, 975, 1420, TIER2, 34);
  bank(g, TIER2, LAWN_TOP, 0x6e4125, 0x58331c, 57);
  ledge(g, TIER2, 0x748a2c, 0x93a83c);
  g.rect(-200, LAWN_TOP, YARD_W + 400, YARD_H - LAWN_TOP + 200).fill(0x39741c);
  g.rect(-200, LAWN_TOP, YARD_W + 400, 6).fill(0x5c9a2a);
  g.rect(-200, F - 30, YARD_W + 400, YARD_H - F + 230).fill(0x44891f);
  for (let i = 0; i < 26; i++) g.ellipse(hash(i + 300) * YARD_W, F + 18 + hash(i + 301) * 120, 40 + hash(i + 302) * 50, 9);
  g.fill({ color: 0x3f8420, alpha: 0.8 });
  yard.addChild(g);
  const back = new PIXI.Graphics();
  drawCave(back);
  drawTree(back);
  yard.addChild(back);
  // Dusk light: the fire's warm pool and the hollow's eye glow.
  yard.addChild(kit.glow(PIXI, 838, F - 60, 0xffb347, 44)).alpha = 0.45;
  for (const [name, x, y, opts] of YARD_PIECES) yard.addChild(yardDeco(PIXI, kit, name, x, y, opts));
  const eyes = kit.glow(PIXI, YARD_TREE.x, YARD_TREE.hollowY - 74, 0xffd23a, 22);
  eyes.alpha = 0.35;
  yard.addChild(eyes);
  root.eyeGlow = eyes;
  // The far canopy scrolls sideways only (vertical parallax would sink it behind the banks).
  root.updateParallax = (camX = 0, camY = 0, viewW = 0, viewH = 0, canvasH = viewH) => {
    sky.x = camX;
    sky.y = camY;
    kit.fillView?.(sky, viewW, canvasH);
    far.x = camX * (1 - far.factor);
  };
  const top = new PIXI.Graphics();
  drawCanopy(top);
  yard.addChild(top);
  // Tiny lawn flowers in front.
  const fl = new PIXI.Graphics();
  for (let i = 0; i < 40; i++) fl.circle(hash(i + 500) * YARD_W, F + 26 + hash(i + 501) * 110, 2.4);
  fl.fill({ color: 0x9fb8ff, alpha: 0.9 });
  for (let i = 0; i < 24; i++) fl.circle(hash(i + 600) * YARD_W, F + 30 + hash(i + 601) * 100, 2.6);
  fl.fill({ color: 0xd59cf0, alpha: 0.9 });
  yard.addChild(fl);
  return root;
}
