/**
 * G673 ("Zoomed in on a phone, your Glitch sits high in the view"): the phone's camera anchor
 * (js/location-view.js phoneCameraAnchor) is the desktop's 0.75 of the room over the real pack row,
 * not of a view that ends at the 132 world px pack reserve the zoom magnifies.
 * Run: node --test tests/phone-camera-anchor-g673.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MIN_PACK_HEIGHT, phoneCameraAnchor, stageFor } from '../public/js/location-view.js?v=cfef3b43';
import { MIN_GROUND_CLEARANCE, cameraTargetY } from '../public/js/movement.js?v=b30f84eb';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const game = readFileSync(join(root, 'public/game.js'), 'utf8');
const PACK_CSS = 64; // the phone's pack row over the canvas (WebKit, 402 x 660 and 874 x 402)
const feetCss = (stage, anchor) => anchor * stage.viewH * stage.scale;

describe('G673: a zoomed-in phone frames the avatar like the desktop camera', () => {
  it('sideways at the closest level: the feet come down from 46% of the screen, clear of the pack', () => {
    const s = stageFor({ width: 874, height: 402, packReserve: MIN_PACK_HEIGHT, sceneWidth: 4000, sceneHeight: 1000, phone: true, closeup: 1 });
    const a = phoneCameraAnchor({ anchor: 0.75, viewH: s.viewH, packCoverCss: PACK_CSS, scale: s.scale, clearance: MIN_GROUND_CLEARANCE });
    assert.ok(feetCss(s, 0.75) / 402 < 0.48, 'the old framing');
    assert.ok(a > 0.9 && a <= 0.95, `anchor ${a}`);
    const packTop = 402 - PACK_CSS;
    assert.ok(packTop - feetCss(s, a) >= MIN_GROUND_CLEARANCE * s.scale, 'feet stay clear of the real pack');
  });
  it('upright at the closest level: 0.75 of the room over the pack row', () => {
    const s = stageFor({ width: 402, height: 660, packReserve: MIN_PACK_HEIGHT, sceneWidth: 4000, sceneHeight: 1000, phone: true, closeup: 1 });
    const a = phoneCameraAnchor({ anchor: 0.75, viewH: s.viewH, packCoverCss: PACK_CSS, scale: s.scale });
    const room = s.viewH + MIN_PACK_HEIGHT - PACK_CSS / s.scale;
    assert.ok(Math.abs(a * s.viewH - 0.75 * room) < 1e-9);
    assert.ok(a > 0.75 && a < 0.9, `anchor ${a}`);
  });
  it('never higher than the given anchor; no measured pack keeps it; a street\'s own offset scales the same way', () => {
    assert.equal(phoneCameraAnchor({ anchor: 0.75, viewH: 600, packCoverCss: 200, scale: 1 }), 0.75, 'a pack taller than the reserve never lifts the feet');
    assert.equal(phoneCameraAnchor({ anchor: 0.75, viewH: 600, packCoverCss: NaN, scale: 1 }), 0.75);
    assert.equal(phoneCameraAnchor({ anchor: 0.6, viewH: 400, scale: 1 }), 0.6);
    const a = phoneCameraAnchor({ anchor: 0.6, viewH: 400, packCoverCss: 60, scale: 1 });
    assert.ok(Math.abs(a * 400 - 0.6 * (400 + 132 - 60)) < 1e-9);
    assert.ok(phoneCameraAnchor({ anchor: 0.9, viewH: 200, packCoverCss: 0, scale: 2 }) <= 0.95);
    // cameraTargetY honours it: the feet land at anchor x view down the location view.
    assert.equal(1000 - cameraTargetY(1000, 3000, 300, 0.9), 270);
  });
  it('game.js feeds it from the measured pack row, on phones in Modern only', () => {
    assert.match(game, /if \(!TOUCH_PHONE \|\| !modernUi\(\) \|\| PINNED_VIEW_H > 0\) return anchor;\n\s*return phoneCameraAnchor\(\{ anchor, viewH: LOCATION_VIEW_H, packReserve: PACK_VIEW_RESERVE, packCoverCss: cameraPackCoverCss, scale: STAGE_SCALE/);
    assert.match(game, /function syncCameraSafeArea\(\) \{\n\s*syncCameraPackCover\(\);/);
  });
});
