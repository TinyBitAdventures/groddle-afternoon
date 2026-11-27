/**
 * G1112: a Greedy Street Spirit left mid-run (a logout, a closed tab, a reload) stayed active with
 * no way back into storyland and no abandon: the run lives only in the page, the saved location is
 * the street you left from, and canOfferGreedyFirst answered `active`. Glitch failed a run left
 * before every act was read (quests/greedy_street_spirit.js onExitLocation 145-163; the repeat's
 * greedy_street_spirit_reminisce.js 108-118 with its fail_time), so a Piggy could offer it again.
 *
 * Run: node --test tests/greedy-left-run-g1112.test.js
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  GREEDY_REPEAT_COOLDOWN_MS,
  GREEDY_STREET_SPIRIT_QUEST_ID,
  GREEDY_STREET_SPIRIT_REPEAT_ID,
  canOfferGreedyFirst,
  canOfferGreedyRepeat,
  ensureGreedyStory,
  failInterruptedGreedyStreetSpirit,
  greedyActsAllRead,
  markGreedyFirstComplete,
} from '../public/js/greedy-street-spirit.js?v=b0ce2437';

const PUBLIC = join(import.meta.dirname, '..', 'public');
const PC = { level: 10 };
const progress = (read) => Object.fromEntries(Array.from({ length: read }, (_, i) => [`read_act_${i + 1}`, 1]));
const questState = (active = {}, completed = []) => ({ active, completed, story: {} });

describe('G1112 a Greedy Street Spirit run left with no storyland open', () => {
  it('fewer than all five acts read: it fails as Glitch did, and a Piggy offers it again', () => {
    for (const read of [0, 2, 4]) {
      const qs = questState({ [GREEDY_STREET_SPIRIT_QUEST_ID]: { progress: progress(read) } });
      assert.equal(canOfferGreedyFirst(qs, PC).reason, 'active', 'the bug: stuck active');
      const res = failInterruptedGreedyStreetSpirit(qs, 1000);
      assert.deepEqual(res, { failed: [GREEDY_STREET_SPIRIT_QUEST_ID], finishRepeat: false }, `${read} acts`);
      assert.equal(qs.active[GREEDY_STREET_SPIRIT_QUEST_ID], undefined);
      assert.equal(canOfferGreedyFirst(qs, PC).ok, true);
    }
  });

  it('all five acts read: it stays active for the Piggy to finish', () => {
    const qs = questState({ [GREEDY_STREET_SPIRIT_QUEST_ID]: { progress: progress(5) } });
    assert.equal(greedyActsAllRead(qs.active[GREEDY_STREET_SPIRIT_QUEST_ID]), true);
    assert.deepEqual(failInterruptedGreedyStreetSpirit(qs, 1000), { failed: [], finishRepeat: false });
    assert.ok(qs.active[GREEDY_STREET_SPIRIT_QUEST_ID]);
    assert.equal(canOfferGreedyFirst(qs, PC).reason, 'active', 'not offered over it: the Piggy completes it');
  });

  it('the repeat: part read fails and starts the Bear\'s hour (fail_time); read through is handed in', () => {
    const story = (qs) => { markGreedyFirstComplete(qs, 0); return qs; };
    const part = story(questState({ [GREEDY_STREET_SPIRIT_REPEAT_ID]: { progress: progress(3) } }, [GREEDY_STREET_SPIRIT_QUEST_ID]));
    assert.deepEqual(failInterruptedGreedyStreetSpirit(part, 50_000), { failed: [GREEDY_STREET_SPIRIT_REPEAT_ID], finishRepeat: false });
    assert.equal(part.active[GREEDY_STREET_SPIRIT_REPEAT_ID], undefined);
    assert.equal(ensureGreedyStory(part).lastRepeatFailedAt, 50_000);
    assert.equal(canOfferGreedyRepeat(part, 50_000 + GREEDY_REPEAT_COOLDOWN_MS).ok, true);
    const whole = story(questState({ [GREEDY_STREET_SPIRIT_REPEAT_ID]: { progress: progress(5) } }, [GREEDY_STREET_SPIRIT_QUEST_ID]));
    assert.deepEqual(failInterruptedGreedyStreetSpirit(whole, 50_000), { failed: [], finishRepeat: true });
    assert.ok(whole.active[GREEDY_STREET_SPIRIT_REPEAT_ID], 'left for finishGreedyRepeat');
  });

  it('nothing in the log: nothing changes', () => {
    const qs = questState({}, [GREEDY_STREET_SPIRIT_QUEST_ID]);
    assert.deepEqual(failInterruptedGreedyStreetSpirit(qs, 1), { failed: [], finishRepeat: false });
    assert.deepEqual(qs.active, {});
  });

  it('runs at load and before a Piggy or the Bear asks, never during a run', () => {
    const game = readFileSync(join(PUBLIC, 'game.js'), 'utf8');
    const settle = game.slice(game.indexOf('function settleLeftGreedyStreetSpirit('), game.indexOf('function handleGreedyStreetPiggy('));
    assert.match(settle, /if \(greedyStreetState \|\| greedyStreetStartPromise \|\| greedyStreetTransitionBusy\) return null;/);
    assert.match(settle, /failInterruptedGreedyStreetSpirit\(questState, Date\.now\(\)\)/);
    assert.match(settle, /res\.finishRepeat && finishGreedyRepeat\(\)/);
    assert.match(game, /failInterruptedWinterWalk\(questState, Date\.now\(\)\);\n[^\n]*\n\s+settleLeftGreedyStreetSpirit\(\{ boot: true \}\);/);
    assert.match(game, /function handleGreedyStreetPiggy\(target\) \{\s+settleLeftGreedyStreetSpirit\(\);\s+if \(completeGreedyStreetSpiritWithPiggy\(target\)\) return true;/);
    assert.match(game, /if \(isEmotionalBear\) settleLeftGreedyStreetSpirit\(\);\s+const bearReminisceQuote = /);
    // A repeat handed in with no storyland open reads its saved act flags.
    const finish = game.slice(game.indexOf('function finishGreedyRepeat('), game.indexOf('async function returnFromGreedyStreetSpirit('));
    assert.match(finish, /const read = greedyStreetState \? greedyStreetState\.actsRead\.length === GREEDY_ACTS\.length : greedyActsAllRead\(active\);/);
    assert.match(finish, /if \(greedyStreetState\) greedyStreetState\.status = 'complete';/);
  });
});
