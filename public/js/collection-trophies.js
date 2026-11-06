/**
 * Collections counted from what the pack holds. The original checks a collection badge whenever an
 * item arrives: players/inc_items.js items_added 593-597 asks achievements_check_in_inventory
 * (inc_achievements.js 520-544), which wants countItemClass(label) >= value for every condition, so
 * a collection is whatever you hold at once, however it arrived. Nothing else counts them here:
 * the rest of the game only emits in_inventory for the items of its own systems.
 */

/** Badges counted by holding: each condition's counter follows the pack up and down. */
export const HELD_AT_ONCE = Object.freeze(['collection_gems']);

/** The classes a badge's in_inventory conditions name. */
export function collectionClasses(def) {
  return (def?.conditions || []).filter((c) => c.group === 'in_inventory').map((c) => c.name);
}

/**
 * What changed since the last look. `before` is the set held then, or null at a save's first look:
 * every class held counts as gained and every other one as lost, so a saved counter never outlives
 * the item it counted.
 */
export function heldChanges(before, classes, countOf) {
  const gained = [];
  const lost = [];
  const held = new Set();
  for (const cls of classes) {
    if ((Number(countOf(cls)) || 0) > 0) {
      held.add(cls);
      if (!before?.has(cls)) gained.push(cls);
    } else if (!before || before.has(cls)) lost.push(cls);
  }
  return { gained, lost, held };
}
