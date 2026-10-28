/**
 * Fox Brushing Preserves as a feature module (see js/feature-host.js).
 *
 * Rules live in js/foxes.js; this file binds them to the world: the Fox
 * Ranger at each preserve entrance (greeting, license sale, tips, store 22,
 * and the entrance gate), the pack-side Ignite verb on Fox Bait, three baits
 * falling from the sky, a wild Fox that runs between the archived Fox Stop
 * Markers and baits at 500 px/s, and the Brush verb with the original
 * success, yield, wear, and badge rules.
 *
 * Population: the archived location XML gives each preserve one Fox Ranger,
 * 4-7 Fox Stop Markers, and one fox spawner (assets/content/street-ecology.json
 * `wildlife`, 51 rangers / 278 markers in all). Item coordinates were not
 * archived, so the Ranger stands just inside the street's one entrance and
 * the markers spread evenly across the preserve (js/foxes.js preserveLayout).
 * On preserves the fox spawner is removed from the roaming-animal inference.
 *
 * Art: recovered CC0 OGA sheets under assets/sprites/foxes/ (orange and silver
 * Fox run/pause/eat/brushed, Ranger idle/talk, bait drop/stink, brush hit/miss),
 * sliced on their exact cells. No fox sound files survive, so verbs reuse the
 * recovered pet/pickup cues.
 *
 * QA: ?autostart=1&fresh=1&foxdemo=1 grants a demo license, a Fox Brush, and
 * five Fox Bait, lays three baits around the player, and lets a Fox loose
 * beside them; &foxautoplay=1 brushes it three times inside ten seconds
 * (Fleet Foxer). &foxdemo=bait grants the same kit with no fox or baits, for
 * the real Ignite loop on a preserve (&foxautoplay=ignite ignites once).
 * &foxdemo=ranger stands an unlicensed Ranger beside the player
 * for the conversation; &foxautoplay=license walks the whole license sale.
 * Combine with &streetdemo=GA53N05IG9S2BLR (Gyerean Park) for a real preserve.
 * Canvas data: foxPreserve, foxRanger, foxMarkers, foxCount, foxState, foxX,
 * foxBaits, foxLicense, foxLastBrush, foxFibers, foxBrush, foxHubs, foxDemo,
 * foxRangerTalk; multiplayer foxMp (server foxes:baits) and foxFlurry.
 *
 * Multiplayer (G329, js/foxes-mp.js): the realtime server's foxes.go owns each
 * preserve's foxes and baits, so the players there see the same foxes. An
 * ignite sends fox_ignite (the server drops the three baits for everyone and
 * spawns the fox, one per three players on the street); a brush still pays the
 * brusher here and sends fox_brush (the server sends the fox away after three
 * brushers or 21 brushes); the first game to see a fox reach a bait eats it for
 * everyone; a spawn among three foxes counts fox / three_or_more (Fox
 * Flurrier); eight players past the Ranger close the preserve. Solo is
 * unchanged.
 */

import { slugsFromEffects } from '../speech-slugs.js?v=g412-1';
import { addItem, countItem, removeItem } from '../inventory.js?v=catalog-unified-7';
import { getToolCondition } from '../tools.js?v=woodcutting-test-8';
import { worldToScreen } from '../street-model.js';
import { OVERLAY_USES, playOverlay } from '../overlays.js?v=g392-1';
import { createSheetLoader, pixiSpeed } from '../sprite-sheets.js?v=g405-1';
import { nearestSurfaceY, walkSurfaceY } from '../walk-surface.js';
import { loadWildlifeCatalog, wildlifeCatalog, wildlifeFor } from '../wildlife.js';
import {
  FIBER_ID,
  FLEET_FOXER_ACHIEVEMENT,
  FOX_BAIT_ID,
  FOX_BRUSH_ID,
  FOX_ID,
  FOX_LICENSE,
  FOX_LICENSE_ACHIEVEMENT,
  FOX_RANGER_ID,
  FOX_RANGER_TEXT,
  FOX_TEXT,
  FOX_TIMING,
  FOX_TOURIST_ACHIEVEMENT,
  baitDropPlan,
  baitIgniteGate,
  brushFox,
  canSpawnFox,
  createFox,
  ensureFoxItems,
  fillName,
  foxBrushingPackage,
  foxRangerStoreProfile,
  insideSign,
  normalizeFoxSlice,
  noteFoxHub,
  preserveLayout,
  rangerGateReason,
  rangerGreeting,
  splitConversation,
  stepFox,
} from '../foxes.js?v=g414-1';
import { FOX_FLURRY_COUNTER, igniteBaitXs, normalizeBaits, normalizeFoxes, preserveOverCapacity, serverId } from '../foxes-mp.js?v=g414-1';

export const FOX_FEATURE_ID = 'foxes';
const PLAYER_NAME = 'Glitch';
const FOX_SCALE = 0.95;
const RANGER_SCALE = 1.3;
const BAIT_SCALE = 0.9;
const REACH_X = 300;
const REACH_Y = 220;
const Z = Object.freeze({ ranger: 19, bait: 21, fox: 23 });

const DIR = 'assets/sprites/foxes/';
const sheet = (name, fw, fh, cols, frames, first = 0) => Object.freeze({ path: `${DIR}${name}.png`, fw, fh, cols, frames, first });

/** Exact OGA cells (measured): Fox 153×139, Ranger 62×105, bait 41×144, brush 105×80. */
export const FOX_SHEETS = Object.freeze({
  orange: Object.freeze({
    run: sheet('fox-orange-run', 153, 139, 6, 12),
    pause: sheet('fox-orange-pause', 153, 139, 6, 56),
    eatStart: sheet('fox-orange-eatStart', 153, 139, 5, 10),
    eat: sheet('fox-orange-eat', 153, 139, 5, 20),
    eatEnd: sheet('fox-orange-eatEnd', 153, 139, 5, 20),
    brushed: sheet('fox-orange-brushed', 153, 139, 2, 2),
  }),
  silver: Object.freeze({
    run: sheet('fox-silver-run', 153, 139, 6, 12),
    pause: sheet('fox-silver-pause', 153, 139, 6, 56),
    eatStart: sheet('fox-silver-eatStart', 153, 139, 5, 10),
    eat: sheet('fox-silver-eat', 153, 139, 5, 20),
    eatEnd: sheet('fox-silver-eatEnd', 153, 139, 5, 20),
    brushed: sheet('fox-silver-brushed', 153, 139, 2, 2),
  }),
  ranger: Object.freeze({
    idle0: sheet('ranger-idle0', 62, 105, 1, 1),
    idle1: sheet('ranger-idle1', 62, 105, 9, 9),
    idle2: sheet('ranger-idle2', 62, 105, 15, 90),
    talk: sheet('ranger-talk', 62, 105, 15, 90),
  }),
  bait: Object.freeze({
    bait1: sheet('bait-bait1', 41, 144, 1, 1),
    bait2: sheet('bait-bait2', 41, 144, 1, 1),
    bait3: sheet('bait-bait3', 41, 144, 1, 1),
    stink1: sheet('bait-stink1', 41, 144, 21, 42),
    stink2: sheet('bait-stink2', 41, 144, 22, 43),
    stink3: sheet('bait-stink3', 41, 144, 21, 42),
  }),
  brush: Object.freeze({
    hit: sheet('brush-hit', 105, 80, 6, 12),
    miss: sheet('brush-miss', 105, 80, 6, 12),
  }),
});

