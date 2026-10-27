/**
 * Hi signs with your Butler (rules and copy in js/hi-signs.js; the Butler's
 * half of the state is saved with it in js/features/butler-feature.js).
 *
 * What it does, the source way:
 *  - "5" (top row or keypad) or typing "hi" in local chat says hi, at most
 *    once every two seconds (LocationInputHandler.as, Emotes.as,
 *    TSFrontController.doEmote). "H" stays the remake's Feat key.
 *  - Your first hi of a game day rolls your daily sign from the eleven
 *    variants ("You got the daily hi sign ..."); it shows over your head
 *    for two seconds.
 *  - Your Butler within 400 px is the target, once per sign: 0.9 s later the
 *    sign's icon flies to it as a homing missile. A Butler with no sign
 *    catches yours. If it already said hi to you with the same sign, two
 *    seconds later: the 2x sign, two lightning bolts in the sign's colour
 *    and +10 mood (doHiEmoteBonusWithButler).
 *  - The Butler hears every hi: 1.5 s later it answers once per game day
 *    (says hi back 0.75 s on, then "Neato, we match today!" or one of six
 *    lines).
 *  - Walk into the Butler's far hit box (550 px) after 10 s on your home
 *    street and it says hi first, once per game day: a new sign for it on a
 *    new day, its sign passes to you if you have none, its missile chases
 *    you and +5 mood (or, when you had already said hi with the same sign,
 *    +15 mood two seconds later with the bonus). Five seconds later, if you
 *    have never said hi, it explains the 5 key.
 *  - The missile speeds up the longer it chases (Missile.as). Outrun it and
 *    the seconds count: Hi Flyer (11 s), Hi Speed Chase (61), Hi Velocity
 *    (151), The Motorboat (311); from 10 s it sets the home street's daily
 *    (and all-time) evasion record, and each daily record you hold counts
 *    toward The Daily Hi-Skipper, Social Antisocialist, Marathon Maverick,
 *    Long-Distance Lone Wolf and Endurance Misanthrope at your next new day.
 *  - Signs end at the game-day boundary (doNewDay).
 *
 * QA (with /play/?autostart=1&fresh=1&resetgame=1&questoffer=off&homedemo=home&homex=150&butlerdemo=1):
 *   &hidemo=1                     seed the hi state from params:
 *     &hivariant=<variant>        your sign today
 *     &hibutlervariant=<v>|none   the Butler's sign (none: it catches yours)
 *     &hibutlerhied=1             the Butler already said hi to you today
 *     &hiyesterday=1              yesterday's signs and targets (rotation)
 *     &hiroll=<0..1>              fixed roll for random signs / lines
 *   &hiautoplay=butler            say hi to the Butler; it answers and says hi back
 *               again             say hi twice (the second has no target)
 *               infect            (with hibutlervariant=none) your sign passes to it
 *               first             leave its far box, wait 10 s, walk back: it says hi first
 *               bonus             first, then hi back with the same sign: the bonus
 *               evade             first, then outrun the missile (&hievadesecs=12)
 *               anywhere          say hi away from the Butler (sign only)
 * Canvas data: hiVariant, hiButlerVariant, hiCount, hiLast, hiMissiles,
 *   hiMissileSecs, hiBonus, hiMood, hiResponse, hiOverlay, hiRecord,
 *   hiRecordsHeld, hiBest, hiAutoplay.
 */

import { butlerApi } from './butler-feature.js?v=butler-feature-40';
import { metabolicGain, moodMax } from '../metabolics.js';
import { frameTexture, sourceFromUrl } from '../textures.js';
import {
  HI,
  HI_TEXT,
  HI_ART,
  butlerHiResponse,
  butlerHiResponseDue,
  butlerSaysHi,
  countHeldDailyRecords,
  createMissile,
  evasionActivity,
  evasionBadges,
  expirePlayerHi,
  hiArtSheet,
  hiColor,
  hiDay,
  hiHintDue,
  isHiVariant,
  maybeSetEvasionRecord,
  missileBob,
  missileSeconds,
  MISSILE,
  normalizeEvasionRecords,
  normalizePlayerHi,
  playerButlerBonusCounters,
  playerHiVariant,
  playerSaysHi,
  rememberDailyRecord,
  setButlerHiVariant,
  setPlayerHiVariant,
  stepMissile,
} from '../hi-signs.js?v=hi-signs-4';

