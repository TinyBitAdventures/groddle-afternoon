/**
 * Meditation with the Focusing Orb as a feature module (see js/feature-host.js).
 *
 * Rules live in js/meditation.js; this file binds them to the world: the orb's
 * pack verbs (meditate, focus energy, focus mood, imagine levitation, radiate),
 * the timed session (moving, a verb menu or a street change interrupts it, as
 * in players/player.js), the metabolic rewards, zen, cooldowns, the levitation
 * jetpack buff, and the badge/quest counters.
 *
 * Visuals: the recovered 31-frame Focusing Orb tool animation floats in front
 * of the avatar (52 px rather than the source 80x80 overlay, so the face stays
 * visible). The CC0 avatar sheets have no meditation pose, so the pose is a
 * clean Pixi replacement:
 * the avatar hovers on a slow four-second breath, inside a soft layered halo
 * with a ground ripple and rising motes, plus a thin ring around the orb that
 * fills to the end of the session. Max relax shows a small rainbow.
 * Music: the published Wayback meditation tracks stand in for the unrecovered
 * MEDITATIVE_ARTS / FOCUSED_MEDITATION sound keys, over the ducked street BGM.
 *
 * Obtaining the Orb: the Hardware Vendor (1,344) and Tool Vendor (1,260) stock
 * it per GSJS catalog_stores.js (QA: ?vendor=hardware).
 *
 * QA: ?autostart=1&meditatedemo=1|focus|levitate|all|wintry grants the skills
 * (and an Orb), lowers energy and mood so the gain is visible; &meditateroll=0.99
 * fixes the session length; &meditateautoplay=meditate|focus_energy|focus_mood|levitate
 * starts that verb once; &meditatelevhold=1 keeps levitation up for visual QA.
 * Canvas data: meditationActive, meditationKind,
 * meditationElapsed, meditationDuration, meditationLast, meditationCooldown,
 * meditationZen, meditationTotalSeconds, meditationLevitating.
 *
 * Multiplayer (G330; engine.mode 'multiplayer' with the realtime client, solo
 * untouched): Radiate works. The realtime server (radiance.go) decides who is
 * in range, the pulses, the time, the rank and cards (signed by the site from
 * the save, groddle/v1/radiance) and the cooldown; this file pays the
 * radiator's pulses, applies a receiver's gains once per pulse and works out
 * the radiator's end (js/radiance-mp.js). Every meditation is told to the
 * street (meditate_start / meditate_stop) so others see the orb bubble over a
 * meditating player and the server counts who meditates together; your own
 * chat line breaks a meditation unless you hold Mantra Meditation
 * (players/player.js:1846-1883). Canvas data: radianceLast, radianceGot,
 * radianceStatus, meditationTogether, meditatorsHere.
 */

import { addItem, countItem, ensureItem } from '../inventory.js?v=catalog-unified-7';
import { GAME_DAY_MS, getGameDayKey, getGameDayStartMs } from '../game-day.js?v=dametime-4';
import {
  STATION_COUNTER,
  STATION_QUEST,
  normalizeStationState,
  recordStationSession,
  stationMessage,
} from '../meditation-station.js?v=station-1';
import {
  MEDITATION_TEXT,
  ORB_CLASS,
  ORB_ITEM,
  ORB_TOOL_SHEET,
  endLevitation,
  finishMeditation,
  hasZen,
  isLevitating,
  listOrbVerbs,
  meditationChatter,
  normalizeMeditationState,
  rollMeditationDay,
  startLevitation,
  startMeditation,
} from '../meditation.js';
import { energyMax, metabolicGain, moodMax, loseEnergy, loseMood } from '../metabolics.js';
import { levitationCards } from '../imagination-effects.js';
import { applyPhysicsAdjustments, physicsMultipliers } from '../location-events.js';
import { sourceFromUrl } from '../textures.js';
import { rainbowSound, showRainbow } from '../overlays.js?v=g392-1';
import { moodScaledXp } from '../mood-xp.js';
import { createMinnAccount } from '../minn-account.js?v=nbhome-10';
import { getSkillPackageOverride } from '../skill-packages.js';
import {
  RADIANCE_TEXT,
  RADIATE_COOLDOWN_SECONDS,
  burstLines,
  chatInterrupts,
  cleanName,
  playersInRange,
  pulseCost,
  pulseGain,
  pulseKey,
  radId,
  radiateEnergyNeeded,
  radiationDistance,
  radiationRank,
  radiatorEnd,
  radiatorLine,
} from '../radiance-mp.js?v=radiance-1';

export const MEDITATION_FEATURE_ID = 'meditation';
/** metabolics_get_max_energy: the energy tank (100 plus Energy Tank cards). */
const tankOf = (engine) => energyMax(engine?.pc);
const WINTRY_PLACE = 'GM11E7ODKHO1QJE';
const BREATH_MS = 4000;
const ORB_HELD_SIZE = 52;
const JUMP_KEYS = new Set([' ', 'w', 'W']);

let state = normalizeMeditationState();
/** Meditation Station practice (js/meditation-station.js), saved beside the meditation state. */
let station = normalizeStationState();
let session = null; // transient: { kind, focus, startedAt, durationMs, x, ticks, stopMusic }
let fx = null; // Pixi container + parts while meditating
let levFx = null;
let orbFrames = null;
let engineRef = null;
let demoDone = false;
let wintryRedirected = false;
let autoplayAt = 0;
let lastPublish = 0;

const dayKey = () => getGameDayKey(Date.now());

function rng(engine) {
  const roll = Number(engine.param('meditateroll'));
  return Number.isFinite(roll) && roll >= 0 && roll < 1 ? () => roll : Math.random;
}

function learned(engine) {
  return engine.learnedSkills || [];
}

function upgrades(engine) {
  return engine.pc?.imaginationUpgrades || [];
}

/**
 * levitation_by_meditation physics as remake multipliers: gravity 0.85, or
 * Levitate with Style's gravity 0.798, vy_jump 1.176 and friction_air 1.59
 * (catalog_buffs.js:1251-1262) through the PhysicsSetting mapping.
 */
