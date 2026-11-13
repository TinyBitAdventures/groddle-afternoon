/**
 * LANDSCAPE PHONE (Austin 2026-11-13: phones play upright and sideways): a sideways phone's own stage
 * (js/location-view.js landscapePhoneStage). Level 0 is the computer rule it always took; the phone
 * zoom (pinch, the Menu's slider) now magnifies from there, LANDSCAPE_PHONE_CLOSEST_SHARE of the way
 * to the scale the same phone reaches upright with a 408 px view filling its long side.
 * Run: node --test tests/landscape-phone-stage.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  LANDSCAPE_PHONE_CLOSEST_SHARE,
  MIN_PACK_HEIGHT,
  PHONE_CLOSEST_SHARE,
  VIEW_FLOOR_H,
  landscapePhoneStage,
  phoneZoomSpan,
  stageFor,
  zoomMovesStage,
} from '../public/js/location-view.js?v=cfef3b43';
import { phoneZoomResolution } from '../public/js/render-density.js?v=74c6f5f9';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const game = readFileSync(join(root, 'public/game.js'), 'utf8');
/** The audit's sizes (lane landscape, 2026-11-13) and each 40 px shorter for Safari's bar. */
const SIZES = [[874, 402], [932, 430], [667, 375], [750, 362]].flatMap(([w, h]) => [[w, h], [w, h - 40]]);
const args = (w, h, extra = {}) => ({ width: w, height: h, packReserve: MIN_PACK_HEIGHT, sceneWidth: 4000, sceneHeight: 1000, phone: true, ...extra });

describe('a sideways phone\'s stage', () => {
  it('level 0 is exactly the old sideways view (never narrower)', () => {
    for (const [w, h] of SIZES) {
      const old = stageFor({ ...args(w, h), phone: false });
      const now = stageFor(args(w, h));
      assert.equal(now.landscape, true);
      assert.equal(now.phone, true);
      assert.equal(now.scale, old.scale, `${w}x${h}`);
      assert.equal(now.viewW, old.viewW, `${w}x${h}`);
      assert.equal(now.viewH, old.viewH, `${w}x${h}`);
    }
    // The audit's 874 x 402: 1174 x 408, the avatar 86 CSS px.
    const s = stageFor(args(874, 402));
    assert.equal(s.viewW, 1174);
    assert.equal(s.viewH, VIEW_FLOOR_H);
  });
  it('the closest level is its own share, starting at portrait\'s 0.56, geometric between', () => {
    assert.equal(LANDSCAPE_PHONE_CLOSEST_SHARE, 0.56, 'Austin 2026-11-13: starts at portrait\'s 56%');
    assert.equal(LANDSCAPE_PHONE_CLOSEST_SHARE, PHONE_CLOSEST_SHARE);
    for (const [w, h] of SIZES) {
      const far = stageFor(args(w, h));
      const near = stageFor(args(w, h, { closeup: 1 }));
      const top = w / (VIEW_FLOOR_H + MIN_PACK_HEIGHT);
      assert.ok(Math.abs(near.scale - far.scale * (top / far.scale) ** LANDSCAPE_PHONE_CLOSEST_SHARE) < 1e-9, `${w}x${h}`);
      const mid = stageFor(args(w, h, { closeup: 0.5 }));
      assert.ok(Math.abs(mid.scale - Math.sqrt(far.scale * near.scale)) < 1e-9);
      // The canvas fills the screen; the view is the room over the pack reserve, shorter than the floor.
      assert.equal(near.cssHeight, h);
      assert.equal(near.cssWidth, w);
      assert.ok(near.viewH < VIEW_FLOOR_H && near.viewH > 150, `${w}x${h} view ${near.viewW} x ${near.viewH}`);
      assert.ok(near.viewH + MIN_PACK_HEIGHT <= h / near.scale + 1e-6);
      const span = phoneZoomSpan(args(w, h));
      assert.ok(span > 1.3 && span < 1.75, `${w}x${h} span ${span}`);
      assert.ok(Math.abs(span - near.scale / far.scale) < 1e-12);
    }
  });
  it('the avatar comes out about as big at the closest level either way up', () => {
    const land = stageFor(args(874, 402, { closeup: 1 }));
    const up = stageFor(args(402, 874, { closeup: 1 }));
    assert.ok(Math.abs(land.scale / up.scale - 1) < 0.08, `${land.scale} vs ${up.scale}`);
  });
  it('held to 0..1; a pinned page and computers never read it; the world zoom stays fixed sideways', () => {
    assert.deepEqual(landscapePhoneStage(args(874, 402, { closeup: 5 })), landscapePhoneStage(args(874, 402, { closeup: 1 })));
    assert.equal(phoneZoomSpan(args(874, 402, { pinnedHeight: 500 })), 1);
    assert.deepEqual(stageFor({ ...args(874, 402, { closeup: 1 }), phone: false }), stageFor({ ...args(874, 402), phone: false }));
    assert.equal(zoomMovesStage(args(874, 402)), false, 'Wide and Original still draw the same at a sideways phone\'s height');
  });
  it('a home narrower than the view keeps the old framing at level 0 and zooms on from there', () => {
    const far = stageFor(args(874, 402, { sceneWidth: 900, sceneHeight: 620 }));
    assert.equal(far.scale, stageFor({ ...args(874, 402, { sceneWidth: 900, sceneHeight: 620 }), phone: false }).scale);
    const near = stageFor(args(874, 402, { sceneWidth: 900, sceneHeight: 620, closeup: 1 }));
    assert.ok(near.scale > far.scale);
  });
  it('the zoomed-in backing store stays within the whole view\'s budget (phoneZoomResolution)', () => {
    const far = stageFor(args(874, 402));
    const near = stageFor(args(874, 402, { closeup: 1 }));
    const res = phoneZoomResolution({ cssWidth: 874, viewW: near.viewW, viewH: near.canvasH, dpr: 3, budgetPx: far.viewW * far.canvasH });
    assert.ok(res > 1);
    assert.ok(near.viewW * near.canvasH * res * res <= far.viewW * far.canvasH + 1);
    // game.js applies that budget to any phone stage (far.phone), sideways included.
    assert.match(game, /if \(!far\.phone\) return base;/);
  });
});

describe('the companion page says both ways up', () => {
  it('"Upright or sideways", still new and experimental, still asking for a report', async () => {
    const { PHONE_TEXT } = await import('../public/js/phone/companion-data.js?v=e9d3d3d4');
    assert.equal(PHONE_TEXT.fullHint, 'New and experimental. Upright or sideways. Send a report if something goes wrong.');
    assert.doesNotMatch(PHONE_TEXT.fullHint, /upright,|Hold your phone/);
  });
});
