/**
 * #368, #370, #371 (iPhone Safari, the report window with the keyboard up): upright the new report's box
 * sat under the keyboard with Send out of sight, and a reply's box was out of sight either way up.
 * - js/touch-controls.js watchPhoneKeyboard: --kbd-top in page px. Safari measures the game root from the
 *   view it scrolled to show the field, so adding the view's offsetTop to the root's own top counted that
 *   scroll twice.
 * - style.css: the body scrolls (it clipped), upright the head stays with the box over Send, a reply keeps
 *   its newest messages above its box; sideways the box alone with Send beside it, for a reply too.
 * Browser check (WebKit, iPhone UA, a simulated keyboard: 874x402, 402x660, 402x874): the box and Send
 * above the keyboard for a new report and a reply. Only a real iPhone shows Safari's own scroll.
 * Run: node --test tests/r368-report-keyboard.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { watchPhoneKeyboard } from '../public/js/touch-controls.js?v=8bc690ac';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const css = readFileSync(join(root, 'public/style.css'), 'utf8');

function setup({ scrollY = 0, rootTop = 0, pageTop, offsetTop = 0 } = {}) {
  const vvOn = {};
  const win = {
    innerHeight: 874,
    scrollY,
    addEventListener() {},
    removeEventListener() {},
    setTimeout: (fn) => fn(),
    scrollTo() {},
    visualViewport: { height: 874, offsetTop, ...(pageTop === undefined ? {} : { pageTop }), addEventListener: (t, fn) => { vvOn[t] = fn; }, removeEventListener() {} },
  };
  const classes = new Set();
  const props = new Map();
  const doc = {
    activeElement: null,
    documentElement: { classList: { contains: (c) => classes.has(c), toggle: (c, on) => (on ? classes.add(c) : classes.delete(c)) }, style: { setProperty: (k, v) => props.set(k, v), removeProperty: (k) => props.delete(k) } },
    addEventListener() {},
    removeEventListener() {},
    getElementById: (id) => (id === 'game-root' ? { getBoundingClientRect: () => ({ top: rootTop }) } : null),
  };
  watchPhoneKeyboard({ doc, win });
  doc.activeElement = { tagName: 'TEXTAREA' };
  win.visualViewport.height = 494;
  vvOn.resize();
  return { props, classes };
}

describe('#368/#370/#371 the report window above the iPhone keyboard', () => {
  it('counts Safari\'s scroll once: the root measured from the scrolled view', () => {
    // Safari scrolled 130 px to show the field: the view's page top is 130, the root's box top -130.
    const { props, classes } = setup({ scrollY: 130, rootTop: -130, pageTop: 130, offsetTop: 130 });
    assert.equal(classes.has('kbd-up'), true);
    assert.equal(props.get('--kbd-top'), '134px', 'not 264px (the scroll twice)');
    assert.equal(props.get('--kbd-h'), '486px');
  });
  it('no scroll, or a browser without pageTop, is as before', () => {
    assert.equal(setup().props.get('--kbd-top'), '4px');
    assert.equal(setup({ scrollY: 0, rootTop: 0, offsetTop: 40 }).props.get('--kbd-top'), '44px');
  });
  it('style.css: nothing clipped, the head stays upright, a reply keeps its box and Send', () => {
    const at = css.indexOf('/* #343: with the keyboard up, the report window fills the box above it');
    const block = css.slice(at, css.indexOf('/* === end PHONE SIDEWAYS 2 === */', at));
    const K = ':root.touch-phone.kbd-up[data-ui="modern"] #game-root #bug-report-panel.reports-panel:focus-within';
    assert.ok(block.includes(`${K} .reports-body { padding: var(--space-2); overflow-y: auto; }`));
    assert.doesNotMatch(block, /overflow: hidden/);
    const upright = block.slice(0, block.indexOf('@media'));
    assert.doesNotMatch(upright, /\.reports-head/, 'upright the head stays');
    assert.match(upright, /\.reports-thread-view:has\(> #reports-reply-text:focus\) \.reports-messages \{ flex: 1 1 0; min-height: 0; overflow-y: auto;/);
    const sideways = block.slice(block.indexOf('@media (max-height: 500px) and (orientation: landscape) {'));
    assert.match(sideways, /\.reports-head \{ display: none; \}/);
    assert.match(sideways, /\.reports-thread-view:has\(> #reports-reply-text:focus\) > :not\(#reports-reply-text, \.reports-actions\) \{ display: none; \}/);
    assert.match(sideways, /flex-direction: row; align-items: stretch;/);
  });
});
