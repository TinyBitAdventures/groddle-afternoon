/**
 * A Summer's Day (GSJS quests/blue_and_white_part1.js and _part2.js): a five-minute
 * private memory, then the two-minute Annex.
 *
 * The main memory is Tiny Speck's own street: the archive kept one instantiated copy of
 * the main template LNVIH6NU3M13MJJ as LNVV9IM8PL4301V (L XML `instance_of`), imported as
 * GNVV9IM8PL4301V with its geometry, decos and 44 event scripts. game.js holds that street
 * as the private instance; location-events runs its scripts and the puzzles feature
 * rebuilds the 20 lost Collision-triggered Event Boxes and the Teleporter
 * (assets/content/puzzle-triggers.json), reporting each moment below as it fires.
 * The Annex (LNVIL1E14M13K5I) was not archived and stays a drawn scene.
 */
export const SUMMERS_DAY_QUEST_ID = 'blue_and_white_part1';
export const SUMMERS_DAY_REPEAT_QUEST_ID = 'blue_and_white_part2';

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
/** The imported copy of the main template (LNVV9IM8PL4301V instance_of LNVIH6NU3M13MJJ). */
export const SUMMERS_DAY_STREET_TSID = 'GNVV9IM8PL4301V';
/** Its bounds (G XML l/t): source x, y to the street's screen space. */
export const SUMMERS_DAY_STREET_BOUNDS = Object.freeze({ l: -1000, t: -1000 });
/** onStarted: questInstanceLocation(pc, 'blue_and_white', 3709, -258, 5*60). */
export const SUMMERS_DAY_SOURCE_SPAWN = Object.freeze({ x: 3709, y: -258 });
export const SUMMERS_DAY_BONUS_SPAWN = Object.freeze({ x: 380, y: -70 });

/**
 * The street's moments, in the order its geometry plays them (east to west from the
 * spawn). Each is one recovered event: bird = flitterbug flutter_wings / owl2_off /
 * owl3_off / owl4_off, stone = button_down / button2_down, water = set_phys, orb =
 * ball_3, ball_1, ball_2, ball_4 (the pulseDot chain), dot = dot_1-3, exit = the
 * archived blue_and_white_go_bonus box above the ladder. stone_2 comes before dot_1:
 * the first dot hangs off the boulder the second stone raises.
 */
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
  'stone_2',
  'dot_1',
  'dot_2',
  'dot_3',
  'bird_4',
  'exit',
]);

/**
 * Where the QA autoplay (&summerautoplay) stands for each moment, in source x, y (feet):
 * inside the matching rebuilt box of puzzle-triggers.json (tests/summers-day.test.js
 * checks each one). `reset` points are the reset_phys boxes on the way out of the water.
 */
export const SUMMERS_DAY_ROUTE = Object.freeze([
  Object.freeze({ id: 'bird_1', x: 2902, y: -370 }),
  Object.freeze({ id: 'stone_1', x: 2393, y: -150 }),
  Object.freeze({ id: 'bird_2', x: 2038, y: -424 }),
  Object.freeze({ id: 'water', x: 1500, y: -200 }),
  Object.freeze({ id: 'orb_1', x: 1379, y: -360 }),
  Object.freeze({ id: 'orb_2', x: 1436, y: -612 }),
  Object.freeze({ id: 'orb_3', x: 1747, y: -655 }),
  Object.freeze({ id: 'orb_4', x: 1621, y: -696 }),
  Object.freeze({ id: 'reset', x: 940, y: -295 }),
  Object.freeze({ id: 'bird_3', x: 921, y: -300 }),
  Object.freeze({ id: 'stone_2', x: 69, y: -212 }),
  Object.freeze({ id: 'dot_1', x: 106, y: -506 }),
  Object.freeze({ id: 'dot_2', x: -123, y: -559 }),
  Object.freeze({ id: 'dot_3', x: -376, y: -563 }),
  Object.freeze({ id: 'bird_4', x: -831, y: -400 }),
  Object.freeze({ id: 'exit', x: -925, y: -910 }),
]);

/**
 * The Annex (LNVIL1E14M13K5I) was not archived; the recording shows a pale blue shaft of
 * small white shelves, eight pale pulse dots and a ladder overhead. The shelves are ours,
 * spaced for the remake's own jump in the Annex (normal physics: 105 px rise, 198 px running
 * jump, measured): each rises SUMMERS_DAY_ANNEX_RISE (89 px, 16 px under the reach) and
 * overlaps the one below across the middle, so a jump from that overlap lands on it. Left
 * and right shelves alternate up the shaft from the floor to the top shelf under the ladder.
 */
