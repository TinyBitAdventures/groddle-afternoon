/**
 * De-Embiggenify's transient miniature-room quest.
 *
 * Contract sources:
 * - quests/de_embiggenify.js
 * - quests/de_embiggenify_part2.js
 * - items/npc_dustbunny.js
 * - items/small_worthless.js
 * - items/emotional_bear.js
 */

export const DE_EMBIGGENIFY_QUEST_ID = 'de_embiggenify';
export const DE_EMBIGGENIFY_PART2_QUEST_ID = 'de_embiggenify_part2';
export const EESTI_STREET_ID = 'INSTANCE_EESTI_PAGE_17';
export const EESTI_PRODUCTION_TSID = 'LIF10RQLPLBYV7';
export const EESTI_SOURCE_SPAWN = Object.freeze({ x: -1832, y: -76 });
export const EESTI_DURATION_MS = 2 * 60 * 1000;
export const SMALL_WORTHLESS_ID = 'small_worthless';
export const EMOTIONAL_BEAR_ID = 'emotional_bear';
export const EESTI_PLAYER_SCALE = 0.42;
export const EESTI_MUSIC_FILE = 'assets/audio/ambient/eesti_life_catalogue_1344997859.mp3';
export const EESTI_ROOM_ROUTE = Object.freeze([
  'sofa-and-sleepy-cat',
  'end-table-lamp',
  'ornate-chair',
  'curved-table',
  'cake',
]);
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
