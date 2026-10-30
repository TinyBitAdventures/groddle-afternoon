import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createPromptSettler, promptId } from '../public/js/prompt-settle.js?v=509ba9cc';

const climb = { key: '↑', label: 'climb' };
const climbing = { key: '↑↓', label: 'climb · Space jump' };

describe('prompt settle', () => {
  it('keeps the shown hint through a brief flip', () => {
    const settle = createPromptSettler(180);
    assert.equal(settle(climbing, promptId(climb), 0), false);
    assert.equal(settle(climb, promptId(climb), 60), true, 'back to the shown hint');
    assert.equal(settle(climbing, promptId(climb), 120), false);
    assert.equal(settle(climbing, promptId(climb), 250), false, 'only 130 ms steady');
    assert.equal(settle(climbing, promptId(climb), 300), true);
  });

  it('delays hiding as well as showing', () => {
    const settle = createPromptSettler(180);
    assert.equal(settle(null, promptId(climb), 0), false);
    assert.equal(settle(null, promptId(climb), 200), true);
    assert.equal(settle(climb, '', 210), false);
    assert.equal(settle(climb, '', 400), true);
  });
});
