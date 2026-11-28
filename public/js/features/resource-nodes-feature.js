/**
 * Harvestable resource nodes as a feature module (see js/feature-host.js).
 *
 * Rules live in js/resource-nodes.js; this file binds them to the world:
 * Fireflies (Firefly Jar), Salmon (pocket), Mortar Barnacles and Ice Nubbins
 * (Scraper), Jellisac Growths (scoop), Dirt Piles and Peat Bogs (Shovel),
 * Paper Trees (harvest / water / pet), Sloths (knock / feed Metal Rods) and
 * Dust Traps (walk into them).
 *
 * Placement: one shared-planner group per node class from the street
 * population's `resourceNodeClasses`, so every node stands on a real
 * platform; spots measured on the snaps come first, and a Sloth only ever
 * hangs in its street's own tree (UNPLANNED_RESOURCE_CLASSES, G891). Node
 * state persists per street in engine.streetSlot('resource-nodes') keyed
 * `<classTsid>:<index>`; the Firefly Jar and the one-time starter kit
 * flag live in this feature's save slice.
 *
 * Art: recovered CC0 OGA sheets under assets/sprites/resources/, loaded with
 * PIXI.Assets before any frame is sliced. Each sheet is scanned once for its
 * per-frame alpha bounds so growth states sit on the ground and the Firefly
 * glow follows the dot along its authored path. The Sloth is Tiny Speck's
 * npc_sloth.swf (js/sloth-art.js) hanging from its own striped branch in its
 * street's own tree, hidden by the crown the street draws in front (G891),
 * its animations played at the GSJS moments (js/sloth-encounter.js; G889, #245).
 *
 * Firefly Whistling: GSJS grants `firefly_whistling` at the end of the
 * instanced lab quest `firefly_whistle` (players/player.js
 * fireflyWhistleSwallowed; js/quest-rooms/firefly-whistle.js). Until then the
 * jar refuses ("You need the Firefly Whisperer achievement.", firefly_jar.js
 * verbs.open), and bumping into a Firefly while that quest is new shows
 * "What ho! ..." / "... Fireflies!" and offers it (npc_firefly.js
 * wandering_onMsg, once a session like its '!firefly_collision' flag). The
 * ?resdemo Firefly skips the badge gate, like the QA Sloth's skill gate;
 * &fireflyoffer=1 lets QA routes see the offer.
 *
 * QA: ?autostart=1&fresh=1&resdemo=<classTsid> places that node beside the
 * player on the first street entered (and grants any tool, rods, or skill it
 * needs; &resdemobare=1 leaves the items out, &resdemonode=0 gives the kit
 * and places no node); &resautoplay=1 performs its main verb once. Canvas data attributes:
 * resourceNodeCount, resourceNodeClasses, resourceLastHarvest, fireflyJar,
 * resourceDemo, slothAnim (the QA Sloth's animation, `eat:rod3` with a rod),
 * slothSpots (the street's Sloths: key@x,y,dir), slothAnims (theirs: key:anim).
 *
 * Pocket Salmon online (slice 3 of research/plans/street-animals-shared.md):
 * a street's Salmon are shared nodes (street-objects-feature): one pocketed is
 * gone for everyone until the server's 10 s respawn, and each swims on the
 * server's clock (placeSharedSalmon), the same on every page.
 *
 * Pocket Salmon: Release (G178, items/salmon.js 30-100; rules in
 * js/resource-nodes.js SALMON_RELEASE). A pack button on the Pocket Salmon,
 * shown only in Jal (hub 136) and Samudra (hub 140) while the street has
 * fewer than 71 Salmon swimming. It costs 4 energy, gives 5 iMG (mood bonus),
 * plays SALMON_RELEASE and counts salmon:release (Heebo's Happy Accident +1).
 * The Salmon goes back in the water where you stand: the nearest pocketed
 * Salmon still waiting on its 10 s respawn swims again at once, beside you
 * for this visit, so the street keeps its count; with none waiting, a new
 * one joins for this visit (salmon.js:71 createItemStack at pc.x, pc.y).
 * QA: &resrelease=1 (with or without &resdemo=npc_salmon&resautoplay=1)
 * packs one Pocket Salmon if you have none and releases it 3 s after the
 * street's nodes spawn; &resrelease=hold only packs it, for the popover.
 * Use a Jal or Samudra street, e.g. &streetdemo=GUVCLS8RV5D3VGT (Kaiki, hub
 * 140). Canvas: salmonRelease (state from the last pack popover, or the
 * last release: released:respawned|new:<key>, or failed:<reason>).
 */

import { ITEM_CATALOG, addItem, countItem } from '../inventory.js?v=3be7988a';
import { setToolRemaining, toolCopies } from '../tools.js?v=4156bba8';
import { isItemFloor, platformYAt } from '../street-model.js?v=a9a05f9d';
import { hiresSpriteUrl } from '../sprite-hires.js?v=dd070ce8';
import { rollResourceNodeDrop } from './drops-feature.js?v=5fce9ad0';
import { peekToolChoice, takeToolChoice } from '../tool-choice.js?v=e0dcb60e';
import { slugsFromEffects } from '../speech-slugs.js?v=d5cc8b6f';
import { resourceNodeResponseKey, verbResponse } from '../verb-responses.js?v=97df8351';
import { rollSlothBonusSnails } from '../imagination-effects.js?v=70169933';
import { SLOTH_ART_DIR, SLOTH_KNOCKER_ART, SLOTH_LOOPERS, SLOTH_SHEETS } from '../sloth-art.js?v=a2768e2f';
import { SLOTH_FULL_PEEK_GAP_MS, SLOTH_PEEK_GAP_MS, chooseSlothLine, slothCellAt, slothIdleTick, slothTimeline } from '../sloth-encounter.js?v=d78eba08';
import { slothTrees } from '../sloth-trees.js?v=775bef07';
import { avatarHitBox, boxesTouch } from '../reach.js?v=456da8a8';
import {
  DUST_TRAP_DROP_ITEM_DEFS,
  ORGANELLE_OVERLAY,
  organelleFlight,
  RESOURCE_ITEM_DEFS,
  RESOURCE_NODE_CATALOG,
  SALMON_RELEASE,
  FIREFLY_JAR_MAX,
  createResourceNode,
  ensureResourceItems,
  fireflyJarSheet,
  getResourceNodeDef,
  harvestResourceNode,
  normalizeFireflyJarState,
  normalizeResourceNode,
  pickReleasedSalmon,
  releaseSalmon,
  respawnReleasedSalmon,
  resourceNodeFrame,
  resourceNodeStatusLabel,
  resourceNodeVerbs,
  salmonReleaseConditions,
  sheetFrameRect,
  starterResourceTools,
  swimmingSalmonCount,
  takeDueSnails,
  tickResourceNode,
  springDustTrapsOnArrival,
} from '../resource-nodes.js?v=c2eb46b1';
import { frameTexture as sheetFrameTexture, loadTexture, sourceFromUrl, textureFromUrl } from '../textures.js?v=b8e38103';
import { acceptOffer, markOffered, npcQuestOffers, putOffOffer, questStatus } from '../quest-offers.js?v=9e1855e7';
import { OVERLAY_USES, playOverlay } from '../overlays.js?v=91dcee74';
import { OVERLAY_FADE, displayTopOf, itemstackOverlayPoint } from '../overlay-art.js?v=e50bacca';
import { playItemOverlay } from '../item-overlay.js?v=c444e2cf';
import { nodeToolOverlay, nodeToolSheet } from '../node-tools.js?v=47a93d54';
import { vpSequence } from '../quest-rooms/vp-overlay.js?v=5ec02fe7';
import { itemZ } from '../item-bands.js?v=ec366be3';
import { salmonSwimAt } from '../street-creatures.js?v=cc6d21bf';
import { GAME_EPOCH_MS } from '../game-day.js?v=57fecfcb';
import { topUpMetabolic } from '../metabolics.js?v=48f784bf';
import { anchorBottomCentre } from '../sprite-feet.js?v=6283b688';

export const RESOURCE_FEATURE_ID = 'resource-nodes';
export const RESOURCE_GROUP_PREFIX = 'resource:';

/** Planner clearance per class (px between neighbours on the same band). */
export const RESOURCE_PLACEMENT_CLEARANCE = Object.freeze({
  npc_firefly: 40,
  npc_salmon: 60,
  mortar_barnacle: 42,
  dust_trap: 52,
  ice_knob: 46,
  jellisac: 42,
  dirt_pile: 110,
  peat_1: 115,
  paper_tree: 135,
});

/**
 * G891: classes never planned on a floor. A Sloth hangs in its own street's tree (js/sloth-trees.js,
 * written for the 37 sloth streets by tools/build-sloth-spots.mjs); one with no tree is not drawn.
 */
export const UNPLANNED_RESOURCE_CLASSES = Object.freeze(['npc_sloth']);

/** The verb each class's QA autoplay performs. */
export const RESOURCE_MAIN_VERB = Object.freeze({
  npc_firefly: 'open',
  npc_salmon: 'pocket',
  mortar_barnacle: 'scrape',
  ice_knob: 'scrape',
  jellisac: 'scoop',
  dirt_pile: 'dig',
  peat_1: 'harvest',
  paper_tree: 'harvest',
  npc_sloth: 'knock',
  dust_trap: 'trigger',
});

const TICK_MS = 500;
const SVG_SCALE = 2;
const WHISTLE_RADIUS = 500;
/** quests/firefly_whistle.js: the lab quest a Firefly offers (npc_firefly.js). */
export const FIREFLY_WHISTLE_QUEST = 'firefly_whistle';
/** npc_firefly.js wandering_onMsg collision announcements, then quests_offer. */
export const FIREFLY_OFFER_LINES = Object.freeze([
  { lines: ['What ho! ...'], clickToAdvance: true },
  { lines: ['... Fireflies!'], durationMs: 2500 },
]);
/** Every node is an item, so all of them draw under the avatars (50); npc_firefly is in_foreground (FG_ITEM). */
/**
 * Offsets inside each class's item band (item-bands.js). Peat, dirt, jellisac, the Sloth and
 * the paper tree are background items (with the trants, 16); barnacles, ice knobs and dust traps
 * normal; fireflies and salmon foreground.
 */
const Z = Object.freeze({ tree: 4, paper: 6, ground: Object.freeze({ background: 9.2, normal: 1 }), trap: 0.5, salmon: 4, firefly: 5 });

// ---------------------------------------------------------------------------
// Pure helpers (tested in tests/resource-nodes-feature.test.js)
// ---------------------------------------------------------------------------

function resolveClassId(classTsid) {
  return getResourceNodeDef(classTsid)?.classTsid || null;
}

/** How many of each node class the spawn list holds, in its order. */
function resourceClassCounts(population) {
  const counts = new Map();
  for (const raw of Array.isArray(population?.resourceNodeClasses) ? population.resourceNodeClasses : []) {
    const classTsid = resolveClassId(raw);
    if (!classTsid) continue;
    counts.set(classTsid, (counts.get(classTsid) || 0) + 1);
  }
  return counts;
}

/**
 * Player report #210: the class's spots measured on the street's snaps (street-ecology.js
 * measuredNodeSpots, populationForStreet `resourceSpots`), at most `count`.
 */
function measuredSpots(population, classTsid, count, street = null) {
  let rows = population?.resourceSpots?.[classTsid];
  // G891: a street with Sloths and no written spots (a builder street) finds its trees in its own art.
  if (!Array.isArray(rows) && classTsid === 'npc_sloth' && street) rows = slothSpotsFromArt(street);
  if (!Array.isArray(rows)) return [];
  return rows.filter((row) => Number.isFinite(row?.x) && Number.isFinite(row?.y)).slice(0, count);
}

/** G891: a street's sloth trees as measured spots ({ x, y, sloth: { dir, floor, knocker } }). */
export function slothSpotsFromArt(street) {
  return slothTrees(street).map((t) => ({ x: t.x, y: t.y, variant: null, sloth: { dir: t.dir, floor: t.floor, knocker: t.knocker } }));
}

/**
 * Planner requests: one group per node class, counts from the spawn list, less the ones with a
 * measured spot (those are never planned).
 */
export function resourcePlacementGroups(population) {
  const groups = [];
  for (const [classTsid, count] of resourceClassCounts(population)) {
    if (UNPLANNED_RESOURCE_CLASSES.includes(classTsid)) continue;
    const planned = count - measuredSpots(population, classTsid, count).length;
    if (planned < 1) continue;
    groups.push({
      key: `${RESOURCE_GROUP_PREFIX}${classTsid}`,
      count: planned,
      clearance: RESOURCE_PLACEMENT_CLEARANCE[classTsid] || 60,
    });
  }
  return groups;
}

/**
 * Pair spots with node keys (`<class>:<index>`, so saved nodes keep theirs): a class's measured
 * spots first (`wall: true`, drawn where the snap shows them, in the variant it shows), then the
 * planner's points; ones the planner could not seat are dropped.
 *
 * G891: `npc_sloth:<i>` is the i-th tree from the left, for good (js/sloth-spots-data.js), so the
 * realtime server can share them by id later. Saves from before numbered them in the planner's
 * order; such a save keeps each index's state, now on the tree with that index. It is all
 * transient (out, hideAt, busyUntil, sessionFeeds, lastMetalizeAt, snailsDue: at most a 3-minute
 * "full" on another tree), and a pending round of Snails still pays into the pack (paySlothSnails
 * takes every Sloth's due rounds), so nothing is lost.
 */
