/**
 * LANDSCAPE short screens (lane landscape's audit, 2026-11-13, findings 7, 8 and 10): a phone held
 * sideways is 335 to 430 px tall. The notices step beside the avatar instead of standing on it
 * (js/notify-view.js noticesBesideAvatar), the vitals menu stops above the pack row and scrolls, and
 * the street's name stays in the top row sideways under 760 px wide (style.css LANDSCAPE-HUD).
 * Run: node --test tests/landscape-short-hud.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BESIDE_MIN_W, NOTICE_W, SHORT_SCREEN_H, noticesBesideAvatar } from '../public/js/notify-view.js?v=d7c296c6';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');
const css = read('public/style.css');
const game = read('public/game.js');
const block = css.slice(css.indexOf('/* === LANDSCAPE-HUD (land1) === */'), css.indexOf('/* === end LANDSCAPE-HUD === */'));
// 667 x 335 (the SE, Safari's bar showing): the centred stack and the avatar under it.
const SE = { rootW: 667, rootH: 335 };
const stack = { left: 113, right: 553, top: 124, bottom: 203 };
const avatar = { left: 280, top: 138, right: 330, bottom: 209 };

describe('the notices on a short screen keep clear of the avatar', () => {
  it('over the avatar they stand in a column on the roomier side, hugging it', () => {
    const side = noticesBesideAvatar({ ...SE, rect: stack, avatar });
    assert.ok(side);
    assert.equal(side.left, avatar.right + 10);
    assert.ok(side.width >= BESIDE_MIN_W && side.width <= NOTICE_W);
    assert.ok(side.left + side.width <= SE.rootW - 8);
  });
  it('the column stops short of Jump and the stick, and of a notch', () => {
    const jump = { left: 580, top: 175, right: 656, bottom: 251 };
    const stick = { left: 16, top: 150, right: 120, bottom: 254 };
    const side = noticesBesideAvatar({ ...SE, rect: stack, avatar, keepOut: [stick, jump] });
    assert.ok(side.left + side.width <= jump.left - 10, 'never over Jump');
    const notched = noticesBesideAvatar({ ...SE, rect: stack, avatar: { ...avatar, left: 420, right: 470 }, safeL: 59 });
    assert.ok(notched.left >= 59 + 8);
  });
  it('clear of the avatar, on a tall window, or with no room either side: it stays where it was', () => {
    assert.equal(noticesBesideAvatar({ ...SE, rect: { ...stack, bottom: 120 }, avatar }), null);
    assert.equal(noticesBesideAvatar({ rootW: 1280, rootH: 800, rect: stack, avatar }), null);
    assert.equal(SHORT_SCREEN_H, 520);
    assert.equal(noticesBesideAvatar({ rootW: 420, rootH: 335, rect: stack, avatar: { left: 180, top: 138, right: 240, bottom: 209 } }), null);
  });
  it('game.js hands the notices the avatar\'s box', () => {
    assert.match(game, /avatarBox: \(\) => \(state\.started \? avatarOnRoot\(\)\?\.box \|\| null : null\),/);
    assert.match(game, /box: \{ left, top, right: left \+ b\.width \* sx, bottom \}/);
  });
});

describe('G878 (#425): a notice column beside the avatar keeps its side while notices are up', () => {
  const W = { rootW: 812, rootH: 402 };
  const centred = { left: 186, right: 626, top: 90, bottom: 170 };
  const at = (x) => ({ left: x, top: 100, right: x + 50, bottom: 180 });
  it('walking across the middle, the column stays on the side it opened on', () => {
    let hold = noticesBesideAvatar({ ...W, rect: centred, avatar: at(390) });
    assert.equal(hold.side, 'left', 'opened on the roomier side');
    // Unheld, a few steps left flips it to the other side: the jump the report saw.
    assert.equal(noticesBesideAvatar({ ...W, rect: centred, avatar: at(360) }).side, 'right');
    for (let x = 390; x >= 200; x -= 4) {
      hold = noticesBesideAvatar({ ...W, rect: centred, avatar: at(x), hold });
      assert.equal(hold.side, 'left', `x ${x}`);
      assert.ok(hold.left + hold.width <= x - 10, 'never over the avatar');
    }
  });
  it('it keeps its place as the avatar walks away, and is pushed only when the avatar walks into it', () => {
    const first = noticesBesideAvatar({ ...W, rect: centred, avatar: at(560) });
    assert.deepEqual(first, { left: 110, width: 440, side: 'left' });
    const away = noticesBesideAvatar({ ...W, rect: centred, avatar: at(640), hold: first });
    assert.equal(away.left, first.left, 'no slide with each step');
    const into = noticesBesideAvatar({ ...W, rect: centred, avatar: at(500), hold: away });
    assert.equal(into.side, 'left');
    assert.equal(into.left + into.width, 500 - 10, 'pushed along, still clear of the avatar');
  });
  it('a held column stays beside even where the centred stack would miss the avatar; its side out of room, it changes once', () => {
    const hold = noticesBesideAvatar({ ...W, rect: centred, avatar: at(390) });
    assert.equal(noticesBesideAvatar({ ...W, rect: centred, avatar: { ...at(390), top: 300, bottom: 380 } }), null);
    assert.equal(noticesBesideAvatar({ ...W, rect: centred, avatar: { ...at(390), top: 300, bottom: 380 }, hold }).side, 'left');
    const squeezed = noticesBesideAvatar({ ...W, rect: centred, avatar: at(150), hold });
    assert.equal(squeezed.side, 'right');
  });
  it('the view holds it for the notices\' life and forgets it when they are gone', () => {
    const view = read('public/js/notify-view.js');
    assert.match(view, /keepOut: zones\.keepOut, hold: besideHold \}\)/);
    // G921: a band between the touch controls is centred, never held.
    assert.match(view, /setBeside\(band \|\| \(rect === centred \? null : side\)\);\n    besideHold = rect === centred \|\| band \? null : side;/);
    assert.match(view, /shownBox = null;\n      \/\/ G878: [^\n]*\n      besideHold = null;\n      return;/);
  });
});

describe('the vitals menu and the street name on a short screen', () => {
  it('the vitals menu stops above the pack row and scrolls', () => {
    const i = block.indexOf('[data-ui="modern"] .top-bar .vitals-menu {');
    const rule = block.slice(i, block.indexOf('}', i));
    assert.match(rule, /max-height: calc\(100dvh - var\(--hud-h\) - 16px - 80px - var\(--safe-t\) - var\(--safe-b\)\)/);
    assert.match(rule, /overflow-y: auto/);
  });
  it('sideways under 760 px the name stays in the top row unless squeezed', () => {
    assert.match(block, /@media \(max-width: 760px\) and \(orientation: landscape\) \{\n\s*:root\.touch-phone\[data-ui="modern"\] \.street-nameplate\.is-placed:not\(\.is-under\) \{\n\s*top: calc\(var\(--space-1\) \+ var\(--safe-t\)\); left: var\(--plate-x\); transform: none; max-width: var\(--plate-room\);/);
  });
});
