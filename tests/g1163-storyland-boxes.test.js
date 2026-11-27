/**
 * G1163 (#623): the Greedy Street Spirit's EXIT did nothing. Storyland's street (GNVD57N9ERF3TNH)
 * has two walk-in boxes, instance_exit and greedy_street_spirit_check, and nothing read them:
 * Storyland takes the street over (js/location-events.js OWNED_STREETS) and
 * setupGreedyStreetInstance added only the act buttons. Glitch: the check box warned once and moved
 * you back 100 px with an act unread, and said the Piggy line once all were read
 * (quests/greedy_street_spirit.js 107-131); the exit box sent you back where you came from
 * (locations/location.js 1488-1493), failing a run left unread (onExitLocation 145-163).
 *
 * Run: node --test tests/g1163-storyland-boxes.test.js
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  GREEDY_ACTS,
  GREEDY_BACK_TO_PIGGY_LINE,
  GREEDY_CHECK_BOX_ID,
  GREEDY_CHECK_PUSH_BACK,
  GREEDY_EXIT_BOX_ID,
  GREEDY_MISSED_STORY_LINE,
  GREEDY_STREET_GEOMETRY_TSID,
  createGreedyStreetSpiritState,
  greedyBoxHit,
  greedyBoxesEntered,
  greedyStreetBoxEnter,
  greedyStreetBoxes,
  pressGreedyAct,
} from '../public/js/greedy-street-spirit.js?v=b0ce2437';

const ROOT = join(import.meta.dirname, '..');
const street = JSON.parse(readFileSync(join(ROOT, 'public/assets/streets', `${GREEDY_STREET_GEOMETRY_TSID}.json`), 'utf8'));
const game = readFileSync(join(ROOT, 'public/game.js'), 'utf8');
const glitchQuest = (() => {
  try {
    return readFileSync(join(ROOT, '..', 'glitch-GameServerJS/quests/greedy_street_spirit.js'), 'utf8');
  } catch {
    return '';
  }
})();

/** Storyland's floor in screen px (the street's one floor run, y -47, less the top bound). */
const FLOOR_Y = -47 - street.bounds.t;
const readAll = (state) => {
  GREEDY_ACTS.forEach((act, i) => {
    for (let n = 0; n < act.lines.length; n += 1) pressGreedyAct(state, i, state.startedAt + 1000);
  });
  return state;
};