export const HI_FEATURE_ID = 'hi-signs';
/** The player's label in the Butler's lines (as BUTLER_INTRO: the remake's players have no name). */
const PC_LABEL = 'friend';

let p = normalizePlayerHi({});
let eng = null;
let layer = null;
let effects = [];
let timers = [];
let lastHiAt = -Infinity;
/** The Butler's hi_target: set by its hi, cleared by sayHiHint or when you leave. */
let butlerWaiting = false;
let lastMsg = '';
let lastResponse = '';
let lastEvasion = '';
let lastRecord = '';
let bonusCount = 0;
let publishAt = 0;
let demoDone = false;
let autoplay = null;
let rng = Math.random;
const frameCache = new Map();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function nowMs() {
  return Date.now();
}

function later(ms, fn, tag = 'pc') {
  timers.push({ at: performance.now() + ms, fn, tag });
}

function cancel(tag) {
  timers = timers.filter((t) => t.tag !== tag);
}

function runTimers() {
  const t = performance.now();
  const due = timers.filter((x) => x.at <= t);
  if (!due.length) return;
  timers = timers.filter((x) => x.at > t);
  for (const x of due) x.fn();
}

function save(engine) {
  engine?.save?.();
}

function addMood(engine, n) {
  const pc = engine?.pc;
  if (!pc || !(n > 0)) return 0;
  // inc_emotes.js 218, 319, 337: metabolics_add_mood, not quiet, so the dead
  // hear "You would have gained some mood, but you're dead!" (inc_metabolics.js 79-86).
  if (!metabolicGain('mood').ok) return 0;
  const before = Number(pc.mood) || 0;
  pc.mood = Math.min(moodMax(pc), before + n);
  engine.updateHud?.();
  // metabolics_add_mood returns what was granted.
  return Math.round(pc.mood - before);
}

function counters(engine, rows) {
  for (const [counter, amount] of rows || []) engine.achievement?.(counter, amount);
}

function avatarTop(engine) {
  const pl = engine.player;
  const h = Number(pl?.height);
  return (pl?.y || 0) - (Number.isFinite(h) && h > 40 ? Math.min(150, h) : 110);
}

function ensureLayer(engine) {
  const host = engine.fxLayer;
  if (!host) return null;
  if (!layer || layer.destroyed) {
    layer = new engine.PIXI.Container();
    layer._hiSignsFx = true;
  }
  if (layer.parent !== host) host.addChild(layer);
  return layer;
}

function frames(engine, variant, kind) {
  const key = `${variant}:${kind}`;
  if (frameCache.has(key)) return frameCache.get(key);
  const sheet = hiArtSheet(variant, kind);
  const base = sourceFromUrl(sheet.url);
  const list = [];
  for (let i = 0; i < sheet.frames; i += 1) {
    list.push(frameTexture(base, new engine.PIXI.Rectangle((i % sheet.cols) * sheet.w, Math.floor(i / sheet.cols) * sheet.h, sheet.w, sheet.h)));
  }
  const out = { sheet, list };
  frameCache.set(key, out);
  return out;
}

// ---------------------------------------------------------------------------
// Visuals (AnnouncementController.doEmoteHi / doEmoteHiBonus, Missile, LightningBolt)
// ---------------------------------------------------------------------------

/** The variant's overlay (or the 2x bonus) for two seconds, following `at()` ({ x, y } of its icon). */
function showOverlay(engine, variant, kind, at, ms = HI.OVERLAY_MS) {
  const root = ensureLayer(engine);
  if (!root) return null;
  const { sheet, list } = frames(engine, variant, kind);
  const spr = new engine.PIXI.AnimatedSprite(list);
  spr.anchor.set(sheet.ax / sheet.w, sheet.ay / sheet.h);
  spr.animationSpeed = HI_ART.FPS / 60;
  spr.loop = false;
  spr.gotoAndPlay(0);
  const pos = at();
  if (pos) spr.position.set(pos.x, pos.y);
  root.addChild(spr);
  const fx = {
    kind: `overlay:${kind}:${variant}`,
    sprite: spr,
    born: performance.now(),
    update() {
      if (spr.destroyed) return false;
      const q = at();
      if (q) spr.position.set(q.x, q.y);
      return performance.now() - fx.born < ms;
    },
    destroy() {
      if (!spr.destroyed) spr.destroy();
    },
  };
  effects.push(fx);
  return fx;
}

