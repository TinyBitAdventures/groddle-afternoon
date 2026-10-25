/**
 * Wine of the Dead's pack verb "pour" (register row G165): cancel a project
 * on a proto or unreap a cultivated item on your home street (pure: no Pixi,
 * no DOM). features/homes-feature.js offers it and carries it out.
 *
 * Source (tinyspeck/glitch-GameServerJS, CC0):
 * - items/wine_of_the_dead.js:151-203  verbs.pour (in_pack, sort_on 54,
 *   "Remove an item from the location"): needs location.cultivation_can_cultivate
 *   and a valid target, else "There is nothing here to apply this to."; the
 *   handler asks "Please Confirm!" (Yes / Nevermind).
 * - :205-210 getValidTargets: findCloseStack within 200 px of a cultivated item
 *   (proto_class set) or a proto with a job in progress, never the finished
 *   Tower (furniture_tower_chassis).
 * - :212-271 modal_callback: a proto's job is reset ("You poured Wine of the
 *   Dead on a <name> and canceled the project."); anything else wears out
 *   (makeDepleted) 3 s later, flagged wotd. Either way wotd:poured_on_something
 *   and one bottle is used.
 * - locations/inc_cultivation.js:163 cultivation_can_cultivate: your own home.
 * - items/patch.js:44-74, trant_*.js remove (drop target "Pour {$stack_name} on
 *   {$item_name}") and proto remove (proto_*.js:49-65) all hand the bottle to
 *   this pour handler with the item as its target. A tree, seedling or dead
 *   tree grown on a cultivated Patch keeps the Patch's proto_class
 *   (patch.js:751, trants.js:749-775), so pouring on it unreaps the Patch.
 */

export const WOTD = 'wine_of_the_dead';

/** getValidTargets: findCloseStack(is_cultivated_item, 200). */
export const WOTD_REACH = 200;

/** items/wine_of_the_dead.js modal_callback: apiSetTimerX('makeDepleted', 3000). */
export const WOTD_DEPLETE_MS = 3000;

export const WOTD_TEXT = Object.freeze({
  pourLabel: 'pour',
  pourTip: 'Remove an item from the location',
  nothingHere: 'There is nothing here to apply this to.',
  confirmTitle: 'Please Confirm!',
  yes: 'Yes',
  nevermind: 'Nevermind',
  removeConfirm: (name) => `Are you really sure you want to remove this ${name}?`,
  projectConfirm: (name) => `Are you really sure you want to cancel the project on this ${name}? All contributions made so far will be lost.`,
  canceled: (name) => `You poured Wine of the Dead on a ${name} and canceled the project.`,
  /** proto_*.js:53: a proto's remove while its project runs. */
  pourFirst: 'Pour some Wine of the Dead to cancel the project first.',
});

/**
 * getValidTargets over the remake's home street rows:
 * rows [{ id, kind: 'cultivated' | 'proto', name, x, y? }] (the caller leaves out
 * finished Towers and protos with no project running). The nearest within 200 px.
 */
export function nearestPourTarget(rows, from, reach = WOTD_REACH) {
  const fx = Number(from?.x);
  const fy = Number(from?.y);
  if (!Number.isFinite(fx)) return null;
  let best = null;
  let bestD = reach + 1;
  for (const row of rows || []) {
    const x = Number(row?.x);
    if (!Number.isFinite(x)) continue;
    const y = Number.isFinite(Number(row.y)) && Number.isFinite(fy) ? Number(row.y) : fy;
    const d = Math.hypot(x - fx, Number.isFinite(fy) ? y - fy : 0);
    if (d < bestD) {
      best = row;
      bestD = d;
    }
  }
  return bestD <= reach ? best : null;
}

/** verbs.pour conditions: { state, reason }. */
export function pourConditions({ canCultivate = false, target = null } = {}) {
  if (!canCultivate || !target) return { state: 'disabled', reason: WOTD_TEXT.nothingHere };
  return { state: 'enabled' };
}

/** verbs.pour handler: the confirm prompt's text for a target. */
export function pourConfirmText(target) {
  if (!target) return '';
  return target.kind === 'proto' ? WOTD_TEXT.projectConfirm(target.name) : WOTD_TEXT.removeConfirm(target.name);
}

/** The pack popover button. */
export function pourButton(conditions) {
  const on = conditions?.state === 'enabled';
  return { id: 'pour', label: WOTD_TEXT.pourLabel, tooltip: WOTD_TEXT.pourTip, enabled: on, reason: on ? '' : conditions?.reason || WOTD_TEXT.nothingHere };
}
