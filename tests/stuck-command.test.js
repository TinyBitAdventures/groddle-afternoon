/**
 * /stuck (Austin 2026-11-01): back to where you arrived on this street, once
 * every 5 minutes. The remake's own command (the source had none: a stuck
 * player asked a guide). Rules: js/slash-commands.js; the move:
 * features/slash-commands-feature.js and game.js engine.stuckReturn.
 */
import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PLAYER_COMMANDS, REMAKE_COMMANDS, SLASH_TEXT, STUCK_COOLDOWN_MS, STUCK_TEXT, slashPlan } from '../public/js/slash-commands.js?v=8533e143';
import { slashCommandsFeature } from '../public/js/features/slash-commands-feature.js?v=e967e1ca';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const game = readFileSync(join(root, 'public/game.js'), 'utf8');
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const AWAY = { owned: true, inHome: false, room: 'street' };

function fakeEngine(over = {}) {
  const data = {};
  const log = [];
  const moves = [];
  return {
    data,
    log,
    moves,
    player: { x: 900, y: 400 },
    setData: (k, v) => { data[k] = v; },
    pushActivity: (t) => log.push(t),
    toast: () => {},
    save: () => {},
    homeContext: () => AWAY,
    whoIsHere: () => ['Ur'],
    acting: () => false,
    transientInstance: () => false,
    stuckReturn: () => { moves.push('arrival'); return { ok: true, x: 300, y: 682, from: 'arrival' }; },
    refreshHomeScene: async (opts) => { moves.push(`home:${opts.arrive}`); return true; },
    ...over,
  };
}

afterEach(() => {
  slashCommandsFeature._reset();
  slashCommandsFeature._setClock(null);
});

