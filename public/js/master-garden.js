/**
 * Master Gardener: the five garden potions that tend a whole garden at once.
 *
 * Source (Tiny Speck GameServerJS, CC0):
 *   items/potion_garden_{water,plant,harvest,clear,fertilize}.js
 *     pour (mg_potion_base): needs mastergardener_1; the nearest garden in
 *     350 px with something to do; energy above package cost x plot count;
 *     one use per successful pour (5 uses: instanceProps points_remaining 5,
 *     stackmax 1, so a bottle never refills), then the bottle is used up
 *   items/include/master_garden.js potionTendGarden
 *     water      every plot (the spreadsheet charges for all of them); dry
 *                growing plots restart their grow timer
 *     hoe        every dirty plot -> clean
 *     plant      every clean plot while the chosen seed lasts; a wet plot
 *                starts growing at once
 *     pick       every ripe plot -> dirty; produces_count each (the half
 *                harvest check compares against the non-MG package names,
 *                so Master Gardener never halves), super harvest from the
 *                mg_*_harvest bonus_multiplier/bonus_chance
 *     fertilize  every seeded, unfertilized plot: seeds jump to shoots,
 *                shoots finish in 10% of their remaining time
 *     per-plot drop rolls are switched off; water/plant/hoe then roll the
 *     garden's drop once: 4 plots 18%, 8 plots 36%, 15+ plots 67% (other
 *     sizes never), x1.25 Rubeweed, always under Max Luck, on
 *     {croppery,herbalism}_mastergardener (water: *_master_gardener__water)
 *     doFinishGardenAction: "You watered a garden. (-24 energy, +24 mood,
 *     +24 iMG)"; onFinishPick "You picked 4 Carrots and a Cabbage."
 *   catalog_skill_packages.js mg_croppery_* / mg_herbalism_*
 *
 * Plots are js/garden.js plots: { state, seed, wet, stageStartedAt,
 * growModifier }. Growth uses SEED_CATALOG grow1Ms / grow2Ms.
 */

import { SEED_CATALOG, stageElapsedMs, wetPlot } from './garden.js';
import { gardenGrowModifier } from './imagination-effects.js';
import { skillPackageDetails } from './skill-packages.js';
import { moodMax } from './metabolics.js';
import { grantMoodXp } from './mood-xp.js';

export const MASTER_GARDENER = 'mastergardener_1';
export const POTION_USES = 5;
export const POUR_MS = 2500;
export const POUR_RANGE = 350;

export const GARDEN_POTIONS = Object.freeze({
  potion_garden_water: Object.freeze({
    action: 'water',
    label: 'Soak-All Solution',
    plural: 'Soak-All Solutions',
    tooltip: 'Water all garden plots',
    baseCost: 1700,
    capacity: 11,
    noTarget: 'There are no dry gardens nearby.',
    busy: 'This garden is already being watered!',
    desc: 'A single drop of Soak-All Solution (a tiny bottle filled with matter wetter than wet itself) will water every plot in the nearest garden with only a flick of the wrist.',
  }),
  potion_garden_plant: Object.freeze({
    action: 'plant',
    label: 'Seed-Dibber Libation',
    plural: 'Seed-Dibber Libations',
    tooltip: 'Plant to all garden plots',
    baseCost: 2000,
    capacity: 11,
    noTarget: 'There are no clean garden plots nearby.',
    busy: 'This garden is already being planted!',
    desc: 'Just one dose of this patented Seed-Dibber Libation will plant every available plot of the nearest garden with your chosen seed (if you have enough seeds available). Save your fingernails for pretty things, eh?',
  }),
  potion_garden_harvest: Object.freeze({
    action: 'pick',
    label: 'Manyharvest Cordial',
    plural: 'Manyharvest Cordials',
    tooltip: 'Harvest from all garden plots',
    baseCost: 2200,
    capacity: 11,
    noTarget: 'There is nothing to harvest here.',
    busy: 'This garden is already being harvested!',
    desc: "Like a delicate tornado, one drop of Manyharvest Cordial will gently gather all ripe crops from the nearest garden (while,  like a twister filled with generosity, giving you all the usual 'super-harvest' bonuses).",
  }),
  potion_garden_clear: Object.freeze({
    action: 'hoe',
    label: 'Liquid Super-Hoe',
    plural: 'Liquid Super-Hoe',
    tooltip: 'Clear all garden plots',
    baseCost: 1700,
    capacity: 11,
    noTarget: 'There are no dirty gardens nearby.',
    busy: 'This garden is already being hoed!',
    desc: 'A bag full of hoes might be able to clear your whole garden, a bottle of Liquid Super-Hoe has more clearing power than any common old hoe-bag. One drop will clear all the plots that can be cleared from the nearest garden.',
  }),
  potion_garden_fertilize: Object.freeze({
    action: 'fertilize',
    label: 'Dung-Kicker Drops',
    plural: 'Dung-Kicker Drops',
    tooltip: 'Fertilize all garden plots',
    baseCost: 2200,
    capacity: 5,
    noTarget: 'Only wet garden plots with seeds or seedlings can be fertilized.',
    busy: 'This garden is already being fertilized!',
    desc: 'One squirt of Dung-Kicker Drops spreads fertilizer over all fertilizable plots in a garden (no extra guano necessary), leaving you free to enjoy more pleasant-scented parts of the gardening experience.',
  }),
});

