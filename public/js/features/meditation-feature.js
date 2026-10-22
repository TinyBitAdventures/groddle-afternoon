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
 */

import { addItem, countItem, ensureItem } from '../inventory.js?v=catalog-unified-3';
import { GAME_DAY_MS, getGameDayKey, getGameDayStartMs } from '../game-day.js?v=dametime-1';
import {
  STATION_COUNTER,
  STATION_QUEST,
  normalizeStationState,
  recordStationSession,
  stationMessage,
} from '../meditation-station.js?v=station-1';
import {
  LEVITATION_PACKAGE,
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
import { moodMax } from '../metabolics.js';
import { sourceFromUrl } from '../textures.js';

export const MEDITATION_FEATURE_ID = 'meditation';
const TANK = 100;
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

function verbCtx(engine) {
  return {
    learned: learned(engine),
    now: Date.now(),
    dayKey: dayKey(),
    energy: engine.pc.energy,
    tank: TANK,
    meditating: Boolean(session),
    unfairPlace: engine.transientInstance(),
    nearbyPlayers: 0,
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
  engine.setData('meditationZen', hasZen(state, dayKey(), TANK) ? '1' : '0');
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

function showMaxRelax(engine) {
  const { PIXI } = engine;
  const player = engine.player;
  const h = avatarHeight(engine);
  const g = new PIXI.Graphics();
  const colors = [0xff6b6b, 0xffa94d, 0xffe066, 0x69db7c, 0x4dabf7, 0xb197fc];
  colors.forEach((color, i) => {
    const r = 70 - i * 6;
    g.moveTo(-r, 0);
    g.arc(0, 0, r, Math.PI, Math.PI * 2);
    g.stroke({ width: 5, color: color, alpha: 0.9 });
  });
  g.position.set(player.x, player.y - h + 6);
  g.zIndex = 41;
  engine.fxLayer.addChild(g);
  engine.floatText(player.x, player.y - h - 82, 'MAX RELAX!', 0xffd85a);
  const born = Date.now();
  const step = () => {
    const life = (Date.now() - born) / 2200;
    if (g.destroyed) return;
    if (life >= 1) {
      g.parent?.removeChild(g);
      g.destroy();
      return;
    }
    g.alpha = life < 0.2 ? life / 0.2 : 1 - (life - 0.2) / 0.8;
    g.scale.set(0.9 + life * 0.15);
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
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
  publish(engine, true);
  return true;
}

function end(engine, reason = 'timer', at = Date.now()) {
  if (!session) return;
  const done = session;
  session = null;
  done.stopMusic?.();
  destroyMeditationFx(engine);
  const pc = engine.pc;
  const out = finishMeditation(state, done, {
    now: at,
    learned: learned(engine),
    tank: TANK,
    dayKey: dayKey(),
    streetTsid: engine.streetTsid,
    energy: pc.energy,
    mood: pc.mood,
    moodMax: moodMax(pc),
    rng: rng(engine),
  });
  let { energy, mood } = out;
  if (energy && engine.metabolicGate('energy', 'gain').ok === false) energy = 0;
  if (mood && engine.metabolicGate('mood', 'gain').ok === false) mood = 0;
  // Energy the gate refused does not count toward the daily top.
  state = { ...out.state, energyToday: Math.max(0, out.state.energyToday - (out.energy - energy)) };
  pc.energy = Math.min(TANK, (pc.energy || 0) + energy);
  pc.mood = Math.min(moodMax(pc), (pc.mood || 0) + mood);
  if (out.img) {
    pc.imagination = (pc.imagination || 0) + out.img;
    pc.xp = (pc.xp || 0) + out.img;
  }
  engine.pushActivity(out.message);
  const player = engine.player;
  const parts = [];
  if (mood) parts.push(`+${mood} mood`);
  if (energy) parts.push(`+${energy} energy`);
  if (out.img) parts.push(`+${out.img} iMG`);
  if (player && parts.length) engine.floatText(player.x, player.y - avatarHeight(engine) - 20, parts.join('  '), out.full ? 0xd6f5ff : 0xf0e6d0);
  if (out.maxRelax && player) showMaxRelax(engine);
  if (out.reachedZen) engine.toast(MEDITATION_TEXT.zenReached, 3600);
  for (const event of out.events) engine.achievement(event.counter, event.amount);
  stationAfterSession(engine, out.seconds);
  engine.setData('meditationLast', `${reason}:${out.seconds}s:e${energy}:m${mood}:i${out.img}:${out.full ? 'full' : 'part'}`);
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
  engine.pc.energy = Math.max(0, engine.pc.energy - out.energyCost);
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
  player.vy = Math.min(player.vy, -7.4);
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
  },

  onNewDay() {
    state = rollMeditationDay(state, dayKey());
  },

  physics() {
    return isLevitating(state, Date.now()) ? { gravity: LEVITATION_PACKAGE.physics.gravity } : null;
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
    publish(engine);
  },

  packVerbs(classTsid, engine) {
    if (classTsid !== ORB_CLASS) return null;
    if (session) {
      return [{ id: 'stop', label: 'Stop meditating', enabled: true, tooltip: 'Moving also stops it', primary: true }];
    }
    return listOrbVerbs(state, verbCtx(engine)).map((verb) => ({
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
    else if (verbId === 'radiate') engine.toast(MEDITATION_TEXT.radiateAlone);
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
};
