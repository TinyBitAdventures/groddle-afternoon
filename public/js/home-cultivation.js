/**
 * Home street cultivation and yard expansion rules (pure: no Pixi, no DOM).
 *
 * Sources (tinyspeck/glitch-GameServerJS, CC0):
 * - locations/inc_cultivation.js  cultivation_classes (class -> min level),
 *                                 cultivation_get_img_cost, cultivation_purchase
 *                                 (choose_one end item, imagination spend),
 *                                 cultivation_start can_nudge (Nudgery 1)
 * - items/proto_*.js              label, base_cost, ghost width, item_class
 * - items/include/cultivation.js  cultivation_max_wear, addWear, depletion,
 *                                 replaceWithDepleted (the proto carries the
 *                                 lifespan multiplier, wotd and restorer),
 *                                 setMaxWearMultiplier (capped at 2.0)
 * - quests/quest.js doJobEffects  type 5 "Proto item graduation" 1871-1915:
 *                                 a finished restore picks a new end item,
 *                                 multiplier + 0.05 (unchanged after Wine of
 *                                 the Dead), times_restored = 1 + (m - 1) / .05
 *                                 when the same player restored it before
 * - items/<end item>.js           max wear (rocks 40, peat 100, dirt 300,
 *                                 jellisac / barnacle 240, firefly hive 210,
 *                                 patch 2000, gardens 60 / 160 / 300)
 * - locations/inc_homes.js        home_get_yard_expansion_costs / home_add_expansion
 *                                 (2663-2796), home_get_yard_size (2648)
 * - config_base.js                START/MAX_FRONTYARD_LEFT/RIGHT_SEGMENTS,
 *                                 FRONTYARD_EXPAND_COSTS (150 px per segment),
 *                                 START/MAX_BACKYARD_SEGMENTS 5 / 20 and
 *                                 BACKYARD_EXPAND_COSTS (215-246)
 *
 * The back yard (register G135). The house interior is a "house-right"
 * location (inc_homes.js homes_rebuild_rooms 472-541): the house stands at
 * x 0..house_w and the yard runs left of it to x = -yard_expansions x 150.
 * It starts at 5 segments and grows only leftwards, one segment per paid
 * expansion, to 20 (15 expansions, 200 to 3,281 iMG); the last one counts
 * max_expansions:yard (home_add_expansion 2726-2745). The same cultivation
 * rules run there (cultivation_can_cultivate: any home location of the
 * owner), priced from the yard's own items (cultivation_count_items counts
 * this location), but never the Tower (cultivation_get_available 38:
 * !is_public). A back-yard state carries `yard: 'back'`; its `yardLeft`
 * counts the expansions and its `rx` is the source x (negative, left of
 * the house).
 *
 * Remake decisions:
 * - Items are stored relative to the house (`rx`), so a left-hand yard
 *   expansion never moves anything on the street.
 * - Removing a cultivation needed a bottle of Wine of the Dead in the source.
 *   The remake removes it directly from Cultivate mode, with no refund.
 * - Worn-out items become their proto in place (`depleted`), which offers
 *   the Restore project (features/street-jobs-feature.js projectApi). The
 *   multiplier is kept as whole 0.05 steps (`lifeSteps`, 0..20) so it never
 *   drifts the way repeated float + 0.05 can.
 * - The Mail Dispatcher stands on the street (js/home-street-fixtures.js):
 *   its spot is kept with the street (`dispatcherRx`, null for the usual
 *   one) and cultivations keep clear of it, as it keeps clear of them.
 *   PORCH: the Mailbox and the Magic Rock too, once moved (`mailboxRx`,
 *   `rockRx`); a fixture steps aside for a cultivation, never the other way round.
 *   Report 153: an owner may put the dispatcher away (`dispatcherAway`); then
 *   nothing keeps clear of it until it is put out again (putOutDispatcher).
 */

import { CULTIVATION_CLASSES, HOME_LIMITS } from './homes-catalog.js?v=10ac34b6';
import {
  TOWER_CHASSIS,
  TOWER_IMG_COST,
  TOWER_MIN_LEVEL,
  TOWER_PLACEMENT_WARNING,
  TOWER_PROTO,
  TOWER_WIDTH,
} from './home-tower.js?v=087df38f';
import {
  DISPATCHER_AWAY_KEY,
  DISPATCHER_HALF,
  MOVABLE_FIXTURES,
  MOVABLE_FIXTURE_IDS,
  STREET_ROCK,
  dispatcherDefaultRx,
  dispatcherAway,
  fixtureFits,
  fixtureName,
  fixtureSpot,
  savedFixtureRx,
  signpostX,
  streetFixtures,
} from './home-street-fixtures.js?v=bad831a1';
import { gardenHalfWidth } from './garden-view.js?v=04fe8467';

