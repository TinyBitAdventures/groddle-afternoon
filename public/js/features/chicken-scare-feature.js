/**
 * A Chicken you walk into may take fright: "Squawk!" and it is off into the air
 * (see js/feature-host.js; rules and every source line in js/chicken-scare.js).
 *
 * Each time the player comes into a Chicken's box (npc_chicken.js onPlayerCollision 1299-1343):
 * nothing from a rooked or an incubating one; a conversation it can offer is offered instead
 * (the conversations feature's tellerCollision, as for a Giant's Icon); otherwise three times in
 * four (one in four with Animal Kinship I) it says "Squawk!" for one second, the source's own
 * time (items/item.js sendBubble, speech `exact`), and flies: kicked up at 200 px/s and up to
 * 100 px/s either way, 'flying' for 2 s, 'flying_no_feathers' after, 'land' on the first floor
 * under it, walking on a second later from where it came down. A sad Chicken and one a player is
 * at (its menu, a verb) squawk and stay put (fly 821-823). No cooldown: the next touch rolls again.
 *
 * Every Chicken, wherever it is: a street's own, one you set free, raised or keep in the yard
 * (the animal-husbandry feature's; bound to a Magic Chicken Stick its kick is smaller, fly 872-876).
 * While it is up it is not squeezed or talked to (talk_to conditions 430, onStatus 1595).
 *
 * Online a street's Chickens walk a path every player shares (street-objects-feature), so a
 * scared one hops where it is instead of flying off, and the Squawk and the hop show on the
 * bumping player's screen only. The source sent both to everyone on the street; that needs the
 * server to pass the bump on, which is not built.
 *
 * QA: &chickenscareroll=<0-1> fixes the roll (0 always scares, 0.99 never);
 * &chickenscare=bump bumps the nearest Chicken 1.5 s after the street loads, =sad as a sad one
 * would take it (the Squawk, no flight). Canvas: chickenScareLast (<why>:<class index or id>),
 * chickenSquawks, chickenScareRolls, chickenFlying, chickenScareMode (flight | hop).
 */

import { createSheetLoader, pixiSpeed } from '../sprite-sheets.js?v=3fae7efb';
import { landingY, walkSurfaceY } from '../walk-surface.js?v=106bfdc5';
import { ANIMAL_PATROL } from '../street-ecology.js?v=c8d6fa5b';
import { forcedRoll } from '../animal-mood.js?v=a49495fc';
import { animalCrowdSad } from './animal-mood-feature.js?v=a56a8ce1';
import {
  CHICKEN_CLASS,
  CHICKEN_HOP,
  CHICKEN_SCARE,
  CHICKEN_SCARE_FPS,
  CHICKEN_SCARE_SHEETS,
  bumpChicken,
  chickenTouches,
  enterCollision,
  hopLift,
  kickChicken,
  landedRange,
  stepFlight,
} from '../chicken-scare.js?v=1df29bf0';

export const CHICKEN_SCARE_FEATURE_ID = 'chicken-scare';

/** Verbs a Chicken in the air does not take (npc_chicken.js talk_to conditions 430, onStatus 1595). */
export const FLYING_HIDDEN_VERBS = Object.freeze(['squeeze', 'talk_to']);
/** How long after a conversation offer a touch still counts as that same collision. */
const OFFER_WINDOW_MS = 3000;
/** A flight never leaves the street's ends by more than this. */
const EDGE_INSET = 20;
/** A flight that finds no floor this far under where it began goes back there. */
const LOST_DROP = 900;

let loader = null;
let sheetsAsked = false;
let inside = new WeakMap();
let offeredAt = new WeakMap();
/** target -> { flight, startX, startY, clip } */
let flights = new Map();
/** target -> { at } */
let hops = new Map();
let lastPlayer = null;
let squawks = 0;
let rolls = 0;
let lastEvent = '';
let lastMode = '';
let demoTimer = null;

function chickens(engine) {
  return (engine.interactables || []).filter((t) => t?.classId === CHICKEN_CLASS && t.sprite && !t.sprite.destroyed);
}

function nameOf(target) {
  return target.husbandryAnimal != null ? `own:${target.husbandryAnimal}` : String(target.classIndex ?? '?');
}

function birdScale(spr) {
  return Math.abs(Number(spr.baseScale) || Number(spr.scale?.y) || 1);
}

function clipFrames(name) {
  return loader ? loader.frames(CHICKEN_SCARE_SHEETS[name]) : [];
}

/** Whether the sprite still shows one of this feature's clips (another feature may have taken it). */
function showsOurs(spr, rec) {
  return Boolean(rec.frames) && spr.textures?.[0] === rec.frames[0];
}

function setClip(spr, rec, name, { loop = true, onComplete = null } = {}) {
  if (rec.frames && !showsOurs(spr, rec)) return;
  const frames = clipFrames(name);
  if (!frames.length || typeof spr.gotoAndPlay !== 'function') return;
  rec.frames = frames;
  spr.textures = frames;
  spr.loop = loop;
  spr.animationSpeed = pixiSpeed(CHICKEN_SCARE_FPS);
  spr.onComplete = onComplete;
  spr.gotoAndPlay(0);
}