function levitationPhysics(engine) {
  const m = physicsMultipliers(applyPhysicsAdjustments({}, levitationCards(upgrades(engine)).physics));
  return { gravity: m.gravity, jump: m.jump };
}

function verbCtx(engine) {
  return {
    learned: learned(engine),
    upgrades: upgrades(engine),
    now: Date.now(),
    dayKey: dayKey(),
    energy: engine.pc.energy,
    tank: tankOf(engine),
    meditating: Boolean(session),
    unfairPlace: engine.transientInstance(),
    nearbyPlayers: mpNearby(engine),
  };
}

function publish(engine, force = false) {
  const now = Date.now();
  if (!force && now - lastPublish < 250) return;
  lastPublish = now;
  engine.setData('meditationActive', session ? '1' : '0');
  engine.setData('meditationKind', session ? `${session.kind}:${session.focus}` : '');
  engine.setData('meditationElapsed', session ? String(now - session.startedAt) : '0');
  engine.setData('meditationDuration', session ? String(session.durationMs) : '0');
  engine.setData('meditationCooldown', String(Math.max(0, Math.ceil((state.cooldownUntil - now) / 1000))));
  engine.setData('meditationZen', hasZen(state, dayKey(), tankOf(engine)) ? '1' : '0');
  engine.setData('meditationTotalSeconds', String(state.totalSeconds));
  engine.setData('meditationEnergyToday', String(state.energyToday));
  engine.setData('meditationLevitating', isLevitating(state, now) ? '1' : '0');
}

/* ------------------------------------------------------------------ */
/* Visuals                                                             */
/* ------------------------------------------------------------------ */

function orbTextures(engine) {
  if (orbFrames) return orbFrames;
  const { PIXI } = engine;
  const base = sourceFromUrl(ORB_TOOL_SHEET.url);
  orbFrames = [];
  for (let i = 0; i < ORB_TOOL_SHEET.frames; i += 1) {
    const col = i % ORB_TOOL_SHEET.cols;
    const row = Math.floor(i / ORB_TOOL_SHEET.cols);
    orbFrames.push(
      new PIXI.Texture(
        { source: base, frame: new PIXI.Rectangle(col * ORB_TOOL_SHEET.frameW, row * ORB_TOOL_SHEET.frameH, ORB_TOOL_SHEET.frameW, ORB_TOOL_SHEET.frameH) }
      )
    );
  }
  return orbFrames;
}

function avatarHeight(engine) {
  const h = Number(engine.player?.height);
  return Number.isFinite(h) && h > 40 ? Math.min(150, h) : 96;
}

function buildMeditationFx(engine) {
  const { PIXI } = engine;
  const root = new PIXI.Container();
  root.zIndex = 40;
  const halo = new PIXI.Graphics();
  const ripple = new PIXI.Graphics();
  const motes = new PIXI.Graphics();
  const ring = new PIXI.Graphics();
  const orbGlow = new PIXI.Graphics();
  const orb = new PIXI.AnimatedSprite(orbTextures(engine));
  orb.anchor.set(0.5);
  // The source overlay is 80x80; held in front of the avatar it reads best a
  // little smaller, so the face stays visible.
  orb.width = ORB_HELD_SIZE;
  orb.height = ORB_HELD_SIZE;
  orb.animationSpeed = 0.42; // 31 frames ~ 1.2 s, a slow swirl
  orb.play();
  root.addChild(ripple, halo, motes, orbGlow, ring, orb);
  const seeds = Array.from({ length: 16 }, (_, i) => ({
    phase: (i / 16) * Math.PI * 2,
    speed: 0.6 + ((i * 37) % 10) / 14,
    radius: 26 + ((i * 53) % 24),
    offset: ((i * 71) % 100) / 100,
  }));
  engine.fxLayer.addChild(root);
  return { root, halo, ripple, motes, ring, orbGlow, orb, seeds };
}

function drawMeditationFx(engine, now) {
  if (!fx || !session) return;
  const player = engine.player;
  const h = avatarHeight(engine);
  const t = now - session.startedAt;
  const breath = 0.5 - 0.5 * Math.cos((t / BREATH_MS) * Math.PI * 2); // 0..1..0
  const cx = player.x;
  const feet = player.y;
  const chest = feet - h * 0.52;
  const fadeIn = Math.min(1, t / 700);
  fx.root.alpha = fadeIn;

  // Hover on the breath; the physics loop eases pivot back each frame.
  player.pivot.y = (4 + breath * 6) * fadeIn;

  // Layered halo: soft lavender to sky, breathing in and out.
  const halo = fx.halo;
  halo.clear();
  const layers = [
    [0xd9c8ff, 0.07, 1.0],
    [0xc3dcff, 0.08, 0.78],
    [0xf2ecff, 0.1, 0.55],
  ];
  for (const [color, alpha, k] of layers) {
    halo.ellipse(cx, chest + 4, (h * 0.62 + breath * 10) * k, (h * 0.72 + breath * 12) * k).fill({ color: color, alpha: alpha * (0.75 + breath * 0.5) });
  }

  // Ground ripple: one flattened ring every two seconds.
  const ripple = fx.ripple;
  ripple.clear();
  for (const lag of [0, 0.5]) {
    const p = ((t / 2000 + lag) % 1);
    ripple.ellipse(cx, feet - 2, 18 + p * 70, 5 + p * 14).stroke({ width: 2, color: 0xe8f0ff, alpha: 0.42 * (1 - p) });
  }
  ripple.ellipse(cx, feet - 2, 30, 7).fill({ color: 0xbfd3ff, alpha: 0.16 + breath * 0.08 });

  // Rising motes spiralling up around the avatar.
  const motes = fx.motes;
  motes.clear();
  for (const seed of fx.seeds) {
    const life = ((t / 1000) * 0.22 * seed.speed + seed.offset) % 1;
    const angle = seed.phase + life * Math.PI * 1.4;
    const x = cx + Math.cos(angle) * seed.radius * (0.7 + life * 0.5);
    const y = feet - 8 - life * (h + 40);
    const a = Math.sin(life * Math.PI) * 0.85;
    motes.circle(x, y, 1.4 + (1 - life) * 1.8).fill({ color: life > 0.5 ? 0xfff6d8 : 0xe3eaff, alpha: a });
  }

  // The orb, floating just in front of the chest (source delta_y -8).
  const orbY = feet - h * 0.34 + ORB_TOOL_SHEET.deltaY + Math.sin(t / 900) * 3;
  const orbX = cx + (player.facing === 'left' ? -1 : 1) * h * 0.3;
  fx.orb.position.set(orbX, orbY);
  fx.orbGlow.clear();
  fx.orbGlow.circle(orbX, orbY, ORB_HELD_SIZE * 0.45 + breath * 5).fill({ color: 0xeaf3ff, alpha: 0.18 + breath * 0.14 });

  // Session ring: fills to the end of the rolled duration.
  const progress = Math.min(1, t / session.durationMs);
  const ring = fx.ring;
  ring.clear();
  const r = ORB_HELD_SIZE * 0.5 + 6;
  ring.circle(orbX, orbY, r).stroke({ width: 3, color: 0xffffff, alpha: 0.18 });
  const start = -Math.PI / 2;
  ring.moveTo(orbX + Math.cos(start) * r, orbY + Math.sin(start) * r);
  ring.arc(orbX, orbY, r, start, start + progress * Math.PI * 2);
  ring.stroke({ width: 3, color: progress >= 1 ? 0xffd85a : 0xf4f8ff, alpha: 0.85 });
}

