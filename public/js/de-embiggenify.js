/**
 * De-Embiggenify's transient miniature-room quest.
 *
 * Contract sources:
 * - quests/de_embiggenify.js
 * - quests/de_embiggenify_part2.js
 * - items/npc_dustbunny.js
 * - items/small_worthless.js
 * - items/emotional_bear.js
 * - locations/location.js 1194-1210 (the myles_is_great box)
 *
 * The room is Tiny Speck's own street. onStarted creates the 'eesti' instance of the
 * production template LIF10RQLPLBYV7 at -1832, -76; the archive kept three such
 * instances (L XML instance_of LIF10RQLPLBYV7, instance_id eesti), byte-identical
 * apart from their headers, each carrying the template's geometry under its inner
 * tsid GIF10RQLPLBYV7. The newest, GHFBQQ4N68733LB (2012-08-19), is the one game.js
 * holds as the private instance: its 23 platforms, 5 walls, 80 k04 decos, the
 * DE_EMBIGGENIFY music and the myles_is_great box. (GIFB19E1FUM1LH9 is a March 2011
 * copy: one platform short, no music_file, no instance_of.) The street has no event
 * scripts; the puzzles feature runs the box (assets/content/puzzle-triggers.json).
 */

export const DE_EMBIGGENIFY_QUEST_ID = 'de_embiggenify';
export const DE_EMBIGGENIFY_PART2_QUEST_ID = 'de_embiggenify_part2';
/** The imported instance of the template (LHFBQQ4N68733LB instance_of LIF10RQLPLBYV7). */
export const EESTI_STREET_ID = 'GHFBQQ4N68733LB';
/** The private instance's name (onStarted instance_id 'eesti'), for the puzzles feature. */
export const EESTI_INSTANCE = 'de-embiggenify';
export const EESTI_PRODUCTION_TSID = 'LIF10RQLPLBYV7';
/** Its bounds (G XML l/t): source x, y to the street's screen space. */
export const EESTI_STREET_BOUNDS = Object.freeze({ l: -2000, t: -1000 });
export const EESTI_SOURCE_SPAWN = Object.freeze({ x: -1832, y: -76 });
export const EESTI_DURATION_MS = 2 * 60 * 1000;
export const SMALL_WORTHLESS_ID = 'small_worthless';
export const EMOTIONAL_BEAR_ID = 'emotional_bear';
export const EESTI_PLAYER_SCALE = 0.42;
export const EESTI_MUSIC_FILE = 'assets/audio/ambient/eesti_life_catalogue_1344997859.mp3';
/**
 * The archived box (G XML GHFBQQ4N68733LB boxes/box_1, source bottom-centre x, y and
 * w, h): it sits on the tabletop (_pl1257983927390, y -449) just left of the cake
 * (k04_cake_01, middleplus, x 1790-1915). location.js creates the small shiny object
 * when the avatar enters it during part two.
 */
export const EESTI_FIND_BOX = Object.freeze({ id: 'myles_is_great', x: 1750, y: -450, w: 150, h: 150 });
/**
 * Mr. Hairball (the instance's Dust Bunny, IHFBQS4N68733MP) lost his position with the
 * items. Ours, source x, y: on the floor just right of the ornate chair's front leg and
 * under the long table's left curl, where the runthrough (nloqeMjT-bQ, 0:24) shows him,
 * feet on the street's item line pl1267165485151 (pc_perm 0, item_perm -1, y -65).
 */
export const EESTI_HAIRBALL_SPOT = Object.freeze({ x: 660, y: -65 });
/**
 * The small shiny object went straight into the pack (createItemFromGround); the remake
 * shows it, with a glint, while you search. Ours: on the tabletop inside the archived box,
 * its right half behind the cake's left edge.
 */
export const EESTI_SHINY_SPOT = Object.freeze({ x: 1810, y: -449 });
/**
 * Where the QA autoplay (&eestiautoplay) stands, source x, y (feet): beside Mr. Hairball on
 * the floor in front of his item line (_pl1267160071287), on the tabletop short of the box
 * (`search` waits there), and inside the archived box (tests/de-embiggenify.test.js).
 */
export const EESTI_AUTOPLAY_POINTS = Object.freeze({
  hairball: Object.freeze({ x: 605, y: -40 }),
  search: Object.freeze({ x: 1600, y: -449 }),
  find: Object.freeze({ x: 1760, y: -449 }),
});
/**
 * The room's landmarks left to right as you walk it (the runthrough's order), each the
 * street's own deco: layer and sprite in GHFBQQ4N68733LB.json. Parallax layers are
 * placed where their deco crosses the middle of the view.
 */
