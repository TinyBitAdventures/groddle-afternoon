/**
 * Mining + metalworking — simplified from GSJS:
 * - items/include/mining.js (mineable rocks)
 * - items/rock_metal_*.js, rock_dullite_*, rock_beryl_*, rock_sparkly_*
 * - items/pick.js, fancy_pick.js (tool_base wear)
 * - items/metal_rock.js + smelter.js (5 chunks → plain_metal)
 * - items/ore_grinder.js (crush ore → elements)
 * - catalog_recipes.js (alchemy tongs metals, metalmaker rod/bar)
 * - catalog_skill_packages.js mining / smelting / refining
 *
 * Demo-scaled: mine wait is short (not 20s); rock chunks 50 → deplete/respawn.
 */

import {
  addItem,
  removeItem,
  countItem,
  ensureItem,
  itemIcon,
  ITEM_CATALOG,
} from './inventory.js?v=2bd5b93e';
import { GRINDER_TOOLS, canUseTool, firstWorkingTool, useToolCondition } from './tools.js?v=5f482998';
import { skillPackageDetails } from './skill-packages.js?v=bfb87281';
import { grantMoodXp } from './mood-xp.js?v=958e7680';
import { loseEnergy } from './metabolics.js?v=8504134e';
import { GEM_ITEMS, MEGA_ROCK_CHUNKS, megaRockChance, miningExpertBonus, rollGemSmall, smeltingOverrides } from './imagination-effects.js?v=70169933';

/**
 * @typedef {{
 *   classTsid: string,
 *   label: string,
 *   rockType: 'metal_rock'|'dullite'|'beryl'|'sparkly',
 *   chunkId: string,
 *   chunkLabel: string,
 *   chunksMax: number,
 *   minChunks: number,
 *   maxChunks: number,
 *   worldSheet: string,
 *   sheetFrames: number,
 *   frameWidth: number,
 *   frameHeight: number,
 *   textureKey: string,
 *   source: string,
 * }} RockDef
 */

/** Mineable world nodes (visual variants share the same ore type). */
export const ROCK_CATALOG = {
  rock_metal_1: {
    classTsid: 'rock_metal_1',
    label: 'Metal Rock',
    rockType: 'metal_rock',
    chunkId: 'metal_rock',
    chunkLabel: 'Chunk of Metal Rock',
    chunksMax: 50,
    minChunks: 3,
    maxChunks: 9,
    worldSheet: 'assets/sprites/mining/rock_metal.webp',
    sheetFrames: 5,
    frameWidth: 137,
    frameHeight: 100,
    textureKey: 'mineRockMetal',
    source: 'rock_metal_1.js classProps rock_type metal_rock',
  },
  rock_dullite_1: {
    classTsid: 'rock_dullite_1',
    label: 'Dullite Rock',
    rockType: 'dullite',
    chunkId: 'dullite',
    chunkLabel: 'Dullite',
    chunksMax: 50,
    minChunks: 5,
    maxChunks: 9,
    worldSheet: 'assets/sprites/mining/rock_dullite.webp',
    sheetFrames: 5,
    frameWidth: 131,
    frameHeight: 114,
    textureKey: 'mineRockDullite',
    source: 'rock_dullite_1.js',
  },
  rock_beryl_1: {
    classTsid: 'rock_beryl_1',
    label: 'Beryl Rock',
    rockType: 'beryl',
    chunkId: 'beryl',
    chunkLabel: 'Beryl',
    chunksMax: 50,
    minChunks: 4,
    maxChunks: 8,
    worldSheet: 'assets/sprites/mining/rock_beryl.webp',
    sheetFrames: 5,
    frameWidth: 134,
    frameHeight: 120,
    textureKey: 'mineRockBeryl',
    source: 'rock_beryl_1.js',
  },
  rock_sparkly_1: {
    classTsid: 'rock_sparkly_1',
    label: 'Sparkly Rock',
    rockType: 'sparkly',
    chunkId: 'sparkly',
    chunkLabel: 'Sparkly',
    chunksMax: 50,
    minChunks: 3,
    maxChunks: 7,
    worldSheet: 'assets/sprites/mining/rock_sparkly.webp',
    sheetFrames: 5,
    frameWidth: 131,
    frameHeight: 127,
    textureKey: 'mineRockSparkly',
    source: 'rock_sparkly_1.js',
  },
};

/** GSJS catalog_skill_packages mining / smelting / refining (mining_1 rank). */
export const MINING_COSTS = {
  energy: 12,
  xp: 2,
  toolWear: 2,
  waitMs: 2500, // original 20000; demo-scaled
  skill: 'mining_1',
};

