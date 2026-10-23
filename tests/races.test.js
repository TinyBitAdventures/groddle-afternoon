/**
 * Glitch Races: ticket store, race lifecycle, source rewards, rival pacing,
 * and course reachability for every reconstructed course, plus the Grab 'Em
 * Good quoin game (global_game.js quoin_grab_*).
 * Run: node --test tests/races.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  GRAB_EM_GOOD_ID,
  QUOIN_GRAB_ACHIEVEMENTS,
  QUOIN_GRAB_SPLASH_TEXT,
  RACES,
  RACE_GAME_IDS,
  RACE_IDS,
  RACE_COUNTDOWN_MS,
  RACE_DISPENSER_STREETS,
  RACE_LOSS_REWARD,
  RACE_SPLASH_TEXT,
  RACE_STARTING_SOON,
  RACE_STARTING_SOON_MS,
  RACE_STORE_ITEMS,
  RACE_TICKET_PRICE,
  RACE_WIN_REWARD,
  beginRaceCountdown,
  canJump,
  createRaceRun,
  finishRace,
  forfeitRace,
  grabRaceQuoin,
  isQuoinGrab,
  quoinGrabMood,
  quoinGrabOverlayLines,
  quoinGrabRemaining,
  quoinGrabTarget,
  quoinGrabWinner,
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
    // quests/crystal_climb.js, word for word (the recording's ready card shows it too).
    assert.equal(RACES.crystal_climb.desc, 'Climb fastest to the top of the crystal maze to win. WIN!');
    for (const id of RACE_IDS) assert.equal(RACES[id].descSource, `quests/${id}.js`);
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

  it('rolls the generic ticket onto a race, or Grab \'Em Good on the last value', () => {
    // race_ticket.js: randInt(0, 8): 0-6 a race, 7 Hog Haul (no ticket route here), 8 quoin_grab.
    for (let i = 0; i < 8; i += 1) assert.ok(RACE_IDS.includes(pickGenericRace(i / 9 + 0.01)), `roll ${i}`);
    assert.equal(pickGenericRace(0), 'amazing_race');
    assert.equal(pickGenericRace(8 / 9 + 0.01), GRAB_EM_GOOD_ID);
    assert.equal(pickGenericRace(0.999), GRAB_EM_GOOD_ID);
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

  // players/inc_games.js games_end_race: the ticket races since the
  // @glitchlog race-code overhaul (2011-10-25) pay every win and no loss.
  it('settles inc_games.js rewards: every win pays, a loss pays nothing', () => {
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
    assert.deepEqual(RACE_WIN_REWARD, { currants: 100, xp: 50 });
    assert.deepEqual(play('lost').reward, { currants: 0, xp: 0 });
    assert.deepEqual(RACE_LOSS_REWARD, { currants: 0, xp: 0 });
    for (let i = 1; i < 12; i += 1) play('won');
    assert.equal(record.wins.canyon_run, 12);
    assert.equal(record.losses.canyon_run, 1);
    assert.deepEqual(play('won').reward, RACE_WIN_REWARD);
    assert.equal(record.best.canyon_run, 36_000);
  });

  it('uses the games splash and result copy', () => {
    assert.equal(RACE_SPLASH_TEXT, 'Be the first to the finish line to win!');
    assert.equal(RACE_STARTING_SOON, 'YAY! THE GAME IS STARTING SOON.');
    assert.equal(RACE_STARTING_SOON_MS, 5000);
    const won = { status: 'won', rivalName: 'Amp' };
    assert.deepEqual(raceResultCopy(won, RACE_WIN_REWARD), {
      title: 'YOU WON!',
      detail: '(You got 100 currants and 50 xp.)',
    });
    assert.deepEqual(raceResultCopy({ status: 'lost', rivalName: 'Amp' }, RACE_LOSS_REWARD), {
      title: 'Amp IS THE WINNER!',
      detail: '',
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
  for (const id of RACE_COURSE_IDS.filter((r) => raceCourse(r).kind !== 'quoins')) {
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

      // The recordings run from ~24 s (Lava Leap) to ~50 s (Crystal Climb) GO to posts.
      it('paces the rival for a 20-120 s race', () => {
        const ms = routeDurationMs(course.rivalRoute || course.route, { pace: course.rivalPace, gravity: course.gravity });
        assert.ok(ms > 20_000 && ms < 120_000, `${id} rival ${Math.round(ms)} ms`);
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

// What the recordings, their loading-screen panoramas and minimaps, and the
// config_prod.js start points pin down for each course (race-courses.js).
describe('course shapes from the recordings', () => {
  const dy = (id) => {
    const { player, rival } = raceCourse(id).spawn;
    return [Math.abs(player.x - rival.x), Math.abs(player.y - rival.y)];
  };

  it('starts the racers at the config start points: split heights where they differ', () => {
    // multiplayer_quest_locations start_points: [|dx|, |dy|].
    assert.deepEqual(dy('space_race'), [0, 145]);
    assert.deepEqual(dy('time_warp'), [0, 148]);
    assert.deepEqual(dy('star_sprint'), [160, 0]);
    const lava = dy('lava_leap');
    assert.ok(Math.abs(lava[0] - 81) <= 2 && Math.abs(lava[1] - 174) <= 6, String(lava));
    const canyon = dy('canyon_run');
    assert.ok(Math.abs(canyon[0] - 106) <= 2 && Math.abs(canyon[1] - 123) <= 6, String(canyon));
    // Crystal Climb (±655) and The Amazing Race (-575 / 591) mirror about the centre.
    for (const [id, off] of [['crystal_climb', 655], ['amazing_race', 575]]) {
      const c = raceCourse(id);
      assert.equal(c.spawn.player.x + c.rivalRoute[0].x, c.width, id);
      assert.ok(Math.abs(c.width / 2 - c.spawn.player.x - off) <= 60, `${id} ${c.spawn.player.x}`);
    }
  });

  it('builds Lava Leap from the loading-screen panorama: four mushroom pillars, the middle one short, a tall cliff', () => {
    const c = raceCourse('lava_leap');
    const pillars = c.platforms.filter((p) => p.style === 'pillar');
    assert.equal(pillars.length, 4);
    const tops = pillars.map((p) => p.y1);
    assert.ok(tops[1] > tops[0] + 100 && tops[1] > tops[2] + 100, `short middle pillar ${tops}`);
    const cliff = c.platforms.filter((p) => !p.floor).at(-1);
    assert.ok(c.finish.x > cliff.x1 && c.finish.x - cliff.x1 < 200, 'posts near the cliff edge');
    assert.ok(c.gravity < 0.8, 'leaps hang a third longer than a normal jump');
  });

  it('gives Crystal Climb the street map\'s shape: twice as tall as wide, posts top centre', () => {
    const c = raceCourse('crystal_climb');
    assert.ok(c.height / c.width > 1.8, `${c.width}x${c.height}`);
    assert.equal(c.finish.x, c.width / 2);
    assert.ok(c.finish.y < c.height * 0.12);
    assert.ok(c.walls.some((w) => w.style === 'glassLadder'));
  });

  it("makes Star Sprint's planet a trap: its door floor leads only down the rainbow slide", () => {
    const c = raceCourse('star_sprint');
    const slide = c.platforms.find((p) => p.style === 'rainbow');
    assert.ok(slide && slide.y2 - slide.y1 > 400, 'a long drop');
    const onRoute = (p) => c.route.some((n) => n.mode !== 'climb' && platformUnder([p], n.x, n.y));
    assert.ok(!onRoute(slide), 'the race line never takes the slide');
    assert.ok(c.props.some((p) => p.kind === 'planet' && p.slide === false));
  });

  it('climbs The Amazing Race out of the cave to the shared central pillar', () => {
    const c = raceCourse('amazing_race');
    const centre = c.walls.filter((w) => w.x === c.width / 2);
    assert.ok(centre.length >= 1, 'a climb up the central pillar');
    assert.equal(c.finish.x, c.width / 2);
    assert.equal(c.route.at(-1).mode, 'climb');
  });

  it('runs Time Warp through the statue pieces in the panorama order', () => {
    const order = raceCourse('time_warp').decor.map((d) => d.name).filter((n) => /^statue_/.test(n));
    assert.deepEqual(order, ['statue_foot_2', 'statue_head_1', 'statue_handpeace']);
  });
});

describe("Grab 'Em Good (quoin_grab)", () => {
  const race = RACES.grab_em_good;
  const course = raceCourse('grab_em_good');

  it('keeps the GSJS catalog: ticket, production street, start points, desc and splash', () => {
    assert.equal(race.title, "Grab 'Em Good");
    assert.equal(race.ticket, 'race_ticket_grab_em_good');
    assert.equal(race.ticketLabel, "Grab 'Em Good Ticket");
    assert.equal(race.ticketDesc, "Challenge another player to Grab 'Em Good.");
    assert.equal(race.productionTsid, 'LIF11MB3O8P1TAR');
    assert.equal(race.raceType, 'most_quoins');
    assert.equal(race.game, 'quoin_grab');
    assert.deepEqual(race.startPoints.map((p) => p.x), [-319, 356]);
    assert.equal(race.desc, 'Collect all the quoins. Whoever gets the most wins!');
    assert.equal(race.splash, 'Get the most quoins to win!');
    assert.equal(QUOIN_GRAB_SPLASH_TEXT, race.splash);
    assert.equal(raceForTicket('race_ticket_grab_em_good').id, 'grab_em_good');
    assert.ok(isQuoinGrab('grab_em_good'));
    assert.ok(!isQuoinGrab('space_race'));
    assert.ok(!RACE_IDS.includes('grab_em_good'), 'not one of the seven finish-line races');
    assert.ok(RACE_GAME_IDS.includes('grab_em_good'));
    assert.deepEqual(QUOIN_GRAB_ACHIEVEMENTS, { won: 'quoin_grab:won', lost: 'quoin_grab:lost' });
    assert.ok(RACE_STORE_ITEMS.some((row) => row.classTsid === race.ticket && row.cost === 60));
  });

  it('settles like quoin_grab_get_quoin: lead past the quoins left, or the last quoin', () => {
    assert.equal(quoinGrabTarget(71), 36);
    assert.equal(quoinGrabWinner({ you: 35, rival: 0 }, 71, 'you'), null, '35 of 71 can still be caught');
    assert.equal(quoinGrabWinner({ you: 36, rival: 0 }, 71, 'you'), 'you');
    assert.equal(quoinGrabWinner({ you: 20, rival: 23 }, 71, 'rival'), null);
    assert.equal(quoinGrabWinner({ you: 35, rival: 36 }, 71, 'rival'), 'rival');
    // Only the grabber can be named: a lead does not win on the other racer's grab.
    assert.equal(quoinGrabWinner({ you: 36, rival: 1 }, 71, 'rival'), null);
    // The last quoin ends it for whoever takes it.
    assert.equal(quoinGrabWinner({ you: 2, rival: 2 }, 4, 'rival'), 'rival');
  });

  it('scores one per grab, shows the overlay lines, and ends on the deciding grab', () => {
    const run = createRaceRun('grab_em_good', { now: 0, rival: { name: 'Amp', tint: 1 }, quoinTotal: 71 });
    assert.equal(run.kind, 'quoins');
    assert.equal(grabRaceQuoin(run, 'you', 1).ok, false, 'no grabs before GO');
    beginRaceCountdown(run, 0);
    tickRace(run, RACE_COUNTDOWN_MS);
    assert.equal(run.status, 'running');
    assert.deepEqual(tickRace(run, RACE_COUNTDOWN_MS + 3_600_000), [], 'the clock never ends a quoin game');
    for (let i = 0; i < 20; i += 1) grabRaceQuoin(run, 'rival', 5_000 + i);
    for (let i = 0; i < 35; i += 1) assert.equal(grabRaceQuoin(run, 'you', 6_000 + i).winner, null);
    assert.deepEqual(quoinGrabOverlayLines(run, 'Gomez'), ['Gomez: 35', 'Amp: 20', 'Remaining: 16']);
    const last = grabRaceQuoin(run, 'you', 9_000);
    assert.equal(last.winner, 'you');
    assert.equal(run.status, 'won');
    assert.equal(quoinGrabRemaining(run), 15);
    assert.equal(grabRaceQuoin(run, 'rival', 9_001).ok, false, 'nothing after the end');
    const settled = settleRace(run, {});
    assert.deepEqual(settled.reward, { currants: 100, xp: 50 });
    assert.equal(settled.record.wins.grab_em_good, 1);
    assert.equal(normalizeRaceRecord(settled.record).wins.grab_em_good, 1, 'the record keeps Grab \'Em Good');
  });

  it('pays the loser nothing', () => {
    const run = createRaceRun('grab_em_good', { now: 0, rival: { name: 'Amp', tint: 1 }, quoinTotal: 71 });
    beginRaceCountdown(run, 0);
    tickRace(run, RACE_COUNTDOWN_MS);
    for (let i = 0; i < 36; i += 1) grabRaceQuoin(run, 'rival', 5_000 + i);
    assert.equal(run.status, 'lost');
    const settled = settleRace(run, {});
    assert.deepEqual(settled.reward, RACE_LOSS_REWARD);
    assert.equal(settled.record.losses.grab_em_good, 1);
    assert.equal(raceResultCopy(run).title, 'Amp IS THE WINNER!');
  });

  it('pays mood quoins at benefit 10 times the quoin multiplier (the recording shows +11)', () => {
    assert.equal(quoinGrabMood(1), 10);
    assert.equal(quoinGrabMood(1.1), 11);
    assert.equal(quoinGrabMood(undefined), 10);
  });

  it('lays 71 quoins: 35 on each tree and one on the shared canopy', () => {
    assert.equal(course.kind, 'quoins');
    assert.equal(course.quoins.length, 71);
    const count = (owner) => course.quoins.filter((q) => q.owner === owner).length;
    assert.equal(count('you'), 35);
    assert.equal(count('rival'), 35);
    assert.equal(count('shared'), 1);
    assert.equal(count('you') + count('shared'), quoinGrabTarget(71), 'clearing your tree and the canopy settles it');
    // The two sides mirror each other across the middle.
    const mine = course.quoins.filter((q) => q.owner === 'you').map((q) => `${course.width - q.x},${q.y}`).sort();
    const theirs = course.quoins.filter((q) => q.owner === 'rival').map((q) => `${q.x},${q.y}`).sort();
    assert.deepEqual(mine, theirs);
  });

  it('starts both racers on the shared mound, mirrored like the config start points', () => {
    const { player, rival } = course.spawn;
    assert.equal(player.y, rival.y);
    assert.equal(player.x + rival.x, course.width, 'symmetric about the middle');
    assert.ok(Math.abs(course.width / 2 - player.x - 319) < 1);
    const solid = course.platforms.filter((p) => !p.hazard);
    assert.ok(platformUnder(solid, player.x, player.y) && platformUnder(solid, rival.x, rival.y));
  });

  it('keeps every surface and route stop inside the world and on solid ground', () => {
    const solid = course.platforms.filter((p) => !p.hazard);
    for (const p of course.platforms) {
      assert.ok(p.x1 >= 0 && p.x2 <= course.width, `${p.id} x ${p.x1}-${p.x2}`);
      assert.ok(p.y1 > 0 && p.y2 <= course.height, `${p.id} y ${p.y1}/${p.y2}`);
    }
    for (const node of [...course.route, ...course.rivalRoute]) {
      assert.ok(node.x >= 24 && node.x <= course.width - 24, `route x ${node.x}`);
      assert.ok(platformUnder(solid, node.x, node.y), `node ${node.mode} ${node.x},${node.y}`);
    }
  });

  it('only asks for jumps the avatar can make, both ways', () => {
    for (const route of [course.route, course.rivalRoute]) {
      for (let i = 1; i < route.length; i += 1) {
        const node = route[i];
        if (node.mode !== 'jump') continue;
        const from = route[i - 1];
        const rise = from.y - node.y;
        if (rise <= 0) continue; // hopping back down a bough
        assert.ok(canJump(node.x - from.x, rise, course.gravity), `jump ${i}: dx ${node.x - from.x}, rise ${rise}`);
      }
    }
  });

  it('puts every quoin where a racer can touch it: standing on a ledge or at the top of a jump', () => {
    // Avatar box ~100 px tall from the feet; a full jump lifts the feet 110 px and
    // carries it 60 px past a ledge edge on the way to the quoins between boughs.
    const solid = course.platforms.filter((p) => !p.hazard);
    for (const q of course.quoins) {
      const ok = solid.some((p) => {
        for (const dx of [-60, -30, 0, 30, 60]) {
          const top = Math.min(p.y1, p.y2);
          const x = q.x + dx;
          if (x < Math.min(p.x1, p.x2) || x > Math.max(p.x1, p.x2)) continue;
          const y = p.y1 + ((x - p.x1) / ((p.x2 - p.x1) || 1)) * (p.y2 - p.y1);
          if (q.y <= y + 10 && q.y >= y - 220 && top > 0) return true;
        }
        return false;
      });
      assert.ok(ok, `quoin ${q.x},${q.y} (${q.owner})`);
    }
  });

  it('routes each scripted racer through every quoin it is meant to take', () => {
    const S = course.route.length - 1;
    assert.equal(course.rivalRoute.length, 2 * S + 1, 'its own tree, then yours in reverse');
    const end = course.route[S];
    const summit = course.rivalRoute[S];
    assert.deepEqual([summit.x, summit.y], [end.x, end.y], 'both trees meet on the canopy');
    for (const q of course.quoins) {
      for (const [route, at] of [[course.route, q.at], [course.rivalRoute, q.rivalAt]]) {
        if (at == null) continue;
        assert.ok(at >= 0 && at <= route.length - 1, `index ${at}`);
        const a = route[Math.floor(at)];
        const b = route[Math.min(route.length - 1, Math.floor(at) + 1)];
        const u = at - Math.floor(at);
        const x = a.x + (b.x - a.x) * u;
        const y = a.y + (b.y - a.y) * u;
        assert.ok(Math.abs(x - q.x) < 80 && Math.abs(y - q.y) < 140, `quoin ${q.x},${q.y} vs route ${Math.round(x)},${Math.round(y)}`);
      }
    }
    assert.ok(course.quoins.every((q) => q.rivalAt != null), 'the rival can reach every quoin');
  });

  it('paces the rival so a clean climb wins', () => {
    const own = routeDurationMs(course.rivalRoute.slice(0, course.route.length), { pace: course.rivalPace, gravity: course.gravity });
    assert.ok(own > 35_000 && own < 90_000, `rival's own tree ${Math.round(own)} ms`);
    const best = routeDurationMs(course.route, { pace: 1, gravity: course.gravity });
    assert.ok(best < own * 0.8, 'a clean run clears your tree well before the rival clears its own');
  });

  it('ships the ticket art and only recovered decos', () => {
    assert.ok(existsSync(join(root, 'assets/sprites/races/race_ticket_grab_em_good.png')));
    for (const d of course.decor) assert.ok(existsSync(join(root, 'assets/decos/groddle', `${d.name}.webp`)), d.name);
  });
});
