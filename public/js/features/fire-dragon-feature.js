/**
 * Fire Dragons in the world (js/fire-dragon.js holds the rules).
 *
 * A street gets dragons only when its population asks (`npc_fire_dragon` in the
 * ecology row; the level builder's populate writes it). Each one roams the floor
 * the way the crabs do (crabs-feature.js): walk a few hundred px, stand a while,
 * turn at gaps and walls. The walk sheet plays at 10 fps; standing holds frame 1
 * and breathes. The art faces right, so a dragon walking left is mirrored.
 *
 * Each dragon's memory (the game day it was petted) lives in its street's feature
 * slot, so it persists with the world.
 *
 * QA: ?autostart=1&fresh=1&resetgame=1&questoffer=off&dragondemo=1 stands one beside
 * the player on any street; &dragondemo=2 (or 3) stands that many. &dragonautoplay=pet
 * pets the first. In a draft: populate --street k npc_fire_dragon=2.
 * Canvas: fireDragons, fireDragonLast, fireDragonPos, fireDragonMode.
 */

import { createSheetLoader, pixiSpeed } from '../sprite-sheets.js?v=10b5626e';
import { shiftMetabolic } from '../metabolics.js?v=8504134e';
import { getGameDayKey } from '../game-day.js?v=edb00566';
import { followPath } from '../street-creatures.js?v=6bfadcbf';
import { walkSurfaceY } from '../walk-surface.js?v=106bfdc5';
import {
  FIRE_DRAGON_CLASS,
  FIRE_DRAGON_COPY,
  FIRE_DRAGON_FEATURE_ID,
  FIRE_DRAGON_MAX,
  FIRE_DRAGON_PLACEMENT_KEY,
  FIRE_DRAGON_SHEET,
  FIRE_DRAGON_WALK,
  fireDragonPlacementGroups,
  fireDragonRest,
  fireDragonRoamTarget,
  fireDragonVerbs,
  fireDragonWalkSpeed,
  normalizeDragonMemory,
  petFireDragon,
} from '../fire-dragon.js?v=b7f3d751';

let loader = null;
let generation = 0;
/** { key, memory, sprite, target, mode, goDir, speed, destX, waitUntil, breath } */
let dragons = [];
let last = '';
let demoDone = false;

const now = () => Date.now();
const dayKey = () => getGameDayKey(now());

function memoryFor(engine, key) {
  const slot = engine.streetSlot(FIRE_DRAGON_FEATURE_ID);
  slot.dragons ||= {};
  slot.dragons[key] = normalizeDragonMemory(slot.dragons[key]);
  return slot.dragons[key];
}

function face(dragon, dir) {
  const s = Math.abs(dragon.sprite.scale.x) || 1;
  dragon.sprite.scale.x = dir === 'left' ? -s : s;
}

function stand(dragon, waitMs) {
  dragon.mode = 'idle';
  dragon.waitUntil = now() + waitMs;
  dragon.sprite.gotoAndStop(0);
}

function startWalking(engine, dragon) {
  const t = fireDragonRoamTarget(dragon.sprite.x, dragon.goDir, { l: 0, r: engine.worldW || 0 });
  if (!t.distance) return turn(dragon);
  dragon.mode = 'walk';
  dragon.destX = t.x;
  face(dragon, dragon.goDir);
  dragon.sprite.scale.y = 1;
  dragon.sprite.play();
}

function turn(dragon) {
  dragon.goDir = dragon.goDir === 'left' ? 'right' : 'left';
  stand(dragon, FIRE_DRAGON_WALK.stuckWaitMs);
}

function walk(engine, dragon, dtMs) {
  const spr = dragon.sprite;
  const dir = Math.sign(dragon.destX - spr.x);
  const step = Math.min(Math.abs(dragon.destX - spr.x), (dragon.speed * dtMs) / 1000);
  const nx = spr.x + dir * step;
  const feet = spr.y - FIRE_DRAGON_SHEET.feetPad;
  // It neither climbs nor jumps: a gap or a wall ends the walk.
  const y = walkSurfaceY(engine.platforms, nx, feet, { up: 24, down: 40 });
  if (y == null) return turn(dragon);
  spr.x = nx;
  spr.y = y + FIRE_DRAGON_SHEET.feetPad;
  if (Math.abs(dragon.destX - spr.x) < 0.5) {
    dragon.goDir = dragon.goDir === 'left' ? 'right' : 'left';
    stand(dragon, fireDragonRest());
  }
}

