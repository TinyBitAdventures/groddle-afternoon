/**
 * Alternate characters, the game's side (Austin's rulings of 2026-11-12; the site's contract:
 * groddle/v1/characters, characters/{id}/play, the X-Groddle-Character header and its 409
 * character_changed; the realtime server's close 4012). The start card's choices
 * (js/online-boot.js), the account's character calls (js/minn-account-core.js), the header on
 * every write and the stop on 409 (js/character-guard.js, js/save-store.js), the realtime
 * client's 4012 (js/realtime-client.js, js/features/realtime-feature.js) and Menu > Switch
 * character (js/features/account-backup-feature.js). The browser check with stubbed routes is
 * tools/qa/alt-characters-check.mjs.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SITE_DIR, skipWithoutSite } from '../tools/repos.mjs';

import { CHARACTER_CHANGED, CHARACTER_CHANGED_EVENT, CHARACTER_HEADER, characterHeaders, characterOf, isCharacterChanged } from '../public/js/character-guard.js?v=510034a7';
import { createMinnAccountCore } from '../public/js/minn-account-core.js?v=63758d34';
import { createSaveSync } from '../public/js/save-store.js?v=04420633';
import { CLOSE_OTHER_CHARACTER, createRealtimeClient } from '../public/js/realtime-client.js?v=2663e2d3';
import { OTHER_CHARACTER_TEXT, statusText } from '../public/js/features/realtime-feature.js?v=b787af61';
import { CHARACTER_COPY, FRESH_HASH, SAVE_ALERT_COPY, characterChoices, continuesAs, createRefusalText, saveAlertFor } from '../public/js/online-boot.js?v=91e01718';
import { SWITCHER_COPY, STYLE as SWITCHER_STYLE, cardUrl, popoverPlace, switcherChoices } from '../public/js/character-switcher.js?v=d951e892';
import { LOCAL_STATES } from '../public/js/shared-quoins.js?v=89d7b201';
import { menuRowFor } from '../public/js/ui/topbar.js?v=bbef6814';

const root = join(import.meta.dirname, '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');
const code = (rel) => read(rel).replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');
const flush = () => new Promise((r) => setImmediate(r));
const BASE = 'https://groddle.localhost/';

/** A fetch that answers from a list and records each request's url, method and headers. */
function scripted(answers) {
  const seen = [];
  const queue = [...answers];
  const fn = async (url, init = {}) => {
    seen.push({ url: String(url), method: init.method || 'GET', headers: { ...(init.headers || {}) }, body: init.body });
    const a = queue.shift() || { status: 200, body: {} };
    return { status: a.status, ok: a.status >= 200 && a.status < 300, headers: { get: (h) => (h === 'X-WP-Nonce' ? a.nonce || null : null) }, json: async () => a.body, text: async () => (typeof a.body === 'string' ? a.body : JSON.stringify(a.body)) };
  };
  return { fn, seen };
}

/** Catches the page events a module dispatches on globalThis for the length of fn. */
async function hearing(fn) {
  const heard = [];
  const had = { dispatchEvent: globalThis.dispatchEvent, CustomEvent: globalThis.CustomEvent };
  globalThis.dispatchEvent = (e) => heard.push(e);
  globalThis.CustomEvent ??= class extends Event { constructor(type, init = {}) { super(type); this.detail = init.detail; } };
  try {
    await fn();
  } finally {
    if (had.dispatchEvent) globalThis.dispatchEvent = had.dispatchEvent;
    else delete globalThis.dispatchEvent;
  }
  return heard;
}

describe('character-guard: the header and the refusal', () => {
  it('names a positive whole id only, and reads the boot data\'s player', () => {
    assert.equal(CHARACTER_HEADER, 'X-Groddle-Character');
    assert.deepEqual(characterHeaders(54), { 'X-Groddle-Character': '54' });
    for (const bad of [0, -1, 1.5, 'x', null, undefined]) assert.deepEqual(characterHeaders(bad), {}, String(bad));
    assert.equal(characterOf({ GRODDLE_MP_BOOT: { player: { id: 61 } } }), 61);
    assert.equal(characterOf({}), 0, 'solo and the phone send none');
  });

  it('is the site\'s 409 character_changed and nothing else', () => {
    assert.equal(CHARACTER_CHANGED, 'character_changed');
    assert.equal(isCharacterChanged(409, { code: 'character_changed' }), true);
    assert.equal(isCharacterChanged(409, { code: 'groddle_save_elsewhere' }), false);
    assert.equal(isCharacterChanged(403, { code: 'character_changed' }), false);
  });
});

