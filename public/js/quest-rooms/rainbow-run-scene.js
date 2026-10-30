/**
 * Rainbow Run's course: geometry, coin spots and the scene (register row G108).
 *
 * The template (LIF9NRCLF273JBA) is lost. Four player Snaps (Aug and Sep 2012, research/wayback/raw/
 * snaps/rainbow_run/) and the glitchen wiki image show a psychedelic night meadow built from
 * arbito1.swf: a black starry sky over a purple horizon band, pale and lime rolling hills, a giant
 * classical head on its side with slimy broken columns before it (stand-on platforms), a giant stone
 * foot, a peace-sign stone hand, a sliced pink and teal planet with a door in its cut face (a player
 * stands inside it), pink floating islands joined by a pink staircase, an orange rainbow slide from an
 * island down to a big flower, a blue-white chequered ribbon, a blue fir, a pink and orange tree, a
 * rock spire, a lavender spire, striped rug patches, small flames and coins everywhere ("+3 currants").
 * Every piece here is Tiny Speck's CC0 art: the street decos in assets/decos/groddle and the pieces the
 * street set lacked, rendered by tools/room-art (RAINBOW_RUN_FILES). The Snaps are reference only.
 *
 * Layout, left to right: the slide's flower by the start; the slide climbs to an island under the
 * planet, a second island, the pink stairs, a top island, a higher one and a hop into the planet's cut
 * face (the bonus loop, the Snaps' upper-left); the blue fir, the hand, the pink
 * tree and the rock spire on the meadow; then the columns before the head, the lavender spire and
 * the foot (the Snaps' head-and-foot end). The remake's ordinary jump peaks near 110 px, so every
 * ledge is at most ~100 px above the one beside it; the slide and the stairs are walkable slopes.
 */

import { textureFromUrl } from '../textures.js?v=01a295a1';
import { RAINBOW_RUN_FILES } from './rainbow-run-art.js?v=bf073094';

export const W = 3950;
export const H = 1380;
export const FLOOR = 1240;
/** With the avatar on the floor the camera shows ~345 px above it (measured in the room at 1280 x 860). */
const CAM_GROUND = FLOOR - 345;
const ART = 'assets/sprites/quest-rooms/rainbow_run/';

const up = (h) => FLOOR - h;

/* ------------------------------------------------------------------ */
/* Geometry                                                             */
/* ------------------------------------------------------------------ */

/** The rainbow slide (ramp_1 at 0.6, flipped so it pours down-left): its left edge and top. */
export const SLIDE = Object.freeze({ x: 196, top: up(351), w: 449, h: 345 });
/** Points on the flipped slide's top edge (deco-local x, y), read off the ramp_1 render. */
const SLIDE_EDGE = [[30, 290], [77, 272], [151, 224], [226, 133], [300, 42], [412, 0]];

/** The pink islands (cloud_rock decos at half size): centre x, walking height, deco. */
export const ISLANDS = Object.freeze([
  { id: 'rr_isle_slide', x: 690, h: 345, deco: 'cloud_rock_2' },
  { id: 'rr_isle_stairs', x: 935, h: 420, deco: 'cloud_rock_3' },
  { id: 'rr_isle_top', x: 1380, h: 708, deco: 'cloud_rock_1' },
  { id: 'rr_isle_high', x: 1180, h: 796, deco: 'cloud_rock_4' },
]);
const ISLAND_HALF = 78;

/** The pink staircase (step1_four at 0.6: four 12 px steps, 48 px a piece) from the stairs island up. */
export const STAIRS = Object.freeze({ x: 1013, h: 422, pieces: 6, run: 48 });

/** The sliced planet (planet_1_back under planet_1_front at 0.9): top-left, and its cut-face floor. */
export const PLANET = Object.freeze({ x: 534, y: up(880) - 279, scale: 0.9 });
const PLANET_FLOOR = { x1: PLANET.x + 300, x2: PLANET.x + 566, h: 880 };

/**
 * The broken columns that are platforms: x, walking height, deco (street deco at `k`, or room art
 * at `s`). Each stands in the turf, its base under the ground line, so its top is one hop up.
 */
export const COLUMNS = Object.freeze([
  { id: 'rr_col1', x: 1720, h: 92, deco: 'pillar_small_3b', k: 0.425, half: 46 },
  { id: 'rr_col2', x: 2050, h: 96, art: 'pillar_small_3a', s: 1, half: 48 },
  { id: 'rr_col3', x: 2190, h: 186, deco: 'pillar_small_2a', k: 0.36, half: 40 },
  { id: 'rr_col4', x: 2700, h: 94, deco: 'pillar_small_3b', k: 0.425, half: 46 },
  { id: 'rr_col5', x: 2880, h: 100, art: 'pillar_small_3a', s: 1, half: 48 },
  { id: 'rr_col6', x: 3030, h: 178, deco: 'pillar_small_1a', k: 0.37, half: 42 },
  { id: 'rr_col7', x: 3190, h: 96, deco: 'pillar_small_3b', k: 0.425, half: 46 },
  { id: 'rr_col8', x: 3500, h: 92, art: 'pillar_small_3a', s: 1, half: 48 },
  { id: 'rr_col9', x: 3720, h: 98, deco: 'pillar_small_3b', k: 0.425, half: 46 },
]);

