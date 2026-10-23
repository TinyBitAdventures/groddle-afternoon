/**
 * Glitch Races: the solo remake of the two-player race instances bought from
 * Race Ticket Dispensers.
 *
 * Sources (GSJS, ~/Documents/glitch-audit/glitch-GameServerJS):
 * - items/race_ticket_dispenser.js: verb "purchase" opens store 20.
 * - items/catalog_stores.js store 20 "Ticket Dispenser": every ticket costs 60.
 * - items/race_ticket*.js: labels, descriptions, stackmax 5, game_id "race"
 *   with location_id 0-6 into config_prod.js shared_instances.race.locations.
 * - config_prod.js multiplayer_quest_locations: titles, production TSIDs,
 *   two start points each, race_type "finish_line".
 * - players/inc_games.js (the ticket races since the @glitchlog note of
 *   2011-10-25, "Race code got a major overhaul (no longer tied up with
 *   quests)"): "Starting <race> between <a> and <b> in 5 seconds!",
 *   games_race_splash "Be the first to the finish line to win!" + "Click to
 *   Start", games_end_race winner +50 xp +100 currants on every win, the
 *   loser nothing, achievements_increment('race', 'won' | 'lost').
 * - groups/shared_instance_manager.js: after Click to Start, "YAY! THE GAME
 *   IS STARTING SOON." for 5 s (GAME_STARTING_SOON), then the 4000 ms
 *   "321_countdown" (COUNT_DOWN).
 * - locations/inc_race.js (the older quest races, which the 2011-07 beta
 *   recordings show): per-race quest desc + "(CLICK WHEN READY)", second
 *   place 25 currants + 5 xp, a ten-race cap; flags multiplayer_quest_win
 *   and race_leave. Only the flags are kept.
 * - quests/<race>.js: all seven quest descs (the ready lines the 2011-07
 *   recordings show over each course).
 * - Grab 'Em Good (config_prod.js shared_instances.quoin_grab, race_type
 *   "most_quoins"): players/inc_games.js games_quoin_grab_splash ("Get the
 *   most quoins to win!"), games_end_quoin_grab (winner +50 xp +100 currants,
 *   loser nothing, achievements_increment('quoin_grab', 'won' | 'lost'));
 *   groups/global_game.js quoin_grab_get_quoin (one point per quoin; the
 *   grabber wins when their lead beats the quoins left, or takes the last);
 *   items/quoin.js (game quoins pay their benefit, skip the daily limit and
 *   never respawn); quests/grab_em_good.js desc.
 *
 * The production race streets are absent from the public locations archive,
 * so race-courses.js holds clean reconstructions of each course. Race state is
 * transient: only lifetime counters, best times, and the pre-race return point
 * are saved.
 */

export const RACE_TICKET_PRICE = 60;
export const RACE_TICKET_STACK = 5;
export const RACE_START_DELAY_MS = 5_000;
export const RACE_COUNTDOWN_MS = 4_000;
export const RACE_WIN_REWARD = Object.freeze({ currants: 100, xp: 50 });
/** games_end_race pays the loser nothing (inc_race.js's 25 + 5 was quest-only). */
export const RACE_LOSS_REWARD = Object.freeze({ currants: 0, xp: 0 });
/** games_race_splash text, shared by every ticket race. */
export const RACE_SPLASH_TEXT = 'Be the first to the finish line to win!';
/** shared_instance_manager.js dismissOverlaysAndStart: the 5 s wait before the countdown. */
export const RACE_STARTING_SOON = 'YAY! THE GAME IS STARTING SOON.';
export const RACE_STARTING_SOON_MS = 5_000;
export const RACE_DISPENSER_CLASS = 'race_ticket_dispenser';
export const RACE_GENERIC_TICKET = 'race_ticket';
export const RACE_SCENE_PREFIX = 'RACE_';
export const RACE_FLAGS = Object.freeze({ win: 'multiplayer_quest_win', leave: 'race_leave' });
export const RACE_ACHIEVEMENTS = Object.freeze({ won: 'race:won', lost: 'race:lost' });
/** games_end_quoin_grab: achievements_increment('quoin_grab', 'won' | 'lost'). */
export const QUOIN_GRAB_ACHIEVEMENTS = Object.freeze({ won: 'quoin_grab:won', lost: 'quoin_grab:lost' });
/** games_quoin_grab_splash text. */
export const QUOIN_GRAB_SPLASH_TEXT = 'Get the most quoins to win!';
/** Grab 'Em Good quoins are mood quoins; the recording shows +11 (benefit 10 at a 1.1 multiplier). */
export const QUOIN_GRAB_QUOIN = Object.freeze({ type: 'mood', benefit: 10 });

