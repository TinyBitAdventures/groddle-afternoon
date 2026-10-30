/**
 * Unlearning skills: who can unlearn what, timing, pausing, completion,
 * cancel, the study gate, and the cards.
 * Run: node --test tests/unlearning.test.js
 */
import { before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { loadContentCatalogsFromDir, resetContentCatalogs, getSkillCatalog } from '../public/js/content-catalogs.js?v=10b118dd';
import { createSkillState, startSkillStudy } from '../public/js/skills.js?v=4542bdf9';
import {
  SKILL_QUEST_MAP,
  canUnlearnSkill,
  cancelUnlearning,
  createUnlearnState,
  startUnlearning,
  studyGate,
  tickUnlearning,
  unlearnCheck,
  unlearnSeconds,
  unlearnStatus,
} from '../public/js/unlearning.js?v=72d5ffe2';
import { remakeStatus } from '../public/js/imagination-remake.js?v=ca0a48d5';

const root = join(import.meta.dirname, '..', 'public');
const CARD = ['unlearning_ability'];

before(async () => {
  resetContentCatalogs();
  await loadContentCatalogsFromDir(join(root, 'assets/content'));
});

describe('unlearning rules', () => {
  it('time = point_cost / 10, rounded, then x0.75 or x0.5', () => {
    const pc = getSkillCatalog().mining_3.pointCost;
    assert.equal(unlearnSeconds(pc), Math.round(pc / 10));
    assert.equal(unlearnSeconds(1000, ['unlearning_time_1']), 75);
    assert.equal(unlearnSeconds(1000, ['unlearning_time_1', 'unlearning_time_2']), 50);
  });

  it('only skills nothing learned or queued depends on', () => {
    const skills = createSkillState({ learned: ['mining_1', 'mining_2', 'mining_3'] });
    assert.equal(canUnlearnSkill(skills, 'mining_3'), true);
    assert.equal(canUnlearnSkill(skills, 'mining_2'), false);
    assert.equal(canUnlearnSkill(skills, 'cheffery_1'), false, 'not known');
    const u = createUnlearnState();
    assert.equal(unlearnCheck(u, skills, 'mining_3', {}).msg, "You don't know how to unlearn.");
    assert.equal(unlearnCheck(u, skills, 'mining_2', { upgrades: CARD }).msg, "You can't unlearn a skill that is required for your other skills.");
  });

  it('pauses study, blocks new study, removes the skill when due', () => {
    const skills = createSkillState({ learned: ['mining_1', 'mining_2', 'mining_3', 'ezcooking_1'] });
    startSkillStudy(skills, 'ezcooking_2', { level: 50, unlockedAchievements: ['able_chopper'] }, 0);
    assert.equal(skills.queue.ezcooking_2.isPaused, false);
    const u = createUnlearnState();
    const res = startUnlearning(u, skills, 'mining_3', { upgrades: CARD }, 1000);
    assert.equal(res.ok, true);
    assert.equal(res.msg, 'You started unlearning Mining III.');
    assert.deepEqual(res.paused, ['ezcooking_2']);
    assert.equal(skills.queue.ezcooking_2.isPaused, true);
    assert.equal(studyGate(u).msg, "You can't learn a skill while you are unlearning Mining III.");
    assert.equal(unlearnCheck(u, skills, 'ezcooking_2', { upgrades: CARD }).busy, true, 'one at a time');
    assert.equal(tickUnlearning(u, skills, {}, 1000 + res.seconds * 1000 - 1), null);
    assert.ok(unlearnStatus(u, 1000).remainingSeconds > 0);
    const done = tickUnlearning(u, skills, {}, 1000 + res.seconds * 1000);
    assert.equal(done.msg, 'You unlearned Mining III.');
    assert.equal(done.counter, 'skills_unlearned:mining_3');
    assert.equal(skills.learned.includes('mining_3'), false);
    assert.equal(studyGate(u), null);
    assert.equal(canUnlearnSkill(skills, 'mining_2'), true, 'Mining II is now a leaf');
  });

  it('a queued skill takes back only the points already studied', () => {
    const skills = createSkillState({ learned: ['ezcooking_1'] });
    startSkillStudy(skills, 'ezcooking_2', { level: 50, unlockedAchievements: ['able_chopper'] }, 0);
    const total = getSkillCatalog().ezcooking_2.pointCost;
    const u = createUnlearnState();
    const res = startUnlearning(u, skills, 'ezcooking_2', { upgrades: CARD }, (total / 10 / 4) * 1000);
    assert.equal(res.ok, true);
    assert.ok(Math.abs(res.seconds - Math.round(total / 10 / 4)) <= 1, `${res.seconds}`);
    tickUnlearning(u, skills, {}, 1e12);
    assert.equal(skills.queue.ezcooking_2, undefined);
  });

  it('drops the in-progress skill quest; cancel says so', () => {
    assert.equal(SKILL_QUEST_MAP.mining_3, 'mining_deplete_rocks_in_time_period');
    const skills = createSkillState({ learned: ['mining_1', 'mining_2', 'mining_3'] });
    const questState = { active: { mining_deplete_rocks_in_time_period: { progress: {} } } };
    const u = createUnlearnState();
    assert.equal(startUnlearning(u, skills, 'mining_3', { upgrades: CARD, questState }, 0).quest, 'mining_deplete_rocks_in_time_period');
    const done = tickUnlearning(u, skills, { questState }, 1e12);
    assert.equal(done.quest, 'mining_deplete_rocks_in_time_period');
    assert.equal(questState.active.mining_deplete_rocks_in_time_period, undefined);
    startUnlearning(u, skills, 'mining_2', { upgrades: CARD }, 0);
    assert.equal(cancelUnlearning(u).msg, 'You are no longer unlearning Mining II.');
    assert.equal(cancelUnlearning(u).msg, 'Not unlearning!');
    assert.equal(skills.learned.includes('mining_2'), true);
  });

  it('cards are live', () => {
    for (const id of ['unlearning_ability', 'unlearning_time_1', 'unlearning_time_2']) assert.equal(remakeStatus(id).status, 'live');
  });
});
