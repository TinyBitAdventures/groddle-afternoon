/**
 * Shared public gardens in multiplayer (register G368): the beds on the ten
 * public garden streets (js/shared-gardens.js SHARED_GARDEN_STREETS) are the
 * same for everyone on the street, kept by the realtime server
 * (groddle-afternoon-server gardens.go), as the original's public gardens
 * were (items/include/garden.js isPublic 1244-1247). The plan:
 * research/plans/g368-shared-public-gardens.md.
 *
 * - On a shared street game.js spawnGarden asks this feature for the bed
 *   (sharedGardenFor): a garden held here, never in the save. The server's
 *   snapshot (garden_sync) fills it; others' changes, each stage and each
 *   drying come as "gardens" frames and redraw the bed.
 * - A plot's verb asks the server first (runVerbOverride): plant, water,
 *   pick, hoe, Guano, and Water All as one message. The player's own side
 *   (seed, tools, energy) refuses here as in solo, before anything is asked.
 *   The skill success roll is drawn here before asking (rollPasses): a roll
 *   that fails runs the verb here alone with that draw (a failed water or pick
 *   changes no plot), one that passes asks the server and runs with it on the
 *   go-ahead, on the plot as the server had it. The server's plot lands after.
 * - Plant: the save is written first (the ledger learns of a seed bought a
 *   moment ago from that write, the plan's catch 1), the site's ledger takes
 *   the seed, and the go-ahead's op is applied once (ledgerReceipt) as the
 *   plant takes the seed from the pack. Guano the same.
 * - Pick: the go-ahead carries the grant (the base crop the server credited
 *   to the ledger); the pick here adds it with any super harvest, the save is
 *   written, then the grant is acknowledged (garden_ack). A grant resent on
 *   connect (a lost answer) adds the base crop once (its id is kept in this
 *   slice).
 * - The planter's 60 seconds: another player's pick is refused before the
 *   action bar with the original's line (verbRefusedNow, GardenView.as
 *   481-486: the feed line and CLICK_FAILURE); the server refuses it too.
 * - The old personal copies: once the server shares the gardens, this save's
 *   own beds on those ten streets are dropped (the site paid them out once by
 *   mail, groddle-afternoon-site GardenPayout.php), so a stale copy never
 *   brings them back.
 * - Master Gardener potions (slice 2): master-garden-feature's pour asks the server
 *   (sharedPotionPour) with how many plots the player's energy covers; the server takes the
 *   bottle's charge and a Seed-Dibber's seeds through the ledger and works the bed for everyone
 *   (gardens_potions.go; a Manyharvest ignores the planter's 60 seconds, as the original); its
 *   go-ahead lands the pour here (masterGardenPourGranted) and a Manyharvest's crops are granted
 *   and acknowledged as a pick's.
 * - Others' tools: garden_ev's "tool" draws that player's can, hoe or Guano in a bubble over their
 *   head for the act's time, as the original's pc_overlay to the street did.
 * - The server without this module (bad_frame), a "none" answer, or no live
 *   realtime: the bed goes back to the save's own plots and every verb is
 *   local, as before G368. Solo never comes here (engine.mode).
 *
 * QA: canvas data sharedGardens (street:snap|none|local|waiting), sharedGardensLast
 * (plot:verb:ok|code), sharedGardensView (each plot as this page has it: default:1-1=crop@7,
 * the planter while locked). window.groddleSharedGardens: plots(), dev({ lock, water }) for a
 * server started with GRODDLE_GARDENS_DEV=1.
 */

import {
  GARDEN_FERTILIZER,
  SEED_CATALOG,
  createGarden,
  fertilizeCheck,
  gardenActionProfile,
  gardenNeedsWater,
  hasHoe,
  hasWateringCan,
  pickSeedToPlant,
  seedFitsGarden,
} from '../garden.js?v=e1c3415c';
import { HOE_TOOLS, WATERING_CAN_TOOLS, canUseTool, firstWorkingTool } from '../tools.js?v=d8aa3536';
import { addItem, countItem, ITEM_CATALOG, itemIcon } from '../inventory.js?v=b7609342';
import { JOB_WORK_OVERLAY, jobWorkToolScale, jobWorkToolSheet } from '../job-work-fx.js?v=a040a5a7';
import { frameTexture, sourceFromUrl, textureFromUrl } from '../textures.js?v=3149d699';
import { gardenGrowModifier } from '../imagination-effects.js?v=70169933';
import { saveStore } from '../save-store.js?v=8839ba7b';
import {
  LOCK_LINE,
  SHARED_GARDEN_STREETS,
  applyPlot,
  isSharedGardenStreet,
  lockedFor,
  parsePlotId,
  plotId,
  rollPasses,
} from '../shared-gardens.js?v=47984e60';

