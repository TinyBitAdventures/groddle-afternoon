/**
 * Legalize It quest state.
 *
 * Source anchors:
 * - quests/card_carrying_qualification.js
 * - items/npc_bureaucrat.js
 * - items/card_carrying_qualification.js
 * - items/catalog_stores.js (store 17)
 */

export const LEGALIZE_QUEST_ID = 'card_carrying_qualification';
export const LEGALIZE_BACK_ALLEY_TSID = 'LIF177DTS6T1KFG';
export const LEGALIZE_GRANGE_TSID = 'LLI32G3NUTD100I';
export const LEGALIZE_HALL_TSID = 'LIF101O8CDQ1AMU';
export const LEGALIZE_CARD_ID = 'card_carrying_qualification';
export const LEGALIZE_PAPERS_ID = 'your_papers';
export const LEGALIZE_CARD_COST = 50;
export const LEGALIZE_REWARD = Object.freeze({
  xp: 100,
  favor: Object.freeze({ giant: 'ti', points: 25 }),
});

export const LEGALIZE_CLERKS = Object.freeze([
  Object.freeze({ id: 'clerk_0', name: 'Assistant Wigglesbottom' }),
  Object.freeze({ id: 'clerk_1', name: 'Deputy Sharpburger' }),
  Object.freeze({ id: 'clerk_2', name: 'Secretary Piksnixson' }),
  Object.freeze({ id: 'clerk_3', name: 'Administrator Earwick' }),
]);

export const LEGALIZE_BACK_ALLEY_BEATS = Object.freeze([
  Object.freeze({
    text: 'Psssst. Here’sss the deal. Getting your Card Carrying Qualification is the first step in the Bureaucratic Artsss.',
    response: 'Oh, yeah?',
  }),
  Object.freeze({
    text: 'Yesss, and once you have it you are on your way to being able to obtain Your Papersss, and all sorts of licenses and permits.',
    response: 'Sounds handy',
  }),
  Object.freeze({
    text: 'You can often acquire the Card Carrying Qualification and other bureaucratic documentsss directly from other players or at auctions, etc.',
    response: 'Um, sketchy?',
  }),
  Object.freeze({
    text: 'It’sss perfectly legal, but if you want to go the official route and don’t mind the red tape, head over to the Bureaucratic Hall on Gregarious Grange and talk to one of my friends there. You’ll get what you need.',
    response: 'OK',
  }),
]);

export const LEGALIZE_QUESTIONS = Object.freeze([
  Object.freeze({
    text: 'This shouldn’t be a problem. One last question. Your favorite color?',
    options: Object.freeze(['Beige', 'Other']),
  }),
  Object.freeze({
    text: 'I may be able to help. One question, though. Given the choice: Bowl or Plate?',
    options: Object.freeze(['Bowl', 'Plate']),
  }),
  Object.freeze({
    text: 'I imagine we can help. One question first. Which came first?',
    options: Object.freeze(['The Chicken', 'The Grain']),
  }),
]);

const VALID_STAGES = new Set([
  'gregarious_departure',
  'back_alley',
  'back_alley_briefed',
  'back_alley_station',
  'gregarious_arrival',
  'grange_exterior',
  'hall_waiting',
  'hall_called',
  'hall_processing',
  'card_owned',
  'complete',
]);

export function createLegalizeState(sourceLocation = null) {
  return {
    stage: 'gregarious_departure',
    sourceLocation: sourceLocation?.tsid
      ? {
          tsid: String(sourceLocation.tsid),
          x: Number(sourceLocation.x) || 0,
          y: Number(sourceLocation.y) || 0,
        }
      : null,
    clerkIndex: 0,
    handoffs: 0,
    questionIndex: 0,
    cardOwned: false,
    activated: false,
    purchasedAt: 0,
    completedAt: 0,
  };
}

