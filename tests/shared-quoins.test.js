/**
 * Multiplayer phase 4, shared street quoins: the book (js/shared-quoins.js),
 * the feature (js/features/shared-quoins-feature.js) against a fake engine
 * and realtime client, the generator of the server's quoin data
 * (tools/build-realtime-quoins.mjs, data/quoins.json in the server repo) and
 * the server's source constants (quoins.go in groddle-afternoon-server; those
 * checks skip without it, tools/repos.mjs). The source rules are
 * GameServerJS items/quoin.js onPlayerCollision (156-310) and
 * distributeQuoinShards (83-154).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  CLAIM_WAIT_MS,
  LOCAL_STATES,
  RECLAIM_MS,
  createSharedQuoinBook,
  fxShards,
  normalizeGrab,
  normalizeSync,
  shardFor,
  statusOf,
} from '../public/js/shared-quoins.js?v=g424-1';
import { sharedQuoinsFeature } from '../public/js/features/shared-quoins-feature.js?v=g424-1';
import {
  QUOIN_SHARD_FLOOR,
  QUOIN_SHARD_NEAR,
  QUOIN_SHARD_RADIUS,
  QUOIN_SHARD_TOP,
  QUOIN_SHARD_FALL,
} from '../public/js/quoin-shards.js?v=g216-1';
import { placementRequests, streetQuoinLayout, classTable, mysteryTable } from '../tools/build-realtime-quoins.mjs';
import { setStreetEcologyCatalog } from '../public/js/street-ecology.js';
import { QUOIN_CLASSES } from '../public/js/quoins.js';
import { HAS_SERVER, serverPath, skipWithoutServer } from '../tools/repos.mjs';

const root = join(import.meta.dirname, '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');

const SYNC = {
  t: 'quoins',
  street: 'GQTEST',
  shared: true,
  quoins: [
    { i: 0, x: 100, y: 800, type: 'currants', class: 'small random currants' },
    { i: 1, x: 400, y: 800, type: 'xp', class: 'small random xp' },
    { i: 2, x: 700, y: 760, type: 'mystery', class: 'small random xp' },
  ],
  gone: [2],
};

describe('the book', () => {
  it('cleans what the server sends', () => {
    const s = normalizeSync({ ...SYNC, quoins: [...SYNC.quoins, { i: -1, x: 0, y: 0 }, { i: 9, x: 'x', y: 0 }, null] });
    assert.equal(s.shared, true);
    assert.deepEqual([...s.spots.keys()], [0, 1, 2]);
    assert.deepEqual([...s.gone], [2]);
    assert.equal(s.spots.get(0).className, 'small random currants');
    assert.equal(normalizeSync({ t: 'quoins', street: 'GQTEST', shared: false }).shared, false);
    assert.equal(normalizeSync({ street: '' }), null);
    const g = normalizeGrab({ street: 'GQTEST', i: 1, id: 7, name: 'Ada', type: 'xp', amount: 4.7, crowd: 3, shards: [{ id: 8, amount: 2, x: 1, y: 2, pct: 0.5 }, { id: 9, amount: 0 }, 'x'] });
    assert.deepEqual(g.shards, [{ id: 8, x: 1, y: 2, amount: 2, pct: 0.5 }]);
    assert.equal(g.amount, 4);
    assert.equal(normalizeGrab({ street: 'GQTEST', i: 1.5 }), null);
    // A mystery quoin's rolled kind: one of the four basic kinds, and only on a mystery grab.
    assert.equal(normalizeGrab({ street: 'GQTEST', i: 2, type: 'mystery', resolved: 'mood' }).resolved, 'mood');
    assert.equal(normalizeGrab({ street: 'GQTEST', i: 2, type: 'mystery', resolved: 'favor' }).resolved, '');
    assert.equal(normalizeGrab({ street: 'GQTEST', i: 1, type: 'xp', resolved: 'mood' }).resolved, '');
  });

  it('books claims: one at a time, gone stays gone, refused waits before asking again', () => {
    const book = createSharedQuoinBook();
    assert.equal(book.claim('GQTEST', 0, 0), false, 'nothing is claimable before a sync');
    book.synced(SYNC);
    assert.equal(book.claim('GQTEST', 2, 0), false, 'a gone quoin is not asked for');
    assert.equal(book.claim('GQTEST', 9, 0), false, 'nor one the street does not have');
    assert.equal(book.claim('GQTEST', 0, 0), true);
    assert.equal(book.claim('GQTEST', 0, 1), false, 'one claim in flight');
    assert.equal(book.isPending('GQTEST', 0), true);
    assert.equal(book.refused('GQTEST', 0, 'far', 10), 'restore');
    assert.equal(book.claim('GQTEST', 0, 10 + RECLAIM_MS - 1), false, 'a refused quoin waits');
    assert.equal(book.claim('GQTEST', 0, 10 + RECLAIM_MS), true);
    assert.equal(book.taken('GQTEST', 0), true, 'the answer to our claim');
    assert.equal(book.isGone('GQTEST', 0), true);
    book.back('GQTEST', 0);
    assert.equal(book.isGone('GQTEST', 0), false);
    assert.equal(book.claim('GQTEST', 1, 100), true);
    assert.equal(book.refused('GQTEST', 1, 'gone', 100), 'gone');
    assert.equal(book.isGone('GQTEST', 1), true);
    assert.equal(book.taken('GQTEST', 1), false, 'someone else took it');
  });

  it('expires unanswered claims, and keeps them across a re-sync', () => {
    const book = createSharedQuoinBook();
    book.synced(SYNC);
    book.claim('GQTEST', 0, 1000);
    book.forget();
    assert.equal(book.spotsFor('GQTEST'), null);
    assert.equal(book.isPending('GQTEST', 0), true, 'an answer may cross the re-join');
    assert.deepEqual(book.expire(1000 + CLAIM_WAIT_MS - 1), []);
    assert.deepEqual(book.expire(1000 + CLAIM_WAIT_MS), [{ street: 'GQTEST', i: 0 }]);
    assert.equal(book.isPending('GQTEST', 0), false);
    book.synced(SYNC);
    book.claim('GQTEST', 1, 0);
    book.synced({ ...SYNC, street: 'GOTHER' });
    assert.equal(book.isPending('GQTEST', 1), false, 'a sync for another street drops claims here');
  });

  it('shapes shards for the bolts and the server status', () => {
    const grab = normalizeGrab({ street: 'GQTEST', i: 0, type: 'currants', shards: [{ id: 2, x: 10, y: 20, amount: 3 }, { id: 3, x: 30, y: 20, amount: 1 }] });
    assert.deepEqual(fxShards(grab, { viewerId: 2, mine: 2 }), [
      { id: 2, x: 10, y: 20, delta: 2, stat: 'currants' },
      { id: 3, x: 30, y: 20, delta: 1, stat: 'currants' },
    ]);
    assert.deepEqual(fxShards(grab, { viewerId: 2, mine: 0 }).map((s) => s.id), [3], 'a shard that landed nothing is not drawn');
    assert.equal(shardFor(grab, 3).amount, 1);
    assert.equal(shardFor(grab, 9), null);
    assert.deepEqual(statusOf({ afk: true, following: 'yes', multiplier: 250 }), { afk: true, following: false, mult: 100 });
    assert.deepEqual(statusOf({ multiplier: 'x' }), { afk: false, following: false, mult: 1 });
    assert.ok(LOCAL_STATES.has('replaced') && !LOCAL_STATES.has('offline'));
  });
});

/** A realtime client stand-in: listeners, sent frames, a settable state. */
function fakeClient() {
  const listeners = new Map();
  return {
    state: 'online',
    street: '',
    me: { id: 1, name: 'Ada' },
    sent: [],
    on(type, fn) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(fn);
      return () => listeners.get(type).delete(fn);
    },
    emit(type, detail) {
      for (const fn of listeners.get(type) || []) fn(detail);
    },
    send(kind, payload) {
      if (this.state !== 'online') return false;
      this.sent.push({ t: kind, ...payload });
      return true;
    },
  };
}

