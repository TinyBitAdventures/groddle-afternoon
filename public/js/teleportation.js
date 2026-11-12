/**
 * Teleportation: points, teleporting, and Teleportation Scripts. Pure rules.
 *
 * Source (GSJS, CC0):
 * - players/inc_teleportation.js: teleportation_set_target / can_set_target /
 *   can_teleport / teleport, get_max_targets, get_energy_cost,
 *   get_cooldown_time ("End of the world - reduce all cooldowns by a factor of
 *   60": 5 s at every rank), teleport_complete, quest flags.
 * - items/paper.js create_script: Teleportation IV + Penpersonship + a working
 *   Quill; 1 energy, 1 Paper, 1 Quill wear; destination = current street and
 *   position (items/note.js onInputBoxResponse).
 * - items/teleportation_script.js use(): Teleportation I unless imbued;
 *   can_teleport(skip_skill); energy cost then a cooldown; one-way, consumed;
 *   a vanished destination refunds 100 iMG.
 * - Summons (Teleportation V): teleportation_can_summon 729-835, teleportation_summon
 *   618-704 and teleportation_get_max_summons 969-976. The request, the prompt and the
 *   move are multiplayer (js/summon-mp.js, groddle-afternoon-server summon.go); the
 *   summoner's own checks and payment are here.
 *
 * Each script keeps its own destination, as its own copy (js/tools.js row.tags, kind "script",
 * js/copy-tags.js): teleportation_script.js has stackmax 1 and instance props, and setTarget 298-319
 * puts destination and is_imbued on the one item. The destinations of older saves wait in
 * state.scripts and state.looseScripts until a copy with none takes one (adoptScripts).
 *
 * Death, Naraka and Pooped gates belong to the Hell feature: the feature
 * module asks the host travelGate before any teleport, so these rules never
 * duplicate them.
 */

import { cleanCopyTagOf } from './copy-tags.js?v=7eec7d48';

export const TELEPORT_SKILLS = Object.freeze([
  'teleportation_1',
  'teleportation_2',
  'teleportation_3',
  'teleportation_4',
  'teleportation_5',
]);

/** get_energy_cost: fraction of max energy by highest rank. */
export const TELEPORT_ENERGY_FRACTION = Object.freeze({ 1: 0.33, 2: 0.25, 3: 0.2, 4: 0.15, 5: 0.1 });

export const TELEPORT_COOLDOWN_SECONDS = 5;

/** teleport_complete fires 3 s after the hit animation starts. */
export const TELEPORT_COMPLETE_MS = 3000;
export const TELEPORT_HIT_ANIMATION_MS = 1000;

export const XALANGA_HUB_ID = '95';
export const ZONE_FROM_HUB_ID = '63';
export const ZONE_TO_HUB_ID = '92';

export const SCRIPT_CLASS = 'teleportation_script';
export const SCRIPT_IMBUED_CLASS = 'teleportation_script_imbued';
export const QUILL_CLASS = 'quill';
export const PAPER_CLASS = 'paper';

export const SCRIPT_ITEM = Object.freeze({
  classTsid: SCRIPT_CLASS,
  label: 'Teleportation Script',
  namePlural: 'Teleportation Scripts',
  desc: 'A lovingly handcrafted Teleportation Script (Or "a magical location incantation scribbled on some Paper with a Quill). This will zip you on a one-way ticket to somewhere specific… as long as you have a Teleportation Token or the energy to pay for your ride.',
  baseCost: 5,
  stackMax: 1,
  sellable: false,
  donatable: false,
});

export const QUILL_ITEM = Object.freeze({
  classTsid: QUILL_CLASS,
  label: 'Quill',
  desc: 'This fancy quill (and the skill of Penpersonship) will let you write messages and notes. And maybe give yourself inky fingers.',
  baseCost: 400,
  stackMax: 1,
  isTool: true,
  capacity: 100,
});

export const PAPER_ITEM = Object.freeze({
  classTsid: PAPER_CLASS,
  label: 'Paper',
  baseCost: 2,
  stackMax: 250,
});

