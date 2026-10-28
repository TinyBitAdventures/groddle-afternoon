/**
 * World crabs (register G154): Tiny Speck's npc_crab, the DJ critic of Ur.
 *
 * Source: glitch-GameServerJS items/npc_crab.js (verbs hug / flatter / pinch /
 * insult, onPlayerCollision, onConversation, blockListenCallback,
 * blockPlayCallback, the day-keyed flatterers / huggers / played / ignored
 * maps, setHitBox, npc_walkable roam), achievements/make_a_crab_happy.js,
 * items/crabato_juice.js + catalog_buffs.js crab_state_of_mind, and
 * items/crabphones.js.
 *
 * Placement: the archived location objects (streets/mnt/stos/location_data,
 * L-prefixed 2012-12 snapshot) hold one "Crab" objref on nine locations.
 * Eight are ordinary streets (CRAB_STREETS). The ninth, LNV1T7PCUM53T25
 * (Institute of Ocular Testing), is the archived copy of a Vision Quest
 * instance, whose createRandomItem happened to pick npc_crab as the object to
 * identify; js/quest-rooms/vision-quest.js already draws it, so it is not a
 * world crab. The dump keeps no item coordinates, so the shared street
 * placement planner picks the spot.
 *
 * Everything here is pure (no Pixi, no DOM): features/crabs-feature.js draws
 * the crab, runs its conversation and applies these results.
 */

import { MUSICBLOCK_CATALOG } from './musicblocks.js?v=g403-1';

export const CRAB_CLASS = 'npc_crab';
export const CRAB_FEATURE_ID = 'crabs';
export const CRAB_PLACEMENT_KEY = 'crabs';
export const CRABATO_JUICE = 'crabato_juice';
export const CRABPHONES = 'crabphones';
export const CRAB_STATE_OF_MIND = 'crab_state_of_mind';
export const MAKE_A_CRAB_HAPPY = 'make_a_crab_happy';

/** One crab on each, from the archived location objects (G geometry, L objects). */
export const CRAB_STREETS = Object.freeze([
  Object.freeze({ tsid: 'GCR131F8U1K1PF9', sourceTsid: 'LCR131F8U1K1PF9', label: 'Uplands Verge', hub: 'Groddle Heights' }),
  Object.freeze({ tsid: 'GLICFILAMTI11QV', sourceTsid: 'LLICFILAMTI11QV', label: "Scribe's Weald", hub: 'Groddle Forest' }),
  Object.freeze({ tsid: 'GIF101NCNU112O2', sourceTsid: 'LIF101NCNU112O2', label: 'Oktyabrya', hub: 'Groddle Forest' }),
  Object.freeze({ tsid: 'GLI14TT8T921J21', sourceTsid: 'LLI14TT8T921J21', label: 'Karpal Tunnel', hub: 'Ilmenskie Caverns' }),
  Object.freeze({ tsid: 'GLI2V0UN7RD1T2J', sourceTsid: 'LLI2V0UN7RD1T2J', label: 'Hechey Track', hub: 'Groddle Forest' }),
  Object.freeze({ tsid: 'GM416LNIKVLM1', sourceTsid: 'LM416LNIKVLM1', label: 'Baby Steppes', hub: 'Ix' }),
  Object.freeze({ tsid: 'GUV174V0QUB3JT4', sourceTsid: 'LUV174V0QUB3JT4', label: 'Ambu Jal', hub: 'Firozi' }),
  Object.freeze({ tsid: 'GUVNNQQ9AOJ253J', sourceTsid: 'LUVNNQQ9AOJ253J', label: 'Venkate Kate', hub: 'Firozi' }),
]);

/** The ninth archived crab: a Vision Quest instance object, not a street crab. */
export const CRAB_INSTANCE_ONLY = Object.freeze({ tsid: 'GNV1T7PCUM53T25', sourceTsid: 'LNV1T7PCUM53T25', label: 'Institute of Ocular Testing' });

function aliases(tsid) {
  const id = String(tsid || '');
  const out = [id];
  if (id.startsWith('G')) out.push(`L${id.slice(1)}`);
  if (id.startsWith('L')) out.push(`G${id.slice(1)}`);
  return out;
}

/** How many world crabs a street holds (G/L alias aware). */
export function crabCountFor(tsid) {
  const ids = new Set(aliases(tsid));
  return CRAB_STREETS.filter((row) => ids.has(row.tsid) || ids.has(row.sourceTsid)).length;
}

