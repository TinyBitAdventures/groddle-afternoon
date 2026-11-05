/**
 * Play time for the administrators (Austin 2026-11-04: "A running total time
 * stored in the user's meta data for how long they've played. No need to make
 * that visible anywhere."). The realtime server measures each player's active
 * time in the game (groddle-afternoon-server playtime.go, its own Go tests)
 * and sends it in signed batches to the site (groddle-afternoon-site
 * src/PlayTime.php), which adds it to user meta groddle_play_seconds and
 * groddle_play_last, once per batch id; an administrator reads it at
 * GET groddle/v1/admin/play-time, and POST groddle/v1/admin/play-time/backfill
 * sets the estimate from before (groddle_play_seconds_before, save version x
 * 15 s) once. The PHP runs through the php CLI. The routes on the real site
 * are opt-in, as they make and remove throwaway accounts on groddle.localhost:
 *
 *   GRODDLE_LIVE=1 node --test tests/play-time.test.js
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { createHash, createHmac, randomBytes } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { SITE_DIR, serverPath, sitePath, skipWithoutServer, skipWithoutSite } from '../tools/repos.mjs';

const hasPhp = spawnSync('php', ['-v']).status === 0;
const skip = skipWithoutSite || (!hasPhp && 'needs the php CLI');
const root = join(import.meta.dirname, '..');
const ROUTE = '/groddle/v1/play-time';

function php(op, args) {
  const code = `
    foreach (['ServiceCall', 'PlayTime'] as $c) require ${JSON.stringify(SITE_DIR)} . "/src/$c.php";
    use Groddle\\Minn\\{ServiceCall, PlayTime};
    $in = json_decode(stream_get_contents(STDIN), true);
    $a = $in['args'];
    $out = match ($in['op']) {
      'batch' => PlayTime::batch($a[0], $a[1]),
      'verify' => ServiceCall::verify($a[0], 'POST', $a[1], $a[2], $a[3], $a[4]),
      'before' => PlayTime::beforeSeconds($a[0]),
      'report' => PlayTime::report($a[0], array_combine(array_map('intval', array_keys($a[1])), array_values($a[1])), $a[2]),
      'consts' => ['batch' => PlayTime::BATCH, 'most' => PlayTime::MOST, 'skew' => PlayTime::SKEW, 'per' => PlayTime::PER_WRITE, 'meta' => [PlayTime::META, PlayTime::LAST, PlayTime::BEFORE]],
    };
    echo json_encode($out);`;
  return JSON.parse(String(execFileSync('php', ['-r', code], { input: JSON.stringify({ op, args }) })));
}

/** The realtime server's X-Groddle-Service header (ledger.go signService). */
function sign(secret, route, body, at = Math.floor(Date.now() / 1000), nonce = randomBytes(8).toString('hex')) {
  const msg = ['groddle-service/1', 'POST', route, String(at), nonce, createHash('sha256').update(body).digest('hex')].join('\n');
  return `${at}.${nonce}.${createHmac('sha256', secret).update(msg).digest('base64url')}`;
}

describe('the site reads a batch the way playtime.go writes it (PlayTime::batch)', { skip }, () => {
  const now = 1_800_000_000;
  it('takes each player once, sums two entries for one, and never takes "last" past the clock', () => {
    const b = php('batch', [{ id: 'pt-0a1b2c3d-1', players: [{ user: 9, seconds: 30, last: now - 10 }, { user: 7, seconds: 60, last: now }, { user: 9, seconds: 5, last: now + 999 }] }, now]);
    assert.deepEqual(b, { id: 'pt-0a1b2c3d-1', players: [{ user: 7, seconds: 60, last: now }, { user: 9, seconds: 35, last: now + php('consts', []).skew }] });
  });

  it('skips entries that are not play time but still answers the batch; refuses what is no batch', () => {
    const b = php('batch', [{ id: 'pt-x-2', players: [{ user: 0, seconds: 5, last: now }, { user: 7, seconds: -1, last: now }, { user: 7, seconds: '60', last: now }, { user: 7, seconds: 31 * 86400 + 1, last: now }, { user: 8, seconds: 1, last: now }] }, now]);
    assert.deepEqual(b.players, [{ user: 8, seconds: 1, last: now }]);
    assert.equal(php('batch', [{ id: 'cr-o-x-1', players: [] }, now]), null, 'a credit id is not a batch id');
    assert.equal(php('batch', [{ id: 'pt-x-3', players: { 7: {} } }, now]), null, 'players is a list');
    assert.equal(php('batch', [{ id: 'pt-x-4', players: Array.from({ length: php('consts', []).batch + 1 }, (_, i) => ({ user: i + 1, seconds: 1, last: now })) }, now]), null, 'too many players');
  });

  it('only the realtime server can sign a batch (ServiceCall over this route and this body)', () => {
    const secret = 'x'.repeat(40);
    const body = JSON.stringify({ id: 'pt-a-1', players: [{ user: 7, seconds: 60, last: now }] });
    const at = Math.floor(Date.now() / 1000);
    const header = sign(secret, ROUTE, body, at);
    const clock = at + 5;
    assert.equal(php('verify', [header, ROUTE, body, secret, clock]), true);
    assert.equal(php('verify', [header, ROUTE, body.replace('60', '6000'), secret, clock]), false, 'another body');
    assert.equal(php('verify', [header, '/groddle/v1/ledger/credits', body, secret, clock]), false, 'another route');
    assert.equal(php('verify', [sign('y'.repeat(40), ROUTE, body, at), ROUTE, body, secret, clock]), false, 'another secret');
    assert.equal(php('verify', [header, ROUTE, body, secret, at + 120]), false, 'too old');
    assert.equal(php('verify', [null, ROUTE, body, secret, clock]), false, 'unsigned');
  });
});

