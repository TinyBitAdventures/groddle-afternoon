/**
 * Join the Club (quests/join_club.js + join_club_reminisce.js).
 *
 * Source: the Bag Butler hands out the invitation at 30128 iMG
 * (players/inc_stats.js; the remake offers it through the Magic Rock, see
 * catalog OFFER_OVERRIDES). onStarted instances "The Society of Keen-Eyed
 * Noticers" (LIFCSSIJNOA3PTE, entered at its marker_teleport) with a
 * 5 * 60 second exit delay; the second location is "Pintura Prosa"
 * (LIFD72UKNOA3679), reached through the clubhouse's Curious Painting
 * (items/club_house_picture.js: verb "jump in", tooltip "Looks inviting",
 * "Try getting closer." past 175 px, which broadcasts the location event
 * that moves you). Requirements: `solved_puzzle` ("Access Clubhouse"),
 * `instance_exit_via_signpost` ("Get the Picture", set by main.js when an
 * instance_exit signpost is used) and, for the first run only,
 * `talk_to_butler` ("Tell your Butler about the club"). Leaving any other
 * way fails the quest (onExitLocation). Rewards: 750 currants and 100
 * Friendly favor; the reminisce pays 200 and 25 and says "Welcome back".
 *
 * The Butler is the end NPC (end_npcs: bag_butler). bag_butler.js doQuests
 * sets `talk_to_butler` once `instance_exit_via_signpost` is set and turns
 * the quest in with its completion text, when the owner comes home within
 * 600 px of the Butler (onPlayerEnter) or walks into its 550 px far hit box
 * (onPlayerCollision). The source's out-of-range prompt (joinClubReturn)
 * has no string in butler_strings.js, so it said nothing; the remake waits
 * the same way. The `world` hook below does this while the quest is open;
 * a player with no Butler (no home yet) tells it on the way out instead.
 *
 * Lost: both location geometries and the clubhouse's location events (the
 * picture frames and the ENTER button were deco + items/wall_button.js
 * wired by events). Rebuilt from the supplied recording (ScgY1IJgzAo): a
 * dusk forest floor behind a plank fence, ladders up the trunks to a
 * village of treehouses joined by rope bridges (a hut of charms and a
 * cattle skull, a hut of jars, a clothesline hut, a hut of vases), each with
 * one burnt sketch on its wall. The clubhouse's outer wall holds four empty
 * frames, a wall button under each that flips its picture, and an ENTER
 * button by the door. Set every frame to the sketch you noticed in the
 * village and press ENTER: the frames light up and the door opens. Inside:
 * a fireplace, lanterns and the Curious Painting. Pintura Prosa is a misty
 * night meadow of lily pads on tall stalks with Qurazy quoins floating over
 * them and an Exit signpost at the far end. The two overlay lines on
 * arrival are read off the recording.
 *
 * Art: recovered Groddle decos (tree_stack_base, tree_foliage_red_big,
 * pinehills, fence_wood_1, bridge, hanging_clothes_*, jar*, vase_1,
 * vase_broken_1, bling_charms_1, cattle_skull, charm_*, lantern,
 * mushroom_amanita_1, rug_red, deco_chair/table_wooden_ghtest,
 * tree_group_bg_2_maytang, tree_dark_1, purple flowers) and OGA
 * club_house_picture, wall_button (lockOut / lockIn) and the
 * furniture_fireplace frame. Huts, decks, sketches, lily pads and the
 * signpost are drawn here.
 */

import { textureFromUrl } from '../textures.js';
import { butlerApi } from '../features/butler-feature.js?v=butler-feature-11';

export const ROOM_MS = 5 * 60 * 1000; // source: questInstanceLocation(..., 5*60)
export const PICTURE_REACH = 175; // source: club_house_picture jump_in conditions
export const BUTTON_RESET_MS = 1000; // source: wall_switch reset_timer "1000"
export const BUTTON_REACH = 420;
export const SIGNPOST_REACH = 170;
export const INTRO_LINES = Object.freeze([
  'Clubs can be very exclusive!',
  'In this case, only the observant may enter.',
]);
export const WRONG_LINE = 'The door stays shut. Only the observant may enter.';
export const PART_1 = 'join_club';
export const REMINISCE = 'join_club_reminisce';
const ART = 'assets/sprites/quest-rooms/clubhouse/';

/* ------------------------------------------------------------------ */
/* The puzzle                                                           */
/* ------------------------------------------------------------------ */

/** The four frames, left to right: the pictures each button flips through. */
export const FRAMES = Object.freeze([
  Object.freeze({ id: 'f1', options: Object.freeze(['cauldron', 'moon', 'fish', 'key']), answer: 'moon' }),
  Object.freeze({ id: 'f2', options: Object.freeze(['bird', 'mushroom', 'tree', 'house']), answer: 'tree' }),
  Object.freeze({ id: 'f3', options: Object.freeze(['boot', 'flower', 'snail', 'goat']), answer: 'goat' }),
  Object.freeze({ id: 'f4', options: Object.freeze(['sailboat', 'rain', 'lantern', 'feather']), answer: 'rain' }),
]);

/** One burnt sketch hangs in each treehouse (the charm hut's rain cloud is in the recording). */
export const SIGNS = Object.freeze([
  Object.freeze({ hut: 'charms', sketch: 'rain' }),
  Object.freeze({ hut: 'jars', sketch: 'tree' }),
  Object.freeze({ hut: 'clothes', sketch: 'moon' }),
  Object.freeze({ hut: 'vases', sketch: 'goat' }),
]);

export const initialChoices = () => FRAMES.map(() => 0);

/** A frame's button: the next picture, wrapping round. */
export function cycleFrame(choices, index) {
  const next = [...choices];
  const n = FRAMES[index].options.length;
  next[index] = (next[index] + 1) % n;
  return next;
}

export const shownSketch = (choices, index) => FRAMES[index].options[choices[index]];

export function framesSolved(choices) {
  return FRAMES.every((f, i) => f.options[choices[i]] === f.answer);
}

/** Button presses that turn `choices` into the answer (QA autoplay). */
export function pressesToSolve(choices) {
  return FRAMES.map((f, i) => (f.options.indexOf(f.answer) - choices[i] + f.options.length) % f.options.length);
}

/* ------------------------------------------------------------------ */
/* The Society of Keen-Eyed Noticers                                    */
/* ------------------------------------------------------------------ */

export const CLUB_W = 3900;
export const CLUB_H = 1560;
export const FLOOR = 1400;
export const SPAWN = Object.freeze({ x: 170, y: FLOOR });

/** Decks (walk lines) and the rope bridges between them. */
export const DECKS = Object.freeze({
  charms: { x1: 360, x2: 900, y: 1140 },
  landing: { x1: 1180, x2: 1330, y: 1160 },
  jars: { x1: 1190, x2: 1660, y: 900 },
  clothes: { x1: 1580, x2: 2000, y: 1140 },
  vases: { x1: 2240, x2: 2620, y: 1080 },
  club: { x1: 2860, x2: 3790, y: 1120 },
});
export const BRIDGES = Object.freeze([
  { id: 'b1', from: [900, 1140], to: [1180, 1160] },
  { id: 'b2', from: [1330, 1160], to: [1580, 1140] },
  { id: 'b3', from: [2000, 1140], to: [2240, 1080] },
  { id: 'b4', from: [2620, 1080], to: [2860, 1120] },
]);
/** Rungs nailed up the trunks: ground to the charm hut, landing to the jars, ground to the clubhouse. */
export const LADDERS = Object.freeze([
  { id: 'l1', x: 430, yTop: 1140, yBot: FLOOR },
  { id: 'l2', x: 1255, yTop: 900, yBot: 1160 },
  { id: 'l3', x: 2920, yTop: 1120, yBot: FLOOR },
]);
export const HUTS = Object.freeze({
  charms: { x1: 470, x2: 860, deck: 'charms', h: 190, sign: { x: 790, up: 112 } },
  jars: { x1: 1300, x2: 1630, deck: 'jars', h: 180, sign: { x: 1575, up: 108, tilt: -0.16 } },
  clothes: { x1: 1640, x2: 1960, deck: 'clothes', h: 190, sign: { x: 1690, up: 104 } },
  vases: { x1: 2290, x2: 2590, deck: 'vases', h: 180, sign: { x: 2335, up: 108 } },
});
export const CLUBHOUSE = Object.freeze({
  wallX1: 2960,
  wallX2: 3400,
  frameXs: Object.freeze([3010, 3100, 3190, 3280]),
  frameUp: 118,
  buttonUp: 60,
  enterX: 3352,
  door: Object.freeze({ x: 3420, x1: 3404, x2: 3436, h: 150 }),
  fireplaceX: 3585,
  pictureUp: 152,
  roofUp: 236,
});

