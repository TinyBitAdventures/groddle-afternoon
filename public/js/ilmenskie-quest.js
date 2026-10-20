export const ILMENSKIE_QUEST_ID = 'teleportation_rescue_pig';
export const AXIS_DENYDE_STREET_ID = 'GHFIV4V8J6J2I7U';
export const HOGTIED_JONES_ID = 'hogtied_piggy_explorer';
export const ILMENSKIE_REWARD = Object.freeze({
  xp: 450,
  mood: 250,
  favor: { giant: 'lem', points: 40 },
});

const VALID_PHASES = new Set(['investigate', 'found', 'carrying', 'released']);

export function createIlmenskieState(sourceLocation = null) {
  return {
    phase: 'investigate',
    sourceLocation: sourceLocation?.tsid
      ? {
          tsid: String(sourceLocation.tsid),
          x: Number(sourceLocation.x) || 0,
          y: Number(sourceLocation.y) || 0,
        }
      : null,
    metJones: false,
    pickedUpJones: false,
    releasedJones: false,
  };
}

export function ensureIlmenskieState(questState, sourceLocation = null) {
  questState.story ||= {};
  const saved = questState.story.ilmenskie;
  const state = saved && typeof saved === 'object'
    ? saved
    : createIlmenskieState(sourceLocation);
  if (!VALID_PHASES.has(state.phase)) state.phase = 'investigate';
  state.sourceLocation = state.sourceLocation?.tsid
    ? {
        tsid: String(state.sourceLocation.tsid),
        x: Number(state.sourceLocation.x) || 0,
        y: Number(state.sourceLocation.y) || 0,
      }
    : sourceLocation?.tsid
      ? createIlmenskieState(sourceLocation).sourceLocation
      : null;
  state.metJones = Boolean(state.metJones);
  state.pickedUpJones = Boolean(state.pickedUpJones);
  state.releasedJones = Boolean(state.releasedJones);
  questState.story.ilmenskie = state;
  return state;
}

export function rememberIlmenskieSource(state, location) {
  if (!state || state.sourceLocation?.tsid || !location?.tsid) return state;
  state.sourceLocation = {
    tsid: String(location.tsid),
    x: Number(location.x) || 0,
    y: Number(location.y) || 0,
  };
  return state;
}

export function meetIlmenskieJones(state) {
  if (!state || state.releasedJones) return { ok: false, reason: 'complete', state };
  state.metJones = true;
  if (!state.pickedUpJones) state.phase = 'found';
  return { ok: true, reason: 'met', state };
}

export function pickupIlmenskieJones(state) {
  if (!state) return { ok: false, reason: 'missing_state', state };
  if (!state.metJones) return { ok: false, reason: 'meet_first', state };
  if (state.pickedUpJones) return { ok: false, reason: 'already_carrying', state };
  if (state.releasedJones) return { ok: false, reason: 'complete', state };
  state.pickedUpJones = true;
  state.phase = 'carrying';
  return { ok: true, reason: 'picked_up', state };
}

export function canReleaseIlmenskieJones(state, currentStreetTsid) {
  if (!state?.pickedUpJones) {
    return { ok: false, reason: 'not_carrying', message: 'Ilmenskie Jones is not in your pack.' };
  }
  if (String(currentStreetTsid) === AXIS_DENYDE_STREET_ID) {
    return {
      ok: false,
      reason: 'still_in_cavern',
      message: "You have to get out of here first! You're still in mortal peril somehow, supposedly.",
    };
  }
  return { ok: true, reason: 'ready', message: '' };
}

export function releaseIlmenskieJones(state, currentStreetTsid) {
  const gate = canReleaseIlmenskieJones(state, currentStreetTsid);
  if (!gate.ok) return { ...gate, state };
  state.releasedJones = true;
  state.phase = 'released';
  return { ok: true, reason: 'released', state };
}

export function ilmenskieObjective(state, currentStreetTsid = '') {
  if (!state) return 'Find Ilmenskie Jones';
  if (state.releasedJones) return 'Ilmenskie Jones rescued';
  if (state.pickedUpJones) {
    return String(currentStreetTsid) === AXIS_DENYDE_STREET_ID
      ? 'Open Map and teleport out of Axis Denyde'
      : 'Release Ilmenskie Jones from your pack';
  }
  if (state.metJones) return 'Pick up Ilmenskie Jones';
  return String(currentStreetTsid) === AXIS_DENYDE_STREET_ID
    ? 'Find Ilmenskie Jones in the cavern'
    : 'Open Map and teleport to Axis Denyde';
}
