/**
 * PHONE6 (Austin 2026-11-12, on his iPhone, Chrome, upright): pinch to zoom the street (the phone
 * zoom, js/world-zoom.js phoneZoom, js/location-view.js phoneStage closeup, js/touch-pinch.js),
 * signpost arms a finger can hit (js/street-render.js signpostBoardAt pad), the pack row that
 * scrolls (style.css PHONE6, js/ui/pack-row.js), the featured project in the Menu instead of over
 * the street's name (js/ui/featured-project.js), Cultivate under the name and prompts above the stick.
 * Run: node --test tests/phone-pinch-pack.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MIN_PACK_HEIGHT, PHONE_CLOSEST_SHARE, VIEW_FLOOR_H, VIEW_HOLD_H, phoneStage, phoneZoomSpan, stageFor } from '../public/js/location-view.js?v=cfef3b43';
import { PHONE_ZOOM_DEFAULT, PHONE_ZOOM_STORAGE_KEY, ZOOM_DEFAULT, ZOOM_STORAGE_KEY, createWorldZoom, phoneZoomLabel } from '../public/js/world-zoom.js?v=38816228';
import { TAP_SLOP_PX, isWorldTap, pinchLevel } from '../public/js/touch-pinch.js?v=5bdb5971';
import { signpostBoardAt } from '../public/js/street-render.js?v=0f1293df';
import { MENU_ROWS } from '../public/js/ui/topbar.js?v=ab86119f';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');
const game = read('public/game.js');
const css = read('public/style.css');
const IPHONE = { width: 393, height: 659, packReserve: MIN_PACK_HEIGHT, sceneWidth: 4000, phone: true };
const memory = () => {
  const map = new Map();
  return { map, getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)) };
};

describe('the phone zoom: from the whole street to about one and a half times as close', () => {
  it('0 is the phone view as before, 1 PHONE_CLOSEST_SHARE of the way to the floors\' closest, geometric between', () => {
    assert.equal(PHONE_CLOSEST_SHARE, 0.56, 'Austin 2026-11-13: "scaled to like 56%"');
    const far = stageFor({ ...IPHONE, sceneHeight: 1000 });
    assert.deepEqual(stageFor({ ...IPHONE, sceneHeight: 1000, closeup: 0 }), far);
    assert.equal(far.viewH, VIEW_HOLD_H);
    const floors = IPHONE.height / (VIEW_FLOOR_H + MIN_PACK_HEIGHT);
    const near = stageFor({ ...IPHONE, sceneHeight: 1000, closeup: 1 });
    assert.equal(near.cssHeight, IPHONE.height);
    // The old closest's 0.56 is the new 1: far * (floors / far) ** 0.56.
    assert.ok(Math.abs(near.scale - far.scale * (floors / far.scale) ** PHONE_CLOSEST_SHARE) < 1e-9);
    assert.ok(near.scale < floors && near.viewH > VIEW_FLOOR_H, `stops short of the floors (${near.viewW} x ${near.viewH})`);
    const mid = stageFor({ ...IPHONE, sceneHeight: 1000, closeup: 0.5 });
    assert.ok(Math.abs(mid.scale - Math.sqrt(far.scale * near.scale)) < 1e-9);
    const span = phoneZoomSpan({ ...IPHONE, sceneHeight: 1000 });
    assert.ok(span > 1.45 && span < 1.55, `span ${span}`);
    assert.ok(Math.abs(span - (floors / far.scale) ** PHONE_CLOSEST_SHARE) < 1e-9, 'the pinch and slider span the new range');
  });
  it('a saved level means the same share of the new range (a saved 1 is the new closest)', () => {
    const at = (z) => stageFor({ ...IPHONE, sceneHeight: 1000, closeup: z }).scale;
    assert.ok(Math.abs(at(1) - at(7)) < 1e-12, 'held to 1');
    assert.ok(at(0.25) < at(0.5) && at(0.5) < at(1));
  });
  it('a short room magnifies less, a pinned page not at all (sideways: tests/landscape-phone-stage.test.js)', () => {
    assert.ok(phoneZoomSpan({ ...IPHONE, sceneHeight: 600 }) < phoneZoomSpan({ ...IPHONE, sceneHeight: 1000 }));
    assert.ok(phoneZoomSpan({ width: 812, height: 340, phone: true, sceneHeight: 1000 }) > 1.4, 'a sideways phone zooms too');
    assert.equal(phoneZoomSpan({ ...IPHONE, sceneHeight: 1000, pinnedHeight: 500 }), 1);
    assert.equal(phoneZoomSpan({ ...IPHONE, phone: false, sceneHeight: 1000 }), 1);
    // A computer's stage never reads it.
    assert.deepEqual(stageFor({ width: 1280, height: 720, sceneHeight: 1000, closeup: 1 }), stageFor({ width: 1280, height: 720, sceneHeight: 1000 }));
    const p = phoneStage({ ...IPHONE, sceneHeight: 1000, closeup: 7 });
    assert.deepEqual(p, phoneStage({ ...IPHONE, sceneHeight: 1000, closeup: 1 }), 'held to 1');
  });
  it('kept in its own slot, starting at the whole street; the world zoom keeps its own', () => {
    assert.equal(PHONE_ZOOM_STORAGE_KEY, 'groddle.zoom.phone');
    assert.equal(PHONE_ZOOM_DEFAULT, 0);
    const store = memory();
    const phone = createWorldZoom({ win: null, storage: store, key: PHONE_ZOOM_STORAGE_KEY, fallback: PHONE_ZOOM_DEFAULT });
    const world = createWorldZoom({ win: null, storage: store });
    assert.equal(phone.get(), 0);
    assert.equal(world.get(), ZOOM_DEFAULT);
    phone.set(0.6);
    assert.equal(store.map.get(PHONE_ZOOM_STORAGE_KEY), '0.6');
    assert.equal(store.map.has(ZOOM_STORAGE_KEY), false);
    assert.equal(createWorldZoom({ win: null, storage: store, key: PHONE_ZOOM_STORAGE_KEY, fallback: 0 }).get(), 0.6);
    assert.equal(phoneZoomLabel(0), 'Whole street');
    assert.equal(phoneZoomLabel(1), 'Closest');
    assert.equal(phoneZoomLabel(0.25), '25%');
  });
  it('game.js draws it in Modern on a phone and the Menu slider moves it there', () => {
    assert.match(game, /closeup: phoneCloseup\(\)/);
    assert.match(game, /return TOUCH_PHONE && modernUi\(\) && PINNED_VIEW_H <= 0 \? phoneZoom\.get\(\) : 0;/);
    assert.match(game, /if \(TOUCH_PHONE\) phoneZoom\.onChange\(\(\) => applyWorldZoom\(\)\);/);
    assert.match(game, /const hudZoom = TOUCH_PHONE \? phoneZoom : \{ get: worldZoom/);
  });
});

describe('a pinch zooms, a tap acts on lift, neither does the other', () => {
  it('the level follows the fingers\' spread', () => {
    assert.equal(pinchLevel(0, 100, 210, 2.1), 1);
    assert.equal(pinchLevel(1, 210, 100, 2.1), 0);
    assert.equal(pinchLevel(0.5, 100, 100, 2.1), 0.5);
    const half = pinchLevel(0, 100, Math.sqrt(2.1) * 100, 2.1);
    assert.equal(half, 0.5);
    assert.equal(pinchLevel(0.3, 100, 200, 1), 0.3, 'a street that cannot zoom stays');
    assert.equal(pinchLevel(0.3, 0, 200, 2), 0.3);
  });
  it('a tap is a still finger with no second one', () => {
    assert.equal(isWorldTap({ dx: 3, dy: 4 }), true);
    assert.equal(isWorldTap({ dx: TAP_SLOP_PX + 1, dy: 0 }), false);
    assert.equal(isWorldTap({ pinched: true }), false);
    assert.equal(isWorldTap({ cancelled: true }), false);
  });
  it('the canvas defers a real touch to the lift and keeps the old press for everything else', () => {
    assert.match(game, /if \(worldPinch\?\.defer\(e\)\) return;\n\s*worldPress\(e\);/);
    assert.match(game, /const worldPinch = TOUCH_PHONE \? installPinchZoom\(/);
    const pinch = read('public/js/touch-pinch.js');
    assert.match(pinch, /canvas\.style\.touchAction = 'none';/);
    assert.match(pinch, /e\.isTrusted === true/);
    assert.doesNotMatch(pinch, /—/);
  });
});

describe('signpost arms take a phone tap a little outside their boards', () => {
  const board = (index, y) => ({ index, x: 0, y, rotation: 0, hitArea: { x: 0, y: 0, width: 80, height: 18 }, connection: { label: `Road ${index}` } });
  const views = [{ x: 100, y: 200, signScale: 1, signBoards: [board(0, -60), board(1, -30)] }];
  it('a pointer hits the board only; a padded tap the nearest board', () => {
    assert.equal(signpostBoardAt(views, 140, 200 - 25)?.index, 1);
    assert.equal(signpostBoardAt(views, 140, 200 - 5), null, 'under the low board');
    assert.equal(signpostBoardAt(views, 140, 200 - 5, { pad: 14 })?.index, 1);
    assert.equal(signpostBoardAt(views, 140, 200 - 37, { pad: 14 })?.index, 0, 'between two: the nearer');
    assert.equal(signpostBoardAt(views, 140, 200 + 20, { pad: 14 }), null, 'too far');
    assert.equal(signpostBoardAt(views, 140, 200 - 25, { pad: 14 })?.index, 1, 'inside still wins');
  });
  it('game.js pads it on a phone only, when nothing else is under the finger', () => {
    assert.match(game, /\|\| \(TOUCH_PHONE && e\.pointerType === 'touch' \? touchSignBoard\(sx, sy\) : null\);/);
    const fn = game.slice(game.indexOf('function touchSignBoard('), game.indexOf('\n}\n', game.indexOf('function touchSignBoard(')));
    assert.match(fn, /signpostBoardAt\(signViewsHere\(\), sx, sy, \{ pad: SIGN_TOUCH_PAD_PX \/ \(STAGE_SCALE \|\| 1\) \}\)/);
    assert.match(fn, /if \(under && under !== near\.board\?\.target && under\.sprite !== near\.view\) return null;/);
  });
});

describe('PHONE6 css: phones only', () => {
  const block = css.slice(css.indexOf('/* PHONE6 '), css.indexOf('/* end PHONE6 */'));
  const rules = block.replace(/\/\*[\s\S]*?\*\//g, '').split('}').map((r) => r.trim()).filter(Boolean);
  it('every rule is a phone rule but the row\'s hidden default', () => {
    assert.ok(rules.length > 10);
    for (const r of rules) {
      const sel = r.split('{')[0].trim();
      if (sel === '#menu-featured-btn') continue;
      for (const part of sel.split(/,(?![^(]*\))/)) assert.match(part.trim(), /^:root\.touch-phone/, part);
    }
  });
  it('the pack scrolls in #pack-scroll with a snap per slot; the count and search stay out of it', () => {
    assert.match(block, /#pack-bar:not\(\[data-hb-dock\]\) \.pack-scroll \{[^}]*overflow-x: auto;[^}]*scroll-snap-type: x proximity;/);
    assert.match(block, /\.pack-scroll \.pack-slot \{ scroll-snap-align: start; touch-action: pan-x; \}/);
    const html = read('public/play/index.html');
    const scroll = html.slice(html.indexOf('id="pack-scroll"'), html.indexOf('id="pack-pager"'));
    assert.doesNotMatch(scroll, /pack-count|pack-search/);
    assert.match(read('public/js/ui/pack-row.js'), /function refreshScrollEdges\(\)/);
  });
  it('the featured pill makes way for the street name; the Menu carries it', () => {
    assert.match(block, /:root\.touch-phone\[data-ui="modern"\] #featured-project-pill \{ display: none; \}/);
    assert.deepEqual(MENU_ROWS['menu-featured-btn'], { group: 'now', rank: 4 });
    assert.match(read('public/js/ui/featured-project.js'), /renderFeaturedMenuRow\(doc, o\.hide \? null : f, o\);/);
  });
  it('prompts start above the stick and Jump; home buttons under the name', () => {
    assert.match(block, /\.prompt-stack \{ bottom: calc\(var\(--pack-live-height, 72px\) \+ env\(safe-area-inset-bottom, 0px\) \+ 132px/);
    assert.match(block, /\.homes-modes \{ top: calc\(2 \* var\(--hud-h\)/);
  });
});
