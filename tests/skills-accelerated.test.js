/**
 * G205: when accelerated learning is lost or kept, and the client's warning.
 * Sources: players/inc_skills.js skills_train 732-920 (pause 774-778, resume
 * 824-835), skills_unlearn 611-617, skills_start_acceleration 957-999,
 * skills_stop_acceleration 1003-1023, skills_reschedule_queue 1038-1067,
 * skills_get_queue 1345-1367, the 914 learning note; client
 * ImaginationSkillDetailsUI.as setLearnButton 222-232 and onLearnClick 300-320.
 */
import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  loadContentCatalogsFromDir,
  resetContentCatalogs,
} from '../public/js/content-catalogs.js';
import {
  accelerateActiveStudy,
  createSkillState,
  getActiveStudy,
  getStudyStatus,
  grantSkill,
  maxStudyAcceleration,
  normalizeSkillState,
  pauseSkillStudy,
  startSkillStudy,
  tickSkillStudy,
} from '../public/js/skills.js';
import { switchStudyNote } from '../public/js/skills-panel.js';
import { createUnlearnState, startUnlearning } from '../public/js/unlearning.js';

const root = join(import.meta.dirname, '..', 'public');
const CTX = { level: 99 };
const A = 'animalkinship_1'; // 600 points, 60 s
const B = 'ezcooking_1';

before(async () => {
  resetContentCatalogs();
  await loadContentCatalogsFromDir(join(root, 'assets/content'));
});

/** A studies from 1 s with a 20 s speed-up: ends at 41 s, accelerated to 21 s. */
function acceleratedA() {
  const state = createSkillState();
  startSkillStudy(state, A, CTX, 1_000);
  assert.equal(accelerateActiveStudy(state, 20, 1_000).applied, 20);
  assert.equal(state.queue[A].endsAt, 41_000);
  assert.equal(state.accelerationStopAt, 21_000);
  return state;
}

describe('G205 accelerated learning rules (inc_skills.js)', () => {
  it('a switch keeps the whole speed-up in the paused points and keeps the flag', () => {
    const state = acceleratedA();
    const switched = startSkillStudy(state, B, CTX, 5_000);
    assert.deepEqual(switched.pausedIds, [A]);
    assert.equal(switched.accelerated, false, 'a new start is never accelerated (832-835)');
    const paused = getStudyStatus(state, A, 5_000);
    assert.equal(paused.isPaused, true);
    assert.equal(paused.remainingSeconds, 36, 'end - now at the pause, speed-up included (778)');
    assert.equal(paused.isAccelerated, false);
    assert.equal(state.queue[A].pausedAccelerated, true, 'is_accelerated stays on the paused row');
    assert.equal(getStudyStatus(state, B, 5_000).isAccelerated, false);
  });

  it('resuming a flagged row marks it accelerated to its end, so no more speed-ups fit', () => {
    const state = acceleratedA();
    startSkillStudy(state, B, CTX, 5_000);
    const resumed = startSkillStudy(state, A, CTX, 30_000);
    assert.equal(resumed.reason, 'resumed');
    assert.equal(resumed.accelerated, true);
    const row = getActiveStudy(state, 30_000);
    assert.equal(row.endsAt, 66_000);
    assert.equal(row.acceleratedUntil, row.endsAt, 'acceleration_end = end (828)');
    assert.equal(row.isAccelerated, true);
    assert.equal(maxStudyAcceleration(state, 30_000), 0);
    assert.equal(accelerateActiveStudy(state, 15, 30_000).reason, 'max_acceleration');
    assert.equal(getStudyStatus(state, A, 65_000).isAccelerated, true);
  });

  it('the old stop timer still fires at the first acceleration end and clears the flag then', () => {
    const state = acceleratedA();
    startSkillStudy(state, B, CTX, 5_000);
    startSkillStudy(state, A, CTX, 10_000);
    assert.equal(getStudyStatus(state, A, 20_000).isAccelerated, true);
    assert.equal(maxStudyAcceleration(state, 20_000), 0);
    const after = getStudyStatus(state, A, 22_000);
    assert.equal(after.isAccelerated, false, 'skills_stop_acceleration at 21 s (1003-1023)');
    assert.equal(maxStudyAcceleration(state, 22_000), 12, 'half the 24 s left');
    assert.equal(after.remainingSeconds, 24, 'only the flag goes, never time');
    tickSkillStudy(state, 22_000);
    assert.equal(state.accelerationStopAt, 0, 'the timer is spent once it fires');
  });

  it('a stop timer that fired on another study is spent before the resume', () => {
    const state = acceleratedA();
    startSkillStudy(state, B, CTX, 5_000);
    startSkillStudy(state, A, CTX, 30_000);
    assert.equal(state.accelerationStopAt, 0);
    assert.equal(getStudyStatus(state, A, 60_000).isAccelerated, true);
  });

  it('a time quoin at the maximum re-arms the stop timer at the row end (quoin.js 202, 1052-1056)', () => {
    const state = acceleratedA();
    startSkillStudy(state, B, CTX, 5_000);
    startSkillStudy(state, A, CTX, 10_000);
    assert.equal(accelerateActiveStudy(state, 15, 15_000).reason, 'max_acceleration');
    assert.equal(state.accelerationStopAt, 46_000);
    assert.equal(getStudyStatus(state, A, 22_000).isAccelerated, true);
  });

  it('a study whose speed-up had already run out resumes unaccelerated', () => {
    const state = acceleratedA();
    assert.equal(pauseSkillStudy(state, A, 25_000).wasAccelerated, false);
    assert.equal(state.queue[A].pausedAccelerated, false);
    startSkillStudy(state, A, CTX, 26_000);
    assert.equal(getStudyStatus(state, A, 26_000).isAccelerated, false);
    assert.equal(maxStudyAcceleration(state, 26_000), 8);
  });

  it('an explicit pause and an unlearning pause keep the flag the same way', () => {
    const paused = acceleratedA();
    assert.equal(pauseSkillStudy(paused, A, 5_000).wasAccelerated, true);
    assert.equal(paused.queue[A].pausedAccelerated, true);

    const state = acceleratedA();
    grantSkill(state, 'ezcooking_1', true);
    const unlearn = startUnlearning(createUnlearnState(), state, 'ezcooking_1', { upgrades: ['unlearning_ability'] }, 5_000);
    assert.equal(unlearn.ok, true);
    assert.deepEqual(unlearn.paused, [A]);
    assert.equal(state.queue[A].pausedAccelerated, true);
  });

  it('finishing removes the row; the next study starts unaccelerated', () => {
    const state = acceleratedA();
    assert.equal(tickSkillStudy(state, 41_000).completed[0].classTsid, A);
    const next = startSkillStudy(state, B, CTX, 42_000);
    assert.equal(next.accelerated, false);
    assert.equal(getStudyStatus(state, B, 42_000).isAccelerated, false);
  });

  it('saves keep the paused flag and the pending stop timer', () => {
    const state = acceleratedA();
    startSkillStudy(state, B, CTX, 5_000);
    const copy = normalizeSkillState(JSON.parse(JSON.stringify(state)));
    assert.equal(copy.queue[A].pausedAccelerated, true);
    assert.equal(copy.queue[B].pausedAccelerated, false);
    assert.equal(copy.accelerationStopAt, 21_000);
    assert.equal(normalizeSkillState({}).accelerationStopAt, 0);
    startSkillStudy(copy, A, CTX, 30_000);
    assert.equal(getStudyStatus(copy, A, 30_000).isAccelerated, true);
  });
});