export function clubPlatforms(kit) {
  const out = [kit.plat(0, FLOOR, CLUB_W, FLOOR, 'invisible', { id: 'club_floor' })];
  for (const [id, d] of Object.entries(DECKS)) out.push(kit.plat(d.x1, d.y, d.x2, d.y, 'wood', { id: `deck_${id}` }));
  for (const b of BRIDGES) out.push(kit.plat(b.from[0], b.from[1], b.to[0], b.to[1], 'invisible', { id: b.id }));
  return out;
}

export function clubWalls(kit) {
  return LADDERS.map((l) => ({ ...kit.ladder(l.x, l.yTop - 6, l.yBot), id: l.id }));
}

/** Where things the player must see or click sit, in px above their floor. */
export function clickHeights() {
  const out = [];
  for (const [id, hut] of Object.entries(HUTS)) out.push({ id: `sign_${id}`, up: hut.sign.up + 26 });
  CLUBHOUSE.frameXs.forEach((x, i) => out.push({ id: `frame_${i}`, up: CLUBHOUSE.frameUp + 29 }));
  out.push({ id: 'buttons', up: CLUBHOUSE.buttonUp + 18 });
  out.push({ id: 'picture', up: CLUBHOUSE.pictureUp });
  return out;
}

/** Quoins around the village (the recording shows currants, iMG, mood and favor). */
export const CLUB_QUOINS = Object.freeze([
  { id: 'g1', type: 'currants', x: 300, y: FLOOR - 40 },
  { id: 'g2', type: 'xp', x: 760, y: FLOOR - 40 },
  { id: 'g3', type: 'mood', x: 1500, y: FLOOR - 40 },
  { id: 'g4', type: 'currants', x: 2250, y: FLOOR - 40 },
  { id: 'g5', type: 'xp', x: 2700, y: FLOOR - 40 },
  { id: 'd1', type: 'favor', x: 640, y: 1140 - 70 },
  { id: 'd2', type: 'xp', x: 1040, y: 1150 - 60 },
  { id: 'd3', type: 'mood', x: 1450, y: 900 - 60 },
  { id: 'd4', type: 'currants', x: 1800, y: 1140 - 60 },
  { id: 'd5', type: 'xp', x: 2120, y: 1110 - 60 },
  { id: 'd6', type: 'mood', x: 2450, y: 1080 - 60 },
  // Inside the clubhouse: +10 energy, +10 mood and two Qurazy quoins (+378 iMG each in the recording).
  { id: 'i1', type: 'energy', x: 3480, y: 1120 - 50 },
  { id: 'i2', type: 'mood', x: 3530, y: 1120 - 50 },
  { id: 'i3', type: 'qurazy', x: 3680, y: 1120 - 60 },
  { id: 'i4', type: 'qurazy', x: 3745, y: 1120 - 60 },
]);

/* ------------------------------------------------------------------ */
/* Pintura Prosa                                                        */
/* ------------------------------------------------------------------ */

export const PROSA_W = 3300;
export const PROSA_H = 1200;
export const PROSA_FLOOR = 1060;
export const PROSA_SPAWN = Object.freeze({ x: 150, y: PROSA_FLOOR });
export const SIGNPOST = Object.freeze({ x: 3120, y: PROSA_FLOOR });

/** Lily pads on tall stalks: [centre x, half width, top, a low step back up from the floor]. */
export const PADS = Object.freeze([
  [420, 70, 970], [600, 75, 880], [790, 75, 790], [1000, 100, 700], [1210, 75, 790], [1400, 75, 880],
  [1520, 55, 970, true], [1640, 75, 790], [1840, 90, 700], [2060, 100, 620], [2280, 80, 700], [2470, 75, 790],
  [2660, 75, 880], [2850, 65, 970],
].map(([x, half, y, step = false], i) => Object.freeze({ id: `pad${i + 1}`, x, half, y, step })));

export function prosaPlatforms(kit) {
  const out = [kit.plat(0, PROSA_FLOOR, PROSA_W, PROSA_FLOOR, 'invisible', { id: 'prosa_floor' })];
  for (const p of PADS) out.push(kit.plat(p.x - p.half, p.y, p.x + p.half, p.y, 'invisible', { id: p.id }));
  return out;
}

/** Qurazy quoins over the pads (the recording collects five), plus mood, iMG and currants. */
export const PROSA_QUOINS = Object.freeze([
  { id: 'q1', type: 'qurazy', x: 1000, y: 700 - 85 },
  { id: 'q2', type: 'qurazy', x: 1640, y: 790 - 85 },
  { id: 'q3', type: 'qurazy', x: 2060, y: 620 - 85 },
  { id: 'q4', type: 'qurazy', x: 2470, y: 790 - 85 },
  { id: 'q5', type: 'qurazy', x: 2850, y: 970 - 85 },
  { id: 'm1', type: 'mood', x: 1210, y: 790 - 55 },
  { id: 'm2', type: 'mood', x: 2280, y: 700 - 55 },
  { id: 'x1', type: 'xp', x: 600, y: 880 - 55 },
  { id: 'x2', type: 'xp', x: 1840, y: 700 - 55 },
  { id: 'x3', type: 'xp', x: 700, y: PROSA_FLOOR - 40 },
  { id: 'x4', type: 'xp', x: 1900, y: PROSA_FLOOR - 40 },
  { id: 'c1', type: 'currants', x: 2600, y: PROSA_FLOOR - 40 },
]);

/* ------------------------------------------------------------------ */
/* Sketches (burnt into the frames and hut signs)                       */
/* ------------------------------------------------------------------ */

function poly(g, pts, close = false) {
  g.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
  if (close) g.lineTo(pts[0][0], pts[0][1]);
}

function arcPts(cx, cy, r, a0, a1, steps = 14, ry = r) {
  const out = [];
  for (let i = 0; i <= steps; i++) {
    const a = a0 + ((a1 - a0) * i) / steps;
    out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * ry]);
  }
  return out;
}

function star(g, x, y, s) {
  g.moveTo(x - s, y);
  g.lineTo(x + s, y);
  g.moveTo(x, y - s);
  g.lineTo(x, y + s);
}

function bumpy(cx, cy, rx, ry, bumps, depth, steps = 40) {
  const out = [];
  for (let i = 0; i <= steps; i++) {
    const a = (Math.PI * 2 * i) / steps;
    const k = 1 + depth * Math.abs(Math.sin((a * bumps) / 2));
    out.push([cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k]);
  }
  return out;
}