export function resourceSpawnPlan(population, placement, street = null) {
  const plan = [];
  for (const [classTsid, count] of resourceClassCounts(population)) {
    const spots = measuredSpots(population, classTsid, count, street);
    spots.forEach((spot, index) => {
      plan.push({
        key: `${classTsid}:${index}`, classTsid, x: spot.x, y: spot.y, wall: true,
        ...(spot.variant ? { variant: spot.variant } : {}),
        ...(spot.mirror ? { mirror: true } : {}),
        ...(spot.sloth ? { sloth: spot.sloth } : {}),
      });
    });
    if (count - spots.length < 1 || UNPLANNED_RESOURCE_CLASSES.includes(classTsid)) continue;
    const points = (typeof placement === 'function' ? placement(`${RESOURCE_GROUP_PREFIX}${classTsid}`) : []) || [];
    points.slice(0, count - spots.length).forEach((point, index) => {
      if (!Number.isFinite(point?.x) || !Number.isFinite(point?.y)) return;
      plan.push({ key: `${classTsid}:${spots.length + index}`, classTsid, x: point.x, y: point.y });
    });
  }
  return plan;
}

/**
 * Reuse or create each planned node in the street slot. Saved nodes are
 * normalized; unknown or mismatched rows are replaced. Mutates slot.nodes and
 * returns [{ ...planItem, node }] where node is the live slot object.
 */
export function prepareStreetResourceNodes(slot, plan, { tsid = '', now = Date.now() } = {}) {
  if (!slot.nodes || typeof slot.nodes !== 'object' || Array.isArray(slot.nodes)) slot.nodes = {};
  const out = [];
  for (const item of plan) {
    let node = normalizeResourceNode(slot.nodes[item.key]);
    if (!node || node.classTsid !== item.classTsid) {
      node = createResourceNode(item.classTsid, { seed: `${tsid}:${item.key}`, now, ...(item.variant ? { variant: item.variant } : {}) });
    } else if (item.variant && node.variant !== item.variant) {
      // A measured spot shows the snap's variant; the art is all a variant changes, so a saved node takes it.
      node.variant = item.variant;
    }
    slot.nodes[item.key] = node;
    out.push({ ...item, node });
  }
  return out;
}

export function normalizeResourceFeatureSlice(slice) {
  const bonusSnailsAt = Number(slice?.bonusSnailsAt);
  return {
    // Saves from before each jar kept its own Fireflies (2026-11-04) carry one count for them all.
    jar: normalizeFireflyJarState(slice?.jar || {}),
    jarCopies: slice?.jarCopies === true,
    starterKit: slice?.starterKit === true,
    // pc['last_bonus_snails'] (npc_sloth.js Friend of Metal), kept only once set.
    ...(Number.isFinite(bonusSnailsAt) && bonusSnailsAt > 0 ? { bonusSnailsAt } : {}),
  };
}

/**
 * One-time pack migration: grant the Scraper, Shovel and Firefly Jar to new
 * solo players and solo saves made before this feature (never multiplayer:
 * the feature marks the kit handled there, G565). Only an absent entry is filled,
 * so a deliberate zero (sold or dropped) is preserved, and the flag stops the
 * grant from repeating once the tool has left the pack entirely.
 * @returns {string[]} granted class ids
 */
export function migrateResourceStarterKit(inv, sliceState) {
  if (!inv || !sliceState || sliceState.starterKit === true) return [];
  const granted = [];
  for (const [classTsid, qty] of Object.entries(starterResourceTools())) {
    if (inv[classTsid] === undefined) {
      inv[classTsid] = qty;
      granted.push(classTsid);
    }
  }
  sliceState.starterKit = true;
  return granted;
}

/** What a ?resdemo node needs so its main verb can succeed. */
export function resourceDemoKit(classTsid) {
  const id = resolveClassId(classTsid);
  const def = id ? RESOURCE_NODE_CATALOG[id] : null;
  if (!def) return null;
  const items = {};
  for (const verb of def.verbs) {
    const tool = verb.tools?.[verb.tools.length - 1];
    if (tool) items[tool] = 1;
    for (const input of verb.inputs || []) items[input.classTsid] = Math.max(items[input.classTsid] || 0, 3);
  }
  return {
    classTsid: id,
    items,
    skill: def.verbs.find((verb) => verb.skillGate)?.skillGate || null,
    verb: RESOURCE_MAIN_VERB[id] || def.verbs[0].id,
  };
}

/**
 * Platform surface under x nearest to a reference feet y (screen space), so a
 * QA node beside the avatar lands on the ground rather than mid-slope air.
 */
export function surfaceNear(platforms, x, refY) {
  let best = null;
  for (const platform of Array.isArray(platforms) ? platforms : []) {
    if (!isItemFloor(platform)) continue;
    const y = platformYAt(platform, x, 0);
    if (y == null || y < refY - 90 || y > refY + 260) continue;
    if (best == null || Math.abs(y - refY) < Math.abs(best - refY)) best = y;
  }
  return best ?? refY;
}

/**
 * Fill GSJS tooltip templates ($energy_cost, $seconds) and drop the Flash-only
 * drag hint ("Or, drag scraper to barnacle.").
 */
export function verbTooltip(verb) {
  const seconds = Math.round(((verb?.durationMs || 0) / 1000) * 10) / 10;
  return String(verb?.tooltip || '')
    .replace(/^Or, drag [^.]*\.\s*/, '')
    .replace(/\$energy_cost/g, String(verb?.costs?.energy ?? 0))
    .replace(/\$seconds/g, String(seconds));
}

/** Menu id for a rules verb. game.js routes a bare `feed` to the animal food picker. */
export function menuVerbId(verbId) {
  return verbId === 'feed' ? 'feed_rod' : verbId;
}

export function rulesVerbId(menuId) {
  return menuId === 'feed_rod' ? 'feed' : menuId;
}

// ---------------------------------------------------------------------------
// Sloth art: Tiny Speck's npc_sloth.swf (js/sloth-art.js) in its street's own tree
// ---------------------------------------------------------------------------

/**
 * G891: a Sloth hangs in its own street's tree (js/sloth-trees.js): its hands on its branch at the
 * spot (the crown's lower edge, on the side the crown spreads: `dir`, npc_sloth.js instance prop
 * 33, 54, onPropsChanged 620; left mirrors every layer about the origin, as the client's
 * view_holder.scaleX = -1 did, LocationItemstackView.as 1111-1126), so the HIDE ME box above sits
 * in the leaves the street already draws in front of the items, and the hanging sloth under them.
 * The 7 Sloths in the 2012 snaps were measured by their hands on the branch, within 24 px of the
 * spots: so the spot is the grip, and the SWF's origin sits SLOTH_GRIP up and back from it (the
 * hands in hangIdle1: 17-42 px right of the origin, the branch under them 22 px down). The
 * Knocker hangs on the trunk at its own point. Offsets from the origin, dir right (mirrored left):
 * - box: what you point at or reach for, the hanging art across (the hangIdle cells: origin x 61
 *   of 179) from the top of the HIDE ME box (SLOTH_CANOPY y -96) down to the floor under it, so
 *   from the path below it is right there;
 * - mouth: where it spits from in the hanging pose (the mouth in hangIdle1);
 * - speech: its bubbles (talk 852-881: offset 85 px to its right, higher while it hides), over its
 *   head when it hangs, over the leaves it hides in when it is up there.
 */
export const SLOTH_GRIP = Object.freeze({ x: 30, y: 22 });
export const SLOTH_REACH = Object.freeze({
  box: Object.freeze({ back: 61, front: 118, top: 96 }),
  mouth: Object.freeze({ x: 80, y: 62 }),
  speech: Object.freeze({ x: 80, hanging: 35, hiding: -30 }),
});
/** A QA Sloth by the player stands on no tree: its origin this far over the floor, its Knocker beside it. */
const DEMO_SLOTH = Object.freeze({ lift: 200, knockerX: 110, knockerLift: 75 });

/**
 * PURE: where a Sloth's parts are, from its spot ({ x, y, sloth: { dir, floor, knocker } }, screen
 * px): { dir, origin, grip, floor, knocker, box, mouth, speech }.
 */
export function slothGeometry(spot) {
  const dir = spot?.sloth?.dir < 0 ? -1 : 1;
  const gx = Number(spot?.x) || 0;
  const gy = Number(spot?.y) || 0;
  const floor = Number.isFinite(spot?.sloth?.floor) ? spot.sloth.floor : gy + DEMO_SLOTH.lift;
  const knocker = Number.isFinite(spot?.sloth?.knocker?.x) && Number.isFinite(spot?.sloth?.knocker?.y)
    ? { x: spot.sloth.knocker.x, y: spot.sloth.knocker.y }
    : { x: gx - dir * DEMO_SLOTH.knockerX, y: floor - DEMO_SLOTH.knockerLift };
  // The SWF's origin, from the hands at the spot.
  const x = gx - dir * SLOTH_GRIP.x;
  const y = gy - SLOTH_GRIP.y;
  const { box: b, mouth, speech } = SLOTH_REACH;
  return {
    dir,
    origin: { x, y },
    grip: { x: gx, y: gy },
    floor,
    knocker,
    box: { left: dir > 0 ? x - b.back : x - b.front, right: dir > 0 ? x + b.front : x + b.back, top: y - b.top, bottom: floor },
    mouth: { x: x + dir * mouth.x, y: y + mouth.y },
    speech: { x: x + dir * speech.x, hanging: y + speech.hanging, hiding: y + speech.hiding },
  };
}

/** The cells of one sheet (js/sloth-art.js), sliced once. */
const slothFrameCache = new Map();
function slothFrames(engine, sheet) {
  if (!sheet) return [];
  if (slothFrameCache.has(sheet.file)) return slothFrameCache.get(sheet.file);
  const source = sourceFromUrl(`${SLOTH_ART_DIR}${sheet.file}`);
  const { w, h } = sheet.cell;
  const list = Array.from({ length: sheet.count }, (_, i) => sheetFrameTexture(source,
    new engine.PIXI.Rectangle((i % sheet.cols) * w, Math.floor(i / sheet.cols) * h, w, h)));
  slothFrameCache.set(sheet.file, list);
  return list;
}

/** The sheets a moment needs, sliced (and so loading) before it plays. */
function warmSloth(engine, labels) {
  for (const label of labels) {
    const sheet = SLOTH_SHEETS[label];
    slothFrames(engine, sheet);
    if (sheet?.paw) slothFrames(engine, sheet.paw);
    for (const rod of sheet?.rods || []) slothFrames(engine, rod);
  }
}

/** Soft additive glow for Fireflies. */
function glowSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><defs><radialGradient id="g" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="#fff7b0" stop-opacity="0.95"/><stop offset="0.25" stop-color="#ffe866" stop-opacity="0.55"/><stop offset="1" stop-color="#ffd23a" stop-opacity="0"/></radialGradient></defs><circle cx="32" cy="32" r="32" fill="url(#g)"/></svg>`;
}

function svgDataUrl(svg) {
  return `data:image/svg+xml;charset=utf8,${encodeURIComponent(svg)}`;
}

// ---------------------------------------------------------------------------
// Runtime state
// ---------------------------------------------------------------------------

/*
 * Each Firefly Jar holds its own Fireflies (ticket 12 follow-up, 2026-11-04: "when I buy any
 * empty jars, they are automatically full"). Glitch kept num_flies on each jar (firefly_jar.js
 * 25-27 initInstanceProps "0", addFirefly 239-262 on the jar opened); the remake kept one count
 * for every jar. The count is now each jar's own, held with the tools' wear (js/tools.js
 * firefly_jar, a contents class: a new jar is empty), so it goes with the jar into bags, onto the
 * ground, to another player and back, solo and online (the ledger's `r`).
 */
const JAR = 'firefly_jar';
/** The engine init saw (QA _state reads the jars through it). */
let engineRef = null;

/** Every jar's Fireflies, in pack order. */
export function fireflyJarCounts(engine) {
  return engine?.toolState ? toolCopies(engine.toolState, JAR).map((c) => c.remaining) : [];
}

/**
 * The jar a whistle fills: the first in pack order with room (pc.findFirst, as the pumpkins look
 * for a full one, pumpkin_carved_1.js 178-180), else the first. { copy, flies }, copy -1 with none.
 */
export function fireflyJarInUse(engine) {
  const counts = fireflyJarCounts(engine);
  if (!counts.length) return { copy: -1, flies: 0 };
  const room = counts.findIndex((n) => n < FIREFLY_JAR_MAX);
  const copy = room >= 0 ? room : 0;
  return { copy, flies: counts[copy] };
}

/** Set one jar's Fireflies (its place in pack order). */
export function setFireflyJar(engine, copy, flies) {
  if (!engine?.toolState || !(copy >= 0)) return false;
  setToolRemaining(engine.toolState, JAR, flies, { copy });
  return true;
}
/** The Firefly's quest offer: once a session (npc_firefly.js '!firefly_collision'); QA routes opt in. */
const fireflyOffer = { shown: false, allowed: true };
/** Last Friend of Metal spit (ms), and the sloth the player is standing under. */
let bonusSnailsAt = 0;
let underSloth = null;
const kit = { starterKit: false };
let entities = [];
/** #478: this street's nodes while their art loads, before their targets exist (pendingTargets). */
let pendingItems = [];
let effects = [];
let generation = 0;
let lastTickAt = 0;
let lastHarvest = '';
let demoUsed = false;
let demoEntity = null;
let demoKitOnly = false;
/** The tool overlay playing on a node (verbStarted), and its end. */
let nodeTool = null;
function stopNodeTool() {
  nodeTool?.stop();
  nodeTool = null;
}
let autoplayTimer = null;
let jarFx = null;
let releaseState = '';
let releaseCount = 0;
let releaseTimer = null;

/** path -> { base, bounds } once loaded; promises while loading. */
const sheets = new Map();
const sheetLoads = new Map();
const frameTextures = new Map();
let svgTextures = null;
let svgLoad = null;

function hash(value) {
  let h = 2166136261;
  for (const char of String(value || '')) {
    h ^= char.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Per-frame alpha bounds so growth states sit on the ground. */
function scanBounds(source, def) {
  if (typeof document === 'undefined' || !source) return [];
  try {
    const canvas = document.createElement('canvas');
    canvas.width = def.width;
    canvas.height = def.height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    // Drawn at the sheet's 1x size, so a 3x source scans in the same cells.
    ctx.drawImage(source, 0, 0, def.width, def.height);
    const { data } = ctx.getImageData(0, 0, def.width, def.height);
    const out = [];
    for (let i = 0; i < def.frameCount; i += 1) {
      const r = sheetFrameRect(def, i);
      let l = r.w;
      let t = r.h;
      let rr = -1;
      let b = -1;
      for (let y = 0; y < r.h; y += 1) {
        const row = (r.y + y) * def.width;
        for (let x = 0; x < r.w; x += 1) {
          if (data[(row + r.x + x) * 4 + 3] <= 24) continue;
          if (x < l) l = x;
          if (x > rr) rr = x;
          if (y < t) t = y;
          if (y > b) b = y;
        }
      }
      out.push(b < 0 ? null : { l, t, r: rr + 1, b: b + 1, cx: (l + rr + 1) / 2, cy: (t + b + 1) / 2 });
    }
    return out;
  } catch {
    return [];
  }
}

function ensureSheet(engine, def) {
  if (sheets.has(def.path)) return Promise.resolve(sheets.get(def.path));
  if (!sheetLoads.has(def.path)) {
    sheetLoads.set(
      def.path,
      loadTexture(hiresSpriteUrl(def.path) || def.path, { raw: true })
        .then((texture) => {
          const base = texture.source;
          const entry = { base, bounds: scanBounds(base.resource, def) };
          sheets.set(def.path, entry);
          return entry;
        })
        .catch(() => null)
    );
  }
  return sheetLoads.get(def.path);
}

function frameTexture(engine, def, index) {
  const sheet = sheets.get(def.path);
  if (!sheet) return null;
  const rect = sheetFrameRect(def, index);
  const key = `${def.path}#${rect.index}`;
  if (!frameTextures.has(key)) {
    frameTextures.set(key, sheetFrameTexture(sheet.base, new engine.PIXI.Rectangle(rect.x, rect.y, rect.w, rect.h)));
  }
  return frameTextures.get(key);
}

