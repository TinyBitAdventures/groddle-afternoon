import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createAnimalState } from '../public/js/animals.js?v=060b5c65';
import { getVerbsFor } from '../public/content.js?v=ef15f7ce';

// #375: butterfly verbs list Massage before Milk, so quick clicks go in doing order
// (piggies already list pet before nibble). Glitch had milk 59 / massage 60 (npc_butterfly.js 703, 761).
describe('#375 butterfly verb order', () => {
  it('lists massage before milk', () => {
    const target = { classId: 'npc_butterfly', state: createAnimalState('npc_butterfly') };
    const pc = { energy: 80, mood: 70, imagination: 0, xp: 0 };
    const ids = getVerbsFor(target, { pc, inv: {} }).map((verb) => verb.id);
    assert.ok(ids.includes('massage') && ids.includes('milk'), ids.join(','));
    assert.ok(ids.indexOf('massage') < ids.indexOf('milk'), ids.join(','));
  });
});