/** Feet rows inside each cell (alpha-scanned unions): Fox 128/139, Ranger 104/105, bait 141/144. */
const ANCHOR = Object.freeze({ fox: [0.5, 129 / 139], ranger: [0.5, 1], bait: [0.5, 142 / 144], brush: [0.5, 0.5] });

const FOX_CLIP = Object.freeze({ run: 'run', idle: 'run', pause: 'pause', eatStart: 'eatStart', eat: 'eat', eatEnd: 'eatEnd' });
const LOOPING = new Set(['run', 'eat']);

// ---------------------------------------------------------------------------
// Pure helpers (tests/foxes-feature.test.js)
// ---------------------------------------------------------------------------

/** A preserve is any street whose archived items include a Fox Ranger. */
export function isPreserveRow(row) {
  return Number(row?.npc_fox_ranger) > 0;
}

/**
 * ecologyOverride: the preserve's one spawner is the fox spawner, so it must
 * not also be read as a roaming piggy/chicken/butterfly spawner.
 */
export function preserveEcologyEntry(entry, row) {
  if (!entry || !isPreserveRow(row)) return null;
  const spawners = Math.max(0, Math.floor(Number(entry.spawners) || 0) - Number(row.npc_fox_ranger));
  const next = { ...entry };
  if (spawners) next.spawners = spawners;
  else delete next.spawners;
  return next;
}

/** Screen-space entrance x: the preserve's (first) signpost, else the nearer street end. */
export function entranceScreenX(street, worldW) {
  const sp = Array.isArray(street?.signposts) ? street.signposts[0] : null;
  if (sp && street?.bounds) return worldToScreen(street, sp.x, sp.y).x;
  return Math.min(200, worldW / 2);
}

export function inReach(fox, player) {
  return Math.abs(fox.x - player.x) <= REACH_X && Math.abs(fox.y - player.y) <= REACH_Y;
}

// ---------------------------------------------------------------------------
// Runtime state
// ---------------------------------------------------------------------------

let slice = normalizeFoxSlice();
let loader = null;
let generation = 0;
let preserve = null; // { facing, rangerX, rangerY, spawnerX, spawnerY, markers, inside, demo }
let ranger = null; // { sprite, target, clip, nextIdleAt, greeted, conversated, inBox, talking }
let foxes = []; // { fox, skin, sprite, target, clip, flashUntil }
let baits = []; // { id, x, y, startY, variant, bornAt, landAt, expireAt, sprite, landed }
let effects = [];
let pendingSpawnAt = 0;
let pendingDrops = [];
let lastBrushMs = null;
let lastBrush = '';
let lastTalk = '';
let demoLicensed = false;
let demoMode = '';
let demoUsed = false;
let autoplayTimers = [];
let pendingHandoff = null;
let handoffAt = 0;
let publishAt = 0;
let spawnCount = 0;
let baitSeq = 0;
let shopOpened = false;
// G329 multiplayer: the server's foxes and baits on this preserve (foxes.go), or null in solo.
let mp = null;

function rng() {
  return Math.random();
}

function licensed(engine) {
  return demoLicensed || engine.unlockedAchievements.includes(FOX_LICENSE_ACHIEVEMENT);
}

function sheetsNeeded() {
  return [
    ...Object.values(FOX_SHEETS.orange),
    ...Object.values(FOX_SHEETS.silver),
    ...Object.values(FOX_SHEETS.ranger),
    ...Object.values(FOX_SHEETS.bait),
    ...Object.values(FOX_SHEETS.brush),
  ];
}

function surfaceFn(engine) {
  const platforms = engine.platforms;
  return (x, y) => walkSurfaceY(platforms, x, y, { up: 46, down: 80 });
}

function worldFor(engine) {
  return {
    geo: { l: 0, r: engine.worldW },
    baits: baits.map((b) => ({ id: b.id, x: b.x })),
    markers: preserve?.markers || [],
    rangerX: preserve?.rangerX ?? null,
    spawnerX: preserve?.spawnerX ?? null,
    surfaceY: surfaceFn(engine),
  };
}

// ---------------------------------------------------------------------------
// Views
// ---------------------------------------------------------------------------

function animated(engine, def, { loop = true, fps = 30 } = {}) {
  const frames = loader.frames(def);
  const spr = new engine.PIXI.AnimatedSprite(frames.length ? frames : [engine.PIXI.Texture.EMPTY]);
  spr.loop = loop;
  spr.animationSpeed = pixiSpeed(fps);
  spr.play();
  return spr;
}

function setClip(engine, sprite, def, { loop = true, fps = 30 } = {}) {
  const frames = loader.frames(def);
  if (!frames.length) return;
  sprite.textures = frames;
  sprite.loop = loop;
  sprite.animationSpeed = pixiSpeed(fps);
  sprite.gotoAndPlay(0);
}

function buildRanger(engine) {
  if (!preserve || !Number.isFinite(preserve.rangerX)) return;
  const spr = animated(engine, FOX_SHEETS.ranger.idle0, { loop: false });
  spr.anchor.set(...ANCHOR.ranger);
  spr.scale.set(RANGER_SCALE * (preserve.facing === 'left' ? -1 : 1), RANGER_SCALE);
  spr.x = preserve.rangerX;
  spr.y = preserve.rangerY + 2;
  spr.zIndex = Z.ranger;
  spr._worldHitW = 56;
  spr._worldHitH = 96;
  engine.entityLayer.addChild(spr);
  const target = engine.register({
    classId: FOX_RANGER_ID,
    featureId: FOX_FEATURE_ID,
    label: 'Fox Ranger',
    subtitle: 'Guardian of the Fox Preserve',
    sprite: spr,
  });
  const px = engine.player?.x ?? 0;
  ranger = {
    sprite: spr,
    target,
    clip: 'idle0',
    nextIdleAt: Date.now() + 2500,
    greeted: false,
    conversated: false,
    inBox: Math.abs(px - preserve.rangerX) <= FOX_TIMING.rangerHitBoxW / 2,
    talking: false,
  };
}

function rangerClip(engine, clip, loop = false) {
  if (!ranger || ranger.clip === clip) return;
  ranger.clip = clip;
  setClip(engine, ranger.sprite, FOX_SHEETS.ranger[clip], { loop });
}

function buildFoxView(engine, entity) {
  const defs = FOX_SHEETS[entity.skin];
  const spr = animated(engine, defs.run);
  spr.anchor.set(...ANCHOR.fox);
  spr.zIndex = Z.fox;
  spr._worldHitW = 118 * FOX_SCALE;
  spr._worldHitH = 56 * FOX_SCALE;
  engine.entityLayer.addChild(spr);
  entity.sprite = spr;
  entity.clip = 'run';
  entity.target = engine.register({
    classId: FOX_ID,
    featureId: FOX_FEATURE_ID,
    label: 'Fox',
    subtitle: 'Sly, cunning, and quick',
    sprite: spr,
    foxId: entity.fox.id,
  });
  placeFox(engine, entity);
}

