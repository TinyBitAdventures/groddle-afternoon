/**
 * The Fireflex 3000 Lab backdrop for Firefly Whistle (quests/firefly_whistle.js).
 *
 * Source: the quest's instance comes from template LM113UBSS8P18ET ("Fireflex
 * 3000 Lab", hub 61 Simple Level Quests in inc_data_maps_prod.js; dev copy
 * LHH11C4QUBP1DQD). Neither is in the public locations dump, so the geometry
 * and deco list are lost. What the code fixes: you arrive at -2967, -283, and
 * the teleporter's beam overlay (items/teleporter_button.js) stands at x 990
 * with its foot at y -130 (location_overlay registration is centre_bottom),
 * 275 x 530: exactly Teleporter_Base / Teleporter_Beam at half scale, as Le
 * Misérable places them. In Snap PIFISEG38S535GC_56214 the pad's foot sits
 * about 8 Snap px (12 world px) below the avatar's feet, so the floor here is
 * taken as y -142. Heights of everything else are read off the Snaps the same
 * way, against the avatar's feet and the deck's back edge.
 *
 * Look, from three player Snaps of this very street (research/wayback/raw/
 * snaps/fireflex_lab/, reference only, never shipped): a bright off-white
 * corridor with a blue-grey band along the wall, a pale deck, a hazard-striped
 * front edge over a row of cyan floor lights and a dark underside lit by white
 * tubes; hanging security orbs; egg-shaped phone pods; a framed "Church of
 * Alph" poster ("A Home for Everyone") by a "G2" wall sign, a cloud window and
 * a cyan floor arrow (PIF3L2MLDT53HEF_51819); an egg pod, a white pillar and the
 * whistle stand (PIFISEG38S535GC_56237); a cracked wall, a pinned note, a tall
 * window and the Teleporter Control Unit wired to its pad
 * (PIFISEG38S535GC_56214). The Snaps frame the remake's view width (one Snap
 * px is ~1.5 world px), which spaces the egg pod, pillar and stand of one Snap
 * and the poster and egg pod of another; read as the same egg pod, they give
 * the poster -> egg -> pillar -> stand run used here. Everything else along
 * the corridor is spacing, not evidence.
 *
 * CC0 art: eggbooth, security_orb, Teleporter_Base (decos), the
 * Alph emblem (item icon, sepia-tinted for the poster: the Snap's statue art
 * is not CC0). Drawn as clean vectors: the walls, deck, edge, lights, pillar,
 * windows, poster frame, wall sign, floor arrow, hairline cracks and note. Short sign words ("G2",
 * "Church of Alph", "A Home for Everyone") are read off Snap
 * PIF3L2MLDT53HEF_51819 (rule: text from player footage).
 */

import { textureFromUrl } from '../textures.js';

/** Source bounds this rebuild uses (x from the arrival point to past the teleporter). */
export const LAB = Object.freeze({ l: -3250, r: 1400, t: -760, b: 0 });
export const sx = (x) => x - LAB.l;
export const sy = (y) => y - LAB.t;
export const W = LAB.r - LAB.l;
export const H = LAB.b - LAB.t;
/** Walking line: source y -142, 12 px above the beam's foot (see header). */
export const FLOOR_Y = -142;
export const FLOOR = sy(FLOOR_Y);

const DECO = 'assets/decos/groddle/';
const ICON = 'assets/sprites/icons/';

// Bands, in world px relative to the walking line (from the Snaps, x1.5).
const DECK_BACK = FLOOR - 115;
const DECK_FRONT = FLOOR + 35;
const STRIPE_B = DECK_FRONT + 18;
const LIGHTS_B = STRIPE_B + 22;
const BAND = FLOOR - 192;
const CEIL = FLOOR - 560;

