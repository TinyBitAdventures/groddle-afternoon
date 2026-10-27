/**
 * Harvestable world resource nodes: Fireflies, Salmon, Mortar Barnacles, Ice
 * Nubbins, Jellisac Growths, Dirt Piles, Peat Bogs, Paper Trees, Sloths, and
 * Dust Traps.
 *
 * Pure, data-driven reimplementation of Tiny Speck's GameServerJS (CC0) design
 * data. No Rhino APIs; every mutation is explicit and atomic.
 *
 * Sources (glitch-GameServerJS/items/):
 *   npc_firefly.js, firefly_jar.js (verb `open`, 7-fly jar, whistle energy),
 *   npc_salmon.js, salmon.js, boot.js (verb `pocket`, 10% boot),
 *   mortar_barnacle.js, barnacle.js, scraper.js, super_scraper.js (verb `scrape`),
 *   ice_knob.js, ice.js, include/scraping.js (verb `scrape`, getIceAmount),
 *   jellisac.js, jellisac_clump.js (verb `scoop`),
 *   dirt_pile.js, earth.js, loam.js, shovel.js, ace_of_spades.js (verb `dig`),
 *   peat_1.js / peat_2.js / peat_3.js (peat_base), peat.js (verb `harvest`),
 *   paper_tree.js, paper.js (verbs `harvest`, `water`, `pet`),
 *   npc_sloth.js, sloth_knocker.js, snail.js, metal_rod.js (verbs `knock`, `feed`),
 *   dust_trap.js + catalog_drop_tables.js `dust_trap` (collision `trigger`),
 *   catalog_skill_packages.js (scraping, ice_scraping, jellisac_scooping,
 *   dig_dirt_pile, peat_harvest, paper_tree_water, paper_tree_pet),
 *   players/inc_skill_packages.js (rank selection, img upgrades, energy gate,
 *   drop-table roll).
 *
 * ---------------------------------------------------------------------------
 * API
 *   RESOURCE_NODE_CATALOG[classTsid]  label, verbs[], stock, regrow/respawn,
 *                                     placement, art + sprite sheets, source
 *   RESOURCE_NODE_ALIASES             peat_2/peat_3 -> peat_1 (variants)
 *   RESOURCE_SKILL_PACKAGES           verbatim GSJS skill package subset
 *   RESOURCE_ITEM_DEFS                GSJS label/desc/baseCost/stackMax/isTool
 *   resolveResourceSkillPackage(name, skills, upgrades)
 *   createResourceNode(classTsid, { variant?, seed?, units?, now? })
 *   tickResourceNode(node, now?, rng?)            -> true when state changed
 *   resourceNodeVerbs(node, inv, pc, ctx?)         -> [{ id, label, enabled, reason, message, ... }]
 *   harvestResourceNode(node, inv, pc, ctx)        -> result (see below)
 *   resourceNodeStatusLabel(node, now?)
 *   resourceNodeFrame(node, now?)                  -> { art, sheet, frameIndex, ... }
 *   isResourceNodeHarvestable(node)
 *   normalizeResourceNode(saved)                   -> node | null
 *   normalizeResourceNodes(list)                   -> node[]
 *   createFireflyJarState(seed?), normalizeFireflyJarState(seed?)
 *   fireflyJarSheet(flies, state)
 *   ensureResourceItems(), starterResourceTools(), resourceVendorOffers()
 *   SALMON_RELEASE, salmonReleaseConditions({ hubId, salmonCount }),
 *   releaseSalmon(inv, pc, { hubId, salmonCount }), pickReleasedSalmon(rows, x),
 *   respawnReleasedSalmon(node), swimmingSalmonCount(rows)   (salmon.js release)
 *
 * ctx for verbs/harvest:
 *   { verbId?, skills?|learned?, upgrades?, achievements?, toolState?, rng?,
 *     now?, dayKey?, jar?, nearby?, requireSkill?, requireAchievement? }
 *   - skills: learned skill ids (e.g. 'jellisac_hands_1', 'soil_appreciation_3',
 *     'bogspecialization_1', 'animalkinship_3').
 *   - upgrades: imagination upgrade ids (e.g. 'ice_scraping_yield').
 *   - achievements: achievement ids (Firefly Jar needs 'firefly_whistling').
 *   - toolState: tools.js condition state; wear is spent only on success.
 *   - jar: firefly jar state { flies } (mutated on success; created if absent
 *     and returned as result.jar).
 *   - nearby: other firefly nodes in whistle range (GSJS radius 500px).
 *
 * Harvest result (mirrors mining.js mineRock):
 *   { ok, reason, message, msgs[], classTsid, verbId,
 *     outputs: [{ classTsid, qty }], costs: { energy, mood, xp, toolWear },
 *     effects: { energy, mood, xp, img, activityLine }, toolUsed, toolUse,
 *     durationMs, achievementCounters: [{ counter, amount }], node, ... }
 *   Failures never mutate node, inventory, pc, tool state, or jar.
 *
 * Timing: durationMs values are the original GSJS progress durations; regrow
 * and respawn timers are the original GSJS timers. The lead may scale them.
 * ---------------------------------------------------------------------------
 */

import {
  addItem,
  removeItem,
  countItem,
  ensureItem,
  ITEM_CATALOG,
} from './inventory.js?v=catalog-unified-7';
import { canUseTool, useToolCondition } from './tools.js?v=woodcutting-test-3';
import { getGameDayKey } from './game-day.js?v=dametime-4';
import { grantMoodXp } from './mood-xp.js';
import { metabolicGain, moodMax, loseEnergy, loseMood } from './metabolics.js';

export const RESOURCE_NODES_SOURCE = 'tinyspeck/glitch-GameServerJS CC0';
export const RESOURCE_SPRITE_ROOT = 'assets/sprites/resources';
export const FIREFLY_JAR_MAX = 7;
export const FIREFLY_WHISTLE_ACHIEVEMENT = 'firefly_whistling';

// ---------------------------------------------------------------------------
// Skill packages (verbatim subset of catalog_skill_packages.js)
// ---------------------------------------------------------------------------

export const RESOURCE_SKILL_PACKAGES = Object.freeze({
  scraping: {
    name: 'Barnacle Scraping',
    skills: {
      no_skill: { rank: -1, duration: 4000, success_rate: 100, energy_cost: 2, tool_wear: 1, xp_bonus: 2, bonus_amount: 1 },
    },
    img_upgrades: {
      barnacle_scraping_drop_1: { rank: '0', drop_class_id: 'barnacle_scraping', drop_chance: 6, bonus_amount: 1 },
      barnacle_scraping_speed_1: { rank: '0', duration_multiplier: 0.5 },
    },
  },
  ice_scraping: {
    name: 'Ice Scraping',
    skills: {
      no_skill: { rank: -1, duration: 4000, success_rate: 100, energy_cost: 4, tool_wear: 2, xp_bonus: 3, bonus_amount: 1, bonus_chance: 1 },
    },
    img_upgrades: {
      barnacle_scraping_speed_1: { rank: '0', duration_multiplier: 0.5 },
    },
  },
  jellisac_scooping: {
    name: 'Jellisac Scooping',
    skills: {
      no_skill: { rank: -1, duration: 4000, success_rate: 100, energy_cost: 6, xp_bonus: 1, bonus_amount: 1 },
      jellisac_hands_1: {
        rank: '0', duration: 2000, success_rate: 100, energy_cost: 5, xp_bonus: 3,
        drop_class_id: 'jellisac_scooping', drop_chance: 4, bonus_amount: 1, bonus_multiplier: 4, bonus_chance: 0.07,
      },
    },
    img_upgrades: {
      jellisac_hands_drop_1: { rank: '0', drop_class_id: 'jellisac_scooping', drop_chance: 8, bonus_multiplier: 4, bonus_chance: 0.07 },
      jellisac_hands_speed_1: { rank: '1', duration_multiplier: 0.5, bonus_chance: 0.07 },
      jellisac_hands_speed_2: { rank: '2', duration_multiplier: 1, bonus_chance: 0.07 },
    },
  },
  dig_dirt_pile: {
    name: 'Dig a Dirt Pile',
    skills: {
      no_skill: { rank: -1, duration: 6000, success_rate: 100, energy_cost: 6, tool_wear: 2, bonus_amount: 2 },
      soil_appreciation_1: { rank: '1', duration: 5000, success_rate: 100, energy_cost: 5, tool_wear: 2, xp_bonus: 1, drop_class_id: 'loam_2', drop_chance: 3, bonus_amount: 2 },
      soil_appreciation_2: { rank: '2', duration: 4000, success_rate: 100, energy_cost: 4, tool_wear: 2, xp_bonus: 2, drop_class_id: 'loam', drop_chance: 5, bonus_amount: 3 },
      soil_appreciation_3: { rank: '3', duration: 3000, success_rate: 100, energy_cost: 4, tool_wear: 1, xp_bonus: 2, drop_class_id: 'loam', drop_chance: 8, bonus_amount: 3 },
      soil_appreciation_4: { rank: '4', duration: 2000, success_rate: 100, energy_cost: 3, tool_wear: 1, xp_bonus: 4, drop_class_id: 'loam_4', drop_chance: 10, bonus_amount: 4 },
      soil_appreciation_5: { rank: '5', duration: 2000, success_rate: 100, energy_cost: 3, tool_wear: 1, xp_bonus: 4, drop_class_id: 'loam_4', drop_chance: 15, bonus_amount: 4 },
    },
    img_upgrades: {},
  },
  peat_harvest: {
    name: 'Peat Harvest',
    skills: {
      no_skill: { rank: -1, interval_limit: 1, duration: 8000, success_rate: 100, energy_cost: 10, tool_wear: 2, xp_bonus: 2, bonus_amount: 3 },
      bogspecialization_1: { rank: '0', interval_limit: 1, duration: 3000, success_rate: 100, energy_cost: 5, tool_wear: 1, xp_bonus: 5, bonus_amount: 4 },
    },
    img_upgrades: {
      bogspecialization_dig_peat_drop: { rank: '1.1', drop_class_id: 'peat_harvesting', drop_chance: 10 },
    },
  },
  paper_tree_water: {
    name: 'Paper Tree Watering',
    skills: {
      no_skill: { rank: -1, duration: 2000, success_rate: 100, xp_bonus: 5, drop_class_id: 'tree_watering_small', drop_chance: 5 },
    },
    img_upgrades: {},
  },
  paper_tree_pet: {
    name: 'Paper Tree Petting',
    skills: {
      no_skill: { rank: -1, duration: 2000, success_rate: 100, xp_bonus: 5, drop_class_id: 'light_green_thumb_small', drop_chance: 5 },
    },
    img_upgrades: {},
  },
});

/**
 * Drop tables the remake honors (catalog_drop_tables.js). Keys are the
 * cumulative thresholds; GSJS rolls randInt(0, 100) and takes the first key
 * the roll does not exceed. Skill-package drop tables that only hand out
 * currants/musicblocks/SWFs (barnacle_scraping, jellisac_scooping,
 * peat_harvesting, tree_watering_small, light_green_thumb_small) are
 * intentionally not ported; their packages still roll yield bonuses.
 */
