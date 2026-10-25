/**
 * Inventory + item catalog helpers for original Glitch class_tsids.
 * Icons: OGA x1 iconic frames under assets/sprites/icons/<class_tsid>.png
 */

/** @typedef {Record<string, number>} Inventory */

/** Canonical icon path for a class_tsid (OGA iconic extract). */
import { loseEnergy, loseMood, metabolicGain, moodMax } from './metabolics.js';
export function itemIcon(classTsid) {
  if (!classTsid) return 'assets/sprites/icons/apple.png';
  return `assets/sprites/icons/${classTsid}.png`;
}

/**
 * @param {string} classTsid
 * @param {string} label
 * @param {string} desc
 * @param {{ isTool?: boolean, baseCost?: number, stackMax?: number, sellable?: boolean, donatable?: boolean }} [extra]
 */
function item(classTsid, label, desc, extra = {}) {
  return {
    classTsid,
    label,
    desc,
    icon: itemIcon(classTsid),
    ...extra,
  };
}

export const ITEM_CATALOG = {
  apple: item('apple', 'Apple', 'A simple apple. Red, crisp, pickable.'),
  milk_butterfly: item(
    'milk_butterfly',
    'Butterfly Milk',
    'Nectar from a properly massaged butterfly.'
  ),
  butterfly_lotion: item(
    'butterfly_lotion',
    'Butterfly Lotion',
    'A five-use tube required for a polite butterfly massage until Animal Kinship 5.'
  ),
  grain: item('grain', 'Grain', 'Squeezed from a willing chicken.'),
  plank: item('plank', 'Plank', 'Harvested wood. Flat. Useful.'),
  hatchet: item(
    'hatchet',
    'Hatchet',
    'A slightly dull hatchet for gently extracting planks from Wood Trees.',
    { isTool: true }
  ),
  cherry: item('cherry', 'Cherry', 'Fruit tree harvest.'),
  egg_plain: item('egg_plain', 'Egg', 'Harvested from an Egg Plant.'),
  bean_plain: item('bean_plain', 'Bean', 'Harvested from a Bean Tree.'),
  plain_bubble: item('plain_bubble', 'Bubble', 'Harvested from a Bubble Tree.'),
  all_spice: item('all_spice', 'Allspice', 'Harvested from a Spice Plant.'),
  general_vapour: item('general_vapour', 'Vapour', 'Harvested from a Gas Plant.'),
  meat: item('meat', 'Meat', 'From a nibble. Questionable ethics.'),
  flour: item('flour', 'Flour', 'Ground grain. (GSJS recipe 138)'),
  pinch_of_salt: item('pinch_of_salt', 'Pinch of Salt', 'A little salt for buns.'),
  bun: item('bun', 'Bun', 'Soft bread. (GSJS recipe 139)'),
  sammich: item('sammich', 'Sammich', 'Bun + meat. (GSJS recipe 12)'),
  waffles: item('waffles', 'Waffle', 'Fluffy waffles with extra-deep waffle-holes.', {
    baseCost: 185,
    stackMax: 20,
  }),
};

const ITEM_USE_CATALOG = {
  apple: { verb: 'Eat', energy: 10, mood: 5, message: 'You eat an apple. Crunch.' },
  cherry: { verb: 'Eat', mood: 8, message: 'Cherry! Tart and cheerful.' },
  grain: { verb: 'Eat', energy: 5, message: 'You snack on grain. Rustic.' },
  milk_butterfly: {
    verb: 'Drink',
    energy: 8,
    mood: 12,
    message: 'Butterfly milk. Surprisingly refreshing.',
  },
  sammich: { verb: 'Eat', energy: 25, mood: 10, message: 'You eat a Sammich. Hearty!' },
  bun: { verb: 'Eat', energy: 12, mood: 4, message: 'You nibble a Bun. Soft.' },
  flour: { verb: 'Taste', energy: 3, message: 'You taste a pinch of Flour. Dusty.' },
  orange_juice: { verb: 'Drink', energy: 15, mood: 8, message: 'You drink the Orange Juice. Zing!' },
  lemon_juice: { verb: 'Drink', energy: 15, mood: 8, message: 'You drink the Lemon Juice. Zing!' },
  fruity_juice: { verb: 'Drink', energy: 15, mood: 8, message: 'You drink the Fruity Juice. Zing!' },
  bubble_tea: { verb: 'Drink', energy: 18, mood: 12, message: 'Bubble tea. Chewy and cheerful.' },
  fried_egg: { verb: 'Eat', energy: 14, mood: 6, message: 'You eat Fried Eggs.' },
  green_eggs: { verb: 'Eat', energy: 14, mood: 6, message: 'You eat Green Eggs.' },
  waffles: {
    verb: 'Eat',
    energy: 185,
    message: 'You eat a Waffle. Fluffy, with extra-deep waffle-holes.',
  },
};

