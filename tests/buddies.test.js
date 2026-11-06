/**
 * Buddies in multiplayer (register G325), the game side: js/buddies.js (the
 * list, the player menu's entries, where a buddy is, presence), the buddy
 * calls in js/minn-account.js, and js/features/buddies-feature.js (off in
 * solo, wired before realtime, against a fake DOM and a fake realtime
 * client). The site's routes and tables are read from the site repo and the
 * server's messages from the server repo (both skip without them,
 * tools/repos.mjs); buddies_test.go has the server's own rules.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import vm from 'node:vm';

import {
  BUDDY_COUNTER,
  BUDDY_LIMIT,
  BUDDY_TEXT,
  BUDDY_VERBS,
  addedYouKind,
  addedYouOnly,
  applyPresence,
  applyStatus,
  buddyVerbs,
  buddyWhere,
  freshReverse,
  normalizeList,
} from '../public/js/buddies.js?v=df41a3bb';
import { createMinnAccount } from '../public/js/minn-account.js?v=9544b0a0';
import { buddiesFeature } from '../public/js/features/buddies-feature.js?v=05cbd107';
import { FEATURES } from '../public/js/features/index.js?v=2ef497f2';
import { serverPath, sitePath, skipWithoutServer, skipWithoutSite } from '../tools/repos.mjs';

const root = join(import.meta.dirname, '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');

const ANSWER = {
  limit: 1000,
  group: 'Buddies',
  buddies: [{ id: 2, name: 'Bo', addedAt: '2026-10-26T10:00:00Z', mutual: true }, { id: 4, name: 'Di', addedAt: '2026-10-25T10:00:00Z', mutual: false }],
  reverse: [{ id: 2, name: 'Bo', addedAt: '2026-10-26T09:00:00Z', new: false }, { id: 5, name: 'Ed', addedAt: '2026-10-26T11:00:00Z', new: true }],
  ignoring: [{ id: 3, name: 'Cy' }],
  watch: { token: 'tok.sig', expiresIn: 3600 },
};

describe('buddies rules (js/buddies.js)', () => {
  it('reads the site answer', () => {
    const l = normalizeList(ANSWER);
    assert.equal(l.limit, 1000);
    assert.deepEqual(l.buddies.map((b) => [b.id, b.mutual]), [[2, true], [4, false]]);
    assert.deepEqual(l.reverse.map((b) => [b.id, b.isNew]), [[2, false], [5, true]]);
    assert.deepEqual(l.ignoring.map((b) => b.id), [3]);
    assert.equal(l.token, 'tok.sig');
    assert.deepEqual(normalizeList(null).buddies, []);
    assert.equal(normalizeList({ buddies: [{ id: -1 }, { id: 'x' }] }).buddies.length, 0);
  });

  it('offers the source\'s player menu entries', () => {
    const l = normalizeList(ANSWER);
    assert.deepEqual(buddyVerbs(l, { id: 2, name: 'Bo' }).map((v) => v.label), ['Remove from Friends', 'Block']);
    assert.deepEqual(buddyVerbs(l, { id: 9, name: 'Fi' }).map((v) => [v.id, v.enabled]), [[BUDDY_VERBS.add, true], [BUDDY_VERBS.ignore, true]]);
    assert.deepEqual(buddyVerbs(l, { id: 3, name: 'Cy' }).map((v) => v.label), ['Add to Friends', 'Un-Block Cy']);
    assert.equal(buddyVerbs(l, { id: 9, name: 'Fi' })[1].tooltip, 'Prevent Fi from talking to you');
    // At the limit: Add is disabled with the source's reason, unless they added you first.
    const full = { ...l, limit: 2 };
    const [add] = buddyVerbs(full, { id: 9, name: 'Fi' });
    assert.equal(add.enabled, false);
    assert.equal(add.reason, 'You currently have the maximum number of friends (2 or more!)');
    assert.equal(buddyVerbs(full, { id: 5, name: 'Ed' })[0].enabled, true);
    assert.deepEqual(buddyVerbs(null, { id: 2 }), []);
    assert.equal(BUDDY_LIMIT, 1000);
  });

  it('says where a buddy is', () => {
    const label = (t) => ({ GA1: 'Groddle Meadow' })[t] || t;
    assert.equal(buddyWhere(undefined, label), 'Offline');
    assert.equal(buddyWhere({ street: '' }, label), 'A secret place');
    assert.equal(buddyWhere({ street: 'GA1' }, label), 'Groddle Meadow');
    assert.equal(buddyWhere({ street: 'GZZZ' }, label), 'A secret place', 'a street the game has no name for');
  });

  it('applies presence and status', () => {
    const online = new Map();
    assert.equal(applyPresence(online, { t: 'buddy_online', id: 2, name: 'Bo', street: 'GA1' }).kind, 'online');
    assert.deepEqual(online.get(2), { name: 'Bo', street: 'GA1' });
    applyPresence(online, { t: 'buddy_moved', id: 2, name: 'Bo', street: '' });
    assert.equal(online.get(2).street, '');
    applyPresence(online, { t: 'buddy_offline', id: 2, name: 'Bo' });
    assert.equal(online.has(2), false);
    assert.equal(applyPresence(online, { t: 'buddy_online' }), null);
    applyStatus(online, { online: [{ id: 4, name: 'Di', street: 'GA2' }, { id: 0 }] });
    assert.deepEqual([...online.keys()], [4]);
  });

  it('knows who added you that you have not added back, and who is new', () => {
    const l = normalizeList(ANSWER);
    assert.deepEqual(addedYouOnly(l).map((r) => r.id), [5]);
    assert.deepEqual(freshReverse(l).map((r) => r.id), [5]);
    assert.deepEqual(freshReverse(l, new Set([5])), []);
    // Ed is not your buddy: ask to add back (friend_add); Bo is: the line alone (friend_add_mutual).
    assert.equal(addedYouKind(l, 5), 'ask');
    assert.equal(addedYouKind(l, 2), 'tell');
    assert.equal(BUDDY_TEXT.addedYouAsk('Ed'), 'Ed just added you as a contact! Add them back?');
    assert.deepEqual([BUDDY_TEXT.addBack, BUDDY_TEXT.notNow], ['Add back', 'Not now']);
  });

  it('counts the badges the source counts', () => {
    const cat = JSON.parse(read('public/assets/content/achievements.json'));
    const counted = Object.entries(cat).filter(([, d]) => (d.conditions || []).some((c) => `${c.group}:${c.name}` === BUDDY_COUNTER));
    assert.deepEqual(counted.map(([id, d]) => [id, d.conditions[0].num]).sort((a, b) => a[1] - b[1]),
      [['fine_friend', 7], ['good_buddy', 23], ['jolly_good_chap', 47], ['a1_comrade', 79], ['best_pal', 111]]);
  });
});

// —— minn-account buddy calls ——

function routedFetch(routes) {
  const calls = [];
  const fn = async (url, init = {}) => {
    calls.push({ url, ...init });
    const key = Object.keys(routes).find((k) => url.endsWith(k) && (!routes[k].method || routes[k].method === (init.method || 'GET')));
    const answer = key ? routes[key] : { status: 404, body: { code: 'rest_no_route' } };
    const headers = new Map(answer.nonce ? [['x-wp-nonce', answer.nonce]] : []);
    return {
      status: answer.status,
      ok: answer.status >= 200 && answer.status < 300,
      headers: { get: (k) => headers.get(String(k).toLowerCase()) ?? null },
      json: async () => answer.body,
      text: async () => (typeof answer.body === 'string' ? answer.body : JSON.stringify(answer.body)),
    };
  };
  return { fn, calls };
}

describe('minn-account buddy calls', () => {
  const BASE = 'https://groddle.localhost/';
  it('calls the routes with the nonce and answers the list', async () => {
    const { fn, calls } = routedFetch({
      'groddle/v1/buddies': { status: 200, body: ANSWER },
      'groddle/v1/buddies/ignores': { status: 200, body: ANSWER, method: 'POST' },
      'groddle/v1/buddies/ignores/3': { status: 200, body: ANSWER, method: 'DELETE' },
      'groddle/v1/buddies/4': { status: 200, body: ANSWER, method: 'DELETE' },
    });
    const a = createMinnAccount({ baseUri: BASE, fetch: fn, nonce: 'abcdef0123' });
    assert.equal((await a.buddies()).limit, 1000);
    await a.addBuddy(5);
    await a.removeBuddy(4);
    await a.ignorePlayer('3');
    await a.unignorePlayer(3);
    assert.deepEqual(calls.map((c) => [c.method, c.url.replace(`${BASE}wp-json/groddle/v1/`, ''), c.body ?? null, c.headers['X-WP-Nonce']]), [
      ['GET', 'buddies', null, 'abcdef0123'],
      ['POST', 'buddies', '{"id":5}', 'abcdef0123'],
      ['DELETE', 'buddies/4', null, 'abcdef0123'],
      ['POST', 'buddies/ignores', '{"id":3}', 'abcdef0123'],
      ['DELETE', 'buddies/ignores/3', null, 'abcdef0123'],
    ]);
  });

  it('throws the site\'s refusal with its words, and retries a stale nonce once', async () => {
    let n = 0;
    const { fn } = routedFetch({ 'groddle/v1/buddies': { status: 403, body: { code: 'groddle_buddy_ignored', message: 'That player has blocked you.' } } });
    const a = createMinnAccount({ baseUri: BASE, fetch: fn, nonce: 'abcdef0123' });
    await assert.rejects(a.addBuddy(2), (err) => err.status === 403 && err.code === 'groddle_buddy_ignored' && err.message === 'That player has blocked you.');
    const stale = async (url, init = {}) => {
      if (url.includes('rest-nonce')) return { status: 200, ok: true, headers: { get: () => null }, text: async () => '1111111111' };
      n += 1;
      const fresh = init.headers?.['X-WP-Nonce'] === '1111111111';
      return { status: fresh ? 200 : 403, ok: fresh, headers: { get: () => null }, json: async () => (fresh ? ANSWER : { code: 'rest_cookie_invalid_nonce' }) };
    };
    const b = createMinnAccount({ baseUri: BASE, fetch: stale, nonce: 'abcdef0123' });
    assert.equal((await b.buddies()).buddies.length, 2);
    assert.equal(n, 2);
    const off = createMinnAccount({ baseUri: BASE, fetch: async () => { throw new TypeError('Failed to fetch'); } });
    await assert.rejects(off.buddies(), (err) => err.status === 0 && err.code === 'offline');
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
    this.id = '';
  }
  setAttribute(k, v) {
    this.attrs[k] = String(v);
    if (k === 'hidden') this.hidden = true;
    if (k === 'id') this.id = String(v);
    if (k.startsWith('data-')) this.dataset[k.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = String(v);
  }
  append(...kids) { for (const k of kids) { if (k && typeof k === 'object') k.parentElement = this; } this.children.push(...kids); }
  insertBefore(kid, ref) { kid.parentElement = this; const i = this.children.indexOf(ref); this.children.splice(i < 0 ? this.children.length : i, 0, kid); }
  replaceChildren(...kids) { this.children = kids; }
  addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
  fire(type, e = {}) { for (const fn of this.listeners[type] || []) fn({ preventDefault() {}, stopPropagation() {}, target: this, ...e }); }
  all() { return [this, ...this.children.flatMap((c) => (c instanceof FakeEl ? c.all() : []))]; }
  find(attr, value) { return this.all().find((n) => attr in n.attrs && (value === undefined || n.attrs[attr] === String(value))); }
  text() { return this.all().map((n) => n.textContent).concat(this.all().flatMap((n) => n.children.filter((c) => c && c.text).map((c) => c.text))).join(' '); }
}

function fakeClient() {
  const listeners = new Map();
  const sent = [];
  return {
    state: 'online',
    me: { id: 1, name: 'Ada' },
    sent,
    on(type, fn) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(fn); return () => listeners.get(type).delete(fn); },
    emit(type, payload) { for (const fn of listeners.get(type) || []) fn(payload); },
    msg(m) { this.emit(`msg:${m.t}`, m); },
    send(kind, payload = {}) { sent.push({ t: kind, ...payload }); return this.state === 'online'; },
    take(kind) { const out = sent.filter((m) => m.t === kind); for (const m of out) sent.splice(sent.indexOf(m), 1); return out; },
  };
}

const wait = (ms = 0) => new Promise((r) => setTimeout(r, ms));

describe('buddies feature (js/features/buddies-feature.js)', () => {
  const saved = {};
  let client;
  let engine;
  let body;
  let menu;
  let answer;
  const events = [];
  const posted = [];
  /** The "Add them back?" prompts, unanswered: { uid, text, choices, onChoice }. */
  const asks = [];
  const NAMES = { 5: 'Ed', 6: 'Fi', 8: 'Hal', 9: 'Ivy', 10: 'Jo' };

  before(() => {
    for (const k of ['document', 'fetch', 'groddleBuddies', 'GRODDLE_MP_BOOT']) saved[k] = globalThis[k];
    body = new FakeEl('body');
    menu = new FakeEl('div');
    menu.setAttribute('id', 'more-list');
    globalThis.document = { baseURI: 'https://groddle.localhost/', createElement: (t) => new FakeEl(t), createTextNode: (t) => ({ text: t }), head: new FakeEl('head'), body, getElementById: (id) => (id === 'more-list' ? menu : null) };
    globalThis.GRODDLE_MP_BOOT = { nonce: 'abcdef0123' };
    answer = structuredClone(ANSWER);
    globalThis.fetch = async (url, init = {}) => {
      const method = init.method || 'GET';
      const path = String(url).replace('https://groddle.localhost/wp-json/groddle/v1/', '');
      posted.push(`${method} ${path}`);
      let body = answer;
      if (method === 'POST' && path === 'buddies') {
        const id = JSON.parse(init.body).id;
        answer.buddies.unshift({ id, name: NAMES[id] || 'Fi', addedAt: '', mutual: answer.reverse.some((r) => r.id === id) });
        body = { ...answer, told: 'told.sig', watch: { token: 'tok2.sig', expiresIn: 3600 } };
      }
      if (method === 'POST' && path === 'buddies/ignores') {
        const id = JSON.parse(init.body).id;
        answer.buddies = answer.buddies.filter((b) => b.id !== id);
        answer.ignoring.unshift({ id, name: 'Bo' });
      }
      return { status: method === 'POST' && path === 'buddies' ? 201 : 200, ok: true, headers: { get: () => null }, json: async () => body };
    };
    client = fakeClient();
    engine = {
      mode: 'multiplayer',
      started: true,
      query: (hook) => (hook === 'realtimeClient' ? client : null),
      targetVerbs: () => [{ id: 'party_invite', label: 'Invite to Party' }, { id: 'trade_start', label: 'Offer to Trade' }],
      setData: (k, v) => { engine.data[k] = v; },
      data: {},
      toast: (t) => events.push(`toast:${t}`),
      prompt: (p) => {
        events.push(`prompt:${p.text}`);
        // "Add them back?" waits for a test to answer; the confirmations say yes at once.
        if (/Add them back\?$/.test(p.text)) {
          const uid = `p${asks.length + 1}`;
          asks.push({ uid, ...p });
          return uid;
        }
        p.onChoice?.(true);
        return '';
      },
      removePrompt: (uid) => events.push(`removePrompt:${uid}`),
      pushActivity: (t) => events.push(`activity:${t}`),
      achievement: (c, n) => events.push(`achievement:${c}:${n}`),
      resetAchievementCounter: (c) => events.push(`reset:${c}`),
    };
  });

  after(() => {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete globalThis[k];
      else globalThis[k] = v;
    }
  });

  it('does nothing in solo', () => {
    const solo = { mode: 'solo', started: true, query: () => client };
    buddiesFeature.onTick(16, 0, solo);
    assert.equal(globalThis.groddleBuddies, undefined);
    assert.equal(buddiesFeature.verbOverride({ classId: 'pc_remote', playerId: 2 }, solo), null);
    assert.equal(buddiesFeature.runVerbOverride({ classId: 'pc_remote', playerId: 2 }, 'buddy_add', solo), null);
    assert.equal(buddiesFeature.realtimeHidden(3), null);
  });

  it('is wired before realtime, so its verbs reach the player menu', () => {
    const ids = FEATURES.map((f) => f.id);
    assert.ok(ids.includes('buddies'));
    assert.ok(ids.indexOf('buddies') < ids.indexOf('realtime'));
    assert.equal(ids.indexOf('street-objects') + 1, ids.indexOf('realtime'), 'street objects stays just before realtime');
    assert.ok(ids.indexOf('buddies') > ids.indexOf('trade'));
    assert.match(read('public/js/features/index.js'), /buddies-feature\.js\?v=[0-9a-f]{8}'/);
  });

  it('loads the list, sends the signed list to the server, counts badges and tells new adds', async () => {
    buddiesFeature.onTick(16, 0, engine);
    await wait(5);
    assert.ok(globalThis.groddleBuddies);
    assert.deepEqual(client.take('buddies_watch'), [{ t: 'buddies_watch', token: 'tok.sig' }]);
    assert.equal(engine.data.buddiesCount, '2');
    assert.ok(events.includes(`reset:${BUDDY_COUNTER}`));
    assert.ok(events.includes(`achievement:${BUDDY_COUNTER}:2`));
    // Ed added you while you were away and is not your buddy: a prompt, not a toast.
    assert.ok(events.includes(`prompt:${BUDDY_TEXT.addedYouAsk('Ed')}`), 'Ed added you while you were away');
    assert.ok(!events.includes(`toast:${BUDDY_TEXT.addedYou('Ed')}`));
    assert.deepEqual(asks.map((a) => [a.text, a.choices.map((c) => c.label)]), [[BUDDY_TEXT.addedYouAsk('Ed'), ['Add back', 'Not now']]]);
    assert.equal(engine.data.buddiesAsking, '5');
    assert.ok(menu.find('id', 'buddies-btn'), 'Menu has Buddies');
    // A reconnect sends the same list again.
    client.emit('hello', { id: 1, name: 'Ada' });
    assert.equal(client.take('buddies_watch').length, 1);
  });

  it('adds its entries to another player\'s menu, after the others', () => {
    const verbs = buddiesFeature.verbOverride({ classId: 'pc_remote', playerId: 2, label: 'Bo' }, engine);
    assert.deepEqual(verbs.map((v) => v.label), ['Invite to Party', 'Offer to Trade', 'Remove from Friends', 'Block']);
    assert.equal(buddiesFeature.verbOverride({ classId: 'npc_piggy' }, engine), null);
  });

  it('adds a buddy and sends the proof so they hear it', async () => {
    events.length = 0;
    assert.equal(buddiesFeature.runVerbOverride({ classId: 'pc_remote', playerId: 6, label: 'Fi' }, BUDDY_VERBS.add, engine), true);
    await wait(5);
    assert.deepEqual(client.take('buddy_tell'), [{ t: 'buddy_tell', token: 'told.sig' }]);
    assert.deepEqual(client.take('buddies_watch'), [{ t: 'buddies_watch', token: 'tok2.sig' }], 'a fresh list after the change');
    assert.ok(events.includes(`toast:${BUDDY_TEXT.added('Fi')}`));
    assert.ok(events.includes(`achievement:${BUDDY_COUNTER}:3`));
  });

  it('shows presence in the panel and toasts buddies coming and going', () => {
    events.length = 0;
    client.msg({ t: 'buddies_status', online: [{ id: 4, name: 'Di', street: '' }] });
    client.msg({ t: 'buddy_online', id: 2, name: 'Bo', street: 'GA5101HF7F429V5' });
    assert.ok(events.includes(`toast:${BUDDY_TEXT.online('Bo')}`));
    assert.match(engine.data.buddiesOnline, /Di@secret/);
    assert.match(engine.data.buddiesOnline, /Bo@GA5101HF7F429V5/);
    // Ed only added you: the panel updates, no toast.
    client.msg({ t: 'buddy_online', id: 5, name: 'Ed', street: '' });
    assert.equal(events.filter((e) => e.includes('Ed')).length, 0);
    globalThis.groddleBuddies.open();
    const panel = body.find('data-buddies-panel');
    assert.ok(panel.find('data-buddy', '2').dataset.online === 'true');
    assert.ok(panel.find('data-buddy-unignore', '3'), 'Cy is in the blocked list');
    client.msg({ t: 'buddy_offline', id: 2, name: 'Bo' });
    assert.ok(events.includes(`toast:${BUDDY_TEXT.offline('Bo')}`));
    globalThis.groddleBuddies.close();
  });

  it('tells "added you" live, then refreshes the list', async () => {
    events.length = 0;
    posted.length = 0;
    client.msg({ t: 'buddy_added', id: 7, name: 'Gus' });
    assert.ok(events.includes(`toast:${BUDDY_TEXT.addedYou('Gus')}`));
    assert.ok(!events.some((e) => e.startsWith('prompt:')), 'online, the line alone (the source\'s activity line)');
    await wait(5);
    assert.deepEqual(posted, ['GET buddies']);
    // Someone you block: nothing.
    events.length = 0;
    client.msg({ t: 'buddy_added', id: 3, name: 'Cy' });
    assert.equal(events.length, 0);
  });

  it('blocks after asking, and hides the blocked player\'s chat', async () => {
    events.length = 0;
    assert.equal(buddiesFeature.realtimeHidden(2), null);
    buddiesFeature.runVerbOverride({ classId: 'pc_remote', playerId: 2, label: 'Bo' }, BUDDY_VERBS.ignore, engine);
    await wait(5);
    assert.ok(events.some((e) => e.startsWith('prompt:Block Bo?')));
    assert.ok(events.includes(`activity:${BUDDY_TEXT.blocked('Bo')}`));
    assert.equal(buddiesFeature.realtimeHidden(2), true);
    assert.equal(buddiesFeature.realtimeHidden(4), null);
    assert.equal(engine.data.buddiesIgnoring, '2,3');
  });

  it('asks once per player who added you while you were away: Add back adds them, Not now leaves them in Added you', async () => {
    // Ed's prompt from the load is still up; a refresh does not ask again.
    await globalThis.groddleBuddies.refresh();
    assert.equal(asks.length, 1);
    // Three more came while away (one already your buddy: the line alone).
    answer.reverse.push({ id: 8, name: 'Hal', addedAt: '', new: true }, { id: 9, name: 'Ivy', addedAt: '', new: true }, { id: 4, name: 'Di', addedAt: '', new: true });
    events.length = 0;
    posted.length = 0;
    await globalThis.groddleBuddies.refresh();
    assert.deepEqual(asks.map((a) => a.text), ['Ed', 'Hal', 'Ivy'].map(BUDDY_TEXT.addedYouAsk), 'one prompt each');
    assert.ok(events.includes(`toast:${BUDDY_TEXT.addedYou('Di')}`), 'Di is already your buddy');
    assert.equal(engine.data.buddiesAsking, '5,8,9');
    // Add back on Ed and Hal at once: both are added, one after the other.
    const [ed, hal, ivy] = asks;
    ed.onChoice(ed.choices[0].value);
    hal.onChoice(hal.choices[0].value);
    await wait(20);
    assert.deepEqual(posted.filter((p) => p.startsWith('POST')), ['POST buddies', 'POST buddies']);
    assert.ok(globalThis.groddleBuddies.list.buddies.some((b) => b.id === 5 && b.mutual), 'Ed is your buddy now, both ways');
    assert.ok(globalThis.groddleBuddies.list.buddies.some((b) => b.id === 8));
    assert.deepEqual(client.take('buddy_tell').length, 2, 'each add sends its proof');
    assert.ok(events.includes(`toast:${BUDDY_TEXT.added('Hal')}`));
    // Not now on Ivy: nothing is sent, and she stays under Added you.
    posted.length = 0;
    ivy.onChoice(ivy.choices[1].value);
    await wait(5);
    assert.deepEqual(posted, []);
    assert.deepEqual(addedYouOnly(globalThis.groddleBuddies.list).map((r) => r.id), [9]);
    assert.equal(engine.data.buddiesAsking, '');
  });

  it('takes a prompt away when you add or block them some other way first', async () => {
    answer.reverse.push({ id: 11, name: 'Kim', addedAt: '', new: true });
    await globalThis.groddleBuddies.refresh();
    const kim = asks.at(-1);
    assert.equal(kim.text, BUDDY_TEXT.addedYouAsk('Kim'));
    events.length = 0;
    await globalThis.groddleBuddies.ignore({ id: 11, name: 'Kim' });
    assert.ok(events.includes(`removePrompt:${kim.uid}`), 'blocked: the prompt goes');

    answer.reverse.push({ id: 10, name: 'Jo', addedAt: '', new: true });
    await globalThis.groddleBuddies.refresh();
    const jo = asks.at(-1);
    assert.equal(jo.text, BUDDY_TEXT.addedYouAsk('Jo'));
    events.length = 0;
    // The Buddies panel's Add back (or the player menu) adds Jo: the prompt goes, unanswered.
    await globalThis.groddleBuddies.add({ id: 10, name: 'Jo' });
    assert.ok(events.includes(`removePrompt:${jo.uid}`));
    assert.equal(engine.data.buddiesAsking, '');
    // Answering it late adds nothing twice.
    posted.length = 0;
    jo.onChoice('add');
    await wait(5);
    assert.deepEqual(posted, []);
  });
});