function destroyMeditationFx(engine) {
  if (engine?.player) engine.player.pivot.y = 0;
  if (!fx) return;
  fx.root.parent?.removeChild(fx.root);
  fx.root.destroy({ children: true });
  fx = null;
}

/**
 * G375: a full meditation's show_rainbow('rainbow_maxrelax') (focusing_orb.js 781, 938, 1142, 1302):
 * Tiny Speck's 400 x 400 arc at the avatar for 4 s, with RAINBOW_MAXRELAX (player.js 3044).
 */
function showMaxRelax(engine) {
  const player = engine.player;
  if (!player) return;
  showRainbow(engine.PIXI, 'rainbow_maxrelax', { layer: engine.fxLayer || engine.entityLayer, at: () => ({ x: player.x, y: player.y }) });
  engine.playSound?.(rainbowSound('rainbow_maxrelax'), { volume: 0.5 });
  engine.setData?.('rainbow', 'rainbow_maxrelax');
}

function drawLevitationFx(engine, now) {
  const player = engine.player;
  if (!levFx) {
    const { PIXI } = engine;
    levFx = new PIXI.Graphics();
    levFx.zIndex = 39;
    engine.fxLayer.addChild(levFx);
  }
  const remain = Math.max(0, state.levitateUntil - now);
  const fade = Math.min(1, remain / 600);
  levFx.clear();
  for (let i = 0; i < 3; i += 1) {
    const p = ((now / 700 + i / 3) % 1);
    levFx.ellipse(player.x + Math.sin(now / 300 + i * 2) * 8, player.y + 4 + p * 16, 16 - p * 6, 5 - p * 2);
    levFx.fill({ color: 0xe6f0ff, alpha: 0.35 * (1 - p) * fade });
  }
  const h = avatarHeight(engine);
  levFx.ellipse(player.x, player.y - h * 0.5, 36, h * 0.58).fill({ color: 0xe9e2ff, alpha: 0.1 * fade });
  for (let i = 0; i < 6; i += 1) {
    const a = now / 650 + (i * Math.PI) / 3;
    levFx.circle(player.x + Math.cos(a) * 30, player.y - h * 0.5 + Math.sin(a) * h * 0.5, 1.8);
    levFx.fill({ color: i % 2 ? 0xfff3c4 : 0xffffff, alpha: 0.75 * fade });
  }
}

function destroyLevitationFx() {
  if (!levFx) return;
  levFx.parent?.removeChild(levFx);
  levFx.destroy();
  levFx = null;
}

/* ------------------------------------------------------------------ */
/* Sessions                                                            */
/* ------------------------------------------------------------------ */

function begin(engine, verbId) {
  if (session) return false;
  if (countItem(engine.inv, ORB_CLASS) < 1) {
    engine.toast('You need a Focusing Orb.');
    return false;
  }
  state = rollMeditationDay(state, dayKey());
  const out = startMeditation(state, verbId, { ...verbCtx(engine), rng: rng(engine) });
  if (!out.ok) {
    engine.toast(out.error || MEDITATION_TEXT.failed);
    return false;
  }
  session = { ...out.session, x: engine.player.x, stopMusic: null };
  engine.pushActivity(out.line);
  engine.playCue(out.music, { volume: 0.55 }).then((stop) => {
    if (session && !session.stopMusic) session.stopMusic = stop;
    else stop();
  });
  fx = buildMeditationFx(engine);
  mpMeditating(engine, session.kind);
  publish(engine, true);
  return true;
}