const D = Math.PI / 180;
/** Line drawings in a 64 x 46 box centred on 0,0. */
const SKETCHES = {
  moon(g) {
    poly(g, [...arcPts(-2, 0, 15, 50 * D, 310 * D, 18), ...arcPts(5, 0, 11.8, -77 * D, -283 * D, 18)], true);
    star(g, 15, -12, 3.5);
    star(g, 19, 7, 2.5);
  },
  tree(g) {
    poly(g, [[-3, 19], [-2, 2]]);
    poly(g, [[3, 19], [2, 2]]);
    poly(g, [[-3, 19], [-9, 21]]);
    poly(g, [[3, 19], [9, 21]]);
    poly(g, bumpy(0, -7, 14, 10, 7, 0.16), true);
    poly(g, [[0, 3], [-6, -6]]);
    poly(g, [[1, 1], [7, -8]]);
  },
  goat(g) {
    g.roundRect(-14, -5, 24, 10, 4);
    for (const x of [-11, -6, 4, 8]) poly(g, [[x, 5], [x, 18]]);
    poly(g, [[9, -3], [13, -13], [19, -11]]);
    poly(g, [[13, -13], [10, -21]]);
    poly(g, [[14, -14], [16, -22]]);
    poly(g, [[-14, -2], [-18, -7]]);
  },
  rain(g) {
    poly(g, arcPts(9, -9, 8, 180 * D, 360 * D, 10));
    for (const a of [-150, -115, -80, -45, -10]) {
      const r = a * D;
      poly(g, [[9 + Math.cos(r) * 11, -9 + Math.sin(r) * 11], [9 + Math.cos(r) * 15, -9 + Math.sin(r) * 15]]);
    }
    poly(g, [[-18, 2], ...arcPts(-11, 2, 7, 180 * D, 300 * D, 6), ...arcPts(1, -1, 10, 210 * D, 340 * D, 8), ...arcPts(12, 3, 6, 250 * D, 450 * D, 8), [-18, 9]], true);
    for (const x of [-12, -4, 4, 12]) poly(g, [[x, 13], [x - 3, 20]]);
  },
  cauldron(g) {
    g.ellipse(0, -4, 15, 4);
    poly(g, arcPts(0, -4, 15, 0, 180 * D, 14, 15));
    poly(g, [[-8, 10], [-11, 17]]);
    poly(g, [[8, 10], [11, 17]]);
    poly(g, [[-4, -10], [-7, -15], [-3, -19]]);
    poly(g, [[4, -10], [7, -15], [3, -20]]);
  },
  fish(g) {
    poly(g, [...arcPts(-2, 8, 14, 215 * D, 325 * D, 10), ...arcPts(-2, -8, 14, 35 * D, 145 * D, 10)], true);
    poly(g, [[9, 0], [18, -8], [18, 8]], true);
    g.circle(-10, -2, 1.5);
  },
  key(g) {
    g.circle(-11, 0, 6);
    poly(g, [[-5, 0], [17, 0]]);
    poly(g, [[12, 0], [12, 7]]);
    poly(g, [[16, 0], [16, 5]]);
  },
  bird(g) {
    g.ellipse(-1, 3, 11, 7);
    g.circle(10, -6, 5);
    poly(g, [[15, -7], [20, -5], [15, -4]]);
    poly(g, [[-11, 2], [-19, -4]]);
    poly(g, [[-3, 10], [-3, 17]]);
    poly(g, [[2, 10], [2, 17]]);
    poly(g, arcPts(-2, 2, 6, 200 * D, 340 * D, 6));
  },
  mushroom(g) {
    poly(g, [...arcPts(0, 0, 16, 180 * D, 360 * D, 14, 13), [-16, 0]], true);
    poly(g, [[-4, 0], [-5, 17], [5, 17], [4, 0]]);
    g.circle(-6, -6, 2);
    g.circle(5, -8, 2);
  },
  house(g) {
    g.rect(-12, -3, 24, 20);
    poly(g, [[-16, -3], [0, -17], [16, -3]]);
    g.rect(-3, 7, 6, 10);
  },
  boot(g) {
    poly(g, [[-8, -17], [4, -17], [4, 2], [14, 6], [16, 11], [16, 17], [-10, 17], [-10, 9], [-8, 6]], true);
    poly(g, [[-8, -10], [4, -10]]);
  },
  flower(g) {
    poly(g, [[0, 0], [0, 19]]);
    poly(g, [[0, 12], [7, 8]]);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
      g.circle(Math.cos(a) * 7, -8 + Math.sin(a) * 7, 4);
    }
    g.circle(0, -8, 2.5);
  },
  snail(g) {
    const pts = [];
    for (let i = 0; i <= 40; i++) {
      const a = (i / 40) * Math.PI * 4;
      const r = 1.5 + 0.9 * a;
      pts.push([-3 + Math.cos(a) * r, -1 + Math.sin(a) * r]);
    }
    poly(g, pts);
    poly(g, [[-17, 13], [15, 13], [17, 4]]);
    poly(g, [[16, 5], [14, -6]]);
    poly(g, [[17, 5], [20, -5]]);
  },
  sailboat(g) {
    poly(g, [[-17, 6], [17, 6], [11, 14], [-11, 14]], true);
    poly(g, [[0, 6], [0, -19]]);
    poly(g, [[1, -17], [13, 2], [1, 2]], true);
    poly(g, [[-20, 19], [-14, 17], [-8, 19], [-2, 17]]);
  },
  lantern(g) {
    poly(g, [[0, -21], [0, -15]]);
    poly(g, [[-9, -9], [-5, -15], [5, -15], [9, -9]], true);
    g.rect(-7, -9, 14, 18);
    poly(g, [[0, -9], [0, 9]]);
    poly(g, [[-7, 0], [7, 0]]);
    poly(g, [[-9, 9], [9, 9]]);
  },
  feather(g) {
    const spine = [];
    for (let i = 0; i <= 12; i++) {
      const t = i / 12;
      spine.push([-14 + t * 28, 17 - t * 34 + Math.sin(t * Math.PI) * 6]);
    }
    poly(g, spine);
    for (let i = 3; i <= 11; i += 2) {
      const [x, y] = spine[i];
      poly(g, [[x, y], [x - 8, y - 2]]);
      poly(g, [[x, y], [x + 2, y + 7]]);
    }
  },
};
export const SKETCH_IDS = Object.freeze(Object.keys(SKETCHES));

/** Draw one sketch: burnt brown on wood, or the lit white of a solved frame. */
export function drawSketch(PIXI, g, id, { lit = false, scale = 1 } = {}) {
  const fn = SKETCHES[id];
  if (!fn) return g;
  const passes = lit
    ? [{ width: 7, color: 0xfff1b8, alpha: 0.35 }, { width: 3, color: 0xffffff, alpha: 1 }]
    : [{ width: 2.6, color: 0x4a2d14, alpha: 0.88 }];
  for (const pass of passes) {
    g.setStrokeStyle({ ...pass, width: pass.width / scale, cap: 'round', join: 'round' });
    fn(g);
    g.stroke();
  }
  g.scale.set(scale);
  return g;
}

/** A nailed wooden plaque with a sketch on it (frames and hut signs). */
function plaque(PIXI, sketch, { w = 74, h = 56, lit = false, tilt = 0 } = {}) {
  const c = new PIXI.Container();
  const b = new PIXI.Graphics();
  b.roundRect(-w / 2 + 3, -h / 2 + 4, w, h, 4).fill({ color: 0x2e2116, alpha: 0.35 });
  b.roundRect(-w / 2, -h / 2, w, h, 4).fill(0x5b3a1f);
  b.rect(-w / 2 + 6, -h / 2 + 6, w - 12, h - 12).fill(lit ? 0x6e5236 : 0xc9a06a);
  for (let y = -h / 2 + 12; y < h / 2 - 6; y += 9) {
    b.moveTo(-w / 2 + 8, y);
    b.lineTo(w / 2 - 8, y + 1);
  }
  b.stroke({ width: 1, color: lit ? 0x5b432b : 0xae8350, alpha: 0.6 });
  b.circle(0, -h / 2 - 1, 3).fill(0xa9adb2);
  c.addChild(b);
  const s = new PIXI.Graphics();
  drawSketch(PIXI, s, sketch, { lit, scale: 0.95 });
  c.addChild(s);
  c.rotation = tilt;
  c.sketch = s;
  c.board = b;
  return c;
}

/* ------------------------------------------------------------------ */
/* Drawing the village                                                  */
/* ------------------------------------------------------------------ */

const WOOD = { wall: 0x8a6440, plank: 0x6b4a2b, light: 0xa77d50, post: 0x5d3f24, roof: 0x7a5a38, moss: 0x6f8f3a, dark: 0x22303b };

function drawDeck(g, x1, x2, y, depth = 16) {
  g.rect(x1 + 4, y + 4, x2 - x1, depth).fill({ color: 0x3d2a18, alpha: 0.35 });
  g.rect(x1, y, x2 - x1, depth).fill(WOOD.plank);
  g.rect(x1, y - 2, x2 - x1, 6).fill(WOOD.light);
  for (let x = x1 + 30; x < x2; x += 46) {
    g.moveTo(x, y + 4);
    g.lineTo(x, y + depth);
  }
  g.stroke({ width: 1, color: 0x4a321c, alpha: 0.7 });
  // Diagonal struts under the deck.
  for (const x of [x1 + 30, x2 - 30]) {
    if (x2 - x1 < 120) break;
    g.moveTo(x, y + depth);
    g.lineTo(x + (x < (x1 + x2) / 2 ? 46 : -46), y + depth + 70);
  }
  g.stroke({ width: 7, color: WOOD.post, alpha: 1 });
}

