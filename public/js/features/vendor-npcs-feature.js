/**
 * Vendor NPCs (register G121): the Gardening Tools Vendor, Meal Vendor, Tool
 * Vendor, Uncle Friendly, Helga and the Sno Cone Vending Machine stand where
 * the archived location objects put them (street-ecology.json `vendors`, 11
 * streets), each selling its own catalog_stores.js store (js/vendor-npcs.js).
 *
 * GameServerJS: items/npc_gardening_vendor.js, npc_cooking_vendor.js,
 * npc_tool_vendor.js, npc_jabba1.js, npc_jabba2.js,
 * npc_sno_cone_vending_machine.js (buy_sell opens store_id 12/16/11/13/15/5;
 * the scarecrow's attract() bubble; the machine's talk_to), and
 * items/include/npc_quests.js offerQuests: turn-ins first, then offers.
 * Uncle Friendly's quest verb is make_eye_contact; Helga has none.
 * Quests: Meet the Merchants (vendor_ping_pong_part1-4) and A Purple
 * Journey North. Their turn-ins wait for a talk here (quest-offers.js
 * heldForNpcTurnIn).
 *
 * Art: CC0 OGA sheets cut by tools/vendor-npc-art.mjs (idle loop + talk, and the walk, turn,
 * stop, impatient and attract strips).
 *
 * Walking (G680, js/vendor-walk.js): each walks its run of floor by its class's source rules, on
 * a seeded round from the wall clock, so pages with the same spot agree. It stops while you are at
 * it (its verb menu, a verb, its store, its talk), faces you where its art can turn, and walks on
 * 1.5 s after (onWaitEnd), from where it stopped. The scarecrow never walked in Glitch and stands.
 * Online the walk is not on the server: a stop holds it on this page only (see the report on G680
 * for what objects_creatures.go would need to share it).
 *
 * QA: ?autostart=1&fresh=1&resetgame=1&questoffer=off&streetdemo=<tsid>
 * on a vendor street (GCR101UN0NJ1QPQ Middle Arbor, GIF12PMQ5121D68
 * Cebarkul, GLI101QQRA211SM Level 2 East, GM4118MEHFDMM Uncle Friendly's
 * Emporium, GM413RQ6LRG9N West Spice, GM11E7ODKHO1QJE Wintry Place), or
 * &vendornpcdemo=<class> to stand one beside the player on any street.
 * &vendornpcautoplay=goto stands the player beside it; shop opens its store,
 * talk runs its quest or talk verb (comma-separated, e.g. goto,shop), after
 * &vendornpcwait=<ms> (default 2500). Canvas: vendorNpcs, vendorNpcShop,
 * vendorNpcLast, vendorNpcWalk (class:pose:facing:x:held). &vendorwalkfrom=<ms> starts each vendor that far into its round (screenshots).
 */

import { createSheetLoader, pixiSpeed } from '../sprite-sheets.js?v=b4abfbf2';
import { loadWildlifeCatalog, wildlifeCatalog } from '../wildlife.js?v=670c3a7f';
import { VENDOR_PROFILES } from '../vendor.js?v=dc7d6463';
import { addItem, countItem, removeItem } from '../inventory.js?v=f49c8998';
import { parseQuestConversation } from '../quests.js?v=40c71a37';
import { getQuestCatalog } from '../content-catalogs.js?v=10b118dd';
import {
  acceptOffer,
  declineOffer,
  heldForNpcTurnIn,
  npcQuestOffers,
  questAwardPayload,
  turnInQuest,
} from '../quest-offers.js?v=89511e1e';
import {
  GOT_QUEST_TEXT,
  VENDOR_NPCS,
  VENDOR_NPC_ART,
  VENDOR_PLACEMENT_KEY,
  vendorAnchor,
  vendorNpcList,
  vendorNpcPlacementGroups,
  vendorNpcStoreProfile,
  vendorNpcsFor,
  vendorSheet,
  vendorStates,
  vendorStreetsFor,
  vendorStrip,
} from '../vendor-npcs.js?v=7cfca6a9';
import { itemZ } from '../item-bands.js?v=e98b10bc';
import { chickenSeed, walkerSpan } from '../street-creatures.js?v=f0568fb4';
import { landingY, walkSurfaceY } from '../walk-surface.js?v=106bfdc5';
import { GAME_EPOCH_MS } from '../game-day.js?v=cf9afac0';
import {
  VENDOR_POSES,
  VENDOR_REACH,
  clipMs,
  faceToward,
  holdVendor,
  releaseVendor,
  vendorClip,
  vendorClock,
  vendorHeld,
  vendorPlan,
  vendorWalkAt,
} from '../vendor-walk.js?v=babf9297';

