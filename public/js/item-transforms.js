/**
 * Pack verbs that turn one item into another with no tool: the source of
 * Butterfly Butter, every Cheese, the Small Worthless object, and herb seeds.
 *
 * Source (glitch-GameServerJS items, CC0):
 * - milk_butterfly.js shake: 2 energy each -> butterfly_butter
 * - butterfly_butter.js compress: 5 energy each -> cheese
 * - cheese.js age: 5 energy + 5 mood each -> cheese_stinky
 * - cheese_stinky.js age: 10 energy each -> cheese_very_stinky
 * - cheese_very_stinky.js age: 20 energy + 20 mood each -> cheese_very_very_stinky
 * - cheese_very_stinky.js poke: 10 energy, small_worthless out and the cheese
 *   falls back to cheese_stinky
 * - grain.js bundle: 250 Grain -> 1 grain_bushel for 20 energy, hidden below
 *   250 Grain, refused at 20 energy or less; grain_bushel.js unbundle: 1 bushel
 *   -> 250 Grain, 5 energy and +10 mood each, refused below 5 energy
 * - herb_base extract_seeds ("shuck"): skill package herbalism_extract_seeds,
 *   2 seeds per herb (seed_failure per herb class), success_rate roll,
 *   bonus_chance x bonus_multiplier
 *
 * Every verb works on one item or the whole stack, like the source's count.
 */

import { addItem, countItem, ensureItem, removeItem } from './inventory.js?v=catalog-unified-5';
import { skillPackageDetails } from './skill-packages.js';

/**
 * Plain transforms: { verb, label, out, energy, mood, keep } per input class.
 * Optional: `per` inputs make one output, `outQty` outputs come from one input,
 * `moodGain` is mood given per use, `strict` refuses at exactly the energy cost
 * (source `<=`), `single` offers no "all" button, `tired` replaces the energy
 * refusal, and `line` may be a function of the count.
 */
export const ITEM_TRANSFORMS = Object.freeze({
  milk_butterfly: Object.freeze([
    { id: 'shake', label: 'Shake', out: 'butterfly_butter', energy: 2, tooltip: 'Make butter.', line: 'You shake the butterfly milk vigorously. Butterfly butter!', source: 'milk_butterfly.js shake' },
  ]),
  butterfly_butter: Object.freeze([
    { id: 'compress', label: 'Compress', out: 'cheese', energy: 5, tooltip: 'Makes cheese.', line: 'You squeeze the butterfly butter with all your might and cheese appears!', source: 'butterfly_butter.js compress' },
  ]),
  cheese: Object.freeze([
    { id: 'age', label: 'Age', out: 'cheese_stinky', energy: 5, mood: 5, tooltip: 'Add some stink.', line: 'You put the cheese in your pocket for a while and it ages nicely. It left a bit of a smell in your pocket though.', source: 'cheese.js age' },
  ]),
  cheese_stinky: Object.freeze([
    { id: 'age', label: 'Age', out: 'cheese_very_stinky', energy: 10, tooltip: 'Increase the stink.', line: 'If you concentrate really hard on it, the cheese does indeed age.', source: 'cheese_stinky.js age' },
  ]),
  grain: Object.freeze([
    { id: 'bundle', label: 'Bundle', out: 'grain_bushel', per: 250, energy: 20, strict: true, single: true, tooltip: 'Bundle this grain into a nifty Bushel.', tired: "You're far too tired to bundle grain.", line: 'You bundled 250 Grains.', source: 'grain.js bundle' },
  ]),
  grain_bushel: Object.freeze([
    { id: 'unbundle', label: 'Unbundle', out: 'grain', outQty: 250, energy: 5, moodGain: 10, strict: true, tooltip: 'Unpack this bundle into 250 sheaves of Grain.', tired: 'You are too tired to unbundle things!', line: (n) => (n > 1 ? `You unbundled ${n} Bushels of Grain.` : 'You unbundled a Bushel of Grain.'), source: 'grain_bushel.js unbundle' },
  ]),
  cheese_very_stinky: Object.freeze([
    { id: 'age', label: 'Age', out: 'cheese_very_very_stinky', energy: 20, mood: 20, tooltip: 'Increase the stink.', line: 'Wow, is that ever draining. But the cheese is visibly aged.', source: 'cheese_very_stinky.js age' },
    {
      id: 'poke',
      label: 'Poke',
      out: 'small_worthless',
      energy: 10,
      becomes: 'cheese_stinky',
      tooltip: 'Investigate with a pinkie.',
      line: "After sticking an investigatory pinkie in the soft, gooey cheese, you encounter a hard object. You pull it out. It's a small shiny object with no intrinsic value!",
      source: 'cheese_very_stinky.js poke',
    },
  ]),
});

