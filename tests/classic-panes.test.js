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
import { pillText, paneLayout, LOCAL_TABS } from '../public/js/classic/classic-panes.js';

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
});
