/**
 * Player slash commands in Local chat (js/slash-commands.js,
 * features/slash-commands-feature.js). Register row G160.
 * Source: glitch-GameServerJS main.js doChatCommand (:1842-1934).
 */
import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  PLAYER_COMMANDS,
  SLASH_TEXT,
  STAFF_COMMANDS,
  prettyList,
  rosterLine,
  slashPlan,
  slashWords,
  unknownLine,
} from '../public/js/slash-commands.js?v=g249-1';
import { slashCommandsFeature, slashContext } from '../public/js/features/slash-commands-feature.js?v=g258-1';
import { smallItemsFeature } from '../public/js/features/small-items-feature.js?v=card-12';
import { towerApi } from '../public/js/features/home-tower-feature.js?v=home-tower-10';
import { BUTLER_STRINGS } from '../public/js/butler.js?v=butler-5';
import { butlerFeature } from '../public/js/features/butler-feature.js?v=butler-feature-19';
import { FEATURES } from '../public/js/features/index.js';
import { createFeatureHost } from '../public/js/feature-host.js';
import { countItem } from '../public/js/inventory.js?v=catalog-unified-6';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const gsjs = join(root, '..', 'glitch-GameServerJS');
const hasGsjs = existsSync(gsjs);
const src = (rel) => readFileSync(join(gsjs, rel), 'utf8');