export const SMELT_COSTS = {
  energyPerIngot: 5,
  xpPerIngot: 2,
  toolWear: 3,
  waitMs: 1500, // original 4000
  chunksPerIngot: 5,
  skill: 'smelting_1',
  tool: 'smelter',
};

export const REFINE_COSTS = {
  energy: 4,
  xp: 1,
  toolWear: 2,
  waitMs: 1200,
  skill: 'refining_1',
  tool: 'ore_grinder',
};

/** ore_grinder onCrushComplete yields per 1 chunk. */
export const CRUSH_YIELDS = {
  beryl: [
    { classTsid: 'element_red', qty: 20 },
    { classTsid: 'element_green', qty: 2 },
    { classTsid: 'element_blue', qty: 4 },
  ],
  dullite: [
    { classTsid: 'element_red', qty: 5 },
    { classTsid: 'element_green', qty: 8 },
  ],
  sparkly: [
    { classTsid: 'element_red', qty: 5 },
    { classTsid: 'element_green', qty: 1 },
    { classTsid: 'element_blue', qty: 4 },
    { classTsid: 'element_shiny', qty: 6 },
  ],
};

/** Pick / fancy_pick capacities from GSJS classProps. */
export const PICK_TOOLS = {
  pick: {
    classTsid: 'pick',
    label: 'Pick',
    pointsCapacity: 100,
    skill: 'mining_1',
    baseCost: 500,
  },
  fancy_pick: {
    classTsid: 'fancy_pick',
    label: 'Fancy Pick',
    pointsCapacity: 200,
    skill: 'mining_1',
    baseCost: 1000,
  },
};

/** Demo-scaled verb time for the source 20-second Mining I swing. */
export const MINING_DEMO_DURATION_MS = 1800;

/**
 * Exact `mining` / `mining_fancypick` package row for the player's highest
 * Mining rank (1–4): swing time, energy, xp, and pick wear. Without a learned
 * list the Mining I row applies (legacy callers that skip the skill gate).
 * @param {string[]|undefined} learned
 * @param {'pick'|'fancy_pick'|string} [pick]
 */
export function miningProfile(learned, pick = 'pick', upgrades = []) {
  const packageId = pick === 'fancy_pick' ? 'mining_fancypick' : 'mining';
  // Imagination overlays: Manic Mining (duration) and Truly Outrageous (gem drop).
  const details = Array.isArray(learned)
    ? skillPackageDetails(packageId, learned, upgrades)
    : skillPackageDetails(packageId, ['mining_1'], upgrades);
  if (!details) return null;
  return {
    package: packageId,
    skill: details.skill,
    rank: details.rank,
    sourceDurationMs: details.duration,
    durationMs: Math.round(MINING_DEMO_DURATION_MS * (details.duration / 20000)),
    energy: details.energy_cost,
    xp: details.xp_bonus || 0,
    toolWear: details.tool_wear,
    dropClassId: details.drop_class_id || null,
    dropChance: Number(details.drop_chance) || 0,
  };
}

/**
 * Condition one swing asks of a pick at this Mining rank: tool_wear 2 at Mining I and II, 1 at III and
 * IV, the same for both picks (catalog_skill_packages.js mining, mining_fancypick).
 * @param {string[]|undefined} learned
 */
export function miningToolWear(learned) {
  return miningProfile(learned)?.toolWear ?? MINING_COSTS.toolWear;
}

/**
 * Exact `refining` package row (Refining I or II) for the Grinder.
 * Refined Speed I/II (refining_time_1/2) shorten it through the overlay.
 * @param {string[]|undefined} learned
 * @param {string[]} [upgrades]
 */
export function refiningProfile(learned, upgrades = []) {
  const details = Array.isArray(learned)
    ? skillPackageDetails('refining', learned, upgrades)
    : skillPackageDetails('refining', ['refining_1'], upgrades);
  if (!details) return null;
  return {
    skill: details.skill,
    rank: details.rank,
    sourceDurationMs: details.duration,
    energy: details.energy_cost,
    xp: details.xp_bonus || 0,
    toolWear: details.tool_wear,
  };
}

/**
 * @param {number} min
 * @param {number} max
 * @param {() => number} [rng]
 */
function randInt(min, max, rng = Math.random) {
  return min + Math.floor(rng() * (max - min + 1));
}

/**
 * @param {string} rockClassTsid
 * @param {{ chunksRemaining?: number }} [opts]
 */
