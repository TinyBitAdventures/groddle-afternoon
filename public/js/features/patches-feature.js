/**
 * Patches, Seedlings and trees grown from Seasoned Beans, as a feature module
 * (see js/feature-host.js). Rules live in js/patches.js.
 *
 * World: one shared-planner group per soil class from the ecology catalog's
 * `soil` map (build-street-ecology.mjs: 185 Patches, 8 Dark Patches and 5
 * dead trants on indexed streets). Each plot persists in
 * engine.streetSlot('patches').plots keyed `<classTsid>:<index>`.
 *
 * A plot is drawn as weedy / tended / dug soil, a Seedling, a dead tree, or a
 * grown tree. Grown trees register as ordinary `trant_*` / `wood_tree`
 * targets (no featureId), so the existing pet / water / harvest / talk verbs,
 * Watering Can and Hatchet animations, super harvests and badges all apply.
 * This feature keeps their state in the plot, grows them on the source
 * maturity cycles, refreshes them at the new day, and turns a Wood Tree
 * harvested down to maturity 0 back into a Patch.
 *
 * Art: recovered CC0 OGA patch/patch_dark clean, dirty, dug and seedling
 * states, the six dead trant rasters, and the Hoe (10x3, 86x58) and Shovel
 * (14x4, 65x82, 53 frames) tool animation sheets under assets/sprites/soil/.
 *
 * QA: ?autostart=1&fresh=1&patchdemo=1 puts a weedy Patch beside the player
 * with a Hoe, Shovel, Watering Can and Seasoned Beans in the pack.
 *   patchdemo=clean|seedling|dark|dead|tree picks the starting stage
 *   &patchgrowms=<ms> shortens the demo seedling's five-minute minimum
 *   &patchautoplay=1 tends, plants a Bean Tree Bean, pets it three times and
 *   waits for the tree (patchgrowms defaults to 3000 for autoplay)
 *   &patchreset=1 rebuilds the demo plot; with patchdemo=tree,
 *   &patchtree=trant_fruit|wood_tree|... and &patchmaturity=<n> pick the grown tree.
 * Canvas data: patchCount, patchStages, patchPositions, patchDemo, patchLastVerb,
 * patchTrees, patchToolAnimation.
 *
 * Adopted plots (tree-death-feature.js): a street tree that dies leaves its
 * dead tree (or, for a Wood Tree, a Patch) here as an extra plot keyed
 * `tree:<street tree index>`, with its spot in slot.adopted. From then on it
 * is an ordinary plot: clear, tend, plant, pet, grow. `adoptPlot` and
 * `killTree` are the hooks; trees grown here die through `killPlotTree`.
 */

import { ensureItem } from '../inventory.js?v=catalog-unified-3';
import { platformYAt } from '../street-model.js';
import { getStreetEcologyCatalog, streetEcologyAliases } from '../street-ecology.js?v=official-ecology-3';
import { trantStatusLabel } from '../trants.js?v=trant-harvest-2';
import { woodTreeStatusLabel } from '../woodcutting.js?v=woodcutting-2';
import {
  GROWN_TREE_LABELS,
  SEASONED_BEANS,
  SOIL_ITEM_DEFS,
  canPlantBean,
  createPlot,
  killPlotTree,
  normalizePlot,
  performPlotVerb,
  plotArtPath,
  plotLabel,
  plotStatusLabel,
  plotVerbs,
  resetPlotDay,
  resetPlotDayIfStale,
  soilSpawnClasses,
  soilSpritePaths,
  tickPlot,
} from '../patches.js';
import { frameTexture, isLoaded, onFailed, onLoaded, textureFromUrl } from '../textures.js';

export const PATCHES_FEATURE_ID = 'patches';
export const SOIL_GROUP_PREFIX = 'soil:';

const TICK_MS = 500;
const TRANT_MAT_STAGES = [1, 3, 5, 7, 10];
const TRANT_FRAME_VERSION = 'all-species-cell-2';
const WOOD_SHEET = Object.freeze({
  url: 'assets/sprites/wood_tree_maturity_6_variant_2_x6_1_png_1354833445.png',
  fw: 88,
  fh: 138,
  count: 6,
});
const TOOL_SHEETS = Object.freeze({
  hoe: Object.freeze({ url: 'assets/sprites/soil/hoe-tool.png', fw: 86, fh: 58, cols: 10, count: 30 }),
  shovel: Object.freeze({ url: 'assets/sprites/soil/shovel-tool.png', fw: 65, fh: 82, cols: 14, count: 53 }),
  hatchet: Object.freeze({ url: 'assets/sprites/tools/hatchet-tool.png', fw: 110, fh: 64, cols: 8, count: 40 }),
});
const VERB_TOOL = Object.freeze({ tend: 'hoe', dig: 'shovel', clear: 'hatchet' });
const PLACEMENT_CLEARANCE = Object.freeze({ patch: 150, patch_dark: 150, patch_seedling: 150 });
const DEAD_CLEARANCE = 140;
const Z = Object.freeze({ soil: 15, tree: 16 });
/** Patch rasters carry a soft shadow under the mound; sink it into the ground line. */
const SOIL_ANCHOR_Y = 0.8;
const SEEDLING_ANCHOR_Y = 0.86;