function fakeEngine(mode, client) {
  const engine = {
    mode,
    started: true,
    player: { x: 100, y: 828 },
    streetTsid: 'GQTEST',
    population: { quoins: 8 },
    pc: { currants: 10 },
    quoinState: { collectedToday: 0, dailyLimit: 100, multiplier: 2 },
    playerAfk: false,
    playerFollowing: false,
    quoins: [],
    data: {},
    log: [],
    queries: [],
    transientInstance: () => false,
    homeContext: () => ({ inHome: false }),
    setData(k, v) { engine.data[k] = String(v); },
    playSound(key) { engine.log.push(`sound:${key}`); },
    pushActivity(line) { engine.log.push(`activity:${line}`); },
    updateHud() {},
    query(hook, ...args) {
      engine.queries.push(hook);
      if (hook === 'realtimeClient') return client;
      if (hook === 'quoinShardFx') {
        engine.log.push(`fx:${args[0].grabberIsViewer ? 'mine' : 'theirs'}:${args[0].shards.map((s) => `${s.id}=${s.delta}`).join(',')}`);
        return {};
      }
      return null;
    },
    spawnQuoin(spot, typeId, opts) {
      const q = { x: spot.x, y: spot.y, typeId, naturalQuoinIndex: opts.naturalQuoinIndex, visible: true };
      engine.quoins.push(q);
      return q;
    },
    takeQuoin(q) {
      const at = engine.quoins.indexOf(q);
      if (at < 0) return false;
      engine.quoins.splice(at, 1);
      return true;
    },
    grantQuoin(q, shared) {
      engine.log.push(`grant:${q.naturalQuoinIndex}:${shared.amount}:${shared.share?.sound || 'QUOIN_GOT'}`);
      if (shared.resolved) engine.log.push(`resolved:${q.naturalQuoinIndex}:${shared.resolved}`);
      return engine.takeQuoin(q);
    },
  };
  return engine;
}

