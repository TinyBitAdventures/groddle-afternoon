/**
 * Per-street physics and location event scripts (pure: no DOM, no Pixi).
 *
 * Sources (CC0):
 * - tinyspeck/glitch-locations G*.xml `<object id="physics">`: the location's
 *   full PhysicsSetting (103 streets). The client used it in place of the
 *   `normal` preset (NetController.as; PhysicsController.setUpPCPhysicsForLocation)
 *   and multiplied any player adjustments into it (setPcPhysics).
 * - GSJS config_base.js physics_configs.normal: the defaults below.
 * - glitch-client AvatarPhysicsHandler.as: vy is capped at +/-vy_max (x2 up
 *   while triple jumping), friction_air drags vx and vy in the air, jetpack
 *   lets every airborne jump press push again (half force while rising),
 *   multiplier_3_jump scales the triple-jump boost, pc_scale the avatar.
 * - L*.xml `dynamic.events`: named events, each an ordered `actions` hash
 *   run by locations/inc_events.js events_broadcast (deco_show/hide, plat and
 *   wall perms, chained/delayed events, flags with early exit, physics via
 *   players/inc_physics.js physics_event_run, sounds, VOG text, code).
 * - Event triggers: location.js fires instance_created, first_player_enter
 *   and player_enter on arrival. Everything else is fired by items (the
 *   Collision-triggered Event Box `cteb.js` onEnter/onExit, quoins, light
 *   beams, buttons) whose positions and instanceProps were not archived.
 *
 * The remake's movement is its own (game.js handleInput/physics: 4.4 px/frame
 * walk, -9.6 jump, 0.42 gravity), so source settings become multipliers
 * against the normal preset rather than raw px/s values.
 */

/** config_base.js physics_configs.normal. */
export const NORMAL_PHYSICS = Object.freeze({
  vx_max: 335,
  vy_max: 670,
  gravity: 1190,
  vy_jump: -570,
  vx_accel_add_in_floor: 0.3,
  vx_accel_add_in_air: 0.22,
  friction_floor: 4.3,
  friction_air: -0.22,
  friction_thresh: 80,
  vx_off_ladder: 300,
  pc_scale: 1,
  item_scale: 1,
  jetpack: 0,
  y_cam_offset: 150,
  can_3_jump: 0,
  multiplier_3_jump: 1,
  can_wall_jump: 0,
});

/** config_base.js physics_settables. */
export const PHYSICS_PERCENTAGES = Object.freeze([
  'vx_max', 'vy_max', 'gravity', 'vy_jump', 'vx_accel_add_in_floor', 'vx_accel_add_in_air',
  'friction_floor', 'friction_air', 'friction_thresh', 'vx_off_ladder', 'pc_scale', 'item_scale',
  'y_cam_offset', 'multiplier_3_jump',
]);
export const PHYSICS_BOOLEANS = Object.freeze(['jetpack', 'can_3_jump', 'can_wall_jump']);

/** Events location.js fires on arrival, in order (instance first). */
export const ARRIVAL_EVENTS = Object.freeze(['instance_created', 'first_player_enter', 'player_enter']);
/** Arrival events that carry the arriving player (target_pc). */
const TARGETED_ARRIVALS = new Set(['player_enter']);

/** Chained events stop here (a looping script cannot hang the frame). */
export const MAX_EVENT_DEPTH = 24;

/**
 * Streets whose events and physics another system already runs: the party
 * spaces lane (eight templates), Paradise courses, A Summer's Day, The Greedy
 * Street Spirit, and Winter Walk. Transient instances and feature scenes are
 * skipped at runtime as well.
 */
