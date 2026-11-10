/**
 * Shared street Patches in multiplayer (register G564): a street Patch, its
 * Seedling, the tree grown in it and a dead tree's plot are the same for
 * everyone on a street the realtime server shares (groddle-afternoon-server
 * patches.go), as the original's were (a Patch is an item in the street:
 * items/patch.js, patch_seedling.js). Rules for the page: js/shared-patches.js;
 * the plan: research/plans/g564-shared-street-patches.md.
 *
 * DARK: off unless js/shared-patches.js SHARED_PATCHES_ON is true or this
 * browser's QA flag groddle.qa.sharedPatches is '1' (js/shared-patches.js reads it). Off, every hook
 * here answers null and patches-feature keeps the save's own plots: nothing
 * changes for players until a release turns it on.
 *
 * - On a street join the page asks for the street's plots (patch_sync). The
 *   server decides (every laid-out street since slice 3, or its data's pilot
 *   list): "none" (or a server without the module, its
 *   bad_frame) keeps the save's own plots, as before G564. Solo never comes here.
 * - patches-feature lays the street's plots out from this feature
 *   (sharedPatchPlots: the plots held here, never the save) and redraws when
 *   the server's snapshot or a change lands (sharedPlotsChanged). The server
 *   grows them: weeds back, holes filling, Seedlings growing or withering,
 *   maturity steps, trees included.
 * - Every soil verb asks the server first: tend, dig, plant, pet a Seedling,
 *   clear a dead tree. The page's own checks (tool, energy, stage, bean) refuse
 *   here as in solo, before anything is asked. Tend and dig tell the server
 *   when their action bar begins (the one-tender lock, patch.js 171-174,
 *   373-381) and when it is cancelled. The tend success roll and the dig's Loam
 *   roll are drawn here before asking (js/shared-patches.js soilRolls): a failed
 *   tend runs here alone and changes no plot. On the go-ahead the verb runs
 *   here (patches-feature runSharedVerb) on the plot as the server had it
 *   ("before"), with the same draws, then the server's plot lands ("plot").
 * - Plant: the save is written first (the ledger learns of a bean bought a
 *   moment ago), the server's ledger takes the bean, and the answer's "use" op
 *   is applied once (ledgerReceipt) as the plant takes the bean from the pack.
 * - Dig's Earth and a clear's Planks are the server's receipts: the answer's
 *   grant (or a grant resent on connect, patch_grant) is added once by id, the
 *   save is written, then acknowledged (patch_ack).
 * - Pet a Seedling: the server counts the three pettings; its "first" and
 *   "owner" decide the quest counters (patch_seedling:pet once per player,
 *   patch_seedling:grown for the planter's third, patch_seedling.js 200-216).
 * - Another player's tend or dig (patch_ev, or the plot's tender) refuses this
 *   player's tend or dig before the action bar with the original's line.
 * - The old personal plots: once the server says it shares a street, this
 *   save's own plots on that street go (the site pays them out once, plan
 *   section 10), so a stale copy never comes back. Other streets keep theirs.
 * - Grown trees here are drawn from the server's numbers and answer to it (lane
 *   3, slice 1): pet, water and harvest ask first (runVerbOverride; the
 *   player's own tools, skill and energy refuse here first, as in solo), and
 *   the go-ahead runs the verb here on the tree as the server had it, with the
 *   server's care roll (sharedVerbGrant, as street-objects-feature does for
 *   street trees). A harvest's fruit or Planks are the server's grant: added
 *   once by id, saved, then acknowledged; this player's harvests today are the
 *   server's count (plan section 7). Tree Poison and its Antidote ask through
 *   tree-death-feature (sharedPatchTreeVerb); the ledger's use of the bottle
 *   comes with the go-ahead, and the clock, anyone's cure and the death are
 *   the server's (the tree becomes its dead class for everyone; guilt and mood
 *   stay the pourer's page's). Quest counters, iMG, energy and mood come only
 *   from the verb run on a go-ahead.
 * - Slice 2: Trantsformation Fluid on a shared Patch tree asks here too
 *   (potions-feature, sharedPatchTrantsform: patch_act "trantsform" with the
 *   bottle "k"); the server's ledger uses the bottle and the server picks the
 *   new tree for everyone; its go-ahead lands the new plot and hands
 *   potions-feature the answer (trantsformGranted: the bottle, the poof, the
 *   line). Fertilidust is street-objects-feature's obj_dust (sharedFertilize)
 *   and the Rook rook-attack-feature's (the server strips Patch trees itself).
 *
 * QA: canvas data sharedPatches (street:off|local|waiting|snap|none),
 * sharedPatchesLast (key:verb:ok|code), sharedPatchesView (each plot as this page has it:
 * patch:0=seedling:trant_spice:2). window.groddleSharedPatches: plots(), state(), point(key),
 * count(c), me(), dev(opts) for a server started with GRODDLE_PATCHES_DEV=1.
 */