export const EESTI_LANDMARKS = Object.freeze([
  Object.freeze({ id: 'sofa-and-sleepy-cat', decos: Object.freeze([['middleground', 'k04_sleepycat_01'], ['bg_2', 'k04_sofa_01']]) }),
  Object.freeze({ id: 'end-table-lamp', decos: Object.freeze([['bg_2', 'k04_table_02'], ['bg_2', 'k04_lamp_04']]) }),
  Object.freeze({ id: 'ornate-chair', decos: Object.freeze([['middleground', 'k04_chair_02']]) }),
  Object.freeze({ id: 'kitty-frames', decos: Object.freeze([['sky', 'k04_pictureframe_01_kitty'], ['sky', 'k04_pictureframe_02_kitty'], ['sky', 'k04_pictureframe_03_kitty']]) }),
  Object.freeze({ id: 'long-table', decos: Object.freeze([['middleground', 'k04_table_03_back'], ['middleplus', 'k04_table_03_front']]) }),
  Object.freeze({ id: 'cake', decos: Object.freeze([['middleplus', 'k04_cake_01']]) }),
]);
export const EESTI_ROOM_ROUTE = Object.freeze(EESTI_LANDMARKS.map((row) => row.id));

/** Source x, y to the imported street's screen space. */
export function eestiStreetPoint(point) {
  return {
    x: (Number(point?.x) || 0) - EESTI_STREET_BOUNDS.l,
    y: (Number(point?.y) || 0) - EESTI_STREET_BOUNDS.t,
  };
}

export const EESTI_REWARD = Object.freeze({
  xp: 200,
  currants: 200,
  mood: 50,
  item: EMOTIONAL_BEAR_ID,
  itemCount: 1,
});

export const MR_HAIRBALL_GREETING = Object.freeze([
  {
    text: "You found me! You wouldn't believe how many times people mistake me for a common ball of hair.",
    response: 'Not me. You have a lot of presence for a hairball.',
  },
  {
    text: 'Thanks, buddy.',
    response: '',
  },
]);

export const MR_HAIRBALL_REQUEST = Object.freeze([
  {
    text: "Now here's the thing. There's a small shiny object with no intrinsic value somewhere in this room.",
    response: 'Ooh, cool!',
  },
  {
    text: "I know. I'd get it myself, but I'm kind of lacking in the appendage department, if you know what I mean. Find it and bring it back to me, will you?",
    response: 'OK!',
  },
  {
    text: "(And here's a hint: have a look behind the cake!)",
    response: '',
  },
]);

export const MR_HAIRBALL_COMPLETION = Object.freeze([
  {
    text: 'Thanks, buddy. I knew I could count on you. And just to show that even a hairball can have the heart of a king, I want you to have a little thank-you gift.',
    response: "Aw, that's nice.",
  },
  {
    text: 'This emotional bear will come in handy later in the game. Use it on its own, or upgrade it with some optional accessories and start spreading some cheer.',
    response: '',
  },
]);

export function createDeEmbiggenifyState(opts = {}) {
  const enteredAt = Number(opts.enteredAt) || Date.now();
  return {
    status: 'arrival',
    sourceLocation: opts.sourceLocation ? { ...opts.sourceLocation } : null,
    enteredAt,
    deadlineAt: enteredAt + EESTI_DURATION_MS,
    foundAt: 0,
    completedAt: 0,
  };
}

export function beginDeEmbiggenifySearch(state, now = Date.now()) {
  if (!state) return { ok: false, reason: 'missing_state' };
  if (state.status !== 'arrival') return { ok: false, reason: 'already_started' };
  const startedAt = Number(now) || Date.now();
  state.status = 'searching';
  state.deadlineAt = startedAt + EESTI_DURATION_MS;
  return { ok: true, deadlineAt: state.deadlineAt };
}

export function findSmallWorthless(state, now = Date.now()) {
  if (!state) return { ok: false, reason: 'missing_state' };
  if (state.status === 'found') return { ok: false, reason: 'already_found' };
  if (state.status !== 'searching') return { ok: false, reason: 'not_searching' };
  if (eestiRemainingMs(state, now) <= 0) {
    expireDeEmbiggenify(state, now);
    return { ok: false, reason: 'expired' };
  }
  state.status = 'found';
  state.foundAt = Number(now) || Date.now();
  return { ok: true, item: SMALL_WORTHLESS_ID };
}

export function completeDeEmbiggenify(state, now = Date.now()) {
  if (!state) return { ok: false, reason: 'missing_state', reward: null };
  if (state.status === 'complete') {
    return { ok: false, reason: 'already_complete', reward: null };
  }
  if (state.status !== 'found') {
    return { ok: false, reason: 'object_missing', reward: null };
  }
  state.status = 'complete';
  state.completedAt = Number(now) || Date.now();
  return { ok: true, reward: { ...EESTI_REWARD } };
}

export function expireDeEmbiggenify(state, now = Date.now()) {
  if (!state || ['complete', 'expired'].includes(state.status)) return false;
  state.status = 'expired';
  state.expiredAt = Number(now) || Date.now();
  return true;
}

export function eestiRemainingMs(state, now = Date.now()) {
  if (!state || ['complete', 'expired'].includes(state.status)) return 0;
  return Math.max(0, state.deadlineAt - Number(now));
}

export function deEmbiggenifyObjective(state) {
  if (!state) return 'Enter Eesti Life Catalogue Page 17';
  if (state.status === 'arrival') return 'Find and speak with Mr. Hairball';
  if (state.status === 'searching') return 'Look behind the cake for the small shiny object';
  if (state.status === 'found') return 'Bring the shiny object back to Mr. Hairball';
  if (state.status === 'complete') return 'De-Embiggenification complete';
  return 'The catalogue page closed';
}
