/**
 * Warm and Smuggly (js/smuggling.js rules) as a feature module.
 *
 * A Smuggler stands unseen on each of the ten streets the Contraband's
 * destination map starts from. Walk into him at level 11+ (once an hour per
 * street, 20%; Max Luck always) and he arrives with a box: "psssst!". Talk to
 * him within 30 s and take the package: the quest starts, the familiar
 * explains the rules and the map opens on the destination. While you carry
 * it, every street you enter (not Hell, homes or instances) may hold a
 * Deimaginator that appears after 1 s and follows you from 3 s at 65 px/s,
 * jumping after you when you outrun it by 1,500 px; a touch takes the
 * package and fails the quest. Jumping over one is fine. Teleporting and the
 * Map's travel are refused; signposts and doors are not. On the destination a
 * green Smuggler waits 250-2,000 px away, seen only when you bump into him;
 * hand over the box for 100 iMG, 200 currants and a Walloping Big Diamond.
 * Dropping the Contraband fails the quest too.
 *
 * The give Smuggler also offers Smuggle the Smuggler (quest-rooms/penalty.js)
 * once you have made a delivery; it needs a working Shovel or Ace of Spades.
 *
 * Art: OGA npc_smuggler_head_{1,2}_variant_{red,green} and npc_deimaginator
 * sheets (251 x 186 cells, art faces left), contraband iconic.
 *
 * QA: ?autostart=1&fresh=1&resetgame=1&questoffer=off&smugglingdemo=give
 *     (the Smuggler arrives next to you; level lifted to 11),
 *     =receive (a run whose destination is this street; the contact stands
 *     beside you), =deim (a run to a far street; a Deimaginator spawns),
 *     =carry (a run to a signpost neighbour). &smugglingautoplay=deliver
 *     plays give -> receive on one street, =caught walks into the
 *     Deimaginator, =drop drops the package, =sts accepts Smuggle the Smuggler.
 *     Canvas: smugState, smugRun, smugDest, smugNext, smugGiver, smugReceiver,
 *     smugDeim, smugLast, smugCounts, smugAutoplay.
 */

import { addItem, countItem, ensureItem, removeItem } from '../inventory.js?v=catalog-unified-3';
import { canUseTool } from '../tools.js?v=tools-2';
import { acceptOffer, ensureQuestOfferState, turnInQuest } from '../quest-offers.js';
import { parseQuestConversation } from '../quests.js';
import { getQuestCatalog } from '../content-catalogs.js';
import { STREET_INDEX, resolveIndexTsid } from '../street-loader.js';
import { worldToScreen } from '../street-model.js';
import { landingY, walkSurfaceY } from '../walk-surface.js';
import { hellFeature } from './hell-feature.js?v=hell-1';
import { questRoomConverse } from './quest-instances-feature.js?v=qi-3';
import {
  CONTRABAND,
  CONTRABAND_ITEM,
  CONVERSATIONS,
  DEIMAGINATOR,
  DEIMAGINATOR_CLASS,
  DELIVERED_FLAG,
  EXPLAIN_RESTRICTIONS,
  RECEIVER,
  RECEIVE_REWARDS,
  REVEAL_DESTINATION,
  SMUGGLER,
  SMUGGLER_CLASS,
  SMUGGLING_QUEST,
  STS_PART1,
  STS_TOOLS,
  TEXT,
  carryObjective,
  chooseDestination,
  cleanSeen,
  createSmugglingState,
  deimaginatorSpawns,
  deimaginatorTouches,
  followDecision,
  giveConversation,
  giveEncounter,
  isSmugglerStreet,
  receiveConversation,
  routeTo,
  sameStreet,
  smugglerTouches,
  sourceKey,
  spawnOffset,
  sparedBySignpost,
} from '../smuggling.js';
import { frameTexture, sourceFromUrl, textureFromUrl } from '../textures.js';

export const SMUGGLING_FEATURE_ID = 'smuggling';
const ART = 'assets/sprites/smuggling/';
const CELL = { w: 251, h: 186 };
// Feet line and body middle inside a cell (idleHold bounding boxes).
const SMUGGLER_ANCHOR = { x: 79 / 251, y: 163 / 186 };
const DEIM_ANCHOR = { x: 77 / 251, y: 164 / 186 };
const FPS = 30;

/** Sheet grids measured from the OGA PNGs (cols x rows, frames in use). */
const SMUGGLER_CLIPS = {
  arriveWithBox: [3, 24, false], arriveNoBox: [3, 24, false],
  idleWithBox: [16, 109, true], idleNoBox: [16, 109, true],
  talkWithBox: [15, 72, true], talkNoBox: [15, 72, true],
  giveBox: [3, 30, false], takeBox: [3, 25, false],
  exitWithBox: [3, 30, false], exitNoBox: [3, 30, false],
};
/** Sheets shipped per variant (the give smuggler starts with the box, the contact without). */
const RED_SHEETS = ['arriveWithBox', 'idleWithBox', 'talkWithBox', 'giveBox', 'talkNoBox', 'idleNoBox', 'exitNoBox', 'exitWithBox'];
const GREEN_SHEETS = ['arriveNoBox', 'idleNoBox', 'talkNoBox', 'takeBox', 'talkWithBox', 'exitWithBox', 'exitNoBox'];
const DEIM_CLIPS = {
  appear: [3, 25, false], walk: [3, 16, true], idle1: [15, 135, true],
  talk: [15, 89, true], disappear: [3, 30, false],
};

let state = createSmugglingState();
let giver = null; // the red give Smuggler on this street (hidden until he arrives)
let receiver = null; // the green contact on the destination street
let deim = null; // a Deimaginator chasing you
let dropped = null; // a confiscated box on the ground
let graph = null;
let graphPromise = null;
let rng = Math.random;
let last = '';
let hud = null;
let talking = false;
let demoDone = false;
let autoplayMode = '';
let lastPublish = 0;
const sheetCache = new Map();

/* ------------------------------------------------------------ helpers */

