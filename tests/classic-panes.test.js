/**
 * The Classic chat column's panes (public/js/classic/classic-panes.js; RightSideView.as, ChatArea.as):
 * "Local Chat / Activity" is always the bottom pane, another chat opens above it online, each title
 * row has the unread pill, and the Social drawer stays the one owner of the chats.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pillText, paneLayout, LOCAL_TABS, nameSlot, NAME_COLOURS, STRIP_OPEN_MIN_W, dividerHeight, PANE_MIN_H } from '../public/js/classic/classic-panes.js?v=a7cfdbca';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

describe('Classic panes', () => {
  it('the unread pill: none at 0, the number, "∞" past 99 (ChatArea.as)', () => {
    assert.deepEqual([0, 1, 99, 100, -3].map(pillText), ['', '1', '99', '∞', '']);
  });

  it('Local Chat / Activity at the bottom; another chat above it, online only', () => {
    assert.deepEqual(LOCAL_TABS, ['local', 'activity']);
    assert.deepEqual(paneLayout({ online: false, tab: 'activity' }), { upper: false, lowerOwn: false, mergeLocal: false });
    assert.deepEqual(paneLayout({ online: true, tab: 'local' }), { upper: false, lowerOwn: false, mergeLocal: true });
    assert.deepEqual(paneLayout({ online: true, tab: 'party' }), { upper: true, lowerOwn: true, mergeLocal: false });
    assert.deepEqual(paneLayout({ online: true, tab: 'buddies' }), { upper: true, lowerOwn: true, mergeLocal: false });
  });

  it('the drawer draws both views of the logs (logNodes) and says when it redraws (onRender)', () => {
    const drawer = read('public/js/ui/social-drawer.js');
    assert.match(drawer, /logNodes\(ids = \[\]\) \{/);
    assert.match(drawer, /onRender\(fn\) \{/);
    const panes = read('public/js/classic/classic-panes.js');
    assert.match(panes, /d\.logNodes\(LOCAL_TABS\)/);
    // Words said in the lower pane go through the drawer's own form, so the game's submit handler hears them.
    assert.match(panes, /form\.requestSubmit\(\)/);
  });

  it('the 2012 values: the 12 px scrollbar, the pill, the column radius and shadow', () => {
    const css = read('public/css/classic.css');
    assert.match(css, /::-webkit-scrollbar \{ width: 12px; \}/);
    assert.match(css, /\.classic-pane-pill \{[^}]*min-width: 21px;[^}]*height: 14px;[^}]*background: var\(--c-classic-unread-pane\);/);
    assert.match(css, /box-shadow: 1px 0 1px color-mix\(in srgb, var\(--c-classic-ink\) 20%, transparent\);/);
    const style = read('public/style.css');
    for (const [n, v] of [['chat-track', 'ecf0f1'], ['chat-handle', 'cfdcdd'], ['activity-bar', '7aa2a4'], ['time-rule', 'bebebe']]) assert.match(style, new RegExp(`--c-classic-${n}: #${v};`), n);
  });

  it('names take a colour each in the order they first speak, round robin (RightSideManager.as 125-132)', () => {
    const seen = new Map();
    assert.deepEqual(['Jade', 'Gabi', 'Jade', 'Mocha', 'A', 'B', 'C', 'D'].map((n) => nameSlot(seen, n)), [0, 1, 0, 2, 3, 4, 5, 0]);
    assert.equal(NAME_COLOURS, 6);
    const style = read('public/style.css');
    for (let i = 0; i < NAME_COLOURS; i++) assert.match(style, new RegExp(`--c-classic-name-${i}: #[0-9a-f]{6}; +/\\* FROM FRAME`), `name ${i}`);
  });

  it('the chat type is measured off the frame and grows with u', () => {
    const style = read('public/style.css');
    assert.match(style, /--fs-classic-chat: var\(--fs-md\); +\/\* 13px, FROM FRAME ref\/blog-2011-chat-sidebar\.png/);
    assert.match(style, /--fs-classic-pane: var\(--fs-xl\); +\/\* 18px, FROM FRAME/);
    const css = read('public/css/classic.css');
    assert.match(css, /font-size: calc\(var\(--fs-classic-chat\) \* var\(--cu-n, 1\)\);/);
    assert.match(read('public/js/classic/classic-frame.js'), /setProperty\('--cu-n', u\)/);
  });

  it('the contact strip opens to 165u where the world keeps its 960 (430u column)', () => {
    assert.equal(STRIP_OPEN_MIN_W, 1430);
    const css = read('public/css/classic.css');
    assert.match(css, /:root\[data-ui="classic"\]\[data-classic-strip="open"\] \{ --cu-c: 470; \}/);
    assert.match(read('public/js/classic/classic-panes.js'), /'Playing with friends is much more fun\.'/);
  });

  it('the divider drags, each pane at least 100 px (RightSideView.as 1195-1235, ChatArea.as 64)', () => {
    assert.equal(PANE_MIN_H, 100);
    assert.equal(dividerHeight(300, 700), 300);
    assert.equal(dividerHeight(20, 700), 100, 'the upper pane keeps 100');
    assert.equal(dividerHeight(680, 700), 700 - 100 - 13, 'the lower pane keeps 100 under the grip');
    const js = read('public/js/classic/classic-panes.js');
    assert.match(js, /role: 'separator'/);
    assert.match(js, /writeUiCache\('divider'/);
    assert.match(read('public/css/classic.css'), /minmax\(100px, var\(--classic-upper-h, 45%\)\)/);
  });

  it('the closed strip: an icon and its count, the name in the tooltip, never under the count (online QA)', () => {
    const css = read('public/css/classic.css');
    assert.match(css, /\.social-rail-btn\[data-social-rail-tab\]::after \{ content: none; \}/);
    assert.match(css, /\[data-classic-strip="open"\] \.social-drawer \.social-rail-btn\[data-social-rail-tab\]::after \{ content: attr\(title\); \}/);
    assert.match(css, /\.social-rail-btn\[data-social-rail-tab\] \.social-badge \{ top: 50%; right: calc\(3 \* var\(--cu\)\);/);
  });
});
