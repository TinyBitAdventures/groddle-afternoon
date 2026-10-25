/**
 * Animal husbandry as a feature module (see js/feature-host.js). Rules live in
 * js/animal-husbandry.js; this file puts them in the world:
 *
 * - Batterflies on cave and cavern streets (one or two per street, see
 *   isBatterflyHabitat): Feed asks what and how many, food value in base
 *   cost releases Guano on the ground, and each Batterfly adds one Guano an
 *   hour while the street holds fewer than 10.
 * - Guano and Piggy Plop piles on the ground (Pick up; plops also Examine,
 *   Sniff, Taste). A Piggy fed 3+ crops (or any pumpkin) plops every 5 s.
 * - Chicken incubation watch: halfway bubble at 30 s, the hatchling at 60 s
 *   while you are still on the street, otherwise the egg is lost (source).
 * - Baby animals in the pack (Chick, Piglet, Caterpillar) are fed from the
 *   pack and grow into a real animal beside you.
 * - Naming (Animal Kinship V) for Piggies, Chickens, Butterflies and
 *   Batterflies; Herdkeeping capture into a Hog-tied Piggy (1 XP every 30 s,
 *   escape timer, Release anywhere); Magic Sticks in your back yard.
 * - Remote Herdkeeping in the back yard (home street): Meat Collector,
 *   Butterfly Milker and Piggy Feeder fill on their source intervals, also
 *   while you are away; full machines set the quest flags.
 *
 * Animals that arrive this way (released, hatched and grown, demo seeds) are
 * ordinary npc_piggy / npc_chicken / npc_butterfly targets, so pet, nibble,
 * squeeze, milk and feed all come from content.js; their state lives in this
 * feature's per-street slot.
 * - Starvation (G63): these piggies and the back yard herd are yours, so at
 *   hunger 10 they can die (js/animal-mood.js PIGGY_STARVATION_DEATH): a
 *   smoke puff, and 500 ms later the piggy is gone from the street and its
 *   slot, leaving 10 Meat (a ground stack) and a Plop (npc_piggy.js
 *   1958-1973, 1036-1041). The animal-mood feature ticks street piggies and
 *   calls the target's `husbandryStarve`; advanceYard ticks the yard, and a
 *   yard death while you are away waits in the yard slot's `starved` list
 *   until you get home. Street-ecology piggies never die.
 *
 * QA: ?autostart=1&fresh=1&resetgame=1&animaldemo=batterfly|plop|incubate|name|herd
 * (+ &animalautoplay=1, &questoffer=off). The back yard route is
 * ?autostart=1&fresh=1&resetgame=1&homedemo=home&animaldemo=remote&animalautoplay=1.
 * Set free (G284): &homedemo=home&animaldemo=setfree puts a Chicken and a
 * Butterfly beside you in the yard; &animalautoplay=1 (or =butterfly) asks
 * and answers OK.
 * &animalfast=1 shortens incubation to 6 s for headless runs. Starvation:
 * &animaldemo=starve releases a Piggy beside you at hunger 10 whose next tick
 * is 3 s away (yard: &homedemo=home&animaldemo=remote&animalhunger=10 does the
 * same for the first yard piggy); &animaldeathroll=0 forces the 50% roll
 * (0.99 spares it) and &animaldeathfx=hold keeps the puff up for screenshots.
 * Canvas data:
 * husbandryDemo, husbandryLast, batterflyCount, batterflyStreetCount,
 * guanoOnStreet, plopsOnStreet, pendingPlops, packPlops, incubation,
 * extraAnimals, yardMachines, yardSticks, hogtied, namedAnimal, starvedPiggies,
 * yardStarved.
 */

import { createSheetLoader, pixiSpeed } from '../sprite-sheets.js';
import { nearestSurfaceY } from '../walk-surface.js';
import { displayTopOf, itemstackOverlayPoint, playSheetOverlay } from '../overlay-art.js?v=g311-1';
import { SET_FREE, applySetFree, canSetFree, setFreeGoneLine, setFreePrompt } from '../animal-set-free.js';
import { getGameDayKey } from '../game-day.js?v=dametime-2';
import { createAnimalState, resetAnimalDay, animalStatusLabel, listAnimalFeedOptions } from '../animals.js?v=g296-1';
import {
  BABY_ANIMALS,
  BATTERFLY,
  BATTERFLY_ID,
  HERDKEEPING,
  INCUBATION,
  MAGIC_STICKS,
  NAMEABLE_ANIMALS,
  PLOP,
  REMOTE_MACHINES,
  REMOTE_SKILL,
  STICK_DISTANCE,
  STICK_RADIUS_CHOICES,
  advanceYard,
  babyFoodOptions,
  babyProgress,
  batterflyCountForStreet,
  canNameAnimal,
  capturePiggy,
  collectMachine,
  createMachine,
  depositFeeder,
  drainPlops,
  clearPlopQueues,
  ensureHusbandryItems,
  examinePlop,
  feedBaby,
  feedBatterfly,
  hatchIncubation,
  husbandryPack,
  incubationPhase,
  itemLabel,
  machineLabel,
  nameAnimal,
  namedAnimalLabel,
  namingVerbs,
  normalizeHusbandryPack,
  passiveGuano,
  pendingPlopCount,
  reconcilePackPlops,
  releaseHogtied,
  resetIncubation,
  stepHogtie,
  stickPlaceState,
} from '../animal-husbandry.js';
import { loseEnergy, shiftMetabolic } from '../metabolics.js';
import { textureFromUrl } from '../textures.js';
import { PIGGY_DEATH_DROPS, PIGGY_DEATH_PUFF, SAD_BABY, forcedRoll, isSadIn } from '../animal-mood.js';
import { animalCrowdChanged, animalCrowdSad, animalPlaceIsDepressing, crowdLimit, smokePuff as sharedSmokePuff } from './animal-mood-feature.js?v=g319-1';
import { grantMoodXp } from '../mood-xp.js';

export const HUSBANDRY_FEATURE_ID = 'animal-husbandry';
export const BATTERFLY_GROUP = 'batterfly';
const YARD_TSID = 'RH_HOME_EXT';
const PLAYER_ID = 'player';
const ANIMAL_CLASSES = new Set(['npc_piggy', 'npc_chicken', 'npc_butterfly']);

const DIR = 'assets/sprites/animals/';
/** OGA npc_batterfly sheets: 111×96 cells; profile 8×5 (40), chew 9×14 (120). */
export const BATTERFLY_SHEETS = Object.freeze({
  profile: Object.freeze({ path: `${DIR}npc_batterfly_profile.webp`, fw: 111, fh: 96, cols: 8, frames: 40 }),
  chew: Object.freeze({ path: `${DIR}npc_batterfly_chew.webp`, fw: 111, fh: 96, cols: 9, frames: 120 }),
});
const ART = Object.freeze({
  plop: `${DIR}plop.png`,
  guano: 'assets/sprites/icons/guano.png',
  magic_pig_stick: `${DIR}magic_pig_stick_placed.png`,
  magic_chicken_stick: `${DIR}magic_chicken_stick_placed.png`,
  magic_butterfly_stick: `${DIR}magic_butterfly_stick_placed.png`,
  meat_collector: `${DIR}meat_collector.png`,
  butterfly_milker: `${DIR}butterfly_milker.png`,
  piggy_feeder: `${DIR}piggy_feeder.png`,
});

// ---------------------------------------------------------------------------
// Pure helpers (tests/animal-husbandry.test.js)
// ---------------------------------------------------------------------------

/** Planner group for the street's Batterflies. */
export function batterflyPlacementGroups(street) {
  const count = batterflyCountForStreet(street || {});
  return count ? [{ key: BATTERFLY_GROUP, count, clearance: 120 }] : [];
}

/** Normalize one street slot of this feature. */
export function normalizeHusbandrySlot(slot = {}) {
  const s = slot && typeof slot === 'object' ? slot : {};
  s.batterflies = s.batterflies && typeof s.batterflies === 'object' && !Array.isArray(s.batterflies) ? s.batterflies : {};
  s.guano = Array.isArray(s.guano) ? s.guano.filter((g) => g && Number(g.count) > 0) : [];
  s.plops = Array.isArray(s.plops) ? s.plops.filter((p) => p && typeof p.seedClass === 'string') : [];
  s.animals = Array.isArray(s.animals) ? s.animals.filter((a) => a && ANIMAL_CLASSES.has(a.classId)) : [];
  s.sticks = Array.isArray(s.sticks) ? s.sticks.filter((k) => k && MAGIC_STICKS[k.classTsid]) : [];
  s.machines = Array.isArray(s.machines) ? s.machines.filter((m) => m && REMOTE_MACHINES[m.classTsid]) : [];
  // Back yard piggies that starved while you were away: their Meat and Plop land when you get home.
  s.starved = Array.isArray(s.starved) ? s.starved.filter((d) => d && Number.isFinite(Number(d.x))) : [];
  s.seq = Number(s.seq) || 0;
  return s;
}

// ---------------------------------------------------------------------------
// Runtime
// ---------------------------------------------------------------------------

let loader = null;
let spawnedFor = null;
let pendingEnter = false;
let generation = 0;
let batterflies = []; // { key, sprite, target, state, baseX, baseY, phase, chewUntil }
let piles = []; // { kind: 'guano'|'plop', row, sprite, target }
let extras = []; // { row, sprite, target, vx, baseX }
let placed = []; // { kind: 'stick'|'machine', row, sprite, target }
let lastAction = '';
let demoMode = '';
let demoUsed = false;
let demoTimers = [];
let nameModal = null;
let publishAt = 0;
let hogtieAt = 0;
let yardAt = 0;
let incubationAt = 0;
let questFlags = new Set();
let starvedCount = 0;
let yardSelfFed = { stack: 0, trant: 0 }; // G64: yard piggies that fed themselves (replay)

const now = () => Date.now();
const isYard = (engine) => engine.streetTsid === YARD_TSID;

function slot(engine, tsid) {
  return normalizeHusbandrySlot(engine.streetSlot(HUSBANDRY_FEATURE_ID, tsid));
}

function yardSlot(engine) {
  return slot(engine, YARD_TSID);
}

function fastQa(engine) {
  return engine.param('animalfast') === '1';
}

function incubationTiming(engine) {
  return fastQa(engine)
    ? { halfwayMs: 3000, completeMs: 6000 }
    : { halfwayMs: INCUBATION.halfwayMs, completeMs: INCUBATION.completeMs };
}

function surfaceAt(engine, x, refY) {
  return nearestSurfaceY(engine.platforms, x, refY ?? engine.player?.y ?? engine.groundY) ?? engine.player?.y ?? engine.groundY;
}

/**
 * npc_butterfly.js 1547, chick/piglet/caterpillar feed, plop.js 190 and the
 * hog_tie buff (catalog_buffs.js 1058) award with stats_add_xp(n, false):
 * the mood bonus applies. Returns what landed.
 */
function gainXp(engine, n) {
  if (!n) return 0;
  return grantMoodXp(engine.pc, n);
}

