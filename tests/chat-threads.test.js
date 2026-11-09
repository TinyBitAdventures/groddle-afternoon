/**
 * Threads on chat lines and who's around (Austin 2026-11-04: "Is it possible to have threaded
 * conversations on an individual chat? Also, could we make it feel more realtime for logged in folks?
 * Like show panel with active players."): the rules and words (js/chat-threads.js), the Social drawer's
 * reply button, count and thread view (js/ui/social-drawer.js, both skins), the feature that talks to the
 * server (features/chat-threads-feature.js), the IM replies (features/player-im-feature.js), the drawer's
 * online count (features/presence-mp-feature.js) and the Account panel's "Appear offline".
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  THREAD_TEXT,
  mergeReplies,
  normalSummary,
  replyFrame,
  siteKey,
  summaryText,
  threadTarget,
} from '../public/js/chat-threads.js?v=42954351';
import { mountSocialDrawer } from '../public/js/ui/social-drawer.js?v=eac982f5';
import { createNotifier } from '../public/js/notify.js?v=37c6b748';
import { chatThreadsFeature, replyLine } from '../public/js/features/chat-threads-feature.js?v=a1049d64';
import { ACTIVE_EVERY_MS, activeDue, presenceMpFeature } from '../public/js/features/presence-mp-feature.js?v=21272297';
import { channelOpts, normalLine } from '../public/js/player-im.js?v=23463a96';
import { SETTINGS_COPY, mountPresenceSetting } from '../public/js/account-forms.js?v=318b6815';
import { memoryStore, page } from './social-fake-dom.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

describe('threads: the rules and the words', () => {
  it('a line\'s count reads "3 replies · Ada", nothing without replies', () => {
    assert.equal(summaryText({ n: 3, last: { id: 7, name: 'Ada' } }), '3 replies · Ada');
    assert.equal(summaryText({ n: 1, last: { name: 'Bo' } }), '1 reply · Bo');
    assert.equal(summaryText({ n: 0 }), '');
    assert.equal(summaryText(null), '');
    assert.deepEqual(normalSummary({ n: '2', last: { id: 9, name: 'Bo' } }), { n: 2, last: { id: 9, name: 'Bo' } });
    assert.equal(normalSummary({ n: 0 }), null);
  });

  it('a thread key in a conversation names a channel line or an IM line, never Local or the party', () => {
    assert.deepEqual(threadTarget('global', 'l:17'), { kind: 'channel', channel: 'global', parent: 17 });
    assert.deepEqual(threadTarget('group:12', 'l:5'), { kind: 'channel', channel: 'group:12', parent: 5 });
    assert.deepEqual(threadTarget('im:9', 'im:9:3'), { kind: 'im', with: 9, parent: 3 });
    assert.equal(threadTarget('im:8', 'im:9:3'), null, 'another conversation\'s line');
    assert.equal(threadTarget('local', 'l:17'), null);
    assert.equal(threadTarget('party', 'l:17'), null);
    assert.equal(threadTarget('global', 'nope'), null);
  });

  it('a reply goes as thread_say for a channel line and as im_send with parent for an IM line', () => {
    assert.deepEqual(replyFrame(threadTarget('help', 'l:4'), '  me   too '), { t: 'thread_say', payload: { channel: 'help', parent: 4, text: 'me too' } });
    assert.deepEqual(replyFrame(threadTarget('im:9', 'im:9:3'), 'ok'), { t: 'im_send', payload: { to: 9, text: 'ok', parent: 3 } });
    assert.equal(replyFrame(threadTarget('global', 'l:4'), '   '), null);
    assert.equal(replyFrame(null, 'hi'), null);
  });

  it('the site\'s keys, and replies merged once each, oldest first', () => {
    assert.equal(siteKey('global'), 'global');
    assert.equal(siteKey('group:12'), 'group-12');
    assert.equal(siteKey('local'), '');
    const a = { rk: 'l:2', at: 2, text: 'b' };
    const b = { rk: 'l:1', at: 1, text: 'a' };
    assert.deepEqual(mergeReplies([a], [b, a]).map((l) => l.rk), ['l:1', 'l:2']);
  });

  it('player words are plain: no em-dashes', () => {
    for (const v of Object.values(THREAD_TEXT)) {
      const s = typeof v === 'function' ? v('Ada') : v;
      assert.doesNotMatch(String(s), /—/);
    }
    assert.doesNotMatch(JSON.stringify(SETTINGS_COPY.presence), /—/);
  });
});

/** The drawer, online, in the fake DOM. */
function drawerRig() {
  const t = page();
  globalThis.document = t.doc;
  globalThis.addEventListener = () => {};
  globalThis.CSS = { escape: (s) => s };
  globalThis.requestAnimationFrame = (fn) => fn();
  let drawer = null;
  const notifier = createNotifier({ onChange: () => drawer?.update() });
  t.data = {};
  drawer = mountSocialDrawer({ root: t.game, dock: t.dock, notifier, mode: 'online', storage: memoryStore(), width: () => 1920, streetName: () => 'Hechey Track', playerMenu: () => true, setData: (k, v) => { t.data[k] = v; } });
  const log = () => t.dock.querySelector('[data-social-log]');
  const rows = () => log().children.filter((c) => c.tagName === 'P');
  return { t, drawer, log, rows };
}

