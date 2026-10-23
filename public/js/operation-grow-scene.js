/**
 * Operation Grow's bog fields (G67): the look of quests/where_the_blue_grew.js's instance
 * `operation_grow` (template LIFI8QG9A093USI, lost from the public locations dump).
 *
 * Its one player Snap (research/wayback/raw/snaps/where_the_blue_grew/PIFOC6038Q53T2J, reference
 * only, never shipped) shows a dusky blue field: a pale glowing dome on the horizon among blue baobab
 * silhouettes, slate hills, dark cratered ground with slate boulders, and rows of tall stalks studded
 * with orbs standing in gravel rings. Every piece is a CC0 Firebog deco: the stalk is `plants1`
 * (one in the Snap keeps its own green, the rest are teal with glowing cyan orbs: "where the blue
 * grew"), the baobabs are the bottletree silhouettes and bg2_tree1, the dome is backhill3_blue, the
 * boulders stone_moss, the craters ground_spots_dark, the rings gravel_1. The recoloured copies and the
 * cyan orb glow (magic_mushroom_light_blue) come from tools/room-art/build.py (set operation_grow,
 * js/operation-grow-art.js); the rest are in assets/decos/groddle/. The sky, the hills and the
 * ground are clean vectors in the Snap's colours.
 *
 * A gloomy patch is a green stalk; tending blooms it into the blue stalk with lit cyan orbs.
 */

import { OPERATION_GROW_FILES } from './operation-grow-art.js?v=g67-1';
import { textureFromUrl } from './textures.js';

export const GROW_ART_DIR = 'assets/sprites/quest-rooms/operation_grow/';

/**
 * Orb centres on the plants1 render (js/operation-grow-art.js, 78 x 232 world px), from its
 * bottom-centre: read off the render's 15 orb discs (3 on the stem, 6 pairs on the branches).
 */
export const STALK_ORBS = Object.freeze([
  [-1, -222], [28, -207], [-29, -207], [-29, -174], [28, -175], [-1, -153], [28, -138], [-29, -138],
  [-29, -106], [28, -106], [-1, -79], [28, -63], [-29, -63], [-29, -31], [28, -31],
]);
/** The Snap's stalks are wider than plants1's own proportions (stretched placements). */
export const STALK_STRETCH_X = 1.3;

/** Snap colours (sampled from PIFOC6038Q53T2J). */
export const GROW_COLOURS = Object.freeze({
  skyTop: '#3d637a', skyMid: '#6093b0', skyLow: '#6fa1c4', hillFar: 0x5b7e8e, hillMid: 0x425a64,
  hillNear: 0x3e5157, ground: 0x34312c, front: 0x262626, orb: 0x01c2c1,
});

/** A room-art piece at its world size (bottom-centre anchored). */
export function growArt(PIXI, name, x, y, opts = {}) {
  const [file] = OPERATION_GROW_FILES[name];
  const spr = new PIXI.Sprite(textureFromUrl(`${GROW_ART_DIR}${file}`));
  spr.anchor.set(opts.ax ?? 0.5, opts.ay ?? 1);
  const s = opts.scale ?? 1;
  spr.scale.set((opts.flip ? -s : s) * (opts.sx ?? 1), s);
  spr.x = x;
  spr.y = y;
  if (opts.alpha != null) spr.alpha = opts.alpha;
  return spr;
}

function hash(i) {
  const s = Math.sin(i * 91.7) * 43758.5453;
  return s - Math.floor(s);
}

/** A rolling hill band from y (its mean top) down past the floor. */
function hills(g, width, y, amp, period, phase, bottom, color) {
  g.moveTo(-400, bottom);
  for (let x = -400; x <= width + 400; x += 40) g.lineTo(x, y + Math.sin(x / period + phase) * amp + Math.sin(x / (period * 0.43) + phase * 2) * amp * 0.35);
  g.lineTo(width + 400, bottom);
  g.closePath();
  g.fill(color);
}

/**
 * The field behind the entity layer. geo: { W, H, FLOOR, BANKS, EXIT }. Returns the kit.sceneRoot
 * (its layers: sky, horizon, hills, field).
 */
