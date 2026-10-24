/**
 * Operation Grow's bog fields: the look and layout of quests/where_the_blue_grew.js's instance
 * `operation_grow` (template LIFI8QG9A093USI, lost from the public locations dump).
 *
 * Four player Snaps (research/wayback/raw/snaps/where_the_blue_grew/, reference only, never shipped):
 * - PIFOC6038Q53T2J (Sep 2012, two close-ups) give the palette (G67): a dusky blue sky with a pale
 *   glowing dome on the horizon among blue baobab silhouettes, slate hills, dark cratered ground,
 *   and tall stalks studded with orbs in gravel rings, one green and the rest teal with glowing cyan
 *   orbs ("where the blue grew").
 * - PHFEBGS0MAD2KGT_202464 (Nov 2012) and PUVJ77PGD9F21JM_110491 (Oct 2012) show the whole room in
 *   two tiers (G109): the surface field of planted stalks between Firebog bottletree huts (a big domed
 *   hut with slit eyes, round windows and a door under a crown of bare branches on the right, smaller
 *   huts on root legs behind), white dry-grass tufts and a basket and small sign by the big hut; and
 *   under it a root tunnel: teal pots hanging from its ceiling (one under each lit stalk), a mat of
 *   tangled grey roots along its floor, striated earth walls, and a narrow door at its right end
 *   with "EXIT" painted on the wall beside it.
 *
 * Every piece is a CC0 Firebog deco. The recoloured copies come from tools/room-art/build.py (set
 * operation_grow, js/operation-grow-art.js): plants1 green and blue, the orb glow
 * (magic_mushroom_light_blue), the baobabs, boulders, the big hut (bottletree_burb_wndw_1 under
 * treetop_noflowers_3), the far huts (background_bottletree_hut), the tufts (grass_transparent_4),
 * the pots (jar4_empty), the roots (legs_back_set2/3, legs_front_set3), the earth
 * (underground_background), the door (door_asset_bottletree_interior_side), the ladder
 * (firebog_ladder) and the basket of sticks (decor_plants5). The dome (backhill3_blue), craters, gravel,
 * the plank sign and the firefly jar are street decos in assets/decos/groddle/. The sky, hills, the
 * slab and the tunnel's frame are vectors in the Snaps' colours.
 *
 * The remake's own reading: there is no known way between the tiers in the Snaps, so a Firebog ladder
 * runs down through the field's left end; each patch has its own pot under it, dark while the patch
 * is gloomy and teal once it blooms (the Snaps show pots only under lit stalks).
 */

import { OPERATION_GROW_FILES } from './operation-grow-art.js?v=g109-1';
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

/** Snap colours (sky and field from PIFOC6038Q53T2J; slab, tunnel and pots from PHFEBGS0MAD2KGT / PUVJ77PGD9F21JM). */
export const GROW_COLOURS = Object.freeze({
  skyTop: '#3d637a', skyMid: '#6093b0', skyLow: '#6fa1c4', hillFar: 0x5b7e8e, hillMid: 0x425a64,
  hillNear: 0x3e5157, ground: 0x34312c, front: 0x262626, orb: 0x01c2c1,
  slabTop: 0x4b4a45, slab: 0x43423e, slabLow: 0x2c2b29, lip: 0x272624,
  tunnelWall: 0x101010, tunnelFloor: 0x393835, tunnelFloorTop: 0x43423e, frame: 0x1e1a19, frameEdge: 0x2e2a27,
  exitText: 0x77736c, potLit: 0xffffff, potDark: 0x4a5656,
});

/** A room-art piece at its world size (bottom-centre anchored). */
export function growArt(PIXI, name, x, y, opts = {}) {
  const [file] = OPERATION_GROW_FILES[name];
  const spr = new PIXI.Sprite(textureFromUrl(`${GROW_ART_DIR}${file}`));
  spr.anchor.set(opts.ax ?? 0.5, opts.ay ?? 1);
  const s = opts.scale ?? 1;
  spr.scale.set((opts.flip ? -s : s) * (opts.sx ?? 1), s * (opts.sy ?? 1));
  spr.x = x;
  spr.y = y;
  if (opts.alpha != null) spr.alpha = opts.alpha;
  if (opts.tint != null) spr.tint = opts.tint;
  return spr;
}

