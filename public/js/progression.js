/**
 * Player level progression from Tiny Speck's players/inc_stats.js.
 *
 * XP is the lifetime total used for levels. Imagination remains the spendable
 * point balance; gameplay rewards normally increase both values together.
 */

/** Cumulative XP thresholds for levels 2 through 60. */
export const XP_FOR_LEVEL = Object.freeze([
  400, 1091, 2180, 3795, 6085, 9219, 13393, 18826, 25766, 34490,
  45305, 58551, 74604, 93876, 116819, 143924, 175726, 212806, 255793,
  305366, 362256, 427250, 501193, 584989, 679606, 786079, 905510,
  1039074, 1188021, 1353678, 1537454, 1740841, 1965421, 2212865,
  2484939, 2783508, 3110539, 3468103, 3858382, 4283670, 4746380,
  5249045, 5794324, 6385006, 7024015, 7714412, 8459403, 9262341,
  10126733, 11056241, 12054692, 13126080, 14274570, 15504507,
  16820419, 18227022, 19729227, 21332145, 23041093,
]);

const clamp01 = (value) => Math.max(0, Math.min(1, value));

/**
 * Resolve official level bounds for a cumulative XP total.
 * @param {number} xp
 */
export function levelInfoForXp(xp) {
  const total = Math.max(0, Math.floor(Number(xp) || 0));
  let level = 1;
  while (level <= XP_FOR_LEVEL.length && total >= XP_FOR_LEVEL[level - 1]) level += 1;
  const base = level <= 1 ? 0 : XP_FOR_LEVEL[level - 2];
  const next = XP_FOR_LEVEL[level - 1] || null;
  const needed = next == null ? 0 : next - base;
  const earned = next == null ? 0 : total - base;
  return {
    level,
    xp: total,
    base,
    next,
    earned,
    needed,
    remaining: next == null ? 0 : Math.max(0, next - total),
    progress: next == null ? 1 : clamp01(needed ? earned / needed : 1),
    atCap: next == null,
  };
}

/** XP interval whose completion awards the given new level. */
export function xpIntervalForLevel(level) {
  const n = Math.max(1, Math.floor(Number(level) || 1));
  if (n <= 1) return 0;
  const top = XP_FOR_LEVEL[n - 2];
  if (top == null) return 0;
  const base = n <= 2 ? 0 : XP_FOR_LEVEL[n - 3];
  return top - base;
}

/**
 * Original level-up currant rule: every level through 25, then every fifth.
 * @param {number} level newly reached level
 */
export function currantRewardForLevel(level) {
  const n = Math.max(1, Math.floor(Number(level) || 1));
  if (n <= 1 || (n > 25 && n % 5 !== 0)) return 0;
  return Math.round(xpIntervalForLevel(n) / 40) * 10;
}

/**
 * Bring `pc.level` in line with lifetime XP and apply level-up rewards once.
 * Mirrors the original refill + currant reward while omitting the unused favor
 * currency from this focused remake.
 *
 * @param {object} pc
 * @param {{ energyTop?: number, moodTop?: number }} [opts]
 */
export function reconcilePlayerProgression(pc, opts = {}) {
  const info = levelInfoForXp(pc?.xp || 0);
  if (!pc) return { leveledUp: false, fromLevel: info.level, toLevel: info.level, info };

  const hadLevel = Number.isFinite(pc.level);
  const fromLevel = hadLevel ? Math.max(1, Math.floor(pc.level)) : info.level;
  const toLevel = info.level;
  pc.level = toLevel;

  if (!hadLevel || toLevel <= fromLevel) {
    return {
      leveledUp: false,
      fromLevel,
      toLevel,
      levelsGained: [],
      currants: 0,
      energyAdded: 0,
      moodAdded: 0,
      info,
    };
  }

  const levelsGained = [];
  let currants = 0;
  for (let level = fromLevel + 1; level <= toLevel; level += 1) {
    levelsGained.push(level);
    currants += currantRewardForLevel(level);
  }

  const energyTop = Math.max(0, Number(opts.energyTop) || Number(pc.energyMax) || 100);
  const moodTop = Math.max(0, Number(opts.moodTop) || 100);
  const beforeEnergy = Number(pc.energy) || 0;
  const beforeMood = Number(pc.mood) || 0;
  pc.energy = energyTop;
  pc.mood = moodTop;
  pc.currants = (Number(pc.currants) || 0) + currants;

  return {
    leveledUp: true,
    fromLevel,
    toLevel,
    levelsGained,
    currants,
    energyAdded: energyTop - beforeEnergy,
    moodAdded: moodTop - beforeMood,
    info,
  };
}

/** Compact text used by the always-visible HUD meter. */
export function formatLevelProgress(info) {
  if (!info) return '';
  if (info.atCap) return `${info.xp.toLocaleString()} XP · level cap`;
  return `${info.earned.toLocaleString()} / ${info.needed.toLocaleString()} XP`;
}
