/**
 * The top bar's popovers over the Social drawer (HUB fix, 2026-10-30) and over the side sheets
 * (Austin 2026-11-12, live v0.34.0): at 1440 px and up the Menu and the Sound popover drop from the
 * bar's right end onto the open drawer (Modern) or the chat column (Classic), and "Something to eat"
 * and the player card drop from the rings onto an open Quests or Make sheet. The bar (--z-hud, its
 * own stacking layer) sat under both, so those rows took no clicks: no eating while a making ran.
 * While one of the bar's popovers is open the bar lifts to --z-hud-pop, over the drawer, the sheets,
 * the vendor, the Map and the pack, and still under menus, notices' own layer and every window.
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
// The z-index of the first top-level rule in `sheet` whose selector list ends with `sel` and sets one.
const z = (sel, sheet = css) => {
  for (let at = sheet.indexOf(`${sel} {`); at >= 0; at = sheet.indexOf(`${sel} {`, at + 1)) {
    // A whole selector: at a line's start or after a comma, never the tail of a longer one.
    if (!/(^|\n|,\s*)$/.test(sheet.slice(Math.max(0, at - 3), at))) continue;
    const m = sheet.slice(at, sheet.indexOf('}', at)).match(/z-index: (-?\d+)/);
    if (m) return Number(m[1]);
  }
  assert.fail(`${sel} has no rule with a z-index`);
};
const POPS = ['#more-list', '#sound-pop', '#vitals-menu', '#player-menu', '#favor-pop'];
const LIFT = `#wrap > header.top-bar:has(${POPS.map((id) => `${id}:not([hidden])`).join(', ')})`;
// Every sheet and window a popover may open over: the side sheets (Quests, Make, the vendor in
// Modern's panel shell), the old side panels and Glitch modals, the Map and the pack.
const SHEETS = ['.side-panel', '.glitch-modal', '.map-panel', '.pack-bar', '[data-ui="modern"] #game-root #buffs-panel'];
// What stays over an open popover: notices' own layer, the verb and pack menus, tooltips, windows.
const OVER = ['.notify-notices', '[data-ui="modern"] #verb-menu', '.pack-popover', '[data-ui="modern"] .hud-tip', '[data-ui="modern"] .imagination-hub'];

describe('the top bar over the Social drawer and the side sheets', () => {
  it('lifts the bar to --z-hud-pop only while one of its popovers is open', () => {
    assert.match(raw, /--z-hud-pop: calc\(var\(--z-panel\) \+ 12\);/);
    assert.match(raw, new RegExp(`\\n${LIFT.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\{\\n  z-index: var\\(--z-hud-pop\\);\\n\\}`));
  });

  it('Modern: at rest under the drawer and every sheet; lifted over them, under menus and windows', () => {
    const bar = z('html:not(.stage-pinned)[data-ui="modern"] #wrap > .top-bar');
    const drawer = z('.local-chat-dock');
    const lifted = z(LIFT);
    assert.ok(bar < drawer, `bar ${bar} < drawer ${drawer}`);
    assert.ok(lifted > drawer, `lifted ${lifted} > drawer ${drawer}`);
    for (const sel of SHEETS) {
      assert.ok(bar < z(sel), `at rest the bar ${bar} stays under ${sel}`);
      assert.ok(lifted > z(sel), `lifted ${lifted} > ${sel} ${z(sel)}`);
    }
    for (const sel of OVER) assert.ok(lifted < z(sel), `lifted ${lifted} < ${sel} ${z(sel)}`);
    // Windows and award screens still cover it.
    assert.ok(lifted < Number(resolveTokens('var(--z-dialog)')) && lifted < Number(resolveTokens('var(--z-screen)')));
  });

  it('Classic: the lift beats its bar and its chat column, and wins the cascade', () => {
    const bar = z(':root[data-ui="classic"]:not(.stage-pinned) #wrap > header.top-bar', classic);
    const column = z(':root[data-ui="classic"] .local-chat-dock.social-drawer.is-open', classic);
    const lifted = z(LIFT);
    assert.ok(lifted > bar && lifted > column, `lifted ${lifted} > classic bar ${bar} and column ${column}`);
    // Specificity: #wrap and #more-list (two ids) beat Classic's one id (#wrap) plus four classes.
    assert.equal((LIFT.match(/#[\w-]+/g) || []).length >= 2, true);
    // Classic sets no layer of its own on a sheet above the lifted bar.
    for (const m of classic.matchAll(/([^{}]*(?:side-panel|glitch-modal|ui-sheet)[^{}]*)\{([^}]*)\}/g)) {
      const n = m[2].match(/z-index: (-?\d+)/);
      if (n && !/notice|tip|menu|dialog/.test(m[1])) assert.ok(Number(n[1]) < lifted, `${m[1].trim()} ${n[1]} under the lifted bar`);
    }
  });

  it('every popover of the bar is one of the five, in both rules', () => {
    for (const id of POPS) assert.match(raw, new RegExp(`${id}:not\\(\\[hidden\\]\\)`), id);
    assert.ok(raw.includes(`:is(${POPS.join(', ')}):not([hidden])`));
    // The player card's popover lives in the bar, so the lift reaches it.
    const html = readFileSync(join(root, 'public/play/index.html'), 'utf8');
    const bar = html.slice(html.indexOf('<header class="top-bar"'), html.indexOf('</header>'));
    for (const id of ['player-menu', 'more-list', 'sound-pop']) assert.ok(bar.includes(`id="${id}"`), id);
  });
});

/**
 * G637 / G644: for the seconds they show, a notice drew over an open top bar popover and its card
 * took the popover's clicks. While a popover is open the notices drop to one under the lifted bar,
 * still over every sheet; the Qurazy banner (--z-overlay) is under the lifted bar already.
 */
