/**
 * Report #733: after a long sleep the owner's house floor looked empty. Nothing was lost: since
 * G1324 (v0.77.0) a slept window waits in the realtime 'asleep' state until Play here, and on any
 * state but 'online' drops-mp-feature cleared every shared stack (and here() said nowhere), while
 * since G1190 the owner's floor drops live on the shared floor. The house showed only the save's own
 * things. Glitch asked for a reload after a long silence and never emptied the room
 * (NetController.as disconnectHandler 596-603).
 *
 * Austin's ruling (2026-11-27): while a window waits on Play here ('asleep', 'replaced'), keep
 * showing the last floor it saw, not interactive, with Play here as now. A real drop that
 * reconnects by itself still clears and re-syncs on hello. The same holds for a street's Notice
 * Board (boards-mp-feature): the notes players pinned stay on it, readable, while the window sleeps.
 */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createFeatureHost } from '../public/js/feature-host.js?v=b87e2cbc';
import { createDroppedItemState } from '../public/js/world-items.js?v=93313aad';
import { OFFLINE_LINE } from '../public/js/online-request.js?v=f4d87a22';
import { dropsMpFeature } from '../public/js/features/drops-mp-feature.js?fresh=report733';
import { createBoardsSession } from '../public/js/features/boards-mp-feature.js?fresh=report733';
import { BOARD_MP_TEXT } from '../public/js/boards-mp.js?v=ba766683';

const TABLE = { items: { honey: { max: 40 }, apple: { max: 40 } }, untradeable: {} };

function fakeClient(street) {
  const handlers = {};
  return {
    state: 'online',
    street,
    sent: [],
    on(ev, fn) { (handlers[ev] ||= []).push(fn); return () => {}; },
    send(kind, payload) { this.sent.push([kind, payload]); return true; },
    emit(ev, msg) { for (const fn of handlers[ev] || []) fn(msg); },
    /** realtime-client stopFor: the street is left, then the state changes. */
    to(state, street = '') {
      this.street = street;
      this.state = state;
      this.emit('state', { state });
    },
  };
}
const settle = () => new Promise((r) => setTimeout(r, 30));

const FLOOR = Array.from({ length: 40 }, (_, i) => ({
  id: `drop-${(i + 1).toString(16).padStart(16, '0')}`, c: i % 2 ? 'honey' : 'apple', n: 3, x: 100 + i * 20, y: 620, by: { id: 7, name: 'Owner' }, at: 1,
}));