/**
 * Pack-facing effect preview for an item. This is also the single source used
 * by useItem, so the interaction card cannot drift from actual rewards.
 * @param {string} classTsid
 */
export function getItemUseInfo(classTsid) {
  const meta = ITEM_CATALOG[classTsid];
  if (meta?.isTool) {
    return {
      usable: false,
      verb: 'Use',
      effects: {},
      reason: `${meta.label} is a tool.`,
    };
  }
  const def = ITEM_USE_CATALOG[classTsid];
  if (!def) {
    return {
      usable: false,
      verb: 'Use',
      effects: {},
      reason: 'This item is kept for recipes, quests, or trading.',
    };
  }
  const effects = {};
  if (def.energy) effects.energy = def.energy;
  if (def.mood) effects.mood = def.mood;
  if (def.xp) effects.xp = def.xp;
  return {
    usable: true,
    verb: def.verb,
    kind: def.kind || (def.verb === 'Drink' ? 'drink' : 'food'),
    effects,
    message: def.message,
    ...(def.source ? { source: def.source } : {}),
  };
}

/**
 * Item uses whose numbers predate the GSJS import and are pinned by the pack
 * preview tests (ui-systems/world). Source: apple.js base_cost 5 → 5 energy.
 */
const PINNED_ITEM_USES = new Set(['apple']);

/**
 * Register (or refresh) an eat/drink use from GSJS metabolics.
 * Food: energy = round(base_cost × energy_factor) (include/food.js).
 * Drink: drink_mood / drink_energy / drink_xp (include/drink.js).
 * @param {string} classTsid
 * @param {{ kind?: 'food'|'drink', verb?: string, energy?: number, mood?: number, xp?: number, message?: string, source?: string }} def
 * @param {{ label?: string }} [opts]
 * @returns {boolean} whether the catalog entry was written
 */
export function registerItemUse(classTsid, def, opts = {}) {
  if (!classTsid || !def) return false;
  if (PINNED_ITEM_USES.has(classTsid) && ITEM_USE_CATALOG[classTsid]) return false;
  const kind = def.kind === 'drink' ? 'drink' : 'food';
  const verb = def.verb || (kind === 'drink' ? 'Drink' : 'Eat');
  const label = opts.label || ITEM_CATALOG[classTsid]?.label || classTsid.replace(/_/g, ' ');
  const existing = ITEM_USE_CATALOG[classTsid];
  const next = {
    verb,
    kind,
    message:
      def.message ||
      existing?.message ||
      (kind === 'drink' ? `You drink the ${label}.` : `You eat the ${label}.`),
  };
  for (const key of ['energy', 'mood', 'xp']) {
    const n = Math.round(Number(def[key]) || 0);
    if (n) next[key] = n;
  }
  if (def.source) next.source = def.source;
  if (!next.energy && !next.mood && !next.xp) return false;
  ITEM_USE_CATALOG[classTsid] = next;
  return true;
}

/** Read-only view of a registered use (tests / tooling). */
export function getItemUseDef(classTsid) {
  const def = ITEM_USE_CATALOG[classTsid];
  return def ? { ...def } : null;
}

/**
 * Register (or refresh icon/label for) a catalog entry.
 * @param {string} classTsid
 * @param {{ label?: string, desc?: string, icon?: string, isTool?: boolean, baseCost?: number, stackMax?: number, sellable?: boolean, donatable?: boolean, tags?: string[], namePlural?: string }} [meta]
 */
