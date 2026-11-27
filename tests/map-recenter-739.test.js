/**
 * #739: the Map's "Region" button took you back to your own region, but it was drawn as a selected
 * tab and stayed lit while you looked at another region. In Glitch it was the recenter button
 * (HubMapDialog.as 172-190, tooltip "Go to my location"; onRecenterClick 1330-1379): an action that
 * goes back to where you are, never a state. It is now named so and never shown as selected; World
 * and Subway stay the views that show which one is on.
 * Run: node --test tests/map-recenter-739.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mapViewPressed } from '../public/js/map-views.js?v=7ff57fbc';

const here = dirname(fileURLToPath(import.meta.url));
const read = (rel) => readFileSync(join(here, '..', rel), 'utf8');
const buttonFor = (page, view) => (page.match(new RegExp(`<button[^>]*data-map-view="${view}"[^>]*>[\\s\\S]*?</button>`)) || [''])[0];

describe('#739 the Map\'s "Go to my location" button', () => {
  it('is never pressed, whatever the Map shows; World and Subway show which view is on', () => {
    for (const shown of ['hub', 'world', 'subway']) assert.equal(mapViewPressed('hub', shown), null, shown);
    assert.equal(mapViewPressed('world', 'world'), true);
    assert.equal(mapViewPressed('world', 'hub'), false);
    assert.equal(mapViewPressed('subway', 'subway'), true);
    assert.equal(mapViewPressed('subway', 'world'), false);
  });

  it('both pages name it as Glitch did and draw it as an action, not a tab', () => {
    for (const page of [read('public/play/index.html'), read('public/play/online/index.html')]) {
      const btn = buttonFor(page, 'hub');
      assert.ok(btn, 'the button is there');
      assert.match(btn, /title="Go to my location"/);
      assert.match(btn, /<span>Go to my location<\/span>/);
      assert.doesNotMatch(btn, /role="tab"|aria-selected|aria-pressed|>Region</);
      assert.doesNotMatch(page, /class="map-views" role="tablist"/);
      for (const v of ['world', 'subway']) assert.match(buttonFor(page, v), /aria-pressed="false"/, v);
    }
  });

  it('markMapView marks only World and Subway, and a click on it always goes back to your region', () => {
    const game = read('public/game.js');
    const mark = game.slice(game.indexOf('function markMapView('), game.indexOf('/** G471: the world map or the subway map'));
    assert.doesNotMatch(mark, /aria-selected/);
    assert.match(mark, /mapViewPressed\(btn\.dataset\.mapView, which\)/);
    assert.match(mark, /if \(next === 'hub'\) mapPanelHubId = null;/);
  });

  it('no style lights it: the lit look is for a pressed view, in Modern and Classic', () => {
    for (const css of [read('public/style.css'), read('public/css/classic.css')]) {
      assert.doesNotMatch(css, /map-view-btn\[aria-selected/);
      assert.match(css, /map-view-btn\[aria-pressed="true"\]/);
    }
  });
});