export const TELEPORT_TEXT = Object.freeze({
  already: 'You are already teleporting.',
  noSkill: "You don't know how to teleport.",
  noDestination: "You don't have a destination.",
  alreadyThere: 'You are already in that location.',
  gone: 'Your teleportation target no longer exists.',
  cooldown: 'You teleported too recently.',
  energy: "You don't have enough energy.",
  cantSave: "You can't save this location as a Teleportation Point.",
  invalidId: 'Invalid teleport id.',
  dead: 'You are dead.',
  scriptSkill: 'You need to know Teleportation I to use this.',
  scriptGone: "Your destination is no longer available! As a small compromise, here's 100 iMG.",
  scriptCreated: "You've created a Teleportation Script! You can give it to anybody you like.",
  needPenmanship: 'You need to learn Penpersonship.',
  needQuill: "You'll need a Quill first.",
  needPaper: 'You need some Paper to write on.',
});

const DEFAULT_TANK = 100;

function has(learned, id) {
  return Array.isArray(learned) && learned.includes(id);
}

export function teleportRank(learned = []) {
  for (let rank = 5; rank >= 1; rank -= 1) if (has(learned, `teleportation_${rank}`)) return rank;
  return 0;
}

/** teleportation_get_max_targets: 1, 2, then 3 from Teleportation III on. */
export function maxTargets(learned = []) {
  return Math.min(3, teleportRank(learned));
}

/** teleportation_get_energy_cost: round(max_energy x fraction); null without the skill. */
export function teleportEnergyCost(learned = [], tank = DEFAULT_TANK) {
  const rank = teleportRank(learned);
  return rank ? Math.round(tank * TELEPORT_ENERGY_FRACTION[rank]) : null;
}

export function teleportCooldownSeconds(learned = []) {
  return teleportRank(learned) ? TELEPORT_COOLDOWN_SECONDS : null;
}

/** teleportation_get_max_map_teleports: 1000/day from Teleportation IV. */
export function maxMapTeleports(learned = []) {
  return teleportRank(learned) >= 4 ? 1000 : 0;
}

function cleanLocation(loc) {
  if (!loc || typeof loc !== 'object' || typeof loc.tsid !== 'string' || !loc.tsid) return null;
  const n = (v) => (v != null && v !== '' && Number.isFinite(Number(v)) ? Number(v) : undefined);
  const out = { tsid: loc.tsid };
  if (n(loc.x) !== undefined) out.x = n(loc.x);
  if (n(loc.y) !== undefined) out.y = n(loc.y);
  for (const key of ['label', 'hubId', 'hubName']) {
    if (loc[key] != null && loc[key] !== '') out[key] = String(loc[key]);
  }
  return out;
}

/** A row of an older save's list: what it needs is its destination, whatever else it has lost. */
function cleanScript(row) {
  if (!row || typeof row !== 'object') return null;
  const destination = cleanLocation(row.destination);
  if (!destination) return null;
  return { destination, imbued: row.imbued === true };
}

/** An older save's list, cleaned: its rows in their order, each row once (by the id it had). */
function cleanRows(list) {
  const seen = new Set();
  const out = [];
  for (const raw of Array.isArray(list) ? list : []) {
    const row = cleanScript(raw);
    if (!row) continue;
    const id = typeof raw.id === 'string' ? raw.id : '';
    if (id && seen.has(id)) continue;
    if (id) seen.add(id);
    out.push(id ? { ...row, id } : row);
  }
  return out;
}

export function createTeleportState(seed = {}) {
  return normalizeTeleportState(seed);
}

