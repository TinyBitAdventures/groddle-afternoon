/**
 * Live report 213 (2026-11-12, Dr Flavius, The Cell): "After digging the hole and agreeing to jump
 * in, I went in, disappeared and seem to have got stuck somewhere in the background. My dot appears
 * on the mini map, I just seem to be invisible and can not get out." The report put him at x 1376,
 * past the cell's bars (BARS_X 1290), under the Social panel.
 *
 * 1. The bars are a wall: the room hands the engine a barrier just inside them, floor to roof.
 * 2. The crawl always ends by leaving: a throw after the fade (the turn-in, the conversation) no
 *    longer leaves the avatar faded out in the cell with the room still running.
 * 3. The cause (reproduced in the browser with &stuckpromptms=1500): part 3's turn-in waits for its
 *    award screen, and the screen queue held every screen while any [role="dialog"] showed in the
 *    game, the prompt stack's non-modal "Are you stuck?" included (the report's picture has it up),
 *    so the crawl waited for good with the avatar faded out. The client's queue
 *    (TSFrontController.as tryShowScreenViewFromQ 3370-3396) never waited on PromptView prompts.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import * as kit from '../public/js/quest-rooms/kit.js?v=6186788f';
import { BARS_X, BARS_WALL, FLOOR, PART_3, PATCH_X, SPAWN, W, cellBarriers, room } from '../public/js/quest-rooms/penalty.js?v=57be1a0a';

describe('1. the bars stop you', () => {
  it('a wall just inside the bars, floor to roof, that the engine reads (pc_perm -1)', () => {
    const [wall] = cellBarriers();
    assert.deepEqual(wall, { ...BARS_WALL });
    assert.ok(wall.x < BARS_X && wall.x > PATCH_X && wall.x > SPAWN.x, `${wall.x}`);
    assert.equal(wall.y + wall.h, FLOOR);
    assert.ok(wall.h >= 400);
    assert.equal(wall.pc_perm, -1);
    assert.ok(wall.x < 1376 && wall.x < W);
  });
});

/** A room context with the crawl's calls, its turn-in made to throw or not. */
function fakeCtx({ turnInThrows = false, converseThrows = false } = {}) {
  const player = { x: SPAWN.x, y: FLOOR, alpha: 1 };
  const calls = [];
  let part3 = true;
  const ctx = {
    kit,
    data: { vendor: null, plot: { stage: 'dug' }, patchTarget: {}, vendorTarget: {} },
    player,
    engine: { acting: () => false, questState: { completed: ['smuggle_the_smuggler_part2'] } },
    wait: () => Promise.resolve(),
    place: (x, y) => { player.x = x; player.y = y; },
    quest: (id) => ({
      active: () => (id === PART_3 ? part3 : false),
      turnIn: async () => {
        if (turnInThrows) throw new TypeError("Cannot read properties of null (reading 'x')");
        part3 = false;
        calls.push('turnIn');
        return true;
      },
      fail: () => calls.push(`fail:${id}`),
    }),
    solve: () => calls.push('solve'),
    converse: async () => {
      if (converseThrows) throw new Error('dialog gone');
      calls.push('converse');
    },
    fx: () => false,
    leave: (opts) => {
      calls.push('leave');
      room.onLeave(ctx, calls.includes('solve') ? 'complete' : 'left');
      return Promise.resolve(opts);
    },
  };
  return { ctx, calls, player };
}

const crawl = async (ctx) => {
  room.runVerb(ctx, ctx.data.patchTarget, 'crawl');
  for (let i = 0; i < 50; i += 1) await Promise.resolve();
  await new Promise((r) => setTimeout(r, 0));
};

describe('2. the crawl always ends by leaving', () => {
  it('the ordinary crawl: turn in, solve, the Magic Rock\'s line, leave, avatar shown again', async () => {
    const { ctx, calls, player } = fakeCtx();
    await crawl(ctx);
    assert.deepEqual(calls, ['turnIn', 'solve', 'converse', 'leave']);
    assert.equal(player.alpha, 1);
    assert.equal(ctx.data.sinking, false);
  });

  it('a throw in the turn-in still leaves (part 3 failed for a retry), avatar shown', async () => {
    const warn = console.warn;
    console.warn = () => {};
    try {
      const { ctx, calls, player } = fakeCtx({ turnInThrows: true });
      player.alpha = 0;
      await crawl(ctx);
      assert.ok(calls.includes('leave'), calls.join(','));
      assert.equal(calls.includes('solve'), false);
      assert.equal(player.alpha, 1);
    } finally {
      console.warn = warn;
    }
  });

  it('a throw after the turn-in solves the room and leaves', async () => {
    const warn = console.warn;
    console.warn = () => {};
    try {
      const { ctx, calls, player } = fakeCtx({ converseThrows: true });
      await crawl(ctx);
      assert.deepEqual(calls.slice(0, 2), ['turnIn', 'solve']);
      assert.ok(calls.includes('leave'));
      assert.equal(player.alpha, 1);
    } finally {
      console.warn = warn;
    }
  });
});

describe('3. a prompt on the stack does not hold the award screens', () => {
  const root = join(import.meta.dirname, '..');
  const game = readFileSync(join(root, 'public/game.js'), 'utf8');
  const stack = readFileSync(join(root, 'public/js/prompt-stack.js'), 'utf8');
  const body = game.slice(game.indexOf('function conversationCardOpen()'), game.indexOf('function sceneTransitionBusy()'));
  it('the stack\'s prompts are role="dialog", not modal, class game-prompt', () => {
    assert.match(stack, /box\.className = 'game-prompt is-entering';/);
    assert.match(stack, /box\.setAttribute\('role', 'dialog'\);\s+box\.setAttribute\('aria-modal', 'false'\);/);
  });
  it('conversationCardOpen passes over them', () => {
    assert.ok(body.length > 100);
    assert.match(body, /if \(d\.classList\.contains\('game-prompt'\)\) continue;/);
  });
});
