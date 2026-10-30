/**
 * Camera Mode (features/camera-mode-feature.js): players/player.js getCameraAbilities.
 * Run: node --test tests/camera-mode.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CAMERA_RANGE, EYEBALLERY_SKILL, cameraRange, stepLook } from '../public/js/features/camera-mode-feature.js?v=0106af1c';

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
    const { SKILL_REMAKE_NOTES } = await import('../public/js/skill-tree.js?v=cf7bc81f');
    assert.equal(SKILL_REMAKE_NOTES.Eyeballery.status, 'live');
  });
});

describe('camera mode in quest instances', () => {
  const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../public/js/features/camera-mode-feature.js'), 'utf8');
  const body = src.slice(src.indexOf('function blocked('), src.indexOf('\n}', src.indexOf('function blocked(')) + 2);
  it('starts in an instance, as the client allowed (only no_camera_mode refused it)', () => {
    assert.doesNotMatch(body, /transientInstance/);
    assert.match(body, /engine\.busy\(\{ ignoreHome: true, ignoreInstance: true \}\)/, 'busy() counts an instance as busy unless asked not to');
    assert.match(body, /engine\.street\?\.noCameraMode/);
  });
  it('starts in a rebuilt room too, and still waits out an instance arrival or exit', () => {
    assert.doesNotMatch(body, /inScene/);
    assert.match(body, /engine\.instanceHold/);
  });
  it('does not end itself every tick inside an instance', () => {
    const tick = src.slice(src.indexOf('onTick('), src.indexOf('onTick(') + 400);
    assert.match(tick, /engine\.busy\(\{ ignoreHome: true, ignoreInstance: true \}\)/);
  });
});