function placeFox(engine, entity) {
  const { fox, sprite } = entity;
  if (!sprite || sprite.destroyed) return;
  sprite.x = fox.x;
  sprite.y = fox.y + 2;
  // The art faces left.
  sprite.scale.set(FOX_SCALE * (fox.dir === 'right' ? -1 : 1), FOX_SCALE);
  const now = Date.now();
  const want = now < entity.flashUntil ? 'brushed' : FOX_CLIP[fox.state] || 'run';
  if (want !== entity.clip) {
    entity.clip = want;
    setClip(engine, sprite, FOX_SHEETS[entity.skin][want], { loop: LOOPING.has(want) || want === 'brushed', fps: want === 'brushed' ? 12 : 30 });
  }
  if (fox.leaving) sprite.alpha = Math.max(0.35, sprite.alpha - 0.004);
}

function buildBaitView(engine, bait) {
  const spr = animated(engine, FOX_SHEETS.bait[`bait${bait.variant}`], { loop: false });
  spr.anchor.set(...ANCHOR.bait);
  spr.scale.set(BAIT_SCALE);
  spr.zIndex = Z.bait;
  spr.x = bait.x;
  spr.y = bait.startY;
  engine.entityLayer.addChild(spr);
  bait.sprite = spr;
}

function landBait(engine, bait) {
  bait.landed = true;
  if (!bait.sprite || bait.sprite.destroyed) return;
  bait.sprite.y = bait.y + 2;
  setClip(engine, bait.sprite, FOX_SHEETS.bait[`stink${bait.variant}`], { loop: true, fps: 30 });
  engine.playSound('FOX_BAIT_LAND', { volume: 0.5 });
}

function removeBait(bait) {
  if (bait.sprite && !bait.sprite.destroyed) {
    bait.sprite.parent?.removeChild(bait.sprite);
    bait.sprite.destroy();
  }
  baits = baits.filter((b) => b !== bait);
}

function removeFox(engine, entity) {
  if (entity.target) engine.unregister(entity.target);
  else if (entity.sprite && !entity.sprite.destroyed) entity.sprite.destroy();
  foxes = foxes.filter((e) => e !== entity);
}

function addEffect(engine, display, update) {
  engine.fxLayer.addChild(display);
  effects.push({ display, update, t: 0 });
}

function brushFx(engine, x, y, kind = 'hit') {
  const spr = animated(engine, FOX_SHEETS.brush[kind], { loop: false });
  spr.anchor.set(...ANCHOR.brush);
  spr.x = x;
  spr.y = y - 46;
  spr.onComplete = () => {
    spr.visible = false;
  };
  addEffect(engine, spr, (fx) => fx.t > 700);
}

/**
 * G373 fox_bait.js 127-138: Tiny Speck's fox_bait_ignite, a 150 x 150 pc_overlay for 4 s, locking,
 * delta_x 60 toward the way the avatar faces (pc.s < 0: -60), delta_y -80.
 */
function igniteFx(engine) {
  const player = engine.player;
  if (!player) return;
  const use = OVERLAY_USES.fox_bait_ignite;
  const side = player.scale?.x < 0 ? -1 : 1;
  playOverlay(engine.PIXI, 'fox_bait_ignite', {
    layer: engine.fxLayer || engine.entityLayer,
    at: () => ({ x: player.x + side * use.dx, y: player.y + use.dy }),
    wh: use.wh,
    durationMs: use.durationMs,
    loop: false,
  });
  engine.setData?.('foxBaitIgnite', 'fox_bait_ignite');
}

function tickEffects(dtMs) {
  for (const fx of [...effects]) {
    fx.t += dtMs;
    const done = fx.update(fx) === true || fx.display.destroyed;
    if (!done) continue;
    if (!fx.display.destroyed) {
      fx.display.parent?.removeChild(fx.display);
      fx.display.destroy({ children: true });
    }
    effects = effects.filter((e) => e !== fx);
  }
}

function clearEffects() {
  for (const fx of effects) {
    if (!fx.display.destroyed) {
      fx.display.parent?.removeChild(fx.display);
      fx.display.destroy({ children: true });
    }
  }
  effects = [];
}

// ---------------------------------------------------------------------------
// Foxes and bait
// ---------------------------------------------------------------------------

function spawnFoxAt(engine, x, y, dir = 'left', sid = '') {
  spawnCount += 1;
  const fox = createFox({ id: sid ? `fox:${sid}` : `fox:${spawnCount}`, x, y, dir });
  fox.state = 'idle'; // startMoving on the first tick
  // Multiplayer: the server's fox number picks the coat, so every game draws the same fox.
  const seq = sid ? parseInt(sid.slice(2), 36) || 1 : spawnCount;
  const entity = {
    serverId: sid,
    fox,
    skin: seq % 4 === 0 ? 'silver' : 'orange',
    sprite: null,
    target: null,
    clip: '',
    flashUntil: 0,
  };
  foxes.push(entity);
  buildFoxView(engine, entity);
  return entity;
}

function spawnFox(engine) {
  if (!preserve || !canSpawnFox(foxes.length, 1)) return null;
  const y = nearestSurfaceY(engine.platforms, preserve.spawnerX, preserve.spawnerY) ?? preserve.spawnerY;
  const entity = spawnFoxAt(engine, preserve.spawnerX, y, 'left');
  engine.pushActivity(FOX_TEXT.appears);
  engine.toast(FOX_TEXT.appears, 1800);
  engine.floatText(preserve.spawnerX, y - 120, 'A fox appears!', 0xffd27a);
  return entity;
}

function dropBaits(engine, drop) {
  const plan = baitDropPlan(drop.x, rng);
  const now = Date.now();
  for (const row of plan) {
    const x = Math.max(60, Math.min(engine.worldW - 60, row.x));
    const y = nearestSurfaceY(engine.platforms, x, drop.y) ?? drop.y;
    baitSeq += 1;
    const bait = {
      id: `bait:${baitSeq}`,
      x,
      y,
      startY: drop.y - FOX_TIMING.baitDropHeight,
      variant: row.variant,
      bornAt: now,
      landAt: now + FOX_TIMING.baitLandMs,
      expireAt: now + FOX_TIMING.baitExpireMs,
      sprite: null,
      landed: false,
    };
    baits.push(bait);
    buildBaitView(engine, bait);
  }
}

function placeDemoBaits(engine) {
  const p = engine.player;
  const now = Date.now();
  for (const [dx, variant] of [[260, 1], [560, 2], [-460, 3]]) {
    const x = Math.max(60, Math.min(engine.worldW - 60, p.x + dx));
    const y = nearestSurfaceY(engine.platforms, x, p.y) ?? p.y;
    baitSeq += 1;
    const bait = { id: `bait:${baitSeq}`, x, y, startY: y, variant, bornAt: now, landAt: now, expireAt: now + FOX_TIMING.baitExpireMs, sprite: null, landed: false };
    baits.push(bait);
    buildBaitView(engine, bait);
    landBait(engine, bait);
  }
}

