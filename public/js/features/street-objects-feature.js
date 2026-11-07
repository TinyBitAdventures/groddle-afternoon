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
 * - Only a realtime room named for this street shares its objects: the
 *   server lays objects out by street tsid (data/objects.json) and answers
 *   any other room "none". On your own home street and back yard (HOME_<id>,
 *   HOUSE_<id>), a party space, a race or a train every verb is local, the
 *   same as a Patch (player report 36: a Dirt Pile placed in the yard always
 *   said the street was still connecting). A visited home's rocks and nodes
 *   are yard-verbs-mp-feature's (the site's). A street whose snapshot never
 *   came is asked again (SYNC_RETRY_MS), so a dropped obj_sync never leaves
 *   its verbs waiting for good.
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
 *   to it); a Piggy eating a shared tree's fruit where only this player saw
 *   it walk tells the server (sharedPiggyAte); the server's tick events
 *   (obj_ev) reach animal-mood-feature's sharedAnimalEvent. Food that sates
 *   a hungry Piggy is the ledger's (G335 slice 5): the feed names it ("c",
 *   "n"), the server has the site take it first, a refusal shows "You don't
 *   have enough of that item.", and the go-ahead's op is applied once
 *   (ledgerReceipt) as the feed takes the food from the pack.
 * - Tools (G335 slice 5): a swing, chop, scrape, dig or watering lands only
 *   when the site's ledger holds the tool (the server asks once per street
 *   visit); without one the server answers with the source's line ("You'll
 *   need a pick first.").
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
 * - Street animals (objects_creatures.go, js/street-creatures.js): a street's
 *   Chickens, Butterflies and Batterflies are the same for everyone. When the
 *   snapshot names them (animals), each one follows its shared path from the
 *   server's clock (sprite._path, which game.js and animal-husbandry-feature
 *   call each frame instead of their own wander), a verb that lands holds it
 *   still for everyone, and the others see the verb happen (obj_ev: the
 *   squeeze, the massage or milking, the Batterfly chewing). Squeeze, massage,
 *   milk, request incubation and a Batterfly's feed ask the server first: it
 *   keeps each player's daily uses of each animal (and the warmup a milking
 *   needs), a Chicken's one egg and its owner (the ledger takes the egg; only
 *   the owner's game hatches it), and a Batterfly's food counter (the ledger
 *   takes the food; the server says how much Guano drops). The player's own
 *   side refuses locally first, as in solo.
 *
 * QA: canvas data streetObjects (street:snap|none|waiting), streetObjectsLast
 * (id:verb:ok|code), streetObjectsShared (shared objects on this street),
 * streetObjectsView (each as this client has it: rock:1=43, tree:0=98pw),
 * streetCreatures (when it was read, then each shared animal where this
 * client draws it, on the street and # on the canvas:
 * t1730000000000 chicken:0@2986,868#512,640).
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
  idKind,
  inObjectReach,
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
} from '../street-objects.js?v=6c3e757c';
import { ROCK_CATALOG } from '../mining.js?v=29fe2127';
import { TRANT_META, trantStatusLabel } from '../trants.js?v=9c2e8c0f';
import { quoteWoodTreeHarvest } from '../woodcutting.js?v=c199dd64';
import { animalStatusLabel, pickerMaxCount } from '../animals.js?v=d5af4f3c';
import { highestAnimalKinshipRank, quoteAnimalKinship } from '../animal-kinship.js?v=05cd67ec';
import { animalPatrolRange } from '../street-ecology.js?v=3c1d4c06';
import { INCUBATION, PIGGY_FEED, itemBaseCost, resetIncubation } from '../animal-husbandry.js?v=35b23ef4';
import {
  applyCreatureState,
  batterflyAt,
  batterflyPerks,
  chickenSeed,
  chickenWalkAt,
  creatureOf,
  easeToward,
  flightFloorFor,
  flyerAt,
  flyerLift,
  followPath,
  PATH_STEP,
  pathFrom,
  pathTime,
  restAt,
  serverPathClock,
  sharedCreatureLabel,
} from '../street-creatures.js?v=cc92779f';

