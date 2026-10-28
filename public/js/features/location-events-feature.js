/**
 * Per-street physics and location event scripts as a feature module
 * (see js/feature-host.js). Rules live in js/location-events.js; data comes
 * from build-street-events.mjs (`street.physics`, `street.events`,
 * `street.eventBoxes`).
 *
 * - Physics: the street's source PhysicsSetting (103 streets: underwater
 *   Jal/Samudra swimming, low-gravity party spaces, tiny-avatar puzzle
 *   streets) times any active event adjustments, handed to the movement
 *   code as multipliers through the host physics() hook. pc_scale resizes
 *   the avatar for the visit.
 * - Events: instance_created, first_player_enter and player_enter run on
 *   arrival, chains and delays follow, and recovered collision boxes (the
 *   40 fungal streets' wall shrooms) fire `bounce` when the avatar's feet
 *   enter them. Actions: deco show/hide (with fades), platform and wall
 *   perms, flags with early exit, timed physics, sounds that were
 *   recovered, VOG text, activity lines, quest flags, and teleports
 *   (travelGate first). Stateful puzzle code, item spawns, client UI calls,
 *   god-only debug teleports and inverted gravity stay unsupported.
 * - Streets other systems own (party spaces, Paradise, A Summer's Day, The
 *   Greedy Street Spirit, Winter Walk), transient instances, feature scenes
 *   and homes are left alone.
 *
 * QA: ?autostart=1&questoffer=off&physicsdemo=<tsid> travels there and
 * publishes the multipliers (physicsStreet, physicsActive, physicsSpeed,
 * physicsJump, physicsGravity, physicsVyMax, physicsJetpack, physicsTriple,
 * physicsScale, physicsApex = height of the last airborne arc);
 * &physicsautoplay=jump launches one jump at the street's jump speed.
 * ?eventdemo=<tsid>&eventautoplay=1 drops the avatar onto the first event
 * box, or fires each named event in turn when the street has none
 * (&eventname=<name> for one; &eventwait=<ms> before the first, default 300;
 * &eventautoplay=busy fires while a menu is open too, so a VOG can be seen
 * waiting for the menu to close, G217). Data: eventStreet, eventCount, eventBoxes,
 * eventFired, eventLast, eventEffects, eventPhysics, eventUnsupported,
 * eventTeleport, eventDemo.
 */

import {
  NORMAL_PHYSICS,
  applyPhysicsAdjustments,
  arrivalEvents,
  createEventRuntime,
  dueEventTimers,
  eventPhysicsAdjustments,
  inEventBox,
  physicsMultipliers,
  eventPlatformIds,
  recoverableToggles,
  runLocationEvent,
  streetOwner,
} from '../location-events.js?v=g403-1';

export const LOCATION_EVENTS_FEATURE_ID = 'location-events';
const DATA_MS = 250;

let current = null; // { tsid, street, setting, events, boxes, runtime, inside, owner }
let fades = [];
let stash = new Map(); // disabled platform id -> platform
let scale = { player: null, base: 1, applied: 1 };
let effectCounts = {};
let unsupported = 0;
let lastData = 0;
let apex = { airborne: false, startY: 0, minY: 0, last: 0 };
let demo = { kind: '', stage: 'idle', at: 0, queue: [] };
let teleporting = false;
// Simulation clock (sum of onTick dtMs): event physics and timers follow the
// movement integration, so slow frames (or headless QA) keep source timings.
let clock = 0;
// Other features (puzzle triggers) that rebuild a street's lost triggers:
// { strict(street, engine) -> true } turns the walkable fallback off there.
const streetHooks = [];

function inactive(engine) {
  return !current || (engine.transientInstance() && !current.instanced) || engine.homeContext?.().inHome;
}

/** A hook may run a held street's own scripts inside a transient instance (quest rooms on archived streets). */
function instanceAllowed(street, engine) {
  return streetHooks.some((hook) => hook.instance?.(street, engine) === true);
}