function tickBaits(engine, now) {
  for (const bait of [...baits]) {
    if (now >= bait.expireAt) {
      removeBait(bait);
      continue;
    }
    if (bait.landed) continue;
    const t = Math.min(1, (now - bait.bornAt) / FOX_TIMING.baitLandMs);
    if (bait.sprite && !bait.sprite.destroyed) bait.sprite.y = bait.startY + (bait.y - bait.startY) * t * t;
    if (t >= 1) landBait(engine, bait);
  }
}

function tickFoxes(engine, dtMs, now) {
  if (!foxes.length) return;
  const world = worldFor(engine);
  for (const entity of [...foxes]) {
    const events = stepFox(entity.fox, dtMs, world, rng);
    for (const ev of events) {
      if (ev.type === 'eat') {
        const bait = baits.find((b) => b.id === ev.baitId);
        if (bait && mp && entity.serverId && bait.serverId) {
          // The first game to see a fox reach a bait eats it for everyone (foxes.go fox_eat).
          mp.client.send('fox_eat', { fox: entity.serverId, bait: bait.serverId });
          mp.baits.delete(bait.serverId);
        }
        if (bait) removeBait(bait);
        world.baits = baits.map((b) => ({ id: b.id, x: b.x }));
        engine.playSound('FOX_EAT', { volume: 0.45 });
      } else if (ev.type === 'leave') {
        engine.pushActivity(ev.reason);
      } else if (ev.type === 'despawn') {
        removeFox(engine, entity);
        if (mp && entity.serverId) {
          // Off this screen; the server says when it has gone (fox_gone) and when another comes.
          mp.departed.add(entity.serverId);
        } else if (baits.length && !pendingSpawnAt && entity.fox.brushCount > 0) {
          pendingSpawnAt = now + FOX_TIMING.respawnAfterLeaveMs;
        }
      }
    }
    if (foxes.includes(entity)) placeFox(engine, entity);
  }
}

// ---------------------------------------------------------------------------
// Multiplayer (G329): the server's foxes and baits (foxes.go)
// ---------------------------------------------------------------------------

/**
 * In multiplayer the realtime server owns how many foxes a preserve has and
 * where its baits lie (inc_npcs.js spawn_fox: one fox per three players; a
 * fourth among ten counts Fox Flurrier). This game draws them and runs each
 * fox along the street with the solo rules; mp.foxes / mp.baits are the
 * server's word and mpReconcile makes the street match it.
 */
function mpSession(engine) {
  const client = engine.query?.('realtimeClient');
  if (!client) return null;
  mp = { client, foxes: new Map(), baits: new Map(), departed: new Set(), refundAt: 0, nextSync: 0 };
  const dirty = () => { mp.nextSync = 0; };
  client.on('msg:fox_state', (msg) => {
    mp.foxes = new Map(normalizeFoxes(msg.foxes).map((f) => [f.id, { leaving: f.leaving }]));
    mp.baits = new Map(normalizeBaits(msg.baits).map((b) => [b.id, { x: b.x, dropAt: 0 }]));
    mp.departed.clear();
    dirty();
  });
  client.on('msg:fox_baits', (msg) => {
    // dropFoxBaits 2 s after the ignite, each landing 1 s later (location.js:4347-4362).
    const at = Date.now() + FOX_TIMING.baitDropDelayMs;
    for (const b of normalizeBaits(msg.baits)) mp.baits.set(b.id, { x: b.x, dropAt: at });
    if (Number(msg.by) === Number(client.me?.id)) mp.refundAt = 0;
    dirty();
  });
  client.on('msg:fox_bait_gone', (msg) => {
    mp.baits.delete(serverId(msg.bait));
    dirty();
  });
  client.on('msg:fox_spawn', (msg) => {
    const id = serverId(msg.fox);
    if (!id) return;
    mp.foxes.set(id, { leaving: false, fresh: true });
    dirty();
  });
  client.on('msg:fox_leave', (msg) => {
    const f = mp.foxes.get(serverId(msg.fox));
    if (!f) return;
    f.leaving = true;
    if (msg.text && preserve) engine.pushActivity(String(msg.text));
    dirty();
  });
  client.on('msg:fox_gone', (msg) => {
    const id = serverId(msg.fox);
    mp.foxes.delete(id);
    mp.departed.delete(id);
    dirty();
  });
  client.on('msg:fox_flurry', () => {
    // inc_npcs.js:153-155: achievements_increment('fox', 'three_or_more') for everyone on the street.
    engine.achievement?.(FOX_FLURRY_COUNTER, 1);
    engine.setData?.('foxFlurry', String(Date.now()));
  });
  client.on('error', ({ code, message }) => {
    if (code !== 'fox') return;
    if (mp.refundAt && Date.now() < mp.refundAt) {
      // The server refused the ignite: the bait is still yours.
      addItem(engine.inv, FOX_BAIT_ID, 1);
      engine.refreshPack();
      engine.save();
    }
    mp.refundAt = 0;
    if (message) engine.toast(String(message), 2600);
  });
  return mp;
}

function mpForget() {
  mp.foxes.clear();
  mp.baits.clear();
  mp.departed.clear();
  mp.nextSync = 0;
}

/** Make this street's foxes and baits match the server's (and drop baits whose time has come). */
function mpReconcile(engine, now) {
  if (!mp || !preserve) return;
  let next = Infinity;
  const localBait = new Map(baits.filter((b) => b.serverId).map((b) => [b.serverId, b]));
  for (const bait of [...baits]) if (bait.serverId && !mp.baits.has(bait.serverId)) removeBait(bait);
  for (const [id, b] of mp.baits) {
    if (localBait.has(id)) continue;
    if (b.dropAt > now) {
      next = Math.min(next, b.dropAt);
      continue;
    }
    const fresh = b.dropAt > 0 && now - b.dropAt < FOX_TIMING.baitLandMs;
    const x = Math.max(60, Math.min(engine.worldW - 60, b.x));
    const y = nearestSurfaceY(engine.platforms, x, preserve.spawnerY) ?? preserve.spawnerY;
    baitSeq += 1;
    const bait = {
      id: `bait:${baitSeq}`,
      serverId: id,
      x,
      y,
      startY: fresh ? y - FOX_TIMING.baitDropHeight : y,
      variant: 1 + (parseInt(id.slice(2), 36) % 3 || 0),
      bornAt: fresh ? b.dropAt : now,
      landAt: fresh ? b.dropAt + FOX_TIMING.baitLandMs : now,
      expireAt: now + FOX_TIMING.baitExpireMs * 2, // the server says when it goes
      sprite: null,
      landed: false,
    };
    baits.push(bait);
    buildBaitView(engine, bait);
    if (!fresh) landBait(engine, bait);
  }
  const localFox = new Map(foxes.filter((e) => e.serverId).map((e) => [e.serverId, e]));
  for (const entity of [...foxes]) if (entity.serverId && !mp.foxes.has(entity.serverId)) removeFox(engine, entity);
  for (const [id, f] of mp.foxes) {
    const entity = localFox.get(id);
    if (entity) {
      if (f.leaving && !entity.fox.leaving) {
        entity.fox.leaving = true;
        entity.fox.state = 'idle'; // startMoving: run for the exit
        entity.fox.timerMs = 0;
      }
      continue;
    }
    if (mp.departed.has(id) || (f.leaving && !f.fresh)) continue;
    const y = nearestSurfaceY(engine.platforms, preserve.spawnerX, preserve.spawnerY) ?? preserve.spawnerY;
    const made = spawnFoxAt(engine, preserve.spawnerX, y, 'left', id);
    if (f.leaving) made.fox.leaving = true;
    if (f.fresh) {
      f.fresh = false;
      engine.pushActivity(FOX_TEXT.appears);
      engine.toast(FOX_TEXT.appears, 1800);
      engine.floatText(preserve.spawnerX, y - 120, 'A fox appears!', 0xffd27a);
    }
  }
  mp.nextSync = Number.isFinite(next) ? next : now + 1000;
  publish(engine, true);
}