export const SHARED_GARDENS_FEATURE_ID = 'shared-gardens';
const REQUEST_TIMEOUT_MS = 8000;
const SYNC_RETRY_MS = 3000;
const APPLIED_KEEP = 100;
/**
 * A fresh pick's save waits this long: the server's take receipt goes to the site through its credit
 * outbox (credits.go, batched every 250 ms), and a save write that shows the crop before the receipt
 * is there pays for it from the earning budget, which an earner who spent theirs would see clamped.
 */
const GRANT_SAVE_DELAY_MS = 2500;
const LOCAL_STATES = new Set(['off', 'signed-out', 'replaced', 'stopped']);
const BLOCKED_SAVES = new Set(['conflict', 'elsewhere', 'signed-out', 'error', 'offline']);
const COPY = Object.freeze({
  connecting: 'The street is still connecting. Try again in a moment.',
  timeout: 'The garden did not answer. Try again.',
  busy: 'Hold on, still asking the garden.',
});
const VERBS = new Set(['plant', 'water', 'harvest', 'clear', 'fertilize']);
/** The crops a grant may carry: every seed's crop (js/garden.js SEED_CATALOG), with its label. */
const CROPS = new Map(Object.values(SEED_CATALOG).map((s) => [s.cropId, s.cropLabel]));

let client = null;
let copy = freshCopy();
let syncedStreet = '';
let syncAskedAt = 0;
let reqSeq = 0;
const pending = new Map();
let grant = null;
let lastAnswer = '';
let applied = [];
const applying = new Set();
let stripped = false;
let multiplayer = false;
/** Another player's tool over their head (garden_ev "tool"): player id -> { root, until }. */
const overlays = new Map();

function freshCopy() {
  return { street: '', snap: false, none: false, offset: 0, lock: 60000, plots: new Map(), beds: new Map() };
}

function reset() {
  copy = freshCopy();
  syncedStreet = '';
}

function me() {
  return Number(client?.me?.id) || 0;
}

function shared(engine) {
  return engine?.mode === 'multiplayer' && Boolean(client) && client.state === 'online' && copy.snap && !copy.none && copy.street === engine.streetTsid;
}

function publish(engine) {
  const street = engine.streetTsid || '';
  let state = 'waiting';
  if (!isSharedGardenStreet(street)) state = 'local';
  else if (copy.street === street && copy.none) state = 'none';
  else if (copy.street === street && copy.snap) state = 'snap';
  engine.setData?.('sharedGardens', `${street}:${state}`);
  engine.setData?.('sharedGardensLast', lastAnswer);
  const view = [];
  for (const [bed, garden] of copy.beds) {
    for (const [key, p] of Object.entries(garden.plots || {})) {
      if (p.state === 'clean' && !p.wet) continue;
      view.push(`${plotId(bed, key)}=${p.state}${p.wet ? 'w' : ''}${p.seed ? `:${p.seed}` : ''}${p.planter && p.lockUntil > Date.now() ? `@${p.planter}` : ''}`);
    }
  }
  engine.setData?.('sharedGardensView', view.join(','));
}

/** The bed entities on this street that are this feature's (garden.shared). */
function bedTargets(engine) {
  return (engine.interactables || []).filter((t) => t.classId === 'garden_new' && t.state?.garden?.shared);
}

function redraw(engine) {
  for (const t of bedTargets(engine)) engine.refreshGarden?.(t);
  publish(engine);
}

/** Apply the server's plots (by id) to this page's beds. */
function takePlots(engine, plots, now) {
  if (!plots || typeof plots !== 'object') return;
  for (const [id, s] of Object.entries(plots)) {
    const at = parsePlotId(id);
    const garden = at && copy.beds.get(at.bed);
    const plot = garden?.plots?.[at.key];
    copy.plots.set(id, s);
    if (plot) applyPlot(plot, s, copy.offset, now);
  }
}

/** Every plot not in a snapshot is fresh. */
function takeSnapshot(engine, msg) {
  const now = Date.now();
  copy.street = msg.street;
  copy.snap = true;
  copy.none = Boolean(msg.none);
  copy.offset = Number.isFinite(msg.now) ? msg.now - now : 0;
  copy.lock = Number(msg.lock) || copy.lock;
  copy.plots = new Map();
  if (copy.none) {
    backToLocal(engine);
    return;
  }
  adoptBeds(engine);
  for (const [bed, garden] of copy.beds) {
    for (const key of Object.keys(garden.plots || {})) applyPlot(garden.plots[key], { state: 'clean' }, copy.offset, now);
  }
  takePlots(engine, msg.plots, now);
  stripOldCopies(engine);
  redraw(engine);
}