function effectiveSetting(now) {
  if (!current) return null;
  const adj = eventPhysicsAdjustments(current.runtime, now);
  if (!current.setting && !Object.keys(adj).length) return null;
  return applyPhysicsAdjustments(current.setting || NORMAL_PHYSICS, adj);
}

/* ------------------------------------------------------------------ */
/* Effects                                                             */
/* ------------------------------------------------------------------ */

function setDeco(engine, id, visible, fadeMs, now) {
  const view = engine.decoViews?.get(id);
  if (!view || view.destroyed) return false;
  fades = fades.filter((f) => f.view !== view);
  const ms = Math.max(0, Number(fadeMs) || 0);
  if (!ms) {
    view.visible = visible;
    view.alpha = 1;
    return true;
  }
  const from = view.visible ? view.alpha : 0;
  view.visible = true;
  view.alpha = from;
  fades.push({ view, from, to: visible ? 1 : 0, start: now, ms, hideAtEnd: !visible });
  return true;
}

function setPlatform(engine, id, pcPerm) {
  const plats = engine.platforms;
  if (!Array.isArray(plats)) return false;
  if (Number(pcPerm) === 0) {
    const at = plats.findIndex((p) => p.id === id);
    if (at < 0) return stash.has(id);
    stash.set(id, plats[at]);
    plats.splice(at, 1);
    return true;
  }
  const back = stash.get(id);
  // A line switched to 1 (solid from below) or null/-1 changes what it is for the avatar.
  const live = back || plats.find((p) => p.id === id);
  if (live && 'pcPerm' in live) live.pcPerm = pcPerm == null ? null : Number(pcPerm);
  if (!back) return plats.some((p) => p.id === id);
  stash.delete(id);
  plats.push(back);
  return true;
}

function setWall(engine, id, pcPerm) {
  const wall = (engine.street?.barriers || []).find((w) => w.id === id);
  if (!wall) return false;
  wall.pc_perm = pcPerm == null ? null : Number(pcPerm);
  return true;
}

function teleport(engine, step) {
  if (teleporting || !step.street) return false;
  if (step.street === engine.streetTsid || step.street.slice(1) === String(engine.streetTsid).slice(1)) {
    if (step.arrive && engine.player) {
      engine.player.x = step.arrive.x;
      engine.player.y = step.arrive.y;
      engine.player.vx = 0;
      engine.player.vy = 0;
      engine.snapCamera();
    }
    return true;
  }
  const gate = engine.travelGate(step.street);
  if (gate && gate.ok === false) {
    if (gate.msg) engine.toast(gate.msg);
    return false;
  }
  teleporting = true;
  engine.setData('eventTeleport', step.street);
  Promise.resolve(engine.enter(step.street, step.arrive ? { spawnX: step.arrive.x, spawnY: step.arrive.y } : {}))
    .catch(() => {})
    .finally(() => {
      teleporting = false;
    });
  return true;
}

function soundUrl(name) {
  for (const actions of Object.values(current?.events || {})) {
    for (const act of actions) if (act.type === 'play_sound' && act.name === name && act.url) return act.url;
  }
  return null;
}

