/**
 * Starter skill grants bring their prerequisite chain.
 * Run: node --test tests/skill-grants.test.js
 */
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { loadContentCatalogsFromDir } from '../public/js/content-catalogs.js?v=g403-1';
import { createSkillState, grantSkillWithPrereqs } from '../public/js/skills.js';

before(async () => {
  await loadContentCatalogsFromDir(new URL('../public/assets/content', import.meta.url).pathname);
});

describe('grantSkillWithPrereqs', () => {
  it('grants Alchemy II with Alchemy I, Smelting, Refining, Element Handling, and Mining first', () => {
    const state = createSkillState();
    const granted = grantSkillWithPrereqs(state, 'alchemy_2');
    for (const id of ['alchemy_1', 'smelting_1', 'refining_1', 'elementhandling_1', 'mining_1', 'alchemy_2']) {
      assert.ok(state.learned.includes(id), id);
    }
    assert.equal(granted.at(-1), 'alchemy_2');
    assert.ok(granted.indexOf('alchemy_1') < granted.indexOf('alchemy_2'));
  });

  it('is idempotent', () => {
    const state = createSkillState();
    grantSkillWithPrereqs(state, 'metalwork_1');
    const count = state.learned.length;
    assert.deepEqual(grantSkillWithPrereqs(state, 'metalwork_1'), []);
    assert.equal(state.learned.length, count);
  });
});