function frameBounds(def, index) {
  return sheets.get(def.path)?.bounds?.[index] || null;
}

function footAnchor(def, index) {
  const bounds = frameBounds(def, index);
  return bounds ? bounds.b / def.frameHeight : 1;
}

function sheetFrames(engine, def) {
  return Array.from({ length: def.frameCount }, (_, i) => frameTexture(engine, def, i)).filter(Boolean);
}

function ensureSvgTextures(engine) {
  if (svgTextures) return Promise.resolve(svgTextures);
  if (!svgLoad) {
    const load = (svg) => loadTexture(svgDataUrl(svg), { scale: SVG_SCALE })
      .catch(() => textureFromUrl(svgDataUrl(svg), { scale: SVG_SCALE }));
    svgLoad = load(glowSvg()).then((glow) => {
      svgTextures = { glow };
      return svgTextures;
    });
  }
  return svgLoad;
}

/** Sheets a node needs for its current look (others load on demand). */
function sheetsNeeded(node) {
  const def = getResourceNodeDef(node.classTsid);
  if (!def || def.art !== 'raster') return [];
  if (node.classTsid === 'npc_salmon') return [def.sprite.sheets.swimRight, def.sprite.sheets.turnRight];
  if (node.classTsid === 'dust_trap') return Object.values(def.sprite.sheets);
  const frame = resourceNodeFrame(node);
  return frame?.sheet ? [frame.sheet] : [];
}

// ---------------------------------------------------------------------------
// QA data
// ---------------------------------------------------------------------------

function publish(engine) {
  const counts = {};
  for (const entity of entities) counts[entity.classTsid] = (counts[entity.classTsid] || 0) + 1;
  engine.setData('resourceNodeCount', String(entities.length));
  engine.setData(
    'resourceNodeClasses',
    Object.keys(counts).sort().map((id) => `${id}:${counts[id]}`).join(',')
  );
  engine.setData('resourceLastHarvest', lastHarvest);
  engine.setData('fireflyJar', String(fireflyJarInUse(engine).flies));
  engine.setData('fireflyJars', fireflyJarCounts(engine).join(','));
  engine.setData(
    'resourceDemo',
    demoEntity ? `${demoEntity.classTsid}:${demoEntity.node.units}:${resourceNodeStatusLabel(demoEntity.node)}` : ''
  );
  engine.setData('salmonRelease', releaseState);
  // G891: each Sloth's key, origin and side (`npc_sloth:0@2886,452,1;...`), the QA Sloth left out.
  engine.setData('slothSpots', entities.filter((e) => e.classTsid === 'npc_sloth' && e !== demoEntity)
    .map((e) => `${e.key}@${Math.round(e.x)},${Math.round(e.y)},${e.sloth?.dir < 0 ? -1 : 1}`).join(';'));
}

// ---------------------------------------------------------------------------
// Views
// ---------------------------------------------------------------------------

function targetFor(engine, entity, sprite, extra = {}) {
  const def = getResourceNodeDef(entity.classTsid);
  return engine.register({
    classId: entity.classTsid,
    featureId: RESOURCE_FEATURE_ID,
    label: def.label,
    subtitle: resourceNodeStatusLabel(entity.node) || def.verbs[0].tooltip,
    sprite,
    resourceKey: entity.key,
    ...extra,
  });
}

/**
 * G891: the Knocker is its own thing, as in Glitch (sloth_knocker.js: label "Knocker", the knock verb,
 * tooltip "Knock to call the Sloth", key k): its own target on the trunk, paired with its tree's
 * Sloth. Glitch's knock called the Sloth nearest the player within 600 px (39, 51); on all 84 trees
 * that is the Knocker's own tree's, so the pairing is by tree.
 */
export const SLOTH_KNOCKER = Object.freeze({ classId: 'sloth_knocker', label: 'Knocker', subtitle: 'Knock to call the Sloth' });

function knockerTargetFor(engine, entity, sprite) {
  return engine.register({
    classId: SLOTH_KNOCKER.classId,
    featureId: RESOURCE_FEATURE_ID,
    label: SLOTH_KNOCKER.label,
    subtitle: SLOTH_KNOCKER.subtitle,
    sprite,
    resourceKey: entity.key,
    knocks: entity.key,
  });
}

/** The node a target belongs to: the Sloth's own target or its Knocker's. */
function entityFor(target) {
  return target ? entities.find((row) => row.target === target || row.knockerTarget === target) || null : null;
}

/**
 * PURE: which of a node's verbs a target shows. A Knocker shows the verbs that are its own (`on`:
 * Knock), the node the rest, so Knock is on the Knocker only (sloth_knocker.js; npc_sloth.js verbs
 * list feed alone).
 */
export function verbsForTarget(verbs, knocker) {
  return (verbs || []).filter((verb) => (knocker ? verb.on === SLOTH_KNOCKER.classId : !verb.on));
}

/**
 * R43 (#587): a node's spot moved (online, to the server's spot for its key): the art drawn from it
 * follows, a Salmon's swim from its next frame. Returns where it stood.
 */
export function moveEntity(entity, x, y) {
  const from = { x: entity.x, y: entity.y };
  if (!Number.isFinite(x) || !Number.isFinite(y)) return from;
  entity.x = x;
  entity.y = y;
  const view = entity.view;
  if (view?.kind === 'ground' || view?.kind === 'trap') {
    view.sprite.x = x;
    view.sprite.y = entity.wall && view.kind === 'ground' ? y : y + 2;
  }
  return from;
}

function dropTarget(engine, entity) {
  if (entity.target) engine.unregister(entity.target);
  if (entity.knockerTarget) engine.unregister(entity.knockerTarget);
  entity.target = null;
  entity.knockerTarget = null;
  entity.view = null;
}

/** A ground node's frame on its spot (wall-measured or standing on its foot), its band and hit size. */
function groundSprite(engine, entity, frame, texture) {
  const { PIXI } = engine;
  const sprite = new PIXI.Sprite(texture || PIXI.Texture.EMPTY);
  if (entity.wall) {
    // Player report #210: a measured spot is the frame cell's bottom centre on the wall the snap shows
    // (obey_physics false: no floor under it), so every growth state keeps its place in the cell.
    anchorBottomCentre(sprite, 'snap');
    sprite.x = entity.x;
    sprite.y = entity.y;
    // G936: a barnacle on a round wall's right part faces outward (the art opens to the left).
    if (entity.mirror) sprite.scale.x = -1;
  } else {
    sprite.anchor.set(0.5, frame?.sheet ? footAnchor(frame.sheet, frame.frameIndex) : 1);
    sprite.x = entity.x;
    sprite.y = entity.y + 2;
  }
  sprite.zIndex = itemZ(entity.classTsid, entity.classTsid === 'paper_tree' ? Z.paper : Z.ground);
  if (entity.classTsid !== 'paper_tree') {
    sprite._worldHitW = Math.max(46, frame?.sheet?.frameWidth || 46);
    sprite._worldHitH = Math.max(40, frame?.sheet?.frameHeight || 40);
  }
  engine.entityLayer.addChild(sprite);
  return sprite;
}

function buildGroundView(engine, entity) {
  const frame = resourceNodeFrame(entity.node);
  const texture = frame?.sheet ? frameTexture(engine, frame.sheet, frame.frameIndex) : null;
  const sprite = groundSprite(engine, entity, frame, texture);
  // #582: a frame whose sheet is not loaded yet is not recorded as drawn, so the refresh draws it.
  entity.view = { kind: 'ground', sprite, sheetPath: texture ? frame?.sheet?.path : null, frameIndex: texture ? frame?.frameIndex : null };
  entity.target = targetFor(engine, entity, sprite);
  if (!texture && frame?.sheet) refreshEntity(engine, entity);
}

/** A Firefly's glow and flapping body (the root is placed by placeFirefly, or held still). */
function fireflySprite(engine, entity, frames) {
  const { PIXI } = engine;
  const root = new PIXI.Container();
  root.zIndex = itemZ(entity.classTsid, Z.firefly);
  root._worldHitW = 72;
  root._worldHitH = 64;
  const glow = new PIXI.Sprite(svgTextures?.glow || PIXI.Texture.EMPTY);
  glow.anchor.set(0.5);
  glow.blendMode = 'add';
  glow.scale.set(0.5);
  const fly = new PIXI.AnimatedSprite(frames);
  fly.anchor.set(0.5);
  fly.y = -32;
  fly.animationSpeed = 0.45;
  fly.gotoAndPlay(hash(entity.key) % frames.length);
  root.addChild(glow, fly);
  engine.entityLayer.addChild(root);
  return { root, glow, fly };
}

function buildFireflyView(engine, entity) {
  const frame = resourceNodeFrame(entity.node);
  const frames = sheetFrames(engine, frame.sheet);
  if (!frames.length) return;
  const { root, glow, fly } = fireflySprite(engine, entity, frames);
  const seed = hash(entity.key);
  entity.view = {
    kind: 'firefly',
    sprite: root,
    fly,
    glow,
    sheet: frame.sheet,
    phase: (seed % 628) / 100,
    hover: 74 + (seed % 70),
    t: 0,
  };
  entity.target = targetFor(engine, entity, root, { airborne: true });
  placeFirefly(entity, 0);
}

function placeFirefly(entity, dtMs) {
  const view = entity.view;
  view.t += dtMs / 1000;
  const t = view.t;
  // GSJS wanders inside a fly box around the spawn point; ease through it.
  view.sprite.x = entity.x + Math.sin(t * 0.37 + view.phase) * 96 + Math.sin(t * 0.91 + view.phase * 2) * 22;
  view.sprite.y = entity.y - view.hover + Math.sin(t * 0.53 + view.phase * 3) * 24 + 32;
  const bounds = frameBounds(view.sheet, view.fly.currentFrame);
  view.glow.x = bounds ? bounds.cx - view.sheet.frameWidth / 2 : 0;
  view.glow.y = view.fly.y + (bounds ? bounds.cy - view.sheet.frameHeight / 2 : 0);
  view.glow.alpha = 0.55 + 0.3 * Math.sin(t * 3.1 + view.phase);
}

/**
 * R5: a node as this feature draws it (groundSprite's frame on its foot, a Firefly's glow and body
 * over its spot), fresh from createResourceNode and with no target: display only, for the nodes of
 * another player's back yard (homes-feature drawVisitorYard). The frame fills in once its sheet
 * loads. Returns the display object, or null for a class with no still (Sloths, Salmon, traps).
 */