function end(engine, reason = 'timer', at = Date.now()) {
  if (!session) return;
  if (session.kind === 'transcendental') {
    endRadiateLocal(engine, reason);
    return;
  }
  const done = session;
  session = null;
  done.stopMusic?.();
  destroyMeditationFx(engine);
  mpMeditating(engine, '', done);
  const pc = engine.pc;
  const out = finishMeditation(state, done, {
    now: at,
    learned: learned(engine),
    upgrades: upgrades(engine),
    tank: tankOf(engine),
    dayKey: dayKey(),
    streetTsid: engine.streetTsid,
    energy: pc.energy,
    mood: pc.mood,
    moodMax: moodMax(pc),
    rng: rng(engine),
    // focusing_orb.js: stats_add_xp(n, false) takes the mood bonus.
    scaleXp: (xp, mood) => moodScaledXp({ ...pc, mood }, xp),
  });
  let { energy, mood } = out;
  // focusing_orb.js 822-823: metabolics_add_energy, then _mood, each saying
  // why it gave nothing while dead or Super Pooped (inc_metabolics.js 40-53, 79-86).
  if (energy > 0 && !metabolicGain('energy').ok) energy = 0;
  if (mood > 0 && !metabolicGain('mood').ok) mood = 0;
  // Energy the gate refused does not count toward the daily top.
  state = { ...out.state, energyToday: Math.max(0, out.state.energyToday - (out.energy - energy)) };
  pc.energy = Math.min(tankOf(engine), (pc.energy || 0) + energy);
  pc.mood = Math.min(moodMax(pc), (pc.mood || 0) + mood);
  const imgTotal = out.img + (out.imgBonus || 0);
  if (imgTotal) {
    pc.imagination = (pc.imagination || 0) + imgTotal;
    pc.xp = (pc.xp || 0) + imgTotal;
  }
  engine.pushActivity(out.message);
  if (out.imgBonus) {
    const name = out.imgBonusCard === 'meditative_arts_imagination' ? 'Enlightenment' : 'Focused Imagination';
    engine.pushActivity(`${name}: a flash of insight. +${out.imgBonus} iMG`);
  }
  const player = engine.player;
  const parts = [];
  if (mood) parts.push(`+${mood} mood`);
  if (energy) parts.push(`+${energy} energy`);
  if (imgTotal) parts.push(`+${imgTotal} iMG`);
  if (player && parts.length) engine.floatText(player.x, player.y - avatarHeight(engine) - 20, parts.join('  '), out.full ? 0xd6f5ff : 0xf0e6d0);
  if (out.maxRelax && player) showMaxRelax(engine);
  if (out.reachedZen) engine.toast(MEDITATION_TEXT.zenReached, 3600);
  for (const event of out.events) engine.achievement(event.counter, event.amount);
  stationAfterSession(engine, out.seconds);
  engine.setData('meditationLast', `${reason}:${out.seconds}s:e${energy}:m${mood}:i${out.img}:${out.full ? 'full' : 'part'}${out.imgBonus ? `:bonus${out.imgBonus}` : ''}${out.maxRelax ? ':maxrelax' : ''}`);
  engine.updateHud();
  engine.save();
  publish(engine, true);
}

/** Meditation Station: one counted game day per 60 s on the same street (quest active only). */
function stationAfterSession(engine, seconds) {
  const quest = engine.questState?.active?.[STATION_QUEST];
  if (!quest) {
    station = normalizeStationState();
    return;
  }
  const res = recordStationSession(station, {
    tsid: engine.streetTsid,
    label: engine.street?.label || engine.streetTsid,
    seconds,
    day: Math.floor(getGameDayStartMs(Date.now()) / GAME_DAY_MS),
  });
  station = res.state;
  if (res.reset && quest.progress) quest.progress[STATION_COUNTER] = 0;
  if (res.counted) engine.achievement(STATION_COUNTER, 1);
  const msg = stationMessage(res);
  if (msg) engine.pushActivity(msg);
  engine.setData('meditationStation', `${station.tsid}:${station.days}:${station.todaySeconds}`);
}

function levitate(engine) {
  const out = startLevitation(state, verbCtx(engine));
  if (!out.ok) {
    engine.toast(out.error);
    return false;
  }
  state = out.state;
  // G289: metabolics_lose_energy, nothing lost while dead (inc_metabolics.js 108-122).
  loseEnergy(engine.pc, out.energyCost);
  engine.pushActivity(out.message);
  engine.toast('Levitating! Tap Space in the air to float higher.', 2400);
  engine.updateHud();
  engine.save();
  publish(engine, true);
  return true;
}

/** levitation_by_meditation jetpack: a jump press in the air lifts you again. */
function onKeyDown(event) {
  const engine = engineRef;
  if (!engine?.started || event.repeat || !JUMP_KEYS.has(event.key)) return;
  if (!isLevitating(state, Date.now()) || engine.busy()) return;
  const player = engine.player;
  if (!player || player.onGround) return;
  player.vy = Math.min(player.vy, -7.4 * levitationPhysics(engine).jump);
}

function demoSetup(engine) {
  const demo = engine.param('meditatedemo');
  if (!demo || demoDone) return;
  if (demo === 'wintry' && engine.streetTsid !== WINTRY_PLACE && !wintryRedirected) {
    wintryRedirected = true;
    engine.enter(WINTRY_PLACE);
    return;
  }
  demoDone = true;
  const grants = ['meditativearts_1'];
  if (demo === 'focus' || demo === 'levitate' || demo === 'all') grants.push('meditativearts_2', 'meditativearts_3', 'focused_meditation_1');
  if (demo === 'levitate' || demo === 'all') grants.push('levitation_1');
  if (demo === 'all') grants.push('transcendental_radiation_1');
  for (const id of grants) engine.grantSkill(id);
  if (countItem(engine.inv, ORB_CLASS) < 1) addItem(engine.inv, ORB_CLASS, 1);
  state = { ...rollMeditationDay(state, dayKey()), cooldownUntil: 0, energyToday: 0, levitateUntil: 0 };
  engine.pc.energy = demo === 'levitate' ? 80 : 40;
  engine.pc.mood = 40;
  engine.updateHud();
  const auto = engine.param('meditateautoplay');
  if (auto) autoplayAt = Date.now() + 1500;
  publish(engine, true);
}

/* ------------------------------------------------------------------ */
/* Multiplayer: Transcendental Radiation and meditating together (G330) */
/* ------------------------------------------------------------------ */

/** A radiation the server never ended (a lost socket) ends here this long after its time. */
const RADIATE_LOST_MS = 6000;
/** A radiance token older than this is fetched again before Radiate. */
const WATCH_FRESH_MS = 60_000;
const START_WAIT_MS = 6000;
const BUBBLE_DY = -186; // pc_overlay bubble delta_y -110 over the head (focusing_orb.js:2096); here above the name plate (realtime-feature PLATE_Y -150)
const BUBBLE_SIZE = 40;
const STOP_WHY = { interrupted: 'moved', stopped: 'stopped', street: 'street', chat: 'chat', tired: 'tired', timer: 'stopped', verb: 'verb' };

function freshMp() {
  return {
    client: null,
    account: null,
    watch: null, // { rank, cards, at }
    fetching: null,
    status: null, // radiance_status { rank, dist, cooldown }
    pending: 0, // when Radiate was asked for
    rad: '', // our radiation running
    awaitDone: '', // our radiation ended here, its radiate_done not in yet
    rank: 0,
    lines: [],
    bursts: new Set(),
    spentEnergy: 0,
    moodless: false,
    got: new Map(), // rad -> { name, energy, mood, seen: Set<n> } for radiations reaching us
    meditators: new Map(), // id -> kind, others on this street
    bubbles: new Map(), // id -> Pixi sprite
    together: 0,
    peak: 0,
    last: '',
  };
}