export const VENDOR_NPCS_FEATURE_ID = 'vendor-npcs';
const ATTRACT_RADIUS = 200; // npc_gardening_vendor.js onPathing: players within 200px
const ATTRACT_GAP_MS = 5000; // attract(): at most once every 5 s
const ATTRACT_BUBBLE_MS = 5000;
// npc_gardening_vendor.js attract(): state 'attract', stopMoving after 5 s. npc_sno_cone_vending_machine.js
// attract_onRun: 'attract' for 3 s when a player walks into it while it idles (idle_onMsg player_collision).
const ATTRACT_POSE_MS = Object.freeze({ npc_gardening_vendor: 5000, npc_sno_cone_vending_machine: 3000 });
const ONCE_POSES = new Set(['turn', 'end']);

let loader = null;
let generation = 0;
/** { classTsid, sprite, target, clip, lastAttract, near, plan, x0, feetY, hold, facing, pose, attractUntil } */
let npcs = [];
let shopOpened = false;
let shopNpc = null;
let talking = null;
let last = '';
let demoUsed = false;
/** Quests this session has already routed (one route per quest a session, so a cleared route stays cleared). */
const routed = new Set();
let lastRouteCheck = 0;

function questCtx(engine) {
  const street = engine.street || {};
  return {
    level: engine.pc.level,
    xp: engine.pc.xp,
    skills: engine.learnedSkills,
    achievements: engine.unlockedAchievements,
    inv: engine.inv,
    buffs: engine.activeBuffIds?.() || [],
    hub: street.hubId || '',
    street: street.label || '',
    streetTsid: engine.streetTsid,
    now: Date.now(),
    pc: engine.pc,
    addItem,
    removeItem,
    countItem,
    customPrereq: (id, prereq) => engine.questCustomPrereq?.(id, prereq) === true,
  };
}

function sheetsFor(classTsid) {
  return vendorStates(classTsid).map((state) => vendorSheet(classTsid, state));
}

/**
 * Show a strip: its anchor (the feet stay on the idle strip's row), flipped to face the other way
 * where the art allows, `loop` or played once holding its last frame, from frame `at`.
 */
function setClip(engine, npc, state, { flip = false, loop = true, at = 0 } = {}) {
  const frames = loader.frames(vendorSheet(npc.classTsid, state));
  if (!frames.length || npc.sprite.destroyed) return false;
  npc.clip = state;
  npc.flip = flip;
  const anchor = vendorAnchor(npc.classTsid, state);
  npc.sprite.anchor.set(anchor.x, anchor.y);
  npc.sprite.scale.x = flip ? -Math.abs(npc.sprite.scale.x || 1) : Math.abs(npc.sprite.scale.x || 1);
  npc.sprite.textures = frames;
  npc.sprite.loop = loop;
  npc.sprite.animationSpeed = pixiSpeed(30);
  const f = Math.max(0, Math.floor(Number(at) || 0));
  npc.sprite.gotoAndPlay(loop ? f % frames.length : Math.min(frames.length - 1, f));
  return true;
}

/** How long each of a class's turn strips and its stop strip play (vendorPlan clips). */
function clipsFor(classTsid) {
  const ms = (pose, dir) => {
    const clip = vendorClip(classTsid, pose, dir);
    return clip ? clipMs(vendorStrip(classTsid, clip.state)?.frames) : 0;
  };
  return { turn: { 1: ms('turn', 1), '-1': ms('turn', -1) }, end: ms('end', 1) };
}

