/**
 * Which tool a node's verb uses when the player named one: a stack dragged onto the node, or a
 * tool's own pack verb (a Pick's Use, a Shovel's dig). In the original the verb's message said so:
 * a drop carries msg.target_itemstack_tsid (that very stack is the tool: rock_beryl_1.js 241-242
 * with items/include/mining.js 191-193, peat_1.js 336-338, dirt_pile.js 208-209,
 * mortar_barnacle.js 315-316, ice_knob.js 339-340), and a plain Pick's Use sets msg.force_pick
 * (pick.js 311; the rock then takes the first working plain Pick, rock_metal_1.js 229-232).
 * With no choice the verb takes its usual tool (the first working one).
 *
 * The choice is for one target and one verb run: whoever starts that verb on that target next
 * (a drop walks over first, so a few seconds may pass) takes it; it is dropped after CHOICE_MS.
 * Pure state, no DOM.
 */

/** How long a choice waits for its verb (a walk over plus the verb's start). */
export const CHOICE_MS = 30_000;

let pending = null; // { target, cls, copy, force, at }

/**
 * Name the tool for the next verb on `target`.
 * @param {object} target  the world thing (an interactable)
 * @param {string} cls     the tool's class
 * @param {{ copy?: number|null, force?: boolean, now?: number }} [opts]
 *   copy: the unit's place among that class's units in pack order (tools.js copies);
 *   force: a plain Pick's Use (pick.js msg.force_pick).
 */
export function chooseTool(target, cls, { copy = null, force = false, now = Date.now() } = {}) {
  if (!target || !cls) {
    pending = null;
    return null;
  }
  const n = Number(copy);
  pending = { target, cls: String(cls), copy: Number.isInteger(n) && n >= 0 ? n : null, force: force === true, at: now };
  return pending;
}

/** The choice for `target` if one waits (without taking it). */
export function peekToolChoice(target, now = Date.now()) {
  if (!pending || pending.target !== target) return null;
  if (now - pending.at > CHOICE_MS) {
    pending = null;
    return null;
  }
  return pending;
}

/** Take the choice for `target` (it is used once). */
export function takeToolChoice(target, now = Date.now()) {
  const c = peekToolChoice(target, now);
  if (c) pending = null;
  return c;
}

export function clearToolChoice() {
  pending = null;
}