describe('G205 skill card warning and confirmation (ImaginationSkillDetailsUI.as)', () => {
  it('warns on a switch away from accelerated learning, with the source text', () => {
    const state = acceleratedA();
    const active = getActiveStudy(state, 5_000);
    const note = switchStudyNote({ classTsid: B, status: 'available' }, active);
    assert.equal(note.kind, 'accelerated');
    assert.deepEqual(note.lines, [
      "You're learning at an accelerated rate.",
      'Switching to start this skill will lose that speed!',
    ]);
  });

  it('says the progress will be paused when the study is not accelerated, and nothing otherwise', () => {
    const state = createSkillState();
    startSkillStudy(state, A, CTX, 1_000);
    const active = getActiveStudy(state, 2_000);
    const note = switchStudyNote({ classTsid: B, status: 'paused' }, active);
    assert.equal(note.kind, 'paused');
    assert.match(note.lines[0], /^Your progress on .+ will be paused$/);
    assert.equal(switchStudyNote({ classTsid: A, status: 'studying' }, active), null);
    assert.equal(switchStudyNote({ classTsid: B, status: 'locked' }, active), null);
    assert.equal(switchStudyNote({ classTsid: B, status: 'available' }, null), null);
  });

  it('game.js asks before an accelerated study is paused, with the source dialog text', () => {
    const game = readFileSync(join(root, 'game.js'), 'utf8');
    assert.match(game, /title: 'Stop your accelerated learning\?'/);
    assert.match(game, /Are you sure you want to pause learning \$\{activeName\}\? You will lose your accelerated learning speed if you do\./);
    assert.match(game, /'Yup, start learning!'/);
    assert.match(game, /cancelLabel: 'No, nevermind'/);
    assert.match(game, /confirmAcceleratedStudyPause\(classTsid, action, active\)/);
    const css = readFileSync(join(root, 'style.css'), 'utf8');
    assert.match(css, /\.skill-switch-note\.is-accelerated/);
  });

  it('the skill activity lines use the source wording, with no em-dashes', () => {
    const game = readFileSync(join(root, 'game.js'), 'utf8');
    const start = game.indexOf('function runSkillStudyAction(');
    const body = game.slice(start, game.indexOf('\n}\n', start));
    assert.match(body, /Skill learning will continue while you do other things\. It even goes on when you're not playing the game\./);
    assert.match(body, /You paused learning /);
    assert.doesNotMatch(body, /—/);
    const panel = readFileSync(join(root, 'js/skills-panel.js'), 'utf8');
    const strings = panel.split('\n').filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line));
    assert.equal(strings.filter((line) => line.includes('—')).length, 0);
  });
});
