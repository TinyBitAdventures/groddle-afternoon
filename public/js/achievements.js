/**
 * Achievement (badge) runner over mined GSJS catalog.
 */

import { getAchievementCatalog } from './content-catalogs.js';
import { applyRewards } from './quests.js';

export function createAchievementState() {
  return {
    /** @type {Record<string, { progress: Record<string, number> }>} */
    progress: {},
    /** @type {string[]} */
    unlocked: [],
  };
}

/** Build the exact GSJS `group:label` counter key used by achievement conditions. */
export function achievementCounter(group, name) {
  const safeGroup = String(group || '').trim();
  const safeName = String(name || '').trim();
  return safeGroup && safeName ? `${safeGroup}:${safeName}` : '';
}

/**
 * Turn mined GSJS counter ids into player-facing copy. Original badge data
 * often repeats the internal class_tsid in `desc`, so it is not safe to print
 * that field directly.
 */
export function achievementConditionLabel(condition = {}, catalogLabel = '') {
  const name = String(condition.name || '').trim();
  const desc = String(condition.desc || '').trim();
  const knownLabel = String(catalogLabel || '').trim();
  if (knownLabel && knownLabel !== name) return knownLabel;

  const musicblock = name.match(/^musicblock_d_(green|red)_(\d{2})$/i);
  if (musicblock) {
    const collection = musicblock[1].toLowerCase() === 'green' ? 'DG' : 'DR';
    return `Musicblock ${collection}-${Number(musicblock[2])}`;
  }

  const source = desc && desc !== name && !/^\d+$/.test(desc)
    ? desc
    : name;
  if (!source || /^\d+$/.test(source)) {
    const group = String(condition.group || '').trim();
    if (!group) return 'Progress';
    return group
      .replace(/^npc_/, '')
      .replace(/^trants_/, 'trees ')
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (letter) => letter.toUpperCase());
  }

  return source
    .replace(/^npc_/, '')
    .replace(/^trant_/, '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
    .replace(/\bXp\b/g, 'XP')
    .replace(/\bImg\b/g, 'iMG');
}

const TRANT_FRUIT_CLASSES = Object.freeze({
  trant_fruit: 'cherry',
  trant_egg: 'egg_plain',
  trant_bean: 'bean_plain',
  trant_bubble: 'plain_bubble',
  trant_spice: 'all_spice',
  trant_gas: 'general_vapour',
});

/**
 * Translate a successful world verb into canonical GSJS achievement events.
 * Harvesting emits one per-tree action plus an item-count event, while animal
 * and care verbs emit their exact single counter.
 */
export function worldVerbAchievementCounters(classTsid, verbId, result = null) {
  const classId = String(classTsid || '').trim();
  const verb = String(verbId || '').split(':')[0].trim();
  if (/^npc_(?:piggy|chicken|butterfly)$/.test(classId)) {
    if (['pet', 'nibble', 'squeeze', 'massage', 'milk'].includes(verb)) {
      return [{ counter: achievementCounter(classId, verb), amount: 1 }];
    }
    return [];
  }
  if (/^trant_(?:fruit|egg|bean|bubble|spice|gas)$/.test(classId)) {
    if (verb === 'pet') {
      return [{ counter: achievementCounter('trants_petted', classId), amount: 1 }];
    }
    if (verb === 'water') {
      return [{ counter: achievementCounter('trants_watered', classId), amount: 1 }];
    }
    if (verb === 'harvest') {
      const harvest = result?.harvest || result || {};
      const fruitClass = String(harvest.fruitClass || TRANT_FRUIT_CLASSES[classId]);
      const baseAmount = Math.max(1, Math.floor(Number(harvest.baseAmount) || 1));
      return [
        { counter: achievementCounter('trants_harvested', classId), amount: 1 },
        { counter: achievementCounter('trants_fruit_harvested', fruitClass), amount: baseAmount },
      ];
    }
  }
  return [];
}

