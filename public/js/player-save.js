/** Persistent player systems + per-street world snapshot. */
import { normalizeShrineState } from './shrines.js?v=spinning-wheel-test-4';
import { normalizeQuoinState } from './quoins.js?v=desk2-1';
import { normalizeToolConditionState } from './tools.js?v=woodcutting-test-3';
import { normalizeSkillState } from './skills.js';
import { normalizeFoodState } from './food.js?v=food-memory-8';
import { createGhostQuestState } from './ghost-quest.js?v=phantom-4';
import { normalizeParadiseState } from './paradise-flight.js?v=paradise-flight-2';
import { normalizeFeatSnapshot } from './feats.js?v=incantations-2';
import { normalizeEmotionalBearState } from './emotional-bear.js?v=emotional-bear-2';
import { normalizeHomeState } from './homes.js?v=homes-mail-4';
import { normalizeMailboxState } from './mailbox.js?v=homes-mail-4';
import { normalizeFeatureSlices } from './feature-host.js?v=features-3';
import { normalizeQuestOfferState } from './quest-offers.js';

export const PLAYER_SAVE_VERSION = 7;

const PLAYER_DEFAULTS = Object.freeze({
  energy: 80,
  energyMax: 100,
  mood: 70,
  imagination: 5000,
  currants: 200,
  xp: 5000,
  level: 5,
  rewardMultiplier: 1,
  imaginationUpgrades: [],
});

function finite(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function cleanKey(value) {
  return String(value || '').trim().replace(/[^a-zA-Z0-9_:-]/g, '');
}

function cleanStringArray(value) {
  return [...new Set((Array.isArray(value) ? value : []).map(cleanKey).filter(Boolean))];
}

function cleanIndexArray(value) {
  return [...new Set((Array.isArray(value) ? value : [])
    .map((entry) => Math.floor(finite(entry, -1)))
    .filter((entry) => entry >= 0 && entry <= 999))]
    .sort((a, b) => a - b);
}

/** G216: natural quoin index -> respawn time (ms), for the indexes still collected. */
function cleanRespawnMap(value, collected) {
  const out = {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) return out;
  const keep = new Set(collected);
  for (const [rawKey, rawAt] of Object.entries(value)) {
    const index = Math.floor(finite(rawKey, -1));
    const at = finite(rawAt, NaN);
    if (keep.has(index) && Number.isFinite(at) && at > 0) out[index] = Math.round(at);
  }
  return out;
}

function cleanScalarRecord(value, depth = 0) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || depth > 3) return {};
  const out = {};
  for (const [rawKey, rawValue] of Object.entries(value)) {
    const key = cleanKey(rawKey);
    if (!key) continue;
    if (typeof rawValue === 'boolean' || typeof rawValue === 'string') out[key] = rawValue;
    else if (Number.isFinite(Number(rawValue))) out[key] = Number(rawValue);
    else if (rawValue && typeof rawValue === 'object' && !Array.isArray(rawValue)) {
      out[key] = cleanScalarRecord(rawValue, depth + 1);
    }
  }
  return out;
}

export function normalizeInventorySnapshot(seed = {}, fallback = {}) {
  const inventory = {};
  const source = seed && typeof seed === 'object' ? seed : fallback;
  for (const [rawKey, rawCount] of Object.entries(source || {})) {
    const key = cleanKey(rawKey);
    if (!key) continue;
    inventory[key] = clamp(Math.floor(finite(rawCount, 0)), 0, 999999);
  }
  return inventory;
}

export function normalizePlayerSnapshot(seed = {}, fallback = PLAYER_DEFAULTS) {
  const source = seed && typeof seed === 'object' ? seed : {};
  const base = { ...PLAYER_DEFAULTS, ...(fallback || {}) };
  return {
    // Energy Tank upgrade cards raise the tank above the 100 default.
    energyMax: clamp(Math.floor(finite(source.energyMax, base.energyMax ?? 100)), 100, 1_000_000),
    energy: clamp(
      finite(source.energy, base.energy),
      0,
      clamp(Math.floor(finite(source.energyMax, base.energyMax ?? 100)), 100, 1_000_000)
    ),
    mood: clamp(finite(source.mood, base.mood), 0, clamp(Math.floor(finite(source.energyMax, base.energyMax ?? 100)), 100, 1_000_000)),
    imagination: Math.max(0, Math.floor(finite(source.imagination, base.imagination))),
    currants: Math.max(0, Math.floor(finite(source.currants, base.currants))),
    xp: Math.max(0, Math.floor(finite(source.xp, base.xp))),
    level: Math.max(1, Math.floor(finite(source.level, base.level))),
    rewardMultiplier: clamp(finite(source.rewardMultiplier, base.rewardMultiplier), 0.01, 100),
    imaginationUpgrades: cleanStringArray(
      Array.isArray(source.imaginationUpgrades)
        ? source.imaginationUpgrades
        : base.imaginationUpgrades || []
    ),
    miningDropScale: Object.fromEntries(Object.entries(cleanScalarRecord(source.miningDropScale))
      .filter(([, v]) => typeof v === 'number').map(([k, v]) => [k, clamp(v, 0, 1)])),
  };
}