export function createMineRock(rockClassTsid, opts = {}) {
  const def = ROCK_CATALOG[rockClassTsid] || ROCK_CATALOG.rock_metal_1;
  const max = def.chunksMax;
  return {
    classTsid: def.classTsid,
    rockType: def.rockType,
    chunkId: def.chunkId,
    chunksMax: max,
    chunksRemaining: opts.chunksRemaining != null ? opts.chunksRemaining : max,
    depleted: false,
    respawnAt: 0,
    mining: false,
    source: def.source,
  };
}

/**
 * Visual scene index (GSJS buildState: ceil(chunks/10), 1–5).
 * @param {{ chunksRemaining: number, chunksMax: number, depleted?: boolean }} rock
 */
export function rockSceneIndex(rock) {
  if (!rock || rock.depleted || rock.chunksRemaining <= 0) return 0;
  return Math.max(1, Math.min(5, Math.ceil(rock.chunksRemaining / 10)));
}

/** The rock type whose verb asks for a Fancy Pick (rock_metal_1.js classProps rock_type). */
export const FANCY_PICK_ROCK = 'metal_rock';

/**
 * The pick a swing uses: the first working Fancy Pick, else the first working Pick
 * (rock_beryl_1.js effects / handler 214-250). A Metal Rock takes only a Fancy Pick
 * (rock_metal_1.js conditions 198-202, drop_ok_code 183-185). `opts.tool` is a pick the
 * player named (a dragged stack, or a Pick's own Use: pick.js 311 force_pick), `opts.copy`
 * which unit of it (its place in pack order).
 * @param {import('./inventory.js').Inventory} inv
 * @param {{ rockType?: string, tool?: string|null, copy?: number|null }} [opts]
 */
export function findWorkingPick(inv, toolState = null, wear = MINING_COSTS.toolWear, opts = {}) {
  const only = opts.rockType === FANCY_PICK_ROCK ? ['fancy_pick'] : ['fancy_pick', 'pick'];
  const order = opts.tool ? only.filter((id) => id === opts.tool) : only;
  for (const id of order) {
    if (countItem(inv, id) < 1) continue;
    const copy = opts.tool === id && Number.isInteger(opts.copy) ? { copy: opts.copy } : {};
    if (!toolState || canUseTool(toolState, id, wear, copy).ok) return id;
  }
  return null;
}

/** Whether the player knows Mining I (rock_*.js verbs.mine conditions: required_skill mining_1). */
export function knowsMining(learned = []) {
  return (learned || []).some((id) => /^mining_[1-4]$/.test(id));
}

/** rock_metal_1.js 196-207: the line a rock's Mine verb shows with no pick it takes. */
export function noPickLine(rockType) {
  return rockType === FANCY_PICK_ROCK ? "You'll need a Fancy Pick first." : "You'll need a pick first.";
}

/** rock_metal_1.js 235-238: a plain Pick's Use (force_pick) on a Metal Rock. */
export const BRITTLE_PICK_LINE = 'This humdrum, everyday pick is far too brittle to mine a metal rock!';

/** inc_skill_packages.js 177-179: energy at or under the package's cost. */
export const TOO_TIRED_LINE = "You're too tired to do that.";

/** inc_skill_packages.js 538-541: Rubeweed (Luck of the Rube) multiplies a package's drop chance by 1.25, at most 100. */
export function rubeweedDropChance(chance, rubeweed = false) {
  const c = Number(chance) || 0;
  return Math.min(100, rubeweed ? c * 1.25 : c);
}

/**
 * Where a swing reads whether Rubeweed runs (features/help-mine-feature.js sets it to the
 * engine's buffs); a caller's opts.rubeweed wins. Pure callers (tests) pass it.
 */
let rubeweedSource = null;
export function setMiningBuffs(fn) {
  rubeweedSource = typeof fn === 'function' ? fn : null;
}
function rubeweedOn(opts) {
  if (typeof opts.rubeweed === 'boolean') return opts.rubeweed;
  try {
    return Boolean(rubeweedSource?.('rubeweed'));
  } catch {
    return false;
  }
}

/**
 * @param {import('./inventory.js').Inventory} inv
 * @param {string} toolId
 */
export function hasMiningTool(inv, toolId) {
  return countItem(inv, toolId) >= 1;
}

