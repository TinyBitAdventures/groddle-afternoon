// Austin's iPhone (2026-11-13, p13): "Not having the minimap makes it hard to find streets. Any
// suggestions for getting a mini map working on the phone? Maybe an icon which opens minimap full
// screen then closes when finished?" A phone still has no corner card (G370 phone rule), but a map
// button at the front of the street's name opens the same map full screen, with the signposts'
// destinations listed; a walk, the X, a tap outside or Esc closes it, and closing frees it.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { PHONE_MAP_TEXT, phoneMapLinkAllowed, phoneMapWidth, phoneSignRows } from '../public/js/features/street-minimap-feature.js?v=0532991a';

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

  it('#600: a tall street never covers the head or the list (measured once the list is in)', () => {
    const open = feature.slice(feature.indexOf('function phoneOpen(engine)'), feature.indexOf('function phoneClose('));
    const listIn = open.indexOf('signsBox.append(list);');
    const noneIn = open.indexOf('signsBox.append(p);');
    const measured = open.indexOf('const availH =');
    assert.ok(listIn > 0 && noneIn > 0 && measured > 0);
    assert.ok(measured > listIn && measured > noneIn, 'the map box is measured after the list takes its room');
    assert.ok(open.indexOf('view = createStreetMinimap(') > measured);
    assert.match(block, /\.smm-sheet-map \{ position: relative; flex: 1 1 0; min-height: 0;/);
    assert.match(block, /\.smm-sheet-head, \.smm-sheet-signs \{ position: relative; z-index: var\(--z-raised\); \}/);
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
    assert.match(feature, /function phoneClose\(engine, \{ walked = false, map = false \} = \{\}\) \{\n\s*if \(!phone\) return;\n\s*clearSnaps\(\);\n\s*stopArt\(\);\n\s*view\?\.destroy\(\);\n\s*view = null;/);
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

describe('G858 (#409): the phone street sheet opens the Map', () => {
  const fakeDoc = ({ btn = true, disabled = false, hide = false } = {}) => ({
    getElementById: (id) => (id === 'map-btn' && btn ? { disabled } : null),
    body: { classList: { contains: (c) => hide && c === 'nx-hide-map' } },
  });
  it('offers the Map where the bar\'s Map button is live, never where the game takes the Map away', () => {
    assert.equal(phoneMapLinkAllowed(fakeDoc()), true);
    assert.equal(phoneMapLinkAllowed(fakeDoc({ btn: false })), false);
    assert.equal(phoneMapLinkAllowed(fakeDoc({ disabled: true })), false);
    assert.equal(phoneMapLinkAllowed(fakeDoc({ hide: true })), false);
    assert.equal(phoneMapLinkAllowed(null), false);
  });
  it('a Map button in the head, beside the X: it closes the sheet and opens the Map', () => {
    assert.equal(PHONE_MAP_TEXT.map, 'Map');
    assert.match(feature, /<button type="button" class="smm-sheet-mapbtn" aria-label="\$\{PHONE_MAP_TEXT\.mapLabel\}" hidden>/);
    assert.match(feature, /phoneClose\(engine, \{ map: true \}\);\s*engine\.openMap\(\);/);
    assert.match(feature, /walked \? 'walked' : map \? 'map' : 'closed'/);
    assert.match(css, /\.smm-sheet-mapbtn \{\n[^}]*height: 44px;/);
    assert.match(read('public/game.js'), /openMap: \(hubId, opts\) => openMap\(hubId, opts\),/);
  });
});
