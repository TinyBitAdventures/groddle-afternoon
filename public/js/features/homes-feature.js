/**
 * Homes as a feature module (see js/feature-host.js): the house interior with
 * furniture, decorate mode and swatches; the home street with Cultivate mode,
 * yard expansion and the scenery around the house.
 *
 * Rules live in js/home-decor.js (furniture, swatches, interior expansion) and
 * js/home-cultivation.js (cultivation costs, placement, wear, yard expansion);
 * the source data in js/homes-catalog.js (build-homes.mjs). Ownership, travel
 * and mail stay in js/homes.js / js/mailbox.js and game.js.
 *
 * game.js asks this feature for the home scene through the `homeScene` query
 * (renderHomeScene): the scene supplies the background (parallax street or the
 * room shell), the world width, where the avatar arrives, the mailbox / door /
 * World Gate targets, and `enter()` spawns furniture or cultivations.
 *
 * Cultivations reuse the public-street systems through the engine:
 * gardens via engine.spawnGarden, rocks via engine.spawnMineRock (their state in
 * the street's own world slot), and Peat Bogs, Dirt Piles, Jellisac Mounds,
 * Barnacle Pods and Firefly Hives through the resource-nodes feature, fed this
 * street's cultivated population and exact placement points.
 *
 * Art: recovered CC0 furniture frames (assets/sprites/furniture), the CC0
 * Groddle / Firebog / Uralia decos for the street, procedural swatches
 * (js/home-looks.js) for the house shell.
 *
 * QA: ?autostart=1&fresh=1&homedemo=decorate (furnished room, Decorate open)
 *     ?autostart=1&fresh=1&homedemo=cultivate (lived-in yard, Cultivate open)
 *     add &homeautoplay=1 to run the scripted place / move / flip / swatch /
 *     pick up (decorate) or cultivate / expand / remove (cultivate) loop.
 * Canvas data: homeDecorPlaced, homeDecorStorage, homeDecorWall/Floor/Ceiling,
 * homeDecorSegments, homeMode, homeCultivations, homeYard, homeAutoplay.
 */

import { ensureItem, ITEM_CATALOG } from '../inventory.js?v=catalog-unified-3';
import {
  CULTIVATION_CLASSES,
  FURNITURE_CATALOG,
  FURNITURE_STORE,
} from '../homes-catalog.js?v=homes-catalog-1';
import {
  INTERIOR,
  SEGMENT_W,
  arrangeStarterRoom,
  createHomeDecorState,
  displayDeposit,
  displayWithdraw,
  expandInterior,
  flipFurniture,
  furnishDemoRoom,
  furnitureDef,
  furnitureScale,
  furnitureSize,
  grantStarterKit,
  interiorWidth,
  listPlaceable,
  listTextures,
  moveFurniture,
  normalizeHomeDecorState,
  pickUpFurniture,
  placeFurniture,
  placedItem,
  quoteInteriorExpansion,
  renderOrder,
  restackFurniture,
  setHomeTexture,
  snapPlacement,
  textureConfig,
} from '../home-decor.js?v=home-decor-1';
import {
  nearestFreeRx,
  FIREFLY_HIVE,
  addWear,
  createCultivationState,
  cultivate,
  cultivateDemoYard,
  cultivationChoices,
  cultivationDef,
  expandYard,
  footprint,
  hiveFireflyCount,
  homeStreetLayout,
  lifespanLeft,
  normalizeCultivationState,
  nudgeCultivation,
  placementCheck,
  quoteYardExpansion,
  removeCultivation,
  towerItem,
} from '../home-cultivation.js?v=home-cultivation-1';
import { TOWER_CHASSIS, TOWER_CONFIG, TOWER_GEO, TOWER_PROTO } from '../home-tower.js?v=home-tower-1';
import { towerApi } from './home-tower-feature.js?v=home-tower-1';
import { lookFor, paintTile, shade } from '../home-looks.js?v=home-looks-1';
import { resourceNodesFeature } from './resource-nodes-feature.js?v=resource-nodes-1';
import { patchesFeature } from './patches-feature.js?v=patches-1';
import { XP_FOR_LEVEL } from '../progression.js?v=progression-1';

export const HOMES_FEATURE_ID = 'homes';
const HOME_STREET_TSID = 'RH_HOME_EXT';
const VIEW_W = 960;
const VIEW_H = 540;
const DECO = 'assets/decos/groddle/';
const GROUND_Y = 620;
const FURNITURE_Z = 12;

// ---------------------------------------------------------------------------
// Pure helpers (tested in tests/homes-feature.test.js)
// ---------------------------------------------------------------------------

/** Mining's ROCK_CATALOG only knows the `_1` class of each rock family. */
export function rockClassFor(endClass) {
  return String(endClass || 'rock_metal_1').replace(/_\d+$/, '_1');
}

/** Resource-node classes and offsets a cultivation contributes, in order. */
export function cultivationNodes(item, now = Date.now()) {
  const def = cultivationDef(item?.protoClass);
  if (!def) return [];
  if (def.kind === 'node') {
    return def.nodes.map((node) => ({
      classTsid: node.classTsid === 'peat_1' ? item.endClass : node.classTsid,
      dx: node.dx,
      dy: node.dy,
    }));
  }
  if (def.kind === 'hive') {
    const n = hiveFireflyCount(item, now);
    const out = [];
    for (let i = 0; i < n; i += 1) {
      const a = (i / Math.max(1, n)) * Math.PI * 2 + 0.6;
      out.push({ classTsid: 'npc_firefly', dx: Math.round(Math.cos(a) * FIREFLY_HIVE.radius * 0.6), dy: -40 - (i % 3) * 22 });
    }
    return out;
  }
  return [];
}

/**
 * The resource-nodes keys (`<class>:<index>`) each cultivation owns, matching
 * resourcePlacementGroups / resourceSpawnPlan ordering.
 */
export function nodeKeyMap(items, now = Date.now()) {
  const counters = {};
  const out = new Map();
  for (const item of items) {
    const keys = [];
    for (const node of cultivationNodes(item, now)) {
      const cls = node.classTsid.startsWith('peat_') ? 'peat_1' : node.classTsid;
      const idx = counters[cls] || 0;
      counters[cls] = idx + 1;
      keys.push(`${cls}:${idx}`);
    }
    out.set(item.id, keys);
  }
  return out;
}

/** The patches-feature plot keys (`<patch|patch_dark>:<index>`) each Patch owns. */
export function soilKeyMap(items) {
  const counters = {};
  const out = new Map();
  for (const item of items) {
    if (cultivationDef(item.protoClass)?.kind !== 'patch') continue;
    const idx = counters[item.endClass] || 0;
    counters[item.endClass] = idx + 1;
    out.set(item.id, [`${item.endClass}:${idx}`]);
  }
  return out;
}

/** Re-key saved node states after a cultivation is removed. */
export function rekeyNodes(nodes = {}, before, after) {
  const out = {};
  for (const [id, newKeys] of after) {
    const oldKeys = before.get(id) || [];
    newKeys.forEach((key, i) => {
      if (oldKeys[i] && nodes[oldKeys[i]]) out[key] = nodes[oldKeys[i]];
    });
  }
  return out;
}

export function rockItems(items) {
  return items.filter((row) => cultivationDef(row.protoClass)?.kind === 'rock');
}

/** The Furniture Store (store 23) as a vendor profile for engine.openShop. */
export function furnitureStoreProfile() {
  return {
    key: 'furniture',
    id: 'street_spirit_furniture',
    storeId: FURNITURE_STORE.storeId,
    label: FURNITURE_STORE.label,
    badge: 'F',
    color: 0xa0703c,
    desc: 'Chairs, beds, sofas and doors for a house that is starting to feel like a home.',
    offers: FURNITURE_STORE.offers
      .filter((offer) => ITEM_CATALOG[offer.classTsid] || FURNITURE_CATALOG[offer.classTsid])
      .map((offer) => ({
        classTsid: offer.classTsid,
        label: FURNITURE_CATALOG[offer.classTsid]?.label || ITEM_CATALOG[offer.classTsid]?.label || offer.classTsid,
        buyPrice: offer.cost,
        sellPrice: Math.max(1, Math.floor(offer.cost * FURNITURE_STORE.buyMultiplier)),
      })),
  };
}

/** Register furniture classes in the shared pack catalog (source label/desc/cost, stack 1). */
export function ensureFurnitureItems() {
  for (const def of Object.values(FURNITURE_CATALOG)) {
    ensureItem(def.classTsid, {
      label: def.label,
      desc: def.desc || `${def.label} for your house.`,
      baseCost: def.baseCost,
      stackMax: 1,
      donatable: false,
    });
  }
  ensureItem('wall_segment', { label: 'Wall Segment', desc: 'A section of wall, ready to make a house a little roomier.' });
}

// ---------------------------------------------------------------------------
// Module state
// ---------------------------------------------------------------------------

let houseDecor = createHomeDecorState();
/** One decor slice per Tower floor; furniture storage is shared with the house (one furniture bag). */
let towerDecor = [];
/** The decor being shown and edited: the house, or the Tower floor you stand on. */
let decor = houseDecor;
let cult = createCultivationState();
let mode = null; // 'decorate' | 'cultivate' | null
let tab = 'furniture';
let placing = null; // { kind: 'furniture'|'cultivation', classTsid|protoClass, moveId? }
let selected = null; // { kind, id }
let scene = null; // live scene context while a home room is shown
let pointer = { x: 0, y: 0, inside: false };
let lastNodeCheck = 0;
let demoDone = false;
let autoplay = null;
let ui = null;

function publish(engine) {
  if (!engine) return;
  engine.setData('homeMode', mode || '');
  engine.setData('homeDecorPlaced', decor.placed.length);
  engine.setData('homeDecorStorage', Object.values(decor.storage).reduce((a, b) => a + b, 0));
  engine.setData('homeDecorWall', decor.wall);
  engine.setData('homeDecorFloor', decor.floor);
  engine.setData('homeDecorCeiling', decor.ceiling);
  engine.setData('homeDecorSegments', decor.wallSegments);
  engine.setData('homeDecorClasses', [...new Set(decor.placed.map((p) => p.classTsid))].length);
  engine.setData('homeCultivations', cult.items.map((row) => `${row.protoClass.replace('proto_', '')}@${row.rx}`).join(','));
  engine.setData('homeYard', `${cult.yardLeft},${cult.yardRight}`);
  engine.setData('homeSelected', selected ? `${selected.kind}:${selected.id}` : '');
  engine.setData('homePlacing', placing ? placing.classTsid || placing.protoClass || '' : '');
}

// ---------------------------------------------------------------------------
// Tower floors (js/home-tower.js, features/home-tower-feature.js)
// ---------------------------------------------------------------------------

/** A Tower floor's decor: config_base.js towers start textures, the 6 wall segments of tower.js. */
function towerFloorDecor(index) {
  while (towerDecor.length <= index) {
    towerDecor.push(createHomeDecorState({
      wall: TOWER_CONFIG.START_TEXTURE_WALL,
      floor: TOWER_CONFIG.START_TEXTURE_FLOOR,
      ceiling: TOWER_CONFIG.START_TEXTURE_CEILING,
      wallSegments: TOWER_GEO.wallSegments,
      starterKit: true,
    }));
  }
  const slice = towerDecor[index];
  slice.storage = houseDecor.storage;
  slice.wallSegments = TOWER_GEO.wallSegments;
  return slice;
}

/** The unfinished floor while a new one is going up (not decoratable, never saved). */
function constructionDecor() {
  return createHomeDecorState({ wall: 'grey_unfinished', floor: 'starter_crappy', ceiling: 'starter_crappy_ceiling', wallSegments: TOWER_GEO.wallSegments, starterKit: true });
}

function inTower() {
  return scene?.tower != null;
}

