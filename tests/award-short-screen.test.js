/**
 * The award screen on a phone (the mobile QA and Austin's iPhone, 2026-11-12): upright, the card sat
 * right and ran off a 402 px screen; sideways (about 320 px tall) its button sat under the bottom edge
 * and nothing scrolled. The card now takes one column the screen's width and always fits the screen,
 * only its body text scrolling.
 * An upright phone (Austin's iPhone in Chrome, 2026-11-15, 393x663): the 166 px art left the words one
 * line, cut through the letters. Up to 760 px tall the art and burst are smaller; words that still need
 * more room show in whole lines with a fade at the edge they continue past, and when not even one line
 * fits the whole card scrolls instead.
 * Run: node --test tests/award-short-screen.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bodyFade, bodyFit } from '../public/js/ui/moment-card.js?v=b383144f';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const css = readFileSync(join(root, 'public/style.css'), 'utf8');
const fx = readFileSync(join(root, 'public/js/screen-fx.js'), 'utf8');

describe('the award screen on a phone', () => {
  it('one column the screen\'s width, the card no wider than it', () => {
    const at = css.indexOf('[data-ui="modern"] .award-screen[data-paged="true"] {\n  place-items: center;');
    assert.ok(at > 0);
    const rule = css.slice(at, css.indexOf('}', at));
    assert.match(rule, /grid-template-columns: minmax\(0, 1fr\);/);
    const card = css.slice(css.indexOf('[data-ui="modern"] .award-screen[data-paged="true"] .award-card {\n  position: relative;'));
    assert.match(card.slice(0, card.indexOf('}')), /width: var\(--moment-w\);\n  max-width: 100%;/);
  });
  it('the card fits the screen and only its body scrolls', () => {
    const at = css.indexOf('/* The card always fits the screen (Austin\'s iPhone, 2026-11-12)');
    assert.ok(at > css.indexOf('[data-ui="modern"] .award-screen[data-paged="true"] .award-next {'), 'after the button rules, so it wins');
    const block = css.slice(at, css.indexOf('/* —— HUB: Imagination hub —— */', at));
    assert.match(block, /display: flex; flex-direction: column;\n  max-height: calc\(100% - var\(--moment-burst\) \* 0\.5\);/);
    assert.match(block, /\.award-card > \* \{ flex-shrink: 0; \}/);
    assert.match(block, /flex: 0 1 auto; min-height: 0; overflow-y: auto;/);
  });
  it('a short screen: smaller art, tighter spacing, no room kept for the HUD', () => {
    const at = css.indexOf('/* A short screen (the mobile QA, 2026-11-12: a phone held sideways, 343 px; Austin\'s iPhone');
    assert.ok(at > 0);
    const block = css.slice(at, css.indexOf('}\n}', at) + 3);
    assert.match(block, /@media \(max-height: 500px\) \{/);
    assert.match(block, /--moment-burst: 72px; --moment-art: 60px; --moment-art-book: 54px;/);
    assert.match(block, /padding: var\(--space-2\) var\(--space-4\);/);
    assert.doesNotMatch(block, /overflow-y: auto; overscroll-behavior: contain;\n    padding-top/);
  });
  it('an upright phone up to 760 px tall: smaller art and burst, before the 500 px rules so they win', () => {
    const at = css.indexOf('@media (orientation: portrait) and (max-height: 760px) {');
    assert.ok(at > 0);
    assert.ok(at < css.indexOf('/* A short screen (the mobile QA, 2026-11-12: a phone held sideways, 343 px; Austin'), 'the sideways rules come later and win');
    const block = css.slice(at, css.indexOf('}\n}', at) + 3);
    assert.match(block, /--moment-burst: 128px; --moment-art: 104px; --moment-art-book: 88px;/);
    assert.match(block, /\[data-paged="true"\] \{ padding: var\(--space-4\); \}/);
    // The desktop card keeps its 166 px art.
    assert.match(css, /--moment-art: 166px;/);
  });
  it('words that still scroll fade at the edge they continue past; a tight screen scrolls the whole card', () => {
    for (const edge of ['end', 'start', 'both']) {
      const at = css.indexOf(`[data-ui="modern"] .award-screen .award-body[data-more="${edge}"] {`);
      assert.ok(at > 0, edge);
      assert.match(css.slice(at, css.indexOf('}', at)), /-webkit-mask-image: linear-gradient\(.*\);\n  mask-image: linear-gradient\(/);
    }
    const tight = css.indexOf('[data-ui="modern"] .award-screen[data-tight="true"],');
    assert.ok(tight > 0);
    assert.match(css.slice(tight, css.indexOf('}', tight)), /overflow-y: auto;/);
    assert.match(css, /\.award-screen\[data-tight="true"\] \.award-card,\n[^{]*\{ max-height: none; \}/);
  });
  it('the body takes whole lines, at least one; less than one line scrolls the whole card', () => {
    assert.deepEqual(bodyFit(200, 150, 23.8), { height: 0 }, 'it fits');
    assert.deepEqual(bodyFit(69, 69.5, 23.8), { height: 0 }, 'a rounding pixel is not a scroll');
    assert.equal(bodyFit(183, 253, 23.8).height, 7 * 23.8);
    assert.equal(bodyFit(71, 253, 23.8).height, 3 * 23.8, 'three lines, not 2.98');
    assert.equal(bodyFit(24, 253, 23.8).height, 23.8);
    assert.deepEqual(bodyFit(18, 176, 22.4), { scrollCard: true });
    assert.deepEqual(bodyFit(0, 253, 23.8), { scrollCard: true });
    assert.deepEqual(bodyFit(50, 253, NaN), { height: 0 }, 'no line height: leave it be');
  });
  it('the fade marks the edge with more words past it', () => {
    assert.equal(bodyFade({ top: 0, height: 71, full: 71 }), '');
    assert.equal(bodyFade({ top: 0, height: 71, full: 253 }), 'end');
    assert.equal(bodyFade({ top: 40, height: 71, full: 253 }), 'both');
    assert.equal(bodyFade({ top: 182, height: 71, full: 253 }), 'start');
  });
  it('the modern award screen fits its body while it shows, and every page of the quest book', () => {
    assert.match(fx, /const stopFit = modern \? watchAwardBody\(el, body\) : \(\) => \{\};/);
    assert.match(fx, /stopFamiliar\(\);\n  stopFit\(\);/);
    assert.match(fx, /if \(modern && body\) \{\n\s+body\.scrollTop = 0;\n\s+fitAwardBody\(body, el\);/);
    assert.match(fx, /new Observer\(refit\)/);
  });
});
