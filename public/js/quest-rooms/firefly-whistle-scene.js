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
 * whistle stand (PIFISEG38S535GC_56237); a hanging cable, a pinned note, a tall
 * window and the Teleporter Control Unit wired to its pad
 * (PIFISEG38S535GC_56214).
 *
 * Layout, from the whole run on video 2Z76dO4DlJ4 ("Glitch - Getting the
 * firefly whistle", 2012; reference only, its pixels never ship): left to
 * right, the dark entry doorway and its ramp, a pine window, G2, pillar,
 * note, a peeled poster, pillar, a snowy-slope window, G2, the Church of Alph
 * poster, the egg pod, pillar, the stand, pillar, G2, "Tri Saves", cable,
 * note, the control unit, the pad and a last window. One egg pod, four
 * pillars, all in front of the avatar. DRESSING notes each piece's timestamp.
 *
 * CC0 art: eggbooth, security_orb, Teleporter_Base (decos), the
 * Alph emblem (item icon, sepia-tinted for the poster: the Snap's statue art
 * is not CC0). Drawn as clean vectors: the walls, deck, edge, lights, entry,
 * pillars, windows, poster frame, wall signs, graffiti, peeled poster, floor
 * arrow, cables and notes. Short sign words ("G2", "Church of Alph", "A Home
 * for Everyone") are read off Snap PIF3L2MLDT53HEF_51819, "Tri Saves" off the
 * video at t41 (rule: text from player footage).
 */

import { textureFromUrl } from '../textures.js';

/**
 * Source bounds. Video 2Z76dO4DlJ4 (reference only) fixes l and r: the camera
 * stops scrolling with the arrival point 33 px from the left edge (t15-18) and
 * with the window past the pad at the right edge (t103-107). Distances along
 * the corridor are read off its frames at 2.21 world px per video px, the scale
 * that puts the arrival point (-2967) and the beam (990) where the video shows
 * them; that scale also fits the stand, egg pod and orb art at their sizes.
 */
export const LAB = Object.freeze({ l: -3000, r: 1270, t: -760, b: 0 });
export const sx = (x) => x - LAB.l;
export const sy = (y) => y - LAB.t;
export const W = LAB.r - LAB.l;
export const H = LAB.b - LAB.t;
/** Walking line: source y -142, 12 px above the beam's foot (see header). */
export const FLOOR_Y = -142;
export const FLOOR = sy(FLOOR_Y);
/**
 * The entry: you arrive in a dark doorway at the left end, on a ledge about
 * 70 px above the corridor floor, and walk down a curved ramp (video t15-21:
 * the avatar's feet drop ~32 video px while the camera follows it down). The
 * source's arrival y -283 is above the ledge; the remake sets you on it.
 */
export const ENTRY = Object.freeze({ x1: -3000, ledgeEnd: -2935, rampEnd: -2800, y: FLOOR_Y - 70 });

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

/**
 * Source-x positions of the dressing, read off video 2Z76dO4DlJ4 (timestamps
 * in seconds). Wall pieces sit on a slower parallax layer in the original;
 * they are placed where they show with the avatar beside them.
 */
export const DRESSING = Object.freeze({
  // t17 a pine-and-hills view, t22 a snowy slope, t93-103 plain glass past the pad.
  windows: [{ x: -2625, w: 145, view: 'pine' }, { x: -1708, w: 135, view: 'peak' }, { x: 1175, w: 155, view: 'plain' }],
  // "G2" three times along the wall (t17, t24, t41).
  signs: [{ x: -2512, text: 'G2' }, { x: -1596, text: 'G2' }, { x: 162, text: 'G2' }],
  // Graffiti between the third G2 and the teleporter (t41, t89-91); short sign words from footage.
  graffiti: { x: 345, lines: ['Tri', 'Saves'] },
  // A peeled poster with red-brown streaks between the first two pillars (t21-23).
  torn: { x: -2062 },
  // The cyan floor light left of the poster (t22-26; the arrow of Snap PIF3L2MLDT53HEF_51819).
  arrow: { x: -1700 },
  poster: { x: -1254 },
  eggs: [-847],
  // Four pillars, all in front of the avatar: it walks behind them (t20, t30, t41, t89).
  pillars: [-2375, -1912, -675, -16],
  // The video hangs them ~370 px up; the remake's shorter view would lose them, so they float ~275 up.
  // s: 0.5 is the orb deco at the size the video shows most of them; 0.7 the two nearer, larger ones.
  orbs: [
    { x: -2536, h: 285, s: 0.5 }, { x: -2203, h: 265, s: 0.36 }, { x: -1580, h: 300, s: 0.7 },
    { x: -922, h: 280, s: 0.5 }, { x: -470, h: 275, s: 0.5 }, { x: -145, h: 280, s: 0.5 },
    { x: 197, h: 300, s: 0.7 }, { x: 742, h: 280, s: 0.5 }, { x: 1213, h: 265, s: 0.36 },
  ],
  // Broken cables hanging from the ceiling, a plug at the end (t17, t36, t91; the "crack" of Snap PIFISEG38S535GC_56214).
  cables: [{ x: -2744, bottom: 330 }, { x: -538, bottom: 235 }, { x: 614, bottom: 300 }],
  notes: [{ x: -2298 }, { x: 723 }],
  cyanSeams: [-2203, -1660, -980, -150, 484],
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
  // Right-hand bulkhead (the left end is the entry, drawEntry).
  g.rect(W - 70, CEIL + 25, 70, DECK_FRONT - CEIL - 25).fill(0xd5d1c9);
  g.rect(W - 70, CEIL + 25, 4, DECK_FRONT - CEIL - 25).fill(0xbfbab1);
  return g;
}

/** Walking points of the entry ledge and ramp (room px), shared by the art and the platforms. */
export function entryPath() {
  const ledge = sy(ENTRY.y);
  const a = sx(ENTRY.ledgeEnd);
  const b = sx(ENTRY.rampEnd);
  const run = b - a;
  const drop = FLOOR - ledge;
  return [
    [0, ledge],
    [a, ledge],
    [a + run * 0.33, ledge + drop * 0.17],
    [a + run * 0.7, ledge + drop * 0.71],
    [b, FLOOR],
  ];
}

function drawEntry(PIXI) {
  // The dark doorway you arrive in (video t15-21): a grey bulkhead, a deep
  // recess with a rail, a lamp over it, and its floor curving down to the deck.
  const g = new PIXI.Graphics();
  const ledge = sy(ENTRY.y);
  const right = sx(-2817);
  const top = ledge - 236;
  g.rect(0, top - 18, right + 14, FLOOR - top + 18).fill(0x8f8a81);
  g.rect(0, top, right, FLOOR - top).fill(0x5c5953);
  g.rect(0, top, right, 10).fill({ color: 0x3f3d39, alpha: 0.8 });
  g.rect(0, top + 120, right - 6, 5).fill({ color: 0x767069, alpha: 0.9 });
  g.rect(right, top - 18, 5, FLOOR - top + 18).fill(0xa9a49a);
  const [p0, p1, , , p4] = entryPath();
  g.moveTo(0, p0[1]);
  g.lineTo(p1[0], p1[1]);
  g.bezierCurveTo(p1[0] + 50, p1[1], p4[0] - 50, p4[1], p4[0], p4[1]);
  g.lineTo(p4[0], DECK_FRONT);
  g.lineTo(0, DECK_FRONT);
  g.closePath();
  g.fill(C.deck);
  g.moveTo(0, p0[1]);
  g.lineTo(p1[0], p1[1]);
  g.bezierCurveTo(p1[0] + 50, p1[1], p4[0] - 50, p4[1], p4[0], p4[1]);
  g.stroke({ width: 3, color: 0xcfcac1, alpha: 0.9 });
  g.roundRect(18, top - 40, right - 36, 14, 7).fill(0xdfe6ea);
  g.roundRect(26, top - 32, right - 52, 6, 3).fill(C.cyan);
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

function drawWindow(PIXI, { x, w, view }) {
  const c = new PIXI.Container();
  const h = 205;
  const top = FLOOR - 165 - h;
  const g = new PIXI.Graphics();
  g.roundRect(-w / 2 - 10, top - 10, w + 20, h + 20, 22).fill(C.frame);
  g.roundRect(-w / 2, top, w, h, 16).fill(0xd8eef8);
  const pane = new PIXI.Graphics();
  if (view === 'pine') {
    // Clouds, two green hills and a pine (video t17).
    for (const [cx, cy, r] of [[-w * 0.2, 0.3, 24], [w * 0.02, 0.26, 30], [w * 0.26, 0.34, 20]]) {
      pane.circle(cx, top + h * cy, r).fill({ color: 0xffffff, alpha: 0.95 });
    }
    pane.poly([-w / 2, top + h * 0.62, -w * 0.15, top + h * 0.5, w * 0.2, top + h * 0.66, w / 2, top + h * 0.58, w / 2, top + h, -w / 2, top + h]).fill(0x9fbf98);
    pane.poly([-w / 2, top + h * 0.8, 0, top + h * 0.7, w / 2, top + h * 0.82, w / 2, top + h, -w / 2, top + h]).fill(0x7fa57f);
    const px = w * 0.22;
    for (const [y0, hw] of [[0.36, 12], [0.46, 18], [0.56, 24], [0.66, 30]]) {
      pane.poly([px, top + h * (y0 - 0.1), px + hw, top + h * y0, px - hw, top + h * y0]).fill(0x5f8a68);
    }
    pane.rect(px - 3, top + h * 0.66, 6, h * 0.1).fill(0x5d6a52);
  } else if (view === 'peak') {
    // A snowy slope under a pale sky (video t22-24).
    pane.poly([-w / 2, top + h * 0.95, -w * 0.05, top + h * 0.35, w * 0.12, top + h * 0.5, w / 2, top + h * 0.8, w / 2, top + h, -w / 2, top + h]).fill(0xf6fafc);
    pane.poly([-w * 0.05, top + h * 0.35, w * 0.02, top + h * 0.6, -w * 0.12, top + h * 0.75]).stroke({ width: 2, color: 0xb9c3c9, alpha: 0.8 });
  } else {
    pane.roundRect(-w / 2, top + h * 0.55, w, h * 0.45, 16).fill({ color: 0xeef8fc, alpha: 0.8 });
  }
  const mask = new PIXI.Graphics();
  mask.roundRect(-w / 2, top, w, h, 16).fill(0xffffff);
  pane.mask = mask;
  const glint = new PIXI.Graphics();
  glint.roundRect(-w / 2 + 10, top + 10, 8, h - 20, 4).fill({ color: 0xffffff, alpha: 0.55 });
  c.addChild(g, pane, mask, glint);
  c.x = sx(x);
  return c;
}

function drawPillar(PIXI, x) {
  // In front of the avatar (video t20, t30, t41, t89): its foot a little in front of the walking line.
  const g = new PIXI.Graphics();
  const w = 90;
  const wx = sx(x);
  const foot = FLOOR + 14;
  g.rect(wx - w / 2, CEIL + 25, w, foot - CEIL - 25).fill(0xf3f2ef);
  g.rect(wx - w / 2, CEIL + 25, 14, foot - CEIL - 25).fill({ color: 0xffffff, alpha: 0.9 });
  g.rect(wx + w / 2 - 12, CEIL + 25, 12, foot - CEIL - 25).fill({ color: 0xd9d6cf, alpha: 1 });
  g.roundRect(wx - w / 2 - 8, foot - 38, w + 16, 38, 6).fill(0xe9e7e2);
  g.roundRect(wx - w / 2 - 8, BAND - 6, w + 16, 22, 6).fill(0xe9e7e2);
  g.ellipse(wx, foot + 2, w / 2 + 14, 6).fill({ color: 0x000000, alpha: 0.1 });
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
  // Video t26: the frame runs ~148 to ~380 px above the walking line, ~427 wide.
  const w = 400;
  const h = 204;
  const bottom = FLOOR - 162;
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
  const emblem = deco(PIXI, 'emblem_alph@3x', 0, top + h * 0.66, 2.45, { dir: ICON });
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
    fontFamily: 'Georgia, Times New Roman, serif', fontSize: 32, fontWeight: '900', fill: 0xf3eee3,
    stroke: { color: 0x3f3a33, width: 5 },
  } });
  title.anchor.set(0.5, 0.5);
  title.y = top + h * 0.76;
  const sub = new PIXI.Text({ text: '“A Home for Everyone”', style: {
    fontFamily: 'Georgia, Times New Roman, serif', fontSize: 14, fontStyle: 'italic', fontWeight: '700', fill: 0xf3eee3,
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

function drawCable(PIXI, { x, bottom }) {
  // A broken cable hanging from the ceiling with a small plug at its end.
  const g = new PIXI.Graphics();
  const wx = sx(x);
  const end = FLOOR - bottom;
  const top = CEIL + 25;
  const len = end - top;
  g.moveTo(wx, top);
  g.bezierCurveTo(wx - 14, top + len * 0.35, wx + 22, top + len * 0.55, wx + 4, top + len * 0.78);
  g.bezierCurveTo(wx - 8, top + len * 0.9, wx + 6, end - 14, wx + 2, end - 12);
  g.stroke({ width: 2.5, color: 0x4b4741, alpha: 0.9, join: 'round', cap: 'round' });
  g.roundRect(wx - 5, end - 13, 14, 15, 3).fill(0xf1efea).roundRect(wx - 5, end - 13, 14, 15, 3).stroke({ width: 1.5, color: 0x8a857c });
  g.rect(wx - 2, end + 2, 2, 5).fill(0x8a857c).rect(wx + 4, end + 2, 2, 5).fill(0x8a857c);
  return g;
}

function drawGraffiti(PIXI, { x, lines }) {
  // "Tri Saves", scrawled on the wall (video 2Z76dO4DlJ4 t41, t89-91).
  const t = new PIXI.Text({ text: lines.join('\n'), style: {
    fontFamily: 'Comic Sans MS, Chalkboard SE, Marker Felt, sans-serif', fontSize: 40, fontWeight: '700',
    fill: 0x9a8f86, align: 'center', lineHeight: 38,
  } });
  t.anchor.set(0.5, 1);
  t.rotation = -0.2;
  t.alpha = 0.7;
  t.x = sx(x);
  t.y = FLOOR - 160;
  return t;
}

function drawTorn(PIXI, { x }) {
  // A peeled poster: torn paper scraps with red-brown streaks (video t21-23), drawn, not traced.
  const g = new PIXI.Graphics();
  const wx = sx(x);
  const top = FLOOR - 342;
  const bot = FLOOR - 177;
  g.poly([wx - 50, top, wx + 58, top + 6, wx + 40, top + 40, wx + 62, top + 70, wx + 30, bot - 10, wx + 48, bot, wx - 6, bot - 18, wx - 44, bot - 4, wx - 30, top + 90, wx - 60, top + 50]).fill({ color: 0xf2ece0, alpha: 0.9 });
  for (const [x0, y0, x1, y1, w] of [[-34, 30, -16, 120, 7], [-4, 22, 14, 90, 5], [20, 70, 36, 150, 8], [-28, 120, -10, 160, 6]]) {
    g.moveTo(wx + x0, top + y0);
    g.lineTo(wx + x1, top + y1);
    g.stroke({ width: w, color: 0xa4532f, alpha: 0.75, cap: 'round' });
  }
  g.rect(wx - 30, top + 8, 56, 14).fill({ color: 0xb06a46, alpha: 0.55 });
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
  for (const s of DRESSING.signs) world.addChild(drawSign(PIXI, s));
  world.addChild(drawGraffiti(PIXI, DRESSING.graffiti));
  world.addChild(drawTorn(PIXI, DRESSING.torn));
  world.addChild(drawPoster(PIXI, DRESSING.poster));
  for (const c of DRESSING.cables) world.addChild(drawCable(PIXI, c));
  for (const n of DRESSING.notes) world.addChild(drawNote(PIXI, n));
  for (const x of DRESSING.eggs) world.addChild(deco(PIXI, 'eggbooth', sx(x), FLOOR - 70, 0.5));
  world.addChild(drawEntry(PIXI));
  world.addChild(drawArrow(PIXI, DRESSING.arrow));
  world.addChild(drawGlow(PIXI));
  // The teleporter's ceiling cap and floor pad (Teleporter_Base, half scale, foot at the beam's).
  const pad = { x: sx(990), y: sy(-130) };
  world.addChild(deco(PIXI, 'Teleporter_Base', pad.x, pad.y, 0.5));
  for (const o of DRESSING.orbs) world.addChild(deco(PIXI, 'security_orb', sx(o.x), FLOOR - o.h, o.s ?? 0.5, { flip: o.x > 0 }));
  return { root, pad };
}

/** The pillars, drawn over the avatar (the room adds this to the entity layer in front). */
export function buildFront(PIXI) {
  const c = new PIXI.Container();
  for (const x of DRESSING.pillars) c.addChild(drawPillar(PIXI, x));
  return c;
}

/** Walkable lines: the entry ledge and ramp, then the corridor floor. */
export function labPlatforms(kit) {
  const pts = entryPath();
  const out = [];
  for (let i = 1; i < pts.length; i += 1) {
    const [x1, y1] = pts[i - 1];
    const [x2, y2] = pts[i];
    out.push(kit.plat(x1, y1, x2, y2, 'invisible', { id: `fireflex_entry${i}` }));
  }
  out.push(kit.plat(sx(ENTRY.rampEnd), FLOOR, W, FLOOR, 'invisible', { id: 'fireflex_floor' }));
  return out;
}
