/**
 * Collaborative Feats, reconstructed from GSJS inc_data_feats_prod.js,
 * players/inc_feats.js, locations/location.js, and "The Last Feat" footage.
 */

export const INCANTATION_FEAT_ID = 'makeup_feat_redux';
export const INCANTATION_FEAT_TITLE = "The First Glimmer of the Giants' Awakening";

export const INCANTATION_LINES = Object.freeze([
  Object.freeze({
    step: 1,
    points: 1,
    phrase: 'This game is absolutely preposterous',
  }),
  Object.freeze({
    step: 2,
    points: 2,
    phrase: 'I agree wholeheartedly',
  }),
  Object.freeze({
    step: 3,
    points: 3,
    phrase: 'And yet, I will really miss it',
  }),
]);

const PHRASE_PATTERNS = INCANTATION_LINES.map(
  (line) => new RegExp(line.phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
);

function finiteInt(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.floor(number)) : fallback;
}

function cleanParticipant(value) {
  return String(value || '').trim().slice(0, 80);
}

export function createFeatState(seed = {}) {
  return normalizeFeatState(seed);
}

export function normalizeFeatState(seed = {}) {
  const nextStep = [1, 2, 3].includes(Number(seed?.nextStep))
    ? Number(seed.nextStep)
    : 1;
  const participants = [...new Set(
    (Array.isArray(seed?.participants) ? seed.participants : [])
      .map(cleanParticipant)
      .filter(Boolean)
  )].slice(0, 2);
  return {
    featId: INCANTATION_FEAT_ID,
    totalPoints: finiteInt(seed?.totalPoints),
    personalPoints: finiteInt(seed?.personalPoints),
    contributions: finiteInt(seed?.contributions),
    chainsCompleted: finiteInt(seed?.chainsCompleted),
    nextStep,
    participants: nextStep === 1 ? [] : participants,
    activeSince: nextStep === 1 ? 0 : finiteInt(seed?.activeSince),
  };
}

/** Player saves keep contribution history, while the street-local chain resets. */
export function normalizeFeatSnapshot(seed = {}) {
  const normalized = normalizeFeatState(seed);
  normalized.nextStep = 1;
  normalized.participants = [];
  normalized.activeSince = 0;
  return normalized;
}

export function incantationStepForMessage(message) {
  const text = String(message || '').trim();
  if (!text) return 0;
  const index = PHRASE_PATTERNS.findIndex((pattern) => pattern.test(text));
  return index < 0 ? 0 : index + 1;
}

export function currentChainPoints(state) {
  if (state.nextStep === 2) return 1;
  if (state.nextStep === 3) return 3;
  return 0;
}

export function resetIncantationChain(state) {
  state.nextStep = 1;
  state.participants = [];
  state.activeSince = 0;
  return state;
}

/**
 * Process one local-chat line exactly as location.doIncantationsFeat does.
 * Each successive line must come from a different participant.
 */
export function submitIncantation(state, message, participant = 'Ur', now = Date.now()) {
  const step = incantationStepForMessage(message);
  const name = cleanParticipant(participant) || 'Ur';
  const active = state.nextStep !== 1;
  const repeatedParticipant = state.participants.includes(name);

  if (!step || repeatedParticipant || step !== state.nextStep) {
    if (!active) {
      return {
        ok: false,
        matched: Boolean(step),
        broken: false,
        reason: repeatedParticipant ? 'same-participant' : step ? 'out-of-order' : 'not-incantation',
      };
    }
    resetIncantationChain(state);
    return {
      ok: false,
      matched: Boolean(step),
      broken: true,
      reason: repeatedParticipant ? 'same-participant' : step ? 'out-of-order' : 'other-chat',
      activityLine: 'Oops! The incantation chain has been broken!',
    };
  }

  const line = INCANTATION_LINES[step - 1];
  const firstContribution = state.contributions === 0;
  state.totalPoints += line.points;
  state.participants.push(name);
  if (name === 'Ur') state.personalPoints += line.points;
  if (firstContribution && name === 'Ur') state.contributions += 1;
  if (step === 1) state.activeSince = finiteInt(now);

  const result = {
    ok: true,
    matched: true,
    broken: false,
    step,
    points: line.points,
    participant: name,
    firstContribution: firstContribution && name === 'Ur',
    chainCompleted: step === 3,
    activityLine: `${name} got ${line.points === 1 ? 'one point' : line.points === 2 ? 'two points' : 'three points'} for The Incantations of Absurdity chain.`,
  };

  if (step === 3) {
    state.chainsCompleted += 1;
    result.chainParticipants = [...state.participants];
    resetIncantationChain(state);
  } else {
    state.nextStep = step + 1;
  }
  return result;
}

export function featStatus(state) {
  return {
    title: INCANTATION_FEAT_TITLE,
    totalPoints: state.totalPoints,
    personalPoints: state.personalPoints,
    contributions: state.contributions,
    chainsCompleted: state.chainsCompleted,
    nextStep: state.nextStep,
    currentPoints: currentChainPoints(state),
    nextLine: INCANTATION_LINES[state.nextStep - 1],
    participants: [...state.participants],
  };
}