export const RESOURCE_DROP_TABLES = Object.freeze({
  loam: [[100, [{ classTsid: 'loam', qty: 3 }]]],
  loam_2: [[100, [{ classTsid: 'loam', qty: 2 }]]],
  loam_4: [[100, [{ classTsid: 'loam', qty: 4 }]]],
  dust_trap: [
    [10, [{ classTsid: 'paper', qty: 2 }]],
    [18, [{ classTsid: 'paper', qty: 5 }]],
    [23, [{ classTsid: 'paper', qty: 10 }]],
    [27, [{ classTsid: 'gem_sapphire', qty: 1 }]],
    [31, [{ classTsid: 'paper', qty: 25 }]],
    [34, [{ classTsid: 'cloudberry_daiquiri', qty: 1 }]],
    [37, [{ classTsid: 'flaming_humbaba', qty: 1 }]],
    [40, [{ classTsid: 'paper', qty: 50 }]],
    [43, [{ classTsid: 'gem_ruby', qty: 1 }]],
    [46, [{ classTsid: 'gurly_drink', qty: 1 }]],
    [49, [{ classTsid: 'bubble_tea', qty: 1 }]],
    [52, [{ classTsid: 'lemburger', qty: 1 }]],
    [55, [{ classTsid: 'pungent_sunrise', qty: 1 }]],
    [58, [{ classTsid: 'chillybusting_chili', qty: 1 }]],
    [61, [{ classTsid: 'awesome_stew', qty: 1 }]],
    [64, [{ classTsid: 'meat_tetrazzini', qty: 1 }]],
    [67, [{ classTsid: 'expensive_grilled_cheese', qty: 1 }]],
    [69, [{ classTsid: 'sno_cone_purple', qty: 1 }]],
    [71, [{ classTsid: 'herb_seed_hairball_flower', qty: 1 }]],
    [73, [{ classTsid: 'herb_seed_purple_flower', qty: 1 }]],
    [75, [{ classTsid: 'herb_seed_rookswort', qty: 1 }]],
    [77, [{ classTsid: 'herb_seed_rubeweed', qty: 1 }]],
    [79, [{ classTsid: 'herb_seed_silvertongue', qty: 1 }]],
    [81, [{ classTsid: 'herb_seed_yellow_crumb_flower', qty: 1 }]],
    [83, [{ classTsid: 'herb_seed_gandlevery', qty: 1 }]],
    [85, [{ classTsid: 'door_key_6', qty: 1 }]],
    [87, [{ classTsid: 'door_key_1', qty: 1 }]],
    [89, [{ classTsid: 'door_key_2', qty: 1 }]],
    [91, [{ classTsid: 'door_key_4', qty: 1 }]],
    [93, [{ classTsid: 'door_key_3', qty: 1 }]],
    [95, [{ classTsid: 'door_key_5', qty: 1 }]],
    [96, [{ classTsid: 'gem_moonstone', qty: 1 }]],
    [97, [{ classTsid: 'focusing_orb', qty: 1 }]],
    [98, [{ classTsid: 'gem_diamond', qty: 1 }]],
    [99, [{ classTsid: 'fairly_hallowed_shrine_powder', qty: 1 }]],
    [100, [{ classTsid: 'extremely_hallowed_shrine_powder', qty: 1 }]],
  ],
});

/** dust_trap.js doDrop: organelle rolls (Baqala timer seconds) before the drop table. */
export const DUST_TRAP_ORGANELLES = Object.freeze([
  { upTo: 0.13, id: 'vacuoles', label: 'a vacuole', seconds: 10 },
  { upTo: 0.23, id: 'endoplasmic_reticulum', label: 'an endoplasmic reticulum', seconds: 20 },
  { upTo: 0.30, id: 'golgi_apparatus', label: 'a piece of the golgi apparatus', seconds: 40 },
  { upTo: 0.35, id: 'super_old_mitochondrial_dna', label: 'super old mitochondrial DNA', seconds: 60 },
]);

// ---------------------------------------------------------------------------
// Items (GSJS label / name_plural / base_cost / stackmax / description)
// ---------------------------------------------------------------------------

function itemDef(label, plural, baseCost, stackMax, desc, extra = {}) {
  return Object.freeze({ label, plural, baseCost, stackMax, desc, ...extra });
}

/** Tools and direct yields: always registered with GSJS metadata. */
export const RESOURCE_ITEM_DEFS = Object.freeze({
  scraper: itemDef('Scraper', 'Scrapers', 300, 1, 'A hardy flat-edged blade for scraping Barnacles and Ice Nubbins. Scraper just scrapes.', { isTool: true }),
  super_scraper: itemDef('Super Scraper', 'Super Scrapers', 2000, 1, 'Super-streamlined barnacle-busting, ice-nubbin-bustin\' action with five times the lasting power of a Scraper.', { isTool: true }),
  shovel: itemDef('Shovel', 'Shovels', 300, 1, 'Harvest Peat, dig for dirt (well, Earth), and occasionally land a juicy piece of Loam.', { isTool: true }),
  ace_of_spades: itemDef('Ace of Spades', 'Ace of Spades', 3000, 1, 'Finely honed from old metal, the Ace of Spades is made for the heavy digger.', { isTool: true }),
  firefly_jar: itemDef('Firefly Jar', 'Firefly Jars', 100, 1, 'Holds up to seven Fireflies. Open it near Fireflies and your whistling will attract them (needs Firefly Whistling).', { isTool: true }),
  salmon: itemDef('Pocket Salmon', 'Pocket Salmen', 15, 40, "It's like salmon, but in your pocket! The handy friendly fish-at-your-fingertips."),
  boot: itemDef('Boot', 'Boots', 1, 100, 'This sure looks like a boot, eh?'),
  barnacle: itemDef('Mortar Barnacle', 'Mortar Barnacles', 8, 20, 'Prised from a Blister of pals. Barnacles can be introduced to the Grinder to find a new purpose.'),
  ice: itemDef('Ice', 'Ice', 6, 40, 'A nugget of purest ice, plucked with a scraper from the Nubbins of the north.'),
  jellisac_clump: itemDef('Clump of Jellisac', 'Clumps of Jellisac', 9, 100, "Just because it's slimy, doesn't mean it's not desirable. Where ooze is needed, jellisacs are your friend."),
  earth: itemDef('Lump of Earth', 'Lumps of Earth', 3, 50, "It's just a lump of earth. For building with."),
  loam: itemDef('Lump of Loam', 'Lumps of Loam', 10, 24, 'Moist and fertile, and leagues above plain old earth. Any building project\'s pride.'),
  peat: itemDef('Block of Peat', 'Blocks of Peat', 12, 24, 'Dense, stinky bog block for boosting building projects.'),
  paper: itemDef('Paper', 'Sheets of Paper', 2, 250, 'A blank piece of paper.'),
  snail: itemDef('Snail', 'Snails', 10, 100, 'Part-screw, part-nail: the product of a Sloth getting private time with metal rods.'),
});

/** Dust Trap drop-table items: registered only when no other module already did. */
export const DUST_TRAP_DROP_ITEM_DEFS = Object.freeze({
  gem_sapphire: itemDef('Showy Sapphire', 'Showy Sapphires', 400, 5, 'A somewhat showy sapphire.'),
  cloudberry_daiquiri: itemDef('Cloudberry Daiquiri', 'Cloudberry Daiquiris', 142, 24, 'A nourishing cloudberry daiquiri. It goes down smooth.'),
  flaming_humbaba: itemDef('Flaming Humbaba', 'Flaming Humbabas', 168, 24, 'A 5-alarm flaming Humbaba.'),
  gem_ruby: itemDef('Modestly Sized Ruby', 'Modestly Sized Rubies', 700, 5, 'A modestly sized ruby of nonetheless staggering beauty.'),
  gurly_drink: itemDef('Gurly Drink', 'Gurly Drinks', 160, 24, 'A sweet, innocent gurly drink.'),
  bubble_tea: itemDef('Bubble Tea', 'Bubble Teas', 172, 24, 'A super-frothy bubble tea.'),
  lemburger: itemDef('Lemburger', 'Lemburgers', 187, 12, 'A single-decker Lemburger with all the fixins.'),
  pungent_sunrise: itemDef('Pungent Sunrise', 'Pungent Sunrises', 197, 24, 'A refreshingly pungent sunrise.'),
  chillybusting_chili: itemDef('Chilly-Busting Chili', 'Chilly-Busting Chilis', 349, 12, 'A tureen of fiery chilly-busting chili.'),
  awesome_stew: itemDef('Awesome Stew', 'Awesome Stews', 268, 12, 'Chunky awesome stew, so thick you can eat it with a spork.'),
  meat_tetrazzini: itemDef('Meat Tetrazzini', 'Meat Tetrazzinis', 192, 12, 'Some creamy, meaty tetrazzini.'),
  expensive_grilled_cheese: itemDef('Expensive Grilled Cheese', 'Expensive Grilled Cheeses', 220, 12, 'Expensive cheese expensively grilled on expensive bread.'),
  sno_cone_purple: itemDef('Purple Sno Cone', 'Purple Sno Cones', 1100, 10, 'A refreshing and delicious purple Sno Cone.'),
  herb_seed_hairball_flower: itemDef('Hairball Flower Seed', 'Hairball Flower Seeds', 22, 50, 'For growing a pretty bunch of Hairball Flowers in your Herb Garden.'),
  herb_seed_purple_flower: itemDef('Purple Flower Seed', 'Purple Flower Seeds', 6, 50, 'For growing a pretty bunch of Purple Flowers in your Herb Garden.'),
  herb_seed_rookswort: itemDef('Rookswort Seed', 'Rookswort Seeds', 25, 50, 'For growing a pretty bunch of Rooksworts in your Herb Garden.'),
  herb_seed_rubeweed: itemDef('Rubeweed Seed', 'Rubeweed Seeds', 20, 50, 'For growing a pretty bunch of Rubeweeds in your Herb Garden.'),
  herb_seed_silvertongue: itemDef('Silvertongue Seed', 'Silvertongue Seeds', 25, 50, 'For growing a pretty bunch of Silvertongues in your Herb Garden.'),
  herb_seed_yellow_crumb_flower: itemDef('Yellow Crumb Flower Seed', 'Yellow Crumb Flower Seeds', 33, 50, 'For growing a pretty bunch of Yellow Crumb Flowers in your Herb Garden.'),
  herb_seed_gandlevery: itemDef('Gandlevery Seed', 'Gandlevery Seeds', 13, 50, 'For growing a pretty bunch of Gandlevery in your Herb Garden.'),
  door_key_1: itemDef('Yellow-Purple Triangle Key', 'Yellow-Purple Triangle Key', 50, 10, "As purple as it is yellow, this tri-pointed key has never met a door it didn't like."),
  door_key_2: itemDef('Green-White Circle Key', 'Green-White Circle Key', 50, 10, 'Green and white and shaped like your melon.'),
  door_key_3: itemDef('Orange-Blue Square Key', 'Orange-Blue Square Key', 50, 10, 'Does this orange and blue square key smell funny to you?'),
  door_key_4: itemDef('Teal-Red Hexagon Key', 'Teal-Red Hexagon Key', 50, 10, 'Hexagonally shaped keys have more fun.'),
  door_key_5: itemDef('Red-Green Triangle Key', 'Red-Green Triangle Key', 50, 10, "There's nothing a red-green triangle key loves more than a good door-opening."),
  door_key_6: itemDef('Purple-Orange Circle Key', 'Purple-Orange Circle Key', 50, 10, 'Purple, orange and circular, this key has everything you could want in a key.'),
  gem_moonstone: itemDef('Luminous Moonstone', 'Luminous Moonstones', 1000, 3, 'A moonstone of eerie luminosity.'),
  focusing_orb: itemDef('Focusing Orb', 'Focusing Orbs', 1200, 1, 'An iridescent focusing orb. It calms your swirly thoughts.'),
  gem_diamond: itemDef('Walloping Big Diamond', 'Walloping Big Diamonds', 2000, 3, "Yep, that's a walloping big diamond."),
  fairly_hallowed_shrine_powder: itemDef('Fairly Hallowed Shrine Powder', 'Fairly Hallowed Shrine Powder', 1000, 1, 'Curry a moderate amount of favor with the giants.'),
  extremely_hallowed_shrine_powder: itemDef('Extremely Hallowed Shrine Powder', 'Extremely Hallowed Shrine Powder', 2000, 1, 'It lets the giants know you really mean business.'),
});

// ---------------------------------------------------------------------------
// Sprites (measured OGA sheets; see SKILL.md "Known frame grids")
// ---------------------------------------------------------------------------

function sheet(file, frameWidth, frameHeight, cols, rows, frameCount, extra = {}) {
  return Object.freeze({
    path: `${RESOURCE_SPRITE_ROOT}/${file}`,
    width: frameWidth * cols,
    height: frameHeight * rows,
    frameWidth,
    frameHeight,
    cols,
    rows,
    frameCount,
    ...extra,
  });
}

/** Frame (col,row) of a 0-based frame index in a row-major sheet. */
export function sheetFrameRect(def, frameIndex) {
  const i = Math.max(0, Math.min((def?.frameCount || 1) - 1, Math.floor(Number(frameIndex) || 0)));
  const col = i % def.cols;
  const row = Math.floor(i / def.cols);
  return { x: col * def.frameWidth, y: row * def.frameHeight, w: def.frameWidth, h: def.frameHeight, index: i };
}

/** Firefly Jar overlay sheets: num_flies 0-7 x closed/open/opening/closing, 15 frames each. */
export const FIREFLY_JAR_SHEETS = Object.freeze(Object.fromEntries(
  Array.from({ length: FIREFLY_JAR_MAX + 1 }, (_, flies) => [
    flies,
    Object.freeze(Object.fromEntries(['closed', 'open', 'opening', 'closing'].map((state) => [
      state,
      flies <= 1
        ? sheet(`firefly-jar-${flies}-${state}.png`, 54, flies === 0 ? 87 : 88, 15, 1, 15, { loop: state === 'closed' || state === 'open' })
        : sheet(`firefly-jar-${flies}-${state}.png`, 55, 88, 15, 1, 15, { loop: state === 'closed' || state === 'open' }),
    ]))),
  ])
));

