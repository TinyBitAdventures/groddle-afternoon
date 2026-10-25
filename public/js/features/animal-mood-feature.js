/**
 * Piggy mood, hunger and self-feeding, and sad animals, as a feature module
 * (see js/feature-host.js). Rules and source citations live in
 * js/animal-mood.js; this file puts them on the street:
 *
 * - Every piggy carries mood (0..2) and hunger (0..10) on its own
 *   twice-daily clock. Ticks that fell due while you were away replay when
 *   you arrive (a hungry piggy eats a dropped food stack or a trant's fruit
 *   at once); a tick while you watch sends it walking. The back yard replays
 *   its herd in advanceYard instead.
 * - Food dropped on the street, or a trant you harvest, water or pet with
 *   fruit on it, sends every hungry piggy to it: on arrival it eats one,
 *   chews, says "Yum!" and its hunger goes to 0.
 * - A piggy at hunger 10 says "I'm about to croak!" once a minute. Only a
 *   piggy you own (released or raised: the animal-husbandry feature's
 *   extras) can starve: each tick at 10 rolls 50% and the tick's die event
 *   calls the target's husbandryStarve (smoke puff, gone, 10 Meat and a
 *   Plop), live or replayed on arrival. Street-ecology piggies never die
 *   and keep croaking (PIGGY_STARVATION_DEATH, Austin's call G63). The back
 *   yard herd starves through advanceYard.
 * - A pet sets has_been_petted, so the next daily tick keeps that piggy's
 *   mood (PIGGY_PET_PROTECTS_MOOD, Austin's fix of the source bug G63b).
 * - Nibble: petted (or Animal Kinship VI) but mood 0 or hunger > 2, the
 *   piggy refuses at once (no action bar), sulks and says nibble_na_fail.
 * - Piggies (and the Chick, Piglet and Caterpillar in your pack) are sad in
 *   the places locationIsDepressing lists: they stop, sulk (too_much_nibble,
 *   rooked2 a fifth of the time), complain every 30 s, and refuse pet,
 *   nibble, feed and name; capture always works and has no location
 *   cooldown.
 * - Crowding (G64, js/animal-crowding.js): every Piggy, Chicken and
 *   Butterfly on a street checks when another of its class arrives
 *   (chickens and butterflies also when one leaves). Near the street's
 *   limit (getSadnessMax: by width, halved on public streets, raised in
 *   your back yard by the Happy Animals cards) it may sulk for 3 minutes
 *   (stops, crowding lines every 30 s, sulk clips, sad verbs refused), say
 *   it is OUT of here and leave in a puff 7 s later, or, at the limit,
 *   puff away at once. A sad spell checks again 5 minutes after it ends.
 *   Ecology animals that leave are marked state.crowdGone and come back
 *   from the street's archived population at the next game-day rollover
 *   (G82): live on the street you stand on (onNewDay), and on any other
 *   street when you next arrive (crowdRespawnBoundary). Released and raised
 *   ones leave their husbandry slot for good (target.husbandryVanish).
 *   Chickens and Butterflies somewhere depressing leave or vanish on load
 *   (npc_chicken.js / npc_butterfly.js onLoad).
 *
 * QA: ?autostart=1&fresh=1&resetgame=1&questoffer=off&animaldemo=piggy
 *   &animalrank=6&animalreset=1&animalmood=0 (E → nibble refuses);
 *   &animalhunger=9&animalfood=potato drops 3 Potatoes 220 px away and the
 *   piggy walks over and eats one; &animalhunger=10 croaks. Add
 *   &animaldeathroll=0 (or 0.99) to put the demo piggy's next tick 3 s away
 *   and force the starvation roll: an ecology piggy only croaks, an owned one
 *   (&animaldemo=starve, or the yard's &homedemo=home&animaldemo=remote)
 *   dies.
 *   Sad: &animaldemo=sad&streetdemo=GA9114MS8B32FB2 releases a Hog-tied
 *   Piggy in Churni Sanctum (Ilmenskie Deeps) and puts a Piglet in the
 *   pack. Canvas: animalMoodDepressing, animalMoodSad, animalMoodPiggy
 *   (mood:hunger of the demo piggy), animalMoodSeeking, animalMoodCroaking,
 *   animalMoodLast.
 *   Crowding: &animaldemo=crowd (animal-husbandry-feature.js) fills the
 *   street with released Piggies to its limit and every Piggy checks;
 *   &animalcrowdclass=npc_chicken|npc_butterfly crowds that class instead,
 *   &animalcrowdover=N adds N past the limit, &animalcrowdroll=<0..1> forces
 *   every crowding roll (0.5 all sulk after 12 s, 0.03 all leave, 0.95 all
 *   puff away at the limit), &animalcrowdfx=hold keeps the puffs up. In the
 *   yard (&homedemo=home) &animalcard=1|2 grants Happy Animals / Super Happy
 *   Animals first. Canvas: animalCrowd (class:population/limit),
 *   animalCrowdSad, animalCrowdPending, animalCrowdLeaving, animalCrowdGone,
 *   animalCrowdChecks, animalCrowdCard, animalCrowdLast.
 *   Respawn (G82): add &animalcrowdrespawn=1 and, once the street animals
 *   that left are gone, the saved game day is set back one day so the
 *   game's own new-day poll rolls the day (new-day screen, onNewDay) and
 *   they walk back. Canvas: animalCrowdLeft (ecology animals off this
 *   street), animalCrowdReturned, animalCrowdRespawn (armed|rolled).
 */

import { createSheetLoader, pixiSpeed } from '../sprite-sheets.js';
import { nearestSurfaceY } from '../walk-surface.js';
import { displayTopOf, itemstackOverlayPoint, playSheetOverlay } from '../overlay-art.js?v=g294-1';
import { isInHell } from '../hell.js';
import { HOG_HAUL_STREET_ID } from '../hog-haul.js?v=hog-haul-2';
import { TRANT_META, trantStatusLabel } from '../trants.js?v=trant-harvest-2';
import { animalStatusLabel } from '../animals.js?v=g296-1';
import { quoteAnimalKinship } from '../animal-kinship.js?v=g296-1';
import { captureVerbState, isFoodItem, itemLabel } from '../animal-husbandry.js';
import { ROOK_SHEETS, rookAttackFeature } from './rook-attack-feature.js?v=g300-1';
import {
  CHECK_ON_REMOVE,
  CROWD_CLASSES,
  CROWD_LEAVE_LINE,
  CROWD_SAD_REASONS,
  CROWD_TIMING,
  canStartSadness,
  crowdCard,
  crowdSadClip,
  crowdGoneReturns,
  crowdRespawnBoundary,
  crowdSadLinePool,
  gloomOnLoad,
  isCrowdSad,
  sadnessCheck,
  sadnessEnd,
  sadnessMax,
  sadnessStart,
  streetWidth,
} from '../animal-crowding.js?v=g82-1';
import { GAME_DAY_MS, setLastNewDayTs } from '../game-day.js?v=dametime-1';
import {
  CROAK_INTERVAL_MS,
  EAT_PAUSE_MS,
  EAT_RADIUS,
  NIBBLE_NA_FAIL,
  PIGGY_HUNGER,
  PIGGY_LINES,
  PIGGY_DEATH_PUFF,
  SAD_BABY_LINES,
  SAD_INTERVAL_MS,
  SAD_PIGGY_LINES,
  advancePiggies,
  ensurePiggyMood,
  forcedRoll,
  isSadIn,
  locationIsDepressing,
  pickLine,
  piggyNibbleRefusal,
  piggyWalkSpeed,
  sadPiggyClip,
  satePiggy,
} from '../animal-mood.js';

