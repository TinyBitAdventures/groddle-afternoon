/**
 * Mail, Imagination and the currants on a narrow window (the mobile QA, 2026-11-12: under 760 px the
 * bar hid Mail, Imagination and the currants, and nothing else reached Mail; every phone is that
 * narrow). js/ui/topbar.js installNarrowRows puts them in the Menu.
 * Run: node --test tests/narrow-menu-rows.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MENU_ROWS, NARROW_ROWS, menuRowFor } from '../public/js/ui/topbar.js?v=23c2cb54';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const css = readFileSync(join(root, 'public/style.css'), 'utf8');
const src = readFileSync(join(root, 'public/js/ui/topbar.js'), 'utf8');

describe('the Menu carries what a narrow bar drops', () => {
  it('a row for Mail and for Imagination, each with its place', () => {
    assert.deepEqual(NARROW_ROWS['mail-btn'], ['menu-mail-btn', 'Mail']);
    assert.deepEqual(NARROW_ROWS['imagination-btn'], ['menu-imagination-btn', 'Imagination']);
    assert.equal(menuRowFor('menu-mail-btn').group, 'world');
    assert.equal(menuRowFor('menu-imagination-btn').group, 'me');
    assert.equal(MENU_ROWS['menu-imagination-btn'].key, 'X');
  });
  it('a row shows only while its bar button is not drawn, and clicks that button', () => {
    assert.match(src, /const onBar = Boolean\(doc\.getElementById\(barId\)\?\.getClientRects\(\)\.length\);\s*if \(row\.hidden !== onBar\) row\.hidden = onBar;/);
    assert.match(src, /doc\.getElementById\('more-btn'\)\?\.click\(\);\s*doc\.getElementById\(barId\)\?\.click\(\);/);
    assert.match(src, /installTopOverflow\(doc\);\s*installNarrowRows\(doc\);/);
  });
  it('the bar keeps the currants over 560 px; under it they are a line in the Menu', () => {
    const at = css.indexOf('/* A narrow window: the less-used chips go');
    const narrow = css.slice(at, css.indexOf('/* Report #100: a phone held upright', at));
    assert.doesNotMatch(narrow.slice(0, narrow.indexOf('}')), /currants/);
    assert.match(narrow, /@media \(max-width: 560px\) \{\s*\[data-ui="modern"\] \.top-bar \.hud-cur\.currants \{ display: none; \}/);
    assert.match(narrow, /\[data-ui="modern"\] \.more-list \.menu-currants \{ display: none; \}/);
    assert.match(narrow, /\.top-bar\[data-mail-waits\] #more-btn::after \{/);
  });
});
