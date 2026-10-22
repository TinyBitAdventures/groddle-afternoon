/**
 * Soil, Patches, Seedlings and trees grown from Seasoned Beans.
 *
 * Pure rules (no Pixi, no DOM). Source: tinyspeck/glitch-GameServerJS (CC0)
 *   items/patch.js, items/patch_dark.js   tend / dig / plant, regrow + fill timers,
 *                                          can_plant_mappings, responses
 *   items/patch_seedling.js               three pettings, 5 min / 4 h timers, growUp
 *   items/bean_base (bean_*.js)           seasoned beans -> trant_class
 *   items/include/trants.js               initTrant (maturity 1, health 7),
 *                                          recalcCycles + onMaturityCycle growth chances
 *   items/wood_tree.js                    maturityMap care growth, maturity 0 -> Patch
 *   items/trant_*_dead.js (dead_tree)     clear with a Hatchet -> Planks, leaves a Patch
 *   items/catalog_skill_packages.js       soil_appreciation, dig_patch, dead_trant_clearing
 *   items/catalog_drop_tables.js          soil_appreciation_small/large, currants_*, loam*
 *   players/inc_skill_packages.js         success roll before costs, energy gate, drops
 *   items/item.js notifyVerb              `<class>:<verb>` and `VERB:<verb>:<class>` counters
 *
 * A plot is one patch-sized place in the world. It moves through stages:
 *   dirty (weedy) -tend-> clean -plant-> seedling -grow-> tree
 *   dirty/clean -dig-> dug -(10 min)-> dirty;  clean -(90 s)-> dirty
 *   seedling -(4 h without growing)-> dirty patch
 *   dead tree -clear-> dirty patch;  grown Wood Tree harvested to maturity 0 -> dirty patch
 *
 * Remake decisions (documented where they apply):
 *  - Hubs 28 (Old Groddle Forest) and 52 (The New Start) are the archived
 *    pre-2011 copies of Groddle. They hold most recovered Patches but appear in
 *    no can_plant_mappings row, so they plant as Groddle Forest (56).
 *  - Living trees grow with the exact maturity chances and 10/20-minute cycles,
 *    but do not lose health or die of neglect: the remake's daily pet/water
 *    model (js/trant-care.js) does not reproduce the source's hourly tendable
 *    windows, so source health decay would kill every planted tree in a day.
 */

import { createTrantState, fruitCapacityAt, refillFruit, resetTrantDay } from './trants.js?v=trant-harvest-2';
import { ensureWoodTreeState, resetWoodTreeDay } from './woodcutting.js?v=woodcutting-1';
import { canUseTool, useToolCondition } from './tools.js?v=tools-2';
import { musicblockItemMeta } from './musicblocks.js';

export const PATCH_SOURCE = 'tinyspeck/glitch-GameServerJS CC0';
export const SOIL_SPRITE_ROOT = 'assets/sprites/soil';

export const PATCH_CLASSES = Object.freeze(['patch', 'patch_dark']);
export const DEAD_TRANT_CLASSES = Object.freeze([
  'trant_bean_dead',
  'trant_bubble_dead',
  'trant_egg_dead',
  'trant_fruit_dead',
  'trant_gas_dead',
  'trant_spice_dead',
]);
export const SOIL_CLASSES = Object.freeze([...PATCH_CLASSES, 'patch_seedling', ...DEAD_TRANT_CLASSES]);

export const SOIL_LABELS = Object.freeze({
  patch: 'Patch',
  patch_dark: 'Dark Patch',
  patch_seedling: 'Seedling',
  trant_bean_dead: 'Dead Bean Tree',
  trant_bubble_dead: 'Dead Bubble Tree',
  trant_egg_dead: 'Dead Egg Plant',
  trant_fruit_dead: 'Dead Fruit Tree',
  trant_gas_dead: 'Dead Gas Plant',
  trant_spice_dead: 'Dead Spice Plant',
});

/** bean_*.js onCreate: trant_class (trant_chance is 0.9 on all seven but only checked for truthiness). */
export const SEASONED_BEANS = Object.freeze({
  bean_bean: Object.freeze({ trantClass: 'trant_bean', label: 'Bean Tree Bean', baseCost: 150 }),
  bean_bubble: Object.freeze({ trantClass: 'trant_bubble', label: 'Bubble Tree Bean', baseCost: 150 }),
  bean_egg: Object.freeze({ trantClass: 'trant_egg', label: 'Egg Plant Bean', baseCost: 150 }),
  bean_fruit: Object.freeze({ trantClass: 'trant_fruit', label: 'Fruit Tree Bean', baseCost: 150 }),
  bean_gas: Object.freeze({ trantClass: 'trant_gas', label: 'Gas Plant Bean', baseCost: 150 }),
  bean_spice: Object.freeze({ trantClass: 'trant_spice', label: 'Spice Plant Bean', baseCost: 150 }),
  bean_wood: Object.freeze({ trantClass: 'wood_tree', label: 'Wood Tree Bean', baseCost: 200 }),
});

export const GROWN_TREE_LABELS = Object.freeze({
  trant_bean: 'Bean Tree',
  trant_bubble: 'Bubble Tree',
  trant_egg: 'Egg Plant',
  trant_fruit: 'Fruit Tree',
  trant_gas: 'Gas Plant',
  trant_spice: 'Spice Plant',
  wood_tree: 'Wood Tree',
});

/** patch.js can_plant_mappings: trant class -> hub ids. */
export const CAN_PLANT_MAPPINGS = Object.freeze({
  trant_bean: Object.freeze([56, 58, 64, 76, 93, 89, 85, 102, 75, 97, 92, 98, 101, 102, 105, 109, 88, 112, 113, 114, 119, 120, 121, 123, 100, 116]),
  trant_bubble: Object.freeze([56, 58, 64, 51, 50, 78, 27, 102, 75, 97, 92, 98, 101, 102, 105, 88, 112, 114, 120, 123, 137, 100, 116, 141]),
  trant_fruit: Object.freeze([56, 58, 64, 76, 93, 89, 85, 102, 75, 97, 92, 98, 101, 105, 109, 88, 112, 113, 114, 119, 120, 121, 123, 132, 100, 116]),
  trant_gas: Object.freeze([51, 50, 78, 63, 72, 71, 99, 27]),
  trant_spice: Object.freeze([63, 72, 71, 99, 27]),
  wood_tree: Object.freeze([56, 58, 64, 76, 93, 89, 85, 102, 75, 97, 92, 98, 101, 102, 105, 109, 88, 112, 113, 114, 119, 120, 121, 123, 137, 100, 116, 141]),
});

/** Remake: archived legacy Groddle hubs plant as Groddle Forest (see header). */
export const PLANT_HUB_ALIASES = Object.freeze({ 28: 56, 52: 56 });

