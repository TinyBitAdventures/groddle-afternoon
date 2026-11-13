/**
 * PHONE ZOOM SHARPNESS (Austin 2026-11-13: "Yes, let the phone draw sharper when zoomed in, if it can
 * handle it"): zoomed in, a phone's renderer resolution rises until its backing store holds what the
 * whole-street view's did (js/render-density.js phoneZoomResolution, PHONE_ZOOM_RESOLUTION_CAP),
 * applied once when a pinch ends (game.js stageResolution, resizeRendererToView). Art files and
 * recoloured bakes keep the phone's render cap (PHONE_RENDER_RESOLUTION, #284).
 * Run: node --test tests/phone-zoom-resolution.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PHONE_RENDER_RESOLUTION, PHONE_ZOOM_RESOLUTION_CAP, RESOLUTION_STEP, phoneZoomResolution, renderResolution, resolutionCap } from '../public/js/render-density.js?v=74c6f5f9';
import { MIN_PACK_HEIGHT, stageFor } from '../public/js/location-view.js?v=cfef3b43';
import { recolourBakeResolution, streetBakeResolution } from '../public/js/street-render.js?v=57d38e04';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const game = readFileSync(join(root, 'public/game.js'), 'utf8');
const fnBody = (name) => {
  const at = game.indexOf(`function ${name}(`);
  assert.ok(at >= 0, name);
  return game.slice(at, game.indexOf('\n}\n', at));
};
const PACK = 132;
const PHONE = { width: 402, height: 660, packReserve: PACK, sceneWidth: 4000, sceneHeight: 1000, phone: true };
const resAt = (closeup, cap) => {
  const far = stageFor({ ...PHONE, closeup: 0 });
  const s = stageFor({ ...PHONE, closeup });
  return { s, far, res: phoneZoomResolution({ cssWidth: 402, viewW: s.viewW, viewH: s.canvasH, dpr: 3, budgetPx: far.viewW * far.canvasH, cap }) };
};

describe('phoneZoomResolution: the whole-street canvas\'s backing px, spent on fewer world px', () => {
  it('level 0 stays at 1; the closest rises to the cap, never past the budget', () => {
    assert.equal(resAt(0).res, 1);
    const near = resAt(1, 4);
    const budget = near.far.viewW * near.far.canvasH;
    assert.ok(budget > 0.75e6 && budget < 0.8e6, `about 0.78 MP at 402 x 660 (${budget})`);
    assert.ok(near.res > 1.4 && near.res <= 1.55, `uncapped ${near.res}`);
    assert.ok(near.s.viewW * near.s.canvasH * near.res ** 2 <= budget, 'the backing store holds the budget');
    assert.ok(resAt(1).res <= PHONE_ZOOM_RESOLUTION_CAP);
    assert.ok(resAt(0.5, 4).res > 1 && resAt(0.5, 4).res < near.res, 'it follows the zoom');
  });
  it('the screen\'s density, the cap and 1 bound it; it sits on the step grid', () => {
    assert.equal(phoneZoomResolution({ cssWidth: 100, viewW: 400, viewH: 600, dpr: 3, budgetPx: 4e6, cap: 4 }), 1, 'never under 1');
    assert.equal(phoneZoomResolution({ cssWidth: 400, viewW: 400, viewH: 600, dpr: 1.2, budgetPx: 4e6, cap: 4 }), 1.2, 'no more than scale x DPR');
    assert.equal(phoneZoomResolution({ cssWidth: 400, viewW: 400, viewH: 600, dpr: 3, budgetPx: 4e6, cap: 1.25 }), 1.25, 'the cap');
    assert.equal(phoneZoomResolution({ cssWidth: 400, viewW: 400, viewH: 600, dpr: 3, budgetPx: 0 }), 1);
    assert.equal(phoneZoomResolution({}), 1);
    const r = phoneZoomResolution({ cssWidth: 400, viewW: 400, viewH: 600, dpr: 3, budgetPx: 400 * 600 * 1.37 ** 2, cap: 4 });
    assert.equal(r, 1.35, 'rounded down to the grid');
    assert.ok(Math.abs(r / RESOLUTION_STEP - Math.round(r / RESOLUTION_STEP)) < 1e-9);
  });
  it('the phone\'s render cap for art and bakes is unchanged', () => {
    assert.equal(resolutionCap({ device: 'phone' }), PHONE_RENDER_RESOLUTION);
    assert.equal(PHONE_RENDER_RESOLUTION, 1);
    assert.equal(renderResolution(402, 456, 3, PHONE_RENDER_RESOLUTION), 1);
  });
});

describe('streetBakeResolution: a street\'s own bakes stay at the bake cap', () => {
  const render = readFileSync(join(root, 'public/js/street-render.js'), 'utf8');
  it('a zoomed-in phone (1.5, cap 1) bakes at 1; a computer (cap 4) at its resolution', () => {
    assert.equal(streetBakeResolution({ resolution: 1.5 }, PHONE_RENDER_RESOLUTION), 1);
    assert.equal(streetBakeResolution({ resolution: 2.5 }, resolutionCap({ device: 'computer' })), 2.5);
    assert.equal(streetBakeResolution({ resolution: 1.5 }), 1.5, 'no cap: the renderer\'s');
    assert.equal(streetBakeResolution(null, 1), 1);
    assert.equal(recolourBakeResolution(2, PHONE_RENDER_RESOLUTION), 1, 'recoloured copies stay at 1 on a phone');
  });
  it('the blur bakes, skirt, edge mirrors, sharp copies and animated decos read it', () => {
    assert.match(render, /blurBakeResolution\(size, streetBakeResolution\(renderer, state\.cap\)\)/);
    assert.match(render, /let res = Math\.min\(2, streetBakeResolution\(renderer, root\.bakeResolutionCap\)\);/);
    assert.match(render, /const base = streetBakeResolution\(renderer, root\.bakeResolutionCap\);/);
    assert.match(render, /sharpDeco\(url, streetBakeResolution\(renderer, recolourCache\.resolutionCap\), \{/);
    assert.match(render, /resolution: streetBakeResolution\(renderer, recolourCache\.resolutionCap\),\n\s*far,/);
    const reads = render.split('\n').filter((l) => /renderer\??\.resolution/.test(l) && !/^\s*(\*|\/\/)/.test(l) && !/function streetBakeResolution|Number\(renderer\?\.resolution\)/.test(l));
    assert.deepEqual(reads, [], 'no other reads of the live resolution');
  });
});

describe('game.js: the phone zoom resolution goes through one place', () => {
  it('stageResolution: the device rule, raised only for a zoomed-in phone stage without ?density=', () => {
    const fn = fnBody('stageResolution');
    assert.match(fn, /const base = renderResolution\(cssWidth, VIEW_W, dpr, RENDER_CAP\);/);
    assert.match(fn, /if \(!TOUCH_PHONE \|\| DENSITY_ASKED \|\| !\(phoneCloseup\(\) > 0\)\) return base;/);
    assert.match(fn, /closeup: 0 \}\);/);
    assert.match(fn, /budgetPx: far\.viewW \* far\.canvasH/);
  });
  it('the renderer resizes take it; the pinch preview still holds the renderer until the lift', () => {
    assert.match(fnBody('syncRenderResolution'), /const next = stageResolution\(cssWidth\);/);
    assert.match(fnBody('resizeRendererToView'), /const resolution = stageResolution\(cssWidth\);/);
    assert.match(fnBody('syncRenderResolution'), /pinchPreview\) return;/);
    assert.equal((game.match(/renderResolution\(cssWidth, VIEW_W/g) || []).length, 1, 'only stageResolution reads the device rule for the stage');
  });
  it('the street\'s bakes and recoloured copies name their own cap, not the raised resolution', () => {
    assert.match(game, /bakeResolutionCap: STREET_BAKE_CAP,/);
    assert.match(game, /const STREET_BAKE_CAP = RENDER_CAP;/);
  });
  it('the phone stage reads the same pack reserve the test assumes', () => {
    assert.match(game, /const PACK_VIEW_RESERVE = 132;/);
    assert.ok(MIN_PACK_HEIGHT > 0);
  });
});