function drawHut(g, x1, x2, y, h, { window: win = true } = {}) {
  // Back wall of vertical planks.
  g.rect(x1, y - h, x2 - x1, h).fill(WOOD.wall);
  for (let x = x1; x < x2; x += 22) {
    g.rect(x + 1, y - h, 20, h).fill(x % 44 === 0 ? 0x94704a : 0x80603e);
    g.rect(x + 20, y - h, 2, h).fill({ color: 0x5d4129, alpha: 0.7 });
  }
  if (win) {
    const wx = x1 + (x2 - x1) * 0.28;
    g.rect(wx, y - h + 34, (x2 - x1) * 0.44, 62).fill({ color: WOOD.dark, alpha: 0.9 });
    g.rect(wx, y - h + 34, (x2 - x1) * 0.44, 62).stroke({ width: 5, color: WOOD.post, alpha: 1 });
  }
  // Corner posts and a mossy roof board.
  g.rect(x1 - 8, y - h - 14, 12, h + 14);
  g.rect(x2 - 4, y - h - 14, 12, h + 14);
  g.fill(WOOD.post);
  g.moveTo(x1 - 26, y - h - 8);
  g.lineTo(x2 + 26, y - h - 20);
  g.lineTo(x2 + 26, y - h - 6);
  g.lineTo(x1 - 26, y - h + 6);
  g.closePath();
  g.fill(WOOD.roof);
  g.ellipse(x1 + (x2 - x1) * 0.35, y - h - 12, (x2 - x1) * 0.28, 6).fill({ color: WOOD.moss, alpha: 0.9 });
}

function drawRungs(g, l) {
  for (let y = l.yBot - 18; y > l.yTop - 4; y -= 26) {
    g.rect(l.x - 22, y + 3, 44, 7).fill({ color: 0x3e2a17, alpha: 0.4 });
    g.roundRect(l.x - 22, y, 44, 7, 2).fill(0xb38652);
    g.circle(l.x - 17, y + 3.5, 1.5);
    g.circle(l.x + 17, y + 3.5, 1.5);
    g.fill(0x8f8f8f);
  }
}

function trunk(kit, PIXI, layer, x, topY) {
  // tree_stack_trunk 176x1400 stood on tree_stack_base 458x820 (roots on the floor).
  const base = kit.deco(PIXI, 'tree_stack_base', x, FLOOR + 14, { scale: 0.5 });
  const t = kit.deco(PIXI, 'tree_stack_trunk', x, FLOOR - 300, { scale: 0.62, sy: (FLOOR - 300 - topY) / 1400 });
  layer.addChild(t, base);
}

function buildClub(ctx) {
  const { PIXI, kit } = ctx;
  const root = kit.sceneRoot(PIXI, CLUB_W, CLUB_H);
  const sky = root.layer(0, 0);
  sky.addChild(kit.gradient(PIXI, [[0, '#18202d'], [0.55, '#2c3a4a'], [1, '#4a5a63']], 960, 640));
  const far = root.layer(0.2, 1);
  // Parallax layer y: screen y = y - factor * cameraY (camera y runs ~600 on the jars deck to ~1150 on the floor).
  for (let i = 0; i < 4; i++) far.addChild(kit.deco(PIXI, i % 2 ? 'pinehills_2' : 'pinehills_1', 500 + i * 1000, 560, { scale: 0.62, tint: 0x24382a }));
  const mid = root.layer(0.5, 2);
  for (let i = 0; i < 14; i++) {
    mid.addChild(kit.deco(PIXI, 'tree_coniferous_1', 80 + i * 260, 1000 + (i % 3) * 20, { scale: 0.42 + (i % 3) * 0.06, tint: 0x2f4d33 }));
  }
  const world = root.layer(1, 3);
  const g = new PIXI.Graphics();
  // The dusk field and its plank fence.
  g.rect(0, FLOOR - 130, CLUB_W, 140).fill(0x9a7d43);
  world.addChild(g);
  for (let x = 0; x < CLUB_W + 200; x += 160) world.addChild(kit.deco(PIXI, 'fence_wood_1', x, FLOOR - 66, { scale: 0.62, sy: 0.3, tint: 0x8a7a60 }));
  const ground = new PIXI.Graphics();
  ground.rect(0, FLOOR - 70, CLUB_W, CLUB_H - FLOOR + 70).fill(0xc9a55a);
  ground.rect(0, FLOOR + 6, CLUB_W, CLUB_H - FLOOR).fill(0xb48f45);
  world.addChild(ground);
  for (let i = 0; i < 12; i++) world.addChild(kit.deco(PIXI, 'bling_mushroom_bunch_ground_1', 240 + i * 310, FLOOR + 6, { scale: 0.35, alpha: 0.85 }));

  // Trunks, red crowns behind the decks.
  for (const [x, top] of [[430, 760], [1255, 560], [2100, 700], [2920, 640], [3830, 600]]) trunk(kit, PIXI, world, x, top);
  for (const [x, y, s] of [[300, 980, 0.9], [760, 860, 0.8], [1080, 700, 0.7], [1500, 620, 0.8], [1900, 900, 0.9], [2250, 780, 0.8],
    [2700, 860, 0.9], [3100, 760, 0.9], [3600, 760, 0.8], [3850, 900, 0.7]]) {
    world.addChild(kit.deco(PIXI, 'tree_foliage_red_big', x, y, { scale: s, tint: 0xd8d0d0 }));
  }
  world.addChild(kit.deco(PIXI, 'tree_stack_branch_1', 1180, 760, { scale: 0.8 }));
  world.addChild(kit.deco(PIXI, 'tree_stack_branch_2', 3000, 760, { scale: 0.8, flip: true }));

  // Huts on their decks.
  const huts = new PIXI.Graphics();
  for (const hut of Object.values(HUTS)) drawHut(huts, hut.x1, hut.x2, DECKS[hut.deck].y, hut.h);
  // The clubhouse: a long front wall, the door, the interior and a mushroom roof.
  const cy = DECKS.club.y;
  drawHut(huts, CLUBHOUSE.wallX1, CLUBHOUSE.wallX2, cy, 200, { window: false });
  huts.rect(CLUBHOUSE.wallX2, cy - CLUBHOUSE.door.h - 10, CLUBHOUSE.door.x2 - CLUBHOUSE.wallX2, CLUBHOUSE.door.h + 10).fill(0x2a1f16);
  huts.rect(CLUBHOUSE.door.x2, cy - 214, DECKS.club.x2 - CLUBHOUSE.door.x2 - 10, 214).fill(0x5e4630);
  // The jars hut's shelf.
  huts.rect(1325, DECKS.jars.y - 94, 190, 7).fill(WOOD.post);
  for (let x = CLUBHOUSE.door.x2; x < DECKS.club.x2 - 10; x += 30) {
    huts.rect(x, cy - 214, 3, 214).fill({ color: 0x4c3826, alpha: 0.8 });
  }
  huts.rect(CLUBHOUSE.door.x2 - 4, cy - CLUBHOUSE.roofUp, DECKS.club.x2 - CLUBHOUSE.door.x2 - 2, 22).fill(0x6e5238);
  huts.rect(CLUBHOUSE.wallX1 - 30, cy - CLUBHOUSE.roofUp - 12, DECKS.club.x2 - CLUBHOUSE.wallX1 + 50, 18).fill(WOOD.roof);
  huts.roundRect(CLUBHOUSE.wallX1 - 20, cy - CLUBHOUSE.roofUp - 22, 440, 14, 7).fill({ color: WOOD.moss, alpha: 0.95 });
  world.addChild(huts);
  for (let i = 0; i < 9; i++) {
    const x = CLUBHOUSE.wallX1 + 10 + i * 48 + (i % 2) * 9;
    world.addChild(kit.deco(PIXI, 'mushroom_amanita_1', x, cy - CLUBHOUSE.roofUp - 12, { scale: 0.13 + (i % 3) * 0.04 }));
  }

  // Decks, bridges, rungs.
  const decks = new PIXI.Graphics();
  for (const d of Object.values(DECKS)) drawDeck(decks, d.x1, d.x2, d.y);
  world.addChild(decks);
  for (const b of BRIDGES) {
    const [x1, y1] = b.from;
    const [x2, y2] = b.to;
    const len = Math.hypot(x2 - x1, y2 - y1);
    const spr = kit.deco(PIXI, 'bridge', x1 - 6, y1 - 4, { ax: 0, ay: 0.32, scale: (len + 12) / 846, sy: 0.32 });
    spr.rotation = Math.atan2(y2 - y1, x2 - x1);
    world.addChild(spr);
  }
  const rungs = new PIXI.Graphics();
  for (const l of LADDERS) drawRungs(rungs, l);
  world.addChild(rungs);

  // Hut furnishings (charms hut, jars hut, clothesline hut, vases hut).
  const props = new PIXI.Container();
  const at = (name, x, y, opts) => props.addChild(kit.deco(PIXI, name, x, y, opts));
  const c = DECKS.charms.y;
  at('bling_charms_1', 560, c - 184, { scale: 0.42, ay: 0 });
  at('cattle_skull', 700, c - 176, { scale: 0.2, ay: 0 });
  at('charm_1', 736, c - 184, { scale: 0.55, ay: 0 });
  at('vase_1', 620, c, { scale: 0.32 });
  at('mushroom_amanita_1', 622, c - 60, { scale: 0.16 });
  at('jar5', 840, c, { scale: 0.4 });
  const j = DECKS.jars.y;
  at('jar1', 1345, j, { scale: 0.5 });
  at('jar2', 1390, j, { scale: 0.55 });
  at('jar3', 1430, j, { scale: 0.5 });
  at('jar5', 1478, j, { scale: 0.45 });
  at('purple_mushroom_1', 1515, j, { scale: 0.4 });
  at('jar1', 1385, j - 92, { scale: 0.35 });
  at('jar3', 1420, j - 92, { scale: 0.35 });
  const cl = DECKS.clothes.y;
  at('hanging_clothes_line', 1800, cl - 150, { scale: 0.24, sy: 0.6 });
  at('hanging_clothes_1', 1740, cl - 66, { scale: 0.5 });
  at('hanging_clothes_2', 1800, cl - 88, { scale: 0.55 });
  at('hanging_clothes_3', 1862, cl - 50, { scale: 0.48 });
  at('vase_1', 1915, cl, { scale: 0.28 });
  at('mushroom_amanita_1', 1917, cl - 52, { scale: 0.14 });
  const v = DECKS.vases.y;
  at('charm_2', 2400, v - 176, { scale: 0.55, ay: 0 });
  at('charm_1', 2440, v - 176, { scale: 0.55, ay: 0 });
  at('charm_2', 2480, v - 176, { scale: 0.55, ay: 0 });
  at('vase_1', 2410, v, { scale: 0.36 });
  at('vase_broken_1', 2470, v, { scale: 0.38 });
  at('vase_1', 2540, v, { scale: 0.3, tint: 0xb98a5e });
  at('mushroom_amanita_1', 2541, v - 56, { scale: 0.16 });
  // The clubhouse inside: rug, fireplace, lanterns, chair, table.
  at('rug_red', CLUBHOUSE.fireplaceX, cy + 4, { scale: 0.5, tint: 0x6b4f43 });
  at('lantern', 3500, cy - 150, { scale: 0.7 });
  at('lantern', 3690, cy - 150, { scale: 0.7 });
  at('deco_chair_wooden_ghtest', 3690, cy, { scale: 0.32, tint: 0x6f5a48 });
  at('deco_table_wooden_ghtest', 3745, cy, { scale: 0.2, tint: 0x4b3d36 });
  const fire = kit.deco(PIXI, 'fireplace', CLUBHOUSE.fireplaceX, cy, { dir: ART, scale: 0.78 });
  props.addChild(fire);
  world.addChild(props);

  // Each hut's sketch.
  for (const s of SIGNS) {
    const hut = HUTS[s.hut];
    const p = plaque(PIXI, s.sketch, { w: 70, h: 52, tilt: hut.sign.tilt || 0.02 });
    p.x = hut.sign.x;
    p.y = DECKS[hut.deck].y - hut.sign.up;
    world.addChild(p);
  }
  // ENTER plaque.
  world.addChild(kit.label(PIXI, 'ENTER', CLUBHOUSE.enterX, cy - 128, { size: 15, fill: 0xf1e2c4, stroke: { color: 0x4a321c, width: 5 },  font: 'Georgia, serif' }));

  return {
    label: 'The Society of Keen-Eyed Noticers',
    width: CLUB_W,
    height: CLUB_H,
    background: root,
    platforms: clubPlatforms(kit),
    walls: clubWalls(kit),
    spawn: { ...SPAWN },
  };
}