/** catalog_skill_packages.js */
export const SOIL_SKILL_PACKAGES = Object.freeze({
  soil_appreciation: Object.freeze({
    no_skill: Object.freeze({ rank: 0, duration: 5000, success_rate: 90, energy_cost: 5, tool_wear: 2, mood_bonus: 1 }),
    soil_appreciation_1: Object.freeze({ rank: 1, duration: 2000, success_rate: 100, energy_cost: 5, tool_wear: 2, mood_bonus: 1, xp_bonus: 1 }),
    soil_appreciation_2: Object.freeze({ rank: 2, duration: 2000, success_rate: 100, energy_cost: 2, tool_wear: 2, mood_bonus: 1, xp_bonus: 2 }),
    soil_appreciation_3: Object.freeze({ rank: 3, duration: 2000, success_rate: 100, energy_cost: 2, tool_wear: 1, mood_bonus: 2, xp_bonus: 2, drop_class_id: 'soil_appreciation_small', drop_chance: 8 }),
    soil_appreciation_4: Object.freeze({ rank: 4, duration: 1000, success_rate: 100, energy_cost: 2, tool_wear: 1, mood_bonus: 2, xp_bonus: 4, drop_class_id: 'soil_appreciation_small', drop_chance: 10 }),
    soil_appreciation_5: Object.freeze({ rank: 5, duration: 1000, success_rate: 100, energy_cost: 1, tool_wear: 1, mood_bonus: 2, xp_bonus: 4, drop_class_id: 'soil_appreciation_large', drop_chance: 10 }),
  }),
  dig_patch: Object.freeze({
    no_skill: Object.freeze({ rank: 0, duration: 6000, success_rate: 100, energy_cost: 6, tool_wear: 2, bonus_amount: 2 }),
    soil_appreciation_1: Object.freeze({ rank: 1, duration: 5000, success_rate: 100, energy_cost: 5, tool_wear: 2, xp_bonus: 1, drop_class_id: 'loam_2', drop_chance: 3, bonus_amount: 2 }),
    soil_appreciation_2: Object.freeze({ rank: 2, duration: 4000, success_rate: 100, energy_cost: 4, tool_wear: 2, xp_bonus: 2, drop_class_id: 'loam', drop_chance: 5, bonus_amount: 3 }),
    soil_appreciation_3: Object.freeze({ rank: 3, duration: 3000, success_rate: 100, energy_cost: 4, tool_wear: 1, xp_bonus: 2, drop_class_id: 'loam', drop_chance: 8, bonus_amount: 3 }),
    soil_appreciation_4: Object.freeze({ rank: 4, duration: 2000, success_rate: 100, energy_cost: 3, tool_wear: 1, xp_bonus: 4, drop_class_id: 'loam_4', drop_chance: 10, bonus_amount: 4 }),
    soil_appreciation_5: Object.freeze({ rank: 5, duration: 2000, success_rate: 100, energy_cost: 3, tool_wear: 1, xp_bonus: 4, drop_class_id: 'loam_4', drop_chance: 15, bonus_amount: 4 }),
  }),
  dead_trant_clearing: Object.freeze({
    no_skill: Object.freeze({ rank: 0, duration: 4000, success_rate: 100, energy_cost: 20, tool_wear: 5, xp_bonus: 2, bonus_amount: 25 }),
  }),
});

/** patch.js tend handler: `hoeing_more_img_more_wear` imagination upgrade overrides. */
export const HOEING_UPGRADE = 'hoeing_more_img_more_wear';
export const HOEING_UPGRADE_TABLE = Object.freeze([
  Object.freeze({ skill: 'soil_appreciation_5', xp: 10, wear: 5 }),
  Object.freeze({ skill: 'soil_appreciation_4', xp: 8, wear: 5 }),
  Object.freeze({ skill: 'soil_appreciation_3', xp: 6, wear: 4 }),
  Object.freeze({ skill: 'soil_appreciation_2', xp: 5, wear: 2 }),
  Object.freeze({ skill: 'soil_appreciation_1', xp: 3, wear: 1.5 }),
  Object.freeze({ skill: null, xp: 2, wear: 1.5 }),
]);

/** patch_seedling.js setTimers / onPetted: the planter's imagination upgrades. */
export const SEEDLING_GROW_UPGRADES = Object.freeze({
  soil_appreciation_bean_grow_2: Object.freeze({ minMinutes: 1, growLevel: 4 }),
  soil_appreciation_bean_grow_1: Object.freeze({ minMinutes: 3, growLevel: 3 }),
});

export const SOIL_TIMERS = Object.freeze({
  cleanRegrowMs: 1000 * 60 * 1.5, // patch.js setClean: onRegrowTimer 1.5m
  dugFillMs: 1000 * 60 * 10, // patch.js setDug: onFillTimer 10m
  seedlingMinMs: 1000 * 60 * 5, // patch_seedling.js setTimers min_time 5m
  seedlingMaxMs: 1000 * 60 * 60 * 4, // onMaxTimePassed 4h
  seedlingPets: 3,
  maturityIntervalMs: 1000 * 60, // trants.js startLoop apiSetInterval('onInterval', 1)
  woodToPatchMs: 2000, // wood_tree.js onDie timer after maturity 0
  maxCatchUpCycles: 400,
});

/** trants.js initTrant */
export const GROWN_TRANT_START = Object.freeze({ maturity: 1, health: 7 });

/** wood_tree.js maturityMap: pettings and waterings needed at maturity 1..6. */
export const WOOD_TREE_MATURITY_MAP = Object.freeze([2, 3, 4, 5, 6, 0]);

/** catalog_drop_tables.js (cumulative 0-100 thresholds; first row >= roll wins). */
export const SOIL_DROP_TABLES = Object.freeze({
  soil_appreciation_small: Object.freeze([
    [35, [{ table: 'currants_small' }]],
    [56, [{ classTsid: 'earth', qty: 3 }]],
    [69, [{ classTsid: 'musicblock_b_brown_02', qty: 1 }]],
    [80, [{ classTsid: 'musicblock_x_shiny_04', qty: 1 }]],
    [89, [{ classTsid: 'musicblock_b_brown_05', qty: 1 }]],
    [98, [{ classTsid: 'loam', qty: 3 }]],
    [100, [{ classTsid: 'gem_diamond', qty: 1 }]],
  ]),
  soil_appreciation_large: Object.freeze([
    [30, [{ table: 'currants_medium' }]],
    [43, [{ classTsid: 'earth', qty: 3 }]],
    [55, [{ classTsid: 'musicblock_b_brown_02', qty: 1 }]],
    [66, [{ classTsid: 'musicblock_x_shiny_04', qty: 1 }]],
    [75, [{ classTsid: 'musicblock_b_brown_05', qty: 1 }]],
    [84, [{ classTsid: 'musicblock_d_red_04', qty: 1 }]],
    [91, [{ classTsid: 'musicblock_d_blue_05', qty: 1 }]],
    [97, [{ classTsid: 'loam', qty: 3 }]],
    [99, [{ classTsid: 'gem_diamond', qty: 1 }]],
    [100, [{ table: 'musicblocks_brown' }]],
  ]),
  musicblocks_brown: Object.freeze([
    [99, [{ classTsid: 'musicblock_b_brown_02', qty: 1 }]],
    [100, [{ classTsid: 'musicblock_sb_secret_01', qty: 1 }]],
  ]),
  currants_small: Object.freeze(
    [[14, 3], [26, 5], [36, 7], [45, 11], [53, 13], [60, 17], [66, 19], [71, 23], [75, 29], [78, 59], [81, 53], [84, 47], [87, 43], [90, 41], [93, 37], [96, 31], [98, 61], [100, 63]]
      .map(([at, currants]) => [at, [{ currants }]])
  ),
  currants_medium: Object.freeze(
    [[14, 7], [26, 13], [36, 19], [45, 23], [53, 29], [60, 31], [66, 37], [71, 41], [75, 47], [78, 83], [81, 79], [84, 73], [87, 71], [90, 67], [93, 61], [96, 53], [98, 89], [100, 101]]
      .map(([at, currants]) => [at, [{ currants }]])
  ),
  loam: Object.freeze([[100, [{ classTsid: 'loam', qty: 3 }]]]),
  loam_2: Object.freeze([[100, [{ classTsid: 'loam', qty: 2 }]]]),
  loam_4: Object.freeze([[100, [{ classTsid: 'loam', qty: 4 }]]]),
});