let mp = freshMp();

function mpOn(engine) {
  if (engine?.mode !== 'multiplayer') return false;
  if (!mp.client) {
    const c = engine.query?.('realtimeClient');
    if (c) attachMp(engine, c);
  }
  return Boolean(mp.client);
}

function mpMe() {
  return Number(mp.client?.me?.id) || 0;
}

function mpNote(engine, key, value) {
  engine.setData?.(key, value);
}

function attachMp(engine, c) {
  mp.client = c;
  const boot = globalThis.GRODDLE_MP_BOOT || {};
  mp.account = createMinnAccount({ baseUri: globalThis.document?.baseURI || 'http://localhost/', nonce: boot.nonce || '' });
  c.on('hello', () => {
    mp.watch = null;
    refreshWatch(engine).catch(() => {});
  });
  if (c.state === 'online') refreshWatch(engine).catch(() => {});
  c.on('msg:radiance_status', (m) => {
    mp.status = { rank: Number(m.rank) || 0, dist: Number(m.dist) || 0, cooldown: Number(m.cooldown) || 0 };
    mpNote(engine, 'radianceStatus', `${mp.status.rank}:${mp.status.dist}:${mp.status.cooldown}`);
  });
  c.on('msg:radiate_started', (m) => onRadiateStarted(engine, m));
  c.on('msg:radiate_burst', (m) => onRadiateBurst(engine, m));
  c.on('msg:radiate_done', (m) => onRadiateDone(engine, m));
  c.on('msg:radiate_felt', (m) => onRadiateFelt(engine, m));
  c.on('msg:radiate_pulse', (m) => onRadiatePulse(engine, m));
  c.on('msg:radiate_ended', (m) => onRadiateEnded(engine, m));
  c.on('msg:meditating', (m) => {
    const id = Number(m.id);
    if (!id || id === mpMe()) return;
    if (typeof m.kind === 'string' && m.kind) mp.meditators.set(id, m.kind);
    else mp.meditators.delete(id);
    mpNote(engine, 'meditatorsHere', [...mp.meditators.keys()].join(','));
  });
  c.on('msg:meditators', (m) => {
    for (const row of Array.isArray(m.list) ? m.list : []) {
      const id = Number(row?.id);
      if (id && id !== mpMe() && typeof row.kind === 'string' && row.kind) mp.meditators.set(id, row.kind);
    }
    mpNote(engine, 'meditatorsHere', [...mp.meditators.keys()].join(','));
  });
  c.on('msg:meditate_together', (m) => {
    mp.together = Math.max(0, Math.floor(Number(m.n) || 0));
    if (session) mp.peak = Math.max(mp.peak, mp.together);
    mpNote(engine, 'meditationTogether', String(mp.together));
  });
  c.on('roster', ({ players }) => {
    const here = new Set((players || []).map((p) => Number(p.id)));
    for (const id of [...mp.meditators.keys()]) if (!here.has(id)) mp.meditators.delete(id);
  });
  // Your own chat line (local, party, group): players/player.js:1857-1863.
  c.on('said', (m) => { if (m?.mine) chatSaid(engine); });
  c.on('msg:party_said', (m) => { if (Number(m.id) === mpMe()) chatSaid(engine); });
  c.on('msg:channel_said', (m) => { if (Number(m.id) === mpMe()) chatSaid(engine); });
  c.on('error', (e) => {
    if (e?.code !== 'radiance') return;
    if (mp.pending) {
      mp.pending = 0;
      engine.toast?.(e.message || MEDITATION_TEXT.failed);
    }
    mp.last = `error:${e.message}`;
    mpNote(engine, 'radianceLast', mp.last);
  });
}

/** The skill and cards the site read from the save, signed for the server. */
async function refreshWatch(engine, force = false) {
  if (!mp.client || !mp.account) return null;
  if (!force && mp.watch && Date.now() - mp.watch.at < WATCH_FRESH_MS) return mp.watch;
  if (mp.fetching) return mp.fetching;
  mp.fetching = mp.account.radiance().then((r) => {
    mp.watch = { rank: Number(r?.rank) || 0, cards: Array.isArray(r?.cards) ? r.cards : [], at: Date.now() };
    if (r?.watch?.token) mp.client.send('radiance_watch', { token: r.watch.token });
    return mp.watch;
  }).finally(() => { mp.fetching = null; });
  return mp.fetching;
}

/** The menu's count of players near enough (the server decides when you press it). */
function mpNearby(engine) {
  if (!mpOn(engine)) return 0;
  const rank = mp.status?.rank || radiationRank(learned(engine));
  const dist = mp.status?.rank ? mp.status.dist : radiationDistance(rank, upgrades(engine));
  return playersInRange(mp.client.players || [], engine.player?.x || 0, dist);
}

/** verbs.radiate 490-496: the energy check, in multiplayer where Radiate can be pressed. */
function mpVerb(engine, verb) {
  if (verb.id !== 'radiate' || !verb.enabled || !mpOn(engine)) return verb;
  const rank = radiationRank(learned(engine));
  if ((engine.pc?.energy || 0) <= radiateEnergyNeeded(tankOf(engine), rank)) {
    return { ...verb, enabled: false, reason: RADIANCE_TEXT.tired };
  }
  return verb;
}

