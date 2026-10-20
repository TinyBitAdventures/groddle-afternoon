export const SUMMERS_DAY_QUEST_ID = 'blue_and_white_part1';
export const SUMMERS_DAY_REPEAT_QUEST_ID = 'blue_and_white_part2';

export const SUMMERS_DAY_MAIN_ID = 'SUMMERS_DAY_MAIN';
export const SUMMERS_DAY_BONUS_ID = 'SUMMERS_DAY_BONUS';
export const SUMMERS_DAY_MAIN_PRODUCTION_TSID = 'LNVIH6NU3M13MJJ';
export const SUMMERS_DAY_MAIN_DEV_TSID = 'LPF101OO2B13DEQ';
export const SUMMERS_DAY_FIRST_PRODUCTION_TSID = 'LNVIABSR3M139C7';
export const SUMMERS_DAY_FIRST_DEV_TSID = 'LPF2SVV22B13J4O';
export const SUMMERS_DAY_BONUS_PRODUCTION_TSID = 'LNVIL1E14M13K5I';
export const SUMMERS_DAY_BONUS_DEV_TSID = 'LPF1024Q2B135UG';

export const SUMMERS_DAY_MAIN_DURATION_MS = 5 * 60 * 1000;
export const SUMMERS_DAY_BONUS_DURATION_MS = 2 * 60 * 1000;
export const SUMMERS_DAY_BONUS_DOT_COUNT = 8;
export const SUMMERS_DAY_BONUS_DOT_IMG = 8;
export const SUMMERS_DAY_FIRST_OFFER_COOLDOWN_MS = 4 * 60 * 60 * 1000;
export const SUMMERS_DAY_REPEAT_COOLDOWN_MS = 60 * 60 * 1000;
export const SUMMERS_DAY_SOURCE_SPAWN = Object.freeze({ x: 3709, y: -258 });
export const SUMMERS_DAY_BONUS_SPAWN = Object.freeze({ x: 380, y: -70 });

export const SUMMERS_DAY_CHECKPOINTS = Object.freeze([
  'bird_1',
  'stone_1',
  'bird_2',
  'water',
  'orb_1',
  'orb_2',
  'orb_3',
  'orb_4',
  'bird_3',
  'dot_1',
  'stone_2',
  'dot_2',
  'dot_3',
  'bird_4',
  'exit',
]);

export const SUMMERS_DAY_GUIDE_LINES = Object.freeze({
  bird_1: 'Hey, I’m up here!\nCan you reach me?',
  bird_2: 'Not bad.\nTry this next one.',
  bird_3: 'Almost there.',
  bird_4: 'Wow, you’re pretty good!\nI’ve got something upstairs for you.',
});

export const SUMMERS_DAY_QURAZY_OFFSETS = Object.freeze([
  Object.freeze({ x: -110, y: -75 }),
  Object.freeze({ x: -75, y: -140 }),
  Object.freeze({ x: 0, y: -180 }),
  Object.freeze({ x: 75, y: -140 }),
  Object.freeze({ x: 110, y: -75 }),
]);

export const SUMMERS_DAY_OFFER =
  'Yes. Good. Here it is: there’s a certain memory of a summer’s day shared by all the Giants. <split butt_txt="Yes?" />None of them remember what happened or even why they remember it... yet they do. <split butt_txt="Interesting" />It is just an impression, a feeling. Maybe it is important, maybe it is not. <split butt_txt="OK" />Would you like to go there now and see what you think?';
export const SUMMERS_DAY_REPEAT_OFFER = 'Are you ready to reminisce A Summer’s Day?';
export const SUMMERS_DAY_COMPLETION =
  'You see, {pc_label}? I thought you could benefit from that experience. No one knows what it means, so let your imagination go wild.';
export const SUMMERS_DAY_REPEAT_COMPLETION =
  'Welcome back, {pc_label}. I hope you enjoyed yourself.';

export function ensureSummersDayStory(questState) {
  questState.story ||= {};
  const story = questState.story.summersDay || {};
  story.firstCompletedAt = Math.max(0, Number(story.firstCompletedAt) || 0);
  story.repeatCompletedAt = Math.max(0, Number(story.repeatCompletedAt) || 0);
  story.repeatFailedAt = Math.max(0, Number(story.repeatFailedAt) || 0);
  story.lastOfferedAt = Math.max(0, Number(story.lastOfferedAt) || 0);
  story.pendingQurazies = Math.max(0, Math.min(5, Math.floor(Number(story.pendingQurazies) || 0)));
  story.qurazyStreetTsid = story.qurazyStreetTsid ? String(story.qurazyStreetTsid) : '';
  questState.story.summersDay = story;
  return story;
}

