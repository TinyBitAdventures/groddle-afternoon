/**
 * ZOOM (Austin 2026-10-30): the world zoom from Wide (the stage's own rule) to Original (a
 * 1000 px view magnified to fill), a device preference: js/world-zoom.js, js/location-view.js
 * stageFor `zoom`, Classic's frame (js/classic/classic-layout.js, classic-zoom.js), the controls.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  ZOOM_STORAGE_KEY,
  clampZoom,
  zoomLabel,
  zoomValueText,
  zoomKeyAction,
  nextZoom,
  loadZoom,
  saveZoom,
  createWorldZoom,
} from '../public/js/world-zoom.js?v=b5f4748a';
import { stageFor, ORIGINAL_VIEW_W, ORIGINAL_VIEW_H, LOCATION_VIEW_W, VIEW_FLOOR_H, MIN_PACK_HEIGHT } from '../public/js/location-view.js?v=5a0d5c0b';
import { classicLayout, classicScale, classicZoomScale, chromeWidth, railFor } from '../public/js/classic/classic-layout.js?v=299eef68';
import { classicZoomVar } from '../public/js/classic/classic-zoom.js?v=7a25123e';
import { hotkeySections, clientKeyAction } from '../public/js/client-hotkeys.js?v=b45e776c';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(root, 'public', rel), 'utf8');

const memory = () => {
  const map = new Map();
  return { map, getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), removeItem: (k) => map.delete(k) };
};

test('the Original end is the 2012 client largest view (LayoutModel.as max_vp_w, max_vp_h)', () => {
  assert.equal(ORIGINAL_VIEW_W, 1000);
  assert.equal(ORIGINAL_VIEW_H, 600);
  const client = path.resolve(root, '..', 'glitch-client', 'com', 'tinyspeck', 'engine', 'model', 'LayoutModel.as');
  if (fs.existsSync(client)) {
    const src = fs.readFileSync(client, 'utf8');
    assert.match(src, /max_vp_w:int = 1000;/);
    assert.match(src, /max_vp_h:int = 600;/);
  }
});

test('levels, labels and keys', () => {
  assert.equal(clampZoom(undefined), 1);
  assert.equal(clampZoom('nope'), 1);
  assert.equal(clampZoom(null), 1, 'unreadable reads as the default, Original');
  assert.equal(clampZoom(2), 1);
  assert.equal(clampZoom(-1), 0);
  assert.equal(clampZoom(0.333), 0.33);
  assert.equal(zoomLabel(0), 'Wide');
  assert.equal(zoomLabel(1), 'Original');
  assert.equal(zoomLabel(0.4), '40%');
  assert.match(zoomValueText(0.4), /40% of the way from Wide to Original/);
  for (const t of [zoomLabel(0.5), zoomValueText(0.5), zoomValueText(1)]) assert.doesNotMatch(t, /—/);
  assert.equal(zoomKeyAction({ key: '=' }), 'in');
  assert.equal(zoomKeyAction({ key: '+', shiftKey: true }), 'in');
  assert.equal(zoomKeyAction({ key: '-' }), 'out');
  assert.equal(zoomKeyAction({ key: '0' }), 'reset');
  // Ctrl or Cmd with +/- is the browser's page zoom.
  for (const mod of ['ctrlKey', 'metaKey', 'altKey']) {
    assert.equal(zoomKeyAction({ key: '=', [mod]: true }), null, mod);
    assert.equal(zoomKeyAction({ key: '-', [mod]: true }), null, mod);
  }
  assert.equal(zoomKeyAction({ key: 'z' }), null);
  assert.equal(nextZoom(0, 'in'), 0.1);
  assert.equal(nextZoom(0.95, 'in'), 1);
  assert.equal(nextZoom(0.05, 'out'), 0);
  assert.equal(nextZoom(0.7, 'reset'), 1, '0 goes back to the default, Original');
  let z = 0;
  for (let i = 0; i < 10; i++) z = nextZoom(z, 'in');
  assert.equal(z, 1, 'ten presses from Wide to Original');
});

test('the zoom keys are free: no client key and no hotkey sheet row already takes them', () => {
  for (const key of ['=', '-', '0', '+']) assert.equal(clientKeyAction({ key }), null, key);
  const view = hotkeySections().find((s) => s.title === 'View');
  assert.deepEqual(view.rows.slice(1).map((r) => r[1][0][0]), ['=', '-', '0']);
  // game.js takes them after the typing guard and the open panels, before the plain letters.
  const game = read('game.js');
  const guard = game.indexOf("if (e.target?.matches?.('input, textarea, select, [contenteditable=\"true\"]')) {");
  const zoomAt = game.indexOf('const zoomKey = zoomKeyAction(e);');
  const menuAt = game.indexOf('if (verbMenuKey(document.getElementById(\'verb-menu\'), e)) {');
  assert.ok(guard > 0 && zoomAt > guard, 'typing in chat or search never zooms');
  assert.ok(menuAt > 0 && zoomAt > menuAt, 'an open verb menu keeps 0 for Back');
});

test('stored per device: new players get Original, storage that throws reads Original', () => {
  const store = memory();
  assert.equal(loadZoom(store), 1);
  saveZoom(0.6, store);
  assert.equal(store.map.get(ZOOM_STORAGE_KEY), '0.6');
  assert.equal(loadZoom(store), 0.6);
  saveZoom(0, store);
  assert.equal(store.map.get(ZOOM_STORAGE_KEY), '0', 'a Wide choice is kept, so it is not read back as the default');
  assert.equal(loadZoom(store), 0);
  const broken = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); }, removeItem() { throw new Error('blocked'); } };
  assert.equal(loadZoom(broken), 1);
  assert.doesNotThrow(() => saveZoom(1, broken));
  const zoom = createWorldZoom({ win: null, storage: store });
  const seen = [];
  zoom.onChange((v, before) => seen.push([v, before]));
  zoom.set(1);
  zoom.set(1);
  zoom.step('out');
  assert.deepEqual(seen, [[1, 0], [0.9, 1]]);
  assert.equal(createWorldZoom({ win: null, storage: store }).get(), 0.9, 'the next page load keeps it');
});

test('purely local: no save, server or multiplayer module knows the zoom', () => {
  const offenders = [];
  for (const rel of fs.readdirSync(path.join(root, 'public', 'js'), { recursive: true })) {
    if (!String(rel).endsWith('.js')) continue;
    const src = read(path.join('js', String(rel)));
    if (!/from '[^']*world-zoom\.js|groddle\.zoom/.test(src)) continue;
    offenders.push(String(rel));
  }
  assert.deepEqual(offenders.sort(), ['classic/classic-frame.js', 'classic/classic-prefs.js', 'classic/classic-zoom.js', 'ui/topbar.js', 'world-zoom.js']);
  assert.doesNotMatch(read('js/save-store.js'), /zoom/i);
});

// The game area at each window (Modern: the top bar floats over #game-root, so it is the window).
const WINDOWS = [[1280, 800], [1440, 900], [1920, 1080], [2560, 1080], [1024, 640]];

test('stageFor: Wide is the old rule, Original a view of about 1000 px, never under 960 x 408', () => {
  for (const [W, H] of WINDOWS) {
    const wide = stageFor({ width: W, height: H });
    assert.deepEqual(stageFor({ width: W, height: H, zoom: 0 }), wide, `${W}x${H} zoom 0`);
    const orig = stageFor({ width: W, height: H, zoom: 1 });
    assert.ok(orig.scale >= wide.scale, `${W}x${H} closer`);
    assert.ok(orig.viewW >= LOCATION_VIEW_W && orig.viewH >= VIEW_FLOOR_H, `${W}x${H} floors ${orig.viewW}x${orig.viewH}`);
    assert.ok(orig.viewW <= ORIGINAL_VIEW_W || orig.viewH === VIEW_FLOOR_H || W < LOCATION_VIEW_W, `${W}x${H} about 1000 wide`);
    assert.ok(orig.viewH <= ORIGINAL_VIEW_H, `${W}x${H} at most 600 tall`);
    assert.equal(orig.cssWidth, W);
    assert.equal(orig.cssHeight, H);
  }
  // The windows Austin checks.
  assert.equal(stageFor({ width: 1280, height: 800, zoom: 1 }).viewW, 1000);
  assert.equal(stageFor({ width: 1920, height: 1080, zoom: 1 }).viewW, 1000);
  // An ultrawide window: the 408 floor holds and Original shows a wider strip.
  const ultra = stageFor({ width: 2560, height: 1080, zoom: 1 });
  assert.equal(ultra.viewH, VIEW_FLOOR_H);
  assert.ok(ultra.viewW > 1000);
});

test('stageFor: zoom steps are continuous and even, the same share at every window', () => {
  for (const [W, H] of WINDOWS) {
    const wide = stageFor({ width: W, height: H }).scale;
    const orig = stageFor({ width: W, height: H, zoom: 1 }).scale;
    let last = wide;
    for (let i = 1; i <= 20; i++) {
      const s = stageFor({ width: W, height: H, zoom: i / 20 }).scale;
      assert.ok(s >= last - 1e-9, `${W}x${H} grows`);
      assert.ok(Math.abs(s / last - (orig / wide) ** (1 / 20)) < 1e-9, `${W}x${H} even steps`);
      last = s;
    }
  }
});

test('stageFor: small scenes and the floors win at any zoom, viewh pins ignore it', () => {
  const home = stageFor({ width: 1920, height: 1080, sceneWidth: 1100, sceneHeight: 500 });
  const homeOrig = stageFor({ width: 1920, height: 1080, sceneWidth: 1100, sceneHeight: 500, zoom: 1 });
  assert.ok(homeOrig.viewW <= 1100 && home.viewW <= 1100);
  assert.ok(homeOrig.viewH >= VIEW_FLOOR_H);
  // Under the floors the stage shrinks the same at any zoom.
  assert.deepEqual(stageFor({ width: 900, height: 500, zoom: 1 }), stageFor({ width: 900, height: 500 }));
  assert.equal(stageFor({ width: 900, height: 500, zoom: 1 }).viewH, VIEW_FLOOR_H);
  assert.deepEqual(stageFor({ width: 1600, height: 1, pinnedHeight: 500, zoom: 1 }), stageFor({ width: 1600, height: 1, pinnedHeight: 500 }));
});

test('Classic: the zoomed u is the one stageFor returns on the cell, and Wide is the closed form', () => {
  for (const [W, H] of [[1280, 800], [1440, 900], [1920, 1080], [2560, 1440], [1100, 700], [1600, 1000]]) {
    for (const contactsOpen of [false, true]) {
      const chrome = chromeWidth({ contactsOpen, rail: railFor(W, { contactsOpen }) });
      assert.ok(Math.abs(classicZoomScale(W, H, { chrome, zoom: 0 }) - classicScale(W, H, { chrome })) < 1e-9, `${W}x${H} wide`);
      let last = 0;
      for (const zoom of [0, 0.25, 0.5, 0.75, 1]) {
        const L = classicLayout({ width: W, height: H, contactsOpen, zoom });
        assert.ok(Math.abs(L.stage.scale - L.u) < 1e-6, `${W}x${H} ${zoom}: stage ${L.stage.scale} u ${L.u}`);
        assert.ok(L.u >= last - 1e-9 && L.u >= 1, `${W}x${H} ${zoom} grows`);
        assert.ok(L.stage.viewW >= LOCATION_VIEW_W && L.stage.viewH >= VIEW_FLOOR_H, `${W}x${H} ${zoom} floors`);
        last = L.u;
      }
    }
  }
  // Original window size is the 2012 picture: the zoom does not move it.
  assert.deepEqual(classicLayout({ width: 1920, height: 1080, size: 'original', zoom: 1 }).stage, classicLayout({ width: 1920, height: 1080, size: 'original' }).stage);
});

test('Classic: --cu-zoom only when Classic fills the window past Wide', () => {
  const at = { width: 1920, height: 1080 };
  assert.equal(classicZoomVar({ ...at, mode: 'modern', size: 'fill', zoom: 1 }), null);
  assert.equal(classicZoomVar({ ...at, mode: 'classic', size: 'fill', zoom: 0 }), null);
  assert.equal(classicZoomVar({ ...at, mode: 'classic', size: 'original', zoom: 1 }), null);
  const v = classicZoomVar({ ...at, mode: 'classic', size: 'fill', zoom: 1 });
  assert.match(v, /^1\.\d+px$/);
  assert.equal(Number.parseFloat(v).toFixed(3), classicLayout({ ...at, zoom: 1 }).u.toFixed(3));
  const css = read('css/classic.css');
  assert.match(css, /--cu: var\(--cu-zoom, max\(1px,/);
});

test('the controls: Menu Settings and the Sound popover (topbar), Preferences, and the stage wiring', () => {
  const topbar = read('js/ui/topbar.js');
  assert.match(topbar, /zoomSlider\(doc, zoom, \{ id: 'sound-zoom', where: 'sound' \}\)/);
  assert.match(topbar, /id: 'menu-zoom', where: 'menu'/);
  assert.match(topbar, /\[data-menu-group="settings"\]/);
  const prefs = read('js/classic/classic-prefs.js');
  assert.match(prefs, /id: 'prefs-zoom'/);
  const game = read('game.js');
  assert.match(game, /zoom: worldZoom\(\),\n\s*\}\);/);
  assert.match(game, /onZoomChange\(\(\) => applyWorldZoom\(\)\);/);
  assert.match(game, /syncLocationViewHeight\(\{ keepFraming: true \}\)/);
  // game.js loads Classic's zoom before main() adds its resize listener.
  assert.ok(game.indexOf("import './js/classic/classic-zoom.js?v=") < game.indexOf("window.addEventListener('resize', () => {"));
  assert.ok(MIN_PACK_HEIGHT === 132);
});