/**
 * MissileController.doEmoteHiMissile: the variant's "1" icon bobbing toward
 * the target's chest, faster the longer it flies. onHit(missile) when it
 * arrives; it fades out over half a second.
 */
function launchMissile(engine, { variant, from, target, onHit }) {
  const root = ensureLayer(engine);
  const start = from();
  if (!root || !start) return null;
  const { sheet, list } = frames(engine, variant, 'still');
  const box = new engine.PIXI.Container();
  const icon = new engine.PIXI.Sprite(list[0]);
  icon.anchor.set(sheet.ax / sheet.w, sheet.ay / sheet.h);
  box.addChild(icon);
  box.position.set(start.x, start.y);
  box.alpha = 0;
  root.addChild(box);
  const m = createMissile({ x: start.x, y: start.y, accelerate: true });
  const phase = Math.floor(rng() * 10) * 0.1;
  const fx = {
    kind: `missile:${variant}`,
    missile: m,
    sprite: box,
    fadeFrom: 0,
    update(dt) {
      if (box.destroyed) return false;
      if (m.arrived) {
        const k = (performance.now() - fx.fadeFrom) / 500;
        box.alpha = Math.max(0, 1 - k);
        return k < 1;
      }
      const aim = target();
      if (!aim) return false; // the target left (cancel)
      const pl = engine.player;
      // Missile.as speeds are the client's px/s; the remake walks 4.4 px a frame at vx_max 335.
      const vx = (Number(pl?.vxMax) || 4.4) * (MISSILE.CLIENT_VX_MAX / 4.4);
      const scale = 4.4 * 60 / MISSILE.CLIENT_VX_MAX;
      stepMissile(m, dt, aim, { vxMax: vx, scale });
      box.alpha = Math.min(1, m.ms / 100);
      box.position.set(m.x, m.y);
      icon.y = missileBob(m.ms, phase);
      if (m.arrived) {
        fx.fadeFrom = performance.now();
        onHit?.(m);
      }
      return true;
    },
    destroy() {
      if (!box.destroyed) box.destroy({ children: true });
    },
  };
  effects.push(fx);
  return fx;
}

/** LightningBolt: a jagged line, redrawn every frame, fading in 0.2 s and out over the last 0.8 s. */
function showBolt(engine, color, a, b) {
  const root = ensureLayer(engine);
  if (!root) return null;
  const g = new engine.PIXI.Graphics();
  root.addChild(g);
  const born = performance.now();
  const glow = 0.3 + rng() * 0.4;
  const step = (x1, y1, x2, y2, d, pts) => {
    if (d < 1) {
      pts.push([x1, y1, x2, y2]);
      return;
    }
    const h = d * 0.5;
    const xm = (x1 + x2) * 0.5 + (Math.random() - 0.5) * h;
    const ym = (y1 + y2) * 0.5 + (Math.random() - 0.5) * h;
    step(x1, y1, xm, ym, h, pts);
    step(x2, y2, xm, ym, h, pts);
  };
  const fx = {
    kind: 'bolt',
    sprite: g,
    update() {
      if (g.destroyed) return false;
      const t = (performance.now() - born) / 1000;
      if (t >= HI.BOLT_SECS) return false;
      const p1 = a();
      const p2 = b();
      if (!p1 || !p2) return false;
      const fadeIn = Math.min(1, t / HI.BOLT_FADE_IN);
      const fadeOut = Math.min(1, (HI.BOLT_SECS - t) / HI.BOLT_FADE_OUT);
      g.alpha = Math.max(0, Math.min(fadeIn, fadeOut));
      const pts = [];
      step(p1.x, p1.y, p2.x, p2.y, Math.hypot(p2.x - p1.x, p2.y - p1.y) / 3, pts);
      g.clear();
      // GlowFilter(color, 0.3-0.7, 8, 8): a soft wide pass under the 2 px bolt.
      for (const [x1, y1, x2, y2] of pts) g.moveTo(x1, y1).lineTo(x2, y2);
      g.stroke({ width: 9, color, alpha: glow * 0.45, cap: 'round', join: 'round' });
      for (const [x1, y1, x2, y2] of pts) g.moveTo(x1, y1).lineTo(x2, y2);
      g.stroke({ width: 2, color, alpha: 1 });
      return true;
    },
    destroy() {
      if (!g.destroyed) g.destroy();
    },
  };
  effects.push(fx);
  return fx;
}

