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
 * The Annex (LNVIL1E14M13K5I) was not archived. Two recordings show the same room:
 * 306_7Jvz8RQ (Cimm, 1:16-1:31) and cYKdfvrVsmM (Lily Linguistic, 3:08-3:25). A pale white
 * surround holds a sky-blue cavity about two screens tall: a wide grassy bowl at the bottom
 * (a short ladder stub stuck in the floor at left, a log railing at right that the player
 * stands on: cYK 3:09), straight walls, and a pitched roof (306 1:28-1:31, cYK 3:25). Up the
 * middle runs a three-column lattice of short white shelves, a left and right pair, then one
 * centre shelf, three times over; the last centre shelf holds the exit ladder at top centre,
 * rising into the roof (306 1:21-1:31). Arriving, only the bowl shows, with one bubble hanging
 * over it on a short string; touching it reveals the climb (306 1:17-1:19, cYK 3:08-3:09), and it
 * pays nothing. The Glitch Tribute Blog's post on the room (johnexploresur.tumblr.com, post
 * 37303553830, "annex of a summer's dream. the reward room.") shows the same veiled bowl and
 * says "you'd hit a switch to get the loot inside".
 *
 * Measured on 306_7Jvz8RQ (1278 x 720) and scaled by SUMMERS_DAY_ANNEX_SCALE so its rows,
 * 114.6 px apart on average (1:21: 683, 570, 450, 338, 218, 110), rise 88 px: 17 px under
 * the remake's measured 105 px jump (normal physics). One scale for x and y keeps the room's
 * shape; the cavity then fills about two thirds of the 960-1000 px view, as it fills two
 * thirds of the recorded window. Screen space, y down: the bowl's floor is at y 1000.
 */
export const SUMMERS_DAY_ANNEX_JUMP_REACH = 105;
export const SUMMERS_DAY_ANNEX_RISE = 88;
export const SUMMERS_DAY_ANNEX_SCALE = 0.768;
export const SUMMERS_DAY_ANNEX_W = 1280;
export const SUMMERS_DAY_ANNEX_H = 1150;
/** The middle column (the centre shelves and the ladder). */
export const SUMMERS_DAY_ANNEX_CX = 640;
/** The cavity's straight walls (306 1:21: x 228 and 1085 about the centre shelf's 641). */
export const SUMMERS_DAY_ANNEX_WALLS = Object.freeze({ left: 310, right: 970 });
export const SUMMERS_DAY_ANNEX_FLOOR_Y = 1000;
/** wall_shelf1 at the main memory's own 109 px (306: 132 px wide, 101 scaled). */
export const SUMMERS_DAY_ANNEX_SHELF_W = 108;
/**
 * The rows, bottom up: P pairs, C centre shelves. The lowest pair stands 235 recorded px
 * (180) over the bowl's floor (306 1:19: floor 625, pair 390). The pairs' centres sit 197 px
 * either side of the centre (306 1:21-1:24), the lowest pair a little wider (213 and 227).
 */
const ROW_Y = (k) => SUMMERS_DAY_ANNEX_FLOOR_Y - 180 - SUMMERS_DAY_ANNEX_RISE * k;
const shelf = (id, cx, y) => Object.freeze({
  id,
  x1: cx - SUMMERS_DAY_ANNEX_SHELF_W / 2,
  y1: y,
  x2: cx + SUMMERS_DAY_ANNEX_SHELF_W / 2,
  y2: y,
  // A shelf is jumped up through and stood on (platform_pc_perm -1).
  pc_perm: -1,
});
const CX = SUMMERS_DAY_ANNEX_CX;
export const SUMMERS_DAY_ANNEX_SHELVES = Object.freeze([
  shelf('pair1_left', CX - 170, ROW_Y(0)),
  shelf('pair1_right', CX + 170, ROW_Y(0)),
  shelf('centre1', CX, ROW_Y(1)),
  shelf('pair2_left', CX - 152, ROW_Y(2)),
  shelf('pair2_right', CX + 152, ROW_Y(2)),
  shelf('centre2', CX, ROW_Y(3)),
  shelf('pair3_left', CX - 152, ROW_Y(4)),
  shelf('pair3_right', CX + 152, ROW_Y(4)),
  shelf('centre_top', CX, ROW_Y(5)),
]);
export const SUMMERS_DAY_ANNEX_TOP_SHELF = SUMMERS_DAY_ANNEX_SHELVES.at(-1);
/**
 * The bowl (306 1:19, about the lowest pair: the walls end 60 px under it, the floor runs
 * flat from 221 px left of the centre shelf to 249 right, 230 px under it), walked from
 * wall to wall. The railing's top bar (306 1:17: x 697-890, 37 px over the floor) is
 * stood on (cYK 3:09).
 */
