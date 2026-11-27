/**
 * Le Voyage Violet (LNVV4OTMAUG2PQV), drawn for the Purple Journey (G150 /
 * G138). The instance's geometry and decos never reached the locations dump
 * (research/streets-hunt: instance-template-no-geometry), so this is a clean
 * rebuild of what the players' Snaps show (research/wayback/raw/snaps/
 * le_voyage_violet and round3-levels-2026-10-29 LNVV4OTMAUG2PQV, reference
 * only): a deep violet night under a crescent moon, hanging strands, lines of
 * washing with an owl on one, drippy stumps, mushrooms, a ghost and spiral
 * stones on the floor, and a floor of jagged lilac peaks. No Snap pixels are
 * used.
 *
 * The washing and the moon are Tiny Speck's own decos, the ones the Snaps
 * show (tinyspeck/glitch-locations, CC0, shipped in decos/groddle): the six
 * garments hanging_clothes_1..6 (abbasid1.swf) pegged on hanging_clothes_line
 * and the moon (quest02.swf; the shipped files come from the byte-identical
 * copies in abbasid1.swf and zutto1.swf), tinted violet like the rest of the
 * room. The floor's mushrooms, frond heads, fiddleheads, ferns, ghost and owl
 * are Tiny Speck's Uralia decos too (zutto1.swf); the drippy stump and the
 * spiral stone are made for Groddle (G964, voyageGroundPlan). The peaks, the
 * strands and the motes are drawn.
 *
 * World: 3200 x 1000 (geo x -1600..1600, y -1000..0); the floor is at
 * screen y 939 (geo y -61, the arrival point).
 */

import { deco, gradient, sceneRoot } from './quest-rooms/kit.js?v=68db2a09';

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

/** PURE: VIOLET_WASH mixed with the identity: 1 is the full wash, 0 the art's own colours. */
export function violetMatrix(amount = 1) {
  const id = [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0];
  return VIOLET_WASH.map((v, i) => Math.round((v * amount + id[i] * (1 - amount)) * 1e4) / 1e4);
}

/**
 * The floor keeps a little of its own colour under the wash: the Snaps show the umbrella
 * mushrooms still red, the lilac one blue-lilac and the stone grey-violet (G964).
 */
export const FLOOR_WASH = 0.8;

function violetWash(PIXI, target, amount = 1) {
  if (!PIXI.ColorMatrixFilter) return;
  const f = new PIXI.ColorMatrixFilter();
  f.matrix = violetMatrix(amount);
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
  return { x1, y1, x2, y2 };
}

/**
 * The floor's pieces (G964), placed as Snaps 81702 and 27222 show them, sizes measured there
 * against a player 125 units tall. Tiny Speck's Uralia decos (zutto1.swf, CC0, decos/groddle):
 * the red umbrella mushrooms tree_14 and tree_15, the lilac one tree_13, the purple frond heads
 * tree_11 and zutto_tree_2, the pale fiddlehead plant_fern_1 and the ghost creature_purple, drawn
 * at their SWF stage size (scale 0.5) unless the Snaps measure otherwise. The drippy stump and
 * the spiral stone survive in no Tiny Speck file: they are made for Groddle (pack 3, provenance
 * in tools/provenance/made-decos.json), files at 2 px a unit.
 */
export const VOYAGE_STUMP = 'gz_ai_vv_stump';
export const VOYAGE_STONE = 'gz_ai_vv_spiral_stone';
/** The made pieces' sizes in units (their files are twice this). */
const STUMP_UNITS_H = 280;
const STONE_UNITS_W = 150;
export const VOYAGE_DECOS = Object.freeze({
  mushrooms: Object.freeze(['tree_14', 'tree_15', 'tree_13']),
  fronds: Object.freeze(['tree_11', 'zutto_tree_2']),
  fiddlehead: 'plant_fern_1',
  ghost: 'creature_purple',
  owl: 'owl_1',
  ferns: Object.freeze(['ground_plant_1', 'ground_plant_2']),
});
/** Draw order on the floor, back to front: frond heads, stumps, the ghost, stones, mushrooms, fiddleheads. */
const DEPTH = Object.freeze({ frond: 0, stump: 1, ghost: 2, stone: 3, mushroom: 4, fiddlehead: 5 });

/**
 * PURE: the floor plan, { kind, name, x, scale, flip }, screen x, bottom-centre on the floor.
 * Two groups as Snap 81702 shows them (left: a stump, the stone in front of it and a red
 * mushroom; right: the ghost behind a plain boulder, the lilac mushroom and the second stump),
 * repeated mirrored along the room, with frond heads at the edges and fiddleheads at the front.
 * The middle (the arrival point, x 1600) stays open.
 */
