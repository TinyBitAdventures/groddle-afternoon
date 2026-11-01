/**
 * Math Mayhem between real players (G397): the rules and the pure side of
 * the client. The realtime server (groddle-afternoon-server mayhem.go) runs
 * the game; features/mayhem-feature.js shows it. Nothing here touches the
 * DOM, Pixi or the socket.
 *
 * The rules are GameServerJS's math_mayhem (eleven-gsjs, CC0):
 * - config_prod.js:1282 shared_instances.math_mayhem: the Game of Crowns
 *   street LHV2H026E492IAF, 4 to 20 players, can_retry.
 * - items/test_game_starter.js 41-86: the way in was the Game Pig ("GAME PIG
 *   IS THE BEST. GAME PIG WANTS TO PLAY FUN GAME."): Admire asks "Which game
 *   do you want to play?" (Color, Crowns, Maths) and Maths puts you in the
 *   Math Mayhem instance (shared_instance_manager.playerJoinInstance) with
 *   "You are transported to a mystical land of fun and adventure!". No ticket
 *   or other item names the mode.
 * - groups/shared_instance_manager.js playerJoinInstance 36-87 and
 *   findAvailableInstances 585-633: one open game takes everyone (the fullest
 *   one under max_players that has not started); onSharedInstanceEnter
 *   89-229: Click to Start (math_mayhem borrows the colour game's title and
 *   start pictures, 135-140) and games_auto_leave after 2 min;
 *   dismissOverlaysAndStart 231-342 with instance.js can_start_game 582-602:
 *   it starts once min_players (4) have clicked and nobody in it has not;
 *   "YAY! THE GAME IS STARTING SOON." 5 s, then the 321 countdown.
 * - groups/global_game.js initMathMayhemInInstance 271-327: two teams, blue
 *   first then red in turn; each player starts at 1 + the players already on
 *   their team (blue 1, red 1, blue 2, red 2, ...); the target is
 *   randInt(10, 100).
 * - players/inc_games.js games_start_math_mayhem 958-979 (the score over your
 *   head, games_show_mayhem_score 1157-1188: red #CC0000, blue #0C6AE0; the
 *   "Target: N" overlay, games_mayhem_show_target 1207-1229),
 *   games_do_math 982-1010 (two players touch: the same team adds, two
 *   teams take the smaller from the larger; both get the answer and are
 *   locked for 1 s, games_math_mayhem_lock 1232-1250),
 *   games_set_math_mayhem_score 1024-1039 (an answer equal to the target
 *   wins) and games_end_math_mayhem 1048-1155 (the winner: +200 iMG, +50
 *   currants, math_mayhem:won, crown_game_winner_you; everyone else:
 *   math_mayhem:lost, crown_game_winner_someone_else and the winner's name;
 *   everyone: button_play_again and button_leave_game).
 * - glitch-client AbstractAvatarView.as 173-245: the score is a disc of the
 *   team's colour, radius 22, a 2 px darker ring, the number in white 22 px
 *   type, over the avatar's head.
 *
 * Where the source stops, the remake chooses (each one is the simplest
 * thing that plays; mayhem.go's header has the same list):
 * - Nothing in the source ends the game when the target is reached
 *   (math_mayhem_set_winner only records the winner; the winner's own end
 *   would cancel it for everyone, global_game.js cancel 735-763). The remake
 *   ends it for everyone at once.
 * - In one touch both players reach the target together; the source records
 *   the second one set, the player who was touched (games_do_math sets
 *   `this`, the mover, then `pc`). The server reads the mover as the one who
 *   moved further in the last tick.
 * - A touch counts once: the two must part before their next sum (the
 *   source's client reported a collision when two avatars met).
 * - A round with nobody at the target ends after MAYHEM_ROUND_MS with no
 *   winner (the source has no clock; its no-winner end shows only the two
 *   buttons, 1089-1149).
 * - The Game Pig stands beside each Race Ticket Dispenser, in multiplayer
 *   only, and offers only Maths (Game of Crowns has its ticket; the colour
 *   game is not in the remake).
 */

export const MAYHEM_ID = 'math_mayhem';
export const MAYHEM_TITLE = 'Math Mayhem';
/** config_prod.js:1282 locations: the Game of Crowns street (js/game-of-crowns.js CROWNS_STREET). */
export const MAYHEM_TEMPLATE = 'LHV2H026E492IAF';
/** config_prod.js:1282 min_players 4, max_players 20. */
export const MAYHEM_PLAYERS = Object.freeze({ min: 4, max: 20 });
/** global_game.js:298 randInt(10, 100). */
export const MAYHEM_TARGET = Object.freeze({ min: 10, max: 100 });
/** inc_games.js 1008-1009 games_math_mayhem_lock(1). */
export const MAYHEM_LOCK_MS = 1_000;
/** shared_instance_manager.js 646-689 startCountdown (as Game of Crowns). */
export const MAYHEM_COUNTDOWN_MS = 4_000;
/** inc_games.js 1077-1078: stats_add_xp(200, false), stats_add_currants(50). */
export const MAYHEM_WIN_REWARD = Object.freeze({ xp: 200, currants: 50 });
/** Ours: a round with no answer at the target ends with no winner. */
export const MAYHEM_ROUND_MS = 5 * 60_000;
/** Ours: players who share a start stand this far apart (the touch reach is under it). */
export const MAYHEM_SPREAD = 72;

