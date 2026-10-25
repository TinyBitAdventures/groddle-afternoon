/**
 * Multiplayer phase 2, the account side: js/minn-account.js (who is signed
 * in, the REST nonce, the groddle/v1 calls), js/online-boot.js (the sign-in
 * gate and the boot data the multiplayer store reads), the solo backup
 * feature's rules, and the Groddle extension's routes and tables
 * (minn/groddle). The PHP save shape is run through php when the engine is
 * on this machine. tests/minn-accounts-live.test.js drives the real routes
 * on groddle.localhost (opt-in).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { homedir } from 'node:os';

import { createMinnAccount, minnUrls } from '../public/js/minn-account.js?v=mp2-2';
import { GATE_COPY, bootDataFrom, gateFor } from '../public/js/online-boot.js?v=mp2-2';
import { restoreNeedsAsking, sizeLabel, slotForNewBackup, accountBackupFeature } from '../public/js/features/account-backup-feature.js?v=mp2-3';
import { FEATURES } from '../public/js/features/index.js';
import { multiplayerEntryUrl } from '../public/js/game-mode.js?v=mp2-1';
import { SAVE_ENTRY_NAMES, createMultiplayerSaveStore } from '../public/js/save-store.js?v=mp2-1';

const root = join(import.meta.dirname, '..');
const ext = join(root, 'minn/groddle');
const read = (rel) => readFileSync(join(root, rel), 'utf8');

/** A fetch answering by URL: routes maps a URL suffix to { status, body, nonce } or 'network'. */
function routedFetch(routes) {
  const calls = [];
  const fn = async (url, init = {}) => {
    calls.push({ url, ...init });
    const key = Object.keys(routes).find((k) => url.endsWith(k));
    const answer = key ? routes[key] : { status: 404, body: '<!doctype html>Not found' };
    if (answer === 'network') throw new TypeError('Failed to fetch');
    const headers = new Map(answer.nonce ? [['x-wp-nonce', answer.nonce]] : []);
    return {
      status: answer.status,
      ok: answer.status >= 200 && answer.status < 300,
      headers: { get: (k) => headers.get(String(k).toLowerCase()) ?? null },
      json: async () => (typeof answer.body === 'string' ? JSON.parse(answer.body) : answer.body),
      text: async () => (typeof answer.body === 'string' ? answer.body : JSON.stringify(answer.body)),
    };
  };
  return { fn, calls };
}

const BASE = 'https://groddle.localhost/';
const NONCE_PATH = 'wp-admin/admin-ajax.php?action=rest-nonce';

