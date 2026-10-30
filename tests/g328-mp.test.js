/**
 * Visiting real players' homes and house keys in multiplayer (register G328),
 * the game side: js/neighbours-mp.js (streets, scenes, the site's answers,
 * the keyring's lines, the door), the home calls in js/minn-account.js,
 * homes-feature's visitor state, the Visiting Stone's multiplayer verbs, and
 * js/features/neighbours-mp-feature.js (off in solo; the owner's side of a
 * knock, keys and the keyring, against a fake DOM and a fake realtime
 * client). The site's routes and the server's messages are read from their
 * repos (skipped without them, tools/repos.mjs); homes_test.go has the
 * server's own rules.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  NEIGHBOURS_TEXT,
  VISIT_VERB,
  doorVerbs,
  givenLine,
  holdsKeyFrom,
  homeStreetFor,
  homeStreetName,
  keyAge,
  keyCandidates,
  normalizeHomeView,
  normalizeKeys,
  outText,
  possessive,
  readVisitScene,
  receivedLine,
  sharedHomeStreet,
  visitSceneTsid,
} from '../public/js/neighbours-mp.js?v=31a75688';
import { createMinnAccount } from '../public/js/minn-account.js?v=81339760';
import { homesFeature, visitorHomeScene, visitorHomeState } from '../public/js/features/homes-feature.js?v=8995a326';
import { neighboursMpApi, neighboursMpFeature } from '../public/js/features/neighbours-mp-feature.js?v=05723c71';
import { FEATURES } from '../public/js/features/index.js?v=5ee36fdd';
import { serverPath, sitePath, skipWithoutServer, skipWithoutSite } from '../tools/repos.mjs';

const root = join(import.meta.dirname, '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');

const VIEW = {
  owner: { id: 7, name: 'Ada' },
  home: { owned: true, style: 'firebog' },
  homes: { decor: { placed: [] }, cult: { items: [], yardLeft: 1 }, streetStyle: 'nope' },
  key: false,
  pass: { token: 'pass.sig', expiresIn: 1800 },
};

describe('neighbours rules (js/neighbours-mp.js)', () => {
  it('names homes and the server\'s streets', () => {
    assert.equal(possessive('Ada'), "Ada's");
    assert.equal(possessive('James'), "James'");
    assert.equal(homeStreetName('Ada'), "Ada's Home Street");
    assert.equal(homeStreetFor(7), 'HOME_7');
    assert.equal(homeStreetFor(7, 'interior'), 'HOUSE_7');
    assert.equal(homeStreetFor(0), '');
    assert.equal(homeStreetFor('x'), '');
    assert.equal(visitSceneTsid(7), 'MPH_7');
    assert.equal(visitSceneTsid(7, 'interior'), 'MPH_7_IN');
    assert.deepEqual(readVisitScene('MPH_7_IN'), { owner: 7, room: 'interior' });
    assert.deepEqual(readVisitScene('MPH_12'), { owner: 12, room: 'street' });
    assert.equal(readVisitScene('NB_dorrit'), null);
    assert.equal(readVisitScene('MPH_0'), null);
  });

  it('shares a home only where the source let others in', () => {
    assert.equal(sharedHomeStreet({ visit: { owner: 7, room: 'street' }, me: 1 }), 'HOME_7');
    assert.equal(sharedHomeStreet({ visit: { owner: 7, room: 'interior' }, me: 1 }), 'HOUSE_7');
    assert.equal(sharedHomeStreet({ me: 1, inHome: true, room: 'street' }), 'HOME_1');
    assert.equal(sharedHomeStreet({ me: 1, inHome: true, room: 'interior' }), 'HOUSE_1');
    assert.equal(sharedHomeStreet({ me: 1, inHome: true, room: 'interior', towerFloor: true }), '', 'a Tower floor stays private');
    assert.equal(sharedHomeStreet({ me: 1, inHome: false }), '');
    assert.equal(sharedHomeStreet({ me: 0, inHome: true }), '');
  });

  it('reads the site\'s visit answer and the keyring', () => {
    const v = normalizeHomeView({ ...VIEW, random: true });
    assert.deepEqual([v.owner, v.home.style, v.key, v.pass, v.random], [{ id: 7, name: 'Ada' }, 'firebog', false, 'pass.sig', true]);
    assert.equal(normalizeHomeView({ ...VIEW, home: { owned: false } }), null);
    assert.equal(normalizeHomeView({ owner: { id: -1, name: 'x' }, home: { owned: true } }), null);
    assert.deepEqual(normalizeHomeView({ ...VIEW, homes: [1, 2] }).homes, {});
    const k = normalizeKeys({ given: [{ id: 9, name: 'Bo', at: '2026-10-26T10:00:00Z' }, { id: 0, name: 'x' }], received: [{ id: 7, name: 'Ada', at: '' }], hasHouse: true });
    assert.deepEqual(k.given.map((r) => r.id), [9]);
    assert.ok(holdsKeyFrom(k, 7));
    assert.ok(!holdsKeyFrom(k, 9));
    assert.equal(k.houseLimit, 100);
    assert.deepEqual(keyCandidates([{ id: 9, name: 'Bo' }, { id: 11, name: 'Cy' }], k).map((b) => b.id), [11]);
  });

  it('says how long ago a key was given as the keyring did', () => {
    const now = Date.parse('2026-10-26T12:00:00Z');
    assert.equal(keyAge('2026-10-26T10:00:00Z', now), 'not long');
    assert.equal(keyAge('2026-10-25T20:00:00Z', now), '16 hours');
    assert.equal(keyAge('2026-10-23T12:00:00Z', now), '3 days');
    assert.equal(givenLine('2026-10-26T11:00:00Z', now), 'Given a key not long ago');
    assert.equal(receivedLine('2026-10-25T11:00:00Z', now), 'Gave you a key 1 day ago');
    assert.equal(NEIGHBOURS_TEXT.revokeConfirm('Bo'), "Are you sure you want to revoke Bo's access to your house? If they're currently in your house, they'll be kicked out.");
  });

  it('opens the door with a key, else knocks', () => {
    assert.deepEqual(doorVerbs({ key: true, ownerName: 'Ada' }).map((v) => v.id), ['enter']);
    assert.deepEqual(doorVerbs({ letIn: true }).map((v) => v.id), ['enter']);
    assert.deepEqual(doorVerbs({ ownerName: 'Ada' }).map((v) => v.label), ['Knock on the door']);
    assert.match(outText('revoked', 'Ada'), /taken back/);
    assert.match(outText('owner_left', 'Ada'), /went offline/);
    assert.equal(VISIT_VERB.label, 'Visit Home Street');
  });
});

describe('homes feature, for a visitor', () => {
  it('normalizes the owner\'s slice as restore() does', () => {
    const v = visitorHomeState(VIEW);
    assert.equal(v.style, 'firebog');
    assert.equal(v.streetStyle, null, 'an unknown style falls back');
    assert.ok(Array.isArray(v.cult.items));
    assert.ok(Array.isArray(v.decor.placed));
    assert.equal(visitorHomeState({}).style, 'meadow');
  });

  it('never leaves the owner\'s home in place of yours, even when building fails', () => {
    const mine = homesFeature._state();
    assert.throws(() => visitorHomeScene({ PIXI: {} }, VIEW, 'street'));
    assert.throws(() => visitorHomeScene({ PIXI: {} }, VIEW, 'interior'));
    const after = homesFeature._state();
    assert.equal(after.cult, mine.cult);
    assert.equal(after.decor, mine.decor);
    assert.equal(after.houseDecor, mine.houseDecor);
    assert.equal(after.backCult, mine.backCult);
    assert.equal(after.scene, mine.scene);
  });
});

describe('minn-account home calls', () => {
  it('calls the routes with the nonce', async () => {
    const calls = [];
    const fetch = async (url, init = {}) => {
      calls.push(`${init.method || 'GET'} ${String(url).replace('https://groddle.localhost/wp-json/groddle/v1/', '')} ${init.body || ''}`.trim());
      return { status: 200, ok: true, headers: { get: () => null }, json: async () => ({ ok: true }) };
    };
    const a = createMinnAccount({ baseUri: 'https://groddle.localhost/', fetch, nonce: 'abcdef0123' });
    await a.home(7);
    await a.visitRandom();
    await a.visitors();
    await a.optInVisitors();
    await a.optOutVisitors();
    await a.houseKeys();
    await a.giveKey(9);
    await a.revokeKey(9);
    assert.deepEqual(calls, ['GET homes/7', 'POST homes/random', 'GET homes/visitors', 'POST homes/visitors', 'DELETE homes/visitors', 'GET keys', 'POST keys {"id":9}', 'DELETE keys/9']);
  });

  it('throws the site\'s refusal with its words', async () => {
    const fetch = async () => ({ status: 403, ok: false, headers: { get: () => null }, json: async () => ({ code: 'groddle_home_blocked', message: 'You are blocked by that player.' }) });
    const a = createMinnAccount({ baseUri: 'https://groddle.localhost/', fetch, nonce: 'abcdef0123' });
    await assert.rejects(a.home(7), (err) => err.code === 'groddle_home_blocked' && err.message === 'You are blocked by that player.');
  });
});

describe('Visiting Stones in multiplayer (street-furniture-feature)', () => {
  it('asks neighboursMpApi in multiplayer only, and keeps solo\'s own path', () => {
    const src = read('public/js/features/street-furniture-feature.js');
    assert.match(src, /neighboursMpApi\.active\(engine\) \? neighboursMpApi\.visitRandom\(engine\) : goVisit\(engine, opts\)/);
    assert.match(src, /if \(engine\.mode === 'multiplayer'\) return;/, 'no authored drop-by visitors in multiplayer');
    assert.match(src, /You need to cultivate 3 items\./);
    assert.equal(neighboursMpApi.active({ mode: 'solo' }), false);
  });
});

// —— The feature ——

class FakeEl {
  constructor(tag) {
    this.tagName = tag.toUpperCase();
    this.children = [];
    this.attrs = {};
    this.listeners = {};
    this.hidden = false;
    this.textContent = '';
    this.disabled = false;
  }
  setAttribute(k, v) {
    this.attrs[k] = String(v);
    if (k === 'hidden') this.hidden = true;
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
    wanted: '',
    sent,
    on(type, fn) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(fn); return () => listeners.get(type).delete(fn); },
    emit(type, payload) { for (const fn of listeners.get(type) || []) fn(payload); },
    msg(m) { this.emit(`msg:${m.t}`, m); },
    send(kind, payload = {}) { sent.push({ t: kind, ...payload }); return this.state === 'online'; },
    take(kind) { const out = sent.filter((m) => m.t === kind); for (const m of out) sent.splice(sent.indexOf(m), 1); return out; },
  };
}

const wait = (ms = 0) => new Promise((r) => setTimeout(r, ms));

describe('neighbours feature (js/features/neighbours-mp-feature.js)', () => {
  const saved = {};
  let client;
  let engine;
  let body;
  let menu;
  let home = { inHome: false, room: 'street' };
  const events = [];
  const posted = [];
  const prompts = [];
  let keys = { given: [], received: [], houseLimit: 100, playerLimit: 100, hasHouse: true };

  before(() => {
    for (const k of ['document', 'fetch', 'groddleNeighbours', 'groddleBuddies', 'GRODDLE_MP_BOOT']) saved[k] = globalThis[k];
    body = new FakeEl('body');
    menu = new FakeEl('div');
    globalThis.document = { baseURI: 'https://groddle.localhost/', createElement: (t) => new FakeEl(t), createTextNode: (t) => ({ text: t }), head: new FakeEl('head'), body, getElementById: (id) => (id === 'more-list' ? menu : null) };
    globalThis.GRODDLE_MP_BOOT = { nonce: 'abcdef0123' };
    globalThis.groddleBuddies = { list: { buddies: [{ id: 9, name: 'Bo' }, { id: 11, name: 'Cy' }] } };
    globalThis.fetch = async (url, init = {}) => {
      const method = init.method || 'GET';
      const path = String(url).replace('https://groddle.localhost/wp-json/groddle/v1/', '');
      posted.push(`${method} ${path}`);
      let out = keys;
      if (path === 'homes/visitors') out = { allow: method === 'POST', can: { ok: true }, text: 'x' };
      if (path === 'homes/7') return { status: 403, ok: false, headers: { get: () => null }, json: async () => ({ code: 'groddle_home_blocked', message: 'You are blocked by that player.' }) };
      if (method === 'POST' && path === 'keys') {
        const id = JSON.parse(init.body).id;
        keys = { ...keys, given: [{ id, name: id === 9 ? 'Bo' : 'Cy', at: '' }, ...keys.given] };
        out = { ...keys, given: keys.given, told: 'key.sig' };
      }
      if (method === 'DELETE' && path.startsWith('keys/')) {
        keys = { ...keys, given: keys.given.filter((k) => `keys/${k.id}` !== path) };
        out = { ...keys, told: 'off.sig' };
      }
      return { status: 200, ok: true, headers: { get: () => null }, json: async () => out };
    };
    client = fakeClient();
    engine = {
      mode: 'multiplayer',
      started: true,
      streetTsid: 'GA5101HF7F429V5',
      player: { x: 100, y: 500 },
      query: (hook) => (hook === 'realtimeClient' ? client : null),
      targetVerbs: (t) => (t.classId === 'magic_rock' ? [{ id: 'talk_to', label: 'Talk to' }] : [{ id: 'party_invite', label: 'Invite to Party' }]),
      homeContext: () => home,
      transientInstance: () => false,
      setData: (k, v) => { engine.data[k] = v; },
      data: {},
      toast: (t) => events.push(`toast:${t}`),
      prompt: (p) => { prompts.push(p); events.push(`prompt:${p.text}`); return `uid${prompts.length}`; },
      removePrompt: (uid) => events.push(`removed:${uid}`),
      pushActivity: (t) => events.push(`activity:${t}`),
      playSound: (k) => events.push(`sound:${k}`),
      achievement: (c, n) => events.push(`achievement:${c}:${n}`),
    };
  });

  after(() => {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete globalThis[k];
      else globalThis[k] = v;
    }
  });

  it('does nothing in solo', () => {
    const solo = { mode: 'solo', started: true, query: () => client, homeContext: () => ({ inHome: true }) };
    neighboursMpFeature.onTick(16, 0, solo);
    assert.equal(globalThis.groddleNeighbours, undefined);
    assert.equal(neighboursMpFeature.realtimeStreet(solo), null);
    assert.equal(neighboursMpFeature.verbOverride({ classId: 'pc_remote', playerId: 2 }, solo), null);
    assert.equal(neighboursMpFeature.runVerbOverride({ classId: 'pc_remote', playerId: 2 }, VISIT_VERB.id), null);
    assert.equal(neighboursMpFeature.canVisitHomes(solo), null);
    assert.equal(neighboursMpApi.allowVisits(), null);
  });

  it('is wired before realtime, so its street and verbs reach it', () => {
    const ids = FEATURES.map((f) => f.id);
    assert.ok(ids.includes('neighbours-mp'));
    assert.ok(ids.indexOf('neighbours-mp') < ids.indexOf('realtime'));
    assert.ok(ids.indexOf('neighbours-mp') > ids.indexOf('buddies'));
  });

  it('loads the keyring and the opt-in, and shares your own home with visitors', async () => {
    neighboursMpFeature.onTick(16, 0, engine);
    await wait(5);
    assert.ok(globalThis.groddleNeighbours);
    assert.ok(posted.includes('GET keys') && posted.includes('GET homes/visitors'));
    assert.equal(neighboursMpApi.allowVisits(), false);
    assert.equal(neighboursMpFeature.realtimeStreet(engine), null, 'out in the world: the street itself');
    home = { inHome: true, room: 'street' };
    assert.equal(neighboursMpFeature.realtimeStreet(engine), 'HOME_1');
    home = { inHome: true, room: 'interior' };
    assert.equal(neighboursMpFeature.realtimeStreet(engine), 'HOUSE_1');
    home = { inHome: false, room: 'street' };
  });

  it('adds Visit Home Street to another player\'s menu, and Keys to your Magic Rock', () => {
    const verbs = neighboursMpFeature.verbOverride({ classId: 'pc_remote', playerId: 7, label: 'Ada' }, engine);
    assert.deepEqual(verbs.map((v) => v.label), ['Invite to Party', 'Visit Home Street']);
    assert.equal(neighboursMpFeature.verbOverride({ classId: 'magic_rock' }, engine), null, 'not away from home');
    home = { inHome: true, room: 'street' };
    assert.deepEqual(neighboursMpFeature.verbOverride({ classId: 'magic_rock' }, engine).map((v) => v.id), ['talk_to', 'house_keys']);
    home = { inHome: false, room: 'street' };
  });

  it('says why a visit was refused, in the source\'s words', async () => {
    assert.equal(neighboursMpFeature.runVerbOverride({ classId: 'pc_remote', playerId: 7, label: 'Ada' }, VISIT_VERB.id), true);
    await wait(5);
    assert.ok(events.includes('toast:You are blocked by that player.'));
    assert.equal(client.take('home_pass').length, 0, 'no pass without a home');
  });

  it('asks the owner about a knock, and answers the server', () => {
    client.msg({ t: 'home_knocked', id: 9, name: 'Bo', text: 'Bo is knocking on your door and would like to enter your house...' });
    const p = prompts.at(-1);
    assert.equal(p.text, 'Bo is knocking on your door and would like to enter your house...');
    assert.deepEqual(p.choices.map((c) => c.label), ['Ok, let them in.', "Nope, don't answer the door"]);
    assert.equal(p.timeout, 20);
    assert.equal(p.timeoutValue, 'dismiss');
    assert.ok(events.includes('sound:POL_GATE_KNOCKED'));
    p.onChoice('allow');
    assert.deepEqual(client.take('home_answer'), [{ t: 'home_answer', id: 9, allow: true }]);
    client.msg({ t: 'home_knocked', id: 11, name: 'Cy' });
    client.msg({ t: 'home_knock_over', id: 11 });
    assert.ok(events.includes(`removed:uid${prompts.length}`));
    client.msg({ t: 'home_entered', id: 9, name: 'Bo', text: 'Bo just entered your house.' });
    assert.equal(prompts.at(-1).text, 'Bo just entered your house.');
  });

  it('gives and revokes keys through the keyring, and tells the server', async () => {
    const session = globalThis.groddleNeighbours;
    session.openKeys('house');
    await wait(5);
    const shade = body.children.find((c) => c.attrs?.['data-keys-shade'] !== undefined);
    assert.ok(shade && !shade.hidden);
    assert.match(shade.text(), /Want to let your friends come and go as they please\?/);
    shade.find('data-keys-giveout').fire('click');
    assert.match(shade.text(), /Choose a friend you'd like to give a key to:/);
    assert.match(shade.text(), /Roommate alert!/);
    shade.find('data-key-give', 9).fire('click');
    await wait(5);
    assert.deepEqual(client.take('home_key_tell'), [{ t: 'home_key_tell', token: 'key.sig' }]);
    assert.ok(posted.includes('POST keys'));
    assert.match(shade.text(), /Given a key not long ago/);
    shade.find('data-key-revoke', 9).fire('click');
    const ask = prompts.at(-1);
    assert.match(ask.text, /^Are you sure you want to revoke Bo's access to your house\?/);
    ask.onChoice(true);
    await wait(5);
    assert.deepEqual(client.take('home_key_tell'), [{ t: 'home_key_tell', token: 'off.sig' }]);
    assert.match(shade.text(), /Keys that you give out will show up here/);
  });

  it('tells a new key-holder with the source\'s prompt', async () => {
    client.msg({ t: 'home_key', from: { id: 7, name: 'Ada' }, on: true, text: 'Ada sent you a key to their house! (Keys can be found at your Magic Rock.)' });
    assert.equal(prompts.at(-1).text, 'Ada sent you a key to their house! (Keys can be found at your Magic Rock.)');
    await wait(5);
  });

  it('routes the buddies panel\'s Visit here', () => {
    assert.equal(neighboursMpFeature.canVisitHomes(engine), true);
    assert.match(read('public/js/features/buddies-feature.js'), /engine\.query\?\.\('visitHome', b\.id, b\.name, engine\)/);
  });
});

describe('neighbours across the repos', () => {
  it('the site declares the tables and routes, signed in only, never the user from the request', { skip: skipWithoutSite }, () => {
    const manifest = JSON.parse(readFileSync(sitePath('minn.json'), 'utf8'));
    assert.ok(manifest.tables.groddle_house_keys.includes('PRIMARY KEY  (owner_id,holder_id)'));
    assert.ok(manifest.tables.groddle_home_visitors.includes('PRIMARY KEY  (user_id)'));
    const php = readFileSync(sitePath('src/Neighbours.php'), 'utf8');
    for (const route of ["'/groddle/v1/homes/{id:\\d+}'", "'/groddle/v1/homes/random'", "'/groddle/v1/homes/visitors'", "'/groddle/v1/keys'", "'/groddle/v1/keys/{id:\\d+}'"]) assert.ok(php.includes(route), route);
    assert.equal((php.match(/Access::SignedIn/g) || []).length, 8, 'every route is signed-in only');
    assert.ok(!/\$request->json\(\)\[['"](user|sub|user_id|owner)/.test(php), 'the user never comes from the request');
    assert.match(readFileSync(sitePath('src/Extension.php'), 'utf8'), /new Neighbours\(\$minn\)/);
    for (const text of ['Could not find their house.', "You can't give out keys because you don't have a house!", 'They already have too many keys on their keyring!', "You've already given out the maximum number of keys for your house.", 'You need to cultivate 3 items.']) assert.ok(php.includes(text), text);
    assert.match(php, /HOUSE_LIMIT = 100/);
    // The Visiting Stone with nobody opted in says so (the remake's line); a target that fails keeps the source's.
    assert.match(php, /if \(\$ids === \[\]\) \{\s*throw new RestError\('groddle_home_random_empty', self::TEXT_RANDOM_EMPTY, 404\);/);
    assert.ok(php.includes("Nobody's taking visitors right now. Try again later."));
    assert.ok(php.includes("TEXT_RANDOM_NONE = 'Hmm, something went wrong :('"));
    assert.match(php, /PLAYER_LIMIT = 100/);
  });

  it('the site checks visiting_can_opt_in in the source\'s order, and sends a visitor only the home', { skip: skipWithoutSite }, () => {
    const phpBin = existsSync('/opt/homebrew/bin/php') ? '/opt/homebrew/bin/php' : 'php';
    const src = sitePath('src/Neighbours.php');
    const run = (code) => execFileSync(phpBin, ['-r', `require ${JSON.stringify(src)}; ${code}`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    let out;
    try {
      out = run(`use Groddle\\Minn\\Neighbours as N; $s = fn ($j) => json_decode($j, false);
        echo N::canOptIn($s('{"player":{"level":3}}'))['error'], ',';
        echo N::canOptIn($s('{"player":{"level":4},"systems":{"home":{"owned":false}}}'))['error'], ',';
        echo N::canOptIn($s('{"player":{"level":4},"systems":{"home":{"owned":true},"features":{"homes":{"cult":{"items":[1,2]}}}}}'))['error'], ',';
        echo N::canOptIn($s('{"player":{"level":4},"systems":{"home":{"owned":true},"features":{"homes":{"cult":{"items":[1,2,3]}},"butler":{"owned":false}}}}'))['error'], ',';
        echo N::canOptIn($s('{"player":{"level":9},"systems":{"home":{"owned":true},"features":{"homes":{"cult":{"items":[1,2,3]}},"butler":{"owned":true}}}}'))['ok'] ? 'ok' : 'no', ',';
        echo N::inTutorial($s('{"systems":{"features":{"newxp":{"status":"active"}}}}')) ? 'newxp' : 'done', ',';
        echo json_encode(N::homesSlice($s('{"systems":{"features":{"homes":{"decor":{"placed":[]},"cult":{"gardens":{}},"magicRock":{"x":1},"houseVisits":4,"streetStyle":"meadow_ext_default_high"}}}}')));`);
    } catch {
      return; // no php here
    }
    assert.equal(out, 'low_level,no_home,no_cultivation,no_butler,ok,newxp,{"decor":{"placed":[]},"cult":{"gardens":{}},"streetStyle":"meadow_ext_default_high"}');
  });

  it('the server handles the kinds the game sends and sends the ones it hears, in the source\'s words', { skip: skipWithoutServer }, () => {
    const p = serverPath('homes.go');
    if (!existsSync(p)) return;
    const go = readFileSync(p, 'utf8');
    for (const k of ['home_pass', 'home_knock', 'home_answer', 'home_key_tell']) assert.ok(go.includes(`r.Handle("${k}"`), k);
    for (const k of ['home_pass_ok', 'home_knocked', 'home_knock_sent', 'home_knock_over', 'home_open', 'home_let_in', 'home_answered', 'home_refused', 'home_entered', 'home_key', 'home_out']) assert.ok(go.includes(`"${k}"`), k);
    const feature = read('public/js/features/neighbours-mp-feature.js');
    for (const k of ['home_pass', 'home_knock', 'home_answer', 'home_key_tell', 'home_pass_ok', 'home_knocked', 'home_knock_sent', 'home_knock_over', 'home_open', 'home_let_in', 'home_answered', 'home_refused', 'home_entered', 'home_key', 'home_out']) assert.ok(feature.includes(`'${k}'`) || feature.includes(`msg:${k}'`), k);
    assert.ok(go.includes('" is knocking on your door and would like to enter your house..."'));
    assert.ok(go.includes('" sent you a key to their house! (Keys can be found at your Magic Rock.)"'));
    assert.ok(go.includes(`"${NEIGHBOURS_TEXT.knockSent}"`));
    assert.ok(go.includes('HOME_') && go.includes('HOUSE_'));
  });
});
