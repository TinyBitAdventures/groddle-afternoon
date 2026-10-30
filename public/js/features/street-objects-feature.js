/**
 * Shared street objects in multiplayer (phase 4): rocks, the "N uses, then
 * regrows" resource nodes (Mortar Barnacles, Ice Nubbins, Jellisacs, Dirt
 * Piles, Peat Bogs, Paper Trees) and the living trees are the same for
 * everyone on a street, as in the original: what one player mines, digs or
 * harvests is gone for the others until it comes back. Rules in
 * js/street-objects.js; the server is groddle-afternoon-server/objects.go.
 *
 * - A shared verb asks the server first (runVerbOverride, after the swing has
 *   played) and applies its effect only on the go-ahead: the local rules run
 *   on the server's state, with the server's rolls (a rock's chunks, a tree's
 *   tending success), and the server's new state lands after. A refusal
 *   shows the source's line ("This is not the rock you are looking for.").
 * - The player's own side stays local, as in solo: tools, skills, energy and
 *   each player's per-day limits refuse before anything is asked.
 * - Others' changes, regrowth, respawns and the new game day come from the
 *   server and redraw the object; local timers only bridge until they land.
 * - Joining a street asks for its state (obj_sync); anything the server does
 *   not list is fresh.
 *
 * Multiplayer only (engine.mode) and only with the realtime client: in solo
 * this feature does nothing. While the socket is connecting a shared verb
 * waits ("The street is still connecting."); with no realtime on the site,
 * or this window replaced by another, the local rules apply.
 *
 * - Help mine: help-mine-feature tells the server when a mining swing starts
 *   or is cancelled (sharedMineSwing), reads who is swinging (sharedMiners)
 *   and the help bonus with the swing's grant (sharedVerbGrant().help).
 *
 * - Tree death (G334): Tree Poison and its antidote on a street tree ask the
 *   server (tree-death-feature calls sharedObjectVerb as its pour lands); the
 *   poison's clock and the death are the server's, and a tree it says died
 *   dies here too (tree-death-feature's sharedTreeDied), for a player who
 *   arrives later as well.
 * - Street Piggies (G334): pet, nibble and feed ask the server, whose mood,
 *   hunger and twice-daily clock win (animal-mood-feature leaves their ticks
 *   to it); a Piggy eating food only this player sees tells the server
 *   (sharedPiggyAte); the server's tick events (obj_ev) reach
 *   animal-mood-feature's sharedAnimalEvent.
 * - Help dig (G329): help-mine-feature tells the server when a dig at a Dirt
 *   Pile starts or stops (sharedDigSwing) and reads who digs (sharedDiggers).
 * - Fruit (G361): a shared tree regrows fruit only when its health rises (pet
 *   and water, the server's fruitCycle) or from Fertilidust, never at the day
 *   turn. powders-feature asks the server when a Fertilidust jar is used on
 *   shared trees (sharedFertilize: obj_dust, every tree of the street, or
 *   the Lite's one tree), and the server grows the shared trees for everyone
 *   as the dust lands.
 * - Jars and bottles (G335 slice 4): Fertilidust, Tree Poison and its
 *   Antidote on shared trees are confirmed and used through the site's
 *   ledger by the server first. A dust's go-ahead is obj_dust_used, which
 *   hands powders-feature the ledger's word (powderUseGranted); a pour's is
 *   obj_ok with "use", which tree-death-feature reads through
 *   sharedVerbGrant().use. Without the item the server refuses with the
 *   ledger's words ("You don't have any antidote!") and nothing changes.
 *
 * QA: canvas data streetObjects (street:snap|none|waiting), streetObjectsLast
 * (id:verb:ok|code), streetObjectsShared (shared objects on this street),
 * streetObjectsView (each as this client has it: rock:1=43, tree:0=98pw).
 */