function emit(engine, counter, amount = 1, detail = undefined) {
  engine.achievement(counter, amount, detail);
}

// —— Sprites ————————————————————————————————————————————————————————————

function makeSprite(engine, url, { anchorY = 1, scale = 1, z = 20 } = {}) {
  const { PIXI } = engine;
  const spr = new PIXI.Sprite(textureFromUrl(url));
  spr.anchor.set(0.5, anchorY);
  spr.scale.set(scale);
  spr.zIndex = z;
  engine.entityLayer.addChild(spr);
  return spr;
}

function addCountBadge(engine, spr, count) {
  const { PIXI } = engine;
  if (spr._countBadge) {
    spr._countBadge.text = count > 1 ? String(count) : '';
    return;
  }
  const t = new PIXI.Text({ text: count > 1 ? String(count) : '', style: {
    fontFamily: 'system-ui, sans-serif',
    fontSize: 11,
    fontWeight: '800',
    fill: 0xffffff,
    stroke: { color: 0x335b8c, width: 3 },
  } });
  t.anchor.set(0, 1);
  t.x = 6;
  t.y = -4;
  spr.addChild(t);
  spr._countBadge = t;
}

// —— Batterflies ————————————————————————————————————————————————————————

function batterflyTargetLabel(state) {
  return state?.userName ? namedAnimalLabel(BATTERFLY_ID, state) : BATTERFLY.label;
}

function buildBatterfly(engine, key, x, y, state) {
  const { PIXI } = engine;
  const frames = loader.frames(BATTERFLY_SHEETS.profile);
  const spr = new PIXI.AnimatedSprite(frames.length ? frames : [PIXI.Texture.EMPTY]);
  spr.anchor.set(0.5, 0.62);
  spr.scale.set(0.82);
  spr.zIndex = 38;
  spr.animationSpeed = pixiSpeed(30);
  spr._worldHitW = 70;
  spr._worldHitH = 60;
  spr.play();
  engine.entityLayer.addChild(spr);
  const ground = surfaceAt(engine, x, y);
  const entity = {
    key,
    sprite: spr,
    state,
    baseX: x,
    baseY: ground - 150,
    phase: (key.length * 1.7) % 6,
    chewUntil: 0,
    target: null,
  };
  spr.x = x;
  spr.y = entity.baseY;
  entity.target = engine.register({
    classId: BATTERFLY_ID,
    featureId: HUSBANDRY_FEATURE_ID,
    label: batterflyTargetLabel(state),
    subtitle: BATTERFLY.subtitle,
    sprite: spr,
    airborne: true,
    state,
    husbandryKey: key,
  });
  batterflies.push(entity);
  return entity;
}

function stepBatterfly(entity, dtMs) {
  const spr = entity.sprite;
  if (!spr || spr.destroyed) return;
  if (entity.chewUntil && now() > entity.chewUntil) {
    entity.chewUntil = 0;
    spr.textures = loader.frames(BATTERFLY_SHEETS.profile);
    spr.loop = true;
    spr.play();
  }
  // The flight path pauses while it chews, so it resumes where it stopped instead of jumping ahead.
  if (entity.chewUntil) return;
  entity.phase += dtMs / 1000;
  // flyAround: lazy loops in the lower part of the street.
  const dx = Math.sin(entity.phase * 0.35) * 170;
  const dy = Math.sin(entity.phase * 0.9) * 26 + Math.cos(entity.phase * 0.21) * 34;
  const nx = entity.baseX + dx;
  const facing = Math.cos(entity.phase * 0.35) >= 0 ? 1 : -1;
  spr.x = nx;
  spr.y = entity.baseY + dy;
  spr.scale.x = 0.82 * facing; // the art faces right
}

function chewBatterfly(entity) {
  const frames = loader.frames(BATTERFLY_SHEETS.chew);
  if (!frames.length || !entity.sprite || entity.sprite.destroyed) return;
  entity.sprite.textures = frames;
  entity.sprite.loop = false;
  entity.sprite.animationSpeed = pixiSpeed(30);
  entity.sprite.gotoAndPlay(0);
  entity.chewUntil = now() + Math.ceil((frames.length / 30) * 1000);
}

// —— Ground piles (Guano, Piggy Plop) ————————————————————————————————————

function guanoOnStreet(engine) {
  return slot(engine).guano.reduce((n, g) => n + (Number(g.count) || 0), 0);
}

function dropGuano(engine, x, count) {
  if (!(count > 0)) return;
  const s = slot(engine);
  const y = surfaceAt(engine, x);
  // Merge into a nearby pile like dropped stacks do.
  const near = s.guano.find((g) => Math.abs(g.x - x) < 40 && Math.abs(g.y - y) < 30 && g.count < 40);
  if (near) {
    near.count += count;
    const pile = piles.find((p) => p.row === near);
    if (pile) addCountBadge(engine, pile.sprite, near.count);
  } else {
    s.seq += 1;
    const row = { id: `g${s.seq}`, x: Math.round(x), y: Math.round(y), count };
    s.guano.push(row);
    buildPile(engine, 'guano', row);
  }
}

function dropPlop(engine, x, seedClass, seedCount, { silent = false, refY } = {}) {
  const s = slot(engine);
  s.seq += 1;
  const y = surfaceAt(engine, x, refY);
  const row = { id: `p${s.seq}`, x: Math.round(x), y: Math.round(y), seedClass, seedCount };
  s.plops.push(row);
  buildPile(engine, 'plop', row);
  if (!silent) engine.playSound('PIGGY_PLOP', { volume: 0.6 });
}

function buildPile(engine, kind, row) {
  const spr = makeSprite(engine, kind === 'guano' ? ART.guano : ART.plop, { scale: 1, z: 19 });
  spr.x = row.x;
  spr.y = row.y + 2;
  spr._worldHitW = 40;
  spr._worldHitH = 34;
  if (kind === 'guano') addCountBadge(engine, spr, row.count);
  const target = engine.register({
    classId: kind === 'guano' ? 'guano' : 'plop',
    featureId: HUSBANDRY_FEATURE_ID,
    label: kind === 'guano' ? (row.count > 1 ? `${row.count} Guano` : 'Guano') : 'Piggy Plop',
    subtitle: kind === 'guano' ? 'Fertilizer, from a Batterfly' : 'Round, brown, and mysterious',
    sprite: spr,
    husbandryPile: row.id,
  });
  piles.push({ kind, row, sprite: spr, target });
}

function removePile(engine, pile) {
  const s = slot(engine);
  if (pile.kind === 'guano') s.guano = s.guano.filter((g) => g !== pile.row);
  else s.plops = s.plops.filter((p) => p !== pile.row);
  piles = piles.filter((p) => p !== pile);
  engine.unregister(pile.target);
}

// —— Extra animals (released, grown, seeded) ——————————————————————————————

function addExtraAnimal(engine, classId, x, seedState = {}, tsid) {
  const s = slot(engine, tsid);
  s.seq += 1;
  const row = {
    id: `a${s.seq}`,
    classId,
    x: Math.round(x),
    state: { ...createAnimalState(classId, seedState), careDay: getGameDayKey(now()) },
  };
  s.animals.push(row);
  if (!tsid || tsid === engine.streetTsid) buildExtraAnimal(engine, row);
  return row;
}

function animalFrames(engine, classId) {
  const t = engine.textures || {};
  if (classId === 'npc_piggy') return (t.piggyWalk?.frames || []).slice(0, 8);
  if (classId === 'npc_chicken') return (t.chickenWalk?.frames || []).slice(0, 6);
  return (t.butterfly?.frames || []).slice(0, 14);
}

function buildExtraAnimal(engine, row) {
  const { PIXI } = engine;
  const frames = animalFrames(engine, row.classId);
  const spr = new PIXI.AnimatedSprite(frames.length ? frames : [PIXI.Texture.EMPTY]);
  const scale = row.classId === 'npc_piggy' ? 0.97 : row.classId === 'npc_chicken' ? 0.7 : 0.7;
  spr.anchor.set(0.5, row.classId === 'npc_butterfly' ? 0.5 : 1);
  spr.baseScale = scale;
  spr.scale.set(scale);
  spr.animationSpeed = row.classId === 'npc_butterfly' ? 0.25 : 0.13;
  spr.zIndex = row.classId === 'npc_butterfly' ? 40 : 20;
  spr.play();
  const ground = surfaceAt(engine, row.x);
  spr.x = row.x;
  spr.y = row.classId === 'npc_butterfly' ? ground - 90 : ground + 2;
  engine.entityLayer.addChild(spr);
  const textures = engine.textures || {};
  const playOnce = (key, slice, walkKey, walkSlice, speed) => (durationMs = 0) => {
    const actionFrames = (textures[key]?.frames || []).slice(...slice);
    if (!actionFrames.length || spr.destroyed) return;
    spr.textures = actionFrames;
    spr.loop = false;
    spr.animationSpeed = durationMs > 0 ? Math.min(0.3, Math.max(0.025, actionFrames.length / (60 * (durationMs / 1000)))) : 0.18;
    spr.gotoAndPlay(0);
    spr.onComplete = () => {
      if (spr.destroyed) return;
      spr.loop = true;
      spr.textures = (textures[walkKey]?.frames || []).slice(...walkSlice);
      spr.animationSpeed = speed;
      spr.gotoAndPlay(0);
      spr.onComplete = null;
    };
  };
  if (row.classId === 'npc_piggy') {
    spr.playPet = playOnce('piggyNibble', [0, 10], 'piggyWalk', [0, 8], 0.13);
    spr.playNibble = spr.playPet;
  } else if (row.classId === 'npc_chicken') {
    spr.playSqueeze = playOnce('chickenPeck', [0, 6], 'chickenWalk', [0, 6], 0.12);
  }
  // A new game day refreshes this animal's daily care limits.
  const today = getGameDayKey(now());
  if (row.state.careDay !== today) {
    resetAnimalDay(row.classId, row.state);
    row.state.careDay = today;
  }
  const label = NAMEABLE_ANIMALS[row.classId];
  const target = engine.register({
    classId: row.classId,
    label: row.state.userName ? namedAnimalLabel(row.classId, row.state) : label,
    subtitle: animalStatusLabel(row.classId, row.state),
    sprite: spr,
    airborne: row.classId === 'npc_butterfly',
    state: row.state,
    husbandryAnimal: row.id,
    // game.js sends it with the feed event: solo Feats count 3 feeds per animal (npc_piggy.js 734-739).
    animalKey: `${engine.streetTsid || ''}:husbandry:${row.id}`,
  });
  const entity = { row, sprite: spr, target, vx: (row.id.length % 2 ? 1 : -1) * 0.45, baseX: row.x, phase: row.id.length };
  // G63: a piggy you own can starve; the animal-mood feature calls this when its tick says die.
  if (row.classId === 'npc_piggy') target.husbandryStarve = (opts) => starveExtra(engine, entity, opts);
  // G64: crowding sends it away; the animal-mood feature calls this when it leaves or puffs away.
  target.husbandryVanish = () => vanishExtra(engine, entity);
  extras.push(entity);
}

