/**
 * The Fireflex 3000 Lab backdrop for Firefly Whistle (quests/firefly_whistle.js).
 *
 * Source: the quest's instance comes from template LM113UBSS8P18ET ("Fireflex
 * 3000 Lab", hub 61 Simple Level Quests in inc_data_maps_prod.js; dev copy
 * LHH11C4QUBP1DQD). Neither is in the public locations dump, so the geometry
 * and the placements are lost. What the code fixes: you arrive at -2967, -283,
 * and the teleporter's beam overlay (items/teleporter_button.js) stands at x
 * 990 with its foot at y -130 (location_overlay registration is centre_bottom),
 * 275 x 530: exactly Teleporter_Base / Teleporter_Beam at their stage size, as
 * Le Misérable places them. In Snap PIFISEG38S535GC_56214 the pad's foot sits
 * about 8 Snap px (12 world px) below the avatar's feet, so the floor here is
 * taken as y -142.
 *
 * Look, from three player Snaps of this very street (research/wayback/raw/
 * snaps/fireflex_lab/, reference only, never shipped) and video 2Z76dO4DlJ4:
 * a pale corridor wall with a blue-grey band, a pale deck over a hazard stripe,
 * a row of cyan lights and a dark underside lit by white tubes; hanging
 * security orbs; an egg-shaped phone pod; the framed "Church of Alph" poster;
 * "G2" on the wall; windows; the white pillars; the whistle stand; hanging
 * cables, pinned notes; the Teleporter Control Unit wired to its pad.
 *
 * Art (G113): every piece is a CC0 deco from starter.swf, the street bundle
 * the lab's pieces live in (tinyspeck/glitch-locations), rendered at its stage
 * size by tools/room-art/build.py (set firefly_lab, js/quest-rooms/
 * firefly-lab-art.js): the wall run (wall, which carries the "G2" and a cyan
 * seam, plain wall_small, window_cutout with silhouette and cloud decos behind
 * its glass, wall_seam_separated_01a_starter), the deck (platform) over its lit
 * front edge (ground_slice), the entry (doorway1), pillar, poster_alph inside
 * frame_cutout, graffiti_tii_saves (it reads "Tii Saves"), graffiti_hell, torn_poster_1,
 * crack (the hanging cables), flyer (the pinned notes) and the floor arrows
 * (arrow_ground, arrow_ground2). eggbooth, security_orb and Teleporter_Base
 * come from the street deco set (assets/decos/groddle). Only the ceiling above
 * the wall run, which the camera never shows, is a flat fill.
 *
 * Layout, from the whole run on video 2Z76dO4DlJ4 ("Glitch - Getting the
 * firefly whistle", 2012; reference only, its pixels never ship): left to
 * right, the entry doorway and its ramp, a window, G2, pillar, note, the
 * peeled poster, pillar, a window, G2, the Church of Alph poster, the egg pod,
 * pillar, the stand, pillar, G2, the graffiti, cable, note, the control unit,
 * the pad and a last window. One egg pod, four pillars, all in front of the
 * avatar. DRESSING notes each piece's timestamp. The wall decos fall into
 * place on their own: each window sits flush against the next G2 wall, and two
 * of the G2 walls' own cyan seams land on seams the video shows (-2203, 484).
 */

import { textureFromUrl } from '../textures.js?v=db2ce452';
import { FIREFLY_LAB_FILES } from './firefly-lab-art.js?v=481a55f9';

/**
 * Source bounds. Video 2Z76dO4DlJ4 (reference only) fixes l and r: the camera
 * stops scrolling with the arrival point 33 px from the left edge (t15-18) and
 * with the window past the pad at the right edge (t103-107). Distances along
 * the corridor are read off its frames at 2.21 world px per video px, the scale
 * that puts the arrival point (-2967) and the beam (990) where the video shows
 * them; at that scale the decos show at their stage size (graffiti ~148 world
 * px wide, poster frame ~427, pillar shaft ~90).
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
 * The entry: you arrive in the doorway at the left end, on a ledge about 70 px
 * above the corridor floor, and walk down a curved ramp (video t15-21: the
 * avatar's feet drop ~32 video px while the camera follows it down). The
 * source's arrival y -283 is above the ledge; the remake sets you on it.
 */
export const ENTRY = Object.freeze({ x1: -3000, ledgeEnd: -2935, rampEnd: -2800, y: FLOOR_Y - 70 });

const DECO = 'assets/decos/groddle/';
const ART = 'assets/sprites/quest-rooms/firefly_lab/';

