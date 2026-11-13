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
 *   'verb'   run the target's verb (a tool the verb finds in the pack itself: a Watering Can);
 *            with `tool: true` the dragged stack is the tool the verb uses and wears (a Pick, a
 *            Shovel, a Scraper: GSJS msg.target_itemstack_tsid; js/tool-choice.js);
 *   'pick'   the target-item picker with the dragged stack chosen (Feed: its how many step follows);
 *   'donate' the shrine's donation window with the dragged stack chosen.
 * Garden plots and Guano stay with features/garden-guano-feature.js (G403).
 */

const TREE = (c) => (/^trant_/.test(c) && !/_dead$/.test(c)) || c === 'wood_tree';
const ANIMAL = (c) => ['npc_piggy', 'npc_chicken', 'npc_butterfly', 'npc_batterfly'].includes(c);
const PICKS = new Set(['pick', 'fancy_pick']);
const SHOVELS = new Set(['shovel', 'ace_of_spades']);
const SCRAPERS = new Set(['scraper', 'super_scraper']);

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
    // rock_metal_1.js drop_ok_code 183-185: a Metal Rock takes only a working Fancy Pick.
    id: 'mine_metal', classes: (c) => c === 'rock_metal_1', verbs: ['mine'], use: 'verb', tool: true,
    accepts: (s, ctx) => s === 'fancy_pick' && ctx?.working?.(s) !== false,
    tip: 'Mine this {$item_name}', src: 'rock_metal_1.js verbs.mine (drop_ok_code fancy_pick)',
  },
  {
    // The other rocks take any working pick; the dragged stack is the pick that swings and wears
    // (msg.target_itemstack_tsid: rock_beryl_1.js 241-242, include/mining.js 191-193).
    id: 'mine', classes: (c) => /^rock_/.test(c) && c !== 'rock_metal_1', verbs: ['mine'], use: 'verb', tool: true,
    accepts: (s, ctx) => PICKS.has(s) && ctx?.working?.(s) !== false,
    tip: 'Mine this {$item_name}', src: 'rock_*.js verbs.mine (drop_ok_code is_pick)',
  },
  {
    // dirt_pile.js verbs.dig 85-100: a working Shovel or Ace of Spades, which then digs (doDigging 208-209).
    id: 'dig_dirt', classes: (c) => c === 'dirt_pile', verbs: ['dig'], use: 'verb', tool: true,
    accepts: (s, ctx) => SHOVELS.has(s) && ctx?.working?.(s) !== false,
    tip: 'Dig this {$item_name}', src: 'dirt_pile.js verbs.dig (drop_ok_code shovel, ace_of_spades)',
  },
  {
    // mortar_barnacle.js verbs.scrape 54-60; the dragged scraper scrapes (startScraping 315-316).
    id: 'scrape', classes: (c) => c === 'mortar_barnacle', verbs: ['scrape'], use: 'verb', tool: true,
    accepts: (s, ctx) => SCRAPERS.has(s) && ctx?.working?.(s) !== false,
    tip: 'Scrape this {$item_name}', src: 'mortar_barnacle.js verbs.scrape (drop_ok_code scraper)',
  },
  {
    // ice_knob.js verbs.scrape 53-58 (its drop_tip is empty: the client shows no words).
    id: 'scrape_ice', classes: (c) => c === 'ice_knob', verbs: ['scrape'], use: 'verb', tool: true,
    accepts: (s, ctx) => SCRAPERS.has(s) && ctx?.working?.(s) !== false,
    tip: '', src: 'ice_knob.js verbs.scrape (drop_ok_code scraper)',
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
    // peat_1.js 136-139: a working Shovel only; it is the one that cuts (startHarvesting 336-338).
    id: 'peat', classes: (c) => /^peat_/.test(c), verbs: ['harvest'], use: 'verb', tool: true,
    accepts: (s, ctx) => s === 'shovel' && ctx?.working?.(s) !== false, tip: 'Harvest this {$item_name}', src: 'peat_*.js verbs.harvest',
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
    // still.js verbs.distill 189-201 (is_drop_target, drop_tip, drop_ok_code: a distillable the hopper
    // has room for) on a Still lying on the ground (#285). The target is the dropped stack, whose
    // class the drag tests as `ground:<class>` (features/world-drop-feature.js).
    id: 'distill', classes: (c) => c === 'ground:still', verbs: ['distill'], use: 'pick',
    accepts: (s, ctx) => Boolean(ctx?.distillable?.(s)), tip: 'Distill {$stack_name} into Hooch.', src: 'still.js verbs.distill (drop_ok_code distillables, room)',
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
