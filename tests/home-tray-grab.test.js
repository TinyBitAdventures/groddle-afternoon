// Austin's iPhone (2026-11-13), Cultivate and Decoration Mode: "I feel a swipe down/up the 'choose an
// item' panel would be a huge help, because it eats half the screen." On a phone the builder's tray
// (js/ui/home-builder.js) has a grab handle: a swipe down folds it to a slim bar, a swipe up or a tap on
// the handle opens it; the stick and Jump follow its top (--hb-tray-up). Computers never see it.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { TRAY_GRAB_TEXT, TRAY_SWIPE_MIN, trayGesture } from '../public/js/ui/home-builder.js?v=378178ac';

const root = join(import.meta.dirname, '..');
const src = readFileSync(join(root, 'public/js/ui/home-builder.js'), 'utf8');
const css = readFileSync(join(root, 'public/style.css'), 'utf8');
const block = css.slice(css.indexOf('/* TRAY GRAB'), css.indexOf('/* —— /BUILDER —— */'));

describe('the builder tray folds on a phone', () => {
  it('a swipe down folds, a swipe up opens, a tap on the handle toggles', () => {
    assert.equal(trayGesture(0, 60, false), 'fold');
    assert.equal(trayGesture(4, -60, true), 'open');
    assert.equal(trayGesture(0, 60, true), '', 'down on a folded tray does nothing');
    assert.equal(trayGesture(0, -60, false), '', 'up on an open tray does nothing');
    assert.equal(trayGesture(0, TRAY_SWIPE_MIN - 1, false), '', 'too short');
    assert.equal(trayGesture(80, 40, false), '', 'mostly sideways (a strip scroll)');
    assert.equal(trayGesture(2, 3, false), '', 'a tap on the tray itself');
    assert.equal(trayGesture(2, 3, false, { tapToggles: true }), 'fold');
    assert.equal(trayGesture(0, 0, true, { tapToggles: true }), 'open');
  });

  it('the handle is a phone\'s only, kept across redraws, and reset when the builder closes', () => {
    assert.match(src, /const phone = Boolean\(html\?\.classList\?\.contains\('touch-phone'\)\);/);
    assert.match(src, /const grab = phone \? el\(doc, 'button', \{ type: 'button', class: 'hb-grab', id: 'homes-tray-grab', 'aria-controls': 'homes-tray', 'aria-expanded': 'true'/);
    assert.equal(src.match(/if \(grab\) parts\.unshift\(grab\);\n\s*tray\.replaceChildren\(\.\.\.parts\);/g)?.length, 2, 'both tray draws keep it');
    assert.match(src, /if \(!m\) \{\n\s*\/\/ TRAY GRAB[^\n]*\n(\s*\/\/[^\n]*\n)*\s*if \(!keepFold\) setCollapsed\(false\);/);
    // Folding moves the stick and Jump (syncTrayUp) and the docked pack row.
    assert.match(src, /function setCollapsed\(v\) \{[\s\S]*?syncTrayUp\(\);\n\s*syncDock\(\);/);
    // Never a tile, the strip or the docked pack: those keep their own drags and scrolls.
    assert.match(src, /const SKIP = '\.hb-tile, \.hb-strip, \.hb-dock, \.hb-page, input, select, textarea';/);
    assert.equal(TRAY_GRAB_TEXT.name, 'Choose an item');
  });

  it('a folded tray stays folded through a scene rebuild: placing in Cultivate never pops it open (Austin 2026-11-13)', () => {
    const homes = readFileSync(join(root, 'public/js/features/homes-feature.js'), 'utf8');
    assert.match(src, /render\(m, \{ keepFold = false \} = \{\}\) \{/);
    // A Cultivate placement (and a move or a removal) rebuilds the street: refreshHomeScene, onStreetClear.
    const place = homes.slice(homes.indexOf('function placeAtPointer(engine, at) {'), homes.indexOf('// ----', homes.indexOf('function placeAtPointer(engine, at) {')));
    assert.match(place, /result = cultivate\(st, engine\.pc, placing\.protoClass, rx\);[\s\S]*engine\.refreshHomeScene\?\.\(\);\n\s*return result;/);
    const clear = homes.slice(homes.indexOf('  onStreetClear(engine) {'), homes.indexOf('  onStreetEnter(street, engine) {'));
    assert.match(clear, /ui\.builder\.render\(null, \{ keepFold: true \}\);/);
    // Leaving the mode (renderBar with no mode) still opens it for next time.
    const bar = homes.slice(homes.indexOf('function renderBar(engine) {'), homes.indexOf('/** The tray tabs while decorating'));
    assert.match(bar, /if \(!mode\) \{\n\s*ui\.builder\.render\(null\);/);
    // The tray opens only from the player's own swipe up, a tap on the handle or a tab.
    assert.deepEqual([...src.matchAll(/setCollapsed\(false\)/g)].length, 2, 'render(null) without keepFold, and a tab picked while folded');
  });

  it('style.css shows it on a Modern phone only, and folds to the tabs or the handle', () => {
    assert.ok(block.length > 400);
    assert.match(block, /^#game-root \.hb-tray > \.hb-grab \{ display: none; \}/m);
    for (const line of block.split('\n')) if (/^:root/.test(line)) assert.match(line, /^:root\.touch-phone\[data-ui="modern"\]/, line);
    assert.match(block, /\.hb-tray\[data-collapsed\] > :not\(\.hb-tabs, \.hb-grab\) \{ display: none; \}/);
    assert.match(block, /\.hb-tray\[data-collapsed\]:not\(:has\(> \.hb-tabs\)\) \.hb-grab-name \{ display: inline; \}/);
    assert.match(block, /\[data-ui="modern"\]\[data-home-tray-collapsed\] #game-root #pack-bar\[data-hb-dock\] \{ visibility: hidden; \}/);
    // Classic never folds: the swipe is Modern's.
    assert.match(src, /html\.dataset\.ui === 'classic'\) return;/);
    // The stick and Jump already ride the tray's top in Cultivation Mode.
    assert.match(css, /:root\.touch-phone\[data-home-builder="cultivate"\] #game-root \.touch-controls \{ bottom: calc\(var\(--hb-tray-up, 0px\) \+ var\(--sp-2\)\); \}/);
  });
});