const SAVED = ['document', 'addEventListener', 'CSS', 'requestAnimationFrame', 'groddleSocial', 'groddleRealtime', 'fetch', 'groddleThreads', 'groddlePresence'];

describe('threads: the Social drawer', () => {
  const saved = {};
  let r;
  const sent = [];
  const loads = [];
  before(() => {
    for (const k of SAVED) saved[k] = globalThis[k];
    r = drawerRig();
  });
  after(() => {
    for (const [k, v] of Object.entries(saved)) globalThis[k] = v;
  });

  it('solo has none; online, only a conversation that takes threads gets the buttons, once a sender is connected', () => {
    const solo = page();
    const s = mountSocialDrawer({ root: solo.game, dock: solo.dock, notifier: createNotifier({}), mode: 'solo', storage: memoryStore(), width: () => 1920 });
    assert.equal(s.threads, null);
    globalThis.document = r.t.doc;
    r.drawer.channel('global', { label: 'Global Chat', threads: true });
    r.drawer.select('global');
    const at = Date.now();
    r.drawer.push('global', { name: 'Bo', text: 'who wants pie', playerId: 9, at, rk: 'l:100' });
    r.drawer.push('global', { note: true, text: 'Welcome', rk: 'l:999' });
    assert.equal(r.log().querySelectorAll('[data-thread-reply]').length, 0, 'no sender yet');
    r.drawer.threads.connect({ send: (chat, tk, text) => { sent.push([chat, tk, text]); return true; }, load: (chat, tk) => loads.push([chat, tk]) });
    const replies = r.log().querySelectorAll('[data-thread-reply]');
    assert.equal(replies.length, 1, 'the note has none');
    assert.equal(replies[0].getAttribute('aria-label'), "Reply in a thread to Bo's message");
    assert.equal(replies[0].tagName, 'BUTTON');
    assert.ok(r.log().querySelector('[data-thread-open="l:100"]').hidden, 'no count before a reply');
    // Local takes no threads.
    r.drawer.push('local', { name: 'Bo', text: 'local line', playerId: 9, at, rk: 'l:101' });
    r.drawer.select('local');
    assert.equal(r.log().querySelectorAll('[data-thread-reply]').length, 0);
    r.drawer.select('global');
  });

  it('the count changes in place: the same row and the same words', () => {
    const row = r.rows()[0];
    const words = row.children[2];
    r.drawer.threads.summary('l:100', { n: 2, last: { id: 7, name: 'Ada' } });
    const bar = r.log().querySelector('[data-thread-open="l:100"]');
    assert.equal(bar.hidden, false);
    assert.equal(bar.textContent, '2 replies · Ada');
    assert.equal(bar.getAttribute('aria-label'), '2 replies · Ada. Open the thread');
    assert.equal(r.rows()[0], row);
    assert.equal(r.rows()[0].children[2], words);
    assert.ok(row.classList.contains('has-thread'));
  });

  it('a click opens the thread in place: its line, then its replies, the input sending there', () => {
    r.log().querySelector('[data-thread-reply="l:100"]').click();
    assert.equal(r.t.data.socialThread, 'global|l:100');
    assert.deepEqual(loads.at(-1), ['global', 'l:100']);
    assert.ok(r.t.dock.querySelector('[data-social-thread-head]'), 'the Back head');
    assert.equal(r.t.dock.querySelector('[data-social-thread-back]').getAttribute('aria-label'), 'Back to Global Chat');
    assert.equal(r.log().getAttribute('data-social-thread'), 'l:100');
    const parent = r.rows()[0];
    assert.ok(parent.classList.contains('is-thread-parent'));
    assert.match(parent.textContent, /who wants pie/);
    assert.equal(r.log().querySelector('[data-social-thread-count]').textContent, THREAD_TEXT.loading);
    assert.equal(r.t.input.placeholder, THREAD_TEXT.placeholder);
    const at = Date.now();
    r.drawer.threads.setReplies('l:100', [
      { name: 'Ada', text: 'me', playerId: 7, at, rk: 'l:200' },
      { name: 'Cy (web)', text: 'me too https://groddleafternoon.com', playerId: 11, at: at + 1, rk: 'l:201' },
    ]);
    const rows = r.rows();
    assert.equal(rows.length, 3);
    assert.match(rows[2].textContent, /Cy \(web\)/);
    assert.ok(rows[2].querySelector('a'), 'links in replies');
    assert.equal(r.t.data.socialThreadReplies, '2');
    assert.equal(r.log().querySelectorAll('[data-thread-reply]').length, 0, 'a reply takes no thread');
    assert.equal(rows[1].querySelector('[data-social-name]').getAttribute('data-player-id'), '7', 'names open the player menu');
  });

  it('replies take reactions once a reaction sender is connected', () => {
    r.drawer.reactions.connect({ me: () => 7, send: () => true });
    assert.ok(r.rows()[1].querySelector('[data-react-add="l:200"]'));
    r.drawer.reactions.set('l:200', [{ key: 'like', by: [{ id: 9, name: 'Bo' }] }]);
    assert.ok(r.rows()[1].querySelector('[data-react-chip="like"]'));
  });

  it('a line typed in the thread is a reply, before any other chat\'s handler; slash commands stay the game\'s', () => {
    const others = [];
    r.t.dock.addEventListener('submit', () => others.push('groups'), true);
    r.t.input.value = 'pie for everyone';
    r.t.form.dispatch('submit');
    assert.deepEqual(sent.at(-1), ['global', 'l:100', 'pie for everyone']);
    assert.equal(r.t.input.value, '');
    assert.deepEqual(others, [], 'groups-feature never sees it');
    r.t.input.value = '/who';
    r.t.form.dispatch('submit');
    assert.deepEqual(others, ['groups']);
    assert.equal(sent.length, 1);
  });

  it('a new reply comes in at the end; a reply that did not go says so in the thread', () => {
    r.drawer.threads.push('l:100', { name: 'Bo', text: 'third', playerId: 9, at: Date.now() + 5, rk: 'l:202' }, { n: 3, last: { id: 9, name: 'Bo' } });
    assert.match(r.rows().at(-1).textContent, /third/);
    r.drawer.threads.note('l:100', 'That line is too old to reply to here.');
    assert.match(r.log().textContent, /too old/);
  });

  it('Escape goes back to the conversation; the replies never show in its log', () => {
    const input = r.t.input;
    input.focus();
    r.t.dock.dispatch('keydown', { key: 'Escape', target: input });
    assert.equal(r.t.data.socialThread, '');
    assert.equal(r.drawer.threads.current, null);
    assert.doesNotMatch(r.log().textContent, /pie for everyone|third|me too/);
    assert.equal(r.log().querySelector('[data-thread-open="l:100"]').textContent, '3 replies · Bo');
    // Another tab closes it too.
    r.drawer.threads.open('global', 'l:100');
    r.drawer.select('local');
    assert.equal(r.drawer.threads.current, null);
  });

  it('both skins dress the reply button, the count and the head', () => {
    const modern = read('public/style.css');
    const classic = read('public/css/classic.css');
    for (const sel of ['.thread-reply', '.thread-open', '.social-thread-head', '.is-thread-parent']) {
      assert.ok(modern.includes(sel), `style.css ${sel}`);
      assert.ok(classic.includes(`:root[data-ui="classic"] ${sel}`) || classic.includes(`:root[data-ui="classic"] .social-drawer ${sel}`) || classic.includes(`.social-msg${sel}`), `classic.css ${sel}`);
    }
  });
});

