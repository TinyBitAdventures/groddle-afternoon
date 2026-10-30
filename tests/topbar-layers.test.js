/**
 * The top bar's popovers over the Social drawer (HUB fix, 2026-10-30): at 1440 px and up the Menu
 * and the Sound popover drop from the bar's right end onto the open drawer (Modern) or the chat
 * column (Classic), and the bar (--z-hud, its own stacking layer) sat under the drawer
 * (--z-hud + 14): their lower rows took no clicks. While one of the bar's popovers is open the bar
 * lifts to --z-hud-pop, above the drawer and still under the side panels and every window.
 * Run: node --test tests/topbar-layers.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveTokens } from './css-tokens.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const raw = readFileSync(join(root, 'public/style.css'), 'utf8');
const css = resolveTokens(raw);
const classic = resolveTokens(readFileSync(join(root, 'public/css/classic.css'), 'utf8'));
// The z-index of the first top-level `sel { ... }` rule in `sheet` that sets one.
const z = (sel, sheet = css) => {
  for (let at = sheet.indexOf(`\n${sel} {`); at >= 0; at = sheet.indexOf(`\n${sel} {`, at + 1)) {
    const m = sheet.slice(at, sheet.indexOf('}', at)).match(/z-index: (-?\d+)/);
    if (m) return Number(m[1]);
  }
  assert.fail(`${sel} has no rule with a z-index`);
};
const LIFT = '#wrap > header.top-bar:has(#more-list:not([hidden]), #sound-pop:not([hidden]), #vitals-menu:not([hidden]))';

describe('the top bar over the Social drawer', () => {
  it('lifts the bar to --z-hud-pop only while its Menu, Sound popover or eat menu is open', () => {
    assert.match(raw, /--z-hud-pop: calc\(var\(--z-hud\) \+ 16\);/);
    assert.match(raw, new RegExp(`\\n${LIFT.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\{\\n  z-index: var\\(--z-hud-pop\\);\\n\\}`));
  });

  it('Modern: the bar sits under the drawer, and over it while a popover is open', () => {
    const bar = z('html:not(.stage-pinned)[data-ui="modern"] #wrap > .top-bar') ;
    const drawer = z('.local-chat-dock');
    const lifted = z(LIFT);
    assert.ok(bar < drawer, `bar ${bar} < drawer ${drawer}`);
    assert.ok(lifted > drawer, `lifted ${lifted} > drawer ${drawer}`);
    for (const sel of ['.side-panel', '.glitch-modal', '.map-panel', '.notify-notices']) assert.ok(lifted < z(sel), `${lifted} < ${sel}`);
  });

  it('Classic: the lift beats its bar and its chat column, and wins the cascade', () => {
    const bar = z(':root[data-ui="classic"]:not(.stage-pinned) #wrap > header.top-bar', classic);
    const column = z(':root[data-ui="classic"] .local-chat-dock.social-drawer.is-open', classic);
    const lifted = z(LIFT);
    assert.ok(lifted > bar && lifted > column, `lifted ${lifted} > classic bar ${bar} and column ${column}`);
    // Specificity: #wrap and #more-list (two ids) beat Classic's one id (#wrap) plus four classes.
    assert.equal((LIFT.match(/#[\w-]+/g) || []).length >= 2, true);
  });
});
