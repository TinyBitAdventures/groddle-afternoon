/**
 * Rook attacks as a feature module (see js/feature-host.js). Rules live in
 * js/rook-attack.js (source anchors and solo adaptations are listed there).
 *
 * Flow on a street with a shrine (locations/inc_rook.js isRookable), about
 * once an hour (admin.js 60/60-minute schedule):
 * 1. Herald (30 s): the Forehorseman gallops in ringing his bells ("THE END
 *    IS NEIGH"), rook silhouettes cross the sky, the street dims, and the
 *    2011 "¡Der Rook iz Coming!" warning fades in twice.
 * 2. ROOK ATTACK! (crimson overlay, 0.5 s in, 3.25 s hold, 0.5 s out): the
 *    Rook hovers over the street (recovered glitch-overlays rook_fly_forward
 *    frames), the HUD badge shows the rook head (OGA rook_head states), the
 *    crimson health arc, the seven stun stars and the event feed. The
 *    recovered Rooks' Woods track plays as the attack cue.
 * 3. Stun: Focusing Orb -> Stun attack (or click the Rook). The orb rises
 *    over the avatar (Tiny Speck's focusing_orb_attack, its orb1-4 states
 *    as the count grows, G272) and the street joins it one at a time (un-rooked
 *    critters and trees, nearest first, then the shrine); release it by
 *    clicking the orb or Unleash, or it fires at 15 s. A beam strikes the
 *    Rook for the source 25..200 stun. The first attempt starts the 2-minute
 *    angry clock; 1000 stun = STUNNED!
 * 4. Wing beat (10 min idle, 2 min once angry): the Rook swoops at the
 *    camera, the screen shakes, everyone loses energy and mood, and each
 *    critter or tree has a 50% chance to be rooked.
 * 5. Stunned (2 min): Prime the shrine (10 s) and Strike the Rook with
 *    offerings; a shrine beam hits for 10% of base cost x10 (at least 100).
 * 6. THE ROOK IS DEFEATED! (teal): the Rook flees, a rainbow, damage*2+50
 *    iMG, Rook Ranger if Rook Armor (Essence of Rookswort) is active.
 * 7. Aftermath: rooked critters and trees keep their state per street
 *    (engine.streetSlot) until revived: Revive (10 s, three doses) or Apply
 *    Balm (Rook Balm, 2.5 s, full revive). Rooked targets offer only those
 *    verbs (engine verbOverride hook).
 *
 * Engine hooks used (game.js): interactables, camera, stage, nudgeCamera,
 * query('verbOverride') in the verb menu and query('runVerbOverride') before
 * any verb runs.
 *
 * QA: ?autostart=1&fresh=1&rookdemo=herald|attack|aftermath
 *   &rookautoplay=1 drives each route (attack: full fight to defeat;
 *   =stunned stops at STUNNED!, =wingbeat forces a wing beat, =stun lands one
 *   stun; aftermath: revives one target with three doses and balms another).
 *   &rookfx=hold keeps the current overlay up for screenshots; =swoop holds
 *   a wing-beat swoop at its closest point.
 * Canvas data: rookPhase, rookHealth, rookStun, rookClock, rookAngry,
 *   rookWingBeats, rookRooked, rookRookedKeys, rookOrb, rookLast, rookFeed,
 *   rookNextAttack, rookArmor, rookBalmPoints, rookDemo, rookArt, rookStats.
 */

import { addItem, countItem, ensureItem, removeItem, ITEM_CATALOG } from '../inventory.js?v=catalog-unified-7';
import { createSheetLoader, pixiSpeed } from '../sprite-sheets.js';
import { nearestSurfaceY } from '../walk-surface.js';
import { donationValueFor } from '../shrines.js?v=spinning-wheel-test-4';
import { TRANT_META, trantStatusLabel } from '../trants.js?v=trant-harvest-2';
import {
  FOREHORSEMAN_LINES,
  ROOK_COLORS,
  ROOK_SOLO,
  ROOK_SOURCE,
  ROOK_TEXT,
  applyReviveDose,
  applyStrike,
  canStrike,
  canStun,
  createRookAttack,
  defeatXpFor,
  forceRook,
  isRookableClass,
  isTreeClass,
  normalizeRookSave,
  normalizeRookedSlot,
  orbJoinOrder,
  orbLookFor,
  resolveStun,
  rollWingBeat,
  rookClockS,
  rookPresent,
  rookResponse,
  rookTrantState,
  scheduleNextAttack,
  soloCost,
  stepRookAttack,
  streetIsRookable,
  strikeBeamFor,
  strikeDamageFor,
  useBalmPoint,
} from '../rook-attack.js';
import { shrinePrimeBonus } from '../imagination-effects.js';
import { grantMoodXp } from '../mood-xp.js';
import { gainMetabolic, loseEnergy, loseMood } from '../metabolics.js';
import { displayTopOf, easeOutBack, itemstackOverlayPoint, playSheetOverlay } from '../overlay-art.js?v=g294-1';

export const ROOK_FEATURE_ID = 'rook-attack';
const VIEW_W = 960;
const VIEW_H = 408;
// The whole canvas: the pack allowance below the location viewport shows street too.
const SCREEN_H = 540;
const PLAYER_LABEL = 'Ur';
const ORB_CLASS = 'focusing_orb';
const BALM_CLASS = 'potion_rook_balm';
const ARMOR_CLASS = 'essence_of_rookswort';
/** music_map ROOK_FLOCK (archive.org 'rook flight'): inc_rook.js:40 loops it for the whole attack. */
const ROOK_MUSIC = 'assets/audio/sfx/ROOK_FLOCK.mp3';
const ROOK_HOME = Object.freeze({ x: 580, y: 170, scale: 0.82 });
/** The HUD badge, docked in the viewport's top right; its feed hangs below, its right edge 10 px in (G283). */
export const BADGE = Object.freeze({ x: VIEW_W - 70, y: 66, feedX: -90 });
/**
 * Camera headroom while a stun orb is up and its beam fires (G283). The orb
 * stands 312 px above your feet (ORB_ART), and the client's viewport ran up
 * to 600 px tall (LayoutModel.as max_vp_h) with the avatar 150 px below its
 * centre (CameraMan.as 121-138), so the orb sat about 140 px down from the
 * top. The remake's 408 px viewport puts your feet at about 306 px and the
 * orb above the top edge; the camera looks 90 px higher, which brings the
 * orb to about 84 px down and keeps your feet 12 px inside the viewport.
 */
export const ORB_HEADROOM = Object.freeze({ dy: 90, afterMs: 1500 });

const DIR = 'assets/sprites/rooks/';
const sheet = (file, fw, fh, cols, frames) => Object.freeze({ path: `${DIR}${file}`, fw, fh, cols, frames });

/** Exact cells (measured; see the skill's frame table). */
export const ROOK_SHEETS = Object.freeze({
  hover: sheet('rook-hover.webp', 496, 300, 6, 36),
  side: sheet('rook-side.webp', 296, 290, 6, 18),
  fore: sheet('forehorseman-frantic.webp', 191, 202, 8, 47),
  halo: sheet('rooked-halo.png', 124, 92, 8, 16),
  balm: sheet('rook-balm-tool.png', 88, 106, 10, 67),
  piggy1: sheet('piggy-rooked1.png', 88, 62, 10, 10),
  piggy2: sheet('piggy-rooked2.png', 88, 62, 8, 24),
  chicken1: sheet('chicken-rooked1.png', 148, 110, 1, 1),
  chicken2: sheet('chicken-rooked2.png', 148, 110, 6, 27),
  bflyFly: sheet('butterfly-fly-rooked.png', 70, 65, 14, 14),
  bflyRest: sheet('butterfly-rest-rooked.png', 70, 65, 1, 1),
  kittySad: sheet('kitty-sad.png', 136, 115, 6, 17),
  head_idle1: sheet('rook-head-idle1.png', 108, 127, 9, 60),
  head_angry1: sheet('rook-head-angry1.png', 108, 127, 9, 102),
  head_angry2: sheet('rook-head-angry2.png', 108, 127, 9, 54),
  head_angry3: sheet('rook-head-angry3.png', 108, 127, 9, 54),
  head_stun: sheet('rook-head-stun.png', 108, 127, 8, 24),
  head_stunned: sheet('rook-head-stunned.png', 108, 127, 8, 30),
  head_stunnedHit: sheet('rook-head-stunnedHit.png', 108, 127, 8, 30),
  head_killShot: sheet('rook-head-killShot.png', 108, 127, 8, 30),
  head_dead: sheet('rook-head-dead.png', 108, 127, 1, 1),
  head_taunt: sheet('rook-head-taunt.png', 108, 127, 8, 39),
});

// ---------------------------------------------------------------------------
// Runtime state
// ---------------------------------------------------------------------------

let save = normalizeRookSave();
let loader = null;
let engineRef = null;
let generation = 0;
let enteredAt = 0;
let pendingApplied = false;
let keyOf = new WeakMap();
let classCounters = {};
let tracked = new Map(); // key -> { target, saved, halo, tick, clip }
let lastTalk = new Map(); // key -> ms
let lastScan = 0;
let lastAction = '';
let feedText = '';
let feedUntil = 0;
let publishAt = 0;
let demoMode = '';
let demoDone = false;
let autoplay = '';
let autoStep = 0;
let autoNextAt = 0;
let timeScale = 1;
let holdFx = false;
let holdSwoop = false;
let musicStop = null;
let musicFor = '';
let primed = null; // { target, until, damage, strikeAt }
let orb = null; // runtime orb
let offerPanel = null;
let headroom = null; // { until }: the camera looks up for the orb (G283)

// Pixi parts
let ui = null; // screen layer
let fore = null; // { sprite, target, flipAt, speakAt, dir }
let silhouettes = [];
let feathers = [];
let artOverlays = []; // playSheetOverlay handles (G251)
let overlays = [];
let shakeUntil = 0;
let swoop = null;
let departing = null;

const now = () => Date.now();

function slot(engine, tsid) {
  const raw = engine.streetSlot(ROOK_FEATURE_ID, tsid);
  const clean = normalizeRookedSlot(raw);
  raw.rooked = clean.rooked;
  raw.pendingBeats = clean.pendingBeats;
  return raw;
}

function active() {
  return save.active && !save.active.cleared ? save.active : null;
}

function here(engine) {
  const a = active();
  return a && a.tsid === engine.streetTsid ? a : null;
}

function armored() {
  return save.armorUntil > now();
}


/**
 * Pay or charge metabolics and iMG the way other features do (pc mutation + activity).
 * inc_rook.js 198-201, 741-792 and include/rook.js 185, 198 award with
 * stats_add_xp(n) / (n, false), so iMG takes the mood bonus; returns what landed.
 * G289: charges are metabolics_lose_energy / metabolics_lose_mood
 * (include/rook.js 19-21, 186-187, 199-200; inc_rook.js 795), refused while
 * dead; a gain would be metabolics_add_* (refused while dead or, for energy,
 * Super Pooped). Both stop at the tank, never a flat 100 (inc_metabolics.js
 * 40-53, 79-86, 108-122, 180-194).
 */
