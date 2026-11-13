/**
 * Le Voyage Violet (LNVV4OTMAUG2PQV), drawn for the Purple Journey (G150 /
 * G138). The instance's geometry and decos never reached the locations dump
 * (research/streets-hunt: instance-template-no-geometry), so this is a clean
 * rebuild of what the players' Snaps show (research/wayback/raw/snaps/
 * le_voyage_violet and round3-levels-2026-10-29 LNVV4OTMAUG2PQV, reference
 * only): a deep violet night under a crescent moon, hanging strands, lines of
 * washing, drippy stumps, mushrooms and spiral stones on the floor, and a
 * floor of jagged lilac peaks. No Snap pixels are used.
 *
 * The washing and the moon are Tiny Speck's own decos, the ones the Snaps
 * show (tinyspeck/glitch-locations, CC0, shipped in decos/groddle): the six
 * garments hanging_clothes_1..6 (abbasid1.swf) pegged on hanging_clothes_line
 * and the moon (quest02.swf; the shipped files come from the byte-identical
 * copies in abbasid1.swf and zutto1.swf), tinted violet like the rest of the
 * room. The rest is drawn.
 *
 * World: 3200 x 1000 (geo x -1600..1600, y -1000..0); the floor is at
 * screen y 939 (geo y -61, the arrival point).
 */

import { deco, gradient, sceneRoot } from './quest-rooms/kit.js?v=c436cb8a';

export const VOYAGE_W = 3200;
export const VOYAGE_H = 1000;
export const VOYAGE_FLOOR = 939;
/** geo -> screen offset (geo l, t). */
export const VOYAGE_OFFSET = Object.freeze({ x: 1600, y: 1000 });