export const STREET_OBJECTS_FEATURE_ID = 'street-objects';
const RECONCILE_MS = 250;
/** No snapshot for the street joined in this long (a dropped obj_sync): ask again. */
const SYNC_RETRY_MS = 3000;
/** States in which the site has no live street at all: the local rules apply. */
const LOCAL_STATES = new Set(['off', 'signed-out', 'replaced', 'stopped']);

let client = null;
let copy = createStreetCopy();
let syncedStreet = '';
let syncAskedAt = 0;
let reqSeq = 0;
const pending = new Map();
let grant = null;
let dirtyAll = false;
const dirty = new Set();
let seen = new WeakMap();
let lastReconcile = 0;
let reapplyAt = 0;
let lastAnswer = '';
let creaturesShownAt = 0;
/** Sprites this feature set on a shared path (sprite._path), cleared when the street stops sharing. */
let pathed = new Set();

function clearPaths() {
  for (const spr of pathed) {
    if (spr && spr._path) delete spr._path;
    if (spr) delete spr._pathPoint;
    if (spr) delete spr._pathHold;
  }
  pathed = new Set();
}

function reset() {
  clearPaths();
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
    syncAskedAt = Date.now();
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
    engine.query?.('powderUseGranted', p.classTsid, msg.use || null, engine, p.copy ?? null);
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
    if (obj.kind === 'chicken' || obj.kind === 'butterfly' || obj.kind === 'batterfly') {
      creatureEvent(engine, obj, msg);
      return;
    }
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
    } else if (t.state && copy.animals.has(creatureOf(t)?.id)) {
      // A street animal the server shares here (its snapshot named it).
      const a = creatureOf(t);
      out.push({ id: a.id, kind: a.kind, target: t, classId: t.classId, state: t.state, index: a.index, me: client?.me?.id || 0 });
    }
  }
  for (const n of engine.query?.('streetResourceNodes', engine) || []) {
    if (!SHARED_NODE_CLASSES.includes(n.classTsid)) continue;
    out.push({ id: nodeId(n.key), kind: 'node', target: n.target, classId: n.classTsid, node: n.node, refresh: n.refresh, ready: n.ready });
  }
  return out;
}

/**
 * Put a street animal's sprite on its shared path (js/street-creatures.js): game.js (Chickens,
 * Butterflies) and animal-husbandry-feature (Batterflies) call sprite._path(dt) each frame in place
 * of their own wander, except while this player has its menu open or a verb on it. It answers false
 * while something on this street holds the animal its own way (the Rook and a sulk stop a Chicken
 * with vx 0 and ground a flyer, rook-attack-feature, animal-mood-feature), and the local code runs.
 */