export function resourceNodeStill(engine, { classTsid, x, y, key = '' } = {}) {
  const def = getResourceNodeDef(classTsid);
  if (!def || def.art !== 'raster' || classTsid === 'npc_salmon' || classTsid === 'dust_trap') return null;
  const node = createResourceNode(classTsid, { seed: key, now: Date.now() });
  const frame = resourceNodeFrame(node);
  if (!frame?.sheet || frame.hidden) return null;
  const entity = { classTsid: def.classTsid, key: key || classTsid, x, y, node };
  const fly = def.classTsid === 'npc_firefly';
  const holder = fly ? new engine.PIXI.Container() : groundSprite(engine, entity, frame, frameTexture(engine, frame.sheet, frame.frameIndex));
  if (fly) {
    holder.zIndex = itemZ(entity.classTsid, Z.firefly);
    holder.x = x;
    holder.y = y - 74;
    engine.entityLayer.addChild(holder);
  }
  const fill = () => {
    if (holder.destroyed) return;
    if (fly) {
      const frames = sheetFrames(engine, frame.sheet);
      if (!frames.length || holder.children?.length) return;
      const { root } = fireflySprite(engine, entity, frames);
      holder.addChild(root);
      root.zIndex = 0;
      return;
    }
    const texture = frameTexture(engine, frame.sheet, frame.frameIndex);
    if (!texture) return;
    holder.texture = texture;
    holder.anchor.set(0.5, footAnchor(frame.sheet, frame.frameIndex));
  };
  if (sheets.has(frame.sheet.path)) fill();
  else Promise.resolve().then(() => ensureSheet(engine, frame.sheet)).then(fill, () => {});
  return holder;
}

function buildSalmonView(engine, entity) {
  const { PIXI } = engine;
  const def = getResourceNodeDef('npc_salmon');
  const swim = sheetFrames(engine, def.sprite.sheets.swimRight);
  if (!swim.length) return;
  const root = new PIXI.Container();
  root.zIndex = itemZ(entity.classTsid, Z.salmon);
  root._worldHitW = 64;
  root._worldHitH = 44;
  const fish = new PIXI.AnimatedSprite(swim);
  fish.anchor.set(0.5);
  fish.y = -22;
  fish.animationSpeed = 0.4;
  fish.play();
  root.addChild(fish);
  engine.entityLayer.addChild(root);
  const seed = hash(entity.key);
  const dir = seed % 2 ? 1 : -1;
  fish.scale.x = dir;
  entity.view = {
    kind: 'salmon',
    sprite: root,
    fish,
    swim,
    turn: sheetFrames(engine, def.sprite.sheets.turnRight),
    dir,
    turning: false,
    offset: ((seed % 200) - 100) * 0.8,
    range: 130 + (seed % 60),
    depth: 42 + (seed % 5) * 14,
    phase: (seed % 628) / 100,
    t: 0,
  };
  entity.target = targetFor(engine, entity, root);
  placeSalmon(entity, 0);
}

/**
 * Online a street's Salmon swim on the server's clock (js/street-creatures.js salmonSwimAt, from
 * street-objects-feature's sharedClockNow), so every page has each in the same place; one released
 * from a pack (release:<n>) is this player's own and swims its own way.
 */
function placeSharedSalmon(entity, now) {
  const view = entity.view;
  const seed = hash(entity.key);
  const at = salmonSwimAt({ offset0: ((seed % 200) - 100) * 0.8, dir0: seed % 2 ? 1 : -1, range: view.range, phase: view.phase }, now - GAME_EPOCH_MS);
  if (at.turning && !view.turning) {
    // turnRight turns a left-facing fish to face right; mirrored, it turns a right-facing one left.
    view.turning = true;
    view.fish.scale.x = at.dir;
    if (view.turn.length) {
      view.fish.textures = view.turn;
      view.fish.loop = false;
      view.fish.animationSpeed = 0.42;
      view.fish.onComplete = null;
      view.fish.gotoAndPlay(0);
    }
  } else if (!at.turning && (view.turning || view.fish.textures !== view.swim)) {
    view.turning = false;
    view.fish.textures = view.swim;
    view.fish.loop = true;
    view.fish.animationSpeed = 0.4;
    view.fish.play();
  }
  if (!at.turning) view.fish.scale.x = at.dir;
  view.dir = at.dir;
  view.offset = at.offset;
  view.sprite.x = entity.x + at.offset;
  view.sprite.y = entity.y - view.depth + at.bob + 22;
}

function placeSalmon(entity, dtMs, engine = null) {
  const view = entity.view;
  const shared = engine && !String(entity.key).startsWith('release:') ? engine.query?.('sharedClockNow', engine) : null;
  if (Number.isFinite(shared)) {
    placeSharedSalmon(entity, shared);
    return;
  }
  view.t += dtMs / 1000;
  if (!view.turning) {
    view.offset += view.dir * 0.042 * dtMs;
    if (Math.abs(view.offset) >= view.range && Math.sign(view.offset) === view.dir) {
      view.turning = true;
      // turnRight turns a left-facing fish to face right; mirrored, it turns a right-facing one left.
      if (view.turn.length) {
        view.fish.scale.x = -view.dir;
        view.fish.textures = view.turn;
        view.fish.loop = false;
        view.fish.animationSpeed = 0.42;
        view.fish.onComplete = () => {
          view.dir = -view.dir;
          view.fish.scale.x = view.dir;
          view.fish.textures = view.swim;
          view.fish.loop = true;
          view.fish.animationSpeed = 0.4;
          view.fish.onComplete = null;
          view.fish.play();
          view.turning = false;
        };
        view.fish.gotoAndPlay(0);
      } else {
        view.dir = -view.dir;
        view.fish.scale.x = view.dir;
        view.turning = false;
      }
    }
  }
  view.sprite.x = entity.x + view.offset;
  view.sprite.y = entity.y - view.depth + Math.sin(view.t * 1.7 + view.phase) * 7 + 22;
}

function buildDustTrapView(engine, entity) {
  const { PIXI } = engine;
  const sprite = new PIXI.Sprite(PIXI.Texture.EMPTY);
  sprite.x = entity.x;
  sprite.y = entity.y + 2;
  sprite.zIndex = itemZ(entity.classTsid, Z.trap);
  engine.entityLayer.addChild(sprite);
  // Collision-only in GSJS: no menu target, so E never selects it by accident.
  entity.view = { kind: 'trap', sprite };
  refreshTrap(engine, entity);
}

function refreshTrap(engine, entity) {
  const frame = resourceNodeFrame(entity.node);
  const texture = frame?.sheet ? frameTexture(engine, frame.sheet, frame.frameIndex) : null;
  if (!texture) return;
  const sprite = entity.view.sprite;
  sprite.texture = texture;
  sprite.anchor.set(0.5, footAnchor(frame.sheet, 0));
}

function buildSlothView(engine, entity) {
  const { PIXI } = engine;
  const geo = slothGeometry(entity);
  // The target's box (the root, anchored bottom centre as every world thing): the hanging sloth
  // across, from the leaves it hides in down to the floor under it.
  const root = new PIXI.Container();
  root.x = (geo.box.left + geo.box.right) / 2;
  root.y = geo.box.bottom;
  root.zIndex = itemZ(entity.classTsid, Z.tree);
  root._worldHitW = geo.box.right - geo.box.left;
  root._worldHitH = geo.box.bottom - geo.box.top;
  // The sloth in the SWF's depth order: under the rod, the rod in hand, the paw over it, all three
  // mirrored together for a sloth on the left of its trunk (the anchors are each sheet's origin).
  const art = new PIXI.Container();
  art.x = geo.origin.x - root.x;
  art.y = geo.origin.y - root.y;
  art.scale.x = geo.dir;
  const layer = () => new PIXI.Sprite(PIXI.Texture.EMPTY);
  const body = layer();
  const rod = layer();
  const paw = layer();
  art.addChild(body, rod, paw);
  root.addChild(art);
  // The Knocker on the trunk (sloth_knocker: obey_physics false, its point the art's bottom centre).
  const knocker = new PIXI.Sprite(textureFromUrl(`${SLOTH_ART_DIR}${SLOTH_KNOCKER_ART.still}`));
  knocker.anchor.set(SLOTH_KNOCKER_ART.origin.x / SLOTH_KNOCKER_ART.knock.cell.w, SLOTH_KNOCKER_ART.origin.y / SLOTH_KNOCKER_ART.knock.cell.h);
  knocker.x = geo.knocker.x;
  knocker.y = geo.knocker.y;
  knocker.zIndex = itemZ('sloth_knocker', Z.tree);
  // sloth_knocker.js getAssetInfo position: 34 x 52 over its point.
  knocker._worldHitW = 34;
  knocker._worldHitH = 52;
  engine.entityLayer.addChild(root, knocker);
  const frame = resourceNodeFrame(entity.node);
  entity.view = {
    kind: 'sloth', sprite: root, art, body, rod, paw, knocker, geo,
    anim: '', animAt: 0, rodIndex: 1, steps: [], idleAt: 0, state: 'hidden', out: false,
    peekAt: 0, knockAt: 0, spits: [],
  };
  entity.target = targetFor(engine, entity, root, { airborne: true, speechOffset: { x: geo.speech.x - root.x, y: 0 } });
  entity.view.target = entity.target;
  entity.knockerTarget = knockerTargetFor(engine, entity, knocker);
  warmSloth(engine, ['hidden', 'peek', 'peekIdle', 'peekWithdraw', 'drop', 'hangIdle1', 'hangIdle2']);
  const now = Date.now();
  if (frame?.state === 'eating') setSlothAnim(engine, entity.view, 'eat', now);
  else if (frame?.state === 'idle') slothToIdle(entity.view, now);
  else setSlothAnim(engine, entity.view, 'hidden', now);
  entity.view.out = frame?.state !== 'hidden';
  entity.view.state = frame?.state === 'hidden' ? 'hidden' : 'idle';
  drawSloth(engine, entity.view, now);
}

/** Show `label` from its first cell (the layers' anchors are each sheet's sprite origin). */
function setSlothAnim(engine, view, label, now) {
  const sheet = SLOTH_SHEETS[label];
  if (!sheet) return;
  if (view.target) {
    const tip = /^(hidden|peek|climbUp)/.test(label) ? view.geo.speech.hiding : view.geo.speech.hanging;
    view.target.artHeight = view.sprite.y - tip;
  }
  view.anim = label;
  view.animAt = now;
  const anchor = (spr, s) => spr.anchor.set(s.origin.x / s.cell.w, s.origin.y / s.cell.h);
  anchor(view.body, sheet);
  view.rod.visible = Boolean(sheet.rods);
  view.paw.visible = Boolean(sheet.paw);
  if (sheet.paw) anchor(view.paw, sheet.paw);
}

function drawSloth(engine, view, now) {
  const sheet = SLOTH_SHEETS[view.anim];
  if (!sheet) return;
  const cell = slothCellAt(view.anim, now - view.animAt, SLOTH_LOOPERS.includes(view.anim));
  const pick = (s) => slothFrames(engine, s)[cell] || engine.PIXI.Texture.EMPTY;
  view.body.texture = pick(sheet);
  if (sheet.rods) {
    const rodSheet = sheet.rods[Math.max(0, Math.min(sheet.rods.length - 1, view.rodIndex - 1))];
    view.rod.anchor.set(rodSheet.origin.x / rodSheet.cell.w, rodSheet.origin.y / rodSheet.cell.h);
    view.rod.texture = pick(rodSheet);
    view.paw.texture = pick(sheet.paw);
  }
  if (view.knockAt) {
    const k = SLOTH_KNOCKER_ART.knock;
    const n = Math.floor(((now - view.knockAt) * 30) / 1000);
    if (n >= k.count || now - view.knockAt >= 1000) {
      view.knockAt = 0;
      view.knocker.texture = textureFromUrl(`${SLOTH_ART_DIR}${SLOTH_KNOCKER_ART.still}`);
    } else {
      view.knocker.texture = sheetFrameTexture(sourceFromUrl(`${SLOTH_ART_DIR}${k.file}`),
        new engine.PIXI.Rectangle((n % k.cols) * k.cell.w, Math.floor(n / k.cols) * k.cell.h, k.cell.w, k.cell.h));
    }
  }
}

/** onIdleTick: hand the sloth to its idle ticks from now. */
function slothToIdle(view, now) {
  view.state = 'idle';
  view.idleAt = now;
}

/** Play one js/sloth-encounter.js event on a Sloth (replacing what was playing). */
function playSloth(engine, entity, event, opts = {}) {
  const view = entity.view;
  if (!view || view.kind !== 'sloth') return;
  const now = Date.now();
  // setState cancels the state timers, not a line already on its way (the drop line's talk timer).
  const kept = view.steps.filter((step) => step.keep);
  view.eatLoop?.stop();
  view.eatLoop = null;
  view.steps = [...kept, ...slothTimeline(event, opts).map((step) => ({ ...step, at: now + step.at }))].sort((a, b) => a.at - b.at);
  view.state = 'busy';
  view.leaving = view.steps.some((step) => step.hidden);
  placeSloth(engine, entity, 0, now);
}

/**
 * createSnail / createSnailItem (367-430): each round of 1-4 Snails goes into the pack 1.2 s after
 * its spit (resource-nodes.js takeDueSnails), floated over the player as it lands. Rounds due while
 * you were away are waiting when you come back, as they lay on the street's floor in Glitch.
 */
function paySlothSnails(engine, entity, now) {
  const n = takeDueSnails(entity.node, now);
  if (!n) return 0;
  addItem(engine.inv, 'snail', n);
  const p = engine.player;
  if (p) floatGain(engine, p.x, (p.y || 0) - 130, 'snail', n);
  engine.refreshPack?.();
  engine.save?.();
  return n;
}

