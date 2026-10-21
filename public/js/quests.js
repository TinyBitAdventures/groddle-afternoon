/**
 * Quest runner over mined GSJS quest catalog (assets/content/quests.json).
 * Assign → counter progress → complete with rewards.
 *
 * Offers, event routing, item sync, timers and turn-in live in
 * quest-offers.js; this module keeps the original small runner API
 * (createQuestState … listQuestTracker) plus reward helpers:
 *   applyRewards(pc, rewards)                  scalar + per-Giant favor (unchanged contract)
 *   applyQuestRewards(pc, rewards, ctx)        + items into ctx.inv, recipes via ctx.learnRecipe; returns summary
 *   questRewardSummary(rewards, { multiplier }) award-screen lines without applying anything
 */

import { getQuestCatalog } from './content-catalogs.js';
import { questRewardModifier } from './imagination-effects.js';

/**
 * @typedef {{
 *   classTsid: string,
 *   title: string,
 *   desc: string,
 *   offer: string,
 *   completion: string,
 *   requirements: { id: string, type: string, name: string, num: number, classId?: string, desc: string }[],
 *   rewards: { xp?: number, currants?: number, energy?: number, mood?: number },
 *   prereqQuests?: string[],
 * }} QuestDef
 */

/**
 * Backward-compatible catalog accessor (mined data after loadContentCatalogs).
 * Falls back to empty until catalogs load.
 */
export const QUEST_CATALOG = new Proxy(
  {},
  {
    get(_t, prop) {
      if (prop === 'then') return undefined;
      const cat = getQuestCatalog();
      if (prop === Symbol.toStringTag) return 'Object';
      if (prop === 'toJSON') return () => cat;
      return cat[prop];
    },
    ownKeys() {
      return Object.keys(getQuestCatalog());
    },
    getOwnPropertyDescriptor(_t, prop) {
      const cat = getQuestCatalog();
      if (prop in cat) return { configurable: true, enumerable: true, value: cat[prop] };
      return undefined;
    },
    has(_t, prop) {
      return prop in getQuestCatalog();
    },
  }
);

export function createQuestState() {
  return { active: {}, completed: [], story: {} };
}

/**
 * Convert the original quest dialogue markup into guide text plus the player's
 * response-button copy. This preserves Tiny Speck's authored cadence without
 * putting raw <split> tags into the remake UI.
 */