describe('an open top bar popover over notices and the banner', () => {
  const OPEN = `#wrap:has(> header.top-bar :is(${POPS.join(', ')}):not([hidden]))`;
  const esc = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const rule = raw.match(new RegExp(`\\n${esc(OPEN)} > #game-root \\.notify-notices \\{\\n  z-index: var\\((--z-[\\w-]+)\\);\\n\\}`));

  it('drops the notices to --z-hud-pop-under while one of the same popovers is open', () => {
    assert.ok(rule, 'the notices rule');
    assert.equal(rule[1], '--z-hud-pop-under');
    assert.match(raw, /--z-hud-pop-under: calc\(var\(--z-panel\) \+ 11\);/);
  });

  it('one under the lifted bar, still over the drawer and every sheet', () => {
    const under = Number(resolveTokens('var(--z-hud-pop-under)'));
    const lifted = z(LIFT);
    assert.equal(under, lifted - 1);
    assert.ok(under > z('.local-chat-dock') && under > z('.street-nameplate'), `${under} over the drawer and the nameplate`);
    for (const sel of SHEETS) assert.ok(under > z(sel), `${under} over ${sel}`);
  });

  it('the banner stays under the lifted bar and under the sheets, and moves nothing at rest', () => {
    const banner = z('#game-root > canvas.overlay-art');
    assert.ok(banner < z(LIFT), `banner ${banner} under the lifted bar`);
    assert.ok(banner < z('.side-panel'), 'the banner under every panel, open popover or not');
    assert.doesNotMatch(raw, /canvas\.overlay-art \{\n  z-index: var\(--z-hud-pop/);
    // At rest: notices over the sheets.
    assert.ok(z('.notify-notices') > z('.side-panel'));
    // Only the bar and the notices are named in the block: no sheet, window or award screen moves.
    const block = raw.slice(raw.indexOf('/* —— HUB: top bar popovers over'), raw.indexOf('/* —— end HUB top bar layer —— */'));
    assert.equal((block.match(/z-index:/g) || []).length, 2);
    assert.doesNotMatch(block.replace(/\/\*[\s\S]*?\*\//g, ''), /side-panel|glitch-modal|ui-sheet|award|map-panel/);
  });

  it('Classic takes the same rule: nothing in classic.css sets those layers again', () => {
    const c = readFileSync(join(root, 'public/css/classic.css'), 'utf8');
    assert.doesNotMatch(c, /\.notify-notices[^{]*\{[^}]*z-index/);
    assert.doesNotMatch(c, /canvas\.overlay-art[^{]*\{[^}]*z-index/);
  });
});

/**
 * Over an open sheet, Esc closes the popover only: the game's Esc (window, game.js) closes the top
 * sheet, and closing Make cancels its making (closeMakePanel -> cancelMakeCraft). Each popover's
 * own Escape (on document) stops the key before it gets there, as topbar.js popover() does.
 */
describe('Esc closes the top bar popover, never the sheet under it', () => {
  const game = readFileSync(join(root, 'public/game.js'), 'utf8');
  const body = (from, to) => game.slice(game.indexOf(from), game.indexOf(to, game.indexOf(from)));

  it('the Menu, "Something to eat" and the player card stop the key', () => {
    const menu = body('function installMoreMenu', '\n}\n');
    assert.match(menu, /if \(e\.key === 'Escape' && !list\.hidden\) \{[^}]*e\.stopPropagation\(\);\s*setOpen\(false\);/);
    const vitals = body('function installVitalsMenu()', '\n}\n');
    assert.match(vitals, /if \(e\.key !== 'Escape' \|\| menu\.hidden\) return;[^}]*e\.stopPropagation\(\);\s*close\(true\);/);
    const player = body('function installPlayerMenu()', '\n}\n');
    assert.match(player, /if \(e\.key === 'Escape' && !menu\.hidden\) \{\s*e\.stopPropagation\(\);\s*setOpen\(false\);/);
    // The popovers in js/ui/topbar.js (Sound, favor) already do.
    const topbar = readFileSync(join(root, 'public/js/ui/topbar.js'), 'utf8');
    assert.match(topbar, /if \(e\.key !== 'Escape' \|\| !isOpen\(\)\) return;\n\s+e\.stopPropagation\(\);/);
  });

  it('the game hears Esc on window, after the popovers on document', () => {
    assert.match(game, /window\.addEventListener\('keydown', \(e\) => \{[\s\S]{0,1200}if \(e\.key === 'Escape'\) \{\n\s+if \(escapeTopPanel\(\)\) return;/);
  });
});