import { addItem, countItem, ITEM_CATALOG } from '../inventory.js?v=60dfc9ca';
import { saveStore } from '../save-store.js?v=8839ba7b';
import { patchesFeature } from './patches-feature.js?v=68438dca';
import {
  COPY,
  GRANT_CLASSES,
  GRANT_ID,
  applyPatchPlot,
  isSharedKey,
  localPatchPlot,
  mayAskStreet,
  plantGrowLevel,
  refusalLine,
  CLEARED_FIRST_LINE,
  refusedBeforeBar,
  sharedPatchesOn,
  soilRolls,
  stripSharedPlots,
  treePlotSpot,
  POUR_WIRE,
  TREE_VERBS,
  newDayTree,
  prepareGrantedTree,
  sharedTreeKey,
  sharedTreeReady,
  sharedTreeSkill,
  TRANTSFORM_VERB,
} from '../shared-patches.js?v=630929b3';

export const SHARED_PATCHES_FEATURE_ID = 'shared-patches';
const REQUEST_TIMEOUT_MS = 8000;
const SYNC_RETRY_MS = 3000;
const APPLIED_KEEP = 100;
/** The tend lock the server holds (patch.js 408-409), when a start's answer doesn't say. */
const TEND_LOCK_MS = 10000;
/**
 * A fresh grant's save waits this long: the server's receipt goes to the site through its credit
 * outbox (credits.go, batched), and a save that shows the items first pays them from the budget.
 */
const GRANT_SAVE_DELAY_MS = 2500;
const LOCAL_STATES = new Set(['off', 'signed-out', 'replaced', 'stopped']);
const BLOCKED_SAVES = new Set(['conflict', 'elsewhere', 'signed-out', 'error', 'offline']);
/** The soil verbs this feature asks about (tree verbs stay the page's until lane 3). */
const SOIL_VERBS = new Set(['tend', 'dig', 'plant', 'pet', 'clear']);
/** Verbs with an action bar the server hears the start of. */
const BAR_VERBS = new Set(['tend', 'dig']);

let client = null;
let multiplayer = false;
let enabled = false;
let copy = freshCopy('');
let syncedStreet = '';
let syncAskedAt = 0;
let reqSeq = 0;
const pending = new Map();
/** Streets the server said it doesn't share, this connection (no flash of shared soil next time). */
const noneStreets = new Set();
/** The server has no Patches module (bad_frame) on this connection. */
let serverOff = false;
let lastAnswer = '';
let applied = [];
const applying = new Set();
const strippedStreets = new Set();
/** Plots whose tend or dig start the server refused: the landing is not asked again (one line, not two). */
const startRefused = new Set();
/** The go-ahead for a tree verb while it runs here: { target, verbId, roll, use } (sharedVerbGrant). */
let treeGrant = null;
/** QA only: a shorter poison clock sent with a pour (the server takes it with GRODDLE_PATCHES_DEV=1). */
let qaPoisonMs = 0;

function freshCopy(street) {
  return { street, snap: false, none: false, offset: 0, timers: null, server: new Map(), plots: new Map(), spots: new Map() };
}

function me() {
  return Number(client?.me?.id) || 0;
}

/** Live: multiplayer, switched on, a realtime client that isn't signed off. */
function live(engine) {
  if (!enabled || engine?.mode !== 'multiplayer') return false;
  const c = bind(engine);
  return Boolean(c) && !LOCAL_STATES.has(c.state) && !serverOff;
}

/** The server's snapshot of this street is here and shares it. */
function shared(engine) {
  return live(engine) && client.state === 'online' && copy.snap && !copy.none && copy.street === engine.streetTsid;
}

function notify(engine) {
  patchesFeature.sharedPlotsChanged?.(engine);
  publish(engine);
}

function publish(engine) {
  const street = engine?.streetTsid || '';
  let state = 'waiting';
  if (!enabled || engine?.mode !== 'multiplayer') state = 'off';
  else if (!mayAskStreet(street) || serverOff || !client || LOCAL_STATES.has(client.state)) state = 'local';
  else if (noneStreets.has(street) || (copy.street === street && copy.none)) state = 'none';
  else if (copy.street === street && copy.snap) state = 'snap';
  engine?.setData?.('sharedPatches', `${street}:${state}`);
  engine?.setData?.('sharedPatchesLast', lastAnswer);
  const view = [];
  if (copy.street === street && !copy.none) {
    for (const [key, p] of copy.plots) {
      let detail = p.kind;
      if (p.stage === 'seedling') detail = `${p.seedling?.trantClass}:${p.seedling?.petted}`;
      else if (p.stage === 'tree') detail = `${p.tree?.classId}:${p.tree?.state?.maturity}`;
      else if (p.stage === 'dead') detail = p.deadClass;
      view.push(`${key}=${p.stage}:${detail}${p.tender ? `@${p.tender}` : ''}`);
    }
  }
  engine?.setData?.('sharedPatchesView', view.sort().join(','));
}