/** Transform outputs the shared catalog lacks (items/grain_bushel.js label, description, cost, stack). */
export const TRANSFORM_ITEMS = Object.freeze({
  grain_bushel: Object.freeze({ label: 'Bushel of Grain', namePlural: 'Bushels of Grain', desc: '250 stalks of grain all tied up nice and neat.', baseCost: 250, stackMax: 5 }),
});
for (const [id, meta] of Object.entries(TRANSFORM_ITEMS)) ensureItem(id, meta);

/** herb_base seed_type and seed_failure for every herb with a seed. */
export const HERB_SEEDS = Object.freeze({
  purple_flower: { seed: 'herb_seed_purple_flower', failure: 0 },
  rubeweed: { seed: 'herb_seed_rubeweed', failure: 0 },
  rookswort: { seed: 'herb_seed_rookswort', failure: 0 },
  hairball_flower: { seed: 'herb_seed_hairball_flower', failure: 0 },
  silvertongue: { seed: 'herb_seed_silvertongue', failure: 0 },
  gandlevery: { seed: 'herb_seed_gandlevery', failure: 0 },
  yellow_crumb_flower: { seed: 'herb_seed_yellow_crumb_flower', failure: 0.34 },
});

export const SHUCK_PACKAGE = 'herbalism_extract_seeds';

/** Every input -> output pair, for the supply report and job-obtainable. */
export function transformEdges() {
  const edges = [];
  for (const [from, list] of Object.entries(ITEM_TRANSFORMS)) {
    for (const t of list) edges.push({ from, to: t.out, verb: t.id, source: t.source });
  }
  for (const [herb, row] of Object.entries(HERB_SEEDS)) edges.push({ from: herb, to: row.seed, verb: 'shuck', source: 'herb_base extract_seeds' });
  return edges;
}

/** Pack buttons for one class: [{ id, label, enabled, reason, tooltip }]. */
export function listTransformVerbs(classTsid, inv, pc, learned = []) {
  const have = countItem(inv, classTsid);
  if (have < 1) return [];
  const out = [];
  for (const t of ITEM_TRANSFORMS[classTsid] || []) {
    const per = t.per || 1;
    // grain.js bundle conditions: state null (hidden) below a full 250.
    if (have < per) continue;
    const one = transformCheck(classTsid, t.id, 1, inv, pc, learned);
    out.push({ id: `${t.id}:1`, label: t.label, enabled: one.ok, reason: one.msg || '', tooltip: costTip(t, 1) });
    if (have > 1 && !t.single) {
      const all = transformCheck(classTsid, t.id, have, inv, pc, learned);
      out.push({ id: `${t.id}:all`, label: `${t.label} all ${have}`, enabled: all.ok, reason: all.msg || '', tooltip: costTip(t, have) });
    }
  }
  if (HERB_SEEDS[classTsid]) {
    const one = transformCheck(classTsid, 'shuck', 1, inv, pc, learned);
    const energy = shuckDetails(learned).energy;
    out.push({ id: 'shuck:1', label: 'Shuck', enabled: one.ok, reason: one.msg || '', tooltip: `Pull the herb vigorously, destroying it but gaining seeds. Costs ${energy} energy.` });
    if (have > 1) {
      const all = transformCheck(classTsid, 'shuck', have, inv, pc, learned);
      out.push({ id: 'shuck:all', label: `Shuck all ${have}`, enabled: all.ok, reason: all.msg || '', tooltip: `Costs ${energy * have} energy.` });
    }
  }
  return out;
}

function costTip(t, n) {
  const parts = [`${t.energy * n} energy`];
  if (t.mood) parts.push(`${t.mood * n} mood`);
  return `${t.tooltip} Costs ${parts.join(' and ')}.`;
}

/**
 * The herbalism_extract_seeds row plus its img overlays: Seedy Powers 75%
 * and Super Seedy Powers 100% chance of doubled seeds (catalog_skill_packages.js
 * herbalism_extract_seeds img_upgrades).
 */
export function shuckDetails(learned = [], upgrades = []) {
  const d = skillPackageDetails(SHUCK_PACKAGE, learned, upgrades) || {};
  return {
    energy: Number(d.energy_cost ?? 4),
    successRate: Number(d.success_rate ?? 75) / 100,
    bonusChance: Number(d.bonus_chance ?? 0),
    bonusMultiplier: Number(d.bonus_multiplier ?? 1),
  };
}

