/**
 * The groddle/v1 routes on the real Minn site (multiplayer phase 2). Opt-in,
 * because it makes two throwaway accounts on groddle.localhost and removes
 * them (and their rows) at the end:
 *
 *   GRODDLE_LIVE=1 node --test tests/minn-accounts-live.test.js
 *
 * GRODDLE_URL and GRODDLE_ROOT (the Minn webroot, for WP-CLI) default to the
 * local Cove site. Requests go through curl, which keeps the sign-in cookies.
 * The realtime test also opens /ws (Cove's route to realtime/, the Go server:
 * realtime/run.sh) and skips that part when nothing answers there.
 */
import assert from 'node:assert/strict';
import { describe, it, before, after } from 'node:test';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir, tmpdir } from 'node:os';

const LIVE = process.env.GRODDLE_LIVE === '1';
const SITE = (process.env.GRODDLE_URL || 'https://groddle.localhost').replace(/\/$/, '');
const ROOT = process.env.GRODDLE_ROOT || join(homedir(), 'Cove/Sites/groddle.localhost/public');

const wp = (...args) => execFileSync('wp', args, { cwd: ROOT, encoding: 'utf8' }).trim();
let dir = '';

/** One request through curl with a cookie jar of the player's own: [status, body, headers]. */
function call(jar, method, path, { nonce, body, form } = {}) {
  const args = ['-sk', '-b', jar, '-c', jar, '-X', method, '-D', '-', '-o', join(dir, 'body'), '-w', '%{http_code}'];
  if (nonce) args.push('-H', `X-WP-Nonce: ${nonce}`);
  if (body !== undefined) {
    const file = join(dir, 'request.json');
    writeFileSync(file, typeof body === 'string' ? body : JSON.stringify(body));
    args.push('-H', 'Content-Type: application/json', '--data-binary', `@${file}`);
  }
  if (form) args.push('--data', form);
  args.push(`${SITE}${path}`);
  const out = execFileSync('curl', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const status = Number(out.slice(-3));
  const headers = out.slice(0, -3);
  const text = execFileSync('cat', [join(dir, 'body')], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  let json = null;
  try { json = JSON.parse(text); } catch { /* not JSON */ }
  return { status, json, text, headers };
}

function player(name) {
  const jar = join(dir, `${name}.jar`);
  const pass = `zz-${name}-${process.pid}-pass`;
  const login = `zz-${name}-${process.pid}`;
  const id = Number(wp('user', 'create', login, `${login}@example.com`, '--role=subscriber', `--user_pass=${pass}`, '--porcelain'));
  writeFileSync(jar, '');
  return {
    id,
    login,
    jar,
    signIn() {
      const r = call(jar, 'POST', '/wp-login.php', { form: `log=${encodeURIComponent(login)}&pwd=${encodeURIComponent(pass)}&rememberme=forever&testcookie=1` });
      assert.equal(r.status, 302, `${login} signs in`);
      this.nonce = call(jar, 'GET', '/wp-admin/admin-ajax.php?action=rest-nonce').text.trim();
      assert.match(this.nonce, /^[0-9a-f]{10}$/);
    },
  };
}

const solo = (entries = { playerState: JSON.stringify({ savedAt: 5 }) }) => ({ kind: 'groddle-solo', format: 1, entries });
const multi = (entries = { playerState: JSON.stringify({ savedAt: 5 }), location: '{"tsid":"LIF12PMQ5121D68"}' }) => ({ kind: 'groddle-multiplayer', format: 1, entries });

describe('groddle/v1 on the live site', { skip: !LIVE && 'set GRODDLE_LIVE=1 to drive groddle.localhost' }, () => {
  let a;
  let b;
  before(() => {
    dir = mkdtempSync(join(tmpdir(), 'groddle-live-'));
    writeFileSync(join(dir, 'anon.jar'), '');
    a = player('mpa');
    b = player('mpb');
  });
  after(() => {
    for (const p of [a, b].filter(Boolean)) {
      wp('db', 'query', `DELETE FROM wp_groddle_mp_saves WHERE user_id = ${p.id}; DELETE FROM wp_groddle_solo_backups WHERE user_id = ${p.id}`);
      wp('user', 'delete', String(p.id), '--yes');
    }
    rmSync(dir, { recursive: true, force: true });
  });

  it('signed out: me says so, and every save route is a 401', () => {
    const anon = join(dir, 'anon.jar');
    assert.deepEqual(call(anon, 'GET', '/wp-json/groddle/v1/me').json, { signedIn: false, player: null });
    for (const path of ['/wp-json/groddle/v1/save', '/wp-json/groddle/v1/backups', '/wp-json/groddle/v1/backups/1']) {
      const r = call(anon, 'GET', path);
      assert.equal(r.status, 401, path);
      assert.equal(r.json.code, 'rest_not_logged_in');
    }
    assert.equal(call(anon, 'PUT', '/wp-json/groddle/v1/save', { body: { version: 0, data: multi() } }).status, 401);
  });

  it('a sign-in cookie without its nonce is nobody; with it, me names the player', () => {
    a.signIn();
    b.signIn();
    assert.equal(call(a.jar, 'GET', '/wp-json/groddle/v1/save').status, 401);
    assert.equal(call(a.jar, 'GET', '/wp-json/groddle/v1/me').json.signedIn, false);
    const me = call(a.jar, 'GET', '/wp-json/groddle/v1/me', { nonce: a.nonce });
    assert.equal(me.json.signedIn, true);
    assert.equal(me.json.player.id, a.id);
    assert.deepEqual(me.json.backups, { slots: 3, maxBytes: 4194304 });
    assert.match(me.headers, /x-wp-nonce: [0-9a-f]{10}/i, 'a fresh nonce comes back');
    const bad = call(a.jar, 'GET', '/wp-json/groddle/v1/save', { nonce: '0000000000' });
    assert.equal(bad.status, 403);
    assert.equal(bad.json.code, 'rest_cookie_invalid_nonce');
  });

  it('the multiplayer save: empty at first, written over the version it was made from, 409 for a stale copy', () => {
    assert.deepEqual(call(a.jar, 'GET', '/wp-json/groddle/v1/save', { nonce: a.nonce }).json, { version: 0, updatedAt: null, data: null });
    const first = call(a.jar, 'PUT', '/wp-json/groddle/v1/save', { nonce: a.nonce, body: { version: 0, data: multi() } });
    assert.equal(first.status, 200);
    assert.equal(first.json.version, 1);
    const stale = call(a.jar, 'PUT', '/wp-json/groddle/v1/save', { nonce: a.nonce, body: { version: 0, data: multi({ location: 'stale' }) } });
    assert.equal(stale.status, 409);
    assert.equal(stale.json.code, 'groddle_save_conflict');
    assert.equal(stale.json.data.version, 1);
    assert.equal(call(a.jar, 'PUT', '/wp-json/groddle/v1/save', { nonce: a.nonce, body: { version: 1, data: multi({ location: 'two' }) } }).json.version, 2);
    const read = call(a.jar, 'GET', '/wp-json/groddle/v1/save', { nonce: a.nonce }).json;
    assert.equal(read.version, 2);
    assert.match(read.updatedAt, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/);
    assert.deepEqual(read.data, multi({ location: 'two' }));
    assert.deepEqual(call(b.jar, 'GET', '/wp-json/groddle/v1/save', { nonce: b.nonce }).json, { version: 0, updatedAt: null, data: null }, 'another player sees only their own');
    const empty = call(b.jar, 'PUT', '/wp-json/groddle/v1/save', { nonce: b.nonce, body: { version: 0, data: multi({}) } });
    assert.equal(empty.status, 200);
    assert.deepEqual(call(b.jar, 'GET', '/wp-json/groddle/v1/save', { nonce: b.nonce }).json.data.entries, {}, 'an empty save reads back as an object');
  });

  it('the multiplayer save takes only a multiplayer save, of a size the server keeps', () => {
    const asSolo = call(a.jar, 'PUT', '/wp-json/groddle/v1/save', { nonce: a.nonce, body: { version: 2, data: solo() } });
    assert.equal(asSolo.status, 400);
    assert.equal(asSolo.json.code, 'groddle_save_kind');
    assert.equal(call(a.jar, 'PUT', '/wp-json/groddle/v1/save', { nonce: a.nonce, body: { version: '2', data: multi() } }).json.code, 'groddle_save_version');
    assert.equal(call(a.jar, 'PUT', '/wp-json/groddle/v1/save', { nonce: a.nonce, body: { version: 2, data: multi({ hacked: 'x' }) } }).json.code, 'groddle_save_invalid');
    const big = call(a.jar, 'PUT', '/wp-json/groddle/v1/save', { nonce: a.nonce, body: { version: 2, data: multi({ playerState: 'x'.repeat(4 * 1024 * 1024) }) } });
    assert.equal(big.status, 413);
    assert.equal(big.json.code, 'groddle_save_too_large');
    assert.equal(call(a.jar, 'GET', '/wp-json/groddle/v1/save', { nonce: a.nonce }).json.version, 2, 'a refused write changed nothing');
  });

  it('solo backups: three slots, a solo save only, read back, listed, deleted', () => {
    assert.deepEqual(call(a.jar, 'GET', '/wp-json/groddle/v1/backups', { nonce: a.nonce }).json, { slots: 3, maxBytes: 4194304, backups: [] });
    const made = call(a.jar, 'PUT', '/wp-json/groddle/v1/backups/2', { nonce: a.nonce, body: { data: solo(), gameDay: 'Weddingday, the 47th of Widdershins' } });
    assert.equal(made.status, 200);
    assert.equal(made.json.slot, 2);
    assert.equal(made.json.gameDay, 'Weddingday, the 47th of Widdershins');
    assert.ok(made.json.size > 0);
    assert.equal(call(a.jar, 'PUT', '/wp-json/groddle/v1/backups/4', { nonce: a.nonce, body: { data: solo() } }).json.code, 'groddle_backup_slot');
    assert.equal(call(a.jar, 'PUT', '/wp-json/groddle/v1/backups/0', { nonce: a.nonce, body: { data: solo() } }).json.code, 'groddle_backup_slot');
    assert.equal(call(a.jar, 'PUT', '/wp-json/groddle/v1/backups/1', { nonce: a.nonce, body: { data: multi() } }).json.code, 'groddle_save_kind', 'a multiplayer save is never a backup');
    assert.equal(call(a.jar, 'PUT', '/wp-json/groddle/v1/backups/1', { nonce: a.nonce, body: { data: solo({ location: 'x' }) } }).json.code, 'groddle_save_invalid', 'a backup needs the player state');
    assert.equal(call(a.jar, 'PUT', '/wp-json/groddle/v1/backups/1', { nonce: a.nonce, body: { data: solo(), gameDay: '<script>' } }).json.code, 'groddle_backup_day');
    const one = call(a.jar, 'GET', '/wp-json/groddle/v1/backups/2', { nonce: a.nonce }).json;
    assert.deepEqual(one.data, solo());
    assert.equal(call(b.jar, 'GET', '/wp-json/groddle/v1/backups/2', { nonce: b.nonce }).status, 404, 'another player cannot read it');
    assert.equal(call(a.jar, 'GET', '/wp-json/groddle/v1/backups', { nonce: a.nonce }).json.backups.length, 1);
    assert.equal(call(a.jar, 'GET', '/wp-json/groddle/v1/save', { nonce: a.nonce }).json.version, 2, 'backing up leaves the multiplayer save alone');
    assert.deepEqual(call(a.jar, 'DELETE', '/wp-json/groddle/v1/backups/2', { nonce: a.nonce }).json, { deleted: true, slot: 2 });
    assert.equal(call(a.jar, 'GET', '/wp-json/groddle/v1/backups/2', { nonce: a.nonce }).json.code, 'groddle_backup_missing');
    assert.equal(call(a.jar, 'DELETE', '/wp-json/groddle/v1/backups/2', { nonce: a.nonce }).status, 404);
  });

  it('a realtime ticket: signed-in only, signed for a minute, good for one socket', async () => {
    assert.equal(call(join(dir, 'anon.jar'), 'POST', '/wp-json/groddle/v1/realtime').status, 401);
    const r = call(a.jar, 'POST', '/wp-json/groddle/v1/realtime', { nonce: a.nonce });
    assert.equal(r.status, 200, r.text);
    assert.equal(r.json.expiresIn, 60);
    assert.equal(r.json.path, '/ws');
    const [body, sig] = r.json.ticket.split('.');
    assert.match(sig, /^[\w-]{43}$/, 'an HMAC-SHA256, base64url');
    const claims = JSON.parse(Buffer.from(body, 'base64url').toString());
    assert.equal(claims.sub, a.id);
    assert.equal(claims.name, a.login);
    assert.equal(claims.exp - claims.iat, 60);
    assert.match(claims.jti, /^[0-9a-f]{16}$/);

    const health = call(join(dir, 'anon.jar'), 'GET', '/ws');
    if (health.status === 502 || health.status === 404) return; // the realtime server is not running
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
    const open = (ticket) => new Promise((resolve, reject) => {
      const ws = new WebSocket(`${SITE.replace(/^http/, 'ws')}/ws`);
      const seen = [];
      ws.onopen = () => ws.send(JSON.stringify({ t: 'auth', ticket }));
      ws.onmessage = (e) => { seen.push(JSON.parse(e.data)); if (seen[0].t === 'hello') resolve({ ws, seen }); };
      ws.onclose = (e) => reject(Object.assign(new Error(`closed ${e.code} ${e.reason}`), { code: e.code }));
      ws.onerror = () => {};
    });
    const until = (peer, t) => new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`no ${t}`)), 3000);
      const look = () => { const m = peer.seen.find((x) => x.t === t); if (m) { clearTimeout(timer); resolve(m); } else setTimeout(look, 20); };
      look();
    });
    const pa = await open(r.json.ticket);
    assert.equal(pa.seen[0].you.id, a.id);
    await assert.rejects(open(r.json.ticket), (e) => e.code === 4003, 'the same ticket twice is refused');
    const pb = await open(call(b.jar, 'POST', '/wp-json/groddle/v1/realtime', { nonce: b.nonce }).json.ticket);
    const street = `LIVETEST${process.pid}`;
    pa.ws.send(JSON.stringify({ t: 'join', street, x: 10, y: 20 }));
    await until(pa, 'street');
    pb.ws.send(JSON.stringify({ t: 'join', street, x: 30, y: 20 }));
    assert.equal((await until(pb, 'street')).players[0].id, a.id);
    assert.equal((await until(pa, 'joined')).player.id, b.id);
    pb.ws.send(JSON.stringify({ t: 'chat', text: 'hello from the live test' }));
    assert.equal((await until(pa, 'said')).text, 'hello from the live test');
    pa.ws.close();
    pb.ws.close();
  });

  it('the REST index lists the groddle/v1 namespace', () => {
    assert.ok(call(join(dir, 'anon.jar'), 'GET', '/wp-json/').json.namespaces.includes('groddle/v1'));
  });
});
