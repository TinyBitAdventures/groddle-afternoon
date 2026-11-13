/**
 * Enchanted Forests as a feature module (see js/feature-host.js).
 *
 * The three hollows are ordinary street JSON written by
 * tools/build-enchanted-forests.mjs from js/enchanted-forests.js, so their
 * mini doors, way out, platforms and parallax need nothing here. This file
 * adds what a street JSON cannot carry:
 * - an empty ecology (the hollows held Wood Trees and nothing else);
 * - the wiki's tree count of Enchanted Wood Trees (17 / 9 / 21), standing on
 *   the shelves where the Tribute Blog panoramas show them
 *   (js/enchanted-forests.js hollowTreeSpots), each a plain `wood_tree` target whose state is flagged
 *   `enchanted`, so the shared harvest / pet / water verbs, the Hatchet
 *   animation, badges and quests all run unchanged while woodcutting.js uses
 *   the 10-60 plank map. Art: wood_tree_enchanted.swf (4 variants x 6
 *   maturities, 3x). Tree Poison skips them (tree-death-feature isTreeTarget);
 *   care growth follows wood_tree.js, counted where the pet or water lands
 *   (woodcutting.js noteWoodCare, from trant-care.js);
 * - wood_tree_enchanted.js onDie: a tree harvested to maturity 0 turns into
 *   an enchanted seedling 2 s later and grows back as a fresh maturity-1
 *   tree 5 minutes after that (patch_seedling.js min_time). The seedling's
 *   pet costs 2 energy and says it needs no more petting.
 *
 * QA (reach a hollow through its real mini door, see doors-feature):
 *   ?autostart=1&fresh=1&resetgame=1&questoffer=off&doordemo=GCR195Q63RK143M&doorautoplay=1
 *       Grimssea Bottom -> Grimssea Hollow (GIF7SHGS3E72T8L Afar Whence,
 *       GUV22FOR7AF2TIE Magha Shank for the other two)
 *   &enchantedmaturity=1..6   set every tree in the hollow on arrival
 *   &enchantedseedlingms=N    seedling grow time for QA (default 300000)
 *   &enchantedreset=1         start the hollow's trees fresh
 * Canvas data: enchantedForest, enchantedTrees, enchantedStages,
 * enchantedSeedlings, enchantedLast, enchantedYield.
 */

import { slugsFromEffects } from '../speech-slugs.js?v=130338f9';
import { worldToScreen } from '../street-model.js?v=b6cb6a4e';
import { frameTexture, textureFromUrl } from '../textures.js?v=92ec53cd';
import { ensureWoodTreeState, resetWoodTreeDay, woodTreeStatusLabel } from '../woodcutting.js?v=d2b88bb5';
import {
  ENCHANTED_FORESTS,
  ENCHANTED_WOOD_TREE,
  advanceEnchantedTree,
  createEnchantedTree,
  enchantedForestByTsid,
  enchantedTreeFrame,
  hollowTreeSpots,
  normalizeEnchantedTree,
  petEnchantedSeedling,
  seedlingStatusLabel,
} from '../enchanted-forests.js?v=da978edc';

export const ENCHANTED_FEATURE_ID = 'enchanted-forest';
const SEEDLING_URL = 'assets/sprites/soil/patch-seedling@3x.webp';
const SEEDLING_ANCHOR_Y = 0.86;
const TREE_Z = 16;
const TICK_MS = 250;

let entities = []; // { index, tree, target, sprite, stage, maturity }
let forest = null;
let generation = 0;
let lastTick = 0;
let petTurn = 0;
let last = '';

/* ------------------------------------------------------------------ */
/* Pure helpers (tests/enchanted-forests.test.js)                       */
/* ------------------------------------------------------------------ */

/** Screen x,y (the foot) of each of a hollow's trees, from its measured layout. */
export function treeScreenSpots(street, f) {
  return hollowTreeSpots(f).map((t) => worldToScreen(street, t.x, t.y));
}

/** The hollow's saved trees, created on first visit, repaired on every load. */
export function hollowTrees(slot, f, { reset = false } = {}) {
  if (reset || !Array.isArray(slot.trees) || slot.trees.length !== f.woodTrees) {
    slot.trees = Array.from({ length: f.woodTrees }, (_, i) => createEnchantedTree({ seed: `${f.tsid}:${i}` }));
  }
  slot.trees.forEach((tree, i) => {
    normalizeEnchantedTree(tree, `${f.tsid}:${i}`);
    tree.classId = 'wood_tree';
  });
  return slot.trees;
}