const C = Object.freeze({
  wall: 0xe8e5df,
  wallLow: 0xdcd8d0,
  seam: 0xd2cdc4,
  band: 0xb4bfc9,
  bandHi: 0xf6f5f2,
  deck: 0xeeece7,
  deckSeam: 0xdfdbd3,
  ceiling: 0xf2f0ec,
  ceilingEdge: 0xcbc6bd,
  cyan: 0x8af1ff,
  stripe: 0xf0bf4c,
  stripeDark: 0xb8742a,
  lightsBand: 0x57534d,
  under: 0x3b3936,
  tube: 0xf4f7f5,
  frame: 0xd6d2ca,
});

/** Source-x positions of the dressing (see header for which are evidence). */
export const DRESSING = Object.freeze({
  windows: [{ x: -3000, w: 190, clouds: true }, { x: -560, w: 150, clouds: true }, { x: 1190, w: 160, clouds: false }],
  sign: { x: -2810, text: 'G2' },
  arrow: { x: -2880 },
  poster: { x: -2500 },
  eggs: [-2070, -330],
  pillars: [-1895],
  // The Snaps hang them ~360 px up; the remake's shorter view would lose them, so they float ~275 up.
  orbs: [{ x: -2700, h: 285 }, { x: -2235, h: 265 }, { x: -1985, h: 280 }, { x: -1390, h: 275 }, { x: -760, h: 270 }, { x: -60, h: 280 }, { x: 723, h: 280 }, { x: 1240, h: 265 }],
  // Thin hairline cracks (the Snaps'; the wall_crack decos are dark cave cracks): bottom above the floor, length.
  cracks: [{ x: 632, h: 300, len: 160 }, { x: -1760, h: 120, len: 120 }, { x: -1180, h: 260, len: 90 }],
  note: { x: 723 },
  cyanSeams: [-3080, -2280, -1660, -980, -150, 513],
});

function deco(PIXI, name, x, y, scale = 1, opts = {}) {
  const spr = new PIXI.Sprite(textureFromUrl(`${opts.dir || DECO}${name}.png`));
  spr.anchor.set(opts.ax ?? 0.5, opts.ay ?? 1);
  spr.scale.set(opts.flip ? -scale : scale, scale);
  spr.x = x;
  spr.y = y;
  if (opts.tint != null) spr.tint = opts.tint;
  if (opts.alpha != null) spr.alpha = opts.alpha;
  return spr;
}

function drawShell(PIXI) {
  const g = new PIXI.Graphics();
  // Ceiling and wall.
  g.rect(0, 0, W, CEIL + 22).fill(C.ceiling);
  g.rect(0, CEIL + 22, W, 3).fill(C.ceilingEdge);
  g.rect(0, CEIL + 25, W, DECK_BACK - CEIL - 25).fill(C.wall);
  // Lower wall and the blue-grey band.
  g.rect(0, BAND + 12, W, DECK_BACK - (BAND + 12)).fill(C.wallLow);
  g.rect(0, BAND, W, 12).fill(C.band);
  g.rect(0, BAND - 3, W, 3).fill(C.bandHi);
  // Panel seams every 320 px.
  for (let x = 160; x < W; x += 320) {
    g.rect(x, CEIL + 25, 2, DECK_BACK - CEIL - 25).fill({ color: C.seam, alpha: 0.9 });
  }
  // Deck: pale, a soft back edge, perspective seams.
  g.rect(0, DECK_BACK, W, DECK_FRONT - DECK_BACK).fill(C.deck);
  g.rect(0, DECK_BACK, W, 3).fill({ color: 0xcfcac1, alpha: 0.9 });
  for (let x = 0; x < W + 200; x += 300) {
    g.moveTo(x, DECK_BACK + 3);
    g.lineTo(x - 60, DECK_FRONT);
    g.stroke({ width: 2, color: C.deckSeam, alpha: 0.8 });
  }
  // Hazard stripe.
  g.rect(0, DECK_FRONT, W, STRIPE_B - DECK_FRONT).fill(C.stripe);
  for (let x = -20; x < W + 20; x += 16) {
    g.moveTo(x, STRIPE_B);
    g.lineTo(x + 8, STRIPE_B);
    g.lineTo(x + 16, DECK_FRONT);
    g.lineTo(x + 8, DECK_FRONT);
    g.closePath();
    g.fill({ color: C.stripeDark, alpha: 0.85 });
  }
  g.rect(0, DECK_FRONT, W, 2).fill({ color: 0xfff2c6, alpha: 0.9 });
  // Light row and dark underside.
  g.rect(0, STRIPE_B, W, LIGHTS_B - STRIPE_B).fill(C.lightsBand);
  g.rect(0, LIGHTS_B, W, H - LIGHTS_B).fill(C.under);
  for (let x = 30; x < W; x += 52) g.roundRect(x, STRIPE_B + 7, 34, 8, 4).fill(C.cyan);
  for (let x = 90; x < W; x += 230) {
    g.moveTo(x, LIGHTS_B + 34);
    g.lineTo(x + 50, LIGHTS_B + 22);
    g.stroke({ width: 7, color: C.tube, alpha: 0.95, cap: 'round' });
  }
  // Ceiling lamps.
  for (let x = 140; x < W; x += 380) g.roundRect(x, CEIL + 10, 60, 9, 4).fill(C.cyan);
  // End bulkheads.
  for (const [x0, x1] of [[0, 70], [W - 70, W]]) {
    g.rect(x0, CEIL + 25, x1 - x0, DECK_FRONT - CEIL - 25).fill(0xd5d1c9);
    g.rect(x0 === 0 ? x1 - 4 : x0, CEIL + 25, 4, DECK_FRONT - CEIL - 25).fill(0xbfbab1);
  }
  return g;
}