async function radiateMp(engine) {
  if (session || (mp.pending && Date.now() - mp.pending < START_WAIT_MS)) return false;
  if (countItem(engine.inv, ORB_CLASS) < 1) {
    engine.toast('You need a Focusing Orb.');
    return false;
  }
  const verb = mpVerb(engine, listOrbVerbs(state, verbCtx(engine)).find((v) => v.id === 'radiate') || { id: 'radiate', enabled: false, reason: MEDITATION_TEXT.failed });
  if (!verb.enabled) {
    engine.toast(verb.reason || MEDITATION_TEXT.failed);
    return false;
  }
  if (mp.client.state !== 'online') {
    engine.toast(RADIANCE_TEXT.offline);
    return false;
  }
  mp.pending = Date.now();
  try {
    await refreshWatch(engine, true);
  } catch (err) {
    mp.pending = 0;
    engine.toast(err?.message || MEDITATION_TEXT.failed);
    return false;
  }
  mp.client.send('radiate_start', { moodless: (engine.pc?.mood || 0) <= 0 });
  mp.last = 'asked';
  mpNote(engine, 'radianceLast', mp.last);
  return true;
}

function bonusAmountFor(rank) {
  const pkg = { 1: 6, 2: 10, 3: 15 }[rank] || 6;
  const override = getSkillPackageOverride('transcendental_radiation');
  return Number.isFinite(override?.bonus_amount) ? override.bonus_amount : pkg;
}

function onRadiateStarted(engine, m) {
  const rad = radId(m.rad);
  if (!rad) return;
  mp.pending = 0;
  if (session) {
    // Something else began meanwhile: give it back.
    mp.client.send('radiate_stop', { why: 'verb' });
    return;
  }
  mp.rad = rad;
  mp.awaitDone = '';
  mp.rank = Math.max(1, Math.min(3, Number(m.rank) || 1));
  mp.bursts = new Set();
  mp.spentEnergy = 0;
  mp.moodless = (engine.pc?.mood || 0) <= 0;
  mp.peak = 0;
  const durationMs = Math.max(3000, Number(m.duration) || 3000);
  mp.lines = burstLines(pulseCost(tankOf(engine), mp.rank), durationMs, rng(engine));
  session = {
    kind: 'transcendental',
    focus: 'radiate',
    startedAt: Date.now(),
    durationMs,
    durationMaxMs: Number(m.durationMax) || durationMs,
    ticks: 0,
    x: engine.player.x,
    stopMusic: null,
    rad,
  };
  engine.pushActivity(RADIANCE_TEXT.begin);
  // TRANSCENDENTAL_MEDITATION_01 / _02 (inc_data_sounds.js:135-136) are not recovered:
  // the Wayback meditation tracks the solo verbs do not use stand in.
  const music = rng(engine)() < 0.5 ? 'assets/audio/ambient/meditation4_1344997846.mp3' : 'assets/audio/ambient/Meditation_1291879502.mp3';
  engine.playCue(music, { volume: 0.55 }).then((stop) => {
    if (session && session.rad === rad && !session.stopMusic) session.stopMusic = stop;
    else stop();
  });
  if (engine.PIXI && engine.fxLayer) fx = buildMeditationFx(engine);
  mp.last = `started:${rad}:${durationMs}:${Number(m.recipients) || 0}`;
  mpNote(engine, 'radianceLast', mp.last);
  publish(engine, true);
}

/** onTRUpdatePlayers 1807-1818: the radiator pays a pulse. */
function onRadiateBurst(engine, m) {
  const rad = radId(m.rad);
  const n = Math.floor(Number(m.n) || 0);
  if (!rad || rad !== mp.rad || n < 1 || mp.bursts.has(n)) return;
  mp.bursts.add(n);
  const pc = engine.pc;
  const tank = tankOf(engine);
  const cost = pulseCost(tank, mp.rank);
  loseMood(pc, cost);
  mp.spentEnergy -= loseEnergy(pc, cost);
  const line = mp.lines.shift();
  if (line) engine.pushActivity(line);
  if (!mp.moodless && (pc.mood || 0) <= 0) {
    mp.moodless = true;
    mp.client.send('radiate_mood', { moodless: true });
  }
  engine.updateHud();
  mp.last = `burst:${rad}:${n}:${Number(m.recipients) || 0}`;
  mpNote(engine, 'radianceLast', mp.last);
  // onTick 1767-1772: the next pulse would leave no energy, so it ends there.
  if ((pc.energy || 0) - cost <= 0) endRadiateLocal(engine, 'tired');
}

/** Our radiation stops here (moving, a verb, chat, tired, a street change). */
function endRadiateLocal(engine, reason) {
  if (!session || session.kind !== 'transcendental') return;
  const done = session;
  session = null;
  done.stopMusic?.();
  destroyMeditationFx(engine);
  mp.awaitDone = done.rad;
  mp.rad = '';
  state = { ...state, cooldownUntil: Math.max(state.cooldownUntil, Date.now() + RADIATE_COOLDOWN_SECONDS * 1000) };
  if (mp.client && reason !== 'server') mp.client.send('radiate_stop', { why: STOP_WHY[reason] || 'stopped' });
  engine.save();
  publish(engine, true);
}