function grant(engine, { xp = 0, energy = 0, mood = 0 } = {}) {
  const pc = engine.pc;
  const landed = xp ? grantMoodXp(pc, xp) : 0;
  if (energy > 0) gainMetabolic(pc, 'energy', Math.round(energy));
  else if (energy < 0) loseEnergy(pc, Math.round(-energy));
  if (mood > 0) gainMetabolic(pc, 'mood', Math.round(mood));
  else if (mood < 0) loseMood(pc, Math.round(-mood));
  engine.updateHud();
  return landed;
}

function setFeed(text, ms = 5500) {
  feedText = text;
  feedUntil = now() + ms;
}

function rookLabel(target) {
  return target?.label || 'critter';
}

// ---------------------------------------------------------------------------
// Street scan, keys, rooked visuals
// ---------------------------------------------------------------------------

function rookableTargets(engine) {
  const list = engine.interactables || [];
  const out = [];
  for (const target of list) {
    if (!target || !isRookableClass(target.classId)) continue;
    if (!target.sprite || target.sprite.destroyed) continue;
    let key = keyOf.get(target);
    if (!key) {
      const n = classCounters[target.classId] || 0;
      classCounters[target.classId] = n + 1;
      key = `${target.classId}:${n}`;
      keyOf.set(target, key);
    }
    out.push({ key, classId: target.classId, target, x: target.sprite.x, y: target.sprite.y });
  }
  return out;
}

function shrineTarget(engine) {
  return (engine.interactables || []).find((t) => String(t?.classId || '').startsWith('npc_shrine_')) || null;
}

function hasShrine(engine) {
  return Boolean(shrineTarget(engine) || engine.population?.shrine);
}

function rookedSubtitle() {
  return 'Rooked! It needs reviving';
}

function applyRookedVisual(engine, entry) {
  const { target, key } = entry;
  if (tracked.has(key)) return;
  const spr = target.sprite;
  const saved = {
    subtitle: target.subtitle,
    tint: spr.tint,
    textures: spr.textures,
    vx: spr.vx,
    ambient: spr._ambient,
    groundY: spr._groundY,
    x: spr.x,
    y: spr.y,
    speed: spr.animationSpeed,
    loop: spr.loop,
  };
  const row = { target, saved, halo: null, clipAt: 0, clip: '' };
  tracked.set(key, row);
  target.subtitle = rookedSubtitle();
  const cls = target.classId;
  if (cls === 'npc_piggy' || cls === 'npc_chicken') {
    spr.vx = 0;
  } else if (cls === 'npc_butterfly') {
    spr.vx = 0;
    spr._ambient = false;
    const ground = nearestSurfaceY(engine.platforms, spr.x, spr.y + 40);
    spr._groundY = Number.isFinite(ground) ? ground - 2 : (spr._groundY ?? engine.groundY);
  }
  if (isTreeClass(cls)) spr.tint = 0xc4566c;
  else if (cls === 'npc_kitty_chicken') spr.tint = 0xc8c2d6;
  setRookedClip(row, 'a');
  addHalo(engine, row);
}

function setRookedClip(row, phase) {
  const spr = row.target.sprite;
  if (!loader || !spr || spr.destroyed || typeof spr.gotoAndPlay !== 'function') return;
  const cls = row.target.classId;
  let def = null;
  let loop = true;
  let hold = 2000;
  if (cls === 'npc_piggy') {
    def = phase === 'a' ? ROOK_SHEETS.piggy1 : ROOK_SHEETS.piggy2;
    hold = phase === 'a' ? 5000 : 1600;
  } else if (cls === 'npc_chicken') {
    def = phase === 'a' ? ROOK_SHEETS.chicken1 : ROOK_SHEETS.chicken2;
    hold = 2000;
  } else if (cls === 'npc_butterfly') {
    def = phase === 'a' ? ROOK_SHEETS.bflyRest : ROOK_SHEETS.bflyFly;
    hold = phase === 'a' ? 3000 : 1200;
  } else if (cls === 'npc_kitty_chicken') {
    def = ROOK_SHEETS.kittySad;
    hold = 999999;
  }
  if (!def) return;
  const frames = loader.frames(def);
  if (!frames.length) return;
  row.clip = phase;
  row.clipAt = now() + hold;
  spr.textures = frames;
  spr.loop = loop;
  spr.animationSpeed = pixiSpeed(24);
  spr.gotoAndPlay(0);
}

function addHalo(engine, row) {
  if (!loader?.ready(ROOK_SHEETS.halo) || row.halo) return;
  const { PIXI } = engine;
  const halo = new PIXI.AnimatedSprite(loader.frames(ROOK_SHEETS.halo));
  halo.anchor.set(0.5, 0.75);
  halo.animationSpeed = pixiSpeed(18);
  halo.loop = true;
  halo.play();
  halo.scale.set(isTreeClass(row.target.classId) ? 0.85 : 0.6);
  halo.eventMode = 'none';
  engine.fxLayer.addChild(halo);
  row.halo = halo;
}

function removeRookedVisual(engine, key) {
  const row = tracked.get(key);
  if (!row) return;
  tracked.delete(key);
  const { target, saved } = row;
  const spr = target.sprite;
  if (row.halo && !row.halo.destroyed) row.halo.destroy();
  if (!spr || spr.destroyed) return;
  spr.tint = saved.tint ?? 0xffffff;
  if (saved.textures && typeof spr.gotoAndPlay === 'function') {
    spr.textures = saved.textures;
    spr.loop = saved.loop ?? true;
    spr.animationSpeed = saved.speed ?? spr.animationSpeed;
    spr.gotoAndPlay(0);
  }
  const cls = target.classId;
  if (cls === 'npc_piggy' || cls === 'npc_chicken') {
    spr.vx = saved.vx || (Math.random() < 0.5 ? -0.45 : 0.45);
  } else if (cls === 'npc_butterfly') {
    spr.vx = saved.vx || 0;
    spr._ambient = saved.ambient;
    spr._groundY = saved.groundY;
  }
  if (TRANT_META[cls] && target.state) target.subtitle = trantStatusLabel(target.state, TRANT_META[cls]);
  else target.subtitle = saved.subtitle;
}

function syncRookedVisuals(engine, entries) {
  const s = slot(engine);
  const live = new Set();
  for (const entry of entries) {
    if (s.rooked[entry.key]) {
      live.add(entry.key);
      if (!tracked.has(entry.key)) applyRookedVisual(engine, entry);
    }
  }
  for (const key of [...tracked.keys()]) {
    const row = tracked.get(key);
    const dead = !row.target.sprite || row.target.sprite.destroyed || !(engine.interactables || []).includes(row.target);
    if (dead) {
      if (row.halo && !row.halo.destroyed) row.halo.destroy();
      tracked.delete(key);
    } else if (!live.has(key)) {
      removeRookedVisual(engine, key);
    }
  }
}

function updateRookedVisuals(engine) {
  const t = now();
  const p = engine.player;
  for (const [key, row] of tracked) {
    const spr = row.target.sprite;
    if (!spr || spr.destroyed) continue;
    if (row.target.classId === 'npc_kitty_chicken') {
      spr.x = row.saved.x;
      spr.y = row.saved.y;
      const sad = loader?.frames(ROOK_SHEETS.kittySad);
      if (sad?.length && spr.textures?.[0] !== sad[0]) setRookedClip(row, 'a');
    } else if (row.clip && t >= row.clipAt) {
      setRookedClip(row, row.clip === 'a' ? 'b' : 'a');
    }
    if (row.halo && !row.halo.destroyed) {
      const b = spr.getBounds();
      const cam = engine.camera;
      row.halo.x = b.x + b.width / 2 + cam.x;
      row.halo.y = b.y + cam.y + (isTreeClass(row.target.classId) ? 30 : 4);
    }
    // rookedCollision: a passing Glitch hears the plea.
    if (p && Math.abs(p.x - spr.x) < 70 && Math.abs(p.y - spr.y) < 140 && (lastTalk.get(key) || 0) < t) {
      lastTalk.set(key, t + 9000);
      const line = rookResponse(row.target.classId, 'rooked');
      if (line) engine.say(row.target, line, 3500);
    }
  }
}

/** Apply one wing beat to the loaded street: roll the 50% chance per target. */
function rookStreet(engine, rng = Math.random, force = false) {
  const entries = rookableTargets(engine);
  const s = slot(engine);
  const hit = force
    ? entries.filter((e, i) => i % 2 === 0 && forceRook(s, e, now())).map((e) => e.key)
    : rollWingBeat(s, entries, now(), rng);
  for (const key of hit) {
    const entry = entries.find((e) => e.key === key);
    if (entry && TRANT_META[entry.classId] && entry.target.state) rookTrantState(entry.target.state);
  }
  syncRookedVisuals(engine, entries);
  const cam = engine.camera;
  const first = entries.find((e) => hit.includes(e.key) && e.x > cam.x + 40 && e.x < cam.x + cam.w * 0.75);
  if (first) {
    const line = rookResponse(first.classId, 'rooked');
    if (line) engine.say(first.target, line, 3500);
  }
  engine.save();
  return hit;
}

// ---------------------------------------------------------------------------
// Screen layer (overlays, Rook, HUD badge)
// ---------------------------------------------------------------------------

function ensureUi(engine) {
  if (ui && !ui.root.destroyed) return ui;
  const stage = engine.stage;
  if (!stage) return null;
  const { PIXI } = engine;
  const root = new PIXI.Container();
  root.eventMode = 'passive';
  const sky = new PIXI.Graphics();
  sky.rect(0, 0, VIEW_W, SCREEN_H).fill({ color: 0x1b1030, alpha: 1 });
  sky.alpha = 0;
  sky.eventMode = 'none';
  const rookLayer = new PIXI.Container();
  // In front of the hovering Rook, in world px (kept on the camera by
  // syncFront): the orb, its count and motes and the beams. The client flies
  // its rooks in a middle layer of the street (RookManager.as 1140-1170) and
  // draws pc_ and location_overlays over the street, so nothing it owns hides
  // them (G283).
  const front = new PIXI.Container();
  front.eventMode = 'passive';
  front.sortableChildren = true;
  const fxLayer = new PIXI.Container();
  fxLayer.eventMode = 'none';
  const tint = new PIXI.Graphics();
  tint.eventMode = 'none';
  const textLayer = new PIXI.Container();
  textLayer.eventMode = 'none';
  const hud = new PIXI.Container();
  hud.eventMode = 'none';
  root.addChild(sky, rookLayer, front, fxLayer, tint, textLayer, hud);
  stage.addChild(root);
  ui = { root, sky, rookLayer, front, fxLayer, tint, textLayer, hud, rook: null, head: null, headClip: '', headLock: 0, badge: null };
  buildHud(engine);
  syncFront(engine);
  return ui;
}

/** Keep the front layer on the world: its children use world px. */
function syncFront(engine) {
  const f = ui?.front;
  if (!f || f.destroyed) return;
  const cam = engine.camera;
  f.x = -cam.x;
  f.y = -cam.y;
}

/** The layer the Rook fight's own art goes on: in front of the Rook. */
function frontLayer(engine) {
  return ensureUi(engine)?.front || engine.fxLayer;
}

function textStyle(size, extra = {}) {
  return {
    fontFamily: 'Trebuchet MS, Verdana, sans-serif',
    fontSize: size,
    fontWeight: '900',
    fill: 0xffffff,
    align: 'center',
    dropShadow: { alpha: 0.45, blur: 3, color: 0x000000, distance: 2 },
    lineJoin: 'round',
    ...extra,
  };
}