export function canOfferSummersDay(questState, {
  now = Date.now(),
  repeat = false,
  bypassCooldown = false,
} = {}) {
  const story = ensureSummersDayStory(questState);
  const completed = new Set(questState.completed || []);
  if (repeat) {
    if (!completed.has(SUMMERS_DAY_QUEST_ID) && !story.firstCompletedAt) {
      return { ok: false, reason: 'first_not_complete' };
    }
    const lastAttempt = Math.max(story.firstCompletedAt, story.repeatCompletedAt, story.repeatFailedAt);
    if (!bypassCooldown && now - lastAttempt < SUMMERS_DAY_REPEAT_COOLDOWN_MS) {
      return {
        ok: false,
        reason: 'cooldown',
        remainingMs: SUMMERS_DAY_REPEAT_COOLDOWN_MS - (now - lastAttempt),
      };
    }
    return { ok: true, reason: 'ready' };
  }
  if (completed.has(SUMMERS_DAY_QUEST_ID) || story.firstCompletedAt) {
    return { ok: false, reason: 'already_complete' };
  }
  if (
    !bypassCooldown &&
    story.lastOfferedAt &&
    now - story.lastOfferedAt < SUMMERS_DAY_FIRST_OFFER_COOLDOWN_MS
  ) {
    return {
      ok: false,
      reason: 'cooldown',
      remainingMs: SUMMERS_DAY_FIRST_OFFER_COOLDOWN_MS - (now - story.lastOfferedAt),
    };
  }
  return { ok: true, reason: 'ready' };
}

export function markSummersDayOffered(questState, now = Date.now()) {
  const story = ensureSummersDayStory(questState);
  story.lastOfferedAt = now;
  return story;
}

export function createSummersDayRun({
  now = Date.now(),
  sourceLocation = null,
  repeat = false,
} = {}) {
  return {
    status: 'main',
    stage: 'main',
    repeat: Boolean(repeat),
    startedAt: now,
    expiresAt: now + SUMMERS_DAY_MAIN_DURATION_MS,
    sourceLocation: sourceLocation?.tsid
      ? {
          tsid: String(sourceLocation.tsid),
          x: Number(sourceLocation.x) || 0,
          y: Number(sourceLocation.y) || 0,
        }
      : null,
    checkpoints: [],
    bonusCollected: [],
    bonusImgEarned: 0,
  };
}

export function summersDayRemainingMs(run, now = Date.now()) {
  if (!run || ['complete', 'expired', 'abandoned'].includes(run.status)) return 0;
  return Math.max(0, Number(run.expiresAt) - now);
}

export function advanceSummersDayCheckpoint(run, checkpoint, now = Date.now()) {
  if (!run || run.stage !== 'main') return { ok: false, reason: 'wrong_stage', run };
  if (summersDayRemainingMs(run, now) <= 0) {
    expireSummersDay(run, null, now);
    return { ok: false, reason: 'expired', run };
  }
  const expected = SUMMERS_DAY_CHECKPOINTS[run.checkpoints.length];
  if (checkpoint !== expected) {
    return {
      ok: false,
      reason: run.checkpoints.includes(checkpoint) ? 'already_complete' : 'out_of_order',
      expected,
      run,
    };
  }
  run.checkpoints.push(checkpoint);
  return {
    ok: true,
    reason: checkpoint === 'exit' ? 'main_complete' : 'advanced',
    checkpoint,
    next: SUMMERS_DAY_CHECKPOINTS[run.checkpoints.length] || null,
    run,
  };
}

export function enterSummersDayBonus(run, now = Date.now()) {
  if (!run || run.stage !== 'main') return { ok: false, reason: 'wrong_stage', run };
  if (run.checkpoints.at(-1) !== 'exit') return { ok: false, reason: 'main_incomplete', run };
  if (summersDayRemainingMs(run, now) <= 0) {
    expireSummersDay(run, null, now);
    return { ok: false, reason: 'expired', run };
  }
  run.stage = 'bonus';
  run.status = 'bonus';
  run.startedAt = now;
  run.expiresAt = now + SUMMERS_DAY_BONUS_DURATION_MS;
  return { ok: true, reason: 'entered_bonus', run };
}