/**
 * Mine one swing on a rock node.
 * @param {ReturnType<typeof createMineRock>} rock
 * @param {import('./inventory.js').Inventory} inv
 * @param {{ energy?: number, mood?: number, imagination?: number, xp?: number }} pc
 * @param {{ learned?: string[], requireSkill?: boolean, rng?: () => number, now?: number, chunks?: number }} [opts]
 */
export function mineRock(rock, inv, pc, opts = {}) {
  const def = ROCK_CATALOG[rock?.classTsid] || Object.values(ROCK_CATALOG).find((r) => r.rockType === rock?.rockType);
  const rockType = rock?.rockType || def?.rockType;
  const msgs = [];
  const skilled = Array.isArray(opts.learned) ? opts.learned : undefined;
  const upgrades = Array.isArray(opts.upgrades) ? opts.upgrades : pc?.imaginationUpgrades || [];
  // The rock's handler (rock_metal_1.js 225-250) and startMining (include/mining.js 180-217) in
  // their order: Mining I, a plain Pick's Use on Metal Rock, the pick, then the rock itself.
  if (opts.requireSkill !== false && !knowsMining(opts.learned || [])) {
    // rock_metal_1.js verbs.mine conditions 193-196 (skills_get_name: "Mining I").
    return { ok: false, reason: 'skill', msgs: ['You need to know Mining I to use this.'] };
  }
  if (opts.force && opts.tool === 'pick' && rockType === FANCY_PICK_ROCK) {
    return { ok: false, reason: 'brittle', msgs: [BRITTLE_PICK_LINE] };
  }
  const named = { rockType, tool: opts.tool || null, copy: Number.isInteger(opts.copy) ? opts.copy : null };
  const pick = findWorkingPick(inv, opts.toolState, miningToolWear(skilled), named);
  if (!pick) {
    // include/mining.js 236-237: a pick that works but can't take this swing's wear.
    if (findWorkingPick(inv, opts.toolState, 1, named)) {
      return { ok: false, reason: 'broken_tool', msgs: ['Your pick does not have enough uses left.'] };
    }
    const ownsPick = rockType === FANCY_PICK_ROCK
      ? countItem(inv, 'fancy_pick') >= 1
      : countItem(inv, 'fancy_pick') >= 1 || countItem(inv, 'pick') >= 1;
    return {
      ok: false,
      reason: ownsPick && opts.toolState ? 'broken_tool' : 'no_pick',
      // A broken pick is no pick (rock_beryl_1.js verbs.mine conditions 193-214, ticket 63);
      // a Metal Rock asks for a Fancy Pick (rock_metal_1.js 198-202).
      msgs: [noPickLine(rockType)],
    };
  }
  if (!rock || rock.depleted || rock.chunksRemaining <= 0) {
    // include/mining.js 214-217: isUseable (chunks_remaining > 0) or this line.
    return { ok: false, reason: 'depleted', msgs: ['This is not the rock you are looking for.'] };
  }
  // Mining II–IV: faster swings, less energy, less wear, more xp.
  const profile = miningProfile(opts.requireSkill === false ? skilled : opts.learned || [], pick, upgrades)
    || miningProfile(undefined, pick, upgrades);
  const copyOpt = opts.tool === pick && Number.isInteger(opts.copy) ? { copy: opts.copy } : {};
  if (opts.toolState && !canUseTool(opts.toolState, pick, profile.toolWear, copyOpt).ok) {
    return {
      ok: false,
      reason: 'broken_tool',
      msgs: ['Your pick does not have enough uses left.'],
    };
  }
  // runSkillPackage refuses at energy <= cost (inc_skill_packages.js 177-179).
  if ((pc.energy || 0) <= profile.energy) {
    return { ok: false, reason: 'energy', msgs: [TOO_TIRED_LINE] };
  }

  const rng = opts.rng || Math.random;
  // opts.chunks: multiplayer, the realtime server's roll (groddle-afternoon-server/objects.go mine).
  let toGet = Number.isInteger(opts.chunks) && opts.chunks > 0
    ? opts.chunks
    : randInt(def?.minChunks ?? 3, def?.maxChunks ?? 9, rng);
  // include/mining.js: Beryl/Dullite/Metal Rock/Sparkly Expert, +round(15%).
  toGet += miningExpertBonus(rock.classTsid || def?.classTsid, upgrades, toGet);
  // include/mining.js gives the whole to_get, even past chunks_remaining.
  const got = toGet;

  // inc_skill_packages.js 487: metabolics_lose_energy (nothing while dead).
  const minedEnergy = loseEnergy(pc, profile.energy);
  // inc_skill_packages.js 532 (mining): xp_bonus takes the mood bonus.
  const minedXp = grantMoodXp(pc, profile.xp);

  addItem(inv, rock.chunkId, got);
  rock.chunksRemaining -= got;
  const toolUse = opts.toolState
    ? useToolCondition(opts.toolState, pick, profile.toolWear, copyOpt)
    : null;

  const chunkLabel = def?.chunkLabel || rock.chunkId;
  // "Chunk of Metal Rock" → "Chunks of Metal Rock"; Dullite, Beryl and Sparkly read as mass nouns.
  const chunkPlural = chunkLabel.startsWith('Chunk of ') ? `Chunks of ${chunkLabel.slice(9)}` : chunkLabel;
  msgs.push(`You mine ${got} ${got === 1 ? chunkLabel : chunkPlural}.`);
  // Truly Outrageous I-IV: the package's gem_small drop (catalog_drop_tables.js).
  // Each gem scales that pick's drop chance by 0.8 until the new day
  // (addSkillPackageOverride in include/mining.js, cleared in doNewDay).
  let gem = null;
  const dropScale = Number(pc.miningDropScale?.[pick] ?? 1);
  // inc_skill_packages.js 538-541: Rubeweed x1.25 on the (scaled) chance, at most 100.
  const gemChance = rubeweedDropChance(profile.dropChance * dropScale, rubeweedOn(opts));
  if (profile.dropClassId === 'gem_small' && profile.dropChance > 0 && rng() * 100 < gemChance) {
    pc.miningDropScale = { ...(pc.miningDropScale || {}), [pick]: dropScale * 0.8 };
    gem = rollGemSmall(rng);
    if (!ITEM_CATALOG[gem]) ensureItem(gem, GEM_ITEMS[gem]);
    addItem(inv, gem, 1);
    msgs.push(`You also found a ${GEM_ITEMS[gem]?.label || gem}!`);
  }
  if (toolUse?.broke) msgs.push(toolUse.msg);

  let cleared = false;
  if (rock.chunksRemaining <= 0) {
    rock.chunksRemaining = 0;
    rock.depleted = true;
    // GSJS: 8 min base; demo ~45s
    rock.respawnAt = (opts.now || Date.now()) + 45000;
    // include/mining.js onRespawn: 0/5/10/20% of rocks come back as 150-chunk
    // mega rocks, +50% of that with Rock Whisperer (the clearing player's card,
    // passed to the respawn timer at mining.js:419). Rolled now, applied then.
    rock.respawnChunks = rng() < megaRockChance(rock.rockType, upgrades) ? MEGA_ROCK_CHUNKS : 0;
    cleared = true;
    msgs.push('The rock crumbles away. It will reform soon.');
  }

  return {
    ok: true,
    reason: 'mined',
    msgs,
    effects: {
      energy: minedEnergy ? -minedEnergy : 0,
      xp: minedXp,
      img: minedXp,
      activityLine: msgs[0],
    },
    got,
    gem,
    chunkId: rock.chunkId,
    pick,
    profile,
    toolUse,
    cleared,
    rock,
  };
}

