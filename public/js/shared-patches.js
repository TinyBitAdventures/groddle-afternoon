/**
 * Shared street Patches in multiplayer (register G564): the rules a page needs
 * to show and work a street Patch whose plot the realtime server keeps
 * (groddle-afternoon-server patches.go, its header and the lane wire file are
 * the protocol). The feature is features/shared-patches-feature.js; the plan is
 * research/plans/g564-shared-street-patches.md.
 *
 * - DARK: SHARED_PATCHES_ON is false, so nothing changes for players until a
 *   release turns it on. QA turns it on for one browser with
 *   localStorage['groddle.qa.sharedPatches'] = '1' (the /play/online/ page
 *   strips query params, so a param can't do it).
 * - Which streets: the server's data/patches.json `pilot` value (slice 3: null,
 *   every street with Patches; slice 1 had Old Main Street, GM4103L52ID23). The
 *   page keeps no list of its own: it asks on
 *   every street with soil and the answer says ("none": keep the save's own).
 *   Homes, tower rooms, party spaces and any private place (a street id with
 *   "_") never ask.
 * - Plot ids are the page's own keys (patches-feature soilSpawnPlan):
 *   "<soilClass>:<n>" (patch:0, patch_dark:0, trant_spice_dead:0) and
 *   "tree:<i>" for the plot a dead shared street tree left.
 * - The page keeps energy, mood, iMG, tool wear, the tend success roll and the
 *   drops (tend drops, dig Loam); the server decides the plot (the lock, the
 *   plant, the pettings, growth) and the base yields (Earth, Planks) as ledger
 *   receipts.
 * - A tree grown in a shared Patch (G564 lane 3, slice 1) answers to the server
 *   for pet, water and harvest (the tending flags, the care roll, the fruit on
 *   it, each player's harvests a game day: fruit and Planks come back as
 *   grants) and for Tree Poison and its Antidote (the clock, anyone's cure, the
 *   death, everyone's). Its poison lands in the tree state as tree-death-feature
 *   reads it (poisonEndsAt), so the warning, the cries and the cure show for
 *   everyone.
 * - Slice 2 (G564): the Rook, Fertilidust and Trantsformation Fluid reach a
 *   shared Patch tree through the server too. The Rook learns the street's
 *   Patch trees from the server's patches module and strips them there (the
 *   page keys them `<class>:p<plot key>`, js/rook-attack.js rookKeyFor, and
 *   never sends them in rook_sync); Fertilidust is the one jar route online,
 *   obj_dust (features/street-objects-feature.js sharedFertilize: the full jar
 *   revives the shared dead trants and grows the shared trees for everyone, Lite
 *   names one by its plot key); Trantsformation Fluid is patch_act "trantsform"
 *   (TRANTSFORM_VERB), the server choosing the new tree.
 * - Slice 3 (G564): every street at once, and players' own street Patches
 *   handed over once by the site's payout (one winner per Patch reaches the
 *   server as its seed file; tools/patches/payout.mjs). A clear another player
 *   landed first reads CLEARED_FIRST_LINE.
 */

import { DEAD_TRANT_CLASSES, GROWN_TREE_LABELS, SEASONED_BEANS, SOIL_CLASSES, resolveSoilPackage, resolveTendPackage, seedlingTimings } from './patches.js?v=3103cc6a';
import { TRANT_META, fruitCapacityAt } from './trants.js?v=1b3c8ae3';
import { ensureWoodTreeState, quoteWoodTreeHarvest } from './woodcutting.js?v=9a2039d1';
import { POISON_DURATION_MS } from './tree-poison.js?v=5ceea244';
import { treeReady, treeSkill } from './street-objects.js?v=3e1098a9';
import { highestLightGreenThumbRank, quoteTrantCare } from './trant-care.js?v=9527ff03';

/** The release switch: on since game v0.24.0 (G564; false = dark, shared Patches off for everyone but the QA flag below). */
export const SHARED_PATCHES_ON = true;

/** QA only: '1' in this browser's localStorage turns shared Patches on for it, '0' keeps them off (the switched-off path, with the release switch on). */
export const SHARED_PATCHES_QA_KEY = 'groddle.qa.sharedPatches';

