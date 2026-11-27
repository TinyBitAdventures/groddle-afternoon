/**
 * The Greedy Street Spirit — source-authored five-act bedtime story.
 *
 * Rules and copy are recovered from:
 * glitch-GameServerJS/quests/greedy_street_spirit*.js and the production
 * theatre location LNVD57N9ERF3TNH. This module stays DOM/Pixi-free so the
 * instance, repeat gate, and exact story order can be tested directly.
 */

export const GREEDY_STREET_SPIRIT_QUEST_ID = 'greedy_street_spirit';
export const GREEDY_STREET_SPIRIT_REPEAT_ID = 'greedy_street_spirit_reminisce';
export const GREEDY_STREET_ID = 'INSTANCE_GREEDY_STREET_SPIRIT';
export const GREEDY_STREET_PRODUCTION_TSID = 'LNVKEU5TKG33K7L';
export const GREEDY_STREET_GEOMETRY_TSID = 'GNVD57N9ERF3TNH';
/**
 * Austin 2026-11-27 (Glitch's prompt, no timer): Storyland has no time limit. Five minutes in the
 * quest asked "Are you stuck?" (questInstanceLocation(..., 5*60): greedy_street_spirit.js 168,
 * greedy_street_spirit_reminisce.js 125, the exit_delay; js/stuck-prompt.js).
 */
export const GREEDY_STREET_EXIT_PROMPT_MS = 5 * 60 * 1000;
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

/**
 * PURE (#598, G1111): the x of each act's own scene decos on the street (the middleground decos its
 * events show, from greedy-street-spirit-scenes.json), in game px (the deco's x less the street's
 * left edge), sorted. An act with none gives [].
 */
export function greedyActDecoXs(manifest, street) {
  const left = Number(street?.bounds?.l) || 0;
  const xs = new Map();
  for (const layer of street?.layers || []) {
    if (layer?.name !== 'middleground') continue;
    for (const deco of layer.decos || []) {
      const x = Number(deco?.x);
      if (deco?.id && Number.isFinite(x)) xs.set(String(deco.id), x - left);
    }
  }
  return GREEDY_ACTS.map((act) => {
    const ids = new Set(act.eventIds.flatMap((id) => manifest?.events?.[id]?.show || []));
    return [...ids].filter((id) => xs.has(id)).map((id) => xs.get(id)).sort((a, b) => a - b);
  });
}

/**
 * PURE (#598, G1111): where each act's Wall Button stands: under the middle of its own scene (the
 * median of its decos' x, so one star drifting off does not pull it aside), so on a phone the button
 * and the panel it plays are on screen together. Glitch's quest file gives no positions. An act with
 * no decos found stands at its fifth of the street.
 */
export function greedyButtonXs(manifest, street) {
  const width = Math.max(0, (Number(street?.bounds?.r) || 0) - (Number(street?.bounds?.l) || 0));
  return greedyActDecoXs(manifest, street).map((xs, i) => {
    if (!xs.length) return Math.round(((i + 0.5) / GREEDY_ACTS.length) * width);
    const mid = xs.length >> 1;
    return Math.round(xs.length % 2 ? xs[mid] : (xs[mid - 1] + xs[mid]) / 2);
  });
}

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
    actSteps: GREEDY_ACTS.map(() => 0),
    actsRead: [],
    lastLine: '',
  };
}

