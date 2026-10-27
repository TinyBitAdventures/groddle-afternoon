/**
 * Email verification before an account exists (G336 follow-up, Austin
 * 2026-10-27: "We should require email verification before creating an
 * account."). The game side: js/minn-account.js (signUp's pending answer,
 * verifySignUp, resendSignUp), js/account-forms.js (Check your email, the
 * finishing step a #verify=<token> link opens, and what each answer shows)
 * and js/online-boot.js (the gate hands the link to the forms and drops it
 * once used). The site side, read from groddle-afternoon-site (skipped
 * without it): the held sign-up (src/Signups.php, table groddle_signups),
 * the routes in src/PlayerAccount.php, the email in src/PlayerMail.php, and
 * the engine calls they rely on (Seams::accounts() passwordHash,
 * registerQuietlyWithHash, signInVerified, mail). The live round trip is
 * tests/minn-accounts-live.test.js (opt-in), which now signs up through
 * Mailpit.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { homedir } from 'node:os';

import { createMinnAccount } from '../public/js/minn-account.js?v=nbhome-9';
import { FORM_COPY, fillCopy, signUpOutcome, verifyLinkFrom, verifyOutcome, resetLinkFrom } from '../public/js/account-forms.js?v=g337-2';
import { HAS_SITE, SITE_DIR, skipWithoutSite } from '../tools/repos.mjs';

const root = join(import.meta.dirname, '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');
const BASE = 'https://groddle.localhost/';
const NONCE_PATH = 'wp-admin/admin-ajax.php?action=rest-nonce';
const TOKEN = '0123456789abcdef0123456789abcdef0123456789abcdef';

/** A fetch that records each call and answers from a function of (url, init). */
function fakeFetch(answer) {
  const calls = [];
  const fn = async (url, init = {}) => {
    calls.push({ url, ...init, body: init.body ? JSON.parse(init.body) : undefined });
    if (url.endsWith(NONCE_PATH)) return { status: 200, ok: true, headers: { get: () => null }, text: async () => 'abcdef0123' };
    const [status, body] = answer(url, init) || [404, {}];
    return { status, ok: status >= 200 && status < 300, headers: { get: () => null }, json: async () => body, text: async () => JSON.stringify(body) };
  };
  return { fn, calls };
}