function fakeEngine(over = {}) {
  const data = {};
  const log = [];
  const toasts = [];
  const trips = [];
  return {
    inv: {},
    pc: { energy: 100, mood: 100, currants: 500 },
    player: { x: 500, y: 600 },
    data,
    log,
    toasts,
    trips,
    setData: (k, v) => { data[k] = v; },
    pushActivity: (t) => log.push(t),
    toast: (t) => toasts.push(t),
    refreshPack: () => {},
    save: () => {},
    updateHud: () => {},
    floatText: () => {},
    playSound: () => {},
    param: () => null,
    homeContext: () => ({ inHome: false, room: 'street', owned: true }),
    whoIsHere: () => ['Ur'],
    acting: () => false,
    transientInstance: () => false,
    homeTravel: async (step) => { trips.push(step); return step === 'teleport' || step === 'teleport-inside' ? { ok: true } : true; },
    enter: async (tsid) => { trips.push(`enter:${tsid}`); },
    refreshHomeScene: async (opts) => { trips.push(`refresh:${opts?.arrive}`); return true; },
    ...over,
  };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const AWAY = { owned: true, inHome: false, room: 'street' };

afterEach(() => {
  slashCommandsFeature._reset();
  smallItemsFeature._reset();
  towerApi.state().built = false;
  towerApi.clearFloor();
});

describe('slash command lines (main.js doChatCommand)', () => {
  it('keeps the source text', { skip: !hasGsjs && 'GSJS checkout not beside this worktree' }, () => {
    const main = src('main.js');
    const block = main.slice(main.indexOf('function doChatCommand'), main.indexOf('god-only commands below this point'));
    assert.ok(block.includes(`pc.sendActivity("${SLASH_TEXT.makegod}")`));
    assert.ok(block.includes(`return pc.sendActivity("${SLASH_TEXT.xyzzy}")`));
    assert.ok(block.includes(`pc.sendActivity("${SLASH_TEXT.unknown}"+utils.filter_chat(txt))`));
    for (const cmd of PLAYER_COMMANDS) assert.match(block, new RegExp(`words\\[0\\]\\s*==\\s*["']${cmd}["']`), cmd);
    for (const cmd of Object.keys(STAFF_COMMANDS).filter((c) => c.startsWith('/'))) assert.ok(block.includes(`'${cmd}'`) || block.includes(`"${cmd}"`), cmd);
    const houses = src('players/inc_houses.js');
    for (const line of [SLASH_TEXT.noTower, SLASH_TEXT.finishQuest, SLASH_TEXT.dead, SLASH_TEXT.busy, SLASH_TEXT.leaveNotHome]) assert.ok(houses.includes(`"${line}"`), line);
    const location = src('locations/location.js');
    assert.ok(location.includes(`var msg = "${SLASH_TEXT.whoNobody}";`));
    assert.ok(location.includes('msg = names[0]+" is here";'));
    assert.ok(location.includes(`msg = pretty_list(names, ' and ')+" are here";`));
  });

  it('splits on spaces like the source and answers only its own commands', () => {
    assert.deepEqual(slashWords('  /who   now '), ['/who', '', '', 'now']);
    assert.equal(slashPlan('/beans'), null, 'small-items-feature answers /beans');
    assert.equal(slashPlan('/whom'), null);
    assert.equal(slashPlan('/max'), null, 'staff commands fall through to Unknown command');
    assert.equal(slashPlan('who'), null);
    assert.equal(unknownLine(' /max  '), 'Unknown command: /max');
    assert.equal(unknownLine('/create item apple'), 'Unknown command: /create item apple');
  });

  it('/makegod and /xyzzy', () => {
    assert.deepEqual(slashPlan('/makegod'), { command: '/makegod', say: "Don't go getting delusions of grandeur on us now. We need you to keep a level head!" });
    assert.deepEqual(slashPlan('/xyzzy please'), { command: '/xyzzy', say: 'Nothing happens' });
  });

  it('/who: location.js get_roster_msg with common.js pretty_list', () => {
    assert.equal(prettyList(['A', 'B', 'C'], ' and '), 'A, B and C');
    assert.equal(rosterLine([]), 'You are the only person here.');
    assert.equal(rosterLine(['Ur']), 'Ur is here');
    assert.equal(rosterLine(['Ur', 'Amp']), 'Ur and Amp are here');
    assert.equal(rosterLine(['Ur', 'Amp', 'Bumbishfish', 'Lily Linguistic']), 'Ur, Amp, Bumbishfish and Lily Linguistic are here');
    assert.deepEqual(slashPlan('/who', { who: ['Ur', 'Amp'] }), { command: '/who', say: 'Ur and Amp are here' });
  });

  it('/home and /house: teleport, rooms at home, the Home panel without a home', () => {
    assert.deepEqual(slashPlan('/home', { home: { owned: false } }).travel, ['teleport'], 'teleportHome opens the Home panel');
    assert.deepEqual(slashPlan('/house', { home: { owned: false } }).travel, ['teleport']);
    assert.deepEqual(slashPlan('/home', { home: AWAY }).travel, ['teleport']);
    assert.deepEqual(slashPlan('/house', { home: AWAY }).travel, ['teleport-inside']);
    assert.deepEqual(slashPlan('/home', { home: { owned: true, inHome: true, room: 'interior' } }).travel, ['outside']);
    assert.deepEqual(slashPlan('/house', { home: { owned: true, inHome: true, room: 'street' } }).travel, ['inside']);
    assert.deepEqual(slashPlan('/house', { home: { owned: true, inHome: true, room: 'interior' }, onTowerFloor: true }).travel, ['house-from-tower']);
    assert.equal(slashPlan('/home', { home: { owned: true, inHome: true, room: 'street' } }).silent, true);
    assert.equal(slashPlan('/house', { home: { owned: true, inHome: true, room: 'interior' } }).silent, true);
  });

  it('home travel checks: a quest instance, the dead, work in progress (inc_houses.js)', () => {
    assert.equal(slashPlan('/home', { home: AWAY, instance: true }).say, "Just finish the quest first! It's easy!");
    assert.equal(slashPlan('/house', { home: AWAY, dead: true }).say, 'You are dead.');
    assert.equal(slashPlan('/home', { home: AWAY, busy: true }).say, "You need to finish up what you're working on first.");
    assert.equal(slashPlan('/tower', { home: AWAY, towerBuilt: true, dead: true }).say, 'You are dead.');
  });

  it('/tower and /leave', () => {
    assert.deepEqual(slashPlan('/tower', { home: AWAY }), { command: '/tower', say: "You don't have a tower!" });
    assert.deepEqual(slashPlan('/tower', { home: AWAY, towerBuilt: true }).travel, ['teleport', 'tower']);
    assert.deepEqual(slashPlan('/tower', { home: { owned: true, inHome: true, room: 'street' }, towerBuilt: true }).travel, ['tower']);
    assert.deepEqual(slashPlan('/leave', { home: AWAY }), { command: '/leave', say: 'To leave, you must first go /home' });
    assert.deepEqual(slashPlan('/leave', { home: { owned: true, inHome: true, room: 'interior' } }).travel, ['return']);
  });

  it('/butler: the Butler answers when you have one, silence when not', () => {
    assert.deepEqual(slashPlan('/butler', { butlerOwned: true }), { command: '/butler', butler: true });
    assert.deepEqual(slashPlan('/butler', {}), { command: '/butler', silent: true });
  });
});

describe('slash-commands feature', () => {
  it('is registered after small-items, so /beans still gives a Plate of Beans', () => {
    const ids = FEATURES.map((f) => f.id);
    assert.ok(ids.includes('slash-commands'));
    assert.ok(ids.indexOf('small-items') < ids.indexOf('slash-commands'));
    const host = createFeatureHost(FEATURES);
    const engine = fakeEngine();
    assert.equal(host.query('chatCommand', '/beans', engine), true);
    assert.equal(countItem(engine.inv, 'plate_of_beans'), 1);
    assert.equal(engine.log.length, 0, 'no Unknown command line for /beans');
  });

  it('game.js asks chatCommand, then unknownChatCommand for a line nobody knows', () => {
    const host = createFeatureHost(FEATURES);
    const engine = fakeEngine();
    assert.equal(host.query('chatCommand', '/max', engine), null);
    assert.equal(host.query('unknownChatCommand', '/max', engine), true);
    assert.deepEqual(engine.log, ['Unknown command: /max']);
    assert.deepEqual(engine.toasts, ['Unknown command: /max']);
    assert.equal(engine.data.slashLast, 'unknown');
    const game = readFileSync(join(root, 'public/game.js'), 'utf8');
    assert.ok(game.includes("features.query('chatCommand', text.trim(), engine) || features.query('unknownChatCommand', text.trim(), engine)"));
  });

  it('says the source lines into the activity log', () => {
    const engine = fakeEngine({ whoIsHere: () => ['Ur', 'Amp', 'Bumbishfish'] });
    assert.equal(slashCommandsFeature.chatCommand('/xyzzy', engine), true);
    assert.equal(slashCommandsFeature.chatCommand('/who', engine), true);
    assert.equal(slashCommandsFeature.chatCommand('/makegod', engine), true);
    assert.deepEqual(engine.log, ['Nothing happens', 'Ur, Amp and Bumbishfish are here', SLASH_TEXT.makegod]);
    assert.equal(engine.data.slashLine, SLASH_TEXT.makegod);
    assert.equal(slashCommandsFeature.chatCommand('/beans', engine), null);
  });

  it('travels home, inside, out and back to Ur through the Home panel travel', async () => {
    let home = { owned: true, inHome: false, room: 'street' };
    const engine = fakeEngine({ homeContext: () => home });
    slashCommandsFeature.chatCommand('/house', engine);
    await flush();
    assert.deepEqual(engine.trips, ['teleport-inside']);
    assert.equal(engine.data.slashLast, '/house:teleport-inside');
    home = { owned: true, inHome: true, room: 'interior' };
    slashCommandsFeature.chatCommand('/home', engine);
    slashCommandsFeature.chatCommand('/leave', engine);
    await flush();
    assert.deepEqual(engine.trips, ['teleport-inside', 'outside', 'return']);
    assert.deepEqual(slashCommandsFeature._state().used, { house: true, tower: false });
    assert.deepEqual(slashCommandsFeature.save(), { version: 1, usedHouse: true, usedTower: false });
  });

  it('stops when teleportHome refuses (no home: the Home panel opened)', async () => {
    const engine = fakeEngine({ homeContext: () => ({ owned: false, inHome: false, room: 'street' }), homeTravel: async (step) => { engine.trips.push(step); return { ok: false, reason: 'not_owned' }; } });
    slashCommandsFeature.chatCommand('/tower', engine);
    assert.deepEqual(engine.log, ["You don't have a tower!"]);
    slashCommandsFeature.chatCommand('/home', engine);
    await flush();
    assert.deepEqual(engine.trips, ['teleport']);
    assert.equal(engine.data.slashLast, '/home:teleport:not_owned');
  });

  it('/tower lands on the ground floor at the teleport point; /house from the tower goes to the house', async () => {
    towerApi.state().built = true;
    let home = { owned: true, inHome: false, room: 'street' };
    const engine = fakeEngine({ homeContext: () => home });
    assert.equal(slashContext(engine).towerBuilt, true);
    slashCommandsFeature.chatCommand('/tower', engine);
    await flush();
    await flush();
    assert.deepEqual(engine.trips, ['teleport', 'enter:RH_HOME_INT']);
    assert.equal(towerApi.currentFloor(), 0);
    assert.equal(towerApi.takeFloorArrival(), 'door', 'tower_get_teleport_point, not the elevator');
    home = { owned: true, inHome: true, room: 'interior' };
    assert.equal(slashContext(engine).onTowerFloor, true);
    slashCommandsFeature.chatCommand('/house', engine);
    await flush();
    assert.equal(towerApi.currentFloor(), null);
    assert.deepEqual(engine.trips.slice(-1), ['refresh:door']);
    assert.deepEqual(slashCommandsFeature._state().used, { house: true, tower: true });
  });

  it('/butler: a click response from the Butler after the IM delay', async () => {
    const engine = fakeEngine();
    // Without a Butler: silent, as main.js:1907 returns.
    assert.equal(slashCommandsFeature.chatCommand('/butler', engine), true);
    assert.equal(engine.data.slashLast, '/butler:silent');
    assert.equal(engine.log.length, 0);
    butlerFeature.restore({ owned: true, name: 'Jeeves' });
    try {
      assert.equal(slashCommandsFeature.chatCommand('/butler', engine), true);
      assert.equal(engine.data.slashLast, '/butler:butler');
      assert.equal(engine.log.length, 0, 'sendIM waits 500 to 1000 ms (bag_butler.js:5402)');
      await new Promise((resolve) => setTimeout(resolve, 1050));
      assert.equal(engine.log.length, 1);
      const [name, line] = engine.log[0].split(': ');
      assert.equal(name, 'Jeeves');
      assert.ok(BUTLER_STRINGS.normalClickResponseList.includes(line), line);
    } finally {
      butlerFeature.restore({});
    }
  });

  it('restores the used-command flags', () => {
    slashCommandsFeature.restore({ usedHouse: true, usedTower: true });
    assert.equal(slashCommandsFeature.usedCommand('house'), true);
    assert.equal(slashCommandsFeature.usedCommand('tower'), true);
    slashCommandsFeature.restore(undefined);
    assert.equal(slashCommandsFeature.usedCommand('house'), false);
  });
});
