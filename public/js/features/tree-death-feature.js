/**
 * Tree Poison, Tree Poison Antidote and tree death, as a feature module
 * (see js/feature-host.js). Rules live in js/tree-poison.js.
 *
 * Verbs: every living tree (street trants and Wood Trees from game.js, and
 * trees grown in Patches) gets the source trant_base verbs through
 * decorateVerbs: "apply poison to" while you carry Tree Poison, and on a
 * poisoned tree "apply antidote to" (harvest / pet / water are hidden while it
 * is poisoned, as in the source). Both verbs are 2.5 s pours (potion_base);
 * the potions also Pour from the pack onto the closest tree in 200 px.
 *
 * Poison: the tree says "Help! I've been poisoned and will die in N
 * seconds." at 3 s and every 30 s after (alternating with "I need
 * antidote!"), shows the poisoned overlay (Tiny Speck's own poisoned.fla:
 * skulls, hazard signs and a cloud circling over the tree, G273), and dies
 * three minutes later,
 * on or off the street. Off your own home, poisoning costs 10/25/60% of max
 * mood and stacks Poisoner's Guilt (90 s, then 420 s), then A too-guilty
 * mind (900 s); planting a bean eases the guilt (patch.js plantBean).
 *
 * Death: a trant becomes its dead class (trant_*_dead), a Wood Tree a Patch
 * plus 25 Planks on the ground 80 px to the right. A street tree's death is
 * recorded in engine.streetSlot('tree-death').replaced[<street tree index>]
 * and its plot handed to the patches feature (`adoptPlot`, key
 * `tree:<index>`), so the dead tree clears with a Hatchet into a Patch you
 * tend and plant (js/patches.js). Trees grown in Patches die in their plot
 * (`patchesFeature.killTree`). Nothing respawns a dead street tree: only a
 * planted bean brings a tree back, as in the source.
 *
 * Multiplayer (G334): a street tree is everyone's. A pour that lands on one
 * asks the realtime server first (street-objects-feature sharedObjectVerb;
 * the server's objects.go pour), and the poison's clock, anyone's antidote
 * and the death are the server's: this page never kills a shared street
 * tree on its own clock, it waits for the server's word (sharedTreeDied),
 * which also reaches players who come later. Then the tree dies here as in
 * solo (its plot becomes this player's own Patch, as every street Patch is
 * in multiplayer); a dead Wood Tree's 25 Planks fall only for the player
 * who poured the poison. The bottle is the site's ledger's to confirm (G335
 * slice 4): the server uses its charge there before the pour lands, refuses
 * without one ("You don't have any antidote!"), and the pour here uses the
 * charge the ledger did (bottleFromLedger). Guilt, mood and Botany stay yours.
 * Trees grown in your Patches, your home and private places stay local.
 *
 * QA: ?autostart=1&fresh=1&resetgame=1&questoffer=off&treepoisondemo=1
 *   teaches Botany and packs Tree Poison, Antidote, Hatchet, Hoe and beans,
 *   then stands you by the nearest living street trant
 *   (=wood picks a Wood Tree; =planted the patchdemo=tree tree).
 *   &treepoisonms=<ms> shortens the three-minute poison (QA only).
 *   &treepoisonautoplay=1 pours poison, waits for the death, clears the dead
 *   tree, tends, plants, pets three times and waits for the new tree
 *   (&treepoisongrowms, default 3000); =dead stops at the dead tree;
 *   =antidote cures the tree after 4 s instead.
 * Canvas data: treePoisonDemo, treePoisoned, treePoisonLast, treePoisonUses,
 * treeGuilt, treeDeaths, treePoisonAutoplay.
 */