describe('the account: characters and the header on every call', () => {
  it('sends the header once it knows the character, and none before', async () => {
    const { fn, seen } = scripted([{ status: 200, body: {} }, { status: 200, body: {} }]);
    const account = createMinnAccountCore({ baseUri: BASE, fetch: fn, nonce: 'abcdef0123' });
    assert.equal(account.character, 0);
    await account.presence();
    assert.equal(seen[0].headers['X-Groddle-Character'], undefined);
    account.useCharacter(54);
    await account.playerMail();
    assert.equal(seen[1].headers['X-Groddle-Character'], '54');
  });

  it('takes the character from the multiplayer boot data by default (every feature\'s own account)', async () => {
    globalThis.GRODDLE_MP_BOOT = { player: { id: 61, name: 'Ada' } };
    try {
      const { fn, seen } = scripted([{ status: 200, body: {} }]);
      const account = createMinnAccountCore({ baseUri: BASE, fetch: fn, nonce: 'abcdef0123' });
      await account.playerMail();
      assert.equal(seen[0].headers['X-Groddle-Character'], '61');
    } finally {
      delete globalThis.GRODDLE_MP_BOOT;
    }
  });

  it('a 409 character_changed is announced on the page', async () => {
    const { fn } = scripted([{ status: 409, body: { code: 'character_changed', message: 'x' } }]);
    const account = createMinnAccountCore({ baseUri: BASE, fetch: fn, nonce: 'abcdef0123', character: 54 });
    const heard = await hearing(async () => {
      await assert.rejects(account.playerMail(), (e) => e.status === 409 && e.code === 'character_changed');
    });
    assert.deepEqual(heard.map((e) => e.type), [CHARACTER_CHANGED_EVENT]);
  });

  it('lists, makes, plays, retires and restores by the contract\'s routes', async () => {
    const list = { login: 54, current: 54, limit: 3, canCreate: true, nextCreateAt: null, characters: [{ id: 54, name: 'Ada', level: 7, lastPlayedAt: 1, retired: false, first: true }] };
    const { fn, seen } = scripted([
      { status: 200, body: list },
      { status: 201, body: { character: { id: 77, name: 'Bo', level: 1, lastPlayedAt: null, retired: false, first: false } } },
      { status: 200, body: { ok: true, nonce: '0123456789' }, nonce: 'aaaaaaaaaa' },
      { status: 200, body: { ok: true } },
      { status: 200, body: { ok: true } },
    ]);
    const account = createMinnAccountCore({ baseUri: BASE, fetch: fn, nonce: 'abcdef0123', character: 54 });
    assert.deepEqual(await account.characters(), list);
    const made = await account.createCharacter('  Bo  ');
    assert.equal(made.ok, true);
    assert.equal(made.character.id, 77);
    assert.deepEqual(JSON.parse(seen[1].body), { name: 'Bo' });
    assert.deepEqual(await account.playCharacter(77), { ok: true });
    assert.equal(account.nonce, '0123456789', 'the new session\'s nonce from the answer');
    assert.equal(account.character, 77, 'the calls name the new character from now on');
    assert.equal(seen[2].headers['X-Groddle-Character'], '54', 'the play call names the one signed in');
    await account.retireCharacter(77);
    await account.restoreCharacter(77);
    assert.deepEqual(seen.map((s) => `${s.method} ${s.url.replace(`${BASE}wp-json/groddle/v1/`, '')}`), [
      'GET characters', 'POST characters', 'POST characters/77/play', 'POST characters/77/retire', 'POST characters/77/restore',
    ]);
    assert.equal(seen[4].headers['X-Groddle-Character'], '77');
  });

  it('a refused new character keeps its status and the name\'s own words', async () => {
    const { fn } = scripted([
      { status: 422, body: { code: 'groddle_invalid', message: 'Someone already has that name. Try another.', fields: { name: 'Someone already has that name. Try another.' } } },
      { status: 409, body: { code: 'characters_limit', message: 'x' } },
      { status: 429, body: { code: 'characters_daily', message: 'x' } },
    ]);
    const account = createMinnAccountCore({ baseUri: BASE, fetch: fn, nonce: 'abcdef0123', character: 54 });
    const name = await account.createCharacter('Ada');
    assert.equal(name.ok, false);
    assert.equal(createRefusalText(name), 'Someone already has that name. Try another.');
    assert.equal(createRefusalText(await account.createCharacter('Bo')), 'You can have 3 characters, and a retired one keeps its place for 30 days after you retire it.');
    assert.equal(createRefusalText(await account.createCharacter('Cy')), 'You can make one new character a day. Try again tomorrow.');
  });
});

