/**
 * G1235 (#636): a player on the phone page could not reach Account (email, password, Change name)
 * or write the profile description: both live in the game's Menu > Account, and the phone page had
 * only Reports, Mail and Friends. Glitch kept both on its website (TSFrontController.as opened
 * root_url + 'account/' and root_url + 'profiles/' + tsid), not in the client. The phone page now has
 * an Account tab with the game's own forms and Your profile, loaded at its first opening.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PHONE_TEXT } from '../public/js/phone/companion-data.js?v=fbe7f87a';
import { createMinnAccountCore } from '../public/js/minn-account-core.js?v=5baee954';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, 'public', p), 'utf8');

describe('the phone page\'s Account tab (#636)', () => {
  it('is a fourth tab beside Reports, Mail and Friends', () => {
    assert.equal(PHONE_TEXT.tabs.account, 'Account');
    const page = read('js/phone/companion.js');
    assert.match(page, /const TABS = \['reports', 'mail', 'friends', 'account'\];/);
    assert.match(page, /if \(id === 'account'\) loadAccount\(\);/);
    assert.match(read('play/phone/phone.css'), /\.pc-tabs \{ display: grid; grid-template-columns: repeat\(4, 1fr\);/);
  });

  it('loads its module at the first opening, not with the page', () => {
    const page = read('js/phone/companion.js').replace(/\/\*[\s\S]*?\*\//g, '');
    assert.match(page, /import\('\.\/account-tab\.js\?v=[0-9a-f]+'\)/);
    assert.doesNotMatch(page, /from '\.\/account-tab\.js/);
    assert.doesNotMatch(page, /from '\.\.\/change-name\.js/);
  });

  it('mounts the game\'s own email and password forms, Change name and Your profile', () => {
    const mod = read('js/phone/account-tab.js');
    assert.match(mod, /mountAccountSettings\(forms, \{ account, email: session\?\.account\?\.email \|\| '' \}\);/);
    assert.match(mod, /mountChangeName\(forms\.querySelector\('\[data-account-settings\]'\) \|\| forms, \{/);
    assert.match(mod, /return mountPhoneProfile\(host, \{ account, doc \}\);/);
    assert.match(mod, /account\.saveAbout\(area\.value\)/);
    // Plain words, no em dashes.
    assert.doesNotMatch(mod, /—/);
  });

  it('the account core has the profile calls the tab makes, the same route as the game\'s', async () => {
    const asked = [];
    const fetch = async (url, init = {}) => {
      asked.push([String(url), init.method || 'GET', init.body ? JSON.parse(init.body) : null]);
      return { ok: true, status: 200, headers: { get: () => 'application/json' }, json: async () => ({ about: 'hi', aboutMax: 500 }), text: async () => '{"about":"hi","aboutMax":500}' };
    };
    const core = createMinnAccountCore({ baseUri: 'https://groddle.localhost/', fetch, nonce: 'abcdef1234' });
    assert.equal(typeof core.profile, 'function');
    assert.equal(typeof core.saveAbout, 'function');
    assert.equal(typeof core.nameChange, 'function');
    await core.saveAbout('A few words').catch(() => {});
    const put = asked.find(([u, m]) => /profile/.test(u) && m === 'PUT');
    assert.ok(put, JSON.stringify(asked));
    assert.deepEqual(put[2], { about: 'A few words' });
  });

  it('the game\'s account still has them (moved to the core, not copied)', () => {
    const game = read('js/minn-account.js');
    assert.doesNotMatch(game, /async profile\(\)|async saveAbout\(/);
    assert.ok(statSync(join(root, 'public/js/phone/account-tab.js')).size < 8 * 1024);
  });
});