function spawn(engine, key, point) {
  const { PIXI } = engine;
  const frames = loader.frames(FIRE_DRAGON_SHEET);
  const spr = new PIXI.AnimatedSprite(frames.length ? frames : [PIXI.Texture.EMPTY]);
  spr.anchor.set(0.5, 1);
  spr.x = point.x;
  spr.y = point.y + FIRE_DRAGON_SHEET.feetPad;
  spr.zIndex = 40;
  spr.loop = true;
  spr.animationSpeed = pixiSpeed(FIRE_DRAGON_SHEET.fps);
  spr._worldHitW = 96;
  spr._worldHitH = 64;
  engine.entityLayer.addChild(spr);
  const dragon = {
    key,
    memory: memoryFor(engine, key),
    sprite: spr,
    target: null,
    mode: 'idle',
    goDir: Math.random() < 0.5 ? 'left' : 'right',
    speed: fireDragonWalkSpeed(),
    destX: point.x,
    waitUntil: 0,
    breath: Math.random() * Math.PI * 2,
  };
  dragon.target = engine.register({
    classId: FIRE_DRAGON_CLASS,
    featureId: FIRE_DRAGON_FEATURE_ID,
    label: FIRE_DRAGON_COPY.label,
    subtitle: FIRE_DRAGON_COPY.subtitle,
    sprite: spr,
    // Online a street's Fire Dragons are shared by place (street-objects-feature, sharedPath);
    // a demo dragon (demo<n>) never is.
    ...(/^\d{1,2}$/.test(String(key)) ? { dragonKey: `dragon:${key}`, state: {} } : {}),
  });
  face(dragon, dragon.goDir);
  stand(dragon, 1500 + Math.random() * 2000);
  dragons.push(dragon);
  return dragon;
}

/**
 * Online (slice 3 of research/plans/street-animals-shared.md): a street Fire Dragon walks the shared
 * path street-objects-feature gives it (js/street-creatures.js dragonWalkAt: its roam and rests from
 * the server's spot and clock, rolled from a seed every page shares), so everyone sees it in the same
 * place; a player at it or a pet holds it for everyone.
 */
function walkShared(engine, dragon, p, dtMs) {
  const spr = dragon.sprite;
  const dt = Math.max(1, dtMs / (1000 / 60));
  spr.x = followPath(spr.x, p.x, dt, 1.6);
  const feet = spr.y - FIRE_DRAGON_SHEET.feetPad;
  const y = walkSurfaceY(engine.platforms, spr.x, Number.isFinite(feet) ? feet : p.y0, { up: 24, down: 40 });
  if (y != null) spr.y = y + FIRE_DRAGON_SHEET.feetPad;
  const walking = p.pose === 'walk' && !p.held && now() >= (dragon.faceUntil || 0);
  if (now() >= (dragon.faceUntil || 0)) face(dragon, p.dir < 0 ? 'left' : 'right');
  if (walking && dragon.mode !== 'walk') {
    dragon.mode = 'walk';
    spr.scale.y = 1;
    spr.play();
  } else if (!walking) {
    if (dragon.mode !== 'idle') {
      dragon.mode = 'idle';
      spr.gotoAndStop(0);
    }
    dragon.breath += dtMs / 700;
    spr.scale.y = 1 + 0.015 * Math.sin(dragon.breath);
  }
}

function tick(engine, dtMs) {
  const t = now();
  for (const d of dragons) {
    if (!d.sprite || d.sprite.destroyed) continue;
    const shared = d.sprite._walkerPath?.();
    if (shared) {
      walkShared(engine, d, shared, dtMs);
      continue;
    }
    if (d.mode === 'walk') walk(engine, d, dtMs);
    else {
      // Standing: a slow breath, 1.5% taller at the top.
      d.breath += dtMs / 700;
      d.sprite.scale.y = 1 + 0.015 * Math.sin(d.breath);
      if (d.mode === 'idle' && t >= d.waitUntil && !engine.acting?.()) startWalking(engine, d);
    }
  }
}

