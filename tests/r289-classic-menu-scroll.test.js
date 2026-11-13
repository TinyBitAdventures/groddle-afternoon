/**
 * Report #289 (1920x919): "The exit game/sign off button lands off the screen at some resolutions."
 * The Classic Menu had no height limit, so online (Social and Settings rows) it ran past the window's
 * foot with Sign out under it. It stops above the foot and scrolls, and its foot fades while rows wait
 * below (data-more-below from js/ui/topbar.js installMenu, as the Modern Menu shows it).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const css = readFileSync(join(root, 'public/css/classic.css'), 'utf8');
const topbar = readFileSync(join(root, 'public/js/ui/topbar.js'), 'utf8');
const block = css.slice(css.indexOf('/* === rep13 (lane) === */'), css.indexOf('/* === end rep13 === */'));

describe('report #289: the Classic Menu reaches Sign out at any height', () => {
  it('stops above the window\'s foot and scrolls', () => {
    assert.match(block, /:root\[data-ui="classic"\] \.top-bar #more-list \{\s*box-sizing: border-box;\s*max-height: calc\(100dvh - 34 \* var\(--cu\) - 16px\);\s*overflow-y: auto;\s*overscroll-behavior: contain;/);
  });
  it('fades its foot while rows wait below, with WebKit\'s prefix', () => {
    assert.match(block, /:root\[data-ui="classic"\] \.top-bar #more-list\[data-more-below\] \{\n\s*-webkit-mask-image: linear-gradient\(to bottom, var\(--c-black\) calc\(100% - 40px\), transparent\);\n\s*mask-image:/);
  });
  it('the mark is set for either skin (installMenu runs for both)', () => {
    assert.match(topbar, /const more = !list\.hidden && list\.scrollHeight - list\.scrollTop - list\.clientHeight > 4;/);
    assert.doesNotMatch(topbar.slice(topbar.indexOf('const edge = () => {'), topbar.indexOf("list.addEventListener('scroll', edge")), /data-ui|modern/);
  });
});