function buildHud(engine) {
  const { PIXI } = engine;
  const hud = ui.hud;
  hud.removeChildren();
  // The client's rook head sits in its header, above the location viewport
  // (RookIncidentHeaderView.as 640-651: x at the header centre, y 45). The
  // remake's header is the page's own bar, and the viewport's top centre is
  // where the stun orb rises (G283), so the badge docks in the top right.
  const badge = new PIXI.Container();
  badge.x = BADGE.x;
  badge.y = BADGE.y;
  const disc = new PIXI.Graphics();
  const arc = new PIXI.Graphics();
  const stars = new PIXI.Graphics();
  const head = new PIXI.AnimatedSprite([PIXI.Texture.EMPTY]);
  head.anchor.set(0.5, 0.6);
  head.scale.set(0.92);
  const headMask = new PIXI.Graphics();
  headMask.circle(0, 0, 34).fill(0xffffff);
  head.mask = headMask;
  head.animationSpeed = pixiSpeed(24);
  const clock = new PIXI.Text({ text: '', style: textStyle(15, { fill: 0xfff3e0 }) });
  clock.anchor.set(0.5, 0);
  clock.y = 44;
  const phase = new PIXI.Text({ text: '', style: textStyle(11, { fill: 0xffe7a8, fontWeight: '800', letterSpacing: 1 }) });
  phase.anchor.set(0.5, 1);
  phase.y = -46;
  const stamp = new PIXI.Text({ text: 'STUN!', style: textStyle(24, { fill: 0xffffff, stroke: { color: 0x2a1438, width: 5 } }) });
  stamp.anchor.set(1, 0.5);
  stamp.x = -52; // left of the docked badge, so it grows inward
  stamp.alpha = 0;
  const armor = new PIXI.Text({ text: '', style: textStyle(11, { fill: 0xbaf7d0, fontWeight: '800' }) });
  armor.anchor.set(1, 0.5);
  armor.x = -50;
  armor.y = -20;
  const feedBox = new PIXI.Graphics();
  const feed = new PIXI.Text({ text: '', style: {
    fontFamily: 'Trebuchet MS, Verdana, sans-serif',
    fontSize: 12,
    fill: 0x4a4a52,
    align: 'center',
    wordWrap: true,
    wordWrapWidth: 270,
    lineHeight: 16,
  } });
  feed.anchor.set(0.5, 0);
  feed.x = BADGE.feedX;
  feed.y = 70;
  badge.addChild(disc, headMask, arc, stars, head, phase, clock, stamp, armor, feedBox, feed);
  hud.addChild(badge);
  ui.badge = { root: badge, disc, arc, stars, head, clock, phase, stamp, armor, feedBox, feed, stampUntil: 0 };
  ui.head = head;
  badge.visible = false;
}

function setHeadClip(clip, { once = false, lockMs = 0 } = {}) {
  const head = ui?.head;
  if (!head || !loader) return;
  const def = ROOK_SHEETS[`head_${clip}`];
  if (!def || !loader.ready(def)) return;
  if (ui.headClip === clip && !once) return;
  if (now() < ui.headLock && !once) return;
  head.textures = loader.frames(def);
  head.loop = !once;
  head.animationSpeed = pixiSpeed(24);
  head.onComplete = null;
  head.gotoAndPlay(0);
  ui.headClip = clip;
  if (lockMs) ui.headLock = now() + lockMs;
}

function baseHeadClip(a) {
  if (!a) return 'idle1';
  if (a.phase === 'dead') return 'dead';
  if (a.phase === 'stunned') return 'stunned';
  if (a.phase === 'angry') return a.angryState || 'angry1';
  return 'idle1';
}

function drawHud(engine, a) {
  const b = ui?.badge;
  if (!b) return;
  const show = Boolean(a && rookPresent(a));
  b.root.visible = show;
  if (!show) return;
  const t = now();
  const r = 38;
  b.disc.clear();
  b.disc.circle(0, 3, r + 5).fill({ color: 0x2b1b33, alpha: 0.22 });
  b.disc.circle(0, 0, r).fill({ color: 0xffffff, alpha: 0.97 });
  // Health: the crimson lower arc.
  const frac = a.maxHealth ? a.health / a.maxHealth : 0;
  b.arc.clear();
  b.arc.arc(0, 0, r - 1, 0, Math.PI).stroke({ width: 9, color: 0xd8d0d6, alpha: 1 });
  if (frac > 0) b.arc.arc(0, 0, r - 1, Math.PI - Math.PI * frac, Math.PI);
  b.arc.stroke({ width: 9, color: 0xb0132f, alpha: 1 });
  // Stun: seven stars over the top.
  b.stars.clear();
  const filled = a.phase === 'stunned' || a.phase === 'dead' ? 7 : Math.floor((a.stun / a.maxStun) * 7 + 1e-6);
  for (let i = 0; i < 7; i += 1) {
    const ang = Math.PI + (Math.PI * (i + 0.5)) / 7;
    const sx = Math.cos(ang) * (r + 12);
    const sy = Math.sin(ang) * (r + 12);
    const on = i < filled;
    drawStar(b.stars, sx, sy, on ? 7 : 5.5, on ? 0xffd23c : 0xe9e4ea, on ? 0x9a6b00 : 0xb9b1bd);
  }
  const clip = baseHeadClip(a);
  if (t >= ui.headLock) setHeadClip(clip);
  const clockS = rookClockS(a, t);
  b.clock.text = a.phase === 'angry' || a.phase === 'stunned' ? fmtClock(clockS) : '';
  b.phase.text = a.phase === 'stunned' ? 'STUNNED' : a.phase === 'angry' ? (a.angryState === 'angry3' ? 'ATTACK IMMINENT' : 'ANGRY') : a.phase === 'dead' ? 'DEFEATED' : `HEALTH ${a.health}`;
  b.armor.text = armored() ? 'Rook Armor' : '';
  const stampLeft = b.stampUntil - t;
  b.stamp.alpha = stampLeft > 0 ? Math.min(1, stampLeft / 300) : 0;
  b.stamp.scale.set(1 + Math.max(0, stampLeft - 700) / 900);
  const showFeed = feedText && (t < feedUntil || holdFx) && !overlays.length;
  b.feed.text = showFeed ? feedText : '';
  b.feedBox.clear();
  if (showFeed) {
    const h = Math.max(22, b.feed.height + 14);
    b.feedBox.roundRect(BADGE.feedX - 150, 64, 300, h + 2, 8).fill({ color: 0x000000, alpha: 0.1 });
    b.feedBox.roundRect(BADGE.feedX - 150, 62, 300, h, 8).fill({ color: 0xf2f2f0, alpha: 0.96 });
  }
}

function drawStar(g, x, y, r, fill, line) {
  const pts = [];
  for (let i = 0; i < 10; i += 1) {
    const rad = i % 2 ? r * 0.45 : r;
    const ang = -Math.PI / 2 + (i * Math.PI) / 5;
    pts.push(x + Math.cos(ang) * rad, y + Math.sin(ang) * rad);
  }
  g.poly(pts).fill({ color: fill, alpha: 1 }).stroke({ width: 1, color: line, alpha: 1 });
}

function fmtClock(s) {
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
}

/** vp_canvas + vp_overlay: a coloured fade over the location viewport with big copy. */
function showOverlay(engine, { txt, sub = '', color = ROOK_COLORS.crimson, inS = ROOK_SOURCE.overlayInS, holdS = ROOK_SOURCE.overlayHoldS, outS = ROOK_SOURCE.overlayOutS, alpha = ROOK_SOURCE.overlayAlpha } = {}) {
  if (!ensureUi(engine)) return;
  overlays.push({ txt, sub, color, inMs: inS * 1000, holdMs: holdS * 1000, outMs: outS * 1000, alpha, startedAt: 0 });
}

function updateOverlays(engine) {
  if (!ui) return;
  const { PIXI } = engine;
  const cur = overlays[0];
  ui.tint.clear();
  if (!cur) {
    ui.textLayer.removeChildren().forEach((c) => c.destroy());
    return;
  }
  const t = now();
  if (!cur.startedAt) {
    cur.startedAt = t;
    ui.textLayer.removeChildren().forEach((c) => c.destroy());
    const big = new PIXI.Text({ text: cur.txt, style: textStyle(46, { wordWrap: true, wordWrapWidth: 880 }) });
    big.anchor.set(0.5);
    big.x = VIEW_W / 2;
    big.y = VIEW_H * 0.43;
    ui.textLayer.addChild(big);
    if (cur.sub) {
      const sub = new PIXI.Text({ text: cur.sub, style: textStyle(21, { fontWeight: '800', wordWrap: true, wordWrapWidth: 560 }) });
      sub.anchor.set(0.5, 0);
      sub.x = VIEW_W / 2;
      sub.y = VIEW_H * 0.53;
      ui.textLayer.addChild(sub);
    }
  }
  let el = t - cur.startedAt;
  const total = cur.inMs + cur.holdMs + cur.outMs;
  if (holdFx && overlays.length === 1) el = Math.min(el, cur.inMs + cur.holdMs * 0.5);
  if (el >= total) {
    overlays.shift();
    ui.textLayer.removeChildren().forEach((c) => c.destroy());
    return;
  }
  let k = 1;
  if (el < cur.inMs) k = el / cur.inMs;
  else if (el > cur.inMs + cur.holdMs) k = 1 - (el - cur.inMs - cur.holdMs) / cur.outMs;
  ui.tint.rect(0, 0, VIEW_W, SCREEN_H).fill({ color: cur.color, alpha: cur.alpha * k });
  ui.textLayer.alpha = Math.max(0, Math.min(1, k * 1.15));
}

function ensureRook(engine) {
  if (!ensureUi(engine)) return null;
  if (ui.rook && !ui.rook.destroyed) return ui.rook;
  if (!loader?.ready(ROOK_SHEETS.hover)) return null;
  const { PIXI } = engine;
  const rook = new PIXI.AnimatedSprite(loader.frames(ROOK_SHEETS.hover));
  rook.anchor.set(0.5, 0.42);
  rook.animationSpeed = pixiSpeed(15);
  rook.loop = true;
  rook.play();
  rook.x = ROOK_HOME.x;
  rook.y = -180;
  rook.scale.set(ROOK_HOME.scale);
  rook.eventMode = 'static';
  rook.cursor = 'pointer';
  rook.hitArea = new PIXI.Rectangle(-150, -110, 300, 200);
  rook.on('pointertap', () => {
    if (engineRef) startStun(engineRef, 'click');
  });
  ui.rookLayer.addChild(rook);
  ui.rook = rook;
  ui.rookStars = new PIXI.Graphics();
  ui.rookLayer.addChild(ui.rookStars);
  return rook;
}

function rookScreenPos() {
  const r = ui?.rook;
  return r && !r.destroyed ? { x: r.x, y: r.y - 20 * r.scale.y } : { x: ROOK_HOME.x, y: ROOK_HOME.y };
}

function removeRook() {
  if (ui?.rook && !ui.rook.destroyed) ui.rook.destroy();
  if (ui?.rookStars && !ui.rookStars.destroyed) ui.rookStars.destroy();
  if (ui) {
    ui.rook = null;
    ui.rookStars = null;
  }
}