/* ------------------------------------------------------------------ */
/* Drawing Pintura Prosa                                                */
/* ------------------------------------------------------------------ */

function drawPad(g, p, floor) {
  // A tall stalk and a shallow lily pad with a lighter rim, its top on the walk line.
  g.moveTo(p.x - 7, floor + 4);
  g.quadraticCurveTo(p.x - 14, (floor + p.y) / 2, p.x - 5, p.y + 10);
  g.lineTo(p.x + 5, p.y + 10);
  g.quadraticCurveTo(p.x - 2, (floor + p.y) / 2, p.x + 8, floor + 4);
  g.closePath();
  g.fill(0x1d4a44);
  g.ellipse(p.x, p.y + 12, p.half + 6, 10).fill({ color: 0x133632, alpha: 0.6 });
  g.ellipse(p.x, p.y + 4, p.half + 8, 11).fill(0x3f8f80);
  g.ellipse(p.x, p.y + 1, p.half + 2, 7).fill(0x67b5a2);
  g.ellipse(p.x, p.y + 1, p.half * 0.55, 3.5).stroke({ width: 2, color: 0x9fdcc8, alpha: 0.55 });
}

function buildProsa(ctx) {
  const { PIXI, kit } = ctx;
  const root = kit.sceneRoot(PIXI, PROSA_W, PROSA_H);
  const sky = root.layer(0, 0);
  sky.addChild(kit.gradient(PIXI, [[0, '#0b2430'], [0.55, '#123a40'], [1, '#1b5550']], 960, 640));
  for (let i = 0; i < 2; i++) sky.addChild(kit.deco(PIXI, 'sky_stars_1', 240 + i * 480, 640, { scale: 0.8, alpha: 0.75 }));
  // Parallax layer y: screen y = y - factor * cameraY (camera y runs ~290 on the top pad to ~790 on the floor).
  const far = root.layer(0.3, 1);
  // Bottoms stay under the floor line at every camera height; canopy tops clear the sky on the floor.
  for (let i = 0; i < 11; i++) far.addChild(kit.deco(PIXI, 'tree_group_bg_2_maytang', 80 + i * 330, 830, { scale: 0.75 + (i % 3) * 0.05, tint: 0x6e3d4b, alpha: 0.75 }));
  const mid = root.layer(0.6, 2);
  for (let i = 0; i < 8; i++) mid.addChild(kit.deco(PIXI, 'tree_dark_1', 160 + i * 470, 930, { scale: 0.8, tint: 0x3a2420 }));
  for (let i = 0; i < 6; i++) mid.addChild(kit.deco(PIXI, 'tree_group_bg_2_maytang', 380 + i * 600, 910, { scale: 0.62, tint: 0x8c4f5f }));
  const world = root.layer(1, 3);
  const g = new PIXI.Graphics();
  g.rect(0, PROSA_FLOOR - 40, PROSA_W, PROSA_H).fill(0x1f5a4c);
  g.rect(0, PROSA_FLOOR - 40, PROSA_W, 14).fill(0x2a6d5c);
  world.addChild(g);
  for (let i = 0; i < 22; i++) {
    const x = 90 + i * 150 + (i % 3) * 30;
    world.addChild(kit.deco(PIXI, 'light_spot', x, PROSA_FLOOR - 12 + (i % 2) * 14, { ay: 0.5, scale: 0.09, sy: 0.03, tint: 0xfff0a0, alpha: 0.8 }));
  }
  const pads = new PIXI.Graphics();
  for (const p of PADS) drawPad(pads, p, PROSA_FLOOR - 20);
  world.addChild(pads);
  for (const [x, s] of [[260, 0.55], [900, 0.45], [1460, 0.5], [2160, 0.55], [2760, 0.45], [3020, 0.6]]) {
    world.addChild(kit.deco(PIXI, 'bling_branchflowerbrush_purple_1', x, PROSA_FLOOR - 16, { scale: s }));
  }
  for (const x of [520, 1760, 2420]) world.addChild(kit.deco(PIXI, 'purple_mushroom_1', x, PROSA_FLOOR - 18, { scale: 0.5 }));
  // Drifting motes and big pale lights.
  const motes = new PIXI.Container();
  ctx.data.motes = [];
  for (let i = 0; i < 70; i++) {
    const m = new PIXI.Graphics();
    const r = 2 + kit.hash01(`m${i}`) * 4.5;
    m.setFillStyle({ color: 0xf4efe6, alpha: 0.45 + kit.hash01(`a${i}`) * 0.4 });
    m.circle(0, 0, r).fill();
    m.x = kit.hash01(`x${i}`) * PROSA_W;
    m.y = 300 + kit.hash01(`y${i}`) * 760;
    motes.addChild(m);
    ctx.data.motes.push({ m, vx: 0.08 + kit.hash01(`v${i}`) * 0.12, vy: 0.12 + kit.hash01(`w${i}`) * 0.18 });
  }
  for (let i = 0; i < 12; i++) {
    const o = kit.deco(PIXI, 'glowing_orb_bright', 240 + i * 260, 560 + (i % 4) * 110, { ay: 0.5, scale: 0.22, alpha: 0.75 });
    motes.addChild(o);
  }
  world.addChild(motes);
  return {
    label: 'Pintura Prosa',
    width: PROSA_W,
    height: PROSA_H,
    background: root,
    platforms: prosaPlatforms(kit),
    walls: [],
    spawn: { ...PROSA_SPAWN },
  };
}