/** Planner group for the shared street placement (features placementGroups hook). */
export function crabPlacementGroups(tsid) {
  const count = crabCountFor(tsid);
  return count ? [{ key: CRAB_PLACEMENT_KEY, count, clearance: 120 }] : [];
}

// —— Numbers ————————————————————————————————————————————————————————————

/** blockListenCallback: "number of normal music blocks as of October 2011". */
export const CRAB_MAX_BLOCKS = 25;
/** setHitBox: apiSetHitBox(500, 200); onPlayerCollision runs inside it. */
export const CRAB_HITBOX = Object.freeze({ w: 500, h: 200 });
/** onPlayerCollision: apiSetTimer('timeoutRequest', 30000). */
export const CRAB_OFFER_TIMEOUT_MS = 30_000;
/** onConversation: events_add(blockListenCallback, 4). */
export const CRAB_LISTEN_SEC = 4;
/** blockPlayCallback: sendBubble(reply, 4000) and apiSetTimer('startMoving', 3000). */
export const CRAB_REPLY_MS = 4000;
export const CRAB_RESUME_MS = 3000;
/** blockPlayCallback: with Crab State of Mind a disliked tune costs 20 mood. */
export const CRAB_STATE_MOOD_LOSS = 20;
/** npc_walkable: walk speed randInt(50, 55); roam distances; waits. */
export const CRAB_WALK = Object.freeze({
  speedMin: 50,
  speedMax: 55,
  left: Object.freeze([-400, -250]),
  right: Object.freeze([250, 400]),
  edge: 100,
  arriveWaitMs: 10_000,
  stuckWaitMs: 1000,
  menuWaitMs: 1500,
});

// —— Copy (items/npc_crab.js) ————————————————————————————————————————————

export const CRAB_COPY = Object.freeze({
  label: 'Crab',
  description:
    'Anyone knows music makes crabs happy, but it takes an expert DJ to satiate both the appetite for variety and yen for classic tunes it desires. The tunesmith who can play a full array of Music Blocks, culminating with a cherished favorite, will be richly rewarded.',
  offer: 'Hey! Hey! {pc_label}! I want to listen to some tunes! What do you have for me?',
  playTune: 'Play a tune',
  neverMind: 'Never mind',
  pick: 'Which tune do you want to play for me?',
  notSure: 'Not sure what you mean there...',
  repeat: 'Damn! I just heard this one! Argh!!!',
  happy: "Wow! I haven't heard this in forever. Love it! Thank you - take this gift!",
  liked: 'Huh, yeah. This is not a bad little number. Here\'s something for you.',
  fresh: "Ooooh. I've never heard this one before. Here's a little something by way of appreciation.",
  hugTooltip: 'Better to butter it up first',
  hugRipe: 'This crab is ripe for a hug',
  hugOver: 'Over over-hugging',
  hug: 'Your firm but gentle embrace causes the crab to excrete a tin of its finest essence: Crabato Juice. All the goodness of crab, plus tomatoes!',
  hugPushy: "Now you're being pushy. It's making the crab uncomfortable. Perhaps you need a little space to think about what you've done.",
  hugUnflattered: 'Hey, hey, hey. Keep your claws to yourself. If you want to get friendly, try saying something friendly, why don\'t you.',
  flatterTooltip: 'Make the crab feel good',
  flatter: "You know how to talk to a crab. The crab can't give you a beckoning, come-hitherish kind of look. But it would if it could.",
  pinchTooltip: 'Caution: pinching into pincers',
  pinch: "The crab is hurt. It's not so much the pain of the pinching as the encroachment on the crab's job description. Lesson learned: Never pinch a pincher.",
  // verbs.insult tooltip is "Caution: this <i>is<\/i> a Crab"; the menu has no markup.
  insultTooltip: 'Caution: this is a Crab',
  insult: "Don't you know you can catch more crabs with honey than with vinegar? Crabs hate vinegar.",
});