/** Items soil verbs can award (labels/costs from each GSJS item file). */
export const SOIL_ITEM_DEFS = Object.freeze({
  earth: Object.freeze({ label: 'Lump of Earth', namePlural: 'Lumps of Earth', baseCost: 3, stackMax: 50, desc: "It's just a lump of earth. For building with." }),
  loam: Object.freeze({ label: 'Lump of Loam', namePlural: 'Lumps of Loam', baseCost: 10, stackMax: 24, desc: "Moist and fertile, and leagues above plain old earth. Any building project's pride." }),
  gem_diamond: Object.freeze({ label: 'Walloping Big Diamond', namePlural: 'Walloping Big Diamonds', baseCost: 2000, stackMax: 3, desc: "Yep, that's a walloping big diamond." }),
  plank: Object.freeze({ label: 'Plank', namePlural: 'Planks', baseCost: 5, stackMax: 250, desc: 'A plain wooden plank with many uses.' }),
  musicblock_b_brown_02: Object.freeze(musicblockItemMeta('musicblock_b_brown_02')),
  musicblock_b_brown_05: Object.freeze(musicblockItemMeta('musicblock_b_brown_05')),
  musicblock_x_shiny_04: Object.freeze(musicblockItemMeta('musicblock_x_shiny_04')),
  musicblock_d_red_04: Object.freeze(musicblockItemMeta('musicblock_d_red_04')),
  musicblock_d_blue_05: Object.freeze(musicblockItemMeta('musicblock_d_blue_05')),
  musicblock_sb_secret_01: Object.freeze(musicblockItemMeta('musicblock_sb_secret_01')),
});

/** patch.js / patch_seedling.js `responses` (sendResponse talkback). */
export const SOIL_RESPONSES = Object.freeze({
  clear_bean_tree: ['Bean there - done now. A ha ha h...', 'Toodle pip, old Bean, eh? Heh heh *croak*...', "Die, my dear? Why, that's the last thing I'll d…", "Phew. I'm so tired of being the funniest person in the yard…", 'Dying is easy. Comedy is hard.'],
  clear_bubble_tree: ['I have not told half of what I saw…', "I knew they'd get me in the end.", "Sigh. I'm so bored with it all, anyw...", "Don't disturb my circles!", 'The struggle will continue! Onward, comr…'],
  clear_egg_plant: ['Egg tu, Brute? Egg TU?', "Meh. Last words are for fools who haven't said enough.", "Bah! You couldn't hit an elephant at this dist...", 'Ah. La petit mort. Au revoir, mon cherie.', 'Acta est fabula, plaudite!'],
  clear_fruit_tree: ['URK!', "Wait, I've just thought of someth....", 'ARRRRGGGGHHHH…', 'BUUUUURP. Excuse m…', 'Ngngngngngng-ftang.'],
  clear_gas_plant: ['Ahhh: beautiful day. Beautiful.', 'Why not? Yeah.', 'Yeah… better to burn out than fade away…', 'Such a beautiful day to die, man.', "It's been a gas, friend. See you in the ne…"],
  clear_spice_plant: ["Nonsense! I've never felt bett...eugh.", "Well, I've had a happy life. Also, spicy!", 'Drink to me!…', 'I never should have switched from scotch to martinis…', 'Oh you young people act like old men. You have no fun…'],
  dig_loam_drop: ['OOOOH. This dig is better dugged than otherdiggins.', 'You should so much take this. Is BEST diggins.', 'AW! I am think this is best thing EVER! But I am hole.', 'Cans you dig it? O look, you can.', 'In thinkings of humble hole, you did win today.'],
  dig_na_sa1_sa5: ['Is dugged! Here! Earths!', "O looks! You dugged me. An' I mades this.", 'O what is this you did dug? It done be stuff, yeah?', 'I is pull this out of that hole you dugged.', 'Please be patient. I am newthing. Thanky for digs!', 'Look! Earths and stuffs! Dugged it you did!'],
  tend_drop: ['Buuuuuuuuuuuuuuurp! TA DA!', 'Cough COUGH! Oh! Erm, you can have that.', 'A.... A-CHOOO!', "Hic! Oh wow, that's been stuck there for eons.", 'Tend and ye shall find... um... this?'],
  tend_failed: ["Nein, danke. Reholster that hoe, young'un.", "That hoe's not coming near me. Hoe no no no."],
  tend_na_sa1_sa5: ['So fresh! So clean! So ready for a bean! OMG that rhymes!', 'Ah, cleansed. Now plant me up, I say, PLANT ME UP!', 'Much better. And much better for gardening, non?', 'Nice and tidy. And superfertile. Got any beans?', 'Great. Now: tended patches need beans. You dig?'],
  pet_1st_2nd_time: ["Mmmmmn, that's nice.", 'Excellent. A little nurture stimulates the nodules...', 'Many thanks. Growing is hard work.', "One day I'll be a real tree!", 'Unf! Straining noises! Creaking and stuff!'],
  pet_3rd_time: ['Ahh. Enough for now, thank you.', 'Now stand back. And wait for the magic to happen.', 'Enough! I need time to ruminate on my growingness.', 'Three times is the charm, chum. Enough.', 'Thanks, but enough for now. I must grow my own way.'],
  pet_no_more: ['Shhhh! Leave me to concentrate on biggificating.', 'Cease and desist! In the nicest way possible: Go away.', 'Avast! Pet me not. I need to focus on sprouting.', 'Halt! No more petting. This I must do alone.', 'Stop right there! I must do the final spurt myself!'],
  plant_bean: ['Squeee! That tickles!', 'Oooh! I shall hold it and squeeze it and grow it and call it George.', 'Yessss! A bean! Come to me my precioussssssss.', 'Ah! A seed it is! Grow it I will!', 'Thanks! Let the magical mystery of bean-growing commence!'],
});

const DEAD_CLEAR_RESPONSE = Object.freeze({
  trant_bean_dead: 'clear_bean_tree',
  trant_bubble_dead: 'clear_bubble_tree',
  trant_egg_dead: 'clear_egg_plant',
  trant_fruit_dead: 'clear_fruit_tree',
  trant_gas_dead: 'clear_gas_plant',
  trant_spice_dead: 'clear_spice_plant',
});

const HOES = Object.freeze(['high_class_hoe', 'hoe']);
const SHOVELS = Object.freeze(['shovel', 'ace_of_spades']);
const HATCHETS = Object.freeze(['hatchet', 'class_axe']);

export const NO_SEASONED_BEAN_MSG =
  'But what to plant? You need a *seasoned* bean. Plain beans will not work, so ask a friend where to find a seasoned one.';

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function whole(value, fallback = 0, min = 0, max = Number.MAX_SAFE_INTEGER) {
  const n = Math.floor(Number(value));
  return Math.max(min, Math.min(max, Number.isFinite(n) ? n : fallback));
}

