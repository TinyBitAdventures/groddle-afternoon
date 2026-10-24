/**
 * The falling room backdrop: the instance players/player.js goToFallingLevel
 * makes after the Fireflex 3000 Lab's teleporter (js/quest-rooms/falling-room.js).
 *
 * Source: template LLI12DVTLA01HT5 ("The falling room", hub 45 in
 * inc_data_maps_prod.js 17901; dev copy LHH12F9DO801RUL) is not in the public
 * locations dump, the glitch-client or any Wayback capture, so its geometry is
 * lost. What the code fixes: you arrive at 0, -10000 and the room's teleporter
 * (items/teleporter.js, a hidden Collision-triggered Teleporter) has its target
 * set to the quest's exit.
 *
 * Look and order, from video 2Z76dO4DlJ4 t124-163 ("Glitch - Getting the
 * firefly whistle", 2012) and three player Snaps (research/wayback/raw/snaps/
 * falling_room/), all reference only, never shipped: you land on a pink tongue
 * with a bubble at its tip, walk off it and fall for about 25 seconds past
 * giant outlined numbers counting down 997, 953, 947 ... 71, 29, ray bursts on
 * cream, plum, purple and finally black, bubbles, a coral tree, a stained-glass
 * wheel, a pink flower, a yellow tentacle, blue coral, a purple blob and black
 * glyphs, then land in an orange-and-black burst and are beamed home.
 *
 * Every one of those pieces is a CC0 deco of arbito1.swf (tinyspeck/
 * glitch-locations tower_quest), rendered by tools/room-art/build.py
 * (set falling_room, js/quest-rooms/falling-room-art.js): the numbers are the
 * two numberjumble columns, in the order the fall passes them. Heights and
 * speeds are read off the video: the numbers go by at ~282 px/s once you are
 * falling (829 at t133.8, 29 at t157.6, with the columns at x12), and you land
 * about 1.5 s after 29. The colour bands are clean vectors sampled from the
 * video frames.
 */

import { textureFromUrl } from '../textures.js';
import { FALLING_ROOM_FILES } from './falling-room-art.js';

export const ART = 'assets/sprites/quest-rooms/falling_room/';

/**
 * Source bounds (y up is negative, as in the lab). The width is a choice: the
 * video keeps the avatar between the numbers all the way down, so the shaft
 * is about one view wide (the numbers span -480 ... 600).
 */
export const FALL = Object.freeze({ l: -650, r: 950, t: -11000, b: -1850 });
export const sx = (x) => x - FALL.l;
export const sy = (y) => y - FALL.t;
export const W = FALL.r - FALL.l;
export const H = FALL.b - FALL.t;
/** players/player.js goToFallingLevel: instances_enter('falling', 0, -10000). */
export const ARRIVAL = Object.freeze({ x: 0, y: -10000 });
/** The engine's own ground sits 80 px above a scene's bottom; the floor is taken there. */
export const FLOOR_Y = FALL.b - 80;
export const FLOOR = sy(FLOOR_Y);

/**
 * The hidden Collision-triggered Teleporter on the floor (bottom-centre box).
 * Its size is lost (teleporter.js defaults to 10 x 10; templates set their
 * own), and nothing marks it: it spans the floor, so wherever the fall drifts
 * you, landing beams you home. The last ray burst converges on its middle.
 */
export const TELEPORTER = Object.freeze({ x: (FALL.l + FALL.r) / 2, y: FLOOR_Y, w: W, h: 40 });

/** The two numberjumble columns: centre x and top y (source), world height from the art table. */
export const COLUMNS = Object.freeze([
  Object.freeze({ name: 'numberjumble2', x: 210, top: -10836 }),
  Object.freeze({ name: 'numberjumble', x: 150, top: -10836 + 4355 }),
]);
/** Each column's numbers, top to bottom, with their centre as a share of the column's height. */
export const NUMBERS = Object.freeze([
  ['numberjumble2', [[997, 0.0525], [953, 0.1689], [947, 0.2821], [829, 0.3987], [811, 0.5057], [743, 0.6173], [631, 0.7344], [607, 0.8428], [587, 0.9579]]],
  ['numberjumble', [[439, 0.05], [421, 0.16], [379, 0.2758], [257, 0.3928], [233, 0.5031], [191, 0.6153], [127, 0.7276], [71, 0.8414], [29, 0.9515]]],
]);

/** Every number with its source y, top to bottom. */
export function numberMarks() {
  const out = [];
  for (const [name, list] of NUMBERS) {
    const col = COLUMNS.find((c) => c.name === name);
    const h = FALLING_ROOM_FILES[name][2];
    for (const [n, at] of list) out.push({ n, y: Math.round(col.top + at * h) });
  }
  return out;
}

