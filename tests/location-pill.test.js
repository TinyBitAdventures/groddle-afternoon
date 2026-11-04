// Ticket 60 (Austin 2026-11-03): the street name in the top-middle pill opens the Map, as the
// client's Current location did (CurrentLocationUI.as 129-141); the clock keeps its own click,
// the hi sign board (DateTimeUI.as 71-74). Both skins.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LOCATION_LINK, locationLinkLabel } from '../public/js/ui/topbar.js?v=7509db0a';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => readFileSync(join(root, f), 'utf8');
const topbar = read('public/js/ui/topbar.js');
const css = read('public/style.css');
const classicCss = read('public/css/classic.css');
const classicTopbar = read('public/js/classic/classic-topbar.js');
const fn = topbar.slice(topbar.indexOf('function installLocationLink(doc) {'), topbar.indexOf('export function nameplateLeft('));

describe('ticket 60: the street name opens the Map', () => {
  it('names itself for a screen reader and the tooltip', () => {
    assert.equal(LOCATION_LINK.tip, 'Open the Map');
    assert.equal(LOCATION_LINK.key, 'M');
    assert.equal(locationLinkLabel('Hechey Track · Groddle Forest'), 'Hechey Track · Groddle Forest. Open the Map');
    assert.equal(locationLinkLabel('…'), 'Open the Map', 'before the first street');
    assert.equal(locationLinkLabel('  Otterlane  '), 'Otterlane. Open the Map');
  });

  it('a button you can reach with Tab and press with Enter or Space, wired once for both skins', () => {
    assert.match(topbar, /installTooltips\(doc, \[bar, doc\.getElementById\('street-nameplate'\)\]\);/);
    assert.match(topbar, /shapeStreetName\(doc\);\s+installLocationLink\(doc\);/);
    assert.match(fn, /name\.setAttribute\('role', 'button'\);\s+name\.setAttribute\('tabindex', '0'\);/);
    assert.match(fn, /name\.dataset\.tip = LOCATION_LINK\.tip;\s+name\.dataset\.key = LOCATION_LINK\.key;/);
    assert.match(fn, /if \(e\.key !== 'Enter' && e\.key !== ' '\) return;\s+e\.preventDefault\(\);\s+e\.stopPropagation\(\);\s+open\(\);/);
  });

  it('through the Map button (so it toggles as M does), never where the Map is hidden', () => {
    assert.match(fn, /btn\.disabled \|\| doc\.body\?\.classList\.contains\('nx-hide-map'\)/);
    assert.match(fn, /btn\.click\(\);/);
  });

  it('the clock, the season chip and a quest pill keep their own clicks; Modern answers only the name', () => {
    assert.match(fn, /if \(plate\.classList\.contains\('is-quest'\)\) return;/);
    assert.match(fn, /closest\?\.\('#dametime-clock, \.season-chip, \.quest-plate'\)\) return;/);
    assert.match(fn, /if \(!classic\(\) && !e\.target\?\.closest\?\.\('#street-name'\)\) return;/);
  });

  it('Modern: the name takes the pointer through the pill (which lets clicks through), with a hover line and a focus ring', () => {
    assert.match(css, /\[data-ui="modern"\] \.street-nameplate #street-name\[data-location-link\] \{ pointer-events: auto; cursor: pointer;/);
    assert.match(css, /#street-name\[data-location-link\]:hover \.street-name-street \{ text-decoration: underline;/);
    assert.match(css, /#street-name\[data-location-link\]:focus-visible \{ outline: none; box-shadow: inset 0 0 0 2px var\(--focus\); \}/);
  });

  it('Classic: the whole Current location block, once (the old second handler would close it again)', () => {
    assert.match(classicCss, /:root\[data-ui="classic"\] #game-root \.street-nameplate:not\(\.is-quest\) \{ pointer-events: auto; \}/);
    assert.doesNotMatch(classicTopbar, /plate\?\.addEventListener\('click'/);
    assert.match(classicCss, /\.street-nameplate:hover \{ background-image: url\("\.\.\/assets\/classic\/map_icon_hover\.png/);
  });

  it('Classic: the date block opens the hi sign board where the clock has one (multiplayer)', () => {
    assert.match(classicTopbar, /date\.addEventListener\('click', \(\) => \{\s+const clock = doc\.getElementById\('dametime-clock'\);\s+if \(classic\(\) && clock\?\.dataset\.hiBoard !== undefined\) clock\.click\(\);/);
    assert.match(classicTopbar, /date\.setAttribute\('role', 'button'\);\s+date\.setAttribute\('tabindex', '0'\);/);
    assert.match(classicCss, /\.classic-date\[data-hi-board\] \{ cursor: pointer; pointer-events: auto; \}/);
    // The board itself is still the clock's (features/hi-signs-feature.js bindClock).
    assert.match(read('public/js/features/hi-signs-feature.js'), /clock\.addEventListener\('click', toggle\);/);
  });
});