function stickFor(engine, classId) {
  if (!isYard(engine)) return null;
  return slot(engine).sticks.find((k) => MAGIC_STICKS[k.classTsid].animal === classId) || null;
}

function stepExtra(engine, entity, dtMs) {
  const spr = entity.sprite;
  if (!spr || spr.destroyed) return;
  // The animal-mood feature walks a hungry piggy to food and holds a sad one.
  if (spr._moodHold) {
    entity.row.x = Math.round(spr.x);
    return;
  }
  if (Number.isFinite(spr._moodRebase)) {
    entity.baseX = spr._moodRebase;
    delete spr._moodRebase;
  }
  if (!spr.loop) return; // mid action
  const stick = stickFor(engine, entity.row.classId);
  const range = stick ? Number(stick.distance) || STICK_DISTANCE : 110;
  const center = stick ? stick.x : entity.baseX;
  const left = Math.max(30, center - range);
  const right = Math.min(engine.worldW - 30, center + range);
  if (entity.row.classId === 'npc_butterfly') {
    entity.phase += dtMs / 1000;
    spr.x = Math.min(right, Math.max(left, center + Math.sin(entity.phase * 0.5) * Math.min(range, 140)));
    spr.y = surfaceAt(engine, spr.x) - 90 + Math.sin(entity.phase * 1.3) * 14;
  } else {
    spr.x += entity.vx * (dtMs / 16.67);
    if (spr.x < left || spr.x > right) {
      spr.x = Math.min(right, Math.max(left, spr.x));
      entity.vx *= -1;
    }
    spr.y = surfaceAt(engine, spr.x, spr.y) + 2;
    spr.scale.x = Math.abs(spr.baseScale) * (entity.vx > 0 ? -1 : 1);
  }
  entity.row.x = Math.round(spr.x);
}

/**
 * A released or raised animal leaves for good (crowding, js/animal-crowding.js):
 * its slot row goes at once, so a reload cannot bring it back; the returned
 * finisher takes it off the street when its puff is done (apiDelete).
 */
function vanishExtra(engine, entity) {
  const s = slot(engine);
  s.animals = s.animals.filter((a) => a !== entity.row);
  const gen = generation;
  lastAction = `crowd:gone:${entity.row.classId}`;
  engine.save();
  return () => {
    if (gen !== generation) return;
    extras = extras.filter((e) => e !== entity);
    engine.unregister(entity.target);
    publish(engine, true);
  };
}

function removeExtra(engine, entity) {
  const s = slot(engine);
  s.animals = s.animals.filter((a) => a !== entity.row);
  extras = extras.filter((e) => e !== entity);
  engine.unregister(entity.target);
}

// —— Starvation (G63: only piggies you own) ————————————————————————————————

/** QA: &animaldeathroll=<0..1> forces the starvation roll (0 dies, 0.99 lives). */
export function deathRollFor(engine) {
  return forcedRoll(engine?.param?.('animaldeathroll'));
}

/**
 * The smoke_puff overlay (npc_piggy.js 1964-1971), Tiny Speck's own art
 * (G251), shared with crowding departures (animal-mood-feature.js); `top` is
 * the piggy's display top. &animaldeathfx=hold keeps it up for headless
 * screenshots.
 */
function smokePuff(engine, x, top) {
  return sharedSmokePuff(engine, x, top, { hold: engine.param('animaldeathfx') === 'hold' });
}

/** A yard row has no sprite: about a piggy's height (npc_piggy sheets) over the ground. */
const PIGGY_TOP_PX = 75;

/** die() 1036-1041 on this street: 10 Meat at the piggy, a Plop 80 px along. */
function dropStarvedRemains(engine, x, refY) {
  const meatX = Math.round(x + PIGGY_DEATH_DROPS.meatDx);
  // World stacks sit 74 px above the ground like a player drop (game.js dropPackStack, tree death).
  engine.dropWorldStack('meat', PIGGY_DEATH_DROPS.meat, meatX, surfaceAt(engine, meatX, refY) - 74);
  // A die() Plop has no seed_class: examining it gives plop.js's default, 1 Corn Seed (219-228).
  const plopX = Math.max(30, Math.min((engine.worldW || Infinity) - 30, x + PIGGY_DEATH_DROPS.plopDx));
  dropPlop(engine, plopX, 'seed_corn', PIGGY_DEATH_DROPS.plop, { silent: true, refY });
}

/** Remake activity line (GSJS has no death text; the puff is all the source shows). */
function starvedLine(row, where) {
  const name = row?.state?.userName ? row.state.userName : where === 'yard' ? 'A Piggy in your back yard' : 'Your Piggy';
  return `${name} starved, and went up in a puff of smoke.`;
}

/**
 * A piggy you own dies of hunger on the street you stand on: the puff, then
 * 500 ms later (apiSetTimer('die', 500)) it leaves the world and its slot and
 * the Meat and Plop land. The slot row goes at once so a reload in between
 * cannot bring it back. `row` alone (no sprite) is a yard row from advanceYard.
 */
function starveExtra(engine, entity, { replay = false, row = entity?.row, where = isYard(engine) ? 'yard' : 'street' } = {}) {
  if (!row) return false;
  const spr = entity?.sprite && !entity.sprite.destroyed ? entity.sprite : null;
  const x = spr ? spr.x : Number(row.x) || 0;
  const refY = spr ? spr.y : undefined;
  const ground = surfaceAt(engine, x, refY);
  const s = slot(engine);
  s.animals = s.animals.filter((a) => a !== row);
  if (entity) {
    extras = extras.filter((e) => e !== entity);
    if (spr) spr._moodHold = true; // stop walking while the puff covers it
  }
  smokePuff(engine, x, spr ? displayTopOf(spr) : ground - PIGGY_TOP_PX);
  const gen = generation;
  const tsid = engine.streetTsid;
  const finish = () => {
    if (entity) engine.unregister(entity.target);
    if (gen === generation && engine.streetTsid === tsid) dropStarvedRemains(engine, x, refY ?? ground);
    else yardOrStreetLater(engine, tsid, x);
    engine.save();
    publish(engine, true);
  };
  setTimeout(finish, PIGGY_DEATH_PUFF.dieAfterMs);
  starvedCount += 1;
  engine.pushActivity(starvedLine(row, where));
  lastAction = `starved:${where}${replay ? ':replay' : ''}`;
  engine.save();
  return true;
}

/** The street changed inside the 500 ms: land the remains when that street is next entered. */
function yardOrStreetLater(engine, tsid, x) {
  const s = slot(engine, tsid);
  s.starved.push({ x: Math.round(x), at: now() });
}

/** Remains that are owed to this street (yard deaths while away, or a death cut short by travel). */
function landStarvedRemains(engine) {
  const s = slot(engine);
  if (!s.starved.length) return;
  const owed = s.starved;
  s.starved = [];
  for (const d of owed) dropStarvedRemains(engine, Number(d.x) || 0);
  lastAction = `starved:landed:${owed.length}`;
  engine.save();
}

// —— Sticks and machines (back yard) ——————————————————————————————————

function buildPlaced(engine, kind, row) {
  const scale = kind === 'stick' ? 0.5 : 1;
  const spr = makeSprite(engine, ART[row.classTsid], { scale, z: 17 });
  spr.x = row.x;
  spr.y = surfaceAt(engine, row.x) + 2;
  spr._worldHitW = kind === 'stick' ? 50 : 70;
  spr._worldHitH = kind === 'stick' ? 90 : 80;
  const target = engine.register({
    classId: row.classTsid,
    featureId: HUSBANDRY_FEATURE_ID,
    label: kind === 'stick' ? MAGIC_STICKS[row.classTsid].label : machineLabel(row),
    subtitle: kind === 'stick'
      ? `${NAMEABLE_ANIMALS[MAGIC_STICKS[row.classTsid].animal]}s stay within ${row.distance || STICK_DISTANCE} px`
      : REMOTE_MACHINES[row.classTsid].output ? 'Works around the clock' : 'Feeds your piggies while you are away',
    sprite: spr,
    husbandryPlaced: row,
  });
  placed.push({ kind, row, sprite: spr, target });
}

function refreshPlacedLabels() {
  for (const p of placed) {
    if (p.kind === 'machine') p.target.label = machineLabel(p.row);
  }
}

// —— Spawning ———————————————————————————————————————————————————————————

function spawnStreet(engine) {
  spawnedFor = engine.streetTsid;
  pendingEnter = false;
  if (engine.transientInstance() && !isYard(engine)) return;
  const s = slot(engine);
  const street = engine.street || {};
  // Batterflies (planner points on cave streets).
  const count = batterflyCountForStreet(street);
  const points = count ? engine.placement(BATTERFLY_GROUP) || [] : [];
  points.slice(0, count).forEach((pt, i) => {
    if (!Number.isFinite(pt?.x)) return;
    const key = `batterfly:${i}`;
    s.batterflies[key] ||= {};
    buildBatterfly(engine, key, pt.x, pt.y, s.batterflies[key]);
  });
  // Passive guano for the time away.
  const t = now();
  for (const b of batterflies) {
    const n = passiveGuano(b.state, t, guanoOnStreet(engine));
    if (n) dropGuano(engine, b.baseX + ((b.key.length * 37) % 80) - 40, n);
  }
  for (const row of s.guano) buildPile(engine, 'guano', row);
  for (const row of s.plops) buildPile(engine, 'plop', row);
  // Named animals keep their names (getLabel) across visits and reloads.
  for (const target of engine.interactables) {
    if (ANIMAL_CLASSES.has(target.classId) && target.state?.userName) target.label = namedAnimalLabel(target.classId, target.state);
  }
  // Captured ecology piggies stay gone (one capture per location cooldown).
  for (const target of [...engine.interactables]) {
    if (target.classId === 'npc_piggy' && !target.husbandryAnimal && Number(target.state?.capturedAt) > 0
      && t - Number(target.state.capturedAt) < HERDKEEPING.locationCooldownMs) {
      hideEcologyAnimal(engine, target);
    }
  }
  if (isYard(engine)) {
    advanceYardNow(engine);
    for (const row of s.sticks) buildPlaced(engine, 'stick', row);
    for (const row of s.machines) buildPlaced(engine, 'machine', row);
  }
  for (const row of s.animals) buildExtraAnimal(engine, row);
  landStarvedRemains(engine);
  // Chickens whose incubation finished while we were away lose the egg (onIncubationComplete: player not found).
  for (const target of engine.interactables) {
    if (target.classId !== 'npc_chicken' || !target.state?.incubatingEgg) continue;
    if (incubationPhase(target.state, t, incubationTiming(engine)) === 'complete') {
      resetIncubation(target.state);
      lastAction = 'incubation:lost';
    }
  }
  setupDemo(engine);
  publish(engine, true);
}

