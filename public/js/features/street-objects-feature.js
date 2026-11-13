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
 *   to it). Their walks to food are the server's too (sharedPiggyTrips: the
 *   state's trip, drawn on the shared path): a fruiting tree this player
 *   works sends the server "food" (sharedPiggyFood), and the server walks
 *   the hungry ones there for everyone. With an older server, a Piggy eating
 *   a shared tree's fruit where only this player saw it walk tells the server
 *   (sharedPiggyAte); the server's tick events
 *   (obj_ev) reach animal-mood-feature's sharedAnimalEvent. Food that sates
 *   a hungry Piggy is the ledger's (G335 slice 5): the feed names it ("c",
 *   "n"), the server has the site take it first, a refusal shows "You don't
 *   have enough of that item.", and the go-ahead's op is applied once
 *   (ledgerReceipt) as the feed takes the food from the pack.
 * - A Batterfly's hourly Guano (register G641): with a server that keeps it (the snapshot's "guano"),
 *   one pile lies under each street Batterfly for everyone. animal-husbandry-feature draws the piles
 *   (sharedGuano) and asks for one with the verb "pickup" on the Batterfly's id (sharedGuanoPick); the
 *   answer's "take" goes into the pack once (sharedGuanoPicked), wherever the player stands by then.
 *   With a server from before, each page keeps its own hourly clock as it always did.
 * - G605: a street Piggy captured (capture: Herdkeeping as "herd", the Pig Bait through the ledger,
 *   the server's roll) or poured with a Potion of Animal Youth (youth: the bottle's pour through the
 *   ledger, a Piglet on the ground for everyone) is gone for everyone until the next game day: the
 *   state's "gone" hides it on every page (animal-husbandry-feature sharedPigGone) and brings it back.
 *   The capture's go-ahead replays the verb with the server's roll; the pour's lands in
 *   potions-feature youthGranted. A crop fed to it counts toward Plops the server places on the
 *   ground for everyone (obj_ev "plop": the feeder's activity line).
 * - A street Piggy's name is everyone's, and so is a shared Chicken's, Butterfly's or Batterfly's
 *   (objects_pigs.go nameAnimal; items/include/animal_naming.js):
 *   animal-husbandry-feature's Name Me! / Rename Me! asks the server (sharedAnimalName) with the
 *   "ak5" perk; its word (who may rename within the hour, the word filter) wins, the name comes back
 *   in the Piggy's state for everyone (applyPigState), the label reads "A Piggy Named ...", and the
 *   others see the 'And they shall call me' bubble (obj_ev "name"). The namer's counters and
 *   activity line run on the go-ahead (animal-husbandry-feature's sharedNameLanded).
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
  guanoPiles,
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
} from '../street-objects.js?v=754d0911';
import { ROCK_CATALOG } from '../mining.js?v=b28fef74';
import { TRANT_META, trantStatusLabel } from '../trants.js?v=4d6f5593';
import { quoteWoodTreeHarvest } from '../woodcutting.js?v=ee35a30a';
import { highestLightGreenThumbRank, quoteTrantCare } from '../trant-care.js?v=6ee0b0f5';
import { animalStatusLabel, pickerMaxCount } from '../animals.js?v=b23aee62';
import { highestAnimalKinshipRank, quoteAnimalKinship } from '../animal-kinship.js?v=44416a29';
import { CREW_NODES } from '../help-dig.js?v=93d6358d';
import { animalPatrolRange, ANIMAL_BODY, TREE_FOOTPRINT } from '../street-ecology.js?v=c8d6fa5b';
import { INCUBATION, PIGGY_FEED, itemBaseCost, namedAnimalLabel, resetIncubation } from '../animal-husbandry.js?v=b1efd9e0';
import {
  applyCreatureState,
  batterflyAt,
  batterflyPerks,
  CREATURE_PATHS,
  chickenSeed,
  chickenWalkAt,
  piggyAt,
  PIGGY_TRIP,
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
  WALKER_REACH,
  crabWalkAt,
  dragonWalkAt,
  kittyWalkAt,
  walkerSpan,
} from '../street-creatures.js?v=fc1d4f00';

export const STREET_OBJECTS_FEATURE_ID = 'street-objects';
const RECONCILE_MS = 250;
/** No snapshot for the street joined in this long (a dropped obj_sync): ask again. */
const SYNC_RETRY_MS = 3000;
/** States in which the site has no live street at all: the local rules apply. */
const LOCAL_STATES = new Set(['off', 'signed-out', 'replaced', 'other-character', 'stopped']);

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
    if (spr) delete spr._pathStand;
    if (spr) delete spr._walkerPath;
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
    // Someone named it (animal_naming.js 49, a bubble with no pc: everyone sees it); the name itself comes as objs.
    if (NAMEABLE_KINDS.has(obj.kind) && msg.ev === 'name') {
      if (Number(msg.by) === Number(client?.me?.id)) return;
      const name = typeof msg.name === 'string' ? msg.name.slice(0, 32) : '';
      if (name && obj.target?.sprite && !obj.target.sprite.destroyed) engine.say?.(obj.target, nameBubble(name), 5000);
      lastAnswer = `${obj.id}:name:seen`;
      publish(engine);
      return;
    }
    if (obj.kind === 'chicken' || obj.kind === 'butterfly' || obj.kind === 'batterfly' || obj.kind === 'kitty' || obj.kind === 'crab' || obj.kind === 'dragon') {
      creatureEvent(engine, obj, msg);
      return;
    }
    // G605: someone else's Potion of Animal Youth: the poof where it stood (its gone state comes as objs).
    if (obj.kind === 'pig' && msg.ev === 'youth' && Number(msg.by) !== Number(client?.me?.id)) {
      engine.query?.('sharedYouthSeen', obj.target, msg, engine);
      lastAnswer = `${obj.id}:youth:seen`;
      publish(engine);
      return;
    }
    // G605: a Plop the server placed for this Piggy; the feeder hears it (doPlop 1347-1349).
    if (obj.kind === 'pig' && msg.ev === 'plop') {
      if (Number(msg.by) === Number(client?.me?.id)) engine.pushActivity?.(`The ${obj.state?.userName || 'Piggy'} plopped on the ground!`);
      lastAnswer = `${obj.id}:plop:${msg.seed || ''}:${Number(msg.n) || 0}`;
      publish(engine);
      return;
    }
    if (obj.kind === 'pig' && msg.ev === 'capture') {
      lastAnswer = `${obj.id}:capture:seen`;
      publish(engine);
      return;
    }
    // Someone else's pet, nibble or feed: this player sees it happen (G334; its hold comes as objs).
    if (obj.kind === 'pig' && (msg.ev === 'pet' || msg.ev === 'nibble' || msg.ev === 'feed') && Number(msg.by) !== Number(client?.me?.id)) {
      if (obj.target?.sprite && !obj.target.sprite.destroyed) {
        if (msg.ev === 'feed') engine.query?.('sharedAnimalEvent', obj.target, { ev: 'fed' }, engine);
        else engine.playVerbAnimation?.(obj.target, msg.ev, 1500);
      }
      lastAnswer = `${obj.id}:${msg.ev}:seen`;
      publish(engine);
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
  // G605: street Piggies hidden while the server says they are gone are still the server's, so
  // their return reaches them (animal-husbandry-feature keeps them out of interactables meanwhile).
  const hidden = engine.query?.('sharedGonePiggies', engine) || [];
  const list = hidden.length ? [...(engine.interactables || []), ...hidden.filter((t) => !(engine.interactables || []).includes(t))] : engine.interactables || [];
  for (const t of list) {
    if (Number.isInteger(t.rockIndex) && t.state?.rock && ROCK_CATALOG[t.classId]) {
      out.push({ id: rockId(t.rockIndex), kind: 'rock', target: t, classId: t.classId, rock: t.state.rock });
    } else if (Number.isInteger(t.treeIndex) && TRANT_META[t.classId] && t.state) {
      out.push({ id: treeId(t.treeIndex), kind: 'tree', target: t, classId: t.classId, state: t.state, index: t.treeIndex });
    } else if (Number.isInteger(t.treeIndex) && t.classId === 'wood_tree' && !t.grownFromBean && t.state) {
      out.push({ id: treeId(t.treeIndex), kind: 'wood', target: t, classId: t.classId, state: t.state, index: t.treeIndex });
    } else if (t.classId === 'npc_piggy' && t.state) {
      const i = streetPigIndex(t, engine.streetTsid);
      if (i >= 0) out.push({ id: pigId(i), kind: 'pig', target: t, classId: t.classId, state: t.state, index: i, me: client?.me?.id || 0 });
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
      // Walking, or the pause its path is in, at the frame every page shows (game.js spawnChickens
      // walkPose, js/chicken-idles.js). Held for someone at it, it stops and looks, the source's
      // 'verb' (npc_chicken.js onWaitStart 1630-1638); held on an egg it stands.
      const held = Number(t.sharedPath?.holdEnd) > Date.now() + (Number(copy.offset) || 0);
      if (held) spr.walkPose?.(t.state?.incubatingEgg ? 'stand' : 'verb');
      else spr.walkPose?.(p.pose, p.poseMs);
      return true;
    };
  } else if (obj.kind === 'pig') {
    // G334: its spot and walk from the street's plan (game.js enterStreet, street-ecology.js
    // animalPatrolRange), the same for everyone; its rooting on the path (js/street-creatures.js
    // piggyWalkAt), and its walks to food and home when the server sends one (piggyAt: the trip). A
    // Piggy held here its own way (a sulk, the Rook, an older server's walk to food: animal-mood-feature
    // hold, a creeping vx) leaves the path, and comes back to it when let go.
    if (!copy.pigPaths) return;
    const spot = engine.placement?.('piggies')?.[obj.index];
    // The server's numbers for its walk when it gives them (the snapshot's homes and trunks: spot
    // drift between builds, research/plans/street-animals-shared.md section 5), else this page's plan.
    const given = Array.isArray(copy.homes?.[obj.id]) ? copy.homes[obj.id].map(Number) : null;
    const trunks = copy.trunks || (engine.placement?.('trees') || []).map((p) => p?.x).filter(Number.isFinite);
    const home = {
      baseX: given && Number.isFinite(given[0]) ? given[0] : Number.isFinite(spot?.x) ? spot.x : spr.baseX,
      range: given && Number.isFinite(given[1]) ? given[1] : spot ? animalPatrolRange('piggies', spot.room) : (spr.range || CREATURE_PATHS.pig.range),
      speed: CREATURE_PATHS.pig.speed,
      dir: obj.index % 2 ? -1 : 1,
      trunks,
      trunkPx: TREE_FOOTPRINT / 2 + ANIMAL_BODY.piggies / 2,
    };
    if (!Number.isFinite(home.baseX)) return;
    const seed = chickenSeed(obj.index, home.baseX);
    // On its walk to food and home when the server sent one (js/street-creatures.js piggyAt), else on its walk.
    pointAt = () => piggyAt(home, pathTime(t.sharedPath, Date.now(), copy.offset), seed, t.sharedPath?.trip || null);
    // A trip walks a little faster than the patrol: the frame's step follows its pace.
    const tripStep = (PIGGY_TRIP.speed / 60) * 1.25;
    step = (dt) => {
      if (Math.abs(spr.vx || 0) < 0.01) return false;
      const p = pointAt();
      spr.x = followPath(spr.x, p.x, dt, p.phase ? Math.max(PATH_STEP.pig, tripStep) : PATH_STEP.pig);
      spr.vx = p.dir * Math.abs(spr.vx || 0.45);
      const bs = spr.baseScale ?? Math.abs(spr.scale.y);
      spr.scale.x = p.dir * bs;
      spr.scale.y = Math.abs(bs);
      // Walking, rooting or at its food; held for someone at it, it stands (npc_animal onWaitStart 2048-2054).
      const held = Number(t.sharedPath?.holdEnd) > Date.now() + (Number(copy.offset) || 0);
      engine.query?.('piggyPathPose', t, held && p.pose === 'walk' ? 'stand' : p.pose, engine);
      return true;
    };
    spr._pathStand = () => engine.query?.('piggyPathPose', t, 'stand', engine);
    // On its path from the first frame, not sliding there from its spot (a reload, a street change).
    if (Math.abs(spr.vx || 0) >= 0.01) spr.x = pointAt().x;
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
  if (obj.kind === 'kitty' || obj.kind === 'crab' || obj.kind === 'dragon') {
    // A Heli Kitty, a Crab (slice 2) or a Fire Dragon (slice 3): its spot is the server's, its walk the run of floor from
    // there (js/street-creatures.js walkerSpan), its pauses rolled from a seed every page shares
    // (kittyWalkAt, crabWalkAt). Its feature draws it from spr._walkerPath() (the place, heading,
    // pose, and whether someone holds it) instead of its own wander.
    const spot = copy.spots?.[obj.id];
    if (!Array.isArray(spot) || !spot.every((n) => Number.isFinite(Number(n)))) return;
    const [sx, sy] = spot.map(Number);
    const span = walkerSpan(engine.platforms, sx, sy, { worldW: Number(engine.worldW) || 0, ...WALKER_REACH[obj.kind] });
    const home = { l: span.l, r: span.r, x0: sx, y0: sy, dir: obj.index % 2 ? 1 : -1 };
    const seed = chickenSeed(obj.index, sx);
    const walkAt = obj.kind === 'kitty' ? kittyWalkAt : obj.kind === 'dragon' ? dragonWalkAt : crabWalkAt;
    pointAt = () => ({
      ...walkAt(home, pathTime(t.sharedPath, Date.now(), copy.offset), seed),
      held: Number(t.sharedPath?.holdEnd) > Date.now() + (Number(copy.offset) || 0),
      y0: sy,
    });
    spr._walkerPath = pointAt;
    spr._pathPoint = pointAt;
    spr._pathHold = () => (Number(t.sharedPath?.holdEnd) || 0) - (Date.now() + (Number(copy.offset) || 0));
    pathed.add(spr);
    return;
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
/** The animals this screen holds, by id: { at: last wait sent, stop: the path's clock it stopped at }. */
let waitSent = new Map();
function waitAtCreature(engine, c, wall) {
  if (c.state !== 'online' || !copy.creatures) return;
  // The one a player is at, and any Heli Kitty or Crab its feature holds here (a Crab listening to
  // a tune through its headphones: crabs-feature sets target.sharedHold), held for everyone.
  const held = [engine.interactionTarget?.(), ...(engine.interactables || []).filter((x) => x?.sharedHold === true)];
  const now = new Set();
  for (const t of held) {
    if (!t) continue;
    // A street Piggy (G334): the same, when the server keeps its path.
    const pig = copy.pigPaths ? streetPigIndex(t, engine.streetTsid) : -1;
    const a = pig >= 0 ? { id: pigId(pig), kind: 'pig' } : creatureOf(t);
    if (!a || a.kind === 'batterfly' || now.has(a.id) || (a.kind !== 'pig' && !copy.animals.has(a.id)) || !(t.sprite?._path || t.sprite?._walkerPath)) continue;
    now.add(a.id);
    // The first frame at it: where its path stood when this screen stopped it.
    let w = waitSent.get(a.id);
    if (!w) waitSent.set(a.id, (w = { at: 0, stop: serverPathClock(t.sharedPath, wall, copy.offset) }));
    if (wall - w.at < WAIT_EVERY_MS) continue;
    reqSeq += 1;
    if (c.send('obj_act', actMessage({ req: reqSeq, id: a.id, verb: 'wait', at: w.stop }))) w.at = wall;
  }
  for (const id of [...waitSent.keys()]) if (!now.has(id)) waitSent.delete(id);
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
  // Someone petted a Heli Kitty (it curls up asleep) or flattered, hugged, insulted or pinched a Crab.
  else if (obj.kind === 'kitty' || obj.kind === 'crab' || obj.kind === 'dragon') engine.query?.('walkerVerbSeen', t, ev, engine);
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
    if (obj.kind !== 'chicken' && obj.kind !== 'butterfly' && obj.kind !== 'batterfly' && obj.kind !== 'kitty' && obj.kind !== 'crab' && obj.kind !== 'dragon' && !(obj.kind === 'pig' && copy.pigPaths)) continue;
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
    if (obj.target) {
      obj.target.subtitle = animalStatusLabel('npc_piggy', obj.state);
      // animal_naming.js getLabel: "A Piggy Named Wilbur", the server's name for everyone.
      obj.target.label = namedAnimalLabel('npc_piggy', obj.state);
      // G605: gone for everyone (captured, or a Piglet now) until the next game day, then back.
      engine.query?.('sharedPigGone', obj.target, Boolean(obj.state.sharedGone), engine);
    }
    setPath(engine, obj);
  } else if (obj.kind === 'chicken' || obj.kind === 'butterfly') {
    if (obj.target) {
      obj.target.subtitle = sharedCreatureLabel(obj.classId, obj.state) || animalStatusLabel(obj.classId, obj.state);
      obj.target.label = namedAnimalLabel(obj.classId, obj.state);
    }
    setPath(engine, obj);
  } else if (obj.kind === 'batterfly') {
    if (obj.target) obj.target.label = namedAnimalLabel(obj.classId, obj.state);
    setPath(engine, obj);
  } else if (obj.kind === 'kitty' || obj.kind === 'crab' || obj.kind === 'dragon') {
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
  if (obj.kind === 'wood') {
    // Its care toward the next maturity (+pets/waters), when it has any.
    const care = obj.state.carePets || obj.state.careWaters ? `+${obj.state.carePets || 0}/${obj.state.careWaters || 0}` : '';
    return `${obj.id}=m${obj.state.maturity}c${obj.state.harvestCount || 0}${care}${deathView(obj.state)}`;
  }
  if (obj.kind === 'pig') return `${obj.id}=m${obj.state.mood}h${obj.state.hunger}${obj.state.hasBeenPetted ? 'p' : ''}${obj.state.userName ? `~${obj.state.userName}` : ''}`;
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
    if (base === 'capture' && verbId === base) {
      // animal-husbandry-feature checked the player's own side first (Herdkeeping, bait, energy, cooldowns).
      return { id: pigId(pig), ready: () => true, perks: learned.includes('herdkeeping_1') ? ['herd'] : [] };
    }
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
    if (verbId === 'harvest') {
      return {
        id: treeId(target.treeIndex),
        ready: () => quoteWoodTreeHarvest(target.state, engine.inv, engine.pc, engine.toolState).ok,
      };
    }
    if (verbId !== 'pet' && verbId !== 'water') return null;
    // A street Wood Tree's care counts on the server for everyone (objects.go tendWood); this
    // player's own 5-minute clock, can and energy refuse here first, as in solo.
    return {
      id: treeId(target.treeIndex),
      ready: () => quoteTrantCare(target.state, 'wood_tree', verbId, { pc: engine.pc, inv: engine.inv, tools: engine.toolState, learned }).ok,
      skill: highestLightGreenThumbRank(learned) === 'no_skill' ? '' : highestLightGreenThumbRank(learned),
    };
  }
  if (target.resourceKey) {
    const n = (engine.query?.('streetResourceNodes', engine) || []).find((row) => row.target === target);
    if (!n || !sharedNodeVerb(n.classTsid, verbId)) return null;
    return {
      id: nodeId(n.key),
      ready: () => n.ready(verbId),
      reason: () => n.reason?.(verbId) || '',
      perks: nodePerks(n.classTsid, verbId, { upgrades, buffs: engine.activeBuffIds?.() || [] }),
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
  else if (obj.kind === 'pig') {
    applyPigState(obj.state, s, now, { me: client?.me?.id || 0 });
    if (copy.pigPaths && obj.target) obj.target.sharedPath = pathFrom(s, now, copy.offset);
  } else if (obj.kind === 'chicken' || obj.kind === 'butterfly' || obj.kind === 'batterfly') {
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
  // The Guano under a Batterfly (sharedGuanoPick): the server gave this player the pile and credited
  // it, so it goes into the pack once, even when the answer comes late or the player has walked on.
  if (msg.verb === 'pickup') {
    if (ok) engine.query?.('sharedGuanoPicked', Math.max(0, Math.floor(Number(msg.take) || 0)), engine);
    else if (p) {
      const line = String(msg.message || 'Not now.');
      engine.toast?.(line, 2600);
      engine.pushActivity?.(line);
      engine.playSound?.('CLICK_FAILURE', { volume: 0.45 });
    }
    if (shared(engine)) reconcileAll(engine);
    return;
  }
  if (!p || copy.street !== engine.streetTsid) return;
  // G605: a Potion of Animal Youth poured on a street Piggy (sharedPigYouth): the bottle and the
  // poof are potions-feature's on the go-ahead; the Piglet comes as a shared ground stack.
  if (p.youth) {
    if (!ok) {
      engine.toast?.(String(msg.message || 'Not now.'), 2600);
      engine.query?.('youthRefused', p.target, engine);
      reconcileAll(engine);
      return;
    }
    const obj = localObjects(engine).find((row) => row.id === msg.id && row.target === p.target);
    if (obj) {
      const s = stateFor(copy, obj.id, Date.now());
      if (s) applyKnown(obj, s);
      seen.set(stateKey(obj), copy.version);
      dirty.delete(obj.id);
    }
    engine.query?.('youthGranted', p.target, msg, engine);
    if (obj) redraw(engine, obj);
    return;
  }
  // A name for a street Piggy (sharedAnimalName): the namer's side runs on the go-ahead, no verb to replay.
  if (p.naming) {
    if (!ok) {
      if (msg.code !== 'unchanged') engine.toast?.(String(msg.message || 'Not now.'), 2600);
      reconcileAll(engine);
      return;
    }
    const obj = localObjects(engine).find((row) => row.id === msg.id && row.target === p.target);
    if (obj) {
      const s = stateFor(copy, obj.id, Date.now());
      if (s) applyKnown(obj, s);
      seen.set(stateKey(obj), copy.version);
      dirty.delete(obj.id);
      redraw(engine, obj);
    }
    engine.query?.('sharedNameLanded', p.target, String(msg.name || ''), engine);
    return;
  }
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
  grant = { target: p.target, verbId: p.verbId, roll: Number(msg.roll), chunks: Number.isInteger(msg.chunks) ? msg.chunks : undefined, help: msg.help && typeof msg.help === 'object' ? msg.help : null, use: msg.use && typeof msg.use === 'object' ? msg.use : null, guano: Number.isInteger(msg.guano) ? msg.guano : undefined, matured: msg.matured === true ? Math.max(0, Math.floor(Number(msg.maturity) || 0)) : 0 };
  // G335 slice 5: food the ledger took for a Piggy or a Batterfly, or the egg a Chicken sits on,
  // leaves the pack with the verb below, once (the trade slice's applied list holds its op, so the
  // site counts it as applied).
  if (grant.use?.spent && grant.use.n && (/^(feed|incubate):/.test(String(p.verbId)) || p.verbId === 'capture')) engine.query?.('ledgerReceipt', String(grant.use.op || ''), engine);
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
 * game.js beginVerbAction, before the swing (#214): a shared verb still waiting on the server's
 * answer for the same object does not start again, and one the player's own side now refuses (the
 * day's harvest of a Peat Bog, landed with that answer) is refused before the swing with its line,
 * as Glitch checked a verb's conditions before its handler ran (peat_1.js harvest conditions).
 * Null when the verb is local or may start.
 */
function refusedNow(engine, target, verbId) {
  if (engine.mode !== 'multiplayer' || target?.yardVisit) return null;
  if (grant && grant.target === target && grant.verbId === verbId) return null;
  const c = bind(engine);
  if (!c || LOCAL_STATES.has(c.state) || !roomIsStreet(engine, c)) return null;
  const verb = sharedVerbOn(engine, target, verbId);
  if (!verb || !shared(engine)) return null;
  for (const p of pending.values()) {
    if (p.id === verb.id && !p.silent) return COPY.busy;
  }
  if (verb.ready()) return null;
  return verb.reason?.() || null;
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

/** The street animals the server names (objects_pigs.go nameAnimal; animal_naming.js is in each one's includes). */
const NAMEABLE_KINDS = new Set(['pig', 'chicken', 'butterfly', 'batterfly']);

/** animal_naming.js onInputBoxResponse 49: the bubble a newly named animal says. */
function nameBubble(name) {
  return `And they shall call me "${name}"`;
}

/**
 * Name Me! / Rename Me! on a street Piggy, Chicken, Butterfly or Batterfly the server holds
 * (objects_pigs.go nameAnimal): true when asked (or refused for now: connecting, busy), null when
 * the name is the page's own (solo, a released or raised animal, a street the server does not share).
 */
function askName(engine, target, value) {
  if (engine.mode !== 'multiplayer' || target?.yardVisit) return null;
  const c = bind(engine);
  if (!c || LOCAL_STATES.has(c.state) || !roomIsStreet(engine, c)) return null;
  if (copy.none && copy.street === engine.streetTsid) return null;
  const pig = target?.classId === 'npc_piggy' ? streetPigIndex(target, engine.streetTsid) : -1;
  const animal = pig < 0 ? creatureOf(target) : null;
  let id = '';
  if (pig >= 0) {
    id = pigId(pig);
    if (!shared(engine) || !copy.objs.has(id)) {
      engine.toast?.(COPY.connecting, 2400);
      return true;
    }
  } else if (animal && NAMEABLE_KINDS.has(animal.kind)) {
    if (!shared(engine)) {
      engine.toast?.(COPY.connecting, 2400);
      return true;
    }
    // Only an animal this street's snapshot named is the server's; any other stays the page's own.
    if (!copy.animals.has(animal.id)) return null;
    id = animal.id;
  } else return null;
  for (const p of pending.values()) {
    if (p.id === id && !p.silent) {
      engine.toast?.(COPY.busy, 1600);
      return true;
    }
  }
  reqSeq += 1;
  // canName 6: the client says Animal Kinship V, as "ak6" for a nibble.
  const perks = (engine.learnedSkills || []).includes('animalkinship_5') ? ['ak5'] : [];
  if (!c.send('obj_act', actMessage({ req: reqSeq, id, verb: 'name', perks, name: value }))) {
    engine.toast?.(COPY.connecting, 2400);
    return true;
  }
  pending.set(reqSeq, { id, target, verbId: 'name', naming: true, at: Date.now() });
  return true;
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
          if (!spr || (obj.kind !== 'chicken' && obj.kind !== 'butterfly' && obj.kind !== 'batterfly' && !(obj.kind === 'pig' && copy.pigPaths))) continue;
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

  /** game.js beginVerbAction: a verb on an object still waiting on the server, or now refused, does not swing (#214). */
  verbRefusedNow(target, verbId, engine) {
    return refusedNow(engine, target, verbId);
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

  /**
   * potions-feature, G605: a Potion of Animal Youth poured on a street Piggy the server holds asks it
   * (k: the bottle, its place among the player's bottles). True when asked (or refused for now),
   * null when the Piggy is the page's own.
   */
  sharedPigYouth(target, k, engine) {
    if (engine?.mode !== 'multiplayer' || target?.classId !== 'npc_piggy' || target.husbandryAnimal) return null;
    const c = bind(engine);
    if (!c || LOCAL_STATES.has(c.state) || !roomIsStreet(engine, c)) return null;
    const pig = streetPigIndex(target, engine.streetTsid);
    if (pig < 0 || (copy.none && copy.street === engine.streetTsid)) return null;
    const id = pigId(pig);
    if (!shared(engine) || !copy.objs.has(id)) {
      engine.toast?.(COPY.connecting, 2400);
      return true;
    }
    for (const p of pending.values()) {
      if (p.id === id && !p.silent) {
        engine.toast?.(COPY.busy, 1600);
        return true;
      }
    }
    reqSeq += 1;
    if (!c.send('obj_act', actMessage({ req: reqSeq, id, verb: 'youth', k: Number.isInteger(k) && k >= 0 ? k : null }))) {
      engine.toast?.(COPY.connecting, 2400);
      return true;
    }
    pending.set(reqSeq, { id, target, verbId: 'youth', youth: true, at: Date.now() });
    return true;
  },

  /** animal-husbandry-feature's name modal: a street Piggy's name asks the server (askName). */
  sharedAnimalName(target, value, engine) {
    return askName(engine, target, value);
  },

  /**
   * animal-husbandry-feature: who keeps this street's hourly Batterfly Guano. { since, piles, spots }
   * when the realtime server keeps one pile under each Batterfly for everyone (objects_guano.go):
   * since is the Unix ms its clocks started, piles the Guano under each ({"batterfly:0": 3}) and
   * spots each Batterfly's place, the same for everyone. False when this page's own clock runs as in
   * solo (a server from before the shared pile, a street the server has no layout for, a site with
   * no realtime). Null while that is not known yet (connecting, the snapshot not here): then
   * neither clock moves, so nothing is made twice.
   */
  sharedGuano(engine) {
    if (!engine || engine.mode !== 'multiplayer') return false;
    const c = bind(engine);
    if (!c) return null;
    if (c.state === 'off') return false;
    if (c.state !== 'online' || !copy.snap || copy.street !== engine.streetTsid) return null;
    const piles = guanoPiles(copy);
    return piles ? { since: copy.guano, piles, spots: copy.spots || {} } : false;
  },

  /**
   * animal-husbandry-feature: pick up the Guano under a street Batterfly (target: the Batterfly).
   * True when the server was asked (or refused for now: busy), null when the pile is not the
   * server's. The answer runs sharedGuanoPicked with what it gave.
   */
  sharedGuanoPick(target, engine) {
    const a = creatureOf(target);
    if (!a || a.kind !== 'batterfly' || !shared(engine) || !guanoPiles(copy) || !copy.animals.has(a.id)) return null;
    for (const p of pending.values()) {
      if (p.id === a.id && !p.silent) {
        engine.toast?.(COPY.busy, 1600);
        return true;
      }
    }
    reqSeq += 1;
    if (!client.send('obj_act', actMessage({ req: reqSeq, id: a.id, verb: 'pickup' }))) {
      engine.toast?.(COPY.connecting, 2400);
      return true;
    }
    pending.set(reqSeq, { id: a.id, target, verbId: 'pickup', at: Date.now() });
    return true;
  },

  /** Whether the server holds this street Piggy (animal-mood-feature leaves its ticks to it). */
  sharedPiggy(target, engine) {
    if (!engine || engine.mode !== 'multiplayer' || !shared(engine)) return null;
    const i = streetPigIndex(target, engine.streetTsid);
    return i >= 0 && copy.objs.has(pigId(i)) ? true : null;
  },

  /**
   * Whether the server walks this street's Piggies to food (slice 1 of
   * research/plans/street-animals-shared.md: their state's trip, drawn by setPath): then this page
   * starts no walk of its own, and a Piggy's "ate" is only its chew and "Yum!".
   */
  sharedPiggyTrips(target, engine) {
    if (!shared(engine) || !copy.pigPaths || !copy.pigTrips) return null;
    if (target && !streetObjectsFeature.sharedPiggy(target, engine)) return null;
    return true;
  },

  /**
   * A fruiting street tree this player harvested, watered or petted (animal-mood-feature onEvent,
   * onContainerItemStateChanged): the server sends the street's hungry Piggies to it, for everyone.
   */
  sharedPiggyFood(trant, engine) {
    if (!streetObjectsFeature.sharedPiggyTrips(null, engine) || !Number.isInteger(trant?.treeIndex)) return null;
    const c = client;
    if (!c || c.state !== 'online') return null;
    reqSeq += 1;
    if (!c.send('obj_act', actMessage({ req: reqSeq, id: treeId(trant.treeIndex), verb: 'food' }))) return null;
    lastAnswer = `${treeId(trant.treeIndex)}:food:sent`;
    publish(engine);
    return true;
  },

  /** The server's clock now (ms) while this street's objects are shared, else null (resource-nodes-feature's Salmon). */
  sharedClockNow(engine) {
    if (!shared(engine)) return null;
    return Date.now() + (Number(copy.offset) || 0);
  },

  /**
   * A verb on a shared Heli Kitty or Crab landed here (heli-kitties-feature's pet, crabs-feature's
   * flatter, hug, insult, pinch): what it gave stays this player's (the local rules ran); the server
   * holds the animal for everyone and the others see it (objects_creatures.go tendWalker).
   */
  sharedWalkerVerb(target, verb, engine) {
    const a = creatureOf(target);
    if (!a || (a.kind !== 'kitty' && a.kind !== 'crab' && a.kind !== 'dragon') || !shared(engine) || !copy.animals.has(a.id)) return null;
    reqSeq += 1;
    if (!client.send('obj_act', actMessage({ req: reqSeq, id: a.id, verb: String(verb || '') }))) return null;
    pending.set(reqSeq, { id: a.id, target, verbId: String(verb || ''), at: Date.now(), silent: true });
    return true;
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
   * their new state. G564 slice 2: trees and dead trees in shared street Patches (target.sharedPatch,
   * shared-patches-feature's) go the same way, even on a street with no shared street trees: the
   * full jar revives the dead ones and grows the living ones there (patches_trees.go), Lite names
   * one by its plot key. True when the server was asked, null when the trees are local (solo, a
   * private place, a tree in your own Patch).
   */
  sharedFertilize(targets, lite, engine, classTsid = lite ? 'fertilidust_lite' : 'fertilidust', copy = null) {
    if (!engine || engine.mode !== 'multiplayer') return null;
    const patchTrees = (targets || []).filter((t) => typeof t?.sharedPatch === 'string' && t.sharedPatch);
    if (!shared(engine) && !patchTrees.length) return null;
    const trees = shared(engine) ? (targets || []).filter(isStreetTree) : [];
    if (!trees.length && !patchTrees.length) return null;
    if (lite && trees.length + patchTrees.length !== 1) return null;
    const c = bind(engine);
    if (!c || c.state !== 'online') return null;
    for (const p of pending.values()) {
      if (p.verbId === 'dust') {
        engine.toast?.(COPY.busy, 1600);
        return true;
      }
    }
    reqSeq += 1;
    const msg = { req: reqSeq };
    if (lite) msg.id = trees.length ? treeId(trees[0].treeIndex) : String(patchTrees[0].sharedPatch);
    // The jar used (its place among the class's jars in pack order): the ledger uses that one's charge.
    if (Number.isInteger(copy) && copy >= 0) msg.k = copy;
    if (!c?.send('obj_dust', msg)) return null;
    pending.set(reqSeq, { id: msg.id || 'dust', target: null, verbId: 'dust', classTsid, copy: Number.isInteger(copy) ? copy : null, at: Date.now() });
    return true;
  },

  /**
   * Help dig and Help scrape (features/help-mine-feature.js): who the server says is using a shared
   * crew node (a Dirt Pile, an Ice Nubbin, a barnacle, a Jellisac, a Peat Bog: js/help-dig.js CREW_NODES), or null.
   */
  sharedDiggers(target, engine) {
    if (!client || !copy.snap || copy.none || !target?.resourceKey || (engine && copy.street !== engine.streetTsid)) return null;
    const n = (engine?.query?.('streetResourceNodes', engine) || []).find((row) => row.target === target);
    if (!n || !CREW_NODES.has(n.classTsid)) return null;
    const s = stateFor(copy, nodeId(n.key));
    return Array.isArray(s?.diggers) ? s.diggers.map(Number) : [];
  },

  /** Tell the server a use of a shared crew node starts or stops (objects.go obj_dig: help, and a late landing paid). */
  sharedDigSwing(target, what, engine) {
    if (!client || !target?.resourceKey || (what !== 'start' && what !== 'stop')) return null;
    const n = (engine?.query?.('streetResourceNodes', engine) || []).find((row) => row.target === target);
    if (!n || !CREW_NODES.has(n.classTsid)) return null;
    return client.send('obj_dig', { id: nodeId(n.key), do: what }) !== false;
  },

  /** game.js runVerb: the server's rolls for the verb it just allowed (and, for a pour, the ledger's use of the bottle). */
  sharedVerbGrant(target, verbId) {
    if (!grant || grant.target !== target || grant.verbId !== verbId) return null;
    const out = { roll: Number.isFinite(grant.roll) ? grant.roll : undefined, chunks: grant.chunks, help: grant.help };
    if (grant.use) out.use = grant.use;
    // A Batterfly's feed: the Guano the shared food counter released (objects_creatures.go).
    if (Number.isInteger(grant.guano)) out.guano = grant.guano;
    // A street Wood Tree the care grew (objects.go tendWood "matured", "maturity").
    if (grant.matured) out.matured = grant.matured;
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
    waitSent = new Map();
  },
};
