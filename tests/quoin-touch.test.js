// Player report 32 (2026-11-01, Safari): a quoin level with the avatar's head was only taken by
// jumping into it. Player report 37 (2026-11-02): after that fix the avatar caught every quoin nearby
// and no jump cleared one (a 60 px box); the coin's own box keeps 32 fixed and lets a jump clear one.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { QUOIN_TOUCH, quoinTouches } from '../public/js/quoins.js?v=14dd1c93';
import { serverPath, skipWithoutServer } from '../tools/repos.mjs';
import { GRAVITY, JUMP_SPEED, WALK_MAX } from '../public/js/avatar-step.js?v=33ad1926';

const root = join(import.meta.dirname, '..');
const game = readFileSync(join(root, 'public/game.js'), 'utf8');
const gsjs = join(root, '../glitch-GameServerJS');

describe('32 and 37: a quoin is taken when the avatar\'s body touches the coin', () => {
  // game.js spawnWorldQuoin: natural quoins float 58, 92 or 126 px over the floor (centre).
  it('the standing and head-height rows touch a standing avatar; the row over the head takes a hop', () => {
    for (const lift of [58, 92]) assert.ok(quoinTouches({ x: 500, y: 800 - lift }, 500, 800), `${lift}`);
    assert.equal(quoinTouches({ x: 500, y: 800 - 126 }, 500, 800), false, '126 px up: just over the head');
    assert.ok(quoinTouches({ x: 500, y: 800 - 126 }, 500, 800 - 10), '126 px up: a small hop');
    assert.equal(quoinTouches({ x: 500, y: 800 - 145 }, 500, 800), false);
  });

  it('37: one beside the avatar is not caught (the coin, not a 60 px box)', () => {
    assert.ok(quoinTouches({ x: 540, y: 800 - 58 }, 500, 800), 'touching the body');
    assert.equal(quoinTouches({ x: 545, y: 800 - 58 }, 500, 800), false, '45 px across: beside it');
    assert.equal(quoinTouches({ x: 560, y: 800 - 58 }, 500, 800), false, 'too far across');
    // Under a quoin: the 60 px box reached 36 px below one; the coin reaches 14 px below (half its 28).
    assert.equal(quoinTouches({ x: 500, y: 800 - 200 }, 500, 800 - 200 + 140), false);
  });

  it('37: walking through a quoin at standing height takes it; a jump over it does not', () => {
    // js/avatar-step.js: gravity 0.42 and a -9.6 jump per frame, 4.4 px per frame at a run.
    const run = (q, lead) => {
      let x = q.x - 300;
      let y = 800;
      let vy = 0;
      let air = false;
      for (let f = 0; f < 400 && x < q.x + 200; f += 1) {
        if (lead != null && !air && x >= q.x - lead) { vy = JUMP_SPEED; air = true; }
        if (air) { vy += GRAVITY; y = Math.min(800, y + vy); if (y === 800) vy = 0; }
        x += WALK_MAX;
        if (quoinTouches(q, x, y)) return true;
      }
      return false;
    };
    for (const bob of [-8, 0, 8]) {
      const q = { x: 1000, y: 800 - 58 + bob };
      assert.ok(run(q, null), `walked through (bob ${bob})`);
      assert.equal(run(q, 100), false, `jumped over from 100 px before it (bob ${bob})`);
    }
    // A quoin at head height is taken walking under it.
    assert.ok(run({ x: 1000, y: 800 - 92 }, null));
  });

  it('the boxes are the source\'s', { skip: !existsSync(gsjs) && 'needs glitch-GameServerJS beside the repo' }, () => {
    const pl = readFileSync(join(gsjs, 'players/player.js'), 'utf8').split('\n');
    assert.match(pl[62], new RegExp(`this\\.h = ${QUOIN_TOUCH.playerH};`));
    assert.match(pl[63], new RegExp(`this\\.w = ${QUOIN_TOUCH.playerW};`));
    // quoin.js sets no hit box of its own: the coin as drawn is the quoin's side of the touch.
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
