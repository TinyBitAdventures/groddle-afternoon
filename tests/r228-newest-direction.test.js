/**
 * Report #228 (live, Dr Flavius): at the start of Cloud Flight and Slip 'N Slide the arrows (and
 * sometimes A and D) did nothing while Space flew; the avatar sat at the spawn's x (200). With a Left
 * and a Right both in the held set, the flight and slide steering cancelled out and the street walk
 * always went left. The client kept its held keys newest first (KeyBeacon.as _keyDownFire 278-283)
 * and steered toward the side pressed last (AvatarPhysicsHandler.as 350-360, pressedBefore 223-225),
 * so a key it still thought was down never stopped a fresh press. js/held-keys.js heldDirection.
 * Run: node --test tests/r228-newest-direction.test.js
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { createHeldKeys, heldDirection } from '../public/js/held-keys.js?v=a28eb293';

const root = join(import.meta.dirname, '..', 'public');
const game = readFileSync(join(root, 'game.js'), 'utf8');
const runtime = readFileSync(join(root, 'js', 'paradise-course-runtime.js'), 'utf8');

/** game.js's keydown: the guard first (capture), then the game adds the key. */
function press(keys, held, key, extra = {}) {
  const e = { key, code: extra.code || key, isTrusted: true, repeat: false, shiftKey: false, target: null, ...extra };
  held.keydown(e);
  keys.add(key);
}

describe('report 228: the newest walking key wins', () => {
  it('reads the side of the newest Left or Right name', () => {
    assert.equal(heldDirection(new Set()), 0);
    assert.equal(heldDirection(new Set([' '])), 0);
    assert.equal(heldDirection(new Set(['ArrowLeft'])), -1);
    assert.equal(heldDirection(new Set(['d'])), 1);
    assert.equal(heldDirection(new Set(['ArrowLeft', ' ', 'ArrowRight'])), 1);
    assert.equal(heldDirection(new Set(['ArrowRight', 'A'])), -1);
  });

  it('a stale Left and Right never stop a fresh press (not a Mac: no reset on a direction)', () => {
    const keys = new Set(['ArrowLeft', 'ArrowRight', 'a', 'd']);
    const held = createHeldKeys(keys, { mac: false });
    press(keys, held, 'ArrowRight');
    assert.equal(heldDirection(keys), 1, 'Right pressed again is the newest');
    press(keys, held, 'a');
    assert.equal(heldDirection(keys), -1);
    press(keys, held, ' ');
    assert.equal(heldDirection(keys), -1, 'Space changes no side');
    // A repeat keeps its key the newest one too (KeyBeacon moved it on every keydown).
    press(keys, held, 'd', { repeat: true });
    assert.equal(heldDirection(keys), 1);
  });

  it('letting go of the newest side goes back to the other one still held', () => {
    const keys = new Set();
    const held = createHeldKeys(keys, { mac: false });
    press(keys, held, 'ArrowLeft');
    press(keys, held, 'ArrowRight');
    assert.equal(heldDirection(keys), 1);
    held.keyup({ key: 'ArrowRight', code: 'ArrowRight' });
    assert.equal(heldDirection(keys), -1);
  });

  it('the street walk, Cloud Flight, Slip and Slide and the nine courses all steer by it', () => {
    assert.match(game, /import \{ heldDirection, installHeldKeyGuard, isMacPlatform \} from '\.\/js\/held-keys\.js/);
    assert.match(game, /const heldSide = keyed \? heldDirection\(keys\) : 0;\n\s+let left = heldSide < 0;\n\s+let right = heldSide > 0;/);
    for (const fn of ['handleParadiseSlideInput', 'handleParadiseFlightInput']) {
      const body = game.slice(game.indexOf(`function ${fn}(`), game.indexOf('\n}\n', game.indexOf(`function ${fn}(`)));
      assert.match(body, /const left = heldDirection\(keys\) < 0;\n\s+const right = heldDirection\(keys\) > 0;/, fn);
      assert.doesNotMatch(body, /keys\.has\('ArrowLeft'\)|keys\.has\('ArrowRight'\)/, fn);
    }
    assert.match(runtime, /left: heldDirection\(keys\) < 0,\n\s+right: heldDirection\(keys\) > 0,/);
    assert.doesNotMatch(game + runtime, /keys\.has\('ArrowLeft'\) \|\| keys\.has\('a'\)/);
  });
});