// ---------------------------------------------------------------------------
// Pure helpers (tested in tests/patches-feature.test.js)
// ---------------------------------------------------------------------------

/** Soil counts for a street from the ecology catalog's top-level `soil` map. */
export function soilCountsForStreet(tsid, catalog = getStreetEcologyCatalog()) {
  for (const alias of streetEcologyAliases(tsid)) {
    if (catalog?.soil?.[alias]) return catalog.soil[alias];
  }
  return {};
}

export function soilPlacementGroups(counts) {
  const tally = new Map();
  for (const classTsid of soilSpawnClasses(counts)) tally.set(classTsid, (tally.get(classTsid) || 0) + 1);
  return [...tally.entries()].map(([classTsid, count]) => ({
    key: `${SOIL_GROUP_PREFIX}${classTsid}`,
    count,
    clearance: PLACEMENT_CLEARANCE[classTsid] || DEAD_CLEARANCE,
  }));
}

export function soilSpawnPlan(counts, placement) {
  const plan = [];
  for (const group of soilPlacementGroups(counts)) {
    const classTsid = group.key.slice(SOIL_GROUP_PREFIX.length);
    const points = (typeof placement === 'function' ? placement(group.key) : []) || [];
    points.slice(0, group.count).forEach((point, index) => {
      if (!Number.isFinite(point?.x) || !Number.isFinite(point?.y)) return;
      plan.push({ key: `${classTsid}:${index}`, classTsid, x: point.x, y: point.y });
    });
  }
  return plan;
}

/** Plots a dead street tree left behind (slot.adopted: key -> { x, y }). */
export function adoptedPlan(slot) {
  const plan = [];
  for (const [key, spot] of Object.entries(slot?.adopted || {})) {
    const plot = normalizePlot(slot.plots?.[key]);
    if (!plot || !Number.isFinite(spot?.x) || !Number.isFinite(spot?.y)) continue;
    plan.push({ key, classTsid: plot.classTsid, x: spot.x, y: spot.y, adopted: true });
  }
  return plan;
}

/** Reuse saved plots (whatever stage they reached) or create fresh ones. */
export function prepareStreetPlots(slot, plan, { tsid = '', hubId = null, now = Date.now() } = {}) {
  if (!slot.plots || typeof slot.plots !== 'object' || Array.isArray(slot.plots)) slot.plots = {};
  const out = [];
  for (const item of plan) {
    let plot = normalizePlot(slot.plots[item.key]);
    if (!plot) plot = createPlot(item.classTsid, { now, hubId, seed: `${tsid}:${item.key}` });
    slot.plots[item.key] = plot;
    out.push({ ...item, plot });
  }
  return out;
}

/** Nearest trant frame stage, as game.js nearestTrantMatStage. */
export function trantFrameStage(maturity) {
  const m = Math.max(0, Math.min(10, Math.floor(Number(maturity) || 1)));
  let best = TRANT_MAT_STAGES[0];
  for (const stage of TRANT_MAT_STAGES) if (Math.abs(m - stage) < Math.abs(m - best)) best = stage;
  return best;
}

export function treeFrameUrl(classId, maturity) {
  return `assets/sprites/trants/frames/${classId}_m${trantFrameStage(maturity)}.png?v=${TRANT_FRAME_VERSION}`;
}

/** The demo pack: tools plus a spread of Seasoned Beans (one that will not grow here). */
export function patchDemoKit(variant = '1') {
  const items = { hoe: 1, shovel: 1, watering_can: 1, bean_bean: 3, bean_fruit: 1, bean_wood: 1, bean_spice: 1 };
  if (variant === 'dark') items.bean_egg = 2;
  if (variant === 'dead') items.hatchet = 1;
  return items;
}

export function demoPlotClass(variant) {
  if (variant === 'dark') return 'patch_dark';
  if (variant === 'dead') return 'trant_bean_dead';
  return 'patch';
}

function surfaceNear(platforms, x, refY) {
  let best = null;
  for (const platform of Array.isArray(platforms) ? platforms : []) {
    const y = platformYAt(platform, x, 0);
    if (y == null || y < refY - 90 || y > refY + 260) continue;
    if (best == null || Math.abs(y - refY) < Math.abs(best - refY)) best = y;
  }
  return best ?? refY;
}

// ---------------------------------------------------------------------------
// Runtime state
// ---------------------------------------------------------------------------

let entities = [];
let generation = 0;
let lastTickAt = 0;
let lastVerb = '';
let demoUsed = false;
let demoEntity = null;
let autoplayTimers = [];
let toolFx = null;
/** When the last Dametime midnight passed (saved), so unloaded streets catch up. */
let lastNewDayAt = 0;
const effects = [];
const baseTextures = new Map();
const frameTextures = new Map();

function loadBase(PIXI, url) {
  if (baseTextures.has(url)) return baseTextures.get(url);
  const promise = new Promise((resolve) => {
    const tex = textureFromUrl(url);
    const base = tex.source;
    if (isLoaded(base)) {
      resolve(tex);
      return;
    }
    onLoaded(base, () => resolve(tex));
    onFailed(base, () => resolve(null));
  });
  baseTextures.set(url, promise);
  return promise;
}

