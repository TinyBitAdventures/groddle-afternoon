/**
 * Local street companions.
 *
 * The original game rendered nearby players as full Glitches. The remake uses
 * the named solo stand-ins shared by Collaborative Feats and Emotional Bear
 * actions, with deterministic appearances and light street-local movement.
 */

export const LOCAL_COMPANION_PROFILES = Object.freeze([
  Object.freeze({
    name: 'Amp',
    preset: 'autumn',
    color: 0xf2a34a,
    idleOffset: -150,
    gatherOffset: -92,
    wanderRange: 72,
  }),
  Object.freeze({
    name: 'Bumbishfish',
    preset: 'blueberry',
    color: 0x69a9ef,
    idleOffset: 150,
    gatherOffset: 92,
    wanderRange: 84,
  }),
  Object.freeze({
    name: 'Lily Linguistic',
    preset: 'candy',
    color: 0xed86bd,
    idleOffset: 245,
    gatherOffset: 168,
    wanderRange: 66,
  }),
]);

/** Original server follow range and the badge granted after three streets. */
export const COMPANION_FOLLOW_MAX_DISTANCE = 1000;
export const COMPANION_FOLLOW_TRAIL_DISTANCE = 74;
export const STALKER_ACHIEVEMENT_ID = 'stalker_noncreepy_designation';

/** Public street names: inc_data_maps_prod.js 17654, 17663, 17664 (the names "The Last Feat" recording shows). */
export const LAST_FEAT_STREET_LABELS = Object.freeze({
  GDOFACJ62S03LLK: 'Lunae Hubaye',
  GDO3CO0RUR0307B: 'Flavus Muss',
  GDOF6PP52S03H66: 'Cytron Monn',
});
export const LAST_FEAT_STREET_IDS = Object.freeze(
  Object.keys(LAST_FEAT_STREET_LABELS)
);

const PROFILE_BY_NAME = new Map(
  LOCAL_COMPANION_PROFILES.map((profile) => [profile.name, profile])
);

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function localCompanionProfile(name) {
  return PROFILE_BY_NAME.get(String(name || '')) || null;
}

/**
 * Transient follow session. The original server kept this on the live player,
 * not in their durable save, so a reload deliberately starts unfollowed.
 */
export function createCompanionFollowState(seed = {}) {
  const followee = localCompanionProfile(seed.followee)?.name || '';
  const visitedStreets = [...new Set(
    (Array.isArray(seed.visitedStreets) ? seed.visitedStreets : [])
      .map((id) => String(id || '').trim())
      .filter(Boolean)
  )];
  return {
    active: Boolean(seed.active && followee),
    followee,
    streetsFollowed: followee
      ? Math.max(0, Number(seed.streetsFollowed) || visitedStreets.length)
      : 0,
    visitedStreets,
    startedAt: Number(seed.startedAt) || 0,
    achievementAwarded: Boolean(seed.achievementAwarded),
  };
}

/**
 * Local companions auto-accept because there is no remote player session to
 * display the original confirmation prompt. Range and activity wording remain
 * faithful to the server implementation.
 */
export function startCompanionFollow(
  state,
  name,
  { distance = 0, streetTsid = '', now = Date.now() } = {}
) {
  const profile = localCompanionProfile(name);
  if (!profile) return { ok: false, reason: 'unknown_companion', state };
  if (Math.max(0, Number(distance) || 0) > COMPANION_FOLLOW_MAX_DISTANCE) {
    return {
      ok: false,
      reason: 'too_far',
      activity: `You were too far away to follow ${profile.name}.`,
      state,
    };
  }
  const street = String(streetTsid || '').trim();
  const next = createCompanionFollowState({
    active: true,
    followee: profile.name,
    streetsFollowed: street ? 1 : 0,
    visitedStreets: street ? [street] : [],
    startedAt: now,
    achievementAwarded: false,
  });
  Object.assign(state, next);
  return {
    ok: true,
    reason: 'started',
    activity: `You started following ${profile.name}.`,
    state,
  };
}