export function normalizeTeleportState(seed = {}) {
  const s = seed && typeof seed === 'object' ? seed : {};
  const targets = {};
  for (const [id, loc] of Object.entries(s.targets || {})) {
    const slot = Number(id);
    const clean = cleanLocation(loc);
    if (Number.isInteger(slot) && slot >= 1 && slot <= 3 && clean) targets[slot] = clean;
  }
  const scripts = cleanRows(s.scripts);
  const looseScripts = cleanRows(s.looseScripts);
  const totals = s.totals && typeof s.totals === 'object' ? s.totals : {};
  const count = (v) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Math.floor(Number(v)) : 0);
  return {
    version: 2,
    targets,
    cooldownUntil: Number(s.cooldownUntil) > 0 ? Number(s.cooldownUntil) : 0,
    dayKey: typeof s.dayKey === 'string' ? s.dayKey : '',
    mapTeleportsToday: count(s.mapTeleportsToday),
    summonsToday: count(s.summonsToday),
    totals: { plain: count(totals.plain), script: count(totals.script), set: count(totals.set), map: count(totals.map) },
    scripts,
    looseScripts,
  };
}

/** teleportation_reset_counters at a new game day. */
export function rollTeleportDay(state, dayKey) {
  const s = normalizeTeleportState(state);
  if (dayKey && s.dayKey !== dayKey) {
    s.dayKey = dayKey;
    s.mapTeleportsToday = 0;
    s.summonsToday = 0; // teleportation_reset_counters 32-39: free_summons_today = 0
  }
  return s;
}

/**
 * Filled and empty point slots for the current rank (teleportation_get_all_targets).
 * @returns {{ id: number, target: object|null }[]}
 */
export function listTargets(state, learned = []) {
  const s = normalizeTeleportState(state);
  const out = [];
  for (let id = 1; id <= maxTargets(learned); id += 1) out.push({ id, target: s.targets[id] || null });
  return out;
}

/**
 * teleportation_can_set_target.
 * @param {{ learned?: string[], dead?: boolean, unsavable?: boolean }} ctx
 */
export function canSetTarget(state, id = 1, ctx = {}) {
  if (ctx.dead) return { ok: false, error: TELEPORT_TEXT.dead };
  if (!has(ctx.learned, 'teleportation_1')) return { ok: false, error: TELEPORT_TEXT.noSkill };
  if (ctx.unsavable) return { ok: false, error: TELEPORT_TEXT.cantSave };
  if (!Number.isInteger(id) || id < 1 || id > maxTargets(ctx.learned)) {
    return { ok: false, error: TELEPORT_TEXT.invalidId };
  }
  return { ok: true };
}

/** teleportation_set_target: remember the current street and position. */
export function setTarget(state, id, location, ctx = {}) {
  const gate = canSetTarget(state, id, ctx);
  if (!gate.ok) return gate;
  const target = cleanLocation(location);
  if (!target) return { ok: false, error: TELEPORT_TEXT.cantSave };
  const s = normalizeTeleportState(state);
  s.targets[id] = target;
  s.totals.set += 1;
  const events = [{ counter: `teleport_point_set:${target.tsid}`, amount: 1 }];
  if (target.hubId === XALANGA_HUB_ID) events.push({ counter: 'teleport_point_set:xalanga', amount: 1 });
  return { ok: true, state: s, target, events };
}

/**
 * teleportation_can_teleport for the parts this lane owns (skill, destination,
 * same street, cooldown). Death/Naraka/Pooped go through the host travelGate.
 * @param {{ learned?: string[], now?: number, currentTsid?: string, teleporting?: boolean,
 *   skipSkill?: boolean, exists?: (tsid: string) => boolean }} ctx
 */
export function canTeleport(state, target, ctx = {}) {
  const s = normalizeTeleportState(state);
  const now = ctx.now ?? Date.now();
  if (ctx.teleporting) return { ok: false, error: TELEPORT_TEXT.already };
  if (!ctx.skipSkill && !has(ctx.learned, 'teleportation_1')) return { ok: false, error: TELEPORT_TEXT.noSkill };
  if (!target || !target.tsid) return { ok: false, error: TELEPORT_TEXT.noDestination };
  if (target.tsid === ctx.currentTsid) return { ok: false, error: TELEPORT_TEXT.alreadyThere };
  if (ctx.exists && !ctx.exists(target.tsid)) return { ok: false, error: TELEPORT_TEXT.gone };
  if (s.cooldownUntil > now) return { ok: false, error: TELEPORT_TEXT.cooldown };
  return { ok: true };
}

