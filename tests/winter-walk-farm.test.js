/**
 * Live report 2026-10-30 #7: "quests that have a location ... you can exit them
 * at any time and then they start completely over next time, the winter walk one
 * can be repeatedly used for farming".
 *
 * What the source did (glitch-GameServerJS quests/):
 * - winter_walk.js: offered after A Summer's Day (18) from level 7 (19-23), not
 *   until an hour after A Summer's Day (canOffer 76-84); leaving early fails it
 *   and takes it out of the log (onExitLocation 96-107), so it may be offered again.
 * - winter_walk_part2.js: leaving early fails it and keeps fail_time
 *   (onExitLocation 88-100); canOffer 64-76 waits an hour after the first walk,
 *   the last repeat and the last fail.
 * - The motes are iMG quoins, and only rainbow runs, races, games, Paradise and
 *   top_of_tree skip the daily quoin limit (items/quoin.js 159, 236-237,
 *   locations/location.js 361), so the walk's count toward it and stop at it.
 * - Every repeatable quest room whose canOffer waits an hour after the last try.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  WINTER_WALK_OFFER_WAIT_MS,
  WINTER_WALK_QUEST_ID,
  WINTER_WALK_REPEAT_QUEST_ID,
  canOfferWinterWalk,
  ensureWinterWalkStory,
  failInterruptedWinterWalk,
  noteWinterWalkEnd,
} from '../public/js/winter-walk.js?v=9961c35f';
import { OFFER_OVERRIDES, QUEST_ROOMS, isBuiltRoom } from '../public/js/quest-rooms/catalog.js?v=9ebeb502';

const root = join(import.meta.dirname, '..');
const gsjsQuests = join(root, '..', 'glitch-GameServerJS', 'quests');
const HOUR = 60 * 60 * 1000;
const T = 1_800_000_000_000;
const quests = (completed = [], active = {}) => ({ completed: [...completed], active: { ...active }, story: {} });

describe('when Winter Walk may be offered (js/winter-walk.js canOfferWinterWalk)', () => {
  it('needs A Summer\'s Day, level 7 and an hour since A Summer\'s Day, as the source', () => {
    assert.equal(canOfferWinterWalk(quests(), { now: T, level: 10 }).reason, 'prereq');
    assert.equal(canOfferWinterWalk(quests(['blue_and_white_part1']), { now: T, level: 6 }).reason, 'level');
    assert.equal(canOfferWinterWalk(quests(['blue_and_white_part1']), { now: T, level: 7, summersDayDoneAt: T - 10 * 60_000 }).reason, 'cooldown');
    assert.equal(canOfferWinterWalk(quests(['blue_and_white_part1']), { now: T, level: 7, summersDayDoneAt: T - HOUR }).ok, true);
    assert.equal(canOfferWinterWalk(quests(['blue_and_white_part1']), { now: T, level: 7 }).ok, true, 'an old save without the time waits for nothing');
  });

  it('leaving the first walk early takes it out of the log and leaves no wait (quests_fail_and_remove)', () => {
    const qs = quests(['blue_and_white_part1']);
    noteWinterWalkEnd(qs, { repeat: false, outcome: 'failed', now: T });
    assert.equal(canOfferWinterWalk(qs, { now: T + 1000, level: 8, summersDayDoneAt: T - 2 * HOUR }).ok, true);
    noteWinterWalkEnd(qs, { repeat: false, outcome: 'complete', now: T + 2000 });
    qs.completed.push(WINTER_WALK_QUEST_ID);
    assert.equal(canOfferWinterWalk(qs, { now: T + 3000, level: 8 }).reason, 'already_complete');
  });

  it('main: the repeat came back at once after leaving early (the farm); now it waits an hour after a fail or a finish', () => {
    const qs = quests(['blue_and_white_part1', WINTER_WALK_QUEST_ID]);
    ensureWinterWalkStory(qs).firstCompletedAt = T - 3 * HOUR;
    assert.equal(canOfferWinterWalk(qs, { now: T, repeat: true }).ok, true);
    noteWinterWalkEnd(qs, { repeat: true, outcome: 'failed', now: T });
    const soon = canOfferWinterWalk(qs, { now: T + 5 * 60_000, repeat: true });
    assert.equal(soon.reason, 'cooldown');
    assert.equal(soon.remainingMs, WINTER_WALK_OFFER_WAIT_MS - 5 * 60_000);
    assert.equal(canOfferWinterWalk(qs, { now: T + HOUR, repeat: true }).ok, true);
    noteWinterWalkEnd(qs, { repeat: true, outcome: 'complete', now: T + HOUR });
    assert.equal(canOfferWinterWalk(qs, { now: T + HOUR + 1, repeat: true }).reason, 'cooldown');
    assert.equal(canOfferWinterWalk(qs, { now: T + HOUR + 1, repeat: true, bypassCooldown: true }).ok, true, 'QA questdemo bypass');
  });

  it('a walk lost with the page counts as left early (reloading no longer restarts it fresh)', () => {
    const qs = quests(['blue_and_white_part1', WINTER_WALK_QUEST_ID], { [WINTER_WALK_REPEAT_QUEST_ID]: { progress: { leave: 0 } } });
    assert.deepEqual(failInterruptedWinterWalk(qs, T), [WINTER_WALK_REPEAT_QUEST_ID]);
    assert.equal(qs.active[WINTER_WALK_REPEAT_QUEST_ID], undefined);
    assert.equal(ensureWinterWalkStory(qs).repeatFailedAt, T);
    const first = quests(['blue_and_white_part1'], { [WINTER_WALK_QUEST_ID]: { progress: {} } });
    assert.deepEqual(failInterruptedWinterWalk(first, T), [WINTER_WALK_QUEST_ID]);
    assert.equal(ensureWinterWalkStory(first).repeatFailedAt, 0);
  });
});

describe('game.js runs Winter Walk by those rules', () => {
  const game = readFileSync(join(root, 'public', 'game.js'), 'utf8');
  const fn = (name) => {
    const at = game.indexOf(`function ${name}(`);
    assert.ok(at >= 0, name);
    return game.slice(at, game.indexOf('\n}\n', at));
  };

  it('offers it through canOfferWinterWalk with the level and A Summer\'s Day time', () => {
    const body = fn('canOfferStoryQuest');
    assert.match(body, /canOfferWinterWalk\(questState, \{[\s\S]*?level: pc\.level,[\s\S]*?summersDayDoneAt:/);
    assert.doesNotMatch(body, /return !questState\.completed\.includes\(WINTER_WALK_QUEST_ID\) && !winterWalkIsInstanced\(\)/);
  });

  it('notes a fail on leaving or running out of time, a finish on completing, and fails a walk lost at boot', () => {
    assert.match(fn('returnFromWinterWalk'), /noteWinterWalkEnd\(questState, \{ repeat: winterWalkState\.repeat, outcome: 'failed' \}\)/);
    assert.match(fn('completeWinterWalk'), /noteWinterWalkEnd\(questState, \{ repeat: winterWalkState\.repeat, outcome: 'complete' \}\)/);
    assert.match(game, /dropBootStarterQuests\(questState\);\n\s+\/\/[^\n]*\n\s+failInterruptedWinterWalk\(questState, Date\.now\(\)\);/);
  });

  it('pays a mote as an iMG quoin that counts toward, and stops at, the daily quoin limit', () => {
    const body = fn('collectWinterWalkMote');
    assert.match(body, /quoinState\.collectedToday >= quoinState\.dailyLimit[\s\S]*?return false;/);
    assert.match(body, /collectQuoin\(quoinState, 'xp', pc, \{ amount: result\.amount \}\)/);
    assert.doesNotMatch(body, /grantMoodXp\(/);
  });
});

describe('every repeatable quest room waits as its source canOffer does (quest-rooms/catalog.js OFFER_OVERRIDES)', { skip: !existsSync(gsjsQuests) }, () => {
  it('a room quest whose canOffer waits an hour or more after its own last try carries an hour_after gate', () => {
    const missing = [];
    for (const f of readdirSync(gsjsQuests).filter((n) => n.endsWith('.js'))) {
      const id = f.replace(/\.js$/, '');
      const room = QUEST_ROOMS[id];
      if (!room || !isBuiltRoom(room)) continue;
      const src = readFileSync(join(gsjsQuests, f), 'utf8');
      const body = /function canOffer\(pc\)\{([\s\S]*?)\n\}/.exec(src)?.[1] || '';
      if (!/this\.(ts_done|fail_time) && time\(\) - this\.(ts_done|fail_time) < \d/.test(body)) continue;
      const gates = (OFFER_OVERRIDES[id]?.prerequisites || []).map((p) => String(p.value));
      if (!gates.some((g) => /^hours?_after:/.test(g))) missing.push(id);
    }
    assert.deepEqual(missing, []);
  });
});