import {
  COPY,
  REQUEST_TIMEOUT_MS,
  SHARED_NODE_CLASSES,
  actMessage,
  applyNodeState,
  applyRockState,
  applyTreeState,
  applyWoodState,
  createStreetCopy,
  nodeId,
  nodePerks,
  digSkill,
  applyPigState,
  pigId,
  pigSkill,
  POUR_VERBS,
  streetPigIndex,
  reconcile,
  rockId,
  rockPerks,
  rockReady,
  sharedNodeVerb,
  stateFor,
  takeObj,
  takeObjs,
  treeId,
  treeReady,
  treeSkill,
} from '../street-objects.js?v=g414-1';
import { ROCK_CATALOG } from '../mining.js?v=g403-1';
import { TRANT_META, trantStatusLabel } from '../trants.js?v=trant-harvest-2';
import { quoteWoodTreeHarvest } from '../woodcutting.js?v=g414-1';
import { animalStatusLabel } from '../animals.js?v=g478-1';
import { highestAnimalKinshipRank, quoteAnimalKinship } from '../animal-kinship.js?v=g403-1';
import { PIGGY_FEED, itemBaseCost } from '../animal-husbandry.js?v=g478-1';

export const STREET_OBJECTS_FEATURE_ID = 'street-objects';
const RECONCILE_MS = 250;
/** States in which the site has no live street at all: the local rules apply. */
const LOCAL_STATES = new Set(['off', 'signed-out', 'replaced', 'stopped']);

let client = null;
let copy = createStreetCopy();
let syncedStreet = '';
let reqSeq = 0;
const pending = new Map();
let grant = null;
let dirtyAll = false;
const dirty = new Set();
let seen = new WeakMap();
let lastReconcile = 0;
let reapplyAt = 0;
let lastAnswer = '';

function reset() {
  copy = createStreetCopy();
  syncedStreet = '';
  seen = new WeakMap();
  dirty.clear();
  dirtyAll = false;
}

function publish(engine, shared = null) {
  const state = copy.street ? `${copy.street}:${copy.none ? 'none' : 'snap'}` : `${engine.streetTsid || ''}:waiting`;
  engine.setData?.('streetObjects', state);
  engine.setData?.('streetObjectsLast', lastAnswer);
  if (shared != null) engine.setData?.('streetObjectsShared', String(shared));
}

function bind(engine) {
  if (client) return client;
  const c = engine.query?.('realtimeClient');
  if (!c) return null;
  client = c;
  c.on('state', ({ state }) => {
    if (state === 'online') return;
    reset();
    if (pending.size && !LOCAL_STATES.has(state)) engine.toast?.(COPY.timeout, 2400);
    pending.clear();
    publish(engine);
  });
  c.on('roster', ({ street }) => {
    if (!street) {
      reset();
      return;
    }
    if (street === syncedStreet) return;
    reset();
    syncedStreet = street;
    c.send('obj_sync');
  });
  c.on('msg:objs', (msg) => {
    const ids = takeObjs(copy, msg, Date.now());
    if (ids == null) return;
    if (msg.snap) dirtyAll = true;
    else for (const id of ids) dirty.add(id);
    publish(engine);
  });
  // A server without this module answers obj_sync with bad_frame: the street
  // stays on the local rules (a real snapshot, if one follows, takes over).
  c.on('error', ({ code }) => {
    if (code !== 'bad_frame' || !syncedStreet || copy.snap) return;
    takeObjs(copy, { street: syncedStreet, snap: true, none: true, objs: [] });
    publish(engine);
  });
  c.on('msg:obj_ok', (msg) => answered(engine, msg, true));
  c.on('msg:obj_no', (msg) => answered(engine, msg, false));
  // G335: the ledger used the jar's charge: the verb runs here now; the dust lands on the server 3 s on.
  c.on('msg:obj_dust_used', (msg) => {
    const p = pending.get(msg?.req);
    if (!p || p.verbId !== 'dust') return;
    pending.delete(msg.req);
    lastAnswer = `dust:used:${msg.use ? `${Number(msg.use.left) || 0}${msg.use.spent ? ':spent' : ''}` : 'local'}`;
    publish(engine);
    engine.query?.('powderUseGranted', p.classTsid, msg.use || null, engine);
  });
  // G361: the trees a Fertilidust grew (their new state comes as objs, to everyone).
  c.on('msg:obj_dusted', (msg) => {
    pending.delete(msg?.req);
    lastAnswer = `dust:ok:${Array.isArray(msg?.ids) ? msg.ids.length : 0}`;
    publish(engine);
  });
  // A street Piggy's tick (objects_pigs.go): the bubble, the croak, the walk to a tree it ate from.
  c.on('msg:obj_ev', (msg) => {
    if (!msg || msg.street !== copy.street || copy.street !== engine.streetTsid) return;
    const obj = localObjects(engine).find((row) => row.id === msg.id);
    if (!obj) return;
    const on = msg.on ? localObjects(engine).find((row) => row.id === msg.on) : null;
    engine.query?.('sharedAnimalEvent', obj.target, { ev: String(msg.ev || ''), on: on?.target || null }, engine);
  });
  return c;
}