describe('the start card\'s choices (online-boot characterChoices)', () => {
  const ada = { id: 54, name: 'Ada', level: 12, lastPlayedAt: 100, retired: false, first: true };
  const bo = { id: 77, name: 'Bo', level: 3, lastPlayedAt: 200, retired: false, first: false };
  const cy = { id: 80, name: 'Cy', level: 1, lastPlayedAt: null, retired: false, first: false };
  const session = (id, name) => ({ player: { id, name } });

  it('one character: its row, and a fresh one on offer', () => {
    const c = characterChoices({ current: 54, limit: 3, canCreate: true, nextCreateAt: null, characters: [ada] }, session(54, 'Ada'));
    assert.deepEqual(c.rows, [{ id: 54, name: 'Ada', level: 12, current: true, retirable: false }]);
    assert.deepEqual(c.create, { can: true, note: '', limit: 3 });
  });

  it('two characters: the one signed in first, then the rest as the site lists them', () => {
    const c = characterChoices({ current: 77, limit: 3, canCreate: false, nextCreateAt: 1_900_000_000, characters: [ada, bo] }, session(77, 'Bo'));
    assert.deepEqual(c.rows.map((r) => [r.name, r.current]), [['Bo', true], ['Ada', false]]);
    assert.equal(c.create.can, false);
    assert.equal(c.create.note, 'You can make one new character a day. Try again tomorrow.');
  });

  it('three characters: no fresh one, said plainly; a retired one waits apart', () => {
    const c = characterChoices({ current: 54, limit: 3, canCreate: false, nextCreateAt: null, characters: [ada, bo, cy] }, session(54, 'Ada'));
    assert.equal(c.rows.length, 3);
    assert.equal(c.create.note, 'You have 3 characters.');
    const r = characterChoices({ current: 54, limit: 3, canCreate: false, characters: [ada, { ...bo, retired: true }, cy] }, session(54, 'Ada'));
    assert.deepEqual(r.rows.map((x) => x.name), ['Ada', 'Cy']);
    assert.deepEqual(r.retired.map((x) => x.name), ['Bo']);
    assert.equal(r.create.note, 'You can have 3 characters, and a retired one keeps its place for 30 days after you retire it.', 'a retired character still holds its place, said so');
  });

  it('the site\'s refusal picks the line: a held place, or the one a day (messages audit, Characters)', () => {
    const held = characterChoices({ current: 54, limit: 3, canCreate: false, nextCreateAt: 1_900_000_000, refusal: 'character_limit', characters: [ada, { ...bo, retired: true }, cy] }, session(54, 'Ada'));
    assert.equal(held.create.note, 'You can have 3 characters, and a retired one keeps its place for 30 days after you retire it.');
    // Three rows, one retired long ago (no longer counted), a character made today: the day rule.
    const daily = characterChoices({ current: 54, limit: 3, canCreate: false, nextCreateAt: 1_900_000_000, refusal: 'character_daily', characters: [ada, { ...bo, retired: true }, cy] }, session(54, 'Ada'));
    assert.equal(daily.create.note, 'You can make one new character a day. Try again tomorrow.');
    const older = characterChoices({ current: 54, limit: 3, canCreate: false, nextCreateAt: 1_900_000_000, characters: [ada, { ...bo, retired: true }, cy] }, session(54, 'Ada'));
    assert.equal(older.create.note, 'You can make one new character a day. Try again tomorrow.', 'an older site: the wait it names');
  });

  it('the site\'s characters list says why it refuses', { skip: skipWithoutSite }, () => {
    const site = readFileSync(join(SITE_DIR, 'src', 'CharacterRoutes.php'), 'utf8');
    assert.match(site, /'refusal' => \$banned \? 'groddle_suspended' : \(\$refusal\['code'\] \?\? null\),/);
    assert.match(site, /A retired character keeps its place for 30 days\./);
  });

  it('no list (an older site, or it failed): the signed-in character alone, no fresh one', () => {
    const c = characterChoices(null, session(54, 'Ada'));
    assert.deepEqual(c.rows, [{ id: 54, name: 'Ada', level: null, current: true, retirable: false }]);
    assert.equal(c.create, null);
  });

  it('Retire is offered on an extra character that is not signed in, never the first or the one playing', () => {
    const asAda = characterChoices({ current: 54, limit: 3, canCreate: false, characters: [ada, bo, cy] }, session(54, 'Ada'));
    assert.deepEqual(asAda.rows.map((r) => [r.name, r.retirable]), [['Ada', false], ['Bo', true], ['Cy', true]]);
    const asBo = characterChoices({ current: 77, limit: 3, canCreate: false, characters: [ada, bo, cy] }, session(77, 'Bo'));
    assert.deepEqual(asBo.rows.map((r) => [r.name, r.retirable]), [['Bo', false], ['Ada', false], ['Cy', true]], 'the first never, the one playing never');
    const unsure = characterChoices({ current: 54, limit: 3, canCreate: false, characters: [ada, { ...cy, first: undefined }] }, session(54, 'Ada'));
    assert.equal(unsure.rows[1].retirable, false, 'only when the site says it is an extra one');
    const gone = characterChoices({ current: 54, limit: 3, canCreate: false, characters: [ada, { ...bo, retired: true }] }, session(54, 'Ada'));
    assert.equal(gone.retired[0].retirable, false, 'a retired one is restored, not retired again');
  });

  it('the retire question says plainly what happens, in the card (never window.confirm)', () => {
    assert.equal(CHARACTER_COPY.retire, 'Retire');
    assert.equal(CHARACTER_COPY.retireLabel('Bo'), 'Retire Bo');
    assert.equal(CHARACTER_COPY.retireAsk('Bo'), "Retire Bo? They'll be hidden from this list. You can bring them back from Retired characters. For 30 days their name stays theirs and they still count toward your 3 characters.");
    const src = code('public/js/online-boot.js');
    assert.doesNotMatch(src, /\bconfirm\(/);
    const body = src.slice(src.indexOf('function appendRetire('), src.indexOf('function appendCharacters('));
    assert.match(body, /const r = await account\.retireCharacter\(c\.id\);\n\s*if \(r\.ok\) \{\n\s*onRetired\?\.\(c\.id\);/, 'retired, then the card again');
    assert.match(body, /note\.textContent = r\.message \|\| CHARACTER_COPY\.failed;\n\s*note\.dataset\.tone = 'bad';/, 'a refusal in the site\'s own words');
    assert.match(src, /if \(c\.retirable\) appendRetire\(li, c, \{ account, busy, onRetired \}\);/);
    assert.match(src, /appendCharacters\(card, \{ account, session, characters, onPlay, onSwitched, onRetired: onRefresh, fresh \}\)/);
    assert.match(src, /onRefresh: \(\) => \{ boot\(\{ account \}\); \}/, 'the refreshed card reads the list again');
  });

  it('the words are plain, no em-dashes', () => {
    assert.equal(CHARACTER_COPY.play('Ada'), 'Play as Ada');
    assert.equal(CHARACTER_COPY.level(12), 'Level 12');
    assert.equal(CHARACTER_COPY.fresh, 'Start a fresh character');
    const words = JSON.stringify(CHARACTER_COPY, (k, v) => (typeof v === 'function' ? v('Ada') : v));
    assert.doesNotMatch(words, /—/);
    assert.doesNotMatch(code('public/js/online-boot.js'), /—/);
  });

  it('a tab goes straight in only as the character it played (or whoever, just signed in)', () => {
    assert.equal(continuesAs('54', 54), true);
    assert.equal(continuesAs('54', 77), false, 'another tab switched: the card shows');
    assert.equal(continuesAs('*', 77), true);
    assert.equal(continuesAs('1', 54), false, 'the old one-for-all mark shows the card once');
    assert.equal(continuesAs(null, 54), false);
  });

  it('the card offers Start a fresh character, Play solo and Not <name>? Sign out, and boots again after a switch', () => {
    const src = read('public/js/online-boot.js');
    assert.match(src, /const r = await account\.playCharacter\(id\);\n\s*if \(r\.ok\) \{\n\s*onSwitched\?\.\(id\);/);
    assert.match(src, /onSwitched: \(id\) => \{ markContinued\(id\); boot\(\{ account \}\); \}/);
    assert.match(src, /const made = await account\.createCharacter\(name\);/);
    assert.match(src, /await switchTo\(id, String\(made\.character\.name \|\| name\)\);/, 'made, then played');
    assert.match(src, /const problem = characterNameProblem\(name\);/, 'the sign-up\'s own name rules first');
    assert.match(src, /name \? `Not \$\{name\}\? Sign out` : 'Sign out'/);
    assert.match(src, /account\.useCharacter\(session\.player\?\.id\);/);
  });
});

describe('the save: the header on every write, and a stop on character_changed', () => {
  function syncWith(answers, opts = {}) {
    const { fn, seen } = scripted(answers);
    const states = [];
    const sync = createSaveSync({ url: `${BASE}wp-json/groddle/v1/save`, nonce: 'abcdef0123', nonceUrl: `${BASE}nonce`, writer: 'abcd1234abcd1234', character: 54, payload: () => ({ entries: {} }), fetch: fn, onState: (s, d) => states.push([s, d]), timers: { setTimeout: () => 0, clearTimeout: () => {} }, ...opts });
    return { sync, seen, states };
  }

  it('names the character on a write and on the stale-nonce retry', async () => {
    const { sync, seen } = syncWith([
      { status: 403, body: { code: 'rest_cookie_invalid_nonce' } },
      { status: 200, body: '0123456789' },
      { status: 200, body: { version: 5, updatedAt: '2026-11-12T10:00:00Z' } },
    ]);
    sync.changed();
    await sync.flush();
    const writes = seen.filter((s) => s.method === 'PUT');
    assert.equal(writes.length, 2);
    for (const w of writes) assert.equal(w.headers['X-Groddle-Character'], '54');
    assert.equal(sync.state, 'saved');
  });

  it('a 409 character_changed stops the page for good: no keep, no retry, no more writes', async () => {
    const { sync, seen, states } = syncWith([{ status: 409, body: { code: 'character_changed' } }]);
    sync.changed();
    await sync.flush();
    assert.equal(sync.state, 'elsewhere');
    assert.equal(states.at(-1)[1].by, 'character');
    await sync.takeover();
    await sync.retry();
    sync.changed();
    await sync.flush();
    await sync.flush({ keepalive: true });
    assert.equal(seen.length, 1, 'nothing more was sent');
  });

  it('another call heard it first: the save stops without a write, and a write in flight never turns it back', async () => {
    let release;
    const gate = new Promise((r) => { release = r; });
    const seen = [];
    const fetch = async (url, init) => {
      seen.push(init);
      await gate;
      return { status: 200, ok: true, headers: { get: () => null }, json: async () => ({ version: 5, updatedAt: '2026-11-12T10:00:00Z' }) };
    };
    const sync = createSaveSync({ url: 'x', nonce: 'abcdef0123', character: 54, payload: () => ({}), fetch, timers: { setTimeout: () => 0, clearTimeout: () => {} } });
    sync.changed();
    const out = sync.flush();
    await flush();
    sync.characterChanged();
    assert.equal(sync.state, 'elsewhere');
    release();
    await out;
    assert.equal(sync.state, 'elsewhere');
    sync.changed();
    await sync.flush();
    assert.equal(seen.length, 1);
  });

  it('the store listens for the page\'s character_changed, and the alert offers Choose a character', () => {
    assert.match(read('public/js/save-store.js'), /scope\.addEventListener\(CHARACTER_CHANGED_EVENT, \(\) => \{ sync\.characterChanged\(\); \}\);/);
    assert.match(read('public/js/save-store.js'), /character: boot\.player\?\.id,/);
    const alert = saveAlertFor('elsewhere', { by: 'character' });
    assert.equal(alert.title, 'Playing in another window', 'the existing playing-elsewhere state');
    assert.equal(alert.body, SAVE_ALERT_COPY.character.body);
    assert.deepEqual(alert.buttons, [['choose', 'Choose a character']]);
    assert.match(read('public/js/online-boot.js'), /if \(choice === 'choose'\) markContinued\(false\);\n\s*location\.reload\(\);/);
  });

  it('the home sales and boxes helpers name the character too', () => {
    for (const rel of ['public/js/features/home-storage-feature.js', 'public/js/features/home-street-mp-feature.js']) {
      const src = read(rel);
      assert.match(src, /const headers = \{ \.\.\.characterHeaders\(character\) \};/, rel);
      assert.match(src, /if \(character && isCharacterChanged\(res\.status, data\)\) announceCharacterChanged\(globalThis, \{ character, path \}\);/, rel);
    }
  });
});

describe('realtime: close 4012, another character plays now', () => {
  function client(ticket) {
    const made = [];
    class Sock {
      constructor() { this.readyState = 0; this.sent = []; made.push(this); }
      send(d) { this.sent.push(JSON.parse(d)); }
      close() { this.readyState = 3; }
    }
    const timers = [];
    const c = createRealtimeClient({ ticket, baseUri: BASE, WebSocket: Sock, setTimeout: (fn, ms) => timers.push({ fn, ms }), clearTimeout: () => {}, now: () => 0, random: () => 0.5 });
    return { c, made, timers };
  }

  it('stops and never reconnects', async () => {
    let asked = 0;
    const { c, made, timers } = client(async () => { asked += 1; return { ticket: 't', path: '/ws' }; });
    c.start();
    await flush();
    const ws = made[0];
    ws.readyState = 1;
    ws.onopen();
    ws.onmessage({ data: JSON.stringify({ t: 'hello', you: { id: 54, name: 'Ada' } }) });
    ws.readyState = 3;
    ws.onclose({ code: CLOSE_OTHER_CHARACTER });
    assert.equal(CLOSE_OTHER_CHARACTER, 4012);
    assert.equal(c.state, 'other-character');
    for (const t of timers.splice(0)) t.fn();
    await flush();
    assert.equal(asked, 1);
    assert.equal(made.length, 1);
  });

  it('the ticket route\'s 409 character_changed stops it the same way', async () => {
    const { c, made } = client(async () => { throw Object.assign(new Error('no'), { status: 409, code: 'character_changed' }); });
    c.start();
    await flush();
    assert.equal(c.state, 'other-character');
    assert.equal(made.length, 0);
  });

  it('says so in the exact words, and shared things go back to local rules', () => {
    assert.equal(OTHER_CHARACTER_TEXT.note, "You're playing as another character in another window.");
    assert.equal(statusText('other-character'), 'Playing as another character');
    assert.ok(LOCAL_STATES.has('other-character'));
    const src = read('public/js/features/realtime-feature.js');
    assert.match(src, /if \(state === 'other-character'\) \{\n\s*addLog\(\{ note: true, text: OTHER_CHARACTER_TEXT\.note \}\);/);
    for (const rel of ['public/js/features/street-objects-feature.js', 'public/js/features/shared-patches-feature.js', 'public/js/features/shared-gardens-feature.js']) {
      assert.match(read(rel), /'replaced', 'other-character', 'stopped'/, rel);
    }
  });
});

describe('Menu > Switch character (account-backup-feature)', () => {
  const src = read('public/js/features/account-backup-feature.js');

  it('sits beside Sign out, in the Menu and the Account panel', () => {
    assert.match(src, /id: 'switch-character-btn'/);
    assert.match(src, /list\.append\(acct, swap, btn\);/);
    assert.match(src, /'data-account-switch-character': ''/);
    assert.match(src, /actions\.append\(swap, out\);/);
    assert.deepEqual(menuRowFor('switch-character-btn'), { group: 'settings', rank: 2 });
    assert.ok(menuRowFor('signout-btn').rank > menuRowFor('switch-character-btn').rank);
  });

  it('saves first, forgets this tab\'s character, then goes to the start card', () => {
    const body = src.slice(src.indexOf('async function switchCharacter('), src.indexOf('/** Multiplayer\'s Account panel'));
    const order = ['engine.save?.()', 'await saveStore.flush?.(); await saveStore.flush?.();', 'markContinued(false);', 'location.href = account.urls.online;'].map((s) => body.indexOf(s));
    assert.ok(order.every((i) => i > 0), String(order));
    assert.deepEqual([...order].sort((a, b) => a - b), order);
    assert.doesNotMatch(body, /signOut/, 'the session stays');
  });
});

describe('Your characters on the save cloud (js/character-switcher.js)', () => {
  const ada = { id: 54, name: 'Ada', level: 12, lastPlayedAt: 100, retired: false, first: true };
  const bo = { id: 77, name: 'Bo', level: 3, lastPlayedAt: 200, retired: false, first: false };
  const sw = code('public/js/character-switcher.js');

  it('lists the one playing first and marked, the others to switch to, retired ones left to the card', () => {
    const c = switcherChoices({ current: 77, limit: 3, canCreate: true, characters: [ada, bo, { id: 80, name: 'Cy', level: 1, retired: true, first: false }] }, { id: 77, name: 'Bo' });
    assert.deepEqual(c.rows, [{ id: 77, name: 'Bo', level: 3, current: true }, { id: 54, name: 'Ada', level: 12, current: false }]);
    assert.deepEqual(c.fresh, { can: true, note: '' });
    const full = switcherChoices({ current: 54, limit: 3, canCreate: false, characters: [ada, bo, { ...bo, id: 80, name: 'Cy' }] }, { id: 54, name: 'Ada' });
    assert.equal(full.fresh.note, 'You have 3 characters.');
    const none = switcherChoices(null, { id: 54, name: 'Ada' });
    assert.deepEqual(none.rows.map((r) => [r.name, r.current]), [['Ada', true]], 'no list: the one playing alone');
    assert.equal(none.fresh, null);
  });

  it('goes to the start card, opening the fresh character form on #fresh', () => {
    assert.equal(FRESH_HASH, '#fresh');
    assert.equal(cardUrl('https://groddle.localhost/play/online/', { fresh: true }), 'https://groddle.localhost/play/online/#fresh');
    assert.equal(cardUrl('play/online/', { base: 'https://groddle.localhost/play/online/#x' }), 'https://groddle.localhost/play/online/play/online/');
    assert.equal(cardUrl('https://groddle.localhost/play/online/', { base: 'https://groddle.localhost/' }), 'https://groddle.localhost/play/online/');
    const boot = read('public/js/online-boot.js');
    assert.match(boot, /const fresh = location\.hash === FRESH_HASH;\n\s*if \(fresh\) history\.replaceState/);
    assert.match(boot, /if \(startFresh\) \{\n\s*open\.hidden = true;\n\s*form\.hidden = false;/);
    assert.match(sw, /win\.history\.replaceState\(win\.history\.state, '', to\.href\);\n\s*win\.location\.reload\(\);/, 'a hash alone never reloads');
  });

  it('Switch saves first, then plays the other, then loads the game as it; refusals said plainly', () => {
    const body = sw.slice(sw.indexOf('async function switchTo('), sw.indexOf('function draw('));
    const order = ['await save();', 'await account.playCharacter(row.id);', 'markContinued(row.id);', 'goToCard('].map((x) => body.indexOf(x));
    assert.ok(order.every((i) => i > 0), String(order));
    assert.deepEqual([...order].sort((a, b) => a - b), order);
    assert.match(body, /say\(r\?\.message \|\| CHARACTER_COPY\.failed, true\);/);
    const leave = sw.slice(sw.indexOf('async function leaveFor('), sw.indexOf('async function switchTo('));
    assert.ok(leave.indexOf('await save();') < leave.indexOf('markContinued(false);'), 'Start a fresh character and Manage save first, then show the card');
  });

  it('the cloud is the button: named by its save words, expanded state, Escape, the game\'s keys kept out', () => {
    assert.match(sw, /const btn = pill\?\.querySelector\?\.\('\.save-pill-btn'\);/);
    assert.match(sw, /btn\.setAttribute\('aria-haspopup', 'dialog'\);\n\s*btn\.setAttribute\('aria-expanded', 'false'\);\n\s*btn\.setAttribute\('aria-controls', 'character-switcher'\);/);
    assert.match(sw, /role: 'dialog', 'aria-label': SWITCHER_COPY\.title/);
    assert.match(sw, /btn\.setAttribute\('aria-label', SWITCHER_COPY\.label\(pill\.dataset\.tip \|\| ''\)\);/, 'the tooltip\'s words name it, kept current');
    assert.match(sw, /if \(e\.key === 'Enter' \|\| e\.key === ' '\) e\.stopPropagation\(\);/, 'Enter opens it, not chat');
    assert.match(sw, /pop\.addEventListener\('keydown', \(e\) => \{\n\s*e\.stopPropagation\(\);\n\s*if \(e\.key === 'Escape'\) close\(\);/);
    assert.equal(SWITCHER_COPY.label('Playing as Bo · Saved'), 'Playing as Bo · Saved. Your characters');
    assert.equal(SWITCHER_COPY.fresh, CHARACTER_COPY.fresh);
    assert.equal(SWITCHER_COPY.manage, 'Manage characters');
    assert.doesNotMatch(JSON.stringify(SWITCHER_COPY, (k, v) => (typeof v === 'function' ? v('Ada') : v)), /—/);
    assert.doesNotMatch(read('public/js/character-switcher.js'), /—/);
  });

  it('the save state the cloud shows is the popover\'s top line', () => {
    assert.match(sw, /saveLine\.dataset\.state = pill\.dataset\.state \|\| 'saved';\n\s*saveLine\.textContent = pill\.querySelector\('\.save-pill-state'\)\?\.textContent \|\| '';/);
    assert.match(sw, /pop\.replaceChildren\(saveLine, el\(doc, 'h2', \{\}, SWITCHER_COPY\.title\)\);/);
    assert.match(sw, /attributeFilter: \['data-tip', 'data-state'\]/, 'follows the pill while open');
  });

  it('opens above the cloud, right edges together, held inside a 402 px phone', () => {
    assert.deepEqual(popoverPlace({ top: 744, right: 720 }, { width: 288, viewW: 1280, viewH: 800 }), { left: 432, bottom: 64, maxHeight: 728 });
    // The cloud near the left edge: the popover slides right to stay inside.
    assert.deepEqual(popoverPlace({ top: 668, right: 205 }, { width: 288, viewW: 1280, viewH: 800 }).left, 8);
    // A phone: never wider than the window less its margins.
    const phone = popoverPlace({ top: 816, right: 285 }, { width: 400, viewW: 402, viewH: 874 });
    assert.equal(phone.left, 8);
    assert.ok(phone.left + Math.min(400, 402 - 16) <= 402 - 8);
    assert.match(SWITCHER_STYLE, /width: min\(18rem, calc\(100vw - 2 \* var\(--hud-inset\)\)\)/);
    assert.match(SWITCHER_STYLE, /@media \(pointer: coarse\) \{ \.character-switcher :is\(\.character-switcher-switch, \.character-switcher-more button\) \{ min-height: 44px; \} \}/);
    assert.doesNotMatch(SWITCHER_STYLE, /#[0-9a-f]{3,8}\b|rgba?\(/i, 'colours are tokens');
    assert.doesNotMatch(SWITCHER_STYLE, /font-size:\s*\d|z-index:\s*\d/, 'type sizes and layers are tokens');
  });

  it('the tutorial hides the pack row, not the cloud: it stays where the row sits, on its own card', () => {
    assert.match(read('public/js/features/newxp-feature.js'), /body\.nx-hide-pack #pack-bar\{visibility:hidden\}/, 'the rule the cloud answers');
    assert.match(SWITCHER_STYLE, /:root:not\(\[data-home-builder\]\) body\.nx-hide-pack:not\(:has\(#overlay:not\(\.hidden\)\)\) #pack-row > \.save-pill\.in-row \{ visibility: visible; \}/);
    assert.match(read('public/css/classic.css'), /:root\[data-ui="classic"\]:not\(\[data-home-builder\]\) body\.nx-hide-pack:not\(:has\(#overlay:not\(\.hidden\)\)\) #pack-row > \.save-pill\.in-row:not\(\[data-state="conflict"\]\):not\(\[data-state="signed-out"\]\) \{ background: var\(--c-classic-panel\);/, 'Classic\'s own card');
  });

  it('every multiplayer page hangs it on the cloud, beside Menu > Switch character (kept); no corner chip', () => {
    const src = read('public/js/features/account-backup-feature.js');
    const install = src.slice(src.indexOf('function installSignOut('), src.indexOf('export const accountBackupFeature'));
    assert.match(install, /installCharacterSwitcher\(\{/);
    assert.ok(install.indexOf('installCharacterSwitcher(') < install.indexOf("getElementById('more-list')"), 'it does not wait on the Menu');
    assert.match(install, /id: 'switch-character-btn'/);
    assert.doesNotMatch(src, /installCharacterChip|character-chip|lookPortrait/);
    assert.match(sw, /if \(!doc\?\.body \|\| !account \|\| !btn/, 'no cloud (solo), no switcher');
    assert.match(src, /if \(engine\.mode === 'multiplayer'\) \{\n\s*installSignOut\(engine\);/, 'multiplayer only');
  });
});