function sheetFrame(PIXI, base, sheet, index) {
  const key = `${sheet.url}#${index}`;
  if (!frameTextures.has(key)) {
    const cols = sheet.cols || sheet.count;
    const x = (index % cols) * sheet.fw;
    const y = Math.floor(index / cols) * sheet.fh;
    frameTextures.set(key, frameTexture(base, new PIXI.Rectangle(x, y, sheet.fw, sheet.fh)));
  }
  return frameTextures.get(key);
}

async function texturesForPlot(engine, plot) {
  const { PIXI } = engine;
  if (plot.stage === 'tree') {
    const tree = plot.tree;
    if (tree.classId === 'wood_tree') {
      const tex = await loadBase(PIXI, WOOD_SHEET.url);
      if (!tex) return null;
      const m = Math.max(1, Math.min(6, tree.state.maturity || 1));
      return sheetFrame(PIXI, tex.source, WOOD_SHEET, m - 1);
    }
    return loadBase(PIXI, treeFrameUrl(tree.classId, tree.state.maturity));
  }
  return loadBase(PIXI, plotArtPath(plot));
}

function hubIdOf(engine) {
  const street = engine.street || {};
  return street.hubId ?? street.hub_id ?? null;
}

function ctxFor(engine, entity) {
  return {
    inv: engine.inv,
    pc: engine.pc,
    skills: engine.learnedSkills,
    upgrades: engine.pc?.imaginationUpgrades || [],
    buffs: engine.activeBuffIds(),
    toolState: engine.toolState,
    hubId: hubIdOf(engine),
    now: Date.now(),
    owner: true,
    entity,
  };
}

function publish(engine) {
  const stages = entities.map((e) => `${e.key}=${e.plot.stage}`).join(',');
  engine.setData('patchCount', entities.length);
  engine.setData('patchStages', stages);
  engine.setData('patchTrees', entities.filter((e) => e.plot.stage === 'tree').map((e) => `${e.plot.tree.classId}:${e.plot.tree.state.maturity}`).join(','));
  engine.setData('patchLastVerb', lastVerb);
  engine.setData('patchPositions', entities.map((e) => `${Math.round(e.x)},${Math.round(e.y)}`).join(' '));
  if (demoEntity) {
    const p = demoEntity.plot;
    const detail = p.stage === 'seedling'
      ? `${p.seedling.trantClass}:${p.seedling.petted}`
      : p.stage === 'tree'
        ? `${p.tree.classId}:${p.tree.state.maturity}`
        : p.kind;
    engine.setData('patchDemo', `${p.stage}:${detail}`);
  }
}

// ---------------------------------------------------------------------------
// Views
// ---------------------------------------------------------------------------

function dropView(engine, entity) {
  if (entity.target) engine.unregister(entity.target);
  entity.target = null;
  entity.sprite = null;
}

function treeScale(tex, isWood) {
  return Math.min(1, (isWood ? 190 : 210) / Math.max(1, tex?.height || 210));
}

function treeSubtitle(tree) {
  return tree.classId === 'wood_tree' ? woodTreeStatusLabel(tree.state) : trantStatusLabel(tree.state);
}

async function buildView(engine, entity, myGeneration, { grow = false } = {}) {
  const { PIXI } = engine;
  const tex = await texturesForPlot(engine, entity.plot);
  if (myGeneration !== generation || !entities.includes(entity)) return;
  dropView(engine, entity);
  const plot = entity.plot;
  const sprite = new PIXI.Sprite(tex || PIXI.Texture.EMPTY);
  sprite.x = entity.x;
  sprite.y = entity.y + 2;
  sprite.roundPixels = true;
  if (plot.stage === 'tree') {
    const isWood = plot.tree.classId === 'wood_tree';
    sprite.anchor.set(0.5, 1);
    const s = treeScale(tex, isWood);
    sprite._woodDirection = entity.direction;
    sprite.scale.set(entity.direction * s, s);
    sprite.zIndex = Z.tree;
    engine.entityLayer.addChild(sprite);
    entity.sprite = sprite;
    entity.shownMaturity = plot.tree.state.maturity;
    entity.target = engine.register({
      classId: plot.tree.classId,
      label: GROWN_TREE_LABELS[plot.tree.classId],
      subtitle: treeSubtitle(plot.tree),
      sprite,
      state: plot.tree.state,
      grownFromBean: true,
    });
    if (grow) growFx(engine, sprite, s);
    return;
  }
  const dead = plot.stage === 'dead';
  sprite.anchor.set(0.5, dead ? 1 : plot.stage === 'seedling' ? SEEDLING_ANCHOR_Y : SOIL_ANCHOR_Y);
  sprite.zIndex = dead ? Z.tree : Z.soil;
  if (!dead) {
    sprite._worldHitW = 130;
    sprite._worldHitH = plot.stage === 'seedling' ? 70 : 56;
  }
  if (plot.stage === 'seedling') {
    const petted = plot.seedling?.petted || 0;
    const s = 1 + Math.min(3, petted) * 0.07;
    sprite.scale.set(s);
    sprite.playPet = () => wiggle(engine, sprite, s);
  }
  engine.entityLayer.addChild(sprite);
  entity.sprite = sprite;
  entity.target = engine.register({
    classId: plot.stage === 'seedling' ? 'patch_seedling' : dead ? plot.deadClass : plot.kind,
    featureId: PATCHES_FEATURE_ID,
    label: plotLabel(plot),
    subtitle: plotStatusLabel(plot, Date.now()),
    sprite,
    patchKey: entity.key,
  });
}

