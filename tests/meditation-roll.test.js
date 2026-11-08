/**
 * Ticket 72 (Friendly, 2026-11-04): meditation always gave +21 mood and +21 energy and a
 * focus always 23. engine.param('meditateroll') is null for players, Number(null) is 0,
 * and the session length rolled its minimum every time. Glitch rolls it at random
 * (players/inc_skill_packages.js 188-194).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { meditationRng } from '../public/js/features/meditation-feature.js?v=46025cfa';

describe('the meditation roll (ticket 72)', () => {
  it('is random when the QA parameter is absent or empty', () => {
    for (const raw of [null, undefined, '', '  ']) assert.equal(meditationRng(raw), Math.random);
  });
  it('is a fixed roll only for a QA value in [0, 1)', () => {
    assert.equal(meditationRng('0.5')(), 0.5);
    assert.equal(meditationRng('0')(), 0);
    for (const raw of ['1', '-0.1', 'abc']) assert.equal(meditationRng(raw), Math.random);
  });
});