function applyEffects(engine, effects, now) {
  for (const fx of effects) {
    effectCounts[fx.type] = (effectCounts[fx.type] || 0) + 1;
    switch (fx.type) {
      case 'deco':
        setDeco(engine, fx.id, fx.visible, fx.fade, now);
        break;
      case 'plat':
        if (Number(fx.pc_perm) === 0 && !current?.strict && !current?.guard?.platOn.has(fx.id) && demo.stage !== 'run') {
          effectCounts.kept_walkable = (effectCounts.kept_walkable || 0) + 1;
          break;
        }
        setPlatform(engine, fx.id, fx.pc_perm);
        break;
      case 'wall':
        if (!(fx.pc_perm != null && Number(fx.pc_perm) === 0) && !current?.strict && !current?.guard?.wallOpen.has(fx.id) && demo.stage !== 'run') {
          effectCounts.kept_walkable = (effectCounts.kept_walkable || 0) + 1;
          break;
        }
        setWall(engine, fx.id, fx.pc_perm);
        break;
      case 'sound': {
        if (fx.stop) break;
        // The sound-key catalog plays recovered files or synth stand-ins;
        // fall back to a recorded url when the catalog does not know the key.
        const played = typeof engine.playSound === 'function' ? engine.playSound(fx.name, { volume: 0.6 }) : null;
        const url = played ? null : soundUrl(fx.name);
        if (url) engine.playCue(url, { volume: 0.5 });
        break;
      }
      case 'vog': {
        const tsid = engine.streetTsid;
        const next = () => {
          if (fx.next && current && engine.streetTsid === tsid) fire(engine, fx.next, true, clock);
        };
        // G213/G228: locations/inc_events.js events_VOGPlayer 556-600 sends a locking
        // vp_overlay (click_to_advance, one line a click, no close) of centred nuxp_vog
        // text over a 30% black shade, its next_event as the done_payload. game.js
        // engine.vog draws that (js/vog-overlay.js), not the quest card.
        engine.vog?.({ lines: fx.lines, onComplete: next });
        break;
      }
      case 'activity':
        if (fx.text) engine.pushActivity(fx.text);
        break;
      case 'quest_flag':
        engine.questFlag(fx.flag);
        break;
      case 'teleport':
        teleport(engine, fx);
        break;
      case 'unsupported':
        unsupported += 1;
        break;
      default:
        break; // physics / physics_reset already live in the runtime
    }
  }
}

function fire(engine, name, target, now) {
  if (!current?.events?.[name]) return false;
  applyEffects(engine, runLocationEvent(current.runtime, current.events, name, { now, target }), now);
  engine.setData('eventLast', name);
  return true;
}

/* ------------------------------------------------------------------ */
/* Per frame                                                           */
/* ------------------------------------------------------------------ */

function stepFades(now) {
  fades = fades.filter((f) => {
    if (!f.view || f.view.destroyed) return false;
    const t = Math.min(1, (now - f.start) / f.ms);
    f.view.alpha = f.from + (f.to - f.from) * t;
    if (t < 1) return true;
    if (f.hideAtEnd) {
      f.view.visible = false;
      f.view.alpha = 1;
    }
    return false;
  });
}

function stepBoxes(engine, now) {
  const p = engine.player;
  if (!current.boxes.length || !p) return;
  for (const box of current.boxes) {
    const inside = inEventBox(box, p.x, p.y);
    const was = current.inside.has(box.id);
    if (inside === was) continue;
    if (inside) current.inside.add(box.id);
    else current.inside.delete(box.id);
    for (const name of (inside ? box.onEnter : box.onExit) || []) fire(engine, name, true, now);
  }
}

function stepScale(engine, mult) {
  const p = engine.player;
  if (!p) return;
  if (scale.player !== p) scale = { player: p, base: p.baseScale, applied: 1 };
  const want = mult?.scale ?? 1;
  if (want === scale.applied) return;
  // Something else re-based the avatar (character builder): adopt its base.
  if (Math.abs(p.baseScale - scale.base * scale.applied) > 1e-6) scale.base = p.baseScale / scale.applied;
  p.baseScale = scale.base * want;
  scale.applied = want;
}

function restoreScale() {
  const p = scale.player;
  if (p && !p.destroyed && scale.applied !== 1) p.baseScale = scale.base;
  scale = { player: null, base: 1, applied: 1 };
}

function stepApex(engine) {
  const p = engine.player;
  if (!p) return;
  if (!p.onGround) {
    if (!apex.airborne) apex = { ...apex, airborne: true, startY: p.y, minY: p.y };
    apex.minY = Math.min(apex.minY, p.y);
  } else if (apex.airborne) {
    apex = { airborne: false, startY: 0, minY: 0, last: Math.round(apex.startY - apex.minY) };
  }
}

