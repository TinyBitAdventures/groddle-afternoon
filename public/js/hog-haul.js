/**
 * The Great Hog Haul race rules, reconstructed from the original GSJS.
 *
 * Original loop:
 *   collect Pig Bait → touch a loose Piggy → return the hogtied Piggy to
 *   the Pig Pen → first player to three wins.
 *
 * The live race is deliberately transient. Quest progress persists, but an
 * interrupted multiplayer instance restarts instead of saving half a race.
 */

export const HOG_HAUL_QUEST_ID = 'hogtie_piggy';
export const HOG_HAUL_STREET_ID = 'GHVJQH26ERF3VMJ';
export const HOG_HAUL_GOAL = 3;
export const HOG_HAUL_COUNTDOWN_MS = 4_000;
export const HOG_HAUL_WIN_REWARD = Object.freeze({ currants: 100, xp: 50 });
export const HOG_HAUL_LOSS_REWARD = Object.freeze({ currants: 0, xp: 0 });
export const HOG_HAUL_DEFAULT_RIVAL_TIMES_MS = Object.freeze([34_000, 63_000, 92_000]);

function cleanId(value) {
  return String(value || '').trim().replace(/[^a-zA-Z0-9_:-]/g, '');
}

function cleanIds(value) {
  return [...new Set((Array.isArray(value) ? value : []).map(cleanId).filter(Boolean))];
}

function cleanTimes(value) {
  const input = Array.isArray(value) && value.length
    ? value
    : HOG_HAUL_DEFAULT_RIVAL_TIMES_MS;
  return input
    .map((entry) => Math.max(1_000, Math.floor(Number(entry) || 0)))
    .sort((a, b) => a - b)
    .slice(0, HOG_HAUL_GOAL);
}

export function createHogHaulState(seed = {}) {
  const createdAt = Math.max(0, Number(seed.createdAt ?? seed.now) || Date.now());
  const countdownMs = Math.max(
    0,
    Math.floor(Number(seed.countdownMs) || HOG_HAUL_COUNTDOWN_MS)
  );
  const status = ['staging', 'countdown', 'running', 'won', 'lost'].includes(seed.status)
    ? seed.status
    : 'countdown';
  const startAt = Math.max(
    createdAt,
    Number(seed.startAt) || createdAt + countdownMs
  );
  return {
    status,
    createdAt,
    startAt,
    finishedAt: Math.max(0, Number(seed.finishedAt) || 0),
    goal: HOG_HAUL_GOAL,
    playerScore: Math.max(0, Math.min(HOG_HAUL_GOAL, Math.floor(Number(seed.playerScore) || 0))),
    rivalScore: Math.max(0, Math.min(HOG_HAUL_GOAL, Math.floor(Number(seed.rivalScore) || 0))),
    hasBait: seed.hasBait === true,
    carryingPig: seed.carryingPig === true,
    collectedBaitIds: cleanIds(seed.collectedBaitIds),
    capturedPigIds: cleanIds(seed.capturedPigIds),
    rivalTimesMs: cleanTimes(seed.rivalTimesMs),
    rivalLabel: String(seed.rivalLabel || 'Gomez Addams').trim().slice(0, 48) || 'Gomez Addams',
  };
}

export function countdownCue(state, now = Date.now()) {
  if (!state || state.status !== 'countdown') return '';
  const remaining = Math.max(0, state.startAt - now);
  if (remaining <= 0) return 'GO!';
  if (remaining > 3_000) return 'READY?';
  return String(Math.max(1, Math.ceil(remaining / 1_000)));
}

export function tickHogHaul(state, now = Date.now()) {
  if (!state) return { changed: false, events: [] };
  const events = [];
  if (state.status === 'countdown' && now >= state.startAt) {
    state.status = 'running';
    events.push({ type: 'started' });
  }
  if (state.status !== 'running') return { changed: events.length > 0, events };

  const elapsed = Math.max(0, now - state.startAt);
  const earned = Math.min(
    state.goal,
    state.rivalTimesMs.filter((threshold) => elapsed >= threshold).length
  );
  while (state.rivalScore < earned && state.status === 'running') {
    state.rivalScore += 1;
    events.push({ type: 'rival_scored', score: state.rivalScore });
    if (state.rivalScore >= state.goal) {
      state.status = 'lost';
      state.finishedAt = now;
      state.hasBait = false;
      state.carryingPig = false;
      events.push({ type: 'lost', winner: state.rivalLabel });
    }
  }
  return { changed: events.length > 0, events };
}

export function pickupHogHaulBait(state, baitId) {
  const id = cleanId(baitId);
  if (!state || state.status !== 'running') return { ok: false, reason: 'not_running' };
  if (!id) return { ok: false, reason: 'invalid_bait' };
  if (state.collectedBaitIds.includes(id)) return { ok: false, reason: 'already_collected' };
  if (state.hasBait || state.carryingPig) return { ok: false, reason: 'hands_full' };
  state.hasBait = true;
  state.collectedBaitIds.push(id);
  return { ok: true, baitId: id };
}

export function captureHogHaulPig(state, pigId) {
  const id = cleanId(pigId);
  if (!state || state.status !== 'running') return { ok: false, reason: 'not_running' };
  if (!id) return { ok: false, reason: 'invalid_pig' };
  if (state.capturedPigIds.includes(id)) return { ok: false, reason: 'already_captured' };
  if (state.carryingPig) return { ok: false, reason: 'already_carrying' };
  if (!state.hasBait) return { ok: false, reason: 'needs_bait' };
  state.hasBait = false;
  state.carryingPig = true;
  state.capturedPigIds.push(id);
  return { ok: true, pigId: id };
}

export function deliverHogHaulPig(state, now = Date.now()) {
  if (!state || state.status !== 'running') return { ok: false, reason: 'not_running' };
  if (!state.carryingPig) return { ok: false, reason: 'not_carrying' };
  state.carryingPig = false;
  state.playerScore = Math.min(state.goal, state.playerScore + 1);
  const won = state.playerScore >= state.goal;
  if (won) {
    state.status = 'won';
    state.finishedAt = now;
    state.hasBait = false;
  }
  return {
    ok: true,
    score: state.playerScore,
    remaining: Math.max(0, state.goal - state.playerScore),
    won,
  };
}

export function hogHaulObjective(state) {
  if (!state) return '';
  if (state.status === 'countdown') return 'Hogtie three Piggies and put them in the Pig Pen!';
  if (state.status === 'won') return 'You won The Great Hog Haul!';
  if (state.status === 'lost') return `${state.rivalLabel} won the race.`;
  if (state.carryingPig) return 'Got a pig! Back to the pen!';
  // players/inc_games.js 1934 (the Hog Haul's own line).
  if (state.hasBait) return 'You have bait, now go get a piggy!';
  return 'Find a Pig Bait sack.';
}

export function hogHaulResultReward(state) {
  if (state?.status === 'won') return { ...HOG_HAUL_WIN_REWARD };
  if (state?.status === 'lost') return { ...HOG_HAUL_LOSS_REWARD };
  return { currants: 0, xp: 0 };
}
