/**
 * The Social drawer online (js/ui/social-drawer.js with features/party-feature.js and
 * features/groups-feature.js): with the drawer as engine.social, a party is a Party tab
 * (its roster over the party's lines, what you type there goes as /p), each open chat
 * channel is a tab of its own (its lines, Who is here and Close over them, what you type
 * there goes to the channel), and nothing is added to the old dock (no Party pill, no
 * chat tabs over the input). Driven by a fake realtime client and a fake site, as
 * tests/groups.test.js and tests/party.test.js do.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { FakeEl, memoryStore, page } from './social-fake-dom.js';
import { mountSocialDrawer } from '../public/js/ui/social-drawer.js?v=5802b41c';
import { createNotifier } from '../public/js/notify.js?v=d85330ff';
import { partyFeature } from '../public/js/features/party-feature.js?v=e0756bfb';
import { groupsFeature } from '../public/js/features/groups-feature.js?v=801a3fec';

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
    players: [{ id: 6, name: 'Fi' }],
    here: 2,
    sent,
    on(type, fn) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(fn); return () => listeners.get(type).delete(fn); },
    emit(type, payload) { for (const fn of listeners.get(type) || []) fn(payload); },
    msg(m) { this.emit(`msg:${m.t}`, m); },
    send(kind, payload = {}) { sent.push({ t: kind, ...payload }); return true; },
    take(kind) { const out = sent.filter((m) => m.t === kind); for (const m of out) sent.splice(sent.indexOf(m), 1); return out; },
  };
}

const wait = (ms = 0) => new Promise((r) => setTimeout(r, ms));

describe('the Social drawer online: parties and chat channels', () => {
  const saved = {};
  let savedStorage;
  let t;
  let client;
  let engine;
  let drawer;
  const events = [];

  before(() => {
    for (const k of ['document', 'fetch', 'addEventListener', 'groddleGroups', 'groddleParty', 'groddleBuddies', 'groddleRealtime', 'groddleSocial', 'GRODDLE_MP_BOOT', 'CSS', 'requestAnimationFrame']) saved[k] = globalThis[k];
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
    const store = memoryStore();
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
      toast: (x) => events.push(`toast:${x}`),
      prompt: (p) => { events.push(`prompt:${p.text}`); p.onChoice?.(true); return 'uid'; },
      chatLine: (name, text) => drawer.localLine(name, text),
    };
  });

  after(() => {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete globalThis[k];
      else globalThis[k] = v;
    }
    delete globalThis.localStorage;
    if (savedStorage) Object.defineProperty(globalThis, 'localStorage', savedStorage);
  });

  it('a party is a Party tab with its roster over its lines, and no Party pill in the dock', () => {
    partyFeature.onTick(16, 0, engine);
    assert.ok(globalThis.groddleParty);
    assert.equal(t.doc.body.querySelector('[data-party-btn]'), null, 'no pill');
    assert.deepEqual(drawer.tabs, ['activity', 'local', 'buddies'], 'no Party tab out of a party');
    client.msg({ t: 'party', party: { members: [{ id: 1, name: 'Ada', leader: true, online: true, street: '' }, { id: 6, name: 'Fi', online: true, street: '' }] } });
    assert.deepEqual(drawer.tabs, ['activity', 'local', 'party', 'buddies']);
    assert.equal(drawer.tab, 'local', 'the tab in front stays (what you are typing keeps going where it was)');
    client.msg({ t: 'party_said', id: 6, name: 'Fi', text: 'meet at the vendor', at: 5 });
    client.msg({ t: 'party_said', id: 1, name: 'Ada', text: 'on my way', at: 6 });
    assert.equal(drawer.unread('party'), 1, 'your own line is not news');
    assert.deepEqual(drawer.lines('party').map((l) => [l.name, l.text, l.mine]), [['Fi', 'meet at the vendor', false], ['Ada', 'on my way', true]]);
    assert.equal(engine.data.partyLastSaid, 'Ada:on my way');
    drawer.select('party');
    const head = t.dock.querySelector('[data-social-view-head]');
    assert.ok(head.querySelector('[data-party-box]'), 'the roster, invites and Leave over the lines');
    assert.equal(head.querySelector('[data-party-box]').hidden, false);
    assert.deepEqual(head.querySelectorAll('[data-party-member]').map((li) => li.getAttribute('data-party-member')), ['1', '6']);
    assert.match(t.dock.querySelector('[data-social-log]').textContent, /Fi meet at the vendor.*You on my way/);
    t.input.value = 'see you there';
    t.form.dispatch('submit');
    assert.equal(t.input.value, '/p see you there', 'what you type in the Party tab goes to the party (/p)');
  });

  it('party notes go to the Party tab in a party, and to Local out of one; a party that ends takes its tab', () => {
    client.msg({ t: 'party_activity', text: 'Fi joined the party.' });
    assert.equal(drawer.lines('party').at(-1).note, true);
    client.msg({ t: 'party', party: null });
    assert.deepEqual(drawer.tabs, ['activity', 'local', 'buddies']);
    assert.equal(drawer.tab, 'local');
    client.msg({ t: 'party_activity', text: 'You are not in a party.' });
    assert.deepEqual(drawer.lines('local').at(-1), { ...drawer.lines('local').at(-1), name: 'Party', text: 'You are not in a party.' });
  });

  it('each open chat channel is a tab of its own: its lines, Who is here and Close over them, what you type goes there', async () => {
    groupsFeature.onTick(16, 0, engine);
    await wait(5);
    const g = globalThis.groddleGroups;
    assert.ok(g);
    assert.equal(t.dock.querySelector('[data-groups-tabs]'), null, 'no chat tabs over the input');
    client.msg({ t: 'groups_status', groups: [12], channels: ['global', 'help'], open: [] });
    await g.openChat('global');
    assert.deepEqual(client.take('channel_join'), [{ t: 'channel_join', channel: 'global' }]);
    assert.deepEqual(drawer.tabs, ['activity', 'local', 'global', 'buddies']);
    assert.equal(drawer.tab, 'global', 'opening a chat brings it to the front');
    assert.equal(drawer.isOpen(), true);
    client.msg({ t: 'channel_joined', channel: 'global', history: [{ id: 2, name: 'Bo', text: 'hello', at: 1 }] });
    client.msg({ t: 'channel_said', channel: 'global', id: 1, name: 'Ada', text: 'hi Bo', at: 2 });
    assert.deepEqual(drawer.lines('global').map((l) => [l.name, l.text, l.mine]), [['Bo', 'hello', false], ['Ada', 'hi Bo', true]]);
    assert.equal(t.input.placeholder, 'Chat in Global Chat');
    t.input.value = 'anyone selling beans?';
    t.form.dispatch('submit');
    assert.deepEqual(client.take('channel_say'), [{ t: 'channel_say', channel: 'global', text: 'anyone selling beans?' }]);
    // The drawer's Local is the feature's Street: a line typed there is the game's, not the channel's.
    drawer.select('local');
    assert.equal(g.tab, 'street');
    assert.equal(g.submit('hi street'), false);
    assert.equal(client.take('channel_say').length, 0);
    client.msg({ t: 'channel_said', channel: 'global', id: 2, name: 'Bo', text: 'me!', at: 3 });
    assert.equal(drawer.unread('global'), 1);
    // A second chat: a group's, by its name.
    await g.openChat('group:12', { focus: false });
    client.msg({ t: 'channel_joined', channel: 'group:12', history: [] });
    assert.deepEqual(drawer.tabs, ['activity', 'local', 'global', 'group:12', 'buddies']);
    assert.match(t.dock.querySelector('[data-social-tab="group:12"]').textContent, /Zebra Club/);
    drawer.select('global');
    const head = t.dock.querySelector('[data-social-view-head]');
    head.querySelector('[data-groups-who="global"]').click();
    assert.deepEqual(client.take('channel_who'), [{ t: 'channel_who', channel: 'global' }]);
    head.querySelector('[data-groups-close-chat="global"]').click();
    assert.deepEqual(client.take('channel_leave'), [{ t: 'channel_leave', channel: 'global' }]);
    assert.deepEqual(drawer.tabs, ['activity', 'local', 'group:12', 'buddies']);
    assert.equal(drawer.tab, 'local');
  });
});