export function normalizeQuestSnapshot(seed = {}) {
  const active = {};
  for (const [rawId, row] of Object.entries(seed?.active || {})) {
    const classTsid = cleanKey(rawId);
    if (!classTsid || !row || typeof row !== 'object') continue;
    const progress = {};
    for (const [rawCounter, rawAmount] of Object.entries(row.progress || {})) {
      const counter = cleanKey(rawCounter);
      if (counter) progress[counter] = Math.max(0, Math.floor(finite(rawAmount, 0)));
    }
    active[classTsid] = {
      classTsid,
      progress,
      startedAt: Math.max(0, Math.floor(finite(row.startedAt, 0))),
    };
  }
  const story = {};
  if (seed?.story?.phantom) {
    story.phantom = createGhostQuestState(seed.story.phantom);
  }
  if (seed?.story?.greedyStreetSpirit) {
    story.greedyStreetSpirit = cleanScalarRecord(seed.story.greedyStreetSpirit);
  }
  // When each quest was finished (G202: the shrine quest's minute before conversations).
  const doneAt = {};
  for (const [rawId, at] of Object.entries(seed?.doneAt || {})) {
    const classTsid = cleanKey(rawId);
    const ms = Math.floor(finite(at, 0));
    if (classTsid && ms > 0) doneAt[classTsid] = ms;
  }
  return {
    active,
    completed: cleanStringArray(seed?.completed),
    story,
    offers: normalizeQuestOfferState(seed?.offers),
    ...(Object.keys(doneAt).length ? { doneAt } : {}),
  };
}

export function normalizeAchievementSnapshot(seed = {}) {
  const progress = {};
  for (const [rawId, row] of Object.entries(seed?.progress || {})) {
    const classTsid = cleanKey(rawId);
    if (!classTsid || !row || typeof row !== 'object') continue;
    const counters = {};
    for (const [rawCounter, rawAmount] of Object.entries(row.progress || {})) {
      const counter = cleanKey(rawCounter);
      if (counter) counters[counter] = Math.max(0, Math.floor(finite(rawAmount, 0)));
    }
    progress[classTsid] = { progress: counters };
  }
  // Distinct labels per counter group (group_count badges).
  const groups = {};
  for (const [rawGroup, labels] of Object.entries(seed?.groups || {})) {
    const group = String(rawGroup || '').trim();
    if (!group || !Array.isArray(labels)) continue;
    groups[group] = [...new Set(labels.map((label) => String(label || '').trim()).filter(Boolean))];
  }
  return { progress, unlocked: cleanStringArray(seed?.unlocked), groups };
}

export function normalizeBuffSnapshot(seed = {}) {
  const active = {};
  for (const [rawId, row] of Object.entries(seed?.active || {})) {
    const classTsid = cleanKey(rawId);
    if (!classTsid || !row || typeof row !== 'object') continue;
    const expiresAt = row.expiresAt == null ? null : Math.max(0, Math.floor(finite(row.expiresAt, 0)));
    active[classTsid] = {
      classTsid,
      appliedAt: Math.max(0, Math.floor(finite(row.appliedAt, 0))),
      expiresAt,
      nextTickAt: row.nextTickAt == null ? null : Math.max(0, Math.floor(finite(row.nextTickAt, 0))),
      activated: row.activated !== false,
      sourceItem: cleanKey(row.sourceItem) || null,
      args: cleanScalarRecord(row.args),
    };
  }
  return {
    active,
    totalActivated: Math.max(0, Math.floor(finite(seed?.totalActivated, 0))),
    ticksApplied: Math.max(0, Math.floor(finite(seed?.ticksApplied, 0))),
  };
}

