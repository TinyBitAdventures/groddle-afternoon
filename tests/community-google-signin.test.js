/**
 * Website boards (Friendly, /chat/bugs/9 "Sign in for community doesn't offer google as a choice"),
 * groddle-afternoon-site: the boards' sign-in panel (community/community.js wireSignIn, the boxes
 * src/CommunityPages.php signInLinks marks data-community-signin) carries Continue with Google when the
 * site has a Google client id, as the game's forms do (public/js/account-forms.js): the id from
 * groddle/v1/account/options, Google's own button, the credential to groddle/v1/account/google
 * (src/GoogleSignIn.php) and a new player's name step through account/google/finish.
 * Run: node --test tests/community-google-signin.test.js (GRODDLE_SITE_DIR=<site checkout> for a lane's).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { sitePath, skipWithoutSite } from '../tools/repos.mjs';
import { GOOGLE_SCRIPT, googleButtonOptions as gameButtonOptions, googleOutcome } from '../public/js/account-forms.js?v=29e9e2c3';

const src = (p) => readFileSync(sitePath(p), 'utf8');
/** One exported function of community.js, run here (the module itself needs a page). */
function pick(js, name) {
  const code = js.match(new RegExp(`export function ${name}\\([\\s\\S]*?\\n\\}\\n`))?.[0];
  assert.ok(code, name);
  return new Function(`${code.replace(/^export /, '')}; return ${name};`)();
}

describe('the boards\' sign-in offers Continue with Google (/chat/bugs/9)', { skip: skipWithoutSite }, () => {
  it('asks the site for the client id the game uses, and loads Google only when there is one and a form is opened', () => {
    const js = src('community/community.js');
    assert.match(js, /call\('account\/options'\)\.then\(\(r\) => \(r\.ok && typeof r\.data\?\.google === 'string' \? r\.data\.google : ''\), \(\) => ''\)/);
    assert.match(js, new RegExp(`const GOOGLE_SCRIPT = '${GOOGLE_SCRIPT.replace(/[/.]/g, '\\$&')}';`), 'the game\'s Google script');
    const start = js.slice(js.indexOf('async function startGoogle('), js.indexOf('async function onGoogleCredential('));
    assert.match(start, /const clientId = await googleClientId\(\);\n\s*if \(!clientId\) return;\n\s*const gis = await googleScript\(\);/);
    assert.match(start, /if \(!googleForms\.inited\) \{/, 'initialised once a page');
    assert.match(start, /client_id: clientId, callback: \(r\) => onGoogleCredential\(r\?\.credential\), ux_mode: 'popup'/);
    // The toggle opens the form, makes it the one Google answers, and starts the button.
    assert.match(js, /googleForms\.active = form;\n\s*startGoogle\(form\);/);
    // The site's answer to account/options carries the id (null when off).
    assert.match(src('src/PlayerAccount.php'), /'google' => \$google !== '' \? \$google : null/);
  });

  it('draws Google\'s button as the game does, above the email with an "or"', () => {
    const js = src('community/community.js');
    const options = pick(js, 'googleButtonOptions');
    for (const w of [100, 320, 448, 900]) assert.deepEqual(options(w), gameButtonOptions(w), `width ${w}`);
    assert.match(js, /form\.innerHTML = '<div class="csignin-google" data-community-google hidden><div data-community-google-button><\/div><div class="csignin-or" aria-hidden="true">' \+ SAID\.google\.or \+ '<\/div><\/div>'\n\s*\+ '<label class="clabel" for="csignin-email">Email<\/label>/);
    const css = src('community/community.css');
    assert.match(css, /\.csignin-google\[hidden\] \{ display: none; \}/);
    assert.match(css, /\.csignin-or::before, \.csignin-or::after \{ content: ''; flex: 1; border-top: 1px solid var\(--border\); \}/);
  });

  it('signs in through the game\'s routes: the credential, then a new player\'s name', () => {
    const js = src('community/community.js');
    const answer = pick(js, 'googleAnswer');
    assert.equal(answer({ ok: true, status: 200, data: { signedIn: true, player: { id: 5 } } }), 'signed-in');
    assert.equal(answer({ ok: true, status: 202, data: { pending: 'p.1', email: 'a@b.c', name: 'Ada' } }), 'name');
    assert.equal(answer({ ok: false, status: 403, data: { code: 'google_staff', message: 'x' } }), 'refused');
    assert.equal(answer({ ok: false, status: 0, data: { message: 'x' } }), 'refused');
    assert.equal(answer({ ok: true, status: 202, data: {} }), 'refused', 'a 202 with no pending token');
    // The game reads the same answers the same way.
    assert.equal(googleOutcome({ ok: true, pending: 'p.1' }), 'name');
    assert.match(js, /const r = await call\('account\/google', \{ method: 'POST', body: \{ credential, remember: true \} \}\);/);
    assert.match(js, /if \(answer === 'signed-in'\) return location\.reload\(\);/);
    assert.match(js, /const r = await call\('account\/google\/finish', \{ method: 'POST', body: \{ pending: named\.pending \|\| '', name: named\.querySelector\('input\[name="name"\]'\)\.value, remember: true \} \}\);/);
    // The name form posts where its script does (password managers, ticket 239), with the game's field.
    assert.match(js, /named\.method = 'post';\n\s*named\.action = '\/wp-json\/groddle\/v1\/account\/google\/finish';/);
    assert.match(js, /name="name" type="text" autocomplete="nickname" maxlength="19"/);
    // An expired or used pending token goes back to the sign-in with the site's words.
    assert.match(js, /if \(r\.status === 410\) \{/);
    // The routes exist with those answers.
    const google = src('src/GoogleSignIn.php');
    assert.match(google, /#\[Route\(Method::Post, '\/groddle\/v1\/account\/google', policy: new Policy\(Access::Public\)\)\]/);
    assert.match(google, /#\[Route\(Method::Post, '\/groddle\/v1\/account\/google\/finish', policy: new Policy\(Access::Public\)\)\]/);
    assert.match(google, /return Response::json\(\['pending' => \$this->pendingToken\(\$sub, \$email, time\(\)\), 'email' => \$email, 'name' => \$suggested\], 202\);/);
  });

  it('uses the game\'s words, with no em dashes', () => {
    const js = src('community/community.js');
    const forms = readFileSync(new URL('../public/js/account-forms.js', import.meta.url), 'utf8');
    for (const words of ["Google sign-in didn\\'t work. Try again, or use your email.", 'Choose your character name', 'Make my character', 'Use my email instead']) {
      assert.ok(js.includes(words), words);
      assert.ok(forms.includes(words), `the game says ${words}`);
    }
    const block = js.slice(js.indexOf('// —— Continue with Google'), js.indexOf('wireSignIn(document);', js.indexOf('// —— Continue with Google')));
    assert.doesNotMatch(block.replace(/^\/\/ —— Continue with Google[^\n]*\n/, ''), /—/);
    assert.ok(Number(src('src/CommunityPages.php').match(/public const ASSET_KEY = 'community-(\d+)';/)?.[1]) >= 16, 'community-16 or later');
  });
});
