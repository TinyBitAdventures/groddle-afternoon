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
 *
 * Death, Naraka and Pooped gates belong to the Hell feature: the feature
 * module asks the host travelGate before any teleport, so these rules never
 * duplicate them.
 */

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
  const n = (v) => (Number.isFinite(Number(v)) ? Number(v) : undefined);
  const out = { tsid: loc.tsid };
  if (n(loc.x) !== undefined) out.x = n(loc.x);
  if (n(loc.y) !== undefined) out.y = n(loc.y);
  for (const key of ['label', 'hubId', 'hubName']) {
    if (loc[key] != null && loc[key] !== '') out[key] = String(loc[key]);
  }
  return out;
}

function cleanScript(row) {
  if (!row || typeof row !== 'object') return null;
  const destination = cleanLocation(row.destination);
  if (!destination || typeof row.id !== 'string' || !row.id) return null;
  return {
    id: row.id,
    destination,
    imbued: row.imbued === true,
    title: typeof row.title === 'string' ? row.title.slice(0, 150) : '',
    createdAt: Number.isFinite(Number(row.createdAt)) ? Number(row.createdAt) : 0,
  };
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
  const scripts = (Array.isArray(s.scripts) ? s.scripts : []).map(cleanScript).filter(Boolean);
  const looseScripts = (Array.isArray(s.looseScripts) ? s.looseScripts : []).map(cleanScript).filter(Boolean);
  const totals = s.totals && typeof s.totals === 'object' ? s.totals : {};
  const count = (v) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Math.floor(Number(v)) : 0);
  return {
    version: 1,
    targets,
    cooldownUntil: Number(s.cooldownUntil) > 0 ? Number(s.cooldownUntil) : 0,
    dayKey: typeof s.dayKey === 'string' ? s.dayKey : '',
    mapTeleportsToday: count(s.mapTeleportsToday),
    totals: { plain: count(totals.plain), script: count(totals.script), set: count(totals.set), map: count(totals.map) },
    scripts,
    looseScripts: looseScripts.slice(-20),
    nextScriptId: Math.max(1, count(s.nextScriptId)),
  };
}

/** teleportation_reset_counters at a new game day. */
export function rollTeleportDay(state, dayKey) {
  const s = normalizeTeleportState(state);
  if (dayKey && s.dayKey !== dayKey) {
    s.dayKey = dayKey;
    s.mapTeleportsToday = 0;
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
  if (!script?.destination) return 'Teleportation Script';
  const d = script.destination;
  return `Teleportation Script to ${d.label || d.tsid}${d.hubName ? `, ${d.hubName}` : ''}`;
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
 * 1 Paper, 1 Quill wear, 1 energy.
 */
export function createScript(state, location, ctx = {}) {
  const gate = canCreateScript(state, ctx);
  if (!gate.ok) return gate;
  const destination = cleanLocation(location);
  if (!destination) return { ok: false, error: TELEPORT_TEXT.cantSave };
  const s = normalizeTeleportState(state);
  const script = {
    id: `tps${s.nextScriptId}`,
    destination,
    imbued: false,
    title: scriptTitle(destination),
    createdAt: ctx.now ?? Date.now(),
  };
  s.nextScriptId += 1;
  s.scripts.push(script);
  return {
    ok: true,
    state: s,
    script,
    costs: { paper: 1, quillWear: 1, energy: 1 },
    message: TELEPORT_TEXT.scriptCreated,
    events: [{ counter: 'making_recipe:teleportation_script', amount: 1 }],
  };
}

/**
 * items/teleportation_script.js use(). Returns the energy to charge and the
 * destination; the caller removes one script from the pack on success.
 * @param {{ learned?: string[], now?: number, energy?: number, tank?: number,
 *   currentTsid?: string, fromHubId?: string, exists?: Function, teleporting?: boolean }} ctx
 */
export function useScript(state, scriptId, ctx = {}) {
  const s = normalizeTeleportState(state);
  const index = s.scripts.findIndex((row) => row.id === scriptId);
  if (index < 0) return { ok: false, error: TELEPORT_TEXT.noDestination };
  const script = s.scripts[index];
  if (!script.imbued && !has(ctx.learned, 'teleportation_1')) return { ok: false, error: TELEPORT_TEXT.scriptSkill };
  if (ctx.exists && !ctx.exists(script.destination.tsid)) {
    s.scripts.splice(index, 1);
    return { ok: true, state: s, vanished: true, refundImg: 100, message: TELEPORT_TEXT.scriptGone, consumed: script };
  }
  const gate = canTeleport(s, script.destination, { ...ctx, skipSkill: true });
  if (!gate.ok) return gate;
  let energyCost = 0;
  if (!script.imbued) {
    energyCost = teleportEnergyCost(ctx.learned, ctx.tank || DEFAULT_TANK) || 0;
    if ((ctx.energy ?? 0) <= energyCost) return { ok: false, error: TELEPORT_TEXT.energy };
  }
  s.scripts.splice(index, 1);
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

/**
 * Keep the per-script destinations in step with the pack count. Stacks that
 * leave the pack (dropped on a street) park in a loose pool and come back,
 * destination intact, when picked up again.
 */
export function reconcileScripts(state, packCount) {
  const s = normalizeTeleportState(state);
  const want = Math.max(0, Math.floor(Number(packCount) || 0));
  let changed = false;
  while (s.scripts.length > want) {
    s.looseScripts.push(s.scripts.pop());
    changed = true;
  }
  while (s.scripts.length < want && s.looseScripts.length) {
    s.scripts.push(s.looseScripts.pop());
    changed = true;
  }
  s.looseScripts = s.looseScripts.slice(-20);
  // Any remaining shortfall is a script from elsewhere with no ink to read.
  return { state: s, changed, unknown: Math.max(0, want - s.scripts.length) };
}