/** global_game.js 289-292 and 304-317: blue first, then red. inc_games.js 1157-1170 the colours. */
export const MAYHEM_TEAMS = Object.freeze([
  Object.freeze({ id: 'blue', color: '#0C6AE0' }),
  Object.freeze({ id: 'red', color: '#CC0000' }),
]);

/** Where the game's names and copy come from; GSJS words where there are any. */
export const MAYHEM_TEXT = Object.freeze({
  // test_game_starter.js 3-8, 58-63, 81.
  pigLabel: 'Game Pig',
  pigDesc: 'GAME PIG IS THE BEST. GAME PIG WANTS TO PLAY FUN GAME.',
  pigAsk: 'Which game do you want to play?',
  pigMaths: 'Maths',
  transported: 'You are transported to a mystical land of fun and adventure!',
  // inc_games.js 1226.
  target: (n) => `Target: ${n}`,
  // shared_instance_manager.js 261, 264, 270, 322, 327, 330; inc_games.js 2305.
  mustWait: 'You must wait for more players before this game can begin.',
  leave: 'Leave',
  removed: 'You were removed from the game due to inactivity.',
  // Ours (the rules card the colour game's title picture stood in for).
  rules: Object.freeze([
    'Touch a player to do math with them',
    'Your team adds; the other team subtracts',
    'Hit the target number to win',
  ]),
  headline: 'Make the target number to win',
  joinPrompt: (name, need) => `${name} wants to play ${MAYHEM_TITLE}.${need > 0 ? ` Need ${need} more.` : ''}`,
  join: 'Join',
  decline: 'No thanks',
  offline: 'You are offline, so nobody can play with you.',
  calledOff: 'Not enough players are left, so the game is off.',
  timeUp: 'Nobody made the target in time.',
  youWon: (bits) => `You won Math Mayhem!${bits ? ` ${bits}.` : ''}`,
  theyWon: (name) => `${name} won Math Mayhem.`,
  left: 'You left Math Mayhem.',
  solo: 'Math Mayhem needs other players. Play online to join a game.',
});

/**
 * The end screen (games_end_math_mayhem 1065-1147): vp_overlays, x and y as
 * fractions of the view; the winner's picture 500 wide, the other 330 with
 * the winner's name over it (nuxp_vog_brain, 500 wide), and the two buttons
 * 150 wide at 37% and 63%, 60% down.
 */
export const MAYHEM_END = Object.freeze({
  you: Object.freeze({ key: 'crown_game_winner_you', wh: 500, x: 0.5, y: 0.3 }),
  other: Object.freeze({ key: 'crown_game_winner_someone_else', wh: 330, x: 0.5, y: 0.3 }),
  name: Object.freeze({ width: 500, x: 0.5, y: 0.3 }),
  again: Object.freeze({ key: 'button_play_again', wh: 150, x: 0.37, y: 0.6 }),
  leave: Object.freeze({ key: 'button_leave_game', wh: 150, x: 0.63, y: 0.6 }),
});

/* ------------------------------------------------------------------ */
/* The rules (the server's are the ones that count; these are shared   */
/* with the tests and the data builder)                                */
/* ------------------------------------------------------------------ */

/** initMathMayhemInInstance 304-322: team and first score for each player in turn. */
export function mayhemTeams(ids) {
  const counts = { blue: 0, red: 0 };
  let last = null;
  return (ids || []).map((id) => {
    const team = last === 'blue' ? 'red' : 'blue';
    last = team;
    counts[team] += 1;
    return { id, team, score: counts[team] };
  });
}

/** games_do_math 995-1003: the answer two touching players both get. */
export function mayhemMath(a, b) {
  const x = Math.floor(Number(a?.score) || 0);
  const y = Math.floor(Number(b?.score) || 0);
  return a?.team === b?.team ? x + y : Math.abs(x - y);
}

/** games_show_mayhem_score 1159-1170. */
export function mayhemColor(team) {
  return MAYHEM_TEAMS.find((t) => t.id === team)?.color || '#888888';
}

/** A start spot for the n-th seat: the arena's starts in turn, spread apart past the touch reach. */
export function mayhemSpawn(starts, slot) {
  const list = Array.isArray(starts) && starts.length ? starts : [{ x: 0, y: 0 }];
  const n = Math.max(0, Math.floor(Number(slot) || 0));
  const base = list[n % list.length];
  const ring = Math.floor(n / list.length);
  // 0, +1, -1, +2, -2 ... spreads beside the start.
  const step = ring === 0 ? 0 : (ring % 2 ? 1 : -1) * Math.ceil(ring / 2);
  return { x: Math.round(base.x + step * MAYHEM_SPREAD), y: Math.round(base.y) };
}