/** Solo stand-in rivals (js/local-companions.js) with their avatar tints. */
export const RACE_RIVALS = Object.freeze([
  Object.freeze({ name: 'Amp', tint: 0xf2a34a }),
  Object.freeze({ name: 'Bumbishfish', tint: 0x69a9ef }),
  Object.freeze({ name: 'Lily Linguistic', tint: 0xed86bd }),
]);

/**
 * The seven finish-line races (config_prod.js shared_instances.race.locations
 * order = each ticket's location_id), plus Grab 'Em Good, the quoin_grab
 * shared instance (race_type "most_quoins", no location_id).
 */
export const RACES = Object.freeze({
  amazing_race: Object.freeze({
    id: 'amazing_race',
    title: 'The Amazing Race',
    ticket: 'race_ticket_amazing_race',
    ticketLabel: 'Amazing Race Ticket',
    ticketDesc: 'Challenge another player to the Amazing Race.',
    locationIndex: 0,
    productionTsid: 'LIF10A4HV3P17BU',
    desc: 'Be the first to get to the top!',
    descSource: 'quests/amazing_race.js',
    video: 'EkI4G2qi-Z0',
  }),
  canyon_run: Object.freeze({
    id: 'canyon_run',
    title: 'Canyon Run',
    ticket: 'race_ticket_canyon_run',
    ticketLabel: 'Canyon Run Ticket',
    ticketDesc: 'Challenge another player to Canyon Run.',
    locationIndex: 1,
    productionTsid: 'LIF1H6AFJ9P19UJ',
    desc: 'Be the first to get to the other side!',
    descSource: 'quests/canyon_run.js',
    video: 'Ox_Tdn8tdd0',
  }),
  lava_leap: Object.freeze({
    id: 'lava_leap',
    title: 'Lava Leap',
    ticket: 'race_ticket_lava_leap',
    ticketLabel: 'Lava Leap Ticket',
    ticketDesc: 'Challenge another player to Lava Leap.',
    locationIndex: 2,
    productionTsid: 'LIF107M5ORP1DQ5',
    desc: 'Be the first to get to the other side!',
    descSource: 'quests/lava_leap.js',
    video: 'VxDEwOb5ehg',
  }),
  crystal_climb: Object.freeze({
    id: 'crystal_climb',
    title: 'Crystal Climb',
    ticket: 'race_ticket_crystal_climb',
    ticketLabel: 'Crystal Climb Ticket',
    ticketDesc: 'Challenge another player to Crystal Climb.',
    locationIndex: 3,
    productionTsid: 'LHV1BEMOK14268R',
    desc: 'Climb fastest to the top of the crystal maze to win. WIN!',
    descSource: 'quests/crystal_climb.js',
    video: '8SaHD6H4-0w',
  }),
  space_race: Object.freeze({
    id: 'space_race',
    title: 'Space Race',
    ticket: 'race_ticket_space_race',
    ticketLabel: 'Space Race Ticket',
    ticketDesc: 'Challenge another player to Space Race.',
    locationIndex: 4,
    productionTsid: 'LHV1BCTKK142N8F',
    desc: 'Race through space to be the first past the post.',
    descSource: 'quests/space_race.js',
    video: '6ruMDWrHNa0',
  }),
  star_sprint: Object.freeze({
    id: 'star_sprint',
    title: 'Star Sprint',
    ticket: 'race_ticket_star_sprint',
    ticketLabel: 'Star Sprint Ticket',
    ticketDesc: 'Challenge another player to Star Sprint.',
    locationIndex: 5,
    productionTsid: 'LHV1BF1QK142P0V',
    desc: 'Want to touch the stars? You have to get there first. Race! To the top!',
    descSource: 'quests/star_sprint.js',
    video: 'w3kWmsESi8A',
  }),
  time_warp: Object.freeze({
    id: 'time_warp',
    title: 'Time Warp',
    ticket: 'race_ticket_time_warp',
    ticketLabel: 'Time Warp Ticket',
    ticketDesc: 'Challenge another player to Time Warp.',
    locationIndex: 6,
    productionTsid: 'LHV1BDAMK142HAO',
    desc: 'Be the first to the end of the time warp to win the race.',
    descSource: 'quests/time_warp.js',
    video: 'feBQ5kjPzfk',
  }),
  grab_em_good: Object.freeze({
    id: 'grab_em_good',
    title: "Grab 'Em Good",
    ticket: 'race_ticket_grab_em_good',
    ticketLabel: "Grab 'Em Good Ticket",
    ticketDesc: "Challenge another player to Grab 'Em Good.",
    locationIndex: null,
    game: 'quoin_grab',
    raceType: 'most_quoins',
    productionTsid: 'LIF11MB3O8P1TAR',
    // config_prod.js multiplayer_quest_locations.grab_em_good start_points.
    startPoints: Object.freeze([Object.freeze({ x: -319, y: 757 }), Object.freeze({ x: 356, y: 753 })]),
    desc: 'Collect all the quoins. Whoever gets the most wins!',
    descSource: 'quests/grab_em_good.js',
    splash: QUOIN_GRAB_SPLASH_TEXT,
    video: 'zBiGJR6jIJM',
  }),
});

