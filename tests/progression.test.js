import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  XP_FOR_LEVEL,
  levelInfoForXp,
  xpIntervalForLevel,
  currantRewardForLevel,
  reconcilePlayerProgression,
  formatLevelProgress,
} from '../public/js/progression.js?v=33462eaa';

const here = dirname(fileURLToPath(import.meta.url));
const game = readFileSync(join(here, '../public/game.js'), 'utf8');
const html = readFileSync(join(here, '../public/play/index.html'), 'utf8');
const css = readFileSync(join(here, '../public/style.css'), 'utf8');
const content = readFileSync(join(here, '../public/content.js'), 'utf8');
const quoins = readFileSync(join(here, '../public/js/quoins.js'), 'utf8');

describe('official Tiny Speck level progression', () => {
  test('uses the complete inc_stats.js cumulative threshold table', () => {
    assert.equal(XP_FOR_LEVEL.length, 59);
    assert.deepEqual(XP_FOR_LEVEL.slice(0, 6), [400, 1091, 2180, 3795, 6085, 9219]);
    assert.equal(XP_FOR_LEVEL.at(-1), 23041093);
  });

  test('resolves level boundaries and progress within a level', () => {
    assert.equal(levelInfoForXp(0).level, 1);
    assert.equal(levelInfoForXp(399).level, 1);
    assert.equal(levelInfoForXp(400).level, 2);
    assert.equal(levelInfoForXp(1091).level, 3);

    const nearSix = levelInfoForXp(6080);
    assert.equal(nearSix.level, 5);
    assert.equal(nearSix.base, 3795);
    assert.equal(nearSix.next, 6085);
    assert.equal(nearSix.remaining, 5);
    assert.equal(nearSix.earned, 2285);
    assert.equal(nearSix.needed, 2290);
    assert.ok(nearSix.progress > 0.99 && nearSix.progress < 1);
  });

  test('recreates the original level-up currant schedule', () => {
    assert.equal(xpIntervalForLevel(2), 400);
    assert.equal(currantRewardForLevel(2), 100);
    assert.equal(currantRewardForLevel(3), 170);
    assert.equal(currantRewardForLevel(6), 570);
    assert.equal(currantRewardForLevel(26), 0);
    assert.ok(currantRewardForLevel(30) > 0);
  });

  test('applies refill and reward exactly once when XP crosses a level', () => {
    const pc = { xp: 6085, level: 5, energy: 20, mood: 30, currants: 200 };
    const first = reconcilePlayerProgression(pc);
    assert.equal(first.leveledUp, true);
    assert.equal(first.toLevel, 6);
    assert.equal(first.currants, 570);
    assert.equal(first.energyAdded, 80);
    assert.equal(first.moodAdded, 70);
    assert.deepEqual(first.levelsGained, [6]);
    assert.deepEqual(pc, { xp: 6085, level: 6, energy: 100, mood: 100, currants: 770 });

    const second = reconcilePlayerProgression(pc);
    assert.equal(second.leveledUp, false);
    assert.equal(pc.currants, 770, 'repeat HUD renders must not duplicate rewards');
  });

  test('handles a multi-level reward jump and formats the HUD readout', () => {
    const pc = { xp: 2180, level: 1, energy: 5, mood: 6, currants: 0 };
    const result = reconcilePlayerProgression(pc);
    assert.deepEqual(result.levelsGained, [2, 3, 4]);
    // stats_add_xp pays the level reached once (prev_level = info.level - 1).
    assert.equal(result.currants, 270);
    assert.equal(result.favor, 15);
    assert.equal(pc.level, 4);
    assert.equal(formatLevelProgress(levelInfoForXp(6080)), '2,285 / 2,290 XP');
  });
});

describe('progression client wiring', () => {
  test('ships a visible level meter, award reconciliation, and XP-complete rewards', () => {
    assert.match(html, /id="level-meter"/);
    assert.match(html, /id="stat-level"/);
    assert.match(html, /id="bar-level"/);
    assert.match(css, /\.level-track > i/);
    assert.match(game, /reconcilePlayerProgression\(pc\)/);
    assert.match(game, /kind: 'level'/);
    assert.match(game, /collectQuoin\(quoinState/);
    assert.match(quoins, /actual = grantMoodXp\(pc, amount\)/);
    assert.match(game, /makingToolAchievementCounter/);
    assert.match(content, /grantMoodXp\(pc, result\.xpBonus\)/);
  });
});