/** Bridge the Tower feature uses onto the cultivation state (it never imports this file). */
const towerBridge = {
  towerItem: () => towerItem(cult),
  towerWorldX() {
    const item = towerItem(cult);
    return item ? cultivationWorldX(item) : null;
  },
  markBuilt() {
    const item = towerItem(cult);
    if (item) item.endClass = TOWER_CHASSIS;
  },
  /** QA: put a Tower in the yard (proto or built) at the first free spot right of the house. */
  seedTower(built = false) {
    if (towerItem(cult)) return towerItem(cult);
    cult.yardRight = Math.max(cult.yardRight, 2);
    const rich = { level: 60, imagination: 1e9 };
    const rx = nearestFreeRx(cult, TOWER_PROTO, 640);
    const res = rx == null ? null : cultivate(cult, rich, TOWER_PROTO, rx, { now: Date.now() });
    if (res?.ok && built) res.item.endClass = TOWER_CHASSIS;
    return res?.item || null;
  },
  /** QA autoplay: cultivate the Tower with the player's own level and imagination. */
  cultivateTower(engine) {
    const rx = nearestFreeRx(cult, TOWER_PROTO, 640);
    if (rx == null) return { ok: false, reason: 'no_room' };
    beginCultivate(engine, TOWER_PROTO, { confirmed: true });
    return placeAtPointer(engine, { x: homeStreetLayout(cult).houseX + rx, y: GROUND_Y });
  },
  removeTower(engine) {
    const item = towerItem(cult);
    if (!item) return false;
    return towerApi.requestRemove(engine, item, () => {
      uncultivate(engine, item.id);
      engine.refreshHomeScene?.();
    });
  },
};

// ---------------------------------------------------------------------------
// Scene: the house interior
// ---------------------------------------------------------------------------

const textureCache = new Map();
function tileTexture(PIXI, kind, key) {
  const id = `${kind}:${key}`;
  if (!textureCache.has(id)) textureCache.set(id, PIXI.Texture.from(paintTile(kind, key, 256)));
  return textureCache.get(id);
}

function drawRoomShell(PIXI, container, width) {
  container.removeChildren().forEach((child) => child.destroy({ children: true }));
  const { floorY, wallTop, ceilingTop, endCapW } = INTERIOR;
  const wallLook = lookFor('wall', decor.wall);
  const floorLook = lookFor('floor', decor.floor);
  const bottom = floorY + 220;

  // The house's outer timber wall beyond both end caps: the camera keeps the
  // avatar clear of the right-hand rail, which can reveal a little past the
  // room's end, so that edge reads as the house rather than open sky.
  const outside = new PIXI.Graphics();
  const OUTSIDE_W = 640;
  for (const [x0, x1] of [[-OUTSIDE_W, 0], [width, width + OUTSIDE_W]]) {
    outside.rect(x0, ceilingTop - 200, x1 - x0, bottom - ceilingTop + 400).fill(0x3a2a1f);
    for (let x = x0; x < x1; x += 46) {
      outside.rect(x, ceilingTop - 200, 4, bottom - ceilingTop + 400).fill(0x2c1f17);
      outside.rect(x + 4, ceilingTop - 200, 3, bottom - ceilingTop + 400).fill({ color: 0x4a3627, alpha: 0.6 });
    }
  }
  container.addChild(outside);

  // Ceiling band
  const ceil = new PIXI.TilingSprite(tileTexture(PIXI, 'ceiling', decor.ceiling), width, wallTop - ceilingTop + 120);
  ceil.y = ceilingTop - 120;
  ceil.tileScale.set(0.6, 0.6);
  container.addChild(ceil);

  // Wall
  const wall = new PIXI.TilingSprite(tileTexture(PIXI, 'wall', decor.wall), width, floorY - wallTop);
  wall.y = wallTop;
  wall.tileScale.set(0.75, 0.75);
  container.addChild(wall);

  const g = new PIXI.Graphics();
  // Wainscoting / pillars for the "with Molding" and "with Pillars" swatches
  if (wallLook.wainscot) {
    const top = floorY - 112;
    g.setFillStyle(PIXI.utils.string2hex(wallLook.wainscot)).rect(0, top, width, floorY - top).fill();
    for (let x = endCapW + 18; x < width - endCapW - 60; x += 110) {
      g.setStrokeStyle({ width: 2, color: PIXI.utils.string2hex(shade(wallLook.wainscot, -0.25)), alpha: 0.7 });
      g.roundRect(x, top + 16, 88, floorY - top - 40, 3).stroke();
    }
    g.setFillStyle(PIXI.utils.string2hex(shade(wallLook.wainscot, 0.25))).rect(0, top - 6, width, 8).fill();
  }
  if (wallLook.pillars) {
    const c = PIXI.utils.string2hex(wallLook.pillars);
    for (let x = SEGMENT_W; x < width - 20; x += SEGMENT_W) {
      g.rect(x - 14, wallTop, 28, floorY - wallTop).fill(c);
      g.rect(x - 14, wallTop, 6, floorY - wallTop).fill({ color: 0xffffff, alpha: 0.22 });
      g.setFillStyle(PIXI.utils.string2hex(shade(wallLook.pillars, 0.2))).rect(x - 20, wallTop, 40, 12).fill();
    }
  }
  // Crown molding under the ceiling, and its soft shadow on the wall
  g.rect(0, wallTop, width, 26).fill({ color: 0x000000, alpha: 0.12 });
  g.rect(0, wallTop + 26, width, 30).fill({ color: 0x000000, alpha: 0.06 });
  g.rect(0, wallTop - 10, width, 12).fill(0xf4ecdc);
  g.rect(0, wallTop + 1, width, 4).fill(0xd9cbb0);
  container.addChild(g);

  // Floor: perspective band with a darker front lip
  const deck = 46;
  const floor = new PIXI.TilingSprite(tileTexture(PIXI, 'floor', decor.floor), width, deck);
  floor.y = floorY;
  floor.tileScale.set(0.7, 0.3);
  container.addChild(floor);
  const fg = new PIXI.Graphics();
  // Depth: the floor darkens toward the wall and brightens toward the viewer.
  for (let i = 0; i < 5; i += 1) fg.rect(0, floorY + i * 4, width, 4).fill({ color: 0x000000, alpha: 0.14 - i * 0.025 });
  fg.rect(0, floorY + deck - 14, width, 14).fill({ color: 0xffffff, alpha: 0.07 });
  // The floor's front edge and the house's timber cross-section beneath it.
  const edge = PIXI.utils.string2hex(shade(floorLook.base || '#8a6a4a', 0.12));
  const beam = PIXI.utils.string2hex(shade('#6b4a2f', -0.15));
  fg.rect(0, floorY + deck, width, 9).fill(edge);
  fg.rect(0, floorY + deck + 9, width, bottom - floorY - deck - 9).fill(beam);
  fg.rect(0, floorY + deck + 9, width, 5).fill({ color: 0x000000, alpha: 0.25 });
  for (let x = 40; x < width; x += 160) {
    fg.rect(x, floorY + deck + 14, 54, 30).fill({ color: 0x000000, alpha: 0.2 });
    fg.rect(x, floorY + deck + 14, 54, 4).fill({ color: 0xffffff, alpha: 0.05 });
  }
  // Baseboard
  fg.rect(0, floorY - 18, width, 18).fill(0xf1e7d6);
  fg.rect(0, floorY - 4, width, 4).fill(0xd2c1a3);
  container.addChild(fg);

  // End caps: the side walls, seen edge-on
  const caps = new PIXI.Graphics();
  const capColor = PIXI.utils.string2hex(shade(wallLook.base || '#c9c4ba', -0.32));
  for (const [x0, dir] of [[0, 1], [width, -1]]) {
    caps.poly([x0, ceilingTop - 120, x0 + dir * endCapW, wallTop - 10, x0 + dir * endCapW, floorY, x0, floorY + 84]).fill(capColor);
    caps.poly([x0 + dir * (endCapW - 8), wallTop - 10, x0 + dir * endCapW, wallTop - 10, x0 + dir * endCapW, floorY, x0 + dir * (endCapW - 8), floorY + 4]);
    caps.fill({ color: 0x000000, alpha: 0.18 });
  }
  container.addChild(caps);

  // Warm light: a gentle vignette plus glow pools under every lamp
  const light = new PIXI.Container();
  const glow = glowTexture(PIXI);
  const pool = (x, y, rx, ry, alpha) => {
    const spr = new PIXI.Sprite(glow);
    spr.anchor.set(0.5);
    spr.x = x;
    spr.y = y;
    spr.width = rx * 2;
    spr.height = ry * 2;
    spr.alpha = alpha;
    spr.blendMode = PIXI.BLEND_MODES.ADD;
    light.addChild(spr);
  };
  for (const item of decor.placed) {
    if (!/lamp/.test(item.classTsid)) continue;
    const { w, h } = furnitureSize(item.classTsid);
    if (item.slot === 'ceiling') {
      pool(item.x, item.y + h + 30, w * 1.5, 90, 0.32);
      pool(item.x, floorY + 12, w * 1.6, 16, 0.4);
    } else {
      const y0 = item.slot === 'wall' ? item.y - h * 0.7 : item.y - h * 0.82;
      pool(item.x, y0, w * 1.4 + 46, h * 0.5 + 40, 0.38);
    }
  }
  container.addChild(light);
}

let glowTex = null;
function glowTexture(PIXI) {
  if (glowTex) return glowTex;
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,226,160,0.55)');
  grad.addColorStop(0.45, 'rgba(255,214,140,0.22)');
  grad.addColorStop(1, 'rgba(255,210,130,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);
  glowTex = PIXI.Texture.from(canvas);
  return glowTex;
}

function interiorBackground(engine) {
  const { PIXI } = engine;
  const width = interiorWidth(decor);
  const root = new PIXI.Container();
  const shell = new PIXI.Container();
  root.addChild(shell);
  drawRoomShell(PIXI, shell, width);
  root.shell = shell;
  root.worldH = GROUND_Y + 102;
  root.platformsScreen = [{ id: 'home-floor', x1: 0, y1: GROUND_Y, x2: width, y2: GROUND_Y, pc_perm: 1 }];
  root.redraw = () => drawRoomShell(PIXI, shell, interiorWidth(decor));
  return root;
}

function interiorDoorX() {
  return interiorWidth(decor) - INTERIOR.endCapW - 70;
}

function spawnInteriorTargets(engine) {
  const { PIXI } = engine;
  const door = PIXI.Sprite.from(`${DECO}door_asset_apartment_room_interior.png`);
  door.anchor.set(0.5, 1);
  door.scale.set(0.45);
  door.x = interiorDoorX();
  door.y = GROUND_Y - 2;
  door.zIndex = 8;
  engine.entityLayer.addChild(door);
  const frame = new PIXI.Graphics();
  frame.rect(-46, -246, 92, 10).rect(-46, -246, 8, 246).rect(38, -246, 8, 246).fill(0x6b4a2f);
  frame.x = door.x;
  frame.y = GROUND_Y;
  frame.zIndex = 7;
  engine.entityLayer.addChild(frame);
  const target = engine.register({
    classId: 'home_door',
    label: 'Front Door',
    subtitle: 'Back to your home street and mailbox',
    sprite: door,
    state: { room: 'interior' },
  });
  return { door: target };
}

// ---------------------------------------------------------------------------
// Scene: the home street
// ---------------------------------------------------------------------------

/**
 * Street compositions in the source regions' own deco vocabulary
 * (Groddle Meadow, Kalavana for Firebog, Uralia), arranged around the lot.
 * Each layer: parallax factor f (0 = fixed to the sky, 1 = world), and decos
 * repeated every `every` px with deterministic jitter.
 */
