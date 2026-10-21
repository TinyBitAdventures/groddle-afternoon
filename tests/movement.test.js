import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  TRIPLE_JUMP_WINDOW_MS,
  JUMP_BUFFER_MS,
  COYOTE_TIME_MS,
  TRIPLE_JUMP_UPGRADES,
  createJumpState,
  queueJump,
  noteGrounded,
  noteJumped,
  resolveQueuedJump,
  rawTripleJumpMultiplier,
  scaledTripleJumpMultiplier,
  tripleJumpProfile,
  dampingAlpha,
  cameraLocationViewWidth,
  cameraOverlayCenterX,
  cameraTargetX,
  cameraTargetY,
  cameraBottomSlack,
  cameraWorldHeightForGround,
} from '../public/js/movement.js';
import { streetHeight, platformsScreen } from '../public/js/street-model.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function land(state, now) {
  noteGrounded(state, true, now);
  return state;
}

function jump(state, now, upgrades = ['jump_triple_1'], velocityX = 0) {
  queueJump(state, now);
  return resolveQueuedJump(state, {
    now,
    grounded: true,
    upgrades,
    velocityX,
    maxVelocityX: 4.4,
  });
}

test.describe('official chained Triple Jump', () => {
  test('ports the three imagination upgrade tiers and official 500 ms window', () => {
    assert.equal(TRIPLE_JUMP_WINDOW_MS, 500);
    assert.equal(JUMP_BUFFER_MS, 140);
    assert.equal(COYOTE_TIME_MS, 90);
    assert.deepEqual(
      TRIPLE_JUMP_UPGRADES.map(({ id, multiplier }) => [id, multiplier]),
      [
        ['jump_triple_1', 0.7],
        ['jump_triple_2', 0.82],
        ['jump_triple_3', 1],
      ]
    );
    assert.equal(tripleJumpProfile(['jump_triple_1']).label, 'Baby Triple Jump');
    assert.equal(tripleJumpProfile(['jump_triple_1', 'jump_triple_3']).id, 'jump_triple_3');
    assert.equal(tripleJumpProfile([]), null);
  });

  test('matches AvatarPhysicsHandler timing and speed curves', () => {
    assert.equal(rawTripleJumpMultiplier(0, 0), 1.5);
    assert.equal(rawTripleJumpMultiplier(29, 1), 1.8);
    assert.equal(rawTripleJumpMultiplier(30, 0.5), 1.5);
    assert.equal(rawTripleJumpMultiplier(100, 0.5), 1.35);
    assert.equal(rawTripleJumpMultiplier(200, 1), 1.2);
    assert.equal(scaledTripleJumpMultiplier(1.5, 0.7), 1.35);
    assert.equal(scaledTripleJumpMultiplier(1.5, 0.82), 1.41);
    assert.equal(scaledTripleJumpMultiplier(1.5, 1), 1.5);
  });

  test('boosts only the third quick floor jump, then resets the chain', () => {
    const state = createJumpState(0);
    const first = jump(state, 1_000);
    assert.deepEqual(
      { ok: first.ok, number: first.jumpNumber, triple: first.triple, multiplier: first.multiplier },
      { ok: true, number: 1, triple: false, multiplier: 1 }
    );

    land(state, 1_700);
    const second = jump(state, 1_800);
    assert.equal(second.jumpNumber, 2);
    assert.equal(second.triple, false);

    land(state, 2_500);
    const third = jump(state, 2_600, ['jump_triple_1'], 2.2);
    assert.equal(third.jumpNumber, 3);
    assert.equal(third.triple, true);
    assert.equal(third.multiplier, 1.245);
    assert.equal(third.profile.id, 'jump_triple_1');
    assert.equal(state.chainCount, 0);
    assert.equal(state.tripleJumps, 1);
    assert.equal(state.jumps, 3);
  });

  test('starts over when the next landing jump misses the official window', () => {
    const state = createJumpState();
    jump(state, 100);
    land(state, 700);
    const late = jump(state, 1_201);
    assert.equal(late.jumpNumber, 1);
    assert.equal(late.triple, false);
    assert.equal(state.chainCount, 1);
  });

  test('buffers an early press through landing and allows a short coyote jump', () => {
    const buffered = createJumpState();
    noteGrounded(buffered, false, 1_000);
    noteJumped(buffered);
    queueJump(buffered, 1_100);
    assert.equal(resolveQueuedJump(buffered, { now: 1_100, grounded: false }).reason, 'airborne_buffered');
    land(buffered, 1_180);
    assert.equal(resolveQueuedJump(buffered, { now: 1_181, grounded: true }).ok, true);

    const coyote = createJumpState(2_000);
    noteGrounded(coyote, false, 2_010);
    queueJump(coyote, 2_080);
    assert.equal(resolveQueuedJump(coyote, { now: 2_080, grounded: false }).reason, 'coyote_jump');

    const tooLate = createJumpState(3_000);
    noteGrounded(tooLate, false, 3_010);
    noteJumped(tooLate);
    queueJump(tooLate, 3_120);
    assert.equal(resolveQueuedJump(tooLate, { now: 3_120, grounded: false }).reason, 'airborne_buffered');
  });

  test('one air jump after walking off a ledge, none after a jump (hasJumpedSinceFloor)', () => {
    const ledge = createJumpState(4_000);
    noteGrounded(ledge, false, 4_010);
    queueJump(ledge, 4_600);
    assert.equal(resolveQueuedJump(ledge, { now: 4_600, grounded: false }).reason, 'air_jump');
    queueJump(ledge, 4_800);
    assert.equal(resolveQueuedJump(ledge, { now: 4_800, grounded: false }).reason, 'airborne_buffered');
    land(ledge, 5_000);
    assert.equal(ledge.jumpedSinceFloor, false);
  });
});

