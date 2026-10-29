/**
 * At rest on a ladder the avatar holds still (Ruta Asuncion, 2026-10-28): the
 * client's CLIMB vs CLIMB_PAUSE (AvatarAnimationState.calcAnimationStateFromAPO),
 * the paused sheet stopping on its frame (AbstractAvatarView), and no bob.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { climbBobY, ladderAnimState, ladderSwap } from '../public/js/ladder-anim.js?v=g421-1';
import { animForState } from '../public/js/avatar-anims.js';

const root = join(import.meta.dirname, '..');

/**
 * A minimal AnimatedSprite and the game.js ladder loop: vy from the keys,
 * y += vy, the state from ladderAnimState, the swap/fresh-sheet rules of
 * applyGlitchState, the bob from climbBobY, and a 30 fps sheet at 60 fps.
 */
function ladder(keys, { sheets = true } = {}) {
  const climbFrames = Array.from({ length: 19 }, (_, i) => `climb${i}`);
  const sprite = { textures: ['stand0'], frame: 0, playing: false, loop: false, acc: 0 };
  const p = { y: 500, vy: 0, state: 'stand', phase: 0 };
  const rows = [];
  for (const key of keys) {
    p.vy = key === 'up' ? -4.4 : key === 'down' ? 4.4 : 0;
    const st = ladderAnimState(p.vy);
    if (st !== p.state) {
      const swap = sprite.textures === climbFrames ? ladderSwap(p.state, st) : null;
      if (swap) {
        // game.js applyGlitchState: the swap sets the sheet looping again.
        sprite.loop = true;
        sprite.playing = swap === 'play';
      } else {
        const { hold, loop } = animForState(st);
        sprite.textures = climbFrames;
        sprite.frame = 0;
        sprite.loop = loop;
        sprite.playing = !hold;
      }
      p.state = st;
    }
    if (sprite.playing) {
      sprite.acc += 0.5;
      if (sprite.acc >= 1) {
        sprite.acc -= 1;
        // PIXI.AnimatedSprite: a sheet that does not loop stops on its last frame.
        if (sprite.frame + 1 >= sprite.textures.length && !sprite.loop) sprite.playing = false;
        else sprite.frame = (sprite.frame + 1) % sprite.textures.length;
      }
    }
    p.y += p.vy;
    if (p.vy !== 0) p.phase += 0.35;
    const bob = climbBobY({ sheets, vy: p.vy, phase: p.phase });
    rows.push({ key, state: st, y: p.y, drawnY: p.y + bob, frame: sprite.frame, playing: sprite.playing });
  }
  return rows;
}

const seq = (...parts) => parts.flatMap(([k, n]) => Array(n).fill(k));

describe('ladder: climbing vs paused (js/ladder-anim.js)', () => {
  it('climb while moving, climbPause at rest', () => {
    assert.equal(ladderAnimState(-4.4), 'climb');
    assert.equal(ladderAnimState(4.4), 'climb');
    assert.equal(ladderAnimState(0), 'climbPause');
    assert.equal(ladderAnimState(undefined), 'climbPause');
    assert.equal(ladderAnimState(NaN), 'climbPause');
  });

  it('climb <-> climbPause keeps the sheet: stop on the frame, run on from it', () => {
    assert.equal(ladderSwap('climb', 'climbPause'), 'stop');
    assert.equal(ladderSwap('climbPause', 'climb'), 'play');
    assert.equal(ladderSwap('stand', 'climbPause'), null);
    assert.equal(ladderSwap('climb', 'climb'), null);
    assert.equal(ladderSwap('climb', 'walk2x'), null);
  });

  it('holding up, letting go, holding down, letting go: at rest no drift, no bob, the frame held', () => {
    // Getting on at rest first (a paused sheet that does not loop), then a long climb.
    const rows = ladder(seq(['none', 5], ['up', 80], ['none', 90], ['down', 25], ['none', 90]));
    const runs = [[5, 85], [85, 175], [175, 200], [200, 290]];
    for (const [a, b] of [runs[1], runs[3]]) {
      const rest = rows.slice(a, b);
      assert.ok(rest.every((r) => r.state === 'climbPause' && !r.playing));
      assert.equal(new Set(rest.map((r) => r.drawnY)).size, 1, 'drawn y holds');
      assert.equal(new Set(rest.map((r) => r.frame)).size, 1, 'frame holds');
      assert.equal(rest[0].frame, rows[a - 1].frame, 'stops on the frame that was showing');
    }
    for (const [a, b] of [runs[0], runs[2]]) {
      const moving = rows.slice(a, b);
      assert.ok(moving.every((r) => r.state === 'climb'));
      assert.ok(new Set(moving.map((r) => r.frame)).size >= 12, 'the cycle runs');
      assert.ok(moving.slice(2).every((r) => r.playing), 'and keeps running');
    }
    // Climbing again runs on from the held frame, not frame 0.
    assert.equal(rows[176].frame, (rows[174].frame + 1) % 19);
  });

  it('getting on a ladder without moving shows a held climb frame', () => {
    const rows = ladder(seq(['none', 30]));
    assert.ok(rows.every((r) => r.state === 'climbPause' && r.frame === 0 && !r.playing));
    assert.deepEqual(animForState('climbPause'), { anim: 'climb', loop: false, hold: true });
  });

  it('no bob with the Glitch sheets; a sheetless avatar bobs only while it climbs', () => {
    assert.equal(climbBobY({ sheets: true, vy: -4.4, phase: 1 }), 0);
    assert.equal(climbBobY({ sheets: false, vy: 0, phase: 1 }), 0);
    assert.ok(Math.abs(climbBobY({ sheets: false, vy: -4.4, phase: 1 })) > 1);
  });

  it('game.js reports climbPause, keeps the frame on the swap and drops the bob', () => {
    const game = readFileSync(join(root, 'public/game.js'), 'utf8');
    assert.match(game, /import \{ climbBobY, ladderAnimState, ladderSwap \} from '\.\/js\/ladder-anim\.js\?v=g421-1';/);
    assert.match(game, /if \(requested === 'climb'\) \{\s*idleClock\.reset\(\);[^}]*return ladderAnimState\(player\.vy\);/);
    assert.match(game, /ladderSwap\(player\.glitchState, st\)[\s\S]{0,300}player\.loop = true;/);
    assert.match(game, /if \(player\.textures\.length < 2 \|\| hold\) player\.gotoAndStop\(0\);/);
    assert.match(game, /player\.pivot\.y = climbBobY\(\{ sheets: Boolean\(player\.anims\), vy: player\.vy, phase: player\.walkPhase \}\);/);
    assert.doesNotMatch(game, /\/\/ Climb bob\n/);
  });
});
