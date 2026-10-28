/**
 * Shared street objects in multiplayer (phase 4): the rules the client needs
 * to talk to groddle-afternoon-server/objects.go about rocks, resource nodes and trees.
 * Pure: no DOM, no Pixi, no engine (tests/street-objects.test.js).
 *
 * The server owns what is contested between players: how many chunks a rock
 * has left (and how many a swing takes), how many uses a Peat Bog, Dirt Pile,
 * Barnacle, Ice Nubbin, Jellisac or Paper Tree has, how much fruit a tree
 * holds and whether it has been petted and watered, and when each comes back.
 * Each player's own limits (harvests per game day, digs per day), tools,
 * energy, skills and rewards stay on the client, as in solo.
 *
 * Ids are the client's own: rock:<i> (game.js spawnMineRocks index), tree:<i>
 * (game.js spawnTrees index) and node:<class>:<n> (resource-nodes-feature
 * resourceSpawnPlan key). tools/build-realtime-objects.mjs lays every street
 * out the same way for the server.
 *
 * Wire (groddle-afternoon-server/objects.go header):
 *   send  obj_act { req, id, verb, perks?, skill? }
 *   recv  obj_ok  { req, id, verb, before, obj, chunks?, roll? }
 *         obj_no  { req, id, verb, code, message, obj? }
 *         objs    { street, snap?, none?, objs: [state] }
 * A state is { id, chunks, mega, in } (rock), { id, units, in, petted?,
 * watered?, reset?, diggers? } (node), { id, fruit, cap, health, maturity, petted,
 * watered, poison?, dead?, by? } (tree) or { id, mood, hunger, petted, daily,
 * croak, in } (pig: a street Piggy, objects_pigs.go); `in`, `reset` and
 * `poison` are ms from when it was sent.
 *
 * G334: a street tree's Tree Poison and death are the server's (poison: ms
 * to its death, by: who poured it; dead: it died for everyone), and so are
 * a street Piggy's mood, hunger and twice-daily clock. G329: a Dirt Pile
 * keeps a dig crew (diggers) as a rock keeps miners.
 */

import { ROCK_CATALOG, findWorkingPick, miningProfile } from './mining.js?v=g403-1';
import { MINING_EXPERT_UPGRADES } from './imagination-effects.js?v=g403-1';
import { TRANT_META, canHarvestTrant, fruitCapacityAt, resolveArborologyPackage } from './trants.js?v=trant-harvest-2';
import { highestLightGreenThumbRank, quoteTrantCare } from './trant-care.js?v=g403-1';
import { RESOURCE_NODE_ALIASES, RESOURCE_NODE_CATALOG, resolveResourceSkillPackage } from './resource-nodes.js?v=g403-1';
import { highestAnimalKinshipRank } from './animal-kinship.js?v=g403-1';

/** The resource-node classes whose stock is shared (the "N uses left, then regrows" nodes). */
export const SHARED_NODE_CLASSES = Object.freeze(['mortar_barnacle', 'ice_knob', 'jellisac', 'dirt_pile', 'peat_1', 'paper_tree']);

/** The verbs that change shared state, per kind. Everything else stays local. */
export const SHARED_VERBS = Object.freeze({
  rock: Object.freeze(['mine']),
  tree: Object.freeze(['harvest', 'pet', 'water']),
  pig: Object.freeze(['pet', 'nibble', 'feed']),
});

/** tree-death-feature's pour verbs, and the word the server knows each by (objects.go pour). */
export const POUR_VERBS = Object.freeze({ 'treepoison:poison': 'poison', 'treepoison:antidote': 'antidote' });

/** No answer from the server in this long: give up on the request. */
export const REQUEST_TIMEOUT_MS = 6000;

/** Plain copy for the moments the source has no line for. */
export const COPY = Object.freeze({
  connecting: 'The street is still connecting. Try again in a moment.',
  timeout: 'The street did not answer. Try again.',
  busy: 'Hold on, still asking the street.',
  mega: 'I am huuuuuuuuuge!', // include/mining.js:174 onMegaRoxx
});