/** Quest/badge events for a completed jump (teleportation_teleport + teleport_complete). */
export function teleportEvents(target, fromHubId = '', kind = 'plain') {
  const events = [{ counter: `teleportation_self:${kind === 'map' ? 'map' : 'plain'}`, amount: 1 }];
  events.push({ counter: 'teleported', amount: 1 });
  events.push({ counter: `teleported_to:${target.tsid}`, amount: 1 });
  if (String(fromHubId) === ZONE_FROM_HUB_ID && target.hubId === ZONE_TO_HUB_ID) {
    events.push({ counter: 'teleported_between_zones', amount: 1 });
  }
  if (String(fromHubId) !== XALANGA_HUB_ID && target.hubId === XALANGA_HUB_ID) {
    events.push({ counter: 'teleported_to:xalanga', amount: 1 });
  }
  return events;
}

/**
 * teleportation_teleport(teleport_id): pay energy, start the cooldown.
 * @param {{ learned?: string[], now?: number, energy?: number, tank?: number,
 *   currentTsid?: string, fromHubId?: string, exists?: Function, teleporting?: boolean }} ctx
 */
export function teleportToPoint(state, id, ctx = {}) {
  const s = normalizeTeleportState(state);
  const now = ctx.now ?? Date.now();
  const target = s.targets[id] && id <= maxTargets(ctx.learned) ? s.targets[id] : null;
  const gate = canTeleport(s, target, ctx);
  if (!gate.ok) return gate;
  const energyCost = teleportEnergyCost(ctx.learned, ctx.tank || DEFAULT_TANK);
  if ((ctx.energy ?? 0) <= energyCost) return { ok: false, error: TELEPORT_TEXT.energy };
  s.cooldownUntil = now + teleportCooldownSeconds(ctx.learned) * 1000;
  s.totals.plain += 1;
  return {
    ok: true,
    state: s,
    target,
    energyCost,
    events: teleportEvents(target, ctx.fromHubId, 'plain'),
  };
}

/* ------------------------------------------------------------------ */
/* Map teleports                                                       */
/* ------------------------------------------------------------------ */

/** The rescue-pig quest's street, which the client let you pick before you'd been there. */
export const MAP_TELEPORT_UNVISITED_OK = 'LHFIV4V8J6J2I7U';

export const MAP_TELEPORT_TEXT = Object.freeze({
  here: 'This is your current location!',
  cooldown: 'Teleportation cooldown active. No teleporting!',
  unvisited: 'You need to visit this location first!',
  // The client's no-skill path was teleportation tokens, which the remake has none of.
  noSkill: 'You need Teleportation IV to teleport from the map.',
  outToday: 'You are out of map teleports for today.',
  energy: (cost) => `You do not have enough energy to teleport (${cost} required).`,
  ready: 'Teleport here instantly with energy.',
});

/**
 * The Map's "Teleport Here" (glitch-client InteractionMenuController.as 200-275, the
 * server's teleportation_map_teleport, inc_teleportation.js 419-516): not to the street
 * you are on, not while cooling down, only to a street you have visited, and only with
 * Teleportation IV (teleportation_get_max_map_teleports 957-967), its daily count and
 * the skill's energy cost.
 * @param {{ learned?: string[], now?: number, energy?: number, tank?: number,
 *   currentTsid?: string, visited?: boolean, teleporting?: boolean }} ctx
 * @returns {{ ok: boolean, error?: string, energyCost?: number|null, tooltip?: string }}
 */