/** A fake realtime client: on/send/emit and a state. */
function fakeClient(me = { id: 7, name: 'Ada' }) {
  const handlers = new Map();
  const sent = [];
  return {
    me,
    state: 'online',
    sent,
    on(type, fn) { (handlers.get(type) || handlers.set(type, []).get(type)).push(fn); return () => {}; },
    send(t, payload) { sent.push({ t, ...payload }); return true; },
    emit(type, detail) { for (const fn of handlers.get(type) || []) fn(detail); },
  };
}

describe('threads: the feature, and IM replies', () => {
  const saved = {};
  let r;
  let client;
  let fetched = [];
  before(() => {
    for (const k of SAVED) saved[k] = globalThis[k];
    r = drawerRig();
    globalThis.fetch = async (url) => {
      fetched.push(String(url));
      const body = /threads\/55/.test(url)
        ? { parent: null, lines: [{ lid: 300, id: 9, name: 'Bo', text: 'kept on the site', at: 5, web: true, r: [] }, { lid: 301, id: 13, name: 'Zed', text: 'blocked', at: 6 }], now: 1 }
        : { lines: [{ id: 4, from: 9, text: 'kept im reply', at: 9, parent: 2 }], blocked: false };
      return { ok: true, status: 200, headers: { get: () => null }, json: async () => body };
    };
    client = fakeClient();
    const engine = {
      mode: 'multiplayer',
      started: true,
      social: r.drawer,
      setData: (k, v) => { r.t.data[k] = v; },
      toast: () => {},
      query: (hook, id) => (hook === 'realtimeClient' ? client : hook === 'realtimeHidden' ? id === 13 : null),
    };
    chatThreadsFeature.onTick(16, 0, engine);
    r.drawer.channel('global', { label: 'Global Chat', threads: true });
    r.drawer.channel('im:9', channelOpts('Bo'));
  });
  after(() => {
    for (const [k, v] of Object.entries(saved)) globalThis[k] = v;
  });

  it('is a multiplayer feature listed before street-objects, and solo does nothing', () => {
    const idx = read('public/js/features/index.js');
    const at = idx.indexOf('chatThreadsFeature');
    assert.ok(at > 0 && at < idx.indexOf('streetObjectsFeature') && idx.indexOf('presenceMpFeature') < idx.indexOf('streetObjectsFeature'));
    assert.match(read('public/js/features/chat-threads-feature.js'), /engine\.mode !== 'multiplayer'/);
    assert.match(read('public/js/features/groups-feature.js'), /threads: true/);
    assert.equal(channelOpts('Bo').threads, true);
  });

  it('channel history counts, a reply said live, never one by a player you block', () => {
    client.emit('msg:channel_joined', { channel: 'global', history: [{ id: 9, name: 'Bo', text: 'old', at: 1, lid: 50, th: { n: 4, last: { id: 9, name: 'Bo' } } }] });
    assert.equal(r.drawer.threads.get('l:50').n, 4);
    client.emit('msg:thread_said', { channel: 'global', parent: 50, line: { id: 11, name: 'Cy', text: 'hi', at: 2, lid: 60, web: true }, n: 5, last: { id: 11, name: 'Cy' } });
    const t = r.drawer.threads.get('l:50');
    assert.equal(t.n, 5);
    assert.equal(t.replies[0].name, 'Cy (web)');
    assert.equal(t.replies[0].rk, 'l:60');
    client.emit('msg:thread_said', { channel: 'global', parent: 50, line: { id: 13, name: 'Zed', text: 'blocked', at: 3, lid: 61 }, n: 6, last: { id: 13, name: 'Zed' } });
    assert.equal(r.drawer.threads.get('l:50').replies.length, 1);
    assert.equal(replyLine({ id: 13, name: 'Zed', text: 'x', lid: 1 }, { me: 7, hidden: (id) => id === 13 }), null);
  });

  it('a reply typed goes as thread_say; opening asks the server, then the site when it no longer holds it', async () => {
    r.drawer.push('global', { name: 'Bo', text: 'an old line', playerId: 9, at: 1, rk: 'l:55' });
    r.drawer.threads.open('global', 'l:55');
    assert.deepEqual(client.sent.at(-1), { t: 'thread_get', channel: 'global', parent: 55 });
    r.t.input.value = 'replying';
    r.t.form.dispatch('submit');
    assert.deepEqual(client.sent.at(-1), { t: 'thread_say', channel: 'global', parent: 55, text: 'replying' });
    client.emit('msg:thread', { channel: 'global', parent: 55, lines: [], known: false });
    await new Promise((res) => setTimeout(res, 20));
    assert.ok(fetched.some((u) => u.endsWith('/wp-json/groddle/v1/chat/channels/global/threads/55')), fetched.join(' '));
    const t = r.drawer.threads.get('l:55');
    assert.deepEqual(t.replies.map((l) => l.text), ['kept on the site'], 'the blocked player\'s reply is left out');
    assert.equal(t.loaded, true);
  });

  it('a refusal shows in the open thread', () => {
    client.emit('error', { code: 'thread', message: 'That line is too old to reply to here.' });
    assert.match(r.log().textContent, /too old/);
  });

  it('an IM thread\'s reply goes as im_send with parent, and its replies come from the site too', async () => {
    r.drawer.push('im:9', { name: 'Bo', text: 'first', playerId: 9, at: 1, rk: 'im:9:2' });
    r.drawer.threads.open('im:9', 'im:9:2');
    await new Promise((res) => setTimeout(res, 20));
    assert.ok(fetched.some((u) => u.endsWith('/chat/ims/9/threads/2')));
    assert.deepEqual(r.drawer.threads.get('im:9:2').replies.map((l) => [l.text, l.rk]), [['kept im reply', 'im:9:4']]);
    r.t.input.value = 'im reply';
    r.t.form.dispatch('submit');
    assert.deepEqual(client.sent.at(-1), { t: 'im_send', to: 9, text: 'im reply', parent: 2 });
  });

  it('an IM line keeps its parent, so the conversation can leave replies out', () => {
    assert.equal(normalLine({ id: 4, from: 9, text: 'x', at: 1, parent: 2 }).parent, 2);
    assert.equal(normalLine({ id: 4, from: 9, text: 'x', at: 1 }).parent, undefined);
    const src = read('public/js/features/player-im-feature.js');
    assert.match(src, /c\.lines\.filter\(\(l\) => !l\.parent\)/);
    assert.match(src, /threads\?\.push\(imKey\(id, line\.parent\)/);
  });
});

describe('who\'s around: the drawer\'s count, and Appear offline', () => {
  const saved = {};
  let r;
  let client;
  before(() => {
    for (const k of SAVED) saved[k] = globalThis[k];
    r = drawerRig();
    client = fakeClient({ id: 7, name: 'Ada', off: false });
    globalThis.groddleRealtime = { client: { state: 'online', here: 2, players: [{ name: 'Bo' }] } };
    const engine = {
      mode: 'multiplayer',
      started: true,
      social: r.drawer,
      setData: (k, v) => { r.t.data[k] = v; },
      query: (hook) => (hook === 'realtimeClient' ? client : null),
    };
    presenceMpFeature.onTick(16, 0, engine);
    r.engine = engine;
  });
  after(() => {
    for (const [k, v] of Object.entries(saved)) globalThis[k] = v;
  });

  it('online, the game asks for the count and the presence pill says it', () => {
    assert.deepEqual(client.sent[0], { t: 'presence_watch' });
    client.emit('msg:presence_count', { n: 12 });
    assert.equal(r.t.data.presenceCount, '12');
    assert.equal(r.t.data.socialOnline, '12');
    const pill = r.t.dock.querySelector('[data-social-presence]');
    assert.match(pill.textContent, /1 here · 12 online/);
    client.emit('hello', { id: 7, name: 'Ada', off: true });
    assert.equal(client.sent.filter((f) => f.t === 'presence_watch').length, 2, 'again on a new socket');
    assert.equal(r.t.data.presenceOff, '1');
    client.emit('msg:presence_you', { off: false });
    assert.equal(r.t.data.presenceOff, '0');
  });

  it('a key or a click tells the server you are there, at most every 30 seconds', () => {
    assert.equal(activeDue(1000, -Infinity), true);
    assert.equal(activeDue(1000 + ACTIVE_EVERY_MS - 1, 1000), false);
    assert.equal(activeDue(1000 + ACTIVE_EVERY_MS, 1000), true);
    const s = globalThis.groddlePresence;
    const before = client.sent.filter((f) => f.t === 'active').length;
    s._input();
    s._input();
    assert.equal(client.sent.filter((f) => f.t === 'active').length, before + 1);
  });

  it('the Account panel\'s box reads and switches the account\'s setting, and follows a switch made elsewhere', async () => {
    const calls = [];
    let fail = false;
    const account = {
      presence: async () => ({ off: true }),
      setPresence: async (off) => {
        calls.push(off);
        if (fail) throw Object.assign(new Error('The Groddle site is not answering. Try again in a moment.'), { code: 'offline' });
        return { off, live: true };
      },
    };
    const host = r.t.doc.createElement('div');
    const state = presenceMpFeature.presenceState(r.engine);
    const { box } = mountPresenceSetting(host, { account, state });
    assert.equal(box.getAttribute('type'), 'checkbox');
    assert.match(host.textContent, /Appear offline/);
    assert.match(host.textContent, /buddies included/);
    await new Promise((res) => setTimeout(res, 5));
    assert.equal(box.checked, true, 'what the site says');
    assert.equal(r.t.data.presenceOff, '1');
    box.checked = false;
    box.dispatch('change');
    await new Promise((res) => setTimeout(res, 5));
    assert.deepEqual(calls, [false]);
    assert.equal(box.checked, false);
    assert.match(host.querySelector('[data-account-presence-said]').textContent, /online again/);
    fail = true;
    box.checked = true;
    box.dispatch('change');
    await new Promise((res) => setTimeout(res, 5));
    assert.equal(box.checked, false, 'a switch that did not go goes back');
    assert.equal(host.querySelector('[data-account-presence-said]').dataset.tone, 'bad');
    client.emit('msg:presence_you', { off: true });
    assert.equal(box.checked, true, 'switched on the website: the box follows');
  });

  it('the Account panel mounts it under the email and password', () => {
    assert.match(read('public/js/features/account-backup-feature.js'), /mountPresenceSetting\(/);
  });
});