function updateRook(engine, a, dtMs) {
  const present = a && rookPresent(a) && a.phase !== 'dead';
  if (!present && !departing) {
    removeRook();
    return;
  }
  const rook = ensureRook(engine);
  if (!rook) return;
  const t = now();
  if (departing) {
    const k = Math.min(1, (t - departing.at) / departing.ms);
    rook.x = departing.x + k * 760;
    rook.y = departing.y - k * 260;
    rook.scale.set(departing.scale * (1 - 0.55 * k));
    rook.alpha = 1 - Math.max(0, k - 0.65) / 0.35;
    if (k >= 1) {
      departing = null;
      removeRook();
    }
    return;
  }
  const stunned = a.phase === 'stunned';
  let tx = ROOK_HOME.x + Math.sin(t / 2300) * 36;
  let ty = (stunned ? ROOK_HOME.y + 34 : ROOK_HOME.y) + Math.sin(t / 900) * (stunned ? 4 : 9);
  let sc = ROOK_HOME.scale;
  if (swoop) {
    let k = (t - swoop.at) / swoop.ms;
    if (holdSwoop) k = Math.min(k, 0.42);
    if (k >= 1) swoop = null;
    else {
      const p = k < 0.42 ? k / 0.42 : 1 - (k - 0.42) / 0.58;
      const ease = p * p * (3 - 2 * p);
      tx = tx + (VIEW_W / 2 - tx) * ease;
      ty = ty + (250 - ty) * ease;
      sc = ROOK_HOME.scale * (1 + 1.25 * ease);
    }
  }
  rook.x += (tx - rook.x) * Math.min(1, dtMs / 260);
  rook.y += (ty - rook.y) * Math.min(1, dtMs / 380);
  rook.scale.set(sc);
  rook.rotation = stunned ? Math.sin(t / 420) * 0.09 : 0;
  rook.animationSpeed = pixiSpeed(stunned ? 6 : 15);
  rook.tint = stunned ? 0xd8c8f0 : 0xffffff;
  const g = ui.rookStars;
  g.clear();
  if (stunned) {
    const hx = rook.x;
    const hy = rook.y - 60 * rook.scale.y;
    for (let i = 0; i < 5; i += 1) {
      const ang = t / 380 + (i * Math.PI * 2) / 5;
      drawStar(g, hx + Math.cos(ang) * 46, hy + Math.sin(ang) * 12, 7, 0xffe14a, 0x9a6b00);
    }
  }
}

function spawnSilhouettes(engine, n = 4) {
  if (!ensureUi(engine) || !loader?.ready(ROOK_SHEETS.side)) return;
  const { PIXI } = engine;
  for (let i = 0; i < n; i += 1) {
    const s = new PIXI.AnimatedSprite(loader.frames(ROOK_SHEETS.side));
    s.anchor.set(0.5);
    s.animationSpeed = pixiSpeed(18);
    s.gotoAndPlay(Math.floor(Math.random() * 18));
    const scale = 0.11 + Math.random() * 0.09;
    s.scale.set(-scale, scale); // the art faces left; fly right
    s.tint = 0x1e1428;
    s.alpha = 0.85;
    s.x = -60 - Math.random() * 380;
    s.y = 34 + Math.random() * 110;
    s._vx = 0.07 + Math.random() * 0.06;
    s._bob = Math.random() * 6;
    ui.rookLayer.addChildAt(s, 0);
    silhouettes.push(s);
  }
}

function updateSilhouettes(dtMs) {
  silhouettes = silhouettes.filter((s) => {
    if (s.destroyed) return false;
    s.x += s._vx * dtMs;
    s._bob += dtMs / 400;
    s.y += Math.sin(s._bob) * 0.25;
    if (s.x > VIEW_W + 80) {
      s.destroy();
      return false;
    }
    return true;
  });
}

function spawnFeathers(engine, x, y, n = 9) {
  if (!ensureUi(engine)) return;
  const { PIXI } = engine;
  for (let i = 0; i < n; i += 1) {
    const f = new PIXI.Graphics();
    const len = 9 + Math.random() * 8;
    f.ellipse(0, 0, len * 0.32, len).fill({ color: i % 3 ? 0x2a1d36 : 0x4b3a60, alpha: 0.95 });
    f.moveTo(0, -len).lineTo(0, len + 3).stroke({ width: 1, color: 0x9b8bb0, alpha: 0.8 });
    f.x = x + (Math.random() - 0.5) * 120;
    f.y = y + (Math.random() - 0.5) * 40;
    f._vy = 0.03 + Math.random() * 0.04;
    f._sway = Math.random() * 6;
    f._life = 3000;
    f._delay = 250 + i * 60;
    f.alpha = 0;
    ui.fxLayer.addChild(f);
    feathers.push(f);
  }
}

function updateFeathers(dtMs) {
  feathers = feathers.filter((f) => {
    if (f.destroyed) return false;
    if (f._delay > 0) {
      f._delay -= dtMs;
      return true;
    }
    f._life -= dtMs;
    f._sway += dtMs / 300;
    f.y += f._vy * dtMs;
    f.x += Math.sin(f._sway) * 0.9;
    f.rotation = Math.sin(f._sway) * 0.7;
    f.alpha = Math.min(1, f._life / 600);
    if (f._life <= 0) {
      f.destroy();
      return false;
    }
    return true;
  });
}

/*
 * The recovered overlays (G251, tools/overlay-art WebP sheets via
 * js/overlay-art.js playSheetOverlay), standing on their point the way the
 * client's in-location overlays did. &rookarthold=<ms> freezes each at that
 * moment for screenshots.
 */
function playArt(engine, key, opts) {
  const hold = engine.param?.('rookarthold');
  const h = playSheetOverlay(engine.PIXI, key, {
    layer: frontLayer(engine) || engine.entityLayer,
    holdMs: hold != null && hold !== '' && Number.isFinite(Number(hold)) ? Number(hold) : null,
    ...opts,
  });
  artOverlays.push(h);
  h.done.then(() => { artOverlays = artOverlays.filter((x) => x !== h); });
  engine.setData('rookOverlay', key);
  return h;
}

/**
 * doOrbAttack (locations/inc_rook.js 697-707, 778-785): location_overlay
 * focusing_orb_laser_beam at the initiator, raised 50 - 100 x scale px
 * (scale = min(players / 6, 1)), for 1 s, then overlay_scale to 1 + scale
 * over 0.25 s (easeOutBack).
 */
function orbLaser(engine, joiners) {
  const p = engine.player;
  if (!p) return;
  const s = Math.min(Math.max(0, joiners) / 6, 1);
  const at = { x: p.x, y: p.y - (50 - s * 100) };
  playArt(engine, 'focusing_orb_laser_beam', { at: () => at, durationMs: 1000, zoomAt: (ms) => 1 + s * easeOutBack(ms / 250) });
}

/**
 * launchAttack (items/include/shrines.js 1055-1071): itemstack_overlay
 * shrine_laser_beam_1 (2 for 100+ damage, 3 for an emblem) on the shrine,
 * delta_x 5, delta_y 140 from its top, for 2 s.
 */
function shrineLaser(engine, spr, size) {
  if (!spr) return;
  const at = itemstackOverlayPoint(spr.x, displayTopOf(spr), { dx: 5, dy: 140 });
  playArt(engine, `shrine_laser_beam_${Math.max(1, Math.min(3, size))}`, { at: () => at, durationMs: 2000 });
}

/**
 * show_rainbow (players/player.js 3014-3029): pc_overlay, 400 x 400 at the
 * avatar, 4 s, rainbow_youdidit for the Rook's defeat (locations/inc_rook.js
 * 204). The SWF stop()s on its last frame.
 */
function youDidItRainbow(engine) {
  const p = engine.player;
  playArt(engine, 'rainbow_youdidit', { at: () => ({ x: p.x, y: p.y }), wh: 400, durationMs: 4000, loop: false });
}

/**
 * revive's third dose (items/include/rook.js 208-222): itemstack_overlay
 * rainbow_fullyrevived, 400 x 400, following the stack, 4 s.
 */
function revivedRainbow(engine, spr) {
  let last = itemstackOverlayPoint(spr.x, displayTopOf(spr));
  const at = () => {
    if (spr && !spr.destroyed) last = itemstackOverlayPoint(spr.x, displayTopOf(spr));
    return last;
  };
  playArt(engine, 'rainbow_fullyrevived', { at, wh: 400, durationMs: 4000, loop: false });
}

// ---------------------------------------------------------------------------
// Herald: the Forehorseman
// ---------------------------------------------------------------------------

function spawnForehorseman(engine) {
  if (fore || !loader?.ready(ROOK_SHEETS.fore) || !engine.player) return;
  const { PIXI } = engine;
  const p = engine.player;
  const x = Math.max(120, Math.min(engine.worldW - 120, p.x + (p.x > engine.worldW - 400 ? -230 : 230)));
  const y = nearestSurfaceY(engine.platforms, x, p.y) ?? p.y;
  const spr = new PIXI.AnimatedSprite(loader.frames(ROOK_SHEETS.fore));
  spr.anchor.set(0.5, 0.96);
  spr.animationSpeed = pixiSpeed(15);
  spr.loop = true;
  spr.play();
  spr.x = x;
  spr.y = y + 2;
  spr.zIndex = 24;
  spr.scale.set(0.78);
  spr._worldHitW = 90;
  spr._worldHitH = 150;
  spr.alpha = 0;
  engine.entityLayer.addChild(spr);
  const target = engine.register({
    classId: 'npc_forehorseman',
    featureId: ROOK_FEATURE_ID,
    label: 'Forehorseman',
    subtitle: 'THE END IS NEIGH',
    sprite: spr,
  });
  fore = { sprite: spr, target, flipAt: now() + ROOK_SOURCE.forehorsemanFlipMs, speakAt: now() + ROOK_SOURCE.forehorsemanSpeakDelayMs, dir: -1, leaving: 0 };
}

function updateForehorseman(engine, dtMs) {
  if (!fore) return;
  const spr = fore.sprite;
  if (!spr || spr.destroyed) {
    fore = null;
    return;
  }
  const t = now();
  if (fore.leaving) {
    spr.alpha = Math.max(0, spr.alpha - dtMs / 900);
    spr.x += fore.dir * 0.12 * dtMs;
    if (spr.alpha <= 0) removeForehorseman(engine);
    return;
  }
  spr.alpha = Math.min(1, spr.alpha + dtMs / 600);
  if (t >= fore.flipAt) {
    fore.flipAt = t + ROOK_SOURCE.forehorsemanFlipMs;
    fore.speakAt = t + ROOK_SOURCE.forehorsemanSpeakDelayMs;
    fore.dir *= -1;
  }
  if (fore.speakAt && t >= fore.speakAt) {
    fore.speakAt = 0;
    const line = FOREHORSEMAN_LINES[Math.floor(Math.random() * FOREHORSEMAN_LINES.length)];
    engine.say(fore.target, line, ROOK_SOURCE.forehorsemanBubbleMs);
  }
  // The art faces right.
  spr.scale.set(0.78 * (fore.dir > 0 ? 1 : -1), 0.78);
}

function removeForehorseman(engine) {
  if (!fore) return;
  if (fore.target) engine.unregister(fore.target);
  else if (fore.sprite && !fore.sprite.destroyed) fore.sprite.destroy();
  fore = null;
}