export function canMapTeleport(state, target, ctx = {}) {
  const s = normalizeTeleportState(state);
  const now = ctx.now ?? Date.now();
  if (!target?.tsid) return { ok: false, error: TELEPORT_TEXT.noDestination };
  if (target.tsid === ctx.currentTsid) return { ok: false, error: MAP_TELEPORT_TEXT.here };
  if (ctx.teleporting) return { ok: false, error: TELEPORT_TEXT.already };
  if (s.cooldownUntil > now) return { ok: false, error: MAP_TELEPORT_TEXT.cooldown };
  if (!ctx.visited && target.tsid !== MAP_TELEPORT_UNVISITED_OK) return { ok: false, error: MAP_TELEPORT_TEXT.unvisited };
  if (teleportRank(ctx.learned) < 4) return { ok: false, error: MAP_TELEPORT_TEXT.noSkill };
  if (s.mapTeleportsToday >= maxMapTeleports(ctx.learned)) return { ok: false, error: MAP_TELEPORT_TEXT.outToday };
  const energyCost = teleportEnergyCost(ctx.learned, ctx.tank || DEFAULT_TANK);
  if ((ctx.energy ?? 0) <= energyCost) return { ok: false, error: MAP_TELEPORT_TEXT.energy(energyCost), energyCost };
  return { ok: true, energyCost, tooltip: MAP_TELEPORT_TEXT.ready };
}

/** teleportation_map_teleport: count it, pay the energy, start the cooldown. */
export function mapTeleport(state, target, ctx = {}) {
  const gate = canMapTeleport(state, target, ctx);
  if (!gate.ok) return gate;
  const s = normalizeTeleportState(state);
  const now = ctx.now ?? Date.now();
  s.mapTeleportsToday += 1;
  s.cooldownUntil = now + teleportCooldownSeconds(ctx.learned) * 1000;
  s.totals.map += 1;
  return {
    ok: true,
    state: s,
    target: cleanLocation(target),
    energyCost: gate.energyCost,
    events: teleportEvents(target, ctx.fromHubId, 'map'),
  };
}

/* ------------------------------------------------------------------ */
/* Teleportation Scripts                                               */
/* ------------------------------------------------------------------ */

/** "Teleport to <street>, <hub>" — the script view title from paper.js. */
export function scriptTitle(destination) {
  if (!destination) return 'Teleportation Script';
  const hub = destination.hubName ? `, ${destination.hubName}` : '';
  return `Teleport to ${destination.label || destination.tsid}${hub}`;
}

/** getLabel: "Teleportation Script to <street>, <hub>". */
export function scriptLabel(script) {
  const name = script?.imbued ? 'Imbued Teleportation Script' : 'Teleportation Script'; // teleportation_script_imbued.js name_single
  if (!script?.destination) return name;
  const d = script.destination;
  return `${name} to ${d.label || d.tsid}${d.hubName ? `, ${d.hubName}` : ''}`;
}

/**
 * paper.js create_script conditions. `null` state means the verb is hidden.
 * @param {{ learned?: string[], paper?: number, quillWorking?: boolean, unsavable?: boolean, dead?: boolean }} ctx
 */
export function canCreateScript(state, ctx = {}) {
  if (!has(ctx.learned, 'teleportation_4')) return { ok: false, hidden: true, error: '' };
  if (!has(ctx.learned, 'penmanship_1')) return { ok: false, error: TELEPORT_TEXT.needPenmanship };
  if (!ctx.quillWorking) return { ok: false, error: TELEPORT_TEXT.needQuill };
  if (!(ctx.paper > 0)) return { ok: false, error: TELEPORT_TEXT.needPaper };
  const gate = canSetTarget(state, 1, ctx);
  if (!gate.ok) return gate;
  return { ok: true };
}

/**
 * Write one script to the current location. Costs (applied by the caller):
 * 1 Paper, 1 Quill wear, 1 energy. The caller adds the copy, with `script.tag` as its words.
 */
export function createScript(state, location, ctx = {}) {
  const gate = canCreateScript(state, ctx);
  if (!gate.ok) return gate;
  const tag = scriptTag({ destination: cleanLocation(location), imbued: false });
  if (!tag) return { ok: false, error: TELEPORT_TEXT.cantSave };
  return {
    ok: true,
    state: normalizeTeleportState(state),
    script: scriptFromTag(tag),
    costs: { paper: 1, quillWear: 1, energy: 1 },
    message: TELEPORT_TEXT.scriptCreated,
    events: [{ counter: 'making_recipe:teleportation_script', amount: 1 }],
  };
}