export const YARD_SEGMENT_W = 150;
/** The house, porch and mailbox stand on a fixed lot between the yards. */
export const HOUSE_LOT_W = 720;
/** Cultivations keep this much clear ground in front of the door. */
export const DOOR_CLEARANCE = 150;
export const NUDGE_SKILL = 'nudgery_1';
const BASE = 0.15;
const ADDITIONAL = 0.5;
const MAX_ITEMS = 60;
/** The back yard kind (a state with yard: 'back'); the home street has none. */
export const BACK_YARD = 'back';
/** inc_homes.js homes_rebuild_floor left-open: the ramp in through the house's open end (x -20..56). */
export const BACK_YARD_OPENING = 150;
/** quest.js doJobEffects: setMaxWearMultiplier(multiplier + 0.05) per restore. */
export const LIFESPAN_STEP = 0.05;
/** include/cultivation.js setMaxWearMultiplier: capped at 2.0. */
export const MAX_LIFE_STEPS = 20;

/**
 * The Tower (inc_cultivation.js proto_furniture_tower_chassis, level 18). It
 * stays a cultivation while its project runs (endClass = the proto) and keeps
 * its spot once built (endClass = furniture_tower_chassis); js/home-tower.js
 * holds the project and the building. build-homes.mjs leaves it out of the
 * generated catalog, so it joins the list here.
 */
export const TOWER_CULTIVATION = Object.freeze({
  protoClass: TOWER_PROTO,
  label: 'Tower',
  baseCost: TOWER_IMG_COST,
  minLevel: TOWER_MIN_LEVEL,
  width: TOWER_WIDTH,
  endItems: Object.freeze([TOWER_PROTO, TOWER_CHASSIS]),
  maxWear: 0,
  kind: 'tower',
  warning: TOWER_PLACEMENT_WARNING,
  source: 'items/proto_furniture_tower_chassis.js',
});
const ALL_CLASSES = Object.freeze({ ...CULTIVATION_CLASSES, [TOWER_PROTO]: TOWER_CULTIVATION });

export function cultivationDef(protoClass) {
  return ALL_CLASSES[protoClass] || null;
}

export function listCultivationClasses() {
  return Object.values(ALL_CLASSES).sort((a, b) => a.minLevel - b.minLevel || a.baseCost - b.baseCost);
}

/** The home street's Tower cultivation (proto or built), if any. */
export function towerItem(state) {
  return (state?.items || []).find((row) => row.protoClass === TOWER_PROTO) || null;
}

