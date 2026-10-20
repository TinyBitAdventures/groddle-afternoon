/**
 * Glitch Races: ticket store, race lifecycle, source rewards, rival pacing,
 * and course reachability for every reconstructed course.
 * Run: node --test tests/races.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  RACES,
  RACE_IDS,
  RACE_COUNTDOWN_MS,
  RACE_DISPENSER_STREETS,
  RACE_LOSS_REWARD,
  RACE_REWARD_CAP,
  RACE_STORE_ITEMS,
  RACE_TICKET_PRICE,
  RACE_WIN_REWARD,
  beginRaceCountdown,
  canJump,
  createRaceRun,
  finishRace,
  forfeitRace,
  hasRaceDispenser,
  isRaceSceneTsid,
  normalizeRaceRecord,
  passRaceCheckpoint,
  pickGenericRace,
  projectRouteProgress,
  raceCountdownCue,
  raceForTicket,
  raceResultCopy,
  raceSceneTsid,
  routeDurationMs,
  routePoseAt,
  settleRace,
  startDelayMessage,
  tickRace,
} from '../public/js/races.js';
import { RACE_COURSE_IDS, platformUnder, raceCourse } from '../public/js/race-courses.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');

describe('race catalog and ticket store', () => {
  it('maps the seven race tickets to config_prod location ids 0-6', () => {
    assert.equal(RACE_IDS.length, 7);
    assert.deepEqual(
      RACE_IDS,
      ['amazing_race', 'canyon_run', 'lava_leap', 'crystal_climb', 'space_race', 'star_sprint', 'time_warp']
    );
    assert.equal(RACES.space_race.locationIndex, 4);
    assert.equal(RACES.space_race.productionTsid, 'LHV1BCTKK142N8F');
    assert.equal(raceForTicket('race_ticket_lava_leap').id, 'lava_leap');
    assert.equal(raceForTicket('race_ticket_hogtie_piggy'), null);
  });

  it('keeps the recovered quest descs', () => {
    assert.equal(RACES.space_race.desc, 'Race through space to be the first past the post.');
    assert.equal(RACES.amazing_race.desc, 'Be the first to get to the top!');
  });

  it('sells store 20 at 60 currants per ticket', () => {
    assert.equal(RACE_TICKET_PRICE, 60);
    assert.equal(RACE_STORE_ITEMS.length, 10);
    assert.ok(RACE_STORE_ITEMS.every((row) => row.cost === 60));
  });

  it('places dispensers on the eleven archived streets', () => {
    assert.equal(Object.keys(RACE_DISPENSER_STREETS).length, 11);
    assert.ok(hasRaceDispenser('GLI2HHRC84F1TJ6'));
    assert.ok(hasRaceDispenser('LLI2HHRC84F1TJ6'));
    assert.ok(!hasRaceDispenser('GLI2V0UN7RD1T2J'));
  });

  it('ships ticket and dispenser art', () => {
    for (const race of Object.values(RACES)) {
      assert.ok(existsSync(join(root, 'assets/sprites/races', `${race.ticket}.png`)), race.ticket);
    }
    assert.ok(existsSync(join(root, 'assets/sprites/races/race_ticket_dispenser.png')));
    assert.ok(existsSync(join(root, 'assets/sprites/races/race_ticket.png')));
  });

  it('rolls the generic ticket onto a race', () => {
    for (let i = 0; i < 20; i += 1) assert.ok(RACE_IDS.includes(pickGenericRace(i / 20)));
    assert.equal(pickGenericRace(0), 'amazing_race');
  });

  it('names race scenes so reloads can recognise them', () => {
    assert.equal(raceSceneTsid('space_race'), 'RACE_SPACE_RACE');
    assert.ok(isRaceSceneTsid('RACE_SPACE_RACE'));
    assert.ok(!isRaceSceneTsid('GLI2V0UN7RD1T2J'));
    assert.equal(
      startDelayMessage('Space Race', 'you', 'Amp'),
      'Starting Space Race between you and Amp in 5 seconds!'
    );
  });
});

describe('race lifecycle', () => {
  it('runs ready → countdown → GO → finish', () => {
    const run = createRaceRun('space_race', { now: 1000, rivalDurationMs: 30_000 });
    assert.equal(run.status, 'staging');
    assert.ok(beginRaceCountdown(run, 2000));
    assert.equal(run.startAt, 2000 + RACE_COUNTDOWN_MS);
    assert.equal(raceCountdownCue(run, 2100), 'READY?');
    assert.equal(raceCountdownCue(run, 3500), '3');
    assert.equal(raceCountdownCue(run, 5500), '1');
    assert.deepEqual(tickRace(run, 6000), [{ type: 'started' }]);
    assert.equal(run.status, 'running');
    assert.ok(passRaceCheckpoint(run, 0));
    assert.ok(!passRaceCheckpoint(run, 0));
    assert.ok(finishRace(run, 26_000));
    assert.equal(run.status, 'won');
    assert.ok(!finishRace(run, 27_000));
  });

  it('loses when the rival crosses first', () => {
    const run = createRaceRun('lava_leap', { now: 0, rivalDurationMs: 20_000 });
    beginRaceCountdown(run, 0);
    tickRace(run, 4000);
    assert.deepEqual(tickRace(run, 24_000), [{ type: 'lost', winner: run.rivalName }]);
    assert.equal(run.status, 'lost');
    assert.ok(!finishRace(run, 24_100));
  });

  it('settles inc_race.js rewards with the ten-race cap', () => {
    let record = normalizeRaceRecord({});
    const play = (status) => {
      const run = createRaceRun('canyon_run', { now: 0, rivalDurationMs: 60_000 });
      beginRaceCountdown(run, 0);
      tickRace(run, 4000);
      if (status === 'won') finishRace(run, 40_000);
      else tickRace(run, 70_000);
      const out = settleRace(run, record);
      record = out.record;
      return out;
    };
    assert.deepEqual(play('won').reward, RACE_WIN_REWARD);
    assert.deepEqual(play('lost').reward, RACE_LOSS_REWARD);
    for (let i = 1; i < RACE_REWARD_CAP; i += 1) play('won');
    assert.equal(record.wins.canyon_run, RACE_REWARD_CAP);
    assert.deepEqual(play('won').reward, { currants: 0, xp: 0 });
    assert.equal(record.best.canyon_run, 36_000);
  });

  it('uses the recorded result copy', () => {
    const won = { status: 'won', rivalName: 'Amp' };
    assert.deepEqual(raceResultCopy(won, RACE_WIN_REWARD), {
      title: 'YOU WON!',
      detail: '(You got 100 currants and 50 xp.)',
    });
    assert.deepEqual(raceResultCopy({ status: 'lost', rivalName: 'Amp' }, RACE_LOSS_REWARD), {
      title: 'Amp IS THE WINNER!',
      detail: '(You get 25 currants and 5 xp for 2nd place)',
    });
  });

  it('forfeits without a reward', () => {
    const run = createRaceRun('time_warp', { now: 0 });
    assert.ok(forfeitRace(run, 10));
    const out = settleRace(run, {});
    assert.deepEqual(out.reward, { currants: 0, xp: 0 });
  });

  it('normalizes the saved record and drops race-scene return points', () => {
    const rec = normalizeRaceRecord({
      wins: { space_race: 2, bogus: 4 },
      returnTo: { tsid: 'RACE_SPACE_RACE', x: 1, y: 2 },
      pendingTicket: 'race_ticket_space_race',
    });
    assert.deepEqual(rec.wins, { space_race: 2 });
    assert.equal(rec.returnTo, null);
    assert.equal(rec.pendingTicket, 'race_ticket_space_race');
    assert.deepEqual(normalizeRaceRecord({ returnTo: { tsid: 'GLI2V0UN7RD1T2J', x: 10.4, y: 20 } }).returnTo, {
      tsid: 'GLI2V0UN7RD1T2J',
      x: 10,
      y: 20,
    });
  });
});

describe('route kinematics', () => {
  const nodes = [
    { x: 0, y: 100, mode: 'start' },
    { x: 264, y: 100, mode: 'walk' },
    { x: 400, y: 40, mode: 'jump' },
    { x: 400, y: -100, mode: 'climb' },
  ];

  it('walks at avatar speed and slows with pace', () => {
    const full = routeDurationMs(nodes, { pace: 1 });
    const slow = routeDurationMs(nodes, { pace: 0.5 });
    assert.ok(full > 1000 && full < 5000, String(full));
    assert.ok(slow > full * 1.4 && slow <= full * 2 + 1);
  });

  it('poses along the route and finishes on the last node', () => {
    const start = routePoseAt(nodes, 0);
    assert.equal(start.x, 0);
    const mid = routePoseAt(nodes, 500);
    assert.ok(mid.x > 0 && mid.x < 264);
    assert.equal(mid.mode, 'walk');
    const done = routePoseAt(nodes, 1e9);
    assert.equal(done.done, true);
    assert.equal(done.y, -100);
  });

  it('projects progress monotonically along the route', () => {
    const a = projectRouteProgress(nodes, 50, 100, 0);
    const b = projectRouteProgress(nodes, 300, 80, a.segment);
    const c = projectRouteProgress(nodes, 400, -50, b.segment);
    assert.ok(a.progress < b.progress && b.progress < c.progress);
  });

  it('measures jumps against the avatar physics', () => {
    assert.ok(canJump(140, 60));
    assert.ok(!canJump(150, 120));
    assert.ok(!canJump(320, 0));
    assert.ok(canJump(240, 0, 0.62));
  });
});

describe('course reachability', () => {
  for (const id of RACE_COURSE_IDS) {
    describe(id, () => {
      const course = raceCourse(id);

      it('has a start, a finish, checkpoints and a route', () => {
        assert.ok(RACES[id], 'race exists');
        assert.ok(course.spawn?.player && course.spawn?.rival);
        assert.ok(course.finish);
        assert.ok(course.checkpoints.length >= 2);
        assert.ok(course.route.length > 6);
        assert.ok(course.width > 0 && course.height > 0);
      });

      it('keeps every surface inside the world', () => {
        for (const p of course.platforms) {
          assert.ok(p.x1 >= 0 && p.x2 <= course.width, `${p.id} x ${p.x1}-${p.x2}`);
          assert.ok(p.y1 > 0 && p.y2 <= course.height, `${p.id} y ${p.y1}/${p.y2}`);
        }
        for (const node of course.route) {
          assert.ok(node.x >= 24 && node.x <= course.width - 24, `route x ${node.x}`);
        }
      });

      it('puts every route stop, checkpoint and the finish on solid ground', () => {
        const solid = course.platforms.filter((p) => !p.hazard);
        for (const node of [...course.route, ...(course.rivalRoute || [])]) {
          if (node.mode === 'climb') {
            assert.ok(course.walls.some((w) => Math.abs(w.x - node.x) < 2), `climb wall at ${node.x}`);
            continue;
          }
          assert.ok(platformUnder(solid, node.x, node.y), `${id} node ${node.mode} ${node.x},${node.y}`);
        }
        for (const cp of course.checkpoints) {
          assert.ok(platformUnder(solid, cp.x, cp.y), `${id} checkpoint ${cp.index}`);
        }
        assert.ok(platformUnder(solid, course.finish.x, course.finish.y), `${id} finish`);
      });

      it('only asks for jumps the avatar can make', () => {
        for (const route of [course.route, course.rivalRoute].filter(Boolean)) for (let i = 1; i < route.length; i += 1) {
          const node = route[i];
          if (node.mode !== 'jump') continue;
          const from = route[i - 1];
          const dx = node.x - from.x;
          const rise = from.y - node.y;
          assert.ok(
            canJump(dx, rise, course.gravity),
            `${id} jump ${i}: dx ${dx}, rise ${rise} (gravity ${course.gravity})`
          );
        }
      });

      it('paces the rival for a 30-120 s race', () => {
        const ms = routeDurationMs(course.rivalRoute || course.route, { pace: course.rivalPace, gravity: course.gravity });
        assert.ok(ms > 30_000 && ms < 120_000, `${id} rival ${Math.round(ms)} ms`);
        const best = routeDurationMs(course.route, { pace: 1, gravity: course.gravity });
        assert.ok(best < ms * 0.88, 'a clean run beats the rival');
        if (course.rivalRoute) {
          assert.equal(course.rivalRoute.length, course.route.length);
          const end = course.rivalRoute[course.rivalRoute.length - 1];
          assert.deepEqual([end.x, end.y], [course.finish.x, course.finish.y], 'twin routes meet at the posts');
        }
      });
    });
  }
});
