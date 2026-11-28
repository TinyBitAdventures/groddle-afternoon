/**
 * #542: back long after a project phase finished, its reward said "The fourth phase, Afterparty,
 * opens in -86 minutes." The minutes came from Math.round(readyAt - now) with no floor. A phase
 * already open is "ready now"; a wait rounds up, so it is never said to be open early.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { phaseOpensInMins } from '../public/js/features/street-jobs-feature.js?v=311dbb61';

const root = join(import.meta.dirname, '..');

describe('#542 phaseOpensInMins', () => {
  it('is 0 once the phase is open, however long ago', () => {
    const now = 10_000_000;
    assert.equal(phaseOpensInMins(now - 86 * 60_000, now), 0);
    assert.equal(phaseOpensInMins(now, now), 0);
    assert.equal(phaseOpensInMins(0, now), 0);
    assert.equal(phaseOpensInMins(undefined, now), 0);
  });
  it('rounds a wait up', () => {
    const now = 10_000_000;
    assert.equal(phaseOpensInMins(now + 20_000, now), 1);
    assert.equal(phaseOpensInMins(now + 12 * 60_000, now), 12);
    assert.equal(phaseOpensInMins(now + 12 * 60_000 + 1, now), 13);
  });
  it('both phase rewards (solo and online) use it, and no countdown there is left unfloored', () => {
    const src = readFileSync(join(root, 'public/js/features/street-jobs-feature.js'), 'utf8');
    assert.equal((src.match(/const mins = phaseOpensInMins\(out\.readyAt\);/g) || []).length, 2);
    assert.doesNotMatch(src, /Math\.round\(\(out\.readyAt - Date\.now\(\)\) \/ 60000\)/);
  });
});