/** npc_fox_ranger.js overCapacity: eight other players already past the Ranger. */
function mpOverCapacity() {
  if (!mp || !preserve || !Number.isFinite(preserve.rangerX)) return false;
  return preserveOverCapacity(mp.client.players, preserve.rangerX, preserve.inside);
}

// ---------------------------------------------------------------------------
// Brushing
// ---------------------------------------------------------------------------

function performBrush(engine, entity, { ignoreReach = false } = {}) {
  const player = engine.player;
  if (!entity || !foxes.includes(entity) || !player) return null;
  const nowMs = Date.now();
  if (!ignoreReach && !inReach(entity.fox, player) && countItem(engine.inv, FOX_BRUSH_ID) > 0 && licensed(engine)) {
    engine.pushActivity(FOX_TEXT.cantReach);
    brushFx(engine, player.x + (entity.fox.x < player.x ? -40 : 40), player.y - 30, 'miss');
    lastBrush = 'out_of_reach';
    publish(engine, true);
    return { ok: false, reason: 'out_of_reach' };
  }
  const result = brushFox({
    pc: engine.pc,
    inv: engine.inv,
    toolState: engine.toolState,
    learned: engine.learnedSkills,
    licensed: licensed(engine),
    nowMs,
    lastBrushMs,
    fox: entity.fox,
    hubId: engine.street?.hubId ?? '',
    baitsRemaining: baits.length,
    rng,
  });
  if (!result.ok) {
    engine.pushActivity(result.msg);
    if (result.miss) brushFx(engine, entity.fox.x, entity.fox.y, 'miss');
    lastBrush = result.reason;
    publish(engine, true);
    return result;
  }
  lastBrushMs = nowMs;
  lastBrush = `brushed:${result.fibers}`;
  slice.totalFibers += result.fibers;
  slice.totalBrushes += 1;
  entity.flashUntil = nowMs + 420;
  brushFx(engine, entity.fox.x, entity.fox.y, 'hit');
  engine.playSound('FOX_BRUSH_HIT', { volume: 0.55 });
  engine.pushActivity({
    base: 'You brushed a Fox',
    effects: { energy: result.energy, xp: result.xp, items: { Fiber: result.fibers } },
  });
  engine.floatText(entity.fox.x, entity.fox.y - 96, `+${result.fibers} Fiber`, 0xfff1c2);
  // npc_fox.js 421-438: sendResponse('brushed', pc, slugs), the package's energy and iMG.
  if (entity.target) engine.say(entity.target, result.response, 2500, { slugs: slugsFromEffects({ energy: result.energy, xp: result.xp }) });
  for (const { counter, amount } of result.counters) engine.achievement(counter, amount);
  if (result.fleet && !engine.unlockedAchievements.includes(FLEET_FOXER_ACHIEVEMENT)) {
    engine.grantAchievement(FLEET_FOXER_ACHIEVEMENT);
  }
  const hub = noteFoxHub(slice, engine.street?.hubId);
  if (hub.tourist && !engine.unlockedAchievements.includes(FOX_TOURIST_ACHIEVEMENT)) {
    engine.grantAchievement(FOX_TOURIST_ACHIEVEMENT);
  }
  if (result.broke) engine.toast(result.brokeMsg, 2600);
  if (mp && entity.serverId) {
    // Multiplayer: the server counts every player's brushes and says when the fox leaves (foxes.go).
    entity.fox.leaving = mp.foxes.get(entity.serverId)?.leaving === true;
    mp.client.send('fox_brush', { fox: entity.serverId });
  } else if (result.leave) {
    engine.pushActivity(result.leaveMsg);
    if (baits.length && !pendingSpawnAt) pendingSpawnAt = nowMs + FOX_TIMING.respawnAfterLeaveMs;
  }
  entity.fox.state = 'idle'; // startMoving: re-path from here
  entity.fox.timerMs = 0;
  engine.refreshPack();
  engine.save();
  publish(engine, true);
  return result;
}

// ---------------------------------------------------------------------------
// Fox Ranger conversations (npc_fox_ranger.js onConversation)
// ---------------------------------------------------------------------------

function rangerSay(engine, text, ms = 4000) {
  if (ranger?.target) engine.say(ranger.target, fillName(text, PLAYER_NAME), ms);
}

function rangerDialog(engine, { text, beats, accept, decline, onAccept, onDecline, key }) {
  lastTalk = key || '';
  if (ranger) {
    ranger.talking = true;
    rangerClip(engine, 'talk', true);
  }
  const list = beats || [{ text: fillName(String(text).replace(/<[^>]+>/g, ''), PLAYER_NAME), response: accept }];
  const done = (fn) => () => {
    if (ranger) ranger.talking = false;
    if (typeof fn === 'function') fn();
  };
  // G277: npc_fox_ranger.js conversation_start (195-415): an NPC conversation on the plain
  // card, not a quest offer; a one-choice line has one button (no second copy of it).
  engine.scriptedDialogue({
    title: 'Fox Ranger',
    kicker: 'Fox Brushing Preserve',
    beats: list,
    cancelable: Boolean(decline),
    primaryLabel: accept,
    cancelLabel: decline || '',
    onComplete: done(onAccept),
    onCancel: decline ? done(onDecline || onAccept) : undefined,
  });
  publish(engine, true);
}