function publish(engine, now, mult) {
  if (now - lastData < DATA_MS) return;
  lastData = now;
  engine.setData('physicsStreet', current?.tsid || '');
  engine.setData('physicsActive', mult ? '1' : '0');
  const m = mult || {};
  const f = (v, d = 1) => (Number.isFinite(v) ? Number(v.toFixed(3)) : d);
  engine.setData('physicsSpeed', f(m.speed));
  engine.setData('physicsJump', f(m.jump));
  engine.setData('physicsGravity', f(m.gravity));
  engine.setData('physicsVyMax', m.vyMax ? f(m.vyMax) : '');
  engine.setData('physicsJetpack', m.jetpack ? '1' : '0');
  engine.setData('physicsTriple', f(m.tripleJump));
  engine.setData('physicsScale', f(m.scale));
  engine.setData('physicsApex', apex.last);
  if (!current) return;
  engine.setData('eventStreet', current.tsid);
  engine.setData('eventCount', Object.keys(current.events || {}).length);
  engine.setData('eventBoxes', current.boxes.length);
  engine.setData('eventFired', current.runtime.fired);
  engine.setData('eventEffects', Object.entries(effectCounts).map(([k, v]) => `${k}:${v}`).join(','));
  engine.setData('eventPhysics', Object.entries(eventPhysicsAdjustments(current.runtime, now)).map(([k, v]) => `${k}=${v}`).join(','));
  engine.setData('eventUnsupported', unsupported);
}

/* ------------------------------------------------------------------ */
/* QA                                                                  */
/* ------------------------------------------------------------------ */

function demoTarget(engine) {
  const physics = engine.param('physicsdemo');
  if (physics) return { kind: 'physics', tsid: physics === '1' ? 'GUV10AGQOOA3MOE' : physics };
  const events = engine.param('eventdemo');
  if (events) return { kind: 'event', tsid: events === '1' ? 'GIF2K0TOOK434L9' : events };
  return null;
}

const pl0 = (pl) => Math.min(pl.x1, pl.x2);
const pl1 = (pl) => Math.max(pl.x1, pl.x2);

function sameStreet(a, b) {
  return Boolean(a && b) && String(a).slice(1) === String(b).slice(1);
}