/** The page's plot for a key (made from the server's word, or fresh, the first time it is asked). */
function plotFor(key) {
  if (!copy.plots.has(key)) {
    const s = copy.snap ? copy.server.get(key) || null : null;
    copy.plots.set(key, localPatchPlot(key, s, copy.offset));
  }
  return copy.plots.get(key);
}

/** Apply server plots (by key) to this page's plots in place. */
function takePlots(plots, now = Date.now()) {
  if (!plots || typeof plots !== 'object') return;
  for (const [key, s] of Object.entries(plots)) {
    if (!isSharedKey(key) || !s || typeof s !== 'object') continue;
    copy.server.set(key, s);
    const plot = copy.plots.get(key);
    if (plot) applyPatchPlot(plot, key, s, copy.offset, now);
    else if (/^tree:/.test(key)) copy.plots.set(key, localPatchPlot(key, s, copy.offset, now));
  }
}

function takeOne(key, s, now = Date.now()) {
  if (key && s && typeof s === 'object') takePlots({ [key]: s }, now);
}

function setOffset(msg) {
  if (Number.isFinite(msg?.now)) copy.offset = msg.now - Date.now();
}

/** Every plot not in a snapshot is fresh (a weedy Patch, or the layout's dead tree). */
function takeSnapshot(engine, msg) {
  const now = Date.now();
  const street = String(msg.street || '');
  if (copy.street !== street) copy = freshCopy(street);
  copy.snap = true;
  copy.none = Boolean(msg.none);
  setOffset(msg);
  copy.timers = msg.timers && typeof msg.timers === 'object' ? msg.timers : null;
  copy.server = new Map();
  if (copy.none) {
    noneStreets.add(street);
    copy.plots = new Map();
    notify(engine);
    return;
  }
  noneStreets.delete(street);
  const named = msg.plots && typeof msg.plots === 'object' ? msg.plots : {};
  for (const [key, plot] of copy.plots) {
    if (/^tree:/.test(key) && !named[key]) copy.plots.delete(key);
    else if (!named[key]) applyPatchPlot(plot, key, null, copy.offset, now);
  }
  copy.spots = new Map();
  takePlots(named, now);
  stripOldCopies(engine, street);
  notify(engine);
}

/**
 * The server shares this street: this save's own plots on it go (the site pays them out once).
 * Only for a street the server confirmed; every other street keeps the save's plots.
 */
function stripOldCopies(engine, street) {
  if (strippedStreets.has(street)) return;
  strippedStreets.add(street);
  const slot = engine.streetWorld?.(street)?.features?.patches;
  const n = stripSharedPlots(slot);
  if (n) engine.save?.();
  engine.setData?.('sharedPatchesStripped', `${street}:${n}`);
}

/** Back to the save's own plots (none, the server without Patches, realtime gone). */
function backToLocal(engine) {
  copy.plots = new Map();
  copy.server = new Map();
  pending.clear();
  notify(engine);
}

function askSync(c, street) {
  syncAskedAt = Date.now();
  c.send('patch_sync');
  syncedStreet = street;
}

/** A new street (or a reconnect): forget the last street's copy and ask for this one's. */
function joined(engine, c, street) {
  if (!street || street === syncedStreet) return;
  if (copy.street !== street) copy = freshCopy(street);
  else copy.snap = false;
  syncedStreet = street;
  if (enabled && mayAskStreet(street) && !serverOff) askSync(c, street);
  publish(engine);
}

function bind(engine) {
  if (client) return client;
  const c = engine?.query?.('realtimeClient');
  if (!c) return null;
  client = c;
  c.on('state', ({ state }) => {
    if (state === 'online') return;
    if ([...pending.values()].some((p) => p.phase === 'land') && !LOCAL_STATES.has(state)) engine.toast?.(COPY.timeout, 2400);
    pending.clear();
    startRefused.clear();
    serverOff = false;
    noneStreets.clear();
    syncedStreet = '';
    if (LOCAL_STATES.has(state)) {
      // Signed off: the save's own plots again.
      copy = freshCopy(copy.street);
      notify(engine);
      return;
    }
    // A reconnect: the plots stay drawn as they were; verbs wait for the next snapshot.
    copy.snap = false;
    publish(engine);
  });
  c.on('roster', ({ street }) => joined(engine, c, street));
  c.on('msg:patches', (msg) => {
    if (!enabled || !msg || msg.street !== engine.streetTsid) return;
    if (msg.snap) takeSnapshot(engine, msg);
    else if (copy.snap && !copy.none && copy.street === msg.street) {
      setOffset(msg);
      takePlots(msg.plots);
      notify(engine);
    }
  });
  // A server without patches.go answers patch_sync with bad_frame: the save's own plots, as before.
  c.on('error', ({ code }) => {
    if (code !== 'bad_frame' || !enabled || copy.snap || !syncedStreet || !mayAskStreet(syncedStreet)) return;
    if (Date.now() - syncAskedAt > REQUEST_TIMEOUT_MS) return;
    serverOff = true;
    backToLocal(engine);
  });
  c.on('msg:patch_ok', (msg) => answered(engine, msg, true));
  c.on('msg:patch_no', (msg) => answered(engine, msg, false));
  c.on('msg:patch_grant', (msg) => applyLateGrant(engine, msg));
  c.on('msg:patch_ev', (msg) => otherWorked(engine, msg));
  return c;
}