function hideEcologyAnimal(engine, target) {
  if (target.sprite && !target.sprite.destroyed) target.sprite.visible = false;
  const list = engine.interactables;
  const at = list.indexOf(target);
  if (at >= 0) list.splice(at, 1);
}

// —— Yard simulation ————————————————————————————————————————————————————

function advanceYardNow(engine) {
  const yard = yardSlot(engine);
  if (!yard.machines.length && !yard.animals.length) return;
  const food = yardFood(engine);
  const events = advanceYard(yard, now(), { upgrades: engine.pc.imaginationUpgrades || [], deathRng: deathRollFor(engine), food });
  let fed = false;
  for (const ev of events) {
    if (ev.type === 'ate') {
      // G64: a hungry yard piggy ate a dropped food item or a fruit off a yard tree (npc_piggy.js 1977-2018, 1482-1533).
      yardSelfFed[ev.kind] = (yardSelfFed[ev.kind] || 0) + 1;
      fed = true;
      lastAction = `yard:ate:${ev.kind}:${ev.classTsid}`;
      if (isYard(engine)) {
        const eater = extras.find((e) => e.row === ev.animal);
        if (eater) engine.say(eater.target, 'Yum!', 3000);
      }
      continue;
    }
    if (ev.type === 'full') {
      const def = REMOTE_MACHINES[ev.classTsid];
      emit(engine, `${ev.classTsid}:full`);
      questFlags.add(def.fullFlag);
      engine.toast(def.fullPrompt, 4200);
      engine.pushActivity(def.fullPrompt);
      lastAction = `full:${ev.classTsid}`;
    } else if (ev.type === 'happy' && isYard(engine)) {
      const cheered = extras.find((e) => e.row === ev.animal);
      if (cheered) engine.say(cheered.target, ev.line, 3000);
    } else if (ev.type === 'die') {
      // advanceYard already took it out of the herd. At home: the puff and the
      // remains now (the catch-up on arrival runs before the herd is built, so
      // there may be no sprite). Away: the remains wait in the yard slot.
      if (isYard(engine)) {
        const entity = extras.find((e) => e.row === ev.animal) || null;
        starveExtra(engine, entity, { row: ev.animal, where: 'yard', replay: !entity });
      } else {
        yard.starved.push({ x: Math.round(Number(ev.animal.x) || 0), at: ev.at });
        starvedCount += 1;
        engine.pushActivity(starvedLine(ev.animal, 'yard'));
        lastAction = 'starved:yard:away';
        engine.save();
      }
    } else if (ev.type === 'ascend') {
      gainXp(engine, ev.xp);
      // The drops land where the butterfly was (yard ground piles would need
      // a pickup; put them straight into the yard's milker owner's pack).
      for (const [id, n] of Object.entries(ev.drops)) engine.inv[id] = (engine.inv[id] || 0) + n;
      engine.pushActivity('A Butterfly in your yard has ascended to a higher plane.');
      const gone = extras.find((e) => e.row === ev.animal);
      if (gone) {
        extras = extras.filter((e) => e !== gone);
        engine.unregister(gone.target);
        // onContainerItemRemoved: the butterflies left behind check the crowd (G64).
        animalCrowdChanged(engine, 'npc_butterfly', { removed: true });
      }
    }
  }
  if (fed) settleYardFood(engine, food);
  if (isYard(engine)) {
    refreshPlacedLabels();
    for (const e of extras) e.target.subtitle = animalStatusLabel(e.row.classId, e.row.state);
  }
}

/**
 * What the yard herd can feed itself from while you are away: the yard's
 * dropped food stacks, the grown Patch trees in the yard's patches slot
 * (patches-feature.js keeps them under engine.streetSlot('patches', yard)),
 * and the Magic Pig Stick's range for the stacks.
 */
function yardFood(engine) {
  const stacks = engine.droppedItems?.streets?.[YARD_TSID] || [];
  const plots = engine.streetSlot?.('patches', YARD_TSID)?.plots || {};
  const trees = Object.values(plots)
    .filter((p) => p?.stage === 'tree' && p.tree?.classId && p.tree.classId !== 'wood_tree' && p.tree.state)
    .map((p) => p.tree.state);
  const pig = yardSlot(engine).sticks.find((k) => k.classTsid === 'magic_pig_stick');
  return { stacks, trees, stick: pig ? { x: Number(pig.x) || 0, distance: Number(pig.distance) || STICK_DISTANCE } : null };
}

/** Drop emptied stacks and save what the herd ate. */
function settleYardFood(engine, food) {
  const streets = engine.droppedItems?.streets;
  const rows = streets?.[YARD_TSID];
  if (Array.isArray(rows)) {
    for (let i = rows.length - 1; i >= 0; i -= 1) if (!(rows[i]?.count > 0)) rows.splice(i, 1);
    if (!rows.length) delete streets[YARD_TSID];
    engine.droppedItemsChanged?.();
  }
  engine.save();
}

// —— Naming ——————————————————————————————————————————————————————————————

function applyName(engine, target, value) {
  const res = nameAnimal(target.classId, target.state || (target.state = {}), value, namingCtx(engine));
  if (!res.ok) {
    if (res.reason !== 'unchanged') engine.toast(res.reason, 2200);
    return false;
  }
  target.label = namedAnimalLabel(target.classId, target.state);
  engine.say(target, res.bubble, 5000);
  emit(engine, res.counter);
  engine.pushActivity(`You named a ${NAMEABLE_ANIMALS[target.classId]} "${res.name}".`);
  lastAction = `named:${target.classId}:${res.name}`;
  engine.setData('namedAnimal', `${target.classId}:${res.name}`);
  engine.save();
  publish(engine, true);
  return true;
}

function namingCtx(engine) {
  return { learned: engine.learnedSkills, playerId: PLAYER_ID, nowS: Math.floor(now() / 1000), ownYard: isYard(engine) };
}

/** askPlayer 'Name Me!' / 'Rename Me!' in the verb-menu card style. */
function openNameModal(engine, target, title) {
  closeNameModal();
  if (typeof document === 'undefined') return;
  const host = document.getElementById('verb-menu')?.parentElement || document.body;
  const wrap = document.createElement('div');
  wrap.className = 'verb-menu animal-name-modal';
  wrap.id = 'animal-name-modal';
  wrap.setAttribute('role', 'dialog');
  wrap.setAttribute('aria-modal', 'true');
  wrap.innerHTML = `
    <div class="verb-menu-card">
      <div class="verb-menu-head">
        <div class="verb-menu-title"></div>
        <button type="button" class="verb-menu-x" aria-label="Cancel">×</button>
      </div>
      <form style="padding:0.2rem 0.85rem 0.85rem;display:grid;gap:0.55rem">
        <label style="font-size:0.82rem;opacity:0.75">My new name:</label>
        <input type="text" maxlength="32" autocomplete="off" spellcheck="false"
          style="font:inherit;padding:0.45rem 0.6rem;border:1px solid #d9ccb3;border-radius:8px;background:#fff" />
        <div style="display:flex;gap:0.5rem;justify-content:flex-end">
          <button type="button" data-cancel class="verb-choice" style="width:auto;border:1px solid #e4d9c4;border-radius:8px;padding:0.35rem 0.8rem">Cancel</button>
          <button type="submit" class="verb-choice" style="width:auto;border:1px solid #9cc47a;border-radius:8px;padding:0.35rem 0.8rem;background:#e8f0dc;font-weight:700">OK</button>
        </div>
      </form>
    </div>`;
  wrap.querySelector('.verb-menu-title').textContent = title;
  const input = wrap.querySelector('input');
  input.value = target.state?.userName || '';
  const cancel = () => closeNameModal();
  wrap.querySelector('.verb-menu-x').addEventListener('click', cancel);
  wrap.querySelector('[data-cancel]').addEventListener('click', cancel);
  wrap.querySelector('form').addEventListener('submit', (e) => {
    e.preventDefault();
    const value = input.value;
    closeNameModal();
    applyName(engine, target, value);
  });
  input.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Escape') {
      e.preventDefault();
      cancel();
    }
  });
  host.appendChild(wrap);
  nameModal = wrap;
  requestAnimationFrame(() => input.focus());
}

function closeNameModal() {
  if (nameModal?.parentElement) nameModal.parentElement.removeChild(nameModal);
  nameModal = null;
}

// —— Capture and release ——————————————————————————————————————————————

function rollFor(engine) {
  const forced = Number(engine.param('animalroll'));
  return Number.isFinite(forced) && engine.param('animalroll') !== null ? () => Math.min(0.999999, Math.max(0, forced)) : Math.random;
}

function capture(engine, target) {
  const res = capturePiggy(target.state || {}, {
    pc: engine.pc,
    inv: engine.inv,
    learned: engine.learnedSkills,
    streetTsid: engine.streetTsid,
    ownYard: isYard(engine),
    // A sad piggy is happy to be captured (439-444): somewhere depressing (and
    // then with no location cooldown, 383-386) or sulking from crowding (G64).
    sad: isSadIn('npc_piggy', animalPlaceIsDepressing(engine)) || animalCrowdSad(target),
    depressing: isSadIn('npc_piggy', animalPlaceIsDepressing(engine)),
    rng: rollFor(engine),
  });
  if (res.bubble) engine.say(target, res.bubble, 3500);
  if (!res.ok) {
    if (res.attempted) {
      engine.pushActivity({
        base: 'The Piggy got away (used 1 Pig Bait)',
        effects: { energy: res.effects.energy, mood: res.effects.mood },
      });
      engine.playSound('PIGGY_SCOFFS', { volume: 0.6 });
      lastAction = 'capture:failed';
    } else {
      engine.toast(res.msg, 2600);
      lastAction = 'capture:blocked';
    }
    engine.updateHud();
    publish(engine, true);
    return;
  }
  engine.pushActivity({
    base: 'You captured a Piggy (used 1 Pig Bait)',
    effects: { energy: res.effects.energy, mood: res.effects.mood, xp: res.effects.xp },
  });
  engine.floatText(engine.player.x, engine.player.y - 100, '+1 Hog-tied Piggy', 0x7dcea0);
  emit(engine, res.counter);
  emit(engine, 'npc_piggy:capture');
  if (res.questCounter) emit(engine, 'npc_piggy:hogtie');
  const extra = extras.find((e) => e.target === target);
  if (extra) removeExtra(engine, extra);
  else {
    target.state.capturedAt = now();
    hideEcologyAnimal(engine, target);
  }
  engine.playSound('ANIMAL_STICK', { volume: 0.5 });
  lastAction = 'capture:success';
  engine.updateHud();
  engine.save();
  publish(engine, true);
}