/** The bed this feature holds for a garden type on this street (made the first time). */
function sharedBed(engine, gardenType, cols, rows) {
  const bed = gardenType === 'herb' ? 'herb' : 'default';
  let garden = copy.beds.get(bed);
  if (!garden || garden.street !== engine.streetTsid) {
    garden = createGarden({ cols, rows, gardenType: bed });
    garden.shared = true;
    garden.street = engine.streetTsid;
    garden.source = 'shared public garden (G368)';
    copy.beds.set(bed, garden);
  }
  return garden;
}

/**
 * Street beds drawn before the realtime client was there (spawnGarden asked too early) are the
 * save's own: once the server shares the street they become this feature's.
 */
function adoptBeds(engine) {
  for (const t of engine.interactables || []) {
    const g = t.classId === 'garden_new' ? t.state?.garden : null;
    if (!g || g.shared || t.state.detached) continue;
    const garden = sharedBed(engine, g.gardenType, g.cols, g.rows);
    t.state.garden = garden;
    for (const p of t.state.plotTargets || []) {
      p.state.garden = garden;
      p.state.plot = garden.plots[p.state.plotKey] || p.state.plot;
    }
  }
}

/**
 * The server shares the gardens: this save's own beds on the ten streets go (the site paid them out
 * once, by mail). They were hidden already; a stale copy written back by an old page goes again.
 */
function stripOldCopies(engine) {
  if (stripped) return;
  stripped = true;
  const visited = new Set(engine.visitedStreets?.() || []);
  let n = 0;
  for (const tsid of SHARED_GARDEN_STREETS) {
    if (!visited.has(tsid)) continue;
    const street = engine.streetWorld?.(tsid);
    if (street && street.gardens && Object.keys(street.gardens).length) {
      street.gardens = {};
      n += 1;
    }
  }
  if (n) engine.save?.();
  engine.setData?.('sharedGardensStripped', String(n));
}

/** No shared gardens after all (a server without them, realtime gone): the save's own plots again. */
function backToLocal(engine) {
  const street = engine.streetWorld?.(engine.streetTsid);
  for (const t of bedTargets(engine)) {
    const g = t.state.garden;
    const local = street?.gardens?.[g.gardenType] || createGarden({ cols: g.cols, rows: g.rows, gardenType: g.gardenType });
    if (street) street.gardens[g.gardenType] = local;
    t.state.garden = local;
    for (const p of t.state.plotTargets || []) {
      p.state.garden = local;
      p.state.plot = local.plots?.[p.state.plotKey] || p.state.plot;
    }
    engine.refreshGarden?.(t);
  }
  copy.beds = new Map();
  publish(engine);
}

function bind(engine) {
  if (client) return client;
  const c = engine.query?.('realtimeClient');
  if (!c) return null;
  client = c;
  c.on('state', ({ state }) => {
    if (state === 'online') return;
    if (pending.size && !LOCAL_STATES.has(state)) engine.toast?.(COPY.timeout, 2400);
    pending.clear();
    if (LOCAL_STATES.has(state)) backToLocal(engine);
    const beds = copy.beds;
    reset();
    copy.beds = beds;
    publish(engine);
  });
  c.on('roster', ({ street }) => {
    if (!street || street === syncedStreet) return;
    const beds = copy.beds;
    reset();
    copy.beds = beds;
    syncedStreet = street;
    if (isSharedGardenStreet(street)) {
      syncAskedAt = Date.now();
      c.send('garden_sync');
    }
  });
  c.on('msg:gardens', (msg) => {
    if (!msg || msg.street !== engine.streetTsid) return;
    if (msg.snap) takeSnapshot(engine, msg);
    else if (copy.snap && !copy.none) {
      takePlots(engine, msg.plots, Date.now());
      redraw(engine);
    }
  });
  // A server without gardens.go answers garden_sync with bad_frame: the save's own plots, as before.
  c.on('error', ({ code }) => {
    if (code !== 'bad_frame' || !isSharedGardenStreet(syncedStreet) || copy.snap) return;
    takeSnapshot(engine, { street: syncedStreet, snap: true, none: true });
  });
  c.on('msg:garden_ok', (msg) => answered(engine, msg, true));
  c.on('msg:garden_no', (msg) => answered(engine, msg, false));
  c.on('msg:garden_grant', (msg) => applyLateGrant(engine, msg));
  // Someone else tended: their can, hoe or Guano over their head (include/garden.js 708-722, master_garden.js 868-881).
  c.on('msg:garden_ev', (msg) => {
    if (!msg?.tool || msg.street !== engine.streetTsid || Number(msg.by) === me()) return;
    showToolOver(engine, Number(msg.by), String(msg.tool), Number(msg.ms) || 2000);
  });
  return c;
}

/** Where another player stands now (realtime-feature's drawn players), or null. */
function remoteAt(engine, id) {
  const row = (engine.query?.('minimapPlayers') || []).find((p) => Number(p.id) === id);
  return row && Number.isFinite(row.x) && Number.isFinite(row.y) ? row : null;
}