const STREET_STYLES = {
  meadow: {
    sky: [0xa6effa, 0xeafcfb],
    field: 0x77ad43,
    fieldDark: 0x5f9636,
    soil: 'crosssection_short_3',
    soilColor: 0x6a4329,
    house: { path: 'door_asset_house_large_01', w: 830, h: 668, scale: 0.48, doorX: 0.52, signX: 0.06 },
    layers: [
      { f: 0.08, items: [{ s: 'mountain_blue_1', w: 1648, h: 550, scale: 0.42, y: 470, every: 760, jitter: 120 }] },
      { f: 0.16, items: [{ s: 'pinehills_distant_1', w: 2038, h: 668, scale: 0.34, y: 500, every: 900, jitter: 200 }] },
      { f: 0.3, items: [{ s: 'pinehills_1', w: 1700, h: 540, scale: 0.36, y: 520, every: 1100, jitter: 260 }] },
      {
        f: 0.5,
        items: [
          { s: 'transition_hill_1', w: 2146, h: 320, scale: 0.5, y: 548, every: 1000, jitter: 120 },
          { s: 'tree_coniferous_2', w: 740, h: 1322, scale: 0.2, y: 548, every: 520, jitter: 160, offset: 140 },
          { s: 'tree_deciduous3', w: 864, h: 1170, scale: 0.21, y: 552, every: 780, jitter: 140, offset: 380 },
        ],
      },
      {
        f: 0.75,
        items: [
          { s: 'evenground_horizon', w: 2432, h: 218, scale: 0.55, y: 590, every: 1300, jitter: 0 },
          { s: 'bush_3', w: 566, h: 200, scale: 0.42, y: 596, every: 640, jitter: 200, offset: 260 },
          { s: 'tree_coniferous_1', w: 530, h: 1294, scale: 0.24, y: 594, every: 1150, jitter: 220, offset: 700 },
        ],
      },
    ],
    near: [
      { s: 'groddle_grass_2', w: 162, h: 130, scale: 0.55, every: 300, jitter: 120 },
      { s: 'wildflowers_bunch_2', w: 382, h: 50, scale: 0.6, every: 420, jitter: 160, offset: 120 },
      { s: 'groddle_grass_1', w: 212, h: 102, scale: 0.5, every: 520, jitter: 160, offset: 60 },
    ],
    trim: ['flower_bush_5', 'bush_1', 'groddle_flower_2'],
  },
  firebog: {
    sky: [0xf0d98a, 0x9a5a3a],
    field: 0x6a4a34,
    fieldDark: 0x523726,
    soil: null,
    soilColor: 0x4c3022,
    house: { path: 'door_asset_house_medium_03', w: 764, h: 586, scale: 0.58, doorX: 0.55, signX: 0.06 },
    layers: [
      { f: 0.1, items: [{ s: 'background_horizon_bottletrees_1', w: 1896, h: 236, scale: 0.7, y: 500, every: 1300, jitter: 0 }] },
      { f: 0.25, items: [{ s: 'background_brown_bump3', w: 2144, h: 176, scale: 0.6, y: 548, every: 1280, jitter: 0 }] },
      {
        f: 0.45,
        items: [
          { s: 'treetop_noflowers_2', w: 1694, h: 824, scale: 0.2, y: 420, every: 900, jitter: 180, offset: 200 },
          { s: 'bottletree_body1', w: 1302, h: 832, scale: 0.16, y: 566, every: 900, jitter: 180, offset: 200 },
          { s: 'background_bottletree_silhouette', w: 174, h: 234, scale: 0.8, y: 560, every: 430, jitter: 120, offset: 60 },
        ],
      },
      {
        f: 0.75,
        items: [
          { s: 'background_brown_bump1', w: 2988, h: 172, scale: 0.55, y: 600, every: 1600, jitter: 0 },
          { s: 'mushrooms', w: 136, h: 232, scale: 0.42, y: 600, every: 560, jitter: 200, offset: 300 },
        ],
      },
    ],
    near: [
      { s: 'grass_solid', w: 124, h: 106, scale: 0.6, every: 260, jitter: 100 },
      { s: 'underground_plant_1', w: 78, h: 106, scale: 0.6, every: 380, jitter: 140, offset: 90 },
      { s: 'ground_spots_dark_1', w: 628, h: 70, scale: 0.5, every: 700, jitter: 200, offset: 30, below: 18 },
    ],
    trim: ['mushrooms', 'grass_solid', 'underground_plant_1'],
  },
  uralia: {
    sky: [0x8fd6cf, 0xd8eedd],
    field: 0x5e8f8a,
    fieldDark: 0x4b7672,
    soil: null,
    soilColor: 0x40525a,
    house: { path: 'door_asset_house_large_05', w: 830, h: 668, scale: 0.48, doorX: 0.52, signX: 0.06 },
    layers: [
      { f: 0.06, items: [{ s: 'zutto_cloud_1', w: 500, h: 136, scale: 0.6, y: 360, every: 700, jitter: 260 }] },
      { f: 0.14, items: [{ s: 'bck_hill_9', w: 948, h: 612, scale: 0.42, y: 540, every: 620, jitter: 160 }] },
      {
        f: 0.32,
        items: [
          { s: 'hill_11', w: 992, h: 280, scale: 0.55, y: 560, every: 760, jitter: 140 },
          { s: 'bck_tree_2', w: 148, h: 190, scale: 0.8, y: 560, every: 330, jitter: 120, offset: 100 },
        ],
      },
      {
        f: 0.6,
        items: [
          { s: 'zutto_hill_1', w: 1380, h: 290, scale: 0.5, y: 594, every: 1100, jitter: 0 },
          { s: 'tree_11', w: 332, h: 570, scale: 0.42, y: 596, every: 780, jitter: 220, offset: 320 },
          { s: 'tree_7', w: 256, h: 418, scale: 0.46, y: 596, every: 980, jitter: 200, offset: 700 },
        ],
      },
    ],
    near: [
      { s: 'plant_grass_2', w: 50, h: 96, scale: 0.7, every: 220, jitter: 90 },
      { s: 'purple_mushroom_3', w: 168, h: 140, scale: 0.4, every: 640, jitter: 200, offset: 200 },
      { s: 'plant_fern_2', w: 72, h: 144, scale: 0.55, every: 420, jitter: 140, offset: 80 },
    ],
    trim: ['purple_mushroom_3', 'zutto_plant_2', 'plant_fern_2'],
  },
};

function hash01(seed) {
  let s = 2166136261;
  for (const ch of String(seed)) s = Math.imul(s ^ ch.charCodeAt(0), 16777619) >>> 0;
  return (s % 10000) / 10000;
}

