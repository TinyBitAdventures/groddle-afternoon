/**
 * Le Voyage Violet (LNVV4OTMAUG2PQV), drawn for the Purple Journey (G150 /
 * G138). The instance's geometry and decos never reached the locations dump
 * (research/streets-hunt: instance-template-no-geometry), so this is a clean
 * vector rebuild of what the players' Snaps show (research/wayback/raw/snaps/
 * le_voyage_violet, reference only): a deep violet night under a thin
 * crescent moon, hanging strands, two clotheslines of pale washing, drippy
 * stumps, mushrooms and spiral stones on the floor, and a floor of jagged
 * lilac peaks. No Snap pixels are used.
 *
 * World: 3200 x 1000 (geo x -1600..1600, y -1000..0); the floor is at
 * screen y 939 (geo y -61, the arrival point).
 */

import { gradient, sceneRoot } from './quest-rooms/kit.js?v=g458-1';

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

function crescent(PIXI, r) {
  const g = new PIXI.Graphics();
  g.circle(0, 0, r * 1.9).fill({ color: 0xd7a6ea, alpha: 0.12 });
  g.circle(0, 0, r).fill({ color: 0xe9c6f4 });
  g.circle(r * 0.42, -r * 0.18, r * 0.88).fill({ color: 0x3b1146 });
  return g;
}

/** A hanging garment silhouette, centred on its peg line at y 0. */
function garment(PIXI, kind, w, color) {
  const g = new PIXI.Graphics();
  const shade = 0x7d4a90;
  if (kind === 'shirt') {
    g.poly([-w * 0.5, 0, -w * 0.18, 0, 0, w * 0.12, w * 0.18, 0, w * 0.5, 0, w * 0.62, w * 0.32, w * 0.4, w * 0.38, w * 0.38, w * 0.95, -w * 0.38, w * 0.95, -w * 0.4, w * 0.38, -w * 0.62, w * 0.32]).fill({ color });
    g.rect(-w * 0.36, w * 0.82, w * 0.72, w * 0.13).fill({ color: shade, alpha: 0.35 });
  } else if (kind === 'pants') {
    g.poly([-w * 0.42, 0, w * 0.42, 0, w * 0.48, w * 1.25, w * 0.1, w * 1.25, 0, w * 0.35, -w * 0.1, w * 1.25, -w * 0.48, w * 1.25]).fill({ color });
    g.rect(-w * 0.42, 0, w * 0.84, w * 0.08).fill({ color: shade, alpha: 0.4 });
  } else if (kind === 'dress') {
    g.poly([-w * 0.25, 0, w * 0.25, 0, w * 0.3, w * 0.35, w * 0.6, w * 1.2, -w * 0.6, w * 1.2, -w * 0.3, w * 0.35]).fill({ color });
    g.poly([-w * 0.6, w * 1.2, w * 0.6, w * 1.2, w * 0.55, w * 1.1, -w * 0.55, w * 1.1]).fill({ color: shade, alpha: 0.35 });
  } else {
    // A sock.
    g.poly([-w * 0.18, 0, w * 0.18, 0, w * 0.18, w * 0.55, w * 0.45, w * 0.7, w * 0.4, w * 0.85, -w * 0.18, w * 0.75]).fill({ color });
  }
  // The peg.
  g.rect(-3, -6, 6, 10).fill({ color: 0xb98ac8 });
  return g;
}

/** A sagging line from (x1, y1) to (x2, y2) with washing pegged along it. */
function clothesline(PIXI, layer, x1, y1, x2, y2, rand, color) {
  const sag = 46;
  const line = new PIXI.Graphics();
  line.moveTo(x1, y1).quadraticCurveTo((x1 + x2) / 2, (y1 + y2) / 2 + sag * 2, x2, y2).stroke({ width: 2, color: 0xb487c4, alpha: 0.8 });
  layer.addChild(line);
  const at = (t) => {
    const mx = (x1 + x2) / 2;
    const my = (y1 + y2) / 2 + sag * 2;
    return {
      x: (1 - t) ** 2 * x1 + 2 * (1 - t) * t * mx + t * t * x2,
      y: (1 - t) ** 2 * y1 + 2 * (1 - t) * t * my + t * t * y2,
    };
  };
  const kinds = ['shirt', 'pants', 'dress', 'sock', 'shirt', 'pants', 'sock'];
  for (let t = 0.06; t < 0.96; t += 0.07 + rand() * 0.06) {
    const p = at(t);
    const kind = kinds[Math.floor(rand() * kinds.length)];
    const w = kind === 'sock' ? 34 + rand() * 10 : 58 + rand() * 30;
    const g = garment(PIXI, kind, w, color);
    g.x = p.x;
    g.y = p.y;
    g.rotation = (rand() - 0.5) * 0.12;
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
  const moon = crescent(PIXI, 46);
  moon.x = 820;
  moon.y = 70;
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
  for (let i = 0; i < 4; i += 1) {
    const x1 = i * 820 - 60;
    clothesline(PIXI, mid, x1, 500 + rand() * 40, x1 + 760 + rand() * 120, 470 + rand() * 50, rand, 0xd9b0e3);
  }
  for (let i = 0; i < 3; i += 1) {
    const x1 = 260 + i * 1050;
    clothesline(PIXI, mid, x1, 600 + rand() * 30, x1 + 640, 580 + rand() * 30, rand, 0xc596d3);
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