// ---------------------------------------------------------------------------
// Attack lifecycle
// ---------------------------------------------------------------------------

function startMusic(engine) {
  if (musicStop || musicFor) return;
  musicFor = engine.streetTsid;
  engine.playCue(ROOK_MUSIC, { volume: 0.55, loop: true }).then((stop) => {
    if (musicFor !== engine.streetTsid) {
      stop();
      return;
    }
    musicStop = stop;
  });
}

function stopMusic() {
  musicFor = '';
  if (musicStop) musicStop();
  musicStop = null;
}

function beginAttack(engine, { heraldMs = ROOK_SOLO.heraldMs, health } = {}) {
  const t = now();
  save.active = createRookAttack({ tsid: engine.streetTsid, now: t, heraldMs, health });
  save.lastStreet = engine.streetTsid;
  save.stats.attacks += 1;
  lastAction = heraldMs > 0 ? 'herald' : 'attack';
  ensureUi(engine);
  handleEvents(engine, save.active, stepRookAttack(save.active, t));
  if (heraldMs <= 0) onAttackStart(engine);
  engine.save();
}

function onAttackStart(engine) {
  showOverlay(engine, ROOK_TEXT.attack);
  setFeed('A Rook descends on the street. Use your Focusing Orb to start a stun attack.', 9000);
  engine.pushActivity('ROOK ATTACK! A Rook descends on the street.');
  engine.playSound('ROOK_CAW', { volume: 0.55 });
  startMusic(engine);
  if (fore) fore.leaving = now();
  lastAction = 'attack_start';
}

function onWingBeat(engine, a) {
  swoop = { at: now(), ms: 1700 };
  shakeUntil = now() + 1100;
  spawnFeathers(engine, VIEW_W / 2, 210, 14);
  const armor = armored();
  const energy = soloCost(ROOK_SOURCE.wingBeatEnergy, { armor });
  const mood = soloCost(ROOK_SOURCE.wingBeatMood, { armor, armorRule: 'none' });
  grant(engine, { energy: -energy, mood: -mood });
  engine.floatText(engine.player.x, engine.player.y - 130, `-${energy} energy${mood ? ` -${mood} mood` : ''}`, 0xff8a8a);
  const hit = rookStreet(engine);
  engine.pushActivity({ base: `The Rook attacks! ${hit.length} ${hit.length === 1 ? 'thing was' : 'things were'} rooked.`, effects: { energy: -energy, mood: -mood } });
  setFeed(`The Rook swooped! ${hit.length} rooked. ${a.phase === 'departed' ? '' : 'Stun it before it strikes again.'}`);
  engine.playSound('ROOK_CAW', { volume: 0.5, rate: 0.8, allowMultiple: true });
  lastAction = `wing_beat:${hit.length}`;
}

function onDefeat(engine, a) {
  showOverlay(engine, { ...ROOK_TEXT.defeated, color: ROOK_COLORS.teal, holdS: 4.5 });
  setHeadClip('killShot', { once: true, lockMs: 1300 });
  const r = ui?.rook;
  if (r && !r.destroyed) departing = { at: now(), ms: 2600, x: r.x, y: r.y, scale: r.scale.x };
  spawnFeathers(engine, rookScreenPos().x, rookScreenPos().y, 22);
  const xp = grant(engine, { xp: defeatXpFor(a) });
  engine.pushActivity({ base: a.damageDealt > 0 ? ROOK_TEXT.defeatHelp(xp) : ROOK_TEXT.defeatWitness(xp), effects: { xp } });
  youDidItRainbow(engine);
  engine.playSound('RAINBOW_YOUDIDIT', { volume: 0.7 });
  if (armored()) engine.achievement('essence_of_rookswort:defeated_rook', 1);
  save.stats.defeats += 1;
  endPrime(engine, false);
  cancelOrb(engine, 'defeated');
  lastAction = `defeated:${xp}`;
}

function onDepart(engine) {
  showOverlay(engine, { ...ROOK_TEXT.departed, color: ROOK_COLORS.herald, holdS: 2.5 });
  const r = ui?.rook;
  if (r && !r.destroyed) departing = { at: now(), ms: 3000, x: r.x, y: r.y, scale: r.scale.x };
  save.stats.departures += 1;
  cancelOrb(engine, 'departed');
  endPrime(engine, false);
  lastAction = 'departed';
}

function finishAttack(engine) {
  save.active = null;
  scheduleNextAttack(save, now());
  stopMusic();
  engine.save();
}

function handleEvents(engine, a, events) {
  for (const ev of events) {
    if (ev.type === 'herald_warning') {
      showOverlay(engine, { ...ROOK_TEXT.herald, color: ROOK_COLORS.herald, inS: 0.35, holdS: 1.3, outS: 0.35, alpha: 0.72 });
      spawnSilhouettes(engine, 3 + ev.n);
      engine.playSound('ROOK_CAW', { volume: 0.35, rate: 1.15 });
      if (ev.n === 1) engine.pushActivity('A Forehorseman gallops through, ringing his bells. Something is coming.');
    } else if (ev.type === 'attack_start') {
      onAttackStart(engine);
    } else if (ev.type === 'angry2') {
      setHeadClip('taunt', { once: true, lockMs: 1500 });
    } else if (ev.type === 'angry3') {
      showOverlay(engine, ROOK_TEXT.imminent);
      lastAction = 'imminent';
    } else if (ev.type === 'wing_beat') {
      onWingBeat(engine, a);
    } else if (ev.type === 'depart') {
      onDepart(engine);
    } else if (ev.type === 'stun_recovery') {
      setFeed('The Rook shakes off the stun. Stun it again!');
      endPrime(engine, true);
      lastAction = 'stun_recovery';
    } else if (ev.type === 'clear') {
      finishAttack(engine);
    }
  }
}

/** Timers for an attack on a street the player is not on: rook items there later. */
function handleRemoteEvents(engine, a, events) {
  for (const ev of events) {
    if (ev.type === 'wing_beat') {
      const s = slot(engine, a.tsid);
      s.pendingBeats += 1;
    } else if (ev.type === 'depart') {
      save.stats.departures += 1;
    } else if (ev.type === 'clear') {
      finishAttack(engine);
    }
  }
}

// ---------------------------------------------------------------------------
// Stun attack (Focusing Orb)
// ---------------------------------------------------------------------------

function stunGate(engine) {
  const a = here(engine);
  if (!a || !rookPresent(a)) return { ok: false, reason: ROOK_TEXT.stunWait };
  if (!canStun(a)) return { ok: false, reason: ROOK_TEXT.stunWait };
  if (orb) return { ok: false, reason: 'Your orb is already gathering imagination.' };
  if (countItem(engine.inv, ORB_CLASS) <= 0) return { ok: false, reason: 'You need a Focusing Orb to stun the Rook.' };
  const cost = soloCost(ROOK_SOURCE.stunEnergy, { armor: armored() });
  if ((engine.pc.energy || 0) < cost) return { ok: false, reason: ROOK_TEXT.stunTired };
  return { ok: true, cost };
}

function startStun(engine, source = 'verb') {
  const gate = stunGate(engine);
  if (!gate.ok) {
    if (source !== 'auto') engine.toast(gate.reason, 2200);
    return false;
  }
  grant(engine, { energy: -gate.cost });
  engine.pushActivity({ base: ROOK_TEXT.stunStarted(gate.cost), effects: { energy: -gate.cost } });
  const { PIXI } = engine;
  const p = engine.player;
  const entries = rookableTargets(engine);
  const s = slot(engine);
  const shrine = shrineTarget(engine);
  const order = orbJoinOrder(
    entries.map((e) => ({ key: e.key, x: e.x, rooked: Boolean(s.rooked[e.key]) })),
    p.x,
    { shrineKey: shrine ? 'shrine' : '' }
  );
  const root = new PIXI.Container();
  root.zIndex = 40;
  // orbCountMessage (locations/inc_rook.js 502-520): the joined count as a
  // second pc_overlay at delta_y -175. With no width the client sizes the
  // text box to the text and centres it on the avatar, bottom edge at
  // delta_y (InLocationAnnouncementOverlay.as showText 376-391), so its
  // align="right" moves nothing (G291).
  const count = new PIXI.Text({ text: '0', style: textStyle(20, { fill: 0xffffff }) });
  count.anchor.set(0.5, 1);
  root.addChild(count);
  root.eventMode = 'static';
  root.cursor = 'pointer';
  root.hitArea = new PIXI.Circle(0, 0, 40);
  root.on('pointertap', () => releaseOrb(engine));
  frontLayer(engine).addChild(root);
  holdHeadroom(engine, Infinity);
  // The orb itself: Tiny Speck's focusing_orb_attack (G272), state by joiners.
  const art = playArt(engine, 'focusing_orb_attack', {
    at: () => ({ x: p.x, y: p.y + ORB_ART.dy }),
    durationMs: ROOK_SOURCE.orbWindowMs / timeScale + 1000,
    state: orbLookFor(0).state,
    zIndex: 39,
  });
  orb = {
    root,
    art,
    count,
    startedAt: now(),
    joiners: 0,
    order,
    nextJoinAt: now() + ROOK_SOLO.joinIntervalMs / timeScale,
    motes: [],
    entries,
    shrine,
  };
  lastAction = `orb_start:${order.length}`;
  engine.playSound('FOCUSING_ORB', { volume: 0.5 });
  return true;
}

/** Look up ORB_HEADROOM.dy until `until` (ms clock), unless Camera Mode already looks elsewhere. */
function holdHeadroom(engine, until) {
  if (typeof engine.setCameraLook !== 'function') return;
  if (headroom) {
    headroom.until = until;
    return;
  }
  const look = engine.cameraLook || { x: 0, y: 0 };
  if (look.x || look.y) return;
  engine.setCameraLook(0, -ORB_HEADROOM.dy);
  headroom = { until };
}

/** Let the camera settle back once the beam is done (or at once on `force`). */
function releaseHeadroom(engine, force = false) {
  if (!headroom || (!force && now() < headroom.until)) return;
  const look = engine.cameraLook;
  if (look && look.x === 0 && look.y === -ORB_HEADROOM.dy) engine.setCameraLook(0, 0);
  headroom = null;
}

function spawnMote(engine, from) {
  const { PIXI } = engine;
  const m = new PIXI.Graphics();
  m.circle(0, 0, 10).fill({ color: 0xfff6b0, alpha: 0.35 });
  m.circle(0, 0, 4).fill({ color: 0xffffff, alpha: 0.95 });
  m.x = from.x;
  m.y = from.y;
  m._from = { ...from };
  m._t = 0;
  m.eventMode = 'none';
  frontLayer(engine).addChild(m);
  orb.motes.push(m);
}

/**
 * orbAttackAnnc (locations/inc_rook.js 455-500): pc_overlay
 * focusing_orb_attack, delta_y -163, no width (the 295.7 x 294.75 stage at
 * 1:1), state orb1 (nobody joined), orb2 (1-2), orb3 (3-5), orb4 (6-9),
 * orbBreak (10+). The orb clip sits at (148.25, 145.4) on that stage, so it
 * shows about 312 px above your feet; orbCountMessage's count is at -175.
 */
const ORB_ART = Object.freeze({ dy: -163, orbAbove: 163 + (294.75 - 145.4), countDy: -175 });