function drawGlow(PIXI) {
  // Additive glow over the cyan lights, seams and tubes.
  const g = new PIXI.Graphics();
  for (let x = 30; x < W; x += 52) g.roundRect(x - 6, STRIPE_B + 3, 46, 16, 8).fill({ color: C.cyan, alpha: 0.35 });
  for (let x = 90; x < W; x += 230) {
    g.moveTo(x, LIGHTS_B + 34);
    g.lineTo(x + 50, LIGHTS_B + 22);
    g.stroke({ width: 18, color: 0xffffff, alpha: 0.18, cap: 'round' });
  }
  for (const x of DRESSING.cyanSeams) {
    const wx = sx(x);
    g.rect(wx - 1, CEIL + 60, 3, BAND - 8 - CEIL - 60).fill({ color: C.cyan, alpha: 0.9 });
    g.rect(wx - 5, CEIL + 60, 11, BAND - 8 - CEIL - 60).fill({ color: C.cyan, alpha: 0.2 });
  }
  g.blendMode = 'add';
  return g;
}

function drawWindow(PIXI, { x, w, clouds }) {
  const c = new PIXI.Container();
  const h = 220;
  const top = FLOOR - 200 - h;
  const g = new PIXI.Graphics();
  g.roundRect(-w / 2 - 10, top - 10, w + 20, h + 20, 22).fill(C.frame);
  g.roundRect(-w / 2, top, w, h, 16).fill(0xd8eef8);
  g.roundRect(-w / 2, top + h * 0.55, w, h * 0.45, 16).fill({ color: 0xeef8fc, alpha: 0.8 });
  if (clouds) {
    for (const [cx, cy, r] of [[-w * 0.18, 0.58, 30], [w * 0.05, 0.52, 38], [w * 0.28, 0.6, 26], [-w * 0.32, 0.66, 22]]) {
      g.circle(cx, top + h * cy, r).fill({ color: 0xffffff, alpha: 0.95 });
    }
  }
  g.roundRect(-w / 2 + 10, top + 10, 8, h - 20, 4).fill({ color: 0xffffff, alpha: 0.55 });
  c.addChild(g);
  c.x = sx(x);
  return c;
}