export const ANIMAL_MOOD_FEATURE_ID = 'animal-mood';
const YARD_TSID = 'RH_HOME_EXT';
/** apiFindPath on a street: food much higher or lower than the piggy is out of reach. */
const REACH_DY = EAT_RADIUS;

/** OGA npc_piggy sheets (88×62 cells, measured): too_much_nibble 11×6 (65), chew 11×5 (53). */
export const PIGGY_MOOD_SHEETS = Object.freeze({
  tooMuchNibble: Object.freeze({ path: 'assets/sprites/npc_piggy__x1_too_much_nibble_png_1354829441.png', fw: 88, fh: 62, cols: 11, frames: 65 }),
  chew: Object.freeze({ path: 'assets/sprites/npc_piggy__x1_chew_png_1354829433.png', fw: 88, fh: 62, cols: 11, frames: 53 }),
  rooked2: Object.freeze({ path: 'assets/sprites/rooks/piggy-rooked2.png', fw: 88, fh: 62, cols: 8, frames: 24 }),
});

/**
 * onSadnessInterval's other clips: OGA npc_chicken sit (740×440, 5×4 of
 * 148×110, 20 frames, measured), and the rook feature's chicken rooked2 and
 * butterfly fly-rooked sheets.
 */
export const CROWD_SHEETS = Object.freeze({
  chickenSit: Object.freeze({ path: 'assets/sprites/animals/npc_chicken_sit.png', fw: 148, fh: 110, cols: 5, frames: 20 }),
  chickenRooked2: ROOK_SHEETS.chicken2,
  butterflyFlyRooked: ROOK_SHEETS.bflyFly,
});

// ---------------------------------------------------------------------------
// Where are we?
// ---------------------------------------------------------------------------

let placeCache = { tsid: null, depressing: false };

/** The engine's current location as a locationIsDepressing descriptor. */
export function describeAnimalPlace(engine) {
  const street = engine?.street || {};
  const tsid = String(engine?.streetTsid || street.tsid || '');
  const scene = typeof engine?.inScene === 'function' && engine.inScene();
  return {
    tsid,
    hubId: street.hubId ?? '',
    hubName: street.hubName || '',
    label: street.label || '',
    // Races (feature scenes) and the Great Hog Haul game are never sad.
    race: Boolean(scene),
    game: tsid === HOG_HAUL_STREET_ID,
    inHell: isInHell(tsid, street.hubId ?? ''),
    instance: typeof engine?.transientInstance === 'function' && engine.transientInstance(),
    newxp: Boolean(street.newxp),
  };
}

/** isSad() location test for the street you stand on (also the pack's babies). */
export function animalPlaceIsDepressing(engine) {
  const tsid = String(engine?.streetTsid || '');
  if (placeCache.tsid !== tsid) placeCache = { tsid, depressing: locationIsDepressing(describeAnimalPlace(engine)) };
  return placeCache.depressing;
}

// ---------------------------------------------------------------------------
// Runtime
// ---------------------------------------------------------------------------

let loader = null;
let records = new Map(); // target -> runtime record
let knownStacks = new Map(); // dropped stack id -> count on this street
let streetKey = null;
let scanAt = 0;
let publishAt = 0;
let lastEvent = '';
let qaApplied = false;
let foodDemoDone = false;
let tickCount = 0; // QA: twice-daily ticks that produced events (at hunger 10 every tick croaks)

const now = () => Date.now();

function isRooked(target, engine) {
  try {
    return rookAttackFeature.verbOverride?.(target, engine) != null;
  } catch {
    return false;
  }
}

function livePiggies(engine) {
  return (engine.interactables || []).filter((t) => t?.classId === 'npc_piggy'
    && t.state && t.sprite && !t.sprite.destroyed && t.sprite.visible !== false && !t.featureId);
}

function recordFor(target) {
  let r = records.get(target);
  if (!r) {
    r = { target, mode: 'idle', food: null, saved: null, holdUntil: 0, nextSadAt: 0, nextCroakAt: 0, speed: 0 };
    records.set(target, r);
  }
  return r;
}

function isExtra(target) {
  return Boolean(target?.husbandryAnimal);
}

function frames(def) {
  return loader?.ready(def) ? loader.frames(def) : [];
}

function walkFrames(engine, target) {
  return (engine.textures?.piggyWalk?.frames || []).slice(0, 8);
}

/** Stop the patrol: game.js clamps an ecology piggy to baseX ± range; extras honour _moodHold. */
function hold(engine, r) {
  const spr = r.target.sprite;
  if (!r.saved) r.saved = { range: spr.range, vx: spr.vx };
  if (isExtra(r.target)) spr._moodHold = true;
  else {
    // A 2 px range and a creeping vx keep the facing without the clamp flipping it.
    spr.baseX = spr.x;
    spr.range = 2;
    spr.vx = (spr.vx < 0 ? -1 : 1) * 1e-6;
  }
}

function release(engine, r) {
  const spr = r.target.sprite;
  r.mode = 'idle';
  r.food = null;
  if (!spr || spr.destroyed) return;
  if (isExtra(r.target)) {
    spr._moodHold = false;
    spr._moodRebase = spr.x;
  } else if (r.saved) {
    spr.baseX = spr.x;
    spr.range = r.saved.range ?? 90;
    spr.vx = (Math.random() < 0.5 ? -1 : 1) * (Math.abs(r.saved.vx) > 0.01 ? Math.abs(r.saved.vx) : 0.45);
  }
  r.saved = null;
}

function face(r, dir) {
  const spr = r.target.sprite;
  if (isExtra(r.target)) spr.scale.x = Math.abs(spr.baseScale || spr.scale.x) * (dir > 0 ? -1 : 1);
  else spr.vx = dir * 1e-6;
}

function setX(r, x) {
  const spr = r.target.sprite;
  spr.x = x;
  if (!isExtra(r.target)) spr.baseX = x;
}

function playClip(engine, r, def, { loop = false, fps = 24, restore = true } = {}) {
  const spr = r.target.sprite;
  const clip = frames(def);
  if (!clip.length || !spr || spr.destroyed || typeof spr.gotoAndPlay !== 'function') return false;
  spr.textures = clip;
  spr.loop = loop;
  spr.animationSpeed = pixiSpeed(fps);
  spr.gotoAndPlay(0);
  spr.onComplete = restore
    ? () => {
      if (spr.destroyed || r.mode === 'sad') return;
      const walk = walkFrames(engine, r.target);
      if (walk.length) spr.textures = walk;
      spr.loop = true;
      spr.animationSpeed = isExtra(r.target) ? 0.13 : 0.14;
      spr.gotoAndPlay(0);
      spr.onComplete = null;
    }
    : null;
  return true;
}