function orbCenter(engine) {
  const p = engine.player;
  return { x: p.x, y: p.y - ORB_ART.orbAbove };
}

function updateOrb(engine, dtMs) {
  if (!orb) return;
  const t = now();
  const c = orbCenter(engine);
  if (t >= orb.nextJoinAt && orb.joiners < orb.order.length) {
    const key = orb.order[orb.joiners];
    let from = null;
    if (key === 'shrine' && orb.shrine?.sprite && !orb.shrine.sprite.destroyed) {
      from = { x: orb.shrine.sprite.x, y: orb.shrine.sprite.y - 100 };
    } else {
      const e = orb.entries.find((x) => x.key === key);
      if (e?.target?.sprite && !e.target.sprite.destroyed) from = { x: e.target.sprite.x, y: e.target.sprite.y - 40 };
    }
    if (from) spawnMote(engine, from);
    orb.joiners += 1;
    orb.nextJoinAt = t + ROOK_SOLO.joinIntervalMs / timeScale;
    lastAction = `orb_join:${orb.joiners}`;
  }
  orb.motes = orb.motes.filter((m) => {
    if (m.destroyed) return false;
    m._t += dtMs / 650;
    const k = Math.min(1, m._t);
    const arc = Math.sin(k * Math.PI) * 60;
    m.x = m._from.x + (c.x - m._from.x) * k;
    m.y = m._from.y + (c.y - m._from.y) * k - arc;
    if (k >= 1) {
      m.destroy();
      return false;
    }
    return true;
  });
  orb.art?.setState?.(orbLookFor(orb.joiners).state);
  const left = Math.max(0, 1 - (t - orb.startedAt) / (ROOK_SOURCE.orbWindowMs / timeScale));
  orb.root.x = c.x;
  orb.root.y = c.y;
  // inc_rook.js 521-522: the count rises 30 px as joiners reach six.
  orb.count.x = 0;
  orb.count.y = ORB_ART.countDy - 30 * Math.min(orb.joiners / 6, 1) + ORB_ART.orbAbove;
  orb.count.text = String(orb.joiners);
  // The window ends at 15 s, or a moment after the last joiner arrives.
  const allIn = orb.joiners >= orb.order.length && !orb.motes.length && t >= orb.nextJoinAt - (ROOK_SOLO.joinIntervalMs / timeScale) * 0.4;
  if (left <= 0 || allIn) releaseOrb(engine);
}

function cancelOrb(engine, why = '') {
  if (!orb) return;
  orb.art?.stop();
  for (const m of orb.motes) if (!m.destroyed) m.destroy();
  if (!orb.root.destroyed) orb.root.destroy({ children: true });
  orb = null;
  if (headroom) headroom.until = now();
  if (why) lastAction = `orb_cancel:${why}`;
}

function releaseOrb(engine) {
  if (!orb) return;
  const joiners = orb.joiners;
  cancelOrb(engine);
  if (headroom) headroom.until = now() + ORB_HEADROOM.afterMs;
  const a = here(engine);
  if (!a) return;
  const r = resolveStun(a, joiners, now(), PLAYER_LABEL);
  if (!r.ok) {
    engine.toast(r.reason, 2000);
    return;
  }
  const armor = armored();
  if (r.failed) {
    const mood = armor ? 0 : soloCost(ROOK_SOURCE.failMood);
    const xp = grant(engine, { xp: r.xp, mood: -mood });
    engine.pushActivity({ base: ROOK_TEXT.stunFailed(xp, mood), effects: { xp, mood: -mood } });
    setFeed(r.text);
    lastAction = 'stun_failed';
    engine.save();
    return;
  }
  orbLaser(engine, joiners);
  spawnFeathers(engine, rookScreenPos().x, rookScreenPos().y);
  setHeadClip('stun', { once: true, lockMs: 1100 });
  if (ui?.badge) {
    ui.badge.stamp.text = `STUN! ${r.damage}`;
    ui.badge.stampUntil = now() + 1400;
  }
  const xp = grant(engine, { xp: r.xp });
  const assistXp = grant(engine, { xp: r.assistXp });
  engine.pushActivity({ base: ROOK_TEXT.stunInitiatorXp(xp), effects: { xp } });
  engine.pushActivity(ROOK_TEXT.stunStruck(r.damage, assistXp));
  engine.floatText(engine.player.x, engine.player.y - 190, `STUN ${r.damage}`, 0xfff27a);
  setFeed(r.text);
  save.stats.stuns += 1;
  if (r.firstAttempt) showOverlay(engine, ROOK_TEXT.firstStun);
  if (r.stunned) {
    showOverlay(engine, ROOK_TEXT.stunned);
    setFeed(ROOK_TEXT.stunnedNote, 9000);
    engine.playSound('MEDITATION_SUCCESS', { volume: 0.5 });
  }
  engine.playSound('EFFECT_MILD', { volume: 0.5 });
  lastAction = `stun:${r.damage}:${a.stun}`;
  engine.save();
}

// ---------------------------------------------------------------------------
// Shrine priming and strikes
// ---------------------------------------------------------------------------

function prime(engine, target) {
  const a = here(engine);
  if (!canStrike(a)) {
    engine.toast(ROOK_TEXT.primeNotStunned, 2400);
    return;
  }
  const cost = soloCost(ROOK_SOURCE.primeEnergy, { armor: armored() });
  if ((engine.pc.energy || 0) <= cost) {
    engine.toast("You don't have enough energy to do that!", 2200);
    return;
  }
  grant(engine, { energy: -cost });
  primed = { target, until: now() + ROOK_SOURCE.primeMs / Math.max(1, timeScale / 2), damage: 0, strikeAt: 0 };
  engine.pushActivity({ base: `You primed the ${target.label}.`, effects: { energy: -cost } });
  setFeed('The shrine is primed. Strike the Rook with an offering!');
  lastAction = 'primed';
  engine.playSound('DONATE_TO_SHRINE', { volume: 0.5 });
}

function endPrime(engine, announce = true) {
  if (!primed) return;
  const total = primed.damage;
  if (primed.ring && !primed.ring.destroyed) primed.ring.destroy();
  primed = null;
  closeOfferPanel();
  if (!announce) return;
  const xp = total ? grant(engine, { xp: Math.round(total / 2) }) : 0;
  engine.pushActivity(ROOK_TEXT.primeDone(xp, total));
}

function strikeGate(engine, target) {
  const a = here(engine);
  if (!a || !rookPresent(a)) return { ok: false, reason: '' };
  if (!canStrike(a)) return { ok: false, reason: ROOK_TEXT.donateBlocked };
  if (!primed || primed.target !== target) return { ok: false, reason: ROOK_TEXT.strikeNeedsPrime };
  if (now() < primed.strikeAt) return { ok: false, reason: 'The shrine is still recharging.' };
  return { ok: true };
}

/** The player primed the shrine, so their Shrine On card counts. */
function primeBonusFor(engine) {
  return shrinePrimeBonus(engine.pc?.imaginationUpgrades || []);
}

function offerOptions(engine, giantId) {
  const inv = engine.inv;
  const out = [];
  for (const [classTsid, n] of Object.entries(inv)) {
    if (!(n > 0)) continue;
    const meta = ITEM_CATALOG[classTsid];
    if (!meta || meta.isTool || meta.donatable === false) continue;
    const emblem = classTsid === `emblem_${giantId}`;
    if (!emblem && (meta.tags || []).includes('emblem')) continue;
    const base = donationValueFor(classTsid);
    out.push({
      classTsid,
      label: meta.label || classTsid,
      icon: meta.icon,
      count: n,
      emblem,
      one: strikeDamageFor({ baseCost: base, count: 1, emblem, primeBonus: primeBonusFor(engine) }),
      all: strikeDamageFor({ baseCost: base, count: n, emblem, primeBonus: primeBonusFor(engine) }),
    });
  }
  return out.sort((a, b) => b.all - a.all).slice(0, 24);
}

function strike(engine, target, classTsid, count) {
  const gate = strikeGate(engine, target);
  if (!gate.ok) {
    engine.toast(gate.reason || ROOK_TEXT.strikeNeedsPrime, 2000);
    return false;
  }
  const giantId = target.state?.giantId || '';
  const n = Math.max(1, Math.min(count, countItem(engine.inv, classTsid)));
  if (!removeItem(engine.inv, classTsid, n)) return false;
  const emblem = classTsid === `emblem_${giantId}`;
  const damage = strikeDamageFor({ baseCost: donationValueFor(classTsid), count: n, emblem, primeBonus: primeBonusFor(engine) });
  const a = here(engine);
  const r = applyStrike(a, damage, now(), PLAYER_LABEL);
  if (!r.ok) return false;
  primed.damage += r.damage;
  primed.strikeAt = now() + ROOK_SOURCE.strikeCooldownMs / timeScale;
  const spr = target.sprite;
  shrineLaser(engine, spr, strikeBeamFor(r.damage, emblem));
  spawnFeathers(engine, rookScreenPos().x, rookScreenPos().y);
  setHeadClip('stunnedHit', { once: true, lockMs: 1100 });
  const xp = grant(engine, { xp: r.damage });
  engine.pushActivity({ base: ROOK_TEXT.strikeHit(r.damage, xp), effects: { xp } });
  engine.floatText(spr.x, spr.y - 170, `-${r.damage}`, 0xff5a6e);
  setFeed(r.text);
  save.stats.strikes += 1;
  engine.refreshPack();
  lastAction = `strike:${r.damage}:${a.health}`;
  if (r.dead) {
    endPrime(engine, true);
    onDefeat(engine, a);
  }
  engine.save();
  return true;
}

function closeOfferPanel() {
  if (offerPanel?.parentElement) offerPanel.parentElement.removeChild(offerPanel);
  offerPanel = null;
}

/** "(Donate To) what?": the shrine's offering grid, one or all of a stack. */
function openOfferPanel(engine, target) {
  closeOfferPanel();
  if (typeof document === 'undefined') return;
  const gate = strikeGate(engine, target);
  if (!gate.ok) {
    engine.toast(gate.reason || ROOK_TEXT.strikeNeedsPrime, 2200);
    return;
  }
  const giantId = target.state?.giantId || '';
  const options = offerOptions(engine, giantId);
  const host = document.getElementById('verb-menu')?.parentElement || document.body;
  const wrap = document.createElement('div');
  wrap.className = 'verb-menu rook-offer-panel';
  wrap.id = 'rook-offer-panel';
  wrap.setAttribute('role', 'dialog');
  wrap.setAttribute('aria-modal', 'true');
  wrap.innerHTML = `
    <div class="verb-menu-card" style="max-width:420px">
      <div class="verb-menu-head">
        <div class="verb-menu-title">Strike the Rook with what?</div>
        <button type="button" class="verb-menu-x" aria-label="Close">×</button>
      </div>
      <div class="verb-menu-sub" style="padding:0 0.85rem">A primed shrine turns an offering into a beam of holy vengeance.</div>
      <ul class="rook-offer-list" style="list-style:none;margin:0;padding:0.5rem 0.85rem 0.85rem;display:grid;gap:0.35rem;max-height:260px;overflow:auto"></ul>
    </div>`;
  const list = wrap.querySelector('.rook-offer-list');
  if (!options.length) {
    list.innerHTML = '<li style="opacity:0.7">You don\'t have anything the shrine wants!</li>';
  }
  for (const o of options) {
    const li = document.createElement('li');
    li.style.cssText = 'display:grid;grid-template-columns:32px 1fr auto auto;gap:0.45rem;align-items:center';
    li.innerHTML = `<img alt="" width="28" height="28" style="object-fit:contain" />
      <span style="font-size:0.85rem"></span>
      <button type="button" class="verb-choice" data-n="1" style="width:auto;padding:0.25rem 0.55rem;border:1px solid #e4d9c4;border-radius:8px"></button>
      <button type="button" class="verb-choice" data-n="all" style="width:auto;padding:0.25rem 0.55rem;border:1px solid #d9a3ad;border-radius:8px;background:#fbecee;font-weight:700"></button>`;
    li.querySelector('img').src = o.icon || '';
    li.querySelector('span').textContent = `${o.label} ×${o.count}`;
    const [one, all] = li.querySelectorAll('button');
    one.textContent = `1 · ${o.one}`;
    all.textContent = `All · ${o.all}`;
    one.addEventListener('click', () => {
      closeOfferPanel();
      strike(engine, target, o.classTsid, 1);
    });
    all.addEventListener('click', () => {
      closeOfferPanel();
      strike(engine, target, o.classTsid, o.count);
    });
    list.appendChild(li);
  }
  wrap.querySelector('.verb-menu-x').addEventListener('click', closeOfferPanel);
  wrap.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeOfferPanel();
  });
  host.appendChild(wrap);
  offerPanel = wrap;
  requestAnimationFrame(() => wrap.querySelector('button.verb-choice')?.focus());
}