/** Backward-compatible first counter for code that only expects one event. */
export function worldVerbAchievementCounter(classTsid, verbId, result = null) {
  return worldVerbAchievementCounters(classTsid, verbId, result)[0]?.counter || '';
}

/** Canonical counter for one successfully completed Making tool cycle. */
export function makingToolAchievementCounter(toolClassTsid) {
  return achievementCounter('making_tool', toolClassTsid);
}

/**
 * Deterministic QA helper: put every condition for one badge `distance` events
 * from completion without granting its rewards early.
 */
export function seedAchievementNearCompletion(state, classTsid, distance = 1) {
  const def = getAchievementCatalog()[classTsid];
  if (!def) return { ok: false, reason: 'unknown', def: null };
  const gap = Math.max(1, Math.floor(Number(distance) || 1));
  state.unlocked = state.unlocked.filter((id) => id !== classTsid);
  const progress = {};
  for (const condition of def.conditions || []) {
    progress[condition.name] = Math.max(0, (Number(condition.num) || 0) - gap);
  }
  state.progress[classTsid] = { progress };
  return { ok: true, reason: 'seeded', def, progress: { ...progress } };
}

export function listAchievements(filter = 'all') {
  const cat = getAchievementCatalog();
  const rows = Object.values(cat);
  if (filter === 'secret') return rows.filter((a) => a.isSecret);
  if (filter && filter !== 'all') return rows.filter((a) => a.category === filter);
  return rows;
}