function moodText(engine, x, y, n, bang = false) {
  if (!(n > 0)) return;
  engine.floatText?.(x, y, `+${n} mood${bang ? '!' : ''}`, 0xfff0a8);
}

/** doEmoteHiBonus: the 2x sign between you and the Butler, two bolts, HI_FLOWERS_2X, "+N mood!". */
function showBonus(engine, variant, granted) {
  const pl = engine.player;
  const spot = butlerApi.hiSpot(engine);
  if (!pl || !spot) return;
  const mid = { x: pl.x - (pl.x - spot.x) / 2, y: pl.y - (pl.y - spot.y) / 2 + HI.BONUS_OVERLAY_DY };
  const over = showOverlay(engine, variant, 'bonus', () => mid, HI.BONUS_OVERLAY_MS);
  const color = hiColor(variant);
  const to = () => (over && !over.sprite.destroyed ? { x: mid.x, y: mid.y + HI.BOLT_TO_DY } : null);
  showBolt(engine, color, () => (engine.player ? { x: engine.player.x, y: engine.player.y + HI.BOLT_FROM_DY } : null), to);
  showBolt(engine, color, () => {
    const s = butlerApi.hiSpot(engine);
    return s ? { x: s.x, y: s.y + HI.BOLT_FROM_DY } : null;
  }, to);
  engine.playSound?.('HI_FLOWERS_2X');
  moodText(engine, pl.x, avatarTop(engine) - 6, granted, true);
  bonusCount += 1;
}

function playerOverlayAt(engine) {
  return () => (engine.player ? { x: engine.player.x, y: engine.player.y + HI.OVERLAY_DY } : null);
}

function butlerOverlayAt(engine) {
  return () => {
    const s = butlerApi.hiSpot(engine);
    return s ? { x: s.x, y: s.top } : null;
  };
}

// ---------------------------------------------------------------------------
// You say hi (doEmote)
// ---------------------------------------------------------------------------

function butlerNear(engine) {
  const pl = engine.player;
  const spot = butlerApi.hiSpot(engine);
  if (!pl || !spot || !butlerApi.hiState()) return false;
  return Math.hypot(spot.x - pl.x, spot.y - pl.y) <= HI.RADIUS;
}

/** The "5" key / "hi" in chat. Returns what happened (QA). */
function sayHi(engine, { force = false } = {}) {
  if (!engine?.started || !engine.player) return 'not-started';
  const t = performance.now();
  if (!force && t - lastHiAt < HI.THROTTLE_MS) return 'throttled';
  lastHiAt = t;
  const now = nowMs();
  const b = butlerApi.hiState();
  const near = butlerNear(engine);
  const out = playerSaysHi(p, b, { now, rand: rng, butlerNear: near, butlerLabel: butlerApi.label() || 'Butler' });
  counters(engine, out.counters);
  if (out.activity) engine.pushActivity?.(out.activity);
  showOverlay(engine, out.variant, 'hi', playerOverlayAt(engine));
  if (out.butlerTarget) {
    // Shards: the say-hier hears HI_FLOWERS; the missile leaves after 0.9 s from just above the sign.
    engine.playSound?.('HI_FLOWERS');
    const variant = out.variant;
    later(HI.SHARD_DELAY_MS, () => launchMissile(engine, {
      variant,
      from: () => (engine.player ? { x: engine.player.x, y: engine.player.y + HI.OVERLAY_DY + HI.MISSILE_START_DY } : null),
      target: () => {
        const s = butlerApi.hiSpot(engine);
        return s ? { x: s.x, y: s.y + HI.MISSILE_TARGET_DY } : null;
      },
      // An itemstack target: no mood text, no evasion (doMissilehit only handles avatars).
      onHit: () => {
        lastMsg = `hit:butler:${variant}`;
        // A Fine How-Do-You-Do: a hi sign received (inc_data_feats_prod.js 66-73, G143).
        engine.featsIncrement?.('hi_signs_1', 1);
        publish(engine, true);
      },
    }), 'butler');
  }
  if (out.bonus) {
    const variant = out.variant;
    later(HI.BONUS_DELAY_MS, () => {
      const granted = addMood(engine, out.bonusMood);
      counters(engine, playerButlerBonusCounters());
      showBonus(engine, variant, granted);
      lastMsg = `bonus:pc:${variant}:${granted}`;
      save(engine);
      publish(engine, true);
    });
  }
  if (out.respond) sayHiToButler(engine);
  lastMsg = `hi:${out.variant}${out.gotRandomly ? ':random' : ''}${out.butlerTarget ? ':butler' : ''}${out.infectedButler ? ':infected' : ''}${out.bonus ? ':bonus' : ''}`;
  save(engine);
  publish(engine, true);
  return lastMsg;
}

