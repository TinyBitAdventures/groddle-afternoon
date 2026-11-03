/**
 * F: "Eat what?" (ticket 62, Austin 2026-11-03). The original client had no
 * eat key (KeyBeacon.as 31-32 and TSMainView.as startListeningtoKeys 639-661
 * list none); F was the remake's own and ate an apple. Now F opens the pack's
 * food as pictures, the verb menu's picture level (the Feed what? tiles,
 * js/ui/verb-menu.js makePickTile), with the best food for your energy
 * already chosen: Enter eats one, the arrows choose another, Esc cancels.
 *
 * The food: every pack stack whose use is an ordinary eat (js/inventory.js
 * getItemUseInfo: kind 'food', verb Eat), never a drink, a buff herb (its own
 * verb: Munch, Imbibe), a tool, a quest item (tag 'quest-item') or a stack
 * tagged 'no_eat'.
 *
 * The best one: what food_eat would put in (include/food.js 104-123: energy =
 * round(base_cost x energy_factor) for each, added up to the top).
 * 1. A food that fits in the energy you have room for without spilling over,
 *    the most energy first (it fills you up furthest and wastes nothing).
 * 2. When every food spills over, the one that spills least (the smallest).
 * 3. Food with no energy (mood only, a cherry) comes after food with energy.
 * Ties go to the cheaper food (ITEM_CATALOG baseCost, the vendors' value), so
 * the precious stack is the one kept, then the bigger stack, then the name.
 * At full energy nothing that gives energy can be eaten (food.js conditions:
 * "You already have full energy."), so only mood food is offered then.
 */

export const EAT_PICK_TEXT = Object.freeze({
  title: 'Eat what?',
  nothing: 'You have nothing to eat.',
  hint: 'Enter eats one · arrow keys choose · Esc cancels',
});

/** Tags that keep a stack off the menu. */
const NOT_FOOD_TAGS = Object.freeze(['quest-item', 'no_eat']);

function whole(n, fallback = 0) {
  const v = Math.floor(Number(n));
  return Number.isFinite(v) ? v : fallback;
}

/**
 * PURE: whether a stack is food F may offer.
 * @param {{ usable?: boolean, kind?: string, verb?: string, effects?: object }} info getItemUseInfo
 * @param {{ tags?: string[], isTool?: boolean }|undefined} meta ITEM_CATALOG entry
 * @param {boolean} buff the stack is a buff item (js/buffs.js getBuffItemInfo)
 */
export function isEatable(info, meta, buff = false) {
  if (buff || !info?.usable || meta?.isTool) return false;
  if (info.kind !== 'food' || String(info.verb || 'Eat') !== 'Eat') return false;
  const tags = Array.isArray(meta?.tags) ? meta.tags : [];
  if (NOT_FOOD_TAGS.some((t) => tags.includes(t))) return false;
  const fx = info.effects || {};
  return Number(fx.energy) > 0 || Number(fx.mood) > 0 || Number(fx.xp) > 0;
}

/**
 * PURE: the food F offers, in pack order, each with what one would put in.
 * @param {Array<{ classTsid: string, label?: string, count?: number }>} slots listPackItemSlots(inv)
 * @param {{ info: (cls: string) => object, meta: (cls: string) => object|undefined, buff: (cls: string) => boolean,
 *   energy: number, energyMax: number }} o
 * @returns {Array<{ classTsid: string, label: string, have: number, energy: number, mood: number, gain: number, spill: number, value: number }>}
 */
export function eatChoices(slots, { info, meta, buff = () => false, energy = 0, energyMax = 100 } = {}) {
  const room = Math.max(0, whole(energyMax, 100) - Math.max(0, Number(energy) || 0));
  const out = [];
  for (const slot of slots || []) {
    const cls = slot?.classTsid;
    const have = Math.max(0, whole(slot?.count));
    if (!cls || have < 1) continue;
    const use = info?.(cls);
    const m = meta?.(cls);
    if (!isEatable(use, m, Boolean(buff?.(cls)))) continue;
    const per = Math.max(0, Math.round(Number(use.effects?.energy) || 0));
    // Full energy: food_eat is refused for food that gives energy; mood food still goes in.
    if (per > 0 && room <= 0) continue;
    out.push({
      classTsid: cls,
      label: String(slot.label || m?.label || cls),
      have,
      energy: per,
      mood: Math.max(0, Math.round(Number(use.effects?.mood) || 0)),
      gain: Math.min(per, room),
      spill: Math.max(0, per - room),
      value: Math.max(0, Number(m?.baseCost) || 0),
    });
  }
  return out;
}

/** PURE: a before b when a is the better food (see the header). */
export function compareFood(a, b) {
  const aE = a.energy > 0 ? 0 : 1;
  const bE = b.energy > 0 ? 0 : 1;
  if (aE !== bE) return aE - bE;
  if (a.energy > 0) {
    const aFits = a.spill === 0 ? 0 : 1;
    const bFits = b.spill === 0 ? 0 : 1;
    if (aFits !== bFits) return aFits - bFits;
    // Fits: the most energy. Spills: the least spilled.
    if (aFits === 0 && a.gain !== b.gain) return b.gain - a.gain;
    if (aFits === 1 && a.spill !== b.spill) return a.spill - b.spill;
  } else if (a.mood !== b.mood) {
    return b.mood - a.mood;
  }
  if (a.value !== b.value) return a.value - b.value;
  if (a.have !== b.have) return b.have - a.have;
  return a.label.localeCompare(b.label);
}

/** PURE: the index of the best food in `choices`, or -1 when there is none. */
export function bestFoodIndex(choices) {
  let best = -1;
  (choices || []).forEach((c, i) => {
    if (best < 0 || compareFood(c, choices[best]) < 0) best = i;
  });
  return best;
}

/** PURE: the footer line for a tile ("Sammich: +25 energy, +10 mood (you have 3)"). */
export function eatTip(c, { best = false } = {}) {
  const bits = [];
  if (c.energy > 0) bits.push(`+${c.gain} energy`);
  if (c.mood > 0) bits.push(`+${c.mood} mood`);
  const what = bits.length ? `: ${bits.join(', ')}` : '';
  return `${best ? 'Best for now: ' : ''}${c.label}${what} (you have ${c.have})`;
}