/**
 * game.js spawnTrees: a placed tree's starting maturity and health by its
 * index on the street (full-plant art at 10 and 7).
 */
export function freshTreePlan(index) {
  const i = Math.max(0, Math.floor(Number(index) || 0));
  return { maturity: i % 2 === 0 ? 10 : 7, health: 7 + (i % 3) };
}

export function rockId(index) {
  return `rock:${index}`;
}
export function treeId(index) {
  return `tree:${index}`;
}
export function nodeId(key) {
  return `node:${key}`;
}
export function pigId(index) {
  return `pig:${index}`;
}

/**
 * A street Piggy's spawn index (game.js spawnPiggies animalKey
 * `<street>:npc_piggy:<i>`) on this street, or -1 (a released or raised
 * Piggy, the husbandry feature's, is each player's own).
 */
export function streetPigIndex(target, streetTsid) {
  if (target?.classId !== 'npc_piggy' || target.featureId || target.husbandryAnimal) return -1;
  const m = /^(.+):npc_piggy:(\d{1,2})$/.exec(String(target.animalKey || ''));
  return m && m[1] === String(streetTsid || '') ? Number(m[2]) : -1;
}

/** The kind an id names ('rock' | 'tree' | 'node' | 'pig'), or ''. */
export function idKind(id) {
  const m = /^(rock|tree|node|pig):/.exec(String(id || ''));
  return m ? m[1] : '';
}

function resourceClass(classTsid) {
  return RESOURCE_NODE_ALIASES[classTsid]?.classTsid || classTsid;
}

/** Whether a resource-node verb changes shared state. */
export function sharedNodeVerb(classTsid, verbId) {
  const id = resourceClass(classTsid);
  if (!SHARED_NODE_CLASSES.includes(id)) return false;
  return RESOURCE_NODE_CATALOG[id].verbs.some((v) => v.id === verbId && !v.auto);
}

/**
 * Words the server takes from the client about the player's own buffs and
 * cards, only the ones that change what the server decides:
 *   rock mine: luck (max_luck, include/mining.js:295), expert (Mining Expert
 *   for this rock, :310-325), whisperer (Rock Whisperer, :418 respawn);
 *   paper harvest: paper8 (gardening_harvest_paper, paper_tree.js).
 */
export function rockPerks(classTsid, { upgrades = [], buffs = [] } = {}) {
  const owned = new Set(upgrades || []);
  const out = [];
  if ((buffs || []).includes('max_luck')) out.push('luck');
  const expert = MINING_EXPERT_UPGRADES[classTsid];
  if (expert && owned.has(expert)) out.push('expert');
  if (owned.has('mining_high_capacity_rock')) out.push('whisperer');
  return out;
}

export function nodePerks(classTsid, verbId, { upgrades = [] } = {}) {
  if (resourceClass(classTsid) === 'paper_tree' && verbId === 'harvest' && (upgrades || []).includes('gardening_harvest_paper')) return ['paper8'];
  return [];
}

/** The skill rank word the server reads a tree verb's numbers from. */
export function treeSkill(verbId, learned = []) {
  if (verbId === 'harvest') return resolveArborologyPackage(learned).skillId || 'no_skill';
  return highestLightGreenThumbRank(learned);
}

/** The Animal Kinship rank word for a Piggy's pet and nibble rolls (js/animal-kinship.js packages). */
export function pigSkill(learned = []) {
  const rank = highestAnimalKinshipRank(learned);
  return rank > 0 ? `animalkinship_${rank}` : 'no_skill';
}

/** The dig_dirt_pile skill the server reads a dig's drop chance and yield from. */
export function digSkill(learned = [], upgrades = []) {
  return resolveResourceSkillPackage('dig_dirt_pile', learned, upgrades)?.skill || 'no_skill';
}

