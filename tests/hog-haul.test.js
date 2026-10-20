import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  HOG_HAUL_COUNTDOWN_MS,
  HOG_HAUL_GOAL,
  HOG_HAUL_WIN_REWARD,
  captureHogHaulPig,
  countdownCue,
  createHogHaulState,
  deliverHogHaulPig,
  hogHaulObjective,
  pickupHogHaulBait,
  tickHogHaul,
} from '../public/js/hog-haul.js';

describe('The Great Hog Haul race rules', () => {
  it('runs the original READY, 3, 2, 1, GO countdown', () => {
    const state = createHogHaulState({ now: 1_000 });
    assert.equal(countdownCue(state, 1_000), 'READY?');
    assert.equal(countdownCue(state, 2_000), '3');
    assert.equal(countdownCue(state, 3_000), '2');
    assert.equal(countdownCue(state, 4_000), '1');
    assert.equal(countdownCue(state, 5_000), 'GO!');
    const tick = tickHogHaul(state, 1_000 + HOG_HAUL_COUNTDOWN_MS);
    assert.equal(tick.events[0].type, 'started');
    assert.equal(state.status, 'running');
  });

  it('requires one bait per piggy and allows carrying only one piggy', () => {
    const state = createHogHaulState({ now: 1_000, countdownMs: 1 });
    tickHogHaul(state, state.startAt);
    assert.equal(captureHogHaulPig(state, 'pig-1').reason, 'needs_bait');
    assert.equal(pickupHogHaulBait(state, 'bait-1').ok, true);
    assert.equal(pickupHogHaulBait(state, 'bait-2').reason, 'hands_full');
    assert.equal(captureHogHaulPig(state, 'pig-1').ok, true);
    assert.equal(state.hasBait, false);
    assert.equal(state.carryingPig, true);
    assert.equal(captureHogHaulPig(state, 'pig-2').reason, 'already_carrying');
  });

  it('wins only after three complete bait, piggy, and pen runs', () => {
    const state = createHogHaulState({
      now: 1_000,
      countdownMs: 1,
      rivalTimesMs: [999_000, 1_000_000, 1_001_000],
    });
    tickHogHaul(state, state.startAt);
    for (let i = 1; i <= HOG_HAUL_GOAL; i += 1) {
      assert.equal(pickupHogHaulBait(state, `bait-${i}`).ok, true);
      assert.equal(captureHogHaulPig(state, `pig-${i}`).ok, true);
      const result = deliverHogHaulPig(state, 2_000 + i);
      assert.equal(result.ok, true);
      assert.equal(result.score, i);
      assert.equal(result.won, i === HOG_HAUL_GOAL);
    }
    assert.equal(state.status, 'won');
    assert.deepEqual(HOG_HAUL_WIN_REWARD, { currants: 100, xp: 50 });
  });

  it('applies deterministic rival pressure and ends when the rival reaches three', () => {
    const state = createHogHaulState({
      now: 1_000,
      countdownMs: 1,
      rivalLabel: 'Gomez Addams',
      rivalTimesMs: [5_000, 10_000, 15_000],
    });
    tickHogHaul(state, state.startAt);
    assert.equal(tickHogHaul(state, state.startAt + 10_000).events.length, 2);
    assert.equal(state.rivalScore, 2);
    const result = tickHogHaul(state, state.startAt + 15_000);
    assert.deepEqual(result.events.map((event) => event.type), ['rival_scored', 'lost']);
    assert.equal(state.status, 'lost');
    assert.equal(hogHaulObjective(state), 'Gomez Addams won the race.');
  });
});