export function stopCompanionFollow(state) {
  if (!state?.active || !state.followee) {
    return { ok: false, reason: 'not_following', state };
  }
  const name = state.followee;
  Object.assign(state, createCompanionFollowState());
  return {
    ok: true,
    reason: 'stopped',
    activity: `You stopped following ${name}.`,
    state,
  };
}

/**
 * Count distinct street loads, beginning with the street where follow starts.
 * This prevents reloads or same-street teleports from farming the badge.
 */
export function recordCompanionFollowStreet(state, streetTsid) {
  if (!state?.active || !state.followee) {
    return { ok: false, reason: 'not_following', achievementReady: false, state };
  }
  const street = String(streetTsid || '').trim();
  if (!street) {
    return { ok: false, reason: 'missing_street', achievementReady: false, state };
  }
  if (state.visitedStreets.includes(street)) {
    return {
      ok: true,
      reason: 'already_counted',
      counted: false,
      achievementReady: state.streetsFollowed >= 3 && !state.achievementAwarded,
      state,
    };
  }
  state.visitedStreets.push(street);
  state.streetsFollowed = state.visitedStreets.length;
  return {
    ok: true,
    reason: 'counted',
    counted: true,
    achievementReady: state.streetsFollowed >= 3 && !state.achievementAwarded,
    state,
  };
}

/**
 * Smooth auto-walk toward a point one character-width behind the followee.
 * Manual movement in game.js always overrides this assist.
 */
export function companionFollowVelocity(
  playerX,
  followeeX,
  currentVelocity = 0,
  { trailDistance = COMPANION_FOLLOW_TRAIL_DISTANCE, maxSpeed = 4.4 } = {}
) {
  const player = Number(playerX) || 0;
  const followee = Number(followeeX) || player;
  const velocity = Number(currentVelocity) || 0;
  const gap = Math.max(24, Number(trailDistance) || COMPANION_FOLLOW_TRAIL_DISTANCE);
  const limit = Math.max(0, Number(maxSpeed) || 0);
  const side = followee >= player ? -1 : 1;
  const targetX = followee + side * gap;
  const error = targetX - player;
  if (Math.abs(error) <= 10) {
    const next = velocity * 0.62;
    return Math.abs(next) < 0.05 ? 0 : next;
  }
  const desired = clamp(error * 0.085, -limit, limit);
  const next = velocity * 0.58 + desired * 0.42;
  return clamp(next, -limit, limit);
}

/**
 * Stable spawn positions around the player, clamped away from street edges.
 */
export function planLocalCompanionSpawns(playerX, worldWidth, edge = 42) {
  const width = Math.max(edge * 2, Number(worldWidth) || 0);
  const center = clamp(Number(playerX) || width / 2, edge, width - edge);
  return LOCAL_COMPANION_PROFILES.map((profile) => ({
    ...profile,
    x: clamp(center + profile.idleOffset, edge, width - edge),
  }));
}

/**
 * Pull a named companion toward the player for a social/Feat moment.
 */
export function localCompanionGatherTarget(name, playerX, worldWidth, edge = 42) {
  const profile = localCompanionProfile(name);
  if (!profile) return null;
  const width = Math.max(edge * 2, Number(worldWidth) || 0);
  const center = clamp(Number(playerX) || width / 2, edge, width - edge);
  return clamp(center + profile.gatherOffset, edge, width - edge);
}

/**
 * Frame-rate-independent approach used by the world actors.
 */
export function approachCompanionX(currentX, targetX, dt, speed = 1.55) {
  const current = Number(currentX) || 0;
  const target = Number(targetX) || current;
  const step = Math.max(0, Number(dt) || 0) * Math.max(0, Number(speed) || 0);
  if (Math.abs(target - current) <= step) {
    return { x: target, vx: 0, arrived: true };
  }
  const direction = target > current ? 1 : -1;
  return {
    x: current + direction * step,
    vx: direction * Math.max(0, Number(speed) || 0),
    arrived: false,
  };
}