function say(engine, target, text, ms) {
  if (text) engine.say(target, text, ms);
}

// —— Food on the street ————————————————————————————————————————————————————

function streetStacks(engine) {
  return engine.droppedItems?.streets?.[engine.streetTsid] || [];
}

function foodStacks(engine) {
  return streetStacks(engine).filter((row) => row && row.count > 0 && isFoodItem(row.classTsid));
}

function fruitingTrants(engine) {
  return (engine.interactables || []).filter((t) => TRANT_META[t?.classId] && t.state && Number(t.state.fruitCount) > 0 && t.sprite && !t.sprite.destroyed);
}

function reachable(spr, x, y) {
  return Number.isFinite(x) && (!Number.isFinite(y) || Math.abs(y - spr.y) <= REACH_DY);
}

/** onTwiceDaily's food search: dropped food first, else a trant with fruit. */
function findFoodFor(engine, target) {
  const spr = target.sprite;
  const byDist = (a, b) => Math.abs(a.x - spr.x) - Math.abs(b.x - spr.x);
  const food = foodStacks(engine)
    .filter((row) => reachable(spr, row.x, row.y))
    .map((row) => ({ kind: 'stack', id: row.id, x: row.x, y: row.y }))
    .sort(byDist)[0];
  if (food) return food;
  return fruitingTrants(engine)
    .filter((t) => reachable(spr, t.sprite.x, t.sprite.y))
    .map((t) => ({ kind: 'trant', target: t, x: t.sprite.x, y: t.sprite.y }))
    .sort(byDist)[0] || null;
}

/** apiConsume(1) on a dropped stack. */
function consumeStack(engine, row) {
  const rows = streetStacks(engine);
  row.count -= 1;
  if (row.count <= 0) {
    const i = rows.indexOf(row);
    if (i >= 0) rows.splice(i, 1);
    if (!rows.length && engine.droppedItems?.streets) delete engine.droppedItems.streets[engine.streetTsid];
  }
  knownStacks.set(row.id, Math.max(0, row.count));
  if (row.count <= 0) knownStacks.delete(row.id);
  engine.droppedItemsChanged();
}

/** removeFruit(1) on a trant. */
function eatFruit(trant) {
  trant.state.fruitCount = Math.max(0, (Number(trant.state.fruitCount) || 0) - 1);
  const meta = TRANT_META[trant.classId];
  if (meta) trant.subtitle = trantStatusLabel(trant.state, meta);
}

/** onFoodPathing arrival: one food item, else one fruit, within 100 px. */
function eatNearby(engine, target) {
  const spr = target.sprite;
  const near = (x, y) => Math.hypot(x - spr.x, (Number.isFinite(y) ? y : spr.y) - spr.y) <= EAT_RADIUS;
  const stack = foodStacks(engine).find((row) => near(row.x, row.y));
  if (stack) {
    const cls = stack.classTsid;
    consumeStack(engine, stack);
    return { kind: 'stack', classTsid: cls };
  }
  const trant = fruitingTrants(engine).find((t) => near(t.sprite.x, t.sprite.y));
  if (trant) {
    eatFruit(trant);
    return { kind: 'trant', classTsid: trant.classId };
  }
  return null;
}

/** An offline tick's seek lands at once. */
function eatOffline(engine, food) {
  if (food?.kind === 'stack') {
    const row = streetStacks(engine).find((r) => r.id === food.id && r.count > 0);
    if (!row) return false;
    consumeStack(engine, row);
    return true;
  }
  if (food?.kind === 'trant' && Number(food.target?.state?.fruitCount) > 0) {
    eatFruit(food.target);
    return true;
  }
  return false;
}

function canSeek(engine, r) {
  const s = r.target.state;
  if (r.mode === 'sad' || r.mode === 'eat') return false;
  // isSad(): a piggy sulking from crowding will not walk to food (npc_piggy.js 1394, 1419).
  if (isCrowdSad(s, now()) || crowd.get(r.target)?.mode === 'leaving') return false;
  if (!(Number(s.hunger) > 0)) return false;
  return !isRooked(r.target, engine);
}

function startSeek(engine, r, food) {
  if (!food || !reachable(r.target.sprite, food.x, food.y)) return false;
  hold(engine, r);
  r.mode = 'seek';
  r.food = food;
  r.speed = piggyWalkSpeed(r.target.state.hunger);
  lastEvent = `seek:${food.kind}:${food.kind === 'stack' ? food.id : food.target?.classId}`;
  return true;
}

function stepSeek(engine, r, dtMs) {
  const spr = r.target.sprite;
  const fx = r.food.x;
  const dx = fx - spr.x;
  if (Math.abs(dx) <= 6) {
    arrive(engine, r);
    return;
  }
  const dir = dx > 0 ? 1 : -1;
  const step = Math.min(Math.abs(dx), (r.speed * dtMs) / 1000);
  setX(r, spr.x + dir * step);
  face(r, dir);
  if (isExtra(r.target)) {
    const y = nearestSurfaceY(engine.platforms, spr.x, spr.y);
    if (Number.isFinite(y)) spr.y = y + 2;
  }
}

function arrive(engine, r) {
  const target = r.target;
  const ate = Number(target.state.hunger) > 0 ? eatNearby(engine, target) : null;
  if (ate) {
    satePiggy(target.state);
    playClip(engine, r, PIGGY_MOOD_SHEETS.chew);
    say(engine, target, PIGGY_LINES.yum, PIGGY_LINES.yumMs);
    target.subtitle = animalStatusLabel('npc_piggy', target.state);
    lastEvent = `ate:${ate.classTsid}`;
    engine.save();
  } else {
    lastEvent = 'seek:missed';
  }
  r.mode = 'eat';
  r.food = null;
  r.holdUntil = now() + EAT_PAUSE_MS;
}

// —— Sadness ————————————————————————————————————————————————————————————

function startSad(engine, r) {
  hold(engine, r);
  r.mode = 'sad';
  r.nextSadAt = 0; // a depressing place starts the interval at once (onSadnessStart 182)
}

function sadInterval(engine, r) {
  say(engine, r.target, pickLine(SAD_PIGGY_LINES), 7000);
  const clip = sadPiggyClip();
  playClip(engine, r, clip === 'rooked2' ? PIGGY_MOOD_SHEETS.rooked2 : PIGGY_MOOD_SHEETS.tooMuchNibble, { restore: false });
  r.nextSadAt = now() + SAD_INTERVAL_MS;
  lastEvent = `sad:${clip}`;
}

// —— Crowding (G64) ————————————————————————————————————————————————————————

let crowd = new Map(); // target -> { mode: 'pending'|'sad'|'leaving', startAt, until, lineAt, puffAt, goneAt, saved, finish }
let crowdSeen = new Set(); // crowd-class targets already adopted on this street
let crowdStats = { checks: 0, gone: 0, returned: 0 };
let crowdLast = '';
let crowdLeft = new Set(); // ecology animals that left this street (hidden until the day rolls, G82)
let crowdRolledAt = 0; // the last game-day rollover this feature saw (saved; a forced roll counts)
let crowdRespawnQa = ''; // &animalcrowdrespawn=1: '' → 'armed' → 'rolled'
let crowdRespawnAt = 0;