function finite(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeItem(row) {
  const def = cultivationDef(row?.protoClass);
  if (!def) return null;
  const endClass = def.endItems.includes(row?.endClass) ? row.endClass : def.endItems[0];
  const out = {
    id: Math.max(1, Math.floor(finite(row?.id, 0))),
    protoClass: def.protoClass,
    endClass,
    rx: Math.round(finite(row?.rx, 0)),
    placedAt: Math.max(0, Math.floor(finite(row?.placedAt, 0))),
    wear: Math.max(0, Math.floor(finite(row?.wear, 0))),
  };
  // Restoration fields only when set, so old saves round-trip unchanged.
  const steps = Math.max(0, Math.min(MAX_LIFE_STEPS, Math.floor(finite(row?.lifeSteps, 0))));
  if (steps) out.lifeSteps = steps;
  if (row?.depleted === true && def.kind !== 'tower') out.depleted = true;
  if (row?.wotd === true) out.wotd = true;
  if (row?.restorer === true) out.restorer = true;
  const cycle = Math.max(0, Math.floor(finite(row?.cycle, 0)));
  if (cycle) out.cycle = cycle;
  return out;
}

export function isBackYard(state) {
  return state?.yard === BACK_YARD;
}

export function normalizeCultivationState(seed = {}) {
  const back = seed?.yard === BACK_YARD;
  const items = [];
  const seen = new Set();
  for (const row of Array.isArray(seed?.items) ? seed.items : []) {
    const item = normalizeItem(row);
    if (!item || seen.has(item.id)) continue;
    seen.add(item.id);
    items.push(item);
    if (items.length >= MAX_ITEMS) break;
  }
  const maxLeft = back
    ? HOME_LIMITS.MAX_BACKYARD_SEGMENTS - HOME_LIMITS.START_BACKYARD_SEGMENTS
    : HOME_LIMITS.MAX_FRONTYARD_LEFT_SEGMENTS - HOME_LIMITS.START_FRONTYARD_LEFT_SEGMENTS;
  const maxRight = back ? 0 : HOME_LIMITS.MAX_FRONTYARD_RIGHT_SEGMENTS - HOME_LIMITS.START_FRONTYARD_RIGHT_SEGMENTS;
  const state = {
    ...(back ? { yard: BACK_YARD } : {}),
    items,
    nextId: Math.max(items.reduce((m, r) => Math.max(m, r.id), 0) + 1, Math.floor(finite(seed?.nextId, 1))),
    yardLeft: Math.max(0, Math.min(maxLeft, Math.floor(finite(seed?.yardLeft, 0)))),
    yardRight: Math.max(0, Math.min(maxRight, Math.floor(finite(seed?.yardRight, 0)))),
    // Nested slices other systems own for these cultivations (garden plots).
    gardens: seed?.gardens && typeof seed.gardens === 'object' && !Array.isArray(seed.gardens)
      ? JSON.parse(JSON.stringify(seed.gardens))
      : {},
    // achievements cultivation:times_restored is a set-to-max counter; the remake increments by the gain.
    timesRestored: Math.max(0, Math.floor(finite(seed?.timesRestored, 0))),
  };
  // The Mail Dispatcher's, the Mailbox's and the Magic Rock's spots once you have moved them (home-street-fixtures).
  if (!back) {
    for (const id of MOVABLE_FIXTURE_IDS) {
      const rx = savedFixtureRx(seed, id);
      if (rx != null) state[MOVABLE_FIXTURES[id].key] = rx;
    }
    // Report 153: put away by its owner (only a saved true; older saves keep it out).
    if (dispatcherAway(seed)) state[DISPATCHER_AWAY_KEY] = true;
  }
  settleGardens(state);
  return state;
}

/** The placementCheck reasons that are a fixture on the ground (groundFixtures). */
const FIXTURE_REASONS = new Set(['signpost', 'rock', 'butler_box']);

/**
 * Saves from before 2026-10-31 (GARDENART): gardens now draw Tiny Speck's beds
 * (js/garden-view.js), a little wider than the footprint they were set down with, and
 * nothing used to keep cultivations off the posts and fixtures on the ground. A saved
 * garden that no longer fits where it is (on a post or fixture, past the yard's end, on
 * the path to the door, or over another cultivation), or any other cultivation standing on
 * a post or fixture, moves to the nearest spot that fits, the same on every client. The
 * Mail Dispatcher steps aside on its own (dispatcherSpot).
 */
export function settleGardens(state) {
  for (const item of state.items) {
    const garden = cultivationDef(item.protoClass)?.kind === 'garden' && !item.depleted;
    // The dispatcher is left out: it steps aside for a cultivation, not the other way round.
    const check = placementCheck(state, item.protoClass, item.rx, item.id, { dispatcher: false });
    if (check.ok || check.reason === 'unknown') continue;
    if (!garden && !FIXTURE_REASONS.has(check.reason)) continue;
    const rx = nearestFreeRx(state, item.protoClass, item.rx, item.id, { dispatcher: false });
    if (rx != null) item.rx = rx;
  }
  return state;
}

export function createCultivationState(seed = {}) {
  return normalizeCultivationState(seed);
}

/** A house's back yard (homes_init_config: yard_expansions = START_BACKYARD_SEGMENTS). */
export function createBackYardState(seed = {}) {
  return normalizeCultivationState({ ...(seed || {}), yard: BACK_YARD });
}

/** Yard segments on each side of the house lot (the back yard: all on the left). */
export function yardSegments(state) {
  if (isBackYard(state)) return { left: HOME_LIMITS.START_BACKYARD_SEGMENTS + (state.yardLeft || 0), right: 0 };
  return {
    left: HOME_LIMITS.START_FRONTYARD_LEFT_SEGMENTS + (state?.yardLeft || 0),
    right: HOME_LIMITS.START_FRONTYARD_RIGHT_SEGMENTS + (state?.yardRight || 0),
  };
}

/**
 * World layout of the home street: width, house center, and the yard edges.
 * The back yard: `width` is the yard (home_get_yard_size), `houseX` the house's
 * left end (source x 0), so `rx` is the source x and every spot is left of it.
 */
export function homeStreetLayout(state) {
  const seg = yardSegments(state);
  if (isBackYard(state)) {
    const width = seg.left * YARD_SEGMENT_W;
    return { width, houseX: width, lotLeft: width, lotRight: width, minRx: -width + 60, maxRx: 0 };
  }
  const leftW = seg.left * YARD_SEGMENT_W;
  const rightW = seg.right * YARD_SEGMENT_W;
  const width = leftW + HOUSE_LOT_W + rightW;
  const houseX = leftW + HOUSE_LOT_W / 2;
  return {
    width,
    houseX,
    lotLeft: leftW,
    lotRight: leftW + HOUSE_LOT_W,
    // The house lot is fully usable except the doorway itself.
    minRx: -houseX + 60,
    maxRx: width - houseX - 60,
  };
}

export function worldXFor(state, item) {
  return homeStreetLayout(state).houseX + item.rx;
}

export function countCultivations(state, protoClass = null) {
  // cultivation_count_all_items: a built Tower is furniture, not a proto, so it stops counting.
  return (state?.items || []).filter((row) => (protoClass ? row.protoClass === protoClass : row.endClass !== TOWER_CHASSIS)).length;
}

/**
 * cultivation_get_img_cost: cost = (1.15 ^ every cultivated item here
 * + 0.5 × same-class items) × the proto's base_cost, rounded.
 */
export function cultivationCost(state, protoClass) {
  const def = cultivationDef(protoClass);
  if (!def) return 0;
  // cultivation_get_img_cost: the Tower is always its base_cost.
  if (def.kind === 'tower') return def.baseCost;
  const all = countCultivations(state);
  const existing = countCultivations(state, protoClass);
  let cost = 1;
  for (let i = 0; i < all; i += 1) cost *= 1 + BASE;
  cost += existing * ADDITIONAL;
  return Math.round(cost * def.baseCost);
}

/** cultivation_get_available + level/imagination gates for the Cultivate menu. */
export function cultivationChoices(state, pc = {}) {
  // cultivation_get_available: no Tower choice once one is cultivated or built, and none off the street (38: !is_public).
  return listCultivationClasses().filter((def) => def.kind !== 'tower' || (!towerItem(state) && !isBackYard(state))).map((def) => {
    const cost = cultivationCost(state, def.protoClass);
    const level = Math.floor(finite(pc.level, 1));
    const img = Math.floor(finite(pc.imagination, 0));
    let reason = '';
    if (level < def.minLevel) reason = `Requires level ${def.minLevel}.`;
    else if (img < cost) reason = `Needs ${cost.toLocaleString()} iMG.`;
    else if (countCultivations(state) >= MAX_ITEMS) reason = 'Your yard cannot hold any more.';
    return {
      protoClass: def.protoClass,
      label: def.label,
      kind: def.kind,
      cost,
      minLevel: def.minLevel,
      width: def.width,
      canPlace: !reason,
      reason,
      warning: def.warning || '',
    };
  });
}

/**
 * Half-footprint used for spacing: the proto ghost width (source) at 80%, or for a
 * garden half its drawn bed (js/garden-view.js: Tiny Speck's polcrop/polherb bed at
 * the 0.7 garden scale, 104 / 160 / 206 for small / medium / large, inside the
 * source's placement width), so nothing is set down under its edge.
 */
export function footprint(protoClass) {
  const def = cultivationDef(protoClass);
  if (def?.kind === 'garden') return gardenHalfWidth({ gardenType: def.gardenType, cols: def.cols, rows: def.rows, home: true });
  return Math.round((def?.width || 200) * 0.4);
}

/**
 * YARDBUSH: what each cultivation covers, in world x ({ id, x1, x2 }), every kind and size,
 * worn-out protos and the Tower too: `halfOf(row)` either side of its spot (by default its
 * spacing footprint; the street's front fringe passes the drawn art's half width,
 * features/homes-feature.js cultivationArtHalf, and moves aside from it: fringeMover). PURE.
 */
export function cultivationSpans(state, halfOf = (row) => footprint(row.protoClass)) {
  const { houseX } = homeStreetLayout(state);
  return (state?.items || []).map((row) => {
    const x = houseX + row.rx;
    const half = halfOf(row);
    return { id: row.id, x1: x - half, x2: x + half };
  });
}

/**
 * The signpost post's half width on the ground (homes-feature makeHomeSignpost: signpost_post.png
 * is 43 wide). GATESIGN2: it is the street's one post now; the way-out post that stood 110 px right
 * of it (and the World Gate's pole before that) is gone, and its ground is free again.
 */
export const SIGNPOST_POST_HALF = 22;

/**
 * What stands on the ground of the home street, which a cultivation keeps clear of: the
 * signpost's post (its arms are overhead, above
 * the tallest grown crop), the Magic Rock and the Butler Box.
 */
export function groundFixtures(layout, state = null, { moved = true } = {}) {
  const rockRx = savedFixtureRx(state, 'rock');
  const mailRx = savedFixtureRx(state, 'mailbox');
  const rows = streetFixtures(layout, rockRx != null ? { rockX: layout.houseX + rockRx } : {}).map((f) => {
    if (f.id === 'signpost') return { id: f.id, x1: signpostX(layout) - SIGNPOST_POST_HALF, x2: signpostX(layout) + SIGNPOST_POST_HALF };
    return f;
  });
  // PORCH: a moved Mailbox is kept clear too (in its usual spot it never was); `moved: false`
  // leaves the moved fixtures out, so settling old saves never moves a cultivation for one.
  if (mailRx != null) {
    const x = layout.houseX + mailRx;
    rows.push({ id: 'mailbox', x1: x - MOVABLE_FIXTURES.mailbox.half, x2: x + MOVABLE_FIXTURES.mailbox.half });
  }
  if (moved) return rows;
  return rows.filter((f) => !(f.id === 'rock' && rockRx != null) && f.id !== 'mailbox');
}

/**
 * Whether a cultivation fits at `rx`: inside the yard, clear of the doorway,
 * and not overlapping another cultivation's footprint.
 */
export function placementCheck(state, protoClass, rx, excludeId = null, { dispatcher = true } = {}) {
  const def = cultivationDef(protoClass);
  if (!def) return { ok: false, reason: 'unknown' };
  const layout = homeStreetLayout(state);
  const half = footprint(protoClass);
  const x = Math.round(finite(rx, 0));
  const back = isBackYard(state);
  if (x - half < layout.minRx || x + half > layout.maxRx) {
    return { ok: false, reason: 'edge', msg: back ? 'Not enough yard there. Expand the yard for more room.' : 'Not enough yard there. Expand the street for more room.' };
  }
  if (Math.abs(x) < half + (back ? BACK_YARD_OPENING : DOOR_CLEARANCE) / 2) {
    return { ok: false, reason: 'door', msg: back ? 'Keep the way into your house clear.' : 'Keep the path to your front door clear.' };
  }
  // Nothing stands on the gate's or the signpost's post, the Magic Rock or the Butler Box
  // (ContiguousPlatformLineSet.calculateRanges kept placements off signposts).
  if (!back) {
    const wx = layout.houseX + x;
    for (const f of groundFixtures(layout, state, { moved: dispatcher })) {
      if (wx + half > f.x1 && wx - half < f.x2) return { ok: false, reason: f.id, msg: `Keep it clear of your ${fixtureName(f.id)}.` };
    }
  }
  const dispX = !back && dispatcher ? dispatcherRx(state, { excludeId }) : null;
  if (dispX != null && Math.abs(dispX - x) < half + DISPATCHER_HALF) {
    return { ok: false, reason: 'dispatcher', msg: 'Keep it clear of your Mail Dispatcher.' };
  }
  for (const other of state.items) {
    if (other.id === excludeId) continue;
    if (Math.abs(other.rx - x) < half + footprint(other.protoClass)) {
      return { ok: false, reason: 'overlap', msg: `Too close to your ${cultivationDef(other.protoClass).label}.` };
    }
  }
  return { ok: true };
}

/**
 * A movable fixture's usual spot, x from the house's centre: the Mailbox at the house's sign
 * corner (`at.mailboxX`, it follows the house style; null without it), the Magic Rock right
 * of the door (inc_homes.js homes_demo_frontyard 2469-2471), the dispatcher past the signpost.
 */
export function usualFixtureRx(layout, id, at = {}) {
  if (id === 'mailbox') return Number.isFinite(at.mailboxX) ? Math.round(at.mailboxX - layout.houseX) : null;
  if (id === 'rock') return STREET_ROCK.houseDx;
  if (id === 'dispatcher') return dispatcherDefaultRx(layout);
  return null;
}

/**
 * What movable fixture `id` keeps clear of: the other fixtures where they stand (each moved
 * one at its saved spot, the rest at their usual ones; `at` adds the drawn Mailbox and the
 * door and its mat) and the cultivations (but `excludeId`), in world x.
 */
export function fixtureObstacles(state, id, { excludeId = null, at = {} } = {}) {
  const layout = homeStreetLayout(state);
  const spot = (other) => {
    if (other === 'dispatcher' && dispatcherAway(state)) return undefined;
    const rx = savedFixtureRx(state, other) ?? usualFixtureRx(layout, other, at);
    return rx == null ? undefined : layout.houseX + rx;
  };
  const where = { ...at, mailboxX: spot('mailbox'), rockX: spot('rock'), dispatcherX: spot('dispatcher') };
  const items = (state?.items || []).filter((row) => row.id !== excludeId).map((row) => ({
    x: layout.houseX + row.rx,
    half: footprint(row.protoClass),
    label: cultivationDef(row.protoClass)?.label,
  }));
  return { fixtures: streetFixtures(layout, where).filter((f) => f.id !== id), items };
}

/**
 * Where movable fixture `id` stands on the home street, x from the house's centre (null in a
 * back yard, or for the Mailbox without `at.mailboxX`). The Mailbox and the Magic Rock stand
 * in their usual spots until moved; a moved one (and the dispatcher always) stands at its spot,
 * or the nearest that is clear of the other fixtures and the cultivations (but `excludeId`).
 */
export function fixtureRx(state, id, { excludeId = null, at = {} } = {}) {
  if (isBackYard(state) || !MOVABLE_FIXTURES[id]) return null;
  if (id === 'dispatcher' && dispatcherAway(state)) return null;
  const layout = homeStreetLayout(state);
  const saved = savedFixtureRx(state, id);
  const usual = usualFixtureRx(layout, id, at);
  if (saved == null && id !== 'dispatcher') return usual;
  return fixtureSpot(layout, id, saved ?? usual, fixtureObstacles(state, id, { excludeId, at })) - layout.houseX;
}

/**
 * Where the Mail Dispatcher stands on the home street, x from the house's centre: its saved
 * spot (or the usual one), or the nearest that is clear of the fixtures and of the
 * cultivations (but `excludeId`). `at` adds the drawn Mailbox and door x (home-street-fixtures
 * streetFixtures). Null in a back yard, or while it is put away (report 153).
 */
export function dispatcherRx(state, { excludeId = null, at = {} } = {}) {
  return fixtureRx(state, 'dispatcher', { excludeId, at });
}

/**
 * Report 153: the owner puts the Mail Dispatcher away. Its last spot stays saved for when it
 * is put out again. False when there is nothing to put away (a back yard, or already away).
 */
export function putAwayDispatcher(state) {
  if (!state || isBackYard(state) || dispatcherAway(state)) return false;
  state[DISPATCHER_AWAY_KEY] = true;
  return true;
}

/**
 * Report 153: stand the Mail Dispatcher on the street again, at its last spot if it still fits
 * there (cultivations planted while it was away may have taken it), else at the usual spot
 * (which steps aside as always). Returns { ok, kept, rx } (rx: x from the house's centre), or
 * { ok: false } when it is not away.
 */
export function putOutDispatcher(state, { at = {} } = {}) {
  if (!state || isBackYard(state) || !dispatcherAway(state)) return { ok: false };
  delete state[DISPATCHER_AWAY_KEY];
  const key = MOVABLE_FIXTURES.dispatcher.key;
  const saved = savedFixtureRx(state, 'dispatcher');
  let kept = false;
  if (saved != null) {
    const layout = homeStreetLayout(state);
    kept = fixtureFits(layout, 'dispatcher', layout.houseX + saved, fixtureObstacles(state, 'dispatcher', { at })).ok;
    if (!kept) delete state[key];
  }
  return { ok: true, kept, rx: fixtureRx(state, 'dispatcher', { at }) };
}

/** The nearest free spot to `rx` (searching outward), or null. */
export function nearestFreeRx(state, protoClass, rx, excludeId = null, opts = {}) {
  const start = Math.round(finite(rx, 0));
  for (let d = 0; d < 7000; d += 10) {
    for (const x of d ? [start + d, start - d] : [start]) {
      if (placementCheck(state, protoClass, x, excludeId, opts).ok) return x;
    }
  }
  return null;
}

/**
 * cultivation_purchase: level gate, imagination spend, choose_one end item.
 * @param {{ level?: number, imagination?: number }} pc  mutated (imagination)
 */
export function cultivate(state, pc, protoClass, rx, opts = {}) {
  const def = cultivationDef(protoClass);
  if (!def) return { ok: false, reason: 'invalid', msg: 'Invalid choice.' };
  const choice = cultivationChoices(state, pc).find((row) => row.protoClass === protoClass);
  if (!choice) return { ok: false, reason: 'full', msg: "You can't place any more of those." };
  if (Math.floor(finite(pc.level, 1)) < def.minLevel) {
    return { ok: false, reason: 'level', msg: `You're not high enough level. Need ${def.minLevel}` };
  }
  if (Math.floor(finite(pc.imagination, 0)) < choice.cost) {
    return { ok: false, reason: 'img', msg: "You don't have enough imagination." };
  }
  if (countCultivations(state) >= MAX_ITEMS) return { ok: false, reason: 'full', msg: "You can't place any more of those." };
  if (def.kind === 'tower' && (towerItem(state) || isBackYard(state))) return { ok: false, reason: 'full', msg: "You can't place any more of those." };
  const fit = placementCheck(state, protoClass, rx);
  if (!fit.ok) return fit;
  const rng = typeof opts.rng === 'function' ? opts.rng : Math.random;
  // cultivation_purchase: the Tower places its proto; everything else picks an end item.
  const endClass = def.kind === 'tower'
    ? TOWER_PROTO
    : def.endItems[Math.min(def.endItems.length - 1, Math.floor(rng() * def.endItems.length))];
  pc.imagination = Math.floor(finite(pc.imagination, 0)) - choice.cost;
  const item = {
    id: state.nextId++,
    protoClass,
    endClass,
    rx: Math.round(finite(rx, 0)),
    placedAt: Math.floor(finite(opts.now, Date.now())),
    wear: 0,
  };
  state.items.push(item);
  return { ok: true, item, cost: choice.cost, label: def.label, count: countCultivations(state) };
}

export function removeCultivation(state, id) {
  const item = state.items.find((row) => row.id === Number(id));
  if (!item) return { ok: false, reason: 'missing' };
  // A finished Tower is a building (furniture_tower_chassis has no remove verb).
  if (item.endClass === TOWER_CHASSIS) return { ok: false, reason: 'built', msg: 'Your Tower is built; it stays.' };
  state.items = state.items.filter((row) => row !== item);
  delete state.gardens[item.id];
  return { ok: true, item, label: cultivationDef(item.protoClass).label };
}

/** Nudge (move) a cultivation: cultivation_start can_nudge_cultivations needs Nudgery 1. */
export function nudgeCultivation(state, id, rx, learnedSkills = []) {
  const item = state.items.find((row) => row.id === Number(id));
  if (!item) return { ok: false, reason: 'missing' };
  if (!learnedSkills.includes(NUDGE_SKILL)) {
    return { ok: false, reason: 'skill', msg: 'Nudging cultivated things takes the Nudgery skill.' };
  }
  const fit = placementCheck(state, item.protoClass, rx, item.id);
  if (!fit.ok) return fit;
  item.rx = Math.round(finite(rx, item.rx));
  return { ok: true, item };
}

/** getMaxWearMultiplier: 1.0, + 0.05 a restore, at most 2.0. */
export function lifespanMultiplier(item) {
  return 1 + LIFESPAN_STEP * Math.max(0, Math.min(MAX_LIFE_STEPS, Math.floor(finite(item?.lifeSteps, 0))));
}

/**
 * getMaxWear: cultivation_max_wear x the multiplier. `opts.maxWear` (QA
 * &cultwear=N) replaces the base uses so an item wears out in N.
 */
export function maxWear(item, opts = {}) {
  const base = finite(opts.maxWear, 0) > 0 ? Math.floor(opts.maxWear) : cultivationDef(item?.protoClass)?.maxWear || 0;
  return base * lifespanMultiplier(item);
}

/** include/cultivation.js addWear: returns depleted once wear reaches max. */
export function addWear(state, id, wear = 1, opts = {}) {
  const item = state.items.find((row) => row.id === Number(id));
  if (!item) return { ok: false, reason: 'missing' };
  // addWear: an item that is already depleted takes no more wear.
  if (item.depleted) return { ok: false, reason: 'depleted', item };
  const max = maxWear(item, opts);
  if (!max) return { ok: true, item, depleted: false };
  item.wear += Math.max(0, Math.floor(finite(wear, 1)));
  return { ok: true, item, depleted: item.wear >= max, left: Math.max(0, 1 - item.wear / max) };
}

/** Lifespan left as a 0..1 fraction (buildConfig lifespan.percentage_left). */
export function lifespanLeft(item, opts = {}) {
  if (item?.depleted) return 0;
  const max = maxWear(item, opts);
  return max ? Math.max(0, 1 - item.wear / max) : 1;
}

/** Uses until it wears out (for the Cultivate card), rounded up. */
export function usesLeft(item, opts = {}) {
  if (item?.depleted) return 0;
  return Math.max(0, Math.ceil(maxWear(item, opts) - (item?.wear || 0)));
}

/** The live cultivations other systems draw and run (protos are inert). */
export function liveItems(items) {
  return (items || []).filter((row) => !row.depleted);
}

/**
 * replaceWithDepleted: the item becomes its proto in place, keeping the
 * multiplier, the restorer and (Wine of the Dead) wotd. Its garden plots are
 * gone; a restore plants a fresh garden_new. Each depletion is a new proto
 * (a new tsid in the source), so `cycle` names a fresh project.
 */
export function depleteCultivation(state, id, opts = {}) {
  const item = state.items.find((row) => row.id === Number(id));
  if (!item) return { ok: false, reason: 'missing' };
  const def = cultivationDef(item.protoClass);
  if (def.kind === 'tower') return { ok: false, reason: 'tower' };
  if (item.depleted) return { ok: false, reason: 'depleted', item };
  item.depleted = true;
  item.cycle = (item.cycle || 0) + 1;
  if (opts.wotd) item.wotd = true;
  delete state.gardens[item.id];
  return { ok: true, item, label: def.label, jobId: restoreJobId(item) };
}

/** The proto's project id (items/proto_*.js setJobData 'proto-'+tsid); the back yard's have their own. */
export function restoreJobId(item, state = null) {
  return `home-proto-${isBackYard(state) ? 'back-' : ''}${item.id}-${item.cycle || 1}`;
}

/** Reward multiplier the restore pays (quest.js: spirit.getMaxWearMultiplier()). */
export function restoreRewardMultiplier(item) {
  return lifespanMultiplier(item);
}

/**
 * quest.js doJobEffects type 5: a new end item (choose_one), wear 0, and the
 * multiplier + 0.05 unless the proto was made by Wine of the Dead. A player
 * who restored it last time sets times_restored = 1 + (multiplier - 1) / .05.
 */
export function restoreCultivation(state, id, opts = {}) {
  const item = state.items.find((row) => row.id === Number(id));
  if (!item) return { ok: false, reason: 'missing' };
  if (!item.depleted) return { ok: false, reason: 'live', item };
  const def = cultivationDef(item.protoClass);
  const rng = typeof opts.rng === 'function' ? opts.rng : Math.random;
  const before = lifespanMultiplier(item);
  const steps = Math.max(0, Math.min(MAX_LIFE_STEPS, Math.floor(finite(item.lifeSteps, 0))));
  let times = 0;
  if (item.wotd) {
    // The wotd branch keeps the multiplier and sets no restorer.
    delete item.restorer;
  } else {
    if (item.restorer) times = 1 + steps;
    item.lifeSteps = Math.min(MAX_LIFE_STEPS, steps + 1);
    item.restorer = true;
  }
  delete item.wotd;
  delete item.depleted;
  item.endClass = def.endItems[Math.min(def.endItems.length - 1, Math.floor(rng() * def.endItems.length))];
  item.wear = 0;
  item.placedAt = Math.floor(finite(opts.now, Date.now()));
  const gain = Math.max(0, times - (state.timesRestored || 0));
  if (gain) state.timesRestored = times;
  return { ok: true, item, label: def.label, before, after: lifespanMultiplier(item), times, timesGain: gain };
}

/**
 * home_get_yard_expansion_costs (exterior): the next expansion costs
 * FRONTYARD_EXPAND_COSTS[expansions so far] iMG; each side stops at its max.
 * The back yard (interior): BACKYARD_EXPAND_COSTS[expansions so far], one
 * way only (to the left), `count` expansions left (houses_expand_yard).
 */
export function quoteYardExpansion(state, pc = {}, side = 'right') {
  const seg = yardSegments(state);
  if (isBackYard(state)) {
    const costs = HOME_LIMITS.BACKYARD_EXPAND_COSTS;
    const done = state.yardLeft || 0;
    const count = Math.max(0, HOME_LIMITS.MAX_BACKYARD_SEGMENTS - seg.left);
    const cost = costs[Math.min(done, costs.length - 1)];
    const base = { side: 'left', cost, count, countLeft: count, countRight: 0 };
    if (count <= 0) return { ...base, ok: false, reason: 'already_max_size', msg: "This yard can't be expanded anymore." };
    if (Math.floor(finite(pc.imagination, 0)) < cost) {
      return { ...base, ok: false, reason: 'img', msg: 'You need more imagination' };
    }
    return { ...base, ok: true };
  }
  const remainLeft = HOME_LIMITS.MAX_FRONTYARD_LEFT_SEGMENTS - seg.left;
  const remainRight = HOME_LIMITS.MAX_FRONTYARD_RIGHT_SEGMENTS - seg.right;
  const done = (state.yardLeft || 0) + (state.yardRight || 0);
  const costs = HOME_LIMITS.FRONTYARD_EXPAND_COSTS;
  const cost = costs[Math.min(done, costs.length - 1)];
  const remain = side === 'left' ? remainLeft : remainRight;
  const base = { side, cost, countLeft: remainLeft, countRight: remainRight };
  if (side !== 'left' && side !== 'right') return { ...base, ok: false, reason: 'side' };
  if (remain <= 0) return { ...base, ok: false, reason: 'already_max_size', msg: 'That side of your street is as long as it gets.' };
  if (Math.floor(finite(pc.imagination, 0)) < cost) {
    return { ...base, ok: false, reason: 'img', msg: `Expanding costs ${cost.toLocaleString()} iMG.` };
  }
  return { ...base, ok: true };
}

export function expandYard(state, pc, side = 'right') {
  const quote = quoteYardExpansion(state, pc, side);
  if (!quote.ok) return quote;
  pc.imagination = Math.floor(finite(pc.imagination, 0)) - quote.cost;
  const back = isBackYard(state);
  if (back || side === 'left') state.yardLeft += 1;
  else state.yardRight += 1;
  const seg = yardSegments(state);
  // home_add_expansion: max_expansions:yard (back) / :street (front) once the last one is bought.
  const maxed = back
    ? seg.left >= HOME_LIMITS.MAX_BACKYARD_SEGMENTS
    : seg.left >= HOME_LIMITS.MAX_FRONTYARD_LEFT_SEGMENTS && seg.right >= HOME_LIMITS.MAX_FRONTYARD_RIGHT_SEGMENTS;
  return { ok: true, cost: quote.cost, side: back ? 'left' : side, segments: seg, maxed, layout: homeStreetLayout(state) };
}

/**
 * firefly_hive.js spawner: one Firefly every spawn_interval (60 s) up to
 * max_count (10) around the hive (spawn_radius 200).
 */
export const FIREFLY_HIVE = Object.freeze({ intervalMs: 60_000, maxCount: 10, radius: 200 });

export function hiveFireflyCount(item, now = Date.now()) {
  const elapsed = Math.max(0, finite(now, 0) - (item?.placedAt || 0));
  return Math.min(FIREFLY_HIVE.maxCount, 1 + Math.floor(elapsed / FIREFLY_HIVE.intervalMs));
}

/** Where a hive's Fireflies hover now ({ dx, dy } from the hive), one per Firefly it has spawned (homes-feature cultivationNodes; the site's HomeYard::homeNodes). */
export function hiveFireflySpots(item, now = Date.now()) {
  const n = hiveFireflyCount(item, now);
  const out = [];
  for (let i = 0; i < n; i += 1) {
    const a = (i / Math.max(1, n)) * Math.PI * 2 + 0.6;
    out.push({ dx: Math.round(Math.cos(a) * FIREFLY_HIVE.radius * 0.6), dy: -40 - (i % 3) * 22 });
  }
  return out;
}

/** Seed a lived-in demo yard (QA routes). Ignores cost and level. */
export function cultivateDemoYard(state, now = Date.now()) {
  if (isBackYard(state)) {
    // The back yard: two more segments, a garden, a patch and a rock left of the house.
    state.yardLeft = Math.max(state.yardLeft, 2);
    const rich = { level: 60, imagination: 1e9 };
    for (const [protoClass, rx] of [['proto_herb_garden_small', -260], ['proto_patch', -560], ['proto_beryl_rock', -820]]) {
      const at = nearestFreeRx(state, protoClass, rx);
      if (at != null) cultivate(state, rich, protoClass, at, { now, rng: () => 0 });
    }
    return state;
  }
  const plan = [
    ['proto_crop_garden_medium', -520],
    ['proto_patch', 470],
    ['proto_metal_rock', 760],
    ['proto_peat', 1010],
    ['proto_herb_garden_small', 1250],
    ['proto_barnacle_pod', 1560],
  ];
  // The demo yard is two segments longer on the right, so nothing crowds the house.
  state.yardRight = Math.max(state.yardRight, 2);
  const rich = { level: 60, imagination: 1e9 };
  for (const [protoClass, rx] of plan) {
    const at = nearestFreeRx(state, protoClass, rx);
    if (at != null) cultivate(state, rich, protoClass, at, { now, rng: () => 0 });
  }
  return state;
}