/** The seven finish-line races, in location_id order. */
export const RACE_IDS = Object.freeze(
  Object.values(RACES)
    .filter((race) => race.raceType !== 'most_quoins')
    .sort((a, b) => a.locationIndex - b.locationIndex)
    .map((race) => race.id)
);

/** Every ticket game the races feature runs (record keys). */
export const RACE_GAME_IDS = Object.freeze(Object.keys(RACES));
export const GRAB_EM_GOOD_ID = 'grab_em_good';

export function isQuoinGrab(raceId) {
  return RACES[raceId]?.raceType === 'most_quoins';
}

/**
 * Store 20 in catalog order. Tickets for games this lane does not run (The
 * Great Hog Haul has its own quest route) are listed as unavailable so the
 * shelf still reads like the original.
 */
export const RACE_STORE_ITEMS = Object.freeze([
  Object.freeze({ classTsid: 'race_ticket_hogtie_piggy', label: 'The Great Hog Haul Ticket', cost: 60 }),
  Object.freeze({ classTsid: 'race_ticket_time_warp', label: 'Time Warp Ticket', cost: 60 }),
  Object.freeze({ classTsid: 'race_ticket_star_sprint', label: 'Star Sprint Ticket', cost: 60 }),
  Object.freeze({ classTsid: 'race_ticket_space_race', label: 'Space Race Ticket', cost: 60 }),
  Object.freeze({ classTsid: 'race_ticket_crystal_climb', label: 'Crystal Climb Ticket', cost: 60 }),
  Object.freeze({ classTsid: 'race_ticket_lava_leap', label: 'Lava Leap Ticket', cost: 60 }),
  Object.freeze({ classTsid: 'race_ticket_grab_em_good', label: "Grab 'Em Good Ticket", cost: 60 }),
  Object.freeze({ classTsid: 'race_ticket_canyon_run', label: 'Canyon Run Ticket', cost: 60 }),
  Object.freeze({ classTsid: 'race_ticket_amazing_race', label: 'Amazing Race Ticket', cost: 60 }),
  Object.freeze({ classTsid: 'race_ticket_it_game', label: 'Game of Crowns Ticket', cost: 60 }),
]);

/**
 * The eleven archived streets whose late-game item refs include a Race Ticket
 * Dispenser (tinyspeck/glitch-locations L-prefixed objects, G aliases).
 */