function demoStep(engine, now) {
  const want = demoTarget(engine);
  if (!want || demo.stage === 'done' || now < demo.at) return;
  if (demo.stage === 'idle') {
    if (!engine.streetExists(want.tsid)) {
      demo.stage = 'done';
      engine.setData(want.kind === 'physics' ? 'physicsDemo' : 'eventDemo', 'unknown-street');
      return;
    }
    if (sameStreet(engine.streetTsid, want.tsid)) {
      demo = { ...demo, kind: want.kind, stage: 'arrived', at: now + 600 };
      return;
    }
    demo = { ...demo, kind: want.kind, stage: 'away', at: now + 20000 };
    engine.setData(want.kind === 'physics' ? 'physicsDemo' : 'eventDemo', 'travelling');
    engine.enter(want.tsid);
    return;
  }
  if (demo.stage === 'away') {
    demo.stage = 'done'; // the street never arrived
    return;
  }
  if (demo.stage !== 'arrived' && demo.stage !== 'run') return;
  const p = engine.player;
  if (!p || !current) return;
  if (want.kind === 'physics') {
    engine.setData('physicsDemo', 'arrived');
    if (engine.param('physicsautoplay') === 'jump' && p.onGround) {
      const mult = physicsMultipliers(effectiveSetting(clock) || NORMAL_PHYSICS);
      p.vy = -9.6 * mult.jump;
      p.onGround = false;
      engine.setData('physicsDemo', 'jumped');
    }
    demo.stage = 'done';
    return;
  }
  // Event demo.
  if (engine.param('eventautoplay') !== '1' && engine.param('eventautoplay') !== 'busy') {
    engine.setData('eventDemo', 'arrived');
    demo.stage = 'done';
    return;
  }
  if (demo.stage === 'arrived') {
    const only = engine.param('eventname');
    if (!only && current.boxes.length) {
      // Stand on the box's own ledge (the shroom cap) when it has one.
      const box = current.boxes[0];
      const ledge = (engine.platforms || []).find((pl) =>
        Math.max(pl.x1, pl.x2) >= box.x - box.w / 2 && Math.min(pl.x1, pl.x2) <= box.x + box.w / 2 &&
        Math.max(pl.y1, pl.y2) >= box.y - box.h && Math.min(pl.y1, pl.y2) <= box.y);
      p.x = ledge ? Math.round((Math.max(pl0(ledge), box.x - box.w / 2) + Math.min(pl1(ledge), box.x + box.w / 2)) / 2) : box.x;
      p.y = ledge ? Math.min(ledge.y1, ledge.y2) - 40 : box.y - box.h - 30;
      p.vx = 0;
      p.vy = 0;
      p.onGround = false;
      engine.snapCamera();
      engine.setData('eventDemo', `box:${box.id}`);
      demo.stage = 'done';
      return;
    }
    const arrival = new Set(arrivalEvents(current.events).map((e) => e.name));
    const names = only ? [only] : Object.keys(current.events).filter((n) => !arrival.has(n));
    demo = { ...demo, stage: 'run', queue: names, at: now + Math.max(0, Number(engine.param('eventwait')) || 300) };
    engine.setData('eventDemo', `firing:${names.length}`);
    return;
  }
  // &eventautoplay=busy fires even while a menu is open (G217 QA: the VOG waits for it).
  if (engine.busy() && engine.param('eventautoplay') !== 'busy') return;
  const name = demo.queue.shift();
  if (!name) {
    engine.setData('eventDemo', 'fired-all');
    demo.stage = 'done';
    return;
  }
  fire(engine, name, true, clock);
  demo.at = now + 1200;
}

/* ------------------------------------------------------------------ */
/* API for trigger features                                            */
/* ------------------------------------------------------------------ */

/**
 * The small surface a trigger feature (features/puzzles-feature.js) uses to
 * drive this street's recovered scripts: register a strict hook, fire events
 * as the lost Collision-triggered Event Boxes, switches and keys did, and read
 * the runtime's flags and simulation clock.
 */
export const locationEventsApi = {
  /**
   * hook: { strict(street, engine) -> true when the street's triggers are rebuilt,
   *         instance(street, engine) -> true to run its scripts while a transient instance holds it }.
   */
  register(hook) {
    if (hook && !streetHooks.includes(hook)) streetHooks.push(hook);
  },
  /** The street whose scripts are running (null on owned/instanced streets). */
  active: () => current?.tsid || null,
  strict: () => current?.strict === true,
  has: (name) => Boolean(current?.events?.[name]),
  /** Run one event with the player as target_pc (as a collision box did). */
  fire(engine, name, target = true) {
    if (!current || inactive(engine)) return false;
    return fire(engine, name, target, clock);
  },
  flag: (name) => Boolean(current?.runtime.flags.has(name)),
  /** Effective gravity against normal (negative while a script inverts it). */
  gravity() {
    const setting = effectiveSetting(clock);
    return setting ? setting.gravity / NORMAL_PHYSICS.gravity : 1;
  },
  /** Simulation clock (ms): the one event timers and physics use. */
  clock: () => clock,
  /**
   * Re-enter the current street's scripts (a hook's data arrived after the
   * street did): put back platforms the first run switched off, then run the
   * arrival chain again with the hooks consulted afresh.
   */
  restart(engine) {
    if (!current?.street) return false;
    const street = current.street;
    for (const plat of stash.values()) engine.platforms?.push(plat);
    stash = new Map();
    locationEventsFeature.onStreetEnter(street, engine);
    return true;
  },
};

/* ------------------------------------------------------------------ */
/* Feature                                                             */
/* ------------------------------------------------------------------ */