import { ITEM_CATALOG, ensureItem } from '../inventory.js?v=catalog-unified-7';
import { moodMax } from '../metabolics.js';
import { plantChoices } from '../patches.js?v=g414-1';
import { textureFromUrl } from '../textures.js';
import { displayTopOf, itemstackOverlayPoint, playSheetOverlay } from '../overlay-art.js?v=g463-2';
import {
  GUILT_BUFF,
  POISON_COPY,
  POISON_DURATION_MS,
  POUR_MS,
  POUR_RANGE,
  TREE_ANTIDOTE,
  TREE_POISON,
  bottleUsesLeft,
  canPourAntidote,
  canPourPoison,
  createPoisonBottleState,
  cureTreePoison,
  guiltAfterPlanting,
  guiltState,
  isPoisonableTree,
  isPoisoned,
  performAntidotePour,
  performPoisonPour,
  poisonBubbleDue,
  poisonDue,
  poisonRemainingMs,
  quoteAntidoteVerb,
  quotePoisonVerb,
  treeDeathOutcome,
} from '../tree-poison.js';
import { patchesFeature } from './patches-feature.js?v=g485-1';

export const TREE_DEATH_FEATURE_ID = 'tree-death';
const VERB_PREFIX = 'treepoison:';
/** A poisoned tree hides these (trant_base / wood_tree conditions: is_poisoned -> null). */
const HIDDEN_WHILE_POISONED = new Set(['harvest', 'pet', 'water', 'trantsform']);
const SCAN_MS = 200;

const POTION_ITEMS = Object.freeze({
  [TREE_POISON]: {
    label: 'Tree Poison',
    desc: 'Thick glass conceals a dark truth: the death sentence for five trees. But really, since the inevitable broom of death clears the way for new life, isn\'t it actually just "a life sentence for five NEW trees"? No, it\'s mainly just tree poison.',
    baseCost: 750,
    stackMax: 1,
  },
  [TREE_ANTIDOTE]: {
    label: 'Tree Poison Antidote',
    desc: 'Tree antidote: the only known reprieve for the mostly dead tree (there\'s a big difference between "mostly dead" and "all dead"). Contains five sips at the last chance saloon for five lucky trees.',
    baseCost: 375,
    stackMax: 1,
  },
});

let bottles = createPoisonBottleState();
let last = '';
let pouring = null;
let lastScanAt = 0;
let demo = null;
let autoplay = null;
const overlays = new Map(); // tree target -> playSheetOverlay handle (poisoned)

// ---------------------------------------------------------------------------
// Pure helpers (tested in tests/tree-death.test.js)
// ---------------------------------------------------------------------------

/**
 * A tree target this feature works on: living, not owned by another feature.
 * wood_tree.js poison conditions return null for wood_tree_enchanted.
 */
export function isTreeTarget(target) {
  return Boolean(target && !target.featureId && target.state && target.state.enchanted !== true && isPoisonableTree(target.classId) && target.sprite);
}

/** The street tree slot (game.js spawnTrees keeps trees[i].state === target.state). */
export function streetTreeIndex(worldTrees, target) {
  if (!Array.isArray(worldTrees) || !target?.state) return -1;
  return worldTrees.findIndex((row) => row?.state === target.state);
}

/**
 * decorateVerbs: insert the poison / antidote rows (by sort) and drop the
 * verbs a poisoned tree hides.
 */