export const RACE_DISPENSER_STREETS = Object.freeze({
  GIF12UPTEUV14ON: Object.freeze({ label: 'Kalix Follows', source: 'LIF12UPTEUV14ON', item: 'IA9J7MM8CAB2S4A' }),
  GCR13NMUQEM1A2R: Object.freeze({ label: 'Hackfast Quicks', source: 'LCR13NMUQEM1A2R', item: 'IIFC52IL5T62GCV' }),
  GIF16IHL8972EAC: Object.freeze({ label: 'Tella Hella', source: 'LIF16IHL8972EAC', item: 'IIF48BARBAB2TPO' }),
  GNVIK9H78JH2UKU: Object.freeze({ label: 'Iable Var', source: 'LNVIK9H78JH2UKU', item: 'INVU62U8HTH2P97' }),
  GIF3VMSMT0H2NKE: Object.freeze({ label: 'Masquff Greets', source: 'LIF3VMSMT0H2NKE', item: 'IIFKP5321EH2L5P' }),
  GA513ALBNM623UJ: Object.freeze({ label: 'Bangala Bristles', source: 'LA513ALBNM623UJ', item: 'IA5E2060CAB2JJ0' }),
  GCR1UJAMSIN1D0G: Object.freeze({ label: 'Sculdent Shill', source: 'LCR1UJAMSIN1D0G', item: 'IA5C1EO1BAB2MP3' }),
  GHV5B9093K42J9S: Object.freeze({ label: 'Piyaz Prone', source: 'LHV5B9093K42J9S', item: 'IHV5URL15T62AD0' }),
  GLI2HHRC84F1TJ6: Object.freeze({ label: 'Cranbury Coppice', source: 'LLI2HHRC84F1TJ6', item: 'IIF22T1GAAB2GI1' }),
  GM4109NI2R640: Object.freeze({ label: 'Guillermo Gamera Way', source: 'LM4109NI2R640', item: 'IA55LDF35T62UTV' }),
  GLI3ABTPR2J1SH9: Object.freeze({ label: 'Highland Fling', source: 'LLI3ABTPR2J1SH9', item: 'IHV8IF6N5T62FUD' }),
});

export function hasRaceDispenser(tsid) {
  const key = String(tsid || '');
  return Boolean(RACE_DISPENSER_STREETS[key] || RACE_DISPENSER_STREETS[key.replace(/^L/, 'G')]);
}

export function raceForTicket(classTsid) {
  return Object.values(RACES).find((race) => race.ticket === classTsid) || null;
}

export function raceSceneTsid(raceId) {
  return `${RACE_SCENE_PREFIX}${String(raceId || '').toUpperCase()}`;
}

export function isRaceSceneTsid(tsid) {
  return String(tsid || '').startsWith(RACE_SCENE_PREFIX);
}

/**
 * The generic Race Ticket rolls randInt(0, races + 1): one of the seven races,
 * or (the last two values) Hog Haul / Grab 'Em Good. Hog Haul has no ticket
 * route here, so that roll falls back onto a race.
 */
export function pickGenericRace(roll = Math.random()) {
  const n = RACE_IDS.length;
  const choice = Math.max(0, Math.min(n + 1, Math.floor(Number(roll) * (n + 2))));
  if (choice === n + 1) return GRAB_EM_GOOD_ID;
  return RACE_IDS[choice % n];
}

export function pickRival(raceId, seed = 0) {
  const index = Math.abs(
    [...String(raceId || '')].reduce((sum, ch) => sum + ch.charCodeAt(0), 0) + Math.floor(seed)
  ) % RACE_RIVALS.length;
  return RACE_RIVALS[index];
}

export function startDelayMessage(raceTitle, playerName = 'you', rivalName = 'Amp') {
  return `Starting ${raceTitle} between ${playerName} and ${rivalName} in 5 seconds!`;
}

/* ------------------------------------------------------------------ */
/* Persistent record                                                  */
/* ------------------------------------------------------------------ */

function cleanCounts(seed) {
  const out = {};
  for (const id of RACE_GAME_IDS) {
    const n = Math.floor(Number(seed?.[id]) || 0);
    if (n > 0) out[id] = n;
  }
  return out;
}