/**
 * The smoke_puff overlay (also the starvation puff, animal-husbandry-feature.js):
 * items/npc_piggy.js 1964-1971 (npc_butterfly.js 998-1007, npc_chicken.js 958-967
 * alike) itemstack_overlay, delta_y 95 from the stack's display top, following
 * it, 1.5 s: Tiny Speck's own puff (tools/overlay-art, G251; 24 fps, stop() on
 * its last frame). `top` is the stack's display top (displayTopOf). `hold`
 * keeps the full puff up for screenshots.
 */
export function smokePuff(engine, x, top, { hold = false } = {}) {
  const layer = engine?.entityLayer;
  if (!engine?.PIXI || !layer) return null;
  const at = itemstackOverlayPoint(x, top, { dy: PIGGY_DEATH_PUFF.deltaY });
  return playSheetOverlay(engine.PIXI, PIGGY_DEATH_PUFF.overlay, {
    layer,
    at: () => at,
    durationMs: PIGGY_DEATH_PUFF.durationMs,
    loop: false,
    holdMs: hold ? 300 : null,
    zIndex: 70,
  });
}

function crowdActive(engine) {
  // Races and the Great Hog Haul game keep their own animals.
  if (typeof engine?.inScene === 'function' && engine.inScene()) return false;
  return engine?.streetTsid !== HOG_HAUL_STREET_ID;
}

/** countItemClass: the live animals of a class on this street (leaving ones count until they are gone). */
function crowdAnimals(engine, classId) {
  return (engine.interactables || []).filter((t) => t?.classId === classId && !t.featureId && t.state
    && t.sprite && !t.sprite.destroyed && t.sprite.visible !== false && !t._crowdGone);
}

/** getSadnessMax for this street: the back yard is your POL, so it is not halved and your cards count. */
export function crowdLimit(engine, classId) {
  const yard = engine?.streetTsid === YARD_TSID;
  return sadnessMax(classId, {
    width: streetWidth(engine?.street?.bounds, engine?.worldW),
    pol: yard,
    upgrades: yard ? engine?.pc?.imaginationUpgrades || [] : [],
  });
}

/** isSad()'s is_sad half for a target (a crowd sulk running now). */
export function animalCrowdSad(target) {
  return isCrowdSad(target?.state, now());
}

function crowdRoll(engine) {
  return forcedRoll(engine.param('animalcrowdroll'));
}

function groundUnder(engine, spr) {
  const y = nearestSurfaceY(engine.platforms, spr.x, spr.y + 40);
  return Number.isFinite(y) ? y : engine.groundY;
}

/** fullStop (and a butterfly drops to the platform below it, onSadnessStart 173-179). */
function crowdHold(engine, target, rec) {
  const spr = target.sprite;
  if (!spr || spr.destroyed) return;
  if (!rec.saved) {
    rec.saved = {
      textures: spr.textures,
      loop: spr.loop,
      speed: spr.animationSpeed,
      vx: spr.vx,
      range: spr.range,
      ambient: spr._ambient,
      groundY: spr._groundY,
    };
  }
  if (isExtra(target)) {
    spr._moodHold = true;
    if (target.classId === 'npc_butterfly') spr.y = groundUnder(engine, spr) - 22;
    return;
  }
  if (target.classId === 'npc_butterfly') {
    spr.vx = 0;
    if (spr._ambient) {
      spr._ambient = false;
      spr._groundY = groundUnder(engine, spr) - 2;
    }
    return;
  }
  spr.baseX = spr.x;
  spr.range = 2;
  spr.vx = (spr.vx < 0 ? -1 : 1) * 1e-6;
}

/** onSadnessEnd → onRevived: walk (or fly) again. */
function crowdRelease(engine, target, rec) {
  const spr = target.sprite;
  const saved = rec?.saved;
  if (rec) rec.saved = null;
  if (!spr || spr.destroyed || !saved) return;
  if (saved.textures && typeof spr.gotoAndPlay === 'function') {
    spr.textures = saved.textures;
    spr.loop = saved.loop ?? true;
    spr.animationSpeed = saved.speed ?? spr.animationSpeed;
    spr.onComplete = null;
    spr.gotoAndPlay(0);
  }
  if (isExtra(target)) {
    spr._moodHold = false;
    spr._moodRebase = spr.x;
    return;
  }
  if (target.classId === 'npc_butterfly') {
    spr.vx = saved.vx || 0;
    spr._ambient = saved.ambient;
    spr._groundY = saved.groundY;
    return;
  }
  spr.baseX = spr.x;
  spr.range = saved.range ?? 90;
  const speed = target.classId === 'npc_chicken' ? 0.5 : 0.45;
  spr.vx = (Math.random() < 0.5 ? -1 : 1) * (Math.abs(saved.vx) > 0.01 ? Math.abs(saved.vx) : speed);
}

function crowdClipDef(classId, clip) {
  if (classId === 'npc_piggy') return clip === 'rooked2' ? PIGGY_MOOD_SHEETS.rooked2 : PIGGY_MOOD_SHEETS.tooMuchNibble;
  if (classId === 'npc_chicken') return clip === 'rooked2' ? CROWD_SHEETS.chickenRooked2 : CROWD_SHEETS.chickenSit;
  if (classId === 'npc_butterfly') return CROWD_SHEETS.butterflyFlyRooked;
  return null;
}

/** onSadnessInterval: the bubble and the sulk clip. */
function crowdInterval(engine, target, rec, depressing) {
  const pool = crowdSadLinePool(target.classId, { depressing, depressedLines: SAD_PIGGY_LINES, babyLines: SAD_BABY_LINES });
  say(engine, target, pickLine(pool), CROWD_TIMING.bubbleMs);
  const clip = crowdSadClip(target.classId);
  const def = crowdClipDef(target.classId, clip);
  const spr = target.sprite;
  const clipFrames = def ? frames(def) : [];
  if (clipFrames.length && spr && !spr.destroyed && typeof spr.gotoAndPlay === 'function') {
    spr.textures = clipFrames;
    spr.loop = target.classId === 'npc_butterfly';
    spr.animationSpeed = pixiSpeed(24);
    spr.onComplete = null;
    spr.gotoAndPlay(0);
  }
  rec.lineAt = now() + CROWD_TIMING.intervalMs;
  crowdLast = `sulk:${target.classId}:${clip}`;
}

function crowdRecord(target) {
  let rec = crowd.get(target);
  if (!rec) {
    rec = { mode: null, startAt: 0, until: 0, lineAt: 0, puffAt: 0, goneAt: 0, saved: null, finish: null };
    crowd.set(target, rec);
  }
  return rec;
}

/** Take the animal off the street for good: the husbandry slot row now, an ecology animal's crowdGone flag. */
function markGone(engine, target, rec) {
  if (isExtra(target) && typeof target.husbandryVanish === 'function') rec.finish = target.husbandryVanish();
  else if (target.state) target.state.crowdGone = now();
  delete target.state?.crowdSadUntil;
  delete target.state?.crowdCheckAt;
  engine.save?.();
}

