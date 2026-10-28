/**
 * Camera Mode (features/camera-mode-feature.js): players/player.js getCameraAbilities.
 * Run: node --test tests/camera-mode.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CAMERA_RANGE, EYEBALLERY_SKILL, cameraRange, stepLook } from '../public/js/features/camera-mode-feature.js';

const here = dirname(fileURLToPath(import.meta.url));

describe('camera mode', () => {
  it('looks 400 px from the avatar, or the whole street with Eyeballery', () => {
    assert.equal(CAMERA_RANGE, 400);
    assert.equal(cameraRange([]), 400);
    assert.equal(cameraRange([EYEBALLERY_SKILL]), Infinity);
  });

  it('pans with held directions and stops at the range', () => {
    let look = { x: 0, y: 0 };
    look = stepLook(look, { x: 1, y: 0 }, 100, 400);
    assert.ok(look.x > 0 && look.y === 0);
    for (let i = 0; i < 50; i++) look = stepLook(look, { x: 1, y: -1 }, 100, 400);
    assert.deepEqual(look, { x: 400, y: -400 });
    for (let i = 0; i < 50; i++) look = stepLook(look, { x: 1, y: 0 }, 100, Infinity);
    assert.ok(look.x > 400);
  });

  it('is registered and the engine offsets the camera target', () => {
    const index = readFileSync(join(here, '../public/js/features/index.js'), 'utf8');
    assert.match(index, /cameraModeFeature/);
    const game = readFileSync(join(here, '../public/game.js'), 'utf8');
    assert.match(game, /cameraTargetForPlayer\(player\.x \+ cameraLook\.x/);
    assert.match(game, /setCameraLook\(/);
  });

  it('the Eyeballery note no longer says the camera is missing', async () => {
    const { SKILL_REMAKE_NOTES } = await import('../public/js/skill-tree.js?v=g403-1');
    assert.equal(SKILL_REMAKE_NOTES.Eyeballery.status, 'live');
  });
});
