export const WINTER_WALK_QUEST_ID = 'winter_walk';
export const WINTER_WALK_REPEAT_QUEST_ID = 'winter_walk_part2';
/**
 * The two instance streets (winter_walk.js:24-33 LIFH2AKJ5I735SV and
 * LIFNNTRK1073PQ6), rebuilt from players' pictures in js/winter-walk-streets.js
 * (they stood in on Drifa's Bright Day and Dark Cavern before).
 */
export const WINTER_WALK_STREET_ID = 'GIFH2AKJ5I735SV';
export const WINTER_HAVEN_STREET_ID = 'GIFNNTRK1073PQ6';
export const WINTER_WALK_DURATION_MS = 5 * 60 * 1000;
export const WINTER_WALK_ICE_REWARD = 23;

/**
 * When the walk may be offered (live report 2026-10-30 #7: leave early, start
 * again, collect the motes again). The source's rules:
 * - winter_walk.js 18-23: after A Summer's Day (prereq_quests
 *   blue_and_white_part1) and from level 7 (over_level 7); canOffer 76-84: not
 *   until an hour after A Summer's Day was finished.
 * - winter_walk.js onExitLocation 96-107: leaving before the end fails it and
 *   takes it out of the log (quests_fail_and_remove), so it can be offered
 *   again; winter_walk_part2.js onExitLocation 88-100: the repeat fails and
 *   keeps its fail_time, and canOffer 64-76 waits an hour after the first
 *   walk, after the last repeat and after the last failed one.
 * - The motes are iMG quoins, and the walk's two streets are not among the
 *   places that ignore the daily quoin limit (items/quoin.js 159, 236-237;
 *   locations/location.js 361 sets ignore_quoin_limit for top_of_tree only),
 *   so they stop at the limit and count toward it.
 */
export const WINTER_WALK_MIN_LEVEL = 7;
export const WINTER_WALK_PREREQ_QUEST_ID = 'blue_and_white_part1';
export const WINTER_WALK_OFFER_WAIT_MS = 60 * 60 * 1000;

const ms = (v) => Math.max(0, Number(v) || 0);

/** The walk's own times, kept in the quest save (questState.story.winterWalk). */
export function ensureWinterWalkStory(questState) {
  questState.story ||= {};
  const story = questState.story.winterWalk || {};
  story.firstCompletedAt = ms(story.firstCompletedAt);
  story.repeatCompletedAt = ms(story.repeatCompletedAt);
  story.repeatFailedAt = ms(story.repeatFailedAt);
  questState.story.winterWalk = story;
  return story;
}

/**
 * Whether the walk (or, with repeat, Winter Walk part 2) may be offered now.
 * `summersDayDoneAt` is when A Summer's Day was finished (0 when the save does
 * not know: an old save, so no wait). Answers { ok, reason, remainingMs? }.
 */
export function canOfferWinterWalk(questState, {
  now = Date.now(),
  level = 1,
  repeat = false,
  summersDayDoneAt = 0,
  bypassCooldown = false,
} = {}) {
  const story = ensureWinterWalkStory(questState);
  const completed = new Set(questState.completed || []);
  const wait = (since) => {
    const left = WINTER_WALK_OFFER_WAIT_MS - (now - since);
    return !bypassCooldown && since > 0 && left > 0 ? { ok: false, reason: 'cooldown', remainingMs: left } : null;
  };
  if (repeat) {
    if (!completed.has(WINTER_WALK_QUEST_ID) && !story.firstCompletedAt) return { ok: false, reason: 'first_not_complete' };
    return wait(Math.max(story.firstCompletedAt, story.repeatCompletedAt, story.repeatFailedAt)) || { ok: true, reason: 'ready' };
  }
  if (completed.has(WINTER_WALK_QUEST_ID) || story.firstCompletedAt) return { ok: false, reason: 'already_complete' };
  if (!completed.has(WINTER_WALK_PREREQ_QUEST_ID)) return { ok: false, reason: 'prereq' };
  if (Number(level) < WINTER_WALK_MIN_LEVEL) return { ok: false, reason: 'level' };
  return wait(ms(summersDayDoneAt)) || { ok: true, reason: 'ready' };
}