function drawPillar(PIXI, x) {
  const g = new PIXI.Graphics();
  const w = 90;
  const wx = sx(x);
  g.rect(wx - w / 2, CEIL + 25, w, DECK_FRONT + 4 - CEIL - 25).fill(0xf3f2ef);
  g.rect(wx - w / 2, CEIL + 25, 14, DECK_FRONT + 4 - CEIL - 25).fill({ color: 0xffffff, alpha: 0.9 });
  g.rect(wx + w / 2 - 12, CEIL + 25, 12, DECK_FRONT + 4 - CEIL - 25).fill({ color: 0xd9d6cf, alpha: 1 });
  g.roundRect(wx - w / 2 - 8, DECK_FRONT - 34, w + 16, 38, 6).fill(0xe9e7e2);
  g.roundRect(wx - w / 2 - 8, BAND - 6, w + 16, 22, 6).fill(0xe9e7e2);
  g.rect(wx - w / 2 - 8, DECK_FRONT + 2, w + 16, 3).fill({ color: 0x000000, alpha: 0.12 });
  return g;
}

function drawSign(PIXI, { x, text }) {
  const t = new PIXI.Text({ text, style: {
    fontFamily: 'Nunito, Trebuchet MS, sans-serif', fontSize: 44, fontWeight: '900', fill: C.wall,
    stroke: { color: 0xbab5ab, width: 4 }, letterSpacing: 2,
  } });
  t.anchor.set(0.5, 1);
  t.x = sx(x);
  t.y = FLOOR - 235;
  return t;
}

function drawArrow(PIXI, { x }) {
  const g = new PIXI.Graphics();
  const ax = sx(x);
  const ay = FLOOR + 22;
  g.poly([ax - 46, ay - 7, ax + 6, ay - 7, ax + 6, ay - 16, ax + 34, ay, ax + 6, ay + 16, ax + 6, ay + 7, ax - 46, ay + 7]).fill({ color: 0x8af1ff, alpha: 0.9 });
  g.poly([ax - 52, ay - 11, ax + 2, ay - 11, ax + 2, ay - 22, ax + 42, ay, ax + 2, ay + 22, ax + 2, ay + 11, ax - 52, ay + 11]).fill({ color: 0x8af1ff, alpha: 0.25 });
  return g;
}

function drawPoster(PIXI, { x }) {
  const c = new PIXI.Container();
  const w = 450;
  const h = 270;
  const bottom = FLOOR - 170;
  const top = bottom - h;
  const g = new PIXI.Graphics();
  g.roundRect(-w / 2 - 14, top - 14, w + 28, h + 28, 18).fill(0xd3cfc7);
  g.roundRect(-w / 2 - 14, top - 14, w + 28, h + 28, 18).stroke({ width: 3, color: 0xbdb8ae });
  g.roundRect(-w / 2, top, w, h, 6).fill(0x8f897e);
  // Sunburst.
  const cx = 0;
  const cy = top + h * 0.42;
  for (let i = 0; i < 24; i += 1) {
    const a0 = (i / 24) * Math.PI * 2;
    const a1 = a0 + Math.PI / 24;
    g.poly([cx, cy, cx + Math.cos(a0) * 420, cy + Math.sin(a0) * 420, cx + Math.cos(a1) * 420, cy + Math.sin(a1) * 420]).fill({ color: 0xb5ae9f, alpha: 0.55 });
  }
  c.addChild(g);
  const mask = new PIXI.Graphics();
  mask.roundRect(-w / 2, top, w, h, 6).fill(0xffffff);
  c.addChild(mask);
  g.mask = mask;
  // emblem_alph@3x is ~47 logical px; the Snap's figure fills about 60% of the frame's height.
  const emblem = deco(PIXI, 'emblem_alph@3x', 0, top + h * 0.66, 3.2, { dir: ICON });
  // The Snap's poster is sepia: greyscale the gold emblem, then warm it a touch.
  if (PIXI.ColorMatrixFilter) {
    const cm = new PIXI.ColorMatrixFilter();
    cm.desaturate();
    emblem.filters = [cm];
  }
  emblem.tint = 0xd9cfbd;
  emblem.alpha = 0.9;
  c.addChild(emblem);
  const title = new PIXI.Text({ text: 'Church of Alph', style: {
    fontFamily: 'Georgia, Times New Roman, serif', fontSize: 40, fontWeight: '900', fill: 0xf3eee3,
    stroke: { color: 0x3f3a33, width: 5 },
  } });
  title.anchor.set(0.5, 0.5);
  title.y = top + h * 0.76;
  const sub = new PIXI.Text({ text: '“A Home for Everyone”', style: {
    fontFamily: 'Georgia, Times New Roman, serif', fontSize: 17, fontStyle: 'italic', fontWeight: '700', fill: 0xf3eee3,
    stroke: { color: 0x3f3a33, width: 3 },
  } });
  sub.anchor.set(0.5, 0.5);
  sub.y = top + h * 0.9;
  c.addChild(title, sub);
  // Two ceiling lamps over the frame (the Snap's cyan lights).
  const lamps = new PIXI.Graphics();
  for (const lx of [-w * 0.27, w * 0.2]) lamps.roundRect(lx - 30, top - 52, 60, 12, 6).fill(0xdfe6ea).roundRect(lx - 24, top - 44, 48, 6, 3).fill(C.cyan);
  c.addChild(lamps);
  c.x = sx(x);
  return c;
}

