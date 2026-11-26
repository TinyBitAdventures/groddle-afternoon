/**
 * Lane clouds (Austin 2026-11-15): a reload in the Cloud Level sent a player who had pulled the
 * chain and walked down three clouds back above the ceiling, at the chain. Now the save keeps the
 * furthest cloud stood on (newxp.cloud) and a reload lands there (cloudsResume).
 * Run: node --test tests/newxp-clouds-resume.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cloudUnder, cloudsLayout, cloudsResume, normalizeNewxpSave, startNewxp } from '../public/js/newxp.js?v=43f8df2c';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const feature = readFileSync(join(root, 'public/js/features/newxp-feature.js'), 'utf8');
const L = cloudsLayout();

describe('a reload in the Cloud Level', () => {
  it('before the chain is pulled it starts at the chain, as before', () => {
    assert.equal(cloudsResume({ stage: 'clouds', step: 'chain', cloud: 0 }, L), null);
    assert.equal(cloudsResume({ stage: 'clouds', step: '', cloud: 2 }, L), null);
    assert.equal(cloudsResume({ stage: 'training1', step: 'walk', cloud: 4 }, L), null);
  });

  it('after the pull it lands on the furthest cloud reached, standing on it, past where its words start', () => {
    const first = cloudsResume({ stage: 'clouds', step: 'move', cloud: 0 }, L);
    assert.deepEqual(first, { cloud: 0, x: L.spawn.x, y: L.terraces[0].y, step: 'move' });
    for (let i = 1; i < L.terraces.length; i++) {
      const t = L.terraces[i];
      const at = cloudsResume({ stage: 'clouds', step: 'walk', cloud: i }, L);
      assert.equal(at.cloud, i);
      assert.equal(at.y, t.y);
      assert.ok(at.x > t.x1 && at.x < t.x2 - 100, `cloud ${i}: on it, short of its edge`);
      assert.ok(at.x >= t.box, `cloud ${i}: its phrase shows`);
      assert.ok(at.x > L.terraces[i - 1].x2 + 9, `cloud ${i}: not under the cloud above`);
    }
  });

  it('the save keeps the cloud through a reload, drops nonsense and clears on a restart', () => {
    assert.equal(normalizeNewxpSave(JSON.parse(JSON.stringify({ cloud: 3 }))).cloud, 3);
    assert.equal(normalizeNewxpSave({ cloud: 9 }).cloud, 0);
    assert.equal(normalizeNewxpSave({ cloud: '2' }).cloud, 0);
    assert.equal(startNewxp({ cloud: 3, step: 'walk' }, 'clouds', 1).cloud, 0);
  });

  it('cloudUnder names the cloud the feet stand on', () => {
    assert.equal(cloudUnder(L.terraces, { onGround: true, x: 300, y: L.terraces[0].y }), 0);
    assert.equal(cloudUnder(L.terraces, { onGround: true, x: 2800, y: L.terraces[2].y + 3 }), 2);
    assert.equal(cloudUnder(L.terraces, { onGround: false, x: 2800, y: L.terraces[2].y }), -1);
    assert.equal(cloudUnder(L.terraces, { onGround: true, x: 300, y: 200 }), -1, 'the perch');
  });

  it('the feature saves the furthest cloud and resumes there on a reload', () => {
    assert.match(feature, /const under = cloudUnder\(run\.data\.terraces, p\);\s+if \(under > save\.cloud\) \{\s+save\.cloud = under;\s+engine\.save\(\);/);
    assert.match(feature, /cloudsResumeAt = cloudsResume\(save\);/);
    assert.match(feature, /if \(back\) return resumeClouds\(t, L, back\);/);
  });
});