function setPath(engine, obj) {
  const t = obj.target;
  const spr = t?.sprite;
  if (!spr || spr.destroyed || spr._path) return;
  let step = null;
  // Where the shared path puts it now (QA: groddleCreatures reports it beside the sprite).
  let pointAt = null;
  if (obj.kind === 'chicken') {
    // Its spot and walk from the street's plan (game.js spawnChickens: a short floor shortens the
    // walk, street-ecology.js animalPatrolRange), the same for everyone.
    const spot = engine.placement?.('chickens')?.[obj.index];
    const home = { baseX: Number.isFinite(spot?.x) ? spot.x : spr.baseX, range: spot ? animalPatrolRange('chickens', spot.room) : (spr.range || 100), dir: obj.index % 2 ? -1 : 1 };
    if (!Number.isFinite(home.baseX)) return;
    // Its walk with the original's pauses (js/street-creatures.js chickenWalkAt), rolled from a seed
    // every page shares, so everyone sees it stop, peck and turn at the same moment (CHICKWALK).
    const seed = chickenSeed(obj.index, home.baseX);
    pointAt = () => chickenWalkAt(home, pathTime(t.sharedPath, Date.now(), copy.offset), seed);
    step = (dt) => {
      if (Math.abs(spr.vx || 0) < 0.01) return false;
      const p = pointAt();
      // On its path, not trailing it: it stops, turns and walks on where the path does (CHICKLOOP).
      spr.x = followPath(spr.x, p.x, dt, PATH_STEP.chicken);
      spr.vx = p.dir * Math.abs(spr.vx || 0.5);
      const bs = spr.baseScale ?? Math.abs(spr.scale.y);
      spr.scale.x = p.dir * bs;
      spr.scale.y = Math.abs(bs);
      // Walking, standing or pecking (game.js spawnChickens walkPose); held for someone at it, it
      // stands rather than walking in place (onWaitStart stopMoving).
      const held = Number(t.sharedPath?.holdEnd) > Date.now() + (Number(copy.offset) || 0);
      spr.walkPose?.(held && p.pose === 'walk' ? 'stand' : p.pose);
      return true;
    };
  } else if (obj.kind === 'butterfly' && t.airborne) {
    const rest = engine.placement?.('butterflies')?.length || 0;
    const j = obj.index - rest;
    const spot = engine.placement?.('flyingButterflies')?.[j];
    if (!spot || !Number.isFinite(spot.x)) return;
    const worldW = Number(engine.worldW) || 2000;
    // Over the floor under it (js/street-creatures.js flightFloor): every player's street has the same lines.
    const home = {
      x0: spot.x,
      baseY: (Number.isFinite(spot.y) ? spot.y : spr.y + 90) - flyerLift(j),
      worldW,
      phase0: j,
      floor: flightFloorFor(engine.platforms, worldW),
      lift: flyerLift(j),
    };
    pointAt = () => flyerAt(home, pathTime(t.sharedPath, Date.now(), copy.offset));
    step = (dt) => {
      if (!spr._ambient) return false;
      const p = pointAt();
      spr.x = followPath(spr.x, p.x, dt, PATH_STEP.fly);
      spr.y = followPath(spr.y, p.y, dt, PATH_STEP.fly);
      const bs = spr.baseScale ?? Math.abs(spr.scale.y);
      spr.scale.x = Math.abs(bs);
      spr.scale.y = Math.abs(bs);
      return true;
    };
  } else if (obj.kind === 'butterfly') {
    const home = { groundY: Number.isFinite(spr._groundY) ? spr._groundY : spr.y - 2, phase0: obj.index };
    pointAt = () => ({ x: spr.x, ...restAt({ ...home, groundY: Number.isFinite(spr._groundY) ? spr._groundY : home.groundY }, pathTime(t.sharedPath, Date.now(), copy.offset)) });
    step = (dt) => {
      if (spr._ambient) return false;
      spr.y = easeToward(spr.y, pointAt().y, dt);
      return true;
    };
  } else if (obj.kind === 'batterfly') {
    // Its place is the server's (the snapshot's spots), the same for everyone.
    const spot = copy.spots?.[obj.id];
    const placed = (Array.isArray(spot) && engine.query?.('batterflyHome', t, Number(spot[0]), Number(spot[1]), engine)) || spr._home;
    if (!placed) return;
    // Never lower over the floor under it than over its spot (js/street-creatures.js batterflyBaseY).
    const home = { ...placed, floor: flightFloorFor(engine.platforms, Number(engine.worldW) || 2000) };
    pointAt = () => batterflyAt(home, pathTime(t.sharedPath, Date.now(), copy.offset));
    step = (dt) => {
      const p = pointAt();
      spr.x = easeToward(spr.x, p.x, dt);
      spr.y = easeToward(spr.y, p.y, dt);
      spr.scale.x = Math.abs(spr.scale.y) * p.dir;
      return true;
    };
  }
  if (!step) return;
  spr._path = step;
  spr._pathPoint = pointAt;
  // How long its path still holds (ms on the server's clock): a rooked one holds until it is revived
  // (objects_creatures.go rookHoldCreature), so rook-attack-feature lays it where its path stopped.
  spr._pathHold = () => (Number(t.sharedPath?.holdEnd) || 0) - (Date.now() + (Number(copy.offset) || 0));
  pathed.add(spr);
}