function choose(engine, value) {
  const pc = engine.pc;
  if (value === 'cancel') {
    rangerSay(engine, FOX_RANGER_TEXT.cancel, 5000);
    return;
  }
  if (value === 'no-buy') {
    rangerSay(engine, FOX_RANGER_TEXT.noBuy, 3000);
    return;
  }
  if (value === 'no-buy-license') {
    rangerSay(engine, FOX_RANGER_TEXT.noBuyLicense, 4000);
    return;
  }
  if (value === 'ok') {
    slice.intro = true;
    engine.save();
    rangerDialog(engine, {
      key: 'intro',
      beats: splitConversation(FOX_RANGER_TEXT.intro, 'Yes, I am!'),
      accept: 'Yes, I am!',
      decline: 'Nope',
      onAccept: () => choose(engine, 'buy-license'),
      onDecline: () => choose(engine, 'no-buy'),
    });
    return;
  }
  if (value === 'buy-license' || value === 'buy-license-confirm') {
    if ((pc.currants || 0) < FOX_LICENSE.cost) {
      rangerDialog(engine, { key: 'tooPoor', text: FOX_RANGER_TEXT.tooPoor, accept: 'OK' });
      return;
    }
    if (value === 'buy-license') {
      rangerDialog(engine, {
        key: 'licenseOffer',
        text: FOX_RANGER_TEXT.licenseOffer,
        accept: 'Deal (500c)',
        decline: 'No thanks',
        onAccept: () => choose(engine, 'buy-license-confirm'),
        onDecline: () => choose(engine, 'no-buy-license'),
      });
      return;
    }
    pc.currants = (pc.currants || 0) - FOX_LICENSE.cost;
    engine.playSound('BUY_FOX_BRUSHING_PERMIT', { volume: 0.6 });
    engine.pushActivity({ base: 'You bought a Fox-Brushing Permit', effects: {} });
    engine.grantAchievement(FOX_LICENSE_ACHIEVEMENT);
    engine.updateHud();
    engine.save();
    pendingHandoff = 'give-brush'; // onAchievementClose
    handoffAt = Date.now() + 900;
    return;
  }
  if (value === 'give-brush') {
    rangerDialog(engine, {
      key: 'giveBrush',
      text: FOX_RANGER_TEXT.giveBrush,
      accept: 'Thanks!',
      onAccept: () => {
        addItem(engine.inv, FOX_BRUSH_ID, FOX_LICENSE.brush);
        engine.refreshPack();
        engine.pushActivity({ base: 'The Fox Ranger gave you a Fox Brush', effects: { items: { 'Fox Brush': 1 } } });
        choose(engine, 'give-bait');
      },
    });
    return;
  }
  if (value === 'give-bait') {
    rangerDialog(engine, {
      key: 'giveBait',
      text: FOX_RANGER_TEXT.giveBait,
      accept: 'Thanks!',
      onAccept: () => {
        addItem(engine.inv, FOX_BAIT_ID, FOX_LICENSE.bait);
        engine.refreshPack();
        engine.pushActivity({ base: 'The Fox Ranger gave you Fox Bait', effects: { items: { 'Fox Bait': FOX_LICENSE.bait } } });
        engine.save();
        rangerDialog(engine, {
          key: 'enter',
          beats: splitConversation(FOX_RANGER_TEXT.enter, 'Yay!'),
          accept: 'Yay!',
          onAccept: () => choose(engine, 'enter'),
        });
      },
    });
    return;
  }
  if (value === 'buy') {
    openRangerShop(engine);
    return;
  }
  if (value === 'enter') {
    if (ranger) ranger.conversated = true;
  }
}

/** QA autoplay only steps through the Ranger's own conversation, never another offer. */
function rangerDialogShowing() {
  if (typeof document === 'undefined') return false;
  return document.getElementById('quest-dialogue-title')?.textContent === 'Fox Ranger';
}

/** onAchievementClose: the brush handoff waits for the license award screen to close. */
function awardShowing() {
  if (typeof document === 'undefined') return false;
  const el = document.getElementById('award-screen');
  return Boolean(el && !el.hidden);
}

function openRangerShop(engine) {
  shopOpened = true;
  lastTalk = 'shop';
  engine.openShop(foxRangerStoreProfile());
  publish(engine, true);
}

function greet(engine, { fromVerb = false } = {}) {
  if (!ranger) return;
  if (licensed(engine) && slice.intro && mpOverCapacity()) {
    // npc_fox_ranger.js:405-410: eight players are already inside.
    ranger.greeted = true;
    rangerDialog(engine, { key: 'overCapacity', text: FOX_RANGER_TEXT.overCapacity, accept: 'OK', onAccept: () => rangerSay(engine, FOX_RANGER_TEXT.overCapacityThanks, 4000) });
    return;
  }
  const g = rangerGreeting({
    conversated: ranger.conversated,
    visited: slice.visited,
    intro: slice.intro,
    licensed: licensed(engine),
    greeted: fromVerb ? false : ranger.greeted,
    hasBrush: countItem(engine.inv, FOX_BRUSH_ID) > 0,
    hasBait: countItem(engine.inv, FOX_BAIT_ID) > 0,
  });
  if (g.kind === 'none') return;
  ranger.greeted = true;
  if (g.kind === 'bubble') {
    lastTalk = g.key;
    const line = g.key === 'greetings'
      ? FOX_RANGER_TEXT.greetings[Math.floor(rng() * FOX_RANGER_TEXT.greetings.length)]
      : FOX_RANGER_TEXT[g.key];
    rangerSay(engine, line, g.key === 'noBait' ? 5000 : 4000);
  } else if (g.key === 'noBrush') {
    rangerDialog(engine, { key: g.key, text: FOX_RANGER_TEXT.noBrush, accept: 'Good point', onAccept: () => choose(engine, 'buy') });
  } else {
    const yesLabel = g.key === 'returnNoLicense' ? 'Yes' : 'Yes, please';
    const noLabel = g.key === 'returnNoLicense' ? 'No' : 'No, thanks';
    rangerDialog(engine, {
      key: g.key,
      text: FOX_RANGER_TEXT[g.key],
      accept: yesLabel,
      decline: noLabel,
      onAccept: () => choose(engine, g.yes),
      onDecline: () => choose(engine, g.no),
    });
  }
  slice.visited = true;
  publish(engine, true);
}

function tickRanger(engine, now) {
  if (!ranger || !preserve || !engine.player) return;
  if (!ranger.talking) {
    if (ranger.clip === 'talk') rangerClip(engine, 'idle0');
    if (now >= ranger.nextIdleAt) {
      const roll = rng();
      rangerClip(engine, roll < 0.25 ? 'idle2' : 'idle1');
      ranger.nextIdleAt = now + 4000 + Math.floor(rng() * 5000);
    } else if (!ranger.sprite.playing && ranger.clip !== 'idle0') {
      rangerClip(engine, 'idle0');
    }
  }
  if (!engine.started || engine.transientInstance()) return;
  const p = engine.player;
  const inside = preserve.inside;
  const rel = (p.x - preserve.rangerX) * inside; // > 0 is inside the preserve
  const half = FOX_TIMING.rangerHitBoxW / 2;
  const inBox = Math.abs(p.x - preserve.rangerX) <= half && Math.abs(p.y - preserve.rangerY) <= FOX_TIMING.rangerHitBoxH / 2;
  if (inBox && !ranger.inBox && rel <= 0 && !engine.busy()) {
    // onPlayerCollision only greets players arriving from the entrance side.
    greet(engine);
  }
  if (ranger.inBox && !inBox && rel > half) {
    const reason = rangerGateReason({ licensed: licensed(engine), hasBrush: countItem(engine.inv, FOX_BRUSH_ID) > 0, overCapacity: mpOverCapacity() });
    if (reason) {
      p.x = preserve.rangerX - inside * FOX_TIMING.rangerPushBack;
      p.vx = 0;
      rangerSay(engine, reason, 3000);
      ranger.inBox = true;
      return;
    }
  }
  ranger.inBox = inBox;
}