function hash(i) {
  const s = Math.sin(i * 91.7) * 43758.5453;
  return s - Math.floor(s);
}

/** A rolling hill band from y (its mean top) down to bottom. */
function hills(g, width, y, amp, period, phase, bottom, color) {
  g.moveTo(-400, bottom);
  for (let x = -400; x <= width + 400; x += 40) g.lineTo(x, y + Math.sin(x / period + phase) * amp + Math.sin(x / (period * 0.43) + phase * 2) * amp * 0.35);
  g.lineTo(width + 400, bottom);
  g.closePath();
  g.fill(color);
}

/** Tile the seamless earth texture over a rectangle (tinted). */
function earth(PIXI, x1, y1, x2, y2, tint) {
  // The @1.5x file name gives the texture its world size (js/textures.js), so tiles need no scale.
  const [file] = OPERATION_GROW_FILES.earth_strata;
  const t = new PIXI.TilingSprite({ texture: textureFromUrl(`${GROW_ART_DIR}${file}`), width: x2 - x1, height: y2 - y1 });
  t.x = x1;
  t.y = y1;
  t.tint = tint;
  return t;
}

/**
 * The bog fields behind the entity layer. geo: { W, H, FLOOR, CEILING, TUNNEL, TUNNEL_X1, TUNNEL_X2,
 * LADDER, EXIT, HUT_X, HINT, PATCH_XS }. Returns the kit.sceneRoot with `pots` (one per patch,
 * each { sprite, setBloom(k, t) }) and `exitBeam`.
 */