/**
 * The original's pc_overlay to the others on the street (apiSendAnnouncementX): a 40 by 40 bubble at
 * delta_y -110 over the tender, the tool in its tool_animation where the remake has the sheet, its
 * icon otherwise (js/job-work-fx.js, as a street project's work shows the worker's tool).
 */
function showToolOver(engine, id, tool, ms) {
  const { PIXI } = engine;
  const at = remoteAt(engine, id);
  if (!PIXI || !at || !(engine.fxLayer || engine.entityLayer)) return;
  dropOverlay(id);
  const root = new PIXI.Container();
  root.zIndex = 40;
  root.label = 'garden-tool-over';
  const { width: w, height: h } = JOB_WORK_OVERLAY;
  const r = Math.round(Math.max(w, h) / 2 + 9);
  const bubble = new PIXI.Graphics();
  bubble.circle(0, 0, r).fill({ color: 0xffffff, alpha: 0.94 }).stroke({ color: 0x8c7a5b, width: 1.5, alpha: 0.7 });
  bubble.poly([-6, r - 2, 6, r - 2, 0, r + 9]).fill({ color: 0xffffff, alpha: 0.94 });
  root.addChild(bubble);
  const sheet = jobWorkToolSheet(tool);
  let art;
  if (sheet) {
    const base = sourceFromUrl(sheet.url);
    const frames = [];
    for (let i = 0; i < sheet.frames; i += 1) frames.push(frameTexture(base, new PIXI.Rectangle((i % sheet.cols) * sheet.fw, Math.floor(i / sheet.cols) * sheet.fh, sheet.fw, sheet.fh)));
    art = new PIXI.AnimatedSprite(frames);
    art.animationSpeed = sheet.fps / 60;
    art.loop = true;
    art.scale.set(jobWorkToolScale(sheet));
    art.play();
  } else {
    art = new PIXI.Sprite(textureFromUrl(itemIcon(tool)));
    art.width = w;
    art.height = h;
  }
  art.anchor.set(0.5);
  root.addChild(art);
  root.x = at.x;
  root.y = at.y + JOB_WORK_OVERLAY.deltaY;
  (engine.fxLayer || engine.entityLayer).addChild(root);
  overlays.set(id, { root, until: Date.now() + Math.max(500, Math.min(6000, ms)) });
  engine.setData?.('sharedGardensToolOver', `${id}:${tool}:${sheet ? 'animation' : 'icon'}`);
}

function dropOverlay(id) {
  const o = overlays.get(id);
  if (o?.root && !o.root.destroyed) o.root.destroy({ children: true });
  overlays.delete(id);
}

/** Each frame: the bubbles follow their players, and go when their time is up or the player left. */
function tickOverlays(engine) {
  const now = Date.now();
  for (const [id, o] of overlays) {
    const at = remoteAt(engine, id);
    if (!at || now >= o.until || o.root.destroyed) {
      dropOverlay(id);
      continue;
    }
    o.root.x = at.x;
    o.root.y = at.y + JOB_WORK_OVERLAY.deltaY;
  }
}

async function persist(engine) {
  engine.save?.();
  if (typeof saveStore?.flush !== 'function') return true;
  for (let i = 0; i < 6; i += 1) {
    let st;
    try {
      st = await saveStore.flush();
    } catch {
      return false;
    }
    const now = saveStore.state || st;
    if (now === 'saved') return true;
    if (BLOCKED_SAVES.has(now)) return false;
  }
  return saveStore.state === 'saved';
}

function learned(engine) {
  return engine.learnedSkills || [];
}

function upgrades(engine) {
  return engine.pc?.imaginationUpgrades || [];
}

/** Whether a working tool from list can take wear (game.js passes the same checks to garden.js). */
function toolWorks(engine, tools, wear) {
  const found = firstWorkingTool(engine.toolState || null, engine.inv, tools, wear);
  const id = found ? found.tool || found.fallback : null;
  if (!id || !engine.toolState) return true;
  return canUseTool(engine.toolState, id, wear).ok;
}

/** The can or hoe js/garden.js will use (a working Irrigator 9000 or High-Class Hoe first), for the others' overlay. */
function toolUsed(engine, tools, wear) {
  const found = firstWorkingTool(engine.toolState || null, engine.inv, tools, wear);
  return found ? found.tool || found.fallback || tools[tools.length - 1] : tools[tools.length - 1];
}

/**
 * What the verb would need from the server, or null when js/garden.js will refuse it here first
 * (no seed, no tool, too tired, the plot not ready): then it runs here alone and changes no plot.
 * { send, rolls } where send is the message's extra fields.
 */