export function ensureLegalizeState(questState, sourceLocation = null) {
  questState.story ||= {};
  const saved = questState.story.legalize;
  const state = saved && typeof saved === 'object'
    ? saved
    : createLegalizeState(sourceLocation);
  if (!VALID_STAGES.has(state.stage)) state.stage = 'back_alley';
  state.clerkIndex = Math.max(0, Math.min(LEGALIZE_CLERKS.length - 1, Number(state.clerkIndex) || 0));
  state.handoffs = Math.max(0, Number(state.handoffs) || 0);
  state.questionIndex = Math.max(0, Number(state.questionIndex) || 0);
  state.cardOwned = Boolean(state.cardOwned);
  state.activated = Boolean(state.activated);
  state.purchasedAt = Math.max(0, Number(state.purchasedAt) || 0);
  state.completedAt = Math.max(0, Number(state.completedAt) || 0);
  if (!state.sourceLocation?.tsid && sourceLocation?.tsid) {
    state.sourceLocation = createLegalizeState(sourceLocation).sourceLocation;
  }
  questState.story.legalize = state;
  return state;
}

export function departForBackAlley(state) {
  if (!state || state.stage !== 'gregarious_departure') {
    return { ok: false, reason: 'not_at_departure_station', state };
  }
  state.stage = 'back_alley';
  return { ok: true, reason: 'arrived_back_alley', state };
}

export function completeBackAlleyBriefing(state) {
  if (!state || state.stage !== 'back_alley') {
    return { ok: false, reason: 'briefing_unavailable', state };
  }
  state.stage = 'back_alley_briefed';
  return { ok: true, reason: 'briefed', state };
}

export function enterBackAlleyStation(state) {
  if (!state || state.stage !== 'back_alley_briefed') {
    return { ok: false, reason: 'briefing_required', state };
  }
  state.stage = 'back_alley_station';
  return { ok: true, reason: 'entered_back_alley_station', state };
}

export function travelToGregarious(state) {
  if (!state || state.stage !== 'back_alley_station') {
    return { ok: false, reason: 'not_at_back_alley_station', state };
  }
  state.stage = 'gregarious_arrival';
  return { ok: true, reason: 'arrived_gregarious_station', state };
}

export function exitToGregariousGrange(state) {
  if (!state || state.stage !== 'gregarious_arrival') {
    return { ok: false, reason: 'not_at_gregarious_station', state };
  }
  state.stage = 'grange_exterior';
  return { ok: true, reason: 'entered_gregarious_grange', state };
}

export function enterBureaucraticHall(state) {
  if (!state || state.stage !== 'grange_exterior') {
    return { ok: false, reason: 'not_at_hall_entrance', state };
  }
  state.stage = 'hall_waiting';
  state.clerkIndex = 0;
  return { ok: true, reason: 'entered_hall', clerk: LEGALIZE_CLERKS[0], state };
}

export function callLegalizeApplicant(state) {
  if (!state || !['hall_waiting', 'hall_processing'].includes(state.stage)) {
    return { ok: false, reason: 'not_waiting', state };
  }
  state.stage = 'hall_called';
  return {
    ok: true,
    reason: 'called',
    clerk: LEGALIZE_CLERKS[state.clerkIndex],
    state,
  };
}

export function beginLegalizeApplication(state) {
  if (!state || state.stage !== 'hall_called') {
    return { ok: false, reason: 'wrong_clerk', state };
  }
  state.stage = 'hall_processing';
  if (state.handoffs < 1) {
    return {
      ok: true,
      reason: 'item_selection',
      clerk: LEGALIZE_CLERKS[state.clerkIndex],
      item: Object.freeze({
        classTsid: LEGALIZE_CARD_ID,
        label: 'Card-Carrying Qualification',
        cost: LEGALIZE_CARD_COST,
      }),
      state,
    };
  }
  const question = LEGALIZE_QUESTIONS[state.questionIndex % LEGALIZE_QUESTIONS.length];
  return {
    ok: true,
    reason: 'question',
    clerk: LEGALIZE_CLERKS[state.clerkIndex],
    question,
    state,
  };
}

