/**
 * Pixi background for a neighbour's home street (js/neighbours.js): a sky
 * gradient, parallax deco layers, the walkable field and soil, grass along the
 * yard, the neighbour's house and their yard props. Every image is a recovered
 * CC0 deco under assets/decos/groddle/ drawn at its true aspect; four looks
 * (Groddle meadow, Firebog, Uralia, and a K03 snow street) are varied per
 * neighbour by a stable hash.
 */

import { NEIGHBOUR_SCENE, hash01, neighbourLayout } from '../neighbours.js?v=7fbf44a4';
import { textureFromUrl } from '../textures.js?v=db2ce452';

const DECO = 'assets/decos/groddle/';
/** The widest view the parallax layers must cover (js/location-view.js: 1680, wider on ultrawide windows). */
const VIEW_W = 2000;

/** Exact source sizes of every deco used here. */
export const SCENE_DECO_SIZES = Object.freeze({
  mountain_blue_1: [1648, 550],
  pinehills_distant_1: [2038, 668],
  pinehills_1: [1700, 540],
  transition_hill_1: [2146, 320],
  tree_coniferous_2: [740, 1322],
  tree_deciduous3: [864, 1170],
  evenground_horizon: [2432, 218],
  bush_3: [566, 200],
  tree_coniferous_1: [530, 1294],
  groddle_grass_2: [162, 130],
  wildflowers_bunch_2: [382, 50],
  groddle_grass_1: [212, 102],
  crosssection_short_3: [1038, 236],
  front_ground_2: [620, 272],
  background_horizon_bottletrees_1: [1896, 236],
  background_brown_bump3: [2144, 176],
  treetop_noflowers_2: [1694, 824],
  bottletree_body1: [1302, 832],
  background_bottletree_silhouette: [174, 234],
  background_brown_bump1: [2988, 172],
  mushrooms: [136, 232],
  grass_solid: [124, 106],
  underground_plant_1: [78, 106],
  ground_spots_dark_1: [628, 70],
  zutto_cloud_1: [500, 136],
  bck_hill_9: [948, 612],
  hill_11: [992, 280],
  bck_tree_2: [148, 190],
  zutto_hill_1: [1380, 290],
  tree_11: [332, 570],
  tree_7: [256, 418],
  plant_grass_2: [50, 96],
  purple_mushroom_3: [168, 140],
  plant_fern_2: [72, 144],
  k03_background_snowhill_02: [2798, 1104],
  k03_background_snowhill_03: [3424, 814],
  k03_background_snowhill_01: [2022, 132],
  k03_tree01_snow_01: [840, 1276],
  k03_tree02_snow_01: [960, 1310],
  k03_snowbank_01: [930, 418],
  k03_snowball_01: [76, 78],
  k03_snowman_01: [536, 606],
  k03_treegroup_01: [630, 408],
  bench: [370, 96],
  flower_bush_5: [502, 214],
  groddle_flower_2: [78, 206],
  lantern_stacked: [66, 188],
  bush_1: [208, 166],
  heights_bush_1: [320, 188],
  lantern: [54, 110],
  bling_birdhouse_1: [120, 438],
});

const L = (s, scale, y, every, jitter = 0, offset = 0) => ({ s, scale, y, every, jitter, offset });