/** Item catalog meta (items/crabato_juice.js, items/crabphones.js). */
export const CRAB_ITEMS = Object.freeze({
  [CRABATO_JUICE]: Object.freeze({
    label: 'Crabato Juice',
    namePlural: 'Crabato Juices',
    desc: 'Mmm... all the goodness of crab juice, plus tomatoes!',
    icon: 'assets/sprites/icons/crabato_juice.png',
    baseCost: 50,
    stackMax: 24,
    tags: ['drink'],
  }),
  [CRABPHONES]: Object.freeze({
    label: 'CrabPod Headphones',
    namePlural: 'CrabPod Headphones',
    desc: 'These appear to be the kind of headphones only a crab could love. The sound quality is fabulous, but they really pinch your earlobes.',
    icon: 'assets/sprites/icons/crabphones.png',
    baseCost: 0,
    stackMax: 1,
    tags: ['no_rube', 'crabphones', 'no_auction', 'no_trade'],
    sellable: false,
    donatable: false,
  }),
});

/** crabato_juice.js classProps drink_mood 20 (include/drink.js), then buffs_apply('crab_state_of_mind'). */
export const CRABATO_JUICE_USE = Object.freeze({
  kind: 'drink',
  verb: 'Drink',
  mood: 20,
  message: 'You drank a Crabato Juice.',
  source: 'items/crabato_juice.js verbs.drink (drink_mood 20) + catalog_buffs.js crab_state_of_mind (30 s)',
});

// —— Memory (per crab, saved on its street) ——————————————————————————————

function dayRow(row) {
  return row && typeof row === 'object' && row.day != null
    ? { day: String(row.day), n: Math.max(0, Math.floor(Number(row.n) || 0)) }
    : null;
}

/** A crab's saved state: blocks_played plus the day-keyed maps (one player). */
export function normalizeCrabMemory(seed = {}) {
  const blocksPlayed = {};
  for (const [id, ts] of Object.entries(seed?.blocksPlayed || {})) {
    const n = Number(ts);
    if (Number.isFinite(n) && n > 0) blocksPlayed[id] = n;
  }
  return {
    blocksPlayed,
    flattered: dayRow(seed?.flattered),
    hugged: dayRow(seed?.hugged),
    played: dayRow(seed?.played),
    ignored: dayRow(seed?.ignored),
  };
}

/** The count in a day-keyed map for today (a new day starts it over). */
function todayCount(memory, key, dayKey) {
  const row = memory[key];
  return row && row.day === String(dayKey) ? row.n : 0;
}

function bump(memory, key, dayKey) {
  const day = String(dayKey);
  if (!memory[key] || memory[key].day !== day) memory[key] = { day, n: 0 };
  memory[key].n += 1;
}

/** hasFlattered: flatterers[today][pc] != 0. */
export const hasFlatteredToday = (memory, dayKey) => todayCount(memory, 'flattered', dayKey) > 0;
/** canHugAgain: no hug yet today. */
export const canHugToday = (memory, dayKey) => todayCount(memory, 'hugged', dayKey) === 0;
export const hasPlayedToday = (memory, dayKey) => todayCount(memory, 'played', dayKey) > 0;
export const hasIgnoredToday = (memory, dayKey) => todayCount(memory, 'ignored', dayKey) > 0;
export const playToday = (memory, dayKey) => bump(memory, 'played', dayKey);
export const ignoreToday = (memory, dayKey) => bump(memory, 'ignored', dayKey);

/** Musicblocks the player carries, in catalog order (each `is_musicblock` item). */
export function musicblocksInPack(inv = {}) {
  return Object.values(MUSICBLOCK_CATALOG)
    .filter((def) => (Number(inv?.[def.classTsid]) || 0) > 0)
    .map((def) => ({ classTsid: def.classTsid, label: def.label }));
}

/**
 * onPlayerCollision: whether the crab calls out. Not while it is already
 * asking, not after a tune or a "Never mind" today, and only with a
 * Musicblock in the pack (the remake's pack has no slot limit, so the
 * empty-slot check always passes).
 */
export function crabWantsMusic(memory, { inv, dayKey, offering = false } = {}) {
  if (offering) return { ok: false, reason: 'offering' };
  if (hasPlayedToday(memory, dayKey)) return { ok: false, reason: 'played_today' };
  if (hasIgnoredToday(memory, dayKey)) return { ok: false, reason: 'ignored_today' };
  if (!musicblocksInPack(inv).length) return { ok: false, reason: 'no_blocks' };
  return { ok: true, reason: 'ask' };
}

/** apiSetHitBox(500, 200): the player is inside the crab's collision box. */
export function inCrabHitBox(crab, player) {
  if (!crab || !player) return false;
  return Math.abs(player.x - crab.x) <= CRAB_HITBOX.w / 2 && Math.abs(player.y - crab.y) <= CRAB_HITBOX.h;
}