/** talk (852-881): one of its lines in a bubble, never the one it said last (chooseTalk). */
function slothSay(engine, entity, key, ms) {
  const view = entity.view;
  if (!view || !entity.target) return;
  const line = chooseSlothLine(key, view.lastLine);
  view.lastLine = line;
  engine.say?.(entity.target, line, ms, { exact: true });
}

function refreshSloth(engine, entity) {
  const view = entity.view;
  const state = resourceNodeFrame(entity.node)?.state || 'hidden';
  const wasOut = view.out;
  view.out = state !== 'hidden';
  // hideSloth: 20 s without a rod, it yawns and climbs away (a full one is already climbing).
  if (wasOut && !view.out && !view.leaving) playSloth(engine, entity, 'hide');
}

function placeSloth(engine, entity, dtMs, now) {
  const view = entity.view;
  while (view.steps.length && now >= view.steps[0].at) {
    const step = view.steps.shift();
    if (step.anim) setSlothAnim(engine, view, step.anim, step.at);
    if (step.rod) view.rodIndex = step.rod;
    if (step.stopEat || step.eatSound) {
      view.eatLoop?.stop();
      view.eatLoop = null;
    }
    if (step.sound) engine.playSound?.(step.sound, { volume: 0.6 });
    // announce_sound SLOTH_EAT with a loop count of 10 (720-727, 409), until the spit stops it.
    if (step.eatSound) view.eatLoop = engine.playSoundLoop?.('SLOTH_EAT', { durationMs: 10000, volume: 0.5 }) || null;
    if (step.say && entity.target) {
      slothSay(engine, entity, step.say, step.ms);
      // talk 874-877: hanging idle, it talks for as long as the line shows, then idles again.
      if (view.state === 'idle') {
        setSlothAnim(engine, view, 'talk', step.at);
        view.idleAt = step.at + step.ms;
      }
    }
    if (step.idle) slothToIdle(view, step.at);
    if (step.hidden) {
      setSlothAnim(engine, view, 'hidden', step.at);
      view.state = 'hidden';
      view.leaving = false;
    }
  }
  if (view.state === 'idle' && now >= view.idleAt) {
    const tick = slothIdleTick();
    setSlothAnim(engine, view, tick.anim, now);
    view.idleAt = now + tick.nextMs;
  }
  while (view.spits.length && now >= view.spits[0]) {
    view.spits.shift();
    spitSnail(engine, entity);
  }
  drawSloth(engine, view, now);
  // QA: the QA Sloth's animation (and rod) as canvas data-sloth-anim.
  const shown = `${view.anim}${SLOTH_SHEETS[view.anim]?.rods ? `:rod${view.rodIndex}` : ''}`;
  if (view.shown !== shown) {
    view.shown = shown;
    if (entity === demoEntity) engine.setData?.('slothAnim', shown);
    // Every Sloth's (G891 QA): key:anim, so a check can see a street's own Sloth peek or drop.
    else engine.setData?.('slothAnims', entities.filter((e) => e.view?.kind === 'sloth' && e !== demoEntity).map((e) => `${e.key}:${e.view.shown || ''}`).join(';'));
  }
}

function spawnView(engine, entity) {
  if (entity.view) return;
  const def = getResourceNodeDef(entity.classTsid);
  if (def.art === 'swf') return buildSlothView(engine, entity);
  if (entity.classTsid === 'dust_trap') return buildDustTrapView(engine, entity);
  const frame = resourceNodeFrame(entity.node);
  if (frame?.hidden) return;
  if (entity.classTsid === 'npc_firefly') return buildFireflyView(engine, entity);
  if (entity.classTsid === 'npc_salmon') return buildSalmonView(engine, entity);
  return buildGroundView(engine, entity);
}

/** Bring the view in line with node state (frames, respawns, captures). */
function refreshEntity(engine, entity) {
  const myGeneration = generation;
  const missing = sheetsNeeded(entity.node).filter((def) => !sheets.has(def.path));
  if (missing.length) {
    Promise.all(missing.map((def) => ensureSheet(engine, def))).then(() => {
      // A sheet that failed to load is not asked for again in a loop.
      if (!missing.every((def) => sheets.has(def.path))) return;
      if (myGeneration === generation && entities.includes(entity)) refreshEntity(engine, entity);
    });
    return;
  }
  const frame = resourceNodeFrame(entity.node);
  if (frame?.hidden) {
    if (entity.view) dropTarget(engine, entity);
    return;
  }
  if (!entity.view) {
    spawnView(engine, entity);
    return;
  }
  if (entity.view.kind === 'sloth') refreshSloth(engine, entity);
  else if (entity.view.kind === 'trap') refreshTrap(engine, entity);
  else if (entity.view.kind === 'ground' && frame?.sheet) {
    if (entity.view.sheetPath !== frame.sheet.path || entity.view.frameIndex !== frame.frameIndex) {
      const texture = frameTexture(engine, frame.sheet, frame.frameIndex);
      if (texture) {
        entity.view.sprite.texture = texture;
        entity.view.sprite.anchor.set(0.5, entity.wall ? 1 : footAnchor(frame.sheet, frame.frameIndex));
        entity.view.sheetPath = frame.sheet.path;
        entity.view.frameIndex = frame.frameIndex;
      }
    }
  }
  if (entity.target) entity.target.subtitle = resourceNodeStatusLabel(entity.node) || entity.target.subtitle;
}

// ---------------------------------------------------------------------------
// Effects
// ---------------------------------------------------------------------------

function addEffect(engine, display, update) {
  engine.fxLayer.addChild(display);
  effects.push({ display, update, t: 0 });
}

function clearEffects() {
  for (const fx of effects) {
    fx.display.parent?.removeChild(fx.display);
    if (!fx.display.destroyed) fx.display.destroy({ children: true });
  }
  effects = [];
  jarFx = null;
}

function tickEffects(dtMs) {
  effects = effects.filter((fx) => {
    fx.t += dtMs;
    const alive = fx.update(fx.t, fx.display) !== false && !fx.display.destroyed;
    if (!alive) {
      fx.display.parent?.removeChild(fx.display);
      if (!fx.display.destroyed) fx.display.destroy({ children: true });
    }
    return alive;
  });
}

/** Captured Fireflies stream into the jar at the avatar's hand. */
function flyToPlayer(engine, from, delayMs) {
  if (!svgTextures?.glow) return;
  const { PIXI } = engine;
  const dot = new PIXI.Sprite(svgTextures.glow);
  dot.anchor.set(0.5);
  dot.blendMode = 'add';
  dot.scale.set(0.45);
  dot.x = from.x;
  dot.y = from.y;
  addEffect(engine, dot, (t) => {
    const k = Math.min(1, Math.max(0, (t - delayMs) / 700));
    const player = engine.player;
    const tx = player.x + 18;
    const ty = player.y - 64;
    const e = k * k * (3 - 2 * k);
    dot.x = from.x + (tx - from.x) * e + Math.sin(k * Math.PI * 3) * 14 * (1 - k);
    dot.y = from.y + (ty - from.y) * e - Math.sin(k * Math.PI) * 30;
    dot.scale.set(0.45 * (1 - k * 0.6));
    return k < 1;
  });
}

function showJar(engine, flies, state = 'closing') {
  const def = fireflyJarSheet(flies, state);
  ensureSheet(engine, def).then((sheet) => {
    if (!sheet || !engine.player) return;
    const frames = sheetFrames(engine, def);
    if (!frames.length) return;
    if (jarFx && !jarFx.destroyed) jarFx.alpha = 0;
    const jarSprite = new engine.PIXI.AnimatedSprite(frames);
    anchorBottomCentre(jarSprite, 'held');
    jarSprite.scale.set(0.7);
    jarSprite.loop = false;
    jarSprite.animationSpeed = 0.35;
    jarSprite.play();
    jarFx = jarSprite;
    addEffect(engine, jarSprite, (t) => {
      jarSprite.x = engine.player.x + 30;
      jarSprite.y = engine.player.y - 58;
      jarSprite.alpha = t < 1600 ? 1 : Math.max(0, 1 - (t - 1600) / 400);
      return t < 2000 && jarSprite.alpha > 0;
    });
  });
}

function spitSnail(engine, entity) {
  const { PIXI } = engine;
  const snail = new PIXI.Sprite(textureFromUrl('assets/sprites/icons/snail.webp'));
  snail.anchor.set(0.5);
  snail.scale.set(0.6);
  const from = entity.view?.geo?.mouth || slothGeometry(entity).mouth;
  const to = { x: engine.player.x, y: engine.player.y - 40 };
  addEffect(engine, snail, (t) => {
    const k = Math.min(1, t / 650);
    snail.x = from.x + (to.x - from.x) * k;
    snail.y = from.y + (to.y - from.y) * k - Math.sin(k * Math.PI) * 70;
    snail.rotation = k * 6;
    snail.alpha = k > 0.85 ? (1 - k) / 0.15 : 1;
    return k < 1;
  });
}

// ---------------------------------------------------------------------------
// Verbs
// ---------------------------------------------------------------------------

function nearbyFireflies(engine, entity) {
  const px = engine.player.x;
  const py = engine.player.y;
  return entities
    .filter((other) => other !== entity && other.classTsid === 'npc_firefly' && other.view)
    .map((other) => ({ other, d: Math.hypot(other.view.sprite.x - px, other.view.sprite.y - py) }))
    .filter((row) => row.d <= WHISTLE_RADIUS)
    .sort((a, b) => a.d - b.d)
    .map((row) => row.other.node);
}

/**
 * The Shovels and Aces of Spades in the pack, unit by unit in pack order ({ cls, copy }): the
 * order findFirst walks (bag.js 672-694, pack-slots.js unitPlaces), so a Peat Bog or a Dirt Pile
 * takes the first working one (peat_1.js 345-351, dirt_pile.js 211-212). Null without a layout.
 */
const PACK_ORDER_CLASSES = Object.freeze(['shovel', 'ace_of_spades']);
export function packToolOrder(layout, classes = PACK_ORDER_CLASSES) {
  if (!Array.isArray(layout?.pack?.slots)) return null;
  const out = [];
  const seen = {};
  const add = (slot) => {
    if (slot?.kind !== 'stack' || !classes.includes(slot.cls)) return;
    for (let k = 0; k < Math.max(1, Math.floor(Number(slot.count) || 1)); k += 1) {
      out.push({ cls: slot.cls, copy: seen[slot.cls] || 0 });
      seen[slot.cls] = (seen[slot.cls] || 0) + 1;
    }
  };
  for (const slot of layout.pack.slots) {
    if (slot.kind === 'bag') (layout.bags?.[slot.key]?.slots || []).forEach(add);
    else add(slot);
  }
  return out;
}

function verbContext(engine, entity, verbId) {
  // Multiplayer (street-objects-feature): the realtime server's go-ahead for a Dirt Pile dig carries
  // its roll (the skill's Loam drop, the first draw) and whether the crew's help made the yield Loam
  // (dirt_pile.js onDigComplete 380-389). Solo never has a grant.
  const grant = verbId && entity?.target ? engine.query?.('sharedVerbGrant', entity.target, menuVerbId(verbId), engine) : null;
  let roll = Number.isFinite(grant?.roll) ? Math.min(0.999999, Math.max(0, grant.roll)) : null;
  const shared = grant ? {
    rng: () => {
      if (roll == null) return Math.random();
      const r = roll;
      roll = null;
      return r;
    },
    loamBonus: grant.help?.loam === true,
  } : {};
  // A tool the player named (a drag, or the tool's own pack verb: js/tool-choice.js).
  const chosen = entity?.target ? peekToolChoice(entity.target) : null;
  let toolOrder = null;
  try {
    toolOrder = packToolOrder(engine.query?.('packLayout', engine));
  } catch {
    toolOrder = null;
  }
  return {
    ...shared,
    verbId,
    ...(chosen ? { tool: chosen.cls, toolCopy: chosen.copy } : {}),
    toolOrder,
    // inc_skill_packages.js 538-541: Rubeweed x1.25 on a package's drop chance (the Dirt Pile's Loam).
    rubeweed: Boolean(engine.hasBuff?.('rubeweed')),
    // jellisac.js 183: Max Luck always brings the Super Harvest (#732).
    maxLuck: Boolean(engine.hasBuff?.('max_luck')),
    skills: engine.learnedSkills,
    // Imagination upgrades (scraping/scooping speed, ice and peat yield, dirt and peat daily limits).
    upgrades: engine.pc?.imaginationUpgrades || [],
    achievements: engine.unlockedAchievements,
    toolState: engine.toolState,
    now: Date.now(),
    // The jar this whistle fills (its own Fireflies); `copy` is which one, for applyResult.
    jar: entity.classTsid === 'npc_firefly' ? (({ copy, flies }) => ({ flies, copy }))(fireflyJarInUse(engine)) : { flies: 0 },
    nearby: entity.classTsid === 'npc_firefly' ? nearbyFireflies(engine, entity) : [],
    // The QA Sloth skips the Animal Kinship 3 gate; real Sloths keep it.
    requireSkill: entity !== demoEntity && !demoKitOnly,
    // Firefly Whistling gates the jar (firefly_jar.js); the QA Firefly skips it.
    requireAchievement: entity !== demoEntity,
  };
}

/** Firefly collision: the player's box against a Firefly's (its glow, not its spawn point). */
export function fireflyTouches(player, fly) {
  if (!player || !fly) return false;
  return Math.abs(fly.x - player.x) <= 56 && fly.y <= player.y + 8 && fly.y >= player.y - 150;
}

