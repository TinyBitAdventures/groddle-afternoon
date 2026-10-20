import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  loadContentCatalogsFromDir,
  resetContentCatalogs,
} from '../public/js/content-catalogs.js';
import {
  SKILL_POINTS_PER_SECOND,
  accelerateActiveStudy,
  createSkillState,
  formatStudyTime,
  getActiveStudy,
  getStudyStatus,
  grantSkill,
  normalizeSkillState,
  pauseSkillStudy,
  startSkillStudy,
  tickSkillStudy,
} from '../public/js/skills.js?v=study-1';

const root = join(import.meta.dirname, '..', 'public');

before(async () => {
  resetContentCatalogs();
  await loadContentCatalogsFromDir(join(root, 'assets/content'));
});

describe('official persistent skill study', () => {
  it('converts point_cost at the production rate and completes only when due', () => {
    const state = createSkillState();
    const started = startSkillStudy(state, 'animalkinship_1', { level: 99 }, 10_000);
    assert.equal(started.durationSeconds, 600 / SKILL_POINTS_PER_SECOND);
    assert.equal(tickSkillStudy(state, 69_999).completed.length, 0);
    assert.equal(tickSkillStudy(state, 70_000).completed[0].classTsid, 'animalkinship_1');
    assert.ok(state.learned.includes('animalkinship_1'));
  });

  it('pauses the active study when another begins and resumes exact progress', () => {
    const state = createSkillState();
    grantSkill(state, 'animalkinship_1', true);
    startSkillStudy(state, 'animalkinship_2', { level: 99 }, 1_000);
    const firstRemaining = getStudyStatus(state, 'animalkinship_2', 11_000).remainingSeconds;
    const switched = startSkillStudy(state, 'ezcooking_1', { level: 99 }, 11_000);
    assert.deepEqual(switched.pausedIds, ['animalkinship_2']);
    assert.equal(getStudyStatus(state, 'animalkinship_2', 11_000).isPaused, true);
    assert.equal(getStudyStatus(state, 'animalkinship_2', 11_000).remainingSeconds, firstRemaining);
    const resumed = startSkillStudy(state, 'animalkinship_2', { level: 99 }, 21_000);
    assert.equal(resumed.reason, 'resumed');
    assert.equal(getActiveStudy(state, 21_000).classTsid, 'animalkinship_2');
    assert.equal(getStudyStatus(state, 'ezcooking_1', 21_000).isPaused, true);
  });

  it('allows explicit pause, persists its work, and repairs duplicate active rows', () => {
    const state = createSkillState();
    startSkillStudy(state, 'soil_appreciation_1', { level: 99 }, 1_000);
    assert.equal(pauseSkillStudy(state, 'soil_appreciation_1', 6_000).ok, true);
    const saved = normalizeSkillState(state);
    assert.equal(saved.queue.soil_appreciation_1.isPaused, true);
    assert.equal(saved.queue.soil_appreciation_1.pointsRemaining, 550);
    const repaired = normalizeSkillState({
      queue: {
        botany_1: { totalPoints: 600, pointsRemaining: 600, endsAt: 61_000 },
        animalkinship_1: { totalPoints: 600, pointsRemaining: 600, endsAt: 61_000 },
      },
    });
    assert.equal(Object.values(repaired.queue).filter((row) => !row.isPaused).length, 1);
  });

  it('caps time-quoin acceleration at half of remaining study', () => {
    const state = createSkillState();
    startSkillStudy(state, 'animalkinship_1', { level: 99 }, 1_000);
    const result = accelerateActiveStudy(state, 999, 1_000);
    assert.equal(result.applied, 30);
    assert.equal(getStudyStatus(state, 'animalkinship_1', 1_000).remainingSeconds, 30);
    assert.equal(accelerateActiveStudy(state, 999, 1_000).reason, 'max_acceleration');
    assert.equal(accelerateActiveStudy(createSkillState(), 5, 1_000).reason, 'not_studying');
  });

  it('combines small acceleration bursts only up to the official maximum', () => {
    const state = createSkillState();
    startSkillStudy(state, 'animalkinship_1', { level: 99 }, 1_000);
    assert.equal(accelerateActiveStudy(state, 5, 1_000).applied, 5);
    assert.equal(accelerateActiveStudy(state, 99, 1_000).applied, 25);
    assert.equal(getStudyStatus(state, 'animalkinship_1', 1_000).remainingSeconds, 30);
    assert.equal(accelerateActiveStudy(state, 1, 1_000).reason, 'max_acceleration');
  });

  it('uses readable countdowns for seconds, minutes, and hours', () => {
    assert.equal(formatStudyTime(5), '0:05');
    assert.equal(formatStudyTime(65), '1:05');
    assert.equal(formatStudyTime(3661), '1h 01m');
  });
});

describe('skill study client wiring', () => {
  it('persists, ticks offline, accelerates from quoins, and offers deterministic QA', () => {
    const game = readFileSync(join(root, 'game.js'), 'utf8');
    const css = readFileSync(join(root, 'style.css'), 'utf8');
    assert.match(game, /tickSkillStudy\(skillState, Date\.now\(\)\).*offline/s);
    assert.match(game, /accelerateStudy: \(seconds\) => accelerateActiveStudy/);
    assert.match(game, /bootParams\.has\('skilldemo'\)/);
    assert.match(game, /Study · \$\{remaining\}/);
    assert.match(css, /skill-study-card\.studying/);
  });
});