/** The walk again, as game.js spawnChickens and the husbandry feature's sprites play it. */
function walkAgain(engine, spr, rec) {
  if (!showsOurs(spr, rec)) return;
  const walk = (engine.textures?.chickenWalk?.frames || []).slice(0, 6);
  if (!walk.length) return;
  spr.textures = walk;
  spr.loop = true;
  spr.animationSpeed = 0.12;
  spr.onComplete = null;
  spr.gotoAndPlay(0);
}

function face(spr, dir) {
  const s = birdScale(spr);
  spr.scale.x = (dir === 'left' ? -1 : 1) * s;
  spr.scale.y = s;
}

/** On a path the street shares (online): its place is everyone's. */
function onSharedPath(spr) {
  return typeof spr._path === 'function' || typeof spr._walkerPath === 'function';
}

function startFlight(engine, target) {
  const spr = target.sprite;
  const old = flights.get(target);
  const limited = engine.query?.('chickenStickBound', target, engine) === true;
  const flight = kickChicken({ x: spr.x, y: spr.y, limited });
  const rec = old || { startX: spr.x, startY: spr.y, frames: null };
  rec.flight = flight;
  flights.set(target, rec);
  spr._scareFlight = true;
  face(spr, flight.dir);
  setClip(spr, rec, 'flying');
  lastMode = 'flight';
}

function startHop(engine, target) {
  const spr = target.sprite;
  const rec = hops.get(target) || { frames: null };
  rec.at = Date.now();
  hops.set(target, rec);
  // One-shot with an onComplete, so the shared walk's poses leave it be (game.js walkPose).
  setClip(spr, rec, 'flying', { loop: false, onComplete: () => endHop(engine, target) });
  lastMode = 'hop';
}

function endHop(engine, target) {
  const rec = hops.get(target);
  if (!rec) return;
  hops.delete(target);
  const spr = target.sprite;
  if (!spr || spr.destroyed) return;
  spr.pivot.y = 0;
  walkAgain(engine, spr, rec);
}

function endFlight(engine, target, rec, { settle = true } = {}) {
  flights.delete(target);
  const spr = target.sprite;
  if (!spr || spr.destroyed) return;
  delete spr._scareFlight;
  if (!settle) return;
  walkAgain(engine, spr, rec);
  if (typeof spr.walkPose !== 'function') return; // one of yours: its own walk takes it from here
  // A street's own Chicken patrols from where it came down, as far as that floor goes.
  const sad = animalCrowdSad(target);
  spr.baseX = spr.x;
  if (sad) return;
  const surface = (x, y) => walkSurfaceY(engine.platforms, x, y, { up: 24, down: 24 });
  const range = landedRange(spr.x, spr.y - 2, surface, ANIMAL_PATROL.chickens);
  delete spr._pause;
  delete spr._nextPauseMs;
  if (range < 10) {
    // A perch too short to walk: it stands there (a creeping vx keeps its facing, as a held animal's).
    spr.range = 2;
    spr.vx = (rec.flight.dir === 'left' ? -1 : 1) * 1e-6;
    spr.walkPose('stand');
  } else {
    spr.range = range;
    spr.vx = (rec.flight.dir === 'left' ? -1 : 1) * 0.5;
  }
}

function stepFlights(engine, dtMs) {
  for (const [target, rec] of flights) {
    const spr = target.sprite;
    if (!spr || spr.destroyed) {
      flights.delete(target);
      continue;
    }
    // The Rook struck it in the air: it drops where it is and the rook feature has it.
    if (engine.query?.('targetRooked', target, engine)) {
      const floor = landingY(engine.platforms, spr.x, spr.y);
      if (floor != null) spr.y = floor + 2;
      endFlight(engine, target, rec, { settle: false });
      continue;
    }
    const f = rec.flight;
    const events = stepFlight(f, dtMs, {
      landY: (x, y) => landingY(engine.platforms, x, y),
      minX: EDGE_INSET,
      maxX: Math.max(EDGE_INSET, (Number(engine.worldW) || 0) - EDGE_INSET),
    });
    if (f.phase === 'air' && f.y > rec.startY + LOST_DROP) {
      // No floor under it at all: back where it took off.
      f.x = rec.startX;
      f.y = rec.startY - 2;
      f.vx = 0;
      f.vy = 0;
      f.phase = 'landed';
      f.landedMs = 0;
      events.push('landed');
    }
    spr.x = f.x;
    spr.y = f.phase === 'air' ? f.y : f.y + 2;
    if (events.includes('no_feathers')) setClip(spr, rec, 'flying_no_feathers');
    if (events.includes('landed')) setClip(spr, rec, 'land', { loop: false });
    if (events.includes('done')) endFlight(engine, target, rec);
  }
}

function stepHops(engine) {
  const now = Date.now();
  for (const [target, rec] of hops) {
    const spr = target.sprite;
    if (!spr || spr.destroyed) {
      hops.delete(target);
      continue;
    }
    const ms = now - rec.at;
    if (ms >= CHICKEN_HOP.ms) {
      endHop(engine, target);
      continue;
    }
    spr.pivot.y = hopLift(ms) / (Math.abs(spr.scale.y) || 1);
  }
}