function decoSprite(PIXI, item, x, y, flip = false) {
  const spr = PIXI.Sprite.from(`${DECO}${item.s}.png`);
  spr.anchor.set(0.5, 1);
  spr.width = item.w * item.scale;
  spr.height = item.h * item.scale;
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

function streetBackground(engine, styleId) {
  const { PIXI } = engine;
  const style = STREET_STYLES[styleId] || STREET_STYLES.meadow;
  const layout = homeStreetLayout(cult);
  const width = layout.width;
  const root = new PIXI.Container();
  root.sortableChildren = true;
  const sky = new PIXI.Sprite(gradientTexture(PIXI, style.sky[0], style.sky[1]));
  sky.zIndex = -100;
  root.addChild(sky);

  const parallax = [];
  style.layers.forEach((layer, li) => {
    const lc = new PIXI.Container();
    lc.zIndex = -90 + li;
    // A layer spans what the camera can reveal at its parallax rate.
    const span = width * layer.f + VIEW_W * (1 - layer.f) + 400;
    for (const item of layer.items) {
      let i = 0;
      for (let x = (item.offset || 0) - 200; x < span; x += item.every) {
        const jx = item.jitter ? (hash01(`${styleId}:${li}:${item.s}:${i}`) - 0.5) * item.jitter * 2 : 0;
        lc.addChild(decoSprite(PIXI, item, x + jx, item.y, hash01(`${item.s}:${i}:flip`) > 0.5));
        i += 1;
      }
    }
    lc.parallaxF = layer.f;
    root.addChild(lc);
    parallax.push(lc);
  });

  // The walkable field and the soil cross-section below it.
  const field = new PIXI.Graphics();
  field.zIndex = -40;
  field.rect(-50, 586, width + 100, GROUND_Y - 586 + 40).fill(style.field);
  field.rect(-50, GROUND_Y + 10, width + 100, 30).fill({ color: style.fieldDark, alpha: 0.5 });
  root.addChild(field);
  const soilFill = new PIXI.Graphics();
  soilFill.zIndex = -39.5;
  soilFill.rect(-50, GROUND_Y + 30, width + 100, 240).fill(style.soilColor || 0x5c3b25);
  root.addChild(soilFill);
  const soilW = 1038 * 0.6;
  if (!style.soil) {
    soilFill.rect(-50, GROUND_Y + 30, width + 100, 6).fill({ color: 0x000000, alpha: 0.22 });
    for (let x = 30; x < width; x += 140) {
      const r = 6 + hash01(`pebble:${x}`) * 10;
      soilFill.ellipse(x + hash01(`p2:${x}`) * 60, GROUND_Y + 70 + hash01(`p3:${x}`) * 50, r * 1.6, r).fill({ color: 0x000000, alpha: 0.14 });
    }
  }
  for (let x = -40; style.soil && x < width + soilW; x += soilW - 2) {
    const soil = PIXI.Sprite.from(`${DECO}${style.soil}.png`);
    soil.anchor.set(0, 0);
    soil.width = soilW;
    soil.height = 150;
    soil.x = x;
    soil.y = GROUND_Y + 26;
    soil.zIndex = -39;
    root.addChild(soil);
  }
  // Grass, flowers and plants along the yard, kept off the house lot.
  const near = new PIXI.Container();
  near.zIndex = -30;
  for (const item of style.near) {
    let i = 0;
    for (let x = item.offset || 0; x < width; x += item.every) {
      const jx = (hash01(`${styleId}:near:${item.s}:${i}`) - 0.5) * item.jitter * 2;
      const px = x + jx;
      i += 1;
      if (px > layout.lotLeft + 40 && px < layout.lotRight - 40) continue;
      near.addChild(decoSprite(PIXI, item, px, GROUND_Y + 22 + (item.below || 0), hash01(`${item.s}:${i}`) > 0.5));
    }
  }
  root.addChild(near);

  // The house, centred on its lot
  const h = style.house;
  const house = PIXI.Sprite.from(`${DECO}${h.path}.png`);
  house.anchor.set(0.5, 1);
  house.scale.set(h.scale);
  house.x = layout.houseX;
  house.y = GROUND_Y + 14;
  house.zIndex = -20;
  root.addChild(house);
  // A planted border in front of the house hides the deco's For Sale sign.
  const trim = new PIXI.Container();
  trim.zIndex = -19;
  const left = layout.houseX - (h.w * h.scale) / 2;
  const trimItems = {
    flower_bush_5: { w: 260, h: 180, scale: 0.44 },
    bush_1: { w: 208, h: 166, scale: 0.5 },
    groddle_flower_2: { w: 120, h: 110, scale: 0.6 },
    mushrooms: { w: 136, h: 232, scale: 0.38 },
    grass_solid: { w: 124, h: 106, scale: 0.7 },
    underground_plant_1: { w: 78, h: 106, scale: 0.7 },
    purple_mushroom_3: { w: 168, h: 140, scale: 0.5 },
    zutto_plant_2: { w: 202, h: 186, scale: 0.45 },
    plant_fern_2: { w: 72, h: 144, scale: 0.6 },
  };
  style.trim.forEach((name, i) => {
    const meta = trimItems[name];
    if (!meta) return;
    trim.addChild(decoSprite(PIXI, { s: name, ...meta }, left + h.w * h.scale * (h.signX + 0.05 + i * 0.07), GROUND_Y + 20, i % 2 === 1));
  });
  root.addChild(trim);

  root.worldH = GROUND_Y + 102;
  root.platformsScreen = [{ id: 'home-ground', x1: 0, y1: GROUND_Y, x2: width, y2: GROUND_Y, pc_perm: 1 }];
  root.updateParallax = (camX, camY, vpW, vpH, skyH = vpH) => {
    sky.x = camX;
    sky.y = camY;
    sky.width = vpW;
    sky.height = skyH;
    for (const lc of parallax) lc.x = camX * (1 - lc.parallaxF);
  };
  root.houseDoorX = layout.houseX + (h.doorX - 0.5) * h.w * h.scale;
  root.houseSignX = left + h.w * h.scale * (h.signX + 0.02);
  return root;
}

function makeGateSprite(engine) {
  const { PIXI } = engine;
  const marker = new PIXI.Container();
  const post = new PIXI.Graphics();
  post.roundRect(-6, -150, 12, 150, 5).fill(0x6e4a32);
  post.roundRect(-70, -150, 140, 44, 10).fill(0x8d6444);
  post.roundRect(-64, -145, 128, 34, 8).fill(0xf6e7b6);
  marker.addChild(post);
  const label = new PIXI.Text('World Gate', {
    fontFamily: 'Trebuchet MS, sans-serif',
    fontSize: 15,
    fontWeight: '700',
    fill: 0x5b3d2b,
  });
  label.anchor.set(0.5);
  label.y = -128;
  marker.addChild(label);
  const glow = new PIXI.Graphics();
  glow.ellipse(0, -6, 46, 10).fill({ color: 0xbfe9ff, alpha: 0.35 });
  marker.addChildAt(glow, 0);
  return marker;
}

function spawnStreetTargets(engine) {
  const { PIXI } = engine;
  const layout = homeStreetLayout(cult);
  const bg = scene?.background;
  const unread = Number(engine.homeContext?.().unread) || 0;
  const mailbox = PIXI.Sprite.from(unread > 0
    ? 'assets/sprites/mailbox/npc_mailbox_variant_mailboxRight_x1_has_mail_idle_png_1354832230.png'
    : 'assets/sprites/mailbox/npc_mailbox_variant_mailboxRight_x1_idle_png_1354832227.png');
  mailbox.anchor.set(0.5, 1);
  mailbox.x = Math.round(bg?.houseSignX ?? layout.houseX - 260);
  mailbox.y = GROUND_Y + 4;
  mailbox.zIndex = 30;
  engine.entityLayer.addChild(mailbox);
  const mailTarget = engine.register({
    classId: 'npc_mailbox',
    label: 'Mailbox (1)',
    subtitle: unread ? `${unread} unread message${unread === 1 ? '' : 's'}` : 'Your very own mail',
    sprite: mailbox,
    state: { unread },
  });
  // The house deco already paints its front door; this is its hit area.
  const doorX = bg?.houseDoorX ?? layout.houseX;
  const door = new PIXI.Graphics();
  door.rect(-46, -150, 92, 150).fill({ color: 0xffffff, alpha: 0.001 });
  door.x = doorX;
  door.y = GROUND_Y;
  door.zIndex = 9;
  engine.entityLayer.addChild(door);
  const doorTarget = engine.register({
    classId: 'home_door',
    label: 'Your House',
    subtitle: 'The indoor half of home',
    sprite: door,
    state: { room: 'street' },
  });
  const gate = makeGateSprite(engine);
  gate.x = layout.lotLeft + 40;
  gate.y = GROUND_Y + 2;
  gate.zIndex = 20;
  engine.entityLayer.addChild(gate);
  const ctx = engine.homeContext?.() || {};
  const gateTarget = engine.register({
    classId: 'home_return_marker',
    label: 'World Gate',
    subtitle: `Back to ${ctx.returnLabel || 'the world'}`,
    sprite: gate,
    state: { returnLabel: ctx.returnLabel || '' },
  });
  return { mailbox: mailTarget, door: doorTarget, gate: gateTarget };
}

// ---------------------------------------------------------------------------
// Furniture views
// ---------------------------------------------------------------------------

function furnitureView(PIXI, item) {
  const def = furnitureDef(item.classTsid);
  const s = furnitureScale(item.classTsid);
  const box = new PIXI.Container();
  const spr = PIXI.Sprite.from(def.art.path);
  spr.anchor.set(0.5, item.slot === 'ceiling' ? 0 : 1);
  spr.scale.set((item.facingRight ? 1 : -1) * s, s);
  box.addChild(spr);
  if (item.slot === 'ceiling') {
    const cord = new PIXI.Graphics();
    cord.rect(-1, -8, 2, 10).fill(0x5a4a3a);
    box.addChildAt(cord, 0);
  }
  if (item.slot === 'wall' || item.slot === 'floor') {
    const shadow = new PIXI.Graphics();
    const { w } = furnitureSize(item.classTsid);
    if (item.slot === 'floor' && !item.on) {
      shadow.ellipse(0, -2, w * 0.46, 7).fill({ color: 0x000000, alpha: 0.16 });
    }
    box.addChildAt(shadow, 0);
    if (item.slot === 'wall') {
      const silhouette = PIXI.Sprite.from(def.art.path);
      silhouette.anchor.set(0.5, 1);
      silhouette.scale.copyFrom(spr.scale);
      silhouette.tint = 0x000000;
      silhouette.alpha = 0.16;
      silhouette.x = 4;
      silhouette.y = 6;
      box.addChildAt(silhouette, 0);
    }
  }
  if (item.display?.classTsid) {
    const icon = PIXI.Sprite.from(ITEM_CATALOG[item.display.classTsid]?.icon || `assets/sprites/icons/${item.display.classTsid}.png`);
    icon.anchor.set(0.5);
    icon.width = 34;
    icon.height = 34;
    icon.y = -35;
    box.addChild(icon);
    const badge = new PIXI.Text(String(item.display.count), {
      fontFamily: 'Trebuchet MS, sans-serif',
      fontSize: 11,
      fontWeight: '700',
      fill: 0xffffff,
      stroke: 0x3b2a1f,
      strokeThickness: 3,
    });
    badge.anchor.set(1, 1);
    badge.x = 28;
    badge.y = -6;
    box.addChild(badge);
  }
  box.x = item.x;
  box.y = item.y;
  box.furnitureId = item.id;
  return box;
}

function renderFurniture(engine) {
  if (!scene?.furnitureLayer) return;
  const { PIXI } = engine;
  const layer = scene.furnitureLayer;
  layer.removeChildren().forEach((child) => child.destroy({ children: true }));
  renderOrder(decor).forEach((item, i) => {
    const view = furnitureView(PIXI, item);
    view.zIndex = i;
    layer.addChild(view);
  });
  if (selected?.kind === 'furniture') {
    const item = placedItem(decor, selected.id);
    if (item) layer.addChild(selectionOutline(PIXI, furnitureBounds(item)));
    else selected = null;
  }
  scene.background?.redraw?.();
  publish(engine);
}

function furnitureBounds(item) {
  const { w, h } = furnitureSize(item.classTsid);
  const top = item.slot === 'ceiling' ? item.y : item.y - h;
  return { x: item.x - w / 2, y: top, w, h };
}

function selectionOutline(PIXI, b) {
  const g = new PIXI.Graphics();
  g.roundRect(b.x - 5, b.y - 5, b.w + 10, b.h + 10, 8).stroke({ width: 2, color: 0xffd76a, alpha: 1 });
  g.roundRect(b.x - 5, b.y - 5, b.w + 10, b.h + 10, 8).fill({ color: 0xffd76a, alpha: 0.08 });
  g.zIndex = 9999;
  return g;
}

// ---------------------------------------------------------------------------
// Cultivation views and delegated spawns
// ---------------------------------------------------------------------------

const POD_ART = {
  barnacle_pod: { w: 162, h: 177 },
  firefly_hive: { w: 161, h: 107 },
  jellisac_mound: { w: 228, h: 145 },
};

function cultivationWorldX(item) {
  return homeStreetLayout(cult).houseX + item.rx;
}

function shimEngine(engine, population, points) {
  return Object.create(engine, {
    population: { value: population },
    placement: { value: (key) => points[key] || [] },
  });
}

function spawnCultivations(engine) {
  const { PIXI } = engine;
  const now = Date.now();
  const world = engine.streetWorld ? engine.streetWorld(HOME_STREET_TSID) : null;
  // Rocks: the street's own rock slots, in cultivation order.
  const rocks = rockItems(cult.items);
  rocks.forEach((item, index) => {
    engine.spawnMineRock?.(rockClassFor(item.endClass), cultivationWorldX(item), GROUND_Y, index);
  });
  if (world) world.rocks.length = rocks.length;
  // Gardens: their plots live with the cultivation.
  for (const item of cult.items) {
    const def = cultivationDef(item.protoClass);
    if (def.kind !== 'garden' || !engine.spawnGarden) continue;
    const target = engine.spawnGarden({
      x: cultivationWorldX(item),
      y: GROUND_Y + 2,
      gardenType: def.gardenType,
      cols: def.cols,
      rows: def.rows,
      label: def.label.replace(/^S\. |^M\. |^L\. /, ''),
      garden: cult.gardens[item.id] || null,
      detached: true,
    });
    if (target?.state?.garden) cult.gardens[item.id] = target.state.garden;
  }
  // Pods, mounds and hives: their recovered art, then the resource nodes.
  for (const item of cult.items) {
    const def = cultivationDef(item.protoClass);
    if (!def.art) continue;
    const art = POD_ART[def.art];
    const spr = PIXI.Sprite.from(`assets/sprites/cultivation/${def.art}.png`);
    spr.anchor.set(0.5, 1);
    spr.x = cultivationWorldX(item);
    spr.y = GROUND_Y + 6;
    spr.zIndex = 14;
    spr.width = art.w;
    spr.height = art.h;
    engine.entityLayer.addChild(spr);
  }
  const population = { resourceNodeClasses: [] };
  const points = {};
  for (const item of cult.items) {
    for (const node of cultivationNodes(item, now)) {
      const cls = node.classTsid.startsWith('peat_') ? 'peat_1' : node.classTsid;
      population.resourceNodeClasses.push(node.classTsid);
      (points[`resource:${cls}`] ||= []).push({ x: cultivationWorldX(item) + node.dx, y: GROUND_Y + node.dy });
    }
  }
  if (population.resourceNodeClasses.length) {
    resourceNodesFeature.onStreetEnter({ tsid: HOME_STREET_TSID }, shimEngine(engine, population, points));
  }
  // Patches: the patches feature runs dig / tend / plant / seedling / tree.
  const soilCounts = {};
  const soilPoints = {};
  for (const item of cult.items) {
    if (cultivationDef(item.protoClass).kind !== 'patch') continue;
    soilCounts[item.endClass] = (soilCounts[item.endClass] || 0) + 1;
    (soilPoints[`soil:${item.endClass}`] ||= []).push({ x: cultivationWorldX(item), y: GROUND_Y });
  }
  if (Object.keys(soilCounts).length) {
    patchesFeature.onStreetEnter({ tsid: HOME_STREET_TSID, soilCounts }, shimEngine(engine, engine.population, soilPoints));
  }
  // The Tower (proto or built) and the Magic Rock that asks for one.
  const tower = towerItem(cult);
  const layout = homeStreetLayout(cult);
  towerApi.spawnStreet(engine, {
    item: tower,
    x: tower ? cultivationWorldX(tower) : null,
    groundY: GROUND_Y,
    rockX: layout.houseX + 200,
  });
  // Lifespan rings while cultivating.
  if (mode === 'cultivate') drawCultivationMarkers(engine);
}

function drawCultivationMarkers(engine) {
  const { PIXI } = engine;
  if (!scene) return;
  scene.markers?.destroy({ children: true });
  const g = new PIXI.Container();
  g.zIndex = 45;
  for (const item of cult.items) {
    const x = cultivationWorldX(item);
    const half = footprint(item.protoClass);
    const sel = selected?.kind === 'cultivation' && selected.id === item.id;
    const pad = new PIXI.Graphics();
    pad.roundRect(x - half, GROUND_Y - 4, half * 2, 14, 7).fill({ color: sel ? 0xffd76a : 0xffffff, alpha: sel ? 0.28 : 0.14 });
    pad.roundRect(x - half, GROUND_Y - 4, half * 2, 14, 7).stroke({ width: 2, color: sel ? 0xffd76a : 0xffffff, alpha: sel ? 0.95 : 0.4 });
    if (cultivationDef(item.protoClass)?.kind === 'tower') {
      g.addChild(pad);
      continue;
    }
    // Lifespan bar (buildConfig lifespan.percentage_left)
    const left = lifespanLeft(item);
    pad.roundRect(x - 30, GROUND_Y + 16, 60, 6, 3).fill({ color: 0x2b2a33, alpha: 0.55 });
    pad.roundRect(x - 30, GROUND_Y + 16, 60 * left, 6, 3).fill(left > 0.3 ? 0x7cc35a : 0xe0a84a);
    g.addChild(pad);
  }
  engine.entityLayer.addChild(g);
  scene.markers = g;
}

function cultivationAt(x) {
  let best = null;
  for (const item of cult.items) {
    const d = Math.abs(cultivationWorldX(item) - x);
    if (d <= footprint(item.protoClass) && (!best || d < best.d)) best = { item, d };
  }
  return best?.item || null;
}

function nearestCultivation(engine, kinds) {
  const px = engine.player?.x ?? 0;
  let best = null;
  for (const item of cult.items) {
    if (!kinds.includes(cultivationDef(item.protoClass)?.kind)) continue;
    const d = Math.abs(cultivationWorldX(item) - px);
    if (!best || d < best.d) best = { item, d };
  }
  return best && best.d < 360 ? best.item : null;
}

/** Remove a cultivation and keep every other one's saved state on its own item. */
function uncultivate(engine, id, reason = 'removed') {
  const world = engine.streetWorld ? engine.streetWorld(HOME_STREET_TSID) : null;
  const slot = engine.streetSlot('resource-nodes', HOME_STREET_TSID);
  const now = Date.now();
  const soil = engine.streetSlot('patches', HOME_STREET_TSID);
  const beforeKeys = nodeKeyMap(cult.items, now);
  const beforeSoil = soilKeyMap(cult.items);
  const beforeRocks = rockItems(cult.items).map((row) => row.id);
  const result = removeCultivation(cult, id);
  if (!result.ok) return result;
  slot.nodes = rekeyNodes(slot.nodes || {}, beforeKeys, nodeKeyMap(cult.items, now));
  soil.plots = rekeyNodes(soil.plots || {}, beforeSoil, soilKeyMap(cult.items));
  if (world) {
    const oldRocks = world.rocks || [];
    world.rocks = rockItems(cult.items).map((row) => oldRocks[beforeRocks.indexOf(row.id)]).filter(Boolean);
  }
  if (selected?.kind === 'cultivation' && selected.id === Number(id)) selected = null;
  if (reason === 'worn') {
    engine.pushActivity(`Your ${result.label} wore out and crumbled back into the yard.`);
    engine.toast(`Your ${result.label} has worn out. Cultivate another any time.`, 3200);
  } else {
    engine.pushActivity(`You removed the ${result.label} from your yard.`);
  }
  engine.save();
  return result;
}

// ---------------------------------------------------------------------------
// UI
// ---------------------------------------------------------------------------

const CSS = `
.homes-bar{position:absolute;right:10px;top:48px;bottom:112px;z-index:40;width:min(270px,31%);display:flex;flex-direction:column;background:#fffdf7;border-radius:14px;box-shadow:0 10px 28px rgba(40,30,20,.24);border:1px solid rgba(90,70,40,.18);font-family:"Trebuchet MS","Segoe UI",system-ui,sans-serif;color:#2b2a33;overflow:hidden}
.homes-bar[hidden]{display:none}
.homes-bar header{display:flex;align-items:center;gap:8px;padding:9px 12px 7px;background:linear-gradient(180deg,#f7ecd6,#efe1c4);border-bottom:1px solid rgba(90,70,40,.15)}
.homes-bar header h3{margin:0;font-size:15px;flex:1}
.homes-bar header small{color:#7a6a55;font-weight:600}
.homes-bar .hb-close{border:none;background:transparent;font-size:18px;cursor:pointer;color:#6a5a45;line-height:1}
.homes-bar nav{display:flex;flex-wrap:wrap;gap:3px;padding:7px 8px 0}
.homes-bar nav button{border:1px solid rgba(90,70,40,.18);background:#f6efe2;border-radius:8px 8px 0 0;padding:4px 7px;font-size:11.5px;font-weight:700;color:#5b4a35;cursor:pointer}
.homes-bar nav button.on{background:#fff;color:#2b2a33;border-bottom-color:#fff}
.homes-bar .hb-body{flex:1;padding:9px 9px 10px;overflow:auto;border-top:1px solid rgba(90,70,40,.15);margin-top:-1px}
.homes-bar .hb-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(72px,1fr));gap:6px}
.homes-bar .hb-tile{position:relative;display:flex;flex-direction:column;align-items:center;gap:3px;border:1px solid rgba(90,70,40,.16);background:#fff;border-radius:10px;padding:6px 4px 5px;cursor:pointer;font-size:11px;line-height:1.15;text-align:center;color:#3b3328}
.homes-bar .hb-tile:hover{border-color:#e0a84a;box-shadow:0 2px 8px rgba(224,168,74,.25)}
.homes-bar .hb-tile.on{border-color:#d08a2a;background:#fff6e2}
.homes-bar .hb-tile[disabled]{opacity:.5;cursor:not-allowed}
.homes-bar .hb-tile img{width:44px;height:44px;object-fit:contain}
.homes-bar .hb-tile .hb-count{position:absolute;right:5px;top:4px;font-size:10px;font-weight:700;background:#5a8f4a;color:#fff;border-radius:8px;padding:0 5px}
.homes-bar .hb-swatch{width:58px;height:38px;border-radius:6px;border:1px solid rgba(0,0,0,.15);background-size:cover}
.homes-bar .hb-cost{font-weight:700;color:#7a4fb5}
.homes-bar .hb-row{display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin:0 0 8px}
.homes-bar .hb-row button,.homes-bar .hb-actions button{border:1px solid rgba(90,70,40,.2);background:#fff;border-radius:8px;padding:5px 9px;font-size:12px;font-weight:700;color:#4a3a28;cursor:pointer}
.homes-bar .hb-row button.primary,.homes-bar .hb-actions button.primary{background:#4a90c8;border-color:#4a90c8;color:#fff}
.homes-bar .hb-row button:disabled,.homes-bar .hb-actions button:disabled{opacity:.45;cursor:not-allowed}
.homes-bar .hb-note{font-size:12px;color:#6d6252;margin:0 0 8px}
.homes-bar .hb-sel{border:1px solid #f0d49a;background:#fff8e8;border-radius:10px;padding:7px 9px;margin:0 0 9px}
.homes-bar .hb-sel strong{display:block;font-size:13px}
.homes-bar .hb-sel p{margin:2px 0 6px;font-size:11.5px;color:#6d6252}
.homes-bar .hb-actions{display:flex;flex-wrap:wrap;gap:5px}
.homes-bar h4{margin:8px 0 5px;font-size:12px;color:#7a6a55;text-transform:uppercase;letter-spacing:.04em}
.homes-modes{position:absolute;left:50%;top:92px;transform:translateX(-50%);z-index:30;display:flex;gap:6px}
.homes-modes[hidden]{display:none}
.homes-modes button{border:none;border-radius:999px;padding:6px 14px;font-weight:700;font-size:12.5px;cursor:pointer;background:rgba(255,253,247,.94);color:#4a3a28;box-shadow:0 3px 10px rgba(40,30,20,.18)}
.homes-modes button.on{background:#e07a3d;color:#fff}
`;

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else if (v === true) node.setAttribute(k, '');
    else if (v !== false && v != null) node.setAttribute(k, v);
  }
  for (const child of [].concat(children)) if (child) node.append(child);
  return node;
}