function slideSegments() {
  return SLIDE_EDGE.slice(1).map(([x, y], i) => {
    const [px, py] = SLIDE_EDGE[i];
    return [SLIDE.x + px, SLIDE.top + py + 6, SLIDE.x + x, SLIDE.top + y + 6];
  });
}

function stairSegments() {
  // Two pieces a segment, so no segment rises more than ~100 px over the one below it.
  const out = [];
  const seg = STAIRS.run * 2;
  for (let i = 0; i < STAIRS.pieces / 2; i++) {
    const x1 = STAIRS.x + i * seg;
    out.push([x1, up(STAIRS.h + i * seg), x1 + seg, up(STAIRS.h + (i + 1) * seg)]);
  }
  return out;
}

/** Walkable lines: the meadow floor, the slide, the islands, the stairs, the planet's floor, the columns. */
export function rainbowPlatforms(kit) {
  const p = [kit.plat(0, FLOOR, W, FLOOR, 'invisible', { id: 'rr_floor' })];
  slideSegments().forEach(([x1, y1, x2, y2], i) => p.push(kit.plat(x1, y1, x2, y2, 'invisible', { id: `rr_slide${i}`, slide: true })));
  for (const isl of ISLANDS) p.push(kit.plat(isl.x - ISLAND_HALF, up(isl.h), isl.x + ISLAND_HALF, up(isl.h), 'invisible', { id: isl.id }));
  stairSegments().forEach(([x1, y1, x2, y2], i) => p.push(kit.plat(x1, y1, x2, y2, 'invisible', { id: `rr_stairs${i}` })));
  p.push(kit.plat(PLANET_FLOOR.x1, up(PLANET_FLOOR.h), PLANET_FLOOR.x2, up(PLANET_FLOOR.h), 'invisible', { id: 'rr_planet' }));
  for (const c of COLUMNS) p.push(kit.plat(c.x - c.half, up(c.h), c.x + c.half, up(c.h), 'invisible', { id: c.id }));
  return p;
}

/**
 * Coin spots: a line over the meadow the whole way, one on every column, and the bonus loop's
 * coins up the slide, over the islands and stairs and inside the planet.
 */
export function rainbowCoins() {
  const out = [];
  const add = (x, y) => out.push({ id: `c${out.length}`, x: Math.round(x), y: Math.round(y) });
  // The meadow: every 125 px, bobbing a little (walking height; a column's own coin is a hop up).
  for (let x = 300; x < W - 60; x += 125) add(x, FLOOR - 46 - (Math.round(x / 125) % 3) * 14);
  for (const c of COLUMNS) add(c.x, up(c.h) - 44);
  // The bonus loop.
  for (const [x1, y1, x2, y2] of slideSegments().slice(1)) add((x1 + x2) / 2, (y1 + y2) / 2 - 40);
  for (const isl of ISLANDS) {
    add(isl.x - 34, up(isl.h) - 44);
    add(isl.x + 34, up(isl.h) - 44);
  }
  for (const [x1, y1, x2, y2] of stairSegments()) add((x1 + x2) / 2, (y1 + y2) / 2 - 40);
  for (let i = 0; i < 3; i++) add(PLANET_FLOOR.x1 + 60 + i * 80, up(PLANET_FLOOR.h) - 44);
  return out;
}

/* ------------------------------------------------------------------ */
/* Scene                                                                */
/* ------------------------------------------------------------------ */

/** A room-art piece at its world size times `scale`, bottom-centre anchored by default. */
function art(PIXI, name, x, y, opts = {}) {
  const [file] = RAINBOW_RUN_FILES[name];
  const spr = new PIXI.Sprite(textureFromUrl(`${ART}${file}`));
  spr.anchor.set(opts.ax ?? 0.5, opts.ay ?? 1);
  const s = opts.scale ?? 1;
  spr.scale.set(opts.flip ? -s : s, s);
  spr.x = x;
  spr.y = y;
  if (opts.alpha != null) spr.alpha = opts.alpha;
  if (opts.tint != null) spr.tint = opts.tint;
  return spr;
}

/** Local y on a parallax layer of factor f that shows at screen y `sy` with the avatar on the floor. */
const onLayer = (f, sy) => sy + f * CAM_GROUND;
/** How wide a layer of factor f must be to cover the room. */
const layerW = (f) => 960 + f * (W - 960) + 40;