export function voyageGroundPlan() {
  const stump = (x, h, flip = false) => ({ kind: 'stump', name: VOYAGE_STUMP, x, scale: (0.5 * h) / STUMP_UNITS_H, flip });
  const stone = (x, w, flip = false) => ({ kind: 'stone', name: VOYAGE_STONE, x, scale: (0.5 * w) / STONE_UNITS_W, flip });
  const deco1 = (kind, name, x, scale, flip = false) => ({ kind, name, x, scale, flip });
  const plan = [
    deco1('frond', 'tree_11', 70, 0.5),
    stump(260, 275),
    stone(430, 145),
    deco1('mushroom', 'tree_14', 590, 0.5),
    deco1('fiddlehead', 'plant_fern_1', 470, 0.45),
    deco1('mushroom', 'tree_15', 860, 0.55, true),
    deco1('ghost', 'creature_purple', 1140, 0.5),
    stone(1170, 150, true),
    deco1('mushroom', 'tree_13', 1290, 0.38),
    stump(1430, 300, true),
    deco1('frond', 'zutto_tree_2', 1300, 0.55, true),
    deco1('fiddlehead', 'plant_fern_1', 1760, 0.4, true),
    deco1('frond', 'zutto_tree_2', 1880, 0.5),
    stump(1990, 250, true),
    deco1('mushroom', 'tree_14', 2140, 0.48, true),
    stone(2290, 125),
    deco1('fiddlehead', 'plant_fern_1', 2380, 0.45),
    deco1('mushroom', 'tree_15', 2520, 0.5),
    deco1('mushroom', 'tree_13', 2700, 0.42, true),
    deco1('ghost', 'creature_purple', 2800, 0.5, true),
    stone(2830, 140),
    stump(2990, 285),
    deco1('fiddlehead', 'plant_fern_1', 3060, 0.42, true),
    deco1('frond', 'tree_11', 3150, 0.5, true),
  ];
  return plan.sort((a, b) => DEPTH[a.kind] - DEPTH[b.kind] || a.x - b.x);
}

/** Where the owl perches (Snap 81702: on a washing line, its own size measured there). */
export const VOYAGE_OWL = Object.freeze({ line: 0, t: 0.32, scale: 1.05 });

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
  // Each peak's left face catches the light (the Snaps' flat-shaded triangles, G964).
  for (let i = 2; i + 3 < pts.length - 2; i += 4) {
    const [lx, ly] = i === 2 ? [0, floor + 6] : [pts[i - 2], pts[i - 1]];
    const [tx, ty] = [pts[i], pts[i + 1]];
    if (!(ty < ly)) continue;
    g.poly([lx, ly, tx, ty, tx + (tx - lx) * 0.18, floor + 8, lx, floor + 8]).fill({ color: 0xb48bc2, alpha: 0.55 });
  }
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
  const low = [];
  for (let i = 0; i < 3; i += 1) {
    const x1 = 260 + i * 1050;
    low.push(clothesline(PIXI, mid, x1, 600 + rand() * 30, x1 + 640, 580 + rand() * 30, rand, 0xd2c4dc, 0.85));
  }
  // The owl sleeps on a low line (Snap 81702), its feet on the rope.
  const perch = low[VOYAGE_OWL.line];
  const ox = perch.x1 + (perch.x2 - perch.x1) * VOYAGE_OWL.t;
  const oy = perch.y1 + (perch.y2 - perch.y1) * VOYAGE_OWL.t;
  mid.addChild(deco(PIXI, VOYAGE_DECOS.owl, ox, oy + 6, { scale: VOYAGE_OWL.scale }));
  const ground = root.layer(1, 3);
  const props = new PIXI.Container();
  violetWash(PIXI, props, FLOOR_WASH);
  for (const p of voyageGroundPlan()) props.addChild(deco(PIXI, p.name, p.x, floor - 2, { scale: p.scale, flip: p.flip }));
  ground.addChild(props);
  ground.addChild(peaks(PIXI, rand, W, floor, 320));
  // Front fern silhouettes: Tiny Speck's ground plants, near black against the peaks.
  const front = root.layer(1, 6);
  let n = 0;
  for (let x = 30; x < W; x += 380 + rand() * 360) {
    const name = VOYAGE_DECOS.ferns[n % 2];
    n += 1;
    const f = deco(PIXI, name, x, floor + 40, { scale: 0.85 + rand() * 0.35, flip: rand() < 0.5, tint: 0x2a0b33 });
    f.alpha = 0.9;
    front.addChild(f);
  }
  return {
    background: root,
    platforms: [{ id: 'voyage-floor', x1: 0, y1: floor, x2: W, y2: floor, pc_perm: -1 }],
  };
}