/**
 * Respawn depleted rock if timer elapsed.
 * @param {ReturnType<typeof createMineRock>} rock
 * @param {number} [now]
 */
export function tickMineRock(rock, now = Date.now()) {
  if (!rock?.depleted) return false;
  if (now < (rock.respawnAt || 0)) return false;
  rock.chunksRemaining = rock.respawnChunks > 0 ? rock.respawnChunks : rock.chunksMax || 50;
  // onMegaRoxx: "I am huuuuuuuuuge!" (read it from rock.mega).
  rock.mega = rock.respawnChunks > 0;
  rock.respawnChunks = 0;
  rock.depleted = false;
  rock.respawnAt = 0;
  return true;
}

/**
 * Smelt metal_rock chunks into plain_metal (5:1). GSJS smelter.
 * @param {import('./inventory.js').Inventory} inv
 * @param {{ energy?: number, imagination?: number, xp?: number }} pc
 * @param {{ qtyChunks?: number, learned?: string[], requireSkill?: boolean, requireTool?: boolean }} [opts]
 */
export function smeltMetalRocks(inv, pc, opts = {}) {
  const per = SMELT_COSTS.chunksPerIngot;
  const have = countItem(inv, 'metal_rock');
  let chunks = opts.qtyChunks != null ? opts.qtyChunks : have;
  chunks = chunks - (chunks % per);
  if (chunks < per) {
    return {
      ok: false,
      reason: 'need_chunks',
      msgs: [`You need at least ${per} Chunks of Metal Rock to smelt an ingot.`],
    };
  }
  if (opts.requireTool !== false && !hasMiningTool(inv, SMELT_COSTS.tool)) {
    return {
      ok: false,
      reason: 'no_smelter',
      msgs: ['You could smelt this with a working Smelter.'],
    };
  }
  if (opts.requireSkill !== false) {
    const learned = opts.learned || [];
    if (!learned.includes(SMELT_COSTS.skill)) {
      // smelter.js verbs.smelt conditions 323-329.
      return { ok: false, reason: 'skill', msgs: ['You need to know Smelting I to use this.'] };
    }
  }
  const ingots = chunks / per;
  // smelter.js: The Green Smelt (energy 5 → 3) and Strong Smelter (wear 3 → 2).
  const smeltUpgrades = smeltingOverrides(Array.isArray(opts.upgrades) ? opts.upgrades : pc?.imaginationUpgrades || []);
  const toolWear = (smeltUpgrades.toolWear ?? SMELT_COSTS.toolWear) * ingots;
  if (opts.requireTool !== false && opts.toolState) {
    const toolCheck = canUseTool(opts.toolState, SMELT_COSTS.tool, toolWear);
    if (!toolCheck.ok) {
      return { ok: false, reason: 'broken_tool', msgs: [toolCheck.msg], toolCheck };
    }
  }
  const energy = (smeltUpgrades.energyCost ?? SMELT_COSTS.energyPerIngot) * ingots;
  if ((pc.energy || 0) <= energy) {
    return {
      ok: false,
      reason: 'energy',
      msgs: [`Needs ${energy} energy (you have ${Math.floor(pc.energy || 0)}).`],
    };
  }
  if (!removeItem(inv, 'metal_rock', chunks)) {
    return { ok: false, reason: 'pack', msgs: ['Not enough metal rock.'] };
  }
  // smelter.js 576: metabolics_lose_energy (nothing while dead).
  const spent = loseEnergy(pc, energy);
  // smelter.js 577: stats_add_xp(n, false) takes the mood bonus.
  const xp = grantMoodXp(pc, SMELT_COSTS.xpPerIngot * ingots);
  addItem(inv, 'plain_metal', ingots);
  const toolUse = opts.requireTool !== false && opts.toolState
    ? useToolCondition(opts.toolState, SMELT_COSTS.tool, toolWear)
    : null;
  const msgs = [
    `You smelt ${chunks} metal rock into ${ingots} Plain Metal Ingot${ingots === 1 ? '' : 's'}.`,
    ...(toolUse?.broke ? [toolUse.msg] : []),
  ];
  return {
    ok: true,
    reason: 'smelted',
    msgs,
    effects: { energy: spent ? -spent : 0, xp, img: xp, activityLine: msgs[0] },
    ingots,
    chunks,
    toolUse,
  };
}

