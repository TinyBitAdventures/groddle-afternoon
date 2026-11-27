/**
 * Austin 2026-11-27 (Glitch's prompt, no timer): the places that sent you back when a clock ran out
 * ("Your four minutes in Cloud Rings came to an end", "The summer memory faded", ...) had no time
 * limit in Glitch. Each was an instance entered with an exit_delay, and instances_create_delayed
 * (players/inc_instances.js 377-386) turned that into instances_schedule_exit_prompt: at the delay,
 * "Are you stuck? Do you want to leave this place?" (322-344: icon buttons, no timeout, a dead
 * player asked 60 s later), Yes, please leaves by instances_left, No thanks asks again two minutes
 * later (346-357). The delays:
 *  - the 13 Ticket to Paradise courses: paradise_ticket*.js launchInstance 296, 4*60
 *  - A Summer's Day: blue_and_white_part1.js 107 / part2 112, 5*60; its Annex part2 70, 2*60
 *  - The Greedy Street Spirit's Storyland: greedy_street_spirit.js 168 / _reminisce.js 125, 5*60
 *  - Winter Walk (both): winter_walk.js 110 / winter_walk_part2.js 103, 5*60
 *  - Eesti (De-Embiggenify): de_embiggenify.js 43, 2*60, again on part 2's onAccepted 66-69 and
 *    when the shiny object is found (location.js 1200-1202)
 *  - Rooks' Woods (humbaba): rook_egg_smash.js 79, 2*60
 *
 * Each place's frame function in game.js is run here as it is written, in a scope where the place
 * is the one you stand in, its own module is real and everything else is a stand-in: at the delay
 * the prompt shows and nobody is sent away; Yes, please leaves the way the place's Leave does; No
 * thanks asks again two minutes later.
 * Run: node --test tests/timed-places-stuck-prompt.test.js
 */
import { describe, it, before, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createStuckAsker } from '../public/js/stuck-prompt.js?v=35415987';
import * as paradise from '../public/js/paradise-flight.js?v=4d77a43d';
import * as summers from '../public/js/summers-day.js?v=86a3142d';
import * as greedy from '../public/js/greedy-street-spirit.js?v=b0ce2437';
import * as winter from '../public/js/winter-walk.js?v=faad1d46';
import * as eesti from '../public/js/de-embiggenify.js?v=e4e87b16';
import * as rook from '../public/js/rook-woods.js?v=73edf194';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const GAME = readFileSync(join(ROOT, 'public/game.js'), 'utf8');
const MIN = 60 * 1000;
const T0 = 9_000_000;

function fn(name) {
  const start = GAME.indexOf(`function ${name}(`);
  assert.ok(start > 0, name);
  return GAME.slice(start, GAME.indexOf('\n}\n', start) + 2);
}

/** Anything game.js reaches for that the test does not name: takes any property, call or number. */
function stub() {
  const t = function () {};
  return new Proxy(t, {
    get(o, k) {
      if (k === 'then') return undefined;
      if (k === Symbol.toPrimitive) return () => 0;
      if (k === Symbol.iterator) return function* () {};
      if (typeof k === 'symbol') return o[k];
      if (!(k in o)) o[k] = stub();
      return o[k];
    },
    set(o, k, v) {
      o[k] = v;
      return true;
    },
    apply: () => stub(),
    construct: () => stub(),
  });
}

const REAL = new Set(['Date', 'Math', 'Number', 'String', 'Object', 'Array', 'JSON', 'Boolean', 'Set', 'Map', 'URLSearchParams', 'Infinity', 'NaN', 'undefined', 'isFinite', 'parseInt', 'parseFloat', 'console', 'Symbol', 'Promise', 'Error']);

/**
 * The places: the state game.js keeps, the frame function, the way out, the prompt's key and
 * Glitch's delay, the start that arms it, and what Yes, please must do.
 */