function planVerb(engine, target, verbId) {
  const garden = target.state?.garden;
  const gType = garden?.gardenType === 'herb' ? 'herb' : 'default';
  const pc = engine.pc || {};
  const inv = engine.inv || {};
  const energy = Number(pc.energy) || 0;
  if (verbId === 'water_all') {
    if (!gardenNeedsWater(garden) || !hasWateringCan(inv)) return null;
    const profile = gardenActionProfile(gType, 'water', learned(engine), upgrades(engine));
    if (!toolWorks(engine, WATERING_CAN_TOOLS, profile.toolWear)) return null;
    // waterAllPlots: each dry plot in order, its own roll and energy; out of energy, it stops.
    const ids = [];
    const rolls = [];
    let left = energy;
    for (const key of Object.keys(garden.plots || {})) {
      if (garden.plots[key].wet) continue;
      if (left <= profile.energy) break;
      left -= profile.energy;
      const roll = Math.random();
      rolls.push(roll);
      if (rollPasses(roll, profile.successRate)) ids.push(plotId(gType, key));
    }
    if (!ids.length) return { local: true, rolls };
    return { send: { bed: gType, ids, tool: toolUsed(engine, WATERING_CAN_TOOLS, profile.toolWear) }, rolls };
  }
  const plot = target.state?.plot;
  const key = target.state?.plotKey;
  if (!plot || !key) return null;
  const id = plotId(gType, key);
  const cost = (action) => gardenActionProfile(gType, action, learned(engine), upgrades(engine)).energy;
  if (verbId === 'plant') {
    const seed = pickSeedToPlant(inv, undefined, gType);
    if (plot.state !== 'clean' || !seed || !seedFitsGarden(seed, gType) || energy <= cost('plant')) return null;
    const mod = 1 - gardenGrowModifier(gType, upgrades(engine));
    return { send: { id, seed: seed.seedId, mod }, rolls: [], flush: true };
  }
  if (verbId === 'water') {
    const profile = gardenActionProfile(gType, 'water', learned(engine), upgrades(engine));
    if (plot.wet || !hasWateringCan(inv) || !toolWorks(engine, WATERING_CAN_TOOLS, profile.toolWear) || energy <= profile.energy) return null;
    const roll = Math.random();
    return rollPasses(roll, profile.successRate) ? { send: { id, tool: toolUsed(engine, WATERING_CAN_TOOLS, profile.toolWear) }, rolls: [roll] } : { local: true, rolls: [roll] };
  }
  if (verbId === 'harvest') {
    const profile = gardenActionProfile(gType, 'harvest', learned(engine), upgrades(engine));
    if (plot.state !== 'crop' || !SEED_CATALOG[plot.seed] || energy <= profile.energy) return null;
    const roll = Math.random();
    if (!rollPasses(roll, profile.successRate)) return { local: true, rolls: [roll] };
    // include/garden.js 474-484: the full count with Croppery I (crop beds) or Herbalism I (herb beds).
    return { send: { id, perks: profile.halfHarvest ? [] : ['full'] }, rolls: [roll], harvest: true };
  }
  if (verbId === 'clear') {
    const profile = gardenActionProfile(gType, 'clear', learned(engine), upgrades(engine), { aggressiveOff: pc.aggressiveOff === true });
    if (plot.state !== 'dirty' || !hasHoe(inv) || !toolWorks(engine, HOE_TOOLS, profile.toolWear) || energy <= profile.energy) return null;
    return { send: { id, tool: toolUsed(engine, HOE_TOOLS, profile.toolWear) }, rolls: [] };
  }
  if (verbId === 'fertilize') {
    if (!fertilizeCheck(plot).ok || countItem(inv, GARDEN_FERTILIZER) < 1) return null;
    return { send: { id }, rolls: [], flush: true };
  }
  return null;
}

/** Run the verb here with the given draws (js/garden.js under the grant), then put back the server's plots. */
function runHere(engine, target, verbId, rolls, extra = {}) {
  grant = { target, verbId, rolls, garden: true, ...extra };
  try {
    engine.executeVerb?.(target, verbId, { animated: true });
  } finally {
    grant = null;
  }
}

function restorePlots(engine, target) {
  const garden = target.state?.garden;
  if (!garden?.shared) return;
  const now = Date.now();
  for (const key of Object.keys(garden.plots || {})) {
    const s = copy.plots.get(plotId(garden.gardenType, key)) || { state: 'clean' };
    applyPlot(garden.plots[key], s, copy.offset, now);
  }
  engine.refreshGarden?.(target.classId === 'garden_new' ? target : target.state?.gardenEntity);
}

function isSharedTarget(target) {
  if (target?.classId === 'garden_plot') return Boolean(target.state?.garden?.shared);
  return target?.classId === 'garden_new' && Boolean(target.state?.garden?.shared);
}

