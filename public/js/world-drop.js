/**
 * Dragging a pack item onto a thing in the world (register G588, left: "dragging pack items onto
 * world targets"). In the original a verb could be a drop target: `is_drop_target: true`, a
 * `drop_ok_code(stack, pc)` that says which dragged stacks it takes, and a `drop_tip` the client
 * shows while the stack hovers the thing (glitch-client DragVO / LocationInputHandler); letting go
 * runs that verb with the stack. This module is the table of those verbs for the things the remake
 * has and the verbs it implements, from GSJS items/*.js, and the pure rules: which rule a dragged
 * class meets on a target, and the tip's words. features/world-drop-feature.js does the dragging.
 *
 * Each rule: `classes` (a target classId test), `verbs` (the remake's verb ids for it, first one
 * the target offers wins), `accepts(classTsid, ctx)` (drop_ok_code), `tip` (drop_tip, with the
 * client's {$count}, {$stack_name} and {$item_name}), `src` (file and lines), and `use`:
 *   'verb'   run the target's verb (a tool the verb finds in the pack itself: a Watering Can, a Pick);
 *   'pick'   the target-item picker with the dragged stack chosen (Feed: its how many step follows);
 *   'donate' the shrine's donation window with the dragged stack chosen.
 * Garden plots and Guano stay with features/garden-guano-feature.js (G403).
 */

const TREE = (c) => (/^trant_/.test(c) && !/_dead$/.test(c)) || c === 'wood_tree';
const ANIMAL = (c) => ['npc_piggy', 'npc_chicken', 'npc_butterfly', 'npc_batterfly'].includes(c);
const PICKS = new Set(['pick', 'fancy_pick']);