export function normalizeMusicblockSnapshot(seed = {}) {
  const heardAt = {};
  for (const [rawId, rawTime] of Object.entries(seed?.heardAt || {})) {
    const classTsid = cleanKey(rawId);
    const at = Math.max(0, Math.floor(finite(rawTime, -1)));
    if (classTsid && at >= 0) heardAt[classTsid] = at;
  }
  const collectedStreets = {};
  for (const [rawId, collected] of Object.entries(seed?.collectedStreets || {})) {
    const streetTsid = cleanKey(rawId);
    if (streetTsid && collected === true) collectedStreets[streetTsid] = true;
  }
  return {
    heardAt,
    plays: Math.max(0, Math.floor(finite(seed?.plays, 0))),
    lastPlayed: cleanKey(seed?.lastPlayed) || null,
    collectedStreets,
  };
}

export function normalizeSystemsSnapshot(seed = {}) {
  return {
    quests: normalizeQuestSnapshot(seed?.quests),
    achievements: normalizeAchievementSnapshot(seed?.achievements),
    skills: normalizeSkillState(seed?.skills),
    buffs: normalizeBuffSnapshot(seed?.buffs),
    tools: normalizeToolConditionState(seed?.tools),
    musicblocks: normalizeMusicblockSnapshot(seed?.musicblocks),
    shrines: normalizeShrineState(seed?.shrines),
    quoins: normalizeQuoinState(seed?.quoins),
    food: normalizeFoodState(seed?.food),
    paradise: normalizeParadiseState(seed?.paradise),
    feats: normalizeFeatSnapshot(seed?.feats),
    emotionalBear: normalizeEmotionalBearState(seed?.emotionalBear),
    home: normalizeHomeState(seed?.home),
    mailbox: normalizeMailboxState(seed?.mailbox),
    features: normalizeFeatureSlices(seed?.features),
  };
}

function normalizePlotSnapshot(seed = {}) {
  const allowedStates = new Set(['clean', 'seeds', 'shoots', 'crop', 'dirty']);
  const state = allowedStates.has(seed?.state) ? seed.state : 'clean';
  return {
    state,
    seed: cleanKey(seed?.seed) || null,
    wet: seed?.wet === true,
    wetAt: seed?.wet === true && seed?.wetAt != null && Number.isFinite(Number(seed.wetAt))
      ? Math.max(0, Math.floor(Number(seed.wetAt)))
      : null,
    stageStartedAt: Math.max(0, Math.floor(finite(seed?.stageStartedAt, 0))),
    growthMs: Math.max(0, Math.floor(finite(seed?.growthMs, 0))),
    growModifier: clamp(finite(seed?.growModifier, 1), 0.05, 100),
    fertilized: seed?.fertilized === true,
  };
}

export function normalizeGardenSnapshot(seed = {}) {
  const gardenType = seed?.gardenType === 'herb' ? 'herb' : 'default';
  const cols = clamp(Math.floor(finite(seed?.cols, gardenType === 'herb' ? 3 : 4)), 1, 12);
  const rows = clamp(Math.floor(finite(seed?.rows, 2)), 1, 12);
  const plots = {};
  for (let row = 1; row <= rows; row += 1) {
    for (let col = 1; col <= cols; col += 1) {
      const key = `${col}-${row}`;
      plots[key] = normalizePlotSnapshot(seed?.plots?.[key]);
    }
  }
  return {
    classId: 'garden_new',
    label: gardenType === 'herb' ? 'Herb Garden' : 'Crop Garden',
    gardenType,
    cols,
    rows,
    plots,
    source: 'saved street garden',
  };
}

function normalizeStreetSnapshot(seed = {}) {
  const gardens = {};
  for (const type of ['default', 'herb']) {
    if (seed?.gardens?.[type]) gardens[type] = normalizeGardenSnapshot(seed.gardens[type]);
  }
  const trees = (Array.isArray(seed?.trees) ? seed.trees : []).slice(0, 40).map((row) => ({
    classId: cleanKey(row?.classId),
    state: cleanScalarRecord(row?.state),
  })).filter((row) => row.classId);
  const rocks = (Array.isArray(seed?.rocks) ? seed.rocks : []).slice(0, 40).map((row) => ({
    classId: cleanKey(row?.classId),
    rock: cleanScalarRecord(row?.rock),
  })).filter((row) => row.classId);
  const collectedQuoins = cleanIndexArray(seed?.collectedQuoins);
  return {
    gardens,
    trees,
    rocks,
    collectedApples: cleanIndexArray(seed?.collectedApples),
    collectedQuoins,
    quoinRespawn: cleanRespawnMap(seed?.quoinRespawn, collectedQuoins),
    features: normalizeFeatureSlices(seed?.features),
  };
}

