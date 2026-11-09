/**
 * Ticket 41: Join the Club accepted from the Butler, then Back to Ur. The room waited for you to
 * leave home (busy() is always true there), started in the frame between leaving and the street's
 * load, and the street drew over it: the clubhouse intro on the street, the camera under it,
 * travel refused, and the five-minute clock failed the quest.
 *
 * The fix follows the source: join_club.js onStarted 96-117 instanced you 0.1 s after accepting
 * (quest_scripting.js questInstanceLocation 26-46), at home too, the exit signpost brought you
 * back where you entered (main.js 1070-1082, instances_get_exit), and the 5 * 60 was the "Are you
 * stuck?" prompt (inc_instances.js 317-357), not a deadline.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { questSceneTsid, wayBackFrom } from '../public/js/quest-instance.js?v=f0df88c3';
import * as club from '../public/js/quest-rooms/clubhouse.js?v=46311571';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, 'public', p), 'utf8');
const GSJS = join(root, '../glitch-GameServerJS');
const between = (src, from, to) => {
  const a = src.indexOf(from);
  assert.ok(a >= 0, `missing ${from}`);
  const b = src.indexOf(to, a + from.length);
  return src.slice(a, b < 0 ? undefined : b);
};

/** A clubhouse ctx with the parts the prompt and the intro read. */
function fakeCtx({ inScene = true, stage = 'clubhouse', answers = [] } = {}) {
  const asked = [];
  const left = [];
  const ctx = {
    data: {},
    stage,
    engine: { inScene: () => inScene },
    param: () => null,
    fx: () => false,
    dialogOpen: () => false,
    cardOpen: () => false,
    prompt(opts) {
      asked.push(opts);
      return Promise.resolve(answers.shift() ?? null);
    },
    leave: (opts) => left.push(opts),
  };
  return { ctx, asked, left };
}