function releasePiggyHere(engine, { escaped = false } = {}) {
  const res = releaseHogtied(engine.inv, rollFor(engine));
  if (!res.ok) {
    engine.toast(res.msg, 2000);
    return false;
  }
  const x = (engine.player?.x || 200) + 40;
  const row = addExtraAnimal(engine, 'npc_piggy', x, res.name ? { userName: res.name, namer: PLAYER_ID } : {});
  row.state.mood = 0;
  const entity = extras.find((e) => e.row === row);
  // onReleased: somewhere depressing the piggy goes straight to sadness instead.
  if (entity && !escaped && !animalPlaceIsDepressing(engine)) engine.say(entity.target, res.bubble, 3500);
  // onContainerItemAdded: the other piggies here check the crowd (G64).
  animalCrowdChanged(engine, 'npc_piggy', { exclude: entity?.target });
  engine.pushActivity(escaped ? HERDKEEPING.escapeLine : 'You released the Piggy.');
  lastAction = escaped ? 'hogtie:escaped' : 'hogtie:released';
  engine.updateHud();
  engine.save();
  publish(engine, true);
  return true;
}

// —— Set free (G284) ——————————————————————————————————————————————————————

/**
 * verbs.set_free's handler (npc_chicken.js 391-414, npc_butterfly.js
 * 353-370): a modal OK / Cancel prompt; OK runs modal_callback.
 */
function askSetFree(engine, target) {
  const name = target.state?.userName || '';
  engine.scriptedDialogue({
    title: null,
    kicker: null,
    beats: [{ text: setFreePrompt(target.classId, name), response: SET_FREE.ok }],
    cancelable: true,
    primaryLabel: SET_FREE.ok,
    cancelLabel: SET_FREE.cancel,
    onComplete: () => setFreeNow(engine, target),
    onCancel: () => {
      lastAction = `set_free:cancel:${target.classId}`;
      publish(engine, true);
    },
  });
  lastAction = `set_free:ask:${target.classId}`;
  publish(engine, true);
}

/**
 * modal_callback 'ok' (npc_chicken.js 948-971, npc_butterfly.js 985-1010):
 * +20 mood (the metabolic gate) and -5 energy, the set_free_in_pol line with
 * those slugs, smoke_puff following the animal (delay 2.5 s, delta_y 95 from
 * its display top, 1.5 s), and at 3 s freeChicken / freeButterfly: the
 * activity line and apiDelete. The slot row goes at once, so a reload
 * cannot bring it back.
 */
function setFreeNow(engine, target) {
  const spr = target?.sprite;
  if (!spr || spr.destroyed || !(engine.interactables || []).includes(target) || target._setFree) return false;
  target._setFree = true;
  const cls = target.classId;
  const name = target.state?.userName || '';
  const res = applySetFree(cls, engine.pc);
  engine.updateHud();
  engine.say(target, res.line, 4000, { slugs: { mood: res.slugs.mood, energy: res.slugs.energy } });
  let last = itemstackOverlayPoint(spr.x, displayTopOf(spr), { dy: SET_FREE.puff.deltaY });
  playSheetOverlay(engine.PIXI, SET_FREE.puff.overlay, {
    layer: engine.entityLayer,
    at: () => {
      if (!spr.destroyed) last = itemstackOverlayPoint(spr.x, displayTopOf(spr), { dy: SET_FREE.puff.deltaY });
      return last;
    },
    delayMs: SET_FREE.puff.delayMs,
    durationMs: SET_FREE.puff.durationMs,
    loop: false,
    zIndex: 70,
  });
  const entity = extras.find((e) => e.target === target);
  const finish = entity ? vanishExtra(engine, entity) : null;
  const gen = generation;
  later(SET_FREE.freedMs, () => {
    engine.pushActivity(setFreeGoneLine(cls, name));
    if (gen !== generation) return;
    if (finish) finish();
    else {
      // Not one of this feature's rows: take it off the street all the same.
      spr.visible = false;
      engine.unregister(target);
    }
    if (!spr.destroyed) spr.visible = false;
    animalCrowdChanged(engine, cls, { exclude: target });
    lastAction = `set_free:gone:${cls}`;
    publish(engine, true);
  });
  lastAction = `set_free:ok:${cls}:mood=${res.slugs.mood}:energy=${res.slugs.energy}`;
  engine.save();
  publish(engine, true);
  return true;
}

// —— Pack-side babies ————————————————————————————————————————————————————

function babyTarget(engine, babyClass) {
  return {
    classId: babyClass,
    featureId: HUSBANDRY_FEATURE_ID,
    label: itemLabel(babyClass),
    packBaby: true,
  };
}

function feedPackBaby(engine, babyClass, foodClass) {
  const res = feedBaby(babyClass, engine.inv, foodClass);
  if (!res.ok) {
    engine.toast(res.msg, 2400);
    return;
  }
  const xp = gainXp(engine, res.xp);
  emit(engine, `${babyClass}:feed`);
  if (res.grew) {
    const x = (engine.player?.x || 200) + 50;
    const grown = addExtraAnimal(engine, res.grew, x);
    // onContainerItemAdded: the others of its class here check the crowd (G64).
    animalCrowdChanged(engine, res.grew, { exclude: extras.find((e) => e.row === grown)?.target });
    emit(engine, res.counter);
    engine.pushActivity({ base: `You fed the ${itemLabel(babyClass)}`, effects: { xp } });
    engine.pushActivity(res.msg);
    engine.toast(res.msg, 2600);
    lastAction = `grew:${res.grew}`;
  } else {
    engine.pushActivity({ base: `${res.msg.replace(/\.$/, '')} (${res.fed}/${res.need})`, effects: { xp } });
    lastAction = `fed:${babyClass}:${res.fed}/${res.need}`;
  }
  engine.updateHud();
  engine.save();
  publish(engine, true);
}

// —— Incubation watch ————————————————————————————————————————————————————

function watchIncubations(engine) {
  const t = now();
  const timing = incubationTiming(engine);
  for (const target of engine.interactables) {
    if (target.classId !== 'npc_chicken' || !target.state?.incubatingEgg) continue;
    const phase = incubationPhase(target.state, t, timing);
    const left = Math.max(0, Math.ceil((timing.completeMs - (t - target.state.incubationStartedAt)) / 1000));
    target.subtitle = `Incubating a ${itemLabel(target.state.incubatingEgg)} · ${left}s`;
    if (phase === 'halfway' && !target.state.incubationHalfwaySaid) {
      target.state.incubationHalfwaySaid = true;
      engine.say(target, INCUBATION.halfwayLine, 6000);
    }
    if (phase === 'complete') {
      const res = hatchIncubation(target.state, engine.inv, { upgrades: engine.pc.imaginationUpgrades || [], rng: Math.random });
      if (!res.ok) continue;
      engine.say(target, res.bubble, 4000);
      engine.playSound('HAPPY_CHICKEN', { volume: 0.6 });
      engine.floatText(engine.player.x, engine.player.y - 100, `+${res.count} ${itemLabel(res.itemClass, res.count)}`, 0x7dcea0);
      engine.pushActivity(`The Chicken hatched your ${itemLabel(res.egg)}: +${res.count} ${itemLabel(res.itemClass, res.count)}.`);
      if (res.count > 1) engine.pushActivity(INCUBATION.twinLine);
      emit(engine, res.counter);
      target.subtitle = animalStatusLabel('npc_chicken', target.state);
      lastAction = `hatched:${res.itemClass}`;
      engine.updateHud();
      engine.save();
      publish(engine, true);
    }
  }
}

// —— QA demos ————————————————————————————————————————————————————————————

function later(ms, fn) {
  demoTimers.push(setTimeout(fn, ms));
}

/** Poll (every 500 ms, up to 60 s) until `test()` returns something, then run `fn(it)`. */
function whenReady(test, fn, tries = 120) {
  const it = test();
  if (it) fn(it);
  else if (tries > 0) later(500, () => whenReady(test, fn, tries - 1));
}

function nearest(engine, classId) {
  const p = engine.player;
  return engine.interactables
    .filter((t) => t.classId === classId && t.sprite && !t.sprite.destroyed && t.sprite.visible !== false)
    .sort((a, b) => Math.abs(a.sprite.x - p.x) - Math.abs(b.sprite.x - p.x))[0] || null;
}

function standBeside(engine, target, dx = -60) {
  const p = engine.player;
  if (!p || !target?.sprite) return;
  p.x = Math.max(40, Math.min(engine.worldW - 40, target.sprite.x + dx));
  p.y = surfaceAt(engine, p.x, target.sprite.y);
  p.vx = 0;
  p.vy = 0;
  engine.snapCamera?.();
}

function grant(engine, skills = [], items = {}) {
  for (const id of skills) if (!engine.learnedSkills.includes(id)) engine.grantSkill(id);
  for (const [id, n] of Object.entries(items)) engine.inv[id] = Math.max(engine.inv[id] || 0, n);
  engine.updateHud();
}

/** Drive the real Feed what? / how many picker through the DOM. */
function pickInPicker(classTsid, count, done) {
  later(900, () => {
    const btn = document.querySelector(`#feed-picker-grid .feed-picker-choice[data-food="${classTsid}"]`);
    if (!btn) {
      lastAction = `demo:no-choice:${classTsid}`;
      return;
    }
    btn.click();
    later(700, () => {
      const input = document.getElementById('feed-picker-qty-input');
      if (input && !document.getElementById('feed-picker-qty')?.hidden) {
        input.value = String(count);
        input.dispatchEvent(new Event('change'));
        if (engine_ref?.param('animalautoplay') === 'picker') return; // hold on the count step
        later(500, () => {
          document.getElementById('feed-picker-qty-go')?.click();
          if (done) later(400, done);
        });
      } else if (done) later(400, done);
    });
  });
}

/** The engine the running QA demo drives (pickInPicker reads its params). */
let engine_ref = null;