describe('the game: signing up waits for the email', () => {
  it('a sign-up link\'s token comes from the fragment, nothing else', () => {
    assert.deepEqual(verifyLinkFrom(`#verify=${TOKEN}`), { token: TOKEN });
    for (const bad of ['', '#new', '#verify=', `#verify=${TOKEN.slice(1)}`, `#verify=${TOKEN.toUpperCase()}`, `#verify=${TOKEN}&x=1`, `#reset=${TOKEN}&login=a`]) assert.equal(verifyLinkFrom(bad), null, bad);
    assert.equal(resetLinkFrom(`#verify=${TOKEN}`), null, 'a sign-up link is never read as a reset link');
  });

  it('New player answers show Check your email, or (a local QA address) sign straight in', () => {
    assert.equal(signUpOutcome({ ok: true, pending: true, email: 'a@b.c', name: 'Tess' }), 'check-email');
    assert.equal(signUpOutcome({ ok: true, player: { id: 9, name: 'Tess' } }), 'signed-in');
    assert.equal(signUpOutcome({ ok: false, code: 'email_exists', fields: { email: 'x' } }), 'refused');
    assert.equal(signUpOutcome(null), 'refused');
  });

  it('the link\'s answers each lead somewhere plain: in, another name, a new link, sign in, or try again', () => {
    assert.equal(verifyOutcome({ ok: true, player: { id: 3 } }), 'signed-in');
    assert.equal(verifyOutcome({ ok: false, code: 'name_taken', fields: { name: 'Someone opened their link first…' } }), 'name');
    assert.equal(verifyOutcome({ ok: false, code: 'groddle_invalid', fields: { name: 'Names are…' } }), 'name');
    assert.equal(verifyOutcome({ ok: false, code: 'signup_expired' }), 'expired');
    assert.equal(verifyOutcome({ ok: false, code: 'signup_used' }), 'signin');
    assert.equal(verifyOutcome({ ok: false, code: 'email_exists' }), 'signin');
    assert.equal(verifyOutcome({ ok: false, code: 'signup_unknown' }), 'unknown');
    assert.equal(verifyOutcome({ ok: false, code: 'offline' }), 'retry');
  });

  it('the copy is short, plain and fills in the email and name; no em-dashes', () => {
    assert.equal(fillCopy(FORM_COPY.check.body, { email: 'tess@example.com', name: 'Tess' }), 'We sent a link to tess@example.com. Open it to finish making Tess. It works once, for a day.');
    assert.match(fillCopy(FORM_COPY.check.held, { name: 'Tess' }), /^Someone else is waiting to finish a character called Tess too\. Whoever opens their link first keeps the name\.$/);
    assert.equal(fillCopy(FORM_COPY.check.wait, { s: 42 }), 'Send it again (42)');
    assert.equal(fillCopy('{missing} stays', {}), '{missing} stays');
    const all = JSON.stringify([FORM_COPY.check, FORM_COPY.verify]);
    assert.doesNotMatch(all, /—/);
    assert.doesNotMatch(all, /username/i, 'email is the login, never a username');
  });

  it('signUp: a held sign-up is { pending, email, name, nameHeld } and no nonce is asked (nobody is signed in)', async () => {
    const f = fakeFetch((url) => (url.endsWith('groddle/v1/players') ? [202, { pending: true, email: 'tess@example.com', name: 'Tess', nameHeld: true }] : null));
    const account = createMinnAccount({ baseUri: BASE, fetch: f.fn });
    const r = await account.signUp({ email: 'tess@example.com', password: 'zz-pass-1234', name: 'Tess' });
    assert.deepEqual(r, { ok: true, pending: true, email: 'tess@example.com', name: 'Tess', nameHeld: true });
    assert.equal(f.calls.length, 1, 'no nonce fetched: there is no session yet');
    assert.equal(account.nonce, '');
  });

  it('verifySignUp sends the token (and a new name when asked), then fetches the new session\'s nonce', async () => {
    const f = fakeFetch((url, init) => {
      if (!url.endsWith('groddle/v1/players/verify')) return null;
      const body = JSON.parse(init.body);
      return body.name ? [201, { signedIn: true, player: { id: 12, name: body.name } }] : [409, { code: 'name_taken', message: 'Someone opened their link first and took the name Tess. Choose another name to finish.', fields: { name: 'Someone opened their link first and took the name Tess. Choose another name to finish.' } }];
    });
    const account = createMinnAccount({ baseUri: BASE, fetch: f.fn });
    const taken = await account.verifySignUp({ token: TOKEN });
    assert.equal(taken.ok, false);
    assert.equal(taken.code, 'name_taken');
    assert.ok(taken.fields.name);
    assert.deepEqual(f.calls[0].body, { token: TOKEN });
    const made = await account.verifySignUp({ token: TOKEN, name: 'Tess Two' });
    assert.deepEqual(made, { ok: true, player: { id: 12, name: 'Tess Two' } });
    assert.deepEqual(f.calls[1].body, { token: TOKEN, name: 'Tess Two' });
    assert.ok(f.calls[2].url.endsWith(NONCE_PATH), 'signed in: the nonce comes next');
    assert.equal(account.nonce, 'abcdef0123');
  });

  it('resendSignUp asks by token (an expired link) or by email, and passes the wait back', async () => {
    const f = fakeFetch((url, init) => {
      if (!url.endsWith('groddle/v1/players/resend')) return null;
      const body = JSON.parse(init.body);
      if (body.token) return body.token === TOKEN ? [200, { sent: true, email: 'tess@example.com' }] : [429, { code: 'signup_wait', message: 'We just sent one. Wait a minute, then ask again.', fields: {} }];
      return [200, { sent: true }];
    });
    const account = createMinnAccount({ baseUri: BASE, fetch: f.fn });
    assert.deepEqual(await account.resendSignUp({ token: TOKEN }), { ok: true, email: 'tess@example.com' });
    assert.deepEqual(await account.resendSignUp({ email: 'tess@example.com' }), { ok: true });
    assert.deepEqual(f.calls.map((c) => c.body), [{ token: TOKEN }, { email: 'tess@example.com' }]);
    const wait = await account.resendSignUp({ token: 'f'.repeat(48) });
    assert.equal(wait.ok, false);
    assert.equal(wait.code, 'signup_wait');
  });

  it('the forms: New player shows Check your email with a resend a minute apart; a link finishes, asks a name, or offers a new link', () => {
    const src = read('public/js/account-forms.js');
    assert.match(src, /if \(outcome === 'check-email'\) \{\n\s*suPass\.input\.value = '';\n\s*return showCheck\(r\);/, 'the password leaves the form once held');
    assert.match(src, /function startCooldown\(seconds = 60\)/, 'Send it again waits a minute, as the site does');
    assert.match(src, /account\.resendSignUp\(\{ email: pending\.email \}\)/);
    assert.match(src, /account\.resendSignUp\(\{ token: verify\?\.token \|\| '' \}\)/, 'an expired link asks by its own token');
    assert.match(src, /if \(verify\?\.token\) \{\n\s*showFinish\('busy'\);\n\s*finishSignUp\(\);/, 'opening the link finishes without a click');
    assert.match(src, /onSignedIn\(\{ player: r\.player, how: 'verify' \}\)/);
    assert.match(src, /if \(outcome === 'signin' \|\| outcome === 'unknown'\) \{\n\s*show\('signin'\);/, 'a used link offers Sign in');
    assert.match(src, /\.acct-field\[hidden\], \.acct-submit\[hidden\], \.acct-message\[hidden\] \{ display: none; \}/, 'the finishing step hides what its state does not need');
  });

  it('the gate hands a #verify link to the forms, also when signed in already, and drops it once used', () => {
    const src = read('public/js/online-boot.js');
    assert.match(src, /verify: verifyLinkFrom\(location\.hash\), onSignedIn \}\)/);
    assert.match(src, /if \(state === 'ready' && verifyLinkFrom\(location\.hash\)\) \{\n\s*showGate\(gate, 'signed-out', \{ account, onSignedIn \}\);/);
    assert.match(src, /if \(verifyLinkFrom\(location\.hash\)\) history\.replaceState\(history\.state, '', location\.pathname\);\n\s*boot\(\);/, 'spent before the gate looks again, so it never loops');
    assert.match(src, /location\.hash\.startsWith\('#verify='\)\) history\.replaceState/);
    assert.match(src, /resetLinkFrom\(location\.hash\) \|\| verifyLinkFrom\(location\.hash\)\)\) boot\(\);/, 'a link opened in a tab already on the gate');
  });
});