const F = SUMMERS_DAY_ANNEX_FLOOR_Y;
export const SUMMERS_DAY_ANNEX_BOWL = Object.freeze([
  [310, 866], [400, 930], [470, 978], [500, F], [820, F], [880, 975], [935, 935], [970, 890],
].map(([x, y]) => Object.freeze({ x, y })));
export const SUMMERS_DAY_ANNEX_RAILING = Object.freeze({ id: 'railing', x1: 683, y1: F - 28, x2: 831, y2: F - 28, pc_perm: -1 });
/**
 * The roof: the walls stop 117 px over the ladder's shelf (306 1:31: 492 to 375), the
 * slopes reach the flat of the ridge 158 px either side of the ladder, 216 px over its shelf,
 * and the ridge peaks over the ladder (cYK 3:25: shelf 268, corners 115, ridge 105, x 1.84).
 */
const TOP = ROW_Y(5);
export const SUMMERS_DAY_ANNEX_ROOF = Object.freeze([
  [310, TOP - 96], [482, TOP - 216], [CX, TOP - 232], [798, TOP - 216], [970, TOP - 96],
].map(([x, y]) => Object.freeze({ x, y })));
/**
 * The exit: firebog_ladder (the main memory's own exit ladder) stands on the top centre
 * shelf and climbs into the roof (306 1:28: 322 px, 78 px wide). Climbing it to the last
 * SUMMERS_DAY_ANNEX_EXIT_CLIMB px of its top leaves the memory, as the player does at
 * cYK 3:25 before Polenta Qado loads.
 */
export const SUMMERS_DAY_ANNEX_LADDER = Object.freeze({ id: 'annex_ladder', x: CX, y: TOP, h: 245, w: 60 });
export const SUMMERS_DAY_ANNEX_EXIT_CLIMB = 70;
export const SUMMERS_DAY_ANNEX_EXIT = Object.freeze({ x: CX, y: TOP });
/** Where the memory sets you down: on the bowl's floor left of centre (306 1:17, cYK 3:08). */
export const SUMMERS_DAY_ANNEX_SPAWN = Object.freeze({ x: 580, y: F });
/**
 * Until the reveal bubble is touched the room above the bowl's grassy rim is veiled
 * (306 1:17-1:18: the rim 15-70 px under the lowest pair, pale above it).
 */
export const SUMMERS_DAY_ANNEX_VEIL_Y = ROW_Y(0) + 30;
/** The switch: over the bowl's middle, 67 px under the lowest pair (306 1:17; the blog's panorama). */
export const SUMMERS_DAY_ANNEX_REVEAL = Object.freeze({ x: 653, y: ROW_Y(0) + 51 });

/**
 * The pickups: one quoin over every pair shelf and the lowest centre shelf, none over the
 * middle centre shelf (306 1:21-1:24), seven in all. Both recordings pay them in the same
 * places: the lower left one currants, the middle right one mood, the rest iMG. Amounts are
 * 306_7Jvz8RQ's (Cimm: iMG 9,882 to 9,912, currants 12,493 to 12,544, mood 510 to 515);
 * Lily's higher-level run pays +120 iMG, +100 currants and +100 mood in the same places,
 * with one +1098 iMG roll (cYK 3:12-3:25).
 */
export const SUMMERS_DAY_ANNEX_PICKUP_RISE = 42;
const pickup = (shelfId, type, amount, source) => {
  const s = SUMMERS_DAY_ANNEX_SHELVES.find((row) => row.id === shelfId);
  return Object.freeze({ shelf: shelfId, type, amount, x: (s.x1 + s.x2) / 2, y: s.y1 - SUMMERS_DAY_ANNEX_PICKUP_RISE, source });
};
export const SUMMERS_DAY_ANNEX_PICKUPS = Object.freeze([
  pickup('pair1_left', 'currants', 51, '306 1:22-1:24 +51 currants; cYK 3:14 +100 currants'),
  pickup('pair1_right', 'xp', 6, '306 1:21 +6 iMG; cYK 3:12 +120 iMG'),
  pickup('centre1', 'xp', 6, '306 1:22 +6 iMG; cYK 3:13-3:14 +120 iMG'),
  pickup('pair2_left', 'xp', 6, '306 1:24-1:25 +6 iMG; cYK 3:17 +120 iMG'),
  pickup('pair2_right', 'mood', 5, '306 1:26-1:27 +5 mood; cYK 3:18-3:19 +100 mood'),
  pickup('pair3_left', 'xp', 6, '306 1:25-1:26 +6 iMG; cYK 3:22-3:23 +120 iMG'),
  pickup('pair3_right', 'xp', 6, '306 1:27 +6 iMG; cYK 3:20-3:21 +1098 iMG'),
]);
export const SUMMERS_DAY_BONUS_DOT_COUNT = SUMMERS_DAY_ANNEX_PICKUPS.length;
export const SUMMERS_DAY_BONUS_DOT_IMG = 6;
/** Back-compat name for the pickups' spots. */
export const SUMMERS_DAY_ANNEX_DOTS = SUMMERS_DAY_ANNEX_PICKUPS;

