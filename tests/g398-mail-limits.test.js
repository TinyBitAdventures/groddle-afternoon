/**
 * Sign-up and email abuse safeguards (Austin 2026-10-28). The site side,
 * read from groddle-afternoon-site (skipped without it): src/MailLimits.php
 * (table groddle_mail_sends: password resets one a minute and five a day per
 * email, ten an hour per address; a site-wide hourly ceiling on sign-up and
 * reset emails, option groddle_mail_hour_cap; IPv6 counted by its /64, for
 * sign-ups too through src/Signups.php), src/Turnstile.php (Cloudflare
 * siteverify through Minn\Http, keys from groddle_turnstile_site_key /
 * groddle_turnstile_secret, off when unset) and the routes in
 * src/PlayerAccount.php. The game side: js/account-forms.js
 * (createAccountRequests, the widget slots, the script only with a site key).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { homedir } from 'node:os';

import { FORM_COPY, TURNSTILE_SCRIPT, createAccountRequests } from '../public/js/account-forms.js?v=g436-1';
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

describe('the game: the emailing forms carry a Turnstile token when the site has one', () => {
  it('asks the site which widgets to draw; a static server means none', async () => {
    const on = fakeFetch((url) => (url.endsWith('account/options') ? [200, { turnstile: '1x00000000000000000000AA' }] : null));
    assert.deepEqual(await createAccountRequests({ api: API, fetch: on.fn }).options(), { turnstile: '1x00000000000000000000AA' });
    assert.equal(on.calls[0].method, 'GET');
    const off = fakeFetch(() => [404, null]);
    assert.deepEqual(await createAccountRequests({ api: API, fetch: off.fn }).options(), {});
    const down = createAccountRequests({ api: API, fetch: async () => { throw new Error('offline'); } });
    assert.deepEqual(await down.options(), {});
  });

  it('New player, Send it again and Forgot send the token, never a nonce, and answer as minn-account does', async () => {
    const { fn, calls } = fakeFetch((url) => {
      if (url.endsWith('/players')) return [202, { pending: true, email: 'zz@x.y', name: 'Tess', nameHeld: false }];
      if (url.endsWith('/players/resend')) return [200, { sent: true }];
      if (url.endsWith('/password-reset')) return [429, { code: 'reset_wait', message: 'We just sent a link. Wait a minute, then ask again.', fields: {} }];
      return null;
    });
    const req = createAccountRequests({ api: API, fetch: fn });
    assert.deepEqual(await req.signUp({ email: 'zz@x.y', password: 'pw-123456', name: 'Tess', turnstile: 'tok-1' }), { ok: true, pending: true, email: 'zz@x.y', name: 'Tess', nameHeld: false });
    assert.deepEqual(await req.resendSignUp({ email: 'zz@x.y', turnstile: 'tok-2' }), { ok: true });
    assert.deepEqual(await req.requestPasswordReset('zz@x.y', 'tok-3'), { ok: false, code: 'reset_wait', message: 'We just sent a link. Wait a minute, then ask again.', fields: {} });
    assert.deepEqual(calls.map((c) => [c.url.slice(API.length), c.body.turnstile]), [['players', 'tok-1'], ['players/resend', 'tok-2'], ['password-reset', 'tok-3']]);
    for (const c of calls) {
      assert.equal(c.method, 'POST');
      assert.equal(c.credentials, 'same-origin');
      assert.ok(!('X-WP-Nonce' in c.headers), 'public routes, no nonce to go stale');
    }
    assert.deepEqual(calls[0].body, { email: 'zz@x.y', password: 'pw-123456', name: 'Tess', website: '', turnstile: 'tok-1' });
  });

  it('the card draws a slot per emailing form and loads Cloudflare\'s script only with a site key', () => {
    const forms = read('public/js/account-forms.js');
    assert.equal(TURNSTILE_SCRIPT, 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit');
    for (const which of ['signup', 'resend', 'forgot']) assert.match(forms, new RegExp(`${which}: el\\('div', \\{ class: 'acct-turnstile', 'data-account-turnstile': '${which}' \\}\\)`));
    assert.match(forms, /if \(typeof options\.turnstile === 'string' && options\.turnstile\) \{\n\s*turnstile = turnstileWidgets\(options\.turnstile, slots\);/, 'no key, no script');
    assert.equal((forms.match(/loadScript\(TURNSTILE_SCRIPT\)/g) || []).length, 1, 'loaded in one place');
    assert.match(forms, /appearance: 'interaction-only'/, 'shown only when Cloudflare needs the player');
    assert.match(forms, /withTurnstile\('signup', \(\) => account\.signUp\(values\)/, 'Turnstile off: the old call, unchanged');
    assert.match(forms, /withTurnstile\('forgot', \(\) => account\.requestPasswordReset\(email\)/);
    assert.match(forms, /withTurnstile\('resend', \(\) => account\.resendSignUp\(\{ email: pending\.email \}\)/);
    assert.match(forms, /turnstile\.reset\(which\);/, 'a token works once: the widget resets after each send');
    assert.doesNotMatch(JSON.stringify(FORM_COPY), /—/);
  });
});

describe('the site: email limits and Turnstile (groddle-afternoon-site)', { skip: skipWithoutSite }, () => {
  const src = (f) => readFileSync(join(SITE_DIR, 'src', f), 'utf8');
  const manifest = HAS_SITE ? JSON.parse(readFileSync(join(SITE_DIR, 'minn.json'), 'utf8')) : {};

  it('groddle_mail_sends keeps an email\'s hash, the address and whether a mail went, never the email', () => {
    const t = manifest.tables.groddle_mail_sends;
    assert.ok(t, 'declared in minn.json');
    for (const col of ['id', 'kind', 'email_hash', 'address', 'mailed', 'sent_at']) assert.ok(t.some((l) => l.startsWith(`${col} `)), col);
    assert.ok(!t.some((l) => /^email /.test(l)), 'never the address itself');
    for (const key of ['KEY kind_email (kind,email_hash,sent_at)', 'KEY kind_address (kind,address,sent_at)', 'KEY sent_at (sent_at)']) assert.ok(t.includes(key), key);
    assert.ok(manifest.needs.http.includes('https://challenges.cloudflare.com/turnstile/v0/siteverify'), 'outgoing HTTP to siteverify, by its full path');
    // Plain http only to the realtime server on this host (the admin teleport's call, AdminTeleport).
    assert.ok(manifest.needs.http.every((url) => /^(https:\/\/[^/]+|http:\/\/127\.0\.0\.1:\d+)\/.+/.test(url)), 'every grant a path, never a whole host');
  });

  it('a reset is checked, limited, recorded for player and stranger alike, and answered the same', () => {
    const acct = src('PlayerAccount.php');
    const reset = acct.slice(acct.indexOf('public function reset('), acct.indexOf('public function confirmReset('));
    const order = ['$this->turnstileRefusal($request, $body)', '$limits->purge($now)', 'MailLimits::resetDecision($limits->resetCounts($email, $request->remoteAddress, $now))', "$limits->overHourCap($now, 'password reset')", '->lostPassword($email, $link, $words)', "$limits->record('reset', $email, $request->remoteAddress, $sent === true, $now)"];
    let at = -1;
    for (const step of order) {
      const next = reset.indexOf(step);
      assert.ok(next > at, `${step} in order`);
      at = next;
    }
    assert.match(reset, /if \(\$decision === 'wait'\) \{\n\s*return self::refused\('reset_wait', self::WORDS\['reset_wait'\], \[\], 429\);/);
    assert.match(reset, /if \(\$decision === 'quiet'\) \{\n\s*return Response::json\(\['sent' => true\]\);/, 'a stopped ask reads as sent');
    assert.match(reset, /return Response::json\(\['sent' => true\]\);\n\s*\}\n$/m);
  });

  it('sign-ups: Turnstile after the QA shortcut, the ceiling before the mail, each mail counted; resend by email needs Turnstile too', () => {
    const acct = src('PlayerAccount.php');
    const create = acct.slice(acct.indexOf('public function create('), acct.indexOf('public function verify('));
    assert.ok(create.indexOf('return $this->makeNow(') < create.indexOf('$this->turnstileRefusal('), 'local QA addresses skip Turnstile (other lanes\' throwaways keep working)');
    assert.ok(create.indexOf("$limits->overHourCap($now, 'sign-up')") < create.indexOf('$this->mailLink('));
    assert.match(create, /\$limits->record\('signup', \$email, \$request->remoteAddress, true, \$now\);/);
    const resend = acct.slice(acct.indexOf('public function resend('), acct.indexOf('private function makeNow('));
    const byEmail = resend.slice(resend.indexOf("$email = trim((string) ($body['email']"));
    assert.ok(byEmail.indexOf('$this->turnstileRefusal($request, $body)') > 0 && byEmail.indexOf('$this->turnstileRefusal(') < byEmail.indexOf('$signups->byEmail($email)'), 'checked before anything is looked up');
    assert.equal((resend.match(/overHourCap\(\$now, 'sign-up'\)/g) || []).length, 2, 'the ceiling on both kinds of resend');
    const signups = src('Signups.php');
    assert.match(signups, /\$key = MailLimits::addressKey\(\$address\);/, 'sign-ups per address count an IPv6 /64');
    assert.match(signups, /self::time\(\$now \+ self::LIFETIME\), MailLimits::addressKey\(\$address\),/, 'and are stored so');
  });

  it('the secret stays on the server: options hands out the site key only', () => {
    const acct = src('PlayerAccount.php');
    const options = acct.slice(acct.indexOf('public function options('), acct.indexOf('private function turnstileRefusal('));
    assert.match(acct, /#\[Route\(Method::Get, '\/groddle\/v1\/account\/options', policy: new Policy\(Access::Public\)\)\]/);
    assert.doesNotMatch(options, /secret/i);
    const turnstile = src('Turnstile.php');
    assert.match(turnstile, /public function siteKey\(\): string\n\s*\{\n\s*return \$this->enabled\(\) \? \$this->siteKey : '';/);
    assert.doesNotMatch(turnstile + src('MailLimits.php'), /error_log\([^;]*secret/i, 'never logged');
    assert.match(turnstile, /\$http->post\(self::VERIFY_URL, form: \$form, timeout: 8\.0, redirects: 0, maxBytes: 65536\)/, 'through Minn\\Http');
  });

  it('runs no WordPress function', () => {
    for (const f of ['MailLimits.php', 'Turnstile.php']) assert.doesNotMatch(src(f), /\b(?:get_option|update_option|wp_[a-z_]+|esc_[a-z]+|\$wpdb)\s*\(/, f);
  });

  const engine = process.env.MINN_ENGINE_DIR || join(homedir(), 'Cove/Sites/minn-engine.localhost/public/minn');
  const noEngine = !existsSync(join(engine, 'src/Minn/Autoloader.php')) && 'Minn Engine not found (set MINN_ENGINE_DIR)';

  it('the rules: /64 for IPv6, the reset decision, the ceiling option, Turnstile\'s answers (php)', { skip: noEngine }, () => {
    const out = JSON.parse(execFileSync('php', [join(root, 'tests/fixtures/minn-accounts/mail-limits.php'), engine, SITE_DIR], { encoding: 'utf8' }));
    assert.deepEqual(out.addresses, {
      '203.0.113.7': '203.0.113.7',
      '2001:db8:abcd:12:1:2:3:4': '2001:db8:abcd:12::/64',
      '2001:DB8:ABCD:12:ffff::9': '2001:db8:abcd:12::/64',
      '2001:db8:abcd:13::1': '2001:db8:abcd:13::/64',
      '::ffff:198.51.100.2': '198.51.100.2',
      '::1': '::/64',
      '': '',
      'not an address': 'not an address',
    });
    assert.deepEqual(out.email, [true, 64]);
    assert.deepEqual(out.decision, { fresh: 'send', sameBrowser: 'wait', otherBrowserMinute: 'quiet', dayFour: 'send', dayFive: 'quiet', addressNine: 'send', addressTen: 'quiet' });
    assert.deepEqual(out.cap, [300, 50, 1200, 300, 300, 300]);
    assert.deepEqual(out.limits, { gap: 60, day: 5, addressHour: 10, hourCap: 300, keep: 172800, option: 'groddle_mail_hour_cap' });
    assert.deepEqual(out.words, { busy: 'We\'re sending a lot of emails right now. Try again in a few minutes.', wait: 'We just sent a link. Wait a minute, then ask again.', failed: 'We couldn\'t check that you\'re a person. Try again.' });
    const t = out.turnstile;
    assert.deepEqual([t.off.result, t.off.requests, t.offKey, t.onKey], [true, 0, '', '1x00000000000000000000AA'], 'off unless both keys are set');
    assert.deepEqual([t.pass.result, t.pass.method, t.pass.form, t.pass.secretSent, t.pass.response, t.pass.remoteip], [true, 'POST', ['secret', 'response', 'remoteip'], true, 'XXXX.DUMMY.TOKEN.XXXX', '203.0.113.7']);
    assert.equal(t.fail.result, false);
    assert.equal(t.truthy.result, false, 'only success === true passes');
    assert.deepEqual([t.empty.result, t.empty.requests, t.long.result, t.long.requests], [false, 0, false, 0], 'no token, no request');
    assert.deepEqual([t.down.result, t.unreachable.result], ['unavailable', 'unavailable']);
    assert.deepEqual(t.noAddress.form, ['secret', 'response']);
  });
});
