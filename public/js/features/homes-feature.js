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
 * signpost (its Back to Ur arm) targets, and `enter()` spawns furniture or cultivations.
 *
 * Cultivations reuse the public-street systems through the engine:
 * gardens via engine.spawnGarden, rocks via engine.spawnMineRock (their state in
 * the street's own world slot), and Peat Bogs, Dirt Piles, Jellisac Mounds,
 * Barnacle Pods and Firefly Hives through the resource-nodes feature, fed this
 * street's cultivated population and exact placement points.
 *
 * Art: recovered CC0 furniture frames (assets/sprites/furniture), the CC0
 * Groddle / Firebog / Uralia decos for the street, and the house shell from
 * Tiny Speck's home_wallpaper.swf / home_groddle.swf / home_tower.swf pieces
 * (js/home-wallpaper.js, tools/home-wallpaper/build.py). Swatches are stamped
 * like the client's HandOfDecorator: pick one, click a wall segment's middle
 * (that segment), elsewhere on the wall (the room), the floor or the ceiling.
 *
 * The back yard (register G135): the house interior is a "house-right"
 * location (inc_homes.js homes_rebuild_rooms 472-541), so the scene puts the
 * yard left of the house: world x 0 .. the yard's width is the yard, the room
 * (furniture and swatches in room x) starts there. The ground floor's left end
 * is open (homes_get_floor_config 446, homes_rebuild_floor 'left-open'): a
 * ramp runs from the yard ground (the frame bottom, 60 px under the floor) up
 * into the house, under the frame_open post. Cultivate works there on the
 * back yard's own state (js/home-cultivation.js yard 'back'), with its own
 * world slots (rocks, nodes, plots on RH_HOME_INT); Expand grows it leftwards
 * (the house moves right, and so do the stacks dropped indoors); Change Style
 * picks the yard's look (js/home-styles.js yard styles). QA:
 *     ?autostart=1&fresh=1&homedemo=interior&homeyarddemo=cultivate (a lived-in
 *     back yard, Cultivate open; &homeautoplay=1 cultivates, expands and
 *     removes; =max buys every expansion left for Landgrabber)
 *     &homeyardstyle=<GSJS interior key> sets the yard style once, free.
 *
 * Floors (register G153, js/home-floors.js): a Door (furniture_door.js) set
 * down on the top floor opens Build a New Floor (job_proto_door, 100 Planks,
 * through projectApi); finishing it adds a floor (homes_add_floor_at) with a
 * Door down at the same x, up to three floors. Each floor is its own room
 * (as the Tower's are) and the Doors are the way between; Expand and
 * Un-expand work on every floor at once. QA:
 *     ?autostart=1&fresh=1&resetgame=1&questoffer=off&homedemo=interior&homefloordemo=door
 *     (a Door in storage, 100 Planks, Decorate open; =build places it and
 *     fills the project, =up also goes upstairs). Canvas: homeFloor,
 *     homeFloors, homeDoorPending, homeDoorLast.
 *
 * Worn-out cultivations become their proto in place (items/include/cultivation.js
 * replaceWithDepleted): the CC0 `depleted` frame of the proto SWF
 * (js/home-proto-art.js) with Restore, which runs the proto's job_cult_*
 * project through features/street-jobs-feature.js projectApi; finishing it
 * puts a fresh item back with a longer lifespan (quest.js doJobEffects type 5).
 *
 * QA: ?autostart=1&fresh=1&homedemo=decorate (furnished room, Decorate open)
 *     ?autostart=1&fresh=1&homedemo=cultivate (lived-in yard, Cultivate open)
 *     add &homeautoplay=1 to run the scripted place / move / flip / swatch /
 *     pick up (decorate) or cultivate / expand / remove (cultivate) loop.
 *     &homefurniture=furniture_rug,furniture_painting puts those in furniture storage
 *     (shared with Tower floors: &homedemo=home&towerdemo=inside, then Decorate).
 * Wine of the Dead (js/wine-pour.js, items/wine_of_the_dead.js): its pack verb
 * "pour" works on your home street, on the nearest cultivated item within
 * 200 px (wears it out 3 s later; a Patch's tree goes with its Patch) or a
 * proto whose project has started (the project is canceled, the unbuilt
 * Tower's too). The Cultivate sidebar's Pour button and the proto's verb ask
 * the same "Please Confirm!". After Yes the avatar walks to 100 px short of the
 * item, facing it, while the bottle's tool_animation pours on it for 3 s
 * (wine_of_the_dead.js modal_callback). Dragging the bottle from the pack onto
 * a cultivated item or a running proto asks the same (patch.js / trant / proto
 * remove: drop tip "Pour Wine of the Dead on <item>"). QA:
 * &homedemo=cultivate&wotddemo=3 (&wotdtarget=patch stands you by the yard's
 * Patch; &wotdtree=trant_bean first grows a Bean Tree on it).
 * Canvas data: homeDecorPlaced, homeDecorStorage, homeDecorWall/Walls/Floor/Ceiling, homeStamping,
 * homeDecorSegments, homeMode, homeCultivations, homeYard, homeAutoplay,
 * homeProtos, homeRestore, homeLifespan, homePour (confirm|pouring|depleted|canceled:<id>),
 * homePourFx (tool_animation|-tool_animation:<x>,<y> while it plays, then done), homePourDrag
 * (none|dragging|over:<id>),
 * homeBackCultivations, homeBackYard (back-yard expansions bought), homeBackYardWidth,
 * homeHouseX (the house's left end in interior world x), homeYardStyle, homeYardShown.
 *     &cultwear=N  every cultivation wears out after N uses (x its lifespan multiplier)
 *     &homeautoplay=restore (with homedemo=cultivate): wears the Metal Rock out,
 *       then seeds and runs its Restore project to the restored rock
 *       (=restorehold stops on the proto, =restoreaward on the award)
 */

import { countItem, ensureItem, ITEM_CATALOG, removeItem } from '../inventory.js?v=d82f3b00';
import { isBagClass } from '../pack-slots.js?v=c91d0ca3';
import { createCombobox } from '../combobox.js?v=d43209e8';
import {
  CULTIVATION_CLASSES,
  FURNITURE_CATALOG,
  FURNITURE_STORE,
} from '../homes-catalog.js?v=7aa9beb0';
import {
  INTERIOR,
  arrangeStarterRoom,
  createHomeDecorState,
  displayDeposit,
  displayRefusal,
  displayWithdraw,
  DISPLAY_TEXT,
  expandInterior,
  flipFurniture,
  furnishDemoRoom,
  furnitureDef,
  furnitureDrawsInFront,
  furnitureScale,
  furnitureSize,
  grantStarterKit,
  interiorWidth,
  listPlaceable,
  listTextures,
  moveFurniture,
  normalizeHomeDecorState,
  pickUpFurniture,
  pieceArt,
  pieceScale,
  placeFurniture,
  placedItem,
  quoteInteriorExpansion,
  quoteInteriorUnexpand,
  renderOrder,
  restackFurniture,
  setHomeTexture,
  snapPlacement,
  settleStacks,
  stackSurfaceAt,
  surfaceHeight,
  textureConfig,
  unexpandInterior,
  UNEXPAND_TEXT,
} from '../home-decor.js?v=5551be2e';
import { applyBonusUpgrade, applyUpgrade, bonusUpgradeLine, currantsText, hasUpgrades, pieceLabel, rollBonusUpgrade, upgradeVerb, UPGRADE_TEXT } from '../furniture-upgrades.js?v=a3788c0d';
import { DOCK_GAP, DOCK_W, chooseUpgrade, closeUpgradePicker, openUpgradePicker, placeUpgradePicker, saveUpgrade, upgradePickerOpen, upgradePickerState } from '../furniture-upgrade-picker.js?v=3a637ec8';
import {
  BUILDER_TEXT,
  DRAG_DIST,
  EDGE_DELAY_MS,
  PAN_SPEED,
  clampRoomX,
  createHomeBuilder,
  cultChooseText,
  decorLook,
  edgePan,
  filterSwatches,
  filterTiles,
  panDirection,
  panKey,
  placeCostText,
  swatchFilters,
  trayFilters,
} from '../ui/home-builder.js?v=90f759e8';
import { RECIPE_CATALOG } from '../making.js?v=76cc5708';
import {
  createBackYardState,
  fixtureObstacles,
  fixtureRx,
  isBackYard,
  nearestFreeRx,
  addWear,
  createCultivationState,
  depleteCultivation,
  lifespanMultiplier,
  liveItems,
  restoreCultivation,
  restoreJobId,
  restoreRewardMultiplier,
  usesLeft,
  cultivate,
  cultivateDemoYard,
  cultivationChoices,
  cultivationDef,
  expandYard,
  footprint,
  hiveFireflySpots,
  homeStreetLayout,
  lifespanLeft,
  normalizeCultivationState,
  nudgeCultivation,
  placementCheck,
  quoteYardExpansion,
  removeCultivation,
  towerItem,
} from '../home-cultivation.js?v=ff17225a';
import { PROTO_DEPLETED_ART } from '../home-proto-art.js?v=9309e9f3';
import { MOVABLE_FIXTURES, MOVABLE_FIXTURE_IDS, fixtureFits, fixtureText, savedFixtureRx, signpostX } from '../home-street-fixtures.js?v=badcb725';
import { displayTopOf, itemstackOverlayPoint, overlayAlpha, overlayLifeMs, playPoofIn, trackOverlay } from '../overlay-art.js?v=11b6dd7f';
import { createSheetLoader, pixiSpeed } from '../sprite-sheets.js?v=db7c442f';
import { fadeInNewNear } from '../poof-fade.js?v=54ef2431';
import { projectApi } from './street-jobs-feature.js?v=ce464e45';
import { TOWER_CHASSIS, TOWER_CONFIG, TOWER_DOOR_DX, TOWER_GEO, TOWER_PROTO, normalizeTowerState } from '../home-tower.js?v=4daa0b96';
import { drawTowerElevator, drawTowerExit, towerApi, visitorTowerView } from './home-tower-feature.js?v=871cb9be';
import { pieceUrl, roomPieces, surfaceAt, swatchPiece, wallTargetAt } from '../home-wallpaper.js?v=f1969400';
import { wantsHiresDecos } from '../deco-hires.js?v=cb905e17';
import { resourceNodesFeature } from './resource-nodes-feature.js?v=46897039';
import { patchesFeature } from './patches-feature.js?v=15d9209c';
import { GROWN_TREE_LABELS, createPlot, growTree, plotLabel } from '../patches.js?v=bed4aff3';
import { WOTD_DEPLETE_MS, WOTD_TEXT, nearestPourTarget, pourButton, pourConditions, pourConfirmText } from '../wine-pour.js?v=6daa23a7';
import { WOTD_TOOL, pourApproach, pourDropTip } from '../wine-pour-fx.js?v=364e22d2';
import { XP_FOR_LEVEL } from '../progression.js?v=33462eaa';
import {
  STREET_STYLE_BY_KEY,
  STYLE_TEXT,
  YARD_STYLE_BY_KEY,
  YARD_STYLE_TEXT,
  changeForLabel,
  confirmText,
  streetLook,
  streetStyleFor,
  styleChoices,
  switchStreetStyle,
  switchYardStyle,
  yardLook,
  yardStyleChoices,
  yardStyleFor,
} from '../home-styles.js?v=f591561f';
import { frameTexture, isLoaded, onLoaded, sourceFromUrl, textureFromUrl } from '../textures.js?v=3149d699';
import { FALLBACK_MAX as WORLD_ART_FALLBACK_MAX, worldArtFor } from '../world-art.js?v=df476660';
import { oneArmSignpost } from '../street-render.js?v=9349c0e5';
import { ROCK_CATALOG } from '../mining.js?v=4d825b67';
import {
  HOUSE_SIGN,
  IMG_BUBBLE_MS,
  houseSignArt,
  cultivateLandCheck,
  cultivationModeEnded,
  dailyImgCounters,
  houseSignCanExpand,
  imgBubbleText,
  imgRewardLine,
  imgRewards,
  normalizeRockFlags,
  readHowto,
  rockVerbs,
  ROCK_VERB_IDS,
} from '../magic-rock-home.js?v=39921139';
import { getGameDayKey } from '../game-day.js?v=edb00566';
import { HOME_TICKET, HOME_TICKET_CLASS } from '../home-ticket.js?v=ee7ea52a';
import { MIN_GROUND_CLEARANCE, yCamOffsetAnchor } from '../movement.js?v=b30f84eb';
import { takeFromHouse } from '../ledger-house.js?v=b34f5c89';
import { storagePickupLock } from '../home-storage.js?v=6c449b4e';
import {
  DOOR_CLASS,
  DOOR_JOB_PHASES,
  DOOR_TEXT,
  addFloor,
  clearPendingDoor,
  createFloorsState,
  doorArtKey,
  doorDestination,
  doorJobId,
  doorLiftCheck,
  doorPlaceCheck,
  doorRole,
  expandHouseFloors,
  floorCount,
  floorDecor,
  itemsText,
  noteDoorPlaced,
  quoteHouseExpansion,
  quoteHouseUnexpand,
  unexpandHouseFloors,
} from '../home-floors.js?v=e053a5c0';

export const HOMES_FEATURE_ID = 'homes';
const HOME_STREET_TSID = 'RH_HOME_EXT';
/** The house (and its back yard); js/homes.js HOME_INTERIOR_TSID. */
const HOME_INTERIOR_TSID = 'RH_HOME_INT';
/**
 * G226: stacks dropped on a Tower floor keep their own key per floor. They
 * used to share the house's RH_HOME_INT, so they showed in the house and on
 * every floor and moved with the house when the back yard grew. In the source
 * the Tower is its own location (home.js 44-46 counts trophies on the street
 * and in the house only).
 * G231: stacks a save dropped on a floor before that stay in the house. A
 * row keeps no floor (world-items.js cleanRecord: id, class, count, x, y,
 * droppedAt), so a one-off move would carry the house's own stacks up to the
 * Tower too; in the house they are still in sight, where they also showed
 * before, and pick up and drop again on any floor.
 */
const TOWER_DROP_PREFIX = 'RH_HOME_TOWER_';
const HOUSE_FLOOR_DROP_PREFIX = 'RH_HOME_FLOOR_';
/** The widest view the parallax layers must cover (js/location-view.js: 1680, wider on ultrawide windows). */
const VIEW_W = 2000;
const DECO = 'assets/decos/groddle/';
/** The house interior and Tower floors: walk line of the room shell. */
const GROUND_Y = 620;
/**
 * The home street's walk line. Every home street is cloned from one of the
 * `*_high` templates (inc_data_homes_prod.js homes_exterior_configs 818-890,
 * config_base.js:235 START_EXT_TEMPLATE meadow_ext_default_high;
 * inc_homes.js homes_rebuild_exterior 2861-2912 clones the template geo and
 * homes_yard_rebuild 2309-2335 only moves l / r), so the street is as tall
 * with a Tower as without one. Measured on the archived street renders
 * (research/wayback/raw/home-images/homestreets, 720 px wide): the start yard
 * (3 + 8 segments of 150 px, config_base.js:216-217) renders 720x436 and the
 * full 40-segment yard 720x120, both a street 1,000 px tall; a Tower's foot
 * sits 104/120 down (LHVK368BJ1V2PKG, 9 floors, its top 70 px under the
 * street top), so the ground is about 870 px below the top.
 */
export const STREET_GROUND_Y = 870;
/** Saves before STREET_GROUND_Y kept home-street stacks on the old 620 line. */
const OLD_STREET_GROUND_Y = 620;
const STREET_LIFT = STREET_GROUND_Y - OLD_STREET_GROUND_Y;
/** The street's world height: the soil band under the walk line (bgLayer.worldH). */
export const STREET_WORLD_H = STREET_GROUND_Y + 102;
/**
 * The back yard's ground: the house's frame bottom, 43 + 17 px under the
 * floor (inc_homes.js homes_rebuild_floor: floor plat at -(43 + frame_height),
 * the left-open ramp down to y 0).
 */
export const BACK_YARD_GROUND_Y = GROUND_Y + 43 + 17;
/** The look items are placed for the old 620 px street (tools/home-styles/recipes.mjs). */
const YARD_LIFT = BACK_YARD_GROUND_Y - OLD_STREET_GROUND_Y;
/** Above this much of the avatar the house's left end is a wall (the post over the way in). */
const AVATAR_HEAD = 90;
const FURNITURE_Z = 12;
/**
 * FG_FURN (MiddleGroundRenderer.setupEndShapes 111-171; LocationRenderer.as 1465-1468): ceiling
 * and front pieces draw over your avatar (50), other players (49.x) and anything worn or carried
 * (the crown 60, the Crushers 58), under the Decorate ghost (95).
 */
const FURNITURE_FRONT_Z = 90;

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
  if (!def || item.depleted) return [];
  if (def.kind === 'node') {
    return def.nodes.map((node) => ({
      classTsid: node.classTsid === 'peat_1' ? item.endClass : node.classTsid,
      dx: node.dx,
      dy: node.dy,
    }));
  }
  if (def.kind === 'hive') return hiveFireflySpots(item, now).map((spot) => ({ classTsid: 'npc_firefly', ...spot }));
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
    if (cultivationDef(item.protoClass)?.kind !== 'patch' || item.depleted) continue;
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
  return items.filter((row) => cultivationDef(row.protoClass)?.kind === 'rock' && !row.depleted);
}

/**
 * The street's saved rock slots after the rock list changed (index = order
 * among live rocks). A rock that is new here gets an empty slot (null), so
 * spawnMineRock starts it fresh and the others keep their own state.
 */
export function rekeyRocks(oldRocks = [], beforeIds = [], afterIds = []) {
  return afterIds.map((id) => {
    const at = beforeIds.indexOf(id);
    return at >= 0 ? oldRocks[at] ?? null : null;
  });
}

/** QA &cultwear=N: every cultivation wears out after N uses. */
export function qaWearOpts(raw) {
  const n = Math.floor(Number(raw));
  return Number.isFinite(n) && n > 0 ? { maxWear: n } : {};
}

/**
 * Move stacks dropped in the house by `dx` when the house's world x changes
 * (a back-yard expansion, or a save from before the back yard). Pure; returns
 * how many rows moved.
 */
export function shiftInteriorRows(rows, dx) {
  if (!Array.isArray(rows) || !dx) return 0;
  let moved = 0;
  for (const row of rows) {
    const x = Number(row?.x);
    if (!Number.isFinite(x)) continue;
    row.x = Math.round(x + dx);
    moved += 1;
  }
  return moved;
}

/**
 * G232: rows whose x lies outside [lo, hi] are brought to that edge. Pure;
 * returns how many moved.
 */
export function clampRowsX(rows, lo, hi) {
  if (!Array.isArray(rows) || !(hi >= lo)) return 0;
  let moved = 0;
  for (const row of rows) {
    const x = Number(row?.x);
    if (!Number.isFinite(x)) continue;
    const next = Math.round(Math.max(lo, Math.min(hi, x)));
    if (next !== x) {
      row.x = next;
      moved += 1;
    }
  }
  return moved;
}

/** G226: the dropped-stack key of Tower floor `floor` (0 is the ground floor). */
export function towerDropTsid(floor) {
  return `${TOWER_DROP_PREFIX}${Math.max(0, Math.floor(Number(floor) || 0))}`;
}

/**
 * G226: the x-bearing rows Animal Husbandry keeps for one street (Guano and
 * Plop piles, yard animals, Magic Sticks, collectors, starved-piggy drops)
 * moved by `dx`. Pure; returns how many rows moved.
 */
export function shiftHusbandryRows(slot, dx) {
  if (!slot || !dx) return 0;
  let moved = 0;
  for (const key of ['guano', 'plops', 'animals', 'sticks', 'machines', 'starved']) moved += shiftInteriorRows(slot[key], dx);
  return moved;
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
/** The house's floors above the ground floor and their Doors (js/home-floors.js). */
let floors = createFloorsState();
/** Where to stand after a Door between floors: room x, used once. */
let floorArrivalX = null;
let doorLast = '';
/** The home-street walk line the save was made on (old saves: 620); see liftOldStreetRows. */
let savedStreetGround = STREET_GROUND_Y;
/** The decor being shown and edited: the house, or the Tower floor you stand on. */
let decor = houseDecor;
let cult = createCultivationState();
/** The house's back yard (inc_homes.js cfg.yard_expansions, its cultivations). */
let backCult = createBackYardState();
/** The house's left end (interior world x) the stacks dropped indoors were saved against; null: not yet known. */
let savedHouseX = null;
let mode = null; // 'decorate' | 'cultivate' | null
let tab = 'furniture';
let placing = null; // { kind: 'furniture'|'cultivation'|'fixture', classTsid|protoClass, moveId?, id? (a fixture's) }
let selected = null; // { kind, id }
// QA: the last move of each movable fixture (moved:<rx> | usual | refused:<why>), by id.
const fixtureLast = { mailbox: '', rock: '', dispatcher: '' };
let stamping = null; // { kind: 'wall'|'floor'|'ceiling', key } while a swatch is on the cursor
let stampHover = null; // { kind, segment?, center? } under the cursor
let scene = null; // live scene context while a home room is shown
let houseVisits = 0; // butler_hint_counters visited_my_house
let lastHomeRoom = null; // 'house' | 'tower' | 'street' while at home, null away
let pointer = { x: 0, y: 0, inside: false };
let lastNodeCheck = 0;
let demoDone = false;
/** G358: the style the picker previews on a placed piece ({ id, upgradeId }), or null. */
let upgradePreview = null;
let furnupLast = '';
/** FURNSELL QA: currants spent on styles this session. */
let furnupSpent = 0;
let autoplay = null;
let ui = null;
/** The chosen street style (inc_homes.js cfg.style on the exterior); null: the purchase look's. */
let streetStyle = null;
let stylePick = null; // the style highlighted in the Change Style dialog
let stylePreview = null; // a picked style shown on the street before you pay for it
let styleDemoDone = false;
let styleDialogDemoDone = false;
/** The chosen back-yard style (cfg.style on the interior); null: START_INT_TEMPLATE. */
let yardStyle = null;
let yardPreview = null; // a picked yard style shown behind the dialog
let yardStyleDemoDone = false;
let yardDemoDone = false;
// G226: the Magic Rock's pc.magic_rock flags (js/magic-rock-home.js) and its yard target.
let rockFlags = {};
let rockTarget = null;
let rockDemoDone = false;
// G232: the game day the rock last handed over its iMG (the daily counter cultivation_img_rewards).
let rockImgDay = null;
let rockBubbled = false; // the "I have some iMG for you" bubble, once a visit
let rockBubble = null; // its handle, faded out when the iMG is handed over
let rockSubtitleAt = 0;
// G226: the home street's house x the street's stacks and piles were saved against.
let savedStreetHouseX = null;

/** The house itself (not a Tower floor): its back yard is left of it. */
function inHouse() {
  return scene?.room === 'interior' && scene.tower == null && !scene.houseFloor;
}

/** The house floor shown now: 0 the ground floor, null on a Tower floor or outside. */
function houseFloorHere() {
  if (scene?.room !== 'interior' || scene.tower != null) return null;
  return scene.houseFloor || 0;
}

/** The yard Cultivate works on here: the back yard in the house, else the home street. */
function activeCult() {
  return inHouse() ? backCult : cult;
}

function yardTsid(state = activeCult()) {
  return isBackYard(state) ? HOME_INTERIOR_TSID : HOME_STREET_TSID;
}

function yardGroundY(state = activeCult()) {
  return isBackYard(state) ? BACK_YARD_GROUND_Y : STREET_GROUND_Y;
}

/** The house's left end in interior world x: the back yard's width (home_get_yard_size). */
function houseX0() {
  return homeStreetLayout(backCult).houseX;
}

/** Where the room starts in this scene's world x (0 on Tower floors and the street). */
function roomX0() {
  return scene?.background?.houseX || 0;
}

function toRoom(p) {
  return { x: p.x - roomX0(), y: p.y };
}

function publish(engine) {
  if (!engine) return;
  engine.setData('homeMode', mode || '');
  engine.setData('homeDecorPlaced', decor.placed.length);
  engine.setData('homeDecorStorage', Object.values(decor.storage).reduce((a, b) => a + b, 0));
  engine.setData('homeDecorWall', decor.wall);
  engine.setData('homeDecorWalls', (decor.walls || []).join(','));
  engine.setData('homeStamping', stamping ? `${stamping.kind}:${stamping.key}` : '');
  engine.setData('homeDecorFloor', decor.floor);
  engine.setData('homeDecorCeiling', decor.ceiling);
  engine.setData('homeDecorSegments', decor.wallSegments);
  engine.setData('homeDecorClasses', [...new Set(decor.placed.map((p) => p.classTsid))].length);
  engine.setData('homeCultivations', cult.items.map((row) => `${row.protoClass.replace('proto_', '')}@${row.rx}`).join(','));
  engine.setData('homeProtos', cult.items.filter((row) => row.depleted).map((row) => `${row.protoClass.replace('proto_', '')}:${restoreJobId(row)}`).join(','));
  engine.setData('homeLifespan', cult.items.filter((row) => !row.depleted && cultivationDef(row.protoClass)?.kind !== 'tower')
    .map((row) => `${row.protoClass.replace('proto_', '')}:${lifespanMultiplier(row).toFixed(2)}`).join(','));
  engine.setData('homeYard', `${cult.yardLeft},${cult.yardRight}`);
  engine.setData('homeBackCultivations', backCult.items.map((row) => `${row.protoClass.replace('proto_', '')}@${row.rx}`).join(','));
  engine.setData('homeBackYard', backCult.yardLeft);
  engine.setData('homeBackYardWidth', houseX0());
  engine.setData('homeHouseX', roomX0());
  engine.setData('homeYardStyle', currentYardStyle(engine));
  engine.setData('homeYardShown', yardPreview || '');
  engine.setData('homeSelected', selected ? `${selected.kind}:${selected.id}` : '');
  // BUILDER: the tray tab and filter, and what moves the thing you carry.
  engine.setData('homeTray', mode === 'decorate' ? `${tab}:${trayFilter}` : mode || '');
  engine.setData('homeCarry', placing ? carryBy : '');
  // HOMEMAIL / PORCH: where the Mail Dispatcher, the Mailbox and the Magic Rock stand (world x) and
  // each one's saved spot (or usual), the last move.
  for (const [id, spot, last] of [['dispatcher', 'homeDispatcher', 'homeDispatcherLast'], ['mailbox', 'homeMailboxSpot', 'homeMailboxMove'], ['rock', 'homeRockSpot', 'homeRockMove']]) {
    const fx = fixtureWorldX(id);
    engine.setData(spot, fx == null ? '' : `${Math.round(fx)}:${savedFixtureRx(cult, id) ?? 'usual'}`);
    engine.setData(last, fixtureLast[id]);
  }
  // G358: placed pieces' upgrades (class:id), the open picker and the last upgrade.
  engine.setData('furnupPlaced', decor.placed.filter((p) => p.upgradeId).map((p) => `${p.classTsid}:${p.upgradeId}`).join(','));
  engine.setData('furnupStored', Object.entries(decor.styles || {}).map(([c, rows]) => rows.map((r) => `${c}:${r.upgradeId || 0}`).join(',')).filter(Boolean).join(','));
  engine.setData('furnupPicker', upgradePickerOpen() ? `${upgradePickerState().pieceId}:${upgradePickerState().chosen ?? ''}` : '');
  engine.setData('furnupLast', furnupLast);
  engine.setData('furnupSpent', String(furnupSpent));
  engine.setData('homePlacing', placing ? placing.classTsid || placing.protoClass || '' : '');
  engine.setData('homeStreetStyle', currentStreetStyle(engine));
  engine.setData('homeStylePick', ui?.styles && !ui.styles.hidden ? stylePick || '' : '');
  engine.setData('homeStyleShown', stylePreview || '');
  engine.setData('homeRock', Object.entries(rockFlags).map(([k, v]) => `${k}:${v}`).join(','));
  engine.setData('homeRockX', rockTarget?.sprite && !rockTarget.sprite.destroyed ? Math.round(rockTarget.sprite.x) : '');
  engine.setData('homeRockImg', rockImgToCollect(engine));
  engine.setData('homeRockSubtitle', liveRock()?.subtitle || '');
  engine.setData('homeSign', ui?.sign && !ui.sign.hidden ? '1' : '');
  engine.setData('homeStreetHouseX', savedStreetHouseX ?? '');
  engine.setData('homeFloor', houseFloorHere() ?? '');
  engine.setData('homeFloors', floorCount(floors));
  engine.setData('homeDoorPending', floors.pending ? `${floors.pending.floor}:${floors.pending.id}` : '');
  engine.setData('homeDoorLast', doorLast);
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
      layout: 'tower',
      starterKit: true,
    }));
  }
  const slice = towerDecor[index];
  slice.storage = houseDecor.storage;
  slice.styles = houseDecor.styles ||= {};
  slice.wallSegments = TOWER_GEO.wallSegments;
  slice.layout = 'tower';
  return slice;
}

/** The unfinished floor while a new one is going up (not decoratable, never saved). */
function constructionDecor() {
  return createHomeDecorState({ wall: 'grey_unfinished', floor: 'starter_crappy', ceiling: 'starter_crappy_ceiling', wallSegments: TOWER_GEO.wallSegments, layout: 'tower', starterKit: true });
}

function inTower() {
  return scene?.tower != null;
}

/** An upper house floor's decor: the house's furniture storage and width (homes_extend keeps floors alike). */
function houseFloorDecor(index) {
  const slice = floorDecor(floors, houseDecor, index);
  if (!slice || slice === houseDecor) return slice;
  slice.storage = houseDecor.storage;
  slice.styles = houseDecor.styles ||= {};
  slice.wallSegments = houseDecor.wallSegments;
  slice.layout = 'house';
  return slice;
}

/** Bridge the Tower feature uses onto the cultivation state (it never imports this file). */
const towerBridge = {
  towerItem: () => towerItem(cult),
  /** G231: the home street's Magic Rock (the Tower quest's bubbles and subtitle), or null. */
  rock: () => (liveRock()?.state?.room === 'street' ? liveRock() : null),
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
    return placeAtPointer(engine, { x: homeStreetLayout(cult).houseX + rx, y: STREET_GROUND_Y });
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

/** Back-buffer pixels per world pixel (render-density.js) above which the 3x pieces load. */
function wantsHiresPieces(engine) {
  const scale = engine?.app?.renderer?.resolution || globalThis.devicePixelRatio || 1;
  return wantsHiresDecos(scale);
}

function pieceSprite(engine, row, hires) {
  const { PIXI } = engine;
  const tex = textureFromUrl(pieceUrl(row.piece, hires));
  if (row.tile) {
    // The cross-section frame is a 1500 / 1200 px strip the source repeats (and lets
    // overhang past the house); here it is repeated and clipped to the house.
    const strip = new PIXI.Container();
    for (let x = 0; x < row.w; x += row.tile) {
      const spr = new PIXI.Sprite(tex);
      spr.width = row.tile;
      spr.height = row.h;
      spr.x = row.x + x;
      spr.y = row.y;
      strip.addChild(spr);
    }
    if (row.w % row.tile) {
      const clip = new PIXI.Graphics().rect(row.x, row.y, row.w, row.h).fill(0xffffff);
      strip.addChild(clip);
      strip.mask = clip;
    }
    return strip;
  }
  const spr = new PIXI.Sprite(tex);
  spr.width = row.w;
  spr.height = row.h;
  if (row.flip) spr.scale.x *= -1;
  spr.x = row.flip ? row.x + row.w : row.x;
  spr.y = row.y;
  return spr;
}

/**
 * The room from Tiny Speck's pieces (js/home-wallpaper.js roomPieces): floor and ceiling
 * tiles, wallpaper per segment with its end caps, wall / floor / ceiling shadows, the groddle
 * (or tower) cross-section frame, attic and basement. Outside the house, a dark timber wall
 * covers what the camera can see past the end frames.
 */
function drawRoomShell(engine, container, opts = {}) {
  const { PIXI } = engine;
  container.removeChildren().forEach((child) => child.destroy({ children: true }));
  // BUILDER: a swatch preview draws the room as it would look (HandOfDecorator startPreviewingSwatch).
  const room = roomPieces(opts.preview || decor, { floorY: INTERIOR.floorY, construction: Boolean(opts.construction), leftOpen: Boolean(opts.yard) });
  const width = room.width;
  const top = room.top - 200;
  const bottom = room.bottom + 200;
  const outside = new PIXI.Graphics();
  const OUTSIDE_W = 640;
  // With the back yard, the left side is the yard itself (interiorBackground draws it).
  for (const [x0, x1] of opts.yard ? [[width, width + OUTSIDE_W]] : [[-OUTSIDE_W, 0], [width, width + OUTSIDE_W]]) {
    outside.rect(x0, top, x1 - x0, bottom - top).fill(0x2a2019);
    for (let x = x0; x < x1; x += 46) outside.rect(x, top, 4, bottom - top).fill(0x221a14);
  }
  outside.rect(0, room.bottom, width, 200).fill(0x3b2a1e);
  container.addChild(outside);
  const hires = wantsHiresPieces(engine);
  for (const row of room.pieces) container.addChild(pieceSprite(engine, row, hires));

  // Warm light: glow pools under every lamp
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
    spr.blendMode = 'add';
    light.addChild(spr);
  };
  const { floorY } = INTERIOR;
  for (const item of decor.placed) {
    if (!/lamp/.test(item.classTsid)) continue;
    const { w, h } = furnitureSize(item.classTsid, item.upgradeId);
    if (item.slot === 'ceiling') {
      pool(item.x, item.y + h + 30, w * 1.5, 90, 0.32);
      pool(item.x, floorY + 12, w * 1.6, 16, 0.4);
    } else {
      const y0 = item.slot === 'wall' ? item.y - h * 0.7 : item.y - h * 0.82;
      pool(item.x, y0, w * 1.4 + 46, h * 0.5 + 40, 0.38);
    }
  }
  container.addChild(light);
  container.room = room;
  return room;
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

/**
 * The house room. With `opts.yard` (the house, not a Tower floor) the back
 * yard comes first: the room starts at x0 = the yard's width, and the yard's
 * landscape (its style's look) fills x 0..x0 behind it.
 */
function interiorBackground(engine, opts = {}) {
  const { PIXI } = engine;
  const x0 = opts.yard ? houseX0() : 0;
  const width = x0 + interiorWidth(decor);
  const root = new PIXI.Container();
  const house = new PIXI.Container();
  const shell = new PIXI.Container();
  const marks = new PIXI.Graphics();
  house.x = x0;
  house.addChild(shell, marks);
  if (opts.yard) {
    root.sortableChildren = true;
    house.zIndex = 0;
    const land = drawLandscape(engine, root, yardLook(shownYardStyle(engine)), `yard:${shownYardStyle(engine)}`, {
      width,
      groundY: BACK_YARD_GROUND_Y,
      lift: YARD_LIFT,
      // grass and plants stop short of the way into the house
      skipNear: (x) => x > x0 - 90,
    });
    root.updateParallax = (camX, camY, vpW, vpH, skyH = vpH) => land.update(camX, camY, vpW, skyH);
  }
  root.addChild(house);
  root.room = drawRoomShell(engine, shell, opts);
  root.shell = shell;
  root.marks = marks;
  root.house = house;
  root.houseX = x0;
  root.yardStyle = opts.yard ? shownYardStyle(engine) : null;
  root.worldH = root.room.bottom;
  const { room } = root;
  // The floor is solid from the top (inc_homes.js homes_rebuild_floor 928-933: platform_pc_perm -1).
  // pc_perm 1 is an underside (street-model.js isStandable): with it the avatar stood on the yard's
  // line 60 px under the room's floor, and that floor then lay between the avatar and everything set
  // on a shelf or a table, so a click on it said "Could not get close enough :(" (Austin 2026-11-01).
  root.platformsScreen = room.leftOpen
    ? [
      // homes_rebuild_floor left-open: the yard, the ramp (x -20 at y 0 to x 56 on the floor), the floor.
      { id: 'home-yard', x1: 0, y1: room.groundY, x2: x0 + room.rampX, y2: room.groundY, pc_perm: -1 },
      { id: 'home-yard-ramp', x1: x0 + room.rampX, y1: room.groundY, x2: x0 + room.floorStart, y2: GROUND_Y, pc_perm: -1 },
      { id: 'home-floor', x1: x0 + room.floorStart, y1: GROUND_Y, x2: width, y2: GROUND_Y, pc_perm: -1 },
    ]
    : [{ id: 'home-floor', x1: 0, y1: GROUND_Y, x2: width, y2: GROUND_Y, pc_perm: -1 }];
  root.redraw = (preview = null) => {
    root.room = drawRoomShell(engine, shell, preview ? { ...opts, preview } : opts);
    drawStampMarks(engine);
  };
  return root;
}

/**
 * QA once: &homeyardstyle=<GSJS interior key> sets the yard style, free.
 */
function qaYardStyle(engine) {
  if (yardStyleDemoDone) return;
  const key = String(engine.param?.('homeyardstyle') || '');
  if (!key) return;
  yardStyleDemoDone = true;
  if (YARD_STYLE_BY_KEY[key]?.built) yardStyle = key;
}

/**
 * Once per change of the house's world x (a back-yard expansion, or a save
 * from before the back yard): the stacks dropped indoors move with the room.
 */
function syncHouseShift(engine) {
  const now = houseX0();
  if (savedHouseX == null) {
    savedHouseX = now;
    return;
  }
  if (savedHouseX === now) return;
  const dx = now - savedHouseX;
  savedHouseX = now;
  shiftShownRoom(engine, 'interior', dx);
}

/**
 * G226: everything kept in a home room's world x moves by `dx`: the stacks
 * dropped there, Animal Husbandry's piles and animals on the home street, and
 * (through the `homeRoomShifted` query) a Craftybot standing there. In the
 * source the house sits at x 0 of both locations and a yard expansion only
 * moves the left edge (inc_homes.js homes_yard_rebuild 2309-2335 sets
 * new_dims.l, homes_resize_main_layer 2210 keeps middleground items where they
 * are), so things keep their place beside the house.
 */
function shiftShownRoom(engine, room, dx) {
  if (!dx) return 0;
  const tsid = room === 'interior' ? HOME_INTERIOR_TSID : HOME_STREET_TSID;
  let moved = shiftInteriorRows(engine.droppedItems?.streets?.[tsid], dx);
  if (room === 'street') moved += shiftHusbandryRows(engine.streetSlot?.('animal-husbandry', HOME_STREET_TSID), dx);
  // Features answer null so every one of them hears it.
  engine.query?.('homeRoomShifted', room, dx, engine);
  engine.save?.();
  return moved;
}

/**
 * G232: the house's stacks stay where you can walk. A save from before the
 * back yard kept the house's stacks and those dropped on Tower floors (G231:
 * they stay in the house) at house x 0; the yard's width then moved them
 * all right, and a Tower floor is 128 px wider than the house (1178 / 1050),
 * so a Tower stack near its right end landed past the house's right wall,
 * out of reach. Any such stack is set down just inside the wall (or the
 * yard's left end). STACK_WALL_MARGIN keeps it within the player's reach
 * of keepInsideWalls' last step.
 */
const STACK_WALL_MARGIN = 36;
function keepStacksInHouse(engine) {
  const rows = engine.droppedItems?.streets?.[HOME_INTERIOR_TSID];
  if (!rows?.length) return 0;
  const hi = houseX0() + interiorWidth(houseDecor) - INTERIOR.endCapW - STACK_WALL_MARGIN;
  const moved = clampRowsX(rows, STACK_WALL_MARGIN, hi);
  if (moved) engine.save?.();
  return moved;
}

/**
 * Once per change of the house's x on the home street (an expansion to the
 * left): the street's stacks, piles and Craftybot move with it. A save from
 * before G226 starts from the house where it is now.
 */
function syncStreetShift(engine) {
  const now = homeStreetLayout(cult).houseX;
  if (savedStreetHouseX == null || savedStreetHouseX === now) {
    savedStreetHouseX = now;
    return;
  }
  const dx = now - savedStreetHouseX;
  savedStreetHouseX = now;
  shiftShownRoom(engine, 'street', dx);
}

/** inc_homes.js door_pos: 84 px in from the right end, on the end wall. */
function interiorDoorX() {
  return interiorWidth(decor) - 84;
}

function spawnInteriorTargets(engine) {
  const { PIXI } = engine;
  // home_groddle.swf door_asset_entry_basic, 75 x 236 on the right end wall.
  const spec = scene?.background?.room?.door || { piece: 'door_asset_entry_basic', x: interiorDoorX(), y: GROUND_Y + 18, w: 75, h: 236 };
  const door = new PIXI.Sprite(textureFromUrl(pieceUrl(spec.piece, wantsHiresPieces(engine))));
  door.anchor.set(0.5, 1);
  door.width = spec.w;
  door.height = spec.h;
  door.x = roomX0() + spec.x;
  door.y = spec.y;
  door.zIndex = 8;
  engine.entityLayer.addChild(door);
  const target = engine.register({
    classId: 'home_door',
    label: 'Front Door',
    subtitle: 'Back to your home street and mailbox',
    sprite: door,
    state: { room: 'interior' },
  });
  rockTarget = roomX0() > 0 ? spawnRock(engine, roomX0() + YARD_ROCK.dx, BACK_YARD_GROUND_Y, 'yard') : null;
  return { door: target };
}

// ---------------------------------------------------------------------------
// The Magic Rock in the back yard (G226, items/magic_rock.js)
// ---------------------------------------------------------------------------

/**
 * inc_homes.js homes_demo_backyard 2349-2358: apiPutItemIntoPosition(rock,
 * -29, -155), only_visible_to the owner. x is beside the house's open left
 * end (the house starts at x 0, the ramp's foot is at -20). The home street's
 * rock (homes_demo_frontyard 2470) and the new player's (newxp_house_exterior.js
 * 45) are put at y -144, and the remake stands both on the ground
 * (home-tower-feature spawnRock, newxp-feature makeNpc), so this one stands
 * on the yard ground too (its -155 is 11 px higher than theirs).
 * Art: the item's own CC0 frames (magic_rock make_config book 'orangeBook':
 * magic_rock_book_orangeBook read, OGA extracted_newxp), as the street's rock.
 */
const YARD_ROCK = Object.freeze({ dx: -29 });
/**
 * G231: inc_homes.js homes_demo_frontyard 2469-2471 puts the home street's
 * rock at (221, -144), only_visible_to the owner, right of the door (the
 * house at x 0, as in the yard). It is the street's one Magic Rock: the same
 * item offers build_a_tower (magic_rock.js onCreate setAvailableQuests 773-781)
 * through its talk to, so the Tower's talk to (home-tower-feature rockTalk)
 * joins its home verbs here. During the new player's tour the tutorial's own
 * rock stands in for it (newxp-feature homeRockHeld): in the source the
 * newxp home's rock is that same item with every home verb hidden
 * (magic_rock.js `if (this.container.is_newxp) return {state: null}`).
 */
const STREET_ROCK = Object.freeze({ dx: 221 });
const ROCK_SHEET = Object.freeze({ file: 'assets/sprites/newxp/rock_read.png', cols: 9, rows: 2, count: 18, cellW: 75, cropY: 262, cropH: 74, footX: 27, footY: 329 });

function spawnRock(engine, x, groundY, room) {
  const { PIXI } = engine;
  const anim = new PIXI.AnimatedSprite([PIXI.Texture.EMPTY]);
  // The read frames are 75 x 348 cells; every frame's rock lies in x 6-48, y 275-329.
  // Only that band is cut out, so the hover box and its label hug the rock.
  anim.anchor.set(ROCK_SHEET.footX / ROCK_SHEET.cellW, (ROCK_SHEET.footY - ROCK_SHEET.cropY) / ROCK_SHEET.cropH);
  anim.animationSpeed = 0.18;
  const base = sourceFromUrl(ROCK_SHEET.file);
  const apply = () => {
    if (anim.destroyed) return;
    const fw = base.width / ROCK_SHEET.cols;
    const fh = base.height / ROCK_SHEET.rows;
    const frames = [];
    for (let i = 0; i < ROCK_SHEET.count; i += 1) {
      const k = fw / ROCK_SHEET.cellW;
      frames.push(frameTexture(base, new PIXI.Rectangle((i % ROCK_SHEET.cols) * fw, Math.floor(i / ROCK_SHEET.cols) * fh + ROCK_SHEET.cropY * k, fw, ROCK_SHEET.cropH * k)));
    }
    anim.textures = frames;
    anim.play();
  };
  if (isLoaded(base)) apply();
  else onLoaded(base, apply);
  const box = new PIXI.Container();
  box.addChild(anim);
  box.x = Math.round(x);
  box.y = groundY + 4;
  box.zIndex = 28;
  engine.entityLayer.addChild(box);
  return engine.register({
    classId: 'magic_rock',
    featureId: HOMES_FEATURE_ID,
    label: 'Magic Rock',
    subtitle: rockSubtitle(engine, room),
    sprite: box,
    state: { room },
  });
}

/** The live rock target of the room being shown (yard or street), or null. */
function liveRock() {
  return rockTarget?.sprite && !rockTarget.sprite.destroyed ? rockTarget : null;
}

/** The rock's hover line: on the street the Tower quest's, else where it stands. */
function rockSubtitle(engine, room) {
  if (room === 'yard') return 'Your yard';
  return towerApi.rockTalk?.(engine)?.subtitle || 'Your home street';
}

/**
 * G232: the rock's subtitle follows the Tower offer while you stand there
 * (a level gained on the street unlocks Build a Tower mid-visit); checked
 * twice a second, not every frame (the offer test walks the quest catalog).
 */
function refreshRockSubtitle(engine, now = Date.now()) {
  const rock = liveRock();
  if (!rock || now - rockSubtitleAt < 500) return false;
  rockSubtitleAt = now;
  const next = rockSubtitle(engine, rockRoom(rock));
  if (rock.subtitle === next) return false;
  rock.subtitle = next;
  return true;
}

/**
 * G232: houses_get_img_rewards for this player now (js/magic-rock-home.js
 * imgRewards: with no visitors, the daily stipend from level 2). G201: in
 * multiplayer the site's pool decides it (home-pool-mp-feature homeImgPool:
 * the best earlier day of what visitors did here, capped, plus the stipend).
 */
function rockImgToCollect(engine, now = Date.now()) {
  const shared = engine.query?.('homeImgPool', engine);
  if (Number.isFinite(shared)) return shared;
  return imgRewards({ level: engine.pc?.level || 1, cashedToday: rockImgDay === getGameDayKey(now) });
}

/**
 * onPlayerCollision (magic_rock.js 992-1001): coming up to the rock while it
 * has iMG for you, it says so (10 s), once a visit.
 */
function rockImgBubble(engine) {
  const rock = liveRock();
  const p = engine.player;
  if (rockBubbled || !rock || !p || mode) return;
  if (Math.abs(p.x - rock.sprite.x) > 90) return;
  rockBubbled = true;
  if (!rockImgToCollect(engine)) return;
  rockBubble = engine.say?.(rock, imgBubbleText(), IMG_BUBBLE_MS) || null;
}

/**
 * The rock's conversation takes over from its bubble (the client draws both
 * on the rock): the bubble fades out (G253: engine.closeSay, the speech
 * bubble's own 24-frame fade).
 */
function fadeRockBubble(engine) {
  if (rockBubble && !rockBubble.destroyed) engine.closeSay?.(rockBubble);
  rockBubble = null;
}

/**
 * G231: the home street's rock, owner only, unless the tutorial's own rock
 * has the street (newxp-feature homeRockHeld). Called when the street is built
 * and every tick after, so it comes back when the tutorial's rock leaves.
 */
function syncStreetRock(engine) {
  if (scene?.room !== 'street') return;
  const owner = engine.homeContext?.().owned === true;
  const held = engine.query?.('homeRockHeld', engine) === true;
  const want = owner && !held;
  const have = liveRock();
  if (want && !have) {
    // PORCH: where you moved it, else its usual spot (STREET_ROCK).
    rockTarget = spawnRock(engine, fixtureWorldX('rock') ?? homeStreetLayout(cult).houseX + STREET_ROCK.dx, STREET_GROUND_Y, 'street');
    publish(engine);
  } else if (!want && have) {
    engine.unregister?.(have);
    rockTarget = null;
    publish(engine);
  } else if (have && refreshRockSubtitle(engine)) {
    publish(engine);
  }
}

/** QA &homerock=new (no lesson read yet) | done (every lesson read): the rock's flags, once. */
function qaRockFlags(engine) {
  if (rockDemoDone) return;
  rockDemoDone = true;
  const raw = String(engine.param?.('homerock') || '');
  if (raw === 'new') rockFlags = {};
  else if (raw === 'done') rockFlags = normalizeRockFlags({ cultivate: 'cultivate_complete', changestyle: 'howto_shown', expand: 'howto_shown' });
}

function rockRoom(target) {
  return target?.state?.room === 'street' ? 'street' : 'yard';
}

/**
 * The rock's verb rows (magic_rock.js conditions). talk to (sort_on 61)
 * follows the home verbs (53-60): on either rock while there is iMG to hand
 * over (conditions 380-385, houses_get_img_rewards), and on the home street
 * while the Tower quest has something to say (G231).
 */
function magicRockVerbs(target, engine) {
  const room = rockRoom(target);
  const rows = rockVerbs(rockFlags, { level: engine.pc?.level || 1, room });
  const talk = (room === 'street' && towerApi.rockTalk?.(engine)) || (rockImgToCollect(engine) > 0 ? { tooltip: 'Talk to the Magic Rock!' } : null);
  if (talk) rows.push({ id: 'talk_to', label: 'talk to', enabled: true, tooltip: talk.tooltip, durationMs: 0 });
  return rows;
}

/**
 * G232: talk to's handler (magic_rock.js 387-461). Decorate ends first
 * (decoration_mode_end, 389). The Tower offer comes first, as the
 * handler's quest branch does (418-422); then the day's iMG, handed over
 * once a game day (427-446); then the running Tower quest's line (G231).
 * With nothing to say the rock sends houses_upgrade_start (448-458): the
 * client opens HouseSignDialog. In the source that branch never runs for a
 * player: talk to is only enabled with iMG to hand over (380-385) and the
 * server checks a verb's conditions again before its handler (main.js
 * 3067-3079); it is home_sign's talk to (items/home_sign.js 26-53), the
 * street sign the rock replaced (inc_homes.js 2382-2390). It is kept here as
 * the source has it; QA opens it with window.groddleHomeRock('house_sign').
 */
function talkToRock(target, engine) {
  if (mode === 'decorate') setMode(engine, null);
  const room = rockRoom(target);
  if (room === 'street' && towerApi.rockOffer?.(engine)) {
    engine.setData?.('homeRockLast', 'talk_tower');
    return towerApi.talkToRock(engine) || true;
  }
  const img = rockImgToCollect(engine);
  if (img > 0) {
    // G201: in multiplayer the site hands it over (and marks the game day cashed) first.
    const asked = engine.query?.('homeImgCollect', engine, { cashedToday: rockImgDay === getGameDayKey(Date.now()) });
    if (asked && typeof asked.then === 'function') {
      asked.then((got) => {
        if (got > 0) handOverImg(engine, got);
        else publish(engine);
      });
      return true;
    }
    return handOverImg(engine, img);
  }
  if (room === 'street' && towerApi.rockTalk?.(engine)) {
    engine.setData?.('homeRockLast', 'talk_tower');
    return towerApi.talkToRock(engine) || true;
  }
  engine.setData?.('homeRockLast', 'house_sign');
  return openHouseSign(engine);
}

/**
 * magic_rock.js 427-446: stats_add_xp(img, true) (no mood bonus), the
 * daily_img counters, houses_reset_img_rewards (no more today), and the line.
 */
function handOverImg(engine, img) {
  const pc = engine.pc;
  if (pc) {
    pc.imagination = (pc.imagination || 0) + img;
    pc.xp = (pc.xp || 0) + img;
  }
  rockImgDay = getGameDayKey(Date.now());
  fadeRockBubble(engine);
  for (const counter of dailyImgCounters(img)) engine.achievement?.(counter, 1);
  const p = engine.player;
  if (p) engine.floatText?.(p.x, p.y - 120, `+${img.toLocaleString()} iMG`, 0xf0e6d0);
  engine.pushActivity?.(`The Magic Rock handed over ${img.toLocaleString()} iMG.`);
  engine.updateHud?.();
  engine.save?.();
  engine.setData?.('homeRockLast', `img:${img}`);
  rockSays(engine, [{ text: imgRewardLine(img), response: 'OK' }]);
  publish(engine);
  return true;
}

// ---------------------------------------------------------------------------
// G232: HouseSignDialog (houses_upgrade_start)
// ---------------------------------------------------------------------------

function ensureHouseSignUi(engine) {
  if (!ensureUi(engine)) return null;
  if (!ui.sign) {
    ui.sign = el('section', { class: 'homes-sign', id: 'homes-sign', hidden: true, role: 'dialog', 'aria-label': HOUSE_SIGN.title });
    ui.sign.addEventListener('keydown', (e) => houseSignKey(engine, e));
    ui.root.append(ui.sign);
  }
  return ui.sign;
}

function closeHouseSign() {
  if (ui?.sign) ui.sign.hidden = true;
}

/** BigDialog: the arrow keys move the focus round the buttons (CLICK_SUCCESS), Enter chooses, Escape closes. */
function houseSignKey(engine, e) {
  const list = [...(ui?.sign?.querySelectorAll('.hsd-bt') || [])];
  if (!list.length) return;
  const i = list.indexOf(document.activeElement);
  if (['ArrowDown', 'ArrowRight', 'ArrowUp', 'ArrowLeft'].includes(e.key)) {
    const step = e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : -1;
    list[(i + step + list.length) % list.length].focus();
    engine.playSound?.('CLICK_SUCCESS', { volume: 0.32 });
  } else if (e.key === 'Escape') {
    closeHouseSign();
  } else {
    // Enter and Space click the focused button themselves; the street's own keys stay out of it.
    if (e.key === 'Enter' || e.key === ' ') e.stopPropagation();
    return;
  }
  e.preventDefault();
  e.stopPropagation();
}

/** Expansions left here (quoteYardExpansion), for the Expand button. */
function expandCountHere(engine) {
  const st = activeCult();
  const back = isBackYard(st);
  const quote = back ? quoteYardExpansion(st, engine.pc) : quoteYardExpansion(st, engine.pc, 'left');
  return houseSignCanExpand({ room: back ? 'yard' : 'street', count: quote.count || 0, countLeft: quote.countLeft || 0, countRight: quote.countRight || 0 });
}

/**
 * HouseSignDialog.as: "Your street", 200 px wide, one button a row. Expand
 * (disabled with its tip when nothing is left to expand) opens the expand
 * dialog, Change Style the styles dialog, Cultivate Land goes straight into
 * cultivation (HouseManager.startCultivation, no yard lesson check, as
 * shift+C); each closes the dialog. A disabled button clicks CLICK_FAILURE.
 */
function openHouseSign(engine) {
  const ctx = engine.homeContext?.() || {};
  if (!ctx.inHome || !scene || scene.construction) return false;
  const box = ensureHouseSignUi(engine);
  if (!box) return true;
  if (ui.styles) ui.styles.hidden = true;
  const canExpand = expandCountHere(engine);
  const act = {
    expand: () => openExpandDialog(engine),
    change_style: () => openStyleDialog(engine),
    cultivate: () => setMode(engine, 'cultivate'),
  };
  const buttons = HOUSE_SIGN.buttons.map((row) => {
    const off = row.id === 'expand' && !canExpand;
    return el('button', {
      type: 'button',
      class: `hsd-bt${off ? ' off' : ''}`,
      'data-house-sign': row.id,
      'aria-disabled': off ? 'true' : false,
      title: off ? HOUSE_SIGN.expandTip : false,
      // G253: the client's street_* icon left of the label (buildButton 146-193).
      style: `--hsd-ic:url(${houseSignArt(row.art)});--hsd-ic-h:url(${houseSignArt(row.art, 'hover')});--hsd-ic-d:url(${houseSignArt(row.art, 'disabled')})`,
      'data-house-sign-art': row.art,
      onclick: () => {
        if (off) {
          engine.playSound?.('CLICK_FAILURE', { volume: 0.4 });
          return;
        }
        engine.playSound?.('CLICK_SUCCESS', { volume: 0.32 });
        closeHouseSign();
        act[row.id]();
        publish(engine);
      },
    }, [el('span', { class: 'hsd-ic', 'aria-hidden': 'true' }), el('span', { class: 'hsd-label', text: row.label })]);
  });
  box.replaceChildren(
    el('header', {}, [
      el('h3', { text: HOUSE_SIGN.title }),
      el('button', { type: 'button', class: 'hb-close', 'aria-label': 'Close', text: '×', onclick: () => closeHouseSign() }),
    ]),
    el('div', { class: 'hsd-body' }, buttons),
  );
  box.hidden = false;
  // focusDefaultChoice: the first button.
  buttons[0]?.focus?.();
  publish(engine);
  return true;
}

/** conversation_start: the rock's pages on the familiar card. */
function rockSays(engine, lines, onComplete) {
  engine.scriptedDialogue?.({
    title: 'Magic Rock',
    kicker: 'Magic Rock',
    beats: lines.map((row) => ({ ...row })),
    onComplete,
  });
}

/** houses_expand_start -> HouseExpandYardDialog: one expansion a click, the dialog stays. */
function openExpandDialog(engine) {
  const st = activeCult();
  const back = isBackYard(st);
  const where = back ? 'yard' : 'street';
  const quote = back ? quoteYardExpansion(st, engine.pc) : quoteYardExpansion(st, engine.pc, 'left');
  const count = back ? quote.count : (quote.countLeft || 0) + (quote.countRight || 0);
  // HouseExpandYardDialog.as 137-170.
  const text = count
    ? `This ${where} can be expanded ${count} more ${count === 1 ? 'time' : 'times'}.`
    : `This ${where} can’t be expanded anymore.`;
  if (!back) {
    // The street grows left or right: the Cultivate bar has both buttons.
    setMode(engine, 'cultivate');
    return true;
  }
  const can = Boolean(count && quote.ok);
  engine.scriptedDialogue?.({
    title: `Expand your ${where}`,
    kicker: null,
    // Without the iMG the dialog's Expand button stays disabled; here the reason shows instead.
    beats: [{ text: can || !count ? text : `${text} ${quote.msg || ''}`.trim(), response: 'OK' }],
    cancelable: can,
    primaryLabel: can ? `Expand for ${quote.cost.toLocaleString()}i` : 'OK',
    cancelLabel: 'Cancel',
    onComplete: () => {
      if (!can) return;
      const res = growYard(engine, 'left');
      if (res?.ok && res.maxed !== true) setTimeout(() => openExpandDialog(engine), 450);
    },
  });
  return true;
}

/** magic_rock.js howto_* verbs: announce_vog_fade(..., {width: '600'}). */
export const ROCK_HOWTO_VOG_WIDTH = 600;

function runRockVerb(target, verbId, engine) {
  const room = rockRoom(target);
  if (!magicRockVerbs(target, engine).some((v) => v.id === verbId)) return true;
  if (verbId === 'talk_to') return talkToRock(target, engine);
  if (verbId.startsWith('howto_')) {
    const pages = readHowto(rockFlags, verbId);
    engine.save?.();
    publish(engine);
    // G311: announce_vog_fade (players/inc_announcements.js 222-262; magic_rock.js 151, 180, 209
    // pass width 600): a VOG over the street, one '//' page a click, the 0.3 black wash, no
    // speaker and no card. engine.vog is that overlay (js/vog-overlay.js, G228).
    if (pages) engine.vog?.({ lines: pages, width: ROCK_HOWTO_VOG_WIDTH });
    engine.setData('homeRockLast', verbId);
    return true;
  }
  if (verbId === 'change_style') return openStyleDialog(engine) || true;
  if (verbId === 'expand') return openExpandDialog(engine);
  if (verbId === 'cultivate_land') {
    const check = cultivateLandCheck(rockFlags, room);
    if (!check.ok) {
      rockSays(engine, check.lines);
      engine.setData('homeRockLast', 'yard_first');
      return true;
    }
    setMode(engine, 'cultivate');
    engine.setData('homeRockLast', 'cultivate_land');
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Scene: the home street
// ---------------------------------------------------------------------------

/**
 * The house on the lot: the look picked with the Home Street Ticket at the
 * Selection Machine (js/home-ticket.js, js/homes.js HOME_STYLES). A street
 * style change keeps it, as the source keeps the furniture_chassis item
 * through homes_rebuild_exterior.
 */
const HOUSES = {
  meadow: { path: 'door_asset_house_large_01', w: 830, h: 668, scale: 0.48, doorX: 0.52, signX: 0.06, doorway: [0.38, 0.64], front: [0.15, 0.89] },
  firebog: { path: 'door_asset_house_medium_03', w: 764, h: 586, scale: 0.58, doorX: 0.55, signX: 0.06, doorway: [0.32, 0.64], front: [0.15, 0.88] },
  uralia: { path: 'door_asset_house_large_05', w: 830, h: 668, scale: 0.48, doorX: 0.52, signX: 0.06, doorway: [0.30, 0.62], front: [0.17, 0.88] },
};
export const HOUSE_STYLE_KEYS = Object.freeze(Object.keys(HOUSES));

/**
 * PORCH (Austin 2026-11-01, "my house front is crowded"): the doorway, the front door and
 * the mat (Firebog's pink mat, Uralia's carrot rug) or worn path (Meadow) painted in front of
 * it, as fractions of the house art (measured on the door_asset_house_* decos). The street's
 * own scenery keeps out of it, as street-ecology's reserved spots keep a public street's
 * doors clear (DOORCLEAR, streetReservedSpots; glitch-client DoorView.as 308-313).
 */
export const DOORWAY_GAP = 8;

/** The doorway (door and mat) in world x: { x1, x2 }. */
export function houseDoorway(layout, houseStyle = 'meadow') {
  const h = HOUSES[houseStyle] || HOUSES.meadow;
  const w = h.w * h.scale;
  const left = layout.houseX - w / 2;
  return { x1: Math.round(left + w * h.doorway[0]), x2: Math.round(left + w * h.doorway[1]) };
}

/**
 * A Tower's doorway on the street, from its foot x: the door (door_asset_entry_basic, 75 wide)
 * TOWER_DOOR_DX either side of the foot as it faces, so both sides are kept.
 */
export function towerDoorway(footX) {
  const reach = TOWER_DOOR_DX + 38 + DOORWAY_GAP;
  return { x1: Math.round(footX - reach), x2: Math.round(footX + reach) };
}

/**
 * PLANTS (Austin 2026-11-01, "Plants by the house, thin out the ones covering the door"): the
 * house's front, everything Tiny Speck painted along its foot (the door and its mat or path, the
 * windows, Meadow's flower bed and bench, Firebog's two mushrooms, Uralia's four pots), from
 * the wall's left corner to its right one, as fractions of the house art (`front`, measured on
 * the door_asset_house_* decos where they stand on the ground). World x: { x1, x2 }.
 */
export function houseFront(layout, houseStyle = 'meadow') {
  const h = HOUSES[houseStyle] || HOUSES.meadow;
  const w = h.w * h.scale;
  const left = layout.houseX - w / 2;
  return { x1: Math.round(left + w * h.front[0]), x2: Math.round(left + w * h.front[1]) };
}

/**
 * The planted border by the house (the street style's `trim`): where each sprite stands. It
 * stood over the deco's For Sale sign to hide it; the house decos ship without the sign since
 * FORSALE (the client hid it on a house not for sale: DoorView.as 228-232,
 * tools/deco-pipeline/door-signs.py), so the border only dresses the corner now. Thinned
 * (PLANTS): the sprites line up leftwards from the house's front (houseFront) with the doorway
 * gap, side by side, and only those that fit before the yard's own planting (the lot edge where
 * the `near` row stops, streetNearSkip) stay; the rest are not drawn. None stands on the house
 * front, so the door, its mat and the house's own art stay in view. PURE (world x).
 */
export function streetTrimSpots(look, layout, houseStyle = 'meadow') {
  const front = houseFront(layout, houseStyle);
  const stop = layout.lotLeft + 40;
  let edge = front.x1 - DOORWAY_GAP;
  const out = [];
  (look?.trim || []).forEach((meta, i) => {
    const half = (meta.w * meta.scale) / 2;
    if (edge - 2 * half < stop) return;
    out.push({ meta, x: edge - half, half, flip: i % 2 === 1 });
    edge -= 2 * half;
  });
  return out;
}

/** The street's Tower's foot in world x (its cultivation's spot), or null. */
function towerFootX(state) {
  const t = towerItem(state);
  return t ? homeStreetLayout(state).houseX + t.rx : null;
}

/**
 * Where the street's own grass, flowers and plants may grow (drawLandscape's `skipNear`): off
 * the house lot, and no sprite over a Tower's doorway (`towerX`, its foot, when there is one).
 * Cultivations a player planted are not scenery and are never moved. PURE.
 */
export function streetNearSkip(layout, { towerX = null } = {}) {
  const tower = Number.isFinite(towerX) ? towerDoorway(towerX) : null;
  return (px, half = 0) => (px > layout.lotLeft + 40 && px < layout.lotRight - 40)
    || Boolean(tower && px + half > tower.x1 && px - half < tower.x2);
}

/**
 * The street style's `near` row along the ground (grass, flowers, plants): each sprite's x,
 * half width and flip, skipping where `skip(px, half)` says. PURE; drawLandscape draws these.
 */
export function landscapeNearSpots(style, seed, width, skip = () => false) {
  const out = [];
  for (const item of style?.near || []) {
    let i = 0;
    for (let x = item.offset || 0; x < width; x += item.every) {
      const jx = (hash01(`${seed}:near:${item.s}:${i}`) - 0.5) * item.jitter * 2;
      const px = x + jx;
      i += 1;
      const row = pickAlt(item, `${seed}:near:${item.s}:${i}:alt`);
      const half = (row.w * row.scale) / 2;
      if (skip(px, half)) continue;
      out.push({ item, row, x: px, half, flip: hash01(`${item.s}:${i}`) > 0.5 });
    }
  }
  return out;
}

/** The house's left end, its front door and its sign corner (where the Mailbox stands), in world x. */
export function houseFixtureX(layout, houseStyle = 'meadow') {
  const h = HOUSES[houseStyle] || HOUSES.meadow;
  const w = h.w * h.scale;
  const left = layout.houseX - w / 2;
  return { left, doorX: layout.houseX + (h.doorX - 0.5) * w, signX: left + w * (h.signX + 0.02) };
}

/**
 * The street style shown: the one you chose, else the purchase look's
 * (js/home-styles.js). G263: the purchase looks start on the source's
 * tutorial styles (magic_rock.js 594-605); a home that never changed style
 * saves none, so a saved Firebog or Uralia home moves to them on load.
 */
function currentStreetStyle(engine) {
  return streetStyleFor(streetStyle, engine?.homeContext?.().style || 'meadow');
}

/** G263: the yard style: the one you chose, else the purchase look's (magic_rock.js 594-605). */
function currentYardStyle(engine) {
  return yardStyleFor(yardStyle, engine?.homeContext?.().style || 'meadow');
}

function hash01(seed) {
  let s = 2166136261;
  for (const ch of String(seed)) s = Math.imul(s ^ ch.charCodeAt(0), 16777619) >>> 0;
  return (s % 10000) / 10000;
}

function decoUrl(name) {
  return name.endsWith('.svg') ? `${DECO}${name}` : `${DECO}${name}.png`;
}

function decoSprite(PIXI, item, x, y, flip = false) {
  const spr = new PIXI.Sprite(textureFromUrl(decoUrl(item.s)));
  spr.anchor.set(0.5, item.hang ? 0 : 1);
  spr.width = item.w * item.scale;
  spr.height = item.h * item.scale;
  if (flip && !item.noFlip) spr.scale.x *= -1;
  if (item.flipY) spr.scale.y *= -1;
  if (item.tint != null) spr.tint = item.tint;
  if (item.alpha != null) spr.alpha = item.alpha;
  spr.x = x;
  spr.y = y;
  return spr;
}

/** A repeated item's sprite at position i: one of its alts, by a stable hash. */
function pickAlt(item, seed) {
  if (!item.alts) return item;
  return { ...item, ...item.alts[Math.floor(hash01(seed) * item.alts.length)] };
}

function gradientTexture(PIXI, ...colors) {
  const canvas = document.createElement('canvas');
  canvas.width = 2;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, 0, 256);
  colors.forEach((c, i) => grad.addColorStop(i / Math.max(1, colors.length - 1), `#${c.toString(16).padStart(6, '0')}`));
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 2, 256);
  return PIXI.Texture.from(canvas);
}

/** The recipes' field: its back edge at y 586 on the old 620 px street (tools/home-styles/recipes.mjs). */
const RECIPE_FIELD_TOP = 586;
const RECIPE_FIELD_DEPTH = OLD_STREET_GROUND_Y - RECIPE_FIELD_TOP;
/**
 * How far the walkable field reaches back from the walk line, for a look
 * without its own `depth` (#117). Every home street is a clone of a `*_high`
 * template whose ground runs back to the tree line, and cultivations stand on
 * the walk line in front of it (inc_cultivation.js cultivation_purchase puts
 * the item at the x, y picked on the street's ground; GardenView.place stands
 * the bed on that y). Measured on the archived home-street renders
 * (research/wayback/raw/home-images/homestreets, a 1,000 px street at
 * height/1000): the Groddle meadows and forests show about 110 to 150 px of
 * field, the Uralia streets about 190. A large garden's bed reaches 68 px
 * above the walk line (js/garden-view.js polherb_3 at 0.7), so the field must
 * reach well past that or the bed's back row lies over the backdrop. The
 * remake's camera shows less above the ground than the 2012 client's 600 px
 * view, so a 190 px Uralia field pushed its trees off the top of the screen:
 * every look keeps this depth unless its recipe sets its own.
 */
export const FIELD_DEPTH = 130;

/** The field's depth for a look: its own `depth`, else FIELD_DEPTH. */
export function fieldDepth(look) {
  const depth = Number(look?.depth);
  return Number.isFinite(depth) && depth > RECIPE_FIELD_DEPTH ? depth : FIELD_DEPTH;
}

/**
 * Where a look's field starts (its back edge) over a walk line, and how far
 * the backdrop rises with it: everything the recipe stood at the old field's
 * back edge stands at the new one, so trees and hills keep their footing.
 * Pieces drawn down from the top (`hang`, and the `flipY` stalactites of
 * Canyon Cavern) stay where they hang.
 */
export function landscapeGeometry(look, groundY) {
  const depth = fieldDepth(look);
  return { depth, fieldTop: groundY - depth, rise: depth - RECIPE_FIELD_DEPTH };
}

/**
 * A style's landscape (js/home-styles.js looks): the sky, parallax layers, the
 * walkable field with its soil, and grass and plants along it. Item y values
 * are on the old 620 px street, moved down by `lift` and up by the deeper
 * field's rise (landscapeGeometry). Returns the parallax update for
 * bgLayer.updateParallax.
 */
function drawLandscape(engine, root, style, seed, { width, groundY, lift, skipNear = () => false }) {
  const { fieldTop, rise } = landscapeGeometry(style, groundY);
  const { PIXI } = engine;
  const sky = new PIXI.Sprite(gradientTexture(PIXI, ...style.sky));
  sky.zIndex = -100;
  // The profile's diorama (js/home-layout-scene.js) draws these from their colours.
  sky.homeLayoutSky = style.sky;
  root.addChild(sky);

  const parallax = [];
  const spanFor = (f) => width * f + VIEW_W * (1 - f) + 400;
  if (style.stars) {
    // A night sky: fixed dots, as the Toxic Moon and Midnight Glow headers show.
    const lc = new PIXI.Container();
    lc.zIndex = -99;
    const dots = new PIXI.Graphics();
    const f = 0.02;
    const span = spanFor(f);
    const count = Math.round((style.stars.count * span) / 1000);
    for (let i = 0; i < count; i += 1) {
      const x = hash01(`${seed}:star:x:${i}`) * span - 200;
      const y = -120 + hash01(`${seed}:star:y:${i}`) * (style.stars.maxY + 120) + lift;
      const r = 0.8 + hash01(`${seed}:star:r:${i}`) * 1.6;
      dots.circle(x, y, r).fill({ color: style.stars.color ?? 0xffffff, alpha: 0.5 + hash01(`${seed}:star:a:${i}`) * 0.5 });
    }
    lc.addChild(dots);
    lc.parallaxF = f;
    root.addChild(lc);
    parallax.push(lc);
  }
  style.layers.forEach((layer, li) => {
    const lc = new PIXI.Container();
    lc.zIndex = -90 + li;
    // A layer spans what the camera can reveal at its parallax rate.
    const span = spanFor(layer.f);
    if (layer.band) {
      const band = new PIXI.Graphics();
      const by = layer.band.y + lift - rise;
      band.rect(-200, by, span + 200, layer.band.h).fill({ color: layer.band.color, alpha: layer.band.alpha ?? 1 });
      band.homeLayoutFills = [[-200, by, span + 200, layer.band.h, layer.band.color, layer.band.alpha ?? 1]];
      lc.addChild(band);
    }
    for (const item of layer.items || []) {
      let i = 0;
      for (let x = (item.offset || 0) - 200; x < span; x += item.every) {
        const jx = item.jitter ? (hash01(`${seed}:${li}:${item.s}:${i}`) - 0.5) * item.jitter * 2 : 0;
        const row = pickAlt(item, `${seed}:${li}:${item.s}:${i}:alt`);
        if (row.tint == null && layer.tint != null) row.tint = layer.tint;
        lc.addChild(decoSprite(PIXI, row, x + jx, item.y + lift - (item.hang || item.flipY ? 0 : rise), hash01(`${item.s}:${i}:flip`) > 0.5));
        i += 1;
      }
    }
    if (layer.alpha != null) lc.alpha = layer.alpha;
    lc.parallaxF = layer.f;
    root.addChild(lc);
    parallax.push(lc);
  });

  // The walkable field and the soil cross-section below it.
  const field = new PIXI.Graphics();
  field.zIndex = -40;
  field.rect(-50, fieldTop, width + 100, groundY - fieldTop + 40).fill(style.field);
  field.rect(-50, groundY + 10, width + 100, 30).fill({ color: style.fieldDark, alpha: 0.5 });
  field.homeLayoutFills = [[-50, fieldTop, width + 100, groundY - fieldTop + 40, style.field, 1], [-50, groundY + 10, width + 100, 30, style.fieldDark, 0.5]];
  root.addChild(field);
  const soilFill = new PIXI.Graphics();
  soilFill.zIndex = -39.5;
  soilFill.rect(-50, groundY + 30, width + 100, 240).fill(style.soilColor || 0x5c3b25);
  soilFill.homeLayoutFills = [[-50, groundY + 30, width + 100, 240, style.soilColor || 0x5c3b25, 1]];
  root.addChild(soilFill);
  const soilW = 1038 * 0.6;
  if (!style.soil) {
    soilFill.rect(-50, groundY + 30, width + 100, 6).fill({ color: 0x000000, alpha: 0.22 });
    soilFill.homeLayoutFills.push([-50, groundY + 30, width + 100, 6, 0x000000, 0.22]);
    for (let x = 30; x < width; x += 140) {
      const r = 6 + hash01(`pebble:${x}`) * 10;
      soilFill.ellipse(x + hash01(`p2:${x}`) * 60, groundY + 70 + hash01(`p3:${x}`) * 50, r * 1.6, r).fill({ color: 0x000000, alpha: 0.14 });
    }
  }
  for (let x = -40; style.soil && x < width + soilW; x += soilW - 2) {
    const soil = new PIXI.Sprite(textureFromUrl(decoUrl(style.soil)));
    soil.anchor.set(0, 0);
    soil.width = soilW;
    soil.height = 150;
    soil.x = x;
    soil.y = groundY + 26;
    soil.zIndex = -39;
    root.addChild(soil);
  }
  // Grass, flowers and plants along the yard, kept off the house lot (landscapeNearSpots).
  const near = new PIXI.Container();
  near.zIndex = -30;
  for (const spot of landscapeNearSpots(style, seed, width, skipNear)) {
    const row = spot.row;
    if (row.tint == null && style.nearTint != null) row.tint = style.nearTint;
    near.addChild(decoSprite(PIXI, row, spot.x, groundY + 22 + (spot.item.below || 0), spot.flip));
  }
  root.addChild(near);

  return {
    update(camX, camY, vpW, skyH) {
      sky.x = camX;
      sky.y = camY;
      sky.width = vpW;
      sky.height = skyH;
      for (const lc of parallax) lc.x = camX * (1 - lc.parallaxF);
    },
  };
}

function streetBackground(engine, styleKey, houseStyle = 'meadow') {
  const { PIXI } = engine;
  const style = streetLook(styleKey);
  const seed = style.seed || styleKey;
  const layout = homeStreetLayout(cult);
  const width = layout.width;
  const root = new PIXI.Container();
  root.sortableChildren = true;
  const land = drawLandscape(engine, root, style, seed, {
    width,
    groundY: STREET_GROUND_Y,
    lift: STREET_LIFT,
    // Grass, flowers and plants along the yard, kept off the house lot and a Tower's doorway.
    skipNear: streetNearSkip(layout, { towerX: towerFootX(cult) }),
  });

  // The house, centred on its lot
  const h = HOUSES[houseStyle] || HOUSES.meadow;
  const house = new PIXI.Sprite(textureFromUrl(`${DECO}${h.path}.png`));
  house.anchor.set(0.5, 1);
  house.scale.set(h.scale);
  house.x = layout.houseX;
  house.y = STREET_GROUND_Y + 14;
  house.zIndex = -20;
  house.homeLayout = { k: 'house', s: HOUSES[houseStyle] ? houseStyle : 'meadow' };
  root.addChild(house);
  // A planted border along the front of the house, from its left corner, clear of the doorway (PORCH).
  const trim = new PIXI.Container();
  trim.zIndex = -19;
  const { doorX, signX } = houseFixtureX(layout, houseStyle);
  for (const spot of streetTrimSpots(style, layout, houseStyle)) {
    const row = style.nearTint != null && spot.meta.tint == null ? { ...spot.meta, tint: style.nearTint } : spot.meta;
    trim.addChild(decoSprite(PIXI, row, spot.x, STREET_GROUND_Y + 20, spot.flip));
  }
  root.addChild(trim);

  root.worldH = STREET_WORLD_H;
  root.platformsScreen = [{ id: 'home-ground', x1: 0, y1: STREET_GROUND_Y, x2: width, y2: STREET_GROUND_Y, pc_perm: -1 }];
  root.updateParallax = (camX, camY, vpW, vpH, skyH = vpH) => land.update(camX, camY, vpW, skyH);
  root.houseDoorX = doorX;
  root.houseSignX = signX;
  root.houseDoorway = houseDoorway(layout, houseStyle);
  root.streetStyle = styleKey;
  return root;
}

/** The drawn Mailbox and door x on this street (they follow the house style), and the doorway (door and mat). */
function streetFixtureAt() {
  const bg = scene?.background;
  const layout = homeStreetLayout(cult);
  return {
    mailboxX: Math.round(bg?.houseSignX ?? layout.houseX - 260),
    doorX: bg?.houseDoorX ?? layout.houseX,
    ...(bg?.houseDoorway ? { doorway: bg.houseDoorway } : {}),
  };
}

/** A movable fixture's world x on your own home street (its usual spot until moved), or null. */
function fixtureWorldX(id, excludeId = null) {
  if (scene?.room !== 'street' || isBackYard(cult)) return null;
  const rx = fixtureRx(cult, id, { excludeId, at: streetFixtureAt() });
  return rx == null ? null : homeStreetLayout(cult).houseX + rx;
}

/** The Mail Dispatcher's world x on your own home street (mail-courier-feature draws it), or null. */
function dispatcherWorldX(excludeId = null) {
  return fixtureWorldX('dispatcher', excludeId);
}

/*
 * Moving the Mail Dispatcher (lane HOMEMAIL: "can I move my mail dispatcher?"). Reimagined: the
 * source rebuilt it with the mailbox from the street template whenever a player street changed
 * (locations/inc_upgrades.js upgrades_recreate_classes), so no player ever moved it. Here
 * Cultivate carries it too, on your home street: click it (or the banner's Move Mail Dispatcher)
 * for Move and Back to its usual spot, or press and drag it. It sets down only where it is clear
 * of the street's ends, the fixtures and your cultivations (home-street-fixtures dispatcherFits);
 * the spot is saved with the street (cult.dispatcherRx, x from the house's centre), solo and online.
 *
 * PORCH (Austin 2026-11-01, "my house front is crowded"): the Mailbox and the Magic Rock move the
 * same way (Move Mailbox, Move Magic Rock; cult.mailboxRx / cult.rockRx), reimagined as well: the
 * source put the Mailbox with the street template and the rock at (221, -144) right of the door
 * (inc_homes.js homes_demo_frontyard 2469-2471) and never moved either. They are part of the
 * street, not items: nothing is created or moved in value, so the ledger is not involved.
 */
let dimmedFixture = null;

/** The movable fixture's interactable on your street (the rock: the street's own, not the yard's). */
function fixtureTarget(engine, id) {
  const meta = MOVABLE_FIXTURES[id];
  if (!meta) return null;
  return (engine?.interactables || []).find((t) => t.classId === meta.classId && t.sprite && !t.sprite.destroyed
    && (id !== 'rock' || t.state?.room === 'street')) || null;
}

function canMoveFixture(engine, id) {
  return mode === 'cultivate' && scene?.room === 'street' && Boolean(fixtureTarget(engine, id));
}

/** The movable fixture whose drawn art is under a world point, or null. */
function fixtureAt(engine, p) {
  if (scene?.room !== 'street') return null;
  for (const id of ['dispatcher', 'mailbox', 'rock']) {
    const s = fixtureTarget(engine, id)?.sprite;
    const meta = MOVABLE_FIXTURES[id];
    if (s && Math.abs(p.x - s.x) <= meta.half && p.y <= s.y + 10 && p.y >= s.y - meta.tall) return id;
  }
  return null;
}

/** Whether it may stand at world x now: on the street, clear of the door, the other fixtures and the cultivations. */
function fixtureCheck(id, x) {
  const layout = homeStreetLayout(cult);
  return fixtureFits(layout, id, Math.round(x), fixtureObstacles(cult, id, { at: streetFixtureAt() }));
}

/** While you carry it, the one standing there fades back. */
function dimFixture(engine, id, on) {
  if (dimmedFixture && !dimmedFixture.destroyed) dimmedFixture.alpha = 1;
  dimmedFixture = null;
  const s = on ? fixtureTarget(engine, id)?.sprite : null;
  if (!s) return;
  s.alpha = 0.35;
  dimmedFixture = s;
}

function selectFixture(engine, id) {
  if (!canMoveFixture(engine, id)) return false;
  if (placing) cancelCarry(engine);
  selected = { kind: 'fixture', id };
  drawCultivationMarkers(engine);
  renderBar(engine);
  publish(engine);
  return true;
}

/** Carry it with the pointer, or at your feet ('avatar': walk it over, then Place). */
function beginFixtureMove(engine, id, by = 'pointer') {
  if (!canMoveFixture(engine, id)) return false;
  placing = { kind: 'fixture', id, classTsid: MOVABLE_FIXTURES[id].classId, moveId: id };
  selected = { kind: 'fixture', id };
  carryBy = by;
  if (by === 'avatar') pointer.inside = false;
  makeGhost(engine);
  dimFixture(engine, id, true);
  renderBar(engine);
  if (by === 'avatar') {
    syncFloating(engine, true);
    ui?.builder?.place?.focus?.({ preventScroll: true });
  }
  publish(engine);
  return true;
}

/** Stand them where they now belong (mail-courier-feature checks the dispatcher every 400 ms as well). */
function settleFixtures(engine) {
  for (const id of MOVABLE_FIXTURE_IDS) {
    const t = fixtureTarget(engine, id);
    const x = fixtureWorldX(id);
    if (t && x != null) t.sprite.x = Math.round(x);
  }
}

function placeFixture(engine, id, x) {
  const fit = fixtureCheck(id, x);
  if (!fit.ok) {
    engine.toast(fit.msg);
    engine.playSound?.('CLICK_FAILURE', { volume: 0.4 });
    fixtureLast[id] = `refused:${fit.reason}`;
    publish(engine);
    return fit;
  }
  const key = MOVABLE_FIXTURES[id].key;
  cult[key] = Math.round(x) - homeStreetLayout(cult).houseX;
  placing = null;
  selected = { kind: 'fixture', id };
  destroyGhost();
  settleFixtures(engine);
  engine.playSound?.('ITEM_DROP', { volume: 0.45 });
  engine.pushActivity(fixtureText(id).moved);
  fixtureLast[id] = `moved:${cult[key]}`;
  engine.save();
  drawCultivationMarkers(engine);
  renderBar(engine);
  publish(engine);
  return { ok: true, x: Math.round(x), rx: cult[key] };
}

/** Back to its usual spot. */
function resetFixture(engine, id) {
  if (savedFixtureRx(cult, id) == null) return { ok: false, reason: 'usual' };
  delete cult[MOVABLE_FIXTURES[id].key];
  if (placing?.kind === 'fixture') {
    placing = null;
    destroyGhost();
  }
  settleFixtures(engine);
  engine.playSound?.('ITEM_DROP', { volume: 0.45 });
  engine.pushActivity(fixtureText(id).resetDone);
  fixtureLast[id] = 'usual';
  engine.save();
  drawCultivationMarkers(engine);
  renderBar(engine);
  publish(engine);
  return { ok: true };
}

/** The selected fixture's actions, floating by it: Move, Back to its usual spot. */
function fixturePop(engine) {
  const id = selected?.kind === 'fixture' ? selected.id : null;
  if (!id || placing || !canMoveFixture(engine, id)) return null;
  const text = fixtureText(id);
  const moved = savedFixtureRx(cult, id) != null;
  return {
    key: `f:${id}:${moved ? 1 : 0}`,
    title: text.label,
    sub: text.sub,
    actions: [
      { label: text.move, primary: true, title: text.moveTitle, attrs: { 'data-home-action': `${id}-move` }, onClick: () => beginFixtureMove(engine, id, 'avatar') },
      {
        label: text.reset,
        disabled: !moved,
        title: moved ? text.resetTitle : text.atUsual,
        attrs: { 'data-home-action': `${id}-reset` },
        onClick: () => resetFixture(engine, id),
      },
    ],
  };
}

/** The banner's Move Mailbox, Move Magic Rock and Move Mail Dispatcher (those on the street now). */
function fixtureBannerActions(engine) {
  return MOVABLE_FIXTURE_IDS.filter((id) => fixtureTarget(engine, id)).map((id) => ({
    label: fixtureText(id).banner,
    title: fixtureText(id).bannerTitle,
    attrs: { 'data-home-fixture': id, ...(id === 'dispatcher' ? { 'data-home-dispatcher': 'select' } : {}) },
    onClick: () => {
      if (selectFixture(engine, id)) ui?.builder?.pop?.querySelector('button:not([disabled])')?.focus({ preventScroll: true });
    },
  }));
}

/**
 * GATESIGN2 (Austin 2026-10-31: "the 2 different poles look silly. Let's combine and just put
 * the top one as, Back to Ur"): the home street's one signpost, Tiny Speck's street signpost
 * (street-render oneArmSignpost) where the friends' signpost stands (locations/home.js
 * 212-218, home-street-fixtures signpostX). Its top arm, at a street signpost's first slot
 * (246 px post), says Back to Ur and points left, toward the world: Enter on it takes you back
 * to the street you came from, as the code-drawn World Gate did. Online the friends' arms hang
 * below it (home-street-mp-feature drawSignpost, its 200 px slots), so they never cross. The
 * original had no gate: you left through the Imagination menu (ImgMenuHome.as,
 * ImgMenuBackToWorld.as), whose Back to world the hub keeps.
 */
function makeHomeSignpost(engine) {
  const post = oneArmSignpost(engine.PIXI, WAY_OUT_ARM, { left: true });
  post._worldHitW = WAY_OUT_HIT.w;
  post._worldHitH = WAY_OUT_HIT.h;
  // FRIENDPOST: the Enter hint sits over the post's top, clear of its arms (game.js, as a street post's T hint).
  post._promptLift = SIGN_PROMPT_LIFT;
  post.label = 'home-signpost';
  // The profile's diorama writes the arm's words itself (js/home-layout.js HOME_LAYOUT_TEXTS).
  for (const board of post.signBoards || []) if (board.label) board.label.homeLayoutText = 'way_out';
  return post;
}

/** World px over the post's foot where its hint's bottom sits: the post's top (246 at 0.8) and 10 more, as a street post's T hint. */
export const SIGN_PROMPT_LIFT = Math.round(246 * 0.8 + 10);

/** The top arm's words. */
export const WAY_OUT_ARM = 'Back to Ur';

/**
 * The way out's hit box: the post and its top arm. The friends' arms' own box (home-street-mp-feature)
 * is smaller and stops under the top arm, so a click there picks a friend and the top arm the way out.
 */
export const WAY_OUT_HIT = Object.freeze({ w: 140, h: 210 });

/** PURE: the way out's target words: Back to Ur, its tip the street it leads to and its hub ({ label, hubName }). */
export function wayOutTarget(way = {}) {
  const label = String(way?.label || '').trim();
  const hub = String(way?.hubName || '').trim();
  return {
    label: WAY_OUT_ARM,
    subtitle: label ? `${label}${hub && hub !== label ? `, ${hub}` : ''}` : 'Back out into the world',
  };
}

function spawnStreetTargets(engine) {
  const { PIXI } = engine;
  const layout = homeStreetLayout(cult);
  const bg = scene?.background;
  const unread = Number(engine.homeContext?.().unread) || 0;
  const mailbox = new PIXI.Sprite(textureFromUrl(unread > 0
    ? 'assets/sprites/mailbox/npc_mailbox_variant_mailboxRight_x1_has_mail_idle_png_1354832230.png'
    : 'assets/sprites/mailbox/npc_mailbox_variant_mailboxRight_x1_idle_png_1354832227.png'));
  mailbox.anchor.set(0.5, 1);
  // PORCH: where you moved it, else the house's sign corner.
  mailbox.x = Math.round(fixtureWorldX('mailbox') ?? bg?.houseSignX ?? layout.houseX - 260);
  mailbox.y = STREET_GROUND_Y + 4;
  mailbox.zIndex = 30;
  engine.entityLayer.addChild(mailbox);
  const mailTarget = engine.register({
    classId: 'npc_mailbox',
    // The original's name (npc_mailbox.js 3-5); the encyclopedia's joke name with a one in brackets read as a count of mail.
    label: 'Mailbox',
    subtitle: unread ? `${unread} unread message${unread === 1 ? '' : 's'}` : 'Your very own mail',
    sprite: mailbox,
    state: { unread },
  });
  // The house deco already paints its front door; this is its hit area.
  const doorX = bg?.houseDoorX ?? layout.houseX;
  const door = new PIXI.Graphics();
  door.rect(-46, -150, 92, 150).fill({ color: 0xffffff, alpha: 0.001 });
  door.x = doorX;
  door.y = STREET_GROUND_Y;
  door.zIndex = 9;
  engine.entityLayer.addChild(door);
  const doorTarget = engine.register({
    classId: 'home_door',
    label: 'Your House',
    subtitle: 'The indoor half of home',
    sprite: door,
    state: { room: 'street' },
  });
  const ctx = engine.homeContext?.() || {};
  // GATESIGN: the street you came from (else your arrival street), as returnFromHome goes.
  const way = ctx.wayOut || { label: ctx.returnLabel || '', hubName: '' };
  const words = wayOutTarget(way);
  const gate = makeHomeSignpost(engine);
  gate.x = signpostX(layout);
  gate.y = STREET_GROUND_Y + 2;
  gate.zIndex = 20;
  engine.entityLayer.addChild(gate);
  const gateTarget = engine.register({
    classId: 'home_return_marker',
    label: words.label,
    subtitle: words.subtitle,
    sprite: gate,
    state: { returnLabel: way.label || '', returnHub: way.hubName || '' },
  });
  // FRIENDPOST: hovering the arm says where it leads.
  for (const b of gate.signBoards || []) b.tip = way.label ? `Back to ${way.label}` : '';
  return { mailbox: mailTarget, door: doorTarget, gate: gateTarget };
}

// ---------------------------------------------------------------------------
// Furniture views
// ---------------------------------------------------------------------------

/**
 * The shown item's centre over a Storage Display Box's foot: bag_furniture_sdb.js getExtraConfig
 * 909-930 puts it 26 px over the SWF stage's bottom (delta_y -26, center_view, width 34); the art
 * is drawn from its own bottom, the base SWF's 12 px under that point (render.py --base), an
 * upgrade's art.foot. Was -35, 3 px low.
 */
export const SDB_ITEM_DY = -26;
export const SDB_BASE_FOOT = -12;
function displayIconY(item, upgradeId = item.upgradeId) {
  const foot = Number(pieceArt(item.classTsid, upgradeId)?.foot);
  return SDB_ITEM_DY + (Number.isFinite(foot) ? foot : SDB_BASE_FOOT);
}

function furnitureView(PIXI, item) {
  // G358: an upgraded piece (or the style the picker previews on it) draws its upgrade's frame.
  const upgradeId = upgradePreview?.id === item.id ? upgradePreview.upgradeId : item.upgradeId;
  const art = pieceArt(item.classTsid, upgradeId);
  const s = pieceScale(item.classTsid, upgradeId);
  const box = new PIXI.Container();
  const spr = new PIXI.Sprite(textureFromUrl(art.path));
  spr.anchor.set(0.5, item.slot === 'ceiling' ? 0 : 1);
  spr.scale.set((item.facingRight ? 1 : -1) * s, s);
  box.addChild(spr);
  box.art = spr;
  if (item.slot === 'ceiling') {
    const cord = new PIXI.Graphics();
    cord.rect(-1, -8, 2, 10).fill(0x5a4a3a);
    box.addChildAt(cord, 0);
  }
  if (item.slot === 'wall' || item.slot === 'floor') {
    const shadow = new PIXI.Graphics();
    const { w } = furnitureSize(item.classTsid, upgradeId);
    if (item.slot === 'floor' && !item.on) {
      shadow.ellipse(0, -2, w * 0.46, 7).fill({ color: 0x000000, alpha: 0.16 });
    }
    box.addChildAt(shadow, 0);
    if (item.slot === 'wall') {
      const silhouette = new PIXI.Sprite(textureFromUrl(art.path));
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
    const icon = new PIXI.Sprite(textureFromUrl(ITEM_CATALOG[item.display.classTsid]?.icon || `assets/sprites/icons/${item.display.classTsid}.png`));
    icon.anchor.set(0.5);
    icon.width = 34;
    icon.height = 34;
    icon.y = displayIconY(item, upgradeId);
    icon.label = 'sdb-icon';
    box.addChild(icon);
    const badge = new PIXI.Text({ text: String(item.display.count), style: {
      fontFamily: 'Trebuchet MS, sans-serif',
      fontSize: 11,
      fontWeight: '700',
      fill: 0xffffff,
      stroke: { color: 0x3b2a1f, width: 3 },
    } });
    badge.anchor.set(1, 1);
    badge.x = 28;
    badge.y = -6;
    // Ticket 51: the storage feature keeps a visited box's count up to date (home-storage-feature).
    badge.label = 'sdb-count';
    box.addChild(badge);
  }
  box.x = item.x;
  box.y = item.y;
  box.furnitureId = item.id;
  return box;
}

/**
 * The room's two furniture holders in the entity layer: `back` under the avatars (wall, rug and
 * floor pieces) and `front` over them (ceiling pieces, FG_FURN), both in room x from `x`.
 */
function addFurnitureLayers(engine, x = 0) {
  const { PIXI } = engine;
  const make = (zIndex, label) => {
    const layer = new PIXI.Container();
    layer.sortableChildren = true;
    layer.zIndex = zIndex;
    layer.label = label;
    layer.x = x;
    engine.entityLayer.addChild(layer);
    return layer;
  };
  return { back: make(FURNITURE_Z, 'home-furniture'), front: make(FURNITURE_FRONT_Z, 'home-furniture-front') };
}

/** Which of a room's two holders a piece goes in. */
function furnitureHolder(layers, item) {
  return furnitureDrawsInFront(item) && layers.front ? layers.front : layers.back;
}

function renderFurniture(engine) {
  if (!scene?.furnitureLayer) return;
  const { PIXI } = engine;
  const layers = { back: scene.furnitureLayer, front: scene.furnitureFrontLayer };
  for (const layer of [layers.back, layers.front]) {
    layer?.removeChildren().forEach((child) => child.destroy({ children: true }));
  }
  const here = houseFloorHere();
  const views = new Map();
  renderOrder(decor).forEach((item, i) => {
    // A Door between floors (or building one) is drawn by its own target (spawnDoorTargets).
    if (here != null && item.classTsid === DOOR_CLASS && doorRole(floors, here, item.id)) return;
    const view = furnitureView(PIXI, item);
    view.zIndex = i;
    // BUILDER: the piece being carried stays faint where it was (HandOfDecorator lis_to_hide).
    if (placing?.moveId === item.id) view.alpha = 0.3;
    views.set(item.id, view);
    furnitureHolder(layers, item).addChild(view);
  });
  scene.furnitureViews = views;
  scene.hoverGlow = null;
  if (hoverId != null) drawHover(engine);
  if (selected?.kind === 'furniture' && placing?.moveId !== selected.id) {
    const item = placedItem(decor, selected.id);
    if (item) furnitureHolder(layers, item).addChild(selectionOutline(PIXI, furnitureBounds(item)));
    else selected = null;
  }
  engine.setData('homeFurnitureFront', layers.front ? layers.front.children.length : 0);
  scene.background?.redraw?.();
  // What was set on a piece rests on it as it stands now (moved, restyled, picked up or sold).
  settleRoomStacks(engine);
  drawStackSelection(engine);
  publish(engine);
}

function furnitureBounds(item) {
  const { w, h } = furnitureSize(item.classTsid, upgradePreview?.id === item.id ? upgradePreview.upgradeId : item.upgradeId);
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

function cultivationWorldX(item, state = activeCult()) {
  return homeStreetLayout(state).houseX + item.rx;
}

/**
 * createItemStackWithPoof (locations/location.js 2054-2070) for a yard
 * cultivation: quests/quest.js 1880 (a finished restore poofs its new end
 * item in where the proto stood) and items/include/cultivation.js 75
 * replaceWithDepleted -> item.js 478-488 replaceWithPoofIfOnGround (a worn
 * out item poofs into its proto). proto_puff and PROTO_PUFF, centred on the
 * new stack (js/overlay-art.js playPoofIn). Queued here and played once the
 * yard is redrawn (spawnCultivations), dropped if no redraw comes within 2 s.
 */
const pendingPoofs = [];
const POOF_ITEM_H = { rock: 60, garden: 50, patch: 40, node: 90, hive: 107 };

function queueCultivationPoof(item, st, { proto = false } = {}) {
  const def = cultivationDef(item?.protoClass);
  if (!def || def.kind === 'tower') return;
  const art = proto ? PROTO_DEPLETED_ART[item.protoClass] : null;
  const itemH = art ? art[4] : (def.art && POD_ART[def.art]?.h) || POOF_ITEM_H[def.kind] || 60;
  pendingPoofs.push({ id: item.id, st, itemH, at: Date.now() });
}

function playPendingPoofs(engine, st, before = null) {
  const now = Date.now();
  for (let i = pendingPoofs.length - 1; i >= 0; i -= 1) {
    const row = pendingPoofs[i];
    if (now - row.at > 2000) { pendingPoofs.splice(i, 1); continue; }
    if (row.st !== st) continue;
    pendingPoofs.splice(i, 1);
    const item = st.items.find((r) => r.id === row.id);
    if (!item) continue;
    engine.playSound?.('PROTO_PUFF', { volume: 0.5 });
    playPoofIn(engine.PIXI, { layer: engine.fxLayer || engine.entityLayer, x: cultivationWorldX(item, st), bottom: yardGroundY(st) + 6, itemH: row.itemH });
    // poofItIn's fade (LocationItemstackView.as 739, 768): whatever the redraw drew for this item (G298).
    const faded = before ? fadeInNewNear(engine.entityLayer, before, { x: cultivationWorldX(item, st), halfW: footprint(item.protoClass) }) : [];
    if (engine.setData) engine.setData('homePoofFade', String(faded.length));
  }
  if (engine.setData) engine.setData('homePoof', String(now));
}

function shimEngine(engine, population, points) {
  return Object.create(engine, {
    population: { value: population },
    placement: { value: (key) => points[key] || [] },
  });
}

/**
 * The yard's cultivations (the home street's, or the back yard's in the
 * house), each kind through its own system, with this yard's world slots.
 */
function spawnCultivations(engine, st = activeCult()) {
  const { PIXI } = engine;
  const now = Date.now();
  const tsid = yardTsid(st);
  const groundY = yardGroundY(st);
  const world = engine.streetWorld ? engine.streetWorld(tsid) : null;
  // A queued poof fades in what this redraw adds for its item (playPendingPoofs, G298).
  const poofBefore = pendingPoofs.length ? new Set(engine.entityLayer?.children || []) : null;
  // Rocks: the yard's own rock slots, in cultivation order.
  const rocks = rockItems(st.items);
  rocks.forEach((item, index) => {
    engine.spawnMineRock?.(rockClassFor(item.endClass), cultivationWorldX(item, st), groundY, index);
  });
  if (world) world.rocks.length = rocks.length;
  // Gardens: their plots live with the cultivation.
  for (const item of liveItems(st.items)) {
    const def = cultivationDef(item.protoClass);
    if (def.kind !== 'garden' || !engine.spawnGarden) continue;
    const target = engine.spawnGarden({
      x: cultivationWorldX(item, st),
      y: groundY + 2,
      gardenType: def.gardenType,
      cols: def.cols,
      rows: def.rows,
      label: def.label.replace(/^S\. |^M\. |^L\. /, ''),
      garden: st.gardens[item.id] || null,
      detached: true,
    });
    if (target?.state?.garden) st.gardens[item.id] = target.state.garden;
    // The profile's diorama names the garden by its kind (js/home-layout.js).
    if (target?.sprite) {
      target.sprite.homeLayout = { k: 'cultivation', i: item.protoClass };
      // The bed and its plots are drawn beside the target's own (invisible) foot: they are the garden's art.
      const bed = target._gardenRoot;
      if (bed) bed.homeLayoutPartOf = target.sprite;
      for (const cell of Object.values(bed?.plotViews || {})) cell.homeLayoutPartOf = target.sprite;
    }
  }
  // Pods, mounds and hives: their recovered art, then the resource nodes.
  for (const item of liveItems(st.items)) {
    const def = cultivationDef(item.protoClass);
    if (!def.art) continue;
    const art = POD_ART[def.art];
    const spr = new PIXI.Sprite(textureFromUrl(`assets/sprites/cultivation/${def.art}.png`));
    spr.anchor.set(0.5, 1);
    spr.x = cultivationWorldX(item, st);
    spr.y = groundY + 6;
    spr.zIndex = 14;
    spr.width = art.w;
    spr.height = art.h;
    engine.entityLayer.addChild(spr);
  }
  const population = { resourceNodeClasses: [] };
  const points = {};
  for (const item of st.items) {
    for (const node of cultivationNodes(item, now)) {
      const cls = node.classTsid.startsWith('peat_') ? 'peat_1' : node.classTsid;
      population.resourceNodeClasses.push(node.classTsid);
      (points[`resource:${cls}`] ||= []).push({ x: cultivationWorldX(item, st) + node.dx, y: groundY + node.dy });
    }
  }
  if (population.resourceNodeClasses.length) {
    resourceNodesFeature.onStreetEnter({ tsid }, shimEngine(engine, population, points));
  }
  // Patches: the patches feature runs dig / tend / plant / seedling / tree.
  const soilCounts = {};
  const soilPoints = {};
  for (const item of st.items) {
    if (cultivationDef(item.protoClass).kind !== 'patch') continue;
    soilCounts[item.endClass] = (soilCounts[item.endClass] || 0) + 1;
    (soilPoints[`soil:${item.endClass}`] ||= []).push({ x: cultivationWorldX(item, st), y: groundY });
  }
  if (Object.keys(soilCounts).length) {
    patchesFeature.onStreetEnter({ tsid, soilCounts }, shimEngine(engine, engine.population, soilPoints));
  }
  // Worn-out cultivations: their protos and Restore projects.
  spawnProtos(engine, st);
  if (pendingPoofs.length) playPendingPoofs(engine, st, poofBefore);
  if (mode === 'cultivate') drawCultivationMarkers(engine);
  // The back yard has no Tower (cultivation_get_available: street only).
  if (isBackYard(st)) return;
  // The street's Magic Rock (G231), then the Tower (proto or built); the
  // Tower's quest talk goes through that rock (towerBridge.rock).
  syncStreetRock(engine);
  const tower = towerItem(cult);
  towerApi.spawnStreet(engine, {
    item: tower,
    x: tower ? cultivationWorldX(tower) : null,
    groundY: STREET_GROUND_Y,
  });
}

function drawCultivationMarkers(engine) {
  const { PIXI } = engine;
  if (!scene) return;
  scene.markers?.destroy({ children: true });
  scene.markers = null;
  if (scene.room !== 'street' && !inHouse()) return;
  const st = activeCult();
  const Y = yardGroundY(st);
  const g = new PIXI.Container();
  g.zIndex = 45;
  for (const item of st.items) {
    const x = cultivationWorldX(item, st);
    const half = footprint(item.protoClass);
    const sel = selected?.kind === 'cultivation' && selected.id === item.id;
    const pad = new PIXI.Graphics();
    pad.roundRect(x - half, Y - 4, half * 2, 14, 7).fill({ color: sel ? 0xffd76a : 0xffffff, alpha: sel ? 0.28 : 0.14 });
    pad.roundRect(x - half, Y - 4, half * 2, 14, 7).stroke({ width: 2, color: sel ? 0xffd76a : 0xffffff, alpha: sel ? 0.95 : 0.4 });
    if (cultivationDef(item.protoClass)?.kind === 'tower') {
      g.addChild(pad);
      continue;
    }
    if (item.depleted) {
      // A proto: its Restore project's progress instead of a lifespan.
      const perc = projectApi.percent(restoreJobId(item, st));
      pad.roundRect(x - 30, Y + 16, 60, 6, 3).fill({ color: 0x2b2a33, alpha: 0.55 });
      if (perc > 0) pad.roundRect(x - 30, Y + 16, 60 * perc, 6, 3).fill(0xe8b23d);
      g.addChild(pad);
      continue;
    }
    // Lifespan bar (buildConfig lifespan.percentage_left)
    const left = lifespanLeft(item, qaWear(engine));
    pad.roundRect(x - 30, Y + 16, 60, 6, 3).fill({ color: 0x2b2a33, alpha: 0.55 });
    pad.roundRect(x - 30, Y + 16, 60 * left, 6, 3).fill(left > 0.3 ? 0x7cc35a : 0xe0a84a);
    g.addChild(pad);
  }
  // HOMEMAIL / PORCH: the Mail Dispatcher, the Mailbox and the Magic Rock can be picked up here too.
  for (const id of scene.room === 'street' ? MOVABLE_FIXTURE_IDS : []) {
    const spr = fixtureTarget(engine, id)?.sprite;
    if (!spr) continue;
    const half = MOVABLE_FIXTURES[id].half;
    const sel = selected?.kind === 'fixture' && selected.id === id;
    const pad = new PIXI.Graphics();
    pad.roundRect(spr.x - half, Y - 4, half * 2, 14, 7).fill({ color: sel ? 0xffd76a : 0xffffff, alpha: sel ? 0.28 : 0.14 });
    pad.roundRect(spr.x - half, Y - 4, half * 2, 14, 7).stroke({ width: 2, color: sel ? 0xffd76a : 0xffffff, alpha: sel ? 0.95 : 0.4 });
    g.addChild(pad);
  }
  engine.entityLayer.addChild(g);
  scene.markers = g;
}

function cultivationAt(x) {
  let best = null;
  const st = activeCult();
  for (const item of st.items) {
    const d = Math.abs(cultivationWorldX(item, st) - x);
    if (d <= footprint(item.protoClass) && (!best || d < best.d)) best = { item, d };
  }
  return best?.item || null;
}

function nearestCultivation(engine, kinds) {
  const px = engine.player?.x ?? 0;
  let best = null;
  const st = activeCult();
  for (const item of liveItems(st.items)) {
    if (!kinds.includes(cultivationDef(item.protoClass)?.kind)) continue;
    const d = Math.abs(cultivationWorldX(item, st) - px);
    if (!best || d < best.d) best = { item, d };
  }
  return best && best.d < 360 ? best.item : null;
}

/** Remove a cultivation and keep every other one's saved state on its own item. */
function uncultivate(engine, id) {
  const st = activeCult();
  const gone = st.items.find((row) => row.id === Number(id));
  if (gone?.depleted) {
    // items/proto_*.js remove: a running project needs Wine of the Dead first.
    const jobId = restoreJobId(gone, st);
    if (projectApi.inProgress(jobId)) {
      const msg = 'Pour some Wine of the Dead to cancel the project first.';
      engine.toast(msg, 3200);
      return { ok: false, reason: 'project', msg };
    }
  }
  const result = withRekey(engine, () => removeCultivation(st, id), st);
  if (!result?.ok) return result;
  if (gone?.depleted) projectApi.unregister(restoreJobId(gone, st), { dropRow: true });
  if (selected?.kind === 'cultivation' && selected.id === Number(id)) selected = null;
  engine.pushActivity(`You removed the ${result.label} from your yard.`);
  engine.save();
  return result;
}

// ---------------------------------------------------------------------------
// Protos: depletion and restoration
// ---------------------------------------------------------------------------

const WOTD = 'wine_of_the_dead';
/** Live proto targets by restore job id (for the project's "Thanks!" bubble). */
const protoTargets = new Map();

function qaWear(engine) {
  return qaWearOpts(engine?.param?.('cultwear'));
}

/** Carry every other cultivation's node / plot / rock state across a change to one item. */
function withRekey(engine, mutate, st = activeCult()) {
  const tsid = yardTsid(st);
  const world = engine.streetWorld ? engine.streetWorld(tsid) : null;
  const slot = engine.streetSlot('resource-nodes', tsid);
  const soil = engine.streetSlot('patches', tsid);
  const now = Date.now();
  const beforeKeys = nodeKeyMap(st.items, now);
  const beforeSoil = soilKeyMap(st.items);
  const beforeRocks = rockItems(st.items).map((row) => row.id);
  const result = mutate();
  if (!result?.ok) return result;
  slot.nodes = rekeyNodes(slot.nodes || {}, beforeKeys, nodeKeyMap(st.items, now));
  soil.plots = rekeyNodes(soil.plots || {}, beforeSoil, soilKeyMap(st.items));
  if (world) world.rocks = rekeyRocks(world.rocks || [], beforeRocks, rockItems(st.items).map((row) => row.id));
  return result;
}

/** The proto's Restore project (items/proto_*.js classProps job_class_id). */
function restoreJob(item) {
  const cat = projectApi.catalog();
  const rest = cat?.restorations?.[item.protoClass];
  if (!rest) return null;
  const first = cat.classes[rest.phases[0].classTsid];
  return {
    kind: 'restore',
    title: first?.title || rest.label,
    label: cultivationDef(item.protoClass).label,
    desc: first?.desc || '',
    phases: rest.phases,
    // Restorations were sized for a home owner: the source amounts.
    divisor: 1,
    rewardMultiplier: restoreRewardMultiplier(item),
  };
}

function protoIcon(protoClass) {
  return `assets/sprites/cultivation/proto/${PROTO_DEPLETED_ART[protoClass]?.[0] || `${protoClass}.webp`}`;
}

function registerRestore(engine, item, st = cult) {
  const jobId = restoreJobId(item, st);
  const job = restoreJob(item);
  if (!job) return false;
  const back = isBackYard(st);
  // HOMES3 (multiplayer): the realtime server's id makes the project one everyone at your home shares.
  const wire = engine.query?.('homeRestoreWire', item, back ? 'back' : 'street', engine);
  if (typeof wire === 'string' && wire) job.wire = wire;
  return projectApi.register(jobId, job, {
    kicker: back ? 'Your yard' : 'Your home street',
    place: back ? 'in your yard' : 'on your home street',
    iconUrl: protoIcon(item.protoClass),
    note: item.wotd ? 'Wine of the Dead wore this one out, so restoring it will not lengthen its life.' : `Restoring it brings it back with ${Math.round(Math.min(2, lifespanMultiplier(item) + 0.05) * 100)}% of its lifespan.`,
    target: () => protoTargets.get(jobId) || null,
    onDone: (eng) => finishRestore(eng, item.id, jobId, st),
  });
}

/** Register every proto's project, in both yards (the street-jobs catalog loads asynchronously). */
function registerRestores(engine) {
  return projectApi.ready().then(() => {
    for (const st of [cult, backCult]) {
      for (const item of st.items) if (item.depleted && !projectApi.registered(restoreJobId(item, st))) registerRestore(engine, item, st);
    }
    if (scene?.room === 'street' || inHouse()) {
      const st = activeCult();
      for (const item of st.items) {
        const target = item.depleted ? protoTargets.get(restoreJobId(item, st)) : null;
        if (target) target.subtitle = protoSubtitle(item, st);
      }
      if (mode === 'cultivate') drawCultivationMarkers(engine);
    }
    publish(engine);
  });
}

function protoSubtitle(item, st = activeCult()) {
  const jobId = restoreJobId(item, st);
  const perc = projectApi.percent(jobId);
  if (projectApi.inProgress(jobId)) return `Restore project ${Math.round(perc * 100)}% done`;
  return 'Worn out · start a project to restore it';
}

function spawnProtos(engine, st = activeCult()) {
  const { PIXI } = engine;
  protoTargets.clear();
  for (const item of st.items) {
    if (!item.depleted) continue;
    const def = cultivationDef(item.protoClass);
    const art = PROTO_DEPLETED_ART[item.protoClass];
    const box = new PIXI.Container();
    box.x = cultivationWorldX(item, st);
    box.y = yardGroundY(st) + 6;
    box.zIndex = 14;
    if (art) {
      const [file, ox, oy, w, h] = art;
      const spr = new PIXI.Sprite(textureFromUrl(`assets/sprites/cultivation/proto/${file}`));
      spr.anchor.set(ox / w, oy / h);
      spr.width = w;
      spr.height = h;
      box.addChild(spr);
    }
    engine.entityLayer.addChild(box);
    const target = engine.register({
      classId: item.protoClass,
      featureId: HOMES_FEATURE_ID,
      label: def.label,
      subtitle: protoSubtitle(item, st),
      sprite: box,
      state: { cultivationId: item.id },
    });
    protoTargets.set(restoreJobId(item, st), target);
  }
  if (st.items.some((row) => row.depleted)) registerRestores(engine);
}

/**
 * include/cultivation.js addWear -> onDepleted -> replaceWithDepleted: the
 * worn-out item becomes its proto in the same spot.
 */
function depleteItem(engine, id, { wotd = false } = {}, st = activeCult()) {
  const result = withRekey(engine, () => depleteCultivation(st, id, { wotd }), st);
  if (!result?.ok) return result;
  if (selected?.kind === 'cultivation' && selected.id === Number(id)) selected = null;
  queueCultivationPoof(result.item || st.items.find((r) => r.id === Number(id)), st, { proto: true });
  // A Wine of the Dead pour sends no line: makeDepleted -> replaceWithDepleted (include/cultivation.js 52-82).
  if (!wotd) engine.pushActivity(`Your ${result.label} wore out. Restore it with a project, or cultivate something new.`);
  engine.toast(`Your ${result.label} has worn out. Click it to start a project to restore it.`, 3600);
  engine.save();
  registerRestores(engine);
  return result;
}

/** quest.js doJobEffects type 5: the item comes back, a little longer-lived. */
function finishRestore(engine, id, jobId, st = cult) {
  const result = withRekey(engine, () => restoreCultivation(st, id, { now: Date.now() }), st);
  if (!result?.ok) return '';
  if (result.timesGain) engine.achievement('cultivation:times_restored', result.timesGain);
  engine.save();
  restoreLast = `${result.item.protoClass.replace('proto_', '')}:${result.after.toFixed(2)}`;
  queueCultivationPoof(result.item, st);
  engine.setData('homeRestore', restoreLast);
  // After the panel shows "Finished", drop the spent project and redraw the yard.
  setTimeout(() => {
    projectApi.unregister(jobId, { dropRow: true });
    if ((scene?.room === 'street' || inHouse()) && activeCult() === st) engine.refreshHomeScene?.();
  }, 0);
  const pct = Math.round(result.after * 100);
  return result.after > result.before
    ? `Your ${result.label} is back, and it will last ${pct}% as long as the first one did.`
    : `Your ${result.label} is back with ${pct}% of the original lifespan.`;
}
let restoreLast = '';

/**
 * items/wine_of_the_dead.js getValidTargets: every cultivated item on the home
 * street, plus the protos whose project has started, but never the finished
 * Tower. Rows for js/wine-pour.js: { id, kind, name, x, y }.
 */
function pourTargets(engine) {
  const home = engine.homeContext?.() || {};
  if (!home.inHome || !home.owned || (scene?.room !== 'street' && !inHouse())) return [];
  const st = activeCult();
  const soil = engine.streetSlot?.('patches', yardTsid(st))?.plots || {};
  const soilKeys = soilKeyMap(st.items);
  const rows = [];
  for (const item of st.items) {
    const def = cultivationDef(item.protoClass);
    if (!def) continue;
    const base = { id: item.id, x: cultivationWorldX(item, st), y: yardGroundY(st) };
    if (def.kind === 'tower') {
      // proto_furniture_tower_chassis (name_single "Tower") with its job started.
      if (item.endClass !== TOWER_CHASSIS && towerApi.projectStarted?.()) rows.push({ ...base, kind: 'proto', tower: true, name: 'Tower' });
      continue;
    }
    if (item.depleted) {
      if (projectApi.inProgress(restoreJobId(item, st))) rows.push({ ...base, kind: 'proto', name: def.label });
      continue;
    }
    // A Patch's tree, seedling or dead tree keeps its proto_class (patch.js:751, trants.js:774).
    const plot = def.kind === 'patch' ? soil[soilKeys.get(item.id)?.[0]] : null;
    const name = plot ? plotLabel(plot) : def.kind === 'garden' ? 'Garden' : def.label;
    rows.push({ ...base, kind: 'cultivated', name });
  }
  return rows;
}

/** The pour target where the avatar stands (nearest within 200 px), or null. */
function pourTargetHere(engine) {
  return nearestPourTarget(pourTargets(engine), engine.player);
}

/** Pour on one row after the confirm (items/wine_of_the_dead.js modal_callback). */
function applyPour(engine, row) {
  const st = activeCult();
  const item = st.items.find((r) => r.id === Number(row?.id));
  if (!item || countItem(engine.inv, WOTD) < 1) return false;
  if (row.tower) {
    if (item.endClass === TOWER_CHASSIS || !towerApi.cancelProject?.(engine)) return false;
    engine.pushActivity(WOTD_TEXT.canceled('Tower'));
  } else if (item.depleted) {
    const jobId = restoreJobId(item, st);
    if (!projectApi.inProgress(jobId)) return false;
    projectApi.cancel(engine, jobId);
    engine.pushActivity(WOTD_TEXT.canceled(cultivationDef(item.protoClass).label));
  } else {
    if (cultivationDef(item.protoClass)?.kind === 'tower') return false;
    // apiSetTimerX('makeDepleted', 3000, true): it wears out as the pour finishes.
    const id = item.id;
    const cycle = item.cycle || 0;
    pourLast = `pouring:${id}`;
    engine.setData('homePour', pourLast);
    setTimeout(() => {
      const now = st.items.find((r) => r.id === id);
      if (!now || now.depleted || (now.cycle || 0) !== cycle) return;
      depleteItem(engine, id, { wotd: true }, st);
      pourLast = `depleted:${id}`;
      engine.setData('homePour', pourLast);
      engine.refreshHomeScene?.();
    }, WOTD_DEPLETE_MS);
  }
  pourFx(engine, row);
  removeItem(engine.inv, WOTD, 1);
  engine.achievement('wotd:poured_on_something', 1);
  if (row.tower || item.depleted) {
    pourLast = `canceled:${item.id}`;
    engine.setData('homePour', pourLast);
  }
  engine.updateHud();
  engine.save();
  engine.refreshHomeScene?.();
  return true;
}
let pourLast = '';
let wotdDemoDone = false;
let wotdPlaced = false;
let wotdTreeDone = false;
let pourSheets = null;
let pourOverlay = null; // { clip, startedAt, lifeMs, end }
let pourDrag = null; // { over }
let pourDragWired = false;
let pourTip = null;

/** The live target drawn for a pour row: the one standing nearest its x. */
function pourRowTarget(engine, row) {
  let best = null;
  let bestD = 48;
  for (const t of engine.interactables || []) {
    const s = t?.sprite;
    if (!s || s.destroyed || s === engine.player || !Number.isFinite(s.x)) continue;
    const d = Math.abs(s.x - row.x);
    if (d < bestD) {
      best = t;
      bestD = d;
    }
  }
  return best;
}

function pourRowSprite(engine, row) {
  return pourRowTarget(engine, row)?.sprite || null;
}

/**
 * The top of the target's art (LocationItemstackView getYAboveDisplay): a tree's
 * measured artHeight (js/speech-placement.js giveArtHeight) above its feet, else
 * the top of its sprite.
 */
function pourRowTop(target, row) {
  const spr = target?.sprite;
  if (!spr) return Number(row.y) - 60;
  const art = Number(target.artHeight) || 0;
  return art > 0 ? spr.y - art : displayTopOf(spr);
}

/**
 * wine_of_the_dead.js modal_callback 218-262: walk to 100 px short of the
 * target, facing it, and play the bottle's tool_animation on it for 3 s
 * (itemstack_overlay at its top + 20, 10 px toward you, flipped when it is on
 * your left). The overlay goes at the next street change like every other.
 */
function pourFx(engine, row) {
  const p = engine.player;
  if (!p || !row) return;
  const target = pourRowTarget(engine, row);
  const spr = target?.sprite || null;
  const tx = spr ? spr.x : row.x;
  const ap = pourApproach(tx, p.x);
  engine.moveAvatar?.(ap.endpoint, ap.face);
  const top = pourRowTop(target, row);
  const at = itemstackOverlayPoint(tx, top, { dx: ap.deltaX, dy: WOTD_TOOL.deltaY });
  const { PIXI } = engine;
  pourSheets ||= createSheetLoader(PIXI);
  pourOverlay?.end();
  const sheet = WOTD_TOOL.sheet;
  const tsid = engine.streetTsid;
  pourSheets.load(sheet).then(() => {
    const frames = pourSheets.frames(sheet);
    // An itemstack_overlay goes in the overlay holder, over the street's front layers (AnnouncementController.as 503-540).
    const layer = engine.fxLayer || engine.entityLayer;
    if (!frames.length || engine.streetTsid !== tsid || !layer) return;
    const clip = new PIXI.AnimatedSprite(frames);
    clip.anchor.set(0.5, 1);
    clip.x = at.x;
    clip.y = at.y;
    clip.scale.x = ap.flipped ? -1 : 1;
    clip.loop = false;
    clip.animationSpeed = pixiSpeed(sheet.fps);
    clip.zIndex = 60;
    clip.eventMode = 'none';
    clip.alpha = 0;
    layer.addChild(clip);
    clip.play();
    let release = null;
    const end = () => {
      release?.();
      release = null;
      if (!clip.destroyed) clip.destroy();
      if (pourOverlay?.clip === clip) pourOverlay = null;
      engine.setData('homePourFx', 'done');
    };
    release = trackOverlay(end);
    pourOverlay = { clip, startedAt: Date.now(), lifeMs: overlayLifeMs(WOTD_TOOL.durationMs), end };
    engine.setData('homePourFx', `${ap.state}:${Math.round(at.x)},${Math.round(at.y)}`);
  });
}

function tickPourOverlay(now = Date.now()) {
  const o = pourOverlay;
  if (!o) return;
  if (o.clip.destroyed) {
    o.end();
    return;
  }
  const ms = now - o.startedAt;
  if (ms >= o.lifeMs) o.end();
  else o.clip.alpha = overlayAlpha(ms, WOTD_TOOL.durationMs);
}

function gameCanvas() {
  return typeof document === 'undefined' ? null : document.querySelector('canvas[aria-label="Groddle game world"]');
}

/** The pour row under a client point (its drawn sprite's bounds), or null. */
function pourRowAt(engine, clientX, clientY) {
  const canvas = gameCanvas();
  if (!canvas) return null;
  const rect = canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return null;
  const res = Number(canvas.dataset.renderResolution) || 1;
  const sx = ((clientX - rect.left) * (canvas.width / res)) / rect.width;
  const sy = ((clientY - rect.top) * (canvas.height / res)) / rect.height;
  let best = null;
  let bestD = Infinity;
  for (const row of pourTargets(engine)) {
    const spr = pourRowSprite(engine, row);
    const b = spr?.getBounds?.();
    if (!b || !b.width) continue;
    if (sx < b.x - 8 || sx > b.x + b.width + 8 || sy < b.y - 8 || sy > b.y + b.height + 8) continue;
    const d = Math.abs(sx - (b.x + b.width / 2));
    if (d < bestD) {
      best = row;
      bestD = d;
    }
  }
  return best;
}

function showPourTip(text, x, y) {
  if (typeof document === 'undefined') return;
  if (!pourTip) {
    pourTip = document.createElement('div');
    pourTip.className = 'wotd-drag-tip';
    pourTip.dataset.wotdDragTip = '';
    Object.assign(pourTip.style, {
      position: 'fixed', zIndex: '76', pointerEvents: 'none', transform: 'translate(14px, 10px)', padding: '0.2rem 0.55rem',
      borderRadius: '6px', background: '#fffdf6', color: '#302b34', font: '600 13px/1.3 system-ui, sans-serif', boxShadow: '0 2px 6px rgba(0,0,0,0.25)',
    });
    document.body.appendChild(pourTip);
  }
  pourTip.hidden = !text;
  pourTip.style.display = text ? '' : 'none';
  if (!text) return;
  pourTip.textContent = text;
  pourTip.style.left = `${x}px`;
  pourTip.style.top = `${y}px`;
}

function endPourDrag(engine) {
  pourDrag = null;
  showPourTip('');
  engine.setData('homePourDrag', 'none');
}

/** Drop the bottle on a row: the remove verb hands it to verbs.pour with that target (patch.js:66-73). */
function dropPour(engine, row) {
  if (!row || countItem(engine.inv, WOTD) < 1) return false;
  return confirmPour(engine, row);
}

function wirePourDrag(engine) {
  const canvas = gameCanvas();
  if (pourDragWired || !canvas) return Boolean(canvas);
  pourDragWired = true;
  canvas.addEventListener('dragover', (event) => {
    if (!pourDrag) return;
    const row = pourRowAt(engine, event.clientX, event.clientY);
    pourDrag.over = row;
    engine.setData('homePourDrag', row ? `over:${row.id}` : 'dragging');
    if (!row) return showPourTip('');
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    showPourTip(pourDropTip(ITEM_CATALOG[WOTD]?.label || 'Wine of the Dead', row.name), event.clientX, event.clientY);
  });
  canvas.addEventListener('dragleave', () => { if (pourDrag) showPourTip(''); });
  canvas.addEventListener('drop', (event) => {
    if (!pourDrag) return;
    const row = pourRowAt(engine, event.clientX, event.clientY) || pourDrag.over;
    endPourDrag(engine);
    if (!row) return;
    event.preventDefault();
    dropPour(engine, row);
  });
  document.addEventListener('dragend', () => { if (pourDrag) endPourDrag(engine); });
  return true;
}

/** game.js pack slot dragstart: the bottle may go onto a cultivated item or running proto here. */
function startPourDrag(classTsid, event, engine) {
  // BUILDER: while decorating, a pack stack goes onto a shelf, a table or the floor instead.
  if (mode === 'decorate') return startPackDrag(classTsid, event, engine);
  if (classTsid !== WOTD || countItem(engine.inv, WOTD) < 1 || !pourTargets(engine).length || !wirePourDrag(engine)) return false;
  pourDrag = { over: null };
  engine.setData('homePourDrag', 'dragging');
  if (event?.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('application/x-groddle-item', WOTD);
    event.dataTransfer.setData('text/plain', WOTD);
  }
  return true;
}

/**
 * G267: the home's yes / no questions are confirms, not quest offers: two
 * buttons, no Magic Rock card, no New Quest heading and no quest sound. The
 * source asks each with two choices: wine_of_the_dead.js 187-199 prompts_add
 * (ok / cancel), CultManager.as 119-126 warning_cdVO, HouseStylesDialog.as
 * 113-118 and HouseExpandDialog.as 202-209 cdVO (escape_value false: Escape is
 * the no). engine.scriptedDialogue draws the plain prompt card (familiar.js
 * familiarLook), as game.js confirmEmblemSpend does.
 */
function confirmDialog(engine, { title, kicker, beats, yes, no, onYes }) {
  engine.scriptedDialogue({
    title,
    kicker,
    beats,
    cancelable: true,
    primaryLabel: yes,
    cancelLabel: no,
    onComplete: onYes,
  });
}

/** verbs.pour handler: "Please Confirm!", then the pour (every pour route asks first). */
function confirmPour(engine, row) {
  if (!row) return false;
  confirmDialog(engine, {
    title: WOTD_TEXT.confirmTitle,
    kicker: 'Wine of the Dead',
    beats: [{ text: pourConfirmText(row), response: WOTD_TEXT.yes }],
    yes: WOTD_TEXT.yes,
    no: WOTD_TEXT.nevermind,
    onYes: () => applyPour(engine, row),
  });
  pourLast = `confirm:${row.id}`;
  engine.setData('homePour', pourLast);
  return true;
}

/** The sidebar button and the proto verb: pour on that cultivation, wherever you stand. */
function pourWine(engine, id) {
  const row = pourTargets(engine).find((r) => r.id === Number(id));
  if (!row || countItem(engine.inv, WOTD) < 1) return false;
  return confirmPour(engine, row);
}

function protoVerbs(item, engine) {
  const jobId = restoreJobId(item, activeCult());
  const running = projectApi.inProgress(jobId);
  const wine = countItem(engine.inv, WOTD) > 0;
  const ready = projectApi.registered(jobId);
  return [
    { id: 'restore', label: 'restore', enabled: ready, tooltip: ready ? 'Start a project to restore this item' : 'Loading the project…', durationMs: 0 },
    {
      id: 'pour_wotd',
      label: 'pour Wine of the Dead',
      enabled: running && wine,
      tooltip: !running ? 'Nothing to cancel yet.' : wine ? 'Cancel the project (everything put in is lost)' : 'You need a Wine of the Dead.',
      durationMs: 0,
    },
  ];
}

// ---------------------------------------------------------------------------
// UI
// ---------------------------------------------------------------------------

const CSS = `
.homes-modes{position:absolute;left:50%;top:92px;transform:translateX(-50%);z-index:calc(var(--z-hud) + 18);display:flex;gap:var(--sp-3)}
.homes-modes[hidden]{display:none}
.homes-modes button{border:none;border-radius:var(--radius-pill);padding:var(--sp-3) var(--sp-7);font-weight:700;font-size:var(--fs-sm);cursor:pointer;background:color-mix(in srgb, var(--surface-card) 94%, transparent);color:var(--text-brown);box-shadow:var(--shadow-2)}
.homes-modes button.on{background:var(--accent);color:var(--text-inverse)}
.homes-styles{position:absolute;left:50%;top:56px;transform:translateX(-50%);z-index:calc(var(--z-panel) + 10);width:min(600px,calc(100% - 20px));max-height:calc(100% - 150px);display:flex;flex-direction:column;background:var(--surface-card);border-radius:var(--radius-2xl);box-shadow:0 12px 32px color-mix(in srgb, var(--c-sand-24) 28%, transparent);border:1px solid color-mix(in srgb, var(--c-umber-41) 18%, transparent);font-family:var(--font-ui);color:var(--text);overflow:hidden}
.homes-styles[hidden]{display:none}
.homes-styles header{display:flex;align-items:center;gap:var(--sp-4);padding:9px var(--sp-6) 7px;background:linear-gradient(180deg,var(--surface-parchment),var(--c-cream-91));border-bottom:1px solid color-mix(in srgb, var(--c-umber-41) 15%, transparent)}
.homes-styles header h3{margin:0;font-size:var(--fs-base);flex:1}
.homes-styles header small{color:var(--c-sand-53);font-weight:600;white-space:nowrap}
.homes-styles .hb-close{border:none;background:transparent;font-size:var(--fs-xl);cursor:pointer;color:var(--c-sand-48);line-height:var(--lh-none)}
.homes-styles .hs-sel{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:var(--sp-4);padding:9px var(--sp-6);border-bottom:1px solid color-mix(in srgb, var(--c-umber-41) 12%, transparent)}
.homes-styles .hs-name strong{display:block;font-size:var(--fs-base)}
.homes-styles .hs-name small{color:var(--c-sand-53);font-size:var(--fs-xs)}
.homes-styles .hs-actions{display:flex;gap:var(--sp-3)}
.homes-styles .hs-actions button{border:1px solid color-mix(in srgb, var(--c-umber-41) 20%, transparent);background:var(--surface-bright);border-radius:var(--radius-md);padding:var(--sp-3) 11px;font-size:var(--fs-sm);font-weight:700;color:var(--text-brown);cursor:pointer}
.homes-styles .hs-actions button.primary{background:var(--c-blue-63);border-color:var(--c-blue-63);color:var(--text-inverse)}
.homes-styles .hs-actions button:disabled{opacity:.45;cursor:not-allowed}
.homes-styles .hs-note{margin:var(--sp-3) var(--sp-6) 0;font-size:var(--fs-sm);color:var(--c-brown-53)}
.homes-styles .hs-grid{flex:1;overflow:auto;display:grid;grid-template-columns:repeat(auto-fill,minmax(122px,1fr));gap:var(--sp-4);padding:var(--sp-5) var(--sp-6) var(--sp-6)}
.homes-styles .hs-tile{display:flex;flex-direction:column;gap:var(--sp-2);border:2px solid transparent;background:var(--surface-parchment);border-radius:var(--radius-lg);padding:var(--sp-2);cursor:pointer;text-align:left;font:inherit;color:var(--c-sand-33)}
.homes-styles .hs-tile:hover{border-color:var(--mood)}
.homes-styles .hs-tile.on{border-color:var(--c-orange-69);background:var(--status-warn-soft)}
.homes-styles .hs-tile.current .hs-label::after{content:" (yours)";color:var(--moss);font-weight:700}
.homes-styles .hs-label{font-size:var(--fs-xs);font-weight:700;line-height:var(--lh-tight);padding:0 var(--sp-1)}
.homes-styles .hs-prev{position:relative;display:block;height:64px;border-radius:var(--radius-md);overflow:hidden}
.homes-styles .hs-prev img{position:absolute;transform:translateX(-50%);max-width:none;pointer-events:none}
.homes-styles .hs-band{position:absolute;left:0;right:0}
.homes-styles .hs-field{position:absolute;left:0;right:0;bottom:0}
.homes-modes button{white-space:nowrap}
.homes-sign{position:absolute;left:50%;top:132px;transform:translateX(-50%);z-index:calc(var(--z-panel) + 10);width:200px;background:var(--surface-card);border-radius:var(--radius-2xl);box-shadow:0 12px 32px color-mix(in srgb, var(--c-sand-24) 28%, transparent);border:1px solid color-mix(in srgb, var(--c-umber-41) 18%, transparent);font-family:var(--font-ui);color:var(--text);overflow:hidden}
.homes-sign[hidden]{display:none}
.homes-sign header{display:flex;align-items:center;gap:var(--sp-4);padding:11px var(--sp-6) 9px var(--sp-10);background:linear-gradient(180deg,var(--surface-parchment),var(--c-cream-91));border-bottom:1px solid color-mix(in srgb, var(--c-umber-41) 15%, transparent)}
.homes-sign header h3{margin:0;font-size:var(--fs-base);flex:1}
.homes-sign .hb-close{border:none;background:transparent;font-size:var(--fs-xl);cursor:pointer;color:var(--c-sand-48);line-height:var(--lh-none)}
.homes-sign .hsd-body{display:flex;flex-direction:column;gap:7px;padding:var(--sp-9) var(--sp-10) var(--sp-10)}
.homes-sign .hsd-bt{display:flex;align-items:center;gap:5px;border:1px solid color-mix(in srgb, var(--c-umber-41) 20%, transparent);background:var(--surface-bright);border-radius:var(--radius-md);padding:var(--sp-3) var(--sp-6);font:inherit;font-size:var(--fs-md);font-weight:700;color:var(--text-brown);cursor:pointer;text-align:left}
.homes-sign .hsd-ic{flex:0 0 25px;height:25px;background:var(--hsd-ic) center/contain no-repeat}
.homes-sign .hsd-bt:hover,.homes-sign .hsd-bt:focus-visible{border-color:var(--mood);background:var(--c-cream-99b);outline:none;color:var(--c-orange-59)}
.homes-sign .hsd-bt:hover .hsd-ic,.homes-sign .hsd-bt:focus-visible .hsd-ic{background-image:var(--hsd-ic-h)}
.homes-sign .hsd-bt.off{color:var(--c-grey-69);cursor:not-allowed}
.homes-sign .hsd-bt.off,.homes-sign .hsd-bt.off:hover,.homes-sign .hsd-bt.off:focus-visible{border-color:color-mix(in srgb, var(--c-umber-41) 12%, transparent);background:var(--surface-card);color:var(--c-grey-69)}
.homes-sign .hsd-bt.off .hsd-ic,.homes-sign .hsd-bt.off:hover .hsd-ic,.homes-sign .hsd-bt.off:focus-visible .hsd-ic{background-image:var(--hsd-ic-d)}
@media (max-width:640px){.homes-styles{top:auto;bottom:106px;max-height:56%}.homes-styles .hs-grid{grid-template-columns:repeat(auto-fill,minmax(100px,1fr));gap:var(--sp-3);padding:var(--sp-4)}.homes-styles .hs-prev{height:52px}.homes-styles .hs-sel{padding:7px var(--sp-5)}}
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
  // BUILDER: the banner, tray, floating actions and Place button (js/ui/home-builder.js).
  const builder = createHomeBuilder({ root, doc: document });
  const modes = el('div', { class: 'homes-modes', id: 'homes-modes', hidden: true });
  root.append(modes);
  ui = { root, bar: builder.bar, modes, builder };
  return ui;
}

function swatchUrl(kind, key) {
  const piece = swatchPiece(kind, key);
  return piece ? pieceUrl(piece) : '';
}

// ---------------------------------------------------------------------------
// Swatch stamping (client HandOfDecorator startStampingWall / Floor / Ceiling)
// ---------------------------------------------------------------------------

function beginStamping(engine, kind, key) {
  stamping = { kind, key };
  stampHover = null;
  placing = null;
  selected = null;
  destroyGhost();
  renderBar(engine);
  drawStampMarks(engine);
  publish(engine);
}

function stopStamping(engine) {
  if (!stamping && !stampHover) return;
  const previewing = Boolean(stamping && stampHover);
  stamping = null;
  stampHover = null;
  drawStampMarks(engine);
  if (previewing) redrawPreview(engine);
}

/** What a stamp would hit at a world point: one wall segment (its centre), a room's walls, the floor or the ceiling. */
function stampTargetAt(p) {
  const room = scene?.background?.room;
  if (!stamping || !room) return null;
  if (stamping.kind === 'wall') {
    const hit = wallTargetAt(room, p.x, p.y);
    return hit ? { kind: 'wall', segment: hit.segment, center: hit.center } : null;
  }
  return surfaceAt(room, p.x, p.y) === stamping.kind ? { kind: stamping.kind } : null;
}

/** The glow over the target: the single segment when in its centre, else the whole room. */
function drawStampMarks(engine) {
  const marks = scene?.background?.marks;
  if (!marks || marks.destroyed) return;
  marks.clear();
  const room = scene.background.room;
  if (!stamping || !stampHover || !room) return;
  const rects = stampHover.kind === 'wall'
    ? (stampHover.center ? room.walls.filter((t) => t.segment === stampHover.segment) : room.walls)
    : [room[stampHover.kind]];
  for (const r of rects) {
    marks.rect(r.x + 2, r.y + 2, r.w - 4, r.h - 4).fill({ color: 0xffe28a, alpha: 0.16 });
    marks.rect(r.x + 2, r.y + 2, r.w - 4, r.h - 4).stroke({ width: 4, color: 0xffd34d, alpha: 0.9 });
  }
}

function stampAt(engine, p) {
  const hit = stampTargetAt(p);
  const { kind, key } = stamping;
  stopStamping(engine);
  if (!hit) {
    renderBar(engine);
    return null;
  }
  return applySwatch(engine, kind, key, hit.kind === 'wall' && hit.center ? { segment: hit.segment } : {});
}

// ---------------------------------------------------------------------------
// Change Style (players/inc_houses.js houses_style_choices / houses_style_set,
// client HouseStylesDialog.as). Picking a style shows it on the street behind
// the dialog (the client's lightbox showed the style's main image); Change asks
// the source's confirm and charges level x 10 iMG (at least 40).
// ---------------------------------------------------------------------------

/** The style drawn on the street: the one being looked at in the dialog, else yours. */
function shownStreetStyle(engine) {
  return stylePreview || currentStreetStyle(engine);
}

/** The yard style drawn behind the house: the one being looked at in the dialog, else yours. */
function shownYardStyle(engine) {
  return yardPreview || currentYardStyle(engine);
}

/** Change Style here: the yard's inside the house, the street's outside. */
function styleRoom() {
  return inHouse() ? 'yard' : 'street';
}

function currentStyleHere(engine) {
  return styleRoom() === 'yard' ? currentYardStyle(engine) : currentStreetStyle(engine);
}

function styleText() {
  return styleRoom() === 'yard' ? YARD_STYLE_TEXT : STYLE_TEXT;
}

function styleChoicesHere(engine) {
  return styleRoom() === 'yard'
    ? yardStyleChoices(currentYardStyle(engine), engine.pc.level)
    : styleChoices(currentStreetStyle(engine), engine.pc.level);
}

/** QA: &homestreetstyle=<GSJS exterior key> sets the street style once, free. */
function qaStreetStyle(engine) {
  if (styleDemoDone) return;
  const key = String(engine.param?.('homestreetstyle') || '');
  if (!key) return;
  styleDemoDone = true;
  if (STREET_STYLE_BY_KEY[key]?.built) streetStyle = key;
}

function hexColor(c) {
  return `#${Number(c).toString(16).padStart(6, '0')}`;
}

function decoImageUrl(name) {
  return name.endsWith('.svg') ? `${DECO}${name}` : `${DECO}${name}.webp`;
}

/** A small picture of a style for its tile: sky, field and a few of its decos. */
function stylePreviewEl(look) {
  const box = el('span', { class: 'hs-prev', 'aria-hidden': 'true' });
  box.style.background = `linear-gradient(${look.sky.map(hexColor).join(',')})`;
  const H = 64; // tile picture height in CSS px
  const k = H / 470; // about the street's height above the ground
  // The field as deep as the street draws it (landscapeGeometry), the decos standing at its back edge.
  const { depth, rise } = landscapeGeometry(look, OLD_STREET_GROUND_Y);
  const fieldPct = Math.round((depth * k * 100) / H);
  const layers = look.layers;
  layers.forEach((layer, li) => {
    if (layer.band) {
      box.append(el('span', {
        class: 'hs-band',
        style: `bottom:${fieldPct + Math.max(0, (RECIPE_FIELD_TOP - layer.band.y - layer.band.h) * k / H * 100)}%;height:${Math.max(1, layer.band.h * k)}px;background:${hexColor(layer.band.color)};opacity:${layer.band.alpha ?? 1}`,
      }));
      return;
    }
    const item = (layer.items || []).find((row) => !row.hang && !row.flipY);
    if (!item) return;
    const tint = item.tint ?? layer.tint;
    const lum = tint == null ? 1 : (((tint >> 16) & 255) * 0.3 + ((tint >> 8) & 255) * 0.59 + (tint & 255) * 0.11) / 255;
    const h = Math.min(H * 1.2, item.h * item.scale * k);
    const bottom = Math.max(0, (OLD_STREET_GROUND_Y - item.y + rise) * k);
    [0.22, 0.72].forEach((at, n) => {
      if (layers.length > 3 && li === 0 && n === 1) return;
      box.append(el('img', {
        src: decoImageUrl(item.s),
        alt: '',
        loading: 'lazy',
        style: `left:${(at + (li % 2) * 0.08) * 100}%;bottom:${bottom}px;height:${h}px;${n ? 'transform:translateX(-50%) scaleX(-1);' : ''}${lum < 0.98 ? `filter:brightness(${lum.toFixed(2)});` : ''}${item.alpha != null ? `opacity:${item.alpha};` : ''}`,
      }));
    });
  });
  box.append(el('span', { class: 'hs-field', style: `height:${fieldPct}%;background:${hexColor(look.field)}` }));
  return box;
}

function ensureStylesUi(engine) {
  if (!ensureUi(engine)) return null;
  if (!ui.styles) {
    ui.styles = el('section', { class: 'homes-styles', id: 'homes-styles', hidden: true, role: 'dialog', 'aria-label': STYLE_TEXT.title });
    ui.root.append(ui.styles);
  }
  return ui.styles;
}

function openStyleDialog(engine) {
  const ctx = engine.homeContext?.() || {};
  if (!ctx.inHome || (scene?.room !== 'street' && !inHouse()) || scene.construction) {
    engine.toast(STYLE_TEXT.notAtHome, 2200);
    return false;
  }
  if (mode) setMode(engine, null);
  stylePick = currentStyleHere(engine);
  const box = ensureStylesUi(engine);
  if (!box) return false;
  box.hidden = false;
  renderStyleDialog(engine);
  publish(engine);
  return true;
}

function closeStyleDialog(engine) {
  if (ui?.styles) ui.styles.hidden = true;
  stylePick = null;
  const had = stylePreview || yardPreview;
  const redraw = (stylePreview && stylePreview !== currentStreetStyle(engine)) || (yardPreview && yardPreview !== currentYardStyle(engine));
  stylePreview = null;
  yardPreview = null;
  if (had && redraw) engine.refreshHomeScene?.();
  publish(engine);
}

/** Click a style: it goes up on the street (or the yard) behind the dialog. */
function pickStyle(engine, key) {
  const yard = styleRoom() === 'yard';
  if (!(yard ? YARD_STYLE_BY_KEY : STREET_STYLE_BY_KEY)[key]?.built) return false;
  stylePick = key;
  const show = key === currentStyleHere(engine) ? null : key;
  if (show !== (yard ? yardPreview : stylePreview)) {
    if (yard) yardPreview = show;
    else stylePreview = show;
    engine.refreshHomeScene?.();
  }
  renderStyleDialog(engine);
  publish(engine);
  return true;
}

function confirmStyle(engine, key) {
  const { cost } = styleChoicesHere(engine);
  const text = styleText();
  const yard = styleRoom() === 'yard';
  confirmDialog(engine, {
    title: text.confirmTitle,
    kicker: text.button,
    beats: [{ text: confirmText(cost, styleRoom()), response: text.yes }],
    yes: text.yes,
    no: text.no,
    onYes: () => (yard ? applyYardStyle(engine, key) : applyStreetStyle(engine, key)),
  });
}

/** houses_style_set inside the house: take the iMG, keep the rooms, furniture and yard, redraw the yard. */
function applyYardStyle(engine, key) {
  const ctx = engine.homeContext?.() || {};
  const state = { yardStyle: currentYardStyle(engine) };
  const result = switchYardStyle(state, engine.pc, key, { atHome: Boolean(ctx.inHome && inHouse()) });
  if (!result.ok) {
    engine.toast(result.msg, 2400);
    renderStyleDialog(engine);
    return result;
  }
  yardStyle = key;
  yardPreview = null;
  if (ui?.styles) ui.styles.hidden = true;
  stylePick = null;
  engine.pushActivity(`Your yard is now ${result.label}. That took ${result.cost.toLocaleString()} iMG.`);
  engine.updateHud();
  engine.save();
  engine.refreshHomeScene?.();
  publish(engine);
  return result;
}

/** houses_style_set: take the iMG, keep the house, yard, furniture and cultivations, redraw the street. */
function applyStreetStyle(engine, key) {
  const ctx = engine.homeContext?.() || {};
  const state = { streetStyle: currentStreetStyle(engine) };
  const result = switchStreetStyle(state, engine.pc, key, { atHome: Boolean(ctx.inHome && scene?.room === 'street') });
  if (!result.ok) {
    engine.toast(result.msg, 2400);
    renderStyleDialog(engine);
    return result;
  }
  streetStyle = key;
  stylePreview = null;
  if (ui?.styles) ui.styles.hidden = true;
  stylePick = null;
  engine.pushActivity(`Your street is now ${result.label}. That took ${result.cost.toLocaleString()} iMG.`);
  engine.updateHud();
  engine.save();
  engine.refreshHomeScene?.();
  publish(engine);
  return result;
}

function renderStyleDialog(engine) {
  const box = ui?.styles;
  if (!box || box.hidden) return;
  const STYLE = styleText();
  const { cost, choices } = styleChoicesHere(engine);
  const img = Math.floor(engine.pc.imagination || 0);
  const pick = choices.find((row) => row.key === stylePick) || choices.find((row) => row.isCurrent);
  const short = img < cost;
  box.setAttribute('aria-label', STYLE.title);
  const header = el('header', {}, [
    el('h3', { text: STYLE.title }),
    el('small', { text: `◉ ${img.toLocaleString()} iMG` }),
    el('button', { class: 'hb-close', type: 'button', 'aria-label': 'Close', text: '×', onclick: () => closeStyleDialog(engine) }),
  ]);
  const sel = el('div', { class: 'hs-sel' }, [
    el('div', { class: 'hs-name' }, [
      el('strong', { text: pick?.label || '' }),
      el('small', { text: pick?.isCurrent ? `Your ${styleRoom()} now` : 'Shown behind this window' }),
    ]),
    el('div', { class: 'hs-actions' }, [
      el('button', {
        type: 'button',
        class: 'primary',
        id: 'homes-style-change',
        disabled: !pick || pick.isCurrent || short,
        title: !pick?.isCurrent && short ? STYLE_TEXT.needImg : '',
        text: pick?.isCurrent ? STYLE_TEXT.change : changeForLabel(cost),
        onclick: () => confirmStyle(engine, pick.key),
      }),
      el('button', { type: 'button', id: 'homes-style-cancel', text: STYLE_TEXT.cancel, onclick: () => closeStyleDialog(engine) }),
    ]),
  ]);
  const note = !pick?.isCurrent && short ? el('p', { class: 'hs-note', text: STYLE_TEXT.needImg }) : null;
  const grid = el('div', { class: 'hs-grid' }, choices.map((row) => el('button', {
    type: 'button',
    class: `hs-tile${row.key === pick?.key ? ' on' : ''}${row.isCurrent ? ' current' : ''}`,
    'data-home-style': row.key,
    title: row.label,
    onclick: () => pickStyle(engine, row.key),
  }, [stylePreviewEl(row.look), el('span', { class: 'hs-label', text: row.label })])));
  const scrollTop = box.querySelector('.hs-grid')?.scrollTop || 0;
  box.replaceChildren(header, sel, ...(note ? [note] : []), grid);
  grid.scrollTop = scrollTop;
}

function renderModes(engine) {
  if (!ensureUi(engine)) return;
  const ctx = engine.homeContext?.() || {};
  const atHome = Boolean(ctx.inHome && scene);
  ui.modes.hidden = !atHome || Boolean(mode) || Boolean(scene.construction);
  if (!atHome || scene.construction) return;
  const yardButtons = [
    el('button', { type: 'button', id: 'homes-cultivate-btn', text: 'Cultivate', onclick: () => setMode(engine, 'cultivate') }),
    // HouseSignDialog.as: the street sign's (in the yard, the Magic Rock's) "Change Style" button.
    el('button', { type: 'button', id: 'homes-style-btn', text: STYLE_TEXT.button, onclick: () => openStyleDialog(engine) }),
  ];
  ui.modes.replaceChildren(
    ...(scene.room === 'interior'
      ? [
        el('button', { type: 'button', id: 'homes-decorate-btn', text: 'Decorate', onclick: () => setMode(engine, 'decorate') }),
        // The house's back yard: cultivate it and change its style from inside (not on Tower floors).
        ...(inHouse() ? yardButtons : []),
      ]
      : yardButtons)
  );
}

/**
 * BUILDER (js/ui/home-builder.js): Decorate and Cultivate as the 2012 client drew them, over a
 * room that fills the stage: the banner (DecorateToolbarUI / CultToolbarUI), the tray in the pack's
 * place (the furniture bag and the swatch tabs, or the cultivation picker), the actions by the
 * selected piece and the Place button under what you carry. This builds the model; the module draws.
 */
function renderBar(engine) {
  if (!ensureUi(engine)) return;
  renderModes(engine);
  if (!mode) {
    ui.builder.render(null);
    reserveBannerZone(engine, true);
    return;
  }
  ui.builder.render(mode === 'decorate' ? decorateModel(engine) : cultivateModel(engine));
  syncFloating(engine, true);
}

/** The tray tabs while decorating (PackTabberUI: Inventory, Furniture, Walls, Floors, Ceilings). */
const DECOR_TABS = Object.freeze([['pack', 'Pack'], ['furniture', 'Furniture'], ['wall', 'Walls'], ['floor', 'Floors'], ['ceiling', 'Ceilings']]);

/** The banner's buttons while decorating: DecorateToolbarUI Expand / Un-expand, the Tower's floors, the store. */
function decorateBannerActions(engine) {
  if (inTower()) {
    const state = towerApi.state();
    const costs = towerApi.expandCosts();
    const items = Object.entries(costs.items || {}).map(([cls, n]) => `${n} ${ITEM_CATALOG[cls]?.label || cls.replace(/_/g, ' ')}`);
    const workRows = Object.entries(costs.work || {}).map(([cls, n]) => `${n} units with a ${ITEM_CATALOG[cls]?.label || cls.replace(/_/g, ' ')}`);
    return [{
      label: costs.locked ? 'A floor is under construction' : costs.count ? 'Build a New Floor' : 'As tall as it gets',
      primary: true,
      disabled: !costs.count || costs.locked,
      title: `${towerApi.label()} has ${state.floors} of ${TOWER_CONFIG.MAX_FLOORS} floors. Each new floor is a project at the Workbench on the floor under construction.${costs.count && !costs.locked ? ` The next floor will cost ${[...items, ...workRows].join(', ')}.` : ''}`,
      attrs: { 'data-tower-expand': '1' },
      onClick: () => {
        const res = towerApi.beginExpansion(engine);
        renderBar(engine);
        // tower_move_players: the feature takes the owner up to the floor under construction.
        if (res.ok) engine.toast('Up to the new floor: the Workbench is there.', 2600);
      },
    }];
  }
  const quote = quoteHouseExpansion(floors, houseDecor, engine.inv);
  const many = floorCount(floors) > 1;
  const segments = engine.inv.wall_segment || 0;
  const about = many
    ? `Your house is ${decor.wallSegments} wall segments wide (the most is 20) and ${floorCount(floors)} floors high. The next segment goes on every floor and takes ${itemsText(quote.items)}.`
    : `Your house is ${decor.wallSegments} wall segments wide (the most is 20). Each extra segment takes one Wall Segment, made with a Construction Tool.`;
  return [
    {
      label: 'Expand',
      icon: '↔',
      disabled: !quote.ok,
      title: `${about}${!quote.ok && quote.msg ? ` ${quote.msg}` : many ? '' : ` You have ${segments} Wall Segment${segments === 1 ? '' : 's'}.`}`,
      attrs: { 'data-home-expand': 'house' },
      onClick: () => expandHouse(engine),
    },
    { label: UNEXPAND_TEXT.button, attrs: { 'data-home-unexpand': 'house' }, onClick: () => confirmUnexpand(engine) },
  ];
}

function decorateModel(engine) {
  const tabId = DECOR_TABS.some(([id]) => id === tab) ? tab : 'furniture';
  const model = {
    mode: 'decorate',
    title: BUILDER_TEXT.decorateTitle,
    // The Pack tab's hint line says how things go down and come back up (Austin 2026-11-01).
    hint: tab === 'pack' ? BUILDER_TEXT.packHint : inTower() ? `${towerApi.floorTitle()} · ${BUILDER_TEXT.decorateHint}` : BUILDER_TEXT.decorateHint,
    closeLabel: 'Leave Decoration Mode',
    onClose: () => setMode(engine, null),
    bannerActions: decorateBannerActions(engine),
    // The Pack tab's tooltip says what it is for, as its footer does.
    tabs: DECOR_TABS.map(([id, label]) => ({ id, label, title: id === 'pack' ? BUILDER_TEXT.packNote : '' })),
    tab: tabId,
    tabsLabel: 'Decorate with',
    onTab: (id) => {
      tab = id;
      stopStamping(engine);
      // PackDisplayManager: leaving a swatch tab leaves its preview.
      redrawPreview(engine);
      renderBar(engine);
    },
    trayLabel: 'Decoration tray',
    // The Furniture Store, by the furniture it sells (the original reached it from the house's menu).
    footActions: [{ label: 'Furniture Store', attrs: { 'data-home-store': '1' }, onClick: () => openStore(engine) }],
  };
  if (tabId === 'pack') {
    // The pack itself, in the tray's panel as the other tabs show their tiles (PackTabberUI's Inventory
    // tab showed the pack where the furniture bag shows; Austin 2026-11-01: "the pack tab doesn't show
    // the packed items within its tab"). The row stays game.js's own, docked over the panel
    // (js/ui/home-builder.js renderDock), so its clicks, drags, bags, menus and search all still work.
    const node = typeof document !== 'undefined' ? document.getElementById('pack-bar') : null;
    if (!node) return { ...model, panelHidden: true, note: BUILDER_TEXT.packNote };
    return {
      ...model,
      dock: { node, scroller: document.getElementById('pack-scroll'), owns: 'pack-row' },
      stripKey: 'pack',
      note: BUILDER_TEXT.packNote,
    };
  }
  if (tabId === 'furniture') return { ...model, ...furnitureTray(engine) };
  return { ...model, ...swatchTray(engine, tabId) };
}

/** The furniture bag: every piece you can place (storage, then the pack), its filter row and counts. */
function furnitureTray(engine) {
  const list = listPlaceable(decor, engine.inv);
  const filters = trayFilters(list);
  if (!filters.some((f) => f.id === trayFilter)) trayFilter = 'all';
  const rows = filterTiles(list, trayFilter);
  return {
    stripLabel: 'Furniture',
    stripKey: `furniture:${trayFilter}`,
    filters: list.length ? filters : [],
    filter: trayFilter,
    onFilter: (id) => {
      trayFilter = id;
      renderBar(engine);
    },
    empty: list.length ? '' : BUILDER_TEXT.emptyFurniture,
    note: placing?.kind === 'furniture'
      ? (placing.moveId ? 'Click where it goes, or drop it on the tray to put it away. Esc cancels.' : 'Click in the room to place it. Esc cancels.')
      : '',
    tiles: rows.map((row) => {
      const on = placing?.kind === 'furniture' && !placing.moveId && placing.classTsid === row.classTsid && (placing.style ?? null) === (row.style ?? null);
      const where = `${row.stored ? `${row.stored} in storage` : ''}${row.stored && row.packed ? ', ' : ''}${row.packed ? `${row.packed} in pack` : ''}`;
      return {
        // G358: an upgraded piece in storage shows its own art.
        img: row.upgradeId ? pieceArt(row.classTsid, row.upgradeId).path : `assets/sprites/icons/${row.classTsid}.png`,
        label: row.label,
        count: row.total,
        on,
        title: `${row.label} (${where}). Drag it into the room, or click it and then click the room.`,
        ariaLabel: `${row.label}, ${row.total}`,
        describedBy: 'homes-keys-help',
        attrs: { 'data-furniture': row.classTsid, 'data-furniture-style': row.style ?? false },
        onActivate: ({ keyboard }) => {
          if (on) return cancelCarry(engine);
          beginPlacing(engine, row.classTsid, null, row.style);
          if (keyboard) carryWithKeys(engine);
        },
        onDragStart: (e) => startTrayDrag(engine, e, () => beginPlacing(engine, row.classTsid, null, row.style)),
        onDragMove: (e) => moveDrag(engine, e),
        onDragEnd: (e, how) => endDrag(engine, e, how),
      };
    }),
  };
}

/** The Walls / Floors / Ceilings tabs (SwatchBagUI): pick one, then click the room. */
function swatchTray(engine, kind) {
  const current = decor[kind];
  const mixed = kind === 'wall' && decor.walls?.some((row) => row !== decor.wall);
  const now = mixed ? 'a mix of wallpapers' : textureConfig(kind, current)?.name || current;
  const how = kind === 'wall'
    ? 'Pick a swatch, then click a wall: the middle of a segment papers just that segment, anywhere else papers the whole room.'
    : `Pick a swatch, then click the ${kind}.`;
  // Ticket 53: the categories are the original's filter buttons under the strip (SwatchBagUI), in
  // plain horizontal words; All keeps each category's name before its swatches, read across too.
  const all = listTextures(kind);
  const filters = swatchFilters(all);
  let filter = swatchFilter[kind] || 'all';
  if (!filters.some((f) => f.id === filter)) filter = 'all';
  swatchFilter[kind] = filter;
  const groups = [];
  for (const row of filterSwatches(all, filter)) {
    const heading = filter === 'all' ? row.category : '';
    if (!groups.length || groups[groups.length - 1].heading !== heading) groups.push({ heading, tiles: [] });
    const armed = stamping?.kind === kind && stamping.key === row.key;
    const name = row.name;
    groups[groups.length - 1].tiles.push({
      kind: 'swatch',
      swatch: swatchUrl(kind, row.key),
      label: name,
      on: armed || (!stamping && row.key === current && !mixed),
      title: row.costCredits ? `${name} (${row.costCredits} credits in the original)` : name,
      attrs: { 'data-swatch': `${kind}:${row.key}` },
      onActivate: () => (armed ? (stopStamping(engine), renderBar(engine)) : beginStamping(engine, kind, row.key)),
    });
  }
  return {
    stripLabel: `${kind[0].toUpperCase()}${kind.slice(1)} swatches`,
    stripKey: `swatch:${kind}:${filter}`,
    groups,
    filters,
    filter,
    filtersLabel: `Show ${kind} swatches`,
    onFilter: (id) => {
      swatchFilter[kind] = id;
      renderBar(engine);
    },
    note: stamping ? `Click the room to apply ${textureConfig(stamping.kind, stamping.key)?.name}. Esc cancels.` : `Now: ${now}. ${how} Swatches are free to apply.`,
  };
}

/** The selected piece's actions, floating by it (the old panel's selection card). */
function furniturePop(engine) {
  if (selected?.kind !== 'furniture' || placing) return null;
  const item = placedItem(decor, selected.id);
  if (!item) return null;
  const def = furnitureDef(item.classTsid);
  const actions = [
    { label: 'Move', attrs: { 'data-home-action': 'move' }, onClick: () => { beginMove(engine, item.id); carryWithKeys(engine, item); } },
    ...upgradeButtons(engine, item),
    { label: 'Flip', disabled: !def.canFlip, attrs: { 'data-home-action': 'flip' }, onClick: () => runFurnitureAction(engine, 'flip') },
    { label: 'Forward', title: 'Bring it in front', attrs: { 'data-home-action': 'forward' }, onClick: () => runFurnitureAction(engine, 'forward') },
    { label: 'Back', title: 'Send it behind', attrs: { 'data-home-action': 'back' }, onClick: () => runFurnitureAction(engine, 'back') },
    { label: 'Pick up', attrs: { 'data-home-action': 'pickup' }, onClick: () => runFurnitureAction(engine, 'pickup') },
  ];
  const extra = [];
  let key = `f:${item.id}:${item.upgradeId || ''}:${item.facingRight}`;
  if (item.classTsid === 'bag_furniture_sdb') {
    if (item.display) {
      actions.push({ label: `Take out ${item.display.count}`, attrs: { 'data-home-action': 'withdraw' }, onClick: () => runFurnitureAction(engine, 'withdraw') });
    }
    const choices = displayableItems(engine);
    if (choices.length) {
      // DECOPOLISH (Austin 2026-11-02: "Can we change the select dropdown to pretty looking
      // autocomplete UIs?"): the native select stays as the value (Display reads it), behind the
      // game's own type-to-filter list with each item's icon and count (js/combobox.js).
      const select = el('select', { 'aria-label': 'Item to display', 'data-home-display': '1' }, choices.map((row) => el('option', { value: row.classTsid, text: row.label, 'data-count': String(row.count), 'data-icon': row.icon || null })));
      const field = el('div', { class: 'hb-display-pick' }, [select]);
      const combo = createCombobox(select, { label: 'Item to display', placeholder: 'Find something to show…', className: 'combo-pick', minListWidth: 230 });
      combo.input.setAttribute('data-home-display-input', '1');
      extra.push(field, el('button', {
        type: 'button',
        class: 'hb-bt primary',
        'data-home-action': 'deposit',
        text: 'Display',
        onclick: () => runFurnitureAction(engine, 'deposit', select.value),
      }));
    }
    key += `:${item.display?.classTsid || ''}:${item.display?.count || 0}:${choices.map((r) => `${r.classTsid}${r.count}`).join()}`;
  }
  return { key, title: pieceLabel(item, def.label), sub: def.desc || '', actions, extra };
}

// ---------------------------------------------------------------------------
// Furniture upgrades (G358, js/furniture-upgrades.js)
// ---------------------------------------------------------------------------

/** verbs.upgrade / verbs.change_style on a placed piece: opens the style picker. */
function upgradeButtons(engine, item) {
  const verb = upgradeVerb(item);
  if (!verb) return [];
  const sale = houseFloorHere() === 0 ? engine.query?.('furnitureSaleLock', decor, item.id, engine) : null;
  const locked = typeof sale === 'string' && sale;
  return [el('button', {
    type: 'button',
    class: 'hb-bt',
    'data-home-action': verb.id,
    text: verb.label,
    title: locked ? UPGRADE_TEXT.forSale : verb.tooltip,
    disabled: Boolean(locked),
    onclick: () => openUpgradeFor(engine, item.id),
  })];
}

function openUpgradeFor(engine, id) {
  const item = placedItem(decor, id);
  if (!item || !hasUpgrades(item.classTsid)) return false;
  const def = furnitureDef(item.classTsid);
  const ok = openUpgradePicker({
    piece: item,
    baseLabel: def.label,
    baseArt: def.art.path,
    // FURNSELL: paid styles are bought with currants; the picker reads the purse.
    currants: () => Number(engine.pc?.currants) || 0,
    onPreview: (upgradeId) => {
      upgradePreview = upgradeId == null ? null : { id: item.id, upgradeId: upgradeId === '0' ? '' : upgradeId };
      renderFurniture(engine);
    },
    onSave: (upgradeId) => saveFurnitureUpgrade(engine, item.id, upgradeId),
    onClose: () => {
      upgradePreview = null;
      renderFurniture(engine);
    },
    // Ticket 52: the in-place column beside the piece (FurnUpgradeDialog.as _loc_mode).
    anchor: () => pieceClientRect(engine, item.id),
    area: () => upgradeArea(),
  });
  if (ok) frameUpgradePiece(engine, item.id);
  publish(engine);
  return ok;
}

/** Ticket 52: the room's free client rect for the style column, clear of a left sheet and the drawer. */
function upgradeArea() {
  const r = ui?.builder?.roomRect?.();
  if (!r) return null;
  const root = typeof document !== 'undefined' ? document.getElementById('game-root') : null;
  const cs = root && globalThis.getComputedStyle ? globalThis.getComputedStyle(root) : null;
  const inset = (name) => parseFloat(cs?.getPropertyValue?.(name)) || 0;
  return { left: r.left + inset('--inset-l'), right: r.right - inset('--inset-r'), top: r.top, bottom: r.bottom };
}

/** Ticket 52: a placed piece's rect on screen (client px), the style it previews included. */
function pieceClientRect(engine, id) {
  const item = placedItem(decor, id);
  if (!item) return null;
  const b = furnitureBounds(item);
  const a = clientPoint(engine, b.x + roomX0(), b.y);
  const z = clientPoint(engine, b.x + b.w + roomX0(), b.y + b.h);
  return a && z ? { left: a.x, top: a.y, right: z.x, bottom: z.y } : null;
}

/**
 * Ticket 52: FurnUpgradeDialog.as 388-409 centres the camera on the piece (in decorate mode,
 * camera_control_pt) so the piece and the column beside it are both in view: the decorate
 * camera slides until the piece, the gap and the column sit centred in the room's free width.
 * Outside Decoration Mode the camera follows the avatar, and the column takes whichever side fits.
 */
function frameUpgradePiece(engine, id) {
  if (mode !== 'decorate' || scene?.room !== 'interior') return false;
  const piece = pieceClientRect(engine, id);
  const area = upgradeArea();
  const item = placedItem(decor, id);
  if (!piece || !area || !item) return false;
  const one = clientPoint(engine, 0, 0);
  const hundred = clientPoint(engine, 100, 0);
  const perPx = one && hundred && hundred.x !== one.x ? 100 / (hundred.x - one.x) : 0;
  if (!perPx) return false;
  const pair = (piece.right - piece.left) + DOCK_GAP + DOCK_W;
  const want = area.left + (area.right - area.left - pair) / 2;
  const dx = (piece.left - want) * perPx;
  const span = roomSpan();
  decorCamX = clampRoomX((decorCamX ?? engine.player?.x ?? 0) + dx, { left: span.left, right: span.right, view: engine.camera?.w || 960 });
  return true;
}

/**
 * furniture_upgrade_purchase_do: applyUpgrade, the "upgraded" counter, redraw.
 * A paid style (lane FURNSELL) takes its price from the purse first; in
 * multiplayer the save write carries the lower purse, a loss the ledger always
 * accepts (site LedgerMath::reconcile), so no signed spend is needed for a
 * cosmetic the player keeps.
 */
function saveFurnitureUpgrade(engine, id, upgradeId) {
  const item = placedItem(decor, id);
  if (!item) return null;
  const purse = Number(engine.pc?.currants) || 0;
  const result = applyUpgrade(item, upgradeId, { baseLabel: furnitureDef(item.classTsid).label, currants: purse });
  upgradePreview = null;
  if (!result.ok) {
    engine.toast(result.msg);
    renderFurniture(engine);
    return result;
  }
  if (result.cost > 0) {
    engine.pc.currants = Math.max(0, purse - result.cost);
    engine.playSound?.('PURCHASE_ITEM', { volume: 0.55 });
    engine.pushActivity?.(`You paid ${currantsText(result.cost)} for the ${result.name}.`);
    engine.updateHud?.();
    furnupSpent += result.cost;
  }
  // applyUpgrade: achievements_increment("upgraded", class_id, 1).
  engine.achievement?.(result.counter, 1);
  furnupLast = `${item.classTsid}:${item.upgradeId || 0}`;
  // Tabletop decor follows the new top (the source nudges what stood on the old plats).
  moveFurniture(decor, item.id, { x: item.x, y: item.y });
  engine.playSound?.('ITEM_DROP', { volume: 0.4 });
  renderFurniture(engine);
  renderBar(engine);
  engine.save();
  return result;
}

/**
 * construction_tool.js onMakingComplete 334-381 (Bonus Furniture Upgrade I-III):
 * after a Construction Tool unit, 5% of the time the piece just made becomes a
 * random style worth 25 credits or less. The source found it in the furniture
 * bag (bag.js 104-105 sends every furniture stack there); the remake's made
 * furniture lands in the pack, so the upgraded piece moves into furniture
 * storage, which needs a house. QA: &furnuproll=0 makes every roll hit.
 */
function bonusFurnitureUpgrade(engine, recipeKey) {
  const recipe = RECIPE_CATALOG[recipeKey];
  if (recipe?.tool !== 'construction_tool') return null;
  const classTsid = recipe.outputs?.[0]?.classTsid;
  if (!classTsid || !hasUpgrades(classTsid) || !furnitureDef(classTsid)) return null;
  const forced = engine.param?.('furnuproll');
  const rand = forced != null && forced !== '' && Number.isFinite(Number(forced)) ? () => Number(forced) : Math.random;
  const roll = rollBonusUpgrade({ recipe, owned: engine.pc?.imaginationUpgrades || [], rand, classTsid });
  if (!roll || !engine.homeOwned?.() || !(Number(engine.inv?.[classTsid]) > 0)) return null;
  engine.inv[classTsid] -= 1;
  houseDecor.storage[classTsid] = (houseDecor.storage[classTsid] || 0) + 1;
  houseDecor.styles ||= {};
  const piece = { classTsid };
  applyBonusUpgrade(piece, roll.id);
  (houseDecor.styles[classTsid] ||= []).push({ upgradeId: piece.upgradeId, upgradeHistory: piece.upgradeHistory });
  engine.achievement?.(`upgraded:${classTsid}`, 1);
  engine.pushActivity(bonusUpgradeLine(roll.name));
  furnupLast = `bonus:${classTsid}:${roll.id}`;
  engine.refreshPack?.();
  if (scene && mode === 'decorate') renderBar(engine);
  publish(engine);
  engine.save();
  return roll;
}

/**
 * QA (with homedemo=decorate): &furnupautoplay=pick (open the Chair's picker and
 * choose its first free style), =apply (also save it, pick the Chair up and set
 * it down again), =locked (choose a paid style: the save stays off),
 * =card (own the three cards and run a Construction Tool Chair through the
 * bonus roll; add &furnuproll=0), =craft (card I, Furnituremaking I, a
 * Construction Tool and a Chair's inputs, for a real craft in the Make panel),
 * =buy (FURNSELL: choose the Chair's cheapest paid style and buy it; add
 * &furnupcurrants=N to set the purse first), =short (the same with 10
 * currants: the button stays off with "You need more currants").
 */
function runFurnUpAutoplay(engine, how) {
  const chair = () => decor.placed.find((row) => row.classTsid === 'furniture_chair');
  const say = (label) => engine.setData('homeAutoplay', label);
  setTimeout(() => {
    if (how === 'craft') {
      // A real craft through the Make panel (the QA drives it): the cards, Furnituremaking I, a
      // Construction Tool and one Chair's inputs (catalog_recipes.js 252).
      const ups = (engine.pc.imaginationUpgrades ||= []);
      if (!ups.includes('furnituremaking_bonus_upgrade_1')) ups.push('furnituremaking_bonus_upgrade_1');
      engine.grantSkill?.('furnituremaking_1');
      for (const [cls, n] of [['construction_tool', 1], ['wood_post', 1], ['board', 4], ['snail', 4]]) engine.inv[cls] = Math.max(n, Number(engine.inv[cls]) || 0);
      engine.pc.energy = Math.max(engine.pc.energy || 0, 95);
      engine.refreshPack?.();
      engine.updateHud?.();
      say('craft:ready');
      return;
    }
    if (how === 'card') {
      const ups = (engine.pc.imaginationUpgrades ||= []);
      for (const id of ['furnituremaking_bonus_upgrade_1', 'furnituremaking_bonus_upgrade_2', 'furnituremaking_bonus_upgrade_3']) if (!ups.includes(id)) ups.push(id);
      engine.inv.furniture_chair = (Number(engine.inv.furniture_chair) || 0) + 1;
      const roll = bonusFurnitureUpgrade(engine, 'furniture_chair');
      say(roll ? `card:${roll.id}` : 'card:none');
      const row = listPlaceable(decor, engine.inv).find((r) => r.upgradeId);
      if (row) {
        beginPlacing(engine, row.classTsid, null, row.style);
        const r = placeAtPointer(engine, { x: 640, y: GROUND_Y });
        if (r?.item) selected = { kind: 'furniture', id: r.item.id };
        renderFurniture(engine);
        renderBar(engine);
        say(`card:placed:${r?.item?.upgradeId || ''}`);
      }
      return;
    }
    const item = chair();
    if (!item) return say('furnup:no-chair');
    const purseParam = engine.param?.('furnupcurrants');
    if (how === 'short') engine.pc.currants = 10;
    else if (how === 'buy' && purseParam != null && purseParam !== '' && Number.isFinite(Number(purseParam))) engine.pc.currants = Math.max(0, Math.floor(Number(purseParam)));
    engine.updateHud?.();
    selected = { kind: 'furniture', id: item.id };
    renderFurniture(engine);
    renderBar(engine);
    openUpgradeFor(engine, item.id);
    const paidPick = how === 'locked' || how === 'buy' || how === 'short';
    const option = upgradePickerOpen() && (paidPick
      ? document.querySelector('.furn-upgrade .fu-tile.paid')
      : [...document.querySelectorAll('.furn-upgrade .fu-tile')].find((b) => !b.classList.contains('paid') && !b.classList.contains('on')));
    if (option) chooseUpgrade(option.getAttribute('data-upgrade'));
    publish(engine);
    say(`furnup:${how}:chosen`);
    if (how === 'buy' || how === 'short') {
      setTimeout(() => {
        const before = Number(engine.pc.currants) || 0;
        const saved = saveUpgrade();
        const after = chair();
        publish(engine);
        say(`furnup:${how}:${saved ? 'saved' : 'refused'}:${after?.upgradeId || ''}:${before}:${Number(engine.pc.currants) || 0}`);
      }, 1200);
      return;
    }
    if (how !== 'apply') return;
    setTimeout(() => {
      saveUpgrade();
      const upgraded = chair();
      say(`furnup:apply:saved:${upgraded?.upgradeId || ''}`);
      setTimeout(() => {
        selected = { kind: 'furniture', id: upgraded.id };
        runFurnitureAction(engine, 'pickup');
        const row = listPlaceable(decor, engine.inv).find((r) => r.classTsid === 'furniture_chair' && r.upgradeId);
        if (row) {
          beginPlacing(engine, 'furniture_chair', null, row.style);
          const r = placeAtPointer(engine, { x: 300, y: GROUND_Y });
          say(`furnup:apply:replaced:${r?.item?.upgradeId || ''}`);
        }
        publish(engine);
      }, 900);
    }, 1200);
  }, 1200);
}

function displayableItems(engine) {
  const box = selected ? placedItem(decor, selected.id) : null;
  return Object.entries(engine.inv)
    .filter(([cls, n]) => n > 0 && ITEM_CATALOG[cls] && !displayRefusal(box, cls, displayMeta(cls)))
    .map(([cls, n]) => ({ classTsid: cls, label: ITEM_CATALOG[cls].label, count: n, icon: ITEM_CATALOG[cls].icon || '' }))
    .sort((a, b) => a.label.localeCompare(b.label))
    .slice(0, 80);
}

/**
 * Cultivation Mode's tray (CultPickerUI): the hint and your iMG on the left, each choice with its
 * name, art and cost, and the yard's expansions (HouseExpandYardDialog) on the right.
 */
function cultivateModel(engine) {
  const st = activeCult();
  const back = isBackYard(st);
  const choices = cultivationChoices(st, engine.pc);
  const model = {
    mode: 'cultivate',
    title: BUILDER_TEXT.cultivateTitle,
    hint: BUILDER_TEXT.cultivateHint,
    closeLabel: 'Leave Cultivation Mode',
    onClose: () => setMode(engine, null),
    // HOMEMAIL / PORCH: the Mailbox, the Magic Rock and the Mail Dispatcher move in Cultivate too
    // (reimagined); this reaches them from the keys.
    bannerActions: back || scene?.room !== 'street' ? [] : fixtureBannerActions(engine),
    trayLabel: 'Cultivation tray',
    stripLabel: back ? 'Things to grow in your yard' : 'Things to grow on your street',
    stripKey: `cult:${back ? 'yard' : 'street'}`,
    // magic_rock.js howto_cultivate: "anything you cultivate on your home street will be usable by visitors; anything in your yard is private."
    aside: {
      text: placing?.kind === 'cultivation' ? 'Walk or point to where it goes, then Place it. Esc cancels.' : cultChooseText(back),
      balance: `You have ◉ ${Math.floor(engine.pc.imagination || 0).toLocaleString('en-US')} iMG`,
    },
    note: back
      ? 'Anything in your yard is private. Each one costs a little more than the last.'
      : 'Anything on your street can be used by visitors. Each one costs a little more than the last.',
    tiles: choices.map((row) => {
      const on = placing?.kind === 'cultivation' && !placing.moveId && placing.protoClass === row.protoClass;
      const cost = row.canPlace || row.reason.startsWith('Needs') ? `◉ ${row.cost.toLocaleString('en-US')}` : `Lv ${row.minLevel}`;
      return {
        kind: 'cult',
        img: cultivationIcon(row.protoClass),
        label: row.label,
        labelTop: true,
        cost,
        on,
        disabled: !row.canPlace,
        title: row.reason || `${row.label}: ${row.cost} iMG. Drag it onto your yard, or click it to carry it.`,
        ariaLabel: `${row.label}, ${row.canPlace ? `${row.cost} iMG` : row.reason}`,
        attrs: { 'data-cultivate': row.protoClass },
        onActivate: ({ keyboard }) => {
          if (on) return cancelCarry(engine);
          beginCultivate(engine, row.protoClass);
          // CultManager: what you carry rides at your feet; walk to move it, then Place.
          if (keyboard) {
            carryBy = 'avatar';
            pointer.inside = false;
            updateGhost(engine);
            syncFloating(engine, true);
            ui?.builder?.place?.focus?.({ preventScroll: true });
          }
        },
        onDragStart: (e) => startTrayDrag(engine, e, () => beginCultivate(engine, row.protoClass)),
        onDragMove: (e) => moveDrag(engine, e),
        onDragEnd: (e, how) => endDrag(engine, e, how),
      };
    }),
  };
  if (back) {
    // HouseExpandYardDialog inside the house: "Expand your yard", one way (left), "Expand for Ni".
    const quote = quoteYardExpansion(st, engine.pc);
    return {
      ...model,
      trayActionsLabel: 'Expand your yard',
      trayActions: [{
        label: quote.count ? `← Expand for ${quote.cost.toLocaleString('en-US')}i` : 'Expand',
        disabled: !quote.ok,
        title: quote.msg || '',
        attrs: { 'data-home-expand': 'yard' },
        onClick: () => growYard(engine, 'left'),
      }],
      trayActionsNote: quote.count
        ? `This yard can be expanded ${quote.count} more ${quote.count === 1 ? 'time' : 'times'}.`
        : "This yard can't be expanded anymore.",
    };
  }
  const left = quoteYardExpansion(cult, engine.pc, 'left');
  const right = quoteYardExpansion(cult, engine.pc, 'right');
  return {
    ...model,
    trayActionsLabel: 'Expand your street',
    trayActions: [
      { label: `← Left ◉ ${left.cost.toLocaleString('en-US')}`, disabled: !left.ok, title: left.msg || '', ariaLabel: `Expand left for ${left.cost} iMG`, attrs: { 'data-home-expand': 'left' }, onClick: () => growYard(engine, 'left') },
      { label: `Right ◉ ${right.cost.toLocaleString('en-US')} →`, disabled: !right.ok, title: right.msg || '', ariaLabel: `Expand right for ${right.cost} iMG`, attrs: { 'data-home-expand': 'right' }, onClick: () => growYard(engine, 'right') },
    ],
    trayActionsNote: `${left.countLeft} left and ${right.countRight} right expansions remain.`,
  };
}

/** A selected cultivation's actions, floating by it: Restore, Nudge, Remove, Pour Wine of the Dead. */
function cultivationPop(engine) {
  if (selected?.kind !== 'cultivation' || placing) return null;
  const st = activeCult();
  const item = st.items.find((row) => row.id === selected.id);
  if (!item) return null;
  const def = cultivationDef(item.protoClass);
  const nudge = engine.learnedSkills.includes('nudgery_1');
  const isTower = def.kind === 'tower';
  const wine = countItem(engine.inv, WOTD) > 0;
  const running = item.depleted && projectApi.inProgress(restoreJobId(item, st));
  const life = Math.round(lifespanMultiplier(item) * 100);
  const actions = [
    { label: 'Nudge', disabled: !nudge, title: nudge ? 'Move it along the yard' : 'Needs the Nudgery skill', attrs: { 'data-home-action': 'nudge' }, onClick: () => { beginNudge(engine, item.id); carryBy = 'avatar'; pointer.inside = false; syncFloating(engine, true); ui?.builder?.place?.focus?.({ preventScroll: true }); } },
    {
      label: 'Remove',
      disabled: item.endClass === TOWER_CHASSIS || running,
      title: item.endClass === TOWER_CHASSIS ? 'A finished Tower stays.' : running ? 'Pour some Wine of the Dead to cancel the project first.' : '',
      attrs: { 'data-home-action': 'remove' },
      onClick: () => removeSelected(engine),
    },
  ];
  if (item.depleted) {
    actions.unshift({ label: 'Restore', primary: true, attrs: { 'data-home-action': 'restore' }, onClick: () => projectApi.open(engine, restoreJobId(item, st)) });
  }
  if (!isTower && (running || !item.depleted)) {
    actions.push({
      label: 'Pour Wine of the Dead',
      disabled: !wine,
      title: wine ? (item.depleted ? 'Cancel the restore project' : 'Wear it out now (its restore will not lengthen its life)') : 'You need a Wine of the Dead.',
      attrs: { 'data-home-action': 'wotd' },
      onClick: () => pourWine(engine, item.id),
    });
  }
  const sub = isTower
    ? (item.endClass === TOWER_CHASSIS ? 'Built. Step inside to decorate its floors.' : 'A Tower project. Click it in the yard to see what it needs.')
    : item.depleted
      ? `Worn out. A Restore project brings it back${item.wotd ? '' : ` with ${Math.round(Math.min(2, lifespanMultiplier(item) + 0.05) * 100)}% of its lifespan`}.`
      : `Lifespan ${Math.round(lifespanLeft(item, qaWear(engine)) * 100)}% (${usesLeft(item, qaWear(engine))} uses left; ${life}% of the original).`;
  return {
    key: `c:${item.id}:${item.depleted ? 1 : 0}:${running ? 1 : 0}:${wine ? 1 : 0}:${nudge ? 1 : 0}:${sub}`,
    title: isTower ? towerApi.label() : item.depleted ? `${def.label} (worn out)` : def.label,
    sub,
    actions,
  };
}

/**
 * The cultivation menu tile and the carried placement art: the proto item's own
 * icon, as the original drew them (CultButton.as show: ItemIconView(choice.class_id,
 * 'iconic'); CultCarryUI.as: ItemIconView(proto tsid, '1')). Tiny Speck's proto
 * icons (glitch-items misc/proto, CC0) are in assets/sprites/icons/proto_*.png. The
 * Tower keeps its built-stage art (js/home-tower.js).
 */
export function cultivationIcon(protoClass) {
  const def = cultivationDef(protoClass);
  if (def?.kind === 'tower') return 'assets/sprites/home-tower/proto_3.webp';
  return `assets/sprites/icons/${protoClass}.png`;
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

function setMode(engine, next) {
  if (next && !scene) return;
  const endsCultivation = mode === 'cultivate' && next !== 'cultivate';
  closeUpgradePicker(true);
  mode = next;
  placing = null;
  selected = null;
  drag = null;
  packDrag = null;
  stackCarry = null;
  drawPackMarker(engine, null);
  drawStackSelection(engine);
  carryBy = 'pointer';
  heldPan.clear();
  setHover(engine, null);
  stopStamping(engine);
  // PackDisplayManager: entering Decoration Mode opens the Furniture tab.
  if (next === 'decorate' && (!tab || tab === 'house' || tab === 'pack')) tab = 'furniture';
  destroyGhost();
  if (mode === 'cultivate') drawCultivationMarkers(engine);
  else if (scene) {
    scene.markers?.destroy({ children: true });
    scene.markers = null;
  }
  if (scene?.room === 'interior') renderFurniture(engine);
  renderBar(engine);
  publish(engine);
  if (endsCultivation) endCultivationMode(engine);
}

/**
 * cultivation_mode_ended (main.js 6062-6068): the location's Magic Rock hears
 * it (doCultivationModeEnded 564-572). Both home rooms have one in the source.
 */
function endCultivationMode(engine) {
  const lines = cultivationModeEnded(rockFlags);
  if (!lines) return;
  engine.save?.();
  engine.setData('homeRockLast', 'good_work');
  publish(engine);
  rockSays(engine, lines);
}

/**
 * TSMainView.as shiftCKeyHandler 816-828: shift+C ends cultivation mode with
 * CLICK_SUCCESS, or asks the server to start it (HouseManager.as
 * startCultivation 102-118): CLICK_SUCCESS and the mode when the location
 * offers cultivation choices, CLICK_FAILURE otherwise. Away from home the
 * location has no cultivation_start (main.js doCultivationStart 7496), so the
 * request fails and only the click is heard (G231); a Tower floor offers no
 * choices. Returns 'on' | 'off' | 'failed'.
 */
function toggleCultivateKey(engine) {
  if (mode === 'cultivate') {
    engine.playSound?.('CLICK_SUCCESS', { volume: 0.32 });
    setMode(engine, null);
    return 'off';
  }
  const ctx = engine.homeContext?.() || {};
  if (!ctx.inHome || !ctx.owned || !scene || scene.construction || (scene.room !== 'street' && !inHouse())) {
    engine.playSound?.('CLICK_FAILURE', { volume: 0.4 });
    return 'failed';
  }
  engine.playSound?.('CLICK_SUCCESS', { volume: 0.32 });
  setMode(engine, 'cultivate');
  return 'on';
}

function beginPlacing(engine, classTsid, from = null, style = null) {
  placing = { kind: 'furniture', classTsid, from };
  carryBy = 'pointer';
  stopStamping(engine);
  // G358: an upgraded piece from storage (its index in decor.styles[class]).
  if (Number.isInteger(style)) {
    placing.style = style;
    placing.upgradeId = decor.styles?.[classTsid]?.[style]?.upgradeId || '';
  }
  selected = null;
  makeGhost(engine);
  renderFurniture(engine);
  renderBar(engine);
}

function beginMove(engine, id) {
  const item = placedItem(decor, id);
  if (!item) return;
  if (item.classTsid === DOOR_CLASS) {
    const lift = doorLiftCheck(floors, houseFloorHere() ?? -1, id, { inProgress: doorJobStarted() });
    if (!lift.ok) {
      engine.toast(lift.msg);
      return;
    }
  }
  placing = { kind: 'furniture', classTsid: item.classTsid, moveId: id, upgradeId: item.upgradeId || '' };
  carryBy = 'pointer';
  setHover(engine, null);
  makeGhost(engine);
  renderFurniture(engine);
  renderBar(engine);
}

/** CultManager.as 119-124: the placement warning's confirm. */
export const CULT_WARNING_TEXT = Object.freeze({ title: 'Are you sure?', yes: 'Yes, Do It!!', no: 'No, Forget It' });

function beginCultivate(engine, protoClass, opts = {}) {
  const def = cultivationDef(protoClass);
  if (def?.warning && !opts.confirmed) {
    // cultivation_get_available placement_warning before the Tower plans are bought, asked with
    // CultManager.as warning_cdVO 119-126: "Are you sure?", Yes, Do It!! / No, Forget It.
    confirmDialog(engine, {
      title: CULT_WARNING_TEXT.title,
      kicker: def.label,
      beats: [{ text: def.warning, response: CULT_WARNING_TEXT.yes }],
      yes: CULT_WARNING_TEXT.yes,
      no: CULT_WARNING_TEXT.no,
      onYes: () => beginCultivate(engine, protoClass, { confirmed: true }),
    });
    return;
  }
  placing = { kind: 'cultivation', protoClass };
  carryBy = 'pointer';
  selected = null;
  makeGhost(engine);
  drawCultivationMarkers(engine);
  renderBar(engine);
}

function beginNudge(engine, id) {
  const item = activeCult().items.find((row) => row.id === id);
  if (!item) return;
  placing = { kind: 'cultivation', protoClass: item.protoClass, moveId: id };
  carryBy = 'pointer';
  makeGhost(engine);
  renderBar(engine);
}

function openStore(engine) {
  engine.openShop?.(furnitureStoreProfile());
}

function applySwatch(engine, kind, key, opts = {}) {
  const result = setHomeTexture(decor, kind, key, opts);
  if (!result.ok) return result;
  engine.playSound?.('UI_TOGGLE', { volume: 0.45 });
  const what = kind === 'wall' ? (result.segment != null ? 'one wall' : 'wallpaper') : kind;
  engine.pushActivity(`You changed your ${what} to ${result.name}.`);
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
    const door = placedItem(decor, id)?.classTsid === DOOR_CLASS
      ? doorLiftCheck(floors, houseFloorHere() ?? -1, id, { inProgress: doorJobStarted() })
      : null;
    // HOMES3 (multiplayer): a piece for sale stays put (furniture_bed.js:70 "You have to stop selling it first.").
    const sale = houseFloorHere() === 0 ? engine.query?.('furnitureSaleLock', decor, id, engine) : null;
    // Ticket 51 (bag_furniture_sdb.js canPickup 872): a box with currants on it (online, the site's) stays put too.
    const income = houseFloorHere() === 0 && placedItem(decor, id)?.classTsid === 'bag_furniture_sdb' ? Number(engine.query?.('storagePickupIncome', id, engine)) || 0 : 0;
    const held = income > 0 ? storagePickupLock(placedItem(decor, id), { income }) : '';
    result = door && !door.ok ? { ok: false, reason: 'door', msg: door.msg }
      : typeof sale === 'string' && sale ? { ok: false, reason: 'sale', msg: sale }
        : held ? { ok: false, reason: 'not_empty', msg: held } : pickUpFurniture(decor, id);
    if (result.ok && door?.role === 'pending') {
      // A Door picked up before its project started takes the project with it.
      const jobId = doorJobId(floors);
      clearPendingDoor(floors);
      if (jobId) projectApi.unregister(jobId, { dropRow: true });
      doorLast = 'lifted';
      setTimeout(() => engine.refreshHomeScene?.(), 0);
    }
    if (result.ok) {
      selected = null;
      engine.pushActivity(`You picked up the ${result.pieces.map((p) => pieceLabel(p, furnitureDef(p.classTsid).label)).join(', ')}. It went into your furniture storage.`);
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
  const result = inTower() ? expandInterior(decor, engine.inv) : expandHouseFloors(floors, houseDecor, engine.inv);
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

const ITEM_NAMES = Object.freeze({
  wood_post: ['Wood Post', 'Wood Posts'],
  board: ['Board', 'Boards'],
  barnacle_talc: ['Barnacle Talc', 'Barnacle Talc'],
  beam: ['Beam', 'Beams'],
  girder: ['Girder', 'Girders'],
});

/** HouseExpandDialog TYPE_UNEXPAND: what comes back, "2 Wood Posts, 6 Boards and 1 Beam". */
function refundList(items) {
  const parts = Object.entries(items).map(([cls, n]) => `${n} ${(ITEM_NAMES[cls] || [cls, cls])[n === 1 ? 0 : 1]}`);
  return parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}` : parts.join('');
}

/** DecorateToolbarUI Un-expand -> HouseExpandDialog -> its confirm dialog -> houses_unexpand. */
function confirmUnexpand(engine) {
  const quote = inTower() ? quoteInteriorUnexpand(decor) : quoteHouseUnexpand(floors, houseDecor);
  if (!quote.ok) {
    engine.toast(quote.msg, 2400);
    return quote;
  }
  confirmDialog(engine, {
    title: UNEXPAND_TEXT.title,
    kicker: 'Decorate',
    beats: [
      { text: `${UNEXPAND_TEXT.body} ${UNEXPAND_TEXT.refund} ${refundList(quote.items)}.`, response: 'Un-expand it' },
      { text: UNEXPAND_TEXT.confirm, response: UNEXPAND_TEXT.yes },
    ],
    yes: UNEXPAND_TEXT.yes,
    no: UNEXPAND_TEXT.no,
    onYes: () => unexpandHouse(engine),
  });
  return quote;
}

function unexpandHouse(engine) {
  const result = inTower() ? unexpandInterior(decor, engine.inv) : unexpandHouseFloors(floors, houseDecor, engine.inv);
  if (!result.ok) {
    engine.toast(result.msg || UNEXPAND_TEXT.min);
    return result;
  }
  // homes_unexpand moves players standing in the last 300 px over too.
  const p = engine.player;
  if (p && scene?.room === 'interior' && scene.tower == null && p.x - roomX0() >= result.edge) p.x -= 150;
  engine.pushActivity(`You un-expanded your house. Refunded: ${refundList(result.items)}.`);
  engine.refreshPack();
  engine.save();
  engine.refreshHomeScene?.();
  renderBar(engine);
  engine.setData('homeUnexpanded', result.wallSegments);
  return result;
}

function growYard(engine, side) {
  const st = activeCult();
  const back = isBackYard(st);
  const result = expandYard(st, engine.pc, side);
  if (!result.ok) {
    engine.toast(result.msg || 'You cannot expand right now.');
    return result;
  }
  engine.pushActivity(back
    ? `You expanded your yard for ${result.cost.toLocaleString()} iMG.`
    : `You expanded your street to the ${side} for ${result.cost.toLocaleString()} iMG.`);
  // home_add_expansion 2742-2744 / 2784-2787: the last one bought counts toward Landgrabber.
  if (result.maxed) engine.achievement(back ? 'max_expansions:yard' : 'max_expansions:street', 1);
  engine.updateHud();
  engine.save();
  // The yard grows on the left, so everything right of it moves over a segment.
  const shift = back || side === 'left' ? 150 : 0;
  engine.refreshHomeScene?.({ shift });
  return result;
}

function removeSelected(engine) {
  if (selected?.kind !== 'cultivation') return null;
  if (!inHouse() && towerItem(cult)?.id === selected.id) return towerBridge.removeTower(engine);
  const result = uncultivate(engine, selected.id);
  engine.refreshHomeScene?.();
  return result;
}

function placeAtPointer(engine, at) {
  if (!placing) return null;
  if (placing.kind === 'fixture') return placeFixture(engine, placing.id, at.x);
  if (placing.kind === 'furniture') {
    let result;
    const isDoor = placing.classTsid === DOOR_CLASS;
    const doorCheck = isDoor && !placing.moveId ? doorPlaceCheck(floors, { floor: houseFloorHere() ?? 0, tower: inTower() }) : { ok: true };
    if (!doorCheck.ok) {
      result = { ok: false, reason: doorCheck.reason, msg: doorCheck.msg };
    } else if (placing.moveId) {
      const was = placedItem(decor, placing.moveId);
      const fromX = was?.x;
      result = moveFurniture(decor, placing.moveId, at);
      // dropFromLocationOnTargetPlatform also_tsids: the stacks on a moved piece go with it.
      if (result.ok && Number.isFinite(fromX)) {
        const dx = placedItem(decor, placing.moveId).x - fromX;
        let carried = 0;
        for (const row of roomStackRows(engine)) {
          if (row.on !== placing.moveId || !dx) continue;
          row.x += dx;
          carried += 1;
        }
        // Saved and redrawn now (SEATSELECT): settleRoomStacks finds them already on the piece and
        // moves nothing, so before this they stayed where they were drawn until the room reloaded.
        if (carried) engine.droppedItemsChanged?.();
      }
      selected = { kind: 'furniture', id: placing.moveId };
      if (result.ok && isDoor) setTimeout(() => engine.refreshHomeScene?.(), 0);
    } else {
      result = placeFurniture(decor, engine.inv, placing.classTsid, at, { from: placing.from || undefined, style: placing.style });
      if (result.ok && isDoor) {
        // onContainerChanged: a Door set down in the house opens Build a New Floor.
        noteDoorPlaced(floors, houseFloorHere() ?? 0, result.item.id);
        doorLast = `placed:${floors.pending?.floor}`;
        registerDoorJob(engine);
        engine.pushActivity("Click your Door to add a floor.");
        setTimeout(() => engine.refreshHomeScene?.(), 0);
      }
      if (result.ok) {
        selected = { kind: 'furniture', id: result.item.id };
        engine.pushActivity(`You placed a ${pieceLabel(result.item, furnitureDef(placing.classTsid).label)}.`);
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
  const st = activeCult();
  const rx = Math.round(at.x - homeStreetLayout(st).houseX);
  let result;
  if (placing.moveId) {
    result = nudgeCultivation(st, placing.moveId, rx, engine.learnedSkills);
  } else {
    result = cultivate(st, engine.pc, placing.protoClass, rx);
    if (result.ok) {
      engine.pushActivity(`You imagined a ${result.label} into your yard for ${result.cost.toLocaleString()} iMG.`);
      if (cultivationDef(result.item.protoClass)?.kind === 'tower') towerApi.onCultivated(engine, result.item);
      engine.floatText?.(at.x, yardGroundY(st) - 120, `-${result.cost} iMG`, 0xb38cff);
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
  keyCarry = null;
  dimFixture(null, null, false);
}

function makeGhost(engine) {
  destroyGhost();
  if (!scene || !placing) return;
  const { PIXI } = engine;
  const g = new PIXI.Container();
  g.zIndex = 95;
  if (placing.kind === 'furniture') {
    const def = furnitureDef(placing.classTsid);
    const spr = new PIXI.Sprite(textureFromUrl(pieceArt(def.classTsid, placing.upgradeId).path));
    spr.anchor.set(0.5, def.slot === 'ceiling' ? 0 : 1);
    spr.scale.set(pieceScale(def.classTsid, placing.upgradeId));
    spr.alpha = 0.72;
    g.addChild(spr);
  } else if (placing.kind === 'fixture') {
    // The fixture's own frame over its footprint (the rock's is the sprite inside its box).
    const pad = new PIXI.Graphics();
    g.addChild(pad);
    g.pad = pad;
    g.half = MOVABLE_FIXTURES[placing.id].half;
    const live = fixtureTarget(engine, placing.id)?.sprite;
    const src = live?.texture ? live : live?.children?.find((c) => c.texture);
    if (src) {
      const art = new PIXI.Sprite(src.texture);
      art.anchor.copyFrom(src.anchor);
      art.alpha = 0.85;
      g.addChild(art);
      g.art = art;
    }
  } else {
    const half = footprint(placing.protoClass);
    const pad = new PIXI.Graphics();
    g.addChild(pad);
    g.pad = pad;
    g.half = half;
    // CultCarryUI: the item's own art over its placement line.
    const art = new PIXI.Sprite(textureFromUrl(cultivationIcon(placing.protoClass)));
    art.anchor.set(0.5, 1);
    art.alpha = 0.85;
    const fit = () => {
      const w = art.texture?.width || 1;
      const h = art.texture?.height || 1;
      art.scale.set(Math.min(1.4, 96 / Math.max(w, h)));
    };
    fit();
    if (!isLoaded(art.texture?.source)) onLoaded(art.texture?.source, () => !art.destroyed && fit());
    art.y = -6;
    g.addChild(art);
    g.art = art;
  }
  engine.entityLayer.addChild(g);
  scene.ghost = g;
  updateGhost(engine);
}

/** Where what you carry is now (world x, y): the keys' point, the pointer, or at your feet. */
function carryAt(engine) {
  if (carryBy === 'keys' && keyCarry) return keyCarry;
  if (carryBy !== 'avatar' && pointer.inside) return pointer;
  return { x: engine.player?.x ?? 400, y: GROUND_Y - 120 };
}

function updateGhost(engine) {
  const g = scene?.ghost;
  if (!g || !placing) return;
  const at = carryAt(engine);
  g.alpha = drag?.over === 'tray' ? 0.3 : 1;
  if (placing.kind === 'furniture') {
    // Furniture lives in room x; the room starts at the back yard's edge.
    const snap = snapPlacement(decor, placing.classTsid, toRoom(at), placing.moveId || null, placing.upgradeId || '');
    g.x = snap.x + roomX0();
    g.y = snap.y;
    g.ok = true;
    return;
  }
  if (placing.kind === 'fixture') {
    const x = Math.round(at.x);
    const ok = fixtureCheck(placing.id, x).ok;
    g.ok = ok;
    g.x = x;
    g.y = STREET_GROUND_Y + 4;
    g.pad.clear();
    g.pad.roundRect(-g.half, -14, g.half * 2, 20, 10).fill({ color: ok ? 0x7cc35a : 0xe0574a, alpha: 0.35 });
    g.pad.roundRect(-g.half, -14, g.half * 2, 20, 10).stroke({ width: 2, color: ok ? 0x7cc35a : 0xe0574a, alpha: 0.95 });
    if (g.art) g.art.alpha = ok ? 0.9 : 0.45;
    return;
  }
  const st = activeCult();
  const rx = Math.round(at.x - homeStreetLayout(st).houseX);
  const ok = placementCheck(st, placing.protoClass, rx, placing.moveId || null).ok;
  g.ok = ok;
  g.x = at.x;
  g.y = yardGroundY(st);
  g.pad.clear();
  g.pad.roundRect(-g.half, -10, g.half * 2, 20, 10).fill({ color: ok ? 0x7cc35a : 0xe0574a, alpha: 0.35 });
  g.pad.roundRect(-g.half, -10, g.half * 2, 20, 10).stroke({ width: 2, color: ok ? 0x7cc35a : 0xe0574a, alpha: 0.95 });
  if (g.art) g.art.alpha = ok ? 0.9 : 0.45;
}

/** The game canvas's rect and its css px per view px. */
function canvasFrame(engine) {
  const canvas = gameCanvas();
  const rect = canvas?.getBoundingClientRect?.();
  if (!rect?.width) return null;
  return { rect, k: (engine.camera?.w || 960) / rect.width };
}

function worldPoint(engine, event) {
  const f = canvasFrame(engine);
  if (!f) return { x: pointer.x, y: pointer.y };
  // CSS px per view px: the view follows the window (g458).
  const sx = (event.clientX - f.rect.left) * f.k;
  const sy = (event.clientY - f.rect.top) * f.k;
  const p = engine.entityLayer.toLocal(new engine.PIXI.Point(sx, sy));
  return { x: p.x, y: p.y };
}

/** A world point (entity layer) as a client point. */
function clientPoint(engine, x, y) {
  const f = canvasFrame(engine);
  if (!f) return null;
  const g = engine.entityLayer.toGlobal(new engine.PIXI.Point(x, y));
  return { x: f.rect.left + g.x / f.k, y: f.rect.top + g.y / f.k };
}

function overCanvas(e) {
  const canvas = gameCanvas();
  if (!canvas) return false;
  const r = canvas.getBoundingClientRect();
  return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
}

function furnitureAt(point) {
  // Front-most first: the ceiling pieces over the avatars, then the rest from the top down.
  const top = renderOrder(decor).reverse();
  const order = [...top.filter(furnitureDrawsInFront), ...top.filter((item) => !furnitureDrawsInFront(item))];
  for (const item of order) {
    const b = furnitureBounds(item);
    if (point.x >= b.x && point.x <= b.x + b.w && point.y >= b.y && point.y <= b.y + b.h) return item;
  }
  return null;
}

// ---------------------------------------------------------------------------
// BUILDER: carrying, dragging, the keys (client HandOfDecorator, CultManager)
// ---------------------------------------------------------------------------

let drag = null; // { source: 'tray'|'room', id?, over: 'room'|'tray'|null }
let carryBy = 'pointer'; // what moves the thing you carry: 'pointer' | 'keys' | 'avatar'
let keyCarry = null; // the keys' point while carrying with them (world)
let trayFilter = 'all';
/** Ticket 53: the Walls / Floors / Ceilings tabs' chosen category ('all' or a category name). */
const swatchFilter = { wall: 'all', floor: 'all', ceiling: 'all' };
let hoverId = null;
let popModel = null;
let packDrag = null; // { classTsid, count, furniture }
let packDragWired = false;
let lastClient = null; // the pointer's last client point while dragging
let edgeSince = 0;
const heldPan = new Set();
let heldFast = false;

/** Stop carrying anything (Esc, or a drop that went nowhere). */
function cancelCarry(engine) {
  const wasMove = placing?.moveId;
  placing = null;
  drag = null;
  carryBy = 'pointer';
  destroyGhost();
  ui?.builder?.tray?.classList.remove('is-drop-target');
  if (mode === 'decorate' && wasMove) renderFurniture(engine);
  renderBar(engine);
  publish(engine);
}

/** Carry with the keys: the ghost starts on `item` (a Move) or mid-view, and the Place button takes focus. */
function carryWithKeys(engine, item = null) {
  if (!placing || placing.kind !== 'furniture') return;
  carryBy = 'keys';
  const view = engine.camera;
  keyCarry = item
    ? { x: item.x + roomX0(), y: item.slot === 'ceiling' ? item.y : item.y - 40 }
    : { x: Math.round((view?.x || 0) + (view?.w || 960) / 2), y: furnitureDef(placing.classTsid)?.slot === 'wall' ? INTERIOR.wallTop + 160 : INTERIOR.floorY - 40 };
  updateGhost(engine);
  syncFloating(engine, true);
  ui?.builder?.place?.focus?.({ preventScroll: true });
}

/** A tray tile dragged out: start carrying it with the pointer. */
function startTrayDrag(engine, e, begin) {
  begin();
  if (!placing) return;
  drag = { source: 'tray', over: null };
  carryBy = 'pointer';
  moveDrag(engine, e);
}

function moveDrag(engine, e) {
  if (!drag || !e) return;
  lastClient = { x: e.clientX, y: e.clientY };
  const overTray = Boolean(ui?.builder?.trayHit(e.clientX, e.clientY));
  drag.over = overTray ? 'tray' : overCanvas(e) ? 'room' : null;
  // DecoratorBagUI: a placed piece dragged back over the bag is put away there.
  const dropping = drag.source === 'room' && overTray;
  const tray = ui?.builder?.tray;
  if (tray && tray.classList.contains('is-drop-target') !== dropping) {
    tray.classList.toggle('is-drop-target', dropping);
    const note = tray.querySelector('.hb-tray-note');
    if (note) {
      if (dropping) note.dataset.was = note.textContent;
      note.textContent = dropping ? BUILDER_TEXT.dropToPickUp : note.dataset.was || '';
    }
  }
  if (drag.over === 'room') pointer = { ...worldPoint(engine, e), inside: true };
  updateGhost(engine);
  syncFloating(engine);
  engine.setData('homeDrag', `${drag.source}:${placing?.classTsid || placing?.protoClass || ''}:${drag.over || ''}`);
}

function endDrag(engine, e, { cancelled = false, overTray = false } = {}) {
  if (!drag) return;
  const was = drag;
  if (e) moveDrag(engine, e);
  drag = null;
  lastClient = null;
  edgeSince = 0;
  ui?.builder?.tray?.classList.remove('is-drop-target');
  engine.setData('homeDrag', '');
  if (cancelled || !placing) return cancelCarry(engine);
  if (overTray || was.over === 'tray') {
    if (was.source === 'room' && placing.kind === 'furniture' && placing.moveId) {
      // dropFurnitureFromLocationInFurnitureBag: back into storage, by furniture_pickup's rules.
      const id = placing.moveId;
      placing = null;
      destroyGhost();
      selected = { kind: 'furniture', id };
      const res = runFurnitureAction(engine, 'pickup');
      engine.setData('homeDropLast', res?.ok ? `stored:${id}` : `refused:${res?.reason || ''}`);
      return res;
    }
    return cancelCarry(engine);
  }
  if (was.over !== 'room') return cancelCarry(engine);
  const res = placeAtPointer(engine, placing.kind === 'furniture' ? toRoom(pointer) : pointer);
  engine.setData('homeDropLast', res?.ok ? 'placed' : `refused:${res?.reason || ''}`);
  return res;
}

/** The world x span of the room on show (the house's frame, or a Tower floor). */
function roomSpan() {
  const room = scene?.background?.room;
  const x0 = roomX0();
  return { left: x0, right: x0 + (room?.width || interiorWidth(decor)) };
}

/** [ and ]: the placed piece left or right of the selected one (by x), with the camera on it. */
function selectAdjacent(engine, dir) {
  const rows = [...decor.placed].sort((a, b) => a.x - b.x || a.z - b.z);
  if (!rows.length) return null;
  const at = selected?.kind === 'furniture' ? rows.findIndex((row) => row.id === selected.id) : -1;
  let i;
  if (at < 0) {
    // From the middle of the view.
    const mid = (decorCamX ?? engine.player?.x ?? 0) - roomX0();
    i = dir > 0 ? rows.findIndex((row) => row.x >= mid) : rows.findLastIndex((row) => row.x <= mid);
    if (i < 0) i = dir > 0 ? 0 : rows.length - 1;
  } else i = (at + dir + rows.length) % rows.length;
  const item = rows[i];
  selected = { kind: 'furniture', id: item.id };
  decorCamX = item.x + roomX0();
  decorPan = null;
  renderFurniture(engine);
  renderBar(engine);
  publish(engine);
  return item;
}

/** Arrows while carrying with the keys: move the ghost (Shift: further), the camera keeps it in view. */
function moveKeyCarry(engine, [dx, dy], fast) {
  if (!keyCarry) return;
  const step = fast ? 60 : 15;
  keyCarry = { x: keyCarry.x + dx * step, y: keyCarry.y + dy * step };
  const span = roomSpan();
  keyCarry.x = Math.max(span.left, Math.min(span.right, keyCarry.x));
  keyCarry.y = Math.max(INTERIOR.ceilingTop, Math.min(INTERIOR.floorY, keyCarry.y));
  const w = engine.camera?.w || 960;
  const cx = decorCamX ?? engine.player?.x ?? 0;
  if (keyCarry.x < cx - w / 2 + 140) decorCamX = keyCarry.x + w / 2 - 140;
  else if (keyCarry.x > cx + w / 2 - 140) decorCamX = keyCarry.x - w / 2 + 140;
  updateGhost(engine);
  syncFloating(engine);
}

// --- the hover glow (HandOfDecorator updateHighlightedLISView: glow on the piece under the cursor)

function setHover(engine, id) {
  if (id === hoverId) return;
  hoverId = id;
  drawHover(engine);
  engine.setData('homeHover', hoverId ?? '');
}

let glowFilter = null;
function drawHover(engine) {
  if (scene?.hoverGlow && !scene.hoverGlow.destroyed) scene.hoverGlow.destroy({ children: true });
  if (scene) scene.hoverGlow = null;
  const view = hoverId != null && !placing && !stamping && !(selected?.kind === 'furniture' && selected.id === hoverId)
    ? scene?.furnitureViews?.get(hoverId) : null;
  if (!view || view.destroyed || !view.art || !view.parent) return;
  const { PIXI } = engine;
  const glow = new PIXI.Container();
  const art = view.art;
  // A warm outline: the piece's own art eight times, two px out each way, made one light colour.
  for (const [ox, oy] of [[-2, 0], [2, 0], [0, -2], [0, 2], [-2, -2], [2, -2], [-2, 2], [2, 2]]) {
    const s = new PIXI.Sprite(art.texture);
    s.anchor.copyFrom(art.anchor);
    s.scale.copyFrom(art.scale);
    s.x = art.x + ox;
    s.y = art.y + oy;
    glow.addChild(s);
  }
  if (PIXI.ColorMatrixFilter) {
    if (!glowFilter) {
      glowFilter = new PIXI.ColorMatrixFilter();
      glowFilter.matrix = [0, 0, 0, 0, 1, 0, 0, 0, 0, 0.92, 0, 0, 0, 0, 0.62, 0, 0, 0, 1, 0];
    }
    glow.filters = [glowFilter];
  } else {
    for (const s of glow.children) s.tint = 0xfff1b0;
  }
  glow.alpha = 0.95;
  glow.x = view.x;
  glow.y = view.y;
  glow.zIndex = view.zIndex - 0.5;
  glow.eventMode = 'none';
  view.parent.addChild(glow);
  scene.hoverGlow = glow;
}

// --- swatch preview (HandOfDecorator startPreviewingSwatch: the swatch shows on its target first)

function redrawPreview(engine) {
  const bg = scene?.background;
  if (!bg?.redraw) return;
  if (stamping && stampHover) {
    const preview = { ...decor, walls: [...(decor.walls || [])] };
    const res = setHomeTexture(preview, stamping.kind, stamping.key, stampHover.kind === 'wall' && stampHover.center ? { segment: stampHover.segment } : {});
    bg.redraw(res.ok ? preview : null);
    engine.setData('homeSwatchPreview', res.ok ? `${stamping.kind}:${stamping.key}${res.segment != null ? `@${res.segment}` : ''}` : '');
    return;
  }
  bg.redraw(null);
  engine.setData('homeSwatchPreview', '');
}

// --- Storage Display Boxes take what is dragged onto them (DECOPOLISH, Austin 2026-11-02: "Doesn't
// look like I can place items on these storage boxes"). The original: a box has no plats (bag_furniture_sdb.js
// getFurnitureBaseGeo 1033-1041: plats null, and none of its 47 styles has one), so nothing rests on it;
// it shows one kind of thing inside it, stocked by its deposit verb, a drop target ("is_drop_target",
// drop_tip "Deposit", drop_ok_code 624-636) the client kept in Decoration Mode (DragVO.as
// findDragTargetForStack 133-138: "NOT DOING THIS NO MORE SO WE CAN DRAG TO SDBs IN DECO MODE"). A
// stack set down in the room goes in too (valid_items 668-690, the handler's target_itemstack_tsid
// from the location 718-741). The remake puts in the whole stack dragged (the original asked how
// many, drop_many), and a box that will not take it says why instead of letting it fall to the floor
// behind (the original simply was not a target there).

/** What the Display rule needs to know of a class (displayRefusal). */
function displayMeta(cls) {
  const tags = ITEM_CATALOG[cls]?.tags || [];
  return { tool: Boolean(ITEM_CATALOG[cls]?.isTool), bag: isBagClass(cls), blocked: tags.includes('quest-item') || tags.includes('no_drop') };
}

/** The Storage Display Box under a room point (the front-most), or null. */
function displayBoxAt(point) {
  if (!point) return null;
  for (const item of renderOrder(decor).reverse()) {
    if (item.classTsid !== 'bag_furniture_sdb') continue;
    const b = furnitureBounds(item);
    if (point.x >= b.x && point.x <= b.x + b.w && point.y >= b.y && point.y <= b.y + b.h) return item;
  }
  return null;
}

/** A drag over a box: { box, refusal } (refusal null when it takes `cls`), or null off every box. */
function displayDropAt(point, cls) {
  const box = displayBoxAt(point);
  return box ? { box, refusal: displayRefusal(box, cls, displayMeta(cls)) } : null;
}

/** Light the box a drag is over: green with the drop tip when it takes it, else red with why not. */
function drawDisplayTarget(engine, hit) {
  if (scene?.sdbMarker && !scene.sdbMarker.destroyed) scene.sdbMarker.destroy({ children: true });
  if (scene) scene.sdbMarker = null;
  if (!hit || !scene) {
    engine.setData('homeDisplayTarget', '');
    return;
  }
  const { PIXI } = engine;
  const b = furnitureBounds(hit.box);
  const ok = !hit.refusal;
  const color = ok ? 0x8fe388 : 0xff8f7a;
  const g = new PIXI.Container();
  g.zIndex = 9999;
  g.eventMode = 'none';
  const ring = new PIXI.Graphics();
  ring.roundRect(b.x - 5, b.y - 5, b.w + 10, b.h + 10, 8).stroke({ width: 3, color, alpha: 1 });
  ring.roundRect(b.x - 5, b.y - 5, b.w + 10, b.h + 10, 8).fill({ color, alpha: 0.14 });
  const tip = new PIXI.Text({ text: ok ? DISPLAY_TEXT.dropTip : hit.refusal.msg, style: {
    fontFamily: 'Trebuchet MS, sans-serif', fontSize: 12, fontWeight: '700', fill: 0xffffff,
    stroke: { color: 0x3b2a1f, width: 3 }, align: 'center', wordWrap: true, wordWrapWidth: 180,
  } });
  tip.anchor.set(0.5, 1);
  tip.x = b.x + b.w / 2;
  tip.y = b.y - 9;
  g.addChild(ring, tip);
  g.x = roomX0();
  engine.entityLayer.addChild(g);
  scene.sdbMarker = g;
  engine.setData('homeDisplayTarget', `${hit.box.id}:${ok ? 'ok' : hit.refusal.reason}`);
}

function clearDisplayTarget(engine) {
  drawDisplayTarget(engine, null);
}

/** Put `count` of a pack class in a box (the Display button's deposit, the dragged stack's count). */
function depositInBox(engine, box, cls, count) {
  const refusal = displayRefusal(box, cls, displayMeta(cls));
  if (refusal) return { ok: false, ...refusal };
  const n = Math.min(Math.max(1, Math.floor(Number(count) || 1)), Number(engine.inv[cls]) || 0);
  if (!n) return { ok: false, reason: 'missing', msg: 'That stack is no longer in your pack.' };
  const result = displayDeposit(decor, engine.inv, box.id, cls, n);
  if (result.ok) {
    engine.refreshPack();
    engine.playSound?.('ITEM_DROP', { volume: 0.45 });
    renderFurniture(engine);
    renderBar(engine);
    engine.save();
  }
  return result;
}

// --- pack items onto shelves and tables (HandOfDecorator startWithItemFromPack, dropItemFromPackOnTargetPlatform)

function packDropTarget(engine, e) {
  const p = toRoom(worldPoint(engine, e));
  return stackSurfaceAt(decor, p.x, p.y);
}

function drawPackMarker(engine, target, what = packDrag) {
  if (scene?.packMarker && !scene.packMarker.destroyed) scene.packMarker.destroy({ children: true });
  if (scene) scene.packMarker = null;
  if (!target || !what || !scene) return;
  const { PIXI } = engine;
  const g = new PIXI.Container();
  g.zIndex = 95;
  // The stack as it will lie there (js/world-art.js: its count's state at its own size).
  const iconUrl = ITEM_CATALOG[what.classTsid]?.icon || `assets/sprites/icons/${what.classTsid}.png`;
  const art = worldArtFor(what.classTsid, what.count, iconUrl);
  const icon = new PIXI.Sprite(textureFromUrl(art?.url || iconUrl));
  icon.anchor.set(0.5, 1);
  icon.width = art?.w || WORLD_ART_FALLBACK_MAX;
  icon.height = art?.h || WORLD_ART_FALLBACK_MAX;
  icon.alpha = 0.85;
  const line = new PIXI.Graphics();
  line.roundRect(-26, -2, 52, 5, 2.5).fill({ color: 0xfff1b0, alpha: 0.95 });
  g.addChild(line, icon);
  g.x = target.x + roomX0();
  g.y = target.y;
  engine.entityLayer.addChild(g);
  scene.packMarker = g;
}

function endPackDrag(engine) {
  packDrag = null;
  lastClient = null;
  edgeSince = 0;
  drawPackMarker(engine, null);
  clearDisplayTarget(engine);
  if (placing?.from === 'pack' && !drag) cancelCarry(engine);
  engine.setData('homeDrag', '');
}

function wirePackDrag(engine) {
  const canvas = gameCanvas();
  if (packDragWired || !canvas) return Boolean(canvas);
  packDragWired = true;
  canvas.addEventListener('dragover', (e) => {
    if (!packDrag || mode !== 'decorate') return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
    lastClient = { x: e.clientX, y: e.clientY };
    if (packDrag.furniture) {
      pointer = { ...worldPoint(engine, e), inside: true };
      updateGhost(engine);
      return;
    }
    const hit = displayDropAt(toRoom(worldPoint(engine, e)), packDrag.classTsid);
    drawDisplayTarget(engine, hit);
    drawPackMarker(engine, hit ? null : packDropTarget(engine, e));
    engine.setData('homeDrag', `pack:${packDrag.classTsid}:${hit ? 'sdb' : 'room'}`);
  });
  canvas.addEventListener('dragleave', () => {
    drawPackMarker(engine, null);
    clearDisplayTarget(engine);
  });
  canvas.addEventListener('drop', (e) => {
    if (!packDrag || mode !== 'decorate') return;
    e.preventDefault();
    const was = packDrag;
    if (was.furniture) {
      pointer = { ...worldPoint(engine, e), inside: true };
      packDrag = null;
      const res = placeAtPointer(engine, toRoom(pointer));
      engine.setData('homeDropLast', res?.ok ? 'placed' : `refused:${res?.reason || ''}`);
      endPackDrag(engine);
      return;
    }
    const hit = displayDropAt(toRoom(worldPoint(engine, e)), was.classTsid);
    if (hit) {
      endPackDrag(engine);
      const res = depositInBox(engine, hit.box, was.classTsid, was.count);
      if (!res.ok) {
        if (res.msg) engine.toast(res.msg);
        engine.playSound?.('CLICK_FAILURE', { volume: 0.4 });
      }
      engine.setData('homeDropLast', res.ok ? `display:${was.classTsid}:${hit.box.id}` : `refused:${res.reason || ''}`);
      return;
    }
    const target = packDropTarget(engine, e);
    endPackDrag(engine);
    const res = engine.dropPackStackAt?.(was.classTsid, was.count, target.x + roomX0(), target.y);
    if (!res?.ok) {
      if (res?.msg) engine.toast(res.msg);
      engine.playSound?.('CLICK_FAILURE', { volume: 0.4 });
    } else {
      settleRoomStacks(engine);
      // Once a visit: how to move it or take it back (Austin 2026-11-01).
      if (!stackHintShown) {
        stackHintShown = true;
        engine.toast(BUILDER_TEXT.stackHint, 4200);
      }
    }
    engine.setData('homeDropLast', res?.ok ? `stack:${was.classTsid}:${target.on ?? 'floor'}` : `refused:${res?.reason || ''}`);
  });
  document.addEventListener('dragend', () => { if (packDrag) endPackDrag(engine); });
  return true;
}

/** game.js pack dragstart while decorating: a pack stack goes onto a shelf, a table or the floor. */
function startPackDrag(classTsid, event, engine) {
  if (mode !== 'decorate' || scene?.room !== 'interior' || scene.construction || !wirePackDrag(engine)) return false;
  const count = Math.max(1, Math.floor(Number(event?.target?.closest?.('[data-pack-count]')?.dataset?.packCount) || 1));
  packDrag = { classTsid, count, furniture: Boolean(FURNITURE_CATALOG[classTsid]) };
  if (packDrag.furniture) {
    beginPlacing(engine, classTsid, 'pack');
    carryBy = 'pointer';
  }
  if (event?.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('application/x-groddle-item', classTsid);
    event.dataTransfer.setData('text/plain', classTsid);
  }
  engine.setData('homeDrag', `pack:${classTsid}:`);
  return true;
}

// --- stacks set down in the room: select, drag to move, drag onto the pack to pick up
// (HandOfDecorator.as startWithItemFromLocation 1250-1323: in Decoration Mode any stack you can
// pick up is dragged like furniture; dropFromLocationOnTargetPlatform 1445-1620 sets it down on the
// plat under the pointer, as main.js doModifyItem 4873-4910 does, at home only; endWithItemFromLocation
// 1325-1404 and the pack take one dropped on them back, as the item's own Pick up does.)

let stackCarry = null; // { id } a stack carried after its Move button, set down by the next click
let stackHintShown = false;

/** This room's dropped-stack records (live: game.js droppedItemState, this room's key). */
function roomStackRows(engine) {
  const rows = engine?.droppedItems?.streets?.[engine.dropTsid ?? engine.streetTsid];
  return Array.isArray(rows) ? rows : [];
}

function stackRow(engine, id) {
  return roomStackRows(engine).find((row) => row.id === id) || null;
}

/** A stack's drawn box in world px (js/world-art.js: its art at its own size, bottom centre on its point). */
function stackBox(row) {
  const iconUrl = ITEM_CATALOG[row.classTsid]?.icon || `assets/sprites/icons/${row.classTsid}.png`;
  const art = worldArtFor(row.classTsid, row.count, iconUrl);
  const w = art?.w || WORLD_ART_FALLBACK_MAX;
  const h = art?.h || WORLD_ART_FALLBACK_MAX;
  return { x: row.x - w / 2, y: row.y - h, w, h };
}

/** The stack under a world point (the last drawn first), or null. */
function stackAt(engine, p) {
  const rows = roomStackRows(engine);
  for (let i = rows.length - 1; i >= 0; i -= 1) {
    const b = stackBox(rows[i]);
    if (p.x >= b.x - 6 && p.x <= b.x + b.w + 6 && p.y >= b.y - 6 && p.y <= b.y + b.h + 4) return rows[i];
  }
  return null;
}

/** Every stack in the room rests on what holds it now (js/home-decor.js settleStacks). */
function settleRoomStacks(engine) {
  if (!scene?.furnitureLayer || scene.room !== 'interior' || !engine?.droppedItems) return 0;
  const moved = settleStacks(decor, roomStackRows(engine), roomX0());
  if (moved) engine.droppedItemsChanged?.();
  return moved;
}

function itemName(row) {
  const label = ITEM_CATALOG[row.classTsid]?.label || String(row.classTsid).replace(/_/g, ' ');
  return row.count > 1 ? `${label} × ${row.count}` : label;
}

/** The yellow outline round the selected stack. */
function drawStackSelection(engine) {
  if (scene?.stackSel && !scene.stackSel.destroyed) scene.stackSel.destroy();
  if (scene) scene.stackSel = null;
  const row = selected?.kind === 'stack' && mode === 'decorate' ? stackRow(engine, selected.id) : null;
  if (!row || !scene) return;
  const b = stackBox(row);
  const g = selectionOutline(engine.PIXI, b);
  g.zIndex = 96;
  g.eventMode = 'none';
  engine.entityLayer.addChild(g);
  scene.stackSel = g;
}

function selectStack(engine, id) {
  selected = id ? { kind: 'stack', id } : null;
  drawStackSelection(engine);
  renderFurniture(engine);
  renderBar(engine);
}

/** Over the pack (the Pack tab) or the decorate tray: a stack dropped there goes back in the pack. */
function overPack(clientX, clientY) {
  if (ui?.builder?.trayHit?.(clientX, clientY)) return true;
  const r = typeof document !== 'undefined' ? document.getElementById('pack-bar')?.getBoundingClientRect?.() : null;
  return Boolean(r?.width) && clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom;
}

/** Set a stack down where `p` (room px) lands: on the shelf or table under it, else the floor. */
function moveStack(engine, id, p) {
  const row = stackRow(engine, id);
  if (!row) return { ok: false, reason: 'gone' };
  const target = stackSurfaceAt(decor, p.x, p.y);
  row.x = target.x + roomX0();
  row.y = target.y;
  if (target.on != null) row.on = target.on;
  else delete row.on;
  engine.droppedItemsChanged?.();
  engine.playSound?.('ITEM_DROP', { volume: 0.45 });
  engine.setData('homeStackLast', `moved:${id}:${target.on ?? 'floor'}`);
  selected = { kind: 'stack', id };
  drawStackSelection(engine);
  renderBar(engine);
  return { ok: true, target };
}

/** Back in the pack, by the item's own Pick up (game.js pickupDroppedWorldItem: a full pack refuses). */
function pickUpStack(engine, id) {
  const ok = Boolean(engine.pickUpDroppedStack?.(id));
  engine.setData('homeStackLast', ok ? `picked:${id}` : `refused:${id}`);
  if (ok || !stackRow(engine, id)) selected = null;
  drawStackSelection(engine);
  renderBar(engine);
  publish(engine);
  return ok;
}

/**
 * A stack set down in the room dragged onto a Storage Display Box goes in it: by the item's own
 * Pick up, then the deposit, so the pack, the dropped stacks and the box each see one move (a full
 * pack leaves it where it was). A box that will not take it says why; the stack stays put.
 */
function stackIntoBox(engine, id, hit) {
  const row = stackRow(engine, id);
  if (!row) return { ok: false, reason: 'gone' };
  if (hit.refusal) {
    engine.toast(hit.refusal.msg);
    engine.playSound?.('CLICK_FAILURE', { volume: 0.4 });
    engine.setData('homeStackLast', `refused:${id}:${hit.refusal.reason}`);
    return { ok: false, ...hit.refusal };
  }
  const cls = row.classTsid;
  const had = Number(engine.inv[cls]) || 0;
  if (!engine.pickUpDroppedStack?.(id)) {
    engine.setData('homeStackLast', `refused:${id}:pack`);
    return { ok: false, reason: 'pack' };
  }
  const got = (Number(engine.inv[cls]) || 0) - had;
  const res = got > 0 ? depositInBox(engine, hit.box, cls, got) : { ok: false, reason: 'missing' };
  if (selected?.kind === 'stack') selected = null;
  drawStackSelection(engine);
  engine.setData('homeStackLast', res.ok ? `display:${id}:${hit.box.id}` : `refused:${id}:${res.reason || ''}`);
  publish(engine);
  return res;
}

function stackPop(engine) {
  if (selected?.kind !== 'stack' || placing) return null;
  const row = stackRow(engine, selected.id);
  if (!row) return null;
  return {
    key: `s:${row.id}:${row.count}:${row.x}:${row.y}`,
    title: itemName(row),
    sub: BUILDER_TEXT.stackHint,
    actions: [
      { label: 'Move', attrs: { 'data-home-stack': 'move' }, onClick: () => { stackCarry = { id: row.id }; syncFloating(engine, true); } },
      { label: 'Pick up', attrs: { 'data-home-stack': 'pickup' }, onClick: () => pickUpStack(engine, row.id) },
    ],
    extra: [],
  };
}

/** A stack dragged (or carried after Move): the marker shows where it will rest, or the pack lights up. */
function moveStackDrag(engine, e) {
  lastClient = { x: e.clientX, y: e.clientY };
  const row = stackRow(engine, drag.id);
  const toPack = overPack(e.clientX, e.clientY);
  drag.over = toPack ? 'tray' : overCanvas(e) ? 'room' : null;
  const tray = ui?.builder?.tray;
  if (tray && tray.classList.contains('is-drop-target') !== toPack) {
    tray.classList.toggle('is-drop-target', toPack);
    const note = tray.querySelector('.hb-tray-note');
    if (note) {
      if (toPack) note.dataset.was = note.textContent;
      note.textContent = toPack ? BUILDER_TEXT.dropInPack : note.dataset.was || '';
    }
  }
  document.getElementById('pack-bar')?.classList.toggle('is-drop-target', toPack);
  const hit = drag.over === 'room' && row ? displayDropAt(toRoom(worldPoint(engine, e)), row.classTsid) : null;
  drawDisplayTarget(engine, hit);
  const target = drag.over === 'room' && row && !hit ? stackSurfaceAt(decor, toRoom(worldPoint(engine, e)).x, toRoom(worldPoint(engine, e)).y) : null;
  drawPackMarker(engine, target, row);
  syncFloating(engine);
  engine.setData('homeDrag', `stack:${row?.classTsid || ''}:${drag.over || ''}`);
}

function endStackDrag(engine, e, cancelled) {
  const was = drag;
  drag = null;
  lastClient = null;
  edgeSince = 0;
  drawPackMarker(engine, null);
  clearDisplayTarget(engine);
  ui?.builder?.tray?.classList.remove('is-drop-target');
  document.getElementById('pack-bar')?.classList.remove('is-drop-target');
  engine.setData('homeDrag', '');
  if (cancelled || !was) return null;
  if (overPack(e.clientX, e.clientY)) return pickUpStack(engine, was.id);
  if (!overCanvas(e)) return null;
  const p = toRoom(worldPoint(engine, e));
  const row = stackRow(engine, was.id);
  const hit = row ? displayDropAt(p, row.classTsid) : null;
  if (hit) return stackIntoBox(engine, was.id, hit);
  return moveStack(engine, was.id, p);
}

// --- the floating actions and the Place button

/** The selected piece's top centre and bottom on screen. */
function popAnchor(engine) {
  if (selected?.kind === 'stack') {
    const row = stackRow(engine, selected.id);
    if (!row) return null;
    const b = stackBox(row);
    const top = clientPoint(engine, b.x + b.w / 2, b.y);
    const bottom = clientPoint(engine, b.x + b.w / 2, b.y + b.h);
    return top && bottom ? { x: top.x, y: top.y, bottom: bottom.y } : null;
  }
  if (selected?.kind === 'furniture') {
    const item = placedItem(decor, selected.id);
    if (!item) return null;
    const b = furnitureBounds(item);
    const top = clientPoint(engine, b.x + b.w / 2 + roomX0(), b.y);
    const bottom = clientPoint(engine, b.x + b.w / 2 + roomX0(), b.y + b.h);
    return top && bottom ? { x: top.x, y: top.y, bottom: bottom.y } : null;
  }
  if (selected?.kind === 'fixture') {
    const s = fixtureTarget(engine, selected.id)?.sprite;
    if (!s) return null;
    const top = clientPoint(engine, s.x, s.y - MOVABLE_FIXTURES[selected.id].tall);
    const bottom = clientPoint(engine, s.x, s.y + 24);
    return top && bottom ? { x: top.x, y: top.y, bottom: bottom.y } : null;
  }
  if (selected?.kind === 'cultivation') {
    const st = activeCult();
    const item = st.items.find((row) => row.id === selected.id);
    if (!item) return null;
    const x = cultivationWorldX(item, st);
    const top = clientPoint(engine, x, yardGroundY(st) - 150);
    const bottom = clientPoint(engine, x, yardGroundY(st) + 24);
    return top && bottom ? { x: top.x, y: top.y, bottom: bottom.y } : null;
  }
  return null;
}

/** Under the ghost's foot (the bottom of its drawn bounds). */
function ghostAnchor(engine, g) {
  const f = canvasFrame(engine);
  const b = g.getBounds?.();
  if (!f || !b) return null;
  const bx = b.x ?? b.minX;
  const by = b.y ?? b.minY;
  return { x: f.rect.left + (bx + b.width / 2) / f.k, y: f.rect.top + (by + b.height) / f.k };
}

/**
 * The floating actions by the selected piece and the Place button under the ghost. `force`
 * rebuilds the actions (after a change); each frame only moves them with the camera.
 */
let bannerZoneAt = 0;
let bannerZoneKey = '';
/** The banner as a notify zone (engine.reserveZone, js/notify-view.js): notices show under it. */
function reserveBannerZone(engine, force = false) {
  const now = Date.now();
  if (!force && now - bannerZoneAt < 500) return;
  bannerZoneAt = now;
  const banner = mode && ui?.builder && !ui.builder.bar.hidden ? ui.builder.banner : null;
  const r = banner?.getBoundingClientRect?.();
  const host = ui?.root?.getBoundingClientRect?.();
  const rect = r?.height && host ? { left: r.left - host.left, top: r.top - host.top, right: r.right - host.left, bottom: r.bottom - host.top } : null;
  const key = rect ? `${Math.round(rect.left)},${Math.round(rect.top)},${Math.round(rect.right)},${Math.round(rect.bottom)}` : '';
  if (key === bannerZoneKey) return;
  bannerZoneKey = key;
  engine.reserveZone?.('home-builder-banner', rect);
}

function syncFloating(engine, force = false) {
  const b = ui?.builder;
  if (!b) return;
  reserveBannerZone(engine, force);
  if (!mode || !scene) {
    popModel = null;
    b.setPop(null);
    b.setPlace(null);
    return;
  }
  if (force) popModel = mode === 'decorate' ? (selected?.kind === 'stack' ? stackPop(engine) : furniturePop(engine)) : selected?.kind === 'fixture' ? fixturePop(engine) : cultivationPop(engine);
  // Ticket 52: the style column stands in for the piece's actions while it is open.
  if (popModel && !drag && !placing && !stackCarry && !upgradePickerOpen()) b.setPop(popModel, popAnchor(engine));
  else b.setPop(null);
  const g = scene.ghost;
  if (!placing || !g || g.destroyed || (packDrag && !packDrag.furniture) || drag?.over === 'tray') {
    b.setPlace(null);
    return;
  }
  let label = placing.moveId ? BUILDER_TEXT.moveHere : BUILDER_TEXT.place;
  if (placing.kind === 'cultivation' && !placing.moveId) {
    if (placing.cost == null) placing.cost = cultivationChoices(activeCult(), engine.pc).find((row) => row.protoClass === placing.protoClass)?.cost ?? 0;
    label = placeCostText(placing.cost);
  }
  b.setPlace({
    label,
    disabled: g.ok === false,
    badTitle: "It doesn't fit here. Move it somewhere else.",
    onRefused: () => engine.playSound?.('CLICK_FAILURE', { volume: 0.4 }),
    follow: Boolean(drag || packDrag) || (carryBy === 'pointer' && pointer.inside),
    onClick: () => {
      if (!placing) return;
      const at = carryAt(engine);
      const res = placeAtPointer(engine, placing.kind === 'furniture' ? toRoom(at) : at);
      engine.setData('homeDropLast', res?.ok ? 'placed' : `refused:${res?.reason || ''}`);
    },
  }, ghostAnchor(engine, g));
}

function bindPointer(engine) {
  if (typeof document === 'undefined' || bindPointer.bound) return;
  const root = document.getElementById('game-root');
  if (!root) return;
  bindPointer.bound = true;
  const isCanvas = (e) => e.target?.tagName === 'CANVAS';
  let press = null; // a placed piece pressed, before it is a drag
  root.addEventListener('pointermove', (e) => {
    if (!mode || !scene || !isCanvas(e) || drag || press?.dragging) return;
    const p = worldPoint(engine, e);
    pointer = { ...p, inside: true };
    if (placing && carryBy !== 'pointer' && e.pointerType === 'mouse' && (e.movementX || e.movementY)) carryBy = 'pointer';
    if (stamping) {
      const hit = stampTargetAt(toRoom(p));
      if (JSON.stringify(hit) !== JSON.stringify(stampHover)) {
        stampHover = hit;
        drawStampMarks(engine);
        redrawPreview(engine);
      }
      return;
    }
    if (placing) {
      updateGhost(engine);
      return;
    }
    if (stackCarry && mode === 'decorate') {
      const row = stackRow(engine, stackCarry.id);
      const r = toRoom(p);
      drawPackMarker(engine, row ? stackSurfaceAt(decor, r.x, r.y) : null, row);
      return;
    }
    if (mode === 'decorate') setHover(engine, stackAt(engine, p) ? null : furnitureAt(toRoom(p))?.id ?? null);
  }, true);
  root.addEventListener('pointerleave', () => {
    if (mode === 'decorate') setHover(engine, null);
  }, true);
  root.addEventListener('wheel', (e) => {
    if (!isCanvas(e) || !panDecorCamera(engine, e.deltaX, e.deltaY, e.shiftKey)) return;
    e.preventDefault();
    e.stopPropagation();
  }, { capture: true, passive: false });
  const onPressMove = (e) => {
    if (!press || e.pointerId !== press.pointerId) return;
    if (!press.dragging) {
      if (Math.hypot(e.clientX - press.x, e.clientY - press.y) < DRAG_DIST) return;
      // HandOfDecorator locDragStart: a placed piece pressed and moved is carried.
      press.dragging = true;
      if (press.kind === 'stack') {
        drag = { source: 'stack', id: press.id, over: 'room' };
        setHover(engine, null);
        syncFloating(engine, true);
        moveStackDrag(engine, e);
        return;
      }
      if (press.kind === 'fixture') beginFixtureMove(engine, press.id);
      else beginMove(engine, press.id);
      if (!placing) {
        press = null;
        return;
      }
      drag = { source: 'room', id: press.id, over: 'room' };
      carryBy = 'pointer';
      setHover(engine, null);
    }
    if (drag?.source === 'stack') moveStackDrag(engine, e);
    else moveDrag(engine, e);
  };
  const onPressUp = (e) => {
    if (!press || e.pointerId !== press.pointerId) return;
    window.removeEventListener('pointermove', onPressMove, true);
    window.removeEventListener('pointerup', onPressUp, true);
    window.removeEventListener('pointercancel', onPressUp, true);
    const was = press;
    press = null;
    if (!was.dragging || !drag) return;
    if (drag.source === 'stack') {
      endStackDrag(engine, e, e.type === 'pointercancel');
      return;
    }
    endDrag(engine, e, { cancelled: e.type === 'pointercancel', overTray: Boolean(ui?.builder?.trayHit(e.clientX, e.clientY)) });
  };
  // RIGHTCLICK (Austin 2026-11-03, audit item 6): in Decorate and Cultivate a right-click on the room
  // selects the piece and shows its actions (the press below takes any button; only the main one
  // drags), so the browser's menu never opens over them (the world's menu neither: game.js
  // worldRightClick stands down while an edit mode is on). QA: canvas data contextMenu home:<kind>.
  root.addEventListener('contextmenu', (e) => {
    if (!mode || !scene || !isCanvas(e)) return;
    e.preventDefault();
    engine.setData('contextMenu', selected ? `home:${selected.kind}:${selected.id}` : '');
  });
  root.addEventListener('pointerdown', (e) => {
    if (!mode || !scene || !isCanvas(e)) return;
    e.stopPropagation();
    e.preventDefault();
    const p = worldPoint(engine, e);
    pointer = { ...p, inside: true };
    if (placing) {
      // Furniture takes room x; cultivations take world x.
      carryBy = 'pointer';
      updateGhost(engine);
      const res = placeAtPointer(engine, placing.kind === 'furniture' ? toRoom(p) : p);
      engine.setData('homeDropLast', res?.ok ? 'placed' : `refused:${res?.reason || ''}`);
      return;
    }
    if (stamping) {
      stampAt(engine, toRoom(p));
      return;
    }
    if (mode === 'decorate' && stackCarry) {
      const id = stackCarry.id;
      stackCarry = null;
      drawPackMarker(engine, null);
      moveStack(engine, id, toRoom(p));
      publish(engine);
      return;
    }
    const stack = mode === 'decorate' ? stackAt(engine, p) : null;
    if (stack) {
      // A stack on a shelf is in front of the shelf: it takes the press first.
      setHover(engine, null);
      selectStack(engine, stack.id);
      if (e.button === 0) {
        press = { kind: 'stack', id: stack.id, x: e.clientX, y: e.clientY, pointerId: e.pointerId, dragging: false };
        window.addEventListener('pointermove', onPressMove, true);
        window.addEventListener('pointerup', onPressUp, true);
        window.addEventListener('pointercancel', onPressUp, true);
      }
    } else if (mode === 'decorate') {
      const item = furnitureAt(toRoom(p));
      selected = item ? { kind: 'furniture', id: item.id } : null;
      drawStackSelection(engine);
      setHover(engine, null);
      renderFurniture(engine);
      renderBar(engine);
      if (item && e.button === 0) {
        press = { id: item.id, x: e.clientX, y: e.clientY, pointerId: e.pointerId, dragging: false };
        window.addEventListener('pointermove', onPressMove, true);
        window.addEventListener('pointerup', onPressUp, true);
        window.addEventListener('pointercancel', onPressUp, true);
      }
    } else if (fixtureAt(engine, p) && selectFixture(engine, fixtureAt(engine, p))) {
      // HOMEMAIL / PORCH: press and drag the Mail Dispatcher, the Mailbox or the Magic Rock, or click it for its actions.
      if (e.button === 0) {
        press = { kind: 'fixture', id: selected.id, x: e.clientX, y: e.clientY, pointerId: e.pointerId, dragging: false };
        window.addEventListener('pointermove', onPressMove, true);
        window.addEventListener('pointerup', onPressUp, true);
        window.addEventListener('pointercancel', onPressUp, true);
      }
    } else {
      const item = cultivationAt(p.x);
      selected = item ? { kind: 'cultivation', id: item.id } : null;
      drawCultivationMarkers(engine);
      renderBar(engine);
    }
    publish(engine);
  }, true);
  const typing = (t) => t?.matches?.('input, textarea, select, [contenteditable="true"]');
  window.addEventListener('keydown', (e) => {
    if (!mode) return;
    if (e.key === 'Escape') {
      if (typing(e.target) && e.target.tagName !== 'SELECT') return;
      // The Pack tab's pack: a stack's menu or an open bag takes Escape first (game.js closes it, as
      // on the street), then Escape leaves as before.
      if (mode === 'decorate' && typeof document !== 'undefined'
        && [document.getElementById('pack-popover'), document.getElementById('pack-bag')].some((n) => n && !n.hidden)) return;
      // G277: an open confirm takes Escape first, as its no (ConfirmationDialog.as closeFromUserInput
      // 102-111 submits escape_value; HouseExpandDialog.as 202-209 sets it false). The bar stays open.
      if (engine.questDialogueOpen?.()) return;
      e.stopImmediatePropagation();
      // The style picker's Escape is its Cancel (FurnUpgradeDialog.as); it used to fall through
      // to deselecting the piece and left the picker open (ticket 52's QA).
      if (upgradePickerOpen()) {
        closeUpgradePicker(true);
        publish(engine);
        return;
      }
      if (drag?.source === 'stack') {
        endStackDrag(engine, e, true);
      } else if (drag || ui?.builder?.dragging) {
        ui?.builder?.cancelDrag();
        cancelCarry(engine);
      } else if (stackCarry) {
        stackCarry = null;
        drawPackMarker(engine, null);
        syncFloating(engine, true);
      } else if (stamping) {
        stopStamping(engine);
        redrawPreview(engine);
        renderBar(engine);
      } else if (placing) {
        cancelCarry(engine);
      } else if (selected) {
        selected = null;
        drawStackSelection(engine);
        if (mode === 'decorate') renderFurniture(engine);
        else drawCultivationMarkers(engine);
        renderBar(engine);
      } else {
        setMode(engine, null);
      }
      publish(engine);
      return;
    }
    if (typing(e.target) || e.ctrlKey || e.metaKey || e.altKey || engine.questDialogueOpen?.()) return;
    const dir = panKey(e.key);
    if (mode === 'cultivate') {
      // CultManager: what you carry rides at your feet while you walk.
      if (dir && placing) {
        carryBy = 'avatar';
        pointer.inside = false;
      }
      return;
    }
    // Shift+D stays the decorate key (game.js): it leaves Decoration Mode.
    if (dir && !(e.shiftKey && (e.key === 'D' || e.key === 'd'))) {
      // The tray's tabs take Left and Right themselves.
      if (e.target?.closest?.('[role="tab"]') && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      if (placing?.kind === 'furniture' && carryBy === 'keys') moveKeyCarry(engine, dir, e.shiftKey);
      else {
        heldPan.add(e.key.length === 1 ? e.key.toLowerCase() : e.key);
        heldFast = e.shiftKey;
      }
      return;
    }
    if (e.key === '[' || e.key === ']') {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (!placing && !stamping) selectAdjacent(engine, e.key === ']' ? 1 : -1);
      return;
    }
    if (e.key === 'Enter' && !e.target?.closest?.('button, a, [role="tab"]')) {
      if (placing && carryBy === 'keys') {
        e.preventDefault();
        ui?.builder?.place?.click();
      } else if (selected && !placing) {
        // Enter reaches the selected piece's actions.
        e.preventDefault();
        ui?.builder?.pop?.querySelector('button:not([disabled])')?.focus();
      }
    }
  }, true);
  window.addEventListener('keyup', (e) => {
    heldPan.delete(e.key.length === 1 ? e.key.toLowerCase() : e.key);
    if (e.key === 'Shift') heldFast = false;
  }, true);
  window.addEventListener('blur', () => heldPan.clear());
}

/**
 * Interior camera. The source room is 471 px from ceiling to floor front,
 * taller than the remake's 408 px location view, and the Tower floors use the
 * source y_cam_offset 220 (tower.js 487), which already frames the avatar
 * lower than a house (anchor 0.867 vs 0.75).
 *
 * Walking: the camera looks up as far as the camera rules allow (feet
 * MIN_GROUND_CLEARANCE above the pack), whatever the room's anchor, so the
 * whole wall shows. (A fixed -62 px was right for a house but put Tower feet
 * 8 px behind the pack; Decorate's fixed -105 px gave -3 / -51.)
 *
 * Decorate: the client's HandOfDecorator hides the avatars (start(): hidePCs),
 * holds them (stops_avatar_on_focus; game.js gameplayInputBlocked) and drives
 * the camera itself (CameraMan decorator_mode: camera_control_pt, bounded to
 * the location): the arrow keys and WASD scroll it across the whole room and
 * between the ceiling band and the floor (maybeScrollVPByKeys, Shift faster),
 * as do the mouse wheel (onMouseWheel, both axes) and a drag held at the
 * stage's edge (maybeScrollVPByDragging, after 500 ms). The camera starts
 * where the avatar stands, framing the floor's front edge just over the tray,
 * looks up to the ceiling band while a ceiling piece or ceiling swatch is in
 * hand or selected, and never leaves the house. Camera Mode's own look wins.
 */
const LOOK_VIEW_H = 408;
/** Ceiling band top (INTERIOR.ceilingTop) shows with this much room above it. */
const CEILING_MARGIN = 14;
let lastLook = { x: 0, y: 0 };
let decorPan = null; // key- or wheel-set look y while decorating (null = automatic)
let decorCamX = null; // the decorate camera's centre x (world), null = where the avatar stands
let hidAvatar = false;
let lastLookTag = '';
let insets = { top: 0, bottom: 0, at: 0 };

/**
 * The interior look offsets for an avatar at `playerY` with a camera anchor:
 * walk = the most look-up that keeps the feet `clearance` above the view
 * bottom; ceiling = the look that puts the ceiling band's top `margin` under
 * the view top. Both negative (up) or 0.
 */
export function interiorLook({ playerY = INTERIOR.floorY, anchor = 0.75, view = LOOK_VIEW_H, clearance = MIN_GROUND_CLEARANCE, ceilingTop = INTERIOR.ceilingTop, margin = CEILING_MARGIN } = {}) {
  // ceil: a whole-pixel look never takes the feet under the clearance (any view height).
  const walk = Math.min(0, Math.ceil(view * anchor - (view - clearance)));
  const ceiling = Math.min(walk, Math.round(ceilingTop - margin - playerY + view * anchor));
  return { walk, ceiling };
}

function roomAnchor(engine) {
  const offset = Number(engine?.street?.physics?.setting?.y_cam_offset);
  return yCamOffsetAnchor(Number.isFinite(offset) ? offset : 150);
}

/** A ceiling piece or the ceiling swatch is in hand or selected. */
function ceilingInHand() {
  if (stamping?.kind === 'ceiling') return true;
  if (placing?.kind === 'furniture' && FURNITURE_CATALOG[placing.classTsid]?.slot === 'ceiling') return true;
  if (selected?.kind === 'furniture') return decor?.placed?.find((row) => row.id === selected.id)?.slot === 'ceiling';
  return false;
}

function setAvatarHidden(engine, hide) {
  const p = engine?.player;
  if (!p) return;
  if (hide && !hidAvatar) {
    p.visible = false;
    hidAvatar = true;
  } else if (!hide && hidAvatar) {
    p.visible = true;
    hidAvatar = false;
  }
}

/** How much of the view the banner and the tray cover, in world px (measured four times a second). */
function decorInsets(engine, now = Date.now()) {
  if (now - insets.at < 250) return insets;
  const f = canvasFrame(engine);
  const r = ui?.builder?.roomRect?.();
  insets = f && r
    ? { top: Math.max(0, (r.top - f.rect.top) * f.k), bottom: Math.max(0, (f.rect.bottom - r.bottom) * f.k), at: now }
    : { top: 0, bottom: 0, at: now };
  return insets;
}

/** The held keys and a drag at the stage's edge move the decorate camera (dt in ms). */
function tickDecorPan(engine, range, dtMs) {
  const frames = Math.min(4, Math.max(0.25, (Number(dtMs) || 16.7) / 16.7));
  const speed = (heldFast ? PAN_SPEED.fast : PAN_SPEED.normal) * frames;
  let { dx, dy } = panDirection(heldPan);
  dx *= speed;
  dy *= speed;
  const dragging = Boolean(lastClient && (drag || packDrag));
  if (dragging) {
    const edge = edgePan(lastClient.x, lastClient.y, ui?.builder?.roomRect?.());
    const now = Date.now();
    if (edge.dx || edge.dy) {
      if (!edgeSince) edgeSince = now;
      if (now - edgeSince > EDGE_DELAY_MS) {
        dx += edge.dx * PAN_SPEED.normal * frames;
        dy += edge.dy * PAN_SPEED.normal * frames;
      }
    } else edgeSince = 0;
  }
  if (!dx && !dy) return false;
  const span = roomSpan();
  const before = { x: decorCamX, y: decorPan };
  decorCamX = clampRoomX((decorCamX ?? engine.player?.x ?? 0) + dx, { left: span.left, right: span.right, view: engine.camera?.w || 960 });
  if (dy) decorPan = Math.max(range.lo, Math.min(range.hi, Math.round((decorPan ?? (ceilingInHand() ? range.ceiling : range.floor)) + dy)));
  if (dragging && drag && (before.x !== decorCamX || before.y !== decorPan)) {
    // The room slid under a still pointer: what you carry stays under it.
    const f = canvasFrame(engine);
    if (f && drag.over === 'room') {
      pointer = { ...worldPoint(engine, { clientX: lastClient.x, clientY: lastClient.y }), inside: true };
      updateGhost(engine);
    }
  }
  return true;
}

function interiorCameraLook(engine, dtMs) {
  if (typeof engine?.setCameraLook !== 'function') return;
  const decorating = mode === 'decorate';
  setAvatarHidden(engine, decorating);
  const playerY = engine.player?.y ?? INTERIOR.floorY;
  const anchor = roomAnchor(engine);
  const view = engine.camera?.h || LOOK_VIEW_H;
  const look = interiorLook({ playerY, anchor, view });
  let wantX = 0;
  let wantY = look.walk;
  let kind = 'walk';
  if (!decorating) {
    decorPan = null;
    decorCamX = null;
    heldPan.clear();
  } else {
    const ins = decorInsets(engine);
    const range = decorLook({ playerY, anchor, view, top: ins.top, bottom: ins.bottom, ceilingTop: INTERIOR.ceilingTop, floorFront: INTERIOR.floorFront });
    tickDecorPan(engine, range, dtMs);
    const auto = ceilingInHand() ? range.ceiling : range.floor;
    wantY = decorPan != null ? Math.max(range.lo, Math.min(range.hi, decorPan)) : auto;
    kind = decorPan != null ? 'pan' : wantY === range.floor ? 'walk' : 'ceiling';
    const span = roomSpan();
    decorCamX = clampRoomX(decorCamX ?? engine.player?.x ?? span.left, { left: span.left, right: span.right, view: engine.camera?.w || 960 });
    wantX = Math.round(decorCamX - (engine.player?.x ?? 0));
  }
  const tag = `${kind}:${wantY}${hidAvatar ? ':hidden' : ''}`;
  if (tag !== lastLookTag) engine.setData('homeCameraLook', (lastLookTag = tag));
  engine.setData('homeCameraX', decorating ? String(decorCamX) : '');
  const now = engine.cameraLook || { x: 0, y: 0 };
  const ours = (now.x === 0 && now.y === 0) || (now.x === lastLook.x && now.y === lastLook.y);
  if (!ours || (now.x === wantX && now.y === wantY)) return;
  engine.setCameraLook(wantX, wantY);
  lastLook = { x: wantX, y: wantY };
}

/** HandOfDecorator onMouseWheel: pan the decorate camera both ways (Shift turns a vertical wheel sideways). */
function panDecorCamera(engine, deltaX, deltaY, sideways = false) {
  if (mode !== 'decorate' || scene?.room !== 'interior') return false;
  const dx = sideways && !deltaX ? deltaY : deltaX;
  const dy = sideways && !deltaX ? 0 : deltaY;
  if (dx) {
    const span = roomSpan();
    decorCamX = clampRoomX((decorCamX ?? engine.player?.x ?? 0) + Math.sign(dx) * Math.min(80, Math.max(10, Math.abs(dx))), { left: span.left, right: span.right, view: engine.camera?.w || 960 });
  }
  if (dy) {
    const playerY = engine.player?.y ?? INTERIOR.floorY;
    const ins = decorInsets(engine);
    const range = decorLook({ playerY, anchor: roomAnchor(engine), view: engine.camera?.h || LOOK_VIEW_H, top: ins.top, bottom: ins.bottom, ceilingTop: INTERIOR.ceilingTop, floorFront: INTERIOR.floorFront });
    const from = decorPan ?? (ceilingInHand() ? range.ceiling : range.floor);
    decorPan = Math.max(range.lo, Math.min(range.hi, Math.round(from + Math.sign(dy) * Math.min(60, Math.max(10, Math.abs(dy))))));
  }
  return true;
}

function releaseCameraLook(engine) {
  setAvatarHidden(engine, false);
  decorPan = null;
  decorCamX = null;
  heldPan.clear();
  const now = engine?.cameraLook;
  if ((lastLook.x || lastLook.y) && now && now.x === lastLook.x && now.y === lastLook.y) engine.setCameraLook(0, 0);
  lastLook = { x: 0, y: 0 };
}

/**
 * The house's side walls (inc_homes.js walls 76 px inside each end; tower.js
 * floor_start 130). A house with its back yard is open on the left
 * (homes_rebuild_floor left-open): the yard's far end is the bound, and the
 * house's left end is a wall only above the way in (the outer wall over the
 * frame_open post, homes_rebuild_rooms 619-633), so a jump cannot carry you
 * through it.
 */
let lastWallX = null;
function keepInsideWalls(engine) {
  const room = scene?.background?.room;
  const p = engine.player;
  if (!room || !p || !Number.isFinite(p.x)) return;
  const x0 = roomX0();
  if (room.leftOpen) {
    const wallX = x0 + 8;
    const was = lastWallX;
    if (was != null && (was < wallX) !== (p.x < wallX) && p.y - AVATAR_HEAD < room.openTop) {
      p.x = was < wallX ? wallX - 1 : wallX + 1;
      p.vx = 0;
    }
  }
  const lo = room.leftOpen ? 12 : x0 + room.innerLeft + 12;
  const hi = x0 + room.innerRight - 12;
  if (p.x < lo) {
    p.x = lo;
    if (p.vx < 0) p.vx = 0;
  } else if (p.x > hi) {
    p.x = hi;
    if (p.vx > 0) p.vx = 0;
  }
  lastWallX = p.x;
}

// ---------------------------------------------------------------------------
// Wear from use on the home street
// ---------------------------------------------------------------------------

function wearFromEvent(engine, counter) {
  if (!scene || (scene.room !== 'street' && !inHouse())) return;
  let kinds = null;
  if (/^rock_[a-z]+_\d+:mine$/.test(counter)) kinds = ['rock'];
  else if (/^(garden_harvest|herb_harvest):/.test(counter)) kinds = ['garden'];
  if (!kinds) return;
  const item = nearestCultivation(engine, kinds);
  if (!item) return;
  wearItem(engine, item.id, 1);
}

/** One use of a cultivation (addWear); a worn-out one becomes its proto. */
function wearItem(engine, id, n = 1, st = activeCult()) {
  const result = addWear(st, id, n, qaWear(engine));
  if (result.depleted) {
    // include/garden.js onDepleted + harvest (580-584), countEmptyPlots: a worn-out garden
    // with plots still growing stays until they are picked; its empty plots show the
    // depleted soil (GardenPlotView mature_level 5).
    const garden = st.gardens?.[id];
    if (garden?.plots && Object.values(garden.plots).some((p) => p && p.state !== 'clean' && p.state !== 'dirty')) {
      if (!garden.depleted) {
        garden.depleted = true;
        engine.save();
        engine.refreshHomeScene?.();
      }
      return result;
    }
    depleteItem(engine, id, {}, st);
    engine.refreshHomeScene?.();
  }
  return result;
}

/**
 * MPVISIT (features/yard-verbs-mp-feature.js): a visitor's swing at a rock on
 * my home street wears its cultivation as my own swing does (wearFromEvent);
 * a worn-out one turns into its proto. Returns addWear's answer, or null.
 */
export function wearHomeCultivation(engine, itemId, n = 1) {
  if (!cult.items.some((row) => row.id === Number(itemId) && !row.depleted)) return null;
  return wearItem(engine, Number(itemId), n, cult);
}

function wearFromNodes(engine, now) {
  if (!scene || (scene.room !== 'street' && !inHouse()) || now - lastNodeCheck < 2000) return;
  lastNodeCheck = now;
  const st = activeCult();
  const slot = engine.streetSlot('resource-nodes', yardTsid(st));
  const keys = nodeKeyMap(st.items, now);
  for (const item of [...st.items]) {
    const nodeKeys = keys.get(item.id) || [];
    if (!nodeKeys.length) continue;
    const used = nodeKeys.reduce((sum, key) => sum + (slot.nodes?.[key]?.totalHarvests || 0), 0);
    if (used > item.wear) {
      const result = wearItem(engine, item.id, used - item.wear, st);
      if (result.depleted) return;
    }
  }
}

// ---------------------------------------------------------------------------
// QA demo + autoplay
// ---------------------------------------------------------------------------

/** QA &homefurniture=furniture_rug,furniture_painting: one of each into furniture storage, once. */
let demoFurnitureDone = false;
function demoFurniture(engine) {
  const raw = String(engine.param('homefurniture') || '');
  if (demoFurnitureDone || !raw) return;
  demoFurnitureDone = true;
  for (const cls of raw.split(',').map((c) => c.trim())) {
    if (furnitureDef(cls)) houseDecor.storage[cls] = (houseDecor.storage[cls] || 0) + 1;
  }
}

/**
 * QA (G153): &homefloordemo=door puts a Door in furniture storage and 100
 * Planks in the pack and opens Decorate on the ground floor; =built also
 * builds the second floor at once (a Door at room x 600 and its floor).
 */
let floorDemoDone = false;
function floorDemo(engine) {
  const want = String(engine.param('homefloordemo') || '');
  if (!want || floorDemoDone || houseFloorHere() !== 0) return;
  floorDemoDone = true;
  if (want === 'built' && floorCount(floors) === 1 && !floors.pending) {
    houseDecor.placed.push({ id: houseDecor.nextId++, classTsid: DOOR_CLASS, slot: 'floor', x: 600, y: INTERIOR.floorY, facingRight: true, z: 1, on: null });
    noteDoorPlaced(floors, 0, houseDecor.nextId - 1);
    addFloor(floors, houseDecor);
    doorLast = 'demo:built';
    engine.save();
    setTimeout(() => engine.refreshHomeScene?.(), 0);
    return;
  }
  if (floorCount(floors) === 1 && !floors.pending && !decor.placed.some((row) => row.classTsid === DOOR_CLASS)) {
    houseDecor.storage[DOOR_CLASS] = Math.max(1, houseDecor.storage[DOOR_CLASS] || 0);
  }
  engine.inv.plank = Math.max(100, engine.inv.plank || 0);
  engine.refreshPack?.();
  engine.updateHud?.();
  doorLast = 'demo:door';
  setMode(engine, 'decorate');
}

function demoSetup(engine) {
  floorDemo(engine);
  demoFurniture(engine);
  // QA: &homestyledemo=open opens Change Style on the home street once.
  if (!styleDialogDemoDone && scene?.room === 'street' && engine.param('homestyledemo') === 'open') {
    styleDialogDemoDone = true;
    setTimeout(() => openStyleDialog(engine), 300);
  }
  // QA: &wotddemo=N puts N Wine of the Dead in the pack (the pour pack verb) and,
  // on the home street, stands you 120 px left of the first rock, garden or patch
  // (else the Tower). &wotdtarget=patch picks the yard's Patch, and
  // &wotdtree=<trant class> (trant_bean, wood_tree ...) grows a tree on it first.
  const wotd = Math.floor(Number(engine.param('wotddemo')) || 0);
  const wotdTree = engine.param('wotdtree');
  if (wotd > 0 && wotdTree && GROWN_TREE_LABELS[wotdTree] && scene?.room === 'street' && !wotdTreeDone) {
    const patch = cult.items.find((row) => !row.depleted && cultivationDef(row.protoClass)?.kind === 'patch');
    const key = patch && soilKeyMap(cult.items).get(patch.id)?.[0];
    if (key) {
      wotdTreeDone = true;
      const slot = engine.streetSlot('patches', yardTsid(cult));
      const now = Date.now();
      const plot = createPlot(patch.endClass, { now, seed: key });
      plot.stage = 'seedling';
      plot.seedling = { trantClass: wotdTree, beanClass: 'bean_bean', plantedAt: now, minAt: now, maxAt: now, upgradeGrowLevel: 0, petted: 3, petters: 0, growLevel: 4, thirdPetAt: now };
      growTree(plot, now);
      slot.plots = { ...(slot.plots || {}), [key]: plot };
      engine.save();
      setTimeout(() => engine.refreshHomeScene?.(), 0);
    }
  }
  if (wotd > 0 && !wotdDemoDone) {
    wotdDemoDone = true;
    if (countItem(engine.inv, WOTD) < wotd) engine.inv[WOTD] = wotd;
    engine.updateHud();
  }
  if (wotd > 0 && scene?.room === 'street' && !wotdPlaced) {
    const wantPatch = engine.param('wotdtarget') === 'patch' || Boolean(wotdTree);
    const item = (wantPatch && cult.items.find((row) => !row.depleted && cultivationDef(row.protoClass)?.kind === 'patch'))
      || cult.items.find((row) => !row.depleted && cultivationDef(row.protoClass)?.kind !== 'tower') || towerItem(cult);
    if (item && engine.player) {
      wotdPlaced = true;
      setTimeout(() => {
        if (!engine.player || scene?.room !== 'street') return;
        engine.player.x = cultivationWorldX(item) - 120;
        engine.snapCamera?.();
        engine.setData('homePourDemo', `${item.id}:${cultivationDef(item.protoClass).label}`);
      }, 800);
    }
  }
  // QA: &homeyarddemo=cultivate (with homedemo=interior): a lived-in back yard, Cultivate open.
  if (!yardDemoDone && inHouse() && engine.param('homeyarddemo') === 'cultivate') {
    yardDemoDone = true;
    if ((engine.pc.level || 1) < 12) {
      engine.pc.xp = Math.max(engine.pc.xp || 0, XP_FOR_LEVEL[10]);
      engine.pc.level = 12;
    }
    const auto = String(engine.param('homeautoplay') || '');
    // =max: enough iMG for every expansion left (Landgrabber's yard half).
    engine.pc.imagination = Math.max(engine.pc.imagination || 0, auto === 'max' ? 40_000 : 20_000);
    engine.updateHud();
    const go = () => {
      setMode(engine, 'cultivate');
      if (auto === '1') runCultivateAutoplay(engine);
      else if (auto === 'max') runYardMaxAutoplay(engine);
    };
    if (!backCult.items.length) {
      cultivateDemoYard(backCult, Date.now() - 5 * 60_000);
      engine.save();
      setTimeout(() => engine.refreshHomeScene?.().then(go), 0);
      return;
    }
    go();
    return;
  }
  if (demoDone || !scene) return;
  const demo = String(engine.param('homedemo') || '').toLowerCase();
  if (demo !== 'decorate' && demo !== 'cultivate') return;
  demoDone = true;
  if (demo === 'decorate' && scene.room === 'interior') {
    if (decor.wall === 'grey_unfinished' && decor.floor === 'starter_crappy') {
      // First run: tidy the starter layout away and show a finished room.
      for (const row of [...decor.placed]) if (placedItem(decor, row.id)) pickUpFurniture(decor, row.id);
      furnishDemoRoom(decor);
      setHomeTexture(decor, 'wall', 'creamy_stripes');
      setHomeTexture(decor, 'floor', 'woodpanel');
      setHomeTexture(decor, 'ceiling', 'whitewood_ceiling');
    }
    decor.storage.furniture_armchair = (decor.storage.furniture_armchair || 0) + 1;
    // QA (BUILDER): &homesegments=N grows the demo house to N wall segments (up to 20) through the expand rules.
    const wantSegs = Math.min(20, Math.floor(Number(engine.param('homesegments')) || 0));
    let grew = false;
    while (!inTower() && decor.wallSegments < wantSegs) {
      engine.inv.wall_segment = (engine.inv.wall_segment || 0) + floorCount(floors);
      if (!expandHouseFloors(floors, houseDecor, engine.inv).ok) break;
      grew = true;
    }
    if (grew) setTimeout(() => engine.refreshHomeScene?.(), 0);
    engine.inv.musicblock_d_blue_05 = Math.max(3, engine.inv.musicblock_d_blue_05 || 0);
    engine.inv.wall_segment = Math.max(1, engine.inv.wall_segment || 0);
    scene.background?.redraw?.();
    renderFurniture(engine);
    setMode(engine, 'decorate');
    if (engine.param('homeautoplay') === '1') runDecorateAutoplay(engine);
    else if (engine.param('furnupautoplay')) runFurnUpAutoplay(engine, String(engine.param('furnupautoplay')));
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
          else if (String(engine.param('homeautoplay') || '').startsWith('restore')) runRestoreAutoplay(engine);
        });
      }, 0);
      return;
    }
    setMode(engine, 'cultivate');
    if (engine.param('homeautoplay') === '1') runCultivateAutoplay(engine);
    else if (String(engine.param('homeautoplay') || '').startsWith('restore')) runRestoreAutoplay(engine);
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
    ['segment', () => applySwatch(engine, 'wall', 'red_brick', { segment: 3 })],
    ['floor', () => applySwatch(engine, 'floor', 'woodpanel_3_floor')],
    ['ceiling', () => applySwatch(engine, 'ceiling', 'wood')],
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
  const cultivateStep = ['cultivate', () => {
    const st = activeCult();
    beginCultivate(engine, 'proto_dirt_pile');
    const layout = homeStreetLayout(st);
    const tries = isBackYard(st) ? [-1050, -1250, -900, -1400] : [-420, -260, 1500, 640, 900];
    const rx = tries.find((x) => placementCheck(st, 'proto_dirt_pile', x).ok) ?? (isBackYard(st) ? nearestFreeRx(st, 'proto_dirt_pile', tries[0]) : null) ?? 600;
    placeAtPointer(engine, { x: layout.houseX + rx, y: yardGroundY(st) });
  }, 1500];
  const removeStep = ['remove', () => {
    const st = activeCult();
    const last = st.items[st.items.length - 1];
    if (!last) return;
    selected = { kind: 'cultivation', id: last.id };
    removeSelected(engine);
  }, 1500];
  // The demo back yard is full: expand it first, then cultivate the new ground.
  if (isBackYard(activeCult())) {
    step([['expand', () => growYard(engine, 'left'), 1500], cultivateStep, removeStep], engine);
    return;
  }
  step([cultivateStep, ['expand', () => growYard(engine, 'right'), 1500], removeStep], engine);
}

/** QA &homeyarddemo=cultivate&homeautoplay=max: buy every back-yard expansion left, one a step. */
function runYardMaxAutoplay(engine) {
  const left = Math.max(0, quoteYardExpansion(backCult, engine.pc).count || 0);
  step(Array.from({ length: left }, (_, i) => [`expand:${i + 1}`, () => growYard(engine, 'left'), 900]), engine);
}

/**
 * QA &homeautoplay=restore: wear the Metal Rock out through addWear (the same
 * path mining takes), show its proto, then seed and run its Restore project
 * through the street-jobs panel (items, two real work units, Hire a hand) to
 * the restored rock. =restorehold stops on the proto, =restoreaward on the award.
 */
function runRestoreAutoplay(engine) {
  const how = String(engine.param('homeautoplay'));
  let target = null;
  let jobId = '';
  let started = false;
  const say = (label) => engine.setData('homeAutoplay', label);
  const tick = () => {
    if (!scene) {
      autoplay = setTimeout(tick, 500);
      return;
    }
    if (!target) {
      target = cult.items.find((row) => row.protoClass === 'proto_metal_rock') || liveItems(cult.items).find((row) => cultivationDef(row.protoClass)?.kind === 'rock');
      if (!target) return say('error:no rock');
      setMode(engine, null);
      say('wear');
      autoplay = setTimeout(tick, 1200);
      return;
    }
    if (started && !target.depleted) {
      // Restored: the project's onDone put the rock back.
      const award = Boolean(document.querySelector('#award-screen:not([hidden])'));
      say(award ? 'award' : 'done');
      if (award && how !== 'restoreaward') autoplay = setTimeout(tick, 500);
      return;
    }
    if (!target.depleted) {
      wearItem(engine, target.id, Math.max(1, usesLeft(target, qaWear(engine))));
      say('proto');
      autoplay = setTimeout(tick, how === 'restorehold' ? 0 : 3500);
      return;
    }
    if (how === 'restorehold') return say('proto');
    jobId = restoreJobId(target);
    if (!projectApi.registered(jobId)) {
      autoplay = setTimeout(tick, 500);
      return;
    }
    if (!started) {
      started = true;
      projectApi.open(engine, jobId);
      projectApi.autoplay(engine, jobId, { hold: how === 'restoreaward' });
      say('project');
      autoplay = setTimeout(tick, 800);
      return;
    }
    say(`project:${projectApi.autoplayStage()}`);
    autoplay = setTimeout(tick, 600);
  };
  autoplay = setTimeout(tick, 900);
}

// ---------------------------------------------------------------------------
// Another player's home, for a visitor (G328, multiplayer)
// ---------------------------------------------------------------------------

/** G328: the homes slice a visitor is shown, normalized as restore() does (no rock; MPVISIT: the Tower and its floors). */
export function visitorHomeState(view = {}) {
  const slice = view?.homes && typeof view.homes === 'object' ? view.homes : {};
  const style = ['meadow', 'firebog', 'uralia'].includes(view?.home?.style) ? view.home.style : 'meadow';
  const tower = normalizeTowerState(slice.tower || {});
  return {
    tower,
    towerDecor: (Array.isArray(slice.towerDecor) ? slice.towerDecor : [])
      .slice(0, TOWER_CONFIG.MAX_FLOORS)
      .map((row) => normalizeHomeDecorState({ ...row, wallSegments: TOWER_GEO.wallSegments, layout: 'tower', starterKit: true })),
    style,
    decor: normalizeHomeDecorState(slice.decor || {}),
    cult: normalizeCultivationState(slice.cult || {}),
    backCult: createBackYardState(slice.backYard || {}),
    streetStyle: STREET_STYLE_BY_KEY[slice.streetStyle]?.built ? slice.streetStyle : null,
    yardStyle: YARD_STYLE_BY_KEY[slice.yardStyle]?.built ? slice.yardStyle : null,
  };
}

/**
 * Runs fn with this module's home state swapped for the owner's (`v`), and
 * puts the player's own back before it returns, whatever fn does: the
 * builders above read the module's state, and a visit must never touch the
 * visitor's own home.
 */
function withOwnersHome(v, fn) {
  const keep = { decor, houseDecor, cult, backCult, streetStyle, yardStyle, stylePreview, yardPreview, scene, mode };
  try {
    decor = v.decor;
    houseDecor = v.decor;
    cult = v.cult;
    backCult = v.backCult;
    streetStyle = v.streetStyle;
    yardStyle = v.yardStyle;
    stylePreview = null;
    yardPreview = null;
    scene = null;
    mode = null;
    return fn();
  } finally {
    ({ decor, houseDecor, cult, backCult, streetStyle, yardStyle, stylePreview, yardPreview, scene, mode } = keep);
  }
}

/** A still of a rock's first frame (mining's sheet), as spawnMineRock draws it, without its slot. */
function rockStill(PIXI, endClass) {
  const def = ROCK_CATALOG[rockClassFor(endClass)] || ROCK_CATALOG.rock_metal_1;
  const source = sourceFromUrl(`${def.worldSheet}?v=exact-rock-cells-1`);
  const spr = new PIXI.Sprite(PIXI.Texture.EMPTY);
  spr.anchor.set(0.5, 1);
  spr.scale.set(0.85);
  onLoaded(source, () => {
    if (!spr.destroyed) spr.texture = frameTexture(source, new PIXI.Rectangle(0, 0, def.frameWidth, def.frameHeight));
  });
  return spr;
}

/**
 * The owner's cultivations as they stand, for a visitor: rocks, pods, mounds
 * and hives, worn-out protos, and gardens with their crops (the garden path,
 * detached, a copy of the owner's plots). Display only: the visitor's
 * features own none of it (features/neighbours-mp-feature.js answers their
 * menus). On the home street (`opts.liveRocks`) the rocks are left to
 * yard-verbs-mp-feature, which draws them and the resource nodes as the
 * site has them, to mine and harvest; Patches are that feature's too.
 */
function drawVisitorYard(engine, st, groundY, houseX, opts = {}) {
  const { PIXI } = engine;
  const layer = engine.entityLayer;
  const targets = [];
  for (const item of st.items) {
    const def = cultivationDef(item.protoClass);
    if (def?.kind === 'tower' && opts.tower) {
      // MPVISIT: the owner's Tower (built: its chassis and sign; else the scaffolding).
      const built = item.endClass === TOWER_CHASSIS && opts.tower.built;
      opts.towerSpot = { box: visitorTowerView(engine, opts.tower, { x: houseX + item.rx, groundY, built }), built };
      continue;
    }
    if (!def || def.kind === 'tower') continue;
    const x = houseX + item.rx;
    if (item.depleted) {
      const art = PROTO_DEPLETED_ART[item.protoClass];
      if (!art) continue;
      const [file, ox, oy, w, h] = art;
      const spr = new PIXI.Sprite(textureFromUrl(`assets/sprites/cultivation/proto/${file}`));
      spr.anchor.set(ox / w, oy / h);
      spr.width = w;
      spr.height = h;
      spr.x = x;
      spr.y = groundY + 6;
      spr.zIndex = 14;
      layer.addChild(spr);
      continue;
    }
    if (def.kind === 'rock') {
      // MPVISIT: the home street's rocks are minable on a visit (yard-verbs-mp-feature draws them).
      if (opts.liveRocks) continue;
      const spr = rockStill(PIXI, item.endClass);
      spr.x = x;
      spr.y = groundY;
      spr.zIndex = 22;
      layer.addChild(spr);
      continue;
    }
    if (def.kind === 'garden' && engine.spawnGarden) {
      const garden = st.gardens[item.id] ? JSON.parse(JSON.stringify(st.gardens[item.id])) : null;
      const target = engine.spawnGarden({
        x,
        y: groundY + 2,
        gardenType: def.gardenType,
        cols: def.cols,
        rows: def.rows,
        label: def.label.replace(/^S\. |^M\. |^L\. /, ''),
        garden,
        detached: true,
      });
      if (target) targets.push(target);
      continue;
    }
    if (def.art && POD_ART[def.art]) {
      const art = POD_ART[def.art];
      const spr = new PIXI.Sprite(textureFromUrl(`assets/sprites/cultivation/${def.art}.png`));
      spr.anchor.set(0.5, 1);
      spr.x = x;
      spr.y = groundY + 6;
      spr.zIndex = 14;
      spr.width = art.w;
      spr.height = art.h;
      layer.addChild(spr);
    }
  }
  return targets;
}

/**
 * G328: a real player's home street or house as they keep it, for a visitor
 * in multiplayer (features/neighbours-mp-feature.js). `view` is the site's
 * answer (groddle-afternoon-site src/Neighbours.php: the owner's homes slice
 * and home style, read from the owner's save, never the visitor's), `room`
 * 'street' or 'interior'. Returns the scene for engine.enterScene (the same
 * walk line, width and house as the owner's own scene, so both stand in the
 * same places) and `populate(engine)`, which draws what stands there and
 * returns { door, gate } spots for the caller's own targets (`gate` is the
 * signpost, its top arm Back to Ur; `opts.returnLabel` names where it leads). The visitor's
 * own home state is put back before this returns.
 */
export function visitorHomeScene(engine, view = {}, room = 'street', opts = {}) {
  const v = visitorHomeState(view);
  const shim = Object.create(engine, {
    homeContext: { value: () => ({ inHome: false, room, owned: true, style: v.style, returnLabel: opts.returnLabel || '', unread: 0 }) },
  });
  if (room === 'tower') {
    // MPVISIT: a floor of the owner's Tower (towerFloorScene, read-only: furniture_base's verbs are the owner's).
    const floor = Math.max(0, Math.min(Math.max(0, v.tower.floors - 1), Math.floor(Number(opts.floor) || 0)));
    return withOwnersHome(v, () => {
      decor = v.towerDecor[floor] || createHomeDecorState({
        wall: TOWER_CONFIG.START_TEXTURE_WALL,
        floor: TOWER_CONFIG.START_TEXTURE_FLOOR,
        ceiling: TOWER_CONFIG.START_TEXTURE_CEILING,
        wallSegments: TOWER_GEO.wallSegments,
        layout: 'tower',
        starterKit: true,
      });
      const floorDecorNow = decor;
      const background = interiorBackground(shim, {});
      const width = interiorWidth(floorDecorNow);
      const furniture = renderOrder(floorDecorNow).map((item) => ({ ...item }));
      return {
        width,
        height: background.worldH,
        groundY: GROUND_Y,
        background,
        platforms: background.platformsScreen,
        // tower_get_teleport_point (w - 150) from outside; the elevator (x 200) between floors.
        spawnX: opts.via === 'elevator' ? TOWER_GEO.elevatorX + 70 : TOWER_GEO.arriveX,
        floor,
        populate(eng) {
          const { PIXI } = eng;
          const layers = addFurnitureLayers(eng, 0);
          furniture.forEach((item, i) => {
            const box = furnitureView(PIXI, item);
            box.zIndex = i;
            furnitureHolder(layers, item).addChild(box);
          });
          const elevator = drawTowerElevator(eng, { floor, groundY: GROUND_Y });
          const exit = floor === 0 ? drawTowerExit(eng, { doorX: TOWER_GEO.exitX, groundY: GROUND_Y }) : null;
          return { elevator, exit, gardens: [] };
        },
      };
    });
  }
  if (room === 'interior') {
    return withOwnersHome(v, () => {
      const background = interiorBackground(shim, { yard: true });
      const x0 = background.houseX;
      const roomW = interiorWidth(v.decor);
      const width = x0 + roomW;
      const doorX = x0 + interiorDoorX();
      const furniture = renderOrder(v.decor).map((item) => ({ ...item }));
      const yard = v.backCult;
      return {
        width,
        height: background.worldH,
        groundY: GROUND_Y,
        background,
        platforms: background.platformsScreen,
        spawnX: doorX - 80,
        doorX,
        populate(eng) {
          const { PIXI } = eng;
          // The owner's ceiling pieces hang over every visitor, as in your own house (FG_FURN).
          const layers = addFurnitureLayers(eng, x0);
          // HOMES3: each piece's box, so a sale can take it away (home-street-mp-feature).
          const pieces = [];
          furniture.forEach((item, i) => {
            const box = furnitureView(PIXI, item);
            box.zIndex = i;
            furnitureHolder(layers, item).addChild(box);
            pieces.push({ item, box });
          });
          const spec = background.room?.door || { piece: 'door_asset_entry_basic', x: interiorDoorX(), y: GROUND_Y + 18, w: 75, h: 236 };
          const door = new PIXI.Sprite(textureFromUrl(pieceUrl(spec.piece, wantsHiresPieces(eng))));
          door.anchor.set(0.5, 1);
          door.width = spec.w;
          door.height = spec.h;
          door.x = x0 + spec.x;
          door.y = spec.y;
          door.zIndex = 8;
          eng.entityLayer.addChild(door);
          const gardens = drawVisitorYard(eng, yard, BACK_YARD_GROUND_Y, homeStreetLayout(yard).houseX);
          return { door, gardens, pieces, roomX: x0 };
        },
      };
    });
  }
  return withOwnersHome(v, () => {
    const background = streetBackground(shim, shownStreetStyle(shim), v.style);
    const layout = homeStreetLayout(v.cult);
    const st = v.cult;
    return {
      width: layout.width,
      height: STREET_WORLD_H,
      groundY: STREET_GROUND_Y,
      background,
      platforms: background.platformsScreen,
      spawnX: layout.lotLeft + 130,
      doorX: background.houseDoorX,
      populate(eng) {
        const { PIXI } = eng;
        const mailbox = new PIXI.Sprite(textureFromUrl('assets/sprites/mailbox/npc_mailbox_variant_mailboxRight_x1_idle_png_1354832227.png'));
        mailbox.anchor.set(0.5, 1);
        // PORCH: where the owner moved it (their street's cultivation state), else the house's sign corner.
        const usual = Math.round(background.houseSignX ?? layout.houseX - 260);
        const moved = fixtureRx(st, 'mailbox', { at: { mailboxX: usual, doorway: background.houseDoorway } });
        mailbox.x = moved == null ? usual : layout.houseX + moved;
        mailbox.y = STREET_GROUND_Y + 4;
        mailbox.zIndex = 30;
        eng.entityLayer.addChild(mailbox);
        const door = new PIXI.Graphics();
        door.rect(-46, -150, 92, 150).fill({ color: 0xffffff, alpha: 0.001 });
        door.x = background.houseDoorX;
        door.y = STREET_GROUND_Y;
        door.zIndex = 9;
        eng.entityLayer.addChild(door);
        // The same one signpost; its Back to Ur takes the visitor back where they came from (neighbours-mp-feature).
        const gate = makeHomeSignpost(eng);
        gate.x = signpostX(layout);
        gate.y = STREET_GROUND_Y + 2;
        gate.zIndex = 20;
        eng.entityLayer.addChild(gate);
        const yardOpts = { liveRocks: true, tower: v.tower };
        const gardens = drawVisitorYard(eng, st, STREET_GROUND_Y, layout.houseX, yardOpts);
        return { door, gate, mailbox, gardens, tower: yardOpts.towerSpot || null };
      },
    };
  });
}

// ---------------------------------------------------------------------------
// The scene contract for game.js renderHomeScene
// ---------------------------------------------------------------------------

/** QA: ?homex= arrival point (interior x, or street x relative to the house). */
function homeX(engine) {
  const raw = engine.param('homex');
  return raw != null && raw !== '' && Number.isFinite(Number(raw)) ? Number(raw) : null;
}

/**
 * Rows saved on the home street before it grew taller stand on the old walk
 * line; move the ones there (within 40 px) down onto the new one. Pure; returns
 * how many rows moved.
 */
export function liftOldStreetRows(rows, fromGround = OLD_STREET_GROUND_Y, toGround = STREET_GROUND_Y) {
  if (!Array.isArray(rows) || fromGround === toGround) return 0;
  let moved = 0;
  for (const row of rows) {
    const y = Number(row?.y);
    if (!Number.isFinite(y) || y > fromGround + 40 || y < fromGround - 40) continue;
    row.y = Math.round(y + (toGround - fromGround));
    moved += 1;
  }
  return moved;
}

/**
 * Once per save: dropped stacks (game.js world items) and Animal Husbandry's
 * Guano / Piggy Plop piles keep a y; the rest of the street snaps to the ground.
 */
function liftOldStreetSave(engine) {
  if (savedStreetGround === STREET_GROUND_Y) return;
  const from = savedStreetGround;
  savedStreetGround = STREET_GROUND_Y;
  let moved = liftOldStreetRows(engine.droppedItems?.streets?.[HOME_STREET_TSID], from);
  const husbandry = engine.streetSlot?.('animal-husbandry', HOME_STREET_TSID);
  moved += liftOldStreetRows(husbandry?.guano, from) + liftOldStreetRows(husbandry?.plops, from);
  if (moved) engine.save?.();
}

function towerFloorScene(engine, floor) {
  const construction = towerApi.isConstructionFloor(floor);
  decor = construction ? constructionDecor() : towerFloorDecor(floor);
  const background = interiorBackground(engine, { construction });
  const width = interiorWidth(decor);
  const via = towerApi.takeFloorArrival();
  return {
    width,
    groundY: GROUND_Y,
    background,
    spawnFor(opts = {}) {
      if (opts.arrive === 'exact' && Number.isFinite(opts.spawnX)) return Math.max(80, Math.min(width - 80, opts.spawnX));
      if (homeX(engine) != null) return homeX(engine);
      // tower_get_teleport_point (w - 150) from outside; the elevator connect (x 200) between floors.
      if (via === 'door' || (!via && floor === 0)) return TOWER_GEO.arriveX;
      return TOWER_GEO.elevatorX + 70;
    },
    spawnTargets() {
      scene = { room: 'interior', tower: floor, construction, background, furnitureLayer: null, furnitureFrontLayer: null, ghost: null, markers: null };
      towerApi.spawnFloor(engine, { width, groundY: GROUND_Y, doorX: TOWER_GEO.exitX });
      return {};
    },
    enter() {
      const layers = addFurnitureLayers(engine);
      scene.furnitureLayer = layers.back;
      scene.furnitureFrontLayer = layers.front;
      // tower_build_expansion: the bare tower base (home_tower.swf) until the floor is built.
      if (construction && mode === 'decorate') mode = null;
      renderFurniture(engine);
      afterEnter(engine);
    },
  };
}

/**
 * An upper house floor (G153): its own room like a Tower floor, closed at
 * both ends (homes_get_floor_config: only the ground floor opens onto the
 * yard), no front door, its Doors the way down (and up).
 */
function houseFloorScene(engine, index) {
  decor = houseFloorDecor(index);
  const background = interiorBackground(engine, {});
  const width = interiorWidth(decor);
  const arriveX = floorArrivalX;
  floorArrivalX = null;
  return {
    width,
    groundY: GROUND_Y,
    background,
    spawnFor(opts = {}) {
      if (opts.arrive === 'exact' && Number.isFinite(opts.spawnX)) return Math.max(80, Math.min(width - 80, opts.spawnX));
      if (Number.isFinite(arriveX)) return arriveX;
      if (homeX(engine) != null) return homeX(engine);
      const down = floors.links.find((l) => l.floor + 1 === index);
      return down ? down.x : Math.round(width / 2);
    },
    spawnTargets() {
      scene = { room: 'interior', houseFloor: index, background, furnitureLayer: null, furnitureFrontLayer: null, ghost: null, markers: null };
      lastWallX = null;
      spawnDoorTargets(engine);
      return {};
    },
    enter() {
      const layers = addFurnitureLayers(engine);
      scene.furnitureLayer = layers.back;
      scene.furnitureFrontLayer = layers.front;
      renderFurniture(engine);
      afterEnter(engine);
    },
  };
}

/** The Door art for a placed Door on this floor (getDefaultUpgradeConfig). */
function doorArtUrl(item, floor = houseFloorHere() ?? 0) {
  const def = furnitureDef(DOOR_CLASS);
  return def?.doorArt?.[doorArtKey(doorRole(floors, floor, item.id))] || def?.art?.path;
}

/** The Doors on this floor that do something (build a floor, lead up or down) are targets; their art is theirs. */
function spawnDoorTargets(engine) {
  const floor = houseFloorHere();
  if (floor == null) return;
  const { PIXI } = engine;
  for (const item of decor.placed) {
    if (item.classTsid !== DOOR_CLASS) continue;
    const role = doorRole(floors, floor, item.id);
    if (!role) continue;
    const spr = new PIXI.Sprite(textureFromUrl(doorArtUrl(item, floor)));
    spr.anchor.set(0.5, 1);
    const art = furnitureDef(DOOR_CLASS).art;
    spr.width = art.w;
    spr.height = art.h;
    spr.x = roomX0() + item.x;
    spr.y = item.y;
    spr.zIndex = FURNITURE_Z - 1;
    engine.entityLayer.addChild(spr);
    const dest = doorDestination(floors, floor, item.id);
    engine.register({
      classId: DOOR_CLASS,
      featureId: HOMES_FEATURE_ID,
      label: 'Door',
      subtitle: role === 'pending' ? DOOR_TEXT.createTooltip : `${dest.dir === 'up' ? 'Up' : 'Down'} to the ${floorName(dest.floor)}`,
      sprite: spr,
      state: { doorId: item.id, floor },
    });
  }
}

function floorName(index) {
  return ['ground floor', 'second floor', 'third floor'][index] || `floor ${index + 1}`;
}

/** canPickup's hasInProgressJob: anything put into the pending Door's project yet. */
function doorJobStarted() {
  const jobId = doorJobId(floors);
  return Boolean(jobId && projectApi.registered(jobId) && projectApi.inProgress(jobId));
}

/** The pending Door's Build a New Floor project, registered with projectApi once its catalog is in. */
function registerDoorJob(engine) {
  const jobId = doorJobId(floors);
  if (!jobId) return Promise.resolve(false);
  return projectApi.ready().then(() => {
    if (doorJobId(floors) !== jobId) return false;
    if (projectApi.registered(jobId)) return true;
    const cls = projectApi.catalog()?.classes?.[DOOR_JOB_PHASES[0].classTsid];
    return projectApi.register(jobId, {
      kind: 'restore',
      title: cls?.title || 'Build a New Floor',
      label: 'Your house',
      desc: cls?.desc || '',
      phases: DOOR_JOB_PHASES.map((p) => ({ ...p })),
      // A home project is sized for its owner: the source amounts.
      divisor: 1,
      rewardMultiplier: 1,
    }, {
      kicker: 'Your house',
      kindLabel: 'Home Project',
      // players/inc_jobs.js:471 says every type 5 job in a house (not is_public) is "in your yard".
      place: 'in your yard',
      iconUrl: 'assets/sprites/icons/furniture_door.png',
      note: `When it is done your house has ${floorCount(floors) + 1} floors.`,
      target: () => (engine.interactables || []).find((t) => t.classId === DOOR_CLASS && t.state?.doorId === floors.pending?.id) || null,
      onDone: (eng) => finishFloor(eng, jobId),
    });
  });
}

/** onJobComplete -> homes_add_floor_at: the floor goes on, the Door now leads up. */
function finishFloor(engine, jobId) {
  const res = addFloor(floors, houseDecor);
  if (!res.ok) return '';
  doorLast = `built:${res.floor}`;
  engine.save();
  setTimeout(() => {
    projectApi.unregister(jobId, { dropRow: true });
    if (houseFloorHere() != null) engine.refreshHomeScene?.();
    publish(engine);
  }, 0);
  return `Your ${floorName(res.floor)} is ready: go up through the Door.`;
}

/** Through a Door: the other floor's room, standing at its Door. */
async function goToHouseFloor(engine, floor, x) {
  if (!houseFloorDecor(floor)) return false;
  floors.at = floor;
  floorArrivalX = Math.round(Number(x) || 0);
  doorLast = `went:${floor}`;
  engine.save();
  engine.playSound?.('DOOR_OPEN', { volume: 0.5 });
  await engine.enter(HOME_INTERIOR_TSID, {});
  return true;
}

function doorVerbs(target) {
  const floor = target.state?.floor ?? 0;
  const role = doorRole(floors, floor, target.state?.doorId);
  if (role === 'pending') {
    return [{ id: 'door_create', label: DOOR_TEXT.createLabel, sort: 55, enabled: true, reason: '', energy: 0, durationMs: 0, tooltip: DOOR_TEXT.createTooltip }];
  }
  const dest = doorDestination(floors, floor, target.state?.doorId);
  if (!dest) return [];
  return [{ id: 'door_go', label: dest.dir === 'up' ? 'Go up' : 'Go down', sort: 10, enabled: true, reason: '', energy: 0, durationMs: 0, tooltip: `To the ${floorName(dest.floor)}` }];
}

function runDoorVerb(target, verbId, engine) {
  const floor = target.state?.floor ?? 0;
  if (verbId === 'door_create') {
    registerDoorJob(engine).then((ok) => {
      const jobId = doorJobId(floors);
      if (!ok || !jobId || !projectApi.open(engine, jobId)) engine.toast('The project is not ready yet. Try again in a moment.');
    });
    return true;
  }
  if (verbId === 'door_go') {
    const dest = doorDestination(floors, floor, target.state?.doorId);
    if (dest) goToHouseFloor(engine, dest.floor, dest.x);
    return true;
  }
  return false;
}

/**
 * location.js:72-74 onPlayerEnter: butler_hint_counters visited_my_house counts
 * each time you enter your own house (any way in: the door, /house, from the
 * Tower). A rebuild of the room you are already in is not a visit.
 */
/** QA &housevisits=N (a fresh game runs no restore, so init reads it too). */
function qaHouseVisits(engine) {
  const raw = engine?.param?.('housevisits');
  const n = raw == null || raw === '' ? NaN : Number(raw);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : null;
}

export function countHouseVisit(engine, roomKey) {
  const fresh = roomKey !== lastHomeRoom;
  lastHomeRoom = roomKey;
  if (!fresh || roomKey !== 'house') return;
  houseVisits += 1;
  engine.setData?.('homeHouseVisits', String(houseVisits));
  engine.save?.();
}

function homeScene(room, engine) {
  const ctx = engine.homeContext?.() || {};
  const style = ctx.style || 'meadow';
  const floor = room === 'interior' ? towerApi.currentFloor() : null;
  countHouseVisit(engine, floor != null ? 'tower' : room === 'interior' ? 'house' : 'street');
  if (floor != null) return towerFloorScene(engine, floor);
  decor = houseDecor;
  if (room !== 'interior') {
    towerApi.clearFloor();
    floors.at = 0;
    floorArrivalX = null;
  }
  if (room === 'interior') {
    if (floors.at > 0 && houseFloorDecor(floors.at)) return houseFloorScene(engine, floors.at);
    floors.at = 0;
    const arriveX = floorArrivalX;
    floorArrivalX = null;
    if (!decor.starterKit) {
      grantStarterKit(decor);
      arrangeStarterRoom(decor);
      engine.save();
    }
    // The back yard left of the house (G135): the room starts at its width.
    syncHouseShift(engine);
    keepStacksInHouse(engine);
    qaYardStyle(engine);
    qaRockFlags(engine);
    const background = interiorBackground(engine, { yard: true });
    const x0 = background.houseX;
    const roomW = interiorWidth(decor);
    const width = x0 + roomW;
    return {
      width,
      groundY: GROUND_Y,
      background,
      spawnFor(opts = {}) {
        if (opts.arrive === 'exact' && Number.isFinite(opts.spawnX)) {
          return Math.max(60, Math.min(width - 80, opts.spawnX + (opts.shift || 0)));
        }
        // Down a Door from the floor above: at that Door.
        if (Number.isFinite(arriveX)) return x0 + arriveX;
        // &homex= is room x (negative: in the back yard).
        if (opts.arrive !== 'door' && homeX(engine) != null) return x0 + homeX(engine);
        if (opts.arrive !== 'door' && engine.param('homeyarddemo')) return Math.max(60, x0 - 330);
        if (opts.arrive !== 'door' && engine.param('homedemo') === 'decorate') return x0 + Math.round(roomW * 0.48);
        return x0 + interiorDoorX() - 80;
      },
      spawnTargets() {
        scene = { room, background, furnitureLayer: null, furnitureFrontLayer: null, ghost: null, markers: null };
        lastWallX = null;
        const out = spawnInteriorTargets(engine);
        spawnDoorTargets(engine);
        return out;
      },
      enter() {
        // Furniture is placed in room x.
        const layers = addFurnitureLayers(engine, x0);
        scene.furnitureLayer = layers.back;
        scene.furnitureFrontLayer = layers.front;
        renderFurniture(engine);
        spawnCultivations(engine, backCult);
        afterEnter(engine);
      },
    };
  }
  liftOldStreetSave(engine);
  syncStreetShift(engine);
  qaStreetStyle(engine);
  qaRockFlags(engine);
  const background = streetBackground(engine, shownStreetStyle(engine), style);
  const layout = homeStreetLayout(cult);
  return {
    width: layout.width,
    // renderHomeScene sets the world's GROUND_Y (engine.groundY) from this.
    groundY: STREET_GROUND_Y,
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
  if ((mode === 'decorate' && scene.room !== 'interior') || (mode === 'cultivate' && scene.room !== 'street' && !inHouse())) {
    mode = null;
    placing = null;
    selected = null;
  }
  if (placing) makeGhost(engine);
  renderBar(engine);
  renderStyleDialog(engine);
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
    houseVisits = qaHouseVisits(engine) ?? houseVisits;
    // QA (home demos only): window.groddleHomeStyle(key) redraws the street in that style, free.
    if (engine.param?.('homedemo') && typeof window !== 'undefined') {
      // Inside the house a GSJS interior key redraws the back yard instead.
      window.groddleHomeStyle = (key) => {
        if (inHouse() && YARD_STYLE_BY_KEY[key]?.built) {
          yardStyle = key;
          yardPreview = null;
        } else if (STREET_STYLE_BY_KEY[key]?.built) {
          streetStyle = key;
          stylePreview = null;
        } else return false;
        engine.refreshHomeScene?.();
        publish(engine);
        return true;
      };
    }
    // QA (BUILDER; DECOITEMS: always, read-only, so the online two-player checks can find a shelf):
    // window.groddleHomePiece(id | classTsid) is a placed piece's client rect ({ id, left, top, right,
    // bottom }), with where a pack item rests on it.
    if (typeof window !== 'undefined') {
      window.groddleHomePiece = (key) => {
        const item = decor.placed.find((row) => row.id === Number(key)) || decor.placed.find((row) => row.classTsid === key);
        if (!item || !scene) return null;
        const b = furnitureBounds(item);
        const a = clientPoint(engine, b.x + roomX0(), b.y);
        const z = clientPoint(engine, b.x + b.w + roomX0(), b.y + b.h);
        const top = surfaceHeight(item.classTsid, item.upgradeId) ? clientPoint(engine, item.x + roomX0(), item.y - surfaceHeight(item.classTsid, item.upgradeId)) : null;
        return a && z ? { id: item.id, left: a.x, top: a.y, right: z.x, bottom: z.y, surfaceY: top?.y ?? null, x0: roomX0(), x: item.x, y: item.y, surface: surfaceHeight(item.classTsid, item.upgradeId) } : null;
      };
    }
    if (engine.param?.('homedemo') && typeof window !== 'undefined') {
      // QA: window.groddleHomeRock() lists the rock's verbs; (verbId) runs one; ('house_sign') opens HouseSignDialog.
      window.groddleHomeRock = (verbId) => {
        if (!rockTarget || rockTarget.sprite?.destroyed) return null;
        if (!verbId) return magicRockVerbs(rockTarget, engine).map((v) => v.id);
        // G232: houses_upgrade_start, the branch talk to never reaches in play.
        if (verbId === 'house_sign') return openHouseSign(engine);
        const out = runRockVerb(rockTarget, verbId, engine);
        publish(engine);
        return out;
      };
    }
    publish(engine);
  },

  save() {
    // Tower floors share the house's furniture storage; it is saved once, with the house.
    return {
      decor: houseDecor,
      cult,
      towerDecor: towerDecor.map(({ storage, styles, ...rest }) => rest),
      // G153: the floors above the ground floor, their Doors, and the floor you are on.
      floors: { ...floors, upper: floors.upper.map(({ storage, styles, ...rest }) => rest) },
      streetGround: savedStreetGround,
      houseVisits,
      streetStyle,
      // G135: the back yard, its style, and the house x the indoor stacks were saved against.
      backYard: backCult,
      yardStyle,
      houseX: savedHouseX ?? houseX0(),
      // G226: pc.magic_rock, and the street's house x (left expansions move what stands there).
      magicRock: rockFlags,
      streetHouseX: savedStreetHouseX ?? homeStreetLayout(cult).houseX,
      // G232: the game day the rock's iMG was handed over (cultivation_img_rewards).
      rockImgDay,
    };
  },

  restore(slice, engine) {
    // butler_hint_counters visited_my_house (QA: &housevisits=N).
    houseVisits = qaHouseVisits(engine) ?? Math.max(0, Math.floor(Number(slice?.houseVisits) || 0));
    lastHomeRoom = null;
    const ground = Number(slice?.streetGround);
    savedStreetGround = !slice ? STREET_GROUND_Y : Number.isFinite(ground) ? ground : OLD_STREET_GROUND_Y;
    houseDecor = normalizeHomeDecorState(slice?.decor || {});
    decor = houseDecor;
    cult = normalizeCultivationState(slice?.cult || {});
    streetStyle = STREET_STYLE_BY_KEY[slice?.streetStyle]?.built ? slice.streetStyle : null;
    // Saves from before the back yard: a 5-segment yard, the starting style, and indoor stacks at house x 0.
    backCult = createBackYardState(slice?.backYard || {});
    yardStyle = YARD_STYLE_BY_KEY[slice?.yardStyle]?.built ? slice.yardStyle : null;
    yardPreview = null;
    const hx = Number(slice?.houseX);
    savedHouseX = !slice ? null : Number.isFinite(hx) ? hx : 0;
    rockFlags = normalizeRockFlags(slice?.magicRock);
    rockTarget = null;
    rockImgDay = typeof slice?.rockImgDay === 'string' ? slice.rockImgDay : null;
    // Saves from before G226: nothing to move until the street grows again.
    const sx = Number(slice?.streetHouseX);
    savedStreetHouseX = slice?.streetHouseX != null && Number.isFinite(sx) ? sx : null;
    floors = createFloorsState(slice?.floors || {}, houseDecor);
    floorArrivalX = null;
    doorLast = '';
    towerDecor = (Array.isArray(slice?.towerDecor) ? slice.towerDecor : [])
      .slice(0, TOWER_CONFIG.MAX_FLOORS)
      .map((row) => normalizeHomeDecorState({ ...row, wallSegments: TOWER_GEO.wallSegments, layout: 'tower', starterKit: true }));
  },

  /** renderHomeScene: the scene for 'interior' or 'street'. */
  homeScene(room, engine) {
    return homeScene(room, engine);
  },

  onStreetClear(engine) {
    closeUpgradePicker(true);
    releaseCameraLook(engine);
    destroyGhost();
    scene = null;
    rockTarget = null;
    rockBubbled = false;
    rockBubble = null;
    drag = null;
    packDrag = null;
    stackCarry = null;
    hoverId = null;
    if (ui) {
      ui.builder.render(null);
      ui.modes.hidden = true;
      if (ui.sign) ui.sign.hidden = true;
    }
  },

  onStreetEnter(street, engine) {
    // Ordinary streets: no home scene, so the mode bar must be gone.
    if (!engine.homeContext?.().inHome) {
      lastHomeRoom = null;
      stylePreview = null;
      stylePick = null;
      if (ui?.styles) ui.styles.hidden = true;
      mode = null;
      placing = null;
      selected = null;
      renderBar(engine);
    }
  },

  /** game.js pack dragstart: Wine of the Dead onto a cultivated item (patch.js / trant / proto remove drop target). */
  packDragStart(classTsid, event, engine) {
    return startPourDrag(classTsid, event, engine) ? true : null;
  },

  /** Pack furniture: place it straight from the pack while inside the house. */
  packVerbs(classTsid, engine) {
    // G264: homestreet_ticket.js 29-42, the ticket's "use" is always disabled in the pack.
    if (classTsid === HOME_TICKET_CLASS) {
      if (countItem(engine.inv, HOME_TICKET_CLASS) < 1) return [];
      return [{ id: 'use', label: 'Use', enabled: false, reason: HOME_TICKET.useReason }];
    }
    // items/wine_of_the_dead.js verbs.pour (sort_on 54).
    if (classTsid === WOTD) {
      if (countItem(engine.inv, WOTD) < 1) return [];
      const home = engine.homeContext?.() || {};
      return [pourButton(pourConditions({ canCultivate: home.inHome && home.owned, target: pourTargetHere(engine) }))];
    }
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
    if (classTsid === WOTD && verbId === 'pour') {
      const row = countItem(engine.inv, WOTD) > 0 ? pourTargetHere(engine) : null;
      if (!row) engine.toast(WOTD_TEXT.nothingHere, 2600);
      else confirmPour(engine, row);
      return true;
    }
    if (verbId !== 'place_furniture' || !FURNITURE_CATALOG[classTsid] || scene?.room !== 'interior' || scene.construction) return false;
    if (mode !== 'decorate') setMode(engine, 'decorate');
    beginPlacing(engine, classTsid, 'pack');
    return true;
  },

  onTick(dtMs, now, engine) {
    tickPourOverlay();
    if (!scene) return;
    rockImgBubble(engine);
    if (scene.room === 'street') {
      syncStreetRock(engine);
      wearFromNodes(engine, now);
    } else {
      if (inHouse()) wearFromNodes(engine, now);
      keepInsideWalls(engine);
      interiorCameraLook(engine, dtMs);
    }
    if (mode) {
      // CultManager: what you carry by walking rides at your feet.
      if (placing && carryBy === 'avatar') updateGhost(engine);
      syncFloating(engine);
    }
    // Ticket 52: the style column stays beside its piece while the camera eases.
    if (upgradePickerOpen()) placeUpgradePicker();
  },

  onEvent(counter, amount, engine) {
    wearFromEvent(engine, counter);
    if (counter.startsWith('making_recipe:')) bonusFurnitureUpgrade(engine, counter.slice('making_recipe:'.length));
  },

  /** Protos on the home street (items/proto_*.js restore / remove verbs). */
  verbsFor(target, engine) {
    if (target?.classId === 'magic_rock') return magicRockVerbs(target, engine);
    if (target?.classId === DOOR_CLASS) return doorVerbs(target);
    const id = target?.state?.cultivationId;
    const item = id != null ? activeCult().items.find((row) => row.id === id) : null;
    if (!item?.depleted) return [];
    return protoVerbs(item, engine);
  },

  runVerb(target, verbId, engine) {
    if (target?.classId === DOOR_CLASS) return runDoorVerb(target, verbId, engine);
    if (target?.classId === 'magic_rock' && (ROCK_VERB_IDS.includes(verbId) || verbId === 'talk_to')) {
      return runRockVerb(target, verbId, engine);
    }
    const id = target?.state?.cultivationId;
    const item = id != null ? activeCult().items.find((row) => row.id === id) : null;
    if (!item?.depleted) return false;
    if (verbId === 'restore') return projectApi.open(engine, restoreJobId(item, activeCult())) || true;
    if (verbId === 'pour_wotd') {
      if (!pourWine(engine, item.id)) engine.toast('Nothing to cancel.');
      return true;
    }
    return false;
  },

  /**
   * G335 (multiplayer): what a ledger correction could not take from the pack comes out of the
   * house, as the site took it out of the stored save (js/ledger-house.js); answers what it took.
   */
  ledgerTakeBack(want, engine) {
    // Ticket 51: a cabinet taken away leaves what was in it in the pack, as the site's remove does.
    const spill = {};
    const taken = takeFromHouse([houseDecor, ...(floors.upper || []), ...towerDecor], want, spill);
    for (const [c, n] of Object.entries(spill)) engine.inv[c] = (Number(engine.inv[c]) || 0) + n;
    if (Object.keys(spill).length) engine.refreshPack?.();
    if (Object.keys(taken).length && engine?.homeContext?.()?.inHome) engine.refreshHomeScene?.();
    return taken;
  },

  /**
   * Where the Mail Dispatcher stands on your home street (world x), clear of the gate, the
   * signpost, the Mailbox, the door and the cultivations (home-street-fixtures); null elsewhere.
   */
  homeDispatcherX() {
    return dispatcherWorldX();
  },

  /** Ticket 51: redraws the room's furniture (a box's count or a cabinet changed under it). */
  refreshFurniture(engine) {
    if (scene?.furnitureLayer) renderFurniture(engine);
  },

  /** QA / tests. */
  _state() {
    return { decor, houseDecor, towerDecor, floors, cult, backCult, yardStyle, savedHouseX, savedStreetHouseX, rockFlags, rockTarget, mode, placing, selected, scene, houseVisits };
  },

  /**
   * G226: the world x of the house's left end that the stacks dropped indoors
   * (and a Craftybot set down there) are kept against; room x + this = world x.
   */
  roomWorldX() {
    return savedHouseX ?? houseX0();
  },

  /** G226: game.js dropped-stack key; each Tower floor has its own. */
  dropTsid(tsid) {
    if (tsid !== HOME_INTERIOR_TSID) return null;
    const floor = towerApi.currentFloor();
    if (floor != null) return towerDropTsid(floor);
    // G153: each upper house floor keeps its own stacks.
    return floors.at > 0 ? `${HOUSE_FLOOR_DROP_PREFIX}${floors.at}` : null;
  },

  /**
   * G226: shift+C (game.js keydown asks before C opens Making). G231: handled
   * everywhere, as the client's SHIFT_PLUS_C was: away from home it only clicks.
   */
  cultivateKey(engine) {
    const out = toggleCultivateKey(engine);
    engine.setData?.('homeCultivateKey', out);
    return true;
  },

  /**
   * G231: the house edit mode open now ('cultivate' | 'decorate'), or null.
   * Camera Mode's plain C does nothing while one is (TSMainView.as cKeyHandler
   * 790-800: decorator_mode, chassis_mode, cult_mode).
   */
  homeEditMode() {
    return scene && mode ? mode : null;
  },

  /** Decoration Mode hides the avatar (HandOfDecorator start(): hidePCs): no Enter hint over what is near it. */
  quietEnterHint() {
    return scene && mode === 'decorate' ? true : null;
  },

  /** butler_hints.js:383: how many times you have gone into your house. */
  houseVisits() {
    return houseVisits;
  },
};
