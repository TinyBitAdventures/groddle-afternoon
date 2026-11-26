/**
 * A new sign-in email takes effect only once its link is opened (2026-11-14). The site side, from
 * groddle-afternoon-site (skipped without it): PUT groddle/v1/account/email checks the current
 * password and holds the address (src/EmailChanges.php, table groddle_email_changes), mailing
 * /play/online/#email=<token> to the NEW address (src/PlayerMail.php confirmEmail); POST
 * account/email/confirm saves it, ends the login's other sessions and tells the old address. The
 * rules run on a throwaway MariaDB database (tests/fixtures/email-change/email-change.php). The game
 * side: js/minn-account-core.js (changeEmail's pending answer, confirmEmail), js/account-forms.js
 * (the Account panel's words, emailLinkFrom, emailLinkOutcome) and js/online-boot.js (the gate
 * confirms the link, drops it from the address bar, then carries on).
 */
import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { createMinnAccountCore } from '../public/js/minn-account-core.js?v=5baee954';
import { EMAIL_LINK_COPY, SETTINGS_COPY, emailLinkFrom, emailLinkOutcome, fillCopy, resetLinkFrom, verifyLinkFrom } from '../public/js/account-forms.js?v=683e1475';
import { GATE_COPY } from '../public/js/online-boot.js?v=a0f37b71';
import { SITE_DIR, sitePath, skipWithoutSite } from '../tools/repos.mjs';
import { HAS_PHP, PHP, phpSkip } from './php.js';

const root = join(import.meta.dirname, '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');
const BASE = 'https://groddle.localhost/';
const NONCE_PATH = 'wp-admin/admin-ajax.php?action=rest-nonce';
const TOKEN = '0123456789abcdef0123456789abcdef0123456789abcdef';

function fakeFetch(answer) {
  const calls = [];
  const fn = async (url, init = {}) => {
    calls.push({ url, ...init, body: init.body ? JSON.parse(init.body) : undefined });
    if (url.endsWith(NONCE_PATH)) return { status: 200, ok: true, headers: { get: () => null }, text: async () => 'fedcba9876' };
    const [status, body] = answer(url, init) || [404, {}];
    return { status, ok: status >= 200 && status < 300, headers: { get: () => null }, json: async () => body, text: async () => JSON.stringify(body) };
  };
  return { fn, calls };
}

