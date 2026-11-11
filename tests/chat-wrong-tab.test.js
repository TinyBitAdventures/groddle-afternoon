/**
 * A line typed in the Social drawer goes to the tab the drawer shows (a player's report, 2026-11-08:
 * typing in Local, the line showed up in Global). groups-feature kept its own idea of the tab in
 * front, read from the chats remembered on this device (groddle-chats:<id>), while the drawer opens
 * on Local online, and nothing told the feature: a player who last chatted in Global sent their next
 * Local lines to Global. Now the feature asks the drawer what it shows each time a line goes.
 * Driven by a fake realtime client and a fake site, as tests/social-drawer-mp.test.js is.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { FakeEl, memoryStore, page } from './social-fake-dom.js';
import { mountSocialDrawer } from '../public/js/ui/social-drawer.js?v=2aa33a1a';
import { createNotifier } from '../public/js/notify.js?v=1fb97b21';
import { drawerChat } from '../public/js/groups.js?v=c9635d96';

const ANSWER = {
  max: 20,
  count: 1,
  groups: [{ id: 12, name: 'Zebra Club', description: 'Stripes.', mode: 'public', members: 3, role: 'member' }],
  invites: [],
  channels: { global: true, help: 'newbie', trade: false, silenced: [] },
  watch: { token: 'gtok.sig', expiresIn: 3600 },
};

function fakeClient() {
  const listeners = new Map();
  const sent = [];
  return {
    state: 'online',
    me: { id: 1, name: 'Ada' },
    players: [],
    here: 1,
    sent,
    on(type, fn) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(fn); return () => listeners.get(type).delete(fn); },
    emit(type, payload) { for (const fn of listeners.get(type) || []) fn(payload); },
    msg(m) { this.emit(`msg:${m.t}`, m); },
    send(kind, payload = {}) { sent.push({ t: kind, ...payload }); return true; },
    take(kind) { const out = sent.filter((m) => m.t === kind); for (const m of out) sent.splice(sent.indexOf(m), 1); return out; },
  };
}

const wait = (ms = 0) => new Promise((r) => setTimeout(r, ms));

describe('drawerChat: the chat a typed line goes to', () => {
  it('follows what the drawer shows: Local is the street, an open chat is itself, anything else the street', () => {
    const open = new Set(['global', 'group:12']);
    assert.equal(drawerChat('local', open), 'street');
    assert.equal(drawerChat('global', open), 'global');
    assert.equal(drawerChat('group:12', open), 'group:12');
    assert.equal(drawerChat('party', open), 'party');
    assert.equal(drawerChat('global', new Set()), 'street', 'Global before it is joined: nothing goes to it');
    for (const other of ['activity', 'buddies', 'chats', 'im:7', 'butler', '', null, undefined]) assert.equal(drawerChat(other, open), 'street', String(other));
    assert.equal(drawerChat('help', ['help']), 'help', 'an array of open chats works too');
  });
});

describe('a Global tab remembered from last time never takes Local lines', () => {
  const saved = {};
  let savedStorage;
  let t;
  let client;
  let engine;
  let drawer;
  let groupsFeature;

  before(async () => {
    for (const k of ['document', 'fetch', 'addEventListener', 'groddleGroups', 'groddleSocial', 'GRODDLE_MP_BOOT', 'CSS', 'requestAnimationFrame']) saved[k] = globalThis[k];
    savedStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    t = page();
    const menu = new FakeEl('div');
    menu.id = 'more-list';
    t.doc.body.append(menu);
    globalThis.document = t.doc;
    globalThis.addEventListener = () => {};
    globalThis.CSS = { escape: (s) => s };
    globalThis.requestAnimationFrame = (fn) => fn();
    globalThis.GRODDLE_MP_BOOT = { nonce: 'abcdef0123', player: { id: 1, name: 'Ada' } };
    // Last visit: Global Chat open and in front.
    const store = memoryStore({ 'groddle-chats:1': JSON.stringify({ open: ['global'], tab: 'global', intro: {} }) });
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, writable: true, value: store });
    globalThis.fetch = async () => ({ status: 200, ok: true, headers: { get: () => null }, json: async () => structuredClone(ANSWER) });
    const notifier = createNotifier({ onChange: () => drawer?.update() });
    drawer = mountSocialDrawer({ root: t.game, dock: t.dock, notifier, mode: 'online', storage: store, width: () => 1920, streetName: () => 'Hechey Track' });
    client = fakeClient();
    engine = {
      mode: 'multiplayer',
      started: true,
      social: drawer,
      pc: { level: 4, imaginationUpgrades: [] },
      query: (hook) => (hook === 'realtimeClient' ? client : null),
      setData: (k, v) => { engine.data[k] = v; },
      data: {},
      toast: () => {},
      prompt: (p) => { p.onChoice?.(true); return 'uid'; },
      chatLine: (name, text) => drawer.localLine(name, text),
    };
    // Its own copy: the feature keeps one session per page.
    ({ groupsFeature } = await import('../public/js/features/groups-feature.js?fresh=chat-wrong-tab'));
  });

  after(() => {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete globalThis[k];
      else globalThis[k] = v;
    }
    delete globalThis.localStorage;
    if (savedStorage) Object.defineProperty(globalThis, 'localStorage', savedStorage);
  });

  it('the drawer opens on Local, and a line typed there stays the street\'s', async () => {
    assert.equal(drawer.showing, 'local', 'online, the drawer opens on Local');
    groupsFeature.onTick(16, 0, engine);
    await wait(5);
    const g = globalThis.groddleGroups;
    assert.ok(g);
    client.msg({ t: 'groups_status', groups: [12], channels: ['global', 'help'], open: [] });
    client.msg({ t: 'channel_joined', channel: 'global', history: [{ id: 2, name: 'Bo', text: 'hello', at: 1 }] });
    assert.ok(g.chats.has('global'), 'the remembered chat came back');
    assert.equal(drawer.showing, 'local');
    assert.equal(g.tab, 'street', 'the feature follows the drawer, not the tab remembered');
    t.input.value = 'hi street';
    t.form.dispatch('submit');
    assert.deepEqual(client.take('channel_say'), [], 'nothing went to Global Chat');
    assert.equal(t.input.value, 'hi street', 'the line is left for the game, which says it on Local');
  });

  it('picking Global sends there; back on Local the street again, even if nothing told the feature', () => {
    const g = globalThis.groddleGroups;
    drawer.select('global');
    t.input.value = 'anyone selling beans?';
    t.form.dispatch('submit');
    assert.deepEqual(client.take('channel_say'), [{ t: 'channel_say', channel: 'global', text: 'anyone selling beans?' }]);
    drawer.select('local');
    assert.equal(g.submit('back on the street'), false, 'a Local line is the game\'s');
    assert.deepEqual(client.take('channel_say'), []);
    assert.equal(engine.data.groupsTab, 'street');
  });
});
