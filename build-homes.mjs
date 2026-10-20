/**
 * Build the homes catalog (furniture, house textures, home limits and
 * cultivation) from Tiny Speck's GameServerJS sources (CC0), and copy the
 * recovered CC0 furniture / cultivation art out of the OGA extract.
 *
 * Reads:
 *   items/furniture_*.js, items/bag_furniture_*.js   label, description, base_cost,
 *                                                    placement_set, can_flip
 *   items/catalog_furniture.js                       upgrade counts per class
 *   items/catalog_recipes.js                         Construction Tool / Loomer recipes
 *   items/catalog_stores.js                          store 23 (Furniture Store)
 *   players/inc_furniture.js                         furniture_populate starter kit
 *   inc_data_homes.js                                wallpaper / floor / ceiling configs
 *   config_base.js                                   home_limits + yard expansion costs
 *   locations/inc_cultivation.js                     cultivation classes, img cost formula
 *   items/proto_*.js + end items                     labels, base_cost, width, max wear
 *
 * Writes:
 *   public/js/homes-catalog.js
 *   public/assets/sprites/furniture/<class>.png      world art (exact OGA x1 frames)
 *   public/assets/sprites/icons/<class>.png          pack thumbnails (<= 48 px)
 *   public/assets/sprites/cultivation/<class>.png    pod / hive / mound art
 *
 * Run from spike root:
 *   node build-homes.mjs            (art copy needs ImageMagick for thumbnails)
 */

import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadItem } from './build-recipes.mjs';

const root = dirname(fileURLToPath(import.meta.url));
const AUDIT = join(process.env.HOME || '', 'Documents/glitch-audit');
const GSJS = process.env.GLITCH_GSJS || join(AUDIT, 'glitch-GameServerJS');
const OGA = process.env.OGA_HOMES || join(AUDIT, 'opengameart/extracted_homes/glitch-assets');
const PUBLIC = join(root, 'public');
const OUT = join(PUBLIC, 'js/homes-catalog.js');

function runFile(file, tail) {
  const ctx = {};
  vm.runInNewContext(`${readFileSync(file, 'utf8')}\n${tail}`, ctx, { filename: file, timeout: 5000 });
  return ctx;
}

