/**
 * Verb metabolic rewards + activity line formatting.
 * Energy costs / mood / xp aligned with GSJS skill packages (ak_piggy_pet, etc.).
 */

/**
 * @typedef {{
 *   energyCost: number,
 *   moodGain: number,
 *   xpGain: number,
 *   activity: string,
 * }} VerbReward
 */

/**
 * Default rewards when skill rank ≈ Animal Kinship 1 / base gardening.
 * Source: items/catalog_skill_packages.js (energy_cost, mood_bonus, xp_bonus).
 */
import { metabolicGain, moodMax } from './metabolics.js';
import { grantMoodXp } from './mood-xp.js';
export const VERB_REWARDS = {
  'npc_piggy:pet': {
    energyCost: 4,
    moodGain: 1,
    xpGain: 1,
    activity: 'You pet a Piggy.',
  },
  'npc_piggy:nibble': {
    energyCost: 4,
    moodGain: 10,
    xpGain: 4,
    activity: 'You nibble a Piggy.',
  },
  'npc_chicken:squeeze': {
    energyCost: 1,
    moodGain: 1,
    xpGain: 1,
    activity: 'You squeeze a Chicken.',
  },
  'npc_butterfly:massage': {
    energyCost: 5,
    moodGain: 1,
    xpGain: 1,
    activity: 'You massage a Butterfly.',
  },
  'npc_butterfly:milk': {
    energyCost: 5,
    moodGain: 1,
    xpGain: 1,
    activity: 'You milk a Butterfly.',
  },
  'trant_fruit:pet': {
    energyCost: 2,
    moodGain: 2,
    xpGain: 1,
    activity: 'You pet a Fruit Tree.',
  },
  'trant_fruit:water': {
    energyCost: 2,
    moodGain: 2,
    xpGain: 1,
    activity: 'You water a Fruit Tree.',
  },
  'trant_fruit:harvest': {
    energyCost: 5,
    moodGain: 1,
    xpGain: 2,
    activity: 'You harvest a Fruit Tree.',
  },
  // Living trants share pet/water rewards with fruit; harvest uses Arborology package.
  'trant_egg:pet': {
    energyCost: 2,
    moodGain: 2,
    xpGain: 1,
    activity: 'You pet an Egg Plant.',
  },
  'trant_egg:water': {
    energyCost: 2,
    moodGain: 2,
    xpGain: 1,
    activity: 'You water an Egg Plant.',
  },
  'wood_tree:pet': {
    energyCost: 2,
    moodGain: 4,
    xpGain: 2,
    activity: 'You pet a Wood Tree.',
  },
  'wood_tree:water': {
    energyCost: 3,
    moodGain: 2,
    xpGain: 2,
    activity: 'You water a Wood Tree.',
  },
  'wood_tree:harvest': {
    energyCost: 20,
    moodGain: 0,
    xpGain: 0,
    activity: 'You harvest a Wood Tree.',
  },
};

/**
 * @param {string} classId
 * @param {string} verbId
 * @returns {VerbReward|null}
 */
export function getVerbReward(classId, verbId) {
  return VERB_REWARDS[`${classId}:${verbId}`] || null;
}

/**
 * Apply verb reward metabolics to pc. Does not spend beyond available energy.
 * @param {object} pc
 * @param {VerbReward} reward
 * @returns {{ energy: number, mood: number, xp: number, ok: boolean }}
 */
export function applyVerbReward(pc, reward) {
  if (!pc || !reward) return { energy: 0, mood: 0, xp: 0, ok: false };
  const cost = reward.energyCost || 0;
  if ((pc.energy || 0) < cost) {
    return { energy: 0, mood: 0, xp: 0, ok: false };
  }
  pc.energy = Math.max(0, (pc.energy || 0) - cost);
  // G227: inc_skill_packages.js 524 adds mood_bonus through metabolics_add_mood,
  // which gives nothing while dead (inc_metabolics.js 79-86; js/metabolics.js).
  const mood = reward.moodGain && metabolicGain('mood').ok ? reward.moodGain : 0;
  const xp = reward.xpGain || 0;
  if (mood) pc.mood = Math.min(moodMax(pc), (pc.mood || 0) + mood);
  // inc_skill_packages.js 532: the package's xp_bonus takes the mood bonus.
  const landed = xp ? grantMoodXp(pc, xp) : 0;
  return { energy: -cost, mood, xp: landed, ok: true };
}

/**
 * @typedef {{ kind: 'base'|'loss'|'gain'|'neutral', text: string, stat?: 'energy'|'mood'|'xp'|'item' }} ActivitySegment
 */