/** apiDelete: gone from the world; chickens and butterflies left behind check again. */
function removeGone(engine, target, rec, { cascade = true } = {}) {
  target._crowdGone = true;
  crowd.delete(target);
  records.delete(target);
  crowdStats.gone += 1;
  if (typeof rec?.finish === 'function') rec.finish();
  else {
    if (!isExtra(target)) crowdLeft.add(target);
    if (target.sprite && !target.sprite.destroyed) target.sprite.visible = false;
    const list = engine.interactables || [];
    const at = list.indexOf(target);
    if (at >= 0) list.splice(at, 1);
  }
  if (cascade) animalCrowdChanged(engine, target.classId, { removed: true });
}

function puffAt(engine, target) {
  const spr = target.sprite;
  if (!spr || spr.destroyed) return;
  smokePuff(engine, spr.x, displayTopOf(spr), { hold: engine.param('animalcrowdfx') === 'hold' });
}

/** onSadnessCheck for one animal at this population. Returns the outcome (or null). */
function runCrowdCheck(engine, target, population, max) {
  const rec = crowd.get(target);
  if (rec?.mode === 'leaving' || target._crowdGone) return null;
  crowdStats.checks += 1;
  const depressing = animalPlaceIsDepressing(engine);
  const res = sadnessCheck({
    classId: target.classId,
    population,
    max,
    incubating: Boolean(target.state?.incubatingEgg),
    depressing: isSadIn(target.classId, depressing),
    rng: crowdRoll(engine),
  });
  const t = now();
  if (res.outcome === 'sad') {
    const r = crowdRecord(target);
    if (r.mode !== 'sad') r.mode = 'pending';
    r.startAt = t + res.delayMs;
    crowdLast = `check:${target.classId}:sad:${population}/${max}`;
  } else if (res.outcome === 'leave') {
    const r = crowdRecord(target);
    if (r.mode === 'sad') crowdRelease(engine, target, r);
    r.mode = 'leaving';
    r.puffAt = t + CROWD_TIMING.leavePuffMs;
    r.goneAt = t + CROWD_TIMING.leaveMs;
    say(engine, target, CROWD_LEAVE_LINE, CROWD_TIMING.leaveMs);
    markGone(engine, target, r);
    crowdLast = `check:${target.classId}:leave:${population}/${max}`;
  } else if (res.outcome === 'vanish') {
    const r = crowdRecord(target);
    if (r.mode === 'sad') crowdRelease(engine, target, r);
    r.mode = 'leaving';
    r.puffAt = 0;
    r.goneAt = t + CROWD_TIMING.vanishMs;
    puffAt(engine, target);
    markGone(engine, target, r);
    crowdLast = `check:${target.classId}:vanish:${population}/${max}`;
  }
  // 'depressed': a piggy somewhere depressing is already sad by place (startSad).
  return res.outcome;
}

/**
 * onContainerItemAdded / onContainerItemRemoved: an animal of `classId`
 * arrived on (or left) this street, so every other one of its class checks.
 * The animal-husbandry feature calls this after a release, a baby growing
 * up, a capture or an ascension; this feature after its own departures.
 * `exclude` is the newcomer. Returns how many checked.
 */
export function animalCrowdChanged(engine, classId, { removed = false, exclude = null } = {}) {
  if (!CROWD_CLASSES.includes(classId) || !engine || !crowdActive(engine)) return 0;
  if (removed && !CHECK_ON_REMOVE[classId]) return 0;
  const animals = crowdAnimals(engine, classId);
  const max = crowdLimit(engine, classId);
  let n = 0;
  for (const target of animals) {
    if (target === exclude) continue;
    runCrowdCheck(engine, target, animals.length, max);
    n += 1;
  }
  publish(engine, true);
  return n;
}

/** onSadnessStart (3 minutes of is_sad). */
function startCrowdSad(engine, target, rec, { until = 0 } = {}) {
  const depressing = animalPlaceIsDepressing(engine);
  rec.startAt = 0;
  if (!canStartSadness(target.classId, { incubating: Boolean(target.state?.incubatingEgg) }) || isRooked(target, engine)) {
    if (rec.mode === 'pending') crowd.delete(target);
    return;
  }
  // A piggy somewhere depressing is already sad by place (its own hold and lines).
  if (target.classId === 'npc_piggy' && isSadIn('npc_piggy', depressing)) {
    crowd.delete(target);
    return;
  }
  const st = sadnessStart(now(), { depressing: isSadIn(target.classId, depressing) });
  rec.until = until || st.until;
  rec.lineAt = until ? now() + 1000 : st.firstLineAt;
  rec.mode = 'sad';
  target.state.crowdSadUntil = rec.until;
  delete target.state.crowdCheckAt;
  const piggy = records.get(target);
  if (piggy && (piggy.mode === 'seek' || piggy.mode === 'eat')) release(engine, piggy);
  crowdHold(engine, target, rec);
  target.subtitle = 'Sad · too crowded';
  crowdLast = `sad:${target.classId}`;
  engine.save?.();
}

/** onSadnessEnd: up again, and maybe another check in 5 minutes. */
function endCrowdSad(engine, target, rec) {
  crowdRelease(engine, target, rec);
  crowd.delete(target);
  const s = target.state;
  delete s.crowdSadUntil;
  const res = sadnessEnd({ population: crowdAnimals(engine, target.classId).length, max: crowdLimit(engine, target.classId), spells: s.crowdSpells });
  if (res.spells) s.crowdSpells = res.spells;
  else delete s.crowdSpells;
  if (res.recheck) s.crowdCheckAt = now() + CROWD_TIMING.recheckMs;
  else delete s.crowdCheckAt;
  target.subtitle = animalStatusLabel(target.classId, s);
  crowdLast = `revived:${target.classId}:${res.recheck ? 'recheck' : 'done'}`;
  engine.save?.();
}

/**
 * New crowd-class animals on this street: hide ecology animals that left
 * since the last game-day rollover (earlier leavers are back, G82), resume a
 * saved sulk or a due check, and apply the gloomy onLoad (chickens leave in
 * 1 s, butterflies vanish). Nothing else checks on load.
 */
function adoptCrowd(engine) {
  if (!crowdActive(engine)) return;
  const depressing = animalPlaceIsDepressing(engine);
  const t = now();
  const boundary = crowdRespawnBoundary(t, crowdRolledAt);
  for (const classId of CROWD_CLASSES) {
    for (const target of crowdAnimals(engine, classId)) {
      if (crowdSeen.has(target)) continue;
      crowdSeen.add(target);
      const s = target.state;
      if (Number(s.crowdGone) > 0 && !isExtra(target)) {
        if (!crowdGoneReturns(s.crowdGone, boundary)) {
          removeGone(engine, target, null, { cascade: false });
          continue;
        }
        // G82: it left before the day rolled, so it is back on the street.
        delete s.crowdGone;
        crowdStats.returned += 1;
        crowdLast = `returned:${classId}`;
        engine.save?.();
      }
      const gloom = gloomOnLoad(classId, depressing);
      if (gloom) {
        const r = crowdRecord(target);
        r.mode = 'leaving';
        r.goneAt = t + gloom.delayMs;
        markGone(engine, target, r);
        crowdLast = `gloom:${classId}:${gloom.outcome}`;
        continue;
      }
      if (isCrowdSad(s, t)) startCrowdSad(engine, target, crowdRecord(target), { until: Number(s.crowdSadUntil) });
      else if (Number(s.crowdSadUntil) > 0) endCrowdSad(engine, target, crowdRecord(target));
    }
  }
}