/**
 * Local checks before asking the server, so the street never loses a use to a
 * swing the player's own pack, skills or energy would refuse (those refusals
 * then come from the local rules, as in solo). Mirrors mining.js mineRock,
 * content.js trant harvest and trant-care.js quoteTrantCare.
 */
export function rockReady(rock, { inv, pc, learned = [], toolState = null } = {}) {
  if (!rock) return false;
  const wear = Math.min(
    miningProfile(learned, 'fancy_pick')?.toolWear ?? 2,
    miningProfile(learned, 'pick')?.toolWear ?? 2,
  );
  const pick = findWorkingPick(inv || {}, toolState, wear);
  if (!pick) return false;
  const profile = miningProfile(learned, pick);
  if (!profile) return false;
  return (Number(pc?.energy) || 0) > profile.energy;
}

export function treeReady(state, classId, verbId, { inv, pc, learned = [], tools = null } = {}) {
  if (!state || !TRANT_META[classId]) return false;
  if (verbId === 'harvest') {
    const arbor = resolveArborologyPackage(learned);
    if ((Number(pc?.energy) || 0) < arbor.energyCost) return false;
    // Fruit is the server's call (it may have more than this copy shows); the
    // size and the player's own harvests today are local.
    return canHarvestTrant({ ...state, fruitCount: Math.max(1, Number(state.fruitCount) || 0) }, arbor).ok;
  }
  if (verbId !== 'pet' && verbId !== 'water') return false;
  // The tree's flag is the server's call too.
  const quote = quoteTrantCare({ ...state, petted: false, watered: false }, classId, verbId, { pc, inv, tools, learned });
  return quote.ok === true;
}

// ---------------------------------------------------------------------------
// Fresh state and server state on the local objects
// ---------------------------------------------------------------------------

/** Remaining ms in a state's `in`/`reset`, as a local deadline (0: none). */
function deadline(ms, now) {
  const n = Number(ms);
  return Number.isFinite(n) && n > 0 ? now + n : 0;
}

/** A rock as nobody has touched it (mining.js createMineRock). */
export function freshenRock(rock) {
  const def = ROCK_CATALOG[rock?.classTsid];
  if (!rock || !def) return rock;
  rock.chunksMax = def.chunksMax;
  rock.chunksRemaining = def.chunksMax;
  rock.depleted = false;
  rock.respawnAt = 0;
  rock.respawnChunks = 0;
  rock.mega = false;
  return rock;
}

export function applyRockState(rock, s, now = Date.now()) {
  if (!rock || !s) return rock;
  const chunks = Math.max(0, Math.floor(Number(s.chunks) || 0));
  rock.chunksRemaining = chunks;
  rock.depleted = chunks <= 0;
  rock.respawnAt = rock.depleted ? deadline(s.in, now) || now + 1000 : 0;
  // The server rolls the mega respawn; locally a respawn is always plain until it says.
  rock.respawnChunks = 0;
  rock.mega = s.mega === true;
  return rock;
}

/** A resource node's shared fields as nobody has touched it (resource-nodes.js createResourceNode). */
export function freshenNode(node) {
  const def = RESOURCE_NODE_CATALOG[resourceClass(node?.classTsid)];
  if (!node || !def) return node;
  node.units = def.stock.initial;
  node.regrowAt = 0;
  if (def.classTsid === 'paper_tree') {
    node.petted = false;
    node.watered = false;
    node.needsResetAt = 0;
  }
  return node;
}

export function applyNodeState(node, s, now = Date.now()) {
  const def = RESOURCE_NODE_CATALOG[resourceClass(node?.classTsid)];
  if (!node || !s || !def) return node;
  node.units = Math.max(def.stock.min, Math.min(def.stock.max, Math.floor(Number(s.units) || 0)));
  node.regrowAt = node.units < def.stock.max ? deadline(s.in, now) : 0;
  if (def.classTsid === 'paper_tree') {
    node.petted = s.petted === true;
    node.watered = s.watered === true;
    node.needsResetAt = deadline(s.reset, now);
    node.regrowAt = 0;
  }
  return node;
}