function refreshTreeView(engine, entity) {
  const plot = entity.plot;
  if (plot.stage !== 'tree' || !entity.sprite || entity.sprite.destroyed) return;
  const tree = plot.tree;
  if (entity.target) entity.target.subtitle = treeSubtitle(tree);
  if (entity.shownMaturity === tree.state.maturity || tree.state.maturity <= 0) return;
  entity.shownMaturity = tree.state.maturity;
  const myGeneration = generation;
  texturesForPlot(engine, plot).then((tex) => {
    if (!tex || myGeneration !== generation || !entity.sprite || entity.sprite.destroyed) return;
    entity.sprite.texture = tex;
    const s = treeScale(tex, tree.classId === 'wood_tree');
    entity.sprite.scale.set(entity.direction * s, s);
    growFx(engine, entity.sprite, s);
  });
}

// ---------------------------------------------------------------------------
// Effects
// ---------------------------------------------------------------------------

function addEffect(update) {
  effects.push({ t: 0, update });
}

function tickEffects(dtMs) {
  for (let i = effects.length - 1; i >= 0; i -= 1) {
    const fx = effects[i];
    fx.t += dtMs;
    if (fx.update(fx.t) === false) effects.splice(i, 1);
  }
}

function wiggle(engine, sprite, base) {
  addEffect((t) => {
    if (sprite.destroyed) return false;
    const k = Math.min(1, t / 650);
    const damp = 1 - k;
    sprite.rotation = Math.sin(t / 45) * 0.12 * damp;
    sprite.scale.set(base * (1 + Math.sin(k * Math.PI) * 0.08), base * (1 + Math.sin(k * Math.PI) * 0.14));
    if (k >= 1) {
      sprite.rotation = 0;
      sprite.scale.set(base);
      return false;
    }
    return true;
  });
}

/** A short sprout-up tween plus leafy sparkles when a tree appears or grows. */
function growFx(engine, sprite, scale) {
  const dir = Math.sign(sprite.scale.x) || 1;
  addEffect((t) => {
    if (sprite.destroyed) return false;
    const k = Math.min(1, t / 700);
    const e = 1 - (1 - k) ** 3;
    const over = Math.sin(k * Math.PI) * 0.06;
    sprite.scale.set(dir * scale * (0.82 + 0.18 * e + over * 0.5), scale * (0.6 + 0.4 * e + over));
    return k < 1;
  });
  const { PIXI } = engine;
  for (let i = 0; i < 14; i += 1) {
    const leaf = new PIXI.Graphics();
    const green = [0x7fbf4d, 0x9bd66f, 0x5fa83a, 0xc7e98f][i % 4];
    leaf.ellipse(0, 0, 5, 2.6).fill({ color: green, alpha: 0.95 });
    const angle = -Math.PI / 2 + (i / 13 - 0.5) * 2.4;
    const speed = 1.6 + (i % 5) * 0.35;
    leaf.x = sprite.x;
    leaf.y = sprite.y - 30;
    leaf.zIndex = 9000;
    engine.fxLayer.addChild(leaf);
    addEffect((t) => {
      if (leaf.destroyed) return false;
      const k = t / 900;
      leaf.x = sprite.x + Math.cos(angle) * speed * t * 0.06;
      leaf.y = sprite.y - 30 + Math.sin(angle) * speed * t * 0.06 + k * k * 40;
      leaf.rotation = t / 120 + i;
      leaf.alpha = Math.max(0, 1 - k);
      if (k >= 1) {
        leaf.parent?.removeChild(leaf);
        leaf.destroy();
        return false;
      }
      return true;
    });
  }
}

/** Grey-brown dust where a tree has just died (no source overlay for die()). */
function deathPuff(engine, x, y) {
  soilPuff(engine, x, y - 40, 0x6b6253);
  soilPuff(engine, x + 18, y - 90, 0x857a66);
}

/** Puff of soil when tending or digging finishes. */
function soilPuff(engine, x, y, color = 0x7a5532) {
  const { PIXI } = engine;
  for (let i = 0; i < 10; i += 1) {
    const clod = new PIXI.Graphics();
    clod.circle(0, 0, 2 + (i % 3)).fill({ color: i % 3 ? color : 0x5b3d22, alpha: 0.9 });
    clod.zIndex = 9000;
    engine.fxLayer.addChild(clod);
    const vx = (i - 4.5) * 0.45;
    const vy = -2.2 - (i % 4) * 0.5;
    addEffect((t) => {
      if (clod.destroyed) return false;
      const s = t / 16;
      clod.x = x + vx * s;
      clod.y = y - 8 + vy * s + 0.09 * s * s;
      clod.alpha = Math.max(0, 1 - t / 650);
      if (t >= 650) {
        clod.parent?.removeChild(clod);
        clod.destroy();
        return false;
      }
      return true;
    });
  }
}