export function buildRainbowScene(PIXI, kit) {
  const root = kit.sceneRoot(PIXI, W, H);
  const d = (layer, name, x, y, opts) => layer.addChild(kit.deco(PIXI, name, x, y, opts));
  const a = (layer, name, x, y, opts) => layer.addChild(art(PIXI, name, x, y, opts));

  // Night: a black sky; the purple horizon band (sky_hills: black into purple, then a wavy violet
  // ridge), squashed so the band stays a strip as in the Snaps; stars over both.
  const sky = root.layer(0, 0);
  sky.addChild(kit.gradient(PIXI, [[0, '#000000'], [1, '#07040c']], 960, 640));
  const band = root.layer(0.22, 1);
  const bandTop = onLayer(0.22, 112) - 1150 * 0.16;
  // Solid violet under the squashed band, so climbing never shows past its bottom edge.
  band.addChild(new PIXI.Graphics().rect(0, bandTop + 300, layerW(0.22), 1600).fill(0x9900b7));
  for (let x = 0, i = 0; x < layerW(0.22); x += 398, i++) {
    d(band, ['sky_hills_1', 'sky_hills_2', 'sky_hills_3'][i % 3], x, bandTop, { ax: 0, ay: 0, scale: 0.5, sy: 0.16 });
  }
  const stars = root.layer(0.08, 2);
  for (let x = 0; x < layerW(0.08); x += 400) {
    for (let y = -400; y < onLayer(0.08, 110); y += 400) {
      d(stars, (x / 400 + y / 400) % 2 ? 'sky_stars_2' : 'sky_stars_1', x, y, { ax: 0, ay: 0, scale: 0.5 });
    }
  }
  // The chequered ribbon flies high over the bonus loop.
  const high = root.layer(0.35, 3);
  a(high, 'ramp_2', 520, onLayer(0.35, -150), { ax: 0, ay: 0 });
  a(high, 'ramp_2', 1500, onLayer(0.35, -250), { ax: 0, ay: 0, scale: 0.8, flip: true });
  // Pale wavy hills, then lime ones.
  const pale = root.layer(0.42, 4);
  for (let x = 0; x < layerW(0.42); x += 990) d(pale, 'bg_land_4a', x, onLayer(0.42, 150), { ax: 0, ay: 0, scale: 0.5 });
  const lime = root.layer(0.55, 5);
  for (let x = 0; x < layerW(0.55); x += 990) d(lime, 'bg_land_3a', x, onLayer(0.55, 222), { ax: 0, ay: 0, scale: 0.5 });
  const far = root.layer(0.72, 6);
  const farW = layerW(0.72);
  for (let x = -200, i = 0; x < farW; x += 560, i++) {
    d(far, i % 2 ? 'arbito_hill_2' : 'arbito_hill_1', x, onLayer(0.72, 372), { ax: 0, scale: 0.3 + (i % 3) * 0.04 });
  }
  // A few far pieces, small: a column ruin, a pink tree, a fir.
  d(far, 'pillar_small_2a', 380, onLayer(0.72, 296), { scale: 0.2, alpha: 0.95 });
  d(far, 'arbito_tree_2', 1180, onLayer(0.72, 300), { scale: 0.32 });
  d(far, 'arbito_tree_3', 1720, onLayer(0.72, 300), { scale: 0.3 });
  d(far, 'pillar_small_1b', 2260, onLayer(0.72, 300), { scale: 0.2 });
  d(far, 'rock_group_3', 2560, onLayer(0.72, 302), { scale: 0.22 });

  const world = root.layer(1, 7);
  // Rolling lime hills behind the walking line.
  const hillXs = [-120, 520, 1180, 1880, 2520, 3200, 3820];
  hillXs.forEach((x, i) => d(world, i % 2 ? 'hill_2b' : 'hill_1b', x, FLOOR + 120, { scale: 0.42 + (i % 3) * 0.06, flip: i % 3 === 1 }));

  // The head end: lavender spire, pink tree, the head on its side, the foot.
  d(world, 'tree_1', 3165, FLOOR - 70, { scale: 0.5 });
  d(world, 'arbito_tree_2', 2560, FLOOR - 40, { scale: 0.5 });
  a(world, 'statue_head_2', 2880, FLOOR + 26, { scale: 0.85 });
  d(world, 'statue_foot_2', 3570, FLOOR + 30, { scale: 0.425 });
  // The meadow middle: the rock spire, the pink tree, the hand, the blue fir.
  d(world, 'rock_group_2', 2400, FLOOR + 10, { scale: 0.4 });
  d(world, 'arbito_tree_2', 1890, FLOOR + 6, { scale: 0.5 });
  d(world, 'statue_handpeace', 1530, FLOOR + 8, { scale: 0.27 });
  d(world, 'arbito_tree_3', 1170, FLOOR + 8, { scale: 0.5 });
  a(world, 'flower_stem_1', 1330, FLOOR + 6, { scale: 0.8 });
  a(world, 'flower_8', 1330, FLOOR - 172, { ay: 0.5 });

  // The planet, hung above the slide's island; the islands and stairs in front of it.
  const planet = new PIXI.Container();
  planet.addChild(art(PIXI, 'planet_1_back', PLANET.x, PLANET.y, { ax: 0, ay: 0, scale: PLANET.scale / 0.9 }));
  planet.addChild(art(PIXI, 'planet_1_front', PLANET.x, PLANET.y, { ax: 0, ay: 0, scale: PLANET.scale / 0.9 }));
  world.addChild(planet);
  // The slide pours from the first island down to the flower.
  const slide = art(PIXI, 'ramp_1', SLIDE.x + SLIDE.w, SLIDE.top, { ax: 0, ay: 0, flip: true });
  world.addChild(slide);
  a(world, 'flower_stem_1', 176, FLOOR + 6);
  a(world, 'arbito_flower_3', 178, FLOOR - 236, { ay: 0.5 });
  for (const isl of ISLANDS) d(world, isl.deco, isl.x, up(isl.h) - 8, { ay: 0, scale: 0.5 });
  // Stairs, top piece first so each lower step sits in front of the one above.
  for (let k = STAIRS.pieces - 1; k >= 0; k--) {
    a(world, 'step1_four', STAIRS.x + k * STAIRS.run, up(STAIRS.h + k * STAIRS.run) - 40, { ax: 0, ay: 0 });
  }

  // Columns, then the turf over their bases.
  for (const c of COLUMNS) {
    if (c.art) a(world, c.art, c.x, up(c.h) - 2, { ay: 0, scale: c.s });
    else d(world, c.deco, c.x, up(c.h) - 2, { ay: 0, scale: c.k });
  }
  // Fallen and tilted columns that are only scenery.
  a(world, 'pillar_4', 3330, FLOOR + 14, { scale: 0.75 });
  d(world, 'pillar_small_1b', 2560, FLOOR + 30, { scale: 0.34 });
  d(world, 'pillar_small_2a', 3905, FLOOR + 40, { scale: 0.3 });
  d(world, 'pillar_small_3b', 640, FLOOR + 36, { scale: 0.3 });

  const turf = new PIXI.Graphics();
  turf.rect(0, FLOOR - 2, W, H - FLOOR + 2).fill(0x9feb07);
  turf.rect(0, FLOOR - 2, W, 3).fill({ color: 0x5f9a00, alpha: 0.55 });
  world.addChild(turf);
  // Flowers, bushes, flames and rugs on the meadow.
  const meadow = [
    ['d', 'arbito_bush1', 470, 0.3], ['a', 'bush15', 820, 0.6], ['d', 'arbito_flower_4', 1040, 0.3],
    ['d', 'bush12', 1420, 0.36], ['d', 'flower_11', 1630, 0.3], ['a', 'arbito_bush7', 1980, 0.7],
    ['d', 'flower_5', 2300, 0.32], ['d', 'arbito_bush6', 2480, 0.36], ['d', 'arbito_bush1', 2640, 0.24],
    ['d', 'bush14', 2790, 0.36], ['a', 'flower_10', 3110, 0.8], ['d', 'bones_1', 3420, 0.36],
    ['d', 'flower_6', 3620, 0.3], ['a', 'arbito_bush3', 3810, 0.8], ['d', 'arbito_flower_9', 3880, 0.26],
    ['d', 'bush9', 260, 0.4], ['d', 'flower_7', 2125, 0.28],
  ];
  for (const [kind, name, x, s] of meadow) (kind === 'a' ? a : d)(world, name, x, FLOOR + 8, { scale: s });
  const rugs = [
    ['d', 'arbito_puddle_1', 380, 0.4], ['a', 'puddle_3', 990, 0.8], ['d', 'arbito_puddle_2', 1460, 0.36],
    ['a', 'puddle_3b', 2010, 1], ['d', 'arbito_puddle_1', 2620, 0.34], ['a', 'puddle_3c', 2950, 1],
    ['a', 'puddle_3', 3460, 0.7], ['d', 'arbito_puddle_2', 3790, 0.32],
  ];
  for (const [kind, name, x, s] of rugs) (kind === 'a' ? a : d)(world, name, x, FLOOR + 26 + (x % 3) * 8, { ay: 0, scale: s });
  for (let x = 120; x < W; x += 610) d(world, 'texture_grass_1', x, FLOOR + 70, { ay: 0, scale: 0.3, alpha: 0.7 });
  return root;
}