/** onPlayerCollision for one Chicken the player just came into. `force`: QA ('scared' | 'sad'). */
function bump(engine, target, force = '') {
  const spr = target.sprite;
  const ctx = force
    ? { sad: force === 'sad', learned: [] }
    : {
      rooked: Boolean(engine.query?.('targetRooked', target, engine)),
      incubating: Boolean(target.state?.incubatingEgg),
      offered: Date.now() - (offeredAt.get(target) || 0) < OFFER_WINDOW_MS,
      sad: animalCrowdSad(target),
      waiting: Boolean(engine.actingOn?.(target)),
      learned: engine.learnedSkills,
    };
  const rng = force ? () => 0 : forcedRoll(engine.param?.('chickenscareroll'));
  const res = bumpChicken(ctx, rng);
  if (res.why === 'scared' || res.why === 'calm' || res.why === 'sad' || res.why === 'waiting') rolls += 1;
  lastEvent = `${res.why}:${nameOf(target)}`;
  if (res.squawk) {
    squawks += 1;
    // sendBubble('Squawk!', 1*1000): the source's own time, used as given (G629).
    engine.say(target, CHICKEN_SCARE.line, CHICKEN_SCARE.lineMs, { exact: true });
    engine.achievement?.(CHICKEN_SCARE.counter);
  }
  if (res.fly) {
    if (onSharedPath(spr)) startHop(engine, target);
    else startFlight(engine, target);
  }
  publish(engine);
  return res;
}

function checkCollisions(engine) {
  const p = engine.player;
  if (!p || !engine.started) return;
  // The player's move runs the test (main.js doXYMove, pc.apiSetXY).
  const moved = lastPlayer != null && (Math.abs(p.x - lastPlayer.x) > 0.01 || Math.abs(p.y - lastPlayer.y) > 0.01);
  lastPlayer = { x: p.x, y: p.y };
  const scale = engine.query?.('avatarBodyScale', engine) ?? 1;
  for (const target of chickens(engine)) {
    const spr = target.sprite;
    // The offer comes first in the same collision and takes it (1320-1326). The conversations
    // feature keeps its own box and way in, and checks on while dev QA has the player stand there.
    if (engine.query?.('tellerCollision', target, engine) === true) offeredAt.set(target, Date.now());
    if (!moved) continue;
    const touching = chickenTouches({ x: spr.x, y: spr.y }, { x: p.x, y: p.y }, { scale, birdScale: birdScale(spr) });
    if (enterCollision(inside, target, touching)) bump(engine, target);
  }
}

function publish(engine) {
  engine.setData?.('chickenScareLast', lastEvent);
  engine.setData?.('chickenSquawks', String(squawks));
  engine.setData?.('chickenScareRolls', String(rolls));
  engine.setData?.('chickenFlying', String(flights.size + hops.size));
  engine.setData?.('chickenScareMode', lastMode);
}

function setupDemo(engine) {
  const mode = String(engine.param?.('chickenscare') || '');
  if (mode !== 'bump' && mode !== 'sad') return;
  clearTimeout(demoTimer);
  const tryBump = (tries) => {
    const p = engine.player;
    const list = chickens(engine);
    if (!p || !list.length || !engine.started) {
      if (tries > 0) demoTimer = setTimeout(() => tryBump(tries - 1), 500);
      return;
    }
    const nearest = list.reduce((a, b) => (Math.abs(b.sprite.x - p.x) < Math.abs(a.sprite.x - p.x) ? b : a));
    bump(engine, nearest, mode === 'sad' ? 'sad' : 'scared');
  };
  demoTimer = setTimeout(() => tryBump(40), 1500);
}

export const chickenScareFeature = {
  id: CHICKEN_SCARE_FEATURE_ID,

  init(engine) {
    loader = createSheetLoader(engine.PIXI);
    publish(engine);
  },

  onStreetEnter(_street, engine) {
    if (!sheetsAsked && loader) {
      sheetsAsked = true;
      loader.loadAll(Object.values(CHICKEN_SCARE_SHEETS));
    }
    lastPlayer = null;
    setupDemo(engine);
    publish(engine);
  },

  onStreetClear() {
    clearTimeout(demoTimer);
    inside = new WeakMap();
    offeredAt = new WeakMap();
    flights = new Map();
    hops = new Map();
    lastPlayer = null;
  },

  onTick(dtMs, _now, engine) {
    const up = flights.size + hops.size;
    if (flights.size) stepFlights(engine, dtMs);
    if (hops.size) stepHops(engine);
    checkCollisions(engine);
    if (up !== flights.size + hops.size) publish(engine);
  },

  /** A Chicken in the air is not squeezed or talked to. */
  decorateVerbs(target, verbs) {
    if (!flights.has(target) || !Array.isArray(verbs)) return null;
    return verbs.filter((v) => !FLYING_HIDDEN_VERBS.includes(v?.id));
  },

  debug() {
    return { flights: flights.size, hops: hops.size, squawks, rolls, lastEvent, lastMode };
  },
};