/**
 * Signed compact delta text like original feed: "-4 energy", "+2 mood", "+1 iMG".
 * @param {number} n
 * @param {string} unit
 */
export function formatSignedDelta(n, unit) {
  if (!n) return '';
  const sign = n > 0 ? '+' : ''; // negatives already include '-'
  return `${sign}${n} ${unit}`;
}

/**
 * Structured segments for activity feed styling (gain vs loss).
 * @param {string} base  e.g. "You pet a Piggy."
 * @param {{ energy?: number, mood?: number, xp?: number, items?: Record<string, number> }} effects
 * @param {(id:string)=>string} [labelOf]
 * @returns {ActivitySegment[]}
 */
export function buildActivitySegments(base, effects = {}, labelOf = (id) => id) {
  /** @type {ActivitySegment[]} */
  const segs = [];
  const baseText = String(base || '').replace(/\.$/, '');
  if (baseText) segs.push({ kind: 'base', text: baseText });

  const pushStat = (n, unit, stat) => {
    if (!n) return;
    const text = formatSignedDelta(n, unit);
    const kind = n < 0 ? 'loss' : n > 0 ? 'gain' : 'neutral';
    segs.push({ kind, text, stat });
  };

  if (effects.energy) pushStat(effects.energy, 'energy', 'energy');
  if (effects.mood) pushStat(effects.mood, 'mood', 'mood');
  if (effects.xp) pushStat(effects.xp, 'iMG', 'xp');
  if (effects.items) {
    for (const [id, n] of Object.entries(effects.items)) {
      if (!n) continue;
      const label = labelOf(id);
      if (n > 0) {
        segs.push({
          kind: 'gain',
          text: `+${n} ${label}`,
          stat: 'item',
        });
      } else {
        segs.push({
          kind: 'loss',
          text: `${n} ${label}`,
          stat: 'item',
        });
      }
    }
  }
  return segs;
}

/**
 * Plain-text Glitch-style activity line with signed deltas (original feed style).
 * Example: "You pet a Piggy. -4 energy, +1 mood, +1 iMG."
 * @param {string} base
 * @param {{ energy?: number, mood?: number, xp?: number, items?: Record<string, number> }} effects
 * @param {(id:string)=>string} [labelOf]
 */
export function formatActivityLine(base, effects = {}, labelOf = (id) => id) {
  const segs = buildActivitySegments(base, effects, labelOf);
  if (!segs.length) return '';
  const baseSeg = segs.find((s) => s.kind === 'base');
  const rest = segs.filter((s) => s.kind !== 'base').map((s) => s.text);
  if (!rest.length) return baseSeg ? closeSentence(baseSeg.text) : '';
  return `${closeSentence(baseSeg?.text || 'You did a thing')} ${rest.join(', ')}.`;
}

/** A line that already ends a sentence ("plus tomatoes!") keeps its own mark instead of gaining a period. */
function closeSentence(text) {
  return /[.!?…]["'”’)]*$/.test(text) ? text : `${text}.`;
}

/**
 * HTML for activity feed: wraps loss/gain deltas in styled spans.
 * @param {ActivitySegment[]} segments
 * @returns {string}
 */
export function activitySegmentsToHtml(segments) {
  if (!segments?.length) return '';
  const base = segments.find((s) => s.kind === 'base');
  const rest = segments.filter((s) => s.kind !== 'base');
  const esc = (t) =>
    String(t)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  let html = base ? `<span class="act-base">${esc(base.text)}</span>` : '';
  const stop = base && closeSentence(base.text) !== base.text ? '.' : '';
  if (rest.length) {
    const bits = rest.map((s) => {
      const cls =
        s.kind === 'loss' ? 'act-loss' : s.kind === 'gain' ? 'act-gain' : 'act-neutral';
      return `<span class="${cls}">${esc(s.text)}</span>`;
    });
    html += (html ? `${stop} ` : '') + bits.join(', ') + '.';
  } else if (html) {
    html += stop;
  }
  return html;
}

/**
 * Convenience: base + effects → styled HTML line.
 */
export function formatActivityHtml(base, effects = {}, labelOf = (id) => id) {
  return activitySegmentsToHtml(buildActivitySegments(base, effects, labelOf));
}

/**
 * Mutable activity log for UI + tests.
 */
export function createActivityLog(limit = 40) {
  return { lines: [], limit };
}

/**
 * @param {{ lines: string[], limit: number }} log
 * @param {string} line
 */
export function appendActivity(log, line) {
  if (!log || !line) return log;
  log.lines.unshift(String(line));
  if (log.lines.length > log.limit) log.lines.length = log.limit;
  return log;
}
