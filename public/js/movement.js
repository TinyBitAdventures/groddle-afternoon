/**
 * Original-style avatar movement helpers.
 *
 * Jump-chain behavior is ported from:
 * - glitch-client PhysicsModel.triple_jump_allowance_ms
 * - glitch-client AvatarPhysicsHandler.calcTripleJumpMultiplier
 * - GameServerJS inc_data_imagination jump_triple_1/2/3 rewards
 *
 * The small input buffer and coyote allowance are local control-feel comforts.
 */

export const TRIPLE_JUMP_WINDOW_MS = 500;
export const JUMP_BUFFER_MS = 140;
export const COYOTE_TIME_MS = 90;

export const TRIPLE_JUMP_UPGRADES = Object.freeze([
  Object.freeze({ id: 'jump_triple_1', label: 'Baby Triple Jump', multiplier: 0.7 }),
  Object.freeze({ id: 'jump_triple_2', label: 'Medium Triple Jump', multiplier: 0.82 }),
  Object.freeze({ id: 'jump_triple_3', label: "Big 'Un Triple Jump", multiplier: 1 }),
]);

const finite = (value, fallback = 0) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export function tripleJumpProfile(upgrades = []) {
  const owned = new Set(Array.isArray(upgrades) ? upgrades : []);
  for (let index = TRIPLE_JUMP_UPGRADES.length - 1; index >= 0; index -= 1) {
    const profile = TRIPLE_JUMP_UPGRADES[index];
    if (owned.has(profile.id)) return profile;
  }
  return null;
}

export function createJumpState(now = 0) {
  const at = Math.max(0, finite(now));
  return {
    queuedAt: null,
    grounded: true,
    lastGroundedAt: at,
    landedAt: at,
    chainCount: 0,
    chainDeadline: 0,
    jumps: 0,
    tripleJumps: 0,
  };
}

/** Queue one edge-triggered jump. Held-key repeats should not call this. */
export function queueJump(state, now) {
  if (!state || typeof state !== 'object') return false;
  state.queuedAt = Math.max(0, finite(now));
  return true;
}

export function clearJumpQueue(state) {
  if (state && typeof state === 'object') state.queuedAt = null;
}

export function hasQueuedJump(state, now, bufferMs = JUMP_BUFFER_MS) {
  if (!state || state.queuedAt == null) return false;
  const age = Math.max(0, finite(now) - finite(state.queuedAt));
  if (age > Math.max(0, finite(bufferMs, JUMP_BUFFER_MS))) {
    state.queuedAt = null;
    return false;
  }
  return true;
}

/** Track floor transitions so every landing opens the official 500 ms chain window. */
export function noteGrounded(state, grounded, now) {
  if (!state || typeof state !== 'object') return state;
  const at = Math.max(0, finite(now));
  const next = grounded === true;
  if (next) {
    state.lastGroundedAt = at;
    if (!state.grounded) {
      state.landedAt = at;
      state.chainDeadline = state.chainCount > 0 ? at + TRIPLE_JUMP_WINDOW_MS : 0;
    }
  } else if (state.grounded) {
    state.lastGroundedAt = at;
  }
  state.grounded = next;
  if (state.chainDeadline && at > state.chainDeadline) {
    state.chainCount = 0;
    state.chainDeadline = 0;
  }
  return state;
}

/** Exact AvatarPhysicsHandler timing/speed curve before upgrade scaling. */
export function rawTripleJumpMultiplier(msSinceLanding, velocityPercent = 0) {
  const ms = Math.max(0, finite(msSinceLanding));
  const speed = clamp(finite(velocityPercent), 0, 1);
  if (ms < 30) return 1.5 + 0.3 * speed;
  if (ms < 100) return 1.4 + 0.2 * speed;
  if (ms < 200) return 1.3 + 0.1 * speed;
  return 1.2;
}

export function scaledTripleJumpMultiplier(rawMultiplier, upgradeMultiplier) {
  const raw = Math.max(1, finite(rawMultiplier, 1));
  const upgrade = clamp(finite(upgradeMultiplier, 0), 0, 1);
  return 1 + (raw - 1) * upgrade;
}

/**
 * Consume a buffered request when a floor or coyote jump is possible.
 * The official boost is a third quick jump from the floor, not an air jump.
 */
