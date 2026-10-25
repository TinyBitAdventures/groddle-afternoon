/**
 * The Hatchet's and Class Axe's own pack verbs (register row G165): harvest,
 * clear and Harvest and Clear act on a tree within reach, the way the
 * source's in-pack verbs proxy to the tree's own verbs (pure: no Pixi, no DOM).
 *
 * Source (tinyspeck/glitch-GameServerJS, CC0):
 * - items/hatchet.js:47-84     verbs.harvest: broken check, findCloseStack('wood_tree', 100),
 *                              the tree's harvest (enabled) or harvest_clear (hidden) or
 *                              "You can only harvest this tree once per game day."
 * - items/hatchet.js:109-149   verbs.clear: broken check, nearest is_dead_trant within 100
 *                              with clear enabled; hidden while harvest or harvest_clear
 *                              shows; else "Nothing to clear!". The handler tries the six
 *                              dead classes in order (bean, bubble, egg, fruit, gas, spice).
 * - items/hatchet.js:151-178   verbs.harvest_clear: the tree's harvest_clear, else hidden.
 * - items/class_axe.js:46-180  the same three verbs (clear listed first).
 * - items/item.js:444-467      proxyVerb / proxyVerbEnabled: nearest stack of the class
 *                              within max_distance, its verb's handler / conditions.
 * - players/player.js:1152-1182 findCloseStack: straight-line distance from the avatar,
 *                              the nearest one, at most max_distance away.
 * - items/wood_tree.js:442-508 the tree side: maturity 1 shows "Harvest and Clear"
 *                              ("Harvesting this wee tree will also kill it!") instead
 *                              of harvest; wood_tree_enchanted is its own class, so the
 *                              pack verbs never reach an enchanted tree.
 *
 * Remake decisions:
 * - A tree's verb state comes from the remake's own verb menu for that tree
 *   (content.js getVerbsFor plus feature decorations), so the pack button and
 *   the tree agree. Its "harvest" verb at maturity 1 counts as harvest_clear.
 * - The source's tree conditions had no energy gate (the skill package checked
 *   energy when the verb ran); the remake's do. When the tree is disabled for
 *   any reason but the daily limit, the pack button shows the tree's reason.
 */

export const PACK_TREE_SOURCE = 'tinyspeck/glitch-GameServerJS CC0 items/hatchet.js, items/class_axe.js';

/** items/hatchet.js / class_axe.js: the tools that carry these verbs, with name_single. */
export const PACK_TREE_TOOLS = Object.freeze({ hatchet: 'Hatchet', class_axe: 'Class Axe' });

/** findCloseStack(…, 100) in every proxy call. */
export const PACK_TREE_REACH = 100;

/** hatchet.js:139-144: the order the clear handler tries the dead trants. */
export const DEAD_TRANT_ORDER = Object.freeze([
  'trant_bean_dead',
  'trant_bubble_dead',
  'trant_egg_dead',
  'trant_fruit_dead',
  'trant_gas_dead',
  'trant_spice_dead',
]);

/** Verb names, tooltips and lines, verbatim. */
export const PACK_TREE_TEXT = Object.freeze({
  harvestLabel: 'harvest',
  harvestTip: 'Harvest a wood tree for planks',
  clearLabel: 'clear',
  clearTip: 'Clear a dead tree for planks',
  harvestClearLabel: 'Harvest and Clear',
  harvestClearTip: 'Harvesting this wee tree will also kill it!',
  broken: (name) => `This ${name} has become broken, and must be repaired.`,
  onceADay: 'You can only harvest this tree once per game day.',
  nothingToClear: 'Nothing to clear!',
  nothingToHarvest: "But there's nothing to harvest!",
  nothingToClearRun: "But there's nothing to clear!",
  /** wood_tree.js:500: the tree's own harvest handler past the daily limit. */
  treeSpent: 'You cannot harvest this tree anymore today!',
});

/** Source sort: hatchet.js lists harvest, clear, harvest_clear; class_axe.js clear first. */
const VERB_ORDER = Object.freeze({
  hatchet: Object.freeze(['harvest', 'clear', 'harvest_clear']),
  class_axe: Object.freeze(['clear', 'harvest', 'harvest_clear']),
});