export const locationEventsFeature = {
  id: LOCATION_EVENTS_FEATURE_ID,

  init(engine) {
    const want = demoTarget(engine);
    if (want) engine.setData(want.kind === 'physics' ? 'physicsDemo' : 'eventDemo', 'idle');
  },

  onStreetEnter(street, engine) {
    restoreScale();
    fades = [];
    stash = new Map();
    current = null;
    effectCounts = {};
    unsupported = 0;
    lastData = 0;
    const instanced = Boolean(street && engine.transientInstance() && instanceAllowed(street, engine));
    if (!street || streetOwner(street.tsid) || (engine.transientInstance() && !instanced) || engine.homeContext?.().inHome) {
      publish(engine, clock, null);
      return;
    }
    if (!street.physics && !street.events) {
      publish(engine, clock, null);
    } else {
      current = {
        tsid: street.tsid,
        street,
        setting: street.physics?.setting || null,
        events: street.events || {},
        boxes: street.eventBoxes || [],
        runtime: createEventRuntime(),
        inside: new Set(),
        instanced,
      };
      // Platforms the arrival chain switches on start in their source state
      // (pc_perm 0, not solid); the remake's collision otherwise treats every
      // line as solid. Ones only lost collision boxes enable stay solid, so
      // those streets remain walkable.
      current.guard = recoverableToggles(current.events);
      // A street whose triggers another feature rebuilt runs its scripts as
      // written: every platform an event toggles starts in its source state.
      current.strict = streetHooks.some((hook) => hook.strict?.(street, engine) === true);
      const toggled = current.strict ? eventPlatformIds(current.events) : current.guard.platOn;
      for (const plat of street.platforms || []) {
        if (toggled.has(plat.id) && Number(plat.pc_perm) === 0) setPlatform(engine, plat.id, 0);
      }
      for (const { name, target } of arrivalEvents(current.events)) fire(engine, name, target, clock);
    }
    const want = demoTarget(engine);
    if (want && demo.stage === 'away' && sameStreet(street.tsid, want.tsid)) {
      demo = { ...demo, stage: 'arrived', at: Date.now() + 900 };
    }
  },

  onStreetClear() {
    restoreScale();
    fades = [];
    stash = new Map();
    current = null;
  },

  /** The avatar's collision height against normal while pc_scale shrinks it (game.js physics). */
  avatarBodyScale() {
    return scale.player && scale.applied !== 1 ? scale.applied : null;
  },

  physics(engine) {
    if (inactive(engine)) return null;
    const setting = effectiveSetting(clock);
    if (!setting) return null;
    const m = physicsMultipliers(setting);
    return {
      speed: m.speed,
      jump: m.jump,
      gravity: m.gravity,
      // The source caps fall speed everywhere; the remake only does where the
      // street or an event changes gravity or the cap itself.
      vyMax: m.vyMax !== 1 || m.gravity !== 1 ? m.vyMax : undefined,
      accel: m.accel,
      airAccel: m.airAccel,
      friction: m.friction,
      airDrag: m.airDrag,
      jetpack: m.jetpack,
      tripleJump: m.tripleJump,
    };
  },

  onTick(dtMs, wallNow, engine) {
    if (!engine.started) return;
    clock += Math.max(0, Number(dtMs) || 0);
    const now = clock;
    demoStep(engine, wallNow);
    if (inactive(engine)) {
      if (scale.applied !== 1) restoreScale();
      publish(engine, now, null);
      return;
    }
    for (const timer of dueEventTimers(current.runtime, now)) {
      applyEffects(engine, runLocationEvent(current.runtime, current.events, timer.event, {
        now,
        target: timer.target,
        firedAt: timer.firedAt,
      }), now);
      if (!current) return; // a teleport cleared the street
    }
    stepBoxes(engine, now);
    if (!current) return;
    stepFades(now);
    const setting = effectiveSetting(now);
    const mult = setting ? physicsMultipliers(setting) : null;
    stepScale(engine, mult);
    stepApex(engine);
    publish(engine, now, mult);
  },
};