/** PNG width/height from the IHDR chunk. */
function pngSize(file) {
  const buf = readFileSync(file);
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

function ogaFrame(classTsid, pattern = /__x1_1_png_|_x1_1_png_/) {
  const dir = join(OGA, classTsid);
  if (!existsSync(dir)) return null;
  const file = readdirSync(dir).find((name) => pattern.test(name));
  return file ? join(dir, file) : null;
}

// ---------------------------------------------------------------------------
// Furniture
// ---------------------------------------------------------------------------

/** Classes with recovered art. The four furniture_door_* job frames are floor-link doors, not decor. */
const FURNITURE_CLASSES = [
  'furniture_chair', 'furniture_armchair', 'furniture_bench', 'furniture_stool', 'furniture_sofa',
  'furniture_loveseat', 'furniture_bed', 'furniture_table', 'furniture_coffeetable', 'furniture_sidetable',
  'furniture_desk', 'furniture_counter', 'furniture_bookcase', 'furniture_cabinet', 'furniture_fireplace',
  'bag_furniture_cabinet', 'bag_furniture_largecabinet', 'bag_furniture_smallcabinet',
  'bag_furniture_wallcabinet', 'bag_furniture_sdb',
  'furniture_floorlamp', 'furniture_tablelamp', 'furniture_walllamp', 'furniture_ceilinglamp', 'furniture_lamp',
  'furniture_rug', 'furniture_shelf', 'furniture_painting', 'furniture_window', 'furniture_smallwindow',
  'furniture_largewindow', 'furniture_walldeco', 'furniture_walldecor', 'furniture_smallwalldeco',
  'furniture_largewalldeco', 'furniture_ceilingdeco', 'furniture_roomdeco', 'furniture_tabledeco',
  'furniture_smalltabledeco', 'furniture_largetabledeco', 'furniture_smallbackfloordeco',
  'furniture_largebackfloordeco', 'furniture_smallfrontfloordeco', 'furniture_largefrontfloordeco',
];

/**
 * Remake-only layout facts that the base art implies but the source does not
 * record for the un-upgraded frame (catalog_furniture plats belong to upgrades):
 * `surface` is the height above the foot where tabletop decor rests.
 * `scale` only ever shrinks: the 965x665 Fireplace is shown at half size.
 */
const LAYOUT = {
  furniture_table: { surface: 80 },
  furniture_coffeetable: { surface: 54 },
  furniture_sidetable: { surface: 50 },
  furniture_desk: { surface: 66 },
  furniture_counter: { surface: 76 },
  furniture_bookcase: { surface: 157 },
  furniture_cabinet: { surface: 164 },
  bag_furniture_cabinet: { surface: 182 },
  bag_furniture_largecabinet: { surface: 164 },
  bag_furniture_smallcabinet: { surface: 72 },
  furniture_shelf: { surface: 40 },
  furniture_fireplace: { scale: 0.5, surface: 560 },
};

/** Decor that may sit on another piece's surface (tabletop placement). */
const TABLETOP = new Set([
  'furniture_tabledeco', 'furniture_smalltabledeco', 'furniture_largetabledeco', 'furniture_tablelamp',
]);

function slotFor(placementSet) {
  if (placementSet.includes('rug')) return 'rug';
  if (placementSet.includes('ceiling')) return 'ceiling';
  if (placementSet.length && placementSet.every((p) => p === 'wall')) return 'wall';
  return 'floor';
}

function loadRecipes() {
  const ctx = runFile(join(GSJS, 'items/catalog_recipes.js'), 'this.recipes = recipes;');
  return ctx.recipes;
}

function loadStore23() {
  const ctx = runFile(join(GSJS, 'items/catalog_stores.js'), 'this.stores = stores;');
  const store = ctx.stores[23];
  return {
    storeId: 23,
    label: store.name,
    buyMultiplier: store.buy_multiplier,
    offers: store.items.map((row) => ({ classTsid: row.class_tsid, cost: row.cost })),
  };
}

function loadUpgradeCounts() {
  const ctx = runFile(
    join(GSJS, 'items/catalog_furniture.js'),
    'for (const k of Object.keys(this)) if (/^add_furniture/.test(k)) this[k](); this.f = furniture;'
  );
  const out = {};
  for (const [cls, ups] of Object.entries(ctx.f)) {
    out[cls] = Object.values(ups).filter((u) => u.is_visible).length;
  }
  return out;
}

function loadStarterKit() {
  const src = readFileSync(join(GSJS, 'players/inc_furniture.js'), 'utf8');
  const body = src.match(/function furniture_populate\(force\)\{[\s\S]*?var to_give = (\{[\s\S]*?\});/);
  if (!body) throw new Error('furniture_populate to_give not found');
  return vm.runInNewContext(`(${body[1]})`);
}

function buildFurniture() {
  const recipes = loadRecipes();
  const store = loadStore23();
  const upgrades = loadUpgradeCounts();
  const recipeByOutput = {};
  for (const [id, r] of Object.entries(recipes)) {
    for (const [cls] of r.outputs || []) {
      if (/^(furniture_|bag_furniture_)/.test(cls) && r.learnt !== 3) recipeByOutput[cls] = { id, tool: r.tool, name: r.name };
    }
  }
  const catalog = {};
  const missing = [];
  for (const classTsid of FURNITURE_CLASSES) {
    const row = loadItem(classTsid, GSJS);
    const art = ogaFrame(classTsid);
    if (!row || !art) {
      missing.push(classTsid);
      continue;
    }
    const placementSet = String(row.classProps.placement_set || '').split(',').map((s) => s.trim()).filter(Boolean);
    const { w, h } = pngSize(art);
    const offer = store.offers.find((o) => o.classTsid === classTsid);
    catalog[classTsid] = {
      classTsid,
      label: row.label,
      desc: row.description || '',
      baseCost: row.baseCost || 0,
      placementSet,
      slot: slotFor(placementSet),
      tabletop: TABLETOP.has(classTsid),
      canFlip: String(row.classProps.can_flip ?? '1') !== '0',
      art: { path: `assets/sprites/furniture/${classTsid}.png`, w, h },
      ...(LAYOUT[classTsid] || {}),
      upgrades: upgrades[classTsid] || 0,
      recipe: recipeByOutput[classTsid] || null,
      storeCost: offer ? offer.cost : null,
      source: `items/${classTsid}.js`,
    };
  }
  return { catalog, store, missing, starterKit: loadStarterKit() };
}

// ---------------------------------------------------------------------------
// Wallpaper / floor / ceiling, home limits
// ---------------------------------------------------------------------------

function buildTextures() {
  const ctx = runFile(
    join(GSJS, 'inc_data_homes.js'),
    'this.w = homes_wallpaper_configs; this.f = homes_floor_configs; this.c = homes_ceiling_configs;'
  );
  const pick = (configs) =>
    Object.fromEntries(
      Object.entries(configs)
        .filter(([, v]) => v.is_visible)
        .map(([key, v]) => [
          key,
          {
            key,
            name: v.name,
            category: v.category,
            costCredits: Number(v.cost_credits) || 0,
            isDefault: v.is_default === true,
            isSubscriber: v.is_subscriber === true,
          },
        ])
    );
  return { walls: pick(ctx.w), floors: pick(ctx.f), ceilings: pick(ctx.c) };
}

function buildHomeLimits() {
  const ctx = runFile(join(GSJS, 'config_base.js'), 'this.hl = home_limits;');
  const hl = ctx.hl;
  return {
    START_BACKYARD_SEGMENTS: hl.START_BACKYARD_SEGMENTS,
    START_FRONTYARD_LEFT_SEGMENTS: hl.START_FRONTYARD_LEFT_SEGMENTS,
    START_FRONTYARD_RIGHT_SEGMENTS: hl.START_FRONTYARD_RIGHT_SEGMENTS,
    MAX_BACKYARD_SEGMENTS: hl.MAX_BACKYARD_SEGMENTS,
    MAX_FRONTYARD_LEFT_SEGMENTS: hl.MAX_FRONTYARD_LEFT_SEGMENTS,
    MAX_FRONTYARD_RIGHT_SEGMENTS: hl.MAX_FRONTYARD_RIGHT_SEGMENTS,
    START_WALL_SEGMENTS: hl.START_WALL_SEGMENTS,
    MIN_WALL_SEGMENTS: hl.MIN_WALL_SEGMENTS,
    MAX_WALL_SEGMENTS: hl.MAX_WALL_SEGMENTS,
    MAX_FLOORS: hl.MAX_FLOORS,
    START_TEXTURE_WALL: hl.START_TEXTURE_WALL,
    START_TEXTURE_CEILING: hl.START_TEXTURE_CEILING,
    START_TEXTURE_FLOOR: hl.START_TEXTURE_FLOOR,
    FRONTYARD_EXPAND_COSTS: [...hl.FRONTYARD_EXPAND_COSTS],
    BACKYARD_EXPAND_COSTS: [...hl.BACKYARD_EXPAND_COSTS],
  };
}

// ---------------------------------------------------------------------------
// Cultivation
// ---------------------------------------------------------------------------

/** Remake end item for each proto (the world class our systems already run). */
const CULTIVATION_TARGET = {
  proto_crop_garden_small: { kind: 'garden', gardenType: 'default', cols: 2, rows: 2 },
  proto_crop_garden_medium: { kind: 'garden', gardenType: 'default', cols: 4, rows: 2 },
  proto_crop_garden_large: { kind: 'garden', gardenType: 'default', cols: 5, rows: 3 },
  proto_herb_garden_small: { kind: 'garden', gardenType: 'herb', cols: 2, rows: 2 },
  proto_herb_garden_medium: { kind: 'garden', gardenType: 'herb', cols: 4, rows: 2 },
  proto_herb_garden_large: { kind: 'garden', gardenType: 'herb', cols: 5, rows: 3 },
  proto_metal_rock: { kind: 'rock' },
  proto_dullite_rock: { kind: 'rock' },
  proto_beryl_rock: { kind: 'rock' },
  proto_sparkly_rock: { kind: 'rock' },
  proto_peat: { kind: 'node', nodes: [{ classTsid: 'peat_1', dx: 0, dy: 0 }] },
  proto_dirt_pile: { kind: 'node', nodes: [{ classTsid: 'dirt_pile', dx: 0, dy: 0 }] },
  proto_jellisac_mound: {
    kind: 'node',
    art: 'jellisac_mound',
    // jellisac_mound.js onContainerChanged createAndReturnItem offsets.
    nodes: [{ classTsid: 'jellisac', dx: 38, dy: -44 }, { classTsid: 'jellisac', dx: -45, dy: -64 }],
  },
  proto_barnacle_pod: {
    kind: 'node',
    art: 'barnacle_pod',
    // barnacle_pod.js onContainerChanged createAndReturnItem offsets.
    nodes: [
      { classTsid: 'mortar_barnacle', dx: 37, dy: -43 },
      { classTsid: 'mortar_barnacle', dx: 19, dy: -105 },
      { classTsid: 'mortar_barnacle', dx: -26, dy: -63 },
    ],
  },
  proto_firefly_hive: { kind: 'hive', art: 'firefly_hive', nodeClass: 'npc_firefly' },
  proto_patch: { kind: 'patch' },
};

function maxWearOf(classTsid) {
  const file = join(GSJS, 'items', `${classTsid}.js`);
  if (!existsSync(file)) return null;
  const m = readFileSync(file, 'utf8').match(/instanceProps\.cultivation_max_wear = "(\d+)"/);
  return m ? Number(m[1]) : null;
}

function buildCultivation() {
  const ctx = runFile(join(GSJS, 'locations/inc_cultivation.js'), 'this.cc = cultivation_classes; this.caps = cultivation_rewards_cap;');
  const out = {};
  for (const [protoClass, minLevel] of Object.entries(ctx.cc)) {
    if (protoClass === 'proto_furniture_tower_chassis') continue; // public towers only
    const proto = loadItem(protoClass, GSJS);
    const target = CULTIVATION_TARGET[protoClass];
    if (!proto || !target) throw new Error(`cultivation class ${protoClass} has no proto or target`);
    const endItems = String(proto.classProps.item_class || '').split(',').map((s) => s.trim()).filter(Boolean);
    const gardenWear = { small: 60, medium: 160, large: 300 }; // garden_new.js onCultivated
    const size = protoClass.match(/_(small|medium|large)$/)?.[1];
    out[protoClass] = {
      protoClass,
      label: proto.label,
      baseCost: proto.baseCost,
      minLevel,
      width: Number(proto.classProps.width) || 200,
      endItems: protoClass === 'proto_patch' ? ['patch'] : endItems,
      maxWear: target.kind === 'garden' ? gardenWear[size] : maxWearOf(endItems[0] === 'patch' ? 'patch' : endItems[0]),
      ...target,
      source: `items/${protoClass}.js`,
    };
  }
  return { classes: out, rewardCaps: [...ctx.caps] };
}

// ---------------------------------------------------------------------------
// Art
// ---------------------------------------------------------------------------

function copyArt(furniture) {
  const furnDir = join(PUBLIC, 'assets/sprites/furniture');
  const cultDir = join(PUBLIC, 'assets/sprites/cultivation');
  const iconDir = join(PUBLIC, 'assets/sprites/icons');
  mkdirSync(furnDir, { recursive: true });
  mkdirSync(cultDir, { recursive: true });
  let thumbs = 0;
  for (const classTsid of Object.keys(furniture)) {
    const src = ogaFrame(classTsid);
    copyFileSync(src, join(furnDir, `${classTsid}.png`));
    try {
      execFileSync('magick', [src, '-resize', '48x48>', '-strip', join(iconDir, `${classTsid}.png`)]);
      thumbs += 1;
    } catch {
      copyFileSync(src, join(iconDir, `${classTsid}.png`));
    }
  }
  for (const cls of ['barnacle_pod', 'firefly_hive', 'jellisac_mound']) {
    copyFileSync(ogaFrame(cls), join(cultDir, `${cls}.png`));
  }
  const iconic = (cls, out = cls) => {
    const src = ogaFrame(cls, /_x1_iconic_png_/);
    if (src) copyFileSync(src, join(iconDir, `${out}.png`));
  };
  iconic('construction_tool');
  iconic('bulb');
  iconic('wall_segment');
  iconic('grade_aa_earth_block');
  const broken = ogaFrame('construction_tool', /_x1_broken_iconic_png_/);
  if (broken) copyFileSync(broken, join(iconDir, 'construction_tool_broken.png'));
  return thumbs;
}

// ---------------------------------------------------------------------------

export function buildHomesCatalog() {
  const furniture = buildFurniture();
  return {
    furniture,
    textures: buildTextures(),
    limits: buildHomeLimits(),
    cultivation: buildCultivation(),
  };
}

function main() {
  const { furniture, textures, limits, cultivation } = buildHomesCatalog();
  const banner = `/**
 * Generated by build-homes.mjs from glitch-GameServerJS (CC0). Do not edit by
 * hand; re-run \`node build-homes.mjs\`.
 */
`;
  const j = (v) => JSON.stringify(v, null, 2);
  writeFileSync(
    OUT,
    `${banner}
/** Furniture classes with recovered OGA art: source label/desc/base cost/placement. */
export const FURNITURE_CATALOG = Object.freeze(${j(furniture.catalog)});

/** catalog_stores.js store 23. */
export const FURNITURE_STORE = Object.freeze(${j(furniture.store)});

/** players/inc_furniture.js furniture_populate: what a new house owner receives. */
export const FURNITURE_STARTER_KIT = Object.freeze(${j(furniture.starterKit)});

/** inc_data_homes.js visible wallpaper / floor / ceiling configs. */
export const HOME_TEXTURE_CONFIGS = Object.freeze(${j(textures)});

/** config_base.js home_limits (+ FRONTYARD/BACKYARD_EXPAND_COSTS). */
export const HOME_LIMITS = Object.freeze(${j(limits)});

/** locations/inc_cultivation.js cultivation_classes joined with each proto item. */
export const CULTIVATION_CLASSES = Object.freeze(${j(cultivation.classes)});

/** locations/inc_cultivation.js cultivation_rewards_cap (visitor iMG cap by level). */
export const CULTIVATION_REWARD_CAPS = Object.freeze(${j(cultivation.rewardCaps)});
`
  );
  const thumbs = process.argv.includes('--no-art') ? 0 : copyArt(furniture.catalog);
  console.log(`furniture: ${Object.keys(furniture.catalog).length} classes (${thumbs} thumbnails); missing ${furniture.missing.join(', ') || 'none'}`);
  console.log(`textures: ${Object.keys(textures.walls).length} walls, ${Object.keys(textures.floors).length} floors, ${Object.keys(textures.ceilings).length} ceilings`);
  console.log(`cultivation: ${Object.keys(cultivation.classes).length} classes`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