const PACKAGE_ACTION = Object.freeze({ water: 'water', plant: 'plant', pick: 'harvest', hoe: 'clear', fertilize: 'fertilize' });
const asSet = (v) => (v instanceof Set ? v : new Set(Array.isArray(v) ? v : []));

export function mgPackage(gardenType, action) {
  return `mg_${gardenType === 'herb' ? 'herbalism' : 'croppery'}_${PACKAGE_ACTION[action]}`;
}

export function mgDetails(gardenType, action, learned = [], upgrades = []) {
  return skillPackageDetails(mgPackage(gardenType, action), learned, upgrades);
}

const plotsOf = (garden) => Object.entries(garden?.plots || {});

/** Plots a potion would act on (getValidTargets' per-potion test). */
export function plotsFor(garden, action) {
  return plotsOf(garden).filter(([, p]) => {
    if (action === 'water') return (p.state === 'seeds' || p.state === 'shoots') && !p.wet;
    if (action === 'hoe') return p.state === 'dirty';
    if (action === 'plant') return p.state === 'clean';
    if (action === 'pick') return p.state === 'crop' && p.seed;
    if (action === 'fertilize') return p.seed && !p.fertilized && p.wet && p.state !== 'crop';
    return false;
  });
}

/**
 * canPour: { ok, msg }. ctx: { learned, upgrades, energy, seedId, inv }.
 */
export function canPour(potionClass, garden, ctx = {}) {
  const potion = GARDEN_POTIONS[potionClass];
  if (!potion) return { ok: false, msg: "This potion ain't hooked up right!" };
  if (!asSet(ctx.learned).has(MASTER_GARDENER)) return { ok: false, msg: 'You need to know Master Gardener to use this.' };
  if (!garden || !plotsFor(garden, potion.action).length) return { ok: false, msg: potion.noTarget };
  if (potion.action === 'plant') {
    const seed = SEED_CATALOG[ctx.seedId];
    const want = garden.gardenType === 'herb' ? 'herb' : 'default';
    if (!seed || seed.gardenType !== want || !(Number(ctx.inv?.[ctx.seedId]) > 0)) {
      return { ok: false, msg: want === 'herb' ? 'You need herb seeds for this garden.' : 'You need crop seeds for this garden.' };
    }
  }
  const details = mgDetails(garden.gardenType, potion.action, ctx.learned, ctx.upgrades) || {};
  const plots = Object.keys(garden.plots || {}).length;
  if ((ctx.energy || 0) <= (Number(details.energy_cost) || 0) * plots) return { ok: false, msg: "You don't have enough energy to do that!" };
  return { ok: true };
}