function updatePrimeFx(engine) {
  if (!primed) return;
  if (now() >= primed.until) {
    endPrime(engine, true);
    return;
  }
  const spr = primed.target.sprite;
  if (!spr || spr.destroyed) return;
  if (!primed.ring || primed.ring.destroyed) {
    primed.ring = new engine.PIXI.Graphics();
    primed.ring.eventMode = 'none';
    engine.fxLayer.addChild(primed.ring);
  }
  const t = now();
  const g = primed.ring;
  g.clear();
  const k = 1 + Math.sin(t / 180) * 0.08;
  g.ellipse(spr.x, spr.y - 6, 90 * k, 18 * k).fill({ color: 0xfff2a0, alpha: 0.18 });
  g.ellipse(spr.x, spr.y - 6, 70 * k, 13 * k).stroke({ width: 3, color: 0xffe066, alpha: 0.8 });
  // The bobbing "click to donate" arrow over the bowl.
  const ay = spr.y - 175 + Math.sin(t / 220) * 8;
  g.poly([spr.x - 16, ay - 18, spr.x + 16, ay - 18, spr.x + 16, ay, spr.x + 26, ay, spr.x, ay + 22, spr.x - 26, ay, spr.x - 16, ay]).fill({ color: 0xffd23c, alpha: 0.95 }).stroke({ width: 2, color: 0x9a6b00, alpha: 1 });
  const left = Math.max(0, primed.until - t);
  g.arc(spr.x, ay - 44, 12, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * left) / ROOK_SOURCE.primeMs).stroke({ width: 4, color: 0xffe066, alpha: 0.95 });
}

// ---------------------------------------------------------------------------
// Revive and balm
// ---------------------------------------------------------------------------

function balmCount(engine) {
  return countItem(engine.inv, BALM_CLASS);
}

function nearestRooked(engine, range = ROOK_SOURCE.balmRange) {
  const p = engine.player;
  let best = null;
  for (const [key, row] of tracked) {
    const spr = row.target.sprite;
    if (!spr || spr.destroyed) continue;
    const d = Math.abs(spr.x - p.x);
    if (d <= range && (!best || d < best.d)) best = { key, row, d };
  }
  return best;
}

function revive(engine, target, { balm = false } = {}) {
  const key = keyOf.get(target);
  const s = slot(engine);
  if (!key || !s.rooked[key]) return false;
  if (balm) {
    const use = useBalmPoint(save, balmCount(engine));
    if (!use.ok) {
      engine.toast(ROOK_TEXT.balmNothing, 2000);
      return false;
    }
    if (use.consumeItem) removeItem(engine.inv, BALM_CLASS, 1);
    save.stats.balms += 1;
    engine.achievement(`potions_used:${BALM_CLASS}`, 1);
    engine.refreshPack();
  }
  const energy = soloCost(ROOK_SOURCE.reviveEnergy);
  const mood = soloCost(ROOK_SOURCE.reviveMood);
  const r = applyReviveDose(s, key, { balm });
  if (!r.ok) return false;
  const xp = grant(engine, { xp: r.xp, energy: -energy, mood: -mood });
  const label = rookLabel(target);
  const line = rookResponse(target.classId, r.response, Math.random, PLAYER_LABEL);
  if (line) engine.say(target, line, 4000);
  save.stats.revives += 1;
  if (r.done) {
    const favor = engine.pc.giantFavor;
    if (favor && typeof favor === 'object') for (const g of Object.keys(favor)) favor[g] = (favor[g] || 0) + r.favor;
    removeRookedVisual(engine, key);
    revivedRainbow(engine, target.sprite);
    engine.playSound('RAINBOW_FULLYREVIVED', { volume: 0.5 });
    save.stats.fullRevives += 1;
    engine.pushActivity({ base: `You revived a ${label}! +${r.favor} favor with every Giant`, effects: { xp, energy: -energy, mood: -mood } });
    lastAction = `revived:${key}`;
  } else {
    engine.pushActivity({ base: `You helped revive a ${label} (${r.doses}/${ROOK_SOURCE.reviveHealers})`, effects: { xp, energy: -energy, mood: -mood } });
    lastAction = `revive_dose:${key}:${r.doses}`;
  }
  engine.save();
  return true;
}

function rookedVerbs(engine, target) {
  const key = keyOf.get(target);
  const s = slot(engine);
  const row = s.rooked[key];
  const label = rookLabel(target);
  const energy = soloCost(ROOK_SOURCE.reviveEnergy);
  const verbs = [];
  if (balmCount(engine) > 0 || save.balmPoints > 0) {
    verbs.push({
      id: 'rook_apply_balm',
      label: 'Apply Balm to',
      enabled: true,
      tooltip: `Revive this ${label.toLowerCase()} with some Rook Balm`,
      durationMs: ROOK_SOURCE.balmPourMs,
      energy,
    });
  }
  const enough = (engine.pc.energy || 0) > energy;
  verbs.push({
    id: 'rook_revive',
    label: `Revive (${(row?.doses || 0) + 1}/${ROOK_SOURCE.reviveHealers})`,
    enabled: enough,
    reason: enough ? '' : "You don't have enough energy to do that!",
    tooltip: ROOK_TEXT.reviveTooltip.replace('$itemclass', label.toLowerCase()).replace('$energy_cost', String(energy)),
    durationMs: ROOK_SOURCE.reviveMs,
    energy,
  });
  return verbs;
}

function shrineVerbs(engine, target, a) {
  const stunned = canStrike(a);
  const cost = soloCost(ROOK_SOURCE.primeEnergy, { armor: armored() });
  const isPrimed = primed?.target === target;
  const gate = strikeGate(engine, target);
  return [
    {
      id: 'rook_prime',
      label: isPrimed ? 'Primed!' : 'Prime',
      enabled: stunned && !isPrimed && (engine.pc.energy || 0) > cost,
      reason: isPrimed ? 'This shrine is already primed.' : stunned ? '' : ROOK_TEXT.primeNotStunned,
      tooltip: ROOK_TEXT.primeTooltip.replace('$energy_cost', String(cost)),
      energy: cost,
      durationMs: 0,
    },
    {
      id: 'rook_strike',
      label: 'Strike the Rook',
      enabled: gate.ok,
      reason: gate.ok ? '' : gate.reason,
      tooltip: 'Donate an offering through the primed shrine',
      durationMs: 0,
    },
  ];
}

// ---------------------------------------------------------------------------
// QA routes
// ---------------------------------------------------------------------------

function seedDemoKit(engine) {
  ensureItem(ORB_CLASS);
  if (countItem(engine.inv, ORB_CLASS) <= 0) addItem(engine.inv, ORB_CLASS, 1);
  engine.pc.energy = 100;
  engine.pc.mood = Math.max(engine.pc.mood || 0, 80);
  engine.refreshPack();
}

function setupDemo(engine) {
  if (demoDone) return;
  const mode = String(engine.param('rookdemo') || '');
  if (!mode) return;
  demoDone = true;
  demoMode = mode;
  autoplay = String(engine.param('rookautoplay') || '');
  holdFx = engine.param('rookfx') === 'hold';
  holdSwoop = engine.param('rookfx') === 'swoop';
  if (autoplay) timeScale = 4;
  save.active = null;
  stopMusic();
  seedDemoKit(engine);
  if (mode === 'herald') {
    beginAttack(engine, { heraldMs: ROOK_SOLO.heraldMs / (autoplay ? 3 : 1) });
  } else if (mode === 'attack') {
    beginAttack(engine, { heraldMs: 0 });
  } else if (mode === 'aftermath') {
    const s = slot(engine);
    s.rooked = {};
    rookStreet(engine, Math.random, true);
    ensureItem(BALM_CLASS);
    if (balmCount(engine) <= 0) addItem(engine.inv, BALM_CLASS, 1);
    engine.refreshPack();
    setFeed('');
  }
  autoNextAt = now() + 2500;
  publish(engine, true);
}

function nearestEntry(engine, pred) {
  const p = engine.player;
  return rookableTargets(engine)
    .filter(pred)
    .sort((a, b) => Math.abs(a.x - p.x) - Math.abs(b.x - p.x))[0] || null;
}

function stepAutoplay(engine) {
  if (!autoplay || now() < autoNextAt) return;
  const a = here(engine);
  autoNextAt = now() + 900;
  if (demoMode === 'aftermath') {
    const s = slot(engine);
    if (autoStep < 3) {
      const e = nearestEntry(engine, (x) => s.rooked[x.key]);
      if (e) revive(engine, e.target);
      autoStep += 1;
    } else if (autoStep === 3) {
      const e = nearestEntry(engine, (x) => s.rooked[x.key]);
      if (e) revive(engine, e.target, { balm: true });
      autoStep += 1;
      autoplay = '';
    }
    return;
  }
  if (!a) return;
  if (autoplay === 'wingbeat') {
    if (a.phase === 'build_up' && !autoStep) {
      a.wingBeatAt = now();
      autoStep = 1;
    }
    return;
  }
  if (canStun(a) && !orb) {
    if (autoplay === 'stun' && autoStep >= 1) return;
    engine.pc.energy = Math.max(engine.pc.energy, 60);
    if (startStun(engine, 'auto')) autoStep += 1;
    return;
  }
  if (orb) return;
  if (a.phase === 'stunned') {
    if (autoplay === 'stunned') return;
    const shrine = shrineTarget(engine);
    if (!shrine) return;
    if (!primed) {
      engine.pc.energy = Math.max(engine.pc.energy, 60);
      prime(engine, shrine);
      return;
    }
    if (strikeGate(engine, shrine).ok) {
      ensureItem('plank');
      if (countItem(engine.inv, 'plank') < 40) addItem(engine.inv, 'plank', 40);
      strike(engine, shrine, 'plank', 40);
    }
  }
}