/**
 * A player at a shared Chicken or Butterfly (its menu open, a verb on it): game.js stops it on this
 * screen, and the server holds its path for everyone (objects_creatures.go waitCreature: npc.js
 * onInteractionStarting 1981-1990, npc_chicken.js onWaitStart 1630-1639, npc_butterfly.js
 * onWaitStart 1513-1531), again every WAIT_EVERY_MS while the player stays, so nobody's copy runs
 * ahead and it does not jump when the menu closes (lane PIGSTUCK, Austin 2026-11-01: Chickens
 * "hop, like they're restarting their animation from the other side"). A Batterfly flies on.
 *
 * Each wait says where this screen stopped it ("at", the path's clock when the menu opened or the
 * verb began), so the hold starts there for everyone rather than a trip to the server later: the
 * original's Chicken stood where it was and walked on from there (npc_chicken.js onWaitStart
 * 1635-1643, onWaitEnd 1626-1633; lane CHICKLOOP, Austin 2026-11-01: "I'm still seeing chickens
 * jump around").
 */
const WAIT_EVERY_MS = 700;
let waitSent = { id: '', at: 0, stop: 0 };
function waitAtCreature(engine, c, wall) {
  if (c.state !== 'online' || !copy.creatures) return;
  const t = engine.interactionTarget?.();
  const a = t ? creatureOf(t) : null;
  if (!a || a.kind === 'batterfly' || !copy.animals.has(a.id) || !t.sprite?._path) {
    waitSent = { id: '', at: 0, stop: 0 };
    return;
  }
  // The first frame at it: where its path stood when this screen stopped it.
  if (waitSent.id !== a.id) waitSent = { id: a.id, at: 0, stop: serverPathClock(t.sharedPath, wall, copy.offset) };
  if (wall - waitSent.at < WAIT_EVERY_MS) return;
  reqSeq += 1;
  if (c.send('obj_act', actMessage({ req: reqSeq, id: a.id, verb: 'wait', at: waitSent.stop }))) waitSent.at = wall;
}

/** Someone else's verb on a street animal: this player sees it happen. */
function creatureEvent(engine, obj, msg) {
  const ev = String(msg.ev || '');
  const t = obj.target;
  if (ev === 'lost' && Number(msg.by) === Number(client?.me?.id) && t?.state?.incubatingEgg && !t.state.incubBy) {
    // Your egg: you were not on the street when it hatched (npc_chicken.js onPlayerExit 1365-1373).
    resetIncubation(t.state);
    t.subtitle = animalStatusLabel('npc_chicken', t.state);
    return;
  }
  if (Number(msg.by) === Number(client?.me?.id) || !t?.sprite || t.sprite.destroyed) return;
  if (ev === 'squeeze' || ev === 'massage' || ev === 'milk') engine.playVerbAnimation?.(t, ev, 1500);
  else if (ev === 'feed' && obj.kind === 'batterfly') engine.query?.('batterflyChew', t, engine);
  lastAnswer = `${obj.id}:${ev}:seen`;
  publish(engine);
}

/** QA: where this client draws each shared street animal (streetCreatures). */
function showCreatures(engine, all) {
  const wall = Date.now();
  if (wall - creaturesShownAt < 400) return;
  creaturesShownAt = wall;
  const rows = [];
  for (const obj of all) {
    if (obj.kind !== 'chicken' && obj.kind !== 'butterfly' && obj.kind !== 'batterfly') continue;
    const spr = obj.target?.sprite;
    if (!spr) continue;
    // Where it is on the street, and (#) on the canvas, for QA scripts that click it.
    const g = typeof spr.getGlobalPosition === 'function' ? spr.getGlobalPosition() : null;
    rows.push(`${obj.id}@${Math.round(spr.x)},${Math.round(spr.y)}${g ? `#${Math.round(g.x)},${Math.round(g.y)}` : ''}`);
  }
  // The moment it was read (ms), so two clients' places can be compared at the same instant.
  engine.setData?.('streetCreatures', rows.length ? `t${wall} ${rows.join(' ')}` : '');
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
  } else if (obj.kind === 'chicken' || obj.kind === 'butterfly') {
    if (obj.target) obj.target.subtitle = sharedCreatureLabel(obj.classId, obj.state) || animalStatusLabel(obj.classId, obj.state);
    setPath(engine, obj);
  } else if (obj.kind === 'batterfly') {
    setPath(engine, obj);
  } else obj.refresh?.();
  // G334: the server says this street tree died (for everyone): it dies here too.
  if ((obj.kind === 'tree' || obj.kind === 'wood') && obj.state?.sharedDead && obj.target) {
    engine.query?.('sharedTreeDied', obj.target, { by: obj.state.sharedDeadBy || 0 }, engine);
  }
}

