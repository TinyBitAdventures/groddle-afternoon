import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { QUOIN_FRAME_BOB, advanceQuoinClock, quoinBobBetweenFrames } from '../public/js/quoin-motion.js?v=ea0bd408';

const root = join(import.meta.dirname, '..');

describe('world quoin motion', () => {
  it('carries the measured bob of the seven propeller quoins', () => {
    const frames = JSON.parse(readFileSync(join(root, 'tools/quoin-art/frames.json'), 'utf8'));
    for (const [id, t] of Object.entries(frames.types)) {
      if (!t.body?.dy) continue;
      assert.deepEqual([...QUOIN_FRAME_BOB[id]], t.body.dy, id);
    }
    assert.equal(QUOIN_FRAME_BOB.qurazy, undefined);
  });

  it('eases between frames and lands exactly on each frame', () => {
    // mystery climbs 1 px a frame from frame 0 to 11.
    assert.equal(quoinBobBetweenFrames('mystery', 3), 0);
    assert.equal(quoinBobBetweenFrames('mystery', 3.5), 0.5);
    assert.equal(quoinBobBetweenFrames('mystery', 23.5) + 0, 0); // frame 23 (0) to frame 0 (0)
    assert.equal(quoinBobBetweenFrames('qurazy', 4.5), 0);
  });

  it('advances the clock by animationSpeed and wraps at the frame count', () => {
    assert.equal(advanceQuoinClock(23.9, 0.28, 1, 24).toFixed(2), '0.18');
    assert.equal(advanceQuoinClock(2, 0.28, 2, 24).toFixed(2), '2.56');
  });

  it('game.js drives world quoins from their clock without pixel rounding', () => {
    const game = readFileSync(join(root, 'public/game.js'), 'utf8');
    assert.match(game, /q\.frameClock = advanceQuoinClock\(q\.frameClock, q\.animationSpeed, dt, q\.totalFrames\);/);
    assert.match(game, /q\.y = q\.baseY \+ Math\.sin\(q\.phase\) \* 8 \+ quoinBobBetweenFrames\(q\.typeId, q\.frameClock\) \* q\.scale\.y;/);
    assert.doesNotMatch(game, /Math\.round\(q\.baseY/);
  });
});