export function fireflyJarSheet(flies = 0, state = 'closed') {
  const n = Math.max(0, Math.min(FIREFLY_JAR_MAX, Math.floor(Number(flies) || 0)));
  return FIREFLY_JAR_SHEETS[n][state] || FIREFLY_JAR_SHEETS[n].closed;
}

// ---------------------------------------------------------------------------
// Catalog
// ---------------------------------------------------------------------------

const SCRAPERS = Object.freeze(['super_scraper', 'scraper']);
const SHOVELS = Object.freeze(['ace_of_spades', 'shovel']);
const WATERING_CANS = Object.freeze(['irrigator_9000', 'watering_can']);

/**
 * stock.model:
 *   'grow'    units grow +1 per regrow delay up to max; harvestable at >= harvestableAt
 *             (barnacle/ice/jellisac reset to `afterHarvest`; peat/dirt consume 1)
 *   'respawn' units 1 = present; harvest removes the node until respawnAt
 *   'tend'    Paper Tree: units = paper_count; refilled by water + pet
 *   'session' Sloth: units = rods it will still eat before hiding
 */
export const RESOURCE_NODE_CATALOG = Object.freeze({
  npc_firefly: Object.freeze({
    classTsid: 'npc_firefly',
    label: 'Firefly',
    labelPlural: 'Fireflies',
    kind: 'npc',
    placement: 'air',
    placementNote: 'Wanders inside a fly box (GSJS box_width 200, box_height 50 radii) around its spawn point; no day/night gate in GSJS, so night glow is cosmetic only.',
    stock: Object.freeze({ model: 'respawn', min: 0, max: 1, initial: 1, harvestableAt: 1 }),
    respawnMs: 10000,
    respawnSource: 'spawner.js default spawn_interval 10 s (per-street spawner configs not preserved)',
    verbs: Object.freeze([
      Object.freeze({
        id: 'open',
        label: 'Open Firefly Jar',
        tooltip: 'Your whistling will attract Fireflies. Warning: this can use up to 60 energy',
        tools: Object.freeze(['firefly_jar']),
        consumesTool: false,
        achievement: FIREFLY_WHISTLE_ACHIEVEMENT,
        skillGate: null,
        durationMs: 1000,
        durationNote: '1 s per whistle tick (onAttract), up to 12 ticks',
        energy: 5,
        energyNote: '5 on open, then 5 per tick from the 2nd tick; ends when energy <= 10; needs > 20 to open',
        mood: 0,
        xp: 0,
        toolWear: 0,
        yields: Object.freeze([{ into: 'firefly_jar', what: 'Firefly', qty: 1, note: 'per Firefly captured, jar max 7; full jar grants +25 iMG' }]),
      }),
    ]),
    art: 'raster',
    sprite: Object.freeze({
      sheets: Object.freeze({
        fullPath: sheet('firefly-full-path.png', 87, 40, 10, 9, 89, { loop: true }),
        halfPath: sheet('firefly-half-path.png', 87, 40, 10, 4, 40, { loop: true }),
        smallPath: sheet('firefly-small-path.png', 87, 40, 10, 2, 20, { loop: true }),
      }),
      defaultSheet: 'fullPath',
      variants: Object.freeze(['fullPath', 'halfPath', 'smallPath']),
      frameRule: 'Present: loop the chosen path sheet (GSJS picks one of fullPath/halfPath/smallPath at random while wandering). Captured: hidden.',
      jarSheets: FIREFLY_JAR_SHEETS,
    }),
    source: 'npc_firefly.js (wandering fly box, attractTo jar), firefly_jar.js verbs.open / onAttract / addFirefly (max 7, +25 iMG when full)',
  }),

  npc_salmon: Object.freeze({
    classTsid: 'npc_salmon',
    label: 'Salmon',
    labelPlural: 'Salmen',
    kind: 'npc',
    placement: 'water',
    placementNote: 'apiMakeBird flight inside water streets (Jal); pocket proximity 500 px.',
    stock: Object.freeze({ model: 'respawn', min: 0, max: 1, initial: 1, harvestableAt: 1 }),
    respawnMs: 10000,
    respawnSource: 'spawner.js default spawn_interval 10 s (npc_salmon apiDeletes itself on pocket)',
    verbs: Object.freeze([
      Object.freeze({
        id: 'pocket',
        label: 'Pocket',
        tooltip: 'Put in pocket',
        tools: Object.freeze([]),
        skillGate: null,
        durationMs: 0,
        energy: 4,
        energyNote: 'Always charged (metabolics_add_energy(-4)), no energy gate in GSJS; clamps at 0',
        mood: 0,
        xp: 0,
        toolWear: 0,
        yields: Object.freeze([
          { classTsid: 'salmon', qty: 1, chance: 0.9 },
          { classTsid: 'boot', qty: 1, chance: 0.1, note: '"Huh, looked like a fish at first."' },
        ]),
      }),
    ]),
    art: 'raster',
    sprite: Object.freeze({
      sheets: Object.freeze({
        swimRight: sheet('salmon-swim-right.png', 59, 37, 11, 2, 22, { loop: true }),
        swimRightUp15: sheet('salmon-swim-right-up15.png', 59, 37, 11, 2, 22, { loop: true }),
        swimRightUp30: sheet('salmon-swim-right-up30.png', 59, 37, 11, 2, 22, { loop: true }),
        swimRightDown15: sheet('salmon-swim-right-down15.png', 59, 37, 11, 2, 22, { loop: true }),
        swimRightDown30: sheet('salmon-swim-right-down30.png', 59, 37, 11, 2, 22, { loop: true }),
        turnRight: sheet('salmon-turn-right.png', 59, 37, 11, 1, 11, { loop: false }),
      }),
      defaultSheet: 'swimRight',
      frameRule: 'Present: loop swimRight (pick Up15/Up30/Down15/Down30 by heading; mirror x for leftward travel; play turnRight once when reversing). Pocketed: hidden.',
    }),
    source: 'npc_salmon.js verbs.pocket (4 energy, 10% boot, salmon x1, animal_love feat, apiDelete)',
  }),

  mortar_barnacle: Object.freeze({
    classTsid: 'mortar_barnacle',
    label: 'Mortar Barnacle',
    labelPlural: 'Mortar Barnacles',
    kind: 'node',
    placement: 'ground',
    stock: Object.freeze({ model: 'grow', min: 1, max: 4, initial: 4, harvestableAt: 4, afterHarvest: 1 }),
    regrow: Object.freeze({ minMs: 30000, maxMs: 180000, stepMs: 1000, note: 'onGrow +1 scrape_state every randInt(30,180) s' }),
    verbs: Object.freeze([
      Object.freeze({
        id: 'scrape',
        label: 'Scrape',
        tooltip: 'Or, drag scraper to barnacle. Costs $energy_cost energy and takes $seconds seconds',
        tools: SCRAPERS,
        skillPackage: 'scraping',
        skillGate: null,
        durationMs: 4000,
        energy: 2,
        mood: 0,
        xp: 2,
        toolWear: 1,
        yields: Object.freeze([{ classTsid: 'barnacle', qty: 1 }]),
      }),
    ]),
    art: 'raster',
    sprite: Object.freeze({
      sheets: Object.freeze({
        blister1: sheet('mortar-barnacle-blister1.png', 39, 44, 4, 1, 4),
        blister2: sheet('mortar-barnacle-blister2.png', 35, 40, 4, 1, 4),
        blister3: sheet('mortar-barnacle-blister3.png', 35, 39, 4, 1, 4),
        blister4: sheet('mortar-barnacle-blister4.png', 36, 40, 4, 1, 4),
        blister5: sheet('mortar-barnacle-blister5.png', 32, 39, 4, 1, 4),
        blister6: sheet('mortar-barnacle-blister6.png', 39, 47, 4, 1, 4),
      }),
      defaultSheet: 'blister1',
      variants: Object.freeze(['blister1', 'blister2', 'blister3', 'blister4', 'blister5', 'blister6']),
      states: Object.freeze(['empty', 'small', 'big', 'ready']),
      frameRule: 'frame = units - 1 (scrape_state 1 empty, 2 small, 3 big, 4 ready)',
    }),
    source: 'mortar_barnacle.js (scrape_state 1-4, onGrow 30-180 s), scraper.js, catalog_skill_packages.js scraping',
  }),

  ice_knob: Object.freeze({
    classTsid: 'ice_knob',
    label: 'Ice Nubbin',
    labelPlural: 'Ice Nubbins',
    kind: 'node',
    placement: 'ground',
    stock: Object.freeze({ model: 'grow', min: 1, max: 4, initial: 4, harvestableAt: 4, afterHarvest: 1 }),
    regrow: Object.freeze({ minMs: 30000, maxMs: 180000, stepMs: 1000, note: 'onGrow +1 scrape_state every randInt(30,180) s' }),
    verbs: Object.freeze([
      Object.freeze({
        id: 'scrape',
        label: 'Scrape',
        tooltip: 'Or, drag scraper to ice nubbin. Costs $energy_cost energy and takes $seconds seconds',
        tools: SCRAPERS,
        skillPackage: 'ice_scraping',
        skillGate: null,
        durationMs: 4000,
        energy: 4,
        mood: 0,
        xp: 3,
        toolWear: 2,
        yields: Object.freeze([
          { classTsid: 'ice', qty: 1, chance: 0.49 },
          { classTsid: 'ice', qty: 2, chance: 0.30 },
          { classTsid: 'ice', qty: 3, chance: 0.21 },
          { classTsid: 'ice', qty: '2-5', note: 'with img upgrade ice_scraping_yield: 2 (39%), 3 (30%), 4 (20%), 5 (11%)' },
        ]),
      }),
    ]),
    art: 'raster',
    sprite: Object.freeze({
      sheets: Object.freeze({
        knob1: sheet('ice-knob-knob1.png', 45, 69, 4, 1, 4),
        knob2: sheet('ice-knob-knob2.png', 54, 68, 4, 1, 4),
        knob3: sheet('ice-knob-knob3.png', 46, 71, 4, 1, 4),
        knob4: sheet('ice-knob-knob4.png', 72, 52, 4, 1, 4),
      }),
      defaultSheet: 'knob1',
      variants: Object.freeze(['knob1', 'knob2', 'knob3', 'knob4']),
      states: Object.freeze(['empty', 'small', 'big', 'ready']),
      frameRule: 'frame = units - 1 (scrape_state 1 empty .. 4 ready)',
    }),
    source: 'ice_knob.js (getIceAmount, scrape_state 1-4, onGrow 30-180 s), catalog_skill_packages.js ice_scraping',
  }),

  jellisac: Object.freeze({
    classTsid: 'jellisac',
    label: 'Jellisac Growth',
    labelPlural: 'Jellisac Growths',
    kind: 'node',
    placement: 'ground',
    stock: Object.freeze({ model: 'grow', min: 1, max: 5, initial: 5, harvestableAt: 5, afterHarvest: 1 }),
    regrow: Object.freeze({ minMs: 300000, maxMs: 300000, stepMs: 1000, note: 'onGrow +1 scoop_state every 5 min' }),
    verbs: Object.freeze([
      Object.freeze({
        id: 'scoop',
        label: 'Scoop',
        tooltip: 'Scoop a clump of Jellisacs',
        tools: Object.freeze([]),
        skillPackage: 'jellisac_scooping',
        skillGate: null,
        skillTiers: Object.freeze(['jellisac_hands_1']),
        durationMs: 4000,
        energy: 6,
        mood: 0,
        xp: 1,
        toolWear: 0,
        yields: Object.freeze([
          { classTsid: 'jellisac_clump', qty: 1 },
          { classTsid: 'jellisac_clump', qty: 3, chance: 0.07, note: 'Super Harvest bonus with Jellisac Hands (bonus_multiplier 4)' },
        ]),
      }),
    ]),
    art: 'raster',
    sprite: Object.freeze({
      sheets: Object.freeze({
        jellySack1: sheet('jellisac-jellysack1.png', 40, 48, 5, 1, 5),
        jellySack2: sheet('jellisac-jellysack2.png', 42, 46, 5, 1, 5),
        jellySack3: sheet('jellisac-jellysack3.png', 44, 39, 5, 1, 5),
        jellySack4: sheet('jellisac-jellysack4.png', 47, 52, 5, 1, 5),
      }),
      defaultSheet: 'jellySack1',
      variants: Object.freeze(['jellySack1', 'jellySack2', 'jellySack3', 'jellySack4']),
      states: Object.freeze(['empty', 'small', 'big', 'bigger', 'ready']),
      frameRule: 'frame = units - 1 (scoop_state 1 empty .. 5 ready)',
    }),
    source: 'jellisac.js (scoop_state 1-5, onGrow 5 min, super harvest), catalog_skill_packages.js jellisac_scooping',
  }),

  dirt_pile: Object.freeze({
    classTsid: 'dirt_pile',
    label: 'Dirt Pile',
    labelPlural: 'Dirt Piles',
    kind: 'node',
    placement: 'ground',
    stock: Object.freeze({ model: 'grow', min: 1, max: 11, initial: 11, harvestableAt: 2, consume: 1 }),
    regrow: Object.freeze({ minMs: 300000, maxMs: 300000, stepMs: 1000, note: 'addDirt +1 dirt_state every 5 min' }),
    dailyLimit: Object.freeze({ verb: 'dig', base: 3, upgrades: Object.freeze({ soil_appreciation_dirt_pile_1: 4, soil_appreciation_dirt_pile_2: 5 }) }),
    verbs: Object.freeze([
      Object.freeze({
        id: 'dig',
        label: 'Dig',
        tooltip: 'Dig dutifully for delightful dirt',
        tools: SHOVELS,
        skillPackage: 'dig_dirt_pile',
        skillGate: null,
        skillTiers: Object.freeze(['soil_appreciation_1', 'soil_appreciation_2', 'soil_appreciation_3', 'soil_appreciation_4', 'soil_appreciation_5']),
        durationMs: 6000,
        energy: 6,
        mood: 0,
        xp: 0,
        toolWear: 2,
        yields: Object.freeze([
          { classTsid: 'earth', qty: 2, note: 'bonus_amount by Soil Appreciation rank: 2/2/3/3/4/4' },
          { classTsid: 'loam', qty: '2-4', note: 'instead of earth on a drop_chance roll (SA1 3% x2, SA2 5% x3, SA3 8% x3, SA4 10% x4, SA5 15% x4)' },
        ]),
      }),
    ]),
    art: 'raster',
    sprite: Object.freeze({
      sheets: Object.freeze({
        dirt1: sheet('dirt-pile-dirt1.png', 195, 71, 4, 3, 11),
        dirt2: sheet('dirt-pile-dirt2.png', 195, 71, 4, 3, 11),
      }),
      defaultSheet: 'dirt1',
      variants: Object.freeze(['dirt1', 'dirt2']),
      frameRule: 'frame = 11 - units (dirt_state 11 full = frame 0 .. dirt_state 1 empty = frame 10)',
    }),
    source: 'dirt_pile.js (dirt_state 1-11, addDirt 300 s, 3/4/5 digs per day), shovel.js, catalog_skill_packages.js dig_dirt_pile, catalog_drop_tables.js loam/loam_2/loam_4',
  }),

  peat_1: Object.freeze({
    classTsid: 'peat_1',
    label: 'Peat Bog',
    labelPlural: 'Peat Bogs',
    kind: 'node',
    placement: 'ground',
    stock: Object.freeze({ model: 'grow', min: 0, max: 4, initial: 4, harvestableAt: 1, consume: 1 }),
    regrow: Object.freeze({ minMs: 120000, maxMs: 360000, stepMs: 60000, note: 'onGrow +1 harvests_remaining every randInt(2,6) min, timer restarts on harvest' }),
    dailyLimit: Object.freeze({ verb: 'harvest', base: 1, upgrades: Object.freeze({ bog_specialization_dig_peat_bog_twice: 2 }) }),
    verbs: Object.freeze([
      Object.freeze({
        id: 'harvest',
        label: 'Harvest',
        tooltip: 'Or, drag shovel to peat. Costs $energy_cost energy and takes $seconds seconds',
        tools: SHOVELS,
        skillPackage: 'peat_harvest',
        skillGate: null,
        skillTiers: Object.freeze(['bogspecialization_1']),
        durationMs: 8000,
        energy: 10,
        mood: 0,
        xp: 2,
        toolWear: 2,
        yields: Object.freeze([
          { classTsid: 'peat', qty: 3, note: '4 with Bog Specialization; +25% (rounded) with img upgrade bogspecialization_more_peat' },
        ]),
      }),
    ]),
    art: 'raster',
    sprite: Object.freeze({
      sheets: Object.freeze({
        peat1: sheet('peat-1.png', 211, 52, 3, 2, 5),
        peat2: sheet('peat-2.png', 166, 46, 5, 1, 5),
        peat3: sheet('peat-3.png', 178, 57, 5, 1, 5),
      }),
      defaultSheet: 'peat1',
      variants: Object.freeze(['peat1', 'peat2', 'peat3']),
      frameRule: 'frame = 4 - units (harvests_remaining 4 = scene 5 = frame 0 .. 0 = scene 1 = frame 4)',
    }),
    source: 'peat_1.js / peat_2.js / peat_3.js (peat_base: harvests_remaining 0-4, onGrow 2-6 min, once per game day), catalog_skill_packages.js peat_harvest',
  }),

  paper_tree: Object.freeze({
    classTsid: 'paper_tree',
    label: 'Paper Tree',
    labelPlural: 'Paper Trees',
    kind: 'node',
    placement: 'ground',
    stock: Object.freeze({ model: 'tend', min: 0, max: 21, initial: 21, harvestableAt: 1 }),
    tend: Object.freeze({ refill: 9, resetMs: 6 * 60 * 1000, note: 'water + pet -> addPaper x9; wants reset 6 min later' }),
    dailyLimit: Object.freeze({ verb: 'harvest', base: 1, upgrades: Object.freeze({}) }),
    verbs: Object.freeze([
      Object.freeze({
        id: 'harvest',
        label: 'Harvest',
        tooltip: 'Collect some paper',
        tools: Object.freeze([]),
        skillGate: null,
        durationMs: 2500,
        energy: 0,
        mood: 0,
        xp: 0,
        toolWear: 0,
        yields: Object.freeze([{ classTsid: 'paper', qty: 5, note: '8 with img upgrade gardening_harvest_paper; capped by paper_count' }]),
      }),
      Object.freeze({
        id: 'water',
        label: 'Water',
        tooltip: 'Give water',
        tools: WATERING_CANS,
        skillPackage: 'paper_tree_water',
        skillGate: null,
        durationMs: 2000,
        energy: 0,
        mood: 0,
        xp: 5,
        toolWear: 0,
        yields: Object.freeze([]),
      }),
      Object.freeze({
        id: 'pet',
        label: 'Pet',
        tooltip: 'Give love',
        tools: Object.freeze([]),
        skillPackage: 'paper_tree_pet',
        skillGate: null,
        durationMs: 2000,
        energy: 0,
        mood: 0,
        xp: 5,
        toolWear: 0,
        yields: Object.freeze([]),
      }),
    ]),
    art: 'raster',
    sprite: Object.freeze({
      sheets: Object.freeze({
        petFalseWaterFalse: sheet('paper-tree-pet-false-water-false.png', 232, 216, 4, 6, 22),
        petFalseWaterTrue: sheet('paper-tree-pet-false-water-true.png', 232, 216, 4, 6, 22),
        petTrueWaterFalse: sheet('paper-tree-pet-true-water-false.png', 232, 216, 4, 6, 22),
        petTrueWaterTrue: sheet('paper-tree-pet-true-water-true.png', 232, 216, 4, 6, 22),
      }),
      defaultSheet: 'petFalseWaterFalse',
      frameRule: 'sheet by (needs_pet, needs_water) = (!petted, !watered); frame = units (paper_count 0-21)',
    }),
    source: 'paper_tree.js (max_paper 21, harvest 5/8 once per game day, water+pet -> +9 paper, 6 min reset), catalog_skill_packages.js paper_tree_water/pet',
  }),

  npc_sloth: Object.freeze({
    classTsid: 'npc_sloth',
    label: 'Sloth',
    labelPlural: 'Sloths',
    kind: 'npc',
    placement: 'canopy',
    placementNote: 'Hangs from a high branch; GSJS hitbox 300x200 plus a bottom extender. Starts hidden in the canopy.',
    stock: Object.freeze({ model: 'session', min: 0, max: 8, initial: 8, harvestableAt: 1 }),
    session: Object.freeze({
      idleHideMs: 20000,
      callDelayMs: 2000,
      fullCooldownMs: 3 * 60 * 1000,
      note: 'Hides after 20 s idle or after the 8th rod (metalize_count > 7); refuses to come down within 3 min of the last meal',
    }),
    verbs: Object.freeze([
      Object.freeze({
        id: 'knock',
        label: 'Knock',
        tooltip: 'Knock on the Knocker to call the Sloth down',
        tools: Object.freeze([]),
        inputs: Object.freeze([{ classTsid: 'metal_rod', qty: 1, consumed: false }]),
        skillGate: 'animalkinship_3',
        durationMs: 2000,
        energy: 0,
        mood: 0,
        xp: 0,
        toolWear: 0,
        yields: Object.freeze([]),
      }),
      Object.freeze({
        id: 'feed',
        label: 'Feed',
        tooltip: 'Feed Sloth a Metal Rod to create some Snails',
        tools: Object.freeze([]),
        inputs: Object.freeze([{ classTsid: 'metal_rod', qty: 1, consumed: true }]),
        skillGate: 'animalkinship_3',
        durationMs: 0,
        durationNote: 'chew 2-5 s, then spit every 2.5-6 s (+1.5 s) until 7-10 snails; computed per feed',
        energy: 0,
        mood: 0,
        xp: 0,
        toolWear: 0,
        yields: Object.freeze([{ classTsid: 'snail', qty: '7-10', note: 'choose_one([7,8,9,10]) per Metal Rod' }]),
      }),
    ]),
    art: 'vector',
    vector: Object.freeze({
      reason: 'No npc_sloth raster in the public OGA archives (only npc_cubimal_sloth, a cubimal figure).',
      draw: 'Hanging sloth on a canopy branch: shaggy brown fur, pale face mask, long hooked claws, red bandana (instance head=redBandana) and dark jacket (jacket=darkJacket). It holds a metal rod whose length shows rod1..rod7 (rod7 = whole rod, shrinking as snails are spat). States: hidden (only claws/branch visible), peeking (head dips below the leaves), idle/hangIdle1/hangIdle2 (slow sway), eating (chewing loop), spit (snail arcs to the player), devil_horns ("Metal forever!").',
      states: Object.freeze(['hidden', 'peeking', 'idle', 'eating', 'spit']),
    }),
    source: 'npc_sloth.js (verbs.feed metal_rod, animalkinship_3, createSnail 7-10, metalize_count > 7 hides, 3 min cooldown), sloth_knocker.js (callSloth)',
  }),

  dust_trap: Object.freeze({
    classTsid: 'dust_trap',
    label: 'Dust Trap',
    labelPlural: 'Dust Traps',
    kind: 'trap',
    placement: 'ground',
    placementNote: 'Baqala. Collision hitbox 25x200; triggers when the player walks into it (no menu verb).',
    stock: Object.freeze({ model: 'respawn', min: 0, max: 1, initial: 1, harvestableAt: 1 }),
    reset: Object.freeze({ minMs: 180000, maxMs: 3600000, fullResetMs: 86400000, note: 'reset = 2 x (time spent ready), clamped to 180-3600 s; reset() raises at +250 ms, makeReady 1 s later' }),
    verbs: Object.freeze([
      Object.freeze({
        id: 'trigger',
        label: 'Trigger',
        auto: true,
        tooltip: 'Walk into the trap',
        tools: Object.freeze([]),
        skillGate: null,
        durationMs: 2000,
        energy: 0,
        mood: 0,
        xp: 0,
        toolWear: 0,
        yields: Object.freeze([
          { what: 'baqala_time', chance: 0.35, note: 'organelle: 13% +10 s, 10% +20 s, 7% +40 s, 5% +60 s of Baqala time' },
          { dropTable: 'dust_trap', chance: 0.65, note: 'paper 2-50, gems, foods, herb seeds, door keys, focusing orb, shrine powders' },
        ]),
      }),
    ]),
    art: 'raster',
    sprite: Object.freeze({
      sheets: Object.freeze({
        idle: sheet('dust-trap-idle.png', 110, 255, 1, 1, 1),
        smackDown: sheet('dust-trap-smack-down.png', 110, 255, 9, 5, 45, { loop: false }),
        down: sheet('dust-trap-down.png', 110, 255, 1, 1, 1),
        up: sheet('dust-trap-up.png', 110, 255, 8, 2, 16, { loop: false }),
      }),
      defaultSheet: 'idle',
      frameRule: 'ready: idle; first 2 s after trigger: play smackDown once; then down; last 1 s before ready: play up once',
    }),
    source: 'dust_trap.js (doPlayerResponse, doDrop, reset timing), catalog_drop_tables.js dust_trap',
  }),
});