describe('minn-account', () => {
  it('builds the site URLs from the page base (play pages set <base> to the site root)', () => {
    const urls = minnUrls(BASE);
    assert.equal(urls.nonce, `${BASE}${NONCE_PATH}`);
    assert.equal(urls.api, `${BASE}wp-json/groddle/v1/`);
    assert.equal(urls.login(`${BASE}play/online/`), `${BASE}wp-login.php?redirect_to=https%3A%2F%2Fgroddle.localhost%2Fplay%2Fonline%2F`);
    assert.equal(urls.register(`${BASE}play/`), `${BASE}wp-login.php?action=register&redirect_to=https%3A%2F%2Fgroddle.localhost%2Fplay%2F`);
    assert.equal(minnUrls('http://127.0.0.1:8790/sub/').api, 'http://127.0.0.1:8790/sub/wp-json/groddle/v1/');
  });

  it('a static server (no admin-ajax) is no Minn', async () => {
    const f = routedFetch({});
    const session = await createMinnAccount({ baseUri: BASE, fetch: f.fn }).session();
    assert.deepEqual(session, { minn: false, signedIn: false, player: null });
    assert.equal(f.calls.length, 1, 'never asks groddle/v1 when the nonce route is missing');
  });

  it('a site that cannot be reached says offline', async () => {
    const session = await createMinnAccount({ baseUri: BASE, fetch: routedFetch({ [NONCE_PATH]: 'network' }).fn }).session();
    assert.equal(session.offline, true);
    assert.equal(session.minn, false);
  });

  it('signed out: admin-ajax answers "0" with 400 and me says signedIn false, asked without a nonce', async () => {
    const f = routedFetch({ [NONCE_PATH]: { status: 400, body: '0' }, 'groddle/v1/me': { status: 200, body: { signedIn: false, player: null } } });
    const account = createMinnAccount({ baseUri: BASE, fetch: f.fn });
    const session = await account.session();
    assert.deepEqual(session, { minn: true, signedIn: false, player: null, backups: null });
    assert.equal(f.calls[1].headers['X-WP-Nonce'], undefined);
    assert.equal(f.calls[1].credentials, 'same-origin');
  });

  it('signed in: the nonce rides every call and a fresh one from an answer replaces it', async () => {
    const f = routedFetch({
      [NONCE_PATH]: { status: 200, body: 'abcdef0123' },
      'groddle/v1/me': { status: 200, body: { signedIn: true, player: { id: 3, name: 'Tess' }, backups: { slots: 3, maxBytes: 4194304 } }, nonce: '0123abcdef' },
      'groddle/v1/save': { status: 200, body: { version: 2, updatedAt: '2026-10-25T18:00:00Z', data: null } },
    });
    const account = createMinnAccount({ baseUri: BASE, fetch: f.fn });
    const session = await account.session();
    assert.equal(session.signedIn, true);
    assert.equal(session.player.name, 'Tess');
    assert.equal(f.calls[1].headers['X-WP-Nonce'], 'abcdef0123');
    assert.equal(account.nonce, '0123abcdef');
    assert.equal((await account.multiplayerSave()).version, 2);
    assert.equal(f.calls[2].headers['X-WP-Nonce'], '0123abcdef');
  });

  it('backup calls: list, read, write (PUT with the save and the game day), delete; errors carry the code', async () => {
    const f = routedFetch({
      'backups': { status: 200, body: { slots: 3, maxBytes: 1, backups: [] } },
      'backups/2': { status: 200, body: { slot: 2 } },
      'backups/9': { status: 400, body: { code: 'groddle_backup_slot', data: { status: 400 } } },
    });
    const account = createMinnAccount({ baseUri: BASE, fetch: f.fn });
    assert.equal((await account.listBackups()).slots, 3);
    await account.writeBackup(2, { kind: 'groddle-solo' }, 'Fabday');
    const put = f.calls.at(-1);
    assert.equal(put.method, 'PUT');
    assert.deepEqual(JSON.parse(put.body), { data: { kind: 'groddle-solo' }, gameDay: 'Fabday' });
    assert.equal(put.headers['Content-Type'], 'application/json');
    await account.deleteBackup(2);
    assert.equal(f.calls.at(-1).method, 'DELETE');
    await assert.rejects(account.readBackup(9), (err) => err.code === 'groddle_backup_slot' && err.status === 400);
  });
});

