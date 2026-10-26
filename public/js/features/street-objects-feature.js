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
  createStreetCopy,
  nodeId,
  nodePerks,
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
} from '../street-objects.js?v=mp4-1';
import { ROCK_CATALOG } from '../mining.js?v=g330-1';
import { TRANT_META, trantStatusLabel } from '../trants.js?v=trant-harvest-2';

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
  } else obj.refresh?.();
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
  return `${obj.id}=${obj.state.fruitCount}${obj.state.petted ? 'p' : ''}${obj.state.watered ? 'w' : ''}`;
}

/** The shared object a verb on target would change, or null (then it is local). */
function sharedVerbOn(engine, target, verbId) {
  if (!target) return null;
  const learned = engine.learnedSkills || [];
  const upgrades = engine.pc?.imaginationUpgrades || [];
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
  if (target.resourceKey) {
    const n = (engine.query?.('streetResourceNodes', engine) || []).find((row) => row.target === target);
    if (!n || !sharedNodeVerb(n.classTsid, verbId)) return null;
    return { id: nodeId(n.key), ready: () => n.ready(verbId), perks: nodePerks(n.classTsid, verbId, { upgrades }) };
  }
  return null;
}

function applyKnown(obj, s) {
  const now = Date.now();
  if (obj.kind === 'rock') applyRockState(obj.rock, s, now);
  else if (obj.kind === 'node') applyNodeState(obj.node, s, now);
  else applyTreeState(obj.state, s);
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
  grant = { target: p.target, verbId: p.verbId, roll: Number(msg.roll), chunks: Number.isInteger(msg.chunks) ? msg.chunks : undefined };
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
      engine.toast?.(COPY.timeout, 2400);
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
      if (p.id === verb.id) {
        engine.toast?.(COPY.busy, 1600);
        return true;
      }
    }
    reqSeq += 1;
    if (!c.send('obj_act', actMessage({ req: reqSeq, id: verb.id, verb: verbId, perks: verb.perks, skill: verb.skill }))) {
      engine.toast?.(COPY.connecting, 2400);
      return true;
    }
    pending.set(reqSeq, { id: verb.id, target, verbId, at: Date.now() });
    return true;
  },

  /** game.js runVerb: the server's rolls for the verb it just allowed. */
  sharedVerbGrant(target, verbId) {
    if (!grant || grant.target !== target || grant.verbId !== verbId) return null;
    return { roll: Number.isFinite(grant.roll) ? grant.roll : undefined, chunks: grant.chunks };
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
