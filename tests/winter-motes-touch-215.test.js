/**
 * #215 / #216 (live, Winter Walk and Winter Haven): some winter motes, the walk's iMG quoins,
 * were only taken by jumping into them. game.js took a mote inside a 48 px circle 28 px over the
 * feet, the guess street quoins dropped after player report 32, so a mote hung 88 px up (every
 * other one) stayed out of reach while walking. Glitch took every quoin by the player's box
 * (59 x 112 over the feet, players/player.js 62-64) overlapping it (items/quoin.js
 * onPlayerCollision 156); the motes now use the same test as street quoins (js/quoins.js
 * quoinTouches) on the coin as drawn.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { quoinTouches } from '../public/js/quoins.js?v=7e0dec6d';

const root = join(import.meta.dirname, '..');
const game = readFileSync(join(root, 'public/game.js'), 'utf8');
const SCALE = 1.35;

describe('#215 winter motes are taken walking, as quoins', () => {
  const update = game.slice(game.indexOf('function updateWinterWalk('), game.indexOf('function updateWinterWalk(') + 2400);
  const spawn = game.slice(game.indexOf('function spawnWinterMotes('), game.indexOf('function spawnWinterPortal('));

  it('game.js uses the quoin touch on the drawn mote, not the old circle', () => {
    assert.match(update, /quoinTouches\(entry\.sprite, player\.x, player\.y, \{ scale: moteBody, quoinScale: entry\.sprite\.baseScale \}\)/);
    assert.doesNotMatch(update, /entry\.sprite\.y - \(player\.y - 28\)\) < 48/);
    // The heights and sizes this test walks under are the ones spawnWinterMotes hangs.
    assert.match(spawn, /sprite\.baseY = point\.y - 62 - \(index % 2\) \* 26;/);
    assert.match(spawn, /sprite\.baseScale = SCALE \* \(index === 2 && stage === 'surface' \? 1\.12 : 0\.94\);/);
    assert.match(game, /^const SCALE = 1\.35;$/m);
  });

  it('every mote, low or high, at any point of its bob, is taken walking under it', () => {
    const floor = -81;
    for (const index of [0, 1, 2, 3]) {
      const scale = SCALE * (index === 2 ? 1.12 : 0.94);
      const baseY = floor - 62 - (index % 2) * 26;
      for (const bob of [-8, 0, 8]) {
        const mote = { x: 400, y: baseY + bob };
        assert.equal(quoinTouches(mote, 400, floor, { quoinScale: scale }), true, `mote ${index} bob ${bob}`);
        assert.equal(quoinTouches(mote, 430, floor, { quoinScale: scale }), true, 'walking into it from the side');
        // The old circle missed the high ones.
        const old = Math.hypot(0, mote.y - (floor - 28)) < 48;
        if (index % 2 === 1) assert.equal(old, false);
      }
    }
  });

  it('a mote is not taken from a body length away', () => {
    const mote = { x: 400, y: -81 - 88 };
    assert.equal(quoinTouches(mote, 480, -81, { quoinScale: SCALE * 0.94 }), false);
  });
});
