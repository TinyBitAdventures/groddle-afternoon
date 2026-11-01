// Player report 32 (2026-11-01, Safari): a quoin level with the avatar's head was only taken by
// jumping into it.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { QUOIN_TOUCH, quoinTouches } from '../public/js/quoins.js?v=e75558c6';
import { serverPath, skipWithoutServer } from '../tools/repos.mjs';

const root = join(import.meta.dirname, '..');
const game = readFileSync(join(root, 'public/game.js'), 'utf8');
const gsjs = join(root, '../glitch-GameServerJS');

describe('32: a quoin at head height is taken walking', () => {
  // game.js spawnWorldQuoin: natural quoins float 58, 92 or 126 px over the floor (centre).
  it('all three heights touch a standing avatar; one well over the head does not', () => {
    for (const lift of [58, 92, 126]) assert.ok(quoinTouches({ x: 500, y: 800 - lift }, 500, 800), `${lift}`);
    assert.equal(quoinTouches({ x: 500, y: 800 - 145 }, 500, 800), false);
    assert.equal(quoinTouches({ x: 560, y: 800 - 58 }, 500, 800), false, 'too far across');
    assert.ok(quoinTouches({ x: 545, y: 800 - 58 }, 500, 800));
  });

  it('the boxes are the source\'s', { skip: !existsSync(gsjs) && 'needs glitch-GameServerJS beside the repo' }, () => {
    const pl = readFileSync(join(gsjs, 'players/player.js'), 'utf8').split('\n');
    assert.match(pl[62], new RegExp(`this\\.h = ${QUOIN_TOUCH.playerH};`));
    assert.match(pl[63], new RegExp(`this\\.w = ${QUOIN_TOUCH.playerW};`));
    assert.doesNotMatch(readFileSync(join(gsjs, 'items/quoin.js'), 'utf8'), /apiSetHitBox/);
  });

  it('the realtime server takes every quoin the game now touches', { skip: skipWithoutServer }, () => {
    const go = readFileSync(serverPath('quoins.go'), 'utf8');
    const num = (k) => Number(new RegExp(`${k}\\s*=\\s*([\\d.]+)`).exec(go)[1]);
    const radius = num('quoinTouch') + num('quoinTouchSlack');
    const lift = num('quoinFeetLift');
    let worst = 0;
    for (let dx = -60; dx <= 60; dx += 1) {
      for (let dy = -200; dy <= 100; dy += 1) {
        if (quoinTouches({ x: 500 + dx, y: 800 + dy }, 500, 800)) worst = Math.max(worst, Math.hypot(dx, dy + lift));
      }
    }
    assert.ok(worst > 0 && worst <= radius, `worst ${worst} vs ${radius}`);
  });

  it('game.js collects by the box', () => {
    assert.match(game, /if \(quoinTouches\(q, player\.x, player\.y, \{ scale: bodyScale, quoinScale: q\.scale\?\.y \|\| 1 \}\)\) \{/);
    assert.doesNotMatch(game, /Math\.hypot\(q\.x - player\.x, q\.y - \(player\.y - 28\)\)/);
  });
});