/**
 * A tree's poison and death as the server has them (objects.go pour, killTree):
 * poisonEndsAt is js/tree-poison.js isPoisoned's field; sharedDead / sharedDeadBy
 * tell tree-death-feature the tree died for everyone (and whose Planks they are).
 */
export function applyTreeDeath(state, s, now = Date.now()) {
  if (!state || !s) return state;
  const poison = Number(s.poison);
  if (s.dead === true) {
    state.sharedDead = true;
    state.sharedDeadBy = Math.max(0, Math.floor(Number(s.by) || 0));
  } else if (Number.isFinite(poison) && poison > 0) {
    if (!(Number(state.poisonedAt) > 0)) state.poisonedAt = now;
    state.poisonEndsAt = now + poison;
    state.poisonBy = Math.max(0, Math.floor(Number(s.by) || 0));
  } else {
    clearTreeDeath(state);
  }
  return state;
}

/** No poison, not dead (a cure, or a tree nobody has touched). */
function clearTreeDeath(state) {
  delete state.poisonedAt;
  delete state.poisonEndsAt;
  delete state.poisonBubble;
  delete state.poisonBy;
  delete state.sharedDead;
  delete state.sharedDeadBy;
}

/** A tree's shared fields as nobody has touched it (game.js spawnTrees + trants.js createTrantState). */
export function freshenTree(state, classId, index) {
  if (!state || !TRANT_META[classId]) return state;
  clearTreeDeath(state);
  const { maturity, health } = freshTreePlan(index);
  state.maturity = maturity;
  state.health = health;
  state.fruitCapacity = fruitCapacityAt(classId, maturity, health);
  state.fruitCount = state.fruitCapacity;
  state.petted = false;
  state.watered = false;
  return state;
}

/**
 * A Wood Tree as the server has it (groddle-afternoon-server objects.go chopWood):
 * the shared maturity and harvest_count. harvestedToday stays the player's own
 * (the source's per-player intervals[today]).
 */
export function applyWoodState(state, s, now = Date.now()) {
  if (!state || !s) return state;
  const whole = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.floor(Number(v) || 0)));
  state.maturity = whole(s.maturity, 0, 6);
  state.harvestCount = whole(s.count, 0, 1);
  applyTreeDeath(state, s, now);
  return state;
}

/** A Wood Tree nobody has touched on the server: maturity 6 (js/woodcutting.js ensureWoodTreeState). */
export function freshenWood(state) {
  if (!state) return state;
  clearTreeDeath(state);
  state.maturity = 6;
  state.harvestCount = 0;
  return state;
}

export function applyTreeState(state, s, now = Date.now()) {
  if (!state || !s) return state;
  const whole = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.floor(Number(v) || 0)));
  state.maturity = whole(s.maturity, 0, 10);
  state.health = whole(s.health, 0, 10);
  state.fruitCapacity = whole(s.cap, 0, 100000);
  state.fruitCount = whole(s.fruit, 0, state.fruitCapacity);
  state.petted = s.petted === true;
  state.watered = s.watered === true;
  applyTreeDeath(state, s, now);
  return state;
}

/**
 * A street Piggy as the server has it (objects_pigs.go): js/animal-mood.js's
 * mood, hunger, isDaily, hasBeenPetted, croaking and the next tick (hungerAt).
 * The player's own Animal Kinship counters on the state stay as they are.
 */
export function applyPigState(state, s, now = Date.now()) {
  if (!state || !s) return state;
  const whole = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.floor(Number(v) || 0)));
  state.mood = whole(s.mood, 0, 2);
  state.hunger = whole(s.hunger, 0, 10);
  state.isDaily = s.daily === true ? 1 : 0;
  state.hasBeenPetted = s.petted === true ? 1 : 0;
  state.croaking = s.croak === true && state.hunger === 10;
  const due = deadline(s.in, now);
  if (due) state.hungerAt = due;
  state.moodVersion = 1;
  return state;
}