/** endTranscendentalRadiationNew 1152-1311: the radiator's bonus, line and counters. */
function onRadiateDone(engine, m) {
  const rad = radId(m.rad);
  if (!rad || (rad !== mp.rad && rad !== mp.awaitDone)) return;
  if (session?.rad === rad) endRadiateLocal(engine, 'server');
  mp.awaitDone = '';
  const pc = engine.pc;
  const tank = tankOf(engine);
  const out = radiatorEnd(m, {
    rank: mp.rank,
    tank,
    mood: pc.mood,
    upgrades: upgrades(engine),
    spentEnergy: mp.spentEnergy,
    bonusAmount: bonusAmountFor(mp.rank),
    rng: rng(engine),
  });
  let energyGot = 0;
  if (out.energyBonus > 0 && metabolicGain('energy').ok) {
    energyGot = Math.min(out.energyBonus, Math.max(0, tank - (pc.energy || 0)));
    pc.energy = (pc.energy || 0) + energyGot;
  }
  // stats_add_xp(n, false): the mood bonus; the card's iMG first (1225), then the full bonus (1243).
  const imgBonus = out.imgBonus ? moodScaledXp(pc, out.imgBonus) : 0;
  const img = out.img ? moodScaledXp(pc, out.img) : 0;
  if (img + imgBonus) {
    pc.imagination = (pc.imagination || 0) + img + imgBonus;
    pc.xp = (pc.xp || 0) + img + imgBonus;
  }
  if (m.why === 'alone') engine.pushActivity(RADIANCE_TEXT.alone);
  engine.pushActivity(radiatorLine({ energy: mp.spentEnergy + energyGot, img, imgBonus, reached: Number(m.recipients) > 0 }, rng(engine)));
  const seconds = Math.max(0, Math.floor(Number(m.seconds) || 0));
  const prevSeconds = state.totalSeconds;
  state = {
    ...state,
    totalSeconds: state.totalSeconds + seconds,
    sessions: state.sessions + 1,
    fullSessions: state.fullSessions + (m.full ? 1 : 0),
    cooldownUntil: Math.max(state.cooldownUntil, Date.now() + RADIATE_COOLDOWN_SECONDS * 1000),
  };
  // quests_inc_counter('meditation_time') and the focusing_orb:meditation_time badge (1294-1296).
  if (seconds > 0) engine.achievement('meditation_seconds', seconds);
  const minutes = Math.floor(state.totalSeconds / 60) - Math.floor(prevSeconds / 60);
  if (minutes > 0) engine.achievement('focusing_orb:meditation_time', minutes);
  for (const flag of Array.isArray(m.flags) ? m.flags : []) {
    if (flag !== 'transcendence_5players') continue;
    engine.questFlag?.(flag);
    engine.achievement(flag, 1);
  }
  if (mp.peak > 0) engine.achievement('meditated_together', mp.peak);
  mp.peak = 0;
  const player = engine.player;
  const parts = [];
  if (energyGot) parts.push(`+${energyGot} energy`);
  if (img + imgBonus) parts.push(`+${img + imgBonus} iMG`);
  if (player && parts.length) engine.floatText(player.x, player.y - avatarHeight(engine) - 20, parts.join('  '), m.full ? 0xd6f5ff : 0xf0e6d0);
  if (m.maxRelax && player) showMaxRelax(engine);
  mp.last = `done:${rad}:${m.why}:${seconds}s:${m.full ? 'full' : 'part'}:p${Number(m.pulses) || 0}:r${Number(m.recipients) || 0}:e${energyGot}:i${img}${imgBonus ? `:hw${imgBonus}` : ''}`;
  mpNote(engine, 'radianceLast', mp.last);
  engine.setData('meditationLast', `radiate:${m.why}:${seconds}s:e${energyGot}:m0:i${img}:${m.full ? 'full' : 'part'}`);
  engine.updateHud();
  engine.save();
  publish(engine, true);
}

function gotFor(rad, m) {
  let rec = mp.got.get(rad);
  if (!rec) {
    rec = { name: cleanName(m?.from?.name), energy: 0, mood: 0, seen: new Set() };
    mp.got.set(rad, rec);
  }
  return rec;
}

function onRadiateFelt(engine, m) {
  const rad = radId(m.rad);
  if (!rad || mp.got.has(rad)) return;
  const rec = gotFor(rad, m);
  engine.pushActivity(RADIANCE_TEXT.felt(rec.name));
}

/** onTRUpdatePlayers 1843-1880 for this receiver: its own tank, the radiator's rank, once per pulse. */
function onRadiatePulse(engine, m) {
  const key = pulseKey(m.rad, m.n);
  if (!key) return;
  const rad = radId(m.rad);
  const rec = gotFor(rad, m);
  const n = Math.floor(Number(m.n));
  if (rec.seen.has(n)) return;
  rec.seen.add(n);
  const pc = engine.pc;
  const tank = tankOf(engine);
  const gain = pulseGain(tank, Math.max(1, Math.min(3, Number(m.rank) || 1)));
  let mood = 0;
  let energy = 0;
  if (m.mood && gain > 0 && metabolicGain('mood').ok) {
    mood = Math.min(gain, Math.max(0, moodMax(pc) - (pc.mood || 0)));
    pc.mood = (pc.mood || 0) + mood;
  }
  if (gain > 0 && !hasZen(state, dayKey(), tank) && metabolicGain('energy').ok) {
    energy = Math.min(gain, Math.max(0, tank - (pc.energy || 0)));
    pc.energy = (pc.energy || 0) + energy;
  }
  rec.energy += energy;
  rec.mood += mood;
  const player = engine.player;
  const parts = [];
  if (mood) parts.push(`+${mood} mood`);
  if (energy) parts.push(`+${energy} energy`);
  if (player && parts.length) engine.floatText(player.x, player.y - avatarHeight(engine) - 20, parts.join('  '), 0xe9e2ff);
  mpNote(engine, 'radianceGot', `${key}:e${rec.energy}:m${rec.mood}`);
  engine.updateHud();
}

function onRadiateEnded(engine, m) {
  const rad = radId(m.rad);
  if (!rad) return;
  const rec = mp.got.get(rad);
  if (!rec) return;
  mp.got.delete(rad);
  const name = cleanName(m?.from?.name) || rec.name;
  engine.pushActivity(m.complete ? RADIANCE_TEXT.transcended(name, rec.energy, rec.mood) : RADIANCE_TEXT.somewhat(name, rec.energy, rec.mood));
  mpNote(engine, 'radianceGot', `ended:${rad}:${m.complete ? 'full' : 'part'}:e${rec.energy}:m${rec.mood}`);
  engine.save();
}

/** Tell the street a standing or focused meditation began or ended. */
function mpMeditating(engine, kind, done = null) {
  if (!mpOn(engine) || kind === 'transcendental') return;
  if (kind) {
    mp.peak = 0;
    mp.client.send('meditate_start', { kind });
    return;
  }
  if (done?.kind === 'transcendental') return;
  mp.client.send('meditate_stop');
  if (mp.peak > 0) engine.achievement('meditated_together', mp.peak);
  mp.peak = 0;
}

/** players/player.js:1857-1863: your own chat line breaks a meditation, unless Mantra Meditation. */
function chatSaid(engine) {
  if (!session || !chatInterrupts(upgrades(engine))) return;
  end(engine, 'chat');
}

