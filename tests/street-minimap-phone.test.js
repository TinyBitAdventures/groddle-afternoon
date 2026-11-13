// Austin's iPhone (2026-11-13, p13): "Not having the minimap makes it hard to find streets. Any
// suggestions for getting a mini map working on the phone? Maybe an icon which opens minimap full
// screen then closes when finished?" A phone still has no corner card (G370 phone rule), but a map
// button at the front of the street's name opens the same map full screen, with the signposts'
// destinations listed; a walk, the X, a tap outside or Esc closes it, and closing frees it.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { PHONE_MAP_TEXT, phoneMapWidth, phoneSignRows } from '../public/js/features/street-minimap-feature.js?v=788376c2';

const root = join(import.meta.dirname, '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');
const feature = read('public/js/features/street-minimap-feature.js');
const view = read('public/js/ui/street-minimap.js');
const css = read('public/style.css');
const block = css.slice(css.indexOf('/* PHONE MAP (Austin 2026-11-13'), css.indexOf('/* —— end MINIMAP —— */'));

describe('the street map on a phone', () => {
  it('fits the whole street in the sheet: the box\'s width, or less for a tall street', () => {
    const wide = { bounds: { l: -2000, r: 2000, t: -1000, b: 0 } };
    const tall = { bounds: { l: -500, r: 500, t: -3000, b: 0 } };
    assert.equal(phoneMapWidth(wide, 370, 400), 370);
    assert.equal(phoneMapWidth(tall, 370, 400), 160, 'never under the 2012 width');
    assert.equal(phoneMapWidth(tall, 800, 900), 300);
    assert.equal(phoneMapWidth(null, 370, 400), 370);
  });

  it('lists the signposts left to right with the way they stand from you', () => {
    const rows = phoneSignRows([
      { id: 'b', x: 1800, y: 0, tip: 'Groddle Meadow\nHeights' },
      { id: 'a', x: 100, y: 0, tip: 'Ferncaster End' },
      { id: 'c', x: 1010, y: 0, tip: null },
    ], 1000);
    assert.deepEqual(rows.map((r) => [r.id, r.side, r.text]), [
      ['a', 'left', 'Ferncaster End'],
      ['c', 'here', 'Signpost'],
      ['b', 'right', 'Groddle Meadow, Heights'],
    ]);
    assert.equal(phoneSignRows([{ id: 'x', x: 5, tip: 'Y' }], null)[0].side, 'here');
  });

  it('makes the map on open and frees it on close; closed, a tick is a street check', () => {
    assert.match(feature, /phoneInstall\(engine\);\n\s*return;/);
    assert.match(feature, /view = createStreetMinimap\(doc, mapBox, \{/);
    assert.match(feature, /function phoneClose\(engine, \{ walked = false \} = \{\}\) \{\n\s*if \(!phone\) return;\n\s*clearSnaps\(\);\n\s*stopArt\(\);\n\s*view\?\.destroy\(\);\n\s*view = null;/);
    // A walk from the map or a destination closes it.
    assert.match(feature, /const ok = walkFromMap\(engine, goal, how\);\n\s*if \(ok\) phoneClose\(engine, \{ walked: true \}\);/);
    // A new street or a hiding moment closes it.
    assert.match(feature, /if \(engine\.street !== street \|\| stateFor\(engine\) !== 'shown'\) \{\n\s*phoneClose\(engine, \{ walked: true \}\);/);
    // The corner card's setting never hides the sheet.
    assert.match(feature, /pref: phone \? true : streetMapOn\(\),/);
    // destroy zeroes the picture canvases.
    assert.match(view, /destroy\(\) \{[\s\S]*?pic\.width = 0;\n\s*pic\.height = 0;[\s\S]*?snapPic = null;/);
    assert.equal(PHONE_MAP_TEXT.open, 'Street map');
  });

  it('style.css: the button on a phone only, the sheet over everything, a list beside the map sideways', () => {
    assert.ok(block.length > 800);
    assert.match(block, /^\.smm-phone-btn \{ display: none; \}/m);
    assert.match(block, /:root\.touch-phone #game-root \.street-nameplate > \.smm-phone-btn:not\(\[hidden\]\) \{/);
    assert.match(block, /\.smm-sheet \{\n\s*position: fixed; inset: 0; z-index: var\(--z-dialog\);/);
    assert.match(block, /@media \(orientation: landscape\) \{\n\s*\.smm-sheet-card \{ display: grid;/);
    assert.doesNotMatch(block, /—/);
  });
});
