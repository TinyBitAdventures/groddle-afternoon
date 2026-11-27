/**
 * Report #337 (G759, Semsan Simile): a street whose narrowest layer is narrower than
 * the window drew magnified to fill it (1.76 times on a 1687 px window), so the avatar looked twice
 * its size. Austin's call (2026-11-15): actual size with plain borders at the sides. A street keeps
 * the scale any other street gets in that window; the view stops at the street's width and the
 * canvas is that much narrower, centred (js/location-view.js computerStage, game.js stageArgs
 * sceneBorders, style.css NARROW STREETS). Phones keep filling the screen.
 *
 * Report #580 (Sarda Rapt, a 1687 x 966 window): the borders read as black bars on a street you can
 * pan (its sky is 1050 px wide, the street 1500). Glitch's view never grew past the narrowest layer
 * (TSMainView.as 514) and filled its frame, so game.js asks for no borders now: a street narrower
 * than the window's view magnifies just enough to fill it, every other street keeps the zoom's
 * scale. The border option itself (stageFor sceneBorders) is unchanged and still tested here.
 * Run: node --test tests/narrow-street-borders.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LOCATION_VIEW_W, MIN_PACK_HEIGHT, sceneViewWidthCap, stageFor } from '../public/js/location-view.js?v=b178fe66';

const here = dirname(fileURLToPath(import.meta.url));
const semsan = JSON.parse(readFileSync(join(here, '../public/assets/streets/GCR105E77812AEF.json'), 'utf8'));
const WORLD_W = semsan.bounds.r - semsan.bounds.l;
const cap = sceneViewWidthCap({ worldW: WORLD_W, street: semsan }, WORLD_W);
// A plain wide street for the same window: what "the same scale as other streets" means.
const wide = (w, h, extra = {}) => stageFor({ width: w, height: h, packReserve: MIN_PACK_HEIGHT, sceneWidth: 6000, sceneHeight: 1000, sceneBorders: true, ...extra });
const narrow = (w, h, extra = {}) => stageFor({ width: w, height: h, packReserve: MIN_PACK_HEIGHT, sceneWidth: cap, sceneHeight: 2240, sceneBorders: true, ...extra });

describe('report #337: Semsan Simile at actual size between borders', () => {
  it('its far layer (960 wide) caps the view', () => {
    assert.equal(semsan.label, 'Semsan Simile');
    assert.equal(WORLD_W, 1200);
    assert.equal(cap, 960);
  });

  for (const [w, h] of [[1687, 966 - 52], [1280, 800 - 52], [2560, 1400]]) {
    it(`${w} x ${h}: the scale of a wide street, a ${LOCATION_VIEW_W} px view, the canvas centred narrower`, () => {
      const n = narrow(w, h);
      const o = wide(w, h);
      assert.ok(Math.abs(n.scale - o.scale) < 1e-9, `scale ${n.scale} vs ${o.scale}`);
      assert.equal(n.viewW, cap);
      assert.equal(n.bordered, true);
      assert.ok(Math.abs(n.cssWidth - cap * n.scale) < 1e-6);
      assert.ok(n.cssWidth < w);
      assert.equal(n.viewH, o.viewH, 'the same height of world');
      // Before: magnified until the 960 view filled the window.
      const before = narrow(w, h, { sceneBorders: false });
      assert.ok(before.scale > n.scale * 1.2, `before ${before.scale}`);
      assert.equal(before.cssWidth, w);
    });
  }

  it('a window no wider than the street draws as before, no borders', () => {
    const n = narrow(960, 700);
    assert.equal(n.bordered, undefined);
    assert.equal(n.cssWidth, 960);
    assert.deepEqual(n, narrow(960, 700, { sceneBorders: false }));
  });

  it('the Original zoom still magnifies, borders only where the street ends', () => {
    const n = narrow(1687, 914, { zoom: 1 });
    assert.ok(n.scale > narrow(1687, 914).scale);
    assert.ok(n.viewW <= cap);
  });

  it('phones are unchanged, upright and sideways', () => {
    for (const [w, h] of [[402, 660], [874, 402]]) {
      const n = narrow(w, h, { phone: true });
      assert.deepEqual(n, narrow(w, h, { phone: true, sceneBorders: false }), `${w} x ${h}`);
      assert.equal(n.bordered, undefined);
    }
  });

  it('game.js sizes the canvas from the stage (a bordered one centred)', () => {
    const game = readFileSync(join(here, '../public/game.js'), 'utf8');
    assert.match(game, /if \(stage\.bordered\) \{\s+root\.style\.setProperty\('--stage-w', `\$\{stage\.cssWidth\.toFixed\(2\)\}px`\);\s+root\.dataset\.stageBordered = '1';/);
    const css = readFileSync(join(here, '../public/style.css'), 'utf8');
    assert.match(css, /#game-root\[data-stage-bordered\] > canvas\[role="application"\] \{\s+width: var\(--stage-w, 100%\) !important;\s+margin-inline: auto;/);
  });

  it('#386: the canvas keeps its shape without the stylesheet rule (a cached older style.css)', () => {
    const game = readFileSync(join(here, '../public/game.js'), 'utf8');
    // The bordered branch remembers the stage's CSS size, the other one forgets it; both pin it.
    assert.match(game, /root\.dataset\.stageBordered = '1';\s+stageCanvasSize = \{ w: stage\.cssWidth, h: stage\.cssHeight \};\s+\} else \{[^}]*delete root\.dataset\.stageBordered;\s+stageCanvasSize = null;\s+\}\s+pinStageCanvasSize\(\);/);
    const pin = game.slice(game.indexOf('function pinStageCanvasSize'), game.indexOf('function pinStageCanvasSize') + 900);
    for (const [prop, value] of [['width', '`${stageCanvasSize.w.toFixed(2)}px`'], ['height', '`${stageCanvasSize.h.toFixed(2)}px`'], ['margin-inline', "'auto'"]]) {
      assert.ok(pin.includes(`style.setProperty('${prop}', ${value}, 'important')`), `${prop} inline and important`);
    }
    // Off a narrow street only its own important values go: Pixi's inline size stays under the stylesheet.
    assert.match(pin, /if \(style\.getPropertyPriority\(prop\) === 'important'\) style\.removeProperty\(prop\);/);
    // Pixi's autoDensity rewrites the inline size on every renderer resize, so each resize pins it again.
    const resizes = game.match(/app\.renderer\.resize\(VIEW_W, VIEW_H, \w+\);\s+app\.canvas\.dataset\.renderResolution = String\(\w+\);\s+pinStageCanvasSize\(\);/g) || [];
    assert.equal(resizes.length, (game.match(/app\.renderer\.resize\(/g) || []).length);
    // The rule that wins without the NARROW STREETS block is still there (kept, not replaced).
    const css = readFileSync(join(here, '../public/style.css'), 'utf8');
    assert.match(css, /#game-root canvas \{\s+display: block;\s+width: 100% !important;/);
  });
});

describe('report #580: a narrow street fills the window, no black bars', () => {
  const sarda = JSON.parse(readFileSync(join(here, '../public/assets/streets/GM169I1E0C226G1.json'), 'utf8'));
  const sardaW = sarda.bounds.r - sarda.bounds.l;
  const sardaCap = sceneViewWidthCap({ worldW: sardaW, street: sarda }, sardaW);
  const game = readFileSync(join(here, '../public/game.js'), 'utf8');
  const args = game.slice(game.indexOf('function stageArgs'), game.indexOf('function measureStage'));
  // As game.js stageArgs asks for a street's stage now.
  const street = (cap, w, h, extra = {}) => stageFor({ width: w, height: h, packReserve: MIN_PACK_HEIGHT, sceneWidth: cap, sceneHeight: 2700, ...extra });

  it('Sarda Rapt: its sky (1050) caps the view on a street you can pan (1500)', () => {
    assert.equal(sarda.label, 'Sarda Rapt');
    assert.equal(sardaW, 1500);
    assert.equal(sardaCap, 1050);
  });

  it('game.js asks for no borders', () => {
    assert.ok(args.includes('sceneWidth: sceneViewWidthCap(bgLayer, WORLD_W)'));
    assert.doesNotMatch(args, /sceneBorders:/);
  });

  for (const zoom of [0, 0.5, 0.8]) {
    it(`the report's window (1687 x 914), zoom ${zoom}: the canvas fills it, the view no wider than the sky`, () => {
      const s = street(sardaCap, 1687, 914, { zoom });
      assert.equal(s.bordered, undefined);
      assert.equal(s.cssWidth, 1687);
      assert.ok(s.viewW <= sardaCap, `view ${s.viewW}`);
      // Wide is just enough: the view is the sky's width; closer zooms go on to Original's 1000 px.
      if (zoom === 0) assert.ok(s.viewW >= sardaCap - 1, `view ${s.viewW}`);
      else assert.ok(s.viewW > 1000, `view ${s.viewW}`);
      // Before (#337): the zoom's scale, between borders.
      const before = street(sardaCap, 1687, 914, { zoom, sceneBorders: true });
      assert.equal(before.bordered, true);
      assert.ok(before.cssWidth < 1687);
    });
  }

  it('the Original zoom already shows less than the sky: the same scale as any street', () => {
    const s = street(sardaCap, 1687, 914, { zoom: 1 });
    const wideStreet = street(6000, 1687, 914, { zoom: 1 });
    assert.ok(Math.abs(s.scale - wideStreet.scale) < 1e-9);
  });

  it('a street wider than the view keeps the player zoom (Wide stays wide)', () => {
    const s = street(6000, 1687, 914, { zoom: 0 });
    assert.ok(s.viewW > 1500, `view ${s.viewW}`);
    assert.equal(s.cssWidth, 1687);
  });
});