/** The orb bubble over other players who meditate (pc_overlay bubble, focusing_orb.js:2091-2104). */
function mpTick(engine, now) {
  if (!mpOn(engine)) return;
  if (mp.pending && now - mp.pending > START_WAIT_MS) mp.pending = 0;
  const remotes = globalThis.groddleRealtime?.remotes;
  for (const [id, sprite] of [...mp.bubbles]) {
    const root = remotes?.get?.(id)?.root;
    if (!mp.meditators.has(id) || !root || root.destroyed) {
      sprite.parent?.removeChild(sprite);
      sprite.destroy();
      mp.bubbles.delete(id);
    }
  }
  if (!mp.meditators.size || !engine.fxLayer || !engine.PIXI) return;
  for (const id of mp.meditators.keys()) {
    const root = remotes?.get?.(id)?.root;
    if (!root || root.destroyed) continue;
    let sprite = mp.bubbles.get(id);
    if (!sprite) {
      const { PIXI } = engine;
      sprite = new PIXI.AnimatedSprite(orbTextures(engine));
      sprite.anchor.set(0.5);
      sprite.width = BUBBLE_SIZE;
      sprite.height = BUBBLE_SIZE;
      sprite.animationSpeed = 0.42;
      sprite.zIndex = 40;
      sprite.play();
      engine.fxLayer.addChild(sprite);
      mp.bubbles.set(id, sprite);
    }
    sprite.position.set(root.x, root.y + BUBBLE_DY + Math.sin(now / 900 + id) * 3);
  }
}

function clearBubbles() {
  for (const sprite of mp.bubbles.values()) {
    sprite.parent?.removeChild(sprite);
    sprite.destroy();
  }
  mp.bubbles.clear();
  mp.meditators.clear();
}

export const meditationFeature = {
  id: MEDITATION_FEATURE_ID,

  init(engine) {
    engineRef = engine;
    ensureItem(ORB_CLASS, {
      label: ORB_ITEM.label,
      desc: ORB_ITEM.desc,
      isTool: true,
      baseCost: ORB_ITEM.baseCost,
      stackMax: ORB_ITEM.stackMax,
    });
    window.addEventListener('keydown', onKeyDown);
    publish(engine, true);
  },

  save() {
    return { ...state, station };
  },

  restore(slice) {
    state = normalizeMeditationState(slice || {});
    station = normalizeStationState(slice?.station);
  },

  onStreetEnter(street, engine) {
    demoSetup(engine);
    publish(engine, true);
  },

  /** A quest offer would break the meditation; wait until it ends. */
  holdQuestOffers() {
    return session ? true : null;
  },

  /** Teleporting or walking off the street interrupts, like any other action. */
  onStreetClear(engine) {
    if (session) end(engine || engineRef, 'street');
    destroyLevitationFx();
    clearBubbles();
  },

  onNewDay() {
    state = rollMeditationDay(state, dayKey());
  },

  physics(engine) {
    return isLevitating(state, Date.now()) ? levitationPhysics(engine || engineRef) : null;
  },

  onTick(dtMs, now, engine) {
    if (!engine.started || !engine.player) return;
    if (autoplayAt && now >= autoplayAt && !engine.busy()) {
      autoplayAt = 0;
      const verb = engine.param('meditateautoplay');
      if (verb === 'levitate') levitate(engine);
      else begin(engine, ['focus_energy', 'focus_mood'].includes(verb) ? verb : 'meditate');
    }
    if (session) {
      const player = engine.player;
      const moved = Math.abs(player.x - session.x) > 6 || Math.abs(player.vx) > 0.8 || player.vy < -1;
      // players/player.js: any action other than the meditation verbs interrupts.
      if (moved || engine.acting()) {
        end(engine, 'interrupted');
      } else {
        const elapsed = now - session.startedAt;
        const tick = Math.floor(elapsed / 1000);
        if (session.kind === 'transcendental') {
          // The server's ticks pulse and end it (radiate_done); the orb says nothing (onTick 1745).
          session.ticks = tick;
          if (elapsed >= session.durationMs + RADIATE_LOST_MS) endRadiateLocal(engine, 'timer');
          else drawMeditationFx(engine, now);
        } else {
          while (session.ticks < tick) {
            session.ticks += 1;
            const line = meditationChatter(session.ticks, rng(engine));
            if (line) engine.pushActivity(line);
          }
          // The source timer fires exactly at the rolled duration.
          if (elapsed >= session.durationMs) end(engine, 'timer', session.startedAt + session.durationMs);
          else drawMeditationFx(engine, now);
        }
      }
    }
    if (state.levitateUntil) {
      // QA: &meditatelevhold=1 keeps the buff up (headless frames are slow).
      if (engine.param('meditatelevhold') === '1') state.levitateUntil = Math.max(state.levitateUntil, now + 1000);
      if (now >= state.levitateUntil) {
        state = endLevitation(state, now);
        destroyLevitationFx();
        engine.pushActivity('Your levitation fades.');
        engine.save();
        publish(engine, true);
      } else {
        drawLevitationFx(engine, now);
      }
    }
    mpTick(engine, now);
    publish(engine);
  },

  packVerbs(classTsid, engine) {
    if (classTsid !== ORB_CLASS) return null;
    if (session) {
      return [{ id: 'stop', label: 'Stop meditating', enabled: true, tooltip: 'Moving also stops it', primary: true }];
    }
    return listOrbVerbs(state, verbCtx(engine)).map((verb) => mpVerb(engine, {
      id: verb.id,
      label: verb.label,
      enabled: verb.enabled,
      reason: verb.reason,
      tooltip: verb.tooltip,
      primary: verb.id === 'meditate',
    }));
  },

  runPackVerb(classTsid, verbId, engine) {
    if (classTsid !== ORB_CLASS) return false;
    if (verbId === 'stop') end(engine, 'stopped');
    else if (verbId === 'levitate') levitate(engine);
    else if (verbId === 'radiate') {
      if (mpOn(engine)) radiateMp(engine);
      else engine.toast(MEDITATION_TEXT.radiateAlone);
    }
    else begin(engine, verbId);
    return true;
  },

  /** QA / tests. */
  _state() {
    return state;
  },
  _session() {
    return session;
  },
  /** QA / tests: the multiplayer half, and a fresh one. */
  _mp() {
    return mp;
  },
  _mpReset() {
    clearBubbles();
    mp = freshMp();
    session = null;
  },
};