function drawCrack(PIXI, { x, h, len }) {
  const g = new PIXI.Graphics();
  const wx = sx(x);
  const bottom = FLOOR - h;
  const pts = [[0, 0], [6, -0.18], [-4, -0.34], [9, -0.52], [2, -0.7], [12, -0.86], [6, -1]];
  g.moveTo(wx + pts[0][0], bottom);
  for (const [dx, f] of pts.slice(1)) g.lineTo(wx + dx, bottom + f * len);
  g.stroke({ width: 2.5, color: 0x6a665f, alpha: 0.85, join: 'round' });
  g.moveTo(wx + 9, bottom - 0.52 * len);
  g.lineTo(wx + 24, bottom - 0.6 * len);
  g.stroke({ width: 1.5, color: 0x6a665f, alpha: 0.7 });
  return g;
}

function drawNote(PIXI, { x }) {
  // The pinned note in Snap PIFISEG38S535GC_56214: a blank page, no copy.
  const g = new PIXI.Graphics();
  const wx = sx(x);
  const top = FLOOR - 305;
  g.poly([wx - 24, top, wx + 30, top + 4, wx + 26, top + 78, wx - 28, top + 72]).fill(0xf7f1df);
  g.circle(wx - 6, top + 34, 13).fill({ color: 0xe7c86a, alpha: 0.9 });
  g.circle(wx + 10, top + 46, 10).fill({ color: 0xf0a85a, alpha: 0.85 });
  g.circle(wx + 2, top + 6, 3).fill(0xc94b3b);
  return g;
}

/**
 * The backdrop container (kit.sceneRoot) and the pad position the room needs.
 * @returns {{ root: any, pad: { x: number, y: number } }}
 */
export function buildLab(PIXI, kit) {
  const root = kit.sceneRoot(PIXI, W, H);
  const world = root.layer(1, 2);
  world.addChild(drawShell(PIXI));
  for (const win of DRESSING.windows) world.addChild(drawWindow(PIXI, win));
  world.addChild(drawSign(PIXI, DRESSING.sign));
  world.addChild(drawPoster(PIXI, DRESSING.poster));
  for (const c of DRESSING.cracks) world.addChild(drawCrack(PIXI, c));
  world.addChild(drawNote(PIXI, DRESSING.note));
  for (const x of DRESSING.eggs) world.addChild(deco(PIXI, 'eggbooth', sx(x), FLOOR - 70, 0.5));
  for (const x of DRESSING.pillars) world.addChild(drawPillar(PIXI, x));
  world.addChild(drawArrow(PIXI, DRESSING.arrow));
  world.addChild(drawGlow(PIXI));
  // The teleporter's ceiling cap and floor pad (Teleporter_Base, half scale, foot at the beam's).
  const pad = { x: sx(990), y: sy(-130) };
  world.addChild(deco(PIXI, 'Teleporter_Base', pad.x, pad.y, 0.5));
  for (const o of DRESSING.orbs) world.addChild(deco(PIXI, 'security_orb', sx(o.x), FLOOR - o.h, 0.5, { flip: o.x > 0 }));
  return { root, pad };
}