describe('online-boot', () => {
  it('picks the gate from the session', () => {
    assert.equal(gateFor({ minn: false, offline: true }), 'offline');
    assert.equal(gateFor({ minn: false }), 'no-server');
    assert.equal(gateFor({ minn: true, signedIn: false }), 'signed-out');
    assert.equal(gateFor({ minn: true, signedIn: false }, { registered: true }), 'registered');
    assert.equal(gateFor({ minn: true, signedIn: true }), 'ready');
  });

  it('boot data is what the multiplayer store reads; a fresh character starts empty', () => {
    const account = { urls: minnUrls(BASE), nonce: 'abcdef0123' };
    const session = { player: { id: 3, name: 'Tess' } };
    const fresh = bootDataFrom({ account, session, save: { version: 0, updatedAt: null, data: null } });
    assert.deepEqual(fresh, { saveUrl: `${BASE}wp-json/groddle/v1/save`, nonceUrl: `${BASE}${NONCE_PATH}`, nonce: 'abcdef0123', version: 0, updatedAt: null, entries: {}, player: session.player });
    const store = createMultiplayerSaveStore({ boot: fresh, scope: {}, fetch: async () => { throw new Error('no write expected'); } });
    assert.equal(store.ready, true);
    for (const name of SAVE_ENTRY_NAMES) assert.equal(store.get(name), null, `${name} is empty: the start card shows the tutorial choice`);
    const loaded = bootDataFrom({ account, session, save: { version: 7, updatedAt: 'x', data: { kind: 'groddle-multiplayer', format: 1, entries: { playerState: 'P' } } } });
    assert.equal(loaded.version, 7);
    assert.deepEqual(loaded.entries, { playerState: 'P' });
  });

  it('refuses a save that is not a multiplayer save', () => {
    const account = { urls: minnUrls(BASE), nonce: '' };
    assert.throws(() => bootDataFrom({ account, session: {}, save: { version: 1, data: { kind: 'groddle-solo', format: 1, entries: {} } } }), /not a multiplayer save/);
  });

  it('never imports the save store (it must load the save before the store does)', () => {
    const src = read('public/js/online-boot.js');
    assert.doesNotMatch(src, /from '[^']*save-store\.js/);
    assert.doesNotMatch(read('public/js/minn-account.js'), /from '[^']*save-store\.js/);
    assert.match(src, /window\.GRODDLE_MP_BOOT = bootDataFrom/);
    assert.ok(src.indexOf('window.GRODDLE_MP_BOOT =') < src.indexOf("game.type = 'module'"), 'the save is in place before game.js is added');
  });

  it('gate copy is plain, with no em-dashes', () => {
    for (const [state, { title, body }] of Object.entries(GATE_COPY)) {
      for (const line of [title, ...body]) assert.doesNotMatch(line, /—/, state);
    }
  });
});

