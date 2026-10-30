/**
 * G99: places with their own authored light opt out of the world-only Dametime tint
 * (#daylight-overlay) through one flag, `ownLight`, on a street JSON or an enterScene
 * scene, instead of game.js hard-coding A Summer's Day. The original client had no
 * world tint at all (glitch-client TimeController only announces the clock), so the
 * tint stays a remake touch for Ur's streets and is off in the Giants' memories and
 * the white voids.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const game = read('public/game.js');
const qi = read('public/js/features/quest-instances-feature.js');

test('game.js reads the flag, not a hard-coded room', () => {
  const fn = game.slice(game.indexOf('function updateDametimeChrome('), game.indexOf('function toast('));
  assert.match(fn, /const preserveAuthoredLight = Boolean\(currentStreet\?\.ownLight\)/);
  assert.doesNotMatch(fn, /summersDayIsInstanced/);
  // G427: the tint is drawn in Pixi under the speech bubbles; the flag zeroes it there.
  assert.match(fn, /setAtmosphere\(light\.color, worldTintOpacity\(light\.opacity, \{ on: nightTintOn\(\), ownLight: Boolean\(currentStreet\?\.ownLight\) \}\)\);/);
  // enterScene carries it onto the street record the overlay reads.
  const enter = game.slice(game.indexOf('  enterScene(scene) {'), game.indexOf('  enterScene(scene) {') + 1600);
  assert.match(enter, /ownLight: Boolean\(scene\.ownLight\)/);
  // Quest rooms pass the scene's or the room's flag.
  assert.match(qi, /ownLight: Boolean\(scene\.ownLight \?\? room\.ownLight\)/);
});

test('the white voids and memory places opt out; ordinary rooms keep the tint', async () => {
  const flagged = ['top-of-tree', 'color-unblocking', 'an-autumn-day'];
  for (const id of flagged) {
    const { room } = await import(`../public/js/quest-rooms/${id}.js`);
    assert.equal(room.ownLight, true, id);
  }
  // Gwendolyn's Task: only the Inner Mind stage (a white void) opts out.
  assert.match(read('public/js/quest-rooms/gwendolyn.js'), /if \(stage === 'inner_mind'\) return \{ \.\.\.buildInner\(ctx\), ownLight: true \};/);
  for (const id of ['rainbow-run', 'juju-camp', 'le-miserable']) {
    const { room } = await import(`../public/js/quest-rooms/${id}.js`);
    assert.ok(!room.ownLight, `${id} keeps the Dametime tint`);
  }
});