/** Ask the server before a shared plot's verb lands: true when asked (or refused for now), null when local. */
function ask(engine, target, verbId) {
  if (engine.mode !== 'multiplayer' || !isSharedTarget(target)) return null;
  if (grant && grant.target === target && grant.verbId === verbId) return null;
  const isBed = target.classId === 'garden_new';
  if (isBed ? verbId !== 'water_all' : !VERBS.has(verbId)) return null;
  const c = bind(engine);
  if (!c || LOCAL_STATES.has(c.state)) return null;
  if (!shared(engine)) {
    engine.toast?.(COPY.connecting, 2400);
    return true;
  }
  const plan = planVerb(engine, target, verbId);
  if (!plan || plan.local) {
    // The page refuses (or the roll failed): it runs here alone, and the plot stays the server's.
    runHere(engine, target, verbId, plan?.rolls || [], { local: true });
    restorePlots(engine, target);
    return true;
  }
  const id = plan.send.id || `bed:${plan.send.bed}`;
  for (const p of pending.values()) {
    if (p.id === id) {
      engine.toast?.(COPY.busy, 1600);
      return true;
    }
  }
  reqSeq += 1;
  const req = reqSeq;
  pending.set(req, { id, target, verbId, rolls: plan.rolls, at: Date.now() });
  const send = () => {
    if (!pending.has(req)) return;
    pending.get(req).at = Date.now();
    if (!c.send('garden_act', { req, verb: verbId, ...plan.send })) {
      pending.delete(req);
      engine.toast?.(COPY.connecting, 2400);
    }
  };
  if (plan.flush) {
    // The plan's catch 1: the ledger learns of a seed (or Guano) bought a moment ago from the save write.
    persist(engine).finally(send);
  } else send();
  return true;
}

function answered(engine, msg, ok) {
  const p = pending.get(msg?.req);
  if (p) pending.delete(msg.req);
  const now = Date.now();
  if (Number.isFinite(msg?.now)) copy.offset = msg.now - now;
  lastAnswer = `${msg?.id || msg?.bed || ''}:${msg?.verb || ''}:${ok ? 'ok' : msg?.code || 'no'}`;
  if (!p || copy.street !== engine.streetTsid) {
    if (msg?.plots) takePlots(engine, msg.plots, now);
    redraw(engine);
    return;
  }
  if (!ok) {
    if (msg.plots) takePlots(engine, msg.plots, now);
    redraw(engine);
    const line = String(msg.message || 'Not now.');
    engine.toast?.(line, 2600);
    engine.pushActivity?.(line);
    engine.playSound?.('CLICK_FAILURE', { volume: 0.45 });
    return;
  }
  // The local rules run on the plots as the server had them, with the page's own draws.
  if (msg.before) takePlots(engine, msg.before, now);
  if (p.verbId === 'potion') {
    landPour(engine, p, msg, now);
    return;
  }
  const use = msg.use && typeof msg.use === 'object' ? msg.use : null;
  if (use?.spent && use.n && use.op) engine.query?.('ledgerReceipt', String(use.op), engine);
  const g = msg.grant && typeof msg.grant === 'object' ? msg.grant : null;
  const before = g ? countItem(engine.inv, g.c) : 0;
  runHere(engine, p.target, p.verbId, p.rolls);
  // Then the server's word on the plots.
  if (msg.plots) takePlots(engine, msg.plots, now);
  redraw(engine);
  if (g) finishGrant(engine, g, before);
}

/** A Master Gardener pour the server worked: the pour here, its seeds' op once, the server's plots, the crops' grants. */
function landPour(engine, p, msg, now) {
  const seeds = msg.seeds && typeof msg.seeds === 'object' ? msg.seeds : null;
  if (seeds?.spent && seeds.n && seeds.op) engine.query?.('ledgerReceipt', String(seeds.op), engine);
  const grants = Array.isArray(msg.grants) ? msg.grants.filter((g) => g && typeof g === 'object') : [];
  const before = Object.fromEntries(grants.map((g) => [g.c, countItem(engine.inv, g.c)]));
  engine.query?.('masterGardenPourGranted', p.pour, { use: msg.use && typeof msg.use === 'object' ? msg.use : null }, engine);
  if (msg.plots) takePlots(engine, msg.plots, now);
  redraw(engine);
  for (const g of grants) finishGrant(engine, g, before[g.c] || 0);
}

/** A pick's grant: the pick added the crop (else the base crop goes in here), the save is written, then acknowledged. */
async function finishGrant(engine, g, before) {
  const id = String(g.id || '');
  if (!/^gg-[0-9a-z-]{1,37}$/.test(id) || applied.includes(id)) return;
  const n = Math.max(0, Math.floor(Number(g.n) || 0));
  if (countItem(engine.inv, g.c) - before < n && CROPS.has(g.c)) {
    addItem(engine.inv, g.c, n - Math.max(0, countItem(engine.inv, g.c) - before));
    engine.refreshPack?.();
  }
  applied = [...applied, id].slice(-APPLIED_KEEP);
  await new Promise((done) => setTimeout(done, GRANT_SAVE_DELAY_MS));
  if (await persist(engine)) client?.send('garden_ack', { id });
}