function stopToolFx() {
  if (!toolFx) return;
  toolFx.sprite.parent?.removeChild(toolFx.sprite);
  if (!toolFx.sprite.destroyed) toolFx.sprite.destroy();
  toolFx = null;
}

/** The source tool_animation sheet beside the avatar while a timed verb runs. */
async function startToolFx(engine, entity, verb) {
  const sheet = TOOL_SHEETS[VERB_TOOL[verb]];
  if (!sheet) return;
  stopToolFx();
  const { PIXI } = engine;
  const tex = await loadBase(PIXI, sheet.url);
  if (!tex || !engine.player || !entity.sprite) return;
  const frames = Array.from({ length: sheet.count }, (_, i) => sheetFrame(PIXI, tex.source, sheet, i));
  const tool = new PIXI.AnimatedSprite(frames);
  const left = entity.sprite.x < engine.player.x;
  tool.anchor.set(0.5);
  tool.x = engine.player.x + (left ? -34 : 34);
  tool.y = engine.player.y - (verb === 'dig' ? 44 : 30);
  tool.scale.set(left ? -1 : 1, 1);
  tool.animationSpeed = verb === 'dig' ? 0.45 : 0.3;
  tool.loop = true;
  tool.zIndex = 100000;
  tool.eventMode = 'none';
  engine.fxLayer.addChild(tool);
  tool.play();
  toolFx = { sprite: tool, entity, startedAt: Date.now() };
  engine.setData('patchToolAnimation', `${VERB_TOOL[verb]}:playing`);
}

// ---------------------------------------------------------------------------
// Verbs
// ---------------------------------------------------------------------------

/**
 * GSJS sendResponse talkback in a target-following bubble (engine.say). The
 * bubble follows the plot's current sprite but names the speaker explicitly,
 * so a Seedling's last words stay the Seedling's when it becomes a tree.
 */
function talk(engine, entity, text, speaker) {
  if (!entity.sprite || entity.sprite.destroyed || typeof engine.say !== 'function') return;
  if (!entity.voice) {
    entity.voice = {
      label: '',
      get sprite() {
        return entity.sprite;
      },
    };
  }
  entity.voice.label = speaker;
  engine.say(entity.voice, text, 4500);
}

function itemLabel(classTsid, qty) {
  const def = SOIL_ITEM_DEFS[classTsid];
  if (!def) return `${qty} ${classTsid.replace(/_/g, ' ')}`;
  return `${qty} ${qty === 1 ? def.label : def.namePlural}`;
}

function performVerb(engine, entity, verbId) {
  stopToolFx();
  const ctx = ctxFor(engine, entity);
  const before = entity.plot.stage;
  const result = performPlotVerb(entity.plot, verbId, ctx);
  lastVerb = `${verbId}:${result.ok ? 'ok' : result.reason || 'failed'}`;
  const sprite = entity.sprite;
  const x = sprite?.x ?? entity.x;
  const y = sprite?.y ?? entity.y;
  if (!result.ok) {
    if (result.response) talk(engine, entity, result.response, plotLabel(entity.plot));
    engine.toast(result.msg, 2400);
    if (result.sound) engine.playSound?.(result.sound, { volume: 0.45 });
    publish(engine);
    return result;
  }
  if (result.verbId === 'plant' && entity === demoEntity) {
    const growMs = Number(engine.param('patchgrowms')) || (engine.param('patchautoplay') === '1' ? 3000 : 0);
    if (growMs > 0 && entity.plot.seedling) entity.plot.seedling.minAt = ctx.now + growMs;
  }
  if (result.toolUse?.broke) engine.toast(result.toolUse.msg, 3600);
  engine.pushActivity(result.activity);
  let lift = 0;
  for (const out of result.outputs || []) {
    engine.floatText(x, y - 60 - lift, `+${itemLabel(out.classTsid, out.qty)}`, 0xfff4d6);
    lift += 18;
  }
  if (result.costs?.currants) engine.floatText(x, y - 60 - lift, `+${result.costs.currants} currants`, 0xffe066);
  if (result.costs?.energy) engine.floatText(engine.player.x, engine.player.y - 70, `-${result.costs.energy} energy`, 0xff8888);
  if (result.costs?.mood) engine.floatText(engine.player.x + 20, engine.player.y - 90, `+${result.costs.mood} mood`, 0xffe066);
  if (result.costs?.xp) engine.floatText(engine.player.x - 20, engine.player.y - 90, `+${result.costs.xp} iMG`, 0xb388ff);
  for (const row of result.counters || []) engine.achievement(row.counter, row.amount);
  if (result.verbId === 'tend' || result.verbId === 'dig') soilPuff(engine, x, y);
  engine.playSound?.({ pet: 'PET_TRANT', water: 'WATERING_CAN', dig: 'SHOVEL', tend: 'HOE', plant: 'GARDEN_PLANT' }[result.verbId] || 'ITEM_PICKUP', { volume: 0.6, jitter: 0.05 });
  engine.refreshPack();
  const rebuild = before !== entity.plot.stage || result.verbId === 'pet';
  const myGeneration = generation;
  // GSJS: the seedling answers a planting or petting; the patch answers the rest.
  const speaker = result.verbId === 'pet' || result.verbId === 'plant' ? 'Seedling' : plotLabel(entity.plot);
  const after = () => {
    if (result.response) talk(engine, entity, result.response, speaker);
  };
  if (rebuild) {
    buildView(engine, entity, myGeneration, { grow: entity.plot.stage === 'tree' }).then(() => {
      if (result.verbId === 'pet' && entity.sprite?.playPet) entity.sprite.playPet();
      after();
    });
  } else {
    after();
  }
  publish(engine);
  engine.save();
  return result;
}