// ---------------------------------------------------------------------------
// The Butler (sayHiToButler, doHiResponse, doSayHi, respondToHi, sayHiHint)
// ---------------------------------------------------------------------------

function sayHiToButler(engine) {
  later(HI.BUTLER_RESPONSE_MS, () => {
    // doHiResponse: the hint is moot now.
    cancel('hint');
    const b = butlerApi.hiState();
    if (!b || !butlerApi.hiSpot(engine)) return;
    if (!butlerHiResponseDue(b, nowMs())) return;
    save(engine);
    later(HI.BUTLER_SAY_HI_MS, () => butlerSayHi(engine), 'butler');
    later(HI.BUTLER_RESPOND_MS, () => {
      const bb = butlerApi.hiState();
      if (!bb) return;
      lastResponse = butlerHiResponse(bb, p, { now: nowMs(), label: PC_LABEL, rand: rng });
      butlerApi.hiSay(engine, lastResponse, HI.BUTLER_BUBBLE_MS);
      publish(engine, true);
    }, 'butler');
  }, 'butler');
}

/** doSayHi: once per game day, its sign over its head and a missile chasing you. */
function butlerSayHi(engine) {
  const b = butlerApi.hiState();
  const spot = butlerApi.hiSpot(engine);
  if (!b || !spot || !engine.player) return null;
  const now = nowMs();
  const out = butlerSaysHi(b, p, { now, rand: rng, busy: butlerWaiting });
  if (!out.said) {
    save(engine);
    lastMsg = `butler:${out.reason}`;
    publish(engine, true);
    return out;
  }
  counters(engine, out.counters);
  const granted = out.mood ? addMood(engine, out.mood) : 0;
  const variant = out.variant;
  showOverlay(engine, variant, 'hi', butlerOverlayAt(engine));
  // Your client hears HI_FLOWERS for a shard aimed at you.
  engine.playSound?.('HI_FLOWERS');
  later(HI.SHARD_DELAY_MS, () => launchMissile(engine, {
    variant,
    from: () => {
      const s = butlerApi.hiSpot(engine);
      return s ? { x: s.x, y: s.top + HI.MISSILE_START_DY } : null;
    },
    target: () => (engine.player && engine.started ? { x: engine.player.x, y: engine.player.y + HI.MISSILE_TARGET_DY } : null),
    onHit: (m) => {
      // A Fine How-Do-You-Do: the Butler's sign received by you (G143).
      engine.featsIncrement?.('hi_signs_1', 1);
      missileHitYou(engine, m, granted);
    },
  }), 'butler');
  if (out.bonus) {
    later(HI.BONUS_DELAY_MS, () => {
      const moodNow = addMood(engine, out.bonusMood);
      showBonus(engine, variant, moodNow);
      lastMsg = `bonus:butler:${variant}:${moodNow}`;
      save(engine);
      publish(engine, true);
    }, 'butler');
  }
  butlerWaiting = true;
  later(HI.HINT_MS, () => sayHiHint(engine), 'hint');
  lastMsg = `butler:hi:${variant}${out.infectedPlayer ? ':infected' : ''}${out.bonus ? ':bonus' : ''}`;
  save(engine);
  publish(engine, true);
  return out;
}