export function buildGrowBackground(PIXI, kit, geo) {
  const { W, H, FLOOR } = geo;
  const C = GROW_COLOURS;
  const root = kit.sceneRoot(PIXI, W, H);
  root.label = 'operation-grow';
  const sky = root.layer(0, 0);
  sky.addChild(kit.gradient(PIXI, [[0, C.skyTop], [0.5, C.skyMid], [1, C.skyLow]], 960, 640));
  // The horizon: the glowing dome among blue baobabs.
  const far = root.layer(0.25, 1);
  const horizon = FLOOR - 205;
  const halo = kit.glow(PIXI, 1250, horizon - 90, 0xcfeeff, 120);
  halo.alpha = 0.32;
  far.addChild(halo);
  far.addChild(kit.deco(PIXI, 'backhill3_blue', 1250, horizon + 20, { scale: 0.6, alpha: 0.9 }));
  for (let i = 0; i < 16; i++) {
    const x = -60 + i * 105 + hash(i) * 50;
    far.addChild(growArt(PIXI, 'bottletree_silhouette_blue', x, horizon + 14 + hash(i + 40) * 10,
      { scale: 0.55 + hash(i + 9) * 0.5, flip: hash(i + 3) > 0.5, alpha: 0.9 }));
  }
  far.addChild(growArt(PIXI, 'bg2_tree1_dusk', 1150, horizon + 40, { scale: 0.85 }));
  const farHills = new PIXI.Graphics();
  hills(farHills, W, horizon + 22, 10, 170, 0.4, H + 400, C.hillFar);
  far.addChild(farHills);
  // Slate hills, with small blue stalks along their crest.
  const mid = root.layer(0.55, 2);
  const g = new PIXI.Graphics();
  hills(g, W, FLOOR - 150, 14, 210, 1.3, H + 400, C.hillMid);
  mid.addChild(g);
  for (let i = 0; i < 14; i++) {
    mid.addChild(growArt(PIXI, 'plants1_blue', 60 + i * 190 + hash(i + 70) * 60, FLOOR - 132 + hash(i + 71) * 16,
      { scale: 0.18 + hash(i + 72) * 0.1, sx: 1.4, alpha: 0.55 }));
  }
  const near = new PIXI.Graphics();
  hills(near, W, FLOOR - 105, 12, 260, 2.6, H + 400, C.hillNear);
  mid.addChild(near);
  for (let i = 0; i < 10; i++) {
    mid.addChild(growArt(PIXI, 'plants1_blue', 120 + i * 260 + hash(i + 90) * 80, FLOOR - 92 + hash(i + 91) * 16,
      { scale: 0.3 + hash(i + 92) * 0.12, sx: 1.4, alpha: 0.7 }));
  }
  // The field: dark ground, craters, boulders, the front strip.
  const field = root.layer(1, 3);
  const ground = new PIXI.Graphics();
  hills(ground, W, FLOOR - 38, 7, 150, 0.8, H + 400, C.ground);
  ground.rect(-400, FLOOR + 96, W + 800, H - FLOOR + 300).fill(C.front);
  field.addChild(ground);
  for (let i = 0; i < 12; i++) {
    field.addChild(kit.deco(PIXI, i % 2 ? 'ground_spots_dark_2' : 'ground_spots_dark_1', 80 + i * 215 + hash(i + 20) * 80,
      FLOOR + 26 + hash(i + 21) * 56, { scale: 0.42, tint: 0xb4b4b4, alpha: 0.55 }));
  }
  for (const [name, x, s] of [['stone_moss_group_1_slate', 1240, 1], ['stone_moss_2_slate', 1340, 0.8],
    ['stone_moss_group_1_slate', 1900, 0.85], ['stone_moss_2_slate', 560, 0.7], ['stone_moss_2_slate', 2440, 0.9]]) {
    field.addChild(growArt(PIXI, name, x, FLOOR - 26, { scale: s }));
  }
  // Horizon and hills scroll sideways only: the room is one screen tall, and vertical parallax would
  // sink them under the field.
  root.updateParallax = (camX = 0, camY = 0) => {
    sky.x = camX;
    sky.y = camY;
    for (const c of [far, mid]) c.x = camX * (1 - c.factor);
  };
  return root;
}

/**
 * One patch's stalk: the gravel ring, the green (gloom) and blue (bloom) plants1, and a cyan glow
 * on each orb. setBloom(k) cross-fades 0..1; glow(t) breathes the lit orbs.
 */
export function makeStalk(PIXI, kit, i) {
  const c = new PIXI.Container();
  const h = 0.76 + ((i * 37) % 5) * 0.02;
  const bed = new PIXI.Graphics();
  bed.ellipse(0, 3, 46, 9).fill({ color: 0x4c4c4a, alpha: 0.9 });
  bed.ellipse(0, 1, 36, 6).fill({ color: 0x6f6f6c, alpha: 0.8 });
  c.addChild(bed);
  c.addChild(kit.deco(PIXI, 'gravel_1', 0, 9, { scale: 0.18 }));
  const green = growArt(PIXI, 'plants1', 0, 0, { scale: h, sx: STALK_STRETCH_X });
  const blue = growArt(PIXI, 'plants1_blue', 0, 0, { scale: h, sx: STALK_STRETCH_X });
  blue.alpha = 0;
  c.addChild(green, blue);
  const glows = [];
  for (const [dx, dy] of STALK_ORBS) {
    const o = growArt(PIXI, 'magic_mushroom_light_blue', dx * h * STALK_STRETCH_X, dy * h, { ay: 0.5, scale: 0.36 });
    o.blendMode = 'add';
    o.alpha = 0;
    c.addChild(o);
    glows.push(o);
  }
  return {
    container: c,
    setBloom(k, t = 0) {
      blue.alpha = k;
      green.alpha = 1 - k * 0.999;
      glows.forEach((o, j) => { o.alpha = k * (0.6 + 0.3 * Math.sin(t * 2 + i + j * 0.7)); });
    },
  };
}