export function normalizeWorldSnapshot(seed = {}) {
  const animals = {};
  for (const [rawKey, row] of Object.entries(seed?.animals || {})) {
    const key = cleanKey(rawKey);
    const classId = cleanKey(row?.classId);
    if (!key || !classId) continue;
    animals[key] = { classId, state: cleanScalarRecord(row?.state) };
  }
  const streets = {};
  for (const [rawStreet, row] of Object.entries(seed?.streets || {})) {
    const streetTsid = cleanKey(rawStreet);
    if (streetTsid && row && typeof row === 'object') {
      streets[streetTsid] = normalizeStreetSnapshot(row);
    }
  }
  return { animals, streets };
}

export function createPlayerSave({
  inventory = {},
  player = {},
  systems = {},
  world = {},
  savedAt = Date.now(),
} = {}) {
  return {
    version: PLAYER_SAVE_VERSION,
    inventory: normalizeInventorySnapshot(inventory),
    player: normalizePlayerSnapshot(player),
    systems: normalizeSystemsSnapshot(systems),
    world: normalizeWorldSnapshot(world),
    savedAt: Math.max(0, Math.floor(finite(savedAt, Date.now()))),
  };
}

export function normalizePlayerSave(seed, defaults = {}) {
  if (!seed || typeof seed !== 'object') return null;
  if (!seed.inventory || typeof seed.inventory !== 'object') return null;
  return {
    version: PLAYER_SAVE_VERSION,
    inventory: normalizeInventorySnapshot(seed.inventory, defaults.inventory || {}),
    player: normalizePlayerSnapshot(seed.player, defaults.player),
    systems: normalizeSystemsSnapshot(seed.systems || defaults.systems || {}),
    world: normalizeWorldSnapshot(seed.world || defaults.world || {}),
    savedAt: Math.max(0, Math.floor(finite(seed.savedAt, 0))),
  };
}

export function parsePlayerSave(raw, defaults = {}) {
  if (!raw) return null;
  try {
    return normalizePlayerSave(typeof raw === 'string' ? JSON.parse(raw) : raw, defaults);
  } catch {
    return null;
  }
}

export function serializePlayerSave(snapshot) {
  const normalized = normalizePlayerSave(snapshot);
  return normalized ? JSON.stringify(normalized) : '';
}

/** Mutate existing game objects so module references remain stable. */
export function restorePlayerSave(snapshot, inventory, player, targets = {}) {
  const normalized = normalizePlayerSave(snapshot, {
    inventory,
    player,
    systems: targets.systems,
    world: targets.world,
  });
  if (!normalized) return false;
  for (const key of Object.keys(inventory || {})) delete inventory[key];
  Object.assign(inventory, normalized.inventory);
  Object.assign(player, normalized.player);
  const replace = (target, source) => {
    if (!target || typeof target !== 'object') return;
    for (const key of Object.keys(target)) delete target[key];
    Object.assign(target, source);
  };
  replace(targets.quests, normalized.systems.quests);
  replace(targets.achievements, normalized.systems.achievements);
  replace(targets.skills, normalized.systems.skills);
  replace(targets.buffs, normalized.systems.buffs);
  replace(targets.tools, normalized.systems.tools);
  replace(targets.musicblocks, normalized.systems.musicblocks);
  replace(targets.shrines, normalized.systems.shrines);
  replace(targets.quoins, normalized.systems.quoins);
  replace(targets.food, normalized.systems.food);
  replace(targets.paradise, normalized.systems.paradise);
  replace(targets.feats, normalized.systems.feats);
  replace(targets.emotionalBear, normalized.systems.emotionalBear);
  replace(targets.home, normalized.systems.home);
  replace(targets.mailbox, normalized.systems.mailbox);
  replace(targets.features, normalized.systems.features);
  replace(targets.world, normalized.world);
  return true;
}
