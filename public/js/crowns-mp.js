/**
 * Game of Crowns between real players (G334): the pure side of the client.
 * The server is groddle-afternoon-server/crowns.go (its header lists the
 * messages and the GameServerJS rules: config_prod.js:1281 it_game,
 * players/inc_games.js games_*_it_game, groups/global_game.js,
 * items/crown_game_lock.js); the world side is the multiplayer branch of
 * features/crowns-feature.js, which keeps the solo game with its stand-ins
 * exactly as it was.
 *
 * Nothing here touches the DOM, Pixi or the socket: it cleans what the
 * server sends and works out what this player sees and gets.
 */

export const CROWNS_MP_STREET_RE = /^CROWNS_[0-9A-F]{16}$/;
const MATCH_RE = /^[0-9a-f]{16}$/;
/** crowns.go reward ids: crowns-<match>-<round>-<player>. */
export const CROWNS_REWARD_ID_RE = /^crowns-[0-9a-f]{16}-[0-9]{1,3}-[0-9]{1,12}$/;

/** Copy the server does not send (GSJS strings where there are any). */
export const CROWNS_MP_TEXT = Object.freeze({
  accept: 'Accept',
  decline: 'No thanks',
  ok: 'OK',
  // inc_games.js 2443, 2469.
  dagnabit: 'Dagnabit!',
  // shared_instance_manager.js:261 and 264.
  mustWait: 'You must wait for more players before this game can begin.',
  leave: 'Leave',
  offline: 'You are offline, so nobody can hear your challenge.',
  alone: 'You need at least one other player here.',
  calledOff: 'Not enough players are left, so the game is off.',
  stole: (to, from) => `${to} stole the crown from ${from}!`,
  has: (name) => `${name} has the crown! Tag them to steal it.`,
});

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

export function crownRef(v) {
  const id = Number(v?.id);
  if (!Number.isInteger(id) || id <= 0) return null;
  return { id, name: String(v?.name || 'A Glitch').slice(0, 64) };
}

/** A crown_match message, cleaned, or null when it is not one this client can play. */
export function normalizeCrownsMatch(msg) {
  if (!msg || !MATCH_RE.test(String(msg.match || '')) || !CROWNS_MP_STREET_RE.test(String(msg.street || ''))) return null;
  const players = (Array.isArray(msg.players) ? msg.players : [])
    .map((p) => {
      const r = crownRef(p);
      return r ? { ...r, slot: Math.max(0, Math.floor(num(p.slot))) } : null;
    })
    .filter(Boolean);
  if (players.length < 2) return null;
  const locks = (Array.isArray(msg.locks) ? msg.locks : []).map(point);
  if (locks.some((l) => !l)) return null;
  return {
    match: String(msg.match),
    street: String(msg.street),
    slot: Math.max(0, Math.floor(num(msg.slot))),
    spawn: point(msg.spawn),
    players,
    playLine: num(msg.playLine, 610),
    locks,
    winMs: Math.max(1000, num(msg.winMs, 60_000)),
    autoLeave: Math.max(0, num(msg.autoLeave, 120)),
  };
}

/** The shared part of crown_go / crown_state / crown_tag / crown_lock. */
export function normalizeCrownsState(msg, at = Date.now()) {
  if (!msg || !MATCH_RE.test(String(msg.match || ''))) return null;
  const scores = (Array.isArray(msg.scores) ? msg.scores : [])
    .map((r) => {
      const p = crownRef(r);
      return p ? { ...p, ms: Math.max(0, Math.floor(num(r.ms))) } : null;
    })
    .filter(Boolean);
  const it = Number(msg.it);
  return {
    match: String(msg.match),
    round: Math.max(1, Math.floor(num(msg.round, 1))),
    it: Number.isInteger(it) && it > 0 ? it : 0,
    lockedUntil: at + Math.max(0, num(msg.locked)),
    clock: msg.clock === true,
    scores,
    locks: (Array.isArray(msg.locks) ? msg.locks : []).map((v) => v === true),
    at,
  };
}

/** A player's crown time now: the holder's clock runs on from the last state while it is running. */
export function crownMsNow(state, id, now = Date.now(), winMs = 60_000) {
  const row = state?.scores?.find((r) => r.id === id);
  if (!row) return 0;
  let ms = row.ms;
  if (state.clock && state.it === id) ms += Math.max(0, now - state.at);
  return Math.min(winMs, ms);
}

/** Board rows for the HUD, most crown time first: { id, name, seconds, it, you }. */
export function crownsMpBoard(state, myId, now = Date.now(), winMs = 60_000) {
  return (state?.scores || [])
    .map((r) => ({ id: r.id, name: r.name, seconds: Math.floor(crownMsNow(state, r.id, now, winMs) / 1000), it: r.id === state.it, you: r.id === myId }))
    .sort((a, b) => b.seconds - a.seconds || a.name.localeCompare(b.name));
}

/** What a crown_end means for this player. */
export function crownsMpOutcome(msg, myId) {
  const w = crownRef(msg?.winner);
  const seconds = Math.max(0, Math.floor(num(msg?.seconds)));
  const played = msg?.played !== false;
  if (!w) return { outcome: 'called_off', won: false, winnerName: '', seconds, played, why: String(msg?.why || '') };
  return { outcome: w.id === myId ? 'won' : 'lost', won: w.id === myId, winnerName: w.name, seconds, played, why: 'won' };
}

/** A crown_reward, cleaned: { id, xp, currants } or null. */
export function normalizeCrownsReward(msg) {
  const id = String(msg?.id || '');
  if (!CROWNS_REWARD_ID_RE.test(id)) return null;
  return {
    id,
    match: String(msg.match || ''),
    round: Math.max(1, Math.floor(num(msg.round, 1))),
    xp: Math.max(0, Math.min(200, Math.floor(num(msg.xp)))),
    currants: Math.max(0, Math.min(50, Math.floor(num(msg.currants)))),
  };
}

/** Where a player stands for the crown sprite: you from the engine, others from the realtime roster. */
export function crownHolderPos(id, myId, player, roster = []) {
  if (!id) return null;
  if (id === myId) return player ? { x: player.x, y: player.y } : null;
  const p = (roster || []).find((r) => Number(r.id) === id);
  return p && Number.isFinite(Number(p.x)) ? { x: Number(p.x), y: Number(p.y) } : null;
}
