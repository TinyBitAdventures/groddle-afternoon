/**
 * Friendly's follow-up on #284 (iPhone): with the full game remembered (localStorage groddle-play-device
 * "full"), Play always opened the game and there was no easy way back to the phone page's reports, mail
 * and friends. On a phone the Menu has a row that opens play/phone/ without forgetting the choice; the
 * phone page keeps its Play the game (and, on a touch tablet that remembers it, "Use this page instead").
 * Since 2026-11-13 a phone sees the phone page first on every load (tests/phone-companion.test.js).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { MENU_ROWS, PHONE_PAGE_LABEL, menuRowFor, phonePageHref } from '../public/js/ui/topbar.js?v=23c2cb54';
import { fullGameHref } from '../public/js/phone/companion-data.js?v=9e02f28c';

const root = join(import.meta.dirname, '..');
const topbar = readFileSync(join(root, 'public/js/ui/topbar.js'), 'utf8');
const companion = readFileSync(join(root, 'public/js/phone/companion.js'), 'utf8');

describe('Friendly on #284: the phone page from the Menu', () => {
  it('solo goes to the phone page with from=solo, so its full-game link comes back to solo', () => {
    assert.equal(phonePageHref('solo'), 'play/phone/?from=solo');
    assert.equal(fullGameHref('?from=solo'), 'play/');
    assert.equal(phonePageHref('multiplayer'), 'play/phone/');
    assert.equal(fullGameHref(''), 'play/online/');
  });

  it('the row sits in Settings before Sign out, and says where it goes', () => {
    assert.deepEqual(menuRowFor('phone-page-btn'), { group: 'settings', rank: 2.5 });
    assert.ok(MENU_ROWS['phone-page-btn'].rank < MENU_ROWS['signout-btn'].rank);
    assert.equal(PHONE_PAGE_LABEL, 'Phone page: reports, mail, friends');
  });

  it('is added on a phone only (either skin), as a link, and never touches the stored choice', () => {
    const fn = topbar.slice(topbar.indexOf('function installPhonePageRow(doc) {'), topbar.indexOf('function installTopOverflow(doc) {'));
    assert.match(fn, /!doc\.documentElement\?\.classList\?\.contains\('touch-phone'\)/);
    assert.match(fn, /doc\.createElement\('a'\)/);
    assert.match(fn, /dataset\?\.mode === 'multiplayer'/);
    assert.doesNotMatch(fn, /localStorage|groddle-play-device/);
    assert.match(topbar, /installPhoneRows\(doc\);\n  installPhonePageRow\(doc\);/);
  });

  it('the phone page, opened on a tablet that chose the game, still offers the full game and the way back', () => {
    const fn = companion.slice(companion.indexOf('function mountPlay(host) {'), companion.indexOf('/** The note under the panels'));
    assert.match(fn, /if \(storeGet\(\) === 'full'\) \{/);
    assert.match(fn, /el\('a', \{ href: fullGameHref\(location\.search\), class: 'pc-button', 'data-phone-full': '' \}, T\.full\)/);
    assert.match(fn, /'data-phone-use-page': ''/);
  });
});