// Bands, in world px relative to the walking line (from the Snaps and the video).
const DECK_BACK = FLOOR - 115;
const DECK_FRONT = FLOOR + 35;
const STRIPE_B = DECK_FRONT + 18;
const BAND = FLOOR - 192;
const CEIL = FLOOR - 560;
/**
 * The wall run's top: every wall deco (wall, wall_small, window_cutout) is 346
 * tall with its blue-grey band at rows 246-266, which sits on the band the
 * video shows (BAND, 3 px of highlight above it). Its foot runs 20 px under
 * the deck's back edge.
 */
const WALL_TOP = BAND - 3 - 246;
/** window_cutout's glass, in its own px (alpha > 200 rim): x 13-138, y 60-260. */
const GLASS = Object.freeze({ x0: 13, x1: 138, y0: 60, y1: 260 });
/** wall: its "G2" spans x 7-63 (centre 35), its own cyan seam runs at x 343. */
const WALL_G2_X = 35;
const WALL_SEAM_X = 343;
/** wall_seam_separated_01a_starter: the seam line at x ~131 of 180. */
const SEAM_DECO_X = 131;
/** pillar: the shaft's foot at row 488 of 504 (the rest is soft shadow). */
const PILLAR_FOOT = 488;
/** Floor arrows lie on the deck ~25 px behind the walking line (video t26, t41: just behind the avatar's feet). */
const ARROW_Y = FLOOR - 25;
/** frame_cutout: its opening spans x 13-418, y 47-280; poster_alph fills it from behind. */
const FRAME_OPENING = Object.freeze({ x: (13 + 418) / 2, y: (47 + 280) / 2 });
/**
 * doorway1: its left edge (room px) and its foot above the walking line. Video t17 puts its lamp
 * ~157 px in and its foot ~22 px under the avatar's on the ledge; the left edge is pulled to -15 so
 * the arrival point (33) stands inside the doorway, not on the wall left of it.
 */
const DOORWAY = Object.freeze({ left: -15, lift: 48 });

const C = Object.freeze({
  wallTop: 0xd9d4c9, // wall/wall_small row 0 (217, 212, 201)
  deck: 0xe0dbcf, // platform's top (224, 219, 207)
  ceiling: 0xf2f0ec,
  ceilingEdge: 0xcbc6bd,
  cyan: 0x8af1ff,
  under: 0x3b3936,
  sky: 0xd8eef8,
});

/**
 * Source-x positions of the dressing, read off video 2Z76dO4DlJ4 (timestamps
 * in seconds). Wall pieces sit on a slower parallax layer in the original;
 * they are placed where they show with the avatar beside them.
 */