function fireflyQuestCtx(engine) {
  return {
    level: engine.pc.level,
    xp: engine.pc.xp,
    skills: engine.learnedSkills,
    achievements: engine.unlockedAchievements,
    inv: engine.inv,
    pc: engine.pc,
    hub: engine.street?.hubId || '',
    now: Date.now(),
  };
}

/**
 * npc_firefly.js wandering_onMsg: a collision while firefly_whistle is 'none'
 * shows the two lines, then the familiar offers the quest (main.js done_payload).
 */
function checkFireflyOffer(engine) {
  if (fireflyOffer.shown || !fireflyOffer.allowed) return;
  if (engine.busy() || engine.questOffersHeld?.()) return;
  if (questStatus(engine.questState, FIREFLY_WHISTLE_QUEST) !== 'none') return;
  const p = engine.player;
  const touched = entities.find((e) => e.view?.kind === 'firefly' && fireflyTouches(p, { x: e.view.sprite.x, y: e.view.sprite.y + e.view.fly.y }));
  if (!touched) return;
  const card = npcQuestOffers(engine.questState, 'npc_firefly', engine.pc, fireflyQuestCtx(engine)).offered
    .find((c) => c.classTsid === FIREFLY_WHISTLE_QUEST);
  if (!card) return;
  fireflyOffer.shown = true;
  engine.setData('fireflyOffer', 'lines');
  // G313: a street change cancels the lines, but the second one's done_payload is still sent
  // (AbstractAnnouncementOverlay.as 645-663), so the familiar offers it once the new street is up.
  vpSequence(engine, FIREFLY_OFFER_LINES).then((ran) => (ran === false ? engine.afterStreetCard?.() : null)).then(() => {
    engine.setData('fireflyOffer', 'offered');
    engine.playSound('QUEST_OFFER', { volume: 0.55 });
    // G267: firefly_whistle has onStarted (firefly_whistle.js 52), so quest.js get_status
    // 1105-1117 gives its offer both choices: accept_and_start and "Not right now"
    // (value accept: in the log, not started, G229). It is_emergency (12): the rays, no X.
    // Under no_starting_quests the accept is disabled (ConversationManager.as 582-585).
    const startable = card.startable === true;
    // quests_offer lists it as offered: pushed off screen unanswered, the familiar shows the
    // emergency again (QuestsDialog.as onEmergencyTick 335-378; quest-offers-feature presentOffer).
    markOffered(engine.questState, FIREFLY_WHISTLE_QUEST, Date.now());
    engine.offerQuestDialogue({
      title: card.def.title,
      kicker: 'Magic Rock',
      beats: card.beats,
      acceptLabel: card.acceptLabel,
      declineLabel: card.declineLabel,
      declinable: startable,
      note: card.moveNote, // #83: accepting moves you
      urgent: card.emergency === true,
      acceptBlocked: startable && engine.query?.('noStartingQuests', engine) === true ? 'Starting new quests is not allowed right now!' : '',
      onAccept: () => {
        const result = acceptOffer(engine.questState, FIREFLY_WHISTLE_QUEST, fireflyQuestCtx(engine));
        engine.setData('fireflyOffer', result.ok ? 'accepted' : result.reason || 'failed');
        if (result.ok) engine.pushActivity(`New quest: ${card.def.title}`);
        engine.save();
      },
      onDecline: startable ? () => {
        // "Not right now": the quest waits in the log with Try it (quest-offers-feature putOffCards).
        const result = putOffOffer(engine.questState, FIREFLY_WHISTLE_QUEST, Date.now());
        engine.setData('fireflyOffer', result.ok ? 'putoff' : result.reason || 'failed');
        if (result.ok) {
          engine.pushActivity(`“${card.def.title}” is in your quest log, not started yet. Choose Try it there when you are ready.`);
          // QuestManager.as 345-351: just accepting opens the Quests dialog on the quest.
          if (typeof document !== 'undefined' && document.getElementById('quest-panel')?.hidden) document.getElementById('quest-btn')?.click();
        }
        engine.save();
        engine.updateHud?.();
      } : null,
    });
    if (engine.param('fireflyofferautoplay') === 'accept') setTimeout(() => engine.acceptOpenOffer(), 400);
  });
}

function itemLabel(classTsid, qty) {
  const def = RESOURCE_ITEM_DEFS[classTsid] || DUST_TRAP_DROP_ITEM_DEFS[classTsid];
  if (def) return `${qty} ${qty === 1 ? def.label : def.plural}`;
  const item = ITEM_CATALOG[classTsid];
  const label = item?.label || String(classTsid).replace(/_/g, ' ');
  return `${qty} ${qty === 1 ? label : item?.namePlural || label}`;
}

function notePublishResult(result) {
  const outs = (result.outputs || []).map((o) => `${o.classTsid}x${o.qty}`).join('+');
  lastHarvest = [result.classTsid || '', result.verbId || '', result.ok ? 'ok' : result.reason || 'fail', outs].join(':');
}

export function sfxFor(result) {
  if (result.jarFull) return 'COMPLETE_QUEST_REQUIREMENT';
  if (result.classTsid === 'paper_tree') return result.verbId === 'pet' ? 'PET_TRANT' : result.verbId === 'water' ? 'WATERING_CAN' : 'PAPER_TREE';
  if (result.classTsid === 'dust_trap') return 'DUST_TRAP_SMACK_DOWN';
  // G889: the Sloth's sounds come at their own moments (the knock as it starts, js/sloth-encounter.js).
  if (result.classTsid === 'npc_sloth') return null;
  if (result.classTsid === 'npc_salmon') return 'SALMON_CATCH';
  if (result.classTsid === 'npc_firefly') return 'BUTTERFLY_SING';
  // #310: the scraper sounded while the scrape ran (js/sound-moments.js actionLoopFor); the end is the
  // node's own: mortar_barnacle.js 296 BARNACLE_IS_RELEASED, ice_knob.js 320 ICE_CUBE.
  if (result.verbId === 'scrape' && result.classTsid === 'mortar_barnacle') return 'BARNACLE_IS_RELEASED';
  if (result.verbId === 'scrape' && result.classTsid === 'ice_knob') return 'ICE_CUBE';
  // A dig or a peat cut had no sound at the end: the Shovel sounded while it ran (actionLoopFor) and
  // onDigComplete / onHarvestComplete announce none (dirt_pile.js 293-487, peat_1.js 233-316).
  if ((result.verbId === 'dig' && result.classTsid === 'dirt_pile') || (result.verbId === 'harvest' && /^peat_\d$/.test(String(result.classTsid)))) return null;
  return { scrape: 'SCRAPER', scoop: 'SCOOPED_JELLISAC', dig: 'SHOVEL', harvest: 'HOE' }[result.verbId] || 'ITEM_PICKUP';
}

/**
 * sendResponse(key, pc, slugs) after a scrape, peat harvest or dig: the
 * energy, mood and iMG the package moved (inc_skill_packages.js 485-575),
 * plus a drop's currants and favor (557-571). mortar_barnacle.js 290,
 * ice_knob.js 308, peat_1.js 288-293, dirt_pile.js 360-445
 * (js/verb-responses.js resourceNodeResponseKey).
 */
export function talkbackFor(result, drop = null) {
  if (!result?.ok) return null;
  const hit = Boolean(drop?.hit && drop.result);
  const key = resourceNodeResponseKey(result.classTsid, {
    qty: result.outputs?.[0]?.qty || 0,
    gotDrop: hit,
    gone: result.dugOut === true,
    loam: result.loam === true,
    helped: result.helped === true,
  });
  if (!key) return null;
  return verbResponse(result.classTsid, key, {
    slugs: slugsFromEffects({
      ...result.effects,
      currants: hit ? Number(drop.result.currants) || 0 : 0,
      favor: hit && Array.isArray(drop.result.favor) && drop.result.favor.length ? drop.result.favor : 0,
    }),
  });
}

/**
 * #146: one item a node gave, floated as its icon beside "+N label" (game.js floatText opts.icon). Every
 * resource node's gains come through here (applyResult): Dust Traps, peat, barnacles, jellisacs, ice...
 */
export function floatGain(engine, x, y, classTsid, qty) {
  return engine.floatText(x, y, `+${itemLabel(classTsid, qty)}`, 0xfff4d6, { icon: classTsid });
}

/**
 * #732: any node's Super Harvest shows Tiny Speck's arc with its RAINBOW_SUPERHARVEST (jellisac.js
 * 183-196 show_rainbow('rainbow_superharvest', 1000); game.js showSuperHarvestFx), read from the
 * result's bonus output so every node that grants one gets it. True when it was shown.
 */
export function announceSuperHarvest(engine, result) {
  if (!result?.ok) return false;
  const bonus = (result.outputs || []).filter((o) => o.superHarvest && !o.due);
  if (!bonus.length) return false;
  const qty = bonus.reduce((sum, o) => sum + (Number(o.qty) || 0), 0);
  engine.superHarvest?.(bonus[0].classTsid, qty);
  return true;
}

function applyResult(engine, entity, result) {
  notePublishResult(result);
  if (!result.ok) {
    engine.toast(result.message, 2400);
    publish(engine);
    return;
  }
  // Gains float over the player, as a Dust Trap's finds do (drops-feature payDrop): over the node
  // they sat under its talkback bubble. The node itself is the fallback when there is no player.
  const p = engine.player;
  const anchorX = p ? p.x : entity.view?.sprite?.x ?? entity.x;
  const anchorY = p ? (p.y || 0) - 130 : (entity.view?.sprite?.y ?? entity.y) - 60;
  // #640: a node that answers in its bubble (talkbackFor) has said it: its lines go to the log only.
  const answers = Boolean(entity.target && talkbackFor(result));
  for (const line of result.msgs || []) {
    if (answers && engine.notify?.gain) engine.notify.gain(line);
    else engine.pushActivity(line);
  }
  let lift = 0;
  const merged = new Map();
  // A Sloth's Snails float as each round reaches the pack (paySlothSnails), not here.
  // G953 (#436): a Super Harvest's bonus floats on its own, beside its own log line (jellisac.js
  // 182-205 granted it apart), so no float says the sum while the log says the parts.
  for (const out of result.outputs || []) if (!out.due && !out.superHarvest) merged.set(out.classTsid, (merged.get(out.classTsid) || 0) + out.qty);
  const floats = [...merged].concat((result.outputs || []).filter((o) => o.superHarvest && !o.due).map((o) => [o.classTsid, o.qty]));
  for (const [classTsid, qty] of floats) {
    floatGain(engine, anchorX, anchorY - lift, classTsid, qty);
    lift += 28;
  }
  for (const counter of result.achievementCounters || []) engine.achievement(counter.counter, counter.amount);
  // Skill-package rare drops (scraping, jellisac, peat, paper tree): features/drops-feature.js.
  const drop = rollResourceNodeDrop(engine, result);
  // The node's talkback with the package's slugs (barnacle, ice, peat, dirt; see talkbackFor).
  const answer = talkbackFor(result, drop);
  if (answer && entity.target) engine.say(entity.target, answer.text, answer.durationMs, { slugs: answer.slugs });
  else if (result.costs?.xp) engine.floatText(anchorX, anchorY - lift, `+${result.costs.xp} iMG`, 0xd7b8ff);
  const sfx = sfxFor(result);
  if (sfx) engine.playSound(sfx, { volume: 0.6, jitter: 0.05 });
  announceSuperHarvest(engine, result);

  if (entity.classTsid === 'npc_firefly') {
    const filled = normalizeFireflyJarState(result.jar || {});
    if (Number.isInteger(result.jar?.copy) && result.jar.copy >= 0) setFireflyJar(engine, result.jar.copy, filled.flies);
    (result.captured || []).forEach((node, index) => {
      const owner = entities.find((other) => other.node === node);
      if (owner?.view) {
        flyToPlayer(engine, { x: owner.view.sprite.x, y: owner.view.sprite.y - 32 }, index * 140);
        dropTarget(engine, owner);
      }
    });
    showJar(engine, filled.flies);
  } else if (entity.classTsid === 'npc_sloth' && result.verbId === 'knock' && result.slothAnswer && entity.view) {
    // callSloth 312-336: full, or no Metal Rod with you: it stays up in the leaves and says so.
    const view = entity.view;
    const now = Date.now();
    // Answered at once (no knock bar), so the Knocker knocks here (sloth_knocker.js 52-54).
    if (!view.knockAt) {
      view.knockAt = now;
      engine.playSound?.('SLOTH_KNOCKER', { volume: 0.6 });
    }
    if (result.slothAnswer === 'full' && view.state === 'hidden' && now - view.peekAt > SLOTH_FULL_PEEK_GAP_MS) {
      view.peekAt = now;
      playSloth(engine, entity, 'peek');
    }
    slothSay(engine, entity, result.slothAnswer, 5000);
  } else if (entity.classTsid === 'npc_sloth' && result.verbId === 'knock') {
    warmSloth(engine, ['talk', 'eat', 'spit', 'finishedEating', 'climbUp']);
    playSloth(engine, entity, 'arrive');
  } else if (entity.classTsid === 'npc_sloth' && result.verbId === 'feed') {
    const view = entity.view;
    if (view && result.slothPlan) {
      // The Snails leave its mouth as each spit lands (createSnailItem, 1.2 s after createSnail).
      const now = Date.now();
      view.spits = result.slothPlan.rounds.flatMap((round) => Array.from({ length: round.snails }, (_, i) => now + round.atMs + 1200 + i * 150));
      playSloth(engine, entity, 'feed', { plan: result.slothPlan, full: entity.node.sessionFeeds > 7 });
    }
    if (slothsChewing(entities, Date.now()) >= 3) engine.grantAchievement?.('circle_crunch');
  }
  refreshEntity(engine, entity);
  engine.refreshPack();
  engine.save();
  publish(engine);
}