describe('the game: a new email waits for its link', () => {
  it('the link\'s token comes from #email=<48 hex>, and no other link is read as one', () => {
    assert.deepEqual(emailLinkFrom(`#email=${TOKEN}`), { token: TOKEN });
    for (const bad of ['', '#email=', `#email=${TOKEN.slice(1)}`, `#email=${TOKEN.toUpperCase()}`, `#email=${TOKEN}&x=1`, `#verify=${TOKEN}`]) assert.equal(emailLinkFrom(bad), null, bad);
    assert.equal(verifyLinkFrom(`#email=${TOKEN}`), null);
    assert.equal(resetLinkFrom(`#email=${TOKEN}`), null);
  });

  it('asking says a link was sent and changes nothing yet; opening it confirms, with a fresh nonce when this browser stays signed in', async () => {
    const { fn, calls } = fakeFetch((url) => {
      if (url.endsWith('account/email')) return [202, { pending: true, email: 'rae-new@example.com', current: 'rae@example.com' }];
      if (url.endsWith('account/email/confirm')) return [200, { changed: true, email: 'rae-new@example.com', signedIn: true, player: { id: 4 } }];
      return null;
    });
    const account = createMinnAccountCore({ baseUri: BASE, fetch: fn, nonce: '0123456789' });
    assert.deepEqual(await account.changeEmail({ current: 'zz-pass-1234', email: 'rae-new@example.com' }), { ok: true, pending: true, email: 'rae-new@example.com', current: 'rae@example.com' });
    assert.deepEqual(await account.confirmEmail({ token: TOKEN }), { ok: true, email: 'rae-new@example.com', signedIn: true });
    assert.equal(account.nonce, 'fedcba9876', 'the session was opened again: its nonce is fetched');
    const confirm = calls.find((c) => c.url.endsWith('account/email/confirm'));
    assert.deepEqual([confirm.method, confirm.body], ['POST', { token: TOKEN }]);
  });

  it('a link opened signed out, and a link refused, each answer plainly', async () => {
    const out = fakeFetch((url) => (url.endsWith('account/email/confirm') ? [200, { changed: true, email: 'a@b.c', signedIn: false }] : null));
    const account = createMinnAccountCore({ baseUri: BASE, fetch: out.fn });
    assert.deepEqual(await account.confirmEmail({ token: TOKEN }), { ok: true, email: 'a@b.c', signedIn: false });
    assert.equal(out.calls.filter((c) => c.url.endsWith(NONCE_PATH)).length, 0, 'no nonce asked for a browser that is not signed in');
    const used = fakeFetch(() => [410, { code: 'email_change_used', message: 'This link was already used. Sign in with your new email.', fields: {} }]);
    const r = await createMinnAccountCore({ baseUri: BASE, fetch: used.fn }).confirmEmail({ token: TOKEN });
    assert.deepEqual([r.ok, r.code], [false, 'email_change_used']);
  });

  it('the card\'s words: the change, or why not in the site\'s words, or ours when the site is quiet', () => {
    assert.deepEqual(emailLinkOutcome({ ok: true, email: 'a@b.c' }), { outcome: 'changed', message: fillCopy(EMAIL_LINK_COPY.changed.body, { email: 'a@b.c' }) });
    assert.match(emailLinkOutcome({ ok: true, email: 'a@b.c' }).message, /a@b\.c/);
    assert.deepEqual(emailLinkOutcome({ ok: false, code: 'email_change_expired', message: 'This link has expired.' }), { outcome: 'failed', message: 'This link has expired.' });
    assert.deepEqual(emailLinkOutcome({ ok: false, code: 'email_exists', message: 'Taken.' }), { outcome: 'failed', message: 'Taken.' });
    assert.deepEqual(emailLinkOutcome({ ok: false, code: 'offline', message: 'x' }), { outcome: 'failed', message: EMAIL_LINK_COPY.failed.retry });
    assert.deepEqual(emailLinkOutcome(null), { outcome: 'failed', message: EMAIL_LINK_COPY.failed.retry });
    assert.equal(GATE_COPY['email-changed'].title, EMAIL_LINK_COPY.changed.title);
    assert.equal(GATE_COPY['email-failed'].title, EMAIL_LINK_COPY.failed.title);
    assert.doesNotMatch(JSON.stringify([EMAIL_LINK_COPY, SETTINGS_COPY.email]), /—/);
    assert.match(fillCopy(SETTINGS_COPY.email.sent, { email: 'n@x.y', current: 'o@x.y' }), /n@x\.y.*o@x\.y/);
  });

  it('the Account panel keeps showing the old email while a link waits', () => {
    const forms = read('public/js/account-forms.js');
    const submit = forms.slice(forms.indexOf("mailForm.addEventListener('submit'"), forms.indexOf("passForm.addEventListener('submit'"));
    assert.match(submit, /if \(r\.pending\) \{\n\s*\/\/[^\n]*\n\s*say\(fillCopy\(SETTINGS_COPY\.email\.sent, \{ email: r\.email, current: r\.current \|\| shownEmail \}\)\);\n\s*return;\n\s*\}/);
    assert.ok(submit.indexOf('if (r.pending)') < submit.indexOf('mailNow.textContent'), 'Now: changes only for an answer that changed it');
  });

  it('the gate confirms the link once, with the session in hand, drops it from the address bar, then carries on', () => {
    const boot = read('public/js/online-boot.js');
    const fn = boot.slice(boot.indexOf('async function boot('), boot.indexOf('/** How long the page waits'));
    const at = (s) => fn.indexOf(s);
    assert.ok(at('await quietSession(account)') < at('emailLinkFrom(location.hash)'), 'the session (and its nonce) first');
    const after = fn.slice(at('account.confirmEmail(emailLink)'));
    assert.ok(after.indexOf("history.replaceState(history.state, '', location.pathname);") > 0 && after.indexOf("history.replaceState(") < after.indexOf('showGate('), 'the link is spent: it leaves the address bar');
    assert.ok(at('emailLinkFrom(location.hash)') < at('const state = gateFor(session);'));
    assert.match(fn, /showGate\(gate, `email-\$\{outcome\}`, \{ account, onSignedIn: \(\) => boot\(\{ account \}\), message \}\);\n\s*return;/);
    assert.match(boot, /data-online-email-next/);
  });
});

