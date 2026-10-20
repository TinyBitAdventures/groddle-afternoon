export const WINTER_WALK_QUEST_ID = 'winter_walk';
export const WINTER_WALK_REPEAT_QUEST_ID = 'winter_walk_part2';
export const WINTER_WALK_STREET_ID = 'GHF8LE0Q0UC3QEF';
export const WINTER_HAVEN_STREET_ID = 'GHFA15VS0UC3ITS';
export const WINTER_WALK_DURATION_MS = 5 * 60 * 1000;
export const WINTER_WALK_ICE_REWARD = 23;

export const WINTER_MOTE_REWARDS = Object.freeze({
  surface: Object.freeze([120, 120, 3000, 120, 120, 240]),
  haven: Object.freeze([120, 120, 120, 240, 120, 120]),
  return: Object.freeze([1098, 600, 720]),
});

export function createWinterWalkState({
  now = Date.now(),
  sourceLocation = null,
  repeat = false,
} = {}) {
  return {
    status: 'surface',
    stage: 'surface',
    repeat: Boolean(repeat),
    startedAt: now,
    expiresAt: now + WINTER_WALK_DURATION_MS,
    sourceLocation: sourceLocation?.tsid
      ? {
          tsid: String(sourceLocation.tsid),
          x: Number(sourceLocation.x) || 0,
          y: Number(sourceLocation.y) || 0,
        }
      : null,
    collected: { surface: [], haven: [] },
    imgEarned: 0,
  };
}

export function winterWalkRemainingMs(state, now = Date.now()) {
  if (!state || state.status === 'complete' || state.status === 'expired') return 0;
  return Math.max(0, Number(state.expiresAt) - now);
}

export function expireWinterWalk(state, now = Date.now()) {
  if (!state || state.status === 'complete' || state.status === 'expired') {
    return { ok: false, reason: state?.status || 'missing', state };
  }
  if (winterWalkRemainingMs(state, now) > 0) {
    return { ok: false, reason: 'time_remaining', state };
  }
  state.status = 'expired';
  return { ok: true, reason: 'expired', state };
}

export function collectWinterMote(state, stage, index, now = Date.now()) {
  if (!state || !WINTER_MOTE_REWARDS[stage]) {
    return { ok: false, reason: 'invalid_stage', state };
  }
  if (winterWalkRemainingMs(state, now) <= 0) {
    expireWinterWalk(state, now);
    return { ok: false, reason: 'expired', state };
  }
  if (state.stage !== stage) return { ok: false, reason: 'wrong_stage', state };
  const i = Math.floor(Number(index));
  const rewards = WINTER_MOTE_REWARDS[stage];
  if (i < 0 || i >= rewards.length) return { ok: false, reason: 'invalid_mote', state };
  if (state.collected[stage].includes(i)) return { ok: false, reason: 'already_collected', state };
  const amount = rewards[i];
  state.collected[stage].push(i);
  state.collected[stage].sort((a, b) => a - b);
  state.imgEarned += amount;
  return { ok: true, reason: 'collected', amount, state };
}

export function enterWinterHaven(state, now = Date.now()) {
  if (!state || state.stage !== 'surface') return { ok: false, reason: 'wrong_stage', state };
  if (winterWalkRemainingMs(state, now) <= 0) {
    expireWinterWalk(state, now);
    return { ok: false, reason: 'expired', state };
  }
  state.stage = 'haven';
  state.status = 'haven';
  return { ok: true, reason: 'entered_haven', state };
}

export function returnToWinterWalk(state, now = Date.now()) {
  if (!state || state.stage !== 'haven') return { ok: false, reason: 'wrong_stage', state };
  if (winterWalkRemainingMs(state, now) <= 0) {
    expireWinterWalk(state, now);
    return { ok: false, reason: 'expired', state };
  }
  state.stage = 'return';
  state.status = 'return';
  state.collected.return ||= [];
  return { ok: true, reason: 'returned_to_walk', state };
}

export function finishWinterWalk(state, now = Date.now()) {
  if (!state || state.stage !== 'return') return { ok: false, reason: 'wrong_stage', state };
  if (winterWalkRemainingMs(state, now) <= 0) {
    expireWinterWalk(state, now);
    return { ok: false, reason: 'expired', state };
  }
  state.status = 'complete';
  return {
    ok: true,
    reason: 'complete',
    iceReward: state.repeat ? 0 : WINTER_WALK_ICE_REWARD,
    imgEarned: state.imgEarned,
    state,
  };
}

export function winterWalkProgress(state) {
  const total = Object.values(WINTER_MOTE_REWARDS).reduce(
    (sum, rewards) => sum + rewards.length,
    0
  );
  if (!state) return { collected: 0, total };
  return {
    collected: Object.values(state.collected).reduce(
      (sum, collected) => sum + collected.length,
      0
    ),
    total,
  };
}

export function winterWalkObjective(state) {
  if (!state) return 'Begin the Winter Walk';
  if (state.status === 'expired') return 'The winter path faded';
  if (state.status === 'complete') return 'Winter Walk complete';
  if (state.stage === 'haven') return 'Climb through Winter Haven and find the way out';
  if (state.stage === 'return') return 'Gather the last winter motes and follow the light home';
  return 'Cross the snowy path to Winter Haven';
}