const PACK_PLANT_RADIUS = 220;

/** Nearest Patch/Dark Patch in reach that this bean may grow in (any stage). */
function nearestPatchFor(engine, beanClass) {
  const player = engine.player;
  if (!player) return null;
  let best = null;
  for (const entity of entities) {
    const plot = entity.plot;
    if (!['dirty', 'clean', 'dug'].includes(plot.stage)) continue;
    if (!canPlantBean(beanClass, plot.kind, hubIdOf(engine))) continue;
    const d = Math.hypot(entity.x - player.x, (entity.y - player.y) * 0.5);
    if (d > PACK_PLANT_RADIUS) continue;
    const rank = (plot.stage === 'clean' ? 0 : 1) * 1e6 + d;
    if (!best || rank < best.rank) best = { entity, rank };
  }
  return best?.entity || null;
}

// ---------------------------------------------------------------------------
// Street lifecycle
// ---------------------------------------------------------------------------

function demoVariant(engine) {
  const raw = engine.param('patchdemo');
  if (!raw) return null;
  return ['clean', 'seedling', 'dark', 'dead', 'tree'].includes(raw) ? raw : '1';
}

function setupDemo(engine, slot, planned) {
  if (demoUsed) return planned;
  const variant = demoVariant(engine);
  if (!variant) return planned;
  demoUsed = true;
  for (const [classTsid, qty] of Object.entries(patchDemoKit(variant))) {
    engine.inv[classTsid] = Math.max(qty, engine.inv[classTsid] || 0);
  }
  if ((engine.pc.energy || 0) < 80) engine.pc.energy = 80;
  const key = `demo:${variant}`;
  const now = Date.now();
  if (engine.param('patchreset') === '1' || !normalizePlot(slot.plots?.[key])) {
    const plot = createPlot(demoPlotClass(variant), { now, hubId: hubIdOf(engine), seed: key });
    if (variant === 'clean') {
      plot.stage = 'clean';
      plot.dueAt = now + 90000;
    }
    if (variant === 'seedling' || variant === 'tree') {
      plot.stage = 'seedling';
      plot.seedling = {
        trantClass: 'trant_bean', beanClass: 'bean_bean', plantedAt: now, minAt: now, maxAt: now + 4 * 3600000,
        upgradeGrowLevel: 0, petted: variant === 'tree' ? 3 : 0, petters: 0, growLevel: 0, thirdPetAt: variant === 'tree' ? now : 0,
      };
      // &patchmaturity=1-10 (1-6 for wood) starts the QA tree grown, so Harvest is available.
      const maturity = Math.floor(Number(engine.param('patchmaturity')));
      if (variant === 'tree' && maturity >= 1) plot.seedling.growLevel = Math.min(10, maturity);
      const species = engine.param('patchtree');
      if (variant === 'tree' && GROWN_TREE_LABELS[species]) plot.seedling.trantClass = species;
    }
    slot.plots ||= {};
    slot.plots[key] = plot;
  }
  const player = engine.player;
  const side = player.x > engine.worldW - 260 ? -1 : 1;
  const x = player.x + side * 160;
  engine.refreshPack();
  return [...planned, { key, classTsid: demoPlotClass(variant), x, y: surfaceNear(engine.platforms, x, player.y), demo: true }];
}

function scheduleAutoplay(engine) {
  if (!demoEntity || engine.param('patchautoplay') !== '1') return;
  for (const t of autoplayTimers) clearTimeout(t);
  autoplayTimers = [];
  const steps = [];
  const stage = demoEntity.plot.stage;
  if (stage === 'dead') steps.push('clear');
  if (stage === 'dirty' || stage === 'dead') steps.push('tend');
  if (stage !== 'seedling' && stage !== 'tree') steps.push(demoEntity.plot.kind === 'patch_dark' ? 'plant:bean_egg' : 'plant:bean_bean');
  if (stage !== 'tree') steps.push('pet', 'pet', 'pet');
  let at = 1200;
  for (const verb of steps) {
    const myGeneration = generation;
    autoplayTimers.push(setTimeout(() => {
      if (myGeneration !== generation || !entities.includes(demoEntity)) return;
      performVerb(engine, demoEntity, verb);
    }, at));
    at += verb === 'pet' ? 900 : 1500;
  }
}