/* ------------------------------------------------------------------ */
/* Views                                                                */
/* ------------------------------------------------------------------ */

const sheetCache = new Map();
function treeTexture(engine, variant, maturity) {
  const { sheet, index } = enchantedTreeFrame(variant, maturity);
  const key = `${sheet.url}#${index}`;
  if (!sheetCache.has(key)) {
    const source = textureFromUrl(sheet.url).source;
    sheetCache.set(key, frameTexture(source, new engine.PIXI.Rectangle(index * sheet.fw, 0, sheet.fw, sheet.fh)));
  }
  return sheetCache.get(key);
}

function treeSubtitle(entity, now = Date.now()) {
  if (entity.tree.stage === 'seedling') return seedlingStatusLabel(entity.tree, now);
  return woodTreeStatusLabel(entity.tree.state).replace(/^(\w+)/, 'Enchanted · $1');
}

function dropView(engine, entity) {
  if (entity.target) engine.unregister(entity.target);
  else if (entity.sprite && !entity.sprite.destroyed) entity.sprite.destroy();
  entity.target = null;
  entity.sprite = null;
}

function buildView(engine, entity) {
  const { PIXI } = engine;
  dropView(engine, entity);
  const { tree } = entity;
  entity.stage = tree.stage;
  if (tree.stage === 'seedling') {
    const sprite = new PIXI.Sprite(textureFromUrl(SEEDLING_URL));
    sprite.anchor.set(0.5, SEEDLING_ANCHOR_Y);
    sprite.x = entity.x;
    sprite.y = entity.y + 2;
    sprite.zIndex = TREE_Z - 1;
    sprite._worldHitW = 130;
    sprite._worldHitH = 70;
    engine.entityLayer.addChild(sprite);
    entity.sprite = sprite;
    entity.target = engine.register({
      classId: 'patch_seedling',
      featureId: ENCHANTED_FEATURE_ID,
      label: 'Seedling',
      subtitle: treeSubtitle(entity),
      sprite,
      enchantedIndex: entity.index,
    });
    return;
  }
  const state = ensureWoodTreeState(tree.state);
  const sprite = new PIXI.Sprite(treeTexture(engine, tree.variant, state.maturity));
  sprite.anchor.set(0.5, 1);
  sprite.roundPixels = true;
  sprite._woodDirection = entity.index % 2 ? -1 : 1;
  sprite.scale.set(sprite._woodDirection, 1);
  sprite.x = entity.x;
  sprite.y = entity.y + 2;
  sprite.zIndex = TREE_Z;
  engine.entityLayer.addChild(sprite);
  entity.sprite = sprite;
  entity.maturity = state.maturity;
  entity.target = engine.register({
    classId: 'wood_tree',
    label: ENCHANTED_WOOD_TREE.label,
    subtitle: treeSubtitle(entity),
    sprite,
    state,
    enchantedIndex: entity.index,
    // The hollow's Nth tree (it holds no other trees): its own Rook key, kept through a seedling's regrowth.
    classIndex: entity.index,
    // game.js refreshWoodTreeVisual: this tree's own art.
    woodTexture: (s) => treeTexture(engine, tree.variant, s.maturity),
  });
}

let published = '';
const stagesOf = () => entities.map((e) => (e.tree.stage === 'tree' ? `t${e.tree.state.maturity}` : 's')).join(',');

function publish(engine) {
  published = stagesOf();
  engine.setData('enchantedForest', forest ? forest.id : '');
  engine.setData('enchantedTrees', entities.filter((e) => e.tree.stage === 'tree').length);
  engine.setData('enchantedSeedlings', entities.filter((e) => e.tree.stage === 'seedling').length);
  engine.setData('enchantedStages', published);
  engine.setData('enchantedLast', last);
}

function clear() {
  generation += 1;
  entities = [];
  forest = null;
}

/* ------------------------------------------------------------------ */
/* Feature                                                              */
/* ------------------------------------------------------------------ */

function seedlingMs(engine) {
  const n = Number(engine.param('enchantedseedlingms'));
  return Number.isFinite(n) && n > 0 ? n : ENCHANTED_WOOD_TREE.seedlingMinMs;
}

function advance(engine, entity, now) {
  const { tree } = entity;
  const before = tree.stage;
  const event = advanceEnchantedTree(tree, now);
  if (event === 'died') {
    // QA override of the 5 minute wait, measured from the moment it died.
    const ms = seedlingMs(engine);
    if (ms !== ENCHANTED_WOOD_TREE.seedlingMinMs) tree.growAt = now + ms;
    last = `died:${entity.index}`;
  }
  if (event === 'grew') last = `grew:${entity.index}`;
  if (tree.stage !== before || event) {
    buildView(engine, entity);
    engine.save();
    publish(engine);
  }
}