/** The number level with a source y: the last one at or above it ('' above the first). */
export function numberAt(y) {
  let last = '';
  for (const m of numberMarks()) if (m.y <= y) last = m.n;
  return last;
}

/** Fall speed read off the video: ~282 px/s against the engine's 677 px/s (vy_max 670) terminal speed. */
export const FALL_SPEED = 282;
export const VY_MAX = Math.round((FALL_SPEED / 677) * 100) / 100;

/**
 * The tongue (ramp_3_headroom at x1.25) under the arrival point: its image's
 * top-left in source px, and the walkable tops of its upper band (to the
 * bubble) and middle band, in image px (measured off the render's alpha).
 */
export const TONGUE = Object.freeze({ x: -650, y: -9930 });
export const TONGUE_TOP = Object.freeze([[30, 125], [120, 88], [360, 72], [520, 86], [640, 74], [800, 72], [1010, 74]]);
export const TONGUE_MID = Object.freeze([[250, 240], [400, 250], [520, 290], [640, 279], [760, 298], [880, 324], [1040, 313], [1160, 334], [1240, 354], [1290, 362]]);

/** Background bands (source y, colour), sampled off video frames t126-t159. */
export const BANDS = Object.freeze([
  [-11000, 0xf4d1a3],
  [-8600, 0xecc5c0],
  [-7700, 0xe2c7ac],
  [-7300, 0x9406ae],
  [-6000, 0x990ead],
  [-5700, 0xefe6dc],
  [-4000, 0xe8ddcb],
  [-3700, 0xf49e07],
  [-2900, 0x553637],
  [-2500, 0x140703],
  [-1850, 0x140703],
]);

const PLUM = 0x704556;
/**
 * Ray bursts (headroom_optic_1 orange, headroom_optic2 peach), centre in
 * source px: the cream top with orange and plum rays, plum and white, orange
 * on purple, plum on cream, dark rays on orange, and orange on black
 * converging on the teleporter.
 */
export const BURSTS = Object.freeze([
  { name: 'headroom_optic_1', x: -900, y: -10300 },
  { name: 'headroom_optic2', x: 950, y: -9500, tint: PLUM, alpha: 0.8 },
  { name: 'headroom_optic_1', x: 800, y: -8400, alpha: 0.9 },
  { name: 'headroom_optic2', x: -800, y: -7700, tint: PLUM, alpha: 0.85 },
  { name: 'headroom_optic_1', x: -700, y: -6600 },
  { name: 'headroom_optic2', x: 900, y: -5500, alpha: 0.9 },
  { name: 'headroom_optic2', x: -850, y: -4600, tint: PLUM, alpha: 0.8 },
  { name: 'headroom_optic_1', x: 700, y: -4300, alpha: 0.7 },
  { name: 'headroom_optic2', x: -600, y: -3300, tint: 0x553637, alpha: 0.9 },
  { name: 'headroom_optic_1', x: TELEPORTER.x, y: FLOOR_Y - 120 },
]);

/**
 * Dressing along the fall: deco, x, y (bottom-centre, source px), scale, and
 * the video second it shows at. Bubbles are headroom_optic_eye.
 */
export const DRESSING = Object.freeze([
  // The top, around the tongue (t124-133).
  { name: 'arbito_flower_2', x: -560, y: -10380, s: 0.45, t: 127 },
  { name: 'arbito_tree_2', x: 570, y: -10010, s: 1, t: 129 },
  { name: 'symbol7', x: 800, y: -10060, s: 1, t: 129 },
  { name: 'symbol5', x: -290, y: -10060, s: 1, t: 126 },
  { name: 'symbol8', x: -450, y: -9560, s: 1.1, t: 124 },
  { name: 'headroom_optic_eye', x: -30, y: -9420, s: 1.1, t: 124 },
  // 829, 811, 743 (t134-137).
  { name: 'headroom_optic_eye', x: -320, y: -8880, s: 1, t: 135 },
  { name: 'headroom_optic_eye', x: -140, y: -9030, s: 0.6, t: 135 },
  // The black pot (t138).
  { name: 'symbol9', x: 710, y: -7860, s: 1, t: 138 },
  { name: 'headroom_optic_eye', x: -410, y: -7760, s: 0.8, t: 138 },
  { name: 'headroom_optic_eye', x: -230, y: -7860, s: 0.5, t: 138 },
  // 607: the chair glyph, the stained-glass wheel and the pink flower (t140).
  { name: 'symbol3', x: -490, y: -7400, s: 0.9, t: 140 },
  { name: 'arbito_flower_2', x: -390, y: -7040, s: 1, t: 140 },
  { name: 'flower_8', x: 710, y: -7080, s: 1, t: 140 },
  // 587 on purple: a big bubble, the wheel again (t142).
  { name: 'headroom_optic_eye', x: -10, y: -6560, s: 1.35, t: 142 },
  { name: 'arbito_flower_2', x: 790, y: -6860, s: 0.8, t: 142 },
  // 439: the yellow tentacle, the boomerang glyph (t144).
  { name: 'arbito_flower_4', x: 810, y: -6060, s: 1, t: 144 },
  { name: 'symbol8', x: -450, y: -6080, s: 1, t: 144 },
  { name: 'headroom_optic_eye', x: 530, y: -6300, s: 0.6, t: 144 },
  { name: 'headroom_optic_eye', x: 620, y: -6170, s: 0.8, t: 144 },
  // 421: blue coral (t146).
  { name: 'flower_6', x: 770, y: -5440, s: 1, t: 146 },
  { name: 'headroom_optic_eye', x: -510, y: -5700, s: 0.7, t: 146 },
  // 379, 257: the purple blob (t148).
  { name: 'eye_1', x: 30, y: -5220, s: 1, t: 148 },
  { name: 'headroom_optic_eye', x: -470, y: -4950, s: 0.9, t: 148 },
  // 233, 191 (t150-152).
  { name: 'headroom_optic_eye', x: -410, y: -4300, s: 1, t: 150 },
  // 71, 29: dark arcs (t156-158).
  { name: 'symbol5', x: -270, y: -2780, s: 1.4, t: 157 },
]);