export function buildGrowBackground(PIXI, kit, geo) {
  const { W, H, FLOOR, CEILING, TUNNEL, TUNNEL_X1, TUNNEL_X2, LADDER, EXIT, HUT_X, HINT, PATCH_XS } = geo;
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
  hills(farHills, W, horizon + 22, 10, 170, 0.4, CEILING, C.hillFar);
  far.addChild(farHills);

  // Slate hills with the far huts on their root legs and small blue stalks along the crest.
  const mid = root.layer(0.55, 2);
  const g = new PIXI.Graphics();
  hills(g, W, FLOOR - 150, 14, 210, 1.3, CEILING, C.hillMid);
  mid.addChild(g);
  for (const [x, s, flip] of [[60, 0.62, false], [560, 0.5, true], [1180, 0.42, false]]) {
    mid.addChild(growArt(PIXI, 'hut_far_blue', x, FLOOR - 128, { scale: s, flip, alpha: 0.92 }));
  }
  for (let i = 0; i < 14; i++) {
    mid.addChild(growArt(PIXI, 'plants1_blue', 60 + i * 190 + hash(i + 70) * 60, FLOOR - 132 + hash(i + 71) * 16,
      { scale: 0.18 + hash(i + 72) * 0.1, sx: 1.4, alpha: 0.55 }));
  }
  const near = new PIXI.Graphics();
  hills(near, W, FLOOR - 105, 12, 260, 2.6, CEILING, C.hillNear);
  mid.addChild(near);
  for (let i = 0; i < 10; i++) {
    mid.addChild(growArt(PIXI, 'plants1_blue', 120 + i * 260 + hash(i + 90) * 80, FLOOR - 92 + hash(i + 91) * 16,
      { scale: 0.3 + hash(i + 92) * 0.12, sx: 1.4, alpha: 0.7 }));
  }

  // The field and everything under it moves with the world.
  const field = root.layer(1, 3);
  const ground = new PIXI.Graphics();
  hills(ground, W, FLOOR - 38, 7, 150, 0.8, FLOOR + 2, C.ground);
  field.addChild(ground);
  for (const [name, x, s] of [['stone_moss_group_1_slate', 1240, 1], ['stone_moss_2_slate', 1340, 0.8],
    ['stone_moss_2_slate', 560, 0.7], ['stone_moss_group_1_slate', 1640, 0.7]]) {
    field.addChild(growArt(PIXI, name, x, FLOOR - 26, { scale: s }));
  }
  // The big hut on the right: its crown of bare branches rising out of the dome.
  field.addChild(growArt(PIXI, 'hut_crown_dusk', HUT_X - 10, FLOOR - 140, { scale: 1 }));
  field.addChild(growArt(PIXI, 'hut_dusk', HUT_X, FLOOR + 8, { scale: 1 }));

  // Below the surface: earth everywhere, the slab, then the tunnel cut into it.
  field.addChild(earth(PIXI, -200, FLOOR, W + 200, H + 200, 0xffffff));
  const slab = new PIXI.Graphics();
  slab.rect(-200, FLOOR, W + 400, CEILING - FLOOR).fill(C.slab);
  slab.rect(-200, FLOOR - 2, W + 400, 10).fill(C.slabTop);
  slab.rect(-200, CEILING - 16, W + 400, 16).fill(C.slabLow);
  field.addChild(slab);
  for (let i = 0; i < 14; i++) {
    field.addChild(kit.deco(PIXI, i % 2 ? 'ground_spots_dark_2' : 'ground_spots_dark_1', 80 + i * 180 + hash(i + 20) * 70,
      FLOOR + 30 + hash(i + 21) * 12, { scale: 0.3, tint: 0xa0a0a0, alpha: 0.45 }));
  }
  // The tunnel: a near-black striated back wall, its floor, a wavy lip under the slab.
  const tunnel = new PIXI.Container();
  field.addChild(tunnel);
  tunnel.addChild(earth(PIXI, TUNNEL_X1, CEILING - 4, TUNNEL_X2, TUNNEL + 4, 0x3c3c3c));
  const lip = new PIXI.Graphics();
  lip.moveTo(TUNNEL_X1, CEILING - 6);
  for (let x = TUNNEL_X1; x <= TUNNEL_X2; x += 30) lip.lineTo(x, CEILING + 6 + Math.sin(x / 41) * 4 + hash(x) * 4);
  lip.lineTo(TUNNEL_X2, CEILING - 6);
  lip.closePath();
  lip.fill(C.lip);
  tunnel.addChild(lip);
  // The mat of tangled roots along the back of the floor.
  const roots = ['roots_back_grey', 'roots_front_grey', 'roots_back3_grey', 'roots_front_grey'];
  for (let i = 0, x = TUNNEL_X1 + 80; x < TUNNEL_X2 - 60; i++, x += 120 + hash(i + 300) * 60) {
    tunnel.addChild(growArt(PIXI, roots[i % roots.length], x, TUNNEL - 18 + hash(i + 310) * 8,
      { scale: 0.68 + hash(i + 320) * 0.2, flip: hash(i + 330) > 0.5, alpha: 0.95 }));
  }
  // The floor: a lit top edge and a band of packed earth; the striated earth shows again below it.
  const floor = new PIXI.Graphics();
  floor.rect(TUNNEL_X1, TUNNEL - 14, TUNNEL_X2 - TUNNEL_X1, 14).fill(C.tunnelFloorTop);
  floor.rect(TUNNEL_X1, TUNNEL, TUNNEL_X2 - TUNNEL_X1, 30).fill(C.tunnelFloor);
  floor.moveTo(TUNNEL_X1, TUNNEL + 30);
  for (let x = TUNNEL_X1; x <= TUNNEL_X2; x += 30) floor.lineTo(x, TUNNEL + 30 + Math.sin(x / 37) * 3 + hash(x + 7) * 4);
  floor.lineTo(TUNNEL_X2, TUNNEL + 30);
  floor.closePath();
  floor.fill(C.tunnelFloor);
  tunnel.addChild(floor);
  // Plank frames at both ends; the right one holds the narrow door, "EXIT" painted beside it.
  const frame = new PIXI.Graphics();
  for (const x of [TUNNEL_X1 - 22, TUNNEL_X2 - 8]) {
    frame.rect(x, CEILING - 10, 30, TUNNEL - CEILING + 24).fill(C.frame);
    frame.rect(x + 4, CEILING - 10, 4, TUNNEL - CEILING + 24).fill(C.frameEdge);
    frame.rect(x + 22, CEILING - 10, 3, TUNNEL - CEILING + 24).fill({ color: 0x000000, alpha: 0.4 });
  }
  tunnel.addChild(frame);
  tunnel.addChild(growArt(PIXI, 'exit_door_dusk', EXIT.x, TUNNEL + 2, { sx: 0.56 }));
  // Sign text read off Snaps PHFEBGS0MAD2KGT_202464 and PUVJ77PGD9F21JM_110491 (the tunnel's right wall).
  tunnel.addChild(kit.label(PIXI, 'EXIT', TUNNEL_X2 + 48, TUNNEL - 92, { size: 17, weight: '700', fill: C.exitText }));
  const beam = kit.deco(PIXI, 'light_shafts_blue', EXIT.x, TUNNEL + 10, { scale: 0.18, alpha: 0.12 });
  tunnel.addChild(beam);
  root.exitBeam = beam;
  // One pot under each patch, hung from the ceiling.
  root.pots = PATCH_XS.map((x, i) => {
    const c = new PIXI.Container();
    c.x = x;
    c.y = CEILING - 6;
    // Hung upside down: the pod's wide base against the ceiling, its mouth pointing down.
    const pot = growArt(PIXI, 'pot_teal', 0, 0, { sy: -1 });
    const glow = growArt(PIXI, 'magic_mushroom_light_blue', 0, 32, { ay: 0.5, scale: 1.1 });
    glow.blendMode = 'add';
    glow.alpha = 0;
    c.addChild(pot, glow);
    tunnel.addChild(c);
    const dark = C.potDark;
    return {
      sprite: c,
      setBloom(k, t = 0) {
        const mix = (a, b) => Math.round(a + (b - a) * k);
        const r = mix((dark >> 16) & 255, 255);
        const gg = mix((dark >> 8) & 255, 255);
        const b = mix(dark & 255, 255);
        pot.tint = (r << 16) | (gg << 8) | b;
        glow.alpha = k * (0.35 + 0.15 * Math.sin(t * 1.7 + i));
      },
    };
  });
  // The way down: a hole through the slab with the Firebog ladder in it.
  const shaft = new PIXI.Graphics();
  shaft.roundRect(LADDER.x - 46, FLOOR + 4, 92, CEILING - FLOOR + 10, 10).fill(0x121212);
  shaft.ellipse(LADDER.x, FLOOR + 6, 50, 9).fill(0x1d1c1a);
  field.addChild(shaft);
  const [, , ladderH] = OPERATION_GROW_FILES.ladder_dusk;
  field.addChild(growArt(PIXI, 'ladder_dusk', LADDER.x, TUNNEL + 2, { sy: (TUNNEL - LADDER.top + 2) / ladderH }));

  // By the big hut: the basket of sticks and the firefly jar beside Mab's sign.
  field.addChild(growArt(PIXI, 'basket_sticks_grey', HINT.x - 70, FLOOR + 10, { scale: 0.9 }));
  field.addChild(kit.deco(PIXI, 'jar1', HINT.x + 62, FLOOR + 6, { scale: 0.32, tint: 0xb8c4c4 }));
  // White dry-grass tufts along the field's front edge, the tunnel floor and the outside earth.
  const tufts = (y, x0, x1, step, seed, skip = []) => {
    for (let i = 0, x = x0; x < x1; i++, x += step + hash(i + seed) * step * 0.6) {
      if (skip.some((s) => Math.abs(s - x) < 46)) continue;
      field.addChild(growArt(PIXI, 'tuft_white', x, y + hash(i + seed + 1) * 6,
        { scale: 0.75 + hash(i + seed + 2) * 0.5, flip: hash(i + seed + 3) > 0.5, alpha: 0.9 }));
    }
  };
  tufts(FLOOR + 10, 20, W, 120, 500, [...PATCH_XS, LADDER.x, HINT.x]);
  tufts(H - 4, -20, W + 20, 170, 650);
  tufts(TUNNEL + 24, -20, TUNNEL_X1 - 30, 60, 700);
  tufts(TUNNEL + 24, TUNNEL_X2 + 30, W + 20, 60, 800);

  // Horizon and hills scroll sideways only; vertical parallax would sink them under the field.
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