/** GSJS drop-target verbs the remake implements, in the order a target's verbs are tried. */
export const WORLD_DROP_RULES = Object.freeze([
  {
    id: 'give_egg', classes: (c) => c === 'newxp_dustbunny', verbs: ['give_egg'], use: 'verb',
    accepts: (s) => s === 'egg_plain', tip: 'Give Egg to Dust Bunny', src: 'npc_newxp_dustbunny.js 177-195',
  },
  {
    id: 'feed', classes: (c) => c === 'npc_piggy' || c === 'npc_batterfly', verbs: ['feed'], use: 'pick',
    accepts: (s, ctx) => Boolean(ctx?.feedable?.(s)), tip: 'Feed {$count} {$stack_name} to {$item_name}',
    src: 'npc_piggy.js verbs.feed (drop_ok_code isFood); npc_batterfly.js verbs.feed',
  },
  {
    id: 'apply_balm', classes: (c) => ANIMAL(c) || TREE(c), verbs: ['rook_apply_balm', 'apply_balm'], use: 'verb',
    accepts: (s) => s === 'potion_rook_balm', tip: 'Apply Rook Balm', src: 'npc_piggy.js, trant_*.js verbs.apply_balm',
  },
  {
    id: 'water', classes: TREE, verbs: ['water'], use: 'verb',
    accepts: (s) => s === 'watering_can' || s === 'irrigator_9000', tip: 'Water this {$item_name}', src: 'trant_*.js, wood_tree.js verbs.water',
  },
  {
    id: 'apply_antidote', classes: TREE, verbs: ['treepoison:antidote'], use: 'verb',
    accepts: (s) => s === 'tree_poison_antidote' || s === 'potion_tree_poison_antidote',
    tip: 'Apply an antidote to this poor poisoned tree', src: 'trant_*.js verbs.apply_antidote',
  },
  {
    id: 'poison', classes: TREE, verbs: ['treepoison:poison'], use: 'verb',
    accepts: (s) => s === 'tree_poison' || s === 'potion_tree_poison', tip: 'Poison this tree, killing it.', src: 'trant_*.js verbs.poison',
  },
  {
    // rock_metal_1 asks for a Fancy Pick in its drop_ok_code; the remake's Mine takes any working pick
    // (the verb itself says when it can't), so the drag takes both.
    id: 'mine', classes: (c) => /^rock_/.test(c), verbs: ['mine'], use: 'verb',
    accepts: (s) => PICKS.has(s), tip: 'Mine this {$item_name}', src: 'rock_*.js verbs.mine (drop_ok_code is_pick)',
  },
  {
    id: 'dig', classes: (c) => c === 'patch' || c === 'patch_dark', verbs: ['dig'], use: 'verb',
    accepts: (s) => s === 'shovel', tip: 'Dig this {$item_name}', src: 'patch.js verbs.dig',
  },
  {
    id: 'tend', classes: (c) => c === 'patch' || c === 'patch_dark', verbs: ['tend'], use: 'verb',
    accepts: (s) => s === 'hoe' || s === 'high_class_hoe', tip: 'Tend this {$item_name}', src: 'patch.js verbs.tend',
  },
  {
    id: 'peat', classes: (c) => /^peat_/.test(c), verbs: ['harvest'], use: 'verb',
    accepts: (s) => s === 'shovel', tip: 'Harvest this {$item_name}', src: 'peat_*.js verbs.harvest',
  },
  {
    id: 'brush', classes: (c) => c === 'npc_fox', verbs: ['brush'], use: 'verb',
    accepts: (s) => s === 'fox_brush', tip: 'Brush the Fox with a Brush', src: 'npc_fox.js verbs.brush',
  },
  {
    id: 'add_note', classes: (c) => c === 'bag_notice_board', verbs: ['add_note'], use: 'verb',
    accepts: (s) => s === 'note', tip: 'Add the note to the notice board.', src: 'bag_notice_board.js verbs.add_note',
  },
  {
    // npc_shrine_*.js donate_to drop_ok_code: no bags, emblems or machines (a primed shrine takes its own emblem).
    id: 'donate', classes: (c) => /^npc_shrine_/.test(c), verbs: ['donate_to'], use: 'donate',
    accepts: (s, ctx) => !ctx?.isBag?.(s) && !ctx?.hasTag?.(s, 'emblem') && !ctx?.hasTag?.(s, 'machine') && !/^emblem_/.test(s),
    tip: 'Donate {$stack_name} to {$item_name}', src: 'npc_shrine_*.js verbs.donate_to',
  },
]);

/** PURE: the rules a target class has, in table order. */
export function dropRulesFor(classId) {
  const c = String(classId || '');
  return WORLD_DROP_RULES.filter((r) => r.classes(c));
}

/**
 * PURE: what a dragged stack does on a target: the rule and the target's own verb for it, or null
 * when the target is no drop target for that stack. `verbs` is the target's verb menu
 * (engine.targetVerbs); a rule whose verb the target does not offer is skipped. The verb may be
 * disabled: the caller shows its reason and refuses the drop.
 */
export function dropFor(classId, stackClass, verbs, ctx = {}) {
  const s = String(stackClass || '');
  if (!s) return null;
  for (const rule of dropRulesFor(classId)) {
    if (!rule.accepts(s, ctx)) continue;
    const list = Array.isArray(verbs) ? verbs : [];
    const verb = rule.verbs.map((id) => list.find((v) => v?.id === id)).find(Boolean);
    if (verb) return { rule, verb };
  }
  return null;
}

/** PURE: a drop_tip with the client's tokens filled in (count, the stack's name, the thing's name). */
export function dropTip(tip, { count = 1, stackName = '', stackPlural = '', itemName = '' } = {}) {
  const n = Math.max(1, Math.floor(Number(count) || 1));
  const stack = n > 1 && stackPlural ? stackPlural : stackName;
  return String(tip || '')
    .replace(/\{\$count\}/g, String(n))
    .replace(/\{\$stack_name\}/g, stack)
    .replace(/\{\$item_name\}/g, itemName)
    .replace(/\s+/g, ' ')
    .trim();
}
