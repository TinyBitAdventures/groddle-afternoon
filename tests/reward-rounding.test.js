/**
 * Quest and badge rewards round like GSJS: common.js round_to_5 on every
 * reward (even at multiplier 1), and Completist badges pay x level/4 past
 * level 4 (every generated achievements/*.js onComplete).
 */
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyRewards, roundTo5 } from '../public/js/quests.js';
import { scaleRewards } from '../public/js/imagination-effects.js';
import { loadContentCatalogsFromDir, getAchievementCatalog } from '../public/js/content-catalogs.js';
import { createAchievementState, unlockAchievement } from '../public/js/achievements.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

describe('round_to_5', () => {
  it('matches common.js on the half-way and truncation cases', () => {
    assert.deepEqual([11, 12.4, 12.5, 262.5, 18888, 0].map(roundTo5), [10, 10, 15, 265, 18890, 0]);
  });

  it('pays and displays buffed quest rewards rounded to 5', () => {
    const pc = { xp: 0, imagination: 0, currants: 0, mood: 0, energy: 0, rewardMultiplier: 1.05 };
    applyRewards(pc, { xp: 250, currants: 11 });
    assert.equal(pc.xp, 265);
    assert.equal(pc.currants, 10);
    assert.equal(scaleRewards({ xp: 11 }, 0).xp, 10);
  });
});

describe('Completist badges', () => {
  before(async () => loadContentCatalogsFromDir(join(root, 'public/assets/content')));

  it('multiply their reward by level / 4 past level 4', () => {
    const id = Object.keys(getAchievementCatalog()).find((k) => /completist/i.test(getAchievementCatalog()[k].name) && getAchievementCatalog()[k].rewards?.xp);
    assert.ok(id);
    const base = getAchievementCatalog()[id].rewards.xp;
    const pc = { xp: 0, imagination: 0, level: 12, giantFavor: {} };
    const res = unlockAchievement(createAchievementState(), id, pc);
    assert.equal(pc.xp, roundTo5(base * 3));
    assert.equal(res.rewards.xp, roundTo5(base * 3));
    const low = { xp: 0, imagination: 0, level: 4, giantFavor: {} };
    unlockAchievement(createAchievementState(), id, low);
    assert.equal(low.xp, roundTo5(base));
  });
});