describe('the site: no account until the email is proven (groddle-afternoon-site)', { skip: skipWithoutSite }, () => {
  const src = (f) => readFileSync(join(SITE_DIR, 'src', f), 'utf8');
  const manifest = HAS_SITE ? JSON.parse(readFileSync(join(SITE_DIR, 'minn.json'), 'utf8')) : {};

  it('groddle_signups holds a token\'s hash, the email once, the password\'s HASH and the wished-for name', () => {
    const t = manifest.tables.groddle_signups;
    assert.ok(t, 'declared in minn.json');
    assert.ok(t.includes('PRIMARY KEY  (token_hash)'));
    assert.ok(t.includes('UNIQUE KEY email_key (email_key)'), 'one sign-up per email: a second replaces the first');
    assert.ok(t.includes('KEY name_key (name_key)') && !t.includes('UNIQUE KEY name_key (name_key)'), 'two sign-ups may wish for one name');
    for (const col of ['token_hash', 'email', 'pass_hash', 'name', 'sends', 'sent_at', 'expires_at', 'used_at', 'user_id', 'ip']) assert.ok(t.some((l) => l.startsWith(`${col} `)), col);
    assert.ok(!t.some((l) => /^(password|token|pass) /.test(l)), 'never the password, never the token itself');
  });

  it('a sign-up is checked as before, then held: no account, the hash kept, the link mailed, 202', () => {
    const acct = src('PlayerAccount.php');
    const create = acct.slice(acct.indexOf('public function create('), acct.indexOf('public function verify('));
    assert.match(create, /\(new Characters\(\$this->minn->db\)\)->taken\(\$name\)/, 'names are still unique');
    assert.match(create, /strlen\(\$password\) < self::MIN_PASSWORD/, 'the password rules as now');
    assert.match(create, /\$this->emailTaken\(\$email\)/, 'an email with a character is refused as before');
    assert.match(create, /\$signups->hold\(\$email, \$accounts->passwordHash\(\$password\), \$name, \$request->remoteAddress, \$now\)/);
    assert.match(create, /Response::json\(\['pending' => true, 'email' => \$email, 'name' => \$name, 'nameHeld' => \$held\], 202\)/);
    assert.doesNotMatch(create.replace(/return \$this->makeNow\(\$email, \$password, \$name\);/, ''), /registerQuietly\(|signInRemembered\(/, 'no account and no session from the sign-up itself');
  });

  it('only a local site\'s QA addresses skip the email, and only while the option names them', () => {
    const acct = src('PlayerAccount.php');
    assert.match(acct, /public const INSTANT_OPTION = 'groddle_signup_instant';/);
    assert.match(acct, /str_ends_with\(\(string\) parse_url\(\$home, PHP_URL_HOST\), '\.localhost'\)/, 'never on a real domain');
    assert.match(acct, /if \(\$this->instant\(\$email\)\) \{\n\s*return \$this->makeNow\(\$email, \$password, \$name\);/);
  });

  it('opening the link makes the account exactly as a sign-up did, once, and signs the player in', () => {
    const acct = src('PlayerAccount.php');
    const verify = acct.slice(acct.indexOf('public function verify('), acct.indexOf('public function resend('));
    assert.match(acct, /#\[Route\(Method::Post, '\/groddle\/v1\/players\/verify', policy: new Policy\(Access::Public\)\)\]/);
    assert.match(verify, /\$signups->spend\(\$row, \$now\)/, 'spent before the account is made: two clicks make one account');
    assert.match(verify, /->registerQuietlyWithHash\('player-' \. bin2hex\(random_bytes\(5\)\), \(string\) \$row\['email'\], \(string\) \$row\['pass_hash'\], \$name, self::ROLE\)/);
    assert.match(verify, /\$signups->unspend\(\$row\);\n\s*return self::fromRefusal\(\$made\);/, 'a refusal gives the link back');
    assert.match(verify, /\$characters->claim\(\$made->id, \$name\);\n\s*\$signups->made\(\$row, \$made->id, \$name\);/);
    assert.match(verify, /\$accounts->signInVerified\(Response::json\(\[\]\), \$made\), 201\)/);
    assert.match(verify, /'code' => 'name_taken'[\s\S]*409\)/, 'first verified wins the name; the second is asked for another, its link still good');
    assert.match(verify, /\$row === null => \['signup_unknown', 410\]/);
    assert.match(verify, /\(\$row\['used_at'\] \?\? null\) !== null => \['signup_used', 410\]/);
    assert.match(verify, /!Signups::pending\(\$row, \$now\) => \['signup_expired', 410\]/);
    const signups = src('Signups.php');
    assert.match(signups, /UPDATE \{\$table\} SET used_at = \? WHERE token_hash = \? AND used_at IS NULL"[^;]*=== 1;/, 'spending is one atomic update');
    assert.match(signups, /SET pass_hash = '', user_id = \?/, 'a used row forgets the hash');
    assert.match(signups, /return hash\('sha256', \$token\);/, 'only the token\'s hash is stored');
  });

  it('resend: by token says why it waits; by email answers the same whether or not anything waits', () => {
    const acct = src('PlayerAccount.php');
    const resend = acct.slice(acct.indexOf('public function resend('), acct.indexOf('private function makeNow('));
    assert.match(resend, /if \(\$row !== null && \(\$row\['used_at'\] \?\? null\) === null && Signups::sendRefusal\(\$row, \$now\) === null\) \{\n\s*\$this->mailLink/);
    assert.match(resend, /\n\s*return Response::json\(\['sent' => true\]\);\n\s*\}\n/, 'one answer for every address');
    assert.match(acct, /'signup_spent' => /);
    assert.doesNotMatch(Object.values(acct.match(/private const WORDS = \[[\s\S]*?\];/)).join(''), /—/, 'no em-dashes in the words');
  });

  it('the routes are the engine\'s accounts only: no WordPress function', () => {
    for (const f of ['PlayerAccount.php', 'Signups.php', 'PlayerMail.php']) {
      assert.doesNotMatch(src(f), /\b(?:get_option|wp_[a-z_]+|current_user_can|get_current_user_id|esc_[a-z]+|\$wpdb)\s*\(/, f);
    }
  });

  const engine = process.env.MINN_ENGINE_DIR || join(homedir(), 'Cove/Sites/minn-engine.localhost/public/minn');
  const noEngine = !existsSync(join(engine, 'src/Minn/Autoloader.php')) && 'Minn Engine not found (set MINN_ENGINE_DIR)';

  it('the engine offers what the routes call (Seams::accounts)', { skip: noEngine }, () => {
    const accounts = readFileSync(join(engine, 'src/Minn/Extension/Accounts.php'), 'utf8');
    for (const sig of ['public function passwordHash(string $password): string', 'public function registerQuietlyWithHash(string $login, string $email, string $hash, string $shownAs = \'\', string $role = \'\'): UserRecord|Refusal', 'public function signInVerified(Response $response, UserRecord $user): SignedIn', 'public function mail(string $to, string $subject, string $body, string|array $headers = \'\'): bool']) {
      assert.ok(accounts.includes(sig), sig);
    }
  });

  it('the email: in the site\'s look, the character named and escaped, the link once, the rules as the table keeps them (php)', { skip: noEngine }, () => {
    const out = JSON.parse(execFileSync('php', [join(root, 'tests/fixtures/minn-accounts/verify-mail.php'), engine, SITE_DIR], { encoding: 'utf8' }));
    assert.equal(out.subject, 'Finish making your Groddle Afternoon character');
    assert.deepEqual(out.headers, ['Content-Type: text/html; charset=UTF-8', 'From: Groddle Afternoon <noreply@groddle.example>']);
    assert.match(out.html, /Hi <strong>Zz &lt;b&gt;Bold&lt;\/b&gt; &amp; Co<\/strong>,/);
    assert.match(out.html, /href="https:\/\/groddle\.example\/play\/online\/#verify=(?:0a){24}"/);
    assert.match(out.html, /It works once, for a day\./);
    assert.match(out.html, /background:#dcefc9/);
    assert.match(out.html, /background:#e58b3f/);
    assert.doesNotMatch(out.html, /—|username|player-[0-9a-f]{10}/i);
    assert.deepEqual(out.token, { length: 48, looks: true, hash: true, notHex: false, short: false });
    assert.deepEqual(out.pending, { waiting: true, expired: false, used: false });
    assert.deepEqual(out.send, { none: null, ok: null, soon: 'wait', spent: 'spent', used: null });
    assert.deepEqual(out.limits, { lifetime: 86400, maxSends: 5, gap: 60, perAddressHour: 10 });
  });
});