const PLACES = [
  {
    name: 'Paradise (Cloud Rings, one of the 13 courses)', key: 'paradise', mod: paradise, ms: 4 * MIN, constant: 'PARADISE_EXIT_PROMPT_MS',
    stateVar: 'paradiseRun', make: () => paradise.createParadiseRun('cloud_rings', { now: Date.now() }),
    update: 'updateParadiseFlight', here: 'paradiseIsInstanced', busy: 'paradiseTransitionBusy', leave: 'returnFromParadise',
    start: 'startParadiseFlight', yes: { abandon: true },
  },
  {
    name: "A Summer's Day (Blue and White)", key: 'summers-day', mod: summers, ms: 5 * MIN, constant: 'SUMMERS_DAY_EXIT_PROMPT_MS',
    stateVar: 'summersDayRun', make: () => summers.createSummersDayRun({ now: Date.now() }),
    update: 'updateSummersDay', here: 'summersDayIsInstanced', busy: 'summersDayTransitionBusy', leave: 'returnFromSummersDay',
    start: 'startSummersDay', yes: { abandon: true },
  },
  {
    name: "A Summer's Day's Annex (the bonus room)", key: 'summers-day', mod: summers, ms: 2 * MIN, constant: 'SUMMERS_DAY_BONUS_EXIT_PROMPT_MS',
    stateVar: 'summersDayRun',
    make: () => {
      const run = summers.createSummersDayRun({ now: Date.now() });
      run.checkpoints.push('exit');
      summers.enterSummersDayBonus(run, Date.now());
      return run;
    },
    update: 'updateSummersDay', here: 'summersDayIsInstanced', busy: 'summersDayTransitionBusy', leave: 'returnFromSummersDay',
    start: 'enterSummersDayAnnex', yes: { abandon: true },
  },
  {
    name: 'The Greedy Street Spirit (Storyland)', key: 'storyland', mod: greedy, ms: 5 * MIN, constant: 'GREEDY_STREET_EXIT_PROMPT_MS',
    stateVar: 'greedyStreetState', make: () => greedy.createGreedyStreetSpiritState({ enteredAt: Date.now() }),
    update: 'updateGreedyStreetSpirit', here: 'greedyStreetIsInstanced', busy: 'greedyStreetTransitionBusy', leave: 'returnFromGreedyStreetSpirit',
    start: 'startGreedyStreetSpirit', yes: { abandon: true },
  },
  {
    name: 'Winter Walk (and its reminisce)', key: 'winter-walk', mod: winter, ms: 5 * MIN, constant: 'WINTER_WALK_EXIT_PROMPT_MS',
    stateVar: 'winterWalkState', make: () => winter.createWinterWalkState({ now: Date.now() }),
    update: 'updateWinterWalk', here: 'winterWalkIsInstanced', busy: 'winterWalkTransitionBusy', leave: 'returnFromWinterWalk',
    start: 'startWinterWalk', yes: { abandon: true },
  },
  {
    name: 'Eesti Life Catalogue Page 17 (De-Embiggenify)', key: 'de-embiggenify', mod: eesti, ms: 2 * MIN, constant: 'EESTI_EXIT_PROMPT_MS',
    stateVar: 'deEmbiggenifyState',
    make: () => {
      const s = eesti.createDeEmbiggenifyState({ enteredAt: Date.now() });
      eesti.beginDeEmbiggenifySearch(s, Date.now());
      return s;
    },
    update: 'updateDeEmbiggenify', here: 'deEmbiggenifyIsInstanced', busy: 'deEmbiggenifyTransitionBusy', leave: 'returnFromDeEmbiggenify',
    start: 'openMrHairballRequest', yes: { abandon: true },
  },
  {
    name: "Rooks' Woods (humbaba)", key: 'rook-woods', mod: rook, ms: 2 * MIN, constant: 'ROOK_WOODS_EXIT_PROMPT_MS',
    stateVar: 'rookWoodsState',
    make: () => {
      const s = rook.createRookWoodsState();
      rook.beginRookWoods(s, Date.now());
      return s;
    },
    update: 'updateRookWoods', here: 'rookWoodsIsInstanced', busy: 'rookWoodsTransitionBusy', leave: 'returnFromRookWoods',
    start: 'startRookWoodsQuest', yes: { abandon: true },
  },
];