/** Every frame: pending starts, sulks, departures, and the 5-minute rechecks (once a second). */
function stepCrowd(engine, { scan = false } = {}) {
  const t = now();
  const depressing = animalPlaceIsDepressing(engine);
  for (const [target, rec] of [...crowd]) {
    if (!target.sprite || target.sprite.destroyed || !(engine.interactables || []).includes(target)) {
      crowd.delete(target);
      continue;
    }
    if (rec.mode === 'leaving') {
      if (rec.puffAt && t >= rec.puffAt) {
        rec.puffAt = 0;
        puffAt(engine, target);
      }
      if (t >= rec.goneAt) removeGone(engine, target, rec);
      continue;
    }
    if (rec.startAt && t >= rec.startAt) startCrowdSad(engine, target, rec);
    if (rec.mode !== 'sad') continue;
    if (t >= rec.until) {
      endCrowdSad(engine, target, rec);
      continue;
    }
    crowdHold(engine, target, rec);
    if (t >= rec.lineAt) crowdInterval(engine, target, rec, isSadIn(target.classId, depressing));
  }
  if (!scan) return;
  for (const classId of CROWD_CLASSES) {
    const animals = crowdAnimals(engine, classId);
    for (const target of animals) {
      const due = Number(target.state?.crowdCheckAt);
      if (!(due > 0) || due > t || crowd.has(target)) continue;
      delete target.state.crowdCheckAt;
      runCrowdCheck(engine, target, animals.length, crowdLimit(engine, classId));
    }
  }
}

/**
 * G82 onNewDay: the ecology animals that left the street you stand on walk
 * back (no check: arrivals from the archived population are a load, and
 * nothing checks on load). A gloomy street sends them off again (adoptCrowd).
 */
function returnCrowd(engine) {
  const boundary = crowdRespawnBoundary(now(), crowdRolledAt);
  const list = engine?.interactables;
  let n = 0;
  for (const target of [...crowdLeft]) {
    const s = target.state;
    if (!target.sprite || target.sprite.destroyed || !s || !crowdGoneReturns(s.crowdGone, boundary)) continue;
    crowdLeft.delete(target);
    delete s.crowdGone;
    target._crowdGone = false;
    target.sprite.visible = true;
    if (Array.isArray(list) && !list.includes(target)) list.push(target);
    crowdSeen.delete(target);
    n += 1;
  }
  if (n) {
    crowdStats.returned += n;
    crowdLast = `returned:${n}`;
    engine.save?.();
  }
  return n;
}

/** &animalcrowdrespawn=1: once the street animals that left are gone, set the saved day back so the game rolls it. */
function crowdRespawnDemo(engine) {
  if (crowdRespawnQa === 'rolled' || engine.param('animalcrowdrespawn') !== '1') return;
  if (crowdRespawnQa === 'armed') {
    if (now() < crowdRespawnAt) return;
    setLastNewDayTs(now() - GAME_DAY_MS);
    crowdRespawnQa = 'rolled';
    return;
  }
  if (!crowdLeft.size || [...crowd.values()].some((r) => r.mode === 'leaving')) return;
  crowdRespawnQa = 'armed';
  crowdRespawnAt = now() + 1500;
}

function publishCrowd(engine) {
  const parts = CROWD_CLASSES.map((c) => `${c}:${crowdAnimals(engine, c).length}/${crowdLimit(engine, c)}`);
  const modes = [...crowd.values()];
  engine.setData('animalCrowd', crowdActive(engine) ? parts.join(',') : '');
  engine.setData('animalCrowdSad', String(modes.filter((r) => r.mode === 'sad').length));
  engine.setData('animalCrowdPending', String(modes.filter((r) => r.mode === 'pending').length));
  engine.setData('animalCrowdLeaving', String(modes.filter((r) => r.mode === 'leaving').length));
  engine.setData('animalCrowdGone', String(crowdStats.gone));
  engine.setData('animalCrowdChecks', String(crowdStats.checks));
  engine.setData('animalCrowdCard', engine.streetTsid === YARD_TSID ? crowdCard(engine.pc?.imaginationUpgrades || [])?.id || 'none' : '');
  engine.setData('animalCrowdLast', crowdLast);
  engine.setData('animalCrowdLeft', String(crowdLeft.size));
  engine.setData('animalCrowdReturned', String(crowdStats.returned));
  engine.setData('animalCrowdRespawn', crowdRespawnQa);
}

function resetCrowd() {
  for (const [target, rec] of crowd) {
    // A sulk that is still running is saved on the animal and resumes next visit.
    if (rec.mode === 'sad' && target.sprite && !target.sprite.destroyed) crowdRelease(null, target, rec);
  }
  crowd = new Map();
  crowdSeen = new Set();
  crowdLeft = new Set();
  crowdStats = { checks: 0, gone: 0, returned: 0 };
}

// —— Ticks ——————————————————————————————————————————————————————————————

function piggyRows(engine) {
  return livePiggies(engine).map((target) => ({ target, state: target.state }));
}

function ctxFor(engine, depressing) {
  return (row) => ({
    // isSad(): somewhere depressing, or a crowd sulk running (onTwiceDaily 1834).
    sad: isSadIn('npc_piggy', depressing) || isCrowdSad(row.state, now()),
    rooked: isRooked(row.target, engine),
    findFood: () => findFoodFor(engine, row.target),
    // PIGGY_STARVATION_DEATH: only piggies you own (released or raised) can starve.
    owned: isExtra(row.target),
  });
}

/** &animaldeathroll forces the 50% starvation roll for QA. */
function deathRoll(engine) {
  return forcedRoll(engine.param('animaldeathroll'));
}

function handleTickEvents(engine, results, { live }) {
  for (const { row, events } of results) {
    tickCount += 1;
    for (const ev of events) {
      if (ev.type === 'happy' && live) say(engine, row.target, ev.line, 3000);
      if (ev.type === 'croak') {
        recordFor(row.target).nextCroakAt = Math.min(recordFor(row.target).nextCroakAt || Infinity, now() + 1500);
        lastEvent = `croak:tick:${isExtra(row.target) ? 'owned' : 'ecology'}`;
      }
      if (ev.type === 'seek' && live && !ev.ate) {
        const r = recordFor(row.target);
        if (canSeek(engine, r)) startSeek(engine, r, ev.food);
      }
      if (ev.type === 'die') {
        // npc_piggy.js 1958-1973: only an owned piggy rolls this (ctx.owned);
        // the husbandry feature plays the puff and drops the Meat and Plop.
        const starve = row.target.husbandryStarve;
        lastEvent = typeof starve === 'function' && starve({ replay: !live }) ? `die:${live ? 'live' : 'replay'}` : 'die:unowned';
      }
    }
    row.target.subtitle = animalStatusLabel('npc_piggy', row.state);
  }
}