export function decorateTreeVerbs(verbs, state, ctx = {}) {
  const poisoned = isPoisoned(state);
  const out = poisoned ? verbs.filter((v) => !HIDDEN_WHILE_POISONED.has(String(v.id).split(':')[0])) : [...verbs];
  const rows = [];
  if (poisoned) {
    const q = quoteAntidoteVerb(state, ctx);
    if (q.visible) {
      rows.push({ id: `${VERB_PREFIX}antidote`, label: POISON_COPY.antidoteVerb, sort: 53, tooltip: POISON_COPY.antidoteTip, enabled: q.enabled, reason: q.reason || '', energy: 0 });
    }
  } else {
    const q = quotePoisonVerb(state, ctx);
    if (q.visible) {
      rows.push({ id: `${VERB_PREFIX}poison`, label: POISON_COPY.poisonVerb, sort: 54, tooltip: POISON_COPY.poisonTip, enabled: q.enabled, reason: q.reason || '', energy: 0 });
    }
  }
  for (const row of rows) {
    const at = out.findIndex((v) => Number.isFinite(v.sort) && v.sort > row.sort);
    if (at < 0) out.push(row);
    else out.splice(at, 0, row);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

function guiltNow(engine) {
  return guiltState({
    buffs: engine.activeBuffIds?.() || [],
    guiltRow: engine.buffRow?.(GUILT_BUFF) || null,
    now: Date.now(),
  });
}

function isOwner(engine) {
  return engine.homeContext?.().inHome === true;
}

function ctxFor(engine) {
  return {
    inv: engine.inv,
    pc: engine.pc,
    learned: engine.learnedSkills || [],
    mood: engine.pc?.mood || 0,
    maxMood: moodMax(engine.pc),
    guilt: guiltNow(engine),
    owner: isOwner(engine),
  };
}

function poisonMs(engine) {
  const ms = Math.floor(Number(engine.param?.('treepoisonms')));
  return ms > 0 ? ms : POISON_DURATION_MS;
}

function closestTree(engine, poisoned) {
  const p = engine.player;
  if (!p) return null;
  let best = null;
  let bestD = Infinity;
  for (const t of engine.interactables || []) {
    if (!isTreeTarget(t) || isPoisoned(t.state) !== poisoned) continue;
    const d = Math.hypot(t.sprite.x - p.x, (t.sprite.y - p.y) * 0.5);
    if (d < bestD) {
      bestD = d;
      best = t;
    }
  }
  return best && bestD <= POUR_RANGE ? best : null;
}

function guiltLabel(g) {
  if (g.tooGuilty) return 'tooGuilty';
  if (g.secondTime) return 'second';
  return g.guilty ? 'guilty' : 'clear';
}

function publish(engine) {
  if (!engine?.setData) return;
  const now = Date.now();
  const poisoned = (engine.interactables || [])
    .filter((t) => isTreeTarget(t) && isPoisoned(t.state))
    .map((t) => `${t.classId}@${Math.round(t.sprite.x)}:${Math.ceil(poisonRemainingMs(t.state, now) / 1000)}`);
  engine.setData('treePoisoned', poisoned.join(',') || 'none');
  engine.setData('treePoisonLast', last || 'none');
  engine.setData('treePoisonUses', `poison:${bottleUsesLeft(bottles, TREE_POISON, engine.inv)},antidote:${bottleUsesLeft(bottles, TREE_ANTIDOTE, engine.inv)}`);
  engine.setData('treeGuilt', guiltLabel(guiltNow(engine)));
  const replaced = engine.streetSlot ? engine.streetSlot(TREE_DEATH_FEATURE_ID).replaced || {} : {};
  engine.setData('treeDeaths', Object.keys(replaced).length);
}

// ---------------------------------------------------------------------------
// Overlay + pour FX
// ---------------------------------------------------------------------------

/**
 * applyPoison / onPlayerEnter (items/include/trants.js 1252-1260, 1272-1284;
 * wood_tree.js 578-586): itemstack_overlay poisoned on the tree, delta_y 20
 * from its top, no width (the 150 x 50 stage at 1:1), for what is left of
 * the poison, following the tree. The SWF loops at 24 fps.
 */
const POISON_OVERLAY = Object.freeze({ key: 'poisoned', dy: 20 });

function makeOverlay(engine, target) {
  if (!engine.PIXI || !engine.fxLayer) return null;
  const spr = target.sprite;
  let last = itemstackOverlayPoint(spr.x, displayTopOf(spr), { dy: POISON_OVERLAY.dy });
  return playSheetOverlay(engine.PIXI, POISON_OVERLAY.key, {
    layer: engine.fxLayer,
    at: () => {
      if (spr && !spr.destroyed) last = itemstackOverlayPoint(spr.x, displayTopOf(spr), { dy: POISON_OVERLAY.dy });
      return last;
    },
    durationMs: Math.max(1000, poisonRemainingMs(target.state)),
    zIndex: 8800,
  });
}

function dropOverlay(target) {
  overlays.get(target)?.stop();
  overlays.delete(target);
}

function pourFx(engine, potionClass, target) {
  const { PIXI } = engine;
  const p = engine.player;
  if (!PIXI || !p || !engine.fxLayer) return null;
  const root = new PIXI.Container();
  root.zIndex = 9000;
  root.eventMode = 'none';
  const bottle = new PIXI.Sprite(textureFromUrl(ITEM_CATALOG[potionClass]?.icon || `assets/sprites/icons/${potionClass}.png`));
  bottle.anchor.set(0.5);
  root.addChild(bottle);
  const drops = new PIXI.Graphics();
  root.addChild(drops);
  engine.fxLayer.addChild(root);
  return { root, bottle, drops, target, age: 0, color: potionClass === TREE_POISON ? 0x6f8f2a : 0x8fd8ff };
}

function tickPourFx(fx, engine, dtMs) {
  if (!fx || fx.root.destroyed) return;
  fx.age += dtMs;
  const p = engine.player;
  const k = Math.min(1, fx.age / POUR_MS);
  if (p) {
    fx.bottle.x = p.x;
    fx.bottle.y = (p.y || 0) - 135;
  }
  const dir = fx.target?.sprite && p && fx.target.sprite.x < p.x ? -1 : 1;
  fx.bottle.rotation = dir * (0.6 * Math.min(1, k * 3) + Math.sin(fx.age / 140) * 0.25);
  fx.drops.clear();
  const tx = fx.target?.sprite?.x ?? fx.bottle.x;
  const ty = (fx.target?.sprite?.y ?? fx.bottle.y + 120) - 30;
  for (let i = 0; i < 6; i += 1) {
    const t = (fx.age / 520 + i / 6) % 1;
    fx.drops.circle(tx + Math.sin(i * 2.3) * 14, ty - 70 + t * 70, 3);
  }
  fx.drops.fill({ color: fx.color, alpha: 0.85 });
  fx.root.alpha = k > 0.88 ? (1 - k) / 0.12 : 1;
}

function stopPourFx() {
  if (pouring?.fx?.root && !pouring.fx.root.destroyed) pouring.fx.root.destroy({ children: true });
}

// ---------------------------------------------------------------------------
// Pour + death
// ---------------------------------------------------------------------------

function say(engine, msg, ok = true) {
  last = msg;
  engine.pushActivity?.(msg);
  if (!ok) engine.toast?.(msg, 2600);
  publish(engine);
}

function applyGuiltChange(engine, change) {
  if (!change) return;
  for (const id of change.remove || []) engine.removeBuff?.(id);
  if (change.apply) engine.applyBuff?.(change.apply.id, { durationSec: change.apply.durationSec, args: change.apply.args });
}

/** Multiplayer with the realtime client: does the server hold this street tree's life? */
function sharedTree(engine, target) {
  if (engine?.mode !== 'multiplayer' || !engine.query?.('realtimeClient') || target?.grownFromBean) return false;
  return Number.isInteger(target?.treeIndex) && isTreeTarget(target);
}

/** The pour is the server's call first (null: it is local here; true: asked). */
function askServer(engine, kind, target) {
  if (!sharedTree(engine, target)) return null;
  const verbId = `${VERB_PREFIX}${kind}`;
  const grant = engine.query('sharedVerbGrant', target, verbId, engine);
  if (grant) {
    if (grant.use) bottleFromLedger(engine, kind === 'poison' ? TREE_POISON : TREE_ANTIDOTE, grant.use);
    return null;
  }
  return engine.query('sharedObjectVerb', target, verbId, engine) === true ? true : null;
}

/**
 * G335 slice 4: the server used this pour's charge through the site's ledger (LedgerUse.php):
 * the bottle holds what the ledger says is left, so the pour's own use lands on it, and a bottle
 * the ledger emptied leaves the pack once (the trade slice's applied list holds its op).
 */
function bottleFromLedger(engine, potionClass, use) {
  const left = Math.max(0, Math.floor(Number(use.left) || 0));
  if (use.spent) engine.query?.('ledgerReceipt', String(use.op || ''), engine);
  bottles.uses[potionClass] = use.spent ? 1 : Math.min(4, left) + 1;
}

/** onPourComplete for either potion on a tree target. */
function completePour(engine, kind, target) {
  if (!isTreeTarget(target) || !(engine.interactables || []).includes(target)) {
    say(engine, kind === 'poison' ? "I can't find a tree anywhere!" : POISON_COPY.noAntidoteTarget, false);
    return false;
  }
  const ctx = ctxFor(engine);
  if (kind === 'poison') {
    const q = quotePoisonVerb(target.state, ctx);
    if (!q.enabled) return say(engine, q.reason || POISON_COPY.noPoisonTarget, false), false;
    // Multiplayer: the street hears of it first; its go-ahead runs this pour again (the grant).
    if (askServer(engine, kind, target)) return true;
    const res = performPoisonPour(target.state, { ...ctx, now: Date.now(), durationMs: poisonMs(engine), bottles });
    if (!res.ok) return say(engine, res.msg, false), false;
    applyGuiltChange(engine, res.guilt);
    if (res.moodLost) engine.floatText?.(engine.player.x + 20, engine.player.y - 90, `-${res.moodLost} mood`, 0xff8888);
    for (const row of res.counters) engine.achievement?.(row.counter, row.amount);
    say(engine, res.msg);
  } else {
    const q = quoteAntidoteVerb(target.state, ctx);
    if (!q.enabled) return say(engine, q.reason || POISON_COPY.noAntidoteTarget, false), false;
    if (askServer(engine, kind, target)) return true;
    // G268: the pour asks the metabolic gate itself, after it lands, and the
    // gate says "You would have gained some mood, but you're dead!".
    const res = performAntidotePour(target.state, { ...ctx, bottles });
    if (!res.ok) return say(engine, res.msg, false), false;
    dropOverlay(target);
    if (res.moodGained) engine.floatText?.(engine.player.x + 20, engine.player.y - 90, `+${res.moodGained} mood`, 0xffe066);
    for (const row of res.counters) engine.achievement?.(row.counter, row.amount);
    say(engine, res.msg);
  }
  engine.refreshPack?.();
  engine.save?.();
  publish(engine);
  return true;
}

/** die(): replace the tree with what it leaves behind (opts.planks: multiplayer says whose they are). */
function killTree(engine, target, opts = {}) {
  const outcome = treeDeathOutcome(target.classId, { poisoned: typeof opts.planks === 'boolean' ? opts.planks : isPoisoned(target.state) });
  dropOverlay(target);
  if (!outcome) return null;
  const x = target.sprite.x;
  const y = target.sprite.y;
  let result = null;
  if (target.grownFromBean) {
    cureTreePoison(target.state);
    result = patchesFeature.killTree(engine, target);
  } else {
    const index = streetTreeIndex(engine.streetWorld?.()?.trees, target);
    if (index < 0) return null;
    const slot = engine.streetSlot(TREE_DEATH_FEATURE_ID);
    slot.replaced ||= {};
    slot.replaced[index] = { classId: target.classId, soilClass: outcome.soilClass, at: Date.now() };
    cureTreePoison(target.state);
    engine.unregister(target);
    // game.js spawnTrees places sprite.y = ground + 2; patches draws at y + 2.
    patchesFeature.adoptPlot(engine, { key: `tree:${index}`, soilClass: outcome.soilClass, x, y: y - 4 });
    result = { classId: target.classId, soilClass: outcome.soilClass, x, y, key: `tree:${index}` };
  }
  if (result && outcome.planks) engine.dropWorldStack?.('plank', outcome.planks, x + outcome.plankDx, y - 74);
  last = `died:${target.classId}>${outcome.soilClass}`;
  engine.save?.();
  publish(engine);
  return result;
}

/** Street trees that already died here stay gone (their plot is the patches feature's). */
function hideReplacedTrees(engine) {
  const slot = engine.streetSlot(TREE_DEATH_FEATURE_ID);
  const replaced = slot.replaced || {};
  if (!Object.keys(replaced).length) return;
  const trees = engine.streetWorld?.()?.trees || [];
  for (const target of [...(engine.interactables || [])]) {
    if (!isTreeTarget(target) || target.grownFromBean) continue;
    const index = streetTreeIndex(trees, target);
    const row = replaced[index];
    if (row && row.classId === target.classId) engine.unregister(target);
  }
}

function startPackPour(engine, kind) {
  if (pouring) return say(engine, 'You are already pouring a potion.', false), true;
  const ctx = ctxFor(engine);
  const target = closestTree(engine, kind === 'antidote');
  const check = kind === 'poison' ? canPourPoison(target, ctx) : canPourAntidote(target, ctx);
  if (!check.ok) return say(engine, check.msg, false), true;
  beginPour(engine, kind, target, true);
  return true;
}

function beginPour(engine, kind, target, timed) {
  stopPourFx();
  engine.playSound?.('POTION_GENERIC', { volume: 0.6 });
  pouring = { kind, target, at: Date.now(), timed, fx: pourFx(engine, kind === 'poison' ? TREE_POISON : TREE_ANTIDOTE, target) };
}

// ---------------------------------------------------------------------------
// QA demo + autoplay
// ---------------------------------------------------------------------------

function demoVariant(engine) {
  const raw = engine.param?.('treepoisondemo');
  if (!raw) return null;
  return ['wood', 'planted'].includes(raw) ? raw : '1';
}

function setupDemoKit(engine) {
  engine.grantSkill?.('botany_1');
  const kit = { [TREE_POISON]: 1, [TREE_ANTIDOTE]: 1, hatchet: 1, hoe: 1, watering_can: 1, bean_bean: 2, bean_fruit: 1, bean_wood: 1, bean_egg: 1 };
  for (const [id, qty] of Object.entries(kit)) engine.inv[id] = Math.max(qty, engine.inv[id] || 0);
  engine.pc.energy = Math.max(engine.pc.energy || 0, 100);
  engine.pc.mood = Math.max(engine.pc.mood || 0, moodMax(engine.pc));
  engine.refreshPack?.();
}

function demoCandidate(engine, variant) {
  const p = engine.player;
  let best = null;
  let bestD = Infinity;
  for (const t of engine.interactables || []) {
    if (!isTreeTarget(t)) continue;
    if (variant === 'planted' ? !t.grownFromBean : t.grownFromBean) continue;
    if (variant === 'wood' ? t.classId !== 'wood_tree' : variant !== 'planted' && t.classId === 'wood_tree') continue;
    const d = Math.abs(t.sprite.x - (p?.x || 0));
    if (d < bestD) {
      bestD = d;
      best = t;
    }
  }
  return best;
}

function tickDemo(engine, now) {
  if (!demo || demo.done) return;
  if (now > demo.until) {
    demo.done = true;
    engine.setData('treePoisonDemo', 'none');
    return;
  }
  const target = demoCandidate(engine, demo.variant);
  if (!target) return;
  demo.done = true;
  demo.target = target;
  const p = engine.player;
  if (p && demo.variant !== 'planted') {
    const side = target.sprite.x > 200 ? -1 : 1;
    p.x = target.sprite.x + side * 110;
    p.y = target.sprite.y - 2;
    p.vx = 0;
    p.vy = 0;
    engine.snapCamera?.();
  }
  engine.setData('treePoisonDemo', `ready:${target.classId}@${Math.round(target.sprite.x)}`);
  const mode = engine.param?.('treepoisonautoplay');
  if (mode) autoplay = { mode, step: 'poison', at: now + 1200, target, key: null, tries: 0 };
  publish(engine);
}

function nextStep(step, at, extra = {}) {
  Object.assign(autoplay, { step, at, ...extra });
  return true;
}

function tickAutoplay(engine, now) {
  if (!autoplay || now < autoplay.at || engine.acting?.()) return;
  engine.setData('treePoisonAutoplay', autoplay.step);
  const a = autoplay;
  switch (a.step) {
    case 'poison':
      if (!isTreeTarget(a.target)) return nextStep('done', 0);
      beginPour(engine, 'poison', a.target, true);
      return nextStep(a.mode === 'antidote' ? 'antidote' : 'wait-death', now + POUR_MS + (a.mode === 'antidote' ? 4000 : 500));
    case 'antidote':
      beginPour(engine, 'antidote', a.target, true);
      return nextStep('done', now + POUR_MS + 500);
    case 'wait-death': {
      if (isTreeTarget(a.target) && (engine.interactables || []).includes(a.target)) return nextStep('wait-death', now + 400);
      const replaced = engine.streetSlot(TREE_DEATH_FEATURE_ID).replaced || {};
      const key = a.target.grownFromBean ? 'demo:tree' : Object.keys(replaced).map((i) => `tree:${i}`).find((k) => patchesFeature.entityByKey(k));
      if (a.mode === 'dead' || !key) return nextStep('done', 0, { key });
      return nextStep('clear', now + 1500, { key });
    }
    case 'clear': {
      const entity = patchesFeature.entityByKey(a.key);
      if (entity?.plot?.stage === 'dead') patchesFeature.runPlotVerb(engine, a.key, 'clear');
      return nextStep('tend', now + 1500);
    }
    case 'tend': {
      const entity = patchesFeature.entityByKey(a.key);
      if (entity?.plot?.stage === 'dirty' && a.tries < 6) {
        a.tries += 1;
        patchesFeature.runPlotVerb(engine, a.key, 'tend');
        return nextStep('tend', now + 1200);
      }
      return nextStep('plant', now + 600);
    }
    case 'plant': {
      const entity = patchesFeature.entityByKey(a.key);
      if (!entity) return nextStep('done', 0);
      const hub = engine.street?.hubId ?? engine.street?.hub_id ?? null;
      const choice = plantChoices(engine.inv, entity.plot.kind, hub).find((c) => c.ok);
      if (!choice) return nextStep('done', 0);
      patchesFeature.runPlotVerb(engine, a.key, `plant:${choice.beanClass}`);
      const growMs = Math.floor(Number(engine.param?.('treepoisongrowms'))) || 3000;
      if (entity.plot.seedling) entity.plot.seedling.minAt = Date.now() + growMs;
      return nextStep('pet', now + 900, { pets: 0 });
    }
    case 'pet':
      patchesFeature.runPlotVerb(engine, a.key, 'pet');
      a.pets += 1;
      return nextStep(a.pets >= 3 ? 'wait-tree' : 'pet', now + 900);
    case 'wait-tree': {
      const entity = patchesFeature.entityByKey(a.key);
      if (entity?.plot?.stage === 'tree') return nextStep('done', 0);
      return nextStep('wait-tree', now + 500);
    }
    default:
      engine.setData('treePoisonAutoplay', 'done');
      autoplay = null;
  }
  return undefined;
}

function ensurePotionItems() {
  for (const [id, meta] of Object.entries(POTION_ITEMS)) {
    if (!ITEM_CATALOG[id]) ensureItem(id, { ...meta, icon: `assets/sprites/icons/${id}.png` });
  }
}

// ---------------------------------------------------------------------------
// Feature
// ---------------------------------------------------------------------------

export const treeDeathFeature = {
  id: TREE_DEATH_FEATURE_ID,

  init(engine) {
    ensurePotionItems();
    publish(engine);
  },

  onStreetEnter(street, engine) {
    hideReplacedTrees(engine);
    // Poison timers keep running while the street is away (apiSetTimer('die')).
    // A shared street tree's death is the server's word (sharedTreeDied).
    const now = Date.now();
    for (const target of [...(engine.interactables || [])]) {
      if (isTreeTarget(target) && poisonDue(target.state, now) && !sharedTree(engine, target)) killTree(engine, target);
    }
    const variant = demoVariant(engine);
    if (variant && !demo) {
      setupDemoKit(engine);
      demo = { variant, until: now + 8000, done: false };
    }
    publish(engine);
  },

  onStreetClear() {
    for (const target of [...overlays.keys()]) dropOverlay(target);
    stopPourFx();
    pouring = null;
  },

  onTick(dtMs, now, engine) {
    if (pouring) {
      tickPourFx(pouring.fx, engine, dtMs);
      if (now - pouring.at >= POUR_MS) {
        const { kind, target, timed } = pouring;
        stopPourFx();
        pouring = null;
        if (timed) completePour(engine, kind, target);
      }
    }
    for (const target of [...overlays.keys()]) {
      if (!target.sprite || target.sprite.destroyed || !isPoisoned(target.state)) dropOverlay(target);
    }
    if (demo && !demo.done) tickDemo(engine, now);
    if (autoplay) tickAutoplay(engine, now);
    if (now - lastScanAt < SCAN_MS) return;
    lastScanAt = now;
    let changed = false;
    for (const target of [...(engine.interactables || [])]) {
      if (!isTreeTarget(target) || !isPoisoned(target.state)) continue;
      if (poisonDue(target.state, now) && !sharedTree(engine, target)) {
        killTree(engine, target);
        changed = true;
        continue;
      }
      if (!overlays.has(target)) {
        const fx = makeOverlay(engine, target);
        if (fx) overlays.set(target, fx);
      }
      const bubble = poisonBubbleDue(target.state, now);
      if (bubble) {
        target.state.poisonBubble = bubble.tick;
        engine.say?.(target, bubble.text, bubble.showMs);
        changed = true;
      }
    }
    if (changed || overlays.size) publish(engine);
  },

  decorateVerbs(target, verbs, engine) {
    if (!isTreeTarget(target)) return null;
    const ctx = ctxFor(engine);
    return decorateTreeVerbs(verbs, target.state, ctx).map((row) => {
      if (!String(row.id).startsWith(VERB_PREFIX) || !row.enabled) return row;
      // game.js reads durationMs as the timed action starts: start the pour there.
      const kind = row.id.slice(VERB_PREFIX.length);
      let started = false;
      const out = { ...row };
      Object.defineProperty(out, 'durationMs', {
        enumerable: true,
        get() {
          if (!started) {
            started = true;
            beginPour(engine, kind, target, false);
          }
          return POUR_MS;
        },
      });
      return out;
    });
  },

  runVerbOverride(target, verbId, engine) {
    if (!String(verbId).startsWith(VERB_PREFIX)) return null;
    stopPourFx();
    pouring = null;
    completePour(engine, verbId.slice(VERB_PREFIX.length), target);
    return true;
  },

  packVerbs(classTsid, engine) {
    if (classTsid !== TREE_POISON && classTsid !== TREE_ANTIDOTE) return [];
    const kind = classTsid === TREE_POISON ? 'poison' : 'antidote';
    const ctx = ctxFor(engine);
    const target = closestTree(engine, kind === 'antidote');
    const check = kind === 'poison' ? canPourPoison(target, ctx) : canPourAntidote(target, ctx);
    const uses = `${bottleUsesLeft(bottles, classTsid, engine.inv)} of 5 left`;
    const tip = kind === 'poison' ? POISON_COPY.pourPoisonTip : POISON_COPY.pourAntidoteTip;
    return [{ id: 'pour', label: 'Pour', enabled: check.ok, reason: check.msg || '', tooltip: `${tip} · ${uses}`, primary: check.ok }];
  },

  /**
   * Multiplayer (street-objects-feature): the server says this street tree died, for everyone.
   * by: who poured the poison (their 25 Planks, for a Wood Tree); 0 is the Rook.
   */
  sharedTreeDied(target, info, engine) {
    if (engine?.mode !== 'multiplayer' || !isTreeTarget(target) || target.grownFromBean) return null;
    if (!(engine.interactables || []).includes(target)) return true;
    const me = Number(engine.query?.('realtimeClient')?.me?.id) || 0;
    const by = Number(info?.by) || 0;
    killTree(engine, target, { planks: by > 0 && by === me });
    return true;
  },

  runPackVerb(classTsid, verbId, engine) {
    if (verbId !== 'pour' || (classTsid !== TREE_POISON && classTsid !== TREE_ANTIDOTE)) return false;
    return startPackPour(engine, classTsid === TREE_POISON ? 'poison' : 'antidote');
  },

  /** patch.js plantBean: planting a bean eases Poisoner's Guilt. */
  onEvent(counter, amount, engine) {
    if (counter !== 'patches:planted') return;
    const change = guiltAfterPlanting(guiltNow(engine));
    if (!change) return;
    applyGuiltChange(engine, change);
    engine.pushActivity?.(change.msg);
    publish(engine);
  },

  save() {
    return { version: 1, ...bottles };
  },

  restore(slice) {
    bottles = createPoisonBottleState(slice || {});
  },

  /** QA / tests. */
  _state() {
    return { bottles, last, pouring, demo, autoplay };
  },
  _reset() {
    bottles = createPoisonBottleState();
    last = '';
    pouring = null;
    demo = null;
    autoplay = null;
    for (const h of overlays.values()) h.stop();
    overlays.clear();
  },
  _killTree: killTree,
  _completePour: completePour,
};
