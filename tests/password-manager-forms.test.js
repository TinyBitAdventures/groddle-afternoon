/**
 * Ticket 239: password managers (Proton Pass) did not take our sign-in for one. The game's account
 * forms and the website's /chat/ sign-in now post to the route their script calls (still sent by
 * the script), the identifier is the username (an email field), passwords keep current-password
 * and new-password, and the sign-up's hidden trap is marked for managers to leave alone.
 * Run: node --test tests/password-manager-forms.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SITE_DIR, skipWithoutSite } from '../tools/repos.mjs';

const root = join(import.meta.dirname, '..');
const forms = readFileSync(join(root, 'public/js/account-forms.js'), 'utf8');

describe('the game\'s account forms', () => {
  it('every form posts to its own site route', () => {
    assert.match(forms, /const formTarget = \(route\) => \(\{ method: 'post', action: new URL\(`wp-json\/groddle\/v1\/\$\{route\}`, document\.baseURI\)\.pathname \}\);/);
    for (const [form, route] of [['signin', 'session'], ['signup', 'players'], ['forgot', 'password-reset'], ['reset', 'password-reset/confirm'], ['verify', 'players/verify'], ['google', 'account/google/finish'], ['email', 'account/email'], ['password', 'account/password']]) {
      assert.match(forms, new RegExp(`'data-form': '${form}', \\.\\.\\.formTarget\\('${route.replace(/\//g, '\\/')}'\\)`), form);
    }
    assert.equal((forms.match(/el\('form', \{/g) || []).length, (forms.match(/\.\.\.formTarget\(/g) || []).length, 'no form without a target');
  });

  it('the email is the username; passwords say which', () => {
    assert.match(forms, /const siEmail = field\(`acct-si-email-\$\{n\}`, 'Email', \{ name: 'email', type: 'email', autocomplete: 'username',/);
    assert.match(forms, /const suEmail = field\(`acct-su-email-\$\{n\}`, 'Email', \{ name: 'email', type: 'email', autocomplete: 'username',/);
    assert.match(forms, /const siPass = field\([^\n]*autocomplete: 'current-password'/);
    assert.match(forms, /const suPass = field\([^\n]*autocomplete: 'new-password'/);
  });

  it('the trap is never taken for a credential', () => {
    const trap = forms.match(/const trapInput = el\('input', \{[^\n]*\}\);/)?.[0] || '';
    for (const mark of ["autocomplete: 'off'", "'data-protonpass-ignore': 'true'", "'data-1p-ignore': 'true'", "'data-lpignore': 'true'", "'data-bwignore': 'true'"]) assert.ok(trap.includes(mark), mark);
  });
});

describe('the website\'s /chat/ sign-in', { skip: skipWithoutSite }, () => {
  it('posts to the session route with a username field', () => {
    const js = readFileSync(join(SITE_DIR, 'community/community.js'), 'utf8');
    assert.match(js, /form\.method = 'post';\n\s+form\.action = '\/wp-json\/groddle\/v1\/session';/);
    assert.match(js, /id="csignin-email" name="email" type="email" autocomplete="username" required/);
    assert.match(js, /id="csignin-pass" name="password" type="password" autocomplete="current-password" required/);
  });
});