function seeded(seed) {
  let s = (Number(seed) >>> 0) || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function loadGraph() {
  if (graph) return Promise.resolve(graph);
  graphPromise ||= fetch('assets/content/signpost-graph.json?v=smuggling-1')
    .then((r) => r.json())
    .then((json) => {
      graph = json.streets || {};
      return graph;
    })
    .catch(() => {
      graph = {};
      return graph;
    });
  return graphPromise;
}

const indexKey = (tsid) => (tsid ? resolveIndexTsid(tsid) : null);
function streetLabel(tsid) {
  const meta = STREET_INDEX.streets?.[indexKey(tsid)];
  return meta?.label || tsid || '';
}
function streetHub(tsid) {
  const meta = STREET_INDEX.streets?.[indexKey(tsid)];
  return { hubId: meta?.hubId || '', hubName: meta?.hubName || '' };
}

function questActive(engine) {
  return Boolean(engine.questState?.active?.[SMUGGLING_QUEST]);
}

/** Don't Get Caught!: a run in progress with the package in the pack. */
function carrying(engine) {
  return Boolean(state.run && countItem(engine.inv, CONTRABAND) > 0);
}

function streetBlocked(engine) {
  return Boolean(
    engine.transientInstance?.() ||
      engine.homeContext?.().inHome ||
      hellFeature.inHell?.(engine.streetTsid) ||
      hellFeature.isDead?.()
  );
}

function route(engine) {
  if (!state.run || !graph) return null;
  const from = indexKey(engine.streetTsid);
  const to = indexKey(state.run.destination);
  if (!from || !to) return null;
  return routeTo(graph, from, to);
}

function frames(engine, prefix, clip, defs) {
  const key = `${prefix}${clip}`;
  if (sheetCache.has(key)) return sheetCache.get(key);
  const [cols, count] = defs[clip];
  const { PIXI } = engine;
  const base = sourceFromUrl(`${ART}${key}.webp`);
  const list = [];
  for (let i = 0; i < count; i += 1) {
    const x = (i % cols) * CELL.w;
    const y = Math.floor(i / cols) * CELL.h;
    list.push(frameTexture(base, new PIXI.Rectangle(x, y, CELL.w, CELL.h)));
  }
  sheetCache.set(key, list);
  return list;
}

function setClip(engine, npc, clip, onComplete = null) {
  if (!npc?.sprite || npc.sprite.destroyed) return;
  const defs = npc.kind === 'deim' ? DEIM_CLIPS : SMUGGLER_CLIPS;
  if (!defs[clip]) return;
  const spr = npc.sprite;
  spr.textures = frames(engine, npc.prefix, clip, defs);
  spr.loop = defs[clip][2];
  spr.animationSpeed = FPS / 60;
  spr.onComplete = onComplete;
  spr.gotoAndPlay(0);
  spr.visible = true;
  npc.clip = clip;
}

/** Art faces left; face the avatar (or the way it walks). */
function face(npc, dir) {
  if (!npc?.sprite || npc.sprite.destroyed) return;
  npc.facing = dir >= 0 ? 1 : -1;
  npc.sprite.scale.x = npc.facing > 0 ? -1 : 1;
}

function makeNpc(engine, kind, prefix, x, y, anchor) {
  const { PIXI } = engine;
  const spr = new PIXI.AnimatedSprite([PIXI.Texture.EMPTY]);
  spr.anchor.set(anchor.x, anchor.y);
  spr.x = x;
  spr.y = y;
  spr.zIndex = 9;
  spr.visible = false;
  spr._worldHitW = kind === 'deim' ? 70 : SMUGGLER.hitW + 10;
  spr._worldHitH = kind === 'deim' ? 90 : SMUGGLER.hitH;
  engine.entityLayer.addChild(spr);
  // Start every sheet loading now: they are big, and an unloaded one draws nothing.
  const defs = kind === 'deim' ? DEIM_CLIPS : SMUGGLER_CLIPS;
  const clips = kind === 'deim' ? Object.keys(DEIM_CLIPS) : prefix.includes('red') ? RED_SHEETS : GREEN_SHEETS;
  for (const clip of clips) frames(engine, prefix, clip, defs);
  return { kind, prefix, sprite: spr, x, y, clip: '', facing: -1, target: null, timers: [] };
}

function later(npc, ms, fn) {
  if (!npc) return;
  npc.timers.push({ at: Date.now() + ms, fn });
}

function runTimers(npc, now) {
  if (!npc?.timers.length) return;
  const due = npc.timers.filter((t) => t.at <= now);
  npc.timers = npc.timers.filter((t) => t.at > now);
  for (const t of due) t.fn();
}

function removeNpc(engine, npc) {
  if (!npc) return;
  if (npc.target) engine.unregister?.(npc.target);
  npc.target = null;
  npc.timers = [];
  if (npc.sprite && !npc.sprite.destroyed) {
    npc.sprite.parent?.removeChild(npc.sprite);
    npc.sprite.destroy();
  }
}

function registerNpc(engine, npc, classId, label, subtitle) {
  if (npc.target) return npc.target;
  npc.target = engine.register({ classId, featureId: SMUGGLING_FEATURE_ID, label, subtitle, sprite: npc.sprite });
  return npc.target;
}

function say(engine, npc, text, ms = 4000) {
  if (!npc?.target) return;
  last = text;
  engine.say?.(npc.target, text, ms);
}

/** talk_to: the avatar steps to 100 px beside the Smuggler, facing him. */
function stepBeside(engine, npc) {
  const p = engine.player;
  if (!p || !npc) return;
  const left = p.x < npc.x;
  const x = npc.x + (left ? -SMUGGLER.talkOffset : SMUGGLER.talkOffset);
  const y = walkSurfaceY(engine.platforms, x, npc.y, { up: 40, down: 60 });
  if (y != null) {
    p.x = x;
    p.y = y;
    p.vx = 0;
  }
  p.facing = left ? 'right' : 'left';
  face(npc, left ? -1 : 1);
}

function playerName() {
  // quests.js reads {pc_label} as "friend" (the remake has no player names).
  return 'friend';
}

/** A spot on the platform under (x, y - 75), else above, else the avatar's line. */
function standY(engine, x, y, lift = 75) {
  return landingY(engine.platforms, x, y - lift) ?? walkSurfaceY(engine.platforms, x, y, { up: 600, down: 600 });
}

/* ------------------------------------------------------------ quest */

function questCtx(engine) {
  return { inv: engine.inv, pc: engine.pc, addItem, removeItem, countItem, now: Date.now() };
}

/** quests_familiar_fail_and_remove: the run ends, the quest leaves the log. */
function failRun(engine, text) {
  const qs = engine.questState;
  if (qs?.active?.[SMUGGLING_QUEST]) {
    delete qs.active[SMUGGLING_QUEST];
    const offers = ensureQuestOfferState(qs);
    delete offers.managed[SMUGGLING_QUEST];
    delete offers.timers[SMUGGLING_QUEST];
  }
  const n = countItem(engine.inv, CONTRABAND);
  if (n > 0) removeItem(engine.inv, CONTRABAND, n);
  if (state.run) state.failed += 1;
  state.run = null;
  last = text;
  engine.refreshPack?.();
  engine.updateHud?.();
  engine.save?.();
  renderHud(engine);
  engine.prompt?.({ title: 'Warm and Smuggly', kicker: 'Magic Rock', text });
  publish(engine);
}

function startRun(engine, from) {
  const res = acceptOffer(engine.questState, SMUGGLING_QUEST, questCtx(engine));
  if (!res.ok) return false;
  if (countItem(engine.inv, CONTRABAND) < 1) addItem(engine.inv, CONTRABAND, 1);
  const destination = chooseDestination(from, { resolve: indexKey, rng });
  state.run = { from: sourceKey(from), destination, startedAt: Date.now() };
  state.started += 1;
  engine.pushActivity?.(`New quest: Warm and Smuggly`);
  engine.refreshPack?.();
  engine.updateHud?.();
  engine.save?.();
  loadGraph().then(() => renderHud(engine));
  return true;
}

function giveRewards(engine) {
  const pc = engine.pc;
  pc.xp = (pc.xp || 0) + RECEIVE_REWARDS.xp;
  pc.imagination = (pc.imagination || 0) + RECEIVE_REWARDS.xp;
  pc.currants = (pc.currants || 0) + RECEIVE_REWARDS.currants;
  addItem(engine.inv, RECEIVE_REWARDS.item, RECEIVE_REWARDS.count);
  engine.pushActivity?.({
    base: `The Smuggler slipped you ${RECEIVE_REWARDS.currants} currants`,
    effects: { xp: RECEIVE_REWARDS.xp, items: { [RECEIVE_REWARDS.item]: RECEIVE_REWARDS.count } },
  });
  engine.playSound?.('QUOIN_CURRANTS', { volume: 0.5 });
  engine.refreshPack?.();
  engine.updateHud?.();
}

function deliver(engine) {
  removeItem(engine.inv, CONTRABAND, countItem(engine.inv, CONTRABAND));
  const quest = engine.questState?.active?.[SMUGGLING_QUEST];
  if (quest) {
    quest.progress ||= {};
    quest.progress[DELIVERED_FLAG] = 1;
  }
  engine.refreshPack?.();
  engine.updateHud?.();
}

function completeRun(engine) {
  if (questActive(engine)) {
    turnInQuest(engine.questState, SMUGGLING_QUEST, engine.pc, { ...questCtx(engine), force: true });
  }
  state.delivered += 1;
  state.run = null;
  engine.playSound?.('COMPLETE_QUEST_REQUIREMENT', { volume: 0.6 });
  engine.pushActivity?.('Quest complete: Warm and Smuggly');
  engine.updateHud?.();
  engine.save?.();
  renderHud(engine);
}

/* ------------------------------------------------------------ HUD + map */

function renderHud(engine) {
  if (typeof document === 'undefined') return;
  const host = document.getElementById('play-context');
  if (!host) return;
  if (!hud?.isConnected) {
    hud = document.createElement('section');
    hud.className = 'play-context-card smuggling-card';
    hud.dataset.smuggling = '';
    hud.style.cssText = 'padding:8px 10px;display:grid;grid-template-columns:30px 1fr;gap:8px;align-items:center';
    host.prepend(hud);
  }
  if (!carrying(engine)) {
    hud.style.display = 'none';
    return;
  }
  const dest = state.run.destination;
  const path = route(engine);
  const arrived = sameStreet(engine.streetTsid, dest);
  const text = carryObjective({
    destinationLabel: streetLabel(dest),
    nextLabel: path && path.length > 1 ? streetLabel(path[1]) : '',
    arrived,
    offPath: Boolean(graph) && !arrived && !path,
  });
  hud.style.display = 'grid';
  hud.innerHTML = `<img src="assets/sprites/icons/contraband.png" alt="" style="width:30px;height:auto" />
    <div><strong style="display:block;font-size:.8rem">${TEXT.buffName}</strong><span style="font-size:.74rem;line-height:1.25;display:block">${text}</span></div>`;
}

function mapCard(engine) {
  if (!carrying(engine) || typeof document === 'undefined') return null;
  const dest = state.run.destination;
  const hub = streetHub(dest);
  const path = route(engine);
  const card = document.createElement('div');
  card.className = 'map-feature-card smuggling-map-card';
  card.style.cssText = 'padding:8px 10px;border-radius:10px;background:#fff8ec;box-shadow:0 2px 8px rgba(0,0,0,.12);margin:0 0 8px;display:grid;grid-template-columns:34px 1fr;gap:8px;align-items:center';
  let routeText = TEXT.offPath;
  if (path) {
    routeText = path.length > 1
      ? `Route: ${path.slice(1).map(streetLabel).join(' → ')} (${path.length - 1} signpost${path.length === 2 ? '' : 's'})`
      : 'You are here. Look around for your contact.';
  }
  card.innerHTML = `<img src="assets/sprites/icons/contraband.png" alt="" style="width:34px" />
    <div><strong style="display:block;font-size:.85rem">Contraband destination: ${streetLabel(dest)}${hub.hubName ? ` (${hub.hubName})` : ''}</strong>
    <span style="font-size:.76rem;line-height:1.3">${routeText}</span></div>`;
  return card;
}

/** The familiar's overlay, then the map opens on the destination (get_path_to_location). */
async function revealDestination(engine, kind) {
  await new Promise((r) => setTimeout(r, engine.param?.('smugglingautoplay') ? 300 : 2500));
  const beats = kind === 'explain'
    ? EXPLAIN_RESTRICTIONS.map((text, i, all) => ({ text, response: i === all.length - 1 ? 'OK' : 'Next' }))
    : [{ text: REVEAL_DESTINATION[Math.floor(rng() * REVEAL_DESTINATION.length)], response: 'OK' }];
  await questRoomConverse(engine, { title: 'Warm and Smuggly', kicker: 'Magic Rock', beats });
  await loadGraph();
  renderHud(engine);
  if (!state.run) return;
  const hub = streetHub(state.run.destination);
  engine.openMap?.(hub.hubId || undefined);
  publish(engine);
}

/* ------------------------------------------------------------ give Smuggler */

function placeGiver(engine) {
  const street = engine.street;
  if (!street || !engine.PIXI) return;
  const w = engine.worldW || 2000;
  // The source smuggler's spot is lost: a stable point across the middle of the street.
  let h = 0;
  for (const ch of String(engine.streetTsid)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const x = Math.round(w * (0.3 + ((h % 1000) / 1000) * 0.4));
  const head = 1 + (h % 2);
  giver = makeNpc(engine, 'giver', `smuggler_red_${head}_`, x, 0, SMUGGLER_ANCHOR);
  giver.state = 'hidden';
}

function giverAppear(engine) {
  if (!giver || giver.state !== 'hidden') return;
  const p = engine.player;
  const y = walkSurfaceY(engine.platforms, giver.x, p.y, { up: 120, down: 160 }) ?? p.y;
  giver.sprite.y = giver.y = y;
  giver.state = 'arrive';
  giver.box = true;
  giver.conversed = false;
  face(giver, p.x >= giver.x ? 1 : -1);
  registerNpc(engine, giver, SMUGGLER_CLASS, TEXT.smugglerLabel, TEXT.smugglerSub);
  setClip(engine, giver, 'arriveWithBox', () => giver && giver.state === 'arrive' && giverIdle(engine));
  engine.playSound?.('SMUGGLING_NPC_ARRIVES', { volume: 0.6 });
  say(engine, giver, TEXT.giveArrive(playerName()), SMUGGLER.bubbleMs);
  later(giver, SMUGGLER.giveTimeoutMs, () => giverTimeout(engine));
  publish(engine);
}

function giverIdle(engine) {
  if (!giver) return;
  giver.state = 'idle';
  setClip(engine, giver, giver.box ? 'idleWithBox' : 'idleNoBox');
}

function giverTimeout(engine) {
  if (!giver || giver.conversed || talking || giver.state === 'gone') return;
  say(engine, giver, TEXT.giveTimeout, 5000);
  giverExit(engine, SMUGGLER.timeoutResetMs);
}

function giverExit(engine, resetMs = SMUGGLER.resetMs) {
  if (!giver || giver.state === 'gone') return;
  giver.state = 'gone';
  giver.timers = [];
  engine.playSound?.('SMUGGLING_NPC_LEAVES', { volume: 0.6 });
  if (giver.target) {
    engine.unregister?.(giver.target);
    giver.target = null;
  }
  setClip(engine, giver, giver.box ? 'exitWithBox' : 'exitNoBox', () => {
    if (giver?.sprite && !giver.sprite.destroyed) giver.sprite.visible = false;
  });
  later(giver, Math.max(resetMs, 1000), () => {
    if (giver?.sprite && !giver.sprite.destroyed) giver.sprite.visible = false;
  });
  publish(engine);
}

/** Smuggle the Smuggler: offered once you have delivered for the movement. */
function stsEligible(engine) {
  const def = getQuestCatalog()[STS_PART1];
  if (!def || state.delivered < 1) return false;
  const qs = engine.questState;
  if (qs?.active?.[STS_PART1] || (qs?.completed || []).includes(STS_PART1)) return false;
  return true;
}

function hasDigTool(engine) {
  return STS_TOOLS.some((cls) => countItem(engine.inv, cls) > 0 && canUseTool(engine.toolState, cls, 1).ok);
}

async function offerSts(engine) {
  const def = getQuestCatalog()[STS_PART1];
  const beats = parseQuestConversation(def.offer || def.desc);
  const accept = beats[beats.length - 1]?.response || "Ok, I'll do it!";
  const answer = await questRoomConverse(engine, {
    title: def.title,
    kicker: TEXT.smugglerLabel,
    beats,
    choices: [{ label: accept, value: 'yes' }, { label: 'Not right now', value: 'no' }],
  });
  if (answer !== 'yes') return 'declined';
  // smuggle_the_smuggler_part1.js onStarted: no working tool, no start.
  if (!hasDigTool(engine)) {
    await questRoomConverse(engine, { title: def.title, kicker: TEXT.smugglerLabel, text: TEXT.needTool });
    return 'no_tool';
  }
  const res = acceptOffer(engine.questState, STS_PART1, questCtx(engine));
  if (!res.ok) return 'failed';
  engine.playSound?.('QUEST_ADDED', { volume: 0.6 });
  engine.pushActivity?.(`New quest: ${def.title}`);
  engine.save?.();
  return 'accepted';
}

async function talkGiver(engine) {
  if (!giver || talking || giver.conversed) return;
  talking = true;
  giver.timers = []; // giveTimeOut cancelled
  try {
    stepBeside(engine, giver);
    await new Promise((r) => setTimeout(r, SMUGGLER.talkDelayMs));
    setClip(engine, giver, giver.box ? 'talkWithBox' : 'talkNoBox');
    if (stsEligible(engine)) {
      const sts = await offerSts(engine);
      state.lastSts = sts;
      if (sts === 'accepted') {
        giver.conversed = true;
        giverExit(engine);
        return;
      }
    }
    const id = giveConversation(state, rng);
    state.lastConversation = id;
    await runConversation(engine, giver, id);
  } finally {
    talking = false;
    publish(engine);
  }
}

/* ------------------------------------------------------------ conversations */

async function runConversation(engine, npc, convId) {
  const conv = CONVERSATIONS[convId];
  let nodeId = 'start';
  while (nodeId && npc && conv[nodeId]) {
    const node = conv[nodeId];
    const choices = node.choices.map((ch, i) => ({ label: ch.label, value: String(i) }));
    engine.setData?.('smugNode', `${convId}:${nodeId}`);
    const picked = await questRoomConverse(engine, { title: TEXT.smugglerLabel, kicker: TEXT.smugglerLabel, text: node.text, choices: choices.length ? choices : null });
    if (!node.choices.length) break;
    const choice = node.choices[Number(picked)] || node.choices[0];
    for (const action of choice.actions) await runAction(engine, npc, action);
    nodeId = choice.next;
  }
  engine.setData?.('smugNode', '');
}

async function runAction(engine, npc, action) {
  if (action === 'start') {
    // giveStartQuest: the quest and its package, giveBox, talkNoBox.
    if (!startRun(engine, engine.streetTsid)) return;
    npc.box = false;
    engine.playSound?.('SMUGGLER_GIVES_OR_TAKES_BOX', { volume: 0.6 });
    setClip(engine, npc, 'giveBox', () => npc.state !== 'gone' && setClip(engine, npc, 'talkNoBox'));
    renderHud(engine);
  } else if (action === 'decline') {
    npc.conversed = true;
    giverExit(engine);
  } else if (action === 'explain' || action === 'reveal') {
    npc.conversed = true;
    npc.state = 'leaving';
    setClip(engine, npc, 'idleNoBox');
    later(npc, SMUGGLER.giveDisappearMs, () => {
      say(engine, npc, TEXT.giveLuck, 1000);
      giverExit(engine);
    });
    revealDestination(engine, action);
  } else if (action === 'deliver') {
    deliver(engine);
    npc.box = true;
    engine.playSound?.('SMUGGLER_GIVES_OR_TAKES_BOX', { volume: 0.6 });
    setClip(engine, npc, 'takeBox', () => npc.state !== 'gone' && setClip(engine, npc, 'talkWithBox'));
    npc.received = true;
  } else if (action === 'reward') {
    giveRewards(engine);
    npc.rewarded = true;
  } else if (action === 'complete') {
    npc.conversed = true;
    completeRun(engine);
    later(npc, SMUGGLER.receiveDisappearMs, () => receiverExit(engine));
  }
  publish(engine);
}

/* ------------------------------------------------------------ receiver */

function placeReceiver(engine, { near = false } = {}) {
  const p = engine.player;
  if (!p || !engine.PIXI) return;
  const w = engine.worldW || 2000;
  const x = near
    ? Math.min(w - 60, p.x + 180)
    : Math.max(40, Math.min(w - 40, spawnOffset(p.x, { l: 0, r: w, min: RECEIVER.spawnMin, max: RECEIVER.spawnMax, rng })));
  // The contact is unseen until you bump into him: keep him on a line you can walk.
  const y = standY(engine, x, p.y, 10) ?? p.y;
  const head = 1 + Math.floor(rng() * 2);
  receiver = makeNpc(engine, 'receiver', `smuggler_green_${head}_`, x, y, SMUGGLER_ANCHOR);
  receiver.state = 'hidden';
  receiver.box = false;
}

function receiverAppear(engine) {
  if (!receiver || receiver.state !== 'hidden') return;
  receiver.state = 'arrive';
  face(receiver, engine.player.x >= receiver.x ? 1 : -1);
  registerNpc(engine, receiver, SMUGGLER_CLASS, TEXT.smugglerLabel, 'Your contact');
  // The source plays arriveWithBox here; the green contact has no box yet.
  setClip(engine, receiver, 'arriveNoBox', () => {
    if (receiver?.state === 'arrive') {
      receiver.state = 'idle';
      setClip(engine, receiver, 'idleNoBox');
    }
  });
  engine.playSound?.('SMUGGLING_NPC_ARRIVES', { volume: 0.6 });
  say(engine, receiver, TEXT.receiveArrive(playerName()), SMUGGLER.bubbleMs);
  renderHud(engine);
  publish(engine);
}

function receiverExit(engine) {
  if (!receiver || receiver.state === 'gone') return;
  say(engine, receiver, TEXT.receiveBye, 1000);
  receiver.state = 'gone';
  engine.playSound?.('SMUGGLING_NPC_LEAVES', { volume: 0.6 });
  if (receiver.target) {
    engine.unregister?.(receiver.target);
    receiver.target = null;
  }
  setClip(engine, receiver, receiver.box ? 'exitWithBox' : 'exitNoBox', () => {
    if (receiver?.sprite && !receiver.sprite.destroyed) receiver.sprite.visible = false;
  });
  publish(engine);
}

async function talkReceiver(engine) {
  if (!receiver || talking || receiver.conversed) return;
  if (!carrying(engine) && !receiver.received) return;
  talking = true;
  try {
    stepBeside(engine, receiver);
    await new Promise((r) => setTimeout(r, SMUGGLER.talkDelayMs));
    setClip(engine, receiver, 'talkNoBox');
    const id = receiveConversation(state, rng);
    state.lastConversation = id;
    await runConversation(engine, receiver, id);
    // receiveMsgHandler: a delivery that skipped the rewards still pays out.
    if (receiver?.received && !receiver.rewarded) {
      say(engine, receiver, "But I didn't get to the best part - the rewards! Sigh. Here you go.", 5000);
      giveRewards(engine);
      receiver.rewarded = true;
    }
    if (receiver?.received && !receiver.conversed) {
      receiver.conversed = true;
      completeRun(engine);
      later(receiver, SMUGGLER.receiveDisappearMs, () => receiverExit(engine));
    }
  } finally {
    talking = false;
    publish(engine);
  }
}

/* ------------------------------------------------------------ Deimaginator */

function placeDeimaginator(engine, { near = false } = {}) {
  const p = engine.player;
  if (!p || !engine.PIXI) return false;
  const w = engine.worldW || 2000;
  const x = near
    ? Math.min(w - 60, p.x + 420)
    : spawnOffset(p.x, { l: 0, r: w, min: DEIMAGINATOR.spawnMin, max: DEIMAGINATOR.spawnMax, rng });
  if (x < 20 || x > w - 20) return false;
  const y = standY(engine, x, p.y);
  if (y == null) return false; // "Nowhere to go!"
  deim = makeNpc(engine, 'deim', 'deimaginator_', x, y, DEIM_ANCHOR);
  deim.state = 'waiting';
  deim.start = { x: p.x, y: p.y };
  deim.ready = false;
  face(deim, p.x > x ? 1 : -1);
  later(deim, DEIMAGINATOR.appearMs, () => deimAppear(engine));
  later(deim, DEIMAGINATOR.followMs, () => deimFollow(engine));
  publish(engine);
  return true;
}

function deimAppear(engine) {
  if (!deim || deim.state === 'gone') return;
  engine.pushActivity?.(TEXT.deimAppear);
  last = TEXT.deimAppear;
  deim.state = 'appear';
  registerNpc(engine, deim, DEIMAGINATOR_CLASS, TEXT.deimLabel, TEXT.deimSub);
  setClip(engine, deim, 'appear', () => {
    if (deim && deim.state === 'appear') {
      deim.state = 'idle';
      setClip(engine, deim, 'idle1');
    }
  });
  engine.playSound?.('SMUGGLING_NPC_ARRIVES', { volume: 0.6 });
  publish(engine);
}

/** targetFollow, every second from 3 s on. */
function deimFollow(engine) {
  if (!deim || deim.state === 'gone' || deim.state === 'caught') return;
  const p = engine.player;
  deim.ready = true;
  const decision = followDecision(p.x - deim.x, rng);
  if (decision === 'path') {
    deim.state = 'walk';
    if (deim.clip !== 'walk') setClip(engine, deim, 'walk');
    later(deim, DEIMAGINATOR.followTickMs, () => deimFollow(engine));
  } else if (decision === 'jump') {
    deimJump(engine);
  } else {
    later(deim, DEIMAGINATOR.goAwayMs, () => deimGoAway(engine));
    deim.state = 'idle';
    setClip(engine, deim, 'idle1');
  }
  publish(engine);
}

function deimJump(engine) {
  deim.state = 'jumping';
  setClip(engine, deim, 'disappear', () => deim?.sprite && (deim.sprite.visible = false));
  engine.playSound?.('SMUGGLING_NPC_LEAVES', { volume: 0.5 });
  later(deim, DEIMAGINATOR.jumpMs, () => {
    if (!deim || deim.state !== 'jumping') return;
    const p = engine.player;
    const w = engine.worldW || 2000;
    const x = spawnOffset(p.x, { l: 0, r: w, min: DEIMAGINATOR.jumpMin, max: DEIMAGINATOR.jumpMax, rng });
    const y = x >= 0 && x <= w ? standY(engine, x, p.y) : null;
    if (y == null) {
      deimGoAway(engine);
      return;
    }
    deim.x = deim.sprite.x = x;
    deim.y = deim.sprite.y = y;
    deim.state = 'appear';
    face(deim, p.x > x ? 1 : -1);
    setClip(engine, deim, 'appear', () => deim?.state === 'appear' && setClip(engine, deim, 'idle1'));
    engine.playSound?.('SMUGGLING_NPC_ARRIVES', { volume: 0.5 });
    deimFollow(engine);
  });
}

function deimGoAway(engine) {
  if (!deim || deim.state === 'gone') return;
  deim.state = 'gone';
  deim.ready = false;
  deim.timers = [];
  engine.playSound?.('SMUGGLING_NPC_LEAVES', { volume: 0.5 });
  if (deim.target) {
    engine.unregister?.(deim.target);
    deim.target = null;
  }
  setClip(engine, deim, 'disappear', () => deim?.sprite && !deim.sprite.destroyed && (deim.sprite.visible = false));
  publish(engine);
}

function stepDeimaginator(engine, dtMs) {
  if (!deim || deim.state !== 'walk') return;
  const p = engine.player;
  const dx = p.x - deim.x;
  if (Math.abs(dx) > 6) {
    const dir = Math.sign(dx);
    const nx = deim.x + dir * DEIMAGINATOR.speed * (dtMs / 1000);
    let ny = walkSurfaceY(engine.platforms, nx, deim.y, { up: 46, down: 80 });
    // npc_can_fall: off an edge, drop to the line below.
    if (ny == null) ny = landingY(engine.platforms, nx, deim.y + 2);
    if (ny != null) {
      deim.x = nx;
      deim.y = ny;
    }
    face(deim, dir);
  }
  // npc_can_jump / climb: right under or over the avatar, hop to its line.
  if (Math.abs(dx) < 60 && Math.abs(p.y - deim.y) > 40 && Math.abs(p.y - deim.y) < 260 && p.onGround) {
    const ny = walkSurfaceY(engine.platforms, deim.x, p.y, { up: 30, down: 30 });
    if (ny != null) deim.y = ny;
  }
  deim.sprite.x = deim.x;
  deim.sprite.y = deim.y;
}

function checkCatch(engine) {
  if (!deim?.ready || deim.state === 'gone' || deim.state === 'caught' || deim.state === 'jumping') return;
  const p = engine.player;
  if (!deimaginatorTouches(p, deim)) return;
  const street = engine.street;
  const signs = (street?.signposts || []).map((s) => worldToScreen(street, s.x, s.y));
  if (sparedBySignpost(p, deim.start, signs)) {
    last = 'spared:signpost';
    deimGoAway(engine);
    return;
  }
  caught(engine);
}

/** caughtPlayer, then finishCatch 2 s later. */
function caught(engine) {
  deim.state = 'caught';
  deim.ready = false;
  deim.timers = [];
  const had = countItem(engine.inv, CONTRABAND) > 0;
  if (!had) {
    setClip(engine, deim, 'idle1');
    say(engine, deim, TEXT.emptyBubble, 5000);
    later(deim, DEIMAGINATOR.leaveEmptyMs, () => deimGoAway(engine));
    if (state.run) failRun(engine, TEXT.lostFail);
    return;
  }
  removeItem(engine.inv, CONTRABAND, countItem(engine.inv, CONTRABAND));
  engine.refreshPack?.();
  state.caught += 1;
  engine.pushActivity?.(TEXT.caught);
  engine.playSound?.('DEIMAGINATOR_TAKES_BOX', { volume: 0.7 });
  // The box lands at its feet and is gone 2 s later (onDropped).
  const box = new engine.PIXI.Sprite(textureFromUrl('assets/sprites/icons/contraband.png'));
  box.anchor.set(0.5, 1);
  box.x = deim.x;
  box.y = deim.y;
  box.zIndex = 10;
  engine.entityLayer.addChild(box);
  dropped = { sprite: box, at: Date.now() + DEIMAGINATOR.dropMs };
  setClip(engine, deim, 'talk');
  say(engine, deim, TEXT.caughtBubble, 5000);
  later(deim, DEIMAGINATOR.finishMs, () => {
    failRun(engine, TEXT.caughtFail);
    setClip(engine, deim, 'idle1');
    later(deim, DEIMAGINATOR.leaveAfterCatchMs, () => deimGoAway(engine));
  });
  publish(engine);
}

/* ------------------------------------------------------------ street */

function clearStreet(engine) {
  for (const npc of [giver, receiver, deim]) removeNpc(engine, npc);
  giver = null;
  receiver = null;
  deim = null;
  if (dropped?.sprite && !dropped.sprite.destroyed) dropped.sprite.destroy();
  dropped = null;
}

/** Repair a run that lost its package or quest (reloads, the quest log). */
function reconcile(engine) {
  const n = countItem(engine.inv, CONTRABAND);
  if (state.run && !questActive(engine)) {
    // The quest left the log: the package goes with it.
    if (n > 0) removeItem(engine.inv, CONTRABAND, n);
    state.run = null;
    engine.refreshPack?.();
  } else if (state.run && n < 1) {
    failRun(engine, TEXT.lostFail);
  } else if (!state.run && n > 0) {
    // "Contraband created outside a player's pack. Naughty naughty."
    removeItem(engine.inv, CONTRABAND, n);
    engine.refreshPack?.();
  }
}

function publish(engine) {
  if (!engine?.setData) return;
  engine.setData('smugState', carrying(engine) ? 'carrying' : state.run ? 'run' : 'idle');
  engine.setData('smugRun', state.run ? `${state.run.from}>${state.run.destination}` : 'none');
  engine.setData('smugDest', state.run ? streetLabel(state.run.destination) : '');
  const path = route(engine);
  engine.setData('smugNext', path && path.length > 1 ? streetLabel(path[1]) : path ? 'here' : '');
  engine.setData('smugGiver', giver ? `${giver.state}:${giver.clip}` : 'none');
  engine.setData('smugReceiver', receiver ? `${receiver.state}:${receiver.clip}` : 'none');
  engine.setData('smugDeim', deim ? `${deim.state}:${Math.round(deim.x)},${Math.round(deim.y)}` : 'none');
  engine.setData('smugLast', last || '');
  engine.setData('smugCounts', `${state.started}/${state.delivered}/${state.failed}/${state.caught}`);
}

/* ------------------------------------------------------------ QA */

function demoSetup(engine) {
  const demo = engine.param?.('smugglingdemo');
  if (demoDone || !demo) return;
  demoDone = true;
  if (engine.param('smugglingseed')) rng = seeded(engine.param('smugglingseed'));
  autoplayMode = engine.param('smugglingautoplay') || '';
  const pc = engine.pc;
  if ((Number(pc.level) || 0) < SMUGGLER.minLevel) pc.level = SMUGGLER.minLevel;
  if (demo === 'give') {
    if (engine.param('smugglingdelivered')) state.delivered = Number(engine.param('smugglingdelivered')) || 1;
    if (autoplayMode === 'sts') {
      state.delivered = Math.max(1, state.delivered);
      addItem(engine.inv, 'shovel', 1);
      engine.refreshPack?.();
    }
    clearStreet(engine);
    placeGiver(engine);
    giver.x = giver.sprite.x = Math.min((engine.worldW || 2000) - 80, engine.player.x + 160);
    giverAppear(engine);
  } else if (demo === 'receive' || demo === 'deim' || demo === 'carry') {
    startRun(engine, engine.streetTsid);
    loadGraph().then(() => {
      if (demo === 'receive') state.run.destination = sourceKey(indexKey(engine.streetTsid));
      if (demo === 'carry') {
        const next = (graph[indexKey(engine.streetTsid)] || [])[0];
        if (next) state.run.destination = sourceKey(next);
      }
      clearStreet(engine);
      if (demo === 'receive') placeReceiver(engine, { near: true });
      if (demo === 'deim') placeDeimaginator(engine, { near: true });
      renderHud(engine);
      publish(engine);
    });
  }
  if (autoplayMode) setTimeout(() => autoplay(engine, demo, autoplayMode), 2500);
}

async function waitFor(fn, ms = 8000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (fn()) return true;
    await new Promise((r) => setTimeout(r, 120));
  }
  return false;
}

const clickDialog = () => {
  const btn = typeof document !== 'undefined' ? document.querySelector('#qi-dialogue:not([hidden]) [data-qi-choices] button') : null;
  if (!btn) return false;
  btn.click();
  return true;
};

async function drainDialog(max = 20) {
  for (let i = 0; i < max; i += 1) {
    if (!(await waitFor(() => clickDialog(), 1500))) return;
    await new Promise((r) => setTimeout(r, 150));
  }
}

async function autoplay(engine, demo, mode) {
  engine.setData('smugAutoplay', `running:${mode}`);
  try {
    if (demo === 'give') {
      await waitFor(() => giver?.target);
      talkGiver(engine);
      await drainDialog();
      await new Promise((r) => setTimeout(r, 400));
      engine.closeMap?.();
      if (mode === 'sts') {
        engine.setData('smugAutoplay', `sts:${state.lastSts || ''}`);
        return;
      }
      // Hand it straight to a contact here (QA: the destination is this street).
      if (state.run) state.run.destination = sourceKey(indexKey(engine.streetTsid));
      if (mode === 'drop') {
        smugglingFeature.runPackVerb(CONTRABAND, 'drop', engine);
        await drainDialog(3);
        engine.setData('smugAutoplay', 'dropped');
        return;
      }
      placeReceiver(engine, { near: true });
      receiverAppear(engine);
    }
    if (demo === 'receive' || demo === 'give') {
      await waitFor(() => receiver);
      if (receiver.state === 'hidden') receiverAppear(engine);
      await waitFor(() => receiver?.target);
      talkReceiver(engine);
      await drainDialog();
      engine.setData('smugAutoplay', state.run ? 'stuck' : 'delivered');
      return;
    }
    if (demo === 'deim' && mode === 'caught') {
      await waitFor(() => deim?.ready, 6000);
      const p = engine.player;
      p.x = deim.x;
      p.vx = 0;
      await waitFor(() => !state.run, 6000);
      await drainDialog(2);
      engine.setData('smugAutoplay', state.run ? 'not-caught' : 'caught');
      return;
    }
    engine.setData('smugAutoplay', 'done');
  } catch (err) {
    engine.setData('smugAutoplay', `error:${err?.message || err}`);
  }
}

/* ------------------------------------------------------------ feature */

export const smugglingFeature = {
  id: SMUGGLING_FEATURE_ID,

  init(engine) {
    ensureItem(CONTRABAND, CONTRABAND_ITEM);
    if (state.run) loadGraph();
    publish(engine);
  },

  onStreetEnter(street, engine) {
    clearStreet(engine);
    reconcile(engine);
    cleanSeen(state);
    demoSetup(engine);
    if (demoDone && engine.param?.('smugglingdemo')) {
      renderHud(engine);
      return publish(engine);
    }
    if (carrying(engine)) {
      loadGraph().then(() => renderHud(engine));
      if (sameStreet(engine.streetTsid, state.run.destination)) placeReceiver(engine);
      else if (!streetBlocked(engine) && deimaginatorSpawns(rng)) placeDeimaginator(engine);
    } else if (!streetBlocked(engine) && isSmugglerStreet(engine.streetTsid)) {
      placeGiver(engine);
    }
    renderHud(engine);
    publish(engine);
  },

  onStreetClear(engine) {
    // onPlayerExit: everyone smuggling-related leaves with you (a catch still lands).
    if (deim?.state === 'caught' && state.run) failRun(engine, TEXT.caughtFail);
    clearStreet(engine);
    publish(engine);
  },

  onTick(dtMs, now, engine) {
    const p = engine.player;
    if (!p) return;
    for (const npc of [giver, receiver, deim]) runTimers(npc, now);
    if (dropped && now >= dropped.at) {
      if (dropped.sprite && !dropped.sprite.destroyed) dropped.sprite.destroy();
      dropped = null;
    }
    const busy = engine.acting?.() || engine.questDialogueOpen?.() || talking;
    // onPlayerCollision with the unseen Smuggler: walking through his spot.
    if (giver?.state === 'hidden' && !busy && p.onGround && Math.abs(p.x - giver.x) <= SMUGGLER.hitW / 2 + 20) {
      const res = giveEncounter(state, {
        level: engine.pc?.level,
        carrying: carrying(engine) || questActive(engine),
        packFull: false,
        maxLuck: engine.hasBuff?.('max_luck'),
        street: sourceKey(engine.streetTsid),
        now,
      }, rng);
      last = `give:${res.reason}`;
      if (res.appear) giverAppear(engine);
      else giver.state = 'rolled';
      engine.save?.();
      publish(engine);
    }
    if (receiver?.state === 'hidden' && carrying(engine) && smugglerTouches(p, receiver.x, receiver.y)) receiverAppear(engine);
    if (deim) {
      stepDeimaginator(engine, dtMs);
      checkCatch(engine);
    }
    if (now - lastPublish > 250) {
      lastPublish = now;
      publish(engine);
    }
    // A package that left the pack another way (a reload, a trade) ends the run.
    if (state.run && !talking && countItem(engine.inv, CONTRABAND) < 1 && !receiver?.received && deim?.state !== 'caught') {
      failRun(engine, TEXT.lostFail);
    }
  },

  /** No teleporting or Map travel with the package; signposts and doors are fine. */
  travelGate(tsid, engine, meta = {}) {
    if (!carrying(engine)) return null;
    if (meta?.via === 'signpost' || meta?.via === 'door' || meta?.bypass) return null;
    return { ok: false, msg: TEXT.teleport };
  },

  verbsFor(target, engine) {
    const npc = [giver, receiver].find((n) => n?.target === target);
    if (npc) {
      const done = npc.conversed || npc.state === 'gone';
      const ok = npc === giver ? !done : !done && (carrying(engine) || npc.received);
      return [{ id: 'talk_to', label: 'Talk to', enabled: ok && !talking, reason: TEXT.talked, tooltip: TEXT.talkTip, durationMs: 0 }];
    }
    if (deim?.target === target) return [];
    return null;
  },

  runVerb(target, verbId, engine) {
    if (verbId !== 'talk_to') return false;
    if (giver?.target === target) {
      talkGiver(engine);
      return true;
    }
    if (receiver?.target === target) {
      talkReceiver(engine);
      return true;
    }
    return false;
  },

  packVerbs(classTsid, engine) {
    if (classTsid !== CONTRABAND || !state.run) return [];
    return [
      { id: 'check_address', label: 'Check the address', enabled: true, primary: true, tooltip: TEXT.checkTip },
      { id: 'drop', label: 'Drop it', enabled: true, tooltip: TEXT.dropTip },
    ];
  },

  runPackVerb(classTsid, verbId, engine) {
    if (classTsid !== CONTRABAND || !state.run) return false;
    if (verbId === 'check_address') {
      loadGraph().then(() => {
        const path = route(engine);
        if (!path || streetBlocked(engine)) {
          engine.pushActivity?.(TEXT.offPath);
          last = TEXT.offPath;
        } else {
          engine.openMap?.(streetHub(state.run.destination).hubId || undefined);
        }
        renderHud(engine);
        publish(engine);
      });
      return true;
    }
    if (verbId === 'drop') {
      engine.pushActivity?.(TEXT.dropActivity);
      failRun(engine, TEXT.dropFail);
      return true;
    }
    return false;
  },

  mapCards(engine) {
    const card = mapCard(engine);
    return card ? [card] : [];
  },

  save() {
    return { version: 1, ...state };
  },

  restore(slice) {
    state = createSmugglingState(slice || {});
    if (state.run) loadGraph();
  },

  /** QA / tests. */
  _state() {
    return { state, giver, receiver, deim, last, talking };
  },
  _reset() {
    state = createSmugglingState();
    giver = receiver = deim = dropped = null;
    last = '';
    talking = false;
    demoDone = false;
  },
};