export const OWNED_STREETS = Object.freeze({
  GDOBUP8IR8E2IPH: 'party', GDOE67MFL6E2FBR: 'party', GDOGBH4BG1E2BM0: 'party',
  GDOGNQICG1E2PNI: 'party', GDOK0A8OG1E2C7O: 'party', GUVNGTHAGP93U34: 'party',
  GUVU11R1HP9341R: 'party', GDOOS17UPNJ2HT7: 'party',
  GHFQOLEIHN63P27: 'paradise', GHFCVOD2GN631RJ: 'paradise', GHFCS002GN63BRB: 'paradise',
  GNVV9IM8PL4301V: 'summers-day',
  GNVD57N9ERF3TNH: 'greedy-street-spirit',
  GHF8LE0Q0UC3QEF: 'winter-walk', GHFA15VS0UC3ITS: 'winter-walk',
});

export function streetOwner(tsid) {
  if (!tsid) return null;
  const key = String(tsid).replace(/^L/, 'G');
  return OWNED_STREETS[key] || null;
}

/* ------------------------------------------------------------------ */
/* XML helpers (the archive's flat <object id> / scalar format)        */
/* ------------------------------------------------------------------ */

function decodeEntities(text) {
  return String(text)
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, '&');
}

/** Body of the first `<object id="id">` at or after `from`, matching nesting. */
export function objectBodyById(xml, id, from = 0) {
  const at = xml.indexOf(`<object id="${id}">`, from);
  if (at < 0) return null;
  const tag = /<object id="[^"]*">|<\/object>/g;
  tag.lastIndex = at;
  let depth = 0;
  let start = -1;
  let m;
  while ((m = tag.exec(xml))) {
    if (m[0].startsWith('<object')) {
      if (depth === 0) start = m.index + m[0].length;
      depth += 1;
    } else {
      depth -= 1;
      if (depth === 0) return xml.slice(start, m.index);
    }
  }
  return null;
}

/** Direct child objects of a body, in document order: [{ id, body }]. */
export function childObjects(body) {
  const out = [];
  const tag = /<object id="([^"]*)">|<\/object>/g;
  let depth = 0;
  let current = null;
  let start = 0;
  let m;
  while ((m = tag.exec(body))) {
    if (m[0].startsWith('<object')) {
      if (depth === 0) {
        current = m[1];
        start = m.index + m[0].length;
      }
      depth += 1;
    } else {
      depth -= 1;
      if (depth === 0 && current != null) {
        out.push({ id: current, body: body.slice(start, m.index) });
        current = null;
      }
    }
  }
  return out;
}