export const enchantedForestFeature = {
  id: ENCHANTED_FEATURE_ID,

  /** The hollows held Wood Trees only: no animals, rocks, shrine or vendor. */
  ecologyOverride(street) {
    const f = enchantedForestByTsid(street?.tsid);
    if (!f) return null;
    return { label: f.label, sourceTsid: f.sourceTsid, counts: {}, spawners: 0 };
  },

  onStreetEnter(street, engine) {
    clear();
    const f = enchantedForestByTsid(street?.tsid);
    if (!f) {
      publish(engine);
      return;
    }
    forest = f;
    const slot = engine.streetSlot(ENCHANTED_FEATURE_ID);
    const trees = hollowTrees(slot, f, { reset: engine.param('enchantedreset') === '1' });
    const qaMaturity = Number(engine.param('enchantedmaturity'));
    if (qaMaturity >= 1 && qaMaturity <= 6 && !slot.qaApplied) {
      for (const tree of trees) {
        tree.stage = 'tree';
        tree.dieAt = 0;
        tree.growAt = 0;
        tree.state.maturity = qaMaturity;
        tree.state.harvestCount = 0;
        tree.state.harvestedToday = false;
      }
      slot.qaApplied = true;
    }
    const spots = treeScreenSpots(street, f);
    const now = Date.now();
    entities = trees.map((tree, index) => ({
      index,
      tree,
      x: spots[index].x,
      y: spots[index].y,
      target: null,
      sprite: null,
    }));
    for (const entity of entities) {
      advanceEnchantedTree(entity.tree, now);
      buildView(engine, entity);
    }
    engine.setData('enchantedYield', ENCHANTED_WOOD_TREE.plankYieldByMaturity.join(','));
    publish(engine);
  },

  onStreetClear() {
    clear();
  },

  onTick(_dtMs, now, engine) {
    if (!forest || now - lastTick < TICK_MS) return;
    lastTick = now;
    for (const entity of entities) {
      const { tree } = entity;
      if (tree.stage === 'tree') {
        // Care grew it where the pet or water landed (game.js counts heal_trant and maxed).
        if (entity.target && entity.maturity !== tree.state.maturity && tree.state.maturity > 0) {
          if (tree.state.maturity > entity.maturity) last = `matured:${entity.index}:${tree.state.maturity}`;
          entity.maturity = tree.state.maturity;
          entity.sprite.texture = treeTexture(engine, tree.variant, tree.state.maturity);
        }
      }
      advance(engine, entity, now);
      if (entity.target) entity.target.subtitle = treeSubtitle(entity, now);
    }
    const stages = stagesOf();
    if (stages !== published) publish(engine);
  },

  /** A new game day: every visited hollow's trees can be harvested and tended again. */
  onNewDay(_now, engine) {
    const visited = new Set(engine.visitedStreets?.() || []);
    for (const f of ENCHANTED_FORESTS) {
      if (!visited.has(f.tsid)) continue;
      const slot = engine.streetSlot(ENCHANTED_FEATURE_ID, f.tsid);
      for (const tree of Array.isArray(slot.trees) ? slot.trees : []) {
        if (tree?.state) resetWoodTreeDay(tree.state);
      }
    }
    for (const entity of entities) if (entity.target) entity.target.subtitle = treeSubtitle(entity);
  },

  /** Seedlings are this feature's own targets. */
  verbsFor(target) {
    if (target?.classId !== 'patch_seedling') return null;
    return [{
      id: 'pet',
      label: 'pet',
      sort: 51,
      tooltip: 'Help it grow up',
      energy: ENCHANTED_WOOD_TREE.seedlingPetEnergy,
      enabled: true,
      reason: '',
    }];
  },

  runVerb(target, verbId, engine) {
    const entity = entities.find((e) => e.target === target);
    if (!entity || verbId !== 'pet') return true;
    const result = petEnchantedSeedling(entity.tree, engine.pc, petTurn);
    petTurn += 1;
    engine.updateHud();
    // patch_seedling.js 245: pet_no_more with the 2 energy it cost.
    engine.say?.(target, result.bubble, 3500, { slugs: slugsFromEffects({ energy: -(result.energyCost || 0) }) });
    engine.pushActivity(result.msg);
    last = `seedling-pet:${entity.index}`;
    engine.save();
    publish(engine);
    return true;
  },

  /** QA / tests. */
  _state() {
    return { forest, entities, last };
  },
};