const quoinAt = (engine, i) => engine.quoins.find((q) => q.naturalQuoinIndex === i);

describe('the feature', () => {
  it('does nothing at all in solo', () => {
    const client = fakeClient();
    const engine = fakeEngine('solo', client);
    engine.quoins.push({ naturalQuoinIndex: 0, visible: true });
    sharedQuoinsFeature.onStreetEnter({}, engine);
    sharedQuoinsFeature.onTick(16, 0, engine);
    assert.equal(sharedQuoinsFeature.quoinTouched(engine.quoins[0], engine), null);
    assert.equal(sharedQuoinsFeature.quoinsShared(engine), null);
    assert.deepEqual(engine.queries, [], 'no realtime client asked for');
    assert.equal(engine.quoins[0].visible, true);
    assert.deepEqual(client.sent, []);
  });

  it('in multiplayer asks the server, rewards only on its answer, and shares the street', () => {
    const client = fakeClient();
    const engine = fakeEngine('multiplayer', client);
    // game.js spawned the street's natural quoins (solo layout) plus a personal Qurazy.
    for (let i = 0; i < 3; i++) engine.quoins.push({ x: 50 + i, y: 1, naturalQuoinIndex: i, visible: true });
    const qurazy = { x: 5, y: 5, typeId: 'qurazy', naturalQuoinIndex: null, visible: true };
    engine.quoins.push(qurazy);

    sharedQuoinsFeature.onStreetEnter({}, engine);
    assert.deepEqual(engine.quoins.filter((q) => q.naturalQuoinIndex != null).map((q) => q.visible), [false, false, false], 'hidden until the server says');
    assert.equal(sharedQuoinsFeature.quoinTouched(engine.quoins[0], engine), true, 'not grabbable before the sync');
    assert.equal(sharedQuoinsFeature.quoinTouched(qurazy, engine), null, 'personal quoins stay solo');
    assert.equal(sharedQuoinsFeature.quoinsShared(engine), true, 'game.js respawns stand down');

    client.street = 'GQTEST';
    client.emit('roster', { street: 'GQTEST', players: [] });
    assert.deepEqual(client.sent.map((m) => m.t), ['quoin_status', 'quoin_sync']);
    assert.deepEqual(client.sent[0], { t: 'quoin_status', afk: false, following: false, mult: 2 });
    client.emit('roster', { street: 'GQTEST', players: [{ id: 2 }] });
    assert.equal(client.sent.length, 2, 'an arrival does not ask again');

    client.emit('msg:quoins', SYNC);
    sharedQuoinsFeature.onTick(16, 0, engine);
    const natural = engine.quoins.filter((q) => q.naturalQuoinIndex != null);
    assert.deepEqual(natural.map((q) => [q.naturalQuoinIndex, q.x, q.y, q.typeId, q.quoinClass, q.sharedQuoin]), [
      [0, 100, 800, 'currants', 'small random currants', true],
      [1, 400, 800, 'xp', 'small random xp', true],
    ], 'placed where the server has them, the gone one left out');
    assert.ok(engine.quoins.includes(qurazy));
    assert.equal(engine.data.sharedQuoins, 'shared');
    assert.equal(engine.data.sharedQuoinsLive, '2/3');

    // Touch quoin 0: hidden, one claim, no reward yet.
    const q0 = quoinAt(engine, 0);
    assert.equal(sharedQuoinsFeature.quoinTouched(q0, engine), true);
    assert.equal(sharedQuoinsFeature.quoinTouched(q0, engine), true);
    assert.deepEqual(client.sent.filter((m) => m.t === 'quoin_claim'), [{ t: 'quoin_claim', street: 'GQTEST', i: 0 }]);
    assert.equal(q0.visible, false);
    assert.ok(!engine.log.some((l) => l.startsWith('grant')));
    client.emit('msg:quoin_got', { street: 'GQTEST', i: 0, type: 'currants', amount: 4, x: 100, y: 800, crowd: 2, shards: [{ id: 2, x: 120, y: 828, amount: 4 }] });
    assert.ok(engine.log.includes('grant:0:4:QUOIN_SHARD_2'), engine.log.join('|'));
    assert.ok(engine.log.includes('fx:mine:2=4'));
    assert.equal(quoinAt(engine, 0), undefined);

    // Someone else's grab near you: it vanishes and your shard lands.
    client.emit('msg:quoin_taken', { street: 'GQTEST', i: 1, id: 2, name: 'Bo', type: 'currants', amount: 6, x: 400, y: 800, crowd: 3, shards: [{ id: 1, x: 100, y: 828, amount: 3 }, { id: 3, x: 90, y: 828, amount: 1 }] });
    assert.equal(quoinAt(engine, 1), undefined);
    assert.equal(engine.pc.currants, 13);
    assert.ok(engine.log.includes('sound:QUOIN_SHARD_3'));
    assert.ok(engine.log.includes('activity:You got a quoin shard from Bo: +3 currants.'));
    assert.ok(engine.log.includes('fx:theirs:1=3,3=1'));
    assert.equal(engine.data.sharedQuoinLast, 'shard:1:3>3');

    // Respawns come from the server.
    client.emit('msg:quoin_back', { street: 'GQTEST', i: 1 });
    client.emit('msg:quoin_back', { street: 'GQTEST', i: 1 });
    assert.equal(engine.quoins.filter((q) => q.naturalQuoinIndex === 1).length, 1);

    // Refused as too far: back on screen, and not asked again at once.
    const q1 = quoinAt(engine, 1);
    sharedQuoinsFeature.quoinTouched(q1, engine);
    client.emit('msg:quoin_refused', { street: 'GQTEST', i: 1, why: 'far' });
    assert.equal(q1.visible, true);
    const claims = client.sent.filter((m) => m.t === 'quoin_claim').length;
    assert.equal(sharedQuoinsFeature.quoinTouched(q1, engine), true);
    assert.equal(client.sent.filter((m) => m.t === 'quoin_claim').length, claims);

    // At the daily limit the touch is game.js's (it says so, and leaves the quoin).
    engine.quoinState.collectedToday = 100;
    assert.equal(sharedQuoinsFeature.quoinTouched(q1, engine), null);
    engine.quoinState.collectedToday = 0;

    // Refused as gone: it goes.
    client.emit('msg:quoin_refused', { street: 'GQTEST', i: 1, why: 'gone' });
    assert.equal(quoinAt(engine, 1), undefined);

    // Status follows AFK.
    engine.playerAfk = true;
    sharedQuoinsFeature.onTick(16, 0, engine);
    assert.deepEqual(client.sent.at(-1), { t: 'quoin_status', afk: true, following: false, mult: 2 });

    // Realtime gone for good: the quoins drawn are the player's own again.
    client.emit('msg:quoin_back', { street: 'GQTEST', i: 1 });
    client.state = 'replaced';
    client.emit('roster', { street: '', players: [] });
    sharedQuoinsFeature.onTick(16, 0, engine);
    assert.equal(engine.data.sharedQuoins, 'local');
    assert.equal(sharedQuoinsFeature.quoinTouched(quoinAt(engine, 1), engine), null);
    assert.equal(sharedQuoinsFeature.quoinsShared(engine), null);
  });
});