/** This browser's localStorage, or null (a private window or blocked site data): only for the QA flag, never a save. */
export function qaFlagStorage() {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

/** Whether this page uses shared Patches: the QA flag '0' says no, else the release switch, else the QA flag '1'. */
export function sharedPatchesOn(storage = qaFlagStorage(), on = SHARED_PATCHES_ON) {
  let flag = null;
  try {
    flag = storage?.getItem?.(SHARED_PATCHES_QA_KEY) ?? null;
  } catch {
    flag = null;
  }
  if (flag === '0') return false;
  return Boolean(on) || flag === '1';
}

/** A street the page may ask about: a public street (not a home, room, party or any "_" place). */
export function mayAskStreet(tsid) {
  const t = String(tsid || '');
  return /^[A-Z0-9]{8,20}$/.test(t);
}

const SOIL_KEY = /^(patch|patch_dark|trant_(?:bean|bubble|egg|fruit|gas|spice)_dead):(\d{1,3})$/;
const TREE_KEY = /^tree:(\d{1,4})$/;

/** Whether a page plot key is one the server shares (soil plots and tree:<i>; never demo:*). */
export function isSharedKey(key) {
  return SOIL_KEY.test(String(key || '')) || TREE_KEY.test(String(key || ''));
}

/** The layout class a plot key names: "patch:0" -> patch; tree:<i> -> null (the server says). */
export function keyClass(key) {
  const m = SOIL_KEY.exec(String(key || ''));
  return m ? m[1] : null;
}

/** A grant's id (wire: "pg-…"). */
export const GRANT_ID = /^pg-[0-9a-z-]{1,40}$/;

/** What a grant may carry: Earth and Planks (dig, clear, a poisoned Wood Tree), and each trant's fruit. */
export const GRANT_CLASSES = Object.freeze(['earth', 'plank', ...Object.values(TRANT_META).map((m) => m.fruitClass)]);

const STAGES = new Set(['dirty', 'clean', 'dug', 'seedling', 'tree', 'dead']);

function ms(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function whole(value, fallback = 0, min = 0, max = Number.MAX_SAFE_INTEGER) {
  const n = Math.floor(Number(value));
  return Math.max(min, Math.min(max, Number.isFinite(n) ? n : fallback));
}

/**
 * The tree state a target holds, filled from the server's tree in place (target.state keeps its
 * identity, so the game's own verbs and labels read the server's numbers). harvestsToday is this
 * player's own and the server sends it only on a harvest answer, so the page's count is kept.
 */
function fillTreeState(state, t, classId, now = Date.now()) {
  fillPoison(state, t, now);
  if (classId === 'wood_tree') {
    state.maturity = whole(t.maturity, 1, 0, 6);
    state.harvestCount = whole(t.count, 0, 0, 1);
    state.petted = t.petted === true;
    state.watered = t.watered === true;
    return ensureWoodTreeState(state);
  }
  state.classTsid = classId;
  state.maturity = whole(t.maturity, 1, 0, 10);
  state.health = whole(t.health, 7, 1, 10);
  state.fruitCount = whole(t.fruit, 0);
  state.fruitCapacity = Number.isFinite(Number(t.cap)) && Number(t.cap) >= 0 ? whole(t.cap, 0) : fruitCapacityAt(classId, state.maturity, state.health);
  state.harvestsToday = whole(state.harvestsToday, 0);
  state.petted = t.petted === true;
  state.watered = t.watered === true;
  return state;
}

/**
 * The server's poison clock (tree.poison: ms left) in the tree state as js/tree-poison.js keeps it
 * (poisonedAt, poisonEndsAt, poisonBubble), so tree-death-feature shows the overlay, the cries and
 * the antidote verb, and hides harvest, pet and water, for everyone on the street. A clock already
 * held within 2 s of the server's keeps its own start and its bubbles (the pourer's page set it).
 * No poison: cured (anyone's antidote).
 */
function fillPoison(state, t, now) {
  const left = ms(t?.poison);
  if (!left) {
    delete state.poisonedAt;
    delete state.poisonEndsAt;
    delete state.poisonBubble;
    return;
  }
  const end = now + left;
  if (Number(state.poisonEndsAt) > 0 && Math.abs(Number(state.poisonEndsAt) - end) <= 2000) return;
  state.poisonEndsAt = end;
  state.poisonedAt = Math.min(now, end - POISON_DURATION_MS);
  if (!Number.isFinite(state.poisonBubble)) state.poisonBubble = -1;
}

/**
 * A server plot as js/patches.js keeps a plot (normalizePlot's shape), on this page's clock
 * (offset: server ms minus local ms). A plot the server didn't name is fresh: a weedy Patch, or
 * for a trant_*_dead:<n> key that dead tree. `prev` is the page's plot for the key, whose tree
 * state object is kept when the tree is still the same kind. Extra fields for this page only:
 * tender + lockUntil (someone holds the tend lock), diggers, planter (the Seedling's), and
 * poisonUntil / poisonBy for a poisoned tree.
 */
export function localPatchPlot(key, s, offset = 0, now = Date.now(), prev = null) {
  const at = (t) => (ms(t) ? ms(t) - offset : 0);
  const layout = keyClass(key);
  const server = s && typeof s === 'object' ? s : null;
  const kind = server?.kind === 'patch_dark' || (!server?.kind && (layout === 'patch_dark' || layout === 'trant_egg_dead')) ? 'patch_dark' : 'patch';
  let stage = STAGES.has(server?.stage) ? server.stage : layout && DEAD_TRANT_CLASSES.includes(layout) ? 'dead' : 'dirty';
  const deadClass = DEAD_TRANT_CLASSES.includes(server?.dead) ? server.dead : stage === 'dead' && DEAD_TRANT_CLASSES.includes(layout) ? layout : null;
  if (stage === 'dead' && !deadClass) stage = 'dirty';
  const plot = {
    classTsid: kind,
    kind,
    stage,
    since: at(server?.since) || now,
    dueAt: at(server?.due),
    seedling: null,
    tree: null,
    deadClass: stage === 'dead' ? deadClass : null,
  };
  if (stage === 'dead') plot.classTsid = deadClass;
  else if (SOIL_CLASSES.includes(server?.class) && !DEAD_TRANT_CLASSES.includes(server.class)) plot.classTsid = server.class;
  else if (layout && !DEAD_TRANT_CLASSES.includes(layout)) plot.classTsid = layout;
  if (stage === 'seedling') {
    const sd = server?.seedling || {};
    const trantClass = GROWN_TREE_LABELS[sd.tree] ? sd.tree : null;
    if (!trantClass) {
      plot.stage = 'dirty';
    } else {
      const grow = whole(sd.grow, 0, 0, 10);
      const thirdAt = at(sd.thirdAt);
      plot.seedling = {
        trantClass,
        beanClass: SEASONED_BEANS[sd.bean] ? sd.bean : '',
        plantedAt: at(sd.plantedAt) || now,
        minAt: at(sd.minAt) || now,
        maxAt: at(sd.maxAt) || now,
        upgradeGrowLevel: grow,
        petted: whole(sd.petted, 0, 0, 99),
        // The server counts this player's first petting (patch_ok "first"); the page asks it.
        petters: 0,
        growLevel: thirdAt ? grow : 0,
        thirdPetAt: thirdAt,
      };
      plot.planter = whole(sd.planter, 0);
    }
  }
  if (stage === 'tree') {
    const t = server?.tree || {};
    const classId = GROWN_TREE_LABELS[t.class] ? t.class : null;
    if (!classId) {
      plot.stage = 'dirty';
    } else {
      const keep = prev?.stage === 'tree' && prev.tree?.classId === classId && prev.tree.state && typeof prev.tree.state === 'object';
      const state = fillTreeState(keep ? prev.tree.state : {}, t, classId, now);
      plot.tree = {
        classId,
        state,
        grownAt: at(t.grownAt) || now,
        lastCycleAt: at(t.cycleAt) || at(t.grownAt) || now,
        woodPetted: whole(t.woodPetted, 0),
        woodWatered: whole(t.woodWatered, 0),
        seenPetted: state.petted === true,
        seenWatered: state.watered === true,
        seenHarvests: whole(state.totalHarvests, 0),
        clearedAt: at(t.clearedAt),
        resetAt: keep ? prev.tree.resetAt || now : now,
      };
      if (ms(t.poison)) {
        plot.poisonUntil = now + ms(t.poison);
        plot.poisonBy = whole(t.by, 0);
      }
    }
  }
  if (plot.stage === 'dirty') plot.classTsid = kind;
  if (whole(server?.tender, 0) && ms(server?.lockLeft)) {
    plot.tender = whole(server.tender, 0);
    plot.lockUntil = now + ms(server.lockLeft);
  }
  if (Array.isArray(server?.diggers) && server.diggers.length) plot.diggers = server.diggers.map((d) => whole(d, 0)).filter(Boolean);
  return plot;
}

/** Copy a server plot into the page's plot object in place (targets and entities hold the object). */
export function applyPatchPlot(plot, key, s, offset = 0, now = Date.now()) {
  const next = localPatchPlot(key, s, offset, now, plot);
  for (const k of Object.keys(plot)) if (!(k in next)) delete plot[k];
  Object.assign(plot, next);
  return plot;
}

/** The spot a tree:<i> plot stands on (the server sends it), or null. */
export function treePlotSpot(s) {
  const x = Number(s?.x);
  const y = Number(s?.y);
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
}

/** Whether another player holds this plot's tend lock now. */
export function tendedByOther(plot, me, now = Date.now()) {
  return Boolean(plot?.tender && Number(plot.tender) !== Number(me) && Number(plot.lockUntil) > now);
}

/** Whether someone other than this player is digging the plot now. */
export function dugByOther(plot, me) {
  return Array.isArray(plot?.diggers) && plot.diggers.some((d) => Number(d) !== Number(me));
}

// ---------------------------------------------------------------------------
// Trees in shared Patches (lane 3, slice 1)
// ---------------------------------------------------------------------------

/** The tree verbs a shared Patch tree asks the server about (wire patch_act verb). */
export const TREE_VERBS = Object.freeze(['pet', 'water', 'harvest']);

/** tree-death-feature's pours as the wire names them. */
export const POUR_WIRE = Object.freeze({ 'treepoison:poison': 'poison', 'treepoison:antidote': 'antidote', 'potion:trantsform': 'trantsform' });

/** potions-feature's Trantsformation Fluid pour, as shared-patches-feature asks it (POUR_WIRE). */
export const TRANTSFORM_VERB = 'potion:trantsform';

/** A tree target grown in a shared Patch (patches-feature marks it sharedPatch): its plot key, or ''. */
export function sharedTreeKey(target) {
  if (!target || target.featureId || !target.grownFromBean || !target.sharedPatch || !target.state) return '';
  return isSharedKey(target.sharedPatch) ? String(target.sharedPatch) : '';
}

/**
 * The player's own side of a tree verb on a shared Patch tree (tools, skill, energy, size), as in
 * solo: false and the verb runs here alone and refuses as solo does, never asking. What the server
 * decides is left out of the check: the tree's tending flags, the fruit on it (it may hold more than
 * this copy shows) and this player's harvests today (the server keeps them, plan section 7).
 */
export function sharedTreeReady(state, classId, verb, { inv = {}, pc = {}, learned = [], tools = null } = {}) {
  if (!state || !TREE_VERBS.includes(verb)) return false;
  if (classId === 'wood_tree') {
    if (verb === 'harvest') return quoteWoodTreeHarvest({ ...state, harvestedToday: false }, inv, pc, tools).ok === true;
    return quoteTrantCare({ ...state, petted: false, watered: false }, 'wood_tree', verb, { pc, inv, tools, learned }).ok === true;
  }
  if (!TRANT_META[classId]) return false;
  return treeReady({ ...state, harvestsToday: 0 }, classId, verb, { inv, pc, learned, tools });
}

/** The skill row the server reads a tree verb's rate or limit from (wire "skill"); '' for none. */
export function sharedTreeSkill(classId, verb, learned = []) {
  if (classId === 'wood_tree') {
    if (verb === 'harvest') return '';
    const rank = highestLightGreenThumbRank(learned);
    return rank === 'no_skill' ? '' : rank;
  }
  const skill = treeSkill(verb, learned);
  return skill && skill !== 'no_skill' ? skill : '';
}

/**
 * Before a granted tree verb runs here on the server's "before": the player's own daily count is
 * the server's (a harvest answer's "harvests" is after this one), so the local rules count it once.
 */
export function prepareGrantedTree(state, classId, verb, answer = {}) {
  if (!state || verb !== 'harvest') return state;
  if (classId === 'wood_tree') state.harvestedToday = false;
  else state.harvestsToday = Math.max(0, whole(answer.harvests, 1) - 1);
  return state;
}

/**
 * Dametime midnight on the page: this player's own harvest count on a shared Patch tree starts over
 * (the server turns its own per-player count at the same game day, patches.go advance), so the verb
 * menu offers Harvest again. The tending flags are the server's: its day turn sends them.
 */
export function newDayTree(state, classId) {
  if (!state) return state;
  if (classId === 'wood_tree') state.harvestedToday = false;
  else state.harvestsToday = 0;
  return state;
}

/** patch.js 171-174, 373-381. */
export const BUSY_LINE = 'Someone else is already working on this patch.';

/**
 * patch.js 171-182, 373-381: what another player's work refuses before this player's action bar
 * (tend while anyone else tends or digs; dig while someone else tends), or null.
 */
export function refusedBeforeBar(plot, verb, me, now = Date.now()) {
  const base = String(verb || '').split(':')[0];
  if (base === 'tend' && (tendedByOther(plot, me, now) || dugByOther(plot, me))) return BUSY_LINE;
  if (base === 'dig' && tendedByOther(plot, me, now)) return BUSY_LINE;
  return null;
}

/** No dash punctuation in player copy: an em or en dash becomes a comma. */
export function plainWords(line) {
  return String(line || '')
    .replace(/\s*[\u2014\u2013]\s*/g, ', ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Lines the page says itself, in plain player words. */
export const COPY = Object.freeze({
  connecting: 'The street is still connecting. Try again in a moment.',
  timeout: 'The patch did not answer. Try again.',
  waiting: 'Hold on, still asking the patch.',
});

/** Each refusal code's line (wire: patch_no), used when the server's own message is missing. */
export const REFUSAL_LINES = Object.freeze({
  slow_down: 'Slow down a little.',
  unknown: 'That is not something here.',
  far: 'You need to be closer.',
  busy: BUSY_LINE,
  not_messy: 'Nope, no tending needed.',
  planted: "There's already a seedling here.",
  dug: 'There is already a hole there.',
  weeds: 'You should probably tend to the weeds first.',
  hole: 'You need to wait for the hole to fill in first.',
  wrong_bean: 'That bean will not grow here. Beans only grow in certain regions. Like attracts like.',
  no_item: "You don't have that any more.",
  no_answer: 'The patch could not check your pack just now. Nothing was taken. Try again.',
  enough: "That's enough, thnx.",
  small: 'This tree is too small to harvest.',
  weak: 'This tree is too weak to be trantsformed',
  empty: "There's nothing to pick, cowboy.",
  daily_limit: 'You can only harvest from this tree once per game day.',
  not_wanted: 'This tree was already looked after today.',
  cleared: 'This Wood Tree has been cleared.',
  poisoned: 'That tree is already poisoned.',
  not_poisoned: 'There are no poisoned trees nearby.',
  nothing: "There's nothing here to clear.",
  not_tree: "That isn't a tree.",
  no_tool: "You'll need a working tool for that.",
  rooked: "It's rooked. Revive it first.",
});

/** patch.js 175-178 and 235-240: the "planted" code reads by verb. */
const PLANTED_BY_VERB = Object.freeze({
  tend: 'A seedling is growing - no need for tending!',
  dig: 'A seedling is growing - why would you dig it out?',
  plant: "There's already a seedling here.",
});

/**
 * Ours (G564 slice 3): a clear that lands after another player's (the server's first clear wins,
 * trant_*_dead.js clear 75-110, and answers "nothing") reads as what happened.
 */
export const CLEARED_FIRST_LINE = 'Someone else cleared it first.';

/** The line a refusal shows: the server's message, else the code's own line, in plain words. */
export function refusalLine(code, message = '', verb = '') {
  const base = String(verb || '').split(':')[0];
  const own = String(message || '').trim();
  if (code === 'nothing' && base === 'clear') return CLEARED_FIRST_LINE;
  if (own) return plainWords(own);
  if (code === 'planted' && PLANTED_BY_VERB[base]) return PLANTED_BY_VERB[base];
  return plainWords(REFUSAL_LINES[code] || 'Not now.');
}

/**
 * The page's own rolls for a soil verb, drawn before the server is asked, in the order
 * js/patches.js performPlotVerb takes them (so a replay with the same draws lands the same way):
 * - tend: the success roll (no Soil Appreciation: 90%) when there is one; a failed roll runs the
 *   tend here alone and changes no plot.
 * - dig: the Loam drop roll (Soil Appreciation I and up); a drop means no Earth receipt ("drop").
 * Returns { rolls, success, drop, skill } (skill: the package row's id for the server, or '').
 */
export function soilRolls(verb, { skills = [], upgrades = [], buffs = [], aggressiveOff = false } = {}, rng = Math.random) {
  const base = String(verb || '').split(':')[0];
  const maxLuck = Array.isArray(buffs) && buffs.includes('max_luck');
  const rubeweed = Array.isArray(buffs) && buffs.includes('rubeweed');
  if (base === 'tend') {
    const pkg = resolveTendPackage(skills, upgrades, { aggressiveOff });
    if (pkg.success_rate < 100 && !maxLuck) {
      const r = rng();
      return { rolls: [r], success: r < pkg.success_rate / 100, drop: false, skill: pkg.id === 'no_skill' ? '' : pkg.id };
    }
    return { rolls: [], success: true, drop: false, skill: pkg.id === 'no_skill' ? '' : pkg.id };
  }
  if (base === 'dig') {
    const pkg = resolveSoilPackage('dig_patch', skills);
    const skill = pkg.id === 'no_skill' ? '' : pkg.id;
    if (!pkg.drop_class_id) return { rolls: [], success: true, drop: false, skill };
    if (maxLuck) return { rolls: [], success: true, drop: true, skill };
    const r = rng();
    const chance = Math.min(100, pkg.drop_chance * (rubeweed ? 1.25 : 1));
    return { rolls: [r], success: true, drop: r < chance / 100, skill };
  }
  return { rolls: [], success: true, drop: false, skill: '' };
}

/** A replay rng: the given draws first, then fresh ones. */
export function replayRng(rolls = [], rng = Math.random) {
  const left = [...rolls];
  return () => (left.length ? left.shift() : rng());
}

/** The planter's soil_appreciation_bean_grow card level the plant sends ("grow": 0, 3 or 4). */
export function plantGrowLevel(upgrades = []) {
  return seedlingTimings(upgrades).growLevel;
}

/**
 * The old personal plots a save keeps for a street the server now shares: every soil and tree:<i>
 * key (demo plots stay). Returns how many went. The site pays them out once (plan section 10).
 */
export function stripSharedPlots(slot) {
  if (!slot || typeof slot !== 'object') return 0;
  let n = 0;
  for (const key of Object.keys(slot.plots || {})) {
    if (!isSharedKey(key)) continue;
    delete slot.plots[key];
    n += 1;
  }
  for (const key of Object.keys(slot.adopted || {})) {
    if (isSharedKey(key)) delete slot.adopted[key];
  }
  return n;
}

/** A plot's look for redraw checks: what changes its art, its target or its numbers. */
export function plotSignature(plot) {
  if (!plot) return '';
  const tree = plot.tree;
  return [
    plot.stage,
    plot.classTsid,
    plot.kind,
    plot.deadClass || '',
    plot.seedling ? `${plot.seedling.trantClass}:${plot.seedling.petted}` : '',
    tree ? `${tree.classId}` : '',
  ].join('|');
}