function time(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

export function stableSoilHash(value) {
  let h = 2166136261;
  for (const char of String(value || '')) {
    h ^= char.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** GSJS randInt(min, max), inclusive. */
function randInt(min, max, rng) {
  return min + Math.floor(rng() * (max - min + 1));
}

/** GSJS sendResponse picks one line at random from the pool. */
export function soilResponse(key, rng = Math.random) {
  const pool = SOIL_RESPONSES[key];
  if (!pool?.length) return '';
  return pool[Math.min(pool.length - 1, Math.floor(rng() * pool.length))];
}

function count(inv, classTsid) {
  return Math.max(0, Math.floor(Number(inv?.[classTsid]) || 0));
}

function patchKindFor(classTsid) {
  return classTsid === 'patch_dark' || classTsid === 'trant_egg_dead' ? 'patch_dark' : 'patch';
}

// ---------------------------------------------------------------------------
// Skill packages
// ---------------------------------------------------------------------------

/** Highest Soil Appreciation row the player knows for a package. */
export function resolveSoilPackage(packageId, skills = []) {
  const pkg = SOIL_SKILL_PACKAGES[packageId];
  if (!pkg) return null;
  const learned = list(skills);
  for (const rank of [5, 4, 3, 2, 1]) {
    const id = `soil_appreciation_${rank}`;
    if (pkg[id] && learned.includes(id)) return { ...pkg[id], id };
  }
  return { ...pkg.no_skill, id: 'no_skill' };
}

/** Tend package with the hoeing upgrade override applied (xp bonus + wear multiplier). */
export function resolveTendPackage(skills = [], upgrades = []) {
  const pkg = resolveSoilPackage('soil_appreciation', skills);
  let wearMultiplier = 1;
  if (list(upgrades).includes(HOEING_UPGRADE)) {
    const learned = list(skills);
    const row = HOEING_UPGRADE_TABLE.find((r) => r.skill === null || learned.includes(r.skill));
    pkg.xp_bonus = row.xp;
    wearMultiplier = row.wear;
  }
  return { ...pkg, wearMultiplier };
}

/** Roll a catalog drop table (nested tables resolve recursively). */
export function rollSoilDropTable(tableId, rng = Math.random, depth = 0) {
  const table = SOIL_DROP_TABLES[tableId];
  if (!table || depth > 3) return [];
  const roll = randInt(0, 100, rng);
  for (const [threshold, entries] of table) {
    if (roll > threshold) continue;
    const out = [];
    for (const entry of entries) {
      if (entry.table) out.push(...rollSoilDropTable(entry.table, rng, depth + 1));
      else out.push({ ...entry });
    }
    return out;
  }
  return [];
}

// ---------------------------------------------------------------------------
// Planting rules
// ---------------------------------------------------------------------------

export function plantingHub(hubId) {
  const n = Number(hubId);
  if (!Number.isFinite(n)) return null;
  return PLANT_HUB_ALIASES[n] ?? n;
}

/** patch.js canPlant: Dark Patches only take Egg Plant beans; Patches never do. */
export function canPlantBean(beanClass, patchKind, hubId) {
  const bean = SEASONED_BEANS[beanClass];
  if (!bean) return false;
  // patch.js canPlant: "everything is ok in new POLs" (home streets).
  if (hubId === 'home') return true;
  if (patchKind === 'patch_dark') return bean.trantClass === 'trant_egg';
  if (bean.trantClass === 'trant_egg') return false;
  const hub = plantingHub(hubId);
  return hub != null && list(CAN_PLANT_MAPPINGS[bean.trantClass]).includes(hub);
}

/** Every seasoned bean in the pack, with whether it will grow in this patch. */
export function plantChoices(inv, patchKind, hubId) {
  return Object.keys(SEASONED_BEANS)
    .filter((beanClass) => count(inv, beanClass) > 0)
    .map((beanClass) => {
      const ok = canPlantBean(beanClass, patchKind, hubId);
      return {
        beanClass,
        label: SEASONED_BEANS[beanClass].label,
        trantClass: SEASONED_BEANS[beanClass].trantClass,
        count: count(inv, beanClass),
        ok,
        reason: ok ? '' : 'That bean will not grow here.',
      };
    });
}

/** Deterministic hub-legal tree for an archived Seedling whose bean was not preserved. */
export function archivedSeedlingTrant(hubId, seed = '') {
  const hub = plantingHub(hubId);
  const options = Object.entries(CAN_PLANT_MAPPINGS)
    .filter(([trant, hubs]) => trant !== 'wood_tree' && hubs.includes(hub))
    .map(([trant]) => trant);
  const pool = options.length ? options : ['trant_bean'];
  return pool[stableSoilHash(seed) % pool.length];
}

/** patch_seedling.js setTimers / onPetted with the planter's upgrades. */
export function seedlingTimings(upgrades = []) {
  const owned = list(upgrades);
  for (const [id, row] of Object.entries(SEEDLING_GROW_UPGRADES)) {
    if (owned.includes(id)) return { minMs: row.minMinutes * 60000, growLevel: row.growLevel };
  }
  return { minMs: SOIL_TIMERS.seedlingMinMs, growLevel: 0 };
}

// ---------------------------------------------------------------------------
// Plot state
// ---------------------------------------------------------------------------

/**
 * @param {string} classTsid  patch | patch_dark | patch_seedling | trant_*_dead
 * @param {{ now?: number, hubId?: string|number, seed?: string }} [opts]
 */
export function createPlot(classTsid, opts = {}) {
  const now = time(opts.now, Date.now());
  const kind = patchKindFor(classTsid);
  const plot = {
    classTsid: SOIL_CLASSES.includes(classTsid) ? classTsid : 'patch',
    kind,
    stage: 'dirty',
    since: now,
    dueAt: 0,
    seedling: null,
    tree: null,
    deadClass: null,
  };
  if (DEAD_TRANT_CLASSES.includes(classTsid)) {
    plot.stage = 'dead';
    plot.deadClass = classTsid;
  } else if (classTsid === 'patch_seedling') {
    const trantClass = archivedSeedlingTrant(opts.hubId, opts.seed || '');
    plot.stage = 'seedling';
    plot.seedling = newSeedling(trantClass, '', now, []);
  }
  return plot;
}

function newSeedling(trantClass, beanClass, now, upgrades) {
  const timing = seedlingTimings(upgrades);
  return {
    trantClass,
    beanClass,
    plantedAt: now,
    minAt: now + timing.minMs,
    maxAt: now + SOIL_TIMERS.seedlingMaxMs,
    upgradeGrowLevel: timing.growLevel,
    petted: 0,
    petters: 0,
    growLevel: 0,
    thirdPetAt: 0,
  };
}

const STAGES = new Set(['dirty', 'clean', 'dug', 'seedling', 'tree', 'dead']);

/** Sanitize a saved plot in place-ish (returns a clean copy that keeps tree.state identity). */
export function normalizePlot(saved) {
  if (!saved || typeof saved !== 'object') return null;
  const classTsid = SOIL_CLASSES.includes(saved.classTsid) ? saved.classTsid : null;
  if (!classTsid) return null;
  const plot = {
    classTsid,
    kind: saved.kind === 'patch_dark' ? 'patch_dark' : 'patch',
    stage: STAGES.has(saved.stage) ? saved.stage : 'dirty',
    since: time(saved.since),
    dueAt: time(saved.dueAt),
    seedling: null,
    tree: null,
    deadClass: DEAD_TRANT_CLASSES.includes(saved.deadClass) ? saved.deadClass : null,
  };
  if (plot.stage === 'dead' && !plot.deadClass) plot.stage = 'dirty';
  if (plot.stage === 'seedling') {
    const s = saved.seedling || {};
    const trantClass = GROWN_TREE_LABELS[s.trantClass] ? s.trantClass : null;
    if (!trantClass) {
      plot.stage = 'dirty';
    } else {
      plot.seedling = {
        trantClass,
        beanClass: SEASONED_BEANS[s.beanClass] ? s.beanClass : '',
        plantedAt: time(s.plantedAt),
        minAt: time(s.minAt),
        maxAt: time(s.maxAt),
        upgradeGrowLevel: whole(s.upgradeGrowLevel, 0, 0, 10),
        petted: whole(s.petted, 0, 0, 99),
        petters: whole(s.petters, 0, 0, 99),
        growLevel: whole(s.growLevel, 0, 0, 10),
        thirdPetAt: time(s.thirdPetAt),
      };
    }
  }
  if (plot.stage === 'tree') {
    const t = saved.tree || {};
    const classId = GROWN_TREE_LABELS[t.classId] ? t.classId : null;
    if (!classId || !t.state || typeof t.state !== 'object') {
      plot.stage = 'dirty';
    } else {
      const state = t.state;
      if (classId === 'wood_tree') ensureWoodTreeState(state);
      else {
        state.classTsid = classId;
        state.maturity = whole(state.maturity, 1, 0, 10);
        state.health = whole(state.health, 7, 1, 10);
        state.fruitCount = whole(state.fruitCount, 0);
        state.harvestsToday = whole(state.harvestsToday, 0);
        state.petted = state.petted === true;
        state.watered = state.watered === true;
      }
      plot.tree = {
        classId,
        state,
        grownAt: time(t.grownAt),
        lastCycleAt: time(t.lastCycleAt),
        woodPetted: whole(t.woodPetted, 0),
        woodWatered: whole(t.woodWatered, 0),
        seenPetted: t.seenPetted === true,
        seenWatered: t.seenWatered === true,
        seenHarvests: whole(t.seenHarvests, whole(state?.totalHarvests, 0)),
        clearedAt: time(t.clearedAt),
        resetAt: time(t.resetAt, time(t.grownAt)),
      };
    }
  }
  return plot;
}

function setDirty(plot, now) {
  plot.stage = 'dirty';
  plot.since = now;
  plot.dueAt = 0;
  plot.seedling = null;
  plot.tree = null;
  plot.deadClass = null;
  plot.classTsid = plot.kind;
}

/** The living state game.js verbs act on once a seedling has grown. */
export function growTree(plot, now = Date.now()) {
  const seedling = plot.seedling;
  if (!seedling) return null;
  const classId = seedling.trantClass;
  const maturity = seedling.growLevel || GROWN_TRANT_START.maturity;
  const state = classId === 'wood_tree'
    ? ensureWoodTreeState({ maturity: Math.min(6, maturity) })
    : createTrantState(classId, { maturity, health: GROWN_TRANT_START.health });
  plot.stage = 'tree';
  plot.since = now;
  plot.dueAt = 0;
  plot.seedling = null;
  plot.tree = {
    classId,
    state,
    grownAt: now,
    lastCycleAt: now,
    woodPetted: 0,
    woodWatered: 0,
    seenPetted: false,
    seenWatered: false,
    seenHarvests: 0,
    clearedAt: 0,
    resetAt: now,
  };
  return plot.tree;
}

/** trants.js recalcCycles: minutes between maturity rolls. */
export function maturityCycleMs(maturity) {
  return (whole(maturity, 1, 0, 10) <= 1 ? 10 : 20) * SOIL_TIMERS.maturityIntervalMs;
}

/** trants.js onMaturityCycle grow chance (health >= 5 only). */
export function maturityGrowChance(maturity, health) {
  const m = whole(maturity, 1, 0, 10);
  const h = whole(health, 7, 0, 10);
  if (h < 5 || m >= 10) return 0;
  if (m <= 2) return h <= 6 ? 0.5 : h <= 9 ? 0.8 : 1.0;
  if (m <= 5) return h <= 6 ? 0.08 : h <= 8 ? 0.15 : h <= 9 ? 0.2 : 0.4;
  if (m <= 7) return h <= 6 ? 0.04 : h <= 8 ? 0.1 : h <= 9 ? 0.15 : 0.3;
  return h <= 6 ? 0.02 : h <= 8 ? 0.04 : h <= 9 ? 0.08 : 0.15;
}

function growLivingTree(tree, now, rng) {
  const state = tree.state;
  let grew = 0;
  let guard = 0;
  if (!Number.isFinite(tree.lastCycleAt)) tree.lastCycleAt = now;
  while (guard < SOIL_TIMERS.maxCatchUpCycles) {
    const next = tree.lastCycleAt + maturityCycleMs(state.maturity);
    if (next > now) break;
    tree.lastCycleAt = next;
    guard += 1;
    const chance = maturityGrowChance(state.maturity, state.health);
    if (chance && rng() < chance) {
      state.maturity = Math.min(10, state.maturity + 1);
      state.fruitCapacity = fruitCapacityAt(tree.classId, state.maturity, state.health);
      grew += 1;
    }
  }
  if (guard >= SOIL_TIMERS.maxCatchUpCycles) tree.lastCycleAt = now;
  return grew;
}

/**
 * wood_tree.js care growth: each new petting/watering counts; once both are
 * done and both counts reach maturityMap[m-1], the tree gains one maturity.
 * A harvest the tree survives zeroes both counts.
 */
export function noteWoodTreeCare(tree) {
  if (!tree || tree.classId !== 'wood_tree') return false;
  const state = ensureWoodTreeState(tree.state);
  let changed = false;
  if (state.petted && !tree.seenPetted) {
    tree.woodPetted += 1;
    changed = true;
  }
  if (state.watered && !tree.seenWatered) {
    tree.woodWatered += 1;
    changed = true;
  }
  tree.seenPetted = state.petted;
  tree.seenWatered = state.watered;
  // endHarvest zeroes both counts when the tree survives the harvest.
  const harvests = Math.max(0, Math.floor(Number(state.totalHarvests) || 0));
  if (harvests !== (tree.seenHarvests ?? harvests)) {
    if (state.maturity > 0 && (tree.woodPetted || tree.woodWatered)) {
      tree.woodPetted = 0;
      tree.woodWatered = 0;
      changed = true;
    }
  }
  tree.seenHarvests = harvests;
  if (changed && state.petted && state.watered && state.maturity >= 1 && state.maturity < 6) {
    const need = WOOD_TREE_MATURITY_MAP[state.maturity - 1];
    if (tree.woodPetted >= need && tree.woodWatered >= need) {
      state.maturity += 1;
      state.harvestCount = 0;
      tree.woodPetted = 0;
      tree.woodWatered = 0;
      return 'grew';
    }
  }
  return changed;
}

/**
 * Advance timers. Returns { changed, events } where events name what happened
 * (`regrew`, `filled`, `grew`, `withered`, `matured`, `woodCleared`).
 * @param {object} plot
 * @param {number} now
 * @param {{ rng?: () => number }} [ctx]
 */
export function tickPlot(plot, now = Date.now(), ctx = {}) {
  const rng = ctx.rng || Math.random;
  const events = [];
  if (!plot) return { changed: false, events };
  if ((plot.stage === 'clean' || plot.stage === 'dug') && plot.dueAt && now >= plot.dueAt) {
    events.push(plot.stage === 'clean' ? 'regrew' : 'filled');
    setDirty(plot, plot.dueAt);
  }
  if (plot.stage === 'seedling' && plot.seedling) {
    const s = plot.seedling;
    const readyAt = Math.max(s.minAt, s.thirdPetAt || Infinity);
    if (s.petted >= SOIL_TIMERS.seedlingPets && readyAt <= now && readyAt <= s.maxAt) {
      growTree(plot, readyAt);
      events.push('grew');
    } else if (now >= s.maxAt) {
      // patch_seedling.js onMaxTimePassed -> replaceWithPatch (dark for egg plants)
      plot.kind = s.trantClass === 'trant_egg' ? 'patch_dark' : plot.kind;
      setDirty(plot, s.maxAt);
      events.push('withered');
    }
  }
  if (plot.stage === 'tree' && plot.tree) {
    const tree = plot.tree;
    if (tree.classId === 'wood_tree') {
      const care = noteWoodTreeCare(tree);
      if (care === 'grew') events.push('matured');
      else if (care) events.push('cared');
      const state = tree.state;
      if (state.maturity <= 0) {
        if (!tree.clearedAt) tree.clearedAt = now;
        if (now - tree.clearedAt >= SOIL_TIMERS.woodToPatchMs) {
          setDirty(plot, now);
          events.push('woodCleared');
        }
      }
    } else if (growLivingTree(tree, now, rng) > 0) {
      events.push('matured');
    }
  }
  return { changed: events.length > 0, events };
}

/**
 * New game day: grown trees refresh like the street's own trees. Trees on
 * streets not loaded at midnight catch up with `resetPlotDayIfStale`.
 */
export function resetPlotDay(plot, rng = Math.random, now = Date.now()) {
  if (plot?.stage !== 'tree' || !plot.tree) return false;
  const tree = plot.tree;
  tree.resetAt = now;
  if (tree.classId === 'wood_tree') resetWoodTreeDay(tree.state);
  else {
    resetTrantDay(tree.state);
    refillFruit(tree.state, 0.55 + rng() * 0.25);
  }
  tree.seenPetted = false;
  tree.seenWatered = false;
  return true;
}

/** Apply a missed new-day refresh (the day boundary passed while the street was unloaded). */
export function resetPlotDayIfStale(plot, lastNewDayAt, rng = Math.random, now = Date.now()) {
  if (plot?.stage !== 'tree' || !plot.tree || !lastNewDayAt) return false;
  if ((plot.tree.resetAt || 0) >= lastNewDayAt) return false;
  return resetPlotDay(plot, rng, now);
}

// ---------------------------------------------------------------------------
// Verbs
// ---------------------------------------------------------------------------

function findWorkingTool(candidates, inv, toolState, wear) {
  const owned = candidates.filter((id) => count(inv, id) > 0);
  if (!owned.length) return { tool: null, owned: false };
  for (const id of owned) {
    if (!toolState || canUseTool(toolState, id, Math.max(1, wear)).ok) return { tool: id, owned: true };
  }
  return { tool: null, owned: true };
}

function energyOk(pc, cost) {
  // players/inc_skill_packages.js: energy must be strictly above the cost
  return (Number(pc?.energy) || 0) > cost;
}

function verbRow(id, label, extra = {}) {
  return { id, label, enabled: true, reason: '', tooltip: '', durationMs: 0, energy: 0, ...extra };
}

/** Quote the tend / dig / plant / pet / clear verbs for a plot without mutating anything. */
export function plotVerbs(plot, ctx = {}) {
  if (!plot) return [];
  const { inv = {}, pc = {}, skills = [], upgrades = [], toolState = null, hubId = null } = ctx;
  if (plot.stage === 'tree') return [];

  if (plot.stage === 'dead') {
    const pkg = resolveSoilPackage('dead_trant_clearing', skills);
    const hatchet = findWorkingTool(HATCHETS, inv, toolState, pkg.tool_wear);
    const row = verbRow('clear', 'Clear', {
      tooltip: 'Chop it up for Planks',
      durationMs: pkg.duration,
      energy: pkg.energy_cost,
    });
    if (!hatchet.tool) Object.assign(row, { enabled: false, reason: "You'll need a working Hatchet." });
    else if (!energyOk(pc, pkg.energy_cost)) Object.assign(row, { enabled: false, reason: "You don't have enough energy." });
    return [row];
  }

  if (plot.stage === 'seedling') {
    const petted = plot.seedling?.petted || 0;
    const row = verbRow('pet', 'Pet', { tooltip: 'Help it grow up', energy: 2 });
    if (petted >= SOIL_TIMERS.seedlingPets) Object.assign(row, { enabled: false, reason: "That's enough, thnx." });
    else if ((Number(pc.energy) || 0) < 2) Object.assign(row, { enabled: false, reason: "You don't have enough energy." });
    else if (petted === 2) row.tooltip = 'Help it grow up (one more petting)';
    return [row];
  }

  const out = [];
  const messy = plot.stage === 'dirty';
  const dug = plot.stage === 'dug';

  const tend = resolveTendPackage(skills, upgrades);
  const tendWear = tend.tool_wear * tend.wearMultiplier;
  const hoe = findWorkingTool(HOES, inv, toolState, tendWear);
  const tendRow = verbRow('tend', 'Tend', {
    tooltip: `Weed & prepare for planting. Costs ${tend.energy_cost} energy and gives ${tend.mood_bonus} mood`,
    durationMs: tend.duration,
    energy: tend.energy_cost,
  });
  if (!hoe.tool) Object.assign(tendRow, { enabled: false, reason: 'You need a working hoe.' });
  else if (!messy || dug) Object.assign(tendRow, { enabled: false, reason: 'Nope, no tending needed.' });
  else if (!energyOk(pc, tend.energy_cost)) Object.assign(tendRow, { enabled: false, reason: "You don't have enough energy." });
  out.push(tendRow);

  const plantable = plantChoices(inv, plot.kind, hubId);
  if (plantable.length && (messy || dug)) {
    // One row until the soil is ready; the bean choices appear once it is tended.
    out.push(verbRow('plant', 'Plant', {
      tooltip: 'Plant a Seasoned Bean',
      enabled: false,
      reason: messy ? 'You should probably tend to the weeds first.' : 'You need to wait for the hole to fill in first.',
    }));
  } else if (plantable.length) {
    for (const choice of plantable) {
      const row = verbRow(`plant:${choice.beanClass}`, `Plant ${choice.label}`, {
        tooltip: `${choice.count} in your pack. Grows a ${GROWN_TREE_LABELS[choice.trantClass]}.`,
        icon: choice.beanClass,
      });
      if (!choice.ok) Object.assign(row, { enabled: false, reason: `${choice.reason} Beans only grow in certain regions. Like attracts like.` });
      out.push(row);
    }
  } else {
    out.push(verbRow('plant', 'Plant', { tooltip: 'Or, drag a bean to the patch', enabled: false, reason: NO_SEASONED_BEAN_MSG }));
  }

  const dig = resolveSoilPackage('dig_patch', skills);
  const shovel = findWorkingTool(SHOVELS, inv, toolState, dig.tool_wear);
  const digRow = verbRow('dig', 'Dig', {
    tooltip: `Obtain some earth. Costs ${dig.energy_cost} energy`,
    durationMs: dig.duration,
    energy: dig.energy_cost,
  });
  if (!shovel.tool) Object.assign(digRow, { enabled: false, reason: 'You need a working shovel.' });
  else if (dug) Object.assign(digRow, { enabled: false, reason: 'There is already a hole there.' });
  else if (!energyOk(pc, dig.energy_cost)) Object.assign(digRow, { enabled: false, reason: "You don't have enough energy." });
  out.push(digRow);
  return out;
}

function fail(verbId, msg, extra = {}) {
  return { ok: false, verbId, msgs: [msg], msg, outputs: [], counters: [], costs: {}, ...extra };
}

function applyCosts(pc, costs) {
  if (costs.energy) pc.energy = Math.max(0, (Number(pc.energy) || 0) - costs.energy);
  if (costs.mood) {
    const cap = Number.isFinite(pc.maxMood) ? pc.maxMood : 100;
    pc.mood = Math.min(cap, (Number(pc.mood) || 0) + costs.mood);
  }
  if (costs.xp) {
    if (pc.imagination != null) pc.imagination = (Number(pc.imagination) || 0) + costs.xp;
    if (pc.xp != null) pc.xp = (Number(pc.xp) || 0) + costs.xp;
  }
  if (costs.currants) pc.currants = (Number(pc.currants) || 0) + costs.currants;
}

function addInv(inv, classTsid, qty) {
  inv[classTsid] = count(inv, classTsid) + qty;
}

function verbCounters(classTsid, verb) {
  // items/item.js notifyVerb
  return [
    { counter: `${classTsid}:${verb}`, amount: 1 },
    { counter: `VERB:${verb}:${classTsid}`, amount: 1 },
  ];
}

function splitDrops(drops) {
  const items = [];
  let currants = 0;
  for (const drop of drops) {
    if (drop.currants) currants += drop.currants;
    else if (drop.classTsid) items.push({ classTsid: drop.classTsid, qty: drop.qty || 1 });
  }
  return { items, currants };
}

/**
 * Perform one verb. Gates first; plot, pack, pc and tool condition mutate
 * together only on success.
 * @param {object} plot
 * @param {string} verbId  tend | dig | plant:<bean_class> | pet | clear
 * @param {{ inv, pc, skills?, upgrades?, buffs?, toolState?, hubId?, now?, rng?, owner?: boolean }} ctx
 */
export function performPlotVerb(plot, verbId, ctx = {}) {
  const { inv = {}, pc = {}, skills = [], upgrades = [], buffs = [], toolState = null, hubId = null } = ctx;
  const now = time(ctx.now, Date.now());
  const rng = ctx.rng || Math.random;
  const maxLuck = list(buffs).includes('max_luck');
  const [verb, arg] = String(verbId || '').split(':');
  const quotes = plotVerbs(plot, ctx);
  const quote = quotes.find((row) => row.id === verbId) || (verb === 'plant' ? quotes.find((row) => row.id === 'plant') : null);
  if (!quote) return fail(verbId, 'Nothing to do here.');
  if (!quote.enabled) return fail(verbId, quote.reason, { reason: 'gated' });

  if (verb === 'tend') {
    const pkg = resolveTendPackage(skills, upgrades);
    const wear = pkg.tool_wear * pkg.wearMultiplier;
    const { tool } = findWorkingTool(HOES, inv, toolState, wear);
    // inc_skill_packages.js: a failed success roll returns before any cost
    if (pkg.success_rate < 100 && !maxLuck && rng() >= pkg.success_rate / 100) {
      return fail('tend', 'Oops! That didn\'t work. Try again?', {
        reason: 'roll',
        response: soilResponse('tend_failed', rng),
        sound: 'CLICK_FAILURE',
      });
    }
    const costs = { energy: pkg.energy_cost, mood: pkg.mood_bonus || 0, xp: pkg.xp_bonus || 0 };
    let drops = [];
    if (pkg.drop_class_id) {
      const chance = Math.min(100, pkg.drop_chance * (list(buffs).includes('rubeweed') ? 1.25 : 1));
      if (maxLuck || rng() < chance / 100) drops = rollSoilDropTable(pkg.drop_class_id, rng);
    }
    const { items, currants } = splitDrops(drops);
    costs.currants = currants;
    const toolUse = toolState ? useToolCondition(toolState, tool, wear) : null;
    applyCosts(pc, costs);
    for (const item of items) addInv(inv, item.classTsid, item.qty);
    plot.stage = 'clean';
    plot.since = now;
    plot.dueAt = now + SOIL_TIMERS.cleanRegrowMs;
    const counters = [
      ...verbCounters(plot.kind, 'tend'),
      { counter: 'patches:tended', amount: 1 },
    ];
    if (items.some((item) => item.classTsid.startsWith('musicblock_'))) {
      counters.push({ counter: `skill_package_drop:${plot.kind}`, amount: 1 });
    }
    return {
      ok: true,
      verbId: 'tend',
      tool,
      toolUse,
      costs,
      outputs: items,
      counters,
      response: soilResponse(drops.length ? 'tend_drop' : 'tend_na_sa1_sa5', rng),
      activity: 'You tended a Patch.',
      msgs: [],
    };
  }

  if (verb === 'dig') {
    const pkg = resolveSoilPackage('dig_patch', skills);
    const { tool } = findWorkingTool(SHOVELS, inv, toolState, pkg.tool_wear);
    const costs = { energy: pkg.energy_cost, xp: pkg.xp_bonus || 0 };
    let drops = [];
    if (pkg.drop_class_id) {
      const chance = Math.min(100, pkg.drop_chance * (list(buffs).includes('rubeweed') ? 1.25 : 1));
      if (maxLuck || rng() < chance / 100) drops = rollSoilDropTable(pkg.drop_class_id, rng);
    }
    const { items } = splitDrops(drops);
    const outputs = items.length ? items : [{ classTsid: 'earth', qty: pkg.bonus_amount }];
    const toolUse = toolState ? useToolCondition(toolState, tool, pkg.tool_wear) : null;
    applyCosts(pc, costs);
    for (const item of outputs) addInv(inv, item.classTsid, item.qty);
    plot.stage = 'dug';
    plot.since = now;
    plot.dueAt = now + SOIL_TIMERS.dugFillMs;
    const loam = items.reduce((sum, item) => sum + (item.classTsid === 'loam' ? item.qty : 0), 0);
    const counters = [
      ...verbCounters(plot.kind, 'dig'),
      { counter: 'patches:dug', amount: 1 },
      { counter: 'dug:dirt', amount: 1 },
      loam
        ? { counter: 'soil_dug:loam', amount: loam }
        : { counter: 'soil_dug:earth', amount: pkg.bonus_amount },
    ];
    return {
      ok: true,
      verbId: 'dig',
      tool,
      toolUse,
      costs,
      outputs,
      counters,
      response: soilResponse(items.length ? 'dig_loam_drop' : 'dig_na_sa1_sa5', rng),
      activity: 'You dug a Patch.',
      msgs: [],
    };
  }

  if (verb === 'plant') {
    const beanClass = arg;
    const bean = SEASONED_BEANS[beanClass];
    if (!bean || count(inv, beanClass) < 1) return fail(verbId, NO_SEASONED_BEAN_MSG);
    inv[beanClass] = count(inv, beanClass) - 1;
    plot.stage = 'seedling';
    plot.since = now;
    plot.dueAt = 0;
    plot.seedling = newSeedling(bean.trantClass, beanClass, now, upgrades);
    const hub = Number(hubId);
    const counters = [
      ...verbCounters(plot.kind, 'plant'),
      { counter: 'patches:planted', amount: 1 },
      { counter: `beans_planted:${beanClass}`, amount: 1 },
    ];
    if (Number.isFinite(hub)) counters.push({ counter: `hub_bean_planted:${hub}`, amount: 1 });
    return {
      ok: true,
      verbId: 'plant',
      beanClass,
      trantClass: bean.trantClass,
      costs: {},
      outputs: [],
      consumed: [{ classTsid: beanClass, qty: 1 }],
      counters,
      response: soilResponse('plant_bean', rng),
      activity: 'You planted that bean real good. Congrats!',
      msgs: [],
    };
  }

  if (verb === 'pet') {
    const s = plot.seedling;
    if (!s) return fail('pet', 'There is nothing here to pet.');
    const costs = { energy: 2, xp: 0 };
    s.petted += 1;
    costs.xp = randInt(1, 5, rng);
    const counters = [
      ...verbCounters('patch_seedling', 'pet').filter((row) => row.counter !== 'patch_seedling:pet'),
      { counter: `seedlings_petted:${s.trantClass}`, amount: 1 },
    ];
    // Quest seedlings_petted counts each seedling once (this.petters[pc.tsid]).
    if (s.petters < 1) {
      s.petters = 1;
      counters.push({ counter: 'patch_seedling:pet', amount: 1 });
    }
    let response;
    if (s.petted === SOIL_TIMERS.seedlingPets) {
      response = soilResponse('pet_3rd_time', rng);
      s.thirdPetAt = now;
      s.growLevel = s.upgradeGrowLevel || 0;
      // quests_inc_counter('seedlings_fully_petted') when the planter does the third petting
      if (ctx.owner !== false) counters.push({ counter: 'patch_seedling:grown', amount: 1 });
    } else {
      response = soilResponse('pet_1st_2nd_time', rng);
    }
    applyCosts(pc, costs);
    let grew = false;
    if (s.petted >= SOIL_TIMERS.seedlingPets && now >= s.minAt) {
      growTree(plot, now);
      grew = true;
    }
    return {
      ok: true,
      verbId: 'pet',
      costs,
      outputs: [],
      counters,
      response,
      grew,
      petted: grew ? SOIL_TIMERS.seedlingPets : s.petted,
      activity: grew ? 'You pet a Seedling. It grew into a tree!' : 'You pet a Seedling.',
      msgs: [],
    };
  }

  if (verb === 'clear') {
    const pkg = resolveSoilPackage('dead_trant_clearing', skills);
    const { tool } = findWorkingTool(HATCHETS, inv, toolState, pkg.tool_wear);
    const deadClass = plot.deadClass;
    const costs = { energy: pkg.energy_cost, xp: pkg.xp_bonus || 0 };
    const toolUse = toolState ? useToolCondition(toolState, tool, pkg.tool_wear) : null;
    applyCosts(pc, costs);
    addInv(inv, 'plank', pkg.bonus_amount);
    plot.kind = patchKindFor(deadClass);
    setDirty(plot, now);
    return {
      ok: true,
      verbId: 'clear',
      tool,
      toolUse,
      deadClass,
      costs,
      outputs: [{ classTsid: 'plank', qty: pkg.bonus_amount }],
      counters: [
        ...verbCounters(deadClass, 'clear'),
        { counter: `dead_trants_cleared:${deadClass}`, amount: 1 },
      ],
      response: soilResponse(DEAD_CLEAR_RESPONSE[deadClass], rng),
      activity: `You cleared a ${SOIL_LABELS[deadClass]}. Only a ${SOIL_LABELS[plot.kind]} remains.`,
      msgs: [],
    };
  }

  return fail(verbId, 'Nothing to do here.');
}

// ---------------------------------------------------------------------------
// Presentation helpers
// ---------------------------------------------------------------------------

function minutesLeft(at, now) {
  const ms = Math.max(0, at - now);
  if (ms < 60000) return `${Math.max(1, Math.ceil(ms / 1000))}s`;
  if (ms < 3600000) return `${Math.ceil(ms / 60000)} min`;
  return `${Math.floor(ms / 3600000)} h ${Math.ceil((ms % 3600000) / 60000)} min`;
}

export function plotLabel(plot) {
  if (!plot) return 'Patch';
  if (plot.stage === 'dead') return SOIL_LABELS[plot.deadClass] || 'Dead Tree';
  if (plot.stage === 'seedling') return 'Seedling';
  if (plot.stage === 'tree') return GROWN_TREE_LABELS[plot.tree?.classId] || 'Tree';
  return SOIL_LABELS[plot.kind] || 'Patch';
}

export function plotStatusLabel(plot, now = Date.now()) {
  if (!plot) return '';
  switch (plot.stage) {
    case 'dirty':
      return plot.kind === 'patch_dark' ? 'Weedy · tend with a Hoe, plant an Egg Plant Bean' : 'Weedy · tend with a Hoe, then plant a Seasoned Bean';
    case 'clean':
      return `Tended · ready for a bean · weeds return in ${minutesLeft(plot.dueAt, now)}`;
    case 'dug':
      return `A hole · fills in ${minutesLeft(plot.dueAt, now)}`;
    case 'seedling': {
      const s = plot.seedling;
      const tree = GROWN_TREE_LABELS[s?.trantClass] || 'tree';
      if (!s) return '';
      if (s.petted < SOIL_TIMERS.seedlingPets) return `Growing a ${tree} · petted ${s.petted}/${SOIL_TIMERS.seedlingPets}`;
      if (now < s.minAt) return `Growing a ${tree} · sprouting in ${minutesLeft(s.minAt, now)}`;
      return `Growing a ${tree} · any moment now`;
    }
    case 'dead':
      return 'Clear it with a Hatchet for Planks';
    default:
      return '';
  }
}

/** Sprite file for a plot stage (trees are drawn from the shared trant frames). */
export function plotArtPath(plot) {
  if (!plot) return `${SOIL_SPRITE_ROOT}/patch-dirty.png`;
  if (plot.stage === 'dead') return `${SOIL_SPRITE_ROOT}/${plot.deadClass.replace(/_/g, '-')}.png`;
  if (plot.stage === 'seedling') return `${SOIL_SPRITE_ROOT}/patch-seedling.png`;
  const prefix = plot.kind === 'patch_dark' ? 'patch-dark' : 'patch';
  const stage = plot.stage === 'clean' || plot.stage === 'dug' ? plot.stage : 'dirty';
  return `${SOIL_SPRITE_ROOT}/${prefix}-${stage}.png`;
}

export function soilSpritePaths() {
  const out = new Set();
  for (const kind of ['patch', 'patch-dark']) for (const stage of ['dirty', 'clean', 'dug']) out.add(`${SOIL_SPRITE_ROOT}/${kind}-${stage}.png`);
  out.add(`${SOIL_SPRITE_ROOT}/patch-seedling.png`);
  for (const dead of DEAD_TRANT_CLASSES) out.add(`${SOIL_SPRITE_ROOT}/${dead.replace(/_/g, '-')}.png`);
  return [...out];
}

/** Capped per-street spawn list from the ecology catalog's `soil` counts. */
export const SOIL_SPAWN_CAPS = Object.freeze({
  patch: 8,
  patch_dark: 6,
  patch_seedling: 1,
  trant_bean_dead: 2,
  trant_bubble_dead: 2,
  trant_egg_dead: 2,
  trant_fruit_dead: 2,
  trant_gas_dead: 2,
  trant_spice_dead: 2,
});

export function soilSpawnClasses(counts = {}) {
  const out = [];
  for (const classTsid of SOIL_CLASSES) {
    const n = Math.min(whole(counts?.[classTsid], 0), SOIL_SPAWN_CAPS[classTsid] || 2);
    for (let i = 0; i < n; i += 1) out.push(classTsid);
  }
  return out;
}