function spawn(engine, classTsid, point) {
  const { PIXI } = engine;
  const def = VENDOR_NPCS[classTsid];
  const crop = VENDOR_NPC_ART[classTsid].states.idle.crop;
  const spr = new PIXI.AnimatedSprite([PIXI.Texture.EMPTY]);
  const anchor = vendorAnchor(classTsid);
  spr.anchor.set(anchor.x, anchor.y);
  spr.x = point.x;
  spr.y = point.y + 2;
  spr.zIndex = itemZ(classTsid, 5);
  spr._worldHitW = Math.round(crop.w * 0.8);
  spr._worldHitH = Math.round(crop.h * 0.9);
  engine.entityLayer.addChild(spr);
  // Its walk (G680): the run of floor from its spot and a seeded round (js/vendor-walk.js).
  const span = walkerSpan(engine.platforms, point.x, point.y, { worldW: Number(engine.worldW) || 0, ...VENDOR_REACH });
  const plan = vendorPlan(classTsid, { l: span.l, r: span.r, x0: point.x }, chickenSeed(npcs.length, point.x), clipsFor(classTsid));
  const from = Math.max(0, Number(engine.param?.('vendorwalkfrom')) || 0);
  const npc = {
    classTsid,
    sprite: spr,
    target: null,
    clip: '',
    flip: false,
    lastAttract: 0,
    near: false,
    plan,
    x0: point.x,
    feetY: point.y,
    // QA: &vendorwalkfrom starts the round that far in (the clock runs from the epoch otherwise).
    hold: { lag: from && plan ? (((Date.now() - GAME_EPOCH_MS) % plan.ms) - (from % plan.ms) + plan.ms) % plan.ms : 0, since: 0, until: 0 },
    facing: VENDOR_POSES[classTsid]?.rest || 1,
    pose: '',
    poseKey: '',
    attractUntil: 0,
  };
  npc.target = engine.register({
    classId: classTsid,
    featureId: VENDOR_NPCS_FEATURE_ID,
    label: def.label,
    sprite: spr,
    vendorNpc: classTsid,
  });
  npcs.push(npc);
  stepNpc(engine, npc, Date.now());
  if (!npc.clip) setClip(engine, npc, 'idle');
  return npc;
}

/** Whether a player is at it now: its verb menu or a verb on it, its store, its talk, or its wave. */
function busyWith(engine, npc, now) {
  if (talking === npc || (shopOpened && shopNpc === npc)) return true;
  if (engine.actingOn?.(npc.target)) return true;
  return now < npc.attractUntil;
}

/**
 * One frame of a vendor: held while a player is at it (it stands, facing them where its art can
 * turn, and walks on 1.5 s after, onWaitEnd), else on its round (vendorWalkAt); then the pose's strip.
 */
function stepNpc(engine, npc, now) {
  const spr = npc.sprite;
  if (!spr || spr.destroyed) return;
  if (busyWith(engine, npc, now)) holdVendor(npc.hold, now);
  else releaseVendor(npc.hold, now);
  let pose;
  let dir = npc.facing;
  let poseMs = 0;
  if (npc.plan && !vendorHeld(npc.hold, now)) {
    const p = vendorWalkAt(npc.plan, vendorClock(npc.hold, now, GAME_EPOCH_MS), npc.x0);
    spr.x = p.x;
    pose = p.pose;
    dir = p.dir;
    poseMs = p.poseMs;
  } else {
    const p = engine.player;
    if (p && (talking === npc || engine.actingOn?.(npc.target) || (shopOpened && shopNpc === npc))) dir = faceToward(spr.x, p.x, npc.facing);
    pose = now < npc.attractUntil ? 'attract' : talking === npc ? 'talk' : 'idle';
  }
  // npc_can_fall is false: it keeps to its floor's line.
  const y = walkSurfaceY(engine.platforms, spr.x, npc.feetY, VENDOR_REACH);
  if (y != null) npc.feetY = y;
  spr.y = npc.feetY + 2;
  npc.facing = dir;
  let clip = vendorClip(npc.classTsid, pose, dir);
  if (!clip || !vendorStrip(npc.classTsid, clip.state)) {
    pose = 'idle';
    clip = vendorClip(npc.classTsid, 'idle', dir);
  }
  npc.pose = pose;
  const key = `${clip.state}|${clip.flip ? 1 : 0}`;
  if (key === npc.poseKey && npc.clip) return;
  // Join the pose where the round is, so every page shows the same frame of it.
  if (setClip(engine, npc, clip.state, { flip: clip.flip, loop: !ONCE_POSES.has(pose), at: (poseMs * 30) / 1000 })) npc.poseKey = key;
}

/** Street clear destroys the entity layer; only drop references (feature-host onStreetClear). */
function clear() {
  npcs = [];
  talking = null;
}

/** Offers this NPC can make and quests it can take back now. */
function questsFor(engine, classTsid) {
  if (!VENDOR_NPCS[classTsid]?.questVerb) return { offered: [], completable: [] };
  try {
    return npcQuestOffers(engine.questState, classTsid, engine.pc, questCtx(engine));
  } catch {
    return { offered: [], completable: [] };
  }
}