/** Typed scalars that are direct children of a body (nested objects skipped). */
export function directScalars(body) {
  let flat = body;
  for (const child of childObjects(body)) flat = flat.replace(child.body, '');
  const out = {};
  for (const m of flat.matchAll(/<(int|dbl|str|bool) id="([^"]+)">([^<]*)<\/\1>|<null id="([^"]+)"\/>/g)) {
    if (m[4]) {
      out[m[4]] = null;
      continue;
    }
    const [, type, key, raw] = m;
    if (type === 'str') out[key] = decodeEntities(raw);
    else if (type === 'bool') out[key] = raw === 'true';
    else out[key] = Number(raw);
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Street physics                                                      */
/* ------------------------------------------------------------------ */

/**
 * The G*.xml location physics block, normalized to the settable names
 * (pc_and_item_scale is the old pc_scale name, PhysicsSetting.updateFromAnonymous).
 * Missing fields take the normal value (NetController.as fills them in).
 * @returns {object|null}
 */
export function parseStreetPhysics(xml) {
  const body = objectBodyById(String(xml || ''), 'physics');
  if (body == null) return null;
  const raw = directScalars(body);
  const out = { ...NORMAL_PHYSICS };
  if ('pc_and_item_scale' in raw && Number.isFinite(Number(raw.pc_and_item_scale))) {
    out.pc_scale = Number(raw.pc_and_item_scale);
  }
  for (const key of Object.keys(NORMAL_PHYSICS)) {
    if (!(key in raw) || raw[key] == null) continue;
    const value = raw[key];
    out[key] = PHYSICS_BOOLEANS.includes(key) ? (value === true || Number(value) === 1 ? 1 : 0) : Number(value);
  }
  return out;
}

/** Only the fields that differ from normal (what a street actually changes). */
export function physicsDelta(setting) {
  const out = {};
  for (const [key, normal] of Object.entries(NORMAL_PHYSICS)) {
    if (setting && key in setting && Number(setting[key]) !== Number(normal)) out[key] = setting[key];
  }
  return out;
}

/**
 * Multiply player adjustments into a location setting (PhysicsController.setPcPhysics):
 * percentages multiply, booleans only ever switch on.
 */
export function applyPhysicsAdjustments(setting, adjustments = {}) {
  const out = { ...NORMAL_PHYSICS, ...(setting || {}) };
  for (const [key, value] of Object.entries(adjustments || {})) {
    if (PHYSICS_BOOLEANS.includes(key)) {
      if (value === true || Number(value) === 1) out[key] = 1;
    } else if (PHYSICS_PERCENTAGES.includes(key) && Number.isFinite(Number(value))) {
      out[key] = out[key] * Number(value);
    }
  }
  return out;
}

/**
 * Movement multipliers for the remake (feature host physics()) from an
 * effective PhysicsSetting. Jump uses the capped launch speed (vy_max also
 * bounds upward velocity in AvatarPhysicsHandler.boundAvatarVelocities).
 */
export function physicsMultipliers(setting) {
  const s = { ...NORMAL_PHYSICS, ...(setting || {}) };
  const n = NORMAL_PHYSICS;
  const ratio = (a, b) => (Number.isFinite(a) && b ? a / b : 1);
  const launch = Math.min(Math.abs(s.vy_jump), Math.abs(s.vy_max) || Infinity);
  const accel = (a, base) => (a > 0 ? Math.sqrt(a / base) : 0.05);
  return {
    speed: ratio(s.vx_max, n.vx_max),
    jump: ratio(launch, Math.abs(n.vy_jump)),
    gravity: ratio(s.gravity, n.gravity),
    vyMax: ratio(Math.abs(s.vy_max), n.vy_max),
    accel: accel(s.vx_accel_add_in_floor, n.vx_accel_add_in_floor),
    airAccel: accel(s.vx_accel_add_in_air, n.vx_accel_add_in_air),
    friction: Math.max(0, ratio(s.friction_floor, n.friction_floor)),
    airDrag: s.friction_air > 0 ? s.friction_air : 0,
    jetpack: Number(s.jetpack) === 1 || s.jetpack === true,
    tripleJump: Number.isFinite(s.multiplier_3_jump) ? Math.max(0, s.multiplier_3_jump) : 1,
    scale: s.pc_scale > 0 ? s.pc_scale : 1,
  };
}

/* ------------------------------------------------------------------ */
/* Location events                                                     */
/* ------------------------------------------------------------------ */

/**
 * Action keys run in string order. The location editor inserts a step after
 * key K by appending digits (6 → 61 → 611, 20 → 2011111), which only sorts
 * between K and its neighbour as a string; `a1`/`a2` keys come from the
 * admin reorder tool.
 */
export function orderedActionKeys(keys) {
  return [...keys].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

const num = (v, fallback = 0) => (Number.isFinite(Number(v)) ? Number(v) : fallback);

/**
 * GSJS code actions the remake can run, recognised statement by statement.
 * Anything else (stateful puzzles, item spawns, god-only debugging
 * teleports, inverted gravity) comes back unsupported with a reason.
 */
export function parseEventCode(code) {
  const src = String(code || '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '')
    .trim();
  if (!src) return { type: 'noop' };
  if (/^if\s*\(\s*pc\.is_god\s*\)/.test(src)) return { type: 'code', supported: false, reason: 'god-only' };
  const steps = [];
  const statements = src.split(/;\s*|\n+/).map((s) => s.trim()).filter(Boolean);
  for (const stmt of statements) {
    let m;
    if (/^delete pc\.\w+$/.test(stmt)) continue;
    if ((m = stmt.match(/^pc\.teleportToLocation\(\s*['"]([A-Z0-9]+)['"]\s*,\s*(-?\d+)\s*,\s*(-?\d+)\s*\)$/))) {
      steps.push({ type: 'teleport', tsid: m[1], x: Number(m[2]), y: Number(m[3]) });
      continue;
    }
    if ((m = stmt.match(/^pc\.sendActivity\(\s*(['"])((?:(?!\1).)*)\1/))) {
      steps.push({ type: 'activity', text: m[2].replace(/<[^>]+>/g, '') });
      continue;
    }
    if ((m = stmt.match(/^pc\.quests_set_flag\(\s*['"]([\w:]+)['"]\s*\)$/))) {
      steps.push({ type: 'quest_flag', flag: m[1] });
      continue;
    }
    if ((m = stmt.match(/^pc\.announce_music_stop\(\s*['"](\w+)['"]/))) {
      steps.push({ type: 'stop_sound', name: m[1] });
      continue;
    }
    return { type: 'code', supported: false, reason: codeReason(src) };
  }
  if (!steps.length) return { type: 'noop' };
  return steps.length === 1 ? steps[0] : { type: 'steps', steps };
}

function codeReason(src) {
  if (/addCTPCPhysics\(\s*\{\s*gravity\s*:\s*-1/.test(src)) return 'inverted-gravity';
  if (/teleportToLocation/.test(src)) return 'conditional-teleport';
  if (/createItemStack|createItemFromOffset/.test(src)) return 'item-spawn';
  if (/viewport_scale|announce_vp_overlay|open_img_menu|ui_callout/.test(src)) return 'client-ui';
  if (/\bloc\.\w+\s*=|call_event|events_broadcast/.test(src)) return 'stateful-script';
  return 'other';
}

/** One raw action hash → normalized action (fields per inc_events.js). */
export function normalizeEventAction(raw) {
  const type = String(raw?.type || '');
  const all = raw?.all_players === true;
  switch (type) {
    case 'deco_hide':
    case 'deco_show':
      return { type, deco: String(raw.deco_id || ''), fade: num(raw.fade, 0) };
    case 'event':
      return { type, event: String(raw.event || ''), delay: Math.max(0, num(raw.delay, 0)) };
    case 'flag_set':
    case 'flag_clear':
    case 'flag_has_exit':
    case 'flag_not_exit':
      return { type, flag: String(raw.flag || '') };
    case 'physics':
      return {
        type,
        param: String(raw.param || ''),
        value: num(raw.value, 1),
        duration: Math.max(0, num(raw.duration, 0)),
        all,
      };
    case 'physics_reset':
      return { type, param: String(raw.param || 'all'), all };
    case 'play_sound':
      return { type, name: String(raw.name || ''), loops: Math.max(1, num(raw.loops, 1)), all };
    case 'stop_sound':
      return { type, name: String(raw.name || ''), all };
    case 'plat':
      return { type, plat: String(raw.plat_id || ''), pc_perm: raw.pc_perm ?? null };
    case 'wall':
      return { type, wall: String(raw.wall_id || ''), pc_perm: raw.pc_perm ?? null };
    case 'pc_vog':
      return {
        type,
        lines: String(raw.text || '').split('//').map((s) => s.trim()).filter(Boolean),
        next: raw.next_event ? String(raw.next_event) : '',
      };
    case 'stop_timers':
      return { type };
    case 'code_player':
    case 'code_location': {
      const parsed = parseEventCode(raw.code);
      return { type, all, code: parsed };
    }
    default:
      return { type, supported: false };
  }
}

/**
 * L*.xml `events` → { [eventName]: action[] } in run order.
 * @returns {Record<string, object[]>}
 */
export function parseLocationEvents(xml) {
  const body = objectBodyById(String(xml || ''), 'events');
  if (body == null) return {};
  const out = {};
  for (const ev of childObjects(body)) {
    const actionsBody = childObjects(ev.body).find((c) => c.id === 'actions');
    const raw = new Map();
    for (const act of actionsBody ? childObjects(actionsBody.body) : []) raw.set(act.id, directScalars(act.body));
    out[ev.id] = orderedActionKeys(raw.keys()).map((key) => normalizeEventAction(raw.get(key)));
  }
  return out;
}

/** Every event reachable from `roots` through `event` actions and VOG next_event. */
export function reachableEvents(events, roots) {
  const seen = new Set();
  const queue = [...roots].filter((name) => events?.[name]);
  while (queue.length) {
    const name = queue.shift();
    if (seen.has(name)) continue;
    seen.add(name);
    for (const act of events[name] || []) {
      const next = act.type === 'event' ? act.event : act.type === 'pc_vog' ? act.next : '';
      if (next && events[next] && !seen.has(next)) queue.push(next);
    }
  }
  return seen;
}

/**
 * Walkable fallback for lost triggers: the platforms and walls that events
 * reachable from arrival switch back on (platforms) or open (walls). The
 * feature only disables a platform or closes a wall when the recovered chain
 * can undo it, so a puzzle street whose reset only collision boxes reverse
 * stays walkable instead of stranding the avatar.
 */
export function recoverableToggles(events) {
  const platOn = new Set();
  const wallOpen = new Set();
  for (const name of reachableEvents(events, ARRIVAL_EVENTS)) {
    for (const act of events[name] || []) {
      if (act.type === 'plat' && act.plat && Number(act.pc_perm) !== 0) platOn.add(act.plat);
      if (act.type === 'wall' && act.wall && act.pc_perm != null && Number(act.pc_perm) === 0) wallOpen.add(act.wall);
    }
  }
  return { platOn, wallOpen };
}

/** Platform ids any event toggles (strict streets start them in source state). */
export function eventPlatformIds(events) {
  const ids = new Set();
  for (const actions of Object.values(events || {})) {
    for (const act of actions) if (act.type === 'plat' && act.plat) ids.add(act.plat);
  }
  return ids;
}

/** Deco ids an event set shows or hides. */
export function eventDecoIds(events) {
  const ids = new Set();
  for (const actions of Object.values(events || {})) {
    for (const act of actions) if ((act.type === 'deco_show' || act.type === 'deco_hide') && act.deco) ids.add(act.deco);
  }
  return ids;
}

/**
 * Collision boxes the archive lost, recovered where the street proves them.
 * Fungal bounce streets: every street with a `bounce` event has exactly as
 * many Collision-triggered Event Boxes as `tree_int_wall_sroom_1` wall-shroom
 * decos (43 of 43), so each shroom carries one box that fires `bounce`.
 * Boxes are screen space like `street.boxes`: bottom-centre x, y, w, h.
 * @param {object} street street JSON (layers, bounds)
 * @param {Record<string, object[]>} events
 * @param {number} ctebCount Collision-triggered Event Box objrefs in the L*.xml
 */
export function inferEventBoxes(street, events, ctebCount = 0) {
  if (!events?.bounce || !ctebCount) return [];
  const mg = (street.layers || []).find((l) => l.id === 'middleground');
  const shrooms = [];
  for (const layer of street.layers || []) {
    const isMg = layer.id === 'middleground';
    const rx = !isMg && mg?.w && layer.w ? mg.w / layer.w : 1;
    const ry = !isMg && mg?.h && layer.h ? mg.h / layer.h : 1;
    for (const deco of layer.decos || []) {
      if (deco.sprite !== 'tree_int_wall_sroom_1') continue;
      const x = isMg ? deco.x - street.bounds.l : deco.x * rx;
      const y = isMg ? deco.y - street.bounds.t : deco.y * ry;
      shrooms.push({ x: Math.round(x), y: Math.round(y), w: Math.round(deco.w * rx), h: Math.round(deco.h * ry) });
    }
  }
  if (shrooms.length !== ctebCount) return [];
  return shrooms.map((rect, i) => ({
    id: `bounce_${i + 1}`,
    ...rect,
    onEnter: ['bounce'],
    // reset_phys exists too, but which box fired it was not archived; running
    // it on exit would cut the 300-400 ms bounce short, so the duration ends it.
    onExit: [],
    source: 'wall-shroom',
  }));
}

/** Point (screen feet) inside a bottom-centre box. */
export function inEventBox(box, x, y) {
  return Math.abs(x - box.x) <= box.w / 2 && y <= box.y + 4 && y >= box.y - box.h;
}

/* ------------------------------------------------------------------ */
/* Runtime                                                             */
/* ------------------------------------------------------------------ */

export function createEventRuntime() {
  return {
    flags: new Set(),
    physics: {}, // param -> { value, until }
    timers: [], // { at, event, target }
    stoppedAt: 0,
    fired: 0,
    log: [],
  };
}

/**
 * Run one event (events_broadcast). Mutates the runtime (flags, physics,
 * timers) and returns the world effects for the caller to apply:
 * { type: 'deco', id, visible, fade } | { type: 'plat'|'wall', id, pc_perm }
 * | { type: 'sound', name, loops, stop } | { type: 'vog', lines }
 * | { type: 'activity', text } | { type: 'teleport', tsid, x, y }
 * | { type: 'quest_flag', flag } | { type: 'unsupported', action }
 * @param {object} runtime createEventRuntime()
 * @param {Record<string, object[]>} events
 * @param {string} name
 * @param {{ now?: number, target?: boolean, depth?: number, firedAt?: number }} ctx
 */
export function runLocationEvent(runtime, events, name, ctx = {}) {
  const effects = [];
  const now = num(ctx.now, 0);
  const depth = num(ctx.depth, 0);
  const target = ctx.target === true;
  if (ctx.firedAt != null && runtime.stoppedAt && ctx.firedAt < runtime.stoppedAt) return effects;
  const actions = events?.[name];
  if (!actions || depth > MAX_EVENT_DEPTH) return effects;
  runtime.fired += 1;
  runtime.log.push(name);
  if (runtime.log.length > 40) runtime.log.shift();
  for (const act of actions) {
    switch (act.type) {
      case 'deco_hide':
      case 'deco_show':
        if (act.deco) effects.push({ type: 'deco', id: act.deco, visible: act.type === 'deco_show', fade: act.fade });
        break;
      case 'plat':
        if (act.plat) effects.push({ type: 'plat', id: act.plat, pc_perm: act.pc_perm });
        break;
      case 'wall':
        if (act.wall) effects.push({ type: 'wall', id: act.wall, pc_perm: act.pc_perm });
        break;
      case 'event':
        if (!act.event) break;
        if (act.delay > 0) runtime.timers.push({ at: now + act.delay, event: act.event, target, firedAt: now });
        else effects.push(...runLocationEvent(runtime, events, act.event, { now, target, depth: depth + 1 }));
        break;
      case 'flag_set':
        runtime.flags.add(act.flag);
        break;
      case 'flag_clear':
        runtime.flags.delete(act.flag);
        break;
      case 'flag_has_exit':
        if (runtime.flags.has(act.flag)) return effects;
        break;
      case 'flag_not_exit':
        if (!runtime.flags.has(act.flag)) return effects;
        break;
      case 'physics':
        if (!(act.all || target) || !act.param) break;
        runtime.physics[act.param] = { value: act.value, until: act.duration > 0 ? now + act.duration : Infinity };
        effects.push({ type: 'physics', param: act.param, value: act.value, duration: act.duration });
        break;
      case 'physics_reset':
        if (!(act.all || target)) break;
        if (act.param === 'all') runtime.physics = {};
        else delete runtime.physics[act.param];
        effects.push({ type: 'physics_reset', param: act.param });
        break;
      case 'play_sound':
      case 'stop_sound':
        if (!(act.all || target) || !act.name) break;
        effects.push({ type: 'sound', name: act.name, loops: act.loops || 1, stop: act.type === 'stop_sound' });
        break;
      case 'pc_vog':
        if (act.lines.length) effects.push({ type: 'vog', lines: act.lines, next: act.next });
        break;
      case 'stop_timers':
        runtime.stoppedAt = now;
        runtime.timers = [];
        break;
      case 'code_player':
      case 'code_location': {
        if (act.type === 'code_player' && !(act.all || target)) break;
        const steps = act.code?.type === 'steps' ? act.code.steps : [act.code];
        for (const step of steps) {
          if (!step || step.type === 'noop') continue;
          if (step.type === 'code') effects.push({ type: 'unsupported', reason: step.reason });
          else if (step.type === 'stop_sound') effects.push({ type: 'sound', name: step.name, loops: 1, stop: true });
          else effects.push({ ...step });
        }
        break;
      }
      default:
        effects.push({ type: 'unsupported', reason: act.type || 'unknown' });
    }
  }
  return effects;
}

/** Arrival events in source order, with whether each carries the player. */
export function arrivalEvents(events) {
  return ARRIVAL_EVENTS.filter((name) => events?.[name]).map((name) => ({ name, target: TARGETED_ARRIVALS.has(name) }));
}

/**
 * Pop timers due at `now` (the runtime keeps the rest).
 * @returns {{ event: string, target: boolean, firedAt: number }[]}
 */
export function dueEventTimers(runtime, now) {
  const due = [];
  const keep = [];
  for (const timer of runtime.timers) (timer.at <= now ? due : keep).push(timer);
  runtime.timers = keep;
  return due.sort((a, b) => a.at - b.at);
}

/**
 * Active event physics as adjustments (players/inc_physics.js
 * physics_event_run keys each param once; expired entries are dropped).
 */
export function eventPhysicsAdjustments(runtime, now) {
  const out = {};
  for (const [param, entry] of Object.entries(runtime.physics || {})) {
    if (entry.until <= now) {
      delete runtime.physics[param];
      continue;
    }
    // A 1 does not factor in (makeStackedPhysics), so it acts as a reset.
    if (Number(entry.value) === 1 && !PHYSICS_BOOLEANS.includes(param)) continue;
    out[param] = entry.value;
  }
  return out;
}

/**
 * Street JSON fields from parsed XML: `physics` (the delta from normal plus
 * the full setting), `events`, and recovered `eventBoxes`. Teleports gain
 * `street` (imported key) and `arrive` (target screen) via `resolveArrival`.
 */
export function buildStreetEvents({ setting = null, events = {}, ctebCount = 0, street, resolveArrival }) {
  const out = {};
  if (setting) {
    const delta = physicsDelta(setting);
    out.physics = { delta, setting };
  }
  const names = Object.keys(events || {});
  if (names.length) {
    for (const actions of Object.values(events)) {
      for (const act of actions) {
        const steps = act.code?.type === 'steps' ? act.code.steps : act.code ? [act.code] : [];
        for (const step of steps) {
          if (step.type !== 'teleport' || !resolveArrival) continue;
          const found = resolveArrival(step.tsid, step.x, step.y);
          step.street = found?.street || null;
          if (found?.arrive) step.arrive = found.arrive;
        }
      }
    }
    out.events = events;
    const boxes = street ? inferEventBoxes(street, events, ctebCount) : [];
    if (boxes.length) out.eventBoxes = boxes;
  }
  return out;
}

/** Counts for the build log and tests. */
export function eventStats(events) {
  const stats = { events: 0, actions: 0, types: {}, arrival: 0, arrivalReachable: 0 };
  const reach = reachableEvents(events, ARRIVAL_EVENTS);
  for (const [name, actions] of Object.entries(events || {})) {
    stats.events += 1;
    if (ARRIVAL_EVENTS.includes(name)) stats.arrival += 1;
    if (reach.has(name)) stats.arrivalReachable += 1;
    for (const act of actions) {
      stats.actions += 1;
      const key = act.code ? `${act.type}:${act.code.type === 'code' ? `unsupported-${act.code.reason}` : act.code.type}` : act.type;
      stats.types[key] = (stats.types[key] || 0) + 1;
    }
  }
  return stats;
}
