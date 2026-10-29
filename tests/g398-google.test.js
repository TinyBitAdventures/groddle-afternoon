/**
 * Continue with Google (Austin 2026-10-28). The site side, read from
 * groddle-afternoon-site (skipped without it): src/GoogleIdToken.php (RS256
 * against Google's key list, cached by its max-age and fetched again for a
 * new kid, then iss, aud, exp and email_verified) and src/GoogleSignIn.php
 * (groddle/v1/account/google and account/google/finish: a linked sub signs
 * in, a player's verified email signs in and is linked, a new player chooses
 * a character name first). The PHP runs with RSA keys made in the fixture
 * and Google answered by Minn's Http fake. The game side: js/account-forms.js
 * (Google's own button on both tabs, the name step).
 *
 * The live block (opt-in, GRODDLE_LIVE=1) drives groddle.localhost with
 * tokens signed here: it sets a placeholder client id and the local QA key
 * option (groddle_google_qa_jwks, honoured on .localhost only), makes
 * throwaway players and removes them, their rows and the options after.
 */
import assert from 'node:assert/strict';
import { describe, it, before, after } from 'node:test';
import { readFileSync, existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { join } from 'node:path';
import { homedir, tmpdir } from 'node:os';

import { FORM_COPY, GOOGLE_SCRIPT, createAccountRequests, googleButtonOptions, googleOutcome } from '../public/js/account-forms.js?v=g436-1';
import { HAS_SITE, SITE_DIR, skipWithoutSite } from '../tools/repos.mjs';

const root = join(import.meta.dirname, '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');
const API = 'https://groddle.localhost/wp-json/groddle/v1/';

function fakeFetch(answer) {
  const calls = [];
  const fn = async (url, init = {}) => {
    calls.push({ url, ...init, body: init.body ? JSON.parse(init.body) : undefined });
    const [status, body] = answer(url, init) || [404, {}];
    return { status, ok: status >= 200 && status < 300, headers: { get: () => null }, json: async () => body };
  };
  return { fn, calls };
}

describe('the game: Continue with Google on the card', () => {
  it('sends the credential at once and reads the three answers', async () => {
    const { fn, calls } = fakeFetch((url, init) => {
      const body = JSON.parse(init.body);
      if (url.endsWith('account/google')) {
        if (body.credential === 'known') return [200, { signedIn: true, player: { id: 9, name: 'Tess' } }];
        if (body.credential === 'new') return [202, { pending: 'p.q', email: 'zz@x.y', name: 'Tess' }];
        return [401, { code: 'google_failed', message: FORM_COPY.google.failed, fields: {} }];
      }
      if (url.endsWith('account/google/finish')) {
        return body.name === 'Taken' ? [409, { code: 'name_taken', message: 'Someone already has that name. Try another.', fields: { name: 'Someone already has that name. Try another.' } }] : [201, { signedIn: true, player: { id: 10, name: body.name } }];
      }
      return null;
    });
    const req = createAccountRequests({ api: API, fetch: fn });
    const known = await req.google({ credential: 'known', remember: false });
    assert.deepEqual(known, { ok: true, player: { id: 9, name: 'Tess' } });
    assert.equal(googleOutcome(known), 'signed-in');
    const fresh = await req.google({ credential: 'new' });
    assert.deepEqual(fresh, { ok: true, pending: 'p.q', email: 'zz@x.y', name: 'Tess' });
    assert.equal(googleOutcome(fresh), 'name');
    const bad = await req.google({ credential: 'forged' });
    assert.equal(googleOutcome(bad), 'refused');
    assert.equal(bad.message, 'Google sign-in didn\'t work. Try again, or use your email.');
    const taken = await req.googleFinish({ pending: 'p.q', name: 'Taken' });
    assert.deepEqual([taken.ok, taken.code, !!taken.fields.name], [false, 'name_taken', true]);
    assert.deepEqual(await req.googleFinish({ pending: 'p.q', name: 'Tess Two', remember: true }), { ok: true, player: { id: 10, name: 'Tess Two' } });
    assert.deepEqual(calls.map((c) => [c.url.slice(API.length), c.body]), [
      ['account/google', { credential: 'known', remember: false }],
      ['account/google', { credential: 'new', remember: true }],
      ['account/google', { credential: 'forged', remember: true }],
      ['account/google/finish', { pending: 'p.q', name: 'Taken', remember: true }],
      ['account/google/finish', { pending: 'p.q', name: 'Tess Two', remember: true }],
    ]);
  });

  it('draws Google\'s own button (Google Identity Services), on both tabs, only with a client id', () => {
    const forms = read('public/js/account-forms.js');
    assert.equal(GOOGLE_SCRIPT, 'https://accounts.google.com/gsi/client');
    assert.deepEqual(googleButtonOptions(), { type: 'standard', theme: 'outline', size: 'large', text: 'continue_with', shape: 'pill', logo_alignment: 'left', width: 320 });
    assert.equal(googleButtonOptions(900).width, 400);
    assert.equal(googleButtonOptions(50).width, 200);
    assert.match(forms, /if \(typeof options\.google === 'string' && options\.google\) startGoogle\(options\.google\);/);
    assert.equal((forms.match(/loadScript\(GOOGLE_SCRIPT\)/g) || []).length, 1);
    assert.match(forms, /gis\.initialize\(\{ client_id: clientId, callback: \(r\) => onGoogleCredential\(r\?\.credential\), ux_mode: 'popup', auto_select: false/, 'the credential callback, no redirect');
    assert.match(forms, /gis\.renderButton\(row\.button, googleButtonOptions\(width\)\);/, 'Google\'s button, not a homemade one');
    assert.match(forms, /signin\.append\(googleRows\.signin\.wrap,/);
    assert.match(forms, /signup\.append\(googleRows\.signup\.wrap,/);
    assert.doesNotMatch(forms, /localStorage|sessionStorage/, 'nothing about the sign-in is kept in the browser');
    assert.match(forms, /const keep = from === 'signin' \? remember\.checked : true;/, 'Keep me signed in counts for Google as for the password');
    assert.match(forms, /googlePending = \{ pending: r\.pending, remember: keep \};/, 'the name step holds the site\'s pending token, not Google\'s');
    assert.equal(FORM_COPY.google.nameTitle, 'Choose your character name');
    assert.doesNotMatch(JSON.stringify(FORM_COPY), /—/);
  });
});

describe('the site: Google sign-in (groddle-afternoon-site)', { skip: skipWithoutSite }, () => {
  const src = (f) => readFileSync(join(SITE_DIR, 'src', f), 'utf8');
  const manifest = HAS_SITE ? JSON.parse(readFileSync(join(SITE_DIR, 'minn.json'), 'utf8')) : {};

  it('two public routes, Google\'s key list the only new host, options hands out the client id', () => {
    const google = src('GoogleSignIn.php');
    assert.match(google, /#\[Route\(Method::Post, '\/groddle\/v1\/account\/google', policy: new Policy\(Access::Public\)\)\]/);
    assert.match(google, /#\[Route\(Method::Post, '\/groddle\/v1\/account\/google\/finish', policy: new Policy\(Access::Public\)\)\]/);
    assert.match(src('Extension.php'), /new GoogleSignIn\(\$minn\)\);/);
    assert.ok(manifest.needs.http.includes('https://www.googleapis.com/oauth2/v3/certs'));
    assert.match(src('PlayerAccount.php'), /'google' => \$google !== '' \? \$google : null/);
  });

  it('nothing in the token is read before the signature checks out', () => {
    const token = src('GoogleIdToken.php');
    const verify = token.slice(token.indexOf('public function verify('), token.indexOf('public static function claimsRefusal('));
    assert.ok(verify.indexOf('openssl_verify(') > 0);
    assert.ok(verify.indexOf('$claims = self::jsonPart($body)') > verify.indexOf('openssl_verify('), 'claims decoded only after the signature');
    assert.match(verify, /openssl_verify\("\{\$head\}\.\{\$body\}", \$signature, \$key, OPENSSL_ALGO_SHA256\) !== 1/);
    assert.match(token, /public const ISSUERS = \['accounts\.google\.com', 'https:\/\/accounts\.google\.com'\];/);
    assert.doesNotMatch(token + src('GoogleSignIn.php'), /\brequire\b|composer|firebase|JWT::/i, 'no third-party library');
  });

  it('new players: a name first, no verification email, a subscriber with a made-up login and no known password', () => {
    const google = src('GoogleSignIn.php');
    const finish = google.slice(google.indexOf('public function finish('), google.indexOf('public static function plan('));
    assert.match(finish, /preg_match\(PlayerAccount::NAME, \$name\) !== 1/);
    assert.match(finish, /\$characters->taken\(\$name\)/);
    assert.match(finish, /'code' => 'name_taken'[\s\S]*409\)/);
    assert.match(finish, /->registerQuietly\('player-' \. bin2hex\(random_bytes\(5\)\), \$email, bin2hex\(random_bytes\(24\)\), \$name, PlayerAccount::ROLE\)/);
    assert.match(finish, /\$characters->claim\(\$made->id, \$name\);/);
    assert.doesNotMatch(finish, /mailLink|PlayerMail|->mail\(/, 'Google proved the email');
    assert.match(google, /hash_hmac\('sha256', 'groddle-google-pending\/1\.' \. \$payload, \$this->stateKey\(\), true\)/);
    assert.match(google, /public const PENDING_LIFETIME = 900;/);
    assert.match(google, /if \(!\$remember && \(int\) \(\$options\['expires'\] \?\? 0\) > time\(\)\) \{\n\s*\$options\['expires'\] = 0;/, 'unticked: the cookies end with the browser');
    assert.match(google, /str_ends_with\(\(string\) parse_url\(\$home, PHP_URL_HOST\), '\.localhost'\)/, 'the QA keys only on a local site');
    assert.doesNotMatch(google + src('GoogleIdToken.php'), /\b(?:get_option|update_option|wp_[a-z_]+|esc_[a-z]+|\$wpdb)\s*\(/);
    for (const f of ['GoogleSignIn.php', 'GoogleIdToken.php']) assert.doesNotMatch(src(f).match(/WORDS = \[[\s\S]*?\];/)?.[0] || '', /—/, f);
  });

  const engine = process.env.MINN_ENGINE_DIR || join(homedir(), 'Cove/Sites/minn-engine.localhost/public/minn');
  const noEngine = !existsSync(join(engine, 'src/Minn/Autoloader.php')) && 'Minn Engine not found (set MINN_ENGINE_DIR)';

  it('the ID token checks, with local keys and a fake key list (php)', { skip: noEngine }, () => {
    const out = JSON.parse(execFileSync('php', [join(root, 'tests/fixtures/minn-accounts/google-token.php'), engine, SITE_DIR], { encoding: 'utf8' }));
    const c = out.cases;
    assert.deepEqual(c.good, ['ok', 1], 'a good token passes, the key list fetched once');
    assert.deepEqual(c.claims, ['110248495921238986420', 'zz-google@example.com']);
    assert.deepEqual(c.cached, ['ok', 1, 21600, 1800000000], 'kept by its max-age, not fetched again');
    assert.equal(c.shortIssuer, 'ok', 'accounts.google.com without the scheme is Google too');
    assert.equal(c.badSignature, 'signature');
    assert.equal(c.tampered, 'signature');
    assert.equal(c.wrongAudience, 'audience');
    assert.equal(c.audienceList, 'audience');
    assert.equal(c.wrongIssuer, 'issuer');
    assert.equal(c.expired, 'expired');
    assert.equal(c.withinSkew, 'ok', 'a minute of skew');
    assert.equal(c.future, 'not_yet');
    assert.equal(c.emailUnverified, 'unverified_email');
    assert.equal(c.emailVerifiedText, 'ok');
    assert.equal(c.emailVerifiedMissing, 'unverified_email');
    assert.equal(c.noEmail, 'claims');
    assert.equal(c.algNone, 'algorithm');
    assert.equal(c.algHs256, 'algorithm');
    assert.deepEqual(c.malformed, Array(6).fill('malformed'));
    assert.equal(c.noClient, 'malformed');
    assert.deepEqual(c.unknownKidSoon, ['unknown_key', 0], 'a new kid within a minute of a fetch waits');
    assert.deepEqual(c.unknownKidRefetch, ['ok', 1], 'then the list is fetched again and the new key passes');
    assert.deepEqual(c.bothKeysAfter, ['ok', 'ok', 1]);
    assert.deepEqual(c.neverPublished, ['unknown_key', 'unknown_key', 2], 'a made-up kid costs one fetch a minute at most');
    assert.deepEqual(c.staleGoogleDown, ['ok', 1], 'Google down: the copy\'s key still checks');
    assert.deepEqual(c.fixedKeys, ['ok', 0]);
    assert.deepEqual(out.keys, { good: true, weak: false, notRsa: false, encryption: false, otherAlg: false });
    assert.deepEqual(out.maxAge, [21600, 3600, 60, 604800, 3600]);
    assert.deepEqual(out.plans, {
      linked: ['signin', 7, false],
      linkedStaff: ['refuse', 'google_staff'],
      linkedWins: ['signin', 7, false],
      email: ['signin', 8, true],
      emailStaff: ['refuse', 'google_staff'],
      emailOtherGoogle: ['refuse', 'google_other'],
      new: ['new'],
    });
    assert.deepEqual(out.subscriber, [true, false, false, false, false]);
    assert.deepEqual(out.suggested, ['Tess', 'Mary Ann', '', '', '']);
  });
});

// ---- Live (opt-in): groddle.localhost with tokens signed here ----

const LIVE = process.env.GRODDLE_LIVE === '1';
const SITE = (process.env.GRODDLE_URL || 'https://groddle.localhost').replace(/\/$/, '');
const ROOT = process.env.GRODDLE_ROOT || join(homedir(), 'Cove/Sites/groddle.localhost/public');
const MAILPIT = (process.env.MINN_MAILPIT || 'https://mail.cove.localhost/api/v1').replace(/\/$/, '');
const wp = (...args) => execFileSync('wp', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
const sql = (q) => wp('db', 'query', q, '--skip-column-names');
const CLIENT = 'qa-placeholder.apps.googleusercontent.com';
let dir = '';

function call(jar, path, body) {
  const file = join(dir, 'request.json');
  writeFileSync(file, JSON.stringify(body));
  const out = execFileSync('curl', ['-sk', '-b', jar, '-c', jar, '-X', 'POST', '-D', '-', '-o', join(dir, 'body'), '-w', '%{http_code}', '-H', 'Content-Type: application/json', '--data-binary', `@${file}`, `${SITE}/wp-json/groddle/v1/${path}`], { encoding: 'utf8' });
  const text = readFileSync(join(dir, 'body'), 'utf8');
  let json = null;
  try { json = JSON.parse(text); } catch { /* not JSON */ }
  return { status: Number(out.slice(-3)), headers: out.slice(0, -3), json, text };
}

describe('Google sign-in on the live site', { skip: !LIVE && 'set GRODDLE_LIVE=1 to drive groddle.localhost' }, () => {
  const T = `g398g${process.pid}`;
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const jwk = { ...publicKey.export({ format: 'jwk' }), kid: `qa-${T}`, alg: 'RS256', use: 'sig' };
  const b64 = (v) => Buffer.from(typeof v === 'string' ? v : JSON.stringify(v)).toString('base64url');
  const token = (claims, { key = privateKey, kid = jwk.kid } = {}) => {
    const now = Math.floor(Date.now() / 1000);
    const head = b64({ alg: 'RS256', kid, typ: 'JWT' });
    const body = b64({ iss: 'https://accounts.google.com', aud: CLIENT, iat: now - 5, exp: now + 3600, email_verified: true, ...claims });
    return `${head}.${body}.${sign('sha256', Buffer.from(`${head}.${body}`), key).toString('base64url')}`;
  };
  const users = [];
  const jar = (name) => { const f = join(dir, `${name}.jar`); writeFileSync(f, ''); return f; };
  const idOf = (email) => Number(sql(`SELECT ID FROM wp_users WHERE user_email = '${email}'`) || 0);

  before(() => {
    dir = mkdtempSync(join(tmpdir(), 'groddle-google-'));
    wp('option', 'update', 'groddle_google_client_id', CLIENT);
    wp('option', 'update', 'groddle_google_qa_jwks', JSON.stringify({ keys: [jwk] }));
  });
  after(() => {
    for (const id of users.filter((n) => n > 1 && n !== 54)) {
      sql(`DELETE FROM wp_groddle_players WHERE user_id = ${id}; DELETE FROM wp_groddle_signups WHERE user_id = ${id}`);
      wp('user', 'delete', String(id), '--yes');
    }
    for (const e of ['new', 'pw', 'off'].map((k) => `zz-${T}-${k}@groddle.localhost`)) sql(`DELETE FROM wp_groddle_mail_sends WHERE email_hash = '${createHash('sha256').update(e).digest('hex')}'`);
    for (const o of ['groddle_google_client_id', 'groddle_google_qa_jwks']) { try { wp('option', 'delete', o); } catch { /* gone */ } }
    rmSync(dir, { recursive: true, force: true });
  });

  it('a new player chooses a name (taken names refused as New player does), then is made and signed in', () => {
    // Someone with a name already: a password player made the QA way.
    const pw = call(jar('pw'), 'players', { email: `zz-${T}-pw@groddle.localhost`, password: 'zz-pass-123456', name: `Zz ${T}`.slice(0, 19) });
    assert.equal(pw.status, 201, pw.text);
    users.push(pw.json.player.id);
    const j = jar('new');
    const start = call(j, 'account/google', { credential: token({ sub: `${T}1`, email: `zz-${T}-new@groddle.localhost`, given_name: 'Zz New' }), remember: true });
    assert.equal(start.status, 202, start.text);
    assert.equal(start.json.email, `zz-${T}-new@groddle.localhost`);
    assert.equal(start.json.name, 'Zz New', 'Google\'s first name offered when it fits the rules');
    assert.match(start.json.pending, /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    assert.ok(!start.text.includes('eyJhbGciOi'), 'Google\'s token is not handed back');
    assert.doesNotMatch(start.headers, /set-cookie: wordpress_logged_in/i, 'nobody signed in yet');
    assert.equal(idOf(`zz-${T}-new@groddle.localhost`), 0, 'no account yet');
    const taken = call(j, 'account/google/finish', { pending: start.json.pending, name: `ZZ ${T}`.slice(0, 19), remember: true });
    assert.equal(taken.status, 409);
    assert.equal(taken.json.code, 'name_taken');
    assert.equal(taken.json.fields.name, 'Someone already has that name. Try another.');
    const tampered = call(j, 'account/google/finish', { pending: `${start.json.pending.slice(0, -2)}AA`, name: 'Zz Fresh', remember: true });
    assert.equal(tampered.status, 410);
    const made = call(j, 'account/google/finish', { pending: start.json.pending, name: `Zz ${T} G`.slice(0, 19), remember: true });
    assert.equal(made.status, 201, made.text);
    assert.equal(made.json.signedIn, true);
    assert.equal(made.json.player.name, `Zz ${T} G`.slice(0, 19));
    assert.match(made.headers, /set-cookie: wordpress_logged_in_[0-9a-f]+=[^;]+;[^\n]*expires=/i, 'remembered: the cookie outlives the browser');
    const id = made.json.player.id;
    users.push(id);
    assert.equal(wp('user', 'get', String(id), '--field=roles'), 'subscriber');
    assert.match(wp('user', 'get', String(id), '--field=user_login'), /^player-[0-9a-f]{10}$/);
    assert.equal(wp('user', 'meta', 'get', String(id), 'groddle_google_sub'), `${T}1`);
    assert.equal(sql(`SELECT COUNT(*) FROM wp_groddle_signups WHERE email_key = 'zz-${T}-new@groddle.localhost'`), '0', 'no verification email held');
    const again = call(j, 'account/google/finish', { pending: start.json.pending, name: 'Zz Another', remember: true });
    assert.equal(again.status, 410, 'the pending token makes one account');
    assert.equal(again.json.code, 'google_used');
  });

  it('a linked Google id signs that player in; unticked, the cookies end with the browser', () => {
    const r = call(jar('linked'), 'account/google', { credential: token({ sub: `${T}1`, email: `zz-${T}-new@groddle.localhost` }), remember: false });
    assert.equal(r.status, 200, r.text);
    assert.equal(r.json.player.id, idOf(`zz-${T}-new@groddle.localhost`));
    const line = r.headers.split('\n').find((l) => /^set-cookie: wordpress_logged_in_/i.test(l)) || '';
    assert.ok(line, 'signed in');
    assert.doesNotMatch(line, /expires=/i, 'a browser-session cookie');
  });

  it('a player\'s verified email signs in and is linked; another Google account for that email is refused', () => {
    const email = `zz-${T}-pw@groddle.localhost`;
    const r = call(jar('email'), 'account/google', { credential: token({ sub: `${T}2`, email }), remember: true });
    assert.equal(r.status, 200, r.text);
    assert.equal(r.json.player.id, idOf(email));
    assert.equal(wp('user', 'meta', 'get', String(idOf(email)), 'groddle_google_sub'), `${T}2`);
    const other = call(jar('other'), 'account/google', { credential: token({ sub: `${T}3`, email }), remember: true });
    assert.equal(other.status, 403);
    assert.equal(other.json.code, 'google_other');
  });

  it('refuses forged, wrong-audience, expired and unverified tokens in plain words', () => {
    const { privateKey: other } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const now = Math.floor(Date.now() / 1000);
    for (const credential of [
      token({ sub: `${T}4`, email: `zz-${T}-x@groddle.localhost` }, { key: other }),
      token({ sub: `${T}4`, email: `zz-${T}-x@groddle.localhost`, aud: 'someone-else.apps.googleusercontent.com' }),
      token({ sub: `${T}4`, email: `zz-${T}-x@groddle.localhost`, exp: now - 120 }),
      token({ sub: `${T}4`, email: `zz-${T}-x@groddle.localhost`, email_verified: false }),
      token({ sub: `${T}4`, email: `zz-${T}-x@groddle.localhost` }, { kid: 'not-a-key' }),
      'not-a-token',
    ]) {
      const r = call(jar('bad'), 'account/google', { credential, remember: true });
      assert.equal(r.status, 401, r.text);
      assert.deepEqual(r.json, { code: 'google_failed', message: 'Google sign-in didn\'t work. Try again, or use your email.', fields: {} });
    }
  });

  it('a Google-only player can still ask Forgot your password and gets the email', () => {
    const email = `zz-${T}-new@groddle.localhost`;
    const r = call(jar('forgot'), 'password-reset', { email });
    assert.equal(r.status, 200, r.text);
    let found = 0;
    for (let i = 0; i < 30 && !found; i++) {
      found = JSON.parse(execFileSync('curl', ['-sk', `${MAILPIT}/search?query=${encodeURIComponent(`to:${email}`)}&limit=5`], { encoding: 'utf8' })).messages_count || 0;
      if (!found) execFileSync('sleep', ['0.3']);
    }
    assert.ok(found >= 1, 'the reset link went');
  });

  it('with the client id unset, both routes are off', () => {
    wp('option', 'delete', 'groddle_google_client_id');
    try {
      const r = call(jar('off'), 'account/google', { credential: token({ sub: `${T}1`, email: `zz-${T}-new@groddle.localhost` }) });
      assert.equal(r.status, 404);
      assert.equal(r.json.code, 'google_off');
    } finally {
      wp('option', 'update', 'groddle_google_client_id', CLIENT);
    }
  });
});