describe('/stuck rules (js/slash-commands.js)', () => {
  it('is listed in the slash-command help as the remake\'s own, not as a source command', () => {
    assert.ok(REMAKE_COMMANDS['/stuck']);
    assert.ok(!PLAYER_COMMANDS.includes('/stuck'));
    const feature = readFileSync(join(root, 'public/js/features/slash-commands-feature.js'), 'utf8');
    assert.match(feature, /\* - \/stuck \(the remake's own/);
  });

  it('goes to the arrival out in the world and to the door at home', () => {
    assert.deepEqual(slashPlan('/stuck', { home: AWAY }), { command: '/stuck', stuck: 'arrival' });
    assert.deepEqual(slashPlan('/stuck', { home: { owned: true, inHome: true, room: 'interior' } }), { command: '/stuck', stuck: 'home-door' });
    assert.deepEqual(slashPlan('/stuck', { home: { owned: true, inHome: true, room: 'street' } }), { command: '/stuck', stuck: 'home-door' });
    assert.deepEqual(slashPlan('/stuck', { home: { owned: true, inHome: true, room: 'interior' }, onTowerFloor: true }), { command: '/stuck', stuck: 'tower-door' });
  });

  it('refuses in a race, a timed quest room or a Paradise course (Leave), dead in Hell (the grapes), or busy', () => {
    assert.equal(slashPlan('/stuck', { home: AWAY, instance: true }).say, STUCK_TEXT.leave);
    assert.match(STUCK_TEXT.leave, /Use Leave/);
    assert.equal(slashPlan('/stuck', { home: AWAY, dead: true }).say, STUCK_TEXT.dead);
    assert.match(STUCK_TEXT.dead, /Hellish Grapes/);
    assert.equal(slashPlan('/stuck', { home: AWAY, busy: true }).say, SLASH_TEXT.busy);
  });

  it('says how long the cooldown has left', () => {
    assert.equal(slashPlan('/stuck', { home: AWAY, stuckWaitMs: STUCK_COOLDOWN_MS }).say, 'You can use /stuck again in 5 minutes.');
    assert.equal(slashPlan('/stuck', { home: AWAY, stuckWaitMs: 61000 }).say, 'You can use /stuck again in 2 minutes.');
    assert.equal(slashPlan('/stuck', { home: AWAY, stuckWaitMs: 59000 }).say, 'You can use /stuck again in 59 seconds.');
    assert.equal(slashPlan('/stuck', { home: AWAY, stuckWaitMs: 400 }).say, 'You can use /stuck again in 1 second.');
    assert.equal(STUCK_COOLDOWN_MS, 5 * 60 * 1000);
  });

  it('its words have no em dashes and never name the old game', () => {
    for (const line of [STUCK_TEXT.done, STUCK_TEXT.doneHome, STUCK_TEXT.leave, STUCK_TEXT.dead, STUCK_TEXT.wait(1000), REMAKE_COMMANDS['/stuck']]) {
      assert.doesNotMatch(line, /—|Glitch/);
    }
  });
});

describe('/stuck in the game (features/slash-commands-feature.js)', () => {
  it('moves you back, says so in the activity log, and starts the 5 minute cooldown', async () => {
    let t = 1_000_000;
    slashCommandsFeature._setClock(() => t);
    const engine = fakeEngine();
    assert.equal(slashCommandsFeature.chatCommand('/stuck', engine), true);
    await flush();
    assert.deepEqual(engine.moves, ['arrival']);
    assert.deepEqual(engine.log, [STUCK_TEXT.done]);
    assert.equal(engine.data.slashLast, '/stuck:arrival');
    t += 60_000;
    slashCommandsFeature.chatCommand('/stuck', engine);
    await flush();
    assert.deepEqual(engine.moves, ['arrival'], 'refused inside the cooldown');
    assert.equal(engine.log.at(-1), 'You can use /stuck again in 4 minutes.');
    t += 4 * 60_000;
    slashCommandsFeature.chatCommand('/stuck', engine);
    await flush();
    assert.deepEqual(engine.moves, ['arrival', 'arrival']);
  });

  it('the cooldown is saved: a reload does not reset it', async () => {
    let t = 5_000_000;
    slashCommandsFeature._setClock(() => t);
    slashCommandsFeature.chatCommand('/stuck', fakeEngine());
    await flush();
    const saved = JSON.parse(JSON.stringify(slashCommandsFeature.save()));
    assert.equal(saved.stuckAt, t);
    slashCommandsFeature._reset();
    slashCommandsFeature.restore(saved);
    t += 30_000;
    const engine = fakeEngine();
    slashCommandsFeature.chatCommand('/stuck', engine);
    await flush();
    assert.deepEqual(engine.moves, []);
    assert.equal(engine.log[0], 'You can use /stuck again in 5 minutes.');
  });

  it('a refusal or a failed move does not spend the cooldown', async () => {
    const dead = fakeEngine({ transientInstance: () => true });
    slashCommandsFeature.chatCommand('/stuck', dead);
    await flush();
    assert.deepEqual(dead.log, [STUCK_TEXT.leave]);
    const lost = fakeEngine({ stuckReturn: () => ({ ok: false, reason: 'no_arrival' }) });
    slashCommandsFeature.chatCommand('/stuck', lost);
    await flush();
    assert.equal(lost.data.slashLast, '/stuck:failed:no_arrival');
    assert.equal(slashCommandsFeature._state().stuckAt, 0);
  });

  it('at home it goes to the door', async () => {
    const engine = fakeEngine({ homeContext: () => ({ owned: true, inHome: true, room: 'interior' }) });
    slashCommandsFeature.chatCommand('/stuck', engine);
    await flush();
    assert.deepEqual(engine.moves, ['home:door']);
    assert.deepEqual(engine.log, [STUCK_TEXT.doneHome]);
  });
});

describe('game.js: where you arrived on this street', () => {
  it('a signpost or door arrival is kept; a load from a save or a return is not an arrival (the street\'s own is used)', () => {
    assert.match(game, /streetArrival = opts\.quiet \|\| !Number\.isFinite\(opts\.spawnX\)\s*\? \{\s*tsid: data\.tsid,\s*x: clamp\(sourceSpawnX \?\? WORLD_W \* 0\.5/);
    assert.match(game, /: \{ tsid: data\.tsid, x: player\.x, y: player\.y, from: 'arrival' \};/);
  });

  it('stuckReturn moves you on the street you are on, onto the floor, and the camera follows', () => {
    const fn = game.slice(game.indexOf('  stuckReturn() {'), game.indexOf('  async refreshHomeScene('));
    assert.match(fn, /streetArrival\?\.tsid === currentStreetTsid/);
    // No arrival this visit: the street's own way in nearest you that you can leave by (a signpost or a door,
    // street-model.js stuckWay, tests/wintry-trap.test.js), never the planned spawn first.
    assert.match(fn, /if \(at\.from === 'street'\) \{\s*const near = stuckWay\(currentStreet, player\.x, features\.query\('closedRoads', engine\) \|\| \[\]\);/);
    assert.match(fn, /player\.onGround = false;/);
    assert.match(fn, /engine\.snapCamera\(\);/);
    // Online the realtime client sends the new spot as any step (hub.go "move" takes any spot on the street).
    assert.doesNotMatch(fn, /enterStreet|travelGate/);
  });
});