/** Local shared objects on this street: { id, kind, target, classId, rock|state|node, ... }. */
function localObjects(engine) {
  const out = [];
  for (const t of engine.interactables || []) {
    if (Number.isInteger(t.rockIndex) && t.state?.rock && ROCK_CATALOG[t.classId]) {
      out.push({ id: rockId(t.rockIndex), kind: 'rock', target: t, classId: t.classId, rock: t.state.rock });
    } else if (Number.isInteger(t.treeIndex) && TRANT_META[t.classId] && t.state) {
      out.push({ id: treeId(t.treeIndex), kind: 'tree', target: t, classId: t.classId, state: t.state, index: t.treeIndex });
    } else if (Number.isInteger(t.treeIndex) && t.classId === 'wood_tree' && !t.grownFromBean && t.state) {
      out.push({ id: treeId(t.treeIndex), kind: 'wood', target: t, classId: t.classId, state: t.state, index: t.treeIndex });
    } else if (t.classId === 'npc_piggy' && t.state) {
      const i = streetPigIndex(t, engine.streetTsid);
      if (i >= 0) out.push({ id: pigId(i), kind: 'pig', target: t, classId: t.classId, state: t.state, index: i });
    }
  }
  for (const n of engine.query?.('streetResourceNodes', engine) || []) {
    if (!SHARED_NODE_CLASSES.includes(n.classTsid)) continue;
    out.push({ id: nodeId(n.key), kind: 'node', target: n.target, classId: n.classTsid, node: n.node, refresh: n.refresh, ready: n.ready });
  }
  return out;
}

function stateKey(obj) {
  return obj.rock || obj.state || obj.node;
}

function redraw(engine, obj, before = null) {
  if (obj.kind === 'rock') {
    if (obj.target) engine.refreshRock?.(obj.target);
    // include/mining.js onMegaRoxx 173-175, a second after a mega respawn.
    if (before && !before.mega && obj.rock.mega && obj.target) {
      setTimeout(() => engine.say?.(obj.target, COPY.mega, 5000, { speaker: obj.target.label }), 1000);
    }
  } else if (obj.kind === 'tree') {
    if (obj.target) obj.target.subtitle = trantStatusLabel(obj.state, TRANT_META[obj.classId]);
  } else if (obj.kind === 'wood') {
    if (obj.target) engine.refreshTreeVisual?.(obj.target);
  } else if (obj.kind === 'pig') {
    if (obj.target) obj.target.subtitle = animalStatusLabel('npc_piggy', obj.state);
  } else obj.refresh?.();
  // G334: the server says this street tree died (for everyone): it dies here too.
  if ((obj.kind === 'tree' || obj.kind === 'wood') && obj.state?.sharedDead && obj.target) {
    engine.query?.('sharedTreeDied', obj.target, { by: obj.state.sharedDeadBy || 0 }, engine);
  }
}

function shared(engine) {
  return Boolean(client) && client.state === 'online' && copy.snap && !copy.none && copy.street === engine.streetTsid;
}