export function collectSummersDayBonusQuoin(
  run,
  index,
  now = Date.now(),
  total = SUMMERS_DAY_BONUS_DOT_COUNT
) {
  if (!run || run.stage !== 'bonus') return { ok: false, reason: 'wrong_stage', run };
  if (summersDayRemainingMs(run, now) <= 0) {
    expireSummersDay(run, null, now);
    return { ok: false, reason: 'expired', run };
  }
  const i = Math.floor(Number(index));
  if (i < 0 || i >= total) return { ok: false, reason: 'invalid_quoin', run };
  if (run.bonusCollected.includes(i)) return { ok: false, reason: 'already_collected', run };
  run.bonusCollected.push(i);
  run.bonusCollected.sort((a, b) => a - b);
  run.bonusImgEarned = Math.max(0, Number(run.bonusImgEarned) || 0) + SUMMERS_DAY_BONUS_DOT_IMG;
  return {
    ok: true,
    reason: 'collected',
    index: i,
    amount: SUMMERS_DAY_BONUS_DOT_IMG,
    run,
  };
}

export function finishSummersDay(run, questState, now = Date.now()) {
  if (!run || run.stage !== 'bonus') return { ok: false, reason: 'wrong_stage', run };
  if (summersDayRemainingMs(run, now) <= 0) {
    expireSummersDay(run, null, now);
    return { ok: false, reason: 'expired', run };
  }
  run.stage = 'complete';
  run.status = 'complete';
  const story = ensureSummersDayStory(questState);
  if (run.repeat) {
    story.repeatCompletedAt = now;
  } else {
    story.firstCompletedAt = now;
    story.pendingQurazies = SUMMERS_DAY_QURAZY_OFFSETS.length;
    story.qurazyStreetTsid = run.sourceLocation?.tsid || '';
  }
  return {
    ok: true,
    reason: 'complete',
    qurazyCount: run.repeat ? 0 : SUMMERS_DAY_QURAZY_OFFSETS.length,
    run,
    story,
  };
}

export function expireSummersDay(run, questState = null, now = Date.now()) {
  if (!run || ['complete', 'expired', 'abandoned'].includes(run.status)) {
    return { ok: false, reason: run?.status || 'missing', run };
  }
  if (summersDayRemainingMs(run, now) > 0) {
    return { ok: false, reason: 'time_remaining', run };
  }
  run.status = 'expired';
  if (run.repeat && questState) {
    ensureSummersDayStory(questState).repeatFailedAt = now;
  }
  return { ok: true, reason: 'expired', run };
}

export function abandonSummersDay(run, questState = null, now = Date.now()) {
  if (!run || ['complete', 'expired', 'abandoned'].includes(run.status)) {
    return { ok: false, reason: run?.status || 'missing', run };
  }
  run.status = 'abandoned';
  if (run.repeat && questState) {
    ensureSummersDayStory(questState).repeatFailedAt = now;
  }
  return { ok: true, reason: 'abandoned', run };
}

export function summersDayProgress(run) {
  return {
    current: run?.checkpoints?.length || 0,
    total: SUMMERS_DAY_CHECKPOINTS.length,
    bonusCollected: run?.bonusCollected?.length || 0,
    bonusTotal: SUMMERS_DAY_BONUS_DOT_COUNT,
  };
}

export function summersDayObjective(run) {
  if (!run) return 'Enter the Giants’ shared memory';
  if (run.status === 'expired') return 'The summer memory faded';
  if (run.status === 'complete') return 'A Summer’s Day complete';
  if (run.stage === 'bonus') return 'Climb through the Annex and find the way home';
  const next = SUMMERS_DAY_CHECKPOINTS[run.checkpoints.length];
  const objectives = {
    bird_1: 'Walk into the pale woods',
    stone_1: 'Follow the owl to the first stone',
    bird_2: 'Cross the revealed shelf',
    water: 'Reach the bridge and investigate the water',
    orb_1: 'Touch the first blue light',
    orb_2: 'Follow the lights across the water',
    orb_3: 'Keep the memory moving',
    orb_4: 'Wake the water platform',
    bird_3: 'Follow the owl beyond the pool',
    dot_1: 'Touch the first pulse dot',
    stone_2: 'Press the second stone',
    dot_2: 'Reach the next pulse dot',
    dot_3: 'Complete the chain of lights',
    bird_4: 'Find the last owl',
    exit: 'Climb the revealed ladder',
  };
  return objectives[next] || 'Let the memory unfold';
}

export function summersDayQurazyPoints(origin) {
  const x = Number(origin?.x) || 0;
  const y = Number(origin?.y) || 0;
  return SUMMERS_DAY_QURAZY_OFFSETS.map((offset, index) => ({
    index,
    x: x + offset.x,
    y: y + offset.y,
  }));
}
