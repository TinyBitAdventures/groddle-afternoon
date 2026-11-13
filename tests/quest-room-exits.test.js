/**
 * Ways out of a quest room (Austin 2026-11-12, Groddle Calls Nov 12 Late):
 * - Teleporting: Glitch let you teleport out of an instance. teleportation_can_teleport
 *   (players/inc_teleportation.js 126-171) checks only the target, and teleportation_teleport
 *   362-366 leaves the instance (instances_left with no_auto_return) so you land on the target;
 *   arriving outside runs the quest's onExitLocation (quests/quest_scripting.js 11-20), which
 *   fails an unfinished quest (quests/btc_room_3.js 67-76). Saving a point there stays refused
 *   (can_set_target 313), and so does summoning (can_summon 777).
 * - /stuck: "They should still be able to use /stuck which maybe exits the quest." In a quest
 *   room it leaves the room as Glitch's "Are you stuck? Do you want to leave this place?" did
 *   (players/inc_instances.js 322-357): back where you came in, an unfinished quest ended.
 */
import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { STUCK_TEXT, SLASH_TEXT, slashPlan } from '../public/js/slash-commands.js?v=ec0e84ee';
import { slashCommandsFeature } from '../public/js/features/slash-commands-feature.js?v=e1652e1c';
import { questInstancesFeature } from '../public/js/features/quest-instances-feature.js?v=f44527ed';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const gsjs = (p) => readFileSync(join(root, '../glitch-GameServerJS', p), 'utf8');
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const AWAY = { owned: true, inHome: false, room: 'street' };
const ROOM = { title: 'Mental Block', solved: false };
const NO_EXIT = 'This place has its own way out. Teleporting will have to wait.';
const TARGET = { tsid: 'GCR10NQRPKJ16H6', x: 300, y: -90, label: 'Sylvan Grove', hubId: '58', hubName: 'Groddle Forest' };