describe('a mystery quoin in multiplayer', () => {
  it('lands as the kind the server rolled', async () => {
    // A fresh copy of the feature: the one above still holds its replaced client.
    const { sharedQuoinsFeature } = await import('../public/js/features/shared-quoins-feature.js?v=mystery-test-1');
    const client = fakeClient();
    const engine = fakeEngine('multiplayer', client);
    sharedQuoinsFeature.onStreetEnter({}, engine);
    client.street = 'GQTEST';
    client.emit('roster', { street: 'GQTEST', players: [] });
    client.emit('msg:quoins', { ...SYNC, gone: [] });
    sharedQuoinsFeature.onTick(16, 0, engine);
    const q2 = quoinAt(engine, 2);
    assert.equal(q2.typeId, 'mystery', 'mystery art until it is grabbed');
    assert.equal(sharedQuoinsFeature.quoinTouched(q2, engine), true);
    client.emit('msg:quoin_got', { street: 'GQTEST', i: 2, type: 'mystery', resolved: 'mood', amount: 3, x: 700, y: 760, crowd: 0, shards: [] });
    assert.ok(engine.log.includes('grant:2:3:QUOIN_GOT'), engine.log.join('|'));
    assert.ok(engine.log.includes('resolved:2:mood'), engine.log.join('|'));
    assert.equal(engine.data.sharedQuoinLast, 'got:2:3:mood');
  });
});