function setupDemo(engine) {
  if (demoUsed) return;
  const mode = String(engine.param('animaldemo') || '');
  if (!['batterfly', 'plop', 'incubate', 'name', 'herd', 'remote', 'sad', 'starve', 'crowd', 'setfree'].includes(mode)) return;
  if ((mode === 'remote' || mode === 'setfree') && !isYard(engine)) return; // waits for the home street
  if (mode === 'crowd' && engine.param('homedemo') && !isYard(engine)) return; // the yard crowd waits for home
  demoUsed = true;
  demoMode = mode;
  engine_ref = engine;
  const auto = engine.param('animalautoplay');
  const p = engine.player;

  if (mode === 'batterfly') {
    grant(engine, [], { meat: 10, cherry: 20 });
    let entity = batterflies[0];
    if (!entity) {
      const x = Math.min(engine.worldW - 160, (p?.x || 300) + 150);
      const s = slot(engine);
      s.batterflies['batterfly:demo'] ||= {};
      entity = buildBatterfly(engine, 'batterfly:demo', x, p?.y, s.batterflies['batterfly:demo']);
    }
    entity.baseX = Math.min(engine.worldW - 160, (p?.x || 300) + 150);
    entity.baseY = surfaceAt(engine, entity.baseX) - 110;
    if (!auto) return;
    later(2200, () => {
      engine.openPicker(entity.target, { id: 'feed' });
      pickInPicker('meat', 10, () => {
        later(1200, () => {
          const pile = piles.find((pl) => pl.kind === 'guano');
          if (pile && auto !== 'hold') heliPick(engine, pile);
        });
      });
    });
    return;
  }

  if (mode === 'plop') {
    grant(engine, [], { potato: 9, pumpkin: 1 });
    const piggy = nearest(engine, 'npc_piggy');
    if (!piggy) return;
    standBeside(engine, piggy);
    if (!auto) return;
    later(2200, () => {
      engine.openPicker(piggy, { id: 'feed' });
      pickInPicker('potato', 9, () => {
        if (auto === 'hold') return;
        whenReady(() => piles.find((pl) => pl.kind === 'plop'), (pile) => later(1500, () => {
          if (piles.includes(pile)) examine(engine, pile);
        }));
      });
    });
    return;
  }

  if (mode === 'incubate') {
    grant(engine, [INCUBATION.skill], { butterfly_egg: 1, chicken_egg: 1, tiny_bubble: 3, grain: 12 });
    const chicken = nearest(engine, 'npc_chicken');
    if (!chicken) return;
    standBeside(engine, chicken);
    if (!auto) return;
    later(2200, () => {
      engine.openPicker(chicken, { id: 'incubate', picker: 'incubate' });
      pickInPicker('butterfly_egg', 1, () => {
        if (auto === 'hatch') return;
        whenReady(() => (engine.inv.caterpillar || 0) > 0, () => later(1500, () => {
          engine.openPicker(babyTarget(engine, 'caterpillar'), { id: 'feed' });
          pickInPicker('tiny_bubble', 1);
        }));
      });
    });
    return;
  }

  if (mode === 'name') {
    grant(engine, ['animalkinship_1', 'animalkinship_2', 'animalkinship_3', 'animalkinship_4', 'animalkinship_5']);
    const piggy = nearest(engine, 'npc_piggy');
    if (!piggy) return;
    standBeside(engine, piggy);
    if (!auto) return;
    later(2200, () => {
      openNameModal(engine, piggy, 'Name Me!');
      later(600, () => {
        const input = document.querySelector('#animal-name-modal input');
        if (!input) return;
        input.value = 'Wilbur';
        later(400, () => document.querySelector('#animal-name-modal form')?.requestSubmit());
      });
    });
    return;
  }

  if (mode === 'herd') {
    grant(engine, [HERDKEEPING.skill], { pig_bait: 3 });
    engine.pc.energy = Math.max(engine.pc.energy || 0, 60);
    const piggy = nearest(engine, 'npc_piggy');
    if (!piggy) return;
    standBeside(engine, piggy);
    if (!auto) return;
    later(2200, () => {
      capture(engine, piggy);
      if (auto === 'capture') return;
      later(2500, () => releasePiggyHere(engine));
    });
    return;
  }

  if (mode === 'sad') {
    // A Hog-tied Piggy released here, and a Piglet in the pack (the animal-mood feature's QA).
    grant(engine, [HERDKEEPING.skill, 'animalkinship_1', 'animalkinship_2', 'animalkinship_3', 'animalkinship_4', 'animalkinship_5'], { hogtied_piggy: 1, piglet: 1, potato: 3 });
    later(1200, () => releasePiggyHere(engine));
    return;
  }

  if (mode === 'starve') {
    // G63 QA: release a Hog-tied Piggy here (so it is yours), starving, with
    // its next twice-daily tick 3 s away; &animaldeathroll=0 makes it die.
    grant(engine, [HERDKEEPING.skill], { hogtied_piggy: 1 });
    later(1200, () => {
      if (!releasePiggyHere(engine)) return;
      const row = slot(engine).animals.at(-1);
      if (!row) return;
      Object.assign(row.state, { hunger: 10, croaking: true, mood: 1, hungerAt: now() + 3000 });
      const entity = extras.find((e) => e.row === row);
      if (entity) {
        // Out from under the avatar (and the start street's Jack-O-Lantern) so the remains read in a screenshot.
        const x = Math.min(engine.worldW - 120, row.x + 260);
        row.x = x;
        entity.baseX = x;
        entity.sprite.x = x;
        entity.target.subtitle = animalStatusLabel('npc_piggy', row.state);
      }
      lastAction = 'starve:released';
      publish(engine, true);
    });
    return;
  }

  if (mode === 'crowd') {
    // G64 QA: fill this street (or, with &homedemo=home, your back yard) to its
    // crowding limit with released animals, then every one of the class checks.
    const cls = ['npc_chicken', 'npc_butterfly'].includes(engine.param('animalcrowdclass')) ? engine.param('animalcrowdclass') : 'npc_piggy';
    const card = engine.param('animalcard');
    if (isYard(engine) && (card === '1' || card === '2')) {
      const ups = (engine.pc.imaginationUpgrades ||= []);
      for (const id of card === '2' ? ['herdkeeping_animal_sadness_1', 'herdkeeping_animal_sadness_2'] : ['herdkeeping_animal_sadness_1']) {
        if (!ups.includes(id)) ups.push(id);
      }
    }
    later(1500, () => {
      const max = crowdLimit(engine, cls);
      const have = engine.interactables.filter((t) => t.classId === cls && !t.featureId && t.sprite?.visible !== false).length;
      const over = Math.max(0, Math.floor(Number(engine.param('animalcrowdover')) || 0));
      const add = Math.max(0, Math.min(60, max - have + over));
      const px = engine.player?.x || 400;
      const span = Math.min(900, Math.max(300, add * 40));
      for (let i = 0; i < add; i += 1) {
        const x = Math.max(60, Math.min(engine.worldW - 60, px - span / 2 + (span * (i + 0.5)) / Math.max(1, add)));
        addExtraAnimal(engine, cls, x);
      }
      lastAction = `crowd:${cls}:${have + add}/${max}`;
      engine.save();
      // Every animal of the class checks once (the demo skips the one-by-one arrivals).
      animalCrowdChanged(engine, cls);
      publish(engine, true);
    });
    return;
  }

  if (mode === 'setfree') {
    // G284: a Chicken and a Butterfly of yours beside you in the yard, Herdkeeping known.
    grant(engine, [HERDKEEPING.skill]);
    const x = p?.x || 300;
    const rows = [addExtraAnimal(engine, 'npc_chicken', x + 110), addExtraAnimal(engine, 'npc_butterfly', x + 200)];
    engine.save();
    publish(engine, true);
    if (!auto) return;
    const row = auto === 'butterfly' ? rows[1] : rows[0];
    later(1500, () => {
      const entity = extras.find((e) => e.row === row);
      if (entity) askSetFree(engine, entity.target);
      later(1200, () => document.querySelector('#quest-dialogue:not([hidden]) #quest-dialogue-next')?.click());
    });
    return;
  }

  if (mode === 'remote') {
    grant(engine, [HERDKEEPING.skill, REMOTE_SKILL], { potato: 30 });
    const yard = yardSlot(engine);
    const t = now();
    if (!yard.machines.length) {
      const back = 40 * 60 * 60 * 1000; // pretend we left 40 hours ago
      // Machines to the right of the house, the herd around a Pig Stick in front of it.
      const right = engine.worldW - 120;
      const stickX = Math.round(right - 420);
      for (const [i, cls] of ['npc_piggy', 'npc_piggy', 'npc_piggy', 'npc_butterfly', 'npc_butterfly'].entries()) {
        const row = addExtraAnimal(engine, cls, stickX - 120 + i * 60, {}, YARD_TSID);
        row.state.hunger = 1;
        row.state.hungerAt = t - back + 2 * 60 * 60 * 1000;
      }
      yard.sticks.push({ classTsid: 'magic_pig_stick', x: stickX, distance: STICK_DISTANCE });
      const collector = createMachine('meat_collector', right - 150, t - back);
      const milker = createMachine('butterfly_milker', right - 75, t - back);
      const feeder = createMachine('piggy_feeder', right, t - back);
      feeder.inside = 40;
      yard.machines.push(collector, milker, feeder);
      for (const m of yard.machines) m.nextAt = t - back + 20 * 60 * 1000;
      if (engine.param('animalyardfood') === '1') {
        // G64 QA: 3 Potatoes on the yard ground and a fruiting Fruit Tree in
        // the yard's first Patch plot (a fixture: drawn only where the yard
        // has a Patch) for the hungry herd to find while "away".
        engine.dropWorldStack('potato', 3, Math.round(stickX + 60), surfaceAt(engine, stickX + 60) - 74);
        const soil = engine.streetSlot('patches', YARD_TSID);
        soil.plots ||= {};
        soil.plots['patch:0'] ||= {
          classTsid: 'patch',
          kind: 'patch',
          stage: 'tree',
          since: t - back,
          tree: { classId: 'trant_fruit', state: { classTsid: 'trant_fruit', maturity: 6, health: 7, fruitCount: 5 }, grownAt: t - back, lastCycleAt: t - back, resetAt: t },
        };
      }
      // Rebuild the yard with the seeded objects (replaying the 40 hours),
      // then run this demo again for the autoplay half.
      clearEntities(engine);
      spawnedFor = null;
      demoUsed = false;
      return;
    }
    const stick = placed.find((pl) => pl.kind === 'stick');
    if (stick) standBeside(engine, stick, 120);
    if (!auto || auto === 'hold') return;
    later(2400, () => {
      const collector = placed.find((pl) => pl.row.classTsid === 'meat_collector');
      if (collector) collect(engine, collector);
      later(1200, () => {
        const milker = placed.find((pl) => pl.row.classTsid === 'butterfly_milker');
        if (milker) collect(engine, milker);
      });
    });
  }
}

// —— Verb handlers ——————————————————————————————————————————————————————

function heliPick(engine, pile) {
  const n = pile.kind === 'guano' ? pile.row.count : 1;
  if (pile.kind === 'plop') {
    // The pack keeps each plop's hidden seeds in a FIFO beside the count.
    reconcilePackPlops(engine.inv);
    husbandryPack().plops.push({ seedClass: pile.row.seedClass, seedCount: pile.row.seedCount });
    engine.inv.plop = (engine.inv.plop || 0) + 1;
  } else {
    engine.inv.guano = (engine.inv.guano || 0) + n;
  }
  removePile(engine, pile);
  engine.floatText(engine.player.x, engine.player.y - 90, `+${n} ${itemLabel(pile.kind, n)}`, 0x7dcea0);
  engine.pushActivity(`You picked up ${n} ${itemLabel(pile.kind, n)}.`);
  emit(engine, `${pile.kind}:pickup`, n);
  lastAction = `pickup:${pile.kind}:${n}`;
  engine.updateHud();
  engine.save();
  publish(engine, true);
}

function examine(engine, pile) {
  const res = examinePlop(pile.row);
  engine.inv[res.seedClass] = (engine.inv[res.seedClass] || 0) + res.seedCount;
  removePile(engine, pile);
  engine.pushActivity(res.msg);
  engine.toast(res.msg, 2600);
  emit(engine, 'plop:inspect');
  emit(engine, 'plop:examine');
  lastAction = `examine:${res.seedClass}:${res.seedCount}`;
  engine.updateHud();
  engine.save();
  publish(engine, true);
}