export function ensureItem(classTsid, meta = {}) {
  if (!classTsid) return;
  const existing = ITEM_CATALOG[classTsid];
  const label =
    meta.label ||
    existing?.label ||
    classTsid.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  const desc = meta.desc || existing?.desc || `Item ${classTsid}.`;
  ITEM_CATALOG[classTsid] = {
    classTsid,
    label,
    desc,
    icon: meta.icon || existing?.icon || itemIcon(classTsid),
    isTool: meta.isTool ?? existing?.isTool ?? false,
    baseCost: Number.isFinite(meta.baseCost) ? meta.baseCost : existing?.baseCost,
    stackMax: Number.isFinite(meta.stackMax) ? Math.max(1, Math.floor(meta.stackMax)) : existing?.stackMax,
    sellable: meta.sellable ?? existing?.sellable ?? true,
    donatable: meta.donatable ?? existing?.donatable ?? true,
  };
  const tags = Array.isArray(meta.tags) ? meta.tags : existing?.tags;
  if (Array.isArray(tags)) ITEM_CATALOG[classTsid].tags = [...tags];
  const namePlural = meta.namePlural || existing?.namePlural;
  if (namePlural) ITEM_CATALOG[classTsid].namePlural = namePlural;
}

/**
 * Whether a class_tsid is a tool (bottom pack row in original Glitch).
 * @param {string} classTsid
 */
export function isToolItem(classTsid) {
  if (!classTsid) return false;
  const meta = ITEM_CATALOG[classTsid];
  if (meta?.isTool) return true;
  // Common GSJS tool class_tsids even before ensureMakingItems (whole ids: a
  // prefix match made Pickles a tool).
  return /^(knife_and_board|frying_pan|blender|gassifier|bubble_tuner|spice_mill|watering_can|irrigator_9000|hoe|high_class_hoe|hatchet|shovel|pick|trowel|shears)$/.test(
    classTsid
  );
}

/**
 * One pack slot for UI.
 * @typedef {{ classTsid: string, label: string, count: number, icon: string, desc: string, isTool: boolean, baseCost?: number, stackMax?: number, sellable: boolean, donatable: boolean }} PackSlot
 */

/**
 * Pack slots for UI: items with count > 0, stable order.
 * Tools and goods are both included (use listPackItemSlots / listPackToolSlots for dual-row pack).
 * @param {Inventory} inv
 * @returns {PackSlot[]}
 */
export function listPackSlots(inv) {
  const order = Object.keys(ITEM_CATALOG);
  const slots = [];
  const seen = new Set();
  for (const id of order) {
    const n = inv[id] || 0;
    if (n <= 0) continue;
    seen.add(id);
    const meta = ITEM_CATALOG[id];
    slots.push({
      classTsid: id,
      label: meta.label,
      count: n,
      icon: meta.icon || itemIcon(id),
      desc: meta.desc || '',
      isTool: isToolItem(id),
      baseCost: meta.baseCost,
      stackMax: meta.stackMax,
      sellable: meta.sellable !== false,
      donatable: meta.donatable !== false,
    });
  }
  // unknown extras still in pack
  for (const id of Object.keys(inv)) {
    if (seen.has(id)) continue;
    if ((inv[id] || 0) > 0) {
      ensureItem(id);
      const meta = ITEM_CATALOG[id];
      slots.push({
        classTsid: id,
        label: meta.label,
        count: inv[id],
        icon: meta.icon || itemIcon(id),
        desc: meta.desc || '',
        isTool: isToolItem(id),
        baseCost: meta.baseCost,
        stackMax: meta.stackMax,
        sellable: meta.sellable !== false,
        donatable: meta.donatable !== false,
      });
    }
  }
  return slots;
}

/**
 * Top pack row: stackable goods (not tools). Matches original dual-row pack.
 * @param {Inventory} inv
 * @returns {PackSlot[]}
 */
export function listPackItemSlots(inv) {
  return listPackSlots(inv).filter((s) => !s.isTool);
}

/**
 * Bottom pack row: tools only.
 * @param {Inventory} inv
 * @returns {PackSlot[]}
 */
export function listPackToolSlots(inv) {
  return listPackSlots(inv).filter((s) => s.isTool);
}

/**
 * Dual-row pack model for HUD: items row + tools row (+ total counts for capacity UI).
 * @param {Inventory} inv
 * @returns {{ items: PackSlot[], tools: PackSlot[], itemCount: number, toolCount: number, totalStacks: number }}
 */
export function listPackRows(inv) {
  const items = listPackItemSlots(inv);
  const tools = listPackToolSlots(inv);
  return {
    items,
    tools,
    itemCount: items.length,
    toolCount: tools.length,
    totalStacks: items.length + tools.length,
  };
}