/** A grant the server resent (the answer to a pick never reached this page): the base crop, once. */
async function applyLateGrant(engine, msg) {
  const id = String(msg?.id || '');
  if (!/^gg-[0-9a-z-]{1,37}$/.test(id) || applying.has(id)) return;
  if (applied.includes(id)) {
    if (await persist(engine)) client?.send('garden_ack', { id });
    return;
  }
  const n = Math.max(0, Math.min(999, Math.floor(Number(msg.n) || 0)));
  const c = String(msg.c || '');
  if (!n || !CROPS.has(c)) return;
  applying.add(id);
  addItem(engine.inv, c, n);
  applied = [...applied, id].slice(-APPLIED_KEEP);
  const label = ITEM_CATALOG[c]?.label || CROPS.get(c);
  engine.pushActivity?.(`Your crops from the public garden: ${n}× ${label}.`);
  engine.refreshPack?.();
  lastAnswer = `grant:${id}:${c}:${n}`;
  publish(engine);
  const ok = await persist(engine);
  applying.delete(id);
  if (ok) client?.send('garden_ack', { id });
}

export const sharedGardensFeature = {
  id: SHARED_GARDENS_FEATURE_ID,

  init(engine) {
    multiplayer = engine.mode === 'multiplayer';
    if (!multiplayer) return;
    if (typeof window !== 'undefined') {
      window.groddleSharedGardens = {
        plots: () => Object.fromEntries(copy.plots),
        beds: () => Object.fromEntries([...copy.beds].map(([bed, g]) => [bed, g.plots])),
        dev: (opts = {}) => client?.send('garden_dev', { lock: Number(opts.lock) || 0, water: Number(opts.water) || 0 }),
        state: () => ({ street: copy.street, snap: copy.snap, none: copy.none, pending: pending.size, applied: applied.length, stripped }),
        count: (c) => countItem(engine.inv, String(c)),
        me: () => me(),
        /** A bed's foot (Water All) in client px. */
        bedPoint(bed) {
          const t = bedTargets(engine).find((b) => b.state.garden.gardenType === bed);
          const rect = document.querySelector('#game-root > canvas')?.getBoundingClientRect();
          if (!t || !rect || !engine.entityLayer) return null;
          // Just below the front plots, whose hit boxes win over the bed's foot strip (game.js spawnGarden bedFoot).
          const g = engine.entityLayer.toGlobal(new engine.PIXI.Point(t.sprite.x, t.sprite.y + 6));
          const k = rect.width / (engine.camera?.w || 960);
          return { x: rect.left + g.x * k, y: rect.top + g.y * k };
        },
        /** A plot's middle in client px, for a real click (garden-guano-feature's point). */
        point(id) {
          const at = parsePlotId(id);
          const t = (engine.interactables || []).find((p) => p.classId === 'garden_plot' && p.state?.garden?.shared && p.state.garden.gardenType === at?.bed && p.state.plotKey === at?.key);
          const rect = document.querySelector('#game-root > canvas')?.getBoundingClientRect();
          if (!t || !rect || !engine.entityLayer) return null;
          const g = engine.entityLayer.toGlobal(new engine.PIXI.Point(t.sprite.x, t.sprite.y - t.sprite._gardenHitH / 2));
          const k = rect.width / (engine.camera?.w || 960);
          return { x: rect.left + g.x * k, y: rect.top + g.y * k };
        },
      };
    }
    publish(engine);
  },

  /**
   * game.js spawnGarden on a street bed: the shared bed this feature holds, or null when the bed
   * is the save's own (solo, a street not shared, no live realtime, a server without gardens).
   */
  sharedGardenFor(gardenType, size, engine) {
    if (engine?.mode !== 'multiplayer' || !isSharedGardenStreet(engine.streetTsid)) return null;
    const c = bind(engine);
    if (!c || LOCAL_STATES.has(c.state)) return null;
    if (copy.street === engine.streetTsid && copy.none) return null;
    const bed = gardenType === 'herb' ? 'herb' : 'default';
    const garden = sharedBed(engine, bed, size?.cols, size?.rows);
    const now = Date.now();
    for (const key of Object.keys(garden.plots)) {
      const s = copy.street === engine.streetTsid ? copy.plots.get(plotId(bed, key)) : null;
      applyPlot(garden.plots[key], s || { state: 'clean' }, copy.offset, now);
    }
    publish(engine);
    return garden;
  },

  onStreetClear() {
    pending.clear();
    grant = null;
    copy.beds = new Map();
    for (const id of [...overlays.keys()]) dropOverlay(id);
  },

  onTick(dtMs, now, engine) {
    if (engine.mode !== 'multiplayer' || !engine.started) return;
    const c = bind(engine);
    if (!c) return;
    if (c.state === 'online' && c.street && c.street !== syncedStreet) {
      const beds = copy.beds;
      reset();
      copy.beds = beds;
      syncedStreet = c.street;
      if (isSharedGardenStreet(c.street)) {
        syncAskedAt = Date.now();
        c.send('garden_sync');
      }
    }
    const wall = Date.now();
    if (c.state === 'online' && isSharedGardenStreet(syncedStreet) && c.street === syncedStreet && !copy.snap && wall - syncAskedAt >= SYNC_RETRY_MS) {
      syncAskedAt = wall;
      c.send('garden_sync');
    }
    for (const [req, p] of pending) {
      if (wall - p.at < REQUEST_TIMEOUT_MS) continue;
      pending.delete(req);
      engine.toast?.(COPY.timeout, 2400);
    }
    if (overlays.size) tickOverlays(engine);
  },

  /** game.js executeVerb: a shared plot's verb asks the server before it lands. */
  runVerbOverride(target, verbId, engine) {
    return ask(engine, target, verbId);
  },

  /** game.js runVerb: the page's own draws for the verb the server allowed (js/garden.js rolls). */
  sharedVerbGrant(target, verbId) {
    if (!grant || grant.target !== target || grant.verbId !== verbId) return null;
    return { rolls: grant.rolls || [], garden: true };
  },

  /** game.js beginVerbAction: another player's crop in its planter's 60 seconds (GardenView.as 481-486). */
  verbRefusedNow(target, verbId, engine) {
    if (verbId !== 'harvest' || target?.classId !== 'garden_plot' || !target.state?.garden?.shared || !shared(engine)) return null;
    return lockedFor(target.state.plot, me()) ? LOCK_LINE : null;
  },

  /**
   * G368 slice 2: a Master Gardener pour on a shared bed (master-garden-feature finishPour, after its
   * 2.5 s pour): the realtime server takes the bottle's charge and a Seed-Dibber's seeds through the
   * ledger and works the bed (gardens_potions.go); its go-ahead lands the pour here through
   * masterGardenPourGranted. pour: { potionClass, seedId, target, copy, n, k, mod }. True when asked.
   */
  sharedPotionPour(pour, engine) {
    const target = pour?.target;
    if (engine?.mode !== 'multiplayer' || !target?.state?.garden?.shared) return null;
    const c = bind(engine);
    if (!c || LOCAL_STATES.has(c.state)) return null;
    if (!shared(engine)) {
      engine.toast?.(COPY.connecting, 2400);
      return true;
    }
    const bed = target.state.garden.gardenType === 'herb' ? 'herb' : 'default';
    const id = `bed:${bed}`;
    for (const p of pending.values()) {
      if (p.id === id) {
        engine.toast?.(COPY.busy, 1600);
        return true;
      }
    }
    reqSeq += 1;
    const req = reqSeq;
    const msg = { req, bed, c: pour.potionClass, n: Math.max(1, Math.floor(Number(pour.n) || 1)) };
    if (Number.isInteger(pour.k) && pour.k >= 0) msg.k = pour.k;
    if (pour.seedId) msg.seed = pour.seedId;
    if (Number.isFinite(pour.mod)) msg.mod = pour.mod;
    pending.set(req, { id, target, verbId: 'potion', pour, at: Date.now() });
    // The ledger learns of a bottle or seeds bought a moment ago from the save write (the plan's catch 1).
    persist(engine).finally(() => {
      if (!pending.has(req)) return;
      pending.get(req).at = Date.now();
      if (!c.send('garden_potion', msg)) {
        pending.delete(req);
        engine.toast?.(COPY.connecting, 2400);
      }
    });
    return true;
  },

  save() {
    if (!multiplayer || !applied.length) return undefined;
    return { applied };
  },

  restore(slice, engine) {
    multiplayer = engine?.mode === 'multiplayer';
    applied = multiplayer && Array.isArray(slice?.applied)
      ? slice.applied.filter((id) => typeof id === 'string' && /^gg-[0-9a-z-]{1,37}$/.test(id)).slice(-APPLIED_KEEP)
      : [];
  },

  /** QA / tests. */
  _state() {
    return { street: copy.street, snap: copy.snap, none: copy.none, beds: copy.beds.size, plots: copy.plots.size, pending: pending.size, applied: [...applied], stripped };
  },
  _reset() {
    client = null;
    reset();
    pending.clear();
    grant = null;
    reqSeq = 0;
    lastAnswer = '';
    applied = [];
    applying.clear();
    stripped = false;
  },
};