/** Lifetime race counters, best times, and the pre-race return point. */
export function normalizeRaceRecord(seed = {}) {
  const best = {};
  for (const id of RACE_GAME_IDS) {
    const ms = Math.floor(Number(seed?.best?.[id]) || 0);
    if (ms > 0) best[id] = ms;
  }
  const back = seed?.returnTo;
  const returnTo =
    back && typeof back.tsid === 'string' && back.tsid && !isRaceSceneTsid(back.tsid) &&
    Number.isFinite(Number(back.x)) && Number.isFinite(Number(back.y))
      ? { tsid: back.tsid, x: Math.round(Number(back.x)), y: Math.round(Number(back.y)) }
      : null;
  const pending = seed?.pendingTicket;
  return {
    wins: cleanCounts(seed?.wins),
    losses: cleanCounts(seed?.losses),
    best,
    returnTo,
    // A ticket spent on a race that never reached GO (refunded on reload).
    pendingTicket: typeof pending === 'string' && /^race_ticket[a-z_]*$/.test(pending) ? pending : null,
  };
}

/* ------------------------------------------------------------------ */
/* Live race state                                                    */
/* ------------------------------------------------------------------ */

const STATUSES = ['staging', 'countdown', 'running', 'won', 'lost', 'forfeit'];

export function createRaceRun(raceId, seed = {}) {
  if (!RACES[raceId]) throw new Error(`Unknown race: ${raceId}`);
  const now = Math.max(0, Number(seed.now) || Date.now());
  const rival = seed.rival || pickRival(raceId, seed.rivalSeed || 0);
  return {
    raceId,
    status: STATUSES.includes(seed.status) ? seed.status : 'staging',
    createdAt: now,
    startAt: 0,
    finishedAt: 0,
    rivalName: String(rival.name || 'Amp').slice(0, 40),
    rivalTint: Number.isFinite(rival.tint) ? rival.tint : 0xf2a34a,
    rivalDurationMs: Math.max(5_000, Math.floor(Number(seed.rivalDurationMs) || 60_000)),
    checkpoint: -1,
    passed: [],
    falls: 0,
    playerProgress: 0,
    ticket: seed.ticket || null,
    kind: isQuoinGrab(raceId) ? 'quoins' : 'finish',
    // Grab 'Em Good: global_game.js scores (one per quoin) and the quoins on the street.
    scores: { you: 0, rival: 0 },
    quoinTotal: Math.max(0, Math.floor(Number(seed.quoinTotal) || 0)),
    lastGrab: null,
  };
}

export function beginRaceCountdown(run, now = Date.now()) {
  if (!run || run.status !== 'staging') return false;
  run.status = 'countdown';
  run.startAt = now + RACE_COUNTDOWN_MS;
  return true;
}

/** READY? → 3 → 2 → 1 → GO! across the 4000 ms source countdown. */
export function raceCountdownCue(run, now = Date.now()) {
  if (!run || run.status !== 'countdown') return '';
  const remaining = run.startAt - now;
  if (remaining <= 0) return 'GO!';
  if (remaining > 3_000) return 'READY?';
  return String(Math.max(1, Math.ceil(remaining / 1_000)));
}

export function raceElapsedMs(run, now = Date.now()) {
  if (!run || !run.startAt || now < run.startAt) return 0;
  const end = run.finishedAt && run.status !== 'running' ? run.finishedAt : now;
  return Math.max(0, end - run.startAt);
}

/** Advance countdown → running, and let the rival cross the line. */
export function tickRace(run, now = Date.now()) {
  const events = [];
  if (!run) return events;
  if (run.status === 'countdown' && now >= run.startAt) {
    run.status = 'running';
    events.push({ type: 'started' });
  }
  // Grab 'Em Good ends on a quoin grab (grabRaceQuoin), never on the clock.
  if (run.status === 'running' && run.kind !== 'quoins' && now - run.startAt >= run.rivalDurationMs) {
    run.status = 'lost';
    run.finishedAt = run.startAt + run.rivalDurationMs;
    events.push({ type: 'lost', winner: run.rivalName });
  }
  return events;
}

