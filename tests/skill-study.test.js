import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  loadContentCatalogsFromDir,
  resetContentCatalogs,
} from '../public/js/content-catalogs.js?v=g403-1';
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
  rescaleStudiesForLearningModifier,
  startSkillStudy,
  tickSkillStudy,
} from '../public/js/skills.js?v=study-6';
import { brainCapacityRescale } from '../public/js/imagination-effects.js?v=g403-1';

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

describe('brain capacity rescales studies (skills_increase_brain_capacity)', () => {
  it('uses new / old learning-time modifier for the same known + queued count', () => {
    // 25 known + 1 queued over capacity 20 -> 1.05^6; capacity 25 -> 1.05^1.
    assert.ok(Math.abs(brainCapacityRescale(26, 20, 25) - 1.05 ** -5) < 1e-12);
    assert.equal(brainCapacityRescale(12, 20, 25), 1);
    assert.equal(brainCapacityRescale(26, 26, 30), 1);
  });

  it('moves the active end earlier by round((end - start) * (1 - percent)) seconds', () => {
    const state = createSkillState();
    const t0 = 1_000_000;
    startSkillStudy(state, 'animalkinship_1', { level: 99, timeFactor: 2 }, t0);
    const row = state.queue.animalkinship_1;
    assert.equal(row.resumedAt, t0);
    assert.equal(row.endsAt, t0 + 120_000); // 600 points / 10 * 2
    const percent = 0.8;
    const now = t0 + 30_000;
    const result = rescaleStudiesForLearningModifier(state, percent, now);
    assert.equal(result.ok, true);
    // Source scales the whole span since the queue start, not just what remains.
    assert.equal(result.rescaled[0].timeChange, Math.round(120 * (1 - percent)));
    assert.equal(row.endsAt, t0 + 120_000 - 24_000);
    assert.ok(Math.abs(row.timeFactor - 1.6) < 1e-12);
    assert.equal(getStudyStatus(state, 'animalkinship_1', now).remainingSeconds, 66);
    // A later pause converts what is left at the new factor (skills_seconds_to_points).
    const paused = pauseSkillStudy(state, 'animalkinship_1', now);
    assert.equal(paused.ok, true);
    assert.equal(row.pointsRemaining, Math.ceil((66 * SKILL_POINTS_PER_SECOND) / 1.6));
  });

  it('never ends sooner than one second from now and leaves unchanged modifiers alone', () => {
    const state = createSkillState();
    startSkillStudy(state, 'animalkinship_1', { level: 99, timeFactor: 1 }, 0);
    rescaleStudiesForLearningModifier(state, 0.1, 59_000);
    assert.equal(state.queue.animalkinship_1.endsAt, 60_000);
    assert.equal(rescaleStudiesForLearningModifier(state, 1, 59_500).reason, 'unchanged');
  });

  it('keeps paused points, gives them the new factor, and resume recomputes from points', () => {
    const state = createSkillState();
    startSkillStudy(state, 'animalkinship_1', { level: 99, timeFactor: 2 }, 0);
    startSkillStudy(state, 'ezcooking_1', { level: 99, timeFactor: 2 }, 30_000);
    const paused = state.queue.animalkinship_1;
    assert.equal(paused.isPaused, true);
    const points = paused.pointsRemaining;
    const resumedBefore = state.queue.ezcooking_1.resumedAt;
    rescaleStudiesForLearningModifier(state, 0.5, 40_000);
    assert.equal(paused.pointsRemaining, points);
    assert.equal(paused.endsAt, 0);
    assert.equal(paused.timeFactor, 1);
    assert.equal(getStudyStatus(state, 'animalkinship_1', 40_000).remainingSeconds, Math.ceil(points / SKILL_POINTS_PER_SECOND));
    assert.equal(state.queue.ezcooking_1.resumedAt, resumedBefore);
    // Resuming recomputes the duration from points with the factor of the day.
    const resumed = startSkillStudy(state, 'animalkinship_1', { level: 99, timeFactor: 1 }, 50_000);
    assert.equal(resumed.durationSeconds, Math.round(points / SKILL_POINTS_PER_SECOND));
  });

  it('saves keep the queue start; older saves derive it from points and factor', () => {
    const state = createSkillState();
    startSkillStudy(state, 'animalkinship_1', { level: 99, timeFactor: 1.5 }, 5_000);
    const copy = normalizeSkillState(JSON.parse(JSON.stringify(state)));
    assert.equal(copy.queue.animalkinship_1.resumedAt, 5_000);
    const legacy = JSON.parse(JSON.stringify(state));
    delete legacy.queue.animalkinship_1.resumedAt;
    assert.equal(normalizeSkillState(legacy).queue.animalkinship_1.resumedAt, 5_000);
  });
});

describe('the imagination shop rescales on a Brain Capacity purchase', () => {
  it('captures capacity before the purchase and rescales the live queue after it', () => {
    const feature = readFileSync(join(root, 'js/features/imagination-feature.js'), 'utf8');
    assert.match(feature, /const capacityBefore = state\.brainCapacity;\s*const result = purchaseCard\(/);
    assert.match(feature, /if \(result\.effect\?\.brainCapacity\) rescaleStudyForBrainCapacity\(engine, capacityBefore\);/);
    assert.match(feature, /brainCapacityRescale\(count, capacityBefore, state\.brainCapacity\)/);
    assert.match(feature, /rescaleStudiesForLearningModifier\(\{ queue \}, percent, Date\.now\(\)\)/);
  });
});
