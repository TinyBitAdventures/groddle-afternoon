import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ACTION_DURATION_MS,
  actionDurationFor,
  actionLabelFor,
  createTimedAction,
  advanceTimedAction,
  cancelTimedAction,
} from '../public/js/action-timing.js?v=2513e592';

const here = dirname(fileURLToPath(import.meta.url));

describe('world action timing', () => {
  it('keeps conversation/vendor verbs immediate and physical verbs committed', () => {
    assert.equal(actionDurationFor('npc_piggy', 'talk_to'), 0);
    assert.equal(actionDurationFor('street_spirit_groceries', 'browse'), 0);
    assert.equal(actionDurationFor('npc_piggy', 'pet'), ACTION_DURATION_MS.pet);
    assert.ok(actionDurationFor('rock_metal_1', 'mine') > actionDurationFor('apple', 'pickup'));
  });

  it('builds a player-facing action label', () => {
    assert.equal(actionLabelFor('pet', 'Piggy'), 'Petting Piggy…');
    assert.equal(actionLabelFor('water_all', 'Crop Garden'), 'Watering Crop Garden…');
  });

  it('advances deterministically, clamps at completion, and does not mutate input', () => {
    const start = createTimedAction({
      classId: 'npc_butterfly',
      verbId: 'milk',
      targetLabel: 'Butterfly',
      durationMs: 1000,
    });
    const halfway = advanceTimedAction(start, 500);
    assert.equal(start.elapsedMs, 0);
    assert.equal(halfway.elapsedMs, 500);
    assert.equal(halfway.progress, 0.5);
    assert.equal(halfway.status, 'running');
    const done = advanceTimedAction(halfway, 900);
    assert.equal(done.elapsedMs, 1000);
    assert.equal(done.progress, 1);
    assert.equal(done.status, 'complete');
  });

  it('cancels only a running action and preserves its progress', () => {
    const running = advanceTimedAction(
      createTimedAction({ verbId: 'harvest', targetLabel: 'Fruit Tree', durationMs: 1000 }),
      250
    );
    const cancelled = cancelTimedAction(running);
    assert.equal(cancelled.status, 'cancelled');
    assert.equal(cancelled.progress, 0.25);
    assert.equal(advanceTimedAction(cancelled, 900).progress, 0.25);
  });

  it('is wired into the world verb menu, ticker, input lock, and progress HUD', () => {
    const game = readFileSync(join(here, '../public/game.js'), 'utf8');
    const html = readFileSync(join(here, '../public/play/index.html'), 'utf8');
    const css = readFileSync(join(here, '../public/style.css'), 'utf8');
    assert.match(game, /beginVerbAction\(target, v\)/);
    assert.match(game, /updateCurrentAction\(\(1000 \/ 60\) \* dt\)/);
    assert.match(game, /menuTarget \|\| currentAction/);
    assert.match(game, /e\.key === 'e'/);
    assert.match(html, /id="action-progress"/);
    assert.match(html, /data-action-fill/);
    // The word progress bar replaced the cream panel (tests/word-progress.test.js).
    assert.match(css, /\.word-progress-fill/);
  });
});