export function passRaceCheckpoint(run, index) {
  const i = Math.floor(Number(index));
  if (!run || run.status !== 'running' || !Number.isFinite(i) || i < 0) return false;
  if (run.passed.includes(i)) return false;
  run.passed.push(i);
  run.passed.sort((a, b) => a - b);
  if (i > run.checkpoint) run.checkpoint = i;
  return true;
}

export function noteRaceFall(run) {
  if (!run || run.status !== 'running') return 0;
  run.falls += 1;
  return run.falls;
}

/** The player touched race_finish (location.js → games_win_race / race_finish). */
export function finishRace(run, now = Date.now()) {
  if (!run || run.status !== 'running') return false;
  run.status = 'won';
  run.finishedAt = now;
  run.playerProgress = 1;
  return true;
}

export function forfeitRace(run, now = Date.now()) {
  if (!run || !['staging', 'countdown', 'running'].includes(run.status)) return false;
  run.status = 'forfeit';
  run.finishedAt = now;
  return true;
}

export function raceIsLive(run) {
  return Boolean(run && ['staging', 'countdown', 'running'].includes(run.status));
}

/* ------------------------------------------------------------------ */
/* Grab 'Em Good (global_game.js quoin_grab_*)                         */
/* ------------------------------------------------------------------ */

/** Quoins nobody has grabbed yet. */
export function quoinGrabRemaining(run) {
  if (!run) return 0;
  return Math.max(0, (run.quoinTotal || 0) - (run.scores?.you || 0) - (run.scores?.rival || 0));
}

/**
 * quoin_grab_get_quoin: after a grab, the grabber wins when their lead over
 * every other player is larger than the quoins left, or when the last quoin
 * is gone. Only the grabber can be named the winner on their own grab.
 */
export function quoinGrabWinner(scores, total, grabber) {
  const mine = Math.max(0, Number(scores?.[grabber]) || 0);
  let remaining = Math.max(0, Math.floor(Number(total) || 0));
  let lead = 0;
  for (const [who, score] of Object.entries(scores || {})) {
    remaining -= Math.max(0, Number(score) || 0);
    if (who !== grabber) lead = Math.max(lead, mine - Math.max(0, Number(score) || 0));
  }
  return lead > remaining || remaining <= 0 ? grabber : null;
}

/** The fewest quoins that settle a game of `total` (71 → 36). */
export function quoinGrabTarget(total) {
  return Math.floor(Math.max(0, Number(total) || 0) / 2) + 1;
}

/**
 * One grab by 'you' or 'rival' while the game runs. Returns the result:
 * { ok, who, score, remaining, winner } and settles run.status when the grab
 * decides the game (won / lost).
 */
export function grabRaceQuoin(run, who, now = Date.now()) {
  if (!run || run.kind !== 'quoins' || run.status !== 'running' || !['you', 'rival'].includes(who)) {
    return { ok: false };
  }
  if (quoinGrabRemaining(run) <= 0) return { ok: false };
  run.scores[who] += 1;
  run.lastGrab = who;
  const winner = quoinGrabWinner(run.scores, run.quoinTotal, who);
  if (winner) {
    run.status = winner === 'you' ? 'won' : 'lost';
    run.finishedAt = now;
  }
  run.playerProgress = run.quoinTotal ? run.scores.you / run.quoinTotal : 0;
  run.rivalProgress = run.quoinTotal ? run.scores.rival / run.quoinTotal : 0;
  return { ok: true, who, score: run.scores[who], remaining: quoinGrabRemaining(run), winner };
}

/**
 * The score overlay (quoin_grab_show_overlays): one "label: score" line per
 * player, then "Remaining: N".
 */
export function quoinGrabOverlayLines(run, playerName = 'You') {
  if (!run) return [];
  return [
    `${playerName}: ${run.scores?.you || 0}`,
    `${run.rivalName}: ${run.scores?.rival || 0}`,
    `Remaining: ${quoinGrabRemaining(run)}`,
  ];
}

/** Mood paid by one game quoin (items/quoin.js: benefit × the personal multiplier, rounded). */
export function quoinGrabMood(multiplier = 1) {
  const m = Number(multiplier);
  return Math.max(0, Math.round(QUOIN_GRAB_QUOIN.benefit * (Number.isFinite(m) && m > 0 ? m : 1)));
}