/** A deco from the falling_room set as a sprite (world size from the art table). */
export function piece(PIXI, name, x, y, opts = {}) {
  const [file] = FALLING_ROOM_FILES[name];
  const spr = new PIXI.Sprite(textureFromUrl(`${ART}${file}`));
  spr.anchor.set(opts.ax ?? 0.5, opts.ay ?? 1);
  const s = opts.scale ?? 1;
  spr.scale.set(opts.flip ? -s : s, s);
  spr.x = x;
  spr.y = y;
  if (opts.tint != null) spr.tint = opts.tint;
  if (opts.alpha != null) spr.alpha = opts.alpha;
  spr.eventMode = 'none';
  return spr;
}

function drawBands(PIXI) {
  const g = new PIXI.Graphics();
  // Below the floor the last band runs on past the room, so the camera never shows the canvas.
  g.rect(0, H - 1, W, 800).fill(BANDS[BANDS.length - 1][1]);
  // Solid bands with a short blend at each edge (the video's colour changes are soft).
  const BLEND = 260;
  for (let i = 0; i < BANDS.length - 1; i += 1) {
    const [y0, c0] = BANDS[i];
    const [y1] = BANDS[i + 1];
    g.rect(0, sy(y0), W, y1 - y0).fill(c0);
    const [, c1] = BANDS[i + 1];
    if (c1 === c0) continue;
    for (let k = 0; k < 8; k += 1) {
      const t = (k + 1) / 9;
      g.rect(0, sy(y1) - BLEND / 2 + (k * BLEND) / 8, W, BLEND / 8 + 1).fill({ color: mix(c0, c1, t) });
    }
  }
  return g;
}

function mix(a, b, t) {
  const ch = (c, s) => (c >> s) & 0xff;
  const m = (s) => Math.round(ch(a, s) + (ch(b, s) - ch(a, s)) * t) << s;
  return m(16) | m(8) | m(0);
}

/** Room px of a tongue image point. */
export function tonguePoint([ix, iy]) {
  return [sx(TONGUE.x + ix), sy(TONGUE.y + iy)];
}

export function buildFall(PIXI, kit) {
  const root = kit.sceneRoot(PIXI, W, H);
  const world = root.layer(1, 2);
  world.addChild(drawBands(PIXI));
  for (const b of BURSTS) world.addChild(piece(PIXI, b.name, sx(b.x), sy(b.y), { ay: 0.5, tint: b.tint, alpha: b.alpha }));
  for (const col of COLUMNS) world.addChild(piece(PIXI, col.name, sx(col.x), sy(col.top), { ay: 0 }));
  for (const d of DRESSING) world.addChild(piece(PIXI, d.name, sx(d.x), sy(d.y), { scale: d.s }));
  world.addChild(piece(PIXI, 'ramp_3_headroom', sx(TONGUE.x), sy(TONGUE.y), { ax: 0, ay: 0 }));
  return { root };
}

/** Walkable lines: the tongue's two bands and the floor. */
export function fallPlatforms(kit) {
  const out = [];
  for (const [id, pts] of [['top', TONGUE_TOP], ['mid', TONGUE_MID]]) {
    for (let i = 1; i < pts.length; i += 1) {
      const [x1, y1] = tonguePoint(pts[i - 1]);
      const [x2, y2] = tonguePoint(pts[i]);
      out.push(kit.plat(x1, y1, x2, y2, 'invisible', { id: `falling_tongue_${id}${i}` }));
    }
  }
  out.push(kit.plat(0, FLOOR, W, FLOOR, 'invisible', { id: 'falling_floor' }));
  return out;
}