export function resolveQueuedJump(state, {
  now = 0,
  grounded = state?.grounded === true,
  upgrades = [],
  velocityX = 0,
  maxVelocityX = 1,
  bufferMs = JUMP_BUFFER_MS,
  coyoteMs = COYOTE_TIME_MS,
} = {}) {
  if (!state || !hasQueuedJump(state, now, bufferMs)) {
    return { ok: false, reason: 'not_queued' };
  }
  const at = Math.max(0, finite(now));
  noteGrounded(state, grounded, at);
  const floorJump = state.grounded === true;
  const coyoteJump = !floorJump && at - finite(state.lastGroundedAt) <= Math.max(0, finite(coyoteMs));
  if (!floorJump && !coyoteJump) return { ok: false, reason: 'airborne_buffered' };

  state.queuedAt = null;
  const profile = tripleJumpProfile(upgrades);
  let jumpNumber = 1;
  let multiplier = 1;
  let triple = false;

  if (profile && floorJump) {
    const chainOpen = state.chainCount > 0 && state.chainDeadline > 0 && at <= state.chainDeadline;
    jumpNumber = chainOpen ? state.chainCount + 1 : 1;
    if (jumpNumber >= 3) {
      const velocityPercent = clamp(
        Math.abs(finite(velocityX)) / Math.max(0.0001, Math.abs(finite(maxVelocityX, 1))),
        0,
        1
      );
      const rawMultiplier = rawTripleJumpMultiplier(at - finite(state.landedAt), velocityPercent);
      multiplier = scaledTripleJumpMultiplier(rawMultiplier, profile.multiplier);
      triple = true;
      state.chainCount = 0;
      state.chainDeadline = 0;
      state.tripleJumps = Math.max(0, Math.floor(finite(state.tripleJumps))) + 1;
    } else {
      state.chainCount = jumpNumber;
      // A new deadline begins on the next landing, as in the official client.
      state.chainDeadline = 0;
    }
  } else {
    state.chainCount = 0;
    state.chainDeadline = 0;
  }

  state.jumps = Math.max(0, Math.floor(finite(state.jumps))) + 1;
  state.grounded = false;
  state.lastGroundedAt = at;
  return {
    ok: true,
    reason: triple ? 'triple_jump' : coyoteJump ? 'coyote_jump' : 'jump',
    jumpNumber,
    triple,
    multiplier,
    profile,
  };
}

/** Frame-rate-independent equivalent of a per-60fps lerp alpha. */
export function dampingAlpha(perFrameAlpha, deltaFrames = 1) {
  const alpha = clamp(finite(perFrameAlpha), 0, 1);
  const frames = Math.max(0, finite(deltaFrames, 1));
  return 1 - Math.pow(1 - alpha, frames);
}

/** Width available to world content after persistent horizontal chrome. */
export function cameraLocationViewWidth(viewWidth, rightInset = 0) {
  const view = Math.max(1, finite(viewWidth, 1));
  const inset = clamp(finite(rightInset), 0, view * 0.48);
  return Math.max(1, view - inset);
}

/**
 * Clamp an overlay center so its full width remains inside the usable
 * location viewport. Coordinates are screen-local and may be Pixi or CSS
 * pixels as long as all arguments use the same unit.
 */
export function cameraOverlayCenterX(
  screenX,
  overlayWidth,
  viewWidth,
  rightInset = 0,
  padding = 12
) {
  const safeWidth = cameraLocationViewWidth(viewWidth, rightInset);
  const half = Math.max(0, finite(overlayWidth)) / 2;
  const gap = Math.max(0, finite(padding));
  const left = gap + half;
  const right = safeWidth - gap - half;
  if (right < left) return safeWidth / 2;
  return clamp(finite(screenX), left, right);
}

/**
 * Center the avatar and look ahead in whichever direction it is moving.
 * `rightInset` reserves the part of the location viewport occupied by the
 * persistent quest/activity rail, matching the original client's loc_vp_w.
 */
export function cameraTargetX(
  playerX,
  velocityX,
  worldWidth,
  viewWidth,
  maxVelocityX = 4.4,
  rightInset = 0
) {
  const view = Math.max(1, finite(viewWidth, 1));
  const locationView = cameraLocationViewWidth(view, rightInset);
  const world = Math.max(locationView, finite(worldWidth, locationView));
  const speed = clamp(finite(velocityX) / Math.max(0.0001, Math.abs(finite(maxVelocityX, 4.4))), -1, 1);
  const lookAhead = speed * locationView * 0.12;
  return clamp(
    finite(playerX) - locationView * 0.5 + lookAhead,
    0,
    Math.max(0, world - locationView)
  );
}

/**
 * Keep the avatar inside the actual location viewport, excluding persistent
 * chrome such as the pack. The original client calculated loc_vp_h after
 * reserving its pack height, then placed the avatar at 75% of that viewport:
 * viewport center plus the default 150px y_cam_offset scaled from max_vp_h 600.
 */
export function cameraTargetY(playerY, worldHeight, locationViewHeight, anchorRatio = 0.75) {
  const view = Math.max(1, finite(locationViewHeight, 1));
  const world = Math.max(view, finite(worldHeight, view));
  const anchor = clamp(finite(anchorRatio, 0.75), 0, 1);
  return clamp(finite(playerY) - view * anchor, 0, Math.max(0, world - view));
}

/**
 * Extra world space required below the lowest walkable point so the camera can
 * still hold the avatar at its normal anchor. Imported streets commonly end
 * exactly on their lowest platform (and a few round 30px past it), leaving no
 * room for the camera to pan above the overlaid pack.
 */
export function cameraBottomSlack(locationViewHeight, anchorRatio = 0.75) {
  const view = Math.max(1, finite(locationViewHeight, 1));
  const anchor = clamp(finite(anchorRatio, 0.75), 0, 1);
  return view * (1 - anchor);
}

/**
 * Return a camera-only world height that can frame the deepest walkable ground
 * at the normal avatar anchor. Authored scenes and imported streets may report
 * a visual height that ends above, exactly on, or far below their collision
 * ground; camera framing must not inherit that inconsistency.
 */
export function cameraWorldHeightForGround(
  worldHeight,
  deepestGroundY,
  locationViewHeight,
  anchorRatio = 0.75
) {
  const view = Math.max(1, finite(locationViewHeight, 1));
  const base = Math.max(view, finite(worldHeight, view));
  const ground = Math.max(0, finite(deepestGroundY));
  return Math.max(base, ground + cameraBottomSlack(view, anchorRatio));
}