function openShop(engine, classTsid, npc = null) {
  const profile = vendorNpcStoreProfile(classTsid, VENDOR_PROFILES);
  if (!profile) return false;
  engine.openShop(profile);
  shopOpened = true;
  shopNpc = npc || npcs.find((n) => n.classTsid === classTsid) || null;
  last = `shop:${profile.key}`;
  engine.setData('vendorNpcShop', profile.key);
  return true;
}

function speak(engine, npc) {
  if (npc) talking = npc;
}

function turnIn(engine, npc, row) {
  const def = row.def;
  const finish = () => {
    const done = turnInQuest(engine.questState, row.classTsid, engine.pc, questCtx(engine));
    if (!done.ok) {
      last = `turnin-failed:${row.classTsid}:${done.reason}`;
      return;
    }
    engine.playSound('COMPLETE_QUEST_REQUIREMENT', { volume: 0.6 });
    engine.award(questAwardPayload(def, done.rewards || {}));
    engine.pushActivity(`Quest complete: ${def.title}`);
    engine.refreshPack();
    engine.save();
    last = `turnin:${row.classTsid}`;
  };
  const beats = parseQuestConversation(def.completion || '');
  if (!beats.length) {
    finish();
    return;
  }
  speak(engine, npc);
  engine.scriptedDialogue({ title: def.title, kicker: VENDOR_NPCS[npc.classTsid].label, beats, onComplete: finish });
}

function offer(engine, npc, card) {
  speak(engine, npc);
  last = `offer:${card.classTsid}`;
  engine.offerQuestDialogue({
    title: card.def.title,
    kicker: VENDOR_NPCS[npc.classTsid].label,
    beats: card.beats,
    acceptLabel: card.acceptLabel,
    declineLabel: card.declineLabel,
    note: card.moveNote, // #83: accepting moves you
    onAccept: () => {
      const result = acceptOffer(engine.questState, card.classTsid, questCtx(engine));
      last = result.ok ? `accepted:${card.classTsid}` : `accept-failed:${card.classTsid}`;
      if (result.ok) {
        engine.pushActivity(`New quest: ${card.def.title}`);
        engine.refreshPack();
        routeHeldQuests(engine, wildlifeCatalog());
      }
      engine.save();
    },
    // npc_conversation.js: a declined NPC offer is asked again next talk.
    onDecline: () => {
      declineOffer(engine.questState, card.classTsid, Date.now(), { source: 'npc' });
      last = `declined:${card.classTsid}`;
      engine.save();
    },
  });
}

/** npc_sno_cone_vending_machine.js talk_to + onConversation: Yes, then Yes, please! opens the store. */
function chatter(engine, npc) {
  const def = VENDOR_NPCS[npc.classTsid];
  const lines = def.talk;
  speak(engine, npc);
  last = `chat:${npc.classTsid}`;
  engine.scriptedDialogue({
    title: def.label,
    kicker: def.label,
    beats: [{ text: lines.ask('friend'), response: lines.yes }],
    cancelable: true,
    primaryLabel: lines.yes,
    cancelLabel: lines.no,
    onComplete: () => {
      // A second dialogue opens on the next frame, once this one has closed.
      setTimeout(() => {
        speak(engine, npc);
        engine.scriptedDialogue({
          title: def.label,
          kicker: def.label,
          beats: [{ text: lines.offer, response: lines.offerYes }],
          cancelable: true,
          primaryLabel: lines.offerYes,
          cancelLabel: lines.offerNo,
          onComplete: () => setTimeout(() => openShop(engine, npc.classTsid, npc), 0),
        });
      }, 0);
    },
  });
}

/** npc_quests.js offerQuests: a turn-in first, else the first offer. */
function talk(engine, npc) {
  const quests = questsFor(engine, npc.classTsid);
  if (quests.completable.length) return turnIn(engine, npc, quests.completable[0]);
  if (quests.offered.length) return offer(engine, npc, quests.offered[0]);
  last = 'talk:none';
  return null;
}

function nearestNpc(engine) {
  const p = engine.player;
  if (!p || !npcs.length) return null;
  return npcs.reduce((best, npc) => (!best || Math.abs(npc.sprite.x - p.x) < Math.abs(best.sprite.x - p.x) ? npc : best), null);
}