/**
 * Crush one or more ore chunks into elements (GSJS ore_grinder).
 * Demo skips elemental pouch requirement.
 * @param {import('./inventory.js').Inventory} inv
 * @param {{ energy?: number, imagination?: number, xp?: number }} pc
 * @param {'dullite'|'beryl'|'sparkly'} oreId
 * @param {{ qty?: number, learned?: string[], requireSkill?: boolean, requireTool?: boolean }} [opts]
 */
export function crushOre(inv, pc, oreId, opts = {}) {
  const yields = CRUSH_YIELDS[oreId];
  if (!yields) {
    return { ok: false, reason: 'bad_ore', msgs: ['That is not crushable ore.'] };
  }
  const qty = Math.max(1, opts.qty || 1);
  if (countItem(inv, oreId) < qty) {
    return { ok: false, reason: 'empty', msgs: [`You need ${qty} ${oreId}.`] };
  }
  // dullite.js:108: a working Grinder or Grand Ol' Grinder.
  if (opts.requireTool !== false && !GRINDER_TOOLS.some((id) => hasMiningTool(inv, id))) {
    return { ok: false, reason: 'no_grinder', msgs: ['You could crush this with a working Grinder.'] };
  }
  if (opts.requireSkill !== false) {
    const learned = opts.learned || [];
    if (!learned.includes(REFINE_COSTS.skill) && !learned.includes('refining_2')) {
      // ore_grinder.js verbs.grind conditions 341-343.
      return { ok: false, reason: 'skill', msgs: ['You need to know Refining I to use this.'] };
    }
  }
  // Refining II halves the grind time and lowers energy (4→3) and wear (2→1).
  const refining = (opts.requireSkill !== false || Array.isArray(opts.learned))
    ? refiningProfile(opts.learned || []) || refiningProfile(undefined)
    : refiningProfile(undefined);
  // ore_grinder.js getToolWearMultiplier: round(count / 3), and
  // runSkillPackage treats a 0 multiplier as 1.
  const toolWear = refining.toolWear * (Math.round(qty / 3) || 1);
  // dullite.js:124-133 is_working_grinder: the first grinder with the points left.
  const pick = firstWorkingTool(opts.toolState, inv, GRINDER_TOOLS, toolWear);
  const grinder = pick.tool || pick.fallback || REFINE_COSTS.tool;
  if (opts.requireTool !== false && opts.toolState) {
    const toolCheck = canUseTool(opts.toolState, grinder, toolWear);
    if (!toolCheck.ok) {
      return { ok: false, reason: 'broken_tool', msgs: [toolCheck.msg], toolCheck };
    }
  }
  const energy = refining.energy * qty;
  if ((pc.energy || 0) <= energy) {
    return {
      ok: false,
      reason: 'energy',
      msgs: [`Needs ${energy} energy (you have ${Math.floor(pc.energy || 0)}).`],
    };
  }
  if (!removeItem(inv, oreId, qty)) {
    return { ok: false, reason: 'pack', msgs: ['Not enough ore.'] };
  }
  // ore_grinder.js 592: metabolics_lose_energy (nothing while dead).
  const spent = loseEnergy(pc, energy);
  // ore_grinder.js 590: stats_add_xp(n, false) takes the mood bonus.
  const xp = grantMoodXp(pc, refining.xp * qty);

  const got = [];
  for (const y of yields) {
    const n = y.qty * qty;
    addItem(inv, y.classTsid, n);
    got.push({ classTsid: y.classTsid, qty: n });
  }
  const toolUse = opts.requireTool !== false && opts.toolState
    ? useToolCondition(opts.toolState, grinder, toolWear)
    : null;
  const parts = got.map((g) => `${g.qty} ${g.classTsid.replace(/_/g, ' ')}`).join(', ');
  const msgs = [`You crush ${qty} ${oreId} into ${parts}.`, ...(toolUse?.broke ? [toolUse.msg] : [])];
  return {
    ok: true,
    reason: 'crushed',
    msgs,
    effects: { energy: spent ? -spent : 0, xp, img: xp, activityLine: msgs[0] },
    got,
    toolUse,
    refining,
  };
}