/* ------------------------------------------------------------------ */
/* Room                                                                 */
/* ------------------------------------------------------------------ */

let overlayEl = null;

/** The location's arrival overlay: big white lines, "Click anywhere...". */
function overlayLine(ctx, text) {
  if (typeof document === 'undefined') return Promise.resolve();
  if (!overlayEl) {
    const host = document.getElementById('rook-woods-hud')?.parentElement || document.getElementById('game-root') || document.body;
    overlayEl = document.createElement('div');
    overlayEl.className = 'clubhouse-overlay';
    overlayEl.setAttribute('role', 'dialog');
    overlayEl.style.cssText = 'position:absolute;inset:0;z-index:86;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;cursor:pointer;text-align:center;padding:0 16px';
    host.appendChild(overlayEl);
  }
  overlayEl.innerHTML = `<p style="margin:0;max-width:560px;font:900 clamp(1.4rem,4vw,2.3rem)/1.15 Nunito,'Trebuchet MS',sans-serif;color:#fff;text-shadow:0 2px 0 #2a2a2a,0 0 14px rgba(0,0,0,.6)"></p>
    <span style="font:800 .8rem Nunito,sans-serif;color:#fff;text-shadow:0 1px 2px #000">&#9656; Click anywhere&hellip;</span>`;
  overlayEl.querySelector('p').textContent = text;
  overlayEl.style.display = 'flex';
  ctx.setData('clubOverlay', text);
  return new Promise((resolve) => {
    const onKey = (event) => {
      if (event.key === 'Enter' || event.key === ' ' || event.key === 'Escape') {
        event.preventDefault();
        done();
      }
    };
    const done = () => {
      if (ctx.data.overlayNext !== done) return;
      overlayEl.style.display = 'none';
      overlayEl.removeEventListener('click', done);
      window.removeEventListener('keydown', onKey, true);
      ctx.setData('clubOverlay', '');
      ctx.data.overlayNext = null;
      resolve();
    };
    ctx.data.overlayNext = done;
    overlayEl.addEventListener('click', done);
    window.addEventListener('keydown', onKey, true);
  });
}

async function intro(ctx) {
  ctx.data.phase = 'intro';
  ctx.data.pan = { x: CLUBHOUSE.fireplaceX - 480, y: DECKS.club.y - 300, k: 0, on: true, at: Date.now() };
  await ctx.wait(ctx.fx() ? 700 : 100);
  for (const line of INTRO_LINES) {
    if (ctx.data.left) return;
    await overlayLine(ctx, line);
  }
  ctx.data.pan.on = false;
  ctx.data.pan.at = Date.now();
  if (ctx.data.phase === 'intro') ctx.data.phase = 'puzzle';
}

const PAN_MS = 900;
function stepPan(ctx) {
  const pan = ctx.data.pan;
  if (!pan) return;
  // Wall-clock easing, so a slow frame rate does not stretch the pan.
  const t = Math.min(1, (Date.now() - pan.at) / PAN_MS);
  pan.k = pan.on ? Math.max(pan.k, t) : Math.min(pan.k, 1 - t);
  if (pan.k <= 0 && !pan.on) {
    ctx.data.pan = null;
    return;
  }
  const cam = ctx.engine.camera;
  if (!cam) return;
  const ease = pan.k * pan.k * (3 - 2 * pan.k);
  const tx = Math.max(0, Math.min(CLUB_W - cam.w, pan.x));
  const ty = Math.max(0, Math.min(CLUB_H - cam.h, pan.y));
  ctx.engine.nudgeCamera?.((cam.x - tx) * ease, (cam.y - ty) * ease);
}

function enterClub(ctx) {
  const { PIXI } = ctx;
  ctx.data.choices ||= initialChoices();
  ctx.data.quoins = spawnRoomQuoins(ctx, CLUB_QUOINS);
  const cy = DECKS.club.y;
  // Frames and their buttons.
  ctx.data.frames = FRAMES.map((f, i) => {
    const x = CLUBHOUSE.frameXs[i];
    const p = plaque(PIXI, shownSketch(ctx.data.choices, i), { lit: Boolean(ctx.data.solved), tilt: [0.03, -0.04, 0.02, -0.03][i] });
    p.x = x;
    p.y = cy - CLUBHOUSE.frameUp;
    ctx.add(p, 2);
    return { x, plaque: p };
  });
  ctx.data.buttons = [...FRAMES.map((f, i) => ({ id: f.id, index: i, x: CLUBHOUSE.frameXs[i] })), { id: 'enter', index: -1, x: CLUBHOUSE.enterX }]
    .map((b) => makeButton(ctx, b, cy - CLUBHOUSE.buttonUp));
  // The door: shut until the frames are right.
  const door = new PIXI.Graphics();
  door.roundRect(-20, -CLUBHOUSE.door.h, 40, CLUBHOUSE.door.h, 16).fill(0x4a321c);
  door.roundRect(-16, -CLUBHOUSE.door.h + 4, 32, CLUBHOUSE.door.h - 4, 13).fill(0x7b5532);
  for (const x of [-6, 4]) {
    door.moveTo(x, -CLUBHOUSE.door.h + 10);
    door.lineTo(x, -2);
  }
  door.stroke({ width: 2, color: 0x5b3c22, alpha: 0.9 });
  door.circle(9, -CLUBHOUSE.door.h / 2, 3).fill(0xd8b25a);
  door.x = CLUBHOUSE.door.x;
  door.y = cy;
  ctx.data.door = ctx.add(door, 3);
  setDoor(ctx, Boolean(ctx.data.solved));
  // The Curious Painting over the fireplace.
  const pic = new ctx.PIXI.Sprite(textureFromUrl(`${ART}club_house_picture.png`));
  pic.anchor.set(0.5, 1);
  pic.scale.set(0.62);
  pic.x = CLUBHOUSE.fireplaceX;
  pic.y = cy - CLUBHOUSE.pictureUp + 47;
  pic.zIndex = 2;
  ctx.data.picture = ctx.register({ classId: 'club_house_picture', label: 'Curious Painting', subtitle: 'Looks inviting', sprite: pic });
  ctx.data.prevX = ctx.player?.x ?? SPAWN.x;
  if (!ctx.data.introDone) {
    ctx.data.introDone = true;
    intro(ctx);
  }
}