/**
 * Settle a finished race against the lifetime record (inc_games.js
 * games_end_race): counters always increment, every win pays, a loss pays
 * nothing.
 */
export function settleRace(run, record) {
  const next = normalizeRaceRecord(record);
  if (!run || !['won', 'lost', 'forfeit'].includes(run.status)) {
    return { ok: false, record: next, reward: { currants: 0, xp: 0 } };
  }
  const id = run.raceId;
  let reward = { currants: 0, xp: 0 };
  if (run.status === 'won') {
    next.wins[id] = (next.wins[id] || 0) + 1;
    reward = { ...RACE_WIN_REWARD };
    const ms = Math.max(1, run.finishedAt - run.startAt);
    if (!next.best[id] || ms < next.best[id]) next.best[id] = ms;
  } else if (run.status === 'lost') {
    next.losses[id] = (next.losses[id] || 0) + 1;
  }
  return { ok: true, record: next, reward, outcome: run.status };
}

/** The recorded result overlay copy. */
export function raceResultCopy(run, reward = { currants: 0, xp: 0 }) {
  if (run?.status === 'won') {
    return {
      title: 'YOU WON!',
      detail: `(You got ${reward.currants} currants and ${reward.xp} xp.)`,
    };
  }
  if (run?.status === 'lost') {
    // games_end_race: the other_winner frame with the winner's name, no reward.
    return { title: `${run.rivalName} IS THE WINNER!`, detail: '' };
  }
  return { title: 'You left the race.', detail: `${run?.rivalName || 'Your rival'} wins by default.` };
}

export function formatRaceTime(ms) {
  const total = Math.max(0, Math.floor(Number(ms) || 0));
  const minutes = Math.floor(total / 60_000);
  const seconds = Math.floor((total % 60_000) / 1000);
  const tenths = Math.floor((total % 1000) / 100);
  return `${minutes}:${String(seconds).padStart(2, '0')}.${tenths}`;
}

/* ------------------------------------------------------------------ */
/* Route kinematics: rival pacing, autoplay, and progress              */
/* ------------------------------------------------------------------ */

/** Avatar movement constants mirrored from game.js handleInput/physics. */
export const RACE_PHYSICS = Object.freeze({
  runSpeed: 4.4, // px per 60 Hz frame
  jumpVelocity: 9.6,
  gravity: 0.42,
  climbSpeed: 2.35,
});

/** Can a standing-start jump clear dx while rising `rise` px (negative = drop)? */
export function jumpReach(gravityScale = 1, physics = RACE_PHYSICS) {
  const g = physics.gravity * gravityScale;
  const v = physics.jumpVelocity;
  return { maxRise: (v * v) / (2 * g), g, v };
}

export function canJump(dx, rise, gravityScale = 1, margin = 0.9, physics = RACE_PHYSICS) {
  const { maxRise, g, v } = jumpReach(gravityScale, physics);
  if (rise > maxRise * margin) return false;
  const disc = v * v - 2 * g * rise;
  if (disc < 0) return false;
  const frames = (v + Math.sqrt(disc)) / g;
  return Math.abs(dx) <= frames * physics.runSpeed * margin;
}

function segmentFrames(a, b, opts) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const speed = opts.runSpeed;
  if (b.mode === 'climb') return Math.abs(dy) / opts.climbSpeed;
  if (b.mode === 'jump') {
    const g = RACE_PHYSICS.gravity * (opts.gravity || 1);
    const v = RACE_PHYSICS.jumpVelocity;
    const rise = -dy;
    const disc = Math.max(0, v * v - 2 * g * rise);
    const air = (v + Math.sqrt(disc)) / g;
    return Math.max(air, Math.abs(dx) / speed);
  }
  if (b.mode === 'fall') {
    const g = RACE_PHYSICS.gravity * (opts.gravity || 1);
    const fall = Math.max(0, dy);
    return Math.max(Math.sqrt((2 * fall) / g), Math.abs(dx) / speed);
  }
  return Math.hypot(dx, dy) / speed;
}