/** The place's frame function, run in a scope where you stand in the place. */
function rig(place) {
  const host = {
    prompts: [],
    removed: [],
    dead: false,
    prompt(o) {
      host.prompts.push(o);
      return `p${host.prompts.length}`;
    },
    removePrompt(uid) {
      host.removed.push(uid);
    },
    isDead: () => host.dead,
    busy: () => false,
    setData() {},
    param: () => null,
  };
  const left = [];
  const asker = createStuckAsker();
  const vars = {
    ...place.mod,
    [place.stateVar]: place.make(),
    [place.here]: () => true,
    [place.busy]: false,
    [place.leave]: (opts) => {
      left.push(opts ?? {});
      return Promise.resolve(true);
    },
    roomStuck: asker,
    roomStuckHost: () => host,
    location: { search: '' },
    setTimeout: (f) => f(),
    app: undefined,
    player: stub(),
  };
  const scope = new Proxy(vars, {
    has: (o, k) => typeof k === 'string' && !REAL.has(k),
    get: (o, k) => (k === Symbol.unscopables ? undefined : k in o ? o[k] : (o[k] = stub())),
    set: (o, k, v) => {
      o[k] = v;
      return true;
    },
  });
  // eslint-disable-next-line no-new-func
  const frame = new Function('scope', `with (scope) { return (${fn(place.update)}); }`)(scope);
  // The start arms the prompt (the source check below holds it to this line).
  const delay = Number(place.mod[place.constant]) || place.ms;
  return {
    host,
    left,
    asker,
    scope: vars,
    arm: () => asker.arm(place.key, delay, host),
    tick: (ms) => {
      mock.timers.tick(ms);
      frame(1);
    },
  };
}

describe('the timed places ask "Are you stuck?" and never send you away on a clock', () => {
  before(() => mock.timers.enable({ apis: ['Date'], now: T0 }));
  after(() => mock.timers.reset());

  for (const place of PLACES) {
    it(`${place.name}: asked at ${place.ms / MIN} minutes, nobody sent away; No asks again 2 minutes later; Yes leaves as Leave does`, () => {
      mock.timers.setTime(T0);
      const r = rig(place);
      r.arm();
      r.tick(place.ms - 1);
      assert.equal(r.host.prompts.length, 0, 'not before the delay');
      r.tick(1);
      assert.deepEqual(r.left, [], 'nobody is sent away at the delay');
      assert.equal(r.host.prompts.length, 1, 'the prompt shows');
      const p = r.host.prompts[0];
      assert.equal(p.text, 'Are you stuck? Do you want to leave this place?');
      assert.equal(p.iconButtons, true);
      assert.deepEqual(p.choices.map((c) => [c.value, c.label]), [['yes', 'Yes, please'], ['no', 'No thanks']]);
      // Left open for half an hour: still asked once, still here.
      r.tick(30 * MIN);
      assert.equal(r.host.prompts.length, 1);
      assert.deepEqual(r.left, []);
      p.onChoice('no');
      r.tick(2 * MIN - 1);
      assert.equal(r.host.prompts.length, 1, 'No thanks: not again yet');
      r.tick(1);
      assert.equal(r.host.prompts.length, 2, 'No thanks: asked again two minutes later');
      assert.deepEqual(r.left, []);
      r.host.prompts[1].onChoice('yes');
      assert.deepEqual(r.left, [place.yes], 'Yes, please: out the way Leave goes');
      r.tick(60 * MIN);
      assert.equal(r.host.prompts.length, 2, 'never asked again');
      assert.equal(r.left.length, 1);
    });
  }

  it("Rooks' Woods: a completed quest takes the prompt away, as Glitch's quest end did (inc_quests.js 747)", () => {
    mock.timers.setTime(T0);
    const place = PLACES.find((p) => p.key === 'rook-woods');
    const r = rig(place);
    r.arm();
    r.tick(place.ms - 1);
    r.scope[place.stateVar].status = 'complete';
    r.tick(1);
    assert.equal(r.host.prompts.length, 0, 'not asked over the Quest complete card');
    r.tick(60 * MIN);
    assert.equal(r.host.prompts.length, 0, 'never asked again');
    assert.deepEqual(r.left, [], 'nobody sent away: Leave is the way out');
  });

  it('dead when it is due: asked a minute later (instances_show_exit_prompt 323)', () => {
    mock.timers.setTime(T0);
    const r = rig(PLACES[0]);
    r.arm();
    r.host.dead = true;
    r.tick(4 * MIN);
    assert.equal(r.host.prompts.length, 0);
    r.host.dead = false;
    r.tick(MIN - 1);
    assert.equal(r.host.prompts.length, 0);
    r.tick(1);
    assert.equal(r.host.prompts.length, 1);
  });
});

