/**
 * Achievement (badge) runner over mined GSJS catalog.
 */

import { getAchievementCatalog } from './content-catalogs.js';
import { applyRewards } from './quests.js';
import { achievementRewardModifier, scaleRewards } from './imagination-effects.js';

export function createAchievementState() {
  return {
    /** @type {Record<string, { progress: Record<string, number> }>} */
    progress: {},
    /** @type {string[]} */
    unlocked: [],
    /** Distinct labels seen per counter group, for group_count conditions. @type {Record<string, string[]>} */
    groups: {},
  };
}

/**
 * Record a counter's label under its group and return the group's distinct
 * label count (inc_achievements.js: group_count conditions compare
 * counters_get_group_count, the number of labels in the group). A group may
 * itself contain a colon (`VERB:iconize`), so the caller passes it.
 */
export function noteGroupLabel(state, group, label) {
  if (!group || !label) return 0;
  if (!state.groups || typeof state.groups !== 'object') state.groups = {};
  const list = state.groups[group] || (state.groups[group] = []);
  if (!list.includes(label)) list.push(label);
  return list.length;
}

/** Distinct labels recorded for a group. */
export function groupLabelCount(state, group) {
  return state?.groups?.[group]?.length || 0;
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

  const musicblock = name.match(/^musicblock_(d_green|d_red|d_blue|b_brown|x_shiny)_(\d{2})$/i);
  if (musicblock) {
    const collection = { d_green: 'DG', d_red: 'DR', d_blue: 'DB', b_brown: 'BB', x_shiny: 'XS' }[musicblock[1].toLowerCase()];
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
      const rows = [{ counter: achievementCounter(classId, verb), amount: 1 }];
      // npc_chicken.js:1557: a successful squeeze also counts chicken:squoze (Hen Hugger).
      if (classId === 'npc_chicken' && verb === 'squeeze') rows.push({ counter: 'chicken:squoze', amount: 1 });
      // npc_butterfly.js:1124 onMassageComplete: butterflies:massaged (Butterfly Whisperer).
      if (classId === 'npc_butterfly' && verb === 'massage') rows.push({ counter: 'butterflies:massaged', amount: 1 });
      return rows;
    }
    return [];
  }
  // wood_tree.js:794 (and wood_tree_enchanted.js:825): every finished harvest.
  if (classId === 'wood_tree' && verb === 'harvest') {
    return [{ counter: 'completed_harvest:wood_tree', amount: 1 }];
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

const FURNITURE_DECOS = Object.freeze(['furniture_roomdeco', 'furniture_ceilingdeco', 'furniture_walldeco', 'furniture_tabledeco']);
const FURNITURE_CABINETS = Object.freeze(['bag_furniture_cabinet', 'bag_furniture_smallcabinet', 'bag_furniture_wallcabinet']);
const FURNITURE_LAMPS = Object.freeze(['furniture_floorlamp', 'furniture_ceilinglamp', 'furniture_tablelamp', 'furniture_walllamp']);
const FURNITURE_SEATS = Object.freeze(['furniture_stool', 'furniture_bench', 'furniture_sofa', 'furniture_armchair', 'furniture_chair', 'furniture_loveseat']);

/**
 * Counters one finished Making unit adds beyond making_tool / making_known_*,
 * by tool, for the unit's recipe outputs ([{ classTsid, qty }]):
 * - ore_grinder.js / grand_ol_grinder.js:612 onCrushComplete: every output
 *   counts elements_refined:<output> by the amount made (Refiner badges).
 * - smelter.js:565, 583 onSmeltComplete: smelter:ingots_created by the ingots
 *   made, smelter:metal_smelted by the Metal Rocks used (5 per ingot).
 * - crystallizer.js crystalmalize: items/item.js:738 notifyVerb counts
 *   crystallizer:crystalmalize once per successful verb (one Plain Crystal).
 * - construction_tool.js:314-328 onMakingComplete: furniture_items:made for
 *   every piece (its note_pole / wall_segment guard is always true), plus
 *   furniture_decos / furniture_cabinets / furniture_lamps / furniture_seats.
 * - spindle.js / splendid_spindle.js:431-438 onSpinComplete, once per spin
 *   (`spin` = { unitIndex, batchQty, string }): spun:straight_to_string when
 *   the Giants turned the thread to String, spun:two_thousand_fiber when the
 *   spin used 2,051 Fiber or more (seven per Thread).
 */
export function makingOutputAchievementCounters(toolClassTsid, outputs = [], spin = null) {
  const tool = String(toolClassTsid || '');
  const rows = [];
  if ((tool === 'spindle' || tool === 'splendid_spindle') && spin) {
    const unit = Math.floor(Number(spin.unitIndex) || 0);
    const qty = Math.floor(Number(spin.batchQty) || 0);
    if (unit === 1 && spin.string) rows.push({ counter: 'spun:straight_to_string', amount: 1 });
    if (unit === qty && qty * 7 >= 2051) rows.push({ counter: 'spun:two_thousand_fiber', amount: 1 });
  }
  for (const out of outputs || []) {
    const classTsid = String(out?.classTsid || '');
    const qty = Math.max(0, Math.floor(Number(out?.qty) || 0));
    if (!classTsid || !qty) continue;
    if (tool === 'ore_grinder' || tool === 'grand_ol_grinder') {
      rows.push({ counter: achievementCounter('elements_refined', classTsid), amount: qty });
    } else if (tool === 'smelter' && classTsid === 'plain_metal') {
      rows.push({ counter: 'smelter:ingots_created', amount: qty });
      rows.push({ counter: 'smelter:metal_smelted', amount: qty * 5 });
    } else if (tool === 'crystallizer') {
      rows.push({ counter: 'crystallizer:crystalmalize', amount: 1 });
    } else if (tool === 'construction_tool') {
      rows.push({ counter: 'furniture_items:made', amount: qty });
      if (FURNITURE_DECOS.includes(classTsid)) rows.push({ counter: 'furniture_decos:made', amount: qty });
      else if (FURNITURE_CABINETS.includes(classTsid)) rows.push({ counter: 'furniture_cabinets:made', amount: qty });
      else if (FURNITURE_LAMPS.includes(classTsid)) rows.push({ counter: 'furniture_lamps:made', amount: qty });
      else if (FURNITURE_SEATS.includes(classTsid)) rows.push({ counter: 'furniture_seats:made', amount: qty });
    }
  }
  return rows;
}

/**
 * Counters for eating or drinking `count` of an item with its own Eat / Drink
 * verb (buff herbs' Munch / Activate verbs are not food_eat):
 * - include/food.js:194-201 food_eat: meals_eaten:<class> once per eat when
 *   base_cost x count > 10 ("Do not count small things like single cherries"),
 *   and items_eaten:<class> by count.
 * - include/drink.js:123-125 drink: items_drank:<class> by count, and
 *   items_drank:alcohol when the item carries the alcohol tag.
 */
export function consumeAchievementCounters(classTsid, { kind = 'food', tags = [], baseCost = 0, count = 1 } = {}) {
  const id = String(classTsid || '').trim();
  const n = Math.max(1, Math.floor(Number(count) || 1));
  if (!id) return [];
  if (kind === 'drink') {
    const rows = [{ counter: achievementCounter('items_drank', id), amount: n }];
    if ((tags || []).includes('alcohol')) rows.push({ counter: 'items_drank:alcohol', amount: n });
    return rows;
  }
  const rows = [];
  if ((Number(baseCost) || 0) * n > 10) rows.push({ counter: achievementCounter('meals_eaten', id), amount: 1 });
  rows.push({ counter: achievementCounter('items_eaten', id), amount: n });
  return rows;
}

/**
 * GSJS achievements_set(group, label, 0): a streak counter starting over
 * (player.js:991, coin_count:days_maxed after a day under 100 quoins). Every
 * locked badge with that exact condition loses its progress on it.
 */
export function resetAchievementCounter(state, counterName) {
  const cat = getAchievementCatalog();
  let reset = 0;
  for (const [id, def] of Object.entries(cat)) {
    if (state.unlocked.includes(id)) continue;
    const prog = state.progress?.[id]?.progress;
    if (!prog) continue;
    for (const c of def.conditions || []) {
      if (`${c.group}:${c.name}` === counterName && prog[c.name]) {
        prog[c.name] = 0;
        reset += 1;
      }
    }
  }
  return reset;
}

/**
 * players/inc_stores.js:225-235 stores_buy: one vendor purchase whose total
 * cost reaches 1,009 / 2,003 / 5,003 currants grants Big Spender,
 * El Big Spenderino and Moneybags Magoo.
 */
export function purchaseAchievementUpdates(state, totalCost, pc = null) {
  const cost = Math.max(0, Number(totalCost) || 0);
  const updates = [];
  const note = (classTsid, r) => {
    if (r.ok) updates.push({ classTsid, unlocked: true, rewards: r.rewards, def: r.def });
  };
  if (cost >= 1009) note('big_spender', unlockAchievement(state, 'big_spender', pc));
  if (cost >= 2003) note('el_big_spenderino', unlockAchievement(state, 'el_big_spenderino', pc));
  if (cost >= 5003) note('moneybags_magoo', unlockAchievement(state, 'moneybags_magoo', pc));
  return updates;
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

  // group_count groups this counter belongs to (`VERB:iconize:ti` is label
  // `ti` of group `VERB:iconize`): record the label once per group.
  const groupCounts = new Map();
  const groupCountFor = (c) => {
    if (c.type !== 'group_count' || !c.group || !counterName.startsWith(`${c.group}:`)) return null;
    if (!groupCounts.has(c.group)) {
      groupCounts.set(c.group, noteGroupLabel(state, c.group, counterName.slice(c.group.length + 1)));
    }
    return groupCounts.get(c.group);
  };

  for (const [id, def] of Object.entries(cat)) {
    if (state.unlocked.includes(id)) continue;
    const conds = def.conditions || [];
    if (!conds.length) continue;
    const matches = conds.filter((c) => {
      if (c.type === 'group_count') return groupCountFor(c) != null;
      const exactCounter = group
        ? `${c.group}:${c.name}` === counterName
        : c.name === counterName;
      // Three-part counters such as `VERB:tend:patch` belong to group `VERB:tend`.
      const groupedTotal = group && c.type === 'group_sum'
        && (c.group === group || counterName.startsWith(`${c.group}:`));
      return exactCounter || groupedTotal;
    });
    if (!matches.length) continue;
    if (!state.progress[id]) state.progress[id] = { progress: {} };
    for (const c of matches) {
      const cur = state.progress[id].progress[c.name] || 0;
      state.progress[id].progress[c.name] = c.type === 'group_count'
        ? Math.min(c.num, Math.max(cur, groupCounts.get(c.group) || 0))
        : Math.min(c.num, cur + delta);
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
  // Overachiever I-V: +2% to +10% on every badge reward (inc_achievements.js:331).
  const bonus = achievementRewardModifier(pc?.imaginationUpgrades);
  // Every generated onComplete: /completist/i badges pay x level/4 past level 4.
  const level = Number(pc?.level) || 0;
  const factor = /completist/i.test(String(def.name || def.title || '')) && level > 4 ? level / 4 : 1;
  applyRewards(pc, { ...(def.rewards || {}) }, { bonus, factor });
  const rewards = scaleRewards({ ...(def.rewards || {}) }, bonus, factor);
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