async function spawnStreet(engine, items, myGeneration) {
  const { PIXI } = engine;
  await Promise.all(soilSpritePaths().map((path) => loadBase(PIXI, path)));
  if (myGeneration !== generation) return;
  // A street tree that died while this street loaded (adoptPlot) is already building.
  const adoptedMeanwhile = entities.filter((e) => e.adopted && !items.some((item) => item.key === e.key));
  const spawned = items.map((item, index) => ({
    ...item,
    direction: index % 2 ? -1 : 1,
    sprite: null,
    target: null,
  }));
  entities = [...spawned, ...adoptedMeanwhile];
  demoEntity = entities.find((e) => e.demo) || null;
  await Promise.all(spawned.map((entity) => buildView(engine, entity, myGeneration)));
  if (myGeneration !== generation) return;
  publish(engine);
  scheduleAutoplay(engine);
}

function ensureSoilItems() {
  for (const [classTsid, def] of Object.entries(SOIL_ITEM_DEFS)) {
    ensureItem(classTsid, def);
  }
}

// ---------------------------------------------------------------------------
// Feature
// ---------------------------------------------------------------------------

export const patchesFeature = {
  id: PATCHES_FEATURE_ID,

  init(engine) {
    ensureSoilItems();
    publish(engine);
  },

  placementGroups(population, street) {
    return soilPlacementGroups(soilCountsForStreet(street?.tsid));
  },

  onStreetEnter(street, engine) {
    generation += 1;
    const myGeneration = generation;
    const slot = engine.streetSlot(PATCHES_FEATURE_ID);
    // Home streets pass their cultivated Patches (js/features/homes-feature.js).
    const counts = street?.soilCounts || soilCountsForStreet(street?.tsid || engine.streetTsid);
    const now = Date.now();
    let planned = [...soilSpawnPlan(counts, (key) => engine.placement(key)), ...adoptedPlan(slot)];
    planned = setupDemo(engine, slot, planned);
    const items = prepareStreetPlots(slot, planned, { tsid: engine.streetTsid, hubId: hubIdOf(engine), now });
    // Catch up on time spent away (seedlings, regrowth, tree maturity).
    for (const item of items) {
      resetPlotDayIfStale(item.plot, lastNewDayAt, Math.random, now);
      tickPlot(item.plot, now);
    }
    if (!items.length) {
      entities = [];
      demoEntity = null;
      publish(engine);
      return;
    }
    spawnStreet(engine, items, myGeneration);
  },

  onStreetClear() {
    generation += 1;
    for (const t of autoplayTimers) clearTimeout(t);
    autoplayTimers = [];
    stopToolFx();
    effects.length = 0;
    entities = [];
    demoEntity = null;
  },

  onTick(dtMs, now, engine) {
    if (!entities.length && !effects.length && !toolFx) return;
    tickEffects(dtMs);
    if (toolFx && !engine.busy()) stopToolFx();
    for (const entity of entities) {
      const sprite = entity.sprite;
      const fx = sprite?._trantHarvestFx;
      // game.js pulses only its own `trees` list; mirror it for grown trees.
      if (fx && !sprite.destroyed) {
        const dt = dtMs / (1000 / 60);
        fx.phase += 0.13 * dt;
        fx.remaining -= dt;
        const pulse = 1 + Math.sin(fx.phase) * 0.035;
        sprite.scale.x = fx.baseScaleX * pulse;
        sprite.scale.y = fx.baseScaleY * (1 + Math.cos(fx.phase * 0.85) * 0.025);
        sprite.rotation = fx.baseRotation + Math.sin(fx.phase * 0.62) * 0.012;
        if (fx.remaining <= 0) {
          sprite.scale.set(fx.baseScaleX, fx.baseScaleY);
          sprite.rotation = fx.baseRotation;
          delete sprite._trantHarvestFx;
        }
      }
    }
    if (now - lastTickAt < TICK_MS) return;
    lastTickAt = now;
    let dirty = false;
    for (const entity of entities) {
      const before = entity.plot.stage;
      const { changed, events } = tickPlot(entity.plot, now);
      if (before !== entity.plot.stage) {
        dirty = true;
        const grew = events.includes('grew');
        if (grew) engine.pushActivity(`A Seedling grew into a ${GROWN_TREE_LABELS[entity.plot.tree.classId]}!`);
        if (events.includes('withered')) engine.pushActivity('A Seedling went too long without petting and withered back into a Patch.');
        buildView(engine, entity, generation, { grow: grew });
      } else if (entity.plot.stage === 'tree') {
        refreshTreeView(engine, entity);
      } else if (entity.target) {
        entity.target.subtitle = plotStatusLabel(entity.plot, now);
      }
      if (changed && events.includes('matured') && entity.plot.stage === 'tree') dirty = true;
    }
    if (dirty) {
      publish(engine);
      engine.save();
    }
  },

  onNewDay(now, engine) {
    // Trees on other streets catch up from lastNewDayAt when next entered.
    lastNewDayAt = now;
    for (const entity of entities) {
      if (resetPlotDay(entity.plot, Math.random, now)) refreshTreeView(engine, entity);
    }
  },

  verbsFor(target, engine) {
    const entity = entities.find((row) => row.target === target);
    if (!entity) return [];
    const ctx = ctxFor(engine, entity);
    return plotVerbs(entity.plot, ctx).map((verb) => {
      const row = {
        id: verb.id,
        label: verb.label,
        enabled: verb.enabled,
        tooltip: verb.tooltip,
        reason: verb.reason,
        energy: verb.energy || 0,
      };
      const ms = verb.enabled ? verb.durationMs || 0 : 0;
      const base = verb.id.split(':')[0];
      if (ms > 0 && VERB_TOOL[base]) {
        // game.js reads durationMs once as the timed action starts: use that
        // moment to show the source tool animation beside the avatar.
        let started = false;
        Object.defineProperty(row, 'durationMs', {
          enumerable: true,
          get() {
            if (!started) {
              started = true;
              startToolFx(engine, entity, base);
            }
            return ms;
          },
        });
      } else {
        row.durationMs = ms;
      }
      return row;
    });
  },

  runVerb(target, verbId, engine) {
    const entity = entities.find((row) => row.target === target);
    if (!entity) return true;
    performVerb(engine, entity, verbId);
    return true;
  },

  /**
   * bean_base `plant` from the pack: "Only works next to clean patch." Uses
   * the nearest suitable patch within reach (GSJS config.verb_radius stand-in).
   */
  packVerbs(classTsid, engine) {
    if (!SEASONED_BEANS[classTsid]) return [];
    const near = nearestPatchFor(engine, classTsid);
    const reason = !near
      ? 'Find a suitable patch to plant it in!'
      : near.plot.stage === 'dirty'
        ? 'That patch needs tending.'
        : near.plot.stage === 'dug'
          ? 'That patch has been dug. Your poor bean would get lost in there!'
          : near.plot.stage !== 'clean'
            ? 'That patch already has something growing.'
            : '';
    return [{ id: 'plant', label: 'Plant', enabled: !reason, reason, tooltip: 'Only works next to clean patch.', primary: !reason }];
  },

  runPackVerb(classTsid, verbId, engine) {
    if (verbId !== 'plant' || !SEASONED_BEANS[classTsid]) return false;
    const near = nearestPatchFor(engine, classTsid);
    if (!near || near.plot.stage !== 'clean') {
      engine.toast('Find a suitable patch to plant it in!', 2400);
      return true;
    }
    performVerb(engine, near, `plant:${classTsid}`);
    return true;
  },

  save() {
    return { version: 1, lastNewDayAt };
  },

  restore(slice) {
    const at = Number(slice?.lastNewDayAt);
    lastNewDayAt = Number.isFinite(at) && at > 0 ? at : 0;
  },

  /**
   * A dead street tree's plot (tree-death-feature): `soilClass` is a dead
   * trant class or `patch`. Saved under `key` with its spot; shown at once
   * when the street is loaded.
   */
  adoptPlot(engine, { key, soilClass, x, y }) {
    const slot = engine.streetSlot(PATCHES_FEATURE_ID);
    slot.plots ||= {};
    slot.adopted ||= {};
    const now = Date.now();
    const plot = createPlot(soilClass, { now, hubId: hubIdOf(engine), seed: `${engine.streetTsid}:${key}` });
    slot.plots[key] = plot;
    slot.adopted[key] = { x: Math.round(x), y: Math.round(y) };
    const old = entities.find((e) => e.key === key);
    if (old) {
      dropView(engine, old);
      entities = entities.filter((e) => e !== old);
    }
    const entity = { key, classTsid: plot.classTsid, x, y, plot, adopted: true, direction: entities.length % 2 ? -1 : 1, sprite: null, target: null };
    entities.push(entity);
    buildView(engine, entity, generation, {}).then(() => {
      if (entity.sprite && !entity.sprite.destroyed) deathPuff(engine, entity.sprite.x, entity.sprite.y);
      publish(engine);
    });
    publish(engine);
    return entity;
  },

  /** A grown tree registered by this feature (target.grownFromBean) dies. */
  killTree(engine, target) {
    const entity = entities.find((row) => row.target === target);
    if (!entity) return null;
    const out = killPlotTree(entity.plot, Date.now());
    if (!out) return null;
    const x = entity.sprite?.x ?? entity.x;
    const y = entity.sprite?.y ?? entity.y;
    buildView(engine, entity, generation, {}).then(() => {
      deathPuff(engine, x, y);
      publish(engine);
    });
    publish(engine);
    engine.save();
    return { ...out, x, y, key: entity.key };
  },

  /** QA: the plot entity for a key on the loaded street. */
  entityByKey(key) {
    return entities.find((e) => e.key === key) || null;
  },

  /** QA autoplay: run one plot verb by key (tree-death-feature's patch cycle route). */
  runPlotVerb(engine, key, verbId) {
    const entity = entities.find((e) => e.key === key);
    return entity ? performVerb(engine, entity, verbId) : null;
  },

  /** QA / tests. */
  _state() {
    return { entities: entities.length, demo: demoEntity?.plot?.stage || null, lastVerb };
  },
};