function tickAttract(engine, now) {
  const p = engine.player;
  if (!p) return;
  for (const npc of npcs) {
    const line = VENDOR_NPCS[npc.classTsid].attract;
    if (!line) continue;
    const near = Math.abs(npc.sprite.x - p.x) <= ATTRACT_RADIUS && Math.abs(npc.sprite.y - p.y) <= ATTRACT_RADIUS;
    // onPlayerCollision -> attract(): once on approach, at most every 5 s.
    if (near && !npc.near && now - npc.lastAttract >= ATTRACT_GAP_MS && !engine.busy()) {
      npc.lastAttract = now;
      // The remake has no player names; quests.js reads {pc_label} as "friend".
      engine.say(npc.target, line('friend'), ATTRACT_BUBBLE_MS);
      npc.attractUntil = now + ATTRACT_POSE_MS.npc_gardening_vendor;
      last = `attract:${npc.classTsid}`;
    }
    npc.near = near;
  }
}

/** npc_sno_cone_vending_machine.js idle_onMsg player_collision: it waves for 3 s when you walk into it idling. */
function tickSnoAttract(engine, now) {
  const p = engine.player;
  if (!p) return;
  for (const npc of npcs) {
    if (npc.classTsid !== 'npc_sno_cone_vending_machine') continue;
    const halfW = (npc.sprite._worldHitW || 120) / 2;
    const touching = Math.abs(npc.sprite.x - p.x) <= halfW && Math.abs(npc.sprite.y - p.y) <= 120;
    if (touching && !npc.touching && npc.pose === 'idle' && !engine.busy()) {
      npc.attractUntil = now + ATTRACT_POSE_MS.npc_sno_cone_vending_machine;
      last = `attract:${npc.classTsid}`;
    }
    npc.touching = touching;
  }
}

function setupDemo(engine) {
  const demo = engine.param('vendornpcdemo');
  if (demo && !demoUsed && VENDOR_NPCS[demo]) {
    demoUsed = true;
    const p = engine.player;
    // On the floor under that spot (the player may still be dropping in).
    if (p) spawn(engine, demo, { x: p.x + 160, y: landingY(engine.platforms, p.x + 160, p.y - 40) ?? p.y });
  }
  const auto = engine.param('vendornpcautoplay');
  if (!auto || !npcs.length) return;
  const npc = demo && VENDOR_NPCS[demo] ? npcs.find((n) => n.classTsid === demo) || npcs[0] : npcs[0];
  const steps = auto.split(',');
  if (steps.includes('goto') && engine.player) {
    // Stand on the vendor's own platform, just right of it.
    engine.player.x = npc.sprite.x + 120;
    engine.player.y = npc.sprite.y - 4;
    engine.player.vx = 0;
    engine.player.vy = 0;
  }
  setTimeout(() => {
    // Frame the vendor left of the centred store panel.
    if (steps.includes('goto') && steps.includes('shop')) engine.setCameraLook?.(300, 0);
    if (steps.includes('shop')) openShop(engine, npc.classTsid, npc);
    else if (steps.includes('talk')) (VENDOR_NPCS[npc.classTsid].talk ? chatter : talk)(engine, npc);
    publish(engine);
  }, Math.max(0, Number(engine.param('vendornpcwait')) || 2500));
}

/** map-routes.js ROUTE_SOURCES id of a vendor quest's route. */
export const MERCHANT_ROUTE_SOURCE = 'vendor_quest';

/**
 * A quest held for a vendor's talk turn-in (Meet the Merchants) gets a map route to the nearest
 * street where that vendor stands, once a session, when no other route is set. Part 1's offer says
 * "Click on your map over there in the top right corner to locate him"; the remake's vendors stand
 * where the archive puts them, not where the 2010 text said (build-quests.mjs TEXT_OVERRIDES), so
 * the route takes the player there. A player who already holds a part (from v0.6.0) gets it too.
 */
export function routeHeldQuests(engine, catalog) {
  if (!catalog?.vendors || !engine.query) return;
  const active = Object.keys(engine.questState?.active || {});
  for (const id of active) {
    if (routed.has(id)) continue;
    const def = getQuestCatalog()[id];
    if (!heldForNpcTurnIn(def)) continue;
    routed.add(id);
    if (engine.query('mapRoute', 'get', null, engine)) continue;
    const to = vendorStreetsFor(catalog, def.endNpcs);
    if (to.length) engine.query('mapRoute', 'set', { to, source: MERCHANT_ROUTE_SOURCE, quest: id }, engine);
    last = `route:${id}`;
  }
}