function ensureUi(engine) {
  if (ui || typeof document === 'undefined') return ui;
  const root = document.getElementById('game-root');
  if (!root) return null;
  if (!document.getElementById('homes-feature-css')) {
    document.head.append(el('style', { id: 'homes-feature-css', text: CSS }));
  }
  const bar = el('section', { class: 'homes-bar', id: 'homes-bar', hidden: true, 'aria-label': 'Home building' });
  const modes = el('div', { class: 'homes-modes', id: 'homes-modes', hidden: true });
  root.append(bar, modes);
  ui = { root, bar, modes };
  return ui;
}

function swatchUrl(kind, key) {
  try {
    return paintTile(kind, key, 96).toDataURL();
  } catch {
    return '';
  }
}

function renderModes(engine) {
  if (!ensureUi(engine)) return;
  const ctx = engine.homeContext?.() || {};
  const atHome = Boolean(ctx.inHome && scene);
  ui.modes.hidden = !atHome || Boolean(mode) || Boolean(scene.construction);
  if (!atHome || scene.construction) return;
  ui.modes.replaceChildren(
    scene.room === 'interior'
      ? el('button', { type: 'button', id: 'homes-decorate-btn', text: 'Decorate', onclick: () => setMode(engine, 'decorate') })
      : el('button', { type: 'button', id: 'homes-cultivate-btn', text: 'Cultivate', onclick: () => setMode(engine, 'cultivate') })
  );
}

function renderBar(engine) {
  if (!ensureUi(engine)) return;
  const bar = ui.bar;
  bar.hidden = !mode;
  renderModes(engine);
  if (!mode) return;
  const title = mode === 'decorate' ? (inTower() ? `Decorate ${towerApi.floorTitle()}` : 'Decorate your house') : 'Cultivate your yard';
  const sub = mode === 'decorate'
    ? `${decor.placed.length} placed`
    : `◉ ${Math.floor(engine.pc.imagination || 0).toLocaleString()} iMG`;
  const header = el('header', {}, [
    el('h3', { text: title }),
    el('small', { text: sub }),
    el('button', { class: 'hb-close', type: 'button', 'aria-label': 'Close', text: '×', onclick: () => setMode(engine, null) }),
  ]);
  const body = el('div', { class: 'hb-body' });
  if (mode === 'decorate') {
    const tabs = [['furniture', 'Furniture'], ['wall', 'Walls'], ['floor', 'Floors'], ['ceiling', 'Ceilings'], ['house', inTower() ? 'Tower' : 'House']];
    const nav = el('nav', {}, tabs.map(([id, label]) => el('button', {
      type: 'button',
      class: tab === id ? 'on' : '',
      'data-home-tab': id,
      text: label,
      onclick: () => {
        tab = id;
        renderBar(engine);
      },
    })));
    bar.replaceChildren(header, nav, body);
    renderDecorateBody(engine, body);
  } else {
    bar.replaceChildren(header, body);
    renderCultivateBody(engine, body);
  }
}

function renderSelectionCard(engine, body) {
  if (selected?.kind !== 'furniture') return;
  const item = placedItem(decor, selected.id);
  if (!item) return;
  const def = furnitureDef(item.classTsid);
  const actions = [
    el('button', { type: 'button', 'data-home-action': 'move', text: 'Move', onclick: () => beginMove(engine, item.id) }),
    el('button', { type: 'button', 'data-home-action': 'flip', text: 'Flip', disabled: !def.canFlip, onclick: () => runFurnitureAction(engine, 'flip') }),
    el('button', { type: 'button', 'data-home-action': 'forward', text: 'Forward', onclick: () => runFurnitureAction(engine, 'forward') }),
    el('button', { type: 'button', 'data-home-action': 'back', text: 'Back', onclick: () => runFurnitureAction(engine, 'back') }),
    el('button', { type: 'button', 'data-home-action': 'pickup', text: 'Pick up', onclick: () => runFurnitureAction(engine, 'pickup') }),
  ];
  if (item.classTsid === 'bag_furniture_sdb') {
    if (item.display) {
      actions.push(el('button', { type: 'button', text: `Take out ${item.display.count}`, onclick: () => runFurnitureAction(engine, 'withdraw') }));
    }
    const choices = displayableItems(engine);
    if (choices.length) {
      const select = el('select', { 'aria-label': 'Item to display' }, choices.map((row) => el('option', { value: row.classTsid, text: `${row.label} (${row.count})` })));
      actions.push(select, el('button', {
        type: 'button',
        class: 'primary',
        text: 'Display',
        onclick: () => runFurnitureAction(engine, 'deposit', select.value),
      }));
    }
  }
  body.append(el('div', { class: 'hb-sel' }, [
    el('strong', { text: def.label }),
    el('p', { text: def.desc || '' }),
    el('div', { class: 'hb-actions' }, actions),
  ]));
}