describe('Ticket 41: Join the Club starts at home and comes back there', () => {
  it('saves the place you entered from as the way back, home included', () => {
    assert.deepEqual(wayBackFrom({ tsid: 'RH_HOME_EXT', x: 960.4, y: 870 }), { tsid: 'RH_HOME_EXT', x: 960, y: 870 });
    assert.deepEqual(wayBackFrom({ tsid: 'RH_HOME_INT', x: 1030, y: 640 }), { tsid: 'RH_HOME_INT', x: 1030, y: 640 });
    assert.deepEqual(wayBackFrom({ tsid: 'GLI2V0UN7RD1T2J', x: 1121, y: 918 }), { tsid: 'GLI2V0UN7RD1T2J', x: 1121, y: 918 });
    // From inside another room: that run's way back; never a quest scene.
    const saved = { tsid: 'GLI2V0UN7RD1T2J', x: 10, y: 20 };
    assert.deepEqual(wayBackFrom({ tsid: questSceneTsid('clubhouse', 'pintura'), x: 1, y: 2 }, saved), saved);
    assert.equal(wayBackFrom({ tsid: questSceneTsid('clubhouse', 'clubhouse') }, null), null);
    assert.equal(wayBackFrom(null, null), null);
  });

  it('starts an accepted room at home, but never during a trip', () => {
    const qi = read('js/features/quest-instances-feature.js');
    const start = between(qi, 'function maybeStartAccepted(engine, now) {', 'function maybeOfferRetry');
    assert.match(start, /engine\.busy\(\{ ignoreHome: true \}\)/);
    assert.doesNotMatch(start, /engine\.busy\(\)/);
    assert.match(start, /homeEditMode/);
    const startInstance = between(qi, 'async function startInstance(engine, questId, opts = {}) {', 'async function gotoStage');
    assert.match(startInstance, /const returnTo = wayBackFrom\(\{ tsid: engine\.streetTsid, x: engine\.player\?\.x, y: engine\.player\?\.y \}, save\.returnTo\);/);
    assert.doesNotMatch(startInstance, /homeContext/);
    // Leaving a solved room goes back home with the home card.
    assert.match(qi, /const home = back\?\.tsid === HOME_STREET_TSID \|\| back\?\.tsid === HOME_INTERIOR_TSID;/);
  });

  it('counts a street trip as busy from its first step to the street load', () => {
    const game = read('game.js');
    const busy = between(game, '  busy({ ignoreHome = false, ignoreInstance = false } = {}) {', '  /** A verb in progress or the verb menu open');
    assert.match(busy, /streetTrips > 0 \|\|/);
    // ignoreHome does not skip a trip.
    assert.doesNotMatch(busy, /ignoreHome[^\n]*streetTrips/);
    assert.match(game, /async function onStreetTrip\(work\) \{\s*streetTrips \+= 1;\s*try \{\s*return await work\(\);\s*\} finally \{\s*streetTrips -= 1;/);
    assert.match(game, /async function enterStreetWithTransition\(tsid, opts = \{\}\) \{\s*return onStreetTrip\(\(\) => streetTripTo\(tsid, opts\)\);\s*\}/);
    // Back to Ur is busy before endHomeVisit stops counting you as home.
    const back = between(game, 'async function returnFromHome() {', 'async function returnFromHomeTrip()');
    assert.match(back, /return onStreetTrip\(\(\) => returnFromHomeTrip\(\)\);/);
    assert.doesNotMatch(back, /endHomeVisit\(/);
    assert.match(between(game, 'async function returnFromHomeTrip() {', 'function handleHomeTarget'), /const result = endHomeVisit\(homeState\);/);
  });

  it('remembers a hub with no map instead of fetching the index on every trip from home', () => {
    const game = read('game.js');
    const hub = between(game, 'async function resolveHubColors(hubId) {', '/** Official archived art first');
    assert.match(hub, /if \(!hubMeta\?\.file\) \{\s*\/\/[^\n]*\n[^\n]*\n\s*hubColorCache\[id\] = \{\};\s*return \{ top: null, bottom: null \};/);
    // A failed fetch is not cached (it may work next time).
    assert.match(hub, /catch \{\s*return \{ top: null, bottom: null \};\s*\}/);
  });

  it('keeps the saved street when a room starts from home', () => {
    const game = read('game.js');
    const scene = between(game, '  enterScene(scene) {', '  playEmotion(');
    assert.match(scene, /scene\.returnTo\.tsid !== HOME_STREET_TSID && scene\.returnTo\.tsid !== HOME_INTERIOR_TSID\) savePlayerLocation\(scene\.returnTo\)/);
  });

  it('ends a run whose scene a street replaced, without failing the quest', () => {
    const qi = read('js/features/quest-instances-feature.js');
    const build = between(qi, 'async function buildStage(engine, stage) {', 'async function startInstance');
    assert.match(build, /ctx\.data\._sceneTsid = questSceneTsid\(room\.id, stage\);/);
    assert.match(build, /delete ctx\.data\._sceneTsid;/);
    const enter = between(qi, '  onStreetEnter(street, engine) {', '  onStreetClear(engine) {');
    assert.match(enter, /if \(run && ctx && !entering && !ctx\.data\._awaitStreet && ctx\.data\._sceneTsid && street\?\.tsid !== ctx\.data\._sceneTsid\) \{[\s\S]*?dropReplacedRun\(engine\);/);
    const drop = between(qi, 'function dropReplacedRun(engine) {', 'async function leaveInstance');
    assert.doesNotMatch(drop, /failQuest|engine\.enter\(/);
    assert.match(drop, /delete save\.memory\[questId\]\.started;/);
    assert.match(drop, /room\?\.clear\?\.\(ctx\);/);
    assert.match(drop, /engine\.instanceHold = null;/);
  });
});

describe('Ticket 41: the clubhouse intro and camera stay in the clubhouse', () => {
  it('runs the intro lines and the pan only in the clubhouse scene', () => {
    assert.equal(club.inClub(fakeCtx().ctx), true);
    assert.equal(club.inClub(fakeCtx({ inScene: false }).ctx), false);
    assert.equal(club.inClub(fakeCtx({ stage: 'pintura' }).ctx), false);
    const src = readFileSync(join(root, 'public/js/quest-rooms/clubhouse.js'), 'utf8');
    assert.match(between(src, 'async function intro(ctx) {', 'const PAN_MS'), /if \(ctx\.data\.left \|\| !inClub\(ctx\)\) return;/);
    assert.match(between(src, 'function stepPan(ctx) {', 'function enterClub'), /if \(!pan \|\| !inClub\(ctx\)\) return;/);
  });

  it('never holds the avatar still off the clubhouse scene', () => {
    const on = fakeCtx().ctx;
    on.data.phase = 'intro';
    assert.deepEqual(club.room.physics(on), { speed: 0, jump: 0 });
    const off = fakeCtx({ inScene: false }).ctx;
    off.data.phase = 'intro';
    assert.equal(club.room.physics(off), null);
  });
});

describe('Ticket 41: the 5 * 60 is "Are you stuck?", not a deadline', () => {
  it('has no clock', () => {
    assert.equal(club.room.durationMs, 0);
    assert.equal(club.EXIT_PROMPT_MS, 5 * 60 * 1000);
    assert.equal(club.PROMPT_AGAIN_MS, 2 * 60 * 1000);
    assert.equal(club.STUCK_TEXT, 'Are you stuck? Do you want to leave this place?');
    const src = readFileSync(join(root, 'public/js/quest-rooms/clubhouse.js'), 'utf8');
    assert.doesNotMatch(src, /ctx\.extend\(|ROOM_MS/);
  });

  it('asks after the delay, not during the intro, and asks again two minutes after No thanks', async () => {
    const { ctx, asked, left } = fakeCtx({ answers: ['no', 'yes'] });
    const t0 = 1_000_000;
    ctx.data.promptAt = t0 + club.EXIT_PROMPT_MS;
    ctx.data.phase = 'puzzle';
    assert.equal(club.maybePromptStuck(ctx, t0 + club.EXIT_PROMPT_MS - 1), false);
    ctx.data.phase = 'intro';
    assert.equal(club.maybePromptStuck(ctx, t0 + club.EXIT_PROMPT_MS), false);
    ctx.data.phase = 'puzzle';
    assert.equal(club.maybePromptStuck(ctx, t0 + club.EXIT_PROMPT_MS), true);
    assert.equal(asked.length, 1);
    assert.equal(asked[0].text, club.STUCK_TEXT);
    assert.equal(asked[0].iconButtons, true);
    assert.deepEqual(asked[0].choices.map((c) => c.label), ['Yes, please', 'No thanks']);
    // One prompt at a time.
    assert.equal(club.maybePromptStuck(ctx, t0 + club.EXIT_PROMPT_MS + 10), false);
    await new Promise((r) => setImmediate(r));
    // No thanks: again in two minutes, nobody leaves.
    assert.equal(left.length, 0);
    assert.ok(Math.abs(ctx.data.promptAt - (Date.now() + club.PROMPT_AGAIN_MS)) < 1000);
    assert.equal(club.maybePromptStuck(ctx, ctx.data.promptAt), true);
    await new Promise((r) => setImmediate(r));
    // Yes, please: leave (onExitLocation fails the unfinished quest).
    assert.equal(left.length, 1);
  });

  it('does not ask once you are through the signpost', () => {
    const { ctx, asked } = fakeCtx();
    ctx.data.promptAt = 1;
    ctx.data.phase = 'done';
    assert.equal(club.maybePromptStuck(ctx, 10), false);
    assert.equal(asked.length, 0);
  });

  it('matches the source', { skip: !existsSync(GSJS) }, () => {
    const quest = readFileSync(join(GSJS, 'quests/join_club.js'), 'utf8');
    assert.match(quest, /questInstanceLocation\(pc, location_id, marker\.x, marker\.y, 5\*60,/);
    const scripting = readFileSync(join(GSJS, 'quests/quest_scripting.js'), 'utf8');
    assert.match(scripting, /callback: 'instances_create_delayed'[^\n]*exit_delay: exit_delay[^\n]*\}, 0\.1\);/);
    const inst = readFileSync(join(GSJS, 'players/inc_instances.js'), 'utf8');
    assert.match(inst, /this\.instances_schedule_exit_prompt\(details\.instance_id, details\.exit_delay\);/);
    assert.match(inst, /txt\s*: 'Are you stuck\? Do you want to leave this place\?'/);
    assert.match(inst, /\{ value : 'yes', label : 'Yes, please' \}/);
    assert.match(inst, /\{ value : 'no', label : 'No thanks' \}/);
    assert.match(inst, /this\.instances_schedule_exit_prompt\(details\.instance_id, 2\*60\);/);
  });
});
