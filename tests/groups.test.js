/**
 * Groups and chat channels in multiplayer (register G326), the game side:
 * js/groups.js (the list, the tabs, the copy), the group calls in
 * js/minn-account.js, and js/features/groups-feature.js (off in solo, wired
 * before realtime, against a fake DOM and a fake realtime client). The
 * site's routes and tables are read from the site repo and the server's
 * messages from the server repo (both skip without them, tools/repos.mjs);
 * channels_test.go has the server's own rules.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  CHANNELS,
  CHANNEL_INTRO,
  GROUPS_MAX,
  GROUP_TEXT,
  chatLabel,
  chatLine,
  groupChannel,
  groupIdOf,
  groupNameProblem,
  knownChat,
  mayOpen,
  normalizeGroups,
  pushLine,
  readMemory,
  tabCommand,
  tabOrder,
  writeMemory,
} from '../public/js/groups.js?v=g326-1';
import { createMinnAccount } from '../public/js/minn-account.js?v=nbhome-10';
import { groupsFeature } from '../public/js/features/groups-feature.js?v=g466-1';
import { FEATURES } from '../public/js/features/index.js?v=registry-341';
import { serverPath, sitePath, skipWithoutServer, skipWithoutSite } from '../tools/repos.mjs';

const root = join(import.meta.dirname, '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');

const ANSWER = {
  max: 20,
  count: 2,
  groups: [
    { id: 12, name: 'Zebra Club', description: 'Stripes.', mode: 'public', members: 3, role: 'member' },
    { id: 7, name: 'apple pickers', description: '', mode: 'private', members: 1, role: 'admin' },
  ],
  invites: [{ id: 9, name: 'Nine', description: '', mode: 'private', members: 2, invitedBy: { id: 4, name: 'Di' } }],
  channels: { global: true, help: 'newbie', trade: false, silenced: [] },
  watch: { token: 'gtok.sig', expiresIn: 3600 },
};

describe('groups rules (js/groups.js)', () => {
  it('reads the site\'s answer', () => {
    const list = normalizeGroups(ANSWER);
    assert.equal(list.max, GROUPS_MAX);
    assert.deepEqual(list.groups.map((g) => [g.id, g.mode, g.role]), [[12, 'public', 'member'], [7, 'private', 'admin']]);
    assert.deepEqual(list.invites.map((g) => [g.id, g.invitedBy.name]), [[9, 'Di']]);
    assert.deepEqual(list.channels, { global: true, help: 'newbie', trade: false, silenced: [] });
    assert.equal(list.token, 'gtok.sig');
    const odd = normalizeGroups({ groups: [{ id: 'x' }, { id: 3, mode: 'secret', role: 'king' }], invites: [{ id: 3 }], channels: { help: 'regular', silenced: ['chat', 'nope'] } });
    assert.deepEqual(odd.groups.map((g) => [g.id, g.mode, g.role]), [[3, 'public', 'member']]);
    assert.equal(odd.invites.length, 0, 'an invite to a group you are in is not shown');
    assert.equal(odd.channels.help, 'newbie');
    assert.deepEqual(odd.channels.silenced, ['chat']);
    assert.equal(odd.token, '');
  });

  it('names chats and orders the tabs as the original\'s contact list did', () => {
    const list = normalizeGroups(ANSWER);
    assert.equal(groupChannel(12), 'group:12');
    assert.equal(groupIdOf('group:12'), 12);
    for (const bad of ['group:0', 'group:012', 'group:', 'global', 'g12']) assert.equal(groupIdOf(bad), 0, bad);
    assert.ok(knownChat('help') && knownChat('group:3') && !knownChat('newbie') && !knownChat('street'));
    assert.deepEqual(CHANNELS.map((c) => c.label), ['Live Help', 'Global Chat', 'Trade Channel']);
    assert.equal(chatLabel('group:7', list), 'apple pickers');
    assert.equal(chatLabel('global', list), 'Global Chat');
    // BaseContacts.as:163-177: Live Help, Global, Trade, then groups by name, case aside.
    assert.deepEqual(tabOrder(['group:12', 'trade', 'global', 'group:7', 'help'], list, { inParty: true }), ['street', 'party', 'help', 'global', 'trade', 'group:7', 'group:12']);
    assert.deepEqual(tabOrder([], list), ['street']);
  });

  it('says who may open what', () => {
    const list = normalizeGroups(ANSWER);
    assert.ok(mayOpen('global', list) && mayOpen('help', list) && mayOpen('group:12', list));
    assert.ok(!mayOpen('trade', list), 'the Trade Channel needs the upgrade (player.js:3404)');
    assert.ok(!mayOpen('group:9', list), 'an invitation is not membership');
    assert.ok(mayOpen('trade', normalizeGroups({ ...ANSWER, channels: { ...ANSWER.channels, trade: true } })));
    assert.ok(!mayOpen('global', null));
  });

  it('reads what is typed in a chat tab', () => {
    assert.deepEqual(tabCommand(' hi there '), { say: 'hi there' });
    assert.deepEqual(tabCommand('/who'), { who: true });
    assert.deepEqual(tabCommand('/WHO '), { who: true });
    assert.equal(tabCommand('/happy'), null, 'other commands are the game\'s');
    assert.equal(tabCommand('   '), null);
  });

  it('checks a group name as the site does', () => {
    assert.equal(groupNameProblem('The Order of the Lem'), '');
    assert.equal(groupNameProblem('ab'), groupNameProblem(''));
    assert.ok(groupNameProblem('x'.repeat(33)));
    assert.ok(groupNameProblem(' -nope'));
  });

  it('keeps lines and remembers the open chats per player', () => {
    const lines = [];
    for (let i = 0; i < 60; i++) pushLine(lines, { text: String(i) });
    assert.equal(lines.length, 50);
    assert.equal(lines[0].text, '10');
    assert.equal(chatLine({ id: 0, text: 'x' }), null);
    assert.deepEqual(chatLine({ id: 2, name: 'Bo', text: 'hi', at: 5 }), { id: 2, name: 'Bo', text: 'hi', at: 5 });
    const store = new Map();
    const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
    assert.ok(writeMemory(storage, 5, { open: ['global', 'group:3', 'bogus', 'global'], tab: 'group:3', intro: { help: true } }));
    assert.deepEqual(readMemory(storage, 5), { open: ['global', 'group:3'], tab: 'group:3', intro: { help: true } });
    assert.deepEqual(readMemory(storage, 6), { open: [], tab: 'street', intro: {} });
    const broken = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); } };
    assert.deepEqual(readMemory(broken, 5), { open: [], tab: 'street', intro: {} });
    assert.equal(writeMemory(broken, 5, { open: [] }), false);
  });

  it('keeps the original\'s channel dialogs', () => {
    assert.equal(CHANNEL_INTRO.help.ok, 'OK! I will only use this for help!');
    assert.equal(CHANNEL_INTRO.trade.title, 'Hello! This is the Trade Channel!');
    for (const t of [...Object.values(CHANNEL_INTRO).flatMap((d) => Object.values(d)), ...Object.values(GROUP_TEXT).filter((v) => typeof v === 'string')]) assert.ok(!t.includes('—'), `no em-dashes: ${t}`);
  });
});

// —— minn-account group calls ——

function routedFetch(routes) {
  const calls = [];
  const fn = async (url, init = {}) => {
    calls.push({ url, ...init });
    const key = Object.keys(routes).find((k) => url.endsWith(k) && (!routes[k].method || routes[k].method === (init.method || 'GET')));
    const answer = key ? routes[key] : { status: 200, body: ANSWER };
    return { status: answer.status, ok: answer.status >= 200 && answer.status < 300, headers: { get: () => null }, json: async () => answer.body };
  };
  return { fn, calls };
}

describe('minn-account group calls', () => {
  const BASE = 'https://groddle.localhost/';
  it('calls the routes with the nonce', async () => {
    const { fn, calls } = routedFetch({ 'groups/search?q=zeb%20ra': { status: 200, body: { q: 'zeb ra', groups: [] } } });
    const a = createMinnAccount({ baseUri: BASE, fetch: fn, nonce: 'abcdef0123' });
    assert.equal((await a.groups()).max, 20);
    await a.searchGroups('zeb ra');
    await a.group(12);
    await a.createGroup({ name: 'Zebra Club', description: 'Stripes.', mode: 'private' });
    await a.joinGroup('12');
    await a.leaveGroup(12);
    await a.inviteToGroup(7, '4');
    await a.declineGroupInvite(9);
    assert.deepEqual(calls.map((c) => [c.method || 'GET', c.url.replace(`${BASE}wp-json/groddle/v1/`, ''), c.body ?? null, c.headers['X-WP-Nonce']]), [
      ['GET', 'groups', null, 'abcdef0123'],
      ['GET', 'groups/search?q=zeb%20ra', null, 'abcdef0123'],
      ['GET', 'groups/12', null, 'abcdef0123'],
      ['POST', 'groups', '{"name":"Zebra Club","description":"Stripes.","mode":"private"}', 'abcdef0123'],
      ['POST', 'groups/12/members', null, 'abcdef0123'],
      ['DELETE', 'groups/12/members', null, 'abcdef0123'],
      ['POST', 'groups/7/invites', '{"id":4}', 'abcdef0123'],
      ['DELETE', 'groups/9/invites', null, 'abcdef0123'],
    ]);
  });

  it('throws the site\'s refusal with its words', async () => {
    const { fn } = routedFetch({ 'groups/3/members': { status: 400, method: 'POST', body: { code: 'groddle_group_limit', message: GROUP_TEXT.limit(20) } } });
    const a = createMinnAccount({ baseUri: BASE, fetch: fn, nonce: 'abcdef0123' });
    await assert.rejects(a.joinGroup(3), (err) => err.status === 400 && err.code === 'groddle_group_limit' && err.message === GROUP_TEXT.limit(20));
  });
});

// —— The feature ——

class FakeEl {
  constructor(tag) {
    this.tagName = tag.toUpperCase();
    this.children = [];
    this.attrs = {};
    this.dataset = {};
    this.listeners = {};
    this.hidden = false;
    this.textContent = '';
    this.disabled = false;
    this.value = '';
    this.placeholder = '';
    this.id = '';
  }
  setAttribute(k, v) {
    this.attrs[k] = String(v);
    if (k === 'hidden') this.hidden = true;
    if (k === 'id') this.id = String(v);
    if (k === 'placeholder') this.placeholder = String(v);
    if (k.startsWith('data-')) this.dataset[k.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = String(v);
  }
  append(...kids) { for (const k of kids) { if (k && typeof k === 'object') k.parentElement = this; } this.children.push(...kids); }
  insertBefore(kid, ref) { kid.parentElement = this; const i = this.children.indexOf(ref); this.children.splice(i < 0 ? this.children.length : i, 0, kid); }
  replaceChildren(...kids) { this.children = kids; }
  addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
  click() { this.fire('click'); }
  focus() {}
  fire(type, e = {}) { for (const fn of this.listeners[type] || []) fn({ preventDefault() {}, stopPropagation() {}, target: this, ...e }); }
  all() { return [this, ...this.children.flatMap((c) => (c instanceof FakeEl ? c.all() : []))]; }
  find(attr, value) { return this.all().find((n) => attr in n.attrs && (value === undefined || n.attrs[attr] === String(value))); }
  findAll(attr) { return this.all().filter((n) => attr in n.attrs); }
  text() { return this.all().map((n) => n.textContent).concat(this.all().flatMap((n) => n.children.filter((c) => c && c.text).map((c) => c.text))).join(' '); }
}

function fakeClient() {
  const listeners = new Map();
  const sent = [];
  return {
    state: 'online',
    me: { id: 1, name: 'Ada' },
    players: [{ id: 6, name: 'Fi' }],
    sent,
    on(type, fn) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(fn); return () => listeners.get(type).delete(fn); },
    emit(type, payload) { for (const fn of listeners.get(type) || []) fn(payload); },
    msg(m) { this.emit(`msg:${m.t}`, m); },
    send(kind, payload = {}) { sent.push({ t: kind, ...payload }); return this.state === 'online'; },
    take(kind) { const out = sent.filter((m) => m.t === kind); for (const m of out) sent.splice(sent.indexOf(m), 1); return out; },
  };
}

const wait = (ms = 0) => new Promise((r) => setTimeout(r, ms));

describe('groups feature (js/features/groups-feature.js)', () => {
  const saved = {};
  let savedStorage;
  let client;
  let engine;
  let dock;
  let form;
  let input;
  let menu;
  let answer;
  const events = [];
  const store = new Map();

  before(() => {
    for (const k of ['document', 'fetch', 'groddleGroups', 'groddleBuddies', 'GRODDLE_MP_BOOT']) saved[k] = globalThis[k];
    // Node's own localStorage is a getter that warns when read without a file: keep its descriptor, not its value.
    savedStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    const body = new FakeEl('body');
    menu = new FakeEl('div');
    dock = new FakeEl('section');
    form = new FakeEl('form');
    input = new FakeEl('input');
    input.placeholder = 'Chat with this street (press /)';
    dock.append(form);
    form.append(input);
    const byId = { 'more-list': menu, 'local-chat-dock': dock, 'local-chat-form': form, 'local-chat-input': input };
    globalThis.document = { baseURI: 'https://groddle.localhost/', createElement: (t) => new FakeEl(t), createTextNode: (t) => ({ text: t }), head: new FakeEl('head'), body, getElementById: (id) => byId[id] || null, querySelector: () => null };
    globalThis.GRODDLE_MP_BOOT = { nonce: 'abcdef0123', player: { id: 1, name: 'Ada' } };
    // Remembered from last time: Global Chat open and in front, and a group no longer joined.
    store.set('groddle-chats:1', JSON.stringify({ open: ['global', 'group:99'], tab: 'global', intro: {} }));
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, writable: true, value: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) } });
    globalThis.groddleBuddies = { list: { buddies: [{ id: 4, name: 'Di' }] } };
    answer = structuredClone(ANSWER);
    globalThis.fetch = async (url, init = {}) => {
      const method = init.method || 'GET';
      const path = String(url).replace('https://groddle.localhost/wp-json/groddle/v1/', '');
      events.push(`fetch:${method} ${path}`);
      let out = answer;
      if (method === 'DELETE' && path === 'groups/12/members') {
        answer.groups = answer.groups.filter((g) => g.id !== 12);
        answer.watch = { token: 'gtok2.sig', expiresIn: 3600 };
      }
      if (method === 'POST' && path === 'groups') out = { status: 400, body: { code: 'groddle_group_limit', message: GROUP_TEXT.limit(20) } };
      if (out.status) return { status: out.status, ok: false, headers: { get: () => null }, json: async () => out.body };
      return { status: 200, ok: true, headers: { get: () => null }, json: async () => out };
    };
    client = fakeClient();
    engine = {
      mode: 'multiplayer',
      started: true,
      pc: { level: 4, imaginationUpgrades: [] },
      query: (hook, id) => (hook === 'realtimeClient' ? client : hook === 'realtimeHidden' ? (id === 3 ? true : null) : null),
      setData: (k, v) => { engine.data[k] = v; },
      data: {},
      toast: (t) => events.push(`toast:${t}`),
      prompt: (p) => { events.push(`prompt:${p.title || ''}|${p.text}`); p.onChoice?.(true); },
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

  it('does nothing in solo', () => {
    groupsFeature.onTick(16, 0, { mode: 'solo', started: true, query: () => client });
    assert.equal(globalThis.groddleGroups, undefined);
    assert.equal(client.sent.length, 0);
  });

  it('is wired before realtime, after buddies and profiles', () => {
    const ids = FEATURES.map((f) => f.id);
    assert.ok(ids.indexOf('groups') > ids.indexOf('buddies'));
    assert.ok(ids.indexOf('groups') > ids.indexOf('profiles'));
    assert.ok(ids.indexOf('groups') < ids.indexOf('realtime'));
    assert.equal(ids.indexOf('street-objects') + 1, ids.indexOf('realtime'), 'street objects stays just before realtime');
    assert.match(read('public/js/features/index.js'), /groups-feature\.js\?v=g466-1'/);
  });

  it('loads the list, sends the signed list, and opens the chats remembered', async () => {
    groupsFeature.onTick(16, 0, engine);
    await wait(5);
    const s = globalThis.groddleGroups;
    assert.ok(s);
    assert.deepEqual(client.take('groups_watch'), [{ t: 'groups_watch', token: 'gtok.sig' }]);
    assert.equal(engine.data.groupsCount, '2');
    assert.equal(menu.find('id', 'groups-btn').textContent, 'Groups (1)', 'an invitation shows on the Menu item');
    // The server's word: the chats are opened on this socket, a group no longer in the list is dropped.
    client.msg({ t: 'groups_status', groups: [7, 12], channels: ['global', 'help'], newbie: true, open: [] });
    assert.deepEqual(client.take('channel_join'), [{ t: 'channel_join', channel: 'global' }]);
    assert.deepEqual([...s.chats.keys()], ['global']);
    client.msg({ t: 'channel_joined', channel: 'global', history: [{ id: 2, name: 'Bo', text: 'hello', at: 1 }, { id: 3, name: 'Cy', text: 'blocked words', at: 2 }] });
    assert.equal(s.tab, 'global');
    assert.deepEqual(s.chats.get('global').lines.map((l) => l.text), ['hello'], 'a blocked player\'s lines are dropped (RightSideManager.as:218-223)');
    const tabs = dock.find('data-groups-tabs');
    assert.deepEqual(tabs.findAll('data-groups-tab').map((t) => t.attrs['data-groups-tab']), ['street', 'global']);
    assert.equal(dock.find('data-groups-box').hidden, false);
    assert.equal(input.placeholder, 'Chat in Global Chat');
  });

  it('sends what is typed in a chat tab there, and leaves the rest to the game', () => {
    const s = globalThis.groddleGroups;
    assert.equal(s.submit('anyone selling beans?'), true);
    assert.deepEqual(client.take('channel_say'), [{ t: 'channel_say', channel: 'global', text: 'anyone selling beans?' }]);
    assert.equal(input.value, '');
    assert.equal(s.submit('/who'), true);
    assert.deepEqual(client.take('channel_who'), [{ t: 'channel_who', channel: 'global' }]);
    assert.equal(s.submit('/happy'), false, 'an emote is still the game\'s');
    s.setTab('street');
    assert.equal(s.submit('hi street'), false);
    assert.equal(client.take('channel_say').length, 0);
    assert.equal(input.placeholder, 'Chat with this street (press /)');
  });

  it('counts new lines on a tab not in front, and drops a blocked player\'s', () => {
    const s = globalThis.groddleGroups;
    client.msg({ t: 'channel_said', channel: 'global', id: 2, name: 'Bo', text: 'beans here', at: 3 });
    client.msg({ t: 'channel_said', channel: 'global', id: 3, name: 'Cy', text: 'spam', at: 4 });
    client.msg({ t: 'channel_said', channel: 'global', id: 1, name: 'Ada', text: 'mine', at: 5 });
    assert.equal(engine.data.groupsUnread, 'global:1');
    assert.equal(engine.data.groupsLastSaid, 'global|Ada|mine');
    const tab = dock.find('data-groups-tab', 'global');
    assert.match(dock.find('data-groups-tabs').text(), /Global Chat/);
    assert.ok(tab.children.some((c) => c.attrs?.class === 'grp-unread' && c.textContent === '1'));
    s.setTab('global');
    assert.equal(engine.data.groupsUnread, '');
    assert.deepEqual(s.chats.get('global').lines.map((l) => l.text), ['hello', 'beans here', 'mine']);
    assert.deepEqual(JSON.parse(store.get('groddle-chats:1')), { open: ['global'], tab: 'global', intro: {} });
  });

  it('opens Live Help with the original\'s dialog, and refuses the Trade Channel without the upgrade', async () => {
    const s = globalThis.groddleGroups;
    events.length = 0;
    await s.openChat('help');
    assert.ok(events.includes(`prompt:${CHANNEL_INTRO.help.title}|${CHANNEL_INTRO.help.body}`));
    assert.deepEqual(client.take('channel_join'), [{ t: 'channel_join', channel: 'help' }]);
    assert.equal(s.tab, 'help');
    assert.equal(JSON.parse(store.get('groddle-chats:1')).intro.help, true);
    events.length = 0;
    await s.openChat('trade', { intro: false });
    assert.ok(events.includes(`toast:${GROUP_TEXT.needsTrade}`));
    assert.equal(client.take('channel_join').length, 0);
  });

  it('opens a group\'s chat, hears its notes, and closes it on leaving the group', async () => {
    const s = globalThis.groddleGroups;
    await s.openChat(groupChannel(12));
    assert.deepEqual(client.take('channel_join'), [{ t: 'channel_join', channel: 'group:12' }]);
    client.msg({ t: 'channel_joined', channel: 'group:12', history: [] });
    client.msg({ t: 'channel_note', channel: 'group:12', text: 'Bo is here' });
    assert.deepEqual(s.chats.get('group:12').lines, [{ note: true, text: 'Bo is here' }]);
    assert.deepEqual(dock.find('data-groups-tabs').findAll('data-groups-tab').map((t) => t.attrs['data-groups-tab']), ['street', 'help', 'global', 'group:12']);
    events.length = 0;
    await s.leave(normalizeGroups(answer).groups.find((g) => g.id === 12));
    assert.ok(events.includes('fetch:DELETE groups/12/members'));
    assert.deepEqual(client.take('groups_watch'), [{ t: 'groups_watch', token: 'gtok2.sig' }], 'a fresh list after leaving');
    assert.ok(!s.chats.has('group:12'));
    assert.equal(s.tab, 'street');
    // The server's channel_left (from the new list) changes nothing more.
    client.msg({ t: 'channel_left', channel: 'group:12' });
    assert.ok(!s.chats.has('group:12'));
  });

  it('shows the Party tab while in a party and sends what is typed there as /p', () => {
    const s = globalThis.groddleGroups;
    client.msg({ t: 'party', party: { members: [] } });
    assert.ok(dock.find('data-groups-tab', 'party'));
    s.setTab('party');
    assert.equal(s.submit('to the party'), false, 'the game sends it, as /p');
    assert.equal(input.value, '/p to the party');
    client.msg({ t: 'party', party: null });
    assert.equal(s.tab, 'street');
    assert.equal(dock.find('data-groups-tab', 'party'), undefined);
  });

  it('draws the panel: channels, groups, invitations, find and make, and says the site\'s refusals', async () => {
    const s = globalThis.groddleGroups;
    s.openPanel();
    await wait(5);
    const panel = document.body.children.find((c) => c.attrs?.id === 'groups-shade');
    assert.equal(panel.hidden, false);
    assert.ok(panel.find('data-channel-open', 'trade') && panel.find('data-channel-close', 'help'));
    assert.match(panel.text(), /The newbie channel, until level 11/);
    assert.ok(panel.find('data-group-leave', '7') && panel.find('data-group-chat', '7'));
    assert.ok(panel.find('data-group-accept', '9'), 'the invitation to Nine');
    assert.ok(panel.find('data-groups-make'));
    assert.match(panel.text(), /Your groups \(1 of 20\)/);
    events.length = 0;
    await s.create({ name: 'Zz', description: '', mode: 'public' });
    assert.match(panel.text(), /Group names are 3 to 32/);
    await s.create({ name: 'Twenty First', description: '', mode: 'public' });
    assert.ok(events.includes(`toast:${GROUP_TEXT.limit(20)}`));
    s.closePanel();
    assert.equal(engine.data.groupsPanel, 'closed');
  });
});

describe('Trade Channelling in multiplayer (imagination-feature)', () => {
  it('is dealt in multiplayer only', () => {
    const src = read('public/js/features/imagination-feature.js');
    assert.match(src, /offerable: engine\?\.mode === 'multiplayer' \? offeredInMultiplayer : isOfferedInRemake/);
    assert.match(src, /MULTIPLAYER_OFFERS = new Set\(\[\s*'trade_channel',/);
    const data = read('public/js/imagination-data.js');
    assert.match(data, /"trade_channel": \{\n  "name": "Trade Channelling"/);
  });
});

describe('groups across the repos', () => {
  it('the site declares the tables and routes', { skip: skipWithoutSite }, () => {
    const manifest = JSON.parse(readFileSync(sitePath('minn.json'), 'utf8'));
    assert.ok(manifest.tables.groddle_groups.includes('UNIQUE KEY name_key (name_key)'));
    assert.ok(manifest.tables.groddle_group_members.includes('PRIMARY KEY  (group_id,user_id)'));
    assert.ok(manifest.tables.groddle_group_invites.includes('PRIMARY KEY  (group_id,user_id)'));
    const php = readFileSync(sitePath('src/Groups.php'), 'utf8');
    for (const route of ["'/groddle/v1/groups'", "'/groddle/v1/groups/search'", "'/groddle/v1/groups/{id:\\d+}'", "'/groddle/v1/groups/{id:\\d+}/members'", "'/groddle/v1/groups/{id:\\d+}/invites'"]) assert.ok(php.includes(route), route);
    assert.equal((php.match(/Access::SignedIn/g) || []).length, 8, 'every route is signed-in only');
    assert.ok(!/\$request->json\(\)\[['"](user|sub|user_id)/.test(php), 'the user never comes from the request');
    assert.ok(php.includes(`MAX_GROUPS = ${GROUPS_MAX}`));
    assert.ok(php.includes("'k' => 'groups'"));
    assert.match(readFileSync(sitePath('src/Extension.php'), 'utf8'), /new Groups\(\$minn\)/);
    // The site's name rule is the game's.
    assert.ok(php.includes("NAME = '/^[A-Za-z0-9](?:[A-Za-z0-9 _-]{1,30})[A-Za-z0-9]$/'"));
  });

  it('the server handles the kinds the game sends and sends the ones it hears', { skip: skipWithoutServer }, () => {
    const p = serverPath('channels.go');
    if (!existsSync(p)) return;
    const go = readFileSync(p, 'utf8');
    for (const k of ['groups_watch', 'channel_join', 'channel_leave', 'channel_say', 'channel_who']) assert.ok(go.includes(`r.Handle("${k}"`), k);
    for (const k of ['groups_status', 'channel_joined', 'channel_left', 'channel_said', 'channel_note']) assert.ok(go.includes(`"${k}"`), k);
    assert.ok(go.includes('c.K != "groups"'));
    const feature = read('public/js/features/groups-feature.js');
    for (const k of ['groups_watch', 'channel_join', 'channel_leave', 'channel_say', 'channel_who', 'groups_status', 'channel_joined', 'channel_left', 'channel_said', 'channel_note']) assert.ok(feature.includes(k), k);
  });
});
