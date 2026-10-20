/**
 * The Greedy Street Spirit — source-authored five-act bedtime story.
 *
 * Rules and copy are recovered from:
 * glitch-GameServerJS/quests/greedy_street_spirit*.js and the production
 * theatre location LNVD57N9ERF3TNH. This module stays DOM/Pixi-free so the
 * timed instance, repeat gate, and exact story order can be tested directly.
 */

export const GREEDY_STREET_SPIRIT_QUEST_ID = 'greedy_street_spirit';
export const GREEDY_STREET_SPIRIT_REPEAT_ID = 'greedy_street_spirit_reminisce';
export const GREEDY_STREET_ID = 'INSTANCE_GREEDY_STREET_SPIRIT';
export const GREEDY_STREET_PRODUCTION_TSID = 'LNVKEU5TKG33K7L';
export const GREEDY_STREET_GEOMETRY_TSID = 'GNVD57N9ERF3TNH';
export const GREEDY_STREET_DURATION_MS = 5 * 60 * 1000;
export const GREEDY_REPEAT_COOLDOWN_MS = 60 * 60 * 1000;

export const GREEDY_FIRST_REWARD = Object.freeze({
  mood: 150,
  giant: 'pot',
  favor: 100,
  item: 'emotional_bear',
  count: 1,
});
export const GREEDY_REPEAT_REWARD = Object.freeze({
  item: 'waffles',
  count: 4,
});

export const GREEDY_ACTS = Object.freeze([
  Object.freeze({
    title: 'Act I',
    eventIds: Object.freeze([
      'act1_button2_down',
      'act1_button1_down',
      'act1_button3_down',
    ]),
    lines: Object.freeze([
      'One night, the greedy street spirit looked up at the night sky. He wanted to gaze at the stars whenever he wished.',
      'The greedy street spirit wanted the stars so much that he started plucking them from the sky.',
      'Then the greedy street spirit carried his crate of stars away from the empty night sky.',
    ]),
  }),
  Object.freeze({
    title: 'Act II',
    eventIds: Object.freeze([
      'act2_button4_down',
      'act2_button2_down',
      'act2_button1_down',
      'act2_button3_down',
    ]),
    lines: Object.freeze([
      'The next day, the moon asked the greedy street spirit to keep an eye out for the stars, for the moon dearly missed their company at night.',
      'Soon after, the sun came bounding up and asked if the greedy street spirit had seen the stars lately, since they usually tickle the sun awake to start the morning.',
      'Then the budding flower paid a visit to the greedy street spirit and inquired if he knew where the stars had gone to, for the budding flower missed gazing up at their shimmering brillance.',
      'When the greedy street spirit was finally alone again, he watched the stars shimmer and shine in his crate.',
    ]),
  }),
  Object.freeze({
    title: 'Act III',
    eventIds: Object.freeze([
      'act3_button3_down',
      'act3_button1_down',
      'act3_button2_down',
    ]),
    lines: Object.freeze([
      'To celebrate his newly acquired shinies, the greedy street spirit decided to party by the riverbed.',
      'So the greedy street spirit started dancing, all the while staring at his stars.',
      'But then the greedy street spirit tripped and knocked over his crate, spilling the stars into the river.',
    ]),
  }),
  Object.freeze({
    title: 'Act IV',
    eventIds: Object.freeze([
      'act4_button1_down',
      'act4_button3_down',
      'act4_button2_down',
    ]),
    lines: Object.freeze([
      'The stars dissolved into the water, making it glimmer, which made the budding flower smile.',
      'The sun was tickled awake by the sparkles in the rain.',
      'And when the clouds cleared, the moon was not lonely anymore.',
    ]),
  }),
  Object.freeze({
    title: 'Act V',
    eventIds: Object.freeze([
      'act5_final',
      'act5_final2',
      'act5_final3',
    ]),
    lines: Object.freeze([
      'After seeing what joy sharing the stars brought, the greedy street spirit was greedy no more.',
      'And felt so light-hearted that he started floating about, so as to never stumble and fall again.',
      'That is why, to this day, street spirits float around and share their goods with everyone … for a fair price of course.',
    ]),
  }),
]);

function finiteTime(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.floor(number)) : fallback;
}

export function ensureGreedyStory(questState) {
  questState.story ||= {};
  const seed = questState.story.greedyStreetSpirit || {};
  const story = {
    firstCompletedAt: finiteTime(seed.firstCompletedAt),
    lastRepeatCompletedAt: finiteTime(seed.lastRepeatCompletedAt),
    lastRepeatFailedAt: finiteTime(seed.lastRepeatFailedAt),
  };
  questState.story.greedyStreetSpirit = story;
  return story;
}