export const SCENE_STYLES = Object.freeze({
  meadow: {
    sky: [0xa6effa, 0xeafcfb],
    field: 0x77ad43,
    fieldDark: 0x5f9636,
    soil: 'crosssection_short_3',
    soilColor: 0x6a4329,
    layers: [
      { f: 0.08, items: [L('mountain_blue_1', 0.42, 470, 760, 120)] },
      { f: 0.16, items: [L('pinehills_distant_1', 0.34, 500, 900, 200)] },
      { f: 0.3, items: [L('pinehills_1', 0.36, 520, 1100, 260)] },
      { f: 0.5, items: [L('transition_hill_1', 0.5, 548, 1000, 120), L('tree_coniferous_2', 0.2, 548, 520, 160, 140), L('tree_deciduous3', 0.21, 552, 780, 140, 380)] },
      { f: 0.75, items: [L('evenground_horizon', 0.55, 590, 1300), L('bush_3', 0.42, 596, 640, 200, 260), L('tree_coniferous_1', 0.24, 594, 1150, 220, 700)] },
    ],
    near: [L('groddle_grass_2', 0.55, 0, 300, 120), L('wildflowers_bunch_2', 0.6, 0, 420, 160, 120), L('groddle_grass_1', 0.5, 0, 520, 160, 60)],
  },
  firebog: {
    sky: [0xf0d98a, 0x9a5a3a],
    field: 0x6a4a34,
    fieldDark: 0x523726,
    soil: 'front_ground_2',
    soilColor: 0x4c3022,
    layers: [
      { f: 0.1, items: [L('background_horizon_bottletrees_1', 0.7, 500, 1300)] },
      { f: 0.25, items: [L('background_brown_bump3', 0.6, 548, 1280)] },
      { f: 0.45, items: [L('treetop_noflowers_2', 0.2, 420, 900, 180, 200), L('bottletree_body1', 0.16, 566, 900, 180, 200), L('background_bottletree_silhouette', 0.8, 560, 430, 120, 60)] },
      { f: 0.75, items: [L('background_brown_bump1', 0.55, 600, 1600), L('mushrooms', 0.42, 600, 560, 200, 300)] },
    ],
    near: [L('grass_solid', 0.6, 0, 260, 100), L('underground_plant_1', 0.6, 0, 380, 140, 90), L('ground_spots_dark_1', 0.5, 18, 700, 200, 30)],
  },
  uralia: {
    sky: [0x8fd6cf, 0xd8eedd],
    field: 0x5e8f8a,
    fieldDark: 0x4b7672,
    soil: 'front_ground_2',
    soilColor: 0x40525a,
    layers: [
      { f: 0.06, items: [L('zutto_cloud_1', 0.6, 360, 700, 260)] },
      { f: 0.14, items: [L('bck_hill_9', 0.42, 540, 620, 160)] },
      { f: 0.32, items: [L('hill_11', 0.55, 560, 760, 140), L('bck_tree_2', 0.8, 560, 330, 120, 100)] },
      { f: 0.6, items: [L('zutto_hill_1', 0.5, 594, 1100), L('tree_11', 0.42, 596, 780, 220, 320), L('tree_7', 0.46, 596, 980, 200, 700)] },
    ],
    near: [L('plant_grass_2', 0.7, 0, 220, 90), L('purple_mushroom_3', 0.4, 0, 640, 200, 200), L('plant_fern_2', 0.55, 0, 420, 140, 80)],
  },
  snow: {
    sky: [0xbfe2f6, 0xf4fbff],
    field: 0xf2f7fb,
    fieldDark: 0xd6e4ef,
    soil: 'front_ground_2',
    soilColor: 0x6f7f8c,
    layers: [
      { f: 0.1, items: [L('k03_background_snowhill_03', 0.32, 520, 1100, 100)] },
      { f: 0.22, items: [L('k03_background_snowhill_02', 0.24, 560, 900, 160)] },
      { f: 0.45, items: [L('k03_tree01_snow_01', 0.16, 586, 520, 160, 120), L('k03_tree02_snow_01', 0.15, 586, 760, 200, 400)] },
      { f: 0.75, items: [L('k03_background_snowhill_01', 0.6, 598, 1200), L('k03_snowbank_01', 0.3, 602, 900, 220, 300)] },
    ],
    near: [L('k03_snowball_01', 0.5, 0, 420, 160, 120)],
  },
});

function size(name) {
  return SCENE_DECO_SIZES[name] || [100, 100];
}

function decoSprite(PIXI, name, scale, x, y, flip = false) {
  const [w, h] = size(name);
  const spr = new PIXI.Sprite(textureFromUrl(`${DECO}${name}.png`));
  spr.anchor.set(0.5, 1);
  spr.width = w * scale;
  spr.height = h * scale;
  if (flip) spr.scale.x *= -1;
  spr.x = x;
  spr.y = y;
  return spr;
}

function gradientTexture(PIXI, top, bottom) {
  const canvas = document.createElement('canvas');
  canvas.width = 2;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, `#${top.toString(16).padStart(6, '0')}`);
  grad.addColorStop(1, `#${bottom.toString(16).padStart(6, '0')}`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 2, 256);
  return PIXI.Texture.from(canvas);
}

/** Yard props sit on the ground at hashed spots away from the house and stone. */
const PROP_SCALE = Object.freeze({
  bench: 0.42,
  flower_bush_5: 0.36,
  groddle_flower_2: 0.55,
  mushrooms: 0.4,
  lantern_stacked: 0.55,
  underground_plant_1: 0.7,
  purple_mushroom_3: 0.5,
  plant_fern_2: 0.6,
  bush_1: 0.5,
  groddle_grass_1: 0.5,
  grass_solid: 0.7,
  background_bottletree_silhouette: 0.7,
  k03_snowman_01: 0.22,
  k03_treegroup_01: 0.36,
  lantern: 0.6,
  bling_birdhouse_1: 0.42,
});

export function propPlan(neighbour) {
  const layout = neighbourLayout(neighbour);
  const skip = new Set(['bling_birdhouse_1', 'lantern']); // chore objects, drawn as targets
  const out = [];
  let spot = 0;
  for (const [i, name] of neighbour.props.entries()) {
    if (skip.has(name)) continue;
    const x = name === 'bench' ? layout.benchX : layout.propSpots[spot++ % layout.propSpots.length];
    out.push({
      name,
      scale: PROP_SCALE[name] || 0.5,
      x: Math.round(x + (name === 'bench' ? 0 : (hash01(`${neighbour.id}:prop:${i}`) - 0.5) * 60)),
      flip: hash01(`${neighbour.id}:flip:${i}`) > 0.5,
    });
  }
  return out;
}