/** The garden-wide drop chance after water/plant/hoe (0 when the size has none). */
export function mgDropChance(plotCount, { rubeweed = false, maxLuck = false } = {}) {
  if (maxLuck) return 1;
  let chance = 0;
  if (plotCount === 4) chance = 0.18;
  else if (plotCount === 8) chance = 0.36;
  else if (plotCount >= 15) chance = 0.67;
  if (rubeweed) chance *= 1.25;
  return chance;
}

export function mgDropTable(gardenType, action) {
  const base = gardenType === 'herb' ? 'herbalism' : 'croppery';
  return action === 'water' ? `${base}_master_gardener__water` : `${base}_mastergardener`;
}

function nameFor(seed, n, pluralOf) {
  if (n === 1) return `a ${seed.cropLabel}`;
  return `${n} ${pluralOf?.(seed.cropId) || `${seed.cropLabel}s`}`;
}

/** onFinishPick's "You picked 4 Carrots, 2 Potatoes and a Cabbage." */
export function pickedMessage(results, pluralOf = null) {
  const parts = Object.values(results).map((r) => nameFor(r.seed, r.num, pluralOf));
  if (!parts.length) return 'You picked nothing.';
  const text = parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
  return `You picked ${text}.`;
}

/** doFinishGardenAction growl: "You watered a garden. (-24 energy, +24 mood, +24 iMG)". */
export function growl(msg, { energy = 0, mood = 0, xp = 0 } = {}) {
  const bits = [];
  if (energy) bits.push(`-${energy} energy`);
  if (mood) bits.push(`+${mood} mood`);
  if (xp) bits.push(`+${xp} iMG`);
  return bits.length ? `${msg} (${bits.join(', ')})` : msg;
}

/**
 * potionTendGarden. Mutates garden, inv and pc. ctx: { learned, upgrades,
 * seedId, now, rng, maxLuck, rubeweed }. Returns { ok, msg, count, energy,
 * mood, xp, items, drop: { chance, table, hit } }.
 */