describe('the server data', () => {
  const index = JSON.parse(read('public/assets/streets/index.json'));
  const shipped = HAS_SERVER ? JSON.parse(readFileSync(serverPath('data/quoins.json'), 'utf8')) : null;
  setStreetEcologyCatalog(JSON.parse(read('public/assets/content/street-ecology.json')));

  it('lays out quoins with game.js enterStreet planner groups, in its order', () => {
    const game = read('public/game.js');
    const call = game.slice(game.indexOf('currentStreetPlacement = planStreetPlacements('));
    const list = call.slice(0, call.indexOf("{ key: 'quoins'") + 80);
    const keys = [...list.matchAll(/\{ key: '([A-Za-z]+)', count: ([^,]+), clearance: (\d+) \}/g)].map((m) => [m[1], m[3]]);
    const pop = { treeClasses: [], gardens: 0, vendor: false, shrine: false, rockClasses: [], piggies: 0, chickens: 0, butterflies: 0, flyingButterflies: 0, apples: 0, musicblocks: 0, quoins: 0 };
    assert.deepEqual(placementRequests(pop).map((r) => [r.key, String(r.clearance)]), keys);
    assert.match(game, /key: 'saved-arrival'/, 'the one reservation the server leaves out is per player');
    assert.match(game, /q\.baseY = opts\.useExactY \? spot\.y : spot\.y - 58 - \(phaseIndex % 3\) \* 34;/);
  });

  it('ships the current layout for Hechey Track and every class the spots use', { skip: skipWithoutServer }, async () => {
    const { loadStreetDataFromFs, applyStreetIndex } = await import('../public/js/street-loader.js');
    applyStreetIndex(index);
    for (const tsid of ['GLI2V0UN7RD1T2J', 'GLI3272LOTD1B1F']) {
      const data = await loadStreetDataFromFs(tsid, join(root, 'public/assets/streets'));
      assert.deepEqual(streetQuoinLayout(data, { starter: tsid === index.default }), shipped.streets[tsid], `${tsid}: run node tools/build-realtime-quoins.mjs`);
    }
    assert.equal(shipped.streets.GLI2V0UN7RD1T2J.length, 8);
    assert.deepEqual(shipped.classes, classTable());
    assert.deepEqual(shipped.mystery, mysteryTable());
    assert.equal(Object.keys(shipped.classes).length, Object.keys(QUOIN_CLASSES).length);
    for (const rows of Object.values(shipped.streets)) for (const [, , type, cls] of rows) {
      assert.ok(shipped.classes[cls], cls);
      assert.notEqual(type, 'qurazy', 'no natural spot is a Qurazy (G260)');
    }
    assert.ok(Object.keys(shipped.streets).length > 1000);
  });
});

