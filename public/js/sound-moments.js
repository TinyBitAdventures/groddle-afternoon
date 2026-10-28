/**
 * Which sound key plays at which in-game moment.
 *
 * Pure lookups (no audio), so tests can pin the mapping and game.js stays a
 * one-line `playSound(soundForVerb(...))` at each moment. Keys follow the
 * production names the GameServerJS announced (PET_PIGGY, CHICKEN_SQUEEZED,
 * HARVEST, the tool's own class name while working, ...); remake-only keys
 * (QUOIN_XP, SIGNPOST_TRAVEL, ...) fill moments the original never named.
 */

/** Legacy playSfx(name) ids from before the sound catalog. */
export const LEGACY_SFX_KEYS = Object.freeze({
  pet: 'PIGGY_PLOP',
  pickup: 'DISCOVER_USEFUL_NEW_ITEM',
  quest: 'QUEST_COMPLETE',
  start: 'CLIENT_LOADED',
  quoin: 'QUORAZY_QUOIN',
  jump: 'TRIPLE_JUMP',
  alert: 'QUEST_ADDED',
  eat: 'LEVEL_UP',
  spinningWheel: 'SPINNING_WHEEL',
  newDay: 'NEWDAY',
  step: 'FOOTSTEP',
  croak: 'CROAK',
  squish: 'SQUISH_GRAPES',
});

/** Map a legacy id (or pass a catalog key through unchanged). */
export function legacySoundKey(name) {
  const id = String(name || '');
  return LEGACY_SFX_KEYS[id] || id;
}

const TRANT_TREE_KEYS = {
  trant_bean: 'BEEN_TREE',
  trant_bubble: 'BUBBLE_TREE',
  trant_egg: 'EGG_TREE',
  trant_fruit: 'FRUIT_TREE',
  trant_gas: 'GAS_TREE',
  trant_spice: 'SPICE_TREE',
  paper_tree: 'PAPER_TREE',
};

/**
 * Sound for a finished world verb.
 * @param {string} classId target class
 * @param {string} verbId verb id (may carry ':target' suffix)
 * @param {{ ok?: boolean, harvest?: object, superHarvest?: boolean, animalKinship?: object, effects?: object }} [result]
 */
export function soundForVerb(classId, verbId, result = {}) {
  const cls = String(classId || '');
  const verb = String(verbId || '').split(':')[0];
  if (result && result.ok === false) return 'CLICK_FAILURE';
  // include/trants.js 325-346 and paper_tree.js 497: each tree's harvest plays its own sound, a super
  // harvest included (its rainbow brings RAINBOW_SUPERHARVEST a second later, game.js showSuperHarvestFx).
  if (verb === 'harvest' && (cls.startsWith('trant_') || cls === 'paper_tree')) return TRANT_TREE_KEYS[cls] || 'HARVEST';
  const superHarvest = result?.harvest?.superHarvest || result?.animalKinship?.superHarvest;
  if (superHarvest) return 'RAINBOW_SUPERHARVEST';
  if (cls === 'npc_piggy') {
    if (verb === 'pet') return 'PET_PIGGY';
    if (verb === 'nibble') return 'NIBBLE_PIGGY';
    if (verb === 'feed') return 'FEED_PIGGY';
    if (verb === 'talk_to') return 'PET_PIGGY';
  }
  if (cls === 'npc_chicken') {
    if (verb === 'squeeze') return 'CHICKEN_SQUEEZED';
    return 'HAPPY_CHICKEN';
  }
  if (cls === 'npc_butterfly') {
    if (verb === 'massage') return 'BUTTERFLY_LOTION';
    if (verb === 'milk' || verb === 'sing_to') return 'BUTTERFLY_SING';
    return 'BUTTERFLY_SING';
  }
  if (cls.startsWith('trant_') || cls === 'wood_tree' || cls === 'paper_tree') {
    if (verb === 'harvest') return 'HARVEST';
    if (verb === 'water') return 'WATERING_CAN';
    if (verb === 'pet') return 'PET_TRANT';
    if (TRANT_TREE_KEYS[cls]) return TRANT_TREE_KEYS[cls];
  }
  if (cls === 'garden_plot' || cls === 'garden' || cls === 'garden_new') {
    return soundForGardenAction(verb);
  }
  if (verb === 'mine') return 'PETRIFIED_ROCK';
  if (verb === 'pickup' || verb === 'take') return 'ITEM_PICKUP';
  if (verb === 'eat') return 'ITEM_EAT';
  if (verb === 'drink') return 'ITEM_DRINK';
  if (verb === 'water' || verb === 'water_all') return 'WATERING_CAN';
  if (verb === 'harvest') return 'HARVEST';
  if (verb === 'browse') return 'UI_PANEL_OPEN';
  if (verb === 'talk_to') return 'CLICK_SUCCESS';
  if (verb === 'pet') return 'PET_TRANT';
  return 'ITEM_PICKUP';
}

/**
 * Tool sound loop while a timed verb runs (the server announced the tool's
 * class name, looped, for skill packages and making jobs; trants.js loops
 * WATERING_CAN and stops it). Verbs without a tool (harvesting a trant,
 * petting, nibbling, squeezing, milking, massaging) play their sound once
 * when they finish (soundForVerb; items/include/trants.js announce_sound).
 * @returns {{ key: string, intervalMs: number } | null}
 */