export function isPackTreeTool(classTsid) {
  return Object.prototype.hasOwnProperty.call(PACK_TREE_TOOLS, classTsid);
}

export function isDeadTrant(classId) {
  return DEAD_TRANT_ORDER.includes(String(classId || ''));
}

/**
 * An ordinary Wood Tree (not the enchanted hollow class), still standing: one
 * harvested down to maturity 0 died into a Patch in the source (endHarvest onDie).
 */
export function isPlainWoodTree(target) {
  if (target?.classId !== 'wood_tree' || target?.state?.enchanted === true) return false;
  const m = target.state?.maturity;
  return !(m != null && Number(m) <= 0);
}

function pointOf(target) {
  const s = target?.sprite;
  if (!s || s.destroyed) return null;
  const x = Number(s.x);
  const y = Number(s.y);
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
}

/**
 * player.js findCloseStack: the nearest target the predicate accepts, measured
 * from the avatar in a straight line, if it is at most `reach` away.
 */
export function findCloseTarget(targets, from, predicate, reach = PACK_TREE_REACH) {
  const fx = Number(from?.x);
  const fy = Number(from?.y);
  if (!Number.isFinite(fx) || !Number.isFinite(fy)) return null;
  let best = null;
  let bestD = reach + 1;
  for (const target of targets || []) {
    if (!target || !predicate(target)) continue;
    const p = pointOf(target);
    if (!p) continue;
    const d = Math.hypot(p.x - fx, p.y - fy);
    if (d < bestD) {
      best = target;
      bestD = d;
    }
  }
  return bestD <= reach ? best : null;
}

const NULL = Object.freeze({ state: null });
const enabled = () => ({ state: 'enabled' });
const disabled = (reason) => ({ state: 'disabled', reason });

/**
 * The tree side of one Wood Tree, from its menu verbs: { harvest, harvestClear }
 * as GSJS conditions ({ state: 'enabled' | 'disabled' | null, reason }).
 * wood_tree.js:458 / :490: maturity 1 is harvest_clear's, the rest harvest's.
 */
export function woodTreeSide(tree, verbs) {
  const verb = (verbs || []).find((v) => v?.id === 'harvest');
  if (!tree || !verb) return { harvest: NULL, harvestClear: NULL, verb: null };
  const state = verb.enabled === false ? disabled(verb.reason || '') : enabled();
  const wee = Number(tree.state?.maturity) === 1;
  return { harvest: wee ? NULL : state, harvestClear: wee ? state : NULL, verb };
}

/** A dead tree's clear verb as a GSJS condition. */
export function deadTreeSide(tree, verbs) {
  const verb = (verbs || []).find((v) => v?.id === 'clear');
  if (!tree || !verb) return { clear: NULL, verb: null };
  return { clear: verb.enabled === false ? disabled(verb.reason || '') : enabled(), verb };
}

function isDailyLimit(reason) {
  return !reason || /once per game day/i.test(String(reason));
}

/**
 * The three pack conditions (hatchet.js:59-74, :120-133, :162-167).
 * ctx: { tool, working, wood: woodTreeSide(...) | null, dead: deadTreeSide(...) | null }
 */
export function packTreeConditions(ctx = {}) {
  const name = PACK_TREE_TOOLS[ctx.tool] || 'Hatchet';
  const broken = ctx.working === false ? disabled(PACK_TREE_TEXT.broken(name)) : null;
  const wood = ctx.wood || null;

  let harvest;
  if (broken) harvest = broken;
  else if (!wood?.verb) harvest = NULL;
  else if (wood.harvest.state === 'enabled') harvest = enabled();
  else if (wood.harvestClear.state === 'enabled') harvest = NULL;
  else {
    const reason = wood.harvest.reason || wood.harvestClear.reason;
    harvest = disabled(isDailyLimit(reason) ? PACK_TREE_TEXT.onceADay : reason);
  }

  // harvest_clear has no broken check of its own (hatchet.js:162-167).
  const harvestClear = wood?.harvestClear?.state === 'enabled' ? enabled() : NULL;

  let clear;
  if (broken) clear = broken;
  else if (ctx.dead?.clear?.state === 'enabled') clear = enabled();
  else if (harvest.state != null || harvestClear.state != null) clear = NULL;
  else clear = disabled(PACK_TREE_TEXT.nothingToClear);

  return { harvest, clear, harvest_clear: harvestClear };
}