function sniff(engine, where) {
  const lost = Math.min(engine.pc.energy || 0, PLOP.sniffEnergy);
  loseEnergy(engine.pc, lost); // G289 loss gate (inc_metabolics.js 108-122)
  const xp = gainXp(engine, PLOP.sniffXp);
  engine.pushActivity({ base: PLOP.sniffMsg, effects: { energy: -lost, xp } });
  emit(engine, 'plop:sniff');
  lastAction = `sniff:${where}`;
  engine.updateHud();
}

function collect(engine, entity) {
  const res = collectMachine(entity.row, engine.inv, engine.learnedSkills);
  if (!res.ok) {
    engine.toast(res.msg, 2200);
    return;
  }
  engine.pushActivity(res.msg);
  engine.floatText(entity.sprite.x, entity.sprite.y - 90, `+${res.count} ${itemLabel(res.item, res.count)}`, 0x7dcea0);
  emit(engine, `${entity.row.classTsid}:collect`);
  emit(engine, res.questCounter, res.count);
  engine.playSound('COLLECT', { volume: 0.6 });
  entity.target.label = machineLabel(entity.row);
  lastAction = `collect:${entity.row.classTsid}:${res.count}`;
  engine.updateHud();
  engine.save();
  publish(engine, true);
}

function pickupPlaced(engine, entity) {
  const s = slot(engine);
  if (entity.kind === 'stick') s.sticks = s.sticks.filter((k) => k !== entity.row);
  else {
    if (entity.row.inside && REMOTE_MACHINES[entity.row.classTsid].output) {
      engine.toast('Collect what is inside first.', 2000);
      return;
    }
    if (entity.row.classTsid === 'piggy_feeder' && entity.row.inside) {
      engine.toast('Empty the feeder first: your piggies will finish it.', 2200);
      return;
    }
    s.machines = s.machines.filter((m) => m !== entity.row);
  }
  engine.inv[entity.row.classTsid] = (engine.inv[entity.row.classTsid] || 0) + 1;
  placed = placed.filter((p) => p !== entity);
  engine.unregister(entity.target);
  engine.pushActivity(`You picked up the ${itemLabel(entity.row.classTsid)}.`);
  engine.updateHud();
  engine.save();
  publish(engine, true);
}

function placeHere(engine, classTsid) {
  const s = slot(engine);
  const x = Math.round((engine.player?.x || 200) + 30);
  if (MAGIC_STICKS[classTsid]) {
    const gate = stickPlaceState(classTsid, { learned: engine.learnedSkills, ownYard: isYard(engine), placed: s.sticks });
    if (!gate.enabled) {
      engine.toast(gate.reason, 2600);
      return;
    }
    engine.inv[classTsid] -= 1;
    const row = { classTsid, x, distance: STICK_DISTANCE };
    s.sticks.push(row);
    buildPlaced(engine, 'stick', row);
    engine.playSound('ANIMAL_STICK', { volume: 0.6 });
  } else {
    const def = REMOTE_MACHINES[classTsid];
    if (!isYard(engine)) {
      engine.toast(def.inoperable, 3000);
      return;
    }
    engine.inv[classTsid] -= 1;
    const row = createMachine(classTsid, x, now());
    s.machines.push(row);
    buildPlaced(engine, 'machine', row);
    const count = s.machines.filter((m) => m.classTsid === classTsid).length;
    if (count >= 10) engine.pushActivity('WARNING: You have so many collectors now that you are freaking the animals out a bit. You shouldn\'t add any more, for sure!');
    else if (count >= 5) engine.pushActivity('Warning: Too many collectors can confuse the animals and make collection less efficient.');
  }
  engine.pushActivity(`You placed the ${itemLabel(classTsid)}.`);
  lastAction = `placed:${classTsid}`;
  engine.updateHud();
  engine.save();
  publish(engine, true);
}

// —— Publishing ——————————————————————————————————————————————————————————

function publish(engine, force = false) {
  const t = now();
  if (!force && t < publishAt) return;
  publishAt = t + 400;
  const s = slot(engine);
  const yard = yardSlot(engine);
  engine.setData('husbandryDemo', demoMode);
  engine.setData('husbandryLast', lastAction);
  engine.setData('batterflyCount', String(batterflies.length));
  engine.setData('batterflyStreetCount', String(batterflyCountForStreet(engine.street || {})));
  engine.setData('guanoOnStreet', String(guanoOnStreet(engine)));
  engine.setData('plopsOnStreet', String(s.plops.length));
  engine.setData('pendingPlops', String(pendingPlopCount()));
  engine.setData('packPlops', String(engine.inv.plop || 0));
  engine.setData('extraAnimals', s.animals.map((a) => `${a.classId}${a.state?.userName ? `:${a.state.userName}` : ''}`).join(','));
  engine.setData('yardMachines', yard.machines.map((m) => `${m.classTsid}=${m.inside || 0}`).join(','));
  engine.setData('yardSticks', yard.sticks.map((k) => `${k.classTsid}@${k.x}`).join(','));
  engine.setData('hogtied', String(engine.inv.hogtied_piggy || 0));
  engine.setData('husbandryFlags', [...questFlags].join(','));
  engine.setData('starvedPiggies', String(starvedCount));
  engine.setData('yardStarved', String(yard.starved.length));
  engine.setData('yardSelfFed', `stack:${yardSelfFed.stack || 0},trant:${yardSelfFed.trant || 0}`);
  const chicken = engine.interactables.find((t2) => t2.classId === 'npc_chicken' && t2.state?.incubatingEgg);
  engine.setData('incubation', chicken ? `${chicken.state.incubatingEgg}:${incubationPhase(chicken.state, t, incubationTiming(engine))}` : '');
  engine.setData('packBabies', ['chick', 'piglet', 'caterpillar'].map((id) => `${id}=${engine.inv[id] || 0}`).join(','));
}

function clearEntities(engine) {
  for (const list of [batterflies, piles, extras, placed]) {
    for (const e of list) if (e.target) engine.unregister(e.target);
  }
  batterflies = [];
  piles = [];
  extras = [];
  placed = [];
}

// ---------------------------------------------------------------------------
// Feature
// ---------------------------------------------------------------------------