function reconcileAll(engine, force = false) {
  if (!shared(engine)) return;
  const now = Date.now();
  let n = 0;
  const all = localObjects(engine);
  for (const obj of all) {
    n += 1;
    const key = stateKey(obj);
    if (!key || (grant && grant.target === obj.target)) continue;
    if (!force && !dirtyAll && seen.get(key) === copy.version && !dirty.has(obj.id)) continue;
    const before = obj.kind === 'rock' ? { mega: obj.rock.mega } : null;
    reconcile(obj, copy, now);
    seen.set(key, copy.version);
    redraw(engine, obj, before);
  }
  dirtyAll = false;
  dirty.clear();
  publish(engine, n);
  engine.setData?.('streetObjectsView', all.map(viewOf).join(','));
}

/** QA: one object as this client has it (rock:1=43, node:peat_1:0=2, tree:0=98pw). */
function viewOf(obj) {
  if (obj.kind === 'rock') return `${obj.id}=${obj.rock.chunksRemaining}${obj.rock.mega ? 'm' : ''}`;
  if (obj.kind === 'node') return `${obj.id}=${obj.node.units}${obj.node.petted ? 'p' : ''}${obj.node.watered ? 'w' : ''}`;
  if (obj.kind === 'wood') return `${obj.id}=m${obj.state.maturity}c${obj.state.harvestCount || 0}${deathView(obj.state)}`;
  if (obj.kind === 'pig') return `${obj.id}=m${obj.state.mood}h${obj.state.hunger}${obj.state.hasBeenPetted ? 'p' : ''}`;
  return `${obj.id}=${obj.state.fruitCount}${obj.state.petted ? 'p' : ''}${obj.state.watered ? 'w' : ''}${deathView(obj.state)}`;
}

/** QA: a tree's poison (x) or death (d) in streetObjectsView. */
function deathView(state) {
  if (state?.sharedDead) return 'd';
  return Number(state?.poisonEndsAt) > 0 ? 'x' : '';
}

/** A street tree the server shares (tree or Wood Tree, not one grown in a Patch). */
function isStreetTree(target) {
  return Boolean(target?.state && Number.isInteger(target.treeIndex) && !target.grownFromBean
    && (TRANT_META[target.classId] || target.classId === 'wood_tree'));
}

/** The shared object a verb on target would change, or null (then it is local). */
function sharedVerbOn(engine, target, verbId) {
  if (!target) return null;
  const learned = engine.learnedSkills || [];
  const upgrades = engine.pc?.imaginationUpgrades || [];
  // G334 tree death: the pour landed; its own checks (bottle, Botany, guilt, mood) ran in tree-death-feature.
  if (POUR_VERBS[verbId] && isStreetTree(target)) {
    return { id: treeId(target.treeIndex), wire: POUR_VERBS[verbId], ready: () => true };
  }
  // G334 street Piggies: the player's own side (energy, daily limits, petted first) refuses locally.
  const pig = streetPigIndex(target, engine.streetTsid);
  if (pig >= 0) {
    const [base, cls] = String(verbId || '').split(':');
    if (base === 'pet' || base === 'nibble') {
      if (verbId !== base) return null;
      const rank = highestAnimalKinshipRank(learned);
      return {
        id: pigId(pig),
        ready: () => quoteAnimalKinship(target.state, 'npc_piggy', base, { pc: engine.pc, inv: engine.inv, learned, upgrades }).ok === true,
        skill: pigSkill(learned),
        perks: base === 'nibble' && rank >= 6 ? ['ak6'] : [],
      };
    }
    if (base === 'feed' && cls) {
      return {
        id: pigId(pig),
        wire: 'feed',
        ready: () => (Number(engine.inv?.[cls]) || 0) > 0,
        // npc_piggy.js feed 672-676 (js/animal-husbandry.js feedPiggyStack): base cost 5 or more sates.
        perks: itemBaseCost(cls) >= PIGGY_FEED.minBaseCost ? ['sate'] : [],
      };
    }
    return null;
  }
  if (Number.isInteger(target.rockIndex) && ROCK_CATALOG[target.classId] && target.state?.rock) {
    if (verbId !== 'mine') return null;
    return {
      id: rockId(target.rockIndex),
      ready: () => rockReady(target.state.rock, { inv: engine.inv, pc: engine.pc, learned, toolState: engine.toolState }),
      perks: rockPerks(target.classId, { upgrades, buffs: engine.activeBuffIds?.() || [] }),
    };
  }
  if (Number.isInteger(target.treeIndex) && TRANT_META[target.classId] && target.state) {
    if (!['harvest', 'pet', 'water'].includes(verbId)) return null;
    return {
      id: treeId(target.treeIndex),
      ready: () => treeReady(target.state, target.classId, verbId, { inv: engine.inv, pc: engine.pc, learned, tools: engine.toolState }),
      skill: treeSkill(verbId, learned),
    };
  }
  if (Number.isInteger(target.treeIndex) && target.classId === 'wood_tree' && !target.grownFromBean && target.state) {
    if (verbId !== 'harvest') return null;
    return {
      id: treeId(target.treeIndex),
      ready: () => quoteWoodTreeHarvest(target.state, engine.inv, engine.pc, engine.toolState).ok,
    };
  }
  if (target.resourceKey) {
    const n = (engine.query?.('streetResourceNodes', engine) || []).find((row) => row.target === target);
    if (!n || !sharedNodeVerb(n.classTsid, verbId)) return null;
    return {
      id: nodeId(n.key),
      ready: () => n.ready(verbId),
      perks: nodePerks(n.classTsid, verbId, { upgrades }),
      // A Dirt Pile's dig: the server rolls its Loam drop from the skill (objects.go digHelp).
      skill: n.classTsid === 'dirt_pile' && verbId === 'dig' ? digSkill(learned, upgrades) : '',
    };
  }
  return null;
}