function routeOpts(opts = {}) {
  return {
    runSpeed: (opts.runSpeed || RACE_PHYSICS.runSpeed) * (opts.pace || 1),
    climbSpeed: (opts.climbSpeed || RACE_PHYSICS.climbSpeed) * (opts.pace || 1),
    gravity: opts.gravity || 1,
    pauses: opts.pauses || {},
  };
}

/** Per-node timeline (ms from GO) for a route walked at `pace` × avatar speed. */
export function routeTimeline(nodes, opts = {}) {
  const o = routeOpts(opts);
  const times = [0];
  let t = 0;
  for (let i = 1; i < (nodes || []).length; i += 1) {
    t += (segmentFrames(nodes[i - 1], nodes[i], o) * 1000) / 60;
    t += Math.max(0, Number(o.pauses[i]) || 0);
    times.push(t);
  }
  return times;
}

export function routeDurationMs(nodes, opts = {}) {
  const times = routeTimeline(nodes, opts);
  return times[times.length - 1] || 0;
}

/** Pose on the route at `elapsedMs`: position, mode, facing, segment, progress. */
export function routePoseAt(nodes, elapsedMs, opts = {}, timeline = null) {
  const list = nodes || [];
  if (!list.length) return { x: 0, y: 0, mode: 'idle', facing: 1, segment: 0, progress: 0, done: true };
  const times = timeline || routeTimeline(list, opts);
  const total = times[times.length - 1] || 0;
  const t = Math.max(0, Number(elapsedMs) || 0);
  if (t >= total || list.length === 1) {
    const last = list[list.length - 1];
    return { x: last.x, y: last.y, mode: 'idle', facing: 1, segment: list.length - 1, progress: 1, done: true };
  }
  let i = 1;
  while (i < times.length - 1 && times[i] < t) i += 1;
  const a = list[i - 1];
  const b = list[i];
  const pause = Math.max(0, Number(routeOpts(opts).pauses[i]) || 0);
  const span = Math.max(1, times[i] - times[i - 1] - pause);
  const u = Math.max(0, Math.min(1, (t - times[i - 1]) / span));
  let x = a.x + (b.x - a.x) * u;
  let y = a.y + (b.y - a.y) * u;
  if (b.mode === 'jump') {
    const peak = Math.max(36, a.y - b.y + 46);
    y -= peak * 4 * u * (1 - u);
  }
  const facing = b.x < a.x ? -1 : b.x > a.x ? 1 : a.facing || 1;
  const mode = u >= 1 ? 'idle' : b.mode || 'walk';
  return { x, y, mode, facing, segment: i - 1, progress: Math.min(1, t / total), done: false };
}

/** Cumulative route lengths, used for a smooth 0-1 progress measure. */
export function routeLengths(nodes) {
  const out = [0];
  for (let i = 1; i < (nodes || []).length; i += 1) {
    out.push(out[i - 1] + Math.hypot(nodes[i].x - nodes[i - 1].x, nodes[i].y - nodes[i - 1].y));
  }
  return out;
}

/**
 * Project a position onto the route, searching a window around the last
 * segment so stacked switchbacks on climbing courses never skip ahead.
 */
export function projectRouteProgress(nodes, x, y, hint = 0, lengths = null) {
  const list = nodes || [];
  if (list.length < 2) return { progress: 0, segment: 0, distance: Infinity };
  const lens = lengths || routeLengths(list);
  const total = lens[lens.length - 1] || 1;
  const from = Math.max(0, Math.floor(hint) - 2);
  const to = Math.min(list.length - 2, Math.floor(hint) + 4);
  let best = { progress: lens[from] / total, segment: from, distance: Infinity };
  for (let i = from; i <= to; i += 1) {
    const a = list[i];
    const b = list[i + 1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy || 1;
    const u = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / len2));
    const px = a.x + dx * u;
    const py = a.y + dy * u;
    const d = Math.hypot(x - px, (y - py) * 1.4);
    if (d < best.distance) {
      best = {
        progress: (lens[i] + Math.sqrt(len2) * u) / total,
        segment: i,
        distance: d,
      };
    }
  }
  return best;
}