export const SUMMERS_DAY_ANNEX_JUMP_REACH = 105;
export const SUMMERS_DAY_ANNEX_RISE = 89;
export const SUMMERS_DAY_ANNEX_FLOOR = Object.freeze({ x1: 110, y1: 1430, x2: 1170, y2: 1430 });
export const SUMMERS_DAY_ANNEX_TOP = Object.freeze({ x1: 360, y1: 185, x2: 880, y2: 185 });
export const SUMMERS_DAY_ANNEX_SHELVES = Object.freeze([
  SUMMERS_DAY_ANNEX_FLOOR,
  ...Array.from({ length: 13 }, (_, i) => {
    const y = SUMMERS_DAY_ANNEX_FLOOR.y1 - SUMMERS_DAY_ANNEX_RISE * (i + 1);
    return Object.freeze(i % 2 === 0
      ? { x1: 240, y1: y, x2: 640, y2: y }
      : { x1: 540, y1: y, x2: 1040, y2: y });
  }),
  SUMMERS_DAY_ANNEX_TOP,
]);
/** The eight dots, each 40 px over a shelf's outer end: walked into, a short detour each. */
export const SUMMERS_DAY_ANNEX_DOTS = Object.freeze(
  [1, 2, 4, 5, 7, 8, 10, 11].map((k) => {
    const shelf = SUMMERS_DAY_ANNEX_SHELVES[k];
    return Object.freeze({ x: shelf.x1 === 240 ? 290 : 990, y: shelf.y1 - 40 });
  })
);
/** The ladder exit stands on the top shelf (anchored at its foot). */
export const SUMMERS_DAY_ANNEX_EXIT = Object.freeze({ x: 620, y: SUMMERS_DAY_ANNEX_TOP.y1 });

/** Source x, y to the imported street's screen space. */
export function summersDayStreetPoint(point) {
  return {
    x: (Number(point?.x) || 0) - SUMMERS_DAY_STREET_BOUNDS.l,
    y: (Number(point?.y) || 0) - SUMMERS_DAY_STREET_BOUNDS.t,
  };
}

/**
 * The four flitterbug lines. The street prints them itself: they are the sign_txt of its
 * firebog_sign_blank decos (G XML 1335378517202, 1335378517218, 1335478834099,
 * 1335491308265), which the recording shows word for word; the HUD's guide data uses these.
 */
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

/**
 * A moment the street fired. Any order counts (the street had no checkpoint order of its
 * own: each event only gates on its own flag), each once; `exit` (the go_bonus box) ends
 * the main memory whatever else was reached, as the box's callback did.
 */
export function advanceSummersDayCheckpoint(run, checkpoint, now = Date.now()) {
  if (!run || run.stage !== 'main') return { ok: false, reason: 'wrong_stage', run };
  if (summersDayRemainingMs(run, now) <= 0) {
    expireSummersDay(run, null, now);
    return { ok: false, reason: 'expired', run };
  }
  if (!SUMMERS_DAY_CHECKPOINTS.includes(checkpoint)) {
    return { ok: false, reason: 'unknown', run };
  }
  if (run.checkpoints.includes(checkpoint)) {
    return { ok: false, reason: 'already_complete', run };
  }
  run.checkpoints.push(checkpoint);
  return {
    ok: true,
    reason: checkpoint === 'exit' ? 'main_complete' : 'advanced',
    checkpoint,
    next: summersDayNextCheckpoint(run),
    run,
  };
}

/** The first moment of the street's order not reached yet (null when all are). */
export function summersDayNextCheckpoint(run) {
  const done = new Set(run?.checkpoints || []);
  return SUMMERS_DAY_CHECKPOINTS.find((id) => !done.has(id)) || null;
}

export function enterSummersDayBonus(run, now = Date.now()) {
  if (!run || run.stage !== 'main') return { ok: false, reason: 'wrong_stage', run };
  if (!run.checkpoints.includes('exit')) return { ok: false, reason: 'main_incomplete', run };
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
  const next = summersDayNextCheckpoint(run);
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
    stone_2: 'Press the second stone',
    dot_1: 'Touch the first pulse dot',
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
