/**
 * #149 (2026-11-08): on Clamber Crag the zoom keys seemed to do nothing. The street's narrowest
 * layer (its sky, 1000 px) caps the view as the original did (TSMainView.as 514), so Wide and
 * Original draw the same picture. The game marks such a street fixed: the keys leave the level
 * alone and say why, and the sliders rest with a note (js/world-zoom.js ZOOM_FIXED_NOTE).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ZOOM_FIXED_NOTE, ZOOM_KEYS_HINT, createWorldZoom, zoomKeyToast } from '../public/js/world-zoom.js?v=38816228';
import { zoomMovesStage, sceneViewWidthCap, sceneViewCap, MIN_PACK_HEIGHT } from '../public/js/location-view.js?v=cfef3b43';
import { zoomSlider } from '../public/js/ui/topbar.js?v=23c2cb54';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const street = (tsid) => JSON.parse(read(`public/assets/streets/${tsid}.json`));

function fakeDoc() {
  const make = (tag) => ({
    tagName: tag.toUpperCase(), children: [], attrs: {}, dataset: {}, listeners: {}, textContent: '', innerHTML: '', className: '', id: '', disabled: false,
    append(...kids) { this.children.push(...kids); },
    setAttribute(k, v) { this.attrs[k] = String(v); },
    getAttribute(k) { return this.attrs[k] ?? null; },
    addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); },
  });
  return { activeElement: null, createElement: make };
}

test('Clamber Crag in the reporter\'s window draws the same at every zoom; a long street does not', () => {
  const crag = street('GCR1OU9H34K19OE');
  const layer = { street: crag, worldW: crag.bounds.r - crag.bounds.l, worldH: crag.bounds.b - crag.bounds.t };
  assert.equal(sceneViewWidthCap(layer), 1000, 'the sky layer caps the view at 1000 px');
  const win = { width: 1318, height: 700, packReserve: MIN_PACK_HEIGHT };
  assert.equal(zoomMovesStage({ ...win, sceneWidth: sceneViewWidthCap(layer), sceneHeight: sceneViewCap(layer) }), false);
  assert.equal(zoomMovesStage({ ...win, sceneWidth: 4000, sceneHeight: 1000 }), true);
  // A street narrower than Wide but wider than Original still zooms over what it has.
  assert.equal(zoomMovesStage({ ...win, sceneWidth: 1200, sceneHeight: 1000 }), true);
  assert.equal(zoomMovesStage({ width: 1318, height: 1, pinnedHeight: 408 }), false, 'the pinned QA page ignores zoom');
});

test('a fixed street keeps the level and the keys say why', () => {
  const zoom = createWorldZoom({ win: null, storage: null });
  zoom.set(0.5);
  const heard = [];
  zoom.onFixedChange((f) => heard.push(f));
  zoom.setFixed(true);
  zoom.setFixed(true);
  assert.deepEqual(heard, [true], 'told once per change');
  for (const key of ['in', 'out', 'reset']) {
    assert.equal(zoom.step(key), 0.5, `${key} leaves the level`);
    assert.equal(zoomKeyToast(key, true), 'Zoom: this street looks the same at every zoom.');
  }
  zoom.setFixed(false);
  assert.equal(zoom.step('out'), 0.4, 'off the street the keys step again');
  assert.equal(zoomKeyToast('out', false), '');
  assert.equal(zoomKeyToast('reset', false), 'Zoom: Original (press - to zoom out)');
  assert.doesNotMatch(ZOOM_FIXED_NOTE, /—|Glitch/);
});

test('the Menu and Sound sliders rest with the note while the street is fixed', () => {
  const zoom = createWorldZoom({ win: null, storage: null });
  const { row, input } = zoomSlider(fakeDoc(), zoom, { id: 'menu-zoom', where: 'menu' });
  const keys = row.children.find((n) => n.className === 'hud-zoom-keys');
  assert.equal(keys.textContent, ZOOM_KEYS_HINT);
  assert.equal(input.disabled, false);
  zoom.setFixed(true);
  assert.equal(keys.textContent, ZOOM_FIXED_NOTE);
  assert.equal(input.disabled, true);
  assert.ok('zoomFixed' in row.dataset);
  zoom.setFixed(false);
  assert.equal(keys.textContent, ZOOM_KEYS_HINT);
  assert.equal(input.disabled, false);
  assert.ok(!('zoomFixed' in row.dataset));
});

test('the game marks the street from its stage, in Modern only, and the keys pass it on', () => {
  const game = read('public/game.js');
  assert.match(game, /setZoomFixed\(streetZoomFixed\(\)\)/);
  assert.match(game, /function streetZoomFixed\(\) \{\n  if \(PINNED_VIEW_H > 0 \|\| !modernUi\(\)/);
  assert.match(game, /zoomKeyToast\(zoomKey, fixed\)/);
  assert.match(game, /fixed: zoomFixed, onFixedChange: onZoomFixedChange/);
  assert.match(read('public/style.css'), /\.hud-zoom\[data-zoom-fixed\] input/);
});