function displayableItems(engine) {
  const box = selected ? placedItem(decor, selected.id) : null;
  return Object.entries(engine.inv)
    .filter(([cls, n]) => n > 0 && ITEM_CATALOG[cls] && !FURNITURE_CATALOG[cls] && !ITEM_CATALOG[cls].isTool)
    .filter(([cls]) => !box?.display || box.display.classTsid === cls)
    .map(([cls, n]) => ({ classTsid: cls, label: ITEM_CATALOG[cls].label, count: n }))
    .sort((a, b) => a.label.localeCompare(b.label))
    .slice(0, 80);
}

function renderDecorateBody(engine, body) {
  renderSelectionCard(engine, body);
  if (tab === 'furniture') {
    const list = listPlaceable(decor, engine.inv);
    if (!list.length) {
      body.append(el('p', { class: 'hb-note', text: 'Everything is placed. Pick something up, buy furniture at the Furniture Store, or build some with a Construction Tool.' }));
    } else {
      body.append(el('p', { class: 'hb-note', text: placing ? 'Click in the room to place it. Esc cancels.' : 'Choose a piece, then click in the room to place it. Click placed furniture to move, flip or pick it up.' }));
      body.append(el('div', { class: 'hb-grid' }, list.map((row) => el('button', {
        type: 'button',
        class: `hb-tile${placing?.classTsid === row.classTsid ? ' on' : ''}`,
        'data-furniture': row.classTsid,
        title: `${row.label} · ${row.slot}${row.stored ? ` · ${row.stored} in storage` : ''}${row.packed ? ` · ${row.packed} in pack` : ''}`,
        onclick: () => beginPlacing(engine, row.classTsid),
      }, [
        el('img', { src: `assets/sprites/icons/${row.classTsid}.png`, alt: '' }),
        el('span', { text: row.label }),
        el('span', { class: 'hb-count', text: String(row.total) }),
      ]))));
    }
    body.append(el('div', { class: 'hb-row', style: 'margin-top:9px' }, [
      el('button', { type: 'button', 'data-home-store': '1', text: 'Furniture Store', onclick: () => openStore(engine) }),
    ]));
    return;
  }
  if (tab === 'house' && inTower()) {
    renderTowerTab(engine, body);
    return;
  }
  if (tab === 'house') {
    const quote = quoteInteriorExpansion(decor, engine.inv);
    body.append(el('p', { class: 'hb-note', text: `Your house is ${decor.wallSegments} wall segments wide (the most is 20). Each extra segment takes one Wall Segment, made with a Construction Tool.` }));
    body.append(el('div', { class: 'hb-row' }, [
      el('button', {
        type: 'button',
        class: 'primary',
        'data-home-expand': 'house',
        disabled: !quote.ok,
        text: `Expand house (${engine.inv.wall_segment || 0} Wall Segment${(engine.inv.wall_segment || 0) === 1 ? '' : 's'})`,
        onclick: () => expandHouse(engine),
      }),
    ]));
    if (!quote.ok && quote.msg) body.append(el('p', { class: 'hb-note', text: quote.msg }));
    return;
  }
  const kind = tab;
  const current = decor[kind];
  body.append(el('p', { class: 'hb-note', text: `Now: ${textureConfig(kind, current)?.name || current}. Swatches are free to apply.` }));
  let lastCat = '';
  const grid = [];
  const flush = () => {
    if (grid.length) body.append(el('div', { class: 'hb-grid' }, grid.splice(0)));
  };
  for (const row of listTextures(kind)) {
    if (row.category !== lastCat) {
      flush();
      body.append(el('h4', { text: row.category }));
      lastCat = row.category;
    }
    grid.push(el('button', {
      type: 'button',
      class: `hb-tile${row.key === current ? ' on' : ''}`,
      'data-swatch': `${kind}:${row.key}`,
      title: row.name,
      onclick: () => applySwatch(engine, kind, row.key),
    }, [el('span', { class: 'hb-swatch', style: `background-image:url(${swatchUrl(kind, row.key)})` }), el('span', { text: row.name })]));
  }
  flush();
}

/** The Decorate bar's Tower tab: floors and Build a New Floor (tower_get_expand_costs / tower_start_expand). */
function renderTowerTab(engine, body) {
  const state = towerApi.state();
  const costs = towerApi.expandCosts();
  body.append(el('p', { class: 'hb-note', text: `${towerApi.label()} has ${state.floors} of ${TOWER_CONFIG.MAX_FLOORS} floors. Each new floor is a project at the Workbench on the floor under construction.` }));
  if (costs.count && !costs.locked) {
    const items = Object.entries(costs.items).map(([cls, n]) => `${n} ${ITEM_CATALOG[cls]?.label || cls.replace(/_/g, ' ')}`);
    const workRows = Object.entries(costs.work).map(([cls, n]) => `${n} units with a ${ITEM_CATALOG[cls]?.label || cls.replace(/_/g, ' ')}`);
    body.append(el('h4', { text: 'The next floor will cost' }));
    body.append(el('p', { class: 'hb-note', text: [...items, ...workRows].join(' · ') }));
  }
  body.append(el('div', { class: 'hb-row' }, [
    el('button', {
      type: 'button',
      class: 'primary',
      'data-tower-expand': '1',
      disabled: !costs.count || costs.locked,
      text: costs.locked ? 'A floor is under construction' : costs.count ? 'Build a New Floor' : 'As tall as it gets',
      onclick: () => {
        const res = towerApi.beginExpansion(engine);
        renderBar(engine);
        if (res.ok) engine.toast('Take the elevator up to the Workbench.', 2600);
      },
    }),
  ]));
}

function renderCultivateBody(engine, body) {
  if (selected?.kind === 'cultivation') {
    const item = cult.items.find((row) => row.id === selected.id);
    if (item) {
      const def = cultivationDef(item.protoClass);
      const nudge = engine.learnedSkills.includes('nudgery_1');
      const isTower = def.kind === 'tower';
      body.append(el('div', { class: 'hb-sel' }, [
        el('strong', { text: isTower ? towerApi.label() : def.label }),
        el('p', { text: isTower
          ? (item.endClass === TOWER_CHASSIS ? 'Built. Step inside to decorate its floors.' : 'A Tower project. Click it in the yard to see what it needs.')
          : `Lifespan ${Math.round(lifespanLeft(item) * 100)}% (wears out after ${def.maxWear} uses).` }),
        el('div', { class: 'hb-actions' }, [
          el('button', { type: 'button', 'data-home-action': 'nudge', disabled: !nudge, title: nudge ? 'Move it along the yard' : 'Needs the Nudgery skill', text: 'Nudge', onclick: () => beginNudge(engine, item.id) }),
          el('button', { type: 'button', 'data-home-action': 'remove', text: 'Remove', disabled: item.endClass === TOWER_CHASSIS, title: item.endClass === TOWER_CHASSIS ? 'A finished Tower stays.' : '', onclick: () => removeSelected(engine) }),
        ]),
      ]));
    }
  }
  body.append(el('p', { class: 'hb-note', text: placing ? 'Click your yard to place it. Esc cancels.' : 'Spend imagination to grow gardens, rocks and patches on your street. Each one costs a little more than the last.' }));
  const choices = cultivationChoices(cult, engine.pc);
  body.append(el('div', { class: 'hb-grid' }, choices.map((row) => el('button', {
    type: 'button',
    class: `hb-tile${placing?.protoClass === row.protoClass ? ' on' : ''}`,
    'data-cultivate': row.protoClass,
    disabled: !row.canPlace,
    title: row.reason || `${row.label}: ${row.cost} iMG`,
    onclick: () => beginCultivate(engine, row.protoClass),
  }, [
    el('img', { src: cultivationIcon(row.protoClass), alt: '' }),
    el('span', { text: row.label }),
    el('span', { class: 'hb-cost', text: row.canPlace || row.reason.startsWith('Needs') ? `◉ ${row.cost.toLocaleString()}` : `Lv ${row.minLevel}` }),
  ]))));
  const left = quoteYardExpansion(cult, engine.pc, 'left');
  const right = quoteYardExpansion(cult, engine.pc, 'right');
  body.append(el('h4', { text: 'Expand your street' }));
  body.append(el('div', { class: 'hb-row' }, [
    el('button', { type: 'button', 'data-home-expand': 'left', disabled: !left.ok, text: `← Left (◉ ${left.cost})`, title: left.msg || '', onclick: () => growYard(engine, 'left') }),
    el('button', { type: 'button', 'data-home-expand': 'right', disabled: !right.ok, text: `Right → (◉ ${right.cost})`, title: right.msg || '', onclick: () => growYard(engine, 'right') }),
  ]));
  body.append(el('p', { class: 'hb-note', text: `${left.countLeft} left and ${right.countRight} right expansions remain.` }));
}

