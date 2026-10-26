/**
 * Races between real players (multiplayer phase 4): the pure side of the
 * client. The server is realtime/races.go (its header lists the messages and
 * the GameServerJS rules: race_ticket.js, players/inc_games.js,
 * groups/shared_instance_manager.js, groups/global_game.js); the world side
 * is features/races-feature.js, which keeps solo races exactly as they were.
 *
 * Nothing here touches the DOM, Pixi or the socket: it cleans what the
 * server sends and works out what this player sees and gets.
 */

/** The courses a ticket can race real players on (the server's realtime/data/races.json). */
export const MP_RACE_COURSES = Object.freeze([
  'amazing_race', 'canyon_run', 'crystal_climb', 'grab_em_good', 'lava_leap', 'space_race', 'star_sprint', 'time_warp',
]);

/** Copy players read that the server does not send (GSJS strings where there are any). */
export const MP_RACE_TEXT = Object.freeze({
  accept: 'Accept',
  decline: 'No thanks',
  ok: 'OK',
  // inc_games.js 2443, 2469: the button on a failed challenge or a late accept.
  dagnabit: 'Dagnabit!',
  // shared_instance_manager.js:261 and 264.
  mustWait: 'You must wait for more players before this game can begin.',
  leave: 'Leave',
  leaveGame: 'Leave the Game',
  calledOff: (name) => (name ? `${name} left the game, so it is over.` : 'The game is over.'),
  confirmLeave: (title) => `Leave ${title}? The game ends for everyone.`,
});

const ID_RE = /^[0-9a-f]{16}$/;
const STREET_RE = /^RACE_[0-9A-F]{16}$/;

function num(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function point(v) {
  if (!Array.isArray(v) || v.length < 2) return null;
  const x = Number(v[0]);
  const y = Number(v[1]);
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
}

function ref(v) {
  const id = Number(v?.id);
  if (!Number.isInteger(id) || id <= 0) return null;
  return { id, name: String(v?.name || 'A Glitch').slice(0, 64) };
}

/** A race_match message, cleaned, or null when it is not one this client can run. */
export function normalizeMatch(msg) {
  if (!msg || !ID_RE.test(String(msg.match || '')) || !STREET_RE.test(String(msg.street || ''))) return null;
  const course = String(msg.course || '');
  if (!MP_RACE_COURSES.includes(course)) return null;
  const kind = msg.kind === 'quoins' ? 'quoins' : msg.kind === 'finish' ? 'finish' : '';
  if (!kind) return null;
  const players = (Array.isArray(msg.players) ? msg.players : [])
    .map((p) => {
      const r = ref(p);
      return r ? { ...r, slot: Math.max(0, Math.floor(num(p.slot))) } : null;
    })
    .filter(Boolean);
  if (players.length < 2) return null;
  const quoins = kind === 'quoins' ? (Array.isArray(msg.quoins) ? msg.quoins : []).map(point) : [];
  if (quoins.some((q) => !q)) return null;
  return {
    match: String(msg.match),
    street: String(msg.street),
    course,
    title: String(msg.title || ''),
    game: String(msg.game || ''),
    kind,
    slot: Math.max(0, Math.floor(num(msg.slot))),
    spawn: point(msg.spawn),
    players,
    total: kind === 'quoins' ? quoins.length : 0,
    quoins,
    finish: kind === 'finish' ? point(msg.finish) : null,
    autoLeave: Math.max(0, num(msg.autoLeave, 120)),
  };
}

/** Score rows from race_grabbed / race_end: [{ id, name, score }]. */
export function normalizeScores(rows) {
  return (Array.isArray(rows) ? rows : [])
    .map((r) => {
      const p = ref(r);
      return p ? { ...p, score: Math.max(0, Math.floor(num(r.score))) } : null;
    })
    .filter(Boolean);
}

/**
 * The run's two-sided score (races.js keeps { you, rival }): this player's
 * score and the best of everyone else's, with that racer's name.
 */
export function splitScores(rows, myId) {
  let you = 0;
  let rival = null;
  for (const r of rows) {
    if (r.id === myId) you = r.score;
    else if (!rival || r.score > rival.score) rival = r;
  }
  return { you, rival: rival ? rival.score : 0, rivalName: rival?.name || '' };
}

/** quoin_grab_show_overlays (inc_games.js 1471-1500): "label: score" per racer, then "Remaining: N". */
export function overlayLines(rows, remaining, myId, youLabel = 'You') {
  return [
    ...rows.map((r) => `${r.id === myId ? youLabel : r.name}: ${r.score}`),
    `Remaining: ${Math.max(0, Math.floor(num(remaining)))}`,
  ];
}

/** The other racers' names, joined as inc_games.js pretty_list(names, ' and '). */
export function othersLabel(players, myId) {
  const names = (players || []).filter((p) => p.id !== myId).map((p) => p.name);
  if (names.length <= 1) return names[0] || '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/**
 * A shard for this player from someone else's grab, or 0: quoin.js 117-118
 * max(round(amount * the receiver's multiplier * share), 1).
 */
export function shardAmount(msg, myId, multiplier = 1) {
  const shard = (Array.isArray(msg?.shards) ? msg.shards : []).find((s) => Number(s?.id) === myId);
  if (!shard) return 0;
  const pct = Math.max(0, Math.min(0.5, num(shard.pct)));
  const m = num(multiplier, 1) > 0 ? num(multiplier, 1) : 1;
  return Math.max(Math.round(num(msg.base, 10) * m * pct), 1);
}

/** What a race_end means for this player: 'won', 'lost' (winnerName) or 'called_off'. */
export function endOutcome(msg, myId) {
  const w = ref(msg?.winner);
  if (!w) return { outcome: 'called_off', winnerName: '', leftName: ref(msg?.left)?.name || '' };
  return { outcome: w.id === myId ? 'won' : 'lost', winnerName: w.name, leftName: '' };
}

/** Whether a grab claim may go again: one in flight per quoin, retried after `retryMs`. */
export function mayClaim(q, now, retryMs = 1000) {
  if (!q || !q.live) return false;
  return !q.claimAt || now - q.claimAt >= retryMs;
}