describe('#733 the owner\'s house floor while the window waits on Play here', () => {
  const client = fakeClient('HOUSE_7');
  const state = createDroppedItemState({ streets: { RH_HOME_INT: [{ id: 'world-item-1', classTsid: 'still', count: 1, x: 600, y: 620 }] } });
  const toasts = [];
  let host;
  const engine = {
    mode: 'multiplayer', started: true, streetTsid: 'RH_HOME_INT', dropTsid: 'RH_HOME_INT',
    inv: {}, player: { x: 200, y: 680 }, droppedItems: state,
    query(hook, ...args) {
      if (hook === 'realtimeClient') return client;
      if (hook === 'homeDropOrigin') return { owner: 7, room: 'interior', floor: 0, houseX: 0, own: true };
      if (hook === 'ledgerReceipt') return true;
      return host.query(hook, ...args);
    },
    collect: () => [], redrawDroppedStacks: () => {}, setData: () => {}, toast: (t) => toasts.push(t), pushActivity: () => {},
    playSound: () => {}, floatText: () => {}, refreshPack: () => {}, save: () => {}, dropWorldStack: () => ({ ok: true }),
  };
  const shown = () => (host.query('sharedDroppedStacks', 'RH_HOME_INT', engine) || []).length;
  const tick = () => dropsMpFeature.onTick(16, 0, engine);

  before(async () => {
    globalThis.document = { baseURI: 'https://groddle.localhost/' };
    globalThis.GRODDLE_MP_BOOT = { nonce: 'abcdef0123' };
    globalThis.fetch = async (url) => {
      const body = String(url).includes('trade-items.json') ? TABLE : { drops: [] };
      return { status: 200, ok: true, headers: { get: () => null }, json: async () => body, text: async () => JSON.stringify(body) };
    };
    host = createFeatureHost([dropsMpFeature]);
    dropsMpFeature.init(engine);
    tick();
    await settle();
    client.emit('msg:ground_state', { street: 'HOUSE_7', stacks: FLOOR });
  });
  after(() => {
    delete globalThis.document;
    delete globalThis.GRODDLE_MP_BOOT;
    delete globalThis.fetch;
    delete globalThis.groddleDrops;
  });

  it('online: all 40 floor stacks draw', () => {
    assert.equal(shown(), 40);
  });

  it('asleep: the 40 stacks still draw, and stay drawn tick after tick', () => {
    client.to('asleep');
    assert.equal(shown(), 40, 'the shared house floor vanished when the window fell asleep');
    tick();
    assert.equal(shown(), 40, 'the client left the street; the floor stays');
  });

  it('asleep: the stacks are not interactive (pickup, Decoration Mode moves and claims say offline)', () => {
    const sent = client.sent.length;
    toasts.length = 0;
    assert.equal(host.query('sharedPickup', { worldItemId: FLOOR[0].id }, engine), false);
    assert.deepEqual(toasts, [OFFLINE_LINE]);
    assert.equal(host.query('moveSharedStack', FLOOR[1].id, { x: 300, y: 620 }, engine).reason, 'offline');
    assert.equal(host.query('claimSharedStack', FLOOR[2].id, { tsid: 'RH_HOME_INT', x: 300, y: 500 }, engine).reason, 'offline');
    assert.equal(host.query('homeStackMarks', engine), null, 'no owner marks while asleep');
    assert.equal(client.sent.length, sent, 'nothing sent to a socket that is gone');
    assert.equal(shown(), 40);
  });

  it('Play here: stop() on the way to the reload keeps the floor; online + ground_state brings every stack back', () => {
    client.to('stopped');
    assert.equal(shown(), 40, 'no empty frame before the reload');
    client.to('online', 'HOUSE_7');
    client.emit('msg:ground_state', { street: 'HOUSE_7', stacks: FLOOR });
    assert.equal(shown(), 40);
    assert.equal(state.streets.RH_HOME_INT.length, 1, 'the save\'s own stack was never touched');
  });

  it('replaced (another window plays, Play here shows): the floor stays drawn too', () => {
    client.to('replaced');
    assert.equal(shown(), 40);
    client.to('online', 'HOUSE_7');
    client.emit('msg:ground_state', { street: 'HOUSE_7', stacks: FLOOR });
  });

  it('a real drop that reconnects by itself still clears, and re-syncs on hello', () => {
    client.to('offline');
    assert.equal(shown(), 0, 'a retrying window waits for the server\'s list');
    client.to('stopped');
    assert.equal(shown(), 0, 'stopped from a plain drop stays clear');
    client.to('online', 'HOUSE_7');
    client.emit('msg:ground_state', { street: 'HOUSE_7', stacks: FLOOR.slice(0, 39) });
    assert.equal(shown(), 39, 'the server\'s list on hello is the floor');
  });
});

describe('#733 a street\'s Notice Board while the window waits on Play here', () => {
  const STREET = 'GA5134UPLRU29OH';
  const NOTE = { id: 'board-00000000000000a1', title: 'Lost hat', body: 'Blue.', author: { id: 7, name: 'Ada' }, remake: false, at: 1 };
  function setup() {
    const toasts = [];
    const engine = {
      mode: 'multiplayer', streetTsid: STREET, inv: {},
      query: () => null, toast: (t) => toasts.push(t), pushActivity() {}, setData() {}, playSound() {}, refreshPack() {}, updateHud() {}, save() {},
    };
    const client = fakeClient(STREET);
    const s = createBoardsSession(engine, client, { account: { boards: async () => ({ boards: [] }) }, me: 9, flush: () => true });
    client.emit('msg:board_state', { street: STREET, capacity: 10, boards: [{ board: 0, notes: [NOTE] }] });
    return { s, client, toasts };
  }

  it('asleep: the pinned notes stay on the board, readable; take and pin are refused', () => {
    const { s, client, toasts } = setup();
    assert.equal(s.board(STREET).notes.length, 1);
    client.to('asleep');
    s.tick(Date.now());
    const b = s.board(STREET);
    assert.equal(b.ready, true, 'the board opens');
    assert.deepEqual(b.notes.map((n) => n.id), [NOTE.id], 'the board looked empty while the window slept');
    const sent = client.sent.length;
    assert.equal(s.take(NOTE.id), false);
    assert.equal(s.pin({ id: 'n1', title: 'Mine', body: 'x' }), false);
    assert.deepEqual(toasts, [BOARD_MP_TEXT.offline, BOARD_MP_TEXT.offline]);
    assert.equal(client.sent.length, sent);
  });

  it('a real drop still clears the board until the server lists it again', () => {
    const { s, client } = setup();
    client.to('offline');
    assert.deepEqual(s.board(STREET), { ready: false, capacity: 10, notes: [] });
    client.to('online', STREET);
    client.emit('msg:board_state', { street: STREET, capacity: 10, boards: [{ board: 0, notes: [NOTE] }] });
    assert.equal(s.board(STREET).notes.length, 1);
  });
});