function cultivationIcon(protoClass) {
  const def = cultivationDef(protoClass);
  if (def.kind === 'tower') return 'assets/sprites/home-tower/proto_3.webp';
  if (def.art) return `assets/sprites/cultivation/${def.art}.png`;
  if (def.kind === 'garden') return `assets/sprites/icons/${def.gardenType === 'herb' ? 'herb_seed_rubeweed' : 'seed_carrot'}.png`;
  if (def.kind === 'rock') return `assets/sprites/icons/${{ proto_metal_rock: 'metal_rock', proto_dullite_rock: 'dullite', proto_beryl_rock: 'beryl', proto_sparkly_rock: 'sparkly' }[protoClass]}.png`;
  if (protoClass === 'proto_peat') return 'assets/sprites/icons/peat.png';
  if (protoClass === 'proto_dirt_pile') return 'assets/sprites/icons/earth.png';
  return 'assets/sprites/icons/bean_plain.png';
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

function setMode(engine, next) {
  if (next && !scene) return;
  mode = next;
  placing = null;
  selected = null;
  tab = tab || 'furniture';
  destroyGhost();
  if (scene?.room === 'street') {
    if (mode === 'cultivate') drawCultivationMarkers(engine);
    else {
      scene.markers?.destroy({ children: true });
      scene.markers = null;
    }
  } else {
    renderFurniture(engine);
  }
  renderBar(engine);
  publish(engine);
}

function beginPlacing(engine, classTsid, from = null) {
  placing = { kind: 'furniture', classTsid, from };
  selected = null;
  makeGhost(engine);
  renderFurniture(engine);
  renderBar(engine);
}

function beginMove(engine, id) {
  const item = placedItem(decor, id);
  if (!item) return;
  placing = { kind: 'furniture', classTsid: item.classTsid, moveId: id };
  makeGhost(engine);
  renderBar(engine);
}

function beginCultivate(engine, protoClass, opts = {}) {
  const def = cultivationDef(protoClass);
  if (def?.warning && !opts.confirmed) {
    // cultivation_get_available placement_warning before the Tower plans are bought.
    engine.offerQuestDialogue({
      title: def.label,
      kicker: 'Cultivate',
      beats: [{ text: def.warning, response: 'Yes' }],
      acceptLabel: 'Yes',
      declineLabel: 'Nevermind',
      onAccept: () => beginCultivate(engine, protoClass, { confirmed: true }),
    });
    return;
  }
  placing = { kind: 'cultivation', protoClass };
  selected = null;
  makeGhost(engine);
  drawCultivationMarkers(engine);
  renderBar(engine);
}

function beginNudge(engine, id) {
  const item = cult.items.find((row) => row.id === id);
  if (!item) return;
  placing = { kind: 'cultivation', protoClass: item.protoClass, moveId: id };
  makeGhost(engine);
  renderBar(engine);
}

function openStore(engine) {
  engine.openShop?.(furnitureStoreProfile());
}

function applySwatch(engine, kind, key) {
  const result = setHomeTexture(decor, kind, key);
  if (!result.ok) return result;
  engine.playSound?.('UI_TOGGLE', { volume: 0.45 });
  engine.pushActivity(`You changed your ${kind === 'wall' ? 'wallpaper' : kind} to ${result.name}.`);
  scene?.background?.redraw?.();
  renderBar(engine);
  publish(engine);
  engine.save();
  return result;
}

function runFurnitureAction(engine, action, arg) {
  if (selected?.kind !== 'furniture') return null;
  const id = selected.id;
  let result;
  if (action === 'flip') result = flipFurniture(decor, id);
  else if (action === 'forward') result = restackFurniture(decor, id, false);
  else if (action === 'back') result = restackFurniture(decor, id, true);
  else if (action === 'pickup') {
    result = pickUpFurniture(decor, id);
    if (result.ok) {
      selected = null;
      engine.pushActivity(`You picked up the ${result.lifted.map((c) => furnitureDef(c).label).join(', ')}. It went into your furniture storage.`);
    }
  } else if (action === 'deposit') {
    result = displayDeposit(decor, engine.inv, id, arg, engine.inv[arg] || 1);
    if (result.ok) engine.refreshPack();
  } else if (action === 'withdraw') {
    result = displayWithdraw(decor, engine.inv, id);
    if (result.ok) engine.refreshPack();
  }
  if (result && !result.ok && result.msg) engine.toast(result.msg);
  renderFurniture(engine);
  renderBar(engine);
  engine.save();
  return result;
}

function expandHouse(engine) {
  const result = expandInterior(decor, engine.inv);
  if (!result.ok) {
    engine.toast(result.msg || 'You cannot expand right now.');
    return result;
  }
  engine.pushActivity(`You added a wall segment. Your house is now ${result.wallSegments} segments wide.`);
  engine.toast('A little more room to live in.', 2200);
  engine.refreshPack();
  engine.save();
  engine.refreshHomeScene?.();
  return result;
}

function growYard(engine, side) {
  const result = expandYard(cult, engine.pc, side);
  if (!result.ok) {
    engine.toast(result.msg || 'You cannot expand right now.');
    return result;
  }
  engine.pushActivity(`You expanded your street to the ${side} for ${result.cost.toLocaleString()} iMG.`);
  if (result.maxed) engine.achievement('max_expansions:street', 1);
  engine.updateHud();
  engine.save();
  const shift = side === 'left' ? 150 : 0;
  engine.refreshHomeScene?.({ shift });
  return result;
}

function removeSelected(engine) {
  if (selected?.kind !== 'cultivation') return null;
  if (towerItem(cult)?.id === selected.id) return towerBridge.removeTower(engine);
  const result = uncultivate(engine, selected.id);
  engine.refreshHomeScene?.();
  return result;
}

function placeAtPointer(engine, at) {
  if (!placing) return null;
  if (placing.kind === 'furniture') {
    let result;
    if (placing.moveId) {
      result = moveFurniture(decor, placing.moveId, at);
      selected = { kind: 'furniture', id: placing.moveId };
    } else {
      result = placeFurniture(decor, engine.inv, placing.classTsid, at, { from: placing.from || undefined });
      if (result.ok) {
        selected = { kind: 'furniture', id: result.item.id };
        engine.pushActivity(`You placed a ${furnitureDef(placing.classTsid).label}.`);
        if (result.from === 'pack') engine.refreshPack();
      }
    }
    if (!result.ok && result.msg) engine.toast(result.msg);
    engine.playSound?.(result.ok ? 'ITEM_DROP' : 'CLICK_FAILURE', { volume: 0.45 });
    placing = null;
    destroyGhost();
    renderFurniture(engine);
    renderBar(engine);
    engine.save();
    return result;
  }
  const rx = Math.round(at.x - homeStreetLayout(cult).houseX);
  let result;
  if (placing.moveId) {
    result = nudgeCultivation(cult, placing.moveId, rx, engine.learnedSkills);
  } else {
    result = cultivate(cult, engine.pc, placing.protoClass, rx);
    if (result.ok) {
      engine.pushActivity(`You imagined a ${result.label} into your yard for ${result.cost.toLocaleString()} iMG.`);
      if (cultivationDef(result.item.protoClass)?.kind === 'tower') towerApi.onCultivated(engine, result.item);
      engine.floatText?.(at.x, GROUND_Y - 120, `-${result.cost} iMG`, 0xb38cff);
      selected = { kind: 'cultivation', id: result.item.id };
    }
  }
  if (!result.ok) {
    engine.toast(result.msg || 'That does not fit there.');
    return result;
  }
  placing = null;
  destroyGhost();
  engine.updateHud();
  engine.save();
  engine.refreshHomeScene?.();
  return result;
}

// ---------------------------------------------------------------------------
// Ghost preview and pointer input
// ---------------------------------------------------------------------------

function destroyGhost() {
  if (scene?.ghost && !scene.ghost.destroyed) scene.ghost.destroy({ children: true });
  if (scene) scene.ghost = null;
}

function makeGhost(engine) {
  destroyGhost();
  if (!scene || !placing) return;
  const { PIXI } = engine;
  const g = new PIXI.Container();
  g.zIndex = 95;
  if (placing.kind === 'furniture') {
    const def = furnitureDef(placing.classTsid);
    const spr = PIXI.Sprite.from(def.art.path);
    spr.anchor.set(0.5, def.slot === 'ceiling' ? 0 : 1);
    spr.scale.set(furnitureScale(def.classTsid));
    spr.alpha = 0.72;
    g.addChild(spr);
  } else {
    const half = footprint(placing.protoClass);
    const pad = new PIXI.Graphics();
    g.addChild(pad);
    g.pad = pad;
    g.half = half;
    const label = new PIXI.Text(cultivationDef(placing.protoClass).label, {
      fontFamily: 'Trebuchet MS, sans-serif',
      fontSize: 13,
      fontWeight: '700',
      fill: 0xffffff,
      stroke: 0x3b2a1f,
      strokeThickness: 4,
    });
    label.anchor.set(0.5, 1);
    label.y = -18;
    g.addChild(label);
  }
  engine.entityLayer.addChild(g);
  scene.ghost = g;
  updateGhost(engine);
}

function updateGhost(engine) {
  const g = scene?.ghost;
  if (!g || !placing) return;
  const at = pointer.inside ? pointer : { x: engine.player?.x ?? 400, y: GROUND_Y - 120 };
  if (placing.kind === 'furniture') {
    const snap = snapPlacement(decor, placing.classTsid, at, placing.moveId || null);
    g.x = snap.x;
    g.y = snap.y;
    return;
  }
  const rx = Math.round(at.x - homeStreetLayout(cult).houseX);
  const ok = placementCheck(cult, placing.protoClass, rx, placing.moveId || null).ok;
  g.x = at.x;
  g.y = GROUND_Y;
  g.pad.clear();
  g.pad.roundRect(-g.half, -10, g.half * 2, 20, 10).fill({ color: ok ? 0x7cc35a : 0xe0574a, alpha: 0.35 });
  g.pad.roundRect(-g.half, -10, g.half * 2, 20, 10).stroke({ width: 2, color: ok ? 0x7cc35a : 0xe0574a, alpha: 0.95 });
}

function worldPoint(engine, event) {
  const canvas = event.target;
  const rect = canvas.getBoundingClientRect();
  const sx = (event.clientX - rect.left) * (VIEW_W / rect.width);
  const sy = (event.clientY - rect.top) * (VIEW_H / rect.height);
  const p = engine.entityLayer.toLocal(new engine.PIXI.Point(sx, sy));
  return { x: p.x, y: p.y };
}

function furnitureAt(point) {
  const order = renderOrder(decor).reverse();
  for (const item of order) {
    const b = furnitureBounds(item);
    if (point.x >= b.x && point.x <= b.x + b.w && point.y >= b.y && point.y <= b.y + b.h) return item;
  }
  return null;
}

function bindPointer(engine) {
  if (typeof document === 'undefined' || bindPointer.bound) return;
  const root = document.getElementById('game-root');
  if (!root) return;
  bindPointer.bound = true;
  const isCanvas = (e) => e.target?.tagName === 'CANVAS';
  root.addEventListener('pointermove', (e) => {
    if (!mode || !scene || !isCanvas(e)) return;
    const p = worldPoint(engine, e);
    pointer = { ...p, inside: true };
    updateGhost(engine);
  }, true);
  root.addEventListener('pointerdown', (e) => {
    if (!mode || !scene || !isCanvas(e)) return;
    e.stopPropagation();
    e.preventDefault();
    const p = worldPoint(engine, e);
    pointer = { ...p, inside: true };
    if (placing) {
      placeAtPointer(engine, p);
      return;
    }
    if (mode === 'decorate') {
      const item = furnitureAt(p);
      selected = item ? { kind: 'furniture', id: item.id } : null;
      renderFurniture(engine);
      renderBar(engine);
    } else {
      const item = cultivationAt(p.x);
      selected = item ? { kind: 'cultivation', id: item.id } : null;
      drawCultivationMarkers(engine);
      renderBar(engine);
    }
    publish(engine);
  }, true);
  window.addEventListener('keydown', (e) => {
    if (!mode || e.key !== 'Escape') return;
    if (e.target?.matches?.('input, textarea, select')) return;
    e.stopImmediatePropagation();
    if (placing) {
      placing = null;
      destroyGhost();
      renderBar(engine);
    } else if (selected) {
      selected = null;
      if (scene?.room === 'interior') renderFurniture(engine);
      else drawCultivationMarkers(engine);
      renderBar(engine);
    } else {
      setMode(engine, null);
    }
    publish(engine);
  }, true);
}

// ---------------------------------------------------------------------------
// Wear from use on the home street
// ---------------------------------------------------------------------------

function wearFromEvent(engine, counter) {
  if (!scene || scene.room !== 'street') return;
  let kinds = null;
  if (/^rock_[a-z]+_\d+:mine$/.test(counter)) kinds = ['rock'];
  else if (/^(garden_harvest|herb_harvest):/.test(counter)) kinds = ['garden'];
  if (!kinds) return;
  const item = nearestCultivation(engine, kinds);
  if (!item) return;
  const result = addWear(cult, item.id, 1);
  if (result.depleted) {
    uncultivate(engine, item.id, 'worn');
    engine.refreshHomeScene?.();
  }
}

function wearFromNodes(engine, now) {
  if (!scene || scene.room !== 'street' || now - lastNodeCheck < 2000) return;
  lastNodeCheck = now;
  const slot = engine.streetSlot('resource-nodes', HOME_STREET_TSID);
  const keys = nodeKeyMap(cult.items, now);
  for (const item of [...cult.items]) {
    const nodeKeys = keys.get(item.id) || [];
    if (!nodeKeys.length) continue;
    const used = nodeKeys.reduce((sum, key) => sum + (slot.nodes?.[key]?.totalHarvests || 0), 0);
    if (used > item.wear) {
      const result = addWear(cult, item.id, used - item.wear);
      if (result.depleted) {
        uncultivate(engine, item.id, 'worn');
        engine.refreshHomeScene?.();
        return;
      }
    }
  }
}

// ---------------------------------------------------------------------------
// QA demo + autoplay
// ---------------------------------------------------------------------------

function demoSetup(engine) {
  if (demoDone || !scene) return;
  const demo = String(engine.param('homedemo') || '').toLowerCase();
  if (demo !== 'decorate' && demo !== 'cultivate') return;
  demoDone = true;
  if (demo === 'decorate' && scene.room === 'interior') {
    if (decor.wall === 'grey_unfinished' && decor.floor === 'starter_crappy') {
      // First run: tidy the starter layout away and show a finished room.
      for (const row of [...decor.placed]) if (placedItem(decor, row.id)) pickUpFurniture(decor, row.id);
      furnishDemoRoom(decor);
      decor.wall = 'creamy_stripes';
      decor.floor = 'woodpanel';
      decor.ceiling = 'whitewood_ceiling';
    }
    decor.storage.furniture_armchair = (decor.storage.furniture_armchair || 0) + 1;
    engine.inv.musicblock_d_blue_05 = Math.max(3, engine.inv.musicblock_d_blue_05 || 0);
    engine.inv.wall_segment = Math.max(1, engine.inv.wall_segment || 0);
    scene.background?.redraw?.();
    renderFurniture(engine);
    setMode(engine, 'decorate');
    if (engine.param('homeautoplay') === '1') runDecorateAutoplay(engine);
  } else if (demo === 'cultivate' && scene.room === 'street') {
    // Level 12 opens every cultivation class (inc_cultivation.js gates top out at 10).
    if ((engine.pc.level || 1) < 12) {
      engine.pc.xp = Math.max(engine.pc.xp || 0, XP_FOR_LEVEL[10]);
      engine.pc.level = 12;
    }
    engine.pc.imagination = Math.max(engine.pc.imagination || 0, 20_000);
    engine.updateHud();
    if (!cult.items.length) {
      cultivateDemoYard(cult, Date.now() - 5 * 60_000);
      engine.save();
      // Rebuild after this render finishes (never re-enter renderHomeScene).
      setTimeout(() => {
        engine.refreshHomeScene?.().then(() => {
          setMode(engine, 'cultivate');
          if (engine.param('homeautoplay') === '1') runCultivateAutoplay(engine);
        });
      }, 0);
      return;
    }
    setMode(engine, 'cultivate');
    if (engine.param('homeautoplay') === '1') runCultivateAutoplay(engine);
  }
}

function step(steps, engine) {
  let i = 0;
  const next = () => {
    if (i >= steps.length) {
      engine.setData('homeAutoplay', 'done');
      return;
    }
    const [label, fn, wait = 700] = steps[i++];
    try {
      fn();
      engine.setData('homeAutoplay', label);
    } catch (err) {
      engine.setData('homeAutoplay', `error:${label}:${err.message}`);
      return;
    }
    autoplay = setTimeout(next, wait);
  };
  autoplay = setTimeout(next, 900);
}

function runDecorateAutoplay(engine) {
  let armchair = null;
  step([
    ['place', () => {
      beginPlacing(engine, 'furniture_armchair');
      const r = placeAtPointer(engine, { x: 760, y: GROUND_Y });
      armchair = r?.item?.id;
    }],
    ['move', () => {
      beginMove(engine, armchair);
      placeAtPointer(engine, { x: 700, y: GROUND_Y });
    }],
    ['flip', () => {
      selected = { kind: 'furniture', id: armchair };
      runFurnitureAction(engine, 'flip');
    }],
    ['wallpaper', () => applySwatch(engine, 'wall', 'brown_molding')],
    ['floor', () => applySwatch(engine, 'floor', 'woodpanel_3_floor')],
    ['display', () => {
      const box = decor.placed.find((row) => row.classTsid === 'bag_furniture_sdb');
      if (!box) return;
      selected = { kind: 'furniture', id: box.id };
      runFurnitureAction(engine, 'deposit', 'musicblock_d_blue_05');
    }],
    ['pickup', () => {
      selected = { kind: 'furniture', id: armchair };
      runFurnitureAction(engine, 'pickup');
    }],
    ['expand', () => {
      tab = 'house';
      expandHouse(engine);
    }, 1400],
  ], engine);
}

function runCultivateAutoplay(engine) {
  step([
    ['cultivate', () => {
      beginCultivate(engine, 'proto_dirt_pile');
      const layout = homeStreetLayout(cult);
      const rx = [-420, -260, 1500, 640, 900].find((x) => placementCheck(cult, 'proto_dirt_pile', x).ok) ?? 600;
      placeAtPointer(engine, { x: layout.houseX + rx, y: GROUND_Y });
    }, 1500],
    ['expand', () => growYard(engine, 'right'), 1500],
    ['remove', () => {
      const last = cult.items[cult.items.length - 1];
      if (!last) return;
      selected = { kind: 'cultivation', id: last.id };
      removeSelected(engine);
    }, 1500],
  ], engine);
}

// ---------------------------------------------------------------------------
// The scene contract for game.js renderHomeScene
// ---------------------------------------------------------------------------

/** QA: ?homex= arrival point (interior x, or street x relative to the house). */
function homeX(engine) {
  const raw = engine.param('homex');
  return raw != null && raw !== '' && Number.isFinite(Number(raw)) ? Number(raw) : null;
}

function towerFloorScene(engine, floor) {
  const construction = towerApi.isConstructionFloor(floor);
  decor = construction ? constructionDecor() : towerFloorDecor(floor);
  const background = interiorBackground(engine);
  const width = interiorWidth(decor);
  const via = towerApi.takeFloorArrival();
  return {
    width,
    background,
    spawnFor(opts = {}) {
      if (opts.arrive === 'exact' && Number.isFinite(opts.spawnX)) return Math.max(80, Math.min(width - 80, opts.spawnX));
      if (homeX(engine) != null) return homeX(engine);
      // tower_get_teleport_point (w - 150) from outside; the elevator connect (x 200) between floors.
      if (via === 'door' || (!via && floor === 0)) return interiorDoorX() - 80;
      return TOWER_GEO.elevatorX + 70;
    },
    spawnTargets() {
      scene = { room: 'interior', tower: floor, construction, background, furnitureLayer: null, ghost: null, markers: null };
      towerApi.spawnFloor(engine, { width, groundY: GROUND_Y, doorX: interiorDoorX() });
      return {};
    },
    enter() {
      const { PIXI } = engine;
      const layer = new PIXI.Container();
      layer.sortableChildren = true;
      layer.zIndex = FURNITURE_Z;
      engine.entityLayer.addChild(layer);
      scene.furnitureLayer = layer;
      if (construction) {
        if (mode === 'decorate') mode = null;
        drawScaffold(engine, width);
      }
      renderFurniture(engine);
      afterEnter(engine);
    },
  };
}

/** The floor under construction: bare timber framing over the unfinished walls. */
function drawScaffold(engine, width) {
  const { PIXI } = engine;
  const g = new PIXI.Graphics();
  g.zIndex = 2;
  const top = INTERIOR.wallTop - 10;
  for (let x = 330; x < width - 120; x += 210) {
    g.rect(x, top, 16, GROUND_Y - top).fill(0x7a5634);
    g.rect(x + 12, top, 4, GROUND_Y - top).fill(0x5c3f25);
  }
  g.rect(300, top + 70, width - 400, 12).fill(0x8d6444);
  for (let x = 330; x + 210 < width - 120; x += 420) g.moveTo(x + 16, GROUND_Y - 6).lineTo(x + 210, top + 82);
  g.stroke({ width: 10, color: 0x7a5634, alpha: 1 });
  for (let i = 0; i < 4; i += 1) g.roundRect(width - 380 + i * 34, GROUND_Y - 22 - (i % 2) * 18, 30, 18, 3).fill(0x9c9c94);
  engine.entityLayer.addChild(g);
}

function homeScene(room, engine) {
  const ctx = engine.homeContext?.() || {};
  const style = ctx.style || 'meadow';
  const floor = room === 'interior' ? towerApi.currentFloor() : null;
  if (floor != null) return towerFloorScene(engine, floor);
  decor = houseDecor;
  if (room !== 'interior') towerApi.clearFloor();
  if (room === 'interior') {
    if (!decor.starterKit) {
      grantStarterKit(decor);
      arrangeStarterRoom(decor);
      engine.save();
    }
    const background = interiorBackground(engine);
    const width = interiorWidth(decor);
    return {
      width,
      background,
      spawnFor(opts = {}) {
        if (opts.arrive === 'exact' && Number.isFinite(opts.spawnX)) return Math.max(80, Math.min(width - 80, opts.spawnX));
        if (opts.arrive !== 'door' && homeX(engine) != null) return homeX(engine);
        if (opts.arrive !== 'door' && engine.param('homedemo') === 'decorate') return Math.round(width * 0.48);
        return interiorDoorX() - 80;
      },
      spawnTargets() {
        scene = { room, background, furnitureLayer: null, ghost: null, markers: null };
        return spawnInteriorTargets(engine);
      },
      enter() {
        const { PIXI } = engine;
        const layer = new PIXI.Container();
        layer.sortableChildren = true;
        layer.zIndex = FURNITURE_Z;
        engine.entityLayer.addChild(layer);
        scene.furnitureLayer = layer;
        renderFurniture(engine);
        afterEnter(engine);
      },
    };
  }
  const background = streetBackground(engine, style);
  const layout = homeStreetLayout(cult);
  return {
    width: layout.width,
    background,
    spawnFor(opts = {}) {
      if (opts.arrive === 'exact' && Number.isFinite(opts.spawnX)) {
        return Math.max(60, Math.min(layout.width - 60, opts.spawnX + (opts.shift || 0)));
      }
      const fromTower = towerApi.takeArrivalX();
      if (Number.isFinite(fromTower)) return Math.max(60, Math.min(layout.width - 60, fromTower));
      if (opts.arrive === 'door') return background.houseDoorX + 70;
      if (homeX(engine) != null) return layout.houseX + homeX(engine);
      if (engine.param('homedemo') === 'cultivate') return layout.houseX - 260;
      return layout.lotLeft + 130;
    },
    spawnTargets() {
      scene = { room, background, ghost: null, markers: null };
      return spawnStreetTargets(engine);
    },
    enter() {
      spawnCultivations(engine);
      afterEnter(engine);
    },
  };
}

function afterEnter(engine) {
  bindPointer(engine);
  if ((mode === 'decorate' && scene.room !== 'interior') || (mode === 'cultivate' && scene.room !== 'street')) {
    mode = null;
    placing = null;
    selected = null;
  }
  if (placing) makeGhost(engine);
  renderBar(engine);
  publish(engine);
  demoSetup(engine);
}

// ---------------------------------------------------------------------------
// Feature
// ---------------------------------------------------------------------------

export const homesFeature = {
  id: HOMES_FEATURE_ID,

  init(engine) {
    ensureFurnitureItems();
    towerApi.connect(towerBridge);
    publish(engine);
  },

  save() {
    // Tower floors share the house's furniture storage; it is saved once, with the house.
    return { decor: houseDecor, cult, towerDecor: towerDecor.map(({ storage, ...rest }) => rest) };
  },

  restore(slice) {
    houseDecor = normalizeHomeDecorState(slice?.decor || {});
    decor = houseDecor;
    cult = normalizeCultivationState(slice?.cult || {});
    towerDecor = (Array.isArray(slice?.towerDecor) ? slice.towerDecor : [])
      .slice(0, TOWER_CONFIG.MAX_FLOORS)
      .map((row) => normalizeHomeDecorState({ ...row, wallSegments: TOWER_GEO.wallSegments, starterKit: true }));
  },

  /** renderHomeScene: the scene for 'interior' or 'street'. */
  homeScene(room, engine) {
    return homeScene(room, engine);
  },

  onStreetClear() {
    destroyGhost();
    scene = null;
    if (ui) {
      ui.bar.hidden = true;
      ui.modes.hidden = true;
    }
  },

  onStreetEnter(street, engine) {
    // Ordinary streets: no home scene, so the mode bar must be gone.
    if (!engine.homeContext?.().inHome) {
      mode = null;
      placing = null;
      selected = null;
      renderBar(engine);
    }
  },

  /** Pack furniture: place it straight from the pack while inside the house. */
  packVerbs(classTsid, engine) {
    if (!FURNITURE_CATALOG[classTsid]) return [];
    const inside = scene?.room === 'interior' && !scene.construction;
    return [{
      id: 'place_furniture',
      label: 'Place in house',
      enabled: inside,
      reason: inside ? '' : 'Go inside your house to place furniture.',
      tooltip: 'Choose a spot in your house for it',
      primary: true,
    }];
  },

  runPackVerb(classTsid, verbId, engine) {
    if (verbId !== 'place_furniture' || !FURNITURE_CATALOG[classTsid] || scene?.room !== 'interior' || scene.construction) return false;
    if (mode !== 'decorate') setMode(engine, 'decorate');
    beginPlacing(engine, classTsid, 'pack');
    return true;
  },

  onTick(dtMs, now, engine) {
    if (!scene) return;
    if (scene.room === 'street') wearFromNodes(engine, now);
  },

  onEvent(counter, amount, engine) {
    wearFromEvent(engine, counter);
  },

  /** QA / tests. */
  _state() {
    return { decor, houseDecor, towerDecor, cult, mode, placing, selected, scene };
  },
};