export function createGreedyStreetSpiritState({
  repeat = false,
  sourceLocation = null,
  enteredAt = Date.now(),
} = {}) {
  const startedAt = finiteTime(enteredAt, Date.now());
  return {
    repeat: Boolean(repeat),
    status: 'running',
    sourceLocation: sourceLocation ? { ...sourceLocation } : null,
    startedAt,
    deadlineAt: startedAt + GREEDY_STREET_DURATION_MS,
    actSteps: GREEDY_ACTS.map(() => 0),
    actsRead: [],
    lastLine: '',
  };
}

export function greedyRemainingMs(state, now = Date.now()) {
  if (!state) return 0;
  return Math.max(0, finiteTime(state.deadlineAt) - finiteTime(now));
}

export function expireGreedyStreetSpirit(state, now = Date.now()) {
  if (!state || state.status !== 'running' || greedyRemainingMs(state, now) > 0) {
    return { ok: false, reason: state?.status || 'not_expired' };
  }
  state.status = 'expired';
  return { ok: true, status: state.status };
}

export function pressGreedyAct(state, actIndex, now = Date.now()) {
  if (!state || state.status !== 'running') {
    return { ok: false, reason: state?.status || 'missing' };
  }
  if (greedyRemainingMs(state, now) <= 0) {
    expireGreedyStreetSpirit(state, now);
    return { ok: false, reason: 'expired' };
  }
  const index = Math.floor(Number(actIndex));
  const act = GREEDY_ACTS[index];
  if (!act) return { ok: false, reason: 'unknown_act' };
  const step = Math.max(0, Math.floor(Number(state.actSteps[index]) || 0));
  if (step >= act.lines.length) {
    return { ok: false, reason: 'act_complete', actCompleted: true };
  }
  const line = act.lines[step];
  const eventId = act.eventIds[step];
  const nextStep = step + 1;
  state.actSteps[index] = nextStep;
  state.lastLine = line;
  const actCompleted = nextStep >= act.lines.length;
  if (actCompleted && !state.actsRead.includes(index + 1)) {
    state.actsRead.push(index + 1);
    state.actsRead.sort((a, b) => a - b);
  }
  const storyCompleted = state.actsRead.length === GREEDY_ACTS.length;
  if (storyCompleted) state.status = 'ready';
  return {
    ok: true,
    actIndex: index,
    step,
    eventId,
    line,
    actCompleted,
    storyCompleted,
  };
}

export function greedyObjective(state) {
  if (!state) return 'Enter storyland.';
  if (state.status === 'expired') return 'The bedtime story faded.';
  if (state.status === 'complete') return 'The bedtime story is complete.';
  if (state.status === 'ready') {
    return state.repeat
      ? 'The whole story has been remembered.'
      : 'Return to the Piggy to wrap this up.';
  }
  const nextIndex = state.actSteps.findIndex(
    (step, index) => step < GREEDY_ACTS[index].lines.length
  );
  const index = nextIndex < 0 ? GREEDY_ACTS.length - 1 : nextIndex;
  const step = state.actSteps[index] || 0;
  return `${GREEDY_ACTS[index].title}: press its Wall Button (${step}/${GREEDY_ACTS[index].lines.length}).`;
}

export function canOfferGreedyFirst(questState, pc = {}) {
  if ((Number(pc.level) || 0) <= 3) return { ok: false, reason: 'level' };
  if (questState?.active?.[GREEDY_STREET_SPIRIT_QUEST_ID]) {
    return { ok: false, reason: 'active' };
  }
  if (questState?.completed?.includes(GREEDY_STREET_SPIRIT_QUEST_ID)) {
    return { ok: false, reason: 'complete' };
  }
  return { ok: true };
}

export function canOfferGreedyRepeat(
  questState,
  now = Date.now(),
  { bypassCooldown = false } = {}
) {
  if (!questState?.completed?.includes(GREEDY_STREET_SPIRIT_QUEST_ID)) {
    return { ok: false, reason: 'prereq' };
  }
  if (questState?.active?.[GREEDY_STREET_SPIRIT_REPEAT_ID]) {
    return { ok: false, reason: 'active' };
  }
  const story = ensureGreedyStory(questState);
  const lastAttempt = Math.max(
    story.firstCompletedAt,
    story.lastRepeatCompletedAt,
    story.lastRepeatFailedAt
  );
  const availableAt = lastAttempt + GREEDY_REPEAT_COOLDOWN_MS;
  if (!bypassCooldown && finiteTime(now) < availableAt) {
    return { ok: false, reason: 'cooldown', availableAt };
  }
  return { ok: true, availableAt };
}

export function markGreedyFirstComplete(questState, now = Date.now()) {
  const story = ensureGreedyStory(questState);
  story.firstCompletedAt = finiteTime(now);
  return story;
}

export function markGreedyRepeatComplete(questState, now = Date.now()) {
  const story = ensureGreedyStory(questState);
  story.lastRepeatCompletedAt = finiteTime(now);
  return story;
}

export function markGreedyRepeatFailed(questState, now = Date.now()) {
  const story = ensureGreedyStory(questState);
  story.lastRepeatFailedAt = finiteTime(now);
  return story;
}