export function parseQuestConversation(raw = '') {
  const source = String(raw || '').replace(/\r\n?/g, '\n').trim();
  if (!source) return [];
  const split = /<split\b[^>]*butt_txt=(["'])(.*?)\1[^>]*\/?>/gis;
  const beats = [];
  let cursor = 0;
  let match;
  while ((match = split.exec(source))) {
    const text = cleanQuestMarkup(source.slice(cursor, match.index));
    const response = cleanQuestMarkup(match[2]);
    if (text || response) beats.push({ text, response });
    cursor = split.lastIndex;
  }
  const tail = cleanQuestMarkup(source.slice(cursor));
  if (tail) beats.push({ text: tail, response: '' });
  return beats;
}

export function cleanQuestMarkup(raw = '') {
  return String(raw || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<a\b[^>]*>(.*?)<\/a>/gis, '$1')
    .replace(/<b\b[^>]*>(.*?)<\/b>/gis, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/&hellip;/gi, '…')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function listQuests(filter = 'all') {
  const cat = getQuestCatalog();
  const rows = Object.values(cat);
  if (filter === 'jobs') return rows.filter((q) => q.isJob);
  if (filter === 'story') return rows.filter((q) => !q.isJob);
  return rows;
}

/**
 * @param {ReturnType<typeof createQuestState>} state
 * @param {string} classTsid
 */
/**
 * @param {ReturnType<typeof createQuestState>} state
 * @param {string} classTsid
 * @param {{ ignorePrereq?: boolean }} [opts]
 */
export function assignQuest(state, classTsid, opts = {}) {
  const def = getQuestCatalog()[classTsid];
  if (!def) throw new Error(`Unknown quest: ${classTsid}`);
  if (state.completed.includes(classTsid)) {
    return { ok: false, reason: 'already_completed', quest: null };
  }
  if (state.active[classTsid]) {
    return { ok: false, reason: 'already_active', quest: state.active[classTsid] };
  }
  if (!opts.ignorePrereq) {
    for (const pre of def.prereqQuests || []) {
      if (!state.completed.includes(pre)) {
        return { ok: false, reason: 'prereq', quest: null, missing: pre };
      }
    }
  }
  const progress = {};
  for (const r of def.requirements || []) {
    progress[r.name] = 0;
  }
  state.active[classTsid] = {
    classTsid,
    progress,
    startedAt: Date.now(),
  };
  return { ok: true, reason: 'assigned', quest: state.active[classTsid], def };
}

export function eventToCounter(event) {
  const map = {
    pet_piggy: 'piggies_petted',
    squeeze_chicken: 'chickens_squeezed',
    milk_butterfly: 'butterflies_milked',
    harvest_tree: 'trees_harvested',
    harvest_fruit: 'trees_harvested',
    // generic passthrough: use counter name as event
  };
  return map[event] || null;
}

/**
 * Apply progress for a counter name (or known event alias).
 * @param {ReturnType<typeof createQuestState>} state
 * @param {string} counterOrEvent
 * @param {number} [amount=1]
 * @param {object} [pc]
 */
export function applyQuestProgress(state, counterOrEvent, amount = 1, pc = null) {
  const counter = eventToCounter(counterOrEvent) || counterOrEvent;
  const updates = [];
  const cat = getQuestCatalog();

  for (const qid of Object.keys(state.active)) {
    const q = state.active[qid];
    const def = cat[qid];
    if (!def) continue;
    const req = (def.requirements || []).find((r) => r.name === counter);
    if (!req) continue;
    q.progress[counter] = Math.min(req.num, (q.progress[counter] || 0) + amount);
    const done = (def.requirements || []).every((r) => (q.progress[r.name] || 0) >= r.num);
    if (done) {
      const result = completeQuest(state, qid, pc);
      updates.push({ classTsid: qid, completed: true, rewards: result.rewards, def });
    } else {
      updates.push({ classTsid: qid, completed: false, def });
    }
  }
  return updates;
}

/**
 * @param {ReturnType<typeof createQuestState>} state
 * @param {string} classTsid
 * @param {object} [pc]
 */
export function completeQuest(state, classTsid, pc = null) {
  const def = getQuestCatalog()[classTsid];
  if (!def) throw new Error(`Unknown quest: ${classTsid}`);
  if (!state.active[classTsid]) {
    return { ok: false, reason: 'not_active', rewards: null };
  }
  delete state.active[classTsid];
  if (!state.completed.includes(classTsid)) state.completed.push(classTsid);

  const rewards = { ...(def.rewards || {}) };
  // Fit for a King I-V: +2% to +10% on top of any reward buff (inc_quests.js:844).
  applyRewards(pc, rewards, { bonus: questRewardModifier(pc?.imaginationUpgrades) });
  return { ok: true, reason: 'completed', rewards, def };
}

/**
 * common.js round_to_5: every quest and badge reward is rounded to the
 * nearest 5 (a remainder of 2.5 rounds up), even at multiplier 1.
 */
export function roundTo5(value) {
  const v = Number(value) || 0;
  return v % 5 >= 2.5 ? Math.trunc(v / 5) * 5 + 5 : Math.trunc(v / 5) * 5;
}

/**
 * @param {object|null} pc
 * @param {object} rewards
 * @param {{ bonus?: number, factor?: number }} [opts] factor multiplies after the bonus (Completist level/4)
 */
export function applyRewards(pc, rewards, opts = {}) {
  if (!pc || !rewards) return pc;
  const buffMultiplier = Math.max(1, Number(pc.rewardMultiplier) || 1);
  // Imagination reward upgrades add to the buff multiplier (Overachiever,
  // Fit for a King): multiplier = buff + modifier.
  const factor = Number(opts.factor) > 0 ? Number(opts.factor) : 1;
  const multiplier = (buffMultiplier + Math.max(0, Number(opts.bonus) || 0)) * factor;
  const scaled = (value) => Math.max(0, roundTo5((Number(value) || 0) * multiplier));
  const energy = scaled(rewards.energy);
  const mood = scaled(rewards.mood);
  const xp = scaled(rewards.xp);
  const currants = scaled(rewards.currants);
  const favorRewards = questFavorEntries(rewards.favor).map((entry) => ({
    giant: entry.giant,
    points: scaled(entry.points),
  }));
  const favorPoints = favorRewards.reduce((sum, entry) => sum + entry.points, 0);
  if (energy) pc.energy = Math.min(Math.max(100, Number(pc.energyMax) || 100), (pc.energy || 0) + energy);
  if (mood) pc.mood = Math.min(100, (pc.mood || 0) + mood);
  if (xp) {
    pc.imagination = (pc.imagination || 0) + xp;
    pc.xp = (pc.xp || 0) + xp;
  }
  if (currants) pc.currants = (pc.currants || 0) + currants;
  const favor = pc.giantFavor || pc.favor;
  if (favor && typeof favor === 'object') {
    for (const entry of favorRewards) {
      if (!entry.points) continue;
      favor[entry.giant] = Math.max(0, Number(favor[entry.giant]) || 0) + entry.points;
    }
  }
  if (buffMultiplier > 1 && (energy || mood || xp || currants || favorPoints)) {
    pc.rewardBuffConsumed = true;
  }
  return pc;
}

/**
 * GSJS favor rewards are numeric buckets ({"0": {giant, points}}); older
 * callers pass a single {giant, points}. Returns every valid entry.
 */
export function questFavorEntries(favor) {
  if (!favor || typeof favor !== 'object') return [];
  const list = favor.points ? [favor] : Object.values(favor);
  return list
    .filter((entry) => entry && Number(entry.points) > 0 && String(entry.giant || '').trim())
    .map((entry) => ({ giant: String(entry.giant).trim(), points: Number(entry.points) }));
}

function questRewardRows(bucket) {
  if (!bucket || typeof bucket !== 'object') return [];
  return Array.isArray(bucket) ? bucket : Object.values(bucket);
}

const giantLabel = (giant) => {
  const id = String(giant || '');
  return id ? id[0].toUpperCase() + id.slice(1) : id;
};

/**
 * Reward lines for the award screen (screen-fx.js awardRewardTokens reads the
 * ` · `-joined subtitle). Nothing is applied.
 * @param {object} rewards  quest def rewards
 * @param {{ multiplier?: number }} [opts]
 */
export function questRewardSummary(rewards = {}, opts = {}) {
  const multiplier = Math.max(1, Number(opts.multiplier) || 1);
  const scaled = (value) => Math.max(0, roundTo5((Number(value) || 0) * multiplier));
  const summary = {
    xp: scaled(rewards?.xp),
    currants: scaled(rewards?.currants),
    mood: scaled(rewards?.mood),
    energy: scaled(rewards?.energy),
    favor: questFavorEntries(rewards?.favor).map((entry) => ({ giant: entry.giant, points: scaled(entry.points) })),
    items: questRewardRows(rewards?.items)
      .map((row) => ({
        classTsid: String(row?.class_tsid || row?.classTsid || ''),
        label: String(row?.label || row?.class_tsid || row?.classTsid || ''),
        count: Math.max(1, Math.floor(Number(row?.count) || 1)),
      }))
      .filter((row) => row.classTsid),
    recipes: questRewardRows(rewards?.recipes)
      // GSJS data names the recipe by its output class_tsid; rewards_deep_copy used recipe_id.
      .map((row) => ({
        recipeId: String(row?.recipe_id ?? row?.recipeId ?? row?.class_tsid ?? row?.classTsid ?? ''),
        label: String(row?.label || ''),
      }))
      .filter((row) => row.recipeId),
  };
  const lines = [];
  if (summary.xp) lines.push(`+${summary.xp.toLocaleString('en-US')} iMG`);
  if (summary.currants) lines.push(`+${summary.currants.toLocaleString('en-US')} currants`);
  if (summary.mood) lines.push(`+${summary.mood} mood`);
  if (summary.energy) lines.push(`+${summary.energy} energy`);
  for (const entry of summary.favor) lines.push(`+${entry.points} ${giantLabel(entry.giant)} favor`);
  for (const item of summary.items) lines.push(`${item.count}× ${item.label}`);
  for (const recipe of summary.recipes) lines.push(`Recipe: ${recipe.label || recipe.recipeId}`);
  summary.lines = lines;
  summary.subtitle = lines.join(' · ');
  return summary;
}

/**
 * Full quest reward grant: everything applyRewards does, plus reward items
 * into ctx.inv (ctx.addItem(inv, classTsid, n) if given, otherwise plain
 * pack-map arithmetic) and recipe rewards through ctx.learnRecipe(id).
 * Returns the questRewardSummary of what was granted.
 * @param {object|null} pc
 * @param {object} rewards
 * @param {{ inv?: object, addItem?: Function, learnRecipe?: Function }} [ctx]
 */
export function applyQuestRewards(pc, rewards = {}, ctx = {}) {
  const bonus = questRewardModifier(pc?.imaginationUpgrades);
  const summary = questRewardSummary(rewards, {
    multiplier: Math.max(1, Number(pc?.rewardMultiplier) || 1) + bonus,
  });
  if (pc) applyRewards(pc, rewards, { bonus });
  if (ctx.inv) {
    for (const item of summary.items) {
      if (typeof ctx.addItem === 'function') ctx.addItem(ctx.inv, item.classTsid, item.count);
      else ctx.inv[item.classTsid] = (Number(ctx.inv[item.classTsid]) || 0) + item.count;
    }
  }
  if (typeof ctx.learnRecipe === 'function') {
    for (const recipe of summary.recipes) ctx.learnRecipe(recipe.recipeId, recipe);
  }
  return summary;
}

/**
 * @param {ReturnType<typeof createQuestState>} state
 * @param {string} classTsid
 */
export function getQuestProgress(state, classTsid) {
  const def = getQuestCatalog()[classTsid];
  const active = state.active[classTsid];
  if (!def) return null;
  return {
    def,
    active: !!active,
    completed: state.completed.includes(classTsid),
    progress: active ? { ...active.progress } : {},
    requirements: (def.requirements || []).map((r) => ({
      ...r,
      current: active
        ? active.progress[r.name] || 0
        : state.completed.includes(classTsid)
          ? r.num
          : 0,
    })),
  };
}

/**
 * Listable log rows for UI.
 * @param {ReturnType<typeof createQuestState>} state
 */
export function listQuestLog(state) {
  const cat = getQuestCatalog();
  const rows = [];
  for (const qid of Object.keys(state.active)) {
    const p = getQuestProgress(state, qid);
    if (p) rows.push({ ...p, status: 'active' });
  }
  for (const qid of state.completed) {
    const def = cat[qid];
    if (def) {
      rows.push({
        def,
        active: false,
        completed: true,
        progress: {},
        requirements: (def.requirements || []).map((r) => ({ ...r, current: r.num })),
        status: 'completed',
      });
    }
  }
  return rows;
}

/**
 * Compact active-quest projection for the always-visible play HUD.
 * Keeps UI concerns out of the quest runner while providing stable progress values.
 * @param {ReturnType<typeof createQuestState>} state
 * @param {number} [limit=2]
 */
export function listQuestTracker(state, limit = 2) {
  const safeLimit = Math.max(0, Math.floor(Number(limit) || 0));
  return listQuestLog(state)
    .filter((row) => row.status === 'active')
    .sort((a, b) =>
      (Number(state.active[b.def.classTsid]?.startedAt) || 0) -
      (Number(state.active[a.def.classTsid]?.startedAt) || 0)
    )
    .slice(0, safeLimit)
    .map((row) => ({
      classTsid: row.def.classTsid,
      title: row.def.title || row.def.name || row.def.classTsid,
      requirements: row.requirements.map((req) => {
        const total = Math.max(0, Number(req.num) || 0);
        const current = Math.max(0, Math.min(total, Number(req.current) || 0));
        return {
          name: req.name,
          desc: req.desc || req.name,
          current,
          total,
          percent: total > 0 ? Math.round((current / total) * 100) : 100,
        };
      }),
    }));
}