/**
 * @param {Partial<Inventory>} [seed]
 * @returns {Inventory}
 */
export function createInventory(seed = {}) {
  const inv = {
    apple: 0,
    milk_butterfly: 0,
    butterfly_lotion: 3,
    grain: 0,
    plank: 0,
    hatchet: 0,
    cherry: 0,
    meat: 0,
    flour: 0,
    pinch_of_salt: 3,
    bun: 0,
    sammich: 0,
  };
  return { ...inv, ...seed };
}

/**
 * @param {Inventory} inv
 * @param {string} classTsid
 * @param {number} [n=1]
 */
export function addItem(inv, classTsid, n = 1) {
  if (!ITEM_CATALOG[classTsid]) ensureItem(classTsid);
  if (inv[classTsid] === undefined) inv[classTsid] = 0;
  inv[classTsid] = (inv[classTsid] || 0) + n;
  return inv[classTsid];
}

/**
 * @param {Inventory} inv
 * @param {string} classTsid
 * @param {number} [n=1]
 */
export function removeItem(inv, classTsid, n = 1) {
  const have = inv[classTsid] || 0;
  if (have < n) return false;
  inv[classTsid] = have - n;
  return true;
}

/**
 * @param {Inventory} inv
 * @param {string} classTsid
 */
export function countItem(inv, classTsid) {
  return inv[classTsid] || 0;
}

/**
 * Use an inventory item (pack verb).
 * @param {Inventory} inv
 * @param {{ energy: number, mood: number }} pc
 * @param {string} classTsid
 */
export function useItem(inv, pc, classTsid) {
  if (countItem(inv, classTsid) < 1) {
    return { ok: false, msgs: [`No ${classTsid} in pack.`] };
  }
  const info = getItemUseInfo(classTsid);
  if (!info.usable) return { ok: false, msgs: [info.reason] };
  // include/drink.js drink_drink: a mood drink is refused at full mood.
  if (info.kind === 'drink' && (info.effects.mood || 0) > 0 && (pc.mood || 0) >= 100) {
    const label = ITEM_CATALOG[classTsid]?.label || classTsid;
    return {
      ok: false,
      reason: 'mood_full',
      msgs: [`You tried to drink ${label}, but you're already in a perfectly good mood, so then you didn't do it.`],
    };
  }
  if (!removeItem(inv, classTsid, 1)) {
    return { ok: false, msgs: [`No ${classTsid} in pack.`] };
  }
  const effects = {};
  // G259: drink_drink and food_eat add through metabolics_add_energy / _mood
  // (items/include/drink.js 66, 88; food.js 123), which give nothing while
  // dead or (energy) Super Pooped and say so (inc_metabolics.js 40-53, 79-86).
  // The drink is still drunk either way.
  // G300: a fall is metabolics_lose_energy / _mood (drink.js 75-76, 97-98), nothing while dead.
  const addEnergy = () => {
    if (!info.effects.energy || (info.effects.energy > 0 && !metabolicGain('energy').ok)) return;
    const before = pc.energy || 0;
    if (info.effects.energy < 0) loseEnergy(pc, -info.effects.energy);
    else pc.energy = Math.min(Math.max(100, Number(pc.energyMax) || 100), before + info.effects.energy);
    if ((pc.energy || 0) !== before) effects.energy = (pc.energy || 0) - before;
  };
  const addMood = () => {
    if (!info.effects.mood || (info.effects.mood > 0 && !metabolicGain('mood').ok)) return;
    const before = pc.mood || 0;
    if (info.effects.mood < 0) loseMood(pc, -info.effects.mood);
    else pc.mood = Math.min(moodMax(pc), before + info.effects.mood);
    if ((pc.mood || 0) !== before) effects.mood = (pc.mood || 0) - before;
  };
  // G268: drink_drink adds mood first, then energy (drink.js 66, then 88), so
  // a dead drinker hears the mood line before the energy line; food_eat
  // (food.js 123) leads with energy.
  if (info.kind === 'drink') {
    addMood();
    addEnergy();
  } else {
    addEnergy();
    addMood();
  }
  if (info.effects.xp > 0) {
    pc.imagination = (pc.imagination || 0) + info.effects.xp;
    pc.xp = (pc.xp || 0) + info.effects.xp;
    effects.xp = info.effects.xp;
  }
  return { ok: true, msgs: [info.message], effects };
}