describe('the administrators\' list and the estimate from before (PlayTime::report, beforeSeconds)', { skip }, () => {
  it('estimates play before measuring as 15 s a save version', () => {
    assert.equal(php('consts', []).per, 15);
    assert.equal(php('before', [40]), 600);
    assert.equal(php('before', [0]), 0);
    assert.equal(php('before', [-3]), 0);
  });

  it('lists each account that still exists with its total, estimate, sum and last seen, sorted', () => {
    const [META, LAST, BEFORE] = php('consts', []).meta;
    const rows = [
      { user_id: 7, meta_key: META, meta_value: '7200' }, { user_id: 7, meta_key: LAST, meta_value: '1800000000' },
      { user_id: 9, meta_key: META, meta_value: '60' }, { user_id: 9, meta_key: BEFORE, meta_value: '36000' },
      { user_id: 11, meta_key: BEFORE, meta_value: '900' },
      { user_id: 99, meta_key: META, meta_value: '5000' }, // a removed account
    ];
    const names = { 7: 'Ada', 9: 'Bo', 11: 'Cy' };
    const r = php('report', [rows, names, 'seconds']);
    assert.deepEqual(r.players.map((p) => p.id), [7, 9, 11]);
    assert.deepEqual(r.players[0], { id: 7, name: 'Ada', seconds: 7200, before: 0, last: 1800000000, total: 7200, last_at: '2027-01-15T08:00:00Z', hours: { seconds: 2, before: 0, total: 2 } });
    assert.deepEqual(r.players[1], { id: 9, name: 'Bo', seconds: 60, before: 36000, last: null, total: 36060, last_at: null, hours: { seconds: 0, before: 10, total: 10 } });
    assert.deepEqual(r.totals, { players: 3, seconds: 7260, before: 36900, total: 44160, hours: { seconds: 2, before: 10.3, total: 12.3 } });
    assert.deepEqual(php('report', [rows, names, 'total']).players.map((p) => p.id), [9, 7, 11]);
    assert.deepEqual(php('report', [rows, names, 'before']).players.map((p) => p.id), [9, 11, 7]);
    assert.equal(php('report', [rows, names, 'nonsense']).sort, 'seconds');
  });
});