/** Status line for verb menu / subtitle. */
export function rockStatusLabel(rock) {
  if (!rock) return '';
  if (rock.depleted) {
    const sec = Math.max(0, Math.ceil(((rock.respawnAt || 0) - Date.now()) / 1000));
    return sec > 0 ? `Depleted · ${sec}s` : 'Reforming…';
  }
  return `${rock.chunksRemaining} chunks left`;
}

export function ensureMiningItems() {
  const defs = {
    pick: { label: 'Pick', desc: "A relatively sturdy pick, without which mining cannot be done. A plain pick takes care of business, but it's not designed to last.", isTool: true },
    fancy_pick: {
      label: 'Fancy Pick',
      desc: "A super-deluxe fancy pick for fancy miners. Okay, maybe it doesn't look that fancy on the outside. It's the inside that counts.",
      isTool: true,
    },
    smelter: {
      label: 'Smelter',
      desc: 'Extracting purest metal from even the dullest chunk of Metal Rock, this classic Smelter is the second step to creating all manner of exciting secondary metals. (Learning Smelting is step one.)',
      isTool: true,
    },
    ore_grinder: {
      label: 'Grinder',
      desc: 'A sturdy, no-nonsense grinder. Harness its awesome power to grind rocks (and those rock-like barnacles) into alchemical elements.',
      isTool: true,
    },
    metalmaker: {
      label: 'Metal Machine',
      desc: 'A bangy, squeaky, marvellous red-hot metal machine. For the mutation of Plain Metal, Tin, Copper and Molybdenum into Metal Rods, Bars and Girders. None more metal.',
      isTool: true,
    },
    alchemical_tongs: {
      label: 'Alchemical Tongs',
      desc: 'Handy bendy Alchemical Tongs help you to create exciting metals like Tin, Copper and Molybdenum by adding elements to boring old hot smelted metal.',
      isTool: true,
    },
    metal_rock: {
      label: 'Chunk of Metal Rock',
      desc: "Chunky and metally, this rock, when smelted, makes Plain Metal. Boring maybe, but it's an excellent base for more ambitious alchemical experimentation.",
    },
    dullite: { label: 'Dullite', desc: 'A hefty chunk of dullite. What it lacks in sparkliness it makes up for in, um, dullness.' },
    beryl: { label: 'Beryl', desc: "Halfway between sparkly and dull, it's an innocuous chunk of beryl." },
    sparkly: { label: 'Sparkly', desc: "It's a pleasantly twinkly chunk of sparkly!" },
    plain_metal: {
      label: 'Plain Metal Ingot',
      desc: 'Sure, this metal is plain, but with the aid of Alchemical Tongs, Alchemy II and a secret blend of elemental ingredients, more exciting metal materials can be made.',
    },
    tin: { label: 'Tin', desc: "It's tin." },
    copper: { label: 'Copper', desc: 'Pliable yet strong, malleably magnificent, copper is a much-prized material for building. A glitch bearing good, strong copper will always be welcome on a building project.' },
    molybdenum: { label: 'Molybdenum', desc: "The glint off a good piece of Molybdenum is like glimpsing into the future. That's why it's used for sophisticated and desirable electronic gadgetry." },
    metal_rod: { label: 'Metal Rod', desc: 'Metal Rod, made of tin and plain metal, is not only useful for the yet unimagined construction purposes, but is also a much beloved snack of a Sloth.' },
    metal_post: { label: 'Metal Bar', desc: 'A post made of metal. Good for arduous construction, securing Mineshafts, and doing daring dances on while people tuck herbs into your elasticated pants (probably not all at the same time).' },
    fuel_cell: { label: 'Fuel Cell', desc: 'Hundreds of tiny power-pellets in each capsule provide gigajoules of energy to fuel the machines.' },
    element_red: { label: 'Red Element', desc: 'An element is the basic building block of all stuff. This one is red.' },
    element_green: { label: 'Green Element', desc: 'An element is the basic building block of all stuff. This one is green.' },
    element_blue: { label: 'Blue Element', desc: 'An element is the basic building block of all stuff. This one is blue.' },
    element_shiny: { label: 'Shiny Element', desc: 'An element is the basic building block of all stuff. This one is shiny.' },
  };
  for (const [id, meta] of Object.entries(defs)) {
    ensureItem(id, meta);
  }
  for (const rock of Object.values(ROCK_CATALOG)) {
    ensureItem(rock.classTsid, { label: rock.label, desc: `A ${rock.label} to mine with a Pick.` });
  }
}