describe('account backup feature', () => {
  it('is registered last in features/index.js and stays out of multiplayer and practice', async () => {
    assert.equal(FEATURES.at(-1), accountBackupFeature);
    assert.equal(accountBackupFeature.id, 'account-backup');
    let asked = false;
    globalThis.document = undefined;
    accountBackupFeature.init({ mode: 'multiplayer', setData() { asked = true; } });
    assert.equal(asked, false);
    const src = read('public/js/features/account-backup-feature.js');
    assert.match(src, /if \(engine\.mode !== 'solo' \|\| typeof document === 'undefined' \|\| globalThis\.groddlePractice === true\) return;/);
    delete globalThis.document;
  });

  it('a new backup takes the first empty slot, else replaces the oldest', () => {
    assert.deepEqual(slotForNewBackup([], 3), { slot: 1, replaces: null });
    assert.deepEqual(slotForNewBackup([{ slot: 1, madeAt: 'b' }, { slot: 3, madeAt: 'a' }], 3), { slot: 2, replaces: null });
    const full = [{ slot: 1, madeAt: '2026-10-25T10:00:00Z' }, { slot: 2, madeAt: '2026-10-24T10:00:00Z' }, { slot: 3, madeAt: '2026-10-25T09:00:00Z' }];
    assert.equal(slotForNewBackup(full, 3).slot, 2);
    assert.equal(slotForNewBackup(full, 3).replaces, full[1]);
  });

  it('asks before a restore only when the local game was saved after the backup', () => {
    const at = (savedAt) => ({ playerState: JSON.stringify({ savedAt }) });
    assert.equal(restoreNeedsAsking(at(2000), at(1000)).ask, true);
    assert.equal(restoreNeedsAsking(at(1000), at(2000)).ask, false);
    assert.equal(restoreNeedsAsking(null, at(2000)).ask, false, 'no local game: nothing to lose');
    assert.equal(restoreNeedsAsking(at(1000), at(1000)).ask, false);
  });

  it('sizes read as KB or MB', () => {
    assert.equal(sizeLabel(300), '1 KB');
    assert.equal(sizeLabel(150_000), '146 KB');
    assert.equal(sizeLabel(2.5 * 1024 * 1024), '2.5 MB');
  });

  it('restores through the solo store only, and freezes the running game first', () => {
    const src = read('public/js/features/account-backup-feature.js');
    assert.match(src, /freezeSoloSaves\(\);\n\s*restoreSoloSave\(backup\.data\);/);
    assert.doesNotMatch(src, /createMultiplayerSaveStore|GRODDLE_MP_BOOT|groddle\/v1\/save/);
  });

  it('a solo game on the Groddle site has a Menu way into multiplayer (the start card only asks on a new game)', () => {
    const src = read('public/js/features/account-backup-feature.js');
    assert.match(src, /if \(!session\.minn\) return;[\s\S]*id: 'multiplayer-btn'[\s\S]*location\.href = multiplayerEntryUrl\(document\.baseURI\)/);
    // /play/ sets <base href="../">: the base URI is the site root.
    assert.equal(multiplayerEntryUrl('https://groddle.localhost/'), 'https://groddle.localhost/play/online/');
  });

  it('folder paths without their slash go on to the slashed page (/play/online), query kept', () => {
    const pages = readFileSync(join(ext, 'src', 'StaticPages.php'), 'utf8');
    assert.match(pages, /#\[Route\(Method::Get, '\/\{folder:\[a-z0-9\]\[a-z0-9_-\]\*\(\?:\/\[a-z0-9\]\[a-z0-9_-\]\*\)\*\}', policy: new Policy\(Access::Public\)\)\]\n\s*public function bare/);
    assert.match(pages, /\$this->root->indexFor\(\$folder\) === null\) \{\n\s*throw new RouteMiss\(\);/, 'only built folders redirect');
    assert.match(pages, /Response::redirect\("\/\{\$folder\}\/\{\$query\}", 301\)/);
  });
});

describe('Groddle extension: accounts (minn/groddle)', () => {
  const manifest = JSON.parse(readFileSync(join(ext, 'minn.json'), 'utf8'));
  const src = (f) => readFileSync(join(ext, 'src', f), 'utf8');

  it('declares its two tables under its own names, with the keys the routes rely on', () => {
    assert.deepEqual(Object.keys(manifest.tables).sort(), ['groddle_mp_saves', 'groddle_solo_backups']);
    assert.ok(manifest.tables.groddle_mp_saves.includes('PRIMARY KEY  (user_id)'), 'one multiplayer save per user');
    assert.ok(manifest.tables.groddle_solo_backups.includes('PRIMARY KEY  (user_id,slot)'), 'one backup per slot');
    for (const col of ['user_id', 'data', 'version', 'updated_at']) assert.ok(manifest.tables.groddle_mp_saves.some((l) => l.startsWith(`${col} `)), col);
    for (const col of ['user_id', 'slot', 'data', 'made_at', 'game_day', 'size']) assert.ok(manifest.tables.groddle_solo_backups.some((l) => l.startsWith(`${col} `)), col);
  });

  it('knows the same save entries as the game', () => {
    const entries = src('SaveShape.php').match(/public const ENTRIES = \[([^\]]+)\]/)[1].match(/'([a-zA-Z]+)'/g).map((s) => s.slice(1, -1));
    assert.deepEqual(entries, [...SAVE_ENTRY_NAMES]);
  });

  it('registers groddle/v1 REST routes: me open to anyone, every save, backup and realtime route signed-in', () => {
    assert.match(src('Extension.php'), /\$minn->rest\(new Player\(\$minn\), new MultiplayerSave\(\$minn\), new SoloBackups\(\$minn\), new RealtimeTicket\(\$minn\)\);/);
    const routes = [];
    for (const f of ['Player.php', 'MultiplayerSave.php', 'SoloBackups.php', 'RealtimeTicket.php']) {
      for (const m of src(f).matchAll(/#\[Route\(Method::(\w+), '([^']+)', policy: new Policy\(Access::(\w+)\)\)\]/g)) routes.push(`${m[1]} ${m[2]} ${m[3]}`);
    }
    assert.deepEqual(routes.sort(), [
      'Delete /groddle/v1/backups/{slot:\\d+} SignedIn',
      'Get /groddle/v1/backups SignedIn',
      'Get /groddle/v1/backups/{slot:\\d+} SignedIn',
      'Get /groddle/v1/me Public',
      'Get /groddle/v1/save SignedIn',
      'Post /groddle/v1/realtime SignedIn',
      'Put /groddle/v1/backups/{slot:\\d+} SignedIn',
      'Put /groddle/v1/save SignedIn',
    ]);
  });

  it('signs realtime tickets the way realtime/ticket.go checks them, for a minute, with the secret outside the webroot', () => {
    const ticket = src('RealtimeTicket.php');
    assert.match(ticket, /public const TTL = 60;/);
    assert.match(ticket, /hash_hmac\('sha256', \$body, \$secret, true\)/);
    assert.match(ticket, /strtr\(base64_encode\(\$bytes\), '\+\/', '-_'\), '='/, 'base64url without padding');
    assert.match(ticket, /'jti' => bin2hex\(random_bytes\(8\)\)/, 'a ticket works once');
    assert.match(ticket, /dirname\(rtrim\(ABSPATH, '\/'\)\) \. '\/realtime\.secret'/, 'beside the webroot, never in it');
    const go = readFileSync(join(ext, '..', '..', 'realtime', 'ticket.go'), 'utf8');
    for (const field of ['sub', 'name', 'iat', 'exp', 'jti']) assert.match(go, new RegExp(`json:"${field}"`), field);
    assert.match(go, /hmac\.New\(sha256\.New, t\.secret\)/);
    assert.match(go, /base64\.RawURLEncoding/);
  });

  it('reads and writes only the signed-in caller\'s rows, with the version check in the write itself', () => {
    const save = src('MultiplayerSave.php');
    assert.match(save, /UPDATE \{\$table\} SET data = \?, version = version \+ 1, updated_at = \? WHERE user_id = \? AND version = \?/);
    assert.match(save, /INSERT IGNORE INTO \{\$table\}/);
    assert.match(save, /'groddle_save_conflict'[^;]*409/);
    for (const f of ['MultiplayerSave.php', 'SoloBackups.php']) {
      for (const q of src(f).matchAll(/"((?:SELECT|UPDATE|DELETE|REPLACE|INSERT)[^"]*)"/g)) assert.match(q[1], /user_id/, `${f}: ${q[1]}`);
      assert.doesNotMatch(src(f), /\$request->(?:query|json\(\))\[?'?user/, 'the user is never read from the request');
    }
    assert.doesNotMatch(src('SoloBackups.php'), /groddle_mp_saves|MultiplayerSave::TABLE/, 'backups never touch the multiplayer save');
    assert.doesNotMatch(src('MultiplayerSave.php'), /groddle_solo_backups|SoloBackups::TABLE/);
  });

  it('runs no WordPress function (the engine\'s classes only)', () => {
    for (const f of ['Player.php', 'MultiplayerSave.php', 'SoloBackups.php', 'SaveShape.php']) {
      assert.doesNotMatch(src(f), /\b(?:get_option|wp_[a-z_]+|current_user_can|get_current_user_id|esc_[a-z]+|\$wpdb)\s*\(/, f);
    }
  });

  const engine = process.env.MINN_ENGINE_DIR || join(homedir(), 'Cove/Sites/minn-engine.localhost/public/minn');
  it('SaveShape checks the shape and the size, nothing more (php, when the engine is here)', { skip: !existsSync(join(engine, 'src/Minn/Autoloader.php')) && 'Minn Engine not found (set MINN_ENGINE_DIR)' }, () => {
    const out = execFileSync('php', [join(root, 'tests/fixtures/minn-accounts/save-shape.php'), engine, ext], { encoding: 'utf8' });
    const rows = JSON.parse(out);
    assert.deepEqual(rows, {
      solo: 'ok',
      multiplayer: 'ok',
      emptyMultiplayer: 'ok:{"kind":"groddle-multiplayer","format":1,"entries":{}}',
      soloAsMultiplayer: 'groddle_save_kind:400',
      multiplayerAsSolo: 'groddle_save_kind:400',
      unknownEntry: 'groddle_save_invalid:400',
      nonString: 'groddle_save_invalid:400',
      listEntries: 'groddle_save_invalid:400',
      soloWithoutPlayer: 'groddle_save_invalid:400',
      format2: 'groddle_save_format:400',
      tooLarge: 'groddle_save_too_large:413',
      time: '2026-10-25T18:00:00Z',
    });
  });
});