/**
 * A walk that ended: 'complete', or 'failed' (left early, ran out of time,
 * or lost with the page). The first walk's failure leaves nothing behind
 * (quests_fail_and_remove); the repeat's keeps its fail time.
 */
export function noteWinterWalkEnd(questState, { repeat = false, outcome = 'failed', now = Date.now() } = {}) {
  const story = ensureWinterWalkStory(questState);
  if (outcome === 'complete') {
    if (repeat) story.repeatCompletedAt = now;
    else story.firstCompletedAt = now;
    // #220: a finished run is over; the next walk has every mote again.
    if (story.runs) delete story.runs[repeat ? WINTER_WALK_REPEAT_QUEST_ID : WINTER_WALK_QUEST_ID];
  } else if (repeat) {
    story.repeatFailedAt = now;
  }
  return story;
}

/**
 * At boot: a walk still in the log was lost with the page (the walk itself is
 * never saved), which the source counts as leaving it. Takes it out of the
 * active quests and notes the repeat's failure. Returns the quest ids failed.
 */
export function failInterruptedWinterWalk(questState, now = Date.now()) {
  const failed = [];
  for (const [id, repeat] of [[WINTER_WALK_QUEST_ID, false], [WINTER_WALK_REPEAT_QUEST_ID, true]]) {
    if (!questState?.active?.[id]) continue;
    delete questState.active[id];
    noteWinterWalkEnd(questState, { repeat, outcome: 'failed', now });
    failed.push(id);
  }
  return failed;
}

/**
 * #220: what each mote gives before the player's quoin multiplier and mood bonus. The motes are
 * quoins with a fixed benefit (items/quoin.js 165), multiplied by the player's quoin multiplier
 * (171-174) and then the mood bonus (184, inc_stats.js stats_add_xp 271, stats_xp_apply_bonus
 * 559-562: up to x1.2). The amounts are Lily Linguistic's recording (2Xko9Hy-cLE, 2012-12-06:
 * +3000, +120, +600, +720 and a white +1098), which already carried her x1.2 mood bonus at
 * multiplier 1: the table held those shown amounts, and the game then applied the player's own
 * multiplier and mood again (Friendly at x6: 120 -> 864, 3000 -> 19,800). The white +1098 was a
 * Qurazy quoin: 915 is qurazy_rewards[59], Lily's level 60 (config_base.js 263-323), x1.2; it is
 * level-scaled and takes no multiplier (quoin.js 207-210), but the table paid 1098 x the
 * multiplier (7,906 at x6). That mote is now a Qurazy (WINTER_MOTE_KINDS).
 */
export const WINTER_MOTE_REWARDS = Object.freeze({
  surface: Object.freeze([100, 100, 2500, 100, 100, 200]),
  haven: Object.freeze([100, 100, 100, 200, 100, 100]),
  return: Object.freeze([0, 500, 600]),
});

/** The kind of quoin each mote is ('xp' unless listed): a Qurazy pays by level (quoins.js qrazyRewardForLevel). */
export const WINTER_MOTE_KINDS = Object.freeze({
  return: Object.freeze(['qurazy', 'xp', 'xp']),
});

export function winterMoteKind(stage, index) {
  return WINTER_MOTE_KINDS[stage]?.[index] || 'xp';
}

const MOTE_STAGES = ['surface', 'haven', 'return'];

function moteList(stage, list) {
  const n = WINTER_MOTE_REWARDS[stage].length;
  const out = [...new Set((Array.isArray(list) ? list : []).map((v) => Math.floor(Number(v))))]
    .filter((i) => Number.isInteger(i) && i >= 0 && i < n);
  return out.sort((a, b) => a - b);
}