/** The whole background container (enterScene's `background`). */
export function buildNeighbourBackground(PIXI, neighbour) {
  const style = SCENE_STYLES[neighbour.style] || SCENE_STYLES.meadow;
  const layout = neighbourLayout(neighbour);
  const { width, groundY } = layout;
  const root = new PIXI.Container();
  root.sortableChildren = true;
  const sky = new PIXI.Sprite(gradientTexture(PIXI, style.sky[0], style.sky[1]));
  sky.zIndex = -100;
  root.addChild(sky);

  const parallax = [];
  style.layers.forEach((layer, li) => {
    const lc = new PIXI.Container();
    lc.zIndex = -90 + li;
    const span = width * layer.f + VIEW_W * (1 - layer.f) + 400;
    for (const item of layer.items) {
      let i = 0;
      for (let x = (item.offset || 0) - 200; x < span; x += item.every) {
        const jx = item.jitter ? (hash01(`${neighbour.id}:${li}:${item.s}:${i}`) - 0.5) * item.jitter * 2 : 0;
        lc.addChild(decoSprite(PIXI, item.s, item.scale, x + jx, item.y, hash01(`${neighbour.id}:${item.s}:${i}:flip`) > 0.5));
        i += 1;
      }
    }
    lc.parallaxF = layer.f;
    root.addChild(lc);
    parallax.push(lc);
  });

  const field = new PIXI.Graphics();
  field.zIndex = -40;
  field.rect(-50, 586, width + 100, groundY - 586 + 40).fill(style.field);
  field.rect(-50, groundY + 10, width + 100, 30).fill({ color: style.fieldDark, alpha: 0.5 });
  root.addChild(field);
  const soilFill = new PIXI.Graphics();
  soilFill.zIndex = -39.5;
  soilFill.rect(-50, groundY + 30, width + 100, 240).fill(style.soilColor);
  root.addChild(soilFill);
  const [sw, sh] = size(style.soil);
  const soilW = sw * 0.6;
  for (let x = -40; x < width + soilW; x += soilW - 2) {
    const soil = new PIXI.Sprite(textureFromUrl(`${DECO}${style.soil}.png`));
    soil.anchor.set(0, 0);
    soil.width = soilW;
    soil.height = Math.min(150, sh * 0.6);
    soil.x = x;
    soil.y = groundY + 26;
    soil.zIndex = -39;
    root.addChild(soil);
  }

  const near = new PIXI.Container();
  near.zIndex = -30;
  const lotLeft = layout.houseX - layout.houseW / 2 - 30;
  const lotRight = layout.houseX + layout.houseW / 2 + 30;
  for (const item of style.near) {
    let i = 0;
    for (let x = item.offset || 0; x < width; x += item.every) {
      const px = x + (hash01(`${neighbour.id}:near:${item.s}:${i}`) - 0.5) * item.jitter * 2;
      i += 1;
      if (px > lotLeft && px < lotRight) continue;
      near.addChild(decoSprite(PIXI, item.s, item.scale, px, groundY + 22 + (item.y || 0), hash01(`${item.s}:${i}`) > 0.5));
    }
  }
  root.addChild(near);

  const h = neighbour.house;
  const house = new PIXI.Sprite(textureFromUrl(`${DECO}${h.path}.png`));
  house.anchor.set(0.5, 1);
  house.width = h.w * h.scale;
  house.height = h.h * h.scale;
  house.x = layout.houseX;
  house.y = groundY + 14;
  house.zIndex = -20;
  root.addChild(house);

  // A bush planted over the deco's painted For Sale sign.
  if (h.cover && layout.coverX != null) {
    const cover = decoSprite(PIXI, h.cover.s, h.cover.scale, layout.coverX, groundY + 22, false);
    cover.zIndex = -19;
    root.addChild(cover);
  }

  const props = new PIXI.Container();
  props.zIndex = -18;
  for (const prop of propPlan(neighbour)) {
    props.addChild(decoSprite(PIXI, prop.name, prop.scale, prop.x, groundY + 18, prop.flip));
  }
  root.addChild(props);

  root.worldH = NEIGHBOUR_SCENE.groundY + 102;
  root.updateParallax = (camX, camY, vpW, vpH, skyH = vpH) => {
    sky.x = camX;
    sky.y = camY;
    sky.width = vpW;
    sky.height = skyH;
    for (const lc of parallax) lc.x = camX * (1 - lc.parallaxF);
  };
  return root;
}

/** Collision for enterScene: one flat ground line across the street. */
export function neighbourPlatforms() {
  const { width, groundY } = NEIGHBOUR_SCENE;
  return [{ id: 'neighbour-ground', x1: 0, y1: groundY, x2: width, y2: groundY, pc_perm: 1 }];
}

/** Loading-screen colours per look. */
export function neighbourLoadingColors(neighbour) {
  const style = SCENE_STYLES[neighbour.style] || SCENE_STYLES.meadow;
  const hex = (n) => `#${n.toString(16).padStart(6, '0')}`;
  return [hex(style.sky[0]), hex(style.fieldDark)];
}