export function potionTendGarden(garden, action, inv, pc, ctx = {}) {
  const now = ctx.now ?? Date.now();
  const rng = ctx.rng || Math.random;
  const type = garden?.gardenType === 'herb' ? 'herb' : 'default';
  const details = mgDetails(type, action, ctx.learned, ctx.upgrades);
  if (!details) return { ok: false, msg: 'You need to know Master Gardener to use this.' };
  const cost = Number(details.energy_cost) || 0;
  let energy = 0;
  let mood = 0;
  let xp = 0;
  let count = 0;
  let tired = false;
  const results = {};
  const pay = () => {
    if ((pc.energy || 0) <= cost && cost > 0) {
      tired = true;
      return false;
    }
    pc.energy = Math.max(0, (pc.energy || 0) - cost);
    energy += cost;
    // master_garden.js runs the package once per plot: its mood first, then
    // its xp_bonus, which inc_skill_packages.js 532 scales by the mood so far.
    const plotMood = Number(details.mood_bonus) || 0;
    mood += plotMood;
    pc.mood = Math.min(moodMax(pc), (pc.mood || 0) + plotMood);
    xp += grantMoodXp(pc, Number(details.xp_bonus) || 0);
    return true;
  };
  for (const [, plot] of plotsOf(garden)) {
    if (action === 'water') {
      if (!pay()) break;
      wetPlot(plot, now);
      count += 1;
    } else if (action === 'hoe') {
      if (plot.state !== 'dirty') continue;
      if (!pay()) break;
      plot.state = 'clean';
      plot.seed = null;
      plot.fertilized = false;
      plot.stageStartedAt = now;
      plot.growthMs = 0;
      count += 1;
    } else if (action === 'plant') {
      if (!(Number(inv?.[ctx.seedId]) > 0)) break;
      if (plot.state !== 'clean') continue;
      const seed = SEED_CATALOG[ctx.seedId];
      if (!seed || seed.gardenType !== type) break;
      if (!pay()) break;
      inv[ctx.seedId] -= 1;
      if (inv[ctx.seedId] <= 0) delete inv[ctx.seedId];
      plot.state = 'seeds';
      plot.seed = seed.seedId;
      plot.fertilized = false;
      plot.growModifier = 1 - gardenGrowModifier(type, ctx.upgrades || []);
      plot.stageStartedAt = now;
      plot.growthMs = 0;
      count += 1;
    } else if (action === 'pick') {
      if (plot.state !== 'crop' || !plot.seed) continue;
      const seed = SEED_CATALOG[plot.seed];
      if (!seed) continue;
      if (!pay()) break;
      const num = seed.produces;
      let bonus = 0;
      if (details.bonus_multiplier && (ctx.maxLuck || rng() < (details.bonus_chance || 0))) bonus = num * (details.bonus_multiplier - 1);
      const row = (results[seed.cropId] ||= { seed, num: 0, bonus: 0 });
      row.num += num + bonus;
      row.bonus += bonus;
      plot.state = 'dirty';
      plot.seed = null;
      plot.fertilized = false;
      plot.stageStartedAt = now;
      plot.growthMs = 0;
      count += 1;
    } else if (action === 'fertilize') {
      if (!plot.seed || plot.fertilized || plot.state === 'crop') continue;
      const seed = SEED_CATALOG[plot.seed];
      if (!seed) continue;
      if (!pay()) break;
      if (plot.state === 'seeds') {
        // stateChanged(grow1): straight to shoots.
        plot.state = 'shoots';
        plot.stageStartedAt = now;
        plot.growthMs = 0;
      } else if (plot.state === 'shoots') {
        const need = seed.grow2Ms * (plot.growModifier || 1);
        const left = Math.max(0, need - stageElapsedMs(plot, now));
        plot.stageStartedAt = now - (need - 0.1 * left);
        plot.growthMs = 0;
        plot.fertilized = true;
      }
      count += 1;
    }
  }
  if (!count) return { ok: false, msg: tired ? "You're too tired to do that." : GARDEN_POTIONS_BY_ACTION[action]?.noTarget || 'Nothing to do.' };
  const items = {};
  for (const [cropId, r] of Object.entries(results)) items[cropId] = r.num;
  for (const [id, n] of Object.entries(items)) inv[id] = (Number(inv[id]) || 0) + n;
  const base = { water: 'You watered a garden.', hoe: 'You cleaned a garden.', plant: 'You planted a garden.', pick: pickedMessage(results, ctx.pluralOf), fertilize: 'You fertilized a garden.' }[action];
  let drop = null;
  if (action === 'water' || action === 'plant' || action === 'hoe') {
    const chance = mgDropChance(Object.keys(garden.plots || {}).length, ctx);
    drop = { chance, table: mgDropTable(type, action), hit: chance > 0 && rng() < chance };
  }
  const superHarvest = Object.values(results).some((r) => r.bonus > 0);
  return { ok: true, action, count, energy, mood, xp, items, superHarvest, msg: growl(base, { energy, mood, xp }), drop, tired };
}

const GARDEN_POTIONS_BY_ACTION = Object.fromEntries(Object.values(GARDEN_POTIONS).map((p) => [p.action, p]));

/* ------------------------------------------------------------ bottles */

/** Uses left in the current bottle of each potion class (points_remaining). */
export function createPotionState(seed = {}) {
  const uses = {};
  for (const id of Object.keys(GARDEN_POTIONS)) {
    const n = Number(seed?.uses?.[id]);
    if (Number.isFinite(n) && n > 0) uses[id] = Math.min(POTION_USES, Math.floor(n));
  }
  return { uses };
}

export function potionUsesLeft(state, potionClass, inv) {
  if (!(Number(inv?.[potionClass]) > 0)) return 0;
  return state.uses[potionClass] || POTION_USES;
}

/** tool_base use(1); at 0 the bottle is consumed (apiConsume) and the next starts full. */
export function usePotion(state, potionClass, inv) {
  if (!(Number(inv?.[potionClass]) > 0)) return { ok: false, emptied: false };
  const left = (state.uses[potionClass] || POTION_USES) - 1;
  if (left <= 0) {
    inv[potionClass] -= 1;
    if (inv[potionClass] <= 0) delete inv[potionClass];
    delete state.uses[potionClass];
    return { ok: true, emptied: true, left: 0 };
  }
  state.uses[potionClass] = left;
  return { ok: true, emptied: false, left };
}