export const RESOURCE_NODE_ALIASES = Object.freeze({
  peat_2: { classTsid: 'peat_1', variant: 'peat2' },
  peat_3: { classTsid: 'peat_1', variant: 'peat3' },
});

export const RESOURCE_NODE_CLASS_IDS = Object.freeze(Object.keys(RESOURCE_NODE_CATALOG));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function whole(value, fallback = 0, min = 0, max = Number.MAX_SAFE_INTEGER) {
  const n = Math.floor(Number(value));
  return Math.max(min, Math.min(max, Number.isFinite(n) ? n : fallback));
}

function time(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function randInt(min, max, rng = Math.random) {
  return min + Math.floor(rng() * (max - min + 1));
}

/** GSJS regrow delay: randInt over whole seconds (or minutes for peat). */
export function regrowDelayMs(def, rng = Math.random) {
  const step = def?.regrow?.stepMs || 1000;
  return randInt(Math.round(def.regrow.minMs / step), Math.round(def.regrow.maxMs / step), rng) * step;
}

function chooseOne(list, rng = Math.random) {
  return list[Math.min(list.length - 1, Math.floor(rng() * list.length))];
}

function hashString(value) {
  let hash = 2166136261;
  for (const char of String(value || '')) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function asList(value) {
  return Array.isArray(value) ? value : [];
}

function learnedSkills(ctx = {}) {
  return asList(ctx.skills).length ? asList(ctx.skills) : asList(ctx.learned);
}

function itemName(classTsid, qty = 1) {
  const def = RESOURCE_ITEM_DEFS[classTsid] || DUST_TRAP_DROP_ITEM_DEFS[classTsid];
  const label = def ? (qty === 1 ? def.label : def.plural) : (ITEM_CATALOG[classTsid]?.label || String(classTsid).replace(/_/g, ' '));
  return label;
}

function plural(qty, classTsid) {
  return `${qty} ${itemName(classTsid, qty)}`;
}

/** Resolve a classTsid or alias to { def, variant }. */
function resolveClass(classTsid) {
  const alias = RESOURCE_NODE_ALIASES[classTsid];
  const id = alias ? alias.classTsid : classTsid;
  const def = RESOURCE_NODE_CATALOG[id];
  return def ? { def, variant: alias?.variant || null } : null;
}

export function getResourceNodeDef(classTsid) {
  return resolveClass(classTsid)?.def || null;
}

function verbDef(def, verbId) {
  if (!def) return null;
  if (!verbId) return def.verbs.find((v) => !v.auto) || def.verbs[0];
  return def.verbs.find((v) => v.id === verbId) || null;
}

/**
 * GSJS getSkillPackageDetails: pick the highest-rank skill the player has
 * (or no_skill), then apply img upgrades in rank order.
 */
export function resolveResourceSkillPackage(name, skills = [], upgrades = []) {
  const pkg = RESOURCE_SKILL_PACKAGES[name];
  if (!pkg) return null;
  const learned = new Set(asList(skills));
  const owned = new Set(asList(upgrades));
  let details = null;
  let skill = null;
  for (const [id, s] of Object.entries(pkg.skills)) {
    if ((!details || Number(s.rank) > Number(details.rank)) && (id === 'no_skill' || learned.has(id))) {
      details = s;
      skill = id;
    }
  }
  if (!details) return null;
  const out = { ...details, skill, package: name };
  const imgRank = {};
  let durationMultiplier = 0;
  for (const [id, img] of Object.entries(pkg.img_upgrades || {})) {
    if (!owned.has(id)) continue;
    const parts = String(img.rank).split('.');
    const cat = parts[1] !== undefined ? Number(parts[0]) : 0;
    const rank = parts[1] !== undefined ? Number(parts[1]) : Number(parts[0]);
    // GSJS: apply when the category is unset/zero or this rank is higher.
    if (imgRank[cat] && imgRank[cat] >= rank) continue;
    imgRank[cat] = rank;
    for (const key of ['drop_class_id', 'drop_chance', 'bonus_multiplier', 'bonus_chance', 'bonus_amount']) {
      if (img[key] !== undefined) out[key] = img[key];
    }
    if (img.duration_multiplier) durationMultiplier = img.duration_multiplier;
  }
  if (durationMultiplier > 0) out.duration -= out.duration * durationMultiplier;
  else if (durationMultiplier < 0) out.duration += out.duration * Math.abs(durationMultiplier);
  out.duration = Math.max(0, Math.round(out.duration || 0));
  return out;
}

function rollDropTable(tableId, rng = Math.random) {
  const table = RESOURCE_DROP_TABLES[tableId];
  if (!table) return [];
  const roll = randInt(0, 100, rng);
  for (const [threshold, items] of table) {
    if (roll <= threshold) return items.map((it) => ({ ...it }));
  }
  return [];
}

// ---------------------------------------------------------------------------
// Firefly jar
// ---------------------------------------------------------------------------

export function createFireflyJarState(seed = {}) {
  return normalizeFireflyJarState(seed);
}

export function normalizeFireflyJarState(seed = {}) {
  return { flies: whole(seed?.flies ?? seed?.num_flies, 0, 0, FIREFLY_JAR_MAX) };
}

// ---------------------------------------------------------------------------
// Node lifecycle
// ---------------------------------------------------------------------------

/**
 * @param {string} classTsid catalog id or alias (peat_2/peat_3)
 * @param {{ variant?: string, seed?: string, units?: number, now?: number }} [opts]
 */
export function createResourceNode(classTsid, opts = {}) {
  const resolved = resolveClass(classTsid);
  if (!resolved) throw new Error(`Unknown resource node class: ${classTsid}`);
  const { def } = resolved;
  const variants = def.sprite?.variants || [];
  let variant = opts.variant || resolved.variant || null;
  if (variant && variants.length && !variants.includes(variant)) variant = null;
  if (!variant && variants.length) {
    variant = opts.seed != null ? variants[hashString(opts.seed) % variants.length] : variants[0];
  }
  const units = opts.units != null
    ? whole(opts.units, def.stock.initial, def.stock.min, def.stock.max)
    : def.stock.initial;
  const node = {
    classTsid: def.classTsid,
    variant,
    units,
    unitsMax: def.stock.max,
    depleted: def.stock.model === 'respawn' ? units < 1 : false,
    regrowAt: 0,
    respawnAt: 0,
    dayKey: '',
    dailyCounts: {},
    totalHarvests: 0,
  };
  if (def.stock.model === 'grow' && units < def.stock.max && opts.now != null) {
    node.regrowAt = time(opts.now) + (def.regrow?.minMs || 0);
  }
  if (def.classTsid === 'paper_tree') {
    node.petted = false;
    node.watered = false;
    node.needsResetAt = 0;
  }
  if (def.classTsid === 'npc_sloth') {
    node.out = false;
    node.hideAt = 0;
    node.busyUntil = 0;
    node.sessionFeeds = 0;
    node.lastMetalizeAt = 0;
  }
  if (def.classTsid === 'dust_trap') {
    node.readySince = time(opts.now);
    node.triggeredAt = 0;
  }
  return node;
}

/** Harvestable right now (ignores tools, skills, energy and daily limits). */
export function isResourceNodeHarvestable(node) {
  const def = getResourceNodeDef(node?.classTsid);
  if (!def) return false;
  if (def.stock.model === 'respawn') return !node.depleted && node.units >= 1;
  if (def.stock.model === 'session') return node.units >= 1;
  return node.units >= def.stock.harvestableAt;
}

/**
 * Advance regrowth, respawns, tending resets and Sloth hiding. Catches up
 * multiple elapsed steps deterministically (each step scheduled from the
 * previous due time). Returns true when anything changed.
 */
export function tickResourceNode(node, now = Date.now(), rng = Math.random) {
  const def = getResourceNodeDef(node?.classTsid);
  if (!def) return false;
  let changed = false;
  if (def.stock.model === 'grow') {
    let guard = 0;
    while (node.regrowAt && now >= node.regrowAt && node.units < def.stock.max && guard < 64) {
      node.units += 1;
      changed = true;
      guard += 1;
      node.regrowAt = node.units < def.stock.max
        ? node.regrowAt + regrowDelayMs(def, rng)
        : 0;
    }
    if (node.units >= def.stock.max && node.regrowAt) {
      node.regrowAt = 0;
      changed = true;
    } else if (node.units < def.stock.max && !node.regrowAt) {
      // Self-heal saves or seeds that lost their timer.
      node.regrowAt = now + regrowDelayMs(def, rng);
      changed = true;
    }
  } else if (def.stock.model === 'respawn') {
    if (node.depleted && now >= (node.respawnAt || 0)) {
      const readyAt = node.respawnAt || now;
      node.units = def.stock.max;
      node.depleted = false;
      node.respawnAt = 0;
      if (def.classTsid === 'dust_trap') {
        node.readySince = readyAt;
        node.triggeredAt = 0;
      }
      changed = true;
    }
  } else if (def.stock.model === 'tend') {
    if (node.needsResetAt && now >= node.needsResetAt) {
      node.petted = false;
      node.watered = false;
      node.needsResetAt = 0;
      changed = true;
    }
  } else if (def.stock.model === 'session') {
    if (node.busyUntil && now >= node.busyUntil) {
      node.busyUntil = 0;
      changed = true;
    }
    if (node.out && !node.busyUntil && node.hideAt && now >= node.hideAt) {
      node.out = false;
      node.hideAt = 0;
      changed = true;
    }
    if (!node.out && node.units < def.stock.max && node.lastMetalizeAt
      && now - node.lastMetalizeAt >= def.session.fullCooldownMs) {
      node.units = def.stock.max;
      node.sessionFeeds = 0;
      changed = true;
    }
  }
  return changed;
}

function currentDayKey(ctx = {}) {
  if (ctx.dayKey) return String(ctx.dayKey);
  return getGameDayKey(ctx.now ?? Date.now());
}

function dailyUses(node, verbId, dayKey) {
  if (node.dayKey !== dayKey) return 0;
  return whole(node.dailyCounts?.[verbId], 0);
}

function dailyLimitFor(def, verbId, ctx = {}) {
  const rule = def.dailyLimit;
  if (!rule || rule.verb !== verbId) return null;
  let limit = rule.base;
  const owned = new Set(asList(ctx.upgrades));
  for (const [upgrade, value] of Object.entries(rule.upgrades || {})) {
    if (owned.has(upgrade)) limit = Math.max(limit, value);
  }
  return limit;
}

function findTool(verb, inv, toolState, wear) {
  const owned = verb.tools.filter((id) => countItem(inv, id) >= 1);
  if (!owned.length) return { tool: null, owned: false };
  if (!toolState) return { tool: owned[0], owned: true };
  for (const id of owned) {
    if (canUseTool(toolState, id, Math.max(1, wear)).ok) return { tool: id, owned: true };
  }
  return { tool: null, owned: true, broken: owned[0] };
}

function fail(reason, message, extra = {}) {
  return { ok: false, reason, message, msgs: [message], ...extra };
}

function toolMissingMessage(def, verb) {
  if (verb.tools.includes('scraper')) return def.classTsid === 'ice_knob' ? "You'll need a working Scraper first." : "You'll need a working scraper first.";
  if (verb.tools.includes('shovel')) return def.classTsid === 'dirt_pile' ? 'You need a working shovel.' : "You'll need a working shovel first.";
  if (verb.tools.includes('watering_can')) return 'You need a working watering can.';
  if (verb.tools.includes('firefly_jar')) return 'You need a Firefly Jar.';
  return 'You need the right tool.';
}

/**
 * Evaluate a verb without mutating anything. Returns { ok, ... } with the
 * resolved package details, tool, and costs, or a failure object.
 */
function gateVerb(node, inv, pc, ctx = {}) {
  const def = getResourceNodeDef(node?.classTsid);
  if (!def) return fail('unknown_node', 'There is nothing to harvest here.');
  const verb = verbDef(def, ctx.verbId);
  if (!verb) return fail('unknown_verb', `You can't ${ctx.verbId} a ${def.label}.`);
  const now = ctx.now ?? Date.now();
  const dayKey = currentDayKey({ ...ctx, now });
  const skills = learnedSkills(ctx);
  const base = { def, verb, now, dayKey, skills };

  // Skill / achievement gates (GSJS conditions).
  if (verb.skillGate && ctx.requireSkill !== false && !skills.includes(verb.skillGate)) {
    const message = def.classTsid === 'npc_sloth'
      ? "Hey, you're not metal enough to offer me a rod. You must first learn Animal Kinship 3."
      : `You need ${verb.skillGate.replace(/_/g, ' ')}.`;
    return fail('skill', message, { skill: verb.skillGate });
  }
  if (verb.achievement && ctx.requireAchievement !== false && !asList(ctx.achievements).includes(verb.achievement)) {
    return fail('achievement', 'You need the Firefly Whisperer achievement.', { achievement: verb.achievement });
  }

  const pkg = verb.skillPackage ? resolveResourceSkillPackage(verb.skillPackage, skills, ctx.upgrades) : null;
  const wear = pkg?.tool_wear ?? verb.toolWear ?? 0;
  let costs = {
    energy: pkg ? (pkg.energy_cost || 0) : verb.energy,
    mood: pkg ? (pkg.mood_bonus || 0) : verb.mood,
    xp: pkg ? (pkg.xp_bonus || 0) : verb.xp,
    toolWear: wear,
  };
  let durationMs = pkg ? pkg.duration : verb.durationMs;

  // State gates per node model.
  if (def.stock.model === 'respawn') {
    if (node.depleted || node.units < 1) {
      return fail('depleted', def.classTsid === 'dust_trap' ? 'The Dust Trap is resetting.' : `The ${def.label} is gone. Another will turn up soon.`);
    }
  } else if (def.stock.model === 'grow') {
    if (node.units < def.stock.harvestableAt) {
      const msg = {
        mortar_barnacle: 'This barnacle is not ready yet!',
        ice_knob: 'This Ice Nubbin is not ready yet!',
        jellisac: 'This Jellisac is not ready yet!',
        dirt_pile: "There isn't enough dirt left to dig.",
        peat_1: 'No more peat here!',
      }[def.classTsid] || 'Not ready yet.';
      return fail('not_ready', msg);
    }
  } else if (def.stock.model === 'tend') {
    if (verb.id === 'harvest' && node.units < 1) return fail('not_ready', "There's nothing to pick, cowboy!");
    if (verb.id === 'water' && node.watered) return fail('not_wanted', "I don't want to be watered!");
    if (verb.id === 'pet' && node.petted) return fail('not_wanted', "I don't want to be petted!");
  } else if (def.stock.model === 'session') {
    if (verb.id === 'knock') {
      if (node.out) return fail('already_out', 'The Sloth is already here');
      if (node.lastMetalizeAt && now - node.lastMetalizeAt < def.session.fullCooldownMs) {
        return fail('full', "Sod off, I'm full!");
      }
    }
    if (verb.id === 'feed') {
      if (!node.out) return fail('hidden', 'The Sloth is hiding up in the branches. Knock first.');
      if (node.busyUntil && now < node.busyUntil) return fail('busy', "I'm busy, you fool!");
      if (node.units < 1) return fail('full', "Sod off, I'm full!");
    }
  }

  // Daily limits (per player per node per game day).
  const limit = dailyLimitFor(def, verb.id, ctx);
  if (limit != null && dailyUses(node, verb.id, dayKey) >= limit) {
    const msg = {
      dirt_pile: "You've dug this dirt pile enough for today.",
      peat_1: limit > 1 ? "You can't harvest this peat more than twice per game day." : "You can't harvest this peat more than once per game day.",
      paper_tree: 'You can only harvest from this tree once per game day.',
    }[def.classTsid] || 'You have done that enough for today.';
    return fail('daily_limit', msg, { limit });
  }

  // Required inputs (Sloth: metal rod).
  for (const input of verb.inputs || []) {
    if (countItem(inv, input.classTsid) < input.qty) {
      const msg = def.classTsid === 'npc_sloth'
        ? (verb.id === 'knock' ? "I ain't comin' down, brah. You don't have any Metal Rods!" : "You don't have any metal rods!")
        : `You need ${plural(input.qty, input.classTsid)}.`;
      return fail('no_input', msg, { input: input.classTsid });
    }
  }

  // Tools.
  let toolUsed = null;
  if (verb.tools.length) {
    const found = findTool(verb, inv, ctx.toolState, wear);
    if (!found.tool) {
      if (found.owned) {
        const label = itemName(found.broken || verb.tools[0]);
        return fail('broken_tool', `This ${label} has become broken, and must be repaired.`, { tool: found.broken });
      }
      return fail('no_tool', toolMissingMessage(def, verb), { tools: [...verb.tools] });
    }
    toolUsed = found.tool;
  }

  // Firefly-specific gates (firefly_jar.js open conditions).
  if (def.classTsid === 'npc_firefly') {
    const jar = normalizeFireflyJarState(ctx.jar || {});
    if (jar.flies >= FIREFLY_JAR_MAX) return fail('jar_full', 'Your Firefly Jar is full!');
    if ((pc?.energy || 0) <= 20) return fail('energy', "You don't have enough energy to do that.", { needed: 21 });
  }

  // Energy (inc_skill_packages: fails when energy <= energy_cost).
  if (verb.skillPackage && costs.energy > 0 && (pc?.energy || 0) <= costs.energy) {
    return fail('energy', `Needs more than ${costs.energy} energy (you have ${Math.floor(pc?.energy || 0)}).`, { needed: costs.energy + 1 });
  }

  return { ok: true, ...base, pkg, costs, durationMs, toolUsed, limit };
}

/**
 * List verbs for a node with availability. Auto verbs (Dust Trap trigger)
 * are omitted unless ctx.includeAuto is true.
 */
export function resourceNodeVerbs(node, inv, pc, ctx = {}) {
  const def = getResourceNodeDef(node?.classTsid);
  if (!def) return [];
  const out = [];
  for (const verb of def.verbs) {
    if (verb.auto && !ctx.includeAuto) continue;
    if (def.classTsid === 'npc_sloth' && ((verb.id === 'knock' && node.out) || (verb.id === 'feed' && !node.out))) {
      continue;
    }
    const gate = gateVerb(node, inv, pc, { ...ctx, verbId: verb.id });
    out.push({
      id: verb.id,
      label: verb.label,
      tooltip: verb.tooltip,
      enabled: gate.ok,
      reason: gate.ok ? null : gate.reason,
      message: gate.ok ? '' : gate.message,
      durationMs: gate.ok ? gate.durationMs : verb.durationMs,
      costs: gate.ok ? gate.costs : { energy: verb.energy, mood: verb.mood, xp: verb.xp, toolWear: verb.toolWear },
      tool: gate.ok ? gate.toolUsed : null,
      tools: [...verb.tools],
      auto: verb.auto === true,
    });
  }
  return out;
}

function bumpDaily(node, verbId, dayKey) {
  if (node.dayKey !== dayKey) {
    node.dayKey = dayKey;
    node.dailyCounts = {};
  }
  node.dailyCounts[verbId] = whole(node.dailyCounts[verbId], 0) + 1;
}

function applyMetabolics(pc, costs) {
  // G289: metabolics_lose_energy, nothing lost while dead (inc_metabolics.js 108-122).
  if (costs.energy) loseEnergy(pc, costs.energy);
  if (costs.mood > 0) {
    // G278: a package's mood_bonus is metabolics_add_mood
    // (inc_skill_packages.js 524), refused while dead (inc_metabolics.js
    // 79-86) and capped at the tank; costs.mood keeps what landed.
    const before = Number(pc.mood) || 0;
    if (metabolicGain('mood').ok) pc.mood = Math.min(moodMax(pc), before + costs.mood);
    costs.mood = Math.max(0, (Number(pc.mood) || 0) - before);
  } else if (costs.mood) {
    loseMood(pc, -costs.mood);
  }
  if (costs.xp && costs.xpNoBonus) {
    // firefly_jar.js 383: the full jar's iMG is a cultivation reward, paid
    // with no_bonus (magic_rock.js 429).
    if (pc.imagination != null) pc.imagination = (pc.imagination || 0) + costs.xp;
    if (pc.xp != null) pc.xp = (pc.xp || 0) + costs.xp;
  } else if (costs.xp) {
    // inc_skill_packages.js 532 and the items' own verbs (stats_add_xp(n,
    // false)) take the mood bonus; the activity line shows what landed.
    costs.xp = grantMoodXp(pc, costs.xp);
  }
}

/**
 * Perform one verb on a node. All checks happen first; node, inventory, pc,
 * tool condition and jar mutate together only on success.
 *
 * @param {object} node
 * @param {Record<string, number>} inv
 * @param {{ energy?: number, mood?: number, imagination?: number, xp?: number }} pc
 * @param {{ verbId?: string, skills?: string[], upgrades?: string[], achievements?: string[],
 *   toolState?: object, rng?: () => number, now?: number, dayKey?: string,
 *   jar?: { flies: number }, nearby?: object[] }} [ctx]
 */
export function harvestResourceNode(node, inv, pc, ctx = {}) {
  const gate = gateVerb(node, inv, pc, ctx);
  const def = getResourceNodeDef(node?.classTsid);
  const verbId = gate.verb?.id || ctx.verbId || null;
  if (!gate.ok) return { ...gate, classTsid: node?.classTsid || null, verbId };
  const { verb, now, dayKey, pkg } = gate;
  const rng = ctx.rng || Math.random;
  let costs = { ...gate.costs };
  let durationMs = gate.durationMs;
  const outputs = [];
  const msgs = [];
  const achievementCounters = [];
  const extra = {};
  let toolWear = costs.toolWear;

  // ---- Plan (rng rolls, no mutation) -------------------------------------
  let plan = null;
  switch (def.classTsid) {
    case 'npc_firefly': {
      const jar = ctx.jar && typeof ctx.jar === 'object' ? ctx.jar : createFireflyJarState();
      const startFlies = normalizeFireflyJarState(jar).flies;
      const candidates = [node, ...asList(ctx.nearby).filter((n) => n && n !== node
        && n.classTsid === 'npc_firefly' && !n.depleted && n.units >= 1)];
      let energy = (pc.energy || 0) - 5;
      let flies = startFlies;
      let ticks = 0;
      const captured = [];
      while (true) {
        if (energy <= 10) break;
        if (flies >= FIREFLY_JAR_MAX) break;
        const next = candidates.shift();
        if (!next) break;
        captured.push(next);
        flies += 1;
        ticks += 1;
        if (ticks >= 2) energy -= 5;
        if (ticks >= 12) break;
      }
      const full = flies >= FIREFLY_JAR_MAX;
      costs = { energy: (pc.energy || 0) - energy, mood: 0, xp: full ? 25 : 0, xpNoBonus: true, toolWear: 0 };
      durationMs = 1000 * (ticks + 1);
      plan = { jar, startFlies, flies, captured, full };
      break;
    }
    case 'npc_salmon': {
      const boot = rng() < 0.1;
      outputs.push(boot ? { classTsid: 'boot', qty: 1 } : { classTsid: 'salmon', qty: 1 });
      costs = { energy: 4, mood: 0, xp: 0, toolWear: 0 };
      plan = { boot };
      break;
    }
    case 'mortar_barnacle': {
      outputs.push({ classTsid: 'barnacle', qty: pkg.bonus_amount || 1 });
      // items/item.js:738 notifyVerb: <class>:<verb> once per successful verb (Decrustifier badges).
      achievementCounters.push({ counter: 'mortar_barnacle:scrape', amount: 1 });
      break;
    }
    case 'ice_knob': {
      const chance = randInt(1, 100, rng);
      let qty;
      if (asList(ctx.upgrades).includes('ice_scraping_yield')) {
        qty = chance < 40 ? 2 : chance < 70 ? 3 : chance < 90 ? 4 : 5;
      } else {
        qty = chance < 50 ? 1 : chance < 80 ? 2 : 3;
      }
      outputs.push({ classTsid: 'ice', qty });
      achievementCounters.push({ counter: 'ice:ice_received', amount: qty });
      break;
    }
    case 'jellisac': {
      const qty = pkg.bonus_amount || 1;
      outputs.push({ classTsid: 'jellisac_clump', qty });
      if (pkg.bonus_multiplier && rng() < (pkg.bonus_chance || 0)) {
        const bonus = qty * (pkg.bonus_multiplier - 1);
        outputs.push({ classTsid: 'jellisac_clump', qty: bonus, superHarvest: true });
        extra.superHarvest = { classTsid: 'jellisac_clump', qty: bonus };
      }
      // item.js:738 notifyVerb (Goo Getter, Gloopmeister and the rest).
      achievementCounters.push({ counter: 'jellisac:scoop', amount: 1 });
      break;
    }
    case 'dirt_pile': {
      const dropChance = Number(pkg.drop_chance) || 0;
      const drop = pkg.drop_class_id && dropChance > 0 && rng() < Math.min(100, dropChance) / 100
        ? rollDropTable(pkg.drop_class_id, rng)
        : [];
      if (drop.length) outputs.push(...drop);
      // Multiplayer help dig (dirt_pile.js onDigComplete 380-389): the crew's Loam chance came up.
      else if (ctx.loamBonus === true) outputs.push({ classTsid: 'loam', qty: pkg.bonus_amount || 2 });
      else outputs.push({ classTsid: 'earth', qty: pkg.bonus_amount || 2 });
      achievementCounters.push({ counter: 'dug:dirt', amount: 1 });
      break;
    }
    case 'peat_1': {
      let qty = pkg.bonus_amount || 3;
      if (asList(ctx.upgrades).includes('bogspecialization_more_peat')) qty += Math.round(qty * 0.25);
      outputs.push({ classTsid: 'peat', qty });
      achievementCounters.push({ counter: 'completed_harvest:peat_bog', amount: qty });
      break;
    }
    case 'paper_tree': {
      if (verb.id === 'harvest') {
        const want = asList(ctx.upgrades).includes('gardening_harvest_paper') ? 8 : 5;
        outputs.push({ classTsid: 'paper', qty: Math.min(want, node.units) });
        // item.js:738 notifyVerb (Paper Plucker, Pad Pincher and the rest).
        achievementCounters.push({ counter: 'paper_tree:harvest', amount: 1 });
      } else if (verb.id === 'water') {
        achievementCounters.push({ counter: 'trants_watered:paper_tree', amount: 1 });
      }
      break;
    }
    case 'npc_sloth': {
      if (verb.id === 'knock') {
        durationMs = def.session.callDelayMs;
      } else {
        const max = chooseOne([7, 8, 9, 10], rng);
        // createSnail: first spit after chew_secs 2-5 s; each spit schedules the
        // next after its own chew; metalizeComplete 1.5 s after the last spit.
        let ms = chooseOne([2, 3, 4, 5], rng) * 1000;
        let count = 0;
        while (count < max) {
          let spit = 1;
          let chew = 2500;
          if (rng() >= 0.3) {
            chew = chooseOne([2.5, 3, 4, 5, 6], rng) * 1000;
            spit = chooseOne([1, 2, 3, 4], rng);
          }
          spit = Math.min(spit, max - count);
          count += spit;
          ms += count < max ? chew : 1500;
        }
        durationMs = ms;
        outputs.push({ classTsid: 'snail', qty: max });
        achievementCounters.push({ counter: 'sloth:snails_received', amount: max });
        if (node.sessionFeeds + 1 > 7) achievementCounters.push({ counter: 'sloth:fed_until_full', amount: 1 });
      }
      break;
    }
    case 'dust_trap': {
      const check = rng();
      const organelle = DUST_TRAP_ORGANELLES.find((o) => check <= o.upTo) || null;
      if (organelle) {
        extra.baqalaSeconds = organelle.seconds;
        extra.organelle = organelle.id;
      } else {
        outputs.push(...rollDropTable('dust_trap', rng));
      }
      const readyFor = node.readySince ? Math.max(0, (now - node.readySince) / 1000) : 0;
      let reset = node.readySince ? 2 * readyFor : def.reset.minMs / 1000;
      if (reset < def.reset.minMs / 1000 || reset / 2 > def.reset.fullResetMs / 1000) reset = def.reset.minMs / 1000;
      else if (reset > def.reset.maxMs / 1000) reset = def.reset.maxMs / 1000;
      plan = { resetMs: Math.round(reset * 1000) };
      achievementCounters.push({ counter: 'dust_trap:trigger', amount: 1 });
      break;
    }
    default:
      break;
  }
  toolWear = costs.toolWear;

  // ---- Commit -------------------------------------------------------------
  if (verb.inputs) {
    for (const input of verb.inputs) {
      if (input.consumed && !removeItem(inv, input.classTsid, input.qty)) {
        return fail('no_input', "You don't have any metal rods!", { classTsid: def.classTsid, verbId });
      }
    }
  }
  applyMetabolics(pc, costs);
  for (const out of outputs) addItem(inv, out.classTsid, out.qty);
  const toolUse = gate.toolUsed && ctx.toolState && toolWear > 0
    ? useToolCondition(ctx.toolState, gate.toolUsed, toolWear)
    : null;
  if (def.dailyLimit && def.dailyLimit.verb === verb.id) bumpDaily(node, verb.id, dayKey);
  node.totalHarvests = whole(node.totalHarvests, 0) + 1;

  switch (def.classTsid) {
    case 'npc_firefly': {
      plan.jar.flies = plan.flies;
      for (const captured of plan.captured) {
        captured.units = 0;
        captured.depleted = true;
        captured.respawnAt = now + def.respawnMs;
      }
      const n = plan.captured.length;
      extra.jar = plan.jar;
      extra.fireflies = n;
      extra.captured = plan.captured;
      extra.jarFull = plan.full;
      if (n) achievementCounters.push({ counter: 'firefly_jar:fireflies_caught', amount: n });
      if (plan.full) achievementCounters.push({ counter: 'firefly_jar:full', amount: 1 });
      msgs.push(n
        ? `You whistle up ${n} ${n === 1 ? 'Firefly' : 'Fireflies'}. Your Firefly Jar holds ${plan.flies}/${FIREFLY_JAR_MAX}.`
        : 'You whistle, but no Fireflies come.');
      if (costs.energy > 5) msgs.push(`Whew! Whistlin' is hard work. You lose ${costs.energy} energy.`);
      if (plan.full) msgs.push('Your Firefly Jar is full! +25 iMG');
      break;
    }
    case 'npc_salmon': {
      node.units = 0;
      node.depleted = true;
      node.respawnAt = now + def.respawnMs;
      msgs.push(plan.boot ? 'Huh, looked like a fish at first.' : 'You pocketed a Salmon.');
      extra.boot = plan.boot;
      // items/item.js:738 notifyVerb counts npc_salmon:pocket only on success;
      // the boot sets failed (npc_salmon.js:195-198). Heebo's Happy Accident
      // rides on it (npc_salmon.js:207, js/solo-feats.js).
      if (!plan.boot) achievementCounters.push({ counter: 'npc_salmon:pocket', amount: 1 });
      break;
    }
    case 'mortar_barnacle':
    case 'ice_knob':
    case 'jellisac': {
      node.units = def.stock.afterHarvest;
      node.regrowAt = now + regrowDelayMs(def, rng);
      const verbPast = def.classTsid === 'jellisac' ? 'scooped' : 'scraped';
      msgs.push(`You ${verbPast} ${outputs.map((o) => plural(o.qty, o.classTsid)).join(' and ')}.`);
      if (extra.superHarvest) msgs.push(`Super Harvest! +${plural(extra.superHarvest.qty, 'jellisac_clump')}`);
      break;
    }
    case 'dirt_pile': {
      node.units = Math.max(def.stock.min, node.units - 1);
      node.regrowAt = now + def.regrow.minMs;
      msgs.push(`You dug ${outputs.map((o) => plural(o.qty, o.classTsid)).join(' and ')}.`);
      if (node.units <= def.stock.min) msgs.push('The dirt pile is all dug out.');
      break;
    }
    case 'peat_1': {
      node.units = Math.max(0, node.units - 1);
      node.regrowAt = now + regrowDelayMs(def, rng);
      msgs.push(`You harvested ${outputs.map((o) => plural(o.qty, o.classTsid)).join(' and ')}.`);
      break;
    }
    case 'paper_tree': {
      if (verb.id === 'harvest') {
        node.units = Math.max(0, node.units - outputs[0].qty);
        msgs.push(`You harvested ${plural(outputs[0].qty, 'paper')}.`);
      } else {
        if (verb.id === 'water') node.watered = true;
        else node.petted = true;
        msgs.push(verb.id === 'water' ? 'You watered the Paper Tree.' : 'You petted the Paper Tree.');
        if (node.watered && node.petted) {
          const before = node.units;
          node.units = Math.min(def.stock.max, node.units + def.tend.refill);
          node.needsResetAt = now + def.tend.resetMs;
          extra.paperAdded = node.units - before;
          msgs.push('The Paper Tree rustles happily and sprouts fresh paper.');
        }
      }
      break;
    }
    case 'npc_sloth': {
      if (verb.id === 'knock') {
        node.out = true;
        node.units = def.stock.max;
        node.sessionFeeds = 0;
        node.hideAt = now + def.session.callDelayMs + def.session.idleHideMs;
        msgs.push('You knock. The Sloth comes down to hang out.');
      } else {
        node.sessionFeeds = whole(node.sessionFeeds, 0) + 1;
        node.units = Math.max(0, def.stock.max - node.sessionFeeds);
        node.busyUntil = now + durationMs;
        node.lastMetalizeAt = node.busyUntil;
        if (node.sessionFeeds > 7) {
          node.hideAt = node.busyUntil;
          msgs.push(`The Sloth chews the Metal Rod and spits out ${plural(outputs[0].qty, 'snail')}. That was SO METAL! It climbs away, stuffed.`);
        } else {
          node.hideAt = node.busyUntil + def.session.idleHideMs;
          msgs.push(`The Sloth chews the Metal Rod and spits out ${plural(outputs[0].qty, 'snail')}. That was SO METAL!`);
        }
      }
      break;
    }
    case 'dust_trap': {
      node.units = 0;
      node.depleted = true;
      node.triggeredAt = now;
      node.respawnAt = now + plan.resetMs + 1250;
      extra.resetMs = plan.resetMs;
      if (extra.organelle) {
        const o = DUST_TRAP_ORGANELLES.find((x) => x.id === extra.organelle);
        msgs.push(`You found ${o.label}, a remnant from your Glitchian ancestors. Your time has increased by ${o.seconds} seconds!`);
      } else if (outputs.length) {
        msgs.push(`You got ${outputs.map((o) => plural(o.qty, o.classTsid)).join(', ')}!`);
      }
      break;
    }
    default:
      break;
  }
  if (toolUse?.broke) msgs.push(toolUse.msg);

  return {
    ok: true,
    reason: verb.id,
    message: msgs[0] || '',
    msgs,
    classTsid: def.classTsid,
    verbId: verb.id,
    outputs,
    costs,
    effects: {
      energy: -costs.energy,
      mood: costs.mood,
      xp: costs.xp,
      img: costs.xp,
      activityLine: msgs[0] || '',
    },
    toolUsed: gate.toolUsed,
    toolUse,
    durationMs,
    skill: pkg?.skill || null,
    achievementCounters,
    node,
    ...extra,
  };
}

// ---------------------------------------------------------------------------
// Pocket Salmon: Release (register G178)
// ---------------------------------------------------------------------------

/**
 * items/salmon.js 30-100 verbs.release, the Pocket Salmon's pack verb
 * ("Release the Salmon!", sort_on 50, is_single, in_pack only).
 *
 * conditions (43-61): only in hub 136 (Jal) or 140 (Samudra), and only while
 * the location holds fewer than 71 npc_salmon; otherwise state null, so the
 * button is hidden, never greyed out.
 *
 * handler (62-99): createItemStack('npc_salmon', 1, pc.x, pc.y) puts a live
 * Salmon back in the water where you stand (71), metabolics_add_energy(-4)
 * (73, no energy gate; the effect shows what was actually lost),
 * stats_add_xp(5, false) (82, the mood bonus applies), SALMON_RELEASE (91),
 * feats_increment('animal_love', 1) (92), then the Pocket Salmon is deleted
 * (97). The message is item.js buildVerbMessage(1, 'release', 'released'):
 * "You released a Pocket Salmon. " plus the effects ("-4 Energy +5 iMG",
 * item.js transformEffects / formatEffectsList). notifyVerb counts
 * salmon:release (item.js:738), which solo Feats read as Heebo's Happy
 * Accident +1.
 */
export const SALMON_RELEASE = Object.freeze({
  classTsid: 'salmon',
  verb: 'release',
  label: 'Release',
  tooltip: 'Release the Salmon!',
  hubs: Object.freeze(['136', '140']),
  maxSalmon: 71,
  energy: 4,
  xp: 5,
  sound: 'SALMON_RELEASE',
  counter: 'salmon:release',
  source: 'items/salmon.js 30-100 verbs.release',
});

/** salmon.js 43-61: { state: 'enabled' } or { state: null, reason } (hidden). */
export function salmonReleaseConditions({ hubId = '', salmonCount = 0 } = {}) {
  if (!SALMON_RELEASE.hubs.includes(String(hubId ?? ''))) return { state: null, reason: 'hub' };
  if (whole(salmonCount) >= SALMON_RELEASE.maxSalmon) return { state: null, reason: 'crowded' };
  return { state: 'enabled' };
}

/**
 * Run the release on the pack and the player. Checks first, then mutates
 * inv (one Pocket Salmon) and pc (energy, iMG with the mood bonus).
 * Returns { ok, reason?, message, msgs, costs: { energy, xp }, sound,
 * achievementCounters }. Where the Salmon swims back in is the caller's
 * (pickReleasedSalmon, respawnReleasedSalmon).
 */
export function releaseSalmon(inv, pc, { hubId = '', salmonCount = 0 } = {}) {
  const gate = salmonReleaseConditions({ hubId, salmonCount });
  if (gate.state !== 'enabled') return { ok: false, reason: gate.reason, message: '', msgs: [] };
  if (countItem(inv, SALMON_RELEASE.classTsid) < 1) return { ok: false, reason: 'no_salmon', message: '', msgs: [] };
  removeItem(inv, SALMON_RELEASE.classTsid, 1);
  const before = Math.max(0, Number(pc?.energy) || 0);
  if (pc) loseEnergy(pc, SALMON_RELEASE.energy); // G289 loss gate
  const energy = before - Math.max(0, Number(pc?.energy) || 0);
  const xp = pc ? grantMoodXp(pc, SALMON_RELEASE.xp) : 0;
  const effects = [];
  if (energy) effects.push(`-${energy} Energy`);
  if (xp) effects.push(`+${xp} iMG`);
  const def = RESOURCE_ITEM_DEFS.salmon;
  const message = `You released a ${def?.label || 'Pocket Salmon'}. ${effects.join(' ')}`.trim();
  return {
    ok: true,
    message,
    msgs: [message],
    costs: { energy, xp },
    sound: SALMON_RELEASE.sound,
    achievementCounters: [{ counter: SALMON_RELEASE.counter, amount: 1 }],
  };
}

/**
 * The street Salmon that comes back: the pocketed one (waiting on its
 * respawn) nearest x, so the street keeps its count, or null when every
 * Salmon is already swimming (the caller adds one). Rows are
 * { classTsid, x, node }.
 */
export function pickReleasedSalmon(rows, x = 0) {
  let best = null;
  for (const row of Array.isArray(rows) ? rows : []) {
    if (row?.classTsid !== 'npc_salmon' || !row.node?.depleted) continue;
    const d = Math.abs((Number(row.x) || 0) - (Number(x) || 0));
    if (!best || d < best.d) best = { row, d };
  }
  return best?.row || null;
}

/** A pocketed Salmon node swims again now (instead of after its 10 s respawn). */
export function respawnReleasedSalmon(node) {
  if (node?.classTsid !== 'npc_salmon') return false;
  const def = getResourceNodeDef('npc_salmon');
  node.units = def.stock.max;
  node.depleted = false;
  node.respawnAt = 0;
  return true;
}

/** Live Salmon on the street (salmon.js:44 find_items('npc_salmon')). */
export function swimmingSalmonCount(rows) {
  return (Array.isArray(rows) ? rows : []).filter((row) => row?.classTsid === 'npc_salmon' && !row.node?.depleted).length;
}

// ---------------------------------------------------------------------------
// Presentation
// ---------------------------------------------------------------------------

function secondsLeft(at, now) {
  return Math.max(0, Math.ceil(((at || 0) - now) / 1000));
}

export function resourceNodeStatusLabel(node, now = Date.now()) {
  const def = getResourceNodeDef(node?.classTsid);
  if (!def) return '';
  switch (def.classTsid) {
    case 'npc_firefly':
    case 'npc_salmon':
      return node.depleted ? `Gone · back in ${secondsLeft(node.respawnAt, now)}s` : '';
    case 'dust_trap':
      return node.depleted ? `Resetting · ${secondsLeft(node.respawnAt, now)}s` : 'Armed';
    case 'mortar_barnacle':
    case 'ice_knob':
    case 'jellisac': {
      const states = def.sprite.states;
      const state = states[Math.max(0, Math.min(states.length - 1, node.units - 1))];
      if (node.units >= def.stock.max) return 'Ready to harvest';
      return `${state[0].toUpperCase()}${state.slice(1)} · grows in ${secondsLeft(node.regrowAt, now)}s`;
    }
    case 'dirt_pile':
      return node.units > 1 ? `${node.units - 1} digs of dirt` : 'Dug out · refilling';
    case 'peat_1':
      return node.units > 0 ? `${node.units} harvest${node.units === 1 ? '' : 's'} left` : 'No more peat · regrowing';
    case 'paper_tree': {
      const wants = [!node.watered && 'water', !node.petted && 'petting'].filter(Boolean);
      return `${node.units} paper${wants.length ? ` · wants ${wants.join(' and ')}` : ''}`;
    }
    case 'npc_sloth':
      if (node.busyUntil && now < node.busyUntil) return 'Munching a Metal Rod';
      return node.out ? 'Hanging out · hungry for Metal Rods' : 'Hiding in the branches';
    default:
      return '';
  }
}

/**
 * Which sheet + frame to draw for the node's current state.
 * Returns { art: 'raster', hidden, sheetKey, sheet, frameIndex, rect, animate, loop }
 * or { art: 'vector', state, vector } for the Sloth.
 */
export function resourceNodeFrame(node, now = Date.now()) {
  const def = getResourceNodeDef(node?.classTsid);
  if (!def) return null;
  if (def.art === 'vector') {
    let state = 'hidden';
    if (node.busyUntil && now < node.busyUntil) state = 'eating';
    else if (node.out) state = 'idle';
    return { art: 'vector', state, vector: def.vector };
  }
  const sprite = def.sprite;
  let sheetKey = node.variant && sprite.sheets[node.variant] ? node.variant : sprite.defaultSheet;
  let frameIndex = 0;
  let animate = false;
  let hidden = false;
  switch (def.classTsid) {
    case 'npc_firefly':
    case 'npc_salmon':
      hidden = !!node.depleted;
      animate = !hidden;
      if (def.classTsid === 'npc_salmon') sheetKey = sprite.defaultSheet;
      break;
    case 'mortar_barnacle':
    case 'ice_knob':
    case 'jellisac':
      frameIndex = Math.max(0, node.units - 1);
      break;
    case 'dirt_pile':
      frameIndex = 11 - Math.max(1, Math.min(11, node.units));
      break;
    case 'peat_1':
      frameIndex = 4 - Math.max(0, Math.min(4, node.units));
      break;
    case 'paper_tree':
      sheetKey = `pet${node.petted ? 'False' : 'True'}Water${node.watered ? 'False' : 'True'}`;
      frameIndex = Math.max(0, Math.min(21, node.units));
      break;
    case 'dust_trap':
      if (!node.depleted) {
        sheetKey = 'idle';
      } else if (now - (node.triggeredAt || 0) < 2000) {
        sheetKey = 'smackDown';
        frameIndex = Math.min(44, Math.floor(((now - (node.triggeredAt || 0)) / 2000) * 45));
        animate = true;
      } else if ((node.respawnAt || 0) - now <= 1000) {
        sheetKey = 'up';
        frameIndex = Math.min(15, Math.max(0, Math.floor((1 - ((node.respawnAt || 0) - now) / 1000) * 16)));
        animate = true;
      } else {
        sheetKey = 'down';
      }
      break;
    default:
      break;
  }
  const sheetDef = sprite.sheets[sheetKey];
  return {
    art: 'raster',
    hidden,
    sheetKey,
    sheet: sheetDef,
    frameIndex,
    rect: sheetFrameRect(sheetDef, frameIndex),
    animate,
    loop: sheetDef.loop === true,
  };
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

/** Sanitize a saved node; returns null for unknown classes. */
export function normalizeResourceNode(saved) {
  if (!saved || typeof saved !== 'object') return null;
  const resolved = resolveClass(saved.classTsid);
  if (!resolved) return null;
  const { def } = resolved;
  const node = createResourceNode(def.classTsid, {
    variant: saved.variant || resolved.variant || undefined,
    units: saved.units,
  });
  node.depleted = def.stock.model === 'respawn' ? (saved.depleted === true || node.units < 1) : false;
  if (def.stock.model === 'respawn' && node.depleted) node.units = 0;
  node.regrowAt = def.stock.model === 'grow' && node.units < def.stock.max ? time(saved.regrowAt) : 0;
  node.respawnAt = node.depleted ? time(saved.respawnAt) : 0;
  node.dayKey = typeof saved.dayKey === 'string' ? saved.dayKey : '';
  node.dailyCounts = {};
  if (saved.dailyCounts && typeof saved.dailyCounts === 'object') {
    for (const verb of def.verbs) {
      const n = whole(saved.dailyCounts[verb.id], 0, 0, 99);
      if (n > 0) node.dailyCounts[verb.id] = n;
    }
  }
  node.totalHarvests = whole(saved.totalHarvests, 0);
  if (def.classTsid === 'paper_tree') {
    node.petted = saved.petted === true;
    node.watered = saved.watered === true;
    node.needsResetAt = node.petted && node.watered ? time(saved.needsResetAt) : 0;
  }
  if (def.classTsid === 'npc_sloth') {
    node.out = saved.out === true;
    node.hideAt = node.out ? time(saved.hideAt) : 0;
    node.busyUntil = time(saved.busyUntil);
    node.sessionFeeds = whole(saved.sessionFeeds, 0, 0, def.stock.max);
    node.units = Math.max(0, def.stock.max - node.sessionFeeds);
    node.lastMetalizeAt = time(saved.lastMetalizeAt);
  }
  if (def.classTsid === 'dust_trap') {
    node.readySince = time(saved.readySince);
    node.triggeredAt = node.depleted ? time(saved.triggeredAt) : 0;
  }
  return node;
}

export function normalizeResourceNodes(list) {
  return asList(list).map(normalizeResourceNode).filter(Boolean);
}

// ---------------------------------------------------------------------------
// Items, starter kit, vendor
// ---------------------------------------------------------------------------

/** Register tools + yields (GSJS metadata) and fill in dust-trap drop items. */
export function ensureResourceItems() {
  for (const [classTsid, def] of Object.entries(RESOURCE_ITEM_DEFS)) {
    ensureItem(classTsid, {
      label: def.label,
      desc: def.desc,
      baseCost: def.baseCost,
      stackMax: def.stackMax,
      isTool: def.isTool === true,
    });
  }
  for (const [classTsid, def] of Object.entries(DUST_TRAP_DROP_ITEM_DEFS)) {
    if (ITEM_CATALOG[classTsid]) continue;
    ensureItem(classTsid, {
      label: def.label,
      desc: def.desc,
      baseCost: def.baseCost,
      stackMax: def.stackMax,
    });
  }
}

/** Demo starter kit for the new loops. */
export function starterResourceTools() {
  return {
    scraper: 1,
    shovel: 1,
    firefly_jar: 1,
  };
}

/** Tool vendor offers (currants; buy = GSJS base_cost, sell ~30% like mining). */
export function resourceVendorOffers() {
  return ['scraper', 'super_scraper', 'shovel', 'ace_of_spades', 'firefly_jar'].map((classTsid) => {
    const def = RESOURCE_ITEM_DEFS[classTsid];
    return {
      classTsid,
      label: def.label,
      buyPrice: def.baseCost,
      sellPrice: Math.round(def.baseCost * 0.3),
    };
  });
}

/** Every sprite path the catalog references (for preloading and tests). */
export function resourceSpritePaths() {
  const paths = new Set();
  for (const def of Object.values(RESOURCE_NODE_CATALOG)) {
    for (const s of Object.values(def.sprite?.sheets || {})) paths.add(s.path);
  }
  for (const byState of Object.values(FIREFLY_JAR_SHEETS)) {
    for (const s of Object.values(byState)) paths.add(s.path);
  }
  return [...paths];
}

/** Every item class this module can put in (or require from) a pack. */
export function resourceItemIds() {
  return [...new Set([
    ...Object.keys(RESOURCE_ITEM_DEFS),
    ...Object.keys(DUST_TRAP_DROP_ITEM_DEFS),
  ])];
}