function pet(engine, dragon) {
  const result = petFireDragon(dragon.memory, dayKey());
  if (!result) {
    last = 'pet:already';
    engine.pushActivity({ base: FIRE_DRAGON_COPY.pettedToday });
    return;
  }
  Object.assign(dragon.memory, result.memory);
  const mood = shiftMetabolic(engine.pc, 'mood', result.mood);
  // Face the player and stand a moment.
  face(dragon, (engine.player?.x ?? dragon.sprite.x) < dragon.sprite.x ? 'left' : 'right');
  stand(dragon, FIRE_DRAGON_WALK.menuWaitMs);
  dragon.faceUntil = now() + FIRE_DRAGON_WALK.menuWaitMs;
  // Online the street sees it, and the server holds it for everyone a moment.
  if (dragon.sprite._walkerPath) engine.query?.('sharedWalkerVerb', dragon.target, 'pet', engine);
  engine.pushActivity({ base: result.message, effects: mood ? { mood } : {} });
  engine.updateHud();
  engine.save();
  last = 'pet:ok';
}

function standDemo(engine) {
  const n = Math.min(FIRE_DRAGON_MAX, Math.max(1, Number(engine.param('dragondemo')) || 1));
  const p = engine.player;
  if (!p) return;
  for (let i = 0; i < n; i += 1) {
    const x = p.x + 160 + i * 140;
    const y = walkSurfaceY(engine.platforms, x, p.y, { up: 200, down: 400 }) ?? p.y;
    spawn(engine, `demo${i}`, { x, y });
  }
}

function publish(engine) {
  engine.setData('fireDragons', String(dragons.length));
  engine.setData('fireDragonLast', last);
  engine.setData('fireDragonMode', dragons.map((d) => d.mode).join(','));
  const s = dragons[0]?.sprite;
  engine.setData('fireDragonPos', s ? `${Math.round(s.x)},${Math.round(s.y)}` : '');
}

export const fireDragonFeature = {
  id: FIRE_DRAGON_FEATURE_ID,

  init(engine) {
    loader = createSheetLoader(engine.PIXI);
    publish(engine);
  },

  placementGroups(population) {
    return fireDragonPlacementGroups(population);
  },

  onStreetEnter(street, engine) {
    generation += 1;
    const mine = generation;
    const groups = fireDragonPlacementGroups(engine.population);
    const demo = engine.param('dragondemo') && !demoDone;
    if (!groups.length && !demo) return;
    loader.load(FIRE_DRAGON_SHEET).then(() => {
      if (mine !== generation) return;
      engine.placement(FIRE_DRAGON_PLACEMENT_KEY).forEach((p, i) => spawn(engine, String(i), p));
      if (demo) {
        demoDone = true;
        standDemo(engine);
        if (engine.param('dragonautoplay') === 'pet' && dragons.length) setTimeout(() => { pet(engine, dragons[0]); publish(engine); }, 1500);
      }
      publish(engine);
    });
  },

  onStreetClear() {
    generation += 1;
    dragons = [];
  },

  onTick(dtMs, t, engine) {
    if (dragons.length) tick(engine, dtMs);
    publish(engine);
  },

  verbsFor(target) {
    const d = dragons.find((x) => x.target === target);
    return d ? fireDragonVerbs(d.memory, dayKey()) : [];
  },

  runVerb(target, verbId, engine) {
    const d = dragons.find((x) => x.target === target);
    if (d && verbId === 'dragon_pet') pet(engine, d);
    publish(engine);
    return true;
  },

  /** Online: someone else petted this street Fire Dragon: it stops a moment here too. */
  walkerVerbSeen(target, verb) {
    const dragon = dragons.find((d) => d.target === target);
    if (!dragon || verb !== 'pet') return null;
    dragon.faceUntil = now() + FIRE_DRAGON_WALK.menuWaitMs;
    last = 'pet:seen';
    return true;
  },

  /** QA / tests. */
  _state() {
    return { dragons: dragons.map((d) => ({ key: d.key, x: d.sprite.x, y: d.sprite.y, mode: d.mode, memory: d.memory })), last };
  },
};
