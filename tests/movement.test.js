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
  yCamOffsetAnchor,
  cameraBottomSlack,
  cameraWorldHeightForGround,
} from '../public/js/movement.js?v=a314f8a1';
import { streetHeight, platformsScreen } from '../public/js/street-model.js?v=77584eff';
import { MIN_VP_H, MAX_VP_H, VIEW_CEIL_H, VIEW_FLOOR_H, locationViewHeightFor } from '../public/js/location-view.js?v=5a0d5c0b';

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
  test('centers the avatar with no look-ahead and clamps at street edges', () => {
    const still = cameraTargetX(1_000, 0, 3_000, 1_000);
    const right = cameraTargetX(1_000, 4.4, 3_000, 1_000);
    const left = cameraTargetX(1_000, -4.4, 3_000, 1_000);
    assert.equal(still, 500);
    assert.equal(right, 500);
    assert.equal(left, 500);
    assert.equal(yCamOffsetAnchor(150), 0.75);
    assert.equal(yCamOffsetAnchor(114), 0.69);
    assert.equal(yCamOffsetAnchor(54), 0.59);
    assert.equal(yCamOffsetAnchor(-179), 0.4);
    // The share holds at every view height; the negative-offset floor keeps the feet 163 px down.
    assert.equal(yCamOffsetAnchor(150, 600), 0.75);
    assert.ok(Math.abs(yCamOffsetAnchor(-96, 600) - 0.34) < 1e-9);
    assert.equal(yCamOffsetAnchor(-179, 600), (0.4 * 408) / 600);
    assert.equal(yCamOffsetAnchor(-179, 400), 0.4);
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

  test('frames low platforms against the pack-safe location viewport at every view height', () => {
    for (const locationViewHeight of [MIN_VP_H, 408, 500, MAX_VP_H]) {
      assert.equal(cameraTargetY(20, 1_000, locationViewHeight), 0);
      assert.equal(cameraBottomSlack(locationViewHeight), 40);

      // Dust Path 1E (GA55S7P5RJ42VTG): ground at 1,034 under a 1,000 px street.
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
      // Bounded like CameraMan: the feet drop towards the pack, never closer than 40.
      assert.equal(playerScreenY, locationViewHeight - 40);
      assert.equal(locationViewHeight - playerScreenY, 40);
      assert.ok(playerScreenY < locationViewHeight, 'feet stay above the pack');
    }
  });

  test('frames the avatar 0.75 down the view at every height, like CameraMan', () => {
    // CameraMan.as 285 (pc.y - y_cam_offset) with the getter's 138 scale (offset * loc_vp_h / 600).
    for (const view of [MIN_VP_H, 408, 512, MAX_VP_H]) {
      const offset = 150 * (view / 600);
      const centre = 5_000 - offset;
      const cameraY = cameraTargetY(5_000, 10_000, view, yCamOffsetAnchor(150, view));
      assert.equal(cameraY, centre - view / 2);
      assert.equal(5_000 - cameraY, view * 0.75);
    }
  });

  test('repairs authored worlds whose declared height ends above their ground', () => {
    const homeGroundY = 620;
    for (const [locationViewHeight, cameraY] of [[MIN_VP_H, 260], [408, 252], [MAX_VP_H, 60]]) {
      const cameraWorldHeight = cameraWorldHeightForGround(
        540,
        homeGroundY,
        locationViewHeight
      );
      assert.equal(cameraWorldHeight, 660);
      assert.equal(cameraTargetY(homeGroundY, cameraWorldHeight, locationViewHeight), cameraY);
      assert.equal(locationViewHeight - (homeGroundY - cameraY), 40);
    }
  });

  test('keeps the lowest platform above the pack in every imported street at 408, 600 and 720', () => {
    const streetsDir = path.join(root, 'public/assets/streets');
    const streetFiles = fs.readdirSync(streetsDir)
      .filter((file) => file.endsWith('.json') && file !== 'index.json');
    let checked = 0;
    for (const windowView of [VIEW_FLOOR_H, MAX_VP_H, VIEW_CEIL_H]) {
      for (const file of streetFiles) {
        const street = JSON.parse(fs.readFileSync(path.join(streetsDir, file), 'utf8'));
        if (!street?.bounds || !Array.isArray(street.platforms) || !street.platforms.length) continue;
        // TSMainView: a street shorter than the window's view holds it (never under 408).
        // Since g458 (stageFor) the stage magnifies a shorter street until it fills the view instead.
        const locationViewHeight = windowView > MAX_VP_H
          ? Math.max(VIEW_FLOOR_H, Math.min(windowView, streetHeight(street)))
          : locationViewHeightFor({ forced: windowView, sceneHeight: streetHeight(street) });
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
    }
    assert.ok(checked > 4_200, `expected the full street catalog three times, checked ${checked}`);
  });

  test('keeps camera damping equivalent across split frames', () => {
    const once = dampingAlpha(0.08, 2);
    const split = 1 - (1 - dampingAlpha(0.08, 1)) ** 2;
    assert.ok(Math.abs(once - split) < 1e-12);
    assert.equal(dampingAlpha(0.12, 0), 0);
  });

  test('uses edge-triggered requests, blocks panels, exposes QA, and keeps mute opt-in', () => {
    const game = fs.readFileSync(path.join(root, 'public/game.js'), 'utf8');
    const html = fs.readFileSync(path.join(root, 'public/play/index.html'), 'utf8');
    // Space always; W/Up jump off the ground only (on a ladder they climb).
    assert.match(game, /!e\.repeat && \(e\.key === ' ' \|\| \(!climb\.active && \['ArrowUp', 'w', 'W'\]\.includes\(e\.key\)\)\)/);
    assert.match(game, /queueJump\(jumpState, movementNow\(\)\)/);
    assert.match(game, /resolveQueuedJump\(jumpState/);
    assert.match(game, /gameplayInputBlocked\(\)/);
    assert.match(game, /cameraTargetForPlayer\(player\.x, player\.vx/);
    assert.match(game, /dataset\.cameraRightInset/);
    assert.match(game, /clampWorldOverlayX\(prompt\.x, prompt\.width/);
    // G214: the class offset_x moves the bubble (js/speech-placement.js).
    assert.match(game, /clampWorldOverlayX\(spr\.x \+ offset\.x, meta\.width/);
    assert.match(game, /dataset\.actionSafeRight/);
    assert.match(game, /dataset\.promptWidth/);
    assert.match(game, /dataset\.speechWidth/);
    assert.match(game, /dataset\.actionWidth/);
    assert.match(game, /const PACK_VIEW_RESERVE = 132/);
    assert.match(game, /let VIEW_H = LOCATION_VIEW_H \+ PACK_VIEW_RESERVE/);
    assert.match(game, /VIEW_H = next \+ PACK_VIEW_RESERVE/);
    assert.match(game, /app\.renderer\.resize\(VIEW_W, VIEW_H, resolution\)/);
    assert.match(game, /window\.addEventListener\('resize', \(\) => \{\n    syncCameraSafeArea\(\);\n    syncLocationViewHeight\(\);/);
    assert.match(game, /cameraBottomPadding: cameraBottomSlack\(LOCATION_VIEW_H\)/);
    assert.match(game, /cameraTargetY\(player\.y, streetH, LOCATION_VIEW_H\)/);
    assert.match(game, /cameraWorldHeightForGround/);
    assert.doesNotMatch(game, /player\.y - VIEW_H \* 0\.72/);
    assert.match(game, /dataset\.playerScreenY/);
    assert.match(game, /dataset\.groundClearance/);
    assert.match(game, /resolveIndexTsid\(bootParams\.get\('streetdemo'\)\)/);
    assert.match(game, /jumpdemo/);
    assert.match(game, /TRIPLE JUMP ×/);
    assert.match(html, /id="mute-btn"[^>]*aria-label="Mute audio"/);
  });
});
