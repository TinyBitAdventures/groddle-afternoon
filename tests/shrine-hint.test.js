import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { passShrine, shrineHintFeature, shrineHintText, SHRINES_TO_PASS } from '../public/js/features/shrine-hint-feature.js';

const quests = () => ({ active: {}, completed: [] });

describe('shrine hint (npc_shrine_base onPlayerCollision)', () => {
  it('speaks once, on the third different shrine, before the devotion quest', () => {
    const hint = { passed: {}, announced: false };
    assert.equal(SHRINES_TO_PASS, 3);
    assert.equal(passShrine(hint, 'a:mab', 'Mab', quests()), null);
    assert.equal(passShrine(hint, 'a:mab', 'Mab', quests()), null);
    assert.equal(passShrine(hint, 'b:alph', 'Alph', quests()), null);
    assert.equal(passShrine(hint, 'c:lem', 'Lem', quests()), 'Lo, a shrine to Lem//Try donating something.');
    assert.equal(hint.announced, true);
    assert.equal(passShrine(hint, 'd:zille', 'Zille', quests()), null);
  });

  it('stays quiet once donate_to_all_shrines has been offered', () => {
    const hint = { passed: { 'a:mab': 1, 'b:alph': 1 }, announced: false };
    const offered = { active: {}, completed: ['donate_to_all_shrines'] };
    assert.equal(passShrine(hint, 'c:lem', 'Lem', offered), null);
  });

  it('uses the source text and saves what it has seen', () => {
    assert.equal(shrineHintText('Mab'), 'Lo, a shrine to Mab//Try donating something.');
    shrineHintFeature._reset();
    shrineHintFeature.restore({ passed: { 'x:mab': 2 }, announced: true });
    assert.deepEqual(shrineHintFeature.save(), { version: 1, passed: { 'x:mab': 2 }, announced: true });
    shrineHintFeature._reset();
  });

  it('is registered with the feature host', () => {
    const src = readFileSync(join(import.meta.dirname, '..', 'public', 'js', 'features', 'index.js'), 'utf8');
    assert.match(src, /shrineHintFeature/);
  });
});