// ---------------------------------------------------------------------------
// Ignite (pack verb on Fox Bait)
// ---------------------------------------------------------------------------

function igniteGate(engine) {
  const p = engine.player;
  return baitIgniteGate({
    inPreserve: Boolean(preserve && Number.isFinite(preserve.rangerX)),
    rangerX: preserve?.rangerX ?? null,
    facing: preserve?.facing,
    playerX: p?.x ?? 0,
    placedBaitXs: baits.map((b) => b.x),
  });
}

function ignite(engine) {
  const gate = igniteGate(engine);
  if (!gate.ok) {
    engine.toast(gate.reason, 2400);
    return false;
  }
  if (!removeItem(engine.inv, FOX_BAIT_ID, 1)) return false;
  const now = Date.now();
  const p = engine.player;
  if (mp) {
    // Multiplayer: the server drops the baits for everyone and decides the fox (foxes.go fox_ignite).
    if (!mp.client.send('fox_ignite', { baits: igniteBaitXs(p.x, engine.worldW, rng) })) {
      addItem(engine.inv, FOX_BAIT_ID, 1);
      engine.toast('You are offline.', 2400);
      return false;
    }
    mp.refundAt = now + 4000;
  } else {
    if (!pendingSpawnAt) pendingSpawnAt = now + FOX_TIMING.spawnDelayMs;
    pendingDrops.push({ at: now + FOX_TIMING.baitDropDelayMs, x: p.x, y: p.y });
  }
  igniteFx(engine);
  engine.playSound('FOX_BAIT', { volume: 0.5 });
  engine.pushActivity({ base: 'You ignited a Fox Bait', effects: { items: { 'Fox Bait': -1 } } });
  engine.refreshPack();
  engine.save();
  publish(engine, true);
  return true;
}

// ---------------------------------------------------------------------------
// Street lifecycle
// ---------------------------------------------------------------------------