export function actionLoopFor(classId, verbId) {
  const cls = String(classId || '');
  const verb = String(verbId || '').split(':')[0];
  if (verb === 'mine') return { key: 'PICK', intervalMs: 620 };
  if (cls === 'wood_tree' && verb === 'harvest') return { key: 'HATCHET', intervalMs: 700 };
  if (verb === 'water' || verb === 'water_all') return { key: 'WATERING_CAN', intervalMs: 900 };
  if (verb === 'smash') return { key: 'PICK', intervalMs: 600 };
  if (verb === 'hoe' || verb === 'clear') return { key: 'HOE', intervalMs: 700 };
  return null;
}

/** Garden plot actions (items/include/garden.js announces HOE and WATERING_CAN). */
export function soundForGardenAction(action) {
  const a = String(action || '');
  if (a === 'hoe' || a === 'clean' || a === 'clear') return 'HOE';
  if (a === 'water' || a === 'water_all') return 'WATERING_CAN';
  if (a === 'plant' || a.startsWith('plant')) return 'GARDEN_PLANT';
  if (a === 'harvest' || a.startsWith('harvest')) return 'HARVEST';
  return 'CLICK_SUCCESS';
}

/** Per-type quoin pickups (remake variants; Qurazy keeps its recovered file). */
const QUOIN_KEYS = {
  xp: 'QUOIN_XP',
  img: 'QUOIN_XP',
  mood: 'QUOIN_MOOD',
  energy: 'QUOIN_ENERGY',
  currants: 'QUOIN_CURRANTS',
  mystery: 'QUOIN_MYSTERY',
  favor: 'QUOIN_FAVOR',
  time: 'QUOIN_TIME',
  qurazy: 'QUORAZY_QUOIN',
};

export function soundForQuoin(type) {
  return QUOIN_KEYS[String(type || '').toLowerCase()] || 'QUOIN_GOT';
}

/** Machines (making_type machine) hum ACTIVE while they run (inc_making.js:440-442). */
export const MACHINE_MAKING_TOOLS = Object.freeze(['woodworker', 'metalmaker', 'fuelmaker', 'blockmaker']);

/** Making Metal (metalmaking_music) with the Metalmaker's music on; set by the supply feature. */
let metalMakingMusic = false;

export function setMetalMakingMusic(on) {
  metalMakingMusic = Boolean(on);
}

/**
 * Making tools announce their own class name (players/inc_making.js:478);
 * machines play ACTIVE instead, and a Metalmaker plays METALMAKER (metal
 * music) when isPlayingMusic: the Making Metal card and its music on
 * (metalmaker.js:787-800, 1535-1550).
 */
export function soundForMakingTool(toolClassTsid, opts = {}) {
  const t = String(toolClassTsid || '').trim();
  if (MACHINE_MAKING_TOOLS.includes(t)) {
    const music = opts.metalMusic ?? metalMakingMusic;
    return t === 'metalmaker' && music ? 'METALMAKER' : 'ACTIVE';
  }
  return t ? t.toUpperCase() : 'CRAFT_TICK';
}

/** Full-screen awards. */
export function soundForAward(kind) {
  switch (kind) {
    case 'quest': return 'QUEST_COMPLETE';
    case 'level': return 'LEVEL_UP';
    case 'achievement':
    case 'badge': return 'ACHIEVEMENT_UNLOCKED';
    case 'skill': return 'SKILL_ACHIEVED';
    default: return 'COMPLETE_QUEST_REQUIREMENT';
  }
}

/** Shrine donation tiers (items/include/shrines.js:634-649). */
export function soundForDonation(favorPoints = 0) {
  const n = Number(favorPoints) || 0;
  if (n >= 100) return 'DONATION_4TH_TIER';
  if (n >= 50) return 'DONATION_3RD_TIER';
  if (n >= 10) return 'DONATION_2ND_TIER';
  return 'DONATION_1ST_TIER';
}

/** Panels and dialogs, keyed by element id. */
const PANEL_KEYS = {
  'map-panel': ['OPEN_HUB_MAP', 'CLOSE_HUB_MAP'],
  'quest-panel': ['QUEST_DIALOGUE_BOX', 'QUEST_DIALOGUE_BOX_CLOSE'],
  'skills-panel': ['IMAGINATION_OPEN', 'IMAGINATION_CLOSE'],
};

export function soundForPanel(id, open) {
  const pair = PANEL_KEYS[String(id || '')];
  if (pair) return open ? pair[0] : pair[1];
  return open ? 'UI_PANEL_OPEN' : 'UI_PANEL_CLOSE';
}

/** Food vs drink by class name (items/include/drink.js vs food.js). */
const DRINK_HINTS = /(juice|milk|tea|coffee|cider|wine|beer|ale|tonic|water|smoothie|slurp|lemonade|cocktail|potion|elixir|drink|nectar|soda|punch|mead|grog|martini|espresso|latte|cloudberry_jam_drink)/;

export function soundForConsume(classTsid, { drink = null } = {}) {
  if (drink === true) return 'ITEM_DRINK';
  if (drink === false) return 'ITEM_EAT';
  return DRINK_HINTS.test(String(classTsid || '')) ? 'ITEM_DRINK' : 'ITEM_EAT';
}

/**
 * Game event counters (badge counters and quest events) that mark a moment
 * with no sound call of its own. Most counters stay silent: their moment
 * already played a key at the call site.
 */
export function soundForGameEvent(counter) {
  const c = String(counter || '');
  if (c === 'teleported') return 'TELEPORT_ARRIVE';
  if (c.startsWith('teleport_point_set:') && c !== 'teleport_point_set:xalanga') return 'TELEPORTER_VISIBLE_APPEAR';
  return null;
}