/**
 * npc_sloth.js:290-301 Circle Crunch: Sloths on this street still chewing a
 * Metal Rod you fed them (the source keeps `feeder` until metalizeComplete;
 * solo, every chewing Sloth was fed by you).
 */
export function slothsChewing(list, now = Date.now()) {
  return (list || []).filter((e) => e?.classTsid === 'npc_sloth' && Number(e.node?.busyUntil) > now).length;
}

/** A shared node's verb with the stock left to the realtime server: tools, skills, energy, daily limits. */
function ownSide(engine, entity, verbId) {
  const def = getResourceNodeDef(entity.classTsid);
  const full = { ...entity.node, units: def?.stock?.max ?? entity.node.units, depleted: false, petted: false, watered: false };
  return resourceNodeVerbs(full, engine.inv, engine.pc, verbContext(engine, entity)).find((v) => v.id === verbId) || null;
}

function performVerb(engine, entity, verbId) {
  const ctx = verbContext(engine, entity, verbId);
  if (entity?.target) takeToolChoice(entity.target);
  // runSkillPackage rolls the package's drop before the node's own callback (inc_skill_packages.js
  // 536-545), which a Jellisac reads (jellisac.js 182: no Super Harvest with a drop).
  let preDrop = null;
  ctx.rollDrop = () => {
    preDrop = rollResourceNodeDrop(engine, { ok: true, classTsid: entity.classTsid, verbId: rulesVerbId(verbId) }, { pay: false });
    return Boolean(preDrop?.hit && preDrop.result);
  };
  const result = harvestResourceNode(entity.node, engine.inv, engine.pc, ctx);
  if (result.ok && preDrop) result.preDrop = preDrop;
  applyResult(engine, entity, result);
  // Help dig in multiplayer (features/help-mine-feature.js): the crew's bonus, after the dig's own yield.
  if (result.ok && engine.mode === 'multiplayer') engine.query?.('resourceNodeUsed', entity.target, result, engine);
  return result;
}

// ---------------------------------------------------------------------------
// Pocket Salmon: Release (G178)
// ---------------------------------------------------------------------------

function releaseGate(engine) {
  return salmonReleaseConditions({ hubId: engine.street?.hubId, salmonCount: swimmingSalmonCount(entities) });
}

/** salmon.js:71 createItemStack('npc_salmon', 1, pc.x, pc.y): back in the water where you stand. */
function salmonBackInWater(engine) {
  const p = engine.player || { x: 0, y: 0 };
  const y = surfaceNear(engine.platforms, p.x, p.y);
  // Online the street's own Salmon come back on the server's clock: a released one is new, and yours.
  const back = engine.query?.('sharedClockNow', engine) == null ? pickReleasedSalmon(entities, p.x) : null;
  if (back) {
    respawnReleasedSalmon(back.node);
    // Moved for this visit only: the plan seats it again on the next entry.
    back.x = p.x;
    back.y = y;
    if (engine.entityLayer) refreshEntity(engine, back);
    return `respawned:${back.key}`;
  }
  releaseCount += 1;
  const key = `release:${releaseCount}`;
  const entity = {
    key,
    classTsid: 'npc_salmon',
    x: p.x,
    y,
    node: createResourceNode('npc_salmon', { seed: `${engine.streetTsid}:${key}`, now: Date.now() }),
    target: null,
    view: null,
  };
  entities.push(entity);
  // Drawn when there is a world to draw in (not in the Node tests).
  if (engine.entityLayer) refreshEntity(engine, entity);
  return `new:${key}`;
}

/** The Pocket Salmon's Release (pack button, QA, tests). */
export function runSalmonRelease(engine) {
  const result = releaseSalmon(engine.inv, engine.pc, { hubId: engine.street?.hubId, salmonCount: swimmingSalmonCount(entities) });
  if (!result.ok) {
    releaseState = `failed:${result.reason}`;
    publish(engine);
    return result;
  }
  const where = salmonBackInWater(engine);
  for (const line of result.msgs) engine.pushActivity?.(line);
  const p = engine.player;
  if (p && result.costs.xp) engine.floatText?.(p.x, p.y - 90, `+${result.costs.xp} iMG`, 0xd7b8ff);
  engine.playSound?.(result.sound, { volume: 0.6, jitter: 0.05 });
  // item.js:738 notifyVerb salmon:release; solo Feats count it (salmon.js:92).
  for (const counter of result.achievementCounters) engine.achievement?.(counter.counter, counter.amount);
  releaseState = `released:${where}`;
  engine.updateHud?.();
  engine.refreshPack?.();
  engine.save?.();
  publish(engine);
  return { ...result, where };
}

function scheduleRelease(engine) {
  const mode = engine.param('resrelease');
  if (mode !== '1' && mode !== 'hold') return;
  if (countItem(engine.inv, SALMON_RELEASE.classTsid) < 1) {
    addItem(engine.inv, SALMON_RELEASE.classTsid, 1);
    engine.refreshPack();
  }
  if (mode !== '1') return;
  clearTimeout(releaseTimer);
  releaseTimer = setTimeout(() => runSalmonRelease(engine), 3000);
}

// ---------------------------------------------------------------------------
// Street lifecycle
// ---------------------------------------------------------------------------

function demoPlacement(engine, classTsid) {
  const player = engine.player;
  const side = player.x > engine.worldW - 260 ? -1 : 1;
  const offset = { npc_sloth: 120, paper_tree: 150, dirt_pile: 140, peat_1: 150, dust_trap: 90 }[classTsid] || 95;
  const x = player.x + side * offset;
  return { x, y: surfaceNear(engine.platforms, x, player.y) };
}

function setupDemo(engine, plan) {
  if (demoUsed) return plan;
  const kitInfo = resourceDemoKit(engine.param('resdemo'));
  if (!kitInfo) return plan;
  demoUsed = true;
  // &resdemobare=1: the node without its kit (a Sloth knocked with no Metal Rod answers from the leaves).
  const bare = engine.param('resdemobare') === '1';
  for (const [classTsid, qty] of Object.entries(kitInfo.items)) {
    if (bare) delete engine.inv[classTsid];
    else engine.inv[classTsid] = Math.max(qty, engine.inv[classTsid] || 0);
  }
  topUpMetabolic(engine.pc, 'energy', 60);
  // &resdemonode=0: the kit only, for the street's own nodes (a street's Sloths, G891), which then
  // skip the skill gate as the QA node does.
  if (engine.param('resdemonode') === '0') {
    demoKitOnly = true;
    engine.refreshPack();
    return plan;
  }
  const at = demoPlacement(engine, kitInfo.classTsid);
  const extra = [{ key: `demo:${kitInfo.classTsid}`, classTsid: kitInfo.classTsid, x: at.x, y: at.y, demo: true }];
  if (kitInfo.classTsid === 'npc_sloth') {
    // No tree by the player: the QA Sloth hangs DEMO_SLOTH.lift over the floor, its Knocker beside it.
    extra[0].y = at.y - DEMO_SLOTH.lift;
    extra[0].sloth = { dir: 1, floor: at.y, knocker: { x: at.x - DEMO_SLOTH.knockerX, y: at.y - DEMO_SLOTH.knockerLift } };
  }
  if (kitInfo.classTsid === 'npc_firefly') {
    // A small swarm, so one whistle shows several Fireflies streaming in.
    extra.push({ key: 'demo:npc_firefly:2', classTsid: 'npc_firefly', x: at.x + 70, y: at.y, demo: true });
    extra.push({ key: 'demo:npc_firefly:3', classTsid: 'npc_firefly', x: at.x - 40, y: at.y, demo: true });
  }
  engine.refreshPack();
  return [...plan, ...extra];
}

function scheduleAutoplay(engine) {
  if (!demoEntity || engine.param('resautoplay') !== '1') return;
  clearTimeout(autoplayTimer);
  const verb = resourceDemoKit(demoEntity.classTsid).verb;
  autoplayTimer = setTimeout(() => {
    if (!entities.includes(demoEntity)) return;
    if (demoEntity.classTsid === 'dust_trap') {
      triggerTrap(engine, demoEntity);
      return;
    }
    performVerb(engine, demoEntity, verb);
    if (demoEntity.classTsid === 'npc_sloth') {
      autoplayTimer = setTimeout(() => {
        if (entities.includes(demoEntity) && demoEntity.node.out) performVerb(engine, demoEntity, 'feed');
      }, 900);
    }
  }, 1200);
}

async function spawnStreet(engine, items, myGeneration) {
  // #582: the sheets for each node as it will be drawn. A Paper Tree's care runs out 6 minutes after
  // it was watered and petted (tickResourceNode), which changes its sheet: the needs were read before
  // that tick, so a tree left cared for came back needing care over a sheet never loaded, and stood
  // invisible (its Tap label and menu working) until watering changed its sheet again.
  const ticked = Date.now();
  for (const item of items) tickResourceNode(item.node, ticked);
  const needs = new Map();
  for (const item of items) for (const def of sheetsNeeded(item.node)) needs.set(def.path, def);
  const fireflies = items.some((item) => item.classTsid === 'npc_firefly');
  await Promise.all([
    ...[...needs.values()].map((def) => ensureSheet(engine, def)),
    fireflies ? ensureSvgTextures(engine) : null,
  ]);
  if (myGeneration !== generation) return;
  pendingItems = [];
  const now = Date.now();
  for (const item of items) {
    tickResourceNode(item.node, now);
    const entity = { ...item, target: null, view: null };
    entities.push(entity);
    if (item.demo && !demoEntity) demoEntity = entity;
    spawnView(engine, entity);
  }
  publish(engine);
  scheduleAutoplay(engine);
  scheduleRelease(engine);
}

function triggerTrap(engine, entity) {
  // QA: &dusttraproll=0.25 sets the trap's first roll (0.23-0.30 shows the golgi apparatus).
  const raw = engine.param?.('dusttraproll');
  let roll = raw != null && raw !== '' && Number.isFinite(Number(raw)) ? Math.min(0.999999, Math.max(0, Number(raw))) : null;
  const result = harvestResourceNode(entity.node, engine.inv, engine.pc, {
    verbId: 'trigger',
    now: Date.now(),
    ...(roll != null ? { rng: () => { const r = roll ?? Math.random(); roll = null; return r; } } : {}),
  });
  if (result.ok && result.baqalaSeconds) {
    engine.floatText(entity.x, entity.y - 120, `+${result.baqalaSeconds}s`, 0xbfe6ff);
    organelleOverlay(engine, entity, result.organelle, result.baqalaSeconds);
    // dust_trap.js 54-72 give_baqala_time: the Ancestral Lands clock and its buff (juju-bandits feature, G39).
    engine.query?.('giveBaqalaTime', result.baqalaSeconds, engine);
  }
  applyResult(engine, entity, result);
}

/**
 * dust_trap.js organelleOverlay (214-233, G372): the remnant's own picture over the trap, then off
 * to the buffs, where and_burst shows the seconds (AbstractAnnouncementOverlay.as 582-608).
 */
function organelleOverlay(engine, entity, organelle, seconds) {
  const use = OVERLAY_USES[organelle];
  if (!use || !engine.PIXI || !engine.fxLayer) return null;
  const from = { x: entity.x + use.dx, y: entity.y + use.dy };
  // The buff strip's corner, read every frame: the camera moves while it flies.
  const to = () => {
    const cam = engine.camera || { x: from.x, y: from.y - 300 };
    return { x: cam.x + 40, y: cam.y + 70 };
  };
  const { holdMs, flyMs } = ORGANELLE_OVERLAY;
  const flight = (ms) => organelleFlight(ms, from, to());
  const clock = () => globalThis.performance?.now?.() ?? Date.now();
  const startedAt = clock();
  engine.setData?.('dustTrapOverlay', organelle);
  const handle = playOverlay(engine.PIXI, organelle, {
    layer: engine.fxLayer,
    // overlayLifeMs: a duration of hold + fly - 0.2 s ends as the flight lands.
    durationMs: holdMs + flyMs - OVERLAY_FADE.inMs,
    wh: use.wh,
    loop: use.loop,
    zIndex: 9000,
    at: () => flight(clock() - startedAt),
    onFrame: () => {
      const spr = handle.sprite;
      const { scale } = flight(clock() - startedAt);
      if (!spr || scale >= 1) return;
      // Shrinks on the point it stands on (center_bottom).
      spr.x += (spr.width * (1 - scale)) / 2;
      spr.y += spr.height * (1 - scale);
      spr.width *= scale;
      spr.height *= scale;
    },
  });
  handle.done.then((finished) => {
    if (!finished) return;
    const at = to();
    engine.floatText(at.x, at.y, `+${seconds} ${seconds === 1 ? 'second' : 'seconds'}`, 0xbfe6ff);
  });
  return handle;
}

/**
 * npc_sloth.js onPlayerCollision (590-601) and the peekSpit state (825-834):
 * walking under a hiding Sloth with Friend of Metal, 7% of the time (at most
 * once every 5 minutes, always with Max Luck) it peeks down and spits 1-3
 * Snails at you. The collision is the item's box (instance props width 300,
 * height 200 over its point: apiSetHitBox, onPropsChanged 616) and its
 * bottom_extender, as wide, reaching hitbox_extension down ("the amount to
 * extend the hitbox on the bottom (for high trees)", 41; onCreate 572, 614-615):
 * G891 takes the extension to the floor under it, so walking the path below a
 * Sloth in its tree makes it peek, and a floor far under it does not.
 */