describe('the source rule', () => {
  it('teleporting checks only the target and leaves an instance you stand in', () => {
    const tp = gsjs('players/inc_teleportation.js');
    const can = tp.slice(tp.indexOf('function teleportation_can_teleport('), tp.indexOf('function teleportation_can_set_target('));
    assert.doesNotMatch(can, /this\.location\.isInstance\(\)/, 'can_teleport never refuses where you stand');
    assert.match(tp, /if \(this\.location\.isInstance\(\)\)\{\s*this\.instances_left\(this\.location\.instance_id, false, true\);/);
    assert.match(tp, /if \(this\.location\.isInstance\(\) \|\| this\.location\.jobs_is_street_locked\(\) \|\| this\.location\.getProp\('no_teleportation'\)\)/, 'no point saved inside');
  });

  it('arriving outside fails an unfinished quest room quest', () => {
    assert.match(gsjs('quests/quest_scripting.js'), /function questEnterOutsideLocation[\s\S]*?this\.onExitLocation\(this\.last_quest_location\)/);
    assert.match(gsjs('quests/btc_room_3.js'), /function onExitLocation[\s\S]*?if \(!this\.is_complete\)\{\s*pc\.failQuest\(this\.class_tsid\);/);
  });
});

describe('/stuck in a quest room (js/slash-commands.js)', () => {
  it('leaves the room, with no cooldown; still refused dead or busy', () => {
    assert.deepEqual(slashPlan('/stuck', { home: AWAY, instance: true, questRoom: ROOM }), { command: '/stuck', stuck: 'quest-room' });
    assert.deepEqual(slashPlan('/stuck', { home: AWAY, instance: true, questRoom: ROOM, stuckWaitMs: 60_000 }), { command: '/stuck', stuck: 'quest-room' });
    assert.equal(slashPlan('/stuck', { home: AWAY, instance: true, questRoom: ROOM, dead: true }).say, STUCK_TEXT.dead);
    assert.equal(slashPlan('/stuck', { home: AWAY, instance: true, questRoom: ROOM, busy: true }).say, SLASH_TEXT.busy);
    // Places with their own Leave that are not quest rooms (races, Paradise, party spaces) keep the refusal.
    assert.equal(slashPlan('/stuck', { home: AWAY, instance: true }).say, STUCK_TEXT.leave);
  });

  it('says the quest ends, in plain words with no em dashes', () => {
    assert.match(STUCK_TEXT.doneQuestRoom, /unfinished quest ends/);
    for (const line of [STUCK_TEXT.doneQuestRoom, STUCK_TEXT.doneQuestRoomSolved]) assert.doesNotMatch(line, /—|Glitch/);
  });
});

describe('/stuck in a quest room (features/slash-commands-feature.js)', () => {
  afterEach(() => slashCommandsFeature._reset());

  function engineInRoom(room = ROOM, leaveResult = true) {
    const log = [];
    const leaves = [];
    const data = {};
    return {
      log,
      leaves,
      data,
      setData: (k, v) => { data[k] = v; },
      pushActivity: (t) => log.push(t),
      toast: () => {},
      save: () => {},
      param: () => null,
      homeContext: () => AWAY,
      whoIsHere: () => ['Ur'],
      acting: () => false,
      transientInstance: () => true,
      stuckReturn: () => { throw new Error('not in a quest room'); },
      query: (hook, ...args) => {
        if (hook === 'questRoomHere') return room;
        if (hook === 'questRoomLeave') { leaves.push(args[1]); return Promise.resolve(leaveResult); }
        return null;
      },
    };
  }

  it('leaves as the room\'s Leave does, says so, and spends no cooldown', async () => {
    const engine = engineInRoom();
    assert.equal(slashCommandsFeature.chatCommand('/stuck', engine), true);
    await flush();
    assert.equal(engine.leaves.length, 1);
    assert.equal(engine.leaves[0].to, undefined, 'back where you came in, not somewhere new');
    assert.deepEqual(engine.log, [STUCK_TEXT.doneQuestRoom]);
    assert.equal(engine.data.slashLast, '/stuck:quest-room');
    assert.equal(slashCommandsFeature._state().stuckAt, 0);
  });

  it('a solved room only says you are out; a leave that did not happen says nothing', async () => {
    const solved = engineInRoom({ title: 'Mental Block', solved: true });
    slashCommandsFeature.chatCommand('/stuck', solved);
    await flush();
    assert.deepEqual(solved.log, [STUCK_TEXT.doneQuestRoomSolved]);
    const stuckLeaving = engineInRoom(ROOM, false);
    slashCommandsFeature.chatCommand('/stuck', stuckLeaving);
    await flush();
    assert.deepEqual(stuckLeaving.log, []);
    assert.equal(stuckLeaving.data.slashLast, '/stuck:failed:quest-room');
  });
});

describe('teleporting out of a quest room (features/teleportation-feature.js)', () => {
  function fakeEngine(over = {}) {
    const log = { toasts: [], entered: [], leaves: [], gates: [] };
    const engine = {
      log,
      started: true,
      inv: {},
      toolState: {},
      pc: { energy: 90, mood: 50, xp: 0, imagination: 0 },
      // Teleportation IV: the Map's Teleport Here (teleportation_map_teleport).
      learnedSkills: ['teleportation_1', 'teleportation_2', 'teleportation_3', 'teleportation_4'],
      player: { x: 500, y: 400, vx: 0, vy: 0, onGround: true, height: 96 },
      street: { label: 'Mental Block', hubId: '', hubName: '' },
      streetTsid: 'QI_MENTAL_BLOCK_MAIN',
      param: () => null,
      setData() {},
      toast: (msg) => log.toasts.push(msg),
      pushActivity() {},
      updateHud() {},
      save() {},
      achievement() {},
      transientInstance: () => true,
      homeContext: () => ({ inHome: false }),
      streetExists: () => true,
      visitedStreets: () => [TARGET.tsid],
      travelGate: (tsid, meta) => { log.gates.push(meta); return { ok: true }; },
      closeMap() {},
      busy: () => false,
      enter: async (tsid, opts) => { log.entered.push([tsid, opts]); },
      query: (hook, ...args) => {
        if (hook === 'questRoomHere') return ROOM;
        if (hook === 'questRoomLeave') { log.leaves.push(args[1]); return Promise.resolve(true); }
        return null;
      },
      PIXI: { Graphics: class { clear() {} roundRect() {} fill() {} circle() {} destroy() {} get destroyed() { return false; } } },
      fxLayer: { addChild() {} },
      ...over,
    };
    return engine;
  }

  it('a quest room no longer refuses; any other held place still does', async () => {
    const { teleportationFeature: tp } = await import('../public/js/features/teleportation-feature.js?fresh=quest-room-exits-a');
    tp.restore({ targets: { 1: TARGET } });
    const engine = fakeEngine();
    const check = tp.mapTeleport('check', TARGET, engine);
    assert.notEqual(check.error, NO_EXIT);
    assert.equal(engine.log.gates.at(-1).leavesQuestRoom, true, 'the room\'s travel gate lets a teleport go');
    const race = fakeEngine({ query: () => null });
    assert.equal(tp.mapTeleport('check', TARGET, race).error, NO_EXIT);
  });

  it('the jump leaves the room onto its target, not back where you came in', async () => {
    const { teleportationFeature: tp } = await import('../public/js/features/teleportation-feature.js?fresh=quest-room-exits-b');
    tp.restore({ targets: { 1: TARGET } });
    const engine = fakeEngine();
    tp.init?.(engine);
    assert.equal(tp.mapTeleport('go', TARGET, engine), true);
    tp.onTick(16, Date.now() + 5000, engine);
    await flush();
    assert.equal(engine.log.leaves.length, 1);
    assert.equal(engine.log.leaves[0].to.tsid, TARGET.tsid);
    assert.deepEqual(engine.log.entered, [], 'questRoomLeave enters the target itself');
  });
});

describe('the quest room runtime (features/quest-instances-feature.js)', () => {
  it('answers no room and no leave with none open, and lets a teleport through its travel gate', () => {
    assert.equal(questInstancesFeature.questRoomHere(), null);
    assert.equal(questInstancesFeature.questRoomLeave({}, {}), null);
    assert.equal(questInstancesFeature.travelGate('X', {}, { leavesQuestRoom: true }), null);
  });

  it('a leave with `to` lands on the teleport target through the ordinary gates', () => {
    const src = read('public/js/features/quest-instances-feature.js');
    const leave = src.slice(src.indexOf('async function leaveInstance('), src.indexOf('/* HUD + QA data'));
    assert.match(leave, /const to = opts\.to\?\.tsid \? opts\.to : null;/);
    assert.match(leave, /if \(to\) await engine\.enter\(to\.tsid, \{ spawnX: to\.x, spawnY: to\.y \}\);/);
    // The quest still fails as a Leave fails it: the outcome code above the trip is unchanged.
    assert.match(leave, /const failed = failQuest\(engine, questId\);/);
  });
});