describe('play time stays out of sight', { skip: skipWithoutSite }, () => {
  const src = (f) => readFileSync(sitePath('src', f), 'utf8');
  it('the site registers the routes, the table, and only administrators read', () => {
    assert.match(src('Extension.php'), /new PlayTime\(\$minn\)/);
    const minn = JSON.parse(readFileSync(sitePath('minn.json'), 'utf8'));
    assert.ok(minn.tables.groddle_play_batches.includes('PRIMARY KEY  (id)'), 'batch ids are kept once');
    const pt = src('PlayTime.php');
    assert.match(pt, /Route\(Method::Get, '\/groddle\/v1\/admin\/play-time', policy: new Policy\(Access::Cap, self::ADMIN\)\)/);
    assert.match(pt, /Route\(Method::Post, '\/groddle\/v1\/admin\/play-time\/backfill', policy: new Policy\(Access::Cap, self::ADMIN\)\)/);
    assert.match(pt, /private const ADMIN = 'manage_options';/);
    assert.match(pt, /public function take\(Request \$request\): Response\s*\{\s*\$secret = [^;]+;\s*if \(\$secret === null \|\| !ServiceCall::verify\(/, 'the batch route checks the signature first');
  });

  it('nothing else on the site and nothing in the game reads or shows it', () => {
    const keys = /groddle_play_(seconds|last)/;
    for (const f of readdirSync(sitePath('src'))) {
      if (f !== 'PlayTime.php') assert.doesNotMatch(src(f), keys, `site src/${f}`);
    }
    const hits = spawnSync('git', ['-C', root, 'grep', '-I', '-lE', 'groddle_play_|admin/play-time', '--', 'public'], { encoding: 'utf8' }).stdout.trim();
    assert.equal(hits, '', 'the game never mentions it');
  });

  it('the server sends to the route the site declares', { skip: skipWithoutServer }, () => {
    const go = readFileSync(serverPath('playtime.go'), 'utf8');
    assert.match(go, new RegExp(`playRoute\\s+= "${ROUTE}"`));
    assert.match(src('PlayTime.php'), new RegExp(`ROUTE = '${ROUTE}'`));
  });
});

// —— On the real site (opt-in) ——

const LIVE = process.env.GRODDLE_LIVE === '1';
const SITE = (process.env.GRODDLE_URL || 'https://groddle.localhost').replace(/\/$/, '');
const WEBROOT = process.env.GRODDLE_ROOT || join(homedir(), 'Cove/Sites/groddle.localhost/public');
const SECRET_FILE = process.env.GRODDLE_SECRET_FILE || join(WEBROOT, '..', 'realtime.secret');

describe('play time on groddle.localhost', { skip: (!LIVE && 'set GRODDLE_LIVE=1 to drive groddle.localhost') || skip }, () => {
  const wp = (...args) => execFileSync('wp', args, { cwd: WEBROOT, encoding: 'utf8' }).trim();
  const q = (sql) => wp('db', 'query', '--skip-column-names', sql);
  let dir = '';
  let secret = '';
  const made = [];
  const batches = [];
  let player = 0;
  let playerUser = null;
  let admin = null;

  /** One request through curl: {status, json, text}. */
  function call(method, path, { jar, nonce, body, headers = {} } = {}) {
    const args = ['-sk', '-X', method, '-o', join(dir, 'body'), '-w', '%{http_code}'];
    if (jar) args.push('-b', jar, '-c', jar);
    if (nonce) args.push('-H', `X-WP-Nonce: ${nonce}`);
    for (const [k, v] of Object.entries(headers)) args.push('-H', `${k}: ${v}`);
    if (body !== undefined) {
      writeFileSync(join(dir, 'req'), body);
      args.push('-H', 'Content-Type: application/json', '--data-binary', `@${join(dir, 'req')}`);
    }
    args.push(`${SITE}${path}`);
    const status = Number(execFileSync('curl', args, { encoding: 'utf8' }));
    const text = readFileSync(join(dir, 'body'), 'utf8');
    let json = null;
    try { json = JSON.parse(text); } catch { /* not JSON */ }
    return { status, json, text };
  }
  const send = (batch, sig = secret) => {
    const body = JSON.stringify(batch);
    batches.push(batch.id);
    return call('POST', `/wp-json${ROUTE}`, { body, headers: sig ? { 'X-Groddle-Service': sign(sig, ROUTE, body) } : {} });
  };
  const meta = (key) => q(`SELECT meta_value FROM wp_usermeta WHERE user_id = ${player} AND meta_key = '${key}'`);
  const user = (login, role) => {
    const pass = `zz-${randomBytes(9).toString('hex')}`;
    const id = Number(wp('user', 'create', login, `${login}@groddle.localhost`, `--role=${role}`, `--user_pass=${pass}`, '--porcelain'));
    assert.ok(id > 1 && id !== 54);
    made.push(id);
    return { id, login, pass };
  };
  const signIn = (u) => {
    const jar = join(dir, `${u.login}.jar`);
    writeFileSync(jar, '');
    execFileSync('curl', ['-sk', '-o', '/dev/null', '-b', jar, '-c', jar, '--data-urlencode', `log=${u.login}`, '--data-urlencode', `pwd=${u.pass}`, '--data', 'rememberme=forever&testcookie=1', `${SITE}/wp-login.php`]);
    const nonce = call('GET', '/wp-admin/admin-ajax.php?action=rest-nonce', { jar }).text.trim();
    assert.match(nonce, /^[0-9a-f]{10}$/, `${u.login} is signed in`);
    return { jar, nonce };
  };

  before(() => {
    dir = mkdtempSync(join(tmpdir(), 'groddle-play-time-'));
    secret = readFileSync(SECRET_FILE, 'utf8').trim();
    const tag = `${process.pid}`;
    playerUser = user(`zz-pt-player-${tag}`, 'subscriber');
    player = playerUser.id;
    admin = user(`zz-pt-admin-${tag}`, 'administrator');
  });
  after(() => {
    for (const id of made) {
      q(`DELETE FROM wp_groddle_mp_saves WHERE user_id = ${id}`);
      wp('user', 'delete', String(id), '--yes'); // its meta goes with it
    }
    if (batches.length) q(`DELETE FROM wp_groddle_play_batches WHERE id IN (${batches.map((b) => `'${b}'`).join(',')})`);
    rmSync(dir, { recursive: true, force: true });
  });

  const id = (n) => `pt-zz${process.pid.toString(36)}-${n}`;
  const now = () => Math.floor(Date.now() / 1000);

  it('refuses a batch the realtime server did not sign', () => {
    assert.equal(send({ id: id(0), players: [{ user: player, seconds: 60, last: now() }] }, '').status, 401);
    assert.equal(send({ id: id(0), players: [{ user: player, seconds: 60, last: now() }] }, 'z'.repeat(40)).status, 401);
    assert.equal(meta('groddle_play_seconds'), '', 'nothing added');
  });

  it('adds a batch to the running total once, however often it comes', () => {
    const t = now();
    const first = send({ id: id(1), players: [{ user: player, seconds: 60, last: t }] });
    assert.equal(first.status, 200, first.text);
    assert.deepEqual(first.json, { done: id(1), added: 1 });
    assert.equal(meta('groddle_play_seconds'), '60');
    assert.equal(meta('groddle_play_last'), String(t));
    const again = send({ id: id(1), players: [{ user: player, seconds: 60, last: t }] });
    assert.deepEqual(again.json, { done: id(1), added: 0, again: true });
    assert.equal(meta('groddle_play_seconds'), '60', 'a resend adds nothing');
    assert.equal(send({ id: id(2), players: [{ user: player, seconds: 30, last: t - 100 }, { user: 999999999, seconds: 5, last: t }] }).json.added, 1, 'a gone account is skipped');
    assert.equal(meta('groddle_play_seconds'), '90');
    assert.equal(meta('groddle_play_last'), String(t), 'last only moves forward');
  });

  it('the read route is for administrators only, and shows the total', () => {
    assert.equal(call('GET', '/wp-json/groddle/v1/admin/play-time').status, 401, 'signed out');
    const sub = signIn(playerUser);
    assert.equal(call('GET', '/wp-json/groddle/v1/admin/play-time', sub).status, 403, 'a player');
    assert.equal(call('POST', '/wp-json/groddle/v1/admin/play-time/backfill', { ...sub, body: '{}' }).status, 403, 'a player cannot backfill');
    const a = signIn(admin);
    const list = call('GET', '/wp-json/groddle/v1/admin/play-time', a);
    assert.equal(list.status, 200, list.text);
    const row = list.json.players.find((p) => p.id === player);
    assert.equal(row.seconds, 90);
    assert.equal(row.before, 0);
    assert.equal(row.total, 90);
  });

  it('backfill sets the estimate from the save once, kept apart from the total', () => {
    q(`INSERT INTO wp_groddle_mp_saves (user_id, data, version, updated_at) VALUES (${player}, '{}', 40, UTC_TIMESTAMP())`);
    const a = signIn(admin);
    const body = JSON.stringify({ users: [player] });
    const first = call('POST', '/wp-json/groddle/v1/admin/play-time/backfill', { ...a, body });
    assert.equal(first.status, 200, first.text);
    assert.deepEqual(first.json, { set: 1, kept: 0, skipped: 0, per_write: 15 });
    assert.equal(meta('groddle_play_seconds_before'), '600');
    q(`UPDATE wp_groddle_mp_saves SET version = 80 WHERE user_id = ${player}`);
    assert.deepEqual(call('POST', '/wp-json/groddle/v1/admin/play-time/backfill', { ...a, body }).json, { set: 0, kept: 1, skipped: 0, per_write: 15 });
    assert.equal(meta('groddle_play_seconds_before'), '600', 'set once');
    assert.equal(meta('groddle_play_seconds'), '90', 'the measured total is untouched');
    const row = call('GET', '/wp-json/groddle/v1/admin/play-time?sort=total', a).json.players.find((p) => p.id === player);
    assert.deepEqual([row.seconds, row.before, row.total], [90, 600, 690]);
  });
});