describe('the server and the wiring', () => {
  const go = HAS_SERVER ? readFileSync(serverPath('quoins.go'), 'utf8') : '';
  it('uses the source shard rule the solo shards use', { skip: skipWithoutServer }, () => {
    const num = (name) => Number(new RegExp(`${name}\\s*=\\s*([0-9.]+)`).exec(go)?.[1]);
    assert.equal(num('shardRadius'), QUOIN_SHARD_RADIUS);
    assert.equal(num('shardNear'), QUOIN_SHARD_NEAR);
    assert.equal(num('shardFall'), QUOIN_SHARD_FALL);
    assert.equal(num('shardTop'), QUOIN_SHARD_TOP);
    assert.equal(num('shardFloor'), QUOIN_SHARD_FLOOR);
    assert.equal(num('quoinTouch'), 44, 'game.js picks a quoin up within 44 px');
    assert.match(read('public/game.js'), /Math\.hypot\(q\.x - player\.x, q\.y - \(player\.y - 28\)\) < 44/);
    assert.match(go, /go:embed data\/quoins\.json/);
    assert.match(go, /items\/quoin\.js onPlayerCollision/);
  });

  it('registers before realtime, and game.js hands the touch, the reward and respawns over', () => {
    const idx = read('public/js/features/index.js');
    const mine = idx.indexOf("import { sharedQuoinsFeature } from './shared-quoins-feature.js?v=g424-1'");
    assert.ok(mine > 0 && mine < idx.indexOf('realtimeFeature'));
    const game = read('public/game.js');
    assert.match(game, /if \(features\.query\('quoinTouched', q, engine\)\) continue;\n\s+grabWorldQuoin\(q\);/);
    assert.match(game, /if \(features\.query\('quoinsShared', engine\)\) return;/);
    assert.match(game, /grantQuoin\(q, shared\) \{/);
    assert.match(game, /if \(Number\.isInteger\(q\.naturalQuoinIndex\) && !shared\) \{/);
  });
});