/**
 * blockListenCallback: the crab hears `blockClass` at `now` and decides. Its
 * memory is the time each tune was last played for it. The result says what
 * the crab does now (`state`) and, `delaySec` later, what blockPlayCallback
 * settles (`settleState`, `rewards`).
 */
export function crabHearBlock(memory, blockClass, now) {
  const played = memory.blocksPlayed;
  const queueSize = Object.keys(played).length;
  const lastPlayed = played[blockClass];
  played[blockClass] = now;
  if (lastPlayed) {
    let after = 0;
    for (const [id, ts] of Object.entries(played)) {
      if (id !== blockClass && ts > lastPlayed) after += 1;
    }
    if (!after) {
      return { outcome: 'repeat', reply: CRAB_COPY.repeat, state: 'dislike_on', settleState: 'dislike_off', delaySec: 3, rewards: {}, block: blockClass, queueSize, after };
    }
    // ">= max_blocks, so the achievement doesn't break every time we add more.
    // And subtract 1 for the 1 we're listening to."
    if (after === queueSize - 1 && queueSize >= CRAB_MAX_BLOCKS - 1) {
      return {
        outcome: 'happy',
        reply: CRAB_COPY.happy,
        state: 'like_on',
        settleState: 'like_off',
        delaySec: 3,
        rewards: { mood: 99999, energy: 99999, xp: 1000, currants: 2000 },
        achievement: MAKE_A_CRAB_HAPPY,
        block: blockClass,
        queueSize,
        after,
      };
    }
    return {
      outcome: 'liked',
      reply: CRAB_COPY.liked,
      state: 'like_on',
      settleState: 'like_off',
      delaySec: 3,
      rewards: { xp: 10 * (queueSize - after), currants: 25 * (queueSize - after) },
      block: blockClass,
      queueSize,
      after,
    };
  }
  return {
    outcome: 'fresh',
    reply: CRAB_COPY.fresh,
    state: 'like_on',
    settleState: 'like_off',
    delaySec: 5,
    rewards: { xp: 10 * queueSize + 100, currants: 25 * queueSize + 100 },
    block: blockClass,
    queueSize,
    after: 0,
  };
}

/**
 * SOLO ADAPTATION (register G154, decision desk CRAB, Austin 2026-10-25).
 *
 * Source: npc_crab.js:461 a crab that hears the tune it heard last says
 * "Damn! I just heard this one! Argh!!!", plays dislike_on (462), and
 * blockPlayCallback destroys that Musicblock (530 pc.items_destroy(
 * details.block, 1)). With other players, another DJ's tune in between made
 * the crab's "last tune" move on; alone, playing the one block you carry
 * twice in a row costs it for good.
 *
 * Decision: refuse, but keep the block. Same line, same dislike reaction, no
 * reward, and in a Crab State of Mind the disliked tune still costs 20 mood
 * (526-528); only the items_destroy is skipped. Austin: "Should revisit once
 * multiplayer becomes real." Solo only: multiplayer, where other players can
 * trade a lost block back, uses the source (Austin 2026-10-26, G196).
 */
export const SOLO_KEEP_REPEATED_BLOCK = true;

/** Whether a repeated tune leaves the block: solo by the flag above, multiplayer never (npc_crab.js:530). */
export function keepsRepeatedBlock(mode) {
  return mode === 'multiplayer' ? false : SOLO_KEEP_REPEATED_BLOCK;
}

/**
 * blockPlayCallback: the CrabPod Headphones go back; a disliked tune costs, in
 * a Crab State of Mind, 20 mood, and in the source the block itself
 * (items_destroy(block, 1)), which SOLO_KEEP_REPEATED_BLOCK skips; a liked one
 * pays double in a Crab State of Mind. `keepRepeatedBlock` overrides the flag
 * (tests).
 */
export function crabSettle(heard, { crabStateOfMind = false, keepRepeatedBlock = SOLO_KEEP_REPEATED_BLOCK } = {}) {
  const rewards = { ...(heard?.rewards || {}) };
  const dislike = heard?.settleState === 'dislike_off';
  if (!dislike && crabStateOfMind) {
    for (const key of Object.keys(rewards)) rewards[key] *= 2;
  }
  return {
    rewards,
    moodLoss: dislike && crabStateOfMind ? CRAB_STATE_MOOD_LOSS : 0,
    destroyBlock: dislike && !keepRepeatedBlock ? heard.block : null,
    removeCrabphones: 1,
  };
}