function applyKnown(obj, s) {
  const now = Date.now();
  if (obj.kind === 'rock') applyRockState(obj.rock, s, now);
  else if (obj.kind === 'node') applyNodeState(obj.node, s, now);
  else if (obj.kind === 'wood') applyWoodState(obj.state, s, now);
  else if (obj.kind === 'pig') applyPigState(obj.state, s, now);
  else applyTreeState(obj.state, s, now);
}

function answered(engine, msg, ok) {
  const p = pending.get(msg.req);
  if (p) pending.delete(msg.req);
  if (msg.obj) {
    takeObj(copy, msg.obj, Date.now());
    dirty.add(String(msg.id || ''));
  }
  lastAnswer = `${msg.id}:${msg.verb}:${ok ? 'ok' : msg.code || 'no'}`;
  publish(engine);
  if (!p || copy.street !== engine.streetTsid) return;
  // A word to the server with nothing to run here (a Piggy ate food only this player saw).
  if (p.silent) {
    reconcileAll(engine);
    return;
  }
  if (!ok) {
    const line = String(msg.message || 'Not now.');
    engine.toast?.(line, 2600);
    engine.pushActivity?.(line);
    engine.playSound?.('CLICK_FAILURE', { volume: 0.45 });
    reconcileAll(engine);
    return;
  }
  const obj = localObjects(engine).find((row) => row.id === msg.id && row.target === p.target);
  if (!obj) return;
  // The local rules run on the state the server decided from, with its rolls.
  if (msg.before) applyKnown(obj, msg.before);
  grant = { target: p.target, verbId: p.verbId, roll: Number(msg.roll), chunks: Number.isInteger(msg.chunks) ? msg.chunks : undefined, help: msg.help && typeof msg.help === 'object' ? msg.help : null, use: msg.use && typeof msg.use === 'object' ? msg.use : null };
  try {
    engine.executeVerb?.(p.target, p.verbId, { animated: true });
  } finally {
    grant = null;
  }
  // Then the server's word on what is left.
  const s = stateFor(copy, obj.id, Date.now());
  if (s) applyKnown(obj, s);
  seen.set(stateKey(obj), copy.version);
  dirty.delete(obj.id);
  redraw(engine, obj);
}

/**
 * Ask the server before a shared verb lands: true when asked (or refused for
 * now: connecting, busy), null when the verb is local.
 */