const BUTTON = Object.freeze({
  harvest: Object.freeze({ label: PACK_TREE_TEXT.harvestLabel, tooltip: PACK_TREE_TEXT.harvestTip }),
  clear: Object.freeze({ label: PACK_TREE_TEXT.clearLabel, tooltip: PACK_TREE_TEXT.clearTip }),
  harvest_clear: Object.freeze({ label: PACK_TREE_TEXT.harvestClearLabel, tooltip: PACK_TREE_TEXT.harvestClearTip }),
});

/** Pack popover buttons for the conditions, in the tool's source order; hidden verbs drop out. */
export function packTreeButtons(tool, conditions) {
  const order = VERB_ORDER[tool] || VERB_ORDER.hatchet;
  const out = [];
  for (const id of order) {
    const c = conditions?.[id];
    if (!c || c.state == null) continue;
    out.push({
      id,
      label: BUTTON[id].label,
      tooltip: BUTTON[id].tooltip,
      enabled: c.state === 'enabled',
      reason: c.state === 'enabled' ? '' : c.reason || '',
    });
  }
  return out;
}

/**
 * What a pack verb's handler does (hatchet.js:76-84, :135-148, :169-177):
 * { run: { target, verb } } to start the tree's own verb, or { lines } to say.
 * `find(predicate)` is findCloseTarget bound to the avatar; `verbsOf(target)`
 * the tree's menu verbs.
 */
export function planPackTreeVerb(verbId, { working = true, find, verbsOf } = {}) {
  if (!working) return { lines: [] };
  if (verbId === 'harvest' || verbId === 'harvest_clear') {
    const tree = find(isPlainWoodTree);
    if (tree) {
      const side = woodTreeSide(tree, verbsOf(tree));
      const want = verbId === 'harvest' ? side.harvest : side.harvestClear;
      if (side.verb && want.state === 'enabled') return { run: { target: tree, verb: side.verb } };
      // The tree's handler refused (wood_tree.js:499-501), then the pack's own line.
      if (verbId === 'harvest' && side.verb && side.harvest.state === 'disabled') {
        const reason = side.harvest.reason;
        return { lines: [isDailyLimit(reason) ? PACK_TREE_TEXT.treeSpent : reason, PACK_TREE_TEXT.nothingToHarvest] };
      }
    }
    return { lines: [PACK_TREE_TEXT.nothingToHarvest] };
  }
  if (verbId === 'clear') {
    const lines = [];
    for (const cls of DEAD_TRANT_ORDER) {
      const tree = find((t) => t?.classId === cls);
      if (!tree) continue;
      const side = deadTreeSide(tree, verbsOf(tree));
      if (side.verb && side.clear.state === 'enabled') return { run: { target: tree, verb: side.verb }, lines };
      // dead_tree clear handler refused ("You'll need a hatchet first."): try the next class.
      if (side.verb && side.clear.reason && !lines.includes(side.clear.reason)) lines.push(side.clear.reason);
    }
    return { lines: [...lines, PACK_TREE_TEXT.nothingToClearRun] };
  }
  return null;
}

/**
 * wood_tree.js:442-472 on the tree's own menu: at maturity 1 its harvest is
 * "Harvest and Clear". Returns a new list, or null to leave the menu alone.
 */
export function relabelWeeHarvest(target, verbs) {
  if (!isPlainWoodTree(target) || Number(target.state?.maturity) !== 1) return null;
  if (!(verbs || []).some((v) => v?.id === 'harvest')) return null;
  return verbs.map((v) => (v?.id === 'harvest'
    ? { ...v, label: PACK_TREE_TEXT.harvestClearLabel, tooltip: PACK_TREE_TEXT.harvestClearTip }
    : v));
}