// —— Verbs ——————————————————————————————————————————————————————————————

/** verbs.hug get_tooltip. */
export function crabHugTooltip(memory, dayKey) {
  if (hasFlatteredToday(memory, dayKey) && !canHugToday(memory, dayKey)) return CRAB_COPY.hugOver;
  if (hasFlatteredToday(memory, dayKey)) return CRAB_COPY.hugRipe;
  return CRAB_COPY.hugTooltip;
}

/** The crab's menu (sort_on 50 each, so alphabetical). debug/engage are admin only. */
export function crabVerbs(memory, dayKey) {
  return [
    { id: 'crab_flatter', label: 'flatter', tooltip: CRAB_COPY.flatterTooltip, enabled: true, reason: '', durationMs: 0 },
    { id: 'crab_hug', label: 'hug', tooltip: crabHugTooltip(memory, dayKey), enabled: true, reason: '', durationMs: 0 },
    { id: 'crab_insult', label: 'insult', tooltip: CRAB_COPY.insultTooltip, enabled: true, reason: '', durationMs: 0 },
    { id: 'crab_pinch', label: 'pinch', tooltip: CRAB_COPY.pinchTooltip, enabled: true, reason: '', durationMs: 0 },
  ];
}

/**
 * Run one crab verb. Returns the source's buildVerbMessage parts and the
 * metabolic changes asked for (the caller clamps them): `mood`/`energy` are
 * signed requests, `items` what to give, `state` the crab's reaction clip.
 */
export function crabVerb(memory, verb, dayKey) {
  switch (verb) {
    case 'flatter':
      bump(memory, 'flattered', dayKey);
      return { verb, past: 'flattered', failed: false, msg: CRAB_COPY.flatter, mood: 1, energy: -1, items: {}, state: 'like_off' };
    case 'hug':
      if (hasFlatteredToday(memory, dayKey) && canHugToday(memory, dayKey)) {
        bump(memory, 'hugged', dayKey);
        return { verb, past: 'hugged', failed: false, msg: CRAB_COPY.hug, mood: 0, energy: 0, items: { [CRABATO_JUICE]: 1 }, state: 'like_off' };
      }
      if (!canHugToday(memory, dayKey)) {
        return { verb, past: 'hugged', failed: true, msg: CRAB_COPY.hugPushy, mood: 0, energy: -2, items: {}, state: 'dislike_off' };
      }
      return { verb, past: 'hugged', failed: true, msg: CRAB_COPY.hugUnflattered, mood: 0, energy: -2, items: {}, state: 'dislike_off' };
    case 'pinch':
      return { verb, past: 'pinched', failed: false, msg: CRAB_COPY.pinch, mood: -2, energy: 0, items: {}, state: 'dislike_off' };
    case 'insult':
      // verbs.insult sets no state.
      return { verb, past: 'insulted', failed: false, msg: CRAB_COPY.insult, mood: -2, energy: 0, items: {}, state: null };
    default:
      return null;
  }
}

/** item.js buildVerbMessage(1, verb, past, failed, msgs): "You flattered a Crab. <msg>" */
export function crabVerbMessage(result) {
  if (!result) return '';
  const head = result.failed ? `You tried to ${result.verb} a Crab.` : `You ${result.past} a Crab.`;
  return `${head} ${result.msg}`.trim();
}

// —— Roaming (npc_walkable walk_type 'roam') ——————————————————————————————

/** startMoving for 'roam': a choose_one distance in go_dir, kept 100 px inside the street. */
export function crabRoamTarget(x, goDir, bounds, rand = Math.random) {
  const pick = (list) => list[Math.floor(rand() * list.length) % list.length];
  let distance = goDir === 'left' ? pick(CRAB_WALK.left) : pick(CRAB_WALK.right);
  const l = bounds.l + CRAB_WALK.edge;
  const r = bounds.r - CRAB_WALK.edge;
  if (distance < 0 && x + distance < l) distance = l - x;
  else if (distance > 0 && x + distance > r) distance = r - x;
  return { distance, x: x + distance };
}

/** parent_onCreate: npc_walk_speed = randInt(50, 55). */
export function crabWalkSpeed(rand = Math.random) {
  return CRAB_WALK.speedMin + Math.floor(rand() * (CRAB_WALK.speedMax - CRAB_WALK.speedMin + 1));
}