export function transformCheck(classTsid, verb, count, inv, pc, learned = []) {
  const n = Math.max(1, Math.floor(Number(count) || 1));
  if (countItem(inv, classTsid) < n) return { ok: false, reason: 'missing', msg: 'You do not have that many.' };
  if (verb === 'shuck') {
    if (!HERB_SEEDS[classTsid]) return { ok: false, reason: 'unknown', msg: 'That cannot be shucked.' };
    const { energy } = shuckDetails(learned);
    if ((pc?.energy || 0) <= energy * n) return { ok: false, reason: 'energy', msg: n > 1 ? "You're too tired for all that scraping!" : 'Shucking requires more effort than you can muster.' };
    return { ok: true, energy: energy * n, count: n };
  }
  const t = (ITEM_TRANSFORMS[classTsid] || []).find((row) => row.id === verb);
  if (!t) return { ok: false, reason: 'unknown', msg: 'You cannot do that.' };
  const per = t.per || 1;
  if (countItem(inv, classTsid) < n * per) return { ok: false, reason: 'missing', msg: 'You do not have that many.' };
  const energy = pc?.energy || 0;
  if (t.strict ? energy <= t.energy * n : energy < t.energy * n) return { ok: false, reason: 'energy', msg: t.tired || "You don't have enough energy to do that." };
  if (t.mood && (pc?.mood || 0) < t.mood * n) return { ok: false, reason: 'mood', msg: 'You need more mood to do that.' };
  return { ok: true, energy: t.energy * n, mood: (t.mood || 0) * n, count: n, transform: t };
}

/**
 * Run one transform. `count` is a number or 'all'. Atomic on failure.
 * @returns {{ ok: boolean, msg: string, out?: string, got?: number }}
 */
export function runTransform(classTsid, verb, count, inv, pc, learned = [], rng = Math.random) {
  const n = count === 'all' ? countItem(inv, classTsid) : Math.max(1, Math.floor(Number(count) || 1));
  const check = transformCheck(classTsid, verb, n, inv, pc, learned);
  if (!check.ok) return check;
  if (verb === 'shuck') return shuck(classTsid, n, inv, pc, learned, rng);
  const t = check.transform;
  const got = n * (t.outQty || 1);
  removeItem(inv, classTsid, n * (t.per || 1));
  pc.energy -= check.energy;
  if (check.mood) pc.mood = (pc.mood || 0) - check.mood;
  const moodGain = (t.moodGain || 0) * n;
  if (moodGain) pc.mood = Math.min(Number.isFinite(pc.moodMax) ? pc.moodMax : 100, (pc.mood || 0) + moodGain);
  addItem(inv, t.out, got);
  if (t.becomes) addItem(inv, t.becomes, n);
  const cost = [`-${check.energy} energy`, ...(check.mood ? [`-${check.mood} mood`] : []), ...(moodGain ? [`+${moodGain} mood`] : [])].join(', ');
  const line = typeof t.line === 'function' ? t.line(n) : t.line;
  return { ok: true, out: t.out, got, energy: check.energy, mood: check.mood, moodGain, msg: `${line} (${cost})` };
}

function shuck(classTsid, n, inv, pc, learned, rng) {
  const herb = HERB_SEEDS[classTsid];
  const d = shuckDetails(learned, pc?.imaginationUpgrades);
  pc.energy -= d.energy * n;
  if (rng() >= d.successRate) {
    return { ok: false, reason: 'failed', energy: d.energy * n, msg: `You tried to extract seeds, but you failed! (-${d.energy * n} energy)` };
  }
  let seeds = 0;
  for (let i = 0; i < 2 * n; i += 1) if (herb.failure <= 0 || rng() >= herb.failure) seeds += 1;
  if (d.bonusChance > 0 && rng() < d.bonusChance) seeds *= d.bonusMultiplier;
  removeItem(inv, classTsid, n);
  if (!seeds) return { ok: true, got: 0, out: herb.seed, energy: d.energy * n, msg: 'But you failed, destroying it!' };
  addItem(inv, herb.seed, seeds);
  return { ok: true, got: seeds, out: herb.seed, energy: d.energy * n, msg: `You extracted ${seeds} seed${seeds === 1 ? '' : 's'}. (-${d.energy * n} energy)` };
}