function ask(engine, target, verbId) {
  if (engine.mode !== 'multiplayer') return null;
  if (grant && grant.target === target && grant.verbId === verbId) return null;
  const c = bind(engine);
  if (!c || LOCAL_STATES.has(c.state)) return null;
  // A private place (home, quest room, instance): nobody shares it.
  if (!c.wanted && c.state === 'online') return null;
  const verb = sharedVerbOn(engine, target, verbId);
  if (!verb) return null;
  if (copy.none && copy.street === engine.streetTsid) return null;
  if (!shared(engine)) {
    engine.toast?.(COPY.connecting, 2400);
    return true;
  }
  // The player's own side (pick, skill, energy, daily limits) refuses locally, as in solo.
  if (!verb.ready()) return null;
  for (const p of pending.values()) {
    if (p.id === verb.id && !p.silent) {
      engine.toast?.(COPY.busy, 1600);
      return true;
    }
  }
  reqSeq += 1;
  if (!c.send('obj_act', actMessage({ req: reqSeq, id: verb.id, verb: verb.wire || verbId, perks: verb.perks, skill: verb.skill }))) {
    engine.toast?.(COPY.connecting, 2400);
    return true;
  }
  pending.set(reqSeq, { id: verb.id, target, verbId, at: Date.now() });
  return true;
}