/**
 * The Annex as street data in screen space (bounds t 0, so world and screen agree): the
 * game draws and walks it, and the level builder's reach graph (js/builder/reach-graph.js)
 * checks it in tests/summers-day.test.js. The roof is a ceiling (pc_perm 1), the walls are
 * solid both ways, the ladder is the exit.
 */
export function summersDayAnnexStreet() {
  const bowl = SUMMERS_DAY_ANNEX_BOWL;
  const roof = SUMMERS_DAY_ANNEX_ROOF;
  const platforms = [
    ...bowl.slice(1).map((b, i) => ({ id: `bowl_${i + 1}`, x1: bowl[i].x, y1: bowl[i].y, x2: b.x, y2: b.y, pc_perm: -1 })),
    { ...SUMMERS_DAY_ANNEX_RAILING },
    // Behind the walls, so the world's floor is no seam to walk round them (never reached).
    { id: 'outside_left', x1: 0, y1: F, x2: SUMMERS_DAY_ANNEX_WALLS.left - 8, y2: F, pc_perm: -1 },
    { id: 'outside_right', x1: SUMMERS_DAY_ANNEX_WALLS.right + 8, y1: F, x2: SUMMERS_DAY_ANNEX_W, y2: F, pc_perm: -1 },
    ...SUMMERS_DAY_ANNEX_SHELVES.map((s) => ({ ...s })),
    ...roof.slice(1).map((r, i) => ({ id: `roof_${i + 1}`, x1: roof[i].x, y1: roof[i].y, x2: r.x, y2: r.y, pc_perm: 1 })),
  ];
  const { left, right } = SUMMERS_DAY_ANNEX_WALLS;
  return {
    tsid: SUMMERS_DAY_BONUS_ID,
    label: 'Annex of A Summer’s Day',
    bounds: { l: 0, r: SUMMERS_DAY_ANNEX_W, t: 0, b: SUMMERS_DAY_ANNEX_H },
    platforms,
    barriers: [
      { id: 'wall_left', x: left, y: 0, h: SUMMERS_DAY_ANNEX_H, pc_perm: null },
      { id: 'wall_right', x: right, y: 0, h: SUMMERS_DAY_ANNEX_H, pc_perm: null },
    ],
    ladders: [{ ...SUMMERS_DAY_ANNEX_LADDER }],
    walls: [],
    signposts: [],
    layers: [],
  };
}

/** True when the avatar's feet are on the exit ladder's last stretch (leaving the memory). */
export function summersDayAnnexAtExit(point) {
  const l = SUMMERS_DAY_ANNEX_LADDER;
  const x = Number(point?.x);
  const y = Number(point?.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
  return Math.abs(x - l.x) <= 30 && y <= l.y - l.h + SUMMERS_DAY_ANNEX_EXIT_CLIMB && y >= l.y - l.h - 40;
}

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
  if (!(i >= 0 && i < total)) return { ok: false, reason: 'invalid_quoin', run };
  if (run.bonusCollected.includes(i)) return { ok: false, reason: 'already_collected', run };
  run.bonusCollected.push(i);
  run.bonusCollected.sort((a, b) => a - b);
  // Each pickup pays its recorded kind (SUMMERS_DAY_ANNEX_PICKUPS); iMG adds to bonusImgEarned.
  const pick = SUMMERS_DAY_ANNEX_PICKUPS[i] || { type: 'xp', amount: SUMMERS_DAY_BONUS_DOT_IMG };
  if (pick.type === 'xp') {
    run.bonusImgEarned = Math.max(0, Number(run.bonusImgEarned) || 0) + pick.amount;
  }
  return {
    ok: true,
    reason: 'collected',
    index: i,
    type: pick.type,
    amount: pick.amount,
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