/** A small seeded random so the room is the same every visit. */
function seeded(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** The CC0 decos (decos/groddle; kit.deco sizes are the files' pixels, twice the SWF stage). */
export const WASHING = Object.freeze(['hanging_clothes_1', 'hanging_clothes_2', 'hanging_clothes_3', 'hanging_clothes_4', 'hanging_clothes_5', 'hanging_clothes_6']);
export const WASHING_LINE = 'hanging_clothes_line';
export const MOON = 'moon';
/** hanging_clothes_line's file width; its rope runs 40% of the way down the art. */
const LINE_FILE_W = 1172;
const LINE_ROPE = 0.4;
/** The garments' pegs sit this far down their art. */
const PEG = 0.08;
/**
 * The Snaps show everything in the room washed violet: the recovered art keeps its own light and
 * shade (luminance) in the room's violet, as a colour matrix (rows R, G, B, A; offsets 0-1).
 */
export const VIOLET_WASH = Object.freeze([
  0.264, 0.519, 0.097, 0, 0.05,
  0.15, 0.295, 0.055, 0, 0.01,
  0.276, 0.543, 0.101, 0, 0.06,
  0, 0, 0, 1, 0,
]);

function violetWash(PIXI, target) {
  if (!PIXI.ColorMatrixFilter) return;
  const f = new PIXI.ColorMatrixFilter();
  f.matrix = [...VIOLET_WASH];
  target.filters = [f];
}

/** A line from (x1, y1) to (x2, y2) with washing pegged along it. */
function clothesline(PIXI, layer, x1, y1, x2, y2, rand, tint, scale) {
  const len = Math.hypot(x2 - x1, y2 - y1);
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const line = deco(PIXI, WASHING_LINE, x1, y1, { ax: 0, ay: LINE_ROPE, tint, sy: scale });
  line.scale.x = len / LINE_FILE_W;
  line.rotation = angle;
  line.alpha = 0.85;
  layer.addChild(line);
  for (let t = 0.05; t < 0.95; t += 0.08 + rand() * 0.07) {
    const name = WASHING[Math.floor(rand() * WASHING.length)];
    const g = deco(PIXI, name, x1 + (x2 - x1) * t, y1 + (y2 - y1) * t, {
      ay: PEG,
      tint,
      scale: scale * (0.9 + rand() * 0.25),
      flip: rand() < 0.5,
      rotation: angle + (rand() - 0.5) * 0.08,
    });
    g.alpha = 0.78 + rand() * 0.18;
    layer.addChild(g);
  }
}

function stump(PIXI, h, w) {
  const g = new PIXI.Graphics();
  g.rect(-w / 2, -h, w, h).fill({ color: 0x8d4f8f });
  g.rect(-w / 2, -h, w * 0.25, h).fill({ color: 0x6d3470, alpha: 0.6 });
  // The pale icing-like top with drips.
  g.ellipse(0, -h, w / 2 + 3, 12).fill({ color: 0xe2b3e6 });
  for (let i = 0; i < 4; i += 1) {
    const x = -w / 2 + 6 + (i * (w - 12)) / 3;
    g.roundRect(x - 4, -h, 8, 18 + ((i * 7) % 16), 4).fill({ color: 0xe2b3e6 });
  }
  return g;
}

function mushroom(PIXI, r) {
  const g = new PIXI.Graphics();
  g.roundRect(-r * 0.18, -r * 1.2, r * 0.36, r * 1.2, 6).fill({ color: 0xd9b3df });
  g.ellipse(0, -r * 1.2, r, r * 0.42).fill({ color: 0xb8335e });
  g.ellipse(0, -r * 1.05, r * 0.9, r * 0.12).fill({ color: 0xf2a6c4, alpha: 0.7 });
  for (const [dx, dy] of [[-0.45, -1.32], [0.1, -1.45], [0.5, -1.28]]) g.circle(r * dx, r * dy, r * 0.09).fill({ color: 0xffe3f0 });
  return g;
}

function spiralStone(PIXI, r) {
  const g = new PIXI.Graphics();
  g.ellipse(0, -r * 0.8, r, r * 0.8).fill({ color: 0x7a5a86 });
  g.moveTo(0, -r * 0.8);
  for (let a = 0; a < Math.PI * 5; a += 0.3) {
    const rr = (a / (Math.PI * 5)) * r * 0.75;
    g.lineTo(Math.cos(a) * rr, -r * 0.8 + Math.sin(a) * rr * 0.8);
  }
  g.stroke({ width: 3, color: 0xc6a3d1, alpha: 0.8 });
  return g;
}

function frond(PIXI, h, color) {
  const g = new PIXI.Graphics();
  g.moveTo(0, 0).quadraticCurveTo(h * 0.15, -h * 0.5, -h * 0.05, -h).stroke({ width: 5, color });
  for (let i = 1; i < 7; i += 1) {
    const y = -h * (i / 7.5);
    const s = h * 0.22 * (1 - i / 9);
    g.ellipse(-s * 0.7, y, s, s * 0.32).fill({ color });
    g.ellipse(s * 0.7, y - 6, s, s * 0.32).fill({ color });
  }
  return g;
}

/** The jagged peaks along the floor (they rise from the walking line). */
function peaks(PIXI, rand, width, floor, depth) {
  const g = new PIXI.Graphics();
  const pts = [0, floor + depth];
  let x = 0;
  while (x < width) {
    const w = 60 + rand() * 120;
    pts.push(x + w * 0.5, floor - 10 - rand() * 46, x + w, floor + 4 + rand() * 6);
    x += w;
  }
  pts.push(width, floor + depth);
  g.poly(pts).fill({ color: 0x9a6aa8 });
  // A lighter ridge band and the dark ground below.
  g.rect(0, floor + 8, width, depth).fill({ color: 0x5b2f66 });
  return g;
}

/** The scene background container (enterScene's `background`) and its collision. */
export function buildVoyageScene(PIXI) {
  const W = VOYAGE_W;
  const H = VOYAGE_H;
  const floor = VOYAGE_FLOOR;
  const rand = seeded(0x5a7e01);
  const root = sceneRoot(PIXI, W, H + 300);
  const sky = root.layer(0.05, 0);
  sky.addChild(gradient(PIXI, [[0, '#1f0726'], [0.45, '#4a1656'], [0.8, '#6c2a77'], [1, '#3a1043']], W, H + 300));
  // The sky layer barely moves, so the moon stays up and to the right of the view.
  // Drawn at its SWF stage size (218 x 227), as large against an avatar as in the Snaps.
  const moon = deco(PIXI, MOON, 880, 250, { ax: 0.5, ay: 0.5, scale: 0.5 });
  violetWash(PIXI, moon);
  sky.addChild(moon);
  const far = root.layer(0.45, 1);
  // Hanging strands, out of the dark above.
  const strands = new PIXI.Graphics();
  for (let i = 0; i < 28; i += 1) {
    const x = rand() * W;
    strands.moveTo(x, -20).quadraticCurveTo(x + (rand() - 0.5) * 60, floor * 0.5, x + (rand() - 0.5) * 40, floor - 40 - rand() * 200)
      .stroke({ width: 2 + rand() * 4, color: 0x2a0b33, alpha: 0.55 + rand() * 0.3 });
  }
  far.addChild(strands);
  // Floating violet motes.
  const motes = new PIXI.Graphics();
  for (let i = 0; i < 140; i += 1) motes.circle(rand() * W, rand() * floor, 1.5 + rand() * 4).fill({ color: 0xc061d4, alpha: 0.15 + rand() * 0.35 });
  far.addChild(motes);
  // The washing hangs in the upper half of the view (this layer moves at 0.8: with the
  // avatar on the floor it sits about 130 px lower than drawn).
  const mid = root.layer(0.8, 2);
  violetWash(PIXI, mid);
  for (let i = 0; i < 4; i += 1) {
    const x1 = i * 820 - 60;
    clothesline(PIXI, mid, x1, 500 + rand() * 40, x1 + 760 + rand() * 120, 470 + rand() * 50, rand, 0xffffff, 0.75);
  }
  for (let i = 0; i < 3; i += 1) {
    const x1 = 260 + i * 1050;
    clothesline(PIXI, mid, x1, 600 + rand() * 30, x1 + 640, 580 + rand() * 30, rand, 0xd2c4dc, 0.85);
  }
  const ground = root.layer(1, 3);
  for (let x = 120; x < W; x += 260 + rand() * 260) {
    const pick = rand();
    let g;
    if (pick < 0.3) g = stump(PIXI, 80 + rand() * 70, 46 + rand() * 18);
    else if (pick < 0.65) g = mushroom(PIXI, 26 + rand() * 26);
    else g = spiralStone(PIXI, 26 + rand() * 14);
    g.x = x;
    g.y = floor - 2;
    ground.addChild(g);
  }
  ground.addChild(peaks(PIXI, rand, W, floor, 320));
  const front = root.layer(1, 6);
  for (let x = 30; x < W; x += 420 + rand() * 380) {
    const f = frond(PIXI, 120 + rand() * 80, 0x24082c);
    f.x = x;
    f.y = floor + 40;
    f.alpha = 0.92;
    front.addChild(f);
  }
  return {
    background: root,
    platforms: [{ id: 'voyage-floor', x1: 0, y1: floor, x2: W, y2: floor, pc_perm: 1 }],
  };
}
