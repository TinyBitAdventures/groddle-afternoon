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
const LIFT = '#wrap > header.top-bar:has(#more-list:not([hidden]), #sound-pop:not([hidden]), #vitals-menu:not([hidden]), #favor-pop:not([hidden]))';

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

/**
 * G637: for the seconds they show, a notice and a world announcement (the Qurazy banner) drew over
 * an open top bar popover, and a notice's card took its clicks. The bar cannot lift over them (panels
 * and windows must cover it), so while a popover is open those two layers drop to one under it.
 */
describe('an open top bar popover over notices and the banner', () => {
  const OPEN = '#wrap:has(> header.top-bar :is(#more-list, #sound-pop, #vitals-menu, #favor-pop):not([hidden]))';
  const esc = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const rule = raw.match(new RegExp(`\\n${esc(OPEN)} > #game-root > canvas\\.overlay-art,\\n${esc(OPEN)} > #game-root \\.notify-notices \\{\\n  z-index: var\\((--z-[\\w-]+)\\);\\n\\}`));

  it('drops the notices and the banner to --z-hud-pop-under while one of the same four popovers is open', () => {
    assert.ok(rule, 'the rule for both layers');
    assert.equal(rule[1], '--z-hud-pop-under');
    assert.match(raw, /--z-hud-pop-under: calc\(var\(--z-hud\) \+ 15\);/);
    // The same popovers as the bar's own lift, so the two always switch together.
    for (const id of ['#more-list', '#sound-pop', '#vitals-menu', '#favor-pop']) assert.ok(LIFT.includes(`${id}:not([hidden])`) && OPEN.includes(id), id);
  });

  it('one under the lifted bar and still over the HUD and the Social drawer', () => {
    const under = Number(resolveTokens('var(--z-hud-pop-under)'));
    const lifted = z(LIFT);
    assert.equal(under, lifted - 1);
    assert.ok(under > z('.local-chat-dock') && under > z('.street-nameplate'), `${under} over the drawer and the nameplate`);
  });

  it('moves nothing while no popover is open, and never lifts the bar', () => {
    // Their own layers stand as they were: notices over panels, the banner over the HUD and under panels.
    assert.ok(z('.notify-notices') > z('.side-panel'));
    assert.ok(z('#game-root > canvas.overlay-art') < z('.side-panel') && z('#game-root > canvas.overlay-art') > z(LIFT));
    assert.match(raw, /--z-hud-pop: calc\(var\(--z-hud\) \+ 16\);/);
    for (const sel of ['.side-panel', '.glitch-modal', '.map-panel', '.pack-bar']) assert.ok(z(LIFT) < z(sel), `the bar stays under ${sel}`);
    // Only these two layers are named: no rule here touches the bar, a panel or a window.
    const block = raw.slice(raw.indexOf('/* G637: for the seconds they show'), raw.indexOf('/* —— end HUB top bar layer —— */'));
    assert.equal((block.match(/z-index:/g) || []).length, 1);
    assert.doesNotMatch(block.replace(/\/\*[\s\S]*?\*\//g, ''), /top-bar[^,{]*\{|side-panel|glitch-modal|award/);
  });

  it('Classic takes the same rule: nothing in classic.css sets those layers again', () => {
    const c = readFileSync(join(root, 'public/css/classic.css'), 'utf8');
    assert.doesNotMatch(c, /\.notify-notices[^{]*\{[^}]*z-index/);
    assert.doesNotMatch(c, /canvas\.overlay-art[^{]*\{[^}]*z-index/);
  });
});