// ---------------------------------------------------------------------------
// The street's server copy
// ---------------------------------------------------------------------------

/**
 * What the server has said about the street the player stands on: a map of
 * id -> { state, at } (at: local receive time), whether a full snapshot has
 * come (until then nothing is reconciled), and whether the server shares
 * this street at all (none: it has no layout for it, so everything stays local).
 */
export function createStreetCopy() {
  return { street: '', snap: false, none: false, objs: new Map(), version: 0 };
}

/** Take one objs message; returns the ids it changed, or null when it is for another street. */
export function takeObjs(copy, msg, now = Date.now()) {
  const street = String(msg?.street || '');
  if (!street) return null;
  if (msg.snap) {
    copy.street = street;
    copy.snap = true;
    copy.none = msg.none === true;
    copy.objs.clear();
    copy.version += 1;
  } else if (street !== copy.street || !copy.snap) {
    return null;
  }
  const ids = [];
  for (const s of Array.isArray(msg.objs) ? msg.objs : []) {
    if (!s || typeof s.id !== 'string' || !idKind(s.id)) continue;
    copy.objs.set(s.id, { state: s, at: now });
    ids.push(s.id);
  }
  return ids;
}

/** Take a single object's state (an obj_ok / obj_no answer). */
export function takeObj(copy, s, now = Date.now()) {
  if (!s || typeof s.id !== 'string' || !idKind(s.id) || !copy.snap) return false;
  copy.objs.set(s.id, { state: s, at: now });
  return true;
}

/**
 * The state to show for an id: the server's (with its timers counted from
 * when it arrived) or null for fresh.
 */
export function stateFor(copy, id, now = Date.now()) {
  const row = copy.objs.get(id);
  if (!row) return null;
  const s = { ...row.state };
  const gone = Math.max(0, now - row.at);
  if (Number(s.in) > 0) s.in = Math.max(1, s.in - gone);
  if (Number(s.reset) > 0) s.reset = Math.max(1, s.reset - gone);
  if (Number(s.poison) > 0) s.poison = Math.max(1, s.poison - gone);
  return s;
}

/** Apply the server copy (or fresh) to one local shared object. */
export function reconcile(obj, copy, now = Date.now()) {
  if (!obj?.id) return false;
  const s = stateFor(copy, obj.id, now);
  if (obj.kind === 'rock') {
    if (s) applyRockState(obj.rock, s, now);
    else freshenRock(obj.rock);
  } else if (obj.kind === 'node') {
    if (s) applyNodeState(obj.node, s, now);
    else freshenNode(obj.node);
  } else if (obj.kind === 'tree') {
    if (s) applyTreeState(obj.state, s, now);
    else freshenTree(obj.state, obj.classId, obj.index);
  } else if (obj.kind === 'wood') {
    if (s) applyWoodState(obj.state, s, now);
    else freshenWood(obj.state);
  } else if (obj.kind === 'pig') {
    // The server lists every Piggy of a street it has; one it does not list keeps the local rules.
    if (!s) return false;
    applyPigState(obj.state, s, now);
  } else return false;
  return true;
}

/** An obj_act message, validated the way the server will. */
export function actMessage({ req, id, verb, perks = [], skill = '', on = '' }) {
  const msg = { req: Math.max(1, Math.floor(Number(req) || 1)), id: String(id || ''), verb: String(verb || '') };
  const words = (perks || []).filter((p) => /^[a-z0-9_]{1,24}$/.test(p)).slice(0, 8);
  if (words.length) msg.perks = words;
  if (skill && /^[a-z0-9_]{1,32}$/.test(skill)) msg.skill = skill;
  if (on && /^tree:\d{1,2}$/.test(on)) msg.on = on;
  return msg;
}
