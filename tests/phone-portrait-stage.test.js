/**
 * TOUCH PORTRAIT: an upright phone's stage (js/location-view.js phoneStage) and the tutorial pill
 * on a phone (js/touch-controls.js phoneScreenFrame). Austin (2026-11-12, iPhone, Chrome, held
 * upright): the street was a 0.41x strip under a 400 px band of sky, and "The banner isn't aligned
 * top left" (it sat on the stage's letterboxed top, halfway down the screen).
 * Run: node --test tests/phone-portrait-stage.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MIN_PACK_HEIGHT, PHONE_PORTRAIT_MIN_VIEW_W, VIEW_FLOOR_H, VIEW_HOLD_H, phoneStage, stageFor } from '../public/js/location-view.js?v=57e8e487';
import { phoneScreenFrame } from '../public/js/touch-controls.js?v=9621609b';
import { tutorialPillSpot } from '../public/js/newxp.js?v=45ae5f37';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const game = readFileSync(join(root, 'public/game.js'), 'utf8');
// Playwright's iPhone 15 Pro (Safari's visible page) and Austin's 402 px Chrome.
const IPHONE = { width: 393, height: 659 };

describe('an upright phone fits the street to the screen', () => {
  it('before: the computer rule letterboxed it (the width floor)', () => {
    const old = stageFor({ ...IPHONE, sceneHeight: 1000 });
    assert.equal(old.viewW, 960);
    assert.ok(old.cssHeight < IPHONE.height * 0.75);
  });
  it('a street fills the screen, its whole height in view', () => {
    const s = stageFor({ ...IPHONE, sceneHeight: 1200, sceneWidth: 4000, phone: true });
    assert.equal(s.viewH, VIEW_HOLD_H);
    assert.equal(s.cssHeight, IPHONE.height);
    assert.equal(s.cssWidth, IPHONE.width);
    assert.ok(Math.abs(s.scale - IPHONE.height / (VIEW_HOLD_H + MIN_PACK_HEIGHT)) < 1e-9);
    assert.equal(s.viewW, 675);
    // Drawn bigger than the computer rule's 0.41.
    assert.ok(s.scale > 0.55);
  });
  it('a short room keeps the narrowest view and a band above, never a keyhole', () => {
    const s = stageFor({ ...IPHONE, sceneHeight: 450, sceneWidth: 3000, phone: true });
    assert.equal(s.viewW, PHONE_PORTRAIT_MIN_VIEW_W);
    assert.equal(s.viewH, 450);
    assert.ok(s.cssHeight < IPHONE.height);
  });
  it('a scene narrower than the view magnifies to fill it, inside the floors', () => {
    const s = phoneStage({ ...IPHONE, sceneHeight: 600, sceneWidth: 500 });
    assert.ok(s.viewW <= 500);
    assert.ok(s.viewH >= VIEW_FLOOR_H);
  });
  it('sideways, a pinned page and computers keep the old rule', () => {
    const land = { width: 734, height: 343 };
    assert.deepEqual(stageFor({ ...land, sceneHeight: 1000, phone: true }), stageFor({ ...land, sceneHeight: 1000 }));
    assert.deepEqual(stageFor({ ...IPHONE, pinnedHeight: 500, phone: true }), stageFor({ ...IPHONE, pinnedHeight: 500 }));
    assert.match(game, /\/\/ TOUCH PORTRAIT: an upright phone fits the scene's height to the screen \(location-view phoneStage\)\.\n\s*phone: TOUCH_PHONE,/);
  });
  it('zoom does nothing upright', () => {
    const a = stageFor({ ...IPHONE, sceneHeight: 1000, phone: true, zoom: 0 });
    const b = stageFor({ ...IPHONE, sceneHeight: 1000, phone: true, zoom: 1 });
    assert.equal(a.scale, b.scale);
  });
});

describe('the tutorial pill on a phone', () => {
  it('measures from the screen\'s safe area, not the stage', () => {
    const frame = phoneScreenFrame(393, 659, { top: 0, left: 0 });
    assert.deepEqual(frame, { left: 0, top: 0, width: 393, height: 659 });
    // Under the stats pill at the top-left, never at a letterboxed stage's top (196 px down before).
    assert.deepEqual(tutorialPillSpot(frame, { left: 8, top: 4, right: 204, bottom: 48, width: 196, height: 44 }), { left: 10, top: 56 });
    assert.deepEqual(tutorialPillSpot(frame, null), { left: 10, top: 10 });
    // A notch on the left (sideways, viewport-fit=cover): the pill clears it.
    const notch = phoneScreenFrame(852, 393, { left: 59, right: 59, bottom: 21 });
    assert.deepEqual(notch, { left: 59, top: 0, width: 734, height: 372 });
    assert.deepEqual(tutorialPillSpot(notch, null), { left: 69, top: 10 });
  });
});