/** Someone else began, stopped or finished tending or digging: the plot shows them busy. */
function otherWorked(engine, msg) {
  if (!enabled || !msg || msg.street !== engine.streetTsid || copy.street !== msg.street) return;
  const by = Number(msg.by) || 0;
  const plot = copy.plots.get(String(msg.id || ''));
  if (!plot || !by || by === me()) return;
  if (msg.verb === 'tend') {
    if (msg.do === 'start') {
      plot.tender = by;
      plot.lockUntil = Date.now() + TEND_LOCK_MS;
    } else if (Number(plot.tender) === by) {
      delete plot.tender;
      delete plot.lockUntil;
    }
  } else if (msg.verb === 'dig') {
    const diggers = new Set(plot.diggers || []);
    if (msg.do === 'start') diggers.add(by);
    else diggers.delete(by);
    if (diggers.size) plot.diggers = [...diggers];
    else delete plot.diggers;
  }
  lastAnswer = `${msg.id}:${msg.verb}:${msg.do || 'done'}@${by}`;
  publish(engine);
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

function sendReq(engine, payload) {
  reqSeq = (reqSeq % 2147483646) + 1;
  const req = reqSeq;
  return { req, send: () => client?.send('patch_act', { req, ...payload }) };
}

/** A shared soil target this feature answers for (its key), or ''. */
function sharedKey(target) {
  if (!target || target.featureId !== 'patches' || !target.sharedPatch) return '';
  return isSharedKey(target.sharedPatch) ? String(target.sharedPatch) : '';
}

function soilCtx(engine) {
  return {
    skills: engine.learnedSkills || [],
    upgrades: engine.pc?.imaginationUpgrades || [],
    buffs: typeof engine.activeBuffIds === 'function' ? engine.activeBuffIds() : [],
    aggressiveOff: engine.pc?.aggressiveOff === true,
  };
}

/**
 * Ask the server before a shared soil verb lands: true when asked (or refused for now), null when
 * the plot is the save's own. The verb's own action bar (tend, dig, clear) has already run.
 */
function ask(engine, target, verbId) {
  const key = sharedKey(target);
  if (!key || engine?.mode !== 'multiplayer' || !enabled) return null;
  const verb = String(verbId || '').split(':')[0];
  if (!SOIL_VERBS.has(verb)) return null;
  if (!live(engine)) return null;
  if (!shared(engine)) {
    engine.toast?.(COPY.connecting, 2400);
    return true;
  }
  const quote = patchesFeature.quoteSharedVerb?.(engine, key, verbId);
  if (!quote || !quote.enabled) {
    // The page refuses (no tool, too tired, not ready): it runs here alone and changes no plot.
    if (BAR_VERBS.has(verb)) stopBar(key, verb);
    patchesFeature.runSharedVerb?.(engine, key, verbId);
    return true;
  }
  for (const p of pending.values()) {
    if (p.key === key && p.phase === 'land') {
      engine.toast?.(COPY.waiting, 1600);
      return true;
    }
  }
  if (BAR_VERBS.has(verb) && startRefused.delete(key)) return true;
  const payload = { id: key, verb };
  let rolls = [];
  let flush = false;
  if (verb === 'tend' || verb === 'dig') {
    const plan = soilRolls(verb, soilCtx(engine));
    rolls = plan.rolls;
    if (!plan.success) {
      // A failed tend roll ("Oops! That didn't work."): here alone, and the lock goes back.
      stopBar(key, verb);
      patchesFeature.runSharedVerb?.(engine, key, verbId, { rolls });
      return true;
    }
    if (plan.skill) payload.skill = plan.skill;
    if (verb === 'dig' && plan.drop) payload.drop = true;
  } else if (verb === 'plant') {
    const bean = String(verbId).split(':')[1] || '';
    if (!bean) return true;
    payload.bean = bean;
    payload.grow = plantGrowLevel(engine.pc?.imaginationUpgrades || []);
    flush = true;
  }
  const { req, send } = sendReq(engine, payload);
  pending.set(req, { req, key, verb, verbId, phase: 'land', rolls, at: Date.now() });
  const go = () => {
    if (!pending.has(req)) return;
    pending.get(req).at = Date.now();
    if (!send()) {
      pending.delete(req);
      engine.toast?.(COPY.connecting, 2400);
    }
  };
  // The ledger learns of a bean bought a moment ago from the save write (the plan's catch 1).
  if (flush) persist(engine).finally(go);
  else go();
  return true;
}

/**
 * A tree verb on a tree grown in a shared Patch asks the server first: pet, water and harvest from
 * the verb menu (runVerbOverride), Tree Poison and its Antidote from tree-death-feature
 * (sharedPatchTreeVerb, its own checks done). True when asked (or held: connecting, waiting), null
 * when the tree is not a shared one, or the player's own side refuses (the verb runs here alone and
 * refuses as in solo), or this is the go-ahead's own run.
 */
function askTree(engine, target, verbId, { pour = false, k = null } = {}) {
  const key = sharedTreeKey(target);
  if (!key || engine?.mode !== 'multiplayer' || !enabled) return null;
  if (treeGrant && treeGrant.target === target && treeGrant.verbId === verbId) return null;
  const wire = pour ? POUR_WIRE[verbId] : (TREE_VERBS.includes(verbId) ? verbId : '');
  if (!wire) return null;
  if (!live(engine)) return null;
  if (!shared(engine)) {
    engine.toast?.(COPY.connecting, 2400);
    return true;
  }
  const learned = engine.learnedSkills || [];
  if (!pour && !sharedTreeReady(target.state, target.classId, wire, { inv: engine.inv, pc: engine.pc, learned, tools: engine.toolState })) return null;
  for (const p of pending.values()) {
    if (p.key === key && p.phase === 'land') {
      engine.toast?.(COPY.waiting, 1600);
      return true;
    }
  }
  const payload = { id: key, verb: wire };
  const skill = pour ? '' : sharedTreeSkill(target.classId, wire, learned);
  if (skill) payload.skill = skill;
  if (wire === 'poison' && qaPoisonMs > 0) payload.ms = qaPoisonMs;
  if (wire === 'trantsform' && Number.isInteger(k) && k >= 0) payload.k = k;
  const { req, send } = sendReq(engine, payload);
  pending.set(req, { req, key, verb: wire, verbId, phase: 'land', tree: true, classId: target.classId, at: Date.now() });
  if (!send()) {
    pending.delete(req);
    engine.toast?.(COPY.connecting, 2400);
  }
  return true;
}

/**
 * The server's go-ahead for a tree verb: the verb runs here on the tree as the server had it
 * ("before"), with its care roll and the ledger's use of a bottle (sharedVerbGrant), then the
 * server's tree lands; a harvest's grant is added once by id, saved and acknowledged.
 */
function treeAnswered(engine, msg, ok, p, key) {
  if (!ok) {
    if (msg.plot) takeOne(key, msg.plot);
    notify(engine);
    refuse(engine, refusalLine(msg.code, msg.message, p.verb));
    return;
  }
  if (p.verb === 'trantsform') {
    // The new tree is the server's: it lands first, then potions-feature spends the bottle and speaks.
    if (msg.plot) takeOne(key, msg.plot);
    notify(engine);
    const now = patchesFeature.entityByKey?.(key);
    engine.query?.('trantsformGranted', now?.plot?.stage === 'tree' ? now.target : null, msg, engine);
    return;
  }
  if (msg.before) takeOne(key, msg.before);
  // The tree as it stands now (a redraw since the ask makes a new target for the same plot).
  const entity = patchesFeature.entityByKey?.(key);
  const target = entity?.plot?.stage === 'tree' ? entity.target : null;
  const use = msg.use && typeof msg.use === 'object' ? msg.use : null;
  const g = msg.grant && typeof msg.grant === 'object' ? msg.grant : null;
  const before = g ? countItem(engine.inv, String(g.c)) : 0;
  if (target && target.classId === p.classId) {
    prepareGrantedTree(target.state, target.classId, p.verb, msg);
    treeGrant = { target, verbId: p.verbId, roll: Number(msg.roll), use };
    try {
      engine.executeVerb?.(target, p.verbId, { animated: true });
    } finally {
      treeGrant = null;
    }
  }
  if (msg.plot) takeOne(key, msg.plot);
  notify(engine);
  if (g) finishGrant(engine, g, before);
}

/** A shared tend or dig's action bar began: tell the server (the one-tender lock). */
function startBar(engine, target, verb) {
  const key = sharedKey(target);
  if (!key || !BAR_VERBS.has(verb) || !shared(engine)) return;
  startRefused.delete(key);
  const { req, send } = sendReq(engine, { id: key, verb, do: 'start' });
  pending.set(req, { req, key, verb, verbId: verb, phase: 'start', at: Date.now() });
  if (!send()) pending.delete(req);
}

function stopBar(key, verb) {
  if (!client || !BAR_VERBS.has(verb)) return;
  for (const [req, p] of pending) if (p.key === key && p.phase === 'start') pending.delete(req);
  const { req, send } = sendReq(null, { id: key, verb, do: 'stop' });
  pending.set(req, { req, key, verb, verbId: verb, phase: 'stop', at: Date.now() });
  if (!send()) pending.delete(req);
}

function refuse(engine, line) {
  engine.toast?.(line, 2600);
  engine.pushActivity?.(line);
  engine.playSound?.('CLICK_FAILURE', { volume: 0.45 });
}

function answered(engine, msg, ok) {
  if (!enabled) return;
  const p = pending.get(msg?.req);
  if (p) pending.delete(msg.req);
  setOffset(msg);
  const key = String(msg?.id || p?.key || '');
  const here = copy.street === engine.streetTsid && copy.snap && !copy.none;
  lastAnswer = `${key}:${msg?.verb || p?.verb || ''}${msg?.do ? `:${msg.do}` : ''}:${ok ? 'ok' : msg?.code || 'no'}`;
  if (!p || !here) {
    if (here && msg?.plot) takeOne(key, msg.plot);
    if (here) notify(engine);
    else publish(engine);
    return;
  }
  if (p.phase !== 'land') {
    // A start or stop: the lock (or the diggers) as the server has it.
    if (msg.plot) takeOne(key, msg.plot);
    if (!ok && p.phase === 'start') {
      startRefused.add(key);
      refuse(engine, refusalLine(msg.code, msg.message, p.verb));
    }
    notify(engine);
    return;
  }
  if (p.tree) {
    treeAnswered(engine, msg, ok, p, key);
    return;
  }
  if (!ok) {
    if (msg.plot) takeOne(key, msg.plot);
    notify(engine);
    refuse(engine, refusalLine(msg.code, msg.message, p.verb));
    return;
  }
  // The local rules run on the plot as the server had it, with the page's own draws.
  if (msg.before) takeOne(key, msg.before);
  const plot = copy.plots.get(key);
  if (p.verb === 'pet' && plot?.seedling) plot.seedling.petters = msg.first === true ? 0 : 1;
  const use = msg.use && typeof msg.use === 'object' ? msg.use : null;
  if (use?.spent && use.n && use.op) engine.query?.('ledgerReceipt', String(use.op), engine);
  const g = msg.grant && typeof msg.grant === 'object' ? msg.grant : null;
  const before = g ? countItem(engine.inv, String(g.c)) : 0;
  const opts = { rolls: p.rolls };
  if (p.verb === 'pet') opts.owner = msg.owner === true;
  patchesFeature.runSharedVerb?.(engine, key, p.verbId, opts);
  // Then the server's word on the plot.
  if (msg.plot) takeOne(key, msg.plot);
  notify(engine);
  if (g) finishGrant(engine, g, before);
}

/** A grant from an answer: the verb here added its items (else they go in here), the save, then the ack. */
async function finishGrant(engine, g, before) {
  const id = String(g.id || '');
  const c = String(g.c || '');
  if (!GRANT_ID.test(id) || applied.includes(id) || !GRANT_CLASSES.includes(c)) return;
  const n = Math.max(0, Math.min(999, Math.floor(Number(g.n) || 0)));
  const got = Math.max(0, countItem(engine.inv, c) - before);
  if (got < n) {
    addItem(engine.inv, c, n - got);
    engine.refreshPack?.();
  }
  applied = [...applied, id].slice(-APPLIED_KEEP);
  await new Promise((done) => setTimeout(done, GRANT_SAVE_DELAY_MS));
  if (await persist(engine)) client?.send('patch_ack', { id });
}

/** A grant the server resent (the answer never reached this page): its items, once. */
async function applyLateGrant(engine, msg) {
  if (!enabled) return;
  const id = String(msg?.id || '');
  if (!GRANT_ID.test(id) || applying.has(id)) return;
  if (applied.includes(id)) {
    if (await persist(engine)) client?.send('patch_ack', { id });
    return;
  }
  const n = Math.max(0, Math.min(999, Math.floor(Number(msg.n) || 0)));
  const c = String(msg.c || '');
  if (!n || !GRANT_CLASSES.includes(c)) return;
  applying.add(id);
  addItem(engine.inv, c, n);
  applied = [...applied, id].slice(-APPLIED_KEEP);
  const label = ITEM_CATALOG[c]?.label || c.replace(/_/g, ' ');
  engine.pushActivity?.(`From a Patch: ${n}× ${label}.`);
  engine.refreshPack?.();
  lastAnswer = `grant:${id}:${c}:${n}`;
  publish(engine);
  const ok = await persist(engine);
  applying.delete(id);
  if (ok) client?.send('patch_ack', { id });
}

/** The page plots this feature holds for patches-feature (sharedPatchPlots). */
const handle = Object.freeze({
  plot(key) {
    return isSharedKey(key) ? plotFor(key) : null;
  },
  extras() {
    const out = [];
    const keys = new Set([...copy.server.keys(), ...copy.spots.keys()]);
    for (const key of keys) {
      const s = copy.server.get(key);
      if (!/^tree:/.test(key)) continue;
      const spot = treePlotSpot(s) || copy.spots.get(key);
      if (!spot) continue;
      const plot = plotFor(key);
      out.push({ key, classTsid: plot.classTsid, x: spot.x, y: spot.y, plot });
    }
    return out;
  },
  /** A dead street tree's plot on this street (tree-death-feature, via adoptPlot): held here until the server's word lands. */
  adopt(key, soilClass, x, y) {
    if (!/^tree:\d+$/.test(String(key))) return null;
    if (Number.isFinite(Number(x)) && Number.isFinite(Number(y))) copy.spots.set(key, { x: Number(x), y: Number(y) });
    const s = copy.server.get(key) || { class: soilClass, kind: soilClass === 'trant_egg_dead' ? 'patch_dark' : 'patch', stage: /_dead$/.test(soilClass) ? 'dead' : 'dirty', dead: /_dead$/.test(soilClass) ? soilClass : undefined };
    if (!copy.plots.has(key)) copy.plots.set(key, localPatchPlot(key, s, copy.offset));
    return copy.plots.get(key);
  },
});

export const sharedPatchesFeature = {
  id: SHARED_PATCHES_FEATURE_ID,

  init(engine) {
    multiplayer = engine?.mode === 'multiplayer';
    enabled = multiplayer && sharedPatchesOn();
    if (!multiplayer) return;
    if (enabled && typeof window !== 'undefined') {
      window.groddleSharedPatches = {
        plots: () => Object.fromEntries(copy.server),
        view: () => Object.fromEntries([...copy.plots].map(([k, p]) => [k, { stage: p.stage, kind: p.kind, dead: p.deadClass, seedling: p.seedling, tree: p.tree ? { classId: p.tree.classId, ...p.tree.state } : null, tender: p.tender || 0 }])),
        state: () => ({ street: copy.street, snap: copy.snap, none: copy.none, serverOff, pending: pending.size, applied: applied.length, stripped: [...strippedStreets], timers: copy.timers }),
        dev: (opts = {}) => client?.send('patch_dev', opts),
        /** QA: a pour's poison clock in ms (a server with GRODDLE_PATCHES_DEV=1 takes 1000 up to 3 minutes); 0 for the real one. */
        poisonMs: (n) => { qaPoisonMs = Math.max(0, Math.floor(Number(n) || 0)); return qaPoisonMs; },
        count: (c) => countItem(engine.inv, String(c)),
        me: () => me(),
        /** A plot's middle in client px, for a real click. */
        point(key) {
          const entity = patchesFeature.entityByKey?.(key);
          const sprite = entity?.sprite;
          const rect = document.querySelector('#game-root > canvas')?.getBoundingClientRect();
          if (!sprite || sprite.destroyed || !rect || !engine.entityLayer) return null;
          const up = entity.plot.stage === 'tree' ? 60 : entity.plot.stage === 'dead' ? 40 : 14;
          const g = engine.entityLayer.toGlobal(new engine.PIXI.Point(sprite.x, sprite.y - up));
          const k = rect.width / (engine.camera?.w || 960);
          return { x: rect.left + g.x * k, y: rect.top + g.y * k };
        },
      };
    }
    publish(engine);
  },

  /**
   * patches-feature, laying a street out: the plots held here (the server's), or null when the
   * plots are the save's own (off, solo, a private place, a street the server doesn't share, no
   * live realtime, a server without Patches).
   */
  sharedPatchPlots(tsid, engine) {
    if (!live(engine) || !mayAskStreet(tsid) || tsid !== engine.streetTsid) return null;
    if (noneStreets.has(tsid)) return null;
    if (copy.street !== tsid) copy = freshCopy(tsid);
    if (copy.none) return null;
    return handle;
  },

  onStreetClear() {
    for (const [req, p] of pending) if (p.phase === 'land') pending.delete(req);
  },

  /** Dametime midnight: this player's harvests of the shared Patch trees start over (the server's count does too). */
  onNewDay(now, engine) {
    if (!enabled || engine?.mode !== 'multiplayer') return;
    for (const plot of copy.plots.values()) {
      if (plot.stage === 'tree' && plot.tree?.state) newDayTree(plot.tree.state, plot.tree.classId);
    }
  },

  onTick(dtMs, now, engine) {
    if (!enabled || engine.mode !== 'multiplayer' || !engine.started) return;
    const c = bind(engine);
    if (!c) return;
    if (c.state === 'online' && c.street && c.street !== syncedStreet) joined(engine, c, c.street);
    const wall = Date.now();
    if (c.state === 'online' && !serverOff && mayAskStreet(syncedStreet) && c.street === syncedStreet && !copy.snap && wall - syncAskedAt >= SYNC_RETRY_MS) {
      askSync(c, syncedStreet);
    }
    for (const [req, p] of pending) {
      if (wall - p.at < REQUEST_TIMEOUT_MS) continue;
      pending.delete(req);
      if (p.phase === 'land') engine.toast?.(COPY.timeout, 2400);
    }
  },

  /** game.js executeVerb: a shared soil verb, or a shared Patch tree's pet, water or harvest, asks the server before it lands. */
  runVerbOverride(target, verbId, engine) {
    if (sharedTreeKey(target)) return askTree(engine, target, verbId);
    return ask(engine, target, verbId);
  },

  /**
   * tree-death-feature, as a pour lands on a tree grown in a shared Patch: true when the server was
   * asked (its go-ahead runs the pour again with the grant), null when the tree is not shared.
   */
  sharedPatchTreeVerb(target, verbId, engine) {
    return askTree(engine, target, verbId, { pour: true });
  },

  /**
   * potions-feature, as a Trantsformation Fluid pour lands on a tree grown in a shared Patch: true
   * when the server was asked (patch_act "trantsform", k: the bottle) or the ask is held (connecting,
   * waiting: the line is shown, nothing used), null when the tree is not a shared one.
   */
  sharedPatchTrantsform(target, engine, k = null) {
    return askTree(engine, target, TRANTSFORM_VERB, { pour: true, k });
  },

  /** game.js runVerb and tree-death-feature: the server's care roll and the ledger's use of a bottle, for the verb it just allowed. */
  sharedVerbGrant(target, verbId) {
    if (!treeGrant || treeGrant.target !== target || treeGrant.verbId !== verbId) return null;
    const out = { roll: Number.isFinite(treeGrant.roll) ? treeGrant.roll : undefined };
    if (treeGrant.use) out.use = treeGrant.use;
    return out;
  },

  /** Whether this tree grown in a Patch is the server's now (tree-death-feature leaves its clock and death to it). */
  sharedPatchTree(target, engine) {
    return sharedTreeKey(target) && enabled && engine?.mode === 'multiplayer' ? true : null;
  },

  /** patches-feature runPackVerb: Plant from the pack on a shared Patch. */
  sharedPatchVerb(target, verbId, engine) {
    return ask(engine, target, verbId);
  },

  /** game.js beginVerbAction: another player tending (or digging) refuses before the bar (patch.js 171-174, 373-381). */
  verbRefusedNow(target, verbId, engine) {
    const key = sharedKey(target);
    if (!key || !shared(engine)) return null;
    return refusedBeforeBar(copy.plots.get(key), verbId, me());
  },

  /** game.js after a timed verb's bar begins: a tend takes the lock, a dig joins the diggers. */
  verbStarted(target, verb, engine) {
    const base = String(verb?.id || '').split(':')[0];
    if (BAR_VERBS.has(base)) startBar(engine, target, base);
    return undefined;
  },

  /**
   * game.js when a timed verb is cancelled: the lock (or the dig) goes back. A clear cut short because
   * another player's clear landed first (the dead tree gone from under the bar, so game.js cancels it
   * quietly) reads CLEARED_FIRST_LINE, as a clear the server refused does (Ours, slice 3).
   */
  verbCancelled(target, verbId, engine) {
    const key = sharedKey(target);
    const base = String(verbId || '').split(':')[0];
    if (key && BAR_VERBS.has(base) && shared(engine)) stopBar(key, base);
    if (key && base === 'clear' && shared(engine)) {
      const now = copy.plots.get(key);
      if (now && now.stage !== 'dead') refuse(engine, CLEARED_FIRST_LINE);
    }
    return undefined;
  },

  save() {
    if (!multiplayer || !applied.length) return undefined;
    return { applied };
  },

  restore(slice, engine) {
    multiplayer = engine?.mode === 'multiplayer';
    applied = multiplayer && Array.isArray(slice?.applied)
      ? slice.applied.filter((id) => typeof id === 'string' && GRANT_ID.test(id)).slice(-APPLIED_KEEP)
      : [];
  },

  /** QA / tests. */
  _state() {
    return { enabled, street: copy.street, snap: copy.snap, none: copy.none, serverOff, plots: copy.plots.size, pending: pending.size, applied: [...applied], stripped: [...strippedStreets], noneStreets: [...noneStreets] };
  },
  _plot(key) {
    return copy.plots.get(key) || null;
  },
  _reset() {
    client = null;
    multiplayer = false;
    enabled = false;
    copy = freshCopy('');
    syncedStreet = '';
    syncAskedAt = 0;
    reqSeq = 0;
    pending.clear();
    noneStreets.clear();
    serverOff = false;
    lastAnswer = '';
    applied = [];
    applying.clear();
    strippedStreets.clear();
    startRefused.clear();
    treeGrant = null;
    qaPoisonMs = 0;
  },
};