/**
 * #220 (Friendly): a walk left or timed out was offered again with every mote back, so the motes
 * could be taken over and over until the daily quoin limit. A run now lasts until the walk is
 * finished: the motes taken in it are kept in the quest save (story.winterWalk.runs[questId])
 * and a retry does not spawn them again. Finishing the walk clears the run, so the next repeat
 * starts with every mote, as the first walk did.
 */
export function winterWalkRun(questState, { repeat = false } = {}) {
  const story = ensureWinterWalkStory(questState);
  const id = repeat ? WINTER_WALK_REPEAT_QUEST_ID : WINTER_WALK_QUEST_ID;
  story.runs = story.runs && typeof story.runs === 'object' ? story.runs : {};
  const run = story.runs[id] && typeof story.runs[id] === 'object' ? story.runs[id] : {};
  const collected = run.collected && typeof run.collected === 'object' ? run.collected : {};
  run.collected = Object.fromEntries(MOTE_STAGES.map((stage) => [stage, moteList(stage, collected[stage])]));
  story.runs[id] = run;
  return run;
}

/** Notes a mote taken in this run (kept until the walk is finished). */
export function noteWinterMoteTaken(questState, { repeat = false, stage, index } = {}) {
  if (!WINTER_MOTE_REWARDS[stage]) return null;
  const run = winterWalkRun(questState, { repeat });
  run.collected[stage] = moteList(stage, [...run.collected[stage], index]);
  return run;
}

export function createWinterWalkState({
  now = Date.now(),
  sourceLocation = null,
  repeat = false,
  run = null,
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
    // A retry of an unfinished run starts without the motes it already took (#220).
    collected: {
      surface: moteList('surface', run?.collected?.surface),
      haven: moteList('haven', run?.collected?.haven),
      return: moteList('return', run?.collected?.return),
    },
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
  if ((state.collected[stage] ||= []).includes(i)) return { ok: false, reason: 'already_collected', state };
  const amount = rewards[i];
  state.collected[stage].push(i);
  state.collected[stage].sort((a, b) => a - b);
  state.imgEarned += amount;
  return { ok: true, reason: 'collected', amount, kind: winterMoteKind(stage, i), state };
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

/**
 * #298 (G701): at the daily quoin limit the iMG motes refuse, as a quoin does in Glitch
 * (items/quoin.js 159: no message at all), and the walk's "0/15 motes" looked broken. The rule
 * stays; the first mote refused in a walk says why (the limit prompt's own words, js/quoins.js
 * quoinLimitPrompt), and the count says so beside it. A mote left behind stays in the run
 * (#220 winterWalkRun keeps only the motes taken), so it is there on the next walk.
 */
export const WINTER_MOTE_LIMIT_NOTICE =
  "You've reached your limit on quoins for this game day, and winter motes are quoins too. The motes you leave will still be here on a walk next game day.";
/** Beside the count: the card's line, and the pill's short word ("0/15 · limit", room on a phone). */
export const WINTER_MOTE_LIMIT_NOTE = "Today's quoin limit is reached: the motes wait for the next game day.";
export const WINTER_MOTE_LIMIT_SHORT = 'limit';

/** Whether this mote is held back by the limit (a Qurazy is outside it, quoin.js 159). */
export function winterMoteCapped(kind, { collectedToday = 0, dailyLimit = Infinity } = {}) {
  return kind !== 'qurazy' && Number(collectedToday) >= Number(dailyLimit);
}

/** The notice for a refused mote: once per walk, then ''. */
export function winterMoteLimitNotice(state) {
  if (!state || state.limitNoticeShown) return '';
  state.limitNoticeShown = true;
  return WINTER_MOTE_LIMIT_NOTICE;
}

export function winterWalkObjective(state) {
  if (!state) return 'Begin the Winter Walk';
  if (state.status === 'expired') return 'The winter path faded';
  if (state.status === 'complete') return 'Winter Walk complete';
  if (state.stage === 'haven') return 'Climb through Winter Haven and find the way out';
  if (state.stage === 'return') return 'Gather the last winter motes and follow the light home';
  return 'Cross the snowy path to Winter Haven';
}