test.describe('smooth directional camera and client wiring', () => {
  test('looks ahead in the movement direction and clamps at street edges', () => {
    const still = cameraTargetX(1_000, 0, 3_000, 1_000);
    const right = cameraTargetX(1_000, 4.4, 3_000, 1_000);
    const left = cameraTargetX(1_000, -4.4, 3_000, 1_000);
    assert.equal(still, 500);
    assert.equal(right, 620);
    assert.equal(left, 380);
    assert.equal(cameraTargetX(20, -4.4, 3_000, 1_000), 0);
    assert.equal(cameraTargetX(2_980, 4.4, 3_000, 1_000), 2_000);
  });

  test('reserves the quest rail without letting the avatar pass underneath it', () => {
    const inset = 180;
    assert.equal(cameraLocationViewWidth(1_000, inset), 820);
    assert.equal(cameraOverlayCenterX(800, 240, 1_000, inset, 10), 690);
    assert.equal(cameraOverlayCenterX(10, 240, 1_000, inset, 10), 130);
    const target = cameraTargetX(2_980, 4.4, 3_000, 1_000, 4.4, inset);
    assert.equal(target, 2_180);
    assert.equal(2_980 - target, 800);
    assert.ok(2_980 - target < 1_000 - inset);
  });

  test('frames low platforms against the pack-safe location viewport', () => {
    const locationViewHeight = 540 - 132;
    assert.equal(locationViewHeight, 408);
    assert.equal(cameraTargetY(20, 1_000, locationViewHeight), 0);
    assert.equal(cameraBottomSlack(locationViewHeight), 102);

    const lowestPlatformY = 1_034;
    const cameraWorldHeight = cameraWorldHeightForGround(
      1_000,
      lowestPlatformY,
      locationViewHeight
    );
    const cameraY = cameraTargetY(
      lowestPlatformY,
      cameraWorldHeight,
      locationViewHeight
    );
    const playerScreenY = lowestPlatformY - cameraY;
    assert.equal(playerScreenY, 306);
    assert.equal(locationViewHeight - playerScreenY, 102);
    assert.ok(playerScreenY < locationViewHeight, 'feet stay above the pack');
  });

  test('repairs authored worlds whose declared height ends above their ground', () => {
    const locationViewHeight = 408;
    const homeGroundY = 620;
    const cameraWorldHeight = cameraWorldHeightForGround(
      540,
      homeGroundY,
      locationViewHeight
    );
    assert.equal(cameraWorldHeight, 722);
    const cameraY = cameraTargetY(homeGroundY, cameraWorldHeight, locationViewHeight);
    assert.equal(cameraY, 314);
    assert.equal(homeGroundY - cameraY, 306);
    assert.equal(locationViewHeight - (homeGroundY - cameraY), 102);
  });

  test('keeps the lowest platform above the pack in every imported street', () => {
    const locationViewHeight = 540 - 132;
    const streetsDir = path.join(root, 'public/assets/streets');
    const streetFiles = fs.readdirSync(streetsDir)
      .filter((file) => file.endsWith('.json') && file !== 'index.json');
    let checked = 0;

    for (const file of streetFiles) {
      const street = JSON.parse(fs.readFileSync(path.join(streetsDir, file), 'utf8'));
      if (!street?.bounds || !Array.isArray(street.platforms) || !street.platforms.length) continue;
      const platforms = platformsScreen(street);
      const lowestPlatformY = Math.max(
        ...platforms.flatMap((platform) => [platform.y1, platform.y2])
      );
      const cameraWorldHeight = Math.ceil(cameraWorldHeightForGround(
        streetHeight(street),
        lowestPlatformY,
        locationViewHeight
      ));
      const playerScreenY = lowestPlatformY - cameraTargetY(
        lowestPlatformY,
        cameraWorldHeight,
        locationViewHeight
      );

      assert.ok(
        playerScreenY < locationViewHeight,
        `${street.tsid || file} leaves the avatar behind the pack`
      );
      checked += 1;
    }

    assert.ok(checked > 1_400, `expected the full street catalog, checked ${checked}`);
  });

  test('keeps camera damping equivalent across split frames', () => {
    const once = dampingAlpha(0.08, 2);
    const split = 1 - (1 - dampingAlpha(0.08, 1)) ** 2;
    assert.ok(Math.abs(once - split) < 1e-12);
    assert.equal(dampingAlpha(0.12, 0), 0);
  });

  test('uses edge-triggered requests, blocks panels, exposes QA, and keeps mute opt-in', () => {
    const game = fs.readFileSync(path.join(root, 'public/game.js'), 'utf8');
    const html = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');
    assert.match(game, /!e\.repeat && \[' ', 'ArrowUp', 'w', 'W'\]\.includes\(e\.key\)/);
    assert.match(game, /queueJump\(jumpState, movementNow\(\)\)/);
    assert.match(game, /resolveQueuedJump\(jumpState/);
    assert.match(game, /gameplayInputBlocked\(\)/);
    assert.match(game, /cameraTargetForPlayer\(player\.x, player\.vx/);
    assert.match(game, /dataset\.cameraRightInset/);
    assert.match(game, /clampWorldOverlayX\(prompt\.x, prompt\.width/);
    assert.match(game, /clampWorldOverlayX\(spr\.x, meta\.width/);
    assert.match(game, /dataset\.actionSafeRight/);
    assert.match(game, /dataset\.promptWidth/);
    assert.match(game, /dataset\.speechWidth/);
    assert.match(game, /dataset\.actionWidth/);
    assert.match(game, /const PACK_VIEW_RESERVE = 132/);
    assert.match(game, /const LOCATION_VIEW_H = VIEW_H - PACK_VIEW_RESERVE/);
    assert.match(game, /cameraBottomPadding: cameraBottomSlack\(LOCATION_VIEW_H\)/);
    assert.match(game, /cameraTargetY\(player\.y, streetH, LOCATION_VIEW_H\)/);
    assert.match(game, /cameraWorldHeightForGround/);
    assert.doesNotMatch(game, /player\.y - VIEW_H \* 0\.72/);
    assert.match(game, /dataset\.playerScreenY/);
    assert.match(game, /dataset\.groundClearance/);
    assert.match(game, /resolveIndexTsid\(bootParams\.get\('streetdemo'\)\)/);
    assert.match(game, /jumpdemo/);
    assert.match(game, /TRIPLE JUMP ×/);
    assert.match(html, /id="mute-btn"[^>]*>Unmute</);
  });
});