export function pressGreedyAct(state, actIndex, now = Date.now()) {
  if (!state || state.status !== 'running') {
    return { ok: false, reason: state?.status || 'missing' };
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

/** Every act's read_act_N flag is set in the quest's progress (the Piggy's own check). */
export function greedyActsAllRead(active) {
  return GREEDY_ACTS.every((_act, index) => Number(active?.progress?.[`read_act_${index + 1}`]) >= 1);
}

/**
 * G1112: a Greedy Street Spirit in the log with no storyland open (left by a logout, a closed tab
 * or a reload: the run lives only in the page). The source failed a run left before every act was
 * read (quests/greedy_street_spirit.js onExitLocation 145-163: failQuest unless read_act_1..5;
 * greedy_street_spirit_reminisce.js onExitLocation 108-118: failQuest unless complete, with
 * fail_time), so a Piggy offers the story again and the Bear's hour starts. The first story with
 * every act read stays: a Piggy talk finishes it (completeGreedyStreetSpiritWithPiggy). The repeat
 * with every act read had completed in the source on its last act (its requirements are the five
 * acts): `finishRepeat` says to hand it in. Call only with no live run. Returns { failed, finishRepeat }.
 */
export function failInterruptedGreedyStreetSpirit(questState, now = Date.now()) {
  const failed = [];
  let finishRepeat = false;
  const first = questState?.active?.[GREEDY_STREET_SPIRIT_QUEST_ID];
  if (first && !greedyActsAllRead(first)) {
    delete questState.active[GREEDY_STREET_SPIRIT_QUEST_ID];
    failed.push(GREEDY_STREET_SPIRIT_QUEST_ID);
  }
  const repeat = questState?.active?.[GREEDY_STREET_SPIRIT_REPEAT_ID];
  if (repeat && greedyActsAllRead(repeat)) finishRepeat = true;
  else if (repeat) {
    delete questState.active[GREEDY_STREET_SPIRIT_REPEAT_ID];
    markGreedyRepeatFailed(questState, now);
    failed.push(GREEDY_STREET_SPIRIT_REPEAT_ID);
  }
  return { failed, finishRepeat };
}

/*
 * G1163 (#623): Storyland's two walk-in boxes (street GNVD57N9ERF3TNH `boxes`). Storyland takes
 * the street over (js/location-events.js OWNED_STREETS), so nothing read them and the EXIT did
 * nothing. Glitch:
 * - greedy_street_spirit_check (x 5703, 200 x 600, just before the exit): with any act unread it
 *   said the line below once and moved you back 100 px to the left; once every act was read it said
 *   the Piggy line once (quests/greedy_street_spirit.js callback_greedy_street_spirit_check 107-131;
 *   the repeat's greedy_street_spirit_reminisce.js 82-92 has the warning only).
 * - instance_exit (x 5856, 50 x 70): back where you came from (locations/location.js 1488-1493,
 *   instances_get_exit, teleportToLocationDelayed). A run left with acts unread failed
 *   (onExitLocation 145-163), as the Leave button's abandon does.
 */
export const GREEDY_CHECK_BOX_ID = 'greedy_street_spirit_check';
export const GREEDY_EXIT_BOX_ID = 'instance_exit';
export const GREEDY_MISSED_STORY_LINE = "You've missed some of the story! It's much more rewarding if you read it all the way through.";
export const GREEDY_BACK_TO_PIGGY_LINE = "What a wonderful story. Let's return to the Piggy to wrap this up.";
/** pc.moveAvatar(pc.x-100, pc.y, 'left'). */
export const GREEDY_CHECK_PUSH_BACK = 100;
/**
 * The client tested the avatar's box, not its feet (as js/newxp.js inHitBox): the exit box's
 * bottom is 36 px over Storyland's floor (517 vs 553), so a feet-only test never fires.
 */
export const GREEDY_AVATAR_BODY_H = 100;

/** PURE: the avatar (feet x, y) overlaps a street box (bottom-centre x, y, w, h). */
export function greedyBoxHit(box, x, y, bodyH = GREEDY_AVATAR_BODY_H) {
  if (!box) return false;
  const w = Number(box.w) || 0;
  const h = Number(box.h) || 0;
  return x >= box.x - w / 2 && x <= box.x + w / 2 && y >= box.y - h && y - bodyH <= box.y;
}

/** PURE: Storyland's two boxes from the street JSON (others are left out). */
export function greedyStreetBoxes(street) {
  return (street?.boxes || []).filter((b) => b?.id === GREEDY_CHECK_BOX_ID || b?.id === GREEDY_EXIT_BOX_ID);
}

/**
 * PURE: the boxes the avatar has just walked into this frame (a box fires on the way in, as the
 * client's hitbox did); `inside` (a Set of ids) is kept up to date.
 */
export function greedyBoxesEntered(boxes, inside, x, y) {
  const entered = [];
  for (const box of boxes || []) {
    const hit = greedyBoxHit(box, x, y);
    if (hit && !inside.has(box.id)) entered.push(box.id);
    if (hit) inside.add(box.id);
    else inside.delete(box.id);
  }
  return entered;
}

/**
 * What walking into a box does: { say, pushBack } for the check box (each line once a run, the run
 * remembering it), { leave: true, abandon } for the exit (abandon: acts left unread), else null.
 */
export function greedyStreetBoxEnter(state, boxId) {
  if (!state || state.status === 'complete') return null;
  const done = state.actsRead.length === GREEDY_ACTS.length;
  if (boxId === GREEDY_CHECK_BOX_ID) {
    if (!done && !state.warnedStory) {
      state.warnedStory = true;
      return { say: GREEDY_MISSED_STORY_LINE, pushBack: GREEDY_CHECK_PUSH_BACK };
    }
    if (done && !state.repeat && !state.piggyExplained) {
      state.piggyExplained = true;
      return { say: GREEDY_BACK_TO_PIGGY_LINE, pushBack: 0 };
    }
    return null;
  }
  if (boxId === GREEDY_EXIT_BOX_ID) return { leave: true, abandon: !done };
  return null;
}