describe('game.js arms, asks and takes the prompt away in each place', () => {
  it('each start arms its own key with Glitch’s delay; each way out takes it away', () => {
    const outs = new Set();
    for (const place of PLACES) {
      assert.equal(place.mod[place.constant], place.ms, place.constant);
      assert.match(fn(place.start), new RegExp(`roomStuck\\.arm\\('${place.key}', ${place.constant}, roomStuckHost\\(\\)\\);`), place.start);
      if (outs.has(place.leave)) continue;
      outs.add(place.leave);
      assert.match(fn(place.leave), new RegExp(`roomStuck\\.cancel\\('${place.key}', roomStuckHost\\(\\)\\);`), place.leave);
    }
    // Eesti's prompt starts over on finding the object (location.js 1200-1202) and on entering.
    assert.match(fn('pickUpSmallWorthless'), /roomStuck\.arm\('de-embiggenify', EESTI_EXIT_PROMPT_MS, roomStuckHost\(\)\);/);
    assert.match(fn('startDeEmbiggenify'), /roomStuck\.arm\('de-embiggenify', EESTI_EXIT_PROMPT_MS, roomStuckHost\(\)\);/);
  });

  it('the frame asks before its early return, and Yes, please keeps a finished run’s own way home', () => {
    for (const place of PLACES) {
      const body = fn(place.update);
      assert.ok(body.indexOf('roomStuck.tick') > 0 && body.indexOf('roomStuck.tick') < body.indexOf(`if (!${place.here}()`), place.update);
      assert.match(body, new RegExp(`here: ${place.here}\\(\\)( && [^,]+)?,\\s*moving: ${place.busy},`), place.update);
    }
    assert.match(fn('updateParadiseFlight'), /returnFromParadise\(\{ abandon: paradiseRun\?\.status !== 'complete' \}\)/);
    assert.match(fn('updateGreedyStreetSpirit'), /returnFromGreedyStreetSpirit\(\{ abandon: greedyStreetState\?\.status !== 'ready' \}\)/);
    assert.match(fn('updateRookWoods'), /returnFromRookWoods\(\{ abandon: rookWoodsState\?\.status !== 'complete' \}\)/);
  });

  it('the clocks and their lines are gone', () => {
    for (const line of ['came to an end', 'four minutes in Paradise are up', 'summer memory faded', 'Storyland faded', 'winter path faded', 'Winter Walk timer ran out', "Rooks' Woods timer ran out", "The Rooks' Woods closed", 'catalogue page closes', 'Five minutes.', 'Two minutes.', 'Two minutes in the Annex']) {
      assert.ok(!GAME.includes(line), line);
    }
    for (const mod of [paradise, summers, greedy, winter, eesti, rook]) {
      for (const name of Object.keys(mod)) assert.doesNotMatch(name, /DURATION_MS$|RemainingMs$|^expire/, name);
    }
    const html = readFileSync(join(ROOT, 'public/play/index.html'), 'utf8');
    for (const k of ['paradise', 'summer', 'greedy', 'winter', 'eesti', 'rook']) assert.ok(!html.includes(`data-${k}-timer`), `${k}: no countdown on the card`);
  });
});