// ---------------------------------------------------------------------------
// Publishing QA data
// ---------------------------------------------------------------------------

function publish(engine, force = false) {
  const t = now();
  if (!force && t < publishAt) return;
  publishAt = t + 250;
  const a = active();
  const mine = here(engine);
  let rookedKeys = [];
  try {
    rookedKeys = Object.keys(slot(engine).rooked);
  } catch {
    rookedKeys = [];
  }
  engine.setData('rookPhase', a ? (mine ? a.phase : `away:${a.phase}`) : 'none');
  engine.setData('rookHealth', a ? `${a.health}/${a.maxHealth}` : '');
  engine.setData('rookStun', a ? `${Math.min(a.stun, a.maxStun)}/${a.maxStun}` : '');
  engine.setData('rookClock', a ? String(rookClockS(a, t)) : '');
  engine.setData('rookAngry', a?.angryState || '');
  engine.setData('rookWingBeats', a ? String(a.wingBeats) : '0');
  engine.setData('rookRooked', String(rookedKeys.length));
  engine.setData('rookRookedKeys', rookedKeys.slice(0, 16).join(','));
  engine.setData('rookOrb', orb ? `${orb.joiners}/${orb.order.length}:${orbLookFor(orb.joiners).state}` : '');
  engine.setData('rookHeadroom', headroom ? String(ORB_HEADROOM.dy) : '');
  engine.setData('rookLast', lastAction);
  engine.setData('rookFeed', feedText);
  engine.setData('rookNextAttack', save.nextAttackAt ? String(Math.max(0, Math.round((save.nextAttackAt - t) / 1000))) : '');
  engine.setData('rookArmor', armored() ? String(Math.round((save.armorUntil - t) / 1000)) : '0');
  engine.setData('rookBalmPoints', String(save.balmPoints));
  engine.setData('rookDemo', demoMode);
  engine.setData('rookArt', `rook=${ui?.rook && !ui.rook.destroyed ? 'glitch-overlays-rook_fly_forward' : 'none'},head=${ui?.headClip || ''},halo=${tracked.size}`);
  engine.setData('rookStats', Object.entries(save.stats).map(([k, v]) => `${k}=${v}`).join(','));
}

/** Other lanes' QA routes (any *demo / *autoplay param) never get a surprise Rook. */
let qaRouteCache = null;
function qaRoute(engine) {
  if (qaRouteCache == null) {
    const keys = typeof location === 'undefined' ? [] : [...new URLSearchParams(location.search).keys()];
    qaRouteCache = keys.some((key) => /demo$|autoplay$/.test(key));
  }
  return qaRouteCache;
}

// ---------------------------------------------------------------------------
// Feature
// ---------------------------------------------------------------------------

export const rookAttackFeature = {
  id: ROOK_FEATURE_ID,

  init(engine) {
    engineRef = engine;
    loader = createSheetLoader(engine.PIXI);
    loader.loadAll(Object.values(ROOK_SHEETS));
  },

  onStreetEnter(street, engine) {
    generation += 1;
    enteredAt = now();
    pendingApplied = false;
    lastScan = 0;
    const mine = generation;
    loader.loadAll(Object.values(ROOK_SHEETS)).then(() => {
      if (mine !== generation) return;
      setupDemo(engine);
      const a = here(engine);
      if (a && rookPresent(a)) {
        ensureUi(engine);
        showOverlay(engine, ROOK_TEXT.attack);
        startMusic(engine);
      }
      publish(engine, true);
    });
  },

  onStreetClear(engine) {
    generation += 1;
    cancelOrb(engine);
    releaseHeadroom(engine, true);
    endPrime(engine, false);
    closeOfferPanel();
    for (const row of tracked.values()) if (row.halo && !row.halo.destroyed) row.halo.destroy();
    tracked = new Map();
    keyOf = new WeakMap();
    classCounters = {};
    lastTalk = new Map();
    if (fore) {
      fore.target = null;
      fore = null;
    }
    for (const h of artOverlays) h.stop();
    artOverlays = [];
    overlays = [];
    swoop = null;
    departing = null;
    removeRook();
    stopMusic();
    if (ui) {
      ui.textLayer.removeChildren();
      ui.tint.clear();
      ui.sky.alpha = 0;
    }
  },

  onTick(dtMs, t, engine) {
    if (!engine.started || !engine.player) return;
    // Schedule (about hourly) on rookable streets only.
    if (!save.nextAttackAt) scheduleNextAttack(save, t);
    if (!active() && t >= save.nextAttackAt && !demoMode && !qaRoute(engine)) {
      const rookable = streetIsRookable({ hasShrine: hasShrine(engine), instance: engine.transientInstance(), home: engine.homeContext().inHome });
      if (rookable && !engine.busy() && t - enteredAt > 8000) beginAttack(engine);
    }
    const a = active();
    if (a) {
      const events = stepRookAttack(a, t);
      if (a.tsid === engine.streetTsid) handleEvents(engine, a, events);
      else handleRemoteEvents(engine, a, events);
    }
    const mine = here(engine);
    // Scan the street for rookable targets and keep their visuals in step.
    if (t - lastScan > 400) {
      lastScan = t;
      const entries = rookableTargets(engine);
      if (!pendingApplied && t - enteredAt > 1800) {
        pendingApplied = true;
        const s = slot(engine);
        const beats = s.pendingBeats;
        s.pendingBeats = 0;
        for (let i = 0; i < beats; i += 1) rookStreet(engine);
      }
      syncRookedVisuals(engine, entries);
    }
    updateRookedVisuals(engine);
    // Herald pieces.
    if (mine?.phase === 'herald') spawnForehorseman(engine);
    updateForehorseman(engine, dtMs);
    // Screen layer.
    if (ui || mine || overlays.length) {
      ensureUi(engine);
      const target = mine && mine.phase !== 'dead' && mine.phase !== 'departed' ? (mine.phase === 'herald' ? 0.12 + 0.1 * Math.min(1, (t - mine.startedAt) / ROOK_SOLO.heraldMs) : 0.24) : 0;
      ui.sky.alpha += (target - ui.sky.alpha) * Math.min(1, dtMs / 900);
      updateRook(engine, mine, dtMs);
      updateSilhouettes(dtMs);
      updateFeathers(dtMs);
      updateOverlays(engine);
      drawHud(engine, mine);
      if (mine && rookPresent(mine) && mine.phase !== 'dead' && Math.random() < dtMs / 9000) spawnSilhouettes(engine, 1);
    }
    updateOrb(engine, dtMs);
    releaseHeadroom(engine);
    updatePrimeFx(engine);
    if (t < shakeUntil) {
      const k = (shakeUntil - t) / 1100;
      engine.nudgeCamera?.((Math.random() - 0.5) * 14 * k, (Math.random() - 0.5) * 10 * k);
    }
    syncFront(engine);
    stepAutoplay(engine);
    publish(engine);
  },

  /** Rooked targets and shrines under attack offer only the rook verbs. */
  /** No Magic Rock offers over a Rook attack on this street. */
  holdQuestOffers(engine) {
    return here(engine) ? true : null;
  },

  verbOverride(target, engine) {
    if (!target || target.featureId === ROOK_FEATURE_ID) return null;
    if (isRookableClass(target.classId)) {
      const key = keyOf.get(target);
      if (key && slot(engine).rooked[key]) return rookedVerbs(engine, target);
      return null;
    }
    if (String(target.classId || '').startsWith('npc_shrine_')) {
      const a = here(engine);
      if (a && rookPresent(a) && a.phase !== 'dead') return shrineVerbs(engine, target, a);
    }
    return null;
  },

  runVerbOverride(target, verbId, engine) {
    if (!String(verbId || '').startsWith('rook_')) return null;
    if (verbId === 'rook_revive') revive(engine, target);
    else if (verbId === 'rook_apply_balm') revive(engine, target, { balm: true });
    else if (verbId === 'rook_prime') prime(engine, target);
    else if (verbId === 'rook_strike') openOfferPanel(engine, target);
    return true;
  },

  verbsFor(target, engine) {
    if (target?.classId !== 'npc_forehorseman') return [];
    return [{ id: 'talk_to', label: 'Talk to', enabled: true, tooltip: 'THE END IS NEIGH', durationMs: 0 }];
  },

  runVerb(target, verbId, engine) {
    if (target?.classId === 'npc_forehorseman') {
      const line = FOREHORSEMAN_LINES[Math.floor(Math.random() * FOREHORSEMAN_LINES.length)];
      engine.say(target, line, ROOK_SOURCE.forehorsemanBubbleMs);
    }
    return true;
  },

  packVerbs(classTsid, engine) {
    const a = here(engine);
    if (classTsid === ORB_CLASS) {
      if (orb) return [{ id: 'rook_unleash', label: `Unleash (${orb.joiners})`, enabled: true, tooltip: 'Release the gathered imagination at the Rook', primary: true }];
      if (!a || !rookPresent(a)) return [];
      const gate = stunGate(engine);
      return [{
        id: 'rook_stun',
        label: 'Stun attack',
        enabled: gate.ok,
        reason: gate.ok ? '' : gate.reason,
        tooltip: ROOK_TEXT.stunTooltip.replace('$energy_cost', String(soloCost(ROOK_SOURCE.stunEnergy, { armor: armored() }))),
        primary: true,
      }];
    }
    if (classTsid === BALM_CLASS) {
      const near = nearestRooked(engine);
      return [{
        id: 'rook_pour',
        label: 'Pour',
        enabled: Boolean(near),
        reason: near ? '' : ROOK_TEXT.balmNothing,
        tooltip: `${ROOK_TEXT.balmTooltip} · ${save.balmPoints || ROOK_SOURCE.balmPoints}/${ROOK_SOURCE.balmPoints} pours in this tube`,
        primary: true,
      }];
    }
    if (classTsid === ARMOR_CLASS) {
      const ok = Boolean(a && rookPresent(a) && a.phase !== 'dead');
      return [{
        id: 'rook_imbibe',
        label: 'Imbibe',
        enabled: ok && !armored(),
        reason: armored() ? ROOK_TEXT.armorActive : ok ? '' : ROOK_TEXT.armorWait,
        tooltip: 'Drink to gird your loins (and other bits) for battle with the Rook',
      }];
    }
    return [];
  },

  runPackVerb(classTsid, verbId, engine) {
    if (verbId === 'rook_stun') return startStun(engine) || true;
    if (verbId === 'rook_unleash') {
      releaseOrb(engine);
      return true;
    }
    if (verbId === 'rook_pour') {
      const near = nearestRooked(engine);
      if (near) revive(engine, near.row.target, { balm: true });
      else engine.toast(ROOK_TEXT.balmNothing, 2000);
      return true;
    }
    if (verbId === 'rook_imbibe') {
      if (!removeItem(engine.inv, ARMOR_CLASS, 1)) return true;
      save.armorUntil = now() + ROOK_SOURCE.armorS * 1000;
      engine.pushActivity(ROOK_TEXT.armorOn);
      engine.refreshPack();
      engine.save();
      return true;
    }
    return false;
  },

  save() {
    return save;
  },

  restore(slice) {
    save = normalizeRookSave(slice || {});
  },

  /** QA / tests. */
  _state() {
    return { save, tracked: tracked.size, orb: Boolean(orb), lastAction };
  },
};