function makeButton(ctx, b, y) {
  const { PIXI } = ctx;
  const c = new PIXI.Container();
  const plate = new PIXI.Graphics();
  plate.circle(0, 0, 17).fill({ color: 0x3a2716, alpha: 0.5 });
  c.addChild(plate);
  const out = new PIXI.Sprite(textureFromUrl(`${ART}wall_button_lockOut.png`));
  const inn = new PIXI.Sprite(textureFromUrl(`${ART}wall_button_lockIn.png`));
  for (const s of [out, inn]) {
    s.anchor.set(0.5);
    s.scale.set(0.82);
    c.addChild(s);
  }
  inn.visible = false;
  c.x = b.x;
  c.y = y;
  c.zIndex = 3;
  const target = ctx.register({
    classId: 'clubhouse_wall_button',
    label: b.index < 0 ? 'Enter Button' : 'Wall Button',
    subtitle: b.index < 0 ? 'By the clubhouse door' : 'Under a picture frame',
    sprite: c,
    clubButton: b,
  });
  return { ...b, target, out, inn, upAt: 0 };
}

function setDoor(ctx, open) {
  const door = ctx.data.door;
  if (!door || door.destroyed) return;
  door.scale.x = open ? 0.28 : 1;
  door.x = CLUBHOUSE.door.x + (open ? 16 : 0);
  door.alpha = open ? 0.9 : 1;
}

function redrawFrames(ctx) {
  for (const [i, f] of (ctx.data.frames || []).entries()) {
    const p = f.plaque;
    if (!p || p.destroyed) continue;
    const fresh = plaque(ctx.PIXI, shownSketch(ctx.data.choices, i), { lit: Boolean(ctx.data.solved) });
    p.removeChildren().forEach((ch) => ch.destroy({ children: true }));
    for (const ch of [...fresh.children]) p.addChild(ch);
    fresh.destroy();
  }
}

function press(ctx, button) {
  const b = ctx.data.buttons.find((x) => x.id === button.id);
  if (!b) return;
  if (!ctx.near(b.x, DECKS.club.y, BUTTON_REACH)) {
    ctx.toast('Walk over to the clubhouse first.', 1800);
    return;
  }
  b.out.visible = false;
  b.inn.visible = true;
  b.upAt = Date.now() + BUTTON_RESET_MS;
  ctx.data.presses = (ctx.data.presses || 0) + 1;
  ctx.sound('SWITCH_PRESS_BLOOIAN', { volume: 0.45 });
  if (ctx.data.solved) return;
  if (b.index >= 0) {
    ctx.data.choices = cycleFrame(ctx.data.choices, b.index);
    redrawFrames(ctx);
    return;
  }
  // ENTER: the frames are checked.
  if (framesSolved(ctx.data.choices)) {
    solvePuzzle(ctx);
  } else {
    ctx.data.wrong = (ctx.data.wrong || 0) + 1;
    ctx.data.shakeUntil = Date.now() + 450;
    ctx.sound('CLICK_FAILURE', { volume: 0.5 });
    ctx.floatText(CLUBHOUSE.door.x - 40, DECKS.club.y - 190, WRONG_LINE, '#ffe7a8');
  }
}

function solvePuzzle(ctx) {
  ctx.data.solved = true;
  ctx.data.phase = 'open';
  ctx.progress('solved_puzzle');
  redrawFrames(ctx);
  setDoor(ctx, true);
  ctx.sound('REVEAL_1', { volume: 0.55 });
  setTimeout(() => ctx.sound('DOOR_OPEN', { volume: 0.6 }), 350);
  ctx.floatText(CLUBHOUSE.door.x, DECKS.club.y - 170, 'The door swings open!', '#ffffff');
}

async function jumpIn(ctx) {
  if (ctx.data.jumping) return;
  ctx.data.jumping = true;
  ctx.sound('TELEPORT_AWAY', { volume: 0.5 });
  // Pintura Prosa is its own instance in the source (clubhouse_part_2): its clock starts afresh.
  const left = ctx.remaining();
  if (Number.isFinite(left) && left < ROOM_MS) ctx.extend(ROOM_MS - left);
  await ctx.gotoStage('pintura');
  ctx.data.jumping = false;
}

function enterProsa(ctx) {
  ctx.data.phase = 'prosa';
  ctx.data.quoins = spawnRoomQuoins(ctx, PROSA_QUOINS);
  const { PIXI, kit } = ctx;
  const c = new PIXI.Container();
  const g = new PIXI.Graphics();
  g.rect(-5, -150, 10, 150).fill(0x4b3424);
  g.roundRect(-34, -150, 68, 30, 5).fill(0x7c5a3a);
  g.roundRect(-34, -150, 68, 30, 5).stroke({ width: 2, color: 0x4b3424, alpha: 1 });
  c.addChild(g);
  c.addChild(kit.label(PIXI, 'Exit', 0, -135, { size: 17, fill: 0xf6ead2, font: 'Georgia, serif' }));
  c.x = SIGNPOST.x;
  c.y = SIGNPOST.y;
  ctx.data.signpost = ctx.register({ classId: 'clubhouse_signpost', label: 'Signpost', subtitle: 'The way back', sprite: c });
}

async function exitPainting(ctx) {
  if (ctx.data.phase === 'done') return;
  if (!ctx.near(SIGNPOST.x, SIGNPOST.y, SIGNPOST_REACH)) {
    ctx.toast('Walk up to the signpost first.', 1800);
    return;
  }
  ctx.data.phase = 'done';
  ctx.progress('instance_exit_via_signpost');
  ctx.solve();
  ctx.sound('SIGNPOST_TRAVEL', { volume: 0.6 });
  await ctx.wait(300);
  ctx.leave({ transition: ctx.fx() });
}

/** Quoins with Qurazy ones that pay once per quest (a fresh run would otherwise farm them). */
function spawnRoomQuoins(ctx, list) {
  const seen = ctx.memory(`qurazy:${ctx.questId}`);
  return list.map((q) => {
    const type = q.type === 'qurazy' && seen[q.id] ? 'xp' : q.type;
    const spr = ctx.add(ctx.quoinSprite(type, q.x, q.y, type === 'qurazy' ? 0.85 : 0.7), 30);
    return { ...q, type, spr, taken: false };
  });
}

function takeRoomQuoins(ctx) {
  const p = ctx.player;
  if (!p) return;
  const t = Date.now() / 1000;
  const seen = ctx.memory(`qurazy:${ctx.questId}`);
  for (const q of ctx.data.quoins || []) {
    if (q.taken || !q.spr || q.spr.destroyed) continue;
    q.spr.y = q.y + Math.sin(t * 2.4 + q.x / 80) * 5;
    if (Math.abs(p.x - q.x) < 30 && p.y - 70 < q.y + 16 && p.y + 6 > q.y - 16) {
      q.taken = true;
      q.spr.visible = false;
      if (q.type === 'qurazy') {
        seen[q.id] = Date.now();
        ctx.data.qurazy = (ctx.data.qurazy || 0) + 1;
        ctx.sound('QUORAZY_QUOIN', { volume: 0.6 });
      }
      ctx.collectQuoin(q.type, q.x, q.y);
    }
  }
}

/** The Butler's turn-in while its award is up (one at a time). */
let butlerTurnIn = null;