export const animalHusbandryFeature = {
  id: HUSBANDRY_FEATURE_ID,

  init(engine) {
    loader = createSheetLoader(engine.PIXI);
    ensureHusbandryItems();
    loader.loadAll(Object.values(BATTERFLY_SHEETS));
  },

  placementGroups(population, street) {
    if (!street?.tsid) return [];
    return batterflyPlacementGroups(street);
  },

  onStreetEnter() {
    pendingEnter = true;
    spawnedFor = null;
  },

  onStreetClear() {
    generation += 1;
    batterflies = [];
    piles = [];
    extras = [];
    placed = [];
    spawnedFor = null;
    clearPlopQueues();
    closeNameModal();
  },

  onTick(dtMs, t, engine) {
    if (!engine.started || !loader) return;
    if (spawnedFor !== engine.streetTsid) {
      // Wait for the Batterfly sheets so the first frame is not blank.
      if (!loader.ready(BATTERFLY_SHEETS.profile)) return;
      spawnStreet(engine);
    }
    for (const b of batterflies) stepBatterfly(b, dtMs);
    for (const e of extras) stepExtra(engine, e, dtMs);
    // Piggy Plop queue (doPlop every 5 s).
    for (const plop of drainPlops(now())) {
      const spr = plop.target?.sprite;
      if (!spr || spr.destroyed) continue;
      const dir = spr.scale.x < 0 ? 1 : -1;
      dropPlop(engine, spr.x + dir * 30, plop.seedClass, plop.seedCount);
      engine.pushActivity(`The ${plop.target.state?.userName ? plop.target.state.userName : 'Piggy'} plopped on the ground!`);
      lastAction = `plopped:${plop.seedClass}:${plop.seedCount}`;
      engine.save();
    }
    const nowMs = now();
    if (nowMs >= incubationAt) {
      incubationAt = nowMs + 250;
      watchIncubations(engine);
    }
    if (nowMs >= hogtieAt) {
      hogtieAt = nowMs + 1000;
      const step = stepHogtie(engine.inv, nowMs);
      if (step.xp) {
        const xp = gainXp(engine, step.xp);
        engine.pushActivity({ base: HERDKEEPING.hogtieTickLine.replace(/!$/, ''), effects: { xp } });
        engine.updateHud();
      }
      if (step.escaped && !engine.transientInstance()) releasePiggyHere(engine, { escaped: true });
      // Passive guano while standing on a Batterfly street.
      for (const b of batterflies) {
        const n = passiveGuano(b.state, nowMs, guanoOnStreet(engine));
        if (n) dropGuano(engine, b.sprite.x, n);
      }
    }
    if (nowMs >= yardAt) {
      yardAt = nowMs + 5000;
      advanceYardNow(engine);
    }
    publish(engine);
  },

  verbsFor(target, engine) {
    const cls = target.classId;
    if (cls === BATTERFLY_ID) {
      const options = listAnimalFeedOptions(BATTERFLY_ID, engine.inv);
      return [
        {
          id: 'feed',
          label: 'feed',
          sort: 66,
          tooltip: options.length ? `${BATTERFLY.feedTooltip} · ${options.length} eligible pack item${options.length === 1 ? '' : 's'}` : BATTERFLY.feedTooltip,
          enabled: options.length > 0,
          reason: options.length ? '' : BATTERFLY.noFoodMsg,
          durationMs: 0,
        },
        ...namingVerbs(BATTERFLY_ID, target.state || {}, namingCtx(engine)).map((v) => ({ ...v, durationMs: 0 })),
      ].sort((a, b) => a.sort - b.sort);
    }
    if (cls === 'guano') return [{ id: 'pickup', label: 'pick up', sort: 55, tooltip: 'Put it in your pack', enabled: true, durationMs: 0 }];
    if (cls === 'plop') {
      return [
        { id: 'examine', label: 'examine', sort: 54, tooltip: PLOP.examineTooltip, enabled: true, durationMs: 0 },
        { id: 'pickup', label: 'pick up', sort: 55, tooltip: 'Put it in your pack', enabled: true, durationMs: 0 },
        { id: 'sniff', label: 'sniff', sort: 53, tooltip: PLOP.sniffTooltip, enabled: true, energy: PLOP.sniffEnergy, durationMs: 0 },
        { id: 'taste', label: 'taste', sort: 52, tooltip: PLOP.tasteTooltip, enabled: true, durationMs: 0 },
      ].sort((a, b) => a.sort - b.sort);
    }
    if (MAGIC_STICKS[cls]) {
      const def = MAGIC_STICKS[cls];
      const out = [{ id: 'pickup', label: 'pick up', sort: 55, tooltip: 'Put it in your pack', enabled: true, durationMs: 0 }];
      if ((engine.pc.imaginationUpgrades || []).includes(def.upgrade)) {
        out.unshift({ id: 'change_radius', label: 'change radius', sort: 50, tooltip: def.radiusTooltip, enabled: true, durationMs: 0 });
      }
      return out;
    }
    if (REMOTE_MACHINES[cls]) {
      const entity = placed.find((p) => p.target === target);
      const def = REMOTE_MACHINES[cls];
      const knows = engine.learnedSkills.includes(REMOTE_SKILL);
      const out = [];
      if (def.output) {
        out.push({
          id: 'collect',
          label: 'collect',
          sort: 54,
          tooltip: def.collectTooltip,
          enabled: knows && (entity?.row.inside || 0) > 0,
          reason: !knows ? "You don't know how to use this contraption." : "It's empty!",
          durationMs: 0,
        });
      } else {
        const foods = listAnimalFeedOptions('piggy_feeder', engine.inv);
        out.push({
          id: 'deposit',
          label: 'deposit',
          sort: 53,
          tooltip: `${def.depositTooltip} · ${entity?.row.inside || 0}/${def.capacity}`,
          enabled: knows && foods.length > 0 && (entity?.row.inside || 0) < def.capacity,
          reason: !knows ? 'You need to know Remote Herdkeeping to use this' : (entity?.row.inside || 0) >= def.capacity ? "It's full!" : "You don't have any food to deposit!",
          picker: 'deposit',
          durationMs: 0,
        });
      }
      out.push({ id: 'pickup', label: 'pick up', sort: 55, tooltip: 'Put it in your pack', enabled: true, durationMs: 0 });
      return out;
    }
    return [];
  },

  runVerb(target, verbId, engine) {
    const [verb, arg, countText] = String(verbId || '').split(':');
    const cls = target.classId;
    if (target.packBaby && verb === 'feed') {
      feedPackBaby(engine, cls, arg);
      return true;
    }
    if (cls === BATTERFLY_ID) {
      const entity = batterflies.find((b) => b.target === target);
      if (verb === 'name' || verb === 'rename') {
        openNameModal(engine, target, verb === 'name' ? 'Name Me!' : 'Rename Me!');
        return true;
      }
      if (verb !== 'feed' || !entity) return true;
      const res = feedBatterfly(entity.state, engine.inv, arg, Number(countText) || 1, { upgrades: engine.pc.imaginationUpgrades || [] });
      if (!res.ok) {
        engine.toast(res.msg, 2400);
        return true;
      }
      chewBatterfly(entity);
      engine.say(target, res.reply, 3500);
      engine.pushActivity(res.msg);
      if (res.guano) dropGuano(engine, entity.sprite.x, res.guano);
      emit(engine, 'animals_fed:npc_batterfly');
      // npc_batterfly.js 830-840 times_fed_for_feat: the solo Feat counts 3 feeds per Batterfly.
      emit(engine, 'npc_batterfly:feed', 1, { animal: `${engine.streetTsid || ''}:${entity.key}` });
      engine.playSound('FEED_PIGGY', { volume: 0.5 });
      lastAction = `batterfly:fed:${arg}:${countText || 1}:guano=${res.guano}`;
      engine.updateHud();
      engine.save();
      publish(engine, true);
      return true;
    }
    const pile = piles.find((p) => p.target === target);
    if (pile) {
      if (verb === 'pickup') heliPick(engine, pile);
      else if (verb === 'examine') examine(engine, pile);
      else if (verb === 'sniff') sniff(engine, 'ground');
      else if (verb === 'taste') {
        engine.pushActivity(PLOP.tasteMsg);
        lastAction = 'taste';
      }
      return true;
    }
    const entity = placed.find((p) => p.target === target);
    if (entity) {
      if (verb === 'collect') collect(engine, entity);
      else if (verb === 'deposit') {
        const res = depositFeeder(entity.row, engine.inv, arg, Number(countText) || 1, engine.learnedSkills);
        if (!res.ok) engine.toast(res.msg, 2200);
        else {
          engine.pushActivity(res.msg);
          entity.target.label = machineLabel(entity.row);
          emit(engine, 'piggy_feeder:deposit');
          lastAction = `deposit:${arg}:${res.count}`;
          engine.updateHud();
          engine.save();
        }
        publish(engine, true);
      } else if (verb === 'pickup') pickupPlaced(engine, entity);
      else if (verb === 'change_radius') {
        const i = STICK_RADIUS_CHOICES.findIndex((c) => c.value === Number(entity.row.distance || STICK_DISTANCE));
        const next = STICK_RADIUS_CHOICES[(i + 1 + STICK_RADIUS_CHOICES.length) % STICK_RADIUS_CHOICES.length];
        entity.row.distance = next.value;
        engine.toast(`How wide should I let the animals roam? ${next.label}.`, 2400);
        engine.save();
      }
      return true;
    }
    return true;
  },

  /** Name / Rename / Capture on the street's own animals (content.js lists those verbs). */
  runVerbOverride(target, verbId, engine) {
    if (!target || target.featureId) return null;
    if (!ANIMAL_CLASSES.has(target.classId)) return null;
    if (verbId === 'name' || verbId === 'rename') {
      if (!canNameAnimal(target.state || {}, namingCtx(engine))) return null;
      openNameModal(engine, target, verbId === 'name' ? 'Name Me!' : 'Rename Me!');
      return true;
    }
    if (verbId === 'capture' && target.classId === 'npc_piggy') {
      capture(engine, target);
      return true;
    }
    if (verbId === 'set_free' && canSetFree(target.classId)) {
      askSetFree(engine, target);
      return true;
    }
    return null;
  },

  packVerbs(classTsid, engine) {
    const inv = engine.inv;
    if (classTsid === 'plop') {
      return [
        { id: 'examine', label: 'Examine', enabled: true, primary: true, tooltip: PLOP.examineTooltip },
        { id: 'sniff', label: 'Sniff', enabled: (engine.pc.energy || 0) > 0, tooltip: PLOP.sniffTooltip },
        { id: 'taste', label: 'Taste', enabled: true, tooltip: PLOP.tasteTooltip },
      ];
    }
    if (classTsid === 'hogtied_piggy') {
      return [{ id: 'release', label: 'Release', enabled: !engine.transientInstance(), primary: true, tooltip: HERDKEEPING.releaseTooltip, reason: engine.transientInstance() ? "You can't do that here." : '' }];
    }
    if (BABY_ANIMALS[classTsid]) {
      const baby = BABY_ANIMALS[classTsid];
      const foods = babyFoodOptions(classTsid, inv);
      const progress = babyProgress(classTsid, inv);
      // isSad(): babies in your pack follow the place you stand (animal_sadness.js 10-16).
      const sad = isSadIn(classTsid, animalPlaceIsDepressing(engine));
      const out = [{
        id: 'feed',
        label: `Feed (${progress?.fed || 0}/${progress?.need || 1})`,
        enabled: !sad && foods.length > 0 && !engine.transientInstance(),
        reason: sad ? SAD_BABY[classTsid].feedReason : foods.length ? '' : baby.emptyMsg,
        primary: true,
        tooltip: baby.tooltip,
      }];
      if (baby.extraVerb) out.push({ id: baby.extraVerb.id, label: baby.extraVerb.label.replace(/^\w/, (c) => c.toUpperCase()), enabled: true, tooltip: baby.extraVerb.tooltip });
      return out;
    }
    if (MAGIC_STICKS[classTsid] || REMOTE_MACHINES[classTsid]) {
      const gate = MAGIC_STICKS[classTsid]
        ? stickPlaceState(classTsid, { learned: engine.learnedSkills, ownYard: isYard(engine), placed: slot(engine).sticks })
        : { enabled: isYard(engine), reason: REMOTE_MACHINES[classTsid].inoperable };
      return [{
        id: 'place',
        label: 'Place here',
        enabled: gate.enabled,
        reason: gate.reason,
        primary: true,
        tooltip: MAGIC_STICKS[classTsid] ? 'Stick it in the ground' : REMOTE_MACHINES[classTsid].placeTooltip,
      }];
    }
    return [];
  },

  runPackVerb(classTsid, verbId, engine) {
    const inv = engine.inv;
    if (classTsid === 'plop' && (inv.plop || 0) > 0) {
      if (verbId === 'examine') {
        const list = reconcilePackPlops(inv);
        const row = list.shift() || {};
        inv.plop -= 1;
        const res = examinePlop(row);
        inv[res.seedClass] = (inv[res.seedClass] || 0) + res.seedCount;
        engine.pushActivity(res.msg);
        engine.toast(res.msg, 2600);
        emit(engine, 'plop:inspect');
        emit(engine, 'plop:examine');
        lastAction = `examine:${res.seedClass}:${res.seedCount}`;
        engine.updateHud();
        engine.save();
      } else if (verbId === 'sniff') sniff(engine, 'pack');
      else if (verbId === 'taste') engine.pushActivity(PLOP.tasteMsg);
      publish(engine, true);
      return true;
    }
    if (classTsid === 'hogtied_piggy' && verbId === 'release') {
      releasePiggyHere(engine);
      return true;
    }
    if (BABY_ANIMALS[classTsid]) {
      const baby = BABY_ANIMALS[classTsid];
      const sad = isSadIn(classTsid, animalPlaceIsDepressing(engine));
      if (verbId === 'feed') {
        if (sad) {
          engine.toast(SAD_BABY[classTsid].feedReason, 2600);
          return true;
        }
        engine.openPicker(babyTarget(engine, classTsid), { id: 'feed', emptyMsg: baby.emptyMsg });
        return true;
      }
      if (baby.extraVerb && verbId === baby.extraVerb.id) {
        // chick.js smile_at / piglet.js hum_to have their own lines where the baby is sad.
        const v = sad && SAD_BABY[classTsid]?.extraVerb ? { ...baby.extraVerb, ...SAD_BABY[classTsid].extraVerb } : baby.extraVerb;
        // G300: piglet.js 108-134 and chick.js 104-114 change mood, then energy, through
        // metabolics_add_* / metabolics_lose_* (nothing lost or gained while dead).
        const mood = shiftMetabolic(engine.pc, 'mood', v.mood);
        const energy = shiftMetabolic(engine.pc, 'energy', v.energy);
        engine.pushActivity({ base: v.msg, effects: { energy, mood } });
        emit(engine, `${classTsid}:${v.id}`);
        engine.updateHud();
        return true;
      }
    }
    if ((MAGIC_STICKS[classTsid] || REMOTE_MACHINES[classTsid]) && verbId === 'place' && (inv[classTsid] || 0) > 0) {
      placeHere(engine, classTsid);
      return true;
    }
    return false;
  },

  save() {
    const pack = husbandryPack();
    return {
      plops: pack.plops,
      babies: pack.babies,
      hogtie: pack.hogtie,
      captures: pack.captures,
      captureCooldownUntil: pack.captureCooldownUntil,
    };
  },

  restore(slice) {
    normalizeHusbandryPack(slice || {});
  },

  /** QA / tests. */
  _state() {
    return { batterflies: batterflies.length, piles: piles.length, extras: extras.length, placed: placed.length, lastAction, generation };
  },
};