/** Demo starter: pick + smelter + a few fuel cells. */
export function starterMiningTools() {
  return {
    pick: 1,
    smelter: 1,
    ore_grinder: 1,
    alchemical_tongs: 1,
    metalmaker: 1,
    fuel_cell: 8,
  };
}

/** Skills to unlock the chain in the spike (GSJS mining_1 / smelting_1 / refining_1 / alchemy_2 / metalwork_1). */
export const STARTER_MINING_SKILLS = [
  'mining_1',
  'smelting_1',
  'refining_1',
  'alchemy_2',
  'metalwork_1',
];

/** Tool vendor offers (currants). */
export function miningVendorOffers() {
  return [
    { classTsid: 'pick', label: 'Pick', buyPrice: 500, sellPrice: 150 },
    { classTsid: 'fancy_pick', label: 'Fancy Pick', buyPrice: 1000, sellPrice: 300 },
    { classTsid: 'smelter', label: 'Smelter', buyPrice: 400, sellPrice: 120 },
    { classTsid: 'ore_grinder', label: 'Grinder', buyPrice: 200, sellPrice: 60 },
    { classTsid: 'alchemical_tongs', label: 'Alchemical Tongs', buyPrice: 350, sellPrice: 100 },
    { classTsid: 'metalmaker', label: 'Metal Machine', buyPrice: 800, sellPrice: 250 },
    { classTsid: 'fuel_cell', label: 'Fuel Cell', buyPrice: 40, sellPrice: 12 },
    { classTsid: 'metal_rock', label: 'Metal Rock Chunk', buyPrice: 8, sellPrice: 2 },
  ];
}

export function listRockTypes() {
  return Object.values(ROCK_CATALOG);
}

/** World sprite path for a rock’s current scene frame (0-based index into 5-frame strip). */
export function rockFrameIndex(rock) {
  const scene = rockSceneIndex(rock); // 1–5 full, 0 depleted
  if (scene <= 0) return 4; // most depleted frame
  return Math.min(4, Math.max(0, 5 - scene));
}