export const streetObjectsFeature = {
  id: STREET_OBJECTS_FEATURE_ID,

  init(engine) {
    if (engine.mode !== 'multiplayer') return;
    publish(engine);
  },

  onTick(dtMs, now, engine) {
    if (engine.mode !== 'multiplayer' || !engine.started) return;
    const c = bind(engine);
    if (!c) return;
    // A join this feature did not hear (bound late): ask now.
    if (c.state === 'online' && c.street && c.street !== syncedStreet) {
      reset();
      syncedStreet = c.street;
      c.send('obj_sync');
    }
    const wall = Date.now();
    for (const [req, p] of pending) {
      if (wall - p.at < REQUEST_TIMEOUT_MS) continue;
      pending.delete(req);
      if (!p.silent) engine.toast?.(COPY.timeout, 2400);
    }
    if (reapplyAt && wall >= reapplyAt) {
      reapplyAt = 0;
      dirtyAll = true;
    }
    if (wall - lastReconcile < RECONCILE_MS && !dirtyAll && !dirty.size) return;
    lastReconcile = wall;
    reconcileAll(engine);
  },

  onStreetClear() {
    pending.clear();
    grant = null;
  },

  /** The new game day reset trees locally; the server's copy wins (again once its own rollover lands). */
  onNewDay(now, engine) {
    if (engine?.mode !== 'multiplayer') return;
    dirtyAll = true;
    reapplyAt = Date.now() + 3000;
  },

  /** game.js executeVerb: a shared verb asks the server before it lands. */
  runVerbOverride(target, verbId, engine) {
    return ask(engine, target, verbId);
  },

  /**
   * A feature whose own runVerbOverride comes first (tree-death-feature's pour) asks here:
   * true when the server was asked (or the street is still connecting), null when the verb
   * is local. The go-ahead runs executeVerb(target, verbId) again with the grant.
   */
  sharedObjectVerb(target, verbId, engine) {
    return ask(engine, target, verbId);
  },

  /** Whether the server shares this street tree now (tree-death-feature leaves its death to it). */
  sharedTree(target, engine) {
    if (!engine || engine.mode !== 'multiplayer' || !isStreetTree(target)) return null;
    return shared(engine) ? true : null;
  },

  /** Whether the server holds this street Piggy (animal-mood-feature leaves its ticks to it). */
  sharedPiggy(target, engine) {
    if (!engine || engine.mode !== 'multiplayer' || !shared(engine)) return null;
    const i = streetPigIndex(target, engine.streetTsid);
    return i >= 0 && copy.objs.has(pigId(i)) ? true : null;
  },

  /** A street Piggy ate food only this player sees (their own dropped stack), or a tree's fruit (onTarget). */
  sharedPiggyAte(target, onTarget, engine) {
    if (!streetObjectsFeature.sharedPiggy(target, engine)) return null;
    const c = bind(engine);
    const on = isStreetTree(onTarget) && TRANT_META[onTarget.classId] ? treeId(onTarget.treeIndex) : '';
    reqSeq += 1;
    if (!c.send('obj_act', actMessage({ req: reqSeq, id: pigId(streetPigIndex(target, engine.streetTsid)), verb: 'eat', on }))) return null;
    pending.set(reqSeq, { id: pigId(streetPigIndex(target, engine.streetTsid)), target, verbId: 'eat', at: Date.now(), silent: true });
    return true;
  },

  /**
   * G361 / G335 Fertilidust (powders-feature, as a jar is used on targets): the server uses the
   * jar's charge through the site's ledger, answers obj_dust_used (powderUseGranted runs the verb
   * here) or refuses (the line is shown), and grows the shared street trees as the dust lands
   * (objects.go handleDust: every tree of the street, or with lite the one named); everyone hears
   * their new state. True when the server was asked, null when the trees are local (solo, a
   * private place, a tree in your Patch).
   */
  sharedFertilize(targets, lite, engine, classTsid = lite ? 'fertilidust_lite' : 'fertilidust') {
    if (!engine || engine.mode !== 'multiplayer' || !shared(engine)) return null;
    const trees = (targets || []).filter(isStreetTree);
    if (!trees.length || (lite && trees.length !== 1)) return null;
    const c = bind(engine);
    for (const p of pending.values()) {
      if (p.verbId === 'dust') {
        engine.toast?.(COPY.busy, 1600);
        return true;
      }
    }
    reqSeq += 1;
    const msg = { req: reqSeq };
    if (lite) msg.id = treeId(trees[0].treeIndex);
    if (!c?.send('obj_dust', msg)) return null;
    pending.set(reqSeq, { id: msg.id || 'dust', target: null, verbId: 'dust', classTsid, at: Date.now() });
    return true;
  },

  /** Help dig (features/help-mine-feature.js): who the server says digs a shared Dirt Pile, or null. */
  sharedDiggers(target, engine) {
    if (!client || !copy.snap || !target?.resourceKey) return null;
    const n = (engine?.query?.('streetResourceNodes', engine) || []).find((row) => row.target === target);
    if (!n || n.classTsid !== 'dirt_pile') return null;
    const s = stateFor(copy, nodeId(n.key));
    return Array.isArray(s?.diggers) ? s.diggers.map(Number) : [];
  },

  /** Help dig: tell the server a dig at a shared Dirt Pile starts or stops (objects.go obj_dig). */
  sharedDigSwing(target, what, engine) {
    if (!client || !target?.resourceKey || (what !== 'start' && what !== 'stop')) return null;
    const n = (engine?.query?.('streetResourceNodes', engine) || []).find((row) => row.target === target);
    if (!n || n.classTsid !== 'dirt_pile') return null;
    return client.send('obj_dig', { id: nodeId(n.key), do: what }) !== false;
  },

  /** game.js runVerb: the server's rolls for the verb it just allowed (and, for a pour, the ledger's use of the bottle). */
  sharedVerbGrant(target, verbId) {
    if (!grant || grant.target !== target || grant.verbId !== verbId) return null;
    const out = { roll: Number.isFinite(grant.roll) ? grant.roll : undefined, chunks: grant.chunks, help: grant.help };
    if (grant.use) out.use = grant.use;
    return out;
  },

  /** Help mine (features/help-mine-feature.js): who the server says is swinging at a shared rock, or null. */
  sharedMiners(target) {
    if (!client || !copy.snap || !Number.isInteger(target?.rockIndex)) return null;
    const s = stateFor(copy, rockId(target.rockIndex));
    return Array.isArray(s?.miners) ? s.miners.map(Number) : [];
  },

  /** Help mine: tell the server a swing at a shared rock starts or stops (objects.go obj_mine). */
  sharedMineSwing(target, what) {
    if (!client || !Number.isInteger(target?.rockIndex) || (what !== 'start' && what !== 'stop')) return false;
    return client.send('obj_mine', { id: rockId(target.rockIndex), do: what }) !== false;
  },

  /** QA / tests. */
  _state() {
    return { street: copy.street, snap: copy.snap, none: copy.none, objs: copy.objs.size, pending: pending.size, bound: Boolean(client) };
  },
  _reset() {
    client = null;
    reset();
    pending.clear();
    grant = null;
    reqSeq = 0;
    lastAnswer = '';
  },
};