/**
 * items/teleportation_script.js use(). `script` is the one being read (scriptFromTag of its copy).
 * Returns the energy to charge and the destination; the caller takes that copy out of the pack on
 * success, and its destination goes with it.
 * @param {{ learned?: string[], now?: number, energy?: number, tank?: number,
 *   currentTsid?: string, fromHubId?: string, exists?: Function, teleporting?: boolean }} ctx
 */
export function useScript(state, script, ctx = {}) {
  const s = normalizeTeleportState(state);
  if (!script?.destination?.tsid) return { ok: false, error: TELEPORT_TEXT.noDestination };
  if (!script.imbued && !has(ctx.learned, 'teleportation_1')) return { ok: false, error: TELEPORT_TEXT.scriptSkill };
  if (ctx.exists && !ctx.exists(script.destination.tsid)) {
    return { ok: true, state: s, vanished: true, refundImg: 100, message: TELEPORT_TEXT.scriptGone, consumed: script };
  }
  const gate = canTeleport(s, script.destination, { ...ctx, skipSkill: true });
  if (!gate.ok) return gate;
  let energyCost = 0;
  if (!script.imbued) {
    energyCost = teleportEnergyCost(ctx.learned, ctx.tank || DEFAULT_TANK) || 0;
    if ((ctx.energy ?? 0) <= energyCost) return { ok: false, error: TELEPORT_TEXT.energy };
  }
  if (energyCost) s.cooldownUntil = (ctx.now ?? Date.now()) + TELEPORT_COOLDOWN_SECONDS * 1000;
  s.totals.script += 1;
  return {
    ok: true,
    state: s,
    target: script.destination,
    energyCost,
    consumed: script,
    events: teleportEvents(script.destination, ctx.fromHubId, 'plain'),
  };
}

/** A script's own words (js/copy-tags.js kind "script") from { destination, imbued }, or null. */
export function scriptTag(script) {
  const d = script?.destination;
  if (!d) return null;
  return cleanCopyTagOf('script', {
    tsid: d.tsid,
    x: d.x ?? null,
    y: d.y ?? null,
    label: d.label || '',
    hubId: d.hubId || '',
    hubName: d.hubName || '',
    imbued: script.imbued === true,
  });
}

/** What a copy's words say: { destination, imbued, title }, or null for a copy with none. */
export function scriptFromTag(tag) {
  if (!tag || typeof tag !== 'object' || !tag.tsid) return null;
  const destination = cleanLocation(tag);
  return { destination, imbued: tag.imbued === true, title: scriptTitle(destination) };
}

/**
 * Older saves kept the destinations in one list beside a count, so which went with which was never
 * known (and the list's order says nothing): each copy with no words takes the next destination
 * there is, what is held first, then what was set down. Destinations left over wait for a script
 * that comes back up (from the ground, a cabinet, a bag), and are kept for it.
 * @param {(object|null)[]} tags every copy's words, in pack order
 * @returns {{ state: object, tags: (object|null)[], adopted: number, unknown: number }} `unknown`:
 *   copies with no destination anywhere (a count the save never knew a destination for)
 */
export function adoptScripts(state, tags = []) {
  const s = normalizeTeleportState(state);
  const ids = new Set();
  const pool = [...s.scripts, ...s.looseScripts].filter((row) => {
    if (!row.id) return true;
    if (ids.has(row.id)) return false;
    ids.add(row.id);
    return true;
  });
  const out = [];
  let adopted = 0;
  let unknown = 0;
  for (const tag of tags) {
    if (tag != null) {
      out.push(tag);
      continue;
    }
    let next = null;
    while (!next && pool.length) next = scriptTag(pool.shift());
    if (next) adopted += 1;
    else unknown += 1;
    out.push(next);
  }
  s.scripts = [];
  s.looseScripts = pool;
  return { state: s, tags: out, adopted, unknown };
}

/* ------------------------------------------------------------------ */
/* Summons (Teleportation V)                                           */
/* ------------------------------------------------------------------ */

/**
 * teleportation_get_max_summons 969-976: Teleportation V gives [2, -1], two a game day paid
 * with energy and any number more with Teleportation Tokens. The remake has no tokens, so two.
 */