export function requestLegalizeQualification(state) {
  if (!state || state.stage !== 'hall_processing' || state.handoffs > 0) {
    return { ok: false, reason: 'request_unavailable', state };
  }
  state.handoffs = 1;
  state.clerkIndex = 1;
  state.stage = 'hall_waiting';
  return {
    ok: true,
    reason: 'handoff',
    clerk: LEGALIZE_CLERKS[state.clerkIndex],
    state,
  };
}

export function answerLegalizeQuestion(state, optionIndex = 0) {
  if (!state || state.stage !== 'hall_processing' || state.handoffs < 1) {
    return { ok: false, reason: 'not_processing', state };
  }
  if (![0, 1].includes(Number(optionIndex))) {
    return { ok: false, reason: 'unknown_answer', state };
  }
  state.questionIndex += 1;
  return {
    ok: true,
    reason: 'payment',
    cost: LEGALIZE_CARD_COST,
    clerk: LEGALIZE_CLERKS[state.clerkIndex],
    state,
  };
}

export function purchaseQualification(state, currants, now = Date.now()) {
  if (!state || state.stage !== 'hall_processing' || state.handoffs < 1) {
    return { ok: false, reason: 'not_approved', state };
  }
  const have = Math.max(0, Number(currants) || 0);
  if (have < LEGALIZE_CARD_COST) {
    return {
      ok: false,
      reason: 'not_enough_currants',
      cost: LEGALIZE_CARD_COST,
      shortfall: LEGALIZE_CARD_COST - have,
      state,
    };
  }
  state.cardOwned = true;
  state.stage = 'card_owned';
  state.purchasedAt = Math.max(0, Number(now) || Date.now());
  return {
    ok: true,
    reason: 'purchased',
    cost: LEGALIZE_CARD_COST,
    item: LEGALIZE_CARD_ID,
    state,
  };
}

export function activateQualification(state, hasCard = true, now = Date.now()) {
  if (!state) return { ok: false, reason: 'missing_state', state };
  if (state.activated) return { ok: false, reason: 'already_activated', state };
  if (!state.cardOwned || !hasCard) return { ok: false, reason: 'card_missing', state };
  state.cardOwned = false;
  state.activated = true;
  state.stage = 'complete';
  state.completedAt = Math.max(0, Number(now) || Date.now());
  return { ok: true, reason: 'activated', reward: LEGALIZE_REWARD, state };
}

export function legalizeObjective(state) {
  if (!state) return 'Visit the Back Alley';
  // subway_gate.js 158: A Red Button turns you away for want of papers, and The Back Alley opens.
  if (state.stage === 'gregarious_departure') return 'Push A Red Button in the subway station';
  if (state.stage === 'back_alley') return 'Speak with the shady Bureaucrat';
  // npc_bureaucrat.js 795: instances_exit, back to the station you came from.
  if (state.stage === 'back_alley_briefed') return 'Back to Gregarious Grange Subway Station';
  if (state.stage === 'back_alley_station') return 'Take the subway to Gregarious Grange';
  if (state.stage === 'gregarious_arrival') return 'Exit Gregarious Grange Subway Station';
  if (state.stage === 'grange_exterior') return 'Enter the Bureaucratic Hall';
  if (state.stage === 'hall_waiting') return 'Move into the waiting area';
  if (state.stage === 'hall_called') {
    return `Speak with ${LEGALIZE_CLERKS[state.clerkIndex].name}`;
  }
  if (state.stage === 'hall_processing') {
    return `Continue with ${LEGALIZE_CLERKS[state.clerkIndex].name}`;
  }
  if (state.stage === 'card_owned') return 'Activate the Card-Carrying Qualification in your pack';
  return 'Card-Carrying Qualification activated';
}