// —— The other repos agree ——

describe('buddies across the repos', () => {
  it('the site declares the tables and routes, and signs what the server reads', { skip: skipWithoutSite }, () => {
    const manifest = JSON.parse(readFileSync(sitePath('minn.json'), 'utf8'));
    assert.ok(manifest.tables.groddle_buddies.includes('PRIMARY KEY  (user_id,buddy_id)'));
    assert.ok(manifest.tables.groddle_ignores.includes('PRIMARY KEY  (user_id,ignored_id)'));
    const php = readFileSync(sitePath('src/Buddies.php'), 'utf8');
    for (const route of ["'/groddle/v1/buddies'", "'/groddle/v1/buddies/{id:\\d+}'", "'/groddle/v1/buddies/ignores'", "'/groddle/v1/buddies/ignores/{id:\\d+}'"]) assert.ok(php.includes(route), route);
    assert.equal((php.match(/Access::SignedIn/g) || []).length, 5, 'every route is signed-in only');
    assert.ok(!/\$request->json\(\)\[['"](user|sub|user_id)/.test(php), 'the user never comes from the request');
    assert.match(readFileSync(sitePath('src/Extension.php'), 'utf8'), /new Buddies\(\$minn\)/);
    assert.ok(php.includes(`BUDDY_LIMIT = ${BUDDY_LIMIT}`));
  });

  it('the site encodes ids the way the server decodes them', { skip: skipWithoutSite }, () => {
    const php = existsSync('/opt/homebrew/bin/php') ? '/opt/homebrew/bin/php' : 'php';
    const src = sitePath('src/Buddies.php');
    let out;
    try {
      out = execFileSync(php, ['-r', `require ${JSON.stringify(src)}; echo Groddle\\Minn\\Buddies::ids([45, 7, 1, 9000, 7, 123456, 0]);`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    } catch {
      return; // no php here
    }
    assert.equal(out, [1, 6, 38, 8955, 114456].map((d) => d.toString(36)).join(','));
    const parts = out.split(',').map((s) => parseInt(s, 36));
    let at = 0;
    assert.deepEqual(parts.map((d) => (at += d)), [1, 7, 45, 9000, 123456]);
  });

  it('the server handles the kinds the game sends and sends the ones it hears', { skip: skipWithoutServer }, () => {
    const p = serverPath('buddies.go');
    if (!existsSync(p)) return;
    const go = readFileSync(p, 'utf8');
    for (const k of ['buddies_watch', 'buddy_tell']) assert.ok(go.includes(`r.Handle("${k}"`), k);
    for (const k of ['buddies_status', 'buddy_online', 'buddy_offline', 'buddy_moved', 'buddy_added']) assert.ok(go.includes(`"${k}"`), k);
    assert.ok(go.includes('r.Provide("buddies.ignoring"'));
    const feature = read('public/js/features/buddies-feature.js');
    for (const k of ['buddies_watch', 'buddy_tell', 'buddies_status', 'buddy_online', 'buddy_offline', 'buddy_moved', 'buddy_added']) assert.ok(feature.includes(k), k);
  });
});


// —— The website's "Add to buddy list" (ticket 46) ——

describe('"Add to buddy list" on a player\'s page (site PlayerPages, players/buddy.js; ticket 46)', { skip: skipWithoutSite }, () => {
  const site = (rel) => readFileSync(sitePath(rel), 'utf8');

  it('the buddy routes can leave who added you new, so a website add never swallows the game\'s prompt', () => {
    const php = site('src/Buddies.php');
    assert.match(php, /return \$request->query\('keepNew'\) === '1';/);
    assert.match(php, /return \$this->answer\(!\$keepNew\) \+ \['added' => \$id, 'told'/);
    assert.match(php, /return \$this->answer\(!\$keepNew\) \+ \['removed' => \$id\];/);
    assert.match(php, /if \(\$markSeen && array_filter\(\$out\['reverse'\]/);
    assert.match(php, /private function answer\(bool \$markSeen = true\): array/, 'the game\'s calls still mark them seen');
  });

  it('the page form posts with the REST nonce, as the reader, for the player the path names', () => {
    const php = site('src/PlayerPages.php');
    const fn = php.slice(php.indexOf('public function buddy('), php.indexOf('private function buddyButton('));
    assert.match(fn, /\[\$id, \$canonical\] = \$this->find\(\$slug\) \?\? throw new RouteMiss\(\);/);
    assert.match(fn, /Nonce::verify\(\$nonce, \$reader->userId, \$reader->sessionToken\)/);
    assert.match(fn, /\$this->isPlayer\(\$reader->userId\)/);
    assert.match(fn, /Profiles::fromSave\(\$this->minn->db, \$id\)\['level'\] >= Profiles::LISTED_LEVEL/);
    assert.match(fn, /\$buddies->removeBuddy\(\$id, true\) : \$buddies->addBuddy\(\$id, true\)/);
    assert.match(fn, /Response::redirect\("\{\$back\}\?buddy=\{\$said\}", 303\)/);
    assert.doesNotMatch(fn, /\$form\['(?:id|user|user_id)'\]/, 'never a player id from the form');
    const button = php.slice(php.indexOf('private function buddyButton('), php.indexOf('private function isPlayer('));
    assert.match(button, /\$reader->userId === \$id/);
    assert.match(button, /\(new Buddies\(\$this->minn\)\)->between\(\$id\)/);
    assert.match(button, /Nonce::create\(\$reader->userId, \$reader->sessionToken\)/);
    assert.match(php, /'Cache-Control', \$this->minn->reader->userId > 0 \? 'private, no-cache' : 'no-cache'/, 'a page with a nonce is the reader\'s alone');
    assert.match(php, /public const BUDDY_LABELS = \['add' => 'Add to buddy list', 'remove' => 'Remove from buddy list'\];/);
    const between = site('src/Buddies.php');
    assert.match(between, /'blocked' => \$this->ignoring\(\$me, \$other\) \|\| \$this->ignoring\(\$other, \$me\)/);
    assert.match(site('style.css'), /\.profile-buddy-btn \{[^}]*var\(--play-bg\)/);
    assert.ok(existsSync(sitePath('players/buddy.js')));
  });

  const engine = process.env.MINN_ENGINE_DIR || join(homedir(), 'Cove/Sites/minn-engine.localhost/public/minn');
  it('draws the button only for another signed-in player neither blocks, in glitch.com\'s words (php)', { skip: !existsSync(join(engine, 'src/Minn/Autoloader.php')) && 'Minn Engine not found (set MINN_ENGINE_DIR)' }, () => {
    let out;
    try {
      out = JSON.parse(execFileSync('php', [join(root, 'tests/fixtures/profiles/profile-pages.php'), engine, sitePath(''), join(root, 'public')], { encoding: 'utf8' })).buddy;
    } catch (err) {
      if (err.code === 'ENOENT') return; // no php here
      throw err;
    }
    for (const c of ['signed out', 'own page', 'blocked', 'no nonce']) assert.equal(out[c], '', c);
    assert.match(out.add, /<form class="profile-buddy" method="post" action="\/players\/zz-ada\/buddy\/"/);
    assert.match(out.add, /<input type="hidden" name="_wpnonce" value="abcdef0123" \/>/);
    assert.match(out.add, /<button type="submit" class="profile-buddy-btn" data-buddy-do="add">Add to buddy list<\/button>/);
    assert.match(out.remove, /data-buddy-do="remove">Remove from buddy list<\/button>/);
    assert.match(out.add, /data-buddy-name="Zz &lt;b&gt;Ada&lt;\/b&gt;"/, 'the name is escaped');
    assert.doesNotMatch(Object.values(out).join(''), /<b>|<script>/);
    assert.match(out.added, />Zz &lt;b&gt;Ada&lt;\/b&gt; is on your buddy list now\.<\/span>/);
    assert.match(out.removed, /is off your buddy list\.<\/span>/);
    assert.match(out.limit, /data-tone="bad">You currently have the maximum number of friends \(1000 or more!\)/);
    assert.match(out['unknown said'], /aria-live="polite"><\/span>/);
    assert.match(out['on skills'], /name="tab" value="skills"/);
  });

  it('with JavaScript the button calls groddle/v1/buddies (keepNew) and changes in place, a stale nonce refreshed once', async () => {
    const calls = [];
    let stale = true;
    const field = (value) => ({ value });
    const doField = field('add');
    const nonceField = field('abcdef0123');
    const button = { dataset: { buddyDo: 'add' }, textContent: 'Add to buddy list', disabled: false, hidden: false };
    const note = { textContent: '', dataset: {} };
    let submit;
    const form = {
      dataset: { buddyId: '9', buddyName: 'Ada', labelAdd: 'Add to buddy list', labelRemove: 'Remove from buddy list' },
      querySelector: (sel) => ({ '[data-buddy-do]': button, 'input[name="do"]': doField, 'input[name="_wpnonce"]': nonceField, '.profile-buddy-note': note })[sel] || null,
      addEventListener: (type, fn) => { if (type === 'submit') submit = fn; },
    };
    const reply = (status, body, headers = {}) => ({ ok: status >= 200 && status < 300, status, headers: { get: (k) => headers[k] ?? null }, json: async () => body, text: async () => String(body) });
    const fetch = async (url, init = {}) => {
      calls.push(`${init.method || 'GET'} ${url} ${init.headers?.['X-WP-Nonce'] || ''} ${init.body || ''}`.trim());
      if (url.includes('rest-nonce')) return reply(200, 'fedcba9876');
      if (stale) {
        stale = false;
        return reply(403, { code: 'rest_cookie_invalid_nonce' });
      }
      return init.method === 'DELETE' ? reply(200, { removed: 9 }) : reply(201, { added: 9 }, { 'X-WP-Nonce': '0123456789' });
    };
    vm.runInNewContext(site('players/buddy.js'), { document: { querySelectorAll: () => [form] }, fetch });
    await submit({ preventDefault() {} });
    assert.deepEqual(calls, [
      'POST /wp-json/groddle/v1/buddies?keepNew=1 abcdef0123 {"id":9}',
      'GET /wp-admin/admin-ajax.php?action=rest-nonce',
      'POST /wp-json/groddle/v1/buddies?keepNew=1 fedcba9876 {"id":9}',
    ]);
    assert.equal(button.textContent, 'Remove from buddy list');
    assert.equal(doField.value, 'remove');
    assert.equal(note.textContent, 'Ada is on your buddy list now.');
    calls.length = 0;
    await submit({ preventDefault() {} });
    assert.deepEqual(calls, ['DELETE /wp-json/groddle/v1/buddies/9?keepNew=1 0123456789'], 'the fresh nonce from the answer');
    assert.equal(button.textContent, 'Add to buddy list');
    assert.equal(note.textContent, 'Ada is off your buddy list.');
  });
});