export function achievementCategoryLabel(category = '') {
  const value = String(category || '').trim();
  if (!value) return 'Other';
  return value.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function achievementCategories() {
  const categories = new Set(
    Object.values(getAchievementCatalog()).map((def) => String(def.category || '').trim())
  );
  return [...categories]
    .sort((a, b) => achievementCategoryLabel(a).localeCompare(achievementCategoryLabel(b)));
}

function achievementSearchText(row) {
  if (row.redacted) return 'secret achievement';
  return [
    row.def.name,
    row.def.desc,
    row.def.statusText,
    achievementCategoryLabel(row.def.category),
    ...(row.conditions || []).flatMap((condition) => [
      achievementConditionLabel(condition),
      condition.name,
    ]),
  ]
    .filter(Boolean)
    .join(' ')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

/**
 * Full catalog browser model. Locked secret badges remain anonymous until the
 * player starts or unlocks them, so search does not accidentally reveal them.
 */
export function browseAchievementLog(state, {
  status = 'all',
  category = 'all',
  query = '',
} = {}) {
  const safeStatus = ['all', 'unlocked', 'progress', 'locked'].includes(status)
    ? status
    : 'all';
  const selectedCategory = String(category || 'all');
  const safeCategory = selectedCategory === '__other' ? '' : selectedCategory;
  const tokens = String(query || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const unlocked = new Set(state.unlocked || []);
  const progressing = new Set(Object.keys(state.progress || {}));
  const rows = Object.values(getAchievementCatalog()).map((def) => {
    const progress = getAchievementProgress(state, def.classTsid);
    const rowStatus = progress?.unlocked
      ? 'unlocked'
      : progressing.has(def.classTsid)
        ? 'progress'
        : 'locked';
    return {
      ...progress,
      def,
      unlocked: unlocked.has(def.classTsid),
      status: rowStatus,
      redacted: Boolean(def.isSecret && rowStatus === 'locked'),
    };
  });
  const rank = { unlocked: 0, progress: 1, locked: 2 };
  return rows
    .filter((row) => safeStatus === 'all' || row.status === safeStatus)
    .filter((row) => safeCategory === 'all' || String(row.def.category || '') === safeCategory)
    .filter((row) => {
      if (!tokens.length) return true;
      const haystack = achievementSearchText(row);
      return tokens.every((token) => haystack.includes(token));
    })
    .sort((a, b) =>
      rank[a.status] - rank[b.status] ||
      String(a.def.name || '').localeCompare(String(b.def.name || ''))
    );
}

/**
 * @param {ReturnType<typeof createAchievementState>} state
 * @param {string} classTsid
 */
export function getAchievementProgress(state, classTsid) {
  const def = getAchievementCatalog()[classTsid];
  if (!def) return null;
  const prog = state.progress[classTsid]?.progress || {};
  const unlocked = state.unlocked.includes(classTsid);
  return {
    def,
    unlocked,
    conditions: (def.conditions || []).map((c) => ({
      ...c,
      current: unlocked ? c.num : prog[c.name] || 0,
    })),
  };
}

/**
 * Progress achievement counters (group:name or flat name).
 * @param {ReturnType<typeof createAchievementState>} state
 * @param {string} counterName  e.g. knife_and_board or making_known_tool:knife_and_board
 * @param {number} [amount=1]
 * @param {object} [pc]
 */
export function applyAchievementProgress(state, counterName, amount = 1, pc = null) {
  const cat = getAchievementCatalog();
  const updates = [];
  const group = counterName.includes(':') ? counterName.split(':')[0] : null;
  const delta = Math.max(0, Math.floor(Number(amount) || 0));
  if (!delta) return updates;

  for (const [id, def] of Object.entries(cat)) {
    if (state.unlocked.includes(id)) continue;
    const conds = def.conditions || [];
    if (!conds.length) continue;
    const matches = conds.filter((c) => {
      const exactCounter = group
        ? `${c.group}:${c.name}` === counterName
        : c.name === counterName;
      const groupedTotal = group && c.type === 'group_sum' && c.group === group;
      return exactCounter || groupedTotal;
    });
    if (!matches.length) continue;
    if (!state.progress[id]) state.progress[id] = { progress: {} };
    for (const c of matches) {
      const cur = state.progress[id].progress[c.name] || 0;
      state.progress[id].progress[c.name] = Math.min(c.num, cur + delta);
    }
    const done = conds.every((c) => (state.progress[id].progress[c.name] || 0) >= c.num);
    if (done) {
      const r = unlockAchievement(state, id, pc);
      updates.push({ classTsid: id, unlocked: true, rewards: r.rewards, def });
    } else {
      updates.push({ classTsid: id, unlocked: false, def });
    }
  }
  return updates;
}

/**
 * @param {ReturnType<typeof createAchievementState>} state
 * @param {string} classTsid
 * @param {object} [pc]
 */
export function unlockAchievement(state, classTsid, pc = null) {
  const def = getAchievementCatalog()[classTsid];
  if (!def) return { ok: false, reason: 'unknown' };
  if (state.unlocked.includes(classTsid)) return { ok: false, reason: 'already', rewards: null };
  state.unlocked.push(classTsid);
  delete state.progress[classTsid];
  const rewards = { ...(def.rewards || {}) };
  applyRewards(pc, rewards);
  return { ok: true, reason: 'unlocked', rewards, def };
}

/**
 * UI list: unlocked + in-progress + sample locked with counters.
 * @param {ReturnType<typeof createAchievementState>} state
 * @param {number} [limit=50]
 */
export function listAchievementLog(state, limit = 80) {
  const cat = getAchievementCatalog();
  const rows = [];
  for (const id of state.unlocked) {
    const p = getAchievementProgress(state, id);
    if (p) rows.push({ ...p, status: 'unlocked' });
  }
  for (const id of Object.keys(state.progress)) {
    if (state.unlocked.includes(id)) continue;
    const p = getAchievementProgress(state, id);
    if (p) rows.push({ ...p, status: 'progress' });
  }
  // Fill with browseable locked entries
  for (const def of Object.values(cat)) {
    if (rows.length >= limit) break;
    if (state.unlocked.includes(def.classTsid)) continue;
    if (state.progress[def.classTsid]) continue;
    rows.push({
      def,
      unlocked: false,
      conditions: (def.conditions || []).map((c) => ({ ...c, current: 0 })),
      status: 'locked',
    });
  }
  return rows;
}