export const room = {
  id: 'clubhouse',
  title: 'Join the Club',
  kicker: 'The Society of Keen-Eyed Noticers',
  icon: `${ART}club_house_picture.png`,
  theme: 'dark',
  hubName: 'Join the Club',
  durationMs: ROOM_MS,
  firstStage: 'clubhouse',
  leaveText: 'Leave the club before you get the picture? You will have to start over.',
  travelText: 'Find the way out, or use Leave.',

  stageLabel(stage) {
    return stage === 'pintura' ? 'Pintura Prosa' : 'The Society of Keen-Eyed Noticers';
  },

  build(ctx, stage) {
    return stage === 'pintura' ? buildProsa(ctx) : buildClub(ctx);
  },

  enter(ctx, stage) {
    if (stage === 'pintura') enterProsa(ctx);
    else enterClub(ctx);
  },

  tick(ctx, dtMs) {
    const now = Date.now();
    if (ctx.stage === 'pintura') {
      for (const d of ctx.data.motes || []) {
        if (d.m.destroyed) continue;
        d.m.x += d.vx * dtMs * 0.06;
        d.m.y += d.vy * dtMs * 0.06;
        if (d.m.y > PROSA_FLOOR) d.m.y = 280;
        if (d.m.x > PROSA_W) d.m.x = 0;
      }
      takeRoomQuoins(ctx);
      return;
    }
    stepPan(ctx);
    for (const b of ctx.data.buttons || []) {
      if (b.upAt && now >= b.upAt) {
        b.upAt = 0;
        b.out.visible = true;
        b.inn.visible = false;
      }
    }
    for (const [i, f] of (ctx.data.frames || []).entries()) {
      if (!f.plaque || f.plaque.destroyed) continue;
      const shaking = ctx.data.shakeUntil && now < ctx.data.shakeUntil;
      f.plaque.x = f.x + (shaking ? Math.sin(now / 30 + i) * 3 : 0);
    }
    // The shut door is solid from both sides.
    const p = ctx.player;
    if (p && !ctx.data.solved && p.y > DECKS.club.y - CLUBHOUSE.door.h && p.y <= DECKS.club.y + 4) {
      const { x1, x2 } = CLUBHOUSE.door;
      if (p.x > x1 - 14 && p.x < x2 + 14) {
        p.x = (ctx.data.prevX ?? p.x) <= (x1 + x2) / 2 ? x1 - 14 : x2 + 14;
        p.vx = 0;
      }
    }
    if (p) ctx.data.prevX = p.x;
    takeRoomQuoins(ctx);
  },

  physics(ctx) {
    return ctx.data.phase === 'intro' ? { speed: 0, jump: 0 } : null;
  },

  verbs(ctx, target) {
    if (target.clubButton) {
      const enter = target.clubButton.index < 0;
      return [{ id: 'press', label: 'Press', enabled: true, durationMs: 0, tooltip: enter ? 'Ask to be let in' : 'Change the picture' }];
    }
    if (target === ctx.data.picture) {
      const close = ctx.near(CLUBHOUSE.fireplaceX, DECKS.club.y, PICTURE_REACH);
      return [{ id: 'jump_in', label: 'Jump in', enabled: close, durationMs: 0, tooltip: 'Looks inviting', reason: close ? '' : 'Try getting closer.' }];
    }
    if (target === ctx.data.signpost) return [{ id: 'exit', label: 'Go back', enabled: true, durationMs: 0, tooltip: 'Leave the painting' }];
    return [];
  },

  runVerb(ctx, target, verbId) {
    if (target.clubButton && verbId === 'press') {
      press(ctx, target.clubButton);
      return true;
    }
    if (target === ctx.data.picture && verbId === 'jump_in') {
      if (ctx.near(CLUBHOUSE.fireplaceX, DECKS.club.y, PICTURE_REACH)) jumpIn(ctx);
      else ctx.toast('Try getting closer.', 1600);
      return true;
    }
    if (target === ctx.data.signpost && verbId === 'exit') {
      exitPainting(ctx);
      return true;
    }
    return false;
  },

  objective(ctx) {
    const qurazy = ['qurazy', String(ctx.data.qurazy || 0)];
    if (ctx.stage === 'pintura') {
      return { text: ctx.data.phase === 'done' ? 'You got the picture.' : 'Get the picture: find the signpost out of the painting.', stats: [qurazy] };
    }
    if (ctx.data.phase === 'intro') return { text: INTRO_LINES[0], stats: [] };
    if (ctx.data.solved) return { text: 'The door is open. The painting by the fire looks inviting.', stats: [qurazy] };
    return { text: 'Access the clubhouse: only the observant may enter.', stats: [['presses', String(ctx.data.presses || 0)]] };
  },

  onLeave(ctx, outcome) {
    // Your Butler hears about the club at home (world.onTick); without one,
    // coming back through the signpost tells it.
    if (outcome === 'complete' && ctx.questId === PART_1 && !butlerApi.owned()) ctx.progress('talk_to_butler');
    return { leaveFlag: 'instance_exit_via_signpost' };
  },

  world: {
    /** bag_butler.js doQuests: back from the painting, the Butler hears about it when you come near. */
    onTick(w) {
      if (butlerTurnIn || !w.questActive(PART_1)) return;
      if (!w.questProgress(PART_1, 'instance_exit_via_signpost') || w.questProgress(PART_1, 'talk_to_butler')) return;
      const owned = butlerApi.owned();
      if (owned && !butlerApi.questReady(w.engine)) return;
      const heard = owned ? butlerApi.hearQuest(w.engine, PART_1) : null;
      w.progressQuest(PART_1, 'talk_to_butler');
      w.engine.setData('clubButler', heard ? 'heard' : 'no-butler');
      butlerTurnIn = w.turnInQuest(PART_1, heard ? { payload: { iconUrl: heard.portrait } } : {})
        .finally(() => { butlerTurnIn = null; });
    },
  },

  clear(ctx) {
    // Runs on every scene change too; only a real leave ends the intro.
    if (!ctx.data._leaving) return;
    ctx.data.left = true;
    ctx.data.overlayNext?.();
    if (overlayEl) overlayEl.style.display = 'none';
  },

  publish(ctx) {
    ctx.setData('clubStage', ctx.stage || '');
    ctx.setData('clubPhase', ctx.data.phase || '');
    ctx.setData('clubChoices', (ctx.data.choices || []).map((c, i) => FRAMES[i].options[c]).join(','));
    ctx.setData('clubSolved', ctx.data.solved ? '1' : '0');
    ctx.setData('clubWrong', String(ctx.data.wrong || 0));
    ctx.setData('clubQurazy', String(ctx.data.qurazy || 0));
  },

  async autoplay(ctx, mode) {
    const wait = (ms) => ctx.wait(ms);
    for (let i = 0; i < 20 && !ctx.data.overlayNext; i++) await wait(150);
    while (ctx.data.overlayNext) {
      ctx.data.overlayNext();
      await wait(350);
    }
    while (ctx.data.phase === 'intro') await wait(150);
    if (mode === 'intro') return 'intro';
    const cy = DECKS.club.y;
    const pressBtn = async (id, times = 1) => {
      const b = ctx.data.buttons.find((x) => x.id === id);
      ctx.place(b.x - 24, cy);
      await wait(250);
      for (let k = 0; k < times; k++) {
        room.runVerb(ctx, b.target, 'press');
        await wait(220);
      }
    };
    if (mode === 'wrong') {
      await pressBtn('enter');
      return ctx.data.solved ? 'unexpected' : 'wrong';
    }
    const need = pressesToSolve(ctx.data.choices);
    for (const [i, n] of need.entries()) if (n) await pressBtn(FRAMES[i].id, n);
    await pressBtn('enter');
    if (!ctx.data.solved) return 'unsolved';
    await wait(500);
    ctx.place(CLUBHOUSE.door.x2 + 40, cy);
    await wait(300);
    for (const q of ctx.data.quoins.filter((x) => x.x > CLUBHOUSE.door.x2)) {
      ctx.place(q.x, cy);
      for (let k = 0; k < 12 && !q.taken; k++) await wait(100);
    }
    if (mode === 'puzzle') return 'solved';
    ctx.place(CLUBHOUSE.fireplaceX + 30, cy);
    await wait(300);
    room.runVerb(ctx, ctx.data.picture, 'jump_in');
    for (let i = 0; i < 60 && ctx.stage !== 'pintura'; i++) await wait(150);
    for (let i = 0; i < 30 && !ctx.data.signpost; i++) await wait(150);
    if (mode === 'prosa') return 'prosa';
    for (const q of [...ctx.data.quoins].sort((a, b) => a.x - b.x)) {
      const pad = PADS.find((pp) => Math.abs(pp.x - q.x) <= pp.half);
      ctx.place(q.x, pad && q.y < pad.y ? pad.y : PROSA_FLOOR);
      for (let k = 0; k < 12 && !q.taken; k++) await wait(100);
    }
    ctx.place(SIGNPOST.x - 30, SIGNPOST.y);
    await wait(400);
    room.runVerb(ctx, ctx.data.signpost, 'exit');
    return 'exited';
  },
};