/** sayHiHint: wait out a conversation; tell someone who never said hi about the 5 key. */
function sayHiHint(engine) {
  if (butlerApi.hiBusy()) {
    later(HI.HINT_RETRY_MS, () => sayHiHint(engine), 'hint');
    return;
  }
  butlerWaiting = false;
  if (hiHintDue(p)) {
    butlerApi.hiSay(engine, HI_TEXT.hint, HI.BUTLER_BUBBLE_MS);
    lastMsg = 'butler:hint';
    publish(engine, true);
  }
}

/** MissileController.doMissilehit on you, then doHiEmoteMissileHit (accelerate: evasion). */
function missileHitYou(engine, m, granted) {
  const pl = engine.player;
  if (pl) moodText(engine, pl.x, avatarTop(engine) + 30, granted);
  engine.playSound?.('HI_FLOWERS_HIT');
  const secs = missileSeconds(m);
  p.bestEvasion = Math.max(p.bestEvasion || 0, secs);
  for (const id of evasionBadges(secs)) engine.grantAchievement?.(id);
  let record = null;
  const tsid = engine.streetTsid;
  if (tsid && secs >= 10) {
    const slot = engine.streetSlot?.(HI_FEATURE_ID);
    if (slot) {
      const recs = normalizeEvasionRecords(slot.records);
      record = maybeSetEvasionRecord(recs, { secs, label: 'you', now: nowMs() });
      slot.records = recs;
      if (record.stored) rememberDailyRecord(p, tsid, nowMs());
      lastRecord = `${record.status}:${secs}`;
    }
  }
  const line = evasionActivity(secs, record, 'Your');
  if (line) engine.pushActivity?.(line);
  lastEvasion = String(secs);
  lastMsg = `hit:you:${secs}`;
  save(engine);
  publish(engine, true);
}

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

function inTextField(target) {
  return Boolean(target?.matches?.('input, textarea, select, [contenteditable="true"]'));
}