export const SUMMONS_PER_DAY = 2;

/** The summoner's lines (inc_teleportation.js can_teleport 126-295 and can_summon 729-835). */
export const SUMMON_CHECK_TEXT = Object.freeze({
  pooped: 'You are too Pooped to teleport. Eat something first!', // 158
  contraband: "That fragile Contraband won't survive teleportation.", // 165
  rooked: 'You are still under the effects of a Rook attack.', // 290
  one: 'You can only summon one player at a time.', // 736
  here: "You can't summon people here.", // 794
  them: "You can't summon them here.", // 803
  // 812 when the paid summonses ran out too; with no tokens here, two energy summonses a day are all.
  outToday: 'You cannot summon anymore today.',
});

/** teleportation_get_max_summons: two a game day from Teleportation V, none before. */
export function maxSummons(learned = []) {
  return has(learned, 'teleportation_5') ? SUMMONS_PER_DAY : 0;
}

/**
 * teleportation_can_summon for the summoner's own side: can_teleport (already teleporting,
 * dead, Pooped, Contraband, the skill, the cooldown, a Rook attack), one summons at a time,
 * the day's two, and the energy (more than the cost, as every teleport here). The place and
 * the target are the server's (summon.go) and the target's game's.
 * @param {{ learned?: string[], now?: number, energy?: number, tank?: number, teleporting?: boolean,
 *   dead?: boolean, pooped?: boolean, contraband?: boolean, rooked?: boolean, asking?: boolean,
 *   place?: '' | 'here' | 'them' }} ctx
 * @returns {{ ok: boolean, error?: string, energyCost: number|null }}
 */
export function canSummon(state, ctx = {}) {
  const s = normalizeTeleportState(state);
  const now = ctx.now ?? Date.now();
  const energyCost = teleportEnergyCost(ctx.learned, ctx.tank || DEFAULT_TANK);
  const no = (error) => ({ ok: false, error, energyCost });
  if (ctx.teleporting) return no(TELEPORT_TEXT.already);
  if (ctx.dead) return no(TELEPORT_TEXT.dead);
  if (ctx.pooped) return no(SUMMON_CHECK_TEXT.pooped);
  if (ctx.contraband) return no(SUMMON_CHECK_TEXT.contraband);
  if (!has(ctx.learned, 'teleportation_1')) return no(TELEPORT_TEXT.noSkill);
  if (s.cooldownUntil > now) return no(TELEPORT_TEXT.cooldown);
  if (ctx.rooked) return no(SUMMON_CHECK_TEXT.rooked);
  if (ctx.asking) return no(SUMMON_CHECK_TEXT.one);
  if (ctx.place === 'here') return no(SUMMON_CHECK_TEXT.here);
  if (ctx.place === 'them') return no(SUMMON_CHECK_TEXT.them);
  if (s.summonsToday >= maxSummons(ctx.learned)) return no(SUMMON_CHECK_TEXT.outToday);
  if ((ctx.energy ?? 0) <= energyCost) return no(TELEPORT_TEXT.energy);
  return { ok: true, energyCost };
}

/**
 * teleportation_summon 618-704 for the summoner, once the target said yes: can_summon again
 * (627), one of the day's summonses and its energy (634-638), the cooldown (678, energy summonses
 * out of the street only: a Party Space's summons sets none) and the summoner's counter (679).
 * @param {object} ctx canSummon's, with `party` for a summons into a Party Space
 */
export function paySummon(state, ctx = {}) {
  const gate = canSummon(state, { ...ctx, asking: false });
  if (!gate.ok) return gate;
  const s = normalizeTeleportState(state);
  s.summonsToday += 1;
  if (!ctx.party) s.cooldownUntil = (ctx.now ?? Date.now()) + TELEPORT_COOLDOWN_SECONDS * 1000;
  return {
    ok: true,
    state: s,
    energyCost: gate.energyCost,
    events: [{ counter: 'teleportation_others:summoner', amount: 1 }],
  };
}
