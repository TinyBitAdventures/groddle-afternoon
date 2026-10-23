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
 * - A piggy at hunger 10 says "I'm about to croak!" once a minute. It does
 *   not die: PIGGY_STARVATION_DEATH in js/animal-mood.js is off (a design
 *   decision for Austin).
 * - Nibble: petted (or Animal Kinship VI) but mood 0 or hunger > 2, the
 *   piggy refuses at once (no action bar), sulks and says nibble_na_fail.
 * - Piggies (and the Chick, Piglet and Caterpillar in your pack) are sad in
 *   the places locationIsDepressing lists: they stop, sulk (too_much_nibble,
 *   rooked2 a fifth of the time), complain every 30 s, and refuse pet,
 *   nibble, feed and name; capture always works and has no location
 *   cooldown.
 *
 * QA: ?autostart=1&fresh=1&resetgame=1&questoffer=off&animaldemo=piggy
 *   &animalrank=6&animalreset=1&animalmood=0 (E → nibble refuses);
 *   &animalhunger=9&animalfood=potato drops 3 Potatoes 220 px away and the
 *   piggy walks over and eats one; &animalhunger=10 croaks.
 *   Sad: &animaldemo=sad&streetdemo=GA9114MS8B32FB2 releases a Hog-tied
 *   Piggy in Churni Sanctum (Ilmenskie Deeps) and puts a Piglet in the
 *   pack. Canvas: animalMoodDepressing, animalMoodSad, animalMoodPiggy
 *   (mood:hunger of the demo piggy), animalMoodSeeking, animalMoodCroaking,
 *   animalMoodLast.
 */

import { createSheetLoader, pixiSpeed } from '../sprite-sheets.js';
import { nearestSurfaceY } from '../walk-surface.js';
import { isInHell } from '../hell.js';
import { HOG_HAUL_STREET_ID } from '../hog-haul.js?v=hog-haul-1';
import { TRANT_META, trantStatusLabel } from '../trants.js?v=trant-harvest-2';
import { animalStatusLabel } from '../animals.js?v=husbandry-1';
import { quoteAnimalKinship } from '../animal-kinship.js?v=butterfly-care-1';
import { captureVerbState, isFoodItem, itemLabel } from '../animal-husbandry.js';
import { rookAttackFeature } from './rook-attack-feature.js?v=rooks-2';
import {
  CROAK_INTERVAL_MS,
  EAT_PAUSE_MS,
  EAT_RADIUS,
  NIBBLE_NA_FAIL,
  PIGGY_HUNGER,
  PIGGY_LINES,
  SAD_INTERVAL_MS,
  SAD_PIGGY_LINES,
  advancePiggies,
  ensurePiggyMood,
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

// —— Ticks ——————————————————————————————————————————————————————————————

function piggyRows(engine) {
  return livePiggies(engine).map((target) => ({ target, state: target.state }));
}

function ctxFor(engine, depressing) {
  return (row) => ({
    sad: isSadIn('npc_piggy', depressing),
    rooked: isRooked(row.target, engine),
    findFood: () => findFoodFor(engine, row.target),
  });
}

function handleTickEvents(engine, results, { live }) {
  for (const { row, events } of results) {
    for (const ev of events) {
      if (ev.type === 'happy' && live) say(engine, row.target, ev.line, 3000);
      if (ev.type === 'croak') recordFor(row.target).nextCroakAt = Math.min(recordFor(row.target).nextCroakAt || Infinity, now() + 1500);
      if (ev.type === 'seek' && live && !ev.ate) {
        const r = recordFor(row.target);
        if (canSeek(engine, r)) startSeek(engine, r, ev.food);
      }
      if (ev.type === 'die') lastEvent = 'die:disabled-world-side';
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
  handleTickEvents(engine, advancePiggies(rows, now(), { ctxFor: ctxFor(engine, depressing) }), { live: true });
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
    loader.loadAll(Object.values(PIGGY_MOOD_SHEETS));
  },

  onStreetEnter(street, engine) {
    placeCache = { tsid: null, depressing: false };
    resetStreet(engine);
  },

  onStreetClear() {
    records = new Map();
    knownStacks = new Map();
    streetKey = null;
  },

  onTick(dtMs, t, engine) {
    if (!engine.started) return;
    if (streetKey !== engine.streetTsid) resetStreet(engine);
    const time = now();
    if (time >= scanAt) {
      scanAt = time + 1000;
      // Forget piggies that left (captured, hidden, street rebuilt).
      for (const target of [...records.keys()]) {
        if (!target.sprite || target.sprite.destroyed || target.sprite.visible === false || !engine.interactables.includes(target)) records.delete(target);
      }
      adoptNew(engine);
      liveTicks(engine);
      runFoodDemo(engine);
      // Keep the world labels honest (game.js rewrites them after verbs).
      for (const r of records.values()) {
        if (isRooked(r.target, engine)) continue;
        r.target.subtitle = r.mode === 'sad' ? 'Sad · hates it here' : animalStatusLabel('npc_piggy', r.target.state);
      }
    }
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
    if (target?.classId !== 'npc_piggy' || !target.state || target.featureId) return null;
    const depressing = animalPlaceIsDepressing(engine);
    if (isSadIn('npc_piggy', depressing)) {
      return verbs.map((v) => {
        if (['pet', 'nibble', 'feed'].includes(v.id)) return { ...v, enabled: false, reason: PIGGY_LINES.sad };
        if (v.id === 'name') return { ...v, enabled: false, reason: PIGGY_LINES.sadName };
        if (v.id === 'capture') {
          const gate = captureVerbState({
            inv: engine.inv,
            learned: engine.learnedSkills,
            energy: engine.pc?.energy || 0,
            streetTsid: engine.streetTsid,
            ownYard: engine.streetTsid === YARD_TSID,
            depressing: true,
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
    return { records: records.size, knownStacks: knownStacks.size, lastEvent };
  },
};