describe('G1163 Storyland reads its two walk-in boxes', () => {
  const boxes = greedyStreetBoxes(street);
  const check = boxes.find((b) => b.id === GREEDY_CHECK_BOX_ID);
  const exit = boxes.find((b) => b.id === GREEDY_EXIT_BOX_ID);

  it('both boxes come from the street JSON, the check box before the exit', () => {
    assert.ok(check && exit, 'both boxes found');
    assert.equal(check.x, 5703);
    assert.equal(exit.x, 5856);
    assert.ok(check.x + check.w / 2 < exit.x - exit.w / 2, 'you meet the check box first walking right');
  });

  it('a player walking on the floor hits both (the exit box sits 36 px over the floor: the body counts, not the feet)', () => {
    assert.equal(FLOOR_Y, 553);
    assert.ok(greedyBoxHit(check, check.x, FLOOR_Y));
    assert.ok(greedyBoxHit(exit, exit.x, FLOOR_Y));
    assert.ok(!greedyBoxHit(exit, exit.x - 60, FLOOR_Y), 'not beside it');
    assert.ok(!greedyBoxHit(check, 365, FLOOR_Y), 'not at the start');
  });

  it('a box fires on the way in, once, until you step out', () => {
    const inside = new Set();
    assert.deepEqual(greedyBoxesEntered(boxes, inside, exit.x, FLOOR_Y), [GREEDY_EXIT_BOX_ID]);
    assert.deepEqual(greedyBoxesEntered(boxes, inside, exit.x, FLOOR_Y), []);
    assert.deepEqual(greedyBoxesEntered(boxes, inside, 365, FLOOR_Y), []);
    assert.deepEqual(greedyBoxesEntered(boxes, inside, exit.x, FLOOR_Y), [GREEDY_EXIT_BOX_ID]);
  });

  it('check box, an act unread: Glitch\'s warning once, moved back 100 px; then nothing more', () => {
    const state = createGreedyStreetSpiritState({ enteredAt: 1000 });
    pressGreedyAct(state, 0, 2000);
    assert.deepEqual(greedyStreetBoxEnter(state, GREEDY_CHECK_BOX_ID), { say: GREEDY_MISSED_STORY_LINE, pushBack: 100 });
    assert.equal(GREEDY_CHECK_PUSH_BACK, 100);
    assert.equal(greedyStreetBoxEnter(state, GREEDY_CHECK_BOX_ID), null, 'warned_story: once');
  });

  it('check box, every act read: the Piggy line once (the first story only; the repeat has none)', () => {
    const first = readAll(createGreedyStreetSpiritState({ enteredAt: 1000 }));
    assert.deepEqual(greedyStreetBoxEnter(first, GREEDY_CHECK_BOX_ID), { say: GREEDY_BACK_TO_PIGGY_LINE, pushBack: 0 });
    assert.equal(greedyStreetBoxEnter(first, GREEDY_CHECK_BOX_ID), null);
    const repeat = readAll(createGreedyStreetSpiritState({ repeat: true, enteredAt: 1000 }));
    assert.equal(greedyStreetBoxEnter(repeat, GREEDY_CHECK_BOX_ID), null);
  });

  it('the lines are Glitch\'s own, word for word', { skip: !glitchQuest && 'glitch-GameServerJS not beside the repo' }, () => {
    assert.ok(glitchQuest.includes(`pc.announce_vog_fade("${GREEDY_MISSED_STORY_LINE}")`));
    assert.ok(glitchQuest.includes(`pc.announce_vog_fade("${GREEDY_BACK_TO_PIGGY_LINE}")`));
    assert.ok(glitchQuest.includes('pc.moveAvatar(pc.x-100, pc.y, \'left\')'));
  });

  it('exit box: back where you came from; a run with acts unread is abandoned (failed, as Glitch)', () => {
    const partial = createGreedyStreetSpiritState({ enteredAt: 1000 });
    assert.deepEqual(greedyStreetBoxEnter(partial, GREEDY_EXIT_BOX_ID), { leave: true, abandon: true });
    const done = readAll(createGreedyStreetSpiritState({ enteredAt: 1000 }));
    assert.deepEqual(greedyStreetBoxEnter(done, GREEDY_EXIT_BOX_ID), { leave: true, abandon: false });
  });
});

describe('G1163 game.js wiring', () => {
  const update = game.slice(game.indexOf('function updateGreedyStreetSpirit() {'), game.indexOf('const autoplay = new URLSearchParams', game.indexOf('function updateGreedyStreetSpirit() {')));
  const stepAt = game.indexOf('function stepGreedyStreetBoxes(now) {');
  const step = game.slice(stepAt, game.indexOf('\n}\n', stepAt));
  const ret = game.slice(game.indexOf('async function returnFromGreedyStreetSpirit('), game.indexOf('function stepGreedyStreetBoxes(now) {'));

  it('Storyland steps its boxes every frame', () => {
    assert.match(update, /stepGreedyStreetBoxes\(now\);/);
    assert.match(step, /greedyBoxesEntered\(boxes, greedyStreetBoxesInside, player\.x, player\.y\)/);
    assert.match(step, /player\.x -= fx\.pushBack;/);
    assert.match(step, /openLocationVog\(\{ lines: \[fx\.say\] \}\)/);
    assert.match(step, /returnFromGreedyStreetSpirit\(\{ abandon: fx\.abandon \}\)/);
  });

  it('R46: the way out travels first and ends the run only once you have arrived', () => {
    const trip = ret.indexOf('await enterStreetWithTransition(destination.tsid');
    assert.ok(trip > 0);
    for (const change of ['greedyStreetState = null;', 'delete questState.active[questId];', 'finishGreedyRepeat();']) {
      assert.ok(ret.indexOf(change) > trip, `${change} after the trip`);
    }
    assert.match(ret, /catch \(err\) \{[\s\S]*?restoreGreedyStreetAfterFailedExit\(before\);\s*return false;/);
  });
});