/* ------------------------------------------------------------------ */
/* What the server sends, cleaned                                      */
/* ------------------------------------------------------------------ */

export const MAYHEM_STREET_RE = /^MAYHEM_[0-9A-F]{16}$/;
const ROOM_RE = /^[0-9a-f]{16}$/;
/** mayhem.go reward ids: mayhem-<room>-<round>-<player>. */
export const MAYHEM_REWARD_ID_RE = /^mayhem-[0-9a-f]{16}-[0-9]{1,3}-[0-9]{1,12}$/;

function num(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export function mayhemRef(v) {
  const id = Number(v?.id);
  if (!Number.isInteger(id) || id <= 0) return null;
  return { id, name: String(v?.name || 'Someone').slice(0, 64) };
}

/** A mayhem_room message, or null when it is not one this client can play. */
export function normalizeMayhemRoom(msg) {
  if (!msg || !ROOM_RE.test(String(msg.room || '')) || !MAYHEM_STREET_RE.test(String(msg.street || ''))) return null;
  const spawn = Array.isArray(msg.spawn) && msg.spawn.length >= 2 ? { x: num(msg.spawn[0]), y: num(msg.spawn[1]) } : null;
  return {
    room: String(msg.room),
    street: String(msg.street),
    slot: Math.max(0, Math.floor(num(msg.slot))),
    spawn,
    players: normalizeMayhemPlayers(msg.players),
    min: Math.max(2, Math.floor(num(msg.min, MAYHEM_PLAYERS.min))),
    max: Math.max(2, Math.floor(num(msg.max, MAYHEM_PLAYERS.max))),
    autoLeave: Math.max(0, num(msg.autoLeave, 120)),
  };
}

/** Player rows: { id, name, team, score, locked } (team '' before a round). */
export function normalizeMayhemPlayers(list) {
  return (Array.isArray(list) ? list : [])
    .map((p) => {
      const r = mayhemRef(p);
      if (!r) return null;
      const team = p.team === 'red' || p.team === 'blue' ? p.team : '';
      return { ...r, team, score: Math.max(0, Math.floor(num(p.score))), locked: Math.max(0, num(p.locked)) };
    })
    .filter(Boolean)
    .slice(0, 40);
}

/** mayhem_go / mayhem_state / mayhem_bump: the round as it stands. */
export function normalizeMayhemState(msg, at = Date.now()) {
  if (!msg || !ROOM_RE.test(String(msg.room || ''))) return null;
  const target = Math.floor(num(msg.target));
  if (target < MAYHEM_TARGET.min || target > MAYHEM_TARGET.max) return null;
  return {
    room: String(msg.room),
    round: Math.max(1, Math.floor(num(msg.round, 1))),
    target,
    players: normalizeMayhemPlayers(msg.players).map((p) => ({ ...p, lockedUntil: at + p.locked })),
    at,
  };
}

/** Board rows for the HUD, the closest to the target first: { id, name, team, score, off, you }. */
export function mayhemBoard(state, myId) {
  const target = state?.target || 0;
  return (state?.players || [])
    .map((p) => ({ id: p.id, name: p.name, team: p.team, score: p.score, off: Math.abs(target - p.score), you: p.id === myId }))
    .sort((a, b) => a.off - b.off || a.name.localeCompare(b.name));
}

/** What a mayhem_end means for this player. */
export function mayhemOutcome(msg, myId) {
  const w = mayhemRef(msg?.winner);
  const played = msg?.played !== false;
  const why = String(msg?.why || '');
  if (!w) return { outcome: why === 'timeout' ? 'timeout' : 'called_off', won: false, winnerName: '', played, why };
  return { outcome: w.id === myId ? 'won' : 'lost', won: w.id === myId, winnerName: w.name, played, why: 'won' };
}

/** A mayhem_reward, cleaned: { id, xp, currants } or null. */
export function normalizeMayhemReward(msg) {
  const id = String(msg?.id || '');
  if (!MAYHEM_REWARD_ID_RE.test(id)) return null;
  return {
    id,
    room: String(msg.room || ''),
    round: Math.max(1, Math.floor(num(msg.round, 1))),
    xp: Math.max(0, Math.min(MAYHEM_WIN_REWARD.xp, Math.floor(num(msg.xp)))),
    currants: Math.max(0, Math.min(MAYHEM_WIN_REWARD.currants, Math.floor(num(msg.currants)))),
  };
}

/** Where a player stands: you from the engine, others from the realtime roster. */
export function mayhemPos(id, myId, player, roster = []) {
  if (!id) return null;
  if (id === myId) return player ? { x: player.x, y: player.y } : null;
  const p = (roster || []).find((r) => Number(r.id) === id);
  return p && Number.isFinite(Number(p.x)) ? { x: Number(p.x), y: Number(p.y) } : null;
}