export const SLOTH_COLLISION = Object.freeze({ w: 300, h: 200 });

/** PURE: a Sloth's collision box (its box and bottom_extender), screen px, from slothGeometry. */
export function slothPeekBox(geo) {
  const half = SLOTH_COLLISION.w / 2;
  return { left: geo.origin.x - half, right: geo.origin.x + half, top: geo.origin.y - SLOTH_COLLISION.h, bottom: Math.max(geo.origin.y, geo.floor) };
}

/** PURE: the avatar (feet x, y) touches the Sloth's collision box (the client's avatar hit box, js/reach.js). */
export function touchesSloth(x, y, geo, scale = 1) {
  return boxesTouch(avatarHitBox(x, y, scale), slothPeekBox(geo));
}

function checkSloths(engine) {
  const player = engine.player;
  if (!player) return;
  const under = entities.find((entity) => entity.classTsid === 'npc_sloth' && entity.view?.geo
    && touchesSloth(player.x, player.y, entity.view.geo)) || null;
  if (under === underSloth) return;
  underSloth = under;
  // QA (G891): the Sloth whose collision box the avatar is in.
  engine.setData?.('slothUnder', under?.key || '');
  if (!under || under.node.out || under.view.state !== 'hidden') return;
  const buffs = engine.activeBuffIds?.() || [];
  const now = Date.now();
  const snails = rollSlothBonusSnails(engine.pc?.imaginationUpgrades || [], bonusSnailsAt, now, Math.random, buffs.includes('max_luck'));
  if (!snails) {
    // onPlayerCollision 604-607: it peeks out at you, at most every 20 s.
    if (now - under.view.peekAt > SLOTH_PEEK_GAP_MS) {
      under.view.peekAt = now;
      playSloth(engine, under, 'peek');
    }
    return;
  }
  bonusSnailsAt = now;
  addItem(engine.inv, 'snail', snails);
  // setStateComplete peekSpit (825-834): the Snails come as the peekSpit ends.
  playSloth(engine, under, 'peekSpit');
  under.view.spits = Array.from({ length: snails }, (_, i) => now + 2000 + i * 260);
  engine.achievement?.('sloth:got_bonus_snails', 1);
  engine.achievement?.('sloth:snails_received', snails);
  engine.pushActivity?.(`A Sloth peeks out of the leaves and spits ${snails} Snail${snails === 1 ? '' : 's'} at you. Metal!`);
  engine.refreshPack?.();
  engine.save?.();
}

function checkTraps(engine) {
  const player = engine.player;
  if (!player) return;
  for (const entity of entities) {
    if (entity.classTsid !== 'dust_trap' || entity.node.depleted || !entity.view) continue;
    // GSJS hitbox 25 x 200 above the trap's foot.
    if (Math.abs(player.x - entity.x) <= 18 && player.y <= entity.y + 10 && player.y >= entity.y - 200) {
      // G946 (#700): online the trap is the street's, and the server says who sprang it first.
      const go = () => { if (entities.includes(entity) && !entity.node.depleted) triggerTrap(engine, entity); };
      if (entity !== demoEntity && engine.query?.('sharedTrapTrigger', entity.key, go, engine) != null) continue;
      triggerTrap(engine, entity);
    }
  }
}

// ---------------------------------------------------------------------------
// Feature
// ---------------------------------------------------------------------------

export const resourceNodesFeature = {
  id: RESOURCE_FEATURE_ID,

  init(engine) {
    engineRef = engine;
    ensureResourceItems();
    // QA routes (any *demo / *autoplay param) stay quiet unless they ask (&fireflyoffer=1), like the Magic Rock.
    const params = [...new URLSearchParams(globalThis.location?.search || '').keys()];
    fireflyOffer.allowed = engine.param('fireflyoffer') === '1' || !params.some((key) => /demo$|autoplay$/.test(key));
    // A new multiplayer player (js/new-player.js) starts with an empty pack: no kit, now or later.
    // No multiplayer save gets it either (G565): every one postdates the kit, and the ledger never granted it.
    if (engine.newPlayer || engine.mode === 'multiplayer') kit.starterKit = true;
    else migrateResourceStarterKit(engine.inv, kit);
    publish(engine);
  },

  save() {
    return { jarCopies: true, starterKit: kit.starterKit, ...(bonusSnailsAt ? { bonusSnailsAt } : {}) };
  },

  restore(slice, engine) {
    const normalized = normalizeResourceFeatureSlice(slice);
    // An older save's one count for every jar becomes the first jar's (the one a whistle filled:
    // the first in pack order); any other jar held is empty, as each one bought was.
    if (!normalized.jarCopies && normalized.jar.flies > 0 && engine?.toolState && countItem(engine.inv, JAR) > 0) {
      setFireflyJar(engine, 0, normalized.jar.flies);
    }
    kit.starterKit = normalized.starterKit || engine?.mode === 'multiplayer';
    bonusSnailsAt = normalized.bonusSnailsAt || 0;
    if (engine) migrateResourceStarterKit(engine.inv, kit);
  },

  placementGroups(population) {
    return resourcePlacementGroups(population);
  },

  onStreetEnter(street, engine) {
    generation += 1;
    const myGeneration = generation;
    const slot = engine.streetSlot(RESOURCE_FEATURE_ID);
    const planned = resourceSpawnPlan(engine.population, (key) => engine.placement(key), street);
    const items = prepareStreetResourceNodes(slot, planned, { tsid: engine.streetTsid, now: Date.now() });
    // items/dust_trap.js onPlayerEnter: alone on the street, a trap is empty 20% of the time (online the server rolls it).
    if (engine.mode !== 'multiplayer') springDustTrapsOnArrival(items, { now: Date.now() });
    const all = setupDemo(engine, items).map((item) => (
      item.demo ? { ...item, node: createResourceNode(item.classTsid, { seed: item.key, now: Date.now() }) } : item
    ));
    publish(engine);
    pendingItems = all;
    if (all.length) spawnStreet(engine, all, myGeneration).catch((err) => console.warn('resource nodes', err?.message || err));
  },

  /**
   * #478: { classId } rows for the nodes still loading their art, so the loading card's Home to:
   * counts them (location.js getLoadingInfo counted every item in this.items, drawn or not), as
   * patches-feature does for its plots (G270). game.js adds these for loadingCardDetails.
   */
  pendingTargets() {
    return pendingItems.map((item) => ({ classId: item.classTsid }));
  },

  onStreetClear() {
    stopNodeTool();
    generation += 1;
    clearTimeout(autoplayTimer);
    clearTimeout(releaseTimer);
    releaseState = '';
    clearEffects();
    entities = [];
    pendingItems = [];
    underSloth = null;
    demoEntity = null;
  },

  onTick(dtMs, now, engine) {
    if (!entities.length && !effects.length) return;
    for (const entity of entities) {
      const view = entity.view;
      if (!view) continue;
      if (view.kind === 'firefly') placeFirefly(entity, dtMs);
      else if (view.kind === 'salmon') placeSalmon(entity, dtMs, engine);
      else if (view.kind === 'sloth') placeSloth(engine, entity, dtMs, now);
      else if (view.kind === 'trap' && entity.node.depleted) refreshTrap(engine, entity);
    }
    tickEffects(dtMs);
    if (engine.started && !engine.transientInstance()) {
      checkTraps(engine);
      checkSloths(engine);
      checkFireflyOffer(engine);
    }
    if (now - lastTickAt < TICK_MS) return;
    lastTickAt = now;
    for (const entity of entities) {
      if (entity.classTsid === 'npc_sloth') paySlothSnails(engine, entity, now);
      if (tickResourceNode(entity.node, now)) refreshEntity(engine, entity);
      else if (entity.target) entity.target.subtitle = resourceNodeStatusLabel(entity.node, now) || entity.target.subtitle;
    }
    if (demoEntity) publish(engine);
  },

  verbsFor(target, engine) {
    const entity = entityFor(target);
    if (!entity) return [];
    const ctx = verbContext(engine, entity);
    return verbsForTarget(resourceNodeVerbs(entity.node, engine.inv, engine.pc, ctx), target === entity.knockerTarget).map((verb) => ({
      id: menuVerbId(verb.id),
      // A key of its own in the menu (keys_in_location: the Knocker's k).
      ...(verb.key ? { key: verb.key } : {}),
      // Multiplayer help dig (features/help-mine-feature.js): "Help dig" while someone else digs.
      label: (engine.mode === 'multiplayer' && engine.query?.('sharedVerbLabel', target, verb.id, engine)) || verb.label,
      enabled: verb.enabled,
      tooltip: verbTooltip(verb),
      reason: verb.enabled ? '' : verb.message,
      durationMs: verb.enabled ? verb.durationMs : 0,
      energy: verb.costs?.energy || 0,
    }));
  },

  runVerb(target, verbId, engine) {
    const entity = entityFor(target);
    if (!entity) return true;
    performVerb(engine, entity, rulesVerbId(verbId));
    return true;
  },

  /**
   * game.js beginVerbAction: a timed verb began. Scraping, digging and cutting Peat show the tool
   * at work on the node for as long as the verb runs, as mining shows the pick (js/node-tools.js).
   */
  verbStarted(target, verb, engine) {
    const entity = entityFor(target);
    if (!entity) return undefined;
    stopNodeTool();
    const rule = resourceNodeVerbs(entity.node, engine.inv, engine.pc, verbContext(engine, entity)).find((v) => v.id === rulesVerbId(verb?.id));
    const def = nodeToolSheet(rule?.tool);
    // sloth_knocker.js knock 52-54: the Knocker plays its tool_animation for a second, with SLOTH_KNOCKER.
    if (entity.classTsid === 'npc_sloth' && rulesVerbId(verb?.id) === 'knock' && entity.view?.knocker) {
      entity.view.knockAt = Date.now();
      engine.playSound?.('SLOTH_KNOCKER', { volume: 0.6 });
    }
    const spr = target.sprite;
    const layer = engine.fxLayer || engine.entityLayer;
    if (!def || !spr || spr.destroyed || !layer || !(verb?.durationMs > 0)) return undefined;
    const place = nodeToolOverlay(entity.classTsid, spr.x, engine.player?.x);
    const hold = Number(engine.param?.('nodetoolhold'));
    nodeTool = playItemOverlay(engine.PIXI, def, {
      layer,
      flipped: place.flipped,
      durationMs: verb.durationMs,
      holdMs: Number.isFinite(hold) && hold > 0 ? hold : null,
      label: `node-tool:${rule.tool}`,
      onFrame: (frame) => engine.setData?.('nodeTool', `${rule.tool}:${entity.classTsid}:${frame}`),
      at: () => (spr.destroyed
        ? { x: 0, y: 0 }
        : itemstackOverlayPoint(spr.x, displayTopOf(spr), { dx: place.deltaX, dy: place.deltaY })),
    });
    return undefined;
  },

  /** game.js cancelCurrentAction: the swing stopped before it landed. */
  verbCancelled(target) {
    if (entityFor(target)) stopNodeTool();
    return undefined;
  },

  /** salmon.js 30-100: Release on the Pocket Salmon, hidden outside Jal and Samudra. */
  packVerbs(classTsid, engine) {
    if (classTsid !== SALMON_RELEASE.classTsid || countItem(engine.inv, classTsid) < 1) return [];
    const gate = releaseGate(engine);
    releaseState = gate.state === 'enabled' ? 'enabled' : `hidden:${gate.reason}`;
    engine.setData?.('salmonRelease', releaseState);
    if (gate.state !== 'enabled') return [];
    return [{ id: SALMON_RELEASE.verb, label: SALMON_RELEASE.label, tooltip: SALMON_RELEASE.tooltip, enabled: true }];
  },

  runPackVerb(classTsid, verbId, engine) {
    if (classTsid !== SALMON_RELEASE.classTsid || verbId !== SALMON_RELEASE.verb) return false;
    runSalmonRelease(engine);
    return true;
  },

  /**
   * Multiplayer street objects (features/street-objects-feature.js): this
   * street's nodes, the QA demo node left out. ready(verbId) is the player's
   * own side of a verb (tools, skills, energy, daily limits) with the stock
   * left to the realtime server; refresh() redraws after a state change.
   */
  streetResourceNodes(engine) {
    // A Salmon released from a pack (release:<n>) is the player's own, never the street's.
    return entities.filter((entity) => entity !== demoEntity && !String(entity.key).startsWith('release:')).map((entity) => ({
      key: entity.key,
      classTsid: entity.classTsid,
      node: entity.node,
      target: entity.target,
      refresh: () => refreshEntity(engine, entity),
      /** R43: online it stands at the server's spot for its key (street-objects-feature); returns where it stood. */
      moveTo: (x, y) => moveEntity(entity, x, y),
      ready(verbId) {
        return ownSide(engine, entity, verbId)?.enabled === true;
      },
      /** #214: why the player's own side says no (a used daily limit: "You can't harvest this peat more than once per game day."). */
      reason(verbId) {
        const verb = ownSide(engine, entity, verbId);
        return verb && !verb.enabled ? String(verb.message || '') : '';
      },
    }));
  },

  /** QA / tests. */
  _state() {
    return { jars: fireflyJarCounts(engineRef), starterKit: kit.starterKit, entities: entities.length };
  },
};