/** Piggies that just appeared (street entry, a release, a grown piglet). */
function adoptNew(engine) {
  const fresh = livePiggies(engine).filter((t) => !records.has(t));
  if (!fresh.length) return;
  const depressing = animalPlaceIsDepressing(engine);
  for (const t of fresh) {
    ensurePiggyMood(t.state);
    recordFor(t);
  }
  // Ticks that fell due while you were away land at once (the back yard runs its own).
  if (engine.streetTsid !== YARD_TSID) {
    const rows = piggyRows(engine);
    handleTickEvents(engine, advancePiggies(rows, now(), {
      ctxFor: ctxFor(engine, depressing),
      rng: deathRoll(engine),
      eat: (row, food) => {
        if (!eatOffline(engine, food)) return false;
        satePiggy(row.state);
        return true;
      },
    }), { live: false });
  }
  for (const t of fresh) {
    const r = recordFor(t);
    if (isSadIn('npc_piggy', depressing) && !isRooked(t, engine)) startSad(engine, r);
    if (t.state.croaking && Number(t.state.hunger) >= PIGGY_HUNGER.max) r.nextCroakAt = now() + 2000;
  }
  applyQaParams(engine);
}

function liveTicks(engine) {
  if (engine.streetTsid === YARD_TSID) return;
  const rows = piggyRows(engine);
  if (!rows.some((row) => Number(row.state.hungerAt) <= now())) return;
  const depressing = animalPlaceIsDepressing(engine);
  handleTickEvents(engine, advancePiggies(rows, now(), { ctxFor: ctxFor(engine, depressing), rng: deathRoll(engine) }), { live: true });
}

/** onContainerItemAdded: new food on the street sends the hungry piggies. */
function watchDrops(engine) {
  const seen = new Set();
  const added = [];
  for (const row of streetStacks(engine)) {
    seen.add(row.id);
    const before = knownStacks.get(row.id);
    if (before === undefined || row.count > before) {
      if (isFoodItem(row.classTsid)) added.push(row);
    }
    knownStacks.set(row.id, row.count);
  }
  for (const id of [...knownStacks.keys()]) if (!seen.has(id)) knownStacks.delete(id);
  for (const row of added) {
    for (const target of livePiggies(engine)) {
      const r = recordFor(target);
      if (!canSeek(engine, r)) continue;
      startSeek(engine, r, { kind: 'stack', id: row.id, x: row.x, y: row.y });
    }
  }
}

function snapshotStacks(engine) {
  knownStacks = new Map(streetStacks(engine).map((row) => [row.id, row.count]));
}

// —— QA ————————————————————————————————————————————————————————————————

function demoPiggy(engine) {
  return livePiggies(engine)[0] || null;
}

function applyQaParams(engine) {
  if (qaApplied) return;
  const mood = engine.param('animalmood');
  const hunger = engine.param('animalhunger');
  const food = engine.param('animalfood');
  if (mood === null && hunger === null && food === null) {
    qaApplied = true;
    return;
  }
  const target = demoPiggy(engine);
  if (!target) return;
  qaApplied = true;
  const s = target.state;
  if (mood !== null && Number.isFinite(Number(mood))) s.mood = Math.max(0, Math.min(2, Math.floor(Number(mood))));
  if (hunger !== null && Number.isFinite(Number(hunger))) {
    s.hunger = Math.max(0, Math.min(PIGGY_HUNGER.max, Math.floor(Number(hunger))));
    s.croaking = s.hunger === PIGGY_HUNGER.max;
    if (s.croaking) recordFor(target).nextCroakAt = now() + 2000;
    // Starvation QA: the next twice-daily tick lands in 3 s (yard piggies tick in advanceYard).
    if (engine.param('animaldeathroll') !== null) s.hungerAt = now() + 3000;
  }
  target.subtitle = animalStatusLabel('npc_piggy', s);
  lastEvent = `qa:mood=${s.mood}:hunger=${s.hunger}`;
}

/** &animalfood=<class>: drop 3 of it 220 px from the demo piggy, as the player would. */
function runFoodDemo(engine) {
  if (foodDemoDone || engine.param('animalfood') === null || !qaApplied) return;
  const target = demoPiggy(engine);
  if (!target || !engine.started) return;
  foodDemoDone = true;
  // QA isolation: every hungry piggy goes for dropped food, so the others are fed first.
  for (const other of livePiggies(engine)) if (other !== target) satePiggy(other.state);
  const cls = isFoodItem(engine.param('animalfood')) ? engine.param('animalfood') : 'potato';
  engine.inv[cls] = (engine.inv[cls] || 0) + 3;
  const spr = target.sprite;
  const dir = spr.x + 220 < engine.worldW - 60 ? 1 : -1;
  const x = spr.x + dir * 220;
  const y = nearestSurfaceY(engine.platforms, x, spr.y) ?? spr.y;
  setTimeout(() => {
    const res = engine.dropWorldStack(cls, 3, x, y);
    if (res?.ok) engine.pushActivity(`You dropped 3 ${itemLabel(cls, 3)}.`);
    lastEvent = res?.ok ? `dropped:${cls}` : 'drop:failed';
  }, 1500);
}

function publish(engine, force = false) {
  const t = now();
  if (!force && t < publishAt) return;
  publishAt = t + 500;
  const piggies = livePiggies(engine);
  const demo = piggies[0];
  engine.setData('animalMoodDepressing', animalPlaceIsDepressing(engine) ? '1' : '0');
  engine.setData('animalMoodSad', String([...records.values()].filter((r) => r.mode === 'sad').length));
  engine.setData('animalMoodSeeking', String([...records.values()].filter((r) => r.mode === 'seek').length));
  engine.setData('animalMoodCroaking', String(piggies.filter((p) => p.state.croaking).length));
  engine.setData('animalMoodPiggy', demo ? `${demo.state.mood}:${demo.state.hunger}` : '');
  // x:facing:mode of the demo piggy (facing from the sprite's sign; the sheets face right).
  const pose = demo ? `${Math.round(demo.sprite.x)}:${demo.sprite.scale.x >= 0 ? 'R' : 'L'}:${records.get(demo)?.mode || 'idle'}` : '';
  engine.setData('animalMoodPose', pose);
  engine.setData('animalMoodLast', lastEvent);
  engine.setData('animalMoodTicks', String(tickCount));
  publishCrowd(engine);
}

function resetStreet(engine) {
  records = new Map();
  streetKey = engine?.streetTsid ?? null;
  scanAt = 0;
  snapshotStacks(engine || {});
}

// ---------------------------------------------------------------------------
// Feature
// ---------------------------------------------------------------------------

