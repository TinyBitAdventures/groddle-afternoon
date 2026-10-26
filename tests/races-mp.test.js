/**
 * Multiplayer phase 4, races between real players: the pure client side
 * (js/races-mp.js), the generator of the server's course data
 * (tools/build-realtime-races.mjs, data/races.json in the server repo), the
 * server's source constants and copy (races.go in groddle-afternoon-server;
 * those checks skip without it, tools/repos.mjs), the realtime street a race
 * scene shares (realtime-feature sharedStreet + races-feature
 * realtimeStreet), and that solo races never touch any of it.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

import {
  MP_RACE_COURSES,
  MP_RACE_TEXT,
  endOutcome,
  mayClaim,
  normalizeMatch,
  normalizeScores,
  othersLabel,
  overlayLines,
  shardAmount,
  splitScores,
} from '../public/js/races-mp.js?v=mp4-1';
import { raceData } from '../tools/build-realtime-races.mjs';
import { RACE_COURSE_IDS, raceCourse } from '../public/js/race-courses.js';
import { quoinGrabWinner } from '../public/js/races.js';
import { sharedStreet } from '../public/js/features/realtime-feature.js?v=g338-1';
import { HAS_SERVER, serverPath, skipWithoutServer } from '../tools/repos.mjs';

const root = join(import.meta.dirname, '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');

const MATCH = {
  t: 'race_match',
  match: '00000000000000a1',
  street: 'RACE_00000000000000A1',
  course: 'grab_em_good',
  title: "Grab 'Em Good",
  game: 'quoin_grab',
  kind: 'quoins',
  slot: 1,
  spawn: [1819, 2310],
  players: [{ id: 7, name: 'Ada', slot: 0 }, { id: 8, name: 'Bo', slot: 1 }],
  total: 2,
  quoins: [[10, 20], [30, 40]],
  autoLeave: 120,
};

describe('races-mp: what the server sends', () => {
  it('cleans a match', () => {
    const m = normalizeMatch(MATCH);
    assert.equal(m.match, MATCH.match);
    assert.equal(m.street, MATCH.street);
    assert.equal(m.slot, 1);
    assert.deepEqual(m.spawn, { x: 1819, y: 2310 });
    assert.deepEqual(m.quoins, [{ x: 10, y: 20 }, { x: 30, y: 40 }]);
    assert.equal(m.total, 2);
    assert.equal(m.finish, null);
    assert.equal(m.players.length, 2);
  });

  it('turns away a match it cannot run', () => {
    assert.equal(normalizeMatch({ ...MATCH, match: 'x' }), null);
    assert.equal(normalizeMatch({ ...MATCH, street: 'GA5' }), null, 'only a match street, never a real one');
    assert.equal(normalizeMatch({ ...MATCH, course: 'hogtie_piggy' }), null);
    assert.equal(normalizeMatch({ ...MATCH, kind: 'tag' }), null);
    assert.equal(normalizeMatch({ ...MATCH, players: [MATCH.players[0]] }), null, 'a race needs two');
    assert.equal(normalizeMatch({ ...MATCH, quoins: [[1, 2], ['x', 3]] }), null);
    const fin = normalizeMatch({ ...MATCH, course: 'canyon_run', kind: 'finish', finish: [7064, 820], quoins: undefined });
    assert.deepEqual(fin.finish, { x: 7064, y: 820 });
    assert.equal(fin.total, 0);
  });

  it('splits the scores into the run\'s two sides and the source overlay', () => {
    const rows = normalizeScores([{ id: 7, name: 'Ada', score: 3 }, { id: 8, name: 'Bo', score: 5.9 }, { id: 0 }, null]);
    assert.deepEqual(rows.map((r) => r.score), [3, 5]);
    assert.deepEqual(splitScores(rows, 7), { you: 3, rival: 5, rivalName: 'Bo' });
    assert.deepEqual(overlayLines(rows, 63, 7), ['You: 3', 'Bo: 5', 'Remaining: 63']);
    assert.equal(othersLabel(MATCH.players, 7), 'Bo');
    assert.equal(othersLabel([...MATCH.players, { id: 9, name: 'Cy' }], 7), 'Bo and Cy');
  });

  it('works out a shard with the receiver\'s own multiplier (quoin.js 117-118)', () => {
    const grab = { base: 10, shards: [{ id: 8, pct: 0.31 }] };
    assert.equal(shardAmount(grab, 8, 1), 3);
    assert.equal(shardAmount(grab, 8, 2), 6);
    assert.equal(shardAmount({ base: 10, shards: [{ id: 8, pct: 0.05 }] }, 8, 1), 1, 'never under one');
    assert.equal(shardAmount(grab, 7, 1), 0, 'none for the grabber or anyone not listed');
  });

  it('reads the end for this player', () => {
    assert.deepEqual(endOutcome({ winner: { id: 7, name: 'Ada' } }, 7), { outcome: 'won', winnerName: 'Ada', leftName: '' });
    assert.equal(endOutcome({ winner: { id: 7, name: 'Ada' } }, 8).outcome, 'lost');
    assert.deepEqual(endOutcome({ winner: null, left: { id: 8, name: 'Bo' } }, 7), { outcome: 'called_off', winnerName: '', leftName: 'Bo' });
    assert.equal(MP_RACE_TEXT.calledOff('Bo'), 'Bo left the game, so it is over.');
  });

  it('claims one quoin at a time', () => {
    const q = { live: true, claimAt: 0 };
    assert.equal(mayClaim(q, 500), true);
    q.claimAt = 500;
    assert.equal(mayClaim(q, 900), false);
    assert.equal(mayClaim(q, 1500), true);
    assert.equal(mayClaim({ live: false }, 0), false);
  });
});

describe('the server\'s course data', () => {
  it('is current (node tools/build-realtime-races.mjs)', { skip: skipWithoutServer }, () => {
    const out = execFileSync(process.execPath, [join(root, 'tools/build-realtime-races.mjs'), '--check'], { encoding: 'utf8' });
    assert.match(out, /is current \(8 courses\)/);
  });

  it('matches the courses the game draws', () => {
    const data = raceData();
    assert.deepEqual(Object.keys(data.courses).sort(), [...RACE_COURSE_IDS].sort());
    assert.deepEqual([...MP_RACE_COURSES].sort(), [...RACE_COURSE_IDS].sort());
    const g = data.courses.grab_em_good;
    const course = raceCourse('grab_em_good');
    assert.equal(g.game, 'quoin_grab');
    assert.equal(g.quoins.length, 71, 'the wiki\'s 71');
    g.quoins.forEach(([x, y], i) => assert.deepEqual([x, y], [course.quoins[i].x, course.quoins[i].y]));
    assert.deepEqual(g.spawns, [[course.spawn.player.x, course.spawn.player.y], [course.spawn.rival.x, course.spawn.rival.y]]);
    for (const id of RACE_COURSE_IDS.filter((c) => c !== 'grab_em_good')) {
      assert.equal(data.courses[id].game, 'race');
      assert.deepEqual(data.courses[id].finish, [raceCourse(id).finish.x, raceCourse(id).finish.y]);
    }
  });
});

describe('the server (races.go)', { skip: skipWithoutServer }, () => {
  const go = HAS_SERVER ? readFileSync(serverPath('races.go'), 'utf8') : '';

  it('keeps the source numbers', () => {
    assert.match(go, /raceInviteTimeout = 60 \* time\.Second/);
    assert.match(go, /raceStartDelay\s+= 5 \* time\.Second/);
    assert.match(go, /raceAutoLeave\s+= 2 \* time\.Minute/);
    assert.match(go, /raceSoon\s+= 5 \* time\.Second/);
    assert.match(go, /raceCountdown\s+= 4000 \* time\.Millisecond/);
    assert.match(go, /"quoin_grab": \{min: 2, max: 2/);
    assert.match(go, /"race":\s+\{min: 2, max: 2/);
  });

  it('says what the source says', () => {
    for (const line of [
      'You need at least one other player here.',
      ' is looking for a challenger for ',
      'Waiting for other players...',
      'Not enough players accepted your challenge. Try again later?',
      'Sorry, you were not quite fast enough to join ',
      ' in 5 seconds!',
      ' is ready to play. Need ',
      " is ready to play. LET'S GO!",
      ' is ready to play. Just waiting on a few more slackers to HIT THE START BUTTON.',
      'YAY! THE GAME IS STARTING SOON.',
      'You were removed from the game due to inactivity.',
    ]) assert.ok(go.includes(line), line);
  });

  it('settles Grab \'Em Good by the same rule as solo (global_game.js 447-476)', () => {
    // The Go win check is mirrored by races.js quoinGrabWinner (tests/races.test.js covers it); spot check the tie case.
    assert.equal(quoinGrabWinner({ a: 1, b: 1 }, 2, 'b'), 'b');
    assert.match(go, /if lead > remaining \|\| remaining == 0 \{/);
  });
});

describe('the shared street of a race scene', () => {
  const engine = (answer) => ({
    player: { x: 0, y: 0 },
    streetTsid: 'RACE_GRAB_EM_GOOD',
    transientInstance: () => true,
    homeContext: () => ({ inHome: false }),
    query: (hook) => (hook === 'realtimeStreet' ? answer : null),
  });

  it('is the match street while a feature says so, else private as before', () => {
    assert.equal(sharedStreet(engine('RACE_00000000000000A1')), 'RACE_00000000000000A1');
    assert.equal(sharedStreet(engine(null)), '');
    assert.equal(sharedStreet({ player: {}, streetTsid: 'GA5', transientInstance: () => false, homeContext: () => ({}) }), 'GA5');
  });

  it('races-feature answers only in a multiplayer match', async () => {
    const { racesFeature } = await import('../public/js/features/races-feature.js?v=card-19');
    assert.equal(racesFeature.realtimeStreet({ inScene: () => true }), null, 'no match: nothing shared');
    assert.deepEqual(racesFeature.labelFor('RACE_00000000000000A1'), { street: 'A race', hub: 'Race', hubId: 'scene' });
    assert.equal(racesFeature.labelFor('RACE_GRAB_EM_GOOD'), null, 'solo race scenes keep their own labels');
    assert.equal(racesFeature.labelFor('GA5'), null);
  });
});

describe('solo races stay solo', () => {
  const src = read('public/js/features/races-feature.js');

  it('only goes online behind the multiplayer gate', () => {
    assert.match(src, /function isMp\(engine\) \{\n  return engine\?\.mode === 'multiplayer' && Boolean\(engine\.query\?\.\('realtimeClient'\)\);/);
    assert.match(src, /if \(isMp\(engine\) && MP_RACE_COURSES\.includes\(raceId\)\) return mpChallenge\(/);
    assert.match(src, /if \(engine\.mode === 'multiplayer' && !mpClient\) mpAttach\(engine\);/);
    // Every send is on the multiplayer client, which only mpAttach / mpChallenge fetch.
    for (const m of src.matchAll(/\.send\('race_[a-z]+'/g)) {
      const before = src.slice(Math.max(0, m.index - 20), m.index);
      assert.match(before, /(mpClient\?|mpClient|c)$/, `send at ${m.index} goes through the multiplayer client`);
    }
  });

  it('ignores the demo routes in multiplayer', () => {
    assert.match(src, /if \(engine\.mode === 'multiplayer'\) \{\n    demoHandled = true;\n    return;\n  \}/);
    assert.match(src, /const params = opts\.mp \? new URLSearchParams\(\) : new URLSearchParams\(location\.search\);/);
  });
});