function publish(engine) {
  engine.setData('vendorNpcs', npcs.map((n) => n.classTsid).join(','));
  engine.setData('vendorNpcLast', last);
  // QA (G680): each vendor's pose, the way it faces, x, and whether a player holds it.
  engine.setData('vendorNpcWalk', npcs.map((n) => `${n.classTsid}:${n.pose}:${n.facing}:${Math.round(n.sprite.x)}:${vendorHeld(n.hold, Date.now()) ? 'held' : 'free'}`).join(','));
}

export const vendorNpcsFeature = {
  id: VENDOR_NPCS_FEATURE_ID,

  init(engine) {
    loader = createSheetLoader(engine.PIXI);
    loadWildlifeCatalog();
    publish(engine);
  },

  placementGroups(population, street) {
    const catalog = wildlifeCatalog();
    if (!catalog || !street?.tsid) return [];
    return vendorNpcPlacementGroups(vendorNpcsFor(catalog, street.tsid));
  },

  onStreetEnter(street, engine) {
    generation += 1;
    const mine = generation;
    loadWildlifeCatalog().then((catalog) => {
      if (mine !== generation) return null;
      routeHeldQuests(engine, catalog);
      const list = vendorNpcList(vendorNpcsFor(catalog, engine.streetTsid));
      const demo = engine.param('vendornpcdemo');
      const classes = new Set([...list, ...(VENDOR_NPCS[demo] ? [demo] : [])]);
      return loader.loadAll([...classes].flatMap(sheetsFor)).then(() => {
        if (mine !== generation) return;
        const points = engine.placement(VENDOR_PLACEMENT_KEY);
        list.forEach((classTsid, i) => {
          const p = points[i];
          if (p) spawn(engine, classTsid, p);
        });
        setupDemo(engine);
        publish(engine);
      });
    });
  },

  onStreetClear(engine) {
    generation += 1;
    clear();
    shopNpc = null;
    if (shopOpened) {
      shopOpened = false;
      engine?.openShop?.(null);
    }
  },

  onTick(dtMs, now, engine) {
    if (shopOpened && !engine.shopOpen()) {
      shopOpened = false;
      shopNpc = null;
      engine.openShop(null);
      engine.setData('vendorNpcShop', '');
    }
    if (talking && !engine.questDialogueOpen()) talking = null;
    if (npcs.length) {
      // Wall-clock ms, as the walks and holds count them.
      const t = Date.now();
      tickAttract(engine, t);
      tickSnoAttract(engine, t);
      for (const npc of npcs) stepNpc(engine, npc, t);
    }
    // A quest the familiar gave (part 1) gets its route within a second, not at the next street.
    if (now - lastRouteCheck > 1000) {
      lastRouteCheck = now;
      routeHeldQuests(engine, wildlifeCatalog());
    }
    publish(engine);
  },

  verbsFor(target, engine) {
    const classTsid = target.vendorNpc;
    const def = VENDOR_NPCS[classTsid];
    if (!def) return [];
    const verbs = [{ id: 'buy_sell', label: 'buy/sell', tooltip: def.buyTooltip, enabled: true, reason: '', durationMs: 0 }];
    // make_eye_contact / npc_quests talk: only while there is something to offer or take back.
    const quests = questsFor(engine, classTsid);
    if (def.questVerb && (quests.offered.length || quests.completable.length)) {
      verbs.push({ id: def.questVerb.id, label: def.questVerb.label, tooltip: def.questVerb.tooltip, enabled: true, reason: '', durationMs: 0 });
    }
    if (def.talk) verbs.push({ id: 'talk_to', label: 'talk to', tooltip: def.talk.tooltip, enabled: true, reason: '', durationMs: 0 });
    return verbs;
  },

  runVerb(target, verbId, engine) {
    const npc = npcs.find((n) => n.target === target);
    if (!npc) return true;
    if (verbId === 'buy_sell') openShop(engine, npc.classTsid, npc);
    else if (verbId === VENDOR_NPCS[npc.classTsid].questVerb?.id) talk(engine, npc);
    else if (verbId === 'talk_to' && VENDOR_NPCS[npc.classTsid].talk) chatter(engine, npc);
    publish(engine);
    return true;
  },

  /** QA / tests. */
  _state() {
    return {
      npcs: npcs.map((n) => ({ classTsid: n.classTsid, x: n.sprite.x, y: n.sprite.y, clip: n.clip, pose: n.pose, facing: n.facing, flip: n.flip, held: vendorHeld(n.hold, Date.now()) })),
      last,
      shopOpened,
    };
  },
  _nearest: nearestNpc,
};