function setupPreserve(engine, row) {
  const worldW = engine.worldW;
  const entranceX = entranceScreenX(engine.street, worldW);
  const seed = [...String(engine.streetTsid)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
  const layout = preserveLayout({ worldW, entranceX, markerCount: Number(row.fox_stop_marker) || 0, seed });
  const refY = engine.player?.y ?? engine.groundY;
  const rangerY = nearestSurfaceY(engine.platforms, layout.rangerX, refY) ?? refY;
  const spawnerY = nearestSurfaceY(engine.platforms, layout.spawnerX, rangerY) ?? rangerY;
  preserve = { ...layout, rangerY, spawnerY, inside: insideSign(layout.facing), demo: false };
}

function setupDemo(engine) {
  if (demoUsed) return;
  const mode = String(engine.param('foxdemo') || '');
  if (!mode) return;
  demoUsed = true;
  demoMode = mode;
  const p = engine.player;
  if (!p) return;
  if (mode === 'ranger') {
    // An unlicensed Ranger right beside the player, facing them, for the conversation.
    const facing = p.x < engine.worldW - 400 ? 'left' : 'right';
    const rangerX = p.x + (facing === 'left' ? 110 : -110);
    const rangerY = nearestSurfaceY(engine.platforms, rangerX, p.y) ?? p.y;
    preserve = {
      facing,
      rangerX,
      rangerY,
      spawnerX: rangerX + insideSign(facing) * 260,
      spawnerY: rangerY,
      markers: [rangerX + insideSign(facing) * 700, rangerX + insideSign(facing) * 1300],
      inside: insideSign(facing),
      demo: true,
    };
    if (ranger?.target) engine.unregister(ranger.target);
    ranger = null;
    buildRanger(engine);
    if (engine.param('foxautoplay') === 'license') {
      engine.pc.currants = Math.max(engine.pc.currants || 0, 600);
      engine.updateHud();
    }
    return;
  }
  demoLicensed = true;
  engine.inv[FOX_BRUSH_ID] = Math.max(1, engine.inv[FOX_BRUSH_ID] || 0);
  engine.inv[FOX_BAIT_ID] = Math.max(5, engine.inv[FOX_BAIT_ID] || 0);
  if ((engine.pc.energy || 0) < 60) engine.pc.energy = 60;
  if (!preserve) {
    preserve = {
      facing: 'left',
      rangerX: null,
      rangerY: p.y,
      spawnerX: p.x + 140,
      spawnerY: p.y,
      markers: [p.x - 700, p.x - 300, p.x + 380, p.x + 760].filter((x) => x > 120 && x < engine.worldW - 120),
      inside: 1,
      demo: true,
    };
  }
  if (mode !== 'bait') {
    placeDemoBaits(engine);
    const y = nearestSurfaceY(engine.platforms, p.x + 140, p.y) ?? p.y;
    spawnFoxAt(engine, p.x + 140, y, 'left');
  }
  engine.refreshPack();
}

function scheduleAutoplay(engine) {
  const mode = engine.param('foxautoplay');
  if (!mode) return;
  for (const id of autoplayTimers) clearTimeout(id);
  autoplayTimers = [];
  if (mode === 'license' && ranger) {
    autoplayTimers.push(setTimeout(() => {
      greet(engine, { fromVerb: true });
      let guard = 0;
      const step = () => {
        guard += 1;
        if (engine.questDialogueOpen()) {
          // QA only: step the Ranger's lines; set aside any other offer that pops up meanwhile.
          if (rangerDialogShowing()) engine.acceptOpenOffer();
          else document.getElementById('quest-dialogue-cancel')?.click();
        }
        if (pendingHandoff || engine.questDialogueOpen() || lastTalk !== 'enter') {
          if (guard < 90) autoplayTimers.push(setTimeout(step, 700));
        }
      };
      autoplayTimers.push(setTimeout(step, 600));
    }, 900));
    return;
  }
  if (mode === 'ignite') {
    autoplayTimers.push(setTimeout(() => ignite(engine), 1500));
    return;
  }
  if (mode === '1') {
    [1500, 3600, 5700].forEach((delay) => {
      autoplayTimers.push(setTimeout(() => {
        if (foxes[0]) performBrush(engine, foxes[0], { ignoreReach: true });
      }, delay));
    });
  }
}

function publish(engine, force = false) {
  const now = Date.now();
  if (!force && now < publishAt) return;
  publishAt = now + 250;
  const first = foxes[0]?.fox;
  const brush = getToolCondition(engine.toolState, FOX_BRUSH_ID);
  engine.setData('foxPreserve', preserve && !preserve.demo ? '1' : '0');
  engine.setData('foxRanger', preserve && Number.isFinite(preserve.rangerX) ? `${Math.round(preserve.rangerX)}:${preserve.facing}` : '');
  engine.setData('foxMarkers', String(preserve?.markers?.length || 0));
  engine.setData('foxCount', String(foxes.length));
  engine.setData('foxState', first ? `${first.state}${first.leaving ? ':leaving' : ''}` : '');
  engine.setData('foxX', first ? String(Math.round(first.x)) : '');
  engine.setData('foxBaits', String(baits.length));
  engine.setData('foxLicense', licensed(engine) ? (demoLicensed ? 'demo' : '1') : '0');
  engine.setData('foxLastBrush', lastBrush);
  engine.setData('foxFibers', String(countItem(engine.inv, FIBER_ID)));
  engine.setData('foxBrush', countItem(engine.inv, FOX_BRUSH_ID) ? `${brush.remaining}/${brush.capacity}` : '');
  engine.setData('foxHubs', String(slice.hubsBrushed.length));
  engine.setData('foxDemo', demoMode);
  engine.setData('foxRangerTalk', lastTalk);
  if (mp) engine.setData('foxMp', `${mp.foxes.size}:${mp.baits.size}`);
}

// ---------------------------------------------------------------------------
// Feature
// ---------------------------------------------------------------------------

export const foxesFeature = {
  id: FOX_FEATURE_ID,

  init(engine) {
    ensureFoxItems();
    loader = createSheetLoader(engine.PIXI);
    loadWildlifeCatalog();
    publish(engine, true);
  },

  save() {
    return { ...slice, hubsBrushed: [...slice.hubsBrushed] };
  },

  restore(saved) {
    slice = normalizeFoxSlice(saved || {});
  },

  ecologyOverride(street, engine) {
    const catalog = wildlifeCatalog();
    if (!catalog || !street?.tsid) return null;
    const row = wildlifeFor(catalog, street.tsid);
    if (!isPreserveRow(row)) return null;
    const streets = catalog.streets || {};
    const entry = streets[street.tsid] || streets[`L${String(street.tsid).slice(1)}`] || null;
    return preserveEcologyEntry(entry, row);
  },

  onStreetEnter(street, engine) {
    generation += 1;
    const mine = generation;
    Promise.all([loadWildlifeCatalog(), loader.loadAll(sheetsNeeded())]).then(([catalog]) => {
      if (mine !== generation) return;
      const row = wildlifeFor(catalog, engine.streetTsid);
      preserve = null;
      if (isPreserveRow(row)) {
        setupPreserve(engine, row);
        buildRanger(engine);
      }
      setupDemo(engine);
      if (mp) mpReconcile(engine, Date.now());
      publish(engine, true);
      scheduleAutoplay(engine);
    });
  },

  onStreetClear(engine) {
    generation += 1;
    for (const id of autoplayTimers) clearTimeout(id);
    autoplayTimers = [];
    clearEffects();
    foxes = [];
    baits = [];
    ranger = null;
    preserve = null;
    pendingSpawnAt = 0;
    pendingDrops = [];
    pendingHandoff = null;
    if (mp) mpForget();
    if (shopOpened) {
      shopOpened = false;
      engine?.openShop?.(null);
    }
  },

  onTick(dtMs, now, engine) {
    if (!mp && engine.mode === 'multiplayer' && engine.started) mpSession(engine);
    if (mp && preserve && now >= mp.nextSync) mpReconcile(engine, now);
    if (shopOpened && !engine.shopOpen()) {
      shopOpened = false;
      engine.openShop(null);
    }
    if (pendingHandoff && now >= handoffAt && !engine.busy() && !awardShowing()) {
      const step = pendingHandoff;
      pendingHandoff = null;
      choose(engine, step);
    }
    if (!preserve && !foxes.length && !effects.length) return;
    for (const drop of [...pendingDrops]) {
      if (now < drop.at) continue;
      pendingDrops = pendingDrops.filter((d) => d !== drop);
      dropBaits(engine, drop);
    }
    if (pendingSpawnAt && now >= pendingSpawnAt) {
      pendingSpawnAt = 0;
      spawnFox(engine);
    }
    tickBaits(engine, now);
    tickFoxes(engine, dtMs, now);
    tickRanger(engine, now);
    tickEffects(dtMs);
    publish(engine);
  },

  verbsFor(target, engine) {
    if (target.classId === FOX_RANGER_ID) {
      if (!licensed(engine)) {
        return [{ id: 'talk_to', label: 'talk to', enabled: true, tooltip: FOX_RANGER_TEXT.talkTooltip, durationMs: 0 }];
      }
      return [
        { id: 'get_tips', label: 'get tips', enabled: true, tooltip: FOX_RANGER_TEXT.tipsTooltip, durationMs: 0 },
        { id: 'shop', label: 'shop', enabled: true, tooltip: FOX_RANGER_TEXT.shopTooltip, durationMs: 0 },
      ];
    }
    if (target.classId === FOX_ID) {
      const hasBrush = countItem(engine.inv, FOX_BRUSH_ID) > 0;
      const pkg = foxBrushingPackage(engine.learnedSkills);
      return [{
        id: 'brush',
        label: 'brush',
        enabled: hasBrush,
        reason: hasBrush ? '' : FOX_TEXT.noBrush,
        tooltip: licensed(engine) ? 'Brush the Fox with a Brush' : FOX_TEXT.brushPermitTip,
        energy: pkg.energyCost,
        durationMs: 0,
      }];
    }
    return [];
  },

  runVerb(target, verbId, engine) {
    if (target.classId === FOX_RANGER_ID) {
      if (verbId === 'talk_to') {
        if (ranger && ranger.greeted && !licensed(engine)) {
          rangerDialog(engine, {
            key: slice.intro ? 'talkLicenseOffer' : 'talkIntroOffer',
            text: slice.intro ? FOX_RANGER_TEXT.talkLicenseOffer : FOX_RANGER_TEXT.talkIntroOffer,
            accept: 'Yes, please',
            decline: 'No, thanks',
            onAccept: () => choose(engine, slice.intro ? 'buy-license' : 'ok'),
            onDecline: () => choose(engine, slice.intro ? 'no-buy' : 'cancel'),
          });
        } else {
          greet(engine, { fromVerb: true });
        }
      } else if (verbId === 'get_tips') {
        rangerDialog(engine, { key: 'tips', beats: splitConversation(FOX_RANGER_TEXT.tips, 'Thanks!'), accept: 'Thanks!' });
      } else if (verbId === 'shop') {
        openRangerShop(engine);
      }
      return true;
    }
    if (target.classId === FOX_ID && verbId === 'brush') {
      const entity = foxes.find((e) => e.target === target);
      if (entity) performBrush(engine, entity);
      return true;
    }
    return true;
  },

  packVerbs(classTsid, engine) {
    if (classTsid !== FOX_BAIT_ID) return [];
    const gate = igniteGate(engine);
    return [{ id: 'ignite', label: 'Ignite', enabled: gate.ok, reason: gate.reason || '', tooltip: FOX_TEXT.igniteTooltip, primary: true }];
  },

  runPackVerb(classTsid, verbId, engine) {
    if (classTsid !== FOX_BAIT_ID || verbId !== 'ignite') return false;
    ignite(engine);
    return true;
  },

  /** QA / tests. */
  _state() {
    return { slice: { ...slice }, foxes: foxes.length, baits: baits.length, preserve, lastBrush };
  },
};
