/**
 * Report #208 (Classic, Edge on Windows): hovering parts of the Classic chrome made the game
 * resize for a moment, and the iMG count looked cut off at its right.
 *
 * 1. The bar's tooltip (js/ui/topbar.js #hud-tip, appended to <body>) had rules under Modern
 *    only. In Classic it was a static block at the foot of the page: the page grew past the
 *    window, Windows drew a scrollbar with width, the stage lost that width and re-fitted, and
 *    lost the scrollbar again on the way out. Classic now draws it fixed in the client's pale
 *    yellow tip (TipDisplayManager), the tooltip never sits past the window's foot, and the
 *    Classic page cannot scroll at all.
 * 2. The count's "i" sat 1 px after the digits at a smaller size and read as a clipped digit.
 *    It is the client's format now: commas (PlayerInfoUI.as 767-779,
 *    StringUtil.formatNumberWithCommas), the "i" with a little air, and the game's buttons
 *    moved along so "999,999i" clears Quests at the smallest stage.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { imgCountText, imgStatShown } from '../public/js/classic/classic-topbar.js?v=cf57371e';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const css = read('public/css/classic.css');
const style = read('public/style.css');
const topbar = read('public/js/ui/topbar.js');
const classicTopbar = read('public/js/classic/classic-topbar.js');

/** The body of the one rule whose selector is exactly `sel`. */
function rule(text, sel) {
  const i = text.indexOf(`${sel} {`);
  assert.ok(i >= 0, `no rule ${sel}`);
  return text.slice(i, text.indexOf('}', i));
}

describe('#208 the hover resize: the bar tooltip in Classic', () => {
  it('Classic draws #hud-tip fixed, out of the page flow, and never under the pointer', () => {
    const r = rule(css, ':root[data-ui="classic"] .hud-tip');
    assert.match(r, /position: fixed;/);
    assert.match(r, /pointer-events: none;/);
    assert.match(r, /z-index: calc\(var\(--z-notice\) \+ \d+\);/);
    assert.match(r, /background: var\(--c-classic-tip\);/, 'the client\'s pale yellow tip');
    assert.match(css, /:root\[data-ui="classic"\] \.hud-tip\[hidden\] \{ display: none; \}/);
  });

  it('Modern keeps its own tooltip rules', () => {
    assert.match(rule(style, '[data-ui="modern"] .hud-tip'), /position: fixed;/);
  });

  it('the Classic page cannot scroll, so nothing past the window brings a scrollbar', () => {
    assert.match(css, /:root\[data-ui="classic"\]:not\(\.stage-pinned\) \{ overflow: hidden; \}/);
    assert.match(style, /html:not\(\.stage-pinned\) #wrap \{[^}]*overflow: clip;/);
  });

  it('the tooltip goes above its control where the window ends below it', () => {
    assert.match(topbar, /const vh = doc\.documentElement\.clientHeight;/);
    assert.match(topbar, /below \+ tip\.offsetHeight > vh - 6 \? Math\.max\(6, r\.top - 8 - tip\.offsetHeight\) : below/);
  });

  it('controls with their own Classic hover keep the bar tooltip to Modern', () => {
    assert.match(topbar, /if \(el\.dataset\.tipOnly && el\.dataset\.tipOnly !== doc\.documentElement\.dataset\.ui\) return;/);
    assert.match(classicTopbar, /for \(const n of \[moodBtn, energyBtn, doc\.getElementById\('study-chip'\)\]\) if \(n\) n\.dataset\.tipOnly = 'modern';/);
  });
});

describe('#208 the iMG count', () => {
  it('commas, as the client wrote it', () => {
    assert.equal(imgCountText('0'), '0');
    assert.equal(imgCountText('999'), '999');
    assert.equal(imgCountText('2263'), '2,263');
    assert.equal(imgCountText('22631'), '22,631');
    assert.equal(imgCountText('999999'), '999,999');
    assert.equal(imgCountText('1234567'), '1,234,567');
    assert.equal(imgCountText(-1234), '-1,234');
    assert.equal(imgCountText(2263), '2,263');
  });

  it('is idempotent and leaves anything else alone', () => {
    assert.equal(imgCountText('2,263'), '2,263');
    assert.equal(imgCountText(imgCountText('999999')), '999,999');
    assert.equal(imgCountText(''), '');
    assert.equal(imgCountText(null), '');
    assert.equal(imgCountText('12.5'), '12.5');
  });

  it('Classic shows the commas; Modern the game\'s plain digits', () => {
    assert.equal(imgStatShown('2263', true), '2,263');
    assert.equal(imgStatShown('2,263', true), '2,263');
    assert.equal(imgStatShown('2,263', false), '2263');
    assert.equal(imgStatShown('2263', false), '2263');
  });

  it('the commas follow every write of the game (a MutationObserver, so before the frame paints)', () => {
    assert.match(classicTopbar, /new win\.MutationObserver\(syncImg\)\.observe\(imgStat, \{ characterData: true, childList: true, subtree: true \}\)/);
    assert.match(classicTopbar, /const sync = \(\) => \{[^}]*syncImg\(\);/);
  });

  it('the "i" has air after the count', () => {
    assert.match(css, /\.hud-img #stat-img::after \{ content: "i"; margin-left: calc\(2 \* var\(--cu\)\);/);
  });

  it('"999,999i" fits before the Quests button at the smallest stage (u = 1 px)', () => {
    // The count starts 3 u right of the 52 u iMG button at x 113 u (PlayerInfoUI.as 142-155).
    const btn = rule(css, ':root[data-ui="classic"] .top-bar .hud-img');
    const left = Number(/left: calc\((\d+) \* var\(--cu\)\)/.exec(btn)[1]);
    const width = Number(/width: calc\((\d+) \* var\(--cu\)\)/.exec(btn)[1]);
    const countX = left + width + 3;
    // The game's buttons, off the view's left (--cvx, 20 u unmeasured) plus --cf-hdr-x's shift.
    const shift = Number(/--cf-hdr-x: calc\(var\(--cvx\) \+ (\d+) \* var\(--cu\)\)/.exec(css)[1]);
    const quest = Number(/\.top-bar #quest-btn \{ left: calc\(var\(--cf-hdr-x\) \+ (\d+) \* var\(--cu\)\); \}/.exec(css)[1]);
    const questX = 20 + shift + quest;
    // Measured in Chrome at 1000 x 600 (u = 1): "999,999i" in Nunito 800 at 18 px is 75 px wide.
    assert.ok(questX - countX >= 75 + 6, `room ${questX - countX} u for a 75 px count`);
    // Every one of the game's buttons moved with Quests.
    for (const sel of ['#make-btn', '#map-btn', '#mail-btn', '.hud-actions .more-menu', '#study-chip']) {
      assert.match(css, new RegExp(`\\.top-bar ${sel.replace(/[.#]/g, (c) => `\\${c}`)} \\{ left: calc\\(var\\(--cf-hdr-x\\) \\+ \\d+ \\* var\\(--cu\\)\\);`), sel);
    }
    assert.doesNotMatch(css, /left: calc\(var\(--cvx\) \+ (?:205|231|257|283|309|337|458) \* var\(--cu\)\)/);
  });
});