describe('the site: the new email is held until its link is opened (groddle-afternoon-site)', { skip: skipWithoutSite }, () => {
  const src = (f) => readFileSync(sitePath('src', f), 'utf8');
  const manifest = skipWithoutSite ? {} : JSON.parse(readFileSync(sitePath('minn.json'), 'utf8'));

  it('groddle_email_changes keeps a token\'s hash, one row per login, never the token', () => {
    const t = manifest.tables.groddle_email_changes;
    assert.ok(t, 'declared in minn.json');
    for (const key of ['PRIMARY KEY  (token_hash)', 'UNIQUE KEY user_id (user_id)', 'KEY expires_at (expires_at)']) assert.ok(t.includes(key), key);
    for (const col of ['token_hash', 'user_id', 'email', 'sends', 'sent_at', 'created_at', 'expires_at', 'used_at', 'ip']) assert.ok(t.some((l) => l.startsWith(`${col} `)), col);
    assert.ok(!t.some((l) => /^(token|password|pass_hash) /.test(l)));
  });

  it('the PUT saves nothing: the password judged under the sign-in throttle, then the address checked, held and mailed to, 202', () => {
    const acct = src('PlayerAccount.php');
    const put = acct.slice(acct.indexOf('public function changeEmail('), acct.indexOf('public function confirmEmail('));
    const order = ['$this->passwordRefusal($login,', 'FILTER_VALIDATE_EMAIL', 'strcasecmp($email, $login->email)', '$this->emailTaken($email)', 'EmailChanges::sendRefusal(', "overHourCap($now, 'email change')", '$changes->hold($login->id, $email,', 'PlayerMail::confirmEmail(', '->mail($email, $subject, $html, $headers)', "$limits->record('email', $email,", "Response::json(['pending' => true, 'email' => $email, 'current' => $login->email], 202)"];
    let at = -1;
    for (const step of order) {
      const next = put.indexOf(step);
      assert.ok(next > at, `${step} in order`);
      at = next;
    }
    assert.doesNotMatch(put, /->changeEmail\(|->update\(|user_email/, 'no address is saved by the PUT');
    assert.match(put, /'\/play\/online\/#email=' \. \$token/);
    const check = acct.slice(acct.indexOf('private function passwordRefusal('));
    assert.match(check, /new \\Minn\\Auth\\LoginThrottle\(\$this->minn->db\)/);
    assert.ok(check.indexOf('->retryAfter($address)') < check.indexOf('Password::verify('), 'a throttled address is not even checked');
    assert.match(check, /\$throttle->recordFailure\(\$address\);/);
  });

  it('the link: once, for a day, then the address saved, reset links to the old one void, every session of the login ended, the old address told', () => {
    const acct = src('PlayerAccount.php');
    const confirm = acct.slice(acct.indexOf('public function confirmEmail('), acct.indexOf('private function passwordRefusal('));
    assert.match(acct, /#\[Route\(Method::Post, '\/groddle\/v1\/account\/email\/confirm', policy: new Policy\(Access::Public\)\)\]/);
    const order = ['EmailChanges::pending($row, $now)', '$users->findByEmail($email)', '$changes->spend($row, $now)', "$users->update($login->id, ['user_email' => $email, 'user_activation_key' => ''])", '$this->endSessions($siblings)', 'PlayerMail::emailChanged(', '->mail($old,'];
    let at = -1;
    for (const step of order) {
      const next = confirm.indexOf(step);
      assert.ok(next > at, `${step} in order`);
      at = next;
    }
    assert.match(confirm, /if \(\$me !== null && in_array\(\$me->id, \$siblings, true\)\) \{/, 'only a browser playing one of the login\'s characters stays signed in');
  });

  const engineDir = process.env.MINN_ENGINE_DIR || join(homedir(), 'Cove/Sites/minn-engine.localhost/public/minn');
  const hasPhp = HAS_PHP;
  function mysql() {
    const env = String(process.env.GRODDLE_TEST_MYSQL || '').trim();
    if (env) {
      const [host, user, ...pass] = env.split(/\s+/);
      return { host, user, pass: pass.join(' ') };
    }
    const cfg = join(homedir(), 'Cove/Sites/groddle.localhost/public/wp-config.php');
    if (!existsSync(cfg)) return null;
    const text = readFileSync(cfg, 'utf8');
    const def = (k) => text.match(new RegExp(`define\\(\\s*'${k}',\\s*'([^']*)'`))?.[1];
    const host = def('DB_HOST');
    const user = def('DB_USER');
    return host && user ? { host, user, pass: def('DB_PASSWORD') || '' } : null;
  }
  const db = mysql();
  const reachable = db && hasPhp && spawnSync(PHP, ['-r', 'mysqli_report(MYSQLI_REPORT_OFF); $m = @new mysqli($argv[1], $argv[2], $argv[3]); exit($m->connect_errno ? 1 : 0);', db.host, db.user, db.pass]).status === 0;
  const skipDb = phpSkip('mysqli')
    || (!existsSync(join(engineDir, 'src/Minn/Autoloader.php')) && 'Minn Engine not found (set MINN_ENGINE_DIR)')
    || (!reachable && 'no MariaDB to make a throwaway database on (set GRODDLE_TEST_MYSQL)');

  describe('on a throwaway database', { skip: skipDb }, () => {
    let r;
    before(() => {
      r = JSON.parse(execFileSync(PHP, [join(root, 'tests/fixtures/email-change/email-change.php'), engineDir, SITE_DIR, db.host, db.user, db.pass], { timeout: 90000 }).toString());
    });

    it('ran on its own database and dropped it', () => {
      assert.equal(r.error, undefined, r.error);
      assert.match(r.db, /^test_groddle_email_[0-9a-f]{8}$/);
      assert.equal(r.dropped, true);
    });

    it('the PUT refuses a wrong password, a bad or unchanged address and one another account has, holding nothing', () => {
      assert.deepEqual([r.put.wrongPassword.status, r.put.wrongPassword.body.code, Object.keys(r.put.wrongPassword.body.fields)], [400, 'incorrect_password', ['current']]);
      assert.deepEqual([r.put.badEmail.status, r.put.badEmail.body.code, Object.keys(r.put.badEmail.body.fields)], [400, 'invalid_email', ['email']]);
      assert.deepEqual([r.put.same.status, r.put.same.body.code], [400, 'email_same'], 'whatever its letter case');
      assert.deepEqual([r.put.taken.status, r.put.taken.body.code, Object.keys(r.put.taken.body.fields)], [400, 'email_exists', ['email']]);
      assert.equal(r.heldAfterRefusals, 0);
      assert.equal(r.throttle, 'counting');
      assert.deepEqual([r.throttled.status, r.throttled.body.code], [429, 'too_many_attempts'], 'wrong passwords count toward the sign-in throttle, as the engine\'s own check does');
    });

    it('held for the login with the token\'s hash, the address unchanged; a minute between links, five while one waits', () => {
      assert.deepEqual(r.held, { looks: true, storedHash: true, noToken: true, email: 'ada-new@example.com', sends: 1, ip: '2001:db8:abcd:12::/64', pending: true, unchanged: 'not-an-address' });
      assert.deepEqual([r.putWait.status, r.putWait.body.code], [429, 'email_change_wait'], 'asked from an extra character: the login\'s row counts');
      assert.deepEqual(r.sendRefusal, { afterGap: null, spent: 'spent', expiredStartsAfresh: null, none: null });
      assert.deepEqual([r.putSpent.status, r.putSpent.body.code], [429, 'email_change_spent']);
      assert.deepEqual(r.replaced, { oldLink: null, rows: 1, sends: 2, email: 'ada-newer@example.com' }, 'a newer ask replaces the older link and carries its count');
    });

    it('the link changes the login\'s email once, voids reset links, and ends every session of the login\'s characters only', () => {
      assert.deepEqual([r.confirm.garbage.status, r.confirm.garbage.body.code], [410, 'email_change_unknown']);
      assert.deepEqual([r.confirm.oldLink.status, r.confirm.oldLink.body.code], [410, 'email_change_unknown'], 'a replaced link does nothing');
      assert.deepEqual([r.confirm.ok.status, r.confirm.ok.body], [200, { changed: true, email: 'ada-newer@example.com', signedIn: false }]);
      assert.equal(r.after.email, 'ada-newer@example.com');
      assert.equal(r.after.extraUnchanged, true, 'an extra character signs in with its login\'s email');
      assert.equal(r.after.resetKeyCleared, true);
      assert.equal(r.after.otherResetKeyKept, true);
      assert.deepEqual(r.after.sessionsEnded, ['', ''], 'the login and its extra character: no session left');
      assert.equal(r.after.otherSessionsKept, true);
      assert.deepEqual([r.confirm.again.status, r.confirm.again.body.code], [410, 'email_change_used']);
    });

    it('an expired link, and an address taken while the link waited, change nothing', () => {
      assert.deepEqual([r.confirm.expired.status, r.confirm.expired.body.code], [410, 'email_change_expired']);
      assert.deepEqual([r.confirm.takenSince.status, r.confirm.takenSince.body.code], [409, 'email_exists']);
      assert.deepEqual(r.takenSinceLeftAlone, { email: 'dot@example.com', linkStillWaiting: true });
      assert.equal(r.purged, 0, 'rows go a week after they expire');
      assert.deepEqual(r.limits, { lifetime: 86400, keep: 604800, maxSends: 5, gap: 60, tokenShape: true });
    });

    it('the email goes to the new address in the site\'s look, naming the character, escaped', () => {
      assert.equal(r.mail.subject, 'Confirm your new Groddle Afternoon email');
      assert.match(r.mail.html, /Confirm your new email/);
      assert.match(r.mail.html, /Zz &lt;b&gt;Bold&lt;\/b&gt; &amp; Co/);
      assert.doesNotMatch(r.mail.html, /<b>Bold<\/b>/);
      assert.match(r.mail.html, /#email=(0a){24}/);
      assert.match(r.mail.html, /keeps its old email until then/);
      assert.deepEqual(r.mail.headers, ['Content-Type: text/html; charset=UTF-8', 'From: Groddle Afternoon <noreply@groddle.example>']);
      assert.doesNotMatch(r.mail.html, /—/);
    });
  });
});