export const DRESSING = Object.freeze({
  // t17 a pine-and-hills view, t22 a big cloud, t93-103 plain glass past the pad (window_cutout, 157 wide).
  windows: [{ x: -2625, w: 157, view: 'pine' }, { x: -1708, w: 157, view: 'cloud' }, { x: 1175, w: 157, view: 'plain' }],
  // "G2" three times along the wall (t17, t24, t41): each is the G2 painted on a `wall` deco.
  signs: [{ x: -2512, text: 'G2' }, { x: -1596, text: 'G2' }, { x: 162, text: 'G2' }],
  // graffiti_tii_saves between the third G2 and the teleporter (t41, t89-91); it reads "Tii Saves".
  graffiti: { x: 345, text: 'Tii Saves' },
  // graffiti_hell, a small red scrawl low on the wall just right of the first G2 (t17, t21).
  scrawl: { x: -2463, y: FLOOR - 135 },
  // torn_poster_1, peeled, between the first two pillars (t21-23).
  torn: { x: -2062 },
  // The cyan floor arrow (arrow_ground2) left of the poster (t22-26; the arrow of Snap PIF3L2MLDT53HEF_51819).
  arrow: { x: -1700 },
  // More floor arrows on the deck: a cyan one past the entry (t17-21), grey ones (arrow_ground) past
  // the first pillars (t21) and between the last pillar and the control unit (t41, t89-100).
  floorArrows: [{ x: -2652, kind: 'cyan' }, { x: -1986, kind: 'grey' }, { x: 265, kind: 'grey' }],
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
  // Broken cables (crack) hanging from above, a plug at the end (t17, t36, t91); `bottom` is the plug's
  // height above the walking line.
  cables: [{ x: -2744, bottom: 330 }, { x: -538, bottom: 235 }, { x: 614, bottom: 300 }],
  notes: [{ x: -2298 }, { x: 723 }],
  // Cyan wall seams. Those on a G2 wall's own seam (-2203, 484) come with that deco; -1660 falls on
  // the second window's glass (the video's seam there is the window's edge) and is not drawn.
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

/** A deco from the firefly_lab set (world size from its art table). */
export function piece(PIXI, name, x, y, opts = {}) {
  const [file] = FIREFLY_LAB_FILES[name];
  const spr = new PIXI.Sprite(textureFromUrl(`${ART}${file}`));
  spr.anchor.set(opts.ax ?? 0.5, opts.ay ?? 1);
  const s = opts.scale ?? 1;
  spr.scale.set(opts.flip ? -s : s, opts.scaleY ?? s);
  spr.x = x;
  spr.y = y;
  if (opts.alpha != null) spr.alpha = opts.alpha;
  spr.eventMode = 'none';
  return spr;
}

const size = (name) => FIREFLY_LAB_FILES[name].slice(1);

/** Lay `name` side by side from x 0 to W (1 px overlap so no seam shows). */
function tileRow(PIXI, name, y, opts = {}) {
  const c = new PIXI.Container();
  const [w] = size(name);
  for (let x = 0; x < W; x += w - 1) c.addChild(piece(PIXI, name, x, y, { ax: 0, ay: 0, ...opts }));
  return c;
}

function drawShell(PIXI) {
  const g = new PIXI.Graphics();
  // Ceiling, the strip of wall above the wall run (the camera never reaches it), and a dark
  // underside under the deck's lit edge.
  g.rect(0, 0, W, CEIL + 22).fill(C.ceiling);
  g.rect(0, CEIL + 22, W, 3).fill(C.ceilingEdge);
  g.rect(0, CEIL + 25, W, WALL_TOP - CEIL - 24).fill(C.wallTop);
  for (let x = 140; x < W; x += 380) g.roundRect(x, CEIL + 10, 60, 9, 4).fill(C.cyan);
  g.rect(0, STRIPE_B, W, H - STRIPE_B).fill(C.under);
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

/** The window's view: sky, then the silhouette and cloud decos behind the glass (video t17, t22, t103). */
function drawView(PIXI, { x, view }) {
  const [ww] = size('window_cutout');
  const left = sx(x) - ww / 2;
  const gx0 = left + GLASS.x0;
  const gy0 = WALL_TOP + GLASS.y0;
  const gw = GLASS.x1 - GLASS.x0;
  const gh = GLASS.y1 - GLASS.y0;
  const c = new PIXI.Container();
  const sky = new PIXI.Graphics();
  sky.rect(gx0, gy0, gw, gh).fill(C.sky);
  c.addChild(sky);
  const cx = gx0 + gw / 2;
  if (view === 'pine') {
    // A cloud, a green hill and a pine (t17).
    c.addChild(piece(PIXI, 'cloud_small1', cx - 30, gy0 + 60, { scale: 1.2 }));
    c.addChild(piece(PIXI, 'cloud_small2', cx + 34, gy0 + 46));
    c.addChild(piece(PIXI, 'silhouette1', cx - 20, gy0 + gh + 4));
    c.addChild(piece(PIXI, 'silhouette2', cx + 30, gy0 + gh + 2));
  } else if (view === 'cloud') {
    // A big white cloud filling the lower glass (t22-26).
    c.addChild(piece(PIXI, 'silhouette3', cx - 34, gy0 + gh));
    c.addChild(piece(PIXI, 'cloud_close', cx + 10, gy0 + gh + 30));
  } else {
    c.addChild(piece(PIXI, 'cloud_distant', cx + 20, gy0 + gh + 60, { alpha: 0.7 }));
  }
  const mask = new PIXI.Graphics();
  mask.rect(gx0, gy0, gw, gh).fill(0xffffff);
  c.addChild(mask);
  c.mask = mask;
  return c;
}

/** The wall run: wall_small all along, the G2 walls, the windows, and the loose cyan seams. */
function drawWalls(PIXI) {
  const c = new PIXI.Container();
  c.addChild(tileRow(PIXI, 'wall_small', WALL_TOP));
  for (const win of DRESSING.windows) c.addChild(drawView(PIXI, win));
  for (const s of DRESSING.signs) c.addChild(piece(PIXI, 'wall', sx(s.x) - WALL_G2_X, WALL_TOP, { ax: 0, ay: 0 }));
  for (const win of DRESSING.windows) c.addChild(piece(PIXI, 'window_cutout', sx(win.x), WALL_TOP, { ay: 0 }));
  for (const x of seamsToDraw()) {
    c.addChild(piece(PIXI, 'wall_seam_separated_01a_starter', sx(x) - SEAM_DECO_X, WALL_TOP, { ax: 0, ay: 0 }));
  }
  return c;
}

/** The cyan seams no G2 wall or window already accounts for. */
export function seamsToDraw() {
  const [ww] = size('window_cutout');
  return DRESSING.cyanSeams.filter((x) => {
    if (DRESSING.signs.some((s) => Math.abs(s.x - WALL_G2_X + WALL_SEAM_X - x) < 30)) return false;
    return !DRESSING.windows.some((w) => Math.abs(w.x - x) < ww / 2);
  });
}

/**
 * The deck and its lit front edge: platform (84 tall, its hazard stripe in rows 71-84) drawn 1.4x
 * tall so the stripe is the video's ~18 px, its bottom on STRIPE_B, its own pale colour carried back
 * to the wall's foot, and ground_slice (the cyan lights, the deck's edge and the tube-lit underside).
 */
const PLATFORM_Y = 1.4;
function drawDeck(PIXI) {
  const c = new PIXI.Container();
  const [, ph] = size('platform');
  const top = STRIPE_B - ph * PLATFORM_Y;
  const g = new PIXI.Graphics();
  g.rect(0, DECK_BACK, W, top - DECK_BACK + 1).fill(C.deck);
  c.addChild(g);
  c.addChild(tileRow(PIXI, 'ground_slice', STRIPE_B));
  c.addChild(tileRow(PIXI, 'platform', top, { scaleY: PLATFORM_Y }));
  return c;
}

function drawPoster(PIXI, { x }) {
  // Video t26: the frame runs ~148 to ~380 px above the walking line, ~427 wide (frame_cutout: 439 x 296,
  // its lamps included). poster_alph sits behind the frame's opening.
  const c = new PIXI.Container();
  const [fw, fh] = size('frame_cutout');
  const bottom = FLOOR - 148;
  const top = bottom - fh;
  c.addChild(piece(PIXI, 'poster_alph', FRAME_OPENING.x - fw / 2, top + FRAME_OPENING.y, { ay: 0.5 }));
  c.addChild(piece(PIXI, 'frame_cutout', 0, bottom));
  c.x = sx(x);
  return c;
}

/**
 * The backdrop container (kit.sceneRoot) and the pad position the room needs.
 * @returns {{ root: any, pad: { x: number, y: number } }}
 */
export function buildLab(PIXI, kit) {
  const root = kit.sceneRoot(PIXI, W, H);
  const world = root.layer(1, 2);
  world.addChild(drawShell(PIXI));
  world.addChild(drawWalls(PIXI));
  // On the wall: graffiti (faded, as the video shows it), the peeled poster, the notes, the poster.
  world.addChild(piece(PIXI, 'graffiti_tii_saves', sx(DRESSING.graffiti.x), BAND - 3, { alpha: 0.75 }));
  world.addChild(piece(PIXI, 'graffiti_hell', sx(DRESSING.scrawl.x), DRESSING.scrawl.y, { ay: 0.5 }));
  world.addChild(piece(PIXI, 'torn_poster_1', sx(DRESSING.torn.x), FLOOR - 177));
  for (const n of DRESSING.notes) world.addChild(piece(PIXI, 'flyer', sx(n.x), FLOOR - 305, { ay: 0 }));
  world.addChild(drawPoster(PIXI, DRESSING.poster));
  for (const cbl of DRESSING.cables) world.addChild(piece(PIXI, 'crack', sx(cbl.x), FLOOR - cbl.bottom));
  world.addChild(drawDeck(PIXI));
  const [dw] = size('doorway1');
  world.addChild(piece(PIXI, 'doorway1', DOORWAY.left + dw / 2, FLOOR - DOORWAY.lift));
  for (const x of DRESSING.eggs) world.addChild(deco(PIXI, 'eggbooth', sx(x), FLOOR - 70, 0.5));
  world.addChild(piece(PIXI, 'arrow_ground2', sx(DRESSING.arrow.x), ARROW_Y, { ay: 0.5 }));
  for (const a of DRESSING.floorArrows) {
    world.addChild(piece(PIXI, a.kind === 'cyan' ? 'arrow_ground2' : 'arrow_ground', sx(a.x), ARROW_Y, { ay: 0.5 }));
  }
  // The teleporter's ceiling cap and floor pad (Teleporter_Base, foot at the beam's).
  const pad = { x: sx(990), y: sy(-130) };
  world.addChild(deco(PIXI, 'Teleporter_Base', pad.x, pad.y, 0.5));
  for (const o of DRESSING.orbs) world.addChild(deco(PIXI, 'security_orb', sx(o.x), FLOOR - o.h, o.s ?? 0.5, { flip: o.x > 0 }));
  return { root, pad };
}

/** The pillars, drawn over the avatar (the room adds this to the entity layer in front). */
export function buildFront(PIXI) {
  const c = new PIXI.Container();
  const [, ph] = size('pillar');
  // In front of the avatar (video t20, t30, t41, t89): the shaft's foot a little in front of the walking line.
  for (const x of DRESSING.pillars) c.addChild(piece(PIXI, 'pillar', sx(x), FLOOR + 14, { ay: PILLAR_FOOT / ph }));
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