function shared(engine) {
  return Boolean(client) && client.state === 'online' && copy.snap && !copy.none && copy.street === engine.streetTsid;
}

/**
 * Whether the realtime room the player is in (or is joining) is this street. The server keeps
 * objects only for street tsids (objects.go handleSync answers any other room "none"), so a
 * home (HOME_<id>, HOUSE_<id>), party space, race or train room never holds them: no verb
 * there waits for the server (player report 36).
 */
function roomIsStreet(engine, c) {
  return Boolean(c?.wanted) && c.wanted === String(engine?.streetTsid || '');
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
  showCreatures(engine, all);
}

/** QA: one object as this client has it (rock:1=43, node:peat_1:0=2, tree:0=98pw). */
function viewOf(obj) {
  if (obj.kind === 'rock') return `${obj.id}=${obj.rock.chunksRemaining}${obj.rock.mega ? 'm' : ''}`;
  if (obj.kind === 'node') return `${obj.id}=${obj.node.units}${obj.node.petted ? 'p' : ''}${obj.node.watered ? 'w' : ''}`;
  if (obj.kind === 'wood') return `${obj.id}=m${obj.state.maturity}c${obj.state.harvestCount || 0}${deathView(obj.state)}`;
  if (obj.kind === 'pig') return `${obj.id}=m${obj.state.mood}h${obj.state.hunger}${obj.state.hasBeenPetted ? 'p' : ''}`;
  if (obj.kind === 'chicken') return `${obj.id}=s${obj.state.sharedSqueezes || 0}${obj.state.incubatingEgg ? 'i' : ''}`;
  if (obj.kind === 'butterfly') return `${obj.id}=m${obj.state.sharedMassages || 0}k${obj.state.sharedMilks || 0}`;
  if (obj.kind === 'batterfly') return `${obj.id}=f${obj.state.foodCounter || 0}`;
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
  // Street animals: the player's own side (energy, lotion, daily limits, warmup) refuses locally.
  const animal = creatureOf(target);
  if (animal && copy.animals.has(animal.id)) {
    const [base, cls, countText] = String(verbId || '').split(':');
    if ((animal.kind === 'chicken' && base === 'squeeze') || (animal.kind === 'butterfly' && (base === 'massage' || base === 'milk'))) {
      if (verbId !== base) return null;
      const rank = highestAnimalKinshipRank(learned);
      return {
        id: animal.id,
        ready: () => quoteAnimalKinship(target.state, target.classId, base, { pc: engine.pc, inv: engine.inv, tools: engine.toolState, learned, upgrades }).ok === true,
        skill: pigSkill(learned),
        perks: base === 'milk' && rank >= 6 ? ['ak6'] : [],
      };
    }
    if (animal.kind === 'chicken' && base === 'incubate' && INCUBATION.hatches[cls]) {
      return {
        id: animal.id,
        wire: 'incubate',
        ready: () => (Number(engine.inv?.[cls]) || 0) > 0 && learned.includes(INCUBATION.skill) && !target.state?.incubatingEgg,
        c: cls,
        n: 1,
      };
    }
    if (animal.kind === 'batterfly' && base === 'feed' && cls) {
      const n = Math.max(1, Math.floor(Number(countText) || 1));
      return {
        id: animal.id,
        wire: 'feed',
        ready: () => (Number(engine.inv?.[cls]) || 0) >= n,
        perks: batterflyPerks(upgrades),
        c: cls,
        n,
      };
    }
    return null;
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
      const count = String(verbId).split(':')[2];
      return {
        id: pigId(pig),
        wire: 'feed',
        ready: () => (Number(engine.inv?.[cls]) || 0) > 0,
        // npc_piggy.js feed 672-676 (js/animal-husbandry.js feedPiggyStack): base cost 5 or more sates.
        perks: itemBaseCost(cls) >= PIGGY_FEED.minBaseCost ? ['sate'] : [],
        // G335 slice 5: the food and how many (content.js feedAnimal's count), for the ledger to take.
        c: cls,
        n: Math.max(1, Math.min(Math.floor(Number(count) || 1), pickerMaxCount('npc_piggy', cls, engine.inv))),
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
  else if (obj.kind === 'chicken' || obj.kind === 'butterfly' || obj.kind === 'batterfly') {
    applyCreatureState(obj.classId, obj.state, s, { me: client?.me?.id || 0, now });
    if (obj.target) obj.target.sharedPath = pathFrom(s, now, copy.offset);
  } else applyTreeState(obj.state, s, now);
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
  grant = { target: p.target, verbId: p.verbId, roll: Number(msg.roll), chunks: Number.isInteger(msg.chunks) ? msg.chunks : undefined, help: msg.help && typeof msg.help === 'object' ? msg.help : null, use: msg.use && typeof msg.use === 'object' ? msg.use : null, guano: Number.isInteger(msg.guano) ? msg.guano : undefined };
  // G335 slice 5: food the ledger took for a Piggy or a Batterfly, or the egg a Chicken sits on,
  // leaves the pack with the verb below, once (the trade slice's applied list holds its op, so the
  // site counts it as applied).
  if (grant.use?.spent && grant.use.n && /^(feed|incubate):/.test(String(p.verbId))) engine.query?.('ledgerReceipt', String(grant.use.op || ''), engine);
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
  // A visited home street's rocks and nodes are the owner's (yard-verbs-mp-feature asks the site), never this server's street objects.
  if (target?.yardVisit) return null;
  const c = bind(engine);
  if (!c || LOCAL_STATES.has(c.state)) return null;
  // A private place (quest room, instance) or a room that is not this street (your own home, a
  // party space, a race): the server shares nothing there.
  if (!roomIsStreet(engine, c)) return null;
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
  if (!c.send('obj_act', actMessage({ req: reqSeq, id: verb.id, verb: verb.wire || verbId, perks: verb.perks, skill: verb.skill, c: verb.c, n: verb.n }))) {
    engine.toast?.(COPY.connecting, 2400);
    return true;
  }
  pending.set(reqSeq, { id: verb.id, target, verbId, at: Date.now() });
  return true;
}

/**
 * game.js beginVerbAction, before the swing: a rock, tree or node the server would refuse as too
 * far when the verb lands (objects.go handleAct "far") is refused now with the server's line, so
 * the swing never plays for nothing (player report 33). Null when the verb is local or in reach.
 */
function outOfReach(engine, target, verbId, at = null) {
  if (engine.mode !== 'multiplayer' || target?.yardVisit) return null;
  const c = bind(engine);
  if (!c || LOCAL_STATES.has(c.state) || !roomIsStreet(engine, c)) return null;
  const spr = target?.sprite;
  // `at`: feet somewhere else (game.js requestVerb's walk-over asks where a walk would stop).
  const p = at || engine.player;
  if (!spr || !p || !Number.isFinite(spr.x) || !Number.isFinite(spr.y)) return null;
  const verb = sharedVerbOn(engine, target, verbId);
  if (!verb || !['rock', 'tree', 'node'].includes(idKind(verb.id))) return null;
  return inObjectReach(p.x, p.y, spr.x, spr.y) ? null : COPY.far;
}

export const streetObjectsFeature = {
  id: STREET_OBJECTS_FEATURE_ID,

  verbOutOfReach(target, verbId, engine, at) {
    return outOfReach(engine, target, verbId, at);
  },

  init(engine) {
    if (engine.mode !== 'multiplayer') return;
    publish(engine);
    // QA: each shared street animal where this page draws it right now (the two-player checks
    // compare two pages at the same instant).
    if (typeof window !== 'undefined') {
      window.groddleCreatures = () => {
        // off: the street's clock (server ms minus local ms, js/street-creatures.js clockOffset).
        const out = { at: Date.now(), off: copy.offset, animals: {} };
        for (const obj of localObjects(engine)) {
          const spr = obj.target?.sprite;
          if (!spr || (obj.kind !== 'chicken' && obj.kind !== 'butterfly' && obj.kind !== 'batterfly')) continue;
          const g = typeof spr.getGlobalPosition === 'function' ? spr.getGlobalPosition() : null;
          const p = typeof spr._pathPoint === 'function' ? spr._pathPoint() : null;
          out.animals[obj.id] = { x: Math.round(spr.x), y: Math.round(spr.y), path: obj.target.sharedPath || null, px: p && Number.isFinite(p.x) ? Math.round(p.x) : null, py: p && Number.isFinite(p.y) ? Math.round(p.y) : Math.round(spr.y), gx: g ? Math.round(g.x) : null, gy: g ? Math.round(g.y) : null, label: obj.target.label };
        }
        return out;
      };
    }
  },

  onTick(dtMs, now, engine) {
    if (engine.mode !== 'multiplayer' || !engine.started) return;
    const c = bind(engine);
    if (!c) return;
    // A join this feature did not hear (bound late): ask now.
    if (c.state === 'online' && c.street && c.street !== syncedStreet) {
      reset();
      syncedStreet = c.street;
      syncAskedAt = Date.now();
      c.send('obj_sync');
    }
    const wall = Date.now();
    // No snapshot yet for the street joined (the server dropped a sync over its rate limit): ask
    // again, so its verbs never wait on "still connecting" for good.
    if (c.state === 'online' && syncedStreet && c.street === syncedStreet && !copy.snap && wall - syncAskedAt >= SYNC_RETRY_MS) {
      syncAskedAt = wall;
      c.send('obj_sync');
    }
    for (const [req, p] of pending) {
      if (wall - p.at < REQUEST_TIMEOUT_MS) continue;
      pending.delete(req);
      if (!p.silent) engine.toast?.(COPY.timeout, 2400);
    }
    waitAtCreature(engine, c, wall);
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
    clearPaths();
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

  /** A street Piggy ate a shared tree's fruit (onTarget) where only this player saw it walk there. */
  sharedPiggyAte(target, onTarget, engine) {
    if (!streetObjectsFeature.sharedPiggy(target, engine)) return null;
    // G335 slice 5: food only this player sees no longer sates a Piggy everyone shares.
    if (!isStreetTree(onTarget) || !TRANT_META[onTarget.classId]) return null;
    const c = bind(engine);
    const on = treeId(onTarget.treeIndex);
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
  sharedFertilize(targets, lite, engine, classTsid = lite ? 'fertilidust_lite' : 'fertilidust', copy = null) {
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
    // The jar used (its place among the class's jars in pack order): the ledger uses that one's charge.
    if (Number.isInteger(copy) && copy >= 0) msg.k = copy;
    if (!c?.send('obj_dust', msg)) return null;
    pending.set(reqSeq, { id: msg.id || 'dust', target: null, verbId: 'dust', classTsid, copy: Number.isInteger(copy) ? copy : null, at: Date.now() });
    return true;
  },

  /** Help dig (features/help-mine-feature.js): who the server says digs a shared Dirt Pile, or null. */
  sharedDiggers(target, engine) {
    if (!client || !copy.snap || copy.none || !target?.resourceKey || (engine && copy.street !== engine.streetTsid)) return null;
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
    // A Batterfly's feed: the Guano the shared food counter released (objects_creatures.go).
    if (Number.isInteger(grant.guano)) out.guano = grant.guano;
    return out;
  },

  /** Help mine (features/help-mine-feature.js): who the server says is swinging at a shared rock, or null. */
  sharedMiners(target) {
    if (!client || !copy.snap || copy.none || !Number.isInteger(target?.rockIndex)) return null;
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
    creaturesShownAt = 0;
    reset();
    pending.clear();
    grant = null;
    reqSeq = 0;
    syncAskedAt = 0;
    lastAnswer = '';
    waitSent = { id: '', at: 0, stop: 0 };
  },
};