function onKey(e) {
  if (!eng?.started || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
  if (inTextField(e.target)) return;
  // LocationInputHandler: NUMBER_5 and NUMPAD_5 (H is the remake's Feat key).
  if (e.key === '5' || e.code === 'Digit5' || e.code === 'Numpad5') sayHi(eng);
}

/** Emotes.showEmote: a chat line that is just "hi" says hi. */
function onSubmit(e) {
  if (!eng?.started || e.target?.id !== 'local-chat-form') return;
  const input = document.getElementById('local-chat-input');
  if (String(input?.value || '').toLowerCase() === 'hi') sayHi(eng);
}

// ---------------------------------------------------------------------------
// QA
// ---------------------------------------------------------------------------

function publish(engine, force = false) {
  const t = performance.now();
  if (!force && t < publishAt) return;
  publishAt = t + 250;
  const now = nowMs();
  const b = butlerApi.hiState();
  engine.setData('hiVariant', playerHiVariant(p, now));
  engine.setData('hiButlerVariant', b?.variant || '');
  engine.setData('hiCount', String(p.count || 0));
  engine.setData('hiLast', lastMsg);
  engine.setData('hiMissiles', String(effects.filter((f) => f.missile && !f.missile.arrived).length));
  const flying = effects.find((f) => f.missile && !f.missile.arrived);
  engine.setData('hiMissileSecs', flying ? String(missileSeconds(flying.missile)) : lastEvasion);
  engine.setData('hiBonus', String(bonusCount));
  engine.setData('hiMood', String(Math.round(Number(engine.pc?.mood) || 0)));
  engine.setData('hiResponse', lastResponse);
  engine.setData('hiOverlay', effects.filter((f) => f.kind.startsWith('overlay')).map((f) => f.kind.slice(8)).join(','));
  engine.setData('hiRecord', lastRecord);
  engine.setData('hiRecordsHeld', String((p.records || []).length));
  engine.setData('hiBest', String(p.bestEvasion || 0));
}

function seededRand(seed) {
  let a = Math.floor(seed * 2147483647) || 1;
  return () => {
    a = (a * 1103515245 + 12345) % 2147483648;
    return a / 2147483648;
  };
}

/** &hidemo=1: seed your sign and the Butler's from params (once the Butler exists). */
function demoSetup(engine) {
  if (demoDone) return;
  if (!engine.param('hidemo') && !engine.param('hiautoplay')) {
    demoDone = true;
    return;
  }
  const b = butlerApi.hiState();
  if (!b || !butlerApi.hiSpot(engine)) return;
  demoDone = true;
  const roll = engine.param('hiroll');
  if (roll != null && roll !== '' && Number.isFinite(Number(roll))) {
    const r = Math.max(0, Math.min(0.9999, Number(roll)));
    rng = () => r;
  } else if (engine.param('hiautoplay')) rng = seededRand(0.37);
  const now = nowMs();
  const yesterday = engine.param('hiyesterday') === '1' ? now - 14_400_000 : 0;
  if (yesterday) {
    const v = isHiVariant(engine.param('hivariant')) ? engine.param('hivariant') : 'bats';
    p.variant = v;
    p.variantDay = hiDay(yesterday);
    p.butlers = { butler: yesterday };
    setButlerHiVariant(b, isHiVariant(engine.param('hibutlervariant')) ? engine.param('hibutlervariant') : 'stars', yesterday);
    b.pcs = { pc: yesterday };
    b.responseDay = hiDay(yesterday);
  } else {
    const v = engine.param('hivariant');
    if (isHiVariant(v)) {
      p.variant = '';
      setPlayerHiVariant(p, v, now);
    }
    const bv = engine.param('hibutlervariant');
    if (bv === 'none') {
      b.variant = '';
      b.gtDay = -1;
      b.pcs = {};
    } else if (isHiVariant(bv)) setButlerHiVariant(b, bv, now);
    if (engine.param('hibutlerhied') === '1') b.pcs.pc = now;
  }
  save(engine);
  const auto = engine.param('hiautoplay');
  // Let the arrival greeting's two lines play first (greetNow's follow-up comes at 3.8 s).
  if (auto) autoplay = { mode: String(auto).toLowerCase(), phase: 'start', at: performance.now() + 6000, steps: 0 };
  publish(engine, true);
}

function autoplayStep(engine) {
  if (!autoplay || performance.now() < autoplay.at) return;
  const a = autoplay;
  const status = (s) => engine.setData('hiAutoplay', s);
  const wait = (ms) => { a.at = performance.now() + ms; };
  const done = (s) => { status(s); autoplay = null; };
  const pl = engine.player;
  const spot = butlerApi.hiSpot(engine);
  if (!pl || !spot) return wait(300);
  const move = (x) => { pl.x = x; pl.vx = 0; };
  switch (a.mode) {
    case 'butler':
    case 'infect':
      if (a.phase === 'start') {
        // Stand 330 px off (inside the 400 px radius) so the missiles have room to fly.
        a.phase = 'say';
        move(spot.x - 330);
        return wait(600);
      }
      if (a.phase === 'say') {
        a.phase = 'said';
        status(sayHi(engine, { force: true }));
        return wait(5200);
      }
      return done(`${a.mode}:${lastMsg}`);
    case 'again':
      if (a.phase === 'start') {
        a.phase = 'first';
        move(spot.x - 330);
        return wait(600);
      }
      if (a.phase === 'first') {
        a.phase = 'second';
        sayHi(engine, { force: true });
        return wait(4500);
      }
      if (a.phase === 'second') {
        a.phase = 'end';
        status(sayHi(engine, { force: true }));
        return wait(3000);
      }
      return done(`again:${lastMsg}`);
    case 'anywhere':
      if (a.phase === 'start') {
        a.phase = 'end';
        move(spot.x - HI.RADIUS - 300);
        return wait(600);
      }
      return done(`anywhere:${sayHi(engine, { force: true })}`);
    case 'first':
    case 'bonus':
    case 'evade': {
      // Leave the far box, let 10 s pass on the street, walk back in.
      if (a.phase === 'start') {
        a.phase = 'away';
        move(Math.max(40, spot.x - HI.FAR_DIST - 120));
        status('away');
        return wait(500);
      }
      if (a.phase === 'away') {
        if (butlerApi.hiStreetSecs() <= HI.STREET_SECS + 0.5) return wait(250);
        a.phase = 'back';
        move(spot.x - 260);
        status('back');
        return wait(1500);
      }
      if (a.phase === 'back') {
        if (!String(lastMsg).startsWith('butler:hi')) {
          a.steps += 1;
          return a.steps > 20 ? done(`first:none:${lastMsg}`) : wait(250);
        }
        a.phase = a.mode === 'evade' ? 'run' : 'hit';
        a.t0 = performance.now();
        return wait(200);
      }
      if (a.phase === 'run') {
        // Keep away from the missile until it has chased for &hievadesecs, then let it land.
        const need = (Number(engine.param('hievadesecs')) || 12) * 1000;
        const f = effects.find((x) => x.missile && !x.missile.arrived);
        if (f && f.missile.ms < need) {
          const d = pl.x - f.missile.x;
          if (Math.abs(d) < 220) {
            const left = 60;
            const right = Math.max(left + 200, (engine.worldW || 2000) - 60);
            move(f.missile.x < (left + right) / 2 ? right - 40 : left + 40);
          }
          return wait(50);
        }
        if (!f && !String(lastMsg).startsWith('hit:you')) return wait(100);
        a.phase = 'hit';
        return wait(100);
      }
      if (a.phase === 'hit') {
        if (!String(lastMsg).startsWith('hit:you')) return wait(250);
        if (a.mode !== 'bonus') return done(`${a.mode}:${lastMsg}:${lastRecord}`);
        a.phase = 'hiback';
        return wait(900);
      }
      if (a.phase === 'hiback') {
        a.phase = 'end';
        status(sayHi(engine, { force: true }));
        return wait(4200);
      }
      return done(`bonus:${lastMsg}`);
    }
    default:
      return done('unknown');
  }
}

// ---------------------------------------------------------------------------
// Feature
// ---------------------------------------------------------------------------

export const hiSignsFeature = {
  id: HI_FEATURE_ID,

  init(engine) {
    eng = engine;
    butlerApi.setHiHooks({
      // onPlayerCollision "far": at least 10 s on the street.
      far: (e) => {
        if (butlerApi.hiStreetSecs() > HI.STREET_SECS) butlerSayHi(e);
      },
    });
    if (typeof window !== 'undefined') {
      window.addEventListener('keydown', onKey);
      // Capture, so the line is read before the chat form clears it.
      document.addEventListener('submit', onSubmit, true);
    }
  },

  save() {
    return JSON.parse(JSON.stringify(p));
  },

  restore(slice) {
    p = normalizePlayerHi(slice || {});
  },

  onStreetClear() {
    // onPlayerExit: the Butler's hi timers stop and it forgets its target; missiles end with the location.
    cancel('butler');
    cancel('hint');
    butlerWaiting = false;
    for (const f of effects) f.destroy();
    effects = [];
  },

  onNewDay(now, engine) {
    // doNewDay: your sign goes; the tracker counts the daily records you held.
    expirePlayerHi(p, now);
    const held = countHeldDailyRecords(p, now);
    if (held) engine.achievement?.('daily_evasion_record:held', held);
    save(engine);
    publish(engine, true);
  },

  onTick(dtMs, _t, engine) {
    if (!engine.started) return;
    if (!demoDone) demoSetup(engine);
    runTimers();
    if (effects.length) {
      const dt = Math.min(100, Math.max(0, Number(dtMs) || 16.7));
      effects = effects.filter((f) => {
        const alive = f.update(dt);
        if (!alive) f.destroy();
        return alive;
      });
    }
    autoplayStep(engine);
    publish(engine);
  },

  /** QA / tests. */
  _state() {
    return { p, effects, timers, butlerWaiting };
  },
  _sayHi(engine, opts) {
    return sayHi(engine, opts);
  },
  _butlerSayHi(engine) {
    return butlerSayHi(engine);
  },
  _reset() {
    p = normalizePlayerHi({});
    effects = [];
    timers = [];
    lastHiAt = -Infinity;
    butlerWaiting = false;
    demoDone = false;
    autoplay = null;
    rng = Math.random;
  },
};