export const animalMoodFeature = {
  id: ANIMAL_MOOD_FEATURE_ID,

  init(engine) {
    loader = createSheetLoader(engine.PIXI);
    loader.loadAll([...Object.values(PIGGY_MOOD_SHEETS), ...Object.values(CROWD_SHEETS)]);
  },

  onStreetEnter(street, engine) {
    placeCache = { tsid: null, depressing: false };
    resetStreet(engine);
    resetCrowd();
  },

  onStreetClear() {
    resetCrowd();
    records = new Map();
    knownStacks = new Map();
    streetKey = null;
  },

  onTick(dtMs, t, engine) {
    if (!engine.started) return;
    if (streetKey !== engine.streetTsid) resetStreet(engine);
    const time = now();
    const scan = time >= scanAt;
    if (scan) {
      scanAt = time + 1000;
      // Forget piggies that left (captured, hidden, street rebuilt).
      for (const target of [...records.keys()]) {
        if (!target.sprite || target.sprite.destroyed || target.sprite.visible === false || !engine.interactables.includes(target)) records.delete(target);
      }
      adoptNew(engine);
      adoptCrowd(engine);
      crowdRespawnDemo(engine);
      liveTicks(engine);
      runFoodDemo(engine);
      // Keep the world labels honest (game.js rewrites them after verbs).
      for (const r of records.values()) {
        if (isRooked(r.target, engine) || crowd.get(r.target)?.mode === 'sad') continue;
        r.target.subtitle = r.mode === 'sad' ? 'Sad · hates it here' : animalStatusLabel('npc_piggy', r.target.state);
      }
      for (const [target, rec] of crowd) {
        if (rec.mode === 'sad' && !isRooked(target, engine)) target.subtitle = 'Sad · too crowded';
      }
    }
    stepCrowd(engine, { scan });
    watchDrops(engine);
    const acting = engine.acting();
    for (const r of records.values()) {
      const target = r.target;
      if (!target.sprite || target.sprite.destroyed) continue;
      if (r.mode === 'sad') {
        if (time >= r.nextSadAt) sadInterval(engine, r);
        else hold(engine, r);
      } else if (r.mode === 'seek') {
        if (!acting) stepSeek(engine, r, dtMs);
      } else if (r.mode === 'eat' && time >= r.holdUntil) {
        release(engine, r);
      }
      if (target.state.croaking && Number(target.state.hunger) >= PIGGY_HUNGER.max) {
        if (r.nextCroakAt && time >= r.nextCroakAt) {
          say(engine, target, PIGGY_LINES.croak, PIGGY_LINES.croakMs);
          r.nextCroakAt = time + CROAK_INTERVAL_MS;
          lastEvent = 'croak';
        } else if (!r.nextCroakAt) r.nextCroakAt = time + CROAK_INTERVAL_MS;
      } else if (target.state.croaking) target.state.croaking = false;
    }
    publish(engine);
  },

  /** G82: the game day rolled; street animals that left come back. */
  onNewDay(t, engine) {
    crowdRolledAt = Math.max(crowdRolledAt, Number(t) || now());
    const n = returnCrowd(engine);
    if (engine?.started) publish(engine, true);
    return n;
  },

  save() {
    return crowdRolledAt > 0 ? { crowdRolledAt } : undefined;
  },

  restore(slice) {
    const at = Number(slice?.crowdRolledAt);
    crowdRolledAt = Number.isFinite(at) && at > 0 ? at : 0;
  },

  /** onContainerItemStateChanged: a trant you just worked, with fruit on it. */
  onEvent(counter, amount, engine) {
    const m = /^(trant_[a-z]+):(harvest|water|pet)$/.exec(String(counter || ''));
    if (!m) return;
    const p = engine.player;
    const trant = fruitingTrants(engine)
      .filter((t) => t.classId === m[1])
      .sort((a, b) => Math.abs(a.sprite.x - p.x) - Math.abs(b.sprite.x - p.x))[0];
    if (!trant) return;
    for (const target of livePiggies(engine)) {
      const r = recordFor(target);
      if (canSeek(engine, r)) startSeek(engine, r, { kind: 'trant', target: trant, x: trant.sprite.x, y: trant.sprite.y });
    }
  },

  /** Sad piggies refuse; a piggy not in the mood refuses nibble at once. */
  decorateVerbs(target, verbs, engine) {
    if (!target?.state || target.featureId) return null;
    const crowdSad = isCrowdSad(target.state, now());
    if (target.classId === 'npc_chicken' || target.classId === 'npc_butterfly') {
      if (!crowdSad) return null;
      // isSad(): the chicken's butter_up / incubate / squeeze, the butterfly's sing_to / milk / massage.
      const reasons = CROWD_SAD_REASONS[target.classId];
      return verbs.map((v) => (reasons[v.id] ? { ...v, enabled: false, reason: reasons[v.id] } : v));
    }
    if (target.classId !== 'npc_piggy') return null;
    const depressing = animalPlaceIsDepressing(engine);
    if (isSadIn('npc_piggy', depressing) || crowdSad) {
      return verbs.map((v) => {
        if (['pet', 'nibble', 'feed'].includes(v.id)) return { ...v, enabled: false, reason: PIGGY_LINES.sad };
        if (v.id === 'name') return { ...v, enabled: false, reason: PIGGY_LINES.sadName };
        if (v.id === 'capture') {
          // A sad piggy is always caught (439-444); only a depressing place lifts the location cooldown (383-386).
          const gate = captureVerbState({
            inv: engine.inv,
            learned: engine.learnedSkills,
            energy: engine.pc?.energy || 0,
            streetTsid: engine.streetTsid,
            ownYard: engine.streetTsid === YARD_TSID,
            depressing: isSadIn('npc_piggy', depressing),
          });
          return { ...v, enabled: gate.enabled, reason: gate.reason };
        }
        return v;
      });
    }
    if (!piggyNibbleRefusal(target.state)) return null;
    return verbs.map((v) => (v.id === 'nibble' && v.enabled ? { ...v, durationMs: 0 } : v));
  },

  runVerbOverride(target, verbId, engine) {
    if (target?.classId !== 'npc_piggy' || verbId !== 'nibble' || !target.state || target.featureId) return null;
    if (animalPlaceIsDepressing(engine)) return null;
    const quote = quoteAnimalKinship(target.state, 'npc_piggy', 'nibble', {
      pc: engine.pc,
      inv: engine.inv,
      learned: engine.learnedSkills,
    });
    if (!quote.ok) return null;
    const refusal = piggyNibbleRefusal(target.state);
    if (!refusal) return null;
    // npc_piggy.js 875-879: the activity line, too_much_nibble, nibble_na_fail.
    engine.toast(refusal.msg, 3200);
    engine.pushActivity(refusal.msg);
    say(engine, target, pickLine(NIBBLE_NA_FAIL), 4000);
    const r = recordFor(target);
    playClip(engine, r, PIGGY_MOOD_SHEETS.tooMuchNibble);
    lastEvent = `nibble:refused:${refusal.reason}`;
    engine.setData('animalKinshipResult', 'not_in_mood');
    publish(engine, true);
    return true;
  },

  /** Tests. */
  _state() {
    return {
      records: records.size,
      knownStacks: knownStacks.size,
      lastEvent,
      crowd: [...crowd].map(([target, rec]) => ({ target, mode: rec.mode, startAt: rec.startAt, until: rec.until, goneAt: rec.goneAt })),
      crowdStats: { ...crowdStats },
      crowdLast,
      crowdLeft: crowdLeft.size,
      crowdRolledAt,
    };
  },
};
