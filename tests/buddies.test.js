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
import { join } from 'node:path';

import {
  BUDDY_COUNTER,
  BUDDY_LIMIT,
  BUDDY_TEXT,
  BUDDY_VERBS,
  addedYouOnly,
  applyPresence,
  applyStatus,
  buddyVerbs,
  buddyWhere,
  freshReverse,
  normalizeList,
} from '../public/js/buddies.js?v=g325-1';
import { createMinnAccount } from '../public/js/minn-account.js?v=nbhome-10';
import { buddiesFeature } from '../public/js/features/buddies-feature.js?v=g466-1';
import { FEATURES } from '../public/js/features/index.js?v=registry-340';
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
        answer.buddies.unshift({ id, name: id === 5 ? 'Ed' : 'Fi', addedAt: '', mutual: id === 5 });
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
      prompt: (p) => { events.push(`prompt:${p.text}`); p.onChoice?.(true); },
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
    assert.match(read('public/js/features/index.js'), /buddies-feature\.js\?v=g\d+-\d+'/);
  });

  it('loads the list, sends the signed list to the server, counts badges and tells new adds', async () => {
    buddiesFeature.onTick(16, 0, engine);
    await wait(5);
    assert.ok(globalThis.groddleBuddies);
    assert.deepEqual(client.take('buddies_watch'), [{ t: 'buddies_watch', token: 'tok.sig' }]);
    assert.equal(engine.data.buddiesCount, '2');
    assert.ok(events.includes(`reset:${BUDDY_COUNTER}`));
    assert.ok(events.includes(`achievement:${BUDDY_COUNTER}:2`));
    assert.ok(events.includes(`toast:${BUDDY_TEXT.addedYou('Ed')}`), 'Ed added you while you were away');
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

